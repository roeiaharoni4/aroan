"""Render the ad assets.

Every product is placed at its REAL-WORLD size via a shared pixels-per-cm figure,
which is what fixes the original assets' worst flaw (a 200ml cup drawn larger than
a 9-roll jumbo pack). Products keep their white-normalised backgrounds and are
composited with `mix-blend-mode: multiply`, so the white simply disappears against
the cream field - no cutout, no fringing, no lost rims.
"""
import base64
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# The repo's own logo raster. The traced SVG in the ad skill renders its tagline
# ("שיווק והפצה") as broken letterforms at small sizes, so the real asset wins.
LOGO = pathlib.Path(
    "/Users/roeiaharoni/Desktop/קטלוג לקוחות/aroan/images/logo_512.png"
)

# Site brand identity (CLAUDE.md): pastel greens. These are the colours Roei's own
# assets used, so the redesign stays recognisably his.
GREEN_DARK = "#1A4231"
GREEN = "#639C7D"
PASTEL = "#8FD6A3"
CREAM = "#F4F3EF"

# Real-world long dimension in cm. This table is the whole point of the redesign.
CM = {
    "plate": 26.0,    # צלחת מתכלה, קוטר 26 ס"מ
    "beer": 12.5,     # כוס 330 מ"ל
    "cup_paper": 9.2, # כוס נייר 8oz
    "cold": 9.0,      # מקבץ כוסות 180 מ"ל
    "spoon": 15.0,    # כף קשיחה, עומדת
    "fork": 16.0,     # מזלגות, שוכבים
    "rolls": 40.0,    # מארז 6 גלילי ניגוב ידיים
    "rolls2": 38.0,   # מארז 6 גלילי תאית
    "jumbo": 22.0,    # גליל תעשייתי ורד צר
}
# Which dimension the cm figure refers to
AXIS = {"plate": "h", "beer": "h", "cup_paper": "h", "cold": "h",
        "spoon": "h", "fork": "w", "rolls": "w", "rolls2": "w", "jumbo": "h"}


def data_uri(path):
    b = pathlib.Path(path).read_bytes()
    mime = "image/svg+xml" if str(path).endswith(".svg") else "image/png"
    return f"data:{mime};base64," + base64.b64encode(b).decode()


def product_size(name, ppc):
    """On-canvas (width, height) for a product at the shared pixels-per-cm scale."""
    from PIL import Image
    im = Image.open(HERE / "prepped" / f"{name}.png")
    target = CM[name] * ppc
    if AXIS[name] == "h":
        return im.width * (target / im.height), target
    return target, im.height * (target / im.width)


def group_offset(items, ppc):
    """Delta that centres the cluster's real extent on its anchor.

    The plate is far wider than anything else, so laying out on nominal offsets alone
    drags the whole group to one side and leaves dead space opposite it. Returns a
    correction to add to each offset - the caller still adds the anchor itself.
    """
    lo = min(dx - product_size(n, ppc)[0] / 2 for n, dx, *_ in items)
    hi = max(dx + product_size(n, ppc)[0] / 2 for n, dx, *_ in items)
    return -(lo + hi) / 2


def product_html(name, ppc, left, bottom, rot=0, sizes=None):
    """Place one product with its base sitting on `bottom` (px from canvas bottom).

    Deliberately no z-index: a positioned element with a z-index creates a stacking
    context, which traps `mix-blend-mode` inside the wrapper and leaves the product's
    white background visible as a box. Layering is by DOM order instead.
    """
    from PIL import Image
    im = Image.open(HERE / "prepped" / f"{name}.png")
    target = CM[name] * ppc
    if AXIS[name] == "h":
        h = target
        w = im.width * (target / im.height)
        scale = target / im.height
    else:
        w = target
        h = im.height * (target / im.width)
        scale = target / im.width
    if sizes is not None:
        sizes[name] = {"src": [im.width, im.height], "px": [round(w, 1), round(h, 1)],
                       "scale": round(scale, 3), "cm": CM[name]}
    shadow_w = w * 1.02
    return f"""
    <div class="shade" style="left:{left - shadow_w / 2:.1f}px; bottom:{bottom - 12:.1f}px;
         width:{shadow_w:.1f}px;"></div>
    <div class="item" style="left:{left - w / 2:.1f}px; bottom:{bottom:.1f}px;
         width:{w:.1f}px; height:{h:.1f}px;">
      <img src="{data_uri(HERE / 'prepped' / (name + '.png'))}"
           style="transform:rotate({rot}deg)">
    </div>"""


def page(w, h, panel, logo_css, items_html, floor_h):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  html,body {{ width:{w}px; height:{h}px; overflow:hidden; }}
  .canvas {{ position:relative; width:{w}px; height:{h}px; background:{CREAM}; }}

  /* Depth so the light field reads as a lit surface rather than empty white. */
  .glow {{ position:absolute; inset:0;
    background: radial-gradient(65% 60% at 42% 34%,
                rgba(255,255,255,.85) 0%, rgba(255,255,255,0) 60%),
                radial-gradient(80% 70% at 88% 12%,
                rgba(143,214,163,.30) 0%, rgba(143,214,163,.08) 50%, transparent 78%); }}
  .floor {{ position:absolute; left:0; right:0; bottom:0;
    background: linear-gradient(to bottom, transparent 0%, rgba(26,66,49,.05) 60%,
                rgba(26,66,49,.08) 100%); }}

  /* The brand field. Its inner edge fades instead of butting the cream in a hard
     line - the hard 50/50 split is what made the originals read as a template. */
  .panel {{ position:absolute; {panel}
    background: linear-gradient(160deg, {GREEN_DARK} 0%, #23573F 55%, {GREEN_DARK} 100%); }}

  .logo {{ position:absolute; {logo_css} }}
  .logo img {{ width:100%; display:block; }}

  /* Products carry real alpha, so they keep their own white against the cream field
     and the drop shadow follows each silhouette instead of a generic box. */
  .item {{ position:absolute; }}
  .item img {{ width:100%; height:100%; object-fit:contain; display:block;
    filter: drop-shadow(0 6px 9px rgba(14,32,54,.16)); }}
  /* Contact shadow on the ground line - what makes the group sit on a surface
     rather than float, which is the flaw the originals share. */
  .shade {{ position:absolute; height:26px; border-radius:50%;
    background: radial-gradient(50% 50% at 50% 50%,
                rgba(14,32,54,.30) 0%, rgba(14,32,54,.12) 55%, transparent 78%);
    filter: blur(7px); }}
</style></head><body>
<div class="canvas">
  <div class="glow"></div>
  <div class="floor" style="height:{floor_h}px"></div>
  <div class="panel"></div>
  <div class="logo"><img src="{data_uri(LOGO)}"></div>
  {items_html}
</div></body></html>"""


def render(html, out, w, h, slack=200):
    """Screenshot the page at exactly w x h.

    Chrome's --window-size counts window chrome, so the usable viewport comes out
    ~87px shorter than asked and the bottom of the canvas is silently cropped. We
    ask for a taller window and cut the exact rectangle back out, then assert the
    canvas really reached the bottom edge so a future Chrome change cannot quietly
    reintroduce the clipped strip.
    """
    from PIL import Image
    import numpy as np

    tmp = HERE / "tmp_page.html"
    tmp.write_text(html, encoding="utf-8")
    raw = HERE / "tmp_shot.png"
    subprocess.run([
        CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=1", f"--window-size={w},{h + slack}",
        f"--screenshot={raw}", "--default-background-color=FF00FFFF",
        tmp.as_uri(),
    ], check=True, capture_output=True)

    im = Image.open(raw).convert("RGB").crop((0, 0, w, h))
    a = np.asarray(im)
    magenta = (a[:, :, 0] > 250) & (a[:, :, 1] < 5) & (a[:, :, 2] > 250)
    if magenta.any():
        rows = np.nonzero(magenta.any(1))[0]
        raise RuntimeError(f"{out}: canvas did not cover rows {rows.min()}..{rows.max()}")
    im.save(out)
