import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import pathlib
HERE=pathlib.Path(__file__).resolve().parent
OUT=str(HERE.parent/'logo')
font=TTFont(str(HERE/'Inter-SemiBold.ttf'))  # Inter 4.1 SemiBold, from https://github.com/rsms/inter/releases
gs=font.getGlyphSet(); cmap=font.getBestCmap(); upm=font['head'].unitsPerEm
SIZE=40; TRACK=-0.012  # em
def run(text,x0,baseline):
    pen=SVGPathPen(gs); x=x0; s=SIZE/upm
    for ch in text:
        g=cmap[ord(ch)]
        tp=TransformPen(pen,(s,0,0,-s,x,baseline))
        gs[g].draw(tp)
        x+=gs[g].width*s+TRACK*SIZE
    return pen.getCommands(), x
INK={'light':('#191A1E','#F9F9FA','#7A7D86'),'dark':('#F4F5F6','#141518','#8B8E97')}
def mark(fg,cut,x=0,y=0,s=1,mono=False):
    op='' if mono else ' opacity=".55"'
    return (f'<g transform="translate({x} {y}) scale({s})"><rect width="64" height="64" rx="15" fill="{fg}"/>'
            f'<circle cx="32" cy="24" r="8" fill="{cut}"/><rect x="16" y="37" width="32" height="7" rx="3.5" fill="{cut}"/>'
            f'<rect x="22" y="47" width="20" height="5" rx="2.5" fill="{cut}"{op}/></g>')
def w(name,svg): open(os.path.join(OUT,name),'w').write(svg+'\n')
for th,(fg,cut,mute) in INK.items():
    w(f'mark-{th}.svg',f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><title>Recruited</title>{mark(fg,cut)}</svg>')
    # lockup: mark 48px, gap 14, text 40px; cap height alignment
    ms=48/64; base=37
    p1,x=run('recruited',62,base); p2,x2=run('.tools',x,base)
    W=round(x2+2)
    w(f'lockup-{th}.svg',f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} 48" width="{W}" height="48"><title>recruited.tools</title>{mark(fg,cut,0,0,ms)}<path fill="{fg}" d="{p1}"/><path fill="{mute}" d="{p2}"/></svg>')
    p1,x=run('recruited',0,base); p2,x2=run('.tools',x,base)
    W=round(x2+2)
    w(f'wordmark-{th}.svg',f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} 48" width="{W}" height="48"><title>recruited.tools</title><path fill="{fg}" d="{p1}"/><path fill="{mute}" d="{p2}"/></svg>')
# mono (single colour, for embossing, one-ink print, favicons in currentColor)
w('mark-mono.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><title>Recruited</title><path fill="currentColor" fill-rule="evenodd" d="M15 0h34a15 15 0 0 1 15 15v34a15 15 0 0 1-15 15H15A15 15 0 0 1 0 49V15A15 15 0 0 1 15 0Z M32 16a8 8 0 1 0 0 16a8 8 0 1 0 0-16Z M19.5 37h25a3.5 3.5 0 0 1 0 7h-25a3.5 3.5 0 0 1 0-7Z M24.5 47h15a2.5 2.5 0 0 1 0 5h-15a2.5 2.5 0 0 1 0-5Z"/></svg>')
# favicon: adapts to OS theme
w('favicon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>.t{fill:#191A1E}.c{fill:#F9F9FA}@media (prefers-color-scheme:dark){.t{fill:#F4F5F6}.c{fill:#141518}}</style><rect class="t" width="64" height="64" rx="15"/><circle class="c" cx="32" cy="24" r="8"/><rect class="c" x="16" y="37" width="32" height="7" rx="3.5"/><rect class="c" x="22" y="47" width="20" height="5" rx="2.5" opacity=".55"/></svg>')
# sibling sheet: Hired + Recruited side by side
hired='<rect width="64" height="64" rx="15" fill="#191A1E"/><rect x="16" y="17" width="13" height="7" rx="1.5" fill="#F9F9FA"/><rect x="16" y="28.5" width="22.5" height="7" rx="1.5" fill="#F9F9FA"/><rect x="16" y="40" width="32" height="7" rx="1.5" fill="#F9F9FA"/>'
w('family.svg',f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 176 64" width="176" height="64"><title>Hired and Recruited</title><g>{hired}</g>{mark("#191A1E","#F9F9FA",112,0)}</svg>')
print(os.listdir(OUT))
