// Configurable Data Source (ניתן לעקוף דרך CATALOG_CONFIG.dataSource — משמש את המחירון הנסתר)
const DATA_SOURCE_URL = (window.CATALOG_CONFIG && window.CATALOG_CONFIG.dataSource) || '/data/products.csv?v=1';
const GOOGLE_SCRIPT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbz_rRjFdy2MqPMXX0cHkAh7zHBV4plQIEVL9H45DqdRRnU19ShwNCfguva7WBa0y-F1PQ/exec'; // הזן כאן את הקישור שקיבלת מגוגל סקריפט לשליחת המייל


let PRODUCTS = [];

// Config defaults
const DEFAULT_CONFIG = {
    showPrices: true,
    allowPdf: true,
    allowShare: true,
    // 'b2c' = לקוח פרטי: שם מלא במקום שם עסק, ובורר שיטת אספקה ואופן תשלום.
    // 'branch' = עמוד רשת החנויות: הזיהוי הוא הסניף שנבחר בשער, בלי שדות חובה.
    // כל השאר ('b2b') נשאר בהתנהגות הקיימת של קטלוג הלקוחות ודף הסוכן.
    customerMode: 'b2b',
    // רשימת המזהים שמותר להציג (קובץ JSON עם {"products": [...]}).
    // null = כל הקטלוג, כלומר כל הדפים מלבד עמוד רשת החנויות.
    allowedProductsSource: null,
    // כתובת קונפיג שיטות האספקה. null = בלי משלוח כלל (הקטלוג העסקי והסוכן).
    shippingSource: null,
    // true = סיכום ההזמנה נפתח כתצוגה מלאת-מסך עם ?cart=1 בכתובת במקום כחלון.
    // דף הסוכן משאיר false — שם המודאל משרת גם הצעות מחיר, PDF והיסטוריה.
    cartView: false,
    // עריכת מחיר היחידה בטבלת ההזמנה — כלי של הסוכן להצעות מחיר בלבד
    editablePrices: false,
    // קידומת מספר ההזמנה. עמוד ועד העובדים משתמש בקידומת משלו כדי שאפשר
    // יהיה לסנן את ההזמנות שלו בגיליון בלי לגעת בסקריפט Apps Script.
    orderPrefix: 'AR',
    // אופני התשלום המוצגים בבורר. null = ברירת המחדל (מזומן/אשראי במסירה + ביט מראש).
    paymentOptions: null,
    // חישוב מע״מ ואפשרות עיגול לשקל — נחוצים רק להצעת מחיר, ולכן דף הסוכן בלבד.
    quoteVat: false,
    // פרטי הקשר ברצועה העליונה של תצוגת הסל (מכובה בעמוד רשת החנויות)
    showContact: true,
    // true = דף הסוכן: כפתור שליחה יחיד במקום וואטסאפ/מייל, בורר לקוח ותור
    // אופליין (js/agent.js). כל שאר הקטלוגים נשארים false.
    agentMode: false,
    // "הזמנות אחרונות" כרשימת תאריכים נפתחת במקום ערימת כרטיסים שטוחה.
    // מכובה ב-/care/ (לקוחה פרטית לא חוזרת על אותו סל) וב-/agent/ (המפתח
    // הוא פר-עמוד ולא פר-לקוח, ולכן הרשימה הייתה מערבבת לקוחות; שם יש
    // צ'יפ "ההזמנה הקודמת" פר-לקוח ב-js/agent.js).
    recentOrdersList: true
};

// שיעור המע״מ בישראל. שינוי כאן משנה גם את התצוגה בחלון ההזמנה וגם את המסמך
// המודפס — שניהם קוראים מ-quoteTotals ולא מחשבים בעצמם.
const VAT_RATE = 0.18;
const QUOTE_ROUND_KEY = 'aroam_quote_round';
let CONFIG = {};

// מבצע ברמת הסל (נטען מ-CONFIG.promoSource — קטלוג הטיפוח): {min_total, percent}
let CART_PROMO = null;
let PROMO_WINDOW = { starts: '', ends: '' }; // חלון תוקף גלובלי למבצעים (ריק = בלי הגבלה)

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
    // שורת האריזה נוצרת דינמית ולא כאלמנט ב-HTML, כדי לא לחייב הוספת אותו
    // מזהה בארבעה קבצים נפרדים (catalog, catalog-shell, care, agent)
    const qvPackaging = (() => {
        if (!qvDesc) return null;
        const el = document.createElement("div");
        el.id = "qv-packaging";
        el.className = "qv-packaging";
        el.style.display = "none";
        qvDesc.insertAdjacentElement("afterend", el);
        return el;
    })();
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
    const submitOrderBtn = document.getElementById("submit-order-btn");
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

    // תווית האריזה שמוצגת לקונה. סדר הכרעה: טקסט חופשי מהעורך גובר, אחריו
    // מספר היחידות בקרטון, ורק אם שניהם ריקים — יחידת המידה.
    // הרוב המכריע של המוצרים היום הם "יחידה" בלבד, ולכן הפונקציה מחזירה
    // מחרוזת ריקה במקרה הזה — אין טעם להציג שורה שכתוב בה אותו דבר בכל כרטיס.
    function packLabel(product) {
        if (product.packaging) return product.packaging;
        const qty = parseInt(product.carton_qty, 10);
        if (qty > 0) {
            // "יחידה" מתקצר ל"יח׳" — "קרטון 12 יחידה" לא נקרא נכון בעברית
            const unit = (product.unit || "").trim();
            return "קרטון " + qty + " " + (!unit || unit === "יחידה" ? "יח׳" : unit);
        }
        return "";
    }

    // Recent orders key - היסטוריית הזמנות אחרונות (נשמר בנפרד לקטלוג לקוחות ולגרסת הסוכן)
    const RECENT_KEY = 'aroam_recent_orders_' + (window.location.pathname.split('/')[1] || 'root');
    // עגלה שמורה במכשיר — הלקוח ממשיך מאיפה שהפסיק (מפתח נפרד לכל קטלוג)
    const CART_KEY = 'aroam_cart_' + (window.location.pathname.split('/')[1] || 'root');

    // הודעת אזהרה גלויה ולא-חוסמת: קישור ?cart= (מייל הזמנה, "שתף קישור") שהתיישן —
    // מזהי מוצר שנמחקו/שונו בעורך מאז שהקישור נוצר. בלי ההודעה הפריט פשוט נעלם
    // בשקט מהעגלה. בנויה עם textContent בלבד (לא innerHTML) כי המזהים מגיעים מה-URL.
    function showCartWarning(missingIds) {
        if (!productsEl || !productsEl.parentNode || !missingIds.length) return;
        const banner = document.createElement("div");
        banner.className = "cart-warning-banner";
        banner.setAttribute("role", "alert");

        const textEl = document.createElement("span");
        textEl.className = "cart-warning-text";
        const strong = document.createElement("strong");
        strong.textContent = "שים לב: ";
        textEl.appendChild(strong);
        const itemWord = missingIds.length === 1 ? "פריט אחד" : `${missingIds.length} פריטים`;
        textEl.appendChild(document.createTextNode(
            `${itemWord} מהקישור לא נמצאו בקטלוג הנוכחי ולא נטענו לעגלה (ייתכן שהמוצר הוסר או שהמק"ט שלו השתנה). ` +
            `מזהים חסרים: ${missingIds.join(', ')}. יש להשלים אותם ידנית.`
        ));
        banner.appendChild(textEl);

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "cart-warning-close";
        closeBtn.setAttribute("aria-label", "סגירת ההודעה");
        closeBtn.textContent = "×";
        closeBtn.addEventListener("click", () => banner.remove());
        banner.appendChild(closeBtn);

        productsEl.parentNode.insertBefore(banner, productsEl);
    }

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

        // מתג העיגול לשקל (דף הסוכן בלבד)
        setupQuoteRounding();

        // Prefill saved customer details (אם הלקוח הזמין בעבר)
        prefillCustomerDetails();

        // Apply Config to UI (hide/show buttons)
        applyConfiguration();

        // Load Data
        await loadProducts();

        // סינון לרשימת המוצרים הגלויים (רק כשמוגדר allowedProductsSource — עמוד רשת החנויות).
        // חייב לרוץ לפני בניית הקטגוריות, כדי שקטגוריה בלי מוצרים גלויים לא תופיע כלל.
        await applyProductFilter();

        // Load Promotions (הנחות קטגוריה והנחת סל — רק כשמוגדר promoSource)
        await applyPromotions();

        // שיטות אספקה ודמי משלוח (רק כשמוגדר shippingSource — קטלוג הטיפוח)
        await loadShipping();

        // שחזור עגלה שמורה מהמכשיר (פרמטר cart ב-URL גובר עליה בהמשך)
        try {
            const savedCart = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
            if (savedCart) {
                Object.entries(savedCart).forEach(([id, q]) => {
                    if (q > 0 && PRODUCTS.some(p => p.id === id)) cart[id] = q;
                });
            }
        } catch (e) { /* localStorage unavailable */ }

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
                const missingIds = [];
                items.forEach(item => {
                    const [id, qty] = item.split(':');
                    if (id && qty) {
                        if (PRODUCTS.some(p => p.id === id)) {
                            cart[id] = parseInt(qty, 10);
                        } else {
                            // מזהה שלא קיים בקטלוג הנוכחי — קישור ישן (מייל/שיתוף) שהתיישן
                            missingIds.push(id);
                        }
                    }
                });
                console.log("Restored cart from URL:", cart);
                if (missingIds.length > 0) {
                    console.warn("Cart param referenced missing product ids:", missingIds);
                    showCartWarning(missingIds);
                }
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

        // כניסה ישירה / רענון בכתובת של הסל — פותחים אותו מחדש.
        // עגלה ריקה: מנקים את הפרמטר, כדי שקישור ישן לא ינחית על סל ריק.
        if (CONFIG.cartView && urlParams.get(CART_PARAM) === CART_PARAM_VALUE) {
            if (Object.keys(cart).length > 0) openOrderModal();
            else { try { history.replaceState({}, '', cartUrl(false)); } catch (e) { } }
        }

        // הסימן ש-PRODUCTS נטען, סונן ורונדר. js/agent.js מחכה לזה לפני
        // שהוא מחיל מחירי לקוח — window.APP קיים כבר קודם, אבל ריק מנתונים.
        document.dispatchEvent(new CustomEvent('aroam:app-ready'));
    }

    function applyConfiguration() {
        // דף הסוכן: המחיר בטבלת ההזמנה ניתן לעריכה, ולכן שורת המחיר חייבת
        // להישאר גלויה גם במובייל (כללי הכרטיסים מסתירים אותה בשאר הקטלוגים,
        // שם היא לקריאה בלבד). ה-class הוא הגשר בין הקונפיג ל-CSS.
        document.body.classList.toggle('editable-prices', !!CONFIG.editablePrices);
        // מגדיר את כללי ה-CSS של בורר הלקוח, כותרת הלקוח ומונה התור
        document.body.classList.toggle('agent-mode', !!CONFIG.agentMode);

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

    // תיבת "עיגול לשקל שלם" בחלון ההזמנה. קיימת רק בדף הסוכן, ולכן כל
    // הפונקציה יוצאת בשקט כשאין אלמנט. הבחירה נשמרת במכשיר.
    function setupQuoteRounding() {
        const box = document.getElementById('round-total');
        const label = document.getElementById('round-total-label');
        if (!box) return;
        if (!CONFIG.quoteVat || !CONFIG.showPrices) {
            if (label) label.style.display = 'none';
            return;
        }
        try { box.checked = localStorage.getItem(QUOTE_ROUND_KEY) === '1'; } catch (e) { }
        box.addEventListener('change', () => {
            try { localStorage.setItem(QUOTE_ROUND_KEY, box.checked ? '1' : '0'); } catch (e) { }
            updateSummary();
        });
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
                            // נתיב התמונה הגולמי מה-CSV (יחסי, לא מקודד) — לתעודת ההזמנה (PDF) שנבנית ב-Apps Script;
                            // image (למעלה) הוא הנתיב המוחלט+מקודד לתצוגה בדפדפן ואינו מתאים לשם.
                            rawImage: item.image || "",
                            price: parseFloat(item.price) || 0,
                            // מבצע: original_price קיים רק בקובץ המחירון הנסתר — כשהוא גבוה מהמחיר מוצג "מבצע"
                            original_price: parseFloat(item.original_price) || 0,
                            description: item.description || "", // Optional description
                            // מידע אריזה/קרטון — עמודות אופציונליות, מוצגות רק כשמולאו
                            packaging: (item.packaging || "").trim(),
                            carton_qty: (item.carton_qty || "").toString().trim(),
                            brand: (item.brand || "").trim() || detectBrand(item.name), // עמודת brand בקובץ גוברת על זיהוי אוטומטי
                            // מבצע חבילה ותוקף — קיימים רק בקובץ המחירון (בקטלוג הרגיל העמודות לא קיימות)
                            bundle: (item.bundle || "").trim(),
                            promo_start: (item.promo_start || "").trim(),
                            promo_end: (item.promo_end || "").trim()
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

    // --- סינון לרשימת מוצרים גלויים (CONFIG.allowedProductsSource) ---
    // עמוד רשת החנויות טוען את הקטלוג הראשי ומציג ממנו רק את המוצרים שרועי בחר,
    // כדי שלא ייווצר עותק שני של products.csv שמתיישן. הקובץ מבנהו {"products": [id, ...]}.
    // כל מסלול כישלון — קובץ חסר, JSON פגום, רשימה ריקה — משאיר את הקטלוג המלא,
    // כדי שהעמוד לא ייראה שבור לפני שהרשימה הוגדרה בעורך.
    async function applyProductFilter() {
        if (!CONFIG.allowedProductsSource) return;
        try {
            const res = await fetch(CONFIG.allowedProductsSource + '?_t=' + Math.floor(Date.now() / 3600000));
            if (!res.ok) return;
            const data = await res.json();

            const ids = data.products;
            if (Array.isArray(ids) && ids.length) {
                const allowed = new Set(ids.map(String));
                PRODUCTS = PRODUCTS.filter(p => allowed.has(p.id));
                console.log(`Filtered to ${PRODUCTS.length} allowed products`);
            }

            // שם ומחיר ייעודיים לרשת. השם מחליף את שם הקטלוג בכל מקום שקורא
            // product.name (כרטיס, חיפוש, טבלת ההזמנה, ההודעה והפיילוד).
            // המחיר אינו מוצג בעמוד (showPrices כבוי) אבל כן נכנס לפיילוד,
            // ולכן הגיליון ותעודת ה-PDF מראים את הסכום לפי מחירי הרשת.
            const overrides = data.overrides;
            if (overrides && typeof overrides === 'object') {
                PRODUCTS.forEach(p => {
                    const o = overrides[p.id];
                    if (!o) return;
                    if (o.name) p.name = String(o.name);
                    const price = parseFloat(o.price);
                    if (price > 0) p.price = price;
                });
            }
        } catch (e) {
            console.warn('טעינת רשימת המוצרים הגלויים נכשלה — מוצג הקטלוג המלא', e);
        }
    }

    // --- Brand Filter UI (תפריט סינון מותגים ליד החיפוש) ---
    // --- מבצעים כלליים (קטלוג הטיפוח): הנחות קטגוריה + הנחת סל ---
    async function applyPromotions() {
        if (!CONFIG.promoSource) return;
        try {
            const res = await fetch(CONFIG.promoSource + '?_t=' + Math.floor(Date.now() / 3600000));
            if (!res.ok) return;
            const promo = await res.json();
            window.CATALOG_PROMO = promo; // נגיש גם לסקריפט הבאנר בעמוד

            PROMO_WINDOW = promo.window || { starts: '', ends: '' };

            // מבצע פרטני שפג תוקף — חוזרים למחיר הרגיל (price בקובץ הוא מחיר המבצע)
            PRODUCTS.forEach(p => {
                if (p.original_price > p.price && !productPromoActive(p)) {
                    p.price = p.original_price;
                    p.original_price = 0;
                }
                if (p.bundle && !productPromoActive(p)) p.bundle = '';
            });

            // הנחת קטגוריה: כל כלל נבדק לפי התאריכים שלו (אחרת החלון הגלובלי)
            (promo.category_discounts || []).forEach(rule => {
                const pct = parseFloat(rule.percent);
                if (!(pct > 0) || !rule.category || !scopedActive(rule)) return;
                PRODUCTS.forEach(p => {
                    if (p.category !== rule.category) return;
                    if (p.original_price > p.price) return; // מבצע פרטני גובר
                    if (!(p.price > 0)) return;
                    if (!productPromoActive(p)) return;     // תאריכי המוצר גוברים
                    const discounted = Math.round(p.price * (1 - pct / 100) * 10) / 10;
                    if (discounted < p.price) {
                        p.original_price = p.price;
                        p.price = discounted;
                        p._catRule = rule;                  // לזיהוי תאריך התוקף הרלוונטי
                    }
                });
            });

            const cd = promo.cart_discount;
            const minTotal = cd ? parseFloat(cd.min_total) || 0 : 0;
            const minItems = cd ? parseInt(cd.min_items, 10) || 0 : 0;
            if (cd && cd.enabled && scopedActive(cd) && parseFloat(cd.percent) > 0 && (minTotal > 0 || minItems > 0)) {
                CART_PROMO = { min_total: minTotal, min_items: minItems, percent: parseFloat(cd.percent) };
            }
        } catch (e) {
            console.warn('Promotions load failed', e);
        }
    }

    // --- תוקף מבצעים ומבצעי חבילה (1+1 / 2+1) ---
    // תאריך מקומי כ-YYYY-MM-DD להשוואה לקסיקוגרפית מול התאריכים בקובץ
    function todayISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // מבצע בתוקף היום (כולל קצוות). מחרוזת ריקה = בלי הגבלה מאותו צד
    function promoActive(starts, ends) {
        const today = todayISO();
        if (starts && today < starts) return false;
        if (ends && today > ends) return false;
        return true;
    }

    // תאריכי המוצר גוברים על החלון הגלובלי
    function productPromoActive(p) {
        if (p.promo_start || p.promo_end) return promoActive(p.promo_start, p.promo_end);
        return promoActive(PROMO_WINDOW.starts, PROMO_WINDOW.ends);
    }

    // תוקף של מבצע כללי (באנר / הנחת סל / כלל קטגוריה):
    // תאריכים משלו גוברים, אחרת נופלים לחלון הגלובלי
    function scopedActive(rule) {
        if (rule && (rule.starts || rule.ends)) return promoActive(rule.starts, rule.ends);
        return promoActive(PROMO_WINDOW.starts, PROMO_WINDOW.ends);
    }

    // "2+1" → {buy:2, free:1}; קלט לא תקין → null
    function parseBundle(str) {
        const m = /^(\d{1,2})\+(\d{1,2})$/.exec((str || "").replace(/\s/g, ""));
        if (!m) return null;
        const buy = parseInt(m[1], 10), free = parseInt(m[2], 10);
        if (buy < 1 || free < 1) return null;
        return { buy: buy, free: free };
    }

    // כמות בתשלום לפי מבצע חבילה: כל (buy+free) יחידות → free חינם
    function chargeableQty(product, qty) {
        const b = parseBundle(product && product.bundle);
        if (!b || !(qty > 0)) return qty;
        const group = b.buy + b.free;
        const freeUnits = Math.floor(qty / group) * b.free;
        return qty - freeUnits;
    }

    // מספר היחידות שהלקוח מקבל חינם (לתצוגה בטבלת ההזמנה ובהודעה)
    function freeQty(product, qty) {
        return qty - chargeableQty(product, qty);
    }

    // תאריך הסיום הרלוונטי למוצר, לפי סדר עדיפויות:
    // תאריכי המוצר → תאריך כלל הקטגוריה שהוחל עליו → החלון הגלובלי
    function promoEndFor(p) {
        if (p.promo_start || p.promo_end) return p.promo_end || '';
        if (p._catRule && (p._catRule.starts || p._catRule.ends)) return p._catRule.ends || '';
        return PROMO_WINDOW.ends || '';
    }

    // האם למוצר יש מבצע פעיל כלשהו (מחיר מבצע / הנחת קטגוריה / חבילה)
    function hasActivePromo(p) {
        return p.original_price > p.price || !!parseBundle(p.bundle);
    }

    // DD.MM.YYYY לתצוגה
    function fmtDateHe(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
        return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
    }

    // תווית מבצע חבילה ("1+1") — תג בלבד
    function appendBundleInfo(priceEl, product) {
        if (!parseBundle(product.bundle)) return;
        const badge = document.createElement("span");
        badge.className = "bundle-badge";
        badge.textContent = product.bundle;
        priceEl.appendChild(badge);
    }

    // "עד DD.MM" בטקסט קטן צמוד לתג — לכל מבצע פעיל (מחיר מבצע, הנחת קטגוריה או חבילה)
    function appendPromoValidity(priceEl, product) {
        if (!hasActivePromo(product)) return;
        const end = promoEndFor(product);
        if (!end) return;
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end);
        if (!m) return;
        const validity = document.createElement("span");
        validity.className = "promo-validity";
        validity.textContent = `עד ${m[3]}.${m[2]}`;
        validity.title = `המבצע בתוקף עד ${m[3]}.${m[2]}.${m[1]}`;
        priceEl.appendChild(validity);
    }

    // הנחת הסל (0 אם לא הופעלה או שלא הגיעו לרף הסכום/הכמות). עיגול ל-10 אגורות
    function cartDiscountFor(total, itemCount) {
        if (!CART_PROMO) return 0;
        const byTotal = CART_PROMO.min_total > 0 && total >= CART_PROMO.min_total;
        const byItems = CART_PROMO.min_items > 0 && itemCount >= CART_PROMO.min_items;
        if (!byTotal && !byItems) return 0;
        return Math.round(total * CART_PROMO.percent / 100 * 10) / 10;
    }

    // --- שיטות אספקה ואופן תשלום (קטלוג הטיפוח בלבד, דרך CONFIG.shippingSource) ---
    let SHIPPING_METHODS = [];      // רק השיטות הפעילות, לפי הסדר בקובץ
    let selectedShippingId = null;
    let selectedPaymentId = null;
    const SHIPPING_KEY = 'aroam_fulfillment_' + (window.location.pathname.split('/')[1] || 'root');
    const DEFAULT_PAYMENT_OPTIONS = [
        { id: 'on_delivery', label: 'מזומן או אשראי במסירה' },
        { id: 'prepaid', label: 'ביט / פייבוקס מראש' }
    ];
    // נקרא כפונקציה ולא כקבוע, כי CONFIG נטען בתוך init() — קבוע היה תלוי
    // בסדר ההערכה של הקובץ. עמוד ועד העובדים גובה טלפונית ולכן מציג אפשרות אחת.
    function paymentOptions() {
        return (Array.isArray(CONFIG.paymentOptions) && CONFIG.paymentOptions.length)
            ? CONFIG.paymentOptions
            : DEFAULT_PAYMENT_OPTIONS;
    }

    // טעינת קונפיג האספקה. כשל טעינה משאיר את הרשימה ריקה — העמוד מתנהג
    // בדיוק כמו לפני התוספת ולא נשבר.
    async function loadShipping() {
        if (!CONFIG.shippingSource) return;
        try {
            const res = await fetch(CONFIG.shippingSource + '?_t=' + Date.now());
            if (!res.ok) return;
            const cfg = await res.json();
            SHIPPING_METHODS = (cfg.methods || []).filter(m => m && m.enabled);
        } catch (e) {
            console.warn('טעינת שיטות האספקה נכשלה — ההזמנה תמשיך בלי בורר משלוח', e);
            return;
        }
        try {
            const saved = JSON.parse(localStorage.getItem(SHIPPING_KEY) || 'null') || {};
            if (SHIPPING_METHODS.some(m => m.id === saved.shipping)) selectedShippingId = saved.shipping;
            if (paymentOptions().some(p => p.id === saved.payment)) selectedPaymentId = saved.payment;
        } catch (e) { }
        if (!selectedShippingId && SHIPPING_METHODS.length) selectedShippingId = SHIPPING_METHODS[0].id;
        if (!selectedPaymentId) selectedPaymentId = paymentOptions()[0].id;
    }

    function selectedShipping() {
        return SHIPPING_METHODS.find(m => m.id === selectedShippingId) || null;
    }

    // דמי המשלוח בפועל. מחושבים על הסכום שאחרי הנחת הסל — כך "חינם מעל"
    // מתייחס למה שהלקוח באמת משלם, ולא לסכום שלפני ההנחה.
    function shippingFeeFor(totalAfterDiscount) {
        const m = selectedShipping();
        if (!m || !(m.fee > 0)) return 0;
        if (m.free_above > 0 && totalAfterDiscount >= m.free_above) return 0;
        return m.fee;
    }

    // פירוק הסכום להזמנה — מקור אמת יחיד להודעה, לגיליון ולסיכום בעמוד
    function orderTotals() {
        const { totalPrice, totalItems } = getCartItemsData();
        const discount = cartDiscountFor(totalPrice, totalItems);
        const shipping = totalItems > 0 ? shippingFeeFor(totalPrice - discount) : 0;
        return {
            subtotal: totalPrice,
            discount: discount,
            shipping: shipping,
            total: totalPrice - discount + shipping,
            totalItems: totalItems
        };
    }

    // האם הסוכן ביקש לעגל את הסה"כ לשקל שלם (נזכר בין ביקורים)
    function quoteRounding() {
        const box = document.getElementById('round-total');
        return !!(box && box.checked);
    }

    // מקור האמת היחיד למע"מ ולעיגול — גם התצוגה בחלון ההזמנה וגם המסמך
    // המודפס קוראים מכאן. העיגול מוחל על הסה"כ, והמע"מ נגזר ממנו בחזרה,
    // כדי ששלוש השורות במסמך תמיד יסתכמו לסכום שכתוב בהן.
    function quoteTotals(net) {
        const rounded = quoteRounding();
        let gross = net * (1 + VAT_RATE);
        if (rounded) gross = Math.round(gross);
        return { net: net, vat: gross - net, gross: gross, rounded: rounded };
    }

    // כמה חסר למשלוח חינם (0 = לא רלוונטי או שכבר הושג)
    function freeShippingGap(totalAfterDiscount) {
        const m = selectedShipping();
        if (!m || !(m.fee > 0) || !(m.free_above > 0)) return 0;
        const gap = m.free_above - totalAfterDiscount;
        return gap > 0 ? gap : 0;
    }

    // בוררי האספקה והתשלום במודאל ההזמנה. נבנים דינמית כדי לא לחייב
    // את אותם מזהי HTML בכל הקטלוגים.
    function renderFulfillmentOptions() {
        const host = document.getElementById('fulfillment-options');
        if (!host) return;
        if (!SHIPPING_METHODS.length) { host.style.display = 'none'; return; }
        host.style.display = 'flex';
        host.innerHTML = '';

        const group = (title, options, currentId, onPick) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex; flex-direction:column; gap:0.4rem;';
            const h = document.createElement('strong');
            h.textContent = title;
            h.style.cssText = 'font-size:0.9rem; color:var(--text-secondary);';
            wrap.appendChild(h);
            options.forEach(opt => {
                const label = document.createElement('label');
                label.style.cssText = 'display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-size:0.95rem;';
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = title;
                radio.checked = opt.id === currentId;
                radio.addEventListener('change', () => { onPick(opt.id); });
                label.appendChild(radio);
                const text = document.createElement('span');
                text.textContent = opt.text;
                label.appendChild(text);
                wrap.appendChild(label);
            });
            host.appendChild(wrap);
        };

        group('שיטת אספקה', SHIPPING_METHODS.map(m => {
            let text = m.label;
            const extras = [];
            if (m.fee > 0) {
                extras.push(`₪${m.fee.toFixed(2)}`);
                if (m.free_above > 0) extras.push(`חינם מעל ₪${m.free_above.toFixed(0)}`);
            } else {
                extras.push('ללא עלות');
            }
            if (m.note) extras.push(m.note);
            return { id: m.id, text: `${text} — ${extras.join(' · ')}` };
        }), selectedShippingId, (id) => {
            selectedShippingId = id;
            persistFulfillment();
            syncAddressVisibility();
            updateSummary();
        });

        group('אופן תשלום', paymentOptions().map(p => ({ id: p.id, text: p.label })),
            selectedPaymentId, (id) => { selectedPaymentId = id; persistFulfillment(); });

        syncAddressVisibility();
    }

    function persistFulfillment() {
        try {
            localStorage.setItem(SHIPPING_KEY, JSON.stringify({
                shipping: selectedShippingId, payment: selectedPaymentId
            }));
        } catch (e) { }
    }

    // כתובת נדרשת רק כשהשיטה היא משלוח בפועל; באיסוף עצמי/לוקר היא רק מבלבלת
    function syncAddressVisibility() {
        const field = document.getElementById('cust-address-field');
        if (!field) return;
        const m = selectedShipping();
        field.style.display = (m && m.needs_address) ? '' : 'none';
    }

    function paymentLabel() {
        const p = paymentOptions().find(o => o.id === selectedPaymentId);
        return p ? p.label : '';
    }

    // נאדג': "עוד X ₪ / Y פריטים ותקבל הנחה" — מוצג כשמבצע סל פעיל והלקוח מתחת לרף.
    // מופיע בבר התחתון (מתחת לכפתור ההזמנה) ובראש מודאל ההזמנה.
    function updatePromoNudge(totalPrice, totalItems, cartDiscount) {
        const barNudge = document.getElementById('promo-nudge-bar');
        const modalNudge = document.getElementById('promo-nudge-modal');

        let msg = '';
        if (CART_PROMO && cartDiscount === 0 && totalItems > 0) {
            const parts = [];
            if (CART_PROMO.min_total > 0 && totalPrice < CART_PROMO.min_total) {
                const gap = CART_PROMO.min_total - totalPrice;
                parts.push(`עוד ${gap.toFixed(2)} ₪`);
            }
            if (CART_PROMO.min_items > 0 && totalItems < CART_PROMO.min_items) {
                const gap = CART_PROMO.min_items - totalItems;
                parts.push(`עוד ${gap} פריטים`);
            }
            const pct = Number.isInteger(CART_PROMO.percent) ? CART_PROMO.percent : CART_PROMO.percent.toFixed(1);
            if (parts.length) msg = `🎁 ${parts.join(' או ')} ותקבלו ${pct}% הנחה על כל ההזמנה!`;
        } else if (CART_PROMO && cartDiscount > 0) {
            const pct = Number.isInteger(CART_PROMO.percent) ? CART_PROMO.percent : CART_PROMO.percent.toFixed(1);
            msg = `✅ מזל טוב! קיבלתם ${pct}% הנחה על ההזמנה`;
        }

        if (barNudge) {
            barNudge.textContent = msg;
            barNudge.style.display = msg ? 'block' : 'none';
        }

        // "עוד X ₪ למשלוח חינם" — רק במודאל, שם דמי המשלוח גלויים ממילא.
        // הבר התחתון נשאר עם נאדג' הנחת הסל בלבד כדי לא להעמיס אותו.
        if (modalNudge) {
            const shipGap = totalItems > 0 ? freeShippingGap(totalPrice - cartDiscount) : 0;
            const shipMsg = shipGap > 0 ? `עוד ${shipGap.toFixed(2)} ₪ ותקבלו משלוח חינם` : '';
            const full = [msg, shipMsg].filter(Boolean).join('\n');
            modalNudge.textContent = full;
            modalNudge.style.whiteSpace = 'pre-line';
            modalNudge.style.display = full ? 'block' : 'none';
        }
    }

    // ניסוח מבצע הסל לתצוגה (באנר / קטגוריית מבצעים)
    function cartPromoText() {
        if (!CART_PROMO) return '';
        const conditions = [];
        if (CART_PROMO.min_total > 0) conditions.push(`מעל ${CART_PROMO.min_total} ₪`);
        if (CART_PROMO.min_items > 0) conditions.push(`${CART_PROMO.min_items} פריטים ומעלה`);
        const pct = Number.isInteger(CART_PROMO.percent) ? CART_PROMO.percent : CART_PROMO.percent.toFixed(1);
        return `בקנייה של ${conditions.join(' או ')} — ${pct}% הנחה על כל ההזמנה!`;
    }

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

        // קטגוריית "מבצעים" — מוצגת כשיש מוצרים במבצע או מבצע סל פעיל (רק בקטלוג הטיפוח)
        if (PRODUCTS.some(p => p.original_price > p.price || parseBundle(p.bundle)) || CART_PROMO) {
            const saleBtn = document.createElement("button");
            saleBtn.type = "button";
            saleBtn.className = "cat-btn cat-btn-sale" + (activeCategory === 'sales' ? " active" : "");
            saleBtn.textContent = "מבצעים";
            saleBtn.addEventListener("click", () => {
                if (searchInput) searchInput.value = "";
                resetBrandFilter();
                activeCategory = 'sales';
                document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
                saleBtn.classList.add("active");
                renderProducts();
            });
            categoriesEl.appendChild(saleBtn);
        }

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

    // שורת "X מוצרים" + מיון מעל הרשת. נבנית פעם אחת ומתעדכנת בכל רינדור.
    // עד כה לא היה שום סימן כמה מוצרים יש בקטגוריה ולא הייתה אפשרות מיון.
    let sortMode = (() => {
        try { return localStorage.getItem('aroam_catalog_sort') || 'default'; } catch (e) { return 'default'; }
    })();

    function renderResultsBar(count) {
        if (!productsEl || !productsEl.parentNode) return;
        let bar = document.getElementById('results-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'results-bar';
            bar.className = 'results-bar';
            bar.innerHTML =
                '<span class="results-count"></span>' +
                '<label class="results-sort">מיון' +
                '<select id="sort-select" aria-label="מיון מוצרים">' +
                '<option value="default">ברירת מחדל</option>' +
                '<option value="name">לפי שם</option>' +
                '<option value="brand">לפי מותג</option>' +
                '</select></label>';
            productsEl.parentNode.insertBefore(bar, productsEl);
            const sel = bar.querySelector('#sort-select');
            sel.value = sortMode;
            sel.addEventListener('change', () => {
                sortMode = sel.value;
                try { localStorage.setItem('aroam_catalog_sort', sortMode); } catch (e) { }
                renderProducts();
            });
        }
        // הרשימה הנפתחת מסתירה את הסרגל (אין "N מוצרים" כשמוצגות הזמנות),
        // ולכן כל רינדור רגיל חייב להחזיר אותו
        bar.style.display = '';
        bar.querySelector('.results-count').textContent =
            count === 1 ? "מוצר אחד" : count + " מוצרים";
    }

    function renderProducts() {
        if (!productsEl) return;
        const searchQuery = (searchInput?.value || "").trim();
        productsEl.innerHTML = "";

        // "הזמנות אחרונות": רשימת תאריכים נפתחת במקום ערימת כרטיסים.
        // חיפוש או בחירת מותג גוברים וחוזרים לתצוגת הכרטיסים הרגילה.
        if (CONFIG.recentOrdersList && activeCategory === 'recent' && searchQuery === "" && !activeBrand) {
            const resultsBar = document.getElementById('results-bar');
            if (resultsBar) resultsBar.style.display = 'none';
            productsEl.appendChild(renderRecentOrdersList());
            return;
        }

        let filtered = PRODUCTS;

        if (searchQuery !== "") {
            // חיפוש לפי מילים: כל מילה בשאילתה חייבת להימצא (בכל סדר) בשם/מותג/מק"ט.
            // כך "אולוויז מידה 4" מוצא "תחבושות אולוויז אולטרה לילה סקיור נייט מידה 4".
            // נירמול מרכאות/גרשיים כדי ש-מ"ל, מ״ל ו-מ׳ל יתאימו זה לזה.
            const normalize = s => (s || "").toLowerCase().replace(/["'`´׳״]/g, "").replace(/\s+/g, " ");
            const nq = normalize(searchQuery);
            const terms = nq.split(" ").filter(Boolean);
            filtered = filtered.filter(p => {
                const hay = normalize(`${p.name} ${p.brand || ""}`);
                if (terms.every(t => hay.includes(t))) return true;   // כל מילה בשם/מותג
                return normalize(p.id || "").includes(nq);            // או מק"ט מלא
            });
        } else if (activeBrand) {
            // בחירת מותג מציגה את כל מוצרי המותג מכל הקטגוריות
            filtered = PRODUCTS.filter(p => p.brand === activeBrand);
        } else if (activeCategory === 'favorites') {
            filtered = PRODUCTS.filter(p => favorites.has(p.id));
        } else if (activeCategory === 'recent') {
            const recentIds = getRecentProductIds();
            filtered = PRODUCTS.filter(p => recentIds.has(p.id));
        } else if (activeCategory === 'sales') {
            filtered = PRODUCTS.filter(p => p.original_price > p.price || parseBundle(p.bundle));
            // מבצע סל פעיל בלי מבצעים פרטניים — המבצע חל על הכול, מציגים את כל המוצרים
            if (filtered.length === 0 && CART_PROMO) filtered = PRODUCTS;
        } else if (activeCategory) {
            filtered = PRODUCTS.filter(p => p.category === activeCategory);
        }

        // מיון — ברירת המחדל היא סדר הקובץ, כדי לא לשנות התנהגות קיימת.
        // "לפי מותג" מקבץ יחד את מוצרי אותו יצרן, וזה מה שקונה עסקי סורק.
        // מוצרים בלי מותג יורדים לסוף במקום להתפזר בין המקובצים.
        if (sortMode === 'name') {
            filtered = filtered.slice().sort((a, b) => a.name.localeCompare(b.name, 'he'));
        } else if (sortMode === 'brand') {
            filtered = filtered.slice().sort((a, b) => {
                const ab = a.brand || "￿", bb = b.brand || "￿";
                return ab === bb ? a.name.localeCompare(b.name, 'he') : ab.localeCompare(bb, 'he');
            });
        }

        renderResultsBar(filtered.length);

        if (filtered.length === 0) {
            productsEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #666;">לא נמצאו מוצרים.</div>';
            return;
        }

        // בקטגוריית המבצעים: שורת הסבר על מבצע הסל (קנייה מעל סכום/כמות)
        if (activeCategory === 'sales' && CART_PROMO && searchQuery === "" && !activeBrand) {
            const note = document.createElement('div');
            note.style.cssText = 'grid-column: 1/-1; background: #fdeeee; color: #c0554d; border: 1px solid #c0554d; border-radius: 10px; padding: 10px 14px; text-align: center; font-weight: 600;';
            note.textContent = cartPromoText();
            productsEl.appendChild(note);
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

            // המותג במקום שם הקטגוריה: הקטגוריה חזרה זהה בכל כרטיס באותה
            // קטגוריה ולא הוסיפה מידע. למותג יש ערך אמיתי לקונה — אבל הוא קיים
            // רק לחלק מהמוצרים, ולכן כשאין מותג לא מוצג כלום (בלי מקף, בלי מקום שמור).
            if (product.brand) {
                const brandChip = document.createElement("span");
                brandChip.className = "product-brand";
                brandChip.textContent = product.brand;
                body.appendChild(brandChip);
            }

            const title = document.createElement("div");
            title.className = "product-title";
            title.textContent = product.name;

            body.appendChild(title);

            // Price - Conditional
            if (CONFIG.showPrices) {
                const price = document.createElement("div");
                price.className = "product-price";
                price.textContent = product.price.toFixed(2) + " ₪";
                if (product.original_price > product.price) {
                    const oldPrice = document.createElement("span");
                    oldPrice.className = "price-old";
                    oldPrice.textContent = product.original_price.toFixed(2) + " ₪";
                    price.appendChild(oldPrice);
                    const saleBadge = document.createElement("span");
                    saleBadge.className = "sale-badge";
                    saleBadge.textContent = "מבצע";
                    price.appendChild(saleBadge);
                }
                appendBundleInfo(price, product);
                appendPromoValidity(price, product);
                body.appendChild(price);
            }

            // שורת מטא אחת: אריזה + מק״ט. קודם הם תפסו שתי שורות נפרדות,
            // והמק״ט קיבל אותו משקל ויזואלי כמו האריזה — שהיא המידע שהקונה
            // העסקי באמת צריך. כשאין מידע אריזה מוצג המק״ט לבדו.
            const meta = document.createElement("div");
            meta.className = "product-meta";
            const packText = packLabel(product);
            if (packText) {
                const pack = document.createElement("span");
                pack.className = "meta-pack";
                pack.textContent = packText;
                meta.appendChild(pack);
            }
            const sku = document.createElement("span");
            sku.className = "meta-sku";
            sku.textContent = product.id;
            meta.appendChild(sku);
            body.appendChild(meta);

            // Footer / Controls
            const footer = document.createElement("div");
            footer.className = "card-footer";

            // יחידת המידה זהה ב-175 מתוך 176 המוצרים ("יחידה"), ולכן היא לא
            // מוסרת מידע ומוצגת רק כשהיא באמת שונה. המידע השימושי עבר לשורת המטא.
            const unitTag = document.createElement("span");
            unitTag.className = "unit-tag";
            const unitText = (product.unit || "").trim();
            unitTag.textContent = (unitText && unitText !== "יחידה") ? unitText : "";

            const qtyControl = document.createElement("div");
            qtyControl.className = "qty-control";

            const minus = document.createElement("button");
            minus.className = "qty-btn";
            minus.textContent = "–";

            const input = document.createElement("input");
            input.type = "number";
            input.className = "qty-input";
            input.min = "0";
            input.setAttribute("aria-label", "כמות - " + product.name);
            const currentQty = cart[product.id] || 0;
            input.value = currentQty > 0 ? currentQty : "";

            const plus = document.createElement("button");
            plus.className = "qty-btn";
            plus.textContent = "+";

            qtyControl.appendChild(minus);
            qtyControl.appendChild(input);
            qtyControl.appendChild(plus);

            footer.appendChild(unitTag);
            footer.appendChild(qtyControl);

            card.appendChild(imgContainer);
            card.appendChild(body);
            card.appendChild(footer);

            // כפתור "הוסף לסל" בולט (קטלוג הטיפוח בלבד, דרך CONFIG.showAddButton).
            // כשהכמות 0 — מוצג הכפתור; כשיש כמות — מוצג בקר הכמות +/-.
            let addBtn = null;
            if (CONFIG.showAddButton) {
                addBtn = document.createElement("button");
                addBtn.className = "add-to-cart-btn";
                addBtn.type = "button";
                addBtn.textContent = "הוסף";
                addBtn.onclick = (e) => { changeQty(product.id, 1, input, e); syncAddState(); };
                footer.appendChild(addBtn);
            }

            // בקר הכמות וכפתור ההוספה מוצגים יחד ולא מתחלפים.
            // קודם הכמות הופיעה רק אחרי לחיצה על "הוסף", כך שהזמנה של 6 קרטונים
            // דרשה 7 קליקים; הקונה החוזר יודע מראש כמה הוא רוצה.
            // הכפתור משנה מראה בלבד — מלא כשיש כמות בסל, מתאר כשאין.
            const syncAddState = () => {
                if (!CONFIG.showAddButton) return;
                const has = (cart[product.id] || 0) > 0;
                card.classList.toggle("in-cart", has);
                if (addBtn) addBtn.textContent = has ? "בסל" : "הוסף";
            };
            syncAddState();

            minus.onclick = () => { changeQty(product.id, -1, input); syncAddState(); };
            plus.onclick = (e) => { changeQty(product.id, 1, input, e); syncAddState(); };
            input.onchange = () => { setQtyFromInput(product.id, input); syncAddState(); };

            productsEl.appendChild(card);
        });
    }

    // מעקב אירועים: שולח גם ל-dataLayer (GTM) וגם ל-GA4, באותה תבנית של order_sent.
    // עד כה דווח רק order_sent — כלומר לא היה מידע על מה שקורה לפני השליחה.
    function trackEvent(name, params) {
        try {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push(Object.assign({ event: name }, params));
            if (typeof gtag === 'function') gtag('event', name, params);
        } catch (e) {
            /* מעקב לא אמור להפיל את הקטלוג */
        }
    }

    // נעילת גלילת הרקע כשמודאל כלשהו פתוח
    function syncModalScrollLock() {
        document.body.style.overflow = document.querySelector(".modal-overlay.open") ? "hidden" : "";
    }

    // --- תצוגת סל מלאת-מסך (CONFIG.cartView) ---
    // הסל מקבל כתובת משלו (?cart=1) כדי ש-GA4 יראה אותו כשלב במשפך, שכפתור
    // "אחורה" יסגור אותו במקום לצאת מהעמוד, ושאפשר יהיה לבנות קהל רימרקטינג
    // של "הגיע לסל ולא הזמין". המצב כבוי בדף הסוכן.
    // הפרמטר הוא view=cart ולא cart=1: הפרמטר `cart` כבר תפוס לשיתוף עגלה
    // בפורמט cart=id:qty,id:qty ("שתף קישור"), ואסור להתנגש בו.
    const CART_PARAM = 'view';
    const CART_PARAM_VALUE = 'cart';
    let cartStatePushed = false;   // האם אנחנו דחפנו את המצב להיסטוריה

    function cartUrl(open) {
        const url = new URL(window.location.href);
        if (open) url.searchParams.set(CART_PARAM, CART_PARAM_VALUE);
        else url.searchParams.delete(CART_PARAM);
        return url.pathname + (url.search || '') + url.hash;
    }

    function openOrderModal() {
        if (!orderModal) return;
        fillOrderTable();
        renderFulfillmentOptions();
        orderModal.classList.add("open");
        if (CONFIG.cartView) {
            orderModal.classList.add("cart-page");
            // שורות מוצר עשירות (תמונה גדולה) רק בקטלוג עם מחירים — קטלוג הטיפוח.
            // בקטלוג העסקי הטבלה הקומפקטית עדיפה להזמנה של עשרות מק"טים.
            if (CONFIG.showPrices) orderModal.classList.add("cart-rich");
            renderCartChrome();
            renderCartSummaryCard();
            updateSummary();
            if (!cartStatePushed) {
                try { history.pushState({ cartOpen: true }, '', cartUrl(true)); cartStatePushed = true; } catch (e) { }
            }
        }
        syncModalScrollLock();
        const items = Object.keys(cart).length;
        if (items > 0) {
            trackEvent("begin_checkout", { order_items: items });
            if (CONFIG.cartView) {
                // page_view וירטואלי — בלעדיו לסל אין קיום בדוחות GA4
                trackEvent("view_cart", { order_items: items });
                if (typeof gtag === 'function') {
                    // נתיב קנוני ולא cartUrl(): פרמטרים אחרים (למשל cart=id:qty
                    // של "שתף קישור") היו מפצלים את הסל להמון עמודים בדוח
                    gtag('event', 'page_view', {
                        page_path: window.location.pathname + '?' + CART_PARAM + '=' + CART_PARAM_VALUE,
                        page_title: 'סיכום הזמנה'
                    });
                }
            }
        }
    }

    // סגירה: נתיב יחיד לכל דרכי הסגירה (כפתור, Esc, אחרי שליחה)
    function closeOrderView(fromPopstate) {
        if (!orderModal) return;
        orderModal.classList.remove("open");
        orderModal.classList.remove("cart-page");
        orderModal.classList.remove("cart-rich");
        syncModalScrollLock();
        if (!CONFIG.cartView || fromPopstate) { cartStatePushed = false; return; }
        if (cartStatePushed) {
            cartStatePushed = false;
            try { history.back(); } catch (e) { }
        } else {
            // נכנסו ישירות עם ?cart=1 — מנקים את הפרמטר בלי להוסיף צעד להיסטוריה
            try { history.replaceState({}, '', cartUrl(false)); } catch (e) { }
        }
    }

    // כרטיס הסיכום — עוגן ויזואלי בטור הצדדי. בלי מחירים (הקטלוג העסקי)
    // הוא מציג ספירת פריטים בלבד, כי אין מה לסכם.
    function renderCartSummaryCard() {
        const body = orderModal && orderModal.querySelector('.modal-body');
        if (!body || document.getElementById('cart-summary-card')) return;

        // מצב סל ריק, מוזרק פעם אחת מעל טבלת ההזמנה
        const tableWrap = body.querySelector('.table-responsive');
        if (tableWrap && !document.getElementById('cart-empty')) {
            const empty = document.createElement('div');
            empty.id = 'cart-empty';
            empty.style.display = 'none';
            empty.innerHTML = `
                <strong>הסל ריק</strong>
                <span>הוסיפו מוצרים מהקטלוג והם יופיעו כאן.</span>
                <button type="button" class="btn btn-outline">→ חזרה לקטלוג</button>
            `;
            empty.querySelector('button').addEventListener('click', () => closeOrderView());
            tableWrap.parentNode.insertBefore(empty, tableWrap);
        }

        const card = document.createElement('aside');
        card.id = 'cart-summary-card';
        card.innerHTML = `
            <h3 class="cs-title">סיכום הזמנה</h3>
            <dl class="cs-lines"></dl>
            <div class="cs-total">
                <span>${CONFIG.showPrices ? 'סה״כ לתשלום' : 'סה״כ פריטים'}</span>
                <strong id="cs-total-value">—</strong>
            </div>
            <button type="button" id="cs-send-btn" class="btn btn-success">שלח הזמנה בוואטסאפ</button>
            <div class="cs-secondary">
                <button type="button" data-proxy="send-email">שליחה במייל</button>
                <span aria-hidden="true">·</span>
                <button type="button" data-proxy="clear-cart-btn">ניקוי הסל</button>
            </div>
            <p class="cs-note">ההזמנה נשלחת לאישור — נחזור אליכם בהקדם.</p>
        `;
        // הכפתורים בכרטיס מפעילים את הכפתורים הקיימים בפוטר — לוגיקת השליחה
        // נשארת במקום אחד, והפוטר מוסתר בדסקטופ כדי שלא תהיה כפילות
        card.querySelector('#cs-send-btn').addEventListener('click', () => {
            document.getElementById('send-whatsapp')?.click();
        });
        card.querySelectorAll('[data-proxy]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById(btn.dataset.proxy)?.click();
            });
        });
        body.appendChild(card);
    }

    function updateCartSummaryCard(totals) {
        const lines = document.querySelector('#cart-summary-card .cs-lines');
        const totalEl = document.getElementById('cs-total-value');
        if (!lines || !totalEl) return;

        const rows = [];
        if (CONFIG.showPrices) {
            rows.push(['סכום ביניים', `₪${totals.subtotal.toFixed(2)}`, '']);
            if (totals.discount > 0) {
                rows.push([`הנחת מבצע (${CART_PROMO.percent}%)`, `-₪${totals.discount.toFixed(2)}`, 'cs-save']);
            }
            const m = selectedShipping();
            if (m) {
                rows.push(['דמי משלוח', totals.shipping > 0 ? `₪${totals.shipping.toFixed(2)}` : 'ללא עלות', '']);
            }
            rows.push(['פריטים', String(totals.totalItems), '']);
            totalEl.textContent = `₪${totals.total.toFixed(2)}`;
        } else {
            rows.push(['סוגי מוצרים', String(Object.keys(cart).length), '']);
            totalEl.textContent = String(totals.totalItems);
        }

        lines.innerHTML = rows.map(([k, v, cls]) =>
            `<div class="cs-line ${cls}"><dt>${k}</dt><dd>${v}</dd></div>`).join('');

        const send = document.getElementById('cs-send-btn');
        if (send) send.disabled = totals.totalItems === 0;
    }

    // כרום התצוגה: רצועת ה-utility והלוגו של האתר, כדי שהסל ירגיש חלק
    // מהאתר ולא מסך זר — התצוגה מלאת-המסך מסתירה את הכרום האמיתי.
    function renderCartChrome() {
        const content = orderModal.querySelector('.modal-content');
        const header = orderModal.querySelector('.modal-header');
        if (!content || !header) return;

        if (!content.querySelector('.cart-utility-bar')) {
            const bar = document.createElement('div');
            bar.className = 'cart-utility-bar';
            // עמוד רשת החנויות מכבה את פרטי הקשר (showContact: false): שם אין
            // ערוץ פנייה ישיר, וההזמנה נשלחת דרך כפתור השליחה בלבד.
            const contact = CONFIG.showContact === false ? ''
                : '<a href="tel:036346236">03-6346236</a>';
            bar.innerHTML = `
                <div class="cub-inner">
                    <span>אור יהודה · משלוחים בגוש דן והמרכז</span>
                    ${contact}
                </div>
            `;
            content.insertBefore(bar, content.firstChild);
        }

        if (!header.querySelector('.cart-logo')) {
            const logo = document.createElement('img');
            logo.className = 'cart-logo';
            logo.src = '/images/logo.png';
            logo.alt = 'אהרוני שיווק והפצה';
            logo.width = 100;
            logo.height = 60;
            header.insertBefore(logo, header.firstChild);
        }

        // "המשך בקנייה" — בתצוגת מסך מלא ה-× לבדו לא מספיק ברור
        if (!header.querySelector('#cart-back-btn')) {
            const btn = document.createElement('button');
            btn.id = 'cart-back-btn';
            btn.type = 'button';
            btn.className = 'btn btn-outline';
            btn.textContent = '→ המשך בקנייה';
            btn.addEventListener('click', () => closeOrderView());
            header.appendChild(btn);
        }
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
            closeOrderBtn.addEventListener("click", () => closeOrderView());
        }

        if (orderModal) {
            orderModal.addEventListener("click", (e) => {
                // בתצוגת מסך מלא הרקע הוא כל המסך — לחיצה עליו אסור שתסגור את הסל
                if (e.target === orderModal && !orderModal.classList.contains("cart-page")) {
                    closeOrderView();
                }
            });
        }

        // כפתור "אחורה" סוגר את הסל במקום לצאת מהקטלוג
        window.addEventListener('popstate', () => {
            if (orderModal && orderModal.classList.contains('cart-page')) {
                closeOrderView(true);
            }
        });

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
                    const sent = commitOrder('whatsapp');
                    if (!sent) return;

                    const text = encodeURIComponent(buildMessage(sent.orderId));
                    const phone = "972526000158";
                    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");

                    // חלון אישור ללקוח
                    showOrderConfirmation(sent.orderId, 'whatsapp');
                });
            }

            if (sendEmailBtn) {
                sendEmailBtn.addEventListener("click", () => {
                    const sent = commitOrder('email');
                    if (!sent) return;

                    const subject = encodeURIComponent(`הצעת מחיר - מספר הזמנה #${sent.orderId}`);
                    const body = encodeURIComponent(buildMessage(sent.orderId));
                    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent("meiraroam@gmail.com")}&su=${subject}&body=${body}`, "_blank");

                    // חלון אישור ללקוח
                    showOrderConfirmation(sent.orderId, 'email');
                });
            }
        }

        // דף הסוכן: כפתור שליחה יחיד. אין כאן וואטסאפ/מייל כי הנמען הוא רועי
        // עצמו — ההזמנה פשוט נדחפת ל-webhook, וזה גם מה שמאפשר להכניס אותה
        // לתור כשאין רשת (js/agent.js).
        if (CONFIG.agentMode && submitOrderBtn) {
            submitOrderBtn.addEventListener("click", () => {
                if (Object.keys(cart).length === 0) {
                    showToast("ההזמנה ריקה");
                    return;
                }
                const sent = commitOrder('agent');
                if (!sent) return;
                showOrderConfirmation(sent.orderId, 'agent');
            });
        }

        // כפתור ההדפסה מחווט ל-printQuote בתחתית הקובץ (onclick). לא לרשום כאן
        // מאזין נוסף — שני ה-handlers היו רצים, והדפסה גולמית של המודאל הייתה
        // מתווספת למסמך ההצעה המעוצב.
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

        // add_to_cart נשלח רק במעבר מ-0 לכמות כלשהי, כדי שכל לחיצה על "+"
        // לא תיספר כהוספה נפרדת ותנפח את הנתונים
        if (current === 0 && next > 0) {
            const product = PRODUCTS.find(p => p.id === id);
            if (product) {
                trackEvent("add_to_cart", {
                    item_id: product.id,
                    item_name: product.name,
                    item_category: product.category
                });
            }
        }

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
            // מבצע חבילה: משלמים רק על היחידות המחויבות (1+1 → 2 יח' = תשלום על 1)
            totalPrice += chargeableQty(product, qty) * product.price;
        }

        if (summaryItemsEl) summaryItemsEl.textContent = totalItems;

        // הנחת סל (מבצע "קנייה מעל X") — מוצגת כשורה נפרדת לפני הסה"כ
        const cartDiscount = cartDiscountFor(totalPrice, totalItems);
        // דמי משלוח מתווספים אחרי ההנחה. בעגלה ריקה אין משלוח.
        const shippingFee = totalItems > 0 ? shippingFeeFor(totalPrice - cartDiscount) : 0;
        const finalTotal = totalPrice - cartDiscount + shippingFee;
        if (summaryTotalEl) {
            let discountEl = document.getElementById('summary-discount');
            if (cartDiscount > 0 && CONFIG.showPrices) {
                if (!discountEl) {
                    discountEl = document.createElement('div');
                    discountEl.id = 'summary-discount';
                    discountEl.style.cssText = 'font-size:0.9rem; color:#c0554d; font-weight:600;';
                    summaryTotalEl.parentNode.parentNode.insertBefore(discountEl, summaryTotalEl.parentNode);
                }
                discountEl.textContent = `הנחת מבצע (${CART_PROMO.percent}%): ‎-₪${cartDiscount.toFixed(2)}`;
            } else if (discountEl) {
                discountEl.remove();
            }

            // שורת דמי משלוח — רק כשיש חיוב בפועל
            let shipEl = document.getElementById('summary-shipping');
            if (shippingFee > 0 && CONFIG.showPrices) {
                if (!shipEl) {
                    shipEl = document.createElement('div');
                    shipEl.id = 'summary-shipping';
                    shipEl.style.cssText = 'font-size:0.9rem; color:var(--text-secondary);';
                    summaryTotalEl.parentNode.parentNode.insertBefore(shipEl, summaryTotalEl.parentNode);
                }
                const m = selectedShipping();
                shipEl.textContent = `דמי משלוח (${m ? m.label : ''}): ₪${shippingFee.toFixed(2)}`;
            } else if (shipEl) {
                shipEl.remove();
            }
        }

        // Conditional Total Price
        if (summaryTotalEl) {
            if (CONFIG.showPrices) {
                summaryTotalEl.textContent = "₪" + finalTotal.toFixed(2);
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

        // שורת המע"מ בדף הסוכן — ההצעה מוצגת ללקוח כולל מע"מ, ולכן הסוכן
        // צריך לראות את הסכום הסופי כבר בזמן בניית ההצעה.
        const vatEl = document.getElementById('summary-vat');
        if (vatEl) {
            if (CONFIG.quoteVat && CONFIG.showPrices && finalTotal > 0) {
                const q = quoteTotals(finalTotal);
                vatEl.textContent = `כולל מע״מ ${Math.round(VAT_RATE * 100)}%: ₪${q.gross.toFixed(2)}`
                    + (q.rounded ? ' (מעוגל)' : '');
                vatEl.style.display = '';
            } else {
                vatEl.style.display = 'none';
            }
        }

        if (fabCountEl) fabCountEl.textContent = totalItems;

        // שמירת העגלה במכשיר בכל שינוי
        try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { }

        // נאדג': כמה חסר כדי לזכות בהנחת הסל
        updatePromoNudge(totalPrice, totalItems, cartDiscount);

        // סה"כ מחיר על כפתור ההזמנה הצף — הלקוח רואה את עלות העגלה בכל רגע
        if (CONFIG.showPrices && openOrderBtn) {
            let fabTotalEl = document.getElementById('fab-total');
            if (!fabTotalEl) {
                fabTotalEl = document.createElement('span');
                fabTotalEl.id = 'fab-total';
                fabTotalEl.style.cssText = 'font-weight:700; margin-right:6px;';
                openOrderBtn.appendChild(fabTotalEl);
            }
            fabTotalEl.textContent = finalTotal > 0 ? `· ₪${finalTotal.toFixed(2)}` : '';
        }

        // כרטיס הסיכום בתצוגת הסל
        updateCartSummaryCard({
            subtotal: totalPrice, discount: cartDiscount,
            shipping: shippingFee, total: finalTotal, totalItems: totalItems
        });

        // מצב סל ריק — עד היום התצוגה פשוט הייתה ריקה בלי הסבר.
        // הטבלה מוסתרת יחד איתו: היא חולקת את אותו תא בגריד, ושורת
        // הכותרות שלה הייתה נערמת מעל ההודעה.
        const emptyEl = document.getElementById('cart-empty');
        if (emptyEl) {
            const isEmpty = totalItems === 0;
            emptyEl.style.display = isEmpty ? 'flex' : 'none';
            const tableWrap = emptyEl.parentNode.querySelector('.table-responsive');
            if (tableWrap) tableWrap.style.display = isEmpty ? 'none' : '';
        }

        // Update Mobile Nav Badge
        const mobileNavCountEl = document.getElementById("mobile-nav-count");
        if (mobileNavCountEl) mobileNavCountEl.textContent = totalItems;
    }

    // --- Order Confirmation (אישור לאחר שליחת הזמנה) ---
    function showOrderConfirmation(orderId, method) {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:11000; display:flex; align-items:center; justify-content:center; padding:20px;";

        // דף הסוכן: אין ערוץ שנפתח ואין למי "לחזור" — ההזמנה כבר נקלטה.
        const isAgent = method === 'agent';
        const methodText = isAgent
            ? 'ההזמנה נשלחה למשרד. תעודת ההזמנה תגיע למייל.'
            : (method === 'whatsapp'
                ? 'ההזמנה נפתחה בוואטסאפ - ודאו שלחצתם על כפתור השליחה בחלון שנפתח.<br>נחזור אליכם בהקדם עם אישור והצעת מחיר.'
                : 'ההזמנה נפתחה במייל - ודאו שלחצתם על כפתור השליחה בחלון שנפתח.<br>נחזור אליכם בהקדם עם אישור והצעת מחיר.');

        const box = document.createElement("div");
        box.style.cssText = "background:#fff; color:#2F3E35; border-radius:16px; padding:2rem; max-width:420px; width:100%; text-align:center; box-shadow:0 10px 40px rgba(0,0,0,0.25);";
        box.innerHTML = `
            <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#639C7D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="8 12 11 15 16 9"></polyline></svg>
            <h2 style="margin:0.8rem 0 0.4rem; color:#1A4231; font-size:1.5rem;">${isAgent ? 'ההזמנה נקלטה' : 'ההזמנה נשלחה!'}</h2>
            <p style="margin:0 0 0.4rem; font-weight:700;">מספר הזמנה: ${orderId}</p>
            <p style="margin:0 0 1.3rem; color:#6B7F75; font-size:0.95rem; line-height:1.6;">${methodText}</p>
            <button id="order-confirm-close" style="background:#639C7D; color:#fff; border:none; border-radius:10px; padding:10px 34px; font-size:1rem; font-weight:600; cursor:pointer; font-family:inherit;">סגור</button>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const close = () => {
            overlay.remove();
            // דף הסוכן: ההזמנה נסגרה — הסל מתרוקן כדי שהביקור הבא יתחיל נקי
            if (isAgent) {
                Object.keys(cart).forEach(k => delete cart[k]);
                renderProducts();
                updateSummary();
            }
            // עובר דרך closeOrderView כדי שגם ?cart=1 ינוקה מהכתובת אחרי השליחה
            closeOrderView();
        };
        box.querySelector("#order-confirm-close").addEventListener("click", close);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    }

    // --- Customer Details (פרטי לקוח בהזמנה) ---
    function getCustomerDetails() {
        // עיגון כפול: בקטלוג העסקי יש cust-business, בקטלוג הטיפוח (B2C) רק cust-contact.
        // null רק כששניהם חסרים — כלומר בדף הסוכן, שאין בו טופס פרטי לקוח.
        const businessEl = document.getElementById("cust-business");
        const contactEl = document.getElementById("cust-contact");
        if (!businessEl && !contactEl) return null;
        const val = (id) => (document.getElementById(id)?.value || "").trim();
        return {
            business: businessEl ? businessEl.value.trim() : "",
            contact: val("cust-contact"),
            phone: val("cust-phone"),
            address: val("cust-address"),
            notes: val("cust-notes"),
            // אספקה ותשלום — קיימים רק כשנטען קונפיג משלוחים
            shipping: selectedShipping() ? selectedShipping().label : "",
            payment: SHIPPING_METHODS.length ? paymentLabel() : ""
        };
    }

    function validateCustomerDetails(customer) {
        // עמוד רשת החנויות: הסניף נבחר בשער ולכן תמיד קיים, והשדה היחיד שנדרש
        // הוא שם המזמין. לא שומרים ל-aroam_customer_details — המפתח משותף לכל
        // הקטלוגים, ושם הסניף היה מודלף לטופס של הקטלוג העסקי (העמוד שומר
        // את שם המזמין בעצמו, במפתח משלו).
        if (CONFIG.customerMode === 'branch') {
            if (!customer.contact) {
                showToast("נא למלא את שם המזמין לפני שליחת ההזמנה");
                const el = document.getElementById("cust-contact");
                if (el) {
                    el.focus();
                    el.style.borderColor = "red";
                    setTimeout(() => { el.style.borderColor = ""; }, 2500);
                }
                return false;
            }
            return true;
        }

        const isB2C = CONFIG.customerMode === 'b2c';
        // בלקוח פרטי אין "שם עסק" — הזיהוי הוא שם מלא
        const nameField = isB2C ? "cust-contact" : "cust-business";
        const nameValue = isB2C ? customer.contact : customer.business;
        if (!nameValue || !customer.phone) {
            showToast(isB2C
                ? "נא למלא שם מלא וטלפון לפני שליחת ההזמנה"
                : "נא למלא שם עסק וטלפון לפני שליחת ההזמנה");
            const el = document.getElementById(!nameValue ? nameField : "cust-phone");
            if (el) {
                el.focus();
                el.style.borderColor = "red";
                setTimeout(() => { el.style.borderColor = ""; }, 2500);
            }
            return false;
        }
        // שמירת הפרטים במכשיר - ימולאו אוטומטית בהזמנה הבאה.
        // לא בדף הסוכן: המפתח משותף לכל הקטלוגים, ופרטי לקוח של רועי היו
        // מודלפים לטופס של הקטלוג העסקי באותו דפדפן.
        if (!CONFIG.agentMode) {
            try { localStorage.setItem('aroam_customer_details', JSON.stringify(customer)); } catch (e) { }
        }
        return true;
    }

    function prefillCustomerDetails() {
        // במצב סניף אין מה למלא מראש — הסניף מגיע מהשער, לא מהזמנה קודמת בקטלוג אחר
        if (CONFIG.customerMode === 'branch') return;
        // דף הסוכן: הפרטים מגיעים מהלקוח שנבחר (js/agent.js), ולא מהמפתח
        // aroam_customer_details המשותף לכל הקטלוגים
        if (CONFIG.agentMode) return;
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
            const createCell = (text, cls) => {
                const td = document.createElement("td");
                td.textContent = text;
                if (cls) td.className = cls;
                return td;
            };

            // Image
            const tdImage = document.createElement("td");
            tdImage.className = "oc-img";
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

            row.appendChild(createCell(product.id, "oc-sku"));
            row.appendChild(createCell(product.name, "oc-name"));
            row.appendChild(createCell(product.category, "oc-cat"));

            // Qty
            const tdQty = document.createElement("td");
            tdQty.className = "oc-qty";
            const qtyInp = document.createElement("input");
            qtyInp.className = "order-input";
            qtyInp.type = "number";
            qtyInp.min = "0";
            qtyInp.setAttribute("aria-label", "כמות - " + product.name);
            qtyInp.value = qty;
            tdQty.appendChild(qtyInp);
            row.appendChild(tdQty);

            row.appendChild(createCell(product.unit, "oc-unit"));

            // Price & Total - Conditional
            if (CONFIG.showPrices) {
                const tdPrice = document.createElement("td");
                tdPrice.className = "oc-price";
                const priceInp = document.createElement("input");
                priceInp.className = "order-input";
                priceInp.type = "number";
                priceInp.step = "0.01";
                priceInp.value = product.price.toFixed(2);
                // עריכת מחיר היחידה היא כלי של הסוכן להצעות מחיר. ללקוח היא רק
                // מבלבלת: שינוי עדכן את שורת הסכום אך לא את סה"כ הסל ולא את
                // ההודעה הנשלחת, כך שהמספרים על המסך סתרו זה את זה.
                if (!CONFIG.editablePrices) {
                    priceInp.readOnly = true;
                    priceInp.tabIndex = -1;
                    priceInp.setAttribute("aria-label", "מחיר ליחידה");
                }
                tdPrice.appendChild(priceInp);
                row.appendChild(tdPrice);

                const tdTotal = document.createElement("td");
                tdTotal.className = "oc-total";
                // סכום ותווית "חינם" הם צמתים נפרדים כדי שעדכון אחד לא ימחק את השני
                const totalAmount = document.createElement("span");
                totalAmount.className = "oc-amount";
                const freeNote = document.createElement("div");
                freeNote.className = "oc-free";
                tdTotal.appendChild(totalAmount);
                tdTotal.appendChild(freeNote);
                const updateRow = () => {
                    const q = parseFloat(qtyInp.value) || 0;
                    const p = parseFloat(priceInp.value) || 0;
                    // מבצע חבילה: הסה"כ מגלם את היחידות שחינם, וציון קטן מסביר כמה
                    const charged = chargeableQty(product, q);
                    totalAmount.textContent = (charged * p).toFixed(2);
                    const free = q - charged;
                    freeNote.textContent = free > 0 ? `${free} חינם (${product.bundle})` : "";
                };
                qtyInp.addEventListener("input", () => { updateRow(); updateSummary(); }); // Update global summary too
                priceInp.addEventListener("input", () => {
                    // עריכת המחיר נכתבת חזרה למוצר, אחרת שורת הסכום מתעדכנת
                    // אבל סה"כ הסל, שורת המע"מ והמסמך המודפס ממשיכים לקרוא את
                    // המחיר הישן מ-PRODUCTS — והמספרים על המסך סותרים זה את זה.
                    // המחיר חוזר ממילא מה-CSV בטעינה הבאה של הדף.
                    if (CONFIG.editablePrices) product.price = parseFloat(priceInp.value) || 0;
                    updateRow();
                    updateSummary();
                });
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
        // התנאי בודק גם contact: בקטלוג הטיפוח (B2C) אין שם עסק, ובדיקה על business
        // בלבד הייתה משמיטה את כל פרטי הלקוח מההודעה.
        const customer = getCustomerDetails();
        if (customer && (customer.business || customer.contact)) {
            // בעמוד רשת החנויות השדה מכיל "מרכז קניות — חנות", ולכן התווית שונה.
            // השדה עצמו נשאר business, כך שהפיילוד לגיליון ולתעודת ה-PDF לא משתנה.
            if (customer.business) lines.push(`${CONFIG.customerMode === 'branch' ? 'סניף' : 'שם העסק'}: ${customer.business}`);
            if (customer.contact) {
                // בעמוד הרשת ה"עסק" הוא הסניף, ולכן מי שמילא את ההזמנה הוא "מזמין"
                const contactLabel = CONFIG.customerMode === 'branch' ? 'מזמין'
                    : (customer.business ? 'איש קשר' : 'שם');
                lines.push(`${contactLabel}: ${customer.contact}`);
            }
            if (customer.phone) lines.push(`טלפון: ${customer.phone}`);
            if (customer.shipping) lines.push(`שיטת אספקה: ${customer.shipping}`);
            if (customer.address) lines.push(`כתובת למשלוח: ${customer.address}`);
            if (customer.payment) lines.push(`אופן תשלום: ${customer.payment}`);
            if (customer.notes) lines.push(`הערות: ${customer.notes}`);
            lines.push("");
        }
        lines.push("פירוט הזמנה:", "");
        for (const [id, qty] of Object.entries(cart)) {
            const product = PRODUCTS.find(p => p.id === id);
            if (!product || qty <= 0) continue;
            let line = `• ${product.name} | מק״ט: ${product.id} | כמות: ${qty} ${product.unit}`;
            const free = freeQty(product, qty);
            if (free > 0) {
                line += ` | מבצע ${product.bundle} (${free} חינם)`;
            }
            if (CONFIG.showPrices && product.price > 0) {
                line += ` | ${(chargeableQty(product, qty) * product.price).toFixed(2)} ₪`;
            }
            lines.push(line);
        }
        // סיכום מחירים והנחת סל (רק בקטלוגים שמציגים מחירים)
        if (CONFIG.showPrices) {
            const t = orderTotals();
            lines.push("");
            if (t.discount > 0 || t.shipping > 0) {
                lines.push(`סה״כ ביניים: ${t.subtotal.toFixed(2)} ₪`);
                if (t.discount > 0) lines.push(`הנחת מבצע (${CART_PROMO.percent}%): -${t.discount.toFixed(2)} ₪`);
                if (t.shipping > 0) lines.push(`דמי משלוח: ${t.shipping.toFixed(2)} ₪`);
            }
            lines.push(`סה״כ לתשלום: ${t.total.toFixed(2)} ₪`);
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
        return `${CONFIG.orderPrefix || 'AR'}-${yyyymmdd}-${rand}`;
    }

    // מספר הצעה באותה תבנית כמו מספר ההזמנה (AR-20260820-4437), במקום
    // timestamp בן 13 ספרות שהלקוח רואה על המסמך.
    function generateQuoteId() {
        const today = new Date();
        const yyyymmdd = today.getFullYear() +
            String(today.getMonth() + 1).padStart(2, '0') +
            String(today.getDate()).padStart(2, '0');
        const rand = Math.floor(1000 + Math.random() * 9000);
        return `Q-${yyyymmdd}-${rand}`;
    }

    function getCartItemsData() {
        const items = [];
        let totalItems = 0;
        let totalPrice = 0;
        for (const [id, qty] of Object.entries(cart)) {
            const product = PRODUCTS.find(p => p.id === id);
            if (!product || qty <= 0) continue;
            const price = parseFloat(product.price) || 0;
            // מבצע חבילה: מחייבים רק את היחידות בתשלום
            const itemTotal = chargeableQty(product, qty) * price;
            items.push({
                id: product.id,
                name: product.name,
                category: product.category,
                qty: qty,
                unit: product.unit,
                // נתיב התמונה — נדרש לתעודת ההזמנה (PDF) שנבנית ב-Apps Script.
                // rawImage הוא הנתיב היחסי כפי שהוא ב-CSV (לא מוחלט, לא מקודד) —
                // product.image עבר כבר המרה לנתיב מוחלט+מקודד לצורך תצוגה בדפדפן ואינו מתאים לכאן.
                image: product.rawImage || "",
                price: price,
                total: itemTotal,
                // מבצע חבילה — כדי שבמייל/בגיליון יהיה ברור כמה יחידות לתת חינם
                bundle: product.bundle || "",
                free: freeQty(product, qty)
            });
            totalItems += qty;
            totalPrice += itemTotal;
        }
        return { items, totalItems, totalPrice };
    }

    function buildOrderPayload(orderId, items, totals, totalItems) {
        const orderDate = orderDateInput ? orderDateInput.value : new Date().toLocaleDateString('he-IL');
        return {
            orderId: orderId,
            date: orderDate,
            items: items,
            // totalPrice = הסכום הסופי לתשלום; הפירוק נשלח לצדו כדי שבגיליון
            // יהיה ברור מה מקורו (הסקריפט הישן קורא רק את totalPrice)
            totalPrice: totals.total.toFixed(2),
            subtotal: totals.subtotal.toFixed(2),
            discount: totals.discount.toFixed(2),
            shipping: totals.shipping.toFixed(2),
            totalItems: totalItems,
            // האם הלקוח ראה מחירים. הסקריפט בענן צריך את זה כדי לדעת אם
            // לצרף למייל קישור "פתח כהצעת מחיר" — הוא לא יכול להסיק את זה
            // מ-totalPrice, שמחושב מ-products.csv גם כשהמחירים מוסתרים.
            showPrices: !!CONFIG.showPrices,
            customer: getCustomerDetails() // פרטי הלקוח (null בגרסת סוכן)
        };
    }

    // מחזירה true כשהבקשה יצאה לדרך. התשובה אטומה (mode: no-cors) ולכן אין
    // אישור הצלחה אמיתי — false מסמן כשל רשת בלבד, וזה מה שמזין את תור
    // האופליין של דף הסוכן (js/agent.js).
    async function postOrderPayload(payload) {
        if (!GOOGLE_SCRIPT_WEBHOOK_URL) {
            console.log("Google Script Webhook URL is not set. Skipping backup email.");
            return false;
        }
        try {
            await fetch(GOOGLE_SCRIPT_WEBHOOK_URL, {
                method: "POST",
                mode: "no-cors",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            console.log("Successfully sent order data to Google Script Webhook");
            return true;
        } catch (error) {
            console.error("Error sending order data to Webhook:", error);
            return false;
        }
    }

    async function sendOrderBackupToGoogleScript(orderId, items, totals, totalItems) {
        return postOrderPayload(buildOrderPayload(orderId, items, totals, totalItems));
    }

    // הליבה המשותפת לכל שליחת הזמנה — ולידציה, מספר הזמנה, שמירה ל"הזמנות
    // אחרונות", דיווח ל-webhook ולאנליטיקס. הפתיחה של הערוץ (וואטסאפ/מייל)
    // נשארת אצל הקורא. מחזירה null כשהולידציה נכשלה.
    function commitOrder(method) {
        const customer = getCustomerDetails();
        if (customer && !validateCustomerDetails(customer)) return null;

        const orderId = generateOrderId();
        const { items, totalItems } = getCartItemsData();

        // Save to recent orders history (הזמנות אחרונות)
        if (items.length > 0) saveRecentOrder(items);

        // נשלח הסכום הסופי (אחרי הנחת סל ודמי משלוח) ולא סכום הביניים.
        const totals = orderTotals();
        const payload = buildOrderPayload(orderId, items, totals, totalItems);
        const delivery = postOrderPayload(payload);

        // Conversion Tracking: דיווח שליחת הזמנה ל-GTM ול-GA4
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'order_sent', order_method: method, order_id: orderId, order_items: totalItems });
        if (typeof gtag === 'function') gtag('event', 'order_sent', { order_method: method, order_id: orderId, order_items: totalItems });

        // js/agent.js מאזין לזה כדי ללמוד את מחירי הלקוח, לשמור את ההזמנה
        // האחרונה שלו ולהכניס לתור הזמנה שלא יצאה. שאר הקטלוגים לא מאזינים.
        document.dispatchEvent(new CustomEvent('aroam:order-sent', {
            detail: { orderId, method, items, totals, totalItems, customer, payload, delivery }
        }));

        return { orderId, method, items, totals, totalItems, customer, payload, delivery };
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
            if (product.original_price > product.price) {
                const oldPrice = document.createElement("span");
                oldPrice.className = "price-old";
                oldPrice.textContent = product.original_price.toFixed(2) + " ₪";
                qvPrice.appendChild(oldPrice);
                const saleBadge = document.createElement("span");
                saleBadge.className = "sale-badge";
                saleBadge.textContent = "מבצע";
                qvPrice.appendChild(saleBadge);
            }
            appendBundleInfo(qvPrice, product);
            appendPromoValidity(qvPrice, product);
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

        // מידע אריזה/קרטון — מוצג רק כשהשדה מולא
        if (qvPackaging) {
            if (product.packaging) {
                qvPackaging.textContent = product.packaging;
                qvPackaging.style.display = 'block';
            } else {
                qvPackaging.textContent = "";
                qvPackaging.style.display = 'none';
            }
        }

        // Init Quantity
        const currentQty = cart[product.id] || 0;
        qvInput.value = currentQty > 0 ? currentQty : 1; // Default to 1 if not in cart

        quickViewModal.classList.add("open");
        syncModalScrollLock();
        trackEvent("view_item", {
            item_id: product.id,
            item_name: product.name,
            item_category: product.category
        });
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

            // הסכום חייב להיות זהה למה שמופיע במסמך המודפס: orderTotals מביא
            // בחשבון מבצעי חבילה, הנחת סל ודמי משלוח, ו-quoteTotals מוסיף מע"מ
            // ועיגול. החישוב הישן (sum(price×qty)) התעלם מכולם.
            const t = orderTotals();
            const finalTotal = CONFIG.quoteVat ? quoteTotals(t.total).gross : t.total;

            newQuote = {
                id: generateQuoteId(),
                date: new Date().toISOString().split('T')[0],
                customer: customerNameOrQuote,
                items: currentCartItems,
                total: Number(finalTotal.toFixed(2))
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

        applyOrder(quote.items);
        closeHistoryModal();
        openOrderModal();
        showToast("ההצעה נטענה בהצלחה");
    }

    // שחזור הזמנה/הצעה לתוך העגלה. משותף להיסטוריית הענן בדף הסוכן ולכפתור
    // "ההזמנה הקודמת" של לקוח (js/agent.js).
    //
    // שני דברים שהמימוש הקודם החמיץ:
    // 1. המחיר שסוכם לא שוחזר — מוצר שקיים בקטלוג חזר במחיר products.csv,
    //    כלומר "תזמין כמו פעם שעברה" הציג מחיר אחר ממה שסוכם בפועל.
    // 2. הקריאה ל-updateFab() (פונקציה שלא קיימת) זרקה ReferenceError אחרי
    //    שהעגלה כבר נמחקה ולפני שהחלון נפתח — כלומר "טען" נראה כאילו לא עשה כלום.
    //
    // מקבל גם { quantity } (סכמת AgentQuotes) וגם { qty } (סכמת getCartItemsData).
    function applyOrder(items) {
        if (!Array.isArray(items)) return 0;

        Object.keys(cart).forEach(k => delete cart[k]);

        let restored = 0;
        items.forEach(item => {
            if (!item || !item.id) return;
            const qty = parseInt(item.quantity != null ? item.quantity : item.qty, 10) || 0;
            if (qty <= 0) return;

            const price = parseFloat(item.price);
            const hasPrice = isFinite(price) && price > 0;
            let product = PRODUCTS.find(p => p.id === item.id);

            if (!product) {
                // מוצר שנמחק מהקטלוג מאז — משוחזר כמוצר כללי כדי שההזמנה
                // הקודמת תיטען במלואה ולא תשמיט שורות בשקט.
                product = {
                    id: item.id,
                    name: item.name || item.id,
                    price: hasPrice ? price : 0,
                    unit: item.unit || 'יח׳',
                    image: item.image || '',
                    category: item.category || 'כללי',
                    isCustom: true
                };
                PRODUCTS.push(product);
            } else if (CONFIG.editablePrices && hasPrice) {
                // המחיר שסוכם גובר על המחירון — רק היכן שהמחיר ניתן לעריכה
                // מלכתחילה (דף הסוכן). בשאר הקטלוגים המחיר קובע מה-CSV.
                product.price = price;
            }

            cart[item.id] = qty;
            restored++;
        });

        renderProducts();
        updateSummary();
        return restored;
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
        // כשההזמנה נפתחה מקישור שנשלח במייל, שם הלקוח מוצע כברירת מחדל.
        // ה-prompt נשאר כדי שרועי יוכל לתקן לפני ההדפסה.
        const suggested = new URLSearchParams(window.location.search).get('customer');
        const customerName = prompt("טופס הדפסה: נא להזין שם לקוח", suggested || "לקוח כללי");
        if (customerName === null) return;

        const savedQuote = await saveQuote(customerName);
        if (!savedQuote) return;

        const modalBody = document.querySelector("#order-modal .modal-body");

        const docDiv = document.createElement("div");
        docDiv.className = "quote-doc";
        docDiv.innerHTML = buildQuoteDocHtml(savedQuote);
        modalBody.appendChild(docDiv);

        // כללי ההדפסה של ההצעה מגודרים תחת ה-class הזה, כדי שהדפסה רגילה
        // בשאר הקטלוגים לא תושפע.
        document.body.classList.add('quote-print');

        window.print();

        setTimeout(() => {
            document.body.classList.remove('quote-print');
            if (docDiv.parentNode) docDiv.parentNode.removeChild(docDiv);
        }, 1000);
    }

    // מסמך ההצעה המודפס. המבנה מועתק מתעודת ההזמנה שנשלחת במייל
    // (tools/google-apps-script-orders.gs) כדי שהלקוח יראה שני מסמכים באותה
    // שפה: רצועת כותרת, שני כרטיסי פרטים, טבלה עם תמונות, סיכום ופוטר.
    function buildQuoteDocHtml(quote) {
        const esc = t => String(t == null ? '' : t)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        // אותו פורמט כמו money_ בתעודה שנשלחת במייל, כדי ששני המסמכים יקראו זהה
        const money = n => Number(n).toFixed(2) + ' ₪';

        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const stamp = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
        const validUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        const validStamp = `${pad(validUntil.getDate())}.${pad(validUntil.getMonth() + 1)}.${validUntil.getFullYear()}`;

        // שורות המוצרים — אותו סדר עמודות כמו בתעודה: תמונה בימין, סה"כ בשמאל
        let rowsHtml = '';
        let totalItems = 0;
        for (const [id, qty] of Object.entries(cart)) {
            const product = PRODUCTS.find(p => p.id === id);
            if (!product || qty <= 0) continue;
            totalItems += qty;
            const charged = chargeableQty(product, qty);
            const free = qty - charged;
            const img = product.image
                ? `<img src="${esc(product.image)}" alt="">`
                : '<span class="qd-noimg">אין תמונה</span>';
            const bundleNote = free > 0
                ? `<div class="qd-bundle">מבצע ${esc(product.bundle)} — ${free} חינם</div>` : '';
            rowsHtml += '<tr>'
                + `<td class="qd-img">${img}</td>`
                + `<td class="qd-name"><div class="qd-title">${esc(product.name)}</div>`
                + (product.category ? `<div class="qd-cat">${esc(product.category)}</div>` : '')
                + bundleNote + '</td>'
                + `<td>${esc(product.id)}</td>`
                + `<td>${esc(product.unit)}</td>`
                + `<td class="qd-qty">${qty}</td>`
                + `<td>${money(product.price)}</td>`
                + `<td class="qd-total">${money(charged * product.price)}</td>`
                + '</tr>';
        }

        // סיכום — התווית מימין והסכום משמאל, כמו בתעודה
        const t = orderTotals();
        const sumRows = [['סכום ביניים', money(t.subtotal)]];
        if (t.discount > 0) sumRows.push(['הנחה', '-' + money(t.discount)]);
        if (t.shipping > 0) sumRows.push(['דמי משלוח', money(t.shipping)]);
        if (CONFIG.quoteVat) {
            const q = quoteTotals(t.total);
            sumRows.push([`מע״מ ${Math.round(VAT_RATE * 100)}%`, money(q.vat)]);
            sumRows.push(['סה״כ לתשלום כולל מע״מ' + (q.rounded ? ' (מעוגל)' : ''), money(q.gross)]);
        } else {
            sumRows.push(['סה״כ לתשלום', money(t.total)]);
        }
        const sumHtml = sumRows.map((r, i) => {
            const isTotal = i === sumRows.length - 1;
            return `<div class="qd-sum-row${isTotal ? ' qd-sum-total' : ''}">`
                + `<span>${r[0]}</span><span class="qd-sum-val">${r[1]}</span></div>`;
        }).join('');

        const kv = (k, v) => `<div class="qd-kv"><span>${k}</span><b>${esc(v)}</b></div>`;

        return `
            <div class="qd-head">
                <div class="qd-brand">
                    <img src="/images/logo.png" alt="">
                    <div>
                        <strong>אהרוני שיווק והפצה</strong>
                        <span>חומרי ניקוי · נייר · חד פעמי · ציוד משרדי</span>
                    </div>
                </div>
                <div class="qd-meta">
                    <div class="qd-kind">הצעת מחיר</div>
                    <div class="qd-num">${esc(quote.id)}</div>
                    <div class="qd-when">נערכה ${stamp}</div>
                </div>
            </div>

            <div class="qd-cards">
                <div class="qd-card">
                    <h4>פרטי הלקוח</h4>
                    ${kv('לכבוד', quote.customer)}
                </div>
                <div class="qd-card">
                    <h4>פרטי ההצעה</h4>
                    ${kv('תאריך', stamp)}
                    ${kv('בתוקף עד', validStamp)}
                    ${kv('סה״כ פריטים', totalItems)}
                </div>
            </div>

            <table class="qd-table">
                <thead>
                    <tr>
                        <th>תמונה</th><th>מוצר</th><th>מק״ט</th><th>יחידה</th>
                        <th>כמות</th><th>מחיר ליח׳</th><th>סה״כ</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>

            <div class="qd-sum">${sumHtml}</div>

            <div class="qd-sign">
                <div class="qd-sign-box">חתימת המזמין</div>
                <div class="qd-sign-box">חתימת סוכן/מאשר</div>
            </div>
            <div class="qd-legal">
                ט.ל.ח | ${CONFIG.quoteVat ? 'הסכום הסופי כולל מע״מ' : 'המחירים אינם כוללים מע״מ'} | תוקף ההצעה: 14 יום
            </div>

            <div class="qd-foot">
                <span class="qd-foot-src">הצעת מחיר מאתר aroam.co.il</span>
                <span class="qd-foot-contact">052-6000158 · 03-6346236 · meiraroam@gmail.com</span>
            </div>
        `;
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
        // --- ממשק ל-js/agent.js ---
        applyOrder,          // שחזור הזמנה קודמת (כמויות + מחירים שסוכמו)
        postOrderPayload,    // שליחה חוזרת של פיילוד מהתור. מחזירה Promise<boolean>
        getConfig: () => CONFIG,
        getProducts: () => PRODUCTS,
        refresh: () => { renderProducts(); updateSummary(); },
        buildMessage,
        showToast,
        saveQuote,
        getQuoteHistory,
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
