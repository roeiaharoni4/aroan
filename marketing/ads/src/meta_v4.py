"""Segment ads on one message: our own brand, and more than 20 years (drafts, 17.11.26).

Roei liked the look of the October-November set but not its message, chose two new topics -
Aroam's own label and its 20 years - and asked to combine them, with one ad per segment:
offices, factories and workshops, kindergartens and schools.

Each ad: the segment in the headline ("X שלכם. Y שלנו." - yours, ours), the products that
really carry the Aroam label as the hero (5012, the 6 hand-towel rolls, GOLD, the wet-wipes
bucket), a magnifier on the actual label so the claim is visible rather than asserted, a
"20 years" seal, and a strip of the segment's everyday supplies. Same 9:16 frame and feed
crop as meta_v2/meta_final.

Writes into marketing/meta/drafts_v3/.
"""
import pathlib
import sys

from PIL import Image
from PIL import ImageOps

from build import LOGO, data_uri
from meta import BASE, HEAD, fill, native, photo
from meta_v2 import BAND, H, W, shoot

HERE = pathlib.Path(__file__).parent
OUT = HERE.parents[2] / "marketing" / "meta" / "drafts_v3"
FEED = (0, 285, W, 285 + 1350)

# Where the Aroam label sits in each prepped photo (px in the source image).
LABEL = {"p5012": (220, 257, 640, 546), "rolls2": (280, 245, 560, 428),
         "gold": (190, 212, 420, 380), "wipes": (200, 80, 365, 280)}

SEGMENTS = {
    "office": dict(
        chip="למשרדים", h1="המשרד שלכם.", h2="המגבות שלנו.",
        lead="מגבות נייר ומטליות לחות עם התווית של אהרוני, ולצדן כל מה שהמשרד צורך.",
        hero=[("rolls2", 300), ("wipes", 300)], loupe="rolls2",
        strip=[("a4", "נייר צילום"), ("cup_paper", "כוסות"), ("jet", "חומרי ניקוי"), ("compact50", "נייר טואלט")]),
    "factory": dict(
        chip="למפעלים ולבתי מלאכה", h1="המפעל שלכם.", h2="הגליל שלנו.",
        lead="גליל 5012 וגליל GOLD עם התווית של אהרוני, ולצדם כל מה שהמפעל צורך.",
        hero=[("p5012", 340), ("gold", 280)], loupe="p5012",
        strip=[("gloves", "כפפות ניטריל"), ("bags_trash", "שקיות אשפה"), ("kh7", "מסיר שומנים"), ("squeegee", "מגבים")]),
    "school": dict(
        chip="לגנים ולמוסדות חינוך", h1="הגן שלכם.", h2="המטליות שלנו.",
        lead="מטליות לחות ומגבות נייר עם התווית של אהרוני, ולצדן כל מה שהגן צורך.",
        hero=[("wipes", 360), ("rolls2", 260)], loupe="wipes",
        strip=[("compact50", "נייר טואלט"), ("cup_paper", "כוסות"), ("plate", "צלחות"), ("bags_trash", "שקיות אשפה")]),
}

LOUPE_D = 270
# The loupe floats this far above the label it magnifies, so it fills the card's empty top
# and its ribbon stays inside the card.
LIFT = 150
CARD_W, CARD_H, BASE_Y, GAP = 928, 560, 500, 24
CSS = """*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden}
.c{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:Heebo,sans-serif;
  background:#F3F7F4;color:#1A4231}
.top{position:absolute;top:298px;right:76px;left:76px;display:flex;align-items:center;justify-content:space-between}
.logo{width:160px;display:block}
.chip{font-weight:700;font-size:28px;color:#1A4231;background:#E2EFE6;border-radius:40px;padding:9px 26px}
h1{position:absolute;top:410px;right:76px;left:76px;font-weight:900;font-size:104px;line-height:1;letter-spacing:-3px}
h1 span{display:block;color:#639C7D}
.lead{position:absolute;top:640px;right:76px;left:300px;font-size:31px;font-weight:500;line-height:1.4;color:#3B5547}
.card{position:absolute;top:760px;left:76px;right:76px;height:560px;background:#fff;border-radius:28px;
  box-shadow:0 2px 0 #E1EAE4,0 18px 40px rgba(26,66,49,.10)}
.hero{position:absolute;display:block;filter:drop-shadow(0 12px 14px rgba(14,32,54,.20))}
.floor{position:absolute;left:0;right:0;bottom:0;height:120px;border-radius:0 0 28px 28px;
  background:linear-gradient(#fff,#EEF4F0)}
.loupe{position:absolute;width:@@LD@@px;height:@@LD@@px;border-radius:50%;
  border:8px solid #1A4231;background-color:#fff;background-repeat:no-repeat;
  box-shadow:0 14px 30px rgba(14,32,54,.25)}
.tag{position:absolute;transform:translateX(-50%);white-space:nowrap;font-weight:800;font-size:28px;
  color:#fff;background:#1A4231;border-radius:30px;padding:8px 22px}
.seal{position:absolute;left:84px;top:566px;width:200px;height:200px;border-radius:50%;background:#1A4231;
  color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(-8deg);
  box-shadow:0 0 0 6px #F3F7F4,0 0 0 9px #8FD6A3}
.seal small{font-size:26px;font-weight:700;color:#8FD6A3;line-height:1}
.seal b{font-size:96px;font-weight:900;line-height:.9;letter-spacing:-3px}
.seal span{font-size:30px;font-weight:800;line-height:1.1}
.strip{position:absolute;top:1346px;left:76px;right:76px;display:flex;align-items:flex-end;gap:16px}
.strip>b{flex:none;font-size:30px;font-weight:800;align-self:center;margin-inline-end:6px}
.it{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px}
.it .th{height:96px;display:flex;align-items:flex-end;justify-content:center}
.it img{display:block;max-height:96px;max-width:120px;filter:drop-shadow(0 6px 8px rgba(14,32,54,.16))}
.it span{font-size:23px;font-weight:600;color:#3B5547;white-space:nowrap}
.band{position:absolute;left:0;right:0;bottom:0;height:410px;background:#1A4231;display:flex;
  align-items:flex-start;justify-content:space-between;padding:22px 76px 0}
.cta{display:inline-flex;align-items:center;gap:14px;background:#8FD6A3;color:#1A4231;
  font-weight:800;font-size:34px;padding:16px 32px;border-radius:60px}
.cta svg{width:38px;height:38px}
.band small{font-size:27px;font-weight:500;color:#CFE6D7;padding-top:18px}
"""


def loupe_style(name):
    """Background that magnifies the label region into the loupe circle."""
    x0, y0, x1, y1 = LABEL[name]
    nw, nh = native(name)
    z = 0.92 * LOUPE_D / max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2 * z, (y0 + y1) / 2 * z
    return (f"background-image:url({photo(name)});background-size:{nw * z:.0f}px {nh * z:.0f}px;"
            f"background-position:{LOUPE_D / 2 - cx:.0f}px {LOUPE_D / 2 - cy:.0f}px")


def hero(seg):
    """Products placed right to left on the card's floor, scaled together to fit; the loupe
    sits on the chosen product's real label, magnifying it, with its tag underneath."""
    s = SEGMENTS[seg]
    sizes = [(n, native(n)[0] * h / native(n)[1], h) for n, h in s["hero"]]
    room = CARD_W - 80 - GAP * (len(sizes) - 1)
    k = min(1.0, room / sum(w for _, w, _ in sizes))
    x, parts, at = CARD_W - 40, [], None
    for n, w, h in sizes:
        w, h = w * k, h * k
        x -= w
        top = BASE_Y - h
        parts.append(f'<img class="hero" src="{photo(n)}" style="left:{x:.0f}px;top:{top:.0f}px;height:{h:.0f}px">')
        if n == s["loupe"]:
            x0, y0, x1, y1 = LABEL[n]
            sc = h / native(n)[1]
            at = (x + (x0 + x1) / 2 * sc, top + (y0 + y1) / 2 * sc)
        x -= GAP
    # Keep the whole loupe on the card, even when the label sits near the card's edge.
    lx = min(max(at[0], LOUPE_D / 2 + 24), CARD_W - LOUPE_D / 2 - 24)
    ly = at[1] - LIFT
    parts.append(f'<div class="loupe" style="left:{lx - LOUPE_D / 2:.0f}px;top:{ly - LOUPE_D / 2:.0f}px;'
                 f'{loupe_style(s["loupe"])}"></div>')
    parts.append(f'<div class="tag" style="left:{lx:.0f}px;top:{ly + LOUPE_D / 2 - 26:.0f}px">התווית של אהרוני</div>')
    return "".join(parts)


def ad(seg):
    s = SEGMENTS[seg]
    strip = "".join(f'<div class="it"><div class="th"><img src="{photo(n)}"></div><span>{label}</span></div>'
                    for n, label in s["strip"])
    body = f"""<div class="c">
  <div class="top"><img class="logo" src="@@LOGO@@"><span class="chip">{s["chip"]}</span></div>
  <h1>{s["h1"]}<span>{s["h2"]}</span></h1>
  <div class="lead">{s["lead"]}</div>
  <div class="card">
    <div class="floor"></div>
    {hero(seg)}
  </div>
  <div class="seal"><small>מעל</small><b>20</b><span>שנה</span></div>
  <div class="strip"><b>וגם:</b>{strip}</div>
  {BAND}
</div>"""
    page = HEAD + BASE + CSS.replace("@@LD@@", str(LOUPE_D)) + "</style></head><body>" + body + "</body></html>"
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


if __name__ == "__main__":
    main(set(sys.argv[1:]))
