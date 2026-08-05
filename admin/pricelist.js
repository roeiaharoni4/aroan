document.addEventListener('DOMContentLoaded', () => {
    // Security layer: Block access if not running locally
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        alert('הגישה למערכת הניהול מותרת רק מהמחשב המקומי.');
        window.location.href = '../index.html';
        return;
    }

    let products = [];

    // אותו עורך משרת שני מחירונים נפרדים לחלוטין. הקטלוג נבחר מ-?catalog= בכתובת
    // ומועבר לשרת באותו פרמטר, כדי ששמירה תיכתב תמיד לקבצים הנכונים.
    const CATALOGS = {
        care: {
            label: 'מחירון טיפוח',
            master: '/data/pricelist-master.csv',
            public: '/data/pricelist.csv',
            promo: '/data/pricelist-promo.json',
            shipping: '/data/care-shipping.json',
            sheetKey: 'aroam_pricelist_sheet_url',
            site: '/care/'
        },
        committee: {
            label: 'מחירון ועד עובדים',
            master: '/data/committee-master.csv',
            public: '/data/committee.csv',
            promo: '/data/committee-promo.json',
            shipping: '/data/committee-shipping.json',
            sheetKey: 'aroam_committee_sheet_url',
            site: '/emp-8c3f5a/'
        }
    };
    const CATALOG_KEY = CATALOGS[new URLSearchParams(location.search).get('catalog')] ? new URLSearchParams(location.search).get('catalog') : 'care';
    const CATALOG = CATALOGS[CATALOG_KEY];
    const API_SUFFIX = '?catalog=' + CATALOG_KEY;

    // הקובץ המלא (עם עלות) קיים רק מקומית; אם חסר — נופלים לקובץ הציבורי בלי עלויות
    const MASTER_URL = CATALOG.master + '?v=' + Date.now();
    const PUBLIC_URL = CATALOG.public + '?v=' + Date.now();

    // UI Elements
    const tbody = document.getElementById('products-tbody');
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const addBtn = document.getElementById('add-product-btn');
    const saveAllBtn = document.getElementById('save-all-btn');
    const csvFileInput = document.getElementById('csv-file-input');
    const matchImagesBtn = document.getElementById('match-images-btn');
    const bulkSaleBtn = document.getElementById('bulk-sale-btn');
    const selectAllCb = document.getElementById('select-all');
    const selectedCountEl = document.getElementById('selected-count');
    const selectedIds = new Set(); // מוצרים מסומנים למבצע קבוצתי

    // Modal
    const modal = document.getElementById('product-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-modal-btn');
    const form = document.getElementById('product-form');

    // Form inputs
    const originalIdInput = document.getElementById('original-id');
    const idInput = document.getElementById('prod-id');
    const nameInput = document.getElementById('prod-name');
    const catInput = document.getElementById('prod-category');
    const unitInput = document.getElementById('prod-unit');
    const brandInput = document.getElementById('prod-brand');
    const brandList = document.getElementById('brand-list');
    const costInput = document.getElementById('prod-cost');
    const priceInput = document.getElementById('prod-price');
    const marginInput = document.getElementById('prod-margin');
    const netMarginInput = document.getElementById('prod-net-margin');
    const salePriceInput = document.getElementById('prod-sale-price');
    const bundleInput = document.getElementById('prod-bundle');
    const promoStartInput = document.getElementById('prod-promo-start');
    const promoEndInput = document.getElementById('prod-promo-end');

    // נירמול מבצע חבילה ותאריכים (זהה לוולידציה בשרת)
    function cleanBundle(v) {
        const s = String(v || '').replace(/\s/g, '');
        const m = /^(\d{1,2})\+(\d{1,2})$/.exec(s);
        if (!m) return '';
        const buy = parseInt(m[1], 10), free = parseInt(m[2], 10);
        return (buy >= 1 && free >= 1) ? `${buy}+${free}` : '';
    }

    function cleanDate(v) {
        const s = String(v || '').trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
    }
    const descInput = document.getElementById('prod-description');

    const fileInput = document.getElementById('prod-image-file');
    const urlInput = document.getElementById('prod-image-url');
    const imgPreview = document.getElementById('image-preview');

    const categoryList = document.getElementById('category-list');

    // CSV modal
    const csvModal = document.getElementById('csv-modal');
    const csvSummary = document.getElementById('csv-summary');
    const csvChanges = document.getElementById('csv-changes');
    let pendingImport = null;

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function imgPath(src) {
        // נתיבי תמונות ב-CSV הם יחסיים לשורש האתר; מהתיקייה admin צריך '/' בהתחלה
        if (!src) return '';
        if (src.startsWith('/') || src.startsWith('http') || src.startsWith('data:')) return src;
        return '/' + src;
    }

    function toNum(v) {
        if (v === null || v === undefined) return NaN;
        const cleaned = String(v).replace(/[₪%,\s]/g, '');
        if (cleaned === '') return NaN;
        return parseFloat(cleaned);
    }

    function marginOf(cost, price) {
        // רווח מהעלות: (מכירה - עלות) / עלות. בלי מחיר מכירה (0) אין רווח להציג
        if (!(cost > 0) || !(price > 0)) return NaN;
        return (price - cost) / cost * 100;
    }

    // הנחות הקטגוריה של המחירון — נטענות מקובץ המבצעים ומשפיעות על המחיר בפועל
    let categoryDiscounts = []; // [{category, percent, starts, ends}]

    // מע"מ בישראל (18% מ-1.1.2025). לעדכן כאן אם השיעור משתנה.
    const VAT_RATE = 0.18;

    // הרווח בפועל: מחירי המכירה באתר כוללים מע"מ, ולכן מנכים אותו לפני
    // ההשוואה לעלות. תקף כשהעלות שהוזנה היא לפני מע"מ (כמו בחשבונית ספק);
    // אם גם העלות כוללת מע"מ — המע"מ מתקזז והתוצאה זהה ל-marginOf.
    function netMarginOf(cost, price) {
        if (!(cost > 0) || !(price > 0)) return NaN;
        return (price / (1 + VAT_RATE) - cost) / cost * 100;
    }

    // המחיר שהלקוח באמת משלם ליחידה, אחרי כל המבצעים שחלים על המוצר עצמו:
    // מחיר מבצע פרטני, הנחת קטגוריה ומבצע חבילה (ב-1+1 מקבלים תשלום על
    // מחצית מהיחידות). הנחת סל לא נכללת — היא תלויה בכל ההזמנה ולא במוצר.
    // אותם כללים ואותו עיגול כמו ב-app.js, כדי שהמספר יתאים למה שרואים בעמוד.
    function effectivePriceOf(p) {
        const regular = toNum(p.price);
        if (!(regular > 0)) return { price: NaN, reasons: [] };

        const reasons = [];
        let price = regular;

        const sale = toNum(p.sale_price);
        if (sale > 0 && sale < regular) { price = sale; reasons.push('מחיר מבצע'); }

        const rule = categoryDiscounts.find(r => r.category === p.category && r.percent > 0);
        if (rule) {
            price = Math.round(price * (1 - rule.percent / 100) * 10) / 10;
            reasons.push(`הנחת קטגוריה ${rule.percent}%`);
        }

        const b = /^(\d+)\+(\d+)$/.exec(cleanBundle(p.bundle));
        if (b) {
            const buy = +b[1], free = +b[2];
            price = price * buy / (buy + free);
            reasons.push(`חבילה ${buy}+${free}`);
        }

        return { price, reasons };
    }

    // Load Data
    loadProducts();

    function loadProducts() {
        parseCsvUrl(MASTER_URL, (rows) => {
            if (rows) {
                setProducts(rows);
            } else {
                // אין קובץ מקומי — טוענים את הציבורי (בלי עלויות)
                parseCsvUrl(PUBLIC_URL, (pubRows) => {
                    if (pubRows) {
                        setProducts(pubRows);
                        showToast('נטען הקובץ הציבורי — מחירי העלות חסרים במחשב זה', 'error');
                    } else {
                        setProducts([]);
                    }
                });
            }
        });
    }

    function parseCsvUrl(url, cb) {
        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => cb(results.data && results.data.length ? results.data : (results.data || [])),
            error: () => cb(null)
        });
    }

    function setProducts(rows) {
        products = rows.map(item => ({
            id: (item.id || '').trim(),
            name: (item.name || '').trim(),
            category: (item.category || '').trim(),
            unit: (item.unit || 'יחידה').trim(),
            brand: (item.brand || '').trim(),
            image: (item.image || '').trim(),
            cost: item.cost !== undefined && item.cost !== '' ? toNum(item.cost) || 0 : '',
            price: toNum(item.price) || 0,
            sale_price: item.sale_price !== undefined && item.sale_price !== '' ? toNum(item.sale_price) || '' : '',
            bundle: cleanBundle(item.bundle),
            promo_start: cleanDate(item.promo_start),
            promo_end: cleanDate(item.promo_end),
            // ברירת מחדל: מוצג. רק '0' מפורש = מוסתר (לא עולה לאתר)
            active: String(item.active).trim() === '0' ? '0' : '1',
            description: (item.description || '').trim()
        })).filter(p => p.id && p.name);

        renderTable();
        updateCategoryDatalist();
    }

    function renderTable(filter = '') {
        tbody.innerHTML = '';
        const q = filter.toLowerCase();
        const catSel = categoryFilter ? categoryFilter.value : '';

        products.forEach(p => {
            if (catSel && p.category !== catSel) return;
            if (filter && !p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) return;

            const tr = document.createElement('tr');
            const hidden = p.active === '0';
            if (hidden) tr.style.opacity = '0.45';

            let imgSrc = imgPath(p.image);
            if (!imgSrc) imgSrc = '../images/logo.png';

            const cost = toNum(p.cost);
            const price = toNum(p.price);
            // הרווח מחושב על המחיר שהלקוח באמת משלם — אחרת מוצר במבצע היה
            // מציג רווח גבוה ממה שהוא מכניס בפועל
            const eff = effectivePriceOf(p);
            const onPromo = eff.reasons.length > 0 && eff.price < price;
            const m = marginOf(cost, onPromo ? eff.price : price);
            const nm = netMarginOf(cost, onPromo ? eff.price : price);
            const promoTip = onPromo ? ` title="הרווח מחושב על ${eff.price.toFixed(2)} ₪ — ${eff.reasons.join(' + ')}"` : '';
            const beforeTag = (onPromo && !isNaN(marginOf(cost, price)))
                ? `<div style="color:#999; font-size:0.72rem;">לפני המבצע ${marginOf(cost, price).toFixed(0)}%</div>` : '';

            // תגי מבצע חבילה ותוקף בעמודת "מחיר מבצע" — כדי לראות במבט מה מוגדר
            const bundleTag = cleanBundle(p.bundle)
                ? ` <span style="background:#639C7D;color:#fff;border-radius:4px;padding:1px 6px;font-size:0.75rem;">${esc(cleanBundle(p.bundle))}</span>`
                : '';
            const endTag = cleanDate(p.promo_end)
                ? ` <span style="color:#888;font-size:0.72rem;">עד ${esc(cleanDate(p.promo_end).split('-').reverse().join('.'))}</span>`
                : '';

            tr.innerHTML = `
                <td><input type="checkbox" class="row-select" data-id="${esc(p.id)}" ${selectedIds.has(p.id) ? 'checked' : ''}></td>
                <td class="td-img"><img src="${esc(imgSrc)}" onerror="this.src='../images/logo.png'"></td>
                <td>${esc(p.id)}${hidden ? ' <span style="background:#eee;color:#888;border-radius:4px;padding:1px 6px;font-size:0.75rem;">מוסתר</span>' : ''}</td>
                <td>${esc(p.name)}</td>
                <td>${esc(p.category)}</td>
                <td>${esc(p.unit)}</td>
                <td>${isNaN(cost) ? '—' : cost.toFixed(2)}</td>
                <td>${price > 0 ? price.toFixed(2) : '<span style="background:#fff4e5;color:#7a4a00;border-radius:4px;padding:1px 6px;font-size:0.75rem;" title="מוצר בלי מחיר מכירה לא נכתב לקובץ הציבורי ולא יופיע בעמוד">חסר מחיר</span>'}</td>
                <td${promoTip}>${isNaN(m) ? '—' : m.toFixed(1) + '%'}${beforeTag}</td>
                <td${promoTip || ' title="הרווח בפועל, אחרי ניכוי מע״מ ממחיר המכירה"'}>${isNaN(nm) ? '—' : '<b style="color:' + (nm < 0 ? '#c0554d' : '#2e7d52') + ';">' + nm.toFixed(1) + '%</b>'}</td>
                <td>${isNaN(toNum(p.sale_price)) ? (bundleTag || endTag ? '' : '—') : '<b style="color:#c0554d;">' + toNum(p.sale_price).toFixed(2) + '</b>'}${bundleTag}${endTag}</td>
                <td class="action-btns">
                    <button class="toggle-btn" title="${hidden ? 'הצג באתר' : 'הסתר מהאתר (נגמר במלאי)'}" data-id="${esc(p.id)}">${hidden ? '🚫' : '👁️'}</button>
                    <button class="edit-btn" title="ערוך" data-id="${esc(p.id)}">✏️</button>
                    <button class="delete-btn" title="מחק" data-id="${esc(p.id)}">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.onclick = () => toggleActive(btn.dataset.id);
        });
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.onclick = () => openEditModal(btn.dataset.id);
        });
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = () => deleteProduct(btn.dataset.id);
        });
        document.querySelectorAll('.row-select').forEach(cb => {
            cb.onchange = () => {
                if (cb.checked) selectedIds.add(cb.dataset.id);
                else selectedIds.delete(cb.dataset.id);
                updateSelectedCount();
            };
        });
        updateSelectedCount();
    }

    function updateSelectedCount() {
        // מנקים מזהים של מוצרים שנמחקו
        const existing = new Set(products.map(p => p.id));
        [...selectedIds].forEach(id => { if (!existing.has(id)) selectedIds.delete(id); });
        selectedCountEl.textContent = selectedIds.size;
    }

    // בחר/נקה את כל המוצרים המוצגים כרגע בטבלה (מכבד סינון חיפוש)
    selectAllCb.onchange = () => {
        document.querySelectorAll('.row-select').forEach(cb => {
            cb.checked = selectAllCb.checked;
            if (cb.checked) selectedIds.add(cb.dataset.id);
            else selectedIds.delete(cb.dataset.id);
        });
        updateSelectedCount();
    };

    function updateCategoryDatalist() {
        const categories = [...new Set(products.map(p => p.category))].filter(c => c);
        categoryList.innerHTML = '';
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            categoryList.appendChild(opt);
        });

        // עדכון תפריט הסינון לפי קטגוריה (שומר על הבחירה הנוכחית)
        if (categoryFilter) {
            const current = categoryFilter.value;
            categoryFilter.innerHTML = '<option value="">כל הקטגוריות</option>';
            categories.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                categoryFilter.appendChild(opt);
            });
            categoryFilter.value = categories.includes(current) ? current : '';
        }

        // הצעות מותגים במודאל העריכה
        if (brandList) {
            const brands = [...new Set(products.map(p => p.brand))].filter(b => b).sort();
            brandList.innerHTML = '';
            brands.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b;
                brandList.appendChild(opt);
            });
        }

        // תפריט הקטגוריות בהנחת קטגוריה (מבצעים כלליים)
        const catDiscountSelect = document.getElementById('cat-discount-select');
        if (catDiscountSelect) {
            const current = catDiscountSelect.value;
            catDiscountSelect.innerHTML = '';
            categories.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                catDiscountSelect.appendChild(opt);
            });
            if (categories.includes(current)) catDiscountSelect.value = current;
        }
    }

    // Search + Category filter
    searchInput.addEventListener('input', (e) => renderTable(e.target.value));
    if (categoryFilter) categoryFilter.addEventListener('change', () => renderTable(searchInput.value));

    // --- חישוב תלת-כיווני: עלות / מכירה / אחוז רווח ---
    // הזנת כל שניים מחשבת את השלישי. רווח מהעלות: מכירה = עלות × (1 + רווח/100)
    costInput.addEventListener('input', () => {
        const cost = toNum(costInput.value);
        const price = toNum(priceInput.value);
        const margin = toNum(marginInput.value);
        if (!isNaN(cost) && !isNaN(price)) {
            const m = marginOf(cost, price);
            marginInput.value = isNaN(m) ? '' : m.toFixed(1);
        } else if (!isNaN(cost) && !isNaN(margin)) {
            priceInput.value = (cost * (1 + margin / 100)).toFixed(2);
        }
    });

    priceInput.addEventListener('input', () => {
        const cost = toNum(costInput.value);
        const price = toNum(priceInput.value);
        const margin = toNum(marginInput.value);
        if (!isNaN(price) && !isNaN(cost)) {
            const m = marginOf(cost, price);
            marginInput.value = isNaN(m) ? '' : m.toFixed(1);
        } else if (!isNaN(price) && !isNaN(margin) && margin > -100) {
            costInput.value = (price / (1 + margin / 100)).toFixed(2);
        }
    });

    marginInput.addEventListener('input', () => {
        const cost = toNum(costInput.value);
        const price = toNum(priceInput.value);
        const margin = toNum(marginInput.value);
        if (isNaN(margin)) return;
        if (!isNaN(cost)) {
            priceInput.value = (cost * (1 + margin / 100)).toFixed(2);
        } else if (!isNaN(price) && margin > -100) {
            costInput.value = (price / (1 + margin / 100)).toFixed(2);
        }
    });

    // שדה "רווח נטו" הוא לקריאה בלבד ומתעדכן מכל שינוי בטופס. מאזין אחד על
    // הטופס במקום שלושה — הוא רץ אחרי המאזינים של עלות/מכירה/רווח לאותו אירוע.
    function syncNetMargin() {
        if (!netMarginInput) return;
        const nm = netMarginOf(toNum(costInput.value), toNum(priceInput.value));
        netMarginInput.value = isNaN(nm) ? '' : nm.toFixed(1) + '%';
        netMarginInput.style.color = (!isNaN(nm) && nm < 0) ? '#c0554d' : '#555';
        syncEffectiveNote();
    }
    form.addEventListener('input', syncNetMargin);

    // שדות הרווח שלמעלה מתייחסים למחיר הרגיל. כשחל על המוצר מבצע, מוסיפים
    // כאן את הרווח על המחיר שהלקוח באמת ישלם — זה המספר שקובע.
    const effectiveNote = document.getElementById('effective-margin-note');
    function syncEffectiveNote() {
        if (!effectiveNote) return;
        const cost = toNum(costInput.value);
        const eff = effectivePriceOf({
            price: priceInput.value,
            sale_price: salePriceInput.value,
            bundle: bundleInput.value,
            category: catInput.value
        });
        const regular = toNum(priceInput.value);
        if (!(cost > 0) || isNaN(eff.price) || !eff.reasons.length || !(eff.price < regular)) {
            effectiveNote.style.display = 'none';
            return;
        }
        const m = marginOf(cost, eff.price), nm = netMarginOf(cost, eff.price);
        effectiveNote.style.display = 'block';
        effectiveNote.innerHTML = `בפועל הלקוח משלם <b>${eff.price.toFixed(2)} ₪</b> (${eff.reasons.join(' + ')}) — ` +
            `רווח <b>${m.toFixed(1)}%</b> · רווח נטו <b>${nm.toFixed(1)}%</b>`;
    }

    // Modal logic
    addBtn.onclick = () => openAddModal();
    closeBtn.onclick = () => modal.classList.remove('active');
    cancelBtn.onclick = () => modal.classList.remove('active');

    function nextAutoId() {
        let max = 0;
        products.forEach(p => {
            const match = /^PL(\d+)$/.exec(p.id);
            if (match) max = Math.max(max, parseInt(match[1], 10));
        });
        return 'PL' + String(max + 1).padStart(3, '0');
    }

    function openAddModal() {
        form.reset();
        originalIdInput.value = '';
        idInput.value = nextAutoId();
        imgPreview.style.display = 'none';
        imgPreview.src = '';
        syncNetMargin();
        document.getElementById('modal-title').textContent = 'הוספת מוצר חדש';
        modal.classList.add('active');
    }

    function openEditModal(id) {
        const p = products.find(prod => prod.id === id);
        if (!p) return;

        originalIdInput.value = p.id;
        idInput.value = p.id;
        nameInput.value = p.name;
        catInput.value = p.category;
        unitInput.value = p.unit;
        brandInput.value = p.brand || '';
        costInput.value = p.cost === '' || isNaN(toNum(p.cost)) ? '' : toNum(p.cost);
        priceInput.value = p.price;
        const m = marginOf(toNum(p.cost), toNum(p.price));
        marginInput.value = isNaN(m) ? '' : m.toFixed(1);
        salePriceInput.value = isNaN(toNum(p.sale_price)) ? '' : toNum(p.sale_price);
        bundleInput.value = cleanBundle(p.bundle);
        promoStartInput.value = cleanDate(p.promo_start);
        promoEndInput.value = cleanDate(p.promo_end);
        descInput.value = p.description || '';
        urlInput.value = p.image;
        // אחרי שכל השדות מלאים — אחרת חישוב הרווח בפועל רץ בלי מחיר המבצע
        syncNetMargin();

        if (p.image) {
            imgPreview.src = imgPath(p.image);
            imgPreview.style.display = 'block';
        } else {
            imgPreview.style.display = 'none';
        }

        document.getElementById('modal-title').textContent = 'עריכת מוצר';
        modal.classList.add('active');
    }

    // Image Upload Logic (Base64)
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            imgPreview.src = e.target.result;
            imgPreview.style.display = 'block';
            uploadImage(file.name, e.target.result);
        };
        reader.readAsDataURL(file);
    });

    async function uploadImage(filename, dataUrl) {
        try {
            const safeFilename = Date.now() + '_' + filename.replace(/[^a-zA-Z0-9.-]/g, '_');

            const res = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: safeFilename,
                    data: dataUrl
                })
            });
            const result = await res.json();
            if (result.success) {
                urlInput.value = result.path;
                showToast('התמונה הועלתה בהצלחה', 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (e) {
            console.error(e);
            showToast('שגיאה בהעלאת התמונה', 'error');
        }
    }

    urlInput.addEventListener('input', () => {
        if (urlInput.value) {
            imgPreview.src = urlInput.value;
            imgPreview.style.display = 'block';
        } else {
            imgPreview.style.display = 'none';
        }
    });

    // Save Form
    document.getElementById('save-modal-btn').onclick = () => {
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const salePrice = salePriceInput.value === '' ? '' : toNum(salePriceInput.value) || 0;
        const regularPrice = toNum(priceInput.value) || 0;
        if (salePrice !== '' && salePrice >= regularPrice) {
            alert('מחיר המבצע חייב להיות נמוך ממחיר המכירה הרגיל.');
            return;
        }

        const promoStart = cleanDate(promoStartInput.value);
        const promoEnd = cleanDate(promoEndInput.value);
        if (promoStart && promoEnd && promoStart > promoEnd) {
            alert('תאריך תחילת המבצע חייב להיות לפני תאריך הסיום.');
            return;
        }

        const newProduct = {
            id: idInput.value.trim(),
            name: nameInput.value.trim(),
            category: catInput.value.trim(),
            unit: unitInput.value.trim() || 'יחידה',
            brand: brandInput.value.trim(),
            image: urlInput.value.trim(),
            cost: costInput.value === '' ? '' : toNum(costInput.value) || 0,
            price: regularPrice,
            sale_price: salePrice,
            bundle: cleanBundle(bundleInput.value),
            promo_start: promoStart,
            promo_end: promoEnd,
            // שומר על מצב ההסתרה הקיים בעריכה; מוצר חדש מוצג כברירת מחדל
            active: (products.find(p => p.id === originalIdInput.value) || {}).active === '0' ? '0' : '1',
            description: descInput.value.trim()
        };

        const originalId = originalIdInput.value;

        if (originalId) {
            const index = products.findIndex(p => p.id === originalId);
            if (index > -1) {
                products[index] = newProduct;
            }
        } else {
            if (products.find(p => p.id === newProduct.id)) {
                alert('מוצר עם מק״ט זה כבר קיים!');
                return;
            }
            products.unshift(newProduct);
        }

        modal.classList.remove('active');
        renderTable(searchInput.value);
        updateCategoryDatalist();
        showToast('המוצר נשמר. אל תשכח ללחוץ על "שמור שינויים" כדי לעדכן את הקבצים.', 'success');
    };

    function deleteProduct(id) {
        if (confirm('האם אתה בטוח שברצונך למחוק מוצר זה?')) {
            products = products.filter(p => p.id !== id);
            renderTable(searchInput.value);
            showToast('המוצר נמחק. אל תשכח ללחוץ על "שמור שינויים".', 'success');
        }
    }

    // הסתרה/הצגה של מוצר: מוסתר לא עולה לאתר (נגמר במלאי), אך נשמר לשחזור עתידי
    function toggleActive(id) {
        const p = products.find(prod => prod.id === id);
        if (!p) return;
        p.active = p.active === '0' ? '1' : '0';
        renderTable(searchInput.value);
        const msg = p.active === '0'
            ? 'המוצר הוסתר — לא יופיע באתר. אל תשכח ללחוץ על "שמור שינויים".'
            : 'המוצר הוצג שוב. אל תשכח ללחוץ על "שמור שינויים".';
        showToast(msg, 'success');
    }

    // --- ייבוא CSV: זיהוי כותרות גמיש + מיזוג לפי מזהה/שם עם תצוגה מקדימה ---
    const HEADER_ALIASES = {
        id: ['id', 'מזהה', 'מק"ט', 'מק״ט', 'מקט', 'sku', 'קוד', 'קוד מוצר', 'קוד פריט', 'פריט', 'מספר פריט'],
        name: ['name', 'שם', 'שם מוצר', 'שם המוצר', 'מוצר', 'שם פריט', 'תאור פריט', 'תיאור פריט'],
        category: ['category', 'קטגוריה', 'קבוצה', 'מחלקה'],
        unit: ['unit', 'יחידה', 'יחידת מידה', 'יח'],
        brand: ['brand', 'מותג', 'יצרן'],
        image: ['image', 'img', 'תמונה', 'נתיב תמונה'],
        // "מחיר" לבד = עלות (כך בגיליון של רועי); מחיר המכירה מגיע מ"מחיר מכירה"/"מכירה"
        cost: ['cost', 'עלות', 'מחיר עלות', 'מחיר קניה', 'מחיר קנייה', 'עלות ליחידה', 'מחיר'],
        price: ['price', 'מכירה', 'מחיר מכירה', 'מחיר ללקוח', 'מחיר יחידה'],
        sale_price: ['sale_price', 'sale', 'מבצע', 'מחיר מבצע', 'מחיר במבצע'],
        margin: ['margin', 'רווח', 'אחוז רווח', 'רווח %', '% רווח', 'אחוז'],
        bundle: ['bundle', 'חבילה', 'מבצע חבילה', '1+1', 'מארז'],
        promo_start: ['promo_start', 'תוקף מתאריך', 'תחילת מבצע', 'מתאריך'],
        promo_end: ['promo_end', 'תוקף עד', 'סוף מבצע', 'עד תאריך'],
        description: ['description', 'תיאור', 'הערות', 'פירוט']
    };

    const FIELD_NAMES = { id: 'מק"ט', name: 'שם', category: 'קטגוריה', unit: 'יחידה', brand: 'מותג', image: 'תמונה', cost: 'עלות', price: 'מכירה', sale_price: 'מבצע', margin: 'רווח %', bundle: 'חבילה', promo_start: 'תוקף מתאריך', promo_end: 'תוקף עד', description: 'תיאור' };

    function normalizeHeader(h) {
        return String(h || '').trim().toLowerCase().replace(/["'״׳]/g, '"').replace(/\s+/g, ' ');
    }

    function mapHeaders(fields) {
        const mapping = {}; // csv header -> canonical field
        const taken = new Set();
        const normOf = s => normalizeHeader(s).replace(/"/g, '');

        // שני סבבים: קודם כותרות ספציפיות ("מחיר מכירה", "מחיר עלות"), אחר כך גנריות ("מחיר").
        // ככה בגיליון שיש בו גם "מחיר" וגם "מחיר מכירה" — המכירה נתפסת קודם.
        [true, false].forEach(specificOnly => {
            fields.forEach(f => {
                if (mapping[f] !== undefined) return;
                const n = normOf(f);
                for (const [canon, aliases] of Object.entries(HEADER_ALIASES)) {
                    if (taken.has(canon)) continue;
                    if (aliases.some(a => (!specificOnly || a.includes(' ')) && normOf(a) === n)) {
                        mapping[f] = canon;
                        taken.add(canon);
                        return;
                    }
                }
            });
        });

        return mapping;
    }

    // --- משיכה מגוגל שיטס: אותו מסלול מיזוג כמו העלאת קובץ, דרך proxy מקומי ב-server.py ---
    const sheetBtn = document.getElementById('sheet-import-btn');
    const SHEET_URL_KEY = CATALOG.sheetKey;
    const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Qklkzyyg0REk0MubDNRuI0Idju523et807rxi4MSwac/edit';

    sheetBtn.onclick = async (e) => {
        let url = localStorage.getItem(SHEET_URL_KEY) || DEFAULT_SHEET_URL;
        // Shift+לחיצה: החלפת כתובת הגיליון
        if (e.shiftKey) {
            const input = prompt('כתובת גיליון הגוגל שיטס (משותף לצפייה לכל מי שיש לו את הקישור):', url);
            if (input === null) return;
            url = input.trim();
        }
        const m = url.match(/\/d\/([A-Za-z0-9_-]{10,})/);
        if (!m) {
            showToast('כתובת גיליון לא תקינה', 'error');
            return;
        }
        localStorage.setItem(SHEET_URL_KEY, url);

        sheetBtn.disabled = true;
        try {
            const res = await fetch('/api/fetch-sheet?id=' + m[1] + '&_t=' + Date.now());
            let data;
            try {
                data = await res.json();
            } catch {
                // השרת החזיר HTML במקום JSON — כנראה רץ עם גרסה ישנה של server.py
                throw new Error('השרת רץ עם גרסה ישנה — סגור את חלון start_catalog.command, הפעל אותו מחדש ורענן את הדף');
            }
            if (!data.success) throw new Error(data.error);
            Papa.parse(data.csv, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => prepareImport(results)
            });
        } catch (err) {
            console.error(err);
            showToast('שגיאה במשיכת הגיליון: ' + err.message, 'error');
        } finally {
            sheetBtn.disabled = false;
        }
    };

    csvFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => prepareImport(results),
            error: () => showToast('שגיאה בקריאת הקובץ', 'error')
        });
        csvFileInput.value = '';
    });

    function prepareImport(results) {
        const fields = results.meta.fields || [];
        const mapping = mapHeaders(fields);
        const mapped = Object.values(mapping);

        if (!mapped.includes('name') && !mapped.includes('id')) {
            showToast('לא זוהו עמודות "שם" או "מק״ט" בקובץ', 'error');
            return;
        }

        const byId = new Map(products.map(p => [p.id, p]));
        const byName = new Map(products.map(p => [p.name, p]));

        const updates = []; // {target, changes: {field: [old, new]}}
        const additions = [];
        let skipped = 0;
        let autoIdCounter = 0;

        const nextImportId = () => {
            let max = 0;
            products.concat(additions).forEach(p => {
                const match = /^PL(\d+)$/.exec(p.id);
                if (match) max = Math.max(max, parseInt(match[1], 10));
            });
            return 'PL' + String(max + 1 + autoIdCounter++).padStart(3, '0');
        };

        results.data.forEach(rawRow => {
            // המרה לשדות קנוניים
            const row = {};
            for (const [header, canon] of Object.entries(mapping)) {
                const val = rawRow[header];
                // נירמול רווחים כפולים — מגיע ככה מהגיליון של רועי
                const clean = String(val ?? '').replace(/\s+/g, ' ').trim();
                if (clean !== '') row[canon] = clean;
            }
            if (Object.keys(row).length === 0) return;

            // השלמת מחיר חסר משני הנתונים האחרים (רווח מהעלות)
            const cost = toNum(row.cost);
            const price = toNum(row.price);
            const margin = toNum(row.margin);
            if (isNaN(price) && !isNaN(cost) && !isNaN(margin)) {
                row.price = (cost * (1 + margin / 100)).toFixed(2);
            }
            if (isNaN(cost) && !isNaN(price) && !isNaN(margin) && margin > -100) {
                row.cost = (price / (1 + margin / 100)).toFixed(2);
            }
            delete row.margin; // הרווח לא נשמר — הוא מחושב

            const target = (row.id && byId.get(row.id)) || (row.name && byName.get(row.name)) || null;

            if (target) {
                const changes = {};
                ['name', 'category', 'unit', 'brand', 'image', 'cost', 'price', 'sale_price', 'description'].forEach(f => {
                    if (row[f] === undefined) return;
                    const oldVal = String(target[f] ?? '');
                    let newVal = String(row[f]);
                    if (f === 'cost' || f === 'price' || f === 'sale_price') {
                        if (toNum(oldVal) === toNum(newVal)) return;
                        newVal = String(toNum(newVal));
                    } else if (oldVal === newVal) {
                        return;
                    }
                    changes[f] = [oldVal, newVal];
                });
                if (Object.keys(changes).length > 0) updates.push({ target, changes });
            } else if (row.name) {
                additions.push({
                    id: row.id || nextImportId(),
                    name: row.name,
                    category: row.category || 'כללי',
                    unit: row.unit || 'יחידה',
                    brand: row.brand || '',
                    image: row.image || '',
                    cost: row.cost !== undefined ? toNum(row.cost) : '',
                    price: row.price !== undefined ? toNum(row.price) || 0 : 0,
                    sale_price: row.sale_price !== undefined ? toNum(row.sale_price) || '' : '',
                    active: '1',
                    description: row.description || ''
                });
            } else {
                skipped++;
            }
        });

        if (updates.length === 0 && additions.length === 0) {
            showToast('לא נמצאו שינויים בקובץ' + (skipped ? ` (${skipped} שורות דולגו)` : ''), 'error');
            return;
        }

        pendingImport = { updates, additions };

        const mappingText = Object.entries(mapping).map(([h, c]) => `${h.trim()} ← ${FIELD_NAMES[c]}`).join(' | ');
        csvSummary.innerHTML = `${updates.length} מוצרים יעודכנו, ${additions.length} מוצרים חדשים יתווספו` + (skipped ? `, ${skipped} שורות דולגו` : '') +
            `<div style="font-weight:400; font-size:0.85rem; color:#888; margin-top:4px;">זיהוי עמודות: ${esc(mappingText)}</div>`;

        let html = '';
        updates.slice(0, 60).forEach(u => {
            const parts = Object.entries(u.changes).map(([f, [o, n]]) => `${FIELD_NAMES[f]}: ${esc(o) || '—'} ← ${esc(n)}`);
            html += `<div>🔄 <b>${esc(u.target.name)}</b> — ${parts.join(' | ')}</div>`;
        });
        additions.slice(0, 60).forEach(a => {
            html += `<div>➕ <b>${esc(a.name)}</b> (${esc(a.id)}) — עלות: ${a.cost === '' ? '—' : a.cost}, מכירה: ${a.price}</div>`;
        });
        const shown = Math.min(updates.length, 60) + Math.min(additions.length, 60);
        if (updates.length + additions.length > shown) {
            html += `<div style="color:#888;">... ועוד ${updates.length + additions.length - shown} שינויים</div>`;
        }
        csvChanges.innerHTML = html;
        csvModal.classList.add('active');
    }

    document.getElementById('close-csv-modal-btn').onclick = () => { csvModal.classList.remove('active'); pendingImport = null; };
    document.getElementById('cancel-csv-btn').onclick = () => { csvModal.classList.remove('active'); pendingImport = null; };

    document.getElementById('apply-csv-btn').onclick = () => {
        if (!pendingImport) return;
        pendingImport.updates.forEach(u => {
            Object.entries(u.changes).forEach(([f, [, n]]) => {
                u.target[f] = (f === 'cost' || f === 'price' || f === 'sale_price') ? toNum(n) : n;
            });
        });
        pendingImport.additions.forEach(a => products.push(a));
        pendingImport = null;
        csvModal.classList.remove('active');
        renderTable(searchInput.value);
        updateCategoryDatalist();
        showToast('המיזוג הוחל. אל תשכח ללחוץ על "שמור שינויים" כדי לעדכן את הקבצים.', 'success');
    };

    // --- מבצע קבוצתי: הנחה באחוזים על כל המוצרים המסומנים ---
    const bulkModal = document.getElementById('bulk-modal');
    const bulkPercentInput = document.getElementById('bulk-percent');

    bulkSaleBtn.onclick = () => {
        if (selectedIds.size === 0) {
            showToast('סמן קודם מוצרים בטבלה (העמודה הראשונה)', 'error');
            return;
        }
        document.getElementById('bulk-count').textContent = selectedIds.size;
        bulkPercentInput.value = '';
        document.getElementById('bulk-bundle').value = '';
        document.getElementById('bulk-promo-start').value = '';
        document.getElementById('bulk-promo-end').value = '';
        bulkModal.classList.add('active');
    };

    document.getElementById('close-bulk-modal-btn').onclick = () => bulkModal.classList.remove('active');
    document.getElementById('cancel-bulk-btn').onclick = () => bulkModal.classList.remove('active');

    document.getElementById('apply-bulk-sale-btn').onclick = () => {
        const pct = toNum(bulkPercentInput.value);
        if (isNaN(pct) || pct <= 0 || pct >= 100) {
            alert('הזן אחוז הנחה בין 1 ל-90');
            return;
        }
        let applied = 0, skipped = 0;
        products.forEach(p => {
            if (!selectedIds.has(p.id)) return;
            const price = toNum(p.price);
            if (!(price > 0)) { skipped++; return; }
            // עיגול לעשירית שקל
            p.sale_price = Math.round(price * (1 - pct / 100) * 10) / 10;
            applied++;
        });
        bulkModal.classList.remove('active');
        renderTable(searchInput.value);
        showToast(`הוחל מבצע ${pct}% על ${applied} מוצרים` + (skipped ? ` (${skipped} דולגו — בלי מחיר מכירה)` : '') + '. אל תשכח ללחוץ על "שמור שינויים".', 'success');
    };

    document.getElementById('clear-bulk-sale-btn').onclick = () => {
        let cleared = 0;
        products.forEach(p => {
            if (selectedIds.has(p.id) && p.sale_price !== '') { p.sale_price = ''; cleared++; }
        });
        bulkModal.classList.remove('active');
        renderTable(searchInput.value);
        showToast(`המבצע בוטל ל-${cleared} מוצרים. אל תשכח ללחוץ על "שמור שינויים".`, 'success');
    };

    // --- מבצע חבילה קבוצתי (1+1 / 2+1) לכל המוצרים המסומנים ---
    const bulkBundleSelect = document.getElementById('bulk-bundle');
    const bulkPromoStart = document.getElementById('bulk-promo-start');
    const bulkPromoEnd = document.getElementById('bulk-promo-end');

    document.getElementById('apply-bulk-bundle-btn').onclick = () => {
        const bundle = cleanBundle(bulkBundleSelect.value);
        if (!bundle) {
            alert('בחר מבצע חבילה (למשל 2+1)');
            return;
        }
        const start = cleanDate(bulkPromoStart.value);
        const end = cleanDate(bulkPromoEnd.value);
        if (start && end && start > end) {
            alert('תאריך תחילת המבצע חייב להיות לפני תאריך הסיום.');
            return;
        }
        let applied = 0;
        products.forEach(p => {
            if (!selectedIds.has(p.id)) return;
            p.bundle = bundle;
            p.promo_start = start;
            p.promo_end = end;
            applied++;
        });
        bulkModal.classList.remove('active');
        renderTable(searchInput.value);
        showToast(`הוחל מבצע ${bundle} על ${applied} מוצרים. אל תשכח ללחוץ על "שמור שינויים".`, 'success');
    };

    document.getElementById('clear-bulk-bundle-btn').onclick = () => {
        let cleared = 0;
        products.forEach(p => {
            if (selectedIds.has(p.id) && (p.bundle || p.promo_start || p.promo_end)) {
                p.bundle = ''; p.promo_start = ''; p.promo_end = '';
                cleared++;
            }
        });
        bulkModal.classList.remove('active');
        renderTable(searchInput.value);
        showToast(`מבצע החבילה בוטל ל-${cleared} מוצרים. אל תשכח ללחוץ על "שמור שינויים".`, 'success');
    };

    // --- מבצעים כלליים: באנר, הנחת סל והנחות קטגוריה (pricelist-promo.json) ---
    const bannerText = document.getElementById('banner-text');
    const bannerEnabled = document.getElementById('banner-enabled');
    const cartDiscountEnabled = document.getElementById('cart-discount-enabled');
    const cartDiscountMin = document.getElementById('cart-discount-min');
    const cartDiscountItems = document.getElementById('cart-discount-items');
    const cartDiscountPct = document.getElementById('cart-discount-pct');
    const catDiscountPct = document.getElementById('cat-discount-pct');
    const promoWindowStart = document.getElementById('promo-window-start');
    const promoWindowEnd = document.getElementById('promo-window-end');
    const bannerEnd = document.getElementById('banner-end');
    const cartDiscountEnd = document.getElementById('cart-discount-end');
    const catDiscountEnd = document.getElementById('cat-discount-end');
    const catDiscountsListEl = document.getElementById('cat-discounts-list');
    const savePromoBtn = document.getElementById('save-promo-btn');

    function renderCatDiscounts() {
        catDiscountsListEl.innerHTML = '';
        categoryDiscounts.forEach((rule, idx) => {
            const chip = document.createElement('span');
            chip.style.cssText = 'background:#fdeeee; color:#c0554d; border:1px solid #c0554d; border-radius:14px; padding:3px 10px; font-size:0.85rem; display:inline-flex; align-items:center; gap:6px;';
            chip.textContent = rule.ends
                ? `${rule.category} — ${rule.percent}% · עד ${cleanDate(rule.ends).split('-').reverse().join('.')}`
                : `${rule.category} — ${rule.percent}%`;
            const x = document.createElement('button');
            x.textContent = '✕';
            x.title = 'הסר הנחה';
            x.style.cssText = 'border:none; background:none; color:#c0554d; cursor:pointer; font-size:0.85rem; padding:0;';
            x.onclick = () => { categoryDiscounts.splice(idx, 1); renderCatDiscounts(); };
            chip.appendChild(x);
            catDiscountsListEl.appendChild(chip);
        });
    }

    fetch(CATALOG.promo + '?_t=' + Date.now())
        .then(r => r.ok ? r.json() : null)
        .then(p => {
            if (!p) return;
            bannerText.value = (p.banner && p.banner.text) || '';
            bannerEnabled.checked = !!(p.banner && p.banner.enabled);
            const cd = p.cart_discount || {};
            cartDiscountEnabled.checked = !!cd.enabled;
            if (cd.min_total > 0) cartDiscountMin.value = cd.min_total;
            if (cd.min_items > 0) cartDiscountItems.value = cd.min_items;
            if (cd.percent > 0) cartDiscountPct.value = cd.percent;
            categoryDiscounts = (p.category_discounts || [])
                .filter(r => r.category && r.percent > 0)
                .map(r => ({ category: r.category, percent: r.percent, starts: cleanDate(r.starts), ends: cleanDate(r.ends) }));
            const win = p.window || {};
            promoWindowStart.value = cleanDate(win.starts);
            promoWindowEnd.value = cleanDate(win.ends);
            bannerEnd.value = cleanDate((p.banner || {}).ends);
            cartDiscountEnd.value = cleanDate(cd.ends);
            renderCatDiscounts();
            // הנחות הקטגוריה משפיעות על עמודות הרווח — לרנדר מחדש עכשיו
            // שהן ידועות (הטבלה נבנתה לפני שהבקשה חזרה)
            if (categoryDiscounts.length) renderTable(searchInput.value);
        })
        .catch(() => { });

    document.getElementById('add-cat-discount-btn').onclick = () => {
        const category = document.getElementById('cat-discount-select').value;
        const pct = toNum(catDiscountPct.value);
        if (!category || isNaN(pct) || pct <= 0 || pct >= 100) {
            showToast('בחר קטגוריה והזן אחוז הנחה בין 1 ל-90', 'error');
            return;
        }
        categoryDiscounts = categoryDiscounts.filter(r => r.category !== category);
        categoryDiscounts.push({ category, percent: pct, starts: '', ends: cleanDate(catDiscountEnd.value) });
        catDiscountPct.value = '';
        catDiscountEnd.value = '';
        renderCatDiscounts();
        showToast('ההנחה נוספה לרשימה — לחץ "שמור מבצעים" כדי להחיל', 'success');
    };

    savePromoBtn.onclick = async () => {
        if (bannerEnabled.checked && !bannerText.value.trim()) {
            alert('כתוב טקסט לבאנר או בטל את הסימון "מוצג"');
            return;
        }
        if (cartDiscountEnabled.checked &&
            (!(toNum(cartDiscountPct.value) > 0) || (!(toNum(cartDiscountMin.value) > 0) && !(toNum(cartDiscountItems.value) > 0)))) {
            alert('להנחת סל פעילה צריך אחוז הנחה + סכום מינימום או כמות פריטים (לפחות אחד מהם)');
            return;
        }
        const winStart = cleanDate(promoWindowStart.value);
        const winEnd = cleanDate(promoWindowEnd.value);
        if (winStart && winEnd && winStart > winEnd) {
            alert('תאריך תחילת חלון המבצעים חייב להיות לפני תאריך הסיום.');
            return;
        }
        savePromoBtn.disabled = true;
        try {
            const res = await fetch('/api/promo' + API_SUFFIX, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    banner: {
                        enabled: bannerEnabled.checked,
                        text: bannerText.value.trim(),
                        starts: '',
                        ends: cleanDate(bannerEnd.value)
                    },
                    cart_discount: {
                        enabled: cartDiscountEnabled.checked,
                        min_total: toNum(cartDiscountMin.value) || 0,
                        min_items: toNum(cartDiscountItems.value) || 0,
                        percent: toNum(cartDiscountPct.value) || 0,
                        starts: '',
                        ends: cleanDate(cartDiscountEnd.value)
                    },
                    category_discounts: categoryDiscounts,
                    window: { starts: winStart, ends: winEnd }
                })
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            showToast('המבצעים נשמרו. (פרסום לאתר דורש git push)', 'success');
        } catch (e) {
            console.error(e);
            showToast('שגיאה בשמירת המבצעים: ' + e.message, 'error');
        } finally {
            savePromoBtn.disabled = false;
        }
    };

    // --- שיטות אספקה ודמי משלוח (care-shipping.json) ---
    const shippingRowsEl = document.getElementById('shipping-rows');
    const saveShippingBtn = document.getElementById('save-shipping-btn');
    // ברירת המחדל תואמת ל-SHIPPING_DEFAULTS ב-server.py — מוצגת גם כשהקובץ עוד לא נוצר
    let shippingMethods = [
        { id: 'route', label: 'משלוח עם מסלול החלוקה', enabled: true, fee: 0, free_above: 0, note: 'אור יהודה, בקעת אונו וגוש דן' },
        { id: 'pickup', label: 'איסוף עצמי', enabled: true, fee: 0, free_above: 0, note: 'בתיאום טלפוני מראש' },
        { id: 'locker', label: 'איסוף מלוקר', enabled: false, fee: 0, free_above: 0, note: '' },
        { id: 'home', label: 'משלוח עד הבית', enabled: false, fee: 0, free_above: 0, note: '' }
    ];

    function renderShippingRows() {
        shippingRowsEl.innerHTML = '';
        shippingMethods.forEach((m, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;';
            row.innerHTML = `
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; min-width:190px;">
                    <input type="checkbox" data-ship="enabled" data-idx="${idx}"${m.enabled ? ' checked' : ''}>
                    <strong>${m.label}</strong>
                </label>
                <span>דמי משלוח</span>
                <input type="number" data-ship="fee" data-idx="${idx}" min="0" step="0.5" value="${m.fee || ''}"
                    placeholder="0" style="width:80px; padding:6px 8px; border:1px solid #ddd; border-radius:6px;">
                <span>₪ · חינם מעל</span>
                <input type="number" data-ship="free_above" data-idx="${idx}" min="0" step="1" value="${m.free_above || ''}"
                    placeholder="ללא" style="width:90px; padding:6px 8px; border:1px solid #ddd; border-radius:6px;">
                <span>₪</span>
                <input type="text" data-ship="note" data-idx="${idx}" maxlength="120" value="${(m.note || '').replace(/"/g, '&quot;')}"
                    placeholder="הערה שתוצג ללקוח (אופציונלי)"
                    style="flex:1; min-width:180px; padding:6px 8px; border:1px solid #ddd; border-radius:6px;">
            `;
            shippingRowsEl.appendChild(row);
        });
    }

    shippingRowsEl.addEventListener('input', (e) => {
        const field = e.target.dataset.ship;
        if (!field) return;
        const m = shippingMethods[Number(e.target.dataset.idx)];
        if (!m) return;
        if (field === 'enabled') m.enabled = e.target.checked;
        else if (field === 'note') m.note = e.target.value;
        else m[field] = toNum(e.target.value) || 0;
    });

    fetch(CATALOG.shipping + '?_t=' + Date.now())
        .then(r => r.ok ? r.json() : null)
        .then(cfg => {
            const byId = new Map((cfg && cfg.methods || []).map(m => [m.id, m]));
            shippingMethods = shippingMethods.map(def => Object.assign({}, def, byId.get(def.id) || {}));
        })
        .catch(() => { })
        .finally(renderShippingRows);

    saveShippingBtn.onclick = async () => {
        const bad = shippingMethods.find(m => m.enabled && m.free_above > 0 && m.fee <= 0);
        if (bad) {
            alert(`ב"${bad.label}" הוגדר "חינם מעל" אבל דמי המשלוח הם 0 — הסף חסר משמעות.`);
            return;
        }
        saveShippingBtn.disabled = true;
        try {
            const res = await fetch('/api/shipping' + API_SUFFIX, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ methods: shippingMethods })
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);
            if (result.methods) { shippingMethods = result.methods; renderShippingRows(); }
            showToast('שיטות האספקה נשמרו. (פרסום לאתר דורש git push)', 'success');
        } catch (e) {
            console.error(e);
            showToast('שגיאה בשמירת שיטות האספקה: ' + e.message, 'error');
        } finally {
            saveShippingBtn.disabled = false;
        }
    };

    // --- התאמת תמונות אוטומטית: קובץ בתיקיית images ששמו = שם המוצר (או המק"ט) ---
    function normKey(s) {
        return String(s || '').toLowerCase().replace(/["'׳״`_\-–]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    matchImagesBtn.onclick = async () => {
        matchImagesBtn.disabled = true;
        try {
            const res = await fetch('/api/list-images');
            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            // אינדקס: שם קובץ (בלי סיומת ותיקייה) -> נתיב מלא
            const index = new Map();
            data.images.forEach(p => {
                const base = p.split('/').pop().replace(/\.[^.]+$/, '');
                const key = normKey(base);
                if (key && !index.has(key)) index.set(key, p);
            });

            let matched = 0;
            const missing = [];
            products.forEach(p => {
                if (p.image) return;
                const hit = index.get(normKey(p.name)) || index.get(normKey(p.id));
                if (hit) {
                    p.image = hit;
                    matched++;
                } else {
                    missing.push(p.name);
                }
            });

            renderTable(searchInput.value);
            if (matched > 0) {
                showToast(`הותאמו תמונות ל-${matched} מוצרים. אל תשכח ללחוץ על "שמור שינויים".`, 'success');
            } else {
                showToast('לא נמצאו התאמות חדשות. ודא ששם הקובץ זהה לשם המוצר או למק״ט.', 'error');
            }
            if (missing.length > 0) console.log('מוצרים שנשארו בלי תמונה:', missing);
        } catch (e) {
            console.error(e);
            showToast('שגיאה בקריאת רשימת התמונות', 'error');
        } finally {
            matchImagesBtn.disabled = false;
        }
    };

    // Save to Server (כותב את הקובץ המקומי המלא + הקובץ הציבורי בלי עלות)
    saveAllBtn.onclick = async () => {
        saveAllBtn.disabled = true;
        saveAllBtn.textContent = 'שומר...';

        try {
            const res = await fetch('/api/pricelist' + API_SUFFIX, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(products)
            });
            const result = await res.json();
            if (result.success) {
                showToast('המחירון עודכן בהצלחה! (זכור: פרסום לאתר דורש git push)', 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (e) {
            console.error(e);
            showToast('שגיאה בשמירת נתונים', 'error');
        } finally {
            saveAllBtn.disabled = false;
            saveAllBtn.textContent = 'שמור שינויים';
        }
    };

    function showToast(msg, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = 'toast ' + type + ' show';
        setTimeout(() => toast.className = 'toast', 3500);
    }

    // --- מתג המחירון ---
    const catalogSwitch = document.getElementById('catalog-switch');
    if (catalogSwitch) {
        catalogSwitch.value = CATALOG_KEY;
        catalogSwitch.addEventListener('change', () => {
            location.search = catalogSwitch.value === 'care' ? '' : '?catalog=' + catalogSwitch.value;
        });
    }
    document.title = CATALOG.label + ' | ניהול';

    // סימון המחירון הפעיל בתפריט הצד
    const activeNav = document.getElementById('nav-' + CATALOG_KEY);
    if (activeNav) activeNav.classList.add('active');

    // הקישור לצפייה בקטלוג מצביע על העמוד של המחירון הפעיל
    const viewLink = document.getElementById('view-catalog-link');
    if (viewLink) {
        viewLink.href = CATALOG.site;
        const label = document.getElementById('view-catalog-label');
        if (label) label.textContent = CATALOG_KEY === 'care' ? 'צפייה בקטלוג הטיפוח' : 'צפייה בעמוד הוועד';
    }

    // --- ייבוא מוצרים מהקטלוג העסקי הראשי (מחירון הוועד בלבד) ---
    // מחירון הטיפוח נבנה מגיליון נפרד ולא מהקטלוג העסקי, ולכן הכפתור מוסתר שם.
    const importCatalogBtn = document.getElementById('import-catalog-btn');
    if (importCatalogBtn && CATALOG_KEY === 'committee') {
        importCatalogBtn.style.display = '';
        importCatalogBtn.addEventListener('click', openCatalogImport);
    }

    let catalogRows = null;   // נטען פעם אחת בלחיצה הראשונה

    function openCatalogImport() {
        if (catalogRows) return showCatalogPicker();
        importCatalogBtn.disabled = true;
        importCatalogBtn.textContent = 'טוען...';
        parseCsvUrl('/data/products.csv?v=' + Date.now(), (rows) => {
            importCatalogBtn.disabled = false;
            importCatalogBtn.textContent = '📦 ייבוא מהקטלוג הראשי';
            if (!rows || !rows.length) return showToast('טעינת הקטלוג הראשי נכשלה', 'error');
            catalogRows = rows.filter(r => (r.id || '').trim() && (r.name || '').trim());
            showCatalogPicker();
        });
    }

    function showCatalogPicker() {
        const existing = new Set(products.map(p => p.id));
        let overlay = document.getElementById('catalog-import-modal');
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.id = 'catalog-import-modal';
        overlay.className = 'modal-overlay';
        overlay.style.cssText = 'display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center; padding:16px;';
        overlay.innerHTML = `
            <div class="modal-content" style="background:#fff; border-radius:10px; max-width:760px; width:100%; max-height:88vh; display:flex; flex-direction:column;">
                <div class="modal-header" style="padding:14px 18px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:1.1rem;">ייבוא מהקטלוג הראשי</h2>
                    <button type="button" id="ci-close" class="btn btn-outline">סגור</button>
                </div>
                <div style="padding:12px 18px; border-bottom:1px solid #eee; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                    <input type="text" id="ci-search" placeholder="חיפוש מוצר או קטגוריה..." style="flex:1; min-width:200px; padding:9px 10px; border:1px solid #ddd; border-radius:6px;">
                    <span id="ci-count" style="font-weight:700;">0 נבחרו</span>
                </div>
                <div id="ci-list" style="overflow-y:auto; padding:8px 18px; flex:1;"></div>
                <div style="padding:12px 18px; border-top:1px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                    <span style="font-size:0.85rem; color:#666;">המוצרים נוספים בלי מחיר — יש להשלים מחיר עלות ומכירה בכל אחד.</span>
                    <button type="button" id="ci-add" class="btn btn-primary">הוסף למחירון</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const listEl = overlay.querySelector('#ci-list');
        const searchEl = overlay.querySelector('#ci-search');
        const countEl = overlay.querySelector('#ci-count');
        const picked = new Set();

        function renderList() {
            const q = searchEl.value.trim().toLowerCase();
            const rows = catalogRows.filter(r => {
                if (!q) return true;
                return (r.name + ' ' + (r.category || '')).toLowerCase().includes(q);
            });
            listEl.innerHTML = rows.map(r => {
                const id = (r.id || '').trim();
                const already = existing.has(id);
                return `<label style="display:flex; gap:10px; align-items:center; padding:6px 0; border-bottom:1px solid #f2f2f2; ${already ? 'opacity:0.45;' : ''}">
                    <input type="checkbox" value="${esc(id)}" ${already ? 'disabled' : ''} ${picked.has(id) ? 'checked' : ''}>
                    <img src="${esc(imgPath(r.image))}" alt="" width="34" height="34" style="object-fit:contain; background:#fafafa; border-radius:4px;" onerror="this.style.visibility='hidden'">
                    <span style="flex:1;">${esc(r.name)}</span>
                    <span style="color:#888; font-size:0.85rem;">${esc(r.category || '')}</span>
                    ${already ? '<span style="color:#c0554d; font-size:0.8rem;">כבר במחירון</span>' : ''}
                </label>`;
            }).join('') || '<p style="padding:20px; text-align:center; color:#888;">אין תוצאות</p>';
        }

        function syncCount() { countEl.textContent = picked.size + ' נבחרו'; }

        listEl.addEventListener('change', (e) => {
            const cb = e.target;
            if (cb.tagName !== 'INPUT') return;
            cb.checked ? picked.add(cb.value) : picked.delete(cb.value);
            syncCount();
        });
        searchEl.addEventListener('input', renderList);
        overlay.querySelector('#ci-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelector('#ci-add').addEventListener('click', () => {
            if (!picked.size) return showToast('לא נבחרו מוצרים', 'error');
            let added = 0;
            catalogRows.forEach(r => {
                const id = (r.id || '').trim();
                if (!picked.has(id) || existing.has(id)) return;
                products.push({
                    id: id,
                    name: (r.name || '').trim(),
                    category: (r.category || '').trim(),
                    unit: (r.unit || 'יחידה').trim(),
                    brand: '',
                    image: (r.image || '').trim(),
                    // המחירים נשארים ריקים במכוון — מחירי הקטלוג העסקי אינם מחירי הוועד
                    cost: '',
                    price: 0,
                    sale_price: '',
                    bundle: '',
                    promo_start: '',
                    promo_end: '',
                    active: '1',
                    description: (r.description || '').trim()
                });
                added++;
            });
            overlay.remove();
            renderTable();
            updateCategoryDatalist();
            showToast(`נוספו ${added} מוצרים — עד שיוזן מחיר הם לא יעלו לעמוד`, 'success');
        });

        renderList();
        syncCount();
        searchEl.focus();
    }
});
