// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BRAND_PATHS, BrandMark, type BrandName } from './BrandMark';

// The brands' marks are theirs, unmodified (Simple Icons 16.35.0, verbatim):
// a change to a path is a decision, never a tidy-up — so each is pinned, as
// the store badges' files are.
const PINNED: Record<BrandName, string> = {
  line: 'c60e036e353e1b433cd5cc368eeeaa5446cdc99f3efe7125f0d9a3016e2c5efe',
  threads: 'a32f7decab8aa313de1991fecc62367da64d9c8ab98b6b148426126b0cc62f5e',
  facebook: '910dcaa575f731d3e2f1cadeb5a4fcbdcfa6d71ba3bd04c6d2734c4104bba816',
  x: 'a0a8e4521f2dc70e9a6fb8b860dedf3cd0e67bdf279c607ed45b341811025cab',
};

describe('BrandMark', () => {
  it('keeps every brand’s path exactly as it was taken', () => {
    for (const [name, hash] of Object.entries(PINNED)) {
      expect(createHash('sha256').update(BRAND_PATHS[name as BrandName]).digest('hex'), name).toBe(hash);
    }
    expect(Object.keys(BRAND_PATHS).sort()).toEqual(Object.keys(PINNED).sort());
  });

  it('draws the mark in the ink around it, hidden from assistive tech (its row names the platform)', () => {
    const { container } = render(<BrandMark name="line" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveAttribute('width', '17');
    // The 24 grid with room round it: the mark draws about 14 px of the slot, as the hand-drawn glyphs beside it read.
    expect(svg).toHaveAttribute('viewBox', '-2 -2 28 28');
    expect(svg.querySelector('path')).toHaveAttribute('d', BRAND_PATHS.line);
    // X the same (round 12 §4): with more room of its own it read a size smaller than the rest.
    expect(render(<BrandMark name="x" />).container.querySelector('svg')).toHaveAttribute('viewBox', '-2 -2 28 28');
  });

  it('is never recoloured: near-black ink, whatever row or hover it sits in', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/atoms/BrandMark/BrandMark.module.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(css).toMatch(/\.mark\s*\{[^}]*color:\s*var\(--color-text\)/);
    expect(css).not.toMatch(/terracotta|--menu-/);
  });
});
