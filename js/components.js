class SiteHeader extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <div class="utility-bar">
                <div class="container">
                    <div class="ub-group ub-info">
                        <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>אור יהודה · משלוחים בגוש דן והמרכז</span>
                    </div>
                    <div class="ub-group">
                        <a href="tel:036346236">03-6346236</a>
                    </div>
                </div>
            </div>
            <header class="site-header">
                <div class="container">
                    <a href="/" class="logo">
                        <img src="/images/logo.png" alt="אהרוני שיווק" width="100" height="60" style="height: 60px; width: auto;" fetchpriority="high">
                    </a>
                    <div class="header-controls" style="display: flex; align-items: center; gap: 10px;">
                        <button id="theme-toggle" class="theme-toggle" title="מצב כהה/בהיר" style="background:none; border:none; cursor:pointer; padding: 5px; display: flex; align-items: center; justify-content: center;"></button>
                        <div class="menu-toggle" id="menu-toggle">☰</div>
                    </div>
                    <nav class="main-nav" id="main-nav">
                        <ul>
                            <li><a href="/">דף הבית</a></li>
                            <li><a href="/catalog/">קטלוג מוצרים</a></li>
                            <li><a href="/about/">אודות</a></li>
                            <li><a href="/contact/">צור קשר</a></li>
                        </ul>
                    </nav>
                </div>
            </header>
        `;

        this.highlightActiveLink();
        this.setupMobileMenu();
        this.setupThemeToggle();
    }

    setupThemeToggle() {
        const toggleBtn = this.querySelector('#theme-toggle');
        const html = document.documentElement;

        // Load saved theme
        const savedTheme = localStorage.getItem('theme') || 'light';
        html.setAttribute('data-theme', savedTheme);
        this.updateToggleIcon(toggleBtn, savedTheme);

        toggleBtn.addEventListener('click', () => {
            const current = html.getAttribute('data-theme');
            const newTheme = current === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            this.updateToggleIcon(toggleBtn, newTheme);
        });
    }

    updateToggleIcon(btn, theme) {
        if (theme === 'dark') {
            // Sun Icon
            btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #fbbf24;"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
        } else {
            // Moon Icon
            btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #4b5563;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
        }
    }

    highlightActiveLink() {
        // Normalize path: "/catalog/" -> "/catalog/"
        // "/catalog/index.html" -> "/catalog/"
        let currentPath = window.location.pathname;
        if (currentPath.endsWith('index.html')) {
            currentPath = currentPath.replace('index.html', '');
        }
        // Ensure trailing slash for root or directories if missing (though browsers usually add it)
        if (currentPath !== '/' && !currentPath.endsWith('/')) {
            currentPath += '/';
        }

        const links = this.querySelectorAll('.main-nav a');
        links.forEach(link => {
            let href = link.getAttribute('href');
            if (href === currentPath) {
                link.classList.add('active');
            }
        });
    }

    setupMobileMenu() {
        const toggle = this.querySelector('#menu-toggle');
        const nav = this.querySelector('#main-nav');

        toggle.addEventListener('click', () => {
            nav.classList.toggle('open');
            toggle.textContent = nav.classList.contains('open') ? '✕' : '☰';
        });
    }
}

class SiteFooter extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <footer class="site-footer">
                <div class="container">
                    <div class="footer-content">
                        <div class="footer-col">
                            <h4>אהרוני שיווק</h4>
                            <p>הפתרון המקיף לכל צרכי הניקיון והאחזקה שלכם. מוצרים איכותיים, שירות מהיר ומחירים ללא תחרות.</p>
                        </div>
                        <div class="footer-col">
                            <h4>קישורים מהירים</h4>
                            <ul class="footer-links">
                                <li><a href="/">דף הבית</a></li>
                                <li><a href="/catalog/">קטלוג</a></li>
                                <li><a href="/offices/">פתרונות למשרדים</a></li>
                                <li><a href="/restaurants/">פתרונות למסעדות</a></li>
                                <li><a href="/factories/">פתרונות למפעלים</a></li>
                                <li><a href="/education/">פתרונות למוסדות חינוך</a></li>
                                <li><a href="/or-yehuda/">ספק באור יהודה</a></li>
                                <li><a href="/about/">אודות</a></li>
                                <li><a href="/contact/">צור קשר</a></li>
                                <li><a href="/accessibility/">הצהרת נגישות</a></li>
                                <li><a href="/terms/">תנאי שימוש</a></li>
                                <li><a href="/privacy/">מדיניות פרטיות</a></li>
                            </ul>
                        </div>
                        <div class="footer-col">
                            <h4>קטגוריות פופולריות</h4>
                            <ul class="footer-links">
                                <li><a href="/catalog/cleaning/">חומרי ניקוי</a></li>
                                <li><a href="/catalog/cleaning-accessories/">אביזרי ניקיון</a></li>
                                <li><a href="/catalog/paper/">מוצרי נייר</a></li>
                                <li><a href="/catalog/disposables/">חד פעמי ואריזות</a></li>
                                <li><a href="/catalog/office-supplies/">ציוד משרדי</a></li>
                                <li><a href="/catalog/bags/">שקיות</a></li>
                                <li><a href="/catalog/hygiene/">טיפוח והיגיינה</a></li>
                            </ul>
                        </div>
                        <div class="footer-col">
                            <h4>צור קשר</h4>
                            <ul class="footer-links">
                                <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-left:5px;" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>היצירה 16, אור יהודה</li>
                                <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-left:5px;" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg><a href="tel:0526000158">052-6000158</a></li>
                                <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-left:5px;" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg><a href="tel:0506444290">050-6444290</a></li>
                                <li><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-left:5px;" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg><a href="tel:036346236">03-6346236</a></li>
                            </ul>
                        </div>
                    </div>
                    <div class="footer-bottom">
                        <p>&copy; ${new Date().getFullYear()} אהרוני שיווק. כל הזכויות שמורות.</p>
                    </div>
                </div>
            </footer>
        `;
    }
}

customElements.define('site-header', SiteHeader);
customElements.define('site-footer', SiteFooter);

// Auto-inject components
document.addEventListener('DOMContentLoaded', () => {

    // --- Conversion Tracking: דיווח לחיצות טלפון/וואטסאפ ל-GTM ---
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href^="tel:"], a[href*="wa.me"]');
        if (!link) return;
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            event: link.getAttribute('href').startsWith('tel:') ? 'phone_click' : 'whatsapp_click',
            link_url: link.getAttribute('href'),
            page_path: window.location.pathname
        });
    });

    // Auto-inject Accessibility Widget
    if (!document.getElementById('aroam-a11y-css')) {
        const link = document.createElement('link');
        link.id = 'aroam-a11y-css';
        link.rel = 'stylesheet';
        link.href = '/css/accessibility.css?v=4';
        document.head.appendChild(link);
    }

    if (!document.getElementById('aroam-a11y-js')) {
        const script = document.createElement('script');
        script.id = 'aroam-a11y-js';
        script.src = '/js/accessibility.js?v=3';
        document.body.appendChild(script);
    }

    // --- PWA: Manifest & Service Worker ---
    if (!document.querySelector("link[rel='manifest']")) {
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = '/manifest.json';
        document.head.appendChild(link);
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.log('Service Worker registration failed', err));
    }


    // --- 1. Auto-inject Favicon ---
    if (!document.querySelector("link[rel*='icon']")) {
        const link = document.createElement('link');
        link.type = 'image/png';
        link.rel = 'shortcut icon';
        link.href = '/images/logo.png';
        document.head.appendChild(link);
    }

    // --- 2. Floating WhatsApp ---
    if (!document.querySelector('.floating-whatsapp')) {
        const waBtn = document.createElement('a');
        waBtn.className = 'floating-whatsapp';
        waBtn.href = 'https://wa.me/972526000158'; // User's phone
        waBtn.target = '_blank';
        waBtn.setAttribute('aria-label', 'WhatsApp');
        waBtn.innerHTML = '<svg width="35" height="35" viewBox="0 0 32 32" fill="#fff" aria-hidden="true"><path d="M16 3C9.1 3 3.5 8.6 3.5 15.5c0 2.2.6 4.3 1.6 6.2L3.4 28l6.5-1.7c1.8 1 3.9 1.5 6.1 1.5 6.9 0 12.5-5.6 12.5-12.5S22.9 3 16 3zm0 22.7c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-3.9 1 1-3.8-.2-.4c-1-1.6-1.5-3.5-1.5-5.4C5.7 9.8 10.3 5.2 16 5.2s10.3 4.6 10.3 10.3S21.7 25.7 16 25.7zm5.7-7.7c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.6-.1-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.4 5.4 4.8.8.3 1.3.5 1.8.7.8.2 1.5.2 2 .1.6-.1 1.8-.7 2.1-1.5.3-.7.3-1.3.2-1.5-.1-.1-.3-.2-.6-.4z"/></svg>';
        waBtn.title = "צ'אט בוואטסאפ";
        document.body.appendChild(waBtn);
    }

    // --- 3. Scroll to Top ---
    if (!document.querySelector('.scroll-top-btn')) {
        const scrollBtn = document.createElement('button');
        scrollBtn.className = 'scroll-top-btn';
        scrollBtn.innerHTML = '↑';
        scrollBtn.title = 'חזור למעלה';
        document.body.appendChild(scrollBtn);

        // Logic
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollBtn.classList.add('visible');
            } else {
                scrollBtn.classList.remove('visible');
            }
        });

        scrollBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // --- Catalog: Grid/List view toggle (עיצוב בלבד - לא נוגע בלוגיקת app.js) ---
    const productsGrid = document.getElementById('products');
    const catalogSearchContainer = document.querySelector('.main-header .search-container');
    if (productsGrid && catalogSearchContainer && !document.getElementById('view-toggle')) {
        const VIEW_KEY = 'aroam_catalog_view';
        const toggle = document.createElement('div');
        toggle.id = 'view-toggle';
        toggle.className = 'view-toggle';
        toggle.innerHTML = `
            <button type="button" data-view="grid" title="תצוגת רשת" aria-label="תצוגת רשת"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></button>
            <button type="button" data-view="list" title="תצוגת רשימה" aria-label="תצוגת רשימה"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>`;
        const applyView = (mode) => {
            productsGrid.classList.toggle('list-view', mode === 'list');
            toggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
            try { localStorage.setItem(VIEW_KEY, mode); } catch (e) { }
        };
        toggle.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (btn) applyView(btn.dataset.view);
        });
        catalogSearchContainer.appendChild(toggle);
        let savedView = 'grid';
        try { savedView = localStorage.getItem(VIEW_KEY) || 'grid'; } catch (e) { }
        applyView(savedView);
    }

    // --- 4. AJAX Contact Forms Handler ---
    const contactForms = document.querySelectorAll('.contact-form-ajax');
    contactForms.forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = form.querySelector('.btn-form-submit');
            const alertBox = form.querySelector('.form-status-alert');
            
            // Get form values
            const nameInput = form.querySelector('[name="name"]');
            const phoneInput = form.querySelector('[name="phone"]');
            const emailInput = form.querySelector('[name="email"]');
            const messageInput = form.querySelector('[name="message"]');
            
            const name = nameInput ? nameInput.value.trim() : '';
            const phone = phoneInput ? phoneInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const message = messageInput ? messageInput.value.trim() : '';
            const subject = form.querySelector('[name="_subject"]')?.value || 'פנייה חדשה מאתר אהרוני שיווק';
            
            // Simple validation
            if (!name || !phone) {
                if (alertBox) {
                    alertBox.className = 'form-status-alert error';
                    alertBox.textContent = 'אנא מלאו את שדות החובה (שם וטלפון)';
                    alertBox.style.display = 'block';
                }
                return;
            }
            
            // Disable button and show loading state
            if (submitBtn) {
                submitBtn.disabled = true;
                const originalText = submitBtn.innerHTML;
                submitBtn.textContent = 'שולח...';
                form.dataset.originalBtnText = originalText;
            }
            
            if (alertBox) {
                alertBox.style.display = 'none';
            }
            
            try {
                // Send request to Google Apps Script Webhook via AJAX
                await fetch('https://script.google.com/macros/s/AKfycbxfp0qDK0ergyj-cVzdCVWiLieGXDjsSAymi1vvk-fWPnDPpiPc9nO8ujJye6JREyyL/exec', {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        'שם מלא': name,
                        'טלפון': phone,
                        'אימייל': email || 'לא צוין',
                        'הודעה / בקשה': message || 'ללא הודעה',
                        '_subject': subject,
                        '_honey': form.querySelector('[name="_honey"]')?.value || '' // Honeypot spam prevention
                    })
                });
                
                // Since mode is no-cors, we assume success if no exception is thrown
                if (alertBox) {
                    alertBox.className = 'form-status-alert success';
                    alertBox.textContent = 'הודעתכם נשלחה בהצלחה! נציגנו יחזור אליכם בהקדם.';
                    alertBox.style.display = 'block';
                }
                form.reset();

                // Conversion Tracking: דיווח שליחת טופס ליד ל-GTM
                window.dataLayer = window.dataLayer || [];
                window.dataLayer.push({
                    event: 'form_submit',
                    form_subject: subject,
                    page_path: window.location.pathname
                });
            } catch (error) {
                console.error('Form submission error:', error);
                if (alertBox) {
                    alertBox.className = 'form-status-alert error';
                    alertBox.textContent = 'אירעה שגיאה בשליחת הטופס. אנא נסו שוב או פנו אלינו טלפונית או בוואטסאפ.';
                    alertBox.style.display = 'block';
                }
            } finally {
                // Restore button state
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = form.dataset.originalBtnText || 'שליחה';
                }
            }
        });
    });
});

