"""Render the Meta (Facebook/Instagram) set for the click-to-WhatsApp campaign.

Roei rejected the first set (catalog cutouts piled on a light stage, small type) as
unprofessional (22.10.26) and picked two directions out of three mockups:
  A - the WhatsApp conversation itself: the customer sends a photo of the last order and
      Aroam answers with a quote whose rows show the products. The switch ad.
  B - a large statement over four tiles of real products, grouped the way Roei chose
      them. The office and factory ads, and the Page's opening post.
Writes the nine files verify_meta.py checks into marketing/meta/img/: the three ads in
feed 1080x1350 and story 1080x1920, the opening-post image, the cover and the profile.
"""
import json
import pathlib

from PIL import Image

from build import LOGO, data_uri, render

HERE = pathlib.Path(__file__).parent
OUT = HERE.parents[2] / "marketing" / "meta" / "img"
REPORT = HERE / "meta_scale_report.json"

FONTS = ('<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900'
         '&family=Assistant:wght@400;600;700;800&display=block" rel="stylesheet">')
# The WhatsApp glyph the site already uses (js/components.js, .switch-offer-btn).
WA = ('<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16 3C9.1 3 '
      '3.5 8.6 3.5 15.5c0 2.2.6 4.3 1.6 6.2L3.4 28l6.5-1.7c1.8 1 3.9 1.5 6.1 1.5 6.9 0 '
      '12.5-5.6 12.5-12.5S22.9 3 16 3zm0 22.7c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-3.9 1 1-3.8-.2'
      '-.4c-1-1.6-1.5-3.5-1.5-5.4C5.7 9.8 10.3 5.2 16 5.2s10.3 4.6 10.3 10.3S21.7 25.7 16 '
      '25.7z"/></svg>')
TICKS = ('<svg class="ticks" viewBox="0 0 18 11" aria-hidden="true"><path d="M1 6l3.2 3.2L11 2" '
         'fill="none" stroke="#53BDEB" stroke-width="1.8" stroke-linecap="round"/><path d="M7 9.2'
         'L14 2" fill="none" stroke="#53BDEB" stroke-width="1.8" stroke-linecap="round"/></svg>')
HEAD = '<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">' + FONTS + '<style>'
BASE = """*{margin:0;padding:0;box-sizing:border-box}
html,body{width:@@W@@px;height:@@H@@px;overflow:hidden}"""

# Meta lays its own UI over the top and bottom ~250px of a story, so story layouts start
# their content at 290 and keep text and logos above 1670.
SIZES = {"feed": (1080, 1350), "story": (1080, 1920)}


def photo(name):
    return data_uri(HERE / "prepped" / f"{name}.png")


def native(name):
    with Image.open(HERE / "prepped" / f"{name}.png") as im:
        return im.size


def fill(template, **values):
    for key, value in values.items():
        template = template.replace(f"@@{key.upper()}@@", str(value))
    left = template.find("@@")
    assert left < 0, f"unfilled token near {template[left:left + 30]!r}"
    return template


# --- A: the conversation ---------------------------------------------------------------

# The order in the customer's photo and the rows of the quote are the same four products,
# from the ones Roei picked, so the quote can show their real photos.
ORDER = [("נייר טואלט ג׳מבו", "12", "jumbo_tp"), ("גליל תעשייתי 5012", "6", "p5012"),
         ("כוסות נייר", "20", "cup_paper"), ("כפפות ניטריל", "10", "gloves")]

A_SIZES = {
    "feed": dict(pad="66px 76px 0", logo_w=160, h1_fs=74, h1_mt=44, chat_mt=40, msg_w=620,
                 in_w=640, photo_h=244, row_fs=22, sheet_h_fs=25, cap_fs=28, who_fs=23,
                 doc_fs=24, li_fs=24, th_w=60, th_h=46, p_fs=28, foot_fs=27, foot_bottom=56),
    "story": dict(pad="290px 76px 0", logo_w=176, h1_fs=84, h1_mt=50, chat_mt=70, msg_w=720,
                  in_w=740, photo_h=300, row_fs=26, sheet_h_fs=29, cap_fs=31, who_fs=26,
                  doc_fs=27, li_fs=28, th_w=74, th_h=56, p_fs=31, foot_fs=29, foot_bottom=290),
}

A = HEAD + BASE + """
.c{position:relative;width:@@W@@px;height:@@H@@px;overflow:hidden;font-family:Heebo,sans-serif;
  color:#fff;padding:@@PAD@@;
  background:radial-gradient(85% 55% at 88% 0%,#2E7352 0%,rgba(46,115,82,0) 72%),
             linear-gradient(172deg,#1E4B38 0%,#15392A 100%)}
.top{display:flex;align-items:center;justify-content:space-between}
.logo{width:@@LOGO_W@@px;display:block}
.chip{font-weight:500;font-size:26px;color:#D5ECDD;border:2px solid rgba(143,214,163,.5);
  border-radius:40px;padding:8px 24px}
h1{font-weight:800;font-size:@@H1_FS@@px;line-height:1.08;letter-spacing:-1.5px;margin-top:@@H1_MT@@px}
h1 span{display:block;color:#8FD6A3}
.chat{margin-top:@@CHAT_MT@@px}
.msg{position:relative;width:@@MSG_W@@px;border-radius:28px;padding:14px;color:#111B21;
  box-shadow:0 22px 48px rgba(0,0,0,.30)}
.out{background:#D9FDD3;margin-right:auto;border-top-left-radius:8px}
.in{background:#fff;margin-left:auto;margin-top:24px;border-top-right-radius:8px;padding:16px 18px 18px;width:@@IN_W@@px}
.photo{height:@@PHOTO_H@@px;border-radius:18px;overflow:hidden;position:relative;
  background:linear-gradient(160deg,#B9BFB7 0%,#8F978E 100%)}
.sheet{position:absolute;left:62px;right:62px;top:22px;bottom:-40px;background:#FCFCF9;
  transform:rotate(-3.5deg);box-shadow:0 10px 26px rgba(0,0,0,.35);padding:20px 32px;
  font-family:Assistant,sans-serif;color:#26302A}
.sheet .h{font-weight:800;font-size:@@SHEET_H_FS@@px;border-bottom:2px solid #26302A;padding-bottom:6px;margin-bottom:6px}
.row{display:flex;justify-content:space-between;font-size:@@ROW_FS@@px;padding:4px 0;border-bottom:1px dashed #B8BDB6}
.row b{font-weight:700}
.photo:after{content:"";position:absolute;inset:0;
  background:radial-gradient(120% 90% at 30% 20%,rgba(255,255,255,.18) 0%,rgba(0,0,0,.18) 100%)}
.cap{font-size:@@CAP_FS@@px;font-weight:500;padding:12px 8px 2px;display:flex;align-items:flex-end;gap:10px}
.ticks{width:26px;height:16px;flex:none;margin-right:auto}
.who{font-weight:700;font-size:@@WHO_FS@@px;color:#1A7F55;margin-bottom:10px}
.doc{border:1px solid #E3E6E8;border-radius:14px;overflow:hidden;background:#fff}
.doc-h{background:#1A4231;color:#fff;display:flex;align-items:center;justify-content:space-between;
  padding:10px 18px;font-weight:700;font-size:@@DOC_FS@@px}
.doc-h img{width:62px;display:block}
.li{display:flex;align-items:center;gap:16px;padding:6px 18px;border-top:1px solid #EEF1F2;font-size:@@LI_FS@@px}
.li:nth-child(odd){background:#F6F9F7}
.li .th{width:@@TH_W@@px;height:@@TH_H@@px;display:flex;align-items:center;justify-content:center;flex:none}
.li .th img{max-width:@@TH_W@@px;max-height:@@TH_H@@px}
.li span{flex:1}
.li b{font-weight:700;color:#1A4231}
.in p{font-size:@@P_FS@@px;font-weight:500;margin-top:12px}
.foot{position:absolute;left:76px;right:76px;bottom:@@FOOT_BOTTOM@@px;font-size:@@FOOT_FS@@px;font-weight:500;
  color:#CFE6D7;display:flex;justify-content:space-between}
</style></head><body><div class="c">
  <div class="top"><img class="logo" src="@@LOGO@@"><span class="chip">לעסקים ומוסדות</span></div>
  <h1>שלחו צילום של ההזמנה.<span>נחזיר הצעה מתחרה.</span></h1>
  <div class="chat">
    <div class="msg out">
      <div class="photo"><div class="sheet"><div class="h">הזמנה חודשית</div>@@ROWS@@</div></div>
      <div class="cap">זאת ההזמנה הקבועה שלנו. אפשר הצעה?@@TICKS@@</div>
    </div>
    <div class="msg in">
      <div class="who">אהרוני שיווק והפצה</div>
      <div class="doc"><div class="doc-h"><span>הצעת מחיר</span><img src="@@LOGO@@"></div>@@LINES@@</div>
      <p>מצורפת הצעה מתחרה על אותם מוצרים.</p>
    </div>
  </div>
  <div class="foot"><span>מעל 20 שנה ספק לעסקים במרכז</span><span>מיבנה ועד רעננה</span></div>
</div></body></html>"""


def page_a(fmt):
    s = A_SIZES[fmt]
    rows = "".join(f'<div class="row"><span>{n}</span><b>{q}</b></div>' for n, q, _ in ORDER)
    lines = "".join(f'<div class="li"><div class="th"><img src="{photo(img)}"></div>'
                    f'<span>{n}</span><b>{q}</b></div>' for n, q, img in ORDER)
    scales = {}
    for _, _, img in ORDER:
        w, h = native(img)
        scales[img] = {"scale": round(min(1.0, s["th_w"] / w, s["th_h"] / h), 3)}
    w, h = SIZES[fmt]
    return fill(A, w=w, h=h, logo=data_uri(LOGO), ticks=TICKS, rows=rows, lines=lines, **s), scales


# --- B: the statement over product tiles ------------------------------------------------

# Each tile is a small group of products at a target height in px. Roei chose the
# groups (22.10.26): paper - 5012, compact 50, jumbo; disposables (instead of the coffee
# corner) - paper cups, rigid spoon, plate, 500ml cup; office - copy paper, pens,
# binders; cleaning - one Sano and one Yaakobi product, gloves, long wipes in a bucket;
# bags - with the two services he wants shown, made to size and branded.
PAPER = [("p5012", 150), ("compact50", 125), ("jumbo_tp", 100)]
DISPOSABLES = [("plate", 120), ("cup500", 150), ("cup_paper", 125), ("spoon", 140)]
OFFICE = [("binder", 200), ("a4", 185), ("pens", 115)]
CLEANING = [("jet", 180), ("kh7", 195), ("wipes", 150), ("gloves", 85)]
BAGS = [("bags_trash", 170), ("bags_vest", 180), ("bags_branded", 180), ("bags_custom", 140)]
WHATSAPP_CTA = WA + "שלחו הודעה בוואטסאפ"

B_ADS = {
    "office": dict(
        h1="ספק אחד.", h2="כל מה שהמשרד צריך.",
        lead="נייר, חד פעמי, ניקיון וציוד משרדי — הכל בהזמנה אחת.",
        tiles=[(PAPER, "נייר וטואלט"), (DISPOSABLES, "חד פעמי"),
               (OFFICE, "ציוד משרדי"), (CLEANING, "ניקיון")],
        cta=WHATSAPP_CTA, aside="מיבנה ועד רעננה"),
    "factory": dict(
        h1="אספקה קבועה.", h2="למפעלים ולמחסנים.",
        lead="נייר תעשייתי, שקיות, חומרי ניקוי וחד פעמי — מספק אחד.",
        tiles=[([("p5012", 155), ("gold", 145), ("jumbo_tp", 100)], "נייר תעשייתי וטואלט"),
               (CLEANING, "ניקיון"),
               (BAGS, "שקיות", "גם לפי מידה וממותגות"),
               (DISPOSABLES, "חד פעמי לחדר האוכל")],
        cta=WHATSAPP_CTA, aside="מיבנה ועד רעננה"),
    # The Page's opening post ("מי אנחנו") - organic, so the pill points at the site.
    "brand": dict(
        h1="ספק אחד.", h2="לכל מה שהעסק צריך.",
        lead="נייר, ניקיון, שקיות וציוד משרדי — מיבנה ועד רעננה.",
        tiles=[(PAPER, "נייר וטואלט"), (CLEANING, "ניקיון"),
               (BAGS, "שקיות", "גם לפי מידה וממותגות"), (OFFICE, "ציוד משרדי")],
        cta="aroam.co.il", aside="052-6000158"),
}

B_SIZES = {
    "feed": dict(pad="66px 76px 0", h1_fs=84, h1_mt=40, lead_fs=31, grid_mt=34, ph=224,
                 band_h=162, band_pad="0 76px", band_align="center"),
    # The band runs to the bottom edge, but its content sits in the top 150px of it -
    # the bottom 250px belong to Meta's own story UI.
    "story": dict(pad="290px 76px 0", h1_fs=92, h1_mt=50, lead_fs=33, grid_mt=44, ph=270,
                  band_h=400, band_pad="44px 76px 0", band_align="flex-start"),
}
OVERLAP = 22     # px each product tucks under its neighbour
GROUP_W = 400    # usable width of a tile's photo area

B = HEAD + BASE + """
.c{position:relative;width:@@W@@px;height:@@H@@px;overflow:hidden;font-family:Heebo,sans-serif;
  background:#F3F7F4;color:#1A4231;padding:@@PAD@@}
.top{display:flex;align-items:center;justify-content:space-between}
.logo{width:160px;display:block}
.chip{font-weight:500;font-size:26px;color:#1A4231;background:#E2EFE6;border-radius:40px;padding:9px 24px}
h1{font-weight:900;font-size:@@H1_FS@@px;line-height:1.02;letter-spacing:-2px;margin-top:@@H1_MT@@px}
h1 span{display:block;color:#639C7D}
.lead{font-size:@@LEAD_FS@@px;font-weight:500;line-height:1.4;color:#3B5547;margin-top:18px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:@@GRID_MT@@px}
.tile{background:#fff;border-radius:26px;padding:14px 18px 16px;display:flex;flex-direction:column;
  align-items:center;box-shadow:0 2px 0 #E1EAE4,0 14px 30px rgba(26,66,49,.07)}
.ph{height:@@PH@@px;width:100%;display:flex;align-items:flex-end;justify-content:center;padding-bottom:14px;
  background:radial-gradient(60% 55% at 50% 70%,#EEF4F0 0%,#fff 100%);border-radius:18px}
.ph img{display:block;filter:drop-shadow(0 8px 10px rgba(14,32,54,.18))}
.ph img + img{margin-inline-start:-@@OVERLAP@@px}
.tile span{font-weight:700;font-size:32px;margin-top:10px}
.tile small{font-weight:500;font-size:22px;color:#4A6B5A;margin-top:2px}
.band{position:absolute;left:0;right:0;bottom:0;height:@@BAND_H@@px;background:#1A4231;
  display:flex;align-items:@@BAND_ALIGN@@;justify-content:space-between;padding:@@BAND_PAD@@}
.cta{display:inline-flex;align-items:center;gap:14px;background:#8FD6A3;color:#1A4231;
  font-weight:800;font-size:34px;padding:16px 32px;border-radius:60px}
.cta svg{width:38px;height:38px}
.band small{font-size:27px;font-weight:500;color:#CFE6D7;padding-top:18px}
</style></head><body><div class="c">
  <div class="top"><img class="logo" src="@@LOGO@@"><span class="chip">מעל 20 שנה · לעסקים ומוסדות</span></div>
  <h1>@@H1@@<span>@@H2@@</span></h1>
  <div class="lead">@@LEAD@@</div>
  <div class="grid">@@TILES@@</div>
  <div class="band"><span class="cta">@@CTA@@</span><small>@@ASIDE@@</small></div>
</div></body></html>"""


def group(products, width, overlap=OVERLAP):
    """A row of products at their target heights, scaled down together when the row is
    wider than `width`, so the proportions inside a group never change."""
    widths = [native(n)[0] * h / native(n)[1] for n, h in products]
    k = min(1.0, (width + overlap * (len(products) - 1)) / sum(widths))
    html = "".join(f'<img src="{photo(n)}" style="height:{h * k:.0f}px">' for n, h in products)
    scales = {n: {"scale": round(h * k / native(n)[1], 3)} for n, h in products}
    return html, scales


def tiles(spec):
    """spec items are (group, label) or (group, label, sublabel)."""
    out, scales = [], {}
    for products, label, *sub in spec:
        imgs, s = group(products, GROUP_W)
        scales.update(s)
        small = f"<small>{sub[0]}</small>" if sub else ""
        out.append(f'<div class="tile"><div class="ph">{imgs}</div><span>{label}</span>{small}</div>')
    return "".join(out), scales


def page_b(name, fmt):
    ad = B_ADS[name]
    html, scales = tiles(ad["tiles"])
    w, h = SIZES[fmt]
    return fill(B, w=w, h=h, logo=data_uri(LOGO), overlap=OVERLAP, h1=ad["h1"], h2=ad["h2"],
                lead=ad["lead"], tiles=html, cta=ad["cta"], aside=ad["aside"],
                **B_SIZES[fmt]), scales


# --- Page assets ------------------------------------------------------------------------

# Desktop shows the whole 1640px cover; phones show only the centre ~1100px, so the
# statement and the products both sit inside x=270..1370.
COVER_MIX = [("p5012", 150), ("jet", 175), ("kh7", 185), ("a4", 165), ("cup500", 130),
             ("bags_branded", 170)]
COVER = HEAD + BASE + """
.c{position:relative;width:1640px;height:624px;overflow:hidden;font-family:Heebo,sans-serif;
  background:#F3F7F4;color:#1A4231}
.txt{position:absolute;right:270px;top:0;bottom:0;width:520px;display:flex;flex-direction:column;
  justify-content:center}
.logo{width:150px;display:block;margin-bottom:22px}
h1{font-weight:900;font-size:50px;line-height:1.06;letter-spacing:-1.2px}
h1 span{display:block;color:#639C7D}
.sub{font-size:25px;font-weight:500;color:#3B5547;margin-top:16px}
.card{position:absolute;left:270px;top:162px;width:540px;height:300px;background:#fff;border-radius:28px;
  box-shadow:0 2px 0 #E1EAE4,0 18px 40px rgba(26,66,49,.08);display:flex;align-items:flex-end;
  justify-content:center;padding:0 24px 34px}
.card img{display:block;filter:drop-shadow(0 8px 10px rgba(14,32,54,.18))}
.card img + img{margin-inline-start:-18px}
</style></head><body><div class="c">
  <div class="txt">
    <img class="logo" src="@@LOGO@@">
    <h1>ספק אחד<span>לכל מה שהעסק צריך.</span></h1>
    <div class="sub">נייר · חד פעמי · ניקיון · שקיות · ציוד משרדי</div>
  </div>
  <div class="card">@@GROUP@@</div>
</div></body></html>"""

PROFILE = """<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}
html,body{width:720px;height:720px;overflow:hidden;background:#fff}
.c{width:720px;height:720px;display:flex;align-items:center;justify-content:center}
.c img{width:470px;display:block}
</style></head><body><div class="c"><img src="@@LOGO@@"></div></body></html>"""
# Facebook crops the profile picture to a circle; at 470px wide the logo's corners stay
# ~276px from the centre, well inside the 360px radius.


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {}

    def shoot(html, name, w, h, scales):
        # wait_ms: Heebo and Assistant come from Google Fonts and land after the load event.
        render(html, OUT / name, w, h, wait_ms=8000)
        report[name] = scales
        print(f"{name:20s} {w}x{h}")

    for fmt, (w, h) in SIZES.items():
        html, scales = page_a(fmt)
        shoot(html, f"switch_{fmt}.png", w, h, scales)
        for name in ("office", "factory"):
            html, scales = page_b(name, fmt)
            shoot(html, f"{name}_{fmt}.png", w, h, scales)
    html, scales = page_b("brand", "feed")
    shoot(html, "brand_feed.png", 1080, 1350, scales)

    mix, scales = group(COVER_MIX, 492, overlap=18)
    shoot(fill(COVER, w=1640, h=624, logo=data_uri(LOGO), group=mix), "cover.png", 1640, 624, scales)
    shoot(fill(PROFILE, logo=data_uri(LOGO)), "profile.png", 720, 720, {})
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
