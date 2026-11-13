# AGENTS.md

The guide for coding agents working in this repository — commands, architecture, conventions and
the hard verification rules — is [CLAUDE.md](CLAUDE.md). Read it first; it applies to every agent,
not only Claude Code.

CLAUDE.md holds the commands, the architecture map and the zero-exception rules. Each part's own rules
are in [.claude/rules/](.claude/rules/): Claude Code loads a file there when it works on a path the
file's `paths:` frontmatter names; **any other agent must read the matching files itself before
changing that part** — CLAUDE.md's "Where each part's rules live" table says which file covers what
(any UI change: `layout.md` and `design-system.md`; anything on the server: `safety.md`).
