#!/usr/bin/env python3
"""ממיר את תמונות המוצרים של הקטלוג העסקי שעדיין PNG/JPG ל-WebP מוקטן.

למה: חלק מהתמונות הועלו מהעורך כצילומי טלפון מלאים (עד 6MB, 3024x4032)
ונטענו כך בכרטיסי המוצר. ההמרה משתמשת ב-optimize_product_image שב-server.py
— אותה פונקציה שחלה מעכשיו על כל העלאה מהעורך.

מה הוא עושה:
  - לכל מוצר ב-data/products.csv שהתמונה שלו PNG/JPG — כותב לידה קובץ .webp
    (המקור נשאר במקומו, כדי ששום קישור ישן לא יישבר).
  - מחליף את הנתיב ב-CSV בהחלפת טקסט מדויקת, כך שסופי השורות והמרכאות בקובץ
    לא משתנים (PapaParse בדפדפן רגיש לזה — ראה סבב 50 ב-CLAUDE.md).
  - אידמפוטנטי: ריצה שנייה לא מוצאת מה להמיר.

אחרי הריצה: python3 tools/refresh_site.py כדי שדפי המוצר הסטטיים יקבלו את הנתיב החדש.
"""
import csv
import io
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO_ROOT)
sys.path.insert(0, REPO_ROOT)

import server  # noqa: E402

CSV_PATH = server.DATA_FILE


def main():
    raw = open(CSV_PATH, 'rb').read()
    text = raw.decode('utf-8-sig')
    bom = raw.startswith(b'\xef\xbb\xbf')
    rows = list(csv.DictReader(io.StringIO(text)))

    converted, before, after = [], 0, 0
    for r in rows:
        img = (r.get('image') or '').strip()
        if not img.lower().endswith(('.png', '.jpg', '.jpeg')):
            continue
        rel = img.lstrip('/')
        if rel.startswith('./'):
            rel = rel[2:]
        if not os.path.exists(rel):
            print(f'  ! {r["id"]}: הקובץ לא נמצא — {img}')
            continue

        data = open(rel, 'rb').read()
        webp = server.optimize_product_image(data)
        if webp is None:
            print(f'  ! {r["id"]}: לא ניתן להמיר (Pillow חסר או קובץ פגום) — {img}')
            continue

        new_rel = os.path.splitext(rel)[0] + '.webp'
        if os.path.exists(new_rel) and open(new_rel, 'rb').read() != webp:
            new_rel = os.path.splitext(rel)[0] + '-opt.webp'
        with open(new_rel, 'wb') as f:
            f.write(webp)

        new_img = ('/' if img.startswith('/') else '') + new_rel
        if text.count(img) != 1:
            print(f'  ! {r["id"]}: הנתיב מופיע {text.count(img)} פעמים בקובץ — דילוג על העדכון ב-CSV')
            continue
        text = text.replace(img, new_img)
        before += len(data)
        after += len(webp)
        converted.append(r['id'])
        print(f'  ✓ {r["id"]}: {len(data) // 1024}KB → {len(webp) // 1024}KB')

    if converted:
        with open(CSV_PATH, 'wb') as f:
            f.write((b'\xef\xbb\xbf' if bom else b'') + text.encode('utf-8'))
        print(f'\nהומרו {len(converted)} תמונות: {before / 1e6:.1f}MB → {after / 1e6:.2f}MB')
    else:
        print('אין תמונות PNG/JPG להמרה.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
