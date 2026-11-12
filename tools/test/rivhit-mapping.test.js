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

test('רשימת פריטים: הייצוא של ריווחית — המק"ט הוא המספר הקטלוגי, ומספר הפריט נשמר ב-num', () => {
  const res = M.parseItemList([
    ['item_num', 'item_name', 'item_part_num', 'sapak', 'item_cost_nis', 'int1', 'compute_0037'],
    [1, "צץ רץ 4000 יח'", 'P101', 0, 30, 1, 'קבוצה א'],
    [693, 'מים מזוקקים 4 ליטר', 693, 0, 0, 1, 'קבוצה א'],
    [1880, 'כפול', '0', 0, 0, 9999, 'לא פעיל'],
    [1921, 'כפול בלי שם קבוצה', 1921, 0, 0, 9999, ''],
    [1866, 'בלי מספר קטלוגי', '', 0, 0, 1, 'קבוצה א'],
    [5, 'מספר קטלוגי שגוי', 'C2"03', 0, 0, 1, 'קבוצה א']
  ]);
  assert.strictEqual(res.catalogList, true);
  assert.deepStrictEqual(res.items, [
    { code: 'P101', name: "צץ רץ 4000 יח'", num: '1' },
    { code: '693', name: 'מים מזוקקים 4 ליטר', num: '693' }
  ]);
  assert.strictEqual(res.inactive, 2);
  assert.strictEqual(res.noCatalog, 2);
});

test('רשימת פריטים: ייצוא מופרד בטאבים נקרא דרך SheetJS כמו בממיר', () => {
  const XLSX = require('../rivhit/vendor/xlsx.full.min.js');
  const tsv = 'item_num\titem_name\titem_part_num\tint1\r\n60\tמגבות 1 ק"ג\tC203\t2\r\n895\tגליל\t895\t1\r\n';
  const wb = XLSX.read(tsv, { type: 'string' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: true });
  const res = M.parseItemList(rows);
  assert.deepStrictEqual(res.items, [
    { code: 'C203', name: 'מגבות 1 ק"ג', num: '60' },
    { code: '895', name: 'גליל', num: '895' }
  ]);
});

test('רשימה שאינה הייצוא של ריווחית לא מסומנת כרשימה לפי מספר קטלוגי', () => {
  assert.strictEqual(M.parseItemList([['מק״ט', 'שם'], ['K-1', 'כפפות']]).catalogList, false);
});

test('שיוכים ישנים (מספר פריט) מתורגמים למספר הקטלוגי לפי הייצוא', () => {
  const items = [{ code: 'C203', name: 'מגבות', num: '60' }, { code: '895', name: 'גליל', num: '895' }];
  const learned = {
    'מגבות נייר': { code: '60', name: 'מגבות' },
    'גליל 5012': { code: '895', name: 'גליל' },
    'כבר קטלוגי': { code: 'C203', name: 'מגבות' },
    'לא ברשימה': { code: '1862', name: '' }
  };
  const r = M.migrateLearned(learned, items);
  assert.strictEqual(r.changed, 1);
  assert.deepStrictEqual(r.learned['מגבות נייר'], { code: 'C203', name: 'מגבות' });
  assert.deepStrictEqual(r.learned['גליל 5012'], learned['גליל 5012']);
  assert.deepStrictEqual(r.learned['כבר קטלוגי'], learned['כבר קטלוגי']);
  assert.deepStrictEqual(r.learned['לא ברשימה'], learned['לא ברשימה']);
  assert.deepStrictEqual(M.migrateLearned({}, items), { learned: {}, changed: 0 });
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

// השיוך המובנה מול טופס הרשת האמיתי: כל רשומה תואמת שורה קיימת בטופס
test('השיוך המובנה מכסה את טופס הרשת (36 מתוך 39 — שורות הביוטי בלי שיוך)', () => {
  const fs = require('fs');
  const path = require('path');
  const XLSX = require('../rivhit/vendor/xlsx.full.min.js');
  const F = require('../rivhit/src/order-form.js');
  const T = require('../rivhit/src/text.js');
  const mapping = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rivhit', 'src', 'mapping.json'), 'utf8'));
  const map = M.indexMap(mapping.map);
  const wb = XLSX.read(fs.readFileSync(path.join(__dirname, 'fixtures', 'rivhit-north-face-glilot.xlsx')));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  // כמות 1 בכל שורת נתונים — כדי לקבל את כל 39 השורות של הטופס, לא רק את המוזמנות
  let cols = null;
  const all = rows.map(r => {
    const h = F.findHeader(r);
    if (h) { cols = h; return r; }
    if (!cols || !r || !r[cols.desc]) return r;
    const copy = r.slice(); copy[cols.qty] = 1; return copy;
  });
  const formLines = F.parseSheetRows(all, '', 1);
  assert.strictEqual(formLines.length, 39);
  const formKeys = new Set(formLines.map(l => T.descKey(l.desc)));
  mapping.map.forEach(e => assert.ok(formKeys.has(T.descKey(e.desc)), 'לא בטופס: ' + e.desc));
  const unmapped = M.resolveLines(formLines, map, {}).filter(l => !l.code).map(l => l.desc);
  assert.strictEqual(unmapped.length, 3, unmapped.join(' | '));
  const ordered = M.resolveLines(F.parseWorkbook([{ name: 's', rows, firstRow: 1 }]), map, {});
  // מספרים קטלוגיים (12.11.26): לפריטים 851, 1489 ו-295 יש מספר קטלוגי משלהם; לשאר הוא מספר הפריט
  assert.deepStrictEqual(ordered.map(l => l.code), ['693', 'P1272', 'E400M', 'H801-1', '1305', '944']);
});

// שיוך שנשמר ידנית כשרשימת הפריטים לא הייתה טעונה נשמר בלי שם — ואז יצא לריווחית
// בשם של הלקוח. השם נלקח לפי המק"ט גם מהשיוך המובנה.
test('שם בריווחית לפי המק"ט גם לשיוך שנשמר בלי שם', () => {
  const builtIn = [{ desc: 'נייר תעשייתי 1200 מיוחד צר', code: '1612', name: 'גליל תעשייתי תאית חד שכבתי 5012' }];
  const learned = M.indexMap([{ desc: 'נייר תעשייתי 1200 מיוחד צר', code: '1612', name: '' }]);
  const line = { desc: 'נייר תעשייתי 1200 מיוחד צר', qty: 2, price: 44 };
  const r = M.resolveLines([line], learned, M.indexItemsWithMapNames([], builtIn))[0];
  assert.deepStrictEqual([r.code, r.name], ['1612', 'גליל תעשייתי תאית חד שכבתי 5012']);
  const fromList = M.indexItemsWithMapNames([{ code: '1612', name: 'שם מהרשימה' }], builtIn);
  assert.strictEqual(M.resolveLines([line], learned, fromList)[0].name, 'שם מהרשימה');
  assert.strictEqual(M.resolveLines([line], learned, M.indexItemsWithMapNames([], []))[0].name, '');
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length
                   : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
