/**
 * An export never enters the repository nor a CI artifact (plan §4.2): it is
 * the whole database. Run in CI (`.github/workflows/ci.yml`), and by
 * `repoCheck.test.ts`:
 *
 *   npx tsx scripts/portability/repoCheck.ts
 *
 * Fails when a tracked file looks like part of an export — a directory
 * `export-…/`, an `entities/<name>/<000001>.ndjson[.zst]` file, an
 * `objects/{public,chat}.ndjson`, a `manifest.json` naming `schemaVersions` —
 * or when a workflow uploads an artifact from a path an export could be in.
 * Prints paths only.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

export const EXPORT_PATH = [/(^|\/)export-[^/]*\//, /(^|\/)entities\/[^/]+\/\d{6}\.ndjson(\.zst)?$/, /(^|\/)objects\/(public|chat)\.ndjson$/];

/** Tracked paths that look like an export's files. */
export function trackedExportFiles(files: readonly string[], read: (path: string) => string): string[] {
  return files.filter((path) => {
    if (EXPORT_PATH.some((re) => re.test(path))) return true;
    if (!/(^|\/)manifest\.json$/.test(path)) return false;
    try {
      return /"schemaVersions"\s*:/.test(read(path));
    } catch {
      return false;
    }
  });
}

/** Workflow steps that upload an artifact whose `path:` could hold an export (anything under tmp, `export-`, `resonance-exports`). */
export function riskyArtifactUploads(workflows: readonly { name: string; text: string }[]): string[] {
  const out: string[] = [];
  for (const { name, text } of workflows) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (!/uses:\s*actions\/upload-artifact/.test(line)) return;
      const block = lines.slice(i, i + 12).join('\n');
      if (/export-|resonance-exports|\$TMPDIR|\/tmp\b|runner\.temp|ndjson|manifest\.json|path:\s*\.\s*$/m.test(block)) out.push(`${name}:${i + 1}`);
    });
  }
  return out;
}

export function checkRepo(root = ROOT): {
  exportFiles: string[];
  uploads: string[];
} {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  const dir = join(root, '.github', 'workflows');
  const workflows = readdirSync(dir)
    .filter((n) => /\.ya?ml$/.test(n))
    .map((n) => ({
      name: `.github/workflows/${n}`,
      text: readFileSync(join(dir, n), 'utf8'),
    }));
  return {
    exportFiles: trackedExportFiles(files, (p) => readFileSync(join(root, p), 'utf8')),
    uploads: riskyArtifactUploads(workflows),
  };
}

if (process.argv[1] && /repoCheck\.ts$/.test(process.argv[1])) {
  const { exportFiles, uploads } = checkRepo();
  for (const path of exportFiles) console.error(`tracked export file: ${path}`);
  for (const at of uploads) console.error(`artifact upload that could carry an export: ${at}`);
  if (exportFiles.length || uploads.length) process.exit(1);
  console.log('No export in the repository, none in a CI artifact');
}
