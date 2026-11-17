import json
import pathlib
HERE=pathlib.Path(__file__).resolve().parent
p=json.load(open(HERE/'pal.json')); D=str(HERE.parent/'tokens')+'/'
type_={'font-sans':'"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif','font-mono':'"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
 'text-xs':'12px','text-sm':'13px','text-base':'14px','text-md':'16px','text-lg':'20px','text-xl':'28px','text-2xl':'40px','text-display':'64px',
 'tracking-display':'-0.035em','tracking-heading':'-0.02em','tracking-eyebrow':'0.06em','radius-sm':'6px','radius':'10px','radius-lg':'16px','radius-mark':'23.4%'}
groups=[('Surfaces and ink',['background','surface','subtle','border','foreground','muted','faint']),
 ('The one accent: links, primary buttons, selection, focus',['primary','primary-tint']),
 ('Candidate tier. Data only, never decoration',['tier-a','tier-b','tier-c']),
 ('Answer provenance: how a screening answer reached the form',['typed','pasted','ai']),
 ('Status',['destructive','success','warning'])]
def block(th,sel):
    s=[f'{sel} {{']
    for title,keys in groups:
        s.append(f'  /* {title} */')
        for k in keys:
            v=p[th][k]; s.append(f'  --rt-{k}: {v["hex"]};'); s.append(f'  --rt-{k}: {v["oklch"]};')
    if th=='light':
        s.append('  /* Type, radius */')
        for k,v in type_.items(): s.append(f'  --rt-{k}: {v};')
    s.append('}'); return '\n'.join(s)
css=['/* recruited.tools design tokens, v1 (2026-11-17)\n   Every colour is written twice: hex for anything that cannot read OKLCH, then\n   OKLCH, which wins wherever it is understood. Light is the default; dark applies\n   with prefers-color-scheme unless the page pins data-theme="light", and always\n   under data-theme="dark". Prefix rt- so these never collide with shadcn names;\n   map them onto --primary etc. in the app\'s own globals.css. */',
 block('light',':root'),'',
 '@media (prefers-color-scheme: dark) {\n'+block('dark',':root:not([data-theme="light"])').replace('\n','\n  ').replace(':root',' :root',1)+'\n}','',block('dark',':root[data-theme="dark"]'),'']
open(D+'tokens.css','w').write('\n'.join(css))
out={'name':'recruited.tools','version':'1.0.0','color':{th:{k:v for k,v in p[th].items()} for th in p},'type':type_,
 'mark':{'viewBox':'0 0 64 64','tile':{'rx':15},'head':{'cx':32,'cy':24,'r':8},'shoulders':{'x':16,'y':37,'w':32,'h':7,'rx':3.5},'line':{'x':22,'y':47,'w':20,'h':5,'rx':2.5,'opacity':0.55}}}
json.dump(out,open(D+'tokens.json','w'),indent=2)
tw="""/** Tailwind v4: @import "./tokens.css"; then paste this @theme block into globals.css. */
@theme inline {
"""+''.join(f'  --color-rt-{k}: var(--rt-{k});\n' for _,ks in groups for k in ks)+"""  --font-sans: var(--rt-font-sans);
  --font-mono: var(--rt-font-mono);
}
"""
open(D+'tailwind-theme.css','w').write(tw)
