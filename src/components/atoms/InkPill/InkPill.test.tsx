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

  // The thread's way back to the latest message (the owner, 2026-10-28): an arrow alone, small over the thread in a
  // face a step rounder than an avatar's, its words only its name.
  it('is a small face around its glyph alone when it has no words', () => {
    render(<InkPill size="sm" icon="chevron-down" ariaLabel="Latest messages" onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Latest messages' });
    expect(button).toHaveAttribute('data-glyph');
    expect(button).toHaveTextContent('');
    expect(button.querySelector('svg')).not.toBeNull();

    const css = readFileSync(join(process.cwd(), 'src/components/atoms/InkPill/InkPill.module.css'), 'utf8');
    const [, rule] = css.match(/\.pill\[data-glyph\]\s*\{([^}]*)\}/) ?? [];
    expect(rule).toMatch(/width:\s*36px/);
    expect(rule).toMatch(/height:\s*36px/);
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

  // Round 18 (the owner's): a toast is made as a card is — its own fill inside a pen line — and flat, no shadow.
  it('is a card: its fill inside a pen line, no shadow, a toast with a card’s corners', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/atoms/InkPill/InkPill.module.css'), 'utf8');
    expect(css).not.toMatch(/filter|shadow/);
    const { container } = render(<InkPill size="md" icon="trash" label="Moved to trash" />);
    const pill = container.firstElementChild as HTMLElement;
    // Before it is measured, its stand-in already shows the fill and the pen.
    expect(pill.style.getPropertyValue('--shape-fill')).toBe('var(--color-terracotta-light)');
    expect(pill.style.getPropertyValue('--shape-ink')).toBe('var(--color-terracotta)');
    expect(pill.style.getPropertyValue('--shape-radius')).toBe('16px');
  });
});
