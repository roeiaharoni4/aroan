document.addEventListener('DOMContentLoaded', () => {
    // Security layer: Block access if not running locally
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        alert('הגישה למערכת הניהול מותרת רק מהמחשב המקומי.');
        window.location.href = '../index.html';
        return;
    }

    let products = [];
    const DATA_URL = '/data/products.csv?v=' + Date.now();
    
    // UI Elements
    const tbody = document.getElementById('products-tbody');
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const addBtn = document.getElementById('add-product-btn');
    const saveAllBtn = document.getElementById('save-all-btn');
    
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
    const priceInput = document.getElementById('prod-price');
    const packagingInput = document.getElementById('prod-packaging');
    const subcatInput = document.getElementById('prod-subcategory');
    const descInput = document.getElementById('prod-description');
    
    const fileInput = document.getElementById('prod-image-file');
    const urlInput = document.getElementById('prod-image-url');
    const imgPreview = document.getElementById('image-preview');
    
    const categoryList = document.getElementById('category-list');
    
    // Load Data
    loadProducts();

    function loadProducts() {
        Papa.parse(DATA_URL, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                // כל שדה שלא נרשם כאן נמחק בשמירה הבאה — לשמור מסונכרן עם
                // PRODUCT_FIELDS ב-server.py ועם אובייקט השמירה ב-save-modal-btn
                products = results.data.map(item => ({
                    id: item.id || '',
                    name: item.name || '',
                    category: item.category || '',
                    subcategory: item.subcategory || '',
                    unit: item.unit || 'יחידה',
                    image: item.image || '',
                    price: item.price || 0,
                    packaging: item.packaging || '',
                    description: item.description || ''
                })).filter(p => p.id && p.name);
                
                renderTable();
                updateCategoryDatalist();
            },
            error: function(err) {
                showToast("שגיאה בטעינת נתונים", "error");
                console.error(err);
            }
        });
    }

    function renderTable(filter = '') {
        tbody.innerHTML = '';
        const q = filter.toLowerCase();
        const catSel = categoryFilter ? categoryFilter.value : '';

        products.forEach(p => {
            if (catSel && p.category !== catSel) return;
            if (filter && !p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) return;
            
            const tr = document.createElement('tr');
            
            // Default image fallback
            let imgSrc = p.image;
            if (!imgSrc) imgSrc = '../images/logo.png';
            
            tr.innerHTML = `
                <td class="td-img"><img src="${imgSrc}" onerror="this.src='../images/logo.png'"></td>
                <td>${p.id}</td>
                <td>${p.name}</td>
                <td>${p.category}</td>
                <td>${p.unit}</td>
                <td>${parseFloat(p.price).toFixed(2)}</td>
                <td class="action-btns">
                    <button class="edit-btn" title="ערוך" data-id="${p.id}">✏️</button>
                    <button class="delete-btn" title="מחק" data-id="${p.id}">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        // Bind events
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.onclick = () => openEditModal(btn.dataset.id);
        });
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = () => deleteProduct(btn.dataset.id);
        });
    }

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
    }

    // Search + Category filter
    searchInput.addEventListener('input', (e) => renderTable(e.target.value));
    if (categoryFilter) categoryFilter.addEventListener('change', () => renderTable(searchInput.value));

    // Modal logic
    addBtn.onclick = () => openAddModal();
    closeBtn.onclick = () => modal.classList.remove('active');
    cancelBtn.onclick = () => modal.classList.remove('active');
    
    function openAddModal() {
        form.reset();
        originalIdInput.value = '';
        imgPreview.style.display = 'none';
        imgPreview.src = '';
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
        priceInput.value = p.price;
        packagingInput.value = p.packaging || '';
        subcatInput.value = p.subcategory || '';
        descInput.value = p.description || '';
        urlInput.value = p.image;
        
        if (p.image) {
            imgPreview.src = p.image;
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
            
            // We will upload this when saving the form, or upload immediately?
            // Upload immediately for better UX
            uploadImage(file.name, e.target.result);
        };
        reader.readAsDataURL(file);
    });
    
    async function uploadImage(filename, dataUrl) {
        try {
            // Clean filename
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
        } catch(e) {
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
        
        const newProduct = {
            id: idInput.value.trim(),
            name: nameInput.value.trim(),
            category: catInput.value.trim(),
            subcategory: subcatInput.value.trim(),
            unit: unitInput.value.trim() || 'יחידה',
            image: urlInput.value.trim(),
            price: parseFloat(priceInput.value) || 0,
            packaging: packagingInput.value.trim(),
            description: descInput.value.trim()
        };
        
        const originalId = originalIdInput.value;
        
        if (originalId) {
            // Update existing
            const index = products.findIndex(p => p.id === originalId);
            if (index > -1) {
                products[index] = newProduct;
            }
        } else {
            // Check if ID exists
            if (products.find(p => p.id === newProduct.id)) {
                alert('מוצר עם מק״ט זה כבר קיים!');
                return;
            }
            // Add new
            products.unshift(newProduct);
        }
        
        modal.classList.remove('active');
        renderTable(searchInput.value);
        updateCategoryDatalist();
        showToast('המוצר נשמר. אל תשכח ללחוץ על "שמור שינויים" כדי לעדכן את האתר.', 'success');
    };

    function deleteProduct(id) {
        if (confirm('האם אתה בטוח שברצונך למחוק מוצר זה?')) {
            products = products.filter(p => p.id !== id);
            renderTable(searchInput.value);
            showToast('המוצר נמחק. אל תשכח ללחוץ על "שמור שינויים".', 'success');
        }
    }

    // Save to Server
    saveAllBtn.onclick = async () => {
        saveAllBtn.disabled = true;
        saveAllBtn.textContent = 'שומר...';
        
        try {
            const res = await fetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(products)
            });
            const result = await res.json();
            if (result.success) {
                showToast('הקטלוג עודכן בהצלחה!', 'success');
            } else {
                throw new Error(result.error);
            }
        } catch(e) {
            console.error(e);
            showToast('שגיאה בשמירת נתונים', 'error');
        } finally {
            saveAllBtn.disabled = false;
            saveAllBtn.textContent = 'שמור שינויים';
        }
    };

    function showToast(msg, type='success') {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = 'toast ' + type + ' show';
        setTimeout(() => toast.className = 'toast', 3000);
    }
});
