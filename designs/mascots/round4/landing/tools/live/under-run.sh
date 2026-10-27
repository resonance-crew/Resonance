#!/bin/sh
cd "$(dirname "$0")"
for a in "768 1024 2813" "768 1024 2900" "1024 768 bottom" "1024 768 2600" "834 1194 bottom" "390 844 bottom" "1440 900 bottom" "1440 900 2356" "360 740 bottom"; do
  set -- $a
  echo "== $a" >> under.log
  node under.mjs $1 $2 $3 150 3 | python3 -c "import sys,json; d=json.load(sys.stdin); [print(x if x.get('none') else {'n':len(x['hits']),'first':x['hits'][:3]}) for x in d]" >> under.log 2>&1
done
echo UNDERDONE >> under.log
