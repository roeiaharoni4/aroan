"""Three direction drafts for the Page's posts, to choose from before building a set.

Roei turned down one post per category (23.10.26) and asked what competitors do. Their
Pages post a mixed product family in one scene, real photos with little or no text on
the image, and lists of what a business runs out of - not a brochure per category.
The drafts follow those three, in the brand's colours, and are not the final set.
"""
import pathlib

from PIL import Image

from build import LOGO, data_uri, render

HERE = pathlib.Path(__file__).parent
OUT = HERE.parents[2] / "marketing" / "meta" / "drafts"
W, H = 1080, 1350

FONTS = ('<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900'
         '&display=block" rel="stylesheet">')
HEAD = ('<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">' + FONTS +
        '<style>*{margin:0;padding:0;box-sizing:border-box}'
        f'html,body{{width:{W}px;height:{H}px;overflow:hidden}}')
WA = ('<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16 3C9.1 3 '
      '3.5 8.6 3.5 15.5c0 2.2.6 4.3 1.6 6.2L3.4 28l6.5-1.7c1.8 1 3.9 1.5 6.1 1.5 6.9 0 '
      '12.5-5.6 12.5-12.5S22.9 3 16 3zm0 22.7c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-3.9 1 1-3.8-.2'
      '-.4c-1-1.6-1.5-3.5-1.5-5.4C5.7 9.8 10.3 5.2 16 5.2s10.3 4.6 10.3 10.3S21.7 25.7 16 '
      '25.7z"/></svg>')


def photo(name):
    return data_uri(HERE / "prepped" / f"{name}.png")


def native(name):
    with Image.open(HERE / "prepped" / f"{name}.png") as im:
        return im.size


# --- A: one order --------------------------------------------------------------------
# One scene with every category in it, at one real-world scale (px per cm), instead of
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

A = HEAD + """
.c{position:relative;width:1080px;height:1350px;overflow:hidden;font-family:Heebo,sans-serif;
  background:linear-gradient(#F3F7F4 0 62%,#E6EFE9 70% 100%);color:#1A4231}
.floor{display:none}
.glow{position:absolute;left:50%;top:880px;width:1150px;height:420px;transform:translateX(-50%);
  background:radial-gradient(50% 50% at 50% 50%,rgba(255,255,255,.95),rgba(255,255,255,0))}
.logo{position:absolute;top:64px;right:76px;width:150px}
.txt{position:absolute;top:196px;right:76px;left:76px}
h1{font-weight:900;font-size:98px;line-height:1;letter-spacing:-2.5px}
h1 span{display:block;color:#639C7D}
.sub{font-size:33px;font-weight:500;line-height:1.4;color:#3B5547;margin-top:24px;max-width:840px}
.p{position:absolute;display:block;filter:drop-shadow(0 10px 12px rgba(14,32,54,.16))}
.sh{position:absolute;height:22px;border-radius:50%;
  background:radial-gradient(50% 50% at 50% 50%,rgba(26,66,49,.30),rgba(26,66,49,0))}
.foot{position:absolute;left:76px;right:76px;bottom:52px;display:flex;justify-content:space-between;
  font-size:28px;font-weight:700;color:#1A4231}
.foot b{font-weight:500;color:#4A6B5A}
</style></head><body><div class="c">
  <div class="floor"></div><div class="glow"></div>
  <img class="logo" src="@@LOGO@@">
  <div class="txt">
    <h1>ככה נראית<span>הזמנה אחת.</span></h1>
    <div class="sub">נייר, חומרי ניקוי, חד פעמי, שקיות וציוד משרדי — מגיעים יחד, מספק אחד.</div>
  </div>
  @@ITEMS@@
  <div class="foot"><span>aroam.co.il</span><b>052-6000158 · מיבנה ועד רעננה</b></div>
</div></body></html>"""


def order_scene():
    out, scales = [], {}
    # Paint from the highest baseline down, so nearer items cover the bottoms of the far
    # ones; each item's contact shadow goes in just before it.
    for name, cm, x, base in sorted(ORDER, key=lambda r: r[3]):
        nw, nh = native(name)
        h = cm * PPC
        w = nw * h / nh
        scales[name] = round(h / nh, 3)
        out.append(f'<div class="sh" style="left:{x - w * .48:.0f}px;width:{w * .96:.0f}px;'
                   f'top:{base - 12:.0f}px"></div>')
        out.append(f'<img class="p" src="{photo(name)}" style="left:{x - w / 2:.0f}px;'
                   f'top:{base - h:.0f}px;height:{h:.0f}px">')
    return "".join(out), scales


# --- B: a real photo, little on top of it --------------------------------------------
# Competitors' longest-running ads and their Page feeds are phone photos and footage of
# stock and deliveries. The draft shows the frame; the photo is Roei's to take.
B = HEAD + """
.c{position:relative;width:1080px;height:1350px;overflow:hidden;font-family:Heebo,sans-serif;color:#fff;
  background:repeating-linear-gradient(135deg,#C9D6CE 0 26px,#C2D0C7 26px 52px)}
.ph{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  color:#1A4231;text-align:center;gap:18px}
.ph svg{width:120px;height:120px;opacity:.75}
.ph b{font-size:46px;font-weight:800}
.ph span{font-size:30px;font-weight:500;max-width:760px;line-height:1.45;color:#2E4A3C}
.badge{position:absolute;top:54px;right:54px;background:#fff;border-radius:26px;padding:20px 26px;
  box-shadow:0 10px 30px rgba(14,32,54,.18)}
.badge img{width:150px;display:block}
.scrim{position:absolute;left:0;right:0;bottom:0;height:330px;
  background:linear-gradient(rgba(26,66,49,0),rgba(26,66,49,.86) 62%)}
.cap{position:absolute;right:64px;left:64px;bottom:64px}
.tag{display:inline-block;background:#8FD6A3;color:#1A4231;font-weight:800;font-size:28px;
  border-radius:40px;padding:8px 24px}
.cap h2{font-weight:900;font-size:64px;line-height:1.05;margin-top:16px;letter-spacing:-1px}
.cap small{display:block;font-size:27px;font-weight:500;color:#D5E8DC;margin-top:12px}
</style></head><body><div class="c">
  <div class="ph">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.6"/></svg>
    <b>כאן נכנס צילום טלפון אמיתי</b>
    <span>מדפים במחסן · משטח שיוצא לחלוקה<br>פריקה אצל לקוח — בלי שם ובלי שלט</span>
  </div>
  <div class="badge"><img src="@@LOGO@@"></div>
  <div class="scrim"></div>
  <div class="cap"><span class="tag">מהמחסן</span><h2>גלילי 5012 מוכנים לחלוקה.</h2>
    <small>אהרוני שיווק והפצה · aroam.co.il</small></div>
</div></body></html>"""


# --- C: the list a business runs out of ----------------------------------------------
# Thumbnails, not a scene, so each fits the same box rather than sharing one scale.
LIST = [("נייר טואלט ומגבות ידיים", "p5012"), ("סבון ידיים וחומרי ניקוי", "jet"),
        ("כוסות, צלחות וסכו״ם", "cup500"), ("שקיות אשפה", "bags_trash"),
        ("נייר צילום ועטים", "a4"), ("כפפות ומגבונים", "gloves")]
THUMB = (124, 92)

C = HEAD + """
.c{position:relative;width:1080px;height:1350px;overflow:hidden;font-family:Heebo,sans-serif;
  background:#F3F7F4;color:#1A4231}
.logo{position:absolute;top:64px;right:76px;width:150px}
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
  <img class="logo" src="@@LOGO@@">
  <h1>מה נגמר <span>החודש?</span></h1>
  <div class="sheet"><div class="clip"></div>
    <h2>רשימת הקניות של המשרד<small>הכל מספק אחד</small></h2>
    @@ROWS@@
  </div>
  <div class="end"><b>שלחו לנו את הרשימה.</b><span class="cta">@@WA@@052-6000158</span></div>
</div></body></html>"""
CHECK = ('<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" '
         'stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>')


def checklist():
    rows, scales = [], {}
    for text, name in LIST:
        nw, nh = native(name)
        k = min(THUMB[0] / nw, THUMB[1] / nh)
        h = round(nh * k)
        scales[name] = round(k, 3)
        rows.append(f'<div class="row"><div class="ck">{CHECK}</div><span>{text}</span>'
                    f'<div class="th"><img src="{photo(name)}" style="height:{h}px"></div></div>')
    return "".join(rows), scales


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    logo = data_uri(LOGO)
    items, sa = order_scene()
    rows, sc = checklist()
    pages = {
        "A_one_order.png": (A.replace("@@LOGO@@", logo).replace("@@ITEMS@@", items), sa),
        "B_real_photo.png": (B.replace("@@LOGO@@", logo), {}),
        "C_checklist.png": (C.replace("@@LOGO@@", logo).replace("@@ROWS@@", rows)
                            .replace("@@WA@@", WA), sc),
    }
    for name, (html, scales) in pages.items():
        assert "@@" not in html, name
        worst = max(scales.values(), default=0)
        assert worst <= 1.5, f"{name}: a product is enlarged x{worst} (limit 1.5)"
        render(html, OUT / name, W, H, wait_ms=8000)
        print(f"{name:20s} worst enlargement x{worst}")


if __name__ == "__main__":
    main()
