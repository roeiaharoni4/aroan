/**
 * CRM — אהרוני שיווק והפצה. סקריפט Apps Script חמישי.
 * Web app: Execute as Me, Access Anyone. הסקריפט היחיד שכותב לגיליון ה-CRM.
 *
 * מי פונה אליו:
 *  - עמוד ה-CRM (/crm-f428d7/) — עם הסיסמה: list, add, update, log, delete, import,
 *    order, order_cancel, task_add, task_update, task_delete, prices_set, orders, order_status.
 *  - דף הסוכן (/agent/) — עם הסיסמה: items, contacts, agent_data, agent_customer, quote,
 *    prices_fill, prices_set (אפיון 2026-11-15).
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

// עמודות חדשות — רק בסוף השורה, כדי שגיליון קיים לא יזוז (sheet_ משלים את הכותרות).
// rivhitNo = מספר הלקוח בריווחית; items = פריטי הזמנה מהאתר (JSON מקוצר) לקובץ הקליטה (סבב 88).
// phones = טלפונים נוספים, מנורמלים ומופרדים ברווח — מכרטיסים שמוזגו לכרטיס הזה (סבב 93).
var CONTACT_HEADERS = ['מזהה', 'שם', 'עסק', 'טלפון', 'אימייל', 'כתובת', 'שלב',
  'לחזור בתאריך', 'מקור', 'נוצר', 'פעולה אחרונה', 'הזמנות', 'הזמנה אחרונה', 'מספר לקוח בריווחית',
  'טלפונים נוספים'];
var CONTACT_KEYS = ['id', 'name', 'business', 'phone', 'email', 'address', 'stage',
  'followUp', 'source', 'created', 'lastActivity', 'orders', 'lastOrder', 'rivhitNo', 'phones'];
var PHONES_MAX = 5;
// המספרים של העסק עצמו (נייד/וואטסאפ, משרד, נוסף). הם לא מזהים לקוח: כשאין לרועי
// טלפון של לקוח הוא מקליד את שלו, וכך הזמנה של "זארה" נרשמה תחת "קר פרי" (15.11.26).
var OWN_PHONES = ['0526000158', '036346236', '0506444290'];
// השדות שדף הסוכן מקבל ב-contacts — בלי פעולות ומשימות
var AGENT_CONTACT_KEYS = ['id', 'name', 'business', 'phone', 'address', 'stage',
  'orders', 'lastOrder', 'rivhitNo', 'phones'];
var ACTIVITY_HEADERS = ['מזהה פעולה', 'מזהה איש קשר', 'תאריך', 'סוג', 'פירוט',
  'מספר הזמנה', 'PDF', 'קישור הצעה', 'נוצר ע"י', 'פריטים'];
var ACTIVITY_KEYS = ['id', 'contactId', 'at', 'type', 'text', 'orderId', 'pdf',
  'quoteLink', 'by', 'items'];
var ITEMS_MAX_LEN = 20000;
var TASKS_SHEET = 'משימות';
var TASK_HEADERS = ['מזהה', 'מזהה איש קשר', 'משימה', 'תאריך', 'שעה', 'בוצעה', 'נוצרה', 'תזכורת נשלחה'];
var TASK_KEYS = ['id', 'contactId', 'text', 'due', 'time', 'done', 'created', 'reminded'];
// פריטים מריווחית לדף הסוכן (אפיון 2026-11-09): מספר, שם ומספר קטלוגי, בלי מחירים.
// המספר הקטלוגי הוא מה שנכנס לשדה 5 בקובץ הקליטה (אפיון 2026-11-12).
var ITEMS_SHEET = 'פריטי ריווחית';
var ITEM_HEADERS = ['מספר פריט', 'שם', 'מספר קטלוגי'];
var ITEMS_MAX = 5000;
var ITEM_NAME_MAX = 100;
var CATALOG_MAX = 15;
// מחירי לקוחות (אפיון 2026-11-15): שורה לכל כרטיס+מוצר. הכתיבה האחרונה קובעת.
// productId — מזהה באתר (חדפ014) או RV-<מספר פריט> לפריט מריווחית.
var PRICES_SHEET = 'מחירי לקוחות';
var PRICE_HEADERS = ['מזהה איש קשר', 'מזהה מוצר', 'מוצר', 'מחיר', 'עודכן', 'מקור'];
var PRICE_KEYS = ['contactId', 'productId', 'name', 'price', 'updated', 'source'];
var PRICE_SET_SOURCES = ['ידני', 'העברה מהטלפון'];
var PRICE_MAX = 100000;
// סטטוס הזמנה (אפיון 2026-11-17): בעמודת "סטטוס" בגיליון ההזמנות, וחותמת ב"סטטוס עודכן"
// בסוף השורה. "בטיפול" — ערך ישן מהרשימה הנפתחת — נחשב "חדשה".
var ORDER_STATUSES = ['חדשה', 'נקלטה בריווחית', 'סופקה', 'חשבונית הופקה', 'בוטלה'];
var ORDER_STATUS_AT = 'סטטוס עודכן';
// הזמנות מלפני המעקב לא נחשבות "תקועות" בסיכום הבוקר
var ORDERS_STATUS_SINCE = '2026-11-17';

// מספר קטלוגי תקין או ''. אותו כלל כמו catalogCode ב-js/rivhit-core.js.
function catalogCode_(v) {
  var s = trim_(v);
  return s.length <= CATALOG_MAX && /^[^\t\r\n"|]+$/.test(s) ? s : '';
}

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
    orders: '0', lastOrder: '', rivhitNo: '', phones: ''
  };
}

// הטלפונים הנוספים של איש קשר (סבב 93), מנורמלים
function extraPhones_(c) {
  return trim_(c && c.phones).split(/[\s,]+/).map(normalizePhone_).filter(Boolean);
}

// הטלפון הראשי או אחד הנוספים
function hasPhone_(c, phone) {
  return !!phone && (c.phone === phone || extraPhones_(c).indexOf(phone) >= 0);
}

// פריטי ההזמנה כפי שסקריפט ההזמנות שולח אותם ⇒ JSON מקוצר לעמודת "פריטים".
// רק מה שקובץ הקליטה לריווחית צריך; פריט בלי מזהה או בלי כמות נופל.
function itemsJson_(items) {
  if (!items || !items.length) return '';
  var out = [];
  for (var i = 0; i < items.length && out.length < 200; i++) {
    var it = items[i] || {};
    var qty = Number(it.qty);
    if (!trim_(it.id) || !(qty > 0)) continue;
    var price = Number(it.price);
    var o = { id: trim_(it.id).slice(0, 40), name: trim_(it.name).slice(0, 120),
      qty: qty, price: price > 0 ? price : 0 };
    // פריט מרשימת ריווחית בדף הסוכן נושא את המספר הקטלוגי שלו (אפיון 2026-11-12)
    var rv = catalogCode_(it.rivhit);
    if (rv) o.rivhit = rv;
    out.push(o);
  }
  if (!out.length) return '';
  var s = JSON.stringify(out);
  while (s.length > ITEMS_MAX_LEN && out.length) { out.pop(); s = JSON.stringify(out); }
  return s;
}

function contactById_(model, id) {
  for (var i = 0; i < model.contacts.length; i++) {
    if (model.contacts[i].id === id) return model.contacts[i];
  }
  return null;
}

// טלפון קודם — הראשי או אחד הנוספים (מכרטיס שמוזג). בלי טלפון — לפי שם העסק
// (הזמנות מדף הסוכן מגיעות לפעמים בלי טלפון). יש טלפון ואין התאמה — מחפשים לפי
// השם רק בין אנשי קשר שאין להם טלפון, כדי שלקוח שנוצר מהזמנה בלי טלפון לא ישוכפל
// כשהטלפון מגיע.
function findContact_(contacts, phone, label) {
  var i;
  if (phone) {
    for (i = 0; i < contacts.length; i++) {
      if (hasPhone_(contacts[i], phone)) return contacts[i];
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
    by: ev.by || (ev.type === 'lead' ? 'אתר' : 'הזמנות'),
    items: ev.type === 'lead' ? '' : itemsJson_(ev.items)
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
  if (OWN_PHONES.indexOf(phone) >= 0) phone = '';
  var business = trim_(ev.business);
  var name = trim_(ev.name || ev.contact);
  // דף הסוכן שולח את מזהה הכרטיס של הלקוח שנבחר — הוא גובר על כל ניחוש.
  // כרטיס שנמחק או מוזג בינתיים — זיהוי רגיל לפי טלפון ושם.
  var c = (trim_(ev.crmId) && contactById_(model, trim_(ev.crmId))) ||
    findContact_(model.contacts, phone, business || name);
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
    manual.items = activity.items;
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
// תאריך קבלה כטקסט (שורה שהוקלדה ידנית): DD/MM/YYYY HH:mm[:ss] ⇒ YYYY-MM-DD HH:mm
function stampOfCell_(s) {
  s = trim_(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 16);
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
  if (!m) return '';
  var p = function (n) { return (Number(n) < 10 ? '0' : '') + Number(n); };
  return m[3] + '-' + p(m[2]) + '-' + p(m[1]) + (m[4] ? ' ' + p(m[4]) + ':' + m[5] : ' 00:00');
}

function orderRowsFromValues_(values) {
  if (!values || values.length < 2) return [];
  var head = values[0].map(function (h) { return trim_(h); });
  var idx = {
    receivedAt: head.indexOf('תאריך קבלה'), orderId: head.indexOf('מספר הזמנה'),
    business: head.indexOf('שם העסק'), contact: head.indexOf('איש קשר'),
    phone: head.indexOf('טלפון'), address: head.indexOf('כתובת למשלוח'),
    notes: head.indexOf('הערות'), totalItems: head.indexOf('סה"כ פריטים'),
    totalPrice: head.indexOf('סה"כ לתשלום'), shipping: head.indexOf('שיטת אספקה'),
    pdf: head.indexOf('קובץ PDF'),
    status: head.indexOf('סטטוס'), statusAt: head.indexOf(ORDER_STATUS_AT)
  };
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var o = {};
    Object.keys(idx).forEach(function (k) {
      var v = idx[k] >= 0 ? row[idx[k]] : '';
      o[k] = v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm') : trim_(v);
    });
    o._row = r + 1;
    o.receivedAt = stampOfCell_(o.receivedAt);
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
  } else if (sh.getLastColumn() < headers.length) {
    // לשונית שנוצרה לפני שנוספו עמודות בסוף — משלימים רק את הכותרות החסרות
    var from = sh.getLastColumn() + 1;
    sh.getRange(1, from, 1, headers.length - from + 1).setNumberFormat('@')
      .setValues([headers.slice(from - 1)]);
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
  var ps = sheet_(book, PRICES_SHEET, PRICE_HEADERS);
  return {
    cs: cs, as: as, ts: ts, ps: ps,
    contacts: readRows_(cs, CONTACT_KEYS),
    activities: readRows_(as, ACTIVITY_KEYS),
    tasks: readRows_(ts, TASK_KEYS),
    prices: readRows_(ps, PRICE_KEYS)
  };
}

function rowOf_(o, keys) {
  return keys.map(function (k) {
    return sanitize_(o[k], k === 'items' ? ITEMS_MAX_LEN : k === 'quoteLink' ? 5000 : k === 'text' ? 2000 : 300);
  });
}

// getRange לא מרחיב את הגיליון: לשונית חדשה היא 1,000 שורות, ושורה מעבר לזה זורקת
// "The coordinates of the range are outside the dimensions of the sheet" (נמצא
// 10.11.26 — 1,838 פריטים מריווחית; כך גם אנשי קשר ופעולות כשיעברו 1,000).
function writeRows_(sh, startRow, rows, width) {
  if (!rows.length) return;
  var missing = startRow + rows.length - 1 - sh.getMaxRows();
  if (missing > 0) sh.insertRowsAfter(sh.getMaxRows(), missing);
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

// ---------- מחירי לקוחות ----------

// מחיר תקין: חיובי ועד 100,000, מעוגל לאגורות. אחרת 0.
function cleanPrice_(v) {
  var n = Number(v);
  if (!(n > 0) || n >= PRICE_MAX) return 0;
  return Math.round(n * 100) / 100;
}

function priceRow_(model, contactId, productId) {
  for (var i = 0; i < model.prices.length; i++) {
    var p = model.prices[i];
    if (!p._deleted && p.contactId === contactId && p.productId === productId) return p;
  }
  return null;
}

// כותב מחירים לכרטיס במודל, בלי לשמור. מחיר ישן יותר מהקיים לא דורס.
// opts.onlyMissing — רק מוצרים שאין להם מחיר (prices_fill).
// opts.allowDelete — מחיר ריק או 0 מוחק את השורה (prices_set). מחזיר כמה שורות השתנו.
function learnPrices_(model, contactId, items, source, at, opts) {
  opts = opts || {};
  if (!model.prices) return 0;
  var changed = 0;
  (items || []).slice(0, 500).forEach(function (it) {
    it = it || {};
    var pid = trim_(it.productId || it.id).slice(0, 40);
    if (!pid) return;
    var price = cleanPrice_(it.price);
    var row = priceRow_(model, contactId, pid);
    if (!price) {
      if (opts.allowDelete && row) { row._deleted = true; changed++; }
      return;
    }
    var name = trim_(it.name).slice(0, 120);
    if (row) {
      if (opts.onlyMissing || trim_(row.updated) > at) return;
      row.price = String(price);
      if (name) row.name = name;
      row.updated = at;
      row.source = source;
      row._dirty = true;
    } else {
      model.prices.push({ contactId: contactId, productId: pid, name: name,
        price: String(price), updated: at, source: source });
    }
    changed++;
  });
  return changed;
}

// שורות שהשתנו — במקומן; חדשות — בסוף; שנמחקו — מלמטה למעלה, כי מחיקה מזיזה שורות
function savePrices_(model) {
  if (!model.ps) return;
  var fresh = [];
  model.prices.forEach(function (p) {
    if (p._deleted) return;
    if (p._row && p._dirty) {
      writeRows_(model.ps, p._row, [rowOf_(p, PRICE_KEYS)], PRICE_KEYS.length);
      p._dirty = false;
    } else if (!p._row) {
      fresh.push(p);
    }
  });
  var next = model.ps.getLastRow() + 1;
  fresh.forEach(function (p, i) { p._row = next + i; });
  writeRows_(model.ps, next, fresh.map(function (p) { return rowOf_(p, PRICE_KEYS); }), PRICE_KEYS.length);
  model.prices
    .filter(function (p) { return p._deleted && p._row; })
    .map(function (p) { return p._row; })
    .sort(function (a, b) { return b - a; })
    .forEach(function (r) { model.ps.deleteRow(r); });
  model.prices = model.prices.filter(function (p) { return !p._deleted; });
}

function pricesOf_(model, contactId) {
  return model.prices
    .filter(function (p) { return p.contactId === contactId; })
    .map(function (p) { return publicOf_(p, PRICE_KEYS); });
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
  // rivhitNo — לסקריפט ההזמנות, לקובץ הקליטה לריווחית שמצורף למייל
  if (res.skipped) {
    return { ok: true, id: res.contact ? res.contact.id : '', duplicate: true,
      rivhitNo: res.contact ? trim_(res.contact.rivhitNo) : '' };
  }
  // הזמנה מדף הסוכן: המחירים שנשלחו בה הם המחירים שסוכמו עם הלקוח. מהאתר — לא:
  // בקטלוג העסקי אין מחירים, וה-price שם בא מהמחירון הכללי.
  if (ev.type === 'order' && ev.via === 'דף הסוכן') {
    learnPrices_(model, res.contact.id, ev.items, 'הזמנה', res.activity.at);
  }
  save_(model, [res.contact], res.attached ? [] : [res.activity]);
  savePrices_(model);
  var out = { ok: true, id: res.contact.id, rivhitNo: trim_(res.contact.rivhitNo) };
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
      .map(function (t) { return publicOf_(t, TASK_KEYS); }),
    prices: model.prices.map(function (p) { return publicOf_(p, PRICE_KEYS); })
  };
}

// רשימת הלקוחות לבורר בדף הסוכן — קלה, כי היא נטענת בטלפון בכל פתיחה
function handleContacts_() {
  var model = readModel_(book_());
  return {
    ok: true,
    contacts: model.contacts.map(function (c) { return publicOf_(c, AGENT_CONTACT_KEYS); })
  };
}

// כל מה שדף הסוכן צריך, בקריאה אחת (אפיון 2026-11-15): הלקוחות, המחירים, ההזמנה
// וההצעה האחרונות של כל כרטיס, ו-50 ההצעות האחרונות לחלון "היסטוריה".
function handleAgentData_() {
  var model = readModel_(book_());
  var last = {};
  var quotes = [];
  model.activities.forEach(function (a) {
    if (!a.items || (a.type !== 'הזמנה' && a.type !== 'הצעת מחיר')) return;
    var items;
    try { items = JSON.parse(a.items); } catch (e) { return; }
    if (!items || !items.length) return;
    var key = a.type === 'הזמנה' ? 'order' : 'quote';
    // הזמנה מהאתר: המחיר בה הוא מהמחירון הכללי — "ההזמנה הקודמת" לא תדרוס מחיר מוסכם
    if (key === 'order' && String(a.orderId).indexOf('SL-') !== 0) {
      items = items.map(function (it) {
        var o = {};
        Object.keys(it).forEach(function (k) { o[k] = it[k]; });
        o.price = 0;
        return o;
      });
    }
    var slot = last[a.contactId] || (last[a.contactId] = {});
    if (!slot[key] || a.at >= slot[key].at) slot[key] = { at: a.at, orderId: a.orderId, items: items };
    if (key === 'quote') {
      quotes.push({ contactId: a.contactId, at: a.at, orderId: a.orderId, text: a.text, items: items });
    }
  });
  quotes.sort(function (x, y) { return x.at < y.at ? 1 : x.at > y.at ? -1 : 0; });
  return {
    ok: true,
    contacts: model.contacts.map(function (c) { return publicOf_(c, AGENT_CONTACT_KEYS); }),
    prices: model.prices.map(function (p) { return [p.contactId, p.productId, p.price, p.updated]; }),
    last: last,
    quotes: quotes.slice(0, 50)
  };
}

// עריכה בכרטיס ב-CRM (ידני) והמעבר מהטלפון. onlyMissing — prices_fill: רק מוצרים בלי מחיר.
function handlePricesSet_(id, prices, source, onlyMissing) {
  source = trim_(source);
  if (PRICE_SET_SOURCES.indexOf(source) < 0) return { ok: false, error: 'bad source' };
  if (!Array.isArray(prices) || !prices.length) return { ok: false, error: 'no prices' };
  var model = readModel_(book_());
  var c = contactById_(model, trim_(id));
  if (!c) return { ok: false, error: 'not found' };
  var changed = learnPrices_(model, c.id, prices, source, now_().stamp,
    { onlyMissing: !!onlyMissing, allowDelete: !onlyMissing });
  savePrices_(model);
  return { ok: true, changed: changed, prices: pricesOf_(model, c.id) };
}

// כרטיס חדש מדף הסוכן (אפיון 2026-11-15). טלפון לא חובה. כרטיס קיים באותו טלפון או
// באותו שם מוחזר במקום כרטיס חדש — כך גם ניסיון חוזר מהתור בטלפון לא משכפל.
function handleAgentCustomer_(input) {
  input = input || {};
  var name = trim_(input.name).slice(0, 200);
  if (!name) return { ok: false, error: 'name required' };
  var phone = normalizePhone_(input.phone);
  if (OWN_PHONES.indexOf(phone) >= 0) phone = '';
  var model = readModel_(book_());
  var key = nameKey_(name);
  var dup = (phone && findContact_(model.contacts, phone, '')) ||
    model.contacts.filter(function (c) { return nameKey_(c.business || c.name) === key; })[0] || null;
  if (dup) return { ok: true, id: dup.id, existing: true };
  var now = now_();
  var c = blankContact_(now.stamp);
  c.business = name;
  c.name = trim_(input.contact).slice(0, 200);
  c.phone = phone;
  c.address = trim_(input.address).slice(0, 200);
  c.source = 'דף הסוכן';
  model.contacts.push(c);
  var a = { id: newId_('A'), contactId: c.id, at: now.stamp, type: 'נוצר בדף הסוכן',
    text: '', orderId: '', pdf: '', quoteLink: '', by: 'דף הסוכן', items: '' };
  save_(model, [c], [a]);
  return { ok: true, id: c.id, existing: false };
}

// הצעת מחיר שהודפסה בדף הסוכן. אותו quoteId פעמיים (ניסיון חוזר מהתור) — פעם אחת.
// השלב עובר ל"נשלחה הצעה" מכל שלב חוץ מ"לקוח"; התאריך "לחזור" לא משתנה.
function handleQuote_(input) {
  input = input || {};
  var model = readModel_(book_());
  var c = contactById_(model, trim_(input.id));
  if (!c) return { ok: false, error: 'not found' };
  var quoteId = trim_(input.quoteId);
  if (!/^Q-\d{8}-\d{3,6}$/.test(quoteId)) return { ok: false, error: 'bad quote' };
  for (var i = 0; i < model.activities.length; i++) {
    if (model.activities[i].orderId === quoteId) return { ok: true, duplicate: true };
  }
  var items = itemsJson_(input.items);
  if (!items) return { ok: false, error: 'no items' };
  var now = now_();
  var at = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trim_(input.at)) ? trim_(input.at) : now.stamp;
  var total = Number(input.total);
  var a = {
    id: newId_('A'), contactId: c.id, at: at, type: 'הצעת מחיר',
    text: [JSON.parse(items).length + ' פריטים', total > 0 ? total.toFixed(2) + ' ₪' : '', 'מדף הסוכן']
      .filter(Boolean).join(' · '),
    orderId: quoteId, pdf: '', quoteLink: '', by: 'דף הסוכן', items: items
  };
  model.activities.push(a);
  if (c.stage !== 'לקוח') c.stage = 'נשלחה הצעה';
  if (!c.lastActivity || at > c.lastActivity) c.lastActivity = at;
  learnPrices_(model, c.id, input.items, 'הצעה', at);
  save_(model, [c], [a]);
  savePrices_(model);
  return { ok: true };
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
  if ('rivhitNo' in f) {
    // מספר כרטיס בריווחית: עד 5 ספרות (שדה 10 בקובץ הקליטה), ריק = לקוח מזדמן
    var rv = trim_(f.rivhitNo);
    if (rv && !(/^\d{1,5}$/.test(rv) && Number(rv) > 0)) return { ok: false, error: 'bad rivhit' };
    next.rivhitNo = rv;
  }
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
  rowsOf(model.prices).forEach(function (r) { model.ps.deleteRow(r); });
  model.cs.deleteRow(c._row);
  return { ok: true, deleted: rows.length };
}

// ---------- מיזוג כרטיסים (סבב 93) ----------
// הזמנה מהאתר מטלפון שה-CRM לא הכיר פתחה כרטיס חדש, ורועי מקשר אותה ללקוח הקיים.
// הפעולות והמשימות עוברות, שדות ריקים מושלמים, והטלפונים של הכרטיס שנמחק נשמרים
// כטלפונים נוספים: ההזמנה הבאה מהם מגיעה לכרטיס הקיים, עם מספר הלקוח שלו בריווחית.
function handleMerge_(fromId, toId) {
  var model = readModel_(book_());
  var from = contactById_(model, trim_(fromId));
  var to = contactById_(model, trim_(toId));
  if (!from || !to) return { ok: false, error: 'not found' };
  if (from.id === to.id) return { ok: false, error: 'same contact' };
  var now = now_();
  ['name', 'business', 'email', 'address', 'rivhitNo'].forEach(function (k) {
    if (!trim_(to[k]) && trim_(from[k])) to[k] = from[k];
  });
  var extra = extraPhones_(to);
  [normalizePhone_(from.phone)].concat(extraPhones_(from)).forEach(function (p) {
    if (!p || p === to.phone || extra.indexOf(p) >= 0) return;
    if (!to.phone) to.phone = p;
    else extra.push(p);
  });
  to.phones = extra.slice(0, PHONES_MAX).join(' ');

  var moved = 0, movedOrders = 0;
  model.activities.forEach(function (a) {
    if (a.contactId !== from.id) return;
    a.contactId = to.id;
    a._dirty = true;
    moved++;
    if (a.type === 'הזמנה') movedOrders++;
  });
  var tasks = model.tasks.filter(function (t) { return t.contactId === from.id; });
  tasks.forEach(function (t) { t.contactId = to.id; });
  // מחירים עוברים ל-to. לאותו מוצר בשני הכרטיסים — נשאר החדש (אפיון 2026-11-15)
  model.prices.forEach(function (p) {
    if (p.contactId !== from.id || p._deleted) return;
    var mine = priceRow_(model, to.id, p.productId);
    if (mine && trim_(mine.updated) >= trim_(p.updated)) { p._deleted = true; return; }
    if (mine) mine._deleted = true;
    p.contactId = to.id;
    p._dirty = true;
  });

  if (from.stage === 'לקוח' || movedOrders) to.stage = 'לקוח';
  if (trim_(from.followUp) && (!trim_(to.followUp) || from.followUp < to.followUp)) to.followUp = from.followUp;
  if (trim_(from.created) && (!trim_(to.created) || from.created < to.created)) to.created = from.created;
  if (trim_(from.lastActivity) > trim_(to.lastActivity)) to.lastActivity = from.lastActivity;
  recomputeOrders_(model, to);

  var label = trim_(from.business) || trim_(from.name) || from.phone || from.id;
  var count = function (n, one, many) { return n === 1 ? one : n + ' ' + many; };
  var what = [moved ? count(moved, 'פעולה אחת', 'פעולות') : '',
    tasks.length ? count(tasks.length, 'משימה אחת', 'משימות') : ''].filter(Boolean).join(' ו');
  var log = {
    id: newId_('A'), contactId: to.id, at: now.stamp, type: 'מיזוג',
    text: 'מוזג מהכרטיס של ' + label + (from.phone ? ' (' + from.phone + ')' : '') + (what ? ' — ' + what : ''),
    orderId: '', pdf: '', quoteLink: '', by: 'עמוד', items: ''
  };
  // קודם כותבים, ורק אחר כך מוחקים את השורה של from — מחיקה מזיזה את השורות שמתחתיה
  save_(model, [to], [log]);
  if (tasks.length) saveTasks_(model, tasks);
  savePrices_(model);
  model.cs.deleteRow(from._row);
  return { ok: true, id: to.id, moved: moved, tasks: tasks.length };
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

// ---------- סטטוס הזמנה (אפיון 2026-11-17) ----------

function normStatus_(s) {
  s = trim_(s);
  return ORDER_STATUSES.indexOf(s) >= 0 ? s : 'חדשה';
}

function channelOf_(orderId) {
  var p = trim_(orderId).slice(0, 3);
  if (p === 'AR-' || p === 'HM-') return 'אתר';
  if (p === 'SL-') return 'סוכן';
  if (p === 'RA-') return 'רשת';
  return 'אחר';
}

function ordersSheet_() {
  return SpreadsheetApp.openById(ORDERS_SPREADSHEET_ID).getSheetByName(ORDERS_SHEET);
}

// ההזמנות מ-days הימים האחרונים, החדשה קודם. מספר כפול — פעם אחת, עם duplicate.
// שורה בלי תאריך קריא — בסוף.
function handleOrders_(days) {
  var n = Math.min(365, Math.max(1, Math.floor(Number(days) || 60)));
  var rows = readOrderRows_();
  var model = readModel_(book_());
  var today = now_().date;
  var byOrder = {};
  model.activities.forEach(function (a) { if (a.orderId) byOrder[a.orderId] = a.contactId; });
  var seen = {};
  var out = [];
  rows.forEach(function (r) {
    if (r.receivedAt && daysBetween_(r.receivedAt, today) > n) return;
    if (seen[r.orderId]) { seen[r.orderId].duplicate = true; return; }
    var o = {
      orderId: r.orderId, receivedAt: r.receivedAt, business: r.business, contact: r.contact,
      totalItems: r.totalItems, totalPrice: r.totalPrice, pdf: r.pdf,
      status: normStatus_(r.status), statusAt: trim_(r.statusAt), channel: channelOf_(r.orderId),
      contactId: byOrder[r.orderId] || '', duplicate: false
    };
    seen[r.orderId] = o;
    out.push(o);
  });
  out.sort(function (a, b) {
    if (!a.receivedAt || !b.receivedAt) return a.receivedAt ? -1 : b.receivedAt ? 1 : 0;
    return cmp_(b.receivedAt, a.receivedAt);
  });
  return { ok: true, orders: out };
}

// הרשימה הנפתחת בעמודת הסטטוס — עם "נקלטה בריווחית". "בטיפול" נשאר בה, בשביל שורות ישנות.
function ensureStatusValidation_(sh, col) {
  try {
    var cell = sh.getRange(2, col, 1, 1);
    var cur = cell.getDataValidation();
    var vals = cur && cur.getCriteriaValues ? (cur.getCriteriaValues()[0] || []) : [];
    if (vals.indexOf('נקלטה בריווחית') >= 0) return;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(ORDER_STATUSES.concat(['בטיפול']), true)
      .setAllowInvalid(true)
      .build();
    // עד סוף הגיליון — getRange לא מרחיב, ובגיליון ההזמנות יש 998 שורות
    sh.getRange(2, col, sh.getMaxRows() - 1, 1).setDataValidation(rule);
  } catch (e) {
    Logger.log('CRM status validation: ' + e);
  }
}

// כותב סטטוס וחותמת לכל השורות של כל מספר. השורות מאותרות מחדש בכל כתיבה.
function handleOrderStatus_(ids, status) {
  status = trim_(status);
  if (ORDER_STATUSES.indexOf(status) < 0) return { ok: false, error: 'bad status' };
  if (!Array.isArray(ids) || !ids.length || ids.length > 200) return { ok: false, error: 'no orders' };
  var sh = ordersSheet_();
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'not found' };
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return trim_(h); });
  var idCol = head.indexOf('מספר הזמנה') + 1;
  var statusCol = head.indexOf('סטטוס') + 1;
  if (!idCol || !statusCol) return { ok: false, error: 'not found' };
  var atCol = head.indexOf(ORDER_STATUS_AT) + 1;
  if (!atCol) {
    atCol = head.length + 1;
    sh.getRange(1, atCol, 1, 1).setValues([[ORDER_STATUS_AT]]);
  }
  ensureStatusValidation_(sh, statusCol);
  var want = {};
  ids.forEach(function (id) { id = trim_(id); if (id) want[id] = false; });
  var stamp = now_().stamp;
  var col = sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues();
  var updated = 0;
  col.forEach(function (row, i) {
    var id = trim_(row[0]);
    if (!(id in want)) return;
    want[id] = true;
    sh.getRange(i + 2, statusCol, 1, 1).setValues([[status]]);
    sh.getRange(i + 2, atCol, 1, 1).setValues([[stamp]]);
    updated++;
  });
  var missing = Object.keys(want).filter(function (id) { return !want[id]; });
  if (!updated) return { ok: false, error: 'not found', missing: missing };
  return { ok: true, updated: updated, missing: missing, status: status, statusAt: stamp };
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

// ---------- פריטים מריווחית (אפיון 2026-11-09) ----------

function cleanItems_(items) {
  if (!Array.isArray(items)) return { error: 'no items' };
  if (items.length > ITEMS_MAX) return { error: 'too many items' };
  var seen = {}, out = [];
  items.forEach(function (it) {
    if (!Array.isArray(it)) return;
    var n = trim_(it[0]);
    var name = trim_(it[1]).replace(/\s+/g, ' ');
    if (!/^\d{1,15}$/.test(n) || !name || seen[n]) return;
    seen[n] = true;
    // זוג [מספר, שם] מעמוד ישן ⇒ בלי מספר קטלוגי (דף הסוכן לא מציג פריט כזה)
    out.push([n, name.slice(0, ITEM_NAME_MAX), catalogCode_(it[2])]);
  });
  return out.length ? { items: out } : { error: 'no items' };
}

// מחליף את כל הרשימה. שורות ישנות שמעבר לחדשה מתרוקנות (getLastRow מתעלם מהן).
// sanitize_ מקבל תקרה של אורך+1: הגרש שהוא מוסיף לערך שמתחיל בסימן נוסחה לא יחתוך
// את התו האחרון (הערך עצמו כבר נחתך ב-cleanItems_).
function handleItemsSet_(items) {
  var clean = cleanItems_(items);
  if (clean.error) return { ok: false, error: clean.error };
  var sh = sheet_(book_(), ITEMS_SHEET, ITEM_HEADERS);
  var old = Math.max(0, sh.getLastRow() - 1);
  var rows = clean.items.map(function (it) {
    return [it[0], sanitize_(it[1], ITEM_NAME_MAX + 1), sanitize_(it[2], CATALOG_MAX + 1)];
  });
  for (var i = rows.length; i < old; i++) rows.push(['', '', '']);
  writeRows_(sh, 2, rows, ITEM_HEADERS.length);
  var updated = now_().stamp;
  PropertiesService.getScriptProperties().setProperty('ITEMS_UPDATED', updated);
  return { ok: true, count: clean.items.length, updated: updated };
}

function handleItems_() {
  var sh = book_().getSheetByName(ITEMS_SHEET);
  var items = sh ? readRows_(sh, ['num', 'name', 'catalog'])
    .filter(function (r) { return /^\d{1,15}$/.test(r.num) && r.name; })
    .map(function (r) { return [r.num, r.name, catalogCode_(r.catalog)]; }) : [];
  var updated = items.length ? (PropertiesService.getScriptProperties().getProperty('ITEMS_UPDATED') || '') : '';
  return { ok: true, items: items, updated: updated };
}

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
  // 300 אלף תווים: העלאת רשימת הפריטים מריווחית (~63 אלף היום) נשארת בקשה אחת
  if (!raw || raw.length > 300000) return json_({ ok: false, error: 'bad request' });
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
      case 'contacts': return json_(handleContacts_());
      case 'agent_data': return json_(handleAgentData_());
      case 'orders': return json_(handleOrders_(body.days));
      case 'order_status': return json_(withLock_(function () {
        return handleOrderStatus_(body.orderIds, body.status);
      }));
      case 'prices_set': return json_(withLock_(function () {
        return handlePricesSet_(body.id, body.prices, body.source, false);
      }));
      case 'prices_fill': return json_(withLock_(function () {
        return handlePricesSet_(body.id, body.prices, 'העברה מהטלפון', true);
      }));
      case 'agent_customer': return json_(withLock_(function () { return handleAgentCustomer_(body); }));
      case 'quote': return json_(withLock_(function () { return handleQuote_(body); }));
      case 'add': return json_(withLock_(function () { return handleAdd_(body.contact || {}); }));
      case 'update': return json_(withLock_(function () { return handleUpdate_(body.id, body.fields || {}, null); }));
      case 'log': return json_(withLock_(function () { return handleUpdate_(body.id, body.fields || {}, body.activity || null); }));
      case 'delete': return json_(withLock_(function () { return handleDelete_(body.id); }));
      case 'merge': return json_(withLock_(function () { return handleMerge_(body.from, body.to); }));
      case 'import': return json_(withLock_(function () { return handleImport_(body.dryRun !== false); }));
      case 'order': return json_(withLock_(function () { return handleOrder_(body.id, body.order || {}); }));
      case 'order_cancel': return json_(withLock_(function () { return handleOrderCancel_(body.activityId); }));
      case 'task_add': return json_(withLock_(function () { return handleTaskAdd_(body.task || {}); }));
      case 'task_update': return json_(withLock_(function () { return handleTaskUpdate_(body.id, body.fields || {}); }));
      case 'task_delete': return json_(withLock_(function () { return handleTaskDelete_(body.id); }));
      case 'items': return json_(handleItems_());
      case 'items_set': return json_(withLock_(function () { return handleItemsSet_(body.items); }));
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
