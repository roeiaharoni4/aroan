/**
 * בדיקות ללוגיקה הטהורה של עמוד ה-CRM (crm-f428d7/crm-core.js).
 * להרצה: node tools/test/crm-page.test.js
 */
const assert = require('assert');
const C = require('../../crm-f428d7/crm-core.js');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

const TODAY = '2026-11-02'; // יום שני
const base = {
  id: 'C1', name: 'דנה', business: 'מסעדת הגפן', phone: '0501234567', email: '', address: '',
  stage: 'חדש', followUp: '', source: 'אתר', created: '2026-11-01 09:00',
  lastActivity: '2026-11-01 09:00', orders: '0', lastOrder: ''
};
const mk = (o) => Object.assign({}, base, o);

test('טלפון: אותם כללים כמו בסקריפט', () => {
  assert.strictEqual(C.normalizePhone('+972 50 123 4567'), '0501234567');
  assert.strictEqual(C.normalizePhone(501234567), '0501234567');
  assert.strictEqual(C.normalizePhone('03-555-1234'), '035551234');
  assert.strictEqual(C.normalizePhone('098'), '');
  assert.strictEqual(C.formatPhone('0501234567'), '050-1234567');
  assert.strictEqual(C.formatPhone('035551234'), '03-5551234');
});

test('תאריכים: קיצור שיוצא בשבת עובר לראשון; תאריך רגיל לא זז', () => {
  assert.strictEqual(C.addDays('2026-11-05', 1, true), '2026-11-06');
  assert.strictEqual(C.addDays('2026-11-05', 2, true), '2026-11-08');
  assert.strictEqual(C.addDays('2026-11-05', 2), '2026-11-07');
  assert.strictEqual(C.followUpFor('week', TODAY), '2026-11-09');
  assert.strictEqual(C.followUpFor('today', TODAY), TODAY);
  assert.strictEqual(C.followUpFor('none', TODAY), '');
});

test('לטיפול: חדש בלי תאריך ותאריך שהגיע; לא תאריך עתידי ולא "לא רלוונטי"', () => {
  assert.strictEqual(C.isTodo(mk({}), TODAY), true);
  assert.strictEqual(C.isTodo(mk({ followUp: '2026-11-09' }), TODAY), false);
  assert.strictEqual(C.isTodo(mk({ stage: 'חזרתי', followUp: TODAY }), TODAY), true);
  assert.strictEqual(C.isTodo(mk({ stage: 'לקוח', followUp: '2026-10-30' }), TODAY), true);
  assert.strictEqual(C.isTodo(mk({ stage: 'לקוח' }), TODAY), false);
  assert.strictEqual(C.isTodo(mk({ stage: 'לא רלוונטי', followUp: '2026-10-30' }), TODAY), false);
});

test('לטיפול: חדשים (החדש למעלה), באיחור (הישן למעלה), של היום', () => {
  const list = [
    mk({ id: 'today', stage: 'חזרתי', followUp: TODAY }),
    mk({ id: 'late2', stage: 'נשלחה הצעה', followUp: '2026-10-31' }),
    mk({ id: 'new-old', created: '2026-10-30 08:00' }),
    mk({ id: 'late5', stage: 'לקוח', followUp: '2026-10-28' }),
    mk({ id: 'new-fresh', created: '2026-11-02 08:00' })
  ];
  assert.deepStrictEqual(C.filterContacts(list, 'todo', '', TODAY).map(c => c.id),
    ['new-fresh', 'new-old', 'late5', 'late2', 'today']);
});

test('מונים לכל כפתור סינון', () => {
  const n = C.counts([mk({}), mk({ stage: 'לקוח' }), mk({ stage: 'לא רלוונטי' })], TODAY);
  assert.strictEqual(n.todo, 1);
  assert.strictEqual(n['חדש'], 1);
  assert.strictEqual(n['לקוח'], 1);
  assert.strictEqual(n['לא רלוונטי'], 1);
  assert.strictEqual(n.all, 3);
});

test('חיפוש: שם, עסק וספרות מהטלפון בכל צורה', () => {
  const list = [mk({ id: 'a' }), mk({ id: 'b', name: 'משה', business: 'מוסך הגליל', phone: '0547781203' })];
  assert.deepStrictEqual(C.filterContacts(list, 'all', 'גליל', TODAY).map(c => c.id), ['b']);
  assert.deepStrictEqual(C.filterContacts(list, 'all', '054-778', TODAY).map(c => c.id), ['b']);
  assert.deepStrictEqual(C.filterContacts(list, 'all', '+972 54 778', TODAY).map(c => c.id), ['b']);
  assert.strictEqual(C.filterContacts(list, 'all', '12', TODAY).length, 0);
});

test('תוצאה: לא ענה — חדש הופך לחזרתי ולחזור מחר; לקוח לא משתנה', () => {
  let r = C.applyOutcome(mk({}), 'no_answer', 'call', TODAY, null, '');
  assert.deepStrictEqual(r.fields, { stage: 'חזרתי', followUp: '2026-11-03' });
  assert.deepStrictEqual(r.activity, { type: 'שיחה', text: 'לא ענה' });
  r = C.applyOutcome(mk({ stage: 'לקוח' }), 'no_answer', 'whatsapp', TODAY, null, 'שלחתי הודעה');
  assert.deepStrictEqual(r.fields, { followUp: '2026-11-03' });
  assert.deepStrictEqual(r.activity, { type: 'וואטסאפ', text: 'לא ענה — שלחתי הודעה' });
});

test('תוצאה: דיברנו עם בחירת תאריך, ו"בלי" מנקה', () => {
  assert.strictEqual(C.applyOutcome(mk({}), 'talked', 'call', TODAY, 'week', '').fields.followUp, '2026-11-09');
  assert.strictEqual(C.applyOutcome(mk({}), 'talked', 'call', TODAY, 'none', '').fields.followUp, '');
  assert.strictEqual(C.applyOutcome(mk({}), 'talked', 'call', TODAY, 'none', '').fields.stage, 'חזרתי');
});

test('תוצאה: שלחתי הצעה (לקוח נשאר לקוח), הזמין, לא רלוונטי', () => {
  assert.deepStrictEqual(C.applyOutcome(mk({ stage: 'חזרתי' }), 'quote_sent', 'quote', TODAY).fields,
    { stage: 'נשלחה הצעה', followUp: '2026-11-05' });
  assert.deepStrictEqual(C.applyOutcome(mk({ stage: 'לקוח' }), 'quote_sent', 'quote', TODAY).fields,
    { followUp: '2026-11-05' });
  assert.deepStrictEqual(C.applyOutcome(mk({}), 'ordered', 'call', TODAY).fields, { stage: 'לקוח', followUp: '' });
  assert.deepStrictEqual(C.applyOutcome(mk({}), 'not_relevant', 'call', TODAY).fields,
    { stage: 'לא רלוונטי', followUp: '' });
  assert.strictEqual(C.applyOutcome(mk({}), 'quote_sent', 'quote', TODAY).activity.type, 'הצעת מחיר');
});

test('אחרי "הצעת מחיר" — "שלחתי הצעת מחיר" ראשון', () => {
  assert.strictEqual(C.outcomesFor('quote')[0].key, 'quote_sent');
  assert.strictEqual(C.outcomesFor('quote').length, 5);
  assert.strictEqual(C.outcomesFor('call')[0].key, 'no_answer');
});

test('תווית תאריך: היום, מחר, תאריך, באיחור', () => {
  assert.strictEqual(C.followUpLabel(mk({ followUp: TODAY }), TODAY), 'לחזור היום');
  assert.strictEqual(C.followUpLabel(mk({ followUp: '2026-11-03' }), TODAY), 'לחזור מחר');
  assert.strictEqual(C.followUpLabel(mk({ followUp: '2026-11-12' }), TODAY), 'לחזור 12.11');
  assert.strictEqual(C.followUpLabel(mk({ followUp: '2026-11-01' }), TODAY), 'לחזור — באיחור יום');
  assert.strictEqual(C.followUpLabel(mk({ followUp: '2026-10-30' }), TODAY), 'לחזור — באיחור 3 ימים');
  assert.strictEqual(C.followUpLabel(mk({}), TODAY), '');
  assert.strictEqual(C.isOverdue(mk({ followUp: '2026-11-01' }), TODAY), true);
  assert.strictEqual(C.isOverdue(mk({ followUp: TODAY }), TODAY), false);
});

test('קישורים: וואטסאפ רק לנייד; דף הסוכן עם הלקוח', () => {
  assert.strictEqual(C.waLink('0501234567'), 'https://wa.me/972501234567');
  assert.strictEqual(C.waLink('035551234'), '');
  assert.strictEqual(C.agentLink(mk({})), '/agent/?customer=' + encodeURIComponent('מסעדת הגפן') +
    '&contact=' + encodeURIComponent('דנה') + '&phone=0501234567');
});

test('ליד חדש: טלפון חובה ותקין, ושם או עסק', () => {
  assert.strictEqual(C.validateNew({ phone: '', name: 'א' }, 'add'), 'צריך מספר טלפון.');
  assert.ok(/לא תקין/.test(C.validateNew({ phone: '123', name: 'א' }, 'add')));
  assert.strictEqual(C.validateNew({ phone: '0501234567' }, 'add'), 'צריך שם או שם עסק.');
  assert.strictEqual(C.validateNew({ phone: '0501234567', business: 'ב' }, 'add'), '');
  assert.strictEqual(C.validateNew({ phone: '', name: 'א' }, 'edit'), '');
  assert.strictEqual(C.findByPhone([mk({})], '+972-50-1234567').id, 'C1');
  assert.strictEqual(C.findByPhone([mk({})], '123'), null);
});

test('שורת משנה, שם לתצוגה ותאריכים יחסיים', () => {
  assert.strictEqual(C.subLine(mk({ lastActivity: '2026-11-02 08:00' }), TODAY), 'דנה · אתר · היום');
  assert.strictEqual(C.subLine(mk({ business: '', lastActivity: '2026-11-01 08:00' }), TODAY), 'אתר · אתמול');
  assert.strictEqual(C.displayName(mk({ business: '' })), 'דנה');
  assert.strictEqual(C.displayName(mk({ business: '', name: '' })), '050-1234567');
  assert.strictEqual(C.formatStamp('2026-11-02 10:42'), '02.11 · 10:42');
  assert.strictEqual(C.stageSlug('נשלחה הצעה'), 'quote');
});

test('סיכום ייבוא', () => {
  const lines = C.importLines({ created: 3, updated: 1, activities: 5,
    skipped: { chain: 63, test: 2, existing: 0 } }, false);
  assert.strictEqual(lines[0], 'ייובאו 5 הזמנות ובקשות: 3 אנשי קשר חדשים, 1 קיימים מתעדכנים.');
  assert.strictEqual(lines[1], 'דולגו: רשת החנויות 63 · שורות בדיקה 2.');
  assert.strictEqual(C.importLines({ created: 0, updated: 0, activities: 0, skipped: {} }, false)[0],
    'אין מה לייבא — הכל כבר כאן.');
  assert.ok(C.importLines({ created: 1, updated: 0, activities: 1, skipped: {} }, true)[0].indexOf('יובאו 1') === 0);
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length
                   : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
