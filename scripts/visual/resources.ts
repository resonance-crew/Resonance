/**
 * What a run costs the machine, sampled every few seconds (`VISUAL_SAMPLE_S`, default 5; 0 turns it off): each part's
 * resident memory and CPU — the dev server, the emulators' Java, Chromium, the AVDs, the simulators, the Mac app, the
 * builds — and the machine's swap, compressed memory and free share, by the phase the run was in. Written beside the
 * captures as `_resources.jsonl` (one sample a line) and `_resources.json` (each phase's peaks), so two runs can be
 * set side by side; the run says each phase's peak as it ends.
 *
 * Parts are told apart by what the process runs (its command line) and whose it is: the run's own processes (this
 * process's descendants: the stack, the browser, the AVDs it booted, the builds, Maestro, agy), the harness's
 * simulators (`Visual iPhone`, `Visual iPad`: launchd_sim's processes under their device folder) and the Mac app it
 * launched (`build/visual-mac/`), and the machine's build daemons, which may be anyone's (said apart, never counted as
 * the run's). Only `ps`, `sysctl` and `vm_stat` are asked: nothing is stopped or changed.
 */
import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { writeJson } from './util';

const exec = promisify(execFile);

export type Proc = { pid: number; ppid: number; rssKb: number; cpu: number; args: string };
export type Group = { rssMb: number; cpu: number; n: number };
export type Sample = {
  /** Seconds since the sampler started. */
  t: number;
  phase: string;
  /** The machine: free share of memory (kern.memorystatus_level), swap used, memory held compressed. */
  freePct: number | null;
  swapMb: number | null;
  compressedMb: number | null;
  load1: number;
  /** The run's own parts (and the machine's build daemons, `machine:` — not the run's). */
  groups: Record<string, Group>;
  /** The run's parts together (every group but `machine:` ones). */
  runMb: number;
};

/** `ps -axww -o pid=,ppid=,rss=,pcpu=,args=` read into processes. */
export function parsePs(text: string): Proc[] {
  const out: Proc[] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/.exec(line);
    if (m) out.push({ pid: +m[1], ppid: +m[2], rssKb: +m[3], cpu: +m[4], args: m[5] });
  }
  return out;
}

/** `sysctl -n vm.swapusage`: "total = 5120.00M  used = 3613.38M  free = …" → the MB used. */
export function parseSwap(text: string): number | null {
  const m = /used\s*=\s*([\d.]+)([MG])/.exec(text);
  return m ? Math.round(+m[1] * (m[2] === 'G' ? 1024 : 1)) : null;
}

/** `vm_stat`: the memory the compressor occupies, in MB. */
export function parseCompressed(text: string): number | null {
  const page = /page size of (\d+) bytes/.exec(text);
  const held = /Pages occupied by compressor:\s+(\d+)/.exec(text);
  return page && held ? Math.round((+held[1] * +page[1]) / 1048576) : null;
}

/** What one of the run's own processes is, by its command line. */
const OWN: [string, RegExp][] = [
  // First: agy's command line carries the whole review prompt, whose words would match the others.
  ['agy', /(^|\/)agy(\s|$)/],
  ['firestore-emulator', /cloud-firestore-emulator|firestore-emulator|java .*firestore/i],
  ['android-emulator', /qemu-system|\/emulator\/emulator|netsimd|\bemulator -avd\b/],
  ['gradle', /gradle|GradleDaemon|KotlinCompileDaemon|kotlin-daemon/i],
  ['xcodebuild', /xcodebuild|swift-frontend|\/swiftc\b|SWBBuildService|XCBBuildService|xcodegen|\bclang\b|\/ld\b|actool|ibtool/],
  ['maestro', /maestro/i],
  ['chromium', /chrom(e|ium)|headless_shell/i],
  ['next', /\bnext\b|next-server|next-router-worker|dev-emulator\.mjs|\.next-visual/],
  ['firebase-cli', /firebase|emulators-at\.mjs/],
];

/** The machine's build daemons, whoever started them (never stopped by a run, said apart). */
const MACHINE: [string, RegExp][] = [
  ['machine:gradle-daemons', /GradleDaemon|KotlinCompileDaemon|kotlin-daemon/],
  ['machine:xcode-build-service', /SWBBuildService|XCBBuildService/],
];

/** A simulator's processes run under its device folder: `/CoreSimulator/Devices/<UDID>/`. */
const SIM_DEVICE = /CoreSimulator\/Devices\/([0-9A-F-]{36})\//;

/**
 * Each part's memory and CPU. `self` is this process (the harness); `simulators` names the harness's own simulators by
 * UDID (the others' are left out: another session's).
 */
export function classify(procs: Proc[], self: number, simulators: Record<string, string> = {}): Record<string, Group> {
  const children = new Map<number, number[]>();
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  for (const p of procs) children.set(p.ppid, [...(children.get(p.ppid) ?? []), p.pid]);
  // The run's own processes, each by what it runs itself, else in its parent's part (next's workers are next's, a
  // compile under xcodebuild the build's); everything under agy is agy's (its MCP servers — one runs Maestro — and its
  // language server), whatever it runs.
  const own = new Map<number, string>([[self, 'harness']]);
  for (const queue = [self]; queue.length; ) {
    const parent = queue.shift()!;
    for (const c of children.get(parent) ?? []) {
      if (own.has(c)) continue;
      const inherited = own.get(parent)!;
      own.set(c, inherited === 'agy' ? 'agy' : (OWN.find(([, re]) => re.test(byPid.get(c)!.args))?.[0] ?? inherited));
      queue.push(c);
    }
  }
  const groups: Record<string, Group> = {};
  const add = (name: string, p: Proc) => {
    const g = (groups[name] ??= { rssMb: 0, cpu: 0, n: 0 });
    g.rssMb += p.rssKb / 1024;
    g.cpu += p.cpu;
    g.n++;
  };
  for (const p of procs) {
    if (own.has(p.pid)) {
      add(own.get(p.pid)!, p);
      continue;
    }
    const udid = SIM_DEVICE.exec(p.args)?.[1];
    if (udid && simulators[udid]) add(`sim:${simulators[udid]}`, p);
    else if (/build\/visual-mac\//.test(p.args)) add('mac-app', p);
    else if (/qemu-system.*(visual-phone|visual-tablet)/.test(p.args)) add('android-emulator', p);
    else {
      const machine = MACHINE.find(([, re]) => re.test(p.args))?.[0];
      if (machine) add(machine, p);
    }
  }
  for (const g of Object.values(groups)) {
    g.rssMb = Math.round(g.rssMb);
    g.cpu = Math.round(g.cpu);
  }
  return groups;
}

export const runMb = (groups: Record<string, Group>) =>
  Object.entries(groups).reduce((sum, [name, g]) => (name.startsWith('machine:') ? sum : sum + g.rssMb), 0);

export type PhaseSummary = {
  phase: string;
  seconds: number;
  /** The run's parts together at their highest, and each part's own highest. */
  peakRunMb: number;
  peakByGroup: Record<string, number>;
  /** Each part's CPU, averaged over the phase (100 = one core). */
  cpuByGroup: Record<string, number>;
  swapMb: { start: number | null; max: number | null; end: number | null };
  minFreePct: number | null;
  maxCompressedMb: number | null;
};

/** Each phase's peaks (and the whole run's, as `all`), from its samples in order. */
export function summarize(samples: Sample[]): PhaseSummary[] {
  const phases = [...new Set(samples.map((s) => s.phase)), 'all'];
  return phases.map((phase) => {
    const here = phase === 'all' ? samples : samples.filter((s) => s.phase === phase);
    const peakByGroup: Record<string, number> = {};
    const cpu: Record<string, number> = {};
    for (const s of here) {
      for (const [name, g] of Object.entries(s.groups)) {
        peakByGroup[name] = Math.max(peakByGroup[name] ?? 0, g.rssMb);
        cpu[name] = (cpu[name] ?? 0) + g.cpu;
      }
    }
    const nums = (pick: (s: Sample) => number | null) => here.map(pick).filter((v): v is number => v != null);
    const swap = nums((s) => s.swapMb);
    const free = nums((s) => s.freePct);
    const compressed = nums((s) => s.compressedMb);
    return {
      phase,
      seconds: here.length ? Math.round(here.at(-1)!.t - here[0].t) : 0,
      peakRunMb: Math.max(0, ...here.map((s) => s.runMb)),
      peakByGroup,
      cpuByGroup: Object.fromEntries(Object.entries(cpu).map(([k, v]) => [k, Math.round(v / here.length)])),
      swapMb: { start: swap[0] ?? null, max: swap.length ? Math.max(...swap) : null, end: swap.at(-1) ?? null },
      minFreePct: free.length ? Math.min(...free) : null,
      maxCompressedMb: compressed.length ? Math.max(...compressed) : null,
    };
  });
}

const gb = (mb: number | null) => (mb == null ? '?' : `${(mb / 1024).toFixed(1)} GB`);

/** One line for a phase: the run's peak and its biggest parts, swap and the free share. */
export function phaseLine(s: PhaseSummary): string {
  const parts = Object.entries(s.peakByGroup)
    .filter(([name]) => !name.startsWith('machine:'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, mb]) => `${name} ${gb(mb)}`)
    .join(', ');
  const machine = Object.entries(s.peakByGroup).filter(([name]) => name.startsWith('machine:'));
  const others = machine.length ? `; machine's build daemons ${machine.map(([n, mb]) => `${n.slice(8)} ${gb(mb)}`).join(', ')}` : '';
  return `Resources (${s.phase}, ${s.seconds} s): the run's peak ${gb(s.peakRunMb)} (${parts || 'nothing yet'})${others} · swap ${gb(s.swapMb.start)} → max ${gb(s.swapMb.max)} · free ≥ ${s.minFreePct ?? '?'} %`;
}

export type Sampler = { mark: (phase: string) => void; stop: () => Promise<PhaseSummary[]> };

async function read(command: string, args: string[]): Promise<string> {
  try {
    return (await exec(command, args, { maxBuffer: 16 << 20, timeout: 10_000 })).stdout;
  } catch {
    return '';
  }
}

/** The harness's simulators by UDID (their names: devices.ts HARNESS_SIMULATORS), asked again now and then. */
async function harnessSimulators(names: readonly string[]): Promise<Record<string, string>> {
  try {
    const listed = JSON.parse(await read('xcrun', ['simctl', 'list', 'devices', '-j'])) as { devices: Record<string, { name: string; udid: string }[]> };
    const out: Record<string, string> = {};
    for (const list of Object.values(listed.devices)) for (const d of list) if (names.includes(d.name)) out[d.udid] = d.name;
    return out;
  } catch {
    return {};
  }
}

/** How often the run is sampled (`VISUAL_SAMPLE_S`, default 5; 0: never). */
export const sampleEveryMs = () => Number(process.env.VISUAL_SAMPLE_S ?? 5) * 1000;

/**
 * Starts sampling into `runDir` (`_resources.jsonl` as it goes, `_resources.json` once stopped), in phase `phase`
 * until [Sampler.mark] names the next; `log` is told each phase's line as it ends.
 */
export function startSampler(runDir: string, { log, simulators = [], everyMs = sampleEveryMs(), phase = 'stack' }: { log: (line: string) => void; simulators?: readonly string[]; everyMs?: number; phase?: string }): Sampler {
  if (!everyMs) return { mark: () => {}, stop: async () => [] };
  const file = join(runDir, '_resources.jsonl');
  mkdirSync(dirname(file), { recursive: true });
  const samples: Sample[] = [];
  const started = Date.now();
  let sims: Record<string, string> = {};
  let current = phase;
  let busy: Promise<void> = Promise.resolve();
  let stopped = false;
  const take = async (count: number, phase: string) => {
    if (count % 12 === 0) sims = await harnessSimulators(simulators);
    const [ps, swap, level, vm] = await Promise.all([
      read('ps', ['-axww', '-o', 'pid=,ppid=,rss=,pcpu=,args=']),
      read('sysctl', ['-n', 'vm.swapusage']),
      read('sysctl', ['-n', 'kern.memorystatus_level']),
      read('vm_stat', []),
    ]);
    const groups = classify(parsePs(ps), process.pid, sims);
    const sample: Sample = {
      t: Math.round((Date.now() - started) / 100) / 10,
      phase,
      freePct: /^\d+$/.test(level.trim()) ? +level.trim() : null,
      swapMb: parseSwap(swap),
      compressedMb: parseCompressed(vm),
      load1: Math.round(loadavg()[0] * 10) / 10,
      groups,
      runMb: runMb(groups),
    };
    samples.push(sample);
    appendFileSync(file, JSON.stringify(sample) + '\n');
  };
  let count = 0;
  // Each sample is of the phase the run was in when it was asked for (a mark changes `current` at once, so two marks
  // close together never give the first phase's name to the second).
  const tick = () => {
    const phase = current;
    busy = busy.then(() => take(count++, phase)).catch(() => {});
  };
  tick();
  const timer = setInterval(tick, everyMs);
  timer.unref();
  const ended = (phase: string) => {
    const s = summarize(samples).find((p) => p.phase === phase);
    if (s && phase !== 'all') log(phaseLine(s));
  };
  return {
    mark(next) {
      if (stopped || next === current) return;
      // The phase that ends gets a last sample of its own.
      tick();
      const was = current;
      current = next;
      busy = busy.then(() => ended(was));
    },
    async stop() {
      if (stopped) return summarize(samples);
      stopped = true;
      clearInterval(timer);
      tick();
      await busy;
      ended(current);
      const summary = summarize(samples);
      writeJson(join(runDir, '_resources.json'), { everyMs, samples: samples.length, phases: summary });
      const all = summary.find((p) => p.phase === 'all');
      if (all) log(phaseLine({ ...all, phase: 'whole run' }));
      return summary;
    },
  };
}
