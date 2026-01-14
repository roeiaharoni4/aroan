/**
 * Accessibility Widget
 * Handles accessibility features like text resizing, contrast modes, etc.
 */

(function () {
    // Configuration
    const STORAGE_KEY = 'aroam_a11y_prefs';
    const DEFAULT_PREFS = {
        textSize: 'normal', // normal, large, xlarge
        contrast: 'normal', // normal, high, grayscale
        highlightLinks: false,
        readableFont: false
    };

    let preferences = { ...DEFAULT_PREFS };

    // HTML Structure
    const widgetHTML = `
        <button id="a11y-toggle-btn" aria-label="תפריט נגישות">
            <svg viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm6 11h-3.5v-3h-1v3H10v-3h-1v3H5.5v-1l2.5-5.5h.5l.5-4h6l.5 4h.5l2.5 5.5v1z"/>
            </svg>
        </button>

        <div id="a11y-menu" role="dialog" aria-modal="true" aria-label="תפריט נגישות">
            <div class="a11y-header">
                <h3>כלי נגישות</h3>
                <button class="a11y-close" aria-label="סגור תפריט">&times;</button>
            </div>
            
            <div class="a11y-controls">
                
                <div class="a11y-control-group">
                    <label>גודל טקסט</label>
                    <div class="a11y-btn-row">
                        <button class="a11y-btn" data-action="text-normal">רגיל</button>
                        <button class="a11y-btn" data-action="text-large">גדול</button>
                        <button class="a11y-btn" data-action="text-xlarge">ענק</button>
                    </div>
                </div>

                <div class="a11y-control-group">
                    <label>ניגודיות וצבעים</label>
                    <div class="a11y-btn-row">
                        <button class="a11y-btn" data-action="contrast-normal">רגיל</button>
                        <button class="a11y-btn" data-action="contrast-high">גבוהה</button>
                        <button class="a11y-btn" data-action="contrast-grayscale">אפור</button>
                    </div>
                </div>

                <div class="a11y-control-group">
                    <label>עזרים נוספים</label>
                    <div class="a11y-btn-row">
                        <button class="a11y-btn" data-action="toggle-links">הדגשת קישורים</button>
                    </div>
                     <div class="a11y-btn-row" style="margin-top:5px;">
                        <button class="a11y-btn" data-action="toggle-font">גופן קריא</button>
                    </div>
                </div>

                <button id="a11y-reset-btn" class="a11y-btn">איפוס הגדרות</button>

            </div>
        </div>
    `;

    // Initialize
    function init() {
        // Load preferences
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            preferences = JSON.parse(saved);
        }

        // Inject HTML
        const container = document.createElement('div');
        container.innerHTML = widgetHTML;
        document.body.appendChild(container);

        // Bind Events
        bindEvents();

        // Apply Preferences
        applyPreferences();
    }

    function bindEvents() {
        const toggleBtn = document.getElementById('a11y-toggle-btn');
        const menu = document.getElementById('a11y-menu');
        const closeBtn = document.querySelector('.a11y-close');

        // Toggle Menu
        toggleBtn.addEventListener('click', () => {
            menu.classList.toggle('visible');
            if (menu.classList.contains('visible')) {
                // Focus trap logic could go here
                closeBtn.focus();
            }
        });

        closeBtn.addEventListener('click', () => {
            menu.classList.remove('visible');
            toggleBtn.focus();
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && !toggleBtn.contains(e.target) && menu.classList.contains('visible')) {
                menu.classList.remove('visible');
            }
        });

        // Actions
        document.querySelectorAll('.a11y-btn[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                handleAction(action);
            });
        });

        // Reset
        document.getElementById('a11y-reset-btn').addEventListener('click', () => {
            preferences = { ...DEFAULT_PREFS };
            saveAndApply();
        });
    }

    function handleAction(action) {
        switch (action) {
            case 'text-normal':
                preferences.textSize = 'normal';
                break;
            case 'text-large':
                preferences.textSize = 'large';
                break;
            case 'text-xlarge':
                preferences.textSize = 'xlarge';
                break;
            case 'contrast-normal':
                preferences.contrast = 'normal';
                break;
            case 'contrast-high':
                preferences.contrast = 'high';
                break;
            case 'contrast-grayscale':
                preferences.contrast = 'grayscale';
                break;
            case 'toggle-links':
                preferences.highlightLinks = !preferences.highlightLinks;
                break;
            case 'toggle-font':
                preferences.readableFont = !preferences.readableFont;
                break;
        }
        saveAndApply();
    }

    function saveAndApply() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
        applyPreferences();
    }

    function applyPreferences() {
        const body = document.body;

        // Reset Classes first
        body.classList.remove(
            'a11y-text-large', 'a11y-text-xlarge',
            'a11y-high-contrast', 'a11y-grayscale',
            'a11y-links-highlight', 'a11y-readable-font'
        );

        // Text Size
        if (preferences.textSize === 'large') body.classList.add('a11y-text-large');
        if (preferences.textSize === 'xlarge') body.classList.add('a11y-text-xlarge');

        // Contrast
        if (preferences.contrast === 'high') body.classList.add('a11y-high-contrast');
        if (preferences.contrast === 'grayscale') body.classList.add('a11y-grayscale');

        // Links
        if (preferences.highlightLinks) body.classList.add('a11y-links-highlight');

        // Font
        if (preferences.readableFont) body.classList.add('a11y-readable-font');

        // Update UI Active States
        updateActiveButtons();
    }

    function updateActiveButtons() {
        // Clear all active
        document.querySelectorAll('.a11y-btn').forEach(btn => btn.classList.remove('active'));

        // Set active based on state
        setActive(`[data-action="text-${preferences.textSize}"]`);
        setActive(`[data-action="contrast-${preferences.contrast}"]`);

        if (preferences.highlightLinks) setActive(`[data-action="toggle-links"]`);
        if (preferences.readableFont) setActive(`[data-action="toggle-font"]`);
    }

    function setActive(selector) {
        const el = document.querySelector(selector);
        if (el) el.classList.add('active');
    }

    // Run on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
