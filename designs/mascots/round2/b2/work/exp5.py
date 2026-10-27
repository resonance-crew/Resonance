import importlib.util,os,json,subprocess,sys
d=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec=importlib.util.spec_from_file_location('harness',os.path.join(d,'work','harness.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
g=h.g
ca=g.crest_at
arms=dict(l=(38,-92,0), r=(-135,-18,-8))
frames=[
 ('M', dict(head=(400,340,-7), crest=ca((-10,-100),-22,110,115,30,facets=5,seed=7,ramp=(0.8,1.0),dip=0.04), arms=arms)),
 ('N lean-30 head-3', dict(head=(400,340,-3), crest=ca((-28,-98),-30,95,118,30,facets=5,seed=7,ramp=(1.0,0.75),dip=0.04), arms=arms)),
]
h.sheet(frames, os.path.join(d,'work','e5.svg'), 600)
h.sheet(frames, os.path.join(d,'work','e5s.svg'), 200, sil=True)
h.sheet(frames, os.path.join(d,'work','e5m.svg'), 64, sil=True)
