/**
 * בדיקות למבנה טבלת תעודת ההזמנה.
 * הקובץ .gs נטען כטקסט ומורץ עם דמויות של שירותי גוגל, כדי שהבדיקה תרוץ
 * על אותו קוד שרץ בענן. נבדקת רק הלוגיקה הטהורה (orderColumns_) —
 * הציור עצמו נבדק בהרצה אמיתית.
 * להרצה: node tools/test/order-doc.test.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadGs() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'google-apps-script-orders.gs'), 'utf8');
  const stubs = `
    var SpreadsheetApp = {}, MailApp = {}, CacheService = {}, DriveApp = {},
        ContentService = {}, Utilities = {}, MimeType = {}, UrlFetchApp = {},
        DocumentApp = { HorizontalAlignment: { LEFT: 'L', RIGHT: 'R', CENTER: 'C' } },
        Logger = { log: function () {} };
  `;
  return new Function(
    stubs + src +
    '; return { orderColumns_: orderColumns_, thumbUrl_: thumbUrl_ };'
  )();
}

const gs = loadGs();

const B2B = {
  orderId: 'AR-20260819-4821', date: '21.08.2026', totalItems: 18,
  totalPrice: '', subtotal: '', discount: '', shipping: '',
  customer: { business: 'מסעדת הגן הירוק בע״מ', contact: 'דנה לוי',
              phone: '054-1234567', address: 'המלאכה 8, אור יהודה' },
  items: [
    { id: 'ניק001', name: 'אקונומיקה 4 ליטר', category: 'ניקיון', qty: 6,
      unit: 'יחידה', image: 'images/ניקיון/אקונומיקה.webp' },
    { id: 'מוצ001', name: 'גליל נייר תעשייתי 5004', category: 'מוצרי נייר',
      qty: 12, unit: 'יחידה', image: '' }
  ]
};

const CARE = {
  orderId: 'AR-20260819-5507', date: '20.08.2026', totalItems: 3,
  subtotal: '233.30', discount: '23.33', shipping: '30.00', totalPrice: '239.97',
  customer: { business: '', contact: 'מיכל ברקוביץ׳', phone: '052-7654321',
              address: 'הרצל 41, קריית אונו' },
  items: [
    { id: '8400027', name: 'ARGANIA מסיכה טיפולית', category: 'שיער', qty: 3,
      unit: 'יחידה', image: 'images/מחירון/arg.jpg', price: 39.9, total: 79.8,
      bundle: '2+1', free: 1 }
  ]
};

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('סדר העמודות: תמונה בימין, כמות בשמאל', () => {
  const c = gs.orderColumns_(B2B);
  // ב-Docs עמודה 0 מרונדרת בצד שמאל, ולכן התמונה חייבת להיות האחרונה
  assert.strictEqual(c.headers[c.headers.length - 1], 'תמונה',
    'התמונה אינה העמודה האחרונה: ' + JSON.stringify(c.headers));
  assert.strictEqual(c.headers[0], 'כמות',
    'הכמות אינה העמודה הראשונה: ' + JSON.stringify(c.headers));
  assert.strictEqual(c.imageCol, c.headers.length - 1);
  assert.strictEqual(c.qtyCol, 0);
});

test('הזמנה עסקית: חמש עמודות, בלי מחירים', () => {
  const c = gs.orderColumns_(B2B);
  assert.strictEqual(c.hasPrices, false);
  assert.strictEqual(c.headers.length, 5, 'מספר עמודות שגוי: ' + c.headers.length);
  assert.ok(c.headers.indexOf('מחיר ליח׳') === -1, 'לא אמורה להיות עמודת מחיר');
  assert.strictEqual(c.rows.length, 2);
  assert.ok(c.rows[0][c.nameCol].indexOf('אקונומיקה 4 ליטר') > -1, 'שם המוצר חסר');
  assert.strictEqual(c.rows[0][c.qtyCol], '6');
});

test('הזמנת טיפוח: שבע עמודות עם מחירים', () => {
  const c = gs.orderColumns_(CARE);
  assert.strictEqual(c.hasPrices, true);
  assert.strictEqual(c.headers.length, 7, 'מספר עמודות שגוי: ' + c.headers.length);
  assert.strictEqual(c.headers[c.headers.length - 1], 'תמונה',
    'התמונה חייבת להישאר אחרונה גם עם מחירים');
  assert.ok(c.rows[0].join(' ').indexOf('39.90') > -1, 'מחיר היחידה חסר');
  assert.ok(c.rows[0].join(' ').indexOf('79.80') > -1, 'סכום השורה חסר');
});

test('מבצע חבילה מופיע בשורה', () => {
  const c = gs.orderColumns_(CARE);
  const cell = c.rows[0][c.nameCol];
  assert.ok(cell.indexOf('2+1') > -1, 'תג המבצע חסר');
  assert.ok(cell.indexOf('1 חינם') > -1, 'מספר היחידות החינם חסר');
});

test('כתובת התמונה הממוזערת נגזרת מהמזהה', () => {
  assert.strictEqual(gs.thumbUrl_('ניק001'),
    'https://aroam.co.il/images/thumbs/' + encodeURIComponent('ניק001') + '.jpg');
});

test('מוצר בלי תמונה מסומן ככזה', () => {
  const c = gs.orderColumns_(B2B);
  assert.strictEqual(c.rows[1][c.imageCol], '', 'תא התמונה אמור להיות ריק');
  assert.strictEqual(c.rows[0][c.imageCol], '', 'תא התמונה נטען בציור, לא במחרוזת');
  assert.strictEqual(c.images[1], null, 'למוצר בלי image לא אמורה להיות כתובת');
  assert.ok(String(c.images[0]).indexOf('thumbs') > -1, 'למוצר עם image חסרה כתובת');
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length
                   : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
