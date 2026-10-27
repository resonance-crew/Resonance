import importlib.util,os,json,subprocess,sys
d=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec=importlib.util.spec_from_file_location('harness',os.path.join(d,'work','harness.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
g=h.g
ca=g.crest_at
arms=dict(l=(38,-92,0), r=(-135,-18,-8))
frames=[
 ('F r0=80', dict(head=(400,336,-7), crest=ca((-12,-100),-22,80,95,34,facets=5,seed=7,ramp=(0.85,1.0)), arms=arms)),
 ('G r0=95', dict(head=(400,336,-7), crest=ca((-12,-100),-24,95,100,30,facets=5,seed=7,ramp=(0.9,1.0)), arms=arms)),
 ('H r0=70 lean-28', dict(head=(400,336,-7), crest=ca((-15,-98),-28,70,100,40,facets=5,seed=7,ramp=(0.8,1.0)), arms=arms)),
 ('I r0=90 lean+22', dict(head=(400,336,-7), crest=ca((5,-100),22,90,100,32,facets=5,seed=7,ramp=(0.85,1.0)), arms=arms)),
]
h.sheet(frames, os.path.join(d,'work','e3.svg'), 260)
h.sheet(frames, os.path.join(d,'work','e3s.svg'), 260, sil=True)
h.sheet(frames, os.path.join(d,'work','e3m.svg'), 60, sil=True)
