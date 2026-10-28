'use client';

import { useEffect, useId, useRef, useState, type Dispatch, type Ref, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { ModalActions } from '@/components/molecules/Modal/ModalActions';
import {
  SegmentedActionBar,
  type SegmentSpec,
} from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { StoryCard, type Story } from '@/components/molecules/StoryCard/StoryCard';
import { TagField } from '@/components/molecules/TagField/TagField';
import { SaveState, type SaveStatus } from '@/components/molecules/CardEditor/SaveState';
import { useMyProfile } from '@/lib/data/hooks';
import { previewPalette } from '@/lib/design/cardColours';
import type { CardMedia, Visibility } from '@/lib/db/types';
import { excerpt, plainText } from '@/lib/markdown/plainText';
import { readMinutes } from '@/lib/readTime';
import { CoverFrame, useCoverEditor } from './CoverSlot';
import modalStyles from '@/components/molecules/Modal/Modal.module.css';
import styles from './PublishStep.module.css';

/**
 * What a card is, as the step offers it (卡片類型, round 8 §2.2): shared under
 * the author's pen name, shared with no name on it, or a 私人卡 — the author's
 * alone, finished or not (`private`: a draft, or a published card made
 * private, which people see as one). Anonymity is only ever a question for a
 * card others read, so it is one of the three, not a switch beside them (an
 * anonymous card is public or private, never for connections only — the
 * server refuses that).
 */
export type Audience = 'public' | 'anonymous' | 'private';

export const AUDIENCES: readonly Audience[] = ['public', 'anonymous', 'private'];

const AUDIENCE_ICON: Record<Audience, IconName> = { public: 'globe', anonymous: 'mask', private: 'lock' };

/** The audience a card's two fields make — none for one kept for connections only (older cards). */
export function audienceOf(visibility: Visibility, anonymous: boolean): Audience | null {
  if (visibility === 'private') return 'private';
  if (visibility === 'public') return anonymous ? 'anonymous' : 'public';
  return null;
}

/**
 * The two fields an audience writes. 只有自己 names a draft (it was never
 * read anonymously: no anonymity is left over from trying 匿名公開), and keeps
 * a live card's as it is — one made private while anonymous must come back
 * anonymous when it is made public again (the card's ⋯ 轉為匿名公開).
 */
export function audienceFields(audience: Audience, current: { anonymous: boolean; live: boolean }): { visibility: Visibility; anonymous: boolean } {
  if (audience === 'private') return { visibility: 'private', anonymous: current.live ? current.anonymous : false };
  return { visibility: 'public', anonymous: audience === 'anonymous' };
}

/** Whether readers have a card now: a published private card is a 私人卡 to them all but its author. */
function seen(visibility: Visibility): boolean {
  return visibility !== 'private';
}

/**
 * The step's name (round 8 §2.3): 更新這張卡片 for a card readers have now
 * (whatever is chosen); else 儲存私人卡 while 私人卡 is chosen and 發布這張卡片
 * otherwise — a draft, or a published card kept private, is a 私人卡 to its
 * author: choosing 公開 publishes it, to them.
 */
export function stepTitleKey(
  mode: 'publish' | 'update',
  visibility: Visibility,
  liveVisibility: Visibility = visibility,
): 'title' | 'saveTitle' | 'updateTitle' {
  if (mode === 'update' && seen(liveVisibility)) return 'updateTitle';
  return visibility === 'private' ? 'saveTitle' : 'title';
}

/**
 * The step's one button (round 8 §2.3): for a card readers have now, 儲存修改 —
 * or 轉為私人卡 when 私人卡 is chosen; for a 私人卡 (never published, or kept private),
 * 發布 · 匿名發布 by the choice, or 儲存 to keep it one.
 */
export function stepVerb(
  mode: 'publish' | 'update',
  visibility: Visibility,
  anonymous: boolean,
  liveVisibility: Visibility = visibility,
): 'publish' | 'publishAnonymously' | 'save' | 'update' | 'makeDraft' {
  if (mode === 'update' && seen(liveVisibility)) return visibility === 'private' ? 'makeDraft' : 'update';
  if (visibility === 'private') return 'save';
  return visibility === 'public' && anonymous ? 'publishAnonymously' : 'publish';
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
  /** The card's id, once it has one: a coverless card's preview wears a family of its own from it (round 9 §8). */
  cardId?: string;
  /**
   * The step is on screen. It stays mounted while the writer writes (what it
   * holds — a cover on its way, the mirror's answer — is kept): it asks the
   * mirror as it is shown, and stops asking as it is hidden.
   */
  active: boolean;
  /**
   * At the split the pane has no bar: the step names itself in its own first
   * row, at the column's start, on the line of the Leave over the map. Below
   * it the host's bar does.
   */
  inlineHeading: boolean;
  /** The inline heading, for the host that moves the focus to it. */
  headingRef?: Ref<HTMLHeadingElement>;
  /**
   * The inline heading's own back to writing (繼續寫), before its name: beside the map, whose Leave leaves the
   * page. At the whole width the Leave is the one back (round 17 §5.3) and the heading has none.
   */
  onBack?: () => void;
  values: PublishStepValues;
  onTagsChange: Dispatch<SetStateAction<string[]>>;
  /** Who can see it, and under whose name (audienceFields): one change, so no write is ever anonymous and for connections only. */
  onAudienceChange: (next: { visibility: Visibility; anonymous: boolean }) => void;
  onCoverChange: (media: CardMedia | undefined, accentHue: number | null) => void;
  /** The card answers another (it is a resonance). */
  resonance: boolean;
  /**
   * The card was once sent privately in a message: while 匿名公開 is chosen, a
   * line says whoever read it knows who wrote it. A warning only — the verb stays.
   */
  sharedPrivately?: boolean;
  /** For `update`: how readers have the card now (a private one is a 私人卡 to them). */
  liveVisibility?: Visibility;
  /** The editor's save state, said at the end of the inline heading row (at the split, where there is no bar). */
  saveStatus?: SaveStatus | null;
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
  /** The one button: 發布 · 匿名發布 · 儲存 · 儲存修改 · 轉為私人卡. */
  onSubmit: () => void;
  /** 捨棄修改: a live card's revision dropped. */
  onSecondary: () => void;
  /** Whether 捨棄修改 shows (a live card, only while there is a revision). */
  showSecondary: boolean;
}

/** What the mirror answered for a text, kept for as long as the step is: coming back with the same words asks nothing. */
interface Reflection {
  key: string;
  value: string | null;
}

/**
 * The writer's second step, 發布這張卡片 (儲存私人卡 while 私人卡 is chosen,
 * 更新這張卡片 for a card readers have): one screen in place of the editor —
 * the publish panel grown into a page (ux §6 單一畫面鐵律: publishing is still
 * two taps, ✓ then 發布). Top to bottom: the mirror line (publish only), the
 * card as a list will show it with its cover edited on its picture, 標籤,
 * 卡片類型 (公開 · 匿名公開 · 私人卡 — no line under it: the preview's byline
 * follows the choice), a line saying whether a resonance reaches its
 * original, then the foot: one button whose verb follows the card and the
 * choice (stepVerb), and 捨棄修改 beside it only for a live card's revision.
 * Every choice here is the editor's own value and autosaves with the draft
 * (or the live card's pending edit); going back to writing keeps them.
 */
export function PublishStep({
  mode,
  cardId,
  active,
  inlineHeading,
  headingRef,
  onBack,
  values,
  onTagsChange,
  onAudienceChange,
  onCoverChange,
  resonance,
  sharedPrivately = false,
  liveVisibility,
  saveStatus = null,
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
  const updating = mode === 'update';
  const { thoughtCore, story, tags, visibility, anonymous, media, accentHue } = values;
  // The preview's colour family: its cover's, else its own from its id (never the first family on every card),
  // which the cover's controls wear too.
  const palette = previewPalette(accentHue, cardId);
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
    avatarColor: anonymous ? undefined : me?.accentColor || undefined,
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

  const live = liveVisibility ?? visibility;
  const title = tPanel(stepTitleKey(mode, visibility, live));
  const audience = audienceOf(visibility, anonymous);
  const verb = stepVerb(mode, visibility, anonymous, live);
  // About readers: only for a card they have now, which stays theirs.
  const showsUpdateHint = updating && live !== 'private' && visibility !== 'private';
  // Nothing above the preview (no heading of its own, no hint, no mirror line): on a phone its
  // band is the first thing under the bar, which it meets as the feed's first card does.
  const underBar = !inlineHeading && !showsUpdateHint && (!insight || insight.state === 'none');

  return (
    <section
      className={styles.step}
      aria-label={inlineHeading ? undefined : title}
      aria-labelledby={inlineHeading ? headingId : undefined}
      data-step-pending={pending || undefined}
    >
      {/* At the split the step names itself at the column's start, on the line of the Leave over the map: beside
          the map with a back of its own to writing (the Leave leaves the page); at the whole width without one,
          the Leave being the one back there (round 17 §5.3). */}
      {inlineHeading && (
        <div className={styles.headingRow}>
          {onBack && (
            <BareIconButton
              icon="arrow-right"
              mirror
              tone="ink"
              iconSize={22}
              label={t('leaveStay')}
              tip="below"
              tipAlign="start"
              seed={13}
              className={styles.headingBack}
              disabled={pending}
              onClick={onBack}
            />
          )}
          <div className={styles.headingTitles}>
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.heading}>
              {title}
            </h2>
            <div className={styles.headingState}>
              <SaveState status={saveStatus} />
            </div>
          </div>
        </div>
      )}
      {/* What readers will see changes: said only while there are readers, and they stay. */}
      {showsUpdateHint && <p className={styles.hint}>{tPanel('updateHint')}</p>}

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
              palette={palette}
              coverSlot={<CoverFrame cover={cover} palette={palette} />}
            />
          </div>
          <p id={captionId} className={styles.caption}>
            {t('previewCaption')}
          </p>
        </div>

        {/* 3 — tags: the label on its own line, the chosen tags under it, then the field (TagField) */}
        <div className={styles.group}>
          <TagField
            id={tagsId}
            tags={tags}
            onChange={onTagsChange}
            onSuggest={() => void suggestTags()}
            suggesting={suggestingTags}
            error={tagError}
          />
        </div>

        {/* 4 — what the card is: shared under its author's name, shared with none, or a 私人卡 */}
        <div className={styles.group}>
          <span className={styles.label}>{tVis('label')}</span>
          <div className={styles.choice}>
            {/* A segmented choice with no pen line (its options are buttons):
                a quiet paper-dark track shows the control's extent, and the
                chosen side wears the tonal peach with the deep terracotta
                label (4.8:1); the others keep a muted ink deep enough to read
                on the track. A card kept for connections only (older ones)
                shows none chosen and keeps its audience until one is. */}
            <SegmentedActionBar
              fill="var(--color-cream-dark)"
              segments={AUDIENCES.map((a) => {
                const chosen = audience === a;
                const ink = chosen
                  ? 'var(--button-on-tonal)'
                  : 'var(--segment-idle-ink)';
                return {
                  key: a,
                  icon: <Icon name={AUDIENCE_ICON[a]} size={16} color={ink} />,
                  label: tVis(a === 'private' ? 'draft' : a),
                  fill: chosen ? 'var(--button-tonal)' : 'transparent',
                  textColor: ink,
                  hoverOverlay: 'color-mix(in oklch, var(--toward-ink) 5%, transparent)',
                  pressed: chosen,
                  onClick: () => onAudienceChange(audienceFields(a, { anonymous, live: updating })),
                } satisfies SegmentSpec;
              })}
            />
          </div>
        </div>

        {/* 5 — 匿名公開 hides the name from no one who was sent the card privately (warn, never refuse) */}
        {sharedPrivately && audience === 'anonymous' && (
          <p className={styles.resonance} role="note">
            <Icon name="lock" size={14} color="var(--color-terracotta)" />
            <span>{tVis('sharedWarning')}</span>
          </p>
        )}

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

      <div className={styles.footRule}>
        <Divider seed={47} spacing={2} />
      </div>

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
            {updating && showSecondary && (
              <OrganicButton
                variant="tonal"
                size="sm"
                loading={pending && busyVerb === 'leave'}
                disabled={pending && busyVerb !== 'leave'}
                onClick={onSecondary}
              >
                {t('discardChanges')}
              </OrganicButton>
            )}
            <OrganicButton
              variant="solid"
              size="sm"
              loading={pending && busyVerb === 'publish'}
              disabled={mediaBusy || (pending && busyVerb !== 'publish')}
              onClick={onSubmit}
            >
              {tPanel(verb)}
            </OrganicButton>
          </ModalActions>
        </div>
      </div>
    </section>
  );
}
