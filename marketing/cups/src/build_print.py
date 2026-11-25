"""Print files for the branded coffee cup (design chosen 18.11.26: deep-green cup, "coffee" + logo leaf knocked out).

Inputs
  assets/coffee_outline.json   "coffee" in Assistant 600, outlined (outline.html, positions taken from Chrome's own layout)
  ../../ads/src/assets/aroam_logo_vector.svg   the real vector logo; only the leaf is used
  ../drafts/cup_deep.png       the approved mockup

Outputs (../print/)
  coffee-logo-shape.svg/.pdf      the logo as one colour, flat
  coffee-logo-on-green.svg/.pdf   the same on the cup green, as it prints (white = no ink)
  cup-wrap-<size>.svg/.pdf        flat sidewall with the logo bent to the cone, twice: on both sides of the cup,
                                  180 degrees apart, each a quarter turn from the seam (Roei, 23.11.26)
  cup-print-spec.pdf              one-page sheet for the factory: wrap, colour code, print (build_spec.py)

The lockup copies the mockup exactly (units = mockup px): text at 68, letter-spacing -0.01em, leaf 32 wide,
6 after the text, its box sitting 1 unit below the baseline.
"""
import json, math, pathlib, re, subprocess, os, signal, shutil, tempfile

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent / "print"
LOGO_SVG = HERE.parents[1] / "ads/src/assets/aroam_logo_vector.svg"
MOCKUP = HERE.parent / "drafts/cup_deep.png"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

GREEN = "#1A4231"
PANTONE = "Pantone 3435 C"
# Measured on the approved mockup: logo ink width = 20.9% of the cup circumference at the logo's height,
# logo centre 53.5% of the sidewall up from the bottom.
WIDTH_SHARE = 0.209
CENTRE_UP = 0.535
BLEED = 3.0      # mm, all round
OVERLAP = 6.0    # mm, seam overlap allowance on one side
# The cup is 8oz only (Roei, 22.11.26: no other sizes). Typical size; the factory's own dieline overrides it.
SIZES = [
    ("8oz", 80.0, 56.0, 92.0),
]

# ---------------------------------------------------------------- paths

TOKEN = re.compile(r"[MLQCZmlqcz]|-?\d*\.?\d+(?:e-?\d+)?")
ARITY = {"M": 1, "L": 1, "Q": 2, "C": 3, "Z": 0}


def parse(d):
    """Absolute M/L/Q/C/Z path -> list of subpaths, each a list of (cmd, points)."""
    toks, i, subs, cur = TOKEN.findall(d), 0, [], None
    cmd = None
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            if t.islower():
                raise ValueError("relative path commands are not expected here")
            cmd = t
            i += 1
            if cmd == "Z":
                cur.append(("Z", []))
                continue
        n = ARITY[cmd]
        pts = [(float(toks[i + 2 * k]), float(toks[i + 2 * k + 1])) for k in range(n)]
        i += 2 * n
        if cmd == "M":
            cur = [("M", pts)]
            subs.append(cur)
            cmd = "L"  # implicit lineto after a moveto
        else:
            cur.append((cmd, pts))
    return subs


def mapped(subs, f):
    """Affine/any point map applied to control points (only used for exact affine maps)."""
    return [[(c, [f(p) for p in pts]) for c, pts in sub] for sub in subs]


def flatten(subs, step):
    """Subpaths -> closed polylines, segments no longer than `step` (in the subpaths' units)."""
    polys = []
    for sub in subs:
        poly, p0, start = [], None, None
        for c, pts in sub:
            if c == "M":
                p0 = start = pts[0]
                poly = [p0]
                continue
            if c == "Z":
                if p0 != start:
                    seg = [p0, start]
                    n = max(1, math.ceil(math.dist(*seg) / step))
                    poly += [(p0[0] + (start[0] - p0[0]) * k / n, p0[1] + (start[1] - p0[1]) * k / n) for k in range(1, n + 1)]
                    p0 = start
                continue
            if c == "L":
                p1 = pts[0]
                n = max(1, math.ceil(math.dist(p0, p1) / step))
                poly += [(p0[0] + (p1[0] - p0[0]) * k / n, p0[1] + (p1[1] - p0[1]) * k / n) for k in range(1, n + 1)]
            elif c == "Q":
                c1, p1 = pts
                n = max(4, math.ceil((math.dist(p0, c1) + math.dist(c1, p1)) / step))
                for k in range(1, n + 1):
                    t = k / n
                    poly.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c1[0] + t * t * p1[0],
                                 (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c1[1] + t * t * p1[1]))
            elif c == "C":
                c1, c2, p1 = pts
                n = max(4, math.ceil((math.dist(p0, c1) + math.dist(c1, c2) + math.dist(c2, p1)) / step))
                for k in range(1, n + 1):
                    t = k / n
                    a, b, cc, dd = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
                    poly.append((a * p0[0] + b * c1[0] + cc * c2[0] + dd * p1[0], a * p0[1] + b * c1[1] + cc * c2[1] + dd * p1[1]))
            p0 = pts[-1]
        polys.append(poly)
    return polys


def d_of(subs, nd=4):
    out = []
    for sub in subs:
        for c, pts in sub:
            out.append(c + " ".join(f"{x:.{nd}f} {y:.{nd}f}" for x, y in pts))
    return "".join(out)


def d_poly(polys, nd=3):
    return "".join("M" + "L".join(f"{x:.{nd}f} {y:.{nd}f}" for x, y in p) + "Z" for p in polys)


# ---------------------------------------------------------------- the lockup (mockup units, y down, baseline 0)

def lockup():
    j = json.loads((HERE / "assets/coffee_outline.json").read_text())
    text = parse(j["d"])
    svg = LOGO_SVG.read_text(encoding="utf8")
    leaf_d = re.search(r'<g id="leaf"[^>]*>.*?<path[^>]* d="([^"]+)"', svg, re.S).group(1)
    k = 32 / 180                       # leaf drawn 32 wide from viewBox "-1 -1 180 112"
    box_h = 112 * k
    x0, top = j["advance"] + 6, 1 - box_h
    leaf = mapped(parse(leaf_d), lambda p: (x0 + (p[0] + 1) * k, top + (p[1] + 1) * k))
    return text + leaf


def bbox(polys):
    xs = [x for p in polys for x, _ in p]
    ys = [y for p in polys for _, y in p]
    return min(xs), min(ys), max(xs), max(ys)


LOCK = lockup()
LB = bbox(flatten(LOCK, 0.05))           # ink bounds in mockup units
LW, LH = LB[2] - LB[0], LB[3] - LB[1]
LCX, LCY = (LB[0] + LB[2]) / 2, (LB[1] + LB[3]) / 2


def logo_mm(width):
    """Lockup scaled to `width` mm, centred on (0, 0), y down."""
    s = width / LW
    return mapped(LOCK, lambda p: ((p[0] - LCX) * s, (p[1] - LCY) * s))


# ---------------------------------------------------------------- cup geometry

def cup(top_d, bot_d, h):
    R, r = top_d / 2, bot_d / 2
    s = math.hypot(h, R - r)
    Ro = s * R / (R - r)
    Ri = Ro - s
    theta = 2 * math.pi * R / Ro
    t_c = CENTRE_UP * s                          # logo centre, along the wall from the bottom
    circ = 2 * math.pi * (r + (R - r) * CENTRE_UP)
    width = WIDTH_SHARE * circ
    return dict(R=R, r=r, h=h, s=s, Ro=Ro, Ri=Ri, theta=theta, t_c=t_c, circ=circ, width=width,
                height=width * LH / LW, up=t_c * h / s)


def logo_width(size):
    return round(cup(*size[1:])["width"], 1)


# ---------------------------------------------------------------- SVG writers

def write_svg(path, w, h, body, title):
    path.write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.3f}mm" height="{h:.3f}mm" viewBox="0 0 {w:.3f} {h:.3f}">\n'
        f'<title>{title}</title>\n{body}\n</svg>\n', encoding="utf8")


def logo_files():
    size = SIZES[0]
    W = logo_width(size)
    lg = logo_mm(W)
    pad = 4.0
    w, h = W + 2 * pad, W * LH / LW + 2 * pad
    t = lambda p: (p[0] + w / 2, p[1] + h / 2)
    d = d_of(mapped(lg, t))
    write_svg(OUT / "coffee-logo-shape.svg", w, h,
              f'<path d="{d}" fill="#000000"/>',
              'coffee logo, single colour shape')
    write_svg(OUT / "coffee-logo-on-green.svg", w, h,
              f'<rect width="{w:.3f}" height="{h:.3f}" fill="{GREEN}"/>\n<path d="{d}" fill="#FFFFFF"/>',
              f'coffee logo knocked out of {PANTONE}')
    return w, h


def wrap_file(name, top_d, bot_d, h):
    g = cup(top_d, bot_d, h)
    Ri, Ro, th, s = g["Ri"], g["Ro"], g["theta"], g["s"]
    # flood: rim + bleed down to bottom - bleed, both ends + bleed, one end + seam overlap
    ro, ri = Ro + BLEED, Ri - BLEED

    def ang(mm, rad):
        return mm / rad

    a_left = th / 2 + ang(BLEED + OVERLAP, Ri)       # widest at the inner radius
    a_right = th / 2 + ang(BLEED, Ri)

    # page: apex below the artwork, rim (outer arc) on top
    margin = 12.0
    half = max(a_left, a_right)
    xs = [ro * math.sin(-a_left), ro * math.sin(a_right), ri * math.sin(-a_left), ri * math.sin(a_right)]
    ys = [-ro, -ri * math.cos(half), -ro * math.cos(half)]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    title_h = 34.0
    W = maxx - minx + 2 * margin
    H = maxy - miny + 2 * margin + title_h
    ax, ay = margin - minx, margin + title_h - miny     # apex position on the page

    def P(rho, phi):
        return ax + rho * math.sin(phi), ay - rho * math.cos(phi)

    def arc(rho, a0, a1, n=240):
        return [P(rho, a0 + (a1 - a0) * k / n) for k in range(n + 1)]

    flood = arc(ro, -a_left, a_right) + arc(ri, a_right, -a_left)
    trim = arc(Ro, -th / 2, th / 2) + arc(Ri, th / 2, -th / 2)
    seam = [P(Ri, -th / 2 - ang(OVERLAP, Ri)), P(Ro, -th / 2 - ang(OVERLAP, Ro))]

    # logo, bent to the cone: (x along the wall, y down) -> polar
    lg = flatten(logo_mm(g["width"]), 0.08)

    # twice, on both sides of the cup (Roei, 23.11.26): 180 degrees apart, each a quarter turn from the seam
    def warp(p, phi0):
        rho = Ri + g["t_c"] - p[1]
        return P(rho, phi0 + p[0] / rho)

    centres = (-th / 4, th / 4)
    logo = [[warp(p, c) for p in poly] for c in centres for poly in lg]

    # centre-line marks and labels (non-printing)
    mark = "#E6007E"
    cmarks = "".join(f"M{P(ro + 6, c)[0]:.3f} {P(ro + 6, c)[1]:.3f}L{P(ro, c)[0]:.3f} {P(ro, c)[1]:.3f}"
                     f"M{P(ri, c)[0]:.3f} {P(ri, c)[1]:.3f}L{P(ri - 6, c)[0]:.3f} {P(ri - 6, c)[1]:.3f}" for c in centres)
    body = [
        '<g id="print">',
        f'<path d="{d_poly([flood])}" fill="{GREEN}"/>',
        f'<path d="{d_poly(logo)}" fill="#FFFFFF"/>',
        '</g>',
        f'<g id="non-printing" fill="none" stroke="{mark}" stroke-width="0.25">',
        f'<path d="{d_poly([trim])}" stroke-dasharray="2 1.2"/>',
        f'<path d="M{seam[0][0]:.3f} {seam[0][1]:.3f}L{seam[1][0]:.3f} {seam[1][1]:.3f}" stroke-dasharray="0.8 0.8"/>',
        f'<path d="{cmarks}"/>',
        '</g>',
        f'<g id="notes" fill="{mark}" font-family="Arial, Helvetica, sans-serif" font-size="3">',
        f'<text x="{margin}" y="{margin + 2}" font-size="4.6" font-weight="bold">coffee cup — {name} sidewall wrap</text>',
    ]
    lines = [
        f"Colour: {PANTONE} (ref. HEX {GREEN}), full flood over the outer wall. 1 colour.",
        f"Flood includes {BLEED:g} mm bleed and {OVERLAP:g} mm seam overlap (left).",
        "Logo = knockout (unprinted white board, no white ink), twice: both sides, 180 deg apart, 1/4 turn from the seam.",
        "Bent to the cone. On the factory dieline keep the logos' proportions and positions. Magenta ticks = logo centres.",
        "Magenta = guides only, do not print. Dashed = cup edge (rim on top). Dotted = seam.",
    ]
    body += [f'<text x="{margin}" y="{margin + 7.6 + 4.2 * i:.1f}">{t}</text>' for i, t in enumerate(lines)]
    body.append('</g>')
    write_svg(OUT / f"cup-wrap-{name}.svg", W, H, "\n".join(body), f"coffee cup {name} wrap")
    return W, H, g


# ---------------------------------------------------------------- PDF via Chrome

def chrome(args, timeout=60):
    tmp = tempfile.mkdtemp(prefix="chrome-cups-")
    try:
        p = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--allow-file-access-from-files",
                              f"--user-data-dir={tmp}", *args],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        try:
            p.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(p.pid, signal.SIGKILL)
            raise
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def svg_to_pdf(svg_path, w, h):
    html = svg_path.with_suffix(".tmp.html")
    html.write_text(
        f'<!doctype html><html><head><meta charset="utf-8"><style>@page{{size:{w:.3f}mm {h:.3f}mm;margin:0}}'
        f'html,body{{margin:0;padding:0}}img{{display:block;width:{w:.3f}mm;height:{h:.3f}mm}}</style></head>'
        f'<body><img src="{svg_path.name}"></body></html>', encoding="utf8")
    pdf = svg_path.with_suffix(".pdf")
    try:
        chrome(["--no-pdf-header-footer", f"--print-to-pdf={pdf}", "--virtual-time-budget=3000", f"file://{html}"])
    finally:
        html.unlink(missing_ok=True)
    return pdf


def html_to_pdf(html, pdf, budget=9000):
    chrome(["--no-pdf-header-footer", f"--print-to-pdf={pdf}", f"--virtual-time-budget={budget}", f"file://{html}"], 90)


def html_to_png(html, png, w, h, budget=9000):
    chrome(["--hide-scrollbars", "--force-device-scale-factor=1", f"--window-size={w},{h}",
            f"--screenshot={png}", f"--virtual-time-budget={budget}", f"file://{html}"], 90)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    w, h = logo_files()
    for n in ("coffee-logo-shape", "coffee-logo-on-green"):
        svg_to_pdf(OUT / f"{n}.svg", w, h)
    for name, t, b, hh in SIZES:
        W, H, g = wrap_file(name, t, b, hh)
        svg_to_pdf(OUT / f"cup-wrap-{name}.svg", W, H)
        print(name, f"{W:.1f} x {H:.1f} mm page")
