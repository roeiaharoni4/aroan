"""Three design directions for the segment ads, on the office ad (17.11.26).

Roei on drafts_v4 (dark green "studio"): "looks even less good - remove the 20 and change
the design". Rather than one more guess, three different layouts on the same copy and the
same product, for him to choose from. All three go back to the light brand palette of the
October set he liked, and keep the product large (no white card, no sticker, no magnifier,
no outlined 20):

  A  light      - one light field, the product large and running off the side, soft floor.
  B  split      - dark green top with the headline, light bottom; the product straddles both.
  C  arch       - a pastel arch behind the product as its stage, the headline above.

Writes into marketing/meta/drafts_v5/.
"""
import pathlib
import sys

from PIL import Image

from build import LOGO, data_uri
from meta import BASE, HEAD, WA, fill, native, photo
from meta_v2 import H, W, shoot

HERE = pathlib.Path(__file__).parent
OUT = HERE.parents[2] / "marketing" / "meta" / "drafts_v5"
FEED = (0, 285, W, 285 + 1350)

COPY = dict(chip="למשרדים", h1="המשרד שלכם.", h2="המגבות שלנו.",
            meta="ספק לעסקים ומוסדות כבר מעל 20 שנה · עם התווית שלנו",
            more="נייר צילום · כוסות · חומרי ניקוי · נייר טואלט")
PRODUCT = "rolls2_hi"

# Roei chose B (split), 17.11. The set: one ad per segment in that layout. The hand-towel
# pack and 5012 are the only labelled products with photos sharp enough at this size, so
# the kindergarten ad shows the towels too until there is a photo of the wipes bucket.
FINAL = HERE.parents[2] / "marketing" / "meta" / "final_v3"
META = "ספק לעסקים ומוסדות כבר מעל 20 שנה · עם התווית שלנו"
SEGMENTS = {
    "office": dict(chip="למשרדים", h1="המשרד שלכם.", h2="המגבות שלנו.", meta=META,
                   more="נייר צילום · כוסות · חומרי ניקוי · נייר טואלט",
                   product="rolls2_hi", width=900, left=90),
    "factory": dict(chip="למפעלים ולבתי מלאכה", h1="המפעל שלכם.", h2="הגליל שלנו.", meta=META,
                    more="כפפות ניטריל · שקיות אשפה · מסיר שומנים · מגבים",
                    product="p5012_hi", width=760, left=160),
    "school": dict(chip="לגנים ולמוסדות חינוך", h1="הגן שלכם.", h2="המגבות שלנו.", meta=META,
                   more="נייר טואלט · סבון ידיים · כוסות וצלחות · שקיות אשפה",
                   product="rolls2_hi", width=900, left=90),
}

COMMON = """*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden}
.c{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:Heebo,sans-serif;color:#1A4231;
  background:#F3F7F4}
.top{position:absolute;top:298px;right:76px;left:76px;display:flex;align-items:center;justify-content:space-between;z-index:2}
.logo{width:160px;display:block}
.chip{font-weight:600;font-size:28px;border-radius:40px;padding:8px 24px}
h1{position:absolute;right:76px;left:76px;font-weight:900;font-size:112px;line-height:1;letter-spacing:-3px;z-index:2}
h1 span{display:block}
.meta{position:absolute;right:76px;left:76px;font-size:30px;font-weight:500;z-index:2}
.prod{position:absolute;display:block;z-index:1}
.shadow{position:absolute;height:56px;border-radius:50%;z-index:0;filter:blur(8px);
  background:radial-gradient(50% 50% at 50% 50%,rgba(26,66,49,.42),rgba(26,66,49,.16) 50%,transparent 72%)}
.more{position:absolute;right:76px;left:76px;font-size:29px;font-weight:500;z-index:2}
.more b{font-weight:800;margin-inline-end:8px}
.cta-row{position:absolute;top:1532px;right:76px;left:76px;display:flex;align-items:center;justify-content:space-between;z-index:2}
.cta{display:inline-flex;align-items:center;gap:14px;font-weight:800;font-size:34px;padding:16px 32px;border-radius:60px}
.cta svg{width:38px;height:38px}
.cta-row small{font-size:27px;font-weight:500}
"""

DIRECTIONS = {
    # A: one light field; the product large, off the left edge, on a soft floor.
    "A_light": dict(css="""
.c{background:radial-gradient(70% 45% at 40% 62%,#FFFFFF 0%,#F3F7F4 60%,#E9F1EC 100%)}
.floor{position:absolute;left:0;right:0;top:1330px;bottom:0;background:linear-gradient(#E4EEE7,#DCE8E0)}
.chip{color:#1A4231;background:#E2EFE6}
h1{top:416px} h1 span{color:#639C7D}
.meta{top:660px;color:#4A6B5A}
.more{top:1452px;color:#3B5547} .more b{color:#1A4231}
.cta{background:#1A4231;color:#fff} .cta svg{color:#8FD6A3}
.cta-row small{color:#4A6B5A}
""", floor='<div class="floor"></div>', width=1040, left=-70, base=1400),
    # B: dark top for the headline, light bottom; the product sits across the edge.
    "B_split": dict(css="""
.c{background:#F3F7F4}
.dark{position:absolute;left:0;right:0;top:0;height:1080px;background:#1A4231}
.chip{color:#BFE8CB;border:2px solid rgba(143,214,163,.55);padding:6px 22px}
h1{top:416px;color:#fff} h1 span{color:#8FD6A3}
.meta{top:660px;color:#CFE6D7}
.more{top:1452px;color:#3B5547} .more b{color:#1A4231}
.cta{background:#1A4231;color:#fff} .cta svg{color:#8FD6A3}
.cta-row small{color:#4A6B5A}
""", floor='<div class="dark"></div>', width=900, left=90, base=1410),
    # C: a pastel arch as the product's stage.
    "C_arch": dict(css="""
.c{background:#F3F7F4}
.arch{position:absolute;left:170px;width:740px;top:730px;height:690px;border-radius:370px 370px 36px 36px;
  background:linear-gradient(#CFEBD7,#B7E0C3)}
.chip{color:#1A4231;background:#E2EFE6}
h1{top:416px} h1 span{color:#639C7D}
.meta{top:660px;color:#4A6B5A;text-align:center;right:76px;left:76px}
.more{top:1452px;color:#3B5547;text-align:center} .more b{color:#1A4231}
.cta{background:#1A4231;color:#fff} .cta svg{color:#8FD6A3}
.cta-row small{color:#4A6B5A}
""", floor='<div class="arch"></div>', width=880, left=100, base=1400),
}


def ad(name, copy=COPY, product=PRODUCT, width=None, left=None):
    d = DIRECTIONS[name]
    nw, nh = native(product)
    w = width or d["width"]
    h = nh * w / nw
    x, base = (d["left"] if left is None else left), d["base"]
    src = photo(product)
    stage = (f'<div class="shadow" style="left:{x + w * .05:.0f}px;width:{w * .9:.0f}px;top:{base - 30:.0f}px"></div>'
             f'<img class="prod" src="{src}" style="left:{x:.0f}px;top:{base - h:.0f}px;width:{w:.0f}px;'
             f'filter:drop-shadow(0 24px 30px rgba(26,66,49,.22))">')
    body = f"""<div class="c">
  {d["floor"]}
  <div class="top"><img class="logo" src="@@LOGO@@"><span class="chip">{copy["chip"]}</span></div>
  <h1>{copy["h1"]}<span>{copy["h2"]}</span></h1>
  <div class="meta">{copy["meta"]}</div>
  {stage}
  <div class="more"><b>וגם:</b>{copy["more"]}</div>
  <div class="cta-row"><span class="cta">{WA}שלחו הודעה בוואטסאפ</span><small>מיבנה ועד רעננה</small></div>
</div>"""
    page = HEAD + BASE + COMMON + d["css"] + "</style></head><body>" + body + "</body></html>"
    return fill(page, w=W, h=H, logo=data_uri(LOGO))


def final_set():
    """The three segment ads in direction B, story and feed, into final_v3/."""
    FINAL.mkdir(parents=True, exist_ok=True)
    for seg, c in SEGMENTS.items():
        html = OUT / f"B_{seg}.html"
        html.write_text(ad("B_split", copy=c, product=c["product"], width=c["width"], left=c["left"]),
                        encoding="utf-8")
        story = FINAL / f"{seg}_story.png"
        shoot(html, story)
        Image.open(story).crop(FEED).save(FINAL / f"{seg}_feed.png")
        print(seg)
    w, h = 540, 675
    sheet = Image.new("RGB", (3 * w + 4 * 16, h + 32), "#C9D6CE")
    for i, seg in enumerate(SEGMENTS):
        sheet.paste(Image.open(FINAL / f"{seg}_feed.png").resize((w, h), Image.LANCZOS), (16 + i * (w + 16), 16))
    sheet.save(FINAL / "overview_feed.png")


def main(which):
    if "set" in which:
        return final_set()
    OUT.mkdir(parents=True, exist_ok=True)
    for name in DIRECTIONS:
        if which and name[0] not in which:
            continue
        html = OUT / f"{name}.html"
        html.write_text(ad(name), encoding="utf-8")
        story = OUT / f"{name}_story.png"
        shoot(html, story)
        Image.open(story).crop(FEED).save(OUT / f"{name}_feed.png")
        print(name)
    names = [n for n in DIRECTIONS if (OUT / f"{n}_feed.png").exists()]
    w, h = 540, 675
    sheet = Image.new("RGB", (len(names) * w + (len(names) + 1) * 16, h + 32), "#C9D6CE")
    for i, n in enumerate(names):
        sheet.paste(Image.open(OUT / f"{n}_feed.png").resize((w, h), Image.LANCZOS), (16 + i * (w + 16), 16))
    sheet.save(OUT / "overview_feed.png")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
