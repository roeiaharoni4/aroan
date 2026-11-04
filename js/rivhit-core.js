/* נגזר מ-tools/rivhit/src (text.js, rivhit-file.js, site-order.js) ע"י tools/rivhit/build.py.
   לא לערוך ידנית — משנים ב-src ומריצים את הבנייה. נטען בעמוד ה-CRM ובסקריפט ההזמנות (ריווחית.js). */
/**
 * ממיר הזמנות לריווחית — עזרי טקסט, מספרים ותאריכים.
 * כל קבצי src/ נטענים גם בדפדפן (תחת window.RivhitCore) וגם ב-Node לבדיקות.
 */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory();
  if (node) module.exports = api;
  else root.RivhitCore = Object.assign(root.RivhitCore || {}, api);
})(this, function () {
  'use strict';

  // מאחד סוגי מירכאות, גרשיים ומקפים, ומכווץ רווחים (כולל טאבים וירידות שורה)
  function normalizeText(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/[״“”„]/g, '"')
      .replace(/[׳‘’`´]/g, "'")
      .replace(/[–—־]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // מפתח להשוואת תיאורים: "100 יח'" = "100 יח׳" = "100  יח`"
  function descKey(v) {
    return normalizeText(v)
      .replace(/["']/g, '')
      .replace(/\s*-\s*/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // מספר מתא: number כמו שהוא; "1,200" / "₪ 9" ⇒ מספר; ריק ⇒ null; כל השאר ⇒ NaN
  function toNumber(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v !== 'string') return NaN;
    var s = v.replace(/[₪,\s]/g, '');
    if (s === '') return null;
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function parseIsoDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getMonth() === Number(m[2]) - 1 ? d : null;
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function rivhitDate(d) {
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  // עד 4 ספרות אחרי הנקודה, בלי אפסים מיותרים: 12 ⇒ "12", 13.2 ⇒ "13.2"
  function formatNumber(n) {
    return (Math.round(n * 10000) / 10000).toFixed(4).replace(/\.?0+$/, '');
  }

  // טקסט מקובץ CSV: לפי ה-BOM (ריווחית מייצאת UTF-16), אחרת UTF-8, ואם אינו תקין — Windows-1255
  function decodeText(bytes) {
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); }
    catch (e) { return new TextDecoder('windows-1255').decode(bytes); }
  }

  return {
    normalizeText: normalizeText,
    descKey: descKey,
    toNumber: toNumber,
    pad2: pad2,
    parseIsoDate: parseIsoDate,
    isoDate: isoDate,
    rivhitDate: rivhitDate,
    formatNumber: formatNumber,
    decodeText: decodeText
  };
});

/**
 * ממיר הזמנות לריווחית — בניית קובץ הקליטה.
 * לפי "ממשק להפקת מסמכים מקובץ חיצוני" (docs/rivhit/): TXT, 28 שדות בטאב,
 * רשומה לכל שורת פריט, CR+LF בין רשומות, בלי כותרות ובלי שורות ריקות.
 * כל הרשומות עם אותו מספר פנימי (שדה 15) הן מסמך אחד בריווחית.
 */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./text.js') : root.RivhitCore);
  if (node) module.exports = api;
  else root.RivhitCore = Object.assign(root.RivhitCore || {}, api);
})(this, function (T) {
  'use strict';

  var FIELD_COUNT = 28;

  // שדה 4 לקוד מסמך 1 (חשבונית/מסמך). הראשון הוא ברירת המחדל.
  var DOC_TYPES = [
    { code: 7, label: 'הזמנה' },
    { code: 4, label: 'תעודת משלוח' },
    { code: 1, label: 'חשבונית מס' },
    { code: 6, label: 'הצעת מחיר' }
  ];

  // בייטים 0x80–0xFF של Windows-1255 (נוצר מ-codecs של Python; � = לא מוגדר)
  var CP1255_HIGH =
    '€�‚ƒ„…†‡ˆ‰�‹����' +
    '�‘’“”•–—˜™�›����' +
    ' ¡¢£₪¥¦§¨©×«¬­®¯' +
    '°±²³´µ¶·¸¹÷»¼½¾¿' +
    'ְֱֲֳִֵֶַָֹ�ֻּֽ־ֿ' +
    '׀ׁׂ׃װױײ׳״�������' +
    'אבגדהוזחטיךכלםמן' +
    'נסעףפץצקרשת��‎‏�';

  var cp1255Map = null;

  // מחרוזת לשדה טקסט: בלי טאבים/ירידות שורה, ומירכאות ⇐ גרשיים (״) כדי שמנגנון הקליטה
  // לא יפרש " כתוחם טקסט. הגרש (') נשאר כמו שהוא — כך השם זהה לשם הפריט בריווחית.
  function outString(v, max) {
    return T.normalizeText(v).replace(/"/g, '״').slice(0, max);
  }

  // המק"ט נשאר כמו שהוא — שינוי תו בו הוא מק"ט אחר
  function outCode(v) {
    return String(v == null ? '' : v).replace(/[\t\r\n]/g, '').trim();
  }

  function validateSettings(s) {
    var p = [];
    var no = String(s.customerNo == null ? '' : s.customerNo).trim();
    if (!/^\d{1,5}$/.test(no) || Number(no) < 1) p.push('מספר הלקוח בריווחית חסר או לא תקין (עד 5 ספרות)');
    if (!T.normalizeText(s.customerName)) p.push('שם כרטיס הלקוח חסר');
    return p;
  }

  function validateOrder(order) {
    var p = [];
    if (!T.normalizeText(order.branch)) p.push('שם הסניף חסר');
    if (!T.parseIsoDate(order.date)) p.push('תאריך ההזמנה לא תקין');
    if (!order.lines.length) p.push('לא נמצאו שורות עם כמות');
    order.lines.forEach(function (l) {
      var where = 'שורה ' + l.row + ' (' + l.desc + ')';
      if (!l.code) p.push(where + ': אין מק״ט בריווחית');
      else if (outCode(l.code).length > 15) p.push(where + ': מק״ט ארוך מ-15 תווים');
      if (!(typeof l.qty === 'number' && l.qty > 0)) p.push(where + ': כמות לא מובנת');
      if (!(typeof l.price === 'number' && l.price >= 0)) p.push(where + ': מחיר חסר');
    });
    return p;
  }

  // מסמך אחד בריווחית: רשומה לכל שורה. משותף לממיר של הרשת ולהזמנות מהאתר.
  // doc = {docType, today, date (Date), customerNo, lastName, firstName, street, internalNo,
  //        lines:[{code, name, qty, price}]}
  function buildDocument(doc) {
    var created = T.rivhitDate(doc.today);
    var opDate = T.rivhitDate(doc.date);
    return doc.lines.map(function (l, i) {
      var f = [];
      for (var k = 0; k < FIELD_COUNT; k++) f.push('');
      f[0] = '1';                                          // קוד מסמך: חשבונית/מסמך
      f[1] = created;                                      // תאריך יצירת הקובץ
      f[2] = opDate;                                       // תאריך הפעולה המקורית
      f[3] = String(doc.docType);                          // סוג מסמך
      f[4] = outCode(l.code);                              // מספר קטלוגי
      f[5] = outString(l.name, 100);                       // שם פריט
      f[6] = T.formatNumber(l.qty);                        // כמות
      f[7] = T.formatNumber(l.price);                      // מחיר ליחידה
      f[8] = T.formatNumber(l.qty * l.price);              // סה"כ לשורה
      f[9] = String(Number(doc.customerNo));               // מספר לקוח
      f[10] = outString(doc.lastName, 30);                 // שם משפחה
      f[11] = outString(doc.firstName, 20);                // שם פרטי
      f[12] = outString(doc.street, 30);                   // כתובת – רחוב
      f[14] = String(doc.internalNo);                      // מספר פעולה פנימי
      f[25] = String(i + 1);                               // סדר הדפסה במסמך
      return f;
    });
  }

  // הממיר של הרשת: הסניף בשדה הרחוב, וההערה מהטופס מוצמדת לשם הפריט
  function buildRecords(order, opts) {
    return buildDocument({
      docType: opts.docType,
      today: opts.today,
      date: T.parseIsoDate(order.date),
      customerNo: opts.customerNo,
      lastName: opts.customerName,
      firstName: '',
      street: order.branch,
      internalNo: opts.internalNo,
      lines: order.lines.map(function (l) {
        var name = l.name || l.desc;
        return { code: l.code, name: l.note ? name + ' - ' + l.note : name, qty: l.qty, price: l.price };
      })
    });
  }

  function serialize(records) {
    return records.map(function (r) { return r.join('\t'); }).join('\r\n');
  }

  function encodeCp1255(text) {
    if (!cp1255Map) {
      cp1255Map = {};
      for (var i = 0; i < 128; i++) {
        var ch = CP1255_HIGH.charAt(i);
        if (ch !== '�') cp1255Map[ch] = 0x80 + i;
      }
    }
    var out = [], unknown = 0;
    for (var j = 0; j < text.length; j++) {
      var c = text.charCodeAt(j);
      if (c < 0x80) { out.push(c); continue; }
      var b = cp1255Map[text.charAt(j)];
      if (b === undefined) { out.push(0x3F); unknown++; } else out.push(b);
    }
    return { bytes: new Uint8Array(out), unknown: unknown };
  }

  function encodeText(text, encoding) {
    if (encoding !== 'utf8') return encodeCp1255(text);
    var body = new TextEncoder().encode(text);
    var bytes = new Uint8Array(body.length + 3);
    bytes.set([0xEF, 0xBB, 0xBF]);
    bytes.set(body, 3);
    return { bytes: bytes, unknown: 0 };
  }

  // מספר פעולה פנימי בן 6 ספרות: ספרת השנה + היום בשנה (001–366) + מונה יומי (01–99).
  // 630701 = 2026, יום 307, הזמנה ראשונה. לא חוזר על עצמו 10 שנים.
  // (בפורמט הקודם, YYMMDDNNNN, המספר עבר את 2,147,483,647 — ייתכן שריווחית לא קיבלה אותו)
  function nextInternalNo(counter, today) {
    var y = today.getFullYear();
    var dayOfYear = Math.round((Date.UTC(y, today.getMonth(), today.getDate()) - Date.UTC(y, 0, 1)) / 86400000) + 1;
    var day = String(y).slice(-1) + ('00' + dayOfYear).slice(-3);
    var n = counter && counter.day === day ? counter.n + 1 : 1;
    if (n > 99) throw new Error('הופקו היום 99 הזמנות — אין מספר פנימי פנוי עד מחר');
    return { no: day + T.pad2(n), counter: { day: day, n: n } };
  }

  // טביעת תוכן להזמנה (סניף + שורות, בלי תאריך) — לאזהרה על הפקה כפולה
  function orderFingerprint(order) {
    var parts = order.lines.map(function (l) {
      return T.descKey(l.desc) + '|' + l.qty + '|' + l.price;
    }).sort();
    var s = T.descKey(order.branch) + '\n' + parts.join('\n');
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  // שם הקובץ שיורד: שמות החנויות ("פולו גלילות + טומי רמת אביב.txt"), בלי תווים שאסורים
  // בשמות קבצים ב-Windows. הרבה חנויות ⇒ הראשונות + "ועוד N". בלי שם ⇒ fallback.
  function outputFileName(branches, fallback) {
    var MAX = 100, names = [];
    (branches || []).forEach(function (b) {
      var n = T.normalizeText(String(b || '').replace(/[\\/:*?"<>|]/g, ' ')).replace(/[. ]+$/, '');
      if (n && names.indexOf(n) === -1) names.push(n);
    });
    if (!names.length) return fallback + '.txt';
    var out = names[0];
    for (var i = 1; i < names.length; i++) {
      var rest = names.length - i;
      if ((out + ' + ' + names[i]).length > MAX - 10) return out + ' ועוד ' + rest + '.txt';
      out += ' + ' + names[i];
    }
    return out + '.txt';
  }

  return {
    outputFileName: outputFileName,
    DOC_TYPES: DOC_TYPES,
    validateSettings: validateSettings,
    validateOrder: validateOrder,
    buildDocument: buildDocument,
    buildRecords: buildRecords,
    serialize: serialize,
    encodeCp1255: encodeCp1255,
    encodeText: encodeText,
    nextInternalNo: nextInternalNo,
    orderFingerprint: orderFingerprint
  };
});

/**
 * קובץ קליטה לריווחית מהזמנה שהגיעה מהאתר (סבב 88).
 * נטען ב-Node (בדיקות), בדפדפן (עמוד ה-CRM) וב-Apps Script (סקריפט ההזמנות),
 * דרך js/rivhit-core.js שנבנה ב-tools/rivhit/build.py.
 * אפיון: docs/superpowers/specs/2026-11-04-rivhit-from-site-orders-design.md
 */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./text.js') : root.RivhitCore,
                    node ? require('./rivhit-file.js') : root.RivhitCore);
  if (node) module.exports = api;
  else root.RivhitCore = Object.assign(root.RivhitCore || {}, api);
})(this, function (T, F) {
  'use strict';

  var OCCASIONAL_CUSTOMER = 118;
  var SITE_DOC_TYPES = [
    { code: 7, label: 'הזמנה' },
    { code: 4, label: 'תעודת משלוח' },
    { code: 1, label: 'חשבונית מס' },
    { code: 6, label: 'הצעת מחיר' }
  ];

  // CSV לפי RFC 4180: מירכאות, "" בתוך מירכאות, פסיקים וירידות שורה בתוך שדה
  function parseCsv(text) {
    var s = String(text || '').replace(/^﻿/, '');
    var rows = [], row = [], field = '', q = false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (q) {
        if (c === '"') {
          if (s.charAt(i + 1) === '"') { field += '"'; i++; } else q = false;
        } else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s.charAt(i + 1) === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    var head = rows.shift() || [];
    return rows
      .filter(function (r) { return !(r.length === 1 && r[0] === ''); })
      .map(function (r) {
        var o = {};
        head.forEach(function (h, j) { o[h] = r[j] == null ? '' : r[j]; });
        return o;
      });
  }

  // {מזהה באתר: מק"ט בריווחית}. עמודת rivhit יכולה להכיל כמה מק"טים מופרדים ב-| — הראשון.
  function rivhitCodeMap(rows) {
    var m = {};
    (rows || []).forEach(function (r) {
      var code = String(r.rivhit || '').split('|')[0].trim();
      if (r.id && code) m[String(r.id).trim()] = code;
    });
    return m;
  }

  function orderParts(orderId) {
    var m = /^[A-Z]{2}-(\d{4})(\d{2})(\d{2})-(\d{1,6})$/.exec(String(orderId || '').trim());
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
    return { date: d, serial: m[4] };
  }

  function siteOrderDate(orderId) {
    var p = orderParts(orderId);
    return p ? p.date : null;
  }

  // יום בשנה (3 ספרות) + המספר שבסוף מספר ההזמנה (6 ספרות). 7–9 ספרות: לא מתנגש במספרי
  // הממיר (6 ספרות) ונשאר מתחת ל-2^31 (הגבול שבגללו קוצר המספר בסבב 84).
  function siteInternalNo(orderId) {
    var p = orderParts(orderId);
    if (!p) return null;
    var d = p.date;
    var day = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) -
      Date.UTC(d.getFullYear(), 0, 1)) / 86400000) + 1;
    return day * 1000000 + Number(p.serial);
  }

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[₪,\s]/g, ''));
    return isFinite(n) && n > 0 ? n : 0;
  }

  function docLabel(code) {
    for (var i = 0; i < SITE_DOC_TYPES.length; i++) {
      if (SITE_DOC_TYPES[i].code === Number(code)) return SITE_DOC_TYPES[i].label;
    }
    return 'מסמך';
  }

  function fileName(customer, docType) {
    // מירכאות ⇐ גרשיים (״ מותר בשם קובץ ב-Windows, " לא), ושאר התווים האסורים ⇐ רווח
    var base = T.normalizeText(String(customer.business || customer.contact || 'הזמנה מהאתר'))
      .replace(/"/g, '״').replace(/[\\/:*?<>|]/g, ' ').replace(/\s+/g, ' ')
      .replace(/[. ]+$/, '').trim().slice(0, 60);
    return (base || 'הזמנה מהאתר') + ' - ' + docLabel(docType) + '.txt';
  }

  // order = {orderId, customer:{business, contact, address}, items:[{id, name, qty, price}]}
  // codes = rivhitCodeMap(...); opts = {docType, customerNo, today}
  function siteOrderDocument(order, codes, opts) {
    var customer = order.customer || {};
    var missing = [], lines = [];
    (order.items || []).forEach(function (it) {
      var qty = num(it.qty);
      if (!qty) return;
      var code = codes[String(it.id || '').trim()];
      if (!code) { missing.push(String(it.name || it.id || '')); return; }
      lines.push({ code: code, name: String(it.name || ''), qty: qty, price: num(it.price) });
    });
    var out = { records: [], missing: missing, fileName: fileName(customer, opts.docType), text: '' };
    var internalNo = siteInternalNo(order.orderId);
    if (internalNo === null) { out.error = 'bad order id'; return out; }
    if (!lines.length) return out;
    var business = T.normalizeText(customer.business);
    var contact = T.normalizeText(customer.contact);
    out.records = F.buildDocument({
      docType: opts.docType,
      today: opts.today,
      date: siteOrderDate(order.orderId),
      customerNo: /^\d{1,5}$/.test(String(opts.customerNo || '').trim()) && Number(opts.customerNo) > 0
        ? String(opts.customerNo).trim() : OCCASIONAL_CUSTOMER,
      lastName: business || contact,
      firstName: business ? contact : '',
      street: customer.address,
      internalNo: internalNo,
      lines: lines
    });
    out.text = F.serialize(out.records);
    return out;
  }

  return {
    OCCASIONAL_CUSTOMER: OCCASIONAL_CUSTOMER,
    SITE_DOC_TYPES: SITE_DOC_TYPES,
    parseCsv: parseCsv,
    rivhitCodeMap: rivhitCodeMap,
    siteOrderDate: siteOrderDate,
    siteInternalNo: siteInternalNo,
    siteOrderDocument: siteOrderDocument
  };
});
