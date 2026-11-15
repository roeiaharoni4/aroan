/* דף הסוכן — הלוגיקה הטהורה של המאגר במכשיר מול ה-CRM (אפיון 2026-11-15).
   בלי DOM ובלי רשת, כדי שאפשר יהיה לבדוק ב-Node: node tools/test/agent-store.test.js
   ה-CRM הוא מקור האמת; המאגר במכשיר (aroam_agent_customers) הוא עותק לעבודה בלי רשת. */
(function (root) {
    'use strict';

    // המספרים של העסק עצמו — אותה רשימה כמו OWN_PHONES בסקריפט ה-CRM
    const OWN_PHONES = ['0526000158', '036346236', '0506444290'];

    function nameKey(name) {
        return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    // ספרות בלבד, בצורה מקומית (0...) — כדי להשוות מספרים שנכתבו אחרת
    function phoneDigits(raw) {
        let d = String(raw || '').replace(/\D/g, '');
        if (d.startsWith('00972')) d = d.slice(2);
        if (d.startsWith('972')) d = d.slice(3);
        if (d && !d.startsWith('0') && !d.startsWith('1')) d = '0' + d;
        return d;
    }

    function isOwnPhone(raw) { return OWN_PHONES.includes(phoneDigits(raw)); }

    function crmLabel(c) { return String((c && (c.business || c.name)) || '').trim(); }

    // אותו פורמט כמו בגיליון ה-CRM, לפי שעון המכשיר
    function stampOf(d) {
        const p = (n) => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
            ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    // פריטים מעמודת "פריטים" ב-CRM ⇒ המבנה ש-applyOrder ב-app.js מקבל
    function toLocalItems(items) {
        return (Array.isArray(items) ? items : []).filter(it => it && it.id).map(it => ({
            id: it.id,
            name: it.name || it.id,
            quantity: Number(it.qty != null ? it.qty : it.quantity) || 0,
            price: Number(it.price) > 0 ? Number(it.price) : 0
        }));
    }

    // prices של agent_data ⇒ {contactId: {productId: {price, at}}}
    function priceTable(rows) {
        const out = {};
        (rows || []).forEach(p => {
            if (!Array.isArray(p) || !p[0] || !p[1]) return;
            const price = Number(p[2]);
            if (!(price > 0)) return;
            (out[p[0]] = out[p[0]] || {})[p[1]] = { price: price, at: String(p[3] || '') };
        });
        return out;
    }

    // מחיר מה-CRM גובר, אלא אם במכשיר יש חותמת חדשה יותר. מחיר שקיים רק במכשיר
    // נשאר עם keepLocal (לפני המעבר / כשיש שינויים בתור), או אם החותמת שלו מאז since —
    // הזמנה שנשלחה רגע לפני הסנכרון ועוד לא הגיעה ל-CRM.
    function mergePrices(rec, crm, keepLocal, since) {
        const prices = {};
        const at = {};
        Object.keys(crm).forEach(pid => { prices[pid] = crm[pid].price; at[pid] = crm[pid].at; });
        const local = rec.prices || {};
        const localAt = rec.pricesAt || {};
        Object.keys(local).forEach(pid => {
            const price = Number(local[pid]);
            if (!(price > 0)) return;
            const when = localAt[pid] || '';
            if (pid in prices) {
                if (when && when > at[pid]) { prices[pid] = price; at[pid] = when; }
            } else if (keepLocal || (when && since && when >= since)) {
                prices[pid] = price;
                if (when) at[pid] = when;
            }
        });
        rec.prices = prices;
        rec.pricesAt = at;
    }

    // הזמנה/הצעה מה-CRM, אלא אם במכשיר יש חדשה יותר (נשלחה בלי רשת)
    function newerDoc(mine, doc, idKey) {
        if (!doc) return mine;
        const day = String(doc.at || '').slice(0, 10);
        if (mine && mine.date && String(mine.date) > day) return mine;
        const out = { date: day, items: toLocalItems(doc.items) };
        out[idKey] = doc.orderId || '';
        return out;
    }

    // ממזג את agent_data לתוך המאגר במכשיר. לא משנה את הקלט.
    // activeName — שם הלקוח הפעיל; חוזר מעודכן אם שם הכרטיס שלו השתנה ב-CRM.
    function mergeAgentData(list, data, activeName, opts) {
        opts = opts || {};
        const out = JSON.parse(JSON.stringify(Array.isArray(list) ? list : []));
        let active = activeName || null;
        const contacts = data && Array.isArray(data.contacts) ? data.contacts : [];
        const prices = priceTable(data && data.prices);
        const last = (data && data.last) || {};
        const seen = new Set();
        const usedNames = new Set();

        contacts.forEach(c => {
            let label = crmLabel(c);
            if (!c || !c.id || !label) return;
            seen.add(c.id);
            // שני כרטיסים באותו שם — השני מקבל תוספת, כי המאגר במכשיר מזוהה לפי שם
            if (usedNames.has(nameKey(label))) label += ` (${c.name || c.phone || c.id})`;
            usedNames.add(nameKey(label));

            let rec = out.find(r => r.crmId === c.id) ||
                out.find(r => !r.crmId && nameKey(r.name) === nameKey(label));
            if (!rec) {
                rec = { name: label, phone: '', address: '', notes: '', prices: {}, orderCount: 0 };
                out.push(rec);
            }
            if (rec.crmId === c.id && nameKey(rec.name) !== nameKey(label) &&
                !out.some(r => r !== rec && nameKey(r.name) === nameKey(label))) {
                if (active && nameKey(active) === nameKey(rec.name)) active = label;
                rec.name = label;
            }
            rec.crmId = c.id;
            delete rec.localId;
            rec.stage = c.stage || '';
            rec.rivhitNo = c.rivhitNo || '';
            if ((!rec.phone || isOwnPhone(rec.phone)) && c.phone && !isOwnPhone(c.phone)) rec.phone = c.phone;
            if (isOwnPhone(rec.phone)) rec.phone = '';
            if (!rec.contact && c.name && c.business) rec.contact = c.name;
            if (!rec.address && c.address) rec.address = c.address;

            mergePrices(rec, prices[c.id] || {}, !!opts.keepLocal, opts.since || '');

            const l = last[c.id] || {};
            rec.lastOrder = newerDoc(rec.lastOrder, l.order, 'orderId');
            const q = newerDoc(rec.lastQuote, l.quote, 'quoteId');
            if (q !== rec.lastQuote) { rec.lastQuote = q; rec.lastQuoteAt = q.date; }

            const crmLast = String(c.lastOrder || '').slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(crmLast) &&
                (!rec.lastOrderAt || crmLast > String(rec.lastOrderAt).slice(0, 10))) {
                rec.lastOrderAt = crmLast;
            }
            rec.orderCount = Math.max(Number(rec.orderCount) || 0, Number(c.orders) || 0);
        });

        // כרטיס שנמחק או מוזג ב-CRM — הלקוח נשאר במכשיר, בלי מזהה ישן
        out.forEach(r => { if (r.crmId && !seen.has(r.crmId)) delete r.crmId; });
        return { list: out, activeName: active };
    }

    // לקוחות שקיימים רק במכשיר — למסך המעבר. לקוח שכבר מחכה בתור ליצירה לא נכלל.
    function localOnly(list, ops) {
        const pending = new Set((ops || []).filter(o => o && o.op === 'agent_customer').map(o => o.localId));
        return (list || []).filter(r => r && r.name && !r.crmId && !(r.localId && pending.has(r.localId)));
    }

    // שלב 1 של המעבר: מחירים במכשיר שאין להם מחיר בכרטיס ⇒ prices_fill
    function fillOps(list, data) {
        const crm = priceTable(data && data.prices);
        const ops = [];
        (list || []).forEach(r => {
            if (!r || !r.crmId || !r.prices) return;
            const have = crm[r.crmId] || {};
            const prices = Object.keys(r.prices)
                .filter(id => !(id in have) && Number(r.prices[id]) > 0)
                .map(id => ({ productId: id, price: Number(r.prices[id]) }));
            if (prices.length) ops.push({ op: 'prices_fill', body: { id: r.crmId, prices: prices } });
        });
        return ops;
    }

    // agent_customer החזיר מזהה ⇒ הפעולות שחיכו לאותו לקוח מקבלות אותו
    function bindOps(ops, localId, crmId) {
        return (ops || []).map(o => {
            if (!o || o.localId !== localId || o.op === 'agent_customer') return o;
            return Object.assign({}, o, { body: Object.assign({}, o.body, { id: crmId }) });
        });
    }

    // שני לקוחות במכשיר ⇒ אחד. מחירי הכרטיס נשארים; מחירים שקיימים רק במקומי מתווספים.
    function mergeInto(target, local) {
        target.prices = Object.assign({}, local.prices || {}, target.prices || {});
        target.pricesAt = Object.assign({}, local.pricesAt || {}, target.pricesAt || {});
        ['lastOrder', 'lastQuote'].forEach(k => {
            const a = target[k];
            const b = local[k];
            if (b && (!a || String(b.date) > String(a.date))) target[k] = b;
        });
        ['lastOrderAt', 'lastQuoteAt'].forEach(k => {
            if (local[k] && (!target[k] || String(local[k]) > String(target[k]))) target[k] = local[k];
        });
        target.orderCount = Math.max(Number(target.orderCount) || 0, Number(local.orderCount) || 0);
        ['phone', 'contact', 'address'].forEach(k => {
            if (!target[k] && local[k] && !(k === 'phone' && isOwnPhone(local[k]))) target[k] = local[k];
        });
    }

    // agent_customer החזיר מזהה ⇒ הלקוח המקומי מקבל אותו. אם כבר יש במכשיר לקוח עם
    // הכרטיס הזה (התשובה existing) — הם מתמזגים. name = השם שנשאר, או null.
    function linkLocal(list, localId, crmId) {
        const out = JSON.parse(JSON.stringify(list || []));
        const local = out.find(r => r.localId === localId);
        if (!local) return { list: out, name: null };
        const target = out.find(r => r !== local && r.crmId === crmId);
        if (!target) {
            local.crmId = crmId;
            delete local.localId;
            return { list: out, name: local.name };
        }
        mergeInto(target, local);
        return { list: out.filter(r => r !== local), name: target.name };
    }

    // ההצעות מה-CRM ⇒ השורות של חלון "היסטוריה" ב-app.js
    function quoteHistory(quotes, list) {
        const names = {};
        (list || []).forEach(r => { if (r && r.crmId) names[r.crmId] = r.name; });
        return (quotes || []).filter(q => q && q.orderId).map(q => {
            const items = toLocalItems(q.items);
            const m = String(q.text || '').match(/([\d,]+(?:\.\d+)?) ₪/);
            const total = m ? Number(m[1].replace(/,/g, ''))
                : items.reduce((s, it) => s + it.quantity * it.price, 0);
            return { id: q.orderId, customer: names[q.contactId] || '', date: String(q.at || '').slice(0, 10),
                items: items, total: total };
        });
    }

    const AgentStore = {
        OWN_PHONES, nameKey, phoneDigits, isOwnPhone, crmLabel, stampOf, toLocalItems, priceTable,
        mergeAgentData, localOnly, fillOps, bindOps, mergeInto, linkLocal, quoteHistory
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = AgentStore;
    else root.AgentStore = AgentStore;
})(typeof self !== 'undefined' ? self : this);
