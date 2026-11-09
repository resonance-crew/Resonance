'use client';

import { NotificationsPage } from '@/components/sections/NotificationsPage/NotificationsPage';

// The bell's own page (round 23 §4): what a phone's bell opens, as the apps' 通知 tab. Client-direct like
// 私訊 — AppShell sends a signed-out visitor to sign in; robots.txt closes it (lib/seo APP_PAGES).
export default function Notifications() {
  return <NotificationsPage />;
}
