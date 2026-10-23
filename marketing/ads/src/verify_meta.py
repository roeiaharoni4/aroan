"""Check the Meta set against Meta's placement rules and the brand constraints."""
import json
import pathlib
import sys

import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).parent
IMG = HERE.parents[2] / "marketing" / "meta" / "img"
REPORT = HERE / "meta_scale_report.json"

EXPECTED = {
    # the three ads, feed and story
    "bags_feed.png": (1080, 1350), "bags_story.png": (1080, 1920),
    "office_feed.png": (1080, 1350), "office_story.png": (1080, 1920),
    "factory_feed.png": (1080, 1350), "factory_story.png": (1080, 1920),
    # the Page's opening posts - the ads' colours and type, different content
    "post_order.png": (1080, 1350), "post_checklist.png": (1080, 1350),
    "post_steps.png": (1080, 1350), "post_area.png": (1080, 1350),
    "cover.png": (1640, 624),
    "profile.png": (720, 720),
}
MAX_BYTES = 5 * 1024 * 1024
MAX_SCALE = 1.5
LEAF = np.array([130, 178, 32])  # the logo's green
STORY_SAFE = 250                 # Meta covers the top and bottom ~14% of a story with its UI
COVER_SAFE = (270, 1370)         # phones show only the centre ~1100px of a 1640px cover

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def leaf(a):
    return np.abs(a - LEAF).sum(2) < 60


def pixels(name):
    return np.asarray(Image.open(IMG / name).convert("RGB")).astype(int)


print("== files ==")
for name, size in EXPECTED.items():
    f = IMG / name
    check(f.exists(), f"{name}: exists")
    if not f.exists():
        continue
    im = Image.open(f)
    check(im.size == size, f"{name}: {im.size[0]}x{im.size[1]} == {size}")
    check(im.mode == "RGB", f"{name}: mode {im.mode} has no alpha")
    check(f.stat().st_size < MAX_BYTES, f"{name}: {f.stat().st_size / 1024:.0f}KB < 5MB")
    n = int(leaf(pixels(name)).sum())
    check(n > 200, f"{name}: logo present ({n}px leaf green)")

print("\n== story safe zones ==")
for name in [n for n in EXPECTED if n.endswith("_story.png") and (IMG / n).exists()]:
    a = pixels(name)
    for label, band in (("top", a[:STORY_SAFE]), ("bottom", a[-STORY_SAFE:])):
        std = float(band.mean(2).std())
        check(std < 14 and leaf(band).sum() == 0,
              f"{name}: {label} {STORY_SAFE}px is background only (luma std {std:.1f})")

print("\n== cover safe zone ==")
if (IMG / "cover.png").exists():
    m = leaf(pixels("cover.png"))
    lo, hi = COVER_SAFE
    check(m[:, :lo].sum() == 0 and m[:, hi:].sum() == 0,
          f"cover.png: logo inside x={lo}..{hi}")

print("\n== profile circle ==")
if (IMG / "profile.png").exists():
    a = pixels("profile.png")
    yy, xx = np.mgrid[:720, :720]
    outside = (yy - 360) ** 2 + (xx - 360) ** 2 > 340 ** 2
    ink = int((a[outside] < 245).any(axis=1).sum())
    check(ink == 0, f"profile.png: only white outside the circle crop ({ink} ink px)")

print("\n== real-world scale ==")
check(REPORT.exists(), "scale report exists")
if REPORT.exists():
    for asset, items in json.loads(REPORT.read_text()).items():
        if items:
            worst = max(items.items(), key=lambda kv: kv[1]["scale"])
            check(worst[1]["scale"] <= MAX_SCALE + 1e-6,
                  f"{asset}: worst enlargement {worst[0]} x{worst[1]['scale']:.2f} <= {MAX_SCALE}")

print("\n== contact sheet ==")
tiles = []
for name in EXPECTED:
    if (IMG / name).exists():
        im = Image.open(IMG / name).convert("RGB")
        s = 360 / max(im.size)
        tiles.append(im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS))
if tiles:
    pad = 22
    W = sum(t.width for t in tiles) + pad * (len(tiles) + 1)
    sheet = Image.new("RGB", (W, max(t.height for t in tiles) + pad * 2), (245, 245, 244))
    x = pad
    for t in tiles:
        sheet.paste(t, (x, pad))
        x += t.width + pad
    out = HERE / "out" / "_meta_contact_sheet.png"
    out.parent.mkdir(exist_ok=True)
    sheet.save(out)
    print(f"  wrote {out}")

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILURES"))
sys.exit(1 if fails else 0)
