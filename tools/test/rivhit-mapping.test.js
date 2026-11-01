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
