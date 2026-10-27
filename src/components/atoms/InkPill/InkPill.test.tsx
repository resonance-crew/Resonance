// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InkPill } from './InkPill';

// The wash a word floats on — the thread's pill and every toast's face.

describe('InkPill', () => {
  it('is a button, all of it, when it does something', () => {
    const onClick = vi.fn();
    render(<InkPill size="sm" icon="chevron-down" label="Jump to latest" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Jump to latest' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-size', 'sm');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('takes the name it is given, with its words leading it', () => {
    render(<InkPill size="md" label={<>Moved to trash · <strong>Undo</strong></>} ariaLabel="Moved to trash · Undo Rain" onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Moved to trash · Undo Rain' })).toHaveAttribute('data-size', 'md');
  });

  // On its own (the thread's 已複製) the pill speaks for itself; in the toast
  // host the one live region speaks, so the face stays silent.
  it('announces its words as a status only when told to', () => {
    const { rerender } = render(<InkPill size="sm" announce label="Copied" />);
    expect(screen.getByRole('status')).toHaveTextContent('Copied');

    rerender(<InkPill size="md" label="Copied" />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Copied').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('shows its wash before it is measured, as every drawn shape does', () => {
    render(<InkPill size="sm" announce label="Copied" />);
    const pill = screen.getByRole('status');
    expect(pill).toHaveClass('res-shape-stand-in');
    // jsdom measures nothing: the CSS stand-in stays.
    expect(pill).toHaveAttribute('data-shape-pending', '');
  });

  // Round 17 addendum A1: a toast lies over the page like a piece of cut paper — the paper-cut shadow under its
  // wash, following the wobble (a drop-shadow of the drawing: never under the words or the glyph).
  it('is lifted off the page by the paper-cut shadow under its wash', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/atoms/InkPill/InkPill.module.css'), 'utf8');
    expect(css).toMatch(/\.pill > svg \{\s*filter: var\(--cutout-shadow\);\s*\}/);
    // The glyph is drawn in a box of its own (atoms/Icon), so only the wash is the pill's own svg.
    const { container } = render(<InkPill size="md" icon="trash" label="Moved to trash" />);
    const pill = container.firstElementChild as HTMLElement;
    expect(pill.querySelectorAll(':scope > svg')).toHaveLength(0); // jsdom measures nothing: no wash drawn yet
    expect(pill.querySelector(':scope > span svg')).not.toBeNull();
  });
});
