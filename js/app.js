// Configurable Data Source
const DATA_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSBWFKxPdiKYdXiLDKnwiRb47xAJO-TzD4XmKybUEn4DeFzduPwdTEixsSMNL8rRzN0vCj9PYRGJlyH/pub?output=csv';

let PRODUCTS = [];

// Config defaults
const DEFAULT_CONFIG = {
    showPrices: true,
    allowPdf: true,
    allowShare: true
};
let CONFIG = {};

document.addEventListener("DOMContentLoaded", () => {
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
    const cart = {}; // id -> quantity

    // Initialize App
    init();

    async function init() {
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

        // Apply Config to UI (hide/show buttons)
        applyConfiguration();

        // Load Data
        await loadProducts();

        // Initial Render
        const categories = Array.from(new Set(PRODUCTS.map(p => p.category))).filter(c => c);

        // Check URL params
        const urlParams = new URLSearchParams(window.location.search);
        const categoryParam = urlParams.get('category');
        const searchParam = urlParams.get('search');

        if (searchParam) {
            if (searchInput) searchInput.value = searchParam;
            activeCategory = null;
        } else if (categoryParam && categories.includes(categoryParam)) {
            activeCategory = categoryParam;
        } else if (categories.length > 0) {
            activeCategory = categories[0];
        }

        renderCategories(categories);
        renderProducts();
        updateSummary();

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

    async function loadProducts() {
        return new Promise((resolve) => {
            Papa.parse(DATA_SOURCE_URL + "&_t=" + Date.now(), {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: function (results) {
                    // Process and validate data
                    PRODUCTS = results.data.map(item => ({
                        id: item.id,
                        name: item.name,
                        category: item.category,
                        unit: item.unit,
                        image: item.image,
                        price: parseFloat(item.price) || 0
                    })).filter(p => p.id && p.name);

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

    function renderCategories(categories) {
        if (!categoriesEl) return;
        categoriesEl.innerHTML = "";
        categories.forEach(cat => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "cat-btn" + (cat === activeCategory ? " active" : "");
            btn.textContent = cat;
            btn.addEventListener("click", () => {
                if (searchInput) searchInput.value = ""; // Clear search
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
        } else if (activeCategory) {
            filtered = PRODUCTS.filter(p => p.category === activeCategory);
        }

        if (filtered.length === 0) {
            productsEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #666;">לא נמצאו מוצרים.</div>';
            return;
        }

        filtered.forEach(product => {
            const card = document.createElement("div");
            card.className = "product-card";

            // Image Container
            const imgContainer = document.createElement("div");
            imgContainer.className = "card-img-container";
            const img = document.createElement("img");
            img.className = "product-img";
            img.src = product.image || "#";
            img.alt = product.name;
            img.onerror = () => { img.style.display = 'none'; imgContainer.textContent = 'אין תמונה'; };

            // Quick View Trigger
            const qvBtn = document.createElement("button");
            qvBtn.className = "qv-btn-trigger";
            qvBtn.innerHTML = "👁️";
            qvBtn.title = "תצוגה מהירה";
            qvBtn.onclick = (e) => {
                e.stopPropagation();
                openQuickView(product);
            };
            // Style locally or add to generic CSS
            qvBtn.style.cssText = "position:absolute; top:10px; right:10px; background:white; border:none; border-radius:50%; width:35px; height:35px; box-shadow:0 2px 5px rgba(0,0,0,0.2); cursor:pointer; font-size:1.2rem; display:flex; align-items:center; justify-content:center; opacity:0.8; transition: opacity 0.2s;";
            qvBtn.onmouseover = () => qvBtn.style.opacity = "1";
            qvBtn.onmouseout = () => qvBtn.style.opacity = "0.8";

            imgContainer.appendChild(img);
            imgContainer.appendChild(qvBtn);
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

    function setupEventListeners() {
        if (searchInput) searchInput.addEventListener("input", renderProducts);

        if (openOrderBtn) {
            openOrderBtn.addEventListener("click", () => {
                fillOrderTable();
                orderModal.classList.add("open");
            });
        }

        if (closeOrderBtn) {
            closeOrderBtn.addEventListener("click", () => {
                orderModal.classList.remove("open");
            });
        }

        if (orderModal) {
            orderModal.addEventListener("click", (e) => {
                if (e.target === orderModal) orderModal.classList.remove("open");
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
                    const text = encodeURIComponent(buildMessage());
                    const phone = "972526000158";
                    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
                });
            }

            if (sendEmailBtn) {
                sendEmailBtn.addEventListener("click", () => {
                    const subject = encodeURIComponent("הצעת מחיר");
                    const body = encodeURIComponent(buildMessage());
                    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent("meiraroam@gmail.com")}&su=${subject}&body=${body}`, "_blank");
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

    function buildMessage() {
        let lines = ["שלום,", "", "פירוט הזמנה:", ""];
        for (const [id, qty] of Object.entries(cart)) {
            const product = PRODUCTS.find(p => p.id === id);
            if (!product || qty <= 0) continue;
            lines.push(`• ${product.name} | מק״ט: ${product.id} | כמות: ${qty} ${product.unit}`);
        }
        lines.push("", "תודה");
        return lines.join("\n");
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
            closeQuickViewBtn.onclick = () => quickViewModal.classList.remove("open");
        }

        quickViewModal.onclick = (e) => {
            if (e.target === quickViewModal) quickViewModal.classList.remove("open");
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

        // Description - mocked for now or from CSV if added later
        qvDesc.textContent = "תיאור מוצר מורחב יופיע כאן. זהו מוצר איכותי מקטגוריית " + product.category + ".";

        // Init Quantity
        const currentQty = cart[product.id] || 0;
        qvInput.value = currentQty > 0 ? currentQty : 1; // Default to 1 if not in cart

        quickViewModal.classList.add("open");
    }
});
