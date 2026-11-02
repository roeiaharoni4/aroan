/**
 * בדיקות לסקריפט הלידים (tools/google-apps-script-leads.gs).
 * הפיילוד נלכד מהאתר בדפדפן (tools/test/fixtures/crm-lead-payload.json).
 * להרצה: node tools/test/leads.test.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const PAYLOAD = require('./fixtures/crm-lead-payload.json');

function loadGs(crmResponse, opts) {
  opts = opts || {};
  const src = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script-leads.gs'), 'utf8');
  const calls = { fetch: [], mail: [] };
  const store = {};
  const env = {
    CacheService: { getScriptCache() { return { get: k => store[k] || null, put: (k, v) => { store[k] = v; } }; } },
    UrlFetchApp: {
      fetch(url, o) {
        calls.fetch.push({ url, body: JSON.parse(o.payload) });
        if (crmResponse instanceof Error) throw crmResponse;
        return { getContentText() { return JSON.stringify(crmResponse); } };
      }
    },
    MailApp: { sendEmail(to, subject, body) { calls.mail.push({ to, subject, body }); } },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput(s) { return { content: s, setMimeType() { return this; } }; }
    },
    Logger: { log() {} }
  };
  const config = opts.placeholder ? '' :
    "CRM_URL = 'https://script.google.com/macros/s/CRM/exec'; CRM_SECRET = 'test-secret-abcdefgh';\n";
  const gs = new Function('CacheService', 'UrlFetchApp', 'MailApp', 'ContentService', 'Logger',
    src + '\n' + config + 'return { doPost: doPost, doGet: doGet, splitName_: splitName_ };'
  )(env.CacheService, env.UrlFetchApp, env.MailApp, env.ContentService, env.Logger);
  gs.calls = calls;
  gs.post = (data) => JSON.parse(gs.doPost({ postData: { contents: JSON.stringify(data) } }).content);
  return gs;
}

const OK = { ok: true, id: 'Cabc123' };
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('ליד: אירוע ל-CRM עם הסוד; שם ועסק מופרדים; "לא צוין" כריק', () => {
  const gs = loadGs(OK);
  gs.post(PAYLOAD);
  assert.strictEqual(gs.calls.fetch.length, 1);
  const b = gs.calls.fetch[0].body;
  assert.strictEqual(b.action, 'event');
  assert.strictEqual(b.secret, 'test-secret-abcdefgh');
  assert.strictEqual(b.event.type, 'lead');
  assert.strictEqual(b.event.name, 'דנה כהן');
  assert.strictEqual(b.event.business, 'מסעדת בדיקה');
  assert.strictEqual(b.event.phone, '050-1234567');
  assert.strictEqual(b.event.email, '');
  assert.strictEqual(b.event.message, 'צריך הצעה לחד פעמי');
  assert.strictEqual(b.event.subject, PAYLOAD._subject);
  assert.strictEqual(b.event.page, '/contact/');
});

test('מייל: כמו קודם, ובנוסף העמוד, המקור וקישור לכרטיס', () => {
  const gs = loadGs(OK);
  gs.post(PAYLOAD);
  const m = gs.calls.mail[0];
  assert.strictEqual(m.to, 'meiraroam@gmail.com');
  assert.strictEqual(m.subject, PAYLOAD._subject);
  assert.ok(m.body.indexOf('שם מלא: דנה כהן — מסעדת בדיקה') >= 0, m.body);
  assert.ok(m.body.indexOf('אימייל: לא צוין') >= 0, m.body);
  assert.ok(m.body.indexOf('עמוד: /contact/') >= 0, m.body);
  assert.ok(m.body.indexOf('פתח בכרטיס: https://aroam.co.il/crm-f428d7/#c=Cabc123') >= 0, m.body);
});

test('CRM נכשל (שגיאה או ok:false) — המייל יוצא ואומר להוסיף ידנית', () => {
  [new Error('timeout'), { ok: false, error: 'busy' }].forEach(resp => {
    const gs = loadGs(resp);
    assert.strictEqual(gs.post(PAYLOAD).success, 'true');
    assert.ok(gs.calls.mail[0].body.indexOf('לא נשמר ב-CRM — להוסיף ידנית') >= 0);
  });
});

test('בלי כתובת CRM (מציין מקום) — בלי קריאה, והמייל אומר להוסיף ידנית', () => {
  const gs = loadGs(OK, { placeholder: true });
  gs.post(PAYLOAD);
  assert.strictEqual(gs.calls.fetch.length, 0);
  assert.ok(gs.calls.mail[0].body.indexOf('לא נשמר ב-CRM') >= 0);
});

test('שדה המלכודת מולא — בלי מייל ובלי CRM, עם תשובת הצלחה', () => {
  const gs = loadGs(OK);
  assert.strictEqual(gs.post(Object.assign({}, PAYLOAD, { _honey: 'http://spam' })).success, 'true');
  assert.strictEqual(gs.calls.mail.length, 0);
  assert.strictEqual(gs.calls.fetch.length, 0);
});

test('ביטול עסקה — מייל בלבד, בלי CRM ובלי שורת כרטיס', () => {
  const gs = loadGs(OK);
  gs.post(Object.assign({}, PAYLOAD, { _subject: 'הודעת ביטול עסקה',
    'הודעה / בקשה': 'מספר תעודת זהות: 123456789' }));
  assert.strictEqual(gs.calls.fetch.length, 0);
  assert.strictEqual(gs.calls.mail.length, 1);
  assert.ok(gs.calls.mail[0].body.indexOf('CRM') < 0);
  assert.ok(gs.calls.mail[0].body.indexOf('123456789') >= 0);
});

test('הגבלת קצב: 100 בשעה', () => {
  const gs = loadGs(OK);
  for (let i = 0; i < 100; i++) gs.post(PAYLOAD);
  assert.strictEqual(gs.post(PAYLOAD).success, 'false');
  assert.strictEqual(gs.calls.mail.length, 100);
});

test('שם בלי עסק, ושם עם מקף רגיל', () => {
  const gs = loadGs(OK);
  assert.deepStrictEqual(gs.splitName_('דנה כהן'), { name: 'דנה כהן', business: '' });
  assert.deepStrictEqual(gs.splitName_('דנה-כהן'), { name: 'דנה-כהן', business: '' });
  assert.deepStrictEqual(gs.splitName_('דנה — מסעדה — סניף 2'), { name: 'דנה — מסעדה', business: 'סניף 2' });
});

test('doGet — בדיקת חיים', () => {
  assert.strictEqual(loadGs(OK).doGet().content, 'לידים — פעיל');
});

let failed = 0;
tests.forEach(([name, fn]) => {
  try { fn(); console.log('  V ' + name); }
  catch (e) { failed++; console.log('  X ' + name + '\n      ' + e.message); }
});
console.log(failed ? '\nנכשלו ' + failed + ' מתוך ' + tests.length
                   : '\nכל ' + tests.length + ' הבדיקות עברו');
process.exit(failed ? 1 : 0);
