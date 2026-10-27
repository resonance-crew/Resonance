import importlib.util,os,json,subprocess,sys
d=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec=importlib.util.spec_from_file_location('harness',os.path.join(d,'work','harness.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
g=h.g
ca=g.crest_at
frames=[
 ('L-22 tilt-9', dict(head=(400,336,-9), crest=ca((-10,-104),-22,150,96,22,facets=4,seed=7), arms=dict(l=(38,-92,0), r=(-150,-2,-6)))),
 ('R+20 tilt-9', dict(head=(400,336,-9), crest=ca((-5,-104),20,150,96,22,facets=4,seed=7), arms=dict(l=(38,-92,0), r=(-150,-2,-6)))),
 ('L-25 tilt-6', dict(head=(400,336,-6), crest=ca((-15,-104),-25,170,100,20,facets=4,seed=7), arms=dict(l=(38,-92,0), r=(-150,-2,-6)))),
]
mode=sys.argv[1] if len(sys.argv)>1 else ''
h.sheet(frames, os.path.join(d,'work','e1.svg'), 300)
h.sheet(frames, os.path.join(d,'work','e1s.svg'), 300, sil=True)
h.sheet(frames, os.path.join(d,'work','e1m.svg'), 60, sil=True)
