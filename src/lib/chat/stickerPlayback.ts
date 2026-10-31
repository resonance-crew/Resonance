/**
 * Who of the thread's stickers is moving (round 22 §4.5): a sticker plays its
 * two loops when it first comes on screen — once per message for the page's
 * life — then rests on its key frame; a tap plays it again. At most
 * {@link MAX_PLAYING} move at once: one more starting stops the one that
 * started first (it rests on its key frame), so a screenful of stickers never
 * decodes more than three animations. Leaving the screen stops one too.
 *
 * The animated file is fetched once per sticker and kept as a blob; each play
 * is a fresh object URL of it — an `<img>` restarts an animation only for a
 * new address (the file's loop count is baked in: two plays, then it holds
 * its last frame, which is the key frame).
 */
export const MAX_PLAYING = 3;

interface Playing {
  key: string;
  stop: () => void;
}

export class StickerPlayback {
  private playing: Playing[] = [];
  private seen = new Set<string>();

  constructor(private readonly max = MAX_PLAYING) {}

  /** Whether message `key` comes on screen for the first time this page (then it plays); it is marked seen. */
  firstSight(key: string): boolean {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  /**
   * `key` starts moving; `stop` puts it back on its key frame when it must give way. One of the same key already
   * moving is stopped first (a replay). Answers what ends this play (idempotent; ends nothing once given way).
   */
  start(key: string, stop: () => void): () => void {
    this.end(key);
    while (this.playing.length >= this.max) {
      const oldest = this.playing.shift();
      oldest?.stop();
    }
    const entry: Playing = { key, stop };
    this.playing.push(entry);
    return () => {
      const at = this.playing.indexOf(entry);
      if (at >= 0) this.playing.splice(at, 1);
    };
  }

  /** Stops `key` if it is moving. */
  end(key: string): void {
    const at = this.playing.findIndex((p) => p.key === key);
    if (at < 0) return;
    const [entry] = this.playing.splice(at, 1);
    entry.stop();
  }

  /** The keys moving now, the first started first. */
  get moving(): string[] {
    return this.playing.map((p) => p.key);
  }
}

/** The page's one. */
export const stickerPlayback = new StickerPlayback();

const blobs = new Map<string, Promise<Blob>>();

/** The animated file at `url`, fetched once for the page's life (a failure is forgotten, to be asked again). */
export function stickerBlob(url: string): Promise<Blob> {
  let blob = blobs.get(url);
  if (!blob) {
    blob = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`sticker ${r.status}`);
      return r.blob();
    });
    blob.catch(() => blobs.delete(url));
    blobs.set(url, blob);
  }
  return blob;
}

/** Whether the reader asked for less motion: then a sticker shows its key frame only. */
export function prefersStill(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const artTops = new Map<string, number>();

/**
 * How far down its square a sticker's drawing starts (a fraction of its height: the transparent room above the
 * puppet, which differs from one sticker to the next) — read once per picture from its loaded key frame, on a
 * small canvas. A sticker answering a quote comes up over the quote by its drawing, not by its square
 * (round 22, the owner's). 0 when it can't be read.
 */
export function artTopOf(img: HTMLImageElement): number {
  const key = img.currentSrc || img.src;
  const known = artTops.get(key);
  if (known != null) return known;
  let top = 0;
  try {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx && img.naturalWidth) {
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      let row = 0;
      search: for (; row < size; row++) {
        for (let x = 0; x < size; x++) if (data[(row * size + x) * 4 + 3] > 24) break search;
      }
      top = row < size ? row / size : 0;
    }
  } catch {
    top = 0;
  }
  artTops.set(key, top);
  return top;
}
