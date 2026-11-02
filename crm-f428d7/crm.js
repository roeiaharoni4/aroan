/* CRM — אהרוני: ממשק העמוד. הלוגיקה הטהורה ב-crm-core.js (נבדקת ב-Node).
   הנתונים מגיעים מסקריפט ה-CRM (tools/google-apps-script-crm.gs) — POST בלבד,
   והסיסמה בגוף הבקשה ולא בכתובת.
   אפיון: docs/superpowers/specs/2026-11-02-crm-design.md */
(function () {
    'use strict';

    // כתובת ה-Web app של סקריפט ה-CRM. אינה סוד: בלי הסיסמה היא לא מחזירה נתונים.
    const API_URL = 'PUT_CRM_URL_HERE';
    const KEY_STORE = 'aroam_crm_key';
    const REFRESH_AFTER_MS = 5 * 60 * 1000;
    const C = window.CrmCore;

    // אייקונים קבועים מהקוד — היחיד שנכנס ל-DOM ב-innerHTML. נתונים מהגיליון: textContent בלבד.
    const ICONS = {
        call: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
        whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
        quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'
    };
    const ACTION_LABELS = { call: 'התקשר', whatsapp: 'וואטסאפ', quote: 'הצעת מחיר' };
    const ERRORS = {
        network: 'אין חיבור — לא נשמר.',
        busy: 'השרת עסוק — נסו שוב בעוד רגע.',
        duplicate: 'המספר כבר קיים ב-CRM.',
        'bad phone': 'מספר הטלפון לא תקין.',
        'name required': 'צריך שם או שם עסק.',
        'not found': 'איש הקשר כבר לא קיים — רעננו את הרשימה.'
    };
    const FOLLOW_CHOICES = [['today', 'היום'], ['tomorrow', 'מחר'], ['three', '3 ימים'], ['week', 'שבוע']];

    const S = {
        password: '', contacts: [], activities: [], filter: 'todo', query: '',
        today: C.ymd(new Date()), loadedAt: 0, openId: null,
        outcome: null, form: null, afterPop: null, lastFocus: null
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
        const counts = C.counts(S.contacts, S.today);
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
        const list = C.filterContacts(S.contacts, S.filter, S.query, S.today);
        const ul = $('crm-list');
        ul.textContent = '';
        list.forEach(c => ul.appendChild(rowFor(c)));
        $('crm-empty').hidden = list.length > 0;
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
        const sub = C.subLine(c, S.today);
        if (sub) main.appendChild(el('span', 'crm-row-sub', sub));
        const due = C.followUpLabel(c, S.today);
        if (due) main.appendChild(el('span', 'crm-row-due' + (C.isOverdue(c, S.today) ? ' is-late' : ''), due));
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
        const orders = Number(c.orders) > 0 ? ' · ' + c.orders + ' הזמנות' : '';
        host.appendChild(el('p', 'crm-card-meta', 'מקור: ' + (c.source || '—') + orders));
        host.appendChild(actions(c, false));

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
        if (links.childNodes.length) li.appendChild(links);
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
        S.outcome = null;
        const c = o ? byId(o.id) : null;
        const note = $('crm-outcome-note').value.trim();
        closeOverlay('crm-outcome');
        if (!c) return;
        const change = C.applyOutcome(c, key, o.channel, S.today, follow, note);
        save(c, change.fields, change.activity);
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
                email: $('f-email').value.trim(), address: $('f-address').value.trim() }) });
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
    function toast(message) {
        const t = $('crm-toast');
        t.textContent = message;
        t.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('is-on'), 3500);
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
        $('crm-menu-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
        $('crm-menu').addEventListener('click', (e) => {
            const b = e.target.closest('[data-menu]');
            if (!b) return;
            closeMenu();
            const k = b.getAttribute('data-menu');
            if (k === 'refresh') refresh(false);
            else if (k === 'import') openImport();
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
