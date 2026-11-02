/**
 * סקריפט הלידים — מקבל את טופסי הפנייה מהאתר (js/components.js), שולח מייל
 * לרועי, ומעביר את הליד ל-CRM (tools/google-apps-script-crm.gs).
 *
 * הריפו פומבי: כאן רק מצייני מקום (PUT_...). הערכים האמיתיים רק בעותק שבענן.
 * עדכון בענן — clasp (CLAUDE.md). פרויקט 1izrc74YV8OZwtuBlfCMc1sGY9aB83m7IQNlr3QDeLmMvhHIBeqMslhcy,
 * פריסה AKfycbxfp0q… — המזהה לא משתנה, ואין צורך לגעת באתר.
 * בדיקות: node tools/test/leads.test.js
 */

var NOTIFY_EMAIL = 'meiraroam@gmail.com';
var CRM_URL = 'PUT_CRM_URL_HERE';
var CRM_SECRET = 'PUT_CRM_SECRET_HERE';
var CRM_PAGE_URL = 'https://aroam.co.il/crm-f428d7/';
var CANCEL_SUBJECT = 'הודעת ביטול עסקה';
var LEADS_PER_HOUR = 100;
// מה שהאתר שולח כשהשדה ריק
var EMPTY_VALUES = ['לא צוין', 'ללא הודעה'];

function field_(data, keys) {
  for (var i = 0; i < keys.length; i++) {
    var v = String(data[keys[i]] == null ? '' : data[keys[i]]).trim();
    if (v && EMPTY_VALUES.indexOf(v) < 0) return v;
  }
  return '';
}

// components.js מצרף את שם העסק לשם: "דנה — מסעדת הגפן"
function splitName_(full) {
  var i = full.lastIndexOf(' — ');
  if (i <= 0) return { name: full, business: '' };
  return { name: full.slice(0, i).trim(), business: full.slice(i + 3).trim() };
}

function leadEvent_(data) {
  var who = splitName_(field_(data, ['שם מלא', 'name']));
  return {
    type: 'lead',
    name: who.name,
    business: who.business,
    phone: field_(data, ['טלפון', 'phone']),
    email: field_(data, ['אימייל', 'email']),
    message: field_(data, ['הודעה / בקשה', 'message']),
    subject: field_(data, ['_subject']),
    page: field_(data, ['עמוד']),
    landing: field_(data, ['דף נחיתה']),
    source: field_(data, ['מקור']),
    gclid: field_(data, ['gclid'])
  };
}

// נגד הצפה של מכסת המיילים היומית. דלי שעתי — מפתח חדש כל שעה, בלי חלון מתגלגל.
function rateLimitOk_() {
  var cache = CacheService.getScriptCache();
  var key = 'lead_count_' + Math.floor(Date.now() / 3600000);
  var count = Number(cache.get(key) || 0);
  if (count >= LEADS_PER_HOUR) return false;
  cache.put(key, String(count + 1), 3600);
  return true;
}

// בודק ok בגוף התשובה ולא רק HTTP 200 (הלקח מסבב 62)
function notifyCrm_(event) {
  if (CRM_URL.indexOf('PUT_') === 0) return { ok: false };
  try {
    var res = UrlFetchApp.fetch(CRM_URL, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({ action: 'event', secret: CRM_SECRET, event: event })
    });
    var parsed = JSON.parse(res.getContentText());
    if (parsed && parsed.ok === true && parsed.id) return { ok: true, id: parsed.id };
    Logger.log('CRM: ' + res.getContentText().slice(0, 200));
  } catch (e) {
    Logger.log('CRM: ' + e);
  }
  return { ok: false };
}

function leadEmailBody_(data, crm) {
  var body = 'פנייה חדשה התקבלה מהאתר:\n\n';
  body += 'שם מלא: ' + (field_(data, ['שם מלא', 'name']) || 'לא צוין') + '\n';
  body += 'טלפון: ' + (field_(data, ['טלפון', 'phone']) || 'לא צוין') + '\n';
  body += 'אימייל: ' + (field_(data, ['אימייל', 'email']) || 'לא צוין') + '\n';
  body += 'הודעה / פירוט בקשה: ' + (field_(data, ['הודעה / בקשה', 'message']) || 'ללא הודעה') + '\n';
  var page = field_(data, ['עמוד']);
  var landing = field_(data, ['דף נחיתה']);
  var source = field_(data, ['מקור']);
  if (page) body += 'עמוד: ' + page + '\n';
  if (landing && landing !== page) body += 'דף נחיתה: ' + landing + '\n';
  if (source) body += 'מקור: ' + source + '\n';
  if (crm) {
    body += crm.ok
      ? '\nפתח בכרטיס: ' + CRM_PAGE_URL + '#c=' + crm.id + '\n'
      : '\nלא נשמר ב-CRM — להוסיף ידנית.\n';
  }
  return body;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// בדיקת חיים. פתיחה ראשונה של הכתובת ע"י רועי היא גם מה שמבקש ממנו לאשר הרשאות.
function doGet() {
  return ContentService.createTextOutput('לידים — פעיל');
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    // שדה המלכודת מולא — בוט. עונים "הצלחה" כדי לא ללמד אותו כלום, ולא שולחים דבר.
    if (field_(data, ['_honey'])) return json_({ success: 'true' });
    if (!rateLimitOk_()) return json_({ success: 'false', error: 'rate limit' });
    var subject = field_(data, ['_subject']) || 'פנייה חדשה מאתר אהרוני שיווק';
    // טופס ביטול עסקה לא נכנס ל-CRM: יש בו תעודת זהות, שנאספת רק לטיפול בביטול
    var crm = subject === CANCEL_SUBJECT ? null : notifyCrm_(leadEvent_(data));
    MailApp.sendEmail(NOTIFY_EMAIL, subject, leadEmailBody_(data, crm));
    return json_({ success: 'true' });
  } catch (error) {
    return json_({ success: 'false', error: error.toString() });
  }
}

// הרצה ידנית אחת מהעורך: מבקשת מרועי לאשר גישה לרשת (בשביל ה-CRM) ולמייל
function authorize() {
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  MailApp.getRemainingDailyQuota();
}
