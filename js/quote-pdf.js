/*
 * הצעת מחיר כקובץ PDF — דף הסוכן (אפיון: docs/superpowers/specs/2026-11-25-agent-quote-pdf-design.md)
 *
 * הקובץ נבנה בדפדפן מהמסמך שכבר קיים להדפסה (buildQuoteDocHtml ב-app.js):
 * המסמך מחולק לעמודי A4 בלי לחתוך שורה, כל עמוד מרונדר בנפרד לתמונה
 * (html2canvas) ונכנס לעמוד ב-PDF (jsPDF). עמוד-עמוד ולא כל המסמך בבת אחת,
 * כי ב-iOS יש תקרה לגודל קנבס, ומסמך ארוך היה יוצא ריק.
 *
 * נטען רק בלחיצה על "שליחת הצעה ב-PDF", יחד עם שתי הספריות שב-js/lib.
 * paginate ו-fileName טהורות ונבדקות ב-tools/test/quote-pdf.test.js.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.QuotePdf = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // A4 ב-96dpi. השוליים תואמים ל-.qd-page ב-style.css.
    const PAGE_H = 1123;
    const PAD_TOP = 34;
    // המקום ששמור לפוטר בתחתית כל עמוד (פרטי הקשר ומספר העמוד)
    const FOOT_RESERVE = 64;
    const AVAIL = PAGE_H - PAD_TOP - FOOT_RESERVE;
    // A4 בנקודות PDF
    const PDF_W = 595.28, PDF_H = 841.89;

    /**
     * חלוקה לעמודים לפי גובה הבלוקים, בפיקסלים.
     * top — הכותרת וכרטיסי הפרטים (רק בעמוד הראשון); thead — שורת הכותרות של
     * הטבלה (בכל עמוד שיש בו שורות); rows — גובה כל שורת מוצר; tail — הסיכום,
     * החתימות וההערה (בסוף, ועוברים לעמוד חדש אם לא נכנסים).
     * מחזיר [{ first, rows: [אינדקסים], tail }]. שורה לא נחתכת בין עמודים.
     */
    function paginate(m) {
        const avail = m.avail || AVAIL;
        const pages = [];
        let cur = { first: true, rows: [], tail: false };
        let used = m.top || 0;
        const rows = m.rows || [];
        for (let i = 0; i < rows.length; i++) {
            let need = (cur.rows.length ? 0 : (m.thead || 0)) + rows[i];
            // שורה שלא נכנסת עוברת לעמוד חדש — אלא אם העמוד עוד ריק משורות
            // ומשהו כבר חייב להיכנס בו (עמוד ראשון), כדי לא לייצר עמוד ריק.
            if (used + need > avail && (cur.rows.length || !cur.first)) {
                pages.push(cur);
                cur = { first: false, rows: [], tail: false };
                used = 0;
                need = (m.thead || 0) + rows[i];
            }
            cur.rows.push(i);
            used += need;
        }
        if (used + (m.tail || 0) <= avail) {
            cur.tail = true;
            pages.push(cur);
        } else {
            pages.push(cur);
            pages.push({ first: false, rows: [], tail: true });
        }
        return pages;
    }

    // שם הקובץ שנשלח ללקוח. תווים שאסורים בשמות קבצים בחלונות יורדים,
    // ומירכאות הופכות לגרשיים עבריים (כמו בשם תעודת ההזמנה).
    function fileName(customer, id) {
        const clean = t => String(t || '')
            .replace(/"/g, '״')
            .replace(/[\\/:*?<>|\u0000-\u001f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const c = clean(customer);
        const num = clean(id);
        const base = c && c !== 'לקוח כללי'
            ? `הצעת מחיר - ${c} - ${num}`
            : `הצעת מחיר ${num}`;
        return base.slice(0, 120).trim() + '.pdf';
    }

    // ---------- רינדור (דפדפן בלבד) ----------

    function waitImages(el, timeoutMs) {
        const imgs = Array.from(el.querySelectorAll('img'));
        return Promise.all(imgs.map(img => (img.complete && img.naturalWidth)
            ? null
            : new Promise(resolve => {
                const done = () => resolve();
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
                setTimeout(done, timeoutMs || 6000);
            })));
    }

    // כללי העיצוב של המסמך כטקסט. html2canvas מרנדר מעותק של הדף בתוך iframe,
    // והעותק טוען את style.css מחדש — בלי רשת הטעינה נכשלת והעמוד יוצא בלי
    // עיצוב (נמדד: רוחב 359 במקום 794). העתקת הכללים לתוך העותק פותרת את זה.
    let cssCache = null;
    function docCss() {
        if (cssCache !== null) return cssCache;
        let out = '';
        Array.from(document.styleSheets).forEach(sheet => {
            let rules;
            try { rules = sheet.cssRules; } catch (e) { return; }  // גיליון חיצוני (פונטים)
            Array.from(rules || []).forEach(r => {
                const t = r.cssText || '';
                if (/qd-|quote-doc/.test(t) && !/^@media print/.test(t)) out += t + '\n';
            });
        });
        cssCache = out;
        return out;
    }

    function bottomOf(el, base) {
        return el ? el.offsetTop + el.offsetHeight - base : 0;
    }

    function newPage() {
        const page = document.createElement('div');
        page.className = 'quote-doc qd-page';
        return page;
    }

    /**
     * בונה את ה-PDF ממסמך ההצעה (HTML של buildQuoteDocHtml).
     * מחזיר { blob, pages }.
     */
    async function render(docHtml, opts) {
        opts = opts || {};
        if (typeof window.html2canvas !== 'function' || !window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('pdf libraries missing');
        }

        const host = document.createElement('div');
        host.className = 'qd-render-host';
        host.setAttribute('aria-hidden', 'true');
        document.body.appendChild(host);

        try {
            // 1. מדידה — המסמך כולו בעמוד אחד בלי גובה קבוע
            const meas = newPage();
            meas.classList.add('qd-measure');
            meas.innerHTML = docHtml;
            host.appendChild(meas);
            if (document.fonts && document.fonts.ready) await document.fonts.ready;
            await waitImages(meas);

            const table = meas.querySelector('.qd-table');
            const thead = table.querySelector('thead');
            const trs = Array.from(table.querySelectorAll('tbody tr'));
            const tailEls = ['.qd-sum', '.qd-sign', '.qd-legal']
                .map(s => meas.querySelector(s)).filter(Boolean);
            const contentTop = PAD_TOP;
            const tableBottom = table.offsetTop + table.offsetHeight;
            const plan = paginate({
                top: table.offsetTop - contentTop,
                thead: thead.offsetHeight,
                // 1px לכל שורה — הגבולות המשותפים ב-border-collapse
                rows: trs.map(tr => tr.offsetHeight + 1),
                tail: tailEls.length ? bottomOf(tailEls[tailEls.length - 1], 0) - tableBottom : 0
            });

            // 2. בניית העמודים מעותקים של הבלוקים
            const foot = meas.querySelector('.qd-foot');
            const pages = plan.map((p, idx) => {
                const page = newPage();
                if (p.first) {
                    ['.qd-head', '.qd-cards'].forEach(s => {
                        const el = meas.querySelector(s);
                        if (el) page.appendChild(el.cloneNode(true));
                    });
                }
                if (p.rows.length) {
                    const t = document.createElement('table');
                    t.className = 'qd-table';
                    t.appendChild(thead.cloneNode(true));
                    const tb = document.createElement('tbody');
                    p.rows.forEach(i => tb.appendChild(trs[i].cloneNode(true)));
                    t.appendChild(tb);
                    page.appendChild(t);
                }
                if (p.tail) tailEls.forEach(el => page.appendChild(el.cloneNode(true)));
                if (foot) {
                    const f = foot.cloneNode(true);
                    if (plan.length > 1) {
                        const num = document.createElement('span');
                        num.className = 'qd-foot-page';
                        num.textContent = `עמוד ${idx + 1} מתוך ${plan.length}`;
                        // בין "מאתר aroam.co.il" לפרטי הקשר
                        f.insertBefore(num, f.children[1] || null);
                    }
                    page.appendChild(f);
                }
                host.appendChild(page);
                return page;
            });
            host.removeChild(meas);
            await Promise.all(pages.map(p => waitImages(p)));

            // 3. כל עמוד לתמונה, וכל תמונה לעמוד ב-PDF
            const css = docCss();
            const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
            if (opts.title) pdf.setProperties({ title: opts.title, author: 'אהרוני שיווק והפצה' });
            for (let i = 0; i < pages.length; i++) {
                const target = pages[i];
                const canvas = await window.html2canvas(target, {
                    scale: opts.scale || 2,
                    backgroundColor: '#ffffff',
                    logging: false,
                    useCORS: true,
                    // html2canvas מעתיק את כל הדף לפני כל עמוד, ובספארי ובאייפון
                    // מחכה שכל תמונה בעותק תיטען — בלי הגבלת זמן. בדף הסוכן יש
                    // עשרות תמונות של הקטלוג, חלקן בטעינה עצלה שלא מתחילה בעותק
                    // מוסתר. מעתיקים רק את העמוד שמצלמים.
                    ignoreElements: el => (el.parentNode === document.body && el !== host)
                        || (el.parentNode === host && el !== target),
                    onclone: (doc) => {
                        const s = doc.createElement('style');
                        s.textContent = css;
                        doc.head.appendChild(s);
                    }
                });
                const jpg = canvas.toDataURL('image/jpeg', 0.9);
                if (i > 0) pdf.addPage();
                pdf.addImage(jpg, 'JPEG', 0, 0, PDF_W, PDF_H, undefined, 'FAST');
                canvas.width = canvas.height = 0;  // משחרר זיכרון בטלפון
            }
            return { blob: pdf.output('blob'), pages: pages.length };
        } finally {
            if (host.parentNode) host.parentNode.removeChild(host);
        }
    }

    return { paginate, fileName, render, AVAIL };
}));
