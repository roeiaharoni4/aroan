"""Render the ad set in Roei's own layout, with paper products in the mix.

This keeps the composition he designed - brand block carrying logo, headline and
phone; goods on a light stage - and fixes only what made it read as amateur:
third-party packaging, mismatched scale, and products floating without shadows.
"""
import json
import pathlib

from build import (CM, GREEN_DARK, PASTEL, data_uri, group_offset,
                   product_html, render, LOGO)

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

FONT = '"Arial Hebrew", "Heebo", "Assistant", -apple-system, sans-serif'

HEADLINE = "חד פעמי ומוצרי נייר<br>לעסקים במרכז"
SUB = "משלוח ישיר · מיבנה ועד רעננה"
PHONE = "03-6346236"

# Back to front, in two overlapping ranks. A single straight row reads as a lineup;
# overlap is what makes it read as one arranged group. The wrapped jumbo roll is left
# out on purpose - shapeless under its plastic, it looks like a bag rather than stock.
ITEMS = [
    ("plate",      100, -4,  -7),
    ("rolls",     -220,  0,   0),
    ("rolls2",     -20,  0,   0),
    ("beer",       180,  0,   0),
    ("cup_paper",  222,  0,   0),
    ("cold",       262,  0,   0),
    ("fork",       208, -14, -3),
]

SIZES, REPORT = {}, {}


def cluster(ppc, ground, cx, spread=1.0):
    items = [(n, dx * spread, dy, rot) for n, dx, dy, rot in ITEMS]
    shift = group_offset(items, ppc)
    return "".join(product_html(n, ppc, cx + dx + shift, ground + dy, rot=rot, sizes=SIZES)
                   for n, dx, dy, rot in items)


def page(w, h, stage, panel, logo_w, h1, sub, tel, items):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{w}px;height:{h}px;overflow:hidden;font-family:{FONT}}}
.c{{position:relative;width:{w}px;height:{h}px;background:#FBFBFA;direction:rtl}}
.stage{{position:absolute;{stage}
  background:radial-gradient(72% 62% at 46% 46%,#fff 0%,#F1F3F1 100%)}}
.panel{{position:absolute;{panel}
  background:linear-gradient(155deg,{GREEN_DARK} 0%,#245A41 60%,{GREEN_DARK} 100%);
  display:flex;flex-direction:column;justify-content:center}}
.logo{{width:{logo_w}px;margin-bottom:22px}}
.logo img{{width:100%;display:block}}
h1{{color:#fff;font-size:{h1}px;line-height:1.24;font-weight:700;letter-spacing:-.5px}}
.sub{{color:{PASTEL};font-size:{sub}px;margin-top:13px;font-weight:400}}
.tel{{margin-top:26px;background:{PASTEL};color:{GREEN_DARK};font-size:{tel}px;
  font-weight:700;padding:12px 30px;border-radius:40px;align-self:flex-start;
  letter-spacing:.5px}}
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
    <h1>{HEADLINE}</h1>
    <div class="sub">{SUB}</div>
    <div class="tel">{PHONE}</div>
  </div>
  {items}
</div></body></html>"""


FORMATS = {
    "landscape": dict(
        w=1200, h=628, ppc=6.6, ground=196, cx=360, spread=1.0,
        stage="left:0;top:0;width:734px;height:100%;",
        panel="right:0;top:0;width:466px;height:100%;padding:48px 54px;",
        logo_w=146, h1=39, sub=20, tel=27),
    "square": dict(
        w=1200, h=1200, ppc=11.5, ground=250, cx=600, spread=1.0,
        stage="left:0;bottom:0;width:100%;height:760px;",
        panel="left:0;top:0;width:100%;height:440px;padding:44px 66px;",
        logo_w=156, h1=46, sub=23, tel=30),
    "portrait": dict(
        w=960, h=1200, ppc=9.6, ground=248, cx=480, spread=1.0,
        stage="left:0;bottom:0;width:100%;height:740px;",
        panel="left:0;top:0;width:100%;height:460px;padding:44px 58px;",
        logo_w=148, h1=42, sub=21, tel=28),
}


def main():
    for fmt, c in FORMATS.items():
        SIZES.clear()
        items = cluster(c["ppc"], c["ground"], c["cx"], c["spread"])
        html = page(c["w"], c["h"], c["stage"], c["panel"],
                    c["logo_w"], c["h1"], c["sub"], c["tel"], items)
        out = OUT / f"aroam_{fmt}.png"
        render(html, out, c["w"], c["h"])
        REPORT[out.name] = dict(SIZES)
        worst = max(SIZES.values(), key=lambda v: v["scale"])["scale"]
        print(f"{out.name:22s} {c['w']}x{c['h']}  ppc={c['ppc']}  worst scale x{worst:.2f}")
    (HERE / "scale_report.json").write_text(json.dumps(REPORT, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
