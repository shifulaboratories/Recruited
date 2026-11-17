import math,json,sys
def oklch(L,C,h):
    a=C*math.cos(math.radians(h)); b=C*math.sin(math.radians(h))
    l_=L+0.3963377774*a+0.2158037573*b; m_=L-0.1055613458*a-0.0638541728*b; s_=L-0.0894841775*a-1.2914855480*b
    l,m,s=l_**3,m_**3,s_**3
    r=4.0767416621*l-3.3077115913*m+0.2309699292*s; g=-1.2684380046*l+2.6097574011*m-0.3413193965*s; bb=-0.0041960863*l-0.7034186147*m+1.7076147010*s
    def f(x):
        x=max(0,min(1,x)); return round(255*(12.92*x if x<=0.0031308 else 1.055*x**(1/2.4)-0.055))
    return '#%02X%02X%02X'%(f(r),f(g),f(bb))
def lum(hx):
    c=[int(hx[i:i+2],16)/255 for i in (1,3,5)]
    c=[x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def cr(a,b):
    A,B=sorted([lum(a),lum(b)],reverse=True); return round((A+0.05)/(B+0.05),2)
P={
 'light':{'background':(0.985,0.002,265),'surface':(1,0,0),'foreground':(0.21,0.007,265),'muted':(0.505,0.008,265),'faint':(0.553,0.008,265),'border':(0.905,0.003,265),'subtle':(0.962,0.002,265),
  'primary':(0.535,0.15,240),'primary-tint':(0.955,0.022,240),'tier-a':(0.56,0.14,152),'tier-b':(0.535,0.15,240),'tier-c':(0.72,0.01,265),
  'typed':(0.21,0.007,265),'pasted':(0.6,0.14,62),'ai':(0.55,0.18,295),'destructive':(0.58,0.21,25),'success':(0.56,0.14,152),'warning':(0.72,0.14,70)},
 'dark':{'background':(0.17,0.006,265),'surface':(0.215,0.007,265),'foreground':(0.965,0.002,265),'muted':(0.68,0.008,265),'faint':(0.6,0.008,265),'border':(0.3,0.007,265),'subtle':(0.25,0.007,265),
  'primary':(0.7,0.13,237),'primary-tint':(0.7,0.13,237,0.17),'tier-a':(0.72,0.15,152),'tier-b':(0.7,0.13,237),'tier-c':(0.5,0.01,265),
  'typed':(0.965,0.002,265),'pasted':(0.78,0.13,70),'ai':(0.7,0.15,295),'destructive':(0.66,0.19,25),'success':(0.72,0.15,152),'warning':(0.8,0.14,75)}}
out={}
for th,d in P.items():
    out[th]={}
    for k,v in d.items():
        hx=oklch(*v[:3]); out[th][k]={'oklch':'oklch(%s %s %s%s)'%(v[0],v[1],v[2],(' / %s'%v[3]) if len(v)>3 else ''),'hex':hx}
for th in out:
    bg=out[th]['background']['hex']; sf=out[th]['surface']['hex']
    print(th,{k:(v['hex'],cr(v['hex'],bg),cr(v['hex'],sf)) for k,v in out[th].items()})
json.dump(out,open(str(__import__('pathlib').Path(__file__).resolve().parent/'pal.json'),'w'),indent=1)
