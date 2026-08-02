/**
 * ניהול הזמנות בגיליון גוגל - אהרוני שיווק והפצה
 * ==================================================
 *
 * מה הקוד הזה עושה:
 * כל הזמנה שנשלחת מהאתר (וואטסאפ/מייל) נרשמת אוטומטית כשורה בגיליון גוגל,
 * כולל פרטי הלקוח החדשים (שם עסק, טלפון, כתובת), עם עמודת סטטוס לניהול.
 * בנוסף נשלח אליך מייל התראה על כל הזמנה חדשה.
 *
 * הוראות התקנה (5 דקות, פעם אחת):
 * 1. פתח את https://script.google.com והתחבר עם חשבון הגוגל שלך.
 * 2. פתח את הפרויקט הקיים שמטפל בהזמנות (זה שמחובר לאתר),
 *    או צור פרויקט חדש (New project).
 * 3. מחק את הקוד הקיים בעורך והדבק את כל הקובץ הזה במקומו.
 * 4. בשורה למטה, החלף את YOUR_SPREADSHEET_ID במזהה של גיליון גוגל שלך:
 *    - צור גיליון חדש ב-https://sheets.google.com בשם "הזמנות אהרוני"
 *    - המזהה הוא החלק הארוך בכתובת: docs.google.com/spreadsheets/d/<המזהה>/edit
 * 5. לחץ Deploy (פריסה) -> New deployment -> סוג: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 *    - לחץ Deploy והעתק את הקישור (URL) שמתקבל.
 * 6. אם יצרת פרויקט חדש: פתח את הקובץ js/app.js באתר, ובשורה 3
 *    (GOOGLE_SCRIPT_WEBHOOK_URL) הדבק את הקישור החדש.
 *    אם עדכנת את הפרויקט הקיים: בחר Deploy -> Manage deployments -> ערוך
 *    את הפריסה הקיימת ל-New version - והקישור באתר נשאר אותו דבר.
 */

// ===== הגדרות =====
var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'; // <-- החלף במזהה הגיליון שלך
var SHEET_NAME = 'הזמנות';
var NOTIFY_EMAIL = 'meiraroam@gmail.com';   // מייל להתראות על הזמנה חדשה

// ניקוי קלט: טקסט בלבד, בלי תווי בקרה, באורך מוגבל
function clean_(value, maxLen) {
  var s = String(value == null ? '' : value);
  s = s.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, ' ');
  // מניעת formula injection בגיליון (=, +, -, @ בתחילת תא)
  if (/^[=+@\t\r-]/.test(s)) s = "'" + s;
  return s.slice(0, maxLen || 200);
}

// הגבלת קצב פשוטה: עד 30 הזמנות בשעה (מגן מפני הצפה/ניצול לרעה)
function rateLimitOk_() {
  var cache = CacheService.getScriptCache();
  var count = Number(cache.get('order_count') || 0);
  if (count >= 30) return false;
  cache.put('order_count', String(count + 1), 3600);
  return true;
}

function doPost(e) {
  try {
    if (!rateLimitOk_()) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'rate limit' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (!e.postData || !e.postData.contents || e.postData.contents.length > 100000) {
      throw new Error('bad request');
    }
    var data = JSON.parse(e.postData.contents);
    var sheet = getOrCreateSheet_();

    var customer = data.customer || {};
    var itemsText = (data.items || []).slice(0, 200).map(function (item) {
      var line = clean_(item.name, 120) + ' (מק"ט ' + clean_(item.id, 30) + ') x' +
        clean_(item.qty, 10) + ' ' + clean_(item.unit, 20);
      // מבצע חבילה — כמה יחידות לתת חינם באספקה
      if (Number(item.free) > 0) {
        line += ' | מבצע ' + clean_(item.bundle, 10) + ' — ' + clean_(item.free, 10) + ' חינם';
      }
      // מחירים מוצגים רק בקטלוגים שיש בהם מחיר (טיפוח/סוכן)
      if (Number(item.total) > 0) {
        line += ' | ' + Number(item.total).toFixed(2) + ' ש"ח';
      }
      return line;
    }).join('\n');

    // totalPrice הוא הסכום הסופי (אחרי הנחת סל ודמי משלוח)
    var totalPriceText = Number(data.totalPrice) > 0 ? Number(data.totalPrice).toFixed(2) : '';
    var shippingText = Number(data.shipping) > 0 ? Number(data.shipping).toFixed(2) : '';
    var discountText = Number(data.discount) > 0 ? Number(data.discount).toFixed(2) : '';

    sheet.appendRow([
      new Date(),                          // תאריך קבלה
      clean_(data.orderId, 30),            // מספר הזמנה
      clean_(data.date, 20),               // תאריך אספקה מבוקש
      clean_(customer.business, 100),      // שם העסק
      clean_(customer.contact, 100),       // איש קשר
      clean_(customer.phone, 30),          // טלפון
      clean_(customer.address, 200),       // כתובת למשלוח
      clean_(customer.notes, 500),         // הערות
      itemsText,                           // פירוט פריטים
      clean_(data.totalItems, 10),         // סה"כ פריטים
      totalPriceText,                      // סה"כ לתשלום (ריק בקטלוג בלי מחירים)
      'חדשה',                              // סטטוס
      clean_(customer.shipping, 60),       // שיטת אספקה (ריק בקטלוג העסקי)
      shippingText,                        // דמי משלוח
      clean_(customer.payment, 60)         // אופן תשלום (ריק בקטלוג העסקי)
    ]);

    // מייל התראה
    if (NOTIFY_EMAIL) {
      var subject = 'הזמנה חדשה מהאתר #' + clean_(data.orderId, 30) +
        (customer.business ? ' - ' + clean_(customer.business, 100) : '');
      var body = 'התקבלה הזמנה חדשה:\n\n' +
        'מספר הזמנה: ' + (clean_(data.orderId, 30) || '') + '\n' +
        'שם העסק: ' + (clean_(customer.business, 100) || 'לא צוין') + '\n' +
        'איש קשר: ' + (clean_(customer.contact, 100) || 'לא צוין') + '\n' +
        'טלפון: ' + (clean_(customer.phone, 30) || 'לא צוין') + '\n' +
        (customer.shipping ? 'שיטת אספקה: ' + clean_(customer.shipping, 60) + '\n' : '') +
        'כתובת: ' + (clean_(customer.address, 200) || 'לא צוינה') + '\n' +
        (customer.payment ? 'אופן תשלום: ' + clean_(customer.payment, 60) + '\n' : '') +
        'הערות: ' + (clean_(customer.notes, 500) || 'אין') + '\n\n' +
        'פירוט:\n' + itemsText + '\n\n' +
        'סה"כ פריטים: ' + (clean_(data.totalItems, 10) || '') + '\n' +
        (discountText ? 'הנחת מבצע: -' + discountText + ' ש"ח\n' : '') +
        (shippingText ? 'דמי משלוח: ' + shippingText + ' ש"ח\n' : '') +
        (totalPriceText ? 'סה"כ לתשלום: ' + totalPriceText + ' ש"ח\n' : '') + '\n' +
        'הגיליון המלא: https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID;
      MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// כותרות הגיליון. שלוש העמודות האחרונות נוספו אחרי "סטטוס" ולא באמצע השורה,
// כדי שגיליון קיים עם הזמנות ישנות לא יזוז — בשורות הישנות הן פשוט יישארו ריקות.
var SHEET_HEADERS = ['תאריך קבלה', 'מספר הזמנה', 'תאריך אספקה מבוקש', 'שם העסק',
  'איש קשר', 'טלפון', 'כתובת למשלוח', 'הערות', 'פירוט פריטים', 'סה"כ פריטים',
  'סה"כ לתשלום', 'סטטוס', 'שיטת אספקה', 'דמי משלוח', 'אופן תשלום'];
var STATUS_COL = 12; // מיקום עמודת הסטטוס (1-based)

// יוצר את הגיליון עם כותרות ורשימת סטטוסים, ומשלים כותרות חסרות בגיליון קיים
function getOrCreateSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SHEET_HEADERS);
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setFontWeight('bold').setBackground('#d9ead3');
    sheet.setFrozenRows(1);
    sheet.setRightToLeft(true);

    // רשימה נפתחת לעמודת הסטטוס
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['חדשה', 'בטיפול', 'סופקה', 'חשבונית הופקה', 'בוטלה'], true)
      .build();
    sheet.getRange(2, STATUS_COL, 1000, 1).setDataValidation(rule);
  } else if (sheet.getLastColumn() < SHEET_HEADERS.length) {
    // שדרוג גיליון שנוצר בגרסה קודמת: משלימים רק את הכותרות החדשות בסוף
    var from = sheet.getLastColumn() + 1;
    var missing = SHEET_HEADERS.slice(from - 1);
    sheet.getRange(1, from, 1, missing.length)
      .setValues([missing]).setFontWeight('bold').setBackground('#d9ead3');
  }
  return sheet;
}

// פונקציית בדיקה - הרץ אותה מהעורך כדי לוודא שהכל מחובר (Run -> testOrder)
function testOrder() {
  var fake = {
    postData: {
      contents: JSON.stringify({
        orderId: 'AR-TEST-0001',
        date: '2026-07-08',
        totalItems: 5,
        totalPrice: 120.30,   // סופי: 105.30 + 15 משלוח
        subtotal: 105.30,
        discount: 0,
        shipping: 15.00,
        customer: {
          business: '', contact: 'ישראלה כהן', phone: '052-6000158',
          address: 'היצירה 16, אור יהודה', notes: 'בדיקה',
          shipping: 'איסוף מלוקר', payment: 'ביט / פייבוקס מראש'
        },
        items: [
          { id: 'ניק001', name: 'אקונומיקה 4 ליטר', qty: 2, unit: 'יחידה', price: 35.10, total: 70.20 },
          { id: 'PL001', name: 'שמפו לדוגמה', qty: 3, unit: 'יחידה', price: 35.10, total: 35.10, bundle: '2+1', free: 1 }
        ]
      })
    }
  };
  doPost(fake);
}
