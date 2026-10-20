// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import { stubRowLayout, type RowLayout } from '@/../test/layout';
import { ToastProvider } from '@/components/providers/ToastProvider';
import type { ShareTarget } from '@/lib/share/links';
import { ShareMenu } from './ShareMenu';

const ORIGIN = 'https://resonance.channel';
const NAMED: ShareTarget = { kind: 'card', id: 'c7Hq', slug: 'pickled-plums', title: 'Pickled plums & salt', anonymous: false, handle: 'nian' };
const ANONYMOUS: ShareTarget = { kind: 'card', id: 'c7Hq', slug: 'pickled-plums-nian', title: 'Pickled plums & salt', anonymous: true };

/** The pointer the page is read under (jsdom matches no media query by itself). */
function pointer(kind: 'fine' | 'coarse') {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === `(pointer: ${kind})`,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

/** Gives the browser Web Share (navigator.share), answering with `answer`. */
function webShare(answer: () => Promise<void> = async () => {}) {
  const share = vi.fn(answer);
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  return share;
}

function clipboard(answer: () => Promise<void> = async () => {}) {
  const writeText = vi.fn(answer);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  return writeText;
}

function renderMenu(props: { target?: ShareTarget; hint?: string } = {}) {
  return renderWithIntl(
    <ToastProvider>
      <ShareMenu target={props.target ?? NAMED} hint={props.hint} seed={60} />
    </ToastProvider>,
  );
}

let layout: RowLayout;
const env = process.env.NEXT_PUBLIC_SITE_URL;
const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID;

beforeEach(() => {
  layout = stubRowLayout({ width: 220, rowHeight: 42 });
  process.env.NEXT_PUBLIC_SITE_URL = ORIGIN;
  delete process.env.NEXT_PUBLIC_META_APP_ID;
});
afterEach(() => {
  layout.restore();
  vi.restoreAllMocks();
  delete (navigator as { share?: unknown }).share;
  delete (navigator as { clipboard?: unknown }).clipboard;
  process.env.NEXT_PUBLIC_SITE_URL = env;
  if (metaAppId === undefined) delete process.env.NEXT_PUBLIC_META_APP_ID;
  else process.env.NEXT_PUBLIC_META_APP_ID = metaAppId;
});

describe('ShareMenu on a desktop', () => {
  it('is a glyph named Share that drops copy, the four platforms and nothing more without Web Share', async () => {
    pointer('fine');
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Share' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('data-icon', 'share');
    await userEvent.click(trigger);

    expect(screen.getAllByRole('menuitem').map((row) => row.getAttribute('aria-label') ?? row.textContent)).toEqual([
      'Copy link',
      'Share on LINE',
      'Share on Threads',
      'Share on Facebook',
      'Share on X',
    ]);
    // Each platform row wears its brand's own mark, which says nothing itself.
    const line = screen.getByRole('menuitem', { name: 'Share on LINE' });
    expect(line.querySelector('svg[data-brand="line"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('adds More ways to share last where the browser has Web Share, and hands it the link', async () => {
    pointer('fine');
    const share = webShare();
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    const rows = screen.getAllByRole('menuitem');
    expect(rows.at(-1)).toHaveAccessibleName('More ways to share');
    await userEvent.click(rows.at(-1)!);
    expect(share).toHaveBeenCalledWith({ title: 'Pickled plums & salt', url: `${ORIGIN}/card/pickled-plums` });
  });

  it('copies the link and says so, or says it could not', async () => {
    pointer('fine');
    const writeText = clipboard();
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/card/pickled-plums`);
    expect((await screen.findAllByText('Link copied')).length).toBeGreaterThan(0);
    // Back on the trigger, where the reader was.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    clipboard(async () => {
      throw new Error('denied');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    expect((await screen.findAllByText('Couldn’t copy the link')).length).toBeGreaterThan(0);
  });

  it('opens a platform’s intent in a popup centred on the window, with the post’s words', async () => {
    pointer('fine');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Share on LINE' }));
    const text = encodeURIComponent('“Pickled plums & salt” by nian');
    expect(open).toHaveBeenCalledWith(
      `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(`${ORIGIN}/card/pickled-plums`)}&text=${text}`,
      'resonance-share',
      expect.stringMatching(/^popup,width=600,height=640,left=\d+,top=\d+,noopener,noreferrer$/),
    );
  });

  it('takes Facebook’s Share Dialog once the site has a Meta App ID', async () => {
    pointer('fine');
    process.env.NEXT_PUBLIC_META_APP_ID = '1115208464203859';
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Share on Facebook' }));
    expect(open.mock.calls[0][0]).toBe(
      `https://www.facebook.com/dialog/share?app_id=1115208464203859&href=${encodeURIComponent(`${ORIGIN}/card/pickled-plums`)}&display=popup`,
    );
  });

  it('shares an anonymous card by its id, its post naming no one', async () => {
    pointer('fine');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const writeText = clipboard();
    renderMenu({ target: ANONYMOUS });
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Share on X' }));
    expect(open.mock.calls[0][0]).toBe(
      `https://x.com/intent/tweet?text=${encodeURIComponent('“Pickled plums & salt”')}&url=${encodeURIComponent(`${ORIGIN}/card/c7Hq`)}`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/card/c7Hq`);
  });

  it('tells the owner of an anonymous card, under the rows, what sharing it may say', async () => {
    pointer('fine');
    renderMenu({ target: ANONYMOUS, hint: 'Sharing it from your account may tell people it’s yours' });
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByText('Sharing it from your account may tell people it’s yours')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(5);
  });

  it('names a profile’s glyph for the profile, and shares its page', async () => {
    pointer('fine');
    const writeText = clipboard();
    renderMenu({ target: { kind: 'profile', handle: '念誠' } });
    await userEvent.click(screen.getByRole('button', { name: 'Share profile' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/u/%E5%BF%B5%E8%AA%A0`);
  });
});

describe('ShareMenu on a touch screen', () => {
  it('goes straight to the system sheet with Web Share, opening no menu', async () => {
    pointer('coarse');
    const share = webShare();
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Share' });
    await userEvent.click(trigger);
    expect(share).toHaveBeenCalledWith({ title: 'Pickled plums & salt', url: `${ORIGIN}/card/pickled-plums` });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('says nothing when the sheet is put away, and copies the link when it is refused', async () => {
    pointer('coarse');
    const abort = Object.assign(new Error('dismissed'), { name: 'AbortError' });
    webShare(async () => {
      throw abort;
    });
    const writeText = clipboard();
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText('Link copied')).not.toBeInTheDocument();

    webShare(async () => {
      throw Object.assign(new Error('nope'), { name: 'NotAllowedError' });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/card/pickled-plums`));
    expect((await screen.findAllByText('Link copied')).length).toBeGreaterThan(0);
  });

  it('drops the whole menu in a browser without Web Share (an in-app browser)', async () => {
    pointer('coarse');
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(5);
  });

  // The hint would never be read if the tap went straight to the system sheet.
  it('opens the menu for the owner of an anonymous card: copy, the system sheet, and the hint', async () => {
    pointer('coarse');
    const share = webShare();
    renderMenu({ target: ANONYMOUS, hint: 'Sharing it from your account may tell people it’s yours' });
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(share).not.toHaveBeenCalled();
    expect(screen.getAllByRole('menuitem').map((row) => row.textContent)).toEqual(['Copy link', 'More ways to share']);
    expect(screen.getByText('Sharing it from your account may tell people it’s yours')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'More ways to share' }));
    expect(share).toHaveBeenCalledWith({ title: 'Pickled plums & salt', url: `${ORIGIN}/card/c7Hq` });
  });
});
