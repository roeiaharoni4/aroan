# תעודת הזמנה PDF + הפיכתה להצעת מחיר — תוכנית ביצוע

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** כל הזמנה שנשלחת מהאתר תייצר PDF מעוצב עם תמונות המוצרים, שיצורף למייל ויישמר ב-Drive, ובהזמנות ללא מחירים יצורף קישור שפותח אותה כהצעת מחיר בדף הסוכן.

**Architecture:** ה-PDF נוצר בצד הענן (Google Apps Script) מ-HTML שנבנה במחרוזת ומומר דרך `Utilities.newBlob(...).getAs(MimeType.PDF)`. באתר עצמו משתנה כמעט כלום: שדה `image` בפיילוד, פרמטר `customer` בדף הסוכן, ועיצוב חדש להדפסת הצעת המחיר. הפיכת הזמנה להצעת מחיר אינה עריכת PDF אלא קישור `?cart=` לדף הסוכן — שכבר יודע לערוך מחירים ולהדפיס.

**Tech Stack:** Google Apps Script (ES5), JavaScript (vanilla, ES5-safe), Python 3 + Pillow, Node 24 (רתמת בדיקה בלבד), Chrome headless (רינדור מקומי לבדיקה ויזואלית).

## Global Constraints

- **מסמך העיצוב המאושר:** `docs/superpowers/specs/2026-08-19-order-pdf-quote-design.md` — אין לסטות ממנו בלי אישור.
- **פלטת המותג בלבד:** `#1A4231` (כהה), `#639C7D` (ראשי), `#8FD6A3` (פסטל), `#F7FBF8` (רקע בהיר). אין להכניס צבע חדש.
- **בלי אימוג׳ים** בשום פלט שהלקוח רואה (העדפת רועי).
- **הזמנה לעולם לא נאבדת:** כל קוד ה-PDF/Drive עטוף ב-`try/catch` נפרד. כישלון שם אינו מונע את השורה בגיליון ואת מייל ההתראה.
- **עמודות חדשות בגיליון נוספות בסוף `SHEET_HEADERS` בלבד** — הגיליון הקיים של רועי לא זז.
- **ES5 בלבד בקובץ ה-`.gs`** — בלי `let`/`const`/חיצי/תבניות מחרוזת. Apps Script רץ ב-V8 אבל שאר הקובץ כתוב ES5 ויש לשמור על אחידות.
- **אין נגיעה** ב-`/care/`, ב-`/emp-8c3f5a/` או בזרימת ההזמנה של הקטלוג העסקי מעבר למה שמפורט כאן.
- **גרסאות:** כל שינוי ב-`js/app.js` מחייב העלאת `?v=` בכל הדפים הטוענים אותו + העלאת `CACHE_NAME` ב-`sw.js`. הגרסאות הנוכחיות (אומתו 19.08): `app.js?v=38`, `style.css?v=30`, `sw` cache-v31 — כולן ב-14 דפים.
- **push** מבוצע על ידי רועי בלבד — אין credentials בסביבה. Commit כן.

---

### Task 1: ספייק — האם הממיר של גוגל עומד בדרישות (חוסם)

המשימה הזו לא כותבת פיצ׳ר. היא עונה על שאלה אחת שאם התשובה עליה שלילית — כל שאר התוכנית משתנה: **האם `Utilities.newBlob(html, MimeType.HTML).getAs(MimeType.PDF)` מרנדר תמונות מרוחקות, WebP, ועברית RTL.**

**Files:**
- Create: `tools/spike-order-pdf.gs`

**Interfaces:**
- Consumes: כלום.
- Produces: הכרעה בין מסלול א׳ (Apps Script) למסלול ב׳ (יצירה בדפדפן), ותשובה האם משימה 2 (תמונות ממוזערות) נחוצה או רק רצויה.

- [ ] **Step 1: כתוב את קובץ הספייק**

```javascript
/**
 * ספייק חד-פעמי: בדיקה שהממיר HTML→PDF של גוגל עומד בדרישות.
 * להרצה: הדבק בפרויקט Apps Script חדש, הרץ runSpike, ובדוק את המייל.
 * אחרי ההכרעה אפשר למחוק את הפרויקט — הוא לא חלק מהמערכת.
 */
var SPIKE_EMAIL = 'meiraroam@gmail.com';
var SITE = 'https://aroam.co.il/';

function runSpike() {
  // ארבע התמונות שנבדקות: PNG חי, WebP חי בנתיב עברי עם רווחים,
  // JPG חי, וכתובת שבורה בכוונה (כדי לוודא שהמסמך לא קורס).
  var imgs = [
    SITE + 'images/logo.png',
    SITE + encodeURI('images/מוצרי נייר/גליל נייר תעשייתי 5004.webp'),
    SITE + 'images/og-image.png',
    SITE + 'images/__does_not_exist__.png'
  ];

  var rows = '';
  for (var i = 0; i < imgs.length; i++) {
    rows += '<tr>' +
      '<td style="width:70px; padding:6px; border:1px solid #DFE9E3;">' +
        '<img src="' + imgs[i] + '" style="width:56px; height:56px; object-fit:contain;">' +
      '</td>' +
      '<td style="padding:6px; border:1px solid #DFE9E3;">' +
        'שורה ' + (i + 1) + ' — בדיקת עברית, גרשיים ״ וגרש ׳, ומספר 1,234.56 ₪' +
      '</td></tr>';
  }

  var html =
    '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"></head>' +
    '<body style="direction:rtl; font-family:Arial,sans-serif;">' +
    '<div style="background:#1A4231; color:#fff; padding:14px; border-radius:8px;">' +
      '<strong style="font-size:16pt;">אהרוני שיווק והפצה</strong><br>' +
      '<span style="color:#8FD6A3; font-size:14pt;">AR-SPIKE-0001</span>' +
    '</div>' +
    '<table style="width:100%; border-collapse:collapse; margin-top:12px;">' + rows + '</table>' +
    '</body></html>';

  var pdf = Utilities.newBlob(html, MimeType.HTML, 'spike.pdf').getAs(MimeType.PDF);
  MailApp.sendEmail(SPIKE_EMAIL, 'ספייק PDF — בדיקת תמונות ועברית', 
    'מצורף הקובץ. יש לבדוק: 1) לוגו PNG מופיע 2) תמונת WebP בנתיב עברי מופיעה ' +
    '3) העברית לא הפוכה והגרשיים תקינים 4) הכתובת השבורה לא הפילה את המסמך.',
    { attachments: [pdf] });
}
```

- [ ] **Step 2: הרץ את הספייק**

הדבק את הקובץ בפרויקט Apps Script (חדש, לא של ההזמנות), בחר `runSpike` ברשימת הפונקציות והרץ. אשר את ההרשאות בפעם הראשונה.

- [ ] **Step 3: הערך את התוצאה מול ארבעה קריטריונים**

| # | קריטריון | אם נכשל |
|---|---|---|
| 1 | לוגו ה-PNG מופיע | **עצור** — מסלול א׳ נפסל, עבור למסלול ב׳ |
| 2 | תמונת ה-WebP בנתיב עברי מופיעה | המשך — משימה 2 (תמונות ממוזערות) הופכת מ**רצויה** ל**חובה** |
| 3 | עברית ו-RTL תקינים, ״ ו-׳ לא נשברים | **עצור** — מסלול א׳ נפסל |
| 4 | הכתובת השבורה לא הפילה את המסמך | הוסף בדיקת זמינות תמונה בקוד המחולל |

- [ ] **Step 4: דווח לרועי ותעד**

כתוב את התוצאה בראש המסמך `docs/superpowers/specs/2026-08-19-order-pdf-quote-design.md` תחת "שלב 0", כולל אילו קריטריונים עברו. **אם קריטריון 1 או 3 נכשל — אל תמשיך למשימות הבאות. עצור ודווח.**

- [ ] **Step 5: Commit**

```bash
git add tools/spike-order-pdf.gs docs/superpowers/specs/2026-08-19-order-pdf-quote-design.md
git commit -m "ספייק: בדיקת היתכנות המרת HTML ל-PDF ב-Apps Script"
```

---

### Task 2: תמונות ממוזערות ל-PDF

**Files:**
- Create: `tools/make_pdf_thumbs.py`
- Create (פלט): `images/thumbs/<id>.jpg`

**Interfaces:**
- Consumes: `data/products.csv`, `data/pricelist.csv`, `data/committee.csv` (עמודות `id`, `image`).
- Produces: מוסכמת הכתובת שמשימה 4 בונה: `https://aroam.co.il/images/thumbs/` + `encodeURIComponent(id)` + `.jpg`.

הערה: שמות הקבצים נשארים מזהי המוצר, שחלקם בעברית (`ניק001`). זה בטוח — האתר כבר מגיש 283 כתובות עם עברית מקודדת. מה שהמשימה מסירה הוא WebP, רווחים, ותיקיות משנה מקוננות; ובנוסף מקטינה את המשקל מ-17KB ל-~4KB לתמונה.

- [ ] **Step 1: כתוב את הסקריפט**

```python
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
        src = os.path.join(ROOT, rel)
        if not os.path.exists(src):
            missing += 1
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
```

- [ ] **Step 2: הרץ אותו**

```bash
python3 tools/make_pdf_thumbs.py
```

צפוי: `נוצרו: 230` בערך (176 עסקי + 63 טיפוח + ועד, בלי כפילויות), `בלי קובץ תמונה: 4` בערך.

- [ ] **Step 3: ודא את הפלט**

```bash
ls images/thumbs | wc -l && du -sh images/thumbs && python3 -c "from PIL import Image; im=Image.open('images/thumbs/ניק001.jpg'); print(im.size, im.mode, im.format)"
```

צפוי: מעל 200 קבצים, נפח כולל מתחת ל-2MB, ו-`(120, 120) RGB JPEG`.

- [ ] **Step 4: ודא אידמפוטנטיות**

```bash
python3 tools/make_pdf_thumbs.py
```

צפוי: `נוצרו: 0` וכל השאר `עדכניים`.

- [ ] **Step 5: ודא שהתיקייה לא נחסמה מ-git**

```bash
git check-ignore -v images/thumbs/ניק001.jpg; echo "exit=$?"
```

צפוי: `exit=1` (כלומר לא מתעלמים ממנה). אם כן מתעלמים — הסר את הכלל מ-`.gitignore`, כי הקבצים חייבים להיות חיים באתר.

- [ ] **Step 6: Commit**

```bash
git add tools/make_pdf_thumbs.py images/thumbs
git commit -m "כלי: תמונות ממוזערות למוצרים עבור תעודת ההזמנה"
```

---

### Task 3: שדה `image` בפיילוד ההזמנה

**Files:**
- Modify: `js/app.js:2002-2013` (`getCartItemsData`)
- Modify: `catalog/index.html`, 10 דפי הקטגוריה, `agent/index.html`, `care/index.html`, `emp-8c3f5a/index.html` (פרמטר גרסה)
- Modify: `sw.js` (`CACHE_NAME`)

**Interfaces:**
- Consumes: כלום.
- Produces: `items[i].image` — הנתיב היחסי הגולמי מה-CSV, למשל `images/ניקיון/אקונומיקה 4 ליטר.webp`.
  **מגיע מ-`product.rawImage` ולא מ-`product.image`:** `product.image` עובר כבר ב-`loadProducts` המרה
  לנתיב שורש מקודד לצורך התצוגה בדפדפן, ולכן אינו הנתיב הגולמי. השדה `rawImage` נוסף שם לשם כך.
- משימה 4 משתמשת בשדה הזה **כסימן נוכחות בלבד** (`it.image && it.id`) ובונה את הכתובת מהמזהה.
  אם אי פעם ייבנה נתיב גיבוי שמושך את התמונה המקורית, יש לזכור שהערך הזה יחסי ולא מקודד —
  כלומר דורש `encodeURI` והוספת הדומיין לפני `UrlFetchApp.fetch`.

- [ ] **Step 1: הוסף את השדה**

ב-`js/app.js`, בתוך `items.push({...})` שב-`getCartItemsData`, אחרי השורה `unit: product.unit,` הוסף:

```javascript
                // נתיב התמונה — נדרש לתעודת ההזמנה (PDF) שנבנית ב-Apps Script
                image: product.image || "",
```

- [ ] **Step 2: העלה גרסאות**

```bash
cd "/Users/roeiaharoni/Desktop/קטלוג לקוחות/aroan"
grep -rl 'app\.js?v=38' --include='*.html' . | xargs sed -i '' 's/app\.js?v=38/app.js?v=39/g'
sed -i '' "s/aroam-cache-v31/aroam-cache-v32/" sw.js
grep -rc 'app\.js?v=39' --include='*.html' . | grep -v ':0' | wc -l
```

צפוי: 14 דפים.

- [ ] **Step 3: ודא בדפדפן שהשדה נשלח**

הרץ `start_catalog.command`, פתח את הקטלוג, הוסף שני מוצרים לסל, ובקונסול הרץ:

```javascript
// יירוט הפיילוד בלי לשלוח הזמנת בדיקה אמיתית לגיליון
const orig = window.fetch;
window.fetch = (u, o) => { if (String(u).includes('script.google.com')) { console.log(JSON.parse(o.body)); return Promise.resolve(new Response('{}')); } return orig(u, o); };
```

ואז שלח הזמנה. צפוי: כל פריט ב-`items` מכיל `image` עם נתיב שאינו ריק.

- [ ] **Step 4: ודא רגרסיה בדף הסוכן**

פתח `/agent/`, הזן PIN `0526000158`, הוסף מוצר, ופתח את מודאל ההזמנה. צפוי: אפס שגיאות קונסול, עריכת מחיר עדיין עובדת.

- [ ] **Step 5: Commit**

```bash
git add js/app.js sw.js '*.html'
git commit -m "הזמנות: נתיב תמונת המוצר נשלח בפיילוד לצורך תעודת ה-PDF"
```

---

### Task 4: מבנה הטבלה + מחולל מסמך ה-Docs

**Files:**
- Modify: `tools/google-apps-script-orders.gs`
- Create: `tools/test/order-doc.test.js`

**Interfaces:**
- Consumes: `data.items[i].image` ממשימה 3; `images/thumbs/<id>.jpg` ממשימה 2.
- Produces:
  - `thumbUrl_(id) -> String`
  - `orderColumns_(data) -> { headers: String[], rows: String[][], hasPrices: Boolean, imageCol: Number, nameCol: Number, qtyCol: Number }`
  - `buildOrderDoc_(data) -> Blob` (PDF)

**חלוקת האחריות, והסיבה לה:** `orderColumns_` היא פונקציה טהורה שמחזירה
מערכים — אותה אפשר לבדוק אוטומטית ב-Node. `buildOrderDoc_` מציירת בפועל דרך
`DocumentApp`, ואותה אי אפשר להריץ מחוץ לגוגל; היא נבדקת בהרצה אמיתית בענן
(צעד 6). אל תנסה לדמות את `DocumentApp` בבדיקות — זה מבחן של הדמות, לא של הקוד.

- [ ] **Step 1: כתוב את מבחני הכישלון**

צור `tools/test/order-doc.test.js`:

```javascript
/**
 * בדיקות למבנה טבלת תעודת ההזמנה.
 * הקובץ .gs נטען כטקסט ומורץ עם דמויות של שירותי גוגל, כדי שהבדיקה תרוץ
 * על אותו קוד שרץ בענן. נבדקת רק הלוגיקה הטהורה (orderColumns_) —
 * הציור עצמו נבדק בהרצה אמיתית.
 * להרצה: node tools/test/order-doc.test.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadGs() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'google-apps-script-orders.gs'), 'utf8');
  const stubs = `
    var SpreadsheetApp = {}, MailApp = {}, CacheService = {}, DriveApp = {},
        ContentService = {}, Utilities = {}, MimeType = {}, UrlFetchApp = {},
        DocumentApp = { HorizontalAlignment: { LEFT: 'L', RIGHT: 'R', CENTER: 'C' } },
        Logger = { log: function () {} };
  `;
  return new Function(
    stubs + src +
    '; return { orderColumns_: orderColumns_, thumbUrl_: thumbUrl_ };'
  )();
}

const gs = loadGs();

const B2B = {
  orderId: 'AR-20260819-4821', date: '21.08.2026', totalItems: 18,
  totalPrice: '', subtotal: '', discount: '', shipping: '',
  customer: { business: 'מסעדת הגן הירוק בע״מ', contact: 'דנה לוי',
              phone: '054-1234567', address: 'המלאכה 8, אור יהודה' },
  items: [
    { id: 'ניק001', name: 'אקונומיקה 4 ליטר', category: 'ניקיון', qty: 6,
      unit: 'יחידה', image: 'images/ניקיון/אקונומיקה.webp' },
    { id: 'מוצ001', name: 'גליל נייר תעשייתי 5004', category: 'מוצרי נייר',
      qty: 12, unit: 'יחידה', image: '' }
  ]
};

const CARE = {
  orderId: 'AR-20260819-5507', date: '20.08.2026', totalItems: 3,
  subtotal: '233.30', discount: '23.33', shipping: '30.00', totalPrice: '239.97',
  customer: { business: '', contact: 'מיכל ברקוביץ׳', phone: '052-7654321',
              address: 'הרצל 41, קריית אונו' },
  items: [
    { id: '8400027', name: 'ARGANIA מסיכה טיפולית', category: 'שיער', qty: 3,
      unit: 'יחידה', image: 'images/מחירון/arg.jpg', price: 39.9, total: 79.8,
      bundle: '2+1', free: 1 }
  ]
};

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('סדר העמודות: תמונה בימין, כמות בשמאל', () => {
  const c = gs.orderColumns_(B2B);
  // ב-Docs עמודה 0 מרונדרת בצד שמאל, ולכן התמונה חייבת להיות האחרונה
  assert.strictEqual(c.headers[c.headers.length - 1], 'תמונה',
    'התמונה אינה העמודה האחרונה: ' + JSON.stringify(c.headers));
  assert.strictEqual(c.headers[0], 'כמות',
    'הכמות אינה העמודה הראשונה: ' + JSON.stringify(c.headers));
  assert.strictEqual(c.imageCol, c.headers.length - 1);
  assert.strictEqual(c.qtyCol, 0);
});

test('הזמנה עסקית: חמש עמודות, בלי מחירים', () => {
  const c = gs.orderColumns_(B2B);
  assert.strictEqual(c.hasPrices, false);
  assert.strictEqual(c.headers.length, 5, 'מספר עמודות שגוי: ' + c.headers.length);
  assert.ok(c.headers.indexOf('מחיר ליח׳') === -1, 'לא אמורה להיות עמודת מחיר');
  assert.strictEqual(c.rows.length, 2);
  assert.ok(c.rows[0][c.nameCol].indexOf('אקונומיקה 4 ליטר') > -1, 'שם המוצר חסר');
  assert.strictEqual(c.rows[0][c.qtyCol], '6');
});

test('הזמנת טיפוח: שבע עמודות עם מחירים', () => {
  const c = gs.orderColumns_(CARE);
  assert.strictEqual(c.hasPrices, true);
  assert.strictEqual(c.headers.length, 7, 'מספר עמודות שגוי: ' + c.headers.length);
  assert.strictEqual(c.headers[c.headers.length - 1], 'תמונה',
    'התמונה חייבת להישאר אחרונה גם עם מחירים');
  assert.ok(c.rows[0].join(' ').indexOf('39.90') > -1, 'מחיר היחידה חסר');
  assert.ok(c.rows[0].join(' ').indexOf('79.80') > -1, 'סכום השורה חסר');
});

test('מבצע חבילה מופיע בשורה', () => {
  const c = gs.orderColumns_(CARE);
  const cell = c.rows[0][c.nameCol];
  assert.ok(cell.indexOf('2+1') > -1, 'תג המבצע חסר');
  assert.ok(cell.indexOf('1 חינם') > -1, 'מספר היחידות החינם חסר');
});

test('כתובת התמונה הממוזערת נגזרת מהמזהה', () => {
  assert.strictEqual(gs.thumbUrl_('ניק001'),
    'https://aroam.co.il/images/thumbs/' + encodeURIComponent('ניק001') + '.jpg');
});

test('מוצר בלי תמונה מסומן ככזה', () => {
  const c = gs.orderColumns_(B2B);
  assert.strictEqual(c.rows[1][c.imageCol], '', 'תא התמונה אמור להיות ריק');
  assert.strictEqual(c.rows[0][c.imageCol], '', 'תא התמונה נטען בציור, לא במחרוזת');
  assert.strictEqual(c.images[1], null, 'למוצר בלי image לא אמורה להיות כתובת');
  assert.ok(String(c.images[0]).indexOf('thumbs') > -1, 'למוצר עם image חסרה כתובת');
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length
                   : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: הרץ ותאמת כישלון**

```bash
node tools/test/order-doc.test.js
```

צפוי: קריסה עם `orderColumns_ is not defined`.

- [ ] **Step 3: ממש את `thumbUrl_` ואת `orderColumns_`**

הוסף ל-`tools/google-apps-script-orders.gs` אחרי `clean_`:

```javascript
// כתובת התמונה הממוזערת. הקבצים נוצרים ב-tools/make_pdf_thumbs.py.
// חובה JPEG — appendInlineImage של Docs אינו מקבל WebP, ו-155 מ-176
// תמונות המוצר באתר הן webp.
function thumbUrl_(id) {
  return 'https://aroam.co.il/images/thumbs/' + encodeURIComponent(String(id || '')) + '.jpg';
}

/**
 * מבנה טבלת המוצרים.
 * ב-Docs עמודה 0 מרונדרת בצד שמאל, ולכן הסדר הפוך לסדר הקריאה:
 * העמודה הראשונה היא הכמות (שמאל) והאחרונה היא התמונה (ימין).
 * תא התמונה נשאר ריק כאן — התמונה מצוירת בשלב הציור לפי images[].
 */
function orderColumns_(data) {
  var items = data.items || [];
  var hasPrices = Number(data.totalPrice) > 0;

  var headers = hasPrices
    ? ['סה\u05f4כ', 'מחיר ליח\u05f3', 'כמות', 'יחידה', 'מק\u05f4ט', 'מוצר', 'תמונה']
    : ['כמות', 'יחידה', 'מק\u05f4ט', 'מוצר', 'תמונה'];

  var qtyCol = hasPrices ? 2 : 0;
  var nameCol = headers.length - 2;
  var imageCol = headers.length - 1;

  var rows = [], images = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];

    var name = clean_(it.name, 120);
    if (Number(it.free) > 0) {
      name += '\nמבצע ' + clean_(it.bundle, 10) + ' \u2014 ' + clean_(it.free, 10) + ' חינם';
    }

    var row = hasPrices
      ? [Number(it.total || 0).toFixed(2) + ' \u20aa',
         Number(it.price || 0).toFixed(2) + ' \u20aa',
         String(it.qty), clean_(it.unit, 20), clean_(it.id, 30), name, '']
      : [String(it.qty), clean_(it.unit, 20), clean_(it.id, 30), name, ''];

    rows.push(row);
    images.push(it.image && it.id ? thumbUrl_(it.id) : null);
  }

  return {
    headers: headers, rows: rows, images: images,
    hasPrices: hasPrices, qtyCol: qtyCol, nameCol: nameCol, imageCol: imageCol
  };
}
```

שים לב: שם המוצר והקטגוריה/תג המבצע מופרדים ב-`\n` בתוך אותו תא. בשלב הציור
כל שורה כזו הופכת לפסקה נפרדת בתא, עם עיצוב משלה.

- [ ] **Step 4: הרץ עד ירוק**

```bash
node tools/test/order-doc.test.js
```

צפוי: `כל 6 הבדיקות עברו`, קוד יציאה 0.

- [ ] **Step 5: ממש את `buildOrderDoc_`**

הבסיס המאומת נמצא ב-`.superpowers/sdd/order-doc-reference.gs` — הקוד שהופק
בספייק ואושר על ידי רועי. העתק ממנו את הפריסה והתאם:

1. **סדר העמודות מגיע מ-`orderColumns_`**, לא קשיח בקוד.
2. תמונות נטענות מ-`images[i]`, ומדלגים על `null` בלי לזרוק שגיאה.
3. בלוק הסיכום (סכום ביניים / הנחה / משלוח / סה״כ) נבנה **רק כש-`hasPrices`**,
   כטבלה נפרדת שבה שורת הסה״כ היא תא ברקע `#1A4231` עם טקסט לבן.
4. בסוף: `doc.saveAndClose()`, ייצוא ל-PDF, ואז
   **`DriveApp.getFileById(doc.getId()).setTrashed(true)`** — מסמך הביניים
   נמחק. בלי זה כל הזמנה משאירה Doc זבל ב-Drive של רועי.
5. שני תיקונים שרועי ביקש על גבי הספייק: **הלוגו צמוד לשם העסק** ולא מעליו
   (תא נפרד בתוך אותה רצועה), ו**פס ירוק עליון לכרטיסים** (שורת טבלה דקה
   ברקע `#639C7D` מעל כל כרטיס — גבולות ב-Docs אחידים לכל הטבלה ולכן זו הדרך).

- [ ] **Step 6: הרץ בענן ואמת ויזואלית**

הדבק את הקובץ בפרויקט Apps Script של ההזמנות, הרץ `testOrder`, ופתח את ה-PDF.
בדוק אחת-אחת: התמונה בעמודה הימנית והכמות בשמאלית · רצועת הכותרת ירוקה כהה ·
שורת הכותרות ירוקה עם טקסט לבן · פסים לסירוגין · הלוגו צמוד לשם · פס ירוק מעל
הכרטיסים · הערות עם פס פסטל · **מסמך הביניים אינו נשאר ב-Drive**.

- [ ] **Step 7: Commit**

```bash
git add tools/google-apps-script-orders.gs tools/test/
git commit -m "הזמנות: מחולל תעודת ההזמנה כמסמך Docs + בדיקות מבנה"
```

---

### Task 5: יצירת ה-PDF, שמירה ל-Drive וצירוף למייל

**Files:**
- Modify: `tools/google-apps-script-orders.gs` (`SHEET_HEADERS`, `doPost`, הוספת `savePdf_`)

הערה: `buildOrderDoc_` כבר מוחקת את מסמך הביניים; `savePdf_` אחראית רק על העותק הסופי.

**Interfaces:**
- Consumes: `buildOrderDoc_(data)` ממשימה 4.
- Produces: `savePdf_(data) -> { blob: Blob, url: String }` או `null` בכישלון.

- [ ] **Step 1: הוסף את העמודה החדשה בסוף הכותרות**

ב-`SHEET_HEADERS` (שורה 134), הוסף `'קובץ PDF'` **בסוף המערך בלבד**:

```javascript
var SHEET_HEADERS = ['תאריך קבלה', 'מספר הזמנה', 'תאריך אספקה מבוקש', 'שם העסק',
  'איש קשר', 'טלפון', 'כתובת למשלוח', 'הערות', 'פירוט פריטים', 'סה"כ פריטים',
  'סה"כ לתשלום', 'סטטוס', 'שיטת אספקה', 'דמי משלוח', 'אופן תשלום', 'קובץ PDF'];
```

`STATUS_COL` נשאר `12` — הוא לא זז. מנגנון השדרוג ב-`getOrCreateSheet_` (שורה 157) כבר משלים כותרות חסרות בגיליון קיים, ולכן אין צורך לגעת בו.

- [ ] **Step 2: הוסף את פונקציית השמירה**

הוסף אחרי `buildOrderDoc_`:

```javascript
var PDF_FOLDER_NAME = 'הזמנות אהרוני — PDF';

// מחזיר את תיקיית היעד ב-Drive, ויוצר אותה בפעם הראשונה
function pdfFolder_() {
  var it = DriveApp.getFoldersByName(PDF_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PDF_FOLDER_NAME);
}

/**
 * מייצר את ה-PDF ושומר עותק ב-Drive.
 * מחזיר null בכל כישלון — הקורא ממשיך בלעדיו.
 */
function savePdf_(data) {
  try {
    var name = (clean_(data.orderId, 30) || 'order') + '.pdf';
    var blob = buildOrderDoc_(data).setName(name);
    var file = pdfFolder_().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { blob: blob, url: file.getUrl() };
  } catch (err) {
    Logger.log('PDF failed: ' + err);
    return null;
  }
}
```

- [ ] **Step 3: חבר ל-`doPost`**

ב-`doPost`, **לפני** `sheet.appendRow([...])`, הוסף:

```javascript
    // תעודת ההזמנה. כישלון כאן לא מפיל את ההזמנה — הפונקציה מחזירה null.
    var pdf = savePdf_(data);
```

הוסף לסוף מערך `appendRow` איבר אחרון:

```javascript
      clean_(customer.payment, 60),        // אופן תשלום
      pdf ? pdf.url : ''                   // קובץ PDF
```

ובקריאה למייל, החלף את השורה `MailApp.sendEmail(NOTIFY_EMAIL, subject, body);` ב:

```javascript
      var mailOpts = pdf ? { attachments: [pdf.blob] } : {};
      MailApp.sendEmail(NOTIFY_EMAIL, subject, body, mailOpts);
```

- [ ] **Step 4: הרץ את הבדיקות מחדש**

```bash
node tools/test/order-doc.test.js
```

צפוי: `כל 6 הבדיקות עברו` — הרתמה טוענת את הקובץ כולו, ולכן היא גם מאמתת שלא נשברה תחביר.

- [ ] **Step 5: בדוק בענן**

הדבק את הקובץ המעודכן בפרויקט Apps Script של ההזמנות, הרץ **`testOrder`** (לא `doPost` — טעות שכבר נעשתה בעבר), ובדוק:

1. במייל התקבל קובץ `AR-TEST-0001.pdf` עם תמונות.
2. בתיקיית Drive `הזמנות אהרוני — PDF` יש עותק.
3. בגיליון, בעמודה האחרונה, יש קישור שנפתח.

- [ ] **Step 6: בדוק את מסלול הכישלון**

שנה זמנית ב-`thumbUrl_` את הדומיין לכתובת שאינה קיימת, הרץ `testOrder` שוב, וודא ש**השורה בגיליון והמייל נשלחו בכל זאת**. החזר את הכתובת.

- [ ] **Step 7: Commit**

```bash
git add tools/google-apps-script-orders.gs
git commit -m "הזמנות: תעודת PDF מצורפת למייל ונשמרת ב-Drive עם קישור בגיליון"
```

---

### Task 6: קישור "פתח כהצעת מחיר"

**Files:**
- Modify: `tools/google-apps-script-orders.gs` (הוספת `quoteLink_`, שימוש ב-`doPost`)
- Modify: `tools/test/order-doc.test.js` (בדיקות נוספות)

**Interfaces:**
- Consumes: `data.items[]`, `data.totalPrice`, `data.customer`.
- Produces: `quoteLink_(data) -> String` — כתובת מלאה, או מחרוזת ריקה כשלהזמנה כבר יש מחירים.

- [ ] **Step 1: הוסף מבחני כישלון**

הוסף ל-`tools/test/order-doc.test.js`, לפני שורת ההרצה:

```javascript
test('קישור הצעת מחיר: נבנה להזמנה בלי מחירים', () => {
  const link = gs.quoteLink_(B2B);
  assert.ok(link.indexOf('https://aroam.co.il/agent/?cart=') === 0, 'תחילית שגויה: ' + link);
  assert.ok(link.includes(encodeURIComponent('ניק001') + ':6'), 'הפריט הראשון חסר');
  assert.ok(link.includes(encodeURIComponent('מוצ001') + ':4'), 'הפריט השני חסר');
  assert.ok(link.includes('customer=' + encodeURIComponent('מסעדת הגן הירוק בע״מ')), 'שם הלקוח חסר');
});

test('קישור הצעת מחיר: אינו נבנה כשיש כבר מחירים', () => {
  assert.strictEqual(gs.quoteLink_(CARE), '', 'לא אמור להיווצר קישור להזמנה עם מחירים');
});
```

עדכן את שורת ה-`return` ב-`loadGs` כך שתחזיר גם אותה:

```javascript
    '; return { orderColumns_: orderColumns_, thumbUrl_: thumbUrl_,' +
    '   quoteLink_: quoteLink_ };'
```

- [ ] **Step 2: הרץ ותאמת כישלון**

```bash
node tools/test/order-doc.test.js
```

צפוי: שתי הבדיקות החדשות נופלות על `quoteLink_ is not defined`.

- [ ] **Step 3: ממש**

הוסף ל-`.gs` אחרי `thumbUrl_`:

```javascript
/**
 * קישור שפותח את ההזמנה בדף הסוכן לצורך תמחור.
 * מוחזר רק כשלהזמנה אין מחירים — כלומר רק מהקטלוג העסקי. בקטלוגי
 * הטיפוח והוועד המחירים כבר סופיים, ודף הסוכן ממילא טוען products.csv בלבד.
 */
function quoteLink_(data) {
  if (Number(data.totalPrice) > 0) return '';
  var items = data.items || [];
  if (!items.length) return '';

  var parts = [];
  for (var i = 0; i < items.length; i++) {
    if (!items[i].id || !(Number(items[i].qty) > 0)) continue;
    parts.push(encodeURIComponent(items[i].id) + ':' + Number(items[i].qty));
  }
  if (!parts.length) return '';

  var cust = data.customer || {};
  var name = cust.business || cust.contact || '';
  return 'https://aroam.co.il/agent/?cart=' + parts.join(',') +
         (name ? '&customer=' + encodeURIComponent(name) : '');
}
```

- [ ] **Step 4: הרץ עד ירוק**

```bash
node tools/test/order-doc.test.js
```

צפוי: `כל 8 הבדיקות עברו`.

- [ ] **Step 5: הוסף את הקישור לגוף המייל**

ב-`doPost`, מיד לפני `MailApp.sendEmail`, הוסף:

```javascript
      var qlink = quoteLink_(data);
      if (qlink) {
        body += '\n\nלהפיכת ההזמנה להצעת מחיר (נפתח בדף הסוכן עם המחירים):\n' + qlink + '\n';
      }
```

- [ ] **Step 6: בדוק בענן**

הרץ `testOrder` (שאין בו `totalPrice`? יש — 120.30). צור **עותק זמני** של `testOrder` בשם `testOrderNoPrices` שבו `totalPrice: ''` ובלי `price`/`total` בפריטים, הרץ אותו, וודא שהמייל מכיל קישור. לחץ עליו וודא שדף הסוכן נפתח עם שני הפריטים. מחק את הפונקציה הזמנית.

- [ ] **Step 7: Commit**

```bash
git add tools/google-apps-script-orders.gs tools/test/order-doc.test.js
git commit -m "הזמנות: קישור להפיכת הזמנה עסקית להצעת מחיר בדף הסוכן"
```

---

### Task 7: דף הסוכן — פרמטר `customer` ועיצוב אחיד להצעה

**Files:**
- Modify: `js/app.js:2615-2666` (`printQuote`)
- Modify: `css/style.css` (כללי `@media print`)
- Modify: פרמטרי גרסה + `sw.js`

**Interfaces:**
- Consumes: `?customer=` מהקישור שמשימה 6 בונה; `?cart=` (קיים).
- Produces: אין ממשק לצרכן נוסף.

- [ ] **Step 1: קרא את שם הלקוח מהכתובת**

ב-`printQuote` (שורה 2616), החלף:

```javascript
        const customerName = prompt("טופס הדפסה: נא להזין שם לקוח", "לקוח כללי");
```

ב:

```javascript
        // כשההזמנה נפתחה מקישור שנשלח במייל, שם הלקוח מוצע כברירת מחדל.
        // ה-prompt נשאר כדי שרועי יוכל לתקן לפני ההדפסה.
        const suggested = new URLSearchParams(window.location.search).get('customer');
        const customerName = prompt("טופס הדפסה: נא להזין שם לקוח", suggested || "לקוח כללי");
```

- [ ] **Step 2: החלף את כותרת ההדפסה בעיצוב המאושר**

החלף את `headerDiv.innerHTML` (שורות 2626-2643) ב:

```javascript
        headerDiv.innerHTML = `
            <div class="q-head">
                <div class="q-brand">
                    <img src="/images/logo.png" alt="">
                    <div>
                        <strong>אהרוני שיווק והפצה</strong>
                        <span>חומרי ניקוי · נייר · חד פעמי · ציוד משרדי</span>
                    </div>
                </div>
                <div class="q-meta">
                    <div class="q-kind">הצעת מחיר</div>
                    <div class="q-num">${savedQuote.id}</div>
                    <div class="q-date">${savedQuote.date}</div>
                </div>
            </div>
            <div class="q-to">לכבוד: <strong>${savedQuote.customer}</strong></div>
        `;
```

`footerDiv` נשאר **כפי שהוא** — שורות החתימה, "ט.ל.ח", "המחירים אינם כוללים מע״מ" ו"תוקף ההצעה: 14 יום" הם תוכן משפטי שאין לגעת בו.

- [ ] **Step 3: הוסף את כללי ההדפסה**

הוסף לסוף `css/style.css`:

```css
/* ===== הצעת מחיר להדפסה (דף הסוכן) ===== */
/* העיצוב תואם את תעודת ההזמנה שנשלחת במייל, כדי שהלקוח יראה שפה אחת. */
@media print {
    .q-head {
        display: flex; justify-content: space-between; align-items: center;
        background: #1A4231; color: #fff; border-radius: 8px;
        padding: 14px 18px; margin-bottom: 14px;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .q-brand { display: flex; align-items: center; gap: 12px; }
    .q-brand img { height: 46px; background: #fff; border-radius: 6px; padding: 4px 6px; }
    .q-brand strong { display: block; font-size: 14pt; }
    .q-brand span { font-size: 9pt; color: #BFD9CB; }
    .q-meta { text-align: left; }
    .q-kind { font-size: 12pt; font-weight: 700; }
    .q-num { font-size: 15pt; font-weight: 800; color: #8FD6A3; }
    .q-date { font-size: 9pt; color: #BFD9CB; }
    .q-to { font-size: 11pt; margin-bottom: 10px; }

    #order-modal thead th {
        background: #639C7D !important; color: #fff !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    #order-modal tbody tr { page-break-inside: avoid; }
    #order-modal thead { display: table-header-group; }
    /* עמודת התמונה מוסתרת במסך העבודה ומופיעה רק בהדפסה */
    #order-modal .oc-img img { width: 44px; height: 44px; object-fit: contain; }
}
```

- [ ] **Step 4: העלה גרסאות**

```bash
cd "/Users/roeiaharoni/Desktop/קטלוג לקוחות/aroan"
grep -rl 'app\.js?v=39' --include='*.html' . | xargs sed -i '' 's/app\.js?v=39/app.js?v=40/g'
grep -rl 'style\.css?v=30' --include='*.html' . | xargs sed -i '' 's/style\.css?v=30/style.css?v=31/g'
sed -i '' "s/aroam-cache-v32/aroam-cache-v33/" sw.js
```

ודא אחר כך שהכל תפס:

```bash
grep -rho 'app\.js?v=[0-9]*' --include='*.html' . | sort | uniq -c
grep -rho 'style\.css?v=[0-9]*' --include='*.html' . | sort | uniq -c
grep -n 'CACHE_NAME' sw.js
```

צפוי: `14 app.js?v=40`, `14 style.css?v=31`, `aroam-cache-v33` — שורה אחת לכל ערך, בלי שאריות מגרסה קודמת.

- [ ] **Step 5: ודא בדפדפן**

פתח `/agent/?cart=ניק001:6,מוצ001:4&customer=מסעדת%20הגן%20הירוק`, הזן PIN, וודא:

1. שני הפריטים בסל עם הכמויות הנכונות.
2. פתיחת מודאל ההזמנה → "הדפס הצעת מחיר" → ב-prompt מופיע "מסעדת הגן הירוק".
3. בתצוגה המקדימה של ההדפסה: רצועה ירוקה כהה, מספר הצעה, תמונות, ושורות החתימה בתחתית.

- [ ] **Step 6: ודא רגרסיה**

1. `/agent/` בלי פרמטרים → ב-prompt מופיע "לקוח כללי".
2. `/catalog/` → אין כפתור הדפסה (`allowPdf` כבוי), עמוד הסל תקין.
3. `/care/` → 63 מוצרים, בוררי אספקה, אפס שגיאות קונסול.

- [ ] **Step 7: Commit**

```bash
git add js/app.js css/style.css sw.js '*.html'
git commit -m "דף הסוכן: שם לקוח מהכתובת ועיצוב אחיד להצעת המחיר"
```

---

### Task 8: פריסה ואימות מקצה לקצה

**Files:**
- Modify: `CLAUDE.md` (סבב חדש בסעיף "מה בוצע")
- Modify: `docs/superpowers/specs/2026-08-19-order-pdf-quote-design.md` (סטטוס)

- [ ] **Step 1: ודא שהכל committed**

```bash
git status --short && node tools/test/order-doc.test.js
```

צפוי: עץ נקי, כל הבדיקות עוברות.

- [ ] **Step 2: בקש מרועי push**

התמונות הממוזערות חייבות להיות חיות **לפני** שהסקריפט בענן מנסה למשוך אותן.

```bash
git push
```

המתן לאישור, ואז ודא שהתמונות עלו:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://aroam.co.il/images/thumbs/$(python3 -c "import urllib.parse;print(urllib.parse.quote('ניק001'))").jpg"
```

צפוי: `200`.

- [ ] **Step 3: פרוס את גרסת ה-Apps Script**

בפרויקט "aroma order webhook": הדבק את `tools/google-apps-script-orders.gs`, ואז פריסה ← ניהול הפריסות ← עריכה ← **גרסה חדשה** (מזהה הפריסה לא משתנה, ולכן אין צורך לגעת ב-`app.js`).

- [ ] **Step 4: הזמנת בדיקה אמיתית מהאתר**

מהאתר החי, שלח הזמנה מהקטלוג העסקי עם 3 מוצרים. ודא בזה אחר זה:

1. שורה חדשה בגיליון, עם קישור בעמודה "קובץ PDF".
2. מייל עם קובץ מצורף, שהתמונות בו מופיעות.
3. במייל יש קישור "להפיכת ההזמנה להצעת מחיר".
4. לחיצה עליו פותחת את דף הסוכן עם שלושת המוצרים.
5. הדפסת ההצעה מפיקה מסמך בעיצוב החדש.

- [ ] **Step 5: מחק את שורת הבדיקה מהגיליון**

- [ ] **Step 6: עדכן את התיעוד**

הוסף ל-`CLAUDE.md` סבב חדש (36) לפי תבנית הסבבים הקיימים: מה נבנה, אילו קבצים, מה אומת, ומה דורש רועי. סמן את מסמך העיצוב כ"בוצע".

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-08-19-order-pdf-quote-design.md
git commit -m "תיעוד: סבב תעודת הזמנה PDF והצעת מחיר"
```
