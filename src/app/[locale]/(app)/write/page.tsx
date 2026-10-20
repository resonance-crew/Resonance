'use client';

import { Suspense, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { WriteWorkspace } from '@/components/sections/WriteWorkspace/WriteWorkspace';
import { takeWriteSeed } from '@/lib/data/writeSeed';
import type { Locale } from '@/lib/db/types';

// Reading the query client-side keeps this route fully static — awaiting
// `searchParams` on the server forced a per-request render just to pass one
// optional id through. useSearchParams needs a Suspense boundary to keep the
// static shell prerenderable.
function WritePageInner() {
  const t = useTranslations('write');
  const locale = useLocale() as Locale;
  const search = useSearchParams();
  const referenceCardId = search.get('referenceCardId') ?? undefined;
  // A note grown into a resonance left its words for this writer (lib/data/writeSeed): taken once, after
  // hydration (the server has no tab storage), and the editor starts again with them before anything is typed.
  const [seed, setSeed] = useState<string | null>(null);
  useEffect(() => {
    if (referenceCardId) setSeed(takeWriteSeed(referenceCardId));
  }, [referenceCardId]);
  return (
    <WriteWorkspace
      key={seed == null ? 'blank' : 'seeded'}
      title={t('title')}
      locale={locale}
      referenceCardId={referenceCardId}
      seedStory={seed ?? undefined}
    />
  );
}

export default function WritePage() {
  return (
    <Suspense>
      <WritePageInner />
    </Suspense>
  );
}
