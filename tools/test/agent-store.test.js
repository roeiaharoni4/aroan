/**
 * בדיקות ללוגיקה הטהורה של דף הסוכן מול ה-CRM (js/agent-store.js).
 * להרצה: node tools/test/agent-store.test.js
 */
const assert = require('assert');
const A = require('../../js/agent-store.js');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

const CONTACT = (o) => Object.assign({ id: 'C1', name: 'דנה', business: 'מסעדת הגפן', phone: '0501234567',
  address: '', stage: 'לקוח', orders: '2', lastOrder: '2026-11-01', rivhitNo: '1234', phones: '' }, o);
const DATA = (o) => Object.assign({ contacts: [CONTACT()], prices: [], last: {}, quotes: [] }, o);

test('מיזוג: לקוח מקומי מקושר לכרטיס לפי שם, ופרטים ריקים מושלמים', () => {
  const r = A.mergeAgentData([{ name: 'מסעדת הגפן', phone: '', prices: {}, orderCount: 0 }], DATA(), null, {});
  assert.strictEqual(r.list.length, 1);
  const c = r.list[0];
  assert.strictEqual(c.crmId, 'C1');
  assert.strictEqual(c.phone, '0501234567');
  assert.strictEqual(c.contact, 'דנה');
  assert.strictEqual(c.stage, 'לקוח');
  assert.strictEqual(c.rivhitNo, '1234');
  assert.strictEqual(c.orderCount, 2);
  assert.strictEqual(c.lastOrderAt, '2026-11-01');
});

test('מיזוג: כרטיס בלי לקוח במכשיר נוסף; לא משנה את הקלט', () => {
  const input = [];
  const r = A.mergeAgentData(input, DATA(), null, {});
  assert.strictEqual(input.length, 0);
  assert.strictEqual(r.list[0].name, 'מסעדת הגפן');
});

test('מיזוג: מחירי ה-CRM מחליפים; keepLocal שומר מוצרים שאין ב-CRM', () => {
  const local = [{ name: 'מסעדת הגפן', crmId: 'C1', prices: { 'חדפ014': 4, 'ניק001': 6 } }];
  const data = DATA({ prices: [['C1', 'חדפ014', '4.5', '2026-11-10 09:00']] });
  assert.deepStrictEqual(A.mergeAgentData(local, data, null, {}).list[0].prices, { 'חדפ014': 4.5 });
  assert.deepStrictEqual(A.mergeAgentData(local, data, null, { keepLocal: true }).list[0].prices,
    { 'חדפ014': 4.5, 'ניק001': 6 });
});

test('מיזוג: מחיר במכשיר עם חותמת חדשה יותר גובר; מחיר מקומי מ-24 השעות האחרונות נשאר', () => {
  const local = [{ name: 'מסעדת הגפן', crmId: 'C1', prices: { 'חדפ014': 5, 'ניק001': 6, 'ניק002': 7 },
    pricesAt: { 'חדפ014': '2026-11-15 12:00', 'ניק001': '2026-11-15 11:00', 'ניק002': '2026-11-01 08:00' } }];
  const data = DATA({ prices: [['C1', 'חדפ014', '4.5', '2026-11-15 10:00']] });
  const r = A.mergeAgentData(local, data, null, { since: '2026-11-14 12:30' }).list[0];
  assert.deepStrictEqual(r.prices, { 'חדפ014': 5, 'ניק001': 6 });
  assert.strictEqual(r.pricesAt['חדפ014'], '2026-11-15 12:00');
});

test('מיזוג: הזמנה והצעה אחרונות מה-CRM, אלא אם במכשיר חדשה יותר', () => {
  const items = [{ id: 'חדפ014', name: 'מזלג', qty: 10, price: 4.5 }];
  const data = DATA({ last: { C1: { order: { at: '2026-11-10 09:00', orderId: 'SL-1', items },
    quote: { at: '2026-11-12 09:00', orderId: 'Q-20261112-1234', items } } } });
  const older = A.mergeAgentData([{ name: 'מסעדת הגפן', lastOrder: { date: '2026-11-01', items: [] } }], data, null, {}).list[0];
  assert.strictEqual(older.lastOrder.orderId, 'SL-1');
  assert.deepStrictEqual(older.lastOrder.items, [{ id: 'חדפ014', name: 'מזלג', quantity: 10, price: 4.5 }]);
  assert.strictEqual(older.lastQuote.quoteId, 'Q-20261112-1234');
  assert.strictEqual(older.lastQuoteAt, '2026-11-12');
  const newer = A.mergeAgentData([{ name: 'מסעדת הגפן', lastOrder: { date: '2026-11-14', orderId: 'SL-2', items: [] } }], data, null, {}).list[0];
  assert.strictEqual(newer.lastOrder.orderId, 'SL-2');
});

test('מיזוג: שם שהשתנה ב-CRM מתעדכן גם בלקוח הפעיל; מזהה שנעלם נמחק; המספר של רועי יורד', () => {
  const local = [{ name: 'הגפן', crmId: 'C1', phone: '0526000158' }, { name: 'ישן', crmId: 'C9' }];
  const r = A.mergeAgentData(local, DATA(), 'הגפן', {});
  assert.strictEqual(r.list[0].name, 'מסעדת הגפן');
  assert.strictEqual(r.activeName, 'מסעדת הגפן');
  assert.strictEqual(r.list[0].phone, '0501234567');
  assert.strictEqual(r.list[1].crmId, undefined);
  const own = A.mergeAgentData([{ name: 'מסעדת הגפן', phone: '526000158' }],
    DATA({ contacts: [CONTACT({ phone: '' })] }), null, {});
  assert.strictEqual(own.list[0].phone, '');
});

test('מיזוג: שני כרטיסים באותו שם — השני מקבל תוספת', () => {
  const data = DATA({ contacts: [CONTACT(), CONTACT({ id: 'C2', name: 'יוסי', phone: '0529999999' })] });
  assert.deepStrictEqual(A.mergeAgentData([], data, null, {}).list.map(r => r.name), ['מסעדת הגפן', 'מסעדת הגפן (יוסי)']);
});

test('מעבר: לקוחות מקומיים — בלי מי שמחכה בתור; מחירים חסרים בכרטיס ⇒ prices_fill', () => {
  const list = [{ name: 'זארה', localId: 'L1' }, { name: 'קר פרי' }, { name: 'מסעדת הגפן', crmId: 'C1',
    prices: { 'חדפ014': 4, 'ניק001': 6 } }];
  const ops = [{ op: 'agent_customer', localId: 'L1', body: { name: 'זארה' } }];
  assert.deepStrictEqual(A.localOnly(list, ops).map(r => r.name), ['קר פרי']);
  const fills = A.fillOps(list, DATA({ prices: [['C1', 'חדפ014', '4.5', '2026-11-10 09:00']] }));
  assert.deepStrictEqual(fills, [{ op: 'prices_fill', body: { id: 'C1', prices: [{ productId: 'ניק001', price: 6 }] } }]);
});

test('תור: bindOps נותן מזהה לפעולות שחיכו ללקוח; linkLocal מקשר או ממזג', () => {
  const ops = [{ op: 'quote', localId: 'L1', body: { id: '', quoteId: 'Q-20261115-1111' } },
    { op: 'quote', body: { id: 'C5' } }];
  const bound = A.bindOps(ops, 'L1', 'C7');
  assert.strictEqual(bound[0].body.id, 'C7');
  assert.strictEqual(bound[1].body.id, 'C5');
  assert.strictEqual(ops[0].body.id, '', 'הקלט לא משתנה');

  const linked = A.linkLocal([{ name: 'זארה', localId: 'L1' }], 'L1', 'C7');
  assert.strictEqual(linked.list[0].crmId, 'C7');
  assert.strictEqual(linked.list[0].localId, undefined);
  assert.strictEqual(linked.name, 'זארה');

  const merged = A.linkLocal([{ name: 'גוטקס', crmId: 'C7', prices: { a: 1 } },
    { name: 'זארה', localId: 'L1', prices: { a: 2, b: 3 }, orderCount: 4 }], 'L1', 'C7');
  assert.strictEqual(merged.list.length, 1);
  assert.strictEqual(merged.name, 'גוטקס');
  assert.deepStrictEqual(merged.list[0].prices, { a: 1, b: 3 });
  assert.strictEqual(merged.list[0].orderCount, 4);
  assert.strictEqual(A.linkLocal([], 'L9', 'C1').name, null);
});

test('היסטוריה: שם הלקוח לפי הכרטיס, סכום מהטקסט או מהפריטים', () => {
  const quotes = [
    { contactId: 'C1', at: '2026-11-15 10:00', orderId: 'Q-20261115-4821', text: '2 פריטים · 1,147.50 ₪ · מדף הסוכן',
      items: [{ id: 'a', name: 'א', qty: 2, price: 3 }] },
    { contactId: 'C9', at: '2026-11-14 10:00', orderId: 'Q-20261114-1000', text: '1 פריטים · מדף הסוכן',
      items: [{ id: 'a', name: 'א', qty: 2, price: 3 }] }];
  const h = A.quoteHistory(quotes, [{ name: 'מסעדת הגפן', crmId: 'C1' }]);
  assert.deepStrictEqual(h[0], { id: 'Q-20261115-4821', customer: 'מסעדת הגפן', date: '2026-11-15',
    items: [{ id: 'a', name: 'א', quantity: 2, price: 3 }], total: 1147.5 });
  assert.strictEqual(h[1].customer, '');
  assert.strictEqual(h[1].total, 6);
});

test('עזרים: טלפון, שם וחותמת', () => {
  assert.strictEqual(A.isOwnPhone('+972 52-600-0158'), true);
  assert.strictEqual(A.isOwnPhone('03-6346236'), true);
  assert.strictEqual(A.isOwnPhone('0501234567'), false);
  assert.strictEqual(A.nameKey('  מסעדת   הגפן '), 'מסעדת הגפן');
  assert.strictEqual(A.stampOf(new Date(2026, 10, 5, 7, 3)), '2026-11-05 07:03');
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
