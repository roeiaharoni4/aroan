"""Two tidy layouts for the segment ads, on the office ad (17.11.26).

Roei on drafts_v7 (a two-row scene of 6-9 products): "looks too messy". Two calmer
options, same header, lead and band as meta_v7/v8, relit photos:

  row    - four products on one ground line, evenly spaced, no front row; the two Aroam-label
           products in the middle.
  tiles  - four white tiles, one product each with its name, in the October layout Roei
           liked ("the design is nice"); the Aroam-label tiles carry a small leaf-green tag.

Writes into marketing/meta/drafts_v8/.
"""
import pathlib
import sys

from PIL import Image

from build import LOGO, data_uri
from meta import BASE, HEAD, fill, native, photo
from meta_v2 import BAND, H, W, shoot
from meta_v7 import CSS as V7_CSS, SEGMENTS as V7

HERE = pathlib.Path(__file__).parent
OUT = HERE.parents[2] / "marketing" / "meta" / "drafts_v8"
FEED = (0, 285, W, 285 + 1350)

# Four products, the Aroam-label two in the middle: (name, height px, tile label, own label?)
OFFICE = [("a4_lit", 230, "נייר צילום", False), ("rolls2_hi_lit", 160, "מגבות נייר", True),
          ("wipes_lit", 190, "מטליות לחות", True), ("jet_lit", 230, "חומרי ניקוי", False)]

# Roei chose the tiles (17.11). The set: one tiles ad per segment, Aroam-label tiles on top.
FINAL = HERE.parents[2] / "marketing" / "meta" / "final_v4"
SEG_ITEMS = {
    "office": OFFICE,
    "factory": [("p5012_hi_lit", 180, "גליל תעשייתי 5012", True), ("gold_lit", 185, "גליל GOLD", True),
                ("gloves_lit", 150, "כפפות ניטריל", False), ("bags_trash_lit", 200, "שקיות אשפה", False)],
    "school": [("wipes_lit", 200, "מטליות לחות", True), ("rolls2_hi_lit", 160, "מגבות נייר", True),
               ("compact50_lit", 160, "נייר טואלט", False), ("cup_paper_lit", 180, "כוסות", False)],
}

CSS = V7_CSS + """
.card{height:600px}
.card .floor{height:190px}
.it-p{position:absolute;display:block;filter:drop-shadow(0 10px 12px rgba(14,32,54,.17))}
.it-s{position:absolute;height:22px;border-radius:50%;filter:blur(5px);
  background:radial-gradient(50% 50% at 50% 50%,rgba(26,66,49,.30),rgba(26,66,49,.10) 55%,transparent 75%)}
.close{position:absolute;top:1414px;right:76px;left:76px;text-align:center;font-size:31px;font-weight:600;color:#3B5547}
.close b{color:#1A4231;font-weight:800}
/* tiles */
.grid{position:absolute;top:770px;left:76px;right:76px;display:grid;grid-template-columns:1fr 1fr;gap:20px}
.tile{position:relative;background:#fff;border-radius:26px;padding:14px 18px 16px;display:flex;flex-direction:column;
  align-items:center;box-shadow:0 2px 0 #E1EAE4,0 14px 30px rgba(26,66,49,.07)}
.tile .ph{height:220px;width:100%;display:flex;align-items:flex-end;justify-content:center;padding-bottom:12px;
  background:radial-gradient(60% 55% at 50% 70%,#EEF4F0 0%,#fff 100%);border-radius:18px}
.tile .ph img{display:block;max-width:92%;filter:drop-shadow(0 8px 10px rgba(14,32,54,.18))}
.tile span{font-weight:700;font-size:32px;margin-top:10px}
.tile em{position:absolute;top:16px;right:18px;font-style:normal;font-weight:700;font-size:21px;color:#1A4231;
  background:#E2EFE6;border-radius:20px;padding:4px 14px}
"""


def row(items, width=848, base=500):
    """One ground line, equal gaps between products, the group centred on the card."""
    parts = []
    ws = [native(n)[0] * h / native(n)[1] for n, h, *_ in items]
    gap = max(16, (width - sum(ws)) / (len(items) - 1))
    x = 40 + (width + sum(ws) + gap * (len(items) - 1)) / 2   # right edge of the group
    for (name, h, *_rest), w in zip(items, ws):
        cx = x - w / 2                              # right to left
        x -= w + gap
        parts.append(f'<div class="it-s" style="left:{cx - w * .46:.0f}px;width:{w * .92:.0f}px;top:{base - 11:.0f}px"></div>')
        parts.append(f'<img class="it-p" src="{photo(name)}" style="left:{cx - w / 2:.0f}px;top:{base - h:.0f}px;height:{h:.0f}px">')
    return "".join(parts)


def tiles(items):
    """The Aroam-label tiles take the top row."""
    out = []
    for name, h, label, own in sorted(items, key=lambda it: not it[3]):
        tag = "<em>אהרוני</em>" if own else ""
        out.append(f'<div class="tile">{tag}<div class="ph"><img src="{photo(name)}" style="max-height:{min(h, 200)}px">'
                   f'</div><span>{label}</span></div>')
    return f'<div class="grid">{"".join(out)}</div>'


def ad(layout, seg="office", items=OFFICE):
    s = V7[seg]
    if layout == "row":
        middle = (f'<div class="card"><div class="floor"></div>{row(items)}'
                  f'<span class="label-tag">עם התווית של אהרוני</span></div>'
                  f'<div class="close">ועוד מאות מוצרים לעסק — <b>בהזמנה אחת, מספק אחד.</b></div>')
    else:
        middle = tiles(items)
    body = f"""<div class="c">
  <div class="top"><img class="logo" src="@@LOGO@@"><span class="chip">{s["chip"]}</span></div>
  <h1>{s["h1"]}<span>{s["h2"]}</span></h1>
  <div class="lead">{s["lead"]}</div>
  {middle}
  {BAND}
</div>"""
    page = HEAD + BASE + CSS.replace("@@LD@@", "270") + "</style></head><body>" + body + "</body></html>"
    return fill(page, w=W, h=H, logo=data_uri(LOGO))


def final_set():
    FINAL.mkdir(parents=True, exist_ok=True)
    for seg, items in SEG_ITEMS.items():
        html = OUT / f"{seg}_tiles.html"
        html.write_text(ad("tiles", seg=seg, items=items), encoding="utf-8")
        story = FINAL / f"{seg}_story.png"
        shoot(html, story)
        Image.open(story).crop(FEED).save(FINAL / f"{seg}_feed.png")
        print(seg)
    w, h = 540, 675
    sheet = Image.new("RGB", (3 * w + 4 * 16, h + 32), "#C9D6CE")
    for i, seg in enumerate(SEG_ITEMS):
        sheet.paste(Image.open(FINAL / f"{seg}_feed.png").resize((w, h), Image.LANCZOS), (16 + i * (w + 16), 16))
    sheet.save(FINAL / "overview_feed.png")


def main(which):
    if "set" in which:
        return final_set()
    OUT.mkdir(parents=True, exist_ok=True)
    names = []
    for layout in ("row", "tiles"):
        name = f"office_{layout}"
        html = OUT / f"{name}.html"
        html.write_text(ad(layout), encoding="utf-8")
        story = OUT / f"{name}_story.png"
        shoot(html, story)
        Image.open(story).crop(FEED).save(OUT / f"{name}_feed.png")
        names.append(name)
        print(name)
    w, h = 540, 675
    sheet = Image.new("RGB", (len(names) * w + (len(names) + 1) * 16, h + 32), "#C9D6CE")
    for i, n in enumerate(names):
        sheet.paste(Image.open(OUT / f"{n}_feed.png").resize((w, h), Image.LANCZOS), (16 + i * (w + 16), 16))
    sheet.save(OUT / "overview_feed.png")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
