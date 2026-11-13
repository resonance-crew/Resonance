export const meta = {
  name: 'round-build',
  description: 'One Resonance round after the owner signed off the spec: lanes in their worktrees, merge into the round base, post-merge review, fixes, then the round record in Resonance-notes. Never pushes, never touches main.',
  whenToUse: 'After the owner has said go on a settled spec and its acceptance list (signedOff filled in). Before round-verify.',
  phases: [
    { title: 'Preflight', detail: 'check the spec, the signed acceptance list, make the worktrees' },
    { title: 'Lanes', detail: 'one agent per platform, in its own worktree' },
    { title: 'Merge', detail: 'lanes into rNN/base, suites, acceptance run' },
    { title: 'Review', detail: 'one read-only reviewer per lens, then a refuter' },
    { title: 'Fixes', detail: 'confirmed findings, fixed and checked again' },
    { title: 'Record', detail: 'spec, findings, decisions, open items into Resonance-notes' },
  ],
}

// UNTESTED (2026-11-13): written from the structure of the round-23 scripts (r23-lanes, r23-review, r23-fixes),
// not yet run. Checked only by `node --check` through scripts/round/workflows.test.ts. The first run should be a
// small round watched end to end (docs/agents/README.md, "Starting a round").
//
// args (all paths absolute):
//   round       25
//   date        '2026-11-14'              (scripts can't read the clock; it names the record)
//   notes       '/Users/ncchen/Documents/Resonance-notes/2026-11-14-round25'
//   spec        '<notes>/spec.md'         (the settled spec; never under /tmp)
//   acceptance  '<notes>/acceptance.json' (signedOff filled in by the owner's words)
//   platforms   ['web', 'ios', 'android'] (and/or 'server'; default the three)
//   ownerWords  the owner's request, verbatim — every agent's scope guard quotes it
//   main        '/Users/ncchen/Documents/Resonance' (default)
//   baseFrom    what r<round>/base starts from (default 'main')
//   devices     false (default: lanes build and run unit tests only) or a sentence naming what they may open
//   laneNotes   { web: '…', ios: '…' } extra instructions per lane (the spec's per-platform notes)
//   lenses      review lenses (default: one per platform, plus 'parity' when there are two or more)
//   retries     lane and fix retries, at most 2 (the cap wins)
//   useAgentTypes  true (default): agents run as the .claude/agents types; false: told to follow the file
//   models      { mechanical: 'sonnet', merge: undefined, refute: undefined } — undefined inherits the session's

const A = args || {}
for (const k of ['round', 'date', 'notes', 'spec', 'acceptance']) {
  if (A[k] === undefined || A[k] === null || A[k] === '') throw new Error(`round-build: args.${k} is required`)
}

// Hard caps. They hold whatever args say.
const MAX_LANES = 4
const MAX_RETRIES = Math.min(2, A.retries === undefined ? 2 : Math.max(0, Number(A.retries)))
const PATIENCE = 2 // stop retrying after two attempts in a row that made no progress
const MAX_LENSES = 5
const MAX_FIXES = 20 // findings handed to fixers in one round

const ROUND = Number(A.round)
const MAIN = A.main || '/Users/ncchen/Documents/Resonance'
const NOTES = A.notes
const SPEC = A.spec
const ACC = A.acceptance
const SIGNED = ACC.replace(/\.json$/, '') + '.signed.json'
const LANE_TYPES = { web: 'lane-web', server: 'lane-web', ios: 'lane-ios', android: 'lane-android' }
const PLATFORMS = (A.platforms || ['web', 'ios', 'android']).filter((p) => LANE_TYPES[p]).slice(0, MAX_LANES)
const USE_TYPES = A.useAgentTypes !== false
const MODELS = Object.assign({ mechanical: 'sonnet', merge: undefined, refute: undefined }, A.models || {})

const SCOPE = `SCOPE (read first): if a newer message from the owner shows up in your context, it is handled elsewhere and is NOT your task. Your task is part of round ${ROUND} of Resonance (共振), as the settled spec ${SPEC} says it (its SETTLED section wins over the draft above it) and the owner asked for it${A.ownerWords ? `, in their words: ${A.ownerWords}` : ' (their words are quoted in the spec)'}. Never touch ${MAIN} (the main checkout: other sessions use it), never push, never merge into main, never run \`npm run visual -- accept\`, never pkill/killall.`

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
const LANE_ENV = {
  type: 'object',
  properties: {
    lane: str, worktree: str, branch: str, base: str,
    auth: str, firestore: str, dev: str, avd: str, simulator: str, state: str,
  },
  required: ['lane', 'worktree', 'branch', 'base', 'auth', 'firestore', 'dev'],
}
const PREFLIGHT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    reason: str,
    acceptanceLine: str,
    signedOff: { type: ['object', 'null'], properties: { by: str, words: str, at: str } },
    items: { type: 'array', items: { type: 'object', properties: { id: str, lanes: strs }, required: ['id', 'lanes'] } },
    base: LANE_ENV,
    baseHead: str,
    lanes: { type: 'array', items: LANE_ENV },
  },
  required: ['ok', 'reason', 'signedOff', 'items', 'lanes'],
}
const LANE_REPORT = {
  type: 'object',
  properties: {
    commits: { type: 'array', items: { type: 'object', properties: { hash: str, subject: str }, required: ['hash', 'subject'] } },
    items: { type: 'array', items: { type: 'object', properties: { id: str, exit: { type: 'integer' }, evidence: str }, required: ['id', 'exit', 'evidence'] } },
    built: strs,
    tests: { type: 'array', items: { type: 'object', properties: { command: str, exit: { type: 'integer' }, counts: str }, required: ['command', 'exit'] } },
    notDone: strs,
    decisions: strs,
    strings: strs,
    docsNotes: strs,
    mergeRisks: strs,
  },
  required: ['commits', 'items', 'tests', 'notDone', 'decisions', 'strings', 'docsNotes', 'mergeRisks'],
}
const MERGE = {
  type: 'object',
  properties: {
    head: str,
    merged: { type: 'array', items: { type: 'object', properties: { lane: str, commit: str, conflicts: strs }, required: ['lane', 'commit', 'conflicts'] } },
    suites: { type: 'array', items: { type: 'object', properties: { command: str, exit: { type: 'integer' } }, required: ['command', 'exit'] } },
    acceptanceLine: str,
    acceptanceExit: { type: 'integer' },
    openItems: strs,
    problems: strs,
  },
  required: ['head', 'merged', 'suites', 'acceptanceLine', 'acceptanceExit', 'openItems', 'problems'],
}
const FINDING = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['high', 'medium', 'low'] },
    kind: { type: 'string', enum: ['defect', 'nit'] },
    lens: str, file: str, line: { type: 'integer' },
    summary: str, failure_scenario: str, fix: str, test: str,
  },
  required: ['severity', 'kind', 'lens', 'file', 'line', 'summary', 'failure_scenario', 'fix'],
}
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: FINDING } }, required: ['findings'] }
const FIX_REPORT = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'object', properties: { summary: str, files: strs, test: str }, required: ['summary', 'files'] } },
    notReal: { type: 'array', items: { type: 'object', properties: { summary: str, evidence: str }, required: ['summary', 'evidence'] } },
    tests: { type: 'array', items: { type: 'object', properties: { command: str, exit: { type: 'integer' } }, required: ['command', 'exit'] } },
    notes: str,
  },
  required: ['fixed', 'notReal', 'tests', 'notes'],
}
const SETTLE = {
  type: 'object',
  properties: {
    commits: { type: 'array', items: { type: 'object', properties: { hash: str, subject: str }, required: ['hash', 'subject'] } },
    suites: { type: 'array', items: { type: 'object', properties: { command: str, exit: { type: 'integer' } }, required: ['command', 'exit'] } },
    acceptanceLine: str,
    acceptanceExit: { type: 'integer' },
  },
  required: ['commits', 'suites', 'acceptanceLine', 'acceptanceExit'],
}

const result = { round: ROUND, date: A.date, platforms: PLATFORMS, stoppedAt: null }

// ── Preflight ───────────────────────────────────────────────────────────────────────────────────────────────
phase('Preflight')
const pre = await run(`${SCOPE}

You prepare round ${ROUND}'s build. Mechanical steps only; print every command's exit code (\`; echo "exit=$?"\`). Stop at the first step that fails and return ok=false with the reason.

1. The spec ${SPEC} exists and is not under /tmp or /private/tmp.
2. In ${MAIN}: \`npm run -s acceptance -- ${ACC}\` exits 0. Read ${ACC}: return its "signedOff" exactly (null if null) and each item's id and lanes. If signedOff is null, return ok=false, reason "the owner has not signed the acceptance list off".
3. If ${SIGNED} does not exist, copy ${ACC} to it (it is the signed copy every later check compares with). If it exists, \`npm run -s acceptance -- ${ACC} --against ${SIGNED}\` must exit 0. Return the last line it printed as acceptanceLine.
4. \`bash ${MAIN}/scripts/lane.sh ${ROUND} base ${A.baseFrom || 'main'}\` — the round's merge worktree. Return its LANE_* values as base (lane, worktree, branch, base, auth, firestore, dev, state) and \`git -C <its worktree> rev-parse HEAD\` as baseHead.
5. For each of ${JSON.stringify(PLATFORMS)}: \`bash ${MAIN}/scripts/lane.sh ${ROUND} <lane>\` (its base becomes r${ROUND}/base). Return each lane's LANE_* values (LANE_AVD_PORT as avd, LANE_SIMULATOR as simulator).

Create nothing else, edit nothing, commit nothing.`, { label: 'preflight', phase: 'Preflight', schema: PREFLIGHT, model: MODELS.mechanical })

if (!pre || !pre.ok || !pre.signedOff) {
  result.stoppedAt = 'preflight'
  result.preflight = pre
  log(`round-build stopped at preflight: ${pre ? pre.reason : 'no answer'}`)
  return result
}
result.preflight = pre
const BASE = pre.base
const BASE_HEAD = pre.baseHead
log(`r${ROUND}: ${pre.acceptanceLine || 'acceptance list valid'}; base ${BASE.worktree} at ${BASE_HEAD}`)

const itemsOf = (lane) => pre.items.filter((i) => i.lanes.indexOf(lane) >= 0 || (lane === 'ios' && i.lanes.indexOf('mac') >= 0)).map((i) => i.id)
const envLines = (e) => [
  `LANE_WORKTREE=${e.worktree}`, `LANE_BRANCH=${e.branch}`, `LANE_BASE=${e.base}`,
  `LANE_AUTH_PORT=${e.auth}`, `LANE_FIRESTORE_PORT=${e.firestore}`, `LANE_DEV_PORT=${e.dev}`,
  e.avd ? `LANE_AVD_PORT=${e.avd}` : '', e.simulator ? `LANE_SIMULATOR=${e.simulator}` : '',
].filter(Boolean).join('\n')

// ── Lanes ───────────────────────────────────────────────────────────────────────────────────────────────────
phase('Lanes')
function lanePrompt(env, ids, previous) {
  const resume = previous
    ? `\n\nRESUME: an earlier agent of this lane stopped. Its report (or "none" if it died): ${JSON.stringify(previous)}. Read \`git log ${env.base}..HEAD\` in your worktree, keep what is sound, rewrite any wip: commits into clean ones, and finish the items still failing.`
    : ''
  return `${SCOPE}

You are the ${env.lane} lane of round ${ROUND}. Follow docs/agents/lane-brief.md with these values (scripts/lane.sh printed them; run \`bash ${MAIN}/scripts/lane.sh ${ROUND} ${env.lane}\` again to check):
${envLines(env)}

Spec: ${SPEC}. Acceptance list: ${ACC} (signed copy ${SIGNED}) — your items: ${ids.join(', ')}. Run each one's verify command for your lane and report its exit code; don't edit the list.
Devices: ${A.devices ? A.devices : 'open none — build and run the unit tests only (the owner keeps the simulators and the Pixel).'}${A.laneNotes && A.laneNotes[env.lane] ? `\n\nFor this lane: ${A.laneNotes[env.lane]}` : ''}${resume}

Return the lane brief's §8 report in the schema.`
}

const laneRuns = await parallel(pre.lanes.filter((e) => PLATFORMS.indexOf(e.lane) >= 0).map((env) => async () => {
  const ids = itemsOf(env.lane)
  if (!ids.length) {
    log(`${env.lane}: no acceptance item names this lane — skipped`)
    return { lane: env.lane, skipped: true, attempts: [] }
  }
  const attempts = []
  let best = -1
  let still = 0
  let last = null
  for (let i = 0; i <= MAX_RETRIES; i++) {
    const r = await run(lanePrompt(env, ids, i ? last || 'none' : null), {
      label: `lane:${env.lane}${i ? `:retry${i}` : ''}`, phase: 'Lanes', schema: LANE_REPORT, type: LANE_TYPES[env.lane],
    })
    last = r
    const passing = r ? r.items.filter((x) => x.exit === 0 && ids.indexOf(x.id) >= 0).length : -1
    attempts.push({ passing, of: ids.length, report: r })
    log(`${env.lane}: attempt ${i + 1} — ${passing < 0 ? 'no report' : `${passing}/${ids.length} items pass`}`)
    if (passing === ids.length) break
    if (passing > best) { best = passing; still = 0 } else { still++ }
    if (still >= PATIENCE) { log(`${env.lane}: two attempts without progress — stopping this lane`); break }
  }
  return { lane: env.lane, attempts, report: last }
}))
result.lanes = laneRuns.filter(Boolean)
const built = result.lanes.filter((l) => !l.skipped && l.report)
if (!built.length) {
  result.stoppedAt = 'lanes'
  log('round-build stopped: no lane reported')
} else {
  // ── Merge ─────────────────────────────────────────────────────────────────────────────────────────────────
  phase('Merge')
  const merge = await run(`${SCOPE}

You merge round ${ROUND}'s lanes in the round's base worktree ${BASE.worktree} (branch ${BASE.branch}, started at ${BASE_HEAD}). Work only there.

1. For each lane, in this order: ${built.map((l) => `r${ROUND}/${l.lane}`).join(', ')} — \`git merge --no-ff <branch>\` with a message in the house style: \`merge: round ${ROUND} <lane> — <what it brings, in a few words>\` (see \`git log --merges\`), ending with the Co-Authored-By line your session instructions give for commits. Resolve conflicts by keeping both lanes' intent: strings as the union of keys (both src/messages files), generated files regenerated (\`npm run apps:generate\`) never hand-merged. Their reports, for what each did and its merge risks: ${JSON.stringify(built.map((l) => ({ lane: l.lane, commits: l.report.commits, strings: l.report.strings, mergeRisks: l.report.mergeRisks })))}
2. \`npm run apps:generate\`; if it changed anything, commit those files alone (\`chore: 🔁 regenerate what the apps take from the web after the round ${ROUND} merge\`, a \`Visual: none — generated output\` line).
3. Each printed with its exit code: \`npm run lint\`, \`npm run typecheck\`, \`npm test\`; then each app's suite the lanes ran (their commands are in their reports: ${JSON.stringify(built.map((l) => ({ lane: l.lane, tests: l.report.tests.map((t) => t.command) })))}) with build products inside this worktree.
4. \`IOS_SIMULATOR="r${ROUND} base iPhone" npm run -s acceptance -- ${ACC} --run --write --cwd ${BASE.worktree} --against ${SIGNED}; echo "exit=$?"\` (create that simulator for the iOS items with xcrun simctl if iOS items exist, and delete it after). This is the step that sets \`passes\`.
5. Fix only what the merge itself broke (a conflict resolved wrong, a stale generated file). Anything else goes in problems.

Never fast-forward or touch main, never push. Return the schema.`, { label: 'merge', phase: 'Merge', schema: MERGE, model: MODELS.merge })
  result.merge = merge
  if (!merge) {
    result.stoppedAt = 'merge'
    log('round-build stopped: the merge agent gave no answer')
  } else {
    log(`merged at ${merge.head}: ${merge.acceptanceLine}`)

    // ── Review ──────────────────────────────────────────────────────────────────────────────────────────────
    phase('Review')
    const defaultLenses = PLATFORMS.concat(PLATFORMS.length > 1 ? ['parity'] : [])
    const lenses = (A.lenses || defaultLenses).slice(0, MAX_LENSES)
    if ((A.lenses || defaultLenses).length > MAX_LENSES) log(`review: ${MAX_LENSES} lenses at most — dropped ${(A.lenses || defaultLenses).slice(MAX_LENSES).join(', ')}`)
    const WHERE = `The merged round is on ${BASE.branch} in ${BASE.worktree}; the round started at ${BASE_HEAD} (\`git -C ${BASE.worktree} diff ${BASE_HEAD}...HEAD\`). Spec: ${SPEC}.`
    const reviews = await pipeline(
      lenses,
      (lens) => run(`${SCOPE}\n\n${WHERE}\n\nMode: find. Lens: ${lens}.`, { label: `review:${lens}`, phase: 'Review', schema: FINDINGS, type: 'post-merge-reviewer' }),
      (found, lens) => {
        const fs = (found && found.findings) || []
        if (!fs.length) return { lens, raised: 0, confirmed: [] }
        return run(`${SCOPE}\n\n${WHERE}\n\nMode: refute. Another reviewer (lens: ${lens}) claims:\n\n${JSON.stringify(fs, null, 2)}`, {
          label: `refute:${lens}`, phase: 'Review', schema: FINDINGS, type: 'post-merge-reviewer', model: MODELS.refute,
        }).then((v) => ({ lens, raised: fs.length, confirmed: (v && v.findings) || [] }))
      },
    )
    result.review = reviews.filter(Boolean)
    let open = []
    for (const r of result.review) open = open.concat(r.confirmed)
    const nits = open.filter((f) => f.kind === 'nit').slice(0, 3)
    open = open.filter((f) => f.kind !== 'nit').concat(nits)
    log(`review: ${result.review.reduce((n, r) => n + r.raised, 0)} raised, ${open.length} confirmed`)

    // ── Fixes ───────────────────────────────────────────────────────────────────────────────────────────────
    phase('Fixes')
    const treeOf = (f) => (/^(apps\/ios|native\/geometry\/swift)\//.test(f.file) ? 'ios' : /^(apps\/android|native\/geometry\/kotlin)\//.test(f.file) ? 'android' : 'web')
    const TREES = { web: 'src/, scripts/, public/, firebase/ and the root config', ios: 'apps/ios and native/geometry/swift', android: 'apps/android and native/geometry/kotlin' }
    result.fixRounds = []
    let still = 0
    for (let round = 0; round < MAX_RETRIES && open.length; round++) {
      const batch = open.slice(0, MAX_FIXES)
      if (open.length > MAX_FIXES) log(`fixes: ${MAX_FIXES} at a time — ${open.length - MAX_FIXES} wait for the next round or the record`)
      const groups = {}
      for (const f of batch) (groups[treeOf(f)] = groups[treeOf(f)] || []).push(f)
      const trees = Object.keys(groups)
      const fixes = await parallel(trees.map((t) => () => run(`${SCOPE}

You fix post-merge review findings of round ${ROUND} in ${BASE.worktree} (${BASE.branch}). Other agents work in the same worktree at once, one per tree; you touch only ${TREES[t]}. Never commit, stash, reset or check out anything (one agent commits after you). Fix exactly these, nothing else; each fix gets a test that fails without it where the platform allows; if a finding is not real once you trace it, say so with the evidence instead of changing code. Run your tree's tests and print their exit codes.

${JSON.stringify(groups[t], null, 2)}`, { label: `fix:${t}${round ? `:${round + 1}` : ''}`, phase: 'Fixes', schema: FIX_REPORT, type: LANE_TYPES[t] })))
      const settle = await run(`${SCOPE}

In ${BASE.worktree} (${BASE.branch}) the fixers left uncommitted changes for these findings: ${JSON.stringify(trees.map((t, i) => ({ tree: t, report: fixes[i] })))}.
1. Commit them one finding at a time where the files allow (\`git commit -- <paths>\`, never \`git add -A\`), house style (\`fix: <emoji> …\`, a body saying what failed and why), a \`Visual: <screens>: why\` or \`Visual: none — why\` line, the Co-Authored-By line your session instructions give.
2. Each printed with its exit code: \`npm run lint\`, \`npm run typecheck\`, \`npm test\`, and the app suites for the trees touched (${trees.join(', ')}).
3. \`npm run -s acceptance -- ${ACC} --run --write --cwd ${BASE.worktree} --against ${SIGNED}; echo "exit=$?"\`.
Return the schema.`, { label: `settle${round ? `:${round + 1}` : ''}`, phase: 'Fixes', schema: SETTLE, model: MODELS.mechanical })
      const recheck = await parallel(trees.map((t) => () => run(`${SCOPE}\n\nThe merged round is on ${BASE.branch} in ${BASE.worktree}, fixes committed since ${(result.merge && result.merge.head) || BASE_HEAD}. Mode: refute. The claims below are that each finding is STILL present on HEAD after its fix. Refute each one the fix really removed on every path that reached it (and check the fix broke nothing near it); return only the findings still present, plus any new defect the fix introduced.\n\n${JSON.stringify(groups[t], null, 2)}`, {
        label: `recheck:${t}${round ? `:${round + 1}` : ''}`, phase: 'Fixes', schema: FINDINGS, type: 'post-merge-reviewer', model: MODELS.refute,
      }).then((v) => (v && v.findings) || [])))
      let left = []
      for (const r of recheck) left = left.concat(r || [])
      left = left.concat(open.slice(MAX_FIXES))
      result.fixRounds.push({ fixes, settle, left })
      log(`fixes round ${round + 1}: ${open.length} → ${left.length} open; ${settle ? settle.acceptanceLine : 'not settled'}`)
      if (left.length >= open.length) still++
      else still = 0
      open = left
      if (still >= PATIENCE) { log('fixes: two rounds without progress — the rest goes to open items'); break }
    }
    result.openFindings = open
  }
}

// ── Record ──────────────────────────────────────────────────────────────────────────────────────────────────
phase('Record')
const record = await run(`${SCOPE}

You write round ${ROUND}'s record into ${NOTES}, from the data below — not from memory. Write in Traditional Chinese (Taiwan usage) in the house's plain voice: no sentence opens with 「我」, subjects left out where Chinese leaves them out, the owner called 擁有者; code, paths, ids and commit hashes as they are. Create or update only these files, nothing in any repository:

- spec.md — if ${SPEC} is not already ${NOTES}/spec.md, copy it there verbatim.
- review-findings.json — the review and fix data below, verbatim (pretty-printed).
- review-findings.md — one table: 嚴重度 · 檔案:行 · 發現 · 狀態 (已修＋commit／不成立＋理由／未修); then the nits.
- decisions.md — append a section 「## round-build ${A.date}」: each lane's decisions where the spec left room, and the merge's problems.
- open-items.md — append 「## round-build ${A.date}」: items still failing (from the last acceptance line), each lane's notDone, findings still open, strings added, and the docs notes for CLAUDE.md (the lead writes CLAUDE.md, never this step).
- notes.md — if missing, create it: 「# Round ${ROUND}（${A.date}）— <the round in a phrase>」, a status quote block (branch, merge commit, suites with counts, acceptance line, what waits for the owner: round-verify, then the baseline OK and the push), and 「## 這個資料夾裡的文件」. If present, add a 「## round-build ${A.date}」 section with the same facts.
- round-build.json — the whole result below, verbatim.

Data: ${JSON.stringify(result)}`, { label: 'record', phase: 'Record', model: MODELS.mechanical })
result.record = record
log(`round-build r${ROUND} done${result.stoppedAt ? ` (stopped at ${result.stoppedAt})` : ''} — next: the lead reads ${NOTES}/open-items.md, then round-verify`)
return result
