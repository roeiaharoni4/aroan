"""The segment ads with a group of products at the centre (17.11.26).

Roei on drafts_v6: "put more products in the centre, not two big ones". So the card holds
the segment's order as one scene - the Aroam-label products in the middle of the back row,
the segment's everyday supplies around them and in front - every item at one real-world
scale (px per cm), like meta.py's "one order" post. The thumbnail strip goes, since its
products are now in the scene. Same header, lead, tag and band as meta_v7; all photos are
the relit versions (relight.py).

Writes into marketing/meta/drafts_v7/.
"""
import pathlib
import sys

from PIL import Image

from build import LOGO, data_uri
from meta import BASE, HEAD, fill, native, photo
from meta_v2 import BAND, H, W, shoot
from meta_v7 import CSS as V7_CSS, SEGMENTS as V7

HERE = pathlib.Path(__file__).parent
OUT = HERE.parents[2] / "marketing" / "meta" / "drafts_v7"
FEED = (0, 285, W, 285 + 1350)
PPC = 9.5                 # px per cm, shared by every item in a scene
BACK, FRONT = 470, 588    # ground lines of the two rows, in card px

# (name, real height in cm, centre x in card px, row). Back row first; the Aroam-label
# products sit in its middle, clear of anything in front of their labels.
SCENES = {
    "office": [("a4_lit", 30, 125, BACK), ("rolls2_hi_lit", 20, 405, BACK), ("wipes_lit", 22, 665, BACK),
               ("jet_lit", 30, 835, BACK),
               ("pens_lit", 12, 125, FRONT), ("compact50_lit", 10, 290, FRONT), ("cup_paper_lit", 9, 455, FRONT),
               ("cup_paper_lit", 9, 520, FRONT), ("cup500_lit", 12, 790, FRONT)],
    "factory": [("kh7_lit", 28, 105, BACK), ("p5012_hi_lit", 24, 300, BACK), ("gold_lit", 26, 600, BACK),
                ("bags_trash_lit", 26, 825, BACK),
                ("gloves_lit", 9, 210, FRONT), ("squeegee_lit", 9, 640, FRONT)],
    "school": [("plate_lit", 26, 140, BACK), ("wipes_lit", 22, 360, BACK), ("rolls2_hi_lit", 20, 640, BACK),
               ("bags_trash_lit", 26, 860, BACK),
               ("compact50_lit", 10, 160, FRONT), ("cup_paper_lit", 9, 330, FRONT), ("cup_paper_lit", 9, 395, FRONT),
               ("compact50_lit", 10, 760, FRONT)],
}

CSS = V7_CSS + """
.card{height:620px}
.card .floor{height:200px}
.close{position:absolute;top:1414px;right:76px;left:76px;text-align:center;font-size:31px;font-weight:600;color:#3B5547}
.close b{color:#1A4231;font-weight:800}
.it-p{position:absolute;display:block;filter:drop-shadow(0 10px 12px rgba(14,32,54,.17))}
.it-s{position:absolute;height:22px;border-radius:50%;filter:blur(5px);
  background:radial-gradient(50% 50% at 50% 50%,rgba(26,66,49,.30),rgba(26,66,49,.10) 55%,transparent 75%)}
"""


def scene(seg):
    parts = []
    for name, cm, cx, base in SCENES[seg]:
        nw, nh = native(name)
        h = cm * PPC
        w = nw * h / nh
        parts.append(f'<div class="it-s" style="left:{cx - w * .46:.0f}px;width:{w * .92:.0f}px;top:{base - 11:.0f}px"></div>')
        parts.append(f'<img class="it-p" src="{photo(name)}" style="left:{cx - w / 2:.0f}px;top:{base - h:.0f}px;height:{h:.0f}px">')
    return "".join(parts)


def ad(seg):
    s = V7[seg]
    body = f"""<div class="c">
  <div class="top"><img class="logo" src="@@LOGO@@"><span class="chip">{s["chip"]}</span></div>
  <h1>{s["h1"]}<span>{s["h2"]}</span></h1>
  <div class="lead">{s["lead"]}</div>
  <div class="card">
    <div class="floor"></div>
    {scene(seg)}
    <span class="label-tag">עם התווית של אהרוני</span>
  </div>
  <div class="close">ועוד מאות מוצרים לעסק — <b>בהזמנה אחת, מספק אחד.</b></div>
  {BAND}
</div>"""
    page = HEAD + BASE + CSS.replace("@@LD@@", "270") + "</style></head><body>" + body + "</body></html>"
    return fill(page, w=W, h=H, logo=data_uri(LOGO))


def main(which):
    OUT.mkdir(parents=True, exist_ok=True)
    for seg in SCENES:
        if which and seg not in which:
            continue
        html = OUT / f"{seg}.html"
        html.write_text(ad(seg), encoding="utf-8")
        story = OUT / f"{seg}_story.png"
        shoot(html, story)
        Image.open(story).crop(FEED).save(OUT / f"{seg}_feed.png")
        print(seg)
    w, h = 540, 675
    sheet = Image.new("RGB", (3 * w + 4 * 16, h + 32), "#C9D6CE")
    for i, seg in enumerate(SCENES):
        sheet.paste(Image.open(OUT / f"{seg}_feed.png").resize((w, h), Image.LANCZOS), (16 + i * (w + 16), 16))
    sheet.save(OUT / "overview_feed.png")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
