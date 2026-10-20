// @vitest-environment jsdom
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
});
