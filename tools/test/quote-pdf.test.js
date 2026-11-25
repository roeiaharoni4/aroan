/**
 * בדיקות לחלוקה לעמודים ולשם הקובץ של הצעת המחיר ב-PDF (js/quote-pdf.js).
 * להרצה: node tools/test/quote-pdf.test.js
 */
const assert = require('assert');
const Q = require('../../js/quote-pdf.js');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

const rows = (n, h) => Array.from({ length: n }, () => h || 60);

test('הצעה קצרה — עמוד אחד עם הכל', () => {
  const p = Q.paginate({ avail: 1000, top: 200, thead: 30, rows: rows(5), tail: 150 });
  assert.deepStrictEqual(p, [{ first: true, rows: [0, 1, 2, 3, 4], tail: true }]);
});

test('שורות שלא נכנסות עוברות לעמוד הבא, עם כותרות הטבלה', () => {
  // עמוד 1: 200 + 30 + 12×60 = 950. השורה ה-13 לא נכנסת.
  const p = Q.paginate({ avail: 1000, top: 200, thead: 30, rows: rows(20), tail: 100 });
  assert.strictEqual(p.length, 2);
  assert.strictEqual(p[0].first, true);
  assert.strictEqual(p[0].rows.length, 12);
  assert.strictEqual(p[0].tail, false);
  assert.deepStrictEqual(p[1].rows, [12, 13, 14, 15, 16, 17, 18, 19]);
  assert.strictEqual(p[1].first, false);
  assert.strictEqual(p[1].tail, true);
});

test('כל שורה מופיעה פעם אחת ובסדר', () => {
  const p = Q.paginate({ avail: 900, top: 250, thead: 30, rows: rows(57, 63), tail: 180 });
  const all = [].concat(...p.map(x => x.rows));
  assert.deepStrictEqual(all, Array.from({ length: 57 }, (_, i) => i));
  assert.strictEqual(p.filter(x => x.first).length, 1);
  assert.strictEqual(p.filter(x => x.tail).length, 1);
  assert.strictEqual(p[p.length - 1].tail, true);
});

test('אף עמוד לא חורג מהגובה (חוץ משורה ענקית לבד)', () => {
  const m = { avail: 900, top: 250, thead: 30, rows: rows(40, 70), tail: 180 };
  Q.paginate(m).forEach(pg => {
    let h = (pg.first ? m.top : 0) + (pg.rows.length ? m.thead : 0)
      + pg.rows.reduce((s, i) => s + m.rows[i], 0) + (pg.tail ? m.tail : 0);
    assert.ok(h <= m.avail, 'גובה ' + h);
  });
});

test('סיכום שלא נכנס עובר לעמוד משלו', () => {
  // 200 + 30 + 11×60 = 890; עוד 150 לסיכום כבר לא נכנס ב-1000
  const p = Q.paginate({ avail: 1000, top: 200, thead: 30, rows: rows(11), tail: 150 });
  assert.strictEqual(p.length, 2);
  assert.strictEqual(p[0].tail, false);
  assert.deepStrictEqual(p[1], { first: false, rows: [], tail: true });
});

test('שורה ראשונה גבוהה מדי לא יוצרת עמוד ריק', () => {
  const p = Q.paginate({ avail: 500, top: 450, thead: 30, rows: [100], tail: 0 });
  assert.strictEqual(p[0].rows.length, 1);
  assert.strictEqual(p.every(x => x.rows.length || x.tail), true);
});

test('שם הקובץ: לקוח ומספר הצעה', () => {
  assert.strictEqual(Q.fileName('מסעדת הגפן', 'Q-20261125-1234'), 'הצעת מחיר - מסעדת הגפן - Q-20261125-1234.pdf');
});

test('שם הקובץ: לקוח כללי או ריק — בלי שם', () => {
  assert.strictEqual(Q.fileName('לקוח כללי', 'Q-1'), 'הצעת מחיר Q-1.pdf');
  assert.strictEqual(Q.fileName('', 'Q-1'), 'הצעת מחיר Q-1.pdf');
});

test('שם הקובץ: תווים אסורים יורדים ומירכאות הופכות לגרשיים', () => {
  assert.strictEqual(Q.fileName('גוטקס בע"מ / סניף: 2?', 'Q-1'), 'הצעת מחיר - גוטקס בע״מ סניף 2 - Q-1.pdf');
});

test('שם הקובץ: ארוך מדי נחתך ונשאר עם סיומת', () => {
  const f = Q.fileName('א'.repeat(300), 'Q-1');
  assert.ok(f.length <= 124);
  assert.ok(f.endsWith('.pdf'));
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
