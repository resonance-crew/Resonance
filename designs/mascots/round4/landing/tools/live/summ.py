#!/usr/bin/env python3
# summ.py [dirs...] — the watch reports, one block each
import json, sys, os, glob
root = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/r4/live'
dirs = sys.argv[1:] or sorted(d for d in glob.glob(root + '/*x*') if os.path.exists(d + '/report.json'))
for d in dirs:
    r = json.load(open(os.path.join(d, 'report.json') if os.path.isdir(d) else d))
    print('=' * 100)
    print(r['tag'], '| preset', r.get('preset'), '| stage ready', r.get('stageReadyMs'), 'ms | qr', r.get('qrShown'), '| hdr', r.get('header'), '|', r.get('stageClass'))
    if r.get('fatal'): print('FATAL', r['fatal'][:400])
    rf = r.get('realFirst')
    if rf:
        print(' real first screen: first visitor %ss (in view %ss @%s) | samples %d: 0/1/2 in view %d/%d/%d | under %d | stolen %d/%d %s | overflow %d' % (
            rf['firstVisitorFromNavS'], rf['firstInViewFromNavS'], rf['firstWhere'], rf['samples'], rf['framesWith0'], rf['framesWith1'], rf['framesWith2'], rf['under'], rf['stolen'], rf['probes'], rf['where'], rf['widthOverflow']))
        print('   seen:', '; '.join(rf['visitorsSeen']))
    print('   events:', ' | '.join(r.get('realEvents', [])[:40]))
    if r.get('realScroll'):
        print(' scroll:', ' '.join('%d:%s%s%s' % (s['y'], ','.join(s['inView']) or '-', ' UNDER' if s['under'] else '', ' STOLEN' if s['stolen'] else '') for s in r['realScroll']['steps']))
    for s in r.get('sim', []):
        print(' sim %-6s y=%-5s occ0/1/2=%s acting=%s overlap=%d under=%d stolen=%d/%d sw=%d enters=%d first=%s meets=%d greets=%d first m/g=%s' % (
            s['pos'], s['scroll'], s['occPct'], s['acting'], s['overlap'], s['under'], s['stolen'], s['probes'], s['sw'], s['enters'], s['firstEnter'], s['meets'], s['greets'], s['firstMeetOrGreet']))
        print('     hows', s['hows'], 'acts', s['acts'])
        print('     sizes', s['sizes'], '| ledges', ' '.join(sorted(s['ledges'])))
        if s['where']: print('     STOLEN at', s['where'])
        for h in s['textHits'][:8]: print('     TEXT', h['sec'], h['vs'], [(x['label'], x['px']) for x in h['hits']])
        if len(s['textHits']) > 8: print('     … %d more text-hit frames' % (len(s['textHits']) - 8))
        for h in s['ctrlHits'][:8]: print('     CTRL', h['sec'], h['vs'], [(x['label'], x['px']) for x in h['hits']])
        if len(s['ctrlHits']) > 8: print('     … %d more ctrl-hit frames' % (len(s['ctrlHits']) - 8))
    if r.get('reducedTop'): print(' reduced top', r['reducedTop'])
    for s in r.get('reducedScroll', []): print(' reduced @%s n=%d still=%s %s' % (s['at'], s['n'], s['still'], [(v['slug'], v['ledge'], v['mode'], v['inView']) for v in s['vs']]))
    if r.get('errors'): print(' ERRORS', r['errors'][:6])
