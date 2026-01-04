class SiteHeader extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <header class="site-header">
                <div class="container">
                    <a href="index.html" class="logo">
                        <img src="images/logo.png" alt="אהרוני שיווק" style="height: 60px;">
                    </a>
                    <div class="menu-toggle" id="menu-toggle">☰</div>
                    <nav class="main-nav" id="main-nav">
                        <ul>
                            <li><a href="index.html">דף הבית</a></li>
                            <li><a href="catalog.html">קטלוג מוצרים</a></li>
                            <li><a href="about.html">אודות</a></li>
                            <li><a href="contact.html">צור קשר</a></li>
                        </ul>
                    </nav>
                </div>
            </header>
        `;

        this.highlightActiveLink();
        this.setupMobileMenu();
    }

    highlightActiveLink() {
        const currentPath = window.location.pathname.split('/').pop() || 'index.html';
        const links = this.querySelectorAll('.main-nav a');
        links.forEach(link => {
            if (link.getAttribute('href') === currentPath) {
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
                                <li><a href="index.html">דף הבית</a></li>
                                <li><a href="catalog.html">קטלוג</a></li>
                                <li><a href="about.html">אודות</a></li>
                                <li><a href="contact.html">צור קשר</a></li>
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
                <a href="index.html" class="nav-item">
                    <span class="nav-icon">🏠</span>
                    <span class="nav-label">בית</span>
                </a>
                <a href="catalog.html" class="nav-item">
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
                <a href="contact.html" class="nav-item">
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
                    window.location.href = 'catalog.html?openCart=true';
                }
            });
        }
    }

    highlightActiveLink() {
        const currentPath = window.location.pathname.split('/').pop() || 'index.html';
        const links = this.querySelectorAll('.nav-item');
        links.forEach(link => {
            if (link.getAttribute('href') === currentPath) {
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
});
