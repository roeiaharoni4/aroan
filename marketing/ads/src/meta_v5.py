"""The segment ads, redone after Roei's notes on meta_v4 (17.11.26).

His three notes: the product cutouts read as a catalog, not an ad; the "20 years" sticker
looks childish; the magnifier on the label looks bad. So:

  - one own-label product per ad, large, on a full-bleed brand-green "studio" - a spotlight
    behind it, a floor, a contact shadow and a faint reflection - instead of small cutouts
    on a white card. Only the two products with 2000px photos can carry that size: the
    hand-towel pack and the 5012 roll (Roei's own phone cutouts, assets/). The wipes bucket
    and GOLD exist only at ~450-550px and would blur.
  - the label is simply legible on the product at that size; no magnifier.
  - "20 years" becomes type: a large outlined 20 in the backdrop and a plain line under the
    headline. No sticker.
  - the segment's other supplies become one line of text instead of a row of small cutouts.

Same 9:16 frame and 4:5 feed crop as before. Writes into marketing/meta/drafts_v4/.
"""
import pathlib
import sys

from PIL import Image

from build import LOGO, data_uri
from meta import BASE, HEAD, WA, fill, native, photo
from meta_v2 import H, W, shoot

HERE = pathlib.Path(__file__).parent
OUT = HERE.parents[2] / "marketing" / "meta" / "drafts_v4"
FEED = (0, 285, W, 285 + 1350)
FLOOR_Y = 1392          # where the product stands

SEGMENTS = {
    "office": dict(chip="למשרדים", h1="המשרד שלכם.", h2="המגבות שלנו.",
                   product="rolls2_hi", width=930, nudge=0,
                   more="נייר צילום · כוסות · חומרי ניקוי · נייר טואלט"),
    "factory": dict(chip="למפעלים ולבתי מלאכה", h1="המפעל שלכם.", h2="הגליל שלנו.",
                    product="p5012_hi", width=730, nudge=0,
                    more="כפפות ניטריל · שקיות אשפה · מסיר שומנים · מגבים"),
    "school": dict(chip="לגנים ולמוסדות חינוך", h1="הגן שלכם.", h2="המגבות שלנו.",
                   product="rolls2_hi", width=930, nudge=0,
                   more="נייר טואלט · סבון ידיים · כוסות וצלחות · שקיות אשפה"),
}

CSS = """*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden}
.c{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:Heebo,sans-serif;color:#fff;
  background:#163A2B}
/* the studio: a lit backdrop that falls off to the edges, and a floor plane below it */
.wall{position:absolute;inset:0 0 auto 0;height:@@FLOOR@@px;
  background:radial-gradient(62% 46% at 50% 78%,#3C7A5C 0%,#285C45 38%,#1A4231 70%,#163A2B 100%)}
.floor{position:absolute;left:0;right:0;top:@@FLOOR@@px;bottom:0;
  background:linear-gradient(#24523D 0%,#1A4231 22%,#143326 100%)}
.floor:before{content:"";position:absolute;left:0;right:0;top:0;height:2px;
  background:linear-gradient(90deg,transparent,rgba(143,214,163,.28),transparent)}
.big20{position:absolute;left:0;right:0;top:620px;text-align:center;font-family:Heebo,sans-serif;font-weight:900;
  font-size:720px;line-height:1;letter-spacing:-30px;color:transparent;
  -webkit-text-stroke:3px rgba(143,214,163,.38)}
.top{position:absolute;top:298px;right:76px;left:76px;display:flex;align-items:center;justify-content:space-between}
.logo{width:160px;display:block;filter:drop-shadow(0 4px 10px rgba(0,0,0,.25))}
.chip{font-weight:600;font-size:28px;color:#BFE8CB;border:2px solid rgba(143,214,163,.55);border-radius:40px;
  padding:7px 24px}
h1{position:absolute;top:416px;right:76px;left:76px;font-weight:900;font-size:112px;line-height:1;
  letter-spacing:-3px}
h1 span{display:block;color:#8FD6A3}
.meta{position:absolute;top:660px;right:76px;left:76px;display:flex;align-items:center;gap:18px;
  font-size:30px;font-weight:500;color:#CFE6D7}
.meta i{display:block;width:56px;height:3px;border-radius:2px;background:#8FD6A3}
.meta b{font-weight:800;color:#fff}
.shadow{position:absolute;height:60px;border-radius:50%;
  background:radial-gradient(50% 50% at 50% 50%,rgba(0,0,0,.55),rgba(0,0,0,.25) 45%,transparent 72%);filter:blur(6px)}
.prod{position:absolute;display:block;filter:drop-shadow(0 30px 40px rgba(0,0,0,.35))}
/* a faint reflection on the floor - what makes the floor read as a surface */
.refl{position:absolute;display:block;transform:scaleY(-1);opacity:.14;
  -webkit-mask-image:linear-gradient(to top,rgba(0,0,0,.9),transparent 30%);
  mask-image:linear-gradient(to top,rgba(0,0,0,.9),transparent 30%)}
.more{position:absolute;top:1452px;right:76px;left:76px;font-size:29px;font-weight:500;color:#CFE6D7}
.more b{font-weight:800;color:#8FD6A3;margin-inline-end:8px}
.cta-row{position:absolute;top:1532px;right:76px;left:76px;display:flex;align-items:center;justify-content:space-between}
.cta{display:inline-flex;align-items:center;gap:14px;background:#8FD6A3;color:#1A4231;font-weight:800;
  font-size:34px;padding:16px 32px;border-radius:60px}
.cta svg{width:38px;height:38px}
.cta-row small{font-size:27px;font-weight:500;color:#CFE6D7}
"""


def ad(seg):
    s = SEGMENTS[seg]
    nw, nh = native(s["product"])
    w = s["width"]
    h = nh * w / nw
    x = (W - w) / 2 + s["nudge"]
    top = FLOOR_Y - h
    src = photo(s["product"])
    stage = (f'<div class="shadow" style="left:{x + w * .04:.0f}px;width:{w * .92:.0f}px;top:{FLOOR_Y - 34:.0f}px"></div>'
             f'<img class="refl" src="{src}" style="left:{x:.0f}px;top:{FLOOR_Y + 4:.0f}px;width:{w:.0f}px">'
             f'<img class="prod" src="{src}" style="left:{x:.0f}px;top:{top:.0f}px;width:{w:.0f}px">')
    body = f"""<div class="c">
  <div class="wall"></div><div class="floor"></div>
  <div class="big20">20</div>
  <div class="top"><img class="logo" src="@@LOGO@@"><span class="chip">{s["chip"]}</span></div>
  <h1>{s["h1"]}<span>{s["h2"]}</span></h1>
  <div class="meta"><i></i><span><b>מעל 20 שנה</b> ספק לעסקים ומוסדות · עם התווית שלנו</span></div>
  {stage}
  <div class="more"><b>וגם:</b>{s["more"]}</div>
  <div class="cta-row"><span class="cta">{WA}שלחו הודעה בוואטסאפ</span><small>מיבנה ועד רעננה</small></div>
</div>"""
    page = HEAD + BASE + CSS.replace("@@FLOOR@@", str(FLOOR_Y)) + "</style></head><body>" + body + "</body></html>"
    return fill(page, w=W, h=H, logo=data_uri(LOGO))


def main(which):
    OUT.mkdir(parents=True, exist_ok=True)
    for seg in SEGMENTS:
        if which and seg not in which:
            continue
        html = OUT / f"{seg}.html"
        html.write_text(ad(seg), encoding="utf-8")
        story = OUT / f"{seg}_story.png"
        shoot(html, story)
        Image.open(story).crop(FEED).save(OUT / f"{seg}_feed.png")
        print(seg)
    names = [n for n in SEGMENTS if (OUT / f"{n}_feed.png").exists()]
    w, h = 540, 675
    sheet = Image.new("RGB", (len(names) * w + (len(names) + 1) * 16, h + 32), "#DDE6E0")
    for i, n in enumerate(names):
        sheet.paste(Image.open(OUT / f"{n}_feed.png").resize((w, h), Image.LANCZOS), (16 + i * (w + 16), 16))
    sheet.save(OUT / "overview_feed.png")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
