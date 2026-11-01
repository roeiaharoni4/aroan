# ממיר הזמנות לריווחית — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** קובץ HTML עצמאי שקורא טופס הזמנה באקסל של לקוח ומוריד קובץ TXT שריווחית השולחנית קולטת כמסמך (הזמנה / תעודת משלוח / חשבונית / הצעת מחיר).

**Architecture:** ארבעה מודולי JS טהורים ב-`tools/rivhit/src/` (טקסט, טופס הלקוח, שיוך, קובץ ריווחית) שנטענים גם ב-Node לבדיקות וגם בדפדפן תחת `window.RivhitCore`; מסך אחד (`ui.js` + `template.html`); `build.py` מזריק הכל — כולל SheetJS — לקובץ HTML יחיד ב-`tools/rivhit/dist/`.

**Tech Stack:** JavaScript (ES5 + Promise/TextEncoder, בלי framework), SheetJS CE 0.20.3, Python 3 לבנייה, Node 24 לבדיקות.

**Spec:** `docs/superpowers/specs/2026-11-01-rivhit-order-converter-design.md` · מבנה הרשומה: `docs/rivhit/ממשק-הפקת-מסמכים-מקובץ-חיצוני.pdf`

## Global Constraints

- קובץ הקליטה: TXT, שדות בטאב (ASCII 9), רשומות ב-CR+LF, בלי כותרות ובלי שורות ריקות (גם לא בסוף), 28 שדות בכל רשומה.
- תאריכים `DD/MM/YYYY`. מספרים בנקודה עשרונית, עד 4 ספרות אחריה, בלי אפסים מיותרים.
- אורכים: מק"ט 15, שם פריט 100, שם משפחה 30, כתובת-רחוב 30. מספר לקוח עד 5 ספרות. מספר פנימי עד 10 ספרות.
- קידוד ברירת מחדל Windows-1255; חלופה UTF-8 עם BOM.
- הקובץ הסופי עובד בלי אינטרנט: אין משאב חיצוני (פונטים, CDN, תמונות).
- הריפו פומבי: `mapping.json` מכיל רק מק"ט ושם — בלי מחירי עלות. רשימת הפריטים המלאה של רועי לא נכנסת לריפו.
- טקסט ממשק בעברית, בלי אימוג'ים, צבעי המותג (‎#639C7D, ‎#1A4231, ‎#EAF3EE).
- `tools/` מוחרג מהאתר ב-`_config.yml` — אין לגעת בקובצי האתר.

## File Structure

| קובץ | אחריות |
|---|---|
| `tools/rivhit/src/text.js` | נרמול טקסט, מפתח תיאור, מספרים, תאריכים |
| `tools/rivhit/src/order-form.js` | קריאת טופס הלקוח (מערכי שורות) לשורות הזמנה |
| `tools/rivhit/src/mapping.js` | רשימת פריטים מריווחית, שיוך תיאור ⇐ מק"ט, הצעות |
| `tools/rivhit/src/rivhit-file.js` | ולידציה, רשומות 28 שדות, סריאליזציה, קידוד, מספר פנימי, טביעת תוכן |
| `tools/rivhit/src/ui.js` | המסך |
| `tools/rivhit/src/template.html` | מבנה ועיצוב, סימוני הזרקה |
| `tools/rivhit/src/mapping.json` | לקוח ברירת מחדל + שיוך מובנה |
| `tools/rivhit/vendor/xlsx.full.min.js` | SheetJS CE 0.20.3 |
| `tools/rivhit/build.py` | בנייה לקובץ יחיד |
| `tools/rivhit/dist/ממיר הזמנות לריווחית.html` | התוצר |
| `tools/test/rivhit-*.test.js` | בדיקות Node |
| `tools/test/fixtures/rivhit-north-face-glilot.xlsx` | טופס ההזמנה האמיתי |

---

### Task 1: קריאת טופס ההזמנה

**Files:**
- Create: `tools/rivhit/src/text.js`, `tools/rivhit/src/order-form.js`
- Create: `tools/rivhit/vendor/xlsx.full.min.js` (הורדה), `tools/test/fixtures/rivhit-north-face-glilot.xlsx` (העתקה)
- Test: `tools/test/rivhit-order-form.test.js`

**Interfaces:**
- Produces (text.js): `normalizeText(v) → string`, `descKey(v) → string`, `toNumber(v) → number | null | NaN`, `parseIsoDate('YYYY-MM-DD') → Date | null`, `isoDate(Date) → 'YYYY-MM-DD'`, `rivhitDate(Date) → 'DD/MM/YYYY'`, `formatNumber(n) → string`, `pad2(n) → string`
- Produces (order-form.js): `findHeader(row) → {desc, qty, price, note} | null`, `parseSheetRows(rows, sheetName, firstRow) → Line[]`, `parseWorkbook([{name, rows, firstRow}]) → Line[]`, `branchFromFilename(name) → string`
- `Line = { sheet, row, desc, qty, qtyText, price, note }` — `qty` הוא NaN כשהכמות אינה מספר; `price` יכול להיות null/NaN.

- [ ] **Step 1: הכנת קבצים חיצוניים**

```bash
mkdir -p tools/rivhit/vendor tools/test/fixtures
curl -sL -o tools/rivhit/vendor/xlsx.full.min.js "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
node -e "console.log(require('./tools/rivhit/vendor/xlsx.full.min.js').version)"
cp "$HOME/Downloads/נורט פייס גלילות.xlsx" tools/test/fixtures/rivhit-north-face-glilot.xlsx
```
Expected: `0.20.3`

- [ ] **Step 2: כתיבת הבדיקה**

**T1a — Create `tools/test/rivhit-order-form.test.js`:**

```js
/**
 * ממיר הזמנות לריווחית — עזרי טקסט וקריאת טופס ההזמנה של הלקוח.
 * הטופס האמיתי (נורט פייס גלילות) נקרא עם אותה SheetJS שבקובץ הסופי.
 * להרצה: node tools/test/rivhit-order-form.test.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const XLSX = require('../rivhit/vendor/xlsx.full.min.js');
const T = require('../rivhit/src/text.js');
const F = require('../rivhit/src/order-form.js');

const FIXTURE = path.join(__dirname, 'fixtures', 'rivhit-north-face-glilot.xlsx');

function sheetsOf(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    return {
      name,
      firstRow: XLSX.utils.decode_range(ws['!ref']).s.r + 1,
      rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true })
    };
  });
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('הטופס האמיתי: 6 שורות עם כמות, סה"כ 240', () => {
  const lines = F.parseWorkbook(sheetsOf(FIXTURE));
  assert.strictEqual(lines.length, 6);
  const byDesc = {};
  lines.forEach(l => { byDesc[l.desc] = l; });
  assert.deepStrictEqual([byDesc['מים מזוקקים - 4 ליטר'].qty, byDesc['מים מזוקקים - 4 ליטר'].price], [5, 9]);
  assert.deepStrictEqual([byDesc['מגבונים לחים'].qty, byDesc['מגבונים לחים'].price], [10, 2]);
  assert.strictEqual(byDesc['כפפות לטקס 100 יח" M עם אבקה'].qty, 5);
  assert.strictEqual(byDesc["שרוול כוסות אספרסו - 50 יח' בשרוול"].qty, 10);
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  assert.strictEqual(total, 240);
});

test('מספר השורה הוא מספר השורה באקסל', () => {
  const lines = F.parseWorkbook(sheetsOf(FIXTURE));
  assert.strictEqual(lines[0].desc, 'מים מזוקקים - 4 ליטר');
  assert.strictEqual(lines[0].row, 4);
  assert.strictEqual(lines[0].sheet, 'ניקיון + חד פעמי');
});

test('כותרת הטבלה השנייה ("חד פעמי") מזוהה', () => {
  assert.deepStrictEqual(
    F.findHeader(['חד פעמי', 'מחיר', 'כמות להזמנה', 'סה"כ עלות למוצר', 'הערות']),
    { desc: 0, qty: 2, price: 1, note: 4 });
});

test('עמודות בסדר אחר ובלי עמודת הערות', () => {
  assert.deepStrictEqual(F.findHeader(['כמות', 'תיאור', 'מחיר ליח׳']),
    { desc: 1, qty: 0, price: 2, note: -1 });
});

test('שורת נתונים אינה כותרת', () => {
  assert.strictEqual(F.findHeader(['מים מזוקקים', 9, 5, 45, null]), null);
  assert.strictEqual(F.findHeader(null), null);
});

test('שורות סיכום, שורות בלי כמות וכמות 0 מדולגות', () => {
  const rows = [
    ['תאור פריט', 'מחיר', 'כמות'],
    ['א', 1, null],
    ['ב', 2, 0],
    ['סה"כ הזמנה', null, 7],
    [null, null, 3],
    ['ג', 3, 2]
  ];
  const lines = F.parseSheetRows(rows, 'גיליון', 1);
  assert.deepStrictEqual(lines.map(l => l.desc), ['ג']);
});

test('שורות לפני הכותרת הראשונה לא נלקחות', () => {
  const rows = [['הזמנה לסניף', null, 4], ['תאור', 'מחיר', 'כמות'], ['ד', 1, 1]];
  assert.deepStrictEqual(F.parseSheetRows(rows, '', 1).map(l => l.desc), ['ד']);
});

test('כמות שאינה מספר נשמרת כבעיה עם הטקסט המקורי', () => {
  const lines = F.parseSheetRows([['תאור', 'מחיר', 'כמות'], ['ג', 4, '2 קרטונים']], '', 1);
  assert.strictEqual(lines.length, 1);
  assert.ok(Number.isNaN(lines[0].qty));
  assert.strictEqual(lines[0].qtyText, '2 קרטונים');
});

test('כמות ומחיר כטקסט, הערות נלקחות', () => {
  const lines = F.parseSheetRows(
    [['תאור', 'מחיר', 'כמות', 'הערות'], ['ה', '₪ 4.5', '3 ', ' בצבע לבן ']], '', 1);
  assert.strictEqual(lines[0].qty, 3);
  assert.strictEqual(lines[0].price, 4.5);
  assert.strictEqual(lines[0].note, 'בצבע לבן');
});

test('מספר השורה מתחשב בשורה הראשונה של הטווח', () => {
  const lines = F.parseSheetRows([['תאור', 'מחיר', 'כמות'], ['ו', 1, 1]], '', 3);
  assert.strictEqual(lines[0].row, 4);
});

test('שם הסניף משם הקובץ', () => {
  assert.strictEqual(F.branchFromFilename('נורט פייס גלילות.xlsx'), 'נורט פייס גלילות');
  assert.strictEqual(F.branchFromFilename('טומי_רמת אביב .xls'), 'טומי רמת אביב');
});

test('מפתח תיאור: מירכאות, גרשיים ורווחים לא משנים', () => {
  const k = T.descKey("כפות פלסטיק חד פעמיים  100 יח'");
  assert.strictEqual(T.descKey('כפות פלסטיק חד פעמיים 100 יח`'), k);
  assert.strictEqual(T.descKey('כפות פלסטיק חד פעמיים 100 יח׳ '), k);
  assert.strictEqual(T.descKey('סבון ידיים "עונג" 4 ליטר'), T.descKey('סבון ידיים ״עונג״ 4 ליטר'));
  assert.notStrictEqual(T.descKey('צץ רץ 4000'), T.descKey('צץ רץ 2000'));
});

test('toNumber', () => {
  assert.strictEqual(T.toNumber(5), 5);
  assert.strictEqual(T.toNumber('1,200'), 1200);
  assert.strictEqual(T.toNumber(' 3.5 '), 3.5);
  assert.strictEqual(T.toNumber(''), null);
  assert.strictEqual(T.toNumber(null), null);
  assert.ok(Number.isNaN(T.toNumber('שניים')));
  assert.ok(Number.isNaN(T.toNumber(true)));
});

test('תאריכים', () => {
  assert.strictEqual(T.rivhitDate(new Date(2026, 10, 1)), '01/11/2026');
  assert.strictEqual(T.isoDate(new Date(2026, 0, 9)), '2026-01-09');
  assert.strictEqual(T.parseIsoDate('2026-02-30'), null);
  assert.strictEqual(T.parseIsoDate('01/11/2026'), null);
  assert.strictEqual(T.rivhitDate(T.parseIsoDate('2026-10-28')), '28/10/2026');
});

test('formatNumber: עד 4 ספרות, בלי אפסים מיותרים', () => {
  assert.strictEqual(T.formatNumber(12), '12');
  assert.strictEqual(T.formatNumber(13.2), '13.2');
  assert.strictEqual(T.formatNumber(1.25), '1.25');
  assert.strictEqual(T.formatNumber(3.65 * 6), '21.9');
  assert.strictEqual(T.formatNumber(1.23456), '1.2346');
  assert.strictEqual(T.formatNumber(0), '0');
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

- [ ] **Step 3: להריץ ולוודא שנכשל**

Run: `node tools/test/rivhit-order-form.test.js`
Expected: `Error: Cannot find module '../rivhit/src/text.js'`

- [ ] **Step 4: מימוש**

**T1b — Create `tools/rivhit/src/text.js`:**

```js
/**
 * ממיר הזמנות לריווחית — עזרי טקסט, מספרים ותאריכים.
 * כל קבצי src/ נטענים גם בדפדפן (תחת window.RivhitCore) וגם ב-Node לבדיקות.
 */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory();
  if (node) module.exports = api;
  else root.RivhitCore = Object.assign(root.RivhitCore || {}, api);
})(this, function () {
  'use strict';

  // מאחד סוגי מירכאות, גרשיים ומקפים, ומכווץ רווחים (כולל טאבים וירידות שורה)
  function normalizeText(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/[״“”„]/g, '"')
      .replace(/[׳‘’`´]/g, "'")
      .replace(/[–—־]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // מפתח להשוואת תיאורים: "100 יח'" = "100 יח׳" = "100  יח`"
  function descKey(v) {
    return normalizeText(v)
      .replace(/["']/g, '')
      .replace(/\s*-\s*/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // מספר מתא: number כמו שהוא; "1,200" / "₪ 9" ⇒ מספר; ריק ⇒ null; כל השאר ⇒ NaN
  function toNumber(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v !== 'string') return NaN;
    var s = v.replace(/[₪,\s]/g, '');
    if (s === '') return null;
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function parseIsoDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getMonth() === Number(m[2]) - 1 ? d : null;
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function rivhitDate(d) {
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  // עד 4 ספרות אחרי הנקודה, בלי אפסים מיותרים: 12 ⇒ "12", 13.2 ⇒ "13.2"
  function formatNumber(n) {
    return (Math.round(n * 10000) / 10000).toFixed(4).replace(/\.?0+$/, '');
  }

  return {
    normalizeText: normalizeText,
    descKey: descKey,
    toNumber: toNumber,
    pad2: pad2,
    parseIsoDate: parseIsoDate,
    isoDate: isoDate,
    rivhitDate: rivhitDate,
    formatNumber: formatNumber
  };
});
```

**T1c — Create `tools/rivhit/src/order-form.js`:**

```js
/**
 * ממיר הזמנות לריווחית — קריאת טופס ההזמנה של הלקוח.
 * לא תלוי במבנה קבוע: בכל גיליון מוצא שורות כותרת (תא "מחיר" + תא "כמות"),
 * ומתחת לכל כותרת לוקח את השורות שמולאה בהן כמות.
 * הקלט: שורות גיליון כמערכי תאים (sheet_to_json עם header: 1).
 */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./text.js') : root.RivhitCore);
  if (node) module.exports = api;
  else root.RivhitCore = Object.assign(root.RivhitCore || {}, api);
})(this, function (T) {
  'use strict';

  var TOTAL_RE = /^(סה"?כ|סך)/;

  function cellText(v) { return typeof v === 'string' ? T.normalizeText(v) : ''; }

  // שורת כותרת ⇒ אינדקסי העמודות; כל שורה אחרת ⇒ null
  function findHeader(row) {
    if (!row || !row.length) return null;
    var texts = row.map(cellText);
    var cols = { desc: -1, qty: -1, price: -1, note: -1 };
    texts.forEach(function (t, i) {
      if (!t) return;
      if (t.indexOf('כמות') !== -1) { if (cols.qty < 0) cols.qty = i; }
      else if (t.indexOf('הער') !== -1) { if (cols.note < 0) cols.note = i; }
      else if (t.indexOf('מחיר') !== -1 && !/סה"?כ|סך/.test(t)) { if (cols.price < 0) cols.price = i; }
    });
    if (cols.qty < 0 || cols.price < 0) return null;
    // עמודת התיאור: התא הטקסטואלי הראשון שאינו כמות/מחיר/הערות/סה"כ
    for (var i = 0; i < texts.length; i++) {
      if (!texts[i] || i === cols.qty || i === cols.price || i === cols.note) continue;
      if (/סה"?כ|סך/.test(texts[i])) continue;
      cols.desc = i;
      break;
    }
    return cols.desc < 0 ? null : cols;
  }

  function parseSheetRows(rows, sheetName, firstRow) {
    var lines = [], cols = null, base = firstRow || 1;
    (rows || []).forEach(function (row, r) {
      if (!row) return;
      var header = findHeader(row);
      if (header) { cols = header; return; }
      if (!cols) return;
      var desc = T.normalizeText(row[cols.desc]);
      if (!desc || TOTAL_RE.test(desc)) return;
      var qty = T.toNumber(row[cols.qty]);
      if (qty === null || qty === 0) return;
      lines.push({
        sheet: sheetName || '',
        row: base + r,
        desc: desc,
        qty: qty,
        qtyText: T.normalizeText(row[cols.qty]),
        price: T.toNumber(row[cols.price]),
        note: cols.note >= 0 ? T.normalizeText(row[cols.note]) : ''
      });
    });
    return lines;
  }

  function parseWorkbook(sheets) {
    var lines = [];
    (sheets || []).forEach(function (s) {
      lines = lines.concat(parseSheetRows(s.rows, s.name, s.firstRow));
    });
    return lines;
  }

  // "נורט פייס גלילות.xlsx" ⇒ "נורט פייס גלילות"
  function branchFromFilename(name) {
    return T.normalizeText(String(name || '').replace(/\.[^.]+$/, '').replace(/_+/g, ' '));
  }

  return {
    findHeader: findHeader,
    parseSheetRows: parseSheetRows,
    parseWorkbook: parseWorkbook,
    branchFromFilename: branchFromFilename
  };
});
```

- [ ] **Step 5: להריץ ולוודא שעובר**

Run: `node tools/test/rivhit-order-form.test.js`
Expected: `כל 15 הבדיקות עברו`

- [ ] **Step 6: Commit**

```bash
git add tools/rivhit/src/text.js tools/rivhit/src/order-form.js tools/rivhit/vendor/xlsx.full.min.js tools/test/rivhit-order-form.test.js tools/test/fixtures/rivhit-north-face-glilot.xlsx
git commit -m "ממיר ריווחית: קריאת טופס ההזמנה של הלקוח"
```

---

### Task 2: קובץ הקליטה של ריווחית

**Files:**
- Create: `tools/rivhit/src/rivhit-file.js`
- Test: `tools/test/rivhit-file.test.js`

**Interfaces:**
- Consumes: `text.js` (Task 1).
- Produces: `DOC_TYPES = [{code, label}]`, `validateSettings({customerNo, customerName}) → string[]`, `validateOrder(Order) → string[]`, `buildRecords(Order, {docType, customerNo, customerName, internalNo, today}) → string[28][]`, `serialize(records) → string`, `encodeCp1255(text) → {bytes: Uint8Array, unknown}`, `encodeText(text, 'cp1255'|'utf8') → {bytes, unknown}`, `nextInternalNo(counter|null, Date) → {no: string, counter: {day, n}}`, `orderFingerprint(Order) → string`.
- `Order = { branch, date: 'YYYY-MM-DD', lines: ResolvedLine[] }`; `ResolvedLine = Line + { code, name, known }`.

- [ ] **Step 1: כתיבת הבדיקה**

**T2a — Create `tools/test/rivhit-file.test.js`:**

```js
/**
 * ממיר הזמנות לריווחית — בניית קובץ הקליטה (28 שדות, טאבים, CR+LF, Windows-1255).
 * מבנה הרשומה: docs/rivhit/ממשק-הפקת-מסמכים-מקובץ-חיצוני.pdf
 * להרצה: node tools/test/rivhit-file.test.js
 */
const assert = require('assert');
const R = require('../rivhit/src/rivhit-file.js');

const ORDER = {
  branch: 'נורט פייס גלילות',
  date: '2026-11-01',
  lines: [
    { row: 4, desc: 'מים מזוקקים - 4 ליטר', qty: 5, price: 9, note: '',
      code: 'A100', name: 'מים מזוקקים 4 ליטר', known: true },
    { row: 21, desc: 'כפפות לטקס 100 יח" M עם אבקה', qty: 5, price: 12, note: 'מידה M',
      code: 'G-12', name: '', known: false }
  ]
};
const OPTS = {
  docType: 7, customerNo: '00123', customerName: 'רשת אופנה בע"מ',
  internalNo: '2611010001', today: new Date(2026, 10, 1)
};

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('רשומה לכל שורה, 28 שדות בכל רשומה', () => {
  const recs = R.buildRecords(ORDER, OPTS);
  assert.strictEqual(recs.length, 2);
  recs.forEach(r => assert.strictEqual(r.length, 28));
});

test('השדות במקומם לפי המדריך', () => {
  const r = R.buildRecords(ORDER, OPTS)[0];
  assert.strictEqual(r[0], '1');                 // 1 קוד מסמך
  assert.strictEqual(r[1], '01/11/2026');        // 2 תאריך יצירה
  assert.strictEqual(r[2], '01/11/2026');        // 3 תאריך הפעולה
  assert.strictEqual(r[3], '7');                 // 4 סוג מסמך: הזמנה
  assert.strictEqual(r[4], 'A100');              // 5 מספר קטלוגי
  assert.strictEqual(r[5], 'מים מזוקקים 4 ליטר'); // 6 שם פריט
  assert.strictEqual(r[6], '5');                 // 7 כמות
  assert.strictEqual(r[7], '9');                 // 8 מחיר ליחידה
  assert.strictEqual(r[8], '45');                // 9 סה"כ לשורה
  assert.strictEqual(r[9], '123');               // 10 מספר לקוח
  assert.strictEqual(r[10], 'רשת אופנה בע״מ');   // 11 שם משפחה — מירכאות ⇐ גרשיים
  assert.strictEqual(r[12], 'נורט פייס גלילות'); // 13 כתובת-רחוב: הסניף
  assert.strictEqual(r[14], '2611010001');       // 15 מספר פעולה פנימי
  assert.strictEqual(r[25], '1');                // 26 סדר הדפסה
  [11, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27].forEach(i =>
    assert.strictEqual(r[i], '', 'שדה ' + (i + 1) + ' צריך להיות ריק'));
});

test('בלי שם בריווחית: תיאור הלקוח, והערה מצורפת', () => {
  const r = R.buildRecords(ORDER, OPTS)[1];
  assert.strictEqual(r[5], 'כפפות לטקס 100 יח״ M עם אבקה - מידה M');
  assert.strictEqual(r[25], '2');
});

test('תאריך ההזמנה שונה מתאריך היצירה', () => {
  const r = R.buildRecords(Object.assign({}, ORDER, { date: '2026-10-28' }), OPTS)[0];
  assert.strictEqual(r[1], '01/11/2026');
  assert.strictEqual(r[2], '28/10/2026');
});

test('מחרוזות נחתכות לאורך המותר', () => {
  const long = Object.assign({}, ORDER, {
    branch: 'ס'.repeat(40),
    lines: [Object.assign({}, ORDER.lines[0], { name: 'ש'.repeat(150) })]
  });
  const r = R.buildRecords(long, Object.assign({}, OPTS, { customerName: 'ל'.repeat(40) }))[0];
  assert.strictEqual(r[5].length, 100);
  assert.strictEqual(r[10].length, 30);
  assert.strictEqual(r[12].length, 30);
});

test('סריאליזציה: טאבים, CR+LF בין רשומות, בלי שורה ריקה בסוף', () => {
  const text = R.serialize(R.buildRecords(ORDER, OPTS));
  const lines = text.split('\r\n');
  assert.strictEqual(lines.length, 2);
  lines.forEach(l => assert.strictEqual(l.split('\t').length, 28));
  assert.ok(!text.endsWith('\r\n'));
  assert.ok(!/[\r\n]/.test(text.replace(/\r\n/g, '')), 'CR או LF בודד');
});

test('Windows-1255: עברית, גרשיים, שקל', () => {
  assert.deepStrictEqual(Array.from(R.encodeCp1255('אבג').bytes), [0xE0, 0xE1, 0xE2]);
  assert.deepStrictEqual(Array.from(R.encodeCp1255('ת').bytes), [0xFA]);
  assert.deepStrictEqual(Array.from(R.encodeCp1255('״׳').bytes), [0xD8, 0xD7]);
  assert.deepStrictEqual(Array.from(R.encodeCp1255('₪').bytes), [0xA4]);
  assert.deepStrictEqual(Array.from(R.encodeCp1255('A1\t.').bytes), [0x41, 0x31, 0x09, 0x2E]);
});

test('Windows-1255: תו לא נתמך ⇒ ? ונספר', () => {
  const enc = R.encodeCp1255('א😀');
  assert.deepStrictEqual(Array.from(enc.bytes), [0xE0, 0x3F, 0x3F]);
  assert.strictEqual(enc.unknown, 2);
});

test('טבלת 1255 תואמת למפענח של Node', () => {
  const dec = new TextDecoder('windows-1255');
  for (let b = 0x80; b <= 0xFF; b++) {
    const ch = dec.decode(Uint8Array.of(b));
    const enc = R.encodeCp1255(ch);
    if (enc.unknown === 0) assert.strictEqual(enc.bytes[0], b, 'בייט 0x' + b.toString(16));
  }
  'אבגדהוזחטיכךלמםנןסעפףצץקרשת'.split('').forEach(ch =>
    assert.strictEqual(R.encodeCp1255(ch).unknown, 0, ch));
});

test('UTF-8 עם BOM', () => {
  const enc = R.encodeText('א', 'utf8');
  assert.deepStrictEqual(Array.from(enc.bytes), [0xEF, 0xBB, 0xBF, 0xD7, 0x90]);
  assert.deepStrictEqual(Array.from(R.encodeText('א', 'cp1255').bytes), [0xE0]);
});

test('מספר פנימי: מונה יומי YYMMDDNNNN', () => {
  const d1 = new Date(2026, 10, 1), d2 = new Date(2026, 10, 2);
  const a = R.nextInternalNo(null, d1);
  assert.strictEqual(a.no, '2611010001');
  const b = R.nextInternalNo(a.counter, d1);
  assert.strictEqual(b.no, '2611010002');
  assert.strictEqual(R.nextInternalNo(b.counter, d2).no, '2611020001');
  assert.throws(() => R.nextInternalNo({ day: '261101', n: 9999 }, d1));
});

test('הגדרות: מספר לקוח עד 5 ספרות ושם כרטיס', () => {
  assert.deepStrictEqual(R.validateSettings({ customerNo: '00123', customerName: 'רשת' }), []);
  assert.strictEqual(R.validateSettings({ customerNo: '', customerName: 'רשת' }).length, 1);
  assert.strictEqual(R.validateSettings({ customerNo: '123456', customerName: 'רשת' }).length, 1);
  assert.strictEqual(R.validateSettings({ customerNo: '0', customerName: 'רשת' }).length, 1);
  assert.strictEqual(R.validateSettings({ customerNo: '12', customerName: ' ' }).length, 1);
});

test('הזמנה תקינה עוברת ולידציה', () => {
  assert.deepStrictEqual(R.validateOrder(ORDER), []);
});

test('ולידציה: מק"ט חסר, מחיר null, כמות לא מובנת, מק"ט ארוך', () => {
  const bad = Object.assign({}, ORDER, {
    branch: '',
    date: 'x',
    lines: [
      Object.assign({}, ORDER.lines[0], { code: '' }),
      Object.assign({}, ORDER.lines[0], { price: null }),
      Object.assign({}, ORDER.lines[0], { qty: NaN }),
      Object.assign({}, ORDER.lines[0], { code: 'X'.repeat(16) })
    ]
  });
  const p = R.validateOrder(bad);
  assert.strictEqual(p.length, 6);
  assert.ok(p.some(s => s.indexOf('הסניף') !== -1));
  assert.ok(p.some(s => s.indexOf('מחיר חסר') !== -1));
  assert.deepStrictEqual(R.validateOrder(Object.assign({}, ORDER, { lines: [] })),
    ['לא נמצאו שורות עם כמות']);
});

test('טביעת תוכן: סדר השורות לא משנה, כמות כן', () => {
  const a = R.orderFingerprint(ORDER);
  const reversed = Object.assign({}, ORDER, { lines: ORDER.lines.slice().reverse() });
  assert.strictEqual(R.orderFingerprint(reversed), a);
  const spaced = Object.assign({}, ORDER, { branch: ' נורט  פייס גלילות' });
  assert.strictEqual(R.orderFingerprint(spaced), a);
  const changed = Object.assign({}, ORDER, {
    lines: [Object.assign({}, ORDER.lines[0], { qty: 6 }), ORDER.lines[1]]
  });
  assert.notStrictEqual(R.orderFingerprint(changed), a);
});

test('סוגי מסמך: הזמנה ראשונה', () => {
  assert.deepStrictEqual(R.DOC_TYPES.map(d => d.code), [7, 4, 1, 6]);
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

- [ ] **Step 2: להריץ ולוודא שנכשל**

Run: `node tools/test/rivhit-file.test.js`
Expected: `Error: Cannot find module '../rivhit/src/rivhit-file.js'`

- [ ] **Step 3: מימוש**

**T2b — Create `tools/rivhit/src/rivhit-file.js`:**

```js
/**
 * ממיר הזמנות לריווחית — בניית קובץ הקליטה.
 * לפי "ממשק להפקת מסמכים מקובץ חיצוני" (docs/rivhit/): TXT, 28 שדות בטאב,
 * רשומה לכל שורת פריט, CR+LF בין רשומות, בלי כותרות ובלי שורות ריקות.
 * כל הרשומות עם אותו מספר פנימי (שדה 15) הן מסמך אחד בריווחית.
 */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./text.js') : root.RivhitCore);
  if (node) module.exports = api;
  else root.RivhitCore = Object.assign(root.RivhitCore || {}, api);
})(this, function (T) {
  'use strict';

  var FIELD_COUNT = 28;

  // שדה 4 לקוד מסמך 1 (חשבונית/מסמך). הראשון הוא ברירת המחדל.
  var DOC_TYPES = [
    { code: 7, label: 'הזמנה' },
    { code: 4, label: 'תעודת משלוח' },
    { code: 1, label: 'חשבונית מס' },
    { code: 6, label: 'הצעת מחיר' }
  ];

  // בייטים 0x80–0xFF של Windows-1255 (נוצר מ-codecs של Python; � = לא מוגדר)
  var CP1255_HIGH =
    '€�‚ƒ„…†‡ˆ‰�‹����' +
    '�‘’“”•–—˜™�›����' +
    ' ¡¢£₪¥¦§¨©×«¬­®¯' +
    '°±²³´µ¶·¸¹÷»¼½¾¿' +
    'ְֱֲֳִֵֶַָֹ�ֻּֽ־ֿ' +
    '׀ׁׂ׃װױײ׳״�������' +
    'אבגדהוזחטיךכלםמן' +
    'נסעףפץצקרשת��‎‏�';

  var cp1255Map = null;

  // מחרוזת לשדה טקסט: בלי טאבים/ירידות שורה, ומירכאות ⇐ גרשיים עבריים
  // (כדי שמנגנון הקליטה לא יפרש " כתוחם טקסט)
  function outString(v, max) {
    return T.normalizeText(v).replace(/"/g, '״').replace(/'/g, '׳').slice(0, max);
  }

  // המק"ט נשאר כמו שהוא — שינוי תו בו הוא מק"ט אחר
  function outCode(v) {
    return String(v == null ? '' : v).replace(/[\t\r\n]/g, '').trim();
  }

  function validateSettings(s) {
    var p = [];
    var no = String(s.customerNo == null ? '' : s.customerNo).trim();
    if (!/^\d{1,5}$/.test(no) || Number(no) < 1) p.push('מספר הלקוח בריווחית חסר או לא תקין (עד 5 ספרות)');
    if (!T.normalizeText(s.customerName)) p.push('שם כרטיס הלקוח חסר');
    return p;
  }

  function validateOrder(order) {
    var p = [];
    if (!T.normalizeText(order.branch)) p.push('שם הסניף חסר');
    if (!T.parseIsoDate(order.date)) p.push('תאריך ההזמנה לא תקין');
    if (!order.lines.length) p.push('לא נמצאו שורות עם כמות');
    order.lines.forEach(function (l) {
      var where = 'שורה ' + l.row + ' (' + l.desc + ')';
      if (!l.code) p.push(where + ': אין מק״ט בריווחית');
      else if (outCode(l.code).length > 15) p.push(where + ': מק״ט ארוך מ-15 תווים');
      if (!(typeof l.qty === 'number' && l.qty > 0)) p.push(where + ': כמות לא מובנת');
      if (!(typeof l.price === 'number' && l.price >= 0)) p.push(where + ': מחיר חסר');
    });
    return p;
  }

  function buildRecords(order, opts) {
    var created = T.rivhitDate(opts.today);
    var opDate = T.rivhitDate(T.parseIsoDate(order.date));
    return order.lines.map(function (l, i) {
      var f = [];
      for (var k = 0; k < FIELD_COUNT; k++) f.push('');
      var name = l.name || l.desc;
      f[0] = '1';                                          // קוד מסמך: חשבונית/מסמך
      f[1] = created;                                      // תאריך יצירת הקובץ
      f[2] = opDate;                                       // תאריך הפעולה המקורית
      f[3] = String(opts.docType);                         // סוג מסמך
      f[4] = outCode(l.code);                              // מספר קטלוגי
      f[5] = outString(l.note ? name + ' - ' + l.note : name, 100); // שם פריט
      f[6] = T.formatNumber(l.qty);                        // כמות
      f[7] = T.formatNumber(l.price);                      // מחיר ליחידה
      f[8] = T.formatNumber(l.qty * l.price);              // סה"כ לשורה
      f[9] = String(Number(opts.customerNo));              // מספר לקוח
      f[10] = outString(opts.customerName, 30);            // שם משפחה
      f[12] = outString(order.branch, 30);                 // כתובת – רחוב: הסניף
      f[14] = String(opts.internalNo);                     // מספר פעולה פנימי
      f[25] = String(i + 1);                               // סדר הדפסה במסמך
      return f;
    });
  }

  function serialize(records) {
    return records.map(function (r) { return r.join('\t'); }).join('\r\n');
  }

  function encodeCp1255(text) {
    if (!cp1255Map) {
      cp1255Map = {};
      for (var i = 0; i < 128; i++) {
        var ch = CP1255_HIGH.charAt(i);
        if (ch !== '�') cp1255Map[ch] = 0x80 + i;
      }
    }
    var out = [], unknown = 0;
    for (var j = 0; j < text.length; j++) {
      var c = text.charCodeAt(j);
      if (c < 0x80) { out.push(c); continue; }
      var b = cp1255Map[text.charAt(j)];
      if (b === undefined) { out.push(0x3F); unknown++; } else out.push(b);
    }
    return { bytes: new Uint8Array(out), unknown: unknown };
  }

  function encodeText(text, encoding) {
    if (encoding !== 'utf8') return encodeCp1255(text);
    var body = new TextEncoder().encode(text);
    var bytes = new Uint8Array(body.length + 3);
    bytes.set([0xEF, 0xBB, 0xBF]);
    bytes.set(body, 3);
    return { bytes: bytes, unknown: 0 };
  }

  // מספר פעולה פנימי: YYMMDD + מונה יומי בן 4 ספרות (עד 10 ספרות לפי המדריך)
  function nextInternalNo(counter, today) {
    var day = String(today.getFullYear()).slice(2) + T.pad2(today.getMonth() + 1) + T.pad2(today.getDate());
    var n = counter && counter.day === day ? counter.n + 1 : 1;
    if (n > 9999) throw new Error('הופקו היום 9,999 הזמנות — אין מספר פנימי פנוי עד מחר');
    return { no: day + ('000' + n).slice(-4), counter: { day: day, n: n } };
  }

  // טביעת תוכן להזמנה (סניף + שורות, בלי תאריך) — לאזהרה על הפקה כפולה
  function orderFingerprint(order) {
    var parts = order.lines.map(function (l) {
      return T.descKey(l.desc) + '|' + l.qty + '|' + l.price;
    }).sort();
    var s = T.descKey(order.branch) + '\n' + parts.join('\n');
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  return {
    DOC_TYPES: DOC_TYPES,
    validateSettings: validateSettings,
    validateOrder: validateOrder,
    buildRecords: buildRecords,
    serialize: serialize,
    encodeCp1255: encodeCp1255,
    encodeText: encodeText,
    nextInternalNo: nextInternalNo,
    orderFingerprint: orderFingerprint
  };
});
```

- [ ] **Step 4: להריץ ולוודא שעובר**

Run: `node tools/test/rivhit-file.test.js`
Expected: `כל 16 הבדיקות עברו`

- [ ] **Step 5: Commit**

```bash
git add tools/rivhit/src/rivhit-file.js tools/test/rivhit-file.test.js
git commit -m "ממיר ריווחית: בניית קובץ הקליטה (28 שדות, Windows-1255)"
```

---

### Task 3: רשימת הפריטים, שיוך והצעות

**Files:**
- Create: `tools/rivhit/src/mapping.js`
- Test: `tools/test/rivhit-mapping.test.js`

**Interfaces:**
- Consumes: `text.js` (Task 1); `Line` (Task 1).
- Produces: `parseItemList(rows) → {items: [{code, name}], error}`, `indexItems(items) → {code: item}`, `indexMap([{desc, code, name}]) → {descKey: {code, name}}`, `resolveLines(Line[], map, itemsByCode) → ResolvedLine[]`, `suggest(desc, items, limit) → item[]`.

- [ ] **Step 1: כתיבת הבדיקה**

**T3a — Create `tools/test/rivhit-mapping.test.js`:**

```js
/**
 * ממיר הזמנות לריווחית — רשימת הפריטים מריווחית, שיוך תיאור ⇐ מק"ט והצעות.
 * להרצה: node tools/test/rivhit-mapping.test.js
 */
const assert = require('assert');
const M = require('../rivhit/src/mapping.js');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('רשימת פריטים: כותרת לא בשורה הראשונה, מק"ט מספרי, כפילויות ושורות ריקות', () => {
  const res = M.parseItemList([
    ['דוח פריטים'],
    [],
    ['מספר קטלוגי', 'שם פריט', 'מחיר מכירה'],
    [1001, 'צץ רץ 4000', 39],
    ['A-5', ' מים מזוקקים  4 ליטר', 9],
    [null, 'שורה בלי קוד', 1],
    [1001, 'כפילות', 1]
  ]);
  assert.strictEqual(res.error, '');
  assert.deepStrictEqual(res.items, [
    { code: '1001', name: 'צץ רץ 4000' },
    { code: 'A-5', name: 'מים מזוקקים 4 ליטר' }
  ]);
});

test('רשימת פריטים: כותרות מק״ט ותיאור', () => {
  const res = M.parseItemList([['תיאור', 'מק״ט'], ['כפפות ניטריל', 'K-1']]);
  assert.deepStrictEqual(res.items, [{ code: 'K-1', name: 'כפפות ניטריל' }]);
});

test('רשימת פריטים: "מק״ט" גובר על "קוד מיון"', () => {
  const res = M.parseItemList([['קוד מיון', 'מק"ט', 'שם'], [100, 'Z9', 'ספוג']]);
  assert.deepStrictEqual(res.items, [{ code: 'Z9', name: 'ספוג' }]);
});

test('רשימת פריטים בלי כותרת ⇒ שגיאה', () => {
  const res = M.parseItemList([[1, 'א'], [2, 'ב']]);
  assert.deepStrictEqual(res.items, []);
  assert.ok(res.error.length > 0);
});

test('שיוך מובנה: המפתח מנורמל', () => {
  const map = M.indexMap([{ desc: 'כפות פלסטיק 100 יח`', code: 'C1', name: 'כף 100' }]);
  const lines = M.resolveLines([{ desc: "כפות פלסטיק  100 יח'", qty: 1, price: 3.5 }], map, {});
  assert.strictEqual(lines[0].code, 'C1');
  assert.strictEqual(lines[0].name, 'כף 100');
  assert.strictEqual(lines[0].known, false);
});

test('שם מרשימת הפריטים גובר על השם בשיוך', () => {
  const map = M.indexMap([{ desc: 'מים', code: 'A-5', name: 'שם ישן' }]);
  const by = M.indexItems([{ code: 'A-5', name: 'מים מזוקקים 4 ליטר' }]);
  const r = M.resolveLines([{ desc: 'מים', qty: 2, price: 9, row: 3 }], map, by)[0];
  assert.deepStrictEqual([r.code, r.name, r.known, r.qty, r.row], ['A-5', 'מים מזוקקים 4 ליטר', true, 2, 3]);
});

test('שורה בלי שיוך: מק"ט ריק', () => {
  const r = M.resolveLines([{ desc: 'משהו חדש', qty: 1, price: 1 }], {}, {})[0];
  assert.deepStrictEqual([r.code, r.name, r.known], ['', '', false]);
});

test('קוד מספרי בשיוך נשמר כמחרוזת', () => {
  const map = M.indexMap([{ desc: 'א', code: 1001, name: '' }]);
  assert.strictEqual(M.resolveLines([{ desc: 'א', qty: 1, price: 1 }], map, {})[0].code, '1001');
});

test('הצעות: המוצר הנכון ראשון, מספרים מכריעים', () => {
  const items = [
    { code: 'P2', name: 'צץ רץ 2000 מגבות' },
    { code: 'P4', name: 'צץ רץ 4000 שניב' },
    { code: 'W', name: 'מים מזוקקים 4 ליטר' }
  ];
  const s = M.suggest('נייר ניגוב ידיים צץ רץ 4000 מגבות ידיים שניב', items, 2);
  assert.deepStrictEqual(s.map(i => i.code), ['P4', 'P2']);
});

test('הצעות: גליל טואלט 50 מול 32', () => {
  const items = [
    { code: 'T32', name: 'נייר טואלט 32 גלילים' },
    { code: 'T50', name: 'נייר טואלט קומפקט 50 - 36 יח' },
    { code: 'N', name: 'נייר ניגוב' }
  ];
  assert.strictEqual(M.suggest('נייר טואלט 50 מטר (36 גלילים)', items, 3)[0].code, 'T50');
});

test('הצעות: אין חפיפה ⇒ ריק', () => {
  assert.deepStrictEqual(M.suggest('אבגד', [{ code: '1', name: 'הוזח' }], 3), []);
  assert.deepStrictEqual(M.suggest('אבגד', [], 3), []);
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

- [ ] **Step 2: להריץ ולוודא שנכשל**

Run: `node tools/test/rivhit-mapping.test.js`
Expected: `Error: Cannot find module '../rivhit/src/mapping.js'`

- [ ] **Step 3: מימוש**

**T3b — Create `tools/rivhit/src/mapping.js`:**

```js
/**
 * ממיר הזמנות לריווחית — רשימת הפריטים מריווחית ושיוך תיאור ⇐ מק"ט.
 * ריווחית מזהה פריט לפי המספר הקטלוגי, ובטופס של הלקוח יש רק תיאור —
 * לכן כל תיאור משויך פעם אחת למק"ט, והשיוך נשמר לפעם הבאה.
 */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./text.js') : root.RivhitCore);
  if (node) module.exports = api;
  else root.RivhitCore = Object.assign(root.RivhitCore || {}, api);
})(this, function (T) {
  'use strict';

  // לפי סדר עדיפות: "מק"ט"/"מספר קטלוגי" לפני "קוד" (שעלול להיות "קוד מיון")
  var CODE_HEADERS = [/מק"?ט/, /קטלוג/, /^קוד/, /^(sku|catalog|item ?code|code)\b/i];
  var NAME_HEADERS = [/^שם/, /תי?אור/, /שם/, /^(name|description|desc)\b/i];

  function headerText(v) { return typeof v === 'string' ? T.normalizeText(v) : ''; }

  function codeText(v) {
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    return T.normalizeText(v);
  }

  function indexMatching(texts, patterns, skip) {
    for (var p = 0; p < patterns.length; p++) {
      for (var i = 0; i < texts.length; i++) {
        if (i !== skip && texts[i] && patterns[p].test(texts[i])) return i;
      }
    }
    return -1;
  }

  // רשימת פריטים שיוצאה מריווחית: מחפש בשורות הראשונות כותרת עם מק"ט ושם
  function parseItemList(rows) {
    rows = rows || [];
    for (var r = 0; r < Math.min(rows.length, 15); r++) {
      var texts = (rows[r] || []).map(headerText);
      var codeCol = indexMatching(texts, CODE_HEADERS, -1);
      if (codeCol < 0) continue;
      var nameCol = indexMatching(texts, NAME_HEADERS, codeCol);
      if (nameCol < 0) continue;
      var seen = {}, items = [];
      for (var i = r + 1; i < rows.length; i++) {
        var row = rows[i] || [];
        var code = codeText(row[codeCol]);
        var name = T.normalizeText(row[nameCol]);
        if (!code || !name || seen[code]) continue;
        seen[code] = true;
        items.push({ code: code, name: name });
      }
      return { items: items, error: items.length ? '' : 'נמצאה שורת כותרת אבל אין מתחתיה פריטים' };
    }
    return { items: [], error: 'לא נמצאה שורת כותרת עם עמודת מק״ט ועמודת שם פריט' };
  }

  function indexItems(items) {
    var by = {};
    (items || []).forEach(function (it) { by[it.code] = it; });
    return by;
  }

  // שיוך מובנה (mapping.json) ⇒ אובייקט לפי מפתח התיאור
  function indexMap(list) {
    var map = {};
    (list || []).forEach(function (e) {
      if (e && e.desc && e.code !== undefined && e.code !== '') {
        map[T.descKey(e.desc)] = { code: String(e.code), name: e.name || '' };
      }
    });
    return map;
  }

  function resolveLines(lines, map, itemsByCode) {
    map = map || {};
    itemsByCode = itemsByCode || {};
    return lines.map(function (l) {
      var m = map[T.descKey(l.desc)];
      var code = m ? String(m.code) : '';
      var item = code ? itemsByCode[code] : null;
      var out = {};
      for (var k in l) out[k] = l[k];
      out.code = code;
      out.name = item ? item.name : (m && m.name) || '';
      out.known = !!item;
      return out;
    });
  }

  function tokens(s) {
    return T.descKey(s)
      .replace(/[^֐-׿a-z0-9.\s]/g, ' ')
      .split(/\s+/)
      .filter(function (t) { return t.length > 1 || /\d/.test(t); });
  }

  // הצעות לשורה בלי שיוך: מילים משותפות, ומספר זהה שווה פי 3 (4000 ≠ 2000)
  function suggest(desc, items, limit) {
    var want = tokens(desc);
    var scored = [];
    (items || []).forEach(function (it) {
      var have = tokens(it.name + ' ' + it.code);
      var score = 0;
      want.forEach(function (w) {
        var isNum = /\d/.test(w);
        if (have.indexOf(w) !== -1) { score += isNum ? 3 : 1; return; }
        // תחיליות בעברית: "לניקוי" ~ "ניקוי"
        if (!isNum && w.length > 2 && have.some(function (h) {
          return h.length > 2 && (h.indexOf(w) !== -1 || w.indexOf(h) !== -1);
        })) score += 0.5;
      });
      if (score > 0) scored.push({ item: it, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, limit || 5).map(function (s) { return s.item; });
  }

  return {
    parseItemList: parseItemList,
    indexItems: indexItems,
    indexMap: indexMap,
    resolveLines: resolveLines,
    suggest: suggest
  };
});
```

- [ ] **Step 4: להריץ ולוודא שעובר**

Run: `node tools/test/rivhit-mapping.test.js`
Expected: `כל 11 הבדיקות עברו`

- [ ] **Step 5: Commit**

```bash
git add tools/rivhit/src/mapping.js tools/test/rivhit-mapping.test.js
git commit -m "ממיר ריווחית: רשימת פריטים, שיוך והצעות"
```

---

### Task 4: המסך והקובץ הסופי

**Files:**
- Create: `tools/rivhit/src/template.html`, `tools/rivhit/src/ui.js`, `tools/rivhit/src/mapping.json`, `tools/rivhit/build.py`
- Create (נבנה): `tools/rivhit/dist/ממיר הזמנות לריווחית.html`

**Interfaces:**
- Consumes: כל `window.RivhitCore` (Tasks 1–3), `window.XLSX`, `window.RIVHIT_MAPPING = {customer: {no, name}, map: [{desc, code, name}]}`.
- Produces: הקובץ הסופי. מפתח localStorage: `aroam_rivhit_v1`.

- [ ] **Step 1: שיוך ברירת מחדל**

**T4a — Create `tools/rivhit/src/mapping.json`:**

```json
{
  "customer": { "no": "", "name": "" },
  "map": []
}
```

- [ ] **Step 2: התבנית**

**T4b — Create `tools/rivhit/src/template.html`:**

```html
<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ממיר הזמנות לריווחית</title>
<style>
  :root {
    --primary: #639C7D;
    --primary-dark: #1A4231;
    --primary-light: #EAF3EE;
    --text: #1F2A24;
    --muted: #5B6E64;
    --border: #D5E3DA;
    --bg: #F5F8F6;
    --card: #FFFFFF;
    --danger: #B3261E;
    --danger-bg: #FDECEA;
    --warn: #7A4A00;
    --warn-bg: #FFF4E0;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Assistant", "Segoe UI", Arial, sans-serif; font-size: 15px; line-height: 1.5; background: var(--bg); color: var(--text); }
  header.top { background: var(--primary-dark); color: #fff; padding: 14px 24px; }
  header.top h1 { margin: 0; font-size: 1.35rem; }
  header.top p { margin: 2px 0 0; color: #DFE9E3; font-size: .92rem; }
  main { max-width: 1100px; margin: 0 auto; padding: 20px 16px 130px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px 18px; margin-bottom: 16px; }
  .card h2 { margin: 0 0 10px; font-size: 1.1rem; color: var(--primary-dark); }
  .card h3 { margin: 18px 0 6px; font-size: 1rem; color: var(--primary-dark); }
  details.card > summary { cursor: pointer; font-weight: 700; font-size: 1.1rem; color: var(--primary-dark); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px 16px; margin-top: 12px; }
  label.field { display: flex; flex-direction: column; gap: 4px; font-size: .9rem; color: var(--muted); }
  input[type=text], input[type=date], select { font: inherit; color: var(--text); background: #fff; padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px; }
  input:focus-visible, select:focus-visible, button:focus-visible, .drop:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
  .btn { font: inherit; font-weight: 700; padding: 8px 16px; border-radius: 6px; border: 1px solid var(--primary-dark); background: var(--primary-dark); color: #fff; cursor: pointer; }
  .btn.secondary { background: #fff; color: var(--primary-dark); }
  .btn.big { font-size: 1.05rem; padding: 11px 22px; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
  .muted { color: var(--muted); font-size: .9rem; }
  .steps { margin: 6px 0 0; padding-inline-start: 20px; color: var(--muted); font-size: .92rem; }
  .drop { border: 2px dashed var(--primary); border-radius: 8px; padding: 26px; text-align: center; background: var(--primary-light); cursor: pointer; }
  .drop strong { display: block; font-size: 1.1rem; color: var(--primary-dark); }
  body.dragging .drop { background: #D7EADF; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: .93rem; }
  th, td { text-align: right; padding: 7px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { background: var(--primary-light); color: var(--primary-dark); }
  td.num { white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr.bad td { background: var(--danger-bg); }
  td input[type=text] { width: 100%; min-width: 120px; }
  td.num input[type=text] { width: 90px; min-width: 0; border-color: var(--danger); }
  .code { font-weight: 700; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
  .chip { font: inherit; font-size: .85rem; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--primary); background: #fff; color: var(--primary-dark); cursor: pointer; }
  .link { font: inherit; font-size: .85rem; background: none; border: none; padding: 0; color: var(--primary-dark); text-decoration: underline; cursor: pointer; }
  .order-head { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
  .order-head .file { font-weight: 700; color: var(--primary-dark); }
  .order-head .spacer { flex: 1; }
  .notice { padding: 9px 12px; border-radius: 6px; margin-top: 10px; font-size: .92rem; }
  .notice.warn { background: var(--warn-bg); color: var(--warn); }
  .notice.bad { background: var(--danger-bg); color: var(--danger); }
  .notice.ok { background: var(--primary-light); color: var(--primary-dark); }
  .notice ul { margin: 4px 0 0; padding-inline-start: 18px; }
  .total { text-align: left; font-weight: 700; margin-top: 8px; }
  footer.bar { position: fixed; inset-inline: 0; bottom: 0; background: #fff; border-top: 1px solid var(--border); padding: 12px 16px; }
  footer.bar .inner { max-width: 1100px; margin: 0 auto; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  footer.bar label { flex-direction: row; align-items: center; gap: 8px; }
  #toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: var(--primary-dark); color: #fff; padding: 10px 18px; border-radius: 6px; max-width: 90vw; opacity: 0; pointer-events: none; transition: opacity .2s; z-index: 10; }
  #toast.show { opacity: 1; }
</style>
</head>
<body>
<header class="top">
  <h1>ממיר הזמנות לריווחית</h1>
  <p>אהרוני שיווק והפצה · טופס הזמנה באקסל ⇐ קובץ קליטה לריווחית</p>
</header>

<main>
  <details class="card" id="settings">
    <summary>הגדרות</summary>
    <div class="grid">
      <label class="field">מספר הלקוח של הרשת בריווחית
        <input type="text" id="set-customer-no" inputmode="numeric" autocomplete="off"></label>
      <label class="field">שם כרטיס הלקוח
        <input type="text" id="set-customer-name" maxlength="30" autocomplete="off"></label>
      <label class="field">קידוד הקובץ
        <select id="set-encoding">
          <option value="cp1255">Windows-1255 (ברירת מחדל)</option>
          <option value="utf8">UTF-8 (אם העברית יוצאת ג׳יבריש)</option>
        </select></label>
    </div>
    <h3>רשימת הפריטים מריווחית</h3>
    <p class="muted" id="items-status"></p>
    <div class="actions">
      <button class="btn secondary" type="button" id="items-load">טעינת רשימת פריטים (אקסל / CSV)</button>
      <input type="file" id="items-file" accept=".xlsx,.xls,.csv,.txt" hidden>
    </div>
    <h3>שיוכים</h3>
    <p class="muted" id="map-status"></p>
    <div class="actions">
      <button class="btn secondary" type="button" id="backup-save">שמירת גיבוי</button>
      <button class="btn secondary" type="button" id="backup-load">שחזור מגיבוי</button>
      <input type="file" id="backup-file" accept=".json" hidden>
    </div>
  </details>

  <section class="card">
    <h2>הזמנות</h2>
    <div class="drop" id="drop" tabindex="0" role="button" aria-label="בחירת קובצי הזמנה">
      <strong>גוררים לכאן קובצי הזמנה</strong>
      <span class="muted">או לוחצים לבחירה · אפשר כמה קבצים בבת אחת</span>
    </div>
    <input type="file" id="order-files" accept=".xlsx,.xls" multiple hidden>
    <ol class="steps">
      <li>שורה באדום = תיאור שעדיין לא שויך למק״ט בריווחית. בוחרים פעם אחת, והשיוך נשמר.</li>
      <li>מורידים את הקובץ, ובריווחית: תחזוקה ← יבוא מסמכים/קבלות מתוכנה זרה.</li>
    </ol>
  </section>

  <div id="orders"></div>
  <div id="result"></div>
  <datalist id="items-list"></datalist>
</main>

<footer class="bar"><div class="inner">
  <label class="field">סוג מסמך <select id="doc-type"></select></label>
  <button class="btn big" type="button" id="generate">הורדת קובץ לריווחית</button>
  <span class="muted" id="generate-status" aria-live="polite"></span>
</div></footer>

<div id="toast" role="status" aria-live="polite"></div>

<!--INLINE:xlsx-->
<!--INLINE:mapping-->
<!--INLINE:core-->
<!--INLINE:ui-->
</body>
</html>
```

- [ ] **Step 3: המסך**

**T4c — Create `tools/rivhit/src/ui.js`:**

```js
/**
 * ממיר הזמנות לריווחית — המסך.
 * תלוי ב-XLSX (SheetJS), ב-RivhitCore (src/*.js) וב-window.RIVHIT_MAPPING (mapping.json).
 * הכל רץ בדפדפן; שום קובץ לא נשלח לרשת.
 */
(function () {
  'use strict';

  var C = window.RivhitCore;
  var STORE_KEY = 'aroam_rivhit_v1';
  var HISTORY_MAX = 1000;
  var BUILT_IN = window.RIVHIT_MAPPING || {};
  var BUILT_IN_MAP = C.indexMap(BUILT_IN.map);

  var state = loadState();
  var orders = [];     // {id, fileName, branch, date, lines} או {id, fileName, error}
  var editing = {};    // מפתח תיאור ⇒ true כשלוחצים "שנה" על שיוך קיים
  var nextId = 1;
  var toastTimer;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) { return (Math.round(n * 100) / 100).toFixed(2) + ' ₪'; }

  function stamp(d) {
    return d.getFullYear() + C.pad2(d.getMonth() + 1) + C.pad2(d.getDate()) + '-' +
      C.pad2(d.getHours()) + C.pad2(d.getMinutes());
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 4500);
  }

  // ---------- מצב שמור ----------

  function loadState() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { s = {}; }
    var cust = BUILT_IN.customer || {};
    return {
      customerNo: s.customerNo != null ? String(s.customerNo) : String(cust.no || ''),
      customerName: s.customerName != null ? String(s.customerName) : String(cust.name || ''),
      encoding: s.encoding === 'utf8' ? 'utf8' : 'cp1255',
      docType: C.DOC_TYPES.some(function (d) { return d.code === Number(s.docType); })
        ? Number(s.docType) : C.DOC_TYPES[0].code,
      items: Array.isArray(s.items) ? s.items : [],
      learned: s.learned && typeof s.learned === 'object' ? s.learned : {},
      counter: s.counter || null,
      history: s.history && typeof s.history === 'object' ? s.history : {}
    };
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('הדפדפן לא מאפשר לשמור — השיוכים לא יישמרו לפעם הבאה. כדאי לשמור גיבוי.'); }
  }

  function pruneHistory() {
    var keys = Object.keys(state.history);
    if (keys.length <= HISTORY_MAX) return;
    keys.sort(function (a, b) { return state.history[a].at < state.history[b].at ? -1 : 1; });
    keys.slice(0, keys.length - HISTORY_MAX).forEach(function (k) { delete state.history[k]; });
  }

  function currentMap() { return Object.assign({}, BUILT_IN_MAP, state.learned); }
  function settings() { return { customerNo: state.customerNo, customerName: state.customerName }; }

  function resolvedOrder(o, map, by) {
    return {
      branch: o.branch,
      date: o.date,
      lines: C.resolveLines(o.lines, map || currentMap(), by || C.indexItems(state.items))
    };
  }

  // ---------- קריאת קבצים ----------

  function decodeText(buf) {
    var bytes = new Uint8Array(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('windows-1255').decode(bytes); }
  }

  function readWorkbook(file) {
    return file.arrayBuffer().then(function (buf) {
      var wb = /\.(csv|txt)$/i.test(file.name)
        ? XLSX.read(decodeText(buf), { type: 'string' })
        : XLSX.read(buf, { type: 'array' });
      return wb.SheetNames.map(function (name) {
        var ws = wb.Sheets[name];
        return {
          name: name,
          firstRow: ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r + 1 : 1,
          rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true })
        };
      });
    });
  }

  function addOrderFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    Promise.all(files.map(function (file) {
      return readWorkbook(file).then(function (sheets) {
        return {
          id: nextId++, fileName: file.name, branch: C.branchFromFilename(file.name),
          date: C.isoDate(new Date()), lines: C.parseWorkbook(sheets)
        };
      }, function (err) {
        return { id: nextId++, fileName: file.name, error: 'לא ניתן לקרוא את הקובץ (' + ((err && err.message) || err) + ')' };
      });
    })).then(function (added) {
      orders = orders.concat(added);
      $('result').innerHTML = '';
      render();
    });
  }

  function loadItemsFile(file) {
    readWorkbook(file).then(function (sheets) {
      var lastError = '';
      for (var i = 0; i < sheets.length; i++) {
        var res = C.parseItemList(sheets[i].rows);
        if (res.items.length) {
          state.items = res.items;
          saveState();
          render();
          toast('נטענו ' + res.items.length + ' פריטים מריווחית');
          return;
        }
        lastError = res.error;
      }
      toast(lastError || 'לא נמצאו פריטים בקובץ');
    }, function () { toast('לא ניתן לקרוא את קובץ הפריטים'); });
  }

  // ---------- שיוך ----------

  function setMapping(desc, rawValue) {
    var value = String(rawValue || '').trim();
    if (!value) return;
    var code = value.split(' — ')[0].trim();
    var by = C.indexItems(state.items);
    if (code.length > 15) { toast('מק״ט בריווחית מוגבל ל-15 תווים'); return; }
    if (state.items.length && !by[code] &&
        !confirm('המק״ט "' + code + '" לא נמצא ברשימת הפריטים מריווחית.\nלהשתמש בו בכל זאת?')) return;
    var key = C.descKey(desc);
    state.learned[key] = { code: code, name: by[code] ? by[code].name : '' };
    delete editing[key];
    saveState();
    render();
  }

  // ---------- גיבוי ----------

  function download(bytes, name) {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function saveBackup() {
    var data = {
      app: 'aroam-rivhit', version: 1, savedAt: new Date().toISOString(),
      customerNo: state.customerNo, customerName: state.customerName, encoding: state.encoding,
      learned: state.learned, items: state.items
    };
    download(new TextEncoder().encode(JSON.stringify(data, null, 2)), 'rivhit-backup-' + stamp(new Date()) + '.json');
  }

  function loadBackup(file) {
    file.text().then(function (txt) {
      var d = JSON.parse(txt);
      if (!d || d.app !== 'aroam-rivhit') throw new Error('not a backup');
      Object.assign(state.learned, d.learned || {});
      if (Array.isArray(d.items) && d.items.length) state.items = d.items;
      if (d.customerNo) state.customerNo = String(d.customerNo);
      if (d.customerName) state.customerName = String(d.customerName);
      if (d.encoding) state.encoding = d.encoding === 'utf8' ? 'utf8' : 'cp1255';
      saveState();
      fillSettings();
      render();
      toast('הגיבוי שוחזר');
    }).catch(function () { toast('הקובץ אינו גיבוי של הממיר'); });
  }

  // ---------- הפקה ----------

  function generate() {
    var ready = orders.filter(function (o) { return !o.error; });
    if (!ready.length || C.validateSettings(settings()).length) return;
    var map = currentMap(), by = C.indexItems(state.items);
    var resolved = ready.map(function (o) { return resolvedOrder(o, map, by); });
    if (resolved.some(function (r) { return C.validateOrder(r).length; })) return;

    var today = new Date(), counter = state.counter, records = [], summary = [];
    try {
      resolved.forEach(function (r) {
        var next = C.nextInternalNo(counter, today);
        counter = next.counter;
        records = records.concat(C.buildRecords(r, {
          docType: state.docType, customerNo: state.customerNo, customerName: state.customerName,
          internalNo: next.no, today: today
        }));
        summary.push({ branch: r.branch, no: next.no, lines: r.lines.length, fp: C.orderFingerprint(r) });
      });
    } catch (e) { toast(e.message); return; }

    var enc = C.encodeText(C.serialize(records), state.encoding);
    var name = 'rivhit-' + stamp(today) + '.txt';
    download(enc.bytes, name);

    state.counter = counter;
    summary.forEach(function (s) {
      state.history[s.fp] = { at: C.isoDate(today), no: s.no, branch: s.branch };
    });
    pruneHistory();
    saveState();
    orders = [];
    showResult(name, summary, records.length, enc.unknown);
    render();
  }

  function showResult(name, summary, lineCount, unknown) {
    var docLabel = C.DOC_TYPES.filter(function (d) { return d.code === state.docType; })[0].label;
    $('result').innerHTML =
      '<section class="card"><h2>הקובץ ירד: ' + esc(name) + '</h2>' +
      '<p class="muted">' + (summary.length === 1 ? 'מסמך אחד' : summary.length + ' מסמכים') + ' (' + esc(docLabel) + ') · ' + lineCount + ' שורות · ' +
      (state.encoding === 'utf8' ? 'UTF-8' : 'Windows-1255') + '</p>' +
      '<table><thead><tr><th>סניף</th><th>מספר פנימי</th><th>שורות</th></tr></thead><tbody>' +
      summary.map(function (s) {
        return '<tr><td>' + esc(s.branch) + '</td><td class="num">' + esc(s.no) + '</td><td class="num">' + s.lines + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (unknown ? '<div class="notice warn">' + unknown + ' תווים שאין להם מקום ב-Windows-1255 הוחלפו בסימן ?</div>' : '') +
      '<ol class="steps"><li>בריווחית: תחזוקה ← יבוא מסמכים/קבלות מתוכנה זרה, ובוחרים את הקובץ מתיקיית ההורדות.</li>' +
      '<li>אחרי הקליטה פותחים מסמך אחד ובודקים עברית, שם הסניף ומחירים.</li></ol></section>';
  }

  // ---------- תצוגה ----------

  function fillSettings() {
    $('set-customer-no').value = state.customerNo;
    $('set-customer-name').value = state.customerName;
    $('set-encoding').value = state.encoding;
  }

  function codeCell(o, i, l) {
    var key = C.descKey(l.desc);
    if (l.code && !editing[key]) {
      return '<span class="code">' + esc(l.code) + '</span> ' + esc(l.name) +
        (l.known || !state.items.length ? '' : ' <span class="muted">(לא ברשימת הפריטים)</span>') +
        ' <button type="button" class="link" data-act="edit-map" data-key="' + esc(key) + '">שנה</button>';
    }
    var sugg = C.suggest(l.desc, state.items, 3);
    return '<input type="text" list="items-list" class="map-input" data-desc="' + esc(l.desc) + '"' +
      ' placeholder="מק״ט או שם פריט…" aria-label="מק״ט בריווחית עבור ' + esc(l.desc) + '">' +
      (sugg.length ? '<div class="chips">' + sugg.map(function (it) {
        return '<button type="button" class="chip" data-act="pick" data-desc="' + esc(l.desc) + '" data-code="' +
          esc(it.code) + '">' + esc(it.code + ' · ' + it.name) + '</button>';
      }).join('') + '</div>' : '') +
      (editing[key] ? ' <button type="button" class="link" data-act="cancel-edit" data-key="' + esc(key) + '">ביטול</button>' : '');
  }

  function numCell(o, i, l, field) {
    var v = l[field];
    var ok = field === 'qty' ? typeof v === 'number' && v > 0 : typeof v === 'number' && v >= 0;
    if (ok) return field === 'qty' ? C.formatNumber(v) : money(v);
    var shown = field === 'qty' ? l.qtyText : (v == null || Number.isNaN(v) ? '' : String(v));
    return '<input type="text" inputmode="decimal" data-act="' + field + '" data-order="' + o.id + '" data-line="' + i +
      '" value="' + esc(shown) + '" aria-label="' + (field === 'qty' ? 'כמות' : 'מחיר') + ' עבור ' + esc(l.desc) + '">';
  }

  function orderCard(o, map, by) {
    if (o.error) {
      return '<section class="card"><div class="order-head"><div class="file">' + esc(o.fileName) + '</div>' +
        '<span class="spacer"></span><button type="button" class="link" data-act="remove" data-order="' + o.id + '">הסרה</button></div>' +
        '<div class="notice bad">' + esc(o.error) + '</div></section>';
    }
    var r = resolvedOrder(o, map, by);
    var problems = C.validateOrder(r);
    var prev = r.lines.length ? state.history[C.orderFingerprint(r)] : null;
    var total = 0;
    var rows = r.lines.map(function (l, i) {
      // הסה"כ לפי הטופס נספר גם לפני השיוך, כדי שאפשר יהיה להשוות לסה"כ בגיליון של הלקוח
      var priced = typeof l.qty === 'number' && l.qty > 0 && typeof l.price === 'number' && l.price >= 0;
      var good = l.code && priced;
      if (priced) total += l.qty * l.price;
      return '<tr class="' + (good ? '' : 'bad') + '">' +
        '<td>' + esc(l.desc) + (l.note ? '<div class="muted">הערה: ' + esc(l.note) + '</div>' : '') + '</td>' +
        '<td>' + codeCell(o, i, l) + '</td>' +
        '<td class="num">' + numCell(o, i, l, 'qty') + '</td>' +
        '<td class="num">' + numCell(o, i, l, 'price') + '</td>' +
        '<td class="num">' + (priced ? money(l.qty * l.price) : '') + '</td></tr>';
    }).join('');
    return '<section class="card">' +
      '<div class="order-head">' +
        '<div><div class="file">' + esc(o.fileName) + '</div><div class="muted">' + r.lines.length + ' שורות עם כמות</div></div>' +
        '<label class="field">סניף (נכתב בכתובת המסמך)<input type="text" maxlength="30" data-act="branch" data-order="' + o.id + '" value="' + esc(o.branch) + '"></label>' +
        '<label class="field">תאריך ההזמנה<input type="date" data-act="date" data-order="' + o.id + '" value="' + esc(o.date) + '"></label>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="link" data-act="remove" data-order="' + o.id + '">הסרה</button>' +
      '</div>' +
      (prev ? '<div class="notice warn">הזמנה זהה מהסניף הזה כבר הופקה ב-' + esc(prev.at.split('-').reverse().join('.')) +
        ' (מספר פנימי ' + esc(prev.no) + '). אם היא כבר נקלטה בריווחית — כדאי להסיר אותה מכאן.</div>' : '') +
      (problems.length ? '<div class="notice bad">לתיקון לפני הפקה:<ul>' + problems.map(function (p) {
        return '<li>' + esc(p) + '</li>';
      }).join('') + '</ul></div>' : '') +
      (r.lines.length ? '<table><thead><tr><th>תיאור בטופס הלקוח</th><th>מק״ט בריווחית</th><th>כמות</th><th>מחיר</th><th>סה״כ</th></tr></thead><tbody>' +
        rows + '</tbody></table><div class="total">סה״כ לפי מחירי הטופס: ' + money(total) + '</div>'
        : '<div class="notice bad">לא נמצאה בקובץ טבלה עם עמודות "מחיר" ו"כמות", או שלא מולאו כמויות.</div>') +
      '</section>';
  }

  function renderStatus() {
    $('items-status').textContent = state.items.length
      ? 'נטענו ' + state.items.length + ' פריטים. טוענים מחדש כשנוספים פריטים בריווחית.'
      : 'עדיין לא נטענה רשימה. מייצאים מריווחית את רשימת הפריטים לאקסל (מק״ט ושם) וטוענים כאן — אז מופיעות הצעות לשיוך.';
    $('map-status').textContent = Object.keys(BUILT_IN_MAP).length + ' שיוכים מובנים · ' +
      Object.keys(state.learned).length + ' שיוכים שנשמרו בדפדפן הזה. כדאי לשמור גיבוי מדי פעם.';
    var list = $('items-list');
    if (list.getAttribute('data-count') !== String(state.items.length)) {
      list.innerHTML = state.items.map(function (it) {
        return '<option value="' + esc(it.code + ' — ' + it.name) + '"></option>';
      }).join('');
      list.setAttribute('data-count', String(state.items.length));
    }
  }

  function renderFooter() {
    var sp = C.validateSettings(settings());
    var ready = orders.filter(function (o) { return !o.error; });
    var failedFiles = orders.length - ready.length;
    var map = currentMap(), by = C.indexItems(state.items);
    var bad = 0, lines = 0;
    ready.forEach(function (o) {
      var r = resolvedOrder(o, map, by);
      if (C.validateOrder(r).length) bad++;
      lines += r.lines.length;
    });
    var st;
    if (!ready.length) st = 'גוררים קובץ הזמנה כדי להתחיל';
    else if (sp.length) st = sp[0] + ' (בהגדרות למעלה)';
    else if (bad) st = bad === 1 ? 'הזמנה אחת צריכה תיקון (מסומן באדום)' : bad + ' הזמנות צריכות תיקון (מסומן באדום)';
    else st = (ready.length === 1 ? 'הזמנה אחת' : ready.length + ' הזמנות') + ' · ' + lines + ' שורות מוכנות';
    if (failedFiles) st += ' · ' + failedFiles + ' קבצים לא נקראו';
    $('generate-status').textContent = st;
    $('generate').disabled = !ready.length || sp.length > 0 || bad > 0;
  }

  function render() {
    var map = currentMap(), by = C.indexItems(state.items);
    $('orders').innerHTML = orders.map(function (o) { return orderCard(o, map, by); }).join('');
    renderStatus();
    renderFooter();
  }

  // ---------- אירועים ----------

  function findOrder(id) {
    return orders.filter(function (o) { return String(o.id) === String(id); })[0];
  }

  function onOrdersClick(e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act');
    if (act === 'pick') setMapping(t.getAttribute('data-desc'), t.getAttribute('data-code'));
    else if (act === 'edit-map') { editing[t.getAttribute('data-key')] = true; render(); }
    else if (act === 'cancel-edit') { delete editing[t.getAttribute('data-key')]; render(); }
    else if (act === 'remove') {
      orders = orders.filter(function (o) { return String(o.id) !== t.getAttribute('data-order'); });
      render();
    }
  }

  function onOrdersChange(e) {
    var t = e.target;
    if (t.classList.contains('map-input')) { setMapping(t.getAttribute('data-desc'), t.value); return; }
    var act = t.getAttribute('data-act');
    var o = findOrder(t.getAttribute('data-order'));
    if (!o) return;
    if (act === 'branch') o.branch = t.value;
    else if (act === 'date') o.date = t.value;
    else if (act === 'qty' || act === 'price') {
      var line = o.lines[Number(t.getAttribute('data-line'))];
      if (act === 'qty') { line.qty = C.toNumber(t.value); line.qtyText = t.value; }
      else line.price = C.toNumber(t.value);
    } else return;
    render();
  }

  // בחירה מרשימת ההצעות של הדפדפן ("מק״ט — שם") נקלטת מיד, בלי לחכות ליציאה מהשדה
  function onOrdersInput(e) {
    var t = e.target;
    if (!t.classList.contains('map-input') || t.value.indexOf(' — ') === -1) return;
    var code = t.value.split(' — ')[0].trim();
    if (C.indexItems(state.items)[code]) setMapping(t.getAttribute('data-desc'), t.value);
  }

  function init() {
    var dt = $('doc-type');
    dt.innerHTML = C.DOC_TYPES.map(function (d) {
      return '<option value="' + d.code + '">' + esc(d.label) + '</option>';
    }).join('');
    dt.value = String(state.docType);
    dt.addEventListener('change', function () { state.docType = Number(dt.value); saveState(); });

    fillSettings();
    $('set-customer-no').addEventListener('input', function (e) { state.customerNo = e.target.value.trim(); saveState(); renderFooter(); });
    $('set-customer-name').addEventListener('input', function (e) { state.customerName = e.target.value; saveState(); renderFooter(); });
    $('set-encoding').addEventListener('change', function (e) { state.encoding = e.target.value; saveState(); });

    var drop = $('drop'), input = $('order-files');
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () { addOrderFiles(input.files); input.value = ''; });
    // גרירה לכל מקום בעמוד — כדי שקובץ שנשמט ליד האזור לא ייפתח בדפדפן
    window.addEventListener('dragover', function (e) { e.preventDefault(); document.body.classList.add('dragging'); });
    window.addEventListener('dragleave', function (e) { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      document.body.classList.remove('dragging');
      addOrderFiles(e.dataTransfer.files);
    });

    $('items-load').addEventListener('click', function () { $('items-file').click(); });
    $('items-file').addEventListener('change', function (e) {
      if (e.target.files[0]) loadItemsFile(e.target.files[0]);
      e.target.value = '';
    });
    $('backup-save').addEventListener('click', saveBackup);
    $('backup-load').addEventListener('click', function () { $('backup-file').click(); });
    $('backup-file').addEventListener('change', function (e) {
      if (e.target.files[0]) loadBackup(e.target.files[0]);
      e.target.value = '';
    });
    $('generate').addEventListener('click', generate);
    $('orders').addEventListener('click', onOrdersClick);
    $('orders').addEventListener('change', onOrdersChange);
    $('orders').addEventListener('input', onOrdersInput);

    if (C.validateSettings(settings()).length) $('settings').open = true;
    render();
  }

  init();
})();
```

- [ ] **Step 4: סקריפט הבנייה**

**T4d — Create `tools/rivhit/build.py`:**

```python
#!/usr/bin/env python3
"""בונה את ממיר ההזמנות לריווחית לקובץ HTML יחיד שעובד בלי אינטרנט.

הרצה: python3 tools/rivhit/build.py
התוצר: tools/rivhit/dist/ממיר הזמנות לריווחית.html — מעתיקים אותו למחשב של ריווחית.
SheetJS CE 0.20.3 (Apache-2.0) מ-https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
"""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / 'src'
OUT = HERE / 'dist' / 'ממיר הזמנות לריווחית.html'
# סדר הטעינה חשוב: text.js לפני המודולים שתלויים בו
CORE = ['text.js', 'order-form.js', 'mapping.js', 'rivhit-file.js']


def script(code):
    return '<script>\n' + code.replace('</script', '<\\/script') + '\n</script>'


def read(path):
    return path.read_text(encoding='utf-8')


def main():
    html = read(SRC / 'template.html')
    mapping = json.loads(read(SRC / 'mapping.json'))
    parts = {
        '<!--INLINE:xlsx-->': script(read(HERE / 'vendor' / 'xlsx.full.min.js')),
        '<!--INLINE:mapping-->': script('window.RIVHIT_MAPPING = ' + json.dumps(mapping, ensure_ascii=False) + ';'),
        '<!--INLINE:core-->': '\n'.join(script(read(SRC / name)) for name in CORE),
        '<!--INLINE:ui-->': script(read(SRC / 'ui.js')),
    }
    for marker, content in parts.items():
        if html.count(marker) != 1:
            raise SystemExit(f'הסימון {marker} חייב להופיע בתבנית פעם אחת בדיוק')
        html = html.replace(marker, content)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding='utf-8')
    print(f'נבנה: {OUT} ({OUT.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
```

- [ ] **Step 5: בנייה והרצת כל הבדיקות**

```bash
python3 tools/rivhit/build.py
for t in tools/test/rivhit-*.test.js; do node "$t" | tail -1; done
```
Expected: `נבנה: .../ממיר הזמנות לריווחית.html (~950 KB)` ושלוש שורות "כל N הבדיקות עברו".

- [ ] **Step 6: בדיקה בדפדפן**

מגישים את הריפו (`preview_start` עם `aroam-site`, פורט 8085) ופותחים
`http://localhost:8085/tools/rivhit/dist/ממיר%20הזמנות%20לריווחית.html`.
ב-`javascript_tool`: מורידים את `tools/test/fixtures/rivhit-north-face-glilot.xlsx` ב-`fetch`,
יוצרים `File` ושמים אותו ב-`#order-files` דרך `DataTransfer`, ואז `change`. בודקים:
1. כרטיס אחד, 6 שורות אדומות, סה"כ 240.00 ₪, כפתור ההפקה מושבת והסטטוס אומר "מספר הלקוח… חסר".
2. טוענים רשימת פריטים לדוגמה (CSV עם `מק"ט,שם פריט` שנבנה ב-JS) ⇒ הצעות מופיעות; לחיצה על הצעה צובעת את השורה ונשמרת ב-`localStorage` אחרי רענון.
3. ממלאים מספר לקוח 123 ושם, משייכים את כל השורות, ומיירטים את `URL.createObjectURL` כדי לתפוס את ה-Blob:
   6 שורות, 28 שדות כל אחת, CR+LF, בייט `0xE0`–`0xFA` לעברית, `\t1\t` בתחילת שורה, שדה 13 = "נורט פייס גלילות".
4. הפקה שנייה של אותו קובץ ⇒ אזהרת "כבר הופקה".
5. רוחב 500px בלי גלילה אופקית של העמוד.
6. אפס שגיאות קונסול.

- [ ] **Step 7: Commit**

```bash
git add tools/rivhit
git commit -m "ממיר ריווחית: המסך והקובץ הסופי"
```

---

### Task 5: תיעוד ומסירה

**Files:**
- Modify: `CLAUDE.md` (סבב 84 בסוף "מה בוצע")

- [ ] **Step 1:** סבב 84 ב-`CLAUDE.md`: מה נבנה, איפה הקבצים, איך בונים, מה עוד לא נבדק בריווחית, ומה רועי צריך לעשות (לייצא רשימת פריטים, להעתיק את הקובץ למחשב של ריווחית, קליטת בדיקה אחת).
- [ ] **Step 2:** Commit: `git commit -am "CLAUDE.md: ממיר הזמנות לריווחית (סבב 84)"`.
- [ ] **Step 3:** לשלוח לרועי את הקובץ הסופי (`SendUserFile`, `display: attach`).
