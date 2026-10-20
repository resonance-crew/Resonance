// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import useSWR, { SWRConfig } from 'swr';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { closeRestoredAlone } from '@/lib/data/trash';
import { RestoredAloneNotice } from './RestoredAloneNotice';
import { TrashActionsMenu } from './TrashActionsMenu';

// The ⋯ on a card in the trash, on the real client writes: the v1 API call
// (callApi) and the signed-in user are the module boundary.
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }));
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: () => ({ currentUser: { uid: 'u1', getIdToken: async () => 'token' } }),
}));
const mockCallApi = vi.fn();
vi.mock('@/lib/db/firestore/client/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/firestore/client/api')>()),
  callApi: (...args: unknown[]) => mockCallApi(...args),
}));
const { ApiError } = await import('@/lib/db/firestore/client/api');

const trashReads = vi.fn(async () => []);
const privateReads = vi.fn(async () => []);
function Shelves() {
  useSWR('cardbox:u1:trash', trashReads);
  useSWR('cardbox:u1:private', privateReads);
  return null;
}

function renderMenu(menu: ReactNode) {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ToastProvider>
        <Shelves />
        {menu}
        <RestoredAloneNotice />
      </ToastProvider>
    </SWRConfig>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  closeRestoredAlone();
});

describe('TrashActionsMenu', () => {
  it('restores a card, reads the shelves again and says so', async () => {
    const onRestored = vi.fn();
    mockCallApi.mockResolvedValue({ card: { id: 'c1' }, changed: true, droppedResonance: false });
    renderMenu(<TrashActionsMenu card={{ id: 'c1' }} onRestored={onRestored} />);
    await waitFor(() => expect(trashReads).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Restore', 'Delete forever']);
    await userEvent.click(screen.getByText('Restore'));

    await waitFor(() => expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/c1/restore', { method: 'POST' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Restored'));
    expect(onRestored).toHaveBeenCalledWith({ id: 'c1' });
    await waitFor(() => expect(trashReads).toHaveBeenCalledTimes(2));
    expect(privateReads).toHaveBeenCalledTimes(2);
  });

  it('says a resonance came back on its own', async () => {
    mockCallApi.mockResolvedValue({ card: { id: 'c1' }, changed: true, droppedResonance: true });
    renderMenu(<TrashActionsMenu card={{ id: 'c1', referenceCardId: 'orig' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Restore'));
    expect(await screen.findByRole('dialog', { name: 'Restored' })).toHaveTextContent(
      'This card is back, but it no longer resonates with the card it answered.',
    );
  });

  it('deletes for good only after asking, in red, and only while the card is still in the trash', async () => {
    const onDeleted = vi.fn();
    mockCallApi.mockResolvedValue(null);
    renderMenu(<TrashActionsMenu card={{ id: 'c1' }} onDeleted={onDeleted} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete forever'));

    expect(mockCallApi).not.toHaveBeenCalled();
    expect(screen.getByText('Delete this card forever?')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone — the story and its resonance links will be gone.')).toBeInTheDocument();
    const verb = screen.getByRole('button', { name: 'Delete forever' });
    const keep = screen.getByRole('button', { name: 'Keep it' });
    expect(verb).toHaveAttribute('data-variant', 'danger');
    expect(keep).toHaveAttribute('data-variant', 'tonal');

    await userEvent.click(verb);
    await waitFor(() => expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/c1?onlyIfTrashed=true', { method: 'DELETE' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Deleted forever'));
    expect(onDeleted).toHaveBeenCalledWith('c1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('leaves a card restored meanwhile (on another device) as it is, and says it is no longer in the trash', async () => {
    const onDeleted = vi.fn();
    mockCallApi.mockRejectedValue(new ApiError(409, 'conflict', 'This card is not in the trash.'));
    renderMenu(<TrashActionsMenu card={{ id: 'c1' }} onDeleted={onDeleted} />);
    await waitFor(() => expect(trashReads).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete forever'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete forever' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("This card isn't in the trash any more"));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onDeleted).not.toHaveBeenCalled();
    // The shelf is read again: it shows where the card really is.
    await waitFor(() => expect(trashReads).toHaveBeenCalledTimes(2));
  });

  it('keeps the question open and says so when the delete fails for another reason', async () => {
    mockCallApi.mockRejectedValue(new Error('offline'));
    renderMenu(<TrashActionsMenu card={{ id: 'c1' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete forever'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete forever' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't work — try again");
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
