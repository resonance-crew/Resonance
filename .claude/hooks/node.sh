# Sourced by the hooks: finds node for hooks.mjs, as Claude Code's shell may not have the user's PATH.
NODE="$(command -v node 2>/dev/null)"
for candidate in "$HOME/.local/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -z "$NODE" ] && [ -x "$candidate" ] && NODE="$candidate"
done
