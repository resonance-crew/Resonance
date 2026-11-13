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
