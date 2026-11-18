"""The segment ads, back to the several-product layout (17.11.26).

Roei on the split single-product ads (final_v3): "really bad that it's only one product -
the earlier design was better - but edit the product photos so they look better (the edges
are dark compared to the centre)". So this is meta_v4's layout (drafts_v3: two own-label
products on a light card, the segment's everyday supplies below) with his earlier notes on
it still applied - no "20" sticker, no magnifier - and every product photo relit by
relight.py (prepped/<name>_lit.png), the hand towels and 5012 from their 2000px sources.
"Over 20 years" stays as words in the lead; a small tag on the card names the label.

Writes into marketing/meta/drafts_v6/.
"""
import pathlib
import sys

from PIL import Image

from build import LOGO, data_uri
from meta import BASE, HEAD, fill, native, photo
from meta_v2 import BAND, H, W, shoot
from meta_v4 import CSS as V4_CSS

HERE = pathlib.Path(__file__).parent
OUT = HERE.parents[2] / "marketing" / "meta" / "drafts_v6"
FEED = (0, 285, W, 285 + 1350)
CARD_W, BASE_Y, GAP = 928, 506, 28
YEARS = "ספק לעסקים ומוסדות כבר מעל 20 שנה."

SEGMENTS = {
    "office": dict(
        chip="למשרדים", h1="המשרד שלכם.", h2="המגבות שלנו.",
        lead="מגבות נייר ומטליות לחות עם התווית של אהרוני, ולצדן כל מה שהמשרד צורך. " + YEARS,
        hero=[("rolls2_hi_lit", 380), ("wipes_lit", 380)],
        strip=[("a4_lit", "נייר צילום"), ("cup_paper_lit", "כוסות"), ("jet_lit", "חומרי ניקוי"),
               ("compact50_lit", "נייר טואלט")]),
    "factory": dict(
        chip="למפעלים ולבתי מלאכה", h1="המפעל שלכם.", h2="הגליל שלנו.",
        lead="גליל 5012 וגליל GOLD עם התווית של אהרוני, ולצדם כל מה שהמפעל צורך. " + YEARS,
        hero=[("p5012_hi_lit", 400), ("gold_lit", 330)],
        strip=[("gloves_lit", "כפפות ניטריל"), ("bags_trash_lit", "שקיות אשפה"), ("kh7_lit", "מסיר שומנים"),
               ("squeegee_lit", "מגבים")]),
    "school": dict(
        chip="לגנים ולמוסדות חינוך", h1="הגן שלכם.", h2="המטליות שלנו.",
        lead="מטליות לחות ומגבות נייר עם התווית של אהרוני, ולצדן כל מה שהגן צורך. " + YEARS,
        hero=[("wipes_lit", 400), ("rolls2_hi_lit", 330)],
        strip=[("compact50_lit", "נייר טואלט"), ("cup_paper_lit", "כוסות"), ("plate_lit", "צלחות"),
               ("bags_trash_lit", "שקיות אשפה")]),
}

CSS = V4_CSS + """
.lead{left:76px}
.hero{position:absolute;display:block;filter:drop-shadow(0 14px 18px rgba(14,32,54,.18))}
.shade{position:absolute;height:30px;border-radius:50%;filter:blur(6px);
  background:radial-gradient(50% 50% at 50% 50%,rgba(26,66,49,.32),rgba(26,66,49,.10) 55%,transparent 75%)}
.label-tag{position:absolute;right:28px;top:26px;font-weight:700;font-size:25px;color:#1A4231;
  background:#E2EFE6;border-radius:30px;padding:7px 20px}
"""


def hero(s):
    sizes = [(n, native(n)[0] * h / native(n)[1], h) for n, h in s["hero"]]
    room = CARD_W - 80 - GAP * (len(sizes) - 1)
    k = min(1.0, room / sum(w for _, w, _ in sizes))
    total = sum(w for _, w, _ in sizes) * k + GAP * (len(sizes) - 1)
    x = (CARD_W + total) / 2          # right to left, centred on the card
    parts = []
    for n, w, h in sizes:
        w, h = w * k, h * k
        x -= w
        parts.append(f'<div class="shade" style="left:{x + w * .06:.0f}px;width:{w * .88:.0f}px;top:{BASE_Y - 16:.0f}px"></div>')
        parts.append(f'<img class="hero" src="{photo(n)}" style="left:{x:.0f}px;top:{BASE_Y - h:.0f}px;height:{h:.0f}px">')
        x -= GAP
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
    {hero(s)}
    <span class="label-tag">עם התווית של אהרוני</span>
  </div>
  <div class="strip"><b>וגם:</b>{strip}</div>
  {BAND}
</div>"""
    page = HEAD + BASE + CSS.replace("@@LD@@", "270") + "</style></head><body>" + body + "</body></html>"
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
    w, h = 540, 675
    sheet = Image.new("RGB", (3 * w + 4 * 16, h + 32), "#C9D6CE")
    for i, seg in enumerate(SEGMENTS):
        sheet.paste(Image.open(OUT / f"{seg}_feed.png").resize((w, h), Image.LANCZOS), (16 + i * (w + 16), 16))
    sheet.save(OUT / "overview_feed.png")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
