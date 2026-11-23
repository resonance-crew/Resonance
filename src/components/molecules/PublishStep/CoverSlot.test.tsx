// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderWithIntl, screen, waitFor, within } from '@/../test/render';
import en from '@/messages/en.json';
import type { CardMedia } from '@/lib/db/types';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { coverCrop, coverImageBox } from '@/lib/images/coverFrame';
import { coverFrameOfView, frameScale, frameStage, viewOfCoverFrame } from '@/lib/images/cropFrame';
import { CoverFrame, useCoverEditor } from './CoverSlot';

/**
 * §G2 (round 25): a picture cover wears a second chip, 調整位置 / Adjust, left of 更換封面; it opens 調整封面 (the shared
 * crop stage, a 0.62 frame), whose 完成 keeps `media.frame` in the draft — the picture and the card's colour stay,
 * nothing is uploaded — and a new picture clears it. And the renderers draw a framed cover on its frame.
 */

vi.mock('@/lib/images/upload', () => ({ UnsupportedImage: class extends Error {}, uploadImageFile: vi.fn() }));
vi.mock('@/lib/images/accentHue', () => ({ extractAccentHue: vi.fn(async () => 300) }));
// a 1600 × 900 picture, "loaded" for the stage (jsdom loads no images)
const PICTURE = { width: 1600, height: 900 };
vi.mock('./CoverFrameModal', async (importOriginal) => {
  const real = await importOriginal<typeof import('./CoverFrameModal')>();
  return { ...real, loadCoverPicture: vi.fn(async () => ({ el: document.createElement('img'), ...PICTURE })) };
});
import { uploadImageFile } from '@/lib/images/upload';
import { loadCoverPicture } from './CoverFrameModal';

const COVER: CardMedia = { type: 'image', url: 'https://img.example/cover.webp', label: 'cover.jpg' };

function Slot({ start = COVER, onChanged }: { start?: CardMedia | null; onChanged: (m: CardMedia | undefined, hue: number | null) => void }) {
  const [media, setMedia] = useState<CardMedia | undefined>(start ?? undefined);
  const [hue, setHue] = useState<number | null>(140);
  const cover = useCoverEditor({
    media,
    story: 'A story',
    accentHue: hue,
    onChange: (m, h) => {
      setMedia(m);
      setHue(h);
      onChanged(m, h);
    },
  });
  return <CoverFrame cover={cover} />;
}

afterEach(() => vi.clearAllMocks());

async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: en.write.coverAdjust }));
  return screen.findByRole('dialog', { name: en.write.coverFrame.title });
}

describe('調整位置 on a picture cover', () => {
  it('sits beside 更換封面, and only on a picture cover', () => {
    const { unmount } = renderWithIntl(<Slot onChanged={vi.fn()} />);
    const adjust = screen.getByRole('button', { name: 'Adjust' });
    const change = screen.getByRole('button', { name: en.write.coverChange });
    expect(adjust.compareDocumentPosition(change) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    renderWithIntl(<Slot start={null} onChanged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Adjust' })).toBeNull();
  });

  it('opens 調整封面 on the picture already up: its stage, the pointer’s hint, 取消 · 完成 — nothing is uploaded', async () => {
    renderWithIntl(<Slot onChanged={vi.fn()} />);
    const dialog = await openDialog();
    expect(loadCoverPicture).toHaveBeenCalledWith(COVER.url);
    expect(within(dialog).getByRole('group', { name: en.write.coverFrame.stage })).toBeInTheDocument();
    expect(within(dialog).getByText(en.write.coverFrame.hintPointer)).toBeInTheDocument();
    expect(within(dialog).getByRole('slider', { name: en.crop.zoom })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: en.write.coverFrame.cancel })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: en.write.coverFrame.done })).toBeInTheDocument();
    // 重設 only once something has moved
    expect(within(dialog).queryByRole('button', { name: en.crop.reset })).toBeNull();
    expect(uploadImageFile).not.toHaveBeenCalled();
  });

  it('draws the frame’s line in the photo ink, which stays light at night — the paper’s own cream turns dark there', async () => {
    renderWithIntl(<Slot onChanged={vi.fn()} />);
    const dialog = await openDialog();
    const line = await waitFor(() => {
      const path = dialog.querySelector('path[data-crop-mask]');
      expect(path).not.toBeNull();
      return path!;
    });
    expect(line.getAttribute('stroke')).toBe('var(--photo-ink)');
  });

  it('完成 writes media.frame into the draft — the picture and the card’s colour stay', async () => {
    const onChanged = vi.fn();
    renderWithIntl(<Slot onChanged={onChanged} />);
    const dialog = await openDialog();
    const stage = within(dialog).getByRole('group', { name: en.write.coverFrame.stage });
    expect(stage).toHaveAccessibleDescription(en.crop.keys);
    fireEvent.keyDown(stage, { key: '+' });
    fireEvent.keyDown(stage, { key: 'ArrowRight', shiftKey: true });
    expect(within(dialog).getByRole('button', { name: en.crop.reset })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: en.write.coverFrame.done }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const [media, hue] = onChanged.mock.calls[0];
    expect(hue).toBe(140);
    expect(media.url).toBe(COVER.url);
    // the picture moved right under the frame: the frame now looks left of its centre, zoomed ×1.1
    const frameW = frameStage(Number.parseFloat(stage.style.width), window.innerHeight, { max: 480, inset: 20, ratio: 0.62 }).frameW;
    const want = coverFrameOfView(PICTURE, 0.62, { z: 1.1, ox: 32 / frameW, oy: 0 });
    expect(media.frame).toEqual(want);
    expect(media.frame.cx).toBeLessThan(0.5);
    expect(media.frame.ar).toBeCloseTo(16 / 9, 3);
    expect(uploadImageFile).not.toHaveBeenCalled();
  });

  it('重設 stands at the end of the zoom slider’s row, as on iOS — absent until the picture moves', async () => {
    renderWithIntl(<Slot onChanged={vi.fn()} />);
    const dialog = await openDialog();
    const slider = within(dialog).getByRole('slider', { name: en.crop.zoom });
    expect(within(dialog).queryByRole('button', { name: en.crop.reset })).toBeNull();
    const stage = within(dialog).getByRole('group', { name: en.write.coverFrame.stage });
    fireEvent.keyDown(stage, { key: '+' });
    const reset = within(dialog).getByRole('button', { name: en.crop.reset });
    // the row that holds the slider holds 重設 too, after it: one row, − slider + 重設
    let shared: HTMLElement | null = slider.parentElement;
    while (shared && !shared.contains(reset)) shared = shared.parentElement;
    expect(shared).not.toBeNull();
    expect(shared!.contains(stage)).toBe(false);
    expect(slider.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('重設 brings it back to the centre, and 完成 there leaves no frame', async () => {
    const onChanged = vi.fn();
    renderWithIntl(<Slot start={{ ...COVER, frame: { cx: 0.3, cy: 0.5, zoom: 1.4, ar: 16 / 9 } }} onChanged={onChanged} />);
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: en.crop.reset }));
    fireEvent.click(within(dialog).getByRole('button', { name: en.write.coverFrame.done }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onChanged.mock.calls[0][0]).toEqual(COVER);
  });

  it('取消 leaves the cover as it was', async () => {
    const onChanged = vi.fn();
    renderWithIntl(<Slot onChanged={onChanged} />);
    const dialog = await openDialog();
    fireEvent.keyDown(within(dialog).getByRole('group', { name: en.write.coverFrame.stage }), { key: '+' });
    fireEvent.click(within(dialog).getByRole('button', { name: en.write.coverFrame.cancel }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('a new picture clears the frame', async () => {
    vi.mocked(uploadImageFile).mockResolvedValue({ publicUrl: 'https://img.example/new.webp', key: 'k' } as never);
    const onChanged = vi.fn();
    const { container } = renderWithIntl(<Slot start={{ ...COVER, frame: { cx: 0.2, cy: 0.4, zoom: 1.5, ar: 1.5 } }} onChanged={onChanged} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'new.jpg', { type: 'image/jpeg' })] } });
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onChanged.mock.calls[0][0]).toEqual({ type: 'image', url: 'https://img.example/new.webp', label: 'new.jpg' });
  });
});

/** The slot beside the preview's picture, as the publish step lays them: what 完成 keeps is what the preview draws. */
function SlotAndPreview({ start }: { start?: CardMedia }) {
  const [media, setMedia] = useState<CardMedia | undefined>(start);
  const cover = useCoverEditor({ media, story: 'A story to draw from', accentHue: 140, onChange: (m) => setMedia(m) });
  return (
    <>
      <CoverFrame cover={cover} />
      <div data-testid="preview">{media?.url && <OrganicImage src={cover.partial ?? media.url} ratio={0.62} frame={cover.partial ? undefined : media.frame} />}</div>
    </>
  );
}

describe('調整封面 on an AI-made cover (round 32 §P5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  // The owner, 2026-11-24: 「调整封面裁切范围后，预览区没有更新，仍然显示旧的裁切范围」 (an AI-made cover). On the web the
  // drawn cover takes the same path as an upload — its URL into media, the frame beside it, the preview reading both —
  // and this pins it: each 完成 moves what the preview draws, the first time and every time after.
  it('the preview draws each new framing at once, as it does an uploaded picture’s', async () => {
    const AI = 'https://img.example/image/2026-11/ai.webp';
    const ndjson = `${JSON.stringify({ type: 'done', publicUrl: AI, key: 'image/2026-11/ai.webp', thumbUrl: AI.replace('.webp', '-w960.webp') })}\n`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ndjson, { status: 200 })));
    renderWithIntl(<SlotAndPreview start={COVER} />);
    // 更換封面 → 生成圖片: the story's illustration replaces the photo
    fireEvent.click(screen.getByRole('button', { name: en.write.coverChange }));
    fireEvent.click(await screen.findByRole('menuitem', { name: en.write.mediaGenerate }));
    const drawn = () => screen.getByTestId('preview').querySelector('img') as HTMLImageElement;
    await waitFor(() => expect(drawn()).toHaveAttribute('src', AI));
    expect(drawn()).not.toHaveAttribute('data-frame');

    const adjust = async (key: string) => {
      const dialog = await openDialog();
      const stage = within(dialog).getByRole('group', { name: en.write.coverFrame.stage });
      fireEvent.keyDown(stage, { key: '+' });
      fireEvent.keyDown(stage, { key, shiftKey: true });
      fireEvent.click(within(dialog).getByRole('button', { name: en.write.coverFrame.done }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      return drawn().getAttribute('style');
    };
    const first = await adjust('ArrowRight');
    expect(drawn()).toHaveAttribute('data-frame');
    expect(drawn()).toHaveAttribute('src', AI);
    // framed again from where the first left it: the preview follows again
    const second = await adjust('ArrowLeft');
    expect(second).not.toBe(first);
    expect(drawn()).toHaveAttribute('src', AI);
  });
});

describe('the stage’s maths', () => {
  it('a stored frame opens where it was and comes back the same', () => {
    // (a frame inside what the picture allows: at ×1.3 the 0.62 crop is 0.70 of its width, so cx ∈ [0.35, 0.65], cy ∈ [0.38, 0.62])
    const frame = { cx: 0.4, cy: 0.55, zoom: 1.3, ar: 16 / 9 };
    const view = viewOfCoverFrame(PICTURE, 0.62, frame);
    const back = coverFrameOfView(PICTURE, 0.62, view);
    expect(back.cx).toBeCloseTo(frame.cx, 3);
    expect(back.cy).toBeCloseTo(frame.cy, 3);
    expect(back.zoom).toBeCloseTo(frame.zoom, 3);
    // and what the stage's frame shows is coverCrop's 0.62 rect
    const s = frameScale(PICTURE, 0.62, view.z);
    const crop = coverCrop(back.ar, back, 0.62);
    expect(crop.w).toBeCloseTo(1 / (s * PICTURE.width), 3);
  });

  it('never taller than the window less 200: a phone held sideways keeps the frame and its buttons on one screen', () => {
    const wide = frameStage(600, 390, { max: 480, inset: 20, ratio: 0.62 });
    expect(wide.height).toBeLessThanOrEqual(190);
    expect(frameStage(600, 1000, { max: 480, inset: 20, ratio: 0.62 }).width).toBe(480);
    expect(frameStage(320, 1000, { max: 400, inset: 24, ratio: 1 }).width).toBe(320);
  });
});

describe('a framed cover where it is drawn', () => {
  it('is placed on its frame (no object-fit), an unframed one covers and centres', () => {
    const frame = { cx: 0.2, cy: 0.5, zoom: 1.2, ar: 16 / 9 };
    const { container, rerender } = renderWithIntl(<OrganicImage src="https://img.example/c.webp" ratio={0.62} frame={frame} />);
    const img = container.querySelector('img') as HTMLImageElement;
    const box = coverImageBox(frame, 0.62)!;
    expect(img).toHaveAttribute('data-frame');
    expect(img.style.left).toBe(box.left);
    expect(img.style.width).toBe(box.width);
    expect(img.style.objectFit).toBe('');
    // off the centre: the picture starts left of the box
    expect(Number.parseFloat(box.left)).toBeLessThanOrEqual(0);
    rerender(<OrganicImage src="https://img.example/c.webp" ratio={0.62} />);
    expect(container.querySelector('img')!.style.objectFit).toBe('cover');
  });
});
