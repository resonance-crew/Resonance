// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithIntl, screen, waitFor } from '@/../test/render';

// The signed-in area's shell routes whoever can't be in it yet: signed out to
// /signin (public pages aside), signed in without a profile — or with one
// that never got a pen name, which can reach no one — to /signup, where
// onboarding names it (POST /api/v1/me).

const auth = { user: { id: 'nina' } as { id: string } | null, loading: false, sessionReady: true };
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => auth, useSessionReady: () => auth.sessionReady }));
const profile = { data: undefined as unknown, isLoading: false };
vi.mock('@/lib/data/hooks', () => ({ useMyProfile: () => profile }));
const replace = vi.fn();
let pathname = '/home';
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ replace }), usePathname: () => pathname }));
vi.mock('@/components/sections/AppHeader/AppHeader', () => ({ AppHeader: () => null }));
vi.mock('@/components/molecules/AccountDeletionNotice/AccountDeletionNotice', () => ({ AccountDeletionNotice: () => null }));

import { AppShell } from './AppShell';
import { useToast } from './ToastProvider';

const shell = () => renderWithIntl(<AppShell><p>the page</p></AppShell>);
const named = (handle: string) => ({ id: 'nina', handle, initials: 'NI', accentColor: 'x' });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(auth, { user: { id: 'nina' }, loading: false });
  Object.assign(profile, { data: undefined, isLoading: false });
  pathname = '/home';
});

describe('AppShell', () => {
  it('lets someone with a pen name stay', async () => {
    profile.data = named('nina');
    shell();
    expect(screen.getByText('the page')).toBeInTheDocument();
    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });

  // Straight to the profile step; from the feed, on to a first card after it
  // (no next), from any other page back to that page.
  it('sends a signed-in account without a profile to onboarding', async () => {
    profile.data = null;
    const view = shell();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/signup?step=profile'));
    view.unmount();

    replace.mockClear();
    pathname = '/messages';
    window.history.replaceState(null, '', '/en/messages?with=bo');
    shell();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`/signup?step=profile&next=${encodeURIComponent('/en/messages?with=bo')}`),
    );
    window.history.replaceState(null, '', '/');
  });

  it('sends a profile that never got a pen name to onboarding to choose one', async () => {
    for (const handle of ['', '   ']) {
      replace.mockClear();
      profile.data = named(handle);
      const view = shell();
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/signup?step=profile'));
      view.unmount();
    }
  });

  it('waits for the profile before deciding', async () => {
    Object.assign(profile, { data: undefined, isLoading: true });
    shell();
    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });

  // One toast for the whole signed-in area, drawn after the page (so it outlives a page's router.replace).
  it('gives every page its one toast, drawn after <main>', async () => {
    profile.data = named('nina');
    function Trash() {
      const toasts = useToast();
      return (
        <button type="button" onClick={() => toasts.show({ message: '已還原' })}>
          restore
        </button>
      );
    }
    const { container } = renderWithIntl(
      <AppShell>
        <Trash />
      </AppShell>,
    );
    const region = screen.getByRole('status');
    // The live region is after the page, not in it.
    expect(container.querySelector('main')!.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('main')!.contains(region)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'restore' }));
    await waitFor(() => expect(region).toHaveTextContent('已還原'));
  });

  it('sends a signed-out visitor to sign in, except on a public page', async () => {
    auth.user = null;
    pathname = '/me';
    const view = shell();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/signin?next=%2Fme'));
    view.unmount();
    replace.mockClear();
    pathname = '/card/a-walk';
    shell();
    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });
});
