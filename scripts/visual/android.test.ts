import { describe, expect, it } from 'vitest';
import en from '../../src/messages/en.json';
import zhTW from '../../src/messages/zh-TW.json';
import { GBOARD_PACKAGE, keysOn, stillLoading } from './android';

// The 2.5.0 release run kept three Android card pages taken before they loaded: a skeleton holds still as long as a
// page does. The app names its skeletons for TalkBack (L10n.Home.moreLoading), and uiautomator's dump shows that name.
describe('stillLoading', () => {
  const node = (attrs: string) => `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="" ${attrs} /></hierarchy>`;

  it('sees the card page’s skeleton in either language', () => {
    expect(stillLoading(node(`content-desc="${zhTW.home.moreLoading}"`))).toBe(true);
    expect(stillLoading(node(`content-desc="${en.home.moreLoading}"`))).toBe(true);
  });

  it('passes a loaded page, and a page whose words merely mention loading', () => {
    expect(stillLoading(node('content-desc="搬家後的第一個安靜夜晚"'))).toBe(false);
    expect(stillLoading(node(`content-desc="${zhTW.home.moreLoading}的故事"`))).toBe(false);
    // No hierarchy (uiautomator couldn't dump): nothing to judge by.
    expect(stillLoading('')).toBe(false);
  });
});

// Run 20261118-235458: both AVDs' first variant showed Google's voice input ("Tap to speak") where card-note-open's keys
// should be — the flows leave voice input as the keyboard while they type, and an AVD can boot with it.
describe('keysOn', () => {
  const VOICE = 'com.google.android.tts/com.google.android.apps.speech.tts.googletts.settings.asr.voiceime.VoiceInputMethodService';
  const GBOARD = `${GBOARD_PACKAGE}/com.android.inputmethod.latin.LatinIME`;
  const device = (listed: string[]) => {
    const commands: string[] = [];
    const run = async (command: string) => (commands.push(command), command === 'ime list -s -a' ? `${listed.join('\n')}\n` : '');
    return { commands, run };
  };

  it('makes Gboard the keyboard, enabled first, whatever was set before', async () => {
    const { commands, run } = device([VOICE, GBOARD, 'dev.mobile.maestro/.MaestroIme']);
    expect(await keysOn(run)).toBe(GBOARD);
    expect(commands).toEqual(['ime list -s -a', `ime enable ${GBOARD}`, `ime set ${GBOARD}`]);
  });

  it('leaves an AVD without Gboard as it is', async () => {
    const { commands, run } = device([VOICE]);
    expect(await keysOn(run)).toBeNull();
    expect(commands).toEqual(['ime list -s -a']);
  });
});
