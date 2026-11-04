/* CRM — אהרוני: לוגיקה טהורה, בלי DOM. נטען בעמוד לפני crm.js, ונבדק ב-Node:
   node tools/test/crm-page.test.js */
(function (root) {
    'use strict';

    var STAGES = ['חדש', 'חזרתי', 'נשלחה הצעה', 'לקוח', 'לא רלוונטי'];
    var STAGE_SLUGS = { 'חדש': 'new', 'חזרתי': 'back', 'נשלחה הצעה': 'quote', 'לקוח': 'customer', 'לא רלוונטי': 'closed' };
    var FILTERS = [
        { key: 'todo', label: 'לטיפול' },
        { key: 'tasks', label: 'משימות' },
        { key: 'late', label: 'לא הזמינו' },
        { key: 'חדש', label: 'חדש' },
        { key: 'חזרתי', label: 'חזרתי' },
        { key: 'נשלחה הצעה', label: 'נשלחה הצעה' },
        { key: 'לקוח', label: 'לקוח' },
        { key: 'לא רלוונטי', label: 'לא רלוונטי' },
        { key: 'all', label: 'הכל' }
    ];
    var MANUAL_SOURCES = ['וואטסאפ', 'טלפון', 'מודעה בפייסבוק', 'הפניה', 'אחר'];
    var CHANNELS = { call: 'שיחה', whatsapp: 'וואטסאפ', quote: 'הצעת מחיר' };
    var OUTCOMES = [
        { key: 'no_answer', label: 'לא ענה', hint: 'לחזור מחר' },
        { key: 'talked', label: 'דיברנו', hint: 'בוחרים מתי לחזור' },
        { key: 'quote_sent', label: 'שלחתי הצעת מחיר', hint: 'לחזור בעוד 3 ימים' },
        { key: 'ordered', label: 'הזמין', hint: 'הופך ללקוח' },
        { key: 'not_relevant', label: 'לא רלוונטי', hint: 'נסגר' }
    ];
    var FOLLOW_DAYS = { tomorrow: 1, three: 3, week: 7 };

    // ---------- תאריכים (מחרוזות YYYY-MM-DD בזמן מקומי) ----------

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function parseYmd(s) {
        var p = String(s).split('-');
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }

    // skipSaturday: תאריך שמחושב מקיצור ויוצא בשבת עובר לראשון
    function addDays(day, n, skipSaturday) {
        var d = parseYmd(day);
        d.setDate(d.getDate() + n);
        if (skipSaturday && d.getDay() === 6) d.setDate(d.getDate() + 1);
        return ymd(d);
    }
    function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
    function formatDate(day) {
        var p = String(day || '').split('-');
        return p.length === 3 ? p[2] + '.' + p[1] : '';
    }
    function formatStamp(stamp) {
        var s = String(stamp || '');
        var time = s.slice(11, 16);
        return formatDate(s.slice(0, 10)) + (time ? ' · ' + time : '');
    }
    function relativeDay(day, today) {
        if (!day) return '';
        if (day === today) return 'היום';
        if (day === addDays(today, -1)) return 'אתמול';
        return formatDate(day);
    }
    function nowStamp(d) {
        d = d || new Date();
        return ymd(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    // ---------- טלפון וקישורים ----------

    // אותם כללים כמו normalizePhone_ בסקריפט ה-CRM
    function normalizePhone(raw) {
        var d = String(raw == null ? '' : raw).replace(/\D/g, '');
        if (d.indexOf('00972') === 0) d = d.slice(2);
        if (d.indexOf('972') === 0) d = d.slice(3);
        if (/^[57]\d{8}$/.test(d) || /^[2-489]\d{7}$/.test(d)) d = '0' + d;
        return /^(0[57]\d{8}|0[2-489]\d{7}|1(?:599|700|800|801)\d{6})$/.test(d) ? d : '';
    }
    function formatPhone(d) {
        d = String(d || '');
        if (/^0[57]\d{8}$/.test(d)) return d.slice(0, 3) + '-' + d.slice(3);
        if (/^0[2-489]\d{7}$/.test(d)) return d.slice(0, 2) + '-' + d.slice(2);
        return d;
    }
    function waLink(phone) {
        var d = String(phone || '');
        return /^05\d{8}$/.test(d) ? 'https://wa.me/972' + d.slice(1) : '';
    }
    // דף הסוכן בוחר את הלקוח לפי customer, ויוצר אותו עם contact ו-phone אם אינו קיים
    function agentLink(c) {
        var q = '?customer=' + encodeURIComponent(c.business || c.name || '');
        if (c.name) q += '&contact=' + encodeURIComponent(c.name);
        if (c.phone) q += '&phone=' + encodeURIComponent(c.phone);
        return '/agent/' + q;
    }
    function displayName(c) { return c.business || c.name || formatPhone(c.phone) || 'ללא שם'; }
    function stageSlug(stage) { return STAGE_SLUGS[stage] || 'new'; }

    // ---------- רשימה ----------

    // תאריך חזרה שהגיע, או "חדש" בלי תאריך — חוץ מ"לא רלוונטי". ליד חדש עם
    // תאריך עתידי מחכה לתאריך שלו.
    function isTodo(c, today) {
        if (c.stage === 'לא רלוונטי') return false;
        if (c.followUp) return c.followUp <= today;
        return c.stage === 'חדש';
    }
    function isOverdue(c, today) { return !!c.followUp && c.followUp < today && c.stage !== 'לא רלוונטי'; }
    function todoGroup(c, today) {
        if (c.stage === 'חדש') return 0;
        return isOverdue(c, today) ? 1 : 2;
    }
    function matchesQuery(c, query) {
        var q = String(query || '').trim().toLowerCase();
        if (!q) return true;
        if ([c.name, c.business, c.email].join(' ').toLowerCase().indexOf(q) >= 0) return true;
        var digits = q.replace(/\D/g, '');
        if (digits.length < 3) return false;
        if (digits.indexOf('972') === 0) digits = '0' + digits.slice(3);
        var phone = String(c.phone || '');
        return phone.indexOf(digits) >= 0 || phone.replace(/^0/, '').indexOf(digits) >= 0;
    }
    function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
    // "לטיפול": חדשים (החדש למעלה), באיחור (הישן למעלה), של היום. "לא הזמינו": המאחר ביותר
    // למעלה. אחרים: פעולה אחרונה
    function sortContacts(list, filter, today) {
        return list.slice().sort(function (a, b) {
            if (filter === 'late') return (Number(b.lateBy) || 0) - (Number(a.lateBy) || 0);
            if (filter === 'todo') {
                var ga = todoGroup(a, today), gb = todoGroup(b, today);
                if (ga !== gb) return ga - gb;
                if (ga === 0) return cmp(b.created, a.created);
                if (ga === 1) return cmp(a.followUp, b.followUp);
            }
            return cmp(b.lastActivity || b.created, a.lastActivity || a.created);
        });
    }
    function filterContacts(contacts, filter, query, today) {
        var list = contacts.filter(function (c) {
            if (!matchesQuery(c, query)) return false;
            if (filter === 'todo') return isTodo(c, today);
            if (filter === 'late') return !!c.isLate;
            if (filter === 'tasks') return false;
            if (filter === 'all') return true;
            return c.stage === filter;
        });
        return sortContacts(list, filter, today);
    }
    // "לטיפול" סופר אנשי קשר ומשימות שהגיע זמנן
    function counts(contacts, today, tasks) {
        var open = tasks || [];
        var r = { todo: dueTasks(open, today).length, all: contacts.length, tasks: open.length, late: 0 };
        STAGES.forEach(function (s) { r[s] = 0; });
        contacts.forEach(function (c) {
            if (r[c.stage] != null) r[c.stage]++;
            if (isTodo(c, today)) r.todo++;
            if (c.isLate) r.late++;
        });
        return r;
    }

    // ---------- תאריך חזרה ----------

    function followUpFor(choice, today) {
        if (choice === 'today') return today;
        if (!FOLLOW_DAYS[choice]) return '';
        return addDays(today, FOLLOW_DAYS[choice], true);
    }
    function followUpValue(c, today) {
        if (!c.followUp) return '';
        if (c.followUp < today) {
            var n = daysBetween(c.followUp, today);
            return n === 1 ? 'באיחור יום' : 'באיחור ' + n + ' ימים';
        }
        if (c.followUp === today) return 'היום';
        if (c.followUp === addDays(today, 1)) return 'מחר';
        return formatDate(c.followUp);
    }
    function followUpLabel(c, today) {
        var v = followUpValue(c, today);
        if (!v) return '';
        return v.indexOf('באיחור') === 0 ? 'לחזור — ' + v : 'לחזור ' + v;
    }
    // ordersView ("לקוח" ו"לא הזמינו"): "הזמנה אחרונה לפני N ימים" במקום תאריך הפעולה האחרונה
    function subLine(c, today, ordersView) {
        var parts = [];
        if (c.business && c.name) parts.push(c.name);
        if (c.source) parts.push(c.source);
        var when = (ordersView && orderSubLine(c)) ||
            relativeDay(String(c.lastActivity || c.created || '').slice(0, 10), today);
        if (when) parts.push(when);
        return parts.join(' · ');
    }

    // ---------- חלון התוצאה ----------

    function outcomesFor(channel) {
        if (channel !== 'quote') return OUTCOMES.slice();
        var first = OUTCOMES.filter(function (o) { return o.key === 'quote_sent'; });
        return first.concat(OUTCOMES.filter(function (o) { return o.key !== 'quote_sent'; }));
    }
    function applyOutcome(c, key, channel, today, follow, note, recordOrder) {
        var fields = {};
        var label = '';
        OUTCOMES.forEach(function (o) { if (o.key === key) label = o.label; });
        if (key === 'no_answer') {
            if (c.stage === 'חדש') fields.stage = 'חזרתי';
            fields.followUp = addDays(today, 1, true);
        } else if (key === 'talked') {
            if (c.stage === 'חדש') fields.stage = 'חזרתי';
            fields.followUp = followUpFor(follow || 'tomorrow', today);
        } else if (key === 'quote_sent') {
            if (c.stage !== 'לקוח') fields.stage = 'נשלחה הצעה';
            fields.followUp = addDays(today, 3, true);
        } else if (key === 'ordered') {
            fields.stage = 'לקוח';
            fields.followUp = '';
            // "הזמין" — הזמנה לכל דבר; בלי רישום (כבר יש הזמנה היום) — רק הערוץ, כמו קודם
            if (recordOrder !== false) {
                return {
                    fields: fields,
                    activity: { type: 'הזמנה', text: 'דרך ' + (CHANNELS[channel] || 'שיחה') + (note ? ' — ' + note : '') }
                };
            }
        } else if (key === 'not_relevant') {
            fields.stage = 'לא רלוונטי';
            fields.followUp = '';
        }
        return {
            fields: fields,
            activity: { type: CHANNELS[channel] || 'שיחה', text: label + (note ? ' — ' + note : '') }
        };
    }

    // ---------- הזמנות וקצב ----------

    function sinceLabel(n) {
        if (n === 0) return 'היום';
        if (n === 1) return 'אתמול';
        return 'לפני ' + n + ' ימים';
    }
    // "4 הזמנות · אחרונה לפני 52 ימים · בדרך כלל כל 30 יום"
    function ordersLine(c) {
        var n = Number(c.orders) || 0;
        if (!n || c.daysSinceOrder == null || c.daysSinceOrder === '') return 'אין הזמנה רשומה';
        var parts = [n === 1 ? 'הזמנה אחת' : n + ' הזמנות', 'אחרונה ' + sinceLabel(Number(c.daysSinceOrder))];
        var r = Number(c.rhythm) || 0;
        if (r) parts.push('בדרך כלל כל ' + r + (r <= 10 ? ' ימים' : ' יום'));
        return parts.join(' · ');
    }
    function lateLabel(c) {
        if (!c.isLate) return '';
        var n = Number(c.lateBy) || 0;
        return n === 1 ? 'מאחר ביום' : 'מאחר ב-' + n + ' ימים';
    }
    // בשורות של "לקוח" ו"לא הזמינו"
    function orderSubLine(c) {
        if (c.daysSinceOrder == null || c.daysSinceOrder === '') return '';
        return 'הזמנה אחרונה ' + sinceLabel(Number(c.daysSinceOrder));
    }
    function orderOn(activities, contactId, day) {
        return activities.some(function (a) {
            return a.contactId === contactId && a.type === 'הזמנה' && String(a.at).slice(0, 10) === day;
        });
    }
    // רק הזמנה שנרשמה מהעמוד ואין לה מספר אפשר לבטל
    function isManualOrder(a) { return a.type === 'הזמנה' && a.by === 'עמוד' && !a.orderId; }

    // ---------- משימות ----------

    function isTaskDue(t, today) { return !t.done && t.due <= today; }
    function isTaskLate(t, today) { return !t.done && t.due < today; }
    // לפי תאריך; באותו יום — בלי שעה קודם, ואחריהן לפי השעה
    function sortTasks(tasks) {
        return tasks.slice().sort(function (a, b) {
            if (a.due !== b.due) return cmp(a.due, b.due);
            if (!a.time !== !b.time) return a.time ? 1 : -1;
            return cmp(a.time, b.time);
        });
    }
    function dueTasks(tasks, today) {
        return sortTasks((tasks || []).filter(function (t) { return isTaskDue(t, today); }));
    }
    function openTasksOf(tasks, contactId) {
        return sortTasks((tasks || []).filter(function (t) { return !t.done && t.contactId === contactId; }));
    }
    function taskDueLabel(t, today) {
        var time = t.time ? ' ' + t.time : '';
        if (t.due < today) {
            var n = daysBetween(t.due, today);
            return n === 1 ? 'באיחור יום' : 'באיחור ' + n + ' ימים';
        }
        if (t.due === today) return 'היום' + time;
        if (t.due === addDays(today, 1)) return 'מחר' + time;
        return formatDate(t.due) + time;
    }
    function validateTask(input) {
        if (!String(input.text || '').trim()) return 'צריך לכתוב מה המשימה.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.due || ''))) return 'צריך לבחור תאריך.';
        if (input.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) return 'השעה לא תקינה.';
        return '';
    }
    // חיפוש במשימות: הטקסט או שם הלקוח
    function taskMatchesQuery(t, contact, query) {
        var q = String(query || '').trim().toLowerCase();
        if (!q) return true;
        return (t.text + ' ' + (contact ? displayName(contact) : '')).toLowerCase().indexOf(q) >= 0;
    }

    // ---------- טופס ----------

    function findByPhone(contacts, raw) {
        var p = normalizePhone(raw);
        if (!p) return null;
        for (var i = 0; i < contacts.length; i++) if (contacts[i].phone === p) return contacts[i];
        return null;
    }
    function validateNew(input, mode) {
        var raw = String(input.phone || '').trim();
        if (mode !== 'edit' && !raw) return 'צריך מספר טלפון.';
        if (raw && !normalizePhone(raw)) return 'מספר הטלפון לא תקין — למשל 050-1234567.';
        if (!String(input.name || '').trim() && !String(input.business || '').trim()) return 'צריך שם או שם עסק.';
        return '';
    }

    // ---------- ייבוא ----------

    function importLines(s, done) {
        var lines = [];
        if (!done && !s.activities) {
            lines.push('אין מה לייבא — הכל כבר כאן.');
        } else {
            lines.push((done ? 'יובאו ' : 'ייובאו ') + s.activities + ' הזמנות ובקשות: ' +
                s.created + ' אנשי קשר חדשים, ' + s.updated + ' קיימים מתעדכנים.');
        }
        var sk = s.skipped || {};
        var names = [['chain', 'רשת החנויות'], ['committee', 'ועד העובדים'], ['consumer', 'הזמנות צרכן'],
            ['test', 'שורות בדיקה'], ['noKey', 'בלי טלפון ובלי עסק'], ['unknown', 'קידומת לא מוכרת'],
            ['existing', 'כבר קיימים']];
        var parts = names.filter(function (n) { return sk[n[0]]; })
            .map(function (n) { return n[1] + ' ' + sk[n[0]]; });
        if (parts.length) lines.push('דולגו: ' + parts.join(' · ') + '.');
        return lines;
    }

    var CrmCore = {
        STAGES: STAGES, FILTERS: FILTERS, MANUAL_SOURCES: MANUAL_SOURCES, CHANNELS: CHANNELS,
        OUTCOMES: OUTCOMES, ymd: ymd, addDays: addDays, daysBetween: daysBetween,
        formatDate: formatDate, formatStamp: formatStamp, relativeDay: relativeDay,
        nowStamp: nowStamp, normalizePhone: normalizePhone, formatPhone: formatPhone,
        waLink: waLink, agentLink: agentLink, displayName: displayName, stageSlug: stageSlug,
        isTodo: isTodo, isOverdue: isOverdue, filterContacts: filterContacts, counts: counts,
        followUpFor: followUpFor, followUpValue: followUpValue, followUpLabel: followUpLabel,
        subLine: subLine, outcomesFor: outcomesFor, applyOutcome: applyOutcome,
        findByPhone: findByPhone, validateNew: validateNew, importLines: importLines,
        ordersLine: ordersLine, lateLabel: lateLabel, orderSubLine: orderSubLine, orderOn: orderOn,
        isManualOrder: isManualOrder, isTaskDue: isTaskDue, isTaskLate: isTaskLate, sortTasks: sortTasks,
        dueTasks: dueTasks, openTasksOf: openTasksOf, taskDueLabel: taskDueLabel, validateTask: validateTask,
        taskMatchesQuery: taskMatchesQuery
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = CrmCore;
    else root.CrmCore = CrmCore;
})(this);
