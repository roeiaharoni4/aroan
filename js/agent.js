/**
 * js/agent.js — שכבת הסוכן מעל הקטלוג. נטען אך ורק ב-/agent/.
 *
 * מה יש כאן ואין ב-app.js:
 *  1. לקוחות — נבנים מעצמם מההזמנות. אין רשימה לייבא ואין מחירון לתחזק:
 *     לקוח נוצר בפעם הראשונה שמקלידים את שמו, והמחיר שניתן לו בהזמנה הוא
 *     המחיר שעולה אצלו בפעם הבאה.
 *  2. תור אופליין — הזמנה שנקלטה בלי רשת נשמרת ונשלחת כשהרשת חוזרת.
 *  3. הכנה לעבודה בשטח — חימום ה-cache של ה-service worker לפני הנסיעה.
 *
 * הממשק היחיד אל app.js הוא window.APP והאירועים aroam:app-ready /
 * aroam:order-sent. אין כאן גישה למשתנים הפנימיים של app.js.
 */
(function () {
    'use strict';

    const CUSTOMERS_KEY = 'aroam_agent_customers';
    const ACTIVE_KEY = 'aroam_agent_customer';
    const OUTBOX_KEY = 'aroam_agent_outbox';
    const QUOTE_KEY = 'aroam_qh_key';          // סיסמת הענן, נשמרת ע"י app.js
    const FORGOTTEN_DAYS = 21;

    // מחירי המחירון כפי שנטענו מ-products.csv, לפני החלת מחירי לקוח.
    // בלעדיהם מעבר מלקוח א' ללקוח ב' היה משאיר את המחירים של א'.
    let BASE_PRICES = {};
    let ACTIVE = null;
    let gateEl = null;

    // ---------- עזרים ----------

    const toast = (m) => (window.APP && window.APP.showToast ? window.APP.showToast(m) : console.log(m));

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) { return fallback; }
    }

    function writeJson(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { }
    }

    function esc(t) {
        return String(t == null ? '' : t)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // מפתח השוואה לשם לקוח — כדי ש"אהרוני" ו"אהרוני " לא יהיו שני לקוחות
    function nameKey(name) {
        return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    function daysSince(iso) {
        if (!iso) return null;
        const t = Date.parse(iso);
        if (isNaN(t)) return null;
        return Math.floor((Date.now() - t) / 86400000);
    }

    function setField(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    }

    // ---------- מאגר הלקוחות ----------

    function loadCustomers() {
        const list = readJson(CUSTOMERS_KEY, []);
        return Array.isArray(list) ? list : [];
    }

    function saveCustomers(list) { writeJson(CUSTOMERS_KEY, list); }

    function findCustomer(name) {
        const key = nameKey(name);
        return loadCustomers().find(c => nameKey(c.name) === key) || null;
    }

    // יוצר או מעדכן לקוח לפי שם. patch מתמזג לתוך הרשומה הקיימת.
    function upsertCustomer(name, patch) {
        const list = loadCustomers();
        const key = nameKey(name);
        let rec = list.find(c => nameKey(c.name) === key);
        if (!rec) {
            rec = { name: String(name).trim(), phone: '', address: '', notes: '', prices: {}, orderCount: 0 };
            list.push(rec);
        }
        Object.assign(rec, patch || {});
        rec.name = String(rec.name).trim();
        saveCustomers(list);
        return rec;
    }

    // ---------- מחירי הלקוח ----------

    function snapshotBasePrices() {
        BASE_PRICES = {};
        (window.APP.getProducts() || []).forEach(p => { BASE_PRICES[p.id] = p.price; });
    }

    // מאפס למחירון ואז מחיל את המחירים של הלקוח הנבחר.
    function applyCustomerPrices(customer) {
        const products = window.APP.getProducts() || [];
        const prices = (customer && customer.prices) || {};
        products.forEach(p => {
            if (Object.prototype.hasOwnProperty.call(BASE_PRICES, p.id)) p.price = BASE_PRICES[p.id];
            const own = parseFloat(prices[p.id]);
            if (isFinite(own) && own > 0) p.price = own;
        });
        window.APP.refresh();
    }

    // ---------- הלקוח הפעיל ----------

    function setActiveCustomer(customer) {
        ACTIVE = customer;
        writeJson(ACTIVE_KEY, customer ? customer.name : null);
        setField('cust-business', customer ? customer.name : '');
        setField('cust-phone', customer ? customer.phone : '');
        setField('cust-contact', customer ? customer.contact : '');
        setField('cust-address', customer ? customer.address : '');
        setField('cust-notes', '');
        applyCustomerPrices(customer);
        renderBar();
    }

    // ---------- שורת הלקוח בכותרת ----------

    function renderBar() {
        const host = document.getElementById('agent-bar');
        if (!host) return;
        if (!ACTIVE) { host.innerHTML = ''; return; }

        const pending = loadOutbox().length;
        const last = ACTIVE.lastOrder;
        const ago = daysSince(ACTIVE.lastOrderAt);

        host.innerHTML = `
            <div class="agent-bar">
                <div class="agent-bar-who">
                    <span class="agent-bar-label">מזמין עבור</span>
                    <strong>${esc(ACTIVE.name)}</strong>
                    ${ago != null ? `<span class="agent-bar-ago">הזמנה אחרונה לפני ${ago} ימים</span>` : ''}
                </div>
                <div class="agent-bar-actions">
                    ${last && last.items && last.items.length
                ? '<button type="button" class="agent-chip" data-act="repeat">ההזמנה הקודמת</button>' : ''}
                    <button type="button" class="agent-chip" data-act="switch">החלף לקוח</button>
                    ${pending ? `<button type="button" class="agent-chip agent-chip-warn" data-act="outbox">${pending} ממתינות לשליחה</button>` : ''}
                </div>
            </div>`;

        host.querySelectorAll('[data-act]').forEach(btn => {
            btn.addEventListener('click', () => {
                const act = btn.getAttribute('data-act');
                if (act === 'repeat') repeatLastOrder();
                else if (act === 'switch') openGate(true);
                else if (act === 'outbox') showOutbox();
            });
        });
    }

    function repeatLastOrder() {
        if (!ACTIVE || !ACTIVE.lastOrder || !ACTIVE.lastOrder.items) return;
        const n = window.APP.applyOrder(ACTIVE.lastOrder.items);
        toast(n ? `נטענו ${n} שורות מההזמנה הקודמת` : 'ההזמנה הקודמת ריקה');
    }

    // ---------- בורר הלקוח ----------

    function openGate(push) {
        if (!gateEl) buildGate();
        gateEl.style.display = 'flex';
        document.body.classList.add('agent-gate-open');
        renderGateList('');
        if (push) {
            try { history.pushState({ agentStep: 'gate' }, '', location.pathname); } catch (e) { }
        }
    }

    function closeGate() {
        if (gateEl) gateEl.style.display = 'none';
        document.body.classList.remove('agent-gate-open');
    }

    function buildGate() {
        gateEl = document.createElement('div');
        gateEl.id = 'agent-gate';
        gateEl.className = 'agent-gate';
        gateEl.innerHTML = `
            <div class="agent-gate-inner">
                <img src="/images/logo.png" alt="" class="agent-gate-logo" onerror="this.style.display='none'">
                <h2>אצל מי אנחנו?</h2>
                <input type="search" id="agent-search" class="agent-gate-search" placeholder="חיפוש לקוח..." autocomplete="off">
                <div id="agent-list" class="agent-list"></div>
                <div id="agent-new" class="agent-new" style="display:none;">
                    <input type="text" id="agent-new-name" class="agent-gate-search" placeholder="שם הלקוח (עסק / מוסד)" autocomplete="off">
                    <input type="tel" id="agent-new-phone" class="agent-gate-search" placeholder="טלפון" autocomplete="off">
                    <button type="button" class="agent-gate-btn agent-gate-btn-solid" data-act="save-new">שמור והתחל הזמנה</button>
                </div>
                <div class="agent-gate-foot">
                    <button type="button" class="agent-gate-btn" data-act="new">+ לקוח חדש</button>
                    <button type="button" class="agent-gate-btn" data-act="forgotten">לקוחות שנשכחו</button>
                    <button type="button" class="agent-gate-btn" data-act="restore">שחזור מהענן</button>
                    <button type="button" class="agent-gate-btn" data-act="offline">הכנה לעבודה בלי רשת</button>
                </div>
            </div>`;
        document.body.appendChild(gateEl);

        const search = gateEl.querySelector('#agent-search');
        search.addEventListener('input', () => renderGateList(search.value));

        gateEl.querySelector('[data-act="save-new"]').addEventListener('click', submitNewCustomer);
        gateEl.querySelector('#agent-new-phone').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitNewCustomer();
        });
        gateEl.querySelector('#agent-new-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') gateEl.querySelector('#agent-new-phone').focus();
        });

        gateEl.querySelectorAll('.agent-gate-foot [data-act]').forEach(btn => {
            btn.addEventListener('click', () => {
                const act = btn.getAttribute('data-act');
                if (act === 'new') addCustomerFlow();
                else if (act === 'forgotten') renderGateList('', true);
                else if (act === 'restore') restoreFromCloud();
                else if (act === 'offline') prepareOffline();
            });
        });
    }

    function renderGateList(query, forgottenOnly) {
        const listEl = gateEl.querySelector('#agent-list');
        const q = nameKey(query);
        let list = loadCustomers();

        if (forgottenOnly) {
            list = list.filter(c => {
                const d = daysSince(c.lastOrderAt);
                return d == null || d >= FORGOTTEN_DAYS;
            });
        }
        if (q) list = list.filter(c => nameKey(c.name).includes(q) || String(c.phone || '').includes(query.trim()));

        // הוותיקים ביותר קודם — מי שלא הזמין הכי הרבה זמן דורש טיפול
        list.sort((a, b) => String(a.lastOrderAt || '').localeCompare(String(b.lastOrderAt || '')));

        if (!list.length) {
            listEl.innerHTML = `<p class="agent-empty">${forgottenOnly
                ? 'אין לקוחות שנשכחו. יפה.'
                : (loadCustomers().length ? 'אין לקוח שמתאים לחיפוש.' : 'עוד אין לקוחות. הוסף את הראשון ב"+ לקוח חדש".')}</p>`;
            return;
        }

        listEl.innerHTML = list.map(c => {
            const d = daysSince(c.lastOrderAt);
            const meta = d == null ? 'טרם הזמין' : `לפני ${d} ימים · ${c.orderCount || 0} הזמנות`;
            return `<button type="button" class="agent-card${d != null && d >= FORGOTTEN_DAYS ? ' agent-card-cold' : ''}" data-name="${esc(c.name)}">
                        <strong>${esc(c.name)}</strong>
                        <span>${esc(meta)}</span>
                    </button>`;
        }).join('');

        listEl.querySelectorAll('.agent-card').forEach(btn => {
            btn.addEventListener('click', () => pickCustomer(btn.getAttribute('data-name')));
        });
    }

    function pickCustomer(name) {
        const rec = findCustomer(name);
        if (!rec) return;
        setActiveCustomer(rec);
        closeGate();
        // ערך היסטוריה יחיד מעל הבורר. כשמגיעים ממסך הבורר עצמו מחליפים את
        // הערך שלו במקום להוסיף עוד אחד — אחרת כל החלפת לקוח הייתה מערימה
        // שני ערכים, ו"חזור" היה דורש שתי לחיצות.
        try {
            const from = history.state && history.state.agentStep;
            const st = { agentStep: 'catalog' };
            if (from === 'gate') history.replaceState(st, '', location.pathname);
            else history.pushState(st, '', location.pathname);
        } catch (e) { }
        toast(`מזמין עבור ${rec.name}`);
    }

    // טופס inline ולא prompt() — שלושה חלונות prompt רצופים על טלפון, בעמידה
    // אצל לקוח, זה בדיוק מה שהופך קליטת הזמנה למעצבנת.
    function addCustomerFlow() {
        const form = gateEl.querySelector('#agent-new');
        form.style.display = form.style.display === 'block' ? 'none' : 'block';
        if (form.style.display === 'block') form.querySelector('#agent-new-name').focus();
    }

    function submitNewCustomer() {
        const form = gateEl.querySelector('#agent-new');
        const nameEl = form.querySelector('#agent-new-name');
        const phoneEl = form.querySelector('#agent-new-phone');
        const name = nameEl.value.trim();

        if (!name) { nameEl.focus(); toast('נא למלא שם לקוח'); return; }
        if (findCustomer(name)) { nameEl.focus(); toast('הלקוח כבר קיים ברשימה'); return; }

        const rec = upsertCustomer(name, { phone: phoneEl.value.trim() });
        nameEl.value = '';
        phoneEl.value = '';
        form.style.display = 'none';
        pickCustomer(rec.name);
    }

    // ---------- למידה מהזמנה שנשלחה ----------

    function learnFromOrder(detail) {
        const name = (detail.customer && detail.customer.business) || (ACTIVE && ACTIVE.name);
        if (!name) return;

        const prices = Object.assign({}, (findCustomer(name) || {}).prices || {});
        const items = (detail.items || []).map(it => {
            const price = parseFloat(it.price);
            if (isFinite(price) && price > 0) prices[it.id] = price;
            return { id: it.id, name: it.name, unit: it.unit, quantity: it.qty, price: price || 0, category: it.category };
        });

        const existing = findCustomer(name);
        const rec = upsertCustomer(name, {
            phone: (detail.customer && detail.customer.phone) || (existing && existing.phone) || '',
            contact: (detail.customer && detail.customer.contact) || (existing && existing.contact) || '',
            address: (detail.customer && detail.customer.address) || (existing && existing.address) || '',
            prices: prices,
            lastOrder: { date: new Date().toISOString().slice(0, 10), orderId: detail.orderId, items: items },
            lastOrderAt: new Date().toISOString(),
            orderCount: ((existing && existing.orderCount) || 0) + 1
        });

        ACTIVE = rec;
        renderBar();

        backupToCloud(rec, detail);
    }

    // גיבוי ה-CRM לגיליון AgentQuotes. שקט בכוונה: רק אם סיסמת הענן כבר
    // הוזנה בהפעלה הזאת — אחרת הייתה קופצת שאלת סיסמה באמצע ביקור אצל לקוח.
    function backupToCloud(rec, detail) {
        let hasKey = false;
        try { hasKey = !!sessionStorage.getItem(QUOTE_KEY); } catch (e) { }
        if (!hasKey || !window.APP.saveQuote) return;
        try {
            window.APP.saveQuote({
                id: detail.orderId,
                date: new Date().toISOString().slice(0, 10),
                customer: rec.name,
                items: rec.lastOrder.items,
                total: Number((detail.totals && detail.totals.total) || 0)
            });
        } catch (e) { console.error('backupToCloud failed', e); }
    }

    // בונה מחדש את רשימת הלקוחות מגיליון הענן (טלפון חדש / דפדפן שנוקה).
    // טלפון וכתובת אינם נשמרים בענן ולכן לא משוחזרים — השמות, המחירים
    // וההזמנה האחרונה כן.
    async function restoreFromCloud() {
        if (!window.APP.getQuoteHistory) { toast('שחזור לא זמין'); return; }
        toast('מושך מהענן...');
        const history = await window.APP.getQuoteHistory();
        if (!history || !history.length) { toast('לא נמצאו רשומות בענן'); return; }

        // מהישן לחדש, כך שההזמנה האחרונה של כל לקוח היא זו שנשארת
        const ordered = history.slice().reverse();
        let count = 0;
        ordered.forEach(q => {
            if (!q.customer) return;
            const existing = findCustomer(q.customer);
            const prices = Object.assign({}, (existing && existing.prices) || {});
            const items = (q.items || []).map(it => {
                const price = parseFloat(it.price);
                if (isFinite(price) && price > 0) prices[it.id] = price;
                return { id: it.id, name: it.name, unit: it.unit, quantity: it.quantity != null ? it.quantity : it.qty, price: price || 0 };
            });
            upsertCustomer(q.customer, {
                prices: prices,
                lastOrder: { date: q.date, orderId: q.id, items: items },
                lastOrderAt: q.date ? new Date(q.date).toISOString() : (existing && existing.lastOrderAt) || '',
                orderCount: ((existing && existing.orderCount) || 0) + 1
            });
            count++;
        });
        renderGateList('');
        toast(`שוחזרו ${count} רשומות`);
    }

    // ---------- תור אופליין ----------

    function loadOutbox() {
        const list = readJson(OUTBOX_KEY, []);
        return Array.isArray(list) ? list : [];
    }

    function enqueue(payload) {
        const list = loadOutbox();
        list.push({ queuedAt: new Date().toISOString(), payload: payload });
        writeJson(OUTBOX_KEY, list);
        renderBar();
    }

    // FIFO. עוצר בפריט הראשון שנכשל, כדי לשמור על סדר ההזמנות.
    async function flushOutbox(silent) {
        const list = loadOutbox();
        if (!list.length) return;
        if (!navigator.onLine) return;

        let sent = 0;
        while (list.length) {
            const ok = await window.APP.postOrderPayload(list[0].payload);
            if (!ok) break;
            list.shift();
            writeJson(OUTBOX_KEY, list);
            sent++;
        }
        renderBar();
        if (sent) toast(`${sent} הזמנות ממתינות נשלחו`);
    }

    function showOutbox() {
        const list = loadOutbox();
        if (!list.length) { toast('אין הזמנות ממתינות'); return; }
        const lines = list.map(e => `${e.payload.orderId} · ${e.payload.totalItems} פריטים`).join('\n');
        if (confirm(`הזמנות שממתינות לשליחה:\n\n${lines}\n\nלנסות לשלוח עכשיו?`)) flushOutbox();
    }

    // ---------- הכנה לעבודה בלי רשת ----------

    // רשימת הכתובות נבנית כאן ולא ב-sw.js, כי רק כאן ידוע אילו מוצרים
    // באמת קיימים ואיזו תמונה יש לכל אחד.
    function offlineUrls() {
        const urls = [
            '/agent/', '/css/style.css', '/js/app.js', '/js/agent.js',
            '/js/lib/papaparse.min.js', '/images/logo.png', '/data/products.csv'
        ];
        (window.APP.getProducts() || []).forEach(p => {
            if (p.image && urls.indexOf(p.image) === -1) urls.push(p.image);
        });
        return urls;
    }

    function prepareOffline() {
        if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
            toast('ההכנה זמינה רק אחרי שהאתר נטען פעם אחת מהרשת');
            return;
        }
        const urls = offlineUrls();
        toast(`מכין ${urls.length} קבצים לעבודה בלי רשת...`);
        navigator.serviceWorker.controller.postMessage({ type: 'aroam-prepare-offline', urls: urls });
    }

    // דף הסוכן לא טוען את components.js (אין בו הדר/פוטר של האתר), ולכן ה-service
    // worker לא נרשם כאן. בלעדיו אין עבודה בלי רשת — הוא נרשם רק במקרה, אם
    // הדפדפן ביקר קודם בדף אחר באתר.
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .catch(err => console.log('Service Worker registration failed', err));
    }

    if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', (e) => {
            if (!e.data || e.data.type !== 'aroam-offline-ready') return;
            toast(e.data.ok
                ? `מוכן לעבודה בשטח (${e.data.cached} קבצים)`
                : 'ההכנה נכשלה — נסה שוב עם חיבור טוב יותר');
        });
    }

    // ---------- חלון ההזמנה ו"חזור" ----------

    // בדף הסוכן cartView כבוי (החלון משרת גם הצעות מחיר, PDF והיסטוריה),
    // ולכן app.js לא דוחף ערך היסטוריה בפתיחתו. בלי הערך הזה "חזור" מחלון
    // פתוח היה מדלג ישר לבורר הלקוח והחלון היה נשאר פתוח מתחתיו.
    function hookOrderModalHistory() {
        const openBtn = document.getElementById('open-order-btn');
        if (!openBtn) return;
        openBtn.addEventListener('click', () => {
            try { history.pushState({ agentStep: 'cart' }, '', location.pathname); } catch (e) { }
        });
    }

    function closeOrderModal() {
        const btn = document.getElementById('close-order-btn');
        if (btn) btn.click();
    }

    // ---------- כפתור "חזור" ----------

    // נרשם בזמן טעינת הקובץ, כלומר לפני המאזין של app.js (שנרשם בתוך init
    // האסינכרוני). לכן הוא רץ ראשון ויוצא מוקדם כשתצוגת הסל פתוחה — שם
    // ה"חזור" שייך ל-app.js, שסוגר את הסל.
    window.addEventListener('popstate', (e) => {
        const modal = document.getElementById('order-modal');
        // תצוגת סל מלאת-מסך שייכת ל-app.js (לא בשימוש בדף הסוכן, אבל
        // המאזין הזה נרשם ראשון ולכן חייב לפנות לו את הדרך)
        if (modal && modal.classList.contains('cart-page')) return;
        if (modal && modal.classList.contains('open')) { closeOrderModal(); return; }
        const step = e.state && e.state.agentStep;
        if (step === 'catalog') { closeGate(); return; }
        openGate(false);
    });

    // ---------- אתחול ----------

    document.addEventListener('aroam:order-sent', (e) => {
        const detail = e.detail || {};
        learnFromOrder(detail);
        // התשובה אטומה (no-cors) ולכן false = כשל רשת בלבד. עדיף הזמנה
        // כפולה בגיליון (אותו מספר הזמנה, ניתנת לזיהוי) על הזמנה אבודה.
        Promise.resolve(detail.delivery).then(ok => {
            if (ok) return;
            enqueue(detail.payload);
            toast('אין רשת — ההזמנה נשמרה ותישלח כשהחיבור יחזור');
        });
    });

    document.addEventListener('aroam:app-ready', () => {
        if (!window.APP || !window.APP.getConfig().agentMode) return;

        snapshotBasePrices();

        hookOrderModalHistory();

        const savedName = readJson(ACTIVE_KEY, null);
        const rec = savedName ? findCustomer(savedName) : null;
        if (rec) setActiveCustomer(rec);

        // הבורר נפתח רק אחרי שעברו את קוד הגישה, כדי שלא יוצג מעל מסך ה-PIN
        const unlocked = () => {
            // מייצרים שני ערכי היסטוריה כבר בטעינה — הבורר מתחת והקטלוג מעליו —
            // כדי ש"חזור" מהקטלוג יחזיר לבורר במקום לצאת מהאתר.
            try {
                history.replaceState({ agentStep: 'gate' }, '', location.pathname);
                if (ACTIVE) history.pushState({ agentStep: 'catalog' }, '', location.pathname);
            } catch (e) { }

            if (ACTIVE) renderBar();
            else openGate(false);
            flushOutbox(true);
        };

        if (localStorage.getItem('agent_logged_in') === 'true') unlocked();
        else document.addEventListener('aroam:agent-unlocked', unlocked, { once: true });
    });

    window.addEventListener('online', () => flushOutbox());
})();
