#!/usr/bin/env python3
"""Rebuild index.html and README.md from sites.json (list of [slug, title, tier, industry, description, why, design]).
Covers use screenshots/mockup-laptop.jpg and mockup-phone.jpg (real device photos with the live site placed on screen)."""
import json, html, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(os.path.join(ROOT, 'sites.json')))
ORDER = {"High-end 3D": 0, "Medium": 1, "Simple": 2}
S.sort(key=lambda r: (ORDER.get(r[2], 9), r[3]))
GROUPS = {
 'home': ('Home services', {'HVAC','Plumbing','Home services','Home cleaning','Landscaping','Solar','Security','Auto repair','Automotive'}),
 'health': ('Health & beauty', {'Dental','Med spa','Physical therapy','Veterinary','Salon & spa','Beauty','Fitness'}),
 'food': ('Food & travel', {'Restaurant','Food & drink','Hospitality','Travel'}),
 'pro': ('Professional', {'Accounting','Legal','Insurance','Real estate','Architecture','Logistics'}),
 'shops': ('Shops & brands', {'Fashion','Jewelry','Photography','Beauty','Furniture'}),
}
FEATURED = ['detailing-studio-3d','upholstery-3d','freight-globe-3d','ring-builder-3d']
e = html.escape
def groups(r):
    g = [k for k,(_,inds) in GROUPS.items() if r[3] in inds]
    if r[2] == 'High-end 3D': g.append('3d')
    return ' '.join(g)
def img(s, kind): return f"sites/{s}/screenshots/mockup-{kind}.jpg"
cards = "\n".join(f'''<article class="card" data-groups="{groups(r)}">
  <a class="cover" href="sites/{r[0]}/" aria-label="Open {e(r[1])}"><img class="l" src="{img(r[0],'laptop')}" alt="{e(r[1])} shown on a laptop" loading="lazy" width="1100" height="688"><img class="p" src="{img(r[0],'phone')}" alt="" loading="lazy"></a>
  <div class="body"><div class="meta"><span>{e(r[3])}</span><span class="tier">{e(r[2])}</span></div>
  <h3><a href="sites/{r[0]}/">{e(r[1])}</a></h3>
  <p>{e(r[4])}</p>
  <div class="links"><a href="sites/{r[0]}/">Open live site</a><a href="https://github.com/calvyrn/portfolio/tree/main/sites/{r[0]}">Code</a></div></div>
</article>''' for r in S)
byslug = {r[0]: r for r in S}
feat = "\n".join(f'''<article class="feat">
  <div class="fmedia"><a class="lap" href="sites/{s}/" style="display:block"><img src="{img(s,'laptop')}" alt="{e(byslug[s][1])} on a laptop" loading="lazy"></a><div class="ph"><img src="{img(s,'phone')}" alt="{e(byslug[s][1])} on a phone" loading="lazy"></div></div>
  <div><span class="kick">{e(byslug[s][3])} · {e(byslug[s][2])}</span><h3>{e(byslug[s][1])}</h3><p>{e(byslug[s][4])}</p><p class="why">{e(byslug[s][5])}</p>
  <div class="acts" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><a class="btn" href="sites/{s}/">Open live site</a><a class="btn line" href="https://github.com/calvyrn/portfolio/tree/main/sites/{s}">Case notes &amp; code</a></div></div>
</article>''' for s in FEATURED if s in byslug)
count = lambda f: sum(1 for r in S if f in groups(r).split())
buttons = f'<button aria-pressed="true" data-f="all">All<b>{len(S)}</b></button><button aria-pressed="false" data-f="3d">Interactive 3D<b>{count("3d")}</b></button>' + "".join(f'<button aria-pressed="false" data-f="{k}">{n}<b>{count(k)}</b></button>' for k,(n,_) in GROUPS.items())
inds = sorted(set(r[3] for r in S))
strip = "".join(f"<span>{e(i)}</span>" for i in inds)
page = open(os.path.join(ROOT, 'tools', 'gallery_template.html')).read()
for k, v in {'{{COUNT}}': str(len(S)), '{{INDCOUNT}}': str(len(inds)), '{{THREED}}': str(count('3d')), '{{BUTTONS}}': buttons, '{{CARDS}}': cards, '{{FEATURED}}': feat, '{{INDSTRIP}}': strip}.items():
    page = page.replace(k, v)
open(os.path.join(ROOT, 'index.html'), 'w').write(page)
rows = "\n".join(f"| [{t}](sites/{s}/) | {i} | {tr} | [Live demo](https://calvyrn.github.io/portfolio/sites/{s}/) |" for s, t, tr, i, *_ in S)
readme = open(os.path.join(ROOT, 'README.md')).read()
start = readme.index('| Project |'); end = readme.index('**Tiers**')
readme = readme[:start] + "| Project | Industry | Tier | Demo |\n|---|---|---|---|\n" + rows + "\n\n" + readme[end:]
open(os.path.join(ROOT, 'README.md'), 'w').write(readme)
print(len(S), "sites")
