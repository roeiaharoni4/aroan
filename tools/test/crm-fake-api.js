/* שרת מדומה לעמוד ה-CRM — לבדיקה בדפדפן בלבד, בלי לגעת בענן ובלי נתוני אמת.
   tools/ לא מוגש באתר החי (_config.yml), אבל השרת המקומי מגיש אותו.
   שימוש — בקונסול של http://localhost:8085/crm-f428d7/ לפני הכניסה:
     await new Promise(r => { const s = document.createElement('script');
       s.src = '/tools/test/crm-fake-api.js'; s.onload = r; document.head.appendChild(s); });
   ואז להיכנס עם הסיסמה test-password-1234.
   מתגים: window.__crmFailNext = true (הבקשה הבאה שאינה list נכשלת),
   window.__crmOffline = true (כשל רשת), window.__crmCalls (כל הבקשות).
   הקצב והאיחור מחושבים כמו lateInfo_ בסקריפט, כדי שרישום וביטול הזמנה ישנו את התצוגה. */
(function () {
    const PASSWORD = 'test-password-1234';
    const pad = (n) => (n < 10 ? '0' : '') + n;
    const day = (offset) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    };
    const at = (offset, hm) => day(offset) + ' ' + (hm || '09:00');
    const today = day(0);
    let seq = 100;
    const nextId = (p) => p + (seq++);
    const order = (id, contactId, offset, orderId) => ({ id, contactId, at: at(offset), type: 'הזמנה',
        text: '10 פריטים', orderId: orderId || '', pdf: '', quoteLink: '', by: orderId ? 'הזמנות' : 'עמוד' });

    const db = {
        contacts: [
            { id: 'C1', name: 'משה', business: 'מוסך הגליל', phone: '0547781203', email: '', address: '',
              stage: 'חדש', followUp: today, source: 'מודעה בפייסבוק', created: at(0, '08:10'),
              lastActivity: at(0, '08:10'), orders: '0', lastOrder: '' },
            { id: 'C2', name: 'יוסי כהן', business: 'מ.ל. הנדסה', phone: '0501234567', email: 'yossi@example.co.il',
              address: '', stage: 'חדש', followUp: today, source: 'בקשת הצעת מחיר', created: at(-1, '16:20'),
              lastActivity: at(-1, '16:20'), orders: '0', lastOrder: '' },
            { id: 'C3', name: 'אבי', business: 'מחסני דרום', phone: '0529876543', email: '', address: '',
              stage: 'נשלחה הצעה', followUp: day(-2), source: 'טלפון', created: at(-9), lastActivity: at(-5),
              orders: '0', lastOrder: '' },
            { id: 'C4', name: 'מיכל', business: 'בית קפה השקד', phone: '0523334444', email: '', address: '',
              stage: 'חזרתי', followUp: today, source: 'וואטסאפ', created: at(-6), lastActivity: at(-3),
              orders: '0', lastOrder: '' },
            { id: 'C5', name: 'רותי', business: 'גן שושנים', phone: '035551234', email: '',
              address: 'הרצל 4, קריית אונו', stage: 'לקוח', followUp: today, source: 'הזמנה מהאתר',
              created: at(-60), lastActivity: at(-30), orders: '1', lastOrder: day(-30) },
            { id: 'C6', name: 'דוד', business: 'משרדי אלפא', phone: '0541112222', email: '', address: '',
              stage: 'לקוח', followUp: day(20), source: 'ייבוא', created: at(-80), lastActivity: at(-10),
              orders: '1', lastOrder: day(-10), rivhitNo: '1234' },
            { id: 'C7', name: 'נועה', business: '', phone: '0549998888', email: '', address: '',
              stage: 'לא רלוונטי', followUp: '', source: 'אחר', created: at(-15), lastActivity: at(-14),
              orders: '0', lastOrder: '' },
            { id: 'C8', name: 'שמעון', business: 'מאפיית הכיכר', phone: '0545556666', email: '', address: '',
              stage: 'לקוח', followUp: '', source: 'ייבוא', created: at(-120), lastActivity: at(-50),
              orders: '3', lastOrder: day(-50) }
        ],
        activities: [
            { id: 'A1', contactId: 'C1', at: at(0, '08:10'), type: 'נוצר ידנית',
              text: 'מחפש ספק לנייר וחומרי ניקוי', orderId: '', pdf: '', quoteLink: '', by: 'עמוד' },
            { id: 'A2', contactId: 'C2', at: at(-1, '16:20'), type: 'בקשת הצעת מחיר', text: '12 פריטים',
              orderId: 'HM-' + day(-1).replace(/-/g, '') + '-482911',
              pdf: 'https://drive.google.com/file/d/example/view',
              quoteLink: 'https://aroam.co.il/agent/?cart=' + encodeURIComponent('חדפ003') + ':2&customer=' +
                encodeURIComponent('מ.ל. הנדסה'), by: 'הזמנות' },
            { id: 'A3', contactId: 'C3', at: at(-5), type: 'הצעת מחיר', text: 'שלחתי הצעת מחיר',
              orderId: '', pdf: '', quoteLink: '', by: 'עמוד' },
            { id: 'A4', contactId: 'C5', at: at(-30), type: 'הזמנה', text: '18 פריטים',
              orderId: 'AR-' + day(-30).replace(/-/g, '') + '-123456',
              pdf: 'https://drive.google.com/file/d/example2/view', quoteLink: '', by: 'הזמנות',
              // פריטי ההזמנה לכפתור "קובץ לריווחית" (סבב 88): מזהים אמיתיים מ-products.csv,
              // ואחד בלי מק"ט בריווחית (טיפ001) — כדי לראות את רשימת "לא נכללו"
              items: JSON.stringify([
                  { id: 'ניק001', name: 'אקונומיקה 4 ליטר', qty: 6, price: 5 },
                  { id: 'מוצ020', name: 'גליל תעשייתי חד שכבתי 5012', qty: 4, price: 44 },
                  { id: 'טיפ001', name: 'DOVE סבון מוצק', qty: 2, price: 12 }
              ]) },
            // פריט מריווחית שנשמר לפני 12.11.26 עם מספר הפריט (1500) — בכרטיס הוא צריך לקבל
            // את המספר הקטלוגי מהרשימה שהועלתה (אפיון 2026-11-12)
            Object.assign(order('A5', 'C6', -10, 'SL-' + day(-10).replace(/-/g, '') + '-654321'), {
              items: JSON.stringify([{ id: 'חדפ006', name: 'כוסות נייר 8B - 1000 יח׳', qty: 2, price: 68 },
                  { id: 'RV-1500', name: 'כפפות ניטריל M', qty: 3, price: 7, rivhit: '1500' }]) }),
            order('A6', 'C8', -100, 'AR-' + day(-100).replace(/-/g, '') + '-111111'),
            order('A7', 'C8', -70, 'AR-' + day(-70).replace(/-/g, '') + '-222222'),
            order('A8', 'C8', -50, 'AR-' + day(-50).replace(/-/g, '') + '-333333')
        ],
        tasks: [
            { id: 'T1', contactId: 'C4', text: 'לשלוח דוגמאות של כוסות נייר', due: today, time: '',
              done: '', created: at(-1), reminded: '' },
            { id: 'T2', contactId: '', text: 'להזמין נייר מהספק', due: day(-1), time: '',
              done: '', created: at(-2), reminded: '' },
            { id: 'T3', contactId: 'C1', text: 'להתקשר אחרי הפגישה', due: today, time: '15:00',
              done: '', created: at(-1), reminded: '' },
            { id: 'T4', contactId: '', text: 'ספירת מלאי', due: day(3), time: '',
              done: '', created: at(-1), reminded: '' }
        ],
        items: [],
        itemsUpdated: '',
        prices: [
            { contactId: 'C6', productId: 'חדפ006', name: 'כוסות נייר 8B - 1000 יח׳', price: '65',
              updated: at(-10), source: 'הזמנה' }
        ]        ,
        orders: [
            { orderId: 'RA-' + day(-1).replace(/-/g, '') + '-100001', receivedAt: at(-1, '09:00'), business: 'גלילות — טומי', contact: 'רונית', totalItems: '12', totalPrice: '', pdf: 'https://drive.google.com/x', status: 'חדשה', statusAt: '', channel: 'רשת', contactId: '', duplicate: false },
            { orderId: 'RA-' + day(-1).replace(/-/g, '') + '-100002', receivedAt: at(-1, '09:05'), business: 'אמור', contact: 'דנה', totalItems: '8', totalPrice: '', pdf: 'https://drive.google.com/x', status: 'חדשה', statusAt: '', channel: 'רשת', contactId: '', duplicate: false },
            { orderId: 'SL-' + day(-2).replace(/-/g, '') + '-200001', receivedAt: at(-2, '12:13'), business: 'משרדי אלפא', contact: 'דוד', totalItems: '80', totalPrice: '360', pdf: 'https://drive.google.com/x', status: 'נקלטה בריווחית', statusAt: at(-2, '13:00'), channel: 'סוכן', contactId: 'C6', duplicate: true },
            { orderId: 'AR-' + day(-5).replace(/-/g, '') + '-300001', receivedAt: at(-5, '10:00'), business: 'גן שושנים', contact: 'רותי', totalItems: '5', totalPrice: '120', pdf: '', status: 'סופקה', statusAt: at(-4, '10:00'), channel: 'אתר', contactId: 'C5', duplicate: false },
            { orderId: 'AR-' + day(-20).replace(/-/g, '') + '-400001', receivedAt: at(-20, '10:00'), business: 'מאפיית הכיכר', contact: 'שמעון', totalItems: '3', totalPrice: '', pdf: 'https://drive.google.com/x', status: 'חשבונית הופקה', statusAt: at(-15, '10:00'), channel: 'אתר', contactId: 'C8', duplicate: false }
        ]
    };
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const phoneOf = (raw) => window.CrmCore.normalizePhone(raw);
    const stamp = () => window.CrmCore.nowStamp();
    const dnum = (s) => {
        const p = String(s).slice(0, 10).split('-');
        return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000;
    };
    const between = (a, b) => Math.round(dnum(b) - dnum(a));

    // אותו חישוב כמו lateInfo_ בסקריפט
    function lateFor(c) {
        const days = Array.from(new Set(db.activities
            .filter(a => a.contactId === c.id && a.type === 'הזמנה')
            .map(a => a.at.slice(0, 10)))).sort();
        const info = { rhythm: 0, daysSinceOrder: null, lateBy: 0, isLate: false };
        if (!days.length) return info;
        const ev = [];
        days.forEach(d => { if (!ev.length || between(ev[ev.length - 1], d) > 3) ev.push(d); });
        if (ev.length >= 3) {
            const g = [];
            for (let i = 1; i < ev.length; i++) g.push(between(ev[i - 1], ev[i]));
            g.sort((x, y) => x - y);
            const m = g.length;
            info.rhythm = Math.round(m % 2 ? g[(m - 1) / 2] : (g[m / 2 - 1] + g[m / 2]) / 2);
        }
        info.daysSinceOrder = between(days[days.length - 1], today);
        if (c.stage !== 'לקוח' || (c.followUp && c.followUp > today)) return info;
        const th = info.rhythm ? Math.max(Math.round(info.rhythm * 1.5), info.rhythm + 7) : 45;
        if (info.daysSinceOrder > th) {
            info.isLate = true;
            info.lateBy = info.daysSinceOrder - (info.rhythm || 45);
        }
        return info;
    }
    const withLate = (c) => Object.assign(clone(c), lateFor(c));
    function recount(c) {
        const mine = db.activities.filter(a => a.contactId === c.id && a.type === 'הזמנה');
        c.orders = String(mine.length);
        c.lastOrder = mine.reduce((m, a) => (a.at.slice(0, 10) > m ? a.at.slice(0, 10) : m), '');
    }

    const AGENT_KEYS = ['id', 'name', 'business', 'phone', 'address', 'stage', 'orders', 'lastOrder', 'rivhitNo', 'phones'];
    const agentContact = (x) => {
        const o = {};
        AGENT_KEYS.forEach(k => { o[k] = x[k] == null ? '' : String(x[k]); });
        return o;
    };
    const OWN = ['0526000158', '036346236', '0506444290'];
    const keyOf = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
    // כמו learnPrices_ בסקריפט: מוחק רק ב-prices_set (ידני), ו-fill לא דורס
    function setPrice(contactId, p, source, when, fill) {
        const pid = String(p.productId || p.id || '').trim();
        if (!pid) return;
        const i = db.prices.findIndex(x => x.contactId === contactId && x.productId === pid);
        const price = Math.round(Number(p.price) * 100) / 100;
        if (!(price > 0)) { if (!fill && source === 'ידני' && i >= 0) db.prices.splice(i, 1); return; }
        if (i >= 0 && fill) return;
        const row = { contactId: contactId, productId: pid, name: p.name || (i >= 0 ? db.prices[i].name : ''),
            price: String(price), updated: when, source: source };
        if (i >= 0) db.prices[i] = row; else db.prices.push(row);
    }

    function handle(b) {
        if (b.password !== PASSWORD) return { ok: false, error: 'unauthorized' };
        if (window.__crmFailNext && b.action !== 'list') {
            window.__crmFailNext = false;
            return { ok: false, error: 'server error' };
        }
        const c = b.id ? db.contacts.find(x => x.id === b.id) : null;
        switch (b.action) {
            case 'items':
                return { ok: true, items: clone(db.items), updated: db.items.length ? db.itemsUpdated : '' };
            case 'items_set': {
                const items = (Array.isArray(b.items) ? b.items : [])
                    .filter(x => Array.isArray(x) && /^\d{1,15}$/.test(String(x[0]).trim()) && String(x[1] || '').trim())
                    // שלשות [מספר, שם, מספר קטלוגי] כמו cleanItems_ בסקריפט (אפיון 2026-11-12)
                    .map(x => {
                        const cat = String(x[2] == null ? '' : x[2]).trim();
                        return [String(x[0]).trim(), String(x[1]).trim().slice(0, 100),
                            cat.length <= 15 && /^[^\t\r\n"|]+$/.test(cat) ? cat : ''];
                    });
                if (!items.length) return { ok: false, error: 'no items' };
                db.items = items;
                db.itemsUpdated = at(0, '12:00');
                return { ok: true, count: items.length, updated: db.itemsUpdated };
            }
            // הרשימה הקלה לבורר בדף הסוכן (AGENT_CONTACT_KEYS בסקריפט)
            case 'contacts':
                return { ok: true, contacts: db.contacts.map(agentContact) };
            case 'prices_set':
            case 'prices_fill': {
                if (!c) return { ok: false, error: 'not found' };
                const fill = b.action === 'prices_fill';
                const source = fill ? 'העברה מהטלפון' : b.source;
                if (['ידני', 'העברה מהטלפון'].indexOf(source) < 0) return { ok: false, error: 'bad source' };
                if (!Array.isArray(b.prices) || !b.prices.length) return { ok: false, error: 'no prices' };
                b.prices.forEach(p => setPrice(c.id, p, source, stamp(), fill));
                return { ok: true, prices: clone(db.prices.filter(x => x.contactId === c.id)) };
            }
            case 'agent_data': {
                const last = {};
                const quotes = [];
                db.activities.forEach(a => {
                    if (!a.items || (a.type !== 'הזמנה' && a.type !== 'הצעת מחיר')) return;
                    let items;
                    try { items = JSON.parse(a.items); } catch (e) { return; }
                    if (!items || !items.length) return;
                    const key = a.type === 'הזמנה' ? 'order' : 'quote';
                    if (key === 'order' && String(a.orderId).indexOf('SL-') !== 0) {
                        items = items.map(it => Object.assign({}, it, { price: 0 }));
                    }
                    const slot = last[a.contactId] = last[a.contactId] || {};
                    if (!slot[key] || a.at >= slot[key].at) slot[key] = { at: a.at, orderId: a.orderId, items: items };
                    if (key === 'quote') quotes.push({ contactId: a.contactId, at: a.at, orderId: a.orderId, text: a.text, items: items });
                });
                quotes.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
                return { ok: true, contacts: db.contacts.map(agentContact),
                    prices: db.prices.map(p => [p.contactId, p.productId, p.price, p.updated]),
                    last: last, quotes: quotes.slice(0, 50) };
            }
            case 'agent_customer': {
                const name = String(b.name || '').trim();
                if (!name) return { ok: false, error: 'name required' };
                let phone = phoneOf(b.phone);
                if (OWN.indexOf(phone) >= 0) phone = '';
                const dup = (phone && db.contacts.find(x => x.phone === phone)) ||
                    db.contacts.find(x => keyOf(x.business || x.name) === keyOf(name));
                if (dup) return { ok: true, id: dup.id, existing: true };
                const nc = { id: nextId('C'), name: String(b.contact || '').trim(), business: name, phone: phone,
                    email: '', address: String(b.address || '').trim(), stage: 'חדש', followUp: '',
                    source: 'דף הסוכן', created: stamp(), lastActivity: stamp(), orders: '0', lastOrder: '',
                    rivhitNo: '', phones: '' };
                db.contacts.push(nc);
                db.activities.push({ id: nextId('A'), contactId: nc.id, at: stamp(), type: 'נוצר בדף הסוכן',
                    text: '', orderId: '', pdf: '', quoteLink: '', by: 'דף הסוכן', items: '' });
                return { ok: true, id: nc.id, existing: false };
            }
            case 'quote': {
                if (!c) return { ok: false, error: 'not found' };
                const qid = String(b.quoteId || '');
                if (!/^Q-\d{8}-\d{3,6}$/.test(qid)) return { ok: false, error: 'bad quote' };
                if (db.activities.some(a => a.orderId === qid)) return { ok: true, duplicate: true };
                const items = (b.items || []).filter(it => it && it.id && Number(it.qty) > 0);
                if (!items.length) return { ok: false, error: 'no items' };
                const when = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(b.at || '') ? b.at : stamp();
                const total = Number(b.total);
                db.activities.push({ id: nextId('A'), contactId: c.id, at: when, type: 'הצעת מחיר',
                    text: [items.length + ' פריטים', total > 0 ? total.toFixed(2) + ' ₪' : '', 'מדף הסוכן']
                        .filter(Boolean).join(' · '),
                    orderId: qid, pdf: '', quoteLink: '', by: 'דף הסוכן', items: JSON.stringify(items) });
                if (c.stage !== 'לקוח') c.stage = 'נשלחה הצעה';
                items.forEach(it => setPrice(c.id, it, 'הצעה', when, false));
                return { ok: true };
            }
            case 'orders':
                return { ok: true, orders: clone(db.orders) };
            case 'order_status': {
                const all = ['חדשה', 'נקלטה בריווחית', 'סופקה', 'חשבונית הופקה', 'בוטלה'];
                if (all.indexOf(b.status) < 0) return { ok: false, error: 'bad status' };
                if (!Array.isArray(b.orderIds) || !b.orderIds.length || b.orderIds.length > 200) return { ok: false, error: 'no orders' };
                const when = stamp();
                const missing = [];
                let updated = 0;
                b.orderIds.forEach(id => {
                    const o = db.orders.find(x => x.orderId === id);
                    if (!o) { missing.push(id); return; }
                    o.status = b.status; o.statusAt = when; updated++;
                });
                if (!updated) return { ok: false, error: 'not found', missing };
                return { ok: true, updated, missing, status: b.status, statusAt: when };
            }
            case 'list':
                return { ok: true, today: today, contacts: db.contacts.map(withLate),
                    activities: clone(db.activities), tasks: clone(db.tasks.filter(t => !t.done)),
                    prices: clone(db.prices) };
            case 'add': {
                const input = b.contact || {};
                const phone = phoneOf(input.phone);
                if (!phone) return { ok: false, error: 'bad phone' };
                const dup = db.contacts.find(x => x.phone === phone);
                if (dup) return { ok: false, error: 'duplicate', id: dup.id };
                const nc = { id: nextId('C'), name: input.name || '', business: input.business || '', phone: phone,
                    email: '', address: '', stage: 'חדש', followUp: input.followUp || '', source: input.source || 'אחר',
                    created: stamp(), lastActivity: stamp(), orders: '0', lastOrder: '' };
                const a = { id: nextId('A'), contactId: nc.id, at: stamp(), type: 'נוצר ידנית',
                    text: input.note || '', orderId: '', pdf: '', quoteLink: '', by: 'עמוד' };
                db.contacts.push(nc);
                db.activities.push(a);
                return { ok: true, contact: withLate(nc), activity: clone(a) };
            }
            case 'update':
            case 'log': {
                if (!c) return { ok: false, error: 'not found' };
                const f = Object.assign({}, b.fields || {});
                if ('rivhitNo' in f) {
                    const rv = String(f.rivhitNo || '').trim();
                    if (rv && !(/^\d{1,5}$/.test(rv) && Number(rv) > 0)) return { ok: false, error: 'bad rivhit' };
                    f.rivhitNo = rv;
                }
                if ('phone' in f) {
                    const p = phoneOf(f.phone);
                    const other = p && db.contacts.find(x => x.phone === p && x.id !== c.id);
                    if (other) return { ok: false, error: 'duplicate', id: other.id };
                    f.phone = p;
                }
                Object.assign(c, f);
                let a = null;
                if (b.activity) {
                    a = { id: nextId('A'), contactId: c.id, at: stamp(), type: b.activity.type,
                        text: b.activity.text || '', orderId: '', pdf: '', quoteLink: '', by: 'עמוד' };
                    db.activities.push(a);
                    c.lastActivity = a.at;
                    if (a.type === 'הזמנה') recount(c);
                }
                return { ok: true, contact: withLate(c), activity: a ? clone(a) : null };
            }
            case 'delete': {
                if (!c) return { ok: false, error: 'not found' };
                const n = db.activities.filter(a => a.contactId === c.id).length;
                db.activities = db.activities.filter(a => a.contactId !== c.id);
                db.tasks = db.tasks.filter(t => t.contactId !== c.id);
                db.contacts = db.contacts.filter(x => x.id !== c.id);
                return { ok: true, deleted: n };
            }
            // מיזוג כרטיסים — כמו handleMerge_ בסקריפט, בקיצור (סבב 93)
            case 'merge': {
                const from = db.contacts.find(x => x.id === b.from);
                const to = db.contacts.find(x => x.id === b.to);
                if (!from || !to) return { ok: false, error: 'not found' };
                if (from.id === to.id) return { ok: false, error: 'same contact' };
                ['name', 'business', 'email', 'address', 'rivhitNo'].forEach(k => { if (!to[k] && from[k]) to[k] = from[k]; });
                const extra = String(to.phones || '').split(/\s+/).filter(Boolean);
                [from.phone].concat(String(from.phones || '').split(/\s+/)).filter(Boolean).forEach(p => {
                    if (p === to.phone || extra.includes(p)) return;
                    if (!to.phone) to.phone = p; else extra.push(p);
                });
                to.phones = extra.slice(0, 5).join(' ');
                let moved = 0;
                db.activities.forEach(a => { if (a.contactId === from.id) { a.contactId = to.id; moved++; } });
                const tasks = db.tasks.filter(t => t.contactId === from.id);
                tasks.forEach(t => { t.contactId = to.id; });
                if (from.stage === 'לקוח' || db.activities.some(a => a.contactId === to.id && a.type === 'הזמנה')) to.stage = 'לקוח';
                to.orders = String(db.activities.filter(a => a.contactId === to.id && a.type === 'הזמנה').length);
                db.activities.push({ id: nextId('A'), contactId: to.id, at: at(0, '12:00'), type: 'מיזוג',
                    text: 'מוזג מהכרטיס של ' + (from.business || from.name) + (from.phone ? ' (' + from.phone + ')' : '') +
                        ' — ' + [moved ? (moved === 1 ? 'פעולה אחת' : moved + ' פעולות') : '',
                            tasks.length ? (tasks.length === 1 ? 'משימה אחת' : tasks.length + ' משימות') : '']
                            .filter(Boolean).join(' ו'),
                    orderId: '', pdf: '', quoteLink: '', by: 'עמוד' });
                db.contacts = db.contacts.filter(x => x.id !== from.id);
                return { ok: true, id: to.id, moved: moved, tasks: tasks.length };
            }
            case 'import':
                return { ok: true, dryRun: b.dryRun !== false, summary: { rows: 75, created: 2, updated: 1,
                    activities: 3, skipped: { chain: 63, committee: 0, consumer: 5, test: 2, noKey: 0,
                    unknown: 0, existing: 0 }, testRows: ['AR-20260820-4449 — רועי בדיקה',
                    'SL-20260822-4481 — לקוח בדיקה'] } };
            case 'order': {
                if (!c) return { ok: false, error: 'not found' };
                const o = b.order || {};
                const d = o.date || today;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today) return { ok: false, error: 'bad date' };
                const a = { id: nextId('A'), contactId: c.id, at: d === today ? stamp() : d + ' 12:00',
                    type: 'הזמנה', text: o.note || '', orderId: '', pdf: '', quoteLink: '', by: 'עמוד' };
                db.activities.push(a);
                c.stage = 'לקוח';
                c.followUp = '';
                c.lastActivity = stamp();
                recount(c);
                return { ok: true, contact: withLate(c), activity: clone(a) };
            }
            case 'order_cancel': {
                const a = db.activities.find(x => x.id === b.activityId);
                if (!a) return { ok: false, error: 'not found' };
                if (a.type !== 'הזמנה' || a.by !== 'עמוד' || a.orderId) return { ok: false, error: 'not cancellable' };
                db.activities = db.activities.filter(x => x !== a);
                const owner = db.contacts.find(x => x.id === a.contactId);
                if (!owner) return { ok: true };
                recount(owner);
                return { ok: true, contact: withLate(owner) };
            }
            case 'task_add': {
                const t = b.task || {};
                if (!String(t.text || '').trim()) return { ok: false, error: 'text required' };
                if (!/^\d{4}-\d{2}-\d{2}$/.test(t.due || '')) return { ok: false, error: 'bad date' };
                if (t.contactId && !db.contacts.find(x => x.id === t.contactId)) return { ok: false, error: 'not found' };
                const nt = { id: nextId('T'), contactId: t.contactId || '', text: String(t.text).trim(), due: t.due,
                    time: t.time || '', done: '', created: stamp(), reminded: '' };
                db.tasks.push(nt);
                return { ok: true, task: clone(nt) };
            }
            case 'task_update': {
                const t = db.tasks.find(x => x.id === b.id);
                if (!t) return { ok: false, error: 'not found' };
                const f = b.fields || {};
                ['text', 'due', 'time'].forEach(k => { if (k in f) t[k] = f[k]; });
                const res = { ok: true };
                const owner = t.contactId ? db.contacts.find(x => x.id === t.contactId) : null;
                if (f.done === true && !t.done) {
                    t.done = stamp();
                    if (owner) {
                        const a = { id: nextId('A'), contactId: owner.id, at: stamp(), type: 'משימה',
                            text: 'בוצעה: ' + t.text, orderId: '', pdf: '', quoteLink: '', by: 'עמוד' };
                        db.activities.push(a);
                        owner.lastActivity = a.at;
                        res.activity = clone(a);
                    }
                } else if (f.done === false && t.done) {
                    t.done = '';
                    if (owner) {
                        const hit = db.activities.slice().reverse().find(a => a.contactId === owner.id &&
                            a.type === 'משימה' && a.text === 'בוצעה: ' + t.text);
                        if (hit) {
                            db.activities = db.activities.filter(a => a !== hit);
                            res.removedActivityId = hit.id;
                        }
                    }
                }
                res.task = clone(t);
                if (owner) res.contact = withLate(owner);
                return res;
            }
            case 'task_delete': {
                const n = db.tasks.length;
                db.tasks = db.tasks.filter(x => x.id !== b.id);
                return db.tasks.length < n ? { ok: true } : { ok: false, error: 'not found' };
            }
        }
        return { ok: false, error: 'unknown action' };
    }

    const realFetch = window.fetch.bind(window);
    window.__crmCalls = [];
    window.fetch = async function (url, init) {
        let body = null;
        try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) { body = null; }
        if (!body || !body.action) return realFetch(url, init);
        window.__crmCalls.push(body);
        await new Promise(r => setTimeout(r, 120));
        if (window.__crmOffline) throw new TypeError('Failed to fetch');
        return new Response(JSON.stringify(handle(body)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    console.log('crm-fake-api: פעיל. סיסמה: ' + PASSWORD);
})();
