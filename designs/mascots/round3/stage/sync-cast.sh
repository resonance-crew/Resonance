#!/bin/bash
# sync-cast.sh — copies each drawn character's exported parts (../<slug>/parts, from kit/export-parts.mjs) into
# cast/<slug>/, then regenerates cast.js from whatever cast/ holds and rebuilds stage.bundle.js (node build.mjs, which
# also measures each torso's pointer shape and reveal point into the manifests).
# A character whose parts aren't exported yet is skipped; placeholders fill in while fewer than two are drawn.
# Runs under bash or zsh: `bash sync-cast.sh` or `./sync-cast.sh`.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
R3="$(dirname "$HERE")"
for slug in tuck tag card dot night; do
  src="$R3/$slug/parts"
  if [ ! -f "$src/manifest.json" ]; then echo "· $slug: no parts yet"; continue; fi
  rm -rf "$HERE/cast/$slug" && mkdir -p "$HERE/cast/$slug"
  cp "$src/manifest.json" "$HERE/cast/$slug/"
  # only the images the manifest names (not rest.png / recomposed.png / _raw)
  for img in $(node -e "for (const p of require('$src/manifest.json').parts) if (p.w) console.log(p.img)"); do
    cp "$src/$img" "$HERE/cast/$slug/"
  done
  echo "✓ $slug"
done
node "$HERE/build.mjs"
