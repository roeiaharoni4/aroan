/**
 * ממיר הזמנות לריווחית — רשימת הפריטים מריווחית ושיוך תיאור ⇐ מק"ט.
 * ריווחית מזהה פריט לפי המספר הקטלוגי, ובטופס של הלקוח יש רק תיאור —
 * לכן כל תיאור משויך פעם אחת למק"ט, והשיוך נשמר לפעם הבאה.
 */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./text.js') : root.RivhitCore);
  if (node) module.exports = api;
  else root.RivhitCore = Object.assign(root.RivhitCore || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (T) {
  'use strict';

  // לפי סדר עדיפות: "מק"ט"/"מספר קטלוגי" לפני "קוד" (שעלול להיות "קוד מיון").
  // item_num/item_name — הכותרות בייצוא רשימת הפריטים של ריווחית השולחנית
  var CODE_HEADERS = [/מק"?ט/, /קטלוג/, /^קוד/, /^item_?num$/i, /^(sku|catalog|item ?code|code)\b/i];
  var NAME_HEADERS = [/^שם/, /תי?אור/, /שם/, /^item_?name$/i, /^(name|description|desc)\b/i];

  function headerText(v) { return typeof v === 'string' ? T.normalizeText(v) : ''; }

  function codeText(v) {
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    return T.normalizeText(v);
  }

  function indexMatching(texts, patterns, skip) {
    for (var p = 0; p < patterns.length; p++) {
      for (var i = 0; i < texts.length; i++) {
        if (i !== skip && texts[i] && patterns[p].test(texts[i])) return i;
      }
    }
    return -1;
  }

  // רשימת פריטים שיוצאה מריווחית: מחפש בשורות הראשונות כותרת עם מק"ט ושם
  function parseItemList(rows) {
    rows = rows || [];
    for (var r = 0; r < Math.min(rows.length, 15); r++) {
      var texts = (rows[r] || []).map(headerText);
      var codeCol = indexMatching(texts, CODE_HEADERS, -1);
      if (codeCol < 0) continue;
      var nameCol = indexMatching(texts, NAME_HEADERS, codeCol);
      if (nameCol < 0) continue;
      var seen = {}, items = [];
      for (var i = r + 1; i < rows.length; i++) {
        var row = rows[i] || [];
        var code = codeText(row[codeCol]);
        var name = T.normalizeText(row[nameCol]);
        if (!code || !name || seen[code]) continue;
        seen[code] = true;
        items.push({ code: code, name: name });
      }
      return { items: items, error: items.length ? '' : 'נמצאה שורת כותרת אבל אין מתחתיה פריטים' };
    }
    return { items: [], error: 'לא נמצאה שורת כותרת עם עמודת מק״ט ועמודת שם פריט' };
  }

  function indexItems(items) {
    var by = {};
    (items || []).forEach(function (it) { by[it.code] = it; });
    return by;
  }

  // מק"ט ⇒ פריט: רשימת הפריטים מריווחית, ומה שחסר בה — מהשמות שבשיוך המובנה. כך שיוך
  // שנשמר ידנית כשהרשימה לא הייתה טעונה (בלי שם) עדיין יוצא בשם של ריווחית ולא בשם מהטופס.
  function indexItemsWithMapNames(items, mapList) {
    var by = indexItems(items);
    (mapList || []).forEach(function (e) {
      var code = e && e.code !== undefined && e.code !== null ? String(e.code) : '';
      if (code && e.name && !by[code]) by[code] = { code: code, name: e.name };
    });
    return by;
  }

  // שיוך מובנה (mapping.json) ⇒ אובייקט לפי מפתח התיאור
  function indexMap(list) {
    var map = {};
    (list || []).forEach(function (e) {
      if (e && e.desc && e.code !== undefined && e.code !== '') {
        map[T.descKey(e.desc)] = { code: String(e.code), name: e.name || '' };
      }
    });
    return map;
  }

  function resolveLines(lines, map, itemsByCode) {
    map = map || {};
    itemsByCode = itemsByCode || {};
    return lines.map(function (l) {
      var m = map[T.descKey(l.desc)];
      var code = m ? String(m.code) : '';
      var item = code ? itemsByCode[code] : null;
      var out = {};
      for (var k in l) out[k] = l[k];
      out.code = code;
      out.name = item ? item.name : (m && m.name) || '';
      out.known = !!item;
      return out;
    });
  }

  function tokens(s) {
    return T.descKey(s)
      .replace(/[^֐-׿a-z0-9.\s]/g, ' ')
      .split(/\s+/)
      .filter(function (t) { return t.length > 1 || /\d/.test(t); });
  }

  // הצעות לשורה בלי שיוך: מילים משותפות, ומספר זהה שווה פי 3 (4000 ≠ 2000)
  function suggest(desc, items, limit) {
    var want = tokens(desc);
    var scored = [];
    (items || []).forEach(function (it) {
      var have = tokens(it.name + ' ' + it.code);
      var score = 0;
      want.forEach(function (w) {
        var isNum = /\d/.test(w);
        if (have.indexOf(w) !== -1) { score += isNum ? 3 : 1; return; }
        // תחיליות בעברית: "לניקוי" ~ "ניקוי"
        if (!isNum && w.length > 2 && have.some(function (h) {
          return h.length > 2 && (h.indexOf(w) !== -1 || w.indexOf(h) !== -1);
        })) score += 0.5;
      });
      if (score > 0) scored.push({ item: it, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, limit || 5).map(function (s) { return s.item; });
  }

  return {
    parseItemList: parseItemList,
    indexItems: indexItems,
    indexItemsWithMapNames: indexItemsWithMapNames,
    indexMap: indexMap,
    resolveLines: resolveLines,
    suggest: suggest
  };
});
