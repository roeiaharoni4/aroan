#!/usr/bin/env python3
"""מרענן את כל הקבצים הנגזרים מהמחירון (סכמה, פיד, דפי קטגוריה ומוצר).

למה זה קיים: המבצעים מתוחמים בתאריכים, אבל דפי המוצר/קטגוריה, הסכמה והפיד
נבנים בזמן שמירה בעורך. בלי ריצה תקופתית, מבצע שנגמר (או שאמור להתחיל) לא
היה משתקף בקבצים הסטטיים עד השמירה הבאה.

שני שימושים:
  1. GitHub Action יומי (.github/workflows/daily-refresh.yml) — מריץ ועושה commit אם השתנה משהו.
  2. סקריפט הפרסום ("פרסם לאתר.command") — מרענן לפני שדוחפים לאתר.

הרצה: python3 tools/refresh_site.py   (מכל מקום — עובר לשורש הריפו לבד)
"""
import os
import sys

# הגנרטורים ב-server.py עובדים עם נתיבים יחסיים לשורש הריפו
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO_ROOT)
sys.path.insert(0, REPO_ROOT)

import server  # noqa: E402  (חייב לבוא אחרי chdir/sys.path)

# הסדר זהה לסדר שבו הם רצים בשמירה מהעורך
GENERATORS = [
    ('סכמת JSON-LD בעמוד /care/', server.update_care_schema),
    ('כרטיסי המוצרים המוזרקים', server.bake_care_products),
    ('פיד Google Merchant', server.update_merchant_feed),
    ('דפי הקטגוריה', server.generate_care_category_pages),
    ('דפי המוצר + sitemap', server.generate_care_product_pages),
    # הקטלוג העסקי (products.csv)
    ('סכמת ItemList בדפי הקטגוריה', server.generate_catalog_category_schema),
]


def main():
    failed = []
    for label, fn in GENERATORS:
        try:
            fn()
            print(f'  ✓ {label}')
        except Exception as err:                      # ממשיכים גם אם גנרטור אחד נכשל
            failed.append(label)
            print(f'  ✗ {label} — {err}', file=sys.stderr)

    if failed:
        print(f'\nנכשלו {len(failed)} גנרטורים: {", ".join(failed)}', file=sys.stderr)
        return 1
    print('\nכל הקבצים הנגזרים עודכנו.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
