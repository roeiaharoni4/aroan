# פריטים מריווחית בדף הסוכן — תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** בדף הסוכן אפשר לחפש ולהזמין גם פריטים שקיימים רק בריווחית, וקובצי הקליטה לריווחית (במייל ובכרטיס ה-CRM) כוללים אותם עם המק"ט שלהם.

**Architecture:**
- רשימת הפריטים (מספר ושם בלבד) נשמרת בלשונית חדשה בגיליון ה-CRM, ושתי פעולות מוגנות בסיסמה קוראות וכותבות אותה.
- רועי מעלה את קובץ הייצוא מתפריט ה-CRM. הקובץ נקרא בדפדפן, כך שמחירי העלות לא יוצאים מהמכשיר.
- דף הסוכן מוריד את הרשימה עם הסיסמה שה-CRM שמר במכשיר, שומר עותק לעבודה בלי רשת, ומוסיף את הפריטים ל-`PRODUCTS` עם הדגל `fromRivhit`. ‏`app.js` מציג אותם רק בחיפוש.
- פריט כזה נשלח בהזמנה עם `rivhit`, ו-`siteOrderDocument` משתמש בשדה הזה כשאין למוצר מק"ט ב-`products.csv`.

**Tech Stack:** HTML/CSS/JS סטטי (בלי framework); Google Apps Script (clasp 3.4.1); בדיקות Node בלי ספריות (`node tools/test/*.test.js`).

**אפיון:** `docs/superpowers/specs/2026-11-09-rivhit-items-in-agent-design.md`

## Global Constraints

- הריפו פומבי. בקבצים שנכנסים לקומיט אין סיסמאות, סודות או מזהי גיליונות של ה-CRM: רק מצייני המקום `PUT_..._HERE` שכבר קיימים.
- בדיקות בדפדפן רק עם `fetch` ו-`window.open` מיורטים. אין לשלוח הזמנה, ליד או משימה אמיתיים, ואין להשתמש בסיסמת הייצור של ה-CRM.
- לפני רענון בבדיקה מקומית מוחקים את `aroam_crm_key` מ-`localStorage`. אחרת הדף פונה לשרת האמיתי עם סיסמת הבדיקה.
- את ה-push עושה רועי ב-GitHub Desktop. ‏Claude עושה commit בלבד, ומוסיף לקומיט רק קבצים שהוא שינה (לא `git add -A`).
- כל הודעת commit מסתיימת ב-`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- בלי אימוג'ים. צבעים רק מהטוקנים הקיימים (`--text-secondary` ב-style.css).
- סדר הפריסה מחייב: CRM גרסה 6 ← הזמנות גרסה 13 ← push של האתר ← רועי מעלה את `פריטים.csv`.
- גרסאות:
  - `app.js?v=71` ב-16 דפים, ו-`style.css?v=46` ב-17 דפים.
  - `agent.js?v=4`.
  - `crm.js?v=5`, ו-`rivhit-core.js?v=2` בעמוד ה-CRM.
  - sw `aroam-cache-v67`.
  - `crm.css` לא משתנה.

## סטיות מכוונות מהאפיון

1. `updated` הוא `now_().stamp` (‏`yyyy-MM-dd HH:mm`) ולא ISO. כך הוא מוצג ב-`C.formatStamp` כמו שאר התאריכים ב-CRM, והבדיקות יכולות לשלוט בזמן דרך `__clock`.
2. `crm.css` לא משתנה. החלון משתמש במחלקות קיימות (`crm-card-meta`, `crm-hint`, `crm-input`, `crm-error`).
3. אין קובץ fixture בינארי. הבדיקות בונות בייטים של UTF-16 בתוך הקוד.
4. `app.js` טוען מעכשיו גם את עמודת `rivhit` למוצר. בלי זה `agent.js` לא יודע אילו מספרים כבר קיימים באתר.
5. `window.AGENT` חושף גם את `rivhitHint` (בשביל ההודעה במצב "לא נמצאו") ואת `refreshRivhit` (בשביל בדיקה בדפדפן).

## מבנה הקבצים

| קובץ | מה משתנה |
|---|---|
| `tools/rivhit/src/site-order.js` | `itemExportRows` חדשה; `siteOrderDocument` נופלת ל-`it.rivhit` |
| `js/rivhit-core.js` | נבנה מחדש ב-`python3 tools/rivhit/build.py`. לא עורכים אותו ידנית |
| `tools/test/rivhit-site.test.js` | בדיקות ל-`itemExportRows` ולמק"ט מהפריט |
| `tools/google-apps-script-crm.gs` | הלשונית "פריטי ריווחית"; `items_set` ו-`items`; מגבלת גודל של 300,000; `rivhit` ב-`itemsJson_` |
| `tools/test/crm.test.js` | בדיקות לפעולות החדשות |
| `tools/google-apps-script-orders.gs` | `crmEventFor_` מעביר `rivhit` |
| `tools/test/order-doc.test.js` | בדיקות לאירוע, לקובץ הקליטה ול-`doPost` |
| `crm-f428d7/index.html`, `crm-f428d7/crm.js` | פריט בתפריט, חלון "פריטים מריווחית" והעלאה |
| `tools/test/crm-fake-api.js` | `items` ו-`items_set` בשרת המדומה |
| `js/app.js`, `css/style.css` | `fromRivhit`: חיפוש בלבד, מגבלת 50, תווית, מחיר, `rivhit` בפיילוד ושאלת "בלי מחיר" |
| `js/agent.js` | טעינת הרשימה, עותק במכשיר והחלת מחירים |
| 16+17 דפי HTML, `sw.js`, `agent/index.html` | העלאת גרסאות |
| `CLAUDE.md` | סבב 89 |

---

### Task 1: ליבת ריווחית — קריאת קובץ הייצוא ומק"ט מהפריט

**Files:**
- Modify: `tools/rivhit/src/site-order.js` (‏`siteOrderDocument` בשורות 109–139, ‏`return` בסוף)
- Test: `tools/test/rivhit-site.test.js`
- Generated: `js/rivhit-core.js` (‏`python3 tools/rivhit/build.py`)

**Interfaces:**
- Produces: `itemExportRows(rows) → { items: [[string num, string name], ...], error: string }`. ‏`rows` הם האובייקטים ש-`parseCsv` מחזיר. ‏`error` ריק כשיש פריטים.
- Produces: `siteOrderDocument(order, codes, opts)` מקבל גם `it.rivhit` (ספרות, עד 15) כשאין `codes[id]`.
- Consumes: `T.normalizeText`, ‏`parseCsv`, ‏`decodeText` (‏`text.js`).

- [ ] **Step 1: לכתוב בדיקות שנכשלות**

בקובץ `tools/test/rivhit-site.test.js`, ממש לפני השורה `let failed = 0;`, מוסיפים:

```js
// ---------- פריטים מריווחית בדף הסוכן (אפיון 2026-11-09) ----------

const EXPORT_CSV = 'item_num,item_name,item_part_num,sapak,item_cost_nis,item_sale_nis\r\n' +
  '56,אקונומיקה 4 ליטר,,,7.5,12\r\n' +
  '1500,"כפפות ניטריל ""M""",,,20,35\r\n' +
  '1501,,,,1,2\r\n' +
  '15a,שגוי,,,1,2\r\n' +
  '56,כפול,,,1,2\r\n' +
  '9001,  מגב   תעשייתי  ,,,30,45\r\n';

test('ייצוא פריטים: רק מספר ושם; בלי שם, מספר לא תקין וכפילות נופלים', () => {
  const r = S.itemExportRows(S.parseCsv(EXPORT_CSV));
  assert.strictEqual(r.error, '');
  assert.deepStrictEqual(r.items, [
    ['56', 'אקונומיקה 4 ליטר'],
    ['1500', 'כפפות ניטריל "M"'],
    ['9001', 'מגב תעשייתי']
  ]);
  assert.ok(!JSON.stringify(r.items).includes('7.5'), 'מחיר העלות לא נכנס לרשימה');
});

test('ייצוא פריטים: קובץ בלי item_num/item_name ⇒ שגיאה מסבירה; קובץ ריק', () => {
  const bad = S.itemExportRows(S.parseCsv('id,name\r\nניק001,אקונומיקה\r\n'));
  assert.deepStrictEqual(bad.items, []);
  assert.ok(/item_num/.test(bad.error), bad.error);
  assert.ok(S.itemExportRows(S.parseCsv('')).error);
  const empty = S.itemExportRows(S.parseCsv('item_num,item_name\r\n1,\r\n'));
  assert.deepStrictEqual(empty.items, []);
  assert.ok(empty.error);
});

test('ייצוא פריטים: UTF-16 עם BOM (כך ריווחית מייצאת) נקרא דרך decodeText', () => {
  const T = require('../rivhit/src/text.js');
  const bytes = new Uint8Array(Buffer.from('﻿' + EXPORT_CSV, 'utf16le'));
  const r = S.itemExportRows(S.parseCsv(T.decodeText(bytes)));
  assert.strictEqual(r.items.length, 3);
  assert.strictEqual(r.items[0][0], '56');
});

test('ייצוא פריטים: שם ארוך נחתך ל-100 תווים (שדה 6 בריווחית)', () => {
  const r = S.itemExportRows([{ item_num: '7', item_name: 'א'.repeat(150) }]);
  assert.strictEqual(r.items[0][1].length, 100);
});

test('מסמך: פריט מריווחית נושא את המק"ט שלו; המפה החיה גוברת; מק"ט לא תקין ⇒ חסר', () => {
  const order = Object.assign({}, ORDER, { items: [
    { id: 'RV-1500', name: 'כפפות ניטריל M', qty: 3, price: 7, rivhit: '1500' },
    { id: 'ניק001', name: 'אקונומיקה 4 ליטר', qty: 1, price: 5, rivhit: '999' },
    { id: 'RV-x', name: 'מק"ט שגוי', qty: 1, price: 1, rivhit: '15a' }
  ] });
  const res = S.siteOrderDocument(order, CODES, { docType: 7, customerNo: '', today: TODAY });
  assert.deepStrictEqual(res.records.map(r => r[4]), ['1500', '56']);
  assert.deepStrictEqual(res.missing, ['מק"ט שגוי']);
});
```

ובבדיקה הקיימת `'js/rivhit-core.js נטען כסקריפט קלאסי ומגדיר RivhitCore'`, לפני הסוגר `});` שלה, מוסיפים:

```js
  assert.strictEqual(typeof ctx.RivhitCore.itemExportRows, 'function');
```

- [ ] **Step 2: להריץ ולוודא שהבדיקות נכשלות**

Run: `node tools/test/rivhit-site.test.js`
Expected: חמש הבדיקות החדשות ובדיקת `rivhit-core.js` נכשלות (`S.itemExportRows is not a function` ו-`'undefined' !== 'function'`). השאר עוברות.

- [ ] **Step 3: לממש**

ב-`tools/rivhit/src/site-order.js`, בתוך `siteOrderDocument`, מחליפים את השורה:

```js
      var code = codes[String(it.id || '').trim()];
```

ב:

```js
      // מוצר אתר — לפי המפה החיה מ-products.csv; פריט שנבחר מרשימת ריווחית
      // בדף הסוכן — לפי המק"ט שהוא נושא (אפיון 2026-11-09)
      var code = codes[String(it.id || '').trim()] || rivhitOf(it);
```

ממש מעל `function siteOrderDocument(order, codes, opts) {` (ומעל ההערה `// order = {orderId, ...` שקודמת לה) מוסיפים:

```js
  function rivhitOf(it) {
    var c = String((it && it.rivhit) || '').trim();
    return /^\d{1,15}$/.test(c) ? c : '';
  }

  // ייצוא הפריטים של ריווחית (פריטים.csv) ⇒ [[מספר, שם], ...]. רק שתי העמודות
  // האלה יוצאות מהמכשיר — מחירי העלות ושאר העמודות נשארים בקובץ.
  function itemExportRows(rows) {
    rows = rows || [];
    if (!rows.length || !('item_num' in rows[0]) || !('item_name' in rows[0])) {
      return { items: [], error: 'זה לא קובץ ייצוא הפריטים של ריווחית (חסרות העמודות item_num ו-item_name).' };
    }
    var seen = {}, items = [];
    rows.forEach(function (r) {
      var n = String(r.item_num == null ? '' : r.item_num).trim();
      var name = T.normalizeText(r.item_name).slice(0, 100);
      if (!/^\d{1,15}$/.test(n) || !name || seen[n]) return;
      seen[n] = true;
      items.push([n, name]);
    });
    return { items: items, error: items.length ? '' : 'לא נמצאו בקובץ פריטים עם מספר ושם.' };
  }

```

ובאובייקט שמוחזר בסוף הקובץ, אחרי `parseCsv: parseCsv,` מוסיפים:

```js
    itemExportRows: itemExportRows,
```

- [ ] **Step 4: לבנות את `js/rivhit-core.js` ולהריץ את כל בדיקות ריווחית**

Run:
```bash
python3 tools/rivhit/build.py && for t in rivhit-site rivhit-file rivhit-mapping rivhit-order-form order-doc; do node tools/test/$t.test.js | tail -1; done
```
Expected: `כל 25 הבדיקות עברו` ב-rivhit-site, וכל השאר "כל N הבדיקות עברו" בלי כישלונות. `order-doc` טוען את `js/rivhit-core.js` החדש, ולכן גם הוא חייב לעבור.

- [ ] **Step 5: Commit**

```bash
git add tools/rivhit/src/site-order.js tools/test/rivhit-site.test.js js/rivhit-core.js
git status --short tools/rivhit/dist   # הממיר לא אמור להשתנות — site-order.js לא נכלל בו
git commit -m "$(cat <<'EOF'
ריווחית: קריאת ייצוא הפריטים, ומק"ט מהפריט כשאין לו מוצר באתר

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: סקריפט ה-CRM — רשימת הפריטים

**Files:**
- Modify: `tools/google-apps-script-crm.gs` (קבועים אחרי `TASK_KEYS`; פונקציות חדשות לפני `function authorized_`; `doPost`; `itemsJson_`)
- Test: `tools/test/crm.test.js`

**Interfaces:**
- Produces: POST `{action:'items_set', password, items:[[num,name],...]}` ⇒ `{ok:true, count, updated}` / `{ok:false, error:'no items'|'too many items'|'unauthorized'}`.
- Produces: POST `{action:'items', password}` ⇒ `{ok:true, items:[[num,name],...], updated}`. כשאין לשונית או רשימה: `items: []` ו-`updated: ''`.
- Produces: הפריט ב-`itemsJson_` כולל `rivhit` רק כשהמק"ט תקין.

- [ ] **Step 1: לכתוב בדיקות שנכשלות**

ב-`tools/test/crm.test.js`, ממש לפני השורה `let failed = 0;`:

```js
// ---------- פריטים מריווחית (אפיון 2026-11-09) ----------

test('פריטים מריווחית: items_set שומר מספר ושם, בטקסט, ומחליף את הרשימה כולה', () => {
  const app = loadApp();
  let r = app.call({ action: 'items_set', password: P, items: [['56', 'אקונומיקה 4 ליטר'], ['1148', 'גביע 150 מ"ל']] });
  assert.deepStrictEqual(r, { ok: true, count: 2, updated: '2026-11-02 10:42' });
  app.setNow({ date: '2026-11-03', stamp: '2026-11-03 08:15' });
  r = app.call({ action: 'items_set', password: P, items: [['1500', 'כפפות ניטריל M']] });
  assert.strictEqual(r.count, 1);
  assert.deepStrictEqual(app.call({ action: 'items', password: P }),
    { ok: true, items: [['1500', 'כפפות ניטריל M']], updated: '2026-11-03 08:15' });
  const sh = app.crm.sheets['פריטי ריווחית'];
  assert.deepStrictEqual(sh.rows[0], ['מספר פריט', 'שם']);
  assert.strictEqual(sh.untyped, false, 'נכתב בפורמט טקסט — 0 בהתחלה לא נמחק');
});

test('פריטים מריווחית: ולידציה — מספר לא תקין, שם ריק וכפילות נופלים; שם נחתך ל-100', () => {
  const app = loadApp();
  const r = app.call({ action: 'items_set', password: P, items: [
    ['12a', 'לא מספר'], ['', 'בלי מספר'], ['77', '   '], ['88', 'ראשון'], ['88', 'כפול'],
    [' 99 ', 'א'.repeat(150)], 'לא מערך'
  ] });
  assert.strictEqual(r.count, 2);
  const items = app.call({ action: 'items', password: P }).items;
  assert.deepStrictEqual(items.map(x => x[0]), ['88', '99']);
  assert.strictEqual(items[0][1], 'ראשון');
  assert.strictEqual(items[1][1].length, 100);
});

test('פריטים מריווחית: שם שמתחיל בסימן נוסחה נשמר כטקסט וחוזר כמו שהוא', () => {
  const app = loadApp();
  app.call({ action: 'items_set', password: P, items: [['5', '=SUM(A1)']] });
  assert.strictEqual(app.crm.sheets['פריטי ריווחית'].rows[1][1], "'=SUM(A1)");
  assert.deepStrictEqual(app.call({ action: 'items', password: P }).items, [['5', '=SUM(A1)']]);
});

test('פריטים מריווחית: רשימה ריקה לא מוחקת את הקיימת; מעל 5,000 נדחה; בקשה גדולה עוברת', () => {
  const app = loadApp();
  app.call({ action: 'items_set', password: P, items: [['56', 'אקונומיקה']] });
  assert.strictEqual(app.call({ action: 'items_set', password: P, items: [] }).error, 'no items');
  assert.strictEqual(app.call({ action: 'items_set', password: P, items: [['x', 'y']] }).error, 'no items');
  assert.strictEqual(app.call({ action: 'items_set', password: P }).error, 'no items');
  const big = Array.from({ length: 5001 }, (_, i) => [String(i + 1), 'פריט ' + i]);
  assert.ok(JSON.stringify(big).length > 100000, 'מעל המגבלה הישנה');
  assert.strictEqual(app.call({ action: 'items_set', password: P, items: big }).error, 'too many items');
  assert.deepStrictEqual(app.call({ action: 'items', password: P }).items, [['56', 'אקונומיקה']]);
  const ok = app.call({ action: 'items_set', password: P, items: big.slice(0, 5000) });
  assert.strictEqual(ok.count, 5000);
});

test('פריטים מריווחית: items בלי לשונית ⇒ ריק בלי תאריך ובלי ליצור לשונית; סיסמה שגויה נחסמת', () => {
  const app = loadApp();
  assert.deepStrictEqual(app.call({ action: 'items', password: P }), { ok: true, items: [], updated: '' });
  assert.strictEqual(app.crm.sheets['פריטי ריווחית'], undefined);
  assert.strictEqual(app.call({ action: 'items', password: 'wrong' }).error, 'unauthorized');
  assert.strictEqual(app.call({ action: 'items_set', password: 'wrong', items: [['1', 'א']] }).error, 'unauthorized');
});

test('פריטים מריווחית: itemsJson_ שומר rivhit תקין בלבד', () => {
  const out = JSON.parse(gs.itemsJson_([
    { id: 'RV-1500', name: 'כפפות', qty: 2, price: 7, rivhit: '1500' },
    { id: 'RV-x', name: 'שגוי', qty: 1, price: 1, rivhit: '15a' },
    { id: 'ניק001', name: 'אקונומיקה', qty: 1, price: 5 }
  ]));
  assert.strictEqual(out[0].rivhit, '1500');
  assert.ok(!('rivhit' in out[1]));
  assert.deepStrictEqual(Object.keys(out[2]), ['id', 'name', 'qty', 'price']);
});
```

- [ ] **Step 2: להריץ ולוודא שהבדיקות נכשלות**

Run: `node tools/test/crm.test.js | tail -8`
Expected: שש הבדיקות החדשות נכשלות. ‏`unknown action` מופיע ב-`deepStrictEqual`, וב-`big` מתקבל `bad request` בגלל המגבלה הישנה.

- [ ] **Step 3: לממש**

ב-`tools/google-apps-script-crm.gs`:

(א) אחרי השורה `var TASK_KEYS = ['id', 'contactId', 'text', 'due', 'time', 'done', 'created', 'reminded'];` מוסיפים:

```js
// פריטים מריווחית לדף הסוכן (אפיון 2026-11-09): מספר ושם בלבד, בלי מחירים
var ITEMS_SHEET = 'פריטי ריווחית';
var ITEM_HEADERS = ['מספר פריט', 'שם'];
var ITEMS_MAX = 5000;
var ITEM_NAME_MAX = 100;
```

(ב) ב-`itemsJson_` מחליפים:

```js
    out.push({ id: trim_(it.id).slice(0, 40), name: trim_(it.name).slice(0, 120),
      qty: qty, price: price > 0 ? price : 0 });
```

ב:

```js
    var o = { id: trim_(it.id).slice(0, 40), name: trim_(it.name).slice(0, 120),
      qty: qty, price: price > 0 ? price : 0 };
    // פריט מרשימת ריווחית בדף הסוכן נושא את המק"ט שלו (אפיון 2026-11-09)
    var rv = trim_(it.rivhit);
    if (/^\d{1,15}$/.test(rv)) o.rivhit = rv;
    out.push(o);
```

(ג) ממש לפני `function authorized_(expected, given) {` מוסיפים:

```js
// ---------- פריטים מריווחית (אפיון 2026-11-09) ----------

function cleanItems_(items) {
  if (!Array.isArray(items)) return { error: 'no items' };
  if (items.length > ITEMS_MAX) return { error: 'too many items' };
  var seen = {}, out = [];
  items.forEach(function (it) {
    if (!Array.isArray(it)) return;
    var n = trim_(it[0]);
    var name = trim_(it[1]).replace(/\s+/g, ' ');
    if (!/^\d{1,15}$/.test(n) || !name || seen[n]) return;
    seen[n] = true;
    out.push([n, name.slice(0, ITEM_NAME_MAX)]);
  });
  return out.length ? { items: out } : { error: 'no items' };
}

// מחליף את כל הרשימה. שורות ישנות שמעבר לחדשה מתרוקנות (getLastRow מתעלם מהן).
function handleItemsSet_(items) {
  var clean = cleanItems_(items);
  if (clean.error) return { ok: false, error: clean.error };
  var sh = sheet_(book_(), ITEMS_SHEET, ITEM_HEADERS);
  var old = Math.max(0, sh.getLastRow() - 1);
  var rows = clean.items.map(function (it) { return [it[0], sanitize_(it[1], ITEM_NAME_MAX + 1)]; });
  for (var i = rows.length; i < old; i++) rows.push(['', '']);
  writeRows_(sh, 2, rows, ITEM_HEADERS.length);
  var updated = now_().stamp;
  PropertiesService.getScriptProperties().setProperty('ITEMS_UPDATED', updated);
  return { ok: true, count: clean.items.length, updated: updated };
}

function handleItems_() {
  var sh = book_().getSheetByName(ITEMS_SHEET);
  var items = sh ? readRows_(sh, ['num', 'name'])
    .filter(function (r) { return /^\d{1,15}$/.test(r.num) && r.name; })
    .map(function (r) { return [r.num, r.name]; }) : [];
  var updated = items.length ? (PropertiesService.getScriptProperties().getProperty('ITEMS_UPDATED') || '') : '';
  return { ok: true, items: items, updated: updated };
}

```

הערה: `sanitize_` מוסיף גרש לשם שמתחיל בסימן נוסחה. לכן תקרת האורך שמועברת לו היא `ITEM_NAME_MAX + 1`, כדי שלא ייחתך התו האחרון של שם באורך 100. השם עצמו כבר נחתך ב-`cleanItems_`.

(ד) ב-`doPost` מחליפים:

```js
  if (!raw || raw.length > 100000) return json_({ ok: false, error: 'bad request' });
```

ב:

```js
  // 300 אלף תווים: העלאת רשימת הפריטים מריווחית (~63 אלף היום) נשארת בקשה אחת
  if (!raw || raw.length > 300000) return json_({ ok: false, error: 'bad request' });
```

ואחרי השורה `      case 'task_delete': return json_(withLock_(function () { return handleTaskDelete_(body.id); }));` מוסיפים:

```js
      case 'items': return json_(handleItems_());
      case 'items_set': return json_(withLock_(function () { return handleItemsSet_(body.items); }));
```

- [ ] **Step 4: להריץ ולוודא שהבדיקות עוברות**

Run: `node tools/test/crm.test.js | tail -1 && node -e "new Function(require('fs').readFileSync('tools/google-apps-script-crm.gs','utf8'))" && echo syntax-ok`
Expected: `כל 77 הבדיקות עברו` ו-`syntax-ok`.

- [ ] **Step 5: Commit**

```bash
git add tools/google-apps-script-crm.gs tools/test/crm.test.js
git commit -m "$(cat <<'EOF'
CRM: רשימת הפריטים מריווחית — items_set ו-items, ומק"ט בפריטי ההזמנה

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: סקריפט ההזמנות — המק"ט עובר ל-CRM ולקבצים

**Files:**
- Modify: `tools/google-apps-script-orders.gs:647-650` (‏`crmEventFor_`)
- Test: `tools/test/order-doc.test.js`

**Interfaces:**
- Consumes: `siteOrderDocument` עם הנפילה ל-`it.rivhit` (Task 1, דרך `js/rivhit-core.js`).
- Produces: `crmEventFor_(data).items[i].rivhit` כשהפריט נושא מק"ט תקין.

- [ ] **Step 1: לכתוב בדיקות שנכשלות**

ב-`tools/test/order-doc.test.js`, ממש לפני `let failed = 0;`:

```js
// ---------- פריטים מריווחית בדף הסוכן (אפיון 2026-11-09) ----------

const SL_WITH_RV = Object.assign({}, AR_ORDER, {
  orderId: 'SL-20261109-123456', showPrices: true,
  items: AR_ORDER.items.concat([
    { id: 'RV-1500', name: 'כפפות ניטריל M', category: 'מריווחית', qty: 3, unit: '', image: '',
      price: 7, total: 21, rivhit: '1500' }
  ])
});

test('ריווחית: האירוע ל-CRM מעביר את המק"ט של פריט מריווחית, ורק שלו', () => {
  const app = loadOrdersApp();
  const ev = app.crmEventFor_(SL_WITH_RV, null);
  assert.deepStrictEqual(ev.items[3], { id: 'RV-1500', name: 'כפפות ניטריל M', qty: 3, price: 7, rivhit: '1500' });
  assert.ok(!('rivhit' in ev.items[1]));
});

test('ריווחית: קובץ הקליטה כולל פריט מריווחית לפי המק"ט שהוא נושא', () => {
  const app = loadOrdersApp();
  const r = app.rivhitAttachments_(SL_WITH_RV, '1234', null, TODAY);
  const lines = Buffer.from(r.files[0].bytes.map(x => x & 255)).toString('latin1').split('\r\n');
  assert.strictEqual(lines.length, 3, 'שני מוצרי אתר משויכים + פריט מריווחית');
  assert.strictEqual(lines[2].split('\t')[4], '1500');
  assert.deepStrictEqual(r.missing, ['DOVE סבון']);
});

test('ריווחית: doPost — הזמנה מדף הסוכן עם פריט מריווחית', () => {
  const app = loadOrdersApp({ rivhitNo: '1234' });
  assert.strictEqual(app.post(SL_WITH_RV).success, true);
  const m = app.sent.mails[0];
  assert.strictEqual(m.o.attachments.length, 3);
  const text = Buffer.from(m.o.attachments[0].bytes.map(x => x & 255)).toString('latin1');
  assert.ok(text.split('\r\n').some(l => l.split('\t')[4] === '1500'), 'המק"ט של הפריט מריווחית בקובץ');
});
```

- [ ] **Step 2: להריץ ולוודא שהבדיקה הראשונה נכשלת**

Run: `node tools/test/order-doc.test.js | tail -5`
Expected: הבדיקה הראשונה נכשלת, כי `rivhit` חסר באירוע. שתי האחרות כבר עוברות, כי Task 1 הוסיף ל-`rivhit-core.js` את הנפילה ל-`it.rivhit`.

- [ ] **Step 3: לממש**

ב-`crmEventFor_` מחליפים:

```js
      return { id: String(it.id || ''), name: String(it.name || ''),
        qty: Number(it.qty) || 0, price: Number(it.price) || 0 };
```

ב:

```js
      var o = { id: String(it.id || ''), name: String(it.name || ''),
        qty: Number(it.qty) || 0, price: Number(it.price) || 0 };
      // פריט מרשימת ריווחית בדף הסוכן נושא את המק"ט שלו (אפיון 2026-11-09)
      var rv = String(it.rivhit || '').trim();
      if (/^\d{1,15}$/.test(rv)) o.rivhit = rv;
      return o;
```

- [ ] **Step 4: להריץ**

Run: `node tools/test/order-doc.test.js | tail -1 && node -e "new Function(require('fs').readFileSync('tools/google-apps-script-orders.gs','utf8'))" && echo syntax-ok`
Expected: `כל 48 הבדיקות עברו` ו-`syntax-ok`.

- [ ] **Step 5: Commit**

```bash
git add tools/google-apps-script-orders.gs tools/test/order-doc.test.js
git commit -m "$(cat <<'EOF'
הזמנות: מק"ט של פריט מריווחית עובר לאירוע ב-CRM

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: עמוד ה-CRM — "פריטים מריווחית" בתפריט

**Files:**
- Modify: `crm-f428d7/index.html` (תפריט שורות 54–57; חלון חדש אחרי `crm-rivhit-wrap`; גרסאות בשורות 214–215)
- Modify: `crm-f428d7/crm.js` (`ERRORS`, `S`, פונקציות חדשות לפני `// ---------- תפריט, הודעות, רשת ----------`, תפריט וחיווט)
- Modify: `tools/test/crm-fake-api.js`

**Interfaces:**
- Consumes: `R.decodeText`, ‏`R.parseCsv`, ‏`R.itemExportRows` (Task 1); `api('items')` ו-`api('items_set', {items})` (Task 2); `C.formatStamp`.

- [ ] **Step 1: השרת המדומה**

ב-`tools/test/crm-fake-api.js`, בסוף האובייקט `db` מחליפים:

```js
            { id: 'T4', contactId: '', text: 'ספירת מלאי', due: day(3), time: '',
              done: '', created: at(-1), reminded: '' }
        ]
    };
```

ב:

```js
            { id: 'T4', contactId: '', text: 'ספירת מלאי', due: day(3), time: '',
              done: '', created: at(-1), reminded: '' }
        ],
        items: [],
        itemsUpdated: ''
    };
```

וב-`handle(b)`, לפני `case 'list':` מוסיפים:

```js
            case 'items':
                return { ok: true, items: clone(db.items), updated: db.items.length ? db.itemsUpdated : '' };
            case 'items_set': {
                const items = (Array.isArray(b.items) ? b.items : [])
                    .filter(x => Array.isArray(x) && /^\d{1,15}$/.test(String(x[0]).trim()) && String(x[1] || '').trim())
                    .map(x => [String(x[0]).trim(), String(x[1]).trim().slice(0, 100)]);
                if (!items.length) return { ok: false, error: 'no items' };
                db.items = items;
                db.itemsUpdated = at(0, '12:00');
                return { ok: true, count: items.length, updated: db.itemsUpdated };
            }
```

(הפונקציות `clone` ו-`at` כבר קיימות בקובץ.)

- [ ] **Step 2: ה-HTML**

ב-`crm-f428d7/index.html`, אחרי `<button type="button" data-menu="import">סנכרון מגיליון ההזמנות</button>` מוסיפים:

```html
                        <button type="button" data-menu="items">פריטים מריווחית</button>
```

אחרי סוף הבלוק `<div id="crm-rivhit-wrap" ...>...</div>` (לפני `<div id="crm-toast"`) מוסיפים:

```html
    <div id="crm-items" class="crm-overlay" hidden>
        <div class="crm-sheet" role="dialog" aria-modal="true" aria-labelledby="crm-items-title">
            <h2 id="crm-items-title" tabindex="-1">פריטים מריווחית</h2>
            <p id="i-status" class="crm-card-meta" aria-live="polite"></p>
            <p class="crm-hint">הרשימה מופיעה בחיפוש בדף הסוכן. בוחרים את קובץ ייצוא הפריטים מריווחית (פריטים.csv). נשמרים רק מספר הפריט והשם — מחירי העלות לא יוצאים מהמחשב.</p>
            <label for="i-file" class="crm-label">קובץ ייצוא מריווחית</label>
            <input type="file" id="i-file" class="crm-input" accept=".csv,text/csv">
            <p id="i-found" class="crm-card-meta" aria-live="polite"></p>
            <p id="i-error" class="crm-error" role="alert"></p>
            <div class="crm-form-actions">
                <button type="button" id="i-save" class="crm-btn crm-btn-primary" disabled>שמירה</button>
                <button type="button" id="i-close" class="crm-btn">סגירה</button>
            </div>
        </div>
    </div>

```

ומעלים גרסאות: `/js/rivhit-core.js?v=1` ⇒ `?v=2`, ‏`crm.js?v=4` ⇒ `?v=5`.

- [ ] **Step 3: ה-JS**

ב-`crm-f428d7/crm.js`:

(א) ב-`ERRORS`, אחרי השורה `'bad rivhit': ...` (מוסיפים פסיק בסופה):

```js
        'no items': 'לא נמצאו פריטים לשמירה.',
        'too many items': 'יותר מ-5,000 פריטים — זה לא נראה כמו קובץ הייצוא של ריווחית.'
```

(ב) ב-`S`, אחרי `rivhit: null, rivhitCodes: null` (מוסיפים פסיק בסופה):

```js
        itemsUpload: null
```

(ג) ממש לפני השורה `    // ---------- תפריט, הודעות, רשת ----------` מוסיפים:

```js
    // ---------- פריטים מריווחית (אפיון 2026-11-09) ----------
    // הקובץ נקרא כאן בדפדפן. לסקריפט נשלחים רק מספר הפריט והשם —
    // מחירי העלות ושאר העמודות של הייצוא לא יוצאים מהמכשיר.

    function itemsStatusText(res) {
        if (!res || !res.ok) return errorText(res, 'לא ניתן לבדוק מה שמור — נסו שוב.');
        if (!res.items || !res.items.length) return 'עוד לא נטענה רשימה.';
        return 'שמורים ' + res.items.length.toLocaleString('he-IL') + ' פריטים' +
            (res.updated ? ' · עודכן ' + C.formatStamp(res.updated) : '');
    }

    function resetItemsForm() {
        S.itemsUpload = null;
        $('i-file').value = '';
        $('i-found').textContent = '';
        $('i-error').textContent = '';
        $('i-save').disabled = true;
    }

    async function openItems() {
        resetItemsForm();
        $('i-status').textContent = 'בודק מה שמור…';
        openOverlay('crm-items', 'crm-items-title');
        const res = await api('items');
        if ($('crm-items').hidden) return;
        $('i-status').textContent = itemsStatusText(res);
    }

    function readItemsFile(file) {
        return new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => {
                try { resolve(R.itemExportRows(R.parseCsv(R.decodeText(new Uint8Array(fr.result))))); }
                catch (e) { resolve({ items: [], error: 'הקובץ לא נקרא.' }); }
            };
            fr.onerror = () => resolve({ items: [], error: 'הקובץ לא נקרא.' });
            fr.readAsArrayBuffer(file);
        });
    }

    async function pickItemsFile() {
        const file = $('i-file').files && $('i-file').files[0];
        S.itemsUpload = null;
        $('i-save').disabled = true;
        $('i-found').textContent = '';
        $('i-error').textContent = '';
        if (!file) return;
        const parsed = await readItemsFile(file);
        if (parsed.error) { $('i-error').textContent = parsed.error; return; }
        S.itemsUpload = parsed.items;
        $('i-found').textContent = 'נמצאו ' + parsed.items.length.toLocaleString('he-IL') + ' פריטים.';
        $('i-save').disabled = false;
    }

    async function saveItems() {
        const items = S.itemsUpload;
        if (!items || !items.length) return;
        if (offline()) { $('i-error').textContent = ERRORS.network; return; }
        const btn = $('i-save');
        btn.disabled = true;
        btn.textContent = 'שומר…';
        $('i-error').textContent = '';
        const res = await api('items_set', { items: items });
        btn.textContent = 'שמירה';
        if (!res.ok) {
            btn.disabled = false;
            $('i-error').textContent = errorText(res, 'השמירה נכשלה — נסו שוב.');
            return;
        }
        resetItemsForm();
        $('i-status').textContent = 'נשמרו ' + res.count.toLocaleString('he-IL') + ' פריטים · עודכן ' + C.formatStamp(res.updated);
        toast('רשימת הפריטים מריווחית עודכנה.');
    }

```

(ד) בחלוקת התפריט, אחרי `else if (k === 'import') openImport();` מוסיפים:

```js
            else if (k === 'items') openItems();
```

(ה) אחרי `$('crm-import-close').addEventListener('click', () => closeOverlay('crm-import'));` מוסיפים:

```js
        $('i-file').addEventListener('change', pickItemsFile);
        $('i-save').addEventListener('click', saveItems);
        $('i-close').addEventListener('click', () => { S.itemsUpload = null; closeOverlay('crm-items'); });
```

- [ ] **Step 4: בדיקות Node + בדיקה בדפדפן מול השרת המדומה**

Run: `node tools/test/crm-page.test.js | tail -1 && node -e "new Function(require('fs').readFileSync('crm-f428d7/crm.js','utf8'))" && echo syntax-ok`
Expected: `כל 19 הבדיקות עברו` ו-`syntax-ok`.

**בדפדפן** (‏`preview_start {name:"aroam-site"}`, ‏http://localhost:8085/crm-f428d7/):
1. ב-`javascript_tool`: `localStorage.removeItem('aroam_crm_key'); location.reload()`, ואז טוענים את `/tools/test/crm-fake-api.js` לפי ההוראות בראש הקובץ, ונכנסים עם `test-password-1234`.
2. תפריט ← "פריטים מריווחית". מצופה: "עוד לא נטענה רשימה.", וכפתור "שמירה" מושבת.
3. קובץ UTF-16 עם עמודת עלות, ב-`javascript_tool`:
   ```js
   const text = 'item_num,item_name,item_cost_nis\r\n9001,מגב תעשייתי,12.5\r\n9002,"נייר ""ג׳מבו""",8\r\n';
   const buf = new Uint8Array(2 + text.length * 2); buf[0] = 0xFF; buf[1] = 0xFE;
   for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); buf[2 + i * 2] = c & 255; buf[3 + i * 2] = c >> 8; }
   const dt = new DataTransfer(); dt.items.add(new File([buf], 'פריטים.csv'));
   const inp = document.getElementById('i-file'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
   ```
   מצופה: "נמצאו 2 פריטים.", והכפתור "שמירה" פעיל.
4. לוחצים "שמירה". מצופה: "נשמרו 2 פריטים · עודכן …" והודעה צפה. ‏`JSON.stringify(window.__crmCalls.at(-1))` כולל `items_set` ואת `9001`, **ולא כולל `12.5`**.
5. קובץ שגוי (`'id,name\r\nא,ב\r\n'`, אותו קוד): השגיאה "זה לא קובץ ייצוא הפריטים של ריווחית…", והכפתור "שמירה" מושבת.
6. Esc סוגר את החלון והפוקוס חוזר לכפתור התפריט. "חזור" של הדפדפן סוגר את החלון.
7. `resize_window` ל-375px ובודקים `document.documentElement.scrollWidth <= 375`. אחר כך מצב כהה (`colorScheme: dark`): הטקסטים בחלון קריאים, לפי צילום מסך.
8. בסוף: `localStorage.removeItem('aroam_crm_key')`.

- [ ] **Step 5: Commit**

```bash
git add crm-f428d7/index.html crm-f428d7/crm.js tools/test/crm-fake-api.js
git commit -m "$(cat <<'EOF'
CRM: העלאת רשימת הפריטים מריווחית מהתפריט — רק מספר ושם יוצאים מהמחשב

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: ‏app.js ו-style.css — פריטים מריווחית בחיפוש, בכרטיס ובהזמנה

**Files:**
- Modify: `js/app.js` (עוגנים מצוטטים בכל צעד; כל אחד מופיע בקובץ פעם אחת)
- Modify: `css/style.css` (בסוף הקובץ)
- Modify: 16 דפי HTML (‏`app.js?v=70` ⇒ 71), ‏17 דפי HTML (‏`style.css?v=45` ⇒ 46), ‏`sw.js` (‏`aroam-cache-v66` ⇒ v67)

**Interfaces:**
- Consumes: מוצר עם `{ id:'RV-<n>', fromRivhit:true, rivhit:'<n>', price:0, image:'', category:'מריווחית' }` שמוסיף `agent.js` (Task 6).
- Consumes: `window.AGENT.rivhitHint()`, אם קיים, ⇒ מחרוזת או `''`.
- Produces: `getCartItemsData().items[i].rivhit` לפריט `fromRivhit` בלבד; `product.rivhit` לכל מוצר מ-`products.csv`.

- [ ] **Step 1: עמודת `rivhit` במוצר**

מחליפים:
```js
                            carton_qty: (item.carton_qty || "").toString().trim(),
```
ב:
```js
                            carton_qty: (item.carton_qty || "").toString().trim(),
                            // מק"ט בריווחית (סבב 87). דף הסוכן משתמש בו כדי לא להציג פעמיים פריט מריווחית שכבר קיים באתר
                            rivhit: (item.rivhit || "").toString().trim(),
```

- [ ] **Step 2: בלי קטגוריה ובלי מותג "מריווחית"**

מחליפים:
```js
        const categories = Array.from(new Set(PRODUCTS.map(p => p.category))).filter(c => c)
```
ב:
```js
        // פריטים מריווחית (דף הסוכן) — רק בחיפוש, לא כקטגוריה
        const categories = Array.from(new Set(PRODUCTS.filter(p => !p.fromRivhit).map(p => p.category))).filter(c => c)
```
ומחליפים:
```js
        const brands = Array.from(new Set(PRODUCTS.map(p => p.brand).filter(b => b)))
```
ב:
```js
        const brands = Array.from(new Set(PRODUCTS.filter(p => !p.fromRivhit).map(p => p.brand).filter(b => b)))
```

- [ ] **Step 3: מגבלה של 50 בחיפוש, ושורת "ועוד N"**

מחליפים `    function renderProducts() {` ב:
```js
    function renderProducts() {
        // פריטים מריווחית בדף הסוכן (אפיון 2026-11-09): כמה מוצגים בתוצאות חיפוש.
        // בתוך הפונקציה ולא מעליה — const ברמת ה-scope היה בתוך ה-TDZ אם renderProducts
        // נקראת לפני שהביצוע מגיע לשורה הזו
        const RIVHIT_SEARCH_LIMIT = 50;
```
מחליפים:
```js
        renderResultsBar(filtered.length);
        if (searchQuery !== "") reportSearch(searchQuery, filtered.length);
```
ב:
```js
        // פריטים מריווחית: עד 50 בתוצאות, כדי שאות אחת לא תצייר 1,660 כרטיסים בטלפון
        let rivhitHidden = 0;
        if (searchQuery !== "") {
            const rv = filtered.filter(p => p.fromRivhit);
            if (rv.length > RIVHIT_SEARCH_LIMIT) {
                const keep = new Set(rv.slice(0, RIVHIT_SEARCH_LIMIT));
                rivhitHidden = rv.length - RIVHIT_SEARCH_LIMIT;
                filtered = filtered.filter(p => !p.fromRivhit || keep.has(p));
            }
        }

        renderResultsBar(filtered.length + rivhitHidden);
        if (searchQuery !== "") reportSearch(searchQuery, filtered.length + rivhitHidden);
```
מחליפים:
```js
            productsEl.appendChild(card);
        });
    }

    // מעקב אירועים: שולח גם ל-dataLayer (GTM) וגם ל-GA4, באותה תבנית של order_sent.
```
ב:
```js
            productsEl.appendChild(card);
        });

        if (rivhitHidden > 0) {
            const more = document.createElement('div');
            more.className = 'rivhit-more';
            more.textContent = `ועוד ${rivhitHidden} פריטים מריווחית — הוסיפו מילה לחיפוש`;
            productsEl.appendChild(more);
        }
    }

    // מעקב אירועים: שולח גם ל-dataLayer (GTM) וגם ל-GA4, באותה תבנית של order_sent.
```

- [ ] **Step 4: הכרטיס — בלי בקשת תמונה, תווית, ומחיר רק כשיש**

מחליפים `            img.src = product.image || "#";` ב:
```js
            if (!product.fromRivhit) img.src = product.image || "#";
```
מחליפים:
```js
            imgContainer.appendChild(img);
            imgContainer.appendChild(qvBtn);
```
ב:
```js
            // פריט מריווחית: אין תמונה — ישר "אין תמונה", בלי בקשת רשת (כמו נפילת הטעינה)
            if (product.fromRivhit) imgContainer.appendChild(document.createTextNode('אין תמונה'));
            else imgContainer.appendChild(img);
            imgContainer.appendChild(qvBtn);
```
מחליפים:
```js
            body.appendChild(title);

            // Price - Conditional
            if (CONFIG.showPrices) {
```
ב:
```js
            body.appendChild(title);

            if (product.fromRivhit) {
                const rv = document.createElement("div");
                rv.className = "product-rivhit";
                rv.textContent = "מריווחית · מק״ט " + product.rivhit;
                body.appendChild(rv);
            }

            // Price - Conditional. לפריט מריווחית בלי מחיר אין שורת מחיר: מקלידים אותו בסיכום ההזמנה
            if (CONFIG.showPrices && !(product.fromRivhit && !(product.price > 0))) {
```

- [ ] **Step 5: התצוגה המהירה וההצעות שמתחת לחיפוש**

מחליפים:
```js
        qvSku.textContent = "מק״ט: " + product.id;

        if (CONFIG.showPrices) {
```
ב:
```js
        qvSku.textContent = product.fromRivhit ? "מק״ט בריווחית: " + product.rivhit : "מק״ט: " + product.id;

        if (CONFIG.showPrices && !(product.fromRivhit && !(product.price > 0))) {
```
מחליפים:
```js
                    <span class="s-sku">${product.id}</span>
```
ב:
```js
                    <span class="s-sku">${product.fromRivhit ? 'מריווחית · ' + product.rivhit : product.id}</span>
```

- [ ] **Step 6: ‏`rivhit` בפיילוד, ושאלה על שורה בלי מחיר**

מחליפים:
```js
                bundle: product.bundle || "",
                free: freeQty(product, qty)
            });
```
ב:
```js
                bundle: product.bundle || "",
                free: freeQty(product, qty),
                // פריט מרשימת ריווחית (דף הסוכן) נושא את המק"ט שלו לקובצי הקליטה. מוצר אתר לא:
                // המק"ט שלו נקרא מ-products.csv החי, כך שתיקון בעורך חל גם על קבצים שמופקים אחר כך
                ...(product.fromRivhit ? { rivhit: product.rivhit } : {})
            });
```
מחליפים:
```js
                if (Object.keys(cart).length === 0) {
                    showToast("ההזמנה ריקה");
                    return;
                }
                submitOrderBtn.disabled = true;
```
ב:
```js
                if (Object.keys(cart).length === 0) {
                    showToast("ההזמנה ריקה");
                    return;
                }
                // דף הסוכן: שורה בלי מחיר נכנסת לקובץ ריווחית ב-0 — שואלים לפני ששולחים
                if (CONFIG.agentMode) {
                    const noPrice = getCartItemsData().items.filter(it => !(it.price > 0)).length;
                    if (noPrice && !confirm(noPrice === 1
                        ? 'יש שורה אחת בלי מחיר — לשלוח בכל זאת?'
                        : `יש ${noPrice} שורות בלי מחיר — לשלוח בכל זאת?`)) return;
                }
                submitOrderBtn.disabled = true;
```

- [ ] **Step 7: הסבר במצב "לא נמצאו מוצרים" בדף הסוכן**

מחליפים `        box.textContent = 'לא נמצאו מוצרים.';` ב:
```js
        box.textContent = 'לא נמצאו מוצרים.';
        // דף הסוכן: אין רשימת פריטים מריווחית במכשיר — אומרים למה ומה עושים
        const rivhitHint = CONFIG.agentMode && window.AGENT && window.AGENT.rivhitHint ? window.AGENT.rivhitHint() : '';
        if (searchQuery && rivhitHint) {
            const p = document.createElement('p');
            p.className = 'rivhit-more';
            p.textContent = rivhitHint;
            box.appendChild(p);
        }
```

- [ ] **Step 8: ‏style.css וגרסאות**

בסוף `css/style.css`:
```css

/* פריטים מריווחית בדף הסוכן (אפיון 2026-11-09) */
.product-rivhit {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin-top: 0.15rem;
}
.rivhit-more {
    grid-column: 1 / -1;
    text-align: center;
    color: var(--text-secondary);
    padding: 0.75rem 0.5rem;
}
```
Run:
```bash
grep -rlE 'app\.js\?v=70' --include='*.html' . | xargs sed -i '' 's/app\.js?v=70/app.js?v=71/g'
grep -rlE 'style\.css\?v=45' --include='*.html' . | xargs sed -i '' 's/style\.css?v=45/style.css?v=46/g'
sed -i '' 's/aroam-cache-v66/aroam-cache-v67/' sw.js
echo "app71: $(grep -rlE 'app\.js\?v=71' --include='*.html' . | wc -l) style46: $(grep -rlE 'style\.css\?v=46' --include='*.html' . | wc -l) old: $(grep -rlE 'app\.js\?v=70|style\.css\?v=45' --include='*.html' . | wc -l)"
node -e "new Function(require('fs').readFileSync('js/app.js','utf8'))" && echo syntax-ok
```
Expected: `app71: 16 style46: 17 old: 0` ו-`syntax-ok`.

- [ ] **Step 9: בדיקה בדפדפן (בלי agent.js — הזרקה ידנית)**

ב-http://localhost:8085/agent/:
1. מנקים את ה-SW ואת המטמונים: `navigator.serviceWorker.getRegistrations().then(r => r.forEach(x => x.unregister())); caches.keys().then(k => k.forEach(x => caches.delete(x)))`. אחר כך `localStorage.removeItem('aroam_crm_key')` ורענון.
2. נכנסים עם הקוד `0526000158`. בורר הלקוח נפתח; בוחרים "+ לקוח חדש" ושם בדיקה כלשהו.
3. ב-`javascript_tool` מוסיפים 120 פריטים:
   ```js
   const P = window.APP.getProducts();
   for (let i = 1; i <= 120; i++) P.push({ id: 'RV-' + (9000 + i), name: 'פריט בדיקה ' + i, price: 0, unit: '', image: '', rawImage: '', category: 'מריווחית', rivhit: String(9000 + i), fromRivhit: true });
   window.APP.refresh();
   ```
4. מצופה:
   - אין קטגוריה "מריווחית" בצד.
   - חיפוש "פריט בדיקה" מציג 50 כרטיסים ואת השורה "ועוד 70 פריטים מריווחית — הוסיפו מילה לחיפוש".
   - בכרטיס: "אין תמונה", התווית "מריווחית · מק״ט 9001", ואין שורת מחיר.
   - ב-`read_network_requests` אין בקשה ל-`/agent/#` ולא לתמונה של פריטים אלה.
5. חיפוש "9007" מוצא את "פריט בדיקה 7". התצוגה המהירה מציגה "מק״ט בריווחית: 9007" בלי מחיר.
6. מוסיפים את הפריט לסל ופותחים את סיכום ההזמנה. מיירטים לפני השליחה:
   ```js
   window.__sent = []; window.fetch = (u, o) => { window.__sent.push({ u: String(u), body: o && o.body }); return Promise.resolve(new Response('{}')); };
   window.open = () => null; window.confirm = () => false;
   ```
   - "שלח" ⇒ `window.__sent.length === 0`, כי השאלה על השורה בלי מחיר בוטלה.
   - מקלידים מחיר 12 בשורה ושולחים שוב ⇒ `JSON.parse(window.__sent.at(-1).body).items` כולל `{id:'RV-9007', rivhit:'9007', price:12}`. למוצר אתר שנוסף לסל אין `rivhit`.
7. בסוף: `localStorage.removeItem('aroam_crm_key')` ורענון.

- [ ] **Step 10: Commit**

```bash
git add js/app.js css/style.css sw.js $(grep -rlE 'app\.js\?v=71|style\.css\?v=46' --include='*.html' .)
git commit -m "$(cat <<'EOF'
קטלוג: פריטים מריווחית — חיפוש בלבד, עד 50 בתוצאות, תווית ומק"ט בהזמנה; שאלה על שורה בלי מחיר בדף הסוכן

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: ‏agent.js — הרשימה מה-CRM, עותק במכשיר ומחירים

**Files:**
- Modify: `js/agent.js` (קבועים אחרי `FORGOTTEN_DAYS`; פרק חדש לפני `// ---------- מחירי הלקוח ----------`; ‏`aroam:app-ready`; ‏`window.AGENT`)
- Modify: `agent/index.html` (‏`agent.js?v=3` ⇒ `?v=4`)

**Interfaces:**
- Consumes: POST `{action:'items', password}` לכתובת של סקריפט ה-CRM (Task 2); ‏`localStorage.aroam_crm_key` (נשמר ע"י עמוד ה-CRM).
- Consumes: `window.APP.getProducts()`, ‏`window.APP.refresh()`; תמיכת `fromRivhit` ב-app.js (Task 5).
- Produces: `window.AGENT.rivhitHint() → string`, ‏`window.AGENT.refreshRivhit() → Promise`.

- [ ] **Step 1: קבועים**

אחרי `    const FORGOTTEN_DAYS = 21;` מוסיפים:
```js
    // פריטים מריווחית (אפיון 2026-11-09): הרשימה בגיליון ה-CRM, מאחורי הסיסמה שה-CRM שומר במכשיר
    const CRM_API = 'https://script.google.com/macros/s/AKfycbzs-jtpiy0yH6MnGjy_B2wULKZ56fpQ67UgtCDDPe9o0IZH_gjYb36RBqW7vVt8wGRcbw/exec';
    const CRM_KEY = 'aroam_crm_key';
    const RIVHIT_KEY = 'aroam_agent_rivhit_items';
```
ואחרי `    let gateEl = null;` מוסיפים:
```js
    let rivhitLoaded = false;   // יש רשימת פריטים מריווחית (מהעותק במכשיר או מה-CRM)
```

- [ ] **Step 2: הפרק החדש**

ממש לפני `    // ---------- מחירי הלקוח ----------` מוסיפים:
```js
    // ---------- פריטים מריווחית (אפיון 2026-11-09) ----------
    // הפריטים נכנסים ל-PRODUCTS עם fromRivhit, ו-app.js מציג אותם רק בחיפוש.
    // מספר שכבר משויך למוצר באתר (עמודת rivhit) לא נכנס פעמיים — מוצג מוצר האתר.

    function siteRivhitCodes(products) {
        const set = new Set();
        products.forEach(p => {
            if (p.fromRivhit) return;
            String(p.rivhit || '').split('|').forEach(c => { c = c.trim(); if (c) set.add(c); });
        });
        return set;
    }

    // מוסיף פריטים שעוד לא קיימים. מחיר הבסיס 0 — מחיר הלקוח מוחל מעליו.
    function addRivhitItems(items) {
        const products = window.APP.getProducts() || [];
        const taken = siteRivhitCodes(products);
        const have = new Set(products.filter(p => p.fromRivhit).map(p => p.rivhit));
        let added = 0;
        (items || []).forEach(it => {
            const num = String((it && it[0]) || '').trim();
            const name = String((it && it[1]) || '').trim();
            if (!/^\d{1,15}$/.test(num) || !name || taken.has(num) || have.has(num)) return;
            have.add(num);
            products.push({
                id: 'RV-' + num, name: name, price: 0, unit: '', image: '', rawImage: '',
                category: 'מריווחית', rivhit: num, fromRivhit: true
            });
            BASE_PRICES['RV-' + num] = 0;
            added++;
        });
        if (items && items.length) rivhitLoaded = true;
        return added;
    }

    function crmPassword() {
        try { return localStorage.getItem(CRM_KEY) || ''; } catch (e) { return ''; }
    }

    // ברקע: הרשימה העדכנית מה-CRM. כשל רשת — בשקט; העותק במכשיר נשאר.
    async function refreshRivhitItems() {
        const password = crmPassword();
        if (!password || navigator.onLine === false) return;
        let data = null;
        try {
            const res = await fetch(CRM_API, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'items', password: password })
            });
            data = await res.json();
        } catch (e) { return; }
        if (!data || !data.ok) {
            if (data && data.error === 'unauthorized') toast('לא ניתן לעדכן את פריטי ריווחית — צריך להיכנס מחדש ל-CRM');
            return;
        }
        const items = Array.isArray(data.items) ? data.items : [];
        const cached = readJson(RIVHIT_KEY, null);
        if (cached && cached.updated === (data.updated || '') &&
            Array.isArray(cached.items) && cached.items.length === items.length) return;
        writeJson(RIVHIT_KEY, { updated: data.updated || '', items: items });
        if (addRivhitItems(items)) applyCustomerPrices(ACTIVE);
    }

    // ההסבר שמופיע בדף הסוכן כשחיפוש לא מצא כלום ואין רשימה במכשיר
    function rivhitHint() {
        if (rivhitLoaded) return '';
        return crmPassword()
            ? 'רשימת הפריטים מריווחית עוד לא נטענה — בתפריט של ה-CRM: "פריטים מריווחית".'
            : 'פריטים מריווחית יופיעו בחיפוש אחרי כניסה ל-CRM במכשיר הזה.';
    }

```

- [ ] **Step 3: חיבור ל-`aroam:app-ready` ול-`window.AGENT`**

מחליפים:
```js
    window.AGENT = { activeName: () => (ACTIVE ? ACTIVE.name : '') };
```
ב:
```js
    window.AGENT = {
        activeName: () => (ACTIVE ? ACTIVE.name : ''),
        rivhitHint: rivhitHint,
        refreshRivhit: refreshRivhitItems
    };
```
מחליפים:
```js
        if (!window.APP || !window.APP.getConfig().agentMode) return;

        snapshotBasePrices();
```
ב:
```js
        if (!window.APP || !window.APP.getConfig().agentMode) return;

        // פריטים מריווחית מהעותק במכשיר — לפני צילום מחירי הבסיס, כדי שמחירי
        // הלקוח (שנשמרו לפי RV-<מספר>) יחולו עליהם כבר בטעינה
        const cachedRivhit = readJson(RIVHIT_KEY, null);
        if (cachedRivhit && Array.isArray(cachedRivhit.items)) addRivhitItems(cachedRivhit.items);

        snapshotBasePrices();
        refreshRivhitItems();
```
ב-`agent/index.html` מחליפים `/js/agent.js?v=3` ב-`/js/agent.js?v=4`.

Run: `node -e "new Function(require('fs').readFileSync('js/agent.js','utf8'))" && echo syntax-ok`
Expected: `syntax-ok`

- [ ] **Step 4: בדיקה בדפדפן**

ב-http://localhost:8085/agent/:
1. מנקים SW ומטמונים (כמו ב-Task 5) ו-`localStorage.removeItem('aroam_crm_key')`.
2. זורעים עותק שכולל גם מק"ט אמיתי של מוצר אתר, ושומרים אותו כדי לבדוק אחר כך:
   ```js
   const X = window.APP.getProducts().find(p => p.rivhit && !p.fromRivhit).rivhit.split('|')[0].trim();
   sessionStorage.setItem('rv_test_dup', X);
   localStorage.setItem('aroam_agent_rivhit_items', JSON.stringify({ updated: '2026-11-09 12:00',
     items: [['9001', 'מגב תעשייתי 60 ס"מ'], ['9002', 'נייר טואלט ג׳מבו'], [X, 'כפול של מוצר אתר']] }));
   location.reload();
   ```
3. נכנסים, בוחרים לקוח בדיקה "א". מצופה:
   - חיפוש "מגב תעשייתי" מוצא את 9001.
   - `window.APP.getProducts().filter(p => p.fromRivhit && p.rivhit === sessionStorage.getItem('rv_test_dup')).length === 0`.
   - אין קטגוריה "מריווחית".
4. מיירטים (כמו ב-Task 5, שלב 6), מוסיפים את 9001 לסל, מקלידים מחיר 12 ושולחים. לפני `confirm` מגדירים `window.confirm = () => true`. מצופה: הפיילוד כולל `rivhit:'9001'`.
5. מעבר ללקוח "ב" ⇒ המחיר של RV-9001 הוא 0. חזרה ל"א" ⇒ 12.
6. "חזור" ← הבורר ← ההזמנה הקודמת של "א" ⇒ RV-9001 בסל במחיר 12.
7. הודעת "לא נמצאו":
   - `localStorage.removeItem('aroam_agent_rivhit_items')` ורענון. חיפוש "zzzz" ⇒ "פריטים מריווחית יופיעו בחיפוש אחרי כניסה ל-CRM במכשיר הזה."
   - אחר כך `localStorage.setItem('aroam_crm_key', 'test-password-1234')`, ומיירטים לפני הבקשה הבאה, כדי שהיא לא תצא לשרת האמיתי: `window.fetch = () => Promise.resolve(new Response(JSON.stringify({ ok: true, items: [], updated: '' })))`. אחר כך `await window.AGENT.refreshRivhit()`. חיפוש "zzzz" ⇒ "רשימת הפריטים מריווחית עוד לא נטענה…".
8. רענון דרך `refreshRivhit`: טוענים את `/tools/test/crm-fake-api.js` (כמו ב-Task 4). שולחים `fetch(<כתובת כלשהי>, {method:'POST', body: JSON.stringify({action:'items_set', password:'test-password-1234', items:[['9100','דלי 12 ליטר']]})})`, ואז `await window.AGENT.refreshRivhit()`. מצופה: חיפוש "דלי 12" מוצא את 9100, והעותק במכשיר מעודכן.
9. כשל רשת: מגדירים `window.fetch = () => Promise.reject(new TypeError('offline'))` ומריצים `await window.AGENT.refreshRivhit()`. מצופה: אין שגיאה ואין הודעה, והעותק במכשיר נשאר כמו שהוא.
10. 375px: בלי גלישה אופקית בתוצאות. מצב כהה: התווית "מריווחית · מק״ט" קריאה, לפי צילום מסך.
11. רגרסיה, בכל דף אחרי ניקוי SW: ‏`/catalog/` (מספר המוצרים כמו קודם, `getProducts().some(p => p.fromRivhit) === false`, אותן קטגוריות), ‏`/care/`, ‏`/shops-4b7e2c/` (קוד 3160), ‏`/emp-8c3f5a/` (קוד 7241). אפס שגיאות קונסול.
12. ניקוי: `localStorage.removeItem('aroam_crm_key'); localStorage.removeItem('aroam_agent_rivhit_items')`, ומחיקת לקוחות הבדיקה מ-`aroam_agent_customers`.

- [ ] **Step 5: Commit**

```bash
git add js/agent.js agent/index.html
git commit -m "$(cat <<'EOF'
דף הסוכן: פריטים מריווחית מה-CRM — עותק במכשיר, חיפוש ומחיר שנזכר ללקוח

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: פריסה, push ובדיקה בחי

**Files:**
- Modify: `CLAUDE.md` (סבב 89, ושורת הגרסאות בפרק הארכיטקטורה)

- [ ] **Step 1: סקריפט ה-CRM — גרסה 6**

```bash
SCRIPT=1HtNPX2wXuHZSMTwDQYJ_dDvtSi0M6dS6Pd4-d5F5jAd3orXDSIxnUtzd
rm -rf ~/.aroam-crm/gas-crm ~/.aroam-crm/gas-crm-live; mkdir -p ~/.aroam-crm/gas-crm ~/.aroam-crm/gas-crm-live
cd ~/.aroam-crm/gas-crm-live && npx -y @google/clasp@3.4.1 clone $SCRIPT 5 --rootDir . | tail -1
cd ~/.aroam-crm/gas-crm && npx -y @google/clasp@3.4.1 clone $SCRIPT --rootDir . | tail -1
cmp ~/.aroam-crm/gas-crm-live/Code.js ~/.aroam-crm/gas-crm/Code.js && echo "HEAD == v5"
SECRETS='^var (SPREADSHEET_ID|ORDERS_SPREADSHEET_ID|CRM_PASSWORD|CRM_SECRET) = '
cd ~/aroan && diff <(grep -vE "$SECRETS" ~/.aroam-crm/gas-crm-live/Code.js) <(git show 194effe:tools/google-apps-script-crm.gs | grep -vE "$SECRETS") && echo "v5 == repo before this round"
node ~/.aroam-crm/build-crm-from-cloud.js ~/.aroam-crm/gas-crm-live ~/.aroam-crm/gas-crm
diff <(grep -vE "$SECRETS" ~/.aroam-crm/gas-crm/Code.js) <(grep -vE "$SECRETS" tools/google-apps-script-crm.gs) && echo "build == repo (except secrets)"
node -e "new Function(require('fs').readFileSync(process.env.HOME + '/.aroam-crm/gas-crm/Code.js','utf8'))" && echo syntax-ok
```
Expected: `HEAD == v5`, `v5 == repo before this round`, `build == repo (except secrets)`, `syntax-ok`. בכל סטייה עוצרים ובודקים לפני `push`.

אין הרשאות חדשות, ולכן אפשר להמשיך ישר:
```bash
cd ~/.aroam-crm/gas-crm && npx -y @google/clasp@3.4.1 push -f | tail -2
npx -y @google/clasp@3.4.1 create-version "CRM: רשימת הפריטים מריווחית לדף הסוכן" | tail -1
npx -y @google/clasp@3.4.1 update-deployment AKfycbzs-jtpiy0yH6MnGjy_B2wULKZ56fpQ67UgtCDDPe9o0IZH_gjYb36RBqW7vVt8wGRcbw --versionNumber 6 --description "CRM: רשימת הפריטים מריווחית לדף הסוכן" | tail -1
npx -y @google/clasp@3.4.1 list-deployments $SCRIPT | tail -3
```
Expected: `Created version 6`, `... @6`.

בדיקה: מריצים את `/private/tmp/claude-503/-Users-roeiaharoni-aroan/898b4c2e-7d3e-4007-aa16-3d09031cb18f/scratchpad/check-deploy.js` מסבב 86 (הוא קורא את הסוד מ-`~/.aroam-crm/gas-crm/Code.js` ולא מדפיס אותו), ומוסיפים לו את השורה:
```js
  console.log('items without password:', await post({ action: 'items' }));
```
Expected: `GET: CRM — פעיל`, `bad event`, `unauthorized` ×3.

- [ ] **Step 2: סקריפט ההזמנות — גרסה 13**

```bash
SCRIPT=1kwSk_xA6hbvMRDeJerUfxYw1jKuLsOIfEv9Xmav52kRe7ZHqqDHt5_cV
DEP=$(grep -oE "AKfycbz_rRjFdy2MqP[A-Za-z0-9_-]+" ~/aroan/js/app.js | head -1)
SP=/private/tmp/claude-503/-Users-roeiaharoni-aroan/898b4c2e-7d3e-4007-aa16-3d09031cb18f/scratchpad
rm -rf ~/.aroam-crm/gas-orders ~/.aroam-crm/gas-orders-live; mkdir -p ~/.aroam-crm/gas-orders ~/.aroam-crm/gas-orders-live
cd ~/.aroam-crm/gas-orders-live && npx -y @google/clasp@3.4.1 clone $SCRIPT 12 --rootDir . | tail -1
cd ~/.aroam-crm/gas-orders && npx -y @google/clasp@3.4.1 clone $SCRIPT --rootDir . | tail -1
ls ~/.aroam-crm/gas-orders
for f in קוד.js ריווחית.js; do cmp ~/.aroam-crm/gas-orders-live/$f ~/.aroam-crm/gas-orders/$f && echo "$f: HEAD == v12"; done
```
Expected: שני הקבצים `HEAD == v12`.

עריכה נקודתית, בלי להדביק קובץ שלם:
```bash
cat > $SP/orders-edit.js <<'EOF'
const fs = require('fs');
const file = process.argv[2];
let code = fs.readFileSync(file, 'utf8');
const anchor = "      return { id: String(it.id || ''), name: String(it.name || ''),\n        qty: Number(it.qty) || 0, price: Number(it.price) || 0 };\n";
const next = "      var o = { id: String(it.id || ''), name: String(it.name || ''),\n        qty: Number(it.qty) || 0, price: Number(it.price) || 0 };\n" +
  "      // פריט מרשימת ריווחית בדף הסוכן נושא את המק\"ט שלו (אפיון 2026-11-09)\n" +
  "      var rv = String(it.rivhit || '').trim();\n" +
  "      if (/^\\d{1,15}$/.test(rv)) o.rivhit = rv;\n" +
  "      return o;\n";
const n = code.split(anchor).length - 1;
if (n !== 1) { console.log('anchor found ' + n + ' times — stopping, nothing changed'); process.exit(1); }
fs.writeFileSync(file, code.replace(anchor, () => next));
console.log('edited');
EOF
node $SP/orders-edit.js ~/.aroam-crm/gas-orders/קוד.js
cp ~/aroan/js/rivhit-core.js ~/.aroam-crm/gas-orders/ריווחית.js
diff ~/.aroam-crm/gas-orders-live/קוד.js ~/.aroam-crm/gas-orders/קוד.js | grep '^[<>]' | sed 's/^< /-/; s/^> /+/' > $SP/cloud.delta
cd ~/aroan && git diff -U0 194effe -- tools/google-apps-script-orders.gs | grep -E '^[+-]' | grep -vE '^(\+\+\+|---) ' > $SP/repo.delta
diff $SP/cloud.delta $SP/repo.delta && echo "same delta as the repo"
node --check ~/.aroam-crm/gas-orders/קוד.js && node --check ~/.aroam-crm/gas-orders/ריווחית.js && echo syntax-ok
```
Expected: `edited`, `same delta as the repo`, `syntax-ok`. אם העוגן לא נמצא, מתקנים אותו לפי הענן (מלכודת שנצרבה ב-3.11), ולא מדביקים את הקובץ המלא.

```bash
cd ~/.aroam-crm/gas-orders && npx -y @google/clasp@3.4.1 push -f | tail -2
npx -y @google/clasp@3.4.1 create-version "פריטים מריווחית מדף הסוכן בקובצי הקליטה" | tail -1
npx -y @google/clasp@3.4.1 update-deployment $DEP --versionNumber 13 --description "פריטים מריווחית מדף הסוכן בקובצי הקליטה" | tail -1
npx -y @google/clasp@3.4.1 list-deployments $SCRIPT | tail -3
curl -sL "https://script.google.com/macros/s/$DEP/exec" | grep -o 'doGet' | head -1
```
Expected: `Created version 13`, `@13`, `doGet` (‏"פונקציית הסקריפט לא נמצאה: doGet").

ניקוי, כי בתיקיות יש סודות: `rm -rf ~/.aroam-crm/gas-crm ~/.aroam-crm/gas-crm-live ~/.aroam-crm/gas-orders ~/.aroam-crm/gas-orders-live`

שחזור: ‏`update-deployment <מזהה> --versionNumber 5` ל-CRM, ו-`12` להזמנות.

- [ ] **Step 3: ‏push של רועי ובדיקה בחי**

רועי דוחף ב-GitHub Desktop. ברקע: לולאה עד ש-`https://aroam.co.il/agent/?nc=<זמן>` מכיל `agent.js?v=4` ו-`app.js?v=71`. אחר כך:
```bash
T=$(date +%s)
for u in "agent/?nc=$T" "crm-f428d7/?nc=$T" "js/agent.js?v=4" "js/app.js?v=71" "css/style.css?v=46" "js/rivhit-core.js?v=2" "crm-f428d7/crm.js?v=5" "catalog/?nc=$T"; do printf '%s -> ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' "https://aroam.co.il/$u"; done
curl -s "https://aroam.co.il/crm-f428d7/?nc=$T" | grep -c 'data-menu="items"'
curl -s "https://aroam.co.il/js/rivhit-core.js?v=2" | grep -c 'itemExportRows'
```
Expected: הכל `200`, ושתי הספירות `1` לפחות.

- [ ] **Step 4: רועי מעלה את הרשימה**

רועי, במחשב (הקובץ `~/Downloads/פריטים.csv`): ‏CRM ← תפריט ← "פריטים מריווחית" ← בחירת הקובץ ← "נמצאו 1,838 פריטים" ← "שמירה". אחר כך בטלפון: דף הסוכן ← רענון ← חיפוש של פריט שקיים רק בריווחית.

- [ ] **Step 5: ‏CLAUDE.md**

- בשורת הגרסאות בפרק הארכיטקטורה: `app.js?v=71`, ‏`style.css?v=46`, ‏`sw` cache-v67, ‏`agent.js?v=4`, ‏`crm.js?v=5`, ‏`rivhit-core.js?v=2`.
- ברשומה של `/agent/`: "מאז סבב 89 — חיפוש מוצא גם פריטים מריווחית (רשימה מה-CRM, עותק במכשיר)".
- סבב 89 בסוף "מה בוצע", לפני "העדפות של רועי". הסבב מסכם:
  - החלטות רועי.
  - מה נבנה בכל אחד מארבעת החלקים.
  - הבדיקות.
  - הפריסה: CRM 6, הזמנות 13, ה-push והעלאת הרשימה.
  - מה שלא נבדק חי.
  - שחזור.

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
CLAUDE.md: סבב 89 — פריטים מריווחית בדף הסוכן

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
