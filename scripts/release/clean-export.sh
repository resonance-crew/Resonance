#!/usr/bin/env bash
# A clean export of one commit to build the store apps from — never the checkout other sessions
# use (docs/release-checklist.md, Builds). Until now a recipe retyped each release:
#
#   git archive <commit>            into <dest>/src (only what the commit holds)
#   node_modules, keys/             linked from the shared checkout (keys/ never copied, never printed)
#   apps/android/local.properties   copied (the SDK's path on this Mac)
#   native/fonts                    copied (git-ignored; the apps' type)
#   npm run native:editor           the editor island   (native/editor/dist, git-ignored)
#   npm run native:mascots          the mascot island   (native/mascots/dist, git-ignored)
#   xcodegen generate               apps/ios/Resonance.xcodeproj (git-ignored)
#
# It builds nothing: the archive and bundle commands are printed at the end, to run from the
# export. Usage:
#
#   scripts/release/clean-export.sh [--commit <rev>] [--dest <dir>] [--from <checkout>]
#                                   [--no-keys] [--skip-generate] [--skip-xcodegen] [--dry-run]
#
#   --commit      what to export (default HEAD)
#   --dest        where (default $TMPDIR/resonance-export-<short sha>; must not exist or be empty)
#   --from        the checkout node_modules, keys/, local.properties and fonts come from
#                 (default: the main checkout of this repository's worktrees)
#   --no-keys     leave keys/ out (an export to run tests in, not to sign)
#   --dry-run     print the plan and touch nothing
set -euo pipefail

commit=HEAD
dest=
from=
keys=1
generate=1
xcodegen=1
dry=0

while [ $# -gt 0 ]; do
  case "$1" in
    --commit) commit=${2:?--commit needs a revision}; shift 2 ;;
    --dest) dest=${2:?--dest needs a directory}; shift 2 ;;
    --from) from=${2:?--from needs a checkout}; shift 2 ;;
    --no-keys) keys=0; shift ;;
    --skip-generate) generate=0; shift ;;
    --skip-xcodegen) xcodegen=0; shift ;;
    --dry-run) dry=1; shift ;;
    -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "clean-export: unknown argument $1 (see --help)" >&2; exit 2 ;;
  esac
done

here=$(cd "$(dirname "$0")/../.." && pwd)
sha=$(git -C "$here" rev-parse --verify "$commit^{commit}") || { echo "clean-export: no commit $commit" >&2; exit 2; }
short=${sha:0:8}
if [ -z "$from" ]; then
  from=$(dirname "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)")
fi
from=$(cd "$from" && pwd)
if [ -z "$dest" ]; then
  tmp=${TMPDIR:-/tmp}
  dest="${tmp%/}/resonance-export-$short"
fi
src="$dest/src"

steps=()
note() { steps+=("$1"); }

note "git archive $short | tar -x -C $src"
[ -d "$from/node_modules" ] && note "ln -s $from/node_modules $src/node_modules" || note "! no $from/node_modules — run npm ci there first"
if [ "$keys" = 1 ]; then
  [ -d "$from/keys" ] && note "ln -s $from/keys $src/keys" || note "! no $from/keys — signing will fail (or pass --no-keys)"
fi
[ -f "$from/apps/android/local.properties" ] && note "cp $from/apps/android/local.properties $src/apps/android/" || note "! no apps/android/local.properties in $from — Gradle won't find the SDK"
[ -d "$from/native/fonts" ] && note "cp -R $from/native/fonts $src/native/fonts"
if [ "$generate" = 1 ]; then
  note "(cd $src && npm run -s native:editor)"
  note "(cd $src && npm run -s native:mascots)"
fi
[ "$xcodegen" = 1 ] && note "(cd $src/apps/ios && xcodegen generate)"

echo "Clean export of $short ($(git -C "$here" log -1 --format=%s "$sha" | cut -c1-72))"
echo "  from $from"
echo "  into $src"
for s in "${steps[@]}"; do echo "  · $s"; done

if [ "$dry" = 1 ]; then
  echo "Dry run: nothing done."
  exit 0
fi

if [ -e "$dest" ] && [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then
  echo "clean-export: $dest exists and is not empty — choose another --dest" >&2
  exit 1
fi
mkdir -p "$src"
git -C "$here" archive "$sha" | tar -x -C "$src"
[ -d "$from/node_modules" ] && ln -s "$from/node_modules" "$src/node_modules"
if [ "$keys" = 1 ] && [ -d "$from/keys" ]; then ln -s "$from/keys" "$src/keys"; fi
[ -f "$from/apps/android/local.properties" ] && cp "$from/apps/android/local.properties" "$src/apps/android/"
if [ -d "$from/native/fonts" ]; then mkdir -p "$src/native" && cp -R "$from/native/fonts" "$src/native/fonts"; fi
if [ "$generate" = 1 ]; then
  (cd "$src" && npm run -s native:editor && npm run -s native:mascots)
fi
if [ "$xcodegen" = 1 ]; then
  command -v xcodegen >/dev/null || { echo "clean-export: xcodegen not found (brew install xcodegen)" >&2; exit 1; }
  (cd "$src/apps/ios" && xcodegen generate --quiet)
fi
echo "$sha" > "$dest/COMMIT"

cat <<NEXT
Export ready: $src (commit in $dest/COMMIT)

Builds, from the export (not run here; dSYM warnings for frameworks are harmless):
  cd $src/apps/ios
  xcodebuild archive -project Resonance.xcodeproj -scheme Resonance -destination 'generic/platform=iOS' \\
    -archivePath ~/Library/Developer/Xcode/Archives/\$(date +%F)/Resonance-<version>-<build>.xcarchive \\
    -allowProvisioningUpdates -skipPackagePluginValidation -skipMacroValidation
  xcodebuild archive … -destination 'generic/platform=macOS,variant=Mac Catalyst' …   (the Mac: same target, same build number)
  cd $src/apps/android && ./gradlew bundleRelease   (JBR 21; signed from keys/)
Uploading is another step, and only on the owner's explicit yes (docs/release-checklist.md §5).
NEXT
