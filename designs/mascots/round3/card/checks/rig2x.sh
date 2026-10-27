#!/bin/zsh
# rig2x.sh: rebuild, render the rig at 2x (checks/rig-2x.png) and a crop of the figure (checks/rig-2x-crop.png)
cd ${0:A:h:h}
node gen/build.mjs >/dev/null
W=checks/rig2x.html
print -r -- "<!doctype html><html><head><meta charset=utf-8><style>html,body{margin:0;background:#f8f2ea}svg{display:block;width:1400px;height:1520px}</style></head><body>$(cat rig.svg)</body></html>" > $W
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --screenshot=${PWD}/checks/rig-2x.png --window-size=1400,1520 --virtual-time-budget=3000 "file://${PWD}/$W" >/dev/null 2>&1
rm -f $W
python3 -c "from PIL import Image; Image.open('checks/rig-2x.png').crop((160,600,1240,1440)).save('checks/rig-2x-crop.png')"
echo ok
