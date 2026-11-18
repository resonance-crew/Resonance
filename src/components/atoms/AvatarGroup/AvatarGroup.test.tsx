// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/../test/render';
import { AvatarGroup, type AvatarGroupMember } from './AvatarGroup';

function member(id: string): AvatarGroupMember {
  return { id, initials: id.toUpperCase(), accentColor: 'var(--accent)', avatarSeed: '3' };
}

const css = readFileSync(join(process.cwd(), 'src/components/atoms/AvatarGroup/AvatarGroup.module.css'), 'utf8');

// Round 26 §U2: who resonated, as faces — at most three, then a blank paper disc, never a number.
describe('AvatarGroup', () => {
  it('draws at most `max` faces, the rest one blank disc — no count anywhere', () => {
    const { container } = render(<AvatarGroup members={['a', 'b', 'c', 'd', 'e'].map(member)} max={3} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('D')).not.toBeInTheDocument();
    expect(container.querySelector('[data-more]')).not.toBeNull();
    // Who, not how many: nothing that reads as a number.
    expect(container.textContent).not.toMatch(/\d/);
  });

  it('draws the blank disc when the host says there are more than the faces it has', () => {
    const { container } = render(<AvatarGroup members={['a', 'b'].map(member)} more />);
    expect(container.querySelectorAll('[data-face]')).toHaveLength(2);
    expect(container.querySelector('[data-more]')).not.toBeNull();
  });

  it('draws no disc when every face fits', () => {
    const { container } = render(<AvatarGroup members={['a', 'b'].map(member)} max={3} />);
    expect(container.querySelector('[data-more]')).toBeNull();
  });

  it('puts each face on a pad of paper in its own outline, the first face on top', () => {
    const { container } = render(<AvatarGroup members={['a', 'b', 'c'].map(member)} size={28} />);
    const items = [...container.querySelectorAll<HTMLElement>('[data-face]')];
    // A pad per face, 6 bigger than it (3 on every side), its outline the avatar's own (a path, not a circle).
    for (const item of items) {
      const pad = item.querySelector('svg');
      expect(pad?.getAttribute('width')).toBe('34');
      expect(pad?.querySelector('path')?.getAttribute('d')).toMatch(/^M/);
    }
    const z = items.map((el) => Number(el.style.zIndex));
    expect(z).toEqual([...z].sort((a, b) => b - a));
  });

  it('is only faces: no button of its own, no shadow, no lift', () => {
    render(<AvatarGroup members={['a'].map(member)} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(css).not.toMatch(/box-shadow\s*:/);
    expect(css).not.toMatch(/:hover/);
    // The pad is filled, never stroked (a 3px ring broke one pen, M3).
    expect(css).toMatch(/\.pad path\s*\{\s*fill: var\(--avatar-group-paper\);\s*\}/);
  });

  it('slides the arriving face in and the leaving face out, never under reduced motion', () => {
    const { container, rerender } = render(<AvatarGroup members={['me', 'b'].map(member)} arriving="me" />);
    expect(container.querySelector('[data-face="me"]')?.hasAttribute('data-arriving')).toBe(true);
    rerender(<AvatarGroup members={['b'].map(member)} leaving={member('me')} />);
    expect(container.querySelector('[data-face="me"]')?.hasAttribute('data-leaving')).toBe(true);
    expect(css).toMatch(/animation: faceIn 150ms/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
  });
});
