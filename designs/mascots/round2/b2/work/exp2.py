import importlib.util,os,json,subprocess,sys
d=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec=importlib.util.spec_from_file_location('harness',os.path.join(d,'work','harness.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
g=h.g
ca=g.crest_at
arms=dict(l=(38,-92,0), r=(-135,-18,-8))
frames=[
 ('A', dict(head=(400,336,-7), crest=ca((-10,-102),-22,150,84,24,facets=4,seed=7), arms=arms)),
 ('B', dict(head=(400,336,-7), crest=ca((-20,-102),-25,150,100,26,facets=4,seed=7,ramp=(1.0,0.45)), arms=arms)),
 ('C', dict(head=(400,336,-7), crest=ca((-5,-102),-25,150,100,26,facets=4,seed=7,ramp=(0.5,1.0)), arms=arms)),
 ('D', dict(head=(400,336,-7), crest=ca((-5,-100),-20,130,64,36,facets=6,seed=7,ramp=(0.8,1.0)), arms=arms)),
 ('E', dict(head=(400,336,-7), crest=ca((10,-100),22,150,100,26,facets=4,seed=7,ramp=(1.0,0.45)), arms=arms)),
]
h.sheet(frames, os.path.join(d,'work','e2.svg'), 260)
h.sheet(frames, os.path.join(d,'work','e2s.svg'), 260, sil=True)
h.sheet(frames, os.path.join(d,'work','e2m.svg'), 60, sil=True)
