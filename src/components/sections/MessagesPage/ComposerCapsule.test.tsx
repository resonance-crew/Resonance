// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@/../test/render';
import { mockElementSize } from '@/../test/organic';
import { boundaryPoints, polyline } from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { CAPSULE_H, ComposerCapsule, SEND_SEGMENT_W, capsuleShape } from './ComposerCapsule';
import { FloatingSlip, PAPER_HALO, floatingPath } from './FloatingSlip';

// The capsule and the slip measure themselves before they draw.
mockElementSize(320, 48);

const css = readFileSync(join(process.cwd(), 'src/components/sections/MessagesPage/Thread.module.css'), 'utf8');
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
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
  // for the face's edge and the stroke — and the page's paper as a halo round it.
  it('cuts Send off the field as its end segment, on the segmented bar’s seam', () => {
    const shape = capsuleShape(320, 48)!;
    const seam = polyline(boundaryPoints(320 - SEND_SEGMENT_W, 48, 34, 1.6, Math.max(12, 48 * 0.3)));
    expect(shape.seam).toBe(seam);
    expect(shape.segment.startsWith(seam)).toBe(true);
    expect(shape.outline).toBe(floatingPath(320, 48, 16, 23));
    expect(capsuleShape(0, 48)).toBeNull();
  });

  it('draws the halo under the field’s pen, in the paper’s colour, and nothing see-through', () => {
    const { container } = render(capsule());
    const paths = Array.from(container.querySelectorAll('svg path'));
    const halo = paths.find((p) => p.getAttribute('class')?.includes('paperHalo'))!;
    const pen = paths.find((p) => p.getAttribute('class')?.includes('capsulePen'))!;
    expect(halo.getAttribute('d')).toBe(pen.getAttribute('d'));
    expect(Number(halo.getAttribute('stroke-width'))).toBe(INK + 2 * PAPER_HALO);
    expect(Number(pen.getAttribute('stroke-width'))).toBe(INK);
    // The halo comes first: the pen line lies on it.
    expect(paths.indexOf(halo)).toBeLessThan(paths.indexOf(pen));
    expect(rule('.paperHalo')).toMatch(/stroke:\s*var\(--color-cream\)/);
    // Not a shadow, not a fade: a floating thing stays opaque in every state.
    for (const sel of ['.capsule', '.send', '.slip', '.dock', '.paperFill', '.sendFace']) {
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

  it('turns its pen terracotta while written in, as every field does', () => {
    const { container, rerender } = render(capsule());
    expect(container.firstElementChild).not.toHaveAttribute('data-focus');
    rerender(capsule({ focused: true }));
    expect(container.firstElementChild).toHaveAttribute('data-focus');
    expect(rule('.capsule[data-focus] .capsulePen')).toMatch(/stroke:\s*var\(--field-border-focus\)/);
  });

  // Telegram's: the field doesn't grow from a larger font — one line sits centred in 48 by padding worked out from
  // its own line height; only more lines grow it, up to five; the ＋ and the segment never scale.
  it('keeps one line exactly 48 tall whatever its line height, growing only by lines, to five', () => {
    expect(CAPSULE_H).toBe(48);
    expect(rule('.composerField')).toMatch(/padding-block:\s*calc\(\(48px - 1lh\) \/ 2\)/);
    expect(rule('.composerField')).toMatch(/font-size:\s*16px/);
    expect(rule('.capsule textarea.composerInput')).toMatch(/max-height:\s*5lh/);
    expect(rule('.plusSlot')).toMatch(/width:\s*44px;[\s\S]*height:\s*48px/);
    expect(rule('.send')).toMatch(/width:\s*52px/);
    // The plane sits on the last line's row, beside the ＋, not in the middle of a tall field.
    expect(rule('.sendGlyph')).toMatch(/bottom:\s*0/);
    expect(rule('.sendGlyph')).toMatch(/height:\s*48px/);
  });
});

describe('the slip over the composer', () => {
  it('is opaque paper with the same halo, its pen a step lighter for what rides along', () => {
    const { container } = render(
      <FloatingSlip seed={31}>
        <span>Replying to alice</span>
      </FloatingSlip>,
    );
    const paths = Array.from(container.querySelectorAll('svg path'));
    const halo = paths.find((p) => p.getAttribute('class')?.includes('paperHalo'))!;
    const pen = paths.find((p) => p.getAttribute('class')?.includes('slipPen'))!;
    expect(Number(pen.getAttribute('stroke-width'))).toBe(INK_LIGHT);
    expect(Number(halo.getAttribute('stroke-width'))).toBe(INK_LIGHT + 2 * PAPER_HALO);
    expect(pen.getAttribute('d')).toBe(floatingPath(320, 48, 14, 31));
    expect(screen.getByText('Replying to alice')).toBeInTheDocument();
  });

  it('stands in as a plain shape of the same fill until it is measured', () => {
    // Before the size is known (jsdom's 0×0 outside this suite's mock), no shape is drawn half-made.
    expect(floatingPath(0, 0, 14, 31)).toBe('');
  });
});
