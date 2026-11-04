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
              orders: '1', lastOrder: day(-10) },
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
              pdf: 'https://drive.google.com/file/d/example2/view', quoteLink: '', by: 'הזמנות' },
            order('A5', 'C6', -10, 'SL-' + day(-10).replace(/-/g, '') + '-654321'),
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

    function handle(b) {
        if (b.password !== PASSWORD) return { ok: false, error: 'unauthorized' };
        if (window.__crmFailNext && b.action !== 'list') {
            window.__crmFailNext = false;
            return { ok: false, error: 'server error' };
        }
        const c = b.id ? db.contacts.find(x => x.id === b.id) : null;
        switch (b.action) {
            case 'list':
                return { ok: true, today: today, contacts: db.contacts.map(withLate),
                    activities: clone(db.activities), tasks: clone(db.tasks.filter(t => !t.done)) };
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
