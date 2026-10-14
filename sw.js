const CACHE_NAME = 'aroam-cache-v57';
const urlsToCache = [
    '/',
    '/catalog/',
    '/css/site.css',
    '/js/components.js',
    '/js/app.js',
    '/images/logo.png',
    '/js/lib/papaparse.min.js'
];
const CACHEABLE_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', event => {
    // Skip waiting to activate immediately
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                // Try to cache critical assets, but don't fail if some missing
                return cache.addAll(urlsToCache).catch(err => console.log('Cache addAll error', err));
            })
    );
});

// משתלט על הלשוניות הפתוחות כבר בהפעלה הראשונה. בלי זה ה-service worker
// אמנם נרשם, אבל לא שולט בעמוד עד רענון — ו"הכנה לעבודה בלי רשת" בדף הסוכן
// הייתה מחייבת טעינה נוספת לפני שהיא בכלל זמינה.
// מוחק את המטמונים של גרסאות קודמות. בלי זה כל העלאת גרסה השאירה במכשיר
// עוד עותק מלא של כל מה שנגלש — 55 גרסאות נערמו זו על זו. אחרי עדכון,
// "הכנה לעבודה בלי רשת" בדף הסוכן צריכה לרוץ שוב פעם אחת.
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    // Network First Strategy
    // Try network, fall back to cache if offline
    if (event.request.method !== 'GET') return;
    // רק קבצי האתר עצמו (והפונטים, כדי שדף הסוכן ייראה תקין גם בלי רשת).
    // בקשות לגוגל — אנליטיקס, GTM, Apps Script, כולל קריאות מסך הרכש שהסיסמה
    // שלהן בכתובת — עוברות ישירות ולא נשמרות במכשיר.
    const origin = new URL(event.request.url).origin;
    if (origin !== self.location.origin && !CACHEABLE_ORIGINS.includes(origin)) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // שומרים רק תשובות תקינות — 404 שנשמר היה מוגש במקום העמוד בלי רשת
                // (קובץ ה-CSS של הפונטים חוזר "אטום" — status 0 — ולכן מותר רק לו)
                const fontCss = response.type === 'opaque' && origin !== self.location.origin;
                if ((response.ok && response.status === 200) || fontCss) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(event.request, responseClone))
                        .catch(() => { });
                }
                return response;
            })
            .catch(async () => {
                const exact = await caches.match(event.request);
                if (exact) return exact;
                // כתובות עם פרמטר משתנה: app.js מבקש את products.csv עם חותמת
                // שעתית (?v=1&_t=...), ולכן ההתאמה המדויקת נכשלת כל שעה מחדש
                // והקטלוג היה נשאר ריק בשטח. גרסה שמורה עדיפה על שום גרסה.
                return caches.match(event.request, { ignoreSearch: true });
            })
    );
});

// --- הכנה לעבודה בלי רשת (דף הסוכן) ---
// העמוד שולח את רשימת הכתובות שהוא צריך בשטח (מעטפת האפליקציה, products.csv
// ותמונות המוצרים). מכוון שהרשימה לא נמצאת כאן: היא לא רלוונטית ל-99% מגולשי
// האתר, ו-urlsToCache הגלובלי היה מכריח כל אחד מהם להוריד אותה בהתקנה.
self.addEventListener('message', event => {
    const data = event.data || {};
    if (data.type !== 'aroam-prepare-offline') return;

    const urls = Array.isArray(data.urls) ? data.urls : [];
    const reply = (payload) => {
        if (event.source) event.source.postMessage(payload);
    };

    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            let cached = 0;
            // לא addAll: קובץ חסר אחד היה מפיל את כל ההכנה. אבל גם לא אחד-אחד —
            // 187 קבצים בטור לוקחים דקות, וזה נעשה בדרך אל הלקוח. קבוצות של 8
            // הן פשרה בין מהירות לבין הצפת החיבור הסלולרי.
            const BATCH = 8;
            for (let i = 0; i < urls.length; i += BATCH) {
                const slice = urls.slice(i, i + BATCH);
                const results = await Promise.all(slice.map(url =>
                    cache.add(new Request(url, { cache: 'reload' }))
                        .then(() => true)
                        .catch(() => false)   // מדלגים על מה שלא נגיש
                ));
                cached += results.filter(Boolean).length;
            }
            reply({ type: 'aroam-offline-ready', ok: cached > 0, cached: cached, total: urls.length });
        }).catch(() => reply({ type: 'aroam-offline-ready', ok: false, cached: 0, total: urls.length }))
    );
});
