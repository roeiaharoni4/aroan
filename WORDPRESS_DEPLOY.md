# מדריך העלאה לאתר וורדפרס (WordPress)

כדי שתוכל לגשת לקטלוג (ובמיוחד לגרסת הסוכן) מכל מכשיר (טלפון, טאבלט, מחשב בבית), הדרך הכי טובה היא להעלות אותו לאתר הוורדפרס שלך הקיים.

הכנתי עבורך קובץ מכווץ (ZIP) שכולל את כל הקטלוג מוכן להעלאה.

## שלב 1: התקנת תוסף מנהל קבצים (אם אין לך)
אם יש לך גישה ל-cPanel או FTP, אתה יכול להשתמש בהם. אם לא, הדרך הכי קלה היא דרך הפאנל של וורדפרס:

1.  כנס ללוח הבקרה של הוורדפרס שלך.
2.  לך ל-**Plugins (תוספים)** -> **Add New (תוסף חדש)**.
3.  חפש **File Manager** (למשל *WP File Manager* הפופולרי).
4.  תתקין ותפעיל אותו.

## שלב 2: העלאת הקטלוג
1.  פתח את התוסף **File Manager** בתפריט הצד.
2.  אתה תראה את רשימת הקבצים של האתר שלך.
3.  לחץ על כפתור יצירת תיקייה חדשה (אייקון של תיקייה עם פלוס) וקרא לה `catalog` (או `sales`).
    *   הכתובת תהיה בסוף: `your-site.co.il/catalog`.
4.  כנס לתוך התיקייה החדשה שיצרת.
5.  גרור את הקובץ `aroam-catalog.zip` (נמצא בתיקייה אצלך במחשב) לתוך החלון בדפדפן, או השתמש בכפתור העלאה (Upload).
6.  לאחר שהקובץ עלה, לחץ עליו עם מקש ימני ובחר **Extract** (חילוץ).
    *   אם הוא שואל לאן, אשר את ברירת המחדל (Extract Here).

## שלב 3: כניסה לקטלוג
עכשיו הקטלוג באוויר!

*   **ללקוחות (קישור נקי):** `www.your-site.co.il/catalog/`
    *(שרתים טוענים אוטומטית את index.html כשנכנסים לתיקייה, אז זה בדיוק מה שרצית)*
*   **בשבילך (סוכן):** `www.your-site.co.il/catalog/agent.html`

### 🔒 אבטחה לגרסת הסוכן
כדי שאנשים זרים לא יראו את המחירים שלך, הוספתי מסך כניסה לגרסת הסוכן.
*   **הקוד כניסה הוא:** `0526`
*   לאחר שתכניס את הקוד פעם אחת בטלפון שלך, הוא יזכור אותך ולא יבקש שוב.

בהצלחה!
