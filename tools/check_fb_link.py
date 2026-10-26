"""After the Facebook Page exists: the footer and the three business schemas point to it.

Usage: python3 tools/check_fb_link.py https://www.facebook.com/<page>
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = sys.argv[1]
fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def same_as(node):
    """Every sameAs list anywhere in a JSON-LD tree."""
    if isinstance(node, dict):
        if isinstance(node.get("sameAs"), list):
            yield node["sameAs"]
        for v in node.values():
            yield from same_as(v)
    elif isinstance(node, list):
        for v in node:
            yield from same_as(v)


footer = (ROOT / "js" / "components.js").read_text(encoding="utf-8")
check(f'href="{URL}"' in footer, "footer links to the Page")
for page in ("index.html", "contact/index.html", "about/index.html"):
    src = (ROOT / page).read_text(encoding="utf-8")
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', src, re.S)
    lists = [lst for b in blocks for lst in same_as(json.loads(b))]
    check(any(URL in lst for lst in lists), f"{page}: sameAs includes the Page")

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILURES"))
sys.exit(1 if fails else 0)
