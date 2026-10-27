'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { ButtonLoader } from '@/components/atoms/ButtonLoader/ButtonLoader';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { RowBrushes, useRowInk } from '@/components/atoms/RowInk/RowInk';
import { PaperSheet, sheetPath } from '@/components/atoms/PaperSheet/PaperSheet';
import { SignOutConfirmModal } from '@/components/molecules/SignOutConfirmModal/SignOutConfirmModal';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from '@/i18n/navigation';
import { rowBoundary, rowRegion } from '@/lib/design/rowMenu';
import { INK } from '@/lib/design/strokes';
import styles from './Subnavbar.module.css';

type ItemKey = 'me' | 'messages' | 'settings' | 'signOut';

interface MenuItem {
  key: ItemKey;
  icon: IconName;
  href?: '/me' | '/messages' | '/settings';
  tone?: 'danger';
}

const ITEMS: MenuItem[] = [
  { key: 'me', icon: 'cards', href: '/me' },
  { key: 'messages', icon: 'chat', href: '/messages' },
  { key: 'settings', icon: 'pen', href: '/settings' },
  { key: 'signOut', icon: 'logout', tone: 'danger' },
];

// The ink of each row: terracotta, and the warning yellow for signing out (which rests on a lighter one).
const INK_WASHES = ITEMS.map((item) =>
  item.key === 'signOut'
    ? 'color-mix(in oklch, var(--color-yellow) 40%, transparent)'
    : 'color-mix(in oklch, var(--color-terracotta) 13%, transparent)',
);
const REST_WASHES = ITEMS.map((item) => (item.key === 'signOut' ? 'color-mix(in oklch, var(--color-yellow) 30%, transparent)' : null));
/** The sheet (round 17 §1, OrganicMenu's): 6 of paper over the first row and under the last, rows 44, corners 20. */
const SHEET_PAD = 6;
const ROW_H = 44;
const SHEET_R = 20;

export interface SubnavbarProps {
  user: {
    initials: string;
    handle: string;
    accentColor: string;
    avatarUrl?: string;
    avatarSeed?: string;
  };
  /** Seed so the wobble of the dropped card is deterministic per-instance. */
  seed?: number;
}

/**
 * Account menu hanging off the header avatar. Closed, it's just the avatar;
 * clicking it drops an organic wobbly card — the same hand-drawn language as
 * `<Select>` — listing 我的卡片盒 / 設定 / 登出, with wavy pen dividers between
 * rows and the active row washed in along the curved divider regions.
 */
export function Subnavbar({ user, seed = 91 }: SubnavbarProps) {
  const t = useTranslations('app.nav');
  const locale = useLocale();
  const auth = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [interactionMode, setInteractionMode] = useState<'mouse' | 'keyboard'>('keyboard');
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const uid = useId().replace(/:/g, '');

  function openMenu() {
    setActiveIndex(0);
    setInteractionMode('keyboard');
    setOpen(true);
  }

  const activate = useCallback(
    async (i: number) => {
      const item = ITEMS[i];
      if (!item) return;
      if (item.href) {
        setOpen(false);
        triggerRef.current?.focus();
        router.push(item.href);
        return;
      }
      if (item.key === 'signOut') {
        // Ask first — the modal owns the actual sign-out.
        setOpen(false);
        setConfirmingSignOut(true);
      }
    },
    [router],
  );

  const confirmSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await auth.signOut();
      window.location.href = `/${locale}/signin`;
    } catch {
      setSigningOut(false);
      setConfirmingSignOut(false);
    }
  }, [auth, locale, signingOut]);

  // Close on outside pointer-down.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: globalThis.MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setInteractionMode('keyboard');
        if (!open) openMenu();
        else setActiveIndex((i) => Math.min(ITEMS.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setInteractionMode('keyboard');
        if (!open) openMenu();
        else setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) {
          setInteractionMode('keyboard');
          openMenu();
        }
        else void activate(activeIndex);
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className={styles.trigger}
        data-open={open || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${uid}-menu`}
        aria-label={user.handle}
        aria-activedescendant={open ? `${uid}-opt-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        onMouseEnter={() => setInteractionMode('mouse')}
        onMouseDown={() => setInteractionMode('mouse')}
      >
        <HandDrawnAvatar
          src={user.avatarUrl}
          initials={user.initials}
          size={36}
          color={user.accentColor}
          seed={Number(user.avatarSeed) || 77}
        />
      </button>

      {open && (
        <SubnavPanel
          seed={seed}
          uid={uid}
          activeIndex={activeIndex}
          interactionMode={interactionMode}
          setInteractionMode={setInteractionMode}
          signingOut={signingOut}
          onActivate={setActiveIndex}
          onChoose={(i) => void activate(i)}
          label={(key) => t(key)}
        />
      )}

      <SignOutConfirmModal
        open={confirmingSignOut}
        busy={signingOut}
        onCancel={() => setConfirmingSignOut(false)}
        onConfirm={() => void confirmSignOut()}
      />
    </div>
  );
}

interface SubnavPanelProps {
  seed: number;
  uid: string;
  activeIndex: number;
  interactionMode: 'mouse' | 'keyboard';
  setInteractionMode: (mode: 'mouse' | 'keyboard') => void;
  signingOut: boolean;
  onActivate: (i: number) => void;
  onChoose: (i: number) => void;
  label: (key: ItemKey) => string;
}

function SubnavPanel({
  seed,
  uid,
  activeIndex,
  interactionMode,
  setInteractionMode,
  signingOut,
  onActivate,
  onChoose,
  label,
}: SubnavPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const h = SHEET_PAD * 2 + ITEMS.length * ROW_H;
  const [{ w }, setDims] = useState({ w: 0 });

  // Pre-defined static coordinates since every row option button is exactly ROW_H high
  const rows = useMemo(() => ITEMS.map((_, i) => ({ top: SHEET_PAD + i * ROW_H, height: ROW_H })), []);

  const recompute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setDims({ w: el.offsetWidth });
  }, []);

  useLayoutEffect(() => {
    recompute();
    const ro = new ResizeObserver(recompute);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [recompute]);

  const pad = Math.max(10, h * 0.04);
  const outline = useMemo(() => sheetPath(w, h, SHEET_R, seed + 100), [w, h, seed]);

  // Where one row's band meets the next's: no line is drawn (round 17 §1), the ink keeps to its band.
  const regions = useMemo(() => {
    if (!w) return [];
    const boundaries = rows.slice(1).map((r, i) => rowBoundary(r.top, w, seed + i * 31 + 7, 2, pad));
    return ITEMS.map((_, i) => rowRegion(i, ITEMS.length, boundaries, w, h, pad));
  }, [w, h, rows, seed, pad]);

  // The ink follows the pointer; the keyboard's row only counts while the
  // keyboard is the one driving (after the pointer leaves, the wash withdraws).
  const ink = useRowInk({
    panelRef: ref,
    rows,
    w,
    h,
    activeIndex: interactionMode === 'keyboard' ? activeIndex : null,
  });

  return (
    <div ref={ref} className={styles.panel} style={{ height: `${h}px` }}>
      {w > 0 && <PaperSheet w={w} h={h} R={SHEET_R} seed={seed + 100} />}
      {regions.length === ITEMS.length && (
        <RowBrushes w={w} h={h} outline={outline} bands={regions} ink={ink} fills={INK_WASHES} rests={REST_WASHES} />
      )}
      <div id={`${uid}-menu`} className={styles.list} role="menu" aria-label={label('me')}>
        {ITEMS.map((item, i) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            id={`${uid}-opt-${i}`}
            className={styles.option}
            data-active={i === ink.index || undefined}
            data-tone={item.tone}
            disabled={item.key === 'signOut' && signingOut}
            aria-busy={(item.key === 'signOut' && signingOut) || undefined}
            onClick={() => onChoose(i)}
            {...ink.rowProps(i, () => {
              onActivate(i);
              setInteractionMode('mouse');
            })}
          >
            {/* Signing out: the row keeps its words, its icon's place draws the pen loop (B6). */}
            {item.key === 'signOut' && signingOut ? (
              <span className={styles.optionIcon}>
                <ButtonLoader size={17} />
              </span>
            ) : (
              <Icon name={item.icon} size={17} strokeWidth={INK} className={styles.optionIcon} />
            )}
            <span className={styles.optionLabel}>{label(item.key)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
