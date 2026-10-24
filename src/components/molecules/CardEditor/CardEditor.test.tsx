// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef, useImperativeHandle, useState, type Ref } from 'react';
import useSWR, { SWRConfig } from 'swr';
import { act } from '@testing-library/react';
import { cleanup, renderWithIntl, screen, fireEvent, waitFor, userEvent } from '@/../test/render';
import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import type { MarkdownEditorHandle } from '@/components/molecules/MarkdownEditor/MarkdownEditor';
import { CardEditor, type CardEditorHandle, type CardEditorProps, type PrimaryAction } from './CardEditor';

const push = vi.fn();
const back = vi.fn();
const replace = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push, back, replace }),
}));
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, loading: false }),
}));
vi.mock('@/lib/db/firestore/client/cards', () => ({
  createCardDraft: vi.fn(),
  updateCardDraft: vi.fn(),
  publishCard: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/cardEdits', () => ({
  savePendingCardEdit: vi.fn(),
  applyPendingCardEdit: vi.fn(),
  discardPendingCardEdit: vi.fn(),
}));
// The card read again when a save is refused (is it in the trash?).
vi.mock('@/lib/db/firestore/client/reads', () => ({ getCardById: vi.fn() }));
vi.mock('./trashedCard', async (original) => ({
  ...(await original<typeof import('./trashedCard')>()),
  restoreTrashedCard: vi.fn(),
}));
// The publish step's preview needs the viewer's profile and the hint system;
// both are conversation-level boundaries here.
vi.mock('@/lib/data/hooks', () => ({
  useMyProfile: () => ({
    data: { id: 'me', handle: 'my-handle', initials: 'MH', avatarSeed: '3', accentColor: 'var(--accent)' },
  }),
}));
vi.mock('@/lib/hints', () => ({
  useHint: () => ({ visible: true, dismiss: vi.fn() }),
}));
// The story field is a Tiptap (ProseMirror) editor (its own suite); here a
// plain textarea that keeps its contract: value/onChange/aria-label, the
// script and language it is set in, and the handle the writer focuses it by.
vi.mock('@/components/molecules/MarkdownEditor/MarkdownEditor', () => ({
  MarkdownEditor: ({
    value,
    onChange,
    ariaLabel,
    script,
    lang,
    editorRef,
    onFocusChange,
  }: {
    value: string;
    onChange: (v: string) => void;
    ariaLabel?: string;
    script?: string;
    lang?: string;
    editorRef?: Ref<MarkdownEditorHandle>;
    onFocusChange?: (focused: boolean) => void;
  }) => {
    const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
    useImperativeHandle(editorRef, () => ({ focus: () => el?.focus(), isEmpty: () => !value }), [el, value]);
    return (
      <textarea
        ref={setEl}
        aria-label={ariaLabel}
        data-script={script}
        lang={lang}
        value={value}
        onFocus={() => onFocusChange?.(true)}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  },
}));

import { createCardDraft, updateCardDraft, publishCard } from '@/lib/db/firestore/client/cards';
import { ApiError } from '@/lib/db/firestore/client/api';
import { getCardById } from '@/lib/db/firestore/client/reads';
import { restoreTrashedCard } from './trashedCard';
import {
  applyPendingCardEdit,
  discardPendingCardEdit,
  savePendingCardEdit,
} from '@/lib/db/firestore/client/cardEdits';

/** A card that is already out in the world, opened for revision. */
const livePost = {
  id: 'card-1',
  slug: 'a-quiet-thought',
  publishedAt: new Date('2026-01-02'),
  thoughtCore: 'A quiet thought',
  story: 'The published story.',
  tags: ['memory'],
  visibility: 'public' as const,
  anonymous: false,
};

/**
 * The editor in a page: the page draws the one way forward it reports (✓ 完成,
 * in its bar), as the writer's workspace does.
 */
function Writer(props: Omit<CardEditorProps, 'onPrimaryActionChange'> & { editorRef?: Ref<CardEditorHandle> }) {
  const { editorRef, ...rest } = props;
  const [action, setAction] = useState<PrimaryAction | null>(null);
  return (
    <>
      {action && (
        <button type="button" disabled={action.disabled} aria-busy={action.loading || undefined} onClick={action.onPress}>
          {action.label}
        </button>
      )}
      <CardEditor {...rest} ref={editorRef} onPrimaryActionChange={setAction} />
    </>
  );
}

const next = () => screen.getByRole('button', { name: en.write.finish });
const title = () => screen.getByLabelText('One-line title');
const story = () => screen.getByLabelText('Story');
/** The publish step is up: its one button, whichever the card and its type make it. */
const inStep = () =>
  [
    en.write.publishPanel.publish,
    en.write.publishPanel.publishAnonymously,
    en.write.publishPanel.save,
    en.write.publishPanel.update,
    en.write.publishPanel.makeDraft,
  ].some((name) => screen.queryByRole('button', { name }) != null);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.mocked(createCardDraft).mockResolvedValue({ id: 'draft-1' } as never);
  vi.mocked(updateCardDraft).mockResolvedValue({ id: 'draft-1' } as never);
  vi.mocked(publishCard).mockResolvedValue({ id: 'pub-1' } as never);
  vi.mocked(savePendingCardEdit).mockResolvedValue(undefined);
  vi.mocked(discardPendingCardEdit).mockResolvedValue(undefined);
  vi.mocked(applyPendingCardEdit).mockResolvedValue({ id: 'card-1', slug: 'a-quiet-thought', applied: true });
  vi.mocked(getCardById).mockResolvedValue(null);
  vi.mocked(restoreTrashedCard).mockResolvedValue(undefined);
  // The step's mirror and tag suggestions are grace notes the flow must not depend on.
  fetchMock = vi.fn().mockResolvedValue({ ok: false });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => {
  // Unmount while the mocks still answer: the editor flushes unsaved edits as
  // it unmounts (an autosave), which would otherwise meet a cleared mock.
  cleanup();
  await new Promise((r) => setTimeout(r, 0));
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

/** Writes a title and a story, then presses 下一步 and waits for the publish step. */
async function toPublishStep(t = 'A quiet thought', s = 'Once there was a long enough story to publish.') {
  fireEvent.change(title(), { target: { value: t } });
  fireEvent.change(story(), { target: { value: s } });
  await userEvent.click(next());
  await waitFor(() => expect(inStep()).toBe(true));
}

describe('CardEditor — writing', () => {
  it('is the title and the story, and one way forward', () => {
    renderWithIntl(<Writer locale="en" />);
    expect(title()).toBeInTheDocument();
    expect(story()).toBeInTheDocument();
    // The tags, the cover and the audience wait in the publish step.
    expect(screen.queryByLabelText('Type a tag…')).toBeNull();
    expect(screen.queryByRole('button', { name: en.write.mediaPlaceholder })).toBeNull();
    expect(screen.queryByRole('button', { name: en.write.saveDraftAndLeave })).toBeNull();
    // Nothing written: nothing to take on.
    expect(next()).toBeDisabled();
    fireEvent.change(story(), { target: { value: 'A first line' } });
    expect(next()).toBeEnabled();
  });

  it('counts the title’s characters only near its end, and keeps it one line', () => {
    renderWithIntl(<Writer locale="en" />);
    fireEvent.change(title(), { target: { value: 'A short title' } });
    expect(screen.queryByText(/\/ 60/)).toBeNull();
    fireEvent.change(title(), { target: { value: 'x'.repeat(52) } });
    expect(screen.getByText('52 / 60')).toBeInTheDocument();
    // A pasted line break is a space; past 60 is cut.
    fireEvent.change(title(), { target: { value: 'two\nlines' } });
    expect(title()).toHaveValue('two lines');
    fireEvent.change(title(), { target: { value: 'y'.repeat(70) } });
    expect(title()).toHaveValue('y'.repeat(60));
  });

  it('goes on to the story on Enter, but not while an input method picks a word', () => {
    renderWithIntl(<Writer locale="en" />);
    title().focus();
    fireEvent.keyDown(title(), { key: 'Enter', keyCode: 229 });
    expect(title()).toHaveFocus();
    fireEvent.keyDown(title(), { key: 'Enter' });
    expect(story()).toHaveFocus();
  });

  // The data-layer rule: the step is an address of the draft's own, so a new draft is written first.
  it('opens the publish step only once the new draft is written', async () => {
    let created!: (v: unknown) => void;
    vi.mocked(createCardDraft).mockReturnValue(new Promise((r) => (created = r)) as never);
    renderWithIntl(<Writer locale="en" />);
    fireEvent.change(title(), { target: { value: 'A quiet thought' } });
    await userEvent.click(next());
    expect(createCardDraft).toHaveBeenCalledWith(expect.objectContaining({ thoughtCore: 'A quiet thought' }));
    expect(inStep()).toBe(false);
    await act(async () => created({ id: 'draft-1' }));
    await waitFor(() => expect(inStep()).toBe(true));
    expect(screen.getByRole('region', { name: en.write.publishPanel.title })).toBeInTheDocument();
  });

  it('stays to write when that first save fails, and says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(createCardDraft).mockRejectedValue(new Error('offline'));
    renderWithIntl(<Writer locale="en" />);
    fireEvent.change(title(), { target: { value: 'A quiet thought' } });
    await userEvent.click(next());
    expect(await screen.findByRole('alert')).toHaveTextContent(en.native.saveError);
    expect(inStep()).toBe(false);
  });

  it('asks for a title, there, before anything else — and asks the mirror nothing', async () => {
    renderWithIntl(<Writer locale="en" />);
    fireEvent.change(story(), { target: { value: 'A story with no title yet, long enough to read.' } });
    await userEvent.click(next());
    expect(await screen.findByRole('alert')).toHaveTextContent(en.write.titleRequired);
    expect(title()).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(title()).toHaveFocus());
    expect(inStep()).toBe(false);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/cards/insight')).toHaveLength(0);
    // The next keystroke takes the word back.
    fireEvent.change(title(), { target: { value: 'N' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// How the draft is set follows what it is written in — but not under the caret before there is enough.
describe('CardEditor — the story’s type', () => {
  it.each([
    ['en', en, 'latin'],
    ['zh-TW', zhTW, 'cjk'],
  ] as const)('starts an empty %s draft in its own locale’s type', (locale, messages, script) => {
    renderWithIntl(<Writer locale={locale} />, { locale, messages });
    const titleType = () => screen.getByLabelText(messages.write.coreLabel).parentElement!;
    expect(titleType()).toHaveClass('story-title');
    expect(titleType()).toHaveAttribute('data-script', script);
    expect(screen.getByLabelText(messages.write.storyLabel)).toHaveAttribute('data-script', script);
  });

  it('re-sets a draft on the autosave tick once it leans clearly the other way, and names its language', async () => {
    vi.useFakeTimers();
    try {
      renderWithIntl(<Writer locale="en" />);
      fireEvent.change(story(), { target: { value: '第一個早晨' } });
      await act(() => vi.advanceTimersByTimeAsync(2000));
      // Too little to read: an English writer's first Chinese words stay in Latin type.
      expect(story()).toHaveAttribute('data-script', 'latin');
      expect(story()).toHaveAttribute('lang', 'zh-TW');

      fireEvent.change(story(), { target: { value: '那天早上下著小雨，我站在操場邊，看著跑道上的水窪。' } });
      // Never per keystroke.
      expect(story()).toHaveAttribute('data-script', 'latin');
      await act(() => vi.advanceTimersByTimeAsync(2000));
      expect(story()).toHaveAttribute('data-script', 'cjk');
      expect(title()).toHaveAttribute('lang', 'zh-TW');
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens a draft written before in the type of what it says', () => {
    renderWithIntl(
      <Writer locale="en" initial={{ id: 'draft-9', thoughtCore: '跑完那天', story: '那天早上下著小雨，我站在操場邊，看著跑道上的水窪。' }} />,
    );
    expect(story()).toHaveAttribute('data-script', 'cjk');
  });
});

describe('CardEditor — the publish step', () => {
  it('publishes from the step, then takes the step’s place in history with the card', async () => {
    renderWithIntl(<Writer locale="en" />);
    await toPublishStep();
    // The writing step's way forward goes with it: the step's foot has the verb.
    expect(screen.queryByRole('button', { name: en.write.finish })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: en.write.publishPanel.publish }));
    await waitFor(() => expect(publishCard).toHaveBeenCalledWith('draft-1'));
    expect(createCardDraft).toHaveBeenCalledWith(
      expect.objectContaining({ thoughtCore: 'A quiet thought', originalLocale: 'en', anonymous: false, visibility: 'public' }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/card/pub-1'));
    expect(push).not.toHaveBeenCalled();
  });

  // The data-layer rule: what is chosen in the step is the draft's, saved like its words.
  it('autosaves the audience chosen in the step, and keeps it going back to writing', async () => {
    const onStepChange = vi.fn();
    // At the split, where the step has its own way back to writing.
    renderWithIntl(<Writer locale="en" onStepChange={onStepChange} inlineStepHeading />);
    await toPublishStep();
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.draft }));
    await waitFor(() => expect(updateCardDraft).toHaveBeenCalledWith('draft-1', expect.objectContaining({ visibility: 'private' })), {
      timeout: 4000,
    });

    await userEvent.click(screen.getByRole('button', { name: en.write.leaveStay }));
    expect(onStepChange).toHaveBeenLastCalledWith('write');
    await waitFor(() => expect(inStep()).toBe(false));
    await userEvent.click(next());
    await waitFor(() => expect(inStep()).toBe(true));
    expect(screen.getByRole('button', { name: en.write.visibility.draft })).toHaveAttribute('aria-pressed', 'true');
  });

  // An anonymous card is public or private, never for connections only: no write is ever both.
  it('makes a connections draft anonymous and public in one write (匿名公開)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderWithIntl(
        <Writer locale="en" initial={{ id: 'draft-1', thoughtCore: 'Kept close', story: 'For a few.', visibility: 'connections' }} />,
      );
      await userEvent.click(next());
      await waitFor(() => expect(inStep()).toBe(true));
      await userEvent.click(screen.getByRole('button', { name: en.write.visibility.anonymous }));
      await act(() => vi.advanceTimersByTimeAsync(2000));
      const writes = vi.mocked(updateCardDraft).mock.calls.map(([, patch]) => patch);
      expect(writes).toEqual([expect.objectContaining({ anonymous: true, visibility: 'public' })]);
      expect(writes.some((w) => w.anonymous && w.visibility === 'connections')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // A 草稿 is saved, never published: the host's bar, the one button and a failure all say so.
  it('names the step after the card’s type for the host, and says a failed save as one', async () => {
    const onStepTitleChange = vi.fn();
    renderWithIntl(<Writer locale="en" onStepTitleChange={onStepTitleChange} />);
    await toPublishStep();
    expect(onStepTitleChange).toHaveBeenLastCalledWith(en.write.publishPanel.title);
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.draft }));
    expect(onStepTitleChange).toHaveBeenLastCalledWith(en.write.publishPanel.saveTitle);
    // The one button: no way out beside it any more (草稿 is a choice of its own).
    expect(screen.queryByRole('button', { name: en.write.saveDraftAndLeave })).toBeNull();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(updateCardDraft).mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(screen.getByRole('button', { name: en.write.publishPanel.save }));
    expect(await screen.findByRole('alert')).toHaveTextContent(en.write.publishPanel.saveFailed);
    expect(publishCard).not.toHaveBeenCalled();
  });

  it('keeps a 草稿 as a draft with its one button, by the host’s way out — never publishing it', async () => {
    const onLeave = vi.fn();
    renderWithIntl(<Writer locale="en" onLeave={onLeave} />);
    await toPublishStep('Enough for today');
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.draft }));
    await userEvent.click(screen.getByRole('button', { name: en.write.publishPanel.save }));
    await waitFor(() => expect(onLeave).toHaveBeenCalled());
    expect(createCardDraft).toHaveBeenCalledWith(expect.objectContaining({ thoughtCore: 'Enough for today' }));
    expect(updateCardDraft).toHaveBeenLastCalledWith('draft-1', expect.objectContaining({ visibility: 'private' }));
    expect(publishCard).not.toHaveBeenCalled();
  });

  it('leaves back where the writer came from without a host’s way out', async () => {
    renderWithIntl(<Writer locale="en" />);
    await toPublishStep('Enough for today');
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.draft }));
    await userEvent.click(screen.getByRole('button', { name: en.write.publishPanel.save }));
    // A writer opened in a tab of its own has nothing to go back to: the card box, where the draft now is.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/me'));
  });

  describe('a publish that does not go through', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    // The day's publishing is used up: trying again won't help today, so the step says so.
    it('says the day’s limit is reached when the server answers 429', async () => {
      vi.mocked(publishCard).mockRejectedValue(new ApiError(429, 'rate_limited', 'Too many requests.'));
      renderWithIntl(<Writer locale="en" />);
      await toPublishStep();
      await userEvent.click(screen.getByRole('button', { name: en.write.publishPanel.publish }));
      expect(await screen.findByRole('alert')).toHaveTextContent(en.write.publishPanel.rateLimited);
      expect(screen.queryByText('Too many requests.')).not.toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
      expect(inStep()).toBe(true);
    });

    it('says it didn’t publish, in the writer’s words, for any other failure', async () => {
      vi.mocked(publishCard).mockRejectedValue(new ApiError(500, 'internal', 'Something went wrong.'));
      renderWithIntl(<Writer locale="en" />);
      await toPublishStep();
      await userEvent.click(screen.getByRole('button', { name: en.write.publishPanel.publish }));
      expect(await screen.findByRole('alert')).toHaveTextContent(en.write.publishPanel.failed);
      expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
    });
  });
});

// Revising something people can already read is a different job from writing
// a draft: autosave must not push half-written sentences to readers, and the
// save must not re-publish (which would re-date the card).
describe('CardEditor — editing a published card', () => {
  it('buffers autosaved edits privately instead of writing them live', async () => {
    const onSaveStatusChange = vi.fn();
    renderWithIntl(<Writer locale="en" initial={livePost} onSaveStatusChange={onSaveStatusChange} />);
    // Nothing to say before anything is written.
    await waitFor(() => expect(onSaveStatusChange).toHaveBeenCalledWith(null));
    fireEvent.change(story(), { target: { value: 'A rewrite, mid-sentence and not ready for' } });
    await waitFor(
      () => expect(savePendingCardEdit).toHaveBeenCalledWith('card-1', expect.objectContaining({ story: 'A rewrite, mid-sentence and not ready for' })),
      { timeout: 4000 },
    );
    // The live document — the one readers are looking at — stays untouched.
    expect(updateCardDraft).not.toHaveBeenCalled();
    expect(publishCard).not.toHaveBeenCalled();
    // Saved where readers don't see it yet: the bar's 修改已暫存, its time in the tooltip.
    await waitFor(
      () =>
        expect(onSaveStatusChange).toHaveBeenCalledWith(
          expect.objectContaining({ label: en.write.status.savedLive, title: expect.stringContaining(en.write.status.savedLive) }),
        ),
      { timeout: 4000 },
    );
  });

  /** 下一步, then 儲存修改 in 更新這張卡片. */
  async function saveChanges() {
    await userEvent.click(next());
    await screen.findByRole('region', { name: en.write.publishPanel.updateTitle });
    await userEvent.click(screen.getByRole('button', { name: en.write.publishPanel.update }));
  }

  // The server applies what the buffer holds (POST …/edits/apply, as the
  // apps do), so the copy on screen must be in the buffer first — written
  // after any autosave still in flight, and before the apply is asked for.
  it('saves the working copy with the step’s choices, then has the server apply it — without re-publishing', async () => {
    // The write carrying the step's choices is held, to see that the apply waits for it.
    const held: (() => void)[] = [];
    const release = () => held.splice(0).forEach((go) => go());
    vi.mocked(savePendingCardEdit).mockImplementation(async (_id, payload) => {
      if (payload.visibility === 'private') await new Promise<void>((resolve) => held.push(resolve));
    });
    renderWithIntl(<Writer locale="en" initial={livePost} />);
    fireEvent.change(story(), { target: { value: 'The finished rewrite.' } });
    await userEvent.click(next());
    // The same step, in update dress: no mirror moment, and it says plainly what the button is about to do.
    expect(await screen.findByRole('region', { name: en.write.publishPanel.updateTitle })).toBeInTheDocument();
    expect(screen.getByText(en.write.publishPanel.updateHint)).toBeInTheDocument();
    // Anonymous for everyone, then a 草稿: a live card keeps its anonymity while it is private, and the
    // one button says what that does (轉為草稿), the hint about readers gone with them.
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.anonymous }));
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.draft }));
    expect(screen.queryByText(en.write.publishPanel.updateHint)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: en.write.publishPanel.makeDraft }));

    await waitFor(() =>
      expect(savePendingCardEdit).toHaveBeenLastCalledWith(
        'card-1',
        expect.objectContaining({ story: 'The finished rewrite.', visibility: 'private', anonymous: true }),
      ),
    );
    // Not applied until the buffer holds it.
    expect(applyPendingCardEdit).not.toHaveBeenCalled();
    await act(async () => release());

    // A 草稿 now: back where the writer came from (the card box, in a tab of its own), not to its page.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/me'));
    // The id is all it sends: the server reads the buffer, never the browser's say-so.
    expect(applyPendingCardEdit).toHaveBeenCalledTimes(1);
    expect(applyPendingCardEdit).toHaveBeenCalledWith('card-1');
    expect(publishCard).not.toHaveBeenCalled();
    expect(updateCardDraft).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/cards/insight')).toHaveLength(0);
  });

  // Hiding or unnaming a resonance takes it back, which can end the connection with the original's author.
  it('reads again what turns on the viewer’s connections once changes to a resonance are applied', async () => {
    const connected = vi.fn(async () => true);
    function Thread() {
      useSWR('connected:bob_me', connected);
      return null;
    }
    renderWithIntl(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <Thread />
        <Writer locale="en" initial={livePost} referenceCardId="bobs-card" />
      </SWRConfig>,
    );
    await waitFor(() => expect(connected).toHaveBeenCalledTimes(1));
    await saveChanges();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/card/a-quiet-thought'));
    await waitFor(() => expect(connected).toHaveBeenCalledTimes(2));
  });

  it('leaves the viewer’s connections alone when the card answers nothing', async () => {
    const connected = vi.fn(async () => true);
    function Thread() {
      useSWR('connected:bob_me', connected);
      return null;
    }
    renderWithIntl(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <Thread />
        <Writer locale="en" initial={livePost} />
      </SWRConfig>,
    );
    await waitFor(() => expect(connected).toHaveBeenCalledTimes(1));
    await saveChanges();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/card/a-quiet-thought'));
    expect(connected).toHaveBeenCalledTimes(1);
  });

  it('goes to the card where the server says it lives', async () => {
    // Its slug was written after the page that opened the editor was read.
    vi.mocked(applyPendingCardEdit).mockResolvedValue({ id: 'card-1', slug: 'a-later-slug', applied: true });
    renderWithIntl(<Writer locale="en" initial={{ ...livePost, slug: undefined }} />);
    await saveChanges();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/card/a-later-slug'));
  });

  it('keeps the step and the buffered text when the server refuses the revision', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(applyPendingCardEdit).mockRejectedValue(new Error('The edit does not fit a card.'));
    renderWithIntl(<Writer locale="en" initial={livePost} />);
    fireEvent.change(story(), { target: { value: 'A rewrite the server turns down.' } });
    await saveChanges();

    // In the writer's words, never the server's.
    expect(await screen.findByText(en.write.publishPanel.saveFailed)).toBeInTheDocument();
    expect(screen.queryByText('The edit does not fit a card.')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(story()).toHaveValue('A rewrite the server turns down.');
    // The text is in the buffer, so leaving loses nothing — and there is now something to discard.
    expect(savePendingCardEdit).toHaveBeenLastCalledWith('card-1', expect.objectContaining({ story: 'A rewrite the server turns down.' }));
    expect(screen.getByRole('button', { name: en.write.discardChanges })).toBeInTheDocument();
  });

  it('keeps the text when there was nothing left to apply, and writes it again on the way out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Applied or discarded elsewhere between the save and the apply.
    vi.mocked(applyPendingCardEdit).mockResolvedValue({ id: 'card-1', slug: 'a-quiet-thought', applied: false });
    const { unmount } = renderWithIntl(<Writer locale="en" initial={livePost} />);
    fireEvent.change(story(), { target: { value: 'Words that must not vanish.' } });
    await saveChanges();

    expect(await screen.findByText(en.write.publishPanel.saveFailed)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    const saves = vi.mocked(savePendingCardEdit).mock.calls.length;
    unmount();
    await waitFor(() => expect(savePendingCardEdit).toHaveBeenCalledTimes(saves + 1));
    expect(savePendingCardEdit).toHaveBeenLastCalledWith('card-1', expect.objectContaining({ story: 'Words that must not vanish.' }));
  });

  it('asks for a title, back on the writing step, instead of sending an untitled revision', async () => {
    renderWithIntl(<Writer locale="en" initial={livePost} />);
    fireEvent.change(title(), { target: { value: '  ' } });
    await userEvent.click(next());
    expect(await screen.findByText(en.write.titleRequired)).toBeInTheDocument();
    expect(applyPendingCardEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: en.write.publishPanel.updateTitle })).toBeNull();
  });

  it('discards a buffered revision from the step and returns to the untouched card', async () => {
    renderWithIntl(<Writer locale="en" initial={{ ...livePost, hasPendingEdit: true }} />);
    await userEvent.click(next());
    await userEvent.click(await screen.findByRole('button', { name: en.write.discardChanges }));
    await waitFor(() => expect(discardPendingCardEdit).toHaveBeenCalledWith('card-1'));
    expect(updateCardDraft).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/card/a-quiet-thought');
  });

  it('offers nothing to discard when there is no revision', async () => {
    renderWithIntl(<Writer locale="en" initial={livePost} />);
    await userEvent.click(next());
    await screen.findByRole('region', { name: en.write.publishPanel.updateTitle });
    expect(screen.queryByRole('button', { name: en.write.discardChanges })).not.toBeInTheDocument();
  });

  // A hidden resonance made public and named by this save reaches its original: the step says so.
  it('says a live resonance will reach its original when the save makes it public and named', async () => {
    renderWithIntl(
      <Writer
        locale="en"
        referenceCardId="bobs-card"
        initial={{ ...livePost, visibility: 'private', live: { visibility: 'private', anonymous: false } }}
      />,
    );
    await userEvent.click(next());
    // A card kept private is a 草稿 to its author: its step saves it, or publishes it.
    await screen.findByRole('region', { name: en.write.publishPanel.saveTitle });
    expect(screen.getByRole('button', { name: en.write.publishPanel.save })).toBeInTheDocument();
    expect(screen.queryByText(en.write.publishPanel.resonanceReaches)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.public }));
    expect(screen.getByText(en.write.publishPanel.resonanceReaches)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: en.write.publishPanel.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.write.publishPanel.publish })).toBeInTheDocument();
  });

  it('publishes a 草稿 that was kept private through its pending edit, then opens its page', async () => {
    vi.mocked(applyPendingCardEdit).mockResolvedValue({ id: 'card-1', slug: 'a-quiet-thought', applied: true });
    renderWithIntl(<Writer locale="en" initial={{ ...livePost, visibility: 'private', live: { visibility: 'private', anonymous: false } }} />);
    await userEvent.click(next());
    await userEvent.click(await screen.findByRole('button', { name: en.write.visibility.public }));
    await userEvent.click(screen.getByRole('button', { name: en.write.publishPanel.publish }));
    await waitFor(() => expect(applyPendingCardEdit).toHaveBeenCalledWith('card-1'));
    expect(savePendingCardEdit).toHaveBeenLastCalledWith('card-1', expect.objectContaining({ visibility: 'public', anonymous: false }));
    expect(publishCard).not.toHaveBeenCalled();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/card/a-quiet-thought'));
  });
});

// A card moved to the trash in another tab while it is open here (trash.spec §5.5).
describe('CardEditor — a card trashed elsewhere', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  const refused = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  const trashedCard = { id: 'draft-9', authorId: 'me', thoughtCore: 'Kept for later', trashedAt: new Date() };

  it('says so when 下一步’s save is refused, keeps the words, and holds the way forward', async () => {
    vi.mocked(updateCardDraft).mockRejectedValue(refused());
    vi.mocked(getCardById).mockResolvedValue(trashedCard as never);
    renderWithIntl(<Writer locale="en" initial={{ id: 'draft-9', thoughtCore: 'Kept for later' }} />);
    fireEvent.change(story(), { target: { value: 'Words typed after it went.' } });
    await userEvent.click(next());

    expect(await screen.findByText(en.write.trashed.status)).toBeInTheDocument();
    expect(getCardById).toHaveBeenCalledWith('draft-9');
    expect(inStep()).toBe(false);
    expect(story()).toHaveValue('Words typed after it went.');
    expect(screen.queryByRole('button', { name: en.write.finish })).toBeNull();

    // 還原: out of the trash, and what was typed is written at once.
    vi.mocked(updateCardDraft).mockResolvedValue({ id: 'draft-9' } as never);
    await userEvent.click(screen.getByRole('button', { name: en.me.actions.restore }));
    await waitFor(() => expect(restoreTrashedCard).toHaveBeenCalledWith('draft-9'));
    await waitFor(() =>
      expect(updateCardDraft).toHaveBeenLastCalledWith('draft-9', expect.objectContaining({ story: 'Words typed after it went.' })),
    );
    expect(screen.queryByText(en.write.trashed.status)).toBeNull();
    expect(next()).toBeEnabled();
  });

  it('goes back to writing and says so when publishing meets the trash', async () => {
    vi.mocked(publishCard).mockRejectedValue(new ApiError(409, 'conflict', 'This card is in the trash.'));
    vi.mocked(getCardById).mockResolvedValue(trashedCard as never);
    const onStepChange = vi.fn();
    renderWithIntl(<Writer locale="en" initial={{ id: 'draft-9', thoughtCore: 'Kept for later' }} onStepChange={onStepChange} />);
    await userEvent.click(next());
    await waitFor(() => expect(inStep()).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: en.write.publishPanel.publish }));

    expect(await screen.findByText(en.write.trashed.status)).toBeInTheDocument();
    expect(onStepChange).toHaveBeenLastCalledWith('write');
    expect(inStep()).toBe(false);
    // Not the generic "couldn't publish".
    expect(screen.queryByText(en.write.publishPanel.failed)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('keeps an ordinary refusal an ordinary one', async () => {
    vi.mocked(publishCard).mockRejectedValue(new ApiError(500, 'internal', 'Something went wrong.'));
    renderWithIntl(<Writer locale="en" initial={{ id: 'draft-9', thoughtCore: 'Kept for later' }} />);
    await userEvent.click(next());
    await waitFor(() => expect(inStep()).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: en.write.publishPanel.publish }));
    expect(await screen.findByRole('alert')).toHaveTextContent(en.write.publishPanel.failed);
    expect(getCardById).not.toHaveBeenCalled();
  });
});

describe('CardEditor — autosave', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates the draft after an editing pause, then updates it in place', async () => {
    vi.useFakeTimers();
    renderWithIntl(<Writer locale="en" />);
    fireEvent.change(title(), { target: { value: 'Autosaved thought' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(createCardDraft).toHaveBeenCalledTimes(1);
    expect(createCardDraft).toHaveBeenCalledWith(expect.objectContaining({ thoughtCore: 'Autosaved thought', originalLocale: 'en' }));

    // Further edits update the just-created document — no second create.
    fireEvent.change(story(), { target: { value: 'and then some words' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(updateCardDraft).toHaveBeenCalledWith('draft-1', expect.objectContaining({ story: 'and then some words' }));
    expect(createCardDraft).toHaveBeenCalledTimes(1);
  });

  it('never creates a document for an empty draft', async () => {
    vi.useFakeTimers();
    const { unmount } = renderWithIntl(<Writer locale="en" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    unmount();
    expect(createCardDraft).not.toHaveBeenCalled();
  });

  it('flushes pending edits when the editor unmounts (leaving is safe)', async () => {
    const { unmount } = renderWithIntl(<Writer locale="en" />);
    fireEvent.change(title(), { target: { value: 'Backed out right away' } });
    // Unmount before the debounce elapses — the flush must still persist.
    unmount();
    await waitFor(() => expect(createCardDraft).toHaveBeenCalledWith(expect.objectContaining({ thoughtCore: 'Backed out right away' })));
  });

  it('tells the writer their draft is safe, up where they can see it', async () => {
    const onSaveStatusChange = vi.fn();
    renderWithIntl(<Writer locale="en" onSaveStatusChange={onSaveStatusChange} />);
    // Before anything is saved there is nothing to say.
    await waitFor(() => expect(onSaveStatusChange).toHaveBeenCalledWith(null));
    fireEvent.change(title(), { target: { value: 'Something worth keeping' } });
    // The debounce is deliberately longer than waitFor's default window.
    await waitFor(() => expect(onSaveStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ label: en.write.status.saved })), {
      timeout: 4000,
    });
  });

  it('says 儲存中⋯ only for a write that runs long, 未儲存 when one fails, and 已儲存 once one goes through', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSaveStatusChange = vi.fn();
    let finish: (() => void) | null = null;
    vi.mocked(createCardDraft).mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({ id: 'draft-1' } as never))),
    );
    vi.mocked(updateCardDraft).mockRejectedValueOnce(new Error('offline'));
    const editor = createRef<CardEditorHandle>();
    renderWithIntl(<Writer locale="en" editorRef={editor} onSaveStatusChange={onSaveStatusChange} />);
    fireEvent.change(title(), { target: { value: 'Slow to keep' } });
    const first = editor.current!.saveNow();
    await waitFor(() => expect(onSaveStatusChange).toHaveBeenLastCalledWith({ label: en.write.status.saving }));
    act(() => finish!());
    await first;
    await waitFor(() => expect(onSaveStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ label: en.write.status.saved })));
    fireEvent.change(title(), { target: { value: 'Slow to keep, then offline' } });
    await expect(editor.current!.saveNow()).rejects.toThrow('offline');
    await waitFor(() => expect(onSaveStatusChange).toHaveBeenLastCalledWith({ label: en.write.status.failed, failed: true }));
    await act(() => editor.current!.saveNow());
    await waitFor(() => expect(onSaveStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ label: en.write.status.saved })));
  });
});

// The writer's back arrow asks before leaving written work (the apps'
// holdsWork, rule for rule) and saves it first rather than leaving it to
// the debounce.
describe('CardEditor — what leaving would leave behind', () => {
  it('holds nothing while a new card is blank, and work once something is written', async () => {
    const editor = createRef<CardEditorHandle>();
    renderWithIntl(<Writer locale="en" editorRef={editor} />);
    expect(editor.current!.hasWork()).toBe(false);
    fireEvent.change(title(), { target: { value: 'Half a thought' } });
    expect(editor.current!.hasWork()).toBe(true);
    // Kept now, and still asked about: it is a draft with words in it.
    await act(() => editor.current!.saveNow());
    expect(editor.current!.hasWork()).toBe(true);
  });

  // A note grown into a resonance: its words are the writer's own, kept like anything typed.
  it('keeps the words a note brought along, as writing', async () => {
    const editor = createRef<CardEditorHandle>();
    renderWithIntl(<Writer locale="en" editorRef={editor} referenceCardId="c1" seedStory="A note I wanted to say more about." />);
    expect(story()).toHaveValue('A note I wanted to say more about.');
    expect(editor.current!.hasWork()).toBe(true);
    await act(() => editor.current!.saveNow());
    expect(createCardDraft).toHaveBeenCalledWith(
      expect.objectContaining({ story: 'A note I wanted to say more about.', referenceCardId: 'c1' }),
    );
  });

  // The first-card guide's question is the starting point, not writing:
  // nothing keeps it until the writer adds to it.
  it('does not count words the first-card guide seeded', async () => {
    const editor = createRef<CardEditorHandle>();
    renderWithIntl(<Writer locale="en" editorRef={editor} initial={{ story: '> What changed?\n\n' }} />);
    expect(editor.current!.hasWork()).toBe(false);
    fireEvent.change(story(), { target: { value: '> What changed?\n\nThe light did.' } });
    expect(editor.current!.hasWork()).toBe(true);
    await act(() => editor.current!.saveNow());
  });

  it('holds a kept draft with words in it, even untouched — but not an empty one', () => {
    const kept = createRef<CardEditorHandle>();
    const { unmount } = renderWithIntl(<Writer locale="en" editorRef={kept} initial={{ id: 'draft-9', thoughtCore: 'Kept for later' }} />);
    expect(kept.current!.hasWork()).toBe(true);
    unmount();
    const empty = createRef<CardEditorHandle>();
    renderWithIntl(<Writer locale="en" editorRef={empty} initial={{ id: 'draft-9' }} />);
    expect(empty.current!.hasWork()).toBe(false);
  });

  it("holds a live card's revision, buffered or typed, and nothing when it is untouched", () => {
    const untouched = createRef<CardEditorHandle>();
    const { unmount } = renderWithIntl(<Writer locale="en" editorRef={untouched} initial={livePost} />);
    expect(untouched.current!.hasWork()).toBe(false);
    fireEvent.change(story(), { target: { value: 'A second look.' } });
    expect(untouched.current!.hasWork()).toBe(true);
    unmount();
    const buffered = createRef<CardEditorHandle>();
    renderWithIntl(<Writer locale="en" editorRef={buffered} initial={{ ...livePost, hasPendingEdit: true }} />);
    expect(buffered.current!.hasWork()).toBe(true);
  });

  // The writer's map knows the draft's own card by it: a fresh draft's id is the one its first save made.
  it('names the card it writes: the one it was opened on, or the draft its first save made', async () => {
    const opened = createRef<CardEditorHandle>();
    const { unmount } = renderWithIntl(<Writer locale="en" editorRef={opened} initial={{ id: 'draft-9' }} />);
    expect(opened.current!.cardId()).toBe('draft-9');
    unmount();
    const fresh = createRef<CardEditorHandle>();
    renderWithIntl(<Writer locale="en" editorRef={fresh} />);
    expect(fresh.current!.cardId()).toBeUndefined();
    fireEvent.change(title(), { target: { value: 'Before I go' } });
    await act(() => fresh.current!.saveNow());
    expect(fresh.current!.cardId()).toBe('draft-1');
  });

  it('writes what is not saved yet when asked, and nothing when it is', async () => {
    const editor = createRef<CardEditorHandle>();
    renderWithIntl(<Writer locale="en" editorRef={editor} />);
    await act(() => editor.current!.saveNow());
    expect(createCardDraft).not.toHaveBeenCalled();
    fireEvent.change(title(), { target: { value: 'Before I go' } });
    await act(() => editor.current!.saveNow());
    expect(createCardDraft).toHaveBeenCalledTimes(1);
    expect(createCardDraft).toHaveBeenCalledWith(expect.objectContaining({ thoughtCore: 'Before I go' }));
    await act(() => editor.current!.saveNow());
    expect(createCardDraft).toHaveBeenCalledTimes(1);
    expect(updateCardDraft).not.toHaveBeenCalled();
  });

  // The bar's back from the publish step returns to writing; while writing it is the page's way out.
  it('steps back from the publish step, and only from there', async () => {
    const editor = createRef<CardEditorHandle>();
    renderWithIntl(<Writer locale="en" editorRef={editor} />);
    expect(editor.current!.stepBack()).toBe(false);
    await toPublishStep();
    act(() => void editor.current!.stepBack());
    await waitFor(() => expect(inStep()).toBe(false));
    expect(next()).toBeInTheDocument();
  });
});
