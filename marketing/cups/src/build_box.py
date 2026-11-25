"""Printed shipping carton for the 8B paper cups (Roei, 18–21.11.26).

Layout follows the reference cartons Roei sent (TAKEIT, InterSun): white board (Roei's choice), everything black,
content centred on each side:
Wide sides:   "כוסות נייר 8Boz" large on top, a line drawing of a paper cup (the style Roei sent), and a boxed
              quantity block ("1000 כוסות בקרטון" / "20 שרוולים של 50 כוסות"). The "marketed by" line was removed (21.11).
Narrow sides: the Aharoni logo, centred. (Logo and cup were swapped, and the warning box removed, at Roei's request.)
All sides:    phone · e-mail · website, small, on one line at the bottom.

One ink: black, on white board. The logo prints as the black leaf; its lettering gets no ink (white board).
"8Boz" is how the size is written on cartons in the trade (Roei, 21.11).
All text is converted to outlines (outline_text.html, glyph shapes from the Assistant TTFs, positions from Chrome).
The carton size below is only an example for the layout; nothing in the files states dimensions. The factory puts
the panel artwork on its own dieline.

Outputs (../box/)
  box-8b-print.svg/.pdf      flat RSC: ink artwork + non-printing dieline and notes (English)
  box-panel-wide.svg/.pdf    artwork of one wide side (on its panel outline)
  box-panel-narrow.svg/.pdf  artwork of one narrow side
  box-8b-flat.png            flat preview
  box-8b-mockup.png          3D preview

`python3 build_box.py v2` builds the improved version into ../box/v2/ (same file names), for comparison (21.11.26):
  thicker cup line · black band at the foot of every side with the contact line knocked out in white ·
  the cup's "coffee" logo on the drawn cup · "1000 כוסות · 8Boz" under the logo on the narrow sides ·
  "this way up" and "keep dry" symbols (ISO 780) on top of the narrow sides.

Two more, after Roei sent the Dentes 4oz carton (22.11.26) and asked for its wording and its design, separately:
`v3` = v2 with the Dentes wording: the quantity box lists 3 lines in Hebrew (right) and in English (left)
       — per sleeve, sleeves per carton, total — and the narrow sides read "כוסות נייר 8Boz" / "סה״כ: 1000 יחידות".
`v4` = the Dentes layout, same wording as v3. Wide sides: where Dentes has its black bar, the cup drawing (v2 style)
       over the contact lines; bilingual title on the right; quantities in two columns at the foot (English under
       the cup, Hebrew on the right); "CARTON NO. / ORDER NO." write-in lines; ISO symbols in the bottom corner.
       Narrow sides: symbols, the regular logo (no bar), contact lines, title and total. (Roei chose v4 and asked
       for the cup instead of the bar and logo, and the plain logo on the narrow sides, 22.11.26.)
"""
import html as htmllib, json, pathlib, re, shutil, subprocess, sys, tempfile
import build_print as B

HERE = B.HERE
VARIANT = next((a for a in sys.argv[1:] if a in ("v2", "v3", "v4")), "v1")
V2 = VARIANT in ("v2", "v3")     # v2 look: band, symbols, thick cup line, cup logo
V3, V4 = VARIANT == "v3", VARIANT == "v4"
OUT = HERE.parent / "box" / ("" if VARIANT == "v1" else VARIANT)
CACHE = HERE / ("assets/box_text.json" if VARIANT == "v1" else f"assets/box_text_{VARIANT}.json")
INK = "#000000"
BOARD = "#FFFFFF"      # white board, previews only
KNOCK = "__KNOCK__"    # fill of the logo lettering: white (= no ink) in print files, board colour in previews
GUIDE = "#E6007E"

# example carton (mm): wide side L, narrow side W, height H; RSC flaps are W/2.
# Proportions of a real 8B cup carton (InterSun, 38 x 30.5 x 35 cm). Not printed anywhere.
L, W, H = 380.0, 305.0, 350.0

# Quantity block: cups per carton, sleeves, cups per sleeve. Confirmed by Roei (21.11.26).
QTY = (1000, 20, 50)
assert QTY[0] == QTY[1] * QTY[2]
GLUE, SLOT = 35.0, 6.0
FLAP = W / 2

TEXTS = [
    dict(name="head", text="כוסות נייר 8Boz", weight=800, dir="rtl"),
    dict(name="details", text="03-6346236  ·  meiraroam@gmail.com  ·  aroam.co.il", weight=600, dir="ltr"),
]
if VARIANT in ("v1", "v2"):
    TEXTS += [
        dict(name="qty1", text=f"{QTY[0]} כוסות בקרטון", weight=800, dir="rtl"),
        dict(name="qty2", text=f"{QTY[1]} שרוולים של {QTY[2]} כוסות", weight=600, dir="rtl"),
        dict(name="nqty", text=f"{QTY[0]} כוסות · 8Boz", weight=800, dir="rtl"),
    ]
else:   # Dentes wording (v3, v4): per sleeve, sleeves per carton, total; Hebrew and English
    QTY_HE = [f"{QTY[2]} יחידות בשרוול", f"{QTY[1]} שרוולים בקרטון", f"סה״כ: {QTY[0]} יחידות"]
    QTY_EN = [f"{QTY[2]} PCS PER SLEEVE", f"{QTY[1]} SLEEVES PER CARTON", f"TOTAL: {QTY[0]} PCS"]
    TEXTS += [dict(name=f"qh{i}", text=t, weight=800 if i == 2 else 600, dir="rtl") for i, t in enumerate(QTY_HE)]
    TEXTS += [dict(name=f"qe{i}", text=t, weight=800 if i == 2 else 600, dir="ltr") for i, t in enumerate(QTY_EN)]
if V4:
    TEXTS += [dict(name="head_en", text="Hot drink cups", weight=700, dir="ltr"),
              dict(name="carton", text="CARTON NO.", weight=700, dir="ltr"),
              dict(name="order", text="ORDER NO.", weight=700, dir="ltr")]
    TEXTS += [dict(name=f"c{i}", text=t, weight=600, dir="ltr")
              for i, t in enumerate(["03-6346236", "meiraroam@gmail.com", "aroam.co.il"])]


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


def put(T, name, k, x, base, align="c", fill=INK):
    """Text item at scale k, baseline at `base`; x is its ink left ('l'), right ('r') or centre ('c').
    Returns (svg, bbox)."""
    subs = B.parse(T[name]["d"])
    bx = ink_box(subs)
    ax = {"l": bx[0], "r": bx[2], "c": (bx[0] + bx[2]) / 2}[align]
    f = lambda p: (x + (p[0] - ax) * k, base + p[1] * k)
    return (f'<path d="{B.d_of(B.mapped(subs, f), 3)}" fill="{fill}"/>',
            (x + (bx[0] - ax) * k, base + bx[1] * k, x + (bx[2] - ax) * k, base + bx[3] * k))


def tw(T, name):
    bx = ink_box(B.parse(T[name]["d"]))
    return bx[2] - bx[0]


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


def place_logo(width, cx, top, rev=False):
    """rev: for a black ground, the leaf gets no ink (board) and the lettering is printed black."""
    leaf, letters = logo_parts()
    bx = ink_box(leaf)
    k = width / (bx[2] - bx[0])
    mx = (bx[0] + bx[2]) / 2
    f = lambda p: (cx + (p[0] - mx) * k, top + (p[1] - bx[1]) * k)
    a, b = (KNOCK, INK) if rev else (INK, KNOCK)
    svg = (f'<path d="{B.d_of(B.mapped(leaf, f), 3)}" fill="{a}"/>'
           f'<path d="{B.d_of(B.mapped(letters, f), 3)}" fill="{b}"/>')
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
    return rim + body, (0.022 if (V2 or V4) else 0.011) * hc


def cup_svg(cx, top, hc):
    d, sw = cup_drawing(cx, top, hc)
    out = f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{sw:.3f}" stroke-linejoin="round" stroke-linecap="round"/>'
    if V2 or V4:   # the cup's own "coffee" + leaf logo, as printed on the real cup
        yb, ye = top + 0.058 * hc, top + hc - 0.028 * hc
        yc = yb + 0.42 * (ye - yb)
        w_at = 0.735 * hc + (0.52 * hc - 0.735 * hc) * (yc - yb) / (ye - yb)
        lg = B.mapped(B.logo_mm(0.66 * w_at), lambda q: (cx + q[0], yc + q[1]))
        out += f'<path d="{B.d_of(lg, 3)}" fill="{INK}"/>'
    return out


def sym_up(x, y, s):
    """ISO 780 'this way up': two arrows over a bar, in an s x s square."""
    t = s / 100
    P = lambda a, b: f"{x + a * t:.3f} {y + b * t:.3f}"
    d = ""
    for ax in (32, 68):
        d += f"M{P(ax - 15, 42)}L{P(ax, 12)}L{P(ax + 15, 42)}Z"
        d += f"M{P(ax - 5, 42)}L{P(ax + 5, 42)}L{P(ax + 5, 80)}L{P(ax - 5, 80)}Z"
    d += f"M{P(16, 85)}L{P(84, 85)}L{P(84, 92)}L{P(16, 92)}Z"
    return f'<path d="{d}" fill="{INK}"/>'


def sym_dry(x, y, s):
    """ISO 780 'keep dry': umbrella with rain, in an s x s square."""
    t = s / 100
    P = lambda a, b: f"{x + a * t:.3f} {y + b * t:.3f}"
    r, sr = 32 * t, 32 / 3 * t
    canopy = (f"M{P(18, 58)}A{r:.3f} {r:.3f} 0 0 1 {P(82, 58)}"
              f"A{sr:.3f} {sr:.3f} 0 0 0 {P(60.67, 58)}A{sr:.3f} {sr:.3f} 0 0 0 {P(39.33, 58)}"
              f"A{sr:.3f} {sr:.3f} 0 0 0 {P(18, 58)}Z")
    handle = f"M{P(50, 56)}L{P(50, 86)}A{6 * t:.3f} {6 * t:.3f} 0 0 1 {P(38, 86)}"
    drops = "".join(f"M{P(a, b)}L{P(a - 3, b + 10)}" for a, b in ((30, 8), (50, 4), (70, 8)))
    return (f'<path d="{canopy}" fill="{INK}"/>'
            f'<path d="{handle}{drops}" fill="none" stroke="{INK}" stroke-width="{5.5 * t:.3f}" stroke-linecap="round"/>')


# ---------------------------------------------------------------- panels (local mm, origin top-left)

DETAILS_W = 0.80 * W        # the details line fills 80% of a narrow side; same size on every side
BAND = 0.115 * H            # v2: black band at the foot of each side
BLEED = 3.0


def details(T, w):
    d = B.parse(T["details"]["d"])
    bx = ink_box(d)
    k = DETAILS_W / (bx[2] - bx[0])
    h = (bx[3] - bx[1]) * k
    if V2:
        top = H - BAND
        ps, _ = place(d, k, w / 2, top + (BAND - h) / 2)
        return (f'<rect x="0" y="{top:.3f}" width="{w:.3f}" height="{BAND + BLEED:.3f}" fill="{INK}"/>'
                f'<path d="{B.d_of(ps, 3)}" fill="{KNOCK}"/>'), top
    ps, _ = place(d, k, w / 2, 0.925 * H - h)
    return f'<path d="{B.d_of(ps, 3)}" fill="{INK}"/>', 0.925 * H - h


def qty_block(T, cx):
    """Boxed quantity block. Returns (height, render(top) -> svg)."""
    q1, q2 = B.parse(T["qty1"]["d"]), B.parse(T["qty2"]["d"])
    k1, k2 = 0.058 * H / 100, 0.042 * H / 100
    b1, b2 = ink_box(q1), ink_box(q2)
    h1, h2 = (b1[3] - b1[1]) * k1, (b2[3] - b2[1]) * k2
    w = max((b1[2] - b1[0]) * k1, (b2[2] - b2[0]) * k2)
    padx, pady, lead = 0.055 * H, 0.032 * H, 0.026 * H
    bw, bh = w + 2 * padx, h1 + lead + h2 + 2 * pady

    def render(top):
        p1, _ = place(q1, k1, cx, top + pady)
        p2, _ = place(q2, k2, cx, top + pady + h1 + lead)
        return (f'<rect x="{cx - bw / 2:.3f}" y="{top:.3f}" width="{bw:.3f}" height="{bh:.3f}" rx="{0.012 * H:.3f}" '
                f'fill="none" stroke="{INK}" stroke-width="{0.0045 * H:.3f}"/>'
                f'<path d="{B.d_of(p1, 3)}{B.d_of(p2, 3)}" fill="{INK}"/>')
    return bh, render


def qty_block_bi(T, cx):
    """v3: boxed quantities, Hebrew lines right-aligned on the right, English left-aligned on the left, a rule between.
    Returns (height, render(top) -> svg)."""
    wh = max(tw(T, f"qh{i}") for i in range(3))
    we = max(tw(T, f"qe{i}") for i in range(3))
    padx, pady, mid = 0.045 * H, 0.03 * H, 0.07 * H
    k = min(0.038 * H / 100, (0.90 * L - mid - 2 * padx) / (wh + we))
    pitch = 150 * k
    ink = [ink_box(B.parse(T[f"q{s}{i}"]["d"])) for s in "he" for i in range(3)]
    cap = -min(b[1] for b in ink) * k
    desc = max(b[3] for b in ink) * k
    bw = (wh + we) * k + mid + 2 * padx
    bh = 2 * pady + cap + 2 * pitch + desc

    def render(top):
        x0 = cx - bw / 2
        out = [f'<rect x="{x0:.3f}" y="{top:.3f}" width="{bw:.3f}" height="{bh:.3f}" rx="{0.012 * H:.3f}" '
               f'fill="none" stroke="{INK}" stroke-width="{0.0045 * H:.3f}"/>']
        xm = x0 + padx + we * k + mid / 2
        out.append(f'<path d="M{xm:.3f} {top + pady:.3f}V{top + bh - pady:.3f}" stroke="{INK}" stroke-width="{0.003 * H:.3f}"/>')
        for i in range(3):
            base = top + pady + cap + i * pitch
            out.append(put(T, f"qh{i}", k, x0 + bw - padx, base, "r")[0])
            out.append(put(T, f"qe{i}", k, x0 + padx, base, "l")[0])
        return "\n".join(out)
    return bh, render


def wide_panel(T):
    art = []
    head = B.parse(T["head"]["d"])
    k = 0.74 * L / (ink_box(head)[2] - ink_box(head)[0])
    hs, hb = place(head, k, L / 2, (0.10 if V2 else 0.11) * H)
    art.append(f'<path d="{B.d_of(hs, 3)}" fill="{INK}"/>')
    dsvg, dtop = details(T, L)
    art.append(dsvg)

    qh, qrender = (qty_block_bi if V3 else qty_block)(T, L / 2)
    gap = 0.05 * H
    zone_top, zone_bot = hb[3] + 0.05 * H, dtop - 0.05 * H
    hc = (0.34 if V2 else 0.32) * H      # cup drawing height, shrunk if the stack does not fit
    hc = min(hc, (zone_bot - zone_top) - (gap + qh))
    stack = hc + gap + qh
    y = zone_top + (zone_bot - zone_top - stack) / 2
    art.append(cup_svg(L / 2, y, hc))
    y += hc + gap
    art.append(qrender(y))
    return "\n".join(art)


def narrow_panel(T):
    art = []
    lb = ink_box(logo_parts()[0])
    dsvg, dtop = details(T, W)
    if not V2:
        logo_w = 0.58 * W
        logo_h = (lb[3] - lb[1]) * logo_w / (lb[2] - lb[0])
        lsvg, _ = place_logo(logo_w, W / 2, (H - logo_h) / 2)
        return "\n".join([lsvg, dsvg])
    # symbols on top, then logo and "1000 כוסות · 8Boz", band at the foot
    sz, sgap, sy = 0.12 * H, 0.04 * W, 0.06 * H
    x0 = W / 2 - sz - sgap / 2
    for sym, x in ((sym_up, x0), (sym_dry, x0 + sz + sgap)):
        art.append(f'<rect x="{x:.3f}" y="{sy:.3f}" width="{sz:.3f}" height="{sz:.3f}" rx="{0.08 * sz:.3f}" '
                   f'fill="none" stroke="{INK}" stroke-width="{0.004 * H:.3f}"/>')
        art.append(sym(x + 0.12 * sz, sy + 0.12 * sz, 0.76 * sz))
    logo_w = 0.54 * W
    logo_h = (lb[3] - lb[1]) * logo_w / (lb[2] - lb[0])
    gap = 0.05 * H
    zone_top, zone_bot = sy + sz + 0.04 * H, dtop - 0.04 * H
    if V3:   # "כוסות נייר 8Boz" over "סה״כ: 1000 יחידות"
        k1 = min(0.062 * H / 100, 0.80 * W / tw(T, "head"))
        k2 = 0.048 * H / 100
        b1 = ink_box(B.parse(T["head"]["d"]))
        b2 = ink_box(B.parse(T["qh2"]["d"]))
        cap1, d1, cap2 = -b1[1] * k1, b1[3] * k1, -b2[1] * k2
        lead = 0.03 * H
        text_h = cap1 + d1 + lead + cap2 + b2[3] * k2
        y = zone_top + (zone_bot - zone_top - (logo_h + gap + text_h)) / 2
        art.append(place_logo(logo_w, W / 2, y)[0])
        base1 = y + logo_h + gap + cap1
        art.append(put(T, "head", k1, W / 2, base1)[0])
        art.append(put(T, "qh2", k2, W / 2, base1 + d1 + lead + cap2)[0])
        art.append(dsvg)
        return "\n".join(art)
    nq = B.parse(T["nqty"]["d"])
    kq = (0.068 * H) / 100
    nq_h = (ink_box(nq)[3] - ink_box(nq)[1]) * kq
    y = zone_top + (zone_bot - zone_top - (logo_h + gap + nq_h)) / 2
    lsvg, _ = place_logo(logo_w, W / 2, y)
    art.append(lsvg)
    qs, _ = place(nq, kq, W / 2, y + logo_h + gap)
    art.append(f'<path d="{B.d_of(qs, 3)}" fill="{INK}"/>')
    art.append(dsvg)
    return "\n".join(art)


# ---------------------------------------------------------------- v4: the Dentes layout

# Left column of the wide side: where Dentes has its black bar. Roei (22.11.26): the cup drawing there instead of
# a bar with the logo, and the plain logo (no bar) on the narrow sides.
COL_X, COL_W, COL_H = 0.085 * L, 0.27 * L, 0.585 * H
XR = L - 0.075 * L                                       # right text edge on the wide side


def contacts(T, cx, top):
    """The three contact lines, centred on cx, ink top at `top`. Returns (svg, height)."""
    kc = 0.78 * COL_W / max(tw(T, f"c{i}") for i in range(3))
    boxes = [ink_box(B.parse(T[f"c{i}"]["d"])) for i in range(3)]
    cap, desc, pitch = -min(b[1] for b in boxes) * kc, max(b[3] for b in boxes) * kc, 165 * kc
    svg = "\n".join(put(T, f"c{i}", kc, cx, top + cap + i * pitch)[0] for i in range(3))
    return svg, cap + 2 * pitch + desc


def contacts_h(T):
    return contacts(T, 0, 0)[1]


def symbols(x_right, bottom, sz):
    """The two ISO 780 symbols in frames, side by side, right edge at x_right."""
    out, sgap = [], 0.22 * sz
    for sym, x in ((sym_up, x_right - 2 * sz - sgap), (sym_dry, x_right - sz)):
        out.append(f'<rect x="{x:.3f}" y="{bottom - sz:.3f}" width="{sz:.3f}" height="{sz:.3f}" rx="{0.08 * sz:.3f}" '
                   f'fill="none" stroke="{INK}" stroke-width="{0.004 * H:.3f}"/>')
        out.append(sym(x + 0.12 * sz, bottom - sz + 0.12 * sz, 0.76 * sz))
    return "\n".join(out)


def wide_panel_v4(T):
    art = []
    # left column: cup drawing (rim as wide as the column) over the contact lines
    cx = COL_X + COL_W / 2
    hc = 0.88 * COL_W / 0.80
    gap = 0.045 * H
    ch = contacts_h(T)
    y = (COL_H - (hc + gap + ch)) / 2 + 0.01 * H
    art.append(cup_svg(cx, y, hc))
    art.append(contacts(T, cx, y + hc + gap)[0])
    # title, right-aligned
    area = XR - (COL_X + COL_W + 0.05 * L)
    kt = 0.94 * area / max(tw(T, "head_en"), tw(T, "head"))
    base_en = 0.29 * H
    art.append(put(T, "head_en", kt, XR, base_en, "r")[0])
    art.append(put(T, "head", kt, XR, base_en + 125 * kt, "r")[0])
    # quantities: English under the cup (left-aligned), Hebrew on the right (right-aligned)
    wh = max(tw(T, f"qh{i}") for i in range(3))
    we = max(tw(T, f"qe{i}") for i in range(3))
    kq = min(0.037 * H / 100, (XR - COL_X - 0.07 * L) / (wh + we))
    for i in range(3):
        base = 0.68 * H + i * 145 * kq
        art.append(put(T, f"qe{i}", kq, COL_X, base, "l")[0])
        art.append(put(T, f"qh{i}", kq, XR, base, "r")[0])
    # write-in lines and symbols at the foot
    kc = 0.030 * H / 100
    base = 0.915 * H
    line_len, lw = 0.13 * L, 0.0035 * H
    x = COL_X
    for name in ("carton", "order"):
        s, bx = put(T, name, kc, x, base, "l")
        art.append(s)
        x0 = bx[2] + 0.012 * L
        art.append(f'<rect x="{x0:.3f}" y="{base - lw:.3f}" width="{line_len:.3f}" height="{lw:.3f}" fill="{INK}"/>')
        x = x0 + line_len + 0.045 * L
    art.append(symbols(XR, base + 0.004 * H, 0.085 * H))
    return "\n".join(art)


def narrow_panel_v4(T):
    art = []
    # symbols centred on top, as in v2
    sz, sy = 0.085 * H, 0.055 * H
    art.append(symbols(W / 2 + sz + 0.11 * sz, sy + sz, sz))
    # the regular logo (black leaf, unprinted lettering), contact lines under it
    lb = ink_box(logo_parts()[0])
    logo_w = 0.52 * W
    logo_h = (lb[3] - lb[1]) * logo_w / (lb[2] - lb[0])
    gap, ch = 0.035 * H, contacts_h(T)
    zone_top, zone_bot = sy + sz + 0.035 * H, 0.615 * H
    y = zone_top + (zone_bot - zone_top - (logo_h + gap + ch)) / 2
    art.append(place_logo(logo_w, W / 2, y)[0])
    art.append(contacts(T, W / 2, y + logo_h + gap)[0])
    # title and total
    k1 = min(0.068 * H / 100, 0.78 * W / tw(T, "head"))
    base1 = 0.725 * H
    art.append(put(T, "head", k1, W / 2, base1)[0])
    k2 = k1 * 0.62
    art.append(put(T, "head_en", k2, W / 2, base1 + 118 * k2)[0])
    k3 = 0.040 * H / 100
    art.append(put(T, "qh2", k3, W / 2, 0.87 * H)[0])
    art.append(put(T, "qe2", k3 * 0.85, W / 2, 0.87 * H + 135 * k3 * 0.85)[0])
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
    OUT.mkdir(parents=True, exist_ok=True)
    T = outline(TEXTS)
    wide, narrow = (wide_panel_v4(T), narrow_panel_v4(T)) if V4 else (wide_panel(T), narrow_panel(T))
    xs, panels, outline_pts, creases, FW, FH = flat_geometry()

    def art_on_flat():
        g = []
        for i, (a, b, kind) in enumerate(panels):
            art = wide if kind == "wide" else narrow
            g.append(f'<g transform="translate({a:.2f} {FLAP:.2f})">{art}</g>')
        if V2:   # the band runs past the free edge of the last side (bleed)
            g.append(f'<rect x="{xs[5]:.2f}" y="{FLAP + H - BAND:.2f}" width="{BLEED}" height="{BAND + BLEED:.2f}" fill="{INK}"/>')
        return "\n".join(g)

    # print file
    m = 20.0
    notes = [
        "Paper cup carton 8B: printed regular slotted carton (RSC). Example proportions: fit to the factory dieline.",
        "Board: white corrugated. Print 1 colour: black.",
    ] + ([
        "Logo: the leaf is printed black; its lettering gets no ink (white board).",
        "Wide sides: cup drawing and contact lines (left), bilingual title (right), quantities (English left, Hebrew",
        "right), CARTON NO. / ORDER NO. write-in lines, ISO 780 symbols.",
        "Narrow sides: ISO 780 symbols, logo, contact lines, title and total.",
        "Keep the artwork in proportion. All text is converted to outlines.",
    ] if V4 else [
        "Logo: the leaf is printed black; its lettering gets no ink (white board).",
        "Wide sides: title, cup drawing, quantity box. Narrow sides: logo. Contact line on all four sides.",
        "Keep the artwork centred on each side and in proportion. All text is converted to outlines.",
    ]) + ([
        "v2: black band at the foot of each side, contact line in it unprinted; band bleeds 3 mm past the crease and the free edge.",
        "v2: 'this way up' and 'keep dry' symbols (ISO 780) on top of the narrow sides.",
    ] if V2 else []) + [
        "Magenta = guides only, do not print. Solid = cut. Dashed = crease.",
    ]
    notes_h = 13.0 + 6.6 * len(notes)
    PW, PH = FW + 2 * m, FH + 2 * m + notes_h
    tag = "" if VARIANT == "v1" else f" ({VARIANT})"
    note_svg = [f'<text x="{m}" y="{m + 6}" font-size="11" font-weight="bold">Paper cups 8B: carton artwork{tag}</text>']
    note_svg += [f'<text x="{m}" y="{m + 17 + 6.6 * i:.1f}">{t}</text>' for i, t in enumerate(notes)]
    body = "\n".join([
        f'<g transform="translate({m} {m + notes_h})">',
        f'<g id="print">{art_on_flat().replace(KNOCK, "#FFFFFF")}</g>',
        f'<g id="non-printing" fill="none" stroke="{GUIDE}" stroke-width="0.6">',
        f'<path d="{poly_d(outline_pts)}"/>',
        f'<path d="{"".join(creases)}" stroke-dasharray="6 4"/>',
        '</g></g>',
        f'<g id="notes" fill="{GUIDE}" font-family="Arial, Helvetica, sans-serif" font-size="5.2">{"".join(note_svg)}</g>',
    ])
    B.write_svg(OUT / "box-8b-print.svg", PW, PH, body, "paper cups 8B carton, print file")
    B.svg_to_pdf(OUT / "box-8b-print.svg", PW, PH)

    # one panel each, on its outline
    for kind, w, art in (("wide", L, wide), ("narrow", W, narrow)):
        pm = 10.0
        b = (f'<g transform="translate({pm} {pm})"><g id="print">{art.replace(KNOCK, "#FFFFFF")}</g>'
             f'<rect width="{w}" height="{H}" fill="none" stroke="{GUIDE}" stroke-width="0.5" stroke-dasharray="6 4"/></g>')
        f = OUT / f"box-panel-{kind}.svg"
        B.write_svg(f, w + 2 * pm, H + 2 * pm, b, f"paper cups 8B carton, {kind} side artwork")
        B.svg_to_pdf(f, w + 2 * pm, H + 2 * pm)

    # previews (scratch SVGs)
    tmpd = pathlib.Path(tempfile.mkdtemp(prefix="box-prev-"))
    try:
        pm = 30.0
        prev = (f'<rect width="{FW + 2 * pm}" height="{FH + 2 * pm}" fill="#ECEEF1"/>'
                f'<g transform="translate({pm} {pm})"><path d="{poly_d(outline_pts)}" fill="{BOARD}" stroke="#9AA0AA" stroke-width="1"/>'
                f'<path d="{"".join(creases)}" fill="none" stroke="#B9BEC7" stroke-width="1.2" stroke-dasharray="7 5"/>'
                f'{art_on_flat().replace(KNOCK, BOARD)}</g>')
        B.write_svg(tmpd / "flat.svg", FW + 2 * pm, FH + 2 * pm, prev, "flat")
        pxw = 2000
        pxh = round(pxw * (FH + 2 * pm) / (FW + 2 * pm))
        (tmpd / "flat.html").write_text(
            f'<html><body style="margin:0"><img src="flat.svg" style="display:block;width:{pxw}px;height:{pxh}px"></body></html>')
        B.html_to_png(tmpd / "flat.html", OUT / "box-8b-flat.png", pxw, pxh, 3000)

        for kind, w, art in (("wide", L, wide), ("narrow", W, narrow)):
            B.write_svg(tmpd / f"{kind}.svg", w, H, f'<rect width="{w}" height="{H}" fill="{BOARD}"/>{art.replace(KNOCK, BOARD)}', kind)
        B.write_svg(tmpd / "top.svg", L, W,
                    f'<rect width="{L}" height="{W}" fill="{BOARD}"/><path d="M0 {W / 2}H{L}" stroke="#C9CDD3" stroke-width="2"/>'
                    f'<rect x="0" y="{W / 2 - 25}" width="{L}" height="50" fill="#DDE1E6" opacity=".7"/>', "top")
        s = 1.3   # px per mm in the scene
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
        B.html_to_png(tmpd / "mock.html", OUT / "box-8b-mockup.png", 1500, 1150, 3000)
    finally:
        shutil.rmtree(tmpd, ignore_errors=True)
    print("flat", round(FW), "x", round(FH), "mm")


if __name__ == "__main__":
    build()
