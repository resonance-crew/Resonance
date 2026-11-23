'use client';

import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { TapPickedBody } from '@/lib/api/v1/schemas';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { PASSAGE_CLASS } from '@/lib/markdown/rehypePassageMarks';
import type { StoryScript } from '@/lib/text/script';
import { StoryPassagesContext, type StoryPassages } from './StoryMarkdown';
import {
  PASSAGE_FACES_MAX,
  PassageFaces,
  marginCentres,
  passageFaceSize,
  passageGroupWidth,
  passagePlacement,
  passageRoom,
  washPieces,
  type PassagePlacement,
  type WashRect,
} from './PassageFaces';
import styles from './PassageMarks.module.css';

// The pop-up of one sentence's people, loaded on its first open (§S4.5).
const PickedPeople = lazy(() => import('./PickedPeople').then((m) => ({ default: m.PickedPeople })));

/** The story on a compact window (story.css's phone numbers): a Latin story's faces are 22 there. */
const COMPACT_QUERY = '(max-width: 640px)';

export interface PassageMarksProps {
  cardId: string;
  /**
   * The author's picked sentences (`CardDetail.tap.picked`) — passed by the author's own published card page alone
   * (§U1); undefined everywhere else, and then the story is drawn as it always was.
   */
  picked: readonly TapPickedBody[] | undefined;
  script: StoryScript;
  /** The element the story is drawn in (the faces' margin and the washes are laid in it). */
  storyRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

interface Measured {
  washes: { id: string; rects: WashRect[] }[];
  /** Each sentence's first line: where its group stands in the margin (§S10). */
  starts: { id: string; y: number; lineBox: number }[];
}

const NOTHING: Measured = { washes: [], starts: [] };

/**
 * The author's own story with the sentences readers picked (round 29 §U2, §S1–§S4): each found sentence on a faint
 * wash, and the faces of who picked it — in the left margin when the white there is ≥ 70 (beside the line where
 * its wash begins: §S10, the owner, 2026-11-22), else in the line right after the sentence. A group, or its sentence's wash, opens that sentence's people (PickedPeople). The washes lie
 * under the story's words (an isolated layer under its blocks: the story's `data-passages`, page.module.css), cut
 * per line from the marks' own boxes, so nothing in the story moves and a link's wave stays over them.
 */
export function PassageMarks({ cardId, picked, script, storyRef, children }: PassageMarksProps) {
  // What the answer says, as one string: a read again that says the same keeps the same marks (no parse again).
  const key = (picked ?? [])
    .map((p) => `${p.id}\u0000${p.text}\u0000${p.more}\u0000${p.people.map((a) => `${a.id}:${a.handle}:${a.avatarUrl ?? ''}`).join(',')}`)
    .join('\u0001');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is what says the answer changed
  const list = useMemo(() => (picked ?? []).filter((p) => p.people.length > 0), [key]);
  const [room, setRoom] = useState<number | null>(null);
  const compact = useMediaQuery(COMPACT_QUERY) === true;
  const placement: PassagePlacement | null = room == null ? null : passagePlacement(room);
  const size = placement ? passageFaceSize({ placement, script, compact, room: room ?? 0 }) : 0;
  const [openId, setOpenId] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [measured, setMeasured] = useState<Measured>(NOTHING);
  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);

  // Which place: the white left of the column, to the window's edge (§S10; the contents rail on the right plays no
  // part). A window crossing the threshold changes place at once.
  const any = list.length > 0;
  // The story's box may not be attached yet: the card page keys it by the translation's swaps (story-{n}), so a swap
  // mounts this anew inside a new box, and a parent's ref is attached after its children's layout effects. Asked
  // again on the next frame then — never left at no room (round 31: picks read before the translation landed were
  // drawn on neither story, the original's box gone and the translation's not measured).
  useLayoutEffect(() => {
    if (!any) {
      setRoom(null);
      return;
    }
    let el: HTMLElement | null = null;
    let frame = 0;
    const measure = () => {
      if (el) setRoom(passageRoom({ columnLeft: el.getBoundingClientRect().left }));
    };
    const attach = () => {
      el = storyRef.current;
      if (el) measure();
      else frame = window.requestAnimationFrame(attach);
    };
    attach();
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [any, storyRef]);

  const open = useCallback((id: string) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpenId(id);
  }, []);

  // The story's marks: memoised by what they say, so the story is parsed again only when they change.
  const passages = useMemo(() => list.map((p) => ({ id: p.id, text: p.text })), [list]);
  const slot = useCallback(
    (id: string) => {
      const p = byId.get(id);
      return p ? <PassageFaces picked={p} size={size} placement="inline" onOpen={open} /> : null;
    },
    [byId, size, open],
  );
  const ctx = useMemo<StoryPassages | null>(
    () => (placement && passages.length ? { passages, inline: placement === 'inline', slot } : null),
    [placement, passages, slot],
  );

  // The washes and the margin's groups, read off the marks' own line boxes after each layout (and again when the
  // story's box changes: a picture arriving, the fonts, the window).
  useLayoutEffect(() => {
    const el = storyRef.current;
    if (!ctx || !el) {
      setMeasured(NOTHING);
      return;
    }
    const measure = () => {
      const base = el.getBoundingClientRect();
      const rects = new Map<string, { left: number; top: number; right: number; bottom: number; lineBox: number }[]>();
      for (const mark of el.querySelectorAll<HTMLElement>(`mark.${PASSAGE_CLASS}[data-passage]`)) {
        const id = mark.dataset.passage!;
        const style = getComputedStyle(mark);
        const lineBox = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6 || 0;
        const into = rects.get(id) ?? [];
        // A sentence in a table that scrolls sideways (`.story-table`, overflow-x: auto) is cut to the table's box:
        // client rects ignore that clip, and the washes' layer is the unclipped story.
        const clip = mark.closest('.story-table')?.getBoundingClientRect() ?? null;
        for (const r of mark.getClientRects()) {
          const left = clip ? Math.max(r.left, clip.left) : r.left;
          const right = clip ? Math.min(r.right, clip.right) : r.right;
          if (right - left <= 0) continue;
          into.push({ left: left - base.left, top: r.top - base.top, right: right - base.left, bottom: r.bottom - base.top, lineBox });
        }
        rects.set(id, into);
      }
      const next: Measured = { washes: [], starts: [] };
      for (const p of list) {
        const rs = rects.get(p.id);
        if (!rs?.length) continue;
        next.washes.push({ id: p.id, rects: washPieces(rs) });
        const first = rs[0];
        next.starts.push({ id: p.id, y: (first.top + first.bottom) / 2, lineBox: first.lineBox });
      }
      setMeasured((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    // A table scrolled sideways moves its words, not the story's box: scroll doesn't bubble, so listen in capture.
    el.addEventListener('scroll', measure, { capture: true, passive: true });
    let live = true;
    void document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
      ro?.disconnect();
      el.removeEventListener('scroll', measure, { capture: true });
    };
  }, [ctx, list, storyRef]);

  // A press on a sentence's wash opens its people too (§S4.1); a link inside it keeps its own press, and a
  // selection being made is not a press.
  useEffect(() => {
    const el = storyRef.current;
    if (!ctx || !el) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest('a, button')) return;
      const mark = target.closest<HTMLElement>(`mark.${PASSAGE_CLASS}[data-passage]`);
      if (!mark || !el.contains(mark)) return;
      const selection = window.getSelection?.();
      if (selection && !selection.isCollapsed && selection.toString().trim()) return;
      open(mark.dataset.passage!);
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [ctx, storyRef, open]);

  const close = () => {
    setOpenId(null);
    opener.current?.focus?.();
  };
  const shown = openId ? byId.get(openId) : undefined;
  const centres = marginCentres(measured.starts);
  return (
    <>
      <StoryPassagesContext.Provider value={ctx}>{children}</StoryPassagesContext.Provider>
      {ctx && measured.washes.length > 0 && (
        <div className={styles.washes} aria-hidden data-passage-washes="">
          {measured.washes.flatMap((w) =>
            w.rects.map((r, i) => (
              <span key={`${w.id}:${i}`} className={styles.wash} style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
            )),
          )}
        </div>
      )}
      {ctx && placement === 'margin' && measured.starts.length > 0 && (
        <div className={styles.margin} data-passage-margin="" style={{ width: passageGroupWidth(PASSAGE_FACES_MAX, size) }}>
          {measured.starts.map((e, i) => {
            const p = byId.get(e.id);
            return p ? <PassageFaces key={e.id} picked={p} size={size} placement="margin" top={centres[i]} onOpen={open} /> : null;
          })}
        </div>
      )}
      {shown && (
        <Suspense fallback={null}>
          <PickedPeople cardId={cardId} passage={shown} script={script} onClose={close} />
        </Suspense>
      )}
    </>
  );
}
