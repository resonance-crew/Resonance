import { describe, expect, it } from 'vitest';
import { toHtml } from './staticHtml';

function Part({ d }: { d: string }) {
  return <path d={d} className="ff-x" style={{ opacity: 0.5 }} />;
}

describe('static JSX as HTML (the islands)', () => {
  it('spells elements and attributes as React does', () => {
    const html = toHtml(
      <>
        <style>{'.a{fill:red}'}</style>
        <radialGradient id="g" r="0.5">
          <stop offset="0" stopColor="var(--c)" stopOpacity="0.5" />
        </radialGradient>
        <clipPath id="c" clipPathUnits="userSpaceOnUse">
          <path d="M0 0L10 0" />
        </clipPath>
        <g className="ff-a" style={{ opacity: 'var(--o)', '--x': 3 } as React.CSSProperties} clipPath="url(#c)" aria-hidden="true" data-k="v">
          <use href="#g" transform="translate(0 2)" />
        </g>
      </>,
      {},
      true,
    );
    expect(html).toBe(
      '<style>.a{fill:red}</style><radialGradient id="g" r="0.5"><stop offset="0" stop-color="var(--c)" stop-opacity="0.5"/></radialGradient>' +
        '<clipPath id="c" clipPathUnits="userSpaceOnUse"><path d="M0 0L10 0"/></clipPath>' +
        '<g class="ff-a" style="opacity:var(--o);--x:3" clip-path="url(#c)" aria-hidden="true" data-k="v"><use href="#g" transform="translate(0 2)"/></g>',
    );
  });

  it('rewrites path data, and draws a path drawn twice once (the second a <use> of it)', () => {
    const html = toHtml(
      <g>
        <Part d="M0,0L10,0" />
        <Part d="M0,0L20,0" />
        <Part d="M0,0L10,0" />
      </g>,
      { path: (d) => d.replace(/,/g, ' ') },
      true,
    );
    expect(html).toBe(
      '<g><path id="film-p0" d="M0 0L10 0" class="ff-x" style="opacity:0.5"/><path d="M0 0L20 0" class="ff-x" style="opacity:0.5"/><use href="#film-p0"/></g>',
    );
  });

  it('escapes what it must and closes HTML elements as HTML', () => {
    expect(toHtml(<div title={'a"<b'}>{'x < y & z'}</div>)).toBe('<div title="a&quot;&lt;b">x &lt; y &amp; z</div>');
    expect(toHtml(<span style={{ width: 10, left: '5%' }} />)).toBe('<span style="width:10px;left:5%"></span>');
  });
});
