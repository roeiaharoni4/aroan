# סטטוס הזמנה ובדיקת התאמה יומית — תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** לסמן לכל הזמנה מכל הערוץ את השלב שלה (נקלטה בריווחית ← סופקה ← חשבונית), ממסך "הזמנות" ב-CRM, ולקבל בסיכום הבוקר בדיקה של הזמנות שחסרות, כפולות או תקועות.

**Architecture:**
- **המקור:** עמודת "סטטוס" בגיליון ההזמנות, ועמודה חדשה בסוף השורה — "סטטוס עודכן".
- **הסקריפט:** סקריפט ה-CRM מקבל שתי פעולות — `orders` ו-`order_status` — ופונקציה טהורה `reconcileFor_`, שנכנסת לסיכום הבוקר.
- **העמוד:** עמוד ה-CRM מקבל מסך שלישי, `#crm-orders-view`, ליד הרשימה והכרטיס. העזרים הטהורים נכנסים ל-`crm-core.js`.
- **סקריפט ההזמנות לא משתנה.**

**Tech Stack:** Google Apps Script (ES5), JavaScript בדפדפן בלי framework, בדיקות Node עם `assert`, clasp 3.4.1.

**אפיון:** `docs/superpowers/specs/2026-11-17-order-status-and-daily-check-design.md`

## Global Constraints

- **שפה ועיצוב:** כל טקסט בממשק בעברית. בלי אימוג'ים. צבעים רק מהטוקנים ומהמחלקות הקיימים (`--crm-*`, `crm-stage-*`).
- **`.gs` ו-`crm-core.js`:** ES5 בלבד.
- **בדיקת תחביר ל-`.gs`:** `node -e "new Function(require('fs').readFileSync('tools/google-apps-script-crm.gs','utf8'))"`.
- **השלבים:** `['חדשה', 'נקלטה בריווחית', 'סופקה', 'חשבונית הופקה', 'בוטלה']`. ריק או `בטיפול` ⇒ `חדשה`.
- **ערוצים לפי קידומת:** `AR-`/`HM-` = `אתר`, `SL-` = `סוכן`, `RA-` = `רשת`, אחרת `אחר`.
- **`ORDERS_STATUS_SINCE = '2026-11-17'`:** הזמנה שהגיעה לפני התאריך הזה לא מסומנת כ"תקועה" — היא קדמה למעקב. **זו תוספת לאפיון:** בלעדיה, כל ההזמנות מ-60 הימים האחרונים היו מופיעות בסיכום הראשון. במסך "הזמנות" הן מופיעות כרגיל.
- **אסור לשלוח בקשה אמיתית ל-Google בבדיקות בדפדפן** — משתמשים ב-`tools/test/crm-fake-api.js`.
- **הריפו פומבי:** הסקריפט נשאר עם מצייני המקום. הבנייה לענן — `~/.aroam-crm/build-crm-from-cloud.js`.
- **גרסאות אחרי הסבב:** `crm-core.js?v=6`, `crm.js?v=10`, `crm.css?v=7`.

---

### Task 1: הסקריפט — קריאת השורות, `orders` ו-`order_status`

**Files:**
- Modify: `tools/google-apps-script-crm.gs` — קבועים אחרי `PRICE_MAX`, `orderRowsFromValues_`, פונקציות חדשות לפני `handleImport_`, ושני cases ב-switch.
- Test: `tools/test/crm.test.js` — הסביבה המדומה מקבלת `newDataValidation`, ו-`fakeSheet` מקבל `getDataValidation`/`setDataValidation`.

**Interfaces:**
- Produces:
  - `ORDER_STATUSES`, `ORDERS_STATUS_SINCE`
  - `normStatus_(s) → string`, `channelOf_(orderId) → string`
  - `orderRowsFromValues_` מחזיר עכשיו גם `status`, `statusAt`, `_row`
  - `orders {days}` ⇒ `{ok, orders: [{orderId, receivedAt, business, contact, totalItems, totalPrice, pdf, status, statusAt, channel, contactId, duplicate}]}`
  - `order_status {orderIds, status}` ⇒ `{ok, updated, missing, status, statusAt}`. שגיאות: `bad status`, `no orders`, `not found`.

- [ ] **Step 1: הבדיקות שנכשלות**

(א) ב-`loadApp`, להחליף את השורה
`    SpreadsheetApp: { openById(id) { return id === 'ORDERS-ID' ? orders : crm; } },`
ב:

```js
    SpreadsheetApp: {
      openById(id) { return id === 'ORDERS-ID' ? orders : crm; },
      // כלל רשימה נפתחת — רק מה שהקוד משתמש בו
      newDataValidation() {
        const rule = { values: null };
        const b = {
          requireValueInList(values) { rule.values = values.slice(); return b; },
          setAllowInvalid() { return b; },
          build() { return { getCriteriaValues: () => [rule.values] }; }
        };
        return b;
      }
    },
```

(ב) ב-`fakeSheet`, בתוך האובייקט `range`, אחרי `getValues() {...}`:

```js
        ,
        getDataValidation() { return sh.validation || null; },
        setDataValidation(rule) { sh.validation = rule; return range; }
```

(הפסיק בתחילת הבלוק מחליף את סוף `getValues`. לוודא שהתחביר תקין אחרי ההכנסה.)

(ג) בדיקות חדשות לפני `let failed = 0;`:

```js
// ---------- סטטוס הזמנה (אפיון 2026-11-17) ----------
function statusBook(rows) {
  const b = fakeBook();
  const sh = b.insertSheet('הזמנות');
  sh.rows.push(ORDERS_HEAD.slice());
  rows.forEach(r => sh.rows.push(r));
  return b;
}
const O = (d, id, business, status, pdf) => [d, id, '', business, 'איש קשר', '0501234567', '', '', '...', 3,
  '100.00', status, '', '', '', pdf === undefined ? 'https://drive/x' : pdf];

test('orders: נרמול סטטוס, ערוץ, contactId, כפילות, וסדר מהחדשה', () => {
  const orders = statusBook([
    O(new Date(2026, 10, 10, 9, 0), 'AR-20261110-111111', 'מסעדת הגפן', 'חדשה'),
    O(new Date(2026, 10, 11, 9, 0), 'SL-20261111-222222', 'משרדי אלפא', 'בטיפול'),
    O(new Date(2026, 10, 12, 9, 0), 'RA-20261112-333333', 'גלילות — טומי', ''),
    O(new Date(2026, 10, 12, 9, 5), 'RA-20261112-333333', 'גלילות — טומי', ''),
    O(new Date(2026, 6, 1, 9, 0), 'AR-20260701-444444', 'ישן', 'חדשה')
  ]);
  const app = loadApp({ orders, now: { date: '2026-11-17', stamp: '2026-11-17 08:00' } });
  const id = app.call({ action: 'event', secret: S, event: Object.assign({}, ORDER, { orderId: 'AR-20261110-111111' }) }).id;
  const r = app.call({ action: 'orders', password: P });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.orders.map(o => o.orderId), ['RA-20261112-333333', 'SL-20261111-222222', 'AR-20261110-111111']);
  const ra = r.orders[0];
  assert.strictEqual(ra.duplicate, true);
  assert.strictEqual(ra.channel, 'רשת');
  assert.strictEqual(ra.status, 'חדשה');
  assert.strictEqual(r.orders[1].status, 'חדשה', 'בטיפול ⇒ חדשה');
  assert.strictEqual(r.orders[1].channel, 'סוכן');
  assert.strictEqual(r.orders[2].contactId, id);
  assert.strictEqual(r.orders[2].receivedAt, '2026-11-10 09:00');
  assert.strictEqual(app.call({ action: 'orders', password: P, days: 400 }).orders.length, 4, 'תקרה 365');
  assert.strictEqual(app.call({ action: 'orders' }).error, 'unauthorized');
});

test('order_status: כמה מספרים, שורות כפולות, missing, כותרת חדשה ורשימה נפתחת', () => {
  const orders = statusBook([
    O(new Date(2026, 10, 12, 9, 0), 'RA-20261112-333333', 'גלילות — טומי', 'חדשה'),
    O(new Date(2026, 10, 12, 9, 5), 'RA-20261112-333333', 'גלילות — טומי', 'חדשה'),
    O(new Date(2026, 10, 13, 9, 0), 'SL-20261113-555555', 'משרדי אלפא', 'חדשה')
  ]);
  const app = loadApp({ orders, now: { date: '2026-11-17', stamp: '2026-11-17 08:30' } });
  const r = app.call({ action: 'order_status', password: P, status: 'נקלטה בריווחית',
    orderIds: ['RA-20261112-333333', 'SL-20261113-555555', 'AR-NOPE'] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.updated, 3);
  assert.deepStrictEqual(r.missing, ['AR-NOPE']);
  assert.strictEqual(r.statusAt, '2026-11-17 08:30');
  const sh = orders.sheets['הזמנות'];
  assert.strictEqual(sh.rows[0][16], 'סטטוס עודכן');
  assert.deepStrictEqual(sh.rows.slice(1).map(x => [x[11], x[16]]),
    [['נקלטה בריווחית', '2026-11-17 08:30'], ['נקלטה בריווחית', '2026-11-17 08:30'], ['נקלטה בריווחית', '2026-11-17 08:30']]);
  assert.ok(sh.validation.getCriteriaValues()[0].indexOf('נקלטה בריווחית') >= 0);
  const list = app.call({ action: 'orders', password: P }).orders;
  assert.strictEqual(list[0].statusAt, '2026-11-17 08:30');
  assert.strictEqual(app.call({ action: 'order_status', password: P, status: 'שולמה', orderIds: ['X'] }).error, 'bad status');
  assert.strictEqual(app.call({ action: 'order_status', password: P, status: 'סופקה', orderIds: [] }).error, 'no orders');
  assert.strictEqual(app.call({ action: 'order_status', password: P, status: 'סופקה',
    orderIds: Array.from({ length: 201 }, (_, i) => 'X' + i) }).error, 'no orders');
});
```

- [ ] **Step 2: להריץ ולראות כשל**

Run: `node tools/test/crm.test.js 2>&1 | tail -1`
Expected: `נכשלו 2 מתוך 109`.

- [ ] **Step 3: המימוש**

(א) אחרי `var PRICE_MAX = 100000;`:

```js
// סטטוס הזמנה (אפיון 2026-11-17): בעמודת "סטטוס" בגיליון ההזמנות, וחותמת ב"סטטוס עודכן"
// בסוף השורה. "בטיפול" — ערך ישן מהרשימה הנפתחת — נחשב "חדשה".
var ORDER_STATUSES = ['חדשה', 'נקלטה בריווחית', 'סופקה', 'חשבונית הופקה', 'בוטלה'];
var ORDER_STATUS_AT = 'סטטוס עודכן';
// הזמנות מלפני המעקב לא נחשבות "תקועות" בסיכום הבוקר
var ORDERS_STATUS_SINCE = '2026-11-17';
```

(ב) `orderRowsFromValues_` — במפת `idx`, אחרי `pdf: head.indexOf('קובץ PDF')`:

```js
    pdf: head.indexOf('קובץ PDF'),
    status: head.indexOf('סטטוס'), statusAt: head.indexOf(ORDER_STATUS_AT)
```

ולפני `if (o.orderId) out.push(o);`:

```js
    o._row = r + 1;
    o.receivedAt = stampOfCell_(o.receivedAt);
```

ומעל הפונקציה:

```js
// תאריך קבלה כטקסט (שורה שהוקלדה ידנית): DD/MM/YYYY HH:mm[:ss] ⇒ YYYY-MM-DD HH:mm
function stampOfCell_(s) {
  s = trim_(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 16);
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
  if (!m) return '';
  var p = function (n) { return (Number(n) < 10 ? '0' : '') + Number(n); };
  return m[3] + '-' + p(m[2]) + '-' + p(m[1]) + (m[4] ? ' ' + p(m[4]) + ':' + m[5] : ' 00:00');
}
```

(ג) לפני `function handleImport_(dryRun) {`:

```js
// ---------- סטטוס הזמנה (אפיון 2026-11-17) ----------

function normStatus_(s) {
  s = trim_(s);
  return ORDER_STATUSES.indexOf(s) >= 0 ? s : 'חדשה';
}

function channelOf_(orderId) {
  var p = trim_(orderId).slice(0, 3);
  if (p === 'AR-' || p === 'HM-') return 'אתר';
  if (p === 'SL-') return 'סוכן';
  if (p === 'RA-') return 'רשת';
  return 'אחר';
}

function ordersSheet_() {
  return SpreadsheetApp.openById(ORDERS_SPREADSHEET_ID).getSheetByName(ORDERS_SHEET);
}

// ההזמנות מ-days הימים האחרונים, החדשה קודם. מספר כפול — פעם אחת, עם duplicate.
// שורה בלי תאריך קריא — בסוף.
function handleOrders_(days) {
  var n = Math.min(365, Math.max(1, Math.floor(Number(days) || 60)));
  var rows = readOrderRows_();
  var model = readModel_(book_());
  var today = now_().date;
  var byOrder = {};
  model.activities.forEach(function (a) { if (a.orderId) byOrder[a.orderId] = a.contactId; });
  var seen = {};
  var out = [];
  rows.forEach(function (r) {
    if (r.receivedAt && daysBetween_(r.receivedAt, today) > n) return;
    if (seen[r.orderId]) { seen[r.orderId].duplicate = true; return; }
    var o = {
      orderId: r.orderId, receivedAt: r.receivedAt, business: r.business, contact: r.contact,
      totalItems: r.totalItems, totalPrice: r.totalPrice, pdf: r.pdf,
      status: normStatus_(r.status), statusAt: trim_(r.statusAt), channel: channelOf_(r.orderId),
      contactId: byOrder[r.orderId] || '', duplicate: false
    };
    seen[r.orderId] = o;
    out.push(o);
  });
  out.sort(function (a, b) {
    if (!a.receivedAt || !b.receivedAt) return a.receivedAt ? -1 : b.receivedAt ? 1 : 0;
    return cmp_(b.receivedAt, a.receivedAt);
  });
  return { ok: true, orders: out };
}

// הרשימה הנפתחת בעמודת הסטטוס — עם "נקלטה בריווחית". "בטיפול" נשאר בה, בשביל שורות ישנות.
function ensureStatusValidation_(sh, col) {
  try {
    var cell = sh.getRange(2, col, 1, 1);
    var cur = cell.getDataValidation();
    var vals = cur && cur.getCriteriaValues ? (cur.getCriteriaValues()[0] || []) : [];
    if (vals.indexOf('נקלטה בריווחית') >= 0) return;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(ORDER_STATUSES.concat(['בטיפול']), true)
      .setAllowInvalid(true)
      .build();
    // עד סוף הגיליון — getRange לא מרחיב, ובגיליון ההזמנות יש 998 שורות
    sh.getRange(2, col, sh.getMaxRows() - 1, 1).setDataValidation(rule);
  } catch (e) {
    Logger.log('CRM status validation: ' + e);
  }
}

// כותב סטטוס וחותמת לכל השורות של כל מספר. השורות מאותרות מחדש בכל כתיבה.
function handleOrderStatus_(ids, status) {
  status = trim_(status);
  if (ORDER_STATUSES.indexOf(status) < 0) return { ok: false, error: 'bad status' };
  if (!Array.isArray(ids) || !ids.length || ids.length > 200) return { ok: false, error: 'no orders' };
  var sh = ordersSheet_();
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'not found' };
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return trim_(h); });
  var idCol = head.indexOf('מספר הזמנה') + 1;
  var statusCol = head.indexOf('סטטוס') + 1;
  if (!idCol || !statusCol) return { ok: false, error: 'not found' };
  var atCol = head.indexOf(ORDER_STATUS_AT) + 1;
  if (!atCol) {
    atCol = head.length + 1;
    sh.getRange(1, atCol, 1, 1).setValues([[ORDER_STATUS_AT]]);
  }
  ensureStatusValidation_(sh, statusCol);
  var want = {};
  ids.forEach(function (id) { id = trim_(id); if (id) want[id] = false; });
  var stamp = now_().stamp;
  var col = sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues();
  var updated = 0;
  col.forEach(function (row, i) {
    var id = trim_(row[0]);
    if (!(id in want)) return;
    want[id] = true;
    sh.getRange(i + 2, statusCol, 1, 1).setValues([[status]]);
    sh.getRange(i + 2, atCol, 1, 1).setValues([[stamp]]);
    updated++;
  });
  var missing = Object.keys(want).filter(function (id) { return !want[id]; });
  if (!updated) return { ok: false, error: 'not found', missing: missing };
  return { ok: true, updated: updated, missing: missing, status: status, statusAt: stamp };
}
```

(ד) ב-switch, אחרי `case 'agent_data': ...`:

```js
      case 'orders': return json_(handleOrders_(body.days));
      case 'order_status': return json_(withLock_(function () {
        return handleOrderStatus_(body.orderIds, body.status);
      }));
```

(ה) בהערה שבראש הקובץ, בשורה של עמוד ה-CRM — להוסיף `orders, order_status`.

- [ ] **Step 4: להריץ ולראות שעובר**

Run: `node tools/test/crm.test.js 2>&1 | tail -1`
Expected: `כל 109 הבדיקות עברו`. אם בדיקות ייבוא ישנות נשברו בגלל `_row` או `receivedAt` — לבדוק ולתקן.

- [ ] **Step 5: Commit**

```bash
git add tools/google-apps-script-crm.gs tools/test/crm.test.js
git commit -m "CRM: orders ו-order_status — סטטוס הזמנה בגיליון ההזמנות"
```

---

### Task 2: בדיקת ההתאמה בסיכום הבוקר

**Files:**
- Modify: `tools/google-apps-script-crm.gs` — `reconcileFor_` ו-`prevBusinessDay_` לפני `digestDue_`, ושינויים ב-`digestFor_` וב-`tick`.
- Test: `tools/test/crm.test.js` — `reconcileFor_` מתווסף לרשימה ש-`loadGs` מחזיר.

**Interfaces:**
- Consumes: `orderRowsFromValues_` (Task 1), `classifyOrderRow_`, `normStatus_`, `channelOf_`.
- Produces:
  - `reconcileFor_(rows, model, now, lastDigest)` ⇒ `{counts: {total, site, agent, chain, other}, problems: [{orderId, business, detail}], stuck: [...], error: false}`
  - `digestFor_(model, now, recon)` — הפרמטר השלישי אופציונלי. `{error: true}` = הגיליון לא נקרא.

- [ ] **Step 1: הבדיקות שנכשלות**

(א) ב-`loadGs`, להוסיף `reconcileFor_: reconcileFor_,` לאובייקט שחוזר.

(ב) לפני `let failed = 0;`:

```js
const RNOW = { date: '2026-11-22', stamp: '2026-11-22 07:30' };   // יום ראשון
const rrow = (o) => Object.assign({ orderId: '', receivedAt: '', business: 'עסק', contact: 'איש קשר',
  phone: '0501234567', address: '', notes: '', totalItems: '3', totalPrice: '', shipping: '',
  pdf: 'https://drive/x', status: 'חדשה', statusAt: '' }, o);

test('התאמה: ספירה מאז הסיכום הקודם — שישי ושבת ביום ראשון', () => {
  const rows = [
    rrow({ orderId: 'AR-1', receivedAt: '2026-11-19 10:00' }),
    rrow({ orderId: 'AR-2', receivedAt: '2026-11-20 10:00' }),
    rrow({ orderId: 'SL-3', receivedAt: '2026-11-21 10:00' }),
    rrow({ orderId: 'RA-4', receivedAt: '2026-11-21 11:00' }),
    rrow({ orderId: 'AR-5', receivedAt: '2026-11-22 07:00' })
  ];
  const model = { contacts: [], activities: ['AR-1', 'AR-2', 'SL-3', 'AR-5'].map(id => ({ orderId: id, contactId: 'C' })) };
  const r = gs.reconcileFor_(rows, model, RNOW, '2026-11-20');
  assert.deepStrictEqual(r.counts, { total: 3, site: 1, agent: 1, chain: 1, other: 0 });
  assert.strictEqual(gs.reconcileFor_(rows, model, RNOW, null).counts.total, 2, 'בלי סיכום קודם — רק אתמול');
});

test('התאמה: חסרה ב-CRM (לא צרכן ולא רשת), בלי PDF, ומספר כפול — 7 ימים אחרונים', () => {
  const rows = [
    rrow({ orderId: 'AR-10', receivedAt: '2026-11-20 10:00', business: 'מסעדת הגפן' }),
    rrow({ orderId: 'AR-11', receivedAt: '2026-11-20 11:00', business: '', shipping: 'משלוח' }),
    rrow({ orderId: 'RA-12', receivedAt: '2026-11-20 12:00', pdf: '' }),
    rrow({ orderId: 'SL-13', receivedAt: '2026-11-21 09:00' }),
    rrow({ orderId: 'SL-13', receivedAt: '2026-11-21 10:00' }),
    rrow({ orderId: 'AR-14', receivedAt: '2026-11-10 10:00', business: 'ישן' })
  ];
  const model = { contacts: [], activities: [{ orderId: 'SL-13', contactId: 'C' }] };
  const r = gs.reconcileFor_(rows, model, RNOW, '2026-11-20');
  const by = (k) => r.problems.filter(p => p.detail.indexOf(k) >= 0).map(p => p.orderId);
  assert.deepStrictEqual(by('חסרה ב-CRM'), ['AR-10']);
  assert.deepStrictEqual(by('בלי תעודת PDF'), ['RA-12']);
  assert.deepStrictEqual(by('מספר כפול'), ['SL-13']);
});

test('התאמה: תקועות — לא נקלטה, לא סופקה, סופקה בלי חשבונית; בלי הזמנות מלפני המעקב', () => {
  const rows = [
    rrow({ orderId: 'AR-20', receivedAt: '2026-11-18 10:00' }),
    rrow({ orderId: 'AR-21', receivedAt: '2026-11-19 10:00' }),
    rrow({ orderId: 'AR-22', receivedAt: '2026-11-18 10:00', status: 'נקלטה בריווחית', statusAt: '2026-11-18 12:00' }),
    rrow({ orderId: 'AR-23', receivedAt: '2026-11-20 10:00', status: 'נקלטה בריווחית', statusAt: '2026-11-20 12:00' }),
    rrow({ orderId: 'AR-24', receivedAt: '2026-11-17 10:00', status: 'סופקה', statusAt: '2026-11-19 12:00' }),
    rrow({ orderId: 'AR-25', receivedAt: '2026-11-03 10:00' }),
    rrow({ orderId: 'AR-26', receivedAt: '2026-11-18 10:00', status: 'בוטלה' })
  ];
  const model = { contacts: [], activities: rows.map(x => ({ orderId: x.orderId, contactId: 'C' })) };
  const r = gs.reconcileFor_(rows, model, RNOW, '2026-11-20');
  const ids = (k) => r.stuck.filter(p => p.detail.indexOf(k) >= 0).map(p => p.orderId);
  assert.deepStrictEqual(ids('לא נקלטה'), ['AR-20'], 'יום העסקים הקודם הוא חמישי 19.11');
  assert.deepStrictEqual(ids('לא סופקה'), ['AR-22']);
  assert.deepStrictEqual(ids('בלי חשבונית'), []);
  const dec = gs.reconcileFor_(rows, model, { date: '2026-12-01', stamp: '2026-12-01 07:30' }, '2026-11-30');
  assert.ok(dec.stuck.some(p => p.orderId === 'AR-24' && p.detail.indexOf('בלי חשבונית') >= 0));
});

test('סיכום הבוקר: בעיות התאמה מוסיפות סעיף ונכנסות לכותרת; "הכל תקין" לבד לא שולח', () => {
  const empty = { contacts: [], activities: [], tasks: [] };
  const ok = { counts: { total: 4, site: 2, agent: 2, chain: 0, other: 0 }, problems: [], stuck: [], error: false };
  assert.strictEqual(gs.digestFor_(empty, RNOW, ok), null);
  const bad = { counts: ok.counts, error: false, stuck: [],
    problems: [{ orderId: 'AR-10', business: 'מסעדת הגפן', detail: 'חסרה ב-CRM' }] };
  const d = gs.digestFor_(empty, RNOW, bad);
  assert.strictEqual(d.subject, 'CRM — בעיה אחת בהזמנות');
  assert.ok(d.text.indexOf('מאז הסיכום הקודם: 4 הזמנות — אתר 2, סוכן 2') >= 0, d.text);
  assert.ok(d.text.indexOf('• מסעדת הגפן (AR-10) — חסרה ב-CRM') >= 0, d.text);
  assert.ok(d.html.indexOf('#orders') >= 0);
  const err = gs.digestFor_(empty, RNOW, { error: true });
  assert.ok(err.text.indexOf('בדיקת ההתאמה לא רצה') >= 0, err.text);
  const withTask = gs.digestFor_({ contacts: [], activities: [],
    tasks: [{ id: 'T', contactId: '', text: 'משימה', due: '2026-11-22', time: '', done: '' }] }, RNOW, ok);
  assert.ok(withTask.text.indexOf('הכל תקין') >= 0, withTask.text);
});
```

- [ ] **Step 2: להריץ ולראות כשל**

Run: `node tools/test/crm.test.js 2>&1 | tail -1`
Expected: `נכשלו 4 מתוך 113`.

- [ ] **Step 3: המימוש**

(א) לפני `// סיכום הבוקר: פעם ביום`:

```js
// ---------- בדיקת התאמה (אפיון 2026-11-17) ----------

// יום העסקים הקודם (ראשון–חמישי)
function prevBusinessDay_(day) {
  var d = dayNum_(day) - 1;
  var wd = function (n) { return new Date(n * 86400000).getUTCDay(); };
  while (wd(d) === 5 || wd(d) === 6) d--;
  var dt = new Date(d * 86400000);
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return dt.getUTCFullYear() + '-' + p(dt.getUTCMonth() + 1) + '-' + p(dt.getUTCDate());
}

// rows — מ-orderRowsFromValues_. lastDigest — היום של הסיכום הקודם (או null ⇒ אתמול).
// counts: מה שהגיע מאז הסיכום הקודם עד אתמול. problems: 7 הימים האחרונים. stuck: 60 יום,
// רק מ-ORDERS_STATUS_SINCE. היום עצמו לא נבדק — ההזמנה אולי עוד בדרך ל-CRM.
function reconcileFor_(rows, model, now, lastDigest) {
  var today = now.date;
  var from = lastDigest && lastDigest < today ? lastDigest : prevDay_(today);
  var inCrm = {};
  model.activities.forEach(function (a) { if (a.orderId) inCrm[a.orderId] = true; });
  var counts = { total: 0, site: 0, agent: 0, chain: 0, other: 0 };
  var key = { 'אתר': 'site', 'סוכן': 'agent', 'רשת': 'chain', 'אחר': 'other' };
  var times = {};
  rows.forEach(function (r) { times[r.orderId] = (times[r.orderId] || 0) + 1; });
  var problems = [];
  var stuck = [];
  var seen = {};
  var prevBiz = prevBusinessDay_(today);
  rows.forEach(function (r) {
    var day = String(r.receivedAt || '').slice(0, 10);
    if (!day || day >= today) return;
    var label = trim_(r.business) || trim_(r.contact) || r.orderId;
    var age = daysBetween_(day, today);
    var first = !seen[r.orderId];
    seen[r.orderId] = true;
    if (first && day >= from) {
      counts.total++;
      counts[key[channelOf_(r.orderId)]]++;
    }
    if (first && age <= 7) {
      var kind = classifyOrderRow_(r).kind;
      if ((kind === 'order' || kind === 'quote_request') && !inCrm[r.orderId]) {
        problems.push({ orderId: r.orderId, business: label, detail: 'חסרה ב-CRM' });
      }
      if (!trim_(r.pdf)) problems.push({ orderId: r.orderId, business: label, detail: 'בלי תעודת PDF' });
      if (times[r.orderId] > 1) {
        problems.push({ orderId: r.orderId, business: label, detail: 'מספר כפול (' + times[r.orderId] + ' שורות)' });
      }
    }
    if (!first || age > 60 || day < ORDERS_STATUS_SINCE) return;
    var st = normStatus_(r.status);
    var since = String(trim_(r.statusAt) || r.receivedAt).slice(0, 10);
    if (st === 'חדשה' && day < prevBiz) {
      stuck.push({ orderId: r.orderId, business: label, detail: 'לא נקלטה בריווחית · מ-' + fmtDay_(day) });
    } else if (st === 'נקלטה בריווחית' && daysBetween_(since, today) > 3) {
      stuck.push({ orderId: r.orderId, business: label,
        detail: 'לא סופקה · נקלטה לפני ' + daysBetween_(since, today) + ' ימים' });
    } else if (st === 'סופקה' && since.slice(0, 7) < today.slice(0, 7)) {
      stuck.push({ orderId: r.orderId, business: label, detail: 'סופקה בלי חשבונית · ב-' + fmtDay_(since) });
    }
  });
  return { counts: counts, problems: problems, stuck: stuck, error: false };
}

function prevDay_(day) {
  var dt = new Date((dayNum_(day) - 1) * 86400000);
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return dt.getUTCFullYear() + '-' + p(dt.getUTCMonth() + 1) + '-' + p(dt.getUTCDate());
}

function fmtDay_(day) {
  var p = String(day).split('-');
  return p.length === 3 ? p[2] + '.' + p[1] : '';
}
```

(ב) `digestFor_` — חתימה `function digestFor_(model, now, recon) {`.

להחליף את השורה `if (!tasks.length && !todo.length && !late.length) return null;` ב:

```js
  // בדיקת ההתאמה: בעיות ותקועות מוסיפות סעיפים ושולחות סיכום; "הכל תקין" — רק שורה
  var rc = recon || null;
  var issues = rc && !rc.error ? rc.problems.concat(rc.stuck) : [];
  var reconError = !!(rc && rc.error);
  if (!tasks.length && !todo.length && !late.length && !issues.length && !reconError) return null;
```

אחרי בלוק `if (late.length) { sections.push(...) }`:

```js
  var ordersUrl = CRM_PAGE_URL + '#orders';
  var asItems = function (list) {
    return list.slice(0, 10).map(function (p) {
      return { name: p.business + ' (' + p.orderId + ')', url: ordersUrl, detail: p.detail };
    });
  };
  if (rc && !rc.error && rc.problems.length) {
    sections.push({ title: 'בעיות בהזמנות', more: Math.max(0, rc.problems.length - 10), items: asItems(rc.problems) });
  }
  if (rc && !rc.error && rc.stuck.length) {
    sections.push({ title: 'הזמנות תקועות', more: Math.max(0, rc.stuck.length - 10), items: asItems(rc.stuck) });
  }
```

אחרי `if (late.length) parts.push(...)`:

```js
  if (issues.length) parts.push(issues.length === 1 ? 'בעיה אחת בהזמנות' : issues.length + ' בעיות בהזמנות');
  if (reconError) parts.push('בדיקת ההתאמה לא רצה');
```

ואחרי השורה `var tg = ['בוקר טוב — ' + parts.join(' · ')];`:

```js
  if (rc) {
    var line = '';
    if (rc.error) {
      line = 'בדיקת ההתאמה לא רצה — גיליון ההזמנות לא נקרא.';
    } else {
      var ch = [['site', 'אתר'], ['agent', 'סוכן'], ['chain', 'רשת'], ['other', 'אחר']]
        .filter(function (x) { return rc.counts[x[0]]; })
        .map(function (x) { return x[1] + ' ' + rc.counts[x[0]]; });
      line = 'מאז הסיכום הקודם: ' + rc.counts.total + ' הזמנות' + (ch.length ? ' — ' + ch.join(', ') : '') +
        (issues.length ? '' : ' · הכל תקין');
    }
    text.push(line, '');
    html.push('<p>' + esc_(line) + '</p>');
    tg.push(line);
  }
```

(ג) `tick` — להחליף:

```js
    var props = PropertiesService.getScriptProperties();
    if (digestDue_(now, props.getProperty('LAST_DIGEST'))) {
      props.setProperty('LAST_DIGEST', now.date);
      var d = digestFor_(model, now);
```

ב:

```js
    var props = PropertiesService.getScriptProperties();
    var lastDigest = props.getProperty('LAST_DIGEST');
    if (digestDue_(now, lastDigest)) {
      props.setProperty('LAST_DIGEST', now.date);
      var recon;
      try {
        recon = reconcileFor_(readOrderRows_(), model, now, lastDigest);
      } catch (e) {
        Logger.log('CRM reconcile: ' + e);
        recon = { error: true };
      }
      var d = digestFor_(model, now, recon);
```

- [ ] **Step 4: להריץ ולראות שעובר**

Run: `node tools/test/crm.test.js 2>&1 | tail -1`
Expected: `כל 113 הבדיקות עברו`. בדיקות קודמות של `tick` ושל הסיכום צריכות לעבור בלי שינוי, כי הכותרת לא משתנה כשאין בעיות.

Run: `node -e "new Function(require('fs').readFileSync('tools/google-apps-script-crm.gs','utf8'))" && echo ok`

- [ ] **Step 5: Commit**

```bash
git add tools/google-apps-script-crm.gs tools/test/crm.test.js
git commit -m "CRM: בדיקת התאמה בסיכום הבוקר — חסרות, כפולות, בלי PDF ותקועות"
```

---

### Task 3: עזרים טהורים ל-crm-core והשרת המדומה

**Files:**
- Modify: `crm-f428d7/crm-core.js` — סעיף חדש לפני `var CrmCore = {`, והוספה לאובייקט.
- Modify: `tools/test/crm-fake-api.js` — `db.orders`, ו-cases `orders`/`order_status`.
- Test: `tools/test/crm-page.test.js`

**Interfaces:**
- Produces (ב-`CrmCore`):
  - `ORDER_STATUSES`, `ORDER_FILTERS`
  - `filterOrders(orders, key) → []`, `orderCounts(orders) → {open, 'חדשה', 'נקלטה בריווחית', 'סופקה', all}`
  - `nextStatus(s) → string|null`, `nextStatusLabel(s) → string`, `statusSlug(s) → string`
  - `groupOrdersByDay(orders) → [{day, orders, chain}]`, `orderRowSub(o) → string`

- [ ] **Step 1: הבדיקות שנכשלות** — ב-`crm-page.test.js`, לפני הלולאה:

```js
test('הזמנות: מסננים, ספירה, השלב הבא, קיבוץ לפי יום ושורת משנה', () => {
  const orders = [
    { orderId: 'RA-2', receivedAt: '2026-11-16 09:05', business: 'גלילות', channel: 'רשת', status: 'חדשה', totalItems: '3', totalPrice: '' },
    { orderId: 'RA-1', receivedAt: '2026-11-16 09:00', business: 'אמור', channel: 'רשת', status: 'סופקה', totalItems: '2', totalPrice: '' },
    { orderId: 'SL-3', receivedAt: '2026-11-15 12:13', business: 'זארה', channel: 'סוכן', status: 'נקלטה בריווחית', totalItems: '80', totalPrice: '360' },
    { orderId: 'AR-4', receivedAt: '2026-11-14 10:00', business: '', contact: 'דנה', channel: 'אתר', status: 'חשבונית הופקה', totalItems: '1', totalPrice: '' },
    { orderId: 'AR-5', receivedAt: '', business: 'בלי תאריך', channel: 'אתר', status: 'בוטלה', totalItems: '1', totalPrice: '' }
  ];
  assert.deepStrictEqual(C.filterOrders(orders, 'open').map(o => o.orderId), ['RA-2', 'RA-1', 'SL-3']);
  assert.deepStrictEqual(C.filterOrders(orders, 'סופקה').map(o => o.orderId), ['RA-1']);
  assert.strictEqual(C.filterOrders(orders, 'all').length, 5);
  assert.deepStrictEqual(C.orderCounts(orders),
    { open: 3, 'חדשה': 1, 'נקלטה בריווחית': 1, 'סופקה': 1, all: 5 });
  assert.strictEqual(C.nextStatus('חדשה'), 'נקלטה בריווחית');
  assert.strictEqual(C.nextStatus('סופקה'), 'חשבונית הופקה');
  assert.strictEqual(C.nextStatus('חשבונית הופקה'), null);
  assert.strictEqual(C.nextStatusLabel('נקלטה בריווחית'), 'סופקה');
  const g = C.groupOrdersByDay(orders);
  assert.deepStrictEqual(g.map(x => [x.day, x.orders.length, x.chain]),
    [['2026-11-16', 2, 2], ['2026-11-15', 1, 0], ['2026-11-14', 1, 0], ['', 1, 0]]);
  assert.strictEqual(C.orderRowSub(orders[2]), 'SL-3 · סוכן · 80 פריטים · 360.00 ₪');
  assert.strictEqual(C.orderRowSub(orders[0]), 'RA-2 · רשת · 3 פריטים');
  assert.strictEqual(C.statusSlug('סופקה'), 'back');
});
```

- [ ] **Step 2: להריץ ולראות כשל** — `node tools/test/crm-page.test.js | tail -1` ⇒ `נכשלו 1 מתוך 24`.

- [ ] **Step 3: המימוש** — לפני `var CrmCore = {`:

```js
    // ---------- הזמנות (אפיון 2026-11-17) ----------

    var ORDER_STATUSES = ['חדשה', 'נקלטה בריווחית', 'סופקה', 'חשבונית הופקה', 'בוטלה'];
    var ORDER_FILTERS = [
        { key: 'open', label: 'פתוחות' }, { key: 'חדשה', label: 'חדשות' },
        { key: 'נקלטה בריווחית', label: 'נקלטו' }, { key: 'סופקה', label: 'סופקו' }, { key: 'all', label: 'הכל' }
    ];
    var NEXT = { 'חדשה': 'נקלטה בריווחית', 'נקלטה בריווחית': 'סופקה', 'סופקה': 'חשבונית הופקה' };
    var NEXT_LABEL = { 'חדשה': 'נקלטה', 'נקלטה בריווחית': 'סופקה', 'סופקה': 'חשבונית' };
    // צבעי התגים — המחלקות הקיימות של השלבים ב-CRM
    var STATUS_SLUGS = { 'חדשה': 'new', 'נקלטה בריווחית': 'quote', 'סופקה': 'back',
        'חשבונית הופקה': 'customer', 'בוטלה': 'closed' };

    function isOpenOrder(o) { return o.status !== 'חשבונית הופקה' && o.status !== 'בוטלה'; }

    function filterOrders(orders, key) {
        return (orders || []).filter(function (o) {
            if (key === 'all') return true;
            if (key === 'open') return isOpenOrder(o);
            return o.status === key;
        });
    }

    function orderCounts(orders) {
        var out = { open: 0, 'חדשה': 0, 'נקלטה בריווחית': 0, 'סופקה': 0, all: 0 };
        (orders || []).forEach(function (o) {
            out.all++;
            if (isOpenOrder(o)) out.open++;
            if (o.status in out) out[o.status]++;
        });
        return out;
    }

    function nextStatus(s) { return NEXT[s] || null; }
    function nextStatusLabel(s) { return NEXT_LABEL[s] || ''; }
    function statusSlug(s) { return STATUS_SLUGS[s] || 'new'; }

    // ימים בסדר שבו ההזמנות מגיעות (החדש קודם); בלי תאריך — בסוף
    function groupOrdersByDay(orders) {
        var groups = [];
        var byDay = {};
        (orders || []).forEach(function (o) {
            var day = String(o.receivedAt || '').slice(0, 10);
            if (!byDay[day]) { byDay[day] = { day: day, orders: [], chain: 0 }; groups.push(byDay[day]); }
            byDay[day].orders.push(o);
            if (o.channel === 'רשת') byDay[day].chain++;
        });
        return groups.filter(function (g) { return g.day; }).concat(groups.filter(function (g) { return !g.day; }));
    }

    function orderRowSub(o) {
        var parts = [o.orderId, o.channel];
        if (Number(o.totalItems) > 0) parts.push(o.totalItems + ' פריטים');
        if (Number(o.totalPrice) > 0) parts.push(Number(o.totalPrice).toFixed(2) + ' ₪');
        return parts.filter(Boolean).join(' · ');
    }
```

ובאובייקט, אחרי `itemsUploadWarning: itemsUploadWarning`:

```js
        itemsUploadWarning: itemsUploadWarning,
        ORDER_STATUSES: ORDER_STATUSES, ORDER_FILTERS: ORDER_FILTERS, filterOrders: filterOrders,
        orderCounts: orderCounts, nextStatus: nextStatus, nextStatusLabel: nextStatusLabel,
        statusSlug: statusSlug, groupOrdersByDay: groupOrdersByDay, orderRowSub: orderRowSub
```

Run: `node tools/test/crm-page.test.js | tail -1` ⇒ `כל 24 הבדיקות עברו`.

- [ ] **Step 4: השרת המדומה** — ב-`crm-fake-api.js`:

(א) ב-`db`, אחרי `prices: [...]`:

```js
        ,
        orders: [
            { orderId: 'RA-' + day(-1).replace(/-/g, '') + '-100001', receivedAt: at(-1, '09:00'), business: 'גלילות — טומי', contact: 'רונית', totalItems: '12', totalPrice: '', pdf: 'https://drive.google.com/x', status: 'חדשה', statusAt: '', channel: 'רשת', contactId: '', duplicate: false },
            { orderId: 'RA-' + day(-1).replace(/-/g, '') + '-100002', receivedAt: at(-1, '09:05'), business: 'אמור', contact: 'דנה', totalItems: '8', totalPrice: '', pdf: 'https://drive.google.com/x', status: 'חדשה', statusAt: '', channel: 'רשת', contactId: '', duplicate: false },
            { orderId: 'SL-' + day(-2).replace(/-/g, '') + '-200001', receivedAt: at(-2, '12:13'), business: 'משרדי אלפא', contact: 'דוד', totalItems: '80', totalPrice: '360', pdf: 'https://drive.google.com/x', status: 'נקלטה בריווחית', statusAt: at(-2, '13:00'), channel: 'סוכן', contactId: 'C6', duplicate: true },
            { orderId: 'AR-' + day(-5).replace(/-/g, '') + '-300001', receivedAt: at(-5, '10:00'), business: 'גן שושנים', contact: 'רותי', totalItems: '5', totalPrice: '120', pdf: '', status: 'סופקה', statusAt: at(-4, '10:00'), channel: 'אתר', contactId: 'C5', duplicate: false },
            { orderId: 'AR-' + day(-20).replace(/-/g, '') + '-400001', receivedAt: at(-20, '10:00'), business: 'מאפיית הכיכר', contact: 'שמעון', totalItems: '3', totalPrice: '', pdf: 'https://drive.google.com/x', status: 'חשבונית הופקה', statusAt: at(-15, '10:00'), channel: 'אתר', contactId: 'C8', duplicate: false }
        ]
```

(ב) cases חדשים לפני `case 'list':`:

```js
            case 'orders':
                return { ok: true, orders: clone(db.orders) };
            case 'order_status': {
                const all = ['חדשה', 'נקלטה בריווחית', 'סופקה', 'חשבונית הופקה', 'בוטלה'];
                if (all.indexOf(b.status) < 0) return { ok: false, error: 'bad status' };
                if (!Array.isArray(b.orderIds) || !b.orderIds.length || b.orderIds.length > 200) return { ok: false, error: 'no orders' };
                const when = stamp();
                const missing = [];
                let updated = 0;
                b.orderIds.forEach(id => {
                    const o = db.orders.find(x => x.orderId === id);
                    if (!o) { missing.push(id); return; }
                    o.status = b.status; o.statusAt = when; updated++;
                });
                if (!updated) return { ok: false, error: 'not found', missing };
                return { ok: true, updated, missing, status: b.status, statusAt: when };
            }
```

`node --check tools/test/crm-fake-api.js`.

- [ ] **Step 5: Commit**

```bash
git add crm-f428d7/crm-core.js tools/test/crm-page.test.js tools/test/crm-fake-api.js
git commit -m "CRM: עזרים למסך ההזמנות; השרת המדומה מכיר orders ו-order_status"
```

---

### Task 4: מסך "הזמנות" בעמוד ה-CRM

**Files:**
- Modify: `crm-f428d7/index.html` — כפתור בבר, `<section id="crm-orders-view">`, והגרסאות.
- Modify: `crm-f428d7/crm.js` — `S`, `ERRORS`, סעיף "הזמנות", `popstate`, `openFromHash`, ומאזינים ב-`init`.
- Modify: `crm-f428d7/crm.css` — סעיף בסוף.

**Interfaces:**
- Consumes: `C.ORDER_STATUSES`, `C.ORDER_FILTERS`, `C.filterOrders`, `C.orderCounts`, `C.nextStatus`, `C.nextStatusLabel`, `C.statusSlug`, `C.groupOrdersByDay`, `C.orderRowSub` (Task 3); הפעולות `orders` ו-`order_status` (Task 1).

- [ ] **Step 1: `index.html`**

(א) בבר של `crm-list-view`, לפני `<button type="button" id="crm-task-add-btn"`:

```html
                    <button type="button" id="crm-orders-btn" class="crm-bar-btn">הזמנות</button>
```

(ב) אחרי `</section>` של `crm-card-view` (לפני `</main>`):

```html
        <section id="crm-orders-view" hidden>
            <header class="crm-bar">
                <button type="button" id="crm-orders-back" class="crm-bar-btn crm-icon-btn" aria-label="חזרה לרשימה">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                </button>
                <h1 id="crm-orders-title" tabindex="-1">הזמנות</h1>
                <button type="button" id="crm-orders-refresh" class="crm-bar-btn">רענון</button>
            </header>
            <div class="crm-wrap">
                <div id="crm-order-filters" class="crm-filters" role="group" aria-label="סינון הזמנות"></div>
                <p id="crm-orders-status" class="crm-hint" aria-live="polite"></p>
                <div id="crm-orders-list"></div>
            </div>
            <div id="crm-orders-bar" class="crm-orders-bar" hidden>
                <span id="crm-orders-count"></span>
                <div id="crm-orders-actions" class="crm-chips"></div>
                <button type="button" id="crm-orders-clear" class="crm-link-btn">ביטול הבחירה</button>
            </div>
        </section>
```

(ג) גרסאות: `crm-core.js?v=5` ⇒ `v=6`, `crm.js?v=9` ⇒ `v=10`, `crm.css?v=6` ⇒ `v=7`.

- [ ] **Step 2: `crm.js` — מצב, שגיאות וסעיף המסך**

(א) ב-`S`, אחרי `itemsUpload: null, itemsStored: 0, merge: null`:
`, orders: null, ordersFilter: 'open', ordersSel: new Set(), ordersLoading: false, ordersOpen: null`

(ב) ב-`ERRORS`, אחרי `'no prices': ...`:
`, 'bad status': 'השלב לא תקין.', 'no orders': 'לא נבחרו הזמנות.'`

(ג) סעיף חדש לפני `// ---------- משימות ----------`:

```js
    // ---------- הזמנות (אפיון 2026-11-17) ----------
    // הסטטוס נשמר בגיליון ההזמנות. השינוי בדפדפן מיידי, וכשל מחזיר את הקודם.

    function openOrders() {
        history.pushState({ crm: 'orders' }, '', '#orders');
        showOrders();
    }

    function showOrders() {
        S.openId = null;
        closeMenu();
        $('crm-list-view').hidden = true;
        $('crm-card-view').hidden = true;
        $('crm-orders-view').hidden = false;
        window.scrollTo(0, 0);
        $('crm-orders-title').focus();
        if (S.orders === null) loadOrders(); else renderOrders();
    }

    function hideOrders() {
        $('crm-orders-view').hidden = true;
        S.ordersSel.clear();
        $('crm-orders-bar').hidden = true;
    }

    async function loadOrders() {
        if (S.ordersLoading) return;
        S.ordersLoading = true;
        $('crm-orders-status').textContent = 'טוען…';
        const res = await api('orders', { days: 60 });
        S.ordersLoading = false;
        if (!res.ok) {
            $('crm-orders-status').textContent = errorText(res, 'ההזמנות לא נטענו — נסו "רענון".');
            return;
        }
        S.orders = res.orders || [];
        S.ordersSel.clear();
        renderOrders();
    }

    function renderOrders() {
        if (S.orders === null) return;
        const counts = C.orderCounts(S.orders);
        const fh = $('crm-order-filters');
        fh.textContent = '';
        C.ORDER_FILTERS.forEach(f => {
            const b = el('button', 'crm-chip' + (S.ordersFilter === f.key ? ' is-on' : ''), f.label + ' ' + counts[f.key]);
            b.type = 'button';
            b.setAttribute('aria-pressed', String(S.ordersFilter === f.key));
            b.addEventListener('click', () => { S.ordersFilter = f.key; S.ordersSel.clear(); renderOrders(); });
            fh.appendChild(b);
        });
        const list = C.filterOrders(S.orders, S.ordersFilter);
        $('crm-orders-status').textContent = list.length ? '' : 'אין הזמנות כאן.';
        const host = $('crm-orders-list');
        host.textContent = '';
        C.groupOrdersByDay(list).forEach(g => {
            const head = el('div', 'crm-order-day');
            const label = g.day ? C.relativeDay(g.day, S.today) : 'בלי תאריך';
            head.appendChild(el('h2', 'crm-label', label + ' · ' + (g.orders.length === 1 ? 'הזמנה אחת' : g.orders.length + ' הזמנות') +
                (g.chain ? ' (' + g.chain + ' רשת)' : '')));
            const all = el('button', 'crm-link-btn', 'סמן הכל');
            all.type = 'button';
            all.addEventListener('click', () => { g.orders.forEach(o => S.ordersSel.add(o.orderId)); renderOrders(); });
            head.appendChild(all);
            host.appendChild(head);
            const ul = el('ul', 'crm-order-list');
            g.orders.forEach(o => ul.appendChild(orderRow(o)));
            host.appendChild(ul);
        });
        renderOrdersBar();
    }

    function orderRow(o) {
        const li = el('li', 'crm-order-row');
        const box = el('input', 'crm-order-check');
        box.type = 'checkbox';
        box.checked = S.ordersSel.has(o.orderId);
        box.setAttribute('aria-label', 'בחירת ההזמנה ' + o.orderId);
        box.addEventListener('change', () => {
            if (box.checked) S.ordersSel.add(o.orderId); else S.ordersSel.delete(o.orderId);
            renderOrdersBar();
        });
        li.appendChild(box);
        const main = el('div', 'crm-order-main');
        main.appendChild(el('span', 'crm-row-title', o.business || o.contact || o.orderId));
        main.appendChild(el('span', 'crm-row-sub', C.orderRowSub(o)));
        const links = el('span', 'crm-order-links');
        if (o.pdf) {
            const a = el('a', 'crm-link-btn', 'PDF');
            a.href = o.pdf; a.target = '_blank'; a.rel = 'noopener';
            links.appendChild(a);
        }
        if (o.contactId && byId(o.contactId)) {
            const card = el('button', 'crm-link-btn', 'כרטיס');
            card.type = 'button';
            card.addEventListener('click', () => openCard(o.contactId));
            links.appendChild(card);
        }
        if (o.duplicate) links.appendChild(el('span', 'crm-badge crm-stage-quote', 'כפול'));
        if (links.childNodes.length) main.appendChild(links);
        li.appendChild(main);
        const side = el('div', 'crm-order-side');
        side.appendChild(el('span', 'crm-badge crm-stage-' + C.statusSlug(o.status), o.status));
        const next = C.nextStatus(o.status);
        if (next) {
            const b = el('button', 'crm-btn crm-btn-small', C.nextStatusLabel(o.status));
            b.type = 'button';
            b.setAttribute('aria-label', 'סימון ' + o.orderId + ': ' + next);
            b.addEventListener('click', () => setOrderStatus([o.orderId], next));
            side.appendChild(b);
        }
        const more = el('button', 'crm-link-btn', 'עוד');
        more.type = 'button';
        more.setAttribute('aria-expanded', String(S.ordersOpen === o.orderId));
        more.addEventListener('click', () => { S.ordersOpen = S.ordersOpen === o.orderId ? null : o.orderId; renderOrders(); });
        side.appendChild(more);
        li.appendChild(side);
        if (S.ordersOpen === o.orderId) {
            const chips = el('div', 'crm-chips crm-order-more');
            C.ORDER_STATUSES.forEach(s => {
                const c = chip(s, s === o.status);
                c.addEventListener('click', () => { S.ordersOpen = null; if (s !== o.status) setOrderStatus([o.orderId], s); else renderOrders(); });
                chips.appendChild(c);
            });
            li.appendChild(chips);
        }
        return li;
    }

    function renderOrdersBar() {
        const n = S.ordersSel.size;
        const bar = $('crm-orders-bar');
        bar.hidden = !n;
        if (!n) return;
        $('crm-orders-count').textContent = n === 1 ? 'הזמנה אחת נבחרה' : n + ' הזמנות נבחרו';
        const host = $('crm-orders-actions');
        host.textContent = '';
        [['נקלטה בריווחית', 'נקלטה'], ['סופקה', 'סופקה'], ['חשבונית הופקה', 'חשבונית'], ['בוטלה', 'בוטלה']].forEach(([s, label]) => {
            const b = chip(label, false);
            b.addEventListener('click', () => setOrderStatus(Array.from(S.ordersSel), s));
            host.appendChild(b);
        });
    }

    // מיידי בדפדפן; כשל מחזיר את הקודם. "בטל" מחזיר כל הזמנה לשלב שלה לפני השינוי.
    async function setOrderStatus(ids, status, silent) {
        if (!ids.length) return false;
        if (offline()) { toast(ERRORS.network); return false; }
        const prev = {};
        ids.forEach(id => {
            const o = S.orders.find(x => x.orderId === id);
            if (o) { prev[id] = { status: o.status, statusAt: o.statusAt }; o.status = status; }
        });
        S.ordersSel.clear();
        renderOrders();
        const res = await api('order_status', { orderIds: ids, status: status });
        if (!res.ok) {
            ids.forEach(id => { const o = S.orders.find(x => x.orderId === id); if (o && prev[id]) Object.assign(o, prev[id]); });
            renderOrders();
            if (res.error !== 'unauthorized') toast(errorText(res, 'לא נשמר — נסו שוב.'));
            return false;
        }
        ids.forEach(id => { const o = S.orders.find(x => x.orderId === id); if (o) o.statusAt = res.statusAt; });
        if (silent) return true;
        const label = ids.length === 1 ? ids[0] : ids.length + ' הזמנות';
        toast(label + ' ← ' + status + '.', 'בטל', async () => {
            const byPrev = {};
            Object.keys(prev).forEach(id => { (byPrev[prev[id].status] = byPrev[prev[id].status] || []).push(id); });
            let ok = true;
            for (const s of Object.keys(byPrev)) ok = (await setOrderStatus(byPrev[s], s, true)) && ok;
            if (ok) toast('הוחזר.');
        });
        return true;
    }
```

- [ ] **Step 3: ניווט**

(א) ב-`popstate`, להחליף את הבלוק:

```js
        const cardId = st.crm === 'card' || st.crm === 'overlay' ? st.id : null;
        if (cardId && byId(cardId)) {
            if (S.openId !== cardId || $('crm-card-view').hidden) showCard(cardId);
        } else if (S.openId || !$('crm-card-view').hidden) {
            hideCard();
        }
```

ב:

```js
        if (st.crm === 'orders') {
            if ($('crm-orders-view').hidden) showOrders();
        } else {
            if (!$('crm-orders-view').hidden) hideOrders();
            const cardId = st.crm === 'card' || st.crm === 'overlay' ? st.id : null;
            if (cardId && byId(cardId)) {
                if (S.openId !== cardId || $('crm-card-view').hidden) showCard(cardId);
            } else if (S.openId || !$('crm-card-view').hidden || $('crm-list-view').hidden) {
                hideCard();
            }
        }
```

(ב) `openFromHash` — לשמור את ה-hash לפני ה-`replaceState`. להחליף את כל הפונקציה ב:

```js
    function openFromHash() {
        const hash = location.hash;
        const m = /^#c=(.+)$/.exec(hash);
        history.replaceState({ crm: 'list' }, '', location.pathname);
        if (hash === '#orders') { openOrders(); return; }
        if (!m) return;
        const id = decodeURIComponent(m[1]);
        if (byId(id)) openCard(id);
        else toast('איש הקשר מהקישור לא נמצא.');
    }
```

(ג) ב-`init`, ליד שאר המאזינים:

```js
        $('crm-orders-btn').addEventListener('click', openOrders);
        $('crm-orders-back').addEventListener('click', () => history.back());
        $('crm-orders-refresh').addEventListener('click', loadOrders);
        $('crm-orders-clear').addEventListener('click', () => { S.ordersSel.clear(); renderOrders(); });
```

(ד) ב-`rerender`: אם מסך ההזמנות פתוח — `renderOrders()` במקום הרשימה. להחליף את:
`if (S.openId && !$('crm-card-view').hidden) renderCard();`
ב:
`if (!$('crm-orders-view').hidden) renderOrders(); else if (S.openId && !$('crm-card-view').hidden) renderCard();`

- [ ] **Step 4: `crm.css`** — בסוף:

```css
/* --- מסך הזמנות (אפיון 2026-11-17) --- */
.crm-order-day { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; margin-top: 1rem; }
.crm-order-list { list-style: none; margin: 0.3rem 0; padding: 0; }
.crm-order-row {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;
    padding: 0.5rem 0; border-bottom: 1px solid var(--crm-border);
}
.crm-order-check { width: 22px; height: 22px; flex: none; accent-color: var(--crm-primary); }
.crm-order-main { flex: 1 1 12rem; min-width: 0; display: grid; gap: 0.15rem; }
.crm-order-main .crm-row-sub { white-space: normal; }
.crm-order-links { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; font-size: 0.88rem; }
.crm-order-links .crm-link-btn { padding: 0; font-size: inherit; }
.crm-order-side { display: flex; align-items: center; gap: 0.4rem; flex: none; }
.crm-order-more { flex: 1 1 100%; padding-inline-start: 2rem; }
.crm-orders-bar {
    position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;
    padding: 0.6rem 1rem; background: var(--crm-surface); border-top: 1px solid var(--crm-border);
}
@media (max-width: 520px) {
    .crm-order-side { flex: 1 1 100%; justify-content: flex-end; }
}
```

- [ ] **Step 5: בדיקות ו-Commit**

Run: `node --check crm-f428d7/crm.js && node tools/test/crm-page.test.js | tail -1`

```bash
git add crm-f428d7
git commit -m "CRM: מסך הזמנות — סטטוס לכל הזמנה, סימון כמה, בטל"
```

---

### Task 5: אימות בדפדפן, פריסה ותיעוד

- [ ] **Step 1: כל הבדיקות** — `for t in tools/test/*.test.js; do node "$t" | tail -1; done`.

- [ ] **Step 2: בדפדפן** (`preview_start aroam-site`, `/crm-f428d7/`, ניקוי SW ו-`localStorage`, טעינת `crm-fake-api.js` לפני הכניסה, ואז כניסה עם `test-password-1234`)

- **פתיחה:** "הזמנות" בבר ⇒ המסך נפתח, הכתובת `#orders`, והפוקוס על הכותרת.
- **מסננים:** "פתוחות 4", "חדשות 2", "נקלטו 1", "סופקו 1", "הכל 5".
- **קיבוץ:** כותרת יום ("אתמול · 2 הזמנות (2 רשת)"), ו"סמן הכל" שמסמן שתיים ומציג את הבר.
- **שלב הבא:** "נקלטה" בשורה ⇒ תג "נקלטה בריווחית", הודעה עם "בטל", וקריאה `order_status` נרשמת ב-`__crmCalls`. "בטל" ⇒ חוזר ל"חדשה".
- **"עוד":** בחירת "בוטלה" ⇒ ההזמנה יוצאת מ"פתוחות".
- **סימון כמה:** "סמן הכל" ואז "סופקה" בבר ⇒ שתיהן סופקו.
- **כשל:** `__crmFailNext = true` ⇒ הסטטוס חוזר, והודעת שגיאה.
- **ניווט:** "חזור" ⇒ הרשימה. רענון על `#orders` ⇒ המסך נפתח. "כרטיס" בשורה ⇒ הכרטיס נפתח, ו"חזור" ממנו מחזיר להזמנות.
- **קישורים ותגים:** שורה עם `duplicate` מציגה "כפול". שורה בלי PDF — בלי קישור PDF.
- **הבר העליון ב-375px:** "לידים ולקוחות" ושלושת הכפתורים בלי גלישה. **אם גולש** — להעביר את "הזמנות" לתפריט "…" ולעדכן את התיעוד.
- **מסך ההזמנות ב-375px ובמצב כהה:** בלי גלישה, וניגודיות של 4.5 ומעלה.

ניקוי `localStorage`, ו-`preview_stop`.

- [ ] **Step 3: פריסת סקריפט ה-CRM (גרסה 12)** — בנוהל מסבב 104:
  1. `clone` HEAD וגרסה 11, ו-`cmp` ביניהן.
  2. `build-crm-from-cloud.js`, ובדיקת תחביר.
  3. `push`, ואז `clone` נוסף ו-`cmp` מול מה שנשלח.
  4. `create-version`, ו-`update-deployment` על אותו מזהה עם `--versionNumber 12`.
  5. **אימות:** GET ⇒ "CRM — פעיל"; `orders` בלי סיסמה ⇒ `unauthorized`.
  6. מחיקת התיקיות הזמניות.

  **שחזור:** `--versionNumber 11`.

- [ ] **Step 4: CLAUDE.md** — לעדכן:
  - **שורת הגרסאות:** `crm-core.js?v=6`, `crm.js?v=10`, `crm.css?v=7`.
  - **הסקריפט:** גרסה 12.
  - **ה-CRM ב"אזורים רגישים":** משפט על מסך ההזמנות ועל העמודה "סטטוס עודכן" בגיליון ההזמנות.
  - **סבב 107:**
    - מה נבנה, והחלטות רועי.
    - `ORDERS_STATUS_SINCE`.
    - מה אומת, ומה לא — הסיכום האמיתי מגיע רק בבוקר הבא.
    - **דורש רועי:** push; בבוקר הבא לבדוק את הסעיף בסיכום; לסמן הזמנות פתוחות במסך.

  **לא לגעת** בשינויים של סבב 106 (פייסבוק) ב-CLAUDE.md, שמגיעים מסשן אחר. להוסיף את סבב 107 אחריו, ולעשות commit רק לקבצים של הסבב הזה. אם CLAUDE.md עדיין מכיל את השינוי הלא-שמור של סבב 106 — לעשות commit רק לשורות של 107, עם `git add -p` או עם blob נפרד (כמו בסבב 90).

```bash
git commit -m "תיעוד: סבב 107 — סטטוס הזמנה ובדיקת התאמה; CRM גרסה 12"
```
