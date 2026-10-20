// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderWithIntl, screen } from '@/../test/render';
import zhMessages from '@/messages/zh-TW.json';
import { AboutPage } from './AboutPage';

describe('AboutPage team section', () => {
  it('renders all 5 team members with their avatar pictures in English', () => {
    renderWithIntl(<AboutPage />);

    const members = [
      { name: 'Nian-Cheng Chen', src: '/team/chen.webp' },
      { name: 'Li-Wen Hsiao', src: '/team/hsiao.webp' },
      { name: 'Yu-Ching Fang', src: '/team/fang.webp' },
      { name: 'Yi-Hsin Cheng', src: '/team/cheng.webp' },
      { name: 'Winnie Xue', src: '/team/xue.webp' },
    ];

    for (const member of members) {
      expect(screen.getByText(member.name)).toBeInTheDocument();
      const img = screen.getByAltText(member.name);
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', member.src);
    }
  });

  it('renders all 5 team members with their avatar pictures in Traditional Chinese', () => {
    renderWithIntl(<AboutPage />, { locale: 'zh-TW', messages: zhMessages });

    const members = [
      { name: '陳念誠', src: '/team/chen.webp' },
      { name: '蕭力文', src: '/team/hsiao.webp' },
      { name: '方昱晴', src: '/team/fang.webp' },
      { name: '鄭義信', src: '/team/cheng.webp' },
      { name: '薛惠馨', src: '/team/xue.webp' },
    ];

    for (const member of members) {
      expect(screen.getByText(member.name)).toBeInTheDocument();
      const img = screen.getByAltText(member.name);
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', member.src);
    }
  });
});
