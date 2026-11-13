#!/bin/sh
# PostToolUse on Edit|Write|MultiEdit: after a UI file changes, its platform's source-scan rule tests
# (a second or two); a broken rule goes back to Claude on stderr with exit 2. See hooks.mjs.
dir="$(cd "$(dirname "$0")" && pwd)"
. "$dir/node.sh"
[ -n "$NODE" ] || exit 0
exec "$NODE" "$dir/hooks.mjs" ui-rules
