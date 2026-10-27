'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { FieldHint, Input } from '@/components/atoms/Field/Field';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Modal } from '@/components/molecules/Modal/Modal';
import { SegmentedActionBar, type SegmentSpec } from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { linkTarget } from '@/lib/links/soleLink';
import type { LinkDisplay } from '@/lib/markdown/storyLinkEdit';
import styles from './LinkEditor.module.css';

/** What the link editor opens with, read off the selection when it is asked for. */
export interface LinkSession {
  /** The caret's link (or a picked card's), else empty — never the clipboard's. */
  href: string;
  /** How it opens: the link's own way, else 文字 for selected words, 卡片 on an empty line. */
  display: LinkDisplay;
  /** 卡片 | 文字 is offered: the link is, or will be, alone in its paragraph (`canCard`). */
  offerCard: boolean;
  /** An existing link is being edited (移除連結 shows). */
  editing: boolean;
}

export interface LinkEditorProps {
  /** The session while it is open, else null (closed). */
  session: LinkSession | null;
  /** Bumped each time it opens, so a second opening starts from its session again. */
  sessionKey: number;
  /** 完成: false when the address isn't one we link to (the field then says so). */
  onApply: (href: string, display: LinkDisplay) => boolean;
  onRemove: () => void;
  /** Closed with nothing changed (the backdrop, Escape): back to the story. */
  onCancel: () => void;
  seed: number;
}

const DISPLAYS: LinkDisplay[] = ['card', 'text'];

/**
 * The writer's link editor (round 17 §6.2): the house dialog (molecules/Modal,
 * no ✕ — the backdrop and Escape close it), at every width and pointer —
 * 「插入連結」 for a new link, 「編輯連結」 for one already there; the address
 * field across its width (the caret's link, never the clipboard's: a paste is
 * the writer's), focused with its text selected; 顯示為 on its own line and
 * the 卡片 | 文字 choice under it — the publish step's segmented choice — only
 * where the link is or will be alone in its paragraph; and the foot:
 * 移除連結 (quiet) at its start for a link being edited, 完成 at its end.
 * Enter is 完成. An address the link rules don't take (`linkTarget`: http(s)
 * only, a bare `example.com/x` gets https://) keeps it open with one muted
 * line under the field. On a phone it sits centred in the room the keyboard
 * leaves; closed, the story has its focus and selection back (its host's).
 */
export function LinkEditor({ session, sessionKey, onApply, onRemove, onCancel, seed }: LinkEditorProps) {
  const t = useTranslations('write.editor');
  const title = session?.editing ? t('linkEdit') : t('insertLink');
  return (
    <Modal
      open={session != null}
      onClose={onCancel}
      seed={seed + 107}
      maxWidth="min(400px, calc(100vw - 32px))"
      padding="26px 24px 22px"
      ariaLabel={title}
      keyboardAware
    >
      {session && <LinkForm key={sessionKey} session={session} title={title} seed={seed} onApply={onApply} onRemove={onRemove} />}
    </Modal>
  );
}

function LinkForm({
  session,
  title,
  seed,
  onApply,
  onRemove,
}: {
  session: LinkSession;
  title: string;
  seed: number;
  onApply: LinkEditorProps['onApply'];
  onRemove: () => void;
}) {
  const t = useTranslations('write.editor');
  const [value, setValue] = useState(session.href);
  const [display, setDisplay] = useState<LinkDisplay>(session.offerCard ? session.display : 'text');
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const showAsId = useId();
  const errorId = useId();

  // The field takes the focus as the dialog opens, its address selected to be typed over.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }, []);

  function apply() {
    if (!linkTarget(value) || !onApply(value, display)) {
      setInvalid(true);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      apply();
    }
  }

  return (
    <div
      className={styles.editor}
      role="group"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      // A press on its buttons keeps the focus in the field (Safari never focuses a clicked button).
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest('input')) e.preventDefault();
      }}
    >
      <h3 id={titleId} className={styles.title}>
        {title}
      </h3>
      <div className={styles.field}>
        <Input
          ref={inputRef}
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          seed={seed + 3}
          value={value}
          placeholder={t('linkPlaceholder')}
          aria-label={t('linkPlaceholder')}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
        />
        <div id={errorId} aria-live="polite" className={styles.error}>
          {invalid && <FieldHint>{t('linkInvalid')}</FieldHint>}
        </div>
      </div>
      {session.offerCard && (
        <div className={styles.showAs}>
          <span id={showAsId} className={styles.label}>
            {t('linkShowAs')}
          </span>
          <div className={styles.choice}>
            {/* The publish step's segmented choice: a paper-dark track, the chosen side the tonal peach. */}
            <SegmentedActionBar
              fill="var(--color-cream-dark)"
              seed={seed + 11}
              ariaLabelledBy={showAsId}
              segments={DISPLAYS.map((d) => {
                const chosen = display === d;
                const ink = chosen ? 'var(--button-on-tonal)' : 'var(--segment-idle-ink)';
                return {
                  key: d,
                  icon: <Icon name={d === 'card' ? 'cards' : 'link'} size={15} color={ink} />,
                  label: t(d === 'card' ? 'linkAsCard' : 'linkAsText'),
                  fill: chosen ? 'var(--button-tonal)' : 'transparent',
                  textColor: ink,
                  hoverOverlay: 'color-mix(in oklch, var(--toward-ink) 5%, transparent)',
                  pressed: chosen,
                  onClick: () => setDisplay(d),
                } satisfies SegmentSpec;
              })}
            />
          </div>
        </div>
      )}
      <div className={styles.actions}>
        {session.editing && (
          <OrganicButton variant="text" size="sm" onClick={onRemove}>
            {t('linkRemove')}
          </OrganicButton>
        )}
        <span className={styles.spacer} />
        <OrganicButton variant="solid" size="sm" onClick={apply}>
          {t('linkApply')}
        </OrganicButton>
      </div>
    </div>
  );
}
