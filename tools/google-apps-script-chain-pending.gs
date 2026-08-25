/**
 * הזמנות ממתינות — רשת החנויות.
 *
 * סניף שולח הזמנה מ-/shops-4b7e2c/ ⇒ doPost כותב שורה בגיליון הזה בסטטוס
 * "ממתין". מנהלת הרכש קוראת את הרשימה במסך שלה דרך doGet, עורכת כל הזמנה
 * בעמוד החנויות, ושליחה שלה הולכת ל-webhook ההזמנות הרגיל של אהרוני —
 * לא לכאן. הסקריפט הזה לא כותב לגיליון ההזמנות ולא שולח מיילים.
 *
 * הגדרה: להחליף את SPREADSHEET_ID במזהה הגיליון החדש, ואת API_PASSWORD
 * בסיסמה שתימסר למנהלת הרכש. פריסה: Deploy → Web app → Execute as: Me,
 * Who has access: Anyone.
 */

var SPREADSHEET_ID = 'PUT_THE_NEW_SPREADSHEET_ID_HERE';
var API_PASSWORD = 'PUT_A_PASSWORD_HERE';
var SHEET_NAME = 'ממתינות';

var PENDING_HEADERS = ['תאריך קבלה', 'מספר הזמנה', 'סניף', 'מזמין', 'הערות',
  'מספר פריטים', 'פריטים', 'סטטוס', 'מספר הזמנה מאושרת', 'תאריך אישור'];

/** תו מוביל מסוכן בגיליון = נוסחה. מקדימים גרש כדי שייכתב כטקסט. */
function sanitize_(v) {
  var s = (v === undefined || v === null) ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/**
 * הפיילוד של האתר נושא את הסניף בתוך customer.business ואת שם המזמין
 * ב-customer.contact — זה המבנה שכל שאר צינור ההזמנות בנוי עליו. התמיכה
 * בשדות שטוחים נשמרת כדי שאפשר יהיה לזמן את ה-webhook גם ידנית.
 */
function pick_(data, flat, nested) {
  if (data && data[flat]) return data[flat];
  if (data && data.customer && data.customer[nested]) return data.customer[nested];
  return '';
}

function pendingRow_(data) {
  var items = [];
  if (data && data.items && data.items.length) {
    for (var i = 0; i < data.items.length; i++) {
      var it = data.items[i] || {};
      items.push({
        id: String(it.id || ''),
        name: String(it.name || ''),
        qty: Number(it.qty) || 0,
        unit: String(it.unit || ''),
        category: String(it.category || '')
      });
    }
  }
  var count = 0;
  for (var j = 0; j < items.length; j++) count += items[j].qty;

  var row = [];
  row[PENDING_HEADERS.indexOf('תאריך קבלה')] = new Date();
  row[PENDING_HEADERS.indexOf('מספר הזמנה')] = sanitize_(data && data.orderId);
  row[PENDING_HEADERS.indexOf('סניף')] = sanitize_(pick_(data, 'branch', 'business'));
  row[PENDING_HEADERS.indexOf('מזמין')] = sanitize_(pick_(data, 'orderer', 'contact'));
  row[PENDING_HEADERS.indexOf('הערות')] = sanitize_(pick_(data, 'notes', 'notes'));
  row[PENDING_HEADERS.indexOf('מספר פריטים')] = count;
  // הפריטים נשמרים כ-JSON בתא אחד: המסך של מנהלת הרכש צריך אותם כמבנה,
  // ופיצול לשורות היה מפרק הזמנה אחת להרבה שורות בגיליון.
  row[PENDING_HEADERS.indexOf('פריטים')] = JSON.stringify(items);
  row[PENDING_HEADERS.indexOf('סטטוס')] = 'ממתין';
  row[PENDING_HEADERS.indexOf('מספר הזמנה מאושרת')] = '';
  row[PENDING_HEADERS.indexOf('תאריך אישור')] = '';
  return row;
}

function rowToOrder_(row) {
  var items = [];
  try {
    var raw = row[PENDING_HEADERS.indexOf('פריטים')];
    var parsed = JSON.parse(raw);
    if (parsed && parsed.length) items = parsed;
  } catch (e) {
    items = []; // תא שנערך ידנית בגיליון לא מפיל את כל הרשימה
  }
  return {
    receivedAt: String(row[PENDING_HEADERS.indexOf('תאריך קבלה')] || ''),
    orderId: String(row[PENDING_HEADERS.indexOf('מספר הזמנה')] || ''),
    branch: String(row[PENDING_HEADERS.indexOf('סניף')] || ''),
    orderer: String(row[PENDING_HEADERS.indexOf('מזמין')] || ''),
    notes: String(row[PENDING_HEADERS.indexOf('הערות')] || ''),
    itemCount: Number(row[PENDING_HEADERS.indexOf('מספר פריטים')]) || 0,
    status: String(row[PENDING_HEADERS.indexOf('סטטוס')] || ''),
    approvedId: String(row[PENDING_HEADERS.indexOf('מספר הזמנה מאושרת')] || ''),
    items: items
  };
}

function sheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(PENDING_HEADERS);
    sheet.getRange(1, 1, 1, PENDING_HEADERS.length)
      .setFontWeight('bold').setBackground('#d9ead3');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// הגבלת קצב: עד 200 בקשות בשעה. תקרה גבוהה מ-30 (כמו בסקריפט ההזמנות)
// כי דפוס השימוש האמיתי כאן הוא גל של כ-60 סניפים שמזמינים יחד פעם
// בחודשיים — תקרה נמוכה יותר הייתה דוחה הזמנות אמיתיות באמצע הגל.
// מפתח קאש נפרד (order_count שייך לפרויקט האחר) — הפרויקטים לא חולקים
// קאש בפועל, אבל מפתח ייעודי שומר את הכוונה ברורה ומונע כל צימוד.
function rateLimitOk_() {
  // המפתח כולל את מספר השעה, ולכן החלון קבוע ולא מתגלגל: cache.put מרענן
  // את ה-TTL בכל פגיעה, וכך הצפה הייתה יכולה להחזיק את הדלת נעולה לאורך
  // כל גל ההזמנות במקום שעה אחת.
  var cache = CacheService.getScriptCache();
  var key = 'chain_pending_count_' + Math.floor(Date.now() / 3600000);
  var count = Number(cache.get(key) || 0);
  if (count >= 200) return false;
  cache.put(key, String(count + 1), 3600);
  return true;
}

function doPost(e) {
  try {
    // הגנת הגודל קודמת להגבלת הקצב: בקשה פגומה לא צריכה לשרוף מהתקציב
    // של ההזמנות האמיתיות בגל.
    if (!e.postData || !e.postData.contents || e.postData.contents.length > 100000) {
      return json_({ ok: false, error: 'bad request' });
    }

    if (!rateLimitOk_()) return json_({ ok: false, error: 'rate limit' });

    var data = JSON.parse(e.postData.contents);
    sheet_().appendRow(pendingRow_(data));
    return json_({ ok: true });
  } catch (err) {
    Logger.log(err);
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.password !== API_PASSWORD) return json_({ ok: false, error: 'unauthorized' });

    var sheet = sheet_();
    var last = sheet.getLastRow();
    if (last < 2) return json_({ ok: true, orders: [] });
    var rows = sheet.getRange(2, 1, last - 1, PENDING_HEADERS.length).getValues();

    if (p.action === 'mark') {
      var statusCol = PENDING_HEADERS.indexOf('סטטוס') + 1;
      var idCol = PENDING_HEADERS.indexOf('מספר הזמנה');
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][idCol]) === String(p.id)) {
          sheet.getRange(i + 2, statusCol).setValue(p.status === 'sent' ? 'נשלחה' : 'ממתין');
          sheet.getRange(i + 2, PENDING_HEADERS.indexOf('מספר הזמנה מאושרת') + 1)
            .setValue(sanitize_(p.approvedId || ''));
          sheet.getRange(i + 2, PENDING_HEADERS.indexOf('תאריך אישור') + 1)
            .setValue(new Date());
          return json_({ ok: true });
        }
      }
      return json_({ ok: false, error: 'not found' });
    }

    var wanted = p.status || 'pending';
    var orders = [];
    for (var k = 0; k < rows.length; k++) {
      var order = rowToOrder_(rows[k]);
      if (!order.orderId) continue;
      if (wanted === 'pending' && order.status !== 'ממתין') continue;
      if (wanted === 'sent' && order.status !== 'נשלחה') continue;
      orders.push(order);
    }
    return json_({ ok: true, orders: orders });
  } catch (err) {
    Logger.log(err);
    return json_({ ok: false, error: String(err) });
  }
}
