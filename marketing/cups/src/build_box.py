"""Printed shipping carton for the 8oz paper cups (Roei, 18.11.26).

Layout follows the reference carton Roei sent (white board, everything black, content centred on each side):
Wide sides:   "כוסות נייר 8oz" large on top, a line drawing of a paper cup (the style Roei sent), and small
              "משווק על ידי אהרוני שיווק והפצה" under it.
Narrow sides: the Aharoni logo, centred. (Logo and cup were swapped, and the warning box removed, at Roei's request.)
All sides:    phone · e-mail · website, small, on one line at the bottom.

One ink: black, on white board. The logo prints as the black leaf with its lettering left white (no ink).
All text is converted to outlines (outline_text.html, glyph shapes from the Assistant TTFs, positions from Chrome).
The carton size below is only an example for the layout; nothing in the files states dimensions. The factory puts
the panel artwork on its own dieline.

Outputs (../box/)
  box-8oz-print.svg/.pdf     flat RSC: ink artwork + non-printing dieline and notes (English)
  box-panel-wide.svg/.pdf    artwork of one wide side (on its panel outline)
  box-panel-narrow.svg/.pdf  artwork of one narrow side
  box-8oz-flat.png           flat preview
  box-8oz-mockup.png         3D preview
"""
import html as htmllib, json, pathlib, re, shutil, subprocess, tempfile
import build_print as B

HERE = B.HERE
OUT = HERE.parent / "box"
CACHE = HERE / "assets/box_text.json"
INK = "#000000"
BOARD = "#FFFFFF"
GUIDE = "#E6007E"

# example carton (mm): wide side L, narrow side W, height H; RSC flaps are W/2
L, W, H = 520.0, 380.0, 450.0
GLUE, SLOT = 35.0, 6.0
FLAP = W / 2

TEXTS = [
    dict(name="head", text="כוסות נייר 8oz", weight=800, dir="rtl"),
    dict(name="by", text="משווק על ידי אהרוני שיווק והפצה", weight=600, dir="rtl"),
    dict(name="details", text="03-6346236  ·  meiraroam@gmail.com  ·  aroam.co.il", weight=600, dir="ltr"),
]


# ---------------------------------------------------------------- text outlines

def outline(items):
    key = json.dumps(items, ensure_ascii=False, sort_keys=True)
    if CACHE.exists():
        c = json.loads(CACHE.read_text(encoding="utf8"))
        if c.get("key") == key:
            return c["res"]
    page = (HERE / "outline_text.html").read_text(encoding="utf8").replace("__ITEMS__", json.dumps(items, ensure_ascii=False))
    tmp = HERE / "outline_tmp.html"
    tmp.write_text(page, encoding="utf8")
    prof = tempfile.mkdtemp(prefix="chrome-box-")
    try:
        r = subprocess.run([B.CHROME, "--headless=new", "--disable-gpu", "--allow-file-access-from-files",
                            f"--user-data-dir={prof}", "--virtual-time-budget=8000", "--dump-dom", f"file://{tmp}"],
                           capture_output=True, text=True, timeout=120)
    finally:
        tmp.unlink(missing_ok=True)
        shutil.rmtree(prof, ignore_errors=True)
    m = re.search(r'<pre id="out">(.*?)</pre>', r.stdout, re.S)
    txt = htmllib.unescape(m.group(1)) if m else "no output"
    if not txt.startswith("{"):
        raise RuntimeError(txt)
    res = json.loads(txt)
    CACHE.write_text(json.dumps({"key": key, "res": res}, ensure_ascii=False), encoding="utf8")
    return res


def ink_box(subs):
    return B.bbox(B.flatten(subs, 0.4))


def place(subs, k, cx, top):
    """Scale by k, centre the ink horizontally on cx, put the ink top at `top`. Returns (subs, bbox)."""
    bx = ink_box(subs)
    mx = (bx[0] + bx[2]) / 2
    f = lambda p: (cx + (p[0] - mx) * k, top + (p[1] - bx[1]) * k)
    return B.mapped(subs, f), (cx + (bx[0] - mx) * k, top, cx + (bx[2] - mx) * k, top + (bx[3] - bx[1]) * k)


# ---------------------------------------------------------------- logo, one colour

def logo_parts():
    """(leaf, lettering) subpaths. The lettering strokes overlap and some are duplicated in the source file, so it is
    filled non-zero in white over the black leaf (white = no ink), not cut out with even-odd."""
    s = B.LOGO_SVG.read_text(encoding="utf8")
    ds = {}
    for gid in ("leaf", "wordmark", "tagline"):
        g = re.search(r'<g id="%s"[^>]*>(.*?)</g>' % gid, s, re.S).group(1)
        ds[gid] = re.findall(r' d="([^"]+)"', g)
    return B.parse(" ".join(ds["leaf"])), B.parse(" ".join(ds["wordmark"] + ds["tagline"]))


def place_logo(width, cx, top):
    leaf, letters = logo_parts()
    bx = ink_box(leaf)
    k = width / (bx[2] - bx[0])
    mx = (bx[0] + bx[2]) / 2
    f = lambda p: (cx + (p[0] - mx) * k, top + (p[1] - bx[1]) * k)
    svg = (f'<path d="{B.d_of(B.mapped(leaf, f), 3)}" fill="{INK}"/>'
           f'<path d="{B.d_of(B.mapped(letters, f), 3)}" fill="{BOARD}"/>')
    return svg, (bx[3] - bx[1]) * k


# ---------------------------------------------------------------- cup drawing (stroke)

def cup_drawing(cx, top, hc):
    rim_h, rim_w = 0.058 * hc, 0.80 * hc
    body_w, bot_w, sag = 0.735 * hc, 0.52 * hc, 0.028 * hc
    r = rim_h / 2
    x0, x1, y0 = cx - rim_w / 2, cx + rim_w / 2, top
    rim = (f"M{x0 + r:.3f} {y0:.3f}H{x1 - r:.3f}A{r:.3f} {r:.3f} 0 0 1 {x1 - r:.3f} {y0 + rim_h:.3f}"
           f"H{x0 + r:.3f}A{r:.3f} {r:.3f} 0 0 1 {x0 + r:.3f} {y0:.3f}Z")
    yb, ye = top + rim_h, top + hc - sag
    body = (f"M{cx - body_w / 2:.3f} {yb:.3f}L{cx - bot_w / 2:.3f} {ye:.3f}"
            f"Q{cx:.3f} {ye + 2 * sag:.3f} {cx + bot_w / 2:.3f} {ye:.3f}L{cx + body_w / 2:.3f} {yb:.3f}")
    return rim + body, 0.011 * hc


# ---------------------------------------------------------------- panels (local mm, origin top-left)

DETAILS_W = 0.80 * W        # the details line fills 80% of a narrow side; same size on every side


def details(T, w):
    d = B.parse(T["details"]["d"])
    bx = ink_box(d)
    k = DETAILS_W / (bx[2] - bx[0])
    h = (bx[3] - bx[1]) * k
    ps, _ = place(d, k, w / 2, 0.925 * H - h)
    return f'<path d="{B.d_of(ps, 3)}" fill="{INK}"/>', 0.925 * H - h


def wide_panel(T):
    art = []
    head = B.parse(T["head"]["d"])
    k = 0.74 * L / (ink_box(head)[2] - ink_box(head)[0])
    hs, hb = place(head, k, L / 2, 0.15 * H)
    art.append(f'<path d="{B.d_of(hs, 3)}" fill="{INK}"/>')
    dsvg, dtop = details(T, L)
    art.append(dsvg)

    hc = 0.36 * H                        # cup drawing height
    by = B.parse(T["by"]["d"])
    kb = (0.05 * H) / 100               # font size 5% of the side height
    by_h = (ink_box(by)[3] - ink_box(by)[1]) * kb
    gap = 0.05 * H
    block = hc + gap + by_h
    zone_top, zone_bot = hb[3], dtop
    y = zone_top + (zone_bot - zone_top - block) / 2
    d, sw = cup_drawing(L / 2, y, hc)
    art.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{sw:.3f}" stroke-linejoin="round" stroke-linecap="round"/>')
    bs, _ = place(by, kb, L / 2, y + hc + gap)
    art.append(f'<path d="{B.d_of(bs, 3)}" fill="{INK}"/>')
    return "\n".join(art)


def narrow_panel(T):
    art = []
    lb = ink_box(logo_parts()[0])
    logo_w = 0.58 * W
    logo_h = (lb[3] - lb[1]) * logo_w / (lb[2] - lb[0])
    lsvg, _ = place_logo(logo_w, W / 2, (H - logo_h) / 2)
    art.append(lsvg)
    art.append(details(T, W)[0])
    return "\n".join(art)


# ---------------------------------------------------------------- flat RSC

def flat_geometry():
    xs = [0.0, GLUE, GLUE + L, GLUE + L + W, GLUE + 2 * L + W, GLUE + 2 * L + 2 * W]
    panels = [(xs[i + 1], xs[i + 2], "wide" if i % 2 == 0 else "narrow") for i in range(4)]
    y_top, y_bot = FLAP, FLAP + H
    flaps = []
    for i, (a, b, _) in enumerate(panels):
        flaps.append((a + SLOT / 2, b if i == 3 else b - SLOT / 2))
    # outer cut outline, clockwise from the glue flap
    pts = [(xs[1], y_top), (0, y_top + 12), (0, y_bot - 12), (xs[1], y_bot)]
    for i, (a, b) in enumerate(flaps):
        pts += [(a, y_bot), (a, y_bot + FLAP), (b, y_bot + FLAP), (b, y_bot)]
    pts += [(xs[5], y_top)]
    for a, b in reversed(flaps):
        pts += [(b, y_top), (b, 0), (a, 0), (a, y_top)]
    creases = [f"M{xs[1]:.1f} {y_top:.1f}H{xs[5]:.1f}", f"M{xs[1]:.1f} {y_bot:.1f}H{xs[5]:.1f}"]
    creases += [f"M{x:.1f} {y_top:.1f}V{y_bot:.1f}" for x in xs[1:5]]
    return xs, panels, pts, creases, xs[5], FLAP * 2 + H


def poly_d(pts):
    return "M" + "L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + "Z"


def build():
    OUT.mkdir(exist_ok=True)
    T = outline(TEXTS)
    wide, narrow = wide_panel(T), narrow_panel(T)
    xs, panels, outline_pts, creases, FW, FH = flat_geometry()

    def art_on_flat():
        g = []
        for i, (a, b, kind) in enumerate(panels):
            art = wide if kind == "wide" else narrow
            g.append(f'<g transform="translate({a:.2f} {FLAP:.2f})">{art}</g>')
        return "\n".join(g)

    # print file
    m, notes_h = 20.0, 52.0
    PW, PH = FW + 2 * m, FH + 2 * m + notes_h
    notes = [
        "Paper cup carton 8oz: printed regular slotted carton (RSC). Example proportions: fit to the factory dieline.",
        "Board: white. Print 1 colour: black.",
        "Logo: the leaf is printed black and its lettering is left unprinted (white board).",
        "Wide sides: title, cup drawing, line under it. Narrow sides: logo. Contact line on all four sides.",
        "Keep the artwork centred on each side and in proportion. All text is converted to outlines.",
        "Magenta = guides only, do not print. Solid = cut. Dashed = crease.",
    ]
    note_svg = [f'<text x="{m}" y="{m + 6}" font-size="11" font-weight="bold">Paper cups 8oz: carton artwork</text>']
    note_svg += [f'<text x="{m}" y="{m + 17 + 6.6 * i:.1f}">{t}</text>' for i, t in enumerate(notes)]
    body = "\n".join([
        f'<g transform="translate({m} {m + notes_h})">',
        f'<g id="print">{art_on_flat()}</g>',
        f'<g id="non-printing" fill="none" stroke="{GUIDE}" stroke-width="0.6">',
        f'<path d="{poly_d(outline_pts)}"/>',
        f'<path d="{"".join(creases)}" stroke-dasharray="6 4"/>',
        '</g></g>',
        f'<g id="notes" fill="{GUIDE}" font-family="Arial, Helvetica, sans-serif" font-size="5.2">{"".join(note_svg)}</g>',
    ])
    B.write_svg(OUT / "box-8oz-print.svg", PW, PH, body, "paper cups 8oz carton, print file")
    B.svg_to_pdf(OUT / "box-8oz-print.svg", PW, PH)

    # one panel each, on its outline
    for kind, w, art in (("wide", L, wide), ("narrow", W, narrow)):
        pm = 10.0
        b = (f'<g transform="translate({pm} {pm})"><g id="print">{art}</g>'
             f'<rect width="{w}" height="{H}" fill="none" stroke="{GUIDE}" stroke-width="0.5" stroke-dasharray="6 4"/></g>')
        f = OUT / f"box-panel-{kind}.svg"
        B.write_svg(f, w + 2 * pm, H + 2 * pm, b, f"paper cups 8oz carton, {kind} side artwork")
        B.svg_to_pdf(f, w + 2 * pm, H + 2 * pm)

    # previews (scratch SVGs)
    tmpd = pathlib.Path(tempfile.mkdtemp(prefix="box-prev-"))
    try:
        pm = 30.0
        prev = (f'<rect width="{FW + 2 * pm}" height="{FH + 2 * pm}" fill="#ECEEF1"/>'
                f'<g transform="translate({pm} {pm})"><path d="{poly_d(outline_pts)}" fill="{BOARD}" stroke="#9AA0AA" stroke-width="1"/>'
                f'<path d="{"".join(creases)}" fill="none" stroke="#B9BEC7" stroke-width="1.2" stroke-dasharray="7 5"/>'
                f'{art_on_flat()}</g>')
        B.write_svg(tmpd / "flat.svg", FW + 2 * pm, FH + 2 * pm, prev, "flat")
        pxw = 2000
        pxh = round(pxw * (FH + 2 * pm) / (FW + 2 * pm))
        (tmpd / "flat.html").write_text(
            f'<html><body style="margin:0"><img src="flat.svg" style="display:block;width:{pxw}px;height:{pxh}px"></body></html>')
        B.html_to_png(tmpd / "flat.html", OUT / "box-8oz-flat.png", pxw, pxh, 3000)

        for kind, w, art in (("wide", L, wide), ("narrow", W, narrow)):
            B.write_svg(tmpd / f"{kind}.svg", w, H, f'<rect width="{w}" height="{H}" fill="{BOARD}"/>{art}', kind)
        B.write_svg(tmpd / "top.svg", L, W,
                    f'<rect width="{L}" height="{W}" fill="{BOARD}"/><path d="M0 {W / 2}H{L}" stroke="#C9CDD3" stroke-width="2"/>'
                    f'<rect x="0" y="{W / 2 - 28}" width="{L}" height="56" fill="#DDE1E6" opacity=".7"/>', "top")
        s = 0.95  # px per mm in the scene
        (tmpd / "mock.html").write_text(f"""<html><head><style>
body{{margin:0;width:1500px;height:1150px;background:radial-gradient(circle at 50% 40%,#F7F8FA,#D9DDE3);overflow:hidden}}
.scene{{position:absolute;left:50%;top:54%;perspective:3200px}}
.box{{position:absolute;transform-style:preserve-3d;transform:rotateX(-20deg) rotateY(-36deg)}}
.f{{position:absolute;background-size:100% 100%;backface-visibility:hidden}}
.f::after{{content:"";position:absolute;inset:0}}
.front{{width:{L * s}px;height:{H * s}px;left:{-L * s / 2}px;top:{-H * s / 2}px;background-image:url(wide.svg);transform:translateZ({W * s / 2}px)}}
.front::after{{background:linear-gradient(90deg,rgba(0,0,0,.02),rgba(0,0,0,.08))}}
.right{{width:{W * s}px;height:{H * s}px;left:{-W * s / 2}px;top:{-H * s / 2}px;background-image:url(narrow.svg);transform:rotateY(90deg) translateZ({L * s / 2}px)}}
.right::after{{background:linear-gradient(90deg,rgba(0,0,0,.13),rgba(0,0,0,.20))}}
.top{{width:{L * s}px;height:{W * s}px;left:{-L * s / 2}px;top:{-W * s / 2}px;background-image:url(top.svg);transform:rotateX(90deg) translateZ({H * s / 2}px)}}
.top::after{{background:rgba(255,255,255,.0)}}
.shadow{{position:absolute;width:{L * s * 1.25}px;height:{W * s * 1.25}px;left:{-L * s * .62}px;top:{-W * s * .62}px;
  background:radial-gradient(closest-side,rgba(0,0,0,.30),rgba(0,0,0,0));transform:rotateX(90deg) translateZ({-H * s / 2 - 2}px)}}
</style></head><body><div class="scene"><div class="box">
<div class="shadow"></div><div class="f top"></div><div class="f front"></div><div class="f right"></div>
</div></div></body></html>""")
        B.html_to_png(tmpd / "mock.html", OUT / "box-8oz-mockup.png", 1500, 1150, 3000)
    finally:
        shutil.rmtree(tmpd, ignore_errors=True)
    print("flat", round(FW), "x", round(FH), "mm")


if __name__ == "__main__":
    build()
