#!/bin/sh
cd "$(dirname "$0")"
xargs -P 3 -L 1 sh -c 'node watch.mjs "$0" "$1" "$2" "$3" "$4" "$5" "$6" "$7" >> run.log 2>&1' < queue.txt
echo DONE >> run.log
