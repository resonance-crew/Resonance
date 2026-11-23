import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import en from '../../src/messages/en.json';
import zhTW from '../../src/messages/zh-TW.json';
import { GBOARD_PACKAGE, GRADLE_RUN_FLAGS, androidInputs, apartBox, caretBlink, keysOn, stillLoading, textFields } from './android';

describe('the debug APK’s Gradle run leaves nothing resident', () => {
  it('runs without a daemon and compiles Kotlin in that process, the flags kept out of the fingerprint', () => {
    expect(GRADLE_RUN_FLAGS).toEqual(['--no-daemon', '-Pkotlin.compiler.execution.strategy=in-process']);
    for (const flag of GRADLE_RUN_FLAGS) expect(androidInputs().salt).not.toContain(flag);
  });
});

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

// The same run: the tablet's thread-keyboard and dark card-note-open never held still — the focused field's caret blinks
// every 500 ms whatever the animation scales, so two looks matched only when they met it in the same phase.
describe('a caret blinking in a text field', () => {
  const W = 200;
  const H = 120;
  const frame = (paint: (put: (x: number, y: number, rgb: [number, number, number]) => void) => void = () => {}) => {
    const png = new PNG({ width: W, height: H });
    png.data.fill(240);
    const put = (x: number, y: number, [r, g, b]: [number, number, number]) => {
      const i = (y * W + x) * 4;
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, [240, 232, 220]);
    paint(put);
    return PNG.sync.write(png);
  };
  const bar = (x0: number, y0: number, w: number, h: number) => (put: (x: number, y: number, rgb: [number, number, number]) => void) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, [60, 40, 30]);
  };
  const field = { x: 20, y: 30, width: 160, height: 60 };
  const dump = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" class="android.widget.FrameLayout" bounds="[0,0][200,120]"><node index="1" text="" class="android.widget.EditText" focusable="true" focused="true" bounds="[20,30][180,90]" /></node></hierarchy>`;

  it('reads the window’s text fields from the dump', () => {
    expect(textFields(dump)).toEqual([field]);
    expect(textFields('')).toEqual([]);
  });

  it('counts frames apart only by a caret in a field as one, and names the caret’s box for the comparison to skip', () => {
    const on = frame(bar(40, 40, 5, 40));
    const off = frame();
    const box = apartBox(on, off);
    expect(box).toEqual({ x: 40, y: 40, width: 5, height: 40 });
    expect(caretBlink(box, textFields(dump))).toEqual({ x: 36, y: 36, width: 13, height: 48 });
    // Skipped from then on: the same frames are no longer apart.
    expect(apartBox(on, off, [caretBlink(box, textFields(dump))!])).toBeNull();
    expect(apartBox(off, frame())).toBeNull();
  });

  it('never forgives a change bigger than a caret, or one outside every field', () => {
    const wide = apartBox(frame(bar(40, 40, 60, 40)), frame());
    expect(caretBlink(wide, [field])).toBeNull();
    const outside = apartBox(frame(bar(5, 5, 4, 20)), frame());
    expect(outside).toEqual({ x: 5, y: 5, width: 4, height: 20 });
    expect(caretBlink(outside, [field])).toBeNull();
    expect(caretBlink(apartBox(frame(bar(40, 40, 5, 40)), frame()), [])).toBeNull();
    expect(caretBlink(null, [field])).toBeNull();
  });
});
