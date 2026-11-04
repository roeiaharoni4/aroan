/**
 * ממיר הזמנות לריווחית — קריאת טופס ההזמנה של הלקוח.
 * לא תלוי במבנה קבוע: בכל גיליון מוצא שורות כותרת (תא "מחיר" + תא "כמות"),
 * ומתחת לכל כותרת לוקח את השורות שמולאה בהן כמות.
 * הקלט: שורות גיליון כמערכי תאים (sheet_to_json עם header: 1).
 */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./text.js') : root.RivhitCore);
  if (node) module.exports = api;
  else root.RivhitCore = Object.assign(root.RivhitCore || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (T) {
  'use strict';

  var TOTAL_RE = /^(סה"?כ|סך)/;

  function cellText(v) { return typeof v === 'string' ? T.normalizeText(v) : ''; }

  // שורת כותרת ⇒ אינדקסי העמודות; כל שורה אחרת ⇒ null
  function findHeader(row) {
    if (!row || !row.length) return null;
    var texts = row.map(cellText);
    var cols = { desc: -1, qty: -1, price: -1, note: -1 };
    texts.forEach(function (t, i) {
      if (!t) return;
      if (t.indexOf('כמות') !== -1) { if (cols.qty < 0) cols.qty = i; }
      else if (t.indexOf('הער') !== -1) { if (cols.note < 0) cols.note = i; }
      else if (t.indexOf('מחיר') !== -1 && !/סה"?כ|סך/.test(t)) { if (cols.price < 0) cols.price = i; }
    });
    if (cols.qty < 0 || cols.price < 0) return null;
    // עמודת התיאור: התא הטקסטואלי הראשון שאינו כמות/מחיר/הערות/סה"כ
    for (var i = 0; i < texts.length; i++) {
      if (!texts[i] || i === cols.qty || i === cols.price || i === cols.note) continue;
      if (/סה"?כ|סך/.test(texts[i])) continue;
      cols.desc = i;
      break;
    }
    return cols.desc < 0 ? null : cols;
  }

  function parseSheetRows(rows, sheetName, firstRow) {
    var lines = [], cols = null, base = firstRow || 1;
    (rows || []).forEach(function (row, r) {
      if (!row) return;
      var header = findHeader(row);
      if (header) { cols = header; return; }
      if (!cols) return;
      var desc = T.normalizeText(row[cols.desc]);
      if (!desc || TOTAL_RE.test(desc)) return;
      var qty = T.toNumber(row[cols.qty]);
      if (qty === null || qty === 0) return;
      lines.push({
        sheet: sheetName || '',
        row: base + r,
        desc: desc,
        qty: qty,
        qtyText: T.normalizeText(row[cols.qty]),
        price: T.toNumber(row[cols.price]),
        note: cols.note >= 0 ? T.normalizeText(row[cols.note]) : ''
      });
    });
    return lines;
  }

  function parseWorkbook(sheets) {
    var lines = [];
    (sheets || []).forEach(function (s) {
      lines = lines.concat(parseSheetRows(s.rows, s.name, s.firstRow));
    });
    return lines;
  }

  // "נורט פייס גלילות.xlsx" ⇒ "נורט פייס גלילות"
  function branchFromFilename(name) {
    return T.normalizeText(String(name || '').replace(/\.[^.]+$/, '').replace(/_+/g, ' '));
  }

  return {
    findHeader: findHeader,
    parseSheetRows: parseSheetRows,
    parseWorkbook: parseWorkbook,
    branchFromFilename: branchFromFilename
  };
});
