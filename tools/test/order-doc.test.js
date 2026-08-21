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
    '; return { orderColumns_: orderColumns_, thumbUrl_: thumbUrl_,' +
    '   quoteLink_: quoteLink_, isBranchOrder_: isBranchOrder_ };'
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

// מה שהאתר שולח בפועל מהקטלוג העסקי: המחירים מוסתרים מהלקוח, אבל
// totalPrice ומחירי הפריטים מחושבים מ-products.csv ונשלחים.
const B2B_PRICED = {
  orderId: 'AR-20260820-4449', date: '20.08.2026', totalItems: 5,
  totalPrice: '345.00', subtotal: '345.00', discount: '0.00', shipping: '0.00',
  showPrices: false,
  customer: { business: 'רועי בדיקה', contact: '', phone: '098', address: '' },
  items: [
    { id: 'חדפ003', name: 'כוס בירה 330 40 יח׳', category: 'חד פעמי ואריזות',
      qty: 1, unit: 'יחידה', image: 'images/חדפ/כוס.webp', price: 200, total: 200 },
    { id: 'חדפ002', name: 'גביע 150/250 מל', category: 'חד פעמי ואריזות',
      qty: 1, unit: 'יחידה', image: '', price: 0, total: 0 }
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

test('תא המוצר כולל קטגוריה כשורה נפרדת (בלי מבצע)', () => {
  const c = gs.orderColumns_(B2B);
  const lines = c.rows[0][c.nameCol].split('\n');
  assert.strictEqual(lines.length, 2, 'אמורות להיות בדיוק שתי שורות: שם וקטגוריה');
  assert.strictEqual(lines[0], 'אקונומיקה 4 ליטר', 'השורה הראשונה אמורה להיות שם המוצר');
  assert.strictEqual(lines[1], 'ניקיון', 'השורה השנייה אמורה להיות הקטגוריה');
});

test('תא המוצר: שם, קטגוריה ואז מבצע (בסדר הזה)', () => {
  const c = gs.orderColumns_(CARE);
  const lines = c.rows[0][c.nameCol].split('\n');
  assert.strictEqual(lines.length, 3, 'אמורות להיות שלוש שורות: שם, קטגוריה, מבצע');
  assert.strictEqual(lines[0], 'ARGANIA מסיכה טיפולית', 'השורה הראשונה אמורה להיות שם המוצר');
  assert.strictEqual(lines[1], 'שיער', 'השורה השנייה אמורה להיות הקטגוריה');
  assert.ok(lines[2].indexOf('2+1') > -1, 'השורה השלישית אמורה להכיל את תג המבצע');
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

test('קישור הצעת מחיר: נבנה להזמנה בלי מחירים', () => {
  const link = gs.quoteLink_(B2B);
  assert.ok(link.indexOf('https://aroam.co.il/agent/?cart=') === 0, 'תחילית שגויה: ' + link);
  assert.ok(link.includes(encodeURIComponent('ניק001') + ':6'), 'הפריט הראשון חסר');
  assert.ok(link.includes(encodeURIComponent('מוצ001') + ':12'), 'הפריט השני חסר');
  assert.ok(link.includes('customer=' + encodeURIComponent('מסעדת הגן הירוק בע״מ')), 'שם הלקוח חסר');
});

test('קישור הצעת מחיר: אינו נבנה כשיש כבר מחירים', () => {
  assert.strictEqual(gs.quoteLink_(CARE), '', 'לא אמור להיווצר קישור להזמנה עם מחירים');
});

// הקטלוג העסקי מסתיר מחירים מהלקוח, אבל האתר שולח סכום מחושב מ-products.csv
// (יש מחיר ל-118 מ-176 המוצרים). לכן זיהוי לפי totalPrice בלבד סיווג את
// ההזמנה כ"מתומחרת" והקישור לא נבנה אף פעם — הבאג שרועי דיווח עליו 20.08.
test('קישור הצעת מחיר: נבנה גם כשהאתר שלח סכום, כל עוד המחירים היו מוסתרים', () => {
  const link = gs.quoteLink_(B2B_PRICED);
  assert.ok(link.indexOf('https://aroam.co.il/agent/?cart=') === 0, 'הקישור לא נבנה: ' + link);
  assert.ok(link.includes(encodeURIComponent('חדפ003') + ':1'), 'הפריט חסר בקישור');
  assert.ok(link.includes('customer=' + encodeURIComponent('רועי בדיקה')), 'שם הלקוח חסר');
});

test('קישור הצעת מחיר: showPrices=true חוסם גם כשאין סכום', () => {
  const priced = Object.assign({}, B2B_PRICED, { showPrices: true });
  assert.strictEqual(gs.quoteLink_(priced), '', 'קטלוג שמציג מחירים לא אמור לקבל קישור');
});

// תאימות לאחור: דפדפן עם app.js ישן בקאש אינו שולח showPrices כלל
test('קישור הצעת מחיר: בלי השדה החדש חוזרים להתנהגות הישנה', () => {
  const legacy = Object.assign({}, B2B_PRICED);
  delete legacy.showPrices;
  assert.strictEqual(gs.quoteLink_(legacy), '', 'בלי השדה, סכום קיים חוסם כמו קודם');
});

test('הזמנת רשת מזוהה לפי קידומת RS-', () => {
  assert.strictEqual(gs.isBranchOrder_({ orderId: 'RS-20260821-6066' }), true, 'RS- אמורה להיות הזמנת רשת');
});

test('הזמנה רגילה אינה הזמנת רשת', () => {
  assert.strictEqual(gs.isBranchOrder_({ orderId: 'AR-20260821-4437' }), false, 'AR- היא הזמנה רגילה');
  assert.strictEqual(gs.isBranchOrder_({ orderId: 'VD-20260805-1234' }), false, 'VD- היא הזמנת ועד');
});

test('הזמנה בלי מספר לא מפילה את זיהוי הרשת', () => {
  assert.strictEqual(gs.isBranchOrder_({}), false, 'בלי orderId — לא הזמנת רשת');
  assert.strictEqual(gs.isBranchOrder_(null), false, 'בלי data — לא הזמנת רשת');
});

test('עמודות המחיר נשארות בהזמנה עסקית — רועי ביקש לראות מחירי מחירון', () => {
  const c = gs.orderColumns_(B2B_PRICED);
  assert.strictEqual(c.hasPrices, true, 'המחירים אמורים להישאר בתעודה');
  assert.strictEqual(c.headers.length, 7, 'צפויות שבע עמודות');
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length
                   : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
