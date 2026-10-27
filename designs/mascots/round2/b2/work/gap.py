import importlib.util,os,math,sys
d=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec=importlib.util.spec_from_file_location('gen',os.path.join(d,'gen.py'));g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
def head_poly(head):
    hx,hy,hr=head
    pts=g.cr_sample(g.head_pts(*g.HEAD_R,77),per=6)
    return [(hx+g.rot(x,y,hr)[0], hy+g.rot(x,y,hr)[1]) for x,y in pts]
def arm_poly(side,ang):
    sx,sy=g.SHOULDER[side]; a1,a2,a3=ang
    out=[]
    for x,y in g.cr_sample(g.seg_pts(g.ARM['U'],*g.ARM['w'][:2]),per=3):
        q=g.rot(x,y,a1); out.append((sx+q[0],sy+q[1]))
    (ex,ey),(wx,wy),(mx,my)=g.arm_place(side,ang)
    for x,y in g.cr_sample(g.seg_pts(g.ARM['F'],*g.ARM['w'][2:]),per=3):
        q=g.rot(x,y,a1+a2); out.append((ex+q[0],ey+q[1]))
    for k in range(36):
        t=2*math.pi*k/36; out.append((mx+g.ARM['mr']*math.cos(t), my+g.ARM['mr']*math.sin(t)))
    return out,(mx,my)
def report(head,ang,ylim=400):
    H=head_poly(head); A,(mx,my)=arm_poly('r',ang)
    hp=[p for p in H]
    best=1e9
    for (x,y) in A:
        if y>ylim: continue
        if g.inside(hp,x,y): continue
        dd=min(math.hypot(x-a,y-b) for a,b in hp)
        best=min(best,dd)
    top=min(y for x,y in H)
    print(f'head {head} arm {ang}: min gap above y={ylim}: {best:.1f}; mitten centre ({mx:.0f},{my:.0f}) top {my-g.ARM["mr"]:.0f}; head top {top:.0f}')
if __name__=='__main__':
    for head in [(400,336,-5),(400,336,-9),(400,336,-12)]:
        for ang in [(-145,-2,-8),(-150,-2,-6),(-150,4,-6),(-155,0,-6)]:
            report(head,ang,int(sys.argv[1]) if len(sys.argv)>1 else 380)

def profile(head,ang,ys=(250,270,290,310,330,350,370)):
    H=head_poly(head); A,(mx,my)=arm_poly('r',ang)
    def xr(poly,y):
        xs=[]
        n=len(poly)
        for i in range(n):
            (x1,y1),(x2,y2)=poly[i],poly[(i+1)%n]
            if (y1-y)*(y2-y)<=0 and y1!=y2:
                xs.append(x1+(x2-x1)*(y-y1)/(y2-y1))
        return xs
    out=[]
    for y in ys:
        hx=xr(H,y); ax=xr(A,y)
        if not hx or not ax: out.append(f'{y}:-'); continue
        out.append(f'{y}:{min(ax)-max(hx):.0f}')
    print(head,ang,' '.join(out), f'mitten top {my-g.ARM["mr"]:.0f}')
