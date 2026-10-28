/**
 * Props: small pencil drawings the stage adds (no filters) — the three resonance waves, a folded note, a touch burst,
 * a pencil, a slip of paper, a little book, sleepy z's. Sized in rig units (k = px per unit), each in the pencil that
 * reads on its owner's background (the ledge's `ink`), and drawn with the poses (12 times a second).
 */
import type { Stage } from './engine';
import { clamp, smooth } from './geometry';
import type { Puppet } from './puppet';
import type { Duet } from './types';

export type PropKind = 'waves' | 'note' | 'burst' | 'pencil' | 'paper' | 'book' | 'z';

/** Each drawing's own size (its viewBox): `at` centres it unless told which of its points goes where. */
const SIZE: Record<PropKind, readonly [number, number]> = {
  waves: [100, 44], note: [44, 34], burst: [60, 60], pencil: [12, 56], paper: [40, 30], book: [64, 42], z: [40, 40],
};

/** The pencil's point and the top of its cap, in its drawing. */
export const PENCIL_TIP: readonly [number, number] = [6, 54];
export const PENCIL_LEN = 52;
/** The slip's three written lines, in its drawing: where each starts and ends, and its height (their waves: 1.5 up, then 1.5 down, every 7). */
export const PAPER_LINES: readonly (readonly [number, number, number])[] = [[8, 29, 10], [8, 31, 16], [8, 21, 22]];

const svg = (kind: PropKind, body: string) => {
  const [w, h] = SIZE[kind];
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
};

const DRAWINGS: Record<PropKind, string> = {
  waves: svg('waves', '<g fill="none" stroke="currentColor" stroke-width="5.6" stroke-linecap="round">'
    + [8, 22, 36].map((y, i) => `<path class="w${i}" d="M4 ${y} q12 -9 23 0 t23 0 t23 0 t23 0"/>`).join('') + '</g>'),
  note: svg('note', '<path d="M3 5 L41 3 L40 30 L4 31 Z" fill="oklch(95% 0.025 86)" stroke="currentColor" stroke-width="1.6"/>'
    + '<path d="M3 5 L22 18 L41 3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="22" cy="22" r="3.2" fill="oklch(62% 0.14 45)"/>'),
  burst: svg('burst', '<g stroke="currentColor" stroke-width="3.4" stroke-linecap="round">'
    + '<path d="M30 14 L30 3"/><path d="M42 18 L51 9"/><path d="M18 18 L9 9"/><path d="M46 30 L57 30"/><path d="M14 30 L3 30"/></g>'),
  pencil: svg('pencil', '<path d="M3 8 L9 8 L9 46 L6 54 L3 46 Z" fill="oklch(72% 0.09 70)" stroke="currentColor" stroke-width="1.2"/>'
    + '<path d="M3 46 L9 46 L6 54 Z" fill="oklch(92% 0.03 80)" stroke="currentColor" stroke-width="1"/><rect x="3" y="2" width="6" height="6" fill="oklch(62% 0.14 45)"/>'),
  paper: svg('paper', '<path d="M3 3 L37 2 L38 27 L2 28 Z" fill="oklch(97% 0.015 86)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
    + '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">'
    + ['M8 10 q4 -3 7 0 t7 0 t7 0', 'M8 16 q4 -3 7 0 t7 0 t9 0', 'M8 22 q4 -3 7 0 t6 0']
      .map(d => `<path class="s" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" d="${d}"/>`).join('')
    + '</g>'),
  book: svg('book', '<path d="M2 9 L2 39 C12 36 24 36 32 40 C40 36 52 36 62 39 L62 9 Z" fill="oklch(60% 0.11 45)"/>'
    + '<path d="M32 8 C24 4 12 4 4 7 L4 35 C12 32 24 32 32 36 C40 32 52 32 60 35 L60 7 C52 4 40 4 32 8 Z" fill="oklch(96% 0.02 86)" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
    + '<path d="M32 8 L32 36" stroke="currentColor" stroke-width="1.4"/>'
    + '<path d="M9 14 h17 M9 20 h15 M9 26 h17 M38 14 h17 M38 20 h13 M38 26 h16" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".5"/>'
    + '<path class="pg" d="M32 8 C40 4 52 4 60 7 L60 35 C52 32 40 32 32 36 Z" fill="oklch(93% 0.025 86)" stroke="currentColor" stroke-width="1.6" opacity="0"/>'),
  z: svg('z', '<g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M4 20 L16 20 L4 32 L16 32"/><path d="M22 4 L32 4 L22 14 L32 14"/></g>'),
};

/** Whoever a prop belongs to: a character, or a pair meeting. Its props go when it does. */
export type PropOwner = Puppet | Duet;

export class Prop {
  readonly el: HTMLDivElement;
  private readonly lines: SVGPathElement[];
  private readonly page: SVGPathElement | null;
  private tf: string | null = null;
  private op: string | null = null;
  /** What to draw at the next pose step. */
  private q: { tf?: string; op?: string; lines?: [string, string][]; ink?: number; page?: number } = {};

  constructor(readonly S: Stage, readonly kind: PropKind, readonly owner: PropOwner, inkFrom: Puppet) {
    const el = S.doc.createElement('div');
    el.className = 'ms-prop';
    el.innerHTML = DRAWINGS[kind];
    el.style.color = `var(--ms-ink-${S.inkOf(inkFrom)})`;
    el.style.opacity = '0';
    this.el = el;
    S.root.append(el);
    this.lines = kind === 'waves' ? [...el.querySelectorAll<SVGPathElement>('path')]
      : kind === 'paper' ? [...el.querySelectorAll<SVGPathElement>('path.s')] : [];
    this.page = kind === 'book' ? el.querySelector<SVGPathElement>('path.pg') : null;
  }

  /** Its `anchor` (a point of its drawing; the centre by default) at page (x, y), turned `rot` degrees about it. */
  at(x: number, y: number, k: number, alpha: number, rot = 0, anchor?: readonly [number, number]): void {
    const [w, h] = SIZE[this.kind];
    const [ax, ay] = anchor || [w / 2, h / 2];
    this.q.tf = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${k.toFixed(3)}) translate(${-ax}px,${-ay}px)`;
    this.q.op = clamp(alpha, 0, 1).toFixed(2);
  }

  /** The three lines pulse one after another on each beat. */
  wave(x: number, y: number, k: number, alpha: number, ph: number, span: number): void {
    const s = clamp(span / 85, 0.85, 1.6);
    this.at(x, y, k * s, alpha);
    this.q.lines = this.lines.map((_, i) => {
      const u = clamp(ph * 1.3 - i * 0.15, 0, 1);
      const v = Math.sin(Math.PI * u);
      return [(0.5 + 0.5 * v).toFixed(2), `translate(${(50 * (1 - (0.8 + 0.25 * v))).toFixed(1)}px,0) scale(${(0.8 + 0.25 * v).toFixed(3)},1)`];
    });
  }

  /** The paper's lines appear as they are written. */
  write(u: number): void {
    this.q.ink = u;
  }

  /** The book's page turns over. */
  turn(u: number): void {
    this.q.page = u;
  }

  flush(): void {
    const q = this.q;
    const st = this.el.style;
    if (q.tf != null && q.tf !== this.tf) st.transform = this.tf = q.tf;
    if (q.op != null && q.op !== this.op) st.opacity = this.op = q.op;
    const lines = q.lines;
    if (lines) lines.forEach(([o, t], i) => {
      this.lines[i].style.opacity = o;
      this.lines[i].style.transform = t;
    });
    const ink = q.ink;
    if (ink != null) this.lines.forEach((l, i) => {
      l.style.strokeDashoffset = (1 - clamp(ink * 3 - i, 0, 1)).toFixed(3);
    });
    if (q.page != null && this.page) {
      const u = q.page;
      const on = u > 0 && u < 1;
      this.page.style.opacity = on ? '1' : '0';
      this.page.style.transform = `scale(${(1 - 2 * smooth(u)).toFixed(3)},1)`;
    }
    this.q = {};
  }

  remove(): void {
    this.el.remove();
    this.S.props.delete(this);
  }
}
