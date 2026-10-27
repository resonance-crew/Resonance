export const meta = {
  name: 'mascot-round2-verify',
  description: 'Check each revised round-2 mascot against its must-fix list, plus one unanchored fresh-eye read of all three',
  phases: [{ title: 'Verify', detail: 'three per-direction checkers and one fresh-eye reader' }],
}

const S = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots'
const R = `${S}/r2`

const SCOPE = `SCOPE: The owner of 共振 Resonance asked for a second try at the brand mascot: 「再幫我試一次。你可以使用像我剛剛說的很好的那些部分保留下來，繼續，做修改」, and earlier: 「在我明確選定或確認方向之前，不要開始設計完整角色系列，也不要繼續生成其他角色或製作動畫。」 Round 2 has been drawn, critiqued and revised once. Your job is ONLY to look and report. Do not edit, redraw or re-render any deliverable (character.svg, concept.svg/png, proposal.md, anything under ${R}/b2, ${R}/c2, ${R}/bc). Do not touch the git repo. If you want your own check images, write them only under ${R}/review/verify/ (create it), rendering with ${S}/render.sh (read it first for usage). Answer in Traditional Chinese (Taiwan), plain and specific.`

const OWNER = `The owner's feedback on round 1 is in ${S}/../../../../../../../Users/ncchen/Documents/Resonance/designs/mascots/round1/feedback.md — if that path does not resolve, read /Users/ncchen/Documents/Resonance/designs/mascots/round1/feedback.md. The round-2 brief with the form rules and the owner's Stitch/Pikachu point is ${R}/brief-r2.md.`

const DIRS = [
  { key: 'b2', name: 'B′ 漾漾 Tint (colored pencil, new form)' },
  { key: 'c2', name: 'C′ 摺摺 Tuck (torn paper, arms fixed only)' },
  { key: 'bc', name: 'B×C 片片 Flick (pencil-shaded cut paper hybrid)' },
]

const VERIFY = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    must_fix: { type: 'array', items: { type: 'object', properties: {
      critic: { type: 'string' }, item: { type: 'string' },
      status: { type: 'string', enum: ['done', 'partial', 'not_done'] }, evidence: { type: 'string' } },
      required: ['critic', 'item', 'status', 'evidence'] } },
    new_problems: { type: 'array', items: { type: 'string' } },
    owner_feedback: { type: 'string' },
    better_or_worse_than_v1: { type: 'string' },
    one_line: { type: 'string' },
  },
  required: ['key', 'must_fix', 'new_problems', 'owner_feedback', 'better_or_worse_than_v1', 'one_line'],
}

const FRESH = {
  type: 'object',
  properties: {
    impressions: { type: 'array', items: { type: 'object', properties: {
      key: { type: 'string' }, first_impression: { type: 'string' }, face_covered_sentence: { type: 'string' },
      cute: { type: 'integer' }, not_weird: { type: 'integer' }, original: { type: 'integer' },
      resembles: { type: 'string' }, keeps_what_owner_liked: { type: 'string' } },
      required: ['key', 'first_impression', 'face_covered_sentence', 'cute', 'not_weird', 'original', 'resembles', 'keeps_what_owner_liked'] } },
    pick: { type: 'string' },
    why: { type: 'string' },
    concerns_for_owner: { type: 'array', items: { type: 'string' } },
  },
  required: ['impressions', 'pick', 'why', 'concerns_for_owner'],
}

phase('Verify')
const results = await parallel([
  ...DIRS.map(d => () => agent(`${SCOPE}

You are checking direction ${d.key} = ${d.name} after its one revision.

${OWNER}

Read, in this order:
1. The two critics' reports on the FIRST draft: ${R}/review/critic-form.md and ${R}/review/critic-production.md — find the section for ${d.key} and its 必修 (must-fix) list. Their check images are in ${R}/review/.
2. The reviser's own log: the ${d.key} section of ${R}/review/revisions.md, and the 修訂紀錄 at the end of ${R}/${d.key}/proposal.md.
3. Look at the images yourself with the Read tool: ${R}/${d.key}/concept-v1.png (before), ${R}/${d.key}/concept.png and ${R}/${d.key}/character.png (after), and every PNG in ${R}/${d.key}/checks/ (and ${R}/${d.key}/work/ if it exists). For context also look at round 1: ${S}/b/concept-v1.png (the B the owner liked for its pencil gradient) and ${S}/c/concept.png (the C v2 the owner liked).

Then judge, from the pictures and not from the reviser's claims:
- For every must-fix from both critics: done, partial or not_done, with what you saw as evidence. Where the reviser declined an item, say whether the reason holds.
- New problems the revision introduced (for example a part that now reads as an ear, a hand that reads as something else, a shape the brief forbids, lost cuteness, a face that drifted toward the generic AI mascot face). Render your own silhouette or small-size check under ${R}/review/verify/ if you need one.
- Whether it now answers the owner's round-1 complaints: form not weird, no skin/peach colours or body-part readings (check upright, upside down, mirrored, black silhouette at 48 and 200 px), a raised hand that reads, a hand with a distinct end, and the parts the owner liked kept.
- Better or worse than its first draft overall, in one or two sentences.
Be honest and specific; a wrong "done" is worse than a harsh "partial".`, { label: `verify:${d.key}`, phase: 'Verify', schema: VERIFY })),
  () => agent(`${SCOPE}

You are a fresh pair of eyes. Do NOT read any proposal.md, any critic report, revisions.md, drafts.md or anything under ${R}/review/ — you must not be anchored by them.

${OWNER} (read feedback.md and brief-r2.md only.)

Look with the Read tool at:
- What the owner liked in round 1: ${S}/b/concept-v1.png (B's colored-pencil grain and gradient) and ${S}/c/concept.png (C v2's torn-paper sticker look).
- The three ChatGPT references the owner generated for form inspiration: ${R}/reference/*.png.
- The three round-2 results, final versions only: ${R}/b2/concept.png + ${R}/b2/character.png, ${R}/c2/concept.png + ${R}/c2/character.png, ${R}/bc/concept.png + ${R}/bc/character.png.

For each of b2, c2, bc report as the owner would see it on first look: the first impression in a sentence; the face-covered test (describe it in one sentence without an animal name — if you can only say a generic animal or "a blob", say so); cute, not_weird and original each scored 1–5; what it resembles, if anything (famous characters, generic AI mascots, objects, body parts); and whether it keeps what the owner liked. Then pick the one you would put forward, why, and the concerns the owner should know before choosing.`, { label: 'fresh-eye', phase: 'Verify', schema: FRESH }),
])
return { verify: results.slice(0, 3), fresh: results[3] }
