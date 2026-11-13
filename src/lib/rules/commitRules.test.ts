import { describe, expect, it } from 'vitest';
import { dataProblems, isDataPath, isUiPath, visualProblems, type Commit } from '../../../scripts/ci/commitRules';

const commit = (message: string, ...files: string[]): Commit => ({ sha: 'abcdef1234567890', message, files });

describe('commit rules (CI)', () => {
  it('knows a screen’s code from the rest', () => {
    for (const p of [
      'src/components/atoms/Field/Field.tsx',
      'src/components/atoms/Field/Field.module.css',
      'src/app/[locale]/(app)/home/page.tsx',
      'src/styles/tokens.css',
      'src/messages/zh-TW.json',
      'apps/ios/Resonance/Features/Messages/ThreadScreen.swift',
      'apps/ios/Packages/DesignSystem/Sources/DesignSystem/Components/Chrome.swift',
      'apps/android/app/src/main/kotlin/com/resonance/app/ui/ThreadScreen.kt',
      'apps/android/core/design/src/main/kotlin/com/resonance/design/Chrome.kt',
    ]) expect(isUiPath(p), p).toBe(true);
    for (const p of [
      'src/components/atoms/Field/Field.test.tsx',
      'src/app/api/v1/me/route.ts',
      'src/lib/db/firestore/cards.ts',
      'apps/ios/ResonanceTests/ThreadTests.swift',
      'apps/android/app/src/test/kotlin/com/resonance/app/ui/InviteBandTest.kt',
      'apps/android/core/data/src/main/kotlin/com/resonance/data/Api.kt',
      'scripts/visual/screens.ts',
      'CLAUDE.md',
    ]) expect(isUiPath(p), p).toBe(false);
  });

  it('asks a UI commit for a Visual: line, read anywhere in the message', () => {
    expect(visualProblems([commit('fix: a thing', 'src/components/atoms/Field/Field.tsx')])).toHaveLength(1);
    expect(visualProblems([commit('fix: a thing\n\nVisual: settings: the field is taller\n\nCo-Authored-By: x', 'src/components/a.tsx')])).toEqual([]);
    expect(visualProblems([commit('fix: a thing\n\nVisual: none — a refactor, nothing drawn moves', 'src/components/a.tsx')])).toEqual([]);
    expect(visualProblems([commit('fix: a thing\n\nVisual:', 'src/components/a.tsx')]), 'an empty Visual: says nothing').toHaveLength(1);
    expect(visualProblems([commit('fix: the API', 'src/app/api/v1/me/route.ts', 'src/lib/db/x.ts')])).toEqual([]);
    expect(visualProblems([commit('test: a test', 'src/components/atoms/Field/Field.test.tsx')])).toEqual([]);
  });

  it('asks a range changing the data layer for a test, or for why not', () => {
    expect(isDataPath('src/lib/db/firestore/client/cards.ts')).toBe(true);
    expect(isDataPath('src/lib/data/hooks.ts')).toBe(true);
    expect(isDataPath('src/lib/adapters/card.ts')).toBe(true);
    expect(isDataPath('src/lib/db/firestore/client/cards.test.ts')).toBe(false);
    expect(dataProblems([commit('fix: reads', 'src/lib/db/firestore/client/cards.ts')])).toHaveLength(1);
    expect(dataProblems([commit('fix: reads', 'src/lib/db/firestore/client/cards.ts'), commit('test: reads', 'src/lib/data/hooks.test.ts')])).toEqual([]);
    expect(dataProblems([commit('fix: rules', 'src/lib/db/x.ts', 'test/emulator/rules.emulator.test.ts')])).toEqual([]);
    expect(dataProblems([commit('refactor: rename\n\nTests: none — a rename, no behaviour changes', 'src/lib/db/x.ts')])).toEqual([]);
    expect(dataProblems([commit('refactor: rename\n\nTests: none', 'src/lib/db/x.ts')]), 'none needs a why').toHaveLength(1);
    expect(dataProblems([commit('feat: a page', 'src/components/a.tsx')])).toEqual([]);
  });
});
