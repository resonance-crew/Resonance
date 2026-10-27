#!/bin/zsh
# render.sh <in.svg|in.html> <out.png> [width=1600] [height=1000]
# Renders an SVG or HTML file to a PNG with headless Chrome (SVG filters render as in the browser).
set -e
IN=${1:A}; OUT=${2:A}; W=${3:-1600}; H=${4:-1000}
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [[ $IN == *.svg ]]; then
  TMP=${OUT:r}.render.html
  print -r -- "<!doctype html><html><head><meta charset=utf-8><style>html,body{margin:0;padding:0;background:#f8f2ea}svg{display:block;width:${W}px;height:${H}px}</style></head><body>$(cat $IN)</body></html>" > $TMP
  IN=$TMP
fi
"$C" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --screenshot=$OUT --window-size=$W,$H --virtual-time-budget=3000 "file://$IN" >/dev/null 2>&1
[[ -n $TMP ]] && rm -f $TMP
echo "rendered $OUT"
