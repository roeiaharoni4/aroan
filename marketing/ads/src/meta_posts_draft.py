"""The draft of the third direction for the Page's posts: a real photo, little on top of it.

Roei turned down one post per category (23.10.26) and asked what competitors do. Of three
drafts in the directions their Pages follow, he chose the single-scene order and the
office list - their final versions are built in meta.py - and this one waits for his own
warehouse photos. drafts/ keeps all three images as he saw them.
"""
import pathlib

from build import LOGO, data_uri, render

HERE = pathlib.Path(__file__).parent
OUT = HERE.parents[2] / "marketing" / "meta" / "drafts"
W, H = 1080, 1350

FONTS = ('<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900'
         '&display=block" rel="stylesheet">')
HEAD = ('<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">' + FONTS +
        '<style>*{margin:0;padding:0;box-sizing:border-box}'
        f'html,body{{width:{W}px;height:{H}px;overflow:hidden}}')

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


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    html = B.replace("@@LOGO@@", data_uri(LOGO))
    assert "@@" not in html
    render(html, OUT / "B_real_photo.png", W, H, wait_ms=8000)


if __name__ == "__main__":
    main()
