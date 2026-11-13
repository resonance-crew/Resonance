/**
 * A round's acceptance list: what the owner asked, item by item, each with the command whose exit code proves it.
 * The shape is docs/agents/acceptance.schema.json; an example is docs/agents/acceptance.example.json.
 *
 *   npm run -s acceptance -- <list.json>                         check the file, print a summary
 *   npm run -s acceptance -- <list.json> --lane ios --all-pass   exit 1 unless every ios item passes
 *   npm run -s acceptance -- <list.json> --against <signed.json> exit 1 if anything but `passes` changed
 *   npm run -s acceptance -- <list.json> --run [--lane ios] [--cwd <dir>] [--write]
 *        run each item's verify command(s) in <dir>, print `<id> <lane> exit=<n>`; with --write (only without
 *        --lane: an item passes when every one of its lanes' commands exits 0) set `passes` from the results
 *
 * The last line is always `Acceptance PASS|FAIL r<round>[ <lane>]: …`; exit 0 on PASS, 1 on FAIL, 2 on a bad file
 * or bad arguments. `/goal` conditions quote that line and the exit code (docs/agents/goal-templates.md).
 *
 * `passes` is the only field an agent may change after the owner signs the list off: the round's workflow keeps
 * the signed copy beside it and checks every later copy against it with --against.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const LANES = ['web', 'ios', 'android', 'server', 'mac'] as const;
export type Lane = (typeof LANES)[number];

export type Item = {
  id: string;
  ask: string;
  lanes: Lane[];
  verify: Partial<Record<Lane, string>>;
  passes: boolean;
  section?: string;
};

export type SignOff = { by: string; words: string; at: string };

export type AcceptanceList = {
  round: number;
  spec: string;
  signedOff: SignOff | null;
  items: Item[];
};

export const ITEM_FIELDS = ['id', 'ask', 'lanes', 'verify', 'passes'] as const;
export const OPTIONAL_ITEM_FIELDS = ['section'] as const;
export const LIST_FIELDS = ['round', 'spec', 'signedOff', 'items'] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** Every problem with the file, as `path: what` lines; empty when it is a valid list. */
export function problems(data: unknown): string[] {
  const out: string[] = [];
  if (!isObject(data)) return ['the list must be a JSON object'];
  for (const key of Object.keys(data)) if (!(LIST_FIELDS as readonly string[]).includes(key)) out.push(`${key}: not a field of the list`);
  if (!Number.isInteger(data.round) || (data.round as number) < 1) out.push('round: a whole number, the round');
  if (!nonEmpty(data.spec)) out.push('spec: the settled spec\'s path');
  else if (/^\/(private\/)?tmp\//.test(data.spec)) out.push('spec: under /tmp, which is not kept — copy the spec into Resonance-notes first');
  if (data.signedOff !== null) {
    if (!isObject(data.signedOff)) out.push('signedOff: null, or { by, words, at }');
    else for (const k of ['by', 'words', 'at'] as const) if (!nonEmpty(data.signedOff[k])) out.push(`signedOff.${k}: missing`);
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    out.push('items: at least one item');
    return out;
  }
  const ids = new Set<string>();
  data.items.forEach((item, i) => {
    const at = `items[${i}]`;
    if (!isObject(item)) {
      out.push(`${at}: an object`);
      return;
    }
    for (const key of Object.keys(item)) {
      if (![...ITEM_FIELDS, ...OPTIONAL_ITEM_FIELDS].includes(key as never)) out.push(`${at}.${key}: not a field of an item`);
    }
    const id = item.id;
    if (typeof id !== 'string' || !/^r\d+-[a-z0-9-]+$/.test(id)) out.push(`${at}.id: like r25-1 or r25-invite-band`);
    else {
      if (Number.isInteger(data.round) && !id.startsWith(`r${data.round}-`)) out.push(`${at}.id: ${id} doesn't start with r${data.round}-`);
      if (ids.has(id)) out.push(`${at}.id: ${id} twice`);
      ids.add(id);
    }
    if (!nonEmpty(item.ask)) out.push(`${at}.ask: the owner's words`);
    if (item.section !== undefined && !nonEmpty(item.section)) out.push(`${at}.section: a non-empty string when present`);
    if (typeof item.passes !== 'boolean') out.push(`${at}.passes: true or false`);
    const lanes = item.lanes;
    if (!Array.isArray(lanes) || lanes.length === 0) out.push(`${at}.lanes: at least one of ${LANES.join(', ')}`);
    else {
      for (const l of lanes) if (!(LANES as readonly string[]).includes(l)) out.push(`${at}.lanes: ${String(l)} is not a lane`);
      if (new Set(lanes).size !== lanes.length) out.push(`${at}.lanes: a lane twice`);
    }
    if (!isObject(item.verify)) out.push(`${at}.verify: { <lane>: <command> } for each of its lanes`);
    else {
      for (const [l, cmd] of Object.entries(item.verify)) {
        if (!Array.isArray(lanes) || !lanes.includes(l)) out.push(`${at}.verify.${l}: not one of the item's lanes`);
        if (!nonEmpty(cmd)) out.push(`${at}.verify.${l}: a command`);
      }
      if (Array.isArray(lanes)) for (const l of lanes) if (!(l in item.verify)) out.push(`${at}.verify.${String(l)}: missing`);
    }
  });
  return out;
}

export function parseList(text: string): { list: AcceptanceList | null; problems: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { list: null, problems: [`not JSON: ${(e as Error).message}`] };
  }
  const p = problems(data);
  return { list: p.length ? null : (data as AcceptanceList), problems: p };
}

/** What changed between the signed copy and now, other than `passes`. Empty when only `passes` moved. */
export function changesBeyondPasses(signed: AcceptanceList, now: AcceptanceList): string[] {
  const out: string[] = [];
  const strip = ({ passes: _passes, ...rest }: Item) => JSON.stringify(rest);
  if (signed.round !== now.round) out.push('round changed');
  if (signed.spec !== now.spec) out.push('spec changed');
  if (JSON.stringify(signed.signedOff) !== JSON.stringify(now.signedOff)) out.push('signedOff changed');
  const before = new Map(signed.items.map((i) => [i.id, i]));
  const after = new Map(now.items.map((i) => [i.id, i]));
  for (const id of before.keys()) if (!after.has(id)) out.push(`${id} removed`);
  for (const [id, item] of after) {
    const old = before.get(id);
    if (!old) out.push(`${id} added`);
    else if (strip(old) !== strip(item)) out.push(`${id} changed beyond passes`);
  }
  if (signed.items.map((i) => i.id).join() !== now.items.map((i) => i.id).join() && out.length === 0) out.push('items reordered');
  return out;
}

export function itemsFor(list: AcceptanceList, lane?: Lane): Item[] {
  return lane ? list.items.filter((i) => i.lanes.includes(lane)) : list.items;
}

export function summaryLine(list: AcceptanceList, lane: Lane | undefined, pass: boolean, extra = ''): string {
  const items = itemsFor(list, lane);
  const passing = items.filter((i) => i.passes).length;
  const open = items.filter((i) => !i.passes).map((i) => i.id);
  const where = lane ? ` ${lane}` : '';
  const tail = open.length ? ` — open: ${open.join(', ')}` : '';
  return `Acceptance ${pass ? 'PASS' : 'FAIL'} r${list.round}${where}: ${passing}/${items.length} passing${tail}${extra}`;
}

export type RunResult = { id: string; lane: Lane; exit: number };

/** Run each item's verify command for `lane` (or every lane) in `cwd` with bash; print one line per command. */
export function runVerify(list: AcceptanceList, opts: { lane?: Lane; cwd: string; log?: (s: string) => void; timeoutMs?: number }): RunResult[] {
  const log = opts.log ?? ((s: string) => console.log(s));
  const results: RunResult[] = [];
  for (const item of itemsFor(list, opts.lane)) {
    for (const l of item.lanes) {
      if (opts.lane && l !== opts.lane) continue;
      const cmd = item.verify[l]!;
      const r = spawnSync('bash', ['-c', cmd], { cwd: opts.cwd, encoding: 'utf8', timeout: opts.timeoutMs ?? 45 * 60_000, maxBuffer: 64 * 1024 * 1024 });
      const exit = r.status ?? 1;
      if (exit !== 0) {
        const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-15).join('\n');
        if (tail) log(tail);
      }
      log(`${item.id} ${l} exit=${exit}`);
      results.push({ id: item.id, lane: l, exit });
    }
  }
  return results;
}

/** `passes` from a full run: true exactly when every lane of the item exited 0. */
export function withRunResults(list: AcceptanceList, results: RunResult[]): AcceptanceList {
  return {
    ...list,
    items: list.items.map((item) => {
      const mine = results.filter((r) => r.id === item.id);
      if (mine.length !== item.lanes.length) return item;
      return { ...item, passes: mine.every((r) => r.exit === 0) };
    }),
  };
}

function main(argv: string[]): number {
  const [file, ...rest] = argv;
  const flag = (name: string) => rest.includes(name);
  const value = (name: string) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (!file || file.startsWith('--')) {
    console.error('usage: acceptance <list.json> [--lane <lane>] [--all-pass] [--against <signed.json>] [--run [--cwd <dir>] [--write]]');
    return 2;
  }
  const lane = value('--lane') as Lane | undefined;
  if (lane && !(LANES as readonly string[]).includes(lane)) {
    console.error(`unknown lane ${lane}`);
    return 2;
  }
  const { list, problems: p } = parseList(readFileSync(file, 'utf8'));
  if (!list) {
    for (const line of p) console.log(`  ${line}`);
    console.log(`Acceptance FAIL ${file}: ${p.length} problem${p.length === 1 ? '' : 's'} in the file`);
    return 2;
  }
  let current = list;
  let pass = true;
  const notes: string[] = [];

  const against = value('--against');
  if (against) {
    const signed = parseList(readFileSync(against, 'utf8'));
    if (!signed.list) {
      console.log(`Acceptance FAIL ${against}: the signed copy is not a valid list`);
      return 2;
    }
    const changes = changesBeyondPasses(signed.list, list);
    for (const c of changes) console.log(`  ${c}`);
    if (changes.length) {
      pass = false;
      notes.push(` — ${changes.length} change${changes.length === 1 ? '' : 's'} beyond passes since sign-off`);
    }
  }

  if (flag('--run')) {
    if (flag('--write') && lane) {
      console.error('--write needs every lane: run it without --lane, on the merged base');
      return 2;
    }
    const results = runVerify(list, { lane, cwd: value('--cwd') ?? process.cwd() });
    if (results.some((r) => r.exit !== 0)) pass = false;
    if (flag('--write')) {
      current = withRunResults(list, results);
      writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
    } else {
      // Show what the run says without writing it.
      const ran = new Set(results.map((r) => r.id));
      current = {
        ...list,
        items: list.items.map((i) => (ran.has(i.id) ? { ...i, passes: results.filter((r) => r.id === i.id).every((r) => r.exit === 0) } : i)),
      };
    }
  }

  if (flag('--all-pass') && itemsFor(current, lane).some((i) => !i.passes)) pass = false;
  console.log(summaryLine(current, lane, pass, notes.join('')));
  return pass ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
