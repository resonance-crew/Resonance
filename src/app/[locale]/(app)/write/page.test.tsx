// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, waitFor } from '@/../test/render';

// The page reads its query client-side; here it opens on a resonance to card c1.
let query = new URLSearchParams('referenceCardId=c1');
vi.mock('next/navigation', () => ({ useSearchParams: () => query }));
// The workspace drags in the editor and the map: what it is handed is what matters.
const workspace = vi.fn();
vi.mock('@/components/sections/WriteWorkspace/WriteWorkspace', () => ({
  WriteWorkspace: (props: { seedStory?: string; referenceCardId?: string }) => {
    workspace(props);
    return <p>story: {props.seedStory ?? '(empty)'}</p>;
  },
}));

import { leaveWriteSeed } from '@/lib/data/writeSeed';
import WritePage from './page';

afterEach(() => {
  sessionStorage.clear();
  query = new URLSearchParams('referenceCardId=c1');
  vi.clearAllMocks();
});

describe('the writer, opened on a resonance', () => {
  // A note grown into a resonance on the card page: its words arrive in the new card's story.
  it('starts the story with the words of the note it grew from, and takes them once', async () => {
    leaveWriteSeed('c1', 'A note I wanted to say more about.');
    const view = renderWithIntl(<WritePage />);
    expect(await screen.findByText('story: A note I wanted to say more about.')).toBeInTheDocument();
    expect(workspace).toHaveBeenLastCalledWith(expect.objectContaining({ referenceCardId: 'c1' }));
    // Taken: a reload starts from the draft its words were saved into, not from them again.
    expect(sessionStorage.getItem('resonance:write-seed:c1')).toBeNull();
    view.unmount();
    renderWithIntl(<WritePage />);
    await waitFor(() => expect(screen.getByText('story: (empty)')).toBeInTheDocument());
  });

  it('leaves another card’s words for that card', async () => {
    leaveWriteSeed('c2', 'For the other card.');
    renderWithIntl(<WritePage />);
    await waitFor(() => expect(screen.getByText('story: (empty)')).toBeInTheDocument());
    expect(sessionStorage.getItem('resonance:write-seed:c2')).toBe('For the other card.');
  });
});
