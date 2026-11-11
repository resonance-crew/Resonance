/**
 * After the film (SPEC §8; the owner, round 3: 「動畫播完之後向下滾…做一個漸層，就銜接到原本的這個主題色的顏色」): the
 * night stage lets go and the page becomes the site's own — the night's ground fading into the theme's paper over about
 * a screen, then tonight's stories as the landing page's card section draws them (its heading, its grid of StoryCards,
 * bands on a phone: six recommended stories — the owner, round 4: 「直接顯示現在推薦的…五六篇就好」 — the same for
 * everyone signed out, a signed-in reader's own once they arrive), the way to all of them, the closing band
 * (`#download`: the call to write, 重看一次, the stores) and the site's footer — in the visitor's light or dark, as the
 * landing page is.
 */
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { GetTheApp } from '@/components/molecules/GetTheApp/GetTheApp';
import { SiteFooter } from '@/components/sections/SiteFooter/SiteFooter';
import feed from '@/components/sections/CardFeedSection/CardFeedSection.module.css';
import band from '@/components/sections/CTASection/CTASection.module.css';
import { Link } from '@/i18n/navigation';
import { DOWNLOAD_ANCHOR } from '@/lib/appStores';
import { INK_LIGHT } from '@/lib/design/strokes';
import { copyFor } from './copy';
import { ReplayButton } from './CtaPanel';
import { TonightGrid } from './TonightGrid';
import type { FilmModel } from './model';
import styles from './film.module.css';

export function End({ model, locale }: { model: FilmModel; locale: string }) {
  const c = copyFor(locale);
  return (
    <>
      <section className={styles.end} aria-labelledby="film-stories" data-film-end="">
        {/* the night's ground into the theme's paper: no edge between the film and the page */}
        <div className={styles.endFade} aria-hidden="true" data-end-fade="" />
        <div className={styles.endBlob} aria-hidden="true">
          <OrganiBlob variant={4} fill="var(--color-yellow)" size={320} />
        </div>
        <div className={feed.container}>
          <div id="stories" className={`${feed.heading} ${styles.endHeading}`}>
            <TagPill color="var(--color-sage)">{c.end.tag}</TagPill>
            <h2 id="film-stories" className={feed.title}>
              {c.end.title}
            </h2>
            <p className={feed.subtitle}>{c.end.subtitle}</p>
          </div>
          <TonightGrid picks={model.picks} locale={locale} />
          <div className={feed.loadMore}>
            <Link href="/home" style={{ textDecoration: 'none' }}>
              <OrganicButton variant="outline">{c.end.all}</OrganicButton>
            </Link>
          </div>
        </div>
      </section>

      {/* the landing page's closing band (CTASection's own look): the call to write, 重看一次, and the stores */}
      <section id={DOWNLOAD_ANCHOR} className={`${band.section} ${styles.download}`} aria-labelledby="film-download">
        <SectionEdge
          topColor="var(--color-cream-dark)"
          seed={137}
          height={100}
          amplitude={0.13}
          steps={14}
          stroke="color-mix(in oklch, var(--terracotta-ink) 35%, transparent)"
          strokeWidth={INK_LIGHT}
        />
        <div className={band.blobTop}>
          <OrganiBlob variant={2} fill="var(--cta-ink)" size={280} />
        </div>
        <div className={band.blobBottom}>
          <OrganiBlob variant={0} fill="var(--cta-ink)" size={220} />
        </div>
        <div className={band.content}>
          <h2 id="film-download" className={band.title}>
            {c.end.ctaTitle}
          </h2>
          <p className={band.description}>{c.end.ctaLine}</p>
          <div className={band.ctaRow}>
            <Link href="/write" style={{ textDecoration: 'none' }}>
              <OrganicButton variant="ctaLight" block>
                {c.cta.write}
              </OrganicButton>
            </Link>
            <ReplayButton locale={locale} className={styles.replayBox} />
          </div>
          <GetTheApp qr tone="terracotta" className={styles.downloadApp} />
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
