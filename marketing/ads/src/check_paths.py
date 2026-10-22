"""Fail fast when an asset path points outside the repo or at a missing file.

The repo moved from ~/Desktop/קטלוג לקוחות/aroan to ~/aroan on 27.8.26 and the August
pipeline kept its absolute Desktop paths, so it could no longer render anything.
"""
import pathlib
import sys

from build import LOGO
from sources import CAT, SOURCES

ROOT = pathlib.Path(__file__).resolve().parents[3]
fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


check(LOGO.exists(), f"logo exists: {LOGO}")
check(ROOT in LOGO.resolve().parents, "logo lives inside the repo")
check(LOGO.suffix == ".svg", "logo is the vector file, not an upscaled PNG")
check(CAT.resolve() == (ROOT / "images").resolve(), f"catalog images dir is the repo's own: {CAT}")
for name, cfg in SOURCES.items():
    check(pathlib.Path(cfg["src"]).exists(), f"{name}: source image exists")

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILURES"))
sys.exit(1 if fails else 0)
