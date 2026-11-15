import { storyType } from './script';

/**
 * Which stories are translated into which interface language (round 25 §F):
 * the pure half of lib/ai/translate, so what decides it — and what lists
 * carry of it — never pulls the OpenAI client into a route's imports (a
 * route that can reach it must run in hnd1: lib/ai/regions.test). No Node
 * module here: the clients' translate line asks the same rule.
 */

/** The interface languages a story is translated into. */
export type TranslationTarget = 'en' | 'zh-TW';
export const TRANSLATION_TARGETS: readonly TranslationTarget[] = ['en', 'zh-TW'];

/** The interface language a reader's locale reads in (the clients' translate line and feed cards). */
export const translateTarget = (locale: string): TranslationTarget => (locale === 'en' ? 'en' : 'zh-TW');

/** The longest story the card page offers to translate (characters, as JavaScript counts them). */
export const TRANSLATE_MAX_CHARS = 30_000;

/**
 * The interface languages a story may be translated into, by the script its
 * words are in (storyType): a Chinese story into English, a Latin-script one
 * into 繁體中文, a Japanese or Korean one into either. Nothing for a story in
 * no script we can name (empty, Cyrillic, …) — the script rule can't tell
 * English from French, so a Latin-script story is simply "not Chinese".
 */
export function translationTargets(title: string, story: string): TranslationTarget[] {
  const { lang } = storyType(title, story, 'cjk');
  if (lang === 'zh-TW') return ['en'];
  if (lang === 'en') return ['zh-TW'];
  if (lang === 'ja' || lang === 'ko') return ['en', 'zh-TW'];
  return [];
}

/**
 * Whether no model may be asked for a translation: against the Firebase
 * emulators (the dev stack, the screenshots, the emulator suites), where a
 * card's translations come only from what the seed keeps.
 */
export function modelsOffline(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.FIRESTORE_EMULATOR_HOST;
}

