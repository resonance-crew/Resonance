// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode, useState } from 'react';
import { act, fireEvent, renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import en from '@/messages/en.json';
import type { CardMedia, Visibility } from '@/lib/db/types';
import { PublishStep, type PublishStepProps, type PublishStepValues } from './PublishStep';

vi.mock('@/lib/data/hooks', () => ({
  useMyProfile: () => ({ data: { id: 'me', handle: 'my-handle', initials: 'MH', accentColor: 'oklch(88% 0.08 55)' } }),
}));
vi.mock('@/lib/hints', () => ({
  useHint: () => ({ visible: false, dismiss: vi.fn() }),
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
      onBack={vi.fn()}
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
  // Its foot is a dialog's: the way out tonal, the verb solid and rightmost.
  it('publishes with a solid verb, rightmost, and saves for later with a tonal one', async () => {
    const onSubmit = vi.fn();
    const onSecondary = vi.fn();
    renderWithIntl(<Step onSubmit={onSubmit} onSecondary={onSecondary} />);
    const publish = screen.getByRole('button', { name: en.write.publishPanel.publish });
    const later = screen.getByRole('button', { name: en.write.saveDraftAndLeave });
    expect(publish).toHaveAttribute('data-variant', 'solid');
    expect(later).toHaveAttribute('data-variant', 'tonal');
    expect(Array.from(publish.parentElement!.children)).toEqual([later, publish]);
    await userEvent.click(later);
    expect(onSecondary).toHaveBeenCalledTimes(1);
    await userEvent.click(publish);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await echoSettled();
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
    const view = renderWithIntl(<Step mode="update" />);
    expect(screen.getByText(en.write.publishPanel.updateHint)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.write.publishPanel.update })).toHaveAttribute('data-variant', 'solid');
    view.unmount();
    renderWithIntl(<Step start={{ thoughtCore: '  ' }} />);
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(insightCalls()).toHaveLength(0);
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

  // An anonymous card is public or only yours: for connections only, its few readers would know who wrote it.
  it('turns a card kept for connections public in the same change that makes it anonymous', async () => {
    const onAudience = vi.fn();
    renderWithIntl(<Step start={{ visibility: 'connections' }} onAudience={onAudience} />);
    // A legacy connections card: neither side is chosen until one is.
    expect(screen.getByRole('button', { name: en.write.visibility.public })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: en.write.visibility.private })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('switch', { name: en.write.publishPanel.anonymousToggle }));
    expect(onAudience).toHaveBeenCalledTimes(1);
    expect(onAudience).toHaveBeenLastCalledWith({ visibility: 'public', anonymous: true });
    expect(screen.getByText(en.write.publishPanel.anonymousVisibility)).toBeInTheDocument();
    // The preview's byline is the world's.
    expect(within(screen.getByRole('group', { name: en.write.previewCaption })).getByText(en.write.publishPanel.anonymousName)).toBeInTheDocument();
    await echoSettled();
  });

  it('tells which audience is chosen, and changes it', async () => {
    const onAudience = vi.fn();
    renderWithIntl(<Step onAudience={onAudience} />);
    const pub = screen.getByRole('button', { name: en.write.visibility.public });
    const mine = screen.getByRole('button', { name: en.write.visibility.private });
    expect(pub).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(mine);
    expect(onAudience).toHaveBeenLastCalledWith({ visibility: 'private', anonymous: false });
    expect(mine).toHaveAttribute('aria-pressed', 'true');
    await echoSettled();
  });

  // Whether a resonance reaches the card it answers is said where the choice is made.
  it('says whether a resonance tells its original’s author, following the choice', async () => {
    renderWithIntl(<Step resonance />);
    expect(screen.getByText(en.write.publishPanel.resonanceReaches)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.private }));
    expect(screen.getByText(en.write.publishPanel.resonanceQuiet)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.public }));
    await userEvent.click(screen.getByRole('switch', { name: en.write.publishPanel.anonymousToggle }));
    expect(screen.getByText(en.write.publishPanel.resonanceQuiet)).toBeInTheDocument();
    await echoSettled();
  });

  // A live resonance made public and named by this save reaches its original after it (PATCH's becameReachable).
  it('says so for a live resonance only when the save makes a hidden one public and named', async () => {
    const view = renderWithIntl(<Step mode="update" resonance liveReaches={false} start={{ visibility: 'private' }} />);
    expect(screen.queryByText(en.write.publishPanel.resonanceReaches)).toBeNull();
    expect(screen.queryByText(en.write.publishPanel.resonanceQuiet)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: en.write.visibility.public }));
    expect(screen.getByText(en.write.publishPanel.resonanceReaches)).toBeInTheDocument();
    view.unmount();

    renderWithIntl(<Step mode="update" resonance liveReaches />);
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
    expect(screen.getByRole('button', { name: en.write.mediaReplace })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.write.mediaRemove })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: en.write.saveDraftAndLeave })).toBeDisabled();
    // Every choice holds still.
    expect(screen.getByRole('switch', { name: en.write.publishPanel.anonymousToggle })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: en.write.publishPanel.publish }));
    expect(onSubmit).not.toHaveBeenCalled();
    await echoSettled();
  });

  it('names itself in its own row at the split, with the way back to writing', async () => {
    const onBack = vi.fn();
    renderWithIntl(<Step inlineHeading onBack={onBack} />);
    expect(screen.getByRole('heading', { level: 2, name: en.write.publishPanel.title })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.write.leaveStay }));
    expect(onBack).toHaveBeenCalled();
    await echoSettled();
  });
});
