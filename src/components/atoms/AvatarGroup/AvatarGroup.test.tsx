// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/../test/render';
import { AvatarGroup, FACE_SLIDE_MS, type AvatarGroupMember } from './AvatarGroup';

function member(id: string): AvatarGroupMember {
  return { id, initials: id.toUpperCase(), accentColor: 'var(--accent)', avatarSeed: '3' };
}

const css = readFileSync(join(process.cwd(), 'src/components/atoms/AvatarGroup/AvatarGroup.module.css'), 'utf8');

// Round 26 §U2: who resonated, as faces — at most three, never a number. Round 29 §S5 (the owner: 「不要把當有第四、
// 第五個的時候顯示成灰色」): nothing after the three either — no blank disc.
describe('AvatarGroup', () => {
  it('draws at most `max` faces and nothing after them — no blank disc, no count anywhere', () => {
    const { container } = render(<AvatarGroup members={['a', 'b', 'c', 'd', 'e'].map(member)} max={3} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('D')).not.toBeInTheDocument();
    const stack = container.firstElementChild as HTMLElement;
    expect(stack.children).toHaveLength(3);
    expect(stack.getAttribute('data-count')).toBe('3');
    expect(container.querySelector('[data-more]')).toBeNull();
    // Who, not how many: nothing that reads as a number.
    expect(container.textContent).not.toMatch(/\d/);
  });

  it('has no way left to draw a blank disc', () => {
    const { container } = render(<AvatarGroup members={['a', 'b'].map(member)} {...({ more: true } as object)} />);
    expect(container.querySelectorAll('[data-face]')).toHaveLength(2);
    expect(container.querySelector('[data-more]')).toBeNull();
    expect(css).not.toMatch(/\.disc\b|--avatar-wait/);
  });

  it('draws each face on no pad — the face alone, stepping 0.34 of its size over the one before, the first on top', () => {
    // The owner, 2026-11-19: a pad of the page's paper round each face made the overlap read wider. Each face is its
    // own drawing now (its fill, initials or photo, its pen line); the front face's fill covers the one behind.
    const { container } = render(<AvatarGroup members={['a', 'b', 'c'].map(member)} size={28} />);
    const items = [...container.querySelectorAll<HTMLElement>('[data-face]')];
    for (const item of items) {
      // One drawing per face, as big as the face: nothing larger laid under it.
      expect(item.children).toHaveLength(1);
      for (const svg of item.querySelectorAll('svg')) expect(svg.getAttribute('width')).toBe('28');
    }
    const stack = container.firstElementChild as HTMLElement;
    expect(stack.style.getPropertyValue('--avatar-step')).toBe(`${28 * 0.34}px`);
    const z = items.map((el) => Number(el.style.zIndex));
    expect(z).toEqual([...z].sort((a, b) => b - a));
    expect(css).not.toMatch(/\.pad\b|--avatar-group-paper/);
  });

  it('is only faces: no button of its own, no shadow, no lift', () => {
    render(<AvatarGroup members={['a'].map(member)} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(css).not.toMatch(/box-shadow\s*:/);
    expect(css).not.toMatch(/:hover/);
  });

  it('slides the arriving face in and the leaving face out, never under reduced motion', () => {
    const { container, rerender } = render(<AvatarGroup members={['me', 'b'].map(member)} arriving="me" />);
    expect(container.querySelector('[data-face="me"]')?.hasAttribute('data-arriving')).toBe(true);
    rerender(<AvatarGroup members={['b'].map(member)} leaving={member('me')} />);
    expect(container.querySelector('[data-face="me"]')?.hasAttribute('data-leaving')).toBe(true);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
  });

  // Round 34 §9 (the owner: the reader's own face rises out of the 共振 segment, cut by its top edge, and sinks back
  // into it — not a sideways fade): the face moves inside its place, which cuts it at --avatar-rise (the host's edge).
  it('raises the arriving face from --avatar-rise below, cut there, and sinks the leaving one back, in the house’s short ease', () => {
    const { container } = render(<AvatarGroup members={['me', 'b'].map(member)} arriving="me" />);
    const place = container.querySelector('[data-face="me"]')!;
    // The face is its place's one child: what moves.
    expect(place.children).toHaveLength(1);
    expect(place.firstElementChild!.className).toMatch(/face/);
    expect(FACE_SLIDE_MS).toBe(180);
    expect(css).toMatch(/\.item\[data-arriving\],\s*\.item\[data-leaving\] \{[^}]*--rise: var\(--avatar-rise, calc\(var\(--avatar-size\) \+ 8px\)\);[^}]*clip-path: polygon\(-40px -40px, [^;]*, -40px var\(--rise\)\);/);
    expect(css).toMatch(/\.item\[data-arriving\] > \.face \{\s*animation: faceRise 180ms ease-out;/);
    expect(css).toMatch(/\.item\[data-leaving\] > \.face \{\s*animation: faceSink 180ms ease-in forwards;/);
    expect(css).toMatch(/@keyframes faceRise \{\s*from \{\s*transform: translateY\(var\(--rise\)\);/);
    expect(css).toMatch(/@keyframes faceSink \{\s*to \{\s*transform: translateY\(var\(--rise\)\);/);
    // No fade and no sideways step any more.
    expect(css).not.toMatch(/translateX|faceIn|faceOut/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[^}]*\.item\[data-arriving\] > \.face,[^}]*animation: none;/);
  });
});
