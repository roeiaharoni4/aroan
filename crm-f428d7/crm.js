/* CRM — אהרוני: ממשק העמוד. הלוגיקה הטהורה ב-crm-core.js (נבדקת ב-Node).
   הנתונים מגיעים מסקריפט ה-CRM (tools/google-apps-script-crm.gs) — POST בלבד,
   והסיסמה בגוף הבקשה ולא בכתובת.
   אפיון: docs/superpowers/specs/2026-11-02-crm-design.md
          docs/superpowers/specs/2026-11-03-crm-orders-tasks-notifications-design.md */
(function () {
    'use strict';

    // כתובת ה-Web app של סקריפט ה-CRM. אינה סוד: בלי הסיסמה היא לא מחזירה נתונים.
    const API_URL = 'https://script.google.com/macros/s/AKfycbzs-jtpiy0yH6MnGjy_B2wULKZ56fpQ67UgtCDDPe9o0IZH_gjYb36RBqW7vVt8wGRcbw/exec';
    const KEY_STORE = 'aroam_crm_key';
    const REFRESH_AFTER_MS = 5 * 60 * 1000;
    const C = window.CrmCore;

    // אייקונים קבועים מהקוד — היחיד שנכנס ל-DOM ב-innerHTML. נתונים מהגיליון: textContent בלבד.
    const ICONS = {
        call: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
        whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
        quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-11"/></svg>'
    };
    const ACTION_LABELS = { call: 'התקשר', whatsapp: 'וואטסאפ', quote: 'הצעת מחיר' };
    const ERRORS = {
        network: 'אין חיבור — לא נשמר.',
        busy: 'השרת עסוק — נסו שוב בעוד רגע.',
        duplicate: 'המספר כבר קיים ב-CRM.',
        'bad phone': 'מספר הטלפון לא תקין.',
        'name required': 'צריך שם או שם עסק.',
        'not found': 'איש הקשר כבר לא קיים — רעננו את הרשימה.',
        'bad date': 'התאריך לא תקין.',
        'bad time': 'השעה לא תקינה.',
        'text required': 'צריך לכתוב מה המשימה.',
        'not cancellable': 'אפשר לבטל רק הזמנה שנרשמה כאן ידנית.',
        'bad rivhit': 'מספר הלקוח בריווחית — ספרות בלבד, עד 5.',
        'no items': 'לא נמצאו פריטים לשמירה.',
        'too many items': 'יותר מ-5,000 פריטים — זה לא נראה כמו קובץ הייצוא של ריווחית.'
    };
    // קובץ קליטה לריווחית (סבב 88): js/rivhit-core.js, ומק"טי הפריטים מ-products.csv
    const R = window.RivhitCore;
    const FOLLOW_CHOICES = [['today', 'היום'], ['tomorrow', 'מחר'], ['three', '3 ימים'], ['week', 'שבוע']];

    const S = {
        password: '', contacts: [], activities: [], tasks: [], filter: 'todo', query: '',
        today: C.ymd(new Date()), loadedAt: 0, openId: null,
        outcome: null, form: null, orderForm: null, taskForm: null, afterPop: null, lastFocus: null,
        rivhit: null, rivhitCodes: null, rivhitCatalogs: null,
        itemsUpload: null
    };

    const $ = (id) => document.getElementById(id);
    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }
    const byId = (id) => S.contacts.find(c => c.id === id) || null;
    // החדש למעלה. שתי פעולות באותה דקה — זו שנוספה אחרונה קודם (הפעולות נשמרות לפי סדר)
    const activitiesOf = (id) => S.activities
        .map((a, i) => [a, i])
        .filter(([a]) => a.contactId === id)
        .sort((x, y) => (x[0].at < y[0].at ? 1 : x[0].at > y[0].at ? -1 : y[1] - x[1]))
        .map(([a]) => a);
    const errorText = (res, fallback) => (res && ERRORS[res.error]) || fallback;
    const offline = () => navigator.onLine === false;

    // ---------- רשת ----------

    async function api(action, payload) {
        let res;
        try {
            res = await fetch(API_URL, {
                method: 'POST',
                // text/plain: בקשה פשוטה בלי preflight — כך הדפדפן יכול לקרוא את התשובה של Apps Script
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(Object.assign({ action: action, password: S.password }, payload || {}))
            });
        } catch (e) {
            return { ok: false, error: 'network' };
        }
        try {
            const data = await res.json();
            if (data && data.error === 'unauthorized' && action !== 'list') {
                logout('הסיסמה כבר לא תקפה — צריך להיכנס שוב.');
            }
            return data || { ok: false, error: 'bad response' };
        } catch (e) {
            return { ok: false, error: 'bad response' };
        }
    }

    // ---------- כניסה ----------

    function readKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
    function writeKey(v) {
        try {
            if (v) localStorage.setItem(KEY_STORE, v);
            else localStorage.removeItem(KEY_STORE);
        } catch (e) { }
    }

    function showLogin(message, keep) {
        $('crm-list-view').hidden = true;
        $('crm-card-view').hidden = true;
        $('crm-login').hidden = false;
        $('crm-login-error').textContent = message || '';
        $('crm-password').value = keep || '';
        $('crm-password').focus();
    }

    function logout(message) {
        S.password = '';
        S.contacts = [];
        S.activities = [];
        S.tasks = [];
        S.openId = null;
        writeKey('');
        document.querySelectorAll('.crm-overlay').forEach(o => { o.hidden = true; });
        syncLock();
        closeMenu();
        showLogin(message || '');
    }

    async function login(pw) {
        const btn = $('crm-login-btn');
        btn.disabled = true;
        btn.textContent = 'נכנס…';
        S.password = pw;
        const data = await api('list');
        btn.disabled = false;
        btn.textContent = 'כניסה';
        if (data.ok) {
            writeKey(pw);
            applyList(data);
            $('crm-login').hidden = true;
            $('crm-list-view').hidden = false;
            renderList();
            openFromHash();
            return;
        }
        S.password = '';
        if (data.error === 'unauthorized') {
            writeKey('');
            showLogin('הסיסמה שגויה.');
        } else {
            showLogin('אין חיבור לשרת — בדקו את הרשת ונסו שוב.', pw);
        }
    }

    function applyList(data) {
        S.contacts = data.contacts || [];
        S.activities = data.activities || [];
        S.tasks = data.tasks || [];
        if (data.today) S.today = data.today;
        S.loadedAt = Date.now();
    }

    async function refresh(silent) {
        const data = await api('list');
        if (!data.ok) {
            if (!silent) toast(data.error === 'network' ? 'אין חיבור — הרשימה לא רועננה.' : 'הרענון נכשל.');
            return;
        }
        applyList(data);
        rerender();
        if (!silent) toast('הרשימה עודכנה.');
    }

    // ---------- רשימה ----------

    function renderFilters() {
        const counts = C.counts(S.contacts, S.today, S.tasks);
        const host = $('crm-filters');
        host.textContent = '';
        C.FILTERS.forEach(f => {
            const b = el('button', 'crm-chip' + (S.filter === f.key ? ' is-on' : ''), f.label + ' ' + counts[f.key]);
            b.type = 'button';
            b.setAttribute('aria-pressed', String(S.filter === f.key));
            b.addEventListener('click', () => { S.filter = f.key; renderList(); });
            host.appendChild(b);
        });
    }

    function renderList() {
        renderFilters();
        // משימות: ב"לטיפול" — אלה שהגיע זמנן, ב"משימות" — כל הפתוחות. החיפוש חל גם עליהן.
        const base = S.filter === 'tasks' ? C.sortTasks(S.tasks)
            : S.filter === 'todo' ? C.dueTasks(S.tasks, S.today) : [];
        const tasks = base.filter(t => C.taskMatchesQuery(t, t.contactId ? byId(t.contactId) : null, S.query));
        const tl = $('crm-task-list');
        tl.textContent = '';
        tasks.forEach(t => tl.appendChild(taskRow(t, false)));
        $('crm-tasks-block').hidden = !tasks.length;
        const list = C.filterContacts(S.contacts, S.filter, S.query, S.today);
        const ul = $('crm-list');
        ul.textContent = '';
        list.forEach(c => ul.appendChild(rowFor(c)));
        $('crm-contacts-head').hidden = !(tasks.length && list.length);
        const empty = $('crm-empty');
        empty.textContent = S.query.trim() ? 'לא נמצאו תוצאות לחיפוש.'
            : S.filter === 'tasks' ? 'אין משימות פתוחות.' : 'אין כאן אף אחד כרגע.';
        empty.hidden = list.length > 0 || tasks.length > 0;
    }

    function badge(stage) { return el('span', 'crm-badge crm-stage-' + C.stageSlug(stage), stage); }

    function rowFor(c) {
        const li = el('li', 'crm-row');
        const main = el('button', 'crm-row-main');
        main.type = 'button';
        const top = el('span', 'crm-row-top');
        top.appendChild(el('span', 'crm-row-title', C.displayName(c)));
        top.appendChild(badge(c.stage));
        main.appendChild(top);
        // ב"לקוח" וב"לא הזמינו" — כמה זמן עבר מההזמנה האחרונה, ותג האיחור
        const ordersView = S.filter === 'לקוח' || S.filter === 'late';
        const sub = C.subLine(c, S.today, ordersView);
        if (sub) main.appendChild(el('span', 'crm-row-sub', sub));
        const due = [C.followUpLabel(c, S.today), ordersView ? C.lateLabel(c) : ''].filter(Boolean).join(' · ');
        if (due) {
            const red = C.isOverdue(c, S.today) || (ordersView && c.isLate);
            main.appendChild(el('span', 'crm-row-due' + (red ? ' is-late' : ''), due));
        }
        main.addEventListener('click', () => openCard(c.id));
        li.appendChild(main);
        li.appendChild(actions(c, true));
        return li;
    }

    // שיחה, וואטסאפ (רק לנייד) והצעת מחיר. אחרי כל אחד נפתח חלון התוצאה,
    // והוא מחכה כשחוזרים לעמוד.
    function actions(c, compact) {
        const wrap = el('div', compact ? 'crm-row-actions' : 'crm-card-actions');
        if (c.phone) wrap.appendChild(actionLink(c, 'call', 'tel:' + c.phone, compact));
        const wa = C.waLink(c.phone);
        if (wa) wrap.appendChild(actionLink(c, 'whatsapp', wa, compact));
        if (!compact) wrap.appendChild(actionLink(c, 'quote', C.agentLink(c), compact));
        return wrap;
    }

    function actionLink(c, channel, href, compact) {
        const a = el('a', 'crm-act crm-act-' + channel + (compact ? ' crm-act-icon' : ''));
        a.href = href;
        if (channel !== 'call') { a.target = '_blank'; a.rel = 'noopener'; }
        a.innerHTML = ICONS[channel];
        if (compact) a.setAttribute('aria-label', ACTION_LABELS[channel] + ' — ' + C.displayName(c));
        else a.appendChild(document.createTextNode(ACTION_LABELS[channel]));
        a.addEventListener('click', () => setTimeout(() => openOutcome(c.id, channel), 300));
        return a;
    }

    // ---------- כרטיס ----------

    function openCard(id) {
        if (!byId(id)) { toast('איש הקשר לא נמצא.'); return; }
        history.pushState({ crm: 'card', id: id }, '', '#c=' + encodeURIComponent(id));
        showCard(id);
    }

    function showCard(id) {
        S.openId = id;
        closeMenu();
        $('crm-list-view').hidden = true;
        $('crm-card-view').hidden = false;
        renderCard();
        window.scrollTo(0, 0);
        $('crm-card-title').focus();
    }

    function hideCard() {
        S.openId = null;
        $('crm-card-view').hidden = true;
        $('crm-list-view').hidden = false;
        renderList();
    }

    function chip(label, on) {
        const b = el('button', 'crm-chip' + (on ? ' is-on' : ''), label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(!!on));
        return b;
    }

    function renderCard() {
        const c = byId(S.openId);
        if (!c) { hideCard(); return; }
        $('crm-card-title').textContent = C.displayName(c);
        const host = $('crm-card');
        host.textContent = '';

        const who = [c.business ? c.name : '', C.formatPhone(c.phone)].filter(Boolean).join(' · ');
        if (who) host.appendChild(el('p', 'crm-card-who', who));
        if (c.email) host.appendChild(el('p', 'crm-card-meta', c.email));
        if (c.address) host.appendChild(el('p', 'crm-card-meta', c.address));
        host.appendChild(el('p', 'crm-card-meta', 'מקור: ' + (c.source || '—')));
        host.appendChild(el('p', 'crm-card-meta', c.rivhitNo
            ? 'ריווחית: לקוח ' + c.rivhitNo
            : 'ריווחית: אין מספר לקוח (יוצא כלקוח מזדמן 118)'));
        host.appendChild(actions(c, false));
        host.appendChild(ordersBlock(c));

        host.appendChild(el('h2', 'crm-label', 'שלב'));
        const stages = el('div', 'crm-chips');
        C.STAGES.forEach(s => {
            const b = chip(s, c.stage === s);
            b.addEventListener('click', () => {
                if (c.stage !== s) save(c, { stage: s }, { type: 'שלב', text: c.stage + ' ← ' + s });
            });
            stages.appendChild(b);
        });
        host.appendChild(stages);

        const value = C.followUpValue(c, S.today);
        host.appendChild(el('h2', 'crm-label', 'לחזור · ' + (value || 'לא נקבע')));
        const follow = el('div', 'crm-chips');
        FOLLOW_CHOICES.forEach(([key, label]) => {
            const day = C.followUpFor(key, S.today);
            const b = chip(label, c.followUp === day);
            b.addEventListener('click', () => save(c, { followUp: day }));
            follow.appendChild(b);
        });
        if (c.followUp) {
            const clear = chip('נקה', false);
            clear.addEventListener('click', () => save(c, { followUp: '' }));
            follow.appendChild(clear);
        }
        host.appendChild(follow);
        const date = el('input', 'crm-input crm-date');
        date.type = 'date';
        date.value = c.followUp || '';
        date.setAttribute('aria-label', 'תאריך אחר לחזור');
        date.addEventListener('change', () => { if (date.value) save(c, { followUp: date.value }); });
        host.appendChild(date);

        host.appendChild(cardTasks(c));

        host.appendChild(el('h2', 'crm-label', 'היסטוריה'));
        const form = el('form', 'crm-note');
        const note = el('input', 'crm-input');
        note.type = 'text';
        note.placeholder = 'הוספת הערה…';
        note.setAttribute('aria-label', 'הערה חדשה');
        const add = el('button', 'crm-btn', 'הוספה');
        add.type = 'submit';
        form.appendChild(note);
        form.appendChild(add);
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = note.value.trim();
            if (text) save(c, {}, { type: 'הערה', text: text });
        });
        host.appendChild(form);

        const ul = el('ul', 'crm-history');
        activitiesOf(c.id).forEach(a => ul.appendChild(historyItem(a)));
        host.appendChild(ul);
    }

    function historyItem(a) {
        const li = el('li', 'crm-history-item');
        li.appendChild(el('span', 'crm-history-when', C.formatStamp(a.at)));
        const what = el('span', 'crm-history-what', a.type);
        if (a.orderId) {
            what.appendChild(document.createTextNode(' · '));
            const id = el('span', '', a.orderId);
            id.dir = 'ltr';
            what.appendChild(id);
        }
        li.appendChild(what);
        if (a.text) li.appendChild(el('span', 'crm-history-text', a.text));
        const links = el('span', 'crm-history-links');
        if (/^https:\/\//.test(a.pdf)) links.appendChild(link(a.pdf, 'PDF'));
        if (/^https:\/\//.test(a.quoteLink)) links.appendChild(link(a.quoteLink, 'פתח כהצעת מחיר'));
        if (a.items && a.orderId && R) {
            const rv = el('button', 'crm-link-btn', 'קובץ לריווחית');
            rv.type = 'button';
            rv.addEventListener('click', () => openRivhit(a));
            links.appendChild(rv);
        }
        if (links.childNodes.length) li.appendChild(links);
        // לא על רישום זמני ששמירה אופטימית עוד לא אישרה (מזהה tmp-)
        if (C.isManualOrder(a) && a.id.indexOf('tmp-') !== 0) li.appendChild(cancelOrderButton(a));
        return li;
    }

    function link(href, label) {
        const a = el('a', 'crm-link', label);
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';
        return a;
    }

    // שינוי מופיע מיד ונשמר ברקע; אם השמירה נכשלה — הוא חוזר, עם הודעה
    async function save(c, fields, activity) {
        if (offline()) { toast(ERRORS.network); return; }
        const before = Object.assign({}, c);
        Object.assign(c, fields);
        let temp = null;
        if (activity) {
            temp = {
                id: 'tmp-' + Date.now(), contactId: c.id, at: C.nowStamp(), type: activity.type,
                text: activity.text, orderId: '', pdf: '', quoteLink: '', by: 'עמוד'
            };
            S.activities.push(temp);
            c.lastActivity = temp.at;
        }
        rerender();
        const res = activity
            ? await api('log', { id: c.id, fields: fields, activity: activity })
            : await api('update', { id: c.id, fields: fields });
        const i = temp ? S.activities.indexOf(temp) : -1;
        if (res.ok && res.contact) {
            Object.assign(c, res.contact);
            if (i >= 0) {
                if (res.activity) S.activities[i] = res.activity;
                else S.activities.splice(i, 1);
            }
        } else {
            Object.assign(c, before);
            if (i >= 0) S.activities.splice(i, 1);
            if (res.error !== 'unauthorized') toast(errorText(res, 'לא נשמר — נסו שוב.'));
        }
        rerender();
    }

    function rerender() {
        if (!S.password) return;
        const hadFocus = document.activeElement && document.activeElement !== document.body;
        if (S.openId && !$('crm-card-view').hidden) renderCard();
        else renderList();
        // הרינדור בונה את הכרטיס או הרשימה מחדש, והאלמנט שהיה בפוקוס נעלם —
        // בלי זה המקלדת וקורא המסך נזרקים לתחילת העמוד אחרי כל שמירה
        if (hadFocus && (!document.activeElement || document.activeElement === document.body)) {
            (S.openId ? $('crm-card-title') : $('main-content')).focus({ preventScroll: true });
        }
    }

    // ---------- הזמנות ----------

    // "4 הזמנות · אחרונה לפני 52 ימים · בדרך כלל כל 30 יום", תג איחור, ורישום הזמנה
    function ordersBlock(c) {
        const wrap = el('div', 'crm-orders');
        wrap.appendChild(el('h2', 'crm-label', 'הזמנות'));
        wrap.appendChild(el('p', 'crm-orders-line', C.ordersLine(c)));
        const late = C.lateLabel(c);
        if (late) wrap.appendChild(el('span', 'crm-late-tag', late));
        const rec = el('button', 'crm-btn crm-btn-small', 'רשום הזמנה');
        rec.type = 'button';
        rec.addEventListener('click', () => openOrderForm(c.id));
        wrap.appendChild(rec);
        return wrap;
    }

    function orderChips(current) {
        chipGroup($('o-date-chips'), [[S.today, 'היום'], [C.addDays(S.today, -1), 'אתמול']], current, setOrderDate);
    }

    function openOrderForm(id) {
        const c = byId(id);
        if (!c) return;
        S.orderForm = { id: id, date: S.today };
        $('crm-order-title').textContent = 'רישום הזמנה — ' + C.displayName(c);
        $('o-note').value = '';
        $('o-error').textContent = '';
        $('o-date').max = S.today;
        orderChips(S.today);
        setOrderDate(S.today);
        openOverlay('crm-order-wrap', 'crm-order-title');
    }

    // כבר רשומה הזמנה באותו תאריך — לשאול לפני שנספרת עוד אחת
    function setOrderDate(day) {
        const f = S.orderForm;
        if (!f) return;
        f.date = day;
        $('o-date').value = day;
        const dup = C.orderOn(S.activities, f.id, day);
        const box = $('o-dup');
        box.hidden = !dup;
        box.textContent = dup ? 'כבר רשומה הזמנה מ-' + C.formatDate(day) + ' — לרשום עוד אחת?' : '';
        $('o-submit').textContent = dup ? 'לרשום עוד אחת' : 'רישום';
    }

    async function submitOrder(e) {
        e.preventDefault();
        const f = S.orderForm;
        if (!f) return;
        $('o-error').textContent = '';
        if (!f.date || f.date > S.today) { $('o-error').textContent = 'אפשר לרשום הזמנה עד היום.'; return; }
        if (offline()) { $('o-error').textContent = ERRORS.network; return; }
        const btn = $('o-submit');
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'שומר…';
        const res = await api('order', { id: f.id, order: { date: f.date, note: $('o-note').value.trim() } });
        btn.disabled = false;
        btn.textContent = label;
        if (!res.ok) { $('o-error').textContent = errorText(res, 'לא נשמר — נסו שוב.'); return; }
        Object.assign(byId(f.id), res.contact);
        if (res.activity) S.activities.push(res.activity);
        S.orderForm = null;
        closeOverlay('crm-order-wrap', rerender);
        toast('ההזמנה נרשמה.');
    }

    // ביטול בשתי לחיצות, כמו מחיקת איש קשר
    function cancelOrderButton(a) {
        const b = el('button', 'crm-link-btn crm-cancel-order', 'בטל');
        b.type = 'button';
        b.setAttribute('aria-label', 'ביטול ההזמנה מ-' + C.formatStamp(a.at));
        let armed = false;
        b.addEventListener('click', async () => {
            if (!armed) {
                armed = true;
                b.textContent = 'בטוח? לחיצה נוספת מבטלת';
                b.setAttribute('aria-label', 'בטוח? לחיצה נוספת מבטלת את ההזמנה');
                setTimeout(() => {
                    armed = false;
                    if (!document.contains(b)) return;
                    b.textContent = 'בטל';
                    b.setAttribute('aria-label', 'ביטול ההזמנה מ-' + C.formatStamp(a.at));
                }, 4000);
                return;
            }
            if (offline()) { toast(ERRORS.network); return; }
            b.disabled = true;
            const res = await api('order_cancel', { activityId: a.id });
            b.disabled = false;
            if (!res.ok) { if (res.error !== 'unauthorized') toast(errorText(res, 'הביטול נכשל.')); return; }
            S.activities = S.activities.filter(x => x.id !== a.id);
            if (res.contact) Object.assign(byId(res.contact.id) || {}, res.contact);
            rerender();
            toast('ההזמנה בוטלה.');
        });
        return b;
    }

    // ---------- משימות ----------

    function taskRow(t, inCard) {
        const li = el('li', 'crm-row crm-task-row');
        const check = el('button', 'crm-check');
        check.type = 'button';
        check.setAttribute('aria-label', 'סימון כבוצעה: ' + t.text);
        check.innerHTML = ICONS.check;
        check.addEventListener('click', () => completeTask(t));
        li.appendChild(check);
        const body = el('div', 'crm-task-body');
        const main = el('button', 'crm-row-main');
        main.type = 'button';
        main.appendChild(el('span', 'crm-row-title crm-task-text', t.text));
        main.appendChild(el('span', 'crm-row-due' + (C.isTaskLate(t, S.today) ? ' is-late' : ''),
            C.taskDueLabel(t, S.today)));
        main.addEventListener('click', () => openTaskForm(t.id, null));
        body.appendChild(main);
        const c = !inCard && t.contactId ? byId(t.contactId) : null;
        if (c) {
            const who = el('button', 'crm-link-btn crm-task-who', C.displayName(c));
            who.type = 'button';
            who.addEventListener('click', () => openCard(c.id));
            body.appendChild(who);
        }
        li.appendChild(body);
        return li;
    }

    function cardTasks(c) {
        const wrap = el('div', 'crm-card-tasks');
        wrap.appendChild(el('h2', 'crm-label', 'משימות'));
        const mine = C.openTasksOf(S.tasks, c.id);
        if (mine.length) {
            const ul = el('ul', 'crm-task-list');
            mine.forEach(t => ul.appendChild(taskRow(t, true)));
            wrap.appendChild(ul);
        }
        const add = el('button', 'crm-btn crm-btn-small', '+ משימה');
        add.type = 'button';
        add.addEventListener('click', () => openTaskForm(null, c.id));
        wrap.appendChild(add);
        return wrap;
    }

    // הסימון מופיע מיד ונשמר ברקע; "בטל" בהודעה פותח את המשימה שוב
    async function completeTask(t) {
        if (offline()) { toast(ERRORS.network); return; }
        const i = S.tasks.indexOf(t);
        if (i >= 0) S.tasks.splice(i, 1);
        rerender();
        const res = await api('task_update', { id: t.id, fields: { done: true } });
        if (!res.ok) {
            S.tasks.push(t);
            rerender();
            if (res.error !== 'unauthorized') toast(errorText(res, 'לא נשמר — נסו שוב.'));
            return;
        }
        if (res.activity) S.activities.push(res.activity);
        if (res.contact) Object.assign(byId(res.contact.id) || {}, res.contact);
        rerender();
        toast('המשימה סומנה כבוצעה.', 'בטל', () => undoTask(t, res.activity ? res.activity.id : null));
    }

    async function undoTask(t, activityId) {
        if (offline()) { toast(ERRORS.network); return; }
        const res = await api('task_update', { id: t.id, fields: { done: false } });
        if (!res.ok) { if (res.error !== 'unauthorized') toast(errorText(res, 'הביטול נכשל.')); return; }
        S.tasks.push(res.task);
        const gone = res.removedActivityId || activityId;
        if (gone) S.activities = S.activities.filter(a => a.id !== gone);
        if (res.contact) Object.assign(byId(res.contact.id) || {}, res.contact);
        rerender();
        toast('המשימה נפתחה שוב.');
    }

    // מפתח הקיצור שהתאריך שלו הוא day (היום, מחר, 3 ימים, שבוע), או null
    function choiceFor(day) {
        const hit = FOLLOW_CHOICES.find(([k]) => C.followUpFor(k, S.today) === day);
        return hit ? hit[0] : null;
    }

    function taskChips(current) {
        chipGroup($('t-date-chips'), FOLLOW_CHOICES, current, (k) => {
            if (!S.taskForm) return;
            S.taskForm.due = C.followUpFor(k, S.today);
            $('t-date').value = S.taskForm.due;
        });
    }

    function openTaskForm(taskId, contactId) {
        const t = taskId ? S.tasks.find(x => x.id === taskId) : null;
        const cid = t ? t.contactId : (contactId || '');
        const c = cid ? byId(cid) : null;
        S.taskForm = { id: t ? t.id : null, contactId: cid, due: t ? t.due : S.today, armed: false };
        $('crm-task-title').textContent = t ? 'עריכת משימה' : 'משימה חדשה';
        $('t-for').hidden = !c;
        $('t-for').textContent = c ? 'על: ' + C.displayName(c) : '';
        $('t-text').value = t ? t.text : '';
        $('t-time').value = t ? t.time : '';
        $('t-date').value = S.taskForm.due;
        $('t-error').textContent = '';
        $('t-delete').hidden = !t;
        $('t-delete').textContent = 'מחיקת המשימה';
        taskChips(choiceFor(S.taskForm.due));
        openOverlay('crm-task-wrap', t ? 'crm-task-title' : 't-text');
    }

    async function submitTask(e) {
        e.preventDefault();
        const f = S.taskForm;
        if (!f) return;
        $('t-error').textContent = '';
        const input = { text: $('t-text').value.trim(), due: f.due, time: $('t-time').value };
        const problem = C.validateTask(input);
        if (problem) { $('t-error').textContent = problem; return; }
        if (offline()) { $('t-error').textContent = ERRORS.network; return; }
        const btn = $('t-submit');
        btn.disabled = true;
        btn.textContent = 'שומר…';
        const res = f.id
            ? await api('task_update', { id: f.id, fields: input })
            : await api('task_add', { task: Object.assign({ contactId: f.contactId }, input) });
        btn.disabled = false;
        btn.textContent = 'שמירה';
        if (!res.ok) { $('t-error').textContent = errorText(res, 'לא נשמר — נסו שוב.'); return; }
        const i = S.tasks.findIndex(x => x.id === res.task.id);
        if (i >= 0) S.tasks[i] = res.task;
        else S.tasks.push(res.task);
        S.taskForm = null;
        closeOverlay('crm-task-wrap', rerender);
        toast(f.id ? 'המשימה עודכנה.' : 'המשימה נוספה.');
    }

    // מחיקה בשתי לחיצות
    async function deleteTask() {
        const f = S.taskForm;
        if (!f || !f.id) return;
        const btn = $('t-delete');
        if (!f.armed) {
            f.armed = true;
            btn.textContent = 'בטוח? לחיצה נוספת מוחקת';
            setTimeout(() => {
                if (S.taskForm === f && f.armed) { f.armed = false; btn.textContent = 'מחיקת המשימה'; }
            }, 4000);
            return;
        }
        btn.disabled = true;
        const res = await api('task_delete', { id: f.id });
        btn.disabled = false;
        if (!res.ok) { $('t-error').textContent = errorText(res, 'המחיקה נכשלה.'); return; }
        S.tasks = S.tasks.filter(x => x.id !== f.id);
        S.taskForm = null;
        closeOverlay('crm-task-wrap', rerender);
        toast('המשימה נמחקה.');
    }

    // ---------- חלון התוצאה ----------

    function openOutcome(id, channel) {
        const c = byId(id);
        if (!c || !S.password) return;
        S.outcome = { id: id, channel: channel };
        const who = c.name || C.displayName(c);
        $('crm-outcome-title').textContent =
            channel === 'quote' ? 'שלחת הצעת מחיר ל' + who + '?'
                : channel === 'whatsapp' ? 'מה יצא מההודעה ל' + who + '?'
                    : 'מה יצא מהשיחה עם ' + who + '?';
        const host = $('crm-outcome-options');
        host.textContent = '';
        C.outcomesFor(channel).forEach(o => {
            const b = el('button', 'crm-option');
            b.type = 'button';
            b.appendChild(el('span', '', o.label));
            b.appendChild(el('span', 'crm-option-hint', o.hint));
            b.addEventListener('click', () => {
                if (o.key === 'talked') showTalkedFollow();
                else finishOutcome(o.key, null);
            });
            host.appendChild(b);
        });
        $('crm-outcome-follow').hidden = true;
        $('crm-outcome-note').value = '';
        openOverlay('crm-outcome', 'crm-outcome-title');
    }

    function showTalkedFollow() {
        const host = $('crm-outcome-follow-chips');
        host.textContent = '';
        [['tomorrow', 'מחר'], ['three', '3 ימים'], ['week', 'שבוע'], ['none', 'בלי']].forEach(([key, label]) => {
            const b = chip(label, false);
            b.addEventListener('click', () => finishOutcome('talked', key));
            host.appendChild(b);
        });
        $('crm-outcome-follow').hidden = false;
        host.firstChild.focus();
    }

    function finishOutcome(key, follow) {
        const o = S.outcome;
        const c = o ? byId(o.id) : null;
        // "הזמין" כשכבר רשומה הזמנה היום — לשאול לפני שנספרת עוד אחת
        if (key === 'ordered' && c && C.orderOn(S.activities, c.id, S.today)) {
            showOrderedChoice();
            return;
        }
        S.outcome = null;
        const note = $('crm-outcome-note').value.trim();
        closeOverlay('crm-outcome');
        if (!c) return;
        const change = C.applyOutcome(c, key, o.channel, S.today, follow, note);
        save(c, change.fields, change.activity);
    }

    function showOrderedChoice() {
        $('crm-outcome-title').textContent = 'כבר רשומה הזמנה מהיום. לרשום הזמנה נוספת?';
        const host = $('crm-outcome-options');
        host.textContent = '';
        [[true, 'כן, הזמנה נוספת'], [false, 'לא, רק לרשום את השיחה']].forEach(([extra, label]) => {
            const b = el('button', 'crm-option', label);
            b.type = 'button';
            b.addEventListener('click', () => finishOrdered(extra));
            host.appendChild(b);
        });
        $('crm-outcome-follow').hidden = true;
        host.firstChild.focus();
    }

    function finishOrdered(extra) {
        const o = S.outcome;
        S.outcome = null;
        const c = o ? byId(o.id) : null;
        const note = $('crm-outcome-note').value.trim();
        closeOverlay('crm-outcome');
        if (!c) return;
        const change = C.applyOutcome(c, 'ordered', o.channel, S.today, null, note, extra);
        save(c, change.fields, change.activity);
    }

    // ---------- קובץ לריווחית ----------
    // הקובץ נבנה ברגע הלחיצה: מספר הלקוח העדכני מהכרטיס, המספרים הקטלוגיים של מוצרי
    // האתר מ-products.csv (אותו מקור שסקריפט ההזמנות משתמש בו), וסוג המסמך שנבחר כאן.
    // שדה 5 בקובץ הוא המספר הקטלוגי, לא מספר הפריט (אפיון 2026-11-12).

    function rivhitItems(a) {
        try {
            const items = JSON.parse(a.items);
            return Array.isArray(items) ? items : [];
        } catch (e) { return []; }
    }

    async function rivhitCodes() {
        if (S.rivhitCodes) return S.rivhitCodes;
        const res = await fetch('/data/products.csv?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) throw new Error('products.csv ' + res.status);
        S.rivhitCodes = R.rivhitCodeMap(R.parseCsv(await res.text()));
        return S.rivhitCodes;
    }

    // פריט מריווחית (RV-<מספר>) מקבל את המספר הקטלוגי העדכני מהרשימה שב-CRM. כך גם
    // הזמנה מלפני 12.11.26, שנשמר בה מספר הפריט, יוצאת עם המספר הקטלוגי.
    async function rivhitCatalogs() {
        if (S.rivhitCatalogs) return S.rivhitCatalogs;
        const res = await api('items');
        if (!res || !res.ok) return {};
        const map = {};
        (res.items || []).forEach(it => { if (it && it[0] && it[2]) map[it[0]] = it[2]; });
        S.rivhitCatalogs = map;
        return map;
    }

    function rivhitOrder(a, c, catalogs) {
        return {
            orderId: a.orderId,
            customer: { business: c.business, contact: c.name, address: c.address },
            items: rivhitItems(a).map(it => {
                const m = /^RV-(\d{1,15})$/.exec(String((it && it.id) || ''));
                return m && catalogs && catalogs[m[1]] ? Object.assign({}, it, { rivhit: catalogs[m[1]] }) : it;
            })
        };
    }

    async function openRivhit(a) {
        const c = byId(a.contactId);
        if (!c) return;
        S.rivhit = { activity: a, docType: a.type === 'בקשת הצעת מחיר' ? 6 : 7 };
        $('r-customer').textContent = (C.displayName(c) + ' · ' + a.orderId + ' · ') +
            (c.rivhitNo ? 'לקוח ' + c.rivhitNo : 'לקוח מזדמן (118) — אין מספר בכרטיס');
        chipGroup($('r-type'), R.SITE_DOC_TYPES.map(t => [t.code, t.label]), S.rivhit.docType,
            (k) => { if (S.rivhit) S.rivhit.docType = k; });
        $('r-error').textContent = '';
        $('r-missing').hidden = true;
        $('r-download').disabled = true;
        openOverlay('crm-rivhit-wrap', 'crm-rivhit-title');
        let codes;
        try {
            codes = await rivhitCodes();
        } catch (e) {
            $('r-error').textContent = 'רשימת המוצרים לא נטענה — בדקו את החיבור ונסו שוב.';
            return;
        }
        let catalogs = {};
        if (rivhitItems(a).some(it => /^RV-/.test(String((it && it.id) || '')))) {
            try { catalogs = await rivhitCatalogs(); } catch (e) { catalogs = {}; }
        }
        if (!S.rivhit || S.rivhit.activity !== a) return;
        S.rivhit.catalogs = catalogs;
        const doc = R.siteOrderDocument(rivhitOrder(a, c, catalogs), codes, { docType: 7, customerNo: '', today: new Date() });
        if (doc.missing.length) {
            $('r-missing').textContent = 'לא ייכנסו לקובץ (אין מספר קטלוגי בריווחית): ' + doc.missing.join(', ');
            $('r-missing').hidden = false;
        }
        if (doc.error || !doc.records.length) {
            $('r-error').textContent = doc.error
                ? 'מספר ההזמנה לא בפורמט הצפוי — אי אפשר להפיק קובץ.'
                : 'לאף מוצר בהזמנה אין מספר קטלוגי בריווחית.';
            return;
        }
        $('r-download').disabled = false;
    }

    function downloadRivhit() {
        const r = S.rivhit;
        if (!r || !S.rivhitCodes) return;
        const c = byId(r.activity.contactId);
        if (!c) return;
        const doc = R.siteOrderDocument(rivhitOrder(r.activity, c, r.catalogs), S.rivhitCodes,
            { docType: r.docType, customerNo: c.rivhitNo || '', today: new Date() });
        if (!doc.records.length) return;
        const blob = new Blob([R.encodeCp1255(doc.text).bytes], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        closeOverlay('crm-rivhit-wrap', () => toast('הקובץ ירד: ' + doc.fileName));
    }

    // ---------- חלונות ----------
    // כל חלון מוסיף ערך היסטוריה, כך ש"חזור" בטלפון סוגר אותו ולא יוצא מהעמוד.

    function openOverlay(id, focusId) {
        S.lastFocus = document.activeElement;
        closeMenu();
        $(id).hidden = false;
        syncLock();
        history.pushState({ crm: 'overlay', overlay: id, id: S.openId }, '', location.href);
        const f = $(focusId);
        if (f) f.focus();
    }

    function closeOverlay(id, then) {
        const o = $(id);
        if (o.hidden) { if (then) then(); return; }
        o.hidden = true;
        syncLock();
        if (S.lastFocus && document.contains(S.lastFocus)) S.lastFocus.focus();
        const st = history.state;
        if (st && st.crm === 'overlay' && st.overlay === id) {
            S.afterPop = then || null;
            history.back();
        } else if (then) {
            then();
        }
    }

    function syncLock() {
        document.body.classList.toggle('crm-locked', !!document.querySelector('.crm-overlay:not([hidden])'));
    }

    window.addEventListener('popstate', (e) => {
        if (!S.password) return;
        const st = e.state || { crm: 'list' };
        document.querySelectorAll('.crm-overlay:not([hidden])').forEach(o => {
            if (!(st.crm === 'overlay' && st.overlay === o.id)) o.hidden = true;
        });
        syncLock();
        // "חזור" סגר חלון — הפוקוס חוזר למה שפתח אותו, ולא נשאר בתוך חלון מוסתר
        const active = document.activeElement;
        if (active && active.closest && active.closest('.crm-overlay[hidden]')) {
            if (S.lastFocus && document.contains(S.lastFocus)) S.lastFocus.focus();
            else $('main-content').focus({ preventScroll: true });
        }
        const cardId = st.crm === 'card' || st.crm === 'overlay' ? st.id : null;
        if (cardId && byId(cardId)) {
            if (S.openId !== cardId || $('crm-card-view').hidden) showCard(cardId);
        } else if (S.openId || !$('crm-card-view').hidden) {
            hideCard();
        }
        const then = S.afterPop;
        S.afterPop = null;
        if (then) then();
    });

    // הקישור מהמייל (#c=<מזהה>): הרשימה מתחת והכרטיס מעליה, כך ש"חזור" מחזיר לרשימה
    function openFromHash() {
        const m = /^#c=(.+)$/.exec(location.hash);
        history.replaceState({ crm: 'list' }, '', location.pathname);
        if (!m) return;
        const id = decodeURIComponent(m[1]);
        if (byId(id)) openCard(id);
        else toast('איש הקשר מהקישור לא נמצא.');
    }

    // ---------- ליד חדש / עריכה ----------

    function chipGroup(host, items, current, onPick) {
        host.textContent = '';
        items.forEach(([key, label]) => {
            const b = chip(label, key === current);
            b.addEventListener('click', () => {
                host.querySelectorAll('.crm-chip').forEach(x => {
                    x.classList.remove('is-on');
                    x.setAttribute('aria-pressed', 'false');
                });
                b.classList.add('is-on');
                b.setAttribute('aria-pressed', 'true');
                onPick(key);
            });
            host.appendChild(b);
        });
    }

    function openForm(mode, id) {
        const c = id ? byId(id) : null;
        S.form = { mode: mode, id: c ? c.id : null, source: 'וואטסאפ', follow: 'today', dupId: null, armed: false };
        $('crm-form-title').textContent = mode === 'add' ? 'ליד חדש' : 'עריכת פרטים';
        $('f-phone-label').textContent = mode === 'add' ? 'טלפון *' : 'טלפון';
        $('f-phone').value = c ? C.formatPhone(c.phone) : '';
        $('f-name').value = c ? c.name : '';
        $('f-business').value = c ? c.business : '';
        $('f-email').value = c ? c.email : '';
        $('f-address').value = c ? c.address : '';
        $('f-rivhit').value = c ? (c.rivhitNo || '') : '';
        $('f-note').value = '';
        $('f-new-only').hidden = mode !== 'add';
        $('f-edit-only').hidden = mode !== 'edit';
        $('f-error').textContent = '';
        $('f-delete').textContent = 'מחיקת איש הקשר';
        chipGroup($('f-source'), C.MANUAL_SOURCES.map(s => [s, s]), S.form.source, (k) => { S.form.source = k; });
        chipGroup($('f-follow'), [['today', 'היום'], ['tomorrow', 'מחר'], ['week', 'שבוע'], ['none', 'בלי']],
            S.form.follow, (k) => { S.form.follow = k; });
        checkDuplicate();
        openOverlay('crm-form-wrap', mode === 'add' ? 'f-phone' : 'crm-form-title');
    }

    function checkDuplicate() {
        const f = S.form;
        if (!f) return;
        const other = C.findByPhone(S.contacts, $('f-phone').value);
        f.dupId = other && other.id !== f.id ? other.id : null;
        const box = $('f-dup');
        box.textContent = '';
        box.hidden = !f.dupId;
        if (!f.dupId) return;
        box.appendChild(document.createTextNode(
            (f.mode === 'add' ? 'כבר קיים: ' : 'המספר שייך ל-') + C.displayName(other) + ' — '));
        const open = el('button', 'crm-link-btn', 'פתח כרטיס');
        open.type = 'button';
        open.addEventListener('click', () => closeOverlay('crm-form-wrap', () => openCard(other.id)));
        box.appendChild(open);
    }

    async function submitForm(e) {
        e.preventDefault();
        const f = S.form;
        if (!f) return;
        $('f-error').textContent = '';
        const input = {
            phone: $('f-phone').value.trim(),
            name: $('f-name').value.trim(),
            business: $('f-business').value.trim()
        };
        const problem = C.validateNew(input, f.mode);
        if (problem) { $('f-error').textContent = problem; return; }
        if (f.dupId) { $('f-error').textContent = 'המספר כבר קיים — פתחו את הכרטיס הקיים.'; return; }
        if (offline()) { $('f-error').textContent = ERRORS.network; return; }
        const btn = $('f-submit');
        btn.disabled = true;
        btn.textContent = 'שומר…';
        const res = f.mode === 'add'
            ? await api('add', { contact: Object.assign(input, {
                source: f.source, followUp: C.followUpFor(f.follow, S.today), note: $('f-note').value.trim() }) })
            : await api('update', { id: f.id, fields: Object.assign(input, {
                email: $('f-email').value.trim(), address: $('f-address').value.trim(),
                rivhitNo: $('f-rivhit').value.trim() }) });
        btn.disabled = false;
        btn.textContent = 'שמירה';
        if (!res.ok) { $('f-error').textContent = errorText(res, 'לא נשמר — נסו שוב.'); return; }
        if (f.mode === 'add') {
            S.contacts.push(res.contact);
            if (res.activity) S.activities.push(res.activity);
            closeOverlay('crm-form-wrap', () => openCard(res.contact.id));
        } else {
            Object.assign(byId(f.id), res.contact);
            closeOverlay('crm-form-wrap', rerender);
        }
    }

    // מחיקה בשתי לחיצות, בלי חלון confirm של הדפדפן
    async function deleteContact() {
        const f = S.form;
        if (!f || f.mode !== 'edit') return;
        const btn = $('f-delete');
        if (!f.armed) {
            f.armed = true;
            btn.textContent = 'בטוח? לחיצה נוספת מוחקת';
            setTimeout(() => {
                if (S.form === f && f.armed) { f.armed = false; btn.textContent = 'מחיקת איש הקשר'; }
            }, 4000);
            return;
        }
        btn.disabled = true;
        const res = await api('delete', { id: f.id });
        btn.disabled = false;
        if (!res.ok) { $('f-error').textContent = errorText(res, 'המחיקה נכשלה.'); return; }
        S.contacts = S.contacts.filter(c => c.id !== f.id);
        S.activities = S.activities.filter(a => a.contactId !== f.id);
        closeOverlay('crm-form-wrap', () => {
            history.replaceState({ crm: 'list' }, '', location.pathname);
            hideCard();
            toast('איש הקשר נמחק.');
        });
    }

    // ---------- סנכרון מגיליון ההזמנות ----------

    async function openImport() {
        $('crm-import-body').textContent = 'בודק את גיליון ההזמנות…';
        $('crm-import-run').hidden = true;
        openOverlay('crm-import', 'crm-import-title');
        const res = await api('import', { dryRun: true });
        if ($('crm-import').hidden) return;
        if (!res.ok) { $('crm-import-body').textContent = errorText(res, 'הבדיקה נכשלה — נסו שוב.'); return; }
        renderImport(res.summary, false);
        $('crm-import-run').hidden = !(res.summary.activities > 0);
    }

    async function runImport() {
        const btn = $('crm-import-run');
        btn.disabled = true;
        btn.textContent = 'מייבא…';
        const res = await api('import', { dryRun: false });
        btn.disabled = false;
        btn.textContent = 'ייבוא';
        if (!res.ok) { toast(errorText(res, 'הייבוא נכשל — נסו שוב.')); return; }
        btn.hidden = true;
        renderImport(res.summary, true);
        refresh(true);
    }

    function renderImport(summary, done) {
        const host = $('crm-import-body');
        host.textContent = '';
        C.importLines(summary, done).forEach(t => host.appendChild(el('p', '', t)));
        if (summary.testRows && summary.testRows.length) {
            host.appendChild(el('p', 'crm-label', 'שורות שדולגו כבדיקה — לוודא שאין ביניהן לקוח אמיתי:'));
            const ul = el('ul', 'crm-import-tests');
            summary.testRows.forEach(t => ul.appendChild(el('li', '', t)));
            host.appendChild(ul);
        }
    }

    // ---------- פריטים מריווחית (אפיונים 2026-11-09, 2026-11-12) ----------
    // הקובץ נקרא כאן בדפדפן. לסקריפט נשלחים רק מספר הפריט, השם והמספר הקטלוגי —
    // מחירי העלות ושאר העמודות של הייצוא לא יוצאים מהמכשיר. פריט בקבוצה "לא פעיל"
    // ופריט בלי מספר קטלוגי לא נשמרים: בלי מספר קטלוגי ריווחית לא מזהה אותו בקליטה.

    function itemsFoundText(parsed) {
        const n = (x) => x.toLocaleString('he-IL');
        const parts = ['נמצאו ' + n(parsed.items.length) + ' פריטים עם מספר קטלוגי.'];
        if (parsed.inactive) parts.push(n(parsed.inactive) + ' פריטים בקבוצה "לא פעיל" לא יישמרו.');
        if (parsed.noCatalog) {
            parts.push(n(parsed.noCatalog) + ' פריטים בלי מספר קטלוגי לא יישמרו — כדי שיופיעו בדף הסוכן, ' +
                'צריך לתת להם מספר קטלוגי בריווחית ולהעלות שוב.');
        }
        return parts.join(' ');
    }

    function itemsStatusText(res) {
        if (!res || !res.ok) return errorText(res, 'לא ניתן לבדוק מה שמור — נסו שוב.');
        if (!res.items || !res.items.length) return 'עוד לא נטענה רשימה.';
        return 'שמורים ' + res.items.length.toLocaleString('he-IL') + ' פריטים' +
            (res.updated ? ' · עודכן ' + C.formatStamp(res.updated) : '');
    }

    function resetItemsForm() {
        S.itemsUpload = null;
        $('i-file').value = '';
        $('i-found').textContent = '';
        $('i-error').textContent = '';
        $('i-save').disabled = true;
    }

    async function openItems() {
        resetItemsForm();
        $('i-status').textContent = 'בודק מה שמור…';
        openOverlay('crm-items', 'crm-items-title');
        const res = await api('items');
        if ($('crm-items').hidden) return;
        $('i-status').textContent = itemsStatusText(res);
    }

    function readItemsFile(file) {
        return new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => {
                try { resolve(R.itemExportRows(R.parseCsv(R.decodeText(new Uint8Array(fr.result))))); }
                catch (e) { resolve({ items: [], error: 'הקובץ לא נקרא.' }); }
            };
            fr.onerror = () => resolve({ items: [], error: 'הקובץ לא נקרא.' });
            fr.readAsArrayBuffer(file);
        });
    }

    async function pickItemsFile() {
        const file = $('i-file').files && $('i-file').files[0];
        S.itemsUpload = null;
        $('i-save').disabled = true;
        $('i-found').textContent = '';
        $('i-error').textContent = '';
        if (!file) return;
        const parsed = await readItemsFile(file);
        if (parsed.error) { $('i-error').textContent = parsed.error; return; }
        S.itemsUpload = parsed.items;
        $('i-found').textContent = itemsFoundText(parsed);
        $('i-save').disabled = false;
    }

    async function saveItems() {
        const items = S.itemsUpload;
        if (!items || !items.length) return;
        if (offline()) { $('i-error').textContent = ERRORS.network; return; }
        const btn = $('i-save');
        btn.disabled = true;
        btn.textContent = 'שומר…';
        $('i-error').textContent = '';
        const res = await api('items_set', { items: items });
        btn.textContent = 'שמירה';
        if (!res.ok) {
            btn.disabled = false;
            $('i-error').textContent = errorText(res, 'השמירה נכשלה — נסו שוב.');
            return;
        }
        resetItemsForm();
        S.rivhitCatalogs = null;
        $('i-status').textContent = 'נשמרו ' + res.count.toLocaleString('he-IL') + ' פריטים · עודכן ' + C.formatStamp(res.updated);
        toast('רשימת הפריטים מריווחית עודכנה.');
    }

    // ---------- תפריט, הודעות, רשת ----------

    function toggleMenu() {
        const m = $('crm-menu');
        m.hidden = !m.hidden;
        $('crm-menu-btn').setAttribute('aria-expanded', String(!m.hidden));
        if (!m.hidden) m.querySelector('button, a').focus();
    }

    function closeMenu() {
        const m = $('crm-menu');
        if (m.hidden) return;
        m.hidden = true;
        $('crm-menu-btn').setAttribute('aria-expanded', 'false');
    }

    let toastTimer = null;
    // הודעה צפה; עם actionLabel — כפתור (למשל "בטל") שנשאר 5 שניות
    function toast(message, actionLabel, onAction) {
        const t = $('crm-toast');
        const b = $('crm-toast-action');
        $('crm-toast-text').textContent = message;
        b.hidden = !actionLabel;
        b.textContent = actionLabel || '';
        b.onclick = actionLabel ? () => {
            t.classList.remove('is-on');
            b.hidden = true;
            onAction();
        } : null;
        t.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            t.classList.remove('is-on');
            b.hidden = true;
        }, actionLabel ? 5000 : 3500);
    }

    function updateOnline() {
        const b = $('crm-banner');
        b.hidden = !offline();
        b.textContent = offline() ? 'אין חיבור לרשת — אפשר לצפות, אבל שינויים לא יישמרו.' : '';
    }

    // מקלדת: Esc סוגר את החלון העליון, Tab מסתובב בתוכו
    document.addEventListener('keydown', (e) => {
        const open = Array.from(document.querySelectorAll('.crm-overlay:not([hidden])')).pop();
        if (!open) {
            if (e.key === 'Escape') closeMenu();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            if (open.id === 'crm-outcome') S.outcome = null;
            closeOverlay(open.id);
            return;
        }
        if (e.key !== 'Tab') return;
        const items = Array.from(open.querySelectorAll('button, a[href], input, textarea, select'))
            .filter(x => !x.disabled && x.offsetParent !== null);
        if (!items.length) return;
        const idx = items.indexOf(document.activeElement);
        if (e.shiftKey && idx <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && (idx === -1 || idx === items.length - 1)) { e.preventDefault(); items[0].focus(); }
    });

    function init() {
        $('crm-login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const pw = $('crm-password').value.trim();
            if (!pw) { $('crm-login-error').textContent = 'הקלידו את הסיסמה.'; return; }
            login(pw);
        });
        $('crm-search').addEventListener('input', (e) => { S.query = e.target.value; renderList(); });
        $('crm-add-btn').addEventListener('click', () => openForm('add'));
        $('crm-task-add-btn').addEventListener('click', () => openTaskForm(null, null));
        $('crm-order-form').addEventListener('submit', submitOrder);
        $('o-cancel').addEventListener('click', () => closeOverlay('crm-order-wrap'));
        $('o-date').addEventListener('change', () => {
            const v = $('o-date').value;
            if (!v || !S.orderForm) return;
            setOrderDate(v);
            orderChips(v);
        });
        $('crm-task-form').addEventListener('submit', submitTask);
        $('t-cancel').addEventListener('click', () => closeOverlay('crm-task-wrap'));
        $('t-delete').addEventListener('click', deleteTask);
        $('t-date').addEventListener('change', () => {
            const v = $('t-date').value;
            if (!v || !S.taskForm) return;
            S.taskForm.due = v;
            taskChips(choiceFor(v));
        });
        $('crm-menu-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
        $('crm-menu').addEventListener('click', (e) => {
            const b = e.target.closest('[data-menu]');
            if (!b) return;
            closeMenu();
            const k = b.getAttribute('data-menu');
            if (k === 'refresh') refresh(false);
            // הפריט בתפריט כבר מוסתר — החלון יחזיר את הפוקוס לכפתור התפריט
            else if (k === 'import') { $('crm-menu-btn').focus(); openImport(); }
            else if (k === 'items') { $('crm-menu-btn').focus(); openItems(); }
            else if (k === 'logout') logout('יצאת מה-CRM.');
        });
        document.addEventListener('click', (e) => {
            const m = $('crm-menu');
            if (!m.hidden && !m.contains(e.target) && !$('crm-menu-btn').contains(e.target)) closeMenu();
        });
        $('crm-back').addEventListener('click', () => history.back());
        $('crm-edit-btn').addEventListener('click', () => { if (S.openId) openForm('edit', S.openId); });
        $('crm-outcome-skip').addEventListener('click', () => { S.outcome = null; closeOverlay('crm-outcome'); });
        $('crm-form').addEventListener('submit', submitForm);
        $('f-cancel').addEventListener('click', () => closeOverlay('crm-form-wrap'));
        $('f-phone').addEventListener('input', checkDuplicate);
        $('f-delete').addEventListener('click', deleteContact);
        $('crm-import-run').addEventListener('click', runImport);
        $('crm-import-close').addEventListener('click', () => closeOverlay('crm-import'));
        $('i-file').addEventListener('change', pickItemsFile);
        $('i-save').addEventListener('click', saveItems);
        $('i-close').addEventListener('click', () => { S.itemsUpload = null; closeOverlay('crm-items'); });
        $('r-download').addEventListener('click', downloadRivhit);
        $('r-cancel').addEventListener('click', () => { S.rivhit = null; closeOverlay('crm-rivhit-wrap'); });
        document.querySelectorAll('.crm-overlay').forEach(o => o.addEventListener('click', (e) => {
            if (e.target !== o) return;
            if (o.id === 'crm-outcome') S.outcome = null;
            closeOverlay(o.id);
        }));
        window.addEventListener('online', updateOnline);
        window.addEventListener('offline', updateOnline);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible' || !S.password) return;
            S.today = C.ymd(new Date());
            if (document.querySelector('.crm-overlay:not([hidden])')) return;
            if (Date.now() - S.loadedAt > REFRESH_AFTER_MS) refresh(true);
        });
        updateOnline();
        const saved = readKey();
        if (saved) {
            $('crm-login').hidden = false;
            $('crm-login-error').textContent = 'טוען…';
            login(saved);
        } else {
            showLogin('');
        }
    }

    init();
})();
