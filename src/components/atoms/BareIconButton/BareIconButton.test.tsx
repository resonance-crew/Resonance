// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, renderWithIntl, screen, userEvent } from '@/../test/render';
import { BareIconButton } from './BareIconButton';

describe('BareIconButton', () => {
  it('is a button named by what it does, which its tooltip repeats (hidden from assistive tech)', async () => {
    const onClick = vi.fn();
    render(<BareIconButton icon="reply" label="Reply" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Reply' });
    const tip = button.nextElementSibling as HTMLElement;
    expect(tip).toHaveTextContent('Reply');
    expect(tip).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('puts its tooltip away on Escape until focus leaves, and says nothing when disabled', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<BareIconButton icon="chevron-down" label="Later match" onClick={onClick} tip="below" />);
    const button = screen.getByRole('button', { name: 'Later match' });
    const tip = button.nextElementSibling as HTMLElement;
    expect(tip).toHaveAttribute('data-side', 'below');
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(tip).toHaveAttribute('data-dismissed');
    fireEvent.blur(button);
    expect(tip).not.toHaveAttribute('data-dismissed');

    rerender(<BareIconButton icon="chevron-down" label="Later match" onClick={onClick} disabled />);
    await userEvent.click(screen.getByRole('button', { name: 'Later match' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  // The card box's pen beside the name: a place to go, so a link (it opens in a new tab like one).
  it('is a link, named and tipped the same, when it leads somewhere', () => {
    renderWithIntl(<BareIconButton icon="pen" label="Edit profile" href="/settings" />);
    const link = screen.getByRole('link', { name: 'Edit profile' });
    expect(link.getAttribute('href')).toMatch(/\/settings$/);
    expect(link.nextElementSibling).toHaveTextContent('Edit profile');
    expect(screen.queryByRole('button')).toBeNull();
  });

  // Round 23: the ☺'s 「貼圖」 lingered under the open sticker popover, its corner poking out past the popover's.
  it('never shows its tooltip while what it opened is open', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/atoms/BareIconButton/BareIconButton.module.css'), 'utf8');
    // The tip shows on hover or keyboard focus only when it isn't dismissed.
    const shown = [...css.matchAll(/([^{}]*\+ \.tip[^{}]*)\{[^}]*opacity:\s*1/g)].map((m) => m[1]);
    expect(shown).toHaveLength(2);
    for (const selector of shown) expect(selector).toContain(':not([data-dismissed])');

    const { rerender } = render(<BareIconButton icon="smile" label="Stickers" expanded={false} haspopup="dialog" />);
    const button = screen.getByRole('button', { name: 'Stickers' });
    const tip = button.nextElementSibling as HTMLElement;
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(tip).not.toHaveAttribute('data-dismissed');
    rerender(<BareIconButton icon="smile" label="Stickers" expanded haspopup="dialog" />);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(tip).toHaveAttribute('data-dismissed');
    // Closed again: the next hover may say what it is.
    rerender(<BareIconButton icon="smile" label="Stickers" expanded={false} haspopup="dialog" />);
    expect(tip).not.toHaveAttribute('data-dismissed');
  });

  // Round 23: the composer's ✕s — a press leaves the focus in the field being written in (a phone's keyboard stays up).
  it('can leave the focus where it is when pressed, and still answers the press', async () => {
    const onClick = vi.fn();
    render(
      <>
        <textarea aria-label="Message" />
        <BareIconButton icon="close" label="Cancel reply" keepFocus onClick={onClick} />
        <BareIconButton icon="close" label="Plain" />
      </>,
    );
    const field = screen.getByRole('textbox', { name: 'Message' });
    field.focus();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(field).toHaveFocus();
    const plain = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    screen.getByRole('button', { name: 'Plain' }).dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
  });
});

