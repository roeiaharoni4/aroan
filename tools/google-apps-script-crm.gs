/**
 * CRM — אהרוני שיווק והפצה. סקריפט Apps Script חמישי.
 * Web app: Execute as Me, Access Anyone. הסקריפט היחיד שכותב לגיליון ה-CRM.
 *
 * מי פונה אליו:
 *  - עמוד ה-CRM (/crm-f428d7/) — עם הסיסמה: list, add, update, log, delete, import,
 *    order, order_cancel, task_add, task_update, task_delete.
 *  - סקריפט הלידים וסקריפט ההזמנות — עם הסוד המשותף: event.
 *  - טריגר זמן (tick, כל 5 דקות) — תזכורות למשימות וסיכום הבוקר. מוקם ב-setupNotifications.
 *
 * הריפו פומבי: כאן רק מצייני מקום (PUT_...). הערכים האמיתיים רק בעותק שבענן.
 * כל עוד הסיסמה או הסוד הם מציין מקום, או קצרים מ-12 תווים, כל בקשה נדחית.
 *
 * אפיון: docs/superpowers/specs/2026-11-02-crm-design.md
 *        docs/superpowers/specs/2026-11-03-crm-orders-tasks-notifications-design.md
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
var TASKS_SHEET = 'משימות';
var TASK_HEADERS = ['מזהה', 'מזהה איש קשר', 'משימה', 'תאריך', 'שעה', 'בוצעה', 'נוצרה', 'תזכורת נשלחה'];
var TASK_KEYS = ['id', 'contactId', 'text', 'due', 'time', 'done', 'created', 'reminded'];

var STAGES = ['חדש', 'חזרתי', 'נשלחה הצעה', 'לקוח', 'לא רלוונטי'];
var MANUAL_SOURCES = ['וואטסאפ', 'טלפון', 'מודעה בפייסבוק', 'הפניה', 'אחר'];
var PAGE_ACTIVITY_TYPES = ['שיחה', 'וואטסאפ', 'הצעת מחיר', 'הערה', 'שלב', 'הזמנה'];

// קצב הזמנות: הזמנות במרחק של עד 3 ימים נספרות כהזמנה אחת; בלי קצב (פחות
// משלושה ימי הזמנה) לקוח מאחר אחרי 45 יום
var MERGE_DAYS = 3;
var DEFAULT_LATE_DAYS = 45;

// התראות (אפיון 2026-11-03). הטוקן והצ'אט של הבוט — ב-Script Properties בלבד:
// TELEGRAM_TOKEN (רועי מדביק), TELEGRAM_CHAT_ID (setupNotifications שומרת).
var NOTIFY_EMAIL = 'meiraroam@gmail.com';
var CRM_PAGE_URL = 'https://aroam.co.il/crm-f428d7/';
var DIGEST_FROM = '07:30';
var DIGEST_UNTIL = '12:00';
var REMIND_RETRY_MINUTES = 120;
var REMIND_LATE_MINUTES = 30;

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

// ימים בין שני תאריכים (YYYY-MM-DD, או חותמת שמתחילה בתאריך). UTC — בלי קפיצות שעון קיץ.
function dayNum_(s) {
  var p = String(s).slice(0, 10).split('-');
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000;
}

function daysBetween_(a, b) {
  return Math.round(dayNum_(b) - dayNum_(a));
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
// מחזיר { contact, activity, created } — ועם attached: true כשהזמנה מילאה רישום
// ידני מאותו יום — או { skipped: true, contact } כשמספר ההזמנה כבר רשום:
// ניסיון חוזר או סנכרון שני לא מכפילים כלום.
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
  // הזמנה עם מספר, באותו יום של הזמנה שרועי רשם ידנית — ממלאת את הרישום ולא נספרת פעמיים
  var manual = ev.type === 'order' && orderId ? manualOrderOn_(model, c.id, at.slice(0, 10)) : null;
  if (manual) {
    manual.orderId = activity.orderId;
    manual.pdf = activity.pdf;
    manual.quoteLink = activity.quoteLink;
    manual.text = activity.text + (manual.text ? '\n' + manual.text : '');
    manual._dirty = true;
    recomputeOrders_(model, c);
    return { contact: c, activity: manual, created: created, attached: true };
  }
  model.activities.push(activity);
  if (ev.type === 'order') recomputeOrders_(model, c);
  return { contact: c, activity: activity, created: created };
}

// ---------- הזמנות וקצב ----------

// לכל איש קשר: ימי ההזמנה שלו, ממוינים ובלי כפילויות
function orderDaysByContact_(activities) {
  var map = {};
  activities.forEach(function (a) {
    if (a.type !== 'הזמנה' || !a.at) return;
    var d = String(a.at).slice(0, 10);
    var list = map[a.contactId] || (map[a.contactId] = []);
    if (list.indexOf(d) < 0) list.push(d);
  });
  Object.keys(map).forEach(function (k) { map[k].sort(); });
  return map;
}

// הזמנה שנשלחה כמה פעמים או פוצלה ליומיים נספרת פעם אחת לצורך הקצב
function orderEvents_(days) {
  var out = [];
  days.forEach(function (d) {
    if (!out.length || daysBetween_(out[out.length - 1], d) > MERGE_DAYS) out.push(d);
  });
  return out;
}

// חציון המרווחים בימים שלמים; 0 = אין קצב (פחות משלושה ימי הזמנה)
function rhythmFor_(events) {
  if (events.length < 3) return 0;
  var gaps = [];
  for (var i = 1; i < events.length; i++) gaps.push(daysBetween_(events[i - 1], events[i]));
  gaps.sort(function (a, b) { return a - b; });
  var m = gaps.length;
  return Math.round(m % 2 ? gaps[(m - 1) / 2] : (gaps[m / 2 - 1] + gaps[m / 2]) / 2);
}

// days: ימי ההזמנה של איש הקשר. מאחר — רק "לקוח", לא כשנקבע תאריך חזרה עתידי,
// וכשעבר יותר מהסף: קצב × 1.5 ולפחות קצב + 7, או 45 בלי קצב.
// lateBy נמדד מהקצב (או מ-45), כמו "מאחר ב-22 ימים" באפיון.
function lateInfo_(c, days, today) {
  var info = { rhythm: 0, daysSinceOrder: null, lateBy: 0, isLate: false };
  if (!days || !days.length) return info;
  var rhythm = rhythmFor_(orderEvents_(days));
  var since = daysBetween_(days[days.length - 1], today);
  info.rhythm = rhythm;
  info.daysSinceOrder = since;
  if (c.stage !== 'לקוח' || (c.followUp && c.followUp > today)) return info;
  var threshold = rhythm ? Math.max(Math.round(rhythm * 1.5), rhythm + 7) : DEFAULT_LATE_DAYS;
  if (since > threshold) {
    info.isLate = true;
    info.lateBy = since - (rhythm || DEFAULT_LATE_DAYS);
  }
  return info;
}

// "הזמנות" ו"הזמנה אחרונה" — תמיד מההיסטוריה, כך שביטול או חיבור לא משאירים מונה שגוי
function recomputeOrders_(model, c) {
  var n = 0;
  var last = '';
  model.activities.forEach(function (a) {
    if (a.contactId !== c.id || a.type !== 'הזמנה') return;
    n++;
    var d = String(a.at).slice(0, 10);
    if (d > last) last = d;
  });
  c.orders = String(n);
  c.lastOrder = last;
}

// הזמנה ידנית (נוצרה ע"י "עמוד", בלי מספר) של איש הקשר באותו יום
function manualOrderOn_(model, contactId, day) {
  for (var i = 0; i < model.activities.length; i++) {
    var a = model.activities[i];
    if (a.contactId === contactId && a.type === 'הזמנה' && !a.orderId && a.by === 'עמוד' &&
        String(a.at).slice(0, 10) === day) return a;
  }
  return null;
}

// איש קשר כפי שהעמוד מקבל אותו: שדות הגיליון, ועוד הקצב והאיחור
function contactOut_(c, byContact, today) {
  var out = publicOf_(c, CONTACT_KEYS);
  var late = lateInfo_(c, byContact[c.id], today);
  Object.keys(late).forEach(function (k) { out[k] = late[k]; });
  return out;
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

// ---------- גיליון ----------

function book_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// לשונית עם כותרות, נוצרת בפעם הראשונה. כל הכתיבה בפורמט טקסט ('@'):
// אחרת גוגל שיטס מוחק את ה-0 בטלפון והופך תאריכים למספרים.
function sheet_(book, name, headers) {
  var sh = book.getSheetByName(name) || book.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setNumberFormat('@').setValues([headers]);
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

function readRows_(sh, keys) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, keys.length).getValues().map(function (row, i) {
    var o = { _row: i + 2 };
    keys.forEach(function (k, j) { o[k] = unescape_(String(row[j] == null ? '' : row[j])); });
    return o;
  });
}

function readModel_(book) {
  var cs = sheet_(book, CONTACTS_SHEET, CONTACT_HEADERS);
  var as = sheet_(book, ACTIVITIES_SHEET, ACTIVITY_HEADERS);
  var ts = sheet_(book, TASKS_SHEET, TASK_HEADERS);
  return {
    cs: cs, as: as, ts: ts,
    contacts: readRows_(cs, CONTACT_KEYS),
    activities: readRows_(as, ACTIVITY_KEYS),
    tasks: readRows_(ts, TASK_KEYS)
  };
}

function rowOf_(o, keys) {
  return keys.map(function (k) {
    return sanitize_(o[k], k === 'quoteLink' ? 5000 : k === 'text' ? 2000 : 300);
  });
}

function writeRows_(sh, startRow, rows, width) {
  if (!rows.length) return;
  sh.getRange(startRow, 1, rows.length, width).setNumberFormat('@').setValues(rows);
}

// אנשי קשר עם _row נכתבים במקומם; חדשים ופעולות חדשות — בסוף הלשונית. פעולה
// קיימת שסומנה _dirty (הזמנה ידנית שהתחברה להזמנה מהאתר) נכתבת במקומה.
function save_(model, changedContacts, newActivities) {
  var fresh = [];
  changedContacts.forEach(function (c) {
    if (c._row) writeRows_(model.cs, c._row, [rowOf_(c, CONTACT_KEYS)], CONTACT_KEYS.length);
    else fresh.push(c);
  });
  var next = model.cs.getLastRow() + 1;
  fresh.forEach(function (c, i) { c._row = next + i; });
  writeRows_(model.cs, next, fresh.map(function (c) { return rowOf_(c, CONTACT_KEYS); }), CONTACT_KEYS.length);
  model.activities.forEach(function (a) {
    if (a._dirty && a._row) {
      writeRows_(model.as, a._row, [rowOf_(a, ACTIVITY_KEYS)], ACTIVITY_KEYS.length);
      a._dirty = false;
    }
  });
  writeRows_(model.as, model.as.getLastRow() + 1,
    newActivities.map(function (a) { return rowOf_(a, ACTIVITY_KEYS); }), ACTIVITY_KEYS.length);
}

// משימות עם _row נכתבות במקומן; חדשות — בסוף הלשונית
function saveTasks_(model, tasks) {
  var fresh = [];
  tasks.forEach(function (t) {
    if (t._row) writeRows_(model.ts, t._row, [rowOf_(t, TASK_KEYS)], TASK_KEYS.length);
    else fresh.push(t);
  });
  var next = model.ts.getLastRow() + 1;
  fresh.forEach(function (t, i) { t._row = next + i; });
  writeRows_(model.ts, next, fresh.map(function (t) { return rowOf_(t, TASK_KEYS); }), TASK_KEYS.length);
}

function publicOf_(o, keys) {
  var out = {};
  keys.forEach(function (k) { out[k] = o[k] == null ? '' : String(o[k]); });
  return out;
}

// ---------- פעולות ----------

function handleEvent_(ev) {
  if (['lead', 'quote_request', 'order'].indexOf(ev.type) < 0) return { ok: false, error: 'bad event' };
  var model = readModel_(book_());
  var res = applyEvent_(model, ev, now_());
  if (res.skipped) return { ok: true, id: res.contact ? res.contact.id : '', duplicate: true };
  save_(model, [res.contact], res.attached ? [] : [res.activity]);
  var out = { ok: true, id: res.contact.id };
  if ((ev.type === 'lead' || ev.type === 'quote_request') && !ev.imported) {
    out.notify = inquiryMessage_(ev, res.contact);
  }
  return out;
}

function handleList_() {
  var model = readModel_(book_());
  var today = now_().date;
  var byContact = orderDaysByContact_(model.activities);
  return {
    ok: true,
    today: today,
    contacts: model.contacts.map(function (c) { return contactOut_(c, byContact, today); }),
    activities: model.activities.map(function (a) { return publicOf_(a, ACTIVITY_KEYS); }),
    tasks: model.tasks
      .filter(function (t) { return !t.done; })
      .map(function (t) { return publicOf_(t, TASK_KEYS); })
  };
}

function handleAdd_(input) {
  var phone = normalizePhone_(input.phone);
  if (!phone) return { ok: false, error: 'bad phone' };
  var name = trim_(input.name).slice(0, 200);
  var business = trim_(input.business).slice(0, 200);
  if (!name && !business) return { ok: false, error: 'name required' };
  var followUp = trim_(input.followUp);
  if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) return { ok: false, error: 'bad date' };
  var model = readModel_(book_());
  var dup = findContact_(model.contacts, phone, '');
  if (dup) return { ok: false, error: 'duplicate', id: dup.id };
  var now = now_();
  var c = blankContact_(now.stamp);
  c.name = name;
  c.business = business;
  c.phone = phone;
  c.email = trim_(input.email).slice(0, 200);
  c.source = MANUAL_SOURCES.indexOf(trim_(input.source)) >= 0 ? trim_(input.source) : 'אחר';
  c.followUp = followUp;
  model.contacts.push(c);
  var a = {
    id: newId_('A'), contactId: c.id, at: now.stamp, type: 'נוצר ידנית',
    text: trim_(input.note).slice(0, 2000), orderId: '', pdf: '', quoteLink: '', by: 'עמוד'
  };
  save_(model, [c], [a]);
  return { ok: true, contact: publicOf_(c, CONTACT_KEYS), activity: publicOf_(a, ACTIVITY_KEYS) };
}

// בודק את כל השדות לפני שמשנה משהו — שגיאה אחת משאירה את איש הקשר כמו שהיה
function applyFields_(model, c, f) {
  var next = {};
  if ('stage' in f) {
    if (STAGES.indexOf(f.stage) < 0) return { ok: false, error: 'bad stage' };
    next.stage = f.stage;
  }
  if ('followUp' in f) {
    var d = trim_(f.followUp);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: 'bad date' };
    next.followUp = d;
  }
  if ('phone' in f) {
    var p = normalizePhone_(f.phone);
    if (!p && trim_(f.phone)) return { ok: false, error: 'bad phone' };
    if (p) {
      var other = findContact_(model.contacts, p, '');
      if (other && other.id !== c.id) return { ok: false, error: 'duplicate', id: other.id };
    }
    next.phone = p;
  }
  ['name', 'business', 'email', 'address'].forEach(function (k) {
    if (k in f) next[k] = trim_(f[k]).slice(0, 200);
  });
  if ('name' in next || 'business' in next) {
    var name = 'name' in next ? next.name : c.name;
    var business = 'business' in next ? next.business : c.business;
    if (!name && !business) return { ok: false, error: 'name required' };
  }
  Object.keys(next).forEach(function (k) { c[k] = next[k]; });
  return { ok: true };
}

function handleUpdate_(id, fields, activity) {
  var model = readModel_(book_());
  var c = contactById_(model, id);
  if (!c) return { ok: false, error: 'not found' };
  if (activity && PAGE_ACTIVITY_TYPES.indexOf(trim_(activity.type)) < 0) {
    return { ok: false, error: 'bad activity' };
  }
  var check = applyFields_(model, c, fields || {});
  if (!check.ok) return check;
  var now = now_();
  var added = [];
  if (activity) {
    added.push({
      id: newId_('A'), contactId: c.id, at: now.stamp, type: trim_(activity.type),
      text: trim_(activity.text).slice(0, 2000), orderId: '', pdf: '', quoteLink: '', by: 'עמוד'
    });
    c.lastActivity = now.stamp;
    model.activities.push(added[0]);
    // התוצאה "הזמין" — הזמנה לכל דבר
    if (added[0].type === 'הזמנה') recomputeOrders_(model, c);
  }
  save_(model, [c], added);
  return {
    ok: true,
    contact: contactOut_(c, orderDaysByContact_(model.activities), now.date),
    activity: added.length ? publicOf_(added[0], ACTIVITY_KEYS) : null
  };
}

// הזמנה שרועי רושם בעצמו, בלי התוכן שלה: תאריך עד היום (ברירת מחדל היום), הערה לא חובה.
// השעה ברישום — עכשיו כשהתאריך הוא היום, ו-12:00 בתאריך אחר.
function handleOrder_(id, input) {
  var model = readModel_(book_());
  var c = contactById_(model, id);
  if (!c) return { ok: false, error: 'not found' };
  var now = now_();
  var day = trim_(input.date) || now.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > now.date) return { ok: false, error: 'bad date' };
  var a = {
    id: newId_('A'), contactId: c.id, at: day === now.date ? now.stamp : day + ' 12:00',
    type: 'הזמנה', text: trim_(input.note).slice(0, 200), orderId: '', pdf: '', quoteLink: '', by: 'עמוד'
  };
  model.activities.push(a);
  c.stage = 'לקוח';
  c.followUp = '';
  c.lastActivity = now.stamp;
  recomputeOrders_(model, c);
  save_(model, [c], [a]);
  return {
    ok: true,
    contact: contactOut_(c, orderDaysByContact_(model.activities), now.date),
    activity: publicOf_(a, ACTIVITY_KEYS)
  };
}

// ביטול הזמנה שנרשמה בטעות — רק ידנית ובלי מספר. השלב לא משתנה.
function handleOrderCancel_(activityId) {
  var model = readModel_(book_());
  var a = null;
  for (var i = 0; i < model.activities.length; i++) {
    if (model.activities[i].id === activityId) { a = model.activities[i]; break; }
  }
  if (!a) return { ok: false, error: 'not found' };
  if (a.type !== 'הזמנה' || a.by !== 'עמוד' || a.orderId) return { ok: false, error: 'not cancellable' };
  var c = contactById_(model, a.contactId);
  model.as.deleteRow(a._row);
  model.activities.splice(model.activities.indexOf(a), 1);
  if (!c) return { ok: true };
  recomputeOrders_(model, c);
  save_(model, [c], []);
  return { ok: true, contact: contactOut_(c, orderDaysByContact_(model.activities), now_().date) };
}

function handleDelete_(id) {
  var model = readModel_(book_());
  var c = contactById_(model, id);
  if (!c) return { ok: false, error: 'not found' };
  // מלמטה למעלה, כדי שמחיקת שורה לא תזיז את השורות שעוד לא נמחקו
  var rowsOf = function (list) {
    return list
      .filter(function (x) { return x.contactId === id; })
      .map(function (x) { return x._row; })
      .sort(function (a, b) { return b - a; });
  };
  var rows = rowsOf(model.activities);
  rows.forEach(function (r) { model.as.deleteRow(r); });
  rowsOf(model.tasks).forEach(function (r) { model.ts.deleteRow(r); });
  model.cs.deleteRow(c._row);
  return { ok: true, deleted: rows.length };
}

// ---------- משימות ----------

function taskById_(model, id) {
  for (var i = 0; i < model.tasks.length; i++) {
    if (model.tasks[i].id === id) return model.tasks[i];
  }
  return null;
}

// משימה שהשעה שלה כבר עברה כשנוצרה או נערכה — מסומנת כנשלחה, בלי לשלוח
function remindedFor_(t, now) {
  return t.time && (t.due + ' ' + t.time) <= now.stamp ? now.stamp : '';
}

// בודק טקסט, תאריך ושעה לפני שמשנה משהו — שגיאה אחת משאירה את המשימה כמו שהייתה
function taskFields_(t, f) {
  var next = {};
  if ('text' in f) {
    var text = trim_(f.text).slice(0, 300);
    if (!text) return { ok: false, error: 'text required' };
    next.text = text;
  }
  if ('due' in f) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trim_(f.due))) return { ok: false, error: 'bad date' };
    next.due = trim_(f.due);
  }
  if ('time' in f) {
    var time = trim_(f.time);
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: 'bad time' };
    next.time = time;
  }
  Object.keys(next).forEach(function (k) { t[k] = next[k]; });
  return { ok: true };
}

function handleTaskAdd_(input) {
  var model = readModel_(book_());
  var contactId = trim_(input.contactId);
  if (contactId && !contactById_(model, contactId)) return { ok: false, error: 'not found' };
  var now = now_();
  var t = { id: newId_('T'), contactId: contactId, text: '', due: '', time: '', done: '', created: now.stamp, reminded: '' };
  var check = taskFields_(t, { text: input.text, due: input.due, time: input.time || '' });
  if (!check.ok) return check;
  t.reminded = remindedFor_(t, now);
  model.tasks.push(t);
  saveTasks_(model, [t]);
  return { ok: true, task: publicOf_(t, TASK_KEYS) };
}

// fields: text, due, time, done (true = בוצעה, false = נפתחת שוב). משימה על לקוח נרשמת
// בהיסטוריה שלו כשהיא נסגרת, והרישום נמחק כשהיא נפתחת שוב ("בטל" בעמוד).
function handleTaskUpdate_(id, fields) {
  var model = readModel_(book_());
  var t = taskById_(model, id);
  if (!t) return { ok: false, error: 'not found' };
  var now = now_();
  var whenBefore = t.due + ' ' + t.time;
  var check = taskFields_(t, fields);
  if (!check.ok) return check;
  if (t.due + ' ' + t.time !== whenBefore) t.reminded = remindedFor_(t, now);
  var out = { ok: true };
  var c = t.contactId ? contactById_(model, t.contactId) : null;
  if (fields.done === true && !t.done) {
    t.done = now.stamp;
    if (c) {
      var a = {
        id: newId_('A'), contactId: c.id, at: now.stamp, type: 'משימה',
        text: 'בוצעה: ' + t.text, orderId: '', pdf: '', quoteLink: '', by: 'עמוד'
      };
      model.activities.push(a);
      c.lastActivity = now.stamp;
      save_(model, [c], [a]);
      out.activity = publicOf_(a, ACTIVITY_KEYS);
    }
  } else if (fields.done === false && t.done) {
    t.done = '';
    if (c) {
      var text = 'בוצעה: ' + t.text;
      for (var i = model.activities.length - 1; i >= 0; i--) {
        var x = model.activities[i];
        if (x.contactId === c.id && x.type === 'משימה' && x.text === text) {
          model.as.deleteRow(x._row);
          model.activities.splice(i, 1);
          out.removedActivityId = x.id;
          break;
        }
      }
    }
  }
  saveTasks_(model, [t]);
  out.task = publicOf_(t, TASK_KEYS);
  if (c) out.contact = contactOut_(c, orderDaysByContact_(model.activities), now.date);
  return out;
}

function handleTaskDelete_(id) {
  var model = readModel_(book_());
  var t = taskById_(model, id);
  if (!t) return { ok: false, error: 'not found' };
  model.ts.deleteRow(t._row);
  return { ok: true };
}

function readOrderRows_() {
  var sh = SpreadsheetApp.openById(ORDERS_SPREADSHEET_ID).getSheetByName(ORDERS_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return orderRowsFromValues_(sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues());
}

// ברירת המחדל היא הרצה יבשה — כתיבה רק כשהעמוד שולח dryRun: false במפורש
function handleImport_(dryRun) {
  var model = readModel_(book_());
  var rows = readOrderRows_();
  if (dryRun) {
    var copy = {
      contacts: JSON.parse(JSON.stringify(model.contacts)),
      activities: JSON.parse(JSON.stringify(model.activities))
    };
    return { ok: true, dryRun: true, summary: buildImport_(copy, rows, now_()).summary };
  }
  var before = model.activities.length;
  var res = buildImport_(model, rows, now_());
  var changed = model.contacts.filter(function (c) { return res.touched[c.id]; });
  save_(model, changed, model.activities.slice(before));
  return { ok: true, dryRun: false, summary: res.summary };
}

// ---------- התראות ----------

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cmp_(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function formatPhone_(d) {
  d = String(d || '');
  if (/^0[57]\d{8}$/.test(d)) return d.slice(0, 3) + '-' + d.slice(3);
  if (/^0[2-489]\d{7}$/.test(d)) return d.slice(0, 2) + '-' + d.slice(2);
  return d;
}

function displayName_(c) {
  return trim_(c.business) || trim_(c.name) || formatPhone_(c.phone) || 'ללא שם';
}

// דקות מאז "תחילת הזמן" — להשוואת חותמות YYYY-MM-DD HH:mm, גם מעבר לחצות
function minutesOf_(stamp) {
  var t = String(stamp).slice(11, 16).split(':');
  return dayNum_(stamp) * 1440 + Number(t[0] || 0) * 60 + Number(t[1] || 0);
}

// 0 = ראשון … 6 = שבת
function weekday_(day) {
  return new Date(dayNum_(day) * 86400000).getUTCDay();
}

function lateDays_(n) {
  return n === 1 ? 'באיחור יום' : 'באיחור ' + n + ' ימים';
}

// אותו סדר כמו "לטיפול" בעמוד: חדשים, באיחור, של היום
function todoGroup_(c, today) {
  if (c.stage === 'חדש') return 0;
  return c.followUp && c.followUp < today ? 1 : 2;
}

// טלגרם על פנייה חדשה: מי, טלפון (טלגרם הופך מספר בינלאומי ללחיץ) ומה ביקש
function inquiryMessage_(ev, c) {
  var lines = [ev.type === 'quote_request' ? 'בקשת הצעת מחיר' : 'פנייה חדשה מהאתר'];
  var who = [trim_(c.business), trim_(c.name)].filter(function (x) { return x; }).join(' · ');
  if (who) lines.push(who);
  if (c.phone) lines.push(/^0\d+$/.test(c.phone) ? '+972' + c.phone.slice(1) : c.phone);
  var what = ev.type === 'quote_request'
    ? (trim_(ev.totalItems) ? trim_(ev.totalItems) + ' פריטים' : '')
    : [trim_(ev.subject), trim_(ev.message).split('\n')[0]].filter(function (x) { return x; }).join(' — ');
  if (what) lines.push(what.slice(0, 200));
  return { text: lines.join('\n'), button: 'פתח בכרטיס', url: CRM_PAGE_URL + '#c=' + c.id };
}

// משימות שהגיע זמן התזכורת שלהן. send — לשלוח עכשיו; expire — עברו יותר משעתיים
// מהשעה (אחרי תקלה): מסמנים כנשלחו בלי לשלוח, כדי לא לשלוח תזכורת ישנה
function dueReminders_(tasks, now) {
  var out = { send: [], expire: [] };
  tasks.forEach(function (t) {
    if (t.done || !t.time || t.reminded) return;
    var when = t.due + ' ' + t.time;
    if (when > now.stamp) return;
    var late = minutesOf_(now.stamp) - minutesOf_(when);
    (late > REMIND_RETRY_MINUTES ? out.expire : out.send).push(t);
  });
  return out;
}

function reminderMessage_(t, c, now) {
  var late = minutesOf_(now.stamp) - minutesOf_(t.due + ' ' + t.time) > REMIND_LATE_MINUTES;
  var text = 'תזכורת: ' + t.text + (late ? ' (באיחור)' : '') + (c ? '\n' + displayName_(c) : '');
  return c
    ? { text: text, button: 'פתח בכרטיס', url: CRM_PAGE_URL + '#c=' + c.id }
    : { text: text, button: 'פתח את ה-CRM', url: CRM_PAGE_URL };
}

// סיכום הבוקר: פעם ביום, מראשון עד שישי, בריצה הראשונה בין 07:30 ל-12:00
function digestDue_(now, lastSent) {
  var time = now.stamp.slice(11, 16);
  return weekday_(now.date) !== 6 && time >= DIGEST_FROM && time < DIGEST_UNTIL && lastSent !== now.date;
}

// סיכום הבוקר — null כשאין שום דבר לטיפול
function digestFor_(model, now) {
  var today = now.date;
  var tasks = model.tasks
    .filter(function (t) { return !t.done && t.due <= today; })
    .sort(function (a, b) {
      return cmp_(a.due, b.due) || (a.time ? 1 : 0) - (b.time ? 1 : 0) || cmp_(a.time, b.time);
    });
  var todo = model.contacts
    .filter(function (c) {
      if (c.stage === 'לא רלוונטי') return false;
      return c.followUp ? c.followUp <= today : c.stage === 'חדש';
    })
    .sort(function (a, b) {
      var ga = todoGroup_(a, today);
      var gb = todoGroup_(b, today);
      if (ga !== gb) return ga - gb;
      if (ga === 0) return cmp_(b.created, a.created);
      if (ga === 1) return cmp_(a.followUp, b.followUp);
      return 0;
    });
  var byContact = orderDaysByContact_(model.activities);
  var late = model.contacts
    .map(function (c) { return { c: c, info: lateInfo_(c, byContact[c.id], today) }; })
    .filter(function (x) { return x.info.isLate; })
    .sort(function (a, b) { return b.info.lateBy - a.info.lateBy; });
  if (!tasks.length && !todo.length && !late.length) return null;

  var link = function (c) { return CRM_PAGE_URL + '#c=' + c.id; };
  var sections = [];
  if (tasks.length) {
    sections.push({ title: 'משימות', items: tasks.map(function (t) {
      var c = t.contactId ? contactById_(model, t.contactId) : null;
      var when = t.due < today ? lateDays_(daysBetween_(t.due, today)) : 'היום' + (t.time ? ' ' + t.time : '');
      return { name: t.text, url: c ? link(c) : CRM_PAGE_URL, detail: (c ? displayName_(c) + ' · ' : '') + when };
    }) });
  }
  if (todo.length) {
    sections.push({ title: 'לחזור', items: todo.map(function (c) {
      var when = c.followUp && c.followUp < today ? lateDays_(daysBetween_(c.followUp, today)) : 'היום';
      return { name: displayName_(c), url: link(c), detail: (c.stage === 'חדש' ? 'ליד חדש · ' : '') + when };
    }) });
  }
  if (late.length) {
    sections.push({ title: 'לא הזמינו', more: Math.max(0, late.length - 10), items: late.slice(0, 10).map(function (x) {
      return { name: displayName_(x.c), url: link(x.c),
        detail: 'אחרונה לפני ' + x.info.daysSinceOrder + ' ימים' +
          (x.info.rhythm ? ' (בדרך כלל כל ' + x.info.rhythm + ')' : '') };
    }) });
  }

  var parts = [];
  if (tasks.length) parts.push(tasks.length === 1 ? 'משימה אחת' : tasks.length + ' משימות');
  if (todo.length) parts.push(todo.length + ' לחזור');
  if (late.length) parts.push(late.length + ' לא הזמינו');
  var text = [];
  var html = ['<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">'];
  var tg = ['בוקר טוב — ' + parts.join(' · ')];
  sections.forEach(function (s) {
    text.push(s.title + ':');
    html.push('<h3 style="margin:16px 0 6px">' + esc_(s.title) + '</h3><ul style="margin:0;padding-inline-start:18px">');
    tg.push('', s.title + ':');
    s.items.forEach(function (it, i) {
      text.push('• ' + it.name + ' — ' + it.detail + '\n  ' + it.url);
      html.push('<li><a href="' + esc_(it.url) + '">' + esc_(it.name) + '</a> — ' + esc_(it.detail) + '</li>');
      if (i < 5) tg.push('• ' + it.name + ' — ' + it.detail);
    });
    if (s.more) {
      text.push('ועוד ' + s.more);
      html.push('<li>ועוד ' + s.more + '</li>');
    }
    var rest = Math.max(0, s.items.length - 5) + (s.more || 0);
    if (rest) tg.push('ועוד ' + rest);
    html.push('</ul>');
    text.push('');
  });
  text.push('ה-CRM: ' + CRM_PAGE_URL);
  html.push('<p style="margin-top:16px"><a href="' + CRM_PAGE_URL + '">פתח את ה-CRM</a></p></div>');
  return {
    subject: 'CRM — ' + parts.join(' · '),
    text: text.join('\n'),
    html: html.join(''),
    telegram: tg.join('\n')
  };
}

// שליחה לטלגרם. false כשאין טוקן או צ'אט, או כשהשליחה נכשלה — כולל HTTP 200 בלי ok
// בגוף התשובה (הלקח מסבב 62). הטוקן לא נכתב ליומן.
function telegramSend_(text, buttonText, url) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_TOKEN');
  var chat = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chat) return false;
  var body = { chat_id: chat, text: String(text).slice(0, 4000), disable_web_page_preview: true };
  if (buttonText && url) body.reply_markup = { inline_keyboard: [[{ text: buttonText, url: url }]] };
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify(body)
    });
    var parsed = JSON.parse(res.getContentText());
    if (parsed && parsed.ok === true) return true;
    Logger.log('Telegram: ' + res.getContentText().slice(0, 200));
  } catch (e) {
    Logger.log('Telegram: ' + e);
  }
  return false;
}

function telegramGet_(token, method) {
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, { muteHttpExceptions: true });
  try {
    return JSON.parse(res.getContentText());
  } catch (e) {
    return { ok: false };
  }
}

// הצ'אט הפרטי מההודעה האחרונה שנשלחה לבוט
function chatFromUpdates_(upd) {
  var list = (upd && upd.result) || [];
  for (var i = list.length - 1; i >= 0; i--) {
    var m = list[i].message || list[i].edited_message;
    if (m && m.chat && m.chat.type === 'private') return String(m.chat.id);
  }
  return '';
}

// טריגר זמן, כל 5 דקות (נוצר ב-setupNotifications): תזכורות למשימות עם שעה, וסיכום הבוקר.
// טריגר מריץ את הקוד השמור בפרויקט, ולא גרסה פרוסה.
function tick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var now = now_();
    var model = readModel_(book_());
    var due = dueReminders_(model.tasks, now);
    var changed = [];
    due.expire.forEach(function (t) {
      t.reminded = now.stamp;
      changed.push(t);
    });
    due.send.forEach(function (t) {
      var msg = reminderMessage_(t, t.contactId ? contactById_(model, t.contactId) : null, now);
      if (telegramSend_(msg.text, msg.button, msg.url)) {
        t.reminded = now.stamp;
        changed.push(t);
      }
    });
    if (changed.length) saveTasks_(model, changed);
    var props = PropertiesService.getScriptProperties();
    if (digestDue_(now, props.getProperty('LAST_DIGEST'))) {
      props.setProperty('LAST_DIGEST', now.date);
      var d = digestFor_(model, now);
      if (d) {
        try {
          MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: d.subject, body: d.text, htmlBody: d.html });
        } catch (e) {
          Logger.log('CRM digest: ' + e);
        }
        telegramSend_(d.telegram, 'פתח את ה-CRM', CRM_PAGE_URL);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

// הרצה ידנית אחת מהעורך, אחרי ש-TELEGRAM_TOKEN הודבק ב-Script Properties ונשלחה לבוט הודעה.
// מבקשת את ההרשאות (רשת, מייל, טריגרים), מנתקת webhook ישן, שומרת את הצ'אט, שולחת
// הודעת בדיקה ויוצרת את טריגר ה-tick. אפשר להריץ שוב — הטריגר לא מוכפל.
function setupNotifications() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_TOKEN');
  if (!token) throw new Error('חסר TELEGRAM_TOKEN בהגדרות הפרויקט (Script Properties).');
  var info = telegramGet_(token, 'getWebhookInfo');
  if (!info.ok) throw new Error('הטוקן לא תקין — בדקו אותו ב-BotFather.');
  if (info.result && info.result.url) telegramGet_(token, 'deleteWebhook');
  var chat = chatFromUpdates_(telegramGet_(token, 'getUpdates'));
  if (!chat) throw new Error('שלחו לבוט הודעה כלשהי בטלגרם, והריצו שוב.');
  props.setProperty('TELEGRAM_CHAT_ID', chat);
  if (!telegramSend_('ה-CRM מחובר. מכאן יגיעו ההתראות.', 'פתח את ה-CRM', CRM_PAGE_URL)) {
    throw new Error('הודעת הבדיקה לא נשלחה.');
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  MailApp.getRemainingDailyQuota();
  Logger.log('ההתראות מחוברות.');
}

// ---------- כניסה ----------

// מציין מקום (PUT_...) או ערך קצר — חוסם הכל, כדי שהדבקת קובץ הריפו לענן
// לא תפתח את הנתונים
function authorized_(expected, given) {
  if (typeof expected !== 'string' || expected.indexOf('PUT_') === 0 || expected.length < 12) return false;
  return typeof given === 'string' && given === expected;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'busy' };
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// בדיקת חיים בלבד, בלי נתונים
function doGet() {
  return ContentService.createTextOutput('CRM — פעיל');
}

function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) || '';
  if (!raw || raw.length > 100000) return json_({ ok: false, error: 'bad request' });
  var body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    return json_({ ok: false, error: 'bad request' });
  }
  try {
    if (body.action === 'event') {
      if (!authorized_(CRM_SECRET, body.secret)) return json_({ ok: false, error: 'unauthorized' });
      var res = withLock_(function () { return handleEvent_(body.event || {}); });
      // טלגרם מחוץ לנעילה: שליחה איטית לא מעכבת שמירות אחרות, וכשל בה לא מפיל את האירוע
      if (res.notify) {
        telegramSend_(res.notify.text, res.notify.button, res.notify.url);
        delete res.notify;
      }
      return json_(res);
    }
    if (!authorized_(CRM_PASSWORD, body.password)) return json_({ ok: false, error: 'unauthorized' });
    switch (body.action) {
      case 'list': return json_(handleList_());
      case 'add': return json_(withLock_(function () { return handleAdd_(body.contact || {}); }));
      case 'update': return json_(withLock_(function () { return handleUpdate_(body.id, body.fields || {}, null); }));
      case 'log': return json_(withLock_(function () { return handleUpdate_(body.id, body.fields || {}, body.activity || null); }));
      case 'delete': return json_(withLock_(function () { return handleDelete_(body.id); }));
      case 'import': return json_(withLock_(function () { return handleImport_(body.dryRun !== false); }));
      case 'order': return json_(withLock_(function () { return handleOrder_(body.id, body.order || {}); }));
      case 'order_cancel': return json_(withLock_(function () { return handleOrderCancel_(body.activityId); }));
      case 'task_add': return json_(withLock_(function () { return handleTaskAdd_(body.task || {}); }));
      case 'task_update': return json_(withLock_(function () { return handleTaskUpdate_(body.id, body.fields || {}); }));
      case 'task_delete': return json_(withLock_(function () { return handleTaskDelete_(body.id); }));
    }
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    Logger.log('CRM: ' + err);
    return json_({ ok: false, error: 'server error' });
  }
}

// הרצה ידנית אחת מהעורך (בחירת authorize ← הפעלה): מבקשת לאשר גישה לגיליונות
function authorize() {
  SpreadsheetApp.openById(SPREADSHEET_ID).getName();
  SpreadsheetApp.openById(ORDERS_SPREADSHEET_ID).getName();
}
