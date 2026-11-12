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
})(typeof globalThis !== 'undefined' ? globalThis : this, function (T, F) {
  'use strict';

  var OCCASIONAL_CUSTOMER = 118;
  var SITE_DOC_TYPES = [
    { code: 7, label: 'הזמנה' },
    { code: 4, label: 'תעודת משלוח' },
    { code: 1, label: 'חשבונית מס' },
    { code: 6, label: 'הצעת מחיר' }
  ];

  // CSV לפי RFC 4180: מירכאות, "" בתוך מירכאות, מפרידים וירידות שורה בתוך שדה.
  // המפריד נקבע לפי שורת הכותרת: ייצוא הפריטים של ריווחית מגיע גם מופרד בטאבים (12.11.26).
  function parseCsv(text) {
    var s = String(text || '').replace(/^﻿/, '');
    var nl = s.search(/[\r\n]/);
    var sep = (nl < 0 ? s : s.slice(0, nl)).indexOf('\t') >= 0 ? '\t' : ',';
    // start: בתחילת שדה. רק שם מירכאות פותחות שדה עטוף; באמצע שדה לא עטוף הן תו
    // רגיל (1 ק"ג) — כך ריווחית מייצאת, וכך פייתון ואקסל קוראים.
    var rows = [], row = [], field = '', q = false, start = true;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (q) {
        if (c === '"') {
          if (s.charAt(i + 1) === '"') { field += '"'; i++; } else q = false;
        } else field += c;
      } else if (c === '"' && start) { q = true; start = false; }
      else if (c === sep) { row.push(field); field = ''; start = true; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s.charAt(i + 1) === '\n') i++;
        row.push(field); field = ''; start = true;
        rows.push(row); row = [];
      } else { field += c; start = false; }
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

  // מק"ט בריווחית = המספר הקטלוגי של הפריט (item_part_num). זה מה שריווחית מחפשת
  // בשדה 5, ולא מספר הפריט (item_num) — שליחת מספר הפריט פתחה פריטים כפולים (סבב 91).
  // 1–15 תווים; טאב, ירידת שורה ומירכאות שוברים את קובץ הקליטה, ו-| הוא המפריד בעמודת rivhit.
  function catalogCode(v) {
    var s = String(v == null ? '' : v).trim();
    return s.length <= 15 && /^[^\t\r\n"|]+$/.test(s) ? s : '';
  }

  // {מזהה באתר: מספר קטלוגי בריווחית}. עמודת rivhit יכולה להכיל כמה מספרים מופרדים ב-| — הראשון.
  function rivhitCodeMap(rows) {
    var m = {};
    (rows || []).forEach(function (r) {
      var code = catalogCode(String(r.rivhit || '').split('|')[0]);
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

  function rivhitOf(it) {
    return catalogCode(it && it.rivhit);
  }

  // קבוצה "לא פעיל" בריווחית: לשם רועי מעביר פריטים כפולים (12.11.26). int1 הוא מספר
  // הקבוצה, ו-compute_0037 השם שלה.
  function isInactiveItem(r) {
    return String(r.int1 == null ? '' : r.int1).trim() === '9999' ||
      T.normalizeText(r.compute_0037) === 'לא פעיל';
  }

  // ייצוא הפריטים של ריווחית ⇒ [[מספר, שם, מספר קטלוגי], ...]. רק שלוש העמודות
  // האלה יוצאות מהמכשיר — מחירי העלות ושאר העמודות נשארים בקובץ.
  // פריט בקבוצה "לא פעיל" ופריט בלי מספר קטלוגי לא נכנסים: בלי מספר קטלוגי
  // ריווחית לא מזהה את הפריט בקליטה, ופותחת פריט חדש.
  function itemExportRows(rows) {
    rows = rows || [];
    if (!rows.length || !('item_num' in rows[0]) || !('item_name' in rows[0])) {
      return { items: [], inactive: 0, noCatalog: 0,
        error: 'זה לא קובץ ייצוא הפריטים של ריווחית (חסרות העמודות item_num ו-item_name).' };
    }
    if (!('item_part_num' in rows[0])) {
      return { items: [], inactive: 0, noCatalog: 0,
        error: 'בקובץ אין את עמודת המספר הקטלוגי (item_part_num) — צריך את הייצוא המלא מריווחית.' };
    }
    var seen = {}, items = [], inactive = 0, noCatalog = 0;
    rows.forEach(function (r) {
      var n = String(r.item_num == null ? '' : r.item_num).trim();
      var name = T.normalizeText(r.item_name).slice(0, 100);
      if (!/^\d{1,15}$/.test(n) || !name || seen[n]) return;
      seen[n] = true;
      if (isInactiveItem(r)) { inactive++; return; }
      var cat = catalogCode(r.item_part_num);
      if (!cat) { noCatalog++; return; }
      items.push([n, name, cat]);
    });
    return { items: items, inactive: inactive, noCatalog: noCatalog,
      error: items.length ? '' : 'לא נמצאו בקובץ פריטים פעילים עם מספר, שם ומספר קטלוגי.' };
  }

  // order = {orderId, customer:{business, contact, address}, items:[{id, name, qty, price, rivhit?}]}
  // codes = rivhitCodeMap(...); opts = {docType, customerNo, today}
  function siteOrderDocument(order, codes, opts) {
    var customer = order.customer || {};
    var missing = [], lines = [];
    (order.items || []).forEach(function (it) {
      var qty = num(it.qty);
      if (!qty) return;
      // מוצר אתר — לפי המפה החיה מ-products.csv; פריט שנבחר מרשימת ריווחית
      // בדף הסוכן — לפי המק"ט שהוא נושא (אפיון 2026-11-09)
      var code = codes[String(it.id || '').trim()] || rivhitOf(it);
      if (!code) { missing.push(String(it.name || it.id || '')); return; }
      lines.push({ code: code, name: String(it.name || ''), qty: qty, price: num(it.price) });
    });
    var out = { records: [], missing: missing, fileName: fileName(customer, opts.docType), text: '' };
    var internalNo = siteInternalNo(order.orderId);
    if (internalNo === null) { out.error = 'bad order id'; return out; }
    if (!lines.length) return out;
    // שם העסק בשני שדות השם (12.11.26): על לקוח 118 ("לקוחות שונים") זה מה שמזהה את
    // הלקוח במסמך. בלי שם עסק — איש הקשר בשניהם. החיתוך ל-30/20 תווים ב-buildDocument.
    var who = T.normalizeText(customer.business) || T.normalizeText(customer.contact);
    out.records = F.buildDocument({
      docType: opts.docType,
      today: opts.today,
      date: siteOrderDate(order.orderId),
      customerNo: /^\d{1,5}$/.test(String(opts.customerNo || '').trim()) && Number(opts.customerNo) > 0
        ? String(opts.customerNo).trim() : OCCASIONAL_CUSTOMER,
      lastName: who,
      firstName: who,
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
    catalogCode: catalogCode,
    itemExportRows: itemExportRows,
    rivhitCodeMap: rivhitCodeMap,
    siteOrderDate: siteOrderDate,
    siteInternalNo: siteInternalNo,
    siteOrderDocument: siteOrderDocument
  };
});
