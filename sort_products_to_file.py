import re
import sys
from pathlib import Path

# שם קובץ הפלט – כאן יישמרו המוצרים הממוינים
OUTPUT_FILE = "products_sorted.txt"


def extract(field, obj):
    """מוציא שדה כמו name או category מתוך האובייקט כטקסט"""
    m = re.search(rf'{field}\s*:\s*"([^"]*)"', obj)
    return m.group(1) if m else ""


def main():
    # הוראות למשתמש
    print("הדבק כאן את רשימת המוצרים שלך (השורות עם { ... }),")
    print("כשתסיים להדביק, לחץ Ctrl+D (במק) ואז אנטר אם צריך.\n")

    # קורא את כל הטקסט שמודבק לטרמינל (stdin)
    text = sys.stdin.read().strip()

    if not text:
        print("לא התקבל טקסט – ודא שהדבקת את רשימת המוצרים ואז לחצת Ctrl+D.")
        return

    # מאתר את כל האובייקטים { ... }
    objects = re.findall(r'\{[^}]*\}', text, flags=re.DOTALL)
    if not objects:
        print("לא נמצאו אובייקטים של מוצרים ( { ... } ) בטקסט.")
        return

    # סדר הקטגוריות לפי ההופעה הראשונה בטקסט (כמו שיש לך עכשיו)
    categories_order = []
    for obj in objects:
        cat = extract("category", obj)
        if cat and cat not in categories_order:
            categories_order.append(cat)

    cat_index = {cat: i for i, cat in enumerate(categories_order)}

    # מיון – קודם לפי קטגוריה לפי הסדר, ואז לפי name א-ת בתוך כל קטגוריה
    sorted_objects = sorted(
        objects,
        key=lambda o: (
            cat_index.get(extract("category", o), 10**9),
            extract("name", o)
        )
    )

    # בניית טקסט חזרה – אובייקט בשורה, עם פסיק בסוף כמו אצלך
    output_text = ",\n".join(sorted_objects) + ",\n"

    # כתיבה לקובץ טקסט רגיל (UTF-8) באותה תיקייה של הסקריפט
    Path(OUTPUT_FILE).write_text(output_text, encoding="utf-8")
    print(f"✔ סיימתי! נשמר קובץ {OUTPUT_FILE} עם {len(sorted_objects)} מוצרים.")


if __name__ == "__main__":
    main()