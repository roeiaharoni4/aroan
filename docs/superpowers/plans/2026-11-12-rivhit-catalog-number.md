# קבצי ריווחית לפי המספר הקטלוגי — תוכנית

**אפיון:** `docs/superpowers/specs/2026-11-12-rivhit-catalog-number-design.md`

**המטרה:** שדה 5 בכל קובץ קליטה הוא המספר הקטלוגי, ומהמייל מגיעה הצעת מחיר אחת על לקוח 118 עם שם העסק.

**הכלל:** מספר קטלוגי תקין = 1–15 תווים אחרי trim, בלי טאב, ירידת שורה, `"` או `|`. פריט בלי מספר קטלוגי תקין לא נכנס לקובץ אף פעם, ואין נפילה חזרה למספר הפריט.

## משימה 1 — ליבת ריווחית
**קבצים:** `tools/rivhit/src/site-order.js`, `tools/test/rivhit-site.test.js`, ואחר כך `python3 tools/rivhit/build.py` (בונה את `js/rivhit-core.js`).
- הפונקציה החדשה `catalogCode(v)` מיוצאת. `rivhitCodeMap` ו-`rivhitOf` משתמשות בה.
- `parseCsv`: המפריד נקבע לפי שורת הכותרת (טאב או פסיק).
- `itemExportRows` מחזירה `{items:[[num,name,catalog]], inactive, noCatalog, error}`. קבוצה "לא פעיל" = `int1` 9999 או `compute_0037` "לא פעיל".
- `siteOrderDocument`: `lastName = firstName = business || contact`.
- **בדיקות:** C203 בקובץ; קוד לא תקין ⇒ חסר; שמות בשני השדות; ייצוא מופרד בטאבים; שלשות ודילוגים; קובץ בלי `item_part_num`.

## משימה 2 — סקריפט ההזמנות
**קבצים:** `tools/google-apps-script-orders.gs`, `tools/test/order-doc.test.js`.
- `rivhitAttachments_(data, codes, today)` מפיקה קובץ אחד: סוג 6, לקוח 118.
- `rivhitMailText_(r)` עם הנוסח החדש. הקריאה ב-`doPost`: `rivhitAttachments_(data)`.
- `crmEventFor_`: `rivhit` לפי הכלל (ביטוי מקומי).
- **בדיקות:** AR/HM/SL ⇒ קובץ אחד, סוג 6, לקוח 118 גם כש-`rivhitNo` = 1234; נוסח; C203; `doPost` עם צרופה אחת.

## משימה 3 — סקריפט ה-CRM
**קבצים:** `tools/google-apps-script-crm.gs`, `tools/test/crm.test.js`.
- `ITEM_HEADERS` מקבל עמודה שלישית "מספר קטלוגי".
- `cleanItems_` ו-`handleItemsSet_` מקבלות שלשות או זוגות; `handleItems_` מחזירה שלשות.
- `itemsJson_` לפי הכלל.
- **בדיקות:** שלשות; זוגות מעמוד ישן; מספר קטלוגי לא תקין ⇒ ''; `itemsJson_` עם C203.

## משימה 4 — עמוד ה-CRM, דף הסוכן והעורך
**קבצים:** `crm-f428d7/crm.js`, `crm-f428d7/index.html` (נוסח, `crm.js?v=6`, `rivhit-core.js?v=4`), `js/agent.js`, `agent/index.html` (`agent.js?v=6`), `admin/admin.js`, `admin/index.html` (`admin.js?v=3`).
- **CRM:**
  - ההעלאה שולחת שלשות ומציגה את הספירות.
  - בכרטיס, פריטי `RV-` מקבלים את המספר הקטלוגי מהרשימה.
- **הסוכן:**
  - מתקבלות שלשות.
  - פריט מזוהה לפי המזהה.
  - פריט בלי מספר קטלוגי לא נכנס.
- **העורך:** השדה מקבל מספר קטלוגי עם אותיות.

## משימה 5 — הנתונים והממיר
**קבצים:** `data/products.csv`, `tools/rivhit/src/mapping.js`, `ui.js`, `mapping.json`, `tools/test/rivhit-mapping.test.js`, ובנייה מחדש.
- **products.csv:** 77 קודים מוחלפים במספר הקטלוגי. נבדק שאף שדה אחר לא השתנה ושה-CRLF נשמר.
- **mapping.json:** 29 קודים מוחלפים.
- **בממיר:**
  - `parseItemList` מזהה את הייצוא של ריווחית.
  - `migrateLearned` מתרגמת שיוכים שנשמרו.
  - בלי `state.catalogList` אי אפשר להפיק קובץ.
  - קוד שלא ברשימה חוסם את ההפקה.

## משימה 6 — בדיקה בדפדפן, פריסה ותיעוד
- **בדפדפן:** עמוד ה-CRM (מול הדמיה), דף הסוכן (פיילוד מיורט), העורך והממיר.
- **clasp:** CRM גרסה 8, הזמנות גרסה 15, על אותם מזהי פריסה.
- **CLAUDE.md:** סבב 92, ותיקון ההגדרה של `rivhit` בסבבים 87, 88 ו-90.
