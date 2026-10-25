"""Derive landing explorations H, I, J from landing-v3.src.html by inserting sections."""
from pathlib import Path

HERE = Path(__file__).parent
base = (HERE / "landing-v3.src.html").read_text()

# Source hues, matching the hero figure.
SRC = {
    "youtube": ("YouTube", "#ff6b6b"),
    "course": ("Course site", "#6fa8ff"),
    "pdf": ("Lecture PDFs", "#f0a35e"),
    "drive": ("Google Drive", "#e5c04a"),
    "notes": ("Notes app", "#b48bf2"),
    "shot": ("Screenshots", "#f27aa8"),
}
ICON = {
    "youtube": '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9v6l5-3z" fill="currentColor"/>',
    "course": '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
    "pdf": '<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5M9 13h8M9 17h6"/>',
    "drive": '<path d="M8 3h8l6 11-4 7H6l-4-7z"/><path d="M2 14h20M8 3l10 18M16 3 6 21"/>',
    "notes": '<path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    "shot": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/>',
    "key": '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h1M7 14h10"/>',
    "page": '<path d="M5 3h10l4 4v14H5z"/><path d="M8 12h8" stroke-width="3" opacity=".45"/><path d="M8 16h6"/>',
    "lock": '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
}


def icon(name, color, size=20):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" '
            f'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color:{color}">{ICON[name]}</svg>')


def write(name, html):
    (HERE / f"{name}.src.html").write_text(html)


COMMON_CSS = """
.feat { display: grid; grid-template-columns: repeat(4, 1fr); gap: 40px 32px; margin-top: 48px; }
.feat h4 { margin: 14px 0 8px; font-size: 17px; font-weight: 500; color: var(--color-text-strong); }
.feat p { font-size: 15px; line-height: 23px; color: var(--desc); }
.srclist { margin-top: 40px; border-top: 1px solid var(--color-border); }
.srow { display: grid; grid-template-columns: 260px 1fr 140px; align-items: center; gap: 24px; padding: 18px 0; border-bottom: 1px solid var(--color-border); }
.srow .nm { display: flex; align-items: center; gap: 14px; font-size: 17px; font-weight: 500; color: var(--color-text-strong); }
.srow .tl { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.srow p { font-size: 15px; line-height: 23px; color: var(--desc); }
.srow .jump { font-family: var(--font-mono); font-size: 13px; text-align: right; }
"""

# ---------------- H · Pluto colour ----------------
feat_items = [
    ("key", "#ffb547", "One key, any app", "Saves the files, tabs and videos in front of you. You see the list."),
    ("youtube", SRC["youtube"][1], "Inside every video", "Lectures are transcribed, so you can search what was said."),
    ("pdf", SRC["pdf"][1], "Every page of every PDF", "Slides and readings are searchable down to the line."),
    ("shot", SRC["shot"][1], "Screenshots, read", "Text and diagrams in your screenshots become searchable."),
    ("course", SRC["course"][1], "Your course site", "Pages and handouts you capture from it, kept current."),
    ("drive", SRC["drive"][1], "Drive docs", "Lab notes and shared docs, searchable next to everything else."),
    ("notes", SRC["notes"][1], "Your own notes", "What you wrote, linked to the slides it was about."),
    ("page", "#6be0a0", "Opens on the right page", "Every answer jumps to the exact page or second."),
]
feat = "".join(f'<div>{icon(i, c, 22)}<h4>{t}</h4><p>{d}</p></div>' for i, c, t, d in feat_items)

hub_left = list(SRC.items())
hub_svg_paths = "".join(
    f'<path d="M232 {40 + i * 64} C 400 {40 + i * 64}, 420 210, 520 210" stroke="{c}" stroke-opacity=".55"/>'
    for i, (_, (_, c)) in enumerate(hub_left))
hub_right = [("Answer, with the page", "#ededed"), ("Saved note, with sources", "#ededed"), ("Opened at 18:42", "#ededed")]
hub_svg_paths += "".join(
    f'<path d="M600 210 C 700 210, 720 {104 + i * 106}, 868 {104 + i * 106}" stroke="#5c5c5c"/>' for i in range(3))
hub = f"""
<div class="hub">
  <svg class="hub-lines" viewBox="0 0 1120 420" fill="none" stroke-width="1.2">{hub_svg_paths}</svg>
  {''.join(f'<div class="hub-src" style="top:{24 + i * 64}px">{icon(k, c, 18)}<span>{n}</span></div>' for i, (k, (n, c)) in enumerate(hub_left))}
  <div class="hub-node">{{{{logo}}}}<span>Avenire</span></div>
  {''.join(f'<div class="hub-out" style="top:{86 + i * 106}px">{t}</div>' for i, (t, _) in enumerate(hub_right))}
</div>"""
HUB_CSS = """
.hub { position: relative; height: 420px; margin-top: 48px; border: 1px solid var(--color-border); border-radius: var(--radius-l-card); background: var(--color-surface-1); }
.hub-lines { position: absolute; inset: 0; width: 100%; height: 100%; }
.hub-src { position: absolute; left: 32px; width: 200px; height: 36px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border: 1px solid var(--color-border-strong); border-radius: 8px; background: var(--color-surface-2); font-size: 14px; font-weight: 500; color: var(--color-text-strong); }
.hub-node { position: absolute; left: 520px; top: 172px; width: 80px; height: 76px; border: 1px solid #4a4a4a; border-radius: 12px; background: var(--color-surface-3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--color-text-strong); font-size: 12px; }
.hub-node svg { width: 26px; height: 21px; }
.hub-out { position: absolute; right: 32px; width: 220px; height: 36px; display: flex; align-items: center; padding: 0 12px; border: 1px solid var(--color-border-strong); border-radius: 8px; background: var(--color-surface-2); font-size: 14px; color: var(--color-text-strong); }
"""

srows = [
    ("youtube", "Transcribed, so you can search what the lecturer said.", "18:42"),
    ("pdf", "Every page indexed, figures included.", "p.17"),
    ("course", "Pages and handouts you capture from it.", "week 6"),
    ("drive", "Docs and lab notes, searchable by what's in them.", "§ Method"),
    ("notes", "Your writing, linked to the slides it's about.", "Lab 3"),
    ("shot", "Text and diagrams in the image are read.", "Tue 11:02"),
]
srclist = '<div class="srclist">' + "".join(
    f'<div class="srow"><div class="nm"><span class="tl" style="background:{SRC[k][1]}1f">{icon(k, SRC[k][1], 20)}</span>{SRC[k][0]}</div>'
    f'<p>{d}</p><span class="jump" style="color:{SRC[k][1]}">opens at {j}</span></div>' for k, d, j in srows) + "</div>"

h = base.replace("</style>", COMMON_CSS + HUB_CSS + "</style>")
anchor = '  <section class="section">\n    <h2><span class="setup">Two keys.</span>'
h = h.replace(anchor, f"""  <section class="section">
    <h2><span class="setup">What it does.</span><br>All six, in one place.</h2>
    <div class="feat">{feat}</div>
  </section>

  <section class="section">
    <h2><span class="setup">Works with what you already use.</span><br>Nothing to move, nothing to rename.</h2>
    {hub}
    {srclist}
  </section>

""" + anchor, 1)
write("explore-h", h)

# ---------------- I · V1 revival ----------------
I_CSS = """
.flow { display: grid; grid-template-columns: 420px 1fr; gap: 0; margin-top: 48px; border: 1px solid var(--color-border); border-radius: var(--radius-l-card); overflow: hidden; }
.flow-steps { display: flex; flex-direction: column; border-right: 1px solid var(--color-border); }
.fstep { padding: 24px 28px; border-bottom: 1px solid var(--color-border); }
.fstep:last-child { border-bottom: none; }
.fstep h4 { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 500; color: var(--color-text-strong); margin-bottom: 6px; }
.fstep p { font-size: 15px; line-height: 23px; color: var(--desc); }
.fstep.on { background: var(--color-surface-2); box-shadow: inset 2px 0 0 var(--color-text-strong); }
.flow-art { position: relative; background: var(--color-surface-1); background-image: radial-gradient(var(--color-border) 1px, transparent 1px); background-size: 18px 18px; min-height: 360px; }
.fcard { position: absolute; width: 260px; border: 1px solid var(--color-border-strong); border-radius: 10px; background: var(--color-surface-2); overflow: hidden; }
.fcard .hd { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border-bottom: 1px solid var(--color-border); font-size: 13px; color: var(--color-text-strong); }
.fcard .bd { padding: 12px; font-size: 13px; line-height: 20px; color: var(--desc); display: flex; flex-direction: column; gap: 8px; }
.tagc { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 5px; font-size: 11.5px; font-weight: 500; }
.figrow { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 48px; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); }
.figcell { padding: 24px 28px 32px; }
.figcell + .figcell { border-left: 1px solid var(--color-border); }
.figcell .fig { height: 240px; margin: 8px 0 20px; }
.figcell h4 { font-size: 17px; font-weight: 500; color: var(--color-text-strong); margin-bottom: 6px; }
.figcell p { font-size: 15px; line-height: 23px; color: var(--desc); }
.bento { display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 16px; margin-top: 48px; }
.bcol { display: flex; flex-direction: column; gap: 16px; }
.bcard { border: 1px solid var(--color-border); border-radius: var(--radius-l-card); background: var(--color-surface-1); padding: 22px; }
.bcard h4 { margin: 12px 0 6px; font-size: 16px; font-weight: 500; color: var(--color-text-strong); }
.bcard p { font-size: 14.5px; line-height: 22px; color: var(--desc); }
.bmid { position: relative; min-height: 400px; border: 1px solid var(--color-border); border-radius: var(--radius-l-card); background: var(--color-surface-1); background-image: radial-gradient(var(--color-border) 1px, transparent 1px); background-size: 18px 18px; overflow: hidden; }
.prices { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 48px; border: 1px solid var(--color-border); border-radius: var(--radius-l-card); }
.tier { padding: 28px; display: flex; flex-direction: column; gap: 14px; }
.tier + .tier { border-left: 1px solid var(--color-border); }
.tier .nm { font-size: 17px; font-weight: 500; color: var(--color-text-strong); }
.tier .amt { font-size: 40px; font-weight: 500; letter-spacing: -0.03em; color: var(--color-text-strong); }
.tier .amt small { font-size: 15px; font-weight: 400; color: var(--meta); letter-spacing: 0; }
.tier ul { list-style: none; display: flex; flex-direction: column; gap: 9px; font-size: 14.5px; color: var(--desc); }
.tier li::before { content: "✓"; margin-right: 10px; color: var(--color-signal-green); }
.tier .btn { justify-content: center; }
"""

flow = f"""
<div class="flow">
  <div class="flow-steps">
    <div class="fstep on"><h4>{icon('key', '#ffb547', 18)}Capture</h4><p>⌥ C saves what's open. Lecture 6 lands in your library.</p></div>
    <div class="fstep"><h4>{icon('page', '#6be0a0', 18)}Find</h4><p>Ask for "the slide on threshold voltage". It opens on page 14.</p></div>
    <div class="fstep"><h4>{icon('notes', SRC['notes'][1], 18)}Save to a notebook</h4><p>Keep the answer as a note, with its sources attached.</p></div>
  </div>
  <div class="flow-art">
    <svg style="position:absolute; inset:0; width:100%; height:100%;" viewBox="0 0 700 360" fill="none" stroke="#5c5c5c" stroke-width="1.2"><path d="M300 120 L 340 120 L 340 180 L 372 180"/><path d="M448 180 L 470 180 L 470 240 L 496 240" stroke="#6be0a0" stroke-opacity=".6"/><circle cx="300" cy="120" r="3" fill="#5c5c5c"/><circle cx="496" cy="240" r="3" fill="#6be0a0"/></svg>
    <div class="fcard" style="left:40px; top:56px;"><div class="hd">{icon('pdf', SRC['pdf'][1], 16)}Lecture 6 — Transistors.pdf</div><div class="bd"><span>38 pages · captured from Course site</span><span><span class="tagc" style="background:{SRC['course'][1]}1f; color:{SRC['course'][1]}">Course site</span></span></div></div>
    <div style="position:absolute; left:372px; top:144px; width:76px; height:72px; border:1px solid #4a4a4a; border-radius:12px; background:var(--color-surface-3); display:flex; align-items:center; justify-content:center; color:var(--color-text-strong);">{{{{logo}}}}</div>
    <div class="fcard" style="left:496px; top:190px; width:200px;"><div class="hd">{icon('page', '#6be0a0', 16)}Opened at page 14</div><div class="bd"><span>"…only when V<sub>GS</sub> exceeds V<sub>th</sub> does a channel appear."</span><span><span class="tagc" style="background:#6be0a01f; color:#6be0a0">Cited</span></span></div></div>
  </div>
</div>"""

figrow = """
<div class="figrow">
  <div class="figcell"><span class="mono">Fig 0.1</span>{{fig:card-collect}}<h4>Capture anything</h4><p>One key grabs the PDFs, tabs and videos you have open.</p></div>
  <div class="figcell"><span class="mono">Fig 0.2</span>{{fig:card-organize}}<h4>Filed for you</h4><p>Everything lands in one library. Notebooks are optional.</p></div>
  <div class="figcell"><span class="mono">Fig 0.3</span>{{fig:card-ask}}<h4>Answers with pages</h4><p>Every answer cites the page or second it came from.</p></div>
</div>"""

bento_l = [("youtube", SRC["youtube"][1], "Search inside videos", "Find the minute, not just the video."), ("shot", SRC["shot"][1], "Read your screenshots", "Diagrams and handwriting become text you can search.")]
bento_r = [("drive", SRC["drive"][1], "Next to your Drive", "Lab notes and shared docs in the same search."), ("lock", "#6be0a0", "Private by default", "Only what you capture, visible to you alone.")]
bcard = lambda i, c, t, d: f'<div class="bcard">{icon(i, c, 22)}<h4>{t}</h4><p>{d}</p></div>'
bento = f"""
<div class="bento">
  <div class="bcol">{''.join(bcard(*x) for x in bento_l)}</div>
  <div class="bmid">
    <svg style="position:absolute; inset:0; width:100%; height:100%;" viewBox="0 0 440 420" fill="none" stroke-width="1.2"><path d="M80 90 L 190 150" stroke="{SRC['youtube'][1]}" stroke-opacity=".5"/><path d="M220 60 L 220 140" stroke="{SRC['pdf'][1]}" stroke-opacity=".5"/><path d="M360 90 L 250 150" stroke="{SRC['course'][1]}" stroke-opacity=".5"/><path d="M220 210 L 220 268" stroke="#5c5c5c"/></svg>
    <div style="position:absolute; left:52px; top:68px;" class="srow-tl">{icon('youtube', SRC['youtube'][1], 26)}</div>
    <div style="position:absolute; left:207px; top:30px;">{icon('pdf', SRC['pdf'][1], 26)}</div>
    <div style="position:absolute; left:362px; top:68px;">{icon('course', SRC['course'][1], 26)}</div>
    <div style="position:absolute; left:182px; top:140px; width:76px; height:70px; border:1px solid #4a4a4a; border-radius:12px; background:var(--color-surface-3); display:flex; align-items:center; justify-content:center; color:var(--color-text-strong);">{{{{logo}}}}</div>
    <div class="fcard" style="left:70px; top:268px; width:300px;"><div class="hd">the bit where he drew the band diagram</div><div class="bd"><span style="color:var(--color-text-strong)">MIT 6.002 Lecture 12 · <span style="color:{SRC['youtube'][1]}">18:42</span></span><span>Lecture 6 — Transistors.pdf · <span style="color:{SRC['pdf'][1]}">p.17</span></span></div></div>
  </div>
  <div class="bcol">{''.join(bcard(*x) for x in bento_r)}</div>
</div>"""

prices = """
<div class="prices">
  <div class="tier"><span class="nm">Student</span><span class="amt">₹0 <small>forever</small></span><span class="btn btn-primary">Download</span><ul><li>Capture and search</li><li>2 GB library</li><li>Answers with pages</li></ul></div>
  <div class="tier"><span class="nm">Core</span><span class="amt">₹450 <small>/ month</small></span><span class="btn btn-ghost">Start Core</span><ul><li>Everything in Student</li><li>15 GB library</li><li>Ruth sorts it overnight</li></ul></div>
  <div class="tier"><span class="nm">Scholar</span><span class="amt">₹1,350 <small>/ month</small></span><span class="btn btn-ghost">Start Scholar</span><ul><li>Everything in Core</li><li>50 GB library</li><li>Priority answers</li></ul></div>
</div>"""

i = base.replace("</style>", I_CSS + "</style>")
i = i.replace(anchor, f"""  <section class="section">
    <h2><span class="setup">From a pile of tabs,</span><br>to the page you needed.</h2>
    {flow}
    {figrow}
  </section>

  <section class="section">
    <h2><span class="setup">Built around how you actually study.</span><br>Not around folders.</h2>
    {bento}
  </section>

""" + anchor, 1)
i = i.replace('  <section class="close">', f"""  <section class="section">
    <h2><span class="setup">Free for students.</span><br>Pay only if you want more.</h2>
    {prices}
  </section>

  <section class="close">""", 1)
write("explore-i", i)

# ---------------- J · colour in the words ----------------
def word(k, label=None):
    n, c = SRC[k]
    return (f'<span class="cw" style="color:{c}"><span class="cw-i" style="background:{c}1f">{icon(k, c, 30)}</span>{label or n}</span>')

J_CSS = """
.cw { white-space: nowrap; }
.cw-i { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 12px; vertical-align: -6px; margin-right: 12px; }
.cw-s .cw-i { width: 30px; height: 30px; border-radius: 8px; vertical-align: -6px; margin-right: 8px; }
.cw-s .cw-i svg { width: 18px; height: 18px; }
.hero h1.cwh { font-size: 56px; line-height: 72px; }
.lead-src { font-size: 20px; line-height: 34px; color: var(--lead); max-width: 900px; }
"""
j = base.replace("</style>", COMMON_CSS + J_CSS + "</style>")
j = j.replace('<h1 class="display"><span class="setup">Your course is in six apps.</span><br>Keep it in one.</h1>',
              f'<h1 class="display cwh"><span class="setup">Lectures on</span> {word("youtube")}<span class="setup">,</span><br><span class="setup">slides on the</span> {word("course")}<span class="setup">,</span><br><span class="setup">notes in</span> {word("notes", "three apps")}<span class="setup">.</span><br>Keep it in one.</h1>')
j = j.replace("<p>Press one key to save what you're studying. Ask a question, and it opens on the right page.</p>",
              f'<p class="lead-src cw-s">Press one key to save {word("pdf", "PDFs")}, {word("shot", "screenshots")} and {word("drive", "Drive docs")}. Ask a question, and it opens on the right page.</p>')
j = j.replace(anchor, f"""  <section class="section">
    <h2><span class="setup">Every source keeps its place.</span><br>Every answer shows where it came from.</h2>
    {srclist}
  </section>

""" + anchor, 1)
write("explore-j", j)
print("wrote explore-h, explore-i, explore-j")
