import type { CSSProperties, ReactElement } from 'react';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { MAX_INPUT_PIXELS } from '@/lib/storage/image';
import { WaveIcon } from '@/components/atoms/Icon/icons/wave';
import { avatarWobPath, initialsScale } from '@/lib/design/avatar';
import { encode, parseOklch, srgbHex, toLinearSrgb } from '@/lib/design/oklch';
import { STORY_GRAIN } from '@/lib/design/grain';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { wavyLine } from '@/lib/design/wavyPath';
import {
  COLOUR_TOKENS,
  SHARE_CARD,
  SHARE_TYPE,
  shareColours,
  shareOutline,
  tokenValue,
  type ColourTokenName,
  type ShareType,
} from '@/lib/share/shareCard';
import type { StoryScript } from '@/lib/text/script';
import { FACE, fontsFor } from './fonts';
import { LINK_IMAGE_SIZE, type DrawnCard } from './model';

/**
 * The link-preview image of a published, public card without a cover
 * (/api/og/card/{id}, og:image): the card drawn as the feed draws it — its
 * family's backdrop and paper with their grain, the wobRect outline from its
 * id, its title, its opening, the byline and the wave + Resonance +
 * resonance.channel lockup — at 1200 × 630, in the reading design's type by
 * the story's script (lib/share/shareCard SHARE_TYPE). Rendered with next/og
 * (satori, then resvg) from the static fonts in ./fonts, served as a JPEG.
 *
 * The image is about 500 px wide where people see it (a feed, a chat), so the
 * web card's sizes are drawn × LINK_IMAGE.scale: the pen stays one pen.
 */

export const LINK_IMAGE = {
  ...LINK_IMAGE_SIZE,
  /** Image pixels to a CSS pixel of the card as it is seen. */
  scale: 2.4,
  card: { x: 56, y: 36, width: 1088, height: 558, padding: 48 },
  /** A title running at most `balanceUpTo` lines' width is balanced, a longer one clamped to `maxLines`. */
  title: { cjk: 56, latin: 62, maxLines: 2, balanceUpTo: 1.75 },
  words: { cjk: 28, latin: 31, maxLines: 3, maxLinesAfterShortTitle: 4, gapAbove: 22 },
  rule: { gapAbove: 26, height: 8, gapBelow: 22 },
  byline: { avatar: 64, gap: 20, name: 28, date: 23, dateGap: 2 },
  lockup: { wave: 36, gap: 8, wordmark: 30, domain: 22 },
  jpegQuality: 82,
} as const;

/** A colour satori and resvg read: oklch() isn't one. */
function rgb(css: string): string {
  const c = parseOklch(css);
  if (c.alpha >= 1) return srgbHex(c);
  const [r, g, b] = toLinearSrgb(c).map(encode).map((v) => Math.round(v * 255));
  return `rgba(${r}, ${g}, ${b}, ${c.alpha})`;
}
const token = (name: ColourTokenName) => rgb(COLOUR_TOKENS[name]);

const FAMILY: Record<ShareType['face'], string> = {
  '--font-story-serif': `${FACE.storySerif}, ${FACE.display}`,
  '--font-story-sans': `${FACE.storySans}, ${FACE.body}`,
  '--font-heading': `${FACE.display}, ${FACE.storySerif}`,
  '--font-body': `${FACE.body}, ${FACE.storySans}`,
};

function typeStyle(type: ShareType, size: number): CSSProperties {
  return {
    fontFamily: FAMILY[type.face],
    fontWeight: tokenValue(type.weight),
    fontSize: size,
    lineHeight: tokenValue(type.leading),
    letterSpacing: `${tokenValue(type.tracking)}em`,
  };
}

const WIDE = /[\p{scx=Han}\p{scx=Hira}\p{scx=Kana}\p{scx=Hang}\u3000-\u303f\uff00-\uffef]/u;

/**
 * How wide the title runs on one line, at most: a CJK character is an em
 * (plus tracking) wide, anything else is counted as wide as Latin ever runs.
 * Only a title that surely sets on one line gives the words a fourth line;
 * only one that surely fits its two lines is balanced.
 */
function titleWidth(title: string, script: StoryScript, size: number): number {
  const tracking = tokenValue(SHARE_TYPE.title[script].tracking);
  let ems = 0;
  for (const ch of title) ems += WIDE.test(ch) ? 1 + tracking : /\s/.test(ch) ? 0.3 : 0.72;
  return ems * size;
}

interface Drawn {
  title: string;
  opening: string;
  name: string;
  initials: string;
  date: string;
}

function Avatar({ card, initials, photo }: { card: DrawnCard; initials: string; photo: string | null }) {
  const size = LINK_IMAGE.byline.avatar;
  const anonymous = card.byline.anonymous;
  const seed = anonymous ? SHARE_CARD.anonymous.avatar.seed : card.byline.avatarSeed;
  const d = avatarWobPath(size, seed);
  const outline = (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      <path
        d={d}
        fill={photo ? 'none' : anonymous ? token(SHARE_CARD.anonymous.avatar.fill) : rgb(shareColours(card.palette).backdrop)}
        stroke={rgb(SHARE_CARD.byline.avatar.outline)}
        strokeWidth={INK * LINK_IMAGE.scale}
        strokeLinejoin="round"
      />
    </svg>
  );
  const letters = anonymous ? SHARE_CARD.anonymous.avatar.initials : initials;
  return (
    <div style={{ display: 'flex', position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          width={size}
          height={size}
          style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, objectFit: 'cover', clipPath: `path('${d}')` }}
        />
      ) : null}
      {outline}
      {photo ? null : (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: size,
            height: size,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FAMILY['--font-body'],
            fontWeight: 600,
            fontSize: Math.round(size * initialsScale(letters)),
            color: token('--color-text'),
          }}
        >
          {letters}
        </div>
      )}
    </div>
  );
}

/**
 * The image as satori draws it. `texts` are the model's words as they will be
 * drawn (fonts.ts `drawable`), `photo` the author's picture as a data URL.
 */
export function drawnCardElement(card: DrawnCard, texts: Drawn, photo: string | null = null): ReactElement {
  const L = LINK_IMAGE;
  const k = L.scale;
  const colours = shareColours(card.palette);
  const { x, y, width: W, height: H, padding } = L.card;
  const inner = W - padding * 2;
  const outline = shareOutline(W, H, SHARE_CARD.card.radius * k, card.seed);
  const titleSize = L.title[card.script];
  const wordsSize = L.words[card.script];
  const wordsType = SHARE_TYPE.words[card.script];
  const titleRun = texts.title ? titleWidth(texts.title, card.script, titleSize) : 0;
  const wordLines = texts.title && titleRun <= inner ? L.words.maxLinesAfterShortTitle : L.words.maxLines;
  const rule = wavyLine(inner, card.seed + SHARE_CARD.rule.seedOffset, SHARE_CARD.rule.amplitude * k, SHARE_CARD.rule.steps);
  const { lockup, byline } = SHARE_CARD;

  return (
    <div style={{ width: L.width, height: L.height, display: 'flex', position: 'relative', backgroundColor: rgb(colours.backdrop) }}>
      <svg width={L.width} height={L.height} viewBox={`0 0 ${L.width} ${L.height}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        <defs>
          {/* GrainOverlay: black whose alpha follows fractal noise, at the scale the card is seen. */}
          <filter id="band" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency={0.72 / k} numOctaves={4} stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 0 1" />
          </filter>
          {/* ShapeGrain on the desktop card's paper. */}
          <filter id="paper" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency={0.85 / k} numOctaves={2} stitchTiles="stitch" seed={3} />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope={STORY_GRAIN.paper} />
            </feComponentTransfer>
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <clipPath id="card">
            <path d={outline} transform={`translate(${x} ${y})`} />
          </clipPath>
        </defs>
        <rect width={L.width} height={L.height} fill="black" filter="url(#band)" opacity={Math.min(1, SHARE_CARD.backdrop.grain * 2)} />
        <path d={outline} transform={`translate(${x} ${y})`} fill={rgb(colours.paper)} />
        <g clipPath="url(#card)">
          <path d={outline} transform={`translate(${x} ${y})`} fill="black" filter="url(#paper)" />
        </g>
        <path d={outline} transform={`translate(${x} ${y})`} fill="none" stroke={rgb(colours.pen)} strokeWidth={INK * k} strokeLinejoin="round" />
      </svg>

      <div
        style={{
          position: 'absolute',
          left: x + padding,
          top: y + padding,
          width: inner,
          height: H - padding * 2,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {texts.title ? (
          <div
            style={{
              ...typeStyle(SHARE_TYPE.title[card.script], titleSize),
              display: 'block',
              // satori balances by narrowing the box while its height holds, and a clamped height
              // always holds: a title is balanced (as the reader sets it) only when it surely needs no clamp.
              ...(titleRun <= inner * L.title.balanceUpTo ? { textWrap: 'balance' as const } : { lineClamp: L.title.maxLines }),
              color: token(SHARE_CARD.title.colour),
              flexShrink: 0,
            }}
          >
            {texts.title}
          </div>
        ) : null}
        {texts.opening ? (
          <div
            style={{
              ...typeStyle(wordsType, wordsSize),
              display: 'block',
              lineClamp: wordLines,
              whiteSpace: 'pre-line',
              color: token(SHARE_CARD.words.colour),
              marginTop: texts.title ? L.words.gapAbove : 0,
              flexShrink: 0,
            }}
          >
            {texts.opening}
          </div>
        ) : null}
        <div style={{ display: 'flex', flexGrow: 1 }} />
        <svg
          width={inner}
          height={L.rule.height}
          viewBox={`0 ${-L.rule.height / 2} ${inner} ${L.rule.height}`}
          style={{ marginTop: L.rule.gapAbove, flexShrink: 0, overflow: 'visible' }}
        >
          <path d={rule} stroke={rgb(colours.rule)} strokeWidth={INK_LIGHT * k} fill="none" strokeLinecap="round" />
        </svg>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: L.rule.gapBelow, flexShrink: 0 }}>
          <Avatar card={card} initials={texts.initials} photo={photo} />
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: L.byline.gap, flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: FAMILY[byline.name.face],
                fontWeight: card.byline.anonymous ? 600 : byline.name.weight,
                fontSize: L.byline.name,
                lineHeight: byline.name.leading,
                color: token(card.byline.anonymous ? SHARE_CARD.anonymous.name.colour : byline.name.colour),
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {texts.name}
            </div>
            {texts.date ? (
              <div
                style={{
                  fontFamily: FAMILY[byline.date.face],
                  fontSize: L.byline.date,
                  lineHeight: 1.3,
                  marginTop: L.byline.dateGap,
                  color: token(byline.date.colour),
                  whiteSpace: 'nowrap',
                }}
              >
                {texts.date}
              </div>
            ) : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: byline.minSpace * k, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {WaveIcon({ size: L.lockup.wave, color: token(lockup.wave.colour), strokeWidth: (INK * k * 24) / L.lockup.wave })}
              <div
                style={{
                  marginLeft: L.lockup.gap,
                  fontFamily: FAMILY[lockup.wordmark.face],
                  fontWeight: lockup.wordmark.weight,
                  fontSize: L.lockup.wordmark,
                  letterSpacing: `${lockup.wordmark.tracking}em`,
                  lineHeight: 1.2,
                  color: token(lockup.wordmark.colour),
                }}
              >
                {lockup.wordmark.text}
              </div>
            </div>
            <div
              style={{
                fontFamily: FAMILY[lockup.domain.face],
                fontSize: L.lockup.domain,
                letterSpacing: `${lockup.domain.tracking}em`,
                lineHeight: 1.3,
                color: token(lockup.domain.colour),
              }}
            >
              {lockup.domain.text}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The image as a JPEG. `photo` is the author's stored picture (any format sharp reads), for a named card. */
export async function renderDrawnCard(card: DrawnCard, photo: Uint8Array | null = null): Promise<Buffer> {
  const { fonts, texts } = await fontsFor({
    title: card.title,
    opening: card.opening,
    name: card.byline.name,
    initials: card.byline.anonymous ? SHARE_CARD.anonymous.avatar.initials : card.byline.initials,
    date: card.date ?? '',
    wordmark: SHARE_CARD.lockup.wordmark.text,
    domain: SHARE_CARD.lockup.domain.text,
  });
  let picture: string | null = null;
  if (photo && !card.byline.anonymous) {
    const size = LINK_IMAGE.byline.avatar * 2;
    try {
      const png = await sharp(photo, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().resize(size, size, { fit: 'cover' }).png().toBuffer();
      picture = `data:image/png;base64,${png.toString('base64')}`;
    } catch (e) {
      // A photo that won't decode: the initials, as before the person had one.
      console.error('[og] drawn card photo', e);
    }
  }
  const element = drawnCardElement(card, texts, picture);
  const response = new ImageResponse(element, { width: LINK_IMAGE.width, height: LINK_IMAGE.height, fonts });
  const png = Buffer.from(await response.arrayBuffer());
  return sharp(png).flatten({ background: '#faf2e9' }).jpeg({ quality: LINK_IMAGE.jpegQuality, mozjpeg: true }).toBuffer();
}
