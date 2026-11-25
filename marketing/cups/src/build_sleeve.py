"""Print file for the sleeve of 50 cups, in the factory's own format (Roei sent their drawing, 23.11.26).

The factory's drawing: flat bag 130 x 470 mm, cup stack zone 340 mm (90 mm from the top, 40 mm from the bottom),
side lines 2.5 mm in from each edge, header "7.5OZ-2  50只/提  1000装 / 13*47CM". Their sample was clear and
unprinted; ours carries direction A of the sleeve drafts, printed straight on the film:
a black label (72 mm wide) with white text, centred on the bag, and an empty white box for the barcode.

Two print colours on clear film: black and white. The white is a white ink: logo leaf, text, rule, inner frame and the
barcode box. The black is the label; the logo lettering is left black (no white), so it reads black on the white leaf.
All text is converted to outlines (outline_text.html). The grey of the bag stands for clear film, as in their drawing.

Outputs (../sleeve/): sleeve-8oz-print.svg / .pdf and a preview sleeve-8oz-print.png.
"""
import pathlib, shutil, tempfile
import build_print as B
import build_box as BX

HERE = B.HERE
OUT = HERE.parent / "sleeve"
BX.CACHE = HERE / "assets/sleeve_text.json"      # own outline cache

BAG_W, BAG_H = 130.0, 470.0
CUP_TOP, CUP_BOT = 90.0, 430.0                   # cup stack zone, 340 mm
SIDE = 2.5                                       # dashed side lines
LABEL_W, LABEL_CY = 72.0, 235.0                  # black label, centred on the bag (where their sample text sits)
BLACK, WHITE, CLEAR = "#000000", "#FFFFFF", "#DCDCDC"

TEXTS = [
    dict(name="title", text="כוסות נייר", weight=800, dir="rtl"),
    dict(name="l1", text="לשתייה חמה/קרה", weight=600, dir="rtl"),
    dict(name="l2", text="איכותיות במיוחד", weight=700, dir="rtl"),
    # 8Boz isolated (LRI..PDI) so the line reads "8Boz · 50 יחידות" from the right
    dict(name="l3", text="⁦8Boz⁩ · 50 יחידות", weight=800, dir="rtl"),
    dict(name="det", text="03-6346236 · aroam.co.il", weight=600, dir="ltr"),
]
# (name, em size in mm, gap above in mm)
LINES = [("title", 11.7, 0), ("l1", 6.9, 3.4), ("l2", 6.9, 2.0), ("l3", 7.7, 4.6), ("det", 4.7, 5.2)]
LOGO_W, RULE_W, RULE_T = 39.0, 20.0, 0.7
BAR_W, BAR_H = 34.0, 21.0
PAD, INNER = 7.5, 2.4


def label(T):
    """Black label with white artwork, centred on x = BAG_W / 2. Returns svg (bag coordinates, mm)."""
    cx = BAG_W / 2
    inner_w = LABEL_W - 2 * (INNER + 4.0)
    leaf, letters = BX.logo_parts()
    lb = BX.ink_box(leaf)
    logo_h = (lb[3] - lb[1]) * LOGO_W / (lb[2] - lb[0])

    # measure the stack
    rows = []
    for name, em, gap in LINES:
        bx = BX.ink_box(B.parse(T[name]["d"]))
        k = min(em / 100, inner_w / (bx[2] - bx[0]))
        rows.append((name, k, gap, -bx[1] * k, bx[3] * k))
    text_h = sum(gap + cap + desc for _, _, gap, cap, desc in rows)
    h = PAD + logo_h + 4.6 + RULE_T + 4.6 + text_h + 5.0 + BAR_H + PAD
    y0 = LABEL_CY - h / 2
    x0 = cx - LABEL_W / 2

    out = [f'<rect x="{x0:.3f}" y="{y0:.3f}" width="{LABEL_W:.3f}" height="{h:.3f}" rx="3" fill="{BLACK}"/>',
           f'<rect x="{x0 + INNER:.3f}" y="{y0 + INNER:.3f}" width="{LABEL_W - 2 * INNER:.3f}" height="{h - 2 * INNER:.3f}" '
           f'rx="1.6" fill="none" stroke="{WHITE}" stroke-width="0.6"/>']
    y = y0 + PAD
    # logo: white leaf, lettering left black
    k = LOGO_W / (lb[2] - lb[0])
    mx = (lb[0] + lb[2]) / 2
    f = lambda p: (cx + (p[0] - mx) * k, y + (p[1] - lb[1]) * k)
    out.append(f'<path d="{B.d_of(B.mapped(leaf, f), 3)}" fill="{WHITE}"/>')
    out.append(f'<path d="{B.d_of(B.mapped(letters, f), 3)}" fill="{BLACK}"/>')
    y += logo_h + 4.6
    out.append(f'<rect x="{cx - RULE_W / 2:.3f}" y="{y:.3f}" width="{RULE_W:.3f}" height="{RULE_T:.3f}" fill="{WHITE}"/>')
    y += RULE_T + 4.6
    for name, k, gap, cap, desc in rows:
        y += gap + cap
        out.append(BX.put(T, name, k, cx, y, "c", WHITE)[0])
        y += desc
    y += 5.0
    out.append(f'<rect x="{cx - BAR_W / 2:.3f}" y="{y:.3f}" width="{BAR_W:.3f}" height="{BAR_H:.3f}" rx="0.8" fill="{WHITE}"/>')
    return "\n".join(out), (x0, y0, LABEL_W, h)


def dim_v(x, y0, y1, label_lines, side):
    """Vertical dimension like the factory's: line with end ticks, broken in the middle for the text."""
    mid = (y0 + y1) / 2
    gap = 34
    t = 6
    out = [f'<path d="M{x - t} {y0}H{x + t}M{x - t} {y1}H{x + t}M{x} {y0}V{mid - gap}M{x} {mid + gap}V{y1}" '
           f'stroke="#555" stroke-width="0.35" fill="none"/>']
    rot = -90
    tx = x + (-1 if side == "left" else 1) * 0.5
    lines = "".join(f'<tspan x="0" dy="{0 if i == 0 else 6.2}">{s}</tspan>' for i, s in enumerate(label_lines))
    out.append(f'<text transform="translate({tx} {mid}) rotate({rot})" text-anchor="middle" font-size="5.6" '
               f'dominant-baseline="middle" fill="#222">{lines}</text>')
    return "".join(out)


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    T = BX.outline(TEXTS)
    art, (lx, ly, lw, lh) = label(T)

    ml, mr, mt, mb = 40.0, 40.0, 58.0, 26.0
    PW, PH = BAG_W + ml + mr, BAG_H + mt + mb
    font = 'font-family="Arial, Helvetica, \'PingFang SC\', \'Microsoft YaHei\', sans-serif"'
    head = (f'<g {font} fill="#111" text-anchor="middle">'
            f'<text x="{PW / 2}" y="13" font-size="9" font-weight="bold">7.5OZ-2   50只/提   1000装</text>'
            f'<text x="{PW / 2}" y="24" font-size="7.5" font-weight="bold">13*47CM</text></g>')
    # colour legend (their drawing said: transparent, no print; ours is printed in black and white)
    sw = 7.0
    legend = [(CLEAR, "透明色 Clear film"), (BLACK, "黑色 Black"), (WHITE, "白色 White ink")]
    lg_x = PW / 2 - 66
    leg = []
    for i, (c, txt) in enumerate(legend):
        x = lg_x + i * 46
        leg.append(f'<rect x="{x}" y="30" width="{sw}" height="{sw}" fill="{c}" stroke="#888" stroke-width="0.3"/>'
                   f'<text x="{x + sw + 2}" y="35.3" font-size="4.6" fill="#111">{txt}</text>')
    note = (f'<text x="{PW / 2}" y="46" font-size="3.6" fill="#E6007E" text-anchor="middle">'
            'Print on clear film, 2 colours: black label; white = logo leaf, text, frame, barcode box. '
            'Logo lettering stays black. Text in outlines.</text>'
            f'<text x="{PW / 2}" y="50.6" font-size="3.6" fill="#E6007E" text-anchor="middle">'
            'White box = place for the barcode (to be added). Grey = clear film, not printed.</text>')

    bag = (f'<rect x="0" y="0" width="{BAG_W}" height="{BAG_H}" fill="{CLEAR}" stroke="#777" stroke-width="0.35"/>'
           f'<path d="M{SIDE} 0V{BAG_H}M{BAG_W - SIDE} 0V{BAG_H}" stroke="#9A9A9A" stroke-width="0.3" stroke-dasharray="1.6 1.2"/>'
           f'<path d="M0 {CUP_TOP}H{BAG_W}M0 {CUP_BOT}H{BAG_W}" stroke="#888" stroke-width="0.3"/>')
    dims = (f'<g {font}>'
            + dim_v(-18, CUP_TOP, CUP_BOT, ["杯高尺寸  Cup height", f"{CUP_BOT - CUP_TOP:.2f} mm"], "left")
            + dim_v(BAG_W + 18, 0, BAG_H, ["袋子尺寸  Bag size", f"{BAG_H:.2f} mm"], "right")
            + f'<path d="M0 {BAG_H + 6}V{BAG_H + 18}M{BAG_W} {BAG_H + 6}V{BAG_H + 18}'
              f'M0 {BAG_H + 12}H{BAG_W / 2 - 22}M{BAG_W / 2 + 22} {BAG_H + 12}H{BAG_W}" stroke="#555" stroke-width="0.35"/>'
            + f'<text x="{BAG_W / 2}" y="{BAG_H + 14}" font-size="5.6" text-anchor="middle" fill="#222">{BAG_W:.2f} mm</text>'
            + '</g>')
    body = (head + f'<g {font}>' + "".join(leg) + note + "</g>"
            + f'<g transform="translate({ml} {mt})">{bag}<g id="print">{art}</g>{dims}</g>')
    svg = OUT / "sleeve-8oz-print.svg"
    B.write_svg(svg, PW, PH, body, "paper cups 8oz, sleeve of 50, print file")
    B.svg_to_pdf(svg, PW, PH)

    tmp = pathlib.Path(tempfile.mkdtemp(prefix="sleeve-prev-"))
    try:
        pxw = 900
        pxh = round(pxw * PH / PW)
        (tmp / "p.html").write_text(f'<html><body style="margin:0;background:#fff"><img src="{svg.as_uri()}" '
                                    f'style="display:block;width:{pxw}px;height:{pxh}px"></body></html>', encoding="utf8")
        B.html_to_png(tmp / "p.html", OUT / "sleeve-8oz-print.png", pxw, pxh, 3000)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"page {PW:.0f} x {PH:.0f} mm, label {lw:.1f} x {lh:.1f} mm at y {ly:.1f}")


if __name__ == "__main__":
    build()
