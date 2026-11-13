import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENTS_DIR, check, frontmatterModel, withModel } from './agent-models';

const ROOT = resolve(__dirname, '..', '..');
const FIELDS = new Set([
  'name', 'description', 'tools', 'disallowedTools', 'model', 'effort', 'permissionMode', 'maxTurns', 'skills',
  'mcpServers', 'hooks', 'memory', 'background', 'isolation', 'omitClaudeMd',
]);

function frontmatter(file: string) {
  const text = readFileSync(join(AGENTS_DIR, file), 'utf8');
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  expect(fm, `${file} has frontmatter`).not.toBeNull();
  const fields: Record<string, string> = {};
  let last = '';
  for (const line of fm![1].split('\n')) {
    const m = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (m) {
      fields[m[1]] = m[2];
      last = m[1];
    } else if (/^\s+- /.test(line)) fields[last] = `${fields[last]} ${line.trim().slice(2)}`.trim();
  }
  return { text, fields };
}

const agents = readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));

describe('.claude/agents', () => {
  it('has the round agents', () => {
    expect(agents.sort()).toEqual(
      ['critic.md', 'lane-android.md', 'lane-ios.md', 'lane-web.md', 'post-merge-reviewer.md', 'ui-reviewer.md'].sort(),
    );
  });

  it.each(agents)('%s has valid frontmatter', (file) => {
    const { fields } = frontmatter(file);
    expect(fields.name).toBe(file.replace(/\.md$/, ''));
    expect(fields.description.length).toBeGreaterThan(40);
    for (const key of Object.keys(fields)) expect(FIELDS.has(key), `${file}: ${key}`).toBe(true);
    for (const skill of (fields.skills ?? '').split(/\s+/).filter(Boolean)) {
      expect(existsSync(join(ROOT, '.claude/skills', skill, 'SKILL.md')), `${file}: skill ${skill}`).toBe(true);
    }
  });

  it('the reviewers can read, never write', () => {
    for (const file of ['ui-reviewer.md', 'post-merge-reviewer.md']) {
      const tools = frontmatter(file).fields.tools.split(/,\s*/);
      expect(tools).not.toContain('Edit');
      expect(tools).not.toContain('Write');
    }
    expect(frontmatter('ui-reviewer.md').fields.tools).toBe('Read, Grep, Glob');
    expect(frontmatter('ui-reviewer.md').fields.skills).toBe('resonance-ui');
  });

  it('every agent reads what it is pointed at', () => {
    for (const [file, path] of [
      ['lane-web.md', 'docs/agents/lane-brief.md'],
      ['lane-ios.md', 'docs/agents/lane-brief.md'],
      ['lane-android.md', 'docs/agents/lane-brief.md'],
      ['ui-reviewer.md', 'docs/agents/ui-review-examples.md'],
    ]) {
      expect(frontmatter(file).text).toContain(path);
      expect(existsSync(join(ROOT, path)), path).toBe(true);
    }
  });

  it('the models come from one table, and no lane spawns agents of its own', () => {
    expect(check().problems).toEqual([]);
    for (const file of ['lane-web.md', 'lane-ios.md', 'lane-android.md']) {
      expect(frontmatter(file).fields.disallowedTools).toBe('Agent');
    }
  });

  it('writes a model into frontmatter without touching the rest', () => {
    const text = '---\nname: x\ndescription: y\nmodel: opus\n---\n\nbody\n';
    expect(frontmatterModel(withModel(text, 'sonnet'))).toBe('sonnet');
    expect(withModel(text, 'sonnet')).toBe(text.replace('model: opus', 'model: sonnet'));
    expect(frontmatterModel(withModel('---\nname: x\n---\nb', 'haiku'))).toBe('haiku');
  });
});
