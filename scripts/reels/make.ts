/**
 * Makes one Instagram reel, ready to post: renders the picture
 * (scripts/promo/render.ts on scripts/reels/page), lays the reel's sound cues
 * and a music bed under it, brings the mix to Instagram's loudness, and writes
 * the MP4 and its cover.
 *
 *   npx tsx scripts/reels/make.ts <likes|kept|write> [--out ../Resonance-marketing/instagram/2026-11-launch]
 *        [--music <file> [--music-from 0]] [--score] [--sfx-dir <dir>] [--voice <file> [--voice-at 0.4]] [--fps 30]
 *
 * Music: `--music` takes any file (an ACE-Step render from
 * ../Resonance-media-tools, say); `--score` uses scripts/promo/score.m4a — its
 * opening under the reel, cross-faded into its close (from 58 s) for the end
 * card — made under the owner's paid ElevenLabs plan, licensed for Resonance's
 * own promotion (THIRD_PARTY_NOTICES). With neither, the reel has its sounds alone.
 *
 * Sounds: <sfx-dir>/<file>.wav (tap, paper-slide, page-flip, chime-resonated, pencil-scribble, whoosh), by
 * default ../Resonance-media-tools/sfx/out — synthesised, so we own them.
 * A cue whose file is missing is skipped with a warning.
 *
 * Needs ffmpeg, and Chrome for the render (as render.ts does). The sticker
 * frames come from scripts/reels/assets.ts, which this runs first.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REELS } from './page/reels';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const get = (name: string) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const id = argv[0];
const reel = REELS[id];
if (!reel) {
  console.error(`Usage: make.ts <${Object.keys(REELS).join('|')}> [options]`);
  process.exit(1);
}
const out = resolve(ROOT, get('out') ?? '../Resonance-marketing/instagram/2026-11-launch');
const fps = get('fps') ?? '30';
const sfxDir = resolve(ROOT, get('sfx-dir') ?? '../Resonance-media-tools/sfx/out');
const music = get('music') ? resolve(get('music')!) : argv.includes('--score') ? join(ROOT, 'scripts/promo/score.m4a') : null;
const voice = get('voice') ? resolve(get('voice')!) : null;

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], cwd: ROOT });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 4).join(' ')}… exited ${r.status}`);
}

const tmp = mkdtempSync(join(tmpdir(), `reel-${id}-`));
try {
  run('npx', ['tsx', 'scripts/reels/assets.ts']);
  run('npx', ['tsx', 'scripts/promo/render.ts', '--page', 'scripts/reels/page', '--size', '1080x1920', '--query', `reel=${id}`, '--name', id, '--locale', 'zh-TW', '--fps', fps, '--out', tmp, '--silent']);
  const picture = join(tmp, `${id}.zh-TW.mp4`);

  // The mix: the music bed, each cue at its moment, the voice — then loudness for Instagram (-14 LUFS, -1.5 dBTP).
  const inputs: string[] = ['-i', picture];
  const parts: string[] = [];
  const labels: string[] = [];
  let n = 1;
  const D = reel.duration;
  if (music && existsSync(music)) {
    inputs.push('-i', music);
    const k = n++;
    if (music.endsWith('score.m4a')) {
      // The score's opening under the reel, cross-faded into its close for the end card.
      const a = reel.endAt + 0.4;
      parts.push(
        `[${k}:a]atrim=0:${a},asetpts=PTS-STARTPTS,afade=t=in:d=0.5[ma]`,
        `[${k}:a]atrim=57.2:${57.2 + (D - reel.endAt) + 0.4},asetpts=PTS-STARTPTS,afade=t=out:st=${D - reel.endAt - 0.8}:d=1.2[mb]`,
        `[ma][mb]acrossfade=d=0.8,volume=-6dB[music]`,
      );
    } else {
      const from = Number(get('music-from') ?? 0);
      parts.push(`[${k}:a]atrim=${from}:${from + D},asetpts=PTS-STARTPTS,afade=t=in:d=0.4,afade=t=out:st=${D - 1.4}:d=1.4,volume=-8dB[music]`);
    }
    labels.push('[music]');
  } else if (music) console.warn(`No music at ${music}`);
  // The kit's file for each cue (../Resonance-media-tools/sfx/make_sfx.py names them).
  const SFX_FILE: Record<string, string> = { tap: 'tap', paper: 'paper-slide', flip: 'page-flip', chime: 'chime-resonated', scribble: 'pencil-scribble', whoosh: 'whoosh' };
  for (const cue of reel.cues) {
    const file = join(sfxDir, `${SFX_FILE[cue.sfx] ?? cue.sfx}.wav`);
    if (!existsSync(file)) {
      console.warn(`No sound for ${cue.sfx} (${file})`);
      continue;
    }
    inputs.push('-i', file);
    const k = n++;
    const ms = Math.round(cue.t * 1000);
    parts.push(`[${k}:a]aresample=48000,volume=${(cue.gain ?? 0) - 4}dB,adelay=${ms}|${ms}[c${k}]`);
    labels.push(`[c${k}]`);
  }
  if (voice && existsSync(voice)) {
    inputs.push('-i', voice);
    const k = n++;
    const ms = Math.round(Number(get('voice-at') ?? 0.4) * 1000);
    parts.push(`[${k}:a]aresample=48000,adelay=${ms}|${ms}[voice]`);
    labels.push('[voice]');
  }
  mkdirSync(out, { recursive: true });
  const mp4 = join(out, `reel-${id}.mp4`);
  if (labels.length) {
    const graph = [...parts, `${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,atrim=0:${D},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[mix]`].join(';');
    run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '0:v', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', mp4]);
  } else {
    run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', picture, '-c', 'copy', '-movflags', '+faststart', mp4]);
  }
  // The cover: a frame that says what the reel is, at full size.
  const cover = join(out, `reel-${id}-cover.jpg`);
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(reel.coverAt), '-i', mp4, '-frames:v', '1', '-q:v', '2', cover]);
  console.log(`${mp4}\n${cover}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
