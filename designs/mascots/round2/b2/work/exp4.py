import importlib.util,os,json,subprocess,sys
d=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec=importlib.util.spec_from_file_location('harness',os.path.join(d,'work','harness.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
g=h.g
ca=g.crest_at
arms=dict(l=(38,-92,0), r=(-135,-18,-8))
frames=[
 ('J big lean-20', dict(head=(400,340,-7), crest=ca((-8,-100),-20,80,122,36,facets=5,seed=7,ramp=(0.85,1.0)), arms=arms)),
 ('K big lean-26 dip', dict(head=(400,340,-7), crest=ca((-12,-100),-26,80,122,36,facets=5,seed=7,ramp=(0.9,1.0),dip=0.045), arms=arms)),
 ('L big lean+18', dict(head=(400,340,-7), crest=ca((5,-100),18,80,122,36,facets=5,seed=7,ramp=(0.85,1.0)), arms=arms)),
 ('M r0=110 lean-22', dict(head=(400,340,-7), crest=ca((-10,-100),-22,110,115,30,facets=5,seed=7,ramp=(0.8,1.0),dip=0.04), arms=arms)),
]
h.sheet(frames, os.path.join(d,'work','e4.svg'), 300)
h.sheet(frames, os.path.join(d,'work','e4s.svg'), 300, sil=True)
h.sheet(frames, os.path.join(d,'work','e4m.svg'), 64, sil=True)
