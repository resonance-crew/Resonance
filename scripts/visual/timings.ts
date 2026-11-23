/**
 * Where each capture's time goes: every capture writes its steps' durations — its hints unspent, the launch, the
 * wait for its ready signal, the looks (the settle and the second look), the checks — as a line of
 * `<run>/_timings.jsonl`, beside the builds' and the sign-in launches' own lines. At the run's end `_timings.json`
 * gives each device's median per step, the numbers the next change to the harness is weighed by.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writeJson } from './util';

export type TimingKind = 'capture' | 'sign-in' | 'build' | 'flow';
export type Timing = { key: string; kind: TimingKind; totalMs: number; steps: Record<string, number>; at: string };

export const timingsFile = (runDir: string) => join(runDir, '_timings.jsonl');

export type Stopwatch = { lap: (step: string) => void; done: (runDir: string, key: string, kind?: TimingKind) => Timing };

/** A stopwatch for one capture: `lap(step)` ends the step begun at the last lap, `done` writes the line. */
export function stopwatch(now: () => number = Date.now): Stopwatch {
  const start = now();
  let last = start;
  const steps: Record<string, number> = {};
  return {
    lap(step: string) {
      const t = now();
      steps[step] = (steps[step] ?? 0) + (t - last);
      last = t;
    },
    done(runDir: string, key: string, kind: TimingKind = 'capture'): Timing {
      const timing: Timing = { key, kind, totalMs: now() - start, steps: { ...steps }, at: new Date().toISOString() };
      writeTiming(runDir, timing);
      return timing;
    },
  };
}

export function writeTiming(runDir: string, timing: Timing) {
  const file = timingsFile(runDir);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(timing) + '\n');
}

export function readTimings(runDir: string): Timing[] {
  const file = timingsFile(runDir);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Timing];
      } catch {
        return [];
      }
    });
}

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

export type DeviceTimings = { device: string; kind: TimingKind; count: number; medianMs: number; sumMs: number; steps: Record<string, number> };

/** Each `<platform>/<device>`'s captures (and its sign-ins, its builds): how many, the median in all and per step. */
export function summarizeTimings(timings: Timing[]): DeviceTimings[] {
  const by = new Map<string, Timing[]>();
  for (const t of timings) {
    const device = t.kind === 'build' ? t.key : t.key.split('/').slice(0, 2).join('/');
    const id = `${t.kind}|${device}`;
    by.set(id, [...(by.get(id) ?? []), t]);
  }
  return [...by.entries()].map(([id, list]) => {
    const [kind, device] = id.split('|') as [TimingKind, string];
    const names = [...new Set(list.flatMap((t) => Object.keys(t.steps)))];
    return {
      device,
      kind,
      count: list.length,
      medianMs: median(list.map((t) => t.totalMs)),
      sumMs: list.reduce((s, t) => s + t.totalMs, 0),
      steps: Object.fromEntries(names.map((n) => [n, median(list.map((t) => t.steps[n] ?? 0))])),
    };
  });
}

const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** The summary written beside the run, and its lines for the console. */
export function writeTimingsSummary(runDir: string): string[] {
  const summary = summarizeTimings(readTimings(runDir));
  if (!summary.length) return [];
  writeJson(join(runDir, '_timings.json'), summary);
  return summary.map((d) => {
    const steps = Object.entries(d.steps).map(([n, ms]) => `${n} ${s(ms)}`).join(' · ');
    const what = d.kind === 'build' ? `${d.device} ${s(d.medianMs)}` : `${d.device}: ${d.count} ${d.kind === 'sign-in' ? 'sign-ins' : d.kind === 'flow' ? 'flows' : 'captures'}, median ${s(d.medianMs)}`;
    return `Timings ${what}${steps ? `  (${steps})` : ''}`;
  });
}
