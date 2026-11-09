// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@/../test/render';
import { mockElementSize } from '@/../test/organic';
import { boundaryPoints, polyline } from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { segmentCapsuleShape } from '@/components/molecules/SegmentedActionBar/segmentCapsule';
import { autoSegments } from '@/lib/design/wobAuto';
import { INK } from '@/lib/design/strokes';
import { BLOCK_TURN_R, CAPSULE_H, ComposerCapsule, SEND_SEGMENT_W, blockCapsuleShape, capsuleShape } from './ComposerCapsule';
import { FloatingSlip, floatingPath } from './FloatingSlip';

// The capsule and the slip measure themselves before they draw.
mockElementSize(320, 48);

const css = readFileSync(join(process.cwd(), 'src/components/sections/MessagesPage/Thread.module.css'), 'utf8');
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Every block of the selector's own (one shared with another selector too), in order.
  return [...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n');
};

function capsule(props: Partial<Parameters<typeof ComposerCapsule>[0]> = {}) {
  return (
    <ComposerCapsule focused={false} ready={false} sendLabel="Send" onSend={() => {}} {...props}>
      <textarea aria-label="Message" />
    </ComposerCapsule>
  );
}

describe('the composer capsule (round 9 §4)', () => {
  // One shape: the field's outline, the send segment past a wavy seam — the segmented bar's seam, one point list
  // for the face's edge and the stroke.
  it('cuts Send off the field as its end segment, on the segmented bar’s seam', () => {
    const shape = capsuleShape(320, 48)!;
    const seam = polyline(boundaryPoints(320 - SEND_SEGMENT_W, 48, 34, 1.6, Math.max(12, 48 * 0.3)));
    expect(shape.seam).toBe(seam);
    expect(shape.segment.startsWith(seam)).toBe(true);
    expect(shape.outline).toBe(floatingPath(320, 48, 16, 23));
    expect(capsuleShape(0, 48)).toBeNull();
  });

  // Round 22 (the owner's notes): from the second line Send is a 52 × 48 block on the last row, its seam turning
  // round — a quarter circle of 16 — from its left side to its top, the segment's edge under the seam.
  it('turns the send block’s seam round at its top-left corner', () => {
    const w = 320;
    const h = 96;
    const shape = blockCapsuleShape(w, h)!;
    const x = w - SEND_SEGMENT_W;
    const y = h - CAPSULE_H;
    const f = (n: number) => +n.toFixed(2);
    expect(BLOCK_TURN_R).toBe(16);
    const at = (deg: number) => {
      const a = (deg * Math.PI) / 180;
      return `${f(x + 16 + 16 * Math.cos(a))},${f(y + 16 + 16 * Math.sin(a))}`;
    };
    for (const deg of [180, 195, 210, 225, 240, 255, 270]) expect(shape.seam).toContain(at(deg));
    expect(shape.segment.startsWith(shape.seam)).toBe(true);
    expect(shape.outline).toBe(capsuleShape(w, h)!.outline);
  });

  // Round 10 §3.1–3.2, round 11 §3: no paper halo round the pen; the foot's paper behind the whole foot keeps the
  // thread from showing round it — a 12 fade from the thread into it, starting on the foot's top edge (the
  // capsule's, whatever rides inside it: round 23), solid from there to the screen's edge — and nothing of it is a
  // shadow or see-through.
  it('draws no halo round its pen, and lays the foot’s paper behind it with a 12 fade from its top edge', () => {
    const { container } = render(capsule());
    const paths = Array.from(container.querySelectorAll('svg path'));
    const pen = paths.find((p) => p.getAttribute('class')?.includes('capsulePen'))!;
    expect(Number(pen.getAttribute('stroke-width'))).toBe(INK);
    // Nothing stroked wider than the pen: no ring round it.
    for (const p of paths) expect(Number(p.getAttribute('stroke-width') ?? 0)).toBeLessThanOrEqual(INK);
    expect(css).not.toMatch(/paperHalo/);

    expect(rule('.dock::before')).toMatch(/top:\s*0;[\s\S]*height:\s*12px/);
    expect(rule('.dock::before')).toMatch(/linear-gradient\(to bottom, transparent, var\(--color-cream\)\)/);
    expect(rule('.dock::after')).toMatch(/top:\s*12px;[\s\S]*bottom:\s*0;[\s\S]*background:\s*var\(--color-cream\)/);
    // The fade lets taps through to the thread; the solid paper takes them.
    expect(rule('.dock::after')).toMatch(/pointer-events:\s*auto/);
    // Round 23 (the owner's: 「不用做這個漸層」): nothing rides over the capsule any more, so the foot keeps no room
    // and no paper of its own for rows over it — none of the rules that made them is left.
    expect(css).not.toMatch(/:has\(>?\s*\.carry\)/);
    expect(css).not.toMatch(/\.carry\s*\{/);
    expect(rule('.dock')).toMatch(/padding:\s*0 14px calc\(8px \+ env\(safe-area-inset-bottom, 0px\)\)/);
    // Not a shadow: a floating thing stays opaque in every state.
    for (const sel of ['.capsule', '.send', '.slip', '.dock', '.paperFill', '.sendFace', '.carryRow', '.riding', '.carryStrip']) {
      expect(rule(sel)).not.toMatch(/opacity|box-shadow|drop-shadow/);
    }
    expect(css).not.toMatch(/\.send\[aria-disabled[^{]*\{[^}]*opacity/);
  });

  it('says there is nothing to send by its semantics, and wears the verb’s face once there is', () => {
    const onSend = vi.fn();
    const { container, rerender } = render(capsule({ onSend }));
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(container.firstElementChild).not.toHaveAttribute('data-ready');
    fireEvent.click(send);
    expect(onSend).not.toHaveBeenCalled();
    // At rest the segment is the tonal face; with something to send, the solid one, in 140 ms.
    expect(rule('.sendFace')).toMatch(/fill:\s*var\(--button-tonal\)/);
    expect(rule('.capsule[data-ready] .sendFace')).toMatch(/fill:\s*var\(--button-fill\)/);
    expect(rule('.sendFace')).toMatch(/transition:\s*fill 140ms/);

    rerender(capsule({ onSend, ready: true }));
    expect(send).not.toHaveAttribute('aria-disabled');
    expect(container.firstElementChild).toHaveAttribute('data-ready');
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  // Round 22 (the owner's third notes): the panel in the keyboard's place reaches the screen's edge — no band of
  // the foot's paper under it; the grid scrolls down to the edge, the last row clear of the home indicator — and
  // the capsule rides its one height animation, ↑ / ↓ turning on the way.
  it('lets the sticker panel reach the screen’s edge, and turns ↑ / ↓ with its animation', () => {
    expect(rule('.dock:has(> .stickerPanel)')).toMatch(/padding-bottom:\s*0/);
    expect(rule('.stickerPanel .stickerGrid')).toMatch(/padding-bottom:\s*calc\(12px \+ env\(safe-area-inset-bottom, 0px\)\)/);
    expect(rule('.stickerPanel')).toMatch(/transition:\s*height 220ms/);
    expect(rule('.sendGlyph')).toMatch(/transition:\s*transform 220ms/);
    expect(rule('.sendGlyph[data-turned]')).toMatch(/transform:\s*rotate\(180deg\)/);
  });

  // Round 10 §3.3: written in, its pen darkens — the field's own darker ink — and never turns terracotta.
  it('darkens its pen while written in, without changing its colour', () => {
    const { container, rerender } = render(capsule());
    expect(container.firstElementChild).not.toHaveAttribute('data-focus');
    rerender(capsule({ focused: true }));
    expect(container.firstElementChild).toHaveAttribute('data-focus');
    expect(rule('.capsule[data-focus] .capsulePen')).toMatch(/stroke:\s*var\(--field-border-hover\)/);
    expect(rule('.capsule[data-focus] .capsulePen')).not.toMatch(/focus|terracotta/);
  });

  // Telegram's: the field doesn't grow from a larger font — one line sits centred in 48 by padding worked out from
  // its own line height; only more lines grow it, up to five; the ＋ and the segment never scale.
  it('keeps one line exactly 48 tall whatever its line height, growing only by lines, to five', () => {
    expect(CAPSULE_H).toBe(48);
    // The room above and below the line is the text box's own padding (round 22): scrolled, its lines run to the
    // capsule's pen line, and five lines and that room are the box's whole height.
    expect(rule('.capsule textarea.composerInput')).toMatch(/padding-block:\s*calc\(\(48px - 1lh\) \/ 2\)/);
    expect(rule('.composerField')).toMatch(/padding:\s*0 10px 0 0/);
    expect(rule('.composerField')).toMatch(/font-size:\s*16px/);
    expect(rule('.capsule textarea.composerInput')).toMatch(/max-height:\s*calc\(4lh \+ 48px\)/);
    expect(rule('.plusSlot')).toMatch(/width:\s*44px;[\s\S]*height:\s*48px/);
    expect(rule('.send')).toMatch(/width:\s*52px/);
    // From the second line Send is the block on the last row: the column keeps it at its foot, under ⤢ or nothing.
    expect(rule('.sendColumn')).toMatch(/justify-content:\s*flex-end/);
    // ⤢ / ⤡ stand in the send column at the text's top — the capsule's top-right, or just under what rides along
    // (round 23): the column is the text line's, never beside a row's ✕.
    expect(rule('.aboveSend')).toMatch(/align-items:\s*flex-start/);
    expect(rule('.aboveSend')).toMatch(/justify-content:\s*center/);
    expect(rule('.aboveSend')).not.toMatch(/padding/);
    // A ghost button, no fill and no outline at rest — and the capsule's tools one size (the owner's third notes):
    // ⤢, the ☺ / ⌨ and the ＋ all 44 × 48.
    expect(rule('.growTool')).toMatch(/width:\s*44px;[\s\S]*height:\s*48px/);
    expect(rule('.stickerTool button')).toMatch(/width:\s*44px;[\s\S]*height:\s*48px/);
    expect(rule('.toolsSlot')).toMatch(/width:\s*44px/);
    expect(rule('.toolsSlot')).not.toMatch(/margin/);
    expect(rule('.plusSlot [data-icon=\'plus\']')).toMatch(/width:\s*44px;[\s\S]*height:\s*48px/);
    expect(rule('.growTool')).toMatch(/border:\s*none;[\s\S]*background:\s*none/);
    expect(rule('.growWash')).toMatch(/opacity:\s*0/);
    expect(rule('.capsule[data-block] .send')).toMatch(/flex:\s*none;[\s\S]*height:\s*48px/);
    // The plane sits on the last line's row, beside the ＋, not in the middle of a tall field.
    expect(rule('.sendGlyph')).toMatch(/bottom:\s*0/);
    expect(rule('.sendGlyph')).toMatch(/height:\s*48px/);
  });
});

// Round 23 (the owner's: 「回覆的訊息會在這個整個訊息框的 border 以內」, Telegram's way): what rides the next message
// lies inside the capsule over the text's line, the capsule's three columns running through its rows.
describe('what rides inside the capsule (round 23)', () => {
  it('lays the rows inside the outline over the text’s line, Send the block whenever anything rides', () => {
    const { container, rerender } = render(capsule());
    const root = container.firstElementChild as HTMLElement;
    expect(screen.queryByRole('group')).toBeNull();
    expect(root).not.toHaveAttribute('data-block');

    rerender(capsule({ riding: <span>Replying to bob</span>, ridingLabel: 'Sent with your message' }));
    const group = screen.getByRole('group', { name: 'Sent with your message' });
    // Inside the capsule, before the text's line (the ＋, the field and the send column).
    expect(root).toContainElement(group);
    const line = root.querySelector('[class*="fieldLine"]')!;
    expect(group.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line).toContainElement(screen.getByRole('textbox', { name: 'Message' }));
    expect(line).toContainElement(screen.getByRole('button', { name: 'Send' }));
    // One line, something riding: Send is already the 52 × 48 block on the last row.
    expect(root).toHaveAttribute('data-block');
    expect(root).toHaveAttribute('data-riding');
  });

  it('pins the rows’ numbers: 6 under the pen, 44 a row, the mark in the ＋’s 44, the ✕ in Send’s 52, pictures 8 + 56 + 8', () => {
    expect(rule('.capsule')).toMatch(/flex-direction:\s*column/);
    expect(rule('.fieldLine')).toMatch(/align-items:\s*flex-end;[\s\S]*min-height:\s*48px/);
    expect(rule('.riding')).toMatch(/padding-top:\s*6px/);
    expect(rule('.riding')).not.toMatch(/gap|border|margin/);
    expect(rule('.carryRow')).toMatch(/min-height:\s*44px/);
    expect(rule('.carryRow')).not.toMatch(/padding|margin|gap/);
    expect(rule('.carryMark')).toMatch(/width:\s*44px/);
    expect(rule('.plusSlot')).toMatch(/width:\s*44px/);
    expect(rule('.carryRule')).toMatch(/width:\s*6px;[\s\S]*height:\s*28px/);
    // The reply's rule is drawn over all of its box (CarryRule).
    expect(rule('.carryRule svg')).toMatch(/width:\s*100%;[\s\S]*height:\s*100%/);
    expect(rule('.carryTile')).toMatch(/width:\s*32px;[\s\S]*height:\s*32px/);
    expect(rule('.carryMedia')).toMatch(/width:\s*36px;[\s\S]*height:\s*36px/);
    expect(rule('.carrySticker')).toMatch(/width:\s*36px;[\s\S]*height:\s*36px;[\s\S]*opacity:\s*0\.55/);
    expect(rule('.carryRemove')).toMatch(/width:\s*52px/);
    expect(rule('.send')).toMatch(/width:\s*52px/);
    expect(rule('.carryStrip')).toMatch(/padding:\s*8px/);
    expect(rule('.carryThumb')).toMatch(/width:\s*56px;[\s\S]*height:\s*56px/);
    // The words start where the field's text does: nothing between the ＋'s column and either of them.
    expect(rule('.carryWords')).toMatch(/padding:\s*0/);
    expect(rule('.composerField')).toMatch(/padding:\s*0 10px 0 0/);
    // One reply: 6 + 44 + one line's 48.
    expect(6 + 44 + CAPSULE_H).toBe(98);
  });

  it('keeps one line of 36 and three lines of text in a short window under a finger', () => {
    const short = css.slice(css.indexOf('@media (pointer: coarse) and (max-height: 500px)'));
    const block = short.slice(0, short.indexOf('\n}\n') + 2);
    expect(block).toMatch(/\.carryRow\s*\{\s*min-height:\s*36px/);
    expect(block).toMatch(/\.carryText\s*\{\s*flex-direction:\s*row/);
    expect(block).toMatch(/\.carryThumb\s*\{\s*width:\s*44px;\s*height:\s*44px/);
    expect(block).toMatch(/textarea\.composerInput\s*\{\s*max-height:\s*calc\(2lh \+ 48px\)/);
  });

  // Round 23 (the critic's): a row coming or going in one tap must not redraw the whole pen line — the composer's
  // outline grows from its one-line height moving its sides alone; at one line it is the plain shape.
  it('grows its outline by its sides alone: the foot and its corners stay, the top only rises', () => {
    const w = 320;
    const cubics = (d: string) =>
      [...d.matchAll(/C ([-\d.]+),([-\d.]+) ([-\d.]+),([-\d.]+) ([-\d.]+),([-\d.]+)/g)].map((m) => m.slice(1).map(Number));
    const parts = (h: number) => {
      const c = cubics(capsuleShape(w, h)!.outline);
      const nH = autoSegments(w);
      const nV = autoSegments(h);
      return { top: c.slice(0, nH + 2), foot: c.slice(nH + 2 + nV, nH + 2 + nV + nH + 2) };
    };
    // At one line: the plain shape (the tag field's, the slip's), point for point.
    expect(capsuleShape(w, 48)!.outline).toBe(segmentCapsuleShape(w, 48, SEND_SEGMENT_W, 23)!.outline);
    const rest = parts(48);
    for (const h of [98, 170, 240, 400]) {
      const grown = parts(h);
      expect(grown.top).toEqual(rest.top);
      // The foot is the one-line foot, moved down by the growth.
      const lift = (row: number[]) => row.map((v, i) => (i % 2 ? +(v - (h - 48)).toFixed(2) : v));
      expect(grown.foot.map(lift)).toEqual(rest.foot);
    }
    // The tag field keeps the plain outline, whose foot does move as it grows.
    const plainFoot = (h: number) => cubics(segmentCapsuleShape(w, h, SEND_SEGMENT_W, 23)!.outline).slice(-autoSegments(h) - autoSegments(w) - 2);
    expect(plainFoot(240)).not.toEqual(plainFoot(48));
  });
});

describe('a notice in the composer’s place', () => {
  it('is opaque paper in the field’s pen, with no halo', () => {
    const { container } = render(
      <FloatingSlip seed={31}>
        <span>Waiting for their answer</span>
      </FloatingSlip>,
    );
    const paths = Array.from(container.querySelectorAll('svg path'));
    const pen = paths.find((p) => p.getAttribute('class')?.includes('slipPen'))!;
    expect(Number(pen.getAttribute('stroke-width'))).toBe(INK);
    expect(paths.map((p) => p.getAttribute('class'))).toEqual([expect.stringContaining('paperFill'), expect.stringContaining('slipPen')]);
    expect(pen.getAttribute('d')).toBe(floatingPath(320, 48, 14, 31));
    expect(rule('.slip')).toMatch(/--shape-ink:\s*var\(--field-border\)/);
    expect(screen.getByText('Waiting for their answer')).toBeInTheDocument();
  });

  it('stands in as a plain shape of the same fill until it is measured', () => {
    // Before the size is known (jsdom's 0×0 outside this suite's mock), no shape is drawn half-made.
    expect(floatingPath(0, 0, 14, 31)).toBe('');
  });
});
