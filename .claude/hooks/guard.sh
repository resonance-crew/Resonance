#!/bin/sh
# PreToolUse on Bash|Edit|Write|MultiEdit: refuses what only the owner decides (pkill / killall,
# git push, git add -A / ., git commit -a, visual accept without the owner's words, writes under
# visual/baseline/). The way through after the owner's yes: docs/rules/hooks.md. See hooks.mjs.
dir="$(cd "$(dirname "$0")" && pwd)"
. "$dir/node.sh"
if [ -n "$NODE" ]; then exec "$NODE" "$dir/hooks.mjs" guard; fi
# No node: a cruder check on the raw input, so the guard fails closed on the worst cases.
input="$(cat)"
if printf '%s' "$input" | grep -Eq 'pkill|killall|git[^"]* push|git add (-A|--all|\.)|visual/baseline'; then
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"The guard hook could not find node, and this looks like pkill/killall, git push, git add -A, or a write under visual/baseline/ — which only the owner decides. Ask 念誠 to run it."}}'
fi
exit 0
