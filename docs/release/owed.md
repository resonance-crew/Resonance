# Owed before the next release

What a round left undone that a release depends on: a Firestore rules or indexes deploy, a
production backfill, a store declaration. `scripts/release/preflight.ts` fails while any line
below is an open `- [ ]` item, so nothing ships on top of it unnoticed (on 2026-10-27 a rules
deploy was still owed from round 16, written only in a round's notes).

- Add a line when a commit needs something done in production that the push doesn't do:
  `- [ ] <kind>: <what> (<round or commit>) — <the command>`.
- Tick it (`- [x]`, with the date) once it is done — on the owner's go, as every production
  write is — and keep it here until the release after, so the next one can see what was done.
- The rules check in preflight compares the deployed ruleset with `firebase/firestore.rules`
  on its own; a line here is still worth writing when the order matters (rules before the web).

## Open

## Done
