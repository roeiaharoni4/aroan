# כרטיס לקוח אחד בענן — תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** מחירי הלקוח, ההזמנה וההצעה האחרונות ולקוחות חדשים מדף הסוכן נשמרים בכרטיס ב-CRM, עם עותק במכשיר לעבודה בלי רשת, מחירון שאפשר לערוך בכרטיס ב-CRM, ומסך מעבר חד-פעמי.

**Architecture:**
- **מקור האמת:** לשונית חדשה "מחירי לקוחות" בגיליון ה-CRM, וחמש פעולות חדשות בסקריפט ה-CRM: `agent_data`, `agent_customer`, `quote`, `prices_set`, `prices_fill`.
- **דף הסוכן:** הלוגיקה הטהורה של המיזוג והתור עוברת לקובץ חדש, `js/agent-store.js`, שנבדק ב-Node. `js/agent.js` מחזיק את ה-DOM, הרשת ותור הפעולות.
- **עמוד ה-CRM:** מקבל סעיף "מחירון לקוח" בכרטיס.
- **סקריפט ההזמנות לא משתנה.**

**Tech Stack:** Google Apps Script (ES5), JavaScript בדפדפן בלי framework, בדיקות Node בלי ספריות (`assert`), clasp 3.4.1 לפריסה.

**אפיון:** `docs/superpowers/specs/2026-11-15-central-customer-card-design.md`

## Global Constraints

- כל טקסט בממשק בעברית. בלי אימוג'ים. צבעים רק מהטוקנים הקיימים (`--crm-*` בעמוד ה-CRM).
- `.gs` הוא ES5 בלבד (`var`, `function`, בלי חצים ובלי template strings). `crm-core.js` הוא ES5. `agent-store.js`, `agent.js` ו-`crm.js` יכולים להשתמש ב-ES2017.
- **אסור לשלוח בקשה אמיתית ל-Google בבדיקות בדפדפן.** חוסמים את `script.google.com` ב-fetch, ומשתמשים ב-`tools/test/crm-fake-api.js`.
- **`node --check` לא מקבל `.gs`.** בדיקת תחביר: `node -e "new Function(require('fs').readFileSync('tools/google-apps-script-crm.gs','utf8'))"`.
- **הריפו פומבי.** הסקריפט נשאר עם מצייני המקום (`PUT_...`). הבנייה לענן — `~/.aroam-crm/build-crm-from-cloud.js`. סיסמאות לא מודפסות.
- **`/care/` ו-`/emp-8c3f5a/` מושבתים** — לא נוגעים בהם, וגם לא בגרסאות שלהם.
- **הגרסאות אחרי הסבב:** `app.js?v=76` (14 דפים), `agent.js?v=9`, `agent-store.js?v=1`, `crm.js?v=8`, `crm-core.js?v=4`, `crm.css?v=6`. ה-sw לא משתנה.
- **המספרים של העסק:** `['0526000158', '036346236', '0506444290']`. לא מזהים לקוח ולא נשמרים כטלפון שלו.
- **מקורות מחיר:** `הזמנה`, `הצעה`, `ידני`, `העברה מהטלפון`. ב-`prices_set` מותרים רק `ידני` ו-`העברה מהטלפון`.
- **מספר הצעה:** `Q-YYYYMMDD-NNNN` (`generateQuoteId` ב-app.js). התבנית בבדיקה: `/^Q-\d{8}-\d{3,6}$/`.

**שתי סטיות מהאפיון (נכתבות לתוכו במשימה 5):**
1. **לקוח מקומי שמקבל "כרטיס חדש" במעבר:** המחירים עולים ב-`prices_fill` ולא ב-`prices_set`. אם ה-CRM מחזיר כרטיס קיים (`existing`), המחירים שלו לא נדרסים בעותק ישן מהטלפון.
2. **מחירים במכשיר נושאים חותמת (`pricesAt`).** בסנכרון, מחיר מה-CRM גובר, אלא אם החותמת במכשיר חדשה יותר. מחיר שקיים רק במכשיר נשאר אם החותמת שלו מ-24 השעות האחרונות — הזמנה שעוד לא הגיעה ל-CRM. זה מממש את "הכתיבה האחרונה קובעת" גם מול הזמנה שנשלחה רגע לפני הסנכרון.

---

### Task 1: לשונית "מחירי לקוחות" ולמידה מהזמנה מדף הסוכן

**Files:**
- Modify: `tools/google-apps-script-crm.gs` — קבועים אחרי `CATALOG_MAX`, `readModel_`, פונקציות חדשות אחרי `saveTasks_`, ו-`handleEvent_`.
- Test: `tools/test/crm.test.js`

**Interfaces:**
- Produces:
  - `PRICES_SHEET = 'מחירי לקוחות'`, `PRICE_KEYS = ['contactId','productId','name','price','updated','source']`.
  - `model.ps` (הלשונית) ו-`model.prices` (שורות עם `_row`).
  - `cleanPrice_(v) → number` (0 = לא תקין).
  - `priceRow_(model, contactId, productId) → row|null`.
  - `learnPrices_(model, contactId, items, source, at, opts) → number`. `items`: `[{id|productId, name, price}]`. `opts`: `{onlyMissing, allowDelete}`.
  - `savePrices_(model)`.
  - `pricesOf_(model, contactId) → [{contactId, productId, name, price, updated, source}]`.

- [ ] **Step 1: הבדיקות שנכשלות** — להוסיף ב-`crm.test.js` לפני `let failed = 0;`:

```js
// ---------- מחירי לקוחות (אפיון 2026-11-15) ----------
const priceRows = (app) => ((app.crm.sheets['מחירי לקוחות'] || { rows: [] }).rows || [])
  .slice(1).filter(r => r && r[0]);
const SL_ITEMS = [
  { id: 'חדפ014', name: 'מזלג קשיח', qty: 80, price: 4.5 },
  { id: 'ניק001', name: 'אקונומיקה', qty: 2, price: 0 }
];
const SL_EVENT = Object.assign({}, ORDER, { orderId: 'SL-20261115-111111', via: 'דף הסוכן', items: SL_ITEMS });

test('מחירים: הזמנה מדף הסוכן נלמדת לכרטיס — רק פריטים עם מחיר', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: SL_EVENT }).id;
  const rows = priceRows(app);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(rows[0].slice(0, 6), [id, 'חדפ014', 'מזלג קשיח', '4.5', '2026-11-02 10:42', 'הזמנה']);
  assert.strictEqual(app.crm.sheets['מחירי לקוחות'].rows[0][0], 'מזהה איש קשר');
  assert.strictEqual(app.crm.sheets['מחירי לקוחות'].untyped, false);
});

test('מחירים: הזמנה מהאתר לא נלמדת, וכפילות לא נלמדת שוב', () => {
  const app = loadApp();
  app.call({ action: 'event', secret: S, event: Object.assign({}, ORDER, { items: SL_ITEMS }) });
  assert.strictEqual(priceRows(app).length, 0);
  app.call({ action: 'event', secret: S, event: SL_EVENT });
  app.setNow({ date: '2026-11-03', stamp: '2026-11-03 09:00' });
  app.call({ action: 'event', secret: S, event: Object.assign({}, SL_EVENT,
    { items: [{ id: 'חדפ014', name: 'מזלג קשיח', qty: 1, price: 9 }] }) });
  assert.strictEqual(priceRows(app)[0][3], '4.5');
});

test('מחירים: הזמנה חדשה מדף הסוכן מעדכנת את אותה שורה', () => {
  const app = loadApp();
  app.call({ action: 'event', secret: S, event: SL_EVENT });
  app.setNow({ date: '2026-11-03', stamp: '2026-11-03 09:00' });
  app.call({ action: 'event', secret: S, event: Object.assign({}, SL_EVENT, { orderId: 'SL-20261115-222222',
    items: [{ id: 'חדפ014', name: 'מזלג קשיח', qty: 1, price: 5 }] }) });
  const rows = priceRows(app);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0][3], '5');
  assert.strictEqual(rows[0][4], '2026-11-03 09:00');
});
```

- [ ] **Step 2: להריץ ולראות כשל**

Run: `node tools/test/crm.test.js 2>&1 | tail -3`
Expected: `נכשלו 3 מתוך 94`.

- [ ] **Step 3: המימוש** — ב-`google-apps-script-crm.gs`:

(א) אחרי השורה `var CATALOG_MAX = 15;`:

```js
// מחירי לקוחות (אפיון 2026-11-15): שורה לכל כרטיס+מוצר. הכתיבה האחרונה קובעת.
// productId — מזהה באתר (חדפ014) או RV-<מספר פריט> לפריט מריווחית.
var PRICES_SHEET = 'מחירי לקוחות';
var PRICE_HEADERS = ['מזהה איש קשר', 'מזהה מוצר', 'מוצר', 'מחיר', 'עודכן', 'מקור'];
var PRICE_KEYS = ['contactId', 'productId', 'name', 'price', 'updated', 'source'];
var PRICE_SET_SOURCES = ['ידני', 'העברה מהטלפון'];
var PRICE_MAX = 100000;
```

(ב) `readModel_` — להחליף את כל הפונקציה:

```js
function readModel_(book) {
  var cs = sheet_(book, CONTACTS_SHEET, CONTACT_HEADERS);
  var as = sheet_(book, ACTIVITIES_SHEET, ACTIVITY_HEADERS);
  var ts = sheet_(book, TASKS_SHEET, TASK_HEADERS);
  var ps = sheet_(book, PRICES_SHEET, PRICE_HEADERS);
  return {
    cs: cs, as: as, ts: ts, ps: ps,
    contacts: readRows_(cs, CONTACT_KEYS),
    activities: readRows_(as, ACTIVITY_KEYS),
    tasks: readRows_(ts, TASK_KEYS),
    prices: readRows_(ps, PRICE_KEYS)
  };
}
```

(ג) אחרי הפונקציה `saveTasks_`:

```js
// ---------- מחירי לקוחות ----------

// מחיר תקין: חיובי ועד 100,000, מעוגל לאגורות. אחרת 0.
function cleanPrice_(v) {
  var n = Number(v);
  if (!(n > 0) || n >= PRICE_MAX) return 0;
  return Math.round(n * 100) / 100;
}

function priceRow_(model, contactId, productId) {
  for (var i = 0; i < model.prices.length; i++) {
    var p = model.prices[i];
    if (!p._deleted && p.contactId === contactId && p.productId === productId) return p;
  }
  return null;
}

// כותב מחירים לכרטיס במודל, בלי לשמור. מחיר ישן יותר מהקיים לא דורס.
// opts.onlyMissing — רק מוצרים שאין להם מחיר (prices_fill).
// opts.allowDelete — מחיר ריק או 0 מוחק את השורה (prices_set). מחזיר כמה שורות השתנו.
function learnPrices_(model, contactId, items, source, at, opts) {
  opts = opts || {};
  if (!model.prices) return 0;
  var changed = 0;
  (items || []).slice(0, 500).forEach(function (it) {
    it = it || {};
    var pid = trim_(it.productId || it.id).slice(0, 40);
    if (!pid) return;
    var price = cleanPrice_(it.price);
    var row = priceRow_(model, contactId, pid);
    if (!price) {
      if (opts.allowDelete && row) { row._deleted = true; changed++; }
      return;
    }
    var name = trim_(it.name).slice(0, 120);
    if (row) {
      if (opts.onlyMissing || trim_(row.updated) > at) return;
      row.price = String(price);
      if (name) row.name = name;
      row.updated = at;
      row.source = source;
      row._dirty = true;
    } else {
      model.prices.push({ contactId: contactId, productId: pid, name: name,
        price: String(price), updated: at, source: source });
    }
    changed++;
  });
  return changed;
}

// שורות שהשתנו — במקומן; חדשות — בסוף; שנמחקו — מלמטה למעלה, כי מחיקה מזיזה שורות
function savePrices_(model) {
  if (!model.ps) return;
  var fresh = [];
  model.prices.forEach(function (p) {
    if (p._deleted) return;
    if (p._row && p._dirty) {
      writeRows_(model.ps, p._row, [rowOf_(p, PRICE_KEYS)], PRICE_KEYS.length);
      p._dirty = false;
    } else if (!p._row) {
      fresh.push(p);
    }
  });
  var next = model.ps.getLastRow() + 1;
  fresh.forEach(function (p, i) { p._row = next + i; });
  writeRows_(model.ps, next, fresh.map(function (p) { return rowOf_(p, PRICE_KEYS); }), PRICE_KEYS.length);
  model.prices
    .filter(function (p) { return p._deleted && p._row; })
    .map(function (p) { return p._row; })
    .sort(function (a, b) { return b - a; })
    .forEach(function (r) { model.ps.deleteRow(r); });
  model.prices = model.prices.filter(function (p) { return !p._deleted; });
}

function pricesOf_(model, contactId) {
  return model.prices
    .filter(function (p) { return p.contactId === contactId; })
    .map(function (p) { return publicOf_(p, PRICE_KEYS); });
}
```

(ד) ב-`handleEvent_` — להחליף את השורה:

```js
  save_(model, [res.contact], res.attached ? [] : [res.activity]);
```

ב:

```js
  // הזמנה מדף הסוכן: המחירים שנשלחו בה הם המחירים שסוכמו עם הלקוח. מהאתר — לא:
  // בקטלוג העסקי אין מחירים, וה-price שם בא מהמחירון הכללי.
  if (ev.type === 'order' && ev.via === 'דף הסוכן') {
    learnPrices_(model, res.contact.id, ev.items, 'הזמנה', res.activity.at);
  }
  save_(model, [res.contact], res.attached ? [] : [res.activity]);
  savePrices_(model);
```

- [ ] **Step 4: להריץ ולראות שעובר**

Run: `node tools/test/crm.test.js 2>&1 | tail -1`
Expected: `כל 94 הבדיקות עברו`.

Run: `node -e "new Function(require('fs').readFileSync('tools/google-apps-script-crm.gs','utf8'))" && echo ok`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add tools/google-apps-script-crm.gs tools/test/crm.test.js
git commit -m "CRM: לשונית מחירי לקוחות — נלמדת מהזמנה מדף הסוכן"
```

---

### Task 2: `prices_set`, `prices_fill`, מחירים ב-`list`, מחיקה ומיזוג

**Files:**
- Modify: `tools/google-apps-script-crm.gs` — `handleList_`, `handleDelete_`, `handleMerge_`, ה-switch ב-`doPost`, ופונקציה חדשה `handlePricesSet_`.
- Test: `tools/test/crm.test.js`

**Interfaces:**
- Consumes: `learnPrices_`, `savePrices_`, `pricesOf_`, `priceRow_` (Task 1).
- Produces:
  - `prices_set {id, prices:[{productId, name?, price}], source}` ⇒ `{ok, changed, prices}`.
  - `prices_fill {id, prices}` ⇒ אותה תשובה.
  - **שגיאות:** `bad source`, `no prices`, `not found`.
  - **`list`:** מחזיר גם `prices: [{contactId, productId, name, price, updated, source}]`.

- [ ] **Step 1: הבדיקות שנכשלות** — להוסיף אחרי הבדיקות של Task 1:

```js
function pricedSetup() {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: SL_EVENT }).id;
  return { app, id };
}

test('prices_set: הוספה, עדכון ומחיקה; מקור ותאריך', () => {
  const { app, id } = pricedSetup();
  app.setNow({ date: '2026-11-04', stamp: '2026-11-04 12:00' });
  const r = app.call({ action: 'prices_set', password: P, id, source: 'ידני', prices: [
    { productId: 'ניק001', name: 'אקונומיקה 4 ליטר', price: '6.5' },
    { productId: 'חדפ014', price: 4.2 }] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.prices.length, 2);
  const byId = Object.fromEntries(priceRows(app).map(x => [x[1], x]));
  assert.strictEqual(byId['ניק001'][3], '6.5');
  assert.strictEqual(byId['ניק001'][4], '2026-11-04 12:00');
  assert.strictEqual(byId['ניק001'][5], 'ידני');
  assert.strictEqual(byId['חדפ014'][3], '4.2');
  assert.strictEqual(byId['חדפ014'][2], 'מזלג קשיח', 'בלי שם — נשאר השם הקודם');
  const d = app.call({ action: 'prices_set', password: P, id, source: 'ידני',
    prices: [{ productId: 'חדפ014', price: '' }] });
  assert.strictEqual(d.prices.length, 1);
  assert.deepStrictEqual(priceRows(app).map(x => x[1]), ['ניק001']);
});

test('prices_set: שגיאות — מקור, רשימה ריקה, כרטיס, סיסמה; כלום לא משתנה', () => {
  const { app, id } = pricedSetup();
  const set = (o) => app.call(Object.assign({ action: 'prices_set', password: P, id, source: 'ידני',
    prices: [{ productId: 'ניק001', price: 6 }] }, o));
  assert.strictEqual(set({ source: 'הזמנה' }).error, 'bad source');
  assert.strictEqual(set({ prices: [] }).error, 'no prices');
  assert.strictEqual(set({ id: 'C-none' }).error, 'not found');
  assert.strictEqual(set({ password: 'wrong' }).error, 'unauthorized');
  assert.strictEqual(priceRows(app).length, 1);
});

test('prices_fill: לא דורס מחיר קיים, ממלא חסר במקור העברה מהטלפון', () => {
  const { app, id } = pricedSetup();
  const r = app.call({ action: 'prices_fill', password: P, id, prices: [
    { productId: 'חדפ014', price: 3 }, { productId: 'ניק001', price: 6 }] });
  assert.strictEqual(r.ok, true);
  const byId = Object.fromEntries(priceRows(app).map(x => [x[1], x]));
  assert.strictEqual(byId['חדפ014'][3], '4.5');
  assert.strictEqual(byId['ניק001'][3], '6');
  assert.strictEqual(byId['ניק001'][5], 'העברה מהטלפון');
});

test('list: כולל את מחירי הלקוחות', () => {
  const { app, id } = pricedSetup();
  const prices = app.call({ action: 'list', password: P }).prices;
  assert.strictEqual(prices.length, 1);
  assert.strictEqual(prices[0].contactId, id);
  assert.strictEqual(prices[0].productId, 'חדפ014');
  assert.strictEqual(prices[0].price, '4.5');
});

test('מחיקת כרטיס מוחקת את המחירים שלו בלבד', () => {
  const { app, id } = pricedSetup();
  const other = app.call({ action: 'add', password: P, contact: { phone: '0529999999', name: 'אחר' } }).contact.id;
  app.call({ action: 'prices_set', password: P, id: other, source: 'ידני', prices: [{ productId: 'ניק001', price: 7 }] });
  app.call({ action: 'delete', password: P, id });
  assert.deepStrictEqual(priceRows(app).map(x => x[0]), [other]);
});

test('מיזוג: המחירים עוברים, ולאותו מוצר נשאר החדש', () => {
  const { app, id } = pricedSetup();   // חדפ014 4.5 ב-02.11
  const from = app.call({ action: 'add', password: P, contact: { phone: '0529999999', name: 'כפול' } }).contact.id;
  app.setNow({ date: '2026-11-01', stamp: '2026-11-01 08:00' });
  app.call({ action: 'prices_set', password: P, id: from, source: 'ידני', prices: [{ productId: 'ניק001', price: 6 }] });
  app.setNow({ date: '2026-11-04', stamp: '2026-11-04 08:00' });
  app.call({ action: 'prices_set', password: P, id: from, source: 'ידני', prices: [{ productId: 'חדפ014', price: 5 }] });
  app.call({ action: 'prices_set', password: P, id, source: 'ידני', prices: [{ productId: 'ניק001', price: 6.9 }] });
  app.call({ action: 'merge', password: P, from, to: id });
  const rows = priceRows(app);
  assert.ok(rows.every(x => x[0] === id), 'הכל אצל to');
  const byId = Object.fromEntries(rows.map(x => [x[1], x[3]]));
  assert.deepStrictEqual(byId, { 'חדפ014': '5', 'ניק001': '6.9' });
  assert.strictEqual(rows.length, 2);
});
```

- [ ] **Step 2: להריץ ולראות כשל**

Run: `node tools/test/crm.test.js 2>&1 | tail -1`
Expected: `נכשלו 6 מתוך 100`.

- [ ] **Step 3: המימוש**

(א) `handleList_` — להוסיף שדה אחרי `tasks: ...`:

```js
    tasks: model.tasks
      .filter(function (t) { return !t.done; })
      .map(function (t) { return publicOf_(t, TASK_KEYS); }),
    prices: model.prices.map(function (p) { return publicOf_(p, PRICE_KEYS); })
```

(ב) פונקציה חדשה אחרי `handleContacts_`:

```js
// עריכה בכרטיס ב-CRM (ידני) והמעבר מהטלפון. onlyMissing — prices_fill: רק מוצרים בלי מחיר.
function handlePricesSet_(id, prices, source, onlyMissing) {
  source = trim_(source);
  if (PRICE_SET_SOURCES.indexOf(source) < 0) return { ok: false, error: 'bad source' };
  if (!Array.isArray(prices) || !prices.length) return { ok: false, error: 'no prices' };
  var model = readModel_(book_());
  var c = contactById_(model, trim_(id));
  if (!c) return { ok: false, error: 'not found' };
  var changed = learnPrices_(model, c.id, prices, source, now_().stamp,
    { onlyMissing: !!onlyMissing, allowDelete: !onlyMissing });
  savePrices_(model);
  return { ok: true, changed: changed, prices: pricesOf_(model, c.id) };
}
```

(ג) ב-switch של `doPost`, אחרי `case 'contacts': ...`:

```js
      case 'prices_set': return json_(withLock_(function () {
        return handlePricesSet_(body.id, body.prices, body.source, false);
      }));
      case 'prices_fill': return json_(withLock_(function () {
        return handlePricesSet_(body.id, body.prices, 'העברה מהטלפון', true);
      }));
```

(ד) `handleDelete_` — להוסיף לפני `model.cs.deleteRow(c._row);`:

```js
  rowsOf(model.prices).forEach(function (r) { model.ps.deleteRow(r); });
```

(ה) `handleMerge_` — להוסיף אחרי `tasks.forEach(function (t) { t.contactId = to.id; });`:

```js
  // מחירים עוברים ל-to. לאותו מוצר בשני הכרטיסים — נשאר החדש (אפיון 2026-11-15)
  model.prices.forEach(function (p) {
    if (p.contactId !== from.id || p._deleted) return;
    var mine = priceRow_(model, to.id, p.productId);
    if (mine && trim_(mine.updated) >= trim_(p.updated)) { p._deleted = true; return; }
    if (mine) mine._deleted = true;
    p.contactId = to.id;
    p._dirty = true;
  });
```

ובאותה פונקציה, אחרי `if (tasks.length) saveTasks_(model, tasks);`:

```js
  savePrices_(model);
```

- [ ] **Step 4: להריץ ולראות שעובר**

Run: `node tools/test/crm.test.js 2>&1 | tail -1`
Expected: `כל 100 הבדיקות עברו`.

- [ ] **Step 5: Commit**

```bash
git add tools/google-apps-script-crm.gs tools/test/crm.test.js
git commit -m "CRM: prices_set ו-prices_fill, מחירים ב-list, מחיקה ומיזוג מעבירים מחירים"
```

---

### Task 3: `agent_customer` ו-`quote`

**Files:**
- Modify: `tools/google-apps-script-crm.gs` — שתי פונקציות חדשות אחרי `handlePricesSet_`, ושני cases ב-switch.
- Test: `tools/test/crm.test.js`

**Interfaces:**
- Consumes: `learnPrices_`, `savePrices_`, `itemsJson_`, `findContact_`, `nameKey_`, `blankContact_`, `OWN_PHONES`.
- Produces:
  - `agent_customer {name, phone?, contact?, address?}` ⇒ `{ok, id, existing}`. שגיאה: `name required`.
  - `quote {id, quoteId, at?, total?, items:[{id, name, qty, price, rivhit?}]}` ⇒ `{ok}` או `{ok, duplicate: true}`. שגיאות: `not found`, `bad quote`, `no items`.

- [ ] **Step 1: הבדיקות שנכשלות**

```js
test('agent_customer: כרטיס חדש בלי טלפון, מקור דף הסוכן, פעולה', () => {
  const app = loadApp();
  const r = app.call({ action: 'agent_customer', password: P, name: 'זארה', phone: '', contact: 'דנה', address: 'קניון איילון' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.existing, false);
  const data = app.call({ action: 'list', password: P });
  const c = data.contacts.find(x => x.id === r.id);
  assert.strictEqual(c.business, 'זארה');
  assert.strictEqual(c.name, 'דנה');
  assert.strictEqual(c.phone, '');
  assert.strictEqual(c.address, 'קניון איילון');
  assert.strictEqual(c.source, 'דף הסוכן');
  assert.strictEqual(c.stage, 'חדש');
  assert.strictEqual(c.followUp, '');
  assert.deepStrictEqual(data.activities.filter(a => a.contactId === r.id).map(a => a.type), ['נוצר בדף הסוכן']);
});

test('agent_customer: המספר של רועי לא נשמר; קיים לפי טלפון או לפי שם', () => {
  const app = loadApp();
  const own = app.call({ action: 'agent_customer', password: P, name: 'לקוח א', phone: '052-600-0158' });
  const list = () => app.call({ action: 'list', password: P }).contacts;
  assert.strictEqual(list().find(x => x.id === own.id).phone, '');
  const a = app.call({ action: 'agent_customer', password: P, name: 'מסעדת הגפן', phone: '0501234567' });
  const byPhone = app.call({ action: 'agent_customer', password: P, name: 'שם אחר', phone: '050-123-4567' });
  assert.strictEqual(byPhone.id, a.id);
  assert.strictEqual(byPhone.existing, true);
  const byName = app.call({ action: 'agent_customer', password: P, name: ' מסעדת  הגפן ', phone: '0547777777' });
  assert.strictEqual(byName.id, a.id);
  assert.strictEqual(app.call({ action: 'agent_customer', password: P, name: '  ' }).error, 'name required');
  assert.strictEqual(list().length, 2);
});

const QUOTE = { quoteId: 'Q-20261115-4821', at: '2026-11-15 10:00', total: 147.5,
  items: [{ id: 'חדפ014', name: 'מזלג קשיח', qty: 10, price: 4.4 },
    { id: 'RV-1500', name: 'כפפות ניטריל M', qty: 3, price: 7, rivhit: 'E400M' }] };

test('quote: פעולה בכרטיס, מחירים במקור הצעה, שלב נשלחה הצעה', () => {
  const app = loadApp();
  const id = app.call({ action: 'agent_customer', password: P, name: 'זארה' }).id;
  assert.strictEqual(app.call(Object.assign({ action: 'quote', password: P, id }, QUOTE)).ok, true);
  const data = app.call({ action: 'list', password: P });
  const a = data.activities.find(x => x.orderId === 'Q-20261115-4821');
  assert.strictEqual(a.type, 'הצעת מחיר');
  assert.strictEqual(a.at, '2026-11-15 10:00');
  assert.strictEqual(a.text, '2 פריטים · 147.50 ₪ · מדף הסוכן');
  assert.strictEqual(a.by, 'דף הסוכן');
  assert.strictEqual(JSON.parse(a.items)[1].rivhit, 'E400M');
  const c = data.contacts.find(x => x.id === id);
  assert.strictEqual(c.stage, 'נשלחה הצעה');
  assert.strictEqual(c.lastActivity, '2026-11-15 10:00');
  assert.deepStrictEqual(priceRows(app).map(x => [x[1], x[3], x[5]]),
    [['חדפ014', '4.4', 'הצעה'], ['RV-1500', '7', 'הצעה']]);
});

test('quote: לקוח נשאר לקוח; לא רלוונטי נפתח מחדש', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: ORDER }).id;
  app.call(Object.assign({ action: 'quote', password: P, id }, QUOTE));
  const stage = (x) => app.call({ action: 'list', password: P }).contacts.find(c => c.id === x).stage;
  assert.strictEqual(stage(id), 'לקוח');
  const other = app.call({ action: 'agent_customer', password: P, name: 'אחר' }).id;
  app.call({ action: 'update', password: P, id: other, fields: { stage: 'לא רלוונטי' } });
  app.call(Object.assign({ action: 'quote', password: P, id: other }, QUOTE, { quoteId: 'Q-20261115-4822' }));
  assert.strictEqual(stage(other), 'נשלחה הצעה');
});

test('quote: אותה הצעה פעמיים נרשמת פעם אחת; שגיאות; תאריך לא תקין = עכשיו', () => {
  const app = loadApp();
  const id = app.call({ action: 'agent_customer', password: P, name: 'זארה' }).id;
  const q = (o) => app.call(Object.assign({ action: 'quote', password: P, id }, QUOTE, o));
  q({});
  assert.strictEqual(q({}).duplicate, true);
  const quotes = () => app.call({ action: 'list', password: P }).activities.filter(a => a.type === 'הצעת מחיר');
  assert.strictEqual(quotes().length, 1);
  assert.strictEqual(q({ id: 'C-none', quoteId: 'Q-20261115-5000' }).error, 'not found');
  assert.strictEqual(q({ quoteId: 'ABC' }).error, 'bad quote');
  assert.strictEqual(q({ quoteId: 'Q-20261115-5001', items: [] }).error, 'no items');
  q({ quoteId: 'Q-20261115-5002', at: 'מחר' });
  assert.strictEqual(quotes().find(a => a.orderId === 'Q-20261115-5002').at, '2026-11-02 10:42');
});
```

- [ ] **Step 2: להריץ ולראות כשל**

Run: `node tools/test/crm.test.js 2>&1 | tail -1`
Expected: `נכשלו 5 מתוך 105`.

- [ ] **Step 3: המימוש** — אחרי `handlePricesSet_`:

```js
// כרטיס חדש מדף הסוכן (אפיון 2026-11-15). טלפון לא חובה. כרטיס קיים באותו טלפון או
// באותו שם מוחזר במקום כרטיס חדש — כך גם ניסיון חוזר מהתור בטלפון לא משכפל.
function handleAgentCustomer_(input) {
  input = input || {};
  var name = trim_(input.name).slice(0, 200);
  if (!name) return { ok: false, error: 'name required' };
  var phone = normalizePhone_(input.phone);
  if (OWN_PHONES.indexOf(phone) >= 0) phone = '';
  var model = readModel_(book_());
  var key = nameKey_(name);
  var dup = (phone && findContact_(model.contacts, phone, '')) ||
    model.contacts.filter(function (c) { return nameKey_(c.business || c.name) === key; })[0] || null;
  if (dup) return { ok: true, id: dup.id, existing: true };
  var now = now_();
  var c = blankContact_(now.stamp);
  c.business = name;
  c.name = trim_(input.contact).slice(0, 200);
  c.phone = phone;
  c.address = trim_(input.address).slice(0, 200);
  c.source = 'דף הסוכן';
  model.contacts.push(c);
  var a = { id: newId_('A'), contactId: c.id, at: now.stamp, type: 'נוצר בדף הסוכן',
    text: '', orderId: '', pdf: '', quoteLink: '', by: 'דף הסוכן', items: '' };
  save_(model, [c], [a]);
  return { ok: true, id: c.id, existing: false };
}

// הצעת מחיר שהודפסה בדף הסוכן. אותו quoteId פעמיים (ניסיון חוזר מהתור) — פעם אחת.
// השלב עובר ל"נשלחה הצעה" מכל שלב חוץ מ"לקוח"; התאריך "לחזור" לא משתנה.
function handleQuote_(input) {
  input = input || {};
  var model = readModel_(book_());
  var c = contactById_(model, trim_(input.id));
  if (!c) return { ok: false, error: 'not found' };
  var quoteId = trim_(input.quoteId);
  if (!/^Q-\d{8}-\d{3,6}$/.test(quoteId)) return { ok: false, error: 'bad quote' };
  for (var i = 0; i < model.activities.length; i++) {
    if (model.activities[i].orderId === quoteId) return { ok: true, duplicate: true };
  }
  var items = itemsJson_(input.items);
  if (!items) return { ok: false, error: 'no items' };
  var now = now_();
  var at = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trim_(input.at)) ? trim_(input.at) : now.stamp;
  var total = Number(input.total);
  var a = {
    id: newId_('A'), contactId: c.id, at: at, type: 'הצעת מחיר',
    text: [JSON.parse(items).length + ' פריטים', total > 0 ? total.toFixed(2) + ' ₪' : '', 'מדף הסוכן']
      .filter(Boolean).join(' · '),
    orderId: quoteId, pdf: '', quoteLink: '', by: 'דף הסוכן', items: items
  };
  model.activities.push(a);
  if (c.stage !== 'לקוח') c.stage = 'נשלחה הצעה';
  if (!c.lastActivity || at > c.lastActivity) c.lastActivity = at;
  learnPrices_(model, c.id, input.items, 'הצעה', at);
  save_(model, [c], [a]);
  savePrices_(model);
  return { ok: true };
}
```

וב-switch, אחרי `prices_fill`:

```js
      case 'agent_customer': return json_(withLock_(function () { return handleAgentCustomer_(body); }));
      case 'quote': return json_(withLock_(function () { return handleQuote_(body); }));
```

- [ ] **Step 4: להריץ ולראות שעובר**

Run: `node tools/test/crm.test.js 2>&1 | tail -1`
Expected: `כל 105 הבדיקות עברו`.

- [ ] **Step 5: Commit**

```bash
git add tools/google-apps-script-crm.gs tools/test/crm.test.js
git commit -m "CRM: agent_customer ו-quote — כרטיס חדש והצעת מחיר מדף הסוכן"
```

---

### Task 4: `agent_data` והשרת המדומה

**Files:**
- Modify: `tools/google-apps-script-crm.gs` — `handleAgentData_` אחרי `handleContacts_`, ו-case ב-switch. לעדכן את רשימת הפעולות בהערה שבראש הקובץ.
- Modify: `tools/test/crm-fake-api.js` — `db.prices`, `prices` ב-`list`, וחמש הפעולות.
- Test: `tools/test/crm.test.js`

**Interfaces:**
- Produces: `agent_data {}` ⇒

```
{ ok, contacts: [AGENT_CONTACT_KEYS],
  prices: [[contactId, productId, price, updated]],
  last: { <contactId>: { order?: {at, orderId, items}, quote?: {at, orderId, items} } },
  quotes: [{contactId, at, orderId, text, items}] }   // 50 האחרונות, החדשה קודם
```

  - הזמנה שהמספר שלה לא מתחיל ב-`SL-` מוחזרת עם `price: 0` בכל פריט, כדי ש"ההזמנה הקודמת" לא תדרוס מחיר מוסכם במחיר המחירון.
  - פעולה בלי פריטים מדולגת.

- [ ] **Step 1: הבדיקות שנכשלות**

```js
test('agent_data: לקוחות, מחירים, אחרונים והצעות — בלי פעולות', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: SL_EVENT }).id;
  app.setNow({ date: '2026-11-03', stamp: '2026-11-03 09:00' });
  app.call({ action: 'event', secret: S, event: Object.assign({}, ORDER, { orderId: 'AR-20261103-111111',
    items: [{ id: 'ניק001', name: 'אקונומיקה', qty: 1, price: 5 }] }) });
  app.call(Object.assign({ action: 'quote', password: P, id }, QUOTE));
  app.call({ action: 'order', password: P, id, order: { date: '2026-11-03', note: 'ידנית' } });
  const d = app.call({ action: 'agent_data', password: P });
  assert.strictEqual(d.ok, true);
  assert.strictEqual(d.activities, undefined);
  assert.strictEqual(d.contacts.length, 1);
  assert.ok('rivhitNo' in d.contacts[0] && !('email' in d.contacts[0]));
  assert.deepStrictEqual(d.prices.map(p => p.slice(0, 3)), [[id, 'חדפ014', '4.4'], [id, 'RV-1500', '7']]);
  assert.strictEqual(d.last[id].order.orderId, 'AR-20261103-111111');
  assert.strictEqual(d.last[id].order.items[0].price, 0);
  assert.strictEqual(d.last[id].quote.orderId, 'Q-20261115-4821');
  assert.strictEqual(d.quotes.length, 1);
  assert.strictEqual(d.quotes[0].contactId, id);
  assert.strictEqual(d.quotes[0].text, '2 פריטים · 147.50 ₪ · מדף הסוכן');
  assert.strictEqual(app.call({ action: 'agent_data' }).error, 'unauthorized');
});

test('agent_data: הזמנה מדף הסוכן — הפריטים עם המחירים', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: SL_EVENT }).id;
  const d = app.call({ action: 'agent_data', password: P });
  assert.strictEqual(d.last[id].order.orderId, 'SL-20261115-111111');
  assert.strictEqual(d.last[id].order.items[0].price, 4.5);
  assert.strictEqual(d.last[id].quote, undefined);
});
```

- [ ] **Step 2: להריץ ולראות כשל**

Run: `node tools/test/crm.test.js 2>&1 | tail -1`
Expected: `נכשלו 2 מתוך 107`.

- [ ] **Step 3: המימוש** — אחרי `handleContacts_`:

```js
// כל מה שדף הסוכן צריך, בקריאה אחת (אפיון 2026-11-15): הלקוחות, המחירים, ההזמנה
// וההצעה האחרונות של כל כרטיס, ו-50 ההצעות האחרונות לחלון "היסטוריה".
function handleAgentData_() {
  var model = readModel_(book_());
  var last = {};
  var quotes = [];
  model.activities.forEach(function (a) {
    if (!a.items || (a.type !== 'הזמנה' && a.type !== 'הצעת מחיר')) return;
    var items;
    try { items = JSON.parse(a.items); } catch (e) { return; }
    if (!items || !items.length) return;
    var key = a.type === 'הזמנה' ? 'order' : 'quote';
    // הזמנה מהאתר: המחיר בה הוא מהמחירון הכללי — "ההזמנה הקודמת" לא תדרוס מחיר מוסכם
    if (key === 'order' && String(a.orderId).indexOf('SL-') !== 0) {
      items = items.map(function (it) {
        var o = {};
        Object.keys(it).forEach(function (k) { o[k] = it[k]; });
        o.price = 0;
        return o;
      });
    }
    var slot = last[a.contactId] || (last[a.contactId] = {});
    if (!slot[key] || a.at >= slot[key].at) slot[key] = { at: a.at, orderId: a.orderId, items: items };
    if (key === 'quote') {
      quotes.push({ contactId: a.contactId, at: a.at, orderId: a.orderId, text: a.text, items: items });
    }
  });
  quotes.sort(function (x, y) { return x.at < y.at ? 1 : x.at > y.at ? -1 : 0; });
  return {
    ok: true,
    contacts: model.contacts.map(function (c) { return publicOf_(c, AGENT_CONTACT_KEYS); }),
    prices: model.prices.map(function (p) { return [p.contactId, p.productId, p.price, p.updated]; }),
    last: last,
    quotes: quotes.slice(0, 50)
  };
}
```

וב-switch: `case 'agent_data': return json_(handleAgentData_());`

**בהערה שבראש הקובץ** — בשורה של עמוד ה-CRM, להוסיף `prices_set, prices_fill`. ולהוסיף שורה:
` *  - דף הסוכן (/agent/) — עם הסיסמה: items, contacts, agent_data, agent_customer, quote, prices_fill, prices_set.`

- [ ] **Step 4: להריץ ולראות שעובר**

Run: `node tools/test/crm.test.js 2>&1 | tail -1`
Expected: `כל 107 הבדיקות עברו`.

- [ ] **Step 5: השרת המדומה** — ב-`tools/test/crm-fake-api.js`:

(א) ב-`db`, אחרי `itemsUpdated: ''`:

```js
        itemsUpdated: '',
        prices: [
            { contactId: 'C6', productId: 'חדפ006', name: 'כוסות נייר 8B - 1000 יח׳', price: '65',
              updated: at(-10), source: 'הזמנה' }
        ]
```

(ב) לפני `function handle(b)`:

```js
    const AGENT_KEYS = ['id', 'name', 'business', 'phone', 'address', 'stage', 'orders', 'lastOrder', 'rivhitNo', 'phones'];
    const agentContact = (x) => {
        const o = {};
        AGENT_KEYS.forEach(k => { o[k] = x[k] == null ? '' : String(x[k]); });
        return o;
    };
    const OWN = ['0526000158', '036346236', '0506444290'];
    const keyOf = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
    function setPrice(contactId, p, source, when, fill) {
        const pid = String(p.productId || p.id || '').trim();
        if (!pid) return;
        const i = db.prices.findIndex(x => x.contactId === contactId && x.productId === pid);
        const price = Math.round(Number(p.price) * 100) / 100;
        if (!(price > 0)) { if (!fill && source === 'ידני' && i >= 0) db.prices.splice(i, 1); return; }
        if (i >= 0 && fill) return;
        const row = { contactId: contactId, productId: pid, name: p.name || (i >= 0 ? db.prices[i].name : ''),
            price: String(price), updated: when, source: source };
        if (i >= 0) db.prices[i] = row; else db.prices.push(row);
    }
```

(ג) להחליף את ה-case הקיים `contacts` ב:

```js
            case 'contacts':
                return { ok: true, contacts: db.contacts.map(agentContact) };
```

(ד) ב-case `list` — להוסיף `prices: clone(db.prices)` לאובייקט שחוזר.

(ה) cases חדשים לפני `case 'list':`:

```js
            case 'prices_set':
            case 'prices_fill': {
                if (!c) return { ok: false, error: 'not found' };
                const fill = b.action === 'prices_fill';
                const source = fill ? 'העברה מהטלפון' : b.source;
                if (['ידני', 'העברה מהטלפון'].indexOf(source) < 0) return { ok: false, error: 'bad source' };
                if (!Array.isArray(b.prices) || !b.prices.length) return { ok: false, error: 'no prices' };
                b.prices.forEach(p => setPrice(c.id, p, source, stamp(), fill));
                return { ok: true, prices: clone(db.prices.filter(x => x.contactId === c.id)) };
            }
            case 'agent_data': {
                const last = {};
                const quotes = [];
                db.activities.forEach(a => {
                    if (!a.items || (a.type !== 'הזמנה' && a.type !== 'הצעת מחיר')) return;
                    let items;
                    try { items = JSON.parse(a.items); } catch (e) { return; }
                    if (!items || !items.length) return;
                    const key = a.type === 'הזמנה' ? 'order' : 'quote';
                    if (key === 'order' && String(a.orderId).indexOf('SL-') !== 0) {
                        items = items.map(it => Object.assign({}, it, { price: 0 }));
                    }
                    const slot = last[a.contactId] = last[a.contactId] || {};
                    if (!slot[key] || a.at >= slot[key].at) slot[key] = { at: a.at, orderId: a.orderId, items: items };
                    if (key === 'quote') quotes.push({ contactId: a.contactId, at: a.at, orderId: a.orderId, text: a.text, items: items });
                });
                quotes.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
                return { ok: true, contacts: db.contacts.map(agentContact),
                    prices: db.prices.map(p => [p.contactId, p.productId, p.price, p.updated]),
                    last: last, quotes: quotes.slice(0, 50) };
            }
            case 'agent_customer': {
                const name = String(b.name || '').trim();
                if (!name) return { ok: false, error: 'name required' };
                let phone = phoneOf(b.phone);
                if (OWN.indexOf(phone) >= 0) phone = '';
                const dup = (phone && db.contacts.find(x => x.phone === phone)) ||
                    db.contacts.find(x => keyOf(x.business || x.name) === keyOf(name));
                if (dup) return { ok: true, id: dup.id, existing: true };
                const nc = { id: nextId('C'), name: String(b.contact || '').trim(), business: name, phone: phone,
                    email: '', address: String(b.address || '').trim(), stage: 'חדש', followUp: '',
                    source: 'דף הסוכן', created: stamp(), lastActivity: stamp(), orders: '0', lastOrder: '',
                    rivhitNo: '', phones: '' };
                db.contacts.push(nc);
                db.activities.push({ id: nextId('A'), contactId: nc.id, at: stamp(), type: 'נוצר בדף הסוכן',
                    text: '', orderId: '', pdf: '', quoteLink: '', by: 'דף הסוכן', items: '' });
                return { ok: true, id: nc.id, existing: false };
            }
            case 'quote': {
                if (!c) return { ok: false, error: 'not found' };
                const qid = String(b.quoteId || '');
                if (!/^Q-\d{8}-\d{3,6}$/.test(qid)) return { ok: false, error: 'bad quote' };
                if (db.activities.some(a => a.orderId === qid)) return { ok: true, duplicate: true };
                const items = (b.items || []).filter(it => it && it.id && Number(it.qty) > 0);
                if (!items.length) return { ok: false, error: 'no items' };
                const when = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(b.at || '') ? b.at : stamp();
                const total = Number(b.total);
                db.activities.push({ id: nextId('A'), contactId: c.id, at: when, type: 'הצעת מחיר',
                    text: [items.length + ' פריטים', total > 0 ? total.toFixed(2) + ' ₪' : '', 'מדף הסוכן']
                        .filter(Boolean).join(' · '),
                    orderId: qid, pdf: '', quoteLink: '', by: 'דף הסוכן', items: JSON.stringify(items) });
                if (c.stage !== 'לקוח') c.stage = 'נשלחה הצעה';
                items.forEach(it => setPrice(c.id, it, 'הצעה', when, false));
                return { ok: true };
            }
```

`b.id` ⇒ `c` כבר נקבע בראש `handle`. ב-`prices_set` עם מחיר ריק, `setPrice` מוחק רק כש-`source` הוא `ידני` ולא `fill`, כמו בסקריפט.

- [ ] **Step 6: Commit**

```bash
git add tools/google-apps-script-crm.gs tools/test/crm.test.js tools/test/crm-fake-api.js
git commit -m "CRM: agent_data לדף הסוכן; השרת המדומה מכיר את כל הפעולות החדשות"
```

---

### Task 5: `js/agent-store.js` — המיזוג והתור, טהורים ונבדקים

**Files:**
- Create: `js/agent-store.js`
- Create: `tools/test/agent-store.test.js`
- Modify: `docs/superpowers/specs/2026-11-15-central-customer-card-design.md` — שתי הסטיות מ-Global Constraints.

**Interfaces:**
- Produces (`window.AgentStore` בדפדפן, `module.exports` ב-Node):
  - **עזרים:**
    - `OWN_PHONES`
    - `nameKey(s)`, `phoneDigits(raw)`, `isOwnPhone(raw)`, `crmLabel(c)`
    - `stampOf(date) → 'YYYY-MM-DD HH:mm'` (שעון המכשיר)
  - **פריטים ומחירים:**
    - `toLocalItems(items) → [{id, name, quantity, price}]`
    - `priceTable(rows) → {contactId: {productId: {price, at}}}`
  - **מיזוג:**
    - `mergeAgentData(list, data, activeName, opts{keepLocal, since}) → {list, activeName}`
  - **מעבר:**
    - `localOnly(list, ops) → [rec]`
    - `fillOps(list, data) → [{op:'prices_fill', body:{id, prices}}]`
  - **תור:**
    - `bindOps(ops, localId, crmId) → ops`
    - `linkLocal(list, localId, crmId) → {list, name}`
    - `mergeInto(target, local)` (משנה את `target`)
  - **היסטוריה:**
    - `quoteHistory(quotes, list) → [{id, customer, date, items, total}]`
  - **מבנה פעולה בתור:** `{op, localId?, body}`. ‏`op` הוא אחד מ-`agent_customer`, `quote`, `prices_fill`, `prices_set`.
  - **רשומת לקוח במכשיר** (שדות קיימים + חדשים):
    - `{name, phone, contact, address, notes, prices:{pid:price}, pricesAt:{pid:stamp}, orderCount, lastOrder, lastOrderAt, lastQuote, lastQuoteAt, crmId?, localId?, stage, rivhitNo}`

- [ ] **Step 1: הבדיקות שנכשלות** — `tools/test/agent-store.test.js`:

```js
/**
 * בדיקות ללוגיקה הטהורה של דף הסוכן מול ה-CRM (js/agent-store.js).
 * להרצה: node tools/test/agent-store.test.js
 */
const assert = require('assert');
const A = require('../../js/agent-store.js');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

const CONTACT = (o) => Object.assign({ id: 'C1', name: 'דנה', business: 'מסעדת הגפן', phone: '0501234567',
  address: '', stage: 'לקוח', orders: '2', lastOrder: '2026-11-01', rivhitNo: '1234', phones: '' }, o);
const DATA = (o) => Object.assign({ contacts: [CONTACT()], prices: [], last: {}, quotes: [] }, o);

test('מיזוג: לקוח מקומי מקושר לכרטיס לפי שם, ופרטים ריקים מושלמים', () => {
  const r = A.mergeAgentData([{ name: 'מסעדת הגפן', phone: '', prices: {}, orderCount: 0 }], DATA(), null, {});
  assert.strictEqual(r.list.length, 1);
  const c = r.list[0];
  assert.strictEqual(c.crmId, 'C1');
  assert.strictEqual(c.phone, '0501234567');
  assert.strictEqual(c.contact, 'דנה');
  assert.strictEqual(c.stage, 'לקוח');
  assert.strictEqual(c.rivhitNo, '1234');
  assert.strictEqual(c.orderCount, 2);
  assert.strictEqual(c.lastOrderAt, '2026-11-01');
});

test('מיזוג: כרטיס בלי לקוח במכשיר נוסף; לא משנה את הקלט', () => {
  const input = [];
  const r = A.mergeAgentData(input, DATA(), null, {});
  assert.strictEqual(input.length, 0);
  assert.strictEqual(r.list[0].name, 'מסעדת הגפן');
});

test('מיזוג: מחירי ה-CRM מחליפים; keepLocal שומר מוצרים שאין ב-CRM', () => {
  const local = [{ name: 'מסעדת הגפן', crmId: 'C1', prices: { 'חדפ014': 4, 'ניק001': 6 } }];
  const data = DATA({ prices: [['C1', 'חדפ014', '4.5', '2026-11-10 09:00']] });
  assert.deepStrictEqual(A.mergeAgentData(local, data, null, {}).list[0].prices, { 'חדפ014': 4.5 });
  assert.deepStrictEqual(A.mergeAgentData(local, data, null, { keepLocal: true }).list[0].prices,
    { 'חדפ014': 4.5, 'ניק001': 6 });
});

test('מיזוג: מחיר במכשיר עם חותמת חדשה יותר גובר; מחיר מקומי מ-24 השעות האחרונות נשאר', () => {
  const local = [{ name: 'מסעדת הגפן', crmId: 'C1', prices: { 'חדפ014': 5, 'ניק001': 6, 'ניק002': 7 },
    pricesAt: { 'חדפ014': '2026-11-15 12:00', 'ניק001': '2026-11-15 11:00', 'ניק002': '2026-11-01 08:00' } }];
  const data = DATA({ prices: [['C1', 'חדפ014', '4.5', '2026-11-15 10:00']] });
  const r = A.mergeAgentData(local, data, null, { since: '2026-11-14 12:30' }).list[0];
  assert.deepStrictEqual(r.prices, { 'חדפ014': 5, 'ניק001': 6 });
  assert.strictEqual(r.pricesAt['חדפ014'], '2026-11-15 12:00');
});

test('מיזוג: הזמנה והצעה אחרונות מה-CRM, אלא אם במכשיר חדשה יותר', () => {
  const items = [{ id: 'חדפ014', name: 'מזלג', qty: 10, price: 4.5 }];
  const data = DATA({ last: { C1: { order: { at: '2026-11-10 09:00', orderId: 'SL-1', items },
    quote: { at: '2026-11-12 09:00', orderId: 'Q-20261112-1234', items } } } });
  const older = A.mergeAgentData([{ name: 'מסעדת הגפן', lastOrder: { date: '2026-11-01', items: [] } }], data, null, {}).list[0];
  assert.strictEqual(older.lastOrder.orderId, 'SL-1');
  assert.deepStrictEqual(older.lastOrder.items, [{ id: 'חדפ014', name: 'מזלג', quantity: 10, price: 4.5 }]);
  assert.strictEqual(older.lastQuote.quoteId, 'Q-20261112-1234');
  assert.strictEqual(older.lastQuoteAt, '2026-11-12');
  const newer = A.mergeAgentData([{ name: 'מסעדת הגפן', lastOrder: { date: '2026-11-14', orderId: 'SL-2', items: [] } }], data, null, {}).list[0];
  assert.strictEqual(newer.lastOrder.orderId, 'SL-2');
});

test('מיזוג: שם שהשתנה ב-CRM מתעדכן גם בלקוח הפעיל; מזהה שנעלם נמחק; המספר של רועי יורד', () => {
  const local = [{ name: 'הגפן', crmId: 'C1', phone: '0526000158' }, { name: 'ישן', crmId: 'C9' }];
  const r = A.mergeAgentData(local, DATA(), 'הגפן', {});
  assert.strictEqual(r.list[0].name, 'מסעדת הגפן');
  assert.strictEqual(r.activeName, 'מסעדת הגפן');
  assert.strictEqual(r.list[0].phone, '0501234567');
  assert.strictEqual(r.list[1].crmId, undefined);
  const own = A.mergeAgentData([{ name: 'מסעדת הגפן', phone: '526000158' }],
    DATA({ contacts: [CONTACT({ phone: '' })] }), null, {});
  assert.strictEqual(own.list[0].phone, '');
});

test('מיזוג: שני כרטיסים באותו שם — השני מקבל תוספת', () => {
  const data = DATA({ contacts: [CONTACT(), CONTACT({ id: 'C2', name: 'יוסי', phone: '0529999999' })] });
  assert.deepStrictEqual(A.mergeAgentData([], data, null, {}).list.map(r => r.name), ['מסעדת הגפן', 'מסעדת הגפן (יוסי)']);
});

test('מעבר: לקוחות מקומיים — בלי מי שמחכה בתור; מחירים חסרים בכרטיס ⇒ prices_fill', () => {
  const list = [{ name: 'זארה', localId: 'L1' }, { name: 'קר פרי' }, { name: 'מסעדת הגפן', crmId: 'C1',
    prices: { 'חדפ014': 4, 'ניק001': 6 } }];
  const ops = [{ op: 'agent_customer', localId: 'L1', body: { name: 'זארה' } }];
  assert.deepStrictEqual(A.localOnly(list, ops).map(r => r.name), ['קר פרי']);
  const fills = A.fillOps(list, DATA({ prices: [['C1', 'חדפ014', '4.5', '2026-11-10 09:00']] }));
  assert.deepStrictEqual(fills, [{ op: 'prices_fill', body: { id: 'C1', prices: [{ productId: 'ניק001', price: 6 }] } }]);
});

test('תור: bindOps נותן מזהה לפעולות שחיכו ללקוח; linkLocal מקשר או ממזג', () => {
  const ops = [{ op: 'quote', localId: 'L1', body: { id: '', quoteId: 'Q-20261115-1111' } },
    { op: 'quote', body: { id: 'C5' } }];
  const bound = A.bindOps(ops, 'L1', 'C7');
  assert.strictEqual(bound[0].body.id, 'C7');
  assert.strictEqual(bound[1].body.id, 'C5');
  assert.strictEqual(ops[0].body.id, '', 'הקלט לא משתנה');

  const linked = A.linkLocal([{ name: 'זארה', localId: 'L1' }], 'L1', 'C7');
  assert.strictEqual(linked.list[0].crmId, 'C7');
  assert.strictEqual(linked.list[0].localId, undefined);
  assert.strictEqual(linked.name, 'זארה');

  const merged = A.linkLocal([{ name: 'גוטקס', crmId: 'C7', prices: { a: 1 } },
    { name: 'זארה', localId: 'L1', prices: { a: 2, b: 3 }, orderCount: 4 }], 'L1', 'C7');
  assert.strictEqual(merged.list.length, 1);
  assert.strictEqual(merged.name, 'גוטקס');
  assert.deepStrictEqual(merged.list[0].prices, { a: 1, b: 3 });
  assert.strictEqual(merged.list[0].orderCount, 4);
  assert.strictEqual(A.linkLocal([], 'L9', 'C1').name, null);
});

test('היסטוריה: שם הלקוח לפי הכרטיס, סכום מהטקסט או מהפריטים', () => {
  const quotes = [
    { contactId: 'C1', at: '2026-11-15 10:00', orderId: 'Q-20261115-4821', text: '2 פריטים · 1,147.50 ₪ · מדף הסוכן',
      items: [{ id: 'a', name: 'א', qty: 2, price: 3 }] },
    { contactId: 'C9', at: '2026-11-14 10:00', orderId: 'Q-20261114-1000', text: '1 פריטים · מדף הסוכן',
      items: [{ id: 'a', name: 'א', qty: 2, price: 3 }] }];
  const h = A.quoteHistory(quotes, [{ name: 'מסעדת הגפן', crmId: 'C1' }]);
  assert.deepStrictEqual(h[0], { id: 'Q-20261115-4821', customer: 'מסעדת הגפן', date: '2026-11-15',
    items: [{ id: 'a', name: 'א', quantity: 2, price: 3 }], total: 1147.5 });
  assert.strictEqual(h[1].customer, '');
  assert.strictEqual(h[1].total, 6);
});

test('עזרים: טלפון, שם וחותמת', () => {
  assert.strictEqual(A.isOwnPhone('+972 52-600-0158'), true);
  assert.strictEqual(A.isOwnPhone('03-6346236'), true);
  assert.strictEqual(A.isOwnPhone('0501234567'), false);
  assert.strictEqual(A.nameKey('  מסעדת   הגפן '), 'מסעדת הגפן');
  assert.strictEqual(A.stampOf(new Date(2026, 10, 5, 7, 3)), '2026-11-05 07:03');
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: להריץ ולראות כשל**

Run: `node tools/test/agent-store.test.js 2>&1 | tail -2`
Expected: `Cannot find module '../../js/agent-store.js'`.

- [ ] **Step 3: המימוש** — `js/agent-store.js`:

```js
/* דף הסוכן — הלוגיקה הטהורה של המאגר במכשיר מול ה-CRM (אפיון 2026-11-15).
   בלי DOM ובלי רשת, כדי שאפשר יהיה לבדוק ב-Node: node tools/test/agent-store.test.js
   ה-CRM הוא מקור האמת; המאגר במכשיר (aroam_agent_customers) הוא עותק לעבודה בלי רשת. */
(function (root) {
    'use strict';

    // המספרים של העסק עצמו — אותה רשימה כמו OWN_PHONES בסקריפט ה-CRM
    const OWN_PHONES = ['0526000158', '036346236', '0506444290'];

    function nameKey(name) {
        return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    // ספרות בלבד, בצורה מקומית (0...) — כדי להשוות מספרים שנכתבו אחרת
    function phoneDigits(raw) {
        let d = String(raw || '').replace(/\D/g, '');
        if (d.startsWith('00972')) d = d.slice(2);
        if (d.startsWith('972')) d = d.slice(3);
        if (d && !d.startsWith('0') && !d.startsWith('1')) d = '0' + d;
        return d;
    }

    function isOwnPhone(raw) { return OWN_PHONES.includes(phoneDigits(raw)); }

    function crmLabel(c) { return String((c && (c.business || c.name)) || '').trim(); }

    // אותו פורמט כמו בגיליון ה-CRM, לפי שעון המכשיר
    function stampOf(d) {
        const p = (n) => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
            ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    // פריטים מעמודת "פריטים" ב-CRM ⇒ המבנה ש-applyOrder ב-app.js מקבל
    function toLocalItems(items) {
        return (Array.isArray(items) ? items : []).filter(it => it && it.id).map(it => ({
            id: it.id,
            name: it.name || it.id,
            quantity: Number(it.qty != null ? it.qty : it.quantity) || 0,
            price: Number(it.price) > 0 ? Number(it.price) : 0
        }));
    }

    // prices של agent_data ⇒ {contactId: {productId: {price, at}}}
    function priceTable(rows) {
        const out = {};
        (rows || []).forEach(p => {
            if (!Array.isArray(p) || !p[0] || !p[1]) return;
            const price = Number(p[2]);
            if (!(price > 0)) return;
            (out[p[0]] = out[p[0]] || {})[p[1]] = { price: price, at: String(p[3] || '') };
        });
        return out;
    }

    // מחיר מה-CRM גובר, אלא אם במכשיר יש חותמת חדשה יותר. מחיר שקיים רק במכשיר
    // נשאר עם keepLocal (לפני המעבר / כשיש שינויים בתור), או אם החותמת שלו מאז since —
    // הזמנה שנשלחה רגע לפני הסנכרון ועוד לא הגיעה ל-CRM.
    function mergePrices(rec, crm, keepLocal, since) {
        const prices = {};
        const at = {};
        Object.keys(crm).forEach(pid => { prices[pid] = crm[pid].price; at[pid] = crm[pid].at; });
        const local = rec.prices || {};
        const localAt = rec.pricesAt || {};
        Object.keys(local).forEach(pid => {
            const price = Number(local[pid]);
            if (!(price > 0)) return;
            const when = localAt[pid] || '';
            if (pid in prices) {
                if (when && when > at[pid]) { prices[pid] = price; at[pid] = when; }
            } else if (keepLocal || (when && since && when >= since)) {
                prices[pid] = price;
                if (when) at[pid] = when;
            }
        });
        rec.prices = prices;
        rec.pricesAt = at;
    }

    // הזמנה/הצעה מה-CRM, אלא אם במכשיר יש חדשה יותר (נשלחה בלי רשת)
    function newerDoc(mine, doc, idKey) {
        if (!doc) return mine;
        const day = String(doc.at || '').slice(0, 10);
        if (mine && mine.date && String(mine.date) > day) return mine;
        const out = { date: day, items: toLocalItems(doc.items) };
        out[idKey] = doc.orderId || '';
        return out;
    }

    // ממזג את agent_data לתוך המאגר במכשיר. לא משנה את הקלט.
    // activeName — שם הלקוח הפעיל; חוזר מעודכן אם שם הכרטיס שלו השתנה ב-CRM.
    function mergeAgentData(list, data, activeName, opts) {
        opts = opts || {};
        const out = JSON.parse(JSON.stringify(Array.isArray(list) ? list : []));
        let active = activeName || null;
        const contacts = data && Array.isArray(data.contacts) ? data.contacts : [];
        const prices = priceTable(data && data.prices);
        const last = (data && data.last) || {};
        const seen = new Set();
        const usedNames = new Set();

        contacts.forEach(c => {
            let label = crmLabel(c);
            if (!c || !c.id || !label) return;
            seen.add(c.id);
            // שני כרטיסים באותו שם — השני מקבל תוספת, כי המאגר במכשיר מזוהה לפי שם
            if (usedNames.has(nameKey(label))) label += ` (${c.name || c.phone || c.id})`;
            usedNames.add(nameKey(label));

            let rec = out.find(r => r.crmId === c.id) ||
                out.find(r => !r.crmId && nameKey(r.name) === nameKey(label));
            if (!rec) {
                rec = { name: label, phone: '', address: '', notes: '', prices: {}, orderCount: 0 };
                out.push(rec);
            }
            if (rec.crmId === c.id && nameKey(rec.name) !== nameKey(label) &&
                !out.some(r => r !== rec && nameKey(r.name) === nameKey(label))) {
                if (active && nameKey(active) === nameKey(rec.name)) active = label;
                rec.name = label;
            }
            rec.crmId = c.id;
            delete rec.localId;
            rec.stage = c.stage || '';
            rec.rivhitNo = c.rivhitNo || '';
            if ((!rec.phone || isOwnPhone(rec.phone)) && c.phone && !isOwnPhone(c.phone)) rec.phone = c.phone;
            if (isOwnPhone(rec.phone)) rec.phone = '';
            if (!rec.contact && c.name && c.business) rec.contact = c.name;
            if (!rec.address && c.address) rec.address = c.address;

            mergePrices(rec, prices[c.id] || {}, !!opts.keepLocal, opts.since || '');

            const l = last[c.id] || {};
            rec.lastOrder = newerDoc(rec.lastOrder, l.order, 'orderId');
            const q = newerDoc(rec.lastQuote, l.quote, 'quoteId');
            if (q !== rec.lastQuote) { rec.lastQuote = q; rec.lastQuoteAt = q.date; }

            const crmLast = String(c.lastOrder || '').slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(crmLast) &&
                (!rec.lastOrderAt || crmLast > String(rec.lastOrderAt).slice(0, 10))) {
                rec.lastOrderAt = crmLast;
            }
            rec.orderCount = Math.max(Number(rec.orderCount) || 0, Number(c.orders) || 0);
        });

        // כרטיס שנמחק או מוזג ב-CRM — הלקוח נשאר במכשיר, בלי מזהה ישן
        out.forEach(r => { if (r.crmId && !seen.has(r.crmId)) delete r.crmId; });
        return { list: out, activeName: active };
    }

    // לקוחות שקיימים רק במכשיר — למסך המעבר. לקוח שכבר מחכה בתור ליצירה לא נכלל.
    function localOnly(list, ops) {
        const pending = new Set((ops || []).filter(o => o && o.op === 'agent_customer').map(o => o.localId));
        return (list || []).filter(r => r && r.name && !r.crmId && !(r.localId && pending.has(r.localId)));
    }

    // שלב 1 של המעבר: מחירים במכשיר שאין להם מחיר בכרטיס ⇒ prices_fill
    function fillOps(list, data) {
        const crm = priceTable(data && data.prices);
        const ops = [];
        (list || []).forEach(r => {
            if (!r || !r.crmId || !r.prices) return;
            const have = crm[r.crmId] || {};
            const prices = Object.keys(r.prices)
                .filter(id => !(id in have) && Number(r.prices[id]) > 0)
                .map(id => ({ productId: id, price: Number(r.prices[id]) }));
            if (prices.length) ops.push({ op: 'prices_fill', body: { id: r.crmId, prices: prices } });
        });
        return ops;
    }

    // agent_customer החזיר מזהה ⇒ הפעולות שחיכו לאותו לקוח מקבלות אותו
    function bindOps(ops, localId, crmId) {
        return (ops || []).map(o => {
            if (!o || o.localId !== localId || o.op === 'agent_customer') return o;
            return Object.assign({}, o, { body: Object.assign({}, o.body, { id: crmId }) });
        });
    }

    // שני לקוחות במכשיר ⇒ אחד. מחירי הכרטיס נשארים; מחירים שקיימים רק במקומי מתווספים.
    function mergeInto(target, local) {
        target.prices = Object.assign({}, local.prices || {}, target.prices || {});
        target.pricesAt = Object.assign({}, local.pricesAt || {}, target.pricesAt || {});
        ['lastOrder', 'lastQuote'].forEach(k => {
            const a = target[k];
            const b = local[k];
            if (b && (!a || String(b.date) > String(a.date))) target[k] = b;
        });
        ['lastOrderAt', 'lastQuoteAt'].forEach(k => {
            if (local[k] && (!target[k] || String(local[k]) > String(target[k]))) target[k] = local[k];
        });
        target.orderCount = Math.max(Number(target.orderCount) || 0, Number(local.orderCount) || 0);
        ['phone', 'contact', 'address'].forEach(k => {
            if (!target[k] && local[k] && !(k === 'phone' && isOwnPhone(local[k]))) target[k] = local[k];
        });
    }

    // agent_customer החזיר מזהה ⇒ הלקוח המקומי מקבל אותו. אם כבר יש במכשיר לקוח עם
    // הכרטיס הזה (התשובה existing) — הם מתמזגים. name = השם שנשאר, או null.
    function linkLocal(list, localId, crmId) {
        const out = JSON.parse(JSON.stringify(list || []));
        const local = out.find(r => r.localId === localId);
        if (!local) return { list: out, name: null };
        const target = out.find(r => r !== local && r.crmId === crmId);
        if (!target) {
            local.crmId = crmId;
            delete local.localId;
            return { list: out, name: local.name };
        }
        mergeInto(target, local);
        return { list: out.filter(r => r !== local), name: target.name };
    }

    // ההצעות מה-CRM ⇒ השורות של חלון "היסטוריה" ב-app.js
    function quoteHistory(quotes, list) {
        const names = {};
        (list || []).forEach(r => { if (r && r.crmId) names[r.crmId] = r.name; });
        return (quotes || []).filter(q => q && q.orderId).map(q => {
            const items = toLocalItems(q.items);
            const m = String(q.text || '').match(/([\d,]+(?:\.\d+)?) ₪/);
            const total = m ? Number(m[1].replace(/,/g, ''))
                : items.reduce((s, it) => s + it.quantity * it.price, 0);
            return { id: q.orderId, customer: names[q.contactId] || '', date: String(q.at || '').slice(0, 10),
                items: items, total: total };
        });
    }

    const AgentStore = {
        OWN_PHONES, nameKey, phoneDigits, isOwnPhone, crmLabel, stampOf, toLocalItems, priceTable,
        mergeAgentData, localOnly, fillOps, bindOps, mergeInto, linkLocal, quoteHistory
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = AgentStore;
    else root.AgentStore = AgentStore;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: להריץ ולראות שעובר**

Run: `node tools/test/agent-store.test.js 2>&1 | tail -1`
Expected: `כל 11 הבדיקות עברו`.

- [ ] **Step 5: לעדכן את האפיון** — ב-`docs/superpowers/specs/2026-11-15-central-customer-card-design.md`:

(א) בסעיף "מסך מעבר חד-פעמי", בשורה של **כרטיס חדש** — להחליף את `prices_set` ב-`prices_fill`, ולהוסיף: "כך, אם ה-CRM מחזיר כרטיס קיים, המחירים שבו לא נדרסים."

(ב) בסעיף "דף הסוכן ← סנכרון", אחרי "מבנה העותק" — להוסיף שורה:
"**חותמות:** המחירים במכשיר נושאים חותמת (`pricesAt`). מחיר מה-CRM גובר, אלא אם החותמת במכשיר חדשה יותר. מחיר שקיים רק במכשיר נשאר אם החותמת שלו מ-24 השעות האחרונות, או לפני שהמעבר הושלם, או כשיש שינויים בתור."

- [ ] **Step 6: Commit**

```bash
git add js/agent-store.js tools/test/agent-store.test.js docs/superpowers/specs/2026-11-15-central-customer-card-design.md
git commit -m "דף הסוכן: agent-store — מיזוג מול ה-CRM, תור ומעבר, עם בדיקות"
```

---

### Task 6: דף הסוכן מסתנכרן מול ה-CRM — תור פעולות, לקוח חדש והצעות

**Files:**
- Modify: `js/agent.js`
- Modify: `agent/index.html` — תגית הסקריפט של `agent-store.js` והגרסאות.

**Interfaces:**
- Consumes: `window.AgentStore` (Task 5); הפעולות `agent_data`, `agent_customer`, `quote`, `prices_fill`, `prices_set` (Tasks 2–4).
- Produces (ל-Task 7 ול-Task 8):
  - **ב-`window.AGENT`:**
    - `quoteHistory() → [{id, customer, date, items, total}]`
    - `pickByName(name)`
  - **פונקציות פנימיות:** `syncWithCrm(force) → Promise<boolean>`, `enqueueOp(op)`, `loadOps()`, `newLocalId()`.
  - **מפתחות במכשיר:**
    - `aroam_agent_crm_ops` — תור הפעולות.
    - `aroam_agent_crm_quotes` — ההצעות מה-CRM.
    - `aroam_agent_migrated_v1` — המעבר הושלם.
    - `aroam_agent_prices_filled_v1` — שלב 1 של המעבר נכנס לתור.

- [ ] **Step 1: `agent/index.html`** — להחליף את שתי השורות:

```html
    <script src="/js/app.js?v=75" defer></script>
    <script src="/js/agent.js?v=8" defer></script>
```

ב:

```html
    <script src="/js/app.js?v=76" defer></script>
    <script src="/js/agent-store.js?v=1" defer></script>
    <script src="/js/agent.js?v=9" defer></script>
```

(`app.js?v=76` מתעדכן בשאר הדפים ב-Task 7.)

- [ ] **Step 2: קבועים ועזרים ב-`js/agent.js`**

(א) להחליף את השורה `const QUOTE_KEY = 'aroam_qh_key';          // סיסמת הענן, נשמרת ע"י app.js` ב:

```js
    // ה-CRM הוא מקור האמת ללקוחות, למחירים ולהצעות (אפיון 2026-11-15)
    const CRM_OPS_KEY = 'aroam_agent_crm_ops';
    const QUOTES_KEY = 'aroam_agent_crm_quotes';
    const MIGRATED_KEY = 'aroam_agent_migrated_v1';
    const FILLED_KEY = 'aroam_agent_prices_filled_v1';
    const AS = window.AgentStore;
```

(ב) למחוק את השורה `const OWN_PHONES = [...]` ואת ההערה שמעליה.

(ג) להחליף את `function nameKey(name) {...}` (כולל ההערה שמעליה) ב:

```js
    // מפתח השוואה לשם לקוח — כדי ש"אהרוני" ו"אהרוני " לא יהיו שני לקוחות
    const nameKey = AS.nameKey;
```

(ד) להחליף את שתי הפונקציות `phoneDigits` ו-`isOwnPhone` (כולל ההערה) ב:

```js
    const phoneDigits = AS.phoneDigits;
    const isOwnPhone = AS.isOwnPhone;

    function newLocalId() {
        return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
```

(ה) למחוק את שלוש השורות שנוספו בסבב 103 בראש הקובץ, מתחת ל-`let rivhitLoaded`:
`let crmSyncedAt = 0;`, `let crmSyncing = null;`, `let crmSyncError = '';`. הן מוגדרות מחדש ב-Step 3, והגדרה כפולה של `let` היא שגיאת תחביר. הקבוע `CRM_SYNC_MS` נשאר.

- [ ] **Step 3: הסנכרון והתור** — להחליף את כל הסעיף `// ---------- לקוחות מה-CRM (15.11.26) ----------`, מתחילתו ועד לפני `// שורת המצב מעל רשימת הלקוחות בבורר` (כלומר `crmLabel`, `syncCrmContacts`, `refreshCrmContacts`), ב:

```js
    // ---------- הסנכרון מול ה-CRM (אפיון 2026-11-15) ----------
    // agent_data מביא לקוחות, מחירים, הזמנה והצעה אחרונות. שינויים מהטלפון (לקוח חדש,
    // הצעה, מחירים מהמעבר) נכנסים לתור ונשלחים לפני כל סנכרון ולפני תור ההזמנות.

    let crmSyncedAt = 0;
    let crmSyncing = null;
    let crmSyncAgain = false;
    let crmSyncError = '';      // 'unauthorized' כשהסיסמה במכשיר פגה

    const OP_ERRORS = {
        'not found': 'הכרטיס כבר לא קיים ב-CRM',
        'bad quote': 'מספר ההצעה לא תקין',
        'no items': 'אין פריטים בהצעה',
        'name required': 'חסר שם לקוח',
        'no prices': 'אין מחירים',
        'bad source': 'מקור לא תקין'
    };

    // null = כשל רשת
    async function crmCall(action, body) {
        try {
            const res = await fetch(CRM_API, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(Object.assign({ action: action, password: crmPassword() }, body || {}))
            });
            return await res.json();
        } catch (e) { return null; }
    }

    function loadOps() {
        const list = readJson(CRM_OPS_KEY, []);
        return Array.isArray(list) ? list : [];
    }
    function saveOps(list) { writeJson(CRM_OPS_KEY, list); }
    function enqueueOp(op) {
        const list = loadOps();
        list.push(op);
        saveOps(list);
    }

    // FIFO. כשל רשת, busy או סיסמה שפגה — עוצר ומנסה בסנכרון הבא; שגיאה אחרת — מדלג עם הודעה.
    async function flushCrmOps() {
        let ops = loadOps();
        if (!ops.length) return true;
        if (!crmPassword() || navigator.onLine === false) return false;
        while (ops.length) {
            const o = ops[0];
            if (o.op !== 'agent_customer' && !(o.body && o.body.id)) {
                // הלקוח שהפעולה חיכתה לו לא נוצר (הפעולה שלו נדחתה)
                toast('שינוי לא נשמר ב-CRM: הלקוח לא נוצר');
                ops.shift();
                saveOps(ops);
                continue;
            }
            const res = await crmCall(o.op, o.body);
            if (!res) return false;
            if (!res.ok) {
                if (res.error === 'unauthorized') crmSyncError = 'unauthorized';
                if (res.error === 'busy' || res.error === 'unauthorized') return false;
                toast((o.op === 'quote' ? 'הצעת מחיר לא נרשמה ב-CRM: ' : 'שינוי לא נשמר ב-CRM: ') +
                    (OP_ERRORS[res.error] || res.error));
                ops.shift();
                saveOps(ops);
                continue;
            }
            ops.shift();
            if (o.op === 'agent_customer') {
                const wasActive = ACTIVE && ACTIVE.localId === o.localId;
                const linked = AS.linkLocal(loadCustomers(), o.localId, res.id);
                saveCustomers(linked.list);
                if (linked.name && wasActive) {
                    writeJson(ACTIVE_KEY, linked.name);
                    ACTIVE = findCustomer(linked.name);
                    renderBar();
                }
                if (res.existing && linked.name) toast('קושר לכרטיס קיים ב-CRM: ' + linked.name);
                ops = AS.bindOps(ops, o.localId, res.id);
            }
            saveOps(ops);
        }
        return true;
    }

    // פרטים שהגיעו מה-CRM — רק לשדות ריקים בטופס, בלי לדרוס מה שהוקלד
    function fillEmptyFields(rec) {
        [['cust-phone', rec.phone], ['cust-contact', rec.contact], ['cust-address', rec.address]]
            .forEach(([id, v]) => {
                const el = document.getElementById(id);
                if (el && !el.value.trim() && v && !(id === 'cust-phone' && isOwnPhone(v))) el.value = v;
            });
    }

    function applyAgentData(data) {
        const migrated = readJson(MIGRATED_KEY, false) === true;
        const keepLocal = !migrated || loadOps().length > 0;
        const since = AS.stampOf(new Date(Date.now() - 86400000));
        const merged = AS.mergeAgentData(loadCustomers(), data, readJson(ACTIVE_KEY, null),
            { keepLocal: keepLocal, since: since });
        // שלב 1 של המעבר: מחירים שקיימים רק בטלפון עולים לכרטיסים המקושרים — פעם אחת
        if (readJson(FILLED_KEY, false) !== true) {
            AS.fillOps(merged.list, data).forEach(enqueueOp);
            writeJson(FILLED_KEY, true);
        }
        saveCustomers(merged.list);
        writeJson(QUOTES_KEY, Array.isArray(data.quotes) ? data.quotes : []);
        if (merged.activeName) writeJson(ACTIVE_KEY, merged.activeName);
        if (ACTIVE) {
            const fresh = findCustomer(merged.activeName || ACTIVE.name);
            if (fresh) {
                ACTIVE = fresh;
                fillEmptyFields(fresh);
                applyCustomerPrices(fresh);
            }
            renderBar();
        }
        if (!migrated) maybeShowMigration();
    }

    // ברקע, עם הסיסמה שה-CRM שמר במכשיר. כשל רשת — בשקט; המאגר במכשיר נשאר.
    // ריצה אחת בכל פעם; בקשה באמצע ריצה (force) מריצה סיבוב נוסף כשהיא נגמרת.
    async function syncWithCrm(force) {
        if (!crmPassword() || navigator.onLine === false) return false;
        if (crmSyncing) {
            if (force) crmSyncAgain = true;
            return crmSyncing;
        }
        if (!force && Date.now() - crmSyncedAt < CRM_SYNC_MS) return false;
        crmSyncing = (async () => {
            await flushCrmOps();
            await flushOutbox(true);
            const data = await crmCall('agent_data', {});
            if (!data) return false;
            if (!data.ok || !Array.isArray(data.contacts)) {
                crmSyncError = data.error || 'failed';
                return false;
            }
            crmSyncError = '';
            crmSyncedAt = Date.now();
            applyAgentData(data);
            return true;
        })();
        try {
            return await crmSyncing;
        } finally {
            crmSyncing = null;
            if (crmSyncAgain) {
                crmSyncAgain = false;
                syncWithCrm(true);
            }
        }
    }
```

(`maybeShowMigration` מוגדרת ב-Task 8. עד אז, להוסיף זמנית מתחת לפונקציה: `function maybeShowMigration() { }`. היא תוחלף ב-Task 8.)

- [ ] **Step 4: קריאות לסנכרון**

(א) ב-`openGate`, להחליף `refreshCrmContacts().then(() => {` ב-`syncWithCrm().then(() => {`.

(ב) ב-`aroam:app-ready`, להחליף את השורה `refreshCrmContacts();` ב-`syncWithCrm();`.

(ג) בסוף הקובץ, להחליף `window.addEventListener('online', () => flushOutbox());` ב:

```js
    window.addEventListener('online', () => { syncWithCrm(true); flushOutbox(); });
```

(ד) `flushOutbox` — ריצה אחת בכל פעם, כי סנכרון ואירוע `online` יכולים לקרוא לה יחד. להחליף את כל הפונקציה ב:

```js
    // FIFO. עוצר בפריט הראשון שנכשל, כדי לשמור על סדר ההזמנות. ריצה אחת בכל פעם —
    // שתי ריצות במקביל היו שולחות את אותה הזמנה פעמיים.
    let outboxFlushing = null;
    async function flushOutbox(silent) {
        if (outboxFlushing) return outboxFlushing;
        outboxFlushing = (async () => {
            const list = loadOutbox();
            if (!list.length || !navigator.onLine) return;
            let sent = 0;
            while (list.length) {
                const ok = await window.APP.postOrderPayload(list[0].payload);
                if (!ok) break;
                list.shift();
                writeJson(OUTBOX_KEY, list);
                sent++;
            }
            renderBar();
            if (sent) toast(`${sent} הזמנות ממתינות נשלחו`);
        })();
        try { return await outboxFlushing; } finally { outboxFlushing = null; }
    }
```

- [ ] **Step 5: לקוח חדש** — ב-`submitNewCustomer`, להחליף:

```js
        const rec = upsertCustomer(name, { phone: phoneEl.value.trim() });
        nameEl.value = '';
        phoneEl.value = '';
        form.style.display = 'none';
        pickCustomer(rec.name);
```

ב:

```js
        // נשמר מיד בטלפון, ונפתח כרטיס ב-CRM דרך התור — גם בלי רשת עכשיו
        const localId = newLocalId();
        const rec = upsertCustomer(name, { phone: phoneEl.value.trim(), localId: localId });
        enqueueOp({ op: 'agent_customer', localId: localId,
            body: { name: rec.name, phone: rec.phone, contact: '', address: '' } });
        nameEl.value = '';
        phoneEl.value = '';
        form.style.display = 'none';
        pickCustomer(rec.name);
        syncWithCrm(true);
```

- [ ] **Step 6: למידה מהזמנה ומהצעה**

(א) `learnFromOrder` — להחליף את כל הפונקציה ב:

```js
    function learnFromOrder(detail) {
        const name = (detail.customer && detail.customer.business) || (ACTIVE && ACTIVE.name);
        if (!name) return;

        const existing = findCustomer(name);
        const prices = Object.assign({}, (existing && existing.prices) || {});
        const pricesAt = Object.assign({}, (existing && existing.pricesAt) || {});
        const stamp = AS.stampOf(new Date());
        const items = (detail.items || []).map(it => {
            const price = parseFloat(it.price);
            if (isFinite(price) && price > 0) { prices[it.id] = price; pricesAt[it.id] = stamp; }
            return { id: it.id, name: it.name, unit: it.unit, quantity: it.qty, price: price || 0, category: it.category };
        });

        // ה-CRM לומד את אותם מחירים מההזמנה עצמה (דרך סקריפט ההזמנות); כאן העותק
        // מתעדכן מיד, כדי שבלי רשת המחיר יחול כבר בהזמנה הבאה
        const rec = upsertCustomer(name, {
            phone: [detail.customer && detail.customer.phone, existing && existing.phone]
                .find(p => p && !isOwnPhone(p)) || '',
            contact: (detail.customer && detail.customer.contact) || (existing && existing.contact) || '',
            address: (detail.customer && detail.customer.address) || (existing && existing.address) || '',
            prices: prices,
            pricesAt: pricesAt,
            lastOrder: { date: new Date().toISOString().slice(0, 10), orderId: detail.orderId, items: items },
            lastOrderAt: new Date().toISOString(),
            orderCount: ((existing && existing.orderCount) || 0) + 1
        });

        ACTIVE = rec;
        renderBar();
    }
```

(ב) `learnFromQuote` — להחליף את כל הפונקציה ב:

```js
    // הצעת מחיר מודפסת: נרשמת בכרטיס ב-CRM (פעולה, מחירים, שלב) דרך התור, והעותק
    // במכשיר מתעדכן מיד. לא מונה הזמנות — הצעה אינה הזמנה.
    function learnFromQuote(quote) {
        const name = String((quote && quote.customer) || '').trim();
        if (!name || name === 'לקוח כללי') return;

        const existing = findCustomer(name);
        const prices = Object.assign({}, (existing && existing.prices) || {});
        const pricesAt = Object.assign({}, (existing && existing.pricesAt) || {});
        const stamp = AS.stampOf(new Date());
        const items = (quote.items || []).map(it => {
            const price = parseFloat(it.price);
            if (isFinite(price) && price > 0) { prices[it.id] = price; pricesAt[it.id] = stamp; }
            return { id: it.id, name: it.name, unit: it.unit, quantity: it.quantity, price: price || 0 };
        });

        const patch = {
            prices: prices,
            pricesAt: pricesAt,
            lastQuote: { date: quote.date, quoteId: quote.id, total: quote.total, items: items },
            lastQuoteAt: new Date().toISOString()
        };
        // שם שהוקלד בהצעה ואינו ברשימה — לקוח חדש, שנפתח ב-CRM לפני ההצעה
        if (!existing || (!existing.crmId && !existing.localId)) {
            patch.localId = newLocalId();
            enqueueOp({ op: 'agent_customer', localId: patch.localId,
                body: { name: name, phone: '', contact: '', address: '' } });
        }
        const rec = upsertCustomer(name, patch);
        enqueueOp({
            op: 'quote',
            localId: rec.crmId ? undefined : rec.localId,
            body: {
                id: rec.crmId || '',
                quoteId: quote.id,
                at: stamp,
                total: Number(quote.total) || 0,
                items: (quote.items || []).map(it => ({ id: it.id, name: it.name,
                    qty: Number(it.quantity) || 0, price: Number(it.price) || 0 }))
            }
        });

        ACTIVE = rec;
        writeJson(ACTIVE_KEY, rec.name);
        renderBar();
        syncWithCrm(true);
    }
```

- [ ] **Step 7: הסרת השירות הישן**

(א) למחוק את הפונקציות `backupToCloud` ו-`restoreFromCloud`, כולל ההערות שמעליהן.

(ב) ב-`buildGate`, למחוק את השורה:
`<button type="button" class="agent-gate-btn" data-act="restore">שחזור מהענן</button>`.
ובמאזין של `.agent-gate-foot` — למחוק `else if (act === 'restore') restoreFromCloud();`.

(ג) `window.AGENT` — להחליף את הבלוק ב:

```js
    window.AGENT = {
        activeName: () => (ACTIVE ? ACTIVE.name : ''),
        crmIdFor: crmIdFor,
        rivhitHint: rivhitHint,
        refreshRivhit: refreshRivhitItems,
        rivhitDocType: rivhitDocType,
        // חלון "היסטוריה" ב-app.js: ההצעות מה-CRM (העותק מהסנכרון האחרון)
        quoteHistory: () => AS.quoteHistory(readJson(QUOTES_KEY, []), loadCustomers()),
        pickByName: (name) => {
            const rec = findCustomer(name);
            if (rec) pickCustomer(rec.name);
        }
    };
```

(ד) ב-`offlineUrls`, להוסיף `'/js/agent-store.js'` אחרי `'/js/agent.js'`.

- [ ] **Step 8: בדיקת תחביר ובדיקות קיימות**

Run: `node --check js/agent.js && node --check js/agent-store.js && grep -n "refreshCrmContacts\|syncCrmContacts\|restoreFromCloud\|backupToCloud\|QUOTE_KEY\|OWN_PHONES" js/agent.js`
Expected: בלי פלט מה-grep. (`OWN_PHONES` לא נשאר באף מקום ב-agent.js.)

Run: `for t in tools/test/*.test.js; do node "$t" | tail -1; done`
Expected: כל הקבצים עוברים.

- [ ] **Step 9: Commit**

```bash
git add js/agent.js agent/index.html
git commit -m "דף הסוכן: סנכרון מול ה-CRM — תור פעולות, לקוח חדש מיד, הצעות לכרטיס; בלי AgentQuotes"
```

---

### Task 7: app.js — היסטוריית ההצעות מה-CRM בדף הסוכן, והעלאת גרסה

**Files:**
- Modify: `js/app.js` — `saveQuote`, `getQuoteHistory`, `loadQuote`, `renderHistoryList`.
- Modify: 13 הדפים (חוץ מ-agent, care ו-emp): `app.js?v=75` ⇒ `app.js?v=76`.

**Interfaces:**
- Consumes: `window.AGENT.quoteHistory()`, `window.AGENT.pickByName(name)` (Task 6).

- [ ] **Step 1: `saveQuote`** — מיד לפני השורה `const pw = getApiPassword();` בתוך `saveQuote`:

```js
        // דף הסוכן: ההצעה נרשמת בכרטיס ב-CRM (js/agent.js, אחרי aroam:quote-saved).
        // השירות הישן (AgentQuotes) כבר לא בשימוש שם, ולא שואלים סיסמה.
        if (CONFIG.agentMode) return newQuote;
```

- [ ] **Step 2: `getQuoteHistory`** — שורה ראשונה בגוף הפונקציה:

```js
        if (CONFIG.agentMode && window.AGENT && window.AGENT.quoteHistory) return window.AGENT.quoteHistory();
```

- [ ] **Step 3: `loadQuote`** — להחליף את השורה `applyOrder(quote.items);` ב:

```js
        // ההצעה נטענת אצל הלקוח שלה — עם המחירים שלו, ואז המחירים שבהצעה
        if (CONFIG.agentMode && window.AGENT && window.AGENT.pickByName && quote.customer) {
            window.AGENT.pickByName(quote.customer);
        }
        applyOrder(quote.items);
```

- [ ] **Step 4: `renderHistoryList`** — להחליף את הבלוק מ-`if (history.length === 0) {` ועד סוף ה-`listEl.innerHTML = history.map(...).join('');` ב:

```js
        if (history.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; padding:20px; color:#999;">${CONFIG.agentMode
                ? 'עוד אין הצעות ב-CRM. הצעה שתודפס מכאן תירשם בכרטיס הלקוח.'
                : 'אין הצעות שמורות.'}</div>`;
            return;
        }

        // שמות הלקוחות מגיעים מה-CRM — טקסט בלבד, לא HTML
        const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        listEl.innerHTML = history.map(q => `
            <div class="history-item" style="border-bottom:1px solid #eee; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:bold;">${esc(q.customer || 'לקוח כללי')}</div>
                    <div style="font-size:0.85rem; color:#666;">${esc(q.date)} | ${q.items.length} פריטים</div>
                </div>
                <div style="text-align:left;">
                    <div style="font-weight:bold; color:var(--primary);">${Number(q.total || 0).toFixed(2)} ₪</div>
                    <div style="margin-top:5px;">
                        <button class="btn btn-sm btn-outline" onclick="window.APP.loadQuote('${esc(q.id)}')">טען</button>
                        ${CONFIG.agentMode ? '' : `<button class="btn btn-sm btn-danger" onclick="window.APP.deleteQuote('${esc(q.id)}')">&times;</button>`}
                    </div>
                </div>
            </div>
        `).join('');
```

- [ ] **Step 5: הגרסאות**

Run:
```bash
for f in $(grep -rl 'app\.js?v=75' . --include='*.html' | grep -v -e '^care/' -e '^emp-8c3f5a/' -e '^\./care/' -e '^\./emp-8c3f5a/'); do sed -i '' 's/app\.js?v=75/app.js?v=76/' "$f"; done
grep -rl 'app\.js?v=76' . --include='*.html' | wc -l; git status --short care emp-8c3f5a
```
Expected: `14`, ובלי שינוי ב-care וב-emp.

- [ ] **Step 6: בדיקת תחביר ו-Commit**

Run: `node --check js/app.js && echo ok`

```bash
git add js/app.js agent catalog shops-4b7e2c
git commit -m "דף הסוכן: חלון ההיסטוריה מציג את ההצעות מה-CRM; app.js v=76"
```

---

### Task 8: מסך המעבר החד-פעמי

**Files:**
- Modify: `js/agent.js` — מחליף את `maybeShowMigration` הזמנית מ-Task 6.

**Interfaces:**
- Consumes: `AS.localOnly`, `AS.mergeInto`, `enqueueOp`, `loadOps`, `newLocalId`, `syncWithCrm`, `esc`, `toast`, `renderBar`, `findCustomer`, `loadCustomers`, `saveCustomers`.

- [ ] **Step 1: המימוש** — להחליף את השורה הזמנית `function maybeShowMigration() { }` ב:

```js
    // ---------- מסך מעבר חד-פעמי (אפיון 2026-11-15) ----------
    // לקוחות שקיימים רק בטלפון: לקשר לכרטיס קיים, לפתוח כרטיס חדש או למחוק.
    // "אחר כך" סוגר בלי לסמן — המסך חוזר בפתיחה הבאה.
    let migrationShown = false;

    function maybeShowMigration() {
        if (migrationShown || readJson(MIGRATED_KEY, false) === true) return;
        if (localStorage.getItem('agent_logged_in') !== 'true') return;
        const candidates = AS.localOnly(loadCustomers(), loadOps());
        if (!candidates.length) { writeJson(MIGRATED_KEY, true); return; }
        migrationShown = true;
        showMigration(candidates);
    }

    function showMigration(candidates) {
        const cards = loadCustomers().filter(r => r.crmId)
            .sort((a, b) => a.name.localeCompare(b.name, 'he'));
        const options = cards.map(r => `<option value="link:${esc(r.crmId)}">${esc(r.name)}</option>`).join('');
        const wrap = document.createElement('div');
        wrap.id = 'agent-migrate';
        wrap.className = 'agent-gate';
        wrap.style.display = 'flex';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-labelledby', 'agent-migrate-title');
        wrap.innerHTML = `
            <div class="agent-gate-inner">
                <h2 id="agent-migrate-title" tabindex="-1">לקוחות שנמצאים רק בטלפון</h2>
                <p style="margin:0 0 1rem; opacity:0.85;">מעכשיו כל לקוח שמור בכרטיס ב-CRM. מה לעשות עם כל אחד מאלה? המחירים שלו עוברים איתו.</p>
                <div style="text-align:right; margin-bottom:1.2rem;">
                ${candidates.map((r, i) => {
                    const n = Object.keys(r.prices || {}).length;
                    const meta = [n ? `${n} מחירים` : '', r.orderCount ? `${r.orderCount} הזמנות` : '']
                        .filter(Boolean).join(' · ') || 'בלי מחירים';
                    return `<div style="display:grid; grid-template-columns:minmax(0,1fr) minmax(0,15rem); gap:0.6rem; align-items:center; padding:0.6rem 0; border-bottom:1px solid rgba(255,255,255,0.25);">
                        <label for="agent-migrate-${i}" style="display:grid; gap:0.15rem;">
                            <strong>${esc(r.name)}</strong>
                            <span style="font-size:0.85rem; opacity:0.75;">${esc(meta)}</span>
                        </label>
                        <select id="agent-migrate-${i}" style="width:100%; min-height:44px; padding:0.4rem; font-size:16px; border-radius:8px; border:0; background:#fff; color:var(--primary-dark);">
                            <option value="new">כרטיס חדש ב-CRM</option>
                            <option value="delete">למחוק מהטלפון</option>
                            ${options ? `<optgroup label="קישור לכרטיס קיים">${options}</optgroup>` : ''}
                        </select>
                    </div>`;
                }).join('')}
                </div>
                <div class="agent-gate-foot">
                    <button type="button" class="agent-gate-btn agent-gate-btn-solid" data-act="done">סיום</button>
                    <button type="button" class="agent-gate-btn" data-act="later">אחר כך</button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        document.body.classList.add('agent-gate-open');
        wrap.querySelector('#agent-migrate-title').focus();

        const close = () => {
            wrap.remove();
            if (!gateEl || gateEl.style.display === 'none') document.body.classList.remove('agent-gate-open');
        };
        wrap.querySelector('[data-act="later"]').addEventListener('click', close);
        wrap.querySelector('[data-act="done"]').addEventListener('click', () => {
            const choices = candidates.map((r, i) => wrap.querySelector('#agent-migrate-' + i).value);
            finishMigration(candidates, choices);
            close();
        });
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    }

    function finishMigration(candidates, choices) {
        const list = loadCustomers();
        let activeName = readJson(ACTIVE_KEY, null);
        candidates.forEach((cand, i) => {
            const choice = choices[i] || 'new';
            const rec = list.find(r => !r.crmId && nameKey(r.name) === nameKey(cand.name));
            if (!rec) return;
            if (choice === 'delete') {
                list.splice(list.indexOf(rec), 1);
                if (activeName && nameKey(activeName) === nameKey(rec.name)) activeName = null;
                return;
            }
            const positive = (p) => Object.keys(p || {}).filter(id => Number(p[id]) > 0);
            if (choice.indexOf('link:') === 0) {
                const crmId = choice.slice(5);
                const target = list.find(r => r.crmId === crmId);
                if (!target) return;
                const extra = positive(rec.prices).filter(id => !(target.prices && id in target.prices));
                AS.mergeInto(target, rec);
                list.splice(list.indexOf(rec), 1);
                if (extra.length) {
                    enqueueOp({ op: 'prices_fill', body: { id: crmId,
                        prices: extra.map(id => ({ productId: id, price: Number(rec.prices[id]) })) } });
                }
                if (activeName && nameKey(activeName) === nameKey(rec.name)) activeName = target.name;
                return;
            }
            // כרטיס חדש. המחירים ב-prices_fill: אם ה-CRM יחזיר כרטיס קיים, מחיריו לא יידרסו.
            rec.localId = rec.localId || newLocalId();
            enqueueOp({ op: 'agent_customer', localId: rec.localId, body: {
                name: rec.name, phone: isOwnPhone(rec.phone) ? '' : (rec.phone || ''),
                contact: rec.contact || '', address: rec.address || '' } });
            const ids = positive(rec.prices);
            if (ids.length) {
                enqueueOp({ op: 'prices_fill', localId: rec.localId, body: { id: '',
                    prices: ids.map(id => ({ productId: id, price: Number(rec.prices[id]) })) } });
            }
        });
        saveCustomers(list);
        writeJson(MIGRATED_KEY, true);
        writeJson(ACTIVE_KEY, activeName);
        ACTIVE = activeName ? findCustomer(activeName) : null;
        renderBar();
        if (!ACTIVE) openGate(false);
        toast('המעבר נשמר — מעדכן את ה-CRM...');
        syncWithCrm(true);
    }
```

- [ ] **Step 2: בדיקת תחביר**

Run: `node --check js/agent.js && echo ok`

- [ ] **Step 3: Commit**

```bash
git add js/agent.js
git commit -m "דף הסוכן: מסך מעבר חד-פעמי ללקוחות שקיימים רק בטלפון"
```

---

### Task 9: עמוד ה-CRM — "מחירון לקוח" בכרטיס

**Files:**
- Modify: `crm-f428d7/crm-core.js` — `pricesFor`, `formatPrice`, `productMatches`, ואת שלושתן לאובייקט `CrmCore`.
- Modify: `crm-f428d7/crm.js` — `S.prices`, `S.products`, `applyList`, `ERRORS`, `renderCard`, וסעיף חדש.
- Modify: `crm-f428d7/crm.css` — סעיף חדש בסוף.
- Modify: `crm-f428d7/index.html` — הגרסאות.
- Test: `tools/test/crm-page.test.js`

**Interfaces:**
- Consumes: `prices` ב-`list` ו-`prices_set` (Task 2).
- Produces:
  - `C.pricesFor(prices, contactId, names) → [{productId, name, price:number, updated, source}]`, ממוין לפי שם.
  - `C.formatPrice(n) → '4.50 ₪'`.
  - `C.productMatches(products, query, limit) → [{id, name}]`.

- [ ] **Step 1: הבדיקות שנכשלות** — ב-`tools/test/crm-page.test.js`, לפני הלולאה שמריצה את הבדיקות:

```js
test('מחירון לקוח: רק של הכרטיס, שם מהקטלוג או השמור, ממוין לפי שם', () => {
  const prices = [
    { contactId: 'C1', productId: 'ניק001', name: '', price: '6.5', updated: '2026-11-04 12:00', source: 'ידני' },
    { contactId: 'C1', productId: 'RV-1500', name: 'כפפות ניטריל M', price: '7', updated: '2026-11-03 09:00', source: 'הצעה' },
    { contactId: 'C2', productId: 'ניק001', name: '', price: '9', updated: '', source: 'ידני' }];
  const rows = C.pricesFor(prices, 'C1', { 'ניק001': 'אקונומיקה 4 ליטר' });
  assert.deepStrictEqual(rows.map(r => [r.productId, r.name, r.price]),
    [['ניק001', 'אקונומיקה 4 ליטר', 6.5], ['RV-1500', 'כפפות ניטריל M', 7]]);
  assert.strictEqual(C.formatPrice(6.5), '6.50 ₪');
});

test('חיפוש מוצר להוספת מחיר: לפי שם או מזהה מדויק, עד הגבול', () => {
  const products = [{ id: 'חדפ014', name: 'מזלג קשיח' }, { id: 'חדפ013', name: 'מזלג חד פעמי' }, { id: 'ניק001', name: 'אקונומיקה' }];
  assert.deepStrictEqual(C.productMatches(products, 'מזלג', 8).map(p => p.id), ['חדפ014', 'חדפ013']);
  assert.deepStrictEqual(C.productMatches(products, 'ניק001', 8).map(p => p.id), ['ניק001']);
  assert.strictEqual(C.productMatches(products, 'מזלג', 1).length, 1);
  assert.deepStrictEqual(C.productMatches(products, '  ', 8), []);
});
```

- [ ] **Step 2: להריץ ולראות כשל**

Run: `node tools/test/crm-page.test.js 2>&1 | tail -1`
Expected: `נכשלו 2 מתוך 22`.

- [ ] **Step 3: `crm-core.js`** — לפני `var CrmCore = {`:

```js
    // ---------- מחירון לקוח (אפיון 2026-11-15) ----------

    // המחירים של כרטיס אחד. השם מ-products.csv כשיש (names), אחרת השם שנשמר. לפי שם.
    function pricesFor(prices, contactId, names) {
        return (prices || [])
            .filter(function (p) { return p && p.contactId === contactId && Number(p.price) > 0; })
            .map(function (p) {
                return {
                    productId: p.productId,
                    name: (names && names[p.productId]) || p.name || p.productId,
                    price: Number(p.price),
                    updated: p.updated || '',
                    source: p.source || ''
                };
            })
            .sort(function (a, b) { return a.name.localeCompare(b.name, 'he'); });
    }

    function formatPrice(n) { return Number(n).toFixed(2) + ' ₪'; }

    // חיפוש מוצר להוספת מחיר: חלק מהשם, או המזהה המדויק
    function productMatches(products, query, limit) {
        var q = String(query || '').trim().toLowerCase();
        if (!q) return [];
        return (products || []).filter(function (p) {
            return p && p.id && (String(p.name || '').toLowerCase().indexOf(q) >= 0 || String(p.id).toLowerCase() === q);
        }).slice(0, limit || 8);
    }
```

ובאובייקט `CrmCore`, אחרי `taskMatchesQuery: taskMatchesQuery`:

```js
        taskMatchesQuery: taskMatchesQuery,
        pricesFor: pricesFor, formatPrice: formatPrice, productMatches: productMatches
```

Run: `node tools/test/crm-page.test.js 2>&1 | tail -1`
Expected: `כל 22 הבדיקות עברו`.

- [ ] **Step 4: `crm.js`**

(א) ב-`ERRORS`, אחרי `'too many items': ...`:

```js
        'too many items': 'יותר מ-5,000 פריטים — זה לא נראה כמו קובץ הייצוא של ריווחית.',
        'bad source': 'מקור המחיר לא תקין.',
        'no prices': 'אין מחירים לשמירה.'
```

(ב) ב-`S`, להוסיף `prices: [], products: null, productsLoading: false, pricesAll: null` (אחרי `tasks: []`).

(ג) ב-`applyList`, אחרי `S.tasks = data.tasks || [];`: `S.prices = data.prices || [];`.

(ד) ב-`renderCard`, אחרי `host.appendChild(ordersBlock(c));`:

```js
        host.appendChild(pricesBlock(c));
        // שמות המוצרים מ-products.csv, פעם אחת
        if (S.products === null && !S.productsLoading) {
            S.productsLoading = true;
            ensureProducts().then(() => { if (S.openId) rerender(); });
        }
```

(ה) סעיף חדש אחרי `cancelOrderButton` (לפני `// ---------- משימות ----------`):

```js
    // ---------- מחירון לקוח (אפיון 2026-11-15) ----------
    // המחירים שסוכמו עם הלקוח. נלמדים לבד מהזמנות ומהצעות בדף הסוכן, ונערכים כאן.
    const PRICES_SHOWN = 20;

    async function ensureProducts() {
        if (S.products) return S.products;
        try {
            const res = await fetch('/data/products.csv?t=' + Date.now(), { cache: 'no-store' });
            S.products = res.ok
                ? R.parseCsv(await res.text()).filter(p => p.id && p.name).map(p => ({ id: p.id, name: p.name }))
                : [];
        } catch (e) { S.products = []; }
        return S.products;
    }

    function productNames() {
        const m = {};
        (S.products || []).forEach(p => { m[p.id] = p.name; });
        return m;
    }

    function pricesBlock(c) {
        const wrap = el('div', 'crm-prices');
        const rows = C.pricesFor(S.prices, c.id, productNames());
        wrap.appendChild(el('h2', 'crm-label', 'מחירון לקוח · ' +
            (rows.length === 1 ? 'מוצר אחד' : rows.length + ' מוצרים')));
        if (!rows.length) {
            wrap.appendChild(el('p', 'crm-hint', 'עוד אין מחירים מוסכמים. הם נשמרים לבד מהזמנות ומהצעות בדף הסוכן.'));
        }
        const all = S.pricesAll === c.id;
        const ul = el('ul', 'crm-price-list');
        rows.slice(0, all ? rows.length : PRICES_SHOWN).forEach(p => ul.appendChild(priceRow(c, p)));
        wrap.appendChild(ul);
        if (rows.length > PRICES_SHOWN && !all) {
            const more = el('button', 'crm-link-btn', 'הצג הכל (' + rows.length + ')');
            more.type = 'button';
            more.addEventListener('click', () => { S.pricesAll = c.id; rerender(); });
            wrap.appendChild(more);
        }
        const add = el('button', 'crm-btn crm-btn-small', 'הוספת מחיר');
        add.type = 'button';
        add.addEventListener('click', () => openPriceAdd(c, wrap));
        wrap.appendChild(add);
        return wrap;
    }

    function priceRow(c, p) {
        const li = el('li', 'crm-price-row');
        const main = el('div', 'crm-price-main');
        main.appendChild(el('span', 'crm-price-name', p.name));
        const meta = [p.updated ? C.formatStamp(p.updated) : '', p.source].filter(Boolean).join(' · ');
        if (meta) main.appendChild(el('span', 'crm-price-meta', meta));
        li.appendChild(main);
        const val = el('button', 'crm-price-value', C.formatPrice(p.price));
        val.type = 'button';
        val.setAttribute('aria-label', 'עריכת המחיר של ' + p.name + ': ' + C.formatPrice(p.price));
        val.addEventListener('click', () => editPrice(li, c, p));
        li.appendChild(val);
        const del = el('button', 'crm-link-btn', 'מחיקה');
        del.type = 'button';
        del.setAttribute('aria-label', 'מחיקת המחיר של ' + p.name);
        del.addEventListener('click', () => deletePrice(c, p));
        li.appendChild(del);
        return li;
    }

    // טופס מחיר אחד: שדה מספר, שמירה וביטול. onSave(price) מחזיר Promise<boolean>.
    function priceForm(label, value, onSave) {
        const form = el('form', 'crm-price-edit');
        form.appendChild(el('span', 'crm-price-name', label));
        const input = el('input', 'crm-input crm-price-input');
        input.type = 'number';
        input.step = '0.01';
        input.min = '0.01';
        input.inputMode = 'decimal';
        if (value) input.value = String(value);
        input.setAttribute('aria-label', 'מחיר ל' + label);
        const ok = el('button', 'crm-btn crm-btn-small', 'שמירה');
        ok.type = 'submit';
        const cancel = el('button', 'crm-link-btn', 'ביטול');
        cancel.type = 'button';
        cancel.addEventListener('click', rerender);
        form.append(input, ok, cancel);
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const price = Number(input.value);
            if (!(price > 0)) { toast('המחיר לא תקין.'); input.focus(); return; }
            ok.disabled = true;
            if (!(await onSave(price))) ok.disabled = false;
        });
        setTimeout(() => { input.focus(); input.select(); }, 0);
        return form;
    }

    function editPrice(li, c, p) {
        li.textContent = '';
        li.appendChild(priceForm(p.name, p.price, async (price) => {
            const ok = await savePrices(c, [{ productId: p.productId, name: p.name, price: price }]);
            if (ok) toast('המחיר נשמר.');
            return ok;
        }));
    }

    // prices_set, ואז המחירים של הכרטיס מוחלפים בתשובה. כשל — הודעה והמחיר הקודם חוזר.
    async function savePrices(c, prices) {
        if (offline()) { toast(ERRORS.network); rerender(); return false; }
        const res = await api('prices_set', { id: c.id, prices: prices, source: 'ידני' });
        if (!res.ok) {
            if (res.error !== 'unauthorized') toast(errorText(res, 'לא נשמר — נסו שוב.'));
            rerender();
            return false;
        }
        S.prices = S.prices.filter(x => x.contactId !== c.id).concat(res.prices || []);
        rerender();
        return true;
    }

    async function deletePrice(c, p) {
        if (!(await savePrices(c, [{ productId: p.productId, price: '' }]))) return;
        toast('המחיר של ' + p.name + ' נמחק.', 'בטל', () => {
            savePrices(c, [{ productId: p.productId, name: p.name, price: p.price }])
                .then(ok => { if (ok) toast('המחיר הוחזר.'); });
        });
    }

    function openPriceAdd(c, wrap) {
        const open = wrap.querySelector('.crm-price-add input');
        if (open) { open.focus(); return; }
        const box = el('div', 'crm-price-add');
        const search = el('input', 'crm-input');
        search.type = 'search';
        search.placeholder = 'חיפוש מוצר…';
        search.setAttribute('aria-label', 'חיפוש מוצר להוספת מחיר');
        const results = el('ul', 'crm-price-results');
        box.append(search, results);
        wrap.appendChild(box);
        search.focus();
        const show = () => {
            results.textContent = '';
            C.productMatches(S.products, search.value, 8).forEach(pr => {
                const li = el('li');
                const b = el('button', 'crm-link-btn', pr.name);
                b.type = 'button';
                b.addEventListener('click', () => {
                    box.textContent = '';
                    box.appendChild(priceForm(pr.name, '', async (price) => {
                        const ok = await savePrices(c, [{ productId: pr.id, name: pr.name, price: price }]);
                        if (ok) toast('המחיר נשמר.');
                        return ok;
                    }));
                });
                li.appendChild(b);
                results.appendChild(li);
            });
        };
        search.addEventListener('input', show);
        ensureProducts().then(show);
    }
```

- [ ] **Step 5: `crm.css`** — בסוף הקובץ:

```css
/* --- מחירון לקוח בכרטיס (אפיון 2026-11-15) --- */
.crm-prices { margin-top: 0.4rem; }
.crm-price-list, .crm-price-results { list-style: none; margin: 0.4rem 0; padding: 0; }
.crm-price-row, .crm-price-edit {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;
    padding: 0.4rem 0; border-bottom: 1px solid var(--crm-border);
}
.crm-price-main { flex: 1 1 12rem; min-width: 0; display: grid; gap: 0.1rem; }
.crm-price-name { overflow-wrap: anywhere; }
.crm-price-edit .crm-price-name { flex: 1 1 12rem; min-width: 0; }
.crm-price-meta { font-size: 0.8rem; color: var(--crm-muted); }
.crm-price-value {
    min-height: 40px; padding: 0.3rem 0.7rem; border: 1px solid var(--crm-border); border-radius: 8px;
    background: var(--crm-surface); color: var(--crm-text); font: inherit; font-weight: 700; cursor: pointer;
}
.crm-price-input { max-width: 7rem; }
.crm-price-add { margin-top: 0.4rem; }
```

- [ ] **Step 6: `crm-f428d7/index.html`** — `crm-core.js?v=3` ⇒ `v=4`, `crm.js?v=7` ⇒ `v=8`, `crm.css?v=5` ⇒ `v=6`.

- [ ] **Step 7: בדיקות ו-Commit**

Run: `node --check crm-f428d7/crm.js && node tools/test/crm-page.test.js | tail -1`
Expected: `כל 22 הבדיקות עברו`.

```bash
git add crm-f428d7 tools/test/crm-page.test.js
git commit -m "CRM: מחירון לקוח בכרטיס — עריכה, מחיקה עם בטל, הוספה בחיפוש"
```

---

### Task 10: אימות בדפדפן, פריסה ותיעוד

**Files:**
- Modify: `CLAUDE.md` — שורת הגרסאות, גרסת סקריפט ה-CRM, תיאור דף הסוכן ב"אזורים רגישים", וסבב 104.

- [ ] **Step 1: כל הבדיקות**

Run: `for t in tools/test/*.test.js; do printf "%s: " "$t"; node "$t" | tail -1; done`
Expected: כל הקבצים עוברים.

- [ ] **Step 2: דף הסוכן בדפדפן מול השרת המדומה** (`preview_start` ‏`aroam-site`, `http://localhost:8085/agent/`)

הכנה בקונסול:
1. ניקוי SW ו-caches, `localStorage.clear()`.
2. `agent_logged_in = 'true'`.
3. זריעת `aroam_agent_customers`:
   - "משרדי אלפא": `prices {'חדפ014': 4}`.
   - "זארה": `phone '0526000158'`, `prices {'חדפ014': 4.5}`, `orderCount 1`.
   - "לקוח למחיקה".
4. רענון.

אחרי הטעינה:
1. טעינת `/tools/test/crm-fake-api.js`.
2. עטיפת fetch שחוסמת כל בקשה ל-`script.google.com` בלי `action`, ושומרת אותה ב-`window.__orders`.
3. `aroam_crm_key = 'test-password-1234'`.
4. לחיצה על "החלף לקוח".

לבדוק:
- **אחרי הסנכרון:**
  - ב-`__crmCalls` יש `prices_fill` ל-C6 עם `חדפ014`, ואחריו `agent_data`.
  - ב"משרדי אלפא" יש `crmId: 'C6'`, והמחירים הם `{'חדפ006': 65, 'חדפ014': 4}`.
- **מסך המעבר:**
  - נפתח עם "זארה" ו"לקוח למחיקה".
  - בחירה: זארה ← קישור ל"גן שושנים", לקוח למחיקה ← מחיקה. ואז "סיום".
  - התוצאה: `prices_fill` ל-C5 עם `חדפ014: 4.5`; "זארה" ו"לקוח למחיקה" נעלמו מהמאגר; `aroam_agent_migrated_v1 = true`.
- **לקוח חדש:** "+ לקוח חדש" בשם "בדיקה חדשה" ⇒ `agent_customer` ב-`__crmCalls`, והלקוח מקבל `crmId` (`C1xx`).
- **הצעת מחיר:**
  - `window.APP.applyOrder([{id:'חדפ014', quantity:2, price:4.5}])`, ואז "הדפסה".
  - `window.prompt` מוחלף ב-`() => 'בדיקה חדשה'`, ו-`window.print` ב-noop.
  - ב-`__crmCalls` יש `quote` עם ה-`id` של הכרטיס.
  - בחלון "היסטוריה" מופיעה ההצעה, ובלי כפתור ×.
  - "טען" בוחר את הלקוח.
- **בלי רשת:**
  - `window.__crmOffline = true`, ואז לקוח חדש — נכנס לתור (`aroam_agent_crm_ops`).
  - `__crmOffline = false`, ואז `dispatchEvent(new Event('online'))` — התור מתרוקן.
- **הזמנה:** הזמנה ללקוח מקושר ⇒ ב-`__orders` יש `customer.crmId`.
- **בלי דליפה:** `read_network_requests` עם `script.google` ⇒ אין בקשות.
- **מובייל:** 375px — מסך המעבר והבורר בלי גלישה אופקית. ביטול transition לפני מדידה.

- [ ] **Step 3: עמוד ה-CRM בדפדפן** (`/crm-f428d7/`, עם `crm-fake-api.js` לפני הכניסה)

- **הצגה:** כרטיס "משרדי אלפא" ⇒ "מחירון לקוח · מוצר אחד", "כוסות נייר 8B - 1000 יח׳", ו-65.00 ₪.
- **עריכה:** לחיצה על המחיר ⇒ 66 ⇒ שמירה ⇒ "המחיר נשמר.", ו-`prices_set` נרשם ב-`__crmCalls`.
- **מחיקה:** "מחיקה" ⇒ ההודעה עם "בטל" ⇒ "בטל" ⇒ "המחיר הוחזר.", והשורה חוזרת.
- **הוספה:** "הוספת מחיר" ⇒ חיפוש "מזלג" ⇒ בחירה ⇒ 4.4 ⇒ שמירה ⇒ השורה מופיעה.
- **כשל:** `window.__crmFailNext = true` ⇒ שמירה ⇒ הודעת שגיאה, והמחיר הקודם חוזר.
- **מצב כהה ו-375px:** ניגודיות הטקסט 4.5 ומעלה, ובלי גלישה.

- [ ] **Step 4: רגרסיה**

- **`/catalog/`:**
  - `app.js?v=76` נטען.
  - שליחה בלי טלפון עדיין נחסמת.
  - אין כפתור היסטוריה ואין קריאה ל-AgentQuotes.
- **`/shops-4b7e2c/`:** השער והבורר עובדים.

אחר כך — ניקוי `localStorage`, SW ו-caches, ו-`preview_stop`.

- [ ] **Step 5: פריסת סקריפט ה-CRM (גרסה 11)** — בנוהל מ-CLAUDE.md:

```bash
SP=/private/tmp/claude-503/-Users-roeiaharoni--claude-spares-spare-vspxRg/69c93b58-b9ec-4a89-b7df-504b4c254d20/scratchpad; mkdir -p $SP/crm-head $SP/crm-dep
cd $SP/crm-head && npx -y @google/clasp@3.4.1 clone 1HtNPX2wXuHZSMTwDQYJ_dDvtSi0M6dS6Pd4-d5F5jAd3orXDSIxnUtzd --rootDir .
cd $SP/crm-dep && npx -y @google/clasp@3.4.1 clone 1HtNPX2wXuHZSMTwDQYJ_dDvtSi0M6dS6Pd4-d5F5jAd3orXDSIxnUtzd 10 --rootDir .
cmp $SP/crm-head/Code.js $SP/crm-dep/Code.js   # HEAD == גרסה 10
node ~/.aroam-crm/build-crm-from-cloud.js $SP/crm-dep $SP/crm-head
node -e "new Function(require('fs').readFileSync('$SP/crm-head/Code.js','utf8'))"
cd $SP/crm-head && npx -y @google/clasp@3.4.1 push --force
npx -y @google/clasp@3.4.1 create-version "מחירי לקוחות, agent_data, agent_customer, quote, prices_set/fill"
npx -y @google/clasp@3.4.1 update-deployment AKfycbzs-jtpiy0yH6MnGjy_B2wULKZ56fpQ67UgtCDDPe9o0IZH_gjYb36RBqW7vVt8wGRcbw --versionNumber 11
npx -y @google/clasp@3.4.1 list-deployments
rm -rf $SP/crm-head $SP/crm-dep
```

**אימות:**
- GET ⇒ "CRM — פעיל".
- `agent_data` בלי סיסמה ⇒ `unauthorized`.
- `event` עם סוד שגוי ⇒ `unauthorized`.

**שחזור:** `update-deployment <מזהה> --versionNumber 10`.

- [ ] **Step 6: CLAUDE.md** — לעדכן:
- **שורת הגרסאות:** `app.js?v=76`, `agent.js?v=9`, `agent-store.js?v=1` (חדש, רק ב-`/agent/`), `crm-core.js?v=4`, `crm.js?v=8`, `crm.css?v=5` ⇒ `v=6`.
- **גרסת סקריפט ה-CRM:** 11, עם תיאור קצר.
- **דף הסוכן ב"אזורים רגישים":** משפט על הסנכרון מול ה-CRM ועל המעבר.
- **ה-CRM ב"אזורים רגישים":** משפט על לשונית "מחירי לקוחות".
- **סבב 104:**
  - מה נבנה, וההחלטות של רועי.
  - שתי הסטיות.
  - מה אומת, ומה לא — מסך המעבר בטלפון של רועי.
  - **דורש רועי:** push; לפתוח את דף הסוכן בטלפון ולעבור על מסך המעבר; לכבות את הפריסה של AgentQuotes אחרי המעבר.

```bash
git add CLAUDE.md
git commit -m "תיעוד: סבב 104 — כרטיס לקוח אחד בענן; CRM גרסה 11"
```
