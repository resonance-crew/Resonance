'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { loadTweaks } from '@/components/providers/TweaksPanel';
import { QuietBoundary, wantsStage, whenIdle } from '@/components/sections/LandingStage/LandingStage';

// The engine, the cast and the layer: the landing stage's chunk, fetched only for a reader who turned the puppets on.
const ReadingLayer = dynamic(() => import('./ReadingLayer'), { ssr: false });

/**
 * The paper puppets now and then on the home feed and a card's page (round 19) — only for a reader who turned them on
 * (Settings → 顯示 → 小精靈, this browser's choice, off by default), never under Save-Data; loaded once the page is
 * up and the browser idle; a failure leaves the page without them. Each page mounts its own (`key` it by the card).
 */
export function ReadingStage({ off = false }: { /** Not now (a card in the trash, or held until its blocks are known). */ off?: boolean }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (off || !loadTweaks().mascots || !wantsStage(navigator)) return;
    return whenIdle(window, () => setOn(true));
  }, [off]);
  return on && !off ? (
    <QuietBoundary>
      <ReadingLayer />
    </QuietBoundary>
  ) : null;
}
