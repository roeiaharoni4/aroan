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

// כתובת התמונה הממוזערת. הקבצים נוצרים ב-tools/make_pdf_thumbs.py.
// חובה JPEG — appendInlineImage של Docs אינו מקבל WebP, ו-155 מ-176
// תמונות המוצר באתר הן webp.
function thumbUrl_(id) {
  return 'https://aroam.co.il/images/thumbs/' + encodeURIComponent(String(id || '')) + '.jpg';
}

/**
 * קישור שפותח את ההזמנה בדף הסוכן לצורך תמחור.
 * מוחזר רק כשלהזמנה אין מחירים — כלומר רק מהקטלוג העסקי. בקטלוגי
 * הטיפוח והוועד המחירים כבר סופיים, ודף הסוכן ממילא טוען products.csv בלבד.
 */
function quoteLink_(data) {
  if (Number(data.totalPrice) > 0) return '';
  var items = data.items || [];
  if (!items.length) return '';

  var parts = [];
  for (var i = 0; i < items.length; i++) {
    if (!items[i].id || !(Number(items[i].qty) > 0)) continue;
    parts.push(encodeURIComponent(items[i].id) + ':' + Number(items[i].qty));
  }
  if (!parts.length) return '';

  var cust = data.customer || {};
  var name = cust.business || cust.contact || '';
  return 'https://aroam.co.il/agent/?cart=' + parts.join(',') +
         (name ? '&customer=' + encodeURIComponent(name) : '');
}

/**
 * מבנה טבלת המוצרים.
 * ב-Docs עמודה 0 מרונדרת בצד שמאל, ולכן הסדר הפוך לסדר הקריאה:
 * העמודה הראשונה היא הכמות (שמאל) והאחרונה היא התמונה (ימין).
 * תא התמונה נשאר ריק כאן — התמונה מצוירת בשלב הציור לפי images[].
 */
function orderColumns_(data) {
  var items = data.items || [];
  var hasPrices = Number(data.totalPrice) > 0;

  var headers = hasPrices
    ? ['סה״כ', 'מחיר ליח׳', 'כמות', 'יחידה', 'מק״ט', 'מוצר', 'תמונה']
    : ['כמות', 'יחידה', 'מק״ט', 'מוצר', 'תמונה'];

  var qtyCol = hasPrices ? 2 : 0;
  var nameCol = headers.length - 2;
  var imageCol = headers.length - 1;

  var rows = [], images = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];

    var name = clean_(it.name, 120);
    if (it.category) {
      name += '\n' + clean_(it.category, 60);
    }
    if (Number(it.free) > 0) {
      name += '\nמבצע ' + clean_(it.bundle, 10) + ' — ' + clean_(it.free, 10) + ' חינם';
    }

    var row = hasPrices
      ? [Number(it.total || 0).toFixed(2) + ' ₪',
         Number(it.price || 0).toFixed(2) + ' ₪',
         String(it.qty), clean_(it.unit, 20), clean_(it.id, 30), name, '']
      : [String(it.qty), clean_(it.unit, 20), clean_(it.id, 30), name, ''];

    rows.push(row);
    images.push(it.image && it.id ? thumbUrl_(it.id) : null);
  }

  return {
    headers: headers, rows: rows, images: images,
    hasPrices: hasPrices, qtyCol: qtyCol, nameCol: nameCol, imageCol: imageCol
  };
}

// ===== תעודת הזמנה כמסמך Google Docs -> PDF =====
// מבוסס על .superpowers/sdd/order-doc-reference.gs (הספייק שאושר על ידי רועי),
// אך גנרי: מבנה הטבלה (עמודות/רוחבים/מחירים) מגיע מ-orderColumns_(data)
// ולא קשיח כאן. פלטת המותג בלבד.
var OD_G = '#1A4231', OD_M = '#639C7D', OD_P = '#8FD6A3',
    OD_L = '#DFE9E3', OD_BG = '#F7FBF8', OD_GY = '#6B7B72';

function tight_(p) {
  p.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1.05);
  return p;
}

function kv_(cell, k, v) {
  var s = k + '   ' + v;
  var p = tight_(cell.appendParagraph(s));
  p.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  var t = p.editAsText();
  t.setFontFamily('Arial').setFontSize(9.5).setBold(false);
  t.setForegroundColor(0, k.length - 1, OD_GY);
  t.setForegroundColor(k.length, s.length - 1, '#22312A');
  t.setBold(k.length + 3, s.length - 1, true);
  return p;
}

function money_(v) {
  return Number(v || 0).toFixed(2) + ' ₪';
}

// רוחב עמודות טבלת המוצרים. כמות/יחידה/מק"ט/מחיר/סה"כ/תמונה מקבלים רוחב
// קבוע; עמודת המוצר (nameCol, תמיד אחת לפני התמונה) סופגת את מה שנשאר.
function orderColWidths_(headers) {
  var FIXED = {
    'כמות': 46, 'יחידה': 58, 'מק״ט': 66, 'מחיר ליח׳': 64, 'סה״כ': 60, 'תמונה': 56
  };
  var TOTAL = 535;
  var nameIdx = headers.length - 2;
  var widths = [], used = 0, i, w;
  for (i = 0; i < headers.length; i++) {
    if (i === nameIdx) { widths.push(0); continue; }
    w = FIXED[headers[i]] || 60;
    widths.push(w);
    used += w;
  }
  widths[nameIdx] = Math.max(140, TOTAL - used);
  return widths;
}

/**
 * בונה את מסמך תעודת ההזמנה כ-Google Doc, מייצא ל-PDF ומוחק את מסמך הביניים.
 * data הוא אותו מבנה שנשלח מהאתר ל-doPost (ראה testOrder לדוגמה מלאה).
 */
function buildOrderDoc_(data) {
  var RIGHT = DocumentApp.HorizontalAlignment.RIGHT;
  var LEFT = DocumentApp.HorizontalAlignment.LEFT;
  var CENTER = DocumentApp.HorizontalAlignment.CENTER;

  var cols = orderColumns_(data);
  var customer = data.customer || {};

  var doc = DocumentApp.create('order-' + (data.orderId || new Date().getTime()));
  // מרגע שהמסמך נוצר, כל כשל בבנייתו (כולל ביצירת ה-PDF) חייב עדיין להוביל
  // למחיקת מסמך הביניים ב-finally — אחרת הוא דולף לצמיתות ב-Drive.
  try {
  var body = doc.getBody();
  body.setMarginTop(30).setMarginBottom(30).setMarginLeft(30).setMarginRight(30);
  var first = body.getChild(0);

  // ----- רצועת כותרת: לוגו צמוד לשם העסק, ופרטי ההזמנה בצד השני -----
  var head = body.appendTable([['', '', '']]);
  head.setBorderWidth(0);
  head.setColumnWidth(0, 60); head.setColumnWidth(1, 240); head.setColumnWidth(2, 235);
  var hLogo = head.getCell(0, 0), hName = head.getCell(0, 1), hOrder = head.getCell(0, 2);
  hLogo.setBackgroundColor(OD_G).setPaddingTop(11).setPaddingBottom(11).setPaddingLeft(6).setPaddingRight(6);
  hName.setBackgroundColor(OD_G).setPaddingTop(11).setPaddingBottom(11).setPaddingLeft(4).setPaddingRight(4);
  hOrder.setBackgroundColor(OD_G).setPaddingTop(11).setPaddingBottom(11).setPaddingLeft(12).setPaddingRight(12);

  var pLogo = tight_(hLogo.getChild(0).asParagraph());
  pLogo.setAlignment(CENTER);
  try {
    var logoBlob = UrlFetchApp.fetch('https://aroam.co.il/images/logo.png').getBlob();
    pLogo.appendInlineImage(logoBlob).setWidth(44).setHeight(20);
  } catch (eLogo) {}

  var pName = tight_(hName.getChild(0).asParagraph()); pName.setAlignment(RIGHT);
  pName.setText('אהרוני שיווק והפצה');
  pName.editAsText().setFontFamily('Arial').setForegroundColor('#FFFFFF').setBold(true).setFontSize(13);
  var pTag = tight_(hName.appendParagraph('חומרי ניקוי · נייר · חד פעמי · ציוד משרדי'));
  pTag.setAlignment(RIGHT);
  pTag.editAsText().setFontFamily('Arial').setForegroundColor('#BFD9CB').setBold(false).setFontSize(8);

  var pOrderTitle = tight_(hOrder.getChild(0).asParagraph()); pOrderTitle.setAlignment(LEFT);
  pOrderTitle.setText('תעודת הזמנה');
  pOrderTitle.editAsText().setFontFamily('Arial').setForegroundColor(OD_L).setBold(false).setFontSize(10);
  var pOrderId = tight_(hOrder.appendParagraph(clean_(data.orderId, 30)));
  pOrderId.setAlignment(LEFT);
  pOrderId.editAsText().setFontFamily('Arial').setForegroundColor(OD_P).setBold(true).setFontSize(15);
  var receivedAt = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd.MM.yyyy HH:mm');
  var pReceived = tight_(hOrder.appendParagraph('התקבלה ' + receivedAt));
  pReceived.setAlignment(LEFT);
  pReceived.editAsText().setFontFamily('Arial').setForegroundColor('#BFD9CB').setBold(false).setFontSize(8);

  tight_(body.appendParagraph('')).editAsText().setFontSize(4);

  // ----- כרטיסי פרטי לקוח / פרטי הזמנה -----
  // ניסיון קודם צייר פס ירוק עליון על כל כרטיס בנפרד (טבלת "strip" דקה
  // מעל טבלת כרטיס, בתוך תא-עטיפה משותף), אבל זה רינדר כרצועה ירוקה אחת
  // ברוחב מלא ומנותקת מהכרטיסים. ויתרנו על הפס וחזרנו למבנה הפשוט שכבר
  // אומת בספייק: טבלה אחת בת שני תאים עם מסגרת ורקע אחידים.
  var cards = body.appendTable([['', '']]);
  cards.setBorderColor(OD_L).setBorderWidth(1);
  cards.setColumnWidth(0, 267); cards.setColumnWidth(1, 268);
  var custCell = cards.getCell(0, 0), ordCell = cards.getCell(0, 1);
  custCell.setBackgroundColor(OD_BG).setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);
  ordCell.setBackgroundColor(OD_BG).setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);

  var tCust = tight_(custCell.getChild(0).asParagraph()); tCust.setAlignment(RIGHT); tCust.setText('פרטי הלקוח');
  tCust.editAsText().setFontFamily('Arial').setForegroundColor(OD_M).setBold(true).setFontSize(9);
  if (customer.business) kv_(custCell, 'שם העסק', clean_(customer.business, 100));
  if (customer.contact) kv_(custCell, 'איש קשר', clean_(customer.contact, 100));
  if (customer.phone) kv_(custCell, 'טלפון', clean_(customer.phone, 30));
  if (customer.address) kv_(custCell, 'כתובת', clean_(customer.address, 200));

  var tOrd = tight_(ordCell.getChild(0).asParagraph()); tOrd.setAlignment(RIGHT); tOrd.setText('פרטי ההזמנה');
  tOrd.editAsText().setFontFamily('Arial').setForegroundColor(OD_M).setBold(true).setFontSize(9);
  if (data.date) kv_(ordCell, 'אספקה מבוקשת', clean_(data.date, 20));
  if (customer.shipping) kv_(ordCell, 'שיטת אספקה', clean_(customer.shipping, 60));
  if (customer.payment) kv_(ordCell, 'אופן תשלום', clean_(customer.payment, 60));
  kv_(ordCell, 'סה״כ פריטים', clean_(data.totalItems, 10));
  kv_(ordCell, 'סטטוס', 'חדשה');

  tight_(body.appendParagraph('')).editAsText().setFontSize(4);

  // ----- טבלת המוצרים -----
  var headers = cols.headers, rows = cols.rows, images = cols.images;
  var widths = orderColWidths_(headers);
  var tableData = [headers];
  var r;
  for (r = 0; r < rows.length; r++) tableData.push(rows[r]);
  var t = body.appendTable(tableData);
  t.setBorderColor(OD_L).setBorderWidth(1);
  for (r = 0; r < widths.length; r++) t.setColumnWidth(r, widths[r]);

  var c;
  for (c = 0; c < headers.length; c++) {
    var h = t.getCell(0, c);
    h.setBackgroundColor(OD_M).setPaddingTop(6).setPaddingBottom(6);
    tight_(h.getChild(0).asParagraph()).setAlignment(c === cols.nameCol ? RIGHT : CENTER);
    h.editAsText().setFontFamily('Arial').setForegroundColor('#FFFFFF').setBold(true).setFontSize(9);
  }

  for (r = 1; r <= rows.length; r++) {
    var even = (r % 2 === 0);
    for (c = 0; c < headers.length; c++) {
      var cell = t.getCell(r, c);
      if (even) cell.setBackgroundColor(OD_BG);
      cell.setPaddingTop(5).setPaddingBottom(5);

      if (c === cols.nameCol) {
        // appendTable(tableData) כבר מפצל '\n' בתוך התא לפסקאות נפרדות —
        // רק מעצבים את הפסקאות הקיימות, לא מוסיפים חדשות (אחרת הטקסט
        // מוכפל: פעם מהפיצול האוטומטי ופעם מה-appendParagraph הידני).
        var lines = String(rows[r - 1][c] || '').split('\n');
        var nChildren = cell.getNumChildren();
        var li, lp;
        for (li = 0; li < lines.length; li++) {
          if (li < nChildren) {
            lp = tight_(cell.getChild(li).asParagraph());
          } else {
            // בטיחות: משלימים פסקה רק אם היא בפועל חסרה בתא
            lp = tight_(cell.appendParagraph(lines[li]));
          }
          lp.setAlignment(RIGHT);
          if (li === 0) {
            lp.editAsText().setFontFamily('Arial').setForegroundColor('#22312A').setBold(true).setFontSize(10);
          } else {
            lp.editAsText().setFontFamily('Arial').setForegroundColor(OD_GY).setBold(false).setFontSize(8);
          }
        }
        // ניקוי הגנתי: פסקאות עודפות מעבר ל-lines.length (כלומר התא הכיל
        // מראש יותר פסקאות ממה שאנחנו כותבים עכשיו) נשארות בעיצוב ברירת
        // המחדל של Docs ולכן מוסרות — מוחקים מהסוף כדי לא לשבש אינדקסים.
        while (cell.getNumChildren() > lines.length) {
          cell.removeChild(cell.getChild(cell.getNumChildren() - 1));
        }
      } else if (c === cols.imageCol) {
        tight_(cell.getChild(0).asParagraph()).setAlignment(CENTER);
        if (images[r - 1]) {
          try {
            var blob = UrlFetchApp.fetch(images[r - 1]).getBlob();
            cell.getChild(0).asParagraph().appendInlineImage(blob).setWidth(40).setHeight(40);
          } catch (eImg) {}
        }
      } else if (c === cols.qtyCol) {
        var qp = tight_(cell.getChild(0).asParagraph()); qp.setAlignment(CENTER); qp.setText(String(rows[r - 1][c]));
        qp.editAsText().setFontFamily('Arial').setForegroundColor(OD_G).setBold(true).setFontSize(13);
      } else {
        var op = tight_(cell.getChild(0).asParagraph()); op.setAlignment(CENTER); op.setText(String(rows[r - 1][c]));
        op.editAsText().setFontFamily('Arial').setForegroundColor('#22312A').setBold(false).setFontSize(9.5);
      }
    }
  }

  // ----- בלוק סיכום (רק כשיש מחירים): סכום ביניים / הנחה / משלוח / סה"כ -----
  // שורת הסה"כ = תא ברקע ירוק כהה (OD_G) עם טקסט לבן.
  if (cols.hasPrices) {
    tight_(body.appendParagraph('')).editAsText().setFontSize(4);
    var sumRows = [];
    if (Number(data.subtotal) > 0) sumRows.push(['סכום ביניים', money_(data.subtotal)]);
    if (Number(data.discount) > 0) sumRows.push(['הנחה', '-' + money_(data.discount)]);
    if (Number(data.shipping) > 0) sumRows.push(['דמי משלוח', money_(data.shipping)]);
    sumRows.push(['סה״כ לתשלום', money_(data.totalPrice)]);

    var sTableData = [];
    for (r = 0; r < sumRows.length; r++) sTableData.push([sumRows[r][0], sumRows[r][1]]);
    var sTable = body.appendTable(sTableData);
    sTable.setBorderWidth(0);
    sTable.setColumnWidth(0, 400); sTable.setColumnWidth(1, 135);
    for (r = 0; r < sumRows.length; r++) {
      var isTotal = (r === sumRows.length - 1);
      var lc = sTable.getCell(r, 0), vc = sTable.getCell(r, 1);
      lc.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10);
      vc.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10);
      if (isTotal) { lc.setBackgroundColor(OD_G); vc.setBackgroundColor(OD_G); }
      tight_(lc.getChild(0).asParagraph()).setAlignment(RIGHT);
      tight_(vc.getChild(0).asParagraph()).setAlignment(LEFT);
      lc.editAsText().setFontFamily('Arial').setBold(isTotal)
        .setForegroundColor(isTotal ? '#FFFFFF' : OD_GY).setFontSize(isTotal ? 12 : 9.5);
      vc.editAsText().setFontFamily('Arial').setBold(true)
        .setForegroundColor(isTotal ? '#FFFFFF' : '#22312A').setFontSize(isTotal ? 13 : 9.5);
    }
  }

  // ----- הערות הלקוח (רק אם יש), פס פסטל בצד -----
  if (customer.notes) {
    tight_(body.appendParagraph('')).editAsText().setFontSize(4);
    var nt = body.appendTable([['', '']]);
    nt.setBorderWidth(0);
    nt.setColumnWidth(0, 5); nt.setColumnWidth(1, 530);
    nt.getCell(0, 0).setBackgroundColor(OD_P).setPaddingTop(0).setPaddingBottom(0).setPaddingLeft(0).setPaddingRight(0);
    var nc = nt.getCell(0, 1);
    nc.setBackgroundColor('#F2F8F4').setPaddingTop(7).setPaddingBottom(7).setPaddingLeft(10).setPaddingRight(10);
    var np = tight_(nc.getChild(0).asParagraph()); np.setAlignment(RIGHT);
    var label = 'הערות הלקוח:   ';
    np.setText(label + clean_(customer.notes, 500));
    var nx = np.editAsText();
    nx.setFontFamily('Arial').setFontSize(9.5).setForegroundColor('#22312A').setBold(false);
    nx.setForegroundColor(0, label.length - 1, OD_G);
    nx.setBold(0, label.length - 1, true);
  }

  // ----- פוטר -----
  tight_(body.appendParagraph('')).editAsText().setFontSize(6);
  var ft = body.appendTable([['הזמנה זו נוצרה אוטומטית מהאתר aroam.co.il',
    '052-6000158 · 03-6346236 · meiraroam@gmail.com']]);
  ft.setBorderWidth(0);
  ft.setColumnWidth(0, 235); ft.setColumnWidth(1, 300);
  var f0 = ft.getCell(0, 0), f1 = ft.getCell(0, 1);
  // ריפוד פנימי (צמוד לגבול המשותף בין התאים) כדי שהטקסטים לא ייגעו זה בזה —
  // f0 מיושר לימין (הטקסט נצמד לגבול) ו-f1 מיושר לשמאל (גם הוא נצמד לאותו גבול).
  f0.setPaddingLeft(0).setPaddingRight(14); f1.setPaddingLeft(14).setPaddingRight(0);
  tight_(f0.getChild(0).asParagraph()).setAlignment(RIGHT);
  f0.editAsText().setFontFamily('Arial').setForegroundColor('#7A8A81').setBold(false).setFontSize(7.5);
  tight_(f1.getChild(0).asParagraph()).setAlignment(LEFT);
  f1.editAsText().setFontFamily('Arial').setForegroundColor(OD_G).setBold(true).setFontSize(7.5);

  first.removeFromParent();
  doc.saveAndClose();

  var pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf')
    .setName('תעודת הזמנה ' + (clean_(data.orderId, 30) || '') + '.pdf');
  return pdfBlob;
  } finally {
    // מחיקת מסמך הביניים לא יכולה להסתיר כשל מקורי — אם היא עצמה נכשלת
    // (למשל המסמך כבר לא קיים), פשוט מתעלמים וממשיכים לפרוש את השגיאה המקורית.
    try {
      DriveApp.getFileById(doc.getId()).setTrashed(true);
    } catch (eTrash) {}
  }
}

var PDF_FOLDER_NAME = 'הזמנות אהרוני — PDF';

// מחזיר את תיקיית היעד ב-Drive, ויוצר אותה בפעם הראשונה
function pdfFolder_() {
  var it = DriveApp.getFoldersByName(PDF_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PDF_FOLDER_NAME);
}

/**
 * מייצר את ה-PDF ושומר עותק ב-Drive.
 * מחזיר null בכל כישלון — הקורא ממשיך בלעדיו.
 */
function savePdf_(data) {
  try {
    var name = (clean_(data.orderId, 30) || 'order') + '.pdf';
    var blob = buildOrderDoc_(data).setName(name);
    var file = pdfFolder_().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { blob: blob, url: file.getUrl() };
  } catch (err) {
    Logger.log('PDF failed: ' + err);
    return null;
  }
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

    // תעודת ההזמנה. כישלון כאן לא מפיל את ההזמנה — הפונקציה מחזירה null.
    var pdf = savePdf_(data);

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
      clean_(customer.payment, 60),        // אופן תשלום (ריק בקטלוג העסקי)
      pdf ? pdf.url : ''                   // קובץ PDF
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
      var qlink = quoteLink_(data);
      if (qlink) {
        body += '\n\nלהפיכת ההזמנה להצעת מחיר (נפתח בדף הסוכן עם המחירים):\n' + qlink + '\n';
      }
      var mailOpts = pdf ? { attachments: [pdf.blob] } : {};
      MailApp.sendEmail(NOTIFY_EMAIL, subject, body, mailOpts);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// כותרות הגיליון. העמודות האחרונות נוספו אחרי "סטטוס" ולא באמצע השורה,
// כדי שגיליון קיים עם הזמנות ישנות לא יזוז — בשורות הישנות הן פשוט יישארו ריקות.
var SHEET_HEADERS = ['תאריך קבלה', 'מספר הזמנה', 'תאריך אספקה מבוקש', 'שם העסק',
  'איש קשר', 'טלפון', 'כתובת למשלוח', 'הערות', 'פירוט פריטים', 'סה"כ פריטים',
  'סה"כ לתשלום', 'סטטוס', 'שיטת אספקה', 'דמי משלוח', 'אופן תשלום', 'קובץ PDF'];
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
