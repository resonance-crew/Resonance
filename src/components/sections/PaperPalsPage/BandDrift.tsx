'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DriftingBlobs, type DriftPaint } from '@/components/atoms/DriftingBlobs/DriftingBlobs';
import { bandClipPath, type EdgeSpec } from '@/lib/design/sectionEdge';
import styles from './PaperPalsPage.module.css';

/**
 * A band's drifting blobs, on exactly its paper: from the wave at its top (`top`; none for the page's first band) down
 * past its own box to the next band's wave (`next`, at the top of the band after it), so a blob near its foot runs on
 * under the curve and is cut by it — not by the straight line where the next band's box begins. The waves are the
 * SectionEdges' own (lib/design/sectionEdge), measured at the band's width; until then the layer stops at its box.
 */
export function BandDrift({
  top,
  next,
  visitor,
  children,
}: {
  top: EdgeSpec | null;
  next: EdgeSpec | null;
  visitor?: DriftPaint;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [clip, setClip] = useState<string | null>(null);
  const key = JSON.stringify([top, next]);
  useLayoutEffect(() => {
    const band = ref.current?.parentElement;
    if (!band) return;
    const [t, n] = JSON.parse(key) as [EdgeSpec | null, EdgeSpec | null];
    const measure = () => {
      const { width, height } = band.getBoundingClientRect();
      if (width && height) setClip(bandClipPath(t, n, Math.round(width), Math.round(height)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(band);
    return () => ro.disconnect();
  }, [key]);
  const reach = next?.height ?? 0;
  return (
    <div
      ref={ref}
      className={styles.drift}
      style={{ bottom: -reach, clipPath: clip ? `path('${clip}')` : `inset(0 0 ${reach}px 0)` }}
      aria-hidden="true"
    >
      <DriftingBlobs visitor={visitor} responsive>
        {children}
      </DriftingBlobs>
    </div>
  );
}
