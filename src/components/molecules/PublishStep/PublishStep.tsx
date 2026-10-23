'use client';

import { useEffect, useId, useRef, useState, type Dispatch, type Ref, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { Divider } from '@/components/atoms/Divider/Divider';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { ToggleSwitch } from '@/components/atoms/ToggleSwitch/ToggleSwitch';
import { ModalActions } from '@/components/molecules/Modal/ModalActions';
import {
  SegmentedActionBar,
  type SegmentSpec,
} from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { StoryCard, type Story } from '@/components/molecules/StoryCard/StoryCard';
import { TagField } from '@/components/molecules/TagField/TagField';
import { useMyProfile } from '@/lib/data/hooks';
import type { CardMedia, Visibility } from '@/lib/db/types';
import { useHint } from '@/lib/hints';
import { excerpt, plainText } from '@/lib/markdown/plainText';
import { readMinutes } from '@/lib/readTime';
import { CoverBelow, CoverFrame, useCoverEditor } from './CoverSlot';
import modalStyles from '@/components/molecules/Modal/Modal.module.css';
import styles from './PublishStep.module.css';

const VISIBILITY_ICON: Record<'public' | 'private', 'globe' | 'lock'> = {
  public: 'globe',
  private: 'lock',
};

/**
 * An anonymous card is public or only its author's — never for connections
 * only, which would tell those few who wrote it (the server refuses it): one
 * asked for connections while anonymous is public instead.
 */
export function anonymousVisibility(visibility: Visibility, anonymous: boolean): Visibility {
  return anonymous && visibility === 'connections' ? 'public' : visibility;
}

/** Whether a card in this audience reaches the card it answers: public and under its author's name. */
export function reachesOriginal(visibility: Visibility, anonymous: boolean): boolean {
  return visibility === 'public' && !anonymous;
}

/** What the step shows of the card being written — the editor's own values, live. */
export interface PublishStepValues {
  thoughtCore: string;
  story: string;
  tags: string[];
  visibility: Visibility;
  anonymous: boolean;
  media?: CardMedia;
  accentHue: number | null;
}

export interface PublishStepProps {
  /**
   * `publish` sends a draft out for the first time (發布這張卡片). `update` is
   * the same step for a card already live (更新這張卡片): no mirror (that
   * belongs to first publication), the verb 儲存修改.
   */
  mode: 'publish' | 'update';
  /**
   * The step is on screen. It stays mounted while the writer writes (what it
   * holds — a cover on its way, the mirror's answer — is kept): it asks the
   * mirror as it is shown, and stops asking as it is hidden.
   */
  active: boolean;
  /**
   * At the split the pane has no bar: the step names itself in its own first
   * row (← 繼續寫 and the heading). Below it the host's bar does.
   */
  inlineHeading: boolean;
  /** The inline heading, for the host that moves the focus to it. */
  headingRef?: Ref<HTMLHeadingElement>;
  /** Back to writing (繼續寫). */
  onBack: () => void;
  values: PublishStepValues;
  onTagsChange: Dispatch<SetStateAction<string[]>>;
  /** Who can see it, and under whose name: one change, so no write is ever anonymous and for connections only. */
  onAudienceChange: (next: { visibility: Visibility; anonymous: boolean }) => void;
  onCoverChange: (media: CardMedia | undefined, accentHue: number | null) => void;
  /** The card answers another (it is a resonance). */
  resonance: boolean;
  /**
   * For `update`: the live card reaches its original already (published,
   * public and named) — saving tells no one anything new.
   */
  liveReaches?: boolean;
  /** Pictures are still on their way into the story. */
  storyBusy: boolean;
  /** Publishing, saving, or leaving is on its way. */
  pending: boolean;
  /** Which of the two `pending` is for: its button shows the loader, the other rests. */
  busyVerb: 'publish' | 'leave';
  /** Why the last try didn't go through. */
  error: string | null;
  /** 發布 / 儲存修改. */
  onSubmit: () => void;
  /** 存成草稿，稍後再寫 / 捨棄修改. */
  onSecondary: () => void;
  /** Whether the way out shows (a live card's 捨棄修改 only while there is a revision). */
  showSecondary: boolean;
}

/** What the mirror answered for a text, kept for as long as the step is: coming back with the same words asks nothing. */
interface Reflection {
  key: string;
  value: string | null;
}

/**
 * The writer's second step, 發布這張卡片 (更新這張卡片 for a live card): one
 * screen in place of the editor — the publish panel grown into a page (ux §6
 * 單一畫面鐵律: publishing is still two taps). Top to bottom: the mirror line
 * (publish only), the card as a list will show it with its cover editor in
 * its picture, 標籤, 誰可以看見, 以匿名發布 with its byline, a line saying
 * whether a resonance reaches its original, then the foot. Every choice here
 * is the editor's own value and autosaves with the draft (or the live card's
 * pending edit); going back to writing keeps them.
 */
export function PublishStep({
  mode,
  active,
  inlineHeading,
  headingRef,
  onBack,
  values,
  onTagsChange,
  onAudienceChange,
  onCoverChange,
  resonance,
  liveReaches = false,
  storyBusy,
  pending,
  busyVerb,
  error,
  onSubmit,
  onSecondary,
  showSecondary,
}: PublishStepProps) {
  const t = useTranslations('write');
  const tPanel = useTranslations('write.publishPanel');
  const tVis = useTranslations('write.visibility');
  const { data: me } = useMyProfile();
  const anonymousHint = useHint('anonymous-publish');
  const updating = mode === 'update';
  const { thoughtCore, story, tags, visibility, anonymous, media, accentHue } = values;
  const captionId = useId();
  const tagsId = useId();
  const headingId = useId();

  // ── The mirror: asked once per text, never for an update or an untitled draft ──
  const reflections = useRef<Reflection | null>(null);
  const [insight, setInsight] = useState<{ state: 'loading' | 'shown' | 'none'; text?: string } | null>(null);
  useEffect(() => {
    if (!active || updating || !thoughtCore.trim()) return;
    const key = JSON.stringify([thoughtCore, story]);
    const known = reflections.current;
    if (known?.key === key) {
      setInsight(known.value ? { state: 'shown', text: known.value } : { state: 'none' });
      return;
    }
    setInsight({ state: 'loading' });
    const ask = new AbortController();
    void (async () => {
      let value: string | null = null;
      try {
        const res = await fetch('/api/cards/insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thoughtCore, story }),
          signal: ask.signal,
        });
        if (res.ok) value = ((await res.json()) as { coreInsight?: string | null }).coreInsight ?? null;
      } catch {
        if (ask.signal.aborted) return;
      }
      if (ask.signal.aborted) return;
      reflections.current = { key, value };
      setInsight(value ? { state: 'shown', text: value } : { state: 'none' });
    })();
    // Leaving the step (or the words changing under it) drops the question; an answer that never came is asked again.
    return () => ask.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, updating]);

  // ── Tags: the model suggests from the draft as it is on screen ──
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  async function suggestTags() {
    if (suggestingTags) return;
    setTagError(null);
    setSuggestingTags(true);
    try {
      // The draft may be unsaved, so the editor state travels in the body. The
      // server merges in the author's past tags before asking the model.
      const res = await fetch('/api/cards/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thoughtCore, story, tags }),
      });
      if (!res.ok) throw new Error(`Tag suggestion failed: ${res.status}`);
      const { tags: suggested } = (await res.json()) as { tags?: string[] };
      // The field stays open while the model thinks, so merge into what is
      // there now, not into the list this request started from.
      onTagsChange((now) => {
        const fresh = (suggested ?? []).filter((x) => !now.includes(x));
        return fresh.length > 0 ? [...now, ...fresh] : now;
      });
    } catch (err) {
      console.error('Tag suggestion failed:', err);
      setTagError(t('tagsSuggestError'));
    } finally {
      setSuggestingTags(false);
    }
  }

  // ── The cover, edited in the preview's picture ──
  const cover = useCoverEditor({ media, story, onChange: onCoverChange });
  const mediaBusy = cover.uploading || cover.generating || storyBusy;

  // ── The preview: the card as a list will show it, from what is on screen ──
  const preview: Story = {
    title: thoughtCore,
    excerpt: excerpt(plainText(story)),
    author: anonymous ? tPanel('anonymousName') : (me?.handle ?? ''),
    authorInitials: anonymous ? '·' : (me?.initials ?? '?'),
    avatarUrl: anonymous ? undefined : me?.avatarUrl,
    avatarSeed: anonymous ? '217' : me?.avatarSeed,
    readTime: `${readMinutes(story)} min`,
    tags,
    imageUrl: cover.partial ?? media?.url,
    imageLabel: media?.label ?? thoughtCore.slice(0, 24),
    accentHue: accentHue ?? undefined,
  };

  const reaches = reachesOriginal(visibility, anonymous);
  // A resonance's line: before it is first published, where it will reach; a live one, only when this save
  // makes a hidden one public and named (it then reaches its original, as making it public would).
  const resonanceLine = !resonance
    ? null
    : updating
      ? !liveReaches && reaches
        ? tPanel('resonanceReaches')
        : null
      : reaches
        ? tPanel('resonanceReaches')
        : tPanel('resonanceQuiet');

  const title = updating ? tPanel('updateTitle') : tPanel('title');
  // Nothing above the preview (no heading of its own, no hint, no mirror line): on a phone its
  // band is the first thing under the bar, which it meets as the feed's first card does.
  const underBar = !inlineHeading && !updating && (!insight || insight.state === 'none');

  return (
    <section
      className={styles.step}
      aria-label={inlineHeading ? undefined : title}
      aria-labelledby={inlineHeading ? headingId : undefined}
      data-step-pending={pending || undefined}
    >
      {inlineHeading && (
        <div className={styles.headingRow}>
          <BareIconButton
            icon="arrow-right"
            mirror
            tone="ink"
            label={t('leaveStay')}
            iconSize={18}
            tip="below"
            tipAlign="start"
            seed={13}
            className={styles.back}
            disabled={pending}
            onClick={onBack}
          />
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.heading}>
            {title}
          </h2>
        </div>
      )}
      {updating && <p className={styles.hint}>{tPanel('updateHint')}</p>}

      {/* 1 — the mirror moment (first publication only) */}
      {!updating && insight && (
        <div className={styles.insightWrap} data-collapsed={insight.state === 'none' || undefined}>
          <div className={styles.insightClip}>
            <div className={styles.insight} data-loading={insight.state === 'loading' || undefined}>
              {insight.state === 'loading' ? (
                <>
                  <SketchLoader size={28} seed={29} ariaLabel={tPanel('insightLoading')} />
                  <span className={styles.muted}>{tPanel('insightLoading')}</span>
                </>
              ) : insight.text ? (
                <>
                  <span className={styles.insightGlyph}>
                    <Icon name="sparkle" size={16} color="var(--color-terracotta)" />
                  </span>
                  <span>{tPanel('insight', { coreInsight: insight.text })}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <fieldset className={styles.fieldset} disabled={pending}>
        {/* 2 — the card as a list shows it; its picture is the cover editor */}
        <div className={styles.previewBlock} data-under-bar={underBar || undefined}>
          <div className={styles.preview}>
            <StoryCard
              story={preview}
              preview
              isFirst={underBar}
              labelledBy={captionId}
              bleed="var(--page-pad-x)"
              coverSlot={<CoverFrame cover={cover} />}
            />
          </div>
          <p id={captionId} className={styles.caption}>
            {t('previewCaption')}
          </p>
          <CoverBelow cover={cover} />
        </div>

        {/* 3 — tags */}
        <div className={styles.group}>
          <label className={styles.label} htmlFor={tagsId}>
            {t('tagsLabel')}
          </label>
          <TagField
            id={tagsId}
            tags={tags}
            onChange={onTagsChange}
            onSuggest={() => void suggestTags()}
            suggesting={suggestingTags}
            error={tagError}
          />
        </div>

        {/* 4 — who can see it */}
        <div className={styles.group}>
          <span className={styles.label}>{tVis('label')}</span>
          <div className={styles.choice}>
            {/* A segmented choice with no pen line (its options are buttons):
                a quiet paper-dark track shows the control's extent, and the
                chosen side wears the tonal peach with the deep terracotta
                label (4.8:1); the other keeps a muted ink deep enough to read
                on the track. A card kept for connections only (older ones)
                shows neither side chosen and keeps its audience until one is. */}
            <SegmentedActionBar
              fill="var(--color-cream-dark)"
              segments={(['public', 'private'] as const).map((v) => {
                const chosen = visibility === v;
                const ink = chosen
                  ? 'var(--button-on-tonal)'
                  : 'color-mix(in oklch, var(--color-text-muted), black 10%)';
                return {
                  key: v,
                  icon: <Icon name={VISIBILITY_ICON[v]} size={16} color={ink} />,
                  label: tVis(v),
                  fill: chosen ? 'var(--button-tonal)' : 'transparent',
                  textColor: ink,
                  hoverOverlay: 'oklch(0% 0 0 / 0.05)',
                  pressed: chosen,
                  onClick: () => onAudienceChange({ visibility: v, anonymous }),
                } satisfies SegmentSpec;
              })}
            />
          </div>
          {/* Never for connections only: who could read it would say who wrote it. */}
          {anonymous && <p className={styles.note}>{tPanel('anonymousVisibility')}</p>}
        </div>

        {/* 5 — publish anonymously, with the byline the world will get */}
        <div className={styles.group}>
          <label className={styles.toggleRow}>
            {tPanel('anonymousToggle')}
            <ToggleSwitch
              checked={anonymous}
              onChange={() =>
                onAudienceChange({ visibility: anonymousVisibility(visibility, !anonymous), anonymous: !anonymous })
              }
              ariaLabel={tPanel('anonymousToggle')}
              seed={57}
            />
          </label>
          <div className={styles.byline}>
            {anonymous ? (
              <HandDrawnAvatar initials="·" size={34} color="var(--color-cream-dark)" seed={97} />
            ) : (
              <HandDrawnAvatar
                src={me?.avatarUrl}
                initials={me?.initials ?? '?'}
                size={34}
                color={me?.accentColor ?? 'oklch(88% 0.08 55)'}
                seed={Number(me?.avatarSeed ?? 0)}
              />
            )}
            <span className={styles.name} data-anonymous={anonymous || undefined}>
              {anonymous ? tPanel('anonymousName') : (me?.handle ?? '')}
            </span>
          </div>
          {anonymousHint.visible && <p className={styles.note}>{tPanel('anonymousHint')}</p>}
        </div>

        {/* 6 — whether a resonance tells its original's author */}
        {resonance && (
          <p className={styles.resonance} aria-live="polite">
            {resonanceLine && (
              <>
                <Icon name="wave" size={14} color="var(--color-terracotta)" />
                <span>{resonanceLine}</span>
              </>
            )}
          </p>
        )}
      </fieldset>

      <Divider seed={47} spacing={2} />

      {/* The foot: the way out tonal, the verb solid and rightmost (on a phone, the verb across the top);
          why the last try failed, and what it waits for, right above it. */}
      <div className={styles.footBlock}>
        {mediaBusy && <p className={styles.busyHint}>{t('mediaBusyHint')}</p>}
        {error && (
          <p className={modalStyles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.foot}>
          <ModalActions busy={pending}>
            {showSecondary && (
              <OrganicButton
                variant="tonal"
                size="sm"
                loading={pending && busyVerb === 'leave'}
                disabled={pending && busyVerb !== 'leave'}
                onClick={onSecondary}
              >
                {updating ? t('discardChanges') : t('saveDraftAndLeave')}
              </OrganicButton>
            )}
            <OrganicButton
              variant="solid"
              size="sm"
              loading={pending && busyVerb === 'publish'}
              disabled={mediaBusy || (pending && busyVerb !== 'publish')}
              onClick={onSubmit}
            >
              {updating ? tPanel('update') : tPanel('publish')}
            </OrganicButton>
          </ModalActions>
        </div>
      </div>
    </section>
  );
}
