'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { FieldHint } from '@/components/atoms/Field/Field';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { OrganicMenu, type OrganicMenuItem } from '@/components/molecules/OrganicMenu/OrganicMenu';
import type { GenerateImageEvent } from '@/app/api/generate-image/route';
import type { CardMedia } from '@/lib/db/types';
import { extractAccentHue } from '@/lib/images/accentHue';
import { UnsupportedImage, uploadImageFile } from '@/lib/images/upload';
import { ndjsonValues } from '@/lib/streams/ndjson';
import styles from './PublishStep.module.css';

export interface CoverEditor {
  media?: CardMedia;
  uploading: boolean;
  generating: boolean;
  /** The model's in-progress pass (a data URL), shown as the cover while it paints. */
  partial: string | null;
  error: string | null;
  dragOver: boolean;
  /** Whether there is a story to draw from. */
  canGenerate: boolean;
  setDragOver: (over: boolean) => void;
  upload: (file: File) => void;
  generate: () => void;
  remove: () => void;
  /** Opens the file picker. */
  pick: () => void;
  /** The hidden file input the picker is (rendered once, by CoverFrame). */
  input: ReactNode;
}

/**
 * The card's cover, edited where it is seen: uploading a picture (its hue
 * read from the file), drawing one from the story (/api/generate-image's
 * NDJSON stream: rough passes, then the stored picture), taking it away. The
 * picture and its hue are the editor's values (`onChange`); what is on its way
 * is the step's.
 */
export function useCoverEditor({
  media,
  story,
  onChange,
}: {
  media?: CardMedia;
  story: string;
  onChange: (media: CardMedia | undefined, accentHue: number | null) => void;
}): CoverEditor {
  const t = useTranslations('write');
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [partial, setPartial] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = uploading || generating;
  const canGenerate = story.trim().length > 0;

  async function upload(file: File) {
    if (busy) return;
    setError(null);
    setUploading(true);
    try {
      const { publicUrl } = await uploadImageFile(file);
      // Read the hue from the local file — no extra fetch, no CORS involved.
      onChange({ type: 'image', url: publicUrl, label: file.name }, await extractAccentHue(file));
    } catch (e) {
      setError(t(e instanceof UnsupportedImage ? 'mediaUnsupported' : 'mediaUploadError'));
    } finally {
      setUploading(false);
    }
  }

  async function generate() {
    if (busy || !canGenerate) return;
    setError(null);
    setGenerating(true);
    setPartial(null);
    try {
      // The story body lives only in editor state here (the draft may be
      // unsaved), so send it to the server, which distills it into an imagery
      // prompt, renders the doodle, stores it in R2, and returns the URL. The
      // response is an NDJSON stream: in-progress previews arrive as `partial`
      // events while the model paints, then `done` carries the stored URL.
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story }),
      });
      if (!res.ok || !res.body) {
        setError(t('mediaGenerateError'));
        return;
      }
      let finalUrl: string | null = null;
      for await (const event of ndjsonValues<GenerateImageEvent>(res.body)) {
        if (event.type === 'partial') setPartial(`data:image/png;base64,${event.b64}`);
        else if (event.type === 'done') finalUrl = event.publicUrl;
        else if (event.type === 'error') {
          setError(t('mediaGenerateError'));
          return;
        }
      }
      if (!finalUrl) {
        setError(t('mediaGenerateError'));
        return;
      }
      onChange({ type: 'image', url: finalUrl, label: t('mediaGeneratedLabel') }, await extractAccentHue(finalUrl));
    } catch {
      setError(t('mediaGenerateError'));
    } finally {
      setGenerating(false);
      setPartial(null);
    }
  }

  return {
    media,
    uploading,
    generating,
    partial,
    error,
    dragOver,
    canGenerate,
    setDragOver,
    upload: (file) => void upload(file),
    generate: () => void generate(),
    remove: () => {
      setError(null);
      onChange(undefined, null);
    },
    pick: () => inputRef.current?.click(),
    input: (
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.fileInput}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void upload(file);
          e.currentTarget.value = '';
        }}
      />
    ),
  };
}

/**
 * What lies in the preview's picture: with no cover the two ways to one
 * (加一張圖片 · 生成圖片, the second waiting for a story), a dashed frame while
 * a file is dragged over (dropped, it uploads), the pen's loader while one is
 * on its way — over the model's blurred, washed rough pass while it paints —
 * and once there is one, one chip on it that says so (更換封面), whose menu
 * holds everything a cover can become: another picture, one drawn from the
 * story, none. The picture is where it is changed — no second control for it
 * under the preview.
 */
export function CoverFrame({ cover }: { cover: CoverEditor }) {
  const t = useTranslations('write');
  const { media, uploading, generating, partial, dragOver, canGenerate } = cover;
  const busy = uploading || generating;
  const menu: OrganicMenuItem[] = [
    { key: 'replace', icon: 'image', label: t('mediaReplace') },
    ...(canGenerate ? [{ key: 'generate', icon: 'sparkle' as const, label: t('mediaGenerate') }] : []),
    { key: 'remove', icon: 'trash', label: t('mediaRemove'), danger: true },
  ];
  return (
    <div
      className={styles.cover}
      data-busy={busy || undefined}
      onDragOver={(e) => {
        if (busy) return;
        e.preventDefault();
        cover.setDragOver(true);
      }}
      onDragLeave={() => cover.setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        cover.setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && !busy) cover.upload(file);
      }}
    >
      {cover.input}
      {busy ? (
        <span className={styles.coverBusy} data-partial={(generating && partial != null) || undefined}>
          <SketchLoader size={64} seed={31} ariaLabel={generating ? t('mediaGenerating') : t('mediaUploading')} />
          <span className={styles.coverBusyText}>{generating ? t('mediaGenerating') : t('mediaUploading')}</span>
        </span>
      ) : media ? (
        <span className={styles.coverMenu}>
          <OrganicMenu
            items={menu}
            label={t('coverChange')}
            triggerLabel={t('coverChange')}
            triggerIcon="image"
            triggerSize={34}
            seed={41}
            floating
            onChoose={(key) => {
              if (key === 'replace') cover.pick();
              else if (key === 'generate') cover.generate();
              else if (key === 'remove') cover.remove();
            }}
          />
        </span>
      ) : (
        <span className={styles.coverEmpty}>
          <span className={styles.coverPills}>
            <OrganicButton variant="tonal" size="sm" onClick={cover.pick}>
              <span className={styles.pillIcon}>
                <Icon name="image" size={16} />
              </span>
              {t('mediaPlaceholder')}
            </OrganicButton>
            <OrganicButton variant="tonal" size="sm" disabled={!canGenerate} onClick={cover.generate}>
              <span className={styles.pillIcon}>
                <Icon name="sparkle" size={16} />
              </span>
              {t('mediaGenerate')}
            </OrganicButton>
          </span>
          {!canGenerate && <span className={styles.coverNeed}>{t('mediaGenerateNeedStory')}</span>}
        </span>
      )}
      {dragOver && !busy && (
        <HandDrawnDashedSurface
          seed={31}
          R={16}
          state="focus"
          className={styles.coverDrop}
          // Laid over the frame (the surface is position: relative of its own).
          style={{ position: 'absolute', inset: 8 }}
        >
          <span />
        </HandDrawnDashedSurface>
      )}
    </div>
  );
}

/** Under the preview, only while there is one: why the last try at a cover didn't work. */
export function CoverError({ cover }: { cover: CoverEditor }) {
  if (!cover.error) return null;
  return (
    <div className={styles.coverBelow}>
      <FieldHint tone="error">{cover.error}</FieldHint>
    </div>
  );
}
