---
paths:
  - "src/lib/markdown/**"
  - "src/components/molecules/MarkdownEditor/**"
  - "src/components/molecules/CardDetail/**"
  - "src/components/molecules/CardEditor/**"
  - "native/editor/**"
  - "native/fixtures/markdown-corpus.json"
  - "src/styles/story.css"
  - "apps/**/Story*"
  - "apps/ios/Resonance/Features/Write/**"
---

# The story editor

## Story editor & its Markdown

Stories are stored as Markdown, so the editor's schema *is* the storage format.
`src/lib/markdown/editorSchema.ts` holds it (nodes + their Markdown serialization, no UI); the web `MarkdownEditor` adds React node views and the native apps' WebView island (`native/editor`) adds DOM ones — both call `storyExtensions()`.
A GFM table is one `MarkdownTable` block holding its Markdown (markdown-it's table tokens become their source lines, verbatim at the top level, rebuilt from the cells in a quote or list), set in the code type, written back exactly — never a grid to edit; the readers draw it (web `StoryTable`: rules, not boxes — hand-drawn, `lib/design/tableRules`: the header's ±1.0 past both ends, the rows' ±0.7 stopping short —, every cell start-aligned whatever the colons say; horizontal scroll with a fading edge).
Typed by hand, a header row then its delimiter row become the block on Enter (one undo step; an empty last row leaves it); the writer's block wears 表格 / Table (`card.table`).
A link alone on its line whose words are its own address (`<url>`, `[url](url)`, a bare address — the reader's card rule, `wordsAreTheAddress`; not our own pages or an IP address) is a `linkCard` block, written back as `<url>`: from a stored story, an address pasted onto an empty line, Enter after one, or the link editor's 卡片.
The link tool without UI is `src/lib/markdown/storyLinkEdit.ts` (what the selection's link is, whether 卡片 is offered, 完成 / 移除連結; the island's `exec('link' | 'unlink')` and `state.link` / `canCard`); the web's link editor is the house dialog (`LinkEditor` on `Modal`, round 17: 插入連結 / 編輯連結, the field, 顯示為 over 卡片 | 文字, 移除連結 (a quiet text button, `OrganicButton variant="quiet"`) · 完成, every control 44 tall; keyboard-aware on a phone, centred over the writer's pane at the desktop split — `Modal centerOver`, the pane marked `data-dialog-host`) for a fine pointer and a finger alike, opened from the bubble's 連結 and the keyboard bar's glyph (each its toolbar's last tool, after a separator), ⌘K / Ctrl+K and the empty line's ＋, and a link card in the writer shows the live card's stored preview (`linkPreviews`).
`MarkdownPaste` reads a paste's plain text as Markdown when its HTML carries no formatting of its own (what phones and code editors put beside plain text); pasted blocks stand on their own, words alone join the line.
A story too costly to read as a tree — more than 32 quotes or list items opened on a line, 128 columns of indentation, more than 200 inline delimiters (`* _ ~ \` [ ]`) in a paragraph outside code fences, or 1 000 000 for the paragraphs' counts squared, or tables of more than 5 000 cells in all — each blank-line block with a line that could be a delimiter row (only `-` `:` `|` `>` and spaces; a table needs no `|`) read as (most `|` on a line + 1) × its lines, since the web's parser resolves a story's tables in one pass quadratic in their cells — with LF, CR and CRLF all ending a line (`storyTooComplex` in `src/lib/markdown/storyLimits.ts`, the apps' `StoryNesting.tooComplex`, the same numbers) — is drawn as its words, embeds and link-cards nothing, and a share card quotes none of it, on every platform: the parsers recurse per level and match delimiters in quadratic time, and the rules let a story run to 200 000 characters.
A story picture is drawn only when it is on the site's host or one under it (stored pictures are on `img.<site>`), written into the story (`data:image/`) or a path of the site's — `drawnPicture` in `StoryMarkdown`, the apps' `StoryPictures` (their site host set from the API origin: Android's `ApiConfiguration`, iOS's `SessionStore`); any other is a link the reader opens on purpose, never fetched on opening the story (its host would learn every reader's address and time — an anonymous card's author's too, on the page their notification opens).
`native/fixtures/markdown-corpus.json` pins how each kind of content round-trips (`editorSchema.test.ts`, and the same corpus runs inside both apps).
After an intentional schema change: `UPDATE_MARKDOWN_CORPUS=1 npx vitest run src/lib/markdown/editorSchema.test.ts` and review the diff.
