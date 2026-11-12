/**
 * ממיר הזמנות לריווחית — המסך.
 * תלוי ב-XLSX (SheetJS), ב-RivhitCore (src/*.js) וב-window.RIVHIT_MAPPING (mapping.json).
 * הכל רץ בדפדפן; שום קובץ לא נשלח לרשת.
 */
(function () {
  'use strict';

  var C = window.RivhitCore;
  var STORE_KEY = 'aroam_rivhit_v1';
  var HISTORY_MAX = 1000;
  var BUILT_IN = window.RIVHIT_MAPPING || {};
  var BUILT_IN_MAP = C.indexMap(BUILT_IN.map);

  var state = loadState();
  var orders = [];     // {id, fileName, branch, date, lines} או {id, fileName, error}
  var editing = {};    // מפתח תיאור ⇒ true כשלוחצים "שנה" על שיוך קיים
  var nextId = 1;
  var toastTimer;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) { return (Math.round(n * 100) / 100).toFixed(2) + ' ₪'; }

  function stamp(d) {
    return d.getFullYear() + C.pad2(d.getMonth() + 1) + C.pad2(d.getDate()) + '-' +
      C.pad2(d.getHours()) + C.pad2(d.getMinutes());
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 4500);
  }

  // ---------- מצב שמור ----------

  function loadState() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { s = {}; }
    var cust = BUILT_IN.customer || {};
    return {
      customerNo: s.customerNo != null ? String(s.customerNo) : String(cust.no || ''),
      customerName: s.customerName != null ? String(s.customerName) : String(cust.name || ''),
      encoding: s.encoding === 'utf8' ? 'utf8' : 'cp1255',
      docType: C.DOC_TYPES.some(function (d) { return d.code === Number(s.docType); })
        ? Number(s.docType) : C.DOC_TYPES[0].code,
      items: Array.isArray(s.items) ? s.items : [],
      // נטען ייצוא של ריווחית שבו המק"ט הוא המספר הקטלוגי, והשיוכים תורגמו (12.11.26)
      catalogList: s.catalogList === true,
      learned: s.learned && typeof s.learned === 'object' ? s.learned : {},
      counter: s.counter || null,
      history: s.history && typeof s.history === 'object' ? s.history : {}
    };
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('הדפדפן לא מאפשר לשמור — השיוכים לא יישמרו לפעם הבאה. כדאי לשמור גיבוי.'); }
  }

  function pruneHistory() {
    var keys = Object.keys(state.history);
    if (keys.length <= HISTORY_MAX) return;
    keys.sort(function (a, b) { return state.history[a].at < state.history[b].at ? -1 : 1; });
    keys.slice(0, keys.length - HISTORY_MAX).forEach(function (k) { delete state.history[k]; });
  }

  // פריטי ריווחית לפי מק"ט: הרשימה שנטענה, ומה שחסר בה — מהשמות שבשיוך המובנה
  function itemsIndex() { return C.indexItemsWithMapNames(state.items, BUILT_IN.map); }

  function currentMap() { return Object.assign({}, BUILT_IN_MAP, state.learned); }
  function settings() { return { customerNo: state.customerNo, customerName: state.customerName }; }

  // מה צריך לתקן לפני הפקה. ריווחית מזהה פריט לפי המספר הקטלוגי, ומק"ט שלא קיים
  // אצלה פותח פריט חדש (סבב 91) — לכן בלי רשימה מריווחית אין הפקה, ומק"ט שלא ברשימה
  // חוסם את ההזמנה.
  function orderProblems(r) {
    var p = C.validateOrder(r);
    if (!state.catalogList) {
      p.unshift('צריך לטעון את רשימת הפריטים מריווחית (ייצוא חדש, למטה). מ-12.11.26 הממיר מזהה פריטים לפי המספר הקטלוגי');
      return p;
    }
    r.lines.forEach(function (l) {
      if (l.code && !l.known) {
        p.push('שורה ' + l.row + ' (' + l.desc + '): המספר הקטלוגי ' + l.code +
          ' לא נמצא ברשימת הפריטים מריווחית — ריווחית הייתה פותחת פריט חדש');
      }
    });
    return p;
  }

  function resolvedOrder(o, map, by) {
    return {
      branch: o.branch,
      date: o.date,
      lines: C.resolveLines(o.lines, map || currentMap(), by || itemsIndex())
    };
  }

  // ---------- קריאת קבצים ----------

  function readWorkbook(file) {
    return file.arrayBuffer().then(function (buf) {
      var wb = /\.(csv|txt)$/i.test(file.name)
        ? XLSX.read(C.decodeText(new Uint8Array(buf)), { type: 'string' })
        : XLSX.read(buf, { type: 'array' });
      return wb.SheetNames.map(function (name) {
        var ws = wb.Sheets[name];
        return {
          name: name,
          firstRow: ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r + 1 : 1,
          rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true })
        };
      });
    });
  }

  function addOrderFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    Promise.all(files.map(function (file) {
      return readWorkbook(file).then(function (sheets) {
        return {
          id: nextId++, fileName: file.name, branch: C.branchFromFilename(file.name),
          date: C.isoDate(new Date()), lines: C.parseWorkbook(sheets)
        };
      }, function (err) {
        return { id: nextId++, fileName: file.name, error: 'לא ניתן לקרוא את הקובץ (' + ((err && err.message) || err) + ')' };
      });
    })).then(function (added) {
      orders = orders.concat(added);
      $('result').innerHTML = '';
      render();
    });
  }

  function loadItemsFile(file) {
    readWorkbook(file).then(function (sheets) {
      var lastError = '';
      for (var i = 0; i < sheets.length; i++) {
        var res = C.parseItemList(sheets[i].rows);
        if (res.items.length) {
          state.items = res.items;
          var msg = 'נטענו ' + res.items.length + ' פריטים מריווחית';
          if (res.catalogList) {
            var mig = C.migrateLearned(state.learned, res.items);
            state.learned = mig.learned;
            state.catalogList = true;
            if (mig.changed) {
              msg += ' · ' + (mig.changed === 1 ? 'שיוך אחד עודכן' : mig.changed + ' שיוכים עודכנו') + ' למספר הקטלוגי';
            }
            if (res.inactive) {
              msg += ' · ' + (res.inactive === 1 ? 'פריט אחד בקבוצה "לא פעיל" לא נטען'
                : res.inactive + ' פריטים בקבוצה "לא פעיל" לא נטענו');
            }
            if (res.noCatalog) {
              msg += ' · ' + (res.noCatalog === 1 ? 'פריט אחד בלי מספר קטלוגי לא נטען'
                : res.noCatalog + ' פריטים בלי מספר קטלוגי לא נטענו');
            }
          }
          saveState();
          render();
          toast(msg);
          return;
        }
        lastError = res.error;
      }
      toast(lastError || 'לא נמצאו פריטים בקובץ');
    }, function () { toast('לא ניתן לקרוא את קובץ הפריטים'); });
  }

  // ---------- שיוך ----------

  function setMapping(desc, rawValue) {
    var value = String(rawValue || '').trim();
    if (!value) return;
    var code = value.split(' — ')[0].trim();
    var by = itemsIndex();
    if (code.length > 15) { toast('מק״ט בריווחית מוגבל ל-15 תווים'); return; }
    // מק"ט שלא קיים בריווחית פותח שם פריט חדש — לכן אחרי שנטענה רשימה הוא לא נשמר
    if (state.catalogList && !by[code]) {
      toast('המספר הקטלוגי "' + code + '" לא נמצא ברשימת הפריטים מריווחית');
      return;
    }
    var key = C.descKey(desc);
    state.learned[key] = { code: code, name: by[code] ? by[code].name : '' };
    delete editing[key];
    saveState();
    render();
  }

  // ---------- גיבוי ----------

  function download(bytes, name) {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function saveBackup() {
    var data = {
      app: 'aroam-rivhit', version: 2, savedAt: new Date().toISOString(),
      customerNo: state.customerNo, customerName: state.customerName, encoding: state.encoding,
      learned: state.learned, items: state.items, catalogList: state.catalogList
    };
    download(new TextEncoder().encode(JSON.stringify(data, null, 2)), 'rivhit-backup-' + stamp(new Date()) + '.json');
  }

  function loadBackup(file) {
    file.text().then(function (txt) {
      var d = JSON.parse(txt);
      if (!d || d.app !== 'aroam-rivhit') throw new Error('not a backup');
      Object.assign(state.learned, d.learned || {});
      if (Array.isArray(d.items) && d.items.length) state.items = d.items;
      // גיבוי מלפני 12.11.26 שומר מספרי פריט — עד שנטען ייצוא חדש (שמתרגם אותם) אין הפקה
      if (d.catalogList !== true) state.catalogList = false;
      if (d.customerNo) state.customerNo = String(d.customerNo);
      if (d.customerName) state.customerName = String(d.customerName);
      if (d.encoding) state.encoding = d.encoding === 'utf8' ? 'utf8' : 'cp1255';
      saveState();
      fillSettings();
      render();
      toast('הגיבוי שוחזר');
    }).catch(function () { toast('הקובץ אינו גיבוי של הממיר'); });
  }

  // ---------- הפקה ----------

  function generate() {
    var ready = orders.filter(function (o) { return !o.error; });
    if (!ready.length || C.validateSettings(settings()).length) return;
    var map = currentMap(), by = itemsIndex();
    var resolved = ready.map(function (o) { return resolvedOrder(o, map, by); });
    if (resolved.some(function (r) { return orderProblems(r).length; })) return;

    var today = new Date(), counter = state.counter, records = [], summary = [];
    try {
      resolved.forEach(function (r) {
        var next = C.nextInternalNo(counter, today);
        counter = next.counter;
        records = records.concat(C.buildRecords(r, {
          docType: state.docType, customerNo: state.customerNo, customerName: state.customerName,
          internalNo: next.no, today: today
        }));
        summary.push({ branch: r.branch, no: next.no, lines: r.lines.length, fp: C.orderFingerprint(r) });
      });
    } catch (e) { toast(e.message); return; }

    var enc = C.encodeText(C.serialize(records), state.encoding);
    var name = C.outputFileName(summary.map(function (s) { return s.branch; }), 'rivhit-' + stamp(today));
    download(enc.bytes, name);

    state.counter = counter;
    summary.forEach(function (s) {
      state.history[s.fp] = { at: C.isoDate(today), no: s.no, branch: s.branch };
    });
    pruneHistory();
    saveState();
    orders = [];
    showResult(name, summary, records.length, enc.unknown);
    render();
  }

  function showResult(name, summary, lineCount, unknown) {
    var docLabel = C.DOC_TYPES.filter(function (d) { return d.code === state.docType; })[0].label;
    $('result').innerHTML =
      '<section class="card"><h2>הקובץ ירד: ' + esc(name) + '</h2>' +
      '<p class="muted">' + (summary.length === 1 ? 'מסמך אחד' : summary.length + ' מסמכים') + ' (' + esc(docLabel) + ') · ' + lineCount + ' שורות · ' +
      (state.encoding === 'utf8' ? 'UTF-8' : 'Windows-1255') + '</p>' +
      '<table><thead><tr><th>סניף</th><th>מספר פנימי</th><th>שורות</th></tr></thead><tbody>' +
      summary.map(function (s) {
        return '<tr><td>' + esc(s.branch) + '</td><td class="num">' + esc(s.no) + '</td><td class="num">' + s.lines + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (unknown ? '<div class="notice warn">' + unknown + ' תווים שאין להם מקום ב-Windows-1255 הוחלפו בסימן ?</div>' : '') +
      '<ol class="steps"><li>בריווחית: תחזוקה ← יבוא מסמכים/קבלות מתוכנה זרה, ובוחרים את הקובץ מתיקיית ההורדות.</li>' +
      '<li>אחרי הקליטה פותחים מסמך אחד ובודקים עברית, שם הסניף ומחירים.</li></ol></section>';
  }

  // ---------- תצוגה ----------

  function fillSettings() {
    $('set-customer-no').value = state.customerNo;
    $('set-customer-name').value = state.customerName;
    $('set-encoding').value = state.encoding;
  }

  function codeCell(o, i, l) {
    var key = C.descKey(l.desc);
    if (l.code && !editing[key]) {
      return '<span class="code">' + esc(l.code) + '</span> ' + esc(l.name) +
        (l.known || !state.items.length ? '' : ' <span class="muted">(לא ברשימת הפריטים)</span>') +
        ' <button type="button" class="link" data-act="edit-map" data-key="' + esc(key) + '">שנה</button>';
    }
    var sugg = C.suggest(l.desc, state.items, 3);
    return '<input type="text" list="items-list" class="map-input" data-desc="' + esc(l.desc) + '"' +
      ' placeholder="מק״ט או שם פריט…" aria-label="מק״ט בריווחית עבור ' + esc(l.desc) + '">' +
      (sugg.length ? '<div class="chips">' + sugg.map(function (it) {
        return '<button type="button" class="chip" data-act="pick" data-desc="' + esc(l.desc) + '" data-code="' +
          esc(it.code) + '">' + esc(it.code + ' · ' + it.name) + '</button>';
      }).join('') + '</div>' : '') +
      (editing[key] ? ' <button type="button" class="link" data-act="cancel-edit" data-key="' + esc(key) + '">ביטול</button>' : '');
  }

  function numCell(o, i, l, field) {
    var v = l[field];
    var ok = field === 'qty' ? typeof v === 'number' && v > 0 : typeof v === 'number' && v >= 0;
    if (ok) return field === 'qty' ? C.formatNumber(v) : money(v);
    var shown = field === 'qty' ? l.qtyText : (v == null || Number.isNaN(v) ? '' : String(v));
    return '<input type="text" inputmode="decimal" data-act="' + field + '" data-order="' + o.id + '" data-line="' + i +
      '" value="' + esc(shown) + '" aria-label="' + (field === 'qty' ? 'כמות' : 'מחיר') + ' עבור ' + esc(l.desc) + '">';
  }

  function orderCard(o, map, by) {
    if (o.error) {
      return '<section class="card"><div class="order-head"><div class="file">' + esc(o.fileName) + '</div>' +
        '<span class="spacer"></span><button type="button" class="link" data-act="remove" data-order="' + o.id + '">הסרה</button></div>' +
        '<div class="notice bad">' + esc(o.error) + '</div></section>';
    }
    var r = resolvedOrder(o, map, by);
    var problems = orderProblems(r);
    var prev = r.lines.length ? state.history[C.orderFingerprint(r)] : null;
    var total = 0;
    var rows = r.lines.map(function (l, i) {
      // הסה"כ לפי הטופס נספר גם לפני השיוך, כדי שאפשר יהיה להשוות לסה"כ בגיליון של הלקוח
      var priced = typeof l.qty === 'number' && l.qty > 0 && typeof l.price === 'number' && l.price >= 0;
      var good = l.code && priced;
      if (priced) total += l.qty * l.price;
      return '<tr class="' + (good ? '' : 'bad') + '">' +
        '<td>' + esc(l.desc) + (l.note ? '<div class="muted">הערה: ' + esc(l.note) + '</div>' : '') + '</td>' +
        '<td>' + codeCell(o, i, l) + '</td>' +
        '<td class="num">' + numCell(o, i, l, 'qty') + '</td>' +
        '<td class="num">' + numCell(o, i, l, 'price') + '</td>' +
        '<td class="num">' + (priced ? money(l.qty * l.price) : '') + '</td></tr>';
    }).join('');
    return '<section class="card">' +
      '<div class="order-head">' +
        '<div><div class="file">' + esc(o.fileName) + '</div><div class="muted">' + r.lines.length + ' שורות עם כמות</div></div>' +
        '<label class="field">סניף (נכתב בכתובת המסמך)<input type="text" maxlength="30" data-act="branch" data-order="' + o.id + '" value="' + esc(o.branch) + '"></label>' +
        '<label class="field">תאריך ההזמנה<input type="date" data-act="date" data-order="' + o.id + '" value="' + esc(o.date) + '"></label>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="link" data-act="remove" data-order="' + o.id + '">הסרה</button>' +
      '</div>' +
      (prev ? '<div class="notice warn">הזמנה זהה מהסניף הזה כבר הופקה ב-' + esc(prev.at.split('-').reverse().join('.')) +
        ' (מספר פנימי ' + esc(prev.no) + '). אם היא כבר נקלטה בריווחית — כדאי להסיר אותה מכאן.</div>' : '') +
      (problems.length ? '<div class="notice bad">לתיקון לפני הפקה:<ul>' + problems.map(function (p) {
        return '<li>' + esc(p) + '</li>';
      }).join('') + '</ul></div>' : '') +
      (r.lines.length ? '<table><thead><tr><th>תיאור בטופס הלקוח</th><th>מק״ט בריווחית</th><th>כמות</th><th>מחיר</th><th>סה״כ</th></tr></thead><tbody>' +
        rows + '</tbody></table><div class="total">סה״כ לפי מחירי הטופס: ' + money(total) + '</div>'
        : '<div class="notice bad">לא נמצאה בקובץ טבלה עם עמודות "מחיר" ו"כמות", או שלא מולאו כמויות.</div>') +
      '</section>';
  }

  function renderStatus() {
    $('items-status').textContent = !state.catalogList
      ? 'צריך לטעון את רשימת הפריטים מריווחית (הייצוא המלא, עם המספר הקטלוגי). מ-12.11.26 הממיר מזהה פריטים לפי המספר הקטלוגי, ועד שהרשימה נטענת אי אפשר להפיק קובץ.'
      : 'נטענו ' + state.items.length + ' פריטים. טוענים מחדש כשנוספים פריטים בריווחית.';
    $('map-status').textContent = Object.keys(BUILT_IN_MAP).length + ' שיוכים מובנים · ' +
      Object.keys(state.learned).length + ' שיוכים שנשמרו בדפדפן הזה. כדאי לשמור גיבוי מדי פעם.';
    var list = $('items-list');
    if (list.getAttribute('data-count') !== String(state.items.length)) {
      list.innerHTML = state.items.map(function (it) {
        return '<option value="' + esc(it.code + ' — ' + it.name) + '"></option>';
      }).join('');
      list.setAttribute('data-count', String(state.items.length));
    }
  }

  function renderFooter() {
    var sp = C.validateSettings(settings());
    var ready = orders.filter(function (o) { return !o.error; });
    var failedFiles = orders.length - ready.length;
    var map = currentMap(), by = itemsIndex();
    var bad = 0, lines = 0;
    ready.forEach(function (o) {
      var r = resolvedOrder(o, map, by);
      if (orderProblems(r).length) bad++;
      lines += r.lines.length;
    });
    var st;
    if (!ready.length) st = 'גוררים קובץ הזמנה כדי להתחיל';
    else if (sp.length) st = sp[0] + ' (בהגדרות למעלה)';
    else if (bad) st = bad === 1 ? 'הזמנה אחת צריכה תיקון (מסומן באדום)' : bad + ' הזמנות צריכות תיקון (מסומן באדום)';
    else st = (ready.length === 1 ? 'הזמנה אחת' : ready.length + ' הזמנות') + ' · ' + lines + ' שורות מוכנות';
    if (failedFiles) st += ' · ' + failedFiles + ' קבצים לא נקראו';
    $('generate-status').textContent = st;
    $('generate').disabled = !ready.length || sp.length > 0 || bad > 0;
  }

  function render() {
    var map = currentMap(), by = itemsIndex();
    $('orders').innerHTML = orders.map(function (o) { return orderCard(o, map, by); }).join('');
    renderStatus();
    renderFooter();
  }

  // ---------- אירועים ----------

  function findOrder(id) {
    return orders.filter(function (o) { return String(o.id) === String(id); })[0];
  }

  function onOrdersClick(e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act');
    if (act === 'pick') setMapping(t.getAttribute('data-desc'), t.getAttribute('data-code'));
    else if (act === 'edit-map') { editing[t.getAttribute('data-key')] = true; render(); }
    else if (act === 'cancel-edit') { delete editing[t.getAttribute('data-key')]; render(); }
    else if (act === 'remove') {
      orders = orders.filter(function (o) { return String(o.id) !== t.getAttribute('data-order'); });
      render();
    }
  }

  function onOrdersChange(e) {
    var t = e.target;
    if (t.classList.contains('map-input')) { setMapping(t.getAttribute('data-desc'), t.value); return; }
    var act = t.getAttribute('data-act');
    var o = findOrder(t.getAttribute('data-order'));
    if (!o) return;
    if (act === 'branch') o.branch = t.value;
    else if (act === 'date') o.date = t.value;
    else if (act === 'qty' || act === 'price') {
      var line = o.lines[Number(t.getAttribute('data-line'))];
      if (act === 'qty') { line.qty = C.toNumber(t.value); line.qtyText = t.value; }
      else line.price = C.toNumber(t.value);
    } else return;
    render();
  }

  // בחירה מרשימת ההצעות של הדפדפן ("מק״ט — שם") נקלטת מיד, בלי לחכות ליציאה מהשדה
  function onOrdersInput(e) {
    var t = e.target;
    if (!t.classList.contains('map-input') || t.value.indexOf(' — ') === -1) return;
    var code = t.value.split(' — ')[0].trim();
    if (itemsIndex()[code]) setMapping(t.getAttribute('data-desc'), t.value);
  }

  function init() {
    var dt = $('doc-type');
    dt.innerHTML = C.DOC_TYPES.map(function (d) {
      return '<option value="' + d.code + '">' + esc(d.label) + '</option>';
    }).join('');
    dt.value = String(state.docType);
    dt.addEventListener('change', function () { state.docType = Number(dt.value); saveState(); });

    fillSettings();
    $('set-customer-no').addEventListener('input', function (e) { state.customerNo = e.target.value.trim(); saveState(); renderFooter(); });
    $('set-customer-name').addEventListener('input', function (e) { state.customerName = e.target.value; saveState(); renderFooter(); });
    $('set-encoding').addEventListener('change', function (e) { state.encoding = e.target.value; saveState(); });

    var drop = $('drop'), input = $('order-files');
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () { addOrderFiles(input.files); input.value = ''; });
    // גרירה לכל מקום בעמוד — כדי שקובץ שנשמט ליד האזור לא ייפתח בדפדפן
    window.addEventListener('dragover', function (e) { e.preventDefault(); document.body.classList.add('dragging'); });
    window.addEventListener('dragleave', function (e) { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      document.body.classList.remove('dragging');
      addOrderFiles(e.dataTransfer.files);
    });

    $('items-load').addEventListener('click', function () { $('items-file').click(); });
    $('items-file').addEventListener('change', function (e) {
      if (e.target.files[0]) loadItemsFile(e.target.files[0]);
      e.target.value = '';
    });
    $('backup-save').addEventListener('click', saveBackup);
    $('backup-load').addEventListener('click', function () { $('backup-file').click(); });
    $('backup-file').addEventListener('change', function (e) {
      if (e.target.files[0]) loadBackup(e.target.files[0]);
      e.target.value = '';
    });
    $('generate').addEventListener('click', generate);
    $('orders').addEventListener('click', onOrdersClick);
    $('orders').addEventListener('change', onOrdersChange);
    $('orders').addEventListener('input', onOrdersInput);

    if (C.validateSettings(settings()).length) $('settings').open = true;
    render();
  }

  init();
})();
