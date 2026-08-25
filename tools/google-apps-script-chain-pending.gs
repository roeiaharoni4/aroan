/**
 * הזמנות ממתינות — רשת החנויות.
 *
 * סניף שולח הזמנה מ-/shops-4b7e2c/ ⇒ doPost כותב שורה בגיליון הזה בסטטוס
 * "ממתין". מנהלת הרכש מאשרת הזמנות במסך שלה ("מאושרת"), ובסוף לוחצת
 * "שלח את כל המאושרות" — ואז הסקריפט מעביר כל אחת ל-webhook ההזמנות
 * הרגיל של אהרוני, מסמן "נשלחה", ושולח מייל סיכום אחד. סניף דחוף אפשר
 * לשלוח מיד, לבד.
 *
 * הסקריפט לא כותב לגיליון ההזמנות של אהרוני — הוא מזמן את ה-webhook שלו,
 * בדיוק כמו שהאתר עושה.
 *
 * הגדרה: להחליף את SPREADSHEET_ID במזהה הגיליון החדש, ואת API_PASSWORD
 * בסיסמה שתימסר למנהלת הרכש. פריסה: Deploy → Web app → Execute as: Me,
 * Who has access: Anyone.
 */

// הגיליון "הזמנות ממתינות — רשת חנויות". המזהה כאן בכוונה ולא כמציין מקום:
// בסקריפט ההזמנות מציין המקום גרם פעם להשבתת הכתיבה בהדבקה לענן. הגיליון
// עצמו אינו משותף לציבור, ולכן המזהה לבדו אינו נותן גישה.
var SPREADSHEET_ID = '13pnQ4ZMth8hAxjiviqngoxc5AxS4ulEos3m1yFNvOIw';
// הסיסמה נשארת מציין מקום בכוונה — הריפו הזה פומבי. יש למלא אותה בענן
// בלבד, אחרי ההדבקה, ולמסור אותה למנהלת הרכש.
var API_PASSWORD = 'PUT_A_PASSWORD_HERE';
var SHEET_NAME = 'ממתינות';

// היעד של השליחה המרוכזת — ה-webhook הרגיל של ההזמנות. הכתובת ממילא
// גלויה בקוד של האתר, ולכן אין כאן חשיפה נוספת.
var ORDERS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbz_rRjFdy2MqPMXX0cHkAh7zHBV4plQIEVL9H45DqdRRnU19ShwNCfguva7WBa0y-F1PQ/exec';
var SUMMARY_EMAIL = 'meiraroam@gmail.com';

var STATUS_PENDING = 'ממתין';
var STATUS_APPROVED = 'מאושרת';
var STATUS_SENT = 'נשלחה';

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
  row[PENDING_HEADERS.indexOf('סטטוס')] = STATUS_PENDING;
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

/** מספר הזמנה להזמנה שאושרה, באותה תבנית שהאתר מייצר. */
function approvedOrderId_() {
  var d = new Date();
  var ymd = d.getFullYear() +
    ('0' + (d.getMonth() + 1)).slice(-2) +
    ('0' + d.getDate()).slice(-2);
  return 'RA-' + ymd + '-' + Math.floor(100000 + Math.random() * 900000);
}

/**
 * בונה את הפיילוד ל-webhook ההזמנות במבנה שהאתר שולח — customer מקונן
 * ו-items עם id/name/qty/unit/category. אי-התאמה כאן פירושה שורה בגיליון
 * של רועי בלי סניף ובלי פריטים, ולכן זה המקום הרגיש בקובץ.
 */
function forwardPayload_(order, approvedId) {
  var totalItems = 0;
  var items = (order.items || []).map(function (i) {
    totalItems += Number(i.qty) || 0;
    return {
      id: String(i.id || ''),
      name: String(i.name || ''),
      category: String(i.category || ''),
      qty: Number(i.qty) || 0,
      unit: String(i.unit || '')
    };
  });
  var now = new Date();
  return {
    orderId: approvedId,
    date: ('0' + now.getDate()).slice(-2) + '.' +
      ('0' + (now.getMonth() + 1)).slice(-2) + '.' + now.getFullYear(),
    items: items,
    totalItems: totalItems,
    totalPrice: '',
    subtotal: '',
    discount: '',
    shipping: '',
    // הסניפים לא רואים מחירים, ולכן גם ההזמנה המאושרת יוצאת בלי הצעת מחיר
    showPrices: false,
    pendingId: order.orderId,
    originalBranch: order.branch,
    customer: {
      business: order.branch,
      contact: order.orderer,
      phone: '',
      address: '',
      notes: order.notes
    }
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

    // אישור עם עריכה: מנהלת הרכש שינתה את ההזמנה בעמוד החנויות ולחצה
    // "אשר". מעדכנים את השורה הקיימת ולא מוסיפים חדשה, אחרת אותה הזמנה
    // הייתה מופיעה פעמיים ברשימה שלה.
    if (data && data.action === 'approve') {
      return approveOrder_(data);
    }

    sheet_().appendRow(pendingRow_(data));
    return json_({ ok: true });
  } catch (err) {
    Logger.log(err);
    return json_({ ok: false, error: String(err) });
  }
}

/** מאתר שורה לפי מספר הזמנה. מחזיר את מספר השורה בגיליון, או 0. */
function findRow_(sheet, orderId) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var ids = sheet.getRange(2, PENDING_HEADERS.indexOf('מספר הזמנה') + 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(orderId)) return i + 2;
  }
  return 0;
}

/** אישור הזמנה, עם או בלי פריטים מעודכנים. לא שולח — רק מסמן. */
function approveOrder_(data) {
  var sheet = sheet_();
  var rowNum = findRow_(sheet, data.orderId);
  if (!rowNum) return json_({ ok: false, error: 'not found' });

  if (data.items && data.items.length) {
    var fresh = pendingRow_(data);
    sheet.getRange(rowNum, PENDING_HEADERS.indexOf('פריטים') + 1)
      .setValue(fresh[PENDING_HEADERS.indexOf('פריטים')]);
    sheet.getRange(rowNum, PENDING_HEADERS.indexOf('מספר פריטים') + 1)
      .setValue(fresh[PENDING_HEADERS.indexOf('מספר פריטים')]);
    // הסניף עשוי להשתנות אם מנהלת הרכש החליפה אותו
    sheet.getRange(rowNum, PENDING_HEADERS.indexOf('סניף') + 1)
      .setValue(fresh[PENDING_HEADERS.indexOf('סניף')]);
  }
  sheet.getRange(rowNum, PENDING_HEADERS.indexOf('סטטוס') + 1).setValue(STATUS_APPROVED);
  return json_({ ok: true });
}

/**
 * מעביר הזמנה אחת ל-webhook ההזמנות ומסמן אותה "נשלחה".
 * מחזיר את מספר ההזמנה שנוצר, או '' כשההעברה נכשלה — כישלון של אחת לא
 * עוצר את השאר, אחרת סניף אחד תקול היה חוסם גל של 60.
 */
function forwardOne_(sheet, rowNum, order) {
  var approvedId = approvedOrderId_();
  try {
    UrlFetchApp.fetch(ORDERS_WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(forwardPayload_(order, approvedId)),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log('forward failed for ' + order.orderId + ': ' + err);
    return '';
  }
  sheet.getRange(rowNum, PENDING_HEADERS.indexOf('סטטוס') + 1).setValue(STATUS_SENT);
  sheet.getRange(rowNum, PENDING_HEADERS.indexOf('מספר הזמנה מאושרת') + 1).setValue(approvedId);
  sheet.getRange(rowNum, PENDING_HEADERS.indexOf('תאריך אישור') + 1).setValue(new Date());
  return approvedId;
}

/** גוף מייל הסיכום — סניף, מספר פריטים ומספר ההזמנה שנוצר. */
function summaryBody_(sent, failed) {
  var lines = ['סיכום שליחה מרוכזת — הזמנות רשת החנויות', ''];
  lines.push('נשלחו ' + sent.length + ' הזמנות:');
  for (var i = 0; i < sent.length; i++) {
    lines.push('  ' + (i + 1) + '. ' + sent[i].branch +
      ' — ' + sent[i].itemCount + ' פריטים — ' + sent[i].approvedId);
  }
  if (failed.length) {
    lines.push('');
    lines.push('לא נשלחו (' + failed.length + ') — נשארו מאושרות ברשימה וניתן לנסות שוב:');
    for (var j = 0; j < failed.length; j++) lines.push('  · ' + failed[j]);
  }
  lines.push('');
  lines.push('כל הזמנה נשלחה בנפרד ותגיע גם כשורה בגיליון ההזמנות וגם כתעודת PDF.');
  return lines.join('\n');
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
          sheet.getRange(i + 2, statusCol).setValue(p.status === 'sent' ? STATUS_SENT : STATUS_PENDING);
          sheet.getRange(i + 2, PENDING_HEADERS.indexOf('מספר הזמנה מאושרת') + 1)
            .setValue(sanitize_(p.approvedId || ''));
          sheet.getRange(i + 2, PENDING_HEADERS.indexOf('תאריך אישור') + 1)
            .setValue(new Date());
          return json_({ ok: true });
        }
      }
      return json_({ ok: false, error: 'not found' });
    }

    // אישור בלחיצה מהרשימה, בלי לפתוח את ההזמנה לעריכה
    if (p.action === 'approve') {
      var approveRow = findRow_(sheet, p.id);
      if (!approveRow) return json_({ ok: false, error: 'not found' });
      sheet.getRange(approveRow, PENDING_HEADERS.indexOf('סטטוס') + 1).setValue(STATUS_APPROVED);
      return json_({ ok: true });
    }

    // שליחה מרוכזת של כל המאושרות, או של הזמנה אחת (p.id) לסניף דחוף
    if (p.action === 'send') {
      var sent = [], failed = [];
      for (var m = 0; m < rows.length; m++) {
        var candidate = rowToOrder_(rows[m]);
        if (!candidate.orderId) continue;
        if (p.id) {
          if (String(candidate.orderId) !== String(p.id)) continue;
        } else if (candidate.status !== STATUS_APPROVED) {
          continue;
        }
        var approvedId = forwardOne_(sheet, m + 2, candidate);
        if (approvedId) {
          sent.push({ branch: candidate.branch, itemCount: candidate.itemCount, approvedId: approvedId });
        } else {
          failed.push(candidate.branch || candidate.orderId);
        }
      }
      // מייל סיכום רק לשליחה מרוכזת: על הזמנה בודדת ממילא מגיעה תעודה
      if (!p.id && sent.length) {
        try {
          MailApp.sendEmail(SUMMARY_EMAIL,
            'סיכום שליחה — ' + sent.length + ' הזמנות מרשת החנויות',
            summaryBody_(sent, failed));
        } catch (mailErr) {
          Logger.log('summary mail failed: ' + mailErr);
        }
      }
      return json_({ ok: true, sent: sent.length, failed: failed.length });
    }

    var wanted = p.status || 'pending';
    var orders = [];
    for (var k = 0; k < rows.length; k++) {
      var order = rowToOrder_(rows[k]);
      if (!order.orderId) continue;
      if (wanted === 'pending' && order.status !== STATUS_PENDING) continue;
      if (wanted === 'approved' && order.status !== STATUS_APPROVED) continue;
      if (wanted === 'sent' && order.status !== STATUS_SENT) continue;
      orders.push(order);
    }
    return json_({ ok: true, orders: orders });
  } catch (err) {
    Logger.log(err);
    return json_({ ok: false, error: String(err) });
  }
}
