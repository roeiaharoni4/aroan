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
