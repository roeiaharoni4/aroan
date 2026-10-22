"""The chosen direction for the Meta set - feed drafts, waiting for Roei's photos.

Roei rejected the first set (catalog cutouts piled on a light stage, small type) as
unprofessional (22.10.26). Of three directions he picked two:
  A - the WhatsApp conversation itself: the customer sends a photo of the last order,
      Aroam answers with a quote whose rows show the products. Used for the switch ad.
  B - a large statement with four product-photo tiles. Used for the office and factory ads.
He is sending better photos; the full set (stories, cover, profile, opening post) gets
built on this file once they arrive.
"""
import pathlib

from PIL import Image

from build import LOGO, data_uri, render

HERE = pathlib.Path(__file__).parent
OUT = HERE.parents[2] / "marketing" / "meta" / "drafts"
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
html,body{width:1080px;height:1350px;overflow:hidden}"""


def photo(name):
    return data_uri(HERE / "prepped" / f"{name}.png")


# The order in the customer's photo and the rows of the quote are the same four products,
# from the ones Roei picked (22.10.26), so the quote can show their real photos.
ORDER = [("נייר טואלט ג׳מבו", "12", "jumbo_tp"), ("גליל תעשייתי 5012", "6", "p5012"),
         ("כוסות נייר", "20", "cup_paper"), ("כפפות ניטריל", "10", "gloves")]

A = HEAD + BASE + """
.c{position:relative;width:1080px;height:1350px;overflow:hidden;font-family:Heebo,sans-serif;
  color:#fff;padding:66px 76px 0;
  background:radial-gradient(85% 55% at 88% 0%,#2E7352 0%,rgba(46,115,82,0) 72%),
             linear-gradient(172deg,#1E4B38 0%,#15392A 100%)}
.top{display:flex;align-items:center;justify-content:space-between}
.logo{width:160px;display:block}
.chip{font-weight:500;font-size:26px;color:#D5ECDD;border:2px solid rgba(143,214,163,.5);
  border-radius:40px;padding:8px 24px}
h1{font-weight:800;font-size:74px;line-height:1.08;letter-spacing:-1.5px;margin-top:44px}
h1 span{display:block;color:#8FD6A3}
.chat{margin-top:40px}
.msg{position:relative;width:620px;border-radius:28px;padding:14px;color:#111B21;
  box-shadow:0 22px 48px rgba(0,0,0,.30)}
.out{background:#D9FDD3;margin-right:auto;border-top-left-radius:8px}
.in{background:#fff;margin-left:auto;margin-top:24px;border-top-right-radius:8px;padding:16px 18px 18px;width:640px}
.photo{height:244px;border-radius:18px;overflow:hidden;position:relative;
  background:linear-gradient(160deg,#B9BFB7 0%,#8F978E 100%)}
.sheet{position:absolute;left:62px;right:62px;top:22px;bottom:-40px;background:#FCFCF9;
  transform:rotate(-3.5deg);box-shadow:0 10px 26px rgba(0,0,0,.35);padding:20px 32px;
  font-family:Assistant,sans-serif;color:#26302A}
.sheet .h{font-weight:800;font-size:25px;border-bottom:2px solid #26302A;padding-bottom:6px;margin-bottom:6px}
.row{display:flex;justify-content:space-between;font-size:22px;padding:4px 0;border-bottom:1px dashed #B8BDB6}
.row b{font-weight:700}
.photo:after{content:"";position:absolute;inset:0;
  background:radial-gradient(120% 90% at 30% 20%,rgba(255,255,255,.18) 0%,rgba(0,0,0,.18) 100%)}
.cap{font-size:28px;font-weight:500;padding:12px 8px 2px;display:flex;align-items:flex-end;gap:10px}
.ticks{width:26px;height:16px;flex:none;margin-right:auto}
.who{font-weight:700;font-size:23px;color:#1A7F55;margin-bottom:10px}
.doc{border:1px solid #E3E6E8;border-radius:14px;overflow:hidden;background:#fff}
.doc-h{background:#1A4231;color:#fff;display:flex;align-items:center;justify-content:space-between;
  padding:10px 18px;font-weight:700;font-size:24px}
.doc-h img{width:62px;display:block}
.li{display:flex;align-items:center;gap:16px;padding:6px 18px;border-top:1px solid #EEF1F2;font-size:24px}
.li:nth-child(odd){background:#F6F9F7}
.li .th{width:60px;height:46px;display:flex;align-items:center;justify-content:center;flex:none}
.li .th img{max-width:60px;max-height:46px}
.li span{flex:1}
.li b{font-weight:700;color:#1A4231}
.in p{font-size:28px;font-weight:500;margin-top:12px}
.foot{position:absolute;left:76px;right:76px;bottom:56px;font-size:27px;font-weight:500;color:#CFE6D7;
  display:flex;justify-content:space-between}
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

B = HEAD + BASE + """
.c{position:relative;width:1080px;height:1350px;overflow:hidden;font-family:Heebo,sans-serif;
  background:#F3F7F4;color:#1A4231;padding:66px 76px 0}
.top{display:flex;align-items:center;justify-content:space-between}
.logo{width:160px;display:block}
.chip{font-weight:500;font-size:26px;color:#1A4231;background:#E2EFE6;border-radius:40px;padding:9px 24px}
h1{font-weight:900;font-size:84px;line-height:1.02;letter-spacing:-2px;margin-top:40px}
h1 span{display:block;color:#639C7D}
.lead{font-size:31px;font-weight:500;line-height:1.4;color:#3B5547;margin-top:18px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:34px}
.tile{background:#fff;border-radius:26px;padding:14px 18px 16px;display:flex;flex-direction:column;
  align-items:center;box-shadow:0 2px 0 #E1EAE4,0 14px 30px rgba(26,66,49,.07)}
.ph{height:236px;width:100%;display:flex;align-items:flex-end;justify-content:center;padding-bottom:14px;
  background:radial-gradient(60% 55% at 50% 70%,#EEF4F0 0%,#fff 100%);border-radius:18px}
.ph img{display:block;filter:drop-shadow(0 8px 10px rgba(14,32,54,.18))}
.ph img + img{margin-inline-start:-@@OVERLAP@@px}
.tile span{font-weight:700;font-size:32px;margin-top:10px}
.band{position:absolute;left:0;right:0;bottom:0;height:176px;background:#1A4231;
  display:flex;align-items:center;justify-content:space-between;padding:0 76px}
.cta{display:inline-flex;align-items:center;gap:14px;background:#8FD6A3;color:#1A4231;
  font-weight:800;font-size:34px;padding:16px 32px;border-radius:60px}
.cta svg{width:38px;height:38px}
.band small{font-size:27px;font-weight:500;color:#CFE6D7}
</style></head><body><div class="c">
  <div class="top"><img class="logo" src="@@LOGO@@"><span class="chip">מעל 20 שנה · לעסקים ומוסדות</span></div>
  <h1>@@H1@@<span>@@H2@@</span></h1>
  <div class="lead">@@LEAD@@</div>
  <div class="grid">@@TILES@@</div>
  <div class="band"><span class="cta">@@WA@@שלחו הודעה בוואטסאפ</span><small>מיבנה ועד רעננה</small></div>
</div></body></html>"""

# Each tile is a small group of products at a target height in px. Roei chose the
# groups (22.10.26): paper - 5012, compact 50, jumbo; disposables (instead of the coffee
# corner) - paper cups, rigid spoon, plate, 500ml cup; office - copy paper, pens,
# binders; cleaning - one Sano and one Yaakobi product, gloves, long wipes in a bucket.
PAPER = [("p5012", 150), ("compact50", 125), ("jumbo_tp", 100)]
DISPOSABLES = [("plate", 120), ("cup500", 150), ("cup_paper", 125), ("spoon", 140)]
OFFICE = [("binder", 200), ("a4", 185), ("pens", 115)]
CLEANING = [("jet", 180), ("kh7", 195), ("wipes", 150), ("gloves", 85)]

B_ADS = {
    "office": dict(
        h1="ספק אחד.", h2="כל מה שהמשרד צריך.",
        lead="נייר, חד פעמי, ניקיון וציוד משרדי — הכל בהזמנה אחת.",
        tiles=[(PAPER, "נייר וטואלט"), (DISPOSABLES, "חד פעמי"),
               (OFFICE, "ציוד משרדי"), (CLEANING, "ניקיון")]),
    "factory": dict(
        h1="אספקה קבועה.", h2="למפעלים ולמחסנים.",
        lead="גלילי נייר תעשייתי, נייר טואלט וחומרי ניקוי — מספק אחד.",
        tiles=[([("p5012", 160), ("gold", 150)], "גלילי נייר תעשייתי"),
               ([("compact50", 140), ("jumbo_tp", 100), ("carton", 140)], "נייר טואלט"),
               (CLEANING, "ניקיון"), (DISPOSABLES, "חד פעמי לחדר האוכל")]),
}
OVERLAP = 22     # px each product tucks under its neighbour
GROUP_W = 400    # usable width of a tile's photo area


def tiles(spec):
    out = []
    for group, label in spec:
        # Scale the whole group down together when its natural width overflows the tile,
        # so the proportions inside a group never change.
        widths = []
        for name, h in group:
            with Image.open(HERE / "prepped" / f"{name}.png") as im:
                widths.append(im.width * h / im.height)
        k = min(1.0, (GROUP_W + OVERLAP * (len(group) - 1)) / sum(widths))
        imgs = "".join(f'<img src="{photo(n)}" style="height:{h * k:.0f}px">' for n, h in group)
        out.append(f'<div class="tile"><div class="ph">{imgs}</div><span>{label}</span></div>')
    return "".join(out)


def page_a():
    rows = "".join(f'<div class="row"><span>{n}</span><b>{q}</b></div>' for n, q, _ in ORDER)
    lines = "".join(f'<div class="li"><div class="th"><img src="{photo(img)}"></div>'
                    f'<span>{n}</span><b>{q}</b></div>' for n, q, img in ORDER)
    return (A.replace("@@LOGO@@", data_uri(LOGO)).replace("@@TICKS@@", TICKS)
            .replace("@@ROWS@@", rows).replace("@@LINES@@", lines))


def page_b(ad):
    return (B.replace("@@LOGO@@", data_uri(LOGO)).replace("@@WA@@", WA)
            .replace("@@OVERLAP@@", str(OVERLAP))
            .replace("@@H1@@", ad["h1"]).replace("@@H2@@", ad["h2"]).replace("@@LEAD@@", ad["lead"])
            .replace("@@TILES@@", tiles(ad["tiles"])))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # wait_ms: Heebo and Assistant come from Google Fonts and land after the load event.
    render(page_a(), OUT / "switch_feed.png", 1080, 1350, wait_ms=8000)
    for name, ad in B_ADS.items():
        render(page_b(ad), OUT / f"{name}_feed.png", 1080, 1350, wait_ms=8000)
    print(f"wrote 3 drafts to {OUT}")


if __name__ == "__main__":
    main()
