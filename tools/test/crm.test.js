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
    '   orderRowsFromValues_: orderRowsFromValues_, daysBetween_: daysBetween_,' +
    '   orderDaysByContact_: orderDaysByContact_, orderEvents_: orderEvents_,' +
    '   rhythmFor_: rhythmFor_, lateInfo_: lateInfo_, recomputeOrders_: recomputeOrders_ };')();
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

// ---------- הזמנות וקצב ----------

test('קצב: הזמנות במרחק עד 3 ימים מתמזגות; פחות משלוש — בלי קצב', () => {
  assert.deepStrictEqual(gs.orderEvents_(['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-20']),
    ['2026-10-05', '2026-10-20']);
  assert.strictEqual(gs.rhythmFor_(['2026-09-01', '2026-10-01']), 0);
  assert.strictEqual(gs.daysBetween_('2026-09-30', '2026-11-21'), 52);
});

test('קצב: חציון המרווחים בין ההזמנות', () => {
  assert.strictEqual(gs.rhythmFor_(['2026-07-01', '2026-08-01', '2026-08-29', '2026-10-01']), 31);
  assert.strictEqual(gs.rhythmFor_(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-29']), 7);
});

test('איחור: דוגמאות האפיון — חודשי, בלי קצב, שבועי, כל חודשיים', () => {
  const cust = { stage: 'לקוח', followUp: '' };
  assert.deepStrictEqual(gs.lateInfo_(cust, ['2026-08-01', '2026-08-31', '2026-09-30'], '2026-11-21'),
    { rhythm: 30, daysSinceOrder: 52, lateBy: 22, isLate: true });
  assert.deepStrictEqual(gs.lateInfo_(cust, ['2026-09-30'], '2026-11-21'),
    { rhythm: 0, daysSinceOrder: 52, lateBy: 7, isLate: true });
  assert.deepStrictEqual(gs.lateInfo_(cust, ['2026-09-01', '2026-09-08', '2026-09-15'], '2026-11-06'),
    { rhythm: 7, daysSinceOrder: 52, lateBy: 45, isLate: true });
  const bimonthly = gs.lateInfo_(cust, ['2026-05-03', '2026-07-02', '2026-08-31'], '2026-10-22');
  assert.strictEqual(bimonthly.rhythm, 60);
  assert.strictEqual(bimonthly.daysSinceOrder, 52);
  assert.strictEqual(bimonthly.isLate, false);
  assert.strictEqual(gs.lateInfo_(cust, ['2026-09-30'], '2026-11-14').isLate, false); // 45 בדיוק — עוד לא
});

test('איחור: לא בלי הזמנות, לא עם תאריך חזרה עתידי, ולא בשלב אחר', () => {
  assert.deepStrictEqual(gs.lateInfo_({ stage: 'לקוח' }, [], '2026-11-21'),
    { rhythm: 0, daysSinceOrder: null, lateBy: 0, isLate: false });
  assert.strictEqual(gs.lateInfo_({ stage: 'לקוח', followUp: '2026-11-25' }, ['2026-09-30'], '2026-11-21').isLate, false);
  assert.strictEqual(gs.lateInfo_({ stage: 'לקוח', followUp: '2026-11-21' }, ['2026-09-30'], '2026-11-21').isLate, true);
  assert.strictEqual(gs.lateInfo_({ stage: 'חזרתי' }, ['2026-09-30'], '2026-11-21').isLate, false);
  assert.strictEqual(gs.lateInfo_({ stage: 'לא רלוונטי' }, ['2026-09-30'], '2026-11-21').isLate, false);
});

test('ימי הזמנה לכל איש קשר — ממוינים, בלי כפילויות, רק "הזמנה"', () => {
  const map = gs.orderDaysByContact_([
    { contactId: 'C1', type: 'הזמנה', at: '2026-10-07 13:22' },
    { contactId: 'C1', type: 'הזמנה', at: '2026-10-01 09:00' },
    { contactId: 'C1', type: 'הזמנה', at: '2026-10-07 14:25' },
    { contactId: 'C1', type: 'שיחה', at: '2026-10-09 10:00' },
    { contactId: 'C2', type: 'הזמנה', at: '2026-09-08 04:52' }
  ]);
  assert.deepStrictEqual(map.C1, ['2026-10-01', '2026-10-07']);
  assert.deepStrictEqual(map.C2, ['2026-09-08']);
});

test('הזמנה ידנית באותו יום מתחברת להזמנה מהאתר — נספרת פעם אחת', () => {
  const m = emptyModel();
  gs.applyEvent_(m, LEAD, NOW);
  const c = m.contacts[0];
  m.activities.push({ id: 'A-m', contactId: c.id, at: '2026-11-02 08:00', type: 'הזמנה',
    text: 'בטלפון', orderId: '', pdf: '', quoteLink: '', by: 'עמוד', _row: 3 });
  gs.recomputeOrders_(m, c);
  const r = gs.applyEvent_(m, ORDER, NOW);
  assert.strictEqual(r.attached, true);
  assert.strictEqual(m.activities.length, 2);
  const a = m.activities[1];
  assert.strictEqual(a.id, 'A-m');
  assert.strictEqual(a.orderId, 'AR-20261101-123456');
  assert.strictEqual(a.pdf, 'https://drive.google.com/file/d/x/view');
  assert.ok(/345\.00 ₪[\s\S]*בטלפון/.test(a.text), a.text);
  assert.strictEqual(a._dirty, true);
  assert.strictEqual(c.orders, '1');
  assert.strictEqual(c.lastOrder, '2026-11-02');
});

test('הזמנה מהאתר ביום אחר מהרישום הידני — שתי הזמנות', () => {
  const m = emptyModel();
  gs.applyEvent_(m, LEAD, NOW);
  const c = m.contacts[0];
  m.activities.push({ id: 'A-m', contactId: c.id, at: '2026-11-01 12:00', type: 'הזמנה',
    text: '', orderId: '', pdf: '', quoteLink: '', by: 'עמוד' });
  const r = gs.applyEvent_(m, ORDER, NOW);
  assert.strictEqual(r.attached, undefined);
  assert.strictEqual(c.orders, '2');
  assert.strictEqual(c.lastOrder, '2026-11-02');
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

// ---------- API: גיליון מדומה ----------

// גיליון בזיכרון — מספיק מה-API של SpreadsheetApp כדי להריץ את הסקריפט.
// untyped נדלק כשכותבים בלי פורמט טקסט ('@') — אצל גוגל זה היה מוחק את ה-0 בטלפון.
function fakeSheet() {
  const rows = [];
  const sh = {
    rows,
    untyped: false,
    getLastRow() {
      for (let i = rows.length; i > 0; i--) {
        if ((rows[i - 1] || []).some(v => v !== '' && v != null)) return i;
      }
      return 0;
    },
    getLastColumn() { return rows.reduce((m, r) => Math.max(m, (r || []).length), 0); },
    getRange(r, c, nr, nc) {
      let fmt = null;
      const range = {
        setNumberFormat(f) { fmt = f; return range; },
        setValues(vals) {
          if (fmt !== '@') sh.untyped = true;
          vals.forEach((v, i) => {
            rows[r - 1 + i] = rows[r - 1 + i] || [];
            v.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; });
          });
          return range;
        },
        getValues() {
          return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
            const v = (rows[r - 1 + i] || [])[c - 1 + j];
            return v == null ? '' : v;
          }));
        }
      };
      return range;
    },
    deleteRow(r) { rows.splice(r - 1, 1); },
    setFrozenRows() {},
    setRightToLeft() {}
  };
  return sh;
}

function fakeBook() {
  const sheets = {};
  return {
    sheets,
    getSheetByName(n) { return sheets[n] || null; },
    insertSheet(n) { sheets[n] = fakeSheet(); return sheets[n]; }
  };
}

const P = 'test-password-1234';
const S = 'test-secret-abcdefgh';

function loadApp(opts) {
  opts = opts || {};
  const src = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script-crm.gs'), 'utf8');
  const crm = opts.crm || fakeBook();
  const orders = opts.orders || fakeBook();
  const env = {
    SpreadsheetApp: { openById(id) { return id === 'ORDERS-ID' ? orders : crm; } },
    LockService: { getScriptLock() { return { tryLock() { return true; }, releaseLock() {} }; } },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput(s) { return { content: s, setMimeType() { return this; } }; }
    },
    Logger: { log() {} },
    Utilities: {
      formatDate(d) {
        const p = n => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
          ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
      }
    }
  };
  const password = opts.password === undefined ? P : opts.password;
  const secret = opts.secret === undefined ? S : opts.secret;
  const gsApp = new Function('SpreadsheetApp', 'LockService', 'ContentService', 'Logger', 'Utilities',
    src + '\n' +
    "SPREADSHEET_ID = 'CRM-ID'; ORDERS_SPREADSHEET_ID = 'ORDERS-ID';\n" +
    'CRM_PASSWORD = ' + JSON.stringify(password) + '; CRM_SECRET = ' + JSON.stringify(secret) + ';\n' +
    "now_ = function () { return { date: '2026-11-02', stamp: '2026-11-02 10:42' }; };\n" +
    'return { doPost: doPost, doGet: doGet };'
  )(env.SpreadsheetApp, env.LockService, env.ContentService, env.Logger, env.Utilities);
  gsApp.crm = crm;
  gsApp.call = (body) => JSON.parse(gsApp.doPost({ postData: { contents: JSON.stringify(body) } }).content);
  return gsApp;
}

const ORDERS_HEAD = ['תאריך קבלה', 'מספר הזמנה', 'תאריך אספקה מבוקש', 'שם העסק', 'איש קשר', 'טלפון',
  'כתובת למשלוח', 'הערות', 'פירוט פריטים', 'סה"כ פריטים', 'סה"כ לתשלום', 'סטטוס',
  'שיטת אספקה', 'דמי משלוח', 'אופן תשלום', 'קובץ PDF'];
function ordersBookWith(rows) {
  const b = fakeBook();
  const sh = b.insertSheet('הזמנות');
  sh.rows.push(ORDERS_HEAD.slice());
  rows.forEach(r => sh.rows.push(r));
  return b;
}
const ORDER_ROWS = [
  [new Date(2026, 8, 1, 9, 0), 'AR-20260901-111111', '', 'מסעדת הגפן', 'דנה', 501234567,
    'המלאכה 8', '', '...', 5, '120.00', 'חדשה', '', '', '', 'https://drive/a'],
  [new Date(2026, 8, 2, 9, 0), 'RA-20260902-222222', '', 'גלילות — טומי', 'רונית', '0521111111',
    '', '', '...', 3, '', 'חדשה', '', '', '', ''],
  [new Date(2026, 8, 3, 9, 0), 'AR-20260903-333333', '', 'רועי בדיקה', 'בדיקה', '098',
    '', '', '...', 1, '', 'חדשה', '', '', '', '']
];

// ---------- API ----------

test('API: סיסמה שהיא עדיין מציין המקום חוסמת — גם כשהיא נשלחת', () => {
  const app = loadApp({ password: 'PUT_CRM_PASSWORD_HERE' });
  assert.strictEqual(app.call({ action: 'list', password: 'PUT_CRM_PASSWORD_HERE' }).error, 'unauthorized');
});

test('API: סיסמה קצרה מ-12 תווים חוסמת', () => {
  const app = loadApp({ password: 'short-pass' });
  assert.strictEqual(app.call({ action: 'list', password: 'short-pass' }).error, 'unauthorized');
});

test('API: סיסמה שגויה וסוד שגוי נדחים', () => {
  const app = loadApp();
  assert.strictEqual(app.call({ action: 'list', password: 'wrong' }).error, 'unauthorized');
  assert.strictEqual(app.call({ action: 'event', secret: P, event: LEAD }).error, 'unauthorized');
  assert.strictEqual(app.call({ action: 'list', secret: S }).error, 'unauthorized');
});

test('API: גוף לא תקין נדחה', () => {
  const app = loadApp();
  assert.strictEqual(JSON.parse(app.doPost({ postData: { contents: 'not json' } }).content).error, 'bad request');
  assert.strictEqual(JSON.parse(app.doPost({}).content).error, 'bad request');
});

test('API: event יוצר איש קשר; list מחזיר אותו בלי _row; כתיבה בפורמט טקסט', () => {
  const app = loadApp();
  const r = app.call({ action: 'event', secret: S, event: LEAD });
  assert.strictEqual(r.ok, true);
  assert.ok(/^C/.test(r.id), r.id);
  const list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.today, '2026-11-02');
  assert.strictEqual(list.contacts.length, 1);
  assert.strictEqual(list.contacts[0].id, r.id);
  assert.strictEqual(list.contacts[0].phone, '0501234567');
  assert.strictEqual('_row' in list.contacts[0], false);
  assert.strictEqual(list.activities[0].contactId, r.id);
  assert.strictEqual(app.crm.sheets['אנשי קשר'].rows[0][0], 'מזהה');
  assert.strictEqual(app.crm.sheets['אנשי קשר'].untyped, false);
  assert.strictEqual(app.crm.sheets['פעולות'].untyped, false);
});

test('API: אירוע עם מספר הזמנה שכבר רשום — אותו איש קשר, בלי כפילות', () => {
  const app = loadApp();
  const a = app.call({ action: 'event', secret: S, event: ORDER });
  const b = app.call({ action: 'event', secret: S, event: ORDER });
  assert.strictEqual(b.ok, true);
  assert.strictEqual(b.id, a.id);
  assert.strictEqual(b.duplicate, true);
  assert.strictEqual(app.call({ action: 'list', password: P }).activities.length, 1);
});

test('API: add — טלפון קיים מחזיר duplicate עם המזהה; חדש נשמר עם המקור', () => {
  const app = loadApp();
  const first = app.call({ action: 'event', secret: S, event: LEAD });
  const dup = app.call({ action: 'add', password: P, contact: { phone: '050 1234567', name: 'משה' } });
  assert.strictEqual(dup.error, 'duplicate');
  assert.strictEqual(dup.id, first.id);
  const ok = app.call({ action: 'add', password: P, contact: { phone: '054-7781203', name: 'משה',
    business: 'מוסך הגליל', source: 'מודעה בפייסבוק', followUp: '2026-11-02', note: 'מחפש ספק' } });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.contact.source, 'מודעה בפייסבוק');
  assert.strictEqual(ok.contact.stage, 'חדש');
  assert.strictEqual(ok.contact.phone, '0547781203');
  assert.strictEqual(ok.activity.type, 'נוצר ידנית');
  assert.strictEqual(ok.activity.text, 'מחפש ספק');
});

test('API: add — טלפון לא תקין, בלי שם, מקור לא מוכר', () => {
  const app = loadApp();
  assert.strictEqual(app.call({ action: 'add', password: P, contact: { phone: '123', name: 'א' } }).error, 'bad phone');
  assert.strictEqual(app.call({ action: 'add', password: P, contact: { phone: '0547781203' } }).error, 'name required');
  assert.strictEqual(app.call({ action: 'add', password: P,
    contact: { phone: '0547781203', name: 'א', source: 'משהו' } }).contact.source, 'אחר');
});

test('API: log — פעולה, שלב ותאריך בבקשה אחת', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const r = app.call({ action: 'log', password: P, id,
    fields: { stage: 'חזרתי', followUp: '2026-11-03' }, activity: { type: 'שיחה', text: 'לא ענה' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.contact.stage, 'חזרתי');
  assert.strictEqual(r.contact.followUp, '2026-11-03');
  assert.strictEqual(r.contact.lastActivity, '2026-11-02 10:42');
  assert.strictEqual(r.activity.type, 'שיחה');
  assert.strictEqual(r.activity.text, 'לא ענה');
  assert.strictEqual(app.call({ action: 'list', password: P }).activities.length, 2);
});

test('API: שלב, תאריך וסוג פעולה לא חוקיים נדחים בלי לשנות', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  assert.strictEqual(app.call({ action: 'update', password: P, id, fields: { stage: 'משהו' } }).error, 'bad stage');
  assert.strictEqual(app.call({ action: 'update', password: P, id, fields: { followUp: '2.11.26' } }).error, 'bad date');
  assert.strictEqual(app.call({ action: 'log', password: P, id, fields: { stage: 'לקוח' },
    activity: { type: 'משהו', text: 'x' } }).error, 'bad activity');
  const c = app.call({ action: 'list', password: P }).contacts[0];
  assert.strictEqual(c.stage, 'חדש');
  assert.strictEqual(c.followUp, '2026-11-02');
});

test('API: update — טלפון של איש קשר אחר נחסם; טלפון ועסק מתעדכנים', () => {
  const app = loadApp();
  const a = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const b = app.call({ action: 'add', password: P, contact: { phone: '0547781203', name: 'משה' } }).contact.id;
  const r = app.call({ action: 'update', password: P, id: b, fields: { phone: '050-1234567' } });
  assert.strictEqual(r.error, 'duplicate');
  assert.strictEqual(r.id, a);
  const ok = app.call({ action: 'update', password: P, id: b, fields: { phone: '052-1111111', business: 'מוסך הגליל' } });
  assert.strictEqual(ok.contact.phone, '0521111111');
  assert.strictEqual(ok.contact.business, 'מוסך הגליל');
  assert.strictEqual(app.call({ action: 'update', password: P, id: 'C-none', fields: {} }).error, 'not found');
});

test('API: delete מוחק את איש הקשר ואת כל הפעולות שלו — רק שלו', () => {
  const app = loadApp();
  const a = app.call({ action: 'event', secret: S, event: LEAD }).id;
  app.call({ action: 'event', secret: S, event: Object.assign({}, ORDER, { phone: '0521111111', business: 'אחר' }) });
  app.call({ action: 'log', password: P, id: a, fields: {}, activity: { type: 'הערה', text: 'x' } });
  const r = app.call({ action: 'delete', password: P, id: a });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.deleted, 2);
  const list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.contacts.length, 1);
  assert.strictEqual(list.activities.length, 1);
  assert.strictEqual(list.activities[0].contactId, list.contacts[0].id);
});

test('API: import — ברירת המחדל היא הרצה יבשה שלא כותבת', () => {
  const app = loadApp({ orders: ordersBookWith(ORDER_ROWS) });
  const r = app.call({ action: 'import', password: P });
  assert.strictEqual(r.dryRun, true);
  assert.strictEqual(r.summary.created, 1);
  assert.strictEqual(r.summary.skipped.chain, 1);
  assert.strictEqual(r.summary.skipped.test, 1);
  assert.deepStrictEqual(r.summary.testRows, ['AR-20260903-333333 — רועי בדיקה']);
  assert.strictEqual(app.call({ action: 'list', password: P }).contacts.length, 0);
});

test('API: import אמיתי כותב, ושני ייבואים לא משכפלים', () => {
  const app = loadApp({ orders: ordersBookWith(ORDER_ROWS) });
  assert.strictEqual(app.call({ action: 'import', password: P, dryRun: false }).dryRun, false);
  let list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.contacts.length, 1);
  assert.strictEqual(list.contacts[0].phone, '0501234567');
  assert.strictEqual(list.contacts[0].stage, 'לקוח');
  assert.strictEqual(list.contacts[0].lastOrder, '2026-09-01');
  assert.strictEqual(list.activities[0].pdf, 'https://drive/a');
  app.call({ action: 'import', password: P, dryRun: false });
  list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.contacts.length, 1);
  assert.strictEqual(list.activities.length, 1);
  assert.strictEqual(app.crm.sheets['פעולות'].untyped, false);
});

test('API: order — הזמנה ידנית: לקוח, מונה, היום עם השעה ותאריך אחר ב-12:00', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const r = app.call({ action: 'order', password: P, id, order: { note: 'בטלפון' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.contact.stage, 'לקוח');
  assert.strictEqual(r.contact.followUp, '');
  assert.strictEqual(r.contact.orders, '1');
  assert.strictEqual(r.contact.daysSinceOrder, 0);
  assert.strictEqual(r.activity.type, 'הזמנה');
  assert.strictEqual(r.activity.by, 'עמוד');
  assert.strictEqual(r.activity.at, '2026-11-02 10:42');
  assert.strictEqual(r.activity.text, 'בטלפון');
  const old = app.call({ action: 'order', password: P, id, order: { date: '2026-10-20' } });
  assert.strictEqual(old.activity.at, '2026-10-20 12:00');
  assert.strictEqual(old.contact.orders, '2');
  assert.strictEqual(old.contact.lastOrder, '2026-11-02');
  assert.strictEqual(app.call({ action: 'order', password: P, id, order: { date: '2026-11-03' } }).error, 'bad date');
  assert.strictEqual(app.call({ action: 'order', password: P, id, order: { date: '3.11' } }).error, 'bad date');
  assert.strictEqual(app.call({ action: 'order', password: P, id: 'C-none', order: {} }).error, 'not found');
});

test('API: order_cancel — רק הזמנה ידנית בלי מספר; המונה חוזר והשלב נשאר', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const manual = app.call({ action: 'order', password: P, id, order: { date: '2026-10-20' } }).activity;
  app.call({ action: 'event', secret: S, event: ORDER });
  let list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.contacts[0].orders, '2');
  const site = list.activities.find(a => a.orderId === 'AR-20261101-123456');
  assert.strictEqual(app.call({ action: 'order_cancel', password: P, activityId: site.id }).error, 'not cancellable');
  const r = app.call({ action: 'order_cancel', password: P, activityId: manual.id });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.contact.orders, '1');
  assert.strictEqual(r.contact.stage, 'לקוח');
  list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.activities.some(a => a.id === manual.id), false);
  assert.strictEqual(app.call({ action: 'order_cancel', password: P, activityId: 'A-none' }).error, 'not found');
});

test('API: הזמנה מהאתר באותו יום של רישום ידני נכתבת במקום הרישום', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  app.call({ action: 'order', password: P, id, order: { note: 'בטלפון' } });
  app.call({ action: 'event', secret: S, event: ORDER });
  const list = app.call({ action: 'list', password: P });
  const orders = list.activities.filter(a => a.type === 'הזמנה');
  assert.strictEqual(orders.length, 1);
  assert.strictEqual(orders[0].orderId, 'AR-20261101-123456');
  assert.strictEqual(list.contacts[0].orders, '1');
  assert.strictEqual(app.crm.sheets['פעולות'].untyped, false);
  // אותה הזמנה שוב (ניסיון חוזר) — עדיין כפילות שנחסמת, גם אחרי החיבור
  assert.strictEqual(app.call({ action: 'event', secret: S, event: ORDER }).duplicate, true);
  assert.strictEqual(app.call({ action: 'list', password: P }).contacts[0].orders, '1');
});

test('API: log מסוג הזמנה (התוצאה "הזמין") נספר כהזמנה', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const r = app.call({ action: 'log', password: P, id, fields: { stage: 'לקוח', followUp: '' },
    activity: { type: 'הזמנה', text: 'דרך שיחה' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.contact.orders, '1');
  assert.strictEqual(r.contact.lastOrder, '2026-11-02');
  assert.strictEqual(r.activity.type, 'הזמנה');
});

test('API: list מחזיר קצב ואיחור לכל איש קשר', () => {
  const app = loadApp({ orders: ordersBookWith(ORDER_ROWS) });
  app.call({ action: 'import', password: P, dryRun: false });
  const c = app.call({ action: 'list', password: P }).contacts[0];
  assert.strictEqual(c.rhythm, 0);
  assert.strictEqual(c.daysSinceOrder, 62);
  assert.strictEqual(c.isLate, true);
  assert.strictEqual(c.lateBy, 17);
});

test('API: doGet — בדיקת חיים בלי נתונים', () => {
  assert.strictEqual(loadApp().doGet().content, 'CRM — פעיל');
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length
                   : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
