import importlib.util,os,json,subprocess,sys
d=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec=importlib.util.spec_from_file_location('harness',os.path.join(d,'work','harness.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
g=h.g
ca=g.crest_at
frames=[
 ('P roll centre 34', dict(crest=ca((-28,-98),-27,95,118,30,facets=5,seed=7,ramp=(1.0,0.75),dip=0.04,roll=34))),
 ('Q roll out (wave)', dict(crest=ca((-24,-98),-27,95,118,30,roll_out=True,facets=5,seed=7,ramp=(0.7,1.0),dip=0.04,roll=36))),
]
h.sheet(frames, os.path.join(d,'work','e6.svg'), 600)
h.sheet(frames, os.path.join(d,'work','e6s.svg'), 200, sil=True)
