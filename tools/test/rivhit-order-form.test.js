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

test('decodeText: UTF-16 (הייצוא של ריווחית), UTF-8 ו-Windows-1255', () => {
  const text = 'item_num,item_name\r\n1,צץ רץ';
  const le = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(text, 'utf16le')]);
  assert.strictEqual(T.decodeText(new Uint8Array(le)), text);
  const be = Buffer.from(le).swap16();
  assert.strictEqual(T.decodeText(new Uint8Array(be)), text);
  const u8 = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(text, 'utf8')]);
  assert.strictEqual(T.decodeText(new Uint8Array(u8)), text);
  assert.strictEqual(T.decodeText(new Uint8Array([0xF6, 0xF5])), 'צץ');
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
