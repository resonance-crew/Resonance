'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { OrganicMenuPanel, menuPanelHeight } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { seedFromId } from '@/lib/design/bubble';
import { canReact } from '@/lib/chat/message';
import { placePopover } from '@/lib/chat/menuPlacement';
import type { ReactionId } from '@/lib/design/reactions';
import { ReactionTray, TRAY_H, TRAY_W } from './ReactionTray';
import { chooseMenuItem, messageMenuItems, useThreadActions, type PressedMessage } from './threadActions';
import styles from './Thread.module.css';

/** How long it stays after a choice, showing the ink the click spread. */
const CHOICE_MS = 150;
/** Rows whose choice moves the focus somewhere of its own (the composer, a dialog): it isn't given back to the button. */
const TAKES_FOCUS = new Set(['reply', 'unsend', 'report']);

export interface MessagePopoverProps {
  /** The message, and which part a fine pointer asked for (`popover`) from which button (`opener`). */
  pressed: PressedMessage;
  own: boolean;
  /** The message's full time, the action list's quiet last line. */
  fullTime: string;
  /** It went: with what the focus goes back to (the ☺ / ⋯ / chip that opened it), or null. */
  onClose: (focusBack: HTMLElement | null) => void;
}

/**
 * What a mouse's ☺ or ⋯ beside a message opens (round 16 review M3): only
 * the part it names, beside it — the ☺ (or a reaction chip) the five
 * reactions on their borderless paper (ReactionTray), 8 over it; the ⋯ the
 * actions as a floating dropdown at it, the message menu's sheet (no pen,
 * no dividers, its time the quiet last line), as every other ⋯ on the web
 * drops its OrganicMenu. No scrim, nothing lifted, nothing gliding: the
 * pointer stays where it was, and so does the thread. A held finger keeps
 * the whole overlay (MessageMenuOverlay).
 *
 * A dialog to the keyboard, as the overlay is: the focus lands on the
 * reactions (a toolbar, ← →) or the actions (↑ ↓); Escape, or Tab out of
 * it, puts it away and gives the focus back to the button; a press outside
 * it, or the thread scrolling under it, puts it away.
 */
export function MessagePopover({ pressed, own, fullTime, onClose }: MessagePopoverProps) {
  const t = useTranslations('messages');
  const tNative = useTranslations('native');
  const tSafety = useTranslations('safety');
  const actions = useThreadActions();
  const { message, link, opener } = pressed;
  const part = pressed.popover ?? 'actions';
  const [leaving, setLeaving] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number; side: 'above' | 'below' } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const timer = useRef<number | null>(null);

  const items =
    part === 'actions'
      ? messageMenuItems(
          message,
          link,
          {
            reply: t('reply'),
            copy: tNative('copy'),
            openLink: t('openLink'),
            copyLink: t('copyLink'),
            unsend: t('unsend'),
            report: tSafety('reportThisMessage'),
            retry: t('retry'),
            discard: t('discardFailed'),
          },
          { withReply: actions.canWrite, viewerId: actions.viewerId },
        )
      : [];
  const trayShown = part === 'react' && actions.canReact && canReact(message);
  const current = message.reactions?.[actions.viewerId] ?? null;
  const empty = part === 'react' ? !trayShown : items.length === 0;

  /** Puts it away; the focus goes back to the button unless the choice took it somewhere of its own. */
  const dismiss = (giveBack: boolean) => {
    if (closing.current) return;
    closing.current = true;
    setLeaving(true);
    timer.current = window.setTimeout(() => onClose(giveBack ? (opener ?? null) : null), 120);
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);

  // Nothing left to offer (the reactions closed meanwhile): it goes at once.
  useEffect(() => {
    if (empty) onClose(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empty]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismissRef.current(true);
      }
    };
    // A press outside puts it away (the button that opened it closes it itself, as a toggle), leaving the focus
    // where the press puts it.
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || opener?.contains(target)) return;
      dismissRef.current(false);
    };
    // It stays where it opened: whatever scrolls under it takes it away.
    const onScroll = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) dismissRef.current(false);
    };
    const onResize = () => dismissRef.current(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [opener]);

  // Placed by its button, once its own size is known (the action list grows to its longest row) — before it is
  // painted; meanwhile it is see-through, not hidden, so the focus can land in it.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !opener) return;
    const anchor = opener.getBoundingClientRect();
    const width = part === 'react' ? TRAY_W : root.offsetWidth || 216;
    const height = part === 'react' ? TRAY_H : menuPanelHeight(items.length, true);
    setPlace(
      placePopover({
        anchor,
        width,
        height,
        prefer: part === 'react' ? 'above' : 'below',
        align: own ? 'end' : 'start',
        viewport: { width: window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight },
      }),
    );
    // Only as it opens: it never follows (anything that would move it closes it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The focus lands on the reactions — from the keyboard on their chosen one (else the first), from a pointer on
  // the tray itself, which wears no ring. The actions take theirs from the panel (`autoFocus`).
  useLayoutEffect(() => {
    if (part !== 'react') return;
    const tray = trayRef.current;
    const cell = tray?.querySelector<HTMLElement>('[tabindex="0"]');
    (pressed.byKeyboard && cell ? cell : tray)?.focus({ preventScroll: true });
    // Only as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The reactions are one stop: Tab out of them puts the popover away, back on the button (the actions' rows
  // walk on Tab themselves and say when the last is left, `onTabOut`).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || part !== 'react') return;
    e.preventDefault();
    dismiss(true);
  };

  const pick = (reaction: ReactionId | null) => {
    actions.react(message, reaction);
    window.setTimeout(() => dismissRef.current(true), CHOICE_MS);
  };

  if (empty) return null;
  const side = own ? 'right' : 'left';
  const style: CSSProperties = place
    ? { top: place.top, left: place.left, transformOrigin: `${side} ${place.side === 'above' ? 'bottom' : 'top'}` }
    : { top: 0, left: 0, opacity: 0, pointerEvents: 'none' };

  return createPortal(
    <div
      ref={rootRef}
      className={styles.popover}
      data-leaving={leaving || undefined}
      data-part={part}
      style={style}
      role="dialog"
      aria-label={part === 'react' ? t('react') : tSafety('menuLabel')}
      onKeyDown={onKeyDown}
    >
      {part === 'react' ? (
        <ReactionTray ref={trayRef} current={current} onPick={pick} seed={seedFromId(message.key, 31)} />
      ) : (
        <OrganicMenuPanel
          items={items}
          seed={seedFromId(message.key, 23)}
          footer={fullTime}
          wide
          origin={`${place?.side === 'above' ? 'bottom' : 'top'} ${side}`}
          autoFocus={pressed.byKeyboard ? 'row' : 'panel'}
          onTabOut={() => dismiss(true)}
          onChoose={(key) => {
            // Done in the click itself (a copy, a page opened, the field focused for a reply), then it goes,
            // staying long enough to show the ink the click spread.
            chooseMenuItem(key, message, link, actions);
            window.setTimeout(() => dismissRef.current(!TAKES_FOCUS.has(key)), CHOICE_MS);
          }}
        />
      )}
    </div>,
    document.body,
  );
}
