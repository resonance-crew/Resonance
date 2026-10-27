// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode, useState } from 'react';
import { act, fireEvent, renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import en from '@/messages/en.json';
import type { CardMedia, Visibility } from '@/lib/db/types';
import { PublishStep, type PublishStepProps, type PublishStepValues } from './PublishStep';
import { cardVar, previewPalette } from '@/lib/design/cardColours';
import { CARD_HUES } from '@/lib/design/dominantHue';

vi.mock('@/lib/data/hooks', () => ({
  useMyProfile: () => ({ data: { id: 'me', handle: 'my-handle', initials: 'MH', accentColor: 'oklch(88% 0.08 55)' } }),
}));
vi.mock('@/lib/images/upload', () => ({
  UnsupportedImage: class extends Error {},
  uploadImageFile: vi.fn(),
}));
vi.mock('@/lib/images/accentHue', () => ({ extractAccentHue: vi.fn(async () => 140) }));

import { uploadImageFile } from '@/lib/images/upload';

const draft: PublishStepValues = {
  thoughtCore: 'A quiet thought',
  story: 'A story long enough to read.',
  tags: [],
  visibility: 'public',
  anonymous: false,
  accentHue: null,
};

/**
 * The step as the editor holds it: its values live in the editor, the step
 * changes them through its callbacks (one change for the audience).
 */
function Step(
  props: Partial<PublishStepProps> & {
    start?: Partial<PublishStepValues>;
    /** What the writer changed in the story meanwhile (laid over the step's values as it renders). */
    edited?: Partial<PublishStepValues>;
    onAudience?: (v: { visibility: Visibility; anonymous: boolean }) => void;
  },
) {
  const { start, edited, onAudience, ...rest } = props;
  const [held, setValues] = useState<PublishStepValues>({ ...draft, ...start });
  const values = { ...held, ...edited };
  return (
    <PublishStep
      mode="publish"
      active
      inlineHeading={false}
      values={values}
      onTagsChange={(next) => setValues((v) => ({ ...v, tags: typeof next === 'function' ? next(v.tags) : next }))}
      onAudienceChange={(next) => {
        onAudience?.(next);
        setValues((v) => ({ ...v, ...next }));
      }}
      onCoverChange={(media?: CardMedia, accentHue: number | null = null) => setValues((v) => ({ ...v, media, accentHue }))}
      resonance={false}
      storyBusy={false}
      pending={false}
      busyVerb="publish"
      error={null}
      onSubmit={vi.fn()}
      onSecondary={vi.fn()}
      showSecondary
      {...rest}
    />
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  // The mirror-moment echo is a grace note; the step must not wait for it.
  fetchMock = vi.fn().mockResolvedValue({ ok: false });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const insightCalls = () => fetchMock.mock.calls.filter(([url]) => url === '/api/cards/insight');
/** The mirror moment has come back (here: without an echo), so nothing is left to update the step. */
const echoSettled = () =>
  waitFor(() => expect(screen.queryByText(en.write.publishPanel.insightLoading)).not.toBeInTheDocument());

describe('PublishStep', () => {
  // One button (草稿 is a choice of its own now): only a live card's revision has a way out beside it.
  it('has one solid button, and 捨棄修改 tonal before it only for a live card’s revision', async () => {
    const onSubmit = vi.fn();
    const onSecondary = vi.fn();
    const view = renderWithIntl(<Step onSubmit={onSubmit} onSecondary={onSecondary} />);
    const publish = screen.getByRole('button', { name: en.write.publishPanel.publish });
    expect(publish).toHaveAttribute('data-variant', 'solid');
    expect(Array.from(publish.parentElement!.children)).toEqual([publish]);
    expect(screen.queryByRole('button', { name: en.write.saveDraftAndLeave })).toBeNull();
    await userEvent.click(publish);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await echoSettled();
    view.unmount();

    renderWithIntl(<Step mode="update" liveVisibility="public" onSecondary={onSecondary} />);
    const update = screen.getByRole('button', { name: en.write.publishPanel.update });
    const discard = screen.getByRole('button', { name: en.write.discardChanges });
    expect(discard).toHaveAttribute('data-variant', 'tonal');
    expect(Array.from(update.parentElement!.children)).toEqual([discard, update]);
    await userEvent.click(discard);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  // The mirror is a grace note, asked once per text: coming back to the step with the same words reuses it.
  it('asks the mirror once per text, and again only for new words', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ coreInsight: 'Small kindnesses add up' }) });
    const view = renderWithIntl(<Step />);
    expect(await screen.findByText(/Small kindnesses add up/)).toBeInTheDocument();
    expect(insightCalls()).toHaveLength(1);

    view.rerender(<Step active={false} />);
    view.rerender(<Step />);
    expect(await screen.findByText(/Small kindnesses add up/)).toBeInTheDocument();
    expect(insightCalls()).toHaveLength(1);

    // Back to writing, a sentence changed, back to the step.
    view.rerender(<Step active={false} edited={{ story: 'A different story now.' }} />);
    view.rerender(<Step edited={{ story: 'A different story now.' }} />);
    await waitFor(() => expect(insightCalls()).toHaveLength(2));
    expect(JSON.parse(insightCalls()[1][1].body)).toEqual({ thoughtCore: 'A quiet thought', story: 'A different story now.' });
  });

  it('never asks the mirror for an update, or for a card with no title', async () => {
    const view = renderWithIntl(<Step mode="update" liveVisibility="public" />);
    expect(screen.getByText(en.write.publishPanel.updateHint)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.write.publishPanel.update })).toHaveAttribute('data-variant', 'solid');
    // Made a 草稿, the card will have no readers to see the new version: nothing to say about them, and
    // the one button says what it does.
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.draft }));
    expect(screen.queryByText(en.write.publishPanel.updateHint)).toBeNull();
    expect(screen.getByRole('button', { name: en.write.publishPanel.makeDraft })).toBeInTheDocument();
    view.unmount();
    renderWithIntl(<Step start={{ thoughtCore: '  ' }} />);
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(insightCalls()).toHaveLength(0);
  });

  // On a phone the preview is the feed's band: right under the bar it draws no rule of its own — the bar's
  // pen line is its edge, as the feed's first card's is — and keeps it while something sits above it.
  it('meets the bar as the feed’s first card does when nothing sits above the preview', async () => {
    const preview = () => screen.getByRole('group', { name: en.write.previewCaption });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ coreInsight: 'Small kindnesses add up' }) });
    const view = renderWithIntl(<Step />);
    // The mirror on its way, then its line: above the preview, which keeps its rule.
    expect(preview()).not.toHaveAttribute('data-first');
    expect(await screen.findByText(/Small kindnesses add up/)).toBeInTheDocument();
    expect(preview()).not.toHaveAttribute('data-first');
    view.unmount();

    // Nothing to reflect: the line folds away and the band is first under the bar.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ coreInsight: null }) });
    const quiet = renderWithIntl(<Step />);
    await echoSettled();
    await waitFor(() => expect(preview()).toHaveAttribute('data-first'));
    quiet.unmount();

    // A live card's step says what saving does first.
    renderWithIntl(<Step mode="update" liveVisibility="public" />);
    expect(preview()).not.toHaveAttribute('data-first');
  });

  it('shows the mirror when React mounts the step twice (dev), not a loading line for good', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ coreInsight: 'Small kindnesses add up' }) });
    renderWithIntl(
      <StrictMode>
        <Step />
      </StrictMode>,
    );
    expect(await screen.findByText(/Small kindnesses add up/)).toBeInTheDocument();
    expect(screen.queryByText(en.write.publishPanel.insightLoading)).not.toBeInTheDocument();
  });

  // Anonymity is only a question for a card others read: one choice of three, never a switch beside them.
  it('offers three audiences — a card kept for connections shows none chosen, and 匿名公開 makes it public and anonymous in one change', async () => {
    const onAudience = vi.fn();
    renderWithIntl(<Step start={{ visibility: 'connections' }} onAudience={onAudience} />);
    const segment = (name: string) => screen.getByRole('button', { name });
    for (const name of [en.write.visibility.public, en.write.visibility.anonymous, en.write.visibility.draft]) {
      expect(segment(name)).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getByText(en.write.visibility.label)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();

    await userEvent.click(segment(en.write.visibility.anonymous));
    expect(onAudience).toHaveBeenCalledTimes(1);
    expect(onAudience).toHaveBeenLastCalledWith({ visibility: 'public', anonymous: true });
    expect(segment(en.write.visibility.anonymous)).toHaveAttribute('aria-pressed', 'true');
    // No line under the choice: the preview's byline says it.
    expect(screen.queryByText(en.write.visibility.anonymousLine)).toBeNull();
    // The preview's byline is the world's; the old notes are gone.
    expect(within(screen.getByRole('group', { name: en.write.previewCaption })).getByText(en.write.publishPanel.anonymousName)).toBeInTheDocument();
    expect(screen.queryByText(en.write.publishPanel.anonymousVisibility)).toBeNull();
    await echoSettled();
  });

  it('names the verb and the step after the card’s type, with no line under the choice', async () => {
    const onAudience = vi.fn();
    renderWithIntl(<Step inlineHeading onAudience={onAudience} />);
    const pub = screen.getByRole('button', { name: en.write.visibility.public });
    expect(pub).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(en.write.visibility.publicLine.replace('{handle}', 'my-handle'))).toBeNull();
    expect(screen.getByRole('button', { name: en.write.publishPanel.publish })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: en.write.publishPanel.title })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.anonymous }));
    expect(screen.getByRole('button', { name: en.write.publishPanel.publishAnonymously })).toBeInTheDocument();

    const mine = screen.getByRole('button', { name: en.write.visibility.draft });
    await userEvent.click(mine);
    expect(onAudience).toHaveBeenLastCalledWith({ visibility: 'private', anonymous: false });
    expect(mine).toHaveAttribute('aria-pressed', 'true');
    // A 草稿: nothing is published — it is saved.
    expect(screen.getByRole('button', { name: en.write.publishPanel.save })).toHaveAttribute('data-variant', 'solid');
    expect(screen.queryByRole('button', { name: en.write.publishPanel.publish })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: en.write.publishPanel.saveTitle })).toBeInTheDocument();
    await echoSettled();
  });

  // 只有自己 names a draft; a live anonymous card kept to its author stays anonymous for when it is shown again.
  it('keeps a live card anonymous when it is kept to its author, and names a draft', async () => {
    const onAudience = vi.fn();
    const view = renderWithIntl(<Step mode="update" liveVisibility="public" start={{ anonymous: true }} onAudience={onAudience} />);
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.draft }));
    expect(onAudience).toHaveBeenLastCalledWith({ visibility: 'private', anonymous: true });
    view.unmount();

    renderWithIntl(<Step start={{ anonymous: true }} onAudience={onAudience} />);
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.draft }));
    expect(onAudience).toHaveBeenLastCalledWith({ visibility: 'private', anonymous: false });
    await echoSettled();
  });

  // A published card kept private is a 草稿 to its author: 儲存草稿, or 發布 by choosing to share it.
  it('saves or publishes a card readers don’t have, and turns one they have into a 草稿', async () => {
    const view = renderWithIntl(<Step mode="update" liveVisibility="private" start={{ visibility: 'private' }} />);
    expect(screen.getByRole('region', { name: en.write.publishPanel.saveTitle })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.write.publishPanel.save })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.anonymous }));
    expect(screen.getByRole('region', { name: en.write.publishPanel.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.write.publishPanel.publishAnonymously })).toBeInTheDocument();
    view.unmount();

    renderWithIntl(<Step mode="update" liveVisibility="public" />);
    expect(screen.getByRole('region', { name: en.write.publishPanel.updateTitle })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.draft }));
    expect(screen.getByRole('region', { name: en.write.publishPanel.updateTitle })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.write.publishPanel.makeDraft })).toBeInTheDocument();
  });

  // Whether a resonance reaches the card it answers is said where the choice is made.
  it('says whether a resonance tells its original’s author, following the choice', async () => {
    renderWithIntl(<Step resonance />);
    expect(screen.getByText(en.write.publishPanel.resonanceReaches)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.draft }));
    expect(screen.getByText(en.write.publishPanel.resonanceQuiet)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.anonymous }));
    expect(screen.getByText(en.write.publishPanel.resonanceQuiet)).toBeInTheDocument();
    await echoSettled();
  });

  // A live resonance made public and named by this save reaches its original after it (PATCH's becameReachable).
  it('says so for a live resonance only when the save makes a hidden one public and named', async () => {
    const view = renderWithIntl(<Step mode="update" liveVisibility="private" resonance liveReaches={false} start={{ visibility: 'private' }} />);
    expect(screen.queryByText(en.write.publishPanel.resonanceReaches)).toBeNull();
    expect(screen.queryByText(en.write.publishPanel.resonanceQuiet)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.public }));
    expect(screen.getByText(en.write.publishPanel.resonanceReaches)).toBeInTheDocument();
    view.unmount();

    renderWithIntl(<Step mode="update" liveVisibility="public" resonance liveReaches />);
    expect(screen.queryByText(en.write.publishPanel.resonanceReaches)).toBeNull();
  });

  it('holds the verb while a picture is on its way, and says why', async () => {
    const onSubmit = vi.fn();
    renderWithIntl(<Step storyBusy onSubmit={onSubmit} />);
    expect(screen.getByText(en.write.mediaBusyHint)).toBeInTheDocument();
    const publish = screen.getByRole('button', { name: en.write.publishPanel.publish });
    expect(publish).toBeDisabled();
    await userEvent.click(publish);
    expect(onSubmit).not.toHaveBeenCalled();
    await echoSettled();
  });

  it('holds the verb while the cover uploads, then shows it in the card', async () => {
    let land!: (v: { publicUrl: string; key: string }) => void;
    vi.mocked(uploadImageFile).mockReturnValue(new Promise((r) => (land = r)));
    const { container } = renderWithIntl(<Step />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['x'], 'rain.webp', { type: 'image/webp' })] } });
    expect(await screen.findByText(en.write.mediaBusyHint)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.write.publishPanel.publish })).toBeDisabled();
    await act(async () => land({ publicUrl: 'https://img.example.com/rain.webp', key: 'cover/2026-10/rain.webp' }));
    await waitFor(() => expect(screen.queryByText(en.write.mediaBusyHint)).toBeNull());
    expect(container.querySelector('img[src="https://img.example.com/rain.webp"]')).toBeInTheDocument();
    // The picture is where it is changed: one chip on it that says so, and nothing for it under the preview.
    const chip = screen.getByRole('button', { name: en.write.coverChange });
    expect(chip).toHaveTextContent(en.write.coverChange);
    expect(screen.queryByRole('button', { name: en.write.mediaReplace })).toBeNull();
    expect(screen.queryByRole('button', { name: en.write.mediaRemove })).toBeNull();
    await userEvent.click(chip);
    expect(screen.getByRole('menuitem', { name: en.write.mediaReplace })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: en.write.mediaGenerate })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: en.write.mediaRemove }));
    expect(container.querySelector('img[src="https://img.example.com/rain.webp"]')).toBeNull();
    expect(screen.getByRole('button', { name: en.write.mediaPlaceholder })).toBeInTheDocument();
  });

  // Said where the picture is (round 8 §3): under the empty picture's pills, or on a chip over the cover that stays.
  it('says a failed upload in the picture — under its pills, or on a chip over the cover it keeps', async () => {
    vi.mocked(uploadImageFile).mockRejectedValue(new Error('offline'));
    const view = renderWithIntl(<Step />);
    const pick = () => view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(pick(), { target: { files: [new File(['x'], 'rain.webp', { type: 'image/webp' })] } });
    const empty = await screen.findByRole('alert');
    expect(empty).toHaveTextContent(en.write.mediaUploadError);
    // Nothing under the preview any more: the message is inside the card's picture.
    expect(within(screen.getByRole('group', { name: en.write.previewCaption })).getByRole('alert')).toBe(empty);
    view.unmount();

    const cover: CardMedia = { type: 'image', url: 'https://img.example.com/old.webp', label: 'old' };
    const withCover = renderWithIntl(<Step start={{ media: cover }} />);
    fireEvent.change(withCover.container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['x'], 'next.webp', { type: 'image/webp' })] },
    });
    const chip = await screen.findByRole('alert');
    expect(chip).toHaveTextContent(en.write.mediaUploadError);
    expect(withCover.container.querySelector('img[src="https://img.example.com/old.webp"]')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: en.write.previewCaption })).getByRole('alert')).toBe(chip);
    await echoSettled();
  });

  /** A colour as the browser writes it back (jsdom normalises oklch's percentages). */
  const asColor = (c: string) => {
    const el = document.createElement('i');
    el.style.color = c;
    return el.style.color;
  };

  // Round 9 §8: the cover's controls wear the card's own colours — a coverless card's family from its id, not the
  // first family on every card — the pills the family's deep pen with its paper for words, never faded.
  it('colours the cover’s pills by the card’s family — from its id while it has no cover', async () => {
    const pills = () => [en.write.mediaPlaceholder, en.write.mediaGenerate].map((name) => screen.getByRole('button', { name }));
    const familyOf = (id: string) => previewPalette(null, id);
    const ids = ['card-a', 'card-b', 'card-c', 'card-d'];
    const id = ids.find((x) => familyOf(x) !== 0)!;
    const f = familyOf(id);
    const view = renderWithIntl(<Step cardId={id} />);
    for (const pill of pills()) {
      // The family's palette tokens, which the scheme draws (in dark the deep pen is the bright one).
      expect(pill.style.getPropertyValue('--shape-fill')).toBe(cardVar('pill', f));
      expect(pill.style.color).toBe(asColor(cardVar('pill-ink', f)));
    }
    view.unmount();

    // Waiting for a story: the family's tonal step, muted words — the face never faded.
    renderWithIntl(<Step cardId={id} start={{ story: '' }} />);
    const resting = screen.getByRole('button', { name: en.write.mediaGenerate });
    expect(resting).toBeDisabled();
    expect(resting.style.getPropertyValue('--shape-fill')).toBe(cardVar('accent', f));
    await echoSettled();
  });

  it('dresses 更換封面 in its cover’s family: its fill, its pen line, its deep ink', async () => {
    const cover: CardMedia = { type: 'image', url: 'https://img.example.com/green.webp', label: 'green' };
    renderWithIntl(<Step cardId="card-a" start={{ media: cover, accentHue: 140 }} />);
    const chip = screen.getByRole('button', { name: en.write.coverChange });
    const f = CARD_HUES.indexOf(140);
    expect(chip.style.color).toBe(asColor(cardVar('border-deep', f)));
    expect(chip).toHaveAttribute('data-colored');
    await echoSettled();
  });

  // 2026-10-26: the loader wore the theme's terracotta on every card, said 正在描繪中 while a file went up, and
  // a cover being replaced stayed sharp under it — the veil was only for the model's rough pass, and stopped at
  // the box while the picture's wobble reaches past it.
  it('says a cover is on its way in the card’s deep ink, over the cover it replaces veiled to its outline', async () => {
    vi.mocked(uploadImageFile).mockReturnValue(new Promise(() => {}));
    const cover: CardMedia = { type: 'image', url: 'https://img.example.com/green.webp', label: 'green' };
    const view = renderWithIntl(<Step cardId="card-a" start={{ media: cover, accentHue: 140 }} />);
    fireEvent.change(view.container.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['x'], 'next.webp', { type: 'image/webp' })] },
    });
    const loader = await screen.findByRole('status', { name: en.write.mediaUploading });
    expect(en.write.mediaUploading).toBe('Uploading the picture…');
    const deep = cardVar('border-deep', CARD_HUES.indexOf(140));
    for (const path of loader.querySelectorAll('path')) expect(path).toHaveAttribute('stroke', deep);
    const busy = screen.getByText(en.write.mediaUploading).parentElement!;
    expect(busy).toHaveAttribute('data-veiled');
    expect(busy.style.getPropertyValue('--cover-ink')).toBe(deep);
    // The cover it replaces stays under the veil, which reaches as far as the picture does: the picture's box says
    // how far (OrganicImage's bleed — 0 here, where nothing is measured; the wobble's swing in a browser).
    const old = view.container.querySelector('img[src="https://img.example.com/green.webp"]')!;
    expect(old).toBeInTheDocument();
    const box = busy.closest<HTMLElement>('[style*="--image-bleed"]')!;
    expect(box).toContainElement(old as HTMLElement);
    expect(box.style.getPropertyValue('--image-bleed')).toMatch(/^\d+px$/);
    view.unmount();

    // No cover yet: the loader over the card's stripes, nothing to veil.
    renderWithIntl(<Step cardId="card-a" />);
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['x'], 'first.webp', { type: 'image/webp' })] },
    });
    await screen.findByRole('status', { name: en.write.mediaUploading });
    expect(screen.getByText(en.write.mediaUploading).parentElement).not.toHaveAttribute('data-veiled');
    await echoSettled();
  });

  it('waits for a story before it offers to draw a cover', async () => {
    renderWithIntl(<Step start={{ story: '' }} />);
    expect(screen.getByRole('button', { name: en.write.mediaGenerate })).toBeDisabled();
    expect(screen.getByText(en.write.mediaGenerateNeedStory)).toBeInTheDocument();
    await echoSettled();
  });

  // Why it didn't go through is read before the buttons that try again.
  it('says a failed publish above the foot, and rests while publishing', async () => {
    const onSubmit = vi.fn();
    const view = renderWithIntl(<Step error={en.write.publishPanel.rateLimited} onSubmit={onSubmit} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(en.write.publishPanel.rateLimited);
    const publish = screen.getByRole('button', { name: en.write.publishPanel.publish });
    expect(alert.compareDocumentPosition(publish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    view.rerender(<Step pending onSubmit={onSubmit} />);
    expect(screen.getByRole('button', { name: en.write.publishPanel.publish })).toHaveAttribute('aria-busy', 'true');
    // Every choice holds still.
    expect(screen.getByRole('button', { name: en.write.visibility.anonymous })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: en.write.publishPanel.publish }));
    expect(onSubmit).not.toHaveBeenCalled();
    await echoSettled();
  });

  // At the whole width the shell's Leave is the one back (round 17 §5.3): the step draws none of its own.
  it('names itself in its own row at the split, with the save state, and no back of its own at the whole width', async () => {
    renderWithIntl(<Step inlineHeading saveStatus={{ label: en.write.status.saved, title: 'Saved · 14:32' }} />);
    const heading = screen.getByRole('heading', { level: 2, name: en.write.publishPanel.title });
    const state = screen.getAllByRole('status').find((el) => el.textContent === en.write.status.saved);
    expect(state).toHaveAttribute('title', 'Saved · 14:32');
    expect(screen.queryByRole('button', { name: en.write.leaveStay })).toBeNull();
    // The heading leads its row: nothing stands before it.
    expect(heading.closest('[class*="headingRow"]')!.firstElementChild).toContainElement(heading);
    await echoSettled();
  });

  // The owner (2026-10-28): beside the map, whose Leave leaves the page, the step has its own back to writing,
  // before its name — waiting while a publish is on its way.
  it('puts its own back to writing before its name beside the map', async () => {
    const onBack = vi.fn();
    const { rerender } = renderWithIntl(<Step inlineHeading onBack={onBack} />);
    const heading = screen.getByRole('heading', { level: 2, name: en.write.publishPanel.title });
    const back = screen.getByRole('button', { name: en.write.leaveStay });
    expect(heading.closest('[class*="headingRow"]')!.firstElementChild).toContainElement(back);
    await userEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
    rerender(<Step inlineHeading onBack={onBack} pending />);
    expect(screen.getByRole('button', { name: en.write.leaveStay })).toBeDisabled();
    await echoSettled();
  });
});
