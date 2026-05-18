import re

# מיפוי ראשי תיבות לקטגוריות
PREFIXES = {
    "חד פעמי ואריזות": "HDP",
    "אביזרי ניקיון": "ABZ",
    "מוצרי נייר": "MVT",
    "שקיות": "SHK",
    "טיפוח והיגיינה": "TYP",
    "מבשמים": "MBS",
    "שונים": "SHV",
    "ניקיון": "NYK",
    "ציוד משרדי": "ZMD"
}

def extract_items(text):
    # מחפש את האובייקטים בתוך הרשימה
    pattern = r"\{[^}]+\}"
    return re.findall(pattern, text, re.DOTALL)

def get_prefix(category):
    return PREFIXES.get(category, "XXX")

def assign_ids(items):
    counters = {}
    updated = []

    for item in items:
        # מוציא את קטגוריית המוצר
        category_match = re.search(r'category:\s*"([^"]+)"', item)
        if not category_match:
            continue

        category = category_match.group(1)
        prefix = get_prefix(category)

        # מגדיל מונה
        counters.setdefault(prefix, 0)
        counters[prefix] += 1
        num = str(counters[prefix]).zfill(3)

        new_id = f'{prefix}-{num}'

        # מחליף את ה-id הישן
        updated_item = re.sub(r'id:\s*"[^"]*"', f'id: "{new_id}"', item)
        updated.append(updated_item)

    return updated

def main():
    print("📦 כלי אוטומטי ליצירת ID למוצרים")
    input_file = input("הכנס את שם קובץ המוצרים (לדוגמה: products.txt): ").strip()

    with open(input_file, "r", encoding="utf-8") as f:
        content = f.read()

    items = extract_items(content)
    updated = assign_ids(items)

    print("\n📄 --- התוצאה ---\n")
    for u in updated:
        print(u + ",")

    print("\n✔ סיימתי! העתק את הפלט בחזרה לקובץ JS שלך.")

if __name__ == "__main__":
    main()