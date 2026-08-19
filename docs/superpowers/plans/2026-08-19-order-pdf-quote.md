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
- Produces: `items[i].image` — נתיב יחסי כמו `images/ניקיון/אקונומיקה 4 ליטר.webp`. משימה 4 **לא** משתמשת בו לבניית הכתובת (היא בונה מהמזהה), אבל הוא נשלח כדי שיהיה גיבוי אם מוצר חסר תמונה ממוזערת.

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

### Task 4: מחולל ה-HTML + רתמת בדיקה ב-Node

זו המשימה הכבדה. המחולל הוא פונקציה טהורה שבונה מחרוזת — ולכן אפשר לבדוק אותה אוטומטית ב-Node בלי להעלות דבר לענן.

**Files:**
- Modify: `tools/google-apps-script-orders.gs` (הוספת `escapeHtml_`, `thumbUrl_`, `buildOrderHtml_`)
- Create: `tools/test/order-pdf.test.js`
- Create: `tools/test/render-sample.js`

**Interfaces:**
- Consumes: `data.items[i].image` ממשימה 3; מוסכמת `images/thumbs/<id>.jpg` ממשימה 2.
- Produces:
  - `escapeHtml_(value) -> string`
  - `thumbUrl_(id) -> string`
  - `buildOrderHtml_(data) -> string` — `data` הוא אובייקט ההזמנה המפוענח מהפיילוד (`orderId`, `date`, `items[]`, `customer{}`, `subtotal`, `discount`, `shipping`, `totalPrice`, `totalItems`).

- [ ] **Step 1: כתוב את מבחני הכישלון**

צור `tools/test/order-pdf.test.js`:

```javascript
/**
 * בדיקות למחולל ה-HTML של תעודת ההזמנה.
 * הקובץ .gs נטען כטקסט ומורץ עם דמויות (stubs) של שירותי גוגל,
 * כדי שהבדיקה תרוץ על אותו קוד בדיוק שרץ בענן — בלי שכפול.
 * להרצה: node tools/test/order-pdf.test.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadGs() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'google-apps-script-orders.gs'), 'utf8');
  const stubs = `
    var SpreadsheetApp = {}, MailApp = {}, CacheService = {}, DriveApp = {},
        ContentService = {}, Utilities = {}, MimeType = {}, Logger = { log: function () {} };
  `;
  const factory = new Function(
    stubs + src +
    '; return { buildOrderHtml_: buildOrderHtml_, escapeHtml_: escapeHtml_, thumbUrl_: thumbUrl_ };'
  );
  return factory();
}

const gs = loadGs();

const B2B = {
  orderId: 'AR-20260819-4821',
  date: '21.08.2026',
  totalItems: 10,
  totalPrice: '', subtotal: '', discount: '', shipping: '',
  customer: { business: 'מסעדת הגן הירוק בע״מ', contact: 'דנה לוי',
              phone: '054-1234567', address: 'המלאכה 8, אור יהודה', notes: 'לתאם טלפונית' },
  items: [
    { id: 'ניק001', name: 'אקונומיקה 4 ליטר', category: 'ניקיון', qty: 6,
      unit: 'יחידה', image: 'images/ניקיון/אקונומיקה 4 ליטר.webp', price: 0, total: 0 },
    { id: 'מוצ001', name: 'גליל נייר תעשייתי 5004', category: 'מוצרי נייר', qty: 4,
      unit: 'יחידה', image: '', price: 0, total: 0 }
  ]
};

const CARE = {
  orderId: 'AR-20260819-5507',
  date: '20.08.2026',
  totalItems: 5,
  subtotal: '273.20', discount: '27.32', shipping: '30.00', totalPrice: '275.88',
  customer: { business: '', contact: 'מיכל ברקוביץ׳', phone: '052-7654321',
              address: 'הרצל 41, קריית אונו', notes: '',
              shipping: 'משלוח עד הבית', payment: 'אשראי במסירה' },
  items: [
    { id: '8400027', name: 'ARGANIA מסיכה טיפולית', category: 'שיער', qty: 3,
      unit: 'יחידה', image: 'images/מחירון/arg.jpg', price: 39.9, total: 79.8,
      bundle: '2+1', free: 1 }
  ]
};

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('הזמנה עסקית: בלי עמודות מחיר ובלי בלוק סיכום', () => {
  const html = gs.buildOrderHtml_(B2B);
  assert.ok(!html.includes('מחיר ליח'), 'לא אמורה להיות עמודת מחיר');
  assert.ok(!html.includes('סה״כ לתשלום'), 'לא אמור להיות בלוק סיכום');
  assert.ok(html.includes('אקונומיקה 4 ליטר'), 'שם המוצר חסר');
  assert.ok(html.includes('AR-20260819-4821'), 'מספר ההזמנה חסר');
  assert.ok(html.includes('מסעדת הגן הירוק'), 'שם הלקוח חסר');
});

test('הזמנה עסקית: תמונה ממוזערת לפי מזהה, ותא ריק כשאין תמונה', () => {
  const html = gs.buildOrderHtml_(B2B);
  assert.ok(html.includes('images/thumbs/' + encodeURIComponent('ניק001') + '.jpg'),
    'כתובת התמונה הממוזערת שגויה');
  assert.ok(html.includes('אין תמונה'), 'חסר תא חלופי למוצר בלי תמונה');
});

test('הזמנת טיפוח: מחירים, סיכום ותג מבצע', () => {
  const html = gs.buildOrderHtml_(CARE);
  assert.ok(html.includes('מחיר ליח'), 'חסרה עמודת מחיר');
  assert.ok(html.includes('סה״כ לתשלום'), 'חסר בלוק סיכום');
  assert.ok(html.includes('275.88'), 'הסכום הסופי חסר');
  assert.ok(html.includes('27.32'), 'ההנחה חסרה');
  assert.ok(html.includes('2+1'), 'תג המבצע חסר');
  assert.ok(html.includes('1 חינם'), 'מספר היחידות החינם חסר');
});

test('בריחת תווים: שם מוצר עוין אינו הופך לתגית', () => {
  const evil = JSON.parse(JSON.stringify(B2B));
  evil.items[0].name = '<script>alert(1)</script>';
  const html = gs.buildOrderHtml_(evil);
  assert.ok(!html.includes('<script>alert'), 'לא בוצעה בריחת תווים');
  assert.ok(html.includes('&lt;script&gt;'), 'הבריחה לא בפורמט הצפוי');
});

test('המסמך תקין מבנית', () => {
  const html = gs.buildOrderHtml_(B2B);
  assert.ok(html.startsWith('<!doctype html>'), 'חסר doctype');
  assert.ok(html.includes('dir="rtl"'), 'המסמך אינו RTL');
  assert.ok(html.trim().endsWith('</html>'), 'המסמך אינו סגור');
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: הרץ ותאמת כישלון**

```bash
node tools/test/order-pdf.test.js
```

צפוי: קריסה עם `buildOrderHtml_ is not defined` — הפונקציה עוד לא קיימת.

- [ ] **Step 3: כתוב את המחולל**

הוסף ל-`tools/google-apps-script-orders.gs`, אחרי `clean_` (שורה 41):

```javascript
// בריחת תווים ל-HTML. שמות מוצרים והערות לקוח מגיעים מקלט חיצוני.
function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// כתובת התמונה הממוזערת. הקבצים נוצרים ב-tools/make_pdf_thumbs.py
// ונקראים לפי מזהה המוצר, בתיקייה שטוחה אחת.
function thumbUrl_(id) {
  return 'https://aroam.co.il/images/thumbs/' + encodeURIComponent(String(id || '')) + '.jpg';
}

// שורת פרט בכרטיסי הכותרת
function infoRow_(k, v) {
  if (!v) return '';
  return '<div class="row"><span class="k">' + escapeHtml_(k) + '</span>' +
         '<span class="v">' + escapeHtml_(v) + '</span></div>';
}

/**
 * בונה את ה-HTML של תעודת ההזמנה.
 * כשאין מחירים (הקטלוג העסקי) — עמודות המחיר ובלוק הסיכום נשמטים לגמרי.
 */
function buildOrderHtml_(data) {
  var items = data.items || [];
  var cust = data.customer || {};
  var hasPrices = Number(data.totalPrice) > 0;

  var rows = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    // תמונה מוצגת רק כשלמוצר יש מזהה וגם נתיב תמונה במקור —
    // אחרת נקבל ריבוע שבור במסמך שנשלח ללקוח.
    var cell = (it.id && it.image)
      ? '<img src="' + thumbUrl_(it.id) + '" alt="">'
      : '<div class="none">אין תמונה</div>';

    var bundle = '';
    if (Number(it.free) > 0) {
      bundle = '<div class="bundle">מבצע ' + escapeHtml_(it.bundle) + ' — ' +
               escapeHtml_(it.free) + ' חינם</div>';
    }

    var money = '';
    if (hasPrices) {
      money = '<td class="money">' + Number(it.price || 0).toFixed(2) + ' &#8362;</td>' +
              '<td class="money"><strong>' + Number(it.total || 0).toFixed(2) + ' &#8362;</strong></td>';
    }

    rows += '<tr>' +
      '<td class="img">' + cell + '</td>' +
      '<td><div class="pname">' + escapeHtml_(it.name) + '</div>' +
          '<div class="pcat">' + escapeHtml_(it.category) + '</div>' + bundle + '</td>' +
      '<td class="c sku">' + escapeHtml_(it.id) + '</td>' +
      '<td class="c">' + escapeHtml_(it.unit) + '</td>' +
      '<td class="c"><span class="qty">' + escapeHtml_(it.qty) + '</span></td>' +
      money + '</tr>';
  }

  var priceHeads = hasPrices
    ? '<th class="c">מחיר ליח&#1523;</th><th class="c">סה&#1524;כ</th>' : '';

  var totals = '';
  if (hasPrices) {
    var line = function (label, value, cls) {
      return '<div class="l ' + cls + '"><span>' + label + '</span><span>' + value + '</span></div>';
    };
    totals = '<div class="totals"><div class="totals-box">' +
      line('סכום ביניים', Number(data.subtotal || data.totalPrice).toFixed(2) + ' &#8362;', '') +
      (Number(data.discount) > 0 ? line('הנחת מבצע', '-' + Number(data.discount).toFixed(2) + ' &#8362;', 'disc') : '') +
      (Number(data.shipping) > 0 ? line('דמי משלוח', Number(data.shipping).toFixed(2) + ' &#8362;', '') : '') +
      line('סה&#1524;כ לתשלום', Number(data.totalPrice).toFixed(2) + ' &#8362;', 'grand') +
      '</div></div>';
  }

  var notes = cust.notes
    ? '<div class="notes"><strong>הערות הלקוח:</strong> ' + escapeHtml_(cust.notes) + '</div>' : '';

  var custCard = infoRow_(cust.business ? 'שם העסק' : 'שם מלא', cust.business || cust.contact) +
    (cust.business ? infoRow_('איש קשר', cust.contact) : '') +
    infoRow_('טלפון', cust.phone) + infoRow_('כתובת', cust.address);

  var orderCard = infoRow_('אספקה מבוקשת', data.date) +
    infoRow_('שיטת אספקה', cust.shipping) + infoRow_('אופן תשלום', cust.payment) +
    infoRow_('סה&#1524;כ פריטים', data.totalItems) + infoRow_('סטטוס', 'חדשה');

  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">' +
    '<title>' + escapeHtml_(data.orderId) + '</title><style>' + ORDER_PDF_CSS + '</style></head><body>' +
    '<div class="doc-head">' +
      '<div class="brand">' +
        '<img src="https://aroam.co.il/images/logo.png" alt="">' +
        '<div class="brand-txt"><strong>אהרוני שיווק והפצה</strong>' +
        '<span>חומרי ניקוי &#183; נייר &#183; חד פעמי &#183; ציוד משרדי</span></div>' +
      '</div>' +
      '<div class="meta"><div class="kind">תעודת הזמנה</div>' +
      '<div class="num">' + escapeHtml_(data.orderId) + '</div>' +
      '<div class="date">התקבלה ' + Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd.MM.yyyy HH:mm') + '</div></div>' +
    '</div>' +
    '<div class="cards">' +
      '<div class="card"><h3>פרטי הלקוח</h3>' + custCard + '</div>' +
      '<div class="card"><h3>פרטי ההזמנה</h3>' + orderCard + '</div>' +
    '</div>' +
    '<table><thead><tr><th class="c">תמונה</th><th>מוצר</th><th class="c">מק&#1524;ט</th>' +
    '<th class="c">יחידה</th><th class="c">כמות</th>' + priceHeads + '</tr></thead>' +
    '<tbody>' + rows + '</tbody></table>' + totals + notes +
    '<div class="foot"><span>הזמנה זו נוצרה אוטומטית מהאתר aroam.co.il</span>' +
    '<span class="c">052-6000158 &#183; 03-6346236 &#183; meiraroam@gmail.com</span></div>' +
    '</body></html>';
}
```

הערה: הבדיקה `test('בריחת תווים')` בודקת שהתוצאה מכילה `&lt;script&gt;` — כלומר `escapeHtml_` חייב לרוץ על שם המוצר, כפי שנעשה למעלה.

- [ ] **Step 4: הוסף את גיליון הסגנון**

הוסף לקובץ ה-`.gs`, מיד לפני `buildOrderHtml_`, את הקבוע הבא. זהו בדיוק ה-CSS של הדוגמה שאושרה, עם שינוי אחד מכוון: `font-family` צומצם ל-`Arial, "Arial Hebrew", sans-serif`, כי הממיר של גוגל אינו טוען גופני רשת ורשימה ארוכה רק מסתירה מה באמת ירונדר.

```javascript
var ORDER_PDF_CSS =
  '@page { size: A4; margin: 12mm 10mm;}' +
  '* { box-sizing: border-box; margin: 0; padding: 0;}' +
  'body { font-family: Arial, "Arial Hebrew", sans-serif; direction: rtl; color: #22312A; font-size: 11pt; line-height: 1.45; background: #fff;}' +
  '.doc-head { display: flex; align-items: center; justify-content: space-between; background: #1A4231; color: #fff; border-radius: 8px; padding: 14px 18px; margin-bottom: 14px;}' +
  '.doc-head .brand { display: flex; align-items: center; gap: 12px;}' +
  '.doc-head img { height: 46px; background: #fff; border-radius: 6px; padding: 4px 6px;}' +
  '.doc-head .brand-txt strong { display: block; font-size: 14pt; letter-spacing: .2px;}' +
  '.doc-head .brand-txt span { font-size: 9pt; color: #BFD9CB;}' +
  '.doc-head .meta { text-align: left;}' +
  '.doc-head .meta .kind { font-size: 12pt; font-weight: 700;}' +
  '.doc-head .meta .num { font-size: 15pt; font-weight: 800; color: #8FD6A3; letter-spacing: .5px;}' +
  '.doc-head .meta .date { font-size: 9pt; color: #BFD9CB;}' +
  '.cards { display: flex; gap: 10px; margin-bottom: 14px;}' +
  '.card { flex: 1; border: 1px solid #D6E3DB; border-radius: 8px; background: #F7FBF8; padding: 10px 12px;}' +
  '.card h3 { font-size: 9pt; color: #639C7D; text-transform: none; font-weight: 700; border-bottom: 1px solid #D6E3DB; padding-bottom: 5px; margin-bottom: 6px;}' +
  '.row { display: flex; gap: 6px; font-size: 10pt; padding: 1.5px 0;}' +
  '.row .k { color: #6B7B72; min-width: 74px;}' +
  '.row .v { font-weight: 600;}' +
  'table { width: 100%; border-collapse: collapse;}' +
  'thead th { background: #639C7D; color: #fff; font-size: 9.5pt; font-weight: 700; padding: 7px 8px; text-align: right; border: 1px solid #58896e;}' +
  'thead th.c, tbody td.c { text-align: center;}' +
  'tbody td.money { white-space: nowrap; text-align: center;}' +
  'tbody td { border: 1px solid #DFE9E3; padding: 6px 8px; font-size: 10pt; vertical-align: middle;}' +
  'tbody tr:nth-child(even) td { background: #F7FBF8;}' +
  'tbody tr { page-break-inside: avoid;}' +
  'thead { display: table-header-group;}' +
  'td.img { width: 58px; padding: 4px;}' +
  'td.img img { width: 50px; height: 50px; object-fit: contain; background: #fff; border: 1px solid #EAF0EC; border-radius: 5px; display: block;}' +
  'td.img .none { width: 50px; height: 50px; border: 1px dashed #D6E3DB; border-radius: 5px; font-size: 7pt; color: #A9B8B0; display: flex; align-items: center; justify-content: center; text-align: center;}' +
  '.pname { font-weight: 700;}' +
  '.pcat { font-size: 8.5pt; color: #7A8A81;}' +
  '.sku { font-size: 9pt; color: #6B7B72; letter-spacing: .3px; white-space: nowrap;}' +
  '.qty { font-size: 13pt; font-weight: 800; color: #1A4231;}' +
  '.bundle { display: inline-block; background: #FDEDEC; color: #B4342A; border: 1px solid #F3C5C0; border-radius: 4px; font-size: 8pt; font-weight: 700; padding: 1px 5px; margin-top: 2px;}' +
  '.totals { display: flex; justify-content: flex-start; margin-top: 12px;}' +
  '.totals-box { min-width: 230px; border: 1px solid #D6E3DB; border-radius: 8px; overflow: hidden;}' +
  '.totals-box .l { display: flex; justify-content: space-between; gap: 20px; padding: 6px 12px; font-size: 10pt; background: #F7FBF8; border-bottom: 1px solid #E6EEE9;}' +
  '.totals-box .l.disc { color: #B4342A;}' +
  '.totals-box .l.grand { background: #1A4231; color: #fff; font-size: 12.5pt; font-weight: 800; border-bottom: 0;}' +
  '.notes { margin-top: 12px; border-inline-start: 4px solid #8FD6A3; background: #F2F8F4; border-radius: 0 6px 6px 0; padding: 8px 12px; font-size: 10pt;}' +
  '.notes strong { color: #1A4231;}' +
  '.foot { margin-top: 16px; border-top: 1px solid #DFE9E3; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 9pt; color: #7A8A81;}' +
  '.foot .c { color: #1A4231; font-weight: 700;}';
```

**שני כללים שאסור להשמיט:** `thead { display: table-header-group; }` ו-`tbody tr { page-break-inside: avoid; }` — הם מה שמחזיר את שורת הכותרות בכל עמוד ומונע שורה שנחתכת באמצע בהזמנה ארוכה.

- [ ] **Step 5: הרץ את הבדיקות עד ירוק**

```bash
node tools/test/order-pdf.test.js
```

צפוי: `כל 5 הבדיקות עברו`, קוד יציאה 0.

- [ ] **Step 6: רנדר דוגמה ובדוק ויזואלית**

צור `tools/test/render-sample.js`:

```javascript
/**
 * מרנדר דוגמת תעודת הזמנה ל-HTML מקומי, לבדיקה ויזואלית לפני העלאה לענן.
 * להרצה: node tools/test/render-sample.js && open /tmp/order-sample.html
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script-orders.gs'), 'utf8');
const stubs = `
  var SpreadsheetApp = {}, MailApp = {}, CacheService = {}, DriveApp = {},
      ContentService = {}, MimeType = {}, Logger = { log: function () {} };
  var Utilities = { formatDate: function () { return '19.08.2026 09:42'; } };
`;
const gs = new Function(stubs + src + '; return { buildOrderHtml_: buildOrderHtml_ };')();

const data = {
  orderId: 'AR-20260819-4821', date: '21.08.2026', totalItems: 10,
  totalPrice: '', subtotal: '', discount: '', shipping: '',
  customer: { business: 'מסעדת הגן הירוק בע״מ', contact: 'דנה לוי',
              phone: '054-1234567', address: 'המלאכה 8, אור יהודה',
              notes: 'נא לתאם טלפונית לפני ההגעה.' },
  items: [
    { id: 'ניק001', name: 'אקונומיקה 4 ליטר', category: 'ניקיון', qty: 6, unit: 'יחידה', image: 'x.webp' },
    { id: 'מוצ001', name: 'גליל נייר תעשייתי 5004', category: 'מוצרי נייר', qty: 10, unit: 'יחידה', image: 'x.webp' },
    { id: 'חדפ017', name: 'צלחות פלסטיק גדולות - 100 יח׳', category: 'חד פעמי ואריזות', qty: 12, unit: 'יחידה', image: 'x.webp' }
  ]
};
fs.writeFileSync('/tmp/order-sample.html', gs.buildOrderHtml_(data), 'utf8');
console.log('נכתב /tmp/order-sample.html');
```

הרץ ובדוק:

```bash
node tools/test/render-sample.js && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf=/tmp/order-sample.pdf file:///tmp/order-sample.html
```

**הערה:** התמונות ייטענו מ-`aroam.co.il` ולכן יופיעו רק אחרי שמשימה 2 נדחפה. אם עוד לא — צפה לתאי תמונה ריקים, וזו אינה תקלה. השווה את הפריסה מול `order-b2b.pdf` המאושר.

- [ ] **Step 7: בדוק הזמנה רב-עמודית**

זה התרחיש היחיד שהבדיקות ב-Node לא יכולות לתפוס — התנהגות שבירת עמודים היא של מנוע הרינדור.

```bash
node -e "
const fs=require('fs'),path=require('path');
const src=fs.readFileSync('tools/google-apps-script-orders.gs','utf8');
const stubs='var SpreadsheetApp={},MailApp={},CacheService={},DriveApp={},ContentService={},MimeType={},Logger={log:function(){}};var Utilities={formatDate:function(){return \'19.08.2026 09:42\';}};';
const gs=new Function(stubs+src+'; return {buildOrderHtml_:buildOrderHtml_};')();
const items=[];
for(let i=1;i<=40;i++) items.push({id:'ניק'+String(i).padStart(3,'0'),name:'מוצר בדיקה מספר '+i,category:'ניקיון',qty:i,unit:'יחידה',image:'x.webp'});
fs.writeFileSync('/tmp/order-40.html',gs.buildOrderHtml_({orderId:'AR-40-ROWS',date:'21.08.2026',totalItems:820,totalPrice:'',customer:{business:'בדיקה בע\u05f4מ',contact:'א',phone:'0500000000',address:'כתובת'},items}),'utf8');
console.log('נכתב /tmp/order-40.html');
"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf=/tmp/order-40.pdf file:///tmp/order-40.html
python3 -c "print('עמודים:', open('/tmp/order-40.pdf','rb').read().count(b'/Type /Page') - 1)"
```

צפוי: 3-4 עמודים. פתח את הקובץ וודא שלוש נקודות: שורת הכותרות הירוקה חוזרת בראש כל עמוד, אף שורת מוצר לא נחתכת בין עמודים, והפוטר מופיע פעם אחת בסוף.

- [ ] **Step 8: Commit**

```bash
git add tools/google-apps-script-orders.gs tools/test/
git commit -m "הזמנות: מחולל HTML לתעודת ההזמנה + בדיקות ב-Node"
```

---

### Task 5: יצירת ה-PDF, שמירה ל-Drive וצירוף למייל

**Files:**
- Modify: `tools/google-apps-script-orders.gs` (`SHEET_HEADERS`, `doPost`, הוספת `savePdf_`)

**Interfaces:**
- Consumes: `buildOrderHtml_(data)` ממשימה 4.
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

הוסף אחרי `buildOrderHtml_`:

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
    var html = buildOrderHtml_(data);
    var blob = Utilities.newBlob(html, MimeType.HTML, name).getAs(MimeType.PDF).setName(name);
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
node tools/test/order-pdf.test.js
```

צפוי: `כל 5 הבדיקות עברו` — הרתמה טוענת את הקובץ כולו, ולכן היא גם מאמתת שלא נשברה תחביר.

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
- Modify: `tools/test/order-pdf.test.js` (בדיקות נוספות)

**Interfaces:**
- Consumes: `data.items[]`, `data.totalPrice`, `data.customer`.
- Produces: `quoteLink_(data) -> String` — כתובת מלאה, או מחרוזת ריקה כשלהזמנה כבר יש מחירים.

- [ ] **Step 1: הוסף מבחני כישלון**

הוסף ל-`tools/test/order-pdf.test.js`, לפני שורת ההרצה:

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
    '; return { buildOrderHtml_: buildOrderHtml_, escapeHtml_: escapeHtml_,' +
    '   thumbUrl_: thumbUrl_, quoteLink_: quoteLink_ };'
```

- [ ] **Step 2: הרץ ותאמת כישלון**

```bash
node tools/test/order-pdf.test.js
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
node tools/test/order-pdf.test.js
```

צפוי: `כל 7 הבדיקות עברו`.

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
git add tools/google-apps-script-orders.gs tools/test/order-pdf.test.js
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
git status --short && node tools/test/order-pdf.test.js
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
