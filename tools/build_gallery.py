#!/usr/bin/env python3
"""Rebuild index.html and README.md from sites.json (list of [slug, title, tier, industry, description, why, design])."""
import json, html, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(os.path.join(ROOT, 'sites.json')))
ORDER = {"High-end 3D": 0, "Medium": 1, "Simple": 2}
S.sort(key=lambda r: (ORDER.get(r[2], 9), r[3]))
tiers = [t for t in ["High-end 3D", "Medium", "Simple"] if any(r[2] == t for r in S)]
cards = "\n".join(f'''<article class="card" data-tier="{html.escape(tr)}">
  <a class="shot" href="sites/{s}/"><img src="sites/{s}/screenshots/desktop.png" alt="{html.escape(t)}: desktop screenshot" loading="lazy" width="1366" height="860"></a>
  <div class="meta"><span class="ind">{html.escape(i)}</span><span class="tier">{html.escape(tr)}</span></div>
  <h2><a href="sites/{s}/">{html.escape(t)}</a></h2>
  <p>{html.escape(w)}</p>
  <a class="code" href="https://github.com/calvyrn/portfolio/tree/main/sites/{s}">View the code</a>
</article>''' for s, t, tr, i, w, *_ in S)
buttons = '<button aria-pressed="true" data-f="all">All</button>' + "".join(f'<button aria-pressed="false" data-f="{t}">{t}</button>' for t in tiers)
page = open(os.path.join(ROOT, 'tools', 'gallery_template.html')).read()
page = page.replace('{{COUNT}}', str(len(S))).replace('{{BUTTONS}}', buttons).replace('{{CARDS}}', cards)
open(os.path.join(ROOT, 'index.html'), 'w').write(page)
rows = "\n".join(f"| [{t}](sites/{s}/) | {i} | {tr} | [Live demo](https://calvyrn.github.io/portfolio/sites/{s}/) |" for s, t, tr, i, *_ in S)
readme = open(os.path.join(ROOT, 'README.md')).read()
start = readme.index('| Project |'); end = readme.index('**Tiers**')
readme = readme[:start] + "| Project | Industry | Tier | Demo |\n|---|---|---|---|\n" + rows + "\n\n" + readme[end:]
open(os.path.join(ROOT, 'README.md'), 'w').write(readme)
print(len(S), "sites")
