# קובץ קליטה לריווחית מהזמנות האתר — תוכנית ביצוע

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** הזמנה עסקית מהאתר מגיעה במייל עם קובצי קליטה לריווחית, ובכרטיס ה-CRM יש כפתור שמוריד קובץ לפי סוג מסמך.

**Architecture:** ליבה טהורה אחת (`tools/rivhit/src/site-order.js` + `rivhit-file.js` + `text.js`) שנבנית ל-`js/rivhit-core.js` ונטענת גם בעמוד ה-CRM וגם כקובץ שני בפרויקט Apps Script של ההזמנות. מק"טי הפריטים נקראים מ-`data/products.csv` החי; מספר הלקוח בריווחית נשמר בכרטיס ה-CRM.

**Tech Stack:** JavaScript ES5/ES2017 (Apps Script V8 + דפדפן + Node לבדיקות), Python לבנייה, clasp לפריסה.

## Global Constraints

- אפיון: `docs/superpowers/specs/2026-11-04-rivhit-from-site-orders-design.md`.
- לקוח מזדמן = **118**. סוגי מסמך: הזמנה 7, תעודת משלוח 4, חשבונית מס 1, הצעת מחיר 6.
- מספר פנימי: יום בשנה (3) + 6 הספרות האחרונות של מספר ההזמנה; חייב להיות בין 1,000,000 ל-2,147,483,647.
- קידוד Windows-1255, CR+LF, 28 שדות בטאב — דרך `encodeCp1255`/`serialize` הקיימים.
- היקף: רק הזמנות שנכנסות ל-CRM (`crmEventFor_` לא null). רשת/ועד/טיפוח — לא.
- פלט הממיר הקיים לא משתנה (בדיקות `rivhit-file.test.js` עוברות בלי עריכה).
- עמודות חדשות בגיליונות — רק בסוף השורה.
- כשל בבניית הקובץ לא מפיל הזמנה, מייל או אירוע CRM.

---

### Task 1: ליבה — `site-order.js` ו-`buildDocument`

**Files:**
- Create: `tools/rivhit/src/site-order.js`
- Modify: `tools/rivhit/src/rivhit-file.js` (הוספת `buildDocument`; `buildRecords` נשען עליו)
- Test: `tools/test/rivhit-site.test.js`

**Interfaces — Produces:**
- `RivhitCore.buildDocument({docType, today:Date, date:Date, customerNo, lastName, firstName, street, internalNo, lines:[{code,name,qty,price}]}) → string[][]`
- `RivhitCore.parseCsv(text) → object[]`
- `RivhitCore.rivhitCodeMap(rows) → {id: code}`
- `RivhitCore.siteInternalNo(orderId) → number|null`
- `RivhitCore.siteOrderDate(orderId) → Date|null`
- `RivhitCore.siteOrderDocument(order, codes, {docType, customerNo, today}) → {records, missing, fileName, text}`
- `RivhitCore.SITE_DOC_TYPES`, `RivhitCore.OCCASIONAL_CUSTOMER` (118)

- [ ] **Step 1: בדיקות נכשלות** — `tools/test/rivhit-site.test.js`:
  CSV עם מירכאות/פסיקים/ירידת שורה בתוך שדה ו-CRLF; מפה (ריק ⇒ לא נכנס, `a|b` ⇒ `a`);
  `siteInternalNo('AR-20261104-123456') === 308123456`, `('SL-20260101-4821') === 1004821`,
  `('HM-20261231-000001') === 365000001`, פורמט שגוי ⇒ null; מסמך: 28 שדות, שדה 15 = המספר הפנימי,
  שדה 3 מתאריך ההזמנה, שדה 11 עסק ושדה 12 איש קשר, שורה בלי מק"ט ב-`missing`, הצעת מחיר ⇒ `'6'`,
  `fileName` = `"<עסק> - הזמנה.txt"`, כמות/מחיר כמספרים, 0 כשאין מחיר; כל השורות חסרות ⇒ `records.length === 0`.
- [ ] **Step 2:** `node tools/test/rivhit-site.test.js` ⇒ נכשל (המודול לא קיים).
- [ ] **Step 3:** מימוש (קוד בקובץ עצמו; `buildRecords` ממפה ל-`buildDocument` עם `lastName=customerName`, `street=branch`).
- [ ] **Step 4:** כל בדיקות `tools/test/rivhit-*.test.js` עוברות.
- [ ] **Step 5:** commit.

### Task 2: בנייה — `js/rivhit-core.js`

**Files:** Modify `tools/rivhit/build.py`; Create (נגזר) `js/rivhit-core.js`.

**Interfaces — Consumes:** Task 1. **Produces:** קובץ אחד שמגדיר `RivhitCore` גלובלי (דפדפן ו-Apps Script).

- [ ] build.py כותב גם `js/rivhit-core.js` = כותרת "נגזר — לא לערוך" + `text.js` + `rivhit-file.js` + `site-order.js`.
- [ ] בדיקה: טעינת הקובץ ב-`vm` של Node עם `this` גלובלי ⇒ `RivhitCore.siteOrderDocument` קיים (חלק מ-rivhit-site.test.js).
- [ ] commit.

### Task 3: סקריפט ה-CRM — מספר לקוח ופריטים

**Files:** Modify `tools/google-apps-script-crm.gs`; Test `tools/test/crm.test.js`.

**Interfaces — Produces:** איש קשר `rivhitNo`; פעולה `items` (JSON); `handleEvent_` ⇒ `{ok, id, rivhitNo}`.

- [ ] בדיקות: `applyFields_` מקבל `'1234'`/`''`, דוחה `'12a'`/`'123456'` (`bad rivhit`); `applyEvent_` עם `ev.items` שומר JSON מקוצר; הזמנה שמתחברת לרישום ידני מקבלת `items`; `sheet_` משלים כותרות חסרות.
- [ ] מימוש: מפתחות בסוף `CONTACT_KEYS`/`ACTIVITY_KEYS`, `itemsJson_(items)` (id,name,qty,price; עד 200 פריטים, עד 20,000 תווים), `rowOf_` עם תקרה 20,000 ל-`items`, `sheet_` משלים כותרות.
- [ ] כל בדיקות ה-CRM עוברות; commit.

### Task 4: סקריפט ההזמנות — קבצים מצורפים

**Files:** Modify `tools/google-apps-script-orders.gs`; Test `tools/test/order-doc.test.js`.

**Interfaces — Consumes:** `RivhitCore` (קובץ שני בפרויקט), CRM `rivhitNo`. **Produces:** `rivhitCodes_()`, `rivhitAttachments_(data, customerNo, codes, today)`, `rivhitMailText_(res, customerNo)`.

- [ ] בדיקות (טעינת `js/rivhit-core.js` לפני ה-.gs, Utilities.newBlob מדומה): HM ⇒ קובץ אחד; AR ⇒ שלושה; בלי מק"טים ⇒ אין קבצים ויש שורת הסבר; בייטים חתומים (-128..127); `crmEventFor_` מכיל `items`; שורת המייל עם 118 כשאין מספר.
- [ ] מימוש בין סימונים `RIVHIT-START`/`RIVHIT-END` + הוספה במייל ובצרופות.
- [ ] 36+ בדיקות `order-doc` עוברות; commit.

### Task 5: עמוד ה-CRM — שדה וכפתור

**Files:** Modify `crm-f428d7/index.html`, `crm-f428d7/crm.js`, `crm-f428d7/crm.css`, `tools/test/crm-fake-api.js`.

**Interfaces — Consumes:** `RivhitCore` מ-`/js/rivhit-core.js`, `/data/products.csv`, `contact.rivhitNo`, `activity.items`.

- [ ] שדה "מספר לקוח בריווחית" בעריכה + שורה בכרטיס; שגיאה `bad rivhit`.
- [ ] כפתור "קובץ לריווחית" בפעולה עם `items` ⇒ חלון בחירת סוג ⇒ הורדה (Blob של בייטי 1255). פריטים חסרים מוצגים.
- [ ] fake API: `rivhitNo` ו-`items` בנתוני הדוגמה, `update` שומר `rivhitNo`.
- [ ] דפדפן: כניסה מול fake API, עריכת מספר, הורדת קובץ (יירוט), בדיקת השדות; 375px; מצב כהה.
- [ ] גרסאות: `crm.js?v=4`, `crm.css?v=4`, `rivhit-core.js?v=1`; commit.

### Task 6: פריסה ותיעוד

- [ ] clasp: סקריפט ה-CRM (בנייה עם הסודות מהענן) ⇒ גרסה חדשה על אותה פריסה; סקריפט ההזמנות ⇒ `ריווחית.js` + הכנסות נקודתיות ⇒ גרסה חדשה על אותה פריסה; GET ל-`/exec` ⇒ שגיאת `doGet`.
- [ ] CLAUDE.md סבב 88; commit.
