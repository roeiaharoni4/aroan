/**
 * קובץ קליטה לריווחית מהזמנה שהגיעה מהאתר (סבב 88).
 * אפיון: docs/superpowers/specs/2026-11-04-rivhit-from-site-orders-design.md
 * להרצה: node tools/test/rivhit-site.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const S = require('../rivhit/src/site-order.js');
const R = require('../rivhit/src/rivhit-file.js');

const CSV = 'id,name,category,rivhit\r\n' +
  'ניק001,אקונומיקה 4 ליטר,ניקיון,56\r\n' +
  'חדפ002,"גביע 150 מ""ל, שקוף",חד פעמי,1148\r\n' +
  'טיפ001,"DOVE סבון\nרביעיה",טיפוח,\r\n' +
  'אבי004,כפפות,אביזרי ניקיון,1489|1490\r\n';

const ORDER = {
  orderId: 'AR-20261104-123456',
  customer: { business: 'מסעדת הגן הירוק בע"מ', contact: 'דנה לוי', address: 'המלאכה 8, אור יהודה' },
  items: [
    { id: 'ניק001', name: 'אקונומיקה 4 ליטר', qty: 6, price: 5 },
    { id: 'חדפ002', name: 'גביע 150 מ״ל - 100 יח׳', qty: 2, price: '' },
    { id: 'טיפ001', name: 'DOVE סבון מוצק', qty: 1, price: 12 }
  ]
};
const CODES = { 'ניק001': '56', 'חדפ002': '1148', 'אבי004': '1489' };
const TODAY = new Date(2026, 10, 5);

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('CSV: מירכאות, פסיק וירידת שורה בתוך שדה, CRLF', () => {
  const rows = S.parseCsv(CSV);
  assert.strictEqual(rows.length, 4);
  assert.strictEqual(rows[1].name, 'גביע 150 מ"ל, שקוף');
  assert.strictEqual(rows[2].name, 'DOVE סבון\nרביעיה');
  assert.strictEqual(rows[3].rivhit, '1489|1490');
});

test('CSV: שורה ריקה בסוף לא הופכת לרשומה', () => {
  assert.strictEqual(S.parseCsv('a,b\n1,2\n').length, 1);
});

// ריווחית לא עוטפת שם שיש בו רק מירכאות (1 ק"ג, 30 ס"מ), ועוטפת רק כשיש בו פסיק.
// מירכאות באמצע שדה לא עטוף הן תו רגיל, כמו בפייתון ובאקסל. נמצא 10.11.26: המפענח
// פתח בהן שדה עטוף, בלע את השורות שאחריהן, ומקובץ הייצוא עלו 870 פריטים מתוך 1,838.
test('CSV: מירכאות באמצע שדה לא עטוף הן תו רגיל ולא בולעות שורות', () => {
  const text = 'item_num,item_name,item_cost_nis,item_part_num\r\n' +
    '10,שמן 1 ק"ג,7.5,10\r\n' +
    '11,"קרטון 20 יח׳, לבן",3,11\r\n' +
    '12,מגבת 30 ס"מ,2,12\r\n' +
    '13,"שקית 50/60, חזקה - ק""ג",1,13\r\n' +
    '14,כפפות 12",1,14\r\n' +
    '15,מגב,4,15\r\n';
  const rows = S.parseCsv(text);
  assert.deepStrictEqual(rows.map(r => r.item_name),
    ['שמן 1 ק"ג', 'קרטון 20 יח׳, לבן', 'מגבת 30 ס"מ', 'שקית 50/60, חזקה - ק"ג', 'כפפות 12"', 'מגב']);
  assert.deepStrictEqual(rows.map(r => r.item_cost_nis), ['7.5', '3', '2', '1', '1', '4']);
  assert.strictEqual(S.itemExportRows(rows).items.length, 6);
});

test('CSV: שדה ריק במירכאות, ותווים אחרי מירכאות סוגרות', () => {
  assert.deepStrictEqual(S.parseCsv('a,b\r\n"",x\r\n"ab"c,y\r\n'),
    [{ a: '', b: 'x' }, { a: 'abc', b: 'y' }]);
});

test('מפת מק"טים: ריק לא נכנס, כמה מק"טים ⇒ הראשון', () => {
  const m = S.rivhitCodeMap(S.parseCsv(CSV));
  assert.deepStrictEqual(m, { 'ניק001': '56', 'חדפ002': '1148', 'אבי004': '1489' });
});

test('מספר קטלוגי: אותיות, ספרות ומקף; ריק, ארוך, טאב, מירכאות ו-| נפסלים', () => {
  assert.strictEqual(S.catalogCode(' C203 '), 'C203');
  assert.strictEqual(S.catalogCode('A999-9'), 'A999-9');
  assert.strictEqual(S.catalogCode(1612), '1612');
  ['', '   ', null, undefined, 'A'.repeat(16), 'C2\t03', 'C"2', '1|2', 'a\nb'].forEach(v =>
    assert.strictEqual(S.catalogCode(v), '', JSON.stringify(v)));
});

test('מפת מק"טים: מספר קטלוגי עם אותיות, ולא תקין לא נכנס', () => {
  const m = S.rivhitCodeMap(S.parseCsv('id,rivhit\r\nמגב1,C203|C204\r\nשגוי,"C2""03"\r\nארוך,ABCDEFGHIJKLMNOP\r\n'));
  assert.deepStrictEqual(m, { 'מגב1': 'C203' });
});

test('מספר פנימי: יום בשנה + 6 ספרות', () => {
  assert.strictEqual(S.siteInternalNo('AR-20261104-123456'), 308123456);
  assert.strictEqual(S.siteInternalNo('SL-20260101-4821'), 1004821);
  assert.strictEqual(S.siteInternalNo('HM-20261231-000001'), 365000001);
  assert.strictEqual(S.siteInternalNo('AR-20241231-999999'), 366999999);
});

test('מספר פנימי: תמיד מעל מספרי הממיר ומתחת ל-2^31', () => {
  const n = S.siteInternalNo('AR-20260101-000000');
  assert.ok(n >= 1000000, String(n));
  assert.ok(S.siteInternalNo('AR-20241231-999999') < 2147483647);
});

test('מספר פנימי: פורמט שגוי ⇒ null', () => {
  ['', 'AR-2026110-1234', 'AR-20261340-1234', 'hello', 'AR-20261104-'].forEach(id =>
    assert.strictEqual(S.siteInternalNo(id), null, id));
});

test('תאריך ההזמנה מתוך המספר', () => {
  const d = S.siteOrderDate('AR-20261104-123456');
  assert.deepStrictEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 10, 4]);
  assert.strictEqual(S.siteOrderDate('AR-20260231-1234'), null);
});

test('מסמך: רשומה לכל פריט משויך, 28 שדות, השדות במקומם', () => {
  const res = S.siteOrderDocument(ORDER, CODES, { docType: 7, customerNo: '', today: TODAY });
  assert.strictEqual(res.records.length, 2);
  const r = res.records[0];
  assert.strictEqual(r.length, 28);
  assert.strictEqual(r[0], '1');
  assert.strictEqual(r[1], '05/11/2026');            // תאריך יצירת הקובץ
  assert.strictEqual(r[2], '04/11/2026');            // תאריך ההזמנה מהמספר
  assert.strictEqual(r[3], '7');
  assert.strictEqual(r[4], '56');
  assert.strictEqual(r[5], 'אקונומיקה 4 ליטר');
  assert.strictEqual(r[6], '6');
  assert.strictEqual(r[7], '5');
  assert.strictEqual(r[8], '30');
  assert.strictEqual(r[9], '118');                   // אין מספר ⇒ לקוח מזדמן
  assert.strictEqual(r[10], 'מסעדת הגן הירוק בע״מ');  // מירכאות ⇒ גרשיים
  assert.strictEqual(r[11], 'מסעדת הגן הירוק בע״מ');  // שם העסק גם בשם הפרטי (12.11.26)
  assert.strictEqual(r[12], 'המלאכה 8, אור יהודה');
  assert.strictEqual(r[14], '308123456');
  assert.strictEqual(r[25], '1');
  assert.strictEqual(res.records[1][25], '2');
});

test('מסמך: פריט בלי מחיר ⇒ 0, ושמו נשמר', () => {
  const r = S.siteOrderDocument(ORDER, CODES, { docType: 7, customerNo: '', today: TODAY }).records[1];
  assert.strictEqual(r[4], '1148');
  assert.strictEqual(r[7], '0');
  assert.strictEqual(r[8], '0');
  // כמו בממיר: מירכאות ⇐ ״ (לא מתפרשות כתוחם טקסט), גרש עברי ⇐ ' (כמו בשמות בריווחית)
  assert.strictEqual(r[5], "גביע 150 מ״ל - 100 יח'");
});

test('מסמך: פריט בלי מק"ט ⇒ ברשימת החסרים', () => {
  const res = S.siteOrderDocument(ORDER, CODES, { docType: 7, customerNo: '', today: TODAY });
  assert.deepStrictEqual(res.missing, ['DOVE סבון מוצק']);
});

test('מסמך: מספר לקוח מהכרטיס', () => {
  const r = S.siteOrderDocument(ORDER, CODES, { docType: 4, customerNo: '1234', today: TODAY }).records[0];
  assert.strictEqual(r[9], '1234');
  assert.strictEqual(r[3], '4');
});

test('מסמך: בלי שם עסק ⇒ איש הקשר בשני שדות השם', () => {
  const o = Object.assign({}, ORDER, { customer: { business: '', contact: 'רותי כהן', address: '' } });
  const r = S.siteOrderDocument(o, CODES, { docType: 7, customerNo: '', today: TODAY }).records[0];
  assert.strictEqual(r[10], 'רותי כהן');
  assert.strictEqual(r[11], 'רותי כהן');
});

test('מסמך: שם עסק ארוך נחתך ל-30 בשם המשפחה ול-20 בשם הפרטי', () => {
  const name = 'חברת הניקיון והאחזקה המאוחדת של גוש דן';
  const o = Object.assign({}, ORDER, { customer: { business: name, contact: 'רותי', address: '' } });
  const r = S.siteOrderDocument(o, CODES, { docType: 6, customerNo: '', today: TODAY }).records[0];
  assert.strictEqual(r[10], name.slice(0, 30));
  assert.strictEqual(r[11], name.slice(0, 20));
});

test('מסמך: הצעת מחיר ⇒ סוג 6 ושם קובץ', () => {
  const o = Object.assign({}, ORDER, { orderId: 'HM-20261104-555555' });
  const res = S.siteOrderDocument(o, CODES, { docType: 6, customerNo: '', today: TODAY });
  assert.strictEqual(res.records[0][3], '6');
  assert.strictEqual(res.fileName, 'מסעדת הגן הירוק בע״מ - הצעת מחיר.txt');
});

test('מסמך: שם קובץ בלי תווים אסורים ב-Windows', () => {
  const o = Object.assign({}, ORDER, { customer: { business: 'א/ב: "ג"', contact: '', address: '' } });
  const res = S.siteOrderDocument(o, CODES, { docType: 1, customerNo: '', today: TODAY });
  assert.ok(!/[\\/:*?"<>|]/.test(res.fileName), res.fileName);
  assert.strictEqual(res.fileName, 'א ב ״ג״ - חשבונית מס.txt');
  assert.ok(/ - חשבונית מס\.txt$/.test(res.fileName), res.fileName);
});

test('מסמך: אף פריט לא משויך ⇒ אין רשומות ואין טקסט', () => {
  const res = S.siteOrderDocument(ORDER, {}, { docType: 7, customerNo: '', today: TODAY });
  assert.strictEqual(res.records.length, 0);
  assert.strictEqual(res.text, '');
  assert.strictEqual(res.missing.length, 3);
});

test('מסמך: מספר הזמנה לא תקין ⇒ אין רשומות', () => {
  const o = Object.assign({}, ORDER, { orderId: 'XX' });
  const res = S.siteOrderDocument(o, CODES, { docType: 7, customerNo: '', today: TODAY });
  assert.strictEqual(res.records.length, 0);
  assert.strictEqual(res.error, 'bad order id');
});

test('מסמך: טקסט מוכן לקידוד — טאבים ו-CRLF', () => {
  const res = S.siteOrderDocument(ORDER, CODES, { docType: 7, customerNo: '', today: TODAY });
  assert.strictEqual(res.text.split('\r\n').length, 2);
  assert.strictEqual(res.text.split('\r\n')[0].split('\t').length, 28);
  const enc = R.encodeCp1255(res.text);
  assert.strictEqual(enc.unknown, 0);
});

test('סוגי מסמך ולקוח מזדמן', () => {
  assert.deepStrictEqual(S.SITE_DOC_TYPES.map(t => t.code), [7, 4, 1, 6]);
  assert.strictEqual(S.OCCASIONAL_CUSTOMER, 118);
});

test('buildRecords של הממיר נשען על buildDocument ומחזיר אותו פלט', () => {
  const order = { branch: 'גלילות — טומי', date: '2026-11-01',
    lines: [{ row: 4, desc: 'מים', qty: 5, price: 9, note: 'הערה', code: '693', name: 'מים מזוקקים 4 ליטר' }] };
  const r = R.buildRecords(order, { docType: 7, customerNo: '1', customerName: 'רשת',
    internalNo: '630701', today: new Date(2026, 10, 1) })[0];
  assert.strictEqual(r[5], 'מים מזוקקים 4 ליטר - הערה');
  assert.strictEqual(r[10], 'רשת');
  assert.strictEqual(r[11], '');
  assert.strictEqual(r[12], 'גלילות - טומי');   // מקף ארוך ⇐ מקף רגיל, כמו קודם
  assert.strictEqual(r[14], '630701');
});

test('js/rivhit-core.js נטען כסקריפט קלאסי ומגדיר RivhitCore', () => {
  const file = path.join(__dirname, '..', '..', 'js', 'rivhit-core.js');
  const ctx = { TextEncoder, TextDecoder };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  const res = ctx.RivhitCore.siteOrderDocument(ORDER, CODES, { docType: 7, customerNo: '', today: TODAY });
  assert.strictEqual(res.records.length, 2);
  assert.strictEqual(typeof ctx.RivhitCore.encodeCp1255, 'function');
  assert.strictEqual(typeof ctx.RivhitCore.itemExportRows, 'function');
  assert.strictEqual(typeof ctx.RivhitCore.catalogCode, 'function');
});

// ---------- פריטים מריווחית בדף הסוכן (אפיון 2026-11-09) ----------

const EXPORT_CSV = 'item_num,item_name,item_part_num,sapak,item_cost_nis,item_sale_nis,int1,compute_0037\r\n' +
  '56,אקונומיקה 4 ליטר,56,,7.5,12,1,קבוצה א\r\n' +
  '1500,"כפפות ניטריל ""M""",C203,,20,35,2,קבוצה ב\r\n' +
  '1501,,,,1,2,1,קבוצה א\r\n' +
  '15a,שגוי,X1,,1,2,1,קבוצה א\r\n' +
  '56,כפול,56,,1,2,1,קבוצה א\r\n' +
  '9001,  מגב   תעשייתי  ,9001,,30,45,1,קבוצה א\r\n' +
  '1880,כפול של 895,0,,1,2,9999,לא פעיל\r\n' +
  '1866,כפול בלי מספר,,,1,2,1,קבוצה א\r\n' +
  '1921,כפול שהועבר,1921,,1,2,9999,\r\n';

test('ייצוא פריטים: מספר, שם ומספר קטלוגי; בלי שם, מספר לא תקין וכפילות נופלים', () => {
  const r = S.itemExportRows(S.parseCsv(EXPORT_CSV));
  assert.strictEqual(r.error, '');
  assert.deepStrictEqual(r.items, [
    ['56', 'אקונומיקה 4 ליטר', '56'],
    ['1500', 'כפפות ניטריל "M"', 'C203'],
    ['9001', 'מגב תעשייתי', '9001']
  ]);
  assert.ok(!JSON.stringify(r.items).includes('7.5'), 'מחיר העלות לא נכנס לרשימה');
});

test('ייצוא פריטים: קבוצה "לא פעיל" ופריט בלי מספר קטלוגי לא נכנסים, ונספרים', () => {
  const r = S.itemExportRows(S.parseCsv(EXPORT_CSV));
  assert.strictEqual(r.inactive, 2, 'לפי int1=9999, גם כששם הקבוצה ריק');
  assert.strictEqual(r.noCatalog, 1);
  assert.ok(!r.items.some(it => ['1880', '1866', '1921'].includes(it[0])));
});

test('ייצוא פריטים: מופרד בטאבים (כך הגיע הייצוא של 12.11), עם מירכאות ופסיק בתוך שם', () => {
  const tsv = 'item_num\titem_name\titem_part_num\tint1\r\n' +
    '56\tאקונומיקה 1 ק"ג\t56\t1\r\n' +
    '60\tמגבות, 6 גלילים\tC203\t2\r\n';
  const r = S.itemExportRows(S.parseCsv(tsv));
  assert.strictEqual(r.error, '');
  assert.deepStrictEqual(r.items, [['56', 'אקונומיקה 1 ק"ג', '56'], ['60', 'מגבות, 6 גלילים', 'C203']]);
});

test('ייצוא פריטים: בלי עמודת item_part_num ⇒ שגיאה מסבירה', () => {
  const r = S.itemExportRows(S.parseCsv('item_num,item_name\r\n1,א\r\n'));
  assert.deepStrictEqual(r.items, []);
  assert.ok(/item_part_num/.test(r.error), r.error);
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
  const r = S.itemExportRows([{ item_num: '7', item_name: 'א'.repeat(150), item_part_num: '7' }]);
  assert.strictEqual(r.items[0][1].length, 100);
});

test('מסמך: פריט מריווחית נושא את המספר הקטלוגי שלו; המפה החיה גוברת; לא תקין ⇒ חסר', () => {
  const order = Object.assign({}, ORDER, { items: [
    { id: 'RV-1500', name: 'כפפות ניטריל M', qty: 3, price: 7, rivhit: 'C203' },
    { id: 'ניק001', name: 'אקונומיקה 4 ליטר', qty: 1, price: 5, rivhit: '999' },
    { id: 'RV-x', name: 'מספר קטלוגי שגוי', qty: 1, price: 1, rivhit: 'A'.repeat(16) }
  ] });
  const res = S.siteOrderDocument(order, CODES, { docType: 7, customerNo: '', today: TODAY });
  assert.deepStrictEqual(res.records.map(r => r[4]), ['C203', '56']);
  assert.deepStrictEqual(res.missing, ['מספר קטלוגי שגוי']);
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('✓ ' + name); }
  catch (e) { failed++; console.log('✗ ' + name + '\n   ' + e.message); }
});
console.log(failed ? `${failed} נכשלו` : `כל ${tests.length} הבדיקות עברו`);
process.exit(failed ? 1 : 0);
