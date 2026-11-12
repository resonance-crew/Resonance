import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No bottom sheets. The owner, round 17 (Resonance-notes/2026-10-27-round17/spec.md §6.2, of the
 * link editor's sheet over the keyboard): 「button sheet 现在不在我们的整个设计里面……应该要做成
 * model」 — what would rise from the foot is the app's own modal dialog (the one its confirmations
 * use), a popover anchored to its control on a wide screen, or a panel in the keyboard's place.
 * This scans the apps' sources for the system's sheets: SwiftUI's `.sheet(isPresented:/item:)` and
 * its detents, UIKit's sheet controller, Compose's and the Views' bottom sheets. Generated code,
 * builds and tests are not scanned, comments don't count, and a function of our own that happens to
 * be called `sheet` (`Self.sheet(kind)`, a menu sheet's shape) isn't the modifier.
 * An exception is named in ALLOWED with why; there is none today.
 */
const root = resolve(__dirname, '../../..');
const IOS = resolve(root, 'apps/ios');
const ANDROID = resolve(root, 'apps/android');

/** file (relative to apps/) → why it may present a system sheet. */
const ALLOWED: Record<string, string> = {};

const SKIP = new Set(['build', '.build', 'DerivedData', 'Generated', 'generated', 'ResonanceTests', 'Tests', 'test', 'androidTest', 'Resonance.xcodeproj']);

function sources(dir: string, ext: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, ext, out);
    else if (name.endsWith(ext)) out.push(path);
  }
  return out;
}

/** The code without its comments (a `//` after `:` is an address, not a comment). Swift and Kotlin alike. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** SwiftUI's sheet modifier: `.sheet(` on a view (after a space, a line break, `)` or `}`), or labelled as the modifier is. */
function swiftSheets(text: string): string[] {
  const bare = code(text);
  const found: string[] = [];
  for (const m of bare.matchAll(/\.sheet\s*\(/g)) {
    const before = bare[m.index - 1] ?? '';
    const after = bare.slice(m.index + m[0].length);
    if (!/[\w>]/.test(before) || /^\s*(?:isPresented|item)\s*:/.test(after)) found.push(m[0]);
  }
  for (const re of [/\bpresentationDetents\b/g, /\bUISheetPresentationController\b/g, /\bsheetPresentationController\b/g]) {
    for (const m of bare.matchAll(re)) found.push(m[0]);
  }
  return found;
}

function kotlinSheets(text: string): string[] {
  return [...code(text).matchAll(/ModalBottomSheet|BottomSheetScaffold|BottomSheetDialog/g)].map((m) => m[0]);
}

function scan(files: string[], find: (text: string) => string[]): Record<string, string[]> {
  return Object.fromEntries(
    files.map((f) => [relative(resolve(root, 'apps'), f), find(readFileSync(f, 'utf8'))] as const).filter(([, hits]) => hits.length > 0),
  );
}

describe('no bottom sheets', () => {
  const swift = sources(IOS, '.swift');
  const kotlin = ['app', 'core'].flatMap((d) => sources(join(ANDROID, d), '.kt'));
  const found = { ...scan(swift, swiftSheets), ...scan(kotlin, kotlinSheets) };

  it('finds both apps', () => {
    expect(swift.length).toBeGreaterThan(100);
    expect(kotlin.length).toBeGreaterThan(100);
  });

  it('presents no system sheet: a modal dialog, a popover or a panel in the keyboard’s place instead', () => {
    const unexpected = Object.entries(found)
      .filter(([f]) => !(f in ALLOWED))
      .map(([f, hits]) => `${f}: ${hits.join(', ')}`);
    expect(unexpected, 'a bottom sheet (the owner, round 17: not in the design — make it a modal)').toEqual([]);
  });

  it('keeps its list of exceptions as short as the code', () => {
    expect(Object.keys(ALLOWED).filter((f) => !found[f]), 'an exception with no sheet left: remove it').toEqual([]);
  });

  it('counts a sheet, not a comment or a function of ours called sheet', () => {
    expect(swiftSheets('Text("a")\n    .sheet(isPresented: $open) { Editor() }')).toHaveLength(1);
    expect(swiftSheets('}.sheet(item: $link) { LinkEditor($0) }')).toHaveLength(1);
    expect(swiftSheets('VStack {}.presentationDetents([.medium])')).toEqual(['presentationDetents']);
    expect(swiftSheets('let sheet = Self.sheet(kind)\nlet s = MacComposerPopover<EmptyView>.sheet(.attach)')).toEqual([]);
    expect(swiftSheets('/// never a bottom sheet: no .sheet(isPresented:)\n// .presentationDetents')).toEqual([]);
    expect(swiftSheets('let url = "https://example.com" // .sheet(isPresented:)')).toEqual([]);
    expect(kotlinSheets('import androidx.compose.material3.ModalBottomSheet\nval s = rememberModalBottomSheetState()')).toHaveLength(2);
    expect(kotlinSheets('/* ModalBottomSheet */ // BottomSheetScaffold\nDialog(onDismissRequest = {}) {}')).toEqual([]);
  });
});
