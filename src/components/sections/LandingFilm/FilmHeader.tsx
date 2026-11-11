'use client';

/**
 * The film's header: a copy of the site header (sections/SiteHeader) that belongs to the film. Over the stage it is
 * bare — no band, no wave — its ink the hour's chrome ink (cream on the dark sky tops); once the stage has let go it is
 * the site header (its cream band, its soft pen's wave, the text's ink — the theme's, light or dark); in the picture
 * book it scrolls away with the page. The film's state is read by CSS (FilmHeader.module.css), not here: no scroll
 * listener.
 */

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { HamburgerIcon } from '@/components/atoms/HamburgerIcon/HamburgerIcon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { Link, usePathname } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { LanguageSelect } from '@/components/sections/SiteHeader/LanguageSelect';
import { SiteHeaderAvatarPlaceholder } from '@/components/sections/SiteHeader/avatarPlaceholder';
import styles from './FilmHeader.module.css';
import { INK_LIGHT } from '@/lib/design/strokes';
import { useOpenedOnce } from '@/lib/hooks/useOpenedOnce';

// What a signed-in viewer sees reads their profile, and with it the data
// layer: loaded only once someone is signed in, so a signed-out visitor's
// landing and policy pages never load Firestore.
const SiteHeaderAccountMenu = dynamic(() => import('@/components/sections/SiteHeader/SiteHeaderAccount').then((m) => m.SiteHeaderAccountMenu), {
  ssr: false,
  loading: SiteHeaderAvatarPlaceholder,
});
const SiteHeaderSignedInNav = dynamic(() => import('@/components/sections/SiteHeader/SiteHeaderAccount').then((m) => m.SiteHeaderSignedInNav), {
  ssr: false,
});
// The phone menu loads the first time it is opened.
const AppMobileNavModal = dynamic(() =>
  import('@/components/sections/AppHeader/AppMobileNavModal').then((m) => m.AppMobileNavModal),
);

const HEADER_BODY_H = 68;
const HEADER_WAVE_H = 14;
const HEADER_TOTAL_H = HEADER_BODY_H + HEADER_WAVE_H;
// Y of the wavy bottom stroke — the visible bottom edge of the header chrome.
// Centering content within 0…HEADER_STROKE_Y puts it on the visible bar's
// midpoint (rather than the top HEADER_BODY_H, which reads a couple px high).
const HEADER_STROKE_Y = HEADER_BODY_H + HEADER_WAVE_H * 0.35;

function buildHeaderPaths(seed: number) {
  const W = 1440;
  const baseY = HEADER_STROKE_Y;
  const amp = 1.4;
  const steps = 12;
  const pts = wavyPoints(W, baseY, amp, seed, steps);
  const strokeD = pointsToBezier(pts);
  const f = (n: number) => +n.toFixed(2);
  const last = pts[pts.length - 1];
  let maskD = `M 0,0 L ${W},0 L ${f(last[0])},${f(last[1])}`;
  for (let i = pts.length - 2; i >= 0; i--) {
    const [x0, y0] = pts[i + 1];
    const [x1, y1] = pts[i];
    const midX = (x0 + x1) / 2;
    maskD += ` C ${f(midX)},${f(y0)} ${f(midX)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  maskD += ' Z';
  return { maskD, strokeD, W };
}

export const NAV_KEYS = [] as const;
const NAV_TARGETS: Record<(typeof NAV_KEYS)[number], string> = {};

export function FilmHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuLoaded = useOpenedOnce(menuOpen);
  const isMobile = useIsMobile(720);
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();

  const { user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const signedKnown = mounted && !loading;
  const signedIn = signedKnown && user != null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  const { maskD, strokeD, W } = useMemo(() => buildHeaderPaths(211), []);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, target: string) => {
    const onLanding = pathname === '/';
    if (onLanding) {
      e.preventDefault();
      const el = document.getElementById(target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', `#${target}`);
      }
    }
  };

  const maskUrl = useMemo(() => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${HEADER_TOTAL_H}' preserveAspectRatio='none'><path d='${maskD}' fill='white'/></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [maskD, W]);

  return (
    <header className={styles.header} style={{ height: HEADER_TOTAL_H }} data-film-header="">
      <div
        aria-hidden="true"
        className={styles.bg}
        style={{
          WebkitMaskImage: maskUrl,
          maskImage: maskUrl,
        }}
      />
      {/* the night's own band, between the stage letting go and the end's fade reaching the header: a layer of its own,
          so the site's band (.bg) never changes colour while it fades */}
      <div aria-hidden="true" className={styles.night} style={{ WebkitMaskImage: maskUrl, maskImage: maskUrl }} />

      <svg
        aria-hidden="true"
        viewBox={`0 0 ${W} ${HEADER_TOTAL_H}`}
        preserveAspectRatio="none"
        className={styles.waveStroke}
        style={{ height: HEADER_TOTAL_H }}
      >
        <path
          data-pen=""
          d={strokeD}
          fill="none"
          stroke="color-mix(in oklch, var(--soft-pen) 38%, transparent)"
          strokeWidth={INK_LIGHT}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className={styles.row} style={{ height: HEADER_BODY_H }}>
        {/* (no prefetch on the film's header: the page itself, and the sign-in page, fetched as the film starts) */}
        <Link href="/" className={styles.logo} prefetch={false}>
          <ResonanceIcon size={42} />
          <span className={styles.brand}>Resonance</span>
        </Link>

        {/* Phones: the globe and the menu. Wider: the language by name and
            the account. Both are in the HTML and CSS shows one (720px), so the
            first paint — scripts loading, or none — is the right one. */}
        <div className={`${styles.account} ${styles.phoneOnly}`}>
          <LanguageSelect compact />
          <button
            aria-label={t('openMenu')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className={styles.menuBtn}
          >
            <HamburgerIcon size={26} />
          </button>
        </div>

        {NAV_KEYS.length > 0 && (
          <nav className={`${styles.nav} ${styles.wideOnly}`}>
            {NAV_KEYS.map((key) => (
              <a
                key={key}
                href={`/${locale}/#${NAV_TARGETS[key]}`}
                onClick={(e) => handleNavClick(e, NAV_TARGETS[key])}
                className={styles.navLink}
              >
                {t(key)}
              </a>
            ))}
          </nav>
        )}

        <div className={`${styles.account} ${styles.wideOnly}`}>
          <LanguageSelect />
          {/* 登入 holds its place from the first paint (unseen until the account is known), so the language beside
              it never moves when it appears */}
          {(!signedKnown || !user) && (
            <Link
              prefetch={false}
              href="/signin"
              className={styles.signIn}
              data-pending={signedKnown ? undefined : ''}
              aria-hidden={signedKnown ? undefined : true}
              tabIndex={signedKnown ? undefined : -1}
              style={{ textDecoration: 'none' }}
            >
              <OrganicButton variant="solid" style={{ padding: '9px 22px', fontSize: '14px' }}>
                {t('signIn')}
              </OrganicButton>
            </Link>
          )}
          {/* Signed in: the way into the app (where 登入 stands for a visitor), and the avatar's account menu, the
              app header's own. Not on a phone, whose menu holds both. */}
          {signedKnown && user && !isMobile && (
            <>
              <Link href="/home" style={{ textDecoration: 'none' }}>
                <OrganicButton variant="solid" style={{ padding: '9px 22px', fontSize: '14px' }}>
                  {t('enterApp')}
                </OrganicButton>
              </Link>
              <SiteHeaderAccountMenu />
            </>
          )}
        </div>
      </div>

      {/* Signed in, the menu mounts at once so the profile it shows is read
          before it opens; signed out, it loads on the first tap. */}
      {signedIn ? (
        <SiteHeaderSignedInNav open={menuOpen} onClose={() => setMenuOpen(false)} />
      ) : (
        menuLoaded && <AppMobileNavModal open={menuOpen} onClose={() => setMenuOpen(false)} />
      )}
    </header>
  );
}
