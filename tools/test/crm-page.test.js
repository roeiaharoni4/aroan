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

test('הזמנות: שורת הכרטיס, תווית איחור ושורת הרשימה', () => {
  assert.strictEqual(C.ordersLine(mk({ orders: '4', daysSinceOrder: 52, rhythm: 30 })),
    '4 הזמנות · אחרונה לפני 52 ימים · בדרך כלל כל 30 יום');
  assert.strictEqual(C.ordersLine(mk({ orders: '1', daysSinceOrder: 0, rhythm: 0 })), 'הזמנה אחת · אחרונה היום');
  assert.strictEqual(C.ordersLine(mk({ orders: '3', daysSinceOrder: 1, rhythm: 7 })),
    '3 הזמנות · אחרונה אתמול · בדרך כלל כל 7 ימים');
  assert.strictEqual(C.ordersLine(mk({})), 'אין הזמנה רשומה');
  assert.strictEqual(C.lateLabel(mk({ isLate: true, lateBy: 22 })), 'מאחר ב-22 ימים');
  assert.strictEqual(C.lateLabel(mk({ isLate: true, lateBy: 1 })), 'מאחר ביום');
  assert.strictEqual(C.lateLabel(mk({ isLate: false, lateBy: 0 })), '');
  assert.strictEqual(C.orderSubLine(mk({ daysSinceOrder: 52 })), 'הזמנה אחרונה לפני 52 ימים');
  assert.strictEqual(C.orderSubLine(mk({})), '');
  assert.strictEqual(C.subLine(mk({ daysSinceOrder: 52 }), TODAY, true), 'דנה · אתר · הזמנה אחרונה לפני 52 ימים');
  assert.strictEqual(C.subLine(mk({ lastActivity: '2026-11-02 08:00' }), TODAY, true), 'דנה · אתר · היום');
  assert.strictEqual(C.subLine(mk({ daysSinceOrder: 52, lastActivity: '2026-11-02 08:00' }), TODAY), 'דנה · אתר · היום');
});

test('לא הזמינו: סינון וסדר לפי האיחור; מונים עם משימות', () => {
  const list = [mk({ id: 'a', stage: 'לקוח', isLate: true, lateBy: 7 }),
    mk({ id: 'b', stage: 'לקוח', isLate: true, lateBy: 22 }), mk({ id: 'c', stage: 'לקוח' })];
  assert.deepStrictEqual(C.filterContacts(list, 'late', '', TODAY).map(c => c.id), ['b', 'a']);
  const tasks = [{ id: 'T1', due: TODAY, time: '', done: '' }, { id: 'T2', due: '2026-11-09', time: '', done: '' }];
  const n = C.counts(list, TODAY, tasks);
  assert.strictEqual(n.late, 2);
  assert.strictEqual(n.tasks, 2);
  assert.strictEqual(n.todo, 1);
  assert.strictEqual(C.filterContacts(list, 'tasks', '', TODAY).length, 0);
  assert.strictEqual(C.FILTERS.map(f => f.key).slice(0, 3).join(','), 'todo,tasks,late');
});

test('משימות: סדר, תוויות, משימות של איש קשר, ולידציה וחיפוש', () => {
  const t = (o) => Object.assign({ id: 'T', contactId: '', text: 'x', due: TODAY, time: '', done: '' }, o);
  const tasks = [t({ id: 'today-14', time: '14:00' }), t({ id: 'late', due: '2026-10-30' }),
    t({ id: 'today', time: '' }), t({ id: 'future', due: '2026-11-04' }), t({ id: 'done', done: 'x' })];
  assert.deepStrictEqual(C.dueTasks(tasks, TODAY).map(x => x.id), ['late', 'today', 'today-14']);
  assert.deepStrictEqual(C.sortTasks(tasks.filter(x => !x.done)).map(x => x.id),
    ['late', 'today', 'today-14', 'future']);
  assert.strictEqual(C.taskDueLabel(t({ due: '2026-10-30' }), TODAY), 'באיחור 3 ימים');
  assert.strictEqual(C.taskDueLabel(t({ due: '2026-11-01' }), TODAY), 'באיחור יום');
  assert.strictEqual(C.taskDueLabel(t({ time: '14:00' }), TODAY), 'היום 14:00');
  assert.strictEqual(C.taskDueLabel(t({ due: '2026-11-03' }), TODAY), 'מחר');
  assert.strictEqual(C.taskDueLabel(t({ due: '2026-11-12', time: '09:30' }), TODAY), '12.11 09:30');
  assert.strictEqual(C.isTaskLate(t({ due: '2026-11-01' }), TODAY), true);
  assert.strictEqual(C.isTaskLate(t({}), TODAY), false);
  assert.deepStrictEqual(C.openTasksOf([t({ id: 'a', contactId: 'C1' }), t({ id: 'b', contactId: 'C2' }),
    t({ id: 'c', contactId: 'C1', done: 'x' })], 'C1').map(x => x.id), ['a']);
  assert.strictEqual(C.validateTask({ text: '', due: TODAY }), 'צריך לכתוב מה המשימה.');
  assert.strictEqual(C.validateTask({ text: 'x', due: '' }), 'צריך לבחור תאריך.');
  assert.strictEqual(C.validateTask({ text: 'x', due: TODAY, time: '25:00' }), 'השעה לא תקינה.');
  assert.strictEqual(C.validateTask({ text: 'x', due: TODAY, time: '' }), '');
  assert.strictEqual(C.taskMatchesQuery(t({ text: 'להביא דוגמאות' }), mk({}), 'הגפן'), true);
  assert.strictEqual(C.taskMatchesQuery(t({ text: 'להביא דוגמאות' }), null, 'דוגמ'), true);
  assert.strictEqual(C.taskMatchesQuery(t({ text: 'להביא דוגמאות' }), null, 'הגפן'), false);
  assert.strictEqual(C.taskMatchesQuery(t({ text: 'x' }), null, '  '), true);
});

test('תוצאה "הזמין": נרשמת כהזמנה; ובלי רישום — רק הערוץ', () => {
  let r = C.applyOutcome(mk({}), 'ordered', 'call', TODAY, null, 'בטלפון');
  assert.deepStrictEqual(r.fields, { stage: 'לקוח', followUp: '' });
  assert.deepStrictEqual(r.activity, { type: 'הזמנה', text: 'דרך שיחה — בטלפון' });
  r = C.applyOutcome(mk({}), 'ordered', 'whatsapp', TODAY, null, '', false);
  assert.deepStrictEqual(r.activity, { type: 'וואטסאפ', text: 'הזמין' });
  const acts = [{ contactId: 'C1', type: 'הזמנה', at: TODAY + ' 09:00', by: 'עמוד', orderId: '' }];
  assert.strictEqual(C.orderOn(acts, 'C1', TODAY), true);
  assert.strictEqual(C.orderOn(acts, 'C1', '2026-11-01'), false);
  assert.strictEqual(C.isManualOrder(acts[0]), true);
  assert.strictEqual(C.isManualOrder(Object.assign({}, acts[0], { orderId: 'AR-1' })), false);
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length
                   : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
