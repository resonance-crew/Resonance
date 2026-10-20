// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LegalDocument } from './LegalDocument';

const doc = {
  title: '支援',
  description: 'd',
  updated: '2026-09-30',
  body: '寫信到 **support@resonance.channel**，或看[隱私權政策](/zh-TW/privacy)與 [外部](https://example.com)。',
};

describe('LegalDocument', () => {
  it('renders the Markdown with hand-drawn links in place of plain underlines', () => {
    render(<LegalDocument doc={doc} updatedLabel="最後更新：2026年9月30日" />);
    expect(screen.getByRole('heading', { level: 1, name: '支援' })).toBeInTheDocument();
    expect(screen.getByText('最後更新：2026年9月30日')).toBeInTheDocument();

    const page = screen.getByRole('link', { name: '隱私權政策' });
    expect(page).toHaveAttribute('href', '/zh-TW/privacy');
    expect(page.querySelector('svg path')?.getAttribute('d')).toMatch(/^M/);

    const mail = screen.getByRole('link', { name: 'support@resonance.channel' });
    expect(mail).toHaveAttribute('href', 'mailto:support@resonance.channel');
    expect(mail.querySelector('svg')).not.toBeNull();

    const external = screen.getByRole('link', { name: '外部' });
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
  });

  // The stories' prose (src/styles/story.css), set by the document's own script.
  it('sets a Chinese policy as a CJK story and an English one as a Latin-script story', () => {
    const zh = render(<LegalDocument doc={doc} updatedLabel="u" />);
    expect(zh.container.querySelector('.story-prose')).toHaveAttribute('data-script', 'cjk');
    zh.unmount();
    const en = render(
      <LegalDocument doc={{ ...doc, title: 'Support', body: 'Write to **support@resonance.channel**, or read the [privacy policy](/en/privacy).' }} updatedLabel="u" />,
    );
    expect(en.container.querySelector('.story-prose')).toHaveAttribute('data-script', 'latin');
  });
});
