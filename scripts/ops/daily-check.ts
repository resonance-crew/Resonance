/**
 * The daily check after a release: a short Markdown report of what changed in production
 * overnight, for a person or a scheduled task to read (docs/ops/daily-check.md says how to run it
 * every morning). It only reads:
 *
 *   CI on main                      gh run list --branch main
 *   the production deployment       vercel ls resonance --prod --format json
 *   production error logs           vercel logs --environment production --level error --since <since>
 *   store review states             scripts/ops/stores.ts (by hand until an API key exists)
 *   moderation queue, integrity     npm run moderation -- list, scripts/integrity.ts (with --data)
 *   an open automatic issue         gh issue list --label daily-check --state open
 *
 *   npx tsx scripts/ops/daily-check.ts [--data skip|emulator|production] [--since 24h] [--out <file>]
 *
 * `--data` defaults to skip: production data is read only when asked for by name (both scripts
 * are read-only, and print ids and counts, never anyone's writing). `--out` writes the report to
 * a file as well as printing it. Exit 0 whatever it finds (the report says it); 2 if it can't run.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { adapters, ROOT } from '../release/adapters';
import { parseIntegrity, parseModeration, renderReport, type Facts, type Section } from './report';
import { defaultSources } from './stores';

export const ISSUE_LABEL = 'daily-check';

const errorOf = (e: unknown) =>
  (((e as { stderr?: string }).stderr || (e as Error).message || String(e)).toString().trim().split('\n').filter(Boolean).pop() ?? 'failed').slice(0, 200);

export function section<T>(f: () => T): Section<T> {
  try {
    return { ok: true, value: f() };
  } catch (e) {
    return { ok: false, error: errorOf(e) };
  }
}

function tsx(script: string, args: string[]): string {
  return execFileSync('npx', ['tsx', script, ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000, maxBuffer: 32 * 1024 * 1024 });
}

function flag(args: string[], name: string, fallback?: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

export async function gather(args: string[]): Promise<Facts> {
  const data = flag(args, 'data', 'skip')!;
  if (!['skip', 'emulator', 'production'].includes(data)) throw new Error(`--data is skip, emulator or production, not ${data}`);
  const since = flag(args, 'since', '24h')!;
  const stores = await Promise.all(defaultSources().map((s) => s.read()));
  const dataArgs = data === 'emulator' ? ['--emulator'] : [];
  return {
    at: new Date(),
    ci: section(() => adapters.branchRuns('main', 3)),
    deployment: section(() => adapters.latestProduction()),
    errors: section(() => adapters.productionErrors(since)),
    errorsSince: since,
    stores,
    data:
      data === 'skip'
        ? null
        : {
            target: data,
            moderation: section(() => parseModeration(tsx('scripts/moderation/reports.ts', ['list', ...dataArgs]))),
            integrity: section(() => parseIntegrity(tsx('scripts/integrity.ts', dataArgs))),
          },
    openIssue: section(() => {
      const out = execFileSync('gh', ['issue', 'list', '--label', ISSUE_LABEL, '--state', 'open', '--limit', '1', '--json', 'number,url'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
      return (JSON.parse(out) as { number: number; url: string }[])[0] ?? null;
    }),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const report = renderReport(await gather(args));
  console.log(report);
  const out = flag(args, 'out');
  if (out) {
    const file = resolve(out);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, report + '\n');
    console.error(`Report written to ${file}`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`Daily check could not run: ${(e as Error).message}`);
    process.exit(2);
  });
}
