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
    '   rhythmFor_: rhythmFor_, lateInfo_: lateInfo_, recomputeOrders_: recomputeOrders_,' +
    '   inquiryMessage_: inquiryMessage_, dueReminders_: dueReminders_,' +
    '   reminderMessage_: reminderMessage_, digestDue_: digestDue_, digestFor_: digestFor_,' +
    '   chatFromUpdates_: chatFromUpdates_, itemsJson_: itemsJson_ };')();
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

// ---------- התראות ----------

test('טלגרם על פנייה: ליד ובקשת הצעה, טלפון בינלאומי וקישור לכרטיס', () => {
  const c = { id: 'C1', business: 'מסעדת הגפן', name: 'דנה כהן', phone: '0501234567' };
  const m = gs.inquiryMessage_(LEAD, c);
  assert.strictEqual(m.text,
    'פנייה חדשה מהאתר\nמסעדת הגפן · דנה כהן\n+972501234567\nפנייה חדשה מעמוד צור קשר — צריך הצעה לחד פעמי');
  assert.strictEqual(m.button, 'פתח בכרטיס');
  assert.strictEqual(m.url, 'https://aroam.co.il/crm-f428d7/#c=C1');
  const q = gs.inquiryMessage_({ type: 'quote_request', totalItems: 12 }, c);
  assert.ok(q.text.indexOf('בקשת הצעת מחיר') === 0, q.text);
  assert.ok(/12 פריטים$/.test(q.text), q.text);
});

test('תזכורות: בשעה — נשלחת; לפני — לא; נשלחה, בוצעה או בלי שעה — לא; אחרי שעתיים — פוקעת', () => {
  const now = { date: '2026-11-02', stamp: '2026-11-02 14:03' };
  const t = (o) => Object.assign({ id: 'T', contactId: '', text: 'x', due: '2026-11-02', time: '14:00',
    done: '', reminded: '' }, o);
  const r = gs.dueReminders_([t({ id: 'a' }), t({ id: 'b', time: '14:30' }),
    t({ id: 'c', reminded: '2026-11-02 14:00' }), t({ id: 'd', done: '2026-11-02 13:00' }),
    t({ id: 'e', time: '' }), t({ id: 'f', time: '11:30' })], now);
  assert.deepStrictEqual(r.send.map(x => x.id), ['a']);
  assert.deepStrictEqual(r.expire.map(x => x.id), ['f']);
  const overnight = gs.dueReminders_([t({ id: 'n', due: '2026-11-01', time: '23:30' })],
    { date: '2026-11-02', stamp: '2026-11-02 00:20' });
  assert.deepStrictEqual(overnight.send.map(x => x.id), ['n']);
});

test('תזכורת: שם הלקוח והקישור; "(באיחור)" אחרי חצי שעה', () => {
  const c = { id: 'C1', business: 'גן תות', name: '' };
  const t = { text: 'להביא דוגמאות', due: '2026-11-02', time: '14:00' };
  const m1 = gs.reminderMessage_(t, c, { date: '2026-11-02', stamp: '2026-11-02 14:04' });
  assert.strictEqual(m1.text, 'תזכורת: להביא דוגמאות\nגן תות');
  assert.strictEqual(m1.url, 'https://aroam.co.il/crm-f428d7/#c=C1');
  const m2 = gs.reminderMessage_(t, null, { date: '2026-11-02', stamp: '2026-11-02 14:45' });
  assert.strictEqual(m2.text, 'תזכורת: להביא דוגמאות (באיחור)');
  assert.strictEqual(m2.button, 'פתח את ה-CRM');
  assert.strictEqual(m2.url, 'https://aroam.co.il/crm-f428d7/');
});

test('סיכום הבוקר: ראשון עד שישי, 07:30–12:00, פעם ביום', () => {
  const at = (date, time) => ({ date, stamp: date + ' ' + time });
  assert.strictEqual(gs.digestDue_(at('2026-11-02', '07:31'), null), true);          // שני
  assert.strictEqual(gs.digestDue_(at('2026-11-02', '07:29'), null), false);
  assert.strictEqual(gs.digestDue_(at('2026-11-02', '12:00'), null), false);
  assert.strictEqual(gs.digestDue_(at('2026-11-02', '08:00'), '2026-11-02'), false);
  assert.strictEqual(gs.digestDue_(at('2026-11-07', '08:00'), null), false);         // שבת
  assert.strictEqual(gs.digestDue_(at('2026-11-06', '08:00'), '2026-11-05'), true);  // שישי
});

test('סיכום הבוקר: ריק — null; משימות, למי לחזור ולא הזמינו — עשרה ועוד', () => {
  const now = { date: '2026-11-21', stamp: '2026-11-21 07:30' };
  assert.strictEqual(gs.digestFor_({ contacts: [], activities: [], tasks: [] }, now), null);
  const contacts = [
    { id: 'L', name: '', business: 'ליד <חדש>', phone: '', stage: 'חדש', followUp: '2026-11-21', created: '2026-11-21 06:00' },
    { id: 'B', name: '', business: 'חזרתי באיחור', phone: '', stage: 'חזרתי', followUp: '2026-11-19', created: '2026-10-01 06:00' }
  ];
  const activities = [];
  for (let i = 0; i < 12; i++) {
    contacts.push({ id: 'K' + i, name: '', business: 'לקוח ' + i, phone: '', stage: 'לקוח', followUp: '',
      created: '2026-01-01 06:00' });
    activities.push({ contactId: 'K' + i, type: 'הזמנה', at: '2026-09-' + (10 + i) + ' 10:00' });
  }
  const tasks = [
    { id: 'T1', contactId: 'B', text: 'להתקשר', due: '2026-11-21', time: '14:00', done: '' },
    { id: 'T2', contactId: '', text: 'להזמין מהספק', due: '2026-11-20', time: '', done: '' },
    { id: 'T3', contactId: '', text: 'עתידית', due: '2026-11-25', time: '', done: '' }
  ];
  const d = gs.digestFor_({ contacts, activities, tasks }, now);
  assert.strictEqual(d.subject, 'CRM — 2 משימות · 2 לחזור · 12 לא הזמינו');
  assert.ok(d.text.indexOf('• להזמין מהספק — באיחור יום') >= 0, d.text);
  assert.ok(d.text.indexOf('• להתקשר — חזרתי באיחור · היום 14:00') >= 0, d.text);
  assert.ok(d.text.indexOf('• לקוח 0 — אחרונה לפני 72 ימים') >= 0, d.text);
  assert.ok(d.text.indexOf('ועוד 2') >= 0, d.text);
  assert.strictEqual(d.text.indexOf('עתידית'), -1);
  assert.ok(d.html.indexOf('ליד &lt;חדש&gt;') >= 0, d.html);
  assert.ok(d.html.indexOf('href="https://aroam.co.il/crm-f428d7/#c=B"') >= 0, d.html);
  assert.strictEqual(d.telegram.indexOf('בוקר טוב — 2 משימות · 2 לחזור · 12 לא הזמינו'), 0);
  assert.ok(d.telegram.indexOf('ועוד 7') >= 0, d.telegram);
});

test('הצ\'אט מההודעה האחרונה לבוט — רק פרטי', () => {
  assert.strictEqual(gs.chatFromUpdates_({ result: [{ message: { chat: { id: 7, type: 'group' } } },
    { message: { chat: { id: 99, type: 'private' } } }] }), '99');
  assert.strictEqual(gs.chatFromUpdates_({ result: [] }), '');
  assert.strictEqual(gs.chatFromUpdates_(null), '');
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
  const props = Object.assign({}, opts.props || {});
  const sent = { telegram: [], mails: [], triggers: [], deleted: [] };
  const net = { telegramDown: !!opts.telegramDown, webhook: opts.webhook || '' };
  const clock = { now: opts.now || { date: '2026-11-02', stamp: '2026-11-02 10:42' } };
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
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(k) { return props[k] == null ? null : props[k]; },
          setProperty(k, v) { props[k] = String(v); }
        };
      }
    },
    UrlFetchApp: {
      fetch(url, o) {
        const method = url.split('/').pop();
        let body = { ok: true };
        if (method === 'sendMessage') {
          sent.telegram.push(JSON.parse(o.payload));
          body = { ok: !net.telegramDown };
        } else if (method === 'getWebhookInfo') {
          body = { ok: true, result: { url: net.webhook } };
        } else if (method === 'deleteWebhook') {
          sent.deleted.push('webhook');
          net.webhook = '';
        } else if (method === 'getUpdates') {
          body = { ok: true, result: opts.updates || [] };
        }
        return { getContentText() { return JSON.stringify(body); } };
      }
    },
    MailApp: { sendEmail(m) { sent.mails.push(m); }, getRemainingDailyQuota() { return 100; } },
    ScriptApp: {
      getProjectTriggers() { return sent.triggers.map(n => ({ getHandlerFunction() { return n; } })); },
      deleteTrigger(t) { sent.triggers.splice(sent.triggers.indexOf(t.getHandlerFunction()), 1); },
      newTrigger(name) {
        const chain = {
          timeBased() { return chain; },
          everyMinutes() { return chain; },
          create() { sent.triggers.push(name); }
        };
        return chain;
      }
    }
  };
  const password = opts.password === undefined ? P : opts.password;
  const secret = opts.secret === undefined ? S : opts.secret;
  const names = Object.keys(env);
  const gsApp = new Function(...names, '__clock',
    src + '\n' +
    "SPREADSHEET_ID = 'CRM-ID'; ORDERS_SPREADSHEET_ID = 'ORDERS-ID';\n" +
    'CRM_PASSWORD = ' + JSON.stringify(password) + '; CRM_SECRET = ' + JSON.stringify(secret) + ';\n' +
    'now_ = function () { return __clock.now; };\n' +
    'return { doPost: doPost, doGet: doGet, tick: tick, setupNotifications: setupNotifications };'
  )(...names.map(n => env[n]), clock);
  gsApp.crm = crm;
  gsApp.props = props;
  gsApp.sent = sent;
  gsApp.setNow = (now) => { clock.now = now; };
  gsApp.setTelegramDown = (v) => { net.telegramDown = v; };
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

test('API: משימות — כללית ועל לקוח, ולידציה, list מחזיר רק פתוחות, בפורמט טקסט', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const g = app.call({ action: 'task_add', password: P, task: { text: 'להזמין מהספק', due: '2026-11-03' } });
  assert.strictEqual(g.ok, true);
  assert.ok(/^T/.test(g.task.id), g.task.id);
  assert.strictEqual(g.task.contactId, '');
  assert.strictEqual(g.task.created, '2026-11-02 10:42');
  const l = app.call({ action: 'task_add', password: P,
    task: { text: 'להביא דוגמאות', due: '2026-11-02', time: '14:00', contactId: id } });
  assert.strictEqual(l.task.contactId, id);
  assert.strictEqual(l.task.reminded, '');
  assert.strictEqual(app.call({ action: 'task_add', password: P, task: { text: '', due: '2026-11-02' } }).error, 'text required');
  assert.strictEqual(app.call({ action: 'task_add', password: P, task: { text: 'x', due: '2.11' } }).error, 'bad date');
  assert.strictEqual(app.call({ action: 'task_add', password: P,
    task: { text: 'x', due: '2026-11-02', time: '25:00' } }).error, 'bad time');
  assert.strictEqual(app.call({ action: 'task_add', password: P,
    task: { text: 'x', due: '2026-11-02', contactId: 'C-none' } }).error, 'not found');
  const list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.tasks.length, 2);
  assert.strictEqual('_row' in list.tasks[0], false);
  assert.strictEqual(app.crm.sheets['משימות'].rows[0][2], 'משימה');
  assert.strictEqual(app.crm.sheets['משימות'].untyped, false);
});

test('API: משימה עם שעה שכבר עברה — מסומנת כנשלחה; שינוי שעה מאפס', () => {
  const app = loadApp();
  const t = app.call({ action: 'task_add', password: P, task: { text: 'x', due: '2026-11-02', time: '09:00' } }).task;
  assert.strictEqual(t.reminded, '2026-11-02 10:42');
  const u = app.call({ action: 'task_update', password: P, id: t.id, fields: { time: '15:00' } });
  assert.strictEqual(u.task.reminded, '');
  const same = app.call({ action: 'task_update', password: P, id: t.id, fields: { text: 'y' } });
  assert.strictEqual(same.task.reminded, '');
  assert.strictEqual(same.task.text, 'y');
  assert.strictEqual(app.call({ action: 'task_update', password: P, id: 'T-none', fields: {} }).error, 'not found');
});

test('API: סימון משימה על לקוח נרשם בהיסטוריה, ו"בטל" מוחק את הרישום', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const t = app.call({ action: 'task_add', password: P,
    task: { text: 'להביא דוגמאות', due: '2026-11-02', contactId: id } }).task;
  const done = app.call({ action: 'task_update', password: P, id: t.id, fields: { done: true } });
  assert.strictEqual(done.task.done, '2026-11-02 10:42');
  assert.strictEqual(done.activity.type, 'משימה');
  assert.strictEqual(done.activity.text, 'בוצעה: להביא דוגמאות');
  assert.strictEqual(done.contact.id, id);
  let list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.tasks.length, 0);
  assert.strictEqual(list.activities.length, 2);
  const undo = app.call({ action: 'task_update', password: P, id: t.id, fields: { done: false } });
  assert.strictEqual(undo.task.done, '');
  assert.strictEqual(undo.removedActivityId, done.activity.id);
  list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.tasks.length, 1);
  assert.strictEqual(list.activities.length, 1);
});

test('API: משימה כללית נסגרת בלי רישום; מחיקה; מחיקת איש קשר מוחקת את המשימות שלו', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: LEAD }).id;
  const g = app.call({ action: 'task_add', password: P, task: { text: 'כללית', due: '2026-11-02' } }).task;
  assert.strictEqual(app.call({ action: 'task_update', password: P, id: g.id, fields: { done: true } }).activity, undefined);
  const g2 = app.call({ action: 'task_add', password: P, task: { text: 'למחוק', due: '2026-11-05' } }).task;
  assert.strictEqual(app.call({ action: 'task_delete', password: P, id: g2.id }).ok, true);
  assert.strictEqual(app.call({ action: 'task_delete', password: P, id: g2.id }).error, 'not found');
  app.call({ action: 'task_add', password: P, task: { text: 'של הלקוח', due: '2026-11-02', contactId: id } });
  app.call({ action: 'delete', password: P, id });
  assert.strictEqual(app.call({ action: 'list', password: P }).tasks.length, 0);
});

test('API: ליד ובקשת הצעה שולחים טלגרם; הזמנה לא; כשל בטלגרם לא מפיל', () => {
  const app = loadApp({ props: { TELEGRAM_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' } });
  const r = app.call({ action: 'event', secret: S, event: LEAD });
  assert.strictEqual('notify' in r, false);
  assert.strictEqual(app.sent.telegram.length, 1);
  assert.strictEqual(app.sent.telegram[0].chat_id, '42');
  assert.strictEqual(app.sent.telegram[0].text.indexOf('פנייה חדשה מהאתר'), 0);
  assert.strictEqual(app.sent.telegram[0].reply_markup.inline_keyboard[0][0].text, 'פתח בכרטיס');
  app.call({ action: 'event', secret: S, event: { type: 'quote_request', orderId: 'HM-20261102-000001',
    business: 'מוסך הגליל', contact: 'משה', phone: '0547781203', totalItems: 4 } });
  assert.strictEqual(app.sent.telegram.length, 2);
  assert.strictEqual(app.sent.telegram[1].text.indexOf('בקשת הצעת מחיר'), 0);
  app.call({ action: 'event', secret: S, event: ORDER });
  assert.strictEqual(app.sent.telegram.length, 2);
  const down = loadApp({ props: { TELEGRAM_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' }, telegramDown: true });
  assert.strictEqual(down.call({ action: 'event', secret: S, event: LEAD }).ok, true);
  assert.strictEqual(down.call({ action: 'list', password: P }).contacts.length, 1);
  const none = loadApp();
  assert.strictEqual(none.call({ action: 'event', secret: S, event: LEAD }).ok, true);
  assert.strictEqual(none.sent.telegram.length, 0);
});

test('API: ייבוא לא שולח טלגרם — גם לא על בקשת הצעת מחיר', () => {
  const rows = ORDER_ROWS.concat([[new Date(2026, 8, 4, 9, 0), 'HM-20260904-444444', '', 'מוסך הגליל', 'משה',
    '0547781203', '', '', '...', 2, '', 'חדשה', '', '', '', '']]);
  const app = loadApp({ orders: ordersBookWith(rows), props: { TELEGRAM_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' } });
  assert.strictEqual(app.call({ action: 'import', password: P, dryRun: false }).summary.activities, 2);
  assert.strictEqual(app.sent.telegram.length, 0);
});

test('tick: תזכורת נשלחת פעם אחת, בשעה שלה', () => {
  const app = loadApp({ props: { TELEGRAM_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42', LAST_DIGEST: '2026-11-02' } });
  app.call({ action: 'task_add', password: P, task: { text: 'להתקשר', due: '2026-11-02', time: '14:00' } });
  app.setNow({ date: '2026-11-02', stamp: '2026-11-02 13:58' });
  app.tick();
  assert.strictEqual(app.sent.telegram.length, 0);
  app.setNow({ date: '2026-11-02', stamp: '2026-11-02 14:02' });
  app.tick();
  app.tick();
  assert.strictEqual(app.sent.telegram.length, 1);
  assert.strictEqual(app.sent.telegram[0].text, 'תזכורת: להתקשר');
});

test('tick: שליחה שנכשלה חוזרת בריצה הבאה', () => {
  const app = loadApp({ props: { TELEGRAM_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42', LAST_DIGEST: '2026-11-02' },
    telegramDown: true });
  app.call({ action: 'task_add', password: P, task: { text: 'x', due: '2026-11-02', time: '14:00' } });
  app.setNow({ date: '2026-11-02', stamp: '2026-11-02 14:02' });
  app.tick();
  app.setTelegramDown(false);
  app.tick();
  assert.strictEqual(app.sent.telegram.length, 2);
  app.tick();
  assert.strictEqual(app.sent.telegram.length, 2);
});

test('tick: סיכום הבוקר נשלח פעם אחת ביום, במייל ובטלגרם', () => {
  const app = loadApp({ props: { TELEGRAM_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' } });
  app.call({ action: 'event', secret: S, event: LEAD });
  app.sent.telegram.length = 0;
  app.setNow({ date: '2026-11-03', stamp: '2026-11-03 07:32' });
  app.tick();
  app.tick();
  assert.strictEqual(app.sent.mails.length, 1);
  assert.strictEqual(app.sent.mails[0].to, 'meiraroam@gmail.com');
  assert.ok(app.sent.mails[0].subject.indexOf('1 לחזור') > 0, app.sent.mails[0].subject);
  assert.ok(app.sent.mails[0].htmlBody.indexOf('מסעדת הגפן') > 0);
  assert.strictEqual(app.sent.telegram.length, 1);
  assert.strictEqual(app.props.LAST_DIGEST, '2026-11-03');
});

test('setupNotifications: מנתק webhook ישן, שומר את הצ\'אט, הודעת בדיקה וטריגר אחד', () => {
  const app = loadApp({ props: { TELEGRAM_TOKEN: 'tok' }, webhook: 'https://script.google.com/old',
    updates: [{ message: { chat: { id: 7, type: 'group' } } }, { message: { chat: { id: 99, type: 'private' } } }] });
  app.setupNotifications();
  app.setupNotifications();
  assert.deepStrictEqual(app.sent.deleted, ['webhook']);
  assert.strictEqual(app.props.TELEGRAM_CHAT_ID, '99');
  assert.strictEqual(app.sent.telegram[0].text, 'ה-CRM מחובר. מכאן יגיעו ההתראות.');
  assert.deepStrictEqual(app.sent.triggers, ['tick']);
});

test('setupNotifications: בלי טוקן, או בלי הודעה לבוט — עוצר עם הסבר', () => {
  assert.throws(() => loadApp().setupNotifications(), /TELEGRAM_TOKEN/);
  assert.throws(() => loadApp({ props: { TELEGRAM_TOKEN: 'tok' } }).setupNotifications(), /שלחו לבוט הודעה/);
});

test('API: doGet — בדיקת חיים בלי נתונים', () => {
  assert.strictEqual(loadApp().doGet().content, 'CRM — פעיל');
});

// ---------- ריווחית (סבב 88) ----------

const ORDER_ITEMS = Object.assign({}, ORDER, {
  orderId: 'AR-20261104-222222',
  items: [
    { id: 'ניק001', name: 'אקונומיקה 4 ליטר', category: 'ניקיון', qty: 6, unit: 'יחידה', price: 5, image: 'x.webp' },
    { id: 'חדפ002', name: 'גביע 150 מ״ל - 100 יח׳', qty: 2, price: '' }
  ]
});

test('ריווחית: מספר לקוח נשמר בכרטיס, ריק מוחק, לא-מספר נדחה', () => {
  const app = loadApp();
  const id = app.call({ action: 'event', secret: S, event: ORDER }).id;
  let r = app.call({ action: 'update', password: P, id, fields: { rivhitNo: ' 1234 ' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.contact.rivhitNo, '1234');
  assert.strictEqual(app.call({ action: 'update', password: P, id, fields: { rivhitNo: '12a' } }).error, 'bad rivhit');
  assert.strictEqual(app.call({ action: 'update', password: P, id, fields: { rivhitNo: '123456' } }).error, 'bad rivhit');
  assert.strictEqual(app.call({ action: 'update', password: P, id, fields: { rivhitNo: '0' } }).error, 'bad rivhit');
  r = app.call({ action: 'update', password: P, id, fields: { rivhitNo: '' } });
  assert.strictEqual(r.contact.rivhitNo, '');
});

test('ריווחית: אירוע הזמנה מחזיר את מספר הלקוח מהכרטיס', () => {
  const app = loadApp();
  const first = app.call({ action: 'event', secret: S, event: ORDER });
  assert.strictEqual(first.rivhitNo, '');
  app.call({ action: 'update', password: P, id: first.id, fields: { rivhitNo: '777' } });
  const second = app.call({ action: 'event', secret: S, event: ORDER_ITEMS });
  assert.strictEqual(second.id, first.id);
  assert.strictEqual(second.rivhitNo, '777');
});

test('ריווחית: פריטי ההזמנה נשמרים מקוצרים בפעולה ומוחזרים ברשימה', () => {
  const app = loadApp();
  app.call({ action: 'event', secret: S, event: ORDER_ITEMS });
  const list = app.call({ action: 'list', password: P });
  const a = list.activities.find(x => x.orderId === 'AR-20261104-222222');
  assert.deepStrictEqual(JSON.parse(a.items), [
    { id: 'ניק001', name: 'אקונומיקה 4 ליטר', qty: 6, price: 5 },
    { id: 'חדפ002', name: 'גביע 150 מ״ל - 100 יח׳', qty: 2, price: 0 }
  ]);
  const c = list.contacts.find(x => x.id === a.contactId);
  assert.strictEqual(c.rivhitNo, '');
});

test('ריווחית: הזמנה בלי פריטים (ייבוא, ליד) — עמודת הפריטים ריקה', () => {
  const app = loadApp();
  app.call({ action: 'event', secret: S, event: ORDER });
  const a = app.call({ action: 'list', password: P }).activities.find(x => x.orderId === ORDER.orderId);
  assert.strictEqual(a.items, '');
});

test('ריווחית: הזמנה שמתחברת לרישום ידני מאותו יום מקבלת גם את הפריטים', () => {
  const app = loadApp({ now: { date: '2026-11-04', stamp: '2026-11-04 09:00' } });
  const id = app.call({ action: 'event', secret: S, event: ORDER }).id;
  app.call({ action: 'order', password: P, id, order: { date: '2026-11-04' } });
  app.setNow({ date: '2026-11-04', stamp: '2026-11-04 15:00' });
  const r = app.call({ action: 'event', secret: S, event: Object.assign({}, ORDER_ITEMS, { at: '2026-11-04 15:00' }) });
  assert.strictEqual(r.ok, true);
  const a = app.call({ action: 'list', password: P }).activities.find(x => x.orderId === 'AR-20261104-222222');
  assert.strictEqual(a.by, 'עמוד');
  assert.strictEqual(JSON.parse(a.items).length, 2);
});

test('ריווחית: itemsJson_ — עד 200 פריטים, בלי שדות מיותרים, כמות לא תקינה נופלת', () => {
  const many = Array.from({ length: 250 }, (_, i) => ({ id: 'X' + i, name: 'פריט ' + i, qty: 1, price: 2, image: 'a' }));
  const out = JSON.parse(gs.itemsJson_(many));
  assert.strictEqual(out.length, 200);
  assert.deepStrictEqual(Object.keys(out[0]), ['id', 'name', 'qty', 'price']);
  assert.strictEqual(gs.itemsJson_([{ id: 'A', name: 'א', qty: 'abc' }]), '');
  assert.strictEqual(gs.itemsJson_(undefined), '');
});

test('ריווחית: גיליון קיים בלי העמודות החדשות — הכותרות מושלמות ושום עמודה לא זזה', () => {
  const crm = fakeBook();
  const cs = crm.insertSheet('אנשי קשר');
  cs.rows.push(['מזהה', 'שם', 'עסק', 'טלפון', 'אימייל', 'כתובת', 'שלב', 'לחזור בתאריך', 'מקור',
    'נוצר', 'פעולה אחרונה', 'הזמנות', 'הזמנה אחרונה']);
  cs.rows.push(['C1', 'דנה', 'מסעדת הגפן', '0501234567', '', '', 'לקוח', '', 'אתר',
    '2026-10-01 09:00', '2026-10-01 09:00', '1', '2026-10-01']);
  const as = crm.insertSheet('פעולות');
  as.rows.push(['מזהה פעולה', 'מזהה איש קשר', 'תאריך', 'סוג', 'פירוט', 'מספר הזמנה', 'PDF',
    'קישור הצעה', 'נוצר ע"י']);
  const app = loadApp({ crm });
  const list = app.call({ action: 'list', password: P });
  assert.strictEqual(list.contacts[0].rivhitNo, '');
  assert.strictEqual(cs.rows[0][13], 'מספר לקוח בריווחית');
  assert.strictEqual(as.rows[0][9], 'פריטים');
  assert.strictEqual(cs.rows[0][12], 'הזמנה אחרונה');
  app.call({ action: 'update', password: P, id: 'C1', fields: { rivhitNo: '55' } });
  assert.strictEqual(cs.rows[1][13], '55');
  assert.strictEqual(cs.rows[1][2], 'מסעדת הגפן');
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length
                   : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
