---
paths:
  - "src/lib/share/**"
  - "src/components/molecules/ShareMenu/**"
  - "src/components/atoms/BrandMark/**"
  - "apps/ios/Resonance/Features/Share/**"
  - "apps/android/**/share/**"
  - "native/brand/**"
  - "native/fixtures/share-*.json"
---

# Sharing

## Sharing

A card or a profile is shared by its link, and `src/lib/share/links.ts` is the one rule for it: `{origin}/card/{slug, else id}` (no locale, no tracking) — **always the id for an anonymous card**, since a slug that collided carries its author's pen name and slugs never change — and `{origin}/u/{handle}`.
The web's `molecules/ShareMenu` sits before the ⋯ in the card page's byline row (`StoryByline`) and last in a profile's actions row; on a card it shows only when the card itself is published and public — never decided by the viewer, a connection or a block, so sharing is never a probe.
On a touch screen with Web Share it opens the system sheet (the owner of an anonymous card gets the menu instead, for its hint); elsewhere it drops 複製連結 · LINE · Threads · Facebook · X (· 更多分享方式), each platform its documented web intent in a popup — no SDK, so no new script, frame or connect origin for the CSP; Facebook is the Share Dialog once `NEXT_PUBLIC_META_APP_ID` is set (sharer.php until then).
The rows wear `atoms/BrandMark`: each brand's official monochrome mark, unmodified (taken verbatim from Simple Icons, CC0; a test pins each path's hash), web only and outside the Icon registry.
The apps hand the system share sheet the link alone — Instagram too, so a message sent through it can be tapped (once Instagram has what is shared, its own picker decides story or message, and no app is told which) — and the 9:16 picture only through their own two actions, 儲存圖片 and Instagram 限時動態; Meta's Stories intent takes no link from a third-party app, so 限時動態 copies the card's link first and says to paste it in a 「連結」 sticker (`share.image.storiesLinkCopied`).
On iOS 限時動態 is an `.action` activity (`InstagramStoriesActivity`, title `share.toStories`): a row in the sheet's actions beside 儲存影像 — as a `.share` activity the sheet never drew it (round 25 §C, the owner: 「iPhone 的分享面板里面现在没有 Instagram 现实动态这一颗」), and the sheet's own Instagram tile only ever takes the link. It is offered when Instagram answers `instagram-stories` (in `LSApplicationQueriesSchemes`; `CardShareTests` pins the category, the title and the plist); a Debug build offers it without Instagram under `-debugStories YES`, and `-debugShare YES` opens the sheet on the card page — a simulator can't install Instagram, so the story composer itself is checked on a phone.
Its glyph is Instagram's mark, `native/brand/instagram.svg` (Simple Icons, verbatim; Android's sheet draws another package's adaptive icon blank).
