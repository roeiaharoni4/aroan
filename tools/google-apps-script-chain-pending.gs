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
// הזמנה שמנהלת הרכש ביטלה. השורה נשארת בגיליון לתיעוד, אבל נעלמת מהמסך
// שלה — גם מ"הכל" — כדי שהיא לא תתבלבל בגל הבא.
var STATUS_CANCELLED = 'בוטלה';

// עמודת "סה״כ" נוספה בסוף בכוונה: כך אינדקסי העמודות הקיימות לא זזים,
// ושורות ישנות פשוט מחזירות ערך ריק.
var PENDING_HEADERS = ['תאריך קבלה', 'מספר הזמנה', 'סניף', 'מזמין', 'הערות',
  'מספר פריטים', 'פריטים', 'סטטוס', 'מספר הזמנה מאושרת', 'תאריך אישור', 'סה״כ'];

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
        category: String(it.category || ''),
        // מחיר היחידה נשמר: תעודת ההזמנה קוראת item.price, ובלעדיו כל שורה
        // בתעודה יצאה 0.00 ₪ בעוד שהסיכום למטה היה נכון
        price: Number(it.price) || 0
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
  // הסניפים לא רואים מחירים, אבל הפיילוד נושא סה״כ מחושב לפי מחירי הרשת —
  // וזה מה שמנהלת הרכש צריכה לראות לפני שהיא מאשרת.
  row[PENDING_HEADERS.indexOf('סה״כ')] = Number(data && data.totalPrice) || 0;
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
    total: Number(row[PENDING_HEADERS.indexOf('סה״כ')]) || 0,
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
      unit: String(i.unit || ''),
      price: Number(i.price) || 0
    };
  });
  var now = new Date();
  return {
    orderId: approvedId,
    date: ('0' + now.getDate()).slice(-2) + '.' +
      ('0' + (now.getMonth() + 1)).slice(-2) + '.' + now.getFullYear(),
    items: items,
    totalItems: totalItems,
    totalPrice: order.total ? Number(order.total).toFixed(2) : '',
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
  } else if (sheet.getLastColumn() < PENDING_HEADERS.length) {
    // גיליון שנוצר לפני שנוספה עמודה — משלימים רק את הכותרות החסרות,
    // בלי לגעת בשורות הקיימות
    var from = sheet.getLastColumn() + 1;
    var missing = PENDING_HEADERS.slice(from - 1);
    sheet.getRange(1, from, 1, missing.length).setValues([missing])
      .setFontWeight('bold').setBackground('#d9ead3');
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
    sheet.getRange(rowNum, PENDING_HEADERS.indexOf('סה״כ') + 1)
      .setValue(fresh[PENDING_HEADERS.indexOf('סה״כ')]);
  }
  sheet.getRange(rowNum, PENDING_HEADERS.indexOf('סטטוס') + 1).setValue(STATUS_APPROVED);
  return json_({ ok: true });
}

/**
 * מעביר הזמנה אחת ל-webhook ההזמנות ומסמן אותה "נשלחה".
 * מחזיר את מספר ההזמנה שנוצר, או '' כשההעברה נכשלה — כישלון של אחת לא
 * עוצר את השאר, אחרת סניף אחד תקול היה חוסם גל של 60.
 */
function forwardOne_(sheet, rowNum, order, quiet) {
  var approvedId = approvedOrderId_();
  var payload = forwardPayload_(order, approvedId);
  // בשליחה מרוכזת משתיקים את המייל הבודד: הסקריפט הזה אוסף את כל התעודות
  // ושולח מייל אחד בסוף. סניף דחוף שנשלח לבד ממשיך לקבל מייל משלו.
  if (quiet) payload.suppressEmail = true;
  var pdfId = '';
  try {
    var res = UrlFetchApp.fetch(ORDERS_WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    try {
      var parsed = JSON.parse(res.getContentText());
      if (parsed && parsed.pdfId) pdfId = parsed.pdfId;
    } catch (parseErr) {
      // תשובה שאינה JSON לא אמורה לקרות, ובכל מקרה ההזמנה כבר נשלחה
      Logger.log('bad response for ' + order.orderId + ': ' + parseErr);
    }
  } catch (err) {
    Logger.log('forward failed for ' + order.orderId + ': ' + err);
    return '';
  }
  order.pdfId = pdfId;
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
      ' — ' + sent[i].itemCount + ' פריטים' +
      (sent[i].total ? ' — ' + Number(sent[i].total).toFixed(2) + ' ש"ח' : '') +
      ' — ' + sent[i].approvedId);
  }
  if (failed.length) {
    lines.push('');
    lines.push('לא נשלחו (' + failed.length + ') — נשארו מאושרות ברשימה וניתן לנסות שוב:');
    for (var j = 0; j < failed.length; j++) lines.push('  · ' + failed[j]);
  }
  lines.push('');
  lines.push('כל ההזמנות נכתבו לגיליון ההזמנות, והתעודות מצורפות למייל הזה.');
  return lines.join('\n');
}

/**
 * ריכוז כמויות לפי מוצר על פני כל הסניפים בגל — זה מה שקובע מה להזמין
 * מהספק ומה להכין במחסן.
 */
// אותה קטגוריה שמפצלת את הסיכום בתעודת ההזמנה
var DISPOSABLE_CATEGORY = 'חד פעמי ואריזות';

function isDisposable_(item) {
  return String((item && item.category) || '') === DISPOSABLE_CATEGORY;
}

/** פיצול סכום ההזמנה לחד פעמי מול השאר. */
function orderSplit_(order) {
  var dispo = 0, rest = 0;
  var items = (order && order.items) || [];
  for (var i = 0; i < items.length; i++) {
    var line = (Number(items[i].qty) || 0) * (Number(items[i].price) || 0);
    if (isDisposable_(items[i])) dispo += line; else rest += line;
  }
  return { disposable: dispo, rest: rest };
}

function productTotals_(sent) {
  var byId = {}, order = [];
  for (var i = 0; i < sent.length; i++) {
    var items = sent[i].items || [];
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      var key = String(it.id || it.name || '');
      if (!key) continue;
      if (!byId[key]) {
        byId[key] = { id: it.id || '', name: it.name || '', unit: it.unit || '',
          group: isDisposable_(it) ? 'חד פעמי' : 'שאר המוצרים', qty: 0, total: 0 };
        order.push(key);
      }
      byId[key].qty += Number(it.qty) || 0;
      byId[key].total += (Number(it.qty) || 0) * (Number(it.price) || 0);
    }
  }
  return order.map(function (k) { return byId[k]; });
}

/**
 * סיכום הגל כקובץ אקסל. נבנה כגיליון גוגל זמני ומיוצא ל-xlsx — אותה שיטה
 * שבה נבנית תעודת ההזמנה (Doc ⇒ PDF), כי היא היחידה שנותנת קובץ אמיתי
 * בלי בעיות קידוד בעברית. הגיליון הזמני נמחק תמיד, גם כשהייצוא נכשל.
 */
function summaryXlsx_(sent) {
  var ss = null;
  try {
    var stamp = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd.MM.yyyy');
    ss = SpreadsheetApp.create('סיכום הזמנות רשת ' + stamp);

    var branchSheet = ss.getSheets()[0].setName('לפי סניף');
    var branchRows = [['סניף', 'מזמין', 'מספר הזמנה', 'פריטים', 'חד פעמי', 'שאר המוצרים', 'סה״כ']];
    var grand = 0, grandDispo = 0, grandRest = 0;
    for (var i = 0; i < sent.length; i++) {
      var sp = orderSplit_(sent[i]);
      branchRows.push([sent[i].branch || '', sent[i].orderer || '', sent[i].approvedId || '',
        Number(sent[i].itemCount) || 0, sp.disposable, sp.rest, Number(sent[i].total) || 0]);
      grand += Number(sent[i].total) || 0;
      grandDispo += sp.disposable;
      grandRest += sp.rest;
    }
    branchRows.push(['', '', 'סה״כ הגל', '', grandDispo, grandRest, grand]);
    branchSheet.getRange(1, 1, branchRows.length, 7).setValues(branchRows);
    branchSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#d9ead3');
    branchSheet.getRange(branchRows.length, 1, 1, 7).setFontWeight('bold');

    var prodSheet = ss.insertSheet('ריכוז מוצרים');
    var prods = productTotals_(sent);
    // חד פעמי קודם, ושורת ביניים בין הקבוצות — כך אפשר להזמין מהספק
    // בלי לסרוק את כל הרשימה ולסנן בעיניים
    prods.sort(function (a, b) {
      if (a.group === b.group) return 0;
      return a.group === 'חד פעמי' ? -1 : 1;
    });
    var prodRows = [['קבוצה', 'מק״ט', 'מוצר', 'יחידה', 'כמות כוללת', 'סה״כ']];
    var groupSum = 0, prevGroup = null;
    for (var k = 0; k < prods.length; k++) {
      if (prevGroup !== null && prods[k].group !== prevGroup) {
        prodRows.push(['סה״כ ' + prevGroup, '', '', '', '', groupSum]);
        groupSum = 0;
      }
      prodRows.push([prods[k].group, prods[k].id, prods[k].name, prods[k].unit, prods[k].qty, prods[k].total]);
      groupSum += prods[k].total;
      prevGroup = prods[k].group;
    }
    if (prevGroup !== null) prodRows.push(['סה״כ ' + prevGroup, '', '', '', '', groupSum]);
    prodSheet.getRange(1, 1, prodRows.length, 6).setValues(prodRows);
    prodSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#d9ead3');

    SpreadsheetApp.flush();
    var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
    var blob = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
    }).getBlob().setName('סיכום הזמנות ' + stamp + '.xlsx');
    return blob;
  } catch (err) {
    Logger.log('xlsx summary failed: ' + err);
    return null;
  } finally {
    // בלי זה כל שליחה מרוכזת הייתה משאירה גיליון יתום ב-Drive
    if (ss) {
      try { DriveApp.getFileById(ss.getId()).setTrashed(true); } catch (e) { }
    }
  }
}

/** תקרת גודל לצרופות במייל אחד. ג'ימייל חוסם מעל ~25MB, ולכן עוצרים מוקדם. */
var MAIL_ATTACH_LIMIT = 18 * 1024 * 1024;

/**
 * מייל אחד עם כל התעודות של הגל. אם הן כבדות מדי למייל אחד — מפצלים
 * לכמה מיילים במקום להיכשל בשקט מול המגבלה של ג'ימייל.
 */
function sendBatchMail_(sent, failed) {
  var batches = [[]], sizes = [0];
  for (var i = 0; i < sent.length; i++) {
    if (!sent[i].pdfId) continue;
    var blob;
    try {
      blob = DriveApp.getFileById(sent[i].pdfId).getBlob();
    } catch (err) {
      Logger.log('pdf fetch failed for ' + sent[i].approvedId + ': ' + err);
      continue;
    }
    var size = blob.getBytes().length;
    var last = batches.length - 1;
    if (sizes[last] + size > MAIL_ATTACH_LIMIT && batches[last].length) {
      batches.push([]); sizes.push(0);
      last++;
    }
    batches[last].push(blob);
    sizes[last] += size;
  }

  // קובץ הסיכום מצורף למייל הראשון בלבד — הוא מכסה את כל הגל
  var xlsx = summaryXlsx_(sent);
  if (xlsx) batches[0].unshift(xlsx);

  var body = summaryBody_(sent, failed);
  for (var b = 0; b < batches.length; b++) {
    var suffix = batches.length > 1 ? ' (' + (b + 1) + '/' + batches.length + ')' : '';
    try {
      MailApp.sendEmail(SUMMARY_EMAIL,
        'הזמנות רשת החנויות — ' + sent.length + ' הזמנות' + suffix,
        body,
        batches[b].length ? { attachments: batches[b] } : {});
    } catch (mailErr) {
      // הצרופות הן הסיבה הסבירה לכישלון — עדיף סיכום בלי קבצים מאשר כלום
      Logger.log('batch mail failed: ' + mailErr);
      try {
        MailApp.sendEmail(SUMMARY_EMAIL,
          'הזמנות רשת החנויות — ' + sent.length + ' הזמנות' + suffix, body, {});
      } catch (e2) {
        Logger.log('batch mail failed without attachments too: ' + e2);
      }
    }
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

    // ביטול הזמנה. אפשרי רק לפני שהיא נשלחה — אחרי זה היא כבר אצל אהרוני.
    if (p.action === 'cancel') {
      var cancelRow = findRow_(sheet, p.id);
      if (!cancelRow) return json_({ ok: false, error: 'not found' });
      var curStatus = String(sheet.getRange(cancelRow, PENDING_HEADERS.indexOf('סטטוס') + 1).getValue());
      if (curStatus === STATUS_SENT) return json_({ ok: false, error: 'already sent' });
      sheet.getRange(cancelRow, PENDING_HEADERS.indexOf('סטטוס') + 1).setValue(STATUS_CANCELLED);
      sheet.getRange(cancelRow, PENDING_HEADERS.indexOf('תאריך אישור') + 1).setValue(new Date());
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
        if (candidate.status === STATUS_CANCELLED) continue;
        var approvedId = forwardOne_(sheet, m + 2, candidate, !p.id);
        if (approvedId) {
          sent.push({
            branch: candidate.branch, orderer: candidate.orderer,
            itemCount: candidate.itemCount, total: candidate.total,
            approvedId: approvedId, pdfId: candidate.pdfId || '',
            items: candidate.items || []
          });
        } else {
          failed.push(candidate.branch || candidate.orderId);
        }
      }
      // מייל אחד לכל הגל, עם כל התעודות מצורפות. על הזמנה בודדת לא משתיקים
      // את המייל הרגיל ולכן אין כאן מה לשלוח.
      if (!p.id && sent.length) sendBatchMail_(sent, failed);
      return json_({ ok: true, sent: sent.length, failed: failed.length });
    }

    var wanted = p.status || 'pending';
    var orders = [];
    for (var k = 0; k < rows.length; k++) {
      var order = rowToOrder_(rows[k]);
      if (!order.orderId) continue;
      // הזמנה שבוטלה יורדת מהמסך שלה לגמרי, כולל מ"הכל". השורה נשארת
      // בגיליון כדי שיישאר תיעוד למה הסניף לא קיבל אספקה.
      if (order.status === STATUS_CANCELLED) continue;
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
