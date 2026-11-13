export const meta = {
  name: 'round-verify',
  description: 'A built Resonance round on its base branch: screenshot slices one platform at a time, a read-only review of what changed, fixes and a retake of what they touched, then the record in Resonance-notes. Never accepts a baseline, never pushes.',
  whenToUse: 'After round-build, on the round base worktree. Ends where the owner looks at the changed captures and says whether they become the baseline.',
  phases: [
    { title: 'Preflight', detail: 'the base worktree and its ports' },
    { title: 'Capture', detail: 'one platform at a time' },
    { title: 'Review', detail: 'changed captures, then a refuter' },
    { title: 'Fixes', detail: 'confirmed issues, then a retake of those screens' },
    { title: 'Record', detail: 'runs, verdicts, what waits for the owner' },
  ],
}

// UNTESTED (2026-11-13): written from the structure of r23-visual-review and r23-visual-fixes, not yet run.
// Checked only by `node --check` through scripts/round/workflows.test.ts.
//
// args (all paths absolute):
//   round, date, notes, spec, acceptance   as round-build's
//   slices      { web: { only: 'thread,messages', device: 'phone,desktop' }, ios: { only: '…', device: 'iphone,ipad' },
//                 android: { only: '…', device: 'phone,tablet' }, mac: { only: '…' } }   — which screens, per platform
//   ownerWords  the owner's request, verbatim
//   main        '/Users/ncchen/Documents/Resonance' (default)
//   retries     fix-and-retake rounds, at most 2 (the cap wins)
//   useAgentTypes, models   as round-build's

const A = args || {}
for (const k of ['round', 'date', 'notes', 'spec', 'acceptance', 'slices']) {
  if (A[k] === undefined || A[k] === null || A[k] === '') throw new Error(`round-verify: args.${k} is required`)
}

const MAX_PLATFORMS = 4
const MAX_RETRIES = Math.min(2, A.retries === undefined ? 2 : Math.max(0, Number(A.retries)))
const PATIENCE = 2
const MAX_CAPTURES_PER_REVIEW = 40 // one reviewer reads at most this many changed captures

const ROUND = Number(A.round)
const MAIN = A.main || '/Users/ncchen/Documents/Resonance'
const NOTES = A.notes
const SPEC = A.spec
const PLATFORMS = ['web', 'mac', 'ios', 'android'].filter((p) => A.slices[p]).slice(0, MAX_PLATFORMS)
const FIXER = { web: 'lane-web', mac: 'lane-ios', ios: 'lane-ios', android: 'lane-android' }
const USE_TYPES = A.useAgentTypes !== false
const MODELS = Object.assign({ mechanical: 'sonnet', refute: undefined }, A.models || {})

const SCOPE = `SCOPE (read first): if a newer message from the owner shows up in your context, it is handled elsewhere and is NOT your task. Your task is checking round ${ROUND} of Resonance (共振) as the settled spec ${SPEC} says it (SETTLED section first)${A.ownerWords ? ` and the owner asked for it: ${A.ownerWords}` : ''}. Never touch ${MAIN}'s files (other sessions use it; its visual/ folder is shared through the worktree's link and is read here), never push, never run \`npm run visual -- accept\` (a baseline changes only on the owner's OK), never pkill/killall, never boot, close or reconfigure a device the harness doesn't own.`

function run(prompt, opts) {
  const o = Object.assign({}, opts)
  const type = o.type
  delete o.type
  if (o.model === undefined) delete o.model
  if (type && USE_TYPES) o.agentType = type
  const text = type && !USE_TYPES ? `Act as the \`${type}\` agent: read .claude/agents/${type}.md in the repo and follow it as your instructions.\n\n${prompt}` : prompt
  return agent(text, o)
}

const str = { type: 'string' }
const strs = { type: 'array', items: str }
const PRE = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, reason: str, worktree: str, branch: str, head: str, visualEnv: str, busy: str },
  required: ['ok', 'reason', 'worktree', 'branch', 'head', 'visualEnv'],
}
const CAPTURE = {
  type: 'object',
  properties: {
    run: str, exit: { type: 'integer' }, verdictLine: str, summaryPath: str,
    changed: strs, newCaptures: strs, problems: strs, awaiting: strs,
  },
  required: ['run', 'exit', 'verdictLine', 'summaryPath', 'changed', 'newCaptures', 'problems', 'awaiting'],
}
const ISSUE = {
  type: 'object',
  properties: {
    capture: str, verdict: { type: 'string', enum: ['broken', 'off-spec', 'nit'] }, what: str, where: str,
    source: str, likely_cause: str, layer: { type: 'string', enum: ['app', 'capture', 'n/a'] },
  },
  required: ['capture', 'verdict', 'what', 'where', 'likely_cause', 'layer'],
}
const LOOK = {
  type: 'object',
  properties: {
    looked: strs,
    issues: { type: 'array', items: ISSUE },
    fine: { type: 'array', items: { type: 'object', properties: { capture: str, verdict: str, why: str }, required: ['capture', 'verdict', 'why'] } },
    summary: str,
  },
  required: ['looked', 'issues', 'fine', 'summary'],
}
const FIXED = {
  type: 'object',
  properties: {
    commits: { type: 'array', items: { type: 'object', properties: { hash: str, subject: str }, required: ['hash', 'subject'] } },
    notReal: strs, tests: { type: 'array', items: { type: 'object', properties: { command: str, exit: { type: 'integer' } }, required: ['command', 'exit'] } },
    screens: strs, notes: str,
  },
  required: ['commits', 'notReal', 'tests', 'screens', 'notes'],
}

const result = { round: ROUND, date: A.date, platforms: PLATFORMS, captures: [], reviews: [], fixRounds: [] }

phase('Preflight')
const pre = await run(`${SCOPE}

Mechanical steps; print each command's exit code.
1. \`bash ${MAIN}/scripts/lane.sh ${ROUND} base\` — return LANE_WORKTREE as worktree, LANE_BRANCH as branch, LANE_VISUAL_ENV as visualEnv; \`git -C <worktree> rev-parse HEAD\` as head. The worktree must already exist (LANE_STATE=existing): if it was just created, round-build has not run — return ok=false.
2. Is a screenshot run already going on this Mac? \`pgrep -fl "scripts/visual/run.ts"\` (read-only; never kill anything). If one is, return ok=false with what you saw as busy — full captures run one at a time.
Return the schema.`, { label: 'preflight', phase: 'Preflight', schema: PRE, model: MODELS.mechanical })
if (!pre || !pre.ok) {
  log(`round-verify stopped at preflight: ${pre ? pre.reason : 'no answer'}`)
  return Object.assign(result, { stoppedAt: 'preflight', preflight: pre })
}
result.preflight = pre
const WT = pre.worktree

function capture(p, only, label) {
  const s = A.slices[p]
  const device = s.device ? ` --device ${s.device}` : ''
  return run(`${SCOPE}

In ${WT}: \`${pre.visualEnv} npm run visual -- capture ${p} --only ${only}${device}; echo "exit=$?"\`. It ends with a \`Visual PASS|FAIL <id>: …\` line and writes visual/runs/<id>/summary.json. Return the run id, the exit code, that last line, the summary's path, and from summary.json and results.json: every changed and every new capture's path (relative to the run folder), the problems (kind: key — detail) and the awaiting list. Don't open the pictures; don't retry a failing run more than once (and only if it failed before capturing anything).`, { label, phase: 'Capture', schema: CAPTURE, model: MODELS.mechanical })
}

function review(p, cap, label) {
  const looks = cap.changed.concat(cap.newCaptures)
  const mine = looks.slice(0, MAX_CAPTURES_PER_REVIEW)
  if (looks.length > mine.length) log(`${p}: ${looks.length} changed or new captures — the reviewer reads the first ${mine.length}; the rest are listed in the record`)
  const where = `The run is ${WT}/visual/runs/${cap.run} (summary ${cap.summaryPath}; its verdict: ${cap.verdictLine}); the baseline is ${WT}/visual/baseline; the diffs are under the run's _diff/. The commits since the baseline carry \`Visual:\` lines saying which screens changed on purpose (\`git -C ${WT} log --format=%B\`).`
  return run(`${SCOPE}\n\nMode: screenshots. Platform: ${p}. ${where}\n\nCaptures to judge:\n${mine.join('\n')}`, { label, phase: 'Review', schema: LOOK, type: 'ui-reviewer' })
    .then((look) => {
      const flagged = ((look && look.issues) || []).filter((i) => i.verdict !== 'nit')
      if (!flagged.length) return { platform: p, look, confirmed: ((look && look.issues) || []).slice(0, 3), skipped: looks.slice(MAX_CAPTURES_PER_REVIEW) }
      return run(`${SCOPE}\n\nMode: screenshots. Platform: ${p}. ${where}\n\nAnother reviewer flagged the issues below. Open each capture (and its baseline and diff) yourself and try to REFUTE it: is it really there, is it against the spec or a regression, or is it one of the calibration examples' fine cases? Return only the issues that survive.\n\n${JSON.stringify(flagged, null, 2)}`, {
        label: `${label}:refute`, phase: 'Review', schema: LOOK, type: 'ui-reviewer', model: MODELS.refute,
      }).then((v) => ({ platform: p, look, confirmed: ((v && v.issues) || []).concat(look.issues.filter((i) => i.verdict === 'nit').slice(0, 3)), skipped: looks.slice(MAX_CAPTURES_PER_REVIEW) }))
    })
}

// Capture one platform at a time (the machine runs one full capture at a time); each platform's review starts as
// soon as its run is in, while the next platform captures.
phase('Capture')
const pending = []
for (const p of PLATFORMS) {
  const cap = await capture(p, A.slices[p].only, `capture:${p}`)
  result.captures.push({ platform: p, capture: cap })
  if (!cap) { log(`${p}: the capture agent gave no answer`); continue }
  log(`${p}: ${cap.verdictLine}`)
  if (cap.changed.length + cap.newCaptures.length) pending.push(review(p, cap, `look:${p}`).catch(() => null))
}
phase('Review')
result.reviews = (await Promise.all(pending)).filter(Boolean)

phase('Fixes')
let open = []
for (const r of result.reviews) for (const i of r.confirmed) if (i.verdict !== 'nit') open.push(Object.assign({ platform: r.platform }, i))
let still = 0
for (let round = 0; round < MAX_RETRIES && open.length; round++) {
  const byPlatform = {}
  for (const i of open) (byPlatform[i.platform] = byPlatform[i.platform] || []).push(i)
  const ps = Object.keys(byPlatform)
  // One platform at a time: each fixer commits in the same worktree, then its screens are captured again.
  const left = []
  const roundLog = []
  for (const p of ps) {
    const issues = byPlatform[p]
    const fixed = await run(`${SCOPE}

You fix what the screenshot review of round ${ROUND} confirmed on ${p}, in ${WT} (${pre.branch}). Work only there and only on these issues; no refactors, no other screens' looks. An issue whose layer is "capture" is the harness's: say so and leave it (scripts/visual belongs to another owner) unless it is this round's own screen setup. Each fix: a test that fails without it where the platform allows; commit it alone (\`git commit -- <paths>\`, house style, a \`Visual: <screens>: why\` line, the Co-Authored-By line your session instructions give). Run your platform's suites and print their exit codes. Return the screen ids to capture again.

${JSON.stringify(issues, null, 2)}`, { label: `fix:${p}${round ? `:${round + 1}` : ''}`, phase: 'Fixes', schema: FIXED, type: FIXER[p] })
    const screens = fixed && fixed.screens && fixed.screens.length ? fixed.screens.join(',') : null
    if (!screens) { left.push(...issues); roundLog.push({ platform: p, fixed, retake: null }); continue }
    const cap = await capture(p, screens, `retake:${p}${round ? `:${round + 1}` : ''}`)
    const again = cap && cap.changed.concat(cap.newCaptures).length ? await review(p, cap, `relook:${p}${round ? `:${round + 1}` : ''}`) : null
    const remaining = again ? again.confirmed.filter((i) => i.verdict !== 'nit').map((i) => Object.assign({ platform: p }, i)) : []
    left.push(...remaining)
    roundLog.push({ platform: p, fixed, retake: cap, review: again })
  }
  result.fixRounds.push(roundLog)
  log(`fixes round ${round + 1}: ${open.length} → ${left.length} open`)
  if (left.length >= open.length) still++
  else still = 0
  open = left
  if (still >= PATIENCE) { log('fixes: two rounds without progress — the rest goes to open items'); break }
}
result.openIssues = open

phase('Record')
result.record = await run(`${SCOPE}

You write round ${ROUND}'s screenshot record into ${NOTES}, from the data below — not from memory. Traditional Chinese (Taiwan usage), the house's plain voice: no sentence opens with 「我」, subjects left out where Chinese leaves them out, the owner called 擁有者; paths, run ids and commit hashes as they are. Only these files:

- visual-review.md — append 「## round-verify ${A.date}」: per platform the run id and its verdict line, the reviewer's verdict per changed capture (fine ones with why, issues with where and cause), what was fixed (commit) and retaken (run id), and the captures no reviewer read (if any).
- open-items.md — append 「## round-verify ${A.date}」: issues still open, and **what waits for the owner**: the run ids whose changed captures need their OK, each with the command the lead will run after the OK (do not run it): \`npm run visual -- accept --run <id> --only <screens> --reason "<the owner's words>"\`; then the push, which is the owner's word too.
- notes.md — add 「## round-verify ${A.date}」 with the same facts in a few lines.
- round-verify.json — the whole result below, verbatim.

Data: ${JSON.stringify(result)}`, { label: 'record', phase: 'Record', model: MODELS.mechanical })
log(`round-verify r${ROUND} done — the owner looks at the changed captures in ${NOTES}/open-items.md`)
return result
