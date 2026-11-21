import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENTITIES, ENTITY_NAMES, EXPORT_SECTIONS, isQueriedField, purgePlan, SPECS, type EntityName } from './registry';

// CLAUDE.md zero-exception #10 as red lights: a collection the rules or the
// code name that isn't registered, a person field nobody deletes, an entity
// naming a person that the purge doesn't reach — each fails here.

const ROOT = join(__dirname, '..', '..', '..', '..');
const RULES = readFileSync(join(ROOT, 'firebase', 'firestore.rules'), 'utf8');
const registered = new Set<string>(ENTITY_NAMES);

/** A field that names a person (its last segment). */
function personField(field: string): boolean {
  const name = field.split('.').pop()!;
  return (
    /^(uid|userId|userIds|authorId|participants|senderId|ownerId|reporterId|heldFor|withheldFor|blockedUid|from|to)$/.test(name) ||
    /(Uid|UserId|UserIds|AuthorId)$/.test(name)
  );
}

/** What an entity declares about each person field: purged (`uid`), kept, or handled by a step. */
function declared(entity: EntityName): Set<string> {
  const spec = SPECS[entity];
  const last = (f: string) => f.replace(/\[\]$/, '').split('.').pop()!;
  return new Set([...spec.uid.filter(isQueriedField), ...Object.keys(spec.kept ?? {}), ...Object.keys(spec.special ?? {})].map(last));
}

interface RuleBlock {
  name: string;
  parent: string | null;
  fields: Set<string>;
}

/** Every `match /x/{…}` of the rules, with its parent block and the fields its own lines name. */
function ruleBlocks(): RuleBlock[] {
  const blocks: RuleBlock[] = [];
  const stack: { block: RuleBlock | null; depth: number }[] = [];
  let depth = 0;
  for (const raw of RULES.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '');
    const open = /match\s+\/(\w+)\/\{/.exec(line);
    const current = stack.length ? stack[stack.length - 1].block : null;
    if (open) {
      const name = open[1];
      const block = name === 'databases' ? null : { name, parent: stack.map((s) => s.block).filter(Boolean).pop()?.name ?? null, fields: new Set<string>() };
      if (block) blocks.push(block);
      stack.push({ block, depth });
    } else if (current) {
      // Not `get(…).data.x`: that is another document's field.
      for (const m of line.matchAll(/(?<!\)\.)\b(?:data|d)\.(\w+)/g)) current.fields.add(m[1]);
      for (const m of line.matchAll(/"(\w+)"/g)) current.fields.add(m[1]);
    }
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    while (stack.length && depth <= stack[stack.length - 1].depth) stack.pop();
  }
  return blocks;
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(path);
    return /\.(ts|tsx|mts)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const FILES = [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'scripts'))].map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, 'utf8') }));
const CONSTANT = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*'([A-Za-z]+)'/g;
const GLOBAL_CONSTANTS = new Map<string, string>();
for (const { text } of FILES) for (const m of text.matchAll(CONSTANT)) if (!GLOBAL_CONSTANTS.has(m[1])) GLOBAL_CONSTANTS.set(m[1], m[2]);

interface Use {
  file: string;
  name: string;
  /** The person fields a query right after the call filters on. */
  where: string[];
}

/** The collections a path names: its even segments (`users/${uid}/blocks` → users, blocks). */
function collectionsIn(path: string, constants: Map<string, string>): string[] {
  return path.split('/').flatMap((segment, i) => {
    if (i % 2) return [];
    const constant = /^\$\{([A-Z][A-Z0-9_]*)\}$/.exec(segment);
    if (constant) return constants.has(constant[1]) ? [constants.get(constant[1])!] : [`?${constant[1]}`];
    return /^\w+$/.test(segment) ? [segment] : [];
  });
}

/** Every collection the code names: `collection('x')`, `collectionGroup(X)`, `collection(db, 'x')`, `.doc('x/…')`, `doc(db, 'x', …)`. */
function uses(): Use[] {
  const out: Use[] = [];
  for (const { path, text } of FILES) {
    const constants = new Map(GLOBAL_CONSTANTS);
    for (const m of text.matchAll(CONSTANT)) constants.set(m[1], m[2]);
    // The fields of `.where(…)` calls chained right after the call (up to the chain's end: a `,` `;` or `)` outside it).
    const after = (index: number) => {
      let depth = 0;
      let end = index;
      for (; end < text.length && end < index + 600; end++) {
        const c = text[end];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
          if (--depth < 0) break;
        } else if ((c === ',' || c === ';') && depth === 0) break;
      }
      return [...text.slice(index, end).matchAll(/\.where\(\s*['"]([\w.]+)['"]/g)].map((m) => m[1]);
    };
    for (const m of text.matchAll(/\b(collection|collectionGroup)\(\s*(?:[\w.]+\s*,\s*)?(['"`])([^'"`]*)\2/g)) {
      // A query filters the path's last collection (`conversations/${pair}/messages` → messages).
      const names = collectionsIn(m[3], constants);
      names.forEach((name, i) => out.push({ file: path, name, where: i === names.length - 1 ? after(m.index! + m[0].length) : [] }));
    }
    for (const m of text.matchAll(/\b(collection|collectionGroup)\(\s*([A-Z][A-Z0-9_]*)\s*\)/g)) {
      out.push({ file: path, name: constants.get(m[2]) ?? `?${m[2]}`, where: after(m.index! + m[0].length) });
    }
    for (const m of text.matchAll(/\.doc\(\s*(['"`])([^'"`]*\/[^'"`]*)\1/g)) {
      for (const name of collectionsIn(m[2], constants)) out.push({ file: path, name, where: [] });
    }
    for (const m of text.matchAll(/\bdoc\(\s*[\w.]+\s*,\s*['"](\w+)['"]/g)) out.push({ file: path, name: m[1], where: [] });
  }
  return out;
}

describe('the account registry', () => {
  it('registers every collection of firebase/firestore.rules, with its parent', () => {
    const blocks = ruleBlocks();
    expect(blocks.length).toBeGreaterThan(40);
    const missing = blocks.filter((b) => !registered.has(b.name)).map((b) => b.name);
    expect(missing, `firestore.rules matches collections the registry (src/server/domain/schema/registry.ts) lacks`).toEqual([]);
    for (const b of blocks) expect(SPECS[b.name as EntityName].parent ?? null, `${b.name}'s parent`).toBe(b.parent);
  });

  it('registers every collection the server code and the scripts name', () => {
    const found = uses();
    expect(found.length).toBeGreaterThan(100);
    // The scan sees literals, constants (`collection(TAPS)`), template paths and subcollections alike.
    const names = new Set(found.map((u) => u.name));
    for (const name of ['cards', 'resonanceTaps', 'accountDeletions', 'cardTombstones', 'retiredSlugs', 'translations', 'blocks', 'messages', 'config']) {
      expect(names.has(name), name).toBe(true);
    }
    const unknown = found.filter((u) => !registered.has(u.name)).map((u) => `${u.file}: ${u.name}`);
    expect(unknown, 'collections named in src/ or scripts/ that the registry lacks (a new collection that stores a uid joins it: CLAUDE.md #10)').toEqual([]);
  });

  it('names the entities the rules leave to their default deny', () => {
    const inRules = new Set(ruleBlocks().map((b) => b.name));
    // Server-only, written by the Admin SDK alone (lib/push/devices): no client may read or write a device token.
    expect(ENTITY_NAMES.filter((e) => !inRules.has(e))).toEqual(['devices']);
  });

  it('declares every person field its rules or its queries name: purged, kept with a reason, or handled by a step', () => {
    const problems: string[] = [];
    for (const block of ruleBlocks()) {
      const has = declared(block.name as EntityName);
      for (const field of block.fields) if (personField(field) && !has.has(field)) problems.push(`rules: ${block.name}.${field}`);
    }
    for (const use of uses()) {
      if (!registered.has(use.name)) continue;
      const has = declared(use.name as EntityName);
      for (const field of use.where) if (personField(field) && !has.has(field.split('.').pop()!)) problems.push(`${use.file}: ${use.name}.${field}`);
    }
    expect([...new Set(problems)]).toEqual([]);
  });

  it("an entity naming no one says why, and one naming someone doesn't also say it names no one", () => {
    for (const name of ENTITY_NAMES) {
      const spec = SPECS[name];
      if (!spec.uid.length) expect(spec.note, `${name} holds no uid: say so`).toMatch(/holds no uid/);
      else expect(spec.note ?? '', name).not.toMatch(/holds no uid/);
      if (spec.parent) expect(registered.has(spec.parent), `${name}'s parent`).toBe(true);
      for (const [field, why] of Object.entries(spec.kept ?? {})) expect(why.length, `${name}.${field} kept: why`).toBeGreaterThan(10);
    }
  });

  it('the purge plan reaches every entity that names a person, by every person field it declares', () => {
    const plan = purgePlan();
    const trees = new Set(plan.trees.map((q) => q.entity));
    const reachedTrees = new Set<string>([...plan.roots, ...trees]);
    const queried = new Set([...plan.trees, ...plan.rows].map((q) => `${q.entity}.${q.field}`));
    const gaps: string[] = [];
    for (const name of ENTITY_NAMES) {
      const spec = SPECS[name];
      for (const field of spec.uid) {
        if (field === '$id') {
          if (!plan.roots.includes(name) && !plan.last.includes(name)) gaps.push(`${name}.$id`);
        } else if (field === '$parent') {
          if (!spec.parent || !reachedTrees.has(spec.parent)) gaps.push(`${name}.$parent`);
        } else if (spec.special && field in spec.special) {
          if (!plan.steps.get(spec.special[field])?.includes(name)) gaps.push(`${name}.${field} (step)`);
        } else if (spec.purge === 'subtree') {
          if (!spec.parent || !trees.has(spec.parent)) gaps.push(`${name}.${field} (subtree of a tree the purge never finds)`);
        } else if (!queried.has(`${name}.${field.replace(/\[\]$/, '')}`)) gaps.push(`${name}.${field}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it('derives the very queries collectAccountData() made before the registry', () => {
    const plan = purgePlan();
    const q = (list: typeof plan.rows) => list.map((r) => `${r.group ? 'group ' : ''}${r.entity} ${r.field} ${r.op}`).sort();
    expect(plan.roots.slice().sort()).toEqual(
      ['thoughtMaps', 'userProfiles', 'recommendations', 'notificationSettings', 'pickPushes', 'connectionCardPushes', 'users'].sort(),
    );
    expect(q(plan.trees)).toEqual(['cards authorId ==', 'conversations participants array-contains']);
    expect(q(plan.rows)).toEqual(
      [
        'connections userIds array-contains',
        'invites fromUserId ==',
        'invites toUserId ==',
        'resonances userId ==',
        'notes fromUserId ==',
        'notes toUserId ==',
        'notes withheldFor ==',
        'letters from ==',
        'letters to ==',
        'connectionOrigins userIds array-contains',
        'cardLinks sourceAuthorId ==',
        'cardLinks targetAuthorId ==',
        'notifications userId ==',
        'notifications payload.fromUserId ==',
        'quotas userId ==',
        'cardVectors authorId ==',
        'cardSignatures authorId ==',
        'reports reporterId ==',
        'devices userId ==',
        'rateLimits userId ==',
        'handles uid ==',
        'handleHolds heldFor ==',
        'uploads ownerId ==',
        'chatImages senderId ==',
        'chatImages to ==',
        'unsentMessages senderId ==',
        'unsentMessages to ==',
        'privateShares authorId ==',
        'cardReads userId ==',
        'resonanceTaps userId ==',
        'readerSignals userId ==',
        'reportEvidence reporterId ==',
        'reportEvidence targetUserId ==',
        'group edits authorId ==',
        'group draftLog authorId ==',
        'group blocks blockedUid ==',
      ].sort(),
    );
    expect(plan.byCard.map((b) => `${b.entity} ${b.field}`)).toEqual(['resonances cardId', 'notes cardId', 'cardReads cardId', 'resonanceTaps cardId', 'readerSignals cardId']);
    expect(plan.last).toEqual(['accountDeletions']);
    expect([...plan.steps.keys()].sort()).toEqual(
      ['authUser', 'byCard', 'chatPictureFiles', 'holdHandle', 'pages', 'retireCard', 'storagePrefixes', 'tapRows', 'uploadFiles'].sort(),
    );
  });

  it('every export section reads a registered entity that says it feeds that section, and the other way round', () => {
    const keys = new Set(EXPORT_SECTIONS.map((s) => s.key));
    expect(keys.size).toBe(EXPORT_SECTIONS.length);
    for (const s of EXPORT_SECTIONS) expect(SPECS[s.entity].export, s.key).toBe(s.key);
    for (const name of ENTITY_NAMES) {
      const section = SPECS[name].export;
      if (section !== 'none') expect(keys.has(section), `${name} → ${section}`).toBe(true);
    }
  });

  it('counts its entities (46: 37 collections, 9 subcollections)', () => {
    expect(Object.keys(ENTITIES)).toHaveLength(46);
    expect(ENTITY_NAMES.filter((n) => SPECS[n].parent)).toHaveLength(9);
  });
});
