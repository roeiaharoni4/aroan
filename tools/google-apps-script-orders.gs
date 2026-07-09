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

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = getOrCreateSheet_();

    var customer = data.customer || {};
    var itemsText = (data.items || []).map(function (item) {
      return item.name + ' (מק"ט ' + item.id + ') x' + item.qty + ' ' + (item.unit || '');
    }).join('\n');

    sheet.appendRow([
      new Date(),                    // תאריך קבלה
      data.orderId || '',            // מספר הזמנה
      data.date || '',               // תאריך אספקה מבוקש
      customer.business || '',       // שם העסק
      customer.contact || '',        // איש קשר
      customer.phone || '',          // טלפון
      customer.address || '',        // כתובת למשלוח
      customer.notes || '',          // הערות
      itemsText,                     // פירוט פריטים
      data.totalItems || '',         // סה"כ פריטים
      'חדשה'                         // סטטוס
    ]);

    // מייל התראה
    if (NOTIFY_EMAIL) {
      var subject = 'הזמנה חדשה מהאתר #' + (data.orderId || '') +
        (customer.business ? ' - ' + customer.business : '');
      var body = 'התקבלה הזמנה חדשה:\n\n' +
        'מספר הזמנה: ' + (data.orderId || '') + '\n' +
        'שם העסק: ' + (customer.business || 'לא צוין') + '\n' +
        'איש קשר: ' + (customer.contact || 'לא צוין') + '\n' +
        'טלפון: ' + (customer.phone || 'לא צוין') + '\n' +
        'כתובת: ' + (customer.address || 'לא צוינה') + '\n' +
        'הערות: ' + (customer.notes || 'אין') + '\n\n' +
        'פירוט:\n' + itemsText + '\n\n' +
        'סה"כ פריטים: ' + (data.totalItems || '') + '\n\n' +
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

// יוצר את הגיליון עם כותרות ורשימת סטטוסים - בפעם הראשונה בלבד
function getOrCreateSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    var headers = ['תאריך קבלה', 'מספר הזמנה', 'תאריך אספקה מבוקש', 'שם העסק',
      'איש קשר', 'טלפון', 'כתובת למשלוח', 'הערות', 'פירוט פריטים', 'סה"כ פריטים', 'סטטוס'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#d9ead3');
    sheet.setFrozenRows(1);
    sheet.setRightToLeft(true);

    // רשימה נפתחת לעמודת הסטטוס
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['חדשה', 'בטיפול', 'סופקה', 'חשבונית הופקה', 'בוטלה'], true)
      .build();
    sheet.getRange(2, headers.length, 1000, 1).setDataValidation(rule);
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
        totalItems: 3,
        customer: { business: 'עסק לדוגמה', contact: 'רועי', phone: '052-6000158', address: 'היצירה 16, אור יהודה', notes: 'בדיקה' },
        items: [{ id: 'ניק001', name: 'אקונומיקה 4 ליטר', qty: 3, unit: 'יחידה' }]
      })
    }
  };
  doPost(fake);
}
