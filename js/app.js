// Configurable Data Source
const DATA_SOURCE_URL = '/data/products.csv?v=1';
const GOOGLE_SCRIPT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbz_rRjFdy2MqPMXX0cHkAh7zHBV4plQIEVL9H45DqdRRnU19ShwNCfguva7WBa0y-F1PQ/exec'; // הזן כאן את הקישור שקיבלת מגוגל סקריפט לשליחת המייל


let PRODUCTS = [];

// Config defaults
const DEFAULT_CONFIG = {
    showPrices: true,
    allowPdf: true,
    allowShare: true
};
let CONFIG = {};

let IMAGE_BASE_URL = '';

document.addEventListener("DOMContentLoaded", async () => {
    // Determine Image Base URL dynamically
    IMAGE_BASE_URL = await determineImageBaseUrl();
    console.log("Determined Image Base URL:", IMAGE_BASE_URL);

    // UI Elements
    const categoriesEl = document.getElementById("categories");
    const productsEl = document.getElementById("products");
    const summaryItemsEl = document.getElementById("summary-items");
    const summaryTotalEl = document.getElementById("summary-total");
    const fabCountEl = document.getElementById("fab-count");
    const orderModal = document.getElementById("order-modal");
    const orderTableBody = document.getElementById("order-table-body");
    const openOrderBtn = document.getElementById("open-order-btn");
    const closeOrderBtn = document.getElementById("close-order-btn");
    const clearCartBtn = document.getElementById("clear-cart-btn");

    // Quick View Elements
    const quickViewModal = document.getElementById("quick-view-modal");
    const closeQuickViewBtn = document.getElementById("close-quick-view-btn");
    const qvImage = document.getElementById("qv-image");
    const qvCategory = document.getElementById("qv-category");
    const qvTitle = document.getElementById("qv-title");
    const qvSku = document.getElementById("qv-sku");
    const qvPrice = document.getElementById("qv-price");
    const qvDesc = document.getElementById("qv-description");
    const qvInput = document.getElementById("qv-input");
    const qvMinus = document.getElementById("qv-minus");
    const qvPlus = document.getElementById("qv-plus");
    const qvAddToCart = document.getElementById("qv-add-to-cart");
    let currentQvProductId = null;
    const orderDateInput = document.getElementById("order-date");
    const orderDateDisplay = document.getElementById("order-date-display");
    const sendEmailBtn = document.getElementById("send-email");
    const sendWhatsappBtn = document.getElementById("send-whatsapp");
    const printPdfBtn = document.getElementById("print-pdf-btn");
    const searchInput = document.getElementById("search-input");
    const summaryTotalContainer = document.getElementById("summary-total-container");

    // State
    let activeCategory = null;
    let activeBrand = null; // סינון לפי מותג
    const cart = {}; // id -> quantity
    let favorites = new Set(); // ids

    // --- Brand Detection (זיהוי מותג אוטומטי משם המוצר) ---
    const BRAND_PATTERNS = [
        ['סנו', ['סנו']],
        ['יעקובי', ['יעקובי', 'יעקבי', 'kh7']],
        ['קימברלי קלארק', ['קימברלי']],
        ['פיירי', ['פיירי']],
        ['פיניש', ['פיניש']],
        ['דטול', ['דטול', 'dettol']],
        ['אסטוניש', ['אסטוניש']],
        ['קלין', ['קלין']],
        ['סנט מוריץ', ['סנט מוריץ']],
        ['זוהר דליה', ['זוהר דליה']],
        ['ויסוצקי', ['ויסוצקי']],
        ['טבורי', ['טבורי']]
    ];

    function detectBrand(name) {
        if (!name) return "";
        const lower = name.toLowerCase();
        for (const [brand, patterns] of BRAND_PATTERNS) {
            if (patterns.some(p => lower.includes(p))) return brand;
        }
        return "";
    }

    // Recent orders key - היסטוריית הזמנות אחרונות (נשמר בנפרד לקטלוג לקוחות ולגרסת הסוכן)
    const RECENT_KEY = 'aroam_recent_orders_' + (window.location.pathname.split('/')[1] || 'root');

    // Initialize App
    init();

    async function init() {
        // Create Skeleton
        renderSkeleton(8);

        // Check for correct protocol
        if (window.location.protocol === 'file:') {
            alert("שים לב: הקטלוג לא יכול לעבוד כקובץ מקומי.\nעליך להפעיל את הקובץ start_catalog.command כדי לצפות במוצרים.");
            return;
        }

        // Load Configuration (Merge defaults with window config)
        CONFIG = Object.assign({}, DEFAULT_CONFIG, window.CATALOG_CONFIG || {});
        console.log("App initialized with config:", CONFIG);

        // Setup Date defaults
        setupDate();

        // Prefill saved customer details (אם הלקוח הזמין בעבר)
        prefillCustomerDetails();

        // Apply Config to UI (hide/show buttons)
        applyConfiguration();

        // Load Data
        await loadProducts();

        // Load Favorites
        const storedFavs = localStorage.getItem('catalog_favorites');
        if (storedFavs) {
            favorites = new Set(JSON.parse(storedFavs));
        }

        // Initial Render
        const categories = Array.from(new Set(PRODUCTS.map(p => p.category))).filter(c => c);

        // Check URL params
        const urlParams = new URLSearchParams(window.location.search);
        // presetCategory מאפשר לדפי קטגוריה סטטיים (/catalog/cleaning/ וכו') לקבע קטגוריה
        const categoryParam = urlParams.get('category') || CONFIG.presetCategory || null;
        const searchParam = urlParams.get('search');
        const cartParam = urlParams.get('cart');

        // Restore Cart from URL
        if (cartParam) {
            try {
                // Format: id:qty,id:qty
                const items = cartParam.split(',');
                items.forEach(item => {
                    const [id, qty] = item.split(':');
                    if (id && qty) {
                        cart[id] = parseInt(qty, 10);
                    }
                });
                console.log("Restored cart from URL:", cart);
                updateSummary();
            } catch (e) {
                console.error("Failed to parse cart param", e);
            }
        }

        if (searchParam) {
            if (searchInput) searchInput.value = searchParam;
            activeCategory = null;
        } else if (categoryParam && categories.includes(categoryParam)) {
            activeCategory = categoryParam;
        } else if (categories.length > 0) {
            activeCategory = categories[0];
        }

        setupBrandFilter();
        renderCategories(categories);
        renderProducts();
        updateSummary();

        // Check for Deep Link
        const productIdParam = urlParams.get('product');
        if (productIdParam) {
            // Wait for DOM
            setTimeout(() => {
                const el = document.getElementById(`product-${productIdParam}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('highlight-product');
                    setTimeout(() => el.classList.remove('highlight-product'), 2000);
                }
            }, 500);
        }

        // Event Listeners
        setupEventListeners();
    }

    function applyConfiguration() {
        // Share Buttons
        if (!CONFIG.allowShare) {
            if (sendEmailBtn) sendEmailBtn.style.display = 'none';
            if (sendWhatsappBtn) sendWhatsappBtn.style.display = 'none';
        } else {
            if (sendEmailBtn) sendEmailBtn.style.display = ''; // restore default
            if (sendWhatsappBtn) sendWhatsappBtn.style.display = '';
        }

        // PDF Button (only exists in agent.html usually, but good to control visibility)
        if (printPdfBtn) {
            printPdfBtn.style.display = CONFIG.allowPdf ? 'inline-flex' : 'none';
        }

        // Totals container
        if (!CONFIG.showPrices && summaryTotalContainer) {
            // We might want to keep item count but hide total price
            // The HTML structure has them together. Let's just hide the total price part if possible
            // But summaryTotalContainer contains both. 
            // In index.html I added ID `summary-total-container` to the parent div.
            // If showPrices is false, we probably only want to show item count.
            // But let's leave it to updateSummary to hide the specific text.
        }
    }

    function setupDate() {
        if (!orderDateInput) return;
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        orderDateInput.value = `${yyyy}-${mm}-${dd}`;
        if (orderDateDisplay) orderDateDisplay.textContent = `תאריך: ${dd}/${mm}/${yyyy}`;

        orderDateInput.addEventListener("input", () => {
            const d = orderDateInput.value;
            if (!d) {
                if (orderDateDisplay) orderDateDisplay.textContent = "תאריך: ____";
                return;
            }
            const parts = d.split("-");
            if (orderDateDisplay) orderDateDisplay.textContent = `תאריך: ${parts[2]}/${parts[1]}/${parts[0]}`;
        });
    }

    async function determineImageBaseUrl() {
        // התמונות תמיד תחת שורש הדומיין (GitHub Pages + דומיין מותאם)
        return '/';
    }

    async function loadProducts() {
        return new Promise((resolve) => {
            const hourlyTimestamp = Math.floor(Date.now() / 3600000);
            Papa.parse(DATA_SOURCE_URL + "&_t=" + hourlyTimestamp, {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: function (results) {
                    // Process and validate data
                    PRODUCTS = results.data.map(item => {
                        let img = item.image;
                        if (img && !img.startsWith('http')) {
                            // Force Absolute Path (Verified via curl that images are at root /images/...)
                            // Clean ANY prefix (../ or /)
                            let cleanPath = img.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '');

                            // Use absolute root path
                            img = '/' + cleanPath;

                            try {
                                // Encode (prevent double encoding)
                                img = encodeURI(decodeURI(img));
                            } catch (e) {
                                img = encodeURI(img);
                            }
                        }
                        return {
                            id: item.id,
                            name: item.name,
                            category: item.category,
                            unit: item.unit,
                            image: img,
                            price: parseFloat(item.price) || 0,
                            description: item.description || "", // Optional description
                            brand: (item.brand || "").trim() || detectBrand(item.name) // עמודת brand בקובץ גוברת על זיהוי אוטומטי
                        }
                    }).filter(p => p.id && p.name);

                    console.log(`Loaded ${PRODUCTS.length} products`);
                    resolve();
                },
                error: function (err) {
                    console.error("Error loading products:", err);
                    alert("שגיאה בטעינת הקטלוג. נא לבדוק את קישור הנתונים.");
                    resolve();
                }
            });
        });
    }

    // --- Brand Filter UI (תפריט סינון מותגים ליד החיפוש) ---
    function setupBrandFilter() {
        const container = document.querySelector(".search-container");
        if (!container || document.getElementById("brand-filter")) return;

        const brands = Array.from(new Set(PRODUCTS.map(p => p.brand).filter(b => b)))
            .sort((a, b) => a.localeCompare(b, 'he'));
        if (brands.length < 2) return;

        container.style.display = "flex";
        container.style.gap = "8px";
        container.style.alignItems = "center";
        if (searchInput) searchInput.style.flex = "1";

        const select = document.createElement("select");
        select.id = "brand-filter";
        select.setAttribute("aria-label", "סינון לפי מותג");
        select.style.cssText = "padding:0.55rem 0.8rem; border:1px solid #ccc; border-radius:10px; font-family:inherit; font-size:0.95rem; background:#fff; color:#2F3E35; cursor:pointer; max-width:170px;";
        select.innerHTML = '<option value="">כל המותגים</option>' +
            brands.map(b => `<option value="${b}">${b}</option>`).join('');
        select.addEventListener("change", () => {
            activeBrand = select.value || null;
            // בחירת מותג מבטלת את הדגשת הקטגוריה (המותג חוצה קטגוריות)
            document.querySelectorAll(".cat-btn").forEach(b => {
                b.classList.toggle("active", !activeBrand && b.textContent === activeCategory);
            });
            renderProducts();
        });
        container.appendChild(select);
    }

    // איפוס סינון המותג (בלחיצה על קטגוריה)
    function resetBrandFilter() {
        activeBrand = null;
        const sel = document.getElementById("brand-filter");
        if (sel) sel.value = "";
    }

    function renderCategories(categories) {
        if (!categoriesEl) return;
        categoriesEl.innerHTML = "";
        console.log("Rendering categories:", categories);

        // Add "Favorites" Button
        const favBtn = document.createElement("button");
        favBtn.type = "button";
        favBtn.className = "cat-btn" + (activeCategory === 'favorites' ? " active" : "");
        favBtn.innerHTML = '<img src="/images/icon_heart_filled.webp" alt="Favorites" style="width:16px; height:16px; margin-left:5px; vertical-align:middle;"> המועדפים שלי';
        favBtn.addEventListener("click", () => {
            if (searchInput) searchInput.value = "";
            resetBrandFilter();
            activeCategory = 'favorites';
            document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
            favBtn.classList.add("active");
            renderProducts();
        });
        categoriesEl.appendChild(favBtn);

        // "Recent Orders" Button - מוצג רק אם קיימות הזמנות קודמות במכשיר
        if (getRecentProductIds().size > 0) {
            const recentBtn = document.createElement("button");
            recentBtn.type = "button";
            recentBtn.className = "cat-btn" + (activeCategory === 'recent' ? " active" : "");
            recentBtn.textContent = "הזמנות אחרונות";
            recentBtn.addEventListener("click", () => {
                if (searchInput) searchInput.value = "";
                resetBrandFilter();
                activeCategory = 'recent';
                document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
                recentBtn.classList.add("active");
                renderProducts();
            });
            categoriesEl.appendChild(recentBtn);
        }

        categories.forEach(cat => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "cat-btn" + (cat === activeCategory ? " active" : "");
            btn.textContent = cat;
            btn.addEventListener("click", () => {
                if (searchInput) searchInput.value = ""; // Clear search
                resetBrandFilter();
                activeCategory = cat;
                document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                renderProducts();
            });
            categoriesEl.appendChild(btn);
        });
    }

    function renderProducts() {
        if (!productsEl) return;
        const searchQuery = (searchInput?.value || "").trim();
        productsEl.innerHTML = "";
        let filtered = PRODUCTS;

        if (searchQuery !== "") {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
        } else if (activeBrand) {
            // בחירת מותג מציגה את כל מוצרי המותג מכל הקטגוריות
            filtered = PRODUCTS.filter(p => p.brand === activeBrand);
        } else if (activeCategory === 'favorites') {
            filtered = PRODUCTS.filter(p => favorites.has(p.id));
        } else if (activeCategory === 'recent') {
            const recentIds = getRecentProductIds();
            filtered = PRODUCTS.filter(p => recentIds.has(p.id));
        } else if (activeCategory) {
            filtered = PRODUCTS.filter(p => p.category === activeCategory);
        }

        if (filtered.length === 0) {
            productsEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #666;">לא נמצאו מוצרים.</div>';
            return;
        }

        filtered.forEach((product, index) => {
            const card = document.createElement("div");
            card.className = "product-card";
            card.id = `product-${product.id}`;

            // Image Container
            const imgContainer = document.createElement("div");
            imgContainer.className = "card-img-container";
            const img = document.createElement("img");
            img.className = "product-img";

            // Optimization: Eager load first 4 images
            if (index < 4) {
                img.loading = "eager";
                img.fetchPriority = "high";
            } else {
                img.loading = "lazy";
            }
            img.decoding = "async";
            img.width = 240;
            img.height = 200;
            img.src = product.image || "#";
            img.alt = product.name;

            // Robust Image Loading Strategy
            img.onerror = function () {
                const currentSrc = this.src;
                // Avoid infinite loops
                if (this.dataset.retried) {
                    this.style.display = 'none';
                    imgContainer.textContent = 'אין תמונה';
                    return;
                }
                this.dataset.retried = "true";

                // Try Safe Encoded version
                if (!currentSrc.includes('%')) {
                    const encoded = encodeURI(product.image);
                    if (encoded !== product.image) {
                        this.src = encoded;
                        return;
                    }
                }

                // Try NFD Normalization (Fix for Mac file systems)
                if (product.image.normalize) {
                    const nfd = product.image.normalize('NFD');
                    if (nfd !== product.image) {
                        this.src = nfd;
                        return;
                    }
                }

                // If all else fails
                // this.style.display = 'none';
                // imgContainer.textContent = 'אין תמונה';
                this.style.width = '50px';
                this.style.height = '50px';
                this.src = '/images/logo.png'; // Fallback to logo to indicate broken path
            };

            // Quick View Trigger
            const qvBtn = document.createElement("button");
            qvBtn.className = "qv-btn-trigger";
            qvBtn.innerHTML = '<img src="/images/icon_eye.webp" alt="Quick View">';
            qvBtn.title = "תצוגה מהירה";
            qvBtn.onclick = (e) => {
                e.stopPropagation();
                openQuickView(product);
            };
            // Style locally or add to generic CSS
            // qvBtn.style.cssText = "position:absolute; top:10px; right:10px; background:white; border:none; border-radius:50%; width:35px; height:35px; box-shadow:0 2px 5px rgba(0,0,0,0.2); cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center; opacity:0.8; transition: opacity 0.2s;";
            // qvBtn.onmouseover = () => qvBtn.style.opacity = "1";
            // qvBtn.onmouseout = () => qvBtn.style.opacity = "0.8";

            imgContainer.appendChild(img);
            imgContainer.appendChild(qvBtn);

            // Share Button
            if (CONFIG.allowShare) {
                const shareBtn = document.createElement("button");
                shareBtn.className = "share-btn";
                shareBtn.innerHTML = '<img src="/images/icon_rocket.webp" alt="Share">'; // Using rocket as share icon temporarily or generic share svg? Rocket is available.
                // Or better, use a standard SVG for share to not confuse with "Fast Shipping" rocket feature if any.
                // Let's use a simple SVG for share.
                shareBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
                shareBtn.title = "שתף מוצר";
                shareBtn.onclick = (e) => {
                    e.stopPropagation();
                    // shareProduct(product); // Missing function
                    if (navigator.share) {
                        navigator.share({
                            title: product.name,
                            text: `בדוק את המוצר ${product.name} בקטלוג אהרוני`,
                            url: window.location.origin + window.location.pathname + '?product=' + product.id
                        }).catch(console.error);
                    } else {
                        // Fallback
                        prompt("העתק את הקישור:", window.location.origin + window.location.pathname + '?product=' + product.id);
                    }
                };
                imgContainer.appendChild(shareBtn);
            }

            // Favorites Button
            const favBtn = document.createElement("button");
            favBtn.className = "fav-btn" + (favorites.has(product.id) ? " active" : "");
            favBtn.innerHTML = favorites.has(product.id) ?
                '<img src="/images/icon_heart_filled.webp" alt="Remove from favorites">' :
                '<img src="/images/icon_heart_empty.webp" alt="Add to favorites">';
            favBtn.title = "הוסף למועדפים";
            favBtn.onclick = (e) => {
                e.stopPropagation();
                // toggleFavorite(product.id, favBtn); // This function is missing in the file! 
                // Restore it inline or logic
                if (favorites.has(product.id)) {
                    favorites.delete(product.id);
                    favBtn.classList.remove("active");
                    favBtn.innerHTML = '<img src="/images/icon_heart_empty.webp" alt="Add to favorites">';
                } else {
                    favorites.add(product.id);
                    favBtn.classList.add("active");
                    favBtn.innerHTML = '<img src="/images/icon_heart_filled.webp" alt="Remove from favorites">';

                    // Animation
                    const flyer = document.createElement('div');
                    flyer.innerHTML = '❤️';
                    flyer.style.position = 'fixed';
                    flyer.style.left = e.clientX + 'px';
                    flyer.style.top = e.clientY + 'px';
                    flyer.style.fontSize = '20px';
                    flyer.style.pointerEvents = 'none';
                    flyer.style.zIndex = '9999';
                    document.body.appendChild(flyer);

                    flyer.animate([
                        { transform: 'scale(1) translateY(0)', opacity: 1 },
                        { transform: 'scale(1.5) translateY(-50px)', opacity: 0 }
                    ], { duration: 800 }).onfinish = () => flyer.remove();
                }
                localStorage.setItem('catalog_favorites', JSON.stringify([...favorites]));

                // If we are in favorites view, verify if we should remove the card
                if (activeCategory === 'favorites' && !favorites.has(product.id)) {
                    renderProducts();
                }
            };
            imgContainer.appendChild(favBtn);

            imgContainer.onclick = () => openQuickView(product); // Also open on image click
            imgContainer.style.cursor = "pointer";

            // Body
            const body = document.createElement("div");
            body.className = "card-body";

            const categoryLabel = document.createElement("div");
            categoryLabel.className = "product-cat-label";
            categoryLabel.textContent = product.category;

            const title = document.createElement("div");
            title.className = "product-title";
            title.textContent = product.name;

            body.appendChild(categoryLabel);
            body.appendChild(title);

            // Price - Conditional
            if (CONFIG.showPrices) {
                const price = document.createElement("div");
                price.className = "product-price";
                price.textContent = product.price.toFixed(2) + " ₪";
                body.appendChild(price);
            }

            const sku = document.createElement("div");
            sku.className = "product-sku";
            sku.textContent = "מק״ט: " + product.id;
            body.appendChild(sku);

            // Footer / Controls
            const footer = document.createElement("div");
            footer.className = "card-footer";

            const unitTag = document.createElement("span");
            unitTag.className = "unit-tag";
            unitTag.textContent = product.unit || "יחידה";

            const qtyControl = document.createElement("div");
            qtyControl.className = "qty-control";

            const minus = document.createElement("button");
            minus.className = "qty-btn";
            minus.textContent = "–";

            const input = document.createElement("input");
            input.type = "number";
            input.className = "qty-input";
            input.min = "0";
            const currentQty = cart[product.id] || 0;
            input.value = currentQty > 0 ? currentQty : "";

            const plus = document.createElement("button");
            plus.className = "qty-btn";
            plus.textContent = "+";

            minus.onclick = () => changeQty(product.id, -1, input);
            plus.onclick = (e) => changeQty(product.id, 1, input, e);
            input.onchange = () => setQtyFromInput(product.id, input);

            qtyControl.appendChild(minus);
            qtyControl.appendChild(input);
            qtyControl.appendChild(plus);

            footer.appendChild(unitTag);
            footer.appendChild(qtyControl);

            card.appendChild(imgContainer);
            card.appendChild(body);
            card.appendChild(footer);

            productsEl.appendChild(card);
        });
    }

    // נעילת גלילת הרקע כשמודאל כלשהו פתוח
    function syncModalScrollLock() {
        document.body.style.overflow = document.querySelector(".modal-overlay.open") ? "hidden" : "";
    }

    function openOrderModal() {
        if (!orderModal) return;
        fillOrderTable();
        orderModal.classList.add("open");
        syncModalScrollLock();
    }

    function setupEventListeners() {
        if (searchInput) {
            searchInput.addEventListener("input", () => {
                renderProducts();
                handleSearchSuggestions();
            });

            // Hide suggestions when clicking outside
            document.addEventListener("click", (e) => {
                if (!e.target.closest(".search-container")) {
                    hideSuggestions();
                }
            });
        }


        if (openOrderBtn) {
            openOrderBtn.addEventListener("click", openOrderModal);
        }

        if (closeOrderBtn) {
            closeOrderBtn.addEventListener("click", () => {
                orderModal.classList.remove("open");
                syncModalScrollLock();
            });
        }

        if (orderModal) {
            orderModal.addEventListener("click", (e) => {
                if (e.target === orderModal) {
                    orderModal.classList.remove("open");
                    syncModalScrollLock();
                }
            });
        }

        setupQuickViewListeners();

        if (clearCartBtn) {
            clearCartBtn.addEventListener("click", () => {
                Object.keys(cart).forEach(key => delete cart[key]);
                renderProducts();
                updateSummary();
                fillOrderTable();
            });
        }

        if (CONFIG.allowShare) {
            if (sendWhatsappBtn) {
                sendWhatsappBtn.addEventListener("click", () => {
                    const customer = getCustomerDetails();
                    if (customer && !validateCustomerDetails(customer)) return;

                    const orderId = generateOrderId();
                    const { items, totalItems, totalPrice } = getCartItemsData();

                    // Save to recent orders history (הזמנות אחרונות)
                    if (items.length > 0) saveRecentOrder(items);

                    // Send backup to Google Script in the background
                    sendOrderBackupToGoogleScript(orderId, items, totalPrice.toFixed(2), totalItems);
                    
                    // Conversion Tracking: דיווח שליחת הזמנה ל-GTM
                    window.dataLayer = window.dataLayer || [];
                    window.dataLayer.push({ event: 'order_sent', order_method: 'whatsapp', order_id: orderId, order_items: totalItems });

                    const text = encodeURIComponent(buildMessage(orderId));
                    const phone = "972526000158";
                    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");

                    // חלון אישור ללקוח
                    showOrderConfirmation(orderId, 'whatsapp');
                });
            }

            if (sendEmailBtn) {
                sendEmailBtn.addEventListener("click", () => {
                    const customer = getCustomerDetails();
                    if (customer && !validateCustomerDetails(customer)) return;

                    const orderId = generateOrderId();
                    const { items, totalItems, totalPrice } = getCartItemsData();

                    // Save to recent orders history (הזמנות אחרונות)
                    if (items.length > 0) saveRecentOrder(items);

                    // Send backup to Google Script in the background
                    sendOrderBackupToGoogleScript(orderId, items, totalPrice.toFixed(2), totalItems);
                    
                    // Conversion Tracking: דיווח שליחת הזמנה ל-GTM
                    window.dataLayer = window.dataLayer || [];
                    window.dataLayer.push({ event: 'order_sent', order_method: 'email', order_id: orderId, order_items: totalItems });

                    const subject = encodeURIComponent(`הצעת מחיר - מספר הזמנה #${orderId}`);
                    const body = encodeURIComponent(buildMessage(orderId));
                    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent("meiraroam@gmail.com")}&su=${subject}&body=${body}`, "_blank");

                    // חלון אישור ללקוח
                    showOrderConfirmation(orderId, 'email');
                });
            }
        }

        // Print Button Logic
        if (CONFIG.allowPdf && printPdfBtn) {
            printPdfBtn.addEventListener("click", () => {
                window.print();
            });
        }
    }

    function changeQty(id, delta, inputEl, event) {
        const current = cart[id] || 0;
        let next = current + delta;
        if (next < 0) next = 0;
        if (next === 0) {
            delete cart[id];
            inputEl.value = "";
        } else {
            cart[id] = next;
            inputEl.value = next;
        }
        updateSummary();

        if (delta > 0 && event) {
            animateAddToCart(event.target);
        }
    }

    function setQtyFromInput(id, inputEl) {
        let value = parseInt(inputEl.value, 10);
        if (isNaN(value) || value <= 0) {
            delete cart[id];
            inputEl.value = "";
        } else {
            cart[id] = value;
            inputEl.value = value;
        }
        updateSummary();
    }

    function updateSummary() {
        let totalItems = 0;
        let totalPrice = 0;

        for (const [id, qty] of Object.entries(cart)) {
            const product = PRODUCTS.find(p => p.id === id);
            if (!product) continue;
            totalItems += qty;
            totalPrice += qty * product.price;
        }

        if (summaryItemsEl) summaryItemsEl.textContent = totalItems;

        // Conditional Total Price
        if (summaryTotalEl) {
            if (CONFIG.showPrices) {
                summaryTotalEl.textContent = "₪" + totalPrice.toFixed(2);
                summaryTotalEl.parentNode.style.display = ''; // Ensure visible
            } else {
                summaryTotalEl.textContent = "";
                // Hide the 'Total Payment' line or just the amount?
                // Let's hide the amount container if possible, or just text
                // In HTML: <div>Total: <span>...</span></div>
                // Let's hide the parent
                summaryTotalEl.parentNode.style.display = 'none';
            }
        }

        if (fabCountEl) fabCountEl.textContent = totalItems;

        // Update Mobile Nav Badge
        const mobileNavCountEl = document.getElementById("mobile-nav-count");
        if (mobileNavCountEl) mobileNavCountEl.textContent = totalItems;
    }

    // --- Order Confirmation (אישור לאחר שליחת הזמנה) ---
    function showOrderConfirmation(orderId, method) {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:11000; display:flex; align-items:center; justify-content:center; padding:20px;";

        const methodText = method === 'whatsapp'
            ? 'ההזמנה נפתחה בוואטסאפ - ודאו שלחצתם על כפתור השליחה בחלון שנפתח.'
            : 'ההזמנה נפתחה במייל - ודאו שלחצתם על כפתור השליחה בחלון שנפתח.';

        const box = document.createElement("div");
        box.style.cssText = "background:#fff; color:#2F3E35; border-radius:16px; padding:2rem; max-width:420px; width:100%; text-align:center; box-shadow:0 10px 40px rgba(0,0,0,0.25);";
        box.innerHTML = `
            <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#639C7D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="8 12 11 15 16 9"></polyline></svg>
            <h2 style="margin:0.8rem 0 0.4rem; color:#1A4231; font-size:1.5rem;">ההזמנה נשלחה!</h2>
            <p style="margin:0 0 0.4rem; font-weight:700;">מספר הזמנה: ${orderId}</p>
            <p style="margin:0 0 1.3rem; color:#6B7F75; font-size:0.95rem; line-height:1.6;">${methodText}<br>נחזור אליכם בהקדם עם אישור והצעת מחיר.</p>
            <button id="order-confirm-close" style="background:#639C7D; color:#fff; border:none; border-radius:10px; padding:10px 34px; font-size:1rem; font-weight:600; cursor:pointer; font-family:inherit;">סגור</button>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const close = () => {
            overlay.remove();
            if (orderModal) orderModal.classList.remove("open");
            syncModalScrollLock();
        };
        box.querySelector("#order-confirm-close").addEventListener("click", close);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    }

    // --- Customer Details (פרטי לקוח בהזמנה) ---
    function getCustomerDetails() {
        const businessEl = document.getElementById("cust-business");
        if (!businessEl) return null; // גרסת סוכן - אין טופס פרטי לקוח
        const val = (id) => (document.getElementById(id)?.value || "").trim();
        return {
            business: businessEl.value.trim(),
            contact: val("cust-contact"),
            phone: val("cust-phone"),
            address: val("cust-address"),
            notes: val("cust-notes")
        };
    }

    function validateCustomerDetails(customer) {
        if (!customer.business || !customer.phone) {
            showToast("נא למלא שם עסק וטלפון לפני שליחת ההזמנה");
            const el = document.getElementById(!customer.business ? "cust-business" : "cust-phone");
            if (el) {
                el.focus();
                el.style.borderColor = "red";
                setTimeout(() => { el.style.borderColor = ""; }, 2500);
            }
            return false;
        }
        // שמירת הפרטים במכשיר - ימולאו אוטומטית בהזמנה הבאה
        try { localStorage.setItem('aroam_customer_details', JSON.stringify(customer)); } catch (e) { }
        return true;
    }

    function prefillCustomerDetails() {
        try {
            const saved = JSON.parse(localStorage.getItem('aroam_customer_details') || 'null');
            if (!saved) return;
            const map = { business: "cust-business", contact: "cust-contact", phone: "cust-phone", address: "cust-address", notes: "cust-notes" };
            Object.entries(map).forEach(([key, id]) => {
                const el = document.getElementById(id);
                if (el && !el.value && saved[key]) el.value = saved[key];
            });
        } catch (e) { }
    }

    // --- Recent Orders (הזמנות אחרונות) ---
    function getRecentOrders() {
        try {
            return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveRecentOrder(items) {
        try {
            const orders = getRecentOrders();
            orders.unshift({
                date: new Date().toISOString().split('T')[0],
                items: items.map(i => ({ id: i.id, qty: i.qty }))
            });
            localStorage.setItem(RECENT_KEY, JSON.stringify(orders.slice(0, 5)));
        } catch (e) { /* localStorage unavailable */ }
    }

    function getRecentProductIds() {
        const ids = new Set();
        getRecentOrders().forEach(o => (o.items || []).forEach(i => ids.add(i.id)));
        return ids;
    }

    function fillOrderTable() {
        if (!orderTableBody) return;
        orderTableBody.innerHTML = "";

        // Hide columns based on config
        const thPrice = document.querySelector(".order-table th:nth-child(6)");
        const thTotal = document.querySelector(".order-table th:nth-child(7)");

        if (thPrice) thPrice.style.display = CONFIG.showPrices ? '' : 'none';
        if (thTotal) thTotal.style.display = CONFIG.showPrices ? '' : 'none';

        for (const [id, qty] of Object.entries(cart)) {
            const product = PRODUCTS.find(p => p.id === id);
            if (!product || qty <= 0) continue;

            const row = document.createElement("tr");

            // Helpers
            const createCell = (text) => {
                const td = document.createElement("td");
                td.textContent = text;
                return td;
            };

            // Image
            const tdImage = document.createElement("td");
            tdImage.style.textAlign = "center";
            if (product.image) {
                const img = document.createElement("img");
                img.src = product.image;
                img.alt = product.name;
                img.style.width = "40px";
                img.style.height = "40px";
                img.style.objectFit = "contain";
                tdImage.appendChild(img);
            }
            row.appendChild(tdImage);

            row.appendChild(createCell(product.id));
            row.appendChild(createCell(product.name));
            row.appendChild(createCell(product.category));

            // Qty
            const tdQty = document.createElement("td");
            const qtyInp = document.createElement("input");
            qtyInp.className = "order-input";
            qtyInp.type = "number";
            qtyInp.min = "0";
            qtyInp.value = qty;
            tdQty.appendChild(qtyInp);
            row.appendChild(tdQty);

            row.appendChild(createCell(product.unit));

            // Price & Total - Conditional
            if (CONFIG.showPrices) {
                const tdPrice = document.createElement("td");
                const priceInp = document.createElement("input");
                priceInp.className = "order-input";
                priceInp.type = "number";
                priceInp.step = "0.01";
                priceInp.value = product.price.toFixed(2);
                tdPrice.appendChild(priceInp);
                row.appendChild(tdPrice);

                const tdTotal = document.createElement("td");
                const updateRow = () => {
                    const q = parseFloat(qtyInp.value) || 0;
                    const p = parseFloat(priceInp.value) || 0;
                    tdTotal.textContent = (q * p).toFixed(2);
                };
                qtyInp.addEventListener("input", () => { updateRow(); updateSummary(); }); // Update global summary too
                priceInp.addEventListener("input", () => { updateRow(); updateSummary(); });
                updateRow();
                row.appendChild(tdTotal);
            } else {
                // If we don't show prices, we might need to hide the cells or not append them.
                // But the header is hidden. If we don't append, row length is shorter. Correct.
            }

            orderTableBody.appendChild(row);
        }
    }

    function buildMessage(orderId) {
        let lines = ["שלום,", ""];
        if (orderId) {
            lines.push(`מספר הזמנה: #${orderId}`, "");
        }
        // פרטי הלקוח (אם קיים טופס בדף)
        const customer = getCustomerDetails();
        if (customer && customer.business) {
            lines.push(`שם העסק: ${customer.business}`);
            if (customer.contact) lines.push(`איש קשר: ${customer.contact}`);
            if (customer.phone) lines.push(`טלפון: ${customer.phone}`);
            if (customer.address) lines.push(`כתובת למשלוח: ${customer.address}`);
            if (customer.notes) lines.push(`הערות: ${customer.notes}`);
            lines.push("");
        }
        lines.push("פירוט הזמנה:", "");
        for (const [id, qty] of Object.entries(cart)) {
            const product = PRODUCTS.find(p => p.id === id);
            if (!product || qty <= 0) continue;
            lines.push(`• ${product.name} | מק״ט: ${product.id} | כמות: ${qty} ${product.unit}`);
        }
        lines.push("", "תודה");
        return lines.join("\n");
    }

    function generateOrderId() {
        const today = new Date();
        const yyyymmdd = today.getFullYear() +
            String(today.getMonth() + 1).padStart(2, '0') +
            String(today.getDate()).padStart(2, '0');
        const rand = Math.floor(1000 + Math.random() * 9000);
        return `AR-${yyyymmdd}-${rand}`;
    }

    function getCartItemsData() {
        const items = [];
        let totalItems = 0;
        let totalPrice = 0;
        for (const [id, qty] of Object.entries(cart)) {
            const product = PRODUCTS.find(p => p.id === id);
            if (!product || qty <= 0) continue;
            const price = parseFloat(product.price) || 0;
            const itemTotal = price * qty;
            items.push({
                id: product.id,
                name: product.name,
                category: product.category,
                qty: qty,
                unit: product.unit,
                price: price,
                total: itemTotal
            });
            totalItems += qty;
            totalPrice += itemTotal;
        }
        return { items, totalItems, totalPrice };
    }

    async function sendOrderBackupToGoogleScript(orderId, items, totalPrice, totalItems) {
        if (!GOOGLE_SCRIPT_WEBHOOK_URL) {
            console.log("Google Script Webhook URL is not set. Skipping backup email.");
            return;
        }
        
        try {
            const orderDate = orderDateInput ? orderDateInput.value : new Date().toLocaleDateString('he-IL');
            const payload = {
                orderId: orderId,
                date: orderDate,
                items: items,
                totalPrice: totalPrice,
                totalItems: totalItems,
                customer: getCustomerDetails() // פרטי הלקוח (null בגרסת סוכן)
            };

            await fetch(GOOGLE_SCRIPT_WEBHOOK_URL, {
                method: "POST",
                mode: "no-cors",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            console.log("Successfully sent order data to Google Script Webhook");
        } catch (error) {
            console.error("Error sending order data to Webhook:", error);
        }
    }

    function animateAddToCart(startEl) {
        // Find target: Mobile Nav Cart or FAB
        const mobileNavCart = document.querySelector('#mobile-cart-btn .icon-container');
        const fab = document.querySelector('.fab');

        // Determine which one is visible or prefer mobile nav if both
        let targetEl = fab;
        const mobileNav = document.querySelector('.mobile-bottom-nav');
        if (mobileNav && getComputedStyle(mobileNav).display !== 'none') {
            targetEl = mobileNavCart || document.querySelector('#mobile-cart-btn');
        }

        if (!targetEl) return;

        // Create flying element
        const flyer = document.createElement('div');
        flyer.style.position = 'fixed';
        flyer.style.width = '20px';
        flyer.style.height = '20px';
        flyer.style.borderRadius = '50%';
        flyer.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#8FD6A3';
        flyer.style.zIndex = '10000';
        flyer.style.pointerEvents = 'none';

        const startRect = startEl.getBoundingClientRect();
        flyer.style.left = (startRect.left + startRect.width / 2 - 10) + 'px';
        flyer.style.top = (startRect.top + startRect.height / 2 - 10) + 'px';

        document.body.appendChild(flyer);

        const targetRect = targetEl.getBoundingClientRect();

        // Animate
        const animation = flyer.animate([
            { transform: 'scale(1)', left: flyer.style.left, top: flyer.style.top },
            { transform: 'scale(0.5)', left: (targetRect.left + targetRect.width / 2 - 10) + 'px', top: (targetRect.top + targetRect.height / 2 - 10) + 'px' }
        ], {
            duration: 600,
            easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
        });

        animation.onfinish = () => {
            flyer.remove();

            // Bump effect on target
            targetEl.animate([
                { transform: 'scale(1)' },
                { transform: 'scale(1.3)' },
                { transform: 'scale(1)' }
            ], {
                duration: 200
            });
        };
    }
    function setupQuickViewListeners() {
        if (!quickViewModal) return;

        if (closeQuickViewBtn) {
            closeQuickViewBtn.onclick = () => {
                quickViewModal.classList.remove("open");
                syncModalScrollLock();
            };
        }

        quickViewModal.onclick = (e) => {
            if (e.target === quickViewModal) {
                quickViewModal.classList.remove("open");
                syncModalScrollLock();
            }
        };

        if (qvMinus) qvMinus.onclick = () => {
            if (qvInput.value > 0) qvInput.value--;
        };

        if (qvPlus) qvPlus.onclick = () => {
            qvInput.value++;
        };

        if (qvAddToCart) qvAddToCart.onclick = () => {
            if (!currentQvProductId) return;
            const qty = parseInt(qvInput.value) || 0;
            if (qty > 0) {
                cart[currentQvProductId] = qty;
            } else {
                delete cart[currentQvProductId];
            }
            updateSummary();
            // Refresh grid if needed to show updated input there
            renderProducts();

            quickViewModal.classList.remove("open");
            syncModalScrollLock();

            // Animation
            const btnRect = qvAddToCart.getBoundingClientRect();
            animateAddToCart(qvAddToCart);
        };
    }

    function openQuickView(product) {
        if (!quickViewModal) return;
        currentQvProductId = product.id;

        // Populate Data
        qvImage.src = product.image || "";
        qvImage.alt = product.name || "";
        qvImage.onerror = () => { qvImage.style.display = 'none'; };
        qvImage.onload = () => { qvImage.style.display = 'block'; };

        qvCategory.textContent = product.category;
        qvTitle.textContent = product.name;
        qvSku.textContent = "מק״ט: " + product.id;

        if (CONFIG.showPrices) {
            qvPrice.style.display = 'block';
            qvPrice.textContent = product.price.toFixed(2) + " ₪";
        } else {
            qvPrice.style.display = 'none';
        }

        // Description
        // Use the description from the CSV/Sheet
        if (product.description && product.description.trim() !== "") {
            qvDesc.textContent = product.description;
            qvDesc.style.display = 'block';
        } else {
            // Hide description if empty
            qvDesc.textContent = "";
            qvDesc.style.display = 'none';
        }

        // Init Quantity
        const currentQty = cart[product.id] || 0;
        qvInput.value = currentQty > 0 ? currentQty : 1; // Default to 1 if not in cart

        quickViewModal.classList.add("open");
        syncModalScrollLock();
    }

    function renderSkeleton(count) {
        if (!productsEl) return;
        productsEl.innerHTML = "";

        for (let i = 0; i < count; i++) {
            const card = document.createElement("div");
            card.className = "product-card skeleton";

            // Image
            const imgContainer = document.createElement("div");
            imgContainer.className = "card-img-container";
            // No img element needed, handled by CSS ::after

            // Body
            const body = document.createElement("div");
            body.className = "card-body";

            const catLabel = document.createElement("div");
            catLabel.className = "product-cat-label";

            const title = document.createElement("div");
            title.className = "product-title";

            const sku = document.createElement("div");
            sku.className = "product-sku";

            body.appendChild(catLabel);
            body.appendChild(title);
            body.appendChild(sku);

            // Footer
            const footer = document.createElement("div");
            footer.className = "card-footer";
            footer.style.minHeight = "40px";
            footer.style.background = "#f9f9f9";

            card.appendChild(imgContainer);
            card.appendChild(body);
            card.appendChild(footer);

            productsEl.appendChild(card);
        }
    }

    function toggleFavorite(id, btn) {
        if (favorites.has(id)) {
            favorites.delete(id);
            btn.classList.remove("active");
            btn.innerHTML = '<img src="/images/icon_heart_empty.webp" alt="Add to favorites">';
        } else {
            favorites.add(id);
            btn.classList.add("active");
            btn.innerHTML = '<img src="/images/icon_heart_filled.webp" alt="Remove from favorites">';

            // Pulse animation
            btn.animate([
                { transform: 'scale(1)' },
                { transform: 'scale(1.4)' },
                { transform: 'scale(1)' }
            ], { duration: 300 });
        }
        localStorage.setItem('catalog_favorites', JSON.stringify([...favorites]));

        // If we are in favorites view, remove the card or refresh
        if (activeCategory === 'favorites') {
            renderProducts();
        }
    }

    // --- Autocomplete Search Logic ---
    function handleSearchSuggestions() {
        const query = searchInput.value.trim().toLowerCase();
        let suggestionsContainer = document.getElementById("search-suggestions");

        // Create container if not exists
        if (!suggestionsContainer) {
            suggestionsContainer = document.createElement("div");
            suggestionsContainer.id = "search-suggestions";
            suggestionsContainer.className = "search-suggestions";
            searchInput.parentNode.appendChild(suggestionsContainer);
        }

        if (query.length < 2) {
            suggestionsContainer.style.display = 'none';
            return;
        }

        const matches = PRODUCTS
            .filter(p => p.name.toLowerCase().includes(query) || p.id.includes(query))
            .slice(0, 5); // Limit to 5 suggestions

        if (matches.length === 0) {
            suggestionsContainer.style.display = 'none';
            return;
        }

        suggestionsContainer.innerHTML = "";
        matches.forEach(product => {
            const div = document.createElement("div");
            div.className = "suggestion-item";
            div.innerHTML = `
                <img src="${product.image || '/images/logo.png'}" alt="product">
                <div class="s-info">
                    <span class="s-name">${product.name}</span>
                    <span class="s-sku">${product.id}</span>
                </div>
            `;
            div.onclick = () => selectSuggestion(product);
            suggestionsContainer.appendChild(div);
        });

        suggestionsContainer.style.display = 'block';
    }

    function hideSuggestions() {
        const el = document.getElementById("search-suggestions");
        if (el) el.style.display = 'none';
    }

    function selectSuggestion(product) {
        searchInput.value = product.name;
        hideSuggestions();
        renderProducts(); // Update grid
        // Optional: Open Quick View immediately
        openQuickView(product);
    }

    function shareProduct(product) {
        const url = `${window.location.origin}${window.location.pathname}?product=${product.id}`;
        if (navigator.share) {
            navigator.share({
                title: product.name,
                text: `בדוק את המוצר: ${product.name} מקטלוג אהרוני`,
                url: url
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(url).then(() => {
                showToast(`קישור למוצר הועתק!`);
            });
        }
    }

    function showToast(message) {
        let toast = document.getElementById("toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "toast";
            toast.className = "toast";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 3000);
    }

    // --- Quote History Management (Cloud API) ---
    const API_URL = "https://script.google.com/macros/s/AKfycbyasqqt8uTERc__hWjJTW59M6z2mNN-VEUksh5PUT94h1EAG5xwnyCIYzX0u7jmnNRZ/exec";

    // הסיסמה לא שמורה בקוד: נשאלת פעם אחת ונשמרת ל-session בלבד
    function getApiPassword() {
        let pw = sessionStorage.getItem("aroam_qh_key") || "";
        if (!pw) {
            pw = prompt("קוד גישה להיסטוריית הצעות בענן:") || "";
            if (pw) sessionStorage.setItem("aroam_qh_key", pw);
        }
        return pw;
    }

    function clearApiPassword() {
        sessionStorage.removeItem("aroam_qh_key");
    }

    async function getQuoteHistory() {
        const pw = getApiPassword();
        if (!pw) return [];
        try {
            const res = await fetch(`${API_URL}?action=get&password=${encodeURIComponent(pw)}`);
            const data = await res.json();
            if (data.error) {
                console.error("API Error:", data.error);
                clearApiPassword(); // קוד שגוי - לאפשר הזנה מחדש
                showToast("קוד גישה שגוי או שגיאת שרת");
                return [];
            }
            return data;
        } catch (e) {
            console.error("Failed to fetch history:", e);
            showToast("שגיאה בטעינת היסטוריה");
            return [];
        }
    }

    async function saveQuote(customerNameOrQuote = "לקוח כללי") {
        let newQuote;
        if (typeof customerNameOrQuote === 'object') {
            newQuote = customerNameOrQuote;
        } else {
            const currentCartItems = Object.entries(cart).map(([id, qty]) => {
                const product = PRODUCTS.find(p => p.id === id);
                return {
                    id: id,
                    name: product ? product.name : 'Unknown',
                    price: product ? product.price : 0,
                    unit: product ? product.unit : 'יח׳',
                    image: product ? product.image : '',
                    quantity: qty
                };
            });

            if (currentCartItems.length === 0) {
                alert("העגלה ריקה. אין מה לשמור.");
                return null;
            }

            newQuote = {
                id: 'Q-' + Date.now(),
                date: new Date().toISOString().split('T')[0],
                customer: customerNameOrQuote,
                items: currentCartItems,
                total: currentCartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
            };
        }

        const pw = getApiPassword();
        if (!pw) return newQuote;

        showToast("שומר הצעה בענן...");

        try {
            const res = await fetch(`${API_URL}?action=save&password=${encodeURIComponent(pw)}`, {
                method: 'POST',
                body: JSON.stringify(newQuote)
            });
            const data = await res.json();

            if (data.success) {
                showToast("ההצעה נשמרה בענן!");
                return newQuote;
            } else {
                console.error("שגיאה בשמירה בענן:", data.error);
                return newQuote; // Return quote anyway so printing can proceed
            }
        } catch (e) {
            console.error("תקלת תקשורת בשמירה בענן:", e);
            return newQuote; // Return quote anyway so printing can proceed
        }
    }

    async function deleteQuote(quoteId) {
        if (!confirm("האם למחוק את ההצעה מהענן לצמיתות?")) return;

        const pw = getApiPassword();
        if (!pw) return;

        showToast("מוחק...");
        try {
            const res = await fetch(`${API_URL}?action=delete&id=${encodeURIComponent(quoteId)}&password=${encodeURIComponent(pw)}`);
            const data = await res.json();
            if (data.success) {
                showToast("נמחק בהצלחה");
                openHistoryModal(); // Refresh
            } else {
                alert("שגיאה במחיקה: " + data.error);
            }
        } catch (e) {
            alert("תקלת תקשורת במחיקה");
        }
    }

    async function loadQuote(quoteId) {
        showToast("טוען הצעה...");
        const history = await getQuoteHistory();
        const quote = history.find(q => q.id === quoteId);
        if (!quote) {
            alert("ההצעה לא נמצאה");
            return;
        }

        if (Object.keys(cart).length > 0 && !confirm("טעינת הצעה תמחק את העגלה הנוכחית. להמשיך?")) return;

        Object.keys(cart).forEach(k => delete cart[k]); // Clear

        quote.items.forEach(item => {
            // Restore custom product if needed
            const exists = PRODUCTS.find(p => p.id === item.id);
            if (!exists) {
                PRODUCTS.push({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    unit: item.unit || 'יח׳',
                    image: item.image || '',
                    category: 'כללי',
                    isCustom: true
                });
            }
            cart[item.id] = item.quantity;
        });

        updateFab();
        closeHistoryModal();
        openOrderModal();
        showToast("ההצעה נטענה בהצלחה");
    }

    // --- Custom Product Logic ---
    function addCustomProduct() {
        const name = prompt("שם/תיאור המוצר:");
        if (!name) return;

        const priceStr = prompt("מחיר יחידה (₪):", "0");
        const price = parseFloat(priceStr) || 0;

        const qtyStr = prompt("כמות:", "1");
        const qty = parseInt(qtyStr) || 1;

        if (qty <= 0) return;

        const customId = 'custom_' + Date.now();
        const customProduct = {
            id: customId,
            name: name,
            price: price,
            unit: 'יח׳',
            image: '',
            category: 'כללי',
            isCustom: true
        };

        PRODUCTS.push(customProduct);
        cart[customId] = qty;

        updateSummary();
        showToast(`הוסף: ${name}`);

        // Optional: animate fab
        const fab = document.querySelector('.fab');
        if (fab) {
            fab.animate([
                { transform: 'scale(1)' },
                { transform: 'scale(1.3)' },
                { transform: 'scale(1)' }
            ], { duration: 200 });
        }
    }

    function openHistoryModal() {
        const modal = document.getElementById("history-modal");
        if (!modal) return;
        renderHistoryList();
        modal.classList.add("open");
        syncModalScrollLock();
    }

    function closeHistoryModal() {
        const modal = document.getElementById("history-modal");
        if (modal) modal.classList.remove("open");
        syncModalScrollLock();
    }

    async function renderHistoryList() {
        const listEl = document.getElementById("history-list");
        if (!listEl) return;

        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">טוען היסטוריה מהענן...</div>';

        const history = await getQuoteHistory();
        if (history.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">אין הצעות שמורות.</div>';
            return;
        }

        listEl.innerHTML = history.map(q => `
            <div class="history-item" style="border-bottom:1px solid #eee; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:bold;">${q.customer || 'לקוח כללי'}</div>
                    <div style="font-size:0.85rem; color:#666;">${q.date} | ${q.items.length} פריטים</div>
                </div>
                <div style="text-align:left;">
                    <div style="font-weight:bold; color:var(--primary);">${q.total.toFixed(2)} ₪</div>
                    <div style="margin-top:5px;">
                        <button class="btn btn-sm btn-outline" onclick="window.APP.loadQuote('${q.id}')">טען</button>
                        <button class="btn btn-sm btn-danger" onclick="window.APP.deleteQuote('${q.id}')">&times;</button>
                    </div>
                </div>
            </div>
        `).join('');
    }


    // --- Print PDF Logic ---
    async function printQuote() {
        const customerName = prompt("טופס הדפסה: נא להזין שם לקוח", "לקוח כללי");
        if (customerName === null) return;

        const savedQuote = await saveQuote(customerName);
        if (!savedQuote) return;

        const modalBody = document.querySelector("#order-modal .modal-body");

        const headerDiv = document.createElement("div");
        headerDiv.className = "print-header";
        headerDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; text-align:right;">
                <div>
                    <img src="/images/logo.png" alt="לוגו אהרוני" style="height: 60px; margin-bottom: 10px;">
                    <h1 style="margin:0; font-size:1.5rem;">אהרוני שיווק והפצה</h1>
                    <div>סוכן: רועי אהרוני</div>
                    <div>כתובת: היצירה 16, אור יהודה</div>
                    <div>טלפון: 052-6000158</div>
                </div>
                <div style="text-align:left;">
                    <h2>הצעת מחיר / הזמנה</h2>
                    <div>מספר: ${savedQuote.id}</div>
                    <div>תאריך: ${savedQuote.date}</div>
                    <div>לכבוד: <strong>${savedQuote.customer}</strong></div>
                </div>
            </div>
            <hr style="margin-top:20px; border-color:#000;">
        `;

        const footerDiv = document.createElement("div");
        footerDiv.className = "print-footer";
        footerDiv.innerHTML = `
            <div style="margin-top:40px; border-top:2px solid #000; padding-top:10px; display:flex; justify-content:space-between;">
                <div class="signature-box">חתימת המזמין</div>
                <div class="signature-box" style="float:left;">חתימת סוכן/מאשר</div>
            </div>
            <div style="text-align:center; font-size:0.8rem; margin-top:20px;">
                ט.ל.ח | המחירים אינם כוללים מע״מ | תוקף ההצעה: 14 יום
            </div>
        `;

        modalBody.insertBefore(headerDiv, modalBody.firstChild);
        modalBody.appendChild(footerDiv);

        window.print();

        setTimeout(() => {
            if (headerDiv.parentNode) headerDiv.parentNode.removeChild(headerDiv);
            if (footerDiv.parentNode) footerDiv.parentNode.removeChild(footerDiv);
        }, 1000);
    }

    function shareCartLink() {
        if (Object.keys(cart).length === 0) {
            alert("העגלה ריקה. אין מה לשתף.");
            return;
        }

        // Serialize
        const param = Object.entries(cart)
            .map(([id, qty]) => `${id}:${qty}`)
            .join(',');

        const url = `${window.location.origin}${window.location.pathname}?cart=${param}`;

        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                alert("הקישור הועתק! ניתן לשלוח אותו בוואטסאפ ולפתוח במחשב.");
            }).catch(err => {
                prompt("העתק את הקישור:", url);
            });
        } else {
            prompt("העתק את הקישור:", url);
        }
    }

    // Expose functions globally
    window.APP = {
        saveQuote,
        loadQuote,
        deleteQuote,
        openHistoryModal,
        closeHistoryModal,
        printQuote,
        addCustomProduct,
        shareCartLink
    };

    // Hook up buttons
    if (printPdfBtn) {
        printPdfBtn.style.display = "inline-flex";
        printPdfBtn.onclick = printQuote;
    }

});
