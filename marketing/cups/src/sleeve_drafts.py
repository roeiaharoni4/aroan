"""Design directions for the printed sleeve of 50 cups (Roei, 23.11.26: "now the sleeve, give me a few examples";
then "the design has to stand, not lie down").

Mockups only, not print files. Each one draws the 50 nested 8oz cups standing in a clear plastic sleeve (the outermost
cup at the bottom, the mouth of the top cup at the top, seen slightly from above), with one way of printing the sleeve.
The print reads upright on the standing sleeve:
Every direction carries the office phone and the website, no e-mail (Roei, 23.11.26).
  a  clear sleeve + a sticker: black label, white ink (Roei chose this one, 23.11.26)
  b  printed white band around the sleeve, black ink (the carton's look)
  c  white ink straight on the clear film, minimal; the logo lettering is left clear, so the green cup shows through
  d  white sleeve with a clear window over the outermost cup, green ink
Outputs: ../sleeve/drafts/sleeve-<a..d>.png and sleeve-options.png (all four in a row, with Hebrew captions).
"""
import pathlib, re, shutil, tempfile
import build_print as B

HERE = B.HERE
OUT = HERE.parent / "sleeve" / "drafts"
ASSETS = HERE / "assets"
GREEN = B.GREEN

# ---------------------------------------------------------------- geometry (mm), 8oz cup and a 50-cup stack
D_RIM, D_BASE, CUP_H, PITCH, N = 80.0, 56.0, 92.0, 7.0, 50
R, r = D_RIM / 2, D_BASE / 2
R_BEAD = R + 1.2
STACK = (N - 1) * PITCH          # mouth of the top cup down to the rim of the outermost cup
OVER = 20.0                      # film past each end
E = 0.17                         # ellipse ratio of the round sections (seen slightly from above)

CW, CH = 520, 1440
S = 1300 / (STACK + CUP_H + 2 * OVER)       # px per mm
CX = CW / 2
Y0 = (CH - (STACK + CUP_H) * S) / 2 - 18     # mouth (top of the stack)
YR = Y0 + STACK * S                          # rim of the outermost cup
YB = YR + CUP_H * S                          # its base
RP, rp, RBP = R * S, r * S, R_BEAD * S
RF = RBP + 3 * S                             # film radius
MID = Y0 + 0.47 * STACK * S                  # centre of the printed area


def f(v):
    return f"{v:.2f}"


# ---------------------------------------------------------------- logos

def logo_groups():
    s = B.LOGO_SVG.read_text(encoding="utf8")
    g = {}
    for gid in ("leaf", "wordmark", "tagline"):
        inner = re.search(r'<g id="%s"[^>]*>(.*?)</g>' % gid, s, re.S).group(1)
        g[gid] = re.sub(r'\sfill="[^"]*"', "", inner)
    return g


LOGO = logo_groups()


def aroam_logo(width, leaf, letters, uid):
    """Inline SVG of the Aharoni logo, `width` px. letters=None leaves the lettering clear (no ink)."""
    h = width * 112 / 183
    if letters is None:
        body = (f'<defs><mask id="m{uid}" maskUnits="userSpaceOnUse" x="-2" y="-1" width="183" height="112">'
                f'<g fill="#fff">{LOGO["leaf"]}</g><g fill="#000">{LOGO["wordmark"]}{LOGO["tagline"]}</g></mask></defs>'
                f'<rect x="-2" y="-1" width="183" height="112" fill="{leaf}" mask="url(#m{uid})"/>')
    else:
        body = f'<g fill="{leaf}">{LOGO["leaf"]}</g><g fill="{letters}">{LOGO["wordmark"]}{LOGO["tagline"]}</g>'
    return f'<svg viewBox="-2 -1 183 112" width="{f(width)}" height="{f(h)}" style="display:block">{body}</svg>'


def cup_logo_path():
    """The cup's own "coffee" + leaf, white, on the outermost cup (upright, as on the real cup)."""
    d_at = D_BASE + (D_RIM - D_BASE) * 0.535
    w = 0.209 * 3.14159 * d_at * S * 0.93          # a little foreshortened by the curve
    yc = YB - 0.535 * CUP_H * S
    lg = B.mapped(B.logo_mm(w), lambda p: (CX + p[0], yc + p[1]))
    return f'<path d="{B.d_of(lg, 2)}" fill="#fff" opacity=".96"/>'


# ---------------------------------------------------------------- the stack and the film

def arc_low(y, rad):
    """'U': front (lower) half of the cross-section ellipse at y."""
    return f"M{f(CX - rad)} {f(y)}A{f(rad)} {f(rad * E)} 0 0 0 {f(CX + rad)} {f(y)}"


def stack_svg():
    body = (f"M{f(CX - RP)} {f(Y0)}V{f(YR)}L{f(CX - rp)} {f(YB)}"
            f"A{f(rp)} {f(rp * E)} 0 0 0 {f(CX + rp)} {f(YB)}L{f(CX + RP)} {f(YR)}V{f(Y0)}"
            f"A{f(RP)} {f(RP * E)} 0 0 0 {f(CX - RP)} {f(Y0)}Z")
    # the rolled rim of every cup is white (unprinted board, Roei 23.11.26): a white bead at each step of the stack
    bead = 2.3 * S
    beads = "".join(arc_low(Y0 + i * PITCH * S + bead / 2, RBP) for i in range(1, N))
    under = "".join(arc_low(Y0 + i * PITCH * S + bead + 1, RBP - 1) for i in range(1, N))
    return f"""
<defs>
  <linearGradient id="cyl" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#0A1D14"/><stop offset=".14" stop-color="#1E4A37"/>
    <stop offset=".30" stop-color="#3F7A60"/><stop offset=".42" stop-color="#22533D"/>
    <stop offset=".70" stop-color="#173A2B"/><stop offset=".92" stop-color="#0C2218"/><stop offset="1" stop-color="#07140D"/>
  </linearGradient>
  <linearGradient id="inside" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#B9B4A8"/><stop offset=".55" stop-color="#E4E0D7"/><stop offset="1" stop-color="#F5F3EE"/>
  </linearGradient>
  <linearGradient id="bead" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#7E7B74"/><stop offset=".14" stop-color="#CBC8C1"/>
    <stop offset=".30" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#EEECE6"/>
    <stop offset=".70" stop-color="#C6C3BC"/><stop offset=".92" stop-color="#8F8C85"/><stop offset="1" stop-color="#6E6B65"/>
  </linearGradient>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
</defs>
<ellipse cx="{f(CX)}" cy="{f(YB + OVER * S + 6)}" rx="{f(RF * 1.25)}" ry="{f(RF * .22)}" fill="#000" opacity=".25" filter="url(#soft)"/>
<path d="{body}" fill="url(#cyl)"/>
<path d="{under}" fill="none" stroke="#06130C" stroke-width="1.8" opacity=".7"/>
<path d="{beads}" fill="none" stroke="url(#bead)" stroke-width="{f(bead)}"/>
<path d="{arc_low(YB, rp)}" fill="none" stroke="#06130C" stroke-width="2.4" opacity=".8"/>
{cup_logo_path()}
<ellipse cx="{f(CX)}" cy="{f(Y0)}" rx="{f(RBP)}" ry="{f(RBP * E)}" fill="url(#bead)"/>
<ellipse cx="{f(CX)}" cy="{f(Y0 + 1)}" rx="{f(RBP - 4)}" ry="{f(RBP * E - 3)}" fill="url(#inside)"/>
<path d="M{f(CX - RBP + 4)} {f(Y0 + 1)}A{f(RBP - 4)} {f(RBP * E - 3)} 0 0 1 {f(CX + RBP - 4)} {f(Y0 + 1)}" fill="none" stroke="#8E897D" stroke-width="2" opacity=".6"/>
"""


def film_path():
    a, b = Y0 - OVER * S, YB + OVER * S
    seal, tail = 7 * S, RF * 0.78
    yt, yb = Y0 - 5 * S, YB + 6 * S
    rr = rp + 7 * S
    L = lambda dx, y: f"{f(CX - dx)} {f(y)}"
    Rt = lambda dx, y: f"{f(CX + dx)} {f(y)}"
    return (f"M{L(tail, a + seal)}C{L(tail, yt - 4 * S)} {L(RF, yt - 3 * S)} {L(RF, yt)}"
            f"V{f(YR)}C{L(RF, YR + 40 * S)} {L(rr, YB - 20 * S)} {L(rr, yb)}"
            f"C{L(rr, yb + 5 * S)} {L(tail * .8, b - seal - 2 * S)} {L(tail * .8, b - seal)}"
            f"H{f(CX + tail * .8)}C{Rt(tail * .8, b - seal - 2 * S)} {Rt(rr, yb + 5 * S)} {Rt(rr, yb)}"
            f"C{Rt(rr, YB - 20 * S)} {Rt(RF, YR + 40 * S)} {Rt(RF, YR)}"
            f"V{f(yt)}C{Rt(RF, yt - 3 * S)} {Rt(tail, yt - 4 * S)} {Rt(tail, a + seal)}Z")


def seals():
    a, b = Y0 - OVER * S, YB + OVER * S
    seal, tail = 7 * S, RF * 0.78
    out = []
    for y0, h in ((a, tail), (b - seal, tail * .8)):
        zz = "".join(f"M{f(CX - h + i * 6)} {f(y0)}v{f(seal)}" for i in range(int(2 * h / 6) + 1))
        out.append(f'<rect x="{f(CX - h)}" y="{f(y0)}" width="{f(2 * h)}" height="{f(seal)}" rx="2" fill="#fff" opacity=".45"/>'
                   f'<path d="{zz}" stroke="#fff" stroke-width="1.2" opacity=".55"/>')
    return "".join(out)


def film_under():
    return f'<path d="{film_path()}" fill="#fff" opacity=".10"/>'


def film_over():
    """Gloss of the film, drawn over the print."""
    p = film_path()
    return f"""
<defs>
  <clipPath id="filmclip"><path d="{p}"/></clipPath>
  <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".08" stop-color="#fff" stop-opacity=".55"/>
    <stop offset=".6" stop-color="#fff" stop-opacity=".40"/><stop offset=".95" stop-color="#fff" stop-opacity=".15"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".12" stop-color="#000" stop-opacity="0"/>
    <stop offset=".86" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/>
  </linearGradient>
</defs>
<g clip-path="url(#filmclip)">
  <rect x="{f(CX - RF)}" y="0" width="{f(2 * RF)}" height="{CH}" fill="url(#edge)"/>
  <rect x="{f(CX - RF * .66)}" y="{f(Y0 - 8 * S)}" width="{f(RF * .085)}" height="{f(YB - Y0)}" rx="6" fill="url(#gl)"/>
  <rect x="{f(CX - RF * .50)}" y="{f(Y0 + 30 * S)}" width="{f(RF * .025)}" height="{f((YB - Y0) * .55)}" rx="2" fill="url(#gl)" opacity=".6"/>
  <rect x="{f(CX + RF * .55)}" y="{f(Y0 + 10 * S)}" width="{f(RF * .05)}" height="{f((YB - Y0) * .8)}" rx="4" fill="url(#gl)" opacity=".35"/>
</g>
<path d="{p}" fill="none" stroke="#fff" stroke-width="1.6" opacity=".8"/>
<path d="{p}" fill="none" stroke="#000" stroke-width="1" opacity=".10" transform="translate(1.2 0)"/>
{seals()}
"""


# ---------------------------------------------------------------- the four directions (print layer = SVG + HTML)

FONTS = "".join(f'@font-face{{font-family:A{w // 100};src:url("{(ASSETS / f"Assistant-{w}.ttf").as_uri()}")}}'
                for w in (400, 600, 700, 800))

PSHADE = f"""<defs><linearGradient id="pshade" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#000" stop-opacity=".30"/><stop offset=".16" stop-color="#000" stop-opacity=".06"/>
<stop offset=".34" stop-color="#000" stop-opacity="0"/><stop offset=".75" stop-color="#000" stop-opacity=".05"/>
<stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>
<clipPath id="filmclip2"><path d="{film_path()}"/></clipPath></defs>"""


def shade_rect(y, h, x=None, w=None):
    """Cylinder shading over printed areas (white film / labels)."""
    x = CX - RF if x is None else x
    w = 2 * RF if w is None else w
    return f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="url(#pshade)" clip-path="url(#filmclip2)"/>'


def barcode_slot(ink, fill):
    """Empty white box kept for the barcode (about 34 x 21 mm), no text in it (Roei, 23.11.26)."""
    return f'<div style="margin-top:14px;width:{f(34 * S)}px;height:{f(21 * S)}px;background:{fill};border-radius:3px"></div>'


def column(ink, logo_html, slot_fill="#fff"):
    """Centred column: logo, a short rule, the text lines, the business details, the barcode slot."""
    out = [f'<div style="display:flex;flex-direction:column;align-items:center;color:{ink};text-align:center">', logo_html,
           f'<div style="width:54px;height:2px;background:{ink};margin:14px 0 12px"></div>']
    for html, font, gap in LINES:
        out.append(f'<div style="font:{font};margin-top:{gap}px;direction:rtl">{html}</div>')
    out.append(barcode_slot("#9AA3AB" if slot_fill == "#fff" else ink, slot_fill))
    out.append("</div>")
    return "".join(out)


# Roei's text (23.11.26), top to bottom; business details (office phone, website, no e-mail) and the barcode below
LINES = [
    ("כוסות נייר", "800 32px/1 A8", 0),
    ("לשתייה חמה/קרה", "600 19px/1 A6", 10),
    ("איכותיות במיוחד", "700 19px/1 A7", 6),
    ('<span dir="ltr">8Boz</span> · 50 יחידות', "800 21px/1 A8", 14),
    ('<span dir="ltr">03-6346236 · aroam.co.il</span>', "600 13px/1 A6", 16),
]


BLACK = "#111111"


def dir_a():
    """Sticker on a clear sleeve: black label, white ink (Roei's choice, 23.11.26). The barcode keeps a white box."""
    w, h = 72 * S, 128 * S
    x, y = CX - w / 2, MID - h / 2
    svg = (f'<rect x="{f(x + 3)}" y="{f(y + 5)}" width="{f(w)}" height="{f(h)}" rx="9" fill="#000" opacity=".18" filter="url(#soft)"/>'
           f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="9" fill="{BLACK}"/>'
           f'<rect x="{f(x + 7)}" y="{f(y + 7)}" width="{f(w - 14)}" height="{f(h - 14)}" rx="5" fill="none" stroke="#fff" stroke-width="2"/>'
           + shade_rect(y, h, x, w))
    html = (f'<div class="lab" style="left:{f(x)}px;top:{f(y)}px;width:{f(w)}px;height:{f(h)}px">'
            + column("#fff", aroam_logo(108, "#fff", BLACK, "a")) + "</div>")
    return svg, html, "א — שרוול שקוף + מדבקה"


def dir_b():
    """Printed white band around the sleeve, black ink (the carton's look)."""
    h = 160 * S
    y = MID - h / 2
    svg = (f'<g clip-path="url(#filmclip2)"><rect x="0" y="{f(y)}" width="{CW}" height="{f(h)}" fill="#fff"/></g>'
           + shade_rect(y, h))
    html = (f'<div class="lab" style="left:{f(CX - RF)}px;top:{f(y)}px;width:{f(2 * RF)}px;height:{f(h)}px">'
            + column("#000", aroam_logo(140, "#000", "#fff", "b")) + "</div>")
    return svg, html, "ב — פס לבן מודפס, כמו הקרטון"


def dir_c():
    """White ink straight on the clear film; logo lettering left clear. The barcode needs a white box and dark bars."""
    h = 170 * S
    y = MID - h / 2
    html = (f'<div class="lab" style="left:{f(CX - RF)}px;top:{f(y)}px;width:{f(2 * RF)}px;height:{f(h)}px;opacity:.96">'
            + column("#fff", aroam_logo(150, "#fff", None, "c")) + "</div>")
    return "", html, "ג — הדפסה בלבן על שקוף"


def dir_d():
    """White sleeve with a clear window over the outermost cup; green ink."""
    wy0, wy1 = YR - 24 * S, YB - 3 * S
    ww = RF * .74
    p = film_path()
    svg = (f'<defs><mask id="win" maskUnits="userSpaceOnUse" x="0" y="0" width="{CW}" height="{CH}">'
           f'<path d="{p}" fill="#fff"/><rect x="{f(CX - ww)}" y="{f(wy0)}" width="{f(2 * ww)}" height="{f(wy1 - wy0)}" rx="26" fill="#000"/></mask></defs>'
           f'<g mask="url(#win)"><path d="{p}" fill="#FBFBF9"/>{shade_rect(0, CH)}</g>'
           f'<rect x="{f(CX - ww)}" y="{f(wy0)}" width="{f(2 * ww)}" height="{f(wy1 - wy0)}" rx="26" fill="none" stroke="{GREEN}" stroke-width="3"/>')
    h = 200 * S
    y = MID - h / 2 + 10 * S
    html = (f'<div class="lab" style="left:{f(CX - RF)}px;top:{f(y)}px;width:{f(2 * RF)}px;height:{f(h)}px">'
            + column(GREEN, aroam_logo(140, GREEN, "#fff", "d")) + "</div>")
    return svg, html, "ד — שרוול לבן עם חלון"


def page(print_svg, print_html):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONTS}
html,body{{margin:0;width:{CW}px;height:{CH}px;overflow:hidden;background:radial-gradient(ellipse at 50% 42%,#F8F9FA,#DCE0E4)}}
svg.layer{{position:absolute;left:0;top:0}}
.lab{{position:absolute;display:flex;align-items:center;justify-content:center;white-space:nowrap}}
</style></head><body>
<svg class="layer" width="{CW}" height="{CH}">{stack_svg()}{film_under()}{PSHADE}{print_svg}</svg>
{print_html}
<svg class="layer" width="{CW}" height="{CH}">{film_over()}</svg>
</body></html>"""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="sleeve-"))
    caps = []
    try:
        for key, fn in (("a", dir_a), ("b", dir_b), ("c", dir_c), ("d", dir_d)):
            svg, html, cap = fn()
            (tmp / f"{key}.html").write_text(page(svg, html), encoding="utf8")
            B.html_to_png(tmp / f"{key}.html", OUT / f"sleeve-{key}.png", CW, CH, 4000)
            caps.append((key, cap))
        iw = 420
        ih = round(iw * CH / CW)
        cells = "".join(f'<figure><img src="{(OUT / f"sleeve-{k}.png").as_uri()}"><figcaption>{c}</figcaption></figure>'
                        for k, c in caps)
        (tmp / "all.html").write_text(f"""<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>{FONTS}
html,body{{margin:0;background:#fff;font-family:A6}}
.grid{{display:grid;grid-template-columns:repeat(4,{iw}px);gap:20px;padding:24px}}
figure{{margin:0}} img{{width:{iw}px;height:{ih}px;display:block;border-radius:10px}}
figcaption{{font:700 24px/1.2 A7;color:#1F2A24;margin-top:12px;text-align:center}}
</style></head><body><div class="grid">{cells}</div></body></html>""", encoding="utf8")
        B.html_to_png(tmp / "all.html", OUT / "sleeve-options.png", 4 * iw + 3 * 20 + 48, ih + 48 + 50, 4000)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("ok", OUT)


if __name__ == "__main__":
    main()
