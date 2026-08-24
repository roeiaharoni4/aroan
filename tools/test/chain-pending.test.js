/**
 * בדיקות לסקריפט ההזמנות הממתינות של רשת החנויות.
 * הקובץ .gs נטען כטקסט ומורץ עם דמויות של שירותי גוגל, כדי שהבדיקה תרוץ
 * על אותו קוד שרץ בענן. נבדקות הפונקציות הטהורות בלבד.
 * להרצה: node tools/test/chain-pending.test.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// fakeCache, כשמסופק, הוא מה ש-CacheService.getScriptCache() יחזיר בתוך
// המופע הזה של הקובץ — צריך להיות אותו אובייקט בין קריאות, בדיוק כמו
// שה-cache האמיתי של גוגל משותף בין הפעלות של אותו סקריפט.
function loadGs(fakeCache) {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'google-apps-script-chain-pending.gs'), 'utf8');
  const stubs = `
    var SpreadsheetApp = {}, ContentService = {},
        Utilities = {}, Logger = { log: function () {} };
    var CacheService = { getScriptCache: function () { return __fakeCache__; } };
  `;
  return new Function(
    '__fakeCache__',
    stubs + src +
    '; return { pendingRow_: pendingRow_, rowToOrder_: rowToOrder_,' +
    '   sanitize_: sanitize_, rateLimitOk_: rateLimitOk_,' +
    '   PENDING_HEADERS: PENDING_HEADERS };'
  )(fakeCache || null);
}

const gs = loadGs();

const ORDER = {
  orderId: 'RS-20260824-1234',
  date: '24.08.2026',
  branch: 'קניון איילון — סניף 12',
  orderer: 'דנה כהן',
  notes: 'לפרוק בכניסה האחורית',
  items: [
    { id: 'ניק001', name: 'אקונומיקה 4 ליטר', qty: 6, unit: 'יחידה', category: 'ניקיון' },
    { id: 'מוצ001', name: 'גליל נייר תעשייתי', qty: 12, unit: 'יחידה', category: 'מוצרי נייר' }
  ]
};

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('pendingRow_');

test('אורך השורה תואם לכותרות', () => {
  assert.strictEqual(gs.pendingRow_(ORDER).length, gs.PENDING_HEADERS.length);
});

test('הסניף והמזמין נכתבים בעמודות שלהם', () => {
  const row = gs.pendingRow_(ORDER);
  assert.strictEqual(row[gs.PENDING_HEADERS.indexOf('סניף')], 'קניון איילון — סניף 12');
  assert.strictEqual(row[gs.PENDING_HEADERS.indexOf('מזמין')], 'דנה כהן');
});

test('הפריטים נשמרים כ-JSON שאפשר לפרסר בחזרה', () => {
  const row = gs.pendingRow_(ORDER);
  const raw = row[gs.PENDING_HEADERS.indexOf('פריטים')];
  const items = JSON.parse(raw);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].id, 'ניק001');
  assert.strictEqual(items[0].qty, 6);
});

test('סטטוס התחלתי הוא ממתין', () => {
  const row = gs.pendingRow_(ORDER);
  assert.strictEqual(row[gs.PENDING_HEADERS.indexOf('סטטוס')], 'ממתין');
});

test('מספר הפריטים הוא סכום הכמויות ולא מספר השורות', () => {
  const row = gs.pendingRow_(ORDER);
  assert.strictEqual(row[gs.PENDING_HEADERS.indexOf('מספר פריטים')], 18);
});

test('הזמנה בלי פריטים לא מפילה', () => {
  const row = gs.pendingRow_({ orderId: 'RS-1', branch: 'א' });
  assert.strictEqual(row[gs.PENDING_HEADERS.indexOf('פריטים')], '[]');
  assert.strictEqual(row[gs.PENDING_HEADERS.indexOf('מספר פריטים')], 0);
});

console.log('sanitize_');

test('מנטרל formula injection', () => {
  assert.strictEqual(gs.sanitize_('=SUM(A1:A9)'), "'=SUM(A1:A9)");
  assert.strictEqual(gs.sanitize_('+1'), "'+1");
  assert.strictEqual(gs.sanitize_('-1'), "'-1");
  assert.strictEqual(gs.sanitize_('@x'), "'@x");
});

test('טקסט רגיל עובר כמו שהוא', () => {
  assert.strictEqual(gs.sanitize_('קניון איילון'), 'קניון איילון');
});

test('ערך ריק הופך למחרוזת ריקה ולא ל-undefined', () => {
  assert.strictEqual(gs.sanitize_(undefined), '');
  assert.strictEqual(gs.sanitize_(null), '');
});

console.log('rowToOrder_');

test('שורה חוזרת לאובייקט עם אותם ערכים', () => {
  const order = gs.rowToOrder_(gs.pendingRow_(ORDER));
  assert.strictEqual(order.orderId, 'RS-20260824-1234');
  assert.strictEqual(order.branch, 'קניון איילון — סניף 12');
  assert.strictEqual(order.orderer, 'דנה כהן');
  assert.strictEqual(order.status, 'ממתין');
  assert.strictEqual(order.itemCount, 18);
  assert.strictEqual(order.items.length, 2);
  assert.strictEqual(order.items[1].name, 'גליל נייר תעשייתי');
});

test('שורה עם JSON פגום מחזירה רשימת פריטים ריקה ולא זורקת', () => {
  const row = gs.pendingRow_(ORDER);
  row[gs.PENDING_HEADERS.indexOf('פריטים')] = '{לא JSON';
  const order = gs.rowToOrder_(row);
  assert.deepStrictEqual(order.items, []);
});

console.log('rateLimitOk_');

// דמות קאש מינימלית: get/put על מפה בזיכרון, כמו CacheService.getScriptCache()
function makeFakeCache() {
  const store = {};
  const puts = [];
  return {
    get: (key) => (key in store ? store[key] : null),
    put: (key, value, ttl) => { store[key] = value; puts.push({ key, value, ttl }); },
    puts
  };
}

test('200 הבקשות הראשונות מותרות והבאה אחריהן נדחית', () => {
  const cache = makeFakeCache();
  const scoped = loadGs(cache);
  for (let i = 0; i < 200; i++) {
    assert.strictEqual(scoped.rateLimitOk_(), true, 'בקשה מספר ' + (i + 1) + ' אמורה להיות מותרת');
  }
  assert.strictEqual(scoped.rateLimitOk_(), false, 'הבקשה ה-201 אמורה להידחות');
});

test('המונה נכתב בחזרה לקאש עם TTL של 3600 שניות', () => {
  const cache = makeFakeCache();
  const scoped = loadGs(cache);
  scoped.rateLimitOk_();
  assert.strictEqual(cache.puts.length, 1);
  assert.strictEqual(cache.puts[0].ttl, 3600);
  assert.strictEqual(cache.puts[0].value, '1');
});

console.log('\n' + passed + ' בדיקות עברו');
