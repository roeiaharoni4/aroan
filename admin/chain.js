// עורך עמוד רשת החנויות (/shops-4b7e2c/): מרכזי קניות, החנויות שבכל מרכז,
// ורשימת המוצרים מהקטלוג הראשי שגלויים לרשת. הכל נשמר ל-data/chain.json.
// אין כאן מחירון — העמוד טוען את products.csv ומסנן אותו לפי הרשימה.
document.addEventListener('DOMContentLoaded', () => {
    // Security layer: Block access if not running locally
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        alert('הגישה למערכת הניהול מותרת רק מהמחשב המקומי.');
        window.location.href = '../index.html';
        return;
    }

    const CHAIN_URL = '/data/chain.json';
    const CATALOG_URL = '/data/products.csv';

    let malls = [];              // [{name, stores: [שם, ...]}]
    let street = [];             // חנויות שאינן במרכז קניות
    let selected = new Set();    // מזהי המוצרים הגלויים
    let catalog = [];            // כל שורות products.csv

    const mallsList = document.getElementById('malls-list');
    const streetChips = document.getElementById('street-chips');
    const addMallBtn = document.getElementById('add-mall-btn');
    const productList = document.getElementById('product-list');
    const searchInput = document.getElementById('prod-search');
    const countEl = document.getElementById('prod-count');
    const warningEl = document.getElementById('chain-empty-warning');
    const clearBtn = document.getElementById('clear-selection-btn');
    const saveBtn = document.getElementById('save-all-btn');
    const stateEl = document.getElementById('save-state');

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function imgPath(src) {
        // נתיבי תמונות ב-CSV הם יחסיים לשורש האתר; מהתיקייה admin צריך '/' בהתחלה
        if (!src) return '';
        if (src.startsWith('/') || src.startsWith('http') || src.startsWith('data:')) return src;
        return '/' + src;
    }

    function showToast(msg, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = 'toast ' + type + ' show';
        setTimeout(() => toast.className = 'toast', 3500);
    }

    function markDirty() {
        stateEl.textContent = 'יש שינויים שלא נשמרו';
        saveBtn.classList.add('has-unsaved');
    }

    // ===================== מרכזי קניות וחנויות =====================

    function renderMalls() {
        if (!malls.length) {
            mallsList.innerHTML = '<p style="color:#888; margin:0 0 10px;">עדיין לא הוגדרו מרכזי קניות. ' +
                'עד שיוגדר לפחות מרכז אחד עם חנות, בעל חנות שייכנס לעמוד יראה הודעה במקום הקטלוג.</p>';
            return;
        }
        mallsList.innerHTML = malls.map((m, mi) => `
            <div class="mall-row" data-mall="${mi}">
                <div class="mall-head">
                    <input type="text" class="mall-name" maxlength="60" value="${esc(m.name)}"
                        placeholder="שם מרכז הקניות" aria-label="שם מרכז הקניות">
                    <button type="button" class="btn btn-outline mall-del">מחק מרכז</button>
                </div>
                <div class="store-chips">
                    ${m.stores.map((s, si) => `
                        <span class="store-chip">
                            <input type="text" class="store-name" maxlength="60" data-store="${si}"
                                value="${esc(s)}" aria-label="שם החנות"
                                size="${Math.max(6, s.length)}">
                            <button type="button" class="chip-x store-del" data-store="${si}"
                                title="מחיקת החנות">✕</button>
                        </span>`).join('')}
                    <button type="button" class="btn-mini store-add">+ הוסף חנות</button>
                </div>
            </div>`).join('');
    }

    function mallIndexOf(el) {
        return parseInt(el.closest('.mall-row').dataset.mall, 10);
    }

    mallsList.addEventListener('input', (e) => {
        const mi = mallIndexOf(e.target);
        if (e.target.classList.contains('mall-name')) {
            malls[mi].name = e.target.value;
            markDirty();
        } else if (e.target.classList.contains('store-name')) {
            malls[mi].stores[parseInt(e.target.dataset.store, 10)] = e.target.value;
            markDirty();
        }
    });

    mallsList.addEventListener('click', (e) => {
        if (e.target.classList.contains('mall-del')) {
            const mi = mallIndexOf(e.target);
            const m = malls[mi];
            if (m.stores.length && !confirm(`למחוק את "${m.name || 'המרכז'}" ואת ${m.stores.length} החנויות שבו?`)) return;
            malls.splice(mi, 1);
            renderMalls();
            markDirty();
        } else if (e.target.classList.contains('store-del')) {
            const mi = mallIndexOf(e.target);
            malls[mi].stores.splice(parseInt(e.target.dataset.store, 10), 1);
            renderMalls();
            markDirty();
        } else if (e.target.classList.contains('store-add')) {
            const mi = mallIndexOf(e.target);
            malls[mi].stores.push('');
            renderMalls();
            // מיקוד בחנות החדשה כדי שאפשר יהיה להקליד מיד
            const row = mallsList.querySelector(`.mall-row[data-mall="${mi}"]`);
            const inputs = row.querySelectorAll('.store-name');
            if (inputs.length) inputs[inputs.length - 1].focus();
            markDirty();
        }
    });

    addMallBtn.addEventListener('click', () => {
        malls.push({ name: '', stores: [] });
        renderMalls();
        const inputs = mallsList.querySelectorAll('.mall-name');
        if (inputs.length) inputs[inputs.length - 1].focus();
        markDirty();
    });

    // ===================== חנויות רחוב =====================

    function renderStreet() {
        streetChips.innerHTML = street.map((s, i) => `
            <span class="store-chip">
                <input type="text" class="street-name" maxlength="60" data-street="${i}"
                    value="${esc(s)}" aria-label="שם החנות" size="${Math.max(8, s.length)}">
                <button type="button" class="chip-x street-del" data-street="${i}" title="מחיקת החנות">✕</button>
            </span>`).join('') +
            '<button type="button" class="btn-mini street-add">+ הוסף חנות רחוב</button>';
    }

    streetChips.addEventListener('input', (e) => {
        if (!e.target.classList.contains('street-name')) return;
        street[parseInt(e.target.dataset.street, 10)] = e.target.value;
        markDirty();
    });

    streetChips.addEventListener('click', (e) => {
        if (e.target.classList.contains('street-del')) {
            street.splice(parseInt(e.target.dataset.street, 10), 1);
            renderStreet();
            markDirty();
        } else if (e.target.classList.contains('street-add')) {
            street.push('');
            renderStreet();
            const inputs = streetChips.querySelectorAll('.street-name');
            if (inputs.length) inputs[inputs.length - 1].focus();
            markDirty();
        }
    });

    // ===================== מוצרים גלויים =====================

    function syncCount() {
        countEl.textContent = `${selected.size} נבחרו מתוך ${catalog.length}`;
        warningEl.style.display = selected.size ? 'none' : 'block';
    }

    function renderProducts() {
        const q = searchInput.value.trim().toLowerCase();
        const rows = catalog.filter(r => !q || (r.name + ' ' + r.category).toLowerCase().includes(q));

        if (!rows.length) {
            productList.innerHTML = '<p style="padding:20px; text-align:center; color:#888;">אין תוצאות</p>';
            return;
        }

        // קיבוץ לפי קטגוריה, כדי שאפשר יהיה לחשוף קטגוריה שלמה בלחיצה אחת
        const groups = new Map();
        rows.forEach(r => {
            const cat = r.category || 'ללא קטגוריה';
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat).push(r);
        });

        productList.innerHTML = [...groups.entries()].map(([cat, items]) => {
            const allOn = items.every(r => selected.has(r.id));
            return `<div class="cat-group">
                <label class="cat-head">
                    <input type="checkbox" class="cat-toggle" data-cat="${esc(cat)}" ${allOn ? 'checked' : ''}>
                    <span>${esc(cat)}</span>
                    <span class="cat-count">(${items.filter(r => selected.has(r.id)).length}/${items.length})</span>
                </label>
                ${items.map(r => `
                    <label class="prod-item">
                        <input type="checkbox" class="prod-toggle" value="${esc(r.id)}" ${selected.has(r.id) ? 'checked' : ''}>
                        <img src="${esc(imgPath(r.image))}" alt="" onerror="this.style.visibility='hidden'">
                        <span class="p-name">${esc(r.name)}</span>
                        <span class="p-id">${esc(r.id)}</span>
                    </label>`).join('')}
            </div>`;
        }).join('');
    }

    productList.addEventListener('change', (e) => {
        if (e.target.classList.contains('prod-toggle')) {
            e.target.checked ? selected.add(e.target.value) : selected.delete(e.target.value);
            // רק המונה של הקבוצה ו"בחר הכל" צריכים רענון — לא בונים מחדש את כל הרשימה,
            // כדי שגלילה ומיקוד לא יקפצו בכל סימון
            refreshGroupHead(e.target.closest('.cat-group'));
            syncCount();
            markDirty();
        } else if (e.target.classList.contains('cat-toggle')) {
            const cat = e.target.dataset.cat;
            const on = e.target.checked;
            e.target.closest('.cat-group').querySelectorAll('.prod-toggle').forEach(cb => {
                cb.checked = on;
                on ? selected.add(cb.value) : selected.delete(cb.value);
            });
            refreshGroupHead(e.target.closest('.cat-group'));
            syncCount();
            markDirty();
        }
    });

    function refreshGroupHead(group) {
        if (!group) return;
        const boxes = [...group.querySelectorAll('.prod-toggle')];
        const on = boxes.filter(b => b.checked).length;
        group.querySelector('.cat-count').textContent = `(${on}/${boxes.length})`;
        group.querySelector('.cat-toggle').checked = on === boxes.length;
    }

    searchInput.addEventListener('input', renderProducts);

    clearBtn.addEventListener('click', () => {
        if (!selected.size) return;
        if (!confirm('לנקות את כל הבחירה? כל הקטלוג יהפוך לגלוי לרשת.')) return;
        selected.clear();
        renderProducts();
        syncCount();
        markDirty();
    });

    // ===================== טעינה ושמירה =====================

    function loadCatalog() {
        Papa.parse(CATALOG_URL + '?v=' + Date.now(), {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                catalog = (results.data || [])
                    .map(r => ({
                        id: (r.id || '').trim(),
                        name: (r.name || '').trim(),
                        category: (r.category || '').trim(),
                        image: (r.image || '').trim()
                    }))
                    .filter(r => r.id && r.name);
                renderProducts();
                syncCount();
            },
            error: () => {
                productList.innerHTML = '<p style="padding:20px; color:#c0554d;">טעינת הקטלוג הראשי נכשלה.</p>';
            }
        });
    }

    function loadChain() {
        fetch(CHAIN_URL + '?v=' + Date.now())
            .then(r => r.ok ? r.json() : { malls: [], products: [] })
            .then(data => {
                malls = (data.malls || []).map(m => ({ name: m.name || '', stores: m.stores || [] }));
                street = (data.stores || []).slice();
                selected = new Set((data.products || []).map(String));
                renderMalls();
                renderStreet();
                renderProducts();
                syncCount();
            })
            .catch(() => {
                // קובץ חסר או פגום — מתחילים ריק במקום להשאיר עמוד תקוע
                renderMalls();
                renderStreet();
                syncCount();
                showToast('לא נמצא קובץ סניפים קיים — מתחילים מחדש', 'error');
            });
    }

    saveBtn.addEventListener('click', () => {
        // ניקוי לפני שליחה: שמות ריקים לא נשמרים, וכך שורה שנוספה בטעות נעלמת
        const payload = {
            malls: malls
                .map(m => ({ name: m.name.trim(), stores: m.stores.map(s => s.trim()).filter(Boolean) }))
                .filter(m => m.name),
            stores: street.map(s => s.trim()).filter(Boolean),
            products: [...selected]
        };

        const emptyMalls = payload.malls.filter(m => !m.stores.length).map(m => m.name);
        if (emptyMalls.length && !confirm(`למרכזים הבאים אין אף חנות ולכן לא ניתן יהיה לבחור בהם: ${emptyMalls.join(', ')}\nלשמור בכל זאת?`)) return;

        saveBtn.disabled = true;
        stateEl.textContent = 'שומר...';
        fetch('/api/chain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(r => r.json())
            .then(res => {
                saveBtn.disabled = false;
                if (!res.success) throw new Error(res.error || 'שגיאה');
                saveBtn.classList.remove('has-unsaved');
                stateEl.textContent = '';
                // מציגים חזרה את מה שהשרת באמת שמר (אחרי ניקוי וכפילויות)
                malls = payload.malls;
                street = payload.stores;
                renderMalls();
                renderStreet();
                showToast(`נשמר: ${res.malls} מרכזי קניות, ${res.stores} חנויות רחוב, ${res.products} מוצרים גלויים`);
            })
            .catch(err => {
                saveBtn.disabled = false;
                stateEl.textContent = 'השמירה נכשלה';
                showToast('השמירה נכשלה: ' + err.message, 'error');
            });
    });

    window.addEventListener('beforeunload', (e) => {
        if (saveBtn.classList.contains('has-unsaved')) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    loadChain();
    loadCatalog();
});
