# מסך מנהלת הרכש — תוכנית ביצוע

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** הזמנת סניף ברשת החנויות תיעצר אצל מנהלת הרכש בגיליון נפרד, היא תראה במסך ייעודי את כל מה שממתין, תערוך כל הזמנה בעמוד החנויות עצמו, ורק שליחה שלה תיצור הזמנה אצל רועי.

**Architecture:** שני צינורות נפרדים. הזמנת סניף נשלחת ל-**webhook חדש** (סקריפט Apps Script חדש → גיליון "הזמנות ממתינות"); שליחה של מנהלת הרכש נשלחת ל-**webhook הקיים** ונוחתת בגיליון של רועי בדיוק כמו היום. הסקריפט הקיים `AKfycbz_rRjFdy2MqP…` אינו נוגע — לא בקוד ולא בפריסה. ב-`js/app.js` נוספים שלושה דגלים מגודרים בלבד; מנגנון טעינת הסל מקישור (`?cart=id:qty`) כבר קיים ומשמש כאן כמות שהוא.

**Tech Stack:** אתר סטטי בעברית RTL (HTML/CSS/JS בלי framework) + Google Apps Script כ-backend. בדיקות: `node` על קובץ ה-`.gs` דרך רתמה שטוענת אותו עם דמויות של שירותי גוגל (הדפוס של `tools/test/order-doc.test.js`), ואימות בדפדפן לשכבת ה-UI.

## Global Constraints

- מסמך העיצוב המאושר: `docs/superpowers/specs/2026-08-24-purchasing-manager-inbox-design.md`. כל דרישה שם מחייבת.
- **אסור לגעת בסקריפט ההזמנות הקיים** (`tools/google-apps-script-orders.gs`, פריסה `AKfycbz_rRjFdy2MqP…`) ובגיליון של רועי. כל מה שנבנה כאן הוא חדש.
- **אסור לשלוח הזמנת אמת** בשום שלב של האימות. לפני כל בדיקה שעלולה לשלוח — ליירט את `window.fetch`. יירוט **אינו שורד רענון דף**.
- **צבעי המותג בלבד** דרך הטוקנים של `css/style.css` (`--primary` ‎#639C7D, `--primary-dark` ‎#1A4231, `--primary-light` ‎#EAF3EE, `--primary-pastel` ‎#8FD6A3). ערך צבע קשיח שובר את `[data-theme="dark"]`. טקסט על רקע שמתחלף במצב כהה חייב override תואם.
- **בלי אימוג'ים** בממשק. אייקונים = SVG או צורות CSS.
- **בלי מחירים** בכל הזרימה הזאת — לא בעמוד החנויות ולא במסך של מנהלת הרכש.
- העמוד החדש הוא **סגור**: `noindex,nofollow`, `referrer: no-referrer`, לא ב-`sitemap.xml`, לא ב-`llms.txt`, **ובכוונה לא ב-`robots.txt`** (רישום שם חושף את הכתובת), ואפס קישורים אליו מהאתר.
- שינוי ב-`js/app.js` או ב-`css/style.css` מחייב העלאת פרמטר הגרסה בכל הדפים ואת `CACHE_NAME` ב-`sw.js` (משימה 5). המצב הנוכחי: `app.js?v=51`, `style.css?v=37`, `aroam-cache-v45`.
- **אחרי כל שינוי ב-`server.py` צריך להפעיל מחדש את השרת המקומי.** עמוד שנראה עדכני אינו ראיה לכך שהשרת עדכני. לוודא `curl -s http://localhost:8080/api/ping` ⇒ `{"ok": true, ...}`.
- **בבדיקה מקומית: לנקות service worker ו-caches** לפני שמסיקים שקוד לא עובד.
- **הפריסה בענן דורשת את רועי** ואינה חלק מאף משימה כאן: פתיחת גיליון חדש, אישור פריסת הסקריפט החדש, ומסירת כתובת ה-webhook. עד שזה קורה — האימות נעשה מול fixture מקומי, כפי שכל משימה מפרטת.

---

### Task 1: הסקריפט החדש בענן — קוד ובדיקות מקומיות

**Files:**
- Create: `tools/google-apps-script-chain-pending.gs`
- Create: `tools/test/chain-pending.test.js`

**Interfaces:**
- Consumes: אין. הקובץ עצמאי.
- Produces: `doPost(e)` (כתיבת הזמנה ממתינה), `doGet(e)` (קריאה ועדכון סטטוס, מוגן בסיסמה), והפונקציות הטהורות `pendingRow_(data)`, `rowToOrder_(row)`, `sanitize_(v)` — משימה 4 מסתמכת על **צורת ה-JSON** ש-`doGet` מחזירה.

**החוזה של הסקריפט** (משימה 4 בונה מולו):

```
POST  body: {orderId, date, branch, mall, store, orderer, notes, items:[{id,name,qty,unit,category}]}
      => {"ok": true}

GET   ?action=list&password=<pw>[&status=pending|sent|all]
      => {"ok": true, "orders": [{orderId, receivedAt, branch, orderer, notes, itemCount, status, items:[{id,name,qty,unit}]}]}

GET   ?action=mark&password=<pw>&id=<orderId>&status=sent&approvedId=<RA-...>
      => {"ok": true}

כל שגיאה => {"ok": false, "error": "<טקסט>"}
```

- [ ] **Step 1: לכתוב את הבדיקה הנכשלת**

צור `tools/test/chain-pending.test.js`:

```js
/**
 * בדיקות לסקריפט ההזמנות הממתינות של רשת החנויות.
 * הקובץ .gs נטען כטקסט ומורץ עם דמויות של שירותי גוגל, כדי שהבדיקה תרוץ
 * על אותו קוד שרץ בענן. נבדקות הפונקציות הטהורות בלבד.
 * להרצה: node tools/test/chain-pending.test.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadGs() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'google-apps-script-chain-pending.gs'), 'utf8');
  const stubs = `
    var SpreadsheetApp = {}, CacheService = {}, ContentService = {},
        Utilities = {}, Logger = { log: function () {} };
  `;
  return new Function(
    stubs + src +
    '; return { pendingRow_: pendingRow_, rowToOrder_: rowToOrder_,' +
    '   sanitize_: sanitize_, PENDING_HEADERS: PENDING_HEADERS };'
  )();
}

const gs = loadGs();

const ORDER = {
  orderId: 'RS-20260824-1234',
  date: '24.08.2026',
  branch: 'קניון איילון — סניף 12',
  orderer: 'דנה כהן',
  notes: 'לפרוק בכניסה האחורית',
  items: [
    { id: 'ניק001', name: 'אקונומיקה 4 ליטר', qty: 6, unit: 'יחידה', category: 'ניקיון' },
    { id: 'מוצ001', name: 'גליל נייר תעשייתי', qty: 12, unit: 'יחידה', category: 'מוצרי נייר' }
  ]
};

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('pendingRow_');

test('אורך השורה תואם לכותרות', () => {
  assert.strictEqual(gs.pendingRow_(ORDER).length, gs.PENDING_HEADERS.length);
});

test('הסניף והמזמין נכתבים בעמודות שלהם', () => {
  const row = gs.pendingRow_(ORDER);
  assert.strictEqual(row[gs.PENDING_HEADERS.indexOf('סניף')], 'קניון איילון — סניף 12');
  assert.strictEqual(row[gs.PENDING_HEADERS.indexOf('מזמין')], 'דנה כהן');
});

test('הפריטים נשמרים כ-JSON שאפשר לפרסר בחזרה', () => {
  const row = gs.pendingRow_(ORDER);
  const raw = row[gs.PENDING_HEADERS.indexOf('פריטים')];
  const items = JSON.parse(raw);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].id, 'ניק001');
  assert.strictEqual(items[0].qty, 6);
});

test('סטטוס התחלתי הוא ממתין', () => {
  const row = gs.pendingRow_(ORDER);
  assert.strictEqual(row[gs.PENDING_HEADERS.indexOf('סטטוס')], 'ממתין');
});

test('מספר הפריטים הוא סכום הכמויות ולא מספר השורות', () => {
  const row = gs.pendingRow_(ORDER);
  assert.strictEqual(row[gs.PENDING_HEADERS.indexOf('מספר פריטים')], 18);
});

test('הזמנה בלי פריטים לא מפילה', () => {
  const row = gs.pendingRow_({ orderId: 'RS-1', branch: 'א' });
  assert.strictEqual(row[gs.PENDING_HEADERS.indexOf('פריטים')], '[]');
  assert.strictEqual(row[gs.PENDING_HEADERS.indexOf('מספר פריטים')], 0);
});

console.log('sanitize_');

test('מנטרל formula injection', () => {
  assert.strictEqual(gs.sanitize_('=SUM(A1:A9)'), "'=SUM(A1:A9)");
  assert.strictEqual(gs.sanitize_('+1'), "'+1");
  assert.strictEqual(gs.sanitize_('-1'), "'-1");
  assert.strictEqual(gs.sanitize_('@x'), "'@x");
});

test('טקסט רגיל עובר כמו שהוא', () => {
  assert.strictEqual(gs.sanitize_('קניון איילון'), 'קניון איילון');
});

test('ערך ריק הופך למחרוזת ריקה ולא ל-undefined', () => {
  assert.strictEqual(gs.sanitize_(undefined), '');
  assert.strictEqual(gs.sanitize_(null), '');
});

console.log('rowToOrder_');

test('שורה חוזרת לאובייקט עם אותם ערכים', () => {
  const order = gs.rowToOrder_(gs.pendingRow_(ORDER));
  assert.strictEqual(order.orderId, 'RS-20260824-1234');
  assert.strictEqual(order.branch, 'קניון איילון — סניף 12');
  assert.strictEqual(order.orderer, 'דנה כהן');
  assert.strictEqual(order.status, 'ממתין');
  assert.strictEqual(order.itemCount, 18);
  assert.strictEqual(order.items.length, 2);
  assert.strictEqual(order.items[1].name, 'גליל נייר תעשייתי');
});

test('שורה עם JSON פגום מחזירה רשימת פריטים ריקה ולא זורקת', () => {
  const row = gs.pendingRow_(ORDER);
  row[gs.PENDING_HEADERS.indexOf('פריטים')] = '{לא JSON';
  const order = gs.rowToOrder_(row);
  assert.deepStrictEqual(order.items, []);
});

console.log('\n' + passed + ' בדיקות עברו');
```

- [ ] **Step 2: להריץ ולוודא שהבדיקה נכשלת**

```bash
node tools/test/chain-pending.test.js
```

Expected: כישלון מיידי — `ENOENT ... google-apps-script-chain-pending.gs`. זה בדיוק הכישלון הצפוי: הקובץ עוד לא קיים.

- [ ] **Step 3: לכתוב את הסקריפט**

צור `tools/google-apps-script-chain-pending.gs`:

```js
/**
 * הזמנות ממתינות — רשת החנויות.
 *
 * סניף שולח הזמנה מ-/shops-4b7e2c/ ⇒ doPost כותב שורה בגיליון הזה בסטטוס
 * "ממתין". מנהלת הרכש קוראת את הרשימה במסך שלה דרך doGet, עורכת כל הזמנה
 * בעמוד החנויות, ושליחה שלה הולכת ל-webhook ההזמנות הרגיל של אהרוני —
 * לא לכאן. הסקריפט הזה לא כותב לגיליון ההזמנות ולא שולח מיילים.
 *
 * הגדרה: להחליף את SPREADSHEET_ID במזהה הגיליון החדש, ואת API_PASSWORD
 * בסיסמה שתימסר למנהלת הרכש. פריסה: Deploy → Web app → Execute as: Me,
 * Who has access: Anyone.
 */

var SPREADSHEET_ID = 'PUT_THE_NEW_SPREADSHEET_ID_HERE';
var API_PASSWORD = 'PUT_A_PASSWORD_HERE';
var SHEET_NAME = 'ממתינות';

var PENDING_HEADERS = ['תאריך קבלה', 'מספר הזמנה', 'סניף', 'מזמין', 'הערות',
  'מספר פריטים', 'פריטים', 'סטטוס', 'מספר הזמנה מאושרת', 'תאריך אישור'];

/** תו מוביל מסוכן בגיליון = נוסחה. מקדימים גרש כדי שייכתב כטקסט. */
function sanitize_(v) {
  var s = (v === undefined || v === null) ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function pendingRow_(data) {
  var items = [];
  if (data && data.items && data.items.length) {
    for (var i = 0; i < data.items.length; i++) {
      var it = data.items[i] || {};
      items.push({
        id: String(it.id || ''),
        name: String(it.name || ''),
        qty: Number(it.qty) || 0,
        unit: String(it.unit || ''),
        category: String(it.category || '')
      });
    }
  }
  var count = 0;
  for (var j = 0; j < items.length; j++) count += items[j].qty;

  var row = [];
  row[PENDING_HEADERS.indexOf('תאריך קבלה')] = new Date();
  row[PENDING_HEADERS.indexOf('מספר הזמנה')] = sanitize_(data && data.orderId);
  row[PENDING_HEADERS.indexOf('סניף')] = sanitize_(data && data.branch);
  row[PENDING_HEADERS.indexOf('מזמין')] = sanitize_(data && data.orderer);
  row[PENDING_HEADERS.indexOf('הערות')] = sanitize_(data && data.notes);
  row[PENDING_HEADERS.indexOf('מספר פריטים')] = count;
  // הפריטים נשמרים כ-JSON בתא אחד: המסך של מנהלת הרכש צריך אותם כמבנה,
  // ופיצול לשורות היה מפרק הזמנה אחת להרבה שורות בגיליון.
  row[PENDING_HEADERS.indexOf('פריטים')] = JSON.stringify(items);
  row[PENDING_HEADERS.indexOf('סטטוס')] = 'ממתין';
  row[PENDING_HEADERS.indexOf('מספר הזמנה מאושרת')] = '';
  row[PENDING_HEADERS.indexOf('תאריך אישור')] = '';
  return row;
}

function rowToOrder_(row) {
  var items = [];
  try {
    var raw = row[PENDING_HEADERS.indexOf('פריטים')];
    var parsed = JSON.parse(raw);
    if (parsed && parsed.length) items = parsed;
  } catch (e) {
    items = []; // תא שנערך ידנית בגיליון לא מפיל את כל הרשימה
  }
  return {
    receivedAt: String(row[PENDING_HEADERS.indexOf('תאריך קבלה')] || ''),
    orderId: String(row[PENDING_HEADERS.indexOf('מספר הזמנה')] || ''),
    branch: String(row[PENDING_HEADERS.indexOf('סניף')] || ''),
    orderer: String(row[PENDING_HEADERS.indexOf('מזמין')] || ''),
    notes: String(row[PENDING_HEADERS.indexOf('הערות')] || ''),
    itemCount: Number(row[PENDING_HEADERS.indexOf('מספר פריטים')]) || 0,
    status: String(row[PENDING_HEADERS.indexOf('סטטוס')] || ''),
    approvedId: String(row[PENDING_HEADERS.indexOf('מספר הזמנה מאושרת')] || ''),
    items: items
  };
}

function sheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(PENDING_HEADERS);
    sheet.getRange(1, 1, 1, PENDING_HEADERS.length)
      .setFontWeight('bold').setBackground('#d9ead3');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    sheet_().appendRow(pendingRow_(data));
    return json_({ ok: true });
  } catch (err) {
    Logger.log(err);
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.password !== API_PASSWORD) return json_({ ok: false, error: 'unauthorized' });

    var sheet = sheet_();
    var last = sheet.getLastRow();
    if (last < 2) return json_({ ok: true, orders: [] });
    var rows = sheet.getRange(2, 1, last - 1, PENDING_HEADERS.length).getValues();

    if (p.action === 'mark') {
      var statusCol = PENDING_HEADERS.indexOf('סטטוס') + 1;
      var idCol = PENDING_HEADERS.indexOf('מספר הזמנה');
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][idCol]) === String(p.id)) {
          sheet.getRange(i + 2, statusCol).setValue(p.status === 'sent' ? 'נשלחה' : 'ממתין');
          sheet.getRange(i + 2, PENDING_HEADERS.indexOf('מספר הזמנה מאושרת') + 1)
            .setValue(sanitize_(p.approvedId || ''));
          sheet.getRange(i + 2, PENDING_HEADERS.indexOf('תאריך אישור') + 1)
            .setValue(new Date());
          return json_({ ok: true });
        }
      }
      return json_({ ok: false, error: 'not found' });
    }

    var wanted = p.status || 'pending';
    var orders = [];
    for (var k = 0; k < rows.length; k++) {
      var order = rowToOrder_(rows[k]);
      if (!order.orderId) continue;
      if (wanted === 'pending' && order.status !== 'ממתין') continue;
      if (wanted === 'sent' && order.status !== 'נשלחה') continue;
      orders.push(order);
    }
    return json_({ ok: true, orders: orders });
  } catch (err) {
    Logger.log(err);
    return json_({ ok: false, error: String(err) });
  }
}
```

- [ ] **Step 4: להריץ את הבדיקות ולוודא שהן עוברות**

```bash
node tools/test/chain-pending.test.js
```

Expected: `12 בדיקות עברו`, ו-`echo $?` מחזיר `0`.

- [ ] **Step 5: לוודא שהבדיקות הקיימות לא נשברו**

```bash
node tools/test/order-doc.test.js
```

Expected: כל הבדיקות עוברות (17 נכון לכתיבת התוכנית). הקובץ הזה לא נגע — זו בדיקת שפיות שלא נגעת בסקריפט ההזמנות.

- [ ] **Step 6: Commit**

```bash
git add tools/google-apps-script-chain-pending.gs tools/test/chain-pending.test.js
git commit -m "סקריפט הזמנות ממתינות לרשת החנויות + בדיקות

doPost כותב הזמנת סניף לגיליון נפרד בסטטוס \"ממתין\"; doGet מוגן בסיסמה
מחזיר את הרשימה למסך מנהלת הרכש ומסמן הזמנה כ\"נשלחה\".
הסקריפט של ההזמנות הרגילות לא נגע.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: שלושת הדגלים ב-app.js

**Files:**
- Modify: `js/app.js` — `DEFAULT_CONFIG` (~שורה 36), `postOrderPayload` (~שורה 2367), `buildOrderPayload` (~שורה 2343), `generateOrderId`, וקריאת פרמטרי הכתובת ב-`init` (~שורה 255)

**Interfaces:**
- Consumes: `CONFIG`, `urlParams`, `postOrderPayload`, `buildOrderPayload`, `commitOrder` — קיימים.
- Produces: `CONFIG.webhookUrl`, `CONFIG.directSend`, ומצב "אישור רכש" שמופעל מהפרמטר `pending` בכתובת. משימה 3 משתמשת בשניים הראשונים; משימה 4 מייצרת את הקישור עם `pending`.

- [ ] **Step 1: להוסיף את הדגלים לברירות המחדל**

ב-`js/app.js`, בתוך `DEFAULT_CONFIG`, לפני `agentMode: false`:

```js
    // יעד ה-webhook. null = הסקריפט הרגיל של ההזמנות (GOOGLE_SCRIPT_WEBHOOK_URL).
    // עמוד רשת החנויות מפנה את הזמנות הסניפים לסקריפט "הזמנות ממתינות",
    // כדי שהן ייעצרו אצל מנהלת הרכש ולא יגיעו ישירות לרועי.
    webhookUrl: null,
    // כפתור שליחה יחיד במקום וואטסאפ/מייל. עד כה ההתנהגות הזאת הייתה קשורה
    // ל-agentMode, שגורר איתו גם את בורר הלקוח ואת ה-class agent-mode.
    directSend: false,
```

- [ ] **Step 2: להפנות את השליחה ליעד הנכון**

ב-`js/app.js`, ב-`postOrderPayload`, להחליף את שתי ההתייחסויות לקבוע ביעד מהקונפיג:

```js
    async function postOrderPayload(payload) {
        // אחרי אישור של מנהלת הרכש ההזמנה חוזרת ל-webhook הרגיל, גם בעמוד
        // שמוגדר לשלוח לגיליון הממתינות — לכן PENDING_APPROVAL גובר.
        const target = PENDING_APPROVAL
            ? GOOGLE_SCRIPT_WEBHOOK_URL
            : (CONFIG.webhookUrl || GOOGLE_SCRIPT_WEBHOOK_URL);
        if (!target) {
            console.log("Google Script Webhook URL is not set. Skipping backup email.");
            return false;
        }
        try {
            await fetch(target, {
```

- [ ] **Step 3: להוסיף את מצב אישור הרכש**

ב-`js/app.js`, ליד שאר משתני המודול (מעל `function init`), להוסיף:

```js
    // מצב "אישור רכש": מנהלת הרכש פתחה הזמנת סניף ממתינה לעריכה. הערך הוא
    // מספר ההזמנה המקורי (RS-...), והוא מה שמסמן לסקריפט הממתינות שההזמנה טופלה.
    let PENDING_APPROVAL = null;
```

ובתוך `init`, ליד קריאת שאר הפרמטרים (`const cartParam = urlParams.get('cart');`):

```js
        PENDING_APPROVAL = urlParams.get('pending');
```

- [ ] **Step 4: קידומת RA ותיעוד הסניף המקורי**

ב-`js/app.js`, ב-`generateOrderId`, להשתמש בקידומת `RA` כשמדובר באישור רכש. אתר את הפונקציה והחלף את מקור הקידומת:

```js
        // הזמנה שעברה את מנהלת הרכש מקבלת קידומת משלה, כדי שבגיליון של רועי
        // יהיה ברור מיד שהיא אושרה ולא הגיעה ישירות מסניף.
        const prefix = PENDING_APPROVAL ? 'RA' : (CONFIG.orderPrefix || 'AR');
```

ב-`buildOrderPayload`, להוסיף לאובייקט המוחזר, מיד אחרי `showPrices`:

```js
            // אישור רכש: מספר ההזמנה המקורי של הסניף, כדי שאפשר יהיה לקשר
            // בין השורה בגיליון הממתינות לבין ההזמנה שנוצרה אצל רועי.
            pendingId: PENDING_APPROVAL || '',
```

- [ ] **Step 5: לאמת בדפדפן שהיעד מתחלף**

לוודא `curl -s http://localhost:8080/api/ping` ⇒ `{"ok": true, ...}`. לפתוח `http://localhost:8080/catalog/`, ולהריץ בקונסול **בלי לרענן אחר כך**:

```js
(() => {
  window.__t = [];
  const of = window.fetch;
  window.fetch = function (u, o) { window.__t.push(String(u).slice(0, 60)); return Promise.resolve(new Response('{}', { status: 200 })); };
  return 'intercepted';
})()
```

ואז להוסיף מוצר, לפתוח את הסל, למלא שם עסק וטלפון, לשלוח, ולהריץ:

```js
JSON.stringify(window.__t.filter(u => u.includes('script.google.com')))
```

Expected: כתובת אחת בלבד, והיא מתחילה ב-`https://script.google.com/macros/s/AKfycbz_rRjFdy2MqP` — כלומר הקטלוג העסקי, שאין לו `webhookUrl`, ממשיך לשלוח ליעד הרגיל. **לא נשלחה הזמנת אמת** כי ה-fetch מיורט.

- [ ] **Step 6: לאמת שקידומת RA לא דולפת**

באותו דף, בלי `pending` בכתובת:

```js
JSON.stringify({ pending: new URLSearchParams(location.search).get('pending') })
```

Expected: `{"pending":null}`. ההזמנה שנשלחה בשלב הקודם קיבלה קידומת `AR` — לאמת מול הודעת האישור שהוצגה על המסך.

- [ ] **Step 7: רגרסיה — דף הסוכן לא נשבר**

לפתוח `http://localhost:8080/agent/` (PIN ‏`0526000158`) ולהריץ:

```js
JSON.stringify({ classes: document.body.className, submit: !!document.getElementById('submit-order-btn'), wa: getComputedStyle(document.getElementById('send-whatsapp')).display })
```

Expected: ‏`classes` מכיל `agent-mode` ו-`editable-prices`; `submit: true`; `wa: "none"` — כלומר הפרדת `directSend` מ-`agentMode` לא שינתה את דף הסוכן.

- [ ] **Step 8: לנקות ולעשות Commit**

```js
['aroam_cart_catalog','aroam_recent_orders_catalog','aroam_customer_details'].forEach(k => localStorage.removeItem(k));
```

```bash
git add js/app.js
git commit -m "app.js: יעד webhook מהקונפיג, כפתור שליחה יחיד ומצב אישור רכש

- CONFIG.webhookUrl (null = היעד הרגיל) מאפשר לעמוד רשת החנויות לשלוח
  את הזמנות הסניפים לגיליון הממתינות במקום לגיליון של רועי.
- CONFIG.directSend מפריד בין \"כפתור שליחה יחיד\" לבין agentMode, שגרר
  איתו עד כה גם את בורר הלקוח ואת ה-class agent-mode.
- ?pending=<מספר הזמנה> מסמן אישור של מנהלת הרכש: הקידומת הופכת ל-RA,
  היעד חוזר ל-webhook הרגיל, והמזהה המקורי נשלח בפיילוד.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: עמוד החנויות — כפתור שליחה יחיד ויעד הממתינות

**Files:**
- Modify: `shops-4b7e2c/index.html` — `window.CATALOG_CONFIG`, ואזור כפתורי השליחה בחלון ההזמנה

**Interfaces:**
- Consumes: `CONFIG.webhookUrl`, `CONFIG.directSend` ממשימה 2; המזהה `#submit-order-btn` שכבר מחווט ב-`js/app.js`.
- Produces: אין.

- [ ] **Step 1: להוסיף את הדגלים לקונפיג של העמוד**

ב-`shops-4b7e2c/index.html`, בתוך `window.CATALOG_CONFIG`, להחליף את `allowShare: true` ב:

```js
            // הזמנת סניף נעצרת אצל מנהלת הרכש: כפתור שליחה יחיד, בלי
            // וואטסאפ ובלי מייל, והיעד הוא גיליון ההזמנות הממתינות.
            allowShare: false,
            directSend: true,
            webhookUrl: 'PUT_THE_PENDING_WEBHOOK_URL_HERE',
```

**זו כתובת מציין-מקום עד שרועי פורס את הסקריפט.** לרשום את זה בדוח.

- [ ] **Step 2: להוסיף את כפתור השליחה היחיד**

ב-`shops-4b7e2c/index.html`, באזור כפתורי הפעולה בחלון ההזמנה (ליד `clear-cart-btn`), להוסיף לפני כפתור הוואטסאפ:

```html
                    <button id="submit-order-btn" class="btn btn-primary" style="min-width: 160px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px; margin-left:5px;" aria-hidden="true"><path d="M22 2 11 13"></path><path d="M22 2 15 22l-4-9-9-4z"></path></svg>שלח הזמנה
                    </button>
```

כפתורי הוואטסאפ והמייל נשארים ב-HTML — `allowShare: false` מסתיר אותם, וזה המנגנון הקיים.

- [ ] **Step 3: לאמת שהעמוד שולח ליעד הממתינות**

לפתוח `http://localhost:8080/shops-4b7e2c/` (קוד ‏`3160`), לבחור סניף, **ליירט את ה-fetch** (אותו קטע מהמשימה הקודמת), להוסיף מוצר, לפתוח את הסל, למלא שם מזמין, ללחוץ "שלח הזמנה", ואז:

```js
JSON.stringify({
  targets: window.__t.filter(u => u.includes('script.google.com')),
  wa: getComputedStyle(document.getElementById('send-whatsapp')).display,
  email: getComputedStyle(document.getElementById('send-email')).display,
  submit: !!document.getElementById('submit-order-btn')
})
```

Expected: ‏`targets` מכיל את כתובת הממתינות (או את מציין המקום, אם רועי טרם פרס) ו**לא** את `AKfycbz_rRjFdy2MqP`; ‏`wa` ו-`email` שניהם `"none"`; ‏`submit: true`.

- [ ] **Step 4: לאמת שאין דליפה לשאר הקטלוגים**

```bash
grep -rn "webhookUrl\|directSend" --include="*.html" . | grep -v node_modules
```

Expected: שורות רק מ-`shops-4b7e2c/index.html`.

- [ ] **Step 5: לנקות ולעשות Commit**

```js
['aroam_cart_shops-4b7e2c','aroam_recent_orders_shops-4b7e2c'].forEach(k => localStorage.removeItem(k));
```

```bash
git add shops-4b7e2c/index.html
git commit -m "עמוד רשת החנויות: כפתור שליחה יחיד ויעד ההזמנות הממתינות

ההזמנה נעצרת אצל מנהלת הרכש ולא מגיעה ישירות לרועי. וואטסאפ ומייל
מוסתרים דרך allowShare: false הקיים.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: מסך מנהלת הרכש

**Files:**
- Create: `rakash-5e91c7/index.html`
- Create: `data/pending-fixture.json` (fixture מקומי לאימות, נמחק בסוף המשימה)

**Interfaces:**
- Consumes: חוזה ה-JSON של `doGet` ממשימה 1; הפרמטרים `?k=`, `?cart=id:qty`, `?pending=` שנתמכים בעמוד החנויות וב-`js/app.js`.
- Produces: אין.

**הערה על הכתובת והקוד:** `rakash-5e91c7` וקוד הכניסה `8264` הם הצעה — רועי מחליף אותם אם ירצה. הקוד יושב בקבוע `ACCESS_CODE` בראש הסקריפט בעמוד, כמו בשאר העמודים הסגורים.

- [ ] **Step 1: לבנות את שלד העמוד**

צור `rakash-5e91c7/index.html` על בסיס המבנה של `shops-4b7e2c/index.html` — אותה כותרת עצמאית (לוגו בלבד, בלי פרטי קשר), אותו שער קוד כולל תמיכה ב-`?k=` שנמחק מהכתובת ב-`replaceState`, ואותו פוטר מינימלי. `<head>` חייב לכלול:

```html
    <meta name="robots" content="noindex, nofollow">
    <meta name="referrer" content="no-referrer">
    <title>אישור הזמנות סניפים | אהרוני שיווק והפצה</title>
```

העמוד **אינו טוען את `js/app.js`** — הוא רשימה, לא קטלוג. הוא טוען את `css/site.css` ואת `css/style.css` בשביל הטוקנים וכללי האקורדיון (`.recent-orders`, `.ro-row`, `.ro-head`, `.ro-body`, `.ro-line`, `.ro-thumb`, `.ro-name`, `.ro-qty`, `.ro-actions`) שנבנו בסבב הקודם — שימוש חוזר, בלי CSS חדש.

- [ ] **Step 2: להוסיף את שכבת הנתונים**

בסקריפט של העמוד:

```js
        // כתובת הסקריפט "הזמנות ממתינות". עד שרועי פורס — מציין מקום.
        const API_URL = 'PUT_THE_PENDING_WEBHOOK_URL_HERE';
        const SHOPS_URL = '/shops-4b7e2c/';
        const SHOPS_CODE = '3160';

        // הסיסמה נשאלת פעם אחת ונשמרת ל-session בלבד — אותו דפוס כמו
        // היסטוריית ההצעות בדף הסוכן. לא נשמרת ב-localStorage.
        function apiPassword() {
            let pw = sessionStorage.getItem('aroam_rakash_key') || '';
            if (!pw) {
                pw = prompt('קוד גישה לרשימת ההזמנות:') || '';
                if (pw) sessionStorage.setItem('aroam_rakash_key', pw);
            }
            return pw;
        }

        async function fetchOrders(status) {
            const res = await fetch(`${API_URL}?action=list&status=${encodeURIComponent(status)}&password=${encodeURIComponent(apiPassword())}`);
            const data = await res.json();
            if (!data.ok) {
                // סיסמה שגויה — מוחקים כדי שהניסיון הבא ישאל מחדש
                if (data.error === 'unauthorized') sessionStorage.removeItem('aroam_rakash_key');
                throw new Error(data.error || 'שגיאה בטעינת ההזמנות');
            }
            return data.orders || [];
        }

        function editUrl(order) {
            const cart = order.items
                .filter(i => i.id && Number(i.qty) > 0)
                .map(i => `${encodeURIComponent(i.id)}:${i.qty}`)
                .join(',');
            return `${SHOPS_URL}?k=${encodeURIComponent(SHOPS_CODE)}`
                + `&cart=${cart}`
                + `&pending=${encodeURIComponent(order.orderId)}`
                + `&branch=${encodeURIComponent(order.branch)}`;
        }
```

- [ ] **Step 3: לרנדר את הרשימה**

```js
        function renderOrders(orders) {
            const wrap = document.getElementById('orders');
            wrap.innerHTML = '';
            if (!orders.length) {
                wrap.innerHTML = '<p class="empty">אין הזמנות בקטגוריה הזאת.</p>';
                return;
            }
            const list = document.createElement('div');
            list.className = 'recent-orders';

            orders.forEach((order, index) => {
                const row = document.createElement('div');
                row.className = 'ro-row';

                const head = document.createElement('button');
                head.type = 'button';
                head.className = 'ro-head';
                head.setAttribute('aria-expanded', 'false');
                head.innerHTML = '<span class="ro-caret" aria-hidden="true"></span>'
                    + '<span class="ro-date"></span><span class="ro-count"></span>';
                head.querySelector('.ro-date').textContent = order.branch || '(בלי סניף)';
                head.querySelector('.ro-count').textContent =
                    `${order.itemCount} פריטים · ${order.status}`;

                const body = document.createElement('div');
                body.className = 'ro-body';
                body.hidden = true;

                head.addEventListener('click', () => {
                    body.hidden = !body.hidden;
                    head.setAttribute('aria-expanded', String(!body.hidden));
                });

                if (order.orderer || order.notes) {
                    const meta = document.createElement('p');
                    meta.className = 'order-meta';
                    meta.textContent = [order.orderer && ('מזמין: ' + order.orderer),
                                        order.notes && ('הערות: ' + order.notes)]
                        .filter(Boolean).join(' · ');
                    body.appendChild(meta);
                }

                order.items.forEach(item => {
                    const line = document.createElement('div');
                    line.className = 'ro-line';
                    const name = document.createElement('span');
                    name.className = 'ro-name';
                    name.textContent = item.name || item.id;
                    const qty = document.createElement('span');
                    qty.className = 'ro-qty';
                    qty.textContent = '× ' + item.qty;
                    line.appendChild(name);
                    line.appendChild(qty);
                    body.appendChild(line);
                });

                const actions = document.createElement('div');
                actions.className = 'ro-actions';
                const edit = document.createElement('a');
                edit.className = 'btn btn-primary';
                edit.href = editUrl(order);
                edit.textContent = order.status === 'נשלחה' ? 'פתח שוב' : 'ערוך ושלח';
                actions.appendChild(edit);
                body.appendChild(actions);

                row.appendChild(head);
                row.appendChild(body);
                list.appendChild(row);
            });
            wrap.appendChild(list);
        }
```

בנוסף: שלושה כפתורי מסנן (ממתינות / נשלחו / הכל) ששולחים `status` של `pending` / `sent` / `all`, ברירת המחדל **ממתינות**; מונה "N ממתינות" בכותרת; והודעת שגיאה גלויה כשהטעינה נכשלת (במקום מסך ריק).

- [ ] **Step 4: לאמת מול fixture מקומי**

צור `data/pending-fixture.json`:

```json
{"ok":true,"orders":[
 {"orderId":"RS-20260824-1234","receivedAt":"2026-08-24","branch":"קניון איילון — סניף 12","orderer":"דנה כהן","notes":"לפרוק בכניסה האחורית","itemCount":18,"status":"ממתין","items":[{"id":"ניק001","name":"אקונומיקה 4 ליטר","qty":6,"unit":"יחידה"},{"id":"מוצ001","name":"גליל נייר תעשייתי","qty":12,"unit":"יחידה"}]},
 {"orderId":"RS-20260824-5678","receivedAt":"2026-08-24","branch":"פולו דיזנגוף","orderer":"יוסי","notes":"","itemCount":3,"status":"נשלחה","items":[{"id":"ניק002","name":"מגב + מקל","qty":3,"unit":"יחידה"}]}
]}
```

פתח את העמוד עם קוד הכניסה, והחלף זמנית את `API_URL` בקונסול לנתיב ה-fixture:

```js
(() => { const of = window.fetch; window.fetch = (u, o) => of('/data/pending-fixture.json'); return 'stubbed'; })()
```

ואז לרענן את הרשימה ולהריץ:

```js
JSON.stringify({
  rows: document.querySelectorAll('.ro-row').length,
  heads: [...document.querySelectorAll('.ro-head')].map(h => h.textContent.trim()),
  editHref: document.querySelector('.ro-actions a')?.getAttribute('href')
})
```

Expected: ‏`rows: 2`; הכותרת הראשונה מכילה `קניון איילון — סניף 12` ו-`18 פריטים · ממתין`; ‏`editHref` מתחיל ב-`/shops-4b7e2c/?k=3160&cart=` ומכיל `%D7%A0%D7%99%D7%A7001:6` (המזהה מקודד) ו-`&pending=RS-20260824-1234`.

- [ ] **Step 5: לאמת שהקישור באמת פותח את ההזמנה**

להעתיק את `editHref` ולנווט אליו. ואז:

```js
JSON.stringify({
  gate: getComputedStyle(document.getElementById('shops-gate')).display,
  branch: document.querySelector('.branch-label')?.textContent,
  rows: document.querySelectorAll('#order-table-body tr').length,
  pending: new URLSearchParams(location.search).get('pending')
})
```

Expected: השער סגור (`"none"`), הסניף הוא `קניון איילון — סניף 12`, הסל מכיל 2 שורות, ו-`pending` הוא `RS-20260824-1234`. אם הסניף לא נצבע — לבדוק את ההתנהגות של `?branch=` בעמוד ולתקן שם, ולדווח.

- [ ] **Step 6: לאמת שהשליחה מהמצב הזה הולכת ליעד הנכון**

**ליירט את ה-fetch תחילה**, ואז לשלוח, ואז:

```js
JSON.stringify({ targets: window.__t.filter(u => u.includes('script.google.com')) })
```

Expected: היעד הוא `AKfycbz_rRjFdy2MqP…` — ה-webhook הרגיל של רועי, **לא** הממתינות. זו הנקודה שכל הפיצ'ר תלוי בה.

- [ ] **Step 7: מובייל ובידוד**

```js
JSON.stringify({ overflow: document.documentElement.scrollWidth - window.innerWidth })
```

ברוחב 375px — Expected: `0`.

```bash
grep -rn "rakash-5e91c7" sitemap.xml llms.txt robots.txt 2>/dev/null; grep -rln "rakash-5e91c7" --include="*.html" . | grep -v "rakash-5e91c7/"
```

Expected: **אפס שורות** משתיהן — העמוד לא מופיע בשום מקום ואף דף לא מקשר אליו.

- [ ] **Step 8: למחוק את ה-fixture ולעשות Commit**

```bash
rm data/pending-fixture.json
git add rakash-5e91c7/index.html
git commit -m "מסך מנהלת הרכש: רשימת הזמנות ממתינות ועריכה בעמוד החנויות

שער קוד, רשימה נפתחת לפי סניף עם מסנן ממתינות/נשלחו, וקישור עריכה
שפותח את עמוד החנויות עם הסל טעון ועם pending=<מספר ההזמנה המקורי>.
העמוד לא טוען app.js ולא מציג מחירים.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: סימון "נשלחה", גרסאות, רגרסיה ותיעוד

**Files:**
- Modify: `shops-4b7e2c/index.html` — סימון ההזמנה הממתינה אחרי שליחה
- Modify: כל הדפים שמפנים ל-`app.js?v=51`
- Modify: `sw.js`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `action=mark` מהחוזה של משימה 1; האירוע `aroam:order-sent` שמופץ מ-`commitOrder` ב-`js/app.js`.
- Produces: אין.

- [ ] **Step 1: לסמן את ההזמנה כ"נשלחה" אחרי אישור**

ב-`shops-4b7e2c/index.html`, בסקריפט של העמוד:

```js
        // אחרי שמנהלת הרכש שלחה — מסמנים את השורה בגיליון הממתינות. נכשל
        // בשקט בכוונה: ההזמנה כבר יצאה לרועי, וכישלון סימון הוא אי-נוחות
        // ברשימה שלה ולא אובדן הזמנה.
        document.addEventListener('aroam:order-sent', ev => {
            const pending = new URLSearchParams(location.search).get('pending');
            if (!pending) return;
            const pw = sessionStorage.getItem('aroam_rakash_key') || '';
            if (!pw) return;
            fetch(`${PENDING_API}?action=mark&status=sent`
                + `&id=${encodeURIComponent(pending)}`
                + `&approvedId=${encodeURIComponent(ev.detail.orderId)}`
                + `&password=${encodeURIComponent(pw)}`).catch(() => {});
        });
```

**מגבלה מתועדת:** הסימון עובד רק אם מנהלת הרכש הגיעה דרך המסך שלה באותו session (שם נשמרת הסיסמה). אם היא פתחה קישור ישן בחלון חדש — ההזמנה תגיע לרועי אבל תישאר מסומנת "ממתין". לרשום את זה ב-`CLAUDE.md`.

- [ ] **Step 2: להעלות גרסאות**

```bash
cd "/Users/roeiaharoni/Desktop/קטלוג לקוחות/aroan"
grep -rl "app\.js?v=51" --include="*.html" . | xargs sed -i '' 's/app\.js?v=51/app.js?v=52/g'
sed -i '' "s/aroam-cache-v45/aroam-cache-v46/" sw.js
```

`style.css` לא השתנה במשימות האלה — **לא להעלות את הגרסה שלו** אלא אם כן נגעת בו בפועל.

- [ ] **Step 3: לאמת שלא נשארו הפניות ישנות**

```bash
grep -rn "app\.js?v=51\|aroam-cache-v45" --include="*.html" --include="*.js" . | grep -v node_modules | grep -v "\.superpowers"
```

Expected: **אפס שורות**.

- [ ] **Step 4: רגרסיה מלאה**

לנקות SW ו-caches, ואז בכל דף לאמת טעינה נקייה עם `app.js?v=52`:

| דף | לאמת |
| --- | --- |
| `/catalog/` | 199 מוצרים, "שם העסק *" חוסם שליחה, יעד ה-webhook הרגיל, וואטסאפ ומייל גלויים |
| `/care/` | 63 מוצרים, בוררי אספקה, קידומת AR |
| `/agent/` | PIN, עריכת מחיר, `agent-mode`, כפתור שליחה יחיד |
| `/shops-4b7e2c/` | שער, בורר סניף, כפתור יחיד, יעד הממתינות, 0 קישורי `tel:`/`wa.me` |
| `/emp-8c3f5a/` | שער, מחירים, קידומת VD |
| `/rakash-5e91c7/` | שער, רשימה, קישור עריכה |

בכל דף:

```js
JSON.stringify({ app: [...document.scripts].map(s => s.src).find(s => s.includes('app.js')), errors: performance.getEntriesByType('resource').filter(r => r.responseStatus >= 400).map(r => r.name) })
```

Expected: ‏`?v=52` ו-`errors` ריק. (‏`/rakash-5e91c7/` לא טוען את `app.js` — שם `app` יהיה `undefined`, וזה תקין.)

- [ ] **Step 5: בדיקות ואי-סחף**

```bash
node tools/test/chain-pending.test.js && node tools/test/order-doc.test.js && python3 tools/refresh_site.py && git status --short
```

Expected: שתי חבילות הבדיקות עוברות; הסחף היחיד הוא שדות תאריך.

- [ ] **Step 6: לעדכן את CLAUDE.md**

לעדכן את שורת הגרסאות בסעיף הארכיטקטורה (`app.js?v=52`, `sw cache-v46`), להוסיף את `/rakash-5e91c7/` לרשימת האזורים הרגישים, ולהוסיף סעיף ממוספר חדש בסוף "מה בוצע" — בעומק של הסעיפים הקיימים: הבעיה (מנהלת הרכש היא החוליה בין הסניפים לרועי ולא הייתה לה דרך להתערב, 60 סניפים במכה כל חודשיים), ההחלטות של רועי, הארכיטקטורה של שני הצינורות ו**למה** היא מסירה את הסיכון, המגבלה של סימון "נשלחה" מ-Step 1, ומה נדרש מרועי.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "סימון הזמנה כנשלחה, העלאת גרסאות ותיעוד — מסך מנהלת הרכש

גרסאות: app.js?v=52, sw cache-v46.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: לרכז את מה שנדרש מרועי**

לדווח במפורש, בלי לנסות לבצע:

1. **push** — אין credentials של GitHub בסביבה.
2. לפתוח **גיליון גוגל חדש** להזמנות הממתינות ולהעתיק את המזהה שלו.
3. לפרוס **סקריפט Apps Script חדש** מ-`tools/google-apps-script-chain-pending.gs`, אחרי החלפת `SPREADSHEET_ID` ו-`API_PASSWORD`. פריסה: Web app, ‏Execute as **Me**, ‏Who has access **Anyone**.
4. למסור את כתובת ה-webhook, כדי להחליף את שני מציני המקום `PUT_THE_PENDING_WEBHOOK_URL_HERE` (ב-`shops-4b7e2c/index.html` וב-`rakash-5e91c7/index.html`).
5. להחליט על הכתובת הסודית של המסך (`rakash-5e91c7`) ועל קוד הכניסה (`8264`) ועל הסיסמה של ה-API.
6. **הזמנת בדיקה מקצה לקצה** אחרי הפריסה, ומחיקת השורות שנוצרו.
