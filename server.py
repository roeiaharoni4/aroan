import http.server
import socketserver
import json
import os
import csv
import base64
import re
import subprocess
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get('PORT', 8081))
DATA_FILE = 'data/products.csv'
IMAGES_DIR = 'images'
# מחירון נסתר: הקובץ המלא (עם עלות) נשאר מקומי בלבד (ב-.gitignore); הציבורי נגזר ממנו בכל שמירה
PRICELIST_MASTER_FILE = 'data/pricelist-master.csv'
PRICELIST_PUBLIC_FILE = 'data/pricelist.csv'
PRICELIST_PROMO_FILE = 'data/pricelist-promo.json'
CARE_PAGE_FILE = 'care/index.html'
MERCHANT_FEED_FILE = 'data/merchant-feed.xml'
SITE_BASE_URL = 'https://aroam.co.il'


def _load_category_discounts():
    """מחזיר {קטגוריה: אחוז} מקובץ המבצעים — כדי שהמחיר בפיד/סכמה יהיה המחיר שמוצג בפועל."""
    discounts = {}
    try:
        with open(PRICELIST_PROMO_FILE, encoding='utf-8') as f:
            promo = json.load(f)
        for rule in promo.get('category_discounts', []):
            pct = float(rule.get('percent') or 0)
            if rule.get('category') and pct > 0:
                discounts[rule['category']] = pct
    except (FileNotFoundError, ValueError):
        pass
    return discounts


def _effective_price(row, category_discounts):
    """המחיר שהלקוח רואה בפועל: מחיר מבצע פרטני אם יש, אחרת הנחת קטגוריה, עיגול ל-10 אג'."""
    try:
        price = float(row.get('price') or 0)
    except ValueError:
        return 0
    if price <= 0:
        return 0
    if not (row.get('original_price') or '').strip() and row.get('category') in category_discounts:
        price = round(price * (1 - category_discounts[row['category']] / 100) * 10) / 10
    return price


def bake_care_products():
    """מזריק את רשימת המוצרים כטקסט קריא לגוגל ל-#products בעמוד /care/ הראשי.

    ה-HTML הראשוני של /care/ ריק ממוצרים (הם נטענים ב-JS), מה שמקשה על אינדוקס.
    כאן נכתבים כרטיסי מוצר אמיתיים בין CARE_PRODUCTS_START/END; app.js מנקה את
    #products ומרנדר מחדש בטעינה, כך שלגולשים אין כפילות ולסורקים יש תוכן מלא.
    """
    from urllib.parse import quote
    from xml.sax.saxutils import escape

    with open(PRICELIST_PUBLIC_FILE, encoding='utf-8') as f:
        rows = [r for r in csv.DictReader(f) if r.get('id') and r.get('name')]
    category_discounts = _load_category_discounts()

    cards = []
    for r in rows:
        price = _effective_price(r, category_discounts)
        if price <= 0:
            continue
        img = SITE_BASE_URL + '/' + quote(r['image'].lstrip('/')) if r.get('image') else ''
        link = f'/care/?product={quote(r["id"])}'
        price_html = f'<span class="product-price">{price:.2f} ₪</span>'
        try:
            regular = float(r.get('original_price') or 0)
        except ValueError:
            regular = 0
        if regular > price:
            price_html = f'<span class="product-price">{price:.2f} ₪ <span class="price-old">{regular:.2f} ₪</span></span>'
        cards.append(
            f'<div class="product-card"><a href="{escape(link)}">'
            + (f'<img src="{escape(img)}" alt="{escape(r["name"])}" loading="lazy" width="200" height="200">' if img else '')
            + f'<h2 class="product-title">{escape(r["name"])}</h2></a>'
            + (f'<div class="product-brand">{escape(r["brand"])}</div>' if r.get('brand') else '')
            + f'{price_html}</div>'
        )

    block = ('<!-- CARE_PRODUCTS_START -->\n                '
             + '\n                '.join(cards)
             + '\n                <!-- CARE_PRODUCTS_END -->')

    with open(CARE_PAGE_FILE, encoding='utf-8') as f:
        html = f.read()
    html = re.sub(r'<!-- CARE_PRODUCTS_START -->.*?<!-- CARE_PRODUCTS_END -->', block, html, flags=re.S)
    with open(CARE_PAGE_FILE, 'w', encoding='utf-8') as f:
        f.write(html)


def update_merchant_feed():
    """בונה פיד XML ל-Google Merchant Center מ-pricelist.csv (מוצרי B2C עם תמונה ומחיר).

    נכתב ל-data/merchant-feed.xml בכל שמירה מהעורך. הכתובת שיש להזין ב-Merchant Center:
    https://aroam.co.il/data/merchant-feed.xml
    """
    from urllib.parse import quote
    from xml.sax.saxutils import escape

    with open(PRICELIST_PUBLIC_FILE, encoding='utf-8') as f:
        rows = [r for r in csv.DictReader(f) if r.get('id') and r.get('name')]

    category_discounts = _load_category_discounts()
    items_xml = []
    for r in rows:
        price = _effective_price(r, category_discounts)
        if price <= 0 or not (r.get('image') or '').strip():
            continue  # Merchant דורש מחיר ותמונה לכל מוצר

        image_link = SITE_BASE_URL + '/' + quote(r['image'].lstrip('/'))
        link = f"{SITE_BASE_URL}/care/?product={quote(r['id'])}"
        desc = r.get('description') or r['name']

        # מבצע פרטני: g:price = המחיר הרגיל, g:sale_price = מחיר המבצע (Merchant מציג מחוק)
        try:
            regular = float(r.get('original_price') or 0)
        except ValueError:
            regular = 0
        on_sale = regular > price

        parts = [
            f"<g:id>{escape(r['id'])}</g:id>",
            f"<g:title>{escape(r['name'])}</g:title>",
            f"<g:description>{escape(desc)}</g:description>",
            f"<g:link>{escape(link)}</g:link>",
            f"<g:image_link>{escape(image_link)}</g:image_link>",
            "<g:availability>in_stock</g:availability>",
            "<g:condition>new</g:condition>",
            f"<g:price>{(regular if on_sale else price):.2f} ILS</g:price>",
        ]
        if on_sale:
            parts.append(f"<g:sale_price>{price:.2f} ILS</g:sale_price>")
        if r.get('brand'):
            parts.append(f"<g:brand>{escape(r['brand'])}</g:brand>")
        # אין ברקוד (GTIN) — מצהירים על כך כדי ש-Merchant לא ידחה
        parts.append("<g:identifier_exists>no</g:identifier_exists>")
        items_xml.append("    <item>\n      " + "\n      ".join(parts) + "\n    </item>")

    feed = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n'
        '  <channel>\n'
        '    <title>אהרוני שיווק והפצה — קטלוג טיפוח והיגיינה</title>\n'
        f'    <link>{SITE_BASE_URL}/care/</link>\n'
        '    <description>מוצרי טיפוח, היגיינה וכביסה במחירים לצרכן</description>\n'
        + "\n".join(items_xml) + "\n"
        '  </channel>\n'
        '</rss>\n'
    )
    with open(MERCHANT_FEED_FILE, 'w', encoding='utf-8') as f:
        f.write(feed)


# דפי קטגוריה סטטיים ל-SEO: כתובת ייעודית + טקסט מוצרים קריא לגוגל + קישור לקטלוג האינטראקטיבי.
# כל דף מכוון לחיפושים של הקטגוריה שלו, ומכיל את שמות המוצרים והמחירים כטקסט אמיתי ב-HTML.
CARE_CATEGORY_PAGES = {
    'שיער': {
        'slug': 'hair',
        'title': 'מוצרי שיער במחירים לצרכן — שמפו, מרכך, מסכות וסרום | אהרוני',
        'desc': 'מוצרי טיפוח לשיער במחירים משתלמים: שמפו, מרכך, מסכות טיפוליות וסרום ARGANIA ללא מלחים. הזמנה אונליין ומשלוח באזור אור יהודה, בקעת אונו וגוש דן.',
        'h1': 'מוצרי שיער במחירים לצרכן',
        'intro': 'מבחר מוצרי טיפוח לשיער — שמפו, מרכך, מסכות טיפוליות, סרום ושמן ARGANIA ללא מלחים, לכל סוגי השיער: יבש, פגום, מתולתל ומסולסל. מחירים משתלמים ללקוחות פרטיים והזמנה מהירה בוואטסאפ.',
    },
    'כביסה': {
        'slug': 'laundry',
        'title': 'קפסולות ואבקות כביסה במחירים לצרכן — אריאל, פרסיל, לנור | אהרוני',
        'desc': 'קפסולות ג\'ל לכביסה אריאל ופרסיל, כדוריות ריח לנור במחירים משתלמים. הזמנה אונליין ומשלוח באזור אור יהודה, בקעת אונו וגוש דן.',
        'h1': 'מוצרי כביסה במחירים לצרכן',
        'intro': 'קפסולות ג\'ל לכביסה של אריאל ופרסיל, כדוריות בישום לנור ועוד — לכביסה לבנה, צבעונית והסרת כתמים קשים. מחירים משתלמים ללקוחות פרטיים והזמנה מהירה בוואטסאפ.',
    },
    'היגיינת פה': {
        'slug': 'oral-care',
        'title': 'מוצרי היגיינת פה — משחות שיניים, מברשות ושטיפת פה | אהרוני',
        'desc': 'משחות שיניים קולגייט וסנסודיין, מברשות שיניים אורל בי וקולגייט, שטיפת פה ליסטרין וקיסמי שיניים — במחירים משתלמים. משלוח בגוש דן והמרכז.',
        'h1': 'מוצרי היגיינת פה במחירים לצרכן',
        'intro': 'משחות שיניים קולגייט, סנסודיין וטום וגרי, מברשות שיניים אורל בי וקולגייט, שטיפת פה ליסטרין וקיסמי שיניים PHARMA DENT — במחירים משתלמים ללקוחות פרטיים.',
    },
    'נשים': {
        'slug': 'feminine',
        'title': 'מוצרי היגיינה נשית — תחבושות, מגני תחתון וגילוח | אהרוני',
        'desc': 'תחבושות ומגני תחתון אולוויז בכל המידות, סכיני גילוח VENUS — במחירים משתלמים. הזמנה אונליין ומשלוח בגוש דן והמרכז.',
        'h1': 'מוצרי היגיינה נשית במחירים לצרכן',
        'intro': 'תחבושות אולוויז אולטרה בכל המידות (1-5), מגני תחתון וסכיני גילוח VENUS — מבחר מוצרי היגיינה נשית במחירים משתלמים ללקוחות פרטיים.',
    },
    'גבר': {
        'slug': 'men',
        'title': 'מוצרי גילוח וטיפוח לגבר — ג\'ילט, ניוואה | אהרוני',
        'desc': 'סכיני גילוח, ג\'ל וקצף גילוח ג\'ילט, דאודורנט ניוואה לגבר — במחירים משתלמים. הזמנה אונליין ומשלוח בגוש דן והמרכז.',
        'h1': 'מוצרי גילוח וטיפוח לגבר',
        'intro': 'סכיני גילוח ג\'ילט פיוז\'ן וטו, ג\'ל וקצף גילוח לעור רגיש, דאודורנט ניוואה — מבחר מוצרי טיפוח וגילוח לגבר במחירים משתלמים ללקוחות פרטיים.',
    },
    'כללי': {
        'slug': 'general',
        'title': 'מוצרי טיפוח והיגיינה — סבונים, קרמים, וזלין | אהרוני',
        'desc': 'סבוני רחצה פלמוליב ו-DOVE, קרם ניוואה, וזלין, שפתון לחות וקיסמי שיניים — במחירים משתלמים. משלוח בגוש דן והמרכז.',
        'h1': 'מוצרי טיפוח והיגיינה כלליים',
        'intro': 'סבוני רחצה פלמוליב ו-DOVE, קרם רב-שימושי ניוואה, וזלין טהור, שפתון לחות וקיסמי שיניים — מוצרי טיפוח והיגיינה כלליים במחירים משתלמים ללקוחות פרטיים.',
    },
}


def generate_care_category_pages():
    """יוצר/מעדכן דף SEO סטטי לכל קטגוריה תחת /care/<slug>/index.html.

    כל דף קליל (בלי app.js): כותרת ותיאור ממוקדים, טקסט מוצרים קריא לגוגל (שם+מותג+מחיר),
    סכמת ItemList, קישורים הדדיים וכפתור לקטלוג האינטראקטיבי המסונן לקטגוריה.
    """
    from urllib.parse import quote
    from xml.sax.saxutils import escape

    with open(PRICELIST_PUBLIC_FILE, encoding='utf-8') as f:
        rows = [r for r in csv.DictReader(f) if r.get('id') and r.get('name')]

    category_discounts = _load_category_discounts()
    by_cat = {}
    for r in rows:
        by_cat.setdefault(r.get('category', ''), []).append(r)

    # ניווט הדדי בין דפי הקטגוריות
    nav_links = ' · '.join(
        f'<a href="/care/{c["slug"]}/">{escape(cat)}</a>'
        for cat, c in CARE_CATEGORY_PAGES.items() if by_cat.get(cat)
    )

    for cat, cfg in CARE_CATEGORY_PAGES.items():
        products = by_cat.get(cat)
        if not products:
            continue
        page_url = f'{SITE_BASE_URL}/care/{cfg["slug"]}/'
        catalog_url = f'/care/?category={quote(cat)}'

        cards, schema_items = [], []
        for i, r in enumerate(products, start=1):
            price = _effective_price(r, category_discounts)
            if price <= 0:
                continue
            img = SITE_BASE_URL + '/' + quote(r['image'].lstrip('/')) if r.get('image') else ''
            prod_link = f'/care/?category={quote(cat)}&product={quote(r["id"])}'
            desc = r.get('description') or ''
            brand = r.get('brand') or ''

            price_html = f'<span class="cp-price">{price:.2f} ₪</span>'
            try:
                regular = float(r.get('original_price') or 0)
            except ValueError:
                regular = 0
            if regular > price:
                price_html = f'<span class="cp-old">{regular:.2f} ₪</span> ' + price_html

            cards.append(
                '<li class="cp-item">'
                + (f'<a href="{escape(prod_link)}"><img src="{escape(img)}" alt="{escape(r["name"])}" loading="lazy" width="90" height="90"></a>' if img else '')
                + f'<div class="cp-info"><h2 class="cp-name"><a href="{escape(prod_link)}">{escape(r["name"])}</a></h2>'
                + (f'<div class="cp-brand">{escape(brand)}</div>' if brand else '')
                + (f'<div class="cp-desc">{escape(desc)}</div>' if desc else '')
                + f'<div>{price_html}</div></div></li>'
            )

            offer = {'@type': 'Offer', 'price': price, 'priceCurrency': 'ILS',
                     'availability': 'https://schema.org/InStock', 'url': page_url}
            product = {'@type': 'Product', 'name': r['name'], 'sku': r['id'], 'offers': offer}
            if img:
                product['image'] = img
            if brand:
                product['brand'] = {'@type': 'Brand', 'name': brand}
            if desc:
                product['description'] = desc
            schema_items.append({'@type': 'ListItem', 'position': i, 'item': product})

        schema = {
            '@context': 'https://schema.org', '@type': 'CollectionPage',
            'name': cfg['title'], 'url': page_url,
            'breadcrumb': {
                '@type': 'BreadcrumbList',
                'itemListElement': [
                    {'@type': 'ListItem', 'position': 1, 'name': 'קטלוג טיפוח והיגיינה', 'item': f'{SITE_BASE_URL}/care/'},
                    {'@type': 'ListItem', 'position': 2, 'name': cfg['h1'], 'item': page_url},
                ],
            },
            'mainEntity': {'@type': 'ItemList', 'numberOfItems': len(schema_items), 'itemListElement': schema_items},
        }

        html = _render_care_category_html(cfg, cat, page_url, catalog_url, nav_links, '\n'.join(cards), schema)
        out_dir = os.path.join('care', cfg['slug'])
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html)


def _render_care_category_html(cfg, cat, page_url, catalog_url, nav_links, cards_html, schema):
    from xml.sax.saxutils import escape
    return f'''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-W1MRCCC3FS"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('js',new Date());gtag('config','G-W1MRCCC3FS');</script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{escape(cfg['title'])}</title>
    <meta name="description" content="{escape(cfg['desc'])}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="{page_url}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="{page_url}">
    <meta property="og:title" content="{escape(cfg['title'])}">
    <meta property="og:description" content="{escape(cfg['desc'])}">
    <meta property="og:image" content="{SITE_BASE_URL}/images/og-image.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=Heebo:wght@400;500;700&display=swap" media="print" onload="this.media='all'">
    <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=Heebo:wght@400;500;700&display=swap"></noscript>
    <script type="application/ld+json">
{json.dumps(schema, ensure_ascii=False, indent=2)}
    </script>
    <style>
        :root {{ --primary: #639C7D; --primary-dark: #1A4231; }}
        * {{ box-sizing: border-box; }}
        body {{ margin: 0; font-family: 'Assistant','Heebo',system-ui,sans-serif; color: #212121; background: #f8f9fa; line-height: 1.6; }}
        a {{ color: inherit; }}
        .cc-header {{ background: #fff; border-bottom: 1px solid #e0e0e0; }}
        .cc-header-inner {{ max-width: 1000px; margin: 0 auto; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; }}
        .cc-header img {{ height: 50px; width: auto; }}
        .cc-phone {{ color: var(--primary-dark); font-weight: 700; text-decoration: none; }}
        .cc-wrap {{ max-width: 1000px; margin: 0 auto; padding: 20px 16px 40px; }}
        .cc-breadcrumb {{ font-size: 0.85rem; color: #6B6B6B; margin-bottom: 12px; }}
        .cc-breadcrumb a {{ text-decoration: none; }}
        h1 {{ font-size: 1.7rem; color: var(--primary-dark); margin: 0 0 10px; }}
        .cc-intro {{ color: #555; max-width: 720px; margin-bottom: 18px; }}
        .cc-cta {{ display: inline-block; background: var(--primary); color: #fff; text-decoration: none; font-weight: 700; padding: 12px 22px; border-radius: 10px; margin-bottom: 26px; }}
        .cc-cta:hover {{ background: var(--primary-dark); }}
        .cc-nav {{ font-size: 0.95rem; margin-bottom: 22px; }}
        .cc-nav a {{ text-decoration: none; color: var(--primary-dark); font-weight: 600; }}
        .cp-list {{ list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }}
        .cp-item {{ display: flex; gap: 12px; background: #fff; border: 1px solid #e8e8e8; border-radius: 10px; padding: 12px; }}
        .cp-item img {{ width: 90px; height: 90px; object-fit: contain; background: #fff; flex-shrink: 0; }}
        .cp-name {{ font-size: 1rem; margin: 0 0 4px; line-height: 1.3; }}
        .cp-name a {{ text-decoration: none; }}
        .cp-brand {{ font-size: 0.82rem; color: #6B6B6B; margin-bottom: 4px; }}
        .cp-desc {{ font-size: 0.85rem; color: #757575; margin-bottom: 6px; }}
        .cp-price {{ font-weight: 700; color: var(--primary-dark); font-size: 1.05rem; }}
        .cp-old {{ text-decoration: line-through; color: #999; font-weight: 400; font-size: 0.9rem; }}
        .cc-footer {{ background: var(--primary-dark); color: #fff; text-align: center; padding: 20px 16px; margin-top: 30px; }}
        .cc-footer a {{ color: #fff; }}
    </style>
</head>
<body>
    <header class="cc-header">
        <div class="cc-header-inner">
            <a href="/care/" aria-label="קטלוג טיפוח והיגיינה אהרוני"><img src="/images/logo.png" alt="אהרוני שיווק והפצה"></a>
            <a href="tel:036346236" class="cc-phone">03-6346236</a>
        </div>
    </header>
    <main class="cc-wrap">
        <nav class="cc-breadcrumb"><a href="/care/">קטלוג טיפוח והיגיינה</a> ← {escape(cfg['h1'])}</nav>
        <h1>{escape(cfg['h1'])}</h1>
        <p class="cc-intro">{escape(cfg['intro'])}</p>
        <a class="cc-cta" href="{escape(catalog_url)}">לצפייה, מחירים והזמנה בקטלוג →</a>
        <nav class="cc-nav">קטגוריות נוספות: {nav_links}</nav>
        <ul class="cp-list">
{cards_html}
        </ul>
    </main>
    <footer class="cc-footer">
        <div><strong>אהרוני שיווק והפצה</strong></div>
        <div><a href="tel:0526000158">052-6000158</a> · <a href="https://wa.me/972526000158">WhatsApp</a></div>
        <div>משלוחים באזור אור יהודה, בקעת אונו וגוש דן</div>
        <div style="margin-top:8px;"><a href="{escape(catalog_url)}">חזרה לקטלוג המלא</a></div>
    </footer>
</body>
</html>
'''


def update_care_schema():
    """בונה JSON-LD (ItemList של Product עם מחירים) מ-pricelist.csv ומשתיל ב-care/index.html.

    רץ בכל שמירה של המחירון כדי שגוגל יקבל שמות, תמונות ומחירים מעודכנים.
    """
    from urllib.parse import quote

    with open(PRICELIST_PUBLIC_FILE, encoding='utf-8') as f:
        rows = [r for r in csv.DictReader(f) if r.get('id') and r.get('name')]

    category_discounts = _load_category_discounts()

    items = []
    for i, r in enumerate(rows, start=1):
        price = _effective_price(r, category_discounts)
        # גוגל דורש מחיר ותמונה לכל מוצר בסכמה — מוצר בלי גורם לשגיאה קריטית בבדיקת העשירות.
        # מדלגים עליו; הוא יתווסף אוטומטית בשמירה הבאה אחרי שתהיה לו תמונה/מחיר
        if price <= 0 or not (r.get('image') or '').strip():
            continue
        product = {
            '@type': 'Product',
            'name': r['name'],
            'sku': r['id'],
            'offers': {
                '@type': 'Offer',
                'price': price,
                'priceCurrency': 'ILS',
                'availability': 'https://schema.org/InStock',
                'url': f'{SITE_BASE_URL}/care/',
            },
        }
        if r.get('image'):
            product['image'] = SITE_BASE_URL + '/' + quote(r['image'].lstrip('/'))
        if r.get('description'):
            product['description'] = r['description']
        if r.get('brand'):
            product['brand'] = {'@type': 'Brand', 'name': r['brand']}
        items.append({'@type': 'ListItem', 'position': i, 'item': product})

    schema = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': 'קטלוג טיפוח והיגיינה במחירים לצרכן | אהרוני שיווק והפצה',
        'url': f'{SITE_BASE_URL}/care/',
        'publisher': {
            '@type': 'WholesaleStore',
            'name': 'אהרוני שיווק והפצה',
            'url': f'{SITE_BASE_URL}/',
        },
        'mainEntity': {'@type': 'ItemList', 'numberOfItems': len(items), 'itemListElement': items},
    }

    with open(CARE_PAGE_FILE, encoding='utf-8') as f:
        html = f.read()
    start_marker, end_marker = '<!-- CARE_SCHEMA_START -->', '<!-- CARE_SCHEMA_END -->'
    start = html.find(start_marker)
    end = html.find(end_marker)
    if start == -1 or end == -1:
        return  # אין סימוני שתילה — לא נוגעים בעמוד
    block = (start_marker + '\n    <script type="application/ld+json">\n'
             + json.dumps(schema, ensure_ascii=False, indent=2)
             + '\n    </script>\n    ')
    html = html[:start] + block + html[end:]

    # מניעת קפיצת פריסה (CLS): כשידוע כבר בזמן השמירה שיהיה באנר מבצעים,
    # שומרים לו את המקום מהרגע הראשון במקום לדחוף את הדף אחרי טעינת ה-JS
    has_sales = any((r.get('original_price') or '').strip() for r in rows)
    has_promo = has_sales or bool(category_discounts)
    try:
        with open(PRICELIST_PROMO_FILE, encoding='utf-8') as f:
            promo_cfg = json.load(f)
        banner_cfg = promo_cfg.get('banner') or {}
        cart_cfg = promo_cfg.get('cart_discount') or {}
        has_promo = has_promo or (banner_cfg.get('enabled') and banner_cfg.get('text')) or (
            cart_cfg.get('enabled') and float(cart_cfg.get('percent') or 0) > 0)
    except (FileNotFoundError, ValueError):
        pass
    banner_tag = '<div id="promo-banner" style="display:block"></div>' if has_promo else '<div id="promo-banner"></div>'
    html = re.sub(r'<div id="promo-banner"[^>]*></div>', banner_tag, html)

    with open(CARE_PAGE_FILE, 'w', encoding='utf-8') as f:
        f.write(html)

class AdminHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable caching for API and data files
        if self.path.startswith('/api/') or self.path.endswith('.csv'):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/list-images':
            self.handle_list_images()
        elif parsed.path == '/api/fetch-sheet':
            self.handle_fetch_sheet(parse_qs(parsed.query))
        else:
            # Allow default behavior for all GET requests (serving static files)
            super().do_GET()

    def handle_fetch_sheet(self, params):
        # מושך גיליון גוגל שיטס כ-CSV עבור עורך המחירון (הדפדפן חסום ב-CORS מול גוגל)
        try:
            sheet_id = (params.get('id') or [''])[0]
            if not re.match(r'^[A-Za-z0-9_-]{10,}$', sheet_id):
                raise ValueError('מזהה גיליון לא תקין')
            url = f'https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv'
            # curl של המערכת — ל-python3 של מק אין תעודות SSL כברירת מחדל
            result = subprocess.run(['curl', '-sL', '--max-time', '20', url], capture_output=True)
            if result.returncode != 0:
                raise ValueError('לא הצלחתי לגשת לגוגל — בדוק חיבור אינטרנט')
            text = result.stdout.decode('utf-8-sig')
            if text.lstrip().lower().startswith(('<!doctype', '<html')):
                raise ValueError('הגיליון לא משותף — בגוגל שיטס: שיתוף ← "כל מי שיש לו את הקישור" (צפייה)')

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'csv': text}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

    def handle_list_images(self):
        # רשימת כל קובצי התמונות — משמש את עורך המחירון להתאמת תמונות לפי שם קובץ
        try:
            exts = ('.png', '.jpg', '.jpeg', '.webp', '.gif')
            files = []
            for root, _dirs, names in os.walk(IMAGES_DIR):
                for n in names:
                    if n.lower().endswith(exts):
                        files.append(os.path.join(root, n).replace('\\', '/'))

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'images': files}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

    def do_POST(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/products':
            self.handle_save_products()
        elif parsed_path.path == '/api/pricelist':
            self.handle_save_pricelist()
        elif parsed_path.path == '/api/upload':
            self.handle_upload_image()
        elif parsed_path.path == '/api/promo':
            self.handle_save_promo()
        else:
            self.send_error(404, "API endpoint not found")

    def handle_save_promo(self):
        # מבצעי קטלוג הטיפוח: באנר ידני, הנחת סל והנחות קטגוריה
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(content_length).decode('utf-8'))

            def to_num(v):
                try:
                    return max(0.0, float(v))
                except (TypeError, ValueError):
                    return 0.0

            banner = data.get('banner') or {}
            cart = data.get('cart_discount') or {}
            promo = {
                'banner': {'enabled': bool(banner.get('enabled')), 'text': str(banner.get('text', ''))[:200]},
                'cart_discount': {
                    'enabled': bool(cart.get('enabled')),
                    'min_total': to_num(cart.get('min_total')),
                    'min_items': int(to_num(cart.get('min_items'))),
                    'percent': min(90.0, to_num(cart.get('percent'))),
                },
                'category_discounts': [
                    {'category': str(r.get('category', ''))[:60], 'percent': min(90.0, to_num(r.get('percent')))}
                    for r in (data.get('category_discounts') or [])
                    if r.get('category') and to_num(r.get('percent')) > 0
                ][:20],
            }
            with open(PRICELIST_PROMO_FILE, 'w', encoding='utf-8') as f:
                json.dump(promo, f, ensure_ascii=False, indent=1)

            # הסכמה, הפיד ודפי הקטגוריה משקפים גם הנחות קטגוריה — מעדכנים
            try:
                update_care_schema()
                bake_care_products()
                update_merchant_feed()
                generate_care_category_pages()
            except Exception as schema_err:
                print(f'אזהרה: עדכון סכמת care/פיד/דפי קטגוריה נכשל: {schema_err}')

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

    def handle_save_products(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            products = json.loads(post_data.decode('utf-8'))
            
            # Write to CSV
            with open(DATA_FILE, 'w', newline='', encoding='utf-8') as f:
                if len(products) > 0:
                    fieldnames = list(products[0].keys())
                    # Ensure description is present if not in first product
                    if 'description' not in fieldnames:
                        fieldnames.append('description')
                    writer = csv.DictWriter(f, fieldnames=fieldnames)
                    writer.writeheader()
                    for p in products:
                        writer.writerow(p)
                else:
                    # Empty file with headers
                    f.write('id,name,category,unit,image,price,description\n')

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

    def handle_save_pricelist(self):
        # כותב את המחירון פעמיים: קובץ מלא מקומי (עם עלות) + קובץ ציבורי לאתר (בלי עלות)
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            products = json.loads(post_data.decode('utf-8'))

            # 'active' נשמר רק במאסטר; מוצר מוסתר (active=0) לא נכתב לקובץ הציבורי
            # ולכן נעלם אוטומטית מהקטלוג, מהסכמה, מהפיד ומדפי הקטגוריה
            master_fields = ['id', 'name', 'category', 'unit', 'brand', 'image', 'cost', 'price', 'sale_price', 'active', 'description']
            public_fields = ['id', 'name', 'category', 'unit', 'brand', 'image', 'price', 'original_price', 'description']

            def to_float(v):
                try:
                    return float(v)
                except (TypeError, ValueError):
                    return None

            def is_hidden(p):
                return str(p.get('active', '')).strip() == '0'

            with open(PRICELIST_MASTER_FILE, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=master_fields, extrasaction='ignore')
                writer.writeheader()
                for p in products:
                    row = {k: p.get(k, '') for k in master_fields}
                    # ברירת מחדל: מוצג (1) אלא אם סומן במפורש כמוסתר
                    row['active'] = '0' if is_hidden(p) else '1'
                    writer.writerow(row)

            # בקובץ הציבורי: כשיש מבצע — price = מחיר המבצע, original_price = המחיר הרגיל (לתצוגת "מבצע")
            with open(PRICELIST_PUBLIC_FILE, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=public_fields, extrasaction='ignore')
                writer.writeheader()
                for p in products:
                    if is_hidden(p):
                        continue  # מוצר מוסתר — לא עולה לאתר
                    row = {k: p.get(k, '') for k in public_fields}
                    sale = to_float(p.get('sale_price'))
                    regular = to_float(p.get('price'))
                    if sale is not None and regular is not None and 0 < sale < regular:
                        row['price'] = sale
                        row['original_price'] = regular
                    else:
                        row['original_price'] = ''
                    writer.writerow(row)

            # עדכון סכמה, פיד ודפי קטגוריה (SEO + שופינג ללקוחות פרטיים)
            try:
                update_care_schema()
                bake_care_products()
                update_merchant_feed()
                generate_care_category_pages()
            except Exception as schema_err:
                print(f'אזהרה: עדכון סכמת care/פיד/דפי קטגוריה נכשל: {schema_err}')

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

    def handle_upload_image(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            filename = data.get('filename')
            base64_data = data.get('data')
            
            if not filename or not base64_data:
                raise ValueError("Missing filename or data")
                
            # Remove base64 header if present (e.g., data:image/png;base64,)
            if ',' in base64_data:
                base64_data = base64_data.split(',')[1]
                
            file_path = os.path.join(IMAGES_DIR, filename)
            
            # Ensure images dir exists
            if not os.path.exists(IMAGES_DIR):
                os.makedirs(IMAGES_DIR)
                
            with open(file_path, 'wb') as f:
                f.write(base64.b64decode(base64_data))

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            # Return the relative path starting with /images/
            self.wfile.write(json.dumps({'success': True, 'path': f'/images/{filename}'}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

if __name__ == '__main__':
    Handler = AdminHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Server starting on port {PORT} with Admin API enabled")
        httpd.serve_forever()
