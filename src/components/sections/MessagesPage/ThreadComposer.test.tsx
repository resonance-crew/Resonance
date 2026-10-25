// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import { mockElementSize } from '@/../test/organic';

vi.mock('@/components/providers/ToastProvider', () => ({ useToast: () => ({ show: vi.fn() }) }));
// A picture is made ready on the device (a canvas jsdom hasn't): handed back as it came.
vi.mock('@/lib/chat/preparePicture', () => ({
  UnsupportedImage: class extends Error {},
  preparePicture: async (file: File) => ({ file, width: 800, height: 600 }),
}));

import { ThreadComposer } from './ThreadComposer';

mockElementSize(320, 48);

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:picture');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

function composer(props: Partial<Parameters<typeof ThreadComposer>[0]> = {}) {
  return (
    <ThreadComposer
      inputRef={createRef<HTMLTextAreaElement>()}
      otherHandle="alice"
      replyingTo={null}
      replyHandle={null}
      onCancelReply={() => {}}
      send={() => true}
      ready
      {...props}
    />
  );
}

/** The riding row holding `text`, as a list of what is in it from start to end. */
const rowOf = (text: string) => screen.getByText(text).closest('[class*="carryRow"]') as HTMLElement;

// Round 10 §3.4: what rides the next message sits over the capsule as rows in the reply's style, with no frame —
// what it is at the start, whom or what, and its ✕ at the row's end.
describe('what rides the next message', () => {
  it('shows a reply as a row, its ✕ at the end, with no slip round it', async () => {
    const onCancelReply = vi.fn();
    const { container } = renderWithIntl(
      composer({ replyingTo: { id: 'm1', senderId: 'alice', text: 'See you by the river' }, replyHandle: 'alice', onCancelReply }),
    );
    const row = rowOf('Replying to alice');
    expect(row).toHaveTextContent('See you by the river');
    expect(row.lastElementChild).toContainElement(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(container.querySelector('[class*="slip"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(onCancelReply).toHaveBeenCalledTimes(1);
  });

  it('shows a pasted picture as a row in the same style — its thumbnail first, its ✕ at the end', async () => {
    renderWithIntl(composer());
    expect(document.querySelector('[class*="carry"]')).toBeNull();
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.paste(screen.getByRole('textbox'), { clipboardData: { files: [file] } });

    const row = await waitFor(() => rowOf('Photo'));
    expect(row.firstElementChild?.querySelector('img')).toHaveAttribute('src', 'blob:picture');
    const remove = screen.getByRole('button', { name: 'Remove photo' });
    expect(row.lastElementChild).toContainElement(remove);
    await userEvent.click(remove);
    expect(screen.queryByText('Photo')).not.toBeInTheDocument();
  });

  it('stacks a reply over a picture, a row each, the reply first', async () => {
    renderWithIntl(composer({ replyingTo: { id: 'm1', senderId: 'me', text: 'Mine' }, replyHandle: null }));
    fireEvent.paste(screen.getByRole('textbox'), { clipboardData: { files: [new File(['x'], 'p.png', { type: 'image/png' })] } });
    await waitFor(() => rowOf('Photo'));
    const rows = Array.from(document.querySelectorAll('[class*="carryRow"]'));
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('Replying to yourself'), expect.stringContaining('Photo')]);
  });
});
