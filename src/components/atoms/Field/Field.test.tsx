// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen } from '@/../test/render';
import { Textarea } from './Field';

describe('Textarea', () => {
  // The writer's title: a field of the document, drawn without a form's frame.
  it('draws no frame when bare, and still grows with what is written', () => {
    const view = renderWithIntl(
      <Textarea variant="bare" aria-label="One-line title" rows={1} autoGrow value="" onChange={vi.fn()} />,
    );
    const { container } = view;
    const field = screen.getByRole('textbox', { name: 'One-line title' });
    expect(field).toHaveAttribute('data-variant', 'bare');
    // No hand-drawn surface around it.
    expect(container.querySelector('svg')).toBeNull();
    expect(field.parentElement).toBe(container);

    // Height follows the content (the box is collapsed, then measured).
    Object.defineProperty(field, 'scrollHeight', { configurable: true, get: () => 96 });
    view.rerender(
      <Textarea variant="bare" aria-label="One-line title" rows={1} autoGrow value={'a title long enough to wrap'} onChange={vi.fn()} />,
    );
    expect(field.style.height).toBe('96px');
  });

  it('sits in its hand-drawn frame by default', () => {
    const { container } = renderWithIntl(<Textarea aria-label="Bio" value="" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Bio' })).not.toHaveAttribute('data-variant');
    expect(container.firstElementChild).not.toBe(screen.getByRole('textbox', { name: 'Bio' }));
  });
});
