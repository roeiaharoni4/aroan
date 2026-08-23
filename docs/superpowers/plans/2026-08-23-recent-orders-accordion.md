# הזמנות אחרונות כרשימה נפתחת — תוכנית ביצוע

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** להחליף את קטגוריית "הזמנות אחרונות" מערימת כרטיסים שטוחה לרשימת שורות — אחת לכל הזמנה, עם תאריך ומספר פריטים, שנפתחת כלפי מטה ומציגה את המוצרים והכמויות של אותה הזמנה עם כפתור "הוסף הכל לסל".

**Architecture:** שינוי בשכבת התצוגה בלבד. מבנה הנתונים ב-`localStorage` לא משתנה (`{date, items:[{id,qty}]}`, 5 הזמנות), ולכן הזמנות ששמורות כבר במכשירים עובדות מיד. ההסתעפות ב-`renderProducts` מגודרת בדגל `CONFIG.recentOrdersList` שברירת המחדל שלו `true` ומכובה במפורש ב-`/care/` וב-`/agent/`.

**Tech Stack:** אתר סטטי בעברית RTL — HTML/CSS/JS ללא framework. ‏`js/app.js` הוא IIFE יחיד המשותף לכל הקטלוגים, ‏`css/style.css` הוא עיצוב אפליקציית הקטלוג. אין רתמת בדיקות ל-JS של הדפדפן בפרויקט — האימות הוא בדפדפן מול שרת מקומי, כפי שנעשה בכל הסבבים הקודמים.

## Global Constraints

- מסמך העיצוב המאושר: `docs/superpowers/specs/2026-08-23-recent-orders-accordion-design.md`. כל דרישה שם מחייבת.
- **צבעי המותג בלבד**, דרך הטוקנים הקיימים ב-`css/style.css` (`--primary` ‎#639C7D, `--primary-dark` ‎#1A4231, `--primary-light` ‎#EAF3EE, `--primary-pastel` ‎#8FD6A3). אסור לקודד צבע קשיח — `[data-theme="dark"]` דורס את הטוקנים, וערך קשיח שובר את המצב הכהה.
- **בלי אימוג'ים** בממשק. אייקונים = SVG או צורות CSS.
- כל שינוי ב-`js/app.js` או ב-`css/style.css` מחייב העלאת פרמטר הגרסה בכל 16 הדפים ואת `CACHE_NAME` ב-`sw.js` (משימה 3).
- אסור לגעת ב-`/care/` וב-`/agent/` מעבר להוספת `recentOrdersList: false`.
- **בבדיקה מקומית של שינוי גרסה:** לנקות service worker ו-caches לפני שמסיקים שהקוד לא עובד (`navigator.serviceWorker.getRegistrations()` → `unregister()`, ואז `caches.keys()` → `caches.delete()`). ה-SW הגיש HTML ישן בסבבים קודמים.
- השרת המקומי חייב להיות עדכני: לוודא `curl -s http://localhost:8080/api/ping` מחזיר `{"ok": true, ...}` לפני שמסיקים משהו מהדפדפן.

---

### Task 1: הרשימה הנפתחת ב-app.js

**Files:**
- Modify: `js/app.js` — ‏`DEFAULT_CONFIG` (‏~שורה 36), ‏`renderResultsBar` (‏~שורה 986), ‏`renderProducts` (‏~שורה 1014), הבר הישן (‏~שורות 1067–1098), ובלוק "Recent Orders" (‏~שורה 1988)
- Modify: `care/index.html` — ‏`window.CATALOG_CONFIG`
- Modify: `agent/index.html` — ‏`window.CATALOG_CONFIG`

**Interfaces:**
- Consumes: `getRecentOrders()`, `PRODUCTS`, `cart`, `updateSummary()`, `showToast(msg)`, `trackEvent(name, params)` — כולם קיימים ב-`js/app.js`.
- Produces: `renderRecentOrdersList()` המחזירה `HTMLDivElement` ‏(`.recent-orders`), ו-`formatOrderDate(iso)` המחזירה מחרוזת `DD.MM.YYYY`. משימה 2 מסתמכת על שמות ה-classes: `.recent-orders`, `.ro-row`, `.ro-head`, `.ro-caret`, `.ro-date`, `.ro-count`, `.ro-body`, `.ro-line`, `.ro-line-missing`, `.ro-thumb`, `.ro-name`, `.ro-qty`, `.ro-actions`.

- [ ] **Step 1: לוודא שהשרת המקומי חי ועדכני**

```bash
curl -s http://localhost:8080/api/ping
```

Expected: `{"ok": true, "app": "aroam", "version": 2}`. אם לא — להריץ `start_catalog.command` ולהשתמש בפורט שהוא פותח.

- [ ] **Step 2: לזרוע שלוש הזמנות מדומות ולתעד את מצב הבסיס**

לפתוח `http://localhost:8080/catalog/` בדפדפן ולהריץ בקונסול:

```js
localStorage.setItem('aroam_recent_orders_catalog', JSON.stringify([
  { date: '2026-08-23', items: [{ id: 'ניק001', qty: 4 }, { id: 'מוצ001', qty: 10 }, { id: 'לא-קיים-1', qty: 2 }] },
  { date: '2026-08-16', items: [{ id: 'ניק002', qty: 1 }] },
  { date: '2026-08-09', items: [{ id: 'לא-קיים-2', qty: 3 }] }
]));
location.reload();
```

אחרי הריענון ללחוץ על "הזמנות אחרונות" ולהריץ:

```js
JSON.stringify({ cards: document.querySelectorAll('.product-card').length, bar: document.querySelector('#products > div')?.textContent?.slice(0, 60) })
```

Expected (מצב **לפני** השינוי): ‏`cards` גדול מ-0, וה-`bar` מכיל "ההזמנה האחרונה שלך". זה מה שהמשימה מחליפה. **המזהים `ניק001`/`ניק002`/`מוצ001` חייבים להתקיים ב-`data/products.csv`** — לאמת עם `grep -c "^ניק001," data/products.csv`, ואם לא, להחליף במזהים קיימים.

- [ ] **Step 3: להוסיף את הדגל לברירות המחדל**

ב-`js/app.js`, בתוך `DEFAULT_CONFIG`, מיד לפני השורה `agentMode: false`:

```js
    // "הזמנות אחרונות" כרשימת תאריכים נפתחת במקום ערימת כרטיסים שטוחה.
    // מכובה ב-/care/ (לקוחה פרטית לא חוזרת על אותו סל) וב-/agent/ (המפתח
    // הוא פר-עמוד ולא פר-לקוח, ולכן הרשימה הייתה מערבבת לקוחות; שם יש
    // צ'יפ "ההזמנה הקודמת" פר-לקוח ב-js/agent.js).
    recentOrdersList: true,
```

- [ ] **Step 4: לכבות את הדגל ב-care וב-agent**

ב-`care/index.html` וב-`agent/index.html`, בתוך `window.CATALOG_CONFIG = { ... }`, להוסיף שורה:

```js
            recentOrdersList: false,
```

- [ ] **Step 5: להחזיר את שורת התוצאות לתצוגה בכל רינדור רגיל**

ב-`js/app.js`, בסוף `renderResultsBar`, להחליף את השורה האחרונה:

```js
        bar.querySelector('.results-count').textContent =
            count === 1 ? "מוצר אחד" : count + " מוצרים";
```

ב:

```js
        // הרשימה הנפתחת מסתירה את הסרגל (אין "N מוצרים" כשמוצגות הזמנות),
        // ולכן כל רינדור רגיל חייב להחזיר אותו
        bar.style.display = '';
        bar.querySelector('.results-count').textContent =
            count === 1 ? "מוצר אחד" : count + " מוצרים";
```

- [ ] **Step 6: להוסיף את פונקציות הרשימה**

ב-`js/app.js`, מיד אחרי `getRecentProductIds()` (סוף בלוק `--- Recent Orders ---`), להוסיף:

```js
    // --- הזמנות אחרונות כרשימת תאריכים נפתחת ---
    // הכמויות נשמרו מאז ומעולם ב-saveRecentOrder אבל אף פעם לא הוצגו:
    // הקטגוריה הראתה ערימה שטוחה של כל המוצרים מ-5 ההזמנות מעורבבים יחד.
    // מצב הפתיחה נשמר ב-Set כדי שהוספה לסל לא תסגור את השורה.
    const openRecentRows = new Set([0]);

    function formatOrderDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
        return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || '');
    }

    function renderRecentOrdersList() {
        const wrap = document.createElement('div');
        wrap.className = 'recent-orders';

        getRecentOrders().forEach((order, index) => {
            const items = (order.items || []).filter(i => i && i.id);
            const isOpen = openRecentRows.has(index);

            const row = document.createElement('div');
            row.className = 'ro-row';

            const head = document.createElement('button');
            head.type = 'button';
            head.className = 'ro-head';
            head.setAttribute('aria-expanded', String(isOpen));
            head.innerHTML =
                '<span class="ro-caret" aria-hidden="true"></span>' +
                '<span class="ro-date"></span>' +
                '<span class="ro-count"></span>';
            head.querySelector('.ro-date').textContent = formatOrderDate(order.date);
            head.querySelector('.ro-count').textContent =
                items.length === 1 ? 'פריט אחד' : items.length + ' פריטים';

            const body = document.createElement('div');
            body.className = 'ro-body';
            body.hidden = !isOpen;

            head.addEventListener('click', () => {
                const open = !openRecentRows.has(index);
                if (open) openRecentRows.add(index); else openRecentRows.delete(index);
                head.setAttribute('aria-expanded', String(open));
                body.hidden = !open;
            });

            let available = 0;
            items.forEach(item => {
                const product = PRODUCTS.find(p => p.id === item.id);
                if (product) available++;

                const line = document.createElement('div');
                line.className = 'ro-line' + (product ? '' : ' ro-line-missing');

                const img = document.createElement('img');
                img.className = 'ro-thumb';
                img.loading = 'lazy';
                img.width = 40;
                img.height = 40;
                img.alt = '';
                img.src = (product && product.image) || '/images/logo.png';
                img.onerror = function () { this.src = '/images/logo.png'; };

                const name = document.createElement('span');
                name.className = 'ro-name';
                name.textContent = product ? product.name : 'מק״ט ' + item.id;

                const qty = document.createElement('span');
                qty.className = 'ro-qty';
                qty.textContent = product ? '× ' + item.qty : 'לא זמין';

                line.appendChild(img);
                line.appendChild(name);
                line.appendChild(qty);
                body.appendChild(line);
            });

            const actions = document.createElement('div');
            actions.className = 'ro-actions';
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'btn btn-primary';
            addBtn.textContent = 'הוסף הכל לסל';
            addBtn.disabled = available === 0;
            addBtn.addEventListener('click', () => {
                let added = 0;
                items.forEach(i => {
                    // רק מוצרים שעדיין קיימים בקטלוג (נמחקו, או לא נכללים
                    // ברשימת הרשת ב-allowedProductsSource)
                    if (!PRODUCTS.some(p => p.id === i.id)) return;
                    const qty = parseInt(i.qty, 10);
                    if (!qty || qty <= 0) return;
                    cart[i.id] = qty;
                    added++;
                });
                // בכוונה בלי renderProducts(): רינדור מחדש היה סוגר את השורה
                // הפתוחה בכל לחיצה. הסל והבר התחתון מתעדכנים מ-updateSummary.
                updateSummary();
                if (added) trackEvent('add_to_cart', { order_items: added, source: 'recent_order' });
                showToast(added ? `נוספו ${added} פריטים לסל` : 'אין מוצרים זמינים בהזמנה הזאת');
            });
            actions.appendChild(addBtn);
            body.appendChild(actions);

            row.appendChild(head);
            row.appendChild(body);
            wrap.appendChild(row);
        });

        return wrap;
    }
```

- [ ] **Step 7: להסתעף אליה ב-renderProducts**

ב-`js/app.js`, בתוך `renderProducts`, מיד אחרי השורה:

```js
        productsEl.innerHTML = "";
```

להוסיף (שים לב: `searchQuery` מוגדר בשורה שמעליה, ו-`activeBrand` הוא משתנה של המודול):

```js
        // "הזמנות אחרונות": רשימת תאריכים נפתחת במקום ערימת כרטיסים.
        // חיפוש או בחירת מותג גוברים וחוזרים לתצוגת הכרטיסים הרגילה.
        if (CONFIG.recentOrdersList && activeCategory === 'recent' && searchQuery === "" && !activeBrand) {
            const resultsBar = document.getElementById('results-bar');
            if (resultsBar) resultsBar.style.display = 'none';
            productsEl.appendChild(renderRecentOrdersList());
            return;
        }
```

- [ ] **Step 8: להסיר את הבר הישן**

ב-`js/app.js` למחוק את הבלוק המלא שמתחיל ב:

```js
        // בקטגוריית "הזמנות אחרונות": כפתור למילוי הכמויות מההזמנה האחרונה בבת אחת.
```

ומסתיים ב-`productsEl.appendChild(bar);` ובסוגר `}` שלו — הבלוק כולו (‏`if (activeCategory === 'recent' && searchQuery === "" && !activeBrand) { ... }`). הוא הפך למיותר: הכפתור שלו הוא עכשיו הכפתור של השורה הראשונה, ובמסלול הרשימה הקוד ממילא כבר חזר ב-`return`.

לאמת שנשארה בדיוק התייחסות אחת לקטגוריה במסלול הרגיל:

```bash
grep -n "activeCategory === 'recent'" js/app.js
```

Expected: שתי שורות בלבד — ההסתעפות מ-Step 7, והסינון `filtered = PRODUCTS.filter(p => recentIds.has(p.id))` שנשאר לשירות מסלול החיפוש.

- [ ] **Step 9: לאמת בדפדפן — רינדור, פתיחה וסגירה**

לרענן את `http://localhost:8080/catalog/` (עם ניקוי SW/caches לפי Global Constraints), ללחוץ "הזמנות אחרונות" ולהריץ:

```js
JSON.stringify({
  rows: document.querySelectorAll('.ro-row').length,
  heads: [...document.querySelectorAll('.ro-head')].map(h => h.textContent.trim()),
  openBodies: [...document.querySelectorAll('.ro-body')].map(b => !b.hidden),
  missing: [...document.querySelectorAll('.ro-line-missing .ro-qty')].map(e => e.textContent),
  resultsBar: document.getElementById('results-bar')?.style.display,
  cards: document.querySelectorAll('.product-card').length
})
```

Expected: ‏`rows: 3`; ‏`heads` מתחיל ב-`"23.08.2026"` ומכיל `"3 פריטים"`; ‏`openBodies: [true, false, false]`; ‏`missing: ["לא זמין","לא זמין"]`; ‏`resultsBar: "none"`; ‏`cards: 0`.

- [ ] **Step 10: לאמת פתיחה/סגירה בלחיצה**

```js
(() => { const h = document.querySelectorAll('.ro-head')[1]; h.click();
  const after = [...document.querySelectorAll('.ro-body')].map(b => !b.hidden);
  h.click();
  return JSON.stringify({ afterOpen: after, afterClose: [...document.querySelectorAll('.ro-body')].map(b => !b.hidden), aria: h.getAttribute('aria-expanded') }); })()
```

Expected: `afterOpen: [true,true,false]` — כלומר הראשונה נשארה פתוחה (פתיחה עצמאית, לא אקורדיון בלעדי); `afterClose: [true,false,false]`; `aria: "false"`.

- [ ] **Step 11: לאמת "הוסף הכל לסל"**

```js
(() => { document.querySelector('.ro-row .ro-actions button').click();
  return JSON.stringify({
    cartText: document.getElementById('summary-items')?.textContent,
    fab: document.querySelector('.fab-container')?.textContent.replace(/\s+/g,' ').trim(),
    stillOpen: !document.querySelector('.ro-body').hidden,
    toast: document.getElementById('toast')?.textContent
  }); })()
```

Expected: ‏`stillOpen: true` (השורה לא נסגרה); ‏`toast: "נוספו 2 פריטים לסל"` — שניים ולא שלושה, כי `לא-קיים-1` דולג; מונה הסל מציג 14 יחידות (4+10).

- [ ] **Step 12: לאמת הזמנה שכולה לא זמינה**

```js
(() => { const b = document.querySelectorAll('.ro-row')[2].querySelector('.ro-actions button');
  return JSON.stringify({ disabled: b.disabled, lines: document.querySelectorAll('.ro-row:nth-child(3) .ro-line-missing').length }); })()
```

Expected: `disabled: true`, `lines: 1`.

- [ ] **Step 13: לאמת שחיפוש גובר**

```js
(() => { const s = document.getElementById('search-input'); s.value = 'נייר';
  s.dispatchEvent(new Event('input', { bubbles: true }));
  return JSON.stringify({ rows: document.querySelectorAll('.ro-row').length, cards: document.querySelectorAll('.product-card').length, resultsBar: document.getElementById('results-bar').style.display }); })()
```

Expected: `rows: 0`, `cards` גדול מ-0, `resultsBar: ""` (הסרגל חזר).

- [ ] **Step 14: רגרסיה — care ו-agent נשארו בתצוגה הישנה**

לפתוח `http://localhost:8080/care/`, לזרוע הזמנה ולרענן:

```js
localStorage.setItem('aroam_recent_orders_care', JSON.stringify([{ date: '2026-08-23', items: [{ id: 'PL004', qty: 2 }] }]));
location.reload();
```

אחרי הריענון ללחוץ "הזמנות אחרונות" ולהריץ:

```js
JSON.stringify({ rows: document.querySelectorAll('.ro-row').length, cards: document.querySelectorAll('.product-card').length })
```

Expected: `rows: 0` וגם `cards` גדול מ-0. **אם המזהה `PL004` לא קיים ב-`data/pricelist.csv`** — לבחור מזהה קיים משם (‏`head -3 data/pricelist.csv`).

לחזור על אותה בדיקה ב-`http://localhost:8080/agent/` (קוד כניסה `0526000158`) עם המפתח `aroam_recent_orders_agent` ומזהה מ-`data/products.csv`. Expected זהה: `rows: 0`.

- [ ] **Step 15: לנקות את נתוני הבדיקה**

```js
['aroam_recent_orders_catalog','aroam_recent_orders_care','aroam_recent_orders_agent','aroam_cart_catalog','aroam_cart_care','aroam_cart_agent'].forEach(k => localStorage.removeItem(k));
```

- [ ] **Step 16: Commit**

```bash
git add js/app.js care/index.html agent/index.html
git commit -m "הזמנות אחרונות: רשימת תאריכים נפתחת במקום ערימת כרטיסים

- renderRecentOrdersList: שורה לכל הזמנה עם תאריך ומספר פריטים, נפתחת
  לרשימת המוצרים והכמויות ולכפתור \"הוסף הכל לסל\" משלה.
- מוצר שאינו קיים עוד בקטלוג מוצג \"לא זמין\" במקום להידלג בשקט.
- אין renderProducts() אחרי ההוספה, אחרת השורה הפתוחה נסגרת.
- הבר הישן \"ההזמנה האחרונה שלך\" הוסר — הוא הכפתור של השורה הראשונה.
- CONFIG.recentOrdersList (ברירת מחדל true), מכובה ב-/care/ וב-/agent/.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: עיצוב הרשימה

**Files:**
- Modify: `css/style.css` — הוספת בלוק חדש בסוף הקובץ, ומדיה מובייל בתוך `@media (max-width: 768px)` הקיים

**Interfaces:**
- Consumes: שמות ה-classes ממשימה 1 (`.recent-orders`, `.ro-row`, `.ro-head`, `.ro-caret`, `.ro-date`, `.ro-count`, `.ro-body`, `.ro-line`, `.ro-line-missing`, `.ro-thumb`, `.ro-name`, `.ro-qty`, `.ro-actions`), והטוקנים של `:root` ב-`css/style.css`.
- Produces: אין ממשק לקוד — משימה 3 רק מעלה את מספר הגרסה.

- [ ] **Step 1: להוסיף את כללי הבסיס**

בסוף `css/style.css`:

```css
/* --- הזמנות אחרונות: רשימת תאריכים נפתחת --- */
/* העטיפה יושבת בתוך .products-grid ולכן חייבת לפרוש על כל העמודות */
.recent-orders {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.ro-row {
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
}

.ro-head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 1rem;
    color: var(--text-main);
    text-align: start;
}

.ro-head:hover {
    background: var(--primary-light);
}

/* משולש CSS — בלי אימוג'י ובלי קובץ אייקון */
.ro-caret {
    width: 0;
    height: 0;
    border-inline-start: 6px solid var(--primary-dark);
    border-block: 5px solid transparent;
    transition: transform 0.15s ease;
    flex-shrink: 0;
}

.ro-head[aria-expanded="true"] .ro-caret {
    transform: rotate(-90deg);
}

.ro-date {
    font-weight: 700;
    color: var(--primary-dark);
}

.ro-count {
    color: var(--text-secondary);
    font-size: 0.9rem;
}

.ro-body[hidden] {
    display: none;
}

.ro-body {
    border-top: 1px solid var(--border-color);
    padding: 0.5rem 1rem 1rem;
}

.ro-line {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--primary-light);
}

/* .ro-actions הוא ה-div האחרון בגוף השורה, ולכן :last-child/:last-of-type
   לא היו תופסים את שורת המוצר האחרונה — nth-last-child(2) כן */
.ro-line:nth-last-child(2) {
    border-bottom: none;
}

.ro-thumb {
    width: 40px;
    height: 40px;
    object-fit: contain;
    background: var(--card-img-bg);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
}

.ro-name {
    flex: 1;
    min-width: 0;
}

.ro-qty {
    font-weight: 700;
    color: var(--primary-dark);
    white-space: nowrap;
}

.ro-line-missing {
    opacity: 0.55;
}

.ro-line-missing .ro-qty {
    font-weight: 400;
    color: var(--text-secondary);
}

.ro-actions {
    margin-top: 0.75rem;
    display: flex;
    justify-content: flex-end;
}

.ro-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
```

- [ ] **Step 2: להוסיף את כללי המובייל**

בתוך הבלוק הקיים `@media (max-width: 768px)` ב-`css/style.css` (אותו בלוק שמכיל את `.products-grid`), להוסיף:

```css
    .ro-head {
        padding: 0.75rem 0.75rem;
        font-size: 0.95rem;
        gap: 0.5rem;
    }

    .ro-body {
        padding: 0.4rem 0.75rem 0.85rem;
    }

    .ro-thumb {
        width: 34px;
        height: 34px;
    }

    .ro-name {
        font-size: 0.9rem;
    }

    .ro-actions button {
        width: 100%;
    }
```

- [ ] **Step 3: לאמת בדסקטופ**

לזרוע מחדש את שלוש ההזמנות מ-Task 1 Step 2, לרענן, ללחוץ "הזמנות אחרונות" ולהריץ:

```js
(() => { const row = document.querySelector('.ro-row'), head = document.querySelector('.ro-head'), thumb = document.querySelector('.ro-thumb');
  const cs = getComputedStyle(row), hs = getComputedStyle(head), ts = getComputedStyle(thumb);
  return JSON.stringify({ rowWidth: Math.round(row.getBoundingClientRect().width), rowBg: cs.backgroundColor, headCursor: hs.cursor, thumb: ts.width + 'x' + ts.height, overflow: document.documentElement.scrollWidth - window.innerWidth }); })()
```

Expected: ‏`rowWidth` כרוחב הרשת המלא (מאות פיקסלים, לא רוחב עמודה בודדת ~205px) — זה מאמת ש-`grid-column: 1/-1` תפס; `rowBg: "rgb(255, 255, 255)"`; `headCursor: "pointer"`; `thumb: "40px x 40px"`; `overflow: 0`.

- [ ] **Step 4: לאמת את סיבוב החץ**

```js
(() => { const h = document.querySelectorAll('.ro-head')[1], c = h.querySelector('.ro-caret');
  const before = getComputedStyle(c).transform; h.click();
  return new Promise(r => setTimeout(() => r(JSON.stringify({ before, after: getComputedStyle(c).transform })), 300)); })()
```

Expected: ‏`before: "none"` (או מטריצת זהות) ו-`after` מטריצה שונה — הסיבוב הוחל.

- [ ] **Step 5: לאמת מובייל 375px**

לשנות את חלון התצוגה ל-375×812, לרענן, לפתוח את הקטגוריה ולהריץ:

```js
JSON.stringify({ overflow: document.documentElement.scrollWidth - window.innerWidth, btnWidth: Math.round(document.querySelector('.ro-actions button').getBoundingClientRect().width), thumb: getComputedStyle(document.querySelector('.ro-thumb')).width })
```

Expected: ‏`overflow: 0`; ‏`btnWidth` קרוב לרוחב גוף השורה (כפתור ברוחב מלא); `thumb: "34px"`.

- [ ] **Step 6: לאמת מצב כהה**

```js
(() => { document.documentElement.setAttribute('data-theme','dark');
  const r = JSON.stringify({ rowBg: getComputedStyle(document.querySelector('.ro-row')).backgroundColor, date: getComputedStyle(document.querySelector('.ro-date')).color });
  document.documentElement.removeAttribute('data-theme'); return r; })()
```

Expected: ‏`rowBg` **אינו** `rgb(255, 255, 255)` — כלומר הטוקן התחלף ולא נקבע צבע קשיח.

- [ ] **Step 7: לנקות ולעשות Commit**

```js
['aroam_recent_orders_catalog','aroam_cart_catalog'].forEach(k => localStorage.removeItem(k));
```

```bash
git add css/style.css
git commit -m "עיצוב רשימת ההזמנות האחרונות: שורות נפתחות בצבעי המותג

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: העלאת גרסאות, רגרסיה ותיעוד

**Files:**
- Modify: כל 16 הדפים שמפנים ל-`app.js?v=50` ול-`style.css?v=36`
- Modify: `sw.js` — ‏`CACHE_NAME`
- Modify: `CLAUDE.md` — סעיף חדש ב"מה בוצע" ועדכון שורת הגרסאות בארכיטקטורה

**Interfaces:**
- Consumes: הקוד ממשימות 1–2.
- Produces: אין.

- [ ] **Step 1: להעלות את פרמטרי הגרסה**

```bash
cd "/Users/roeiaharoni/Desktop/קטלוג לקוחות/aroan"
grep -rl "app\.js?v=50" --include="*.html" . | xargs sed -i '' 's/app\.js?v=50/app.js?v=51/g'
grep -rl "style\.css?v=36" --include="*.html" . | xargs sed -i '' 's/style\.css?v=36/style.css?v=37/g'
sed -i '' "s/aroam-cache-v44/aroam-cache-v45/" sw.js
```

- [ ] **Step 2: לאמת שלא נשארו הפניות ישנות**

```bash
grep -rc "app\.js?v=51" --include="*.html" . | grep -c ":1$"
grep -rn "app\.js?v=50\|style\.css?v=36\|aroam-cache-v44" --include="*.html" --include="*.js" . | grep -v node_modules
```

Expected: הפקודה הראשונה מחזירה `16`; השנייה מחזירה **אפס שורות**.

- [ ] **Step 3: רגרסיה בכל הקטלוגים**

לנקות SW ו-caches, ואז לעבור דף-דף ולאמת שכל אחד נטען עם `app.js?v=51` ובלי שגיאות קונסול:

| דף | לאמת |
| --- | --- |
| `/catalog/` | 199 מוצרים, "הזמנות אחרונות" מציג שורות (אחרי זריעה), "שם העסק *" עדיין חוסם שליחה |
| `/catalog/paper/` | ‏`presetCategory` עובד, כפתורי "הוסף" קיימים |
| `/care/` | 63 מוצרים, 5 בוררי אספקה, "הזמנות אחרונות" בתצוגה הישנה |
| `/agent/` | ‏PIN `0526000158`, עריכת מחיר בטבלת ההזמנה עובדת, "הזמנות אחרונות" בתצוגה הישנה |
| `/shops-4b7e2c/` | שער קוד `3160`, בורר סניף, 0 קישורי `tel:` ו-0 `wa.me` |
| `/emp-8c3f5a/` | שער קוד `7241`, מחירים מוצגים |

בכל דף להריץ:

```js
JSON.stringify({ app: [...document.scripts].map(s => s.src).find(s => s.includes('app.js')), errors: performance.getEntriesByType('resource').filter(r => r.responseStatus >= 400).map(r => r.name) })
```

Expected: ‏`app` מסתיים ב-`?v=51`, ו-`errors` ריק.

- [ ] **Step 4: לוודא שאין סחף בגנרטורים**

```bash
python3 tools/refresh_site.py && git status --short
```

Expected: השינויים היחידים הם `lastmod`/`sale_price_effective_date` אם עבר יום — אף קובץ מוצר או sitemap לא אמור להשתנות בגלל המשימה הזאת.

- [ ] **Step 5: לעדכן את CLAUDE.md**

בסעיף הארכיטקטורה, לעדכן את שורת הגרסאות ל-`app.js?v=51`, `style.css?v=37`, `sw cache-v45`.

בסוף רשימת "מה בוצע", לפני `## העדפות של רועי`, להוסיף סעיף ממוספר חדש שמתעד: הבעיה (ערימה שטוחה בלי כמויות, והזמנות 2–5 בלתי נגישות), הפתרון (שורה לכל הזמנה עם תאריך ומספר פריטים, נפתחת למוצרים וכמויות + "הוסף הכל לסל"), ההיקף והגידור (`recentOrdersList` ברירת מחדל `true`, מכובה ב-`/care/` וב-`/agent/` — ולמה), שתי ההכרעות (בלי `renderProducts()` אחרי הוספה; מבנה הנתונים לא השתנה ולכן הזמנות קיימות עובדות מיד), ומה אומת בדפדפן.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "העלאת גרסאות ותיעוד: הזמנות אחרונות כרשימה נפתחת

גרסאות: app.js?v=51, style.css?v=37, sw cache-v45 ב-16 דפים.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: לדווח לרועי שנדרש push**

אין credentials של GitHub בסביבת Claude — לציין במפורש שהקומיטים ממתינים ל-`git push` ממנו.
