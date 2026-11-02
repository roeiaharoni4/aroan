/**
 * בדיקות לסקריפט ה-CRM (tools/google-apps-script-crm.gs).
 * הקובץ .gs נטען כטקסט ומורץ עם דמויות של שירותי גוגל, כך שהבדיקה רצה על
 * אותו קוד שרץ בענן.
 * להרצה: node tools/test/crm.test.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const NOW = { date: '2026-11-02', stamp: '2026-11-02 10:42' };

function loadGs() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script-crm.gs'), 'utf8');
  const stubs = `
    var SpreadsheetApp = {}, LockService = {}, ContentService = {},
        Logger = { log: function () {} },
        Utilities = { formatDate: function (d) {
          var p = function (n) { return (n < 10 ? '0' : '') + n; };
          return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
            ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
        } };
  `;
  return new Function(stubs + src +
    '; return { normalizePhone_: normalizePhone_, sanitize_: sanitize_,' +
    '   findContact_: findContact_, applyEvent_: applyEvent_,' +
    '   classifyOrderRow_: classifyOrderRow_, buildImport_: buildImport_,' +
    '   orderRowsFromValues_: orderRowsFromValues_ };')();
}

const gs = loadGs();
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
const emptyModel = () => ({ contacts: [], activities: [] });

// אירועים בצורה שסקריפט הלידים וסקריפט ההזמנות שולחים (ראו Contracts)
const LEAD = {
  type: 'lead', name: 'דנה כהן', business: 'מסעדת הגפן', phone: '050-123-4567',
  email: '', message: 'צריך הצעה לחד פעמי', subject: 'פנייה חדשה מעמוד צור קשר',
  page: '/contact/', landing: '/lp/disposables/', source: 'disposables | google', gclid: ''
};
const ORDER = {
  type: 'order', via: 'אתר', orderId: 'AR-20261101-123456', business: 'מסעדת הגפן',
  contact: 'דנה כהן', phone: '0501234567', address: 'המלאכה 8, אור יהודה',
  totalItems: 12, totalPrice: '345.00', pdfUrl: 'https://drive.google.com/file/d/x/view',
  quoteLink: ''
};
// שורה מגיליון ההזמנות (אחרי orderRowsFromValues_). הטלפון בלי 0 — כך גוגל
// שיטס שומר מספר שהוקלד בלי מקפים.
const ROW = {
  orderId: 'AR-20260901-111111', receivedAt: '2026-09-01 09:00', business: 'מסעדת הגפן',
  contact: 'דנה', phone: '501234567', address: '', notes: '', totalItems: '5',
  totalPrice: '120.00', shipping: '', pdf: ''
};

// ---------- טלפון וניקוי ----------

test('טלפון: נייד בכל צורת כתיבה', () => {
  ['050-123-4567', '0501234567', '+972 50 123 4567', '972501234567', '00972501234567']
    .forEach(p => assert.strictEqual(gs.normalizePhone_(p), '0501234567', p));
});

test('טלפון: ה-0 שנפל בגיליון חוזר', () => {
  assert.strictEqual(gs.normalizePhone_(501234567), '0501234567');
  assert.strictEqual(gs.normalizePhone_('35551234'), '035551234');
});

test('טלפון: קווי, 07X ו-1-800', () => {
  assert.strictEqual(gs.normalizePhone_('03-555-1234'), '035551234');
  assert.strictEqual(gs.normalizePhone_('077-1234567'), '0771234567');
  assert.strictEqual(gs.normalizePhone_('1-800-123-456'), '1800123456');
});

test('טלפון: לא תקין מחזיר ריק', () => {
  ['', '12345', '098', 'abc', '0501234'].forEach(p => assert.strictEqual(gs.normalizePhone_(p), '', p));
});

test('ניקוי: נוסחאות מנוטרלות, שורה חדשה נשמרת, אורך מוגבל', () => {
  assert.strictEqual(gs.sanitize_('=SUM(A1)'), "'=SUM(A1)");
  assert.strictEqual(gs.sanitize_('-5'), "'-5");
  assert.strictEqual(gs.sanitize_('שורה\nשנייה'), 'שורה\nשנייה');
  assert.strictEqual(gs.sanitize_('a\u0007b'), 'a b');
  assert.strictEqual(gs.sanitize_('x'.repeat(500), 10).length, 10);
});

// ---------- אירועים ----------

test('ליד חדש: שלב חדש, לחזור היום, מקור מנושא הטופס', () => {
  const m = emptyModel();
  const r = gs.applyEvent_(m, LEAD, NOW);
  assert.strictEqual(r.created, true);
  const c = m.contacts[0];
  assert.strictEqual(c.phone, '0501234567');
  assert.strictEqual(c.stage, 'חדש');
  assert.strictEqual(c.followUp, '2026-11-02');
  assert.strictEqual(c.source, 'אתר — פנייה חדשה מעמוד צור קשר');
  const a = m.activities[0];
  assert.strictEqual(a.type, 'ליד מהאתר');
  assert.strictEqual(a.by, 'אתר');
  assert.ok(a.text.indexOf('צריך הצעה לחד פעמי') >= 0, a.text);
  assert.ok(a.text.indexOf('נחיתה: /lp/disposables/') >= 0, a.text);
});

test('אותו טלפון בכתיבה אחרת — אותו איש קשר, בלי לדרוס שם, עם השלמת אימייל', () => {
  const m = emptyModel();
  gs.applyEvent_(m, LEAD, NOW);
  const r = gs.applyEvent_(m, Object.assign({}, LEAD,
    { name: 'שם אחר', phone: '+972-50-1234567', email: 'd@x.co.il' }), NOW);
  assert.strictEqual(r.created, false);
  assert.strictEqual(m.contacts.length, 1);
  assert.strictEqual(m.contacts[0].name, 'דנה כהן');
  assert.strictEqual(m.contacts[0].email, 'd@x.co.il');
  assert.strictEqual(m.activities.length, 2);
});

test('לא רלוונטי נפתח מחדש כחדש; לקוח נשאר לקוח וחוזר ל"לטיפול"', () => {
  const m = emptyModel();
  gs.applyEvent_(m, LEAD, NOW);
  m.contacts[0].stage = 'לא רלוונטי';
  m.contacts[0].followUp = '';
  gs.applyEvent_(m, LEAD, NOW);
  assert.strictEqual(m.contacts[0].stage, 'חדש');
  m.contacts[0].stage = 'לקוח';
  m.contacts[0].followUp = '';
  gs.applyEvent_(m, LEAD, NOW);
  assert.strictEqual(m.contacts[0].stage, 'לקוח');
  assert.strictEqual(m.contacts[0].followUp, '2026-11-02');
});

test('תאריך חזרה שעבר נשאר; תאריך עתידי מוקדם להיום', () => {
  const m = emptyModel();
  gs.applyEvent_(m, LEAD, NOW);
  m.contacts[0].followUp = '2026-10-28';
  gs.applyEvent_(m, LEAD, NOW);
  assert.strictEqual(m.contacts[0].followUp, '2026-10-28');
  m.contacts[0].followUp = '2026-11-20';
  gs.applyEvent_(m, LEAD, NOW);
  assert.strictEqual(m.contacts[0].followUp, '2026-11-02');
});

test('הזמנה: לקוח, מונה, תאריך חזרה מתאפס, כתובת אחרונה, פעולה עם סכום', () => {
  const m = emptyModel();
  gs.applyEvent_(m, LEAD, NOW);
  gs.applyEvent_(m, ORDER, NOW);
  const c = m.contacts[0];
  assert.strictEqual(c.stage, 'לקוח');
  assert.strictEqual(c.orders, '1');
  assert.strictEqual(c.lastOrder, '2026-11-02');
  assert.strictEqual(c.followUp, '');
  assert.strictEqual(c.address, 'המלאכה 8, אור יהודה');
  const a = m.activities[1];
  assert.strictEqual(a.type, 'הזמנה');
  assert.strictEqual(a.orderId, 'AR-20261101-123456');
  assert.strictEqual(a.pdf, 'https://drive.google.com/file/d/x/view');
  assert.ok(a.text.indexOf('345.00 ₪') >= 0, a.text);
  assert.strictEqual(a.by, 'הזמנות');
});

test('מספר הזמנה שכבר רשום — בלי כפילות', () => {
  const m = emptyModel();
  gs.applyEvent_(m, ORDER, NOW);
  const r = gs.applyEvent_(m, ORDER, NOW);
  assert.strictEqual(r.skipped, true);
  assert.strictEqual(r.contact.id, m.contacts[0].id);
  assert.strictEqual(m.activities.length, 1);
  assert.strictEqual(m.contacts[0].orders, '1');
});

test('בלי טלפון — לפי שם העסק; טלפון שמגיע אחר כך משלים ולא משכפל', () => {
  const m = emptyModel();
  gs.applyEvent_(m, Object.assign({}, ORDER, { orderId: 'SL-1', via: 'דף הסוכן', phone: '' }), NOW);
  assert.strictEqual(m.contacts[0].phone, '');
  assert.strictEqual(m.contacts[0].source, 'דף הסוכן');
  gs.applyEvent_(m, Object.assign({}, ORDER,
    { orderId: 'SL-2', via: 'דף הסוכן', business: 'מסעדת  הגפן' }), NOW);
  assert.strictEqual(m.contacts.length, 1);
  assert.strictEqual(m.contacts[0].phone, '0501234567');
  assert.strictEqual(m.contacts[0].orders, '2');
});

test('טלפון אחר עם אותו שם עסק — איש קשר נפרד', () => {
  const m = emptyModel();
  gs.applyEvent_(m, ORDER, NOW);
  gs.applyEvent_(m, Object.assign({}, ORDER, { orderId: 'AR-2', phone: '0529999999' }), NOW);
  assert.strictEqual(m.contacts.length, 2);
});

// ---------- ייבוא ----------

test('ייבוא: רשת, ועד וצרכן מדולגים', () => {
  const k = (o) => gs.classifyOrderRow_(Object.assign({}, ROW, o));
  assert.strictEqual(k({ orderId: 'RS-1' }).reason, 'chain');
  assert.strictEqual(k({ orderId: 'RA-1' }).reason, 'chain');
  assert.strictEqual(k({ orderId: 'VD-1' }).reason, 'committee');
  assert.strictEqual(k({ shipping: 'משלוח עד הבית' }).reason, 'consumer');
  assert.strictEqual(k({ business: '' }).reason, 'consumer');
});

test('ייבוא: HM, AR עסקי ו-SL נכנסים', () => {
  assert.deepStrictEqual(gs.classifyOrderRow_(Object.assign({}, ROW, { orderId: 'HM-1' })), { kind: 'quote_request' });
  assert.deepStrictEqual(gs.classifyOrderRow_(ROW), { kind: 'order', via: 'אתר' });
  assert.deepStrictEqual(gs.classifyOrderRow_(Object.assign({}, ROW, { orderId: 'SL-1' })), { kind: 'order', via: 'דף הסוכן' });
});

test('ייבוא: שורת בדיקה, בלי מפתח, קידומת לא מוכרת', () => {
  const k = (o) => gs.classifyOrderRow_(Object.assign({}, ROW, o));
  assert.strictEqual(k({ contact: 'בדיקת עומס — למחוק' }).reason, 'test');
  assert.strictEqual(k({ orderId: 'SL-1', phone: '', business: '' }).reason, 'noKey');
  assert.strictEqual(k({ orderId: 'XX-1' }).reason, 'unknown');
});

test('ייבוא: סיכום לפי סיבה ושמות שורות הבדיקה', () => {
  const m = emptyModel();
  const rows = [
    ROW,
    Object.assign({}, ROW, { orderId: 'HM-20261101-1', receivedAt: '2026-11-01 08:00',
      business: 'משרדי אלפא', phone: '0529876543' }),
    Object.assign({}, ROW, { orderId: 'RA-1' }),
    Object.assign({}, ROW, { orderId: 'AR-9', contact: 'בדיקה — למחוק', business: 'רועי בדיקה' }),
    Object.assign({}, ROW, { orderId: 'AR-8', business: '', shipping: 'איסוף עצמי' })
  ];
  const summary = gs.buildImport_(m, rows, NOW).summary;
  assert.strictEqual(summary.rows, 5);
  assert.strictEqual(summary.created, 2);
  assert.strictEqual(summary.activities, 2);
  assert.strictEqual(summary.skipped.chain, 1);
  assert.strictEqual(summary.skipped.test, 1);
  assert.strictEqual(summary.skipped.consumer, 1);
  assert.deepStrictEqual(summary.testRows, ['AR-9 — רועי בדיקה']);
});

test('ייבוא: לקוח בלי תאריך חזרה; בקשה בלבד — חדש בלי תאריך; תאריכים מהגיליון', () => {
  const m = emptyModel();
  gs.buildImport_(m, [ROW, Object.assign({}, ROW, { orderId: 'HM-2', receivedAt: '2026-11-01 08:00',
    business: 'משרדי אלפא', phone: '0529876543' })], NOW);
  const customer = m.contacts.find(c => c.business === 'מסעדת הגפן');
  const lead = m.contacts.find(c => c.business === 'משרדי אלפא');
  assert.strictEqual(customer.stage, 'לקוח');
  assert.strictEqual(customer.followUp, '');
  assert.strictEqual(customer.lastOrder, '2026-09-01');
  assert.strictEqual(customer.created, '2026-09-01 09:00');
  assert.strictEqual(customer.source, 'ייבוא');
  assert.strictEqual(lead.stage, 'חדש');
  assert.strictEqual(lead.followUp, '');
});

test('ייבוא: הרצה שנייה לא מוסיפה כלום', () => {
  const m = emptyModel();
  gs.buildImport_(m, [ROW], NOW);
  const summary = gs.buildImport_(m, [ROW], NOW).summary;
  assert.strictEqual(summary.activities, 0);
  assert.strictEqual(summary.skipped.existing, 1);
  assert.strictEqual(m.contacts.length, 1);
});

test('ייבוא: מיפוי לפי שמות העמודות ופירמוט תאריך', () => {
  const head = ['תאריך קבלה', 'מספר הזמנה', 'תאריך אספקה מבוקש', 'שם העסק', 'איש קשר', 'טלפון',
    'כתובת למשלוח', 'הערות', 'פירוט פריטים', 'סה"כ פריטים', 'סה"כ לתשלום', 'סטטוס',
    'שיטת אספקה', 'דמי משלוח', 'אופן תשלום', 'קובץ PDF'];
  const row = [new Date(2026, 8, 1, 9, 5), 'AR-1', '', 'מסעדת הגפן', 'דנה', 501234567,
    '', '', '', 5, '', 'חדשה', '', '', '', 'https://drive/x'];
  const out = gs.orderRowsFromValues_([head, row, ['', '', '']]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].receivedAt, '2026-09-01 09:05');
  assert.strictEqual(out[0].phone, '501234567');
  assert.strictEqual(out[0].totalItems, '5');
  assert.strictEqual(out[0].pdf, 'https://drive/x');
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length
                   : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
