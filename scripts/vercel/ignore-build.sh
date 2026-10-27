#!/bin/sh
# Vercel's Ignored Build Step (vercel.json `ignoreCommand`): exit 0 skips the
# build, exit 1 builds. A deployment is skipped only when nothing the site is
# built from changed since this branch's last successful deployment: apps/
# (the native apps) and docs/ — except docs/legal, which the privacy, terms
# and support pages read at runtime (next.config.ts outputFileTracingIncludes).
# Every deployment keeps its functions (~110 MB) for the retention period, and
# Hobby's Functions Storage is 10 GB, so app-only commits shouldn't make one.
#
# Diffing against that deployment, not HEAD^, keeps a push whose last commit
# touches only the apps from skipping a web change earlier in the same push.
# Anything uncertain builds: a branch's first deployment (no previous SHA), a
# redeploy of the deployed commit, a previous commit the shallow clone doesn't
# hold, any git error.

prev=$VERCEL_GIT_PREVIOUS_SHA
[ -n "$prev" ] || exit 1
[ "$prev" != "$(git rev-parse HEAD 2>/dev/null)" ] || exit 1
git diff --quiet "$prev" HEAD -- . ':(exclude)apps' ':(exclude)docs' || exit 1
git diff --quiet "$prev" HEAD -- docs/legal || exit 1
echo "Only apps/ or docs/ changed since $prev: skipping the build"
exit 0
