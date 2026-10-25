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
He turned down the third, raw warehouse photos, and asked for two more designed posts
instead: how to order, and a map of where the orders go.
Writes the twelve files verify_meta.py checks into marketing/meta/img/.
"""
import json
import math
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
# Two numbers, each for its channel (Roei, 24.10.26): a number to call is the office line,
# and WhatsApp - where the ads lead - stays on his mobile.
PHONE = "03-6346236"
WHATSAPP = "052-6000158"

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
        # Hand towels in place of the GOLD roll (Roei, 25.10.26), so the label names them.
        tiles=[([("p5012", 155), ("rolls2", 130), ("jumbo_tp", 100)], "נייר תעשייתי, ניגוב וטואלט"),
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

# The logo and the ads' chip, so a post from the Page reads as the same business, and the
# two closing rows the posts share: the site and number, or a line and the WhatsApp pill.
POST_CSS = """
.top{position:absolute;top:64px;right:76px;left:76px;display:flex;align-items:center;
  justify-content:space-between}
.logo{width:150px;display:block}
.chip{font-weight:500;font-size:26px;color:#1A4231;background:#E2EFE6;border-radius:40px;padding:9px 24px}
.foot{position:absolute;left:76px;right:76px;bottom:52px;display:flex;justify-content:space-between;
  font-size:28px;font-weight:700;color:#1A4231}
.foot b{font-weight:500;color:#4A6B5A}
.end{position:absolute;left:76px;right:76px;bottom:64px;display:flex;align-items:center;
  justify-content:space-between}
.end b{font-size:40px;font-weight:900}
.cta{display:inline-flex;align-items:center;gap:12px;background:#1A4231;color:#fff;font-weight:800;
  font-size:29px;padding:15px 28px;border-radius:60px}
.cta svg{width:34px;height:34px;color:#8FD6A3}"""
POST_TOP = ('<div class="top"><img class="logo" src="@@LOGO@@">'
            '<span class="chip">מעל 20 שנה · לעסקים ומוסדות</span></div>')


def post_end(line):
    return f'<div class="end"><b>{line}</b><span class="cta">{WA}{WHATSAPP}</span></div>'


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
</style></head><body><div class="c">
  <div class="glow"></div>
  @@TOP@@
  <div class="txt">
    <h1>ככה נראית<span>הזמנה אחת.</span></h1>
    <div class="sub">נייר, חומרי ניקוי, חד פעמי, שקיות וציוד&nbsp;משרדי — מגיעים יחד, מספק&nbsp;אחד.</div>
  </div>
  @@ITEMS@@
  <div class="foot"><span>aroam.co.il</span><b>@@PHONE@@ · מיבנה ועד רעננה</b></div>
</div></body></html>""").replace("@@TOP@@", POST_TOP).replace("@@PHONE@@", PHONE)


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
</style></head><body><div class="c">
  @@TOP@@
  <h1>מה נגמר <span>החודש?</span></h1>
  <div class="sheet"><div class="clip"></div>
    <h2>רשימת הקניות של המשרד<small>הכל מספק אחד</small></h2>
    @@ROWS@@
  </div>
  @@END@@
</div></body></html>""").replace("@@TOP@@", POST_TOP).replace("@@END@@", post_end("שלחו לנו את הרשימה."))


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
    return fill(LIST_POST, w=w, h=h, logo=data_uri(LOGO), rows="".join(rows)), scales


# How to order, in the three steps it takes. Each step shows its own object - the message
# with its read ticks, Aroam's quote, the carton that arrives - rather than a generic icon.
STEPS = [("שולחים מה צריך", "בוואטסאפ, או מסמנים בקטלוג באתר", "message"),
         ("מקבלים הצעת מחיר", "על כל ההזמנה, מספק אחד", "quote"),
         ("ההזמנה מגיעה אליכם", "לעסקים ולמוסדות, מיבנה ועד רעננה", "carton")]
CARTON_W = 150
TICKS = ('<svg viewBox="0 0 22 14" fill="none" stroke="currentColor" stroke-width="2.2" '
         'stroke-linecap="round" stroke-linejoin="round"><path d="M1 8l4 4 8-9"/><path d="M10 12l8-9"/></svg>')
STEPS_POST = (HEAD + BASE + POST_CSS + """
.c{position:relative;width:@@W@@px;height:@@H@@px;overflow:hidden;font-family:Heebo,sans-serif;
  background:#F3F7F4;color:#1A4231}
h1{position:absolute;top:190px;right:76px;left:76px;font-weight:900;font-size:92px;line-height:1;
  letter-spacing:-2.4px}
h1 span{display:block;color:#639C7D}
.steps{position:absolute;top:426px;right:76px;left:76px;display:flex;flex-direction:column;gap:26px}
.steps:before{content:"";position:absolute;top:114px;bottom:114px;right:78px;border-right:4px dotted #8FD6A3}
.step{position:relative;height:228px;background:#fff;border-radius:26px;display:flex;align-items:center;
  gap:28px;padding:0 34px;box-shadow:0 2px 0 #E1EAE4,0 14px 30px rgba(26,66,49,.07)}
.num{flex:none;width:92px;height:92px;border-radius:50%;background:#1A4231;color:#fff;font-weight:900;
  font-size:50px;display:flex;align-items:center;justify-content:center}
.say{flex:1}
.say b{display:block;font-weight:800;font-size:44px;line-height:1.15}
.say span{display:block;font-weight:500;font-size:29px;color:#4A6B5A;margin-top:8px}
.vis{flex:none;width:170px;height:170px;border-radius:24px;background:#E2EFE6;display:flex;
  align-items:center;justify-content:center}
.vis img{display:block;filter:drop-shadow(0 8px 10px rgba(14,32,54,.18))}
.msg{position:relative;width:118px;height:88px;background:#fff;border-radius:18px 4px 18px 18px;
  transform:rotate(4deg);box-shadow:0 8px 16px rgba(14,32,54,.14);padding:17px 14px 0;display:flex;
  flex-direction:column;gap:9px}
.msg i{display:block;height:7px;border-radius:4px;background:#DCE8E0}
.msg i.short{margin-inline-end:40px}
.msg svg{position:absolute;left:12px;bottom:9px;width:22px;height:14px;color:#639C7D}
.doc{width:96px;height:124px;background:#fff;border-radius:8px;transform:rotate(-5deg);overflow:hidden;
  box-shadow:0 8px 16px rgba(14,32,54,.14);display:flex;flex-direction:column;gap:9px;padding-bottom:12px}
.doc i{display:block;height:7px;border-radius:4px;background:#DCE8E0;margin:0 12px}
.doc i.band{height:24px;border-radius:0;margin:0 0 4px;background:#1A4231}
.doc i.short{margin-inline-end:38px}
.doc i.total{margin-top:auto;margin-inline-start:42px;height:9px;background:#639C7D}
</style></head><body><div class="c">
  @@TOP@@
  <h1>איך מזמינים?<span>שלושה צעדים.</span></h1>
  <div class="steps">@@STEPS@@</div>
  @@END@@
</div></body></html>""").replace("@@TOP@@", POST_TOP).replace("@@END@@", post_end("מתחילים בהודעה אחת."))


def steps_post():
    visuals = {
        "message": f'<div class="msg"><i></i><i class="short"></i><i class="short"></i>{TICKS}</div>',
        "quote": ('<div class="doc"><i class="band"></i><i></i><i class="short"></i><i></i>'
                  '<i class="short"></i><i class="total"></i></div>'),
        "carton": f'<img src="{photo("carton")}" style="width:{CARTON_W}px">',
    }
    steps = "".join(f'<div class="step"><div class="num">{n}</div><div class="say"><b>{title}</b>'
                    f'<span>{sub}</span></div><div class="vis">{visuals[v]}</div></div>'
                    for n, (title, sub, v) in enumerate(STEPS, 1))
    w, h = SIZES["feed"]
    scales = {"carton": {"scale": round(CARTON_W / native("carton")[0], 3)}}
    return fill(STEPS_POST, w=w, h=h, logo=data_uri(LOGO), steps=steps), scales


# Where the orders go: the places the site names, from Yavne to Ra'anana, at their real
# positions, fanning out from Or Yehuda. Degrees map to px with longitude squeezed by
# cos(latitude); Ra'anana lands at y=60, Yavne at y=780 and Rosh HaAyin at x=760. The
# Gush Dan cities sit a few km apart, so each label's side is set by hand.
MAP_W, MAP_H = 928, 830
LAT_N, LON_W, PX_LAT = 32.2103, 34.5749, 2347.6
PX_LON = PX_LAT * math.cos(math.radians(32.03))
HUB = (32.0306, 34.8564)      # Or Yehuda
CITIES = [  # (name, lat, lon, label side, label nudge in px)
    ("רעננה", 32.1847, 34.8706, "e", 0), ("הרצליה", 32.1663, 34.8433, "w", 0),
    ("ראש העין", 32.0956, 34.9567, "e", 0), ("פתח תקווה", 32.0870, 34.8875, "s", 0),
    ("בני ברק", 32.0833, 34.8333, "n", 0), ("תל אביב", 32.0853, 34.7818, "n", 0),
    ("גבעתיים", 32.0722, 34.8125, "w", 0), ("רמת גן", 32.0700, 34.8236, "s", 0),
    ("קריית אונו", 32.0580, 34.8570, "e", -8), ("יהוד", 32.0333, 34.8911, "e", 0),
    ("בת ים", 32.0170, 34.7500, "w", 0), ("חולון", 32.0160, 34.7800, "s", 0),
    ("ראשון לציון", 31.9670, 34.8000, "e", 0), ("לוד", 31.9514, 34.8953, "e", 0),
    ("יבנה", 31.8781, 34.7383, "e", 0),
]
# The shoreline from Ashdod's edge north past Herzliya, close enough at this scale.
COAST = [(31.84, 34.660), (31.92, 34.692), (31.98, 34.731), (32.02, 34.741), (32.05, 34.749),
         (32.08, 34.766), (32.10, 34.773), (32.13, 34.787), (32.165, 34.796), (32.20, 34.807),
         (32.23, 34.815)]
LABEL_AT = {  # where each side's label box goes, relative to the dot
    "e": "left:{x:.0f}px;top:{y:.0f}px;transform:translate(14px,-50%)",
    "w": "left:{x:.0f}px;top:{y:.0f}px;transform:translate(calc(-100% - 14px),-50%)",
    "n": "left:{x:.0f}px;top:{y:.0f}px;transform:translate(-50%,calc(-100% - 12px))",
    "s": "left:{x:.0f}px;top:{y:.0f}px;transform:translate(-50%,12px)",
}
AREA_POST = (HEAD + BASE + POST_CSS + """
.c{position:relative;width:@@W@@px;height:@@H@@px;overflow:hidden;font-family:Heebo,sans-serif;
  background:#F3F7F4;color:#1A4231}
h1{position:absolute;top:186px;right:76px;left:76px;font-weight:900;font-size:88px;line-height:1;
  letter-spacing:-2.4px}
h1 span{color:#639C7D}
.sub{position:absolute;top:294px;right:76px;left:76px;font-size:32px;font-weight:500;color:#3B5547}
.map{position:absolute;top:372px;left:76px;width:@@MAP_W@@px;height:@@MAP_H@@px;border-radius:26px;
  overflow:hidden;background:#fff;box-shadow:0 2px 0 #E1EAE4,0 14px 30px rgba(26,66,49,.07)}
.map .base{position:absolute;inset:0}
.dot{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#639C7D;
  box-shadow:0 0 0 3px #fff,0 2px 6px rgba(14,32,54,.25)}
.lbl{position:absolute;white-space:nowrap;font-weight:700;font-size:25px;line-height:1;color:#1A4231;
  text-shadow:0 0 3px #fff,0 0 6px #fff,0 0 9px #fff}
.hub{text-align:center}
.hub b{display:block;font-weight:900;font-size:31px}
.hub small{display:block;font-weight:500;font-size:21px;color:#4A6B5A;margin-top:5px}
.pin{position:absolute;width:40px;height:52px;filter:drop-shadow(0 4px 6px rgba(14,32,54,.25))}
.sea{position:absolute;font-size:23px;font-weight:500;color:#5E8A74;letter-spacing:.5px}
</style></head><body><div class="c">
  @@TOP@@
  <h1>מיבנה <span>ועד רעננה.</span></h1>
  <div class="sub">אספקה לעסקים ומוסדות בכל המרכז.</div>
  <div class="map">@@MAP@@</div>
  <div class="foot"><span>aroam.co.il</span><b>להזמנות: @@PHONE@@</b></div>
</div></body></html>""").replace("@@TOP@@", POST_TOP).replace("@@PHONE@@", PHONE)


def project(lat, lon):
    return (lon - LON_W) * PX_LON, (LAT_N - lat) * PX_LAT


def smooth(points):
    """Path commands through the points as one curve (Catmull-Rom as cubic Beziers), so the
    coast bends instead of kinking at every sample."""
    pts = [points[0]] + points + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        (x0, y0), (x1, y1), (x2, y2), (x3, y3) = pts[i - 1:i + 3]
        out.append(f"C{x1 + (x2 - x0) / 6:.1f} {y1 + (y2 - y0) / 6:.1f} "
                   f"{x2 - (x3 - x1) / 6:.1f} {y2 - (y3 - y1) / 6:.1f} {x2:.1f} {y2:.1f}")
    return " ".join(out)


def area_post():
    hx, hy = project(*HUB)
    coast = [project(*p) for p in COAST]
    (sx, sy), (ex, ey) = coast[0], coast[-1]
    shapes = [f'<path d="M-20 {sy:.1f} L{sx:.1f} {sy:.1f} {smooth(coast)} L-20 {ey:.1f}Z" '
              'fill="#D7EAE1" stroke="#B7D5C5" stroke-width="3"/>']
    # Routes out of Or Yehuda, each bowed a little to one side so they read as deliveries.
    for _, lat, lon, _, _ in CITIES:
        x, y = project(lat, lon)
        mx, my = (hx + x) / 2, (hy + y) / 2
        cx, cy = mx + (y - hy) * .12, my - (x - hx) * .12
        shapes.append(f'<path d="M{hx:.1f} {hy:.1f}Q{cx:.1f} {cy:.1f} {x:.1f} {y:.1f}" fill="none" '
                      f'stroke="#9FCFB3" stroke-width="3" stroke-dasharray="1 8" stroke-linecap="round"/>')
    parts = [f'<svg class="base" viewBox="0 0 {MAP_W} {MAP_H}" width="{MAP_W}" height="{MAP_H}">'
             f'{"".join(shapes)}</svg>',
             '<div class="sea" style="left:52px;top:668px">הים התיכון</div>']
    for name, lat, lon, side, nudge in CITIES:
        x, y = project(lat, lon)
        parts.append(f'<div class="dot" style="left:{x:.0f}px;top:{y:.0f}px"></div>')
        parts.append(f'<div class="lbl" style="{LABEL_AT[side].format(x=x, y=y + nudge)}">{name}</div>')
    parts.append(f'<svg class="pin" viewBox="0 0 40 52" style="left:{hx - 20:.0f}px;top:{hy - 50:.0f}px">'
                 '<path d="M20 51C20 51 4 31 4 19a16 16 0 0 1 32 0c0 12-16 32-16 32z" fill="#1A4231"/>'
                 '<circle cx="20" cy="19" r="6.5" fill="#fff"/></svg>')
    parts.append(f'<div class="lbl hub" style="{LABEL_AT["s"].format(x=hx, y=hy)}">'
                 '<b>אור יהודה</b><small>אנחנו כאן</small></div>')
    w, h = SIZES["feed"]
    return fill(AREA_POST, w=w, h=h, logo=data_uri(LOGO), map_w=MAP_W, map_h=MAP_H,
                map="".join(parts)), {}


POSTS = {"post_order": order_post, "post_checklist": checklist_post,
         "post_steps": steps_post, "post_area": area_post}


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
