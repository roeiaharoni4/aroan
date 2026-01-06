# מדריך לעדכון הקטלוג

הקטלוג שלך כעת מנוהל בצורה דינמית. זה אומר שניתן לעדכן מוצרים, מחירים ותמונות מבלי לגעת בקוד המורכב של האתר.

ישנן שתי דרכים לעבוד:

## אפשרות 1: עבודה עם קובץ מקומי (ברירת מחדל)
כרגע האתר מושך נתונים מקובץ בשם `products.csv` שנמצא בתיקייה `data`.

1.  פתח את התיקייה `aroam-catalog`.
2.  כנס לתיקייה `data`.
3.  פתח את הקובץ `products.csv`. ניתן לפתוח אותו ב-Excel, Numbers או כל עורך טקסט.
4.  ערוך את הטבלה:
    *   **id**: מק״ט ייחודי.
    *   **name**: שם המוצר.
    *   **category**: קטגוריה (מוצרים עם אותה קטגוריה יופיעו ביחד).
    *   **unit**: יחידת מידה (למשל: יחידה, ק״ג).
    *   **image**: נתיב לתמונה (למשל `images/my-product.png`).
    *   **price**: מחיר (מספר בלבד).
5.  שמור את הקובץ (ודא שנשמר כ-CSV).
6.  רענן את דף הקטלוג בדפדפן. השינויים יופיעו מיד.

## אפשרות 2: עבודה עם Google Sheets (מומלץ)
שיטה זו נוחה יותר כי ניתן לערוך את הקטלוג מכל מקום (גם מהטלפון).

1.  צור Google Sheet חדש.
2.  צור את הכותרות בשורה הראשונה בדיוק כך: `id`, `name`, `category`, `unit`, `image`, `price`, `description`.
3.  מלא את המוצרים. אם ברצונך להוסיף תיאור למוצר, מלא אותו בעמודת `description`. אם תשאיר ריק, לא יוצג תיאור.
4.  לחץ על **File (קובץ)** -> **Share (שיתוף)** -> **Publish to web (פרסם באינטרנט)**.
5.  בחר ב-**Sheet1** (או שם הגיליון שלך) ובחר בפורמט **CSV**.
6.  לחץ **Publish** והעתק את הקישור שקיבלת.
7.  פתח את הקובץ `js/app.js` בתיקייה של הקטלוג.
8.  חפש את השורה בתחילת הקובץ: `const DATA_SOURCE_URL`.
9.  הדבק את הקישור של גוגל במקום הקישור לקובץ המקומי.

# 🚀 Aroam Catalog Updates
> **New Address**: [http://localhost:8081/](http://localhost:8081/)

## 🆕 How to Open (Updated)
1. **Double-click** `start_catalog.command`.
2. It will open the **Homepage** automatically.
3. Click "To Catalog" to browse.

## 🔗 New "Pretty" Links
We removed `.html` from the file names for a cleaner look:
- **Home**: `http://localhost:8081/`
- **Catalog**: `http://localhost:8081/catalog/`
- **About**: `http://localhost:8081/about/`
- **Contact**: `http://localhost:8081/contact/`

---
## פתרון תקלות
**המוצרים לא מוצגים? כתוב "לא נמצאו מוצרים"?**
זה קורה בדרך כלל אם פותחים את הקובץ `index.html` ישירות בלחיצה כפולה.
בגלל מנגנוני אבטחה של דפדפנים, לא ניתן למשוך נתונים מגוגל שיטס בצורה כזו.

**הפתרון:**
יצרתי עבורך קובץ הפעלה מיוחד בשם `start_catalog.command`.
1.  לחץ לחיצה כפולה על הקובץ `start_catalog.command` (נמצא באותה תיקייה).
2.  הוא יפתח אוטומטית חלון שחור (טרמינל) ויפעיל את הדפדפן שלך בכתובת הנכונה (`http://localhost:8081`).
3.  המוצרים יופיעו בהצלחה.

**חשוב:** אל תסגור את החלון השחור כל עוד אתה משתמש בקטלוג.

## גישה לגרסאות השונות

לאחר שהפעלת את הקטלוג (דרך `start_catalog.command`), הסקריפט יפתח את גרסת הלקוחות כברירת מחדל. הנה הקישורים לגישה לכל גרסה:

*   **גרסת לקוחות (ללא מחירים, שיתוף בוואטסאפ):**
    *   כתובת: `http://localhost:8081/` (או פשוט הקישור שנפתח אוטומטית)
    *   *שימוש:* מיועד לשליחה ללקוחות או להצגה באתר וורדפרס.

*   **גרסת סוכן (כולל מחירים, הדפסת הצעת מחיר):**
    *   כתובת: `http://localhost:8081/agent/`
    *   *שימוש:* מיועד לשימוש שלך בזמן עבודה מול לקוחות. כולל מחירים וכפתור "הדפס הצעת מחיר".

**טיפ:** מומלץ לשמור את הקישור לגרסת הסוכן במועדפים שלי בדפדפן לגישה מהירה.
