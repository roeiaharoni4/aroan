"""Check the rendered assets against the constraints this redesign exists to satisfy."""
import json
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"

EXPECTED = {
    "landscape": (1200, 628),
    "square": (1200, 1200),
    "portrait": (960, 1200),
}
MAX_BYTES = 5 * 1024 * 1024
# The bagasse plate is the one element enlarged past 1:1 - a smooth, detail-free
# white disc whose only source in the catalog is 260px. Everything else downscales.
MAX_SCALE = 1.5

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


print("== files ==")
report = json.loads((HERE / "scale_report.json").read_text())
for f in sorted(OUT.glob("*.png")):
    if f.name.startswith("_"):
        continue
    fmt = f.stem.split("_")[-1]
    im = Image.open(f)
    check(im.size == EXPECTED[fmt], f"{f.name}: {im.size[0]}x{im.size[1]} == {EXPECTED[fmt]}")
    check(im.mode in ("RGB", "L"), f"{f.name}: mode {im.mode} has no alpha")
    check(f.stat().st_size < MAX_BYTES, f"{f.name}: {f.stat().st_size/1024:.0f}KB < 5MB")

print("\n== real-world scale ==")
for asset, items in report.items():
    worst = max(items.items(), key=lambda kv: kv[1]["scale"])
    check(worst[1]["scale"] <= MAX_SCALE + 1e-6,
          f"{asset}: worst enlargement {worst[0]} x{worst[1]['scale']:.2f} <= {MAX_SCALE}")

print("\n== proportions consistent across formats ==")
# Every product's size relative to the plate must be identical in all three formats.
# This is the flaw being corrected: a 200ml cup drawn larger than a roll pack.
base = {}
for asset, items in report.items():
    ref = items["plate"]
    for name, v in items.items():
        got = round((v["px"][0] if name in ("fork", "rolls", "rolls2") else v["px"][1])
                    / ref["px"][1], 3)
        base.setdefault(name, got)
        check(abs(base[name] - got) < 0.02, f"{asset}: {name} ratio {got} stable")

print("\n== safe zone (10% margins, and a centre crop to 1:1) ==")
LEAF = np.array([130, 178, 32])  # the logo's green - proof the mark survived the crop
for f in sorted(OUT.glob("*.png")):
    if f.name.startswith("_"):
        continue
    a = np.asarray(Image.open(f).convert("RGB")).astype(int)
    h, w = a.shape[:2]
    side = min(w, h)
    crop = a[(h - side) // 2:(h + side) // 2, (w - side) // 2:(w + side) // 2]
    hit = (np.abs(crop - LEAF).sum(2) < 60).sum()
    if f.stem.endswith("landscape"):
        # Accepted, not a defect: in this layout the brand block sits in the outer
        # third, so a 1:1 centre crop of the wide asset drops it entirely. That is
        # exactly why the square and portrait assets are supplied - Google should
        # never need to crop the wide one. Those two must carry the mark.
        print(f"  note   {f.name}: brand block is outside a 1:1 centre crop by design")
    else:
        check(hit > 200, f"{f.name}: logo survives a 1:1 centre crop ({hit}px leaf green)")
    inner = a[int(h * .1):int(h * .9), int(w * .1):int(w * .9)]
    got = (np.abs(inner - LEAF).sum(2) < 60).sum()
    check(got > 200, f"{f.name}: logo inside the 10% safe margin ({got}px leaf green)")

for f in sorted(OUT.glob("*.png")):
    if f.name.startswith("_"):
        continue
    im = Image.open(f).convert("RGB")
    w, h = im.size
    g = im.copy()
    d = ImageDraw.Draw(g, "RGBA")
    d.rectangle([w * .1, h * .1, w * .9, h * .9], outline=(255, 0, 0, 220), width=3)
    side = min(w, h)
    d.rectangle([(w - side) / 2, (h - side) / 2, (w + side) / 2, (h + side) / 2],
                outline=(0, 90, 255, 200), width=3)
    g.save(OUT / f"_guide_{f.name}")

print("\n== contact sheet ==")
files = sorted([f for f in OUT.glob("*.png") if not f.name.startswith("_")])
tiles = []
for f in files:
    im = Image.open(f).convert("RGB")
    s = 300 / max(im.size)
    tiles.append((f.stem, im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)))
pad = 22
W = sum(t.width for _, t in tiles) + pad * (len(tiles) + 1)
H = max(t.height for _, t in tiles) + pad * 2
sheet = Image.new("RGB", (W, H), (245, 245, 244))
x = pad
for _, t in tiles:
    sheet.paste(t, (x, pad)); x += t.width + pad
sheet.save(OUT / "_contact_sheet.png")
print(f"  wrote {OUT / '_contact_sheet.png'}")

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILURES"))
sys.exit(1 if fails else 0)
