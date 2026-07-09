# -*- coding: utf-8 -*-
"""
אחדת תמונות מוצרים - אהרוני שיווק והפצה
==========================================
מה הסקריפט עושה לכל תמונת מוצר (בתיקיות המשנה של images/):
1. גיבוי המקור לתיקיית images_backup/ (רק בפעם הראשונה - לא דורס גיבוי קיים)
2. הופך רקע שקוף לרקע לבן
3. חותך שוליים ריקים מיותרים
4. ממרכז את המוצר על קנבס ריבועי לבן עם שוליים אחידים
5. מקטין תמונות ענקיות (מקסימום 900x900) - משפר את מהירות האתר

שמות הקבצים לא משתנים - אין צורך לעדכן את קובץ המוצרים.
להרצה: לחיצה כפולה על "עדכון_תמונות.command" (באותה תיקייה).
"""

import os
import shutil
import sys

try:
    from PIL import Image, ImageChops
except ImportError:
    print("חסרה ספריית Pillow. מתקין...")
    os.system(f'"{sys.executable}" -m pip install --user Pillow')
    from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(ROOT, "images")
BACKUP_DIR = os.path.join(ROOT, "images_backup")

MAX_SIZE = 900        # גודל מקסימלי (פיקסלים)
MARGIN_RATIO = 0.06   # שוליים לבנים מסביב למוצר (6%)
EXTENSIONS = (".webp", ".png", ".jpg", ".jpeg")


def flatten_to_white(img):
    """הופך שקיפות לרקע לבן ומחזיר RGB."""
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        return bg
    return img.convert("RGB")


def trim_whitespace(img):
    """חותך שוליים לבנים/כמעט-לבנים מסביב למוצר."""
    bg = Image.new("RGB", img.size, (255, 255, 255))
    diff = ImageChops.difference(img, bg).convert("L")
    # סף רגישות - מתעלם מרעש קל ברקע
    mask = diff.point(lambda p: 255 if p > 12 else 0)
    bbox = mask.getbbox()
    if bbox and (bbox[2] - bbox[0] > 10) and (bbox[3] - bbox[1] > 10):
        return img.crop(bbox)
    return img


def to_square(img):
    """ממרכז על קנבס ריבועי לבן עם שוליים אחידים."""
    w, h = img.size
    side = int(max(w, h) * (1 + MARGIN_RATIO * 2))
    canvas = Image.new("RGB", (side, side), (255, 255, 255))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    return canvas


def save_image(img, path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".webp":
        img.save(path, "WEBP", quality=85, method=6)
    elif ext == ".png":
        img.save(path, "PNG", optimize=True)
    else:
        img.save(path, "JPEG", quality=88, optimize=True)


def process_file(path, rel_path):
    # גיבוי חד-פעמי
    backup_path = os.path.join(BACKUP_DIR, rel_path)
    if not os.path.exists(backup_path):
        os.makedirs(os.path.dirname(backup_path), exist_ok=True)
        shutil.copy2(path, backup_path)

    img = Image.open(path)
    img = flatten_to_white(img)
    img = trim_whitespace(img)
    img = to_square(img)
    if img.size[0] > MAX_SIZE:
        img = img.resize((MAX_SIZE, MAX_SIZE), Image.LANCZOS)
    save_image(img, path)


def main():
    if not os.path.isdir(IMAGES_DIR):
        print(f"לא נמצאה תיקיית תמונות: {IMAGES_DIR}")
        return

    done, errors = 0, 0
    for dirpath, _dirnames, filenames in os.walk(IMAGES_DIR):
        # מדלגים על קבצים בתיקייה הראשית (לוגו, אייקונים, הירו)
        if os.path.abspath(dirpath) == os.path.abspath(IMAGES_DIR):
            continue
        for name in filenames:
            if not name.lower().endswith(EXTENSIONS):
                continue
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, IMAGES_DIR)
            try:
                process_file(full, rel)
                done += 1
                print(f"[OK] {rel}")
            except Exception as e:
                errors += 1
                print(f"[שגיאה] {rel}: {e}")

    print("\n==============================")
    print(f"הושלם: {done} תמונות עובדו, {errors} שגיאות.")
    print(f"המקוריות גובו בתיקייה: {BACKUP_DIR}")
    print("אם משהו לא מוצא חן בעיניך - אפשר להחזיר תמונה מהגיבוי.")


if __name__ == "__main__":
    main()
