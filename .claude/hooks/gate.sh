#!/bin/sh
# Stop (and SessionStart, to remember where the session began): lint, typecheck and the tests of
# what changed since then, within GATE_BUDGET_S (420 s); a failure blocks the stop once (exit 2).
# Lets go at once when stop_hook_active is true or nothing changed since its last pass. See hooks.mjs.
dir="$(cd "$(dirname "$0")" && pwd)"
. "$dir/node.sh"
[ -n "$NODE" ] || exit 0
exec "$NODE" "$dir/hooks.mjs" gate
