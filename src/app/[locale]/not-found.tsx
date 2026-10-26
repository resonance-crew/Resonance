import { useTranslations } from 'next-intl';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Link } from '@/i18n/navigation';
import styles from './not-found.module.css';

/**
 * A page that isn't there (an unknown path, or a page that called notFound()):
 * the site's own words on its own paper — as the card page's 找不到這張卡片 —
 * with the way home as the tonal pill, inside the locale's layout, so it wears
 * the reader's theme and scheme from the first paint.
 */
export default function NotFound() {
  const t = useTranslations('app');
  const tCard = useTranslations('card');
  return (
    <main className={styles.page}>
      <ResonanceIcon size={40} />
      <h1 className={styles.title}>{t('pageNotFound')}</h1>
      <Link href="/home" className={styles.back}>
        <OrganicButton variant="tonal">
          {tCard('notFound.back')}
        </OrganicButton>
      </Link>
    </main>
  );
}
