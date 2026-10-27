#!/bin/zsh
# gen/render.sh — renders concept.png and the check sheets (run after node gen/build.mjs).
set -e
cd ${0:A:h}/..
R=../../render.sh
$R concept.svg concept.png 1600 1000
$R checks/sizes.svg checks/sizes.png 1500 560
$R checks/measures.svg checks/measures.png 1100 720
$R checks/thumb.svg checks/thumb.png 760 300
$R checks/before-after.svg checks/before-after.png 1900 980
$R checks/review-before-after.svg checks/review-before-after.png 1600 1000
