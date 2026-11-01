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

  return {
    normalizeText: normalizeText,
    descKey: descKey,
    toNumber: toNumber,
    pad2: pad2,
    parseIsoDate: parseIsoDate,
    isoDate: isoDate,
    rivhitDate: rivhitDate,
    formatNumber: formatNumber
  };
});
