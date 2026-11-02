/**
 * CRM — אהרוני שיווק והפצה. סקריפט Apps Script חמישי.
 * Web app: Execute as Me, Access Anyone. הסקריפט היחיד שכותב לגיליון ה-CRM.
 *
 * מי פונה אליו:
 *  - עמוד ה-CRM (/crm-f428d7/) — עם הסיסמה: list, add, update, log, delete, import.
 *  - סקריפט הלידים וסקריפט ההזמנות — עם הסוד המשותף: event.
 *
 * הריפו פומבי: כאן רק מצייני מקום (PUT_...). הערכים האמיתיים רק בעותק שבענן.
 * כל עוד הסיסמה או הסוד הם מציין מקום, או קצרים מ-12 תווים, כל בקשה נדחית.
 *
 * אפיון: docs/superpowers/specs/2026-11-02-crm-design.md
 * בדיקות: node tools/test/crm.test.js
 */

var SPREADSHEET_ID = 'PUT_CRM_SPREADSHEET_ID_HERE';
var ORDERS_SPREADSHEET_ID = 'PUT_ORDERS_SPREADSHEET_ID_HERE';
var CRM_PASSWORD = 'PUT_CRM_PASSWORD_HERE';
var CRM_SECRET = 'PUT_CRM_SECRET_HERE';

var TZ = 'Asia/Jerusalem';
var CONTACTS_SHEET = 'אנשי קשר';
var ACTIVITIES_SHEET = 'פעולות';
var ORDERS_SHEET = 'הזמנות';

var CONTACT_HEADERS = ['מזהה', 'שם', 'עסק', 'טלפון', 'אימייל', 'כתובת', 'שלב',
  'לחזור בתאריך', 'מקור', 'נוצר', 'פעולה אחרונה', 'הזמנות', 'הזמנה אחרונה'];
var CONTACT_KEYS = ['id', 'name', 'business', 'phone', 'email', 'address', 'stage',
  'followUp', 'source', 'created', 'lastActivity', 'orders', 'lastOrder'];
var ACTIVITY_HEADERS = ['מזהה פעולה', 'מזהה איש קשר', 'תאריך', 'סוג', 'פירוט',
  'מספר הזמנה', 'PDF', 'קישור הצעה', 'נוצר ע"י'];
var ACTIVITY_KEYS = ['id', 'contactId', 'at', 'type', 'text', 'orderId', 'pdf',
  'quoteLink', 'by'];

var STAGES = ['חדש', 'חזרתי', 'נשלחה הצעה', 'לקוח', 'לא רלוונטי'];
var MANUAL_SOURCES = ['וואטסאפ', 'טלפון', 'מודעה בפייסבוק', 'הפניה', 'אחר'];
var PAGE_ACTIVITY_TYPES = ['שיחה', 'וואטסאפ', 'הצעת מחיר', 'הערה', 'שלב'];

// ---------- עזרים ----------

function trim_(v) {
  return String(v == null ? '' : v).trim();
}

// לפני כתיבה לגיליון: תווי בקרה (חוץ משורה חדשה) ומניעת formula injection
function sanitize_(value, maxLen) {
  var s = String(value == null ? '' : value);
  s = s.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, ' ');
  if (/^[=+@\t\r-]/.test(s)) s = "'" + s;
  return s.slice(0, maxLen || 300);
}

// הגרש ש-sanitize_ מוסיף. גוגל שיטס לא מחזיר אותו, אבל גיליון שנערך ידנית
// (והגיליון המדומה בבדיקות) כן — ואז הוא היה מוצג בעמוד.
function unescape_(s) {
  return /^'[=+@\t\r-]/.test(s) ? s.slice(1) : s;
}

// אותם כללים כמו isValidIsraeliPhone באתר, ובנוסף: ה-0 בהתחלה נופל כשגוגל
// שיטס שומר מספר כמספר — כך הוא שמור בחלק מהשורות בגיליון ההזמנות.
function normalizePhone_(raw) {
  var d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (d.indexOf('00972') === 0) d = d.slice(2);
  if (d.indexOf('972') === 0) d = d.slice(3);
  if (/^[57]\d{8}$/.test(d) || /^[2-489]\d{7}$/.test(d)) d = '0' + d;
  return /^(0[57]\d{8}|0[2-489]\d{7}|1(?:599|700|800|801)\d{6})$/.test(d) ? d : '';
}

// השוואת שמות: בלי גרשיים ומירכאות, בלי רווחים כפולים ובלי רישיות
function nameKey_(s) {
  return trim_(s).replace(/["'`״׳]/g, '').replace(/\s+/g, ' ').toLowerCase();
}

function newId_(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function now_() {
  var d = new Date();
  return {
    date: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'),
    stamp: Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm')
  };
}

function blankContact_(at) {
  return {
    id: newId_('C'), name: '', business: '', phone: '', email: '', address: '',
    stage: 'חדש', followUp: '', source: '', created: at, lastActivity: at,
    orders: '0', lastOrder: ''
  };
}

function contactById_(model, id) {
  for (var i = 0; i < model.contacts.length; i++) {
    if (model.contacts[i].id === id) return model.contacts[i];
  }
  return null;
}

// טלפון קודם. בלי טלפון — לפי שם העסק (הזמנות מדף הסוכן מגיעות לפעמים בלי
// טלפון). יש טלפון ואין התאמה — מחפשים לפי השם רק בין אנשי קשר שאין להם
// טלפון, כדי שלקוח שנוצר מהזמנה בלי טלפון לא ישוכפל כשהטלפון מגיע.
function findContact_(contacts, phone, label) {
  var i;
  if (phone) {
    for (i = 0; i < contacts.length; i++) {
      if (contacts[i].phone === phone) return contacts[i];
    }
  }
  var key = nameKey_(label);
  if (!key) return null;
  for (i = 0; i < contacts.length; i++) {
    var c = contacts[i];
    if (phone && c.phone) continue;
    if (nameKey_(c.business || c.name) === key) return c;
  }
  return null;
}

function sourceFor_(ev) {
  if (ev.imported) return 'ייבוא';
  if (ev.type === 'lead') return trim_(ev.subject) ? 'אתר — ' + trim_(ev.subject) : 'אתר';
  if (ev.type === 'quote_request') return 'בקשת הצעת מחיר';
  return ev.via === 'דף הסוכן' ? 'דף הסוכן' : 'הזמנה מהאתר';
}

function activityFor_(ev, contactId, at) {
  var type;
  var lines = [];
  if (ev.type === 'lead') {
    type = 'ליד מהאתר';
    if (trim_(ev.subject)) lines.push(trim_(ev.subject));
    if (trim_(ev.message)) lines.push(trim_(ev.message));
    var where = [];
    if (trim_(ev.page)) where.push('עמוד: ' + trim_(ev.page));
    if (trim_(ev.landing) && trim_(ev.landing) !== trim_(ev.page)) where.push('נחיתה: ' + trim_(ev.landing));
    if (trim_(ev.source)) where.push('מקור: ' + trim_(ev.source));
    if (trim_(ev.gclid)) where.push('gclid: ' + trim_(ev.gclid));
    if (where.length) lines.push(where.join(' · '));
  } else {
    type = ev.type === 'quote_request' ? 'בקשת הצעת מחיר' : 'הזמנה';
    var parts = [];
    if (trim_(ev.totalItems)) parts.push(trim_(ev.totalItems) + ' פריטים');
    if (Number(ev.totalPrice) > 0) parts.push(Number(ev.totalPrice).toFixed(2) + ' ₪');
    if (ev.via === 'דף הסוכן') parts.push('מדף הסוכן');
    lines.push(parts.join(' · '));
  }
  return {
    id: newId_('A'), contactId: contactId, at: at, type: type,
    text: lines.join('\n').slice(0, 2000),
    orderId: trim_(ev.orderId).slice(0, 30),
    pdf: trim_(ev.pdfUrl).slice(0, 300),
    quoteLink: trim_(ev.quoteLink).slice(0, 5000),
    by: ev.by || (ev.type === 'lead' ? 'אתר' : 'הזמנות')
  };
}

// אירוע מסקריפט הלידים, מסקריפט ההזמנות או מהייבוא. משנה את model במקום.
// מחזיר { contact, activity, created }, או { skipped: true, contact } כשמספר
// ההזמנה כבר רשום — ניסיון חוזר או סנכרון שני לא מכפילים כלום.
function applyEvent_(model, ev, now) {
  var orderId = trim_(ev.orderId);
  if (orderId) {
    for (var i = 0; i < model.activities.length; i++) {
      if (model.activities[i].orderId === orderId) {
        return { skipped: true, contact: contactById_(model, model.activities[i].contactId) };
      }
    }
  }
  var at = trim_(ev.at) || now.stamp;
  var phone = normalizePhone_(ev.phone);
  var business = trim_(ev.business);
  var name = trim_(ev.name || ev.contact);
  var c = findContact_(model.contacts, phone, business || name);
  var created = false;
  if (!c) {
    c = blankContact_(at);
    c.source = sourceFor_(ev);
    model.contacts.push(c);
    created = true;
  }
  // משלימים רק שדות ריקים — מה שרועי תיקן בכרטיס לא נדרס. הכתובת היא חריג:
  // היא מתעדכנת להזמנה האחרונה.
  if (!c.phone && phone) c.phone = phone;
  if (!c.name && name) c.name = name;
  if (!c.business && business) c.business = business;
  if (!c.email && trim_(ev.email)) c.email = trim_(ev.email);
  if (trim_(ev.address)) c.address = trim_(ev.address);

  if (ev.type === 'order') {
    c.stage = 'לקוח';
    c.orders = String((Number(c.orders) || 0) + 1);
    if (!c.lastOrder || at.slice(0, 10) > c.lastOrder) c.lastOrder = at.slice(0, 10);
    c.followUp = '';
  } else {
    // שלב לא יורד לבד; רק מי שסומן "לא רלוונטי" נפתח מחדש
    if (c.stage === 'לא רלוונטי') c.stage = 'חדש';
    // פנייה חדשה מחזירה ל"לטיפול" — אבל תאריך שכבר עבר נשאר (הוא מוקדם יותר)
    if (!ev.imported && (!c.followUp || c.followUp > now.date)) c.followUp = now.date;
  }
  if (!c.lastActivity || at > c.lastActivity) c.lastActivity = at;
  if (!c.created || at < c.created) c.created = at;
  var activity = activityFor_(ev, c.id, at);
  model.activities.push(activity);
  return { contact: c, activity: activity, created: created };
}

// שורה מגיליון ההזמנות: { kind: 'quote_request' }, { kind: 'order', via }
// או { kind: 'skip', reason }. זה CRM לעסקים — רשת, ועד וצרכן לא נכנסים.
function classifyOrderRow_(r) {
  var prefix = trim_(r.orderId).slice(0, 3);
  if (prefix === 'RS-' || prefix === 'RA-') return { kind: 'skip', reason: 'chain' };
  if (prefix === 'VD-') return { kind: 'skip', reason: 'committee' };
  if (/בדיקה|למחוק/.test([trim_(r.business), trim_(r.contact), trim_(r.notes)].join(' '))) {
    return { kind: 'skip', reason: 'test' };
  }
  // הזמנת צרכן מ-/care/: יש לה שיטת אספקה ואין לה שם עסק
  if (prefix === 'AR-' && (trim_(r.shipping) || !trim_(r.business))) {
    return { kind: 'skip', reason: 'consumer' };
  }
  if (['HM-', 'AR-', 'SL-'].indexOf(prefix) < 0) return { kind: 'skip', reason: 'unknown' };
  if (!normalizePhone_(r.phone) && !trim_(r.business)) return { kind: 'skip', reason: 'noKey' };
  if (prefix === 'HM-') return { kind: 'quote_request' };
  return { kind: 'order', via: prefix === 'SL-' ? 'דף הסוכן' : 'אתר' };
}

// ייבוא מגיליון ההזמנות, מהישן לחדש. מחזיר { summary, touched } — touched הם
// מזהי אנשי הקשר שנוצרו או השתנו, כדי שהשמירה תכתוב רק אותם.
function buildImport_(model, rows, now) {
  var summary = {
    rows: rows.length, created: 0, updated: 0, activities: 0,
    skipped: { chain: 0, committee: 0, consumer: 0, test: 0, noKey: 0, unknown: 0, existing: 0 },
    testRows: []
  };
  var touched = {};
  var sorted = rows.slice().sort(function (a, b) {
    return a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : 0;
  });
  sorted.forEach(function (r) {
    var cls = classifyOrderRow_(r);
    if (cls.kind === 'skip') {
      summary.skipped[cls.reason]++;
      if (cls.reason === 'test') {
        summary.testRows.push(trim_(r.orderId) + ' — ' + (trim_(r.business) || trim_(r.contact)));
      }
      return;
    }
    var res = applyEvent_(model, {
      type: cls.kind, via: cls.via, orderId: r.orderId, at: r.receivedAt,
      business: r.business, contact: r.contact, phone: r.phone, address: r.address,
      totalItems: r.totalItems, totalPrice: r.totalPrice, pdfUrl: r.pdf,
      imported: true, by: 'ייבוא'
    }, now);
    if (res.skipped) {
      summary.skipped.existing++;
      return;
    }
    summary.activities++;
    if (res.created) summary.created++;
    else if (!touched[res.contact.id]) summary.updated++;
    touched[res.contact.id] = true;
  });
  return { summary: summary, touched: touched };
}

// ערכי גיליון ההזמנות לאובייקטים — לפי שמות העמודות ולא לפי מיקום, כדי
// שעמודה שתתווסף בעתיד לא תשבור את הייבוא.
function orderRowsFromValues_(values) {
  if (!values || values.length < 2) return [];
  var head = values[0].map(function (h) { return trim_(h); });
  var idx = {
    receivedAt: head.indexOf('תאריך קבלה'), orderId: head.indexOf('מספר הזמנה'),
    business: head.indexOf('שם העסק'), contact: head.indexOf('איש קשר'),
    phone: head.indexOf('טלפון'), address: head.indexOf('כתובת למשלוח'),
    notes: head.indexOf('הערות'), totalItems: head.indexOf('סה"כ פריטים'),
    totalPrice: head.indexOf('סה"כ לתשלום'), shipping: head.indexOf('שיטת אספקה'),
    pdf: head.indexOf('קובץ PDF')
  };
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var o = {};
    Object.keys(idx).forEach(function (k) {
      var v = idx[k] >= 0 ? row[idx[k]] : '';
      o[k] = v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm') : trim_(v);
    });
    if (o.orderId) out.push(o);
  }
  return out;
}
