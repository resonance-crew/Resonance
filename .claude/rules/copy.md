---
paths:
  - "src/messages/**"
  - "src/components/**/*.tsx"
  - "src/app/**/*.tsx"
  - "src/lib/push/**"
---

# Copy

**Copy**: a string of one sentence or a fragment ends without a full stop in both languages (zh-TW no 「。」, en no "." — titles, labels, buttons, placeholders, hints, captions, empty states, status lines, toasts, inline errors, push copy); two or more sentences keep every stop, the last too; ？！… stay; en alone keeps the period on a one-sentence alert/confirm dialog body (Apple style; listed in `src/messages/punctuation.test.ts`, which guards the rule).
A page's subtitle (the line under its title — the landing page's, the closing band's, About's, Paper Pals') and the footer's words carry no full stop at all, however much they say: two thoughts are joined by a comma, a semicolon or a dash (the owner's, 2026-11-09).
**共振 is the tap alone** (round 26, §Q1, M1): the card a reader writes in answer is 用卡片回應 / 回應 (narrow 寫卡片, published 已回應; en Reply with a card · Card · Replied), never 共振 and never 連結 alone; a tap connects no one, so no string says a tap or a reply card starts a conversation. `src/messages/replyWords.test.ts` holds the 17 keys that speak of reply cards to that (no 共振 in zh-TW, no "resonan" in en).
