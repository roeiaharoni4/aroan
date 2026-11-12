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
    '   quoteLink_: quoteLink_, isBranchOrder_: isBranchOrder_,' +
    '   pdfName_: pdfName_, orderMonth_: orderMonth_,' +
    '   priceSplit_: priceSplit_, isConsumerOrder_: isConsumerOrder_,' +
    '   waPhone_: waPhone_, consumerDoc_: consumerDoc_,' +
    '   consumerDocLink_: consumerDocLink_, crmEventFor_: crmEventFor_ };'
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


console.log('priceSplit_ — פילוח חד פעמי בתעודה');

test('הזמנה מעורבת מתפצלת לשתי הקבוצות', () => {
  const sp = gs.priceSplit_([
    { category: 'חד פעמי ואריזות', qty: 4, price: 2.5 },
    { category: 'ניקיון', qty: 1, price: 10 }
  ]);
  assert.strictEqual(sp.disposable, 10);
  assert.strictEqual(sp.rest, 10);
});

test('הזמנה שכולה קבוצה אחת לא מקבלת שורות פילוח', () => {
  assert.strictEqual(gs.priceSplit_([{ category: 'ניקיון', qty: 2, price: 5 }]), null);
  assert.strictEqual(gs.priceSplit_([{ category: 'חד פעמי ואריזות', qty: 2, price: 5 }]), null);
});

test('הזמנה בלי מחירים לא מייצרת פילוח', () => {
  assert.strictEqual(gs.priceSplit_([{ category: 'חד פעמי ואריזות', qty: 2 }, { category: 'ניקיון', qty: 1 }]), null);
});

test('רשימת פריטים ריקה או חסרה לא מפילה', () => {
  assert.strictEqual(gs.priceSplit_([]), null);
  assert.strictEqual(gs.priceSplit_(undefined), null);
});
console.log('\nשם קובץ התעודה — סניף וחודש');

// הסניף מגיע ב-customer.business, בדיוק כמו בגיליון ובתעודה
function branchOrder(business, date, orderId) {
  return { orderId: orderId || 'RA-20260826-123456', date: date,
           customer: { business: business, contact: 'דנה' }, items: [] };
}

test('שם הקובץ הוא שם הסניף וחודש ההזמנה', () => {
  assert.strictEqual(
    gs.pdfName_(branchOrder('גלילות — טומי', '26.08.2026')),
    'גלילות — טומי — אוגוסט 2026.pdf');
});

test('תאריך מהאתר (YYYY-MM-DD) ומתסריט הממתינות (DD.MM.YYYY) נותנים אותו חודש', () => {
  // שני הפורמטים מגיעים לאותה פונקציה — האתר שולח ISO והממתינות DD.MM
  assert.strictEqual(gs.orderMonth_({ date: '2026-08-26' }), 'אוגוסט 2026');
  assert.strictEqual(gs.orderMonth_({ date: '26.08.2026' }), 'אוגוסט 2026');
});

test('חנות רחוב בלי מרכז קניות מקבלת את שמה בלבד', () => {
  assert.strictEqual(
    gs.pdfName_(branchOrder('פולו דיזנגוף', '02.09.2026')),
    'פולו דיזנגוף — ספטמבר 2026.pdf');
});

test('תווים אסורים בשם קובץ מנוקים', () => {
  const n = gs.pdfName_(branchOrder('קניון א/ב: סניף 3', '26.08.2026'));
  assert.ok(!/[\/\\:*?"<>|]/.test(n), 'אסור שיישארו תווים אסורים: ' + n);
  assert.ok(n.indexOf('אוגוסט 2026') > 0);
});

test('בע"מ נשמר עם גרשיים עבריים ולא הופך ל-בע-מ', () => {
  const n = gs.pdfName_(branchOrder('מסעדת השף בע"מ', '2026-08-26'));
  assert.strictEqual(n, 'מסעדת השף בע\u05F4מ — אוגוסט 2026.pdf');
  assert.ok(!/[\/\\:*?"<>|]/.test(n), 'ללא תווים אסורים');
});

test('הזמנה בלי שם עסק נופלת חזרה למספר ההזמנה', () => {
  assert.strictEqual(
    gs.pdfName_({ orderId: 'AR-20260826-4437', date: '2026-08-26', customer: {} }),
    'AR-20260826-4437.pdf');
});

test('הזמנת רשת מאושרת (RA-) מזוהה כהזמנת סניף', () => {
  // forwardPayload_ שולח orderId: approvedId, ו-approvedOrderId_ מייצר RA-.
  // הבדיקה הישנה כיסתה רק RS- — קידומת שלא מגיעה לסקריפט הזה אף פעם.
  assert.strictEqual(gs.isBranchOrder_({ orderId: 'RA-20260826-299027' }), true,
    'RA- היא הזמנת רשת שאושרה — בלי זה רצועת הסניף לא מרונדרת');
});

// --- מסמך פרטי העסקה לצרכן (סעיף 14ג(ב) ו-14ט(ד) לחוק הגנת הצרכן) ---
// הפיילוד כפי שהאתר שולח מקטלוג הטיפוח ומעמוד העובדים (showPrices: true).
const CARE_SENT = Object.assign({}, CARE, {
  showPrices: true,
  customer: Object.assign({}, CARE.customer, {
    shipping: 'משלוח עד הבית', payment: 'מזומן או אשראי במסירה'
  })
});

test('מסמך לצרכן: רק בהזמנות טיפוח (AR) ועובדים (VD) עם מחירים', () => {
  assert.strictEqual(gs.isConsumerOrder_(CARE_SENT), true, 'קטלוג הטיפוח');
  assert.strictEqual(gs.isConsumerOrder_(Object.assign({}, CARE_SENT, { orderId: 'VD-20261031-123456' })), true, 'עמוד העובדים');
  assert.strictEqual(gs.isConsumerOrder_(B2B_PRICED), false, 'הקטלוג העסקי — showPrices:false');
  ['SL', 'RS', 'RA', 'HM'].forEach(p => {
    assert.strictEqual(gs.isConsumerOrder_(Object.assign({}, CARE_SENT, { orderId: p + '-20261031-123456' })), false, p);
  });
  assert.strictEqual(gs.isConsumerOrder_(CARE), false, 'בלי showPrices (app.js ישן) — לא מנחשים');
});

test('מסמך לצרכן: טלפון נייד בלבד, בכל צורת כתיבה', () => {
  assert.strictEqual(gs.waPhone_('052-7654321'), '972527654321');
  assert.strictEqual(gs.waPhone_('+972 52 765 4321'), '972527654321');
  assert.strictEqual(gs.waPhone_('00972527654321'), '972527654321');
  assert.strictEqual(gs.waPhone_('03-6346236'), '', 'קווי — אין וואטסאפ');
  assert.strictEqual(gs.waPhone_(''), '');
});

test('מסמך לצרכן: כל הפרטים שהחוק דורש', () => {
  const doc = gs.consumerDoc_(CARE_SENT);
  [
    'אהרוני שיווק והפצה', '059291906', 'היצירה 16',           // שם, מספר זהות, כתובת
    'ARGANIA מסיכה טיפולית', '79.80',                          // המוצר ומחירו
    'משלוח עד הבית', '30.00', '239.97', 'כולל מע״מ',           // אספקה ומחיר כולל
    'מזומן או אשראי במסירה',                                    // תנאי תשלום
    'יצרן', 'אחריות',                                          // יצרן וארץ ייצור, אחריות
    '14 יום', '4 חודשים', '5%', '100 ₪',                       // תנאי הביטול
    '03-6346236', 'meiraroam@gmail.com', 'בדואר רשום',          // דרכי הביטול
    'https://aroam.co.il/cancel/', 'תעודת זהות',
    'https://aroam.co.il/terms/'
  ].forEach(s => assert.ok(doc.indexOf(s) !== -1, 'חסר במסמך: ' + s));
});

test('מסמך לצרכן: קישור וואטסאפ ללקוח עם המסמך המלא', () => {
  const link = gs.consumerDocLink_(CARE_SENT);
  assert.ok(link.indexOf('https://wa.me/972527654321?text=') === 0, link.slice(0, 50));
  assert.strictEqual(decodeURIComponent(link.split('?text=')[1]), gs.consumerDoc_(CARE_SENT));
  assert.strictEqual(gs.consumerDocLink_(B2B_PRICED), '', 'לא בהזמנה עסקית');
  const landline = Object.assign({}, CARE_SENT, { customer: Object.assign({}, CARE_SENT.customer, { phone: '03-5551234' }) });
  assert.strictEqual(gs.consumerDocLink_(landline), '', 'טלפון קווי — בלי קישור');
});

test('CRM: בקשת הצעת מחיר (HM) — עם PDF וקישור הצעה', () => {
  const ev = gs.crmEventFor_(Object.assign({}, B2B, { orderId: 'HM-20261101-482911', showPrices: false }),
    { url: 'https://drive/x' });
  assert.strictEqual(ev.type, 'quote_request');
  assert.strictEqual(ev.via, 'אתר');
  assert.strictEqual(ev.business, 'מסעדת הגן הירוק בע״מ');
  assert.strictEqual(ev.phone, '054-1234567');
  assert.strictEqual(ev.pdfUrl, 'https://drive/x');
  assert.ok(ev.quoteLink.indexOf('https://aroam.co.il/agent/?cart=') === 0, ev.quoteLink);
});

test('CRM: הזמנה עסקית עם סכום מחירון, והזמנה מדף הסוכן', () => {
  const ar = gs.crmEventFor_(B2B_PRICED, null);
  assert.strictEqual(ar.type, 'order');
  assert.strictEqual(ar.via, 'אתר');
  assert.strictEqual(ar.totalPrice, '345.00');
  assert.strictEqual(ar.pdfUrl, '');
  const sl = gs.crmEventFor_(Object.assign({}, B2B, { orderId: 'SL-20261101-111111', showPrices: true,
    totalPrice: '120.00' }), null);
  assert.strictEqual(sl.type, 'order');
  assert.strictEqual(sl.via, 'דף הסוכן');
  assert.strictEqual(sl.quoteLink, '');
});

test('CRM: רשת, ועד, צרכן ושליחה מרוכזת — לא נשלחים', () => {
  const k = (o) => gs.crmEventFor_(Object.assign({}, B2B, o), null);
  assert.strictEqual(k({ orderId: 'RA-20261101-1' }), null);
  assert.strictEqual(k({ orderId: 'RS-20261101-1' }), null);
  assert.strictEqual(k({ orderId: 'VD-20261101-1' }), null);
  assert.strictEqual(k({ suppressEmail: true }), null);
  assert.strictEqual(gs.crmEventFor_(CARE, null), null);
  assert.strictEqual(gs.crmEventFor_(Object.assign({}, CARE, { showPrices: true }), null), null);
  assert.strictEqual(gs.crmEventFor_({}, null), null);
});

test('CRM: הפיילוד שהאתר שולח בפועל (נלכד בדפדפן)', () => {
  const ar = gs.crmEventFor_(require('./fixtures/crm-order-ar.json'), null);
  const hm = gs.crmEventFor_(require('./fixtures/crm-order-hm.json'), null);
  const sl = gs.crmEventFor_(require('./fixtures/crm-order-sl.json'), null);
  assert.strictEqual(ar.type, 'order');
  assert.strictEqual(ar.business, 'מסעדת בדיקה');
  assert.ok(ar.phone);
  assert.strictEqual(hm.type, 'quote_request');
  assert.ok(hm.quoteLink.indexOf('https://aroam.co.il/agent/?cart=') === 0, hm.quoteLink);
  assert.strictEqual(sl.via, 'דף הסוכן');
  assert.strictEqual(sl.business, 'מסעדת בדיקה');
});

// ---------- ריווחית (סבב 88) ----------
// הסקריפט טוען את RivhitCore מקובץ שני בפרויקט (ריווחית.js = js/rivhit-core.js).
// כאן נטענים שניהם יחד, עם דמויות לרשת, למטמון, לגיליון ולמייל.

// הקבצים לריווחית נכתבים ב-Windows-1255
const decode1255 = (bytes) => new TextDecoder('windows-1255').decode(Buffer.from(bytes.map(x => x & 255)));

const PRODUCTS_CSV = 'id,name,category,rivhit\n' +
  'חדפ003,כוס בירה 330 40 יח׳,חד פעמי ואריזות,1415\n' +
  'ניק001,אקונומיקה 4 ליטר,ניקיון,56\n' +
  'חדפ002,גביע 150 מ״ל - 100 יח׳,חד פעמי ואריזות,1148\n' +
  'אבי004,כפפות ניטריל,אביזרי ניקיון,C203|C204\n' +
  'טיפ001,DOVE סבון,טיפוח,\n';

function loadOrdersApp(opts) {
  opts = opts || {};
  const core = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'rivhit-core.js'), 'utf8');
  const src = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script-orders.gs'), 'utf8');
  const sent = { mails: [], fetches: [], rows: [] };
  const cache = {};
  const env = {
    SpreadsheetApp: { openById() { return {
      getSheetByName() { return {
        getLastRow() { return 1; }, getLastColumn() { return 16; },
        appendRow(r) { sent.rows.push(r); }
      }; }
    }; } },
    MailApp: { sendEmail(to, subject, body, o) { sent.mails.push({ to, subject, body, o: o || {} }); } },
    CacheService: { getScriptCache() { return {
      get(k) { return cache[k] == null ? null : cache[k]; },
      put(k, v) { cache[k] = String(v); }
    }; } },
    UrlFetchApp: { fetch(url, o) {
      sent.fetches.push(url);
      if (url.indexOf('products.csv') >= 0) {
        if (opts.csvDown) return { getResponseCode() { return 500; }, getContentText() { return ''; } };
        return { getResponseCode() { return 200; }, getContentText() { return PRODUCTS_CSV; } };
      }
      const body = opts.crmDown ? { ok: false } : { ok: true, id: 'C1', rivhitNo: opts.rivhitNo || '' };
      return { getResponseCode() { return 200; }, getContentText() { return JSON.stringify(body); } };
    } },
    Utilities: {
      newBlob(bytes, type, name) { return { bytes, type, name, getName() { return name; } }; }
    },
    ContentService: { MimeType: { JSON: 'json' },
      createTextOutput(s) { return { content: s, setMimeType() { return this; } }; } },
    DriveApp: {}, MimeType: {}, DocumentApp: { HorizontalAlignment: {} },
    Logger: { log() {} }
  };
  const names = Object.keys(env);
  const app = new Function(...names, core + '\n' + src + '\n' +
    "SPREADSHEET_ID = 'X'; CRM_URL = 'https://crm.example/exec'; CRM_SECRET = 's';\n" +
    'return { doPost: doPost, rivhitAttachments_: rivhitAttachments_, rivhitMailText_: rivhitMailText_,' +
    ' rivhitCodes_: rivhitCodes_, notifyCrm_: notifyCrm_, crmEventFor_: crmEventFor_ };'
  )(...names.map(n => env[n]));
  app.sent = sent;
  app.cache = cache;
  app.post = (data) => JSON.parse(app.doPost({ postData: { contents: JSON.stringify(data) } }).content);
  return app;
}

const AR_ORDER = {
  orderId: 'AR-20261104-123456', date: '04.11.2026', totalItems: 9, totalPrice: '230.00',
  showPrices: false,
  customer: { business: 'מסעדת הגן הירוק בע"מ', contact: 'דנה לוי', phone: '054-1234567',
              address: 'המלאכה 8, אור יהודה' },
  items: [
    { id: 'חדפ003', name: 'כוס בירה 330 40 יח׳', category: 'חד פעמי ואריזות', qty: 1, unit: 'יחידה',
      image: '', price: 200, total: 200 },
    { id: 'ניק001', name: 'אקונומיקה 4 ליטר', category: 'ניקיון', qty: 6, unit: 'יחידה',
      image: '', price: 5, total: 30 },
    { id: 'טיפ001', name: 'DOVE סבון', category: 'טיפוח', qty: 2, unit: 'יחידה', image: '', price: 12, total: 24 }
  ]
};
const TODAY = new Date(2026, 10, 4);

test('ריווחית: הזמנה ⇒ קובץ אחד: הצעת מחיר, לקוח 118, שם העסק בשני שדות השם (12.11.26)', () => {
  const app = loadOrdersApp();
  const r = app.rivhitAttachments_(AR_ORDER, '', null, TODAY);
  assert.deepStrictEqual(r.files.map(f => f.name), ['מסעדת הגן הירוק בע״מ - הצעת מחיר.txt']);
  const b = r.files[0].bytes;
  assert.ok(b.every(x => x >= -128 && x <= 127), 'בייטים חתומים כמו ש-Utilities.newBlob מצפה');
  const lines = decode1255(b).split('\r\n');
  assert.strictEqual(lines.length, 2, 'שני פריטים משויכים');
  const f = lines[0].split('\t');
  assert.strictEqual(f[3], '6');
  assert.strictEqual(f[9], '118');
  assert.strictEqual(f[10], 'מסעדת הגן הירוק בע״מ');
  assert.strictEqual(f[11], 'מסעדת הגן הירוק בע״מ');
  assert.deepStrictEqual(r.missing, ['DOVE סבון']);
  assert.strictEqual(r.error, '');
});

test('ריווחית: בקשת הצעת מחיר ⇒ אותו קובץ אחד מסוג הצעת מחיר', () => {
  const app = loadOrdersApp();
  const r = app.rivhitAttachments_(Object.assign({}, AR_ORDER, { orderId: 'HM-20261104-654321' }), '', null, TODAY);
  assert.deepStrictEqual(r.files.map(f => f.name), ['מסעדת הגן הירוק בע״מ - הצעת מחיר.txt']);
  const f = decode1255(r.files[0].bytes).split('\t');
  assert.strictEqual(f[3], '6');
  assert.strictEqual(f[9], '118');
});

test('ריווחית: מוצר באתר עם מספר קטלוגי אמיתי (C203) נכנס בשדה 5', () => {
  const app = loadOrdersApp();
  const o = Object.assign({}, AR_ORDER, { items: [
    { id: 'אבי004', name: 'כפפות ניטריל', category: 'אביזרי ניקיון', qty: 4, unit: 'יחידה', image: '', price: 7, total: 28 }
  ] });
  const r = app.rivhitAttachments_(o, '', null, TODAY);
  assert.strictEqual(decode1255(r.files[0].bytes).split('\t')[4], 'C203');
});

test('ריווחית: מק"טים נשמרים במטמון — הורדה אחת של products.csv לשתי הזמנות', () => {
  const app = loadOrdersApp();
  app.rivhitAttachments_(AR_ORDER, '', null, TODAY);
  app.rivhitAttachments_(AR_ORDER, '', null, TODAY);
  assert.strictEqual(app.sent.fetches.filter(u => u.indexOf('products.csv') >= 0).length, 1);
});

test('ריווחית: products.csv לא נטען ⇒ אין קבצים, אין חריגה, וההסבר מפנה ל-CRM', () => {
  const app = loadOrdersApp({ csvDown: true });
  const r = app.rivhitAttachments_(AR_ORDER, '', null, TODAY);
  assert.strictEqual(r.files.length, 0);
  assert.ok(r.error);
  assert.ok(/CRM/.test(app.rivhitMailText_(r, { ok: true })));
});

test('ריווחית: אף פריט לא משויך ⇒ בלי קבצים, והמייל מסביר למה', () => {
  const app = loadOrdersApp();
  const o = Object.assign({}, AR_ORDER, { items: [AR_ORDER.items[2]] });
  const r = app.rivhitAttachments_(o, '', null, TODAY);
  assert.strictEqual(r.files.length, 0);
  const t = app.rivhitMailText_(r, { ok: true });
  assert.ok(/לא נוצר קובץ/.test(t), t);
  assert.ok(/מספר קטלוגי/.test(t), t);
  assert.ok(/DOVE סבון/.test(t), t);
});

test('ריווחית: שורת המייל — הצעת מחיר על לקוח 118, ומה לא נכנס', () => {
  const app = loadOrdersApp();
  const t = app.rivhitMailText_(app.rivhitAttachments_(AR_ORDER, '', null, TODAY), { ok: true });
  assert.ok(/מצורף קובץ לקליטה בריווחית כהצעת מחיר — לקוח 118 \(לקוחות שונים\)\./.test(t), t);
  assert.ok(/לא נכללו בקובץ \(אין מספר קטלוגי בריווחית\): DOVE סבון/.test(t), t);
  assert.ok(!/CRM/.test(t), 'כשיש קובץ אין צורך להפנות ל-CRM: ' + t);
});

test('ריווחית: האירוע ל-CRM נושא את פריטי ההזמנה, ו-notifyCrm_ מחזיר את מספר הלקוח', () => {
  const app = loadOrdersApp({ rivhitNo: '1234' });
  const ev = app.crmEventFor_(AR_ORDER, null);
  assert.deepStrictEqual(ev.items[1], { id: 'ניק001', name: 'אקונומיקה 4 ליטר', qty: 6, price: 5 });
  assert.deepStrictEqual(app.notifyCrm_(ev), { ok: true, id: 'C1', rivhitNo: '1234' });
});

test('ריווחית: שורת המייל — לקוח עם מספר בריווחית בלי "(לקוחות שונים)"', () => {
  const app = loadOrdersApp();
  const t = app.rivhitMailText_(app.rivhitAttachments_(AR_ORDER, '1234', null, TODAY), { ok: true });
  assert.ok(/מצורף קובץ לקליטה בריווחית כהצעת מחיר — לקוח 1234\./.test(t), t);
  assert.ok(!/לקוחות שונים/.test(t), t);
});

test('ריווחית: doPost — לקוח מוכר ב-CRM עם מספר בריווחית ⇒ הצעת מחיר על המספר שלו (סבב 93)', () => {
  const app = loadOrdersApp({ rivhitNo: '1234' });
  assert.strictEqual(app.post(AR_ORDER).success, true);
  const m = app.sent.mails[0];
  assert.strictEqual(m.o.attachments.length, 1, 'ה-PDF נכשל בדמויות — רק קובץ ריווחית');
  assert.strictEqual(m.o.attachments[0].name, 'מסעדת הגן הירוק בע״מ - הצעת מחיר.txt');
  const f = decode1255(m.o.attachments[0].bytes).split('\t');
  assert.strictEqual(f[3], '6');
  assert.strictEqual(f[9], '1234');
  assert.ok(/כהצעת מחיר — לקוח 1234\./.test(m.body), m.body);
  assert.strictEqual(app.sent.rows.length, 1);
});

test('ריווחית: doPost — לקוח בלי מספר בריווחית ⇒ 118 (לקוחות שונים)', () => {
  const app = loadOrdersApp({ rivhitNo: '' });
  app.post(AR_ORDER);
  const m = app.sent.mails[0];
  assert.strictEqual(decode1255(m.o.attachments[0].bytes).split('\t')[9], '118');
  assert.ok(/לקוח 118 \(לקוחות שונים\)/.test(m.body), m.body);
  assert.ok(!/ה-CRM לא ענה/.test(m.body), m.body);
});

test('ריווחית: doPost — ה-CRM לא ענה ⇒ 118, והמייל אומר את זה', () => {
  const app = loadOrdersApp({ crmDown: true, rivhitNo: '1234' });
  app.post(AR_ORDER);
  const m = app.sent.mails[0];
  assert.strictEqual(decode1255(m.o.attachments[0].bytes).split('\t')[9], '118');
  assert.ok(/ה-CRM לא ענה, ולכן הקובץ על לקוח 118/.test(m.body), m.body);
});

test('ריווחית: הזמנה מדף הסוכן — סוג המסמך שנבחר; בלי בחירה תקינה ⇒ הזמנה; מהאתר תמיד הצעת מחיר', () => {
  const app = loadOrdersApp();
  const sl = Object.assign({}, AR_ORDER, { orderId: 'SL-20261112-123456', showPrices: true });
  const type = (o) => decode1255(app.rivhitAttachments_(o, '1234', null, TODAY).files[0].bytes).split('\t')[3];
  const name = (o) => app.rivhitAttachments_(o, '1234', null, TODAY).files[0].name;
  assert.strictEqual(type(sl), '7');
  assert.strictEqual(name(sl), 'מסעדת הגן הירוק בע״מ - הזמנה.txt');
  assert.strictEqual(type(Object.assign({}, sl, { rivhitDocType: 4 })), '4');
  assert.strictEqual(name(Object.assign({}, sl, { rivhitDocType: '1' })), 'מסעדת הגן הירוק בע״מ - חשבונית מס.txt');
  assert.strictEqual(type(Object.assign({}, sl, { rivhitDocType: 6 })), '6');
  assert.strictEqual(type(Object.assign({}, sl, { rivhitDocType: 9 })), '7');
  assert.strictEqual(type(Object.assign({}, AR_ORDER, { rivhitDocType: 4 })), '6', 'הזמנה מהאתר לא בוחרת סוג');
  const t = app.rivhitMailText_(app.rivhitAttachments_(Object.assign({}, sl, { rivhitDocType: 4 }), '1234', null, TODAY), { ok: true });
  assert.ok(/כתעודת משלוח — לקוח 1234\./.test(t), t);
});

test('ריווחית: doPost — רשת החנויות והזמנת צרכן בלי קבצים', () => {
  const app = loadOrdersApp();
  app.post(Object.assign({}, AR_ORDER, { orderId: 'RA-20261104-111111' }));
  app.post({ orderId: 'AR-20261104-222222', showPrices: true, totalPrice: '50.00',
    customer: { business: '', contact: 'מיכל', phone: '0527654321', address: 'הרצל 1', shipping: 'משלוח' },
    items: [{ id: '8400027', name: 'ARGANIA', qty: 1, price: 50, total: 50 }] });
  app.sent.mails.forEach(m => {
    assert.strictEqual((m.o.attachments || []).length, 0, m.subject);
    assert.ok(!/ריווחית/.test(m.body), m.subject);
  });
});

// ---------- פריטים מריווחית בדף הסוכן (אפיון 2026-11-09) ----------

const SL_WITH_RV = Object.assign({}, AR_ORDER, {
  orderId: 'SL-20261109-123456', showPrices: true,
  items: AR_ORDER.items.concat([
    { id: 'RV-1500', name: 'כפפות ניטריל M', category: 'מריווחית', qty: 3, unit: '', image: '',
      price: 7, total: 21, rivhit: 'C203' }
  ])
});

test('ריווחית: האירוע ל-CRM מעביר את המספר הקטלוגי של פריט מריווחית, ורק שלו', () => {
  const app = loadOrdersApp();
  const ev = app.crmEventFor_(SL_WITH_RV, null);
  assert.deepStrictEqual(ev.items[3], { id: 'RV-1500', name: 'כפפות ניטריל M', qty: 3, price: 7, rivhit: 'C203' });
  assert.ok(!('rivhit' in ev.items[1]));
});

test('ריווחית: האירוע ל-CRM לא מעביר מספר קטלוגי לא תקין', () => {
  const app = loadOrdersApp();
  const o = Object.assign({}, SL_WITH_RV, { items: [
    { id: 'RV-1', name: 'א', qty: 1, price: 1, rivhit: 'C2"03' },
    { id: 'RV-2', name: 'ב', qty: 1, price: 1, rivhit: 'A'.repeat(16) },
    { id: 'RV-3', name: 'ג', qty: 1, price: 1, rivhit: ' 1612 ' }
  ] });
  const ev = app.crmEventFor_(o, null);
  assert.ok(!('rivhit' in ev.items[0]));
  assert.ok(!('rivhit' in ev.items[1]));
  assert.strictEqual(ev.items[2].rivhit, '1612');
});

test('ריווחית: קובץ הקליטה כולל פריט מריווחית לפי המספר הקטלוגי שהוא נושא', () => {
  const app = loadOrdersApp();
  const r = app.rivhitAttachments_(SL_WITH_RV, '', null, TODAY);
  const lines = decode1255(r.files[0].bytes).split('\r\n');
  assert.strictEqual(lines.length, 3, 'שני מוצרי אתר משויכים + פריט מריווחית');
  assert.strictEqual(lines[2].split('\t')[4], 'C203');
  assert.deepStrictEqual(r.missing, ['DOVE סבון']);
});

test('ריווחית: doPost — הזמנה מדף הסוכן עם פריט מריווחית', () => {
  const app = loadOrdersApp({ rivhitNo: '1234' });
  assert.strictEqual(app.post(SL_WITH_RV).success, true);
  const m = app.sent.mails[0];
  assert.strictEqual(m.o.attachments.length, 1);
  const text = decode1255(m.o.attachments[0].bytes);
  assert.ok(text.split('\r\n').some(l => l.split('\t')[4] === 'C203'), 'המספר הקטלוגי של הפריט מריווחית בקובץ');
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length
                   : '\nכל ' + tests.length + ' הבדיקות עברו');

process.exit(failed ? 1 : 0);
