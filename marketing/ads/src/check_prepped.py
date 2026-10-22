"""Each product must have its real-world size on record and a clean prepped cutout."""
import pathlib
import sys

import numpy as np
from PIL import Image

from build import AXIS, CM

HERE = pathlib.Path(__file__).parent
EXISTING = ["plate", "beer", "cup_paper", "cold", "spoon", "fork", "rolls", "rolls2", "jumbo"]
# The Meta set's additions. Only these get the cutout-quality checks: the August items
# shipped long ago, and some of them (forks, the spoon) are thin by nature.
NEW = ["gold", "carton", "squeegee", "bins"]
# Roei's picks for the category tiles. Shown at fixed heights inside a tile rather than
# at real-world scale, so they carry no CM entry.
TILES = ["p5012", "compact50", "jumbo_tp", "cup500", "a4", "pens", "binder",
         "jet", "kh7", "gloves", "wipes",
         "bags_trash", "bags_vest", "bags_custom", "bags_branded"]
fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


for name in EXISTING + NEW:
    check(name in CM and name in AXIS, f"{name}: real-world size and axis recorded")
    check((HERE / "prepped" / f"{name}.png").exists(), f"{name}: prepped cutout exists")

for name in TILES:
    check((HERE / "prepped" / f"{name}.png").exists(), f"{name}: prepped cutout exists")

for name in NEW + TILES:
    p = HERE / "prepped" / f"{name}.png"
    if not p.exists():
        continue
    a = np.asarray(Image.open(p).convert("RGBA"))[:, :, 3]
    corners = [int(a[0, 0]), int(a[0, -1]), int(a[-1, 0]), int(a[-1, -1])]
    check(max(corners) < 16, f"{name}: transparent corners {corners}")
    solid = float((a > 200).mean())
    # A white product on a white ground is where the flood fill eats holes through the
    # body; a solid share this low means the cutout is shredded.
    check(solid > 0.15, f"{name}: solid body ({solid:.0%} opaque)")

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILURES"))
sys.exit(1 if fails else 0)
