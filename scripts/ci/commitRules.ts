/**
 * Two rules CI checks on the commits a push or a pull request brings (CLAUDE.md, Verification):
 *
 * - A commit that touches a screen's code — the web's components, pages, styles and strings, the
 *   apps' UI — names the screens it changes in a `Visual:` line (`Visual: card, ios/thread: why`),
 *   or says why none changed (`Visual: none — a refactor, nothing drawn moves`). The release
 *   screenshots read those lines to tell an intended change from a regression (scripts/visual/review.ts
 *   reads them the same way: every `Visual:` line of the message, not only git's trailer block).
 * - A range that changes the data layer — repositories, `client/*` read-write modules, adapters, the
 *   page data hooks — also touches a test, or a commit in it says why not (`Tests: none — why`).
 *
 *   npx tsx scripts/ci/commitRules.ts <base>..<head>     (a base of all zeros, or one not in this
 *                                                         clone, checks <head> alone)
 *
 * Prints one line per problem and exits 1 if there is any.
 */
import { execFileSync } from 'node:child_process';
import { visualLines } from '../visual/review';

export type Commit = { sha: string; message: string; files: string[] };

const isTest = (p: string) =>
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(p) || /(^|\/)(test|tests|Tests|ResonanceTests|androidTest|__tests__)\//.test(p) || /Tests?\.(swift|kt)$/.test(p);

/** Code a screen is drawn from: the web's UI and strings, the apps' UI and design system. */
export function isUiPath(p: string): boolean {
  if (isTest(p)) return false;
  if (/^src\/app\/api\//.test(p)) return false;
  return (
    /^src\/(components|styles|messages)\//.test(p) ||
    /^src\/app\/.+\.(tsx|css)$/.test(p) ||
    /^apps\/ios\/(Resonance|Packages\/DesignSystem)\/.+\.swift$/.test(p) ||
    /^apps\/android\/(app\/src\/main\/.+\/ui|core\/design\/src\/main)\/.+\.kt$/.test(p)
  );
}

/** The data layer: repositories and client modules, adapters, the page data hooks. */
export function isDataPath(p: string): boolean {
  return !isTest(p) && /^src\/lib\/(db|adapters|data)\/.+\.tsx?$/.test(p);
}

export const isTestPath = (p: string) => isTest(p) || /^test\/emulator\//.test(p);

/** A commit touching UI with no `Visual:` line (an empty value counts as none). */
export function visualProblems(commits: Commit[]): string[] {
  return commits
    .filter((c) => c.files.some(isUiPath))
    .filter((c) => !visualLines(`${c.sha}\x1f${c.message}\x1e`).some((l) => l.value.trim().length > 0))
    .map((c) => {
      const ui = c.files.filter(isUiPath);
      return `${c.sha.slice(0, 8)} ${c.message.split('\n')[0]}\n  touches ${ui.slice(0, 3).join(', ')}${ui.length > 3 ? ` (+${ui.length - 3})` : ''} with no \`Visual:\` line — name the screens (\`Visual: card, ios/thread: why\`) or say \`Visual: none — why\``;
    });
}

/** A range changing the data layer with no test touched and no `Tests: none — why` line. */
export function dataProblems(commits: Commit[]): string[] {
  const data = commits.flatMap((c) => c.files.filter(isDataPath));
  if (data.length === 0) return [];
  if (commits.some((c) => c.files.some(isTestPath))) return [];
  if (commits.some((c) => /^Tests:[ \t]*none\s*[—–:-]\s*\S/im.test(c.message))) return [];
  const files = [...new Set(data)];
  return [
    `the data layer changed (${files.slice(0, 3).join(', ')}${files.length > 3 ? ` +${files.length - 3}` : ''}) and no test did — add an integration-style test that fails without the change, or write \`Tests: none — why\` in the commit`,
  ];
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

function exists(rev: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${rev}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** The commits of `base..head` (no merges), or `head` alone when the base is unknown. */
export function readCommits(range: string): Commit[] {
  const [base, head = 'HEAD'] = range.includes('..') ? range.split(/\.\.\.?/) : ['', range];
  const known = base && !/^0+$/.test(base) && exists(base);
  const shas = known ? git('rev-list', '--no-merges', `${base}..${head}`).split('\n').filter(Boolean) : [git('rev-parse', head)];
  return shas.map((sha) => ({
    sha,
    message: git('log', '-1', '--format=%B', sha),
    files: git('show', '--no-renames', '--name-only', '--format=', sha).split('\n').filter(Boolean),
  }));
}

if (process.argv[1] && /commitRules\.ts$/.test(process.argv[1])) {
  const range = process.argv[2];
  if (!range) {
    console.error('usage: tsx scripts/ci/commitRules.ts <base>..<head>');
    process.exit(2);
  }
  const commits = readCommits(range);
  const problems = [...visualProblems(commits), ...dataProblems(commits)];
  for (const p of problems) console.log(`✗ ${p}`);
  console.log(problems.length ? `Commit rules FAIL: ${problems.length} problem(s) in ${commits.length} commit(s)` : `Commit rules PASS: ${commits.length} commit(s)`);
  process.exit(problems.length ? 1 : 0);
}
