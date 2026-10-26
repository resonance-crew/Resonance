// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderWithIntl, screen } from '@/../test/render';
import zh from '@/messages/zh-TW.json';
import { StoryByline } from './StoryByline';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const author = { handle: '雨日小記', avatarUrl: undefined, initials: '雨', accentColor: 'x', avatarSeed: '7', region: 'TW', verified: true };
const published = { dateTime: '2026-10-10T04:00:00.000Z', label: '2026年10月10日' };

describe('StoryByline', () => {
  it('names the author, linking to their profile, over 「6 分鐘 · date」, and ends with the actions it is given', () => {
    const { container } = renderWithIntl(
      <StoryByline author={author} minutes={6} published={published} actions={<button type="button">分享</button>} />,
      { locale: 'zh-TW', messages: zh },
    );
    expect(screen.getByRole('link', { name: '雨日小記' })).toHaveAttribute('href', '/u/雨日小記');
    expect(screen.getByText('已驗證')).toBeInTheDocument();
    expect(container.querySelector('p')!.textContent).toBe('6 分鐘 · 2026年10月10日');
    expect(container.querySelector('time')).toHaveAttribute('dateTime', published.dateTime);
    // The actions close the row.
    expect(container.firstElementChild!.lastElementChild).toContainElement(screen.getByRole('button', { name: '分享' }));
  });

  it('takes a tap on the avatar to the profile too, leaving the pen name the one link a keyboard or screen reader meets', () => {
    const { container } = renderWithIntl(<StoryByline author={author} minutes={6} published={published} />, { locale: 'zh-TW', messages: zh });
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/u/雨日小記', '/u/雨日小記']);
    expect(links[0]).toHaveAttribute('tabindex', '-1');
    expect(links[0]).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('names no one on an anonymous card: the neutral mark and 匿名, linking nowhere', () => {
    renderWithIntl(<StoryByline author={author} anonymous minutes={2} published={published} />, { locale: 'zh-TW', messages: zh });
    expect(screen.getByText('匿名')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('雨日小記')).not.toBeInTheDocument();
    expect(screen.queryByText('已驗證')).not.toBeInTheDocument();
  });

  it('shows a draft’s read time alone, and no actions box when there are none', () => {
    const { container } = renderWithIntl(<StoryByline author={author} minutes={1} published={null} />);
    expect(container.querySelector('p')!.textContent).toBe('1 min');
    expect(container.firstElementChild!.children).toHaveLength(2);
  });

  // At 320 the row holds a 40 avatar, the name column and two 44 glyphs.
  it('keeps the pen name on one line, lets the meta line wrap, grows rather than clips, and never squeezes its actions', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/StoryByline.module.css'), 'utf8');
    expect(css).toMatch(/\.byline \{[^}]*min-height: 44px;/);
    expect(css).not.toMatch(/\.byline \{[^}]*[^-]height:/);
    expect(css).toMatch(/\.handle \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
    expect(css).not.toMatch(/\.meta \{[^}]*nowrap/);
    expect(css).toMatch(/\.actions \{[^}]*flex: none;/);
    // The row names the author at every width (round 8 §10.1): nothing hides the avatar or the pen name.
    expect(css).not.toMatch(/\.(avatar|name)[^{]*\{[^}]*display: none/);
  });
});
