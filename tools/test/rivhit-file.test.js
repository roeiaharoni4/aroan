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
