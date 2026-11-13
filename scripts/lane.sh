#!/usr/bin/env bash
# One round's lane: a sibling worktree on its own branch, set up the way every lane needs it, with
# private ports that follow from the round and the lane (never picked by hand).
#
#   scripts/lane.sh <round> <lane> [base]
#
#   <round>  25, r25 or round25
#   <lane>   web | ios | android | server | mac | base
#            base is the round's merge worktree: ../<main>-r25 on r25/base
#   [base]   what a new branch starts from. Default: r<round>/base when that branch exists, else main
#
# Run it from any checkout of the repo. It finds the main checkout from `git worktree list`, never
# edits, stages or switches anything there, and refuses a lane whose worktree would be the main
# checkout itself. Running it again is safe: an existing worktree is checked and its setup topped up.
#
# What the main checkout gives the lane (each only when the lane lacks it):
#   node_modules           a symlink to the main checkout's (no npm install per lane)
#   .env*                  copies of the git-ignored env files (the tracked .env.example is already there)
#   apps/android/local.properties, native/editor/dist, native/mascots/dist   copies (git-ignored)
#   visual                 a symlink to the main checkout's screenshots folder (its baseline and runs)
#
# Prints KEY='value' lines on stdout (eval-able; the workflows and lane agents read them), hints on stderr.
#
# Ports: slot = (round mod 16) * 6 + lane index (web 0, ios 1, android 2, server 3, mac 4, base 5).
#   auth 9400+slot, firestore 8400+slot, dev server 3400+slot; an Android lane's AVD console port
#   5620 + 2*(round mod 16) (even, inside the emulator's 5554–5682). These ranges sit clear of the
#   shared defaults (9099/8080, the private 9199/8180 pair, the visual harness's 9299/8280/3150,
#   the dev server's 3100 and the shared AVDs on 5554–5602). Rounds 16 apart share ports; two
#   rounds that far apart are never open at once.
set -euo pipefail

die() { echo "lane.sh: $*" >&2; exit 2; }
note() { echo "lane.sh: $*" >&2; }

[ $# -ge 2 ] && [ $# -le 3 ] || die "usage: scripts/lane.sh <round> <web|ios|android|server|mac|base> [base]"

round_arg=$1
lane=$2
base_arg=${3:-}

round=${round_arg#round}
round=${round#r}
[[ $round =~ ^[0-9]+$ ]] || die "round must be a number (25, r25 or round25), got '$round_arg'"
round=$((10#$round))

case $lane in
  web) idx=0 ;;
  ios) idx=1 ;;
  android) idx=2 ;;
  server) idx=3 ;;
  mac) idx=4 ;;
  base) idx=5 ;;
  *) die "unknown lane '$lane' (web, ios, android, server, mac or base)" ;;
esac

git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"

# The main checkout is the first entry of `git worktree list`.
main=$(git worktree list --porcelain | awk '/^worktree /{ sub(/^worktree /, ""); print; exit }')
[ -n "$main" ] && [ -d "$main" ] || die "could not find the main checkout"
main=$(cd "$main" && pwd -P)
parent=$(dirname "$main")
name=$(basename "$main")

if [ "$lane" = base ]; then
  branch="r$round/base"
  worktree="$parent/$name-r$round"
else
  branch="r$round/$lane"
  worktree="$parent/$name-r$round-$lane"
fi

[ "$worktree" != "$main" ] || die "refusing: the lane's worktree would be the main checkout"
main_branch=$(git -C "$main" symbolic-ref --quiet --short HEAD || true)
[ "$branch" != "$main_branch" ] || die "refusing: $branch is checked out in the main checkout"

# Where a new branch starts.
if [ -n "$base_arg" ]; then
  base=$base_arg
elif [ "$lane" != base ] && git -C "$main" rev-parse --verify --quiet "refs/heads/r$round/base" >/dev/null; then
  base="r$round/base"
else
  base=main
fi

state=existing
if [ -e "$worktree" ]; then
  # It must be a worktree of this repository, on the lane's branch.
  if ! git -C "$main" worktree list --porcelain | grep -qx "worktree $worktree"; then
    die "refusing: $worktree exists but is not a worktree of $main"
  fi
  on=$(git -C "$worktree" symbolic-ref --quiet --short HEAD || true)
  [ "$on" = "$branch" ] || die "refusing: $worktree is on '${on:-a detached HEAD}', not $branch"
else
  git -C "$main" rev-parse --verify --quiet "$base^{commit}" >/dev/null || die "base '$base' is not a commit"
  if git -C "$main" rev-parse --verify --quiet "refs/heads/$branch" >/dev/null; then
    git -C "$main" worktree add --quiet "$worktree" "$branch" >&2
    note "added $worktree on the existing branch $branch"
  else
    git -C "$main" worktree add --quiet -b "$branch" "$worktree" "$base" >&2
    note "added $worktree on a new branch $branch from $base"
  fi
  state=created
fi

# Setup, each piece only when missing.
if [ -d "$main/node_modules" ] && [ ! -e "$worktree/node_modules" ]; then
  ln -s "../$name/node_modules" "$worktree/node_modules"
  note "linked node_modules"
fi
for env in "$main"/.env*; do
  [ -f "$env" ] || continue
  file=$(basename "$env")
  [ -e "$worktree/$file" ] && continue
  if git -C "$main" ls-files --error-unmatch -- "$file" >/dev/null 2>&1; then continue; fi
  cp "$env" "$worktree/$file"
  note "copied $file"
done
for rel in apps/android/local.properties; do
  if [ -f "$main/$rel" ] && [ ! -e "$worktree/$rel" ]; then
    mkdir -p "$(dirname "$worktree/$rel")"
    cp "$main/$rel" "$worktree/$rel"
    note "copied $rel"
  fi
done
# The screenshots' baseline is this machine's and git-ignored (scripts/visual/util.ts: <checkout>/visual):
# a lane links the main checkout's, so a slice compares against the real baseline and its run lands
# beside the others (never `accept` from a lane — that is the owner's OK).
if [ -d "$main/visual" ] && [ ! -e "$worktree/visual" ]; then
  ln -s "../$name/visual" "$worktree/visual"
  note "linked visual (the baseline and runs)"
fi
# .gitignore's `/visual/` matches the folder, not a link to it; until it says `/visual`, the repository's
# shared exclude file keeps the link out of `git status` (it changes nothing for the main checkout's folder).
if [ -L "$worktree/visual" ] && git -C "$worktree" check-ignore -q visual 2>/dev/null; then :; elif [ -L "$worktree/visual" ]; then
  exclude="$(git -C "$main" rev-parse --path-format=absolute --git-common-dir)/info/exclude"
  mkdir -p "$(dirname "$exclude")"
  printf '%s\n%s\n' "# scripts/lane.sh: lanes link the main checkout's screenshots folder" '/visual' >> "$exclude"
  note "added /visual to $exclude"
fi
for rel in native/editor/dist native/mascots/dist; do
  if [ -d "$main/$rel" ] && [ ! -e "$worktree/$rel" ]; then
    mkdir -p "$(dirname "$worktree/$rel")"
    cp -R "$main/$rel" "$worktree/$rel"
    note "copied $rel"
  fi
done

slot=$(( (round % 16) * 6 + idx ))
auth=$((9400 + slot))
firestore=$((8400 + slot))
dev=$((3400 + slot))

for port in $auth $firestore $dev; do
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    note "port $port is already listening (yours from an earlier run? stop only what you started, by PID)"
  fi
done

out() { printf "%s='%s'\n" "$1" "$2"; }
out LANE_ROUND "$round"
out LANE "$lane"
out LANE_BRANCH "$branch"
out LANE_BASE "$base"
out LANE_WORKTREE "$worktree"
out LANE_MAIN "$main"
out LANE_STATE "$state"
out LANE_AUTH_PORT "$auth"
out LANE_FIRESTORE_PORT "$firestore"
out LANE_DEV_PORT "$dev"
out LANE_EMULATOR_ENV "EMULATOR_AUTH_PORT=$auth EMULATOR_FIRESTORE_PORT=$firestore"
out LANE_VISUAL_ENV "VISUAL_AUTH_PORT=$auth VISUAL_FIRESTORE_PORT=$firestore VISUAL_DEV_PORT=$dev"
case $lane in
  android) out LANE_AVD_PORT "$((5620 + 2 * (round % 16)))" ;;
  ios | mac) out LANE_SIMULATOR "r$round ios iPhone 17 Pro" ;;
esac

case $lane in
  ios | mac) note "next: cd $worktree && npm run apps:generate && (cd apps/ios && xcodegen generate)" ;;
  android | web | server | base) note "next: cd $worktree && npm run apps:generate   # when native/*/dist is missing or strings, icons or tokens change" ;;
esac
