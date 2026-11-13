/**
 * The daily check's report, as pure functions: facts in (gathered by daily-check.ts), a short
 * Markdown page out. Its first line is the verdict — `OK` or how many things to look at — so a
 * scheduled task, a person or an issue title can read it alone.
 */
import type { StoreReading } from './stores';

export type CiFact = { status: string; conclusion: string | null; url: string; headSha?: string; createdAt?: string; displayTitle?: string };
export type DeployFact = { url: string; state: string; sha: string | null; createdAt: number };
export type LogLine = { requestPath?: string; responseStatusCode?: number; message?: string; level?: string; timestamp?: number; source?: string };
export type Moderation = { open: number; oldest: string | null };
export type IntegrityFinding = { check: string; count: number };
export type Integrity = { header: string; findings: IntegrityFinding[] };
export type Section<T> = { ok: true; value: T } | { ok: false; error: string };

export type Facts = {
  at: Date;
  ci: Section<CiFact[]>;
  deployment: Section<DeployFact | null>;
  errors: Section<LogLine[]>;
  errorsSince: string;
  stores: StoreReading[];
  /** null: not asked (`--data skip`). */
  data: null | { target: string; moderation: Section<Moderation>; integrity: Section<Integrity> };
  openIssue: Section<{ number: number; url: string } | null> | null;
};

/** `npm run moderation -- list`: one line per open report, starting with its id and ISO time. */
export function parseModeration(text: string): Moderation {
  if (/^No reports\.?\s*$/m.test(text)) return { open: 0, oldest: null };
  const rows = text.split('\n').filter((l) => /^\S+\s{2}\d{4}-\d\d-\d\dT[^\s]+\s{2}\[/.test(l));
  const times = rows.map((l) => l.split(/\s{2}/)[1]).sort();
  return { open: rows.length, oldest: times[0] ?? null };
}

/** `scripts/integrity.ts`: `✓|✗ <check>: <count>` lines after a `<project>: … cards …` header. */
export function parseIntegrity(text: string): Integrity {
  const header = text.split('\n').find((l) => /cards, .* users/.test(l))?.trim() ?? '';
  const findings = text
    .split('\n')
    .map((l) => /^[✓✗] (.+): (\d+)\s*$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ check: m[1], count: Number(m[2]) }));
  return { header, findings };
}

/** Error log lines grouped by what failed (status and path), most frequent first. */
export function groupErrors(lines: LogLine[], top = 5): { key: string; count: number; last: number }[] {
  const groups = new Map<string, { count: number; last: number }>();
  for (const l of lines) {
    const path = (l.requestPath ?? '').replace(/\/[A-Za-z0-9_-]{16,}(?=\/|$)/g, '/:id');
    const key = `${l.responseStatusCode ?? '—'} ${path || (l.message ?? '').slice(0, 60) || '(no path)'}`;
    const g = groups.get(key) ?? { count: 0, last: 0 };
    g.count++;
    g.last = Math.max(g.last, l.timestamp ?? 0);
    groups.set(key, g);
  }
  return [...groups].map(([key, g]) => ({ key, ...g })).sort((a, b) => b.count - a.count).slice(0, top);
}

const short = (sha?: string | null) => (sha ? sha.slice(0, 8) : '—');
const when = (ms: number) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

/** What needs a person, one line each. Empty: the report says OK. */
export function attention(f: Facts): string[] {
  const out: string[] = [];
  if (!f.ci.ok) out.push(`CI: couldn't read (${f.ci.error})`);
  else {
    const last = f.ci.value[0];
    if (!last) out.push('CI: no run on main');
    else if (last.status === 'completed' && last.conclusion !== 'success') out.push(`CI red on main ${short(last.headSha)}: ${last.url}`);
  }
  if (!f.deployment.ok) out.push(`Vercel: couldn't read (${f.deployment.error})`);
  else if (f.deployment.value && f.deployment.value.state !== 'READY') out.push(`Production deployment ${f.deployment.value.state}: ${f.deployment.value.url}`);
  if (!f.errors.ok) out.push(`Vercel logs: couldn't read (${f.errors.error})`);
  else if (f.errors.value.length) out.push(`${f.errors.value.length} production error log line(s) in ${f.errorsSince}`);
  for (const s of f.stores) {
    if ('states' in s) for (const st of s.states) if (/REJECTED|DEVELOPER_ACTION_NEEDED|METADATA_REJECTED|INVALID_BINARY/.test(st.state)) out.push(`${st.store} ${st.platform} ${st.version}: ${st.state}`);
  }
  if (f.data) {
    if (!f.data.moderation.ok) out.push(`Moderation: couldn't read (${f.data.moderation.error})`);
    else if (f.data.moderation.value.open) out.push(`${f.data.moderation.value.open} open report(s) in the moderation queue`);
    if (!f.data.integrity.ok) out.push(`Integrity: couldn't read (${f.data.integrity.error})`);
    else {
      const bad = f.data.integrity.value.findings.filter((x) => x.count > 0);
      if (bad.length) out.push(`Integrity: ${bad.length} check(s) with findings`);
    }
  }
  return out;
}

export function renderReport(f: Facts): string {
  const day = f.at.toISOString().slice(0, 10);
  const todo = attention(f);
  const lines: string[] = [];
  lines.push(`# Resonance daily check ${day}: ${todo.length ? `${todo.length} to look at` : 'OK'}`, '');
  lines.push(`_${f.at.toISOString().replace(/\.\d+Z$/, 'Z')} · read-only: gh, vercel${f.data ? `, ${f.data.target} data` : ''}_`, '');
  if (todo.length) {
    lines.push('## To look at', '', ...todo.map((t) => `- ${t}`), '');
  }

  lines.push('## CI on main', '');
  if (!f.ci.ok) lines.push(`- couldn't read: ${f.ci.error}`);
  else if (!f.ci.value.length) lines.push('- no run');
  else for (const r of f.ci.value) lines.push(`- ${r.conclusion ?? r.status} · ${short(r.headSha)} · ${r.createdAt ?? ''} · ${(r.displayTitle ?? '').slice(0, 70)} — ${r.url}`);
  lines.push('');

  lines.push('## Web (Vercel production)', '');
  if (!f.deployment.ok) lines.push(`- deployment: couldn't read: ${f.deployment.error}`);
  else if (!f.deployment.value) lines.push('- no production deployment');
  else {
    const d = f.deployment.value;
    lines.push(`- latest: ${d.state} · ${short(d.sha)} · ${when(d.createdAt)} · ${d.url}`);
  }
  if (!f.errors.ok) lines.push(`- error logs: couldn't read: ${f.errors.error}`);
  else if (!f.errors.value.length) lines.push(`- error logs, ${f.errorsSince}: none`);
  else {
    lines.push(`- error logs, ${f.errorsSince}: ${f.errors.value.length} line(s); most frequent:`);
    for (const g of groupErrors(f.errors.value)) lines.push(`  - ${g.count}× \`${g.key}\` (last ${when(g.last)})`);
  }
  lines.push('');

  lines.push('## Store review', '');
  for (const s of f.stores) {
    if ('states' in s) {
      if (!s.states.length) lines.push(`- ${s.source}: no versions`);
      for (const st of s.states) lines.push(`- ${st.store} ${st.platform} ${st.version}: ${st.state}`);
    } else lines.push(`- ${s.source}: not read automatically — ${s.unavailable}`);
  }
  lines.push('');

  lines.push('## Data', '');
  if (!f.data) lines.push('- not checked (run with `--data production` on the owner\'s say-so; both scripts only read)');
  else {
    const m = f.data.moderation;
    lines.push(m.ok ? `- moderation queue: ${m.value.open} open${m.value.oldest ? `, oldest ${m.value.oldest}` : ''}` : `- moderation queue: couldn't read: ${m.error}`);
    const i = f.data.integrity;
    if (!i.ok) lines.push(`- integrity: couldn't read: ${i.error}`);
    else {
      const bad = i.value.findings.filter((x) => x.count > 0);
      lines.push(`- integrity: ${i.value.findings.length} checks, ${bad.length} with findings${i.value.header ? ` (${i.value.header})` : ''}`);
      for (const b of bad) lines.push(`  - ${b.count} · ${b.check}`);
    }
  }
  lines.push('');

  if (f.openIssue) {
    lines.push('## Automatic issue', '');
    if (!f.openIssue.ok) lines.push(`- couldn't read: ${f.openIssue.error}`);
    else if (f.openIssue.value) lines.push(`- one is open already: #${f.openIssue.value.number} ${f.openIssue.value.url} — add to it, open no other`);
    else lines.push('- none open');
    lines.push('');
  }
  return lines.join('\n');
}
