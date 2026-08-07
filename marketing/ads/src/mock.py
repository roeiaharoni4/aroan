"""Two competing directions, one format each, for Roei to choose between."""
import pathlib

from build import CM, data_uri, group_offset, product_html, render, LOGO

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"

GREEN_DARK = "#1A4231"
GREEN = "#639C7D"
PASTEL = "#8FD6A3"

FONT = '"Arial Hebrew", "Heebo", "Assistant", -apple-system, sans-serif'

ITEMS = [
    ("plate",     -212, -6,  -7),
    ("spoon",      206,  0,   0),
    ("cold",       142,  0,   0),
    ("beer",       -26,  0,   0),
    ("cup_paper",   58,  0,   0),
    ("fork",        16, -20, -3),
]


def cluster(ppc, ground, cx, spread=1.0):
    items = [(n, dx * spread, dy, rot) for n, dx, dy, rot in ITEMS]
    shift = group_offset(items, ppc)
    return "".join(product_html(n, ppc, cx + dx + shift, ground + dy, rot=rot)
                   for n, dx, dy, rot in items)


# ---------------------------------------------------------------- option A
# Roei's own layout, kept intact. Only the flaws are fixed: unbranded products,
# true relative scale, one shared light direction, and contact shadows.
OPTION_A = f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1200px;height:628px;overflow:hidden;font-family:{FONT}}}
.c{{position:relative;width:1200px;height:628px;background:#FBFBFA;direction:rtl}}
.stage{{position:absolute;left:0;top:0;width:730px;height:100%;
  background:radial-gradient(70% 60% at 45% 45%,#fff 0%,#F2F4F2 100%)}}
.panel{{position:absolute;right:0;top:0;width:470px;height:100%;
  background:linear-gradient(155deg,{GREEN_DARK} 0%,#245A41 60%,{GREEN_DARK} 100%);
  padding:52px 56px;display:flex;flex-direction:column;justify-content:center}}
.logo{{width:150px;margin-bottom:26px}}
.logo img{{width:100%;display:block}}
h1{{color:#fff;font-size:40px;line-height:1.24;font-weight:700;letter-spacing:-.5px}}
.sub{{color:{PASTEL};font-size:20px;margin-top:14px;font-weight:400}}
.tel{{margin-top:30px;background:{PASTEL};color:{GREEN_DARK};font-size:27px;font-weight:700;
  padding:13px 30px;border-radius:40px;align-self:flex-start;letter-spacing:.5px}}
.item{{position:absolute}}
.item img{{width:100%;height:100%;object-fit:contain;display:block;
  filter:drop-shadow(0 7px 10px rgba(14,32,54,.18))}}
.shade{{position:absolute;height:26px;border-radius:50%;filter:blur(7px);
  background:radial-gradient(50% 50% at 50% 50%,rgba(14,32,54,.30) 0%,
             rgba(14,32,54,.12) 55%,transparent 78%)}}
</style></head><body><div class="c">
  <div class="stage"></div>
  <div class="panel">
    <div class="logo"><img src="{data_uri(LOGO)}"></div>
    <h1>חד פעמי ומוצרי נייר<br>לעסקים במרכז</h1>
    <div class="sub">משלוח ישיר · מיבנה ועד רעננה</div>
    <div class="tel">03-6346236</div>
  </div>
  {cluster(11.0, 150, 352)}
</div></body></html>"""


# ---------------------------------------------------------------- option B
# The inverse. White and clear goods have almost no contrast on a pale field; on the
# brand's dark green they read as bright objects, which is how disposables are shot
# for premium catalogues. Shadow becomes a light pool instead of a dark one.
OPTION_B = f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1200px;height:628px;overflow:hidden;font-family:{FONT}}}
.c{{position:relative;width:1200px;height:628px;direction:rtl;
  background:radial-gradient(75% 90% at 38% 42%,#2E6B4E 0%,{GREEN_DARK} 55%,#11301F 100%)}}
/* a soft pool of light for the group to stand in */
.pool{{position:absolute;left:6%;right:34%;bottom:96px;height:170px;
  background:radial-gradient(50% 50% at 50% 50%,rgba(190,235,205,.30) 0%,
             rgba(143,214,163,.10) 45%,transparent 72%);filter:blur(16px)}}
.logo{{position:absolute;right:74px;top:64px;width:152px}}
.logo img{{width:100%;display:block}}
.cap{{position:absolute;right:74px;top:250px;width:330px;color:#fff}}
.cap h1{{font-size:38px;line-height:1.24;font-weight:700;letter-spacing:-.5px}}
.cap .sub{{color:{PASTEL};font-size:19px;margin-top:14px}}
.item{{position:absolute}}
.item img{{width:100%;height:100%;object-fit:contain;display:block;
  filter:drop-shadow(0 10px 16px rgba(0,0,0,.42))}}
/* dark-on-dark would vanish, so the contact mark is a bright reflection */
.shade{{position:absolute;height:22px;border-radius:50%;filter:blur(8px);
  background:radial-gradient(50% 50% at 50% 50%,rgba(255,255,255,.22) 0%,
             rgba(255,255,255,.07) 55%,transparent 78%)}}
</style></head><body><div class="c">
  <div class="pool"></div>
  <div class="logo"><img src="{data_uri(LOGO)}"></div>
  <div class="cap">
    <h1>חד פעמי ומוצרי נייר<br>לעסקים במרכז</h1>
    <div class="sub">משלוח ישיר · מיבנה ועד רעננה</div>
  </div>
  {cluster(11.0, 150, 372)}
</div></body></html>"""


if __name__ == "__main__":
    render(OPTION_A, OUT / "_option_A.png", 1200, 628)
    render(OPTION_B, OUT / "_option_B.png", 1200, 628)
    print("wrote _option_A.png and _option_B.png")
