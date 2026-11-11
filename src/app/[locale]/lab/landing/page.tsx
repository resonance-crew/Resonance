import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LAB_VARIANTS } from '@/components/lab/landing/registry';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The landing prototypes, side by side (branch landing-lab only). */
export default async function LabIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '96px 24px', fontFamily: 'var(--font-body)' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 40, margin: '0 0 8px' }}>Landing lab</h1>
      <p style={{ color: 'var(--color-text-muted)', margin: '0 0 32px' }}>
        <Link href="/">The current landing page</Link>, and the prototypes
      </p>
      <ol style={{ display: 'grid', gap: 20, padding: 0, listStyle: 'none' }}>
        {LAB_VARIANTS.map((v) => (
          <li key={v.id}>
            <Link href={`/lab/landing/${v.id}`} style={{ fontSize: 22, fontWeight: 600 }}>{v.name}</Link>
            <div style={{ color: 'var(--color-text-muted)' }}>{v.pitch}</div>
          </li>
        ))}
      </ol>
    </main>
  );
}
