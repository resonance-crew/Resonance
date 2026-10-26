'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BrandMark } from '@/components/atoms/BrandMark/BrandMark';
import { OrganicMenu, type OrganicMenuItem } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { useToast } from '@/components/providers/ToastProvider';
import {
  PLATFORM_NAMES,
  SHARE_PLATFORMS,
  intentUrl,
  popupFeatures,
  sharePostText,
  shareTitle,
  shareUrl,
  type SharePlatform,
  type ShareTarget,
  type ShareTranslate,
} from '@/lib/share/links';

export interface ShareMenuProps {
  /** What is shared: a card (the page passes its slug, title and anonymity; a pen name only when it is named) or a profile. */
  target: ShareTarget;
  /** The trigger's and the panel's wobble (the card page: its hue + 5, the ⋯ beside it keeping + 3). */
  seed?: number;
  /**
   * A quiet line under the rows — for the owner of an anonymous card,
   * `share.anonymousHint`. With one, a touch screen opens the menu (copy,
   * 更多分享方式, the hint) instead of going straight to the system sheet,
   * so the person it is for always reads it.
   */
  hint?: string;
  /** Where the bare trigger's tooltip hangs. */
  tip?: 'above' | 'below';
  className?: string;
}

type RowKey = 'copy' | SharePlatform | 'more';

/** What the panel holds, decided as the trigger is clicked (the browser alone knows it). */
interface PanelRows {
  platforms: boolean;
  more: boolean;
}

/** The browser can hand this link to the system's share sheet. */
function systemShareFor(url: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  try {
    return navigator.canShare?.({ url }) ?? true;
  } catch {
    return false;
  }
}

function pointerIs(kind: 'coarse' | 'fine'): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(`(pointer: ${kind})`).matches;
}

/**
 * The share glyph on a card page (beside its ⋯) and a profile: the existing
 * hand-drawn `share` tray as a bare OrganicMenu trigger.
 *
 * - On a touch screen whose browser has Web Share, a tap opens the system's
 *   share sheet at once (`navigator.share({ title, url })`, the link only,
 *   inside the tap so it keeps the user activation): no menu. A dismissed
 *   sheet says nothing; a refused one copies the link instead.
 * - Everywhere else — a desktop, an iPad with a trackpad, an in-app browser
 *   without Web Share — it drops the menu: 複製連結, LINE, Threads,
 *   Facebook, X (each brand's own mark, atoms/BrandMark), and 更多分享方式
 *   where the browser has Web Share. A platform row opens that platform's
 *   web intent (lib/share/links) in a popup under a fine pointer, a new tab
 *   otherwise; no SDK, no script of theirs on our page.
 * - The owner of an anonymous card always gets the menu, with the hint under
 *   it (on a touch screen with Web Share: copy, the system sheet, the hint).
 *
 * The server renders the same bare trigger in every case: what a click does
 * is decided only when it happens. It reads nothing — everything it shares
 * comes from the page. Copying says so through the shell's toast.
 */
export function ShareMenu({ target, seed = 5, hint, tip, className }: ShareMenuProps) {
  const t = useTranslations();
  const translate = t as unknown as ShareTranslate;
  const toast = useToast();
  const [rows, setRows] = useState<PanelRows>({ platforms: true, more: false });

  const url = () => shareUrl(target);

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(url());
      toast.show({ message: t('share.copied') });
    } catch {
      toast.show({ message: t('share.copyFailed') });
    }
  }

  function systemShare() {
    const link = url();
    navigator.share({ title: shareTitle(target, translate), url: link }).catch((e: unknown) => {
      // The reader put the sheet away: nothing to say.
      if (e instanceof Error && e.name === 'AbortError') return;
      // Refused for any other reason: the link is still theirs to paste.
      void copy();
    });
  }

  function openIntent(platform: SharePlatform) {
    const href = intentUrl(
      platform,
      { url: url(), text: sharePostText(target, translate) },
      { metaAppId: process.env.NEXT_PUBLIC_META_APP_ID },
    );
    if (pointerIs('fine')) window.open(href, 'resonance-share', popupFeatures(window));
    else window.open(href, '_blank', 'noopener,noreferrer');
  }

  const items: OrganicMenuItem[] = [
    { key: 'copy', icon: 'copy', label: t('share.copyLink') },
    ...(rows.platforms
      ? SHARE_PLATFORMS.map<OrganicMenuItem>((platform) => ({
          key: platform,
          icon: <BrandMark name={platform} />,
          label: PLATFORM_NAMES[platform],
          ariaLabel: t('share.on', { platform: PLATFORM_NAMES[platform] }),
        }))
      : []),
    ...(rows.more ? [{ key: 'more', icon: 'share', label: t('share.more') } satisfies OrganicMenuItem] : []),
  ];

  return (
    <OrganicMenu
      className={className}
      label={target.kind === 'card' ? t('card.share') : t('share.profile')}
      seed={seed}
      bare
      tip={tip}
      triggerIcon="share"
      // 複製連結 and 更多分享方式 in the brands' marks' near-black, so the column reads as one.
      glyphs="ink"
      items={items}
      footer={hint}
      footerWrap
      onTriggerClick={() => {
        const more = systemShareFor(url());
        const touch = pointerIs('coarse');
        // A touch screen with the system sheet goes straight to it — unless there is a hint to read first.
        if (touch && more && !hint) {
          systemShare();
          return true;
        }
        setRows({ platforms: !(touch && more), more });
        return false;
      }}
      onChoose={(key) => {
        const row = key as RowKey;
        if (row === 'copy') void copy();
        else if (row === 'more') systemShare();
        else openIntent(row);
      }}
    />
  );
}
