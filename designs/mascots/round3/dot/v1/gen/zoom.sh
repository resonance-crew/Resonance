#!/bin/zsh
# zoom.sh <in.svg> <out.png> <x> <y> <w> <h> <pxW> [bg]: renders a viewBox window of an svg at pxW wide
IN=$1; OUT=$2; X=$3; Y=$4; W=$5; H=$6; PW=$7; BG=${8:-#f8f2ea}
PH=$(( PW * H / W ))
TMP=${OUT:r}.zoom.svg
node -e '
const fs=require("fs"); let s=fs.readFileSync(process.argv[1],"utf8");
s=s.replace(/<svg([^>]*)>/, (m,a)=>"<svg"+a.replace(/viewBox="[^"]+"/, `viewBox="${process.argv[3]}"`).replace(/ width="\d+"/,"").replace(/ height="\d+"/,"")+">");
fs.writeFileSync(process.argv[2], s);' $IN $TMP "$X $Y $W $H"
print -r -- "<!doctype html><html><head><meta charset=utf-8><style>html,body{margin:0;background:$BG}svg{display:block;width:${PW}px;height:${PH}px}</style></head><body>$(cat $TMP)</body></html>" > ${TMP:r}.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --screenshot=${OUT:A} --window-size=$PW,$PH --virtual-time-budget=3000 "file://${TMP:A:r}.html" >/dev/null 2>&1
rm -f $TMP ${TMP:r}.html
