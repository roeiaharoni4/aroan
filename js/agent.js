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
    // ה-CRM הוא מקור האמת ללקוחות, למחירים ולהצעות (אפיון 2026-11-15)
    const CRM_OPS_KEY = 'aroam_agent_crm_ops';
    const QUOTES_KEY = 'aroam_agent_crm_quotes';
    const MIGRATED_KEY = 'aroam_agent_migrated_v1';
    const FILLED_KEY = 'aroam_agent_prices_filled_v1';
    const AS = window.AgentStore;
    const FORGOTTEN_DAYS = 21;
    // פריטים מריווחית (אפיון 2026-11-09): הרשימה בגיליון ה-CRM, מאחורי הסיסמה שה-CRM שומר במכשיר
    const CRM_API = 'https://script.google.com/macros/s/AKfycbzs-jtpiy0yH6MnGjy_B2wULKZ56fpQ67UgtCDDPe9o0IZH_gjYb36RBqW7vVt8wGRcbw/exec';
    const CRM_KEY = 'aroam_crm_key';
    const RIVHIT_KEY = 'aroam_agent_rivhit_items';
    const CRM_SYNC_MS = 60000;   // פתיחה חוזרת של הבורר בתוך דקה לא מושכת שוב

    // מחירי המחירון כפי שנטענו מ-products.csv, לפני החלת מחירי לקוח.
    // בלעדיהם מעבר מלקוח א' ללקוח ב' היה משאיר את המחירים של א'.
    let BASE_PRICES = {};
    let ACTIVE = null;
    let gateEl = null;
    // הלקוח שהיה פעיל בכניסה הקודמת — רק כדי לומר בבורר של מי הסל שנשאר
    let draftOwner = '';
    let rivhitLoaded = false;   // יש רשימת פריטים מריווחית (מהעותק במכשיר או מה-CRM)

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
    const nameKey = AS.nameKey;

    function daysSince(iso) {
        if (!iso) return null;
        const t = Date.parse(iso);
        if (isNaN(t)) return null;
        return Math.floor((Date.now() - t) / 86400000);
    }

    const phoneDigits = AS.phoneDigits;
    const isOwnPhone = AS.isOwnPhone;

    function newLocalId() {
        return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function setField(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    }

    // ---------- מאגר הלקוחות ----------

    function loadCustomers() {
        // רשומה פגומה (null, בלי שם) הפילה את דף הסוכן — מסננים אותה
        const list = readJson(CUSTOMERS_KEY, []);
        return Array.isArray(list) ? list.filter(c => c && typeof c === 'object' && c.name) : [];
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

    // ---------- פריטים מריווחית (אפיונים 2026-11-09, 2026-11-12) ----------
    // הפריטים נכנסים ל-PRODUCTS עם fromRivhit, ו-app.js מציג אותם רק בחיפוש.
    // פריט שכבר משויך למוצר באתר (עמודת rivhit) לא נכנס פעמיים — מוצג מוצר האתר.
    // הרשימה מה-CRM היא שלשות [מספר פריט, שם, מספר קטלוגי]. rivhit של הפריט הוא
    // המספר הקטלוגי — זה מה שנכנס לשדה 5 בקובץ הקליטה. המזהה נשאר RV-<מספר פריט>,
    // כי לפיו נשמרים המחירים של הלקוחות.

    // אותו כלל כמו catalogCode ב-js/rivhit-core.js (דף הסוכן לא טוען אותו)
    function catalogCode(v) {
        const s = String(v == null ? '' : v).trim();
        return s.length <= 15 && /^[^\t\r\n"|]+$/.test(s) ? s : '';
    }

    function siteRivhitCodes(products) {
        const set = new Set();
        products.forEach(p => {
            if (p.fromRivhit) return;
            String(p.rivhit || '').split('|').forEach(c => { c = c.trim(); if (c) set.add(c); });
        });
        return set;
    }

    // מוסיף פריטים שעוד לא קיימים. מחיר הבסיס 0 — מחיר הלקוח מוחל מעליו.
    // פריט שכבר בזיכרון מקבל את השם ואת המספר הקטלוגי מהרשימה החדשה: תיקון בריווחית,
    // או שם שהמפענח הישן הדביק אליו שורות אחרות (10.11.26).
    // פריט בלי מספר קטלוגי לא נכנס: בלי מספר קטלוגי ריווחית לא מזהה אותו בקליטה ופותחת
    // פריט חדש. כך גם עותק ישן במכשיר (זוגות, לפני 12.11.26) לא מוסיף אף פריט עד
    // שהרשימה החדשה מגיעה מה-CRM.
    function addRivhitItems(items) {
        const products = window.APP.getProducts() || [];
        const taken = siteRivhitCodes(products);
        const have = new Map(products.filter(p => p.fromRivhit).map(p => [p.id, p]));
        const seen = new Set();
        let added = 0;
        (items || []).forEach(it => {
            const num = String((it && it[0]) || '').trim();
            const name = String((it && it[1]) || '').trim();
            const code = catalogCode(it && it[2]);
            if (!/^\d{1,15}$/.test(num) || !name || !code || seen.has(num)) return;
            if (taken.has(code) || taken.has(num)) return;
            seen.add(num);
            const id = 'RV-' + num;
            const existing = have.get(id);
            if (existing) { existing.name = name; existing.rivhit = code; return; }
            const p = {
                id: id, name: name, price: 0, unit: '', image: '', rawImage: '',
                category: 'מריווחית', rivhit: code, fromRivhit: true
            };
            have.set(id, p);
            products.push(p);
            BASE_PRICES[id] = 0;
            added++;
        });
        // רשימה ישנה בלי מספרים קטלוגיים לא נחשבת טעונה — כך ההסבר בחיפוש מפנה להעלאה ב-CRM
        if (items && items.some(it => catalogCode(it && it[2]))) rivhitLoaded = true;
        return added;
    }

    function crmPassword() {
        try { return localStorage.getItem(CRM_KEY) || ''; } catch (e) { return ''; }
    }

    // ברקע: הרשימה העדכנית מה-CRM. כשל רשת — בשקט; העותק במכשיר נשאר.
    async function refreshRivhitItems() {
        const password = crmPassword();
        if (!password || navigator.onLine === false) return;
        let data = null;
        try {
            const res = await fetch(CRM_API, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'items', password: password })
            });
            data = await res.json();
        } catch (e) { return; }
        if (!data || !data.ok) {
            if (data && data.error === 'unauthorized') toast('לא ניתן לעדכן את פריטי ריווחית — צריך להיכנס מחדש ל-CRM');
            return;
        }
        const items = Array.isArray(data.items) ? data.items : [];
        const cached = readJson(RIVHIT_KEY, null);
        if (cached && cached.updated === (data.updated || '') &&
            Array.isArray(cached.items) && cached.items.length === items.length) return;
        writeJson(RIVHIT_KEY, { updated: data.updated || '', items: items });
        if (addRivhitItems(items)) applyCustomerPrices(ACTIVE);
    }

    // ההסבר שמופיע בדף הסוכן כשחיפוש לא מצא כלום ואין רשימה במכשיר
    function rivhitHint() {
        if (rivhitLoaded) return '';
        return crmPassword()
            ? 'רשימת הפריטים מריווחית עוד לא נטענה — בתפריט של ה-CRM: "פריטים מריווחית".'
            : 'פריטים מריווחית יופיעו בחיפוש אחרי כניסה ל-CRM במכשיר הזה.';
    }

    // ---------- הסנכרון מול ה-CRM (אפיון 2026-11-15) ----------
    // agent_data מביא לקוחות, מחירים, הזמנה והצעה אחרונות. שינויים מהטלפון (לקוח חדש,
    // הצעה, מחירים מהמעבר) נכנסים לתור ונשלחים לפני כל סנכרון ולפני תור ההזמנות.

    let crmSyncedAt = 0;
    let crmSyncing = null;
    let crmSyncAgain = false;
    let crmSyncError = '';      // 'unauthorized' כשהסיסמה במכשיר פגה

    const OP_ERRORS = {
        'not found': 'הכרטיס כבר לא קיים ב-CRM',
        'bad quote': 'מספר ההצעה לא תקין',
        'no items': 'אין פריטים בהצעה',
        'name required': 'חסר שם לקוח',
        'no prices': 'אין מחירים',
        'bad source': 'מקור לא תקין'
    };

    // null = כשל רשת
    async function crmCall(action, body) {
        try {
            const res = await fetch(CRM_API, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(Object.assign({ action: action, password: crmPassword() }, body || {}))
            });
            return await res.json();
        } catch (e) { return null; }
    }

    function loadOps() {
        const list = readJson(CRM_OPS_KEY, []);
        return Array.isArray(list) ? list.filter(o => o && typeof o === 'object' && o.op) : [];
    }
    function saveOps(list) { writeJson(CRM_OPS_KEY, list); }
    function enqueueOp(op) {
        const list = loadOps();
        list.push(op);
        saveOps(list);
    }

    // FIFO. כשל רשת, busy או סיסמה שפגה — עוצר ומנסה בסנכרון הבא; שגיאה אחרת — מדלג עם הודעה.
    async function flushCrmOps() {
        let ops = loadOps();
        if (!ops.length) return true;
        if (!crmPassword() || navigator.onLine === false) return false;
        while (ops.length) {
            const o = ops[0];
            if (o.op !== 'agent_customer' && !(o.body && o.body.id)) {
                // הלקוח שהפעולה חיכתה לו לא נוצר (הפעולה שלו נדחתה)
                toast('שינוי לא נשמר ב-CRM: הלקוח לא נוצר');
                ops.shift();
                saveOps(ops);
                continue;
            }
            const res = await crmCall(o.op, o.body);
            if (!res) return false;
            if (!res.ok) {
                if (res.error === 'unauthorized') crmSyncError = 'unauthorized';
                if (res.error === 'busy' || res.error === 'unauthorized') return false;
                toast((o.op === 'quote' ? 'הצעת מחיר לא נרשמה ב-CRM: ' : 'שינוי לא נשמר ב-CRM: ') +
                    (OP_ERRORS[res.error] || res.error));
                ops.shift();
                saveOps(ops);
                continue;
            }
            ops.shift();
            if (o.op === 'agent_customer') {
                const wasActive = ACTIVE && ACTIVE.localId === o.localId;
                const linked = AS.linkLocal(loadCustomers(), o.localId, res.id);
                saveCustomers(linked.list);
                if (linked.name && wasActive) {
                    writeJson(ACTIVE_KEY, linked.name);
                    ACTIVE = findCustomer(linked.name);
                    renderBar();
                }
                if (res.existing && linked.name) toast('קושר לכרטיס קיים ב-CRM: ' + linked.name);
                ops = AS.bindOps(ops, o.localId, res.id);
            }
            saveOps(ops);
        }
        return true;
    }

    // פרטים שהגיעו מה-CRM — רק לשדות ריקים בטופס, בלי לדרוס מה שהוקלד
    function fillEmptyFields(rec) {
        [['cust-phone', rec.phone], ['cust-contact', rec.contact], ['cust-address', rec.address]]
            .forEach(([id, v]) => {
                const el = document.getElementById(id);
                if (el && !el.value.trim() && v && !(id === 'cust-phone' && isOwnPhone(v))) el.value = v;
            });
    }

    function applyAgentData(data) {
        const migrated = readJson(MIGRATED_KEY, false) === true;
        const keepLocal = !migrated || loadOps().length > 0;
        const since = AS.stampOf(new Date(Date.now() - 86400000));
        const merged = AS.mergeAgentData(loadCustomers(), data, readJson(ACTIVE_KEY, null),
            { keepLocal: keepLocal, since: since });
        // שלב 1 של המעבר: מחירים שקיימים רק בטלפון עולים לכרטיסים המקושרים — פעם אחת
        if (readJson(FILLED_KEY, false) !== true) {
            AS.fillOps(merged.list, data).forEach(enqueueOp);
            writeJson(FILLED_KEY, true);
        }
        saveCustomers(merged.list);
        writeJson(QUOTES_KEY, Array.isArray(data.quotes) ? data.quotes : []);
        if (merged.activeName) writeJson(ACTIVE_KEY, merged.activeName);
        if (ACTIVE) {
            const fresh = findCustomer(merged.activeName || ACTIVE.name);
            if (fresh) {
                ACTIVE = fresh;
                fillEmptyFields(fresh);
                applyCustomerPrices(fresh);
            }
            renderBar();
        }
        if (!migrated) maybeShowMigration();
    }

    // ברקע, עם הסיסמה שה-CRM שמר במכשיר. כשל רשת — בשקט; המאגר במכשיר נשאר.
    // ריצה אחת בכל פעם; בקשה באמצע ריצה (force) מריצה סיבוב נוסף כשהיא נגמרת.
    async function syncWithCrm(force) {
        if (!crmPassword() || navigator.onLine === false) return false;
        if (crmSyncing) {
            if (force) crmSyncAgain = true;
            return crmSyncing;
        }
        if (!force && Date.now() - crmSyncedAt < CRM_SYNC_MS) return false;
        crmSyncing = (async () => {
            await flushCrmOps();
            await flushOutbox(true);
            const data = await crmCall('agent_data', {});
            if (!data) return false;
            if (!data.ok || !Array.isArray(data.contacts)) {
                crmSyncError = data.error || 'failed';
                return false;
            }
            crmSyncError = '';
            crmSyncedAt = Date.now();
            applyAgentData(data);
            return true;
        })();
        try {
            return await crmSyncing;
        } finally {
            crmSyncing = null;
            if (crmSyncAgain) {
                crmSyncAgain = false;
                syncWithCrm(true);
            }
        }
    }

    // ---------- מסך מעבר חד-פעמי (אפיון 2026-11-15) ----------
    // לקוחות שקיימים רק בטלפון: לקשר לכרטיס קיים, לפתוח כרטיס חדש או למחוק.
    // "אחר כך" סוגר בלי לסמן — המסך חוזר בפתיחה הבאה.
    let migrationShown = false;

    function maybeShowMigration() {
        if (migrationShown || readJson(MIGRATED_KEY, false) === true) return;
        if (readJson('agent_logged_in', false) !== true) return;
        const candidates = AS.localOnly(loadCustomers(), loadOps());
        if (!candidates.length) { writeJson(MIGRATED_KEY, true); return; }
        migrationShown = true;
        showMigration(candidates);
    }

    function showMigration(candidates) {
        const cards = loadCustomers().filter(r => r.crmId)
            .sort((a, b) => a.name.localeCompare(b.name, 'he'));
        const options = cards.map(r => `<option value="link:${esc(r.crmId)}">${esc(r.name)}</option>`).join('');
        const wrap = document.createElement('div');
        wrap.id = 'agent-migrate';
        wrap.className = 'agent-gate';
        wrap.style.display = 'flex';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-labelledby', 'agent-migrate-title');
        wrap.innerHTML = `
            <div class="agent-gate-inner">
                <h2 id="agent-migrate-title" tabindex="-1">לקוחות שנמצאים רק בטלפון</h2>
                <p style="margin:0 0 1rem; opacity:0.85;">מעכשיו כל לקוח שמור בכרטיס ב-CRM. מה לעשות עם כל אחד מאלה? המחירים שלו עוברים איתו.</p>
                <div style="text-align:right; margin-bottom:1.2rem;">
                ${candidates.map((r, i) => {
                    const n = Object.keys(r.prices || {}).length;
                    const meta = [n ? `${n} מחירים` : '', r.orderCount ? `${r.orderCount} הזמנות` : '']
                        .filter(Boolean).join(' · ') || 'בלי מחירים';
                    // בטלפון השם מעל הבחירה, ובמסך רחב זה לצד זה
                    return `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(11rem, 1fr)); gap:0.6rem; align-items:center; padding:0.6rem 0; border-bottom:1px solid rgba(255,255,255,0.25);">
                        <label for="agent-migrate-${i}" style="display:grid; gap:0.15rem;">
                            <strong>${esc(r.name)}</strong>
                            <span style="font-size:0.85rem; opacity:0.75;">${esc(meta)}</span>
                        </label>
                        <select id="agent-migrate-${i}" style="width:100%; min-height:44px; padding:0.4rem; font-size:16px; border-radius:8px; border:0; background:#fff; color:var(--primary-dark);">
                            <option value="new">כרטיס חדש ב-CRM</option>
                            <option value="delete">למחוק מהטלפון</option>
                            ${options ? `<optgroup label="קישור לכרטיס קיים">${options}</optgroup>` : ''}
                        </select>
                    </div>`;
                }).join('')}
                </div>
                <div class="agent-gate-foot">
                    <button type="button" class="agent-gate-btn agent-gate-btn-solid" data-act="done">סיום</button>
                    <button type="button" class="agent-gate-btn" data-act="later">אחר כך</button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        document.body.classList.add('agent-gate-open');
        wrap.querySelector('#agent-migrate-title').focus();

        const close = () => {
            wrap.remove();
            if (!gateEl || gateEl.style.display === 'none') document.body.classList.remove('agent-gate-open');
        };
        wrap.querySelector('[data-act="later"]').addEventListener('click', close);
        wrap.querySelector('[data-act="done"]').addEventListener('click', () => {
            const choices = candidates.map((r, i) => wrap.querySelector('#agent-migrate-' + i).value);
            finishMigration(candidates, choices);
            close();
        });
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    }

    function finishMigration(candidates, choices) {
        const list = loadCustomers();
        let activeName = readJson(ACTIVE_KEY, null);
        candidates.forEach((cand, i) => {
            const choice = choices[i] || 'new';
            const rec = list.find(r => !r.crmId && nameKey(r.name) === nameKey(cand.name));
            if (!rec) return;
            if (choice === 'delete') {
                list.splice(list.indexOf(rec), 1);
                if (activeName && nameKey(activeName) === nameKey(rec.name)) activeName = null;
                return;
            }
            const positive = (p) => Object.keys(p || {}).filter(id => Number(p[id]) > 0);
            if (choice.indexOf('link:') === 0) {
                const crmId = choice.slice(5);
                const target = list.find(r => r.crmId === crmId);
                if (!target) return;
                const extra = positive(rec.prices).filter(id => !(target.prices && id in target.prices));
                AS.mergeInto(target, rec);
                list.splice(list.indexOf(rec), 1);
                if (extra.length) {
                    enqueueOp({ op: 'prices_fill', body: { id: crmId,
                        prices: extra.map(id => ({ productId: id, price: Number(rec.prices[id]) })) } });
                }
                if (activeName && nameKey(activeName) === nameKey(rec.name)) activeName = target.name;
                return;
            }
            // כרטיס חדש. המחירים ב-prices_fill: אם ה-CRM יחזיר כרטיס קיים, מחיריו לא יידרסו.
            rec.localId = rec.localId || newLocalId();
            enqueueOp({ op: 'agent_customer', localId: rec.localId, body: {
                name: rec.name, phone: isOwnPhone(rec.phone) ? '' : (rec.phone || ''),
                contact: rec.contact || '', address: rec.address || '' } });
            const ids = positive(rec.prices);
            if (ids.length) {
                enqueueOp({ op: 'prices_fill', localId: rec.localId, body: { id: '',
                    prices: ids.map(id => ({ productId: id, price: Number(rec.prices[id]) })) } });
            }
        });
        saveCustomers(list);
        writeJson(MIGRATED_KEY, true);
        writeJson(ACTIVE_KEY, activeName);
        ACTIVE = activeName ? findCustomer(activeName) : null;
        renderBar();
        if (!ACTIVE) openGate(false);
        toast('המעבר נשמר — מעדכן את ה-CRM...');
        syncWithCrm(true);
    }

    // שורת המצב מעל רשימת הלקוחות בבורר
    function crmNote() {
        if (!crmPassword()) return 'כדי לראות כאן את כל הלקוחות מה-CRM — להיכנס פעם אחת ל-CRM במכשיר הזה.';
        if (crmSyncError === 'unauthorized') return 'לא ניתן לטעון את הלקוחות מה-CRM — צריך להיכנס מחדש ל-CRM במכשיר הזה.';
        return '';
    }

    // מזהה הכרטיס ב-CRM לשם הלקוח שבטופס. לפי השם שנשלח בפועל ולא לפי הלקוח
    // שנבחר — אם רועי שינה את שם הלקוח בטופס, המזהה של הקודם לא נשלח איתו.
    function crmIdFor(business) {
        const rec = business ? findCustomer(business) : null;
        return (rec && rec.crmId) || '';
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
        // לקוח שנשמר בעבר עם המספר של רועי — השדה נשאר ריק
        setField('cust-phone', customer && !isOwnPhone(customer.phone) ? customer.phone : '');
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
        const qAgo = daysSince(ACTIVE.lastQuoteAt);
        const lastQuote = ACTIVE.lastQuote;

        host.innerHTML = `
            <div class="agent-bar">
                <div class="agent-bar-who">
                    <span class="agent-bar-label">מזמין עבור</span>
                    <strong>${esc(ACTIVE.name)}</strong>
                    ${ago != null ? `<span class="agent-bar-ago">הזמנה אחרונה לפני ${ago} ימים</span>`
                : (qAgo != null ? `<span class="agent-bar-ago">הצעה אחרונה לפני ${qAgo} ימים</span>` : '')}
                </div>
                <div class="agent-bar-actions">
                    ${last && last.items && last.items.length
                ? '<button type="button" class="agent-chip" data-act="repeat">ההזמנה הקודמת</button>' : ''}
                    ${lastQuote && lastQuote.items && lastQuote.items.length
                ? '<button type="button" class="agent-chip" data-act="quote">ההצעה האחרונה</button>' : ''}
                    <button type="button" class="agent-chip" data-act="switch">החלף לקוח</button>
                    ${pending ? `<button type="button" class="agent-chip agent-chip-warn" data-act="outbox">${pending} ממתינות לשליחה</button>` : ''}
                </div>
            </div>`;

        host.querySelectorAll('[data-act]').forEach(btn => {
            btn.addEventListener('click', () => {
                const act = btn.getAttribute('data-act');
                if (act === 'repeat') repeatLastOrder();
                else if (act === 'quote') loadLastQuote();
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

    function loadLastQuote() {
        if (!ACTIVE || !ACTIVE.lastQuote || !ACTIVE.lastQuote.items) return;
        const n = window.APP.applyOrder(ACTIVE.lastQuote.items);
        toast(n ? `נטענו ${n} שורות מההצעה האחרונה` : 'ההצעה האחרונה ריקה');
    }

    // ---------- בורר הלקוח ----------

    function openGate(push) {
        if (!gateEl) buildGate();
        gateEl.style.display = 'flex';
        document.body.classList.add('agent-gate-open');
        renderDraftNote();
        renderGateList('');
        // הלקוחות מה-CRM מתעדכנים ברקע; הרשימה מתרעננת כשהם מגיעים
        syncWithCrm().then(() => {
            if (gateEl && gateEl.style.display !== 'none') {
                const search = gateEl.querySelector('#agent-search');
                renderGateList(search ? search.value : '');
            }
        });
        if (push) {
            try { history.pushState({ agentStep: 'gate' }, '', location.pathname); } catch (e) { }
        }
    }

    function closeGate() {
        if (gateEl) gateEl.style.display = 'none';
        document.body.classList.remove('agent-gate-open');
    }

    // סל שנשאר מהזמנה שלא נשלחה. בלי השורה הזאת הוא היה עובר בשקט ללקוח
    // שבוחרים עכשיו — אותה טעות שהבורר נועד למנוע.
    function renderDraftNote() {
        const box = gateEl && gateEl.querySelector('#agent-draft');
        if (!box) return;
        const items = (window.APP && window.APP.getCartItems && window.APP.getCartItems().items) || [];
        if (!items.length) { box.style.display = 'none'; return; }
        const owner = ACTIVE ? ACTIVE.name : draftOwner;
        const count = items.length === 1 ? 'פריט אחד' : `${items.length} פריטים`;
        box.querySelector('#agent-draft-text').textContent =
            `בסל יש ${count} מהזמנה שלא נשלחה${owner ? ` (${owner})` : ''}.`;
        box.style.display = 'block';
    }

    function buildGate() {
        gateEl = document.createElement('div');
        gateEl.id = 'agent-gate';
        gateEl.className = 'agent-gate';
        gateEl.innerHTML = `
            <div class="agent-gate-inner">
                <img src="/images/logo.png" alt="" class="agent-gate-logo" onerror="this.style.display='none'">
                <h2>אצל מי אנחנו?</h2>
                <div id="agent-draft" role="status" style="display:none; margin:0 0 1rem; padding:0.7rem 1rem; border:1px solid rgba(255,255,255,0.55); border-radius:var(--radius-md); background:rgba(255,255,255,0.1); font-size:0.92rem; line-height:1.6;">
                    <span id="agent-draft-text"></span>
                    <button type="button" class="agent-gate-btn" data-act="clear-draft" style="margin-inline-start:0.5rem;">ריקון הסל</button>
                </div>
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
                    <button type="button" class="agent-gate-btn" data-act="offline">הכנה לעבודה בלי רשת</button>
                </div>
            </div>`;
        document.body.appendChild(gateEl);

        const search = gateEl.querySelector('#agent-search');
        search.addEventListener('input', () => renderGateList(search.value));

        gateEl.querySelector('[data-act="clear-draft"]').addEventListener('click', () => {
            const clearBtn = document.getElementById('clear-cart-btn');
            if (clearBtn) clearBtn.click();
            draftOwner = '';
            renderDraftNote();
            toast('הסל רוקן');
            search.focus();
        });

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
                else if (act === 'offline') prepareOffline();
            });
        });
    }

    function renderGateList(query, forgottenOnly) {
        const listEl = gateEl.querySelector('#agent-list');
        const q = nameKey(query);
        let list = loadCustomers();

        const irrelevant = (c) => c.stage === 'לא רלוונטי';
        if (forgottenOnly) {
            list = list.filter(c => {
                if (irrelevant(c)) return false;
                const d = daysSince(c.lastOrderAt);
                // בלי הזמנה בכלל — רק לקוח (לא ליד מה-CRM שעוד לא הזמין)
                return d == null ? (!c.crmId || c.stage === 'לקוח') : d >= FORGOTTEN_DAYS;
            });
        }
        const qPhone = String(query || '').replace(/\D/g, '');
        if (q) {
            list = list.filter(c => nameKey(c.name).includes(q) ||
                (qPhone.length >= 3 && phoneDigits(c.phone).includes(qPhone)));
        }

        // הוותיקים ביותר קודם — מי שלא הזמין הכי הרבה זמן דורש טיפול.
        // כרטיסים שסומנו ב-CRM "לא רלוונטי" בסוף.
        list.sort((a, b) => (irrelevant(a) - irrelevant(b)) ||
            String(a.lastOrderAt || '').localeCompare(String(b.lastOrderAt || '')));

        const note = crmNote();
        const noteHtml = note ? `<p class="agent-empty" style="margin:0 0 0.4rem;">${esc(note)}</p>` : '';

        if (!list.length) {
            listEl.innerHTML = noteHtml + `<p class="agent-empty">${forgottenOnly
                ? 'אין לקוחות שנשכחו. יפה.'
                : (loadCustomers().length ? 'אין לקוח שמתאים לחיפוש.' : 'עוד אין לקוחות. הוסף את הראשון ב"+ לקוח חדש".')}</p>`;
            return;
        }

        listEl.innerHTML = noteHtml + list.map(c => {
            const d = daysSince(c.lastOrderAt);
            const qd = daysSince(c.lastQuoteAt);
            let meta = d == null ? 'טרם הזמין' : `לפני ${d} ימים · ${c.orderCount || 0} הזמנות`;
            if (qd != null) meta += ` · הצעה לפני ${qd} ימים`;
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
        if (isOwnPhone(phoneEl.value)) {
            phoneEl.focus();
            toast('זה המספר שלך. אם אין טלפון של הלקוח — השאר ריק');
            return;
        }

        // נשמר מיד בטלפון, ונפתח כרטיס ב-CRM דרך התור — גם בלי רשת עכשיו
        const localId = newLocalId();
        const rec = upsertCustomer(name, { phone: phoneEl.value.trim(), localId: localId });
        enqueueOp({ op: 'agent_customer', localId: localId,
            body: { name: rec.name, phone: rec.phone, contact: '', address: '' } });
        nameEl.value = '';
        phoneEl.value = '';
        form.style.display = 'none';
        pickCustomer(rec.name);
        syncWithCrm(true);
    }

    // ---------- למידה מהזמנה שנשלחה ----------

    function learnFromOrder(detail) {
        const name = (detail.customer && detail.customer.business) || (ACTIVE && ACTIVE.name);
        if (!name) return;

        const existing = findCustomer(name);
        const prices = Object.assign({}, (existing && existing.prices) || {});
        const pricesAt = Object.assign({}, (existing && existing.pricesAt) || {});
        const stamp = AS.stampOf(new Date());
        const items = (detail.items || []).map(it => {
            const price = parseFloat(it.price);
            if (isFinite(price) && price > 0) { prices[it.id] = price; pricesAt[it.id] = stamp; }
            return { id: it.id, name: it.name, unit: it.unit, quantity: it.qty, price: price || 0, category: it.category };
        });

        // ה-CRM לומד את אותם מחירים מההזמנה עצמה (דרך סקריפט ההזמנות); כאן העותק
        // מתעדכן מיד, כדי שבלי רשת המחיר יחול כבר בהזמנה הבאה
        const rec = upsertCustomer(name, {
            phone: [detail.customer && detail.customer.phone, existing && existing.phone]
                .find(p => p && !isOwnPhone(p)) || '',
            contact: (detail.customer && detail.customer.contact) || (existing && existing.contact) || '',
            address: (detail.customer && detail.customer.address) || (existing && existing.address) || '',
            prices: prices,
            pricesAt: pricesAt,
            lastOrder: { date: new Date().toISOString().slice(0, 10), orderId: detail.orderId, items: items },
            lastOrderAt: new Date().toISOString(),
            orderCount: ((existing && existing.orderCount) || 0) + 1
        });

        ACTIVE = rec;
        renderBar();
    }

    // הצעת מחיר מודפסת: נרשמת בכרטיס ב-CRM (פעולה, מחירים, שלב) דרך התור, והעותק
    // במכשיר מתעדכן מיד. לא מונה הזמנות — הצעה אינה הזמנה.
    function learnFromQuote(quote) {
        const name = String((quote && quote.customer) || '').trim();
        if (!name || name === 'לקוח כללי') return;

        const existing = findCustomer(name);
        const prices = Object.assign({}, (existing && existing.prices) || {});
        const pricesAt = Object.assign({}, (existing && existing.pricesAt) || {});
        const stamp = AS.stampOf(new Date());
        const items = (quote.items || []).map(it => {
            const price = parseFloat(it.price);
            if (isFinite(price) && price > 0) { prices[it.id] = price; pricesAt[it.id] = stamp; }
            return { id: it.id, name: it.name, unit: it.unit, quantity: it.quantity, price: price || 0 };
        });

        const patch = {
            prices: prices,
            pricesAt: pricesAt,
            lastQuote: { date: quote.date, quoteId: quote.id, total: quote.total, items: items },
            lastQuoteAt: new Date().toISOString()
        };
        // שם שהוקלד בהצעה ואינו ברשימה — לקוח חדש, שנפתח ב-CRM לפני ההצעה
        if (!existing || (!existing.crmId && !existing.localId)) {
            patch.localId = newLocalId();
            enqueueOp({ op: 'agent_customer', localId: patch.localId,
                body: { name: name, phone: '', contact: '', address: '' } });
        }
        const rec = upsertCustomer(name, patch);
        enqueueOp({
            op: 'quote',
            localId: rec.crmId ? undefined : rec.localId,
            body: {
                id: rec.crmId || '',
                quoteId: quote.id,
                at: stamp,
                total: Number(quote.total) || 0,
                items: (quote.items || []).map(it => ({ id: it.id, name: it.name,
                    qty: Number(it.quantity) || 0, price: Number(it.price) || 0 }))
            }
        });

        ACTIVE = rec;
        writeJson(ACTIVE_KEY, rec.name);
        renderBar();
        syncWithCrm(true);
    }

    // ---------- תור אופליין ----------

    function loadOutbox() {
        const list = readJson(OUTBOX_KEY, []);
        return Array.isArray(list) ? list.filter(e => e && typeof e === 'object' && e.payload && e.payload.orderId) : [];
    }

    function enqueue(payload) {
        const list = loadOutbox();
        list.push({ queuedAt: new Date().toISOString(), payload: payload });
        writeJson(OUTBOX_KEY, list);
        renderBar();
    }

    // FIFO. עוצר בפריט הראשון שנכשל, כדי לשמור על סדר ההזמנות. ריצה אחת בכל פעם —
    // שתי ריצות במקביל היו שולחות את אותה הזמנה פעמיים.
    let outboxFlushing = null;
    async function flushOutbox(silent) {
        if (outboxFlushing) return outboxFlushing;
        outboxFlushing = (async () => {
            const list = loadOutbox();
            if (!list.length || !navigator.onLine) return;
            let sent = 0;
            // כל הזמנה נוסתה פעם אחת בכל סבב. הזמנה שהשרת דוחה עוברת לסוף התור
            // ולא חוסמת את אלה שאחריה; בלי רשת — עוצרים.
            const rounds = list.length;
            for (let i = 0; i < rounds && list.length; i++) {
                const ok = await window.APP.postOrderPayload(list[0].payload);
                if (ok) {
                    list.shift();
                    sent++;
                } else {
                    if (navigator.onLine === false) break;
                    const item = list.shift();
                    item.attempts = (item.attempts || 0) + 1;
                    list.push(item);
                }
                writeJson(OUTBOX_KEY, list);
            }
            renderBar();
            if (sent) toast(`${sent} הזמנות ממתינות נשלחו`);
        })();
        try { return await outboxFlushing; } finally { outboxFlushing = null; }
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
            '/agent/', '/css/style.css', '/js/app.js', '/js/agent.js', '/js/agent-store.js',
            '/js/lib/papaparse.min.js', '/images/logo.png', '/data/products.csv',
            // הצעת מחיר ב-PDF — נטענים רק בלחיצה, ולכן צריך לשמור אותם מראש
            '/js/lib/html2canvas.min.js', '/js/lib/jspdf.umd.min.js', '/js/quote-pdf.js'
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
        // false = כשל רשת, או שהסקריפט בענן לא אישר את ההזמנה. נכנסת לתור;
        // שליחה חוזרת של הזמנה שכבר נקלטה חוזרת כ-duplicate ולא נכתבת פעמיים.
        Promise.resolve(detail.delivery).then(ok => {
            if (ok) return;
            enqueue(detail.payload);
            toast(navigator.onLine === false
                ? 'אין רשת — ההזמנה נשמרה ותישלח כשהחיבור יחזור'
                : 'ההזמנה לא נקלטה בשרת — נשמרה במכשיר ותישלח שוב אוטומטית');
        });
    });

    document.addEventListener('aroam:quote-saved', (e) => {
        learnFromQuote((e.detail || {}).quote);
    });

    // ---------- סוג המסמך לריווחית (סבב 93) ----------
    // הבורר ליד "שלח הזמנה" קובע את סוג קובץ הקליטה שמצורף למייל — על מספר הלקוח
    // מהכרטיס ב-CRM. הבחירה נזכרת במכשיר. app.js קורא אותה כשהוא בונה את הפיילוד.
    const DOC_KEY = 'aroam_agent_rivhit_doc';
    const DOC_TYPES = ['7', '4', '1', '6'];

    function setupDocType() {
        const sel = document.getElementById('rivhit-doc-type');
        if (!sel) return;
        let saved = '';
        try { saved = localStorage.getItem(DOC_KEY) || ''; } catch (e) { saved = ''; }
        if (DOC_TYPES.includes(saved)) sel.value = saved;
        sel.addEventListener('change', () => {
            try { localStorage.setItem(DOC_KEY, sel.value); } catch (e) { /* בלי זיכרון — רק לפעם הזאת */ }
        });
    }

    function rivhitDocType() {
        const sel = document.getElementById('rivhit-doc-type');
        const v = sel ? sel.value : '';
        return Number(DOC_TYPES.includes(v) ? v : '7');
    }

    window.AGENT = {
        activeName: () => (ACTIVE ? ACTIVE.name : ''),
        crmIdFor: crmIdFor,
        rivhitHint: rivhitHint,
        refreshRivhit: refreshRivhitItems,
        rivhitDocType: rivhitDocType,
        // חלון "היסטוריה" ב-app.js: ההצעות מה-CRM (העותק מהסנכרון האחרון)
        quoteHistory: () => AS.quoteHistory(readJson(QUOTES_KEY, []), loadCustomers()),
        pickByName: (name) => {
            const rec = findCustomer(name);
            if (rec) pickCustomer(rec.name);
        }
    };

    document.addEventListener('aroam:app-ready', () => {
        if (!window.APP || !window.APP.getConfig().agentMode) return;

        setupDocType();

        // פריטים מריווחית מהעותק במכשיר — לפני צילום מחירי הבסיס, כדי שמחירי
        // הלקוח (שנשמרו לפי RV-<מספר>) יחולו עליהם כבר בטעינה
        const cachedRivhit = readJson(RIVHIT_KEY, null);
        if (cachedRivhit && Array.isArray(cachedRivhit.items)) addRivhitItems(cachedRivhit.items);

        snapshotBasePrices();
        refreshRivhitItems();
        syncWithCrm();

        hookOrderModalHistory();

        // ?customer= (מכרטיס ב-CRM, או מקישור "פתח כהצעת מחיר" במייל) בוחר את
        // הלקוח הזה. בלי זה הדף נפתח על הלקוח שהיה פעיל אחרון — עם השם, הטלפון
        // והמחירים שלו — גם כשההצעה היא ללקוח אחר. לקוח חדש נוצר עם הטלפון
        // ואיש הקשר מהכתובת; ללקוח קיים משלימים רק פרטים חסרים.
        const params = new URLSearchParams(location.search);
        const urlName = (params.get('customer') || '').trim();
        let rec = null;
        if (urlName) {
            const existing = findCustomer(urlName);
            const patch = {};
            const urlPhone = (params.get('phone') || '').trim();
            const urlContact = (params.get('contact') || '').trim();
            if (urlPhone && !(existing && existing.phone)) patch.phone = urlPhone;
            if (urlContact && !(existing && existing.contact)) patch.contact = urlContact;
            rec = existing && !Object.keys(patch).length
                ? existing
                : upsertCustomer(existing ? existing.name : urlName, patch);
        } else {
            // בלי ?customer= הדף נפתח תמיד על הבורר ולא על הלקוח האחרון —
            // כניסה שנפתחת ישר על לקוח של אתמול הובילה להזמנות על הלקוח הלא
            // נכון. השם נשמר רק כדי שהבורר יגיד של מי הסל שנשאר.
            draftOwner = readJson(ACTIVE_KEY, null) || '';
            writeJson(ACTIVE_KEY, null);
        }
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

        // readJson מוגן: כשהדפדפן חוסם אחסון הקריאה זורקת ('true' נקרא כ-true)
        if (readJson('agent_logged_in', false) === true) unlocked();
        else document.addEventListener('aroam:agent-unlocked', unlocked, { once: true });
    });

    window.addEventListener('online', () => { syncWithCrm(true); flushOutbox(); });
})();
