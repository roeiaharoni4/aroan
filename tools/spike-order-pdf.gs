/**
 * ספייק חד-פעמי: בדיקה שהממיר HTML→PDF של גוגל עומד בדרישות.
 * להרצה: הדבק בפרויקט Apps Script חדש, הרץ runSpike, ובדוק את המייל.
 * אחרי ההכרעה אפשר למחוק את הפרויקט — הוא לא חלק מהמערכת.
 */
var SPIKE_EMAIL = 'meiraroam@gmail.com';
var SITE = 'https://aroam.co.il/';

function runSpike() {
  // ארבע התמונות שנבדקות: PNG חי, WebP חי בנתיב עברי עם רווחים,
  // JPG חי, וכתובת שבורה בכוונה (כדי לוודא שהמסמך לא קורס).
  var imgs = [
    SITE + 'images/logo.png',
    SITE + encodeURI('images/מוצרי נייר/גליל נייר תעשייתי 5004.webp'),
    SITE + 'images/og-image.png',
    SITE + 'images/__does_not_exist__.png'
  ];

  var rows = '';
  for (var i = 0; i < imgs.length; i++) {
    rows += '<tr>' +
      '<td style="width:70px; padding:6px; border:1px solid #DFE9E3;">' +
        '<img src="' + imgs[i] + '" style="width:56px; height:56px; object-fit:contain;">' +
      '</td>' +
      '<td style="padding:6px; border:1px solid #DFE9E3;">' +
        'שורה ' + (i + 1) + ' — בדיקת עברית, גרשיים ״ וגרש ׳, ומספר 1,234.56 ₪' +
      '</td></tr>';
  }

  var html =
    '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"></head>' +
    '<body style="direction:rtl; font-family:Arial,sans-serif;">' +
    '<div style="background:#1A4231; color:#fff; padding:14px; border-radius:8px;">' +
      '<strong style="font-size:16pt;">אהרוני שיווק והפצה</strong><br>' +
      '<span style="color:#8FD6A3; font-size:14pt;">AR-SPIKE-0001</span>' +
    '</div>' +
    '<table style="width:100%; border-collapse:collapse; margin-top:12px;">' + rows + '</table>' +
    '</body></html>';

  var pdf = Utilities.newBlob(html, MimeType.HTML, 'spike.pdf').getAs(MimeType.PDF);

  // עותק ב-Drive עם קישור ציבורי, כדי שאפשר יהיה לבדוק את התוצאה
  // בלי לפתוח את תיבת הדואר. הקישור נרשם ביומן ההרצה.
  var file = DriveApp.createFile(pdf);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log('PDF_ID=' + file.getId());
  Logger.log('PDF_URL=https://drive.google.com/uc?export=download&id=' + file.getId());

  MailApp.sendEmail(SPIKE_EMAIL, 'ספייק PDF — בדיקת תמונות ועברית',
    'מצורף הקובץ. יש לבדוק: 1) לוגו PNG מופיע 2) תמונת WebP בנתיב עברי מופיעה ' +
    '3) העברית לא הפוכה והגרשיים תקינים 4) הכתובת השבורה לא הפילה את המסמך.',
    { attachments: [pdf] });
}
