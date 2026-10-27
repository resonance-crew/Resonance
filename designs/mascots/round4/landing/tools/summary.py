import json,glob,sys,os
os.chdir(sys.argv[1])
for f in sorted(glob.glob('*.json'), key=lambda f: (-int(f.split('x')[0]), f)):
    d=json.load(open(f))
    rt=d['realtime']
    print(f"== {d['tag']} {d['preset']} | stage {d['stageAfterLoadMs']}ms after navigation, first visitor {rt['firstVisitorS']}s ({rt['firstInView']}) | under {rt['under']}/{rt['samples']} | stolen {rt['stolen']}/{rt['probes']} {rt['where'] or ''} | overflow {rt['widthOverflow']} | max chars {rt['maxChars']} | sizes {rt['sizes']} | stage '{d['dim']}' | errors {d['errors']}")
    print('   real events:', ' '.join(d['realEvents'])[:300])
    for s in d['sim']:
        print(f"   sim y={s['scroll']} (vp {s.get('vpY','?')}): overlap {s['overlap']} stolen {s['stolen']}/{s['probes']} underBox {s['under']} underBar {s.get('underBar',0)} meets {s['meets']} greets {s['greets']} first {s['firstMeetOrGreet']} acting {s['acting']} ledges {s['ledges']} {s['where'] or ''}")
