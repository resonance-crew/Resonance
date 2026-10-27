'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useDimmedChrome } from '@/components/molecules/Modal/Modal';
import { OrganicMenuPanel, menuPanelHeight } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { seedFromId } from '@/lib/design/bubble';
import { canReact } from '@/lib/chat/message';
import { MENU_MARGIN, alignToMessage, placeMessageMenu } from '@/lib/chat/menuPlacement';
import type { ReactionId } from '@/lib/design/reactions';
import { MessageCore } from './MessageRow';
import { ReactionTray, TRAY_H, TRAY_W } from './ReactionTray';
import { chooseMenuItem, messageMenuItems, useThreadActions, type PressedMessage } from './threadActions';
import styles from './Thread.module.css';

/** How long the overlay stays after a choice, showing the ink the tap spread. */
const CHOICE_MS = 150;
/** A clipped message's room at either side, past which it is cut (it grows from its side, and wobbles). */
const CLIP_SIDE = 16;
/** Rows whose choice moves the focus somewhere of its own (the composer, a dialog): it isn't given back to the opener. */
const TAKES_FOCUS = new Set(['reply', 'unsend', 'report']);

export interface MessageMenuOverlayProps {
  pressed: PressedMessage;
  own: boolean;
  /** The message's full time, the action list's quiet last line. */
  fullTime: string;
  /**
   * It went: with what the focus goes back to (the ☺ / ⋯ / chip that opened it), which the host focuses once the
   * message is drawn in its place again — until then it, and its tools, are hidden there.
   */
  onClose: (focusBack: HTMLElement | null) => void;
}

/**
 * What holding a message opens (round 16 §3; LINE's and Instagram's feel):
 * the thread dims under the palette's scrim and the message — its quote,
 * its bubble with all it carries, its reactions — is lifted out where it
 * lies, a little larger, which is what says it is the one chosen. The five
 * reactions lie directly above it, on a borderless paper sheet; the actions
 * directly below it, on the same paper with no rows' lines, its full time
 * the quiet last line. When that doesn't fit where the message is, the
 * message glides by the least distance that fits — never the menus flip
 * (lib/chat/menuPlacement).
 *
 * A dialog to the keyboard: the focus lands on the reactions (a toolbar,
 * ← →), Tab goes on to the actions and round again, Escape — or a tap on the
 * scrim — puts it away, giving the focus back to the ☺ or ⋯ that opened it.
 */
export function MessageMenuOverlay({ pressed, own, fullTime, onClose }: MessageMenuOverlayProps) {
  const t = useTranslations('messages');
  const tNative = useTranslations('native');
  const tSafety = useTranslations('safety');
  const tClose = useTranslations('card.note');
  const actions = useThreadActions();
  const { message, link, rect } = pressed;
  const [leaving, setLeaving] = useState(false);
  // The message glides to its place once it is drawn where it lay.
  const [glided, setGlided] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  // The finger that held the message lifts over the scrim, and a browser may call that a tap on it: only a
  // press that began on the scrim (or the keyboard's Enter on it) puts the menu away.
  const pressedScrim = useRef(false);

  const items = messageMenuItems(
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
  );
  const trayShown = actions.canReact && canReact(message);
  const current = message.reactions?.[actions.viewerId] ?? null;

  // The browser's bars dim with the window, as under a modal.
  useDimmedChrome(true);

  /** Puts it away; the focus goes back to what opened it unless the choice took it somewhere of its own. */
  const dismiss = (giveBack = true) => {
    if (closing.current) return;
    closing.current = true;
    setLeaving(true);
    window.setTimeout(() => onClose(giveBack ? (pressed.opener ?? null) : null), 120);
  };

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The focus lands on the reactions — opened from the keyboard, on their chosen one (else the first); by a finger
  // or a pointer, on the tray itself, which wears no ring under it — else on the list (not its first row): a
  // screen reader is in it at once, and ← → or Tab start from there.
  useLayoutEffect(() => {
    const tray = trayRef.current;
    const cell = tray?.querySelector<HTMLElement>('[tabindex="0"]');
    if (tray) (pressed.byKeyboard && cell ? cell : tray).focus({ preventScroll: true });
    else listRef.current?.querySelector<HTMLElement>('[role="menu"]')?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(() => setGlided(true));
    return () => window.cancelAnimationFrame(frame);
    // Only as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab walks the reactions (one stop) and the actions, and round again: nothing behind the scrim takes it.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const stops = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="toolbar"] [tabindex="0"], [role="menuitem"]') ?? []);
    if (!stops.length) return;
    const at = stops.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : at < 0 || at === stops.length - 1 ? 0 : at + 1;
    e.preventDefault();
    stops[next].focus();
  };

  const vw = window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const listH = items.length ? menuPanelHeight(items.length, true, true) : 0;
  const place = placeMessageMenu({ top: rect.top, height: rect.height, viewport: vh, trayH: trayShown ? TRAY_H : 0, listH });
  const side = own ? 'right' : 'left';
  const liftStyle: CSSProperties = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    transform: glided ? `translateY(${place.shift}px)` : undefined,
    // Clipped (its foot fading out), with room at its sides for the 3 % it grows by and its wobble.
    ...(place.clipped ? { height: place.shown, left: rect.left - CLIP_SIDE, width: rect.width + 2 * CLIP_SIDE, paddingInline: CLIP_SIDE } : {}),
  };
  const trayStyle: CSSProperties = { top: place.trayTop, left: alignToMessage(TRAY_W, rect.left, rect.right, own, vw) };
  const listStyle: CSSProperties = {
    top: place.listTop,
    ...(own ? { right: Math.max(MENU_MARGIN, vw - rect.right) } : { left: Math.max(MENU_MARGIN, rect.left) }),
  };

  const pick = (reaction: ReactionId | null) => {
    navigator.vibrate?.(6);
    actions.react(message, reaction);
    window.setTimeout(() => dismiss(), CHOICE_MS);
  };

  return createPortal(
    <div
      ref={rootRef}
      className={styles.overlay}
      data-leaving={leaving || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={tSafety('menuLabel')}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className={styles.scrim}
        aria-label={tClose('close')}
        tabIndex={-1}
        onPointerDown={() => {
          pressedScrim.current = true;
        }}
        onClick={(e) => {
          if (pressedScrim.current || e.detail === 0) dismiss();
        }}
      />
      <div className={styles.liftedPlace} data-clipped={place.clipped || undefined} style={liftStyle} aria-hidden="true">
        <div className={styles.lifted} data-own={own || undefined} style={{ transformOrigin: `${side} ${place.clipped ? 'top' : 'center'}` }}>
          <MessageCore message={message} own={own} position={pressed.position} carried={pressed.carried} interactive={false} />
        </div>
      </div>
      {trayShown && (
        <div className={styles.overlayTray} style={trayStyle}>
          <ReactionTray ref={trayRef} current={current} onPick={pick} seed={seedFromId(message.key, 31)} />
        </div>
      )}
      {items.length > 0 && (
        <div ref={listRef} className={styles.overlayMenu} style={listStyle}>
          <OrganicMenuPanel
            items={items}
            seed={seedFromId(message.key, 23)}
            footer={fullTime}
            origin={`top ${side}`}
            sheet
            onChoose={(key) => {
              // Done in the tap itself — a copy, a page opened, the field focused for a reply (iOS raises the
              // keyboard only for a focus the tap gave) — then the menu goes, staying long enough to show the
              // ink the tap spread.
              chooseMenuItem(key, message, link, actions);
              window.setTimeout(() => dismiss(!TAKES_FOCUS.has(key)), CHOICE_MS);
            }}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}
