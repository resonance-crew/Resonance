'use client';

import { CSSProperties, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pointsToBezier } from '@/lib/design/wavyPath';
import { EDGE_VIEW_W, edgePoints, waveSegments } from '@/lib/design/sectionEdge';

export interface SectionEdgeProps {
  topColor: string;
  seed?: number;
  height?: number;
  amplitude?: number;
  steps?: number;
  zIndex?: number;
  style?: CSSProperties;
  stroke?: string;
  strokeWidth?: number;
}

/**
 * The wave at a band's top: the band before it runs down into this one, its paper filling the box above the wave.
 * Its turns and swell follow the width it is drawn at (lib/design/sectionEdge): the server draws a wide one, and a
 * narrower screen gets its own once measured.
 */
export function SectionEdge({
  topColor,
  seed = 1,
  height = 80,
  amplitude = 0.15,
  steps = 14,
  zIndex = 1,
  style = {},
  stroke,
  strokeWidth = 1.2,
}: SectionEdgeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width) || null);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { fillD, strokeD } = useMemo(() => {
    const pts = edgePoints({ seed, height, amplitude, steps }, width);
    return {
      strokeD: pointsToBezier(pts),
      fillD: `M 0,-1 L ${EDGE_VIEW_W},-1 ${waveSegments(pts, 1, 0, true)} Z`,
    };
  }, [seed, height, amplitude, steps, width]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height,
        pointerEvents: 'none',
        zIndex,
        ...style,
      }}
    >
      <svg
        viewBox={`0 0 ${EDGE_VIEW_W} ${height}`}
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}
      >
        <path d={fillD} fill={topColor} />
        {stroke && (
          <path
            d={strokeD}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}
