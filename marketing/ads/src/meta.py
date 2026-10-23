"""Render the Meta (Facebook/Instagram) set for the click-to-WhatsApp campaign.

All of it is in the direction Roei chose (22.10.26): a large statement over four white
tiles of real product photos - a product group or a single named product in each.
The first ad was a WhatsApp-conversation mockup around "send us your last order"; the
business owner turned the offer itself down (23.10), and it became the branded-bags ad.
A single wide hero card was tried for it and left most of the card empty: the bag photos
are small, and enlarging them past their native size blurs them.
The Page's posts share the ads' colours and type but not their content - a Page that only
repeats its ads reads as if it exists for advertising. Roei turned down one post per
category (23.10.26); after a review of competitors' Pages he chose two of three drafts
(marketing/meta/drafts): one order in a single scene, and the list an office runs out of.
Posts from his own warehouse photos follow when he takes them.
Writes the ten files verify_meta.py checks into marketing/meta/img/.
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


# Product groups at a target height in px. Roei chose them (22.10.26): paper - 5012,
# compact 50, jumbo; disposables (instead of the coffee corner) - paper cups, rigid
# spoon, plate, 500ml cup; office - copy paper, pens, binders; cleaning - one Sano and
# one Yaakobi product, gloves, long wipes in a bucket; bags - with the two services he
# wants shown, made to size and branded.
PAPER = [("p5012", 150), ("compact50", 125), ("jumbo_tp", 100)]
DISPOSABLES = [("plate", 120), ("cup500", 150), ("cup_paper", 125), ("spoon", 140)]
OFFICE = [("binder", 200), ("a4", 185), ("pens", 115)]
CLEANING = [("jet", 180), ("kh7", 195), ("wipes", 150), ("gloves", 85)]
BAGS = [("bags_trash", 170), ("bags_vest", 180), ("bags_branded", 180), ("bags_custom", 140)]
WHATSAPP_CTA = WA + "שלחו הודעה בוואטסאפ"
ADS_BAND = dict(cta=WHATSAPP_CTA, aside="מיבנה ועד רעננה")

PAGES = {
    # --- the three ads ---
    # The branded bag stands next to the same bag unprinted, which is the service shown.
    "bags": dict(
        h1="שקיות ממותגות.", h2="עם הלוגו של העסק.",
        lead="גופייה ממותגות, שקיות לפי מידה ושקיות אשפה — מספק אחד.",
        tiles=[([("bags_branded", 200)], "עם הלוגו שלכם"), ([("bags_vest", 200)], "גופייה HD ו-LD"),
               ([("bags_custom", 170)], "לפי מידה ועובי"), ([("bags_trash", 200)], "שקיות אשפה")],
        **ADS_BAND),
    "office": dict(
        h1="ספק אחד.", h2="כל מה שהמשרד צריך.",
        lead="נייר, חד פעמי, ניקיון וציוד משרדי — הכל בהזמנה אחת.",
        tiles=[(PAPER, "נייר וטואלט"), (DISPOSABLES, "חד פעמי"),
               (OFFICE, "ציוד משרדי"), (CLEANING, "ניקיון")],
        **ADS_BAND),
    "factory": dict(
        h1="אספקה קבועה.", h2="למפעלים ולמחסנים.",
        lead="נייר תעשייתי, שקיות, חומרי ניקוי וחד פעמי — מספק אחד.",
        tiles=[([("p5012", 155), ("gold", 145), ("jumbo_tp", 100)], "נייר תעשייתי וטואלט"),
               (CLEANING, "ניקיון"),
               (BAGS, "שקיות", "גם לפי מידה וממותגות"),
               (DISPOSABLES, "חד פעמי לחדר האוכל")],
        **ADS_BAND),
}
ADS = ("bags", "office", "factory")

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
  @@CONTENT@@
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
    return f'<div class="grid">{"".join(out)}</div>', scales


def page(name, fmt):
    p = PAGES[name]
    content, scales = tiles(p["tiles"])
    w, h = SIZES[fmt]
    return fill(B, w=w, h=h, logo=data_uri(LOGO), overlap=OVERLAP, h1=p["h1"], h2=p["h2"],
                lead=p["lead"], content=content, cta=p["cta"], aside=p["aside"],
                **B_SIZES[fmt]), scales


# --- the Page's posts -------------------------------------------------------------------

# The logo and the ads' chip, so a post from the Page reads as the same business.
POST_CSS = """
.top{position:absolute;top:64px;right:76px;left:76px;display:flex;align-items:center;
  justify-content:space-between}
.logo{width:150px;display:block}
.chip{font-weight:500;font-size:26px;color:#1A4231;background:#E2EFE6;border-radius:40px;padding:9px 24px}"""
POST_TOP = ('<div class="top"><img class="logo" src="@@LOGO@@">'
            '<span class="chip">מעל 20 שנה · לעסקים ומוסדות</span></div>')

# One order: every category in one scene at one real-world scale (px per cm), instead of
# a grid of categories. (name, height in cm, x of the item's centre, baseline y).
PPC = 8.6
BACK, FRONT = 1040, 1150
# The roll sits on the carton's top face, clear of the print on its front.
ON_CARTON = BACK - round(30 * PPC) + 28
ORDER = [
    ("a4", 29.7, 179, BACK), ("bags_trash", 26, 330, BACK), ("carton", 30, 585, BACK),
    ("p5012", 22, 585, ON_CARTON), ("jet", 30, 862, BACK), ("kh7", 28, 970, BACK),
    ("pens", 12, 205, FRONT), ("gloves", 12.5, 340, FRONT), ("cup_paper", 10, 478, FRONT),
    ("cup500", 14, 560, FRONT), ("wipes", 19, 690, FRONT), ("compact50", 11, 830, FRONT),
]
ORDER_POST = (HEAD + BASE + POST_CSS + """
.c{position:relative;width:@@W@@px;height:@@H@@px;overflow:hidden;font-family:Heebo,sans-serif;
  background:linear-gradient(#F3F7F4 0 62%,#E6EFE9 70% 100%);color:#1A4231}
.glow{position:absolute;left:50%;top:880px;width:1150px;height:420px;transform:translateX(-50%);
  background:radial-gradient(50% 50% at 50% 50%,rgba(255,255,255,.95),rgba(255,255,255,0))}
.txt{position:absolute;top:196px;right:76px;left:76px}
h1{font-weight:900;font-size:98px;line-height:1;letter-spacing:-2.5px}
h1 span{display:block;color:#639C7D}
.sub{font-size:33px;font-weight:500;line-height:1.4;color:#3B5547;margin-top:24px;max-width:840px;
  text-wrap:balance}
.p{position:absolute;display:block;filter:drop-shadow(0 10px 12px rgba(14,32,54,.16))}
.sh{position:absolute;height:22px;border-radius:50%;
  background:radial-gradient(50% 50% at 50% 50%,rgba(26,66,49,.30),rgba(26,66,49,0))}
.foot{position:absolute;left:76px;right:76px;bottom:52px;display:flex;justify-content:space-between;
  font-size:28px;font-weight:700;color:#1A4231}
.foot b{font-weight:500;color:#4A6B5A}
</style></head><body><div class="c">
  <div class="glow"></div>
  @@TOP@@
  <div class="txt">
    <h1>ככה נראית<span>הזמנה אחת.</span></h1>
    <div class="sub">נייר, חומרי ניקוי, חד פעמי, שקיות וציוד&nbsp;משרדי — מגיעים יחד, מספק&nbsp;אחד.</div>
  </div>
  @@ITEMS@@
  <div class="foot"><span>aroam.co.il</span><b>052-6000158 · מיבנה ועד רעננה</b></div>
</div></body></html>""").replace("@@TOP@@", POST_TOP)


def order_post():
    items, scales = [], {}
    # Paint from the highest baseline down, so nearer items cover the bottoms of the far
    # ones; each item's contact shadow goes in just before it.
    for name, cm, x, base in sorted(ORDER, key=lambda r: r[3]):
        nw, nh = native(name)
        h = cm * PPC
        w = nw * h / nh
        scales[name] = {"scale": round(h / nh, 3)}
        items.append(f'<div class="sh" style="left:{x - w * .48:.0f}px;width:{w * .96:.0f}px;'
                     f'top:{base - 12:.0f}px"></div>')
        items.append(f'<img class="p" src="{photo(name)}" style="left:{x - w / 2:.0f}px;'
                     f'top:{base - h:.0f}px;height:{h:.0f}px">')
    w, h = SIZES["feed"]
    return fill(ORDER_POST, w=w, h=h, logo=data_uri(LOGO), items="".join(items)), scales


# The list an office runs out of. Thumbnails, not a scene, so each fits the same box
# rather than sharing one scale.
LIST = [("נייר טואלט ומגבות ידיים", "compact50"), ("סבון ידיים וחומרי ניקוי", "jet"),
        ("כוסות, צלחות וסכו״ם", "cup500"), ("שקיות אשפה", "bags_trash"),
        ("נייר צילום ועטים", "a4"), ("כפפות ומגבונים", "gloves")]
THUMB = (124, 92)
CHECK = ('<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" '
         'stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>')
LIST_POST = (HEAD + BASE + POST_CSS + """
.c{position:relative;width:@@W@@px;height:@@H@@px;overflow:hidden;font-family:Heebo,sans-serif;
  background:#F3F7F4;color:#1A4231}
h1{position:absolute;top:190px;right:76px;left:76px;font-weight:900;font-size:90px;line-height:1;
  letter-spacing:-2.4px}
h1 span{color:#639C7D}
.sheet{position:absolute;top:330px;left:110px;right:110px;height:780px;background:#fff;border-radius:22px;
  transform:rotate(-1.6deg);box-shadow:0 2px 0 #E1EAE4,0 24px 50px rgba(26,66,49,.12);padding:84px 56px 0}
.clip{position:absolute;top:-26px;left:50%;width:220px;height:62px;transform:translateX(-50%);
  background:#1A4231;border-radius:16px}
.clip:after{content:"";position:absolute;left:50%;top:16px;width:90px;height:16px;transform:translateX(-50%);
  background:#F3F7F4;border-radius:10px}
.sheet h2{font-weight:800;font-size:40px;color:#1A4231}
.sheet h2 small{font-weight:500;font-size:26px;color:#6B8578;margin-inline-start:12px}
.row{display:flex;align-items:center;gap:22px;height:104px;border-bottom:2px solid #E6EEE9}
.ck{flex:none;width:52px;height:52px;border-radius:50%;background:#639C7D;display:flex;align-items:center;
  justify-content:center}
.ck svg{width:30px;height:30px}
.row span{flex:1;font-size:36px;font-weight:700}
.row .th{flex:none;width:130px;height:96px;display:flex;align-items:center;justify-content:center}
.row .th img{display:block;filter:drop-shadow(0 6px 8px rgba(14,32,54,.16))}
.end{position:absolute;left:76px;right:76px;bottom:64px;display:flex;align-items:center;
  justify-content:space-between}
.end b{font-size:40px;font-weight:900}
.cta{display:inline-flex;align-items:center;gap:12px;background:#1A4231;color:#fff;font-weight:800;
  font-size:29px;padding:15px 28px;border-radius:60px}
.cta svg{width:34px;height:34px;color:#8FD6A3}
</style></head><body><div class="c">
  @@TOP@@
  <h1>מה נגמר <span>החודש?</span></h1>
  <div class="sheet"><div class="clip"></div>
    <h2>רשימת הקניות של המשרד<small>הכל מספק אחד</small></h2>
    @@ROWS@@
  </div>
  <div class="end"><b>שלחו לנו את הרשימה.</b><span class="cta">@@WA@@052-6000158</span></div>
</div></body></html>""").replace("@@TOP@@", POST_TOP)


def checklist_post():
    rows, scales = [], {}
    for text, name in LIST:
        nw, nh = native(name)
        k = min(THUMB[0] / nw, THUMB[1] / nh)
        scales[name] = {"scale": round(k, 3)}
        rows.append(f'<div class="row"><div class="ck">{CHECK}</div><span>{text}</span>'
                    f'<div class="th"><img src="{photo(name)}" style="height:{round(nh * k)}px">'
                    f'</div></div>')
    w, h = SIZES["feed"]
    return fill(LIST_POST, w=w, h=h, logo=data_uri(LOGO), rows="".join(rows), wa=WA), scales


POSTS = {"post_order": order_post, "post_checklist": checklist_post}


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
        print(f"{name:22s} {w}x{h}")

    for fmt, (w, h) in SIZES.items():
        for name in ADS:
            html, scales = page(name, fmt)
            shoot(html, f"{name}_{fmt}.png", w, h, scales)
    for name, build_post in POSTS.items():
        html, scales = build_post()
        shoot(html, f"{name}.png", *SIZES["feed"], scales)

    mix, scales = group(COVER_MIX, 492, overlap=18)
    shoot(fill(COVER, w=1640, h=624, logo=data_uri(LOGO), group=mix), "cover.png", 1640, 624, scales)
    shoot(fill(PROFILE, logo=data_uri(LOGO)), "profile.png", 720, 720, {})
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
