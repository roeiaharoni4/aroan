class SiteHeader extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <header class="site-header">
                <div class="container">
                    <a href="/" class="logo">
                        <img src="/images/logo.png" alt="אהרוני שיווק" style="height: 60px;">
                    </a>
                    <div class="header-controls" style="display: flex; align-items: center; gap: 10px;">
                        <button id="theme-toggle" class="theme-toggle" title="מצב כהה/בהיר" style="background:none; border:none; cursor:pointer; font-size:1.5rem;">🌙</button>
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
        toggleBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

        toggleBtn.addEventListener('click', () => {
            const current = html.getAttribute('data-theme');
            const newTheme = current === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            toggleBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
        });
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
                                <li><a href="/about/">אודות</a></li>
                                <li><a href="/contact/">צור קשר</a></li>
                                <li><a href="/accessibility/">הצהרת נגישות</a></li>
                                <li><a href="/terms/">תנאי שימוש</a></li>
                                <li><a href="/privacy/">מדיניות פרטיות</a></li>
                            </ul>
                        </div>
                        <div class="footer-col">
                            <h4>צור קשר</h4>
                            <ul class="footer-links">
                                <li>📍 היצירה 16, אור יהודה</li>
                                <li>📞 <a href="tel:0526000158">052-6000158</a></li>
                                <li>📞 <a href="tel:0506444290">050-6444290</a></li>
                                <li>📞 <a href="tel:036346236">03-6346236</a></li>
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

class MobileNav extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <nav class="mobile-bottom-nav">
                <a href="/" class="nav-item">
                    <span class="nav-icon">🏠</span>
                    <span class="nav-label">בית</span>
                </a>
                <a href="/catalog/" class="nav-item">
                    <span class="nav-icon">🛍️</span>
                    <span class="nav-label">קטלוג</span>
                </a>
                <a href="#" class="nav-item" id="mobile-cart-btn">
                    <div class="icon-container">
                        <span class="nav-icon">🛒</span>
                        <span class="nav-badge" id="mobile-nav-count">0</span>
                    </div>
                    <span class="nav-label">עגלה</span>
                </a>
                <a href="/contact/" class="nav-item">
                    <span class="nav-icon">📞</span>
                    <span class="nav-label">חייג</span>
                </a>
            </nav>
        `;

        this.highlightActiveLink();

        const cartBtn = this.querySelector('#mobile-cart-btn');
        if (cartBtn) {
            cartBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const openOrderBtn = document.getElementById('open-order-btn');
                if (openOrderBtn) {
                    openOrderBtn.click();
                } else {
                    // If we are not on catalog page, go to catalog
                    window.location.href = '/catalog/?openCart=true';
                }
            });
        }
    }

    highlightActiveLink() {
        // Normalize path
        let currentPath = window.location.pathname;
        if (currentPath.endsWith('index.html')) currentPath = currentPath.replace('index.html', '');
        if (currentPath !== '/' && !currentPath.endsWith('/')) currentPath += '/';

        const links = this.querySelectorAll('.nav-item');
        links.forEach(link => {
            let href = link.getAttribute('href');
            if (href === currentPath) {
                link.classList.add('active');
            }
        });
    }
}

customElements.define('site-header', SiteHeader);
customElements.define('site-footer', SiteFooter);
customElements.define('mobile-nav', MobileNav);

// Auto-inject Mobile Nav
document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('mobile-nav')) {
        document.body.appendChild(document.createElement('mobile-nav'));
    }

    // Auto-inject Accessibility Widget
    if (!document.getElementById('aroam-a11y-css')) {
        const link = document.createElement('link');
        link.id = 'aroam-a11y-css';
        link.rel = 'stylesheet';
        link.href = '/css/accessibility.css?v=3';
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
        waBtn.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp">';
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
});
