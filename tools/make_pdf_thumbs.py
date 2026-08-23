# -*- coding: utf-8 -*-
"""
תמונות ממוזערות לתעודות ההזמנה - אהרוני שיווק והפצה
=====================================================
יוצר לכל מוצר קובץ images/thumbs/<מזהה>.jpg בגודל 120x120 על רקע לבן.
הקבצים האלה הם אלה שמופיעים ב-PDF של ההזמנה: JPEG (נתמך בכל ממיר),
בתיקייה שטוחה אחת, ובמשקל שמאפשר הזמנה של 40 שורות בלי קובץ ענק.

הסקריפט אידמפוטנטי: מדלג על תמונה שכבר קיימת ועדכנית ביחס למקור.
להרצה: python3 tools/make_pdf_thumbs.py
"""

import csv
import os
import sys

try:
    from PIL import Image
except ImportError:
    print("חסרה ספריית Pillow. מתקין...")
    os.system(f'"{sys.executable}" -m pip install --user Pillow')
    from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THUMBS_DIR = os.path.join(ROOT, "images", "thumbs")
SIZE = 120
QUALITY = 80

# כל קובצי המוצרים שמהם אפשר להזמין
SOURCES = [
    os.path.join(ROOT, "data", "products.csv"),
    os.path.join(ROOT, "data", "pricelist.csv"),
    os.path.join(ROOT, "data", "committee.csv"),
]


def collect_products():
    """מחזיר {מזהה: נתיב תמונה יחסי} מכל קובצי המוצרים."""
    out = {}
    for path in SOURCES:
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                pid = (row.get("id") or "").strip()
                img = (row.get("image") or "").strip()
                if pid and img and pid not in out:
                    out[pid] = img
    return out


def _relative(rel):
    """נתיב התמונה מה-CSV -> נתיב יחסי לשורש הפרויקט.

    עמודת image נכתבת בשלוש צורות: "images/...", "/images/..." (העלאה דרך
    העורך) ו-"./images/...". ב-os.path.join נתיב שמתחיל בלוכסן **מבטל** את
    השורש שלפניו, ולכן "/images/x.png" הפך ל-"/images/x.png" של המחשב —
    13 מוצרים דולגו בשקט ונשארו בלי תמונה בתעודת ההזמנה.
    """
    rel = rel.strip().replace("\\", "/")
    while rel.startswith(("./", "/")):
        rel = rel[2:] if rel.startswith("./") else rel[1:]
    return rel


def make_thumb(src_path, dst_path):
    """ממזער תמונה אחת לריבוע לבן. מחזיר True אם נוצר קובץ."""
    try:
        img = Image.open(src_path)
    except Exception as e:
        print("  ! שגיאה בפתיחת %s: %s" % (src_path, e))
        return False

    img = img.convert("RGBA")
    img.thumbnail((SIZE, SIZE), Image.LANCZOS)

    canvas = Image.new("RGB", (SIZE, SIZE), (255, 255, 255))
    canvas.paste(img, ((SIZE - img.width) // 2, (SIZE - img.height) // 2), img)
    canvas.save(dst_path, "JPEG", quality=QUALITY, optimize=True)
    return True


def main():
    os.makedirs(THUMBS_DIR, exist_ok=True)
    products = collect_products()
    print("נמצאו %d מוצרים." % len(products))

    created = skipped = missing = 0
    for pid, rel in sorted(products.items()):
        src = os.path.join(ROOT, _relative(rel))
        if not os.path.exists(src):
            missing += 1
            print("  ! אין קובץ תמונה: %s -> %s" % (pid, rel))
            continue
        dst = os.path.join(THUMBS_DIR, pid + ".jpg")
        # מדלגים רק אם הקובץ קיים ולא ישן מהמקור
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            skipped += 1
            continue
        if make_thumb(src, dst):
            created += 1

    print("נוצרו: %d | עדכניים: %d | בלי קובץ תמונה: %d" % (created, skipped, missing))
    print("התיקייה: %s" % THUMBS_DIR)


if __name__ == "__main__":
    main()
