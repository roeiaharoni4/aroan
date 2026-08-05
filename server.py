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
CARE_SHIPPING_FILE = 'data/care-shipping.json'
CARE_PAGE_FILE = 'care/index.html'
MERCHANT_FEED_FILE = 'data/merchant-feed.xml'
SITE_BASE_URL = 'https://aroam.co.il'

# שני מחירונים חיים על אותו עורך ועל אותם endpoints, ונבדלים רק בקבצים
# ובגנרטורים שרצים אחרי השמירה. 'care' הוא קטלוג הטיפוח הציבורי (SEO, פיד,
# דפי מוצר); 'committee' הוא עמוד ועד העובדים הסגור — noindex, ולכן שמירה שם
# לא מריצה שום גנרטור. הקטלוג נבחר דרך ?catalog= בבקשה, ברירת המחדל care.
PRICELIST_CATALOGS = {
    'care': {
        'master': PRICELIST_MASTER_FILE,
        'public': PRICELIST_PUBLIC_FILE,
        'promo': PRICELIST_PROMO_FILE,
        'shipping': CARE_SHIPPING_FILE,
        'generators': True,
    },
    'committee': {
        'master': 'data/committee-master.csv',
        'public': 'data/committee.csv',
        'promo': 'data/committee-promo.json',
        'shipping': 'data/committee-shipping.json',
        'generators': False,
    },
}

# עמודות הקטלוג העסקי (data/products.csv). מקור אמת יחיד לכתיבה מהעורך —
# packaging = מידע אריזה/קרטון, subcategory = שיוך לדף תת-קטגוריה (שניהם אופציונליים).
PRODUCT_FIELDS = ['id', 'name', 'category', 'subcategory', 'unit', 'image',
                  'price', 'brand', 'carton_qty', 'packaging', 'description']


def _clean_date(v):
    """מנרמל תאריך ל-YYYY-MM-DD; כל קלט לא תקין הופך למחרוזת ריקה (= בלי הגבלה)."""
    s = str(v or '').strip()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', s):
        return ''
    try:
        import datetime
        datetime.date.fromisoformat(s)
    except ValueError:
        return ''
    return s


def _clean_bundle(v):
    """מנרמל מבצע חבילה לפורמט 'X+Y' (קנה X קבל Y). קלט לא תקין → ריק."""
    s = str(v or '').strip().replace(' ', '')
    m = re.fullmatch(r'(\d{1,2})\+(\d{1,2})', s)
    if not m:
        return ''
    buy, free = int(m.group(1)), int(m.group(2))
    if buy < 1 or free < 1:
        return ''
    return f'{buy}+{free}'


# שיטות האספקה של קטלוג הטיפוח. ברירת המחדל משקפת את המצב האמיתי היום —
# מסלול החלוקה ואיסוף עצמי בלבד; לוקר ומשלוח עד הבית כבויים עד שרועי ימלא מחירים,
# כדי שהאתר לא יבטיח שירות שעדיין לא קיים.
SHIPPING_DEFAULTS = [
    {'id': 'route', 'label': 'משלוח עם מסלול החלוקה', 'enabled': True, 'fee': 0.0,
     'free_above': 0.0, 'note': 'אור יהודה, בקעת אונו וגוש דן', 'needs_address': True},
    {'id': 'pickup', 'label': 'איסוף עצמי', 'enabled': True, 'fee': 0.0,
     'free_above': 0.0, 'note': 'בתיאום טלפוני מראש', 'needs_address': False},
    {'id': 'locker', 'label': 'איסוף מלוקר', 'enabled': False, 'fee': 0.0,
     'free_above': 0.0, 'note': '', 'needs_address': False},
    {'id': 'home', 'label': 'משלוח עד הבית', 'enabled': False, 'fee': 0.0,
     'free_above': 0.0, 'note': '', 'needs_address': True},
]


def _clean_shipping_methods(raw):
    """מנרמל רשימת שיטות אספקה. שומר על סדר ברירת המחדל ועל מזהים מהרשימה הסגורה בלבד."""
    by_id = {}
    for m in (raw or []):
        if isinstance(m, dict) and m.get('id'):
            by_id[str(m['id'])] = m

    def to_num(v):
        try:
            return max(0.0, round(float(v), 2))
        except (TypeError, ValueError):
            return 0.0

    methods = []
    for default in SHIPPING_DEFAULTS:
        src = by_id.get(default['id'], {})
        methods.append({
            'id': default['id'],
            'label': (str(src.get('label', '')).strip() or default['label'])[:60],
            'enabled': bool(src.get('enabled', default['enabled'])),
            'fee': to_num(src.get('fee', default['fee'])),
            'free_above': to_num(src.get('free_above', default['free_above'])),
            'note': str(src.get('note', default['note']) or '')[:120],
            # לא נלקח מהקלט: תלוי בשיטה עצמה ולא בהחלטת המשתמש
            'needs_address': default['needs_address'],
        })
    return methods


def _load_shipping():
    """קונפיג שיטות האספקה. קובץ חסר או פגום → ברירת המחדל, כדי שהפיד והעמוד לא ייפלו."""
    try:
        with open(CARE_SHIPPING_FILE, encoding='utf-8') as f:
            data = json.load(f)
        return _clean_shipping_methods(data.get('methods'))
    except (FileNotFoundError, ValueError, AttributeError):
        return _clean_shipping_methods(None)


def _load_promo_window():
    """החלון הגלובלי {'starts':..., 'ends':...} מקובץ המבצעים. מחרוזת ריקה = בלי הגבלה."""
    try:
        with open(PRICELIST_PROMO_FILE, encoding='utf-8') as f:
            w = (json.load(f).get('window') or {})
        return {'starts': _clean_date(w.get('starts')), 'ends': _clean_date(w.get('ends'))}
    except (FileNotFoundError, ValueError):
        return {'starts': '', 'ends': ''}


def _promo_active(starts, ends, today=None):
    """האם מבצע בתוקף היום (כולל קצוות). מחרוזת ריקה = בלי הגבלה מאותו צד."""
    import datetime
    today = today or datetime.date.today().isoformat()
    if starts and today < starts:
        return False
    if ends and today > ends:
        return False
    return True


def _product_promo_active(row, window):
    """תוקף המבצעים של מוצר: תאריכים פר-מוצר גוברים על החלון הגלובלי."""
    start = _clean_date(row.get('promo_start'))
    end = _clean_date(row.get('promo_end'))
    if start or end:
        return _promo_active(start, end)
    if window is None:
        window = _load_promo_window()  # ברירת מחדל בטוחה אם הקורא לא העביר חלון
    return _promo_active(window.get('starts', ''), window.get('ends', ''))


def _scoped_active(rule, window):
    """תוקף מבצע כללי: תאריכים משלו גוברים, אחרת החלון הגלובלי."""
    starts = _clean_date((rule or {}).get('starts'))
    ends = _clean_date((rule or {}).get('ends'))
    if starts or ends:
        return _promo_active(starts, ends)
    window = window or {'starts': '', 'ends': ''}
    return _promo_active(window.get('starts', ''), window.get('ends', ''))


def _load_category_discounts():
    """מחזיר {קטגוריה: {'percent', 'ends'}} — רק כללים שבתוקף היום.

    לכל כלל תאריכים משלו; כלל בלי תאריכים נופל לחלון הגלובלי. 'ends' נשמר
    כדי שתאריך התוקף שמוצג (ו-priceValidUntil) יתאים לכלל שחל בפועל.
    """
    window = _load_promo_window()
    discounts = {}
    try:
        with open(PRICELIST_PROMO_FILE, encoding='utf-8') as f:
            promo = json.load(f)
        for rule in promo.get('category_discounts', []):
            pct = float(rule.get('percent') or 0)
            if not rule.get('category') or pct <= 0 or not _scoped_active(rule, window):
                continue
            ends = _clean_date(rule.get('ends'))
            if not (_clean_date(rule.get('starts')) or ends):
                ends = window.get('ends', '')   # אין תאריכים לכלל — חל תאריך החלון
            discounts[rule['category']] = {'percent': pct, 'ends': ends}
    except (FileNotFoundError, ValueError):
        pass
    return discounts


def _effective_price(row, category_discounts, window=None):
    """המחיר שהלקוח רואה בפועל: מחיר מבצע פרטני אם יש, אחרת הנחת קטגוריה, עיגול ל-10 אג'.

    מבצע שפג תוקף (לפי תאריכי המוצר או החלון הגלובלי) חוזר למחיר הרגיל.
    """
    try:
        price = float(row.get('price') or 0)
    except ValueError:
        return 0
    if price <= 0:
        return 0
    try:
        regular = float(row.get('original_price') or 0)
    except ValueError:
        regular = 0

    if not _product_promo_active(row, window):
        # מבצע פרטני שפג — חוזרים למחיר המקורי; הנחת קטגוריה לא מוחלת
        return regular if regular > price else price

    if not (row.get('original_price') or '').strip() and row.get('category') in category_discounts:
        pct = category_discounts[row['category']]['percent']
        price = round(price * (1 - pct / 100) * 10) / 10
    return price


def _bundle_label(row, window):
    """תווית החבילה של מוצר ('1+1') אם הוגדרה ובתוקף, אחרת ריק."""
    b = _clean_bundle(row.get('bundle'))
    if not b or not _product_promo_active(row, window):
        return ''
    return b


def _promo_dates_for(row, window, category_discounts=None):
    """התאריכים החלים על המוצר, לפי סדר עדיפויות:
    תאריכי המוצר → תאריך כלל הקטגוריה שחל עליו → החלון הגלובלי."""
    start = _clean_date(row.get('promo_start'))
    end = _clean_date(row.get('promo_end'))
    if start or end:
        return start, end
    # הנחת קטגוריה חלה רק כשאין למוצר מחיר מבצע פרטני
    if category_discounts and not (row.get('original_price') or '').strip():
        rule = category_discounts.get(row.get('category'))
        if rule and rule.get('ends'):
            return '', rule['ends']
    window = window or {'starts': '', 'ends': ''}
    return window.get('starts', ''), window.get('ends', '')


def _price_is_discounted(row, effective_price):
    """האם המחיר האפקטיבי מוזל בפועל — ממבצע פרטני או מהנחת קטגוריה.

    בקובץ הציבורי price הוא כבר מחיר המבצע (אם יש), ו-original_price המחיר הרגיל.
    הנחת קטגוריה מורידה את המחיר מתחת ל-price שבקובץ.
    """
    try:
        raw = float(row.get('price') or 0)
        regular = float(row.get('original_price') or 0)
    except ValueError:
        return False
    return regular > effective_price or effective_price < raw


def _sale_effective_date(row, window, category_discounts=None):
    """טווח תוקף המבצע בפורמט ISO של Merchant (`start/end`). ריק כשאין תאריך סיום."""
    import datetime
    start, end = _promo_dates_for(row, window, category_discounts)
    if not end:
        return ''  # בלי סוף מוגדר אין מה לתחום
    if not start:
        start = datetime.date.today().isoformat()
    return f'{start}T00:00:00Z/{end}T23:59:59Z'


def _slugify_he(name):
    """slug עברי לכתובת/שם-תיקייה: מסיר תווים בעייתיים, רווחים→מקף, כיווץ מקפים."""
    s = (name or '').strip()
    s = re.sub(r'["\'/\\:*?<>|()\[\]{}״׳]', '', s)  # מרכאות/סלאשים/סוגריים/גרש עברי
    s = re.sub(r'[\s.,]+', '-', s)                             # רווחים ופיסוק → מקף
    s = re.sub(r'-{2,}', '-', s).strip('-')
    return s


def _care_product_slugs(rows):
    """מפה דטרמיניסטית {id: slug} — כל הגנרטורים משתמשים בה כדי שכל הקישורים לדף המוצר
    יכוונו לאותה כתובת. הסדר קבוע (סדר ה-CSV), כך שהמפה זהה בכל פונקציה."""
    slugs, taken = {}, set()
    for r in rows:
        pid = r.get('id')
        if not pid:
            continue
        base = _slugify_he(r.get('name')) or str(pid)
        slug = base if base not in taken else f'{base}-{pid}'
        n, uniq = 2, slug
        while uniq in taken:                                   # התנגשות נדירה נוספת
            uniq, n = f'{slug}-{n}', n + 1
        taken.add(uniq)
        slugs[pid] = uniq
    return slugs


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
    window = _load_promo_window()
    slugs = _care_product_slugs(rows)

    cards = []
    for r in rows:
        price = _effective_price(r, category_discounts, window)
        if price <= 0:
            continue
        img = SITE_BASE_URL + '/' + quote(r['image'].lstrip('/')) if r.get('image') else ''
        link = f'/care/product/{quote(slugs[r["id"]])}/'
        price_html = f'<span class="product-price">{price:.2f} ₪</span>'
        try:
            regular = float(r.get('original_price') or 0)
        except ValueError:
            regular = 0
        if regular > price:
            price_html = f'<span class="product-price">{price:.2f} ₪ <span class="price-old">{regular:.2f} ₪</span></span>'
        bundle = _bundle_label(r, window)
        if bundle:
            price_html += f' <span class="bundle-badge">{escape(bundle)}</span>'
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


# מיפוי קטגוריות הקטלוג לטקסונומיה של Google Merchant — עוזר לגוגל להציג את המוצר
# לחיפושים הנכונים (משפר חשיפה ואיכות הפיד). ברירת מחדל: Personal Care.
GOOGLE_PRODUCT_CATEGORIES = {
    'שיער': 'Health & Beauty > Personal Care > Hair Care',
    'כביסה': 'Home & Garden > Household Supplies > Laundry Supplies',
    'היגיינת פה': 'Health & Beauty > Personal Care > Oral Care',
    'נשים': 'Health & Beauty > Personal Care > Feminine Sanitary Supplies',
    'גבר': 'Health & Beauty > Personal Care > Shaving & Grooming',
    'כללי': 'Health & Beauty > Personal Care',
}


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
    window = _load_promo_window()
    slugs = _care_product_slugs(rows)

    # g:shipping — חוסם מרכזי לאישור מוצרים ב-Merchant כשאין הגדרות משלוח בחשבון.
    # רק שיטות שהן משלוח בפועל (needs_address); איסוף עצמי ולוקר אינם משלוח ואסור
    # שיוצגו כמשלוח חינם. המחיר הוא דמי המשלוח המלאים ולא הסף המוזל — הצהרה נמוכה
    # מהעלות בפועל היא הפרה של מדיניות גוגל, הצהרה גבוהה איננה.
    shipping_xml = []
    for m in _load_shipping():
        if not m['enabled'] or not m['needs_address']:
            continue
        shipping_xml.append(
            "<g:shipping><g:country>IL</g:country>"
            f"<g:service>{escape(m['label'])}</g:service>"
            f"<g:price>{m['fee']:.2f} ILS</g:price></g:shipping>"
        )

    items_xml = []
    for r in rows:
        price = _effective_price(r, category_discounts, window)
        if price <= 0 or not (r.get('image') or '').strip():
            continue  # Merchant דורש מחיר ותמונה לכל מוצר

        image_link = SITE_BASE_URL + '/' + quote(r['image'].lstrip('/'))
        link = f"{SITE_BASE_URL}/care/product/{quote(slugs[r['id']])}/"
        desc = r.get('description') or r['name']

        # מבצע (פרטני או הנחת קטגוריה): g:price = המחיר הרגיל, g:sale_price = מחיר המבצע
        try:
            regular = float(r.get('original_price') or 0)
            raw = float(r.get('price') or 0)
        except ValueError:
            regular, raw = 0, price
        list_price = max(regular, raw)   # המחיר לפני כל הנחה
        on_sale = list_price > price
        if on_sale:
            regular = list_price

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
            # תיחום המבצע בתאריכים — גוגל מפסיק להציג את מחיר המבצע בעצמו בסוף החלון
            eff = _sale_effective_date(r, window, category_discounts)
            if eff:
                parts.append(f"<g:sale_price_effective_date>{eff}</g:sale_price_effective_date>")
        if r.get('brand'):
            parts.append(f"<g:brand>{escape(r['brand'])}</g:brand>")
        # סיווג לטקסונומיה של גוגל + product_type — משפר התאמה לחיפושים וחשיפה
        cat = r.get('category', '')
        gcat = GOOGLE_PRODUCT_CATEGORIES.get(cat, 'Health & Beauty > Personal Care')
        parts.append(f"<g:google_product_category>{escape(gcat)}</g:google_product_category>")
        if cat:
            parts.append(f"<g:product_type>{escape('טיפוח והיגיינה > ' + cat)}</g:product_type>")
        # אין ברקוד (GTIN) — מצהירים על כך כדי ש-Merchant לא ידחה
        parts.append("<g:identifier_exists>no</g:identifier_exists>")
        parts.extend(shipping_xml)
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
    window = _load_promo_window()
    slugs = _care_product_slugs(rows)
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
            price = _effective_price(r, category_discounts, window)
            if price <= 0:
                continue
            img = SITE_BASE_URL + '/' + quote(r['image'].lstrip('/')) if r.get('image') else ''
            prod_link = f'/care/product/{quote(slugs[r["id"]])}/'
            desc = r.get('description') or ''
            brand = r.get('brand') or ''

            price_html = f'<span class="cp-price">{price:.2f} ₪</span>'
            try:
                regular = float(r.get('original_price') or 0)
            except ValueError:
                regular = 0
            if regular > price:
                price_html = f'<span class="cp-old">{regular:.2f} ₪</span> ' + price_html
            bundle = _bundle_label(r, window)
            if bundle:
                price_html += f' <span class="cp-bundle">{escape(bundle)}</span>'
            # "עד DD.MM" צמוד לתג — לכל מבצע פעיל (מחיר מבצע, הנחת קטגוריה או חבילה)
            _, _cat_end = _promo_dates_for(r, window, category_discounts)
            if _cat_end and (bundle or _price_is_discounted(r, price)):
                _d = _cat_end.split('-')
                price_html += f' <span class="cp-validity">עד {_d[2]}.{_d[1]}</span>'

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
            _, promo_end = _promo_dates_for(r, window, category_discounts)
            if promo_end and _price_is_discounted(r, price):
                offer['priceValidUntil'] = promo_end
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


def _care_faq(label):
    """שאלות ותשובות ל-/care/ — תשובות מדויקות בלבד (הזמנה, אזור חלוקה, מע"מ, החזרות, מבצעים).
    השאלה הראשונה ממוקדת-קטגוריה; מוזרק גם כטקסט גלוי וגם כסכמת FAQPage."""
    topic = f'מוצרי {label}' if label else 'המוצרים'
    return [
        (f'איך מזמינים {topic}?',
         'בוחרים את המוצרים בקטלוג ושולחים את ההזמנה בלחיצה בוואטסאפ 052-6000158 או בטלפון 03-6346236. '
         'ההזמנה נשלחת אלינו עם רשימת המוצרים והכמויות ואנחנו חוזרים לתיאום.'),
        ('לאילו אזורים מגיע המשלוח?',
         'אנחנו מספקים לאזור אור יהודה, בקעת אונו, גוש דן והמרכז.'),
        ('המחירים כוללים מע"מ?',
         'כן. המחירים המוצגים הם מחירים לצרכן וכוללים מע"מ.'),
        ('אפשר להחזיר או לבטל הזמנה?',
         'בהתאם לחוק הגנת הצרכן ניתן לבטל עסקה ולהחזיר מוצר, למעט מוצרי היגיינה שנפתחו. '
         'ליצירת קשר: 03-6346236.'),
        ('יש מבצעים?',
         'כן — קטגוריית "מבצעים" בקטלוג מרכזת את המוצרים שנמכרים כעת במחיר מוזל.'),
    ]


def _render_care_category_html(cfg, cat, page_url, catalog_url, nav_links, cards_html, schema):
    from xml.sax.saxutils import escape
    faq = _care_faq(cat)
    faq_schema = {
        '@context': 'https://schema.org', '@type': 'FAQPage',
        'mainEntity': [
            {'@type': 'Question', 'name': q,
             'acceptedAnswer': {'@type': 'Answer', 'text': a}}
            for q, a in faq
        ],
    }
    faq_html = '\n'.join(
        f'<div class="cc-faq-item"><h3 class="cc-faq-q">{escape(q)}</h3>'
        f'<p class="cc-faq-a">{escape(a)}</p></div>'
        for q, a in faq
    )
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
    <script type="application/ld+json">
{json.dumps(faq_schema, ensure_ascii=False, indent=2)}
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
        .cp-desc {{ font-size: 0.85rem; color: #616161; margin-bottom: 6px; }}
        .cp-price {{ font-weight: 700; color: var(--primary-dark); font-size: 1.05rem; }}
        .cp-old {{ text-decoration: line-through; color: #6b6b6b; font-weight: 400; font-size: 0.9rem; }}
        .cp-bundle {{ background: var(--primary); color: #fff; font-size: 0.75rem; font-weight: 700; padding: 1px 7px; border-radius: 5px; margin-inline-start: 4px; }}
        .cp-validity {{ font-size: 0.72rem; color: #6B6B6B; margin-inline-start: 4px; white-space: nowrap; }}
        .cc-footer {{ background: var(--primary-dark); color: #fff; text-align: center; padding: 20px 16px; margin-top: 30px; }}
        .cc-footer a {{ color: #fff; }}
        .cc-faq {{ margin-top: 40px; border-top: 1px solid #e0e0e0; padding-top: 20px; }}
        .cc-faq h2 {{ font-size: 1.25rem; color: var(--primary-dark); margin: 0 0 14px; }}
        .cc-faq-item {{ margin-bottom: 14px; }}
        .cc-faq-q {{ font-size: 1rem; color: var(--primary-dark); margin: 0 0 4px; }}
        .cc-faq-a {{ margin: 0; color: #555; }}
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
        <section class="cc-faq">
            <h2>שאלות ותשובות</h2>
{faq_html}
        </section>
    </main>
    <footer class="cc-footer">
        <div><strong>אהרוני שיווק והפצה</strong></div>
        <div><a href="tel:036346236">03-6346236</a> · <a href="https://wa.me/972526000158">WhatsApp</a></div>
        <div>משלוחים באזור אור יהודה, בקעת אונו וגוש דן</div>
        <div style="margin-top:8px;"><a href="{escape(catalog_url)}">חזרה לקטלוג המלא</a></div>
    </footer>
</body>
</html>
'''


def generate_care_product_pages():
    """יוצר/מעדכן דף SEO סטטי לכל מוצר תחת /care/product/<slug>/index.html.

    דף אינדקסבּילי (בלי app.js) עם סכמת Product מלאה, מחיר/מבצע, CTA לקטלוג האינטראקטיבי
    ומוצרים קשורים. בנוסף מנקה דפי מוצר מיושנים ומזריק את הכתובות ל-sitemap.xml.
    מוצר נכתב אם יש לו מחיר אפקטיבי > 0 (תמונה אופציונלית — כדי שכל קישור בדפי הקטגוריה יפתר).
    """
    from urllib.parse import quote

    with open(PRICELIST_PUBLIC_FILE, encoding='utf-8') as f:
        rows = [r for r in csv.DictReader(f) if r.get('id') and r.get('name')]

    category_discounts = _load_category_discounts()
    window = _load_promo_window()
    slugs = _care_product_slugs(rows)
    cat_slug = {cat: cfg['slug'] for cat, cfg in CARE_CATEGORY_PAGES.items()}

    by_cat = {}
    for r in rows:
        by_cat.setdefault(r.get('category', ''), []).append(r)

    generated, sitemap_urls = set(), []
    for r in rows:
        price = _effective_price(r, category_discounts, window)
        if price <= 0:
            continue
        slug = slugs[r['id']]
        page_url = f'{SITE_BASE_URL}/care/product/{quote(slug)}/'
        cat = r.get('category', '')
        img = SITE_BASE_URL + '/' + quote(r['image'].lstrip('/')) if r.get('image') else ''
        try:
            regular = float(r.get('original_price') or 0)
        except ValueError:
            regular = 0
        on_sale = regular > price

        related = []
        for other in by_cat.get(cat, []):
            if other['id'] == r['id'] or _effective_price(other, category_discounts, window) <= 0:
                continue
            related.append(other)
            if len(related) >= 6:
                break

        html = _render_care_product_html(r, price, regular, on_sale, img, cat,
                                         cat_slug.get(cat), page_url, slugs, related,
                                         _bundle_label(r, window), _promo_dates_for(r, window, category_discounts))
        out_dir = os.path.join('care', 'product', slug)
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html)
        generated.add(slug)
        sitemap_urls.append(page_url)

    _cleanup_stale_product_pages(generated)
    _update_sitemap_care_products(sitemap_urls)


def _cleanup_stale_product_pages(valid_slugs, base=os.path.join('care', 'product')):
    """מוחק תיקיות מוצר שאין להן מוצר קיים (הוסתר/שונה שמו/נמחק).

    ה-base פרמטרי כדי שגם עץ המוצרים של הקטלוג העסקי (catalog/product/)
    ינוקה באותו מנגנון — כל עץ מנוקה מול קבוצת ה-slugs שלו בלבד.
    """
    import shutil
    if not os.path.isdir(base):
        return
    for name in os.listdir(base):
        path = os.path.join(base, name)
        if os.path.isdir(path) and name not in valid_slugs:
            shutil.rmtree(path, ignore_errors=True)


def _update_sitemap_care_products(urls, start='  <!-- CARE_PRODUCTS_SITEMAP_START -->',
                                  end='  <!-- CARE_PRODUCTS_SITEMAP_END -->'):
    """מזריק כתובות דפי מוצר ל-sitemap.xml בין הסימונים (או לפני </urlset> בפעם הראשונה).

    הסימונים פרמטריים כדי ששני עצי המוצרים (care ו-catalog) יחזיקו בלוק נפרד
    ולא ידרסו זה את זה.
    """
    import datetime
    from xml.sax.saxutils import escape
    sitemap_file = 'sitemap.xml'
    today = datetime.date.today().isoformat()
    entries = '\n'.join(
        f'  <url>\n    <loc>{escape(u)}</loc>\n    <lastmod>{today}</lastmod>\n'
        f'    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>'
        for u in urls
    )
    block = f'{start}\n{entries}\n{end}'
    try:
        with open(sitemap_file, encoding='utf-8') as f:
            xml = f.read()
    except FileNotFoundError:
        return
    if start in xml and end in xml:
        xml = re.sub(re.escape(start) + r'.*?' + re.escape(end), lambda m: block, xml, flags=re.S)
    else:
        xml = xml.replace('</urlset>', block + '\n</urlset>')
    with open(sitemap_file, 'w', encoding='utf-8') as f:
        f.write(xml)


def _render_care_product_html(r, price, regular, on_sale, img, cat, cat_slug, page_url, slugs, related,
                              bundle='', promo_dates=('', '')):
    from urllib.parse import quote
    from xml.sax.saxutils import escape

    name, pid = r['name'], r['id']
    brand = r.get('brand') or ''
    desc = r.get('description') or ''
    unit = r.get('unit') or ''

    title = f'{name} — {brand} במחיר לצרכן | אהרוני' if brand else f'{name} במחיר לצרכן | אהרוני'
    meta_desc = (desc or name) + ' — במחיר לצרכן. הזמנה אונליין ומשלוח באזור אור יהודה, בקעת אונו וגוש דן.'
    # כולל קטגוריה כדי שהכרטיס בוודאי מרונדר (app.js גולל ומדגיש את product-<id>)
    catalog_deep = f'/care/?category={quote(cat)}&product={quote(pid)}' if cat else f'/care/?product={quote(pid)}'
    cat_link = f'/care/{cat_slug}/' if cat_slug else '/care/'

    if on_sale:
        price_html = (f'<span class="pp-old">{regular:.2f} ₪</span> '
                      f'<span class="pp-price">{price:.2f} ₪</span> <span class="pp-sale">מבצע</span>')
    else:
        price_html = f'<span class="pp-price">{price:.2f} ₪</span>'
    if bundle:
        price_html += f' <span class="pp-bundle">{escape(bundle)}</span>'

    # "בתוקף עד" בטקסט קטן, צמוד לתג — רק כשקיים תאריך סיום ויש בכלל מבצע
    promo_end = (promo_dates or ('', ''))[1]
    discounted = _price_is_discounted(r, price)
    if promo_end and (discounted or bundle):
        d = promo_end.split('-')
        price_html += f' <span class="pp-validity">בתוקף עד {d[2]}.{d[1]}.{d[0]}</span>'

    related_html = ''
    if related:
        items = ''.join(
            f'<li><a href="/care/product/{quote(slugs[o["id"]])}/">{escape(o["name"])}</a></li>'
            for o in related
        )
        related_html = (f'<section class="pp-related"><h2>מוצרים נוספים בקטגוריית {escape(cat)}</h2>'
                        f'<ul>{items}</ul></section>')

    offer = {'@type': 'Offer', 'price': round(price, 2), 'priceCurrency': 'ILS',
             'availability': 'https://schema.org/InStock', 'url': page_url}
    if promo_end and discounted:
        offer['priceValidUntil'] = promo_end
    product_schema = {'@context': 'https://schema.org', '@type': 'Product',
                      'name': name, 'sku': pid, 'offers': offer}
    if img:
        product_schema['image'] = img
    if brand:
        product_schema['brand'] = {'@type': 'Brand', 'name': brand}
    if desc:
        product_schema['description'] = desc
    breadcrumb = {'@context': 'https://schema.org', '@type': 'BreadcrumbList',
                  'itemListElement': [
                      {'@type': 'ListItem', 'position': 1, 'name': 'קטלוג טיפוח והיגיינה', 'item': f'{SITE_BASE_URL}/care/'},
                      {'@type': 'ListItem', 'position': 2, 'name': cat or 'מוצרים', 'item': SITE_BASE_URL + cat_link},
                      {'@type': 'ListItem', 'position': 3, 'name': name, 'item': page_url},
                  ]}

    img_html = (f'<img src="{escape(img)}" alt="{escape(name)}" width="360" height="360">'
                if img else '<div class="pp-noimg">אין תמונה</div>')

    return f'''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-W1MRCCC3FS"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('js',new Date());gtag('config','G-W1MRCCC3FS');</script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{escape(title)}</title>
    <meta name="description" content="{escape(meta_desc)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="{page_url}">
    <meta property="og:type" content="product">
    <meta property="og:url" content="{page_url}">
    <meta property="og:title" content="{escape(title)}">
    <meta property="og:description" content="{escape(meta_desc)}">
    <meta property="og:image" content="{escape(img) if img else SITE_BASE_URL + '/images/og-image.png'}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=Heebo:wght@400;500;700&display=swap" media="print" onload="this.media='all'">
    <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=Heebo:wght@400;500;700&display=swap"></noscript>
    <script type="application/ld+json">
{json.dumps(product_schema, ensure_ascii=False, indent=2)}
    </script>
    <script type="application/ld+json">
{json.dumps(breadcrumb, ensure_ascii=False, indent=2)}
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
        .cc-breadcrumb {{ font-size: 0.85rem; color: #6B6B6B; margin-bottom: 16px; }}
        .cc-breadcrumb a {{ text-decoration: none; }}
        .pp-main {{ display: grid; grid-template-columns: 360px 1fr; gap: 28px; align-items: start; }}
        @media (max-width: 720px) {{ .pp-main {{ grid-template-columns: 1fr; }} }}
        .pp-img {{ background: #fff; border: 1px solid #e8e8e8; border-radius: 12px; padding: 16px; text-align: center; }}
        .pp-img img {{ max-width: 100%; height: auto; object-fit: contain; }}
        .pp-noimg {{ color: #9e9e9e; padding: 60px 0; }}
        h1 {{ font-size: 1.6rem; color: var(--primary-dark); margin: 0 0 8px; }}
        .pp-brand {{ font-size: 0.95rem; color: #6B6B6B; margin-bottom: 12px; }}
        .pp-priceline {{ margin: 14px 0; }}
        .pp-price {{ font-weight: 700; color: var(--primary-dark); font-size: 1.5rem; }}
        .pp-old {{ text-decoration: line-through; color: #6b6b6b; font-weight: 400; font-size: 1.05rem; }}
        .pp-sale {{ background: #d32f2f; color: #fff; font-size: 0.8rem; font-weight: 700; padding: 2px 8px; border-radius: 6px; margin-inline-start: 4px; }}
        .pp-bundle {{ background: var(--primary); color: #fff; font-size: 0.8rem; font-weight: 700; padding: 2px 8px; border-radius: 6px; margin-inline-start: 4px; }}
        .pp-validity {{ font-size: 0.78rem; color: #6B6B6B; margin-inline-start: 6px; white-space: nowrap; }}
        .pp-unit {{ font-size: 0.9rem; color: #616161; margin-bottom: 10px; }}
        .pp-desc {{ color: #444; margin-bottom: 20px; }}
        .cc-cta {{ display: inline-block; background: var(--primary); color: #fff; text-decoration: none; font-weight: 700; padding: 13px 26px; border-radius: 10px; }}
        .cc-cta:hover {{ background: var(--primary-dark); }}
        .pp-related {{ margin-top: 40px; border-top: 1px solid #e0e0e0; padding-top: 20px; }}
        .pp-related h2 {{ font-size: 1.15rem; color: var(--primary-dark); }}
        .pp-related ul {{ list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px 16px; }}
        .pp-related a {{ text-decoration: none; color: var(--primary-dark); font-weight: 600; }}
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
        <nav class="cc-breadcrumb"><a href="/care/">קטלוג טיפוח והיגיינה</a> ← <a href="{escape(cat_link)}">{escape(cat or 'מוצרים')}</a> ← {escape(name)}</nav>
        <div class="pp-main">
            <div class="pp-img">{img_html}</div>
            <div class="pp-info">
                <h1>{escape(name)}</h1>
                {f'<div class="pp-brand">{escape(brand)}</div>' if brand else ''}
                <div class="pp-priceline">{price_html}</div>
                {f'<div class="pp-unit">יחידת מכירה: {escape(unit)}</div>' if unit else ''}
                {f'<p class="pp-desc">{escape(desc)}</p>' if desc else ''}
                <a class="cc-cta" href="{escape(catalog_deep)}">להוספה לסל והזמנה →</a>
            </div>
        </div>
        {related_html}
    </main>
    <footer class="cc-footer">
        <div><strong>אהרוני שיווק והפצה</strong></div>
        <div><a href="tel:036346236">03-6346236</a> · <a href="https://wa.me/972526000158">WhatsApp</a></div>
        <div>משלוחים באזור אור יהודה, בקעת אונו וגוש דן</div>
        <div style="margin-top:8px;"><a href="{escape(cat_link)}">חזרה לקטגוריה</a> · <a href="/care/">חזרה לקטלוג המלא</a></div>
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
    window = _load_promo_window()

    items = []
    for i, r in enumerate(rows, start=1):
        price = _effective_price(r, category_discounts, window)
        # גוגל דורש מחיר ותמונה לכל מוצר בסכמה — מוצר בלי גורם לשגיאה קריטית בבדיקת העשירות.
        # מדלגים עליו; הוא יתווסף אוטומטית בשמירה הבאה אחרי שתהיה לו תמונה/מחיר
        if price <= 0 or not (r.get('image') or '').strip():
            continue
        offer = {
            '@type': 'Offer',
            'price': price,
            'priceCurrency': 'ILS',
            'availability': 'https://schema.org/InStock',
            'url': f'{SITE_BASE_URL}/care/',
        }
        try:
            _regular = float(r.get('original_price') or 0)
        except ValueError:
            _regular = 0
        _, _promo_end = _promo_dates_for(r, window, category_discounts)
        if _promo_end and _price_is_discounted(r, price):
            offer['priceValidUntil'] = _promo_end
        product = {
            '@type': 'Product',
            'name': r['name'],
            'sku': r['id'],
            'offers': offer,
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
    has_sales = any((r.get('original_price') or '').strip() and _product_promo_active(r, window) for r in rows)
    has_bundle = any(_bundle_label(r, window) for r in rows)
    has_promo = has_sales or has_bundle or bool(category_discounts)
    try:
        with open(PRICELIST_PROMO_FILE, encoding='utf-8') as f:
            promo_cfg = json.load(f)
        banner_cfg = promo_cfg.get('banner') or {}
        cart_cfg = promo_cfg.get('cart_discount') or {}
        # כל מבצע נבדק לפי התאריכים שלו (אחרת החלון הגלובלי)
        has_promo = has_promo or (
            (banner_cfg.get('enabled') and banner_cfg.get('text') and _scoped_active(banner_cfg, window)) or
            (cart_cfg.get('enabled') and float(cart_cfg.get('percent') or 0) > 0 and _scoped_active(cart_cfg, window)))
    except (FileNotFoundError, ValueError):
        pass
    banner_tag = '<div id="promo-banner" style="display:block"></div>' if has_promo else '<div id="promo-banner"></div>'
    html = re.sub(r'<div id="promo-banner"[^>]*></div>', banner_tag, html)

    with open(CARE_PAGE_FILE, 'w', encoding='utf-8') as f:
        f.write(html)


# ======================================================================
#  הקטלוג העסקי (B2B) — data/products.csv
#  מקביל לגנרטורים של /care/ אבל בלי מחירים: בקטלוג הלקוחות המחירים
#  מוסתרים בכוונה, ולכן דפי המוצר נבנים בלי Offer בסכמה.
# ======================================================================

# slug של דף הקטגוריה ← שם הקטגוריה ב-CSV (זהה ל-presetCategory שבכל דף)
CATALOG_CATEGORIES = {
    'cleaning': 'ניקיון',
    'cleaning-accessories': 'אביזרי ניקיון',
    'paper': 'מוצרי נייר',
    'disposables': 'חד פעמי ואריזות',
    'office-supplies': 'ציוד משרדי',
    'hygiene': 'טיפוח והיגיינה',
    'bags': 'שקיות',
    'air-fresheners': 'מבשמים',
    'crafts': 'מוצרי יצירה',
    'misc': 'שונים',
}

CATALOG_WHATSAPP = '972526000158'


def _load_catalog_rows():
    """קורא את מוצרי הקטלוג העסקי. מחזיר רק שורות עם מזהה ושם."""
    with open(DATA_FILE, encoding='utf-8') as f:
        return [r for r in csv.DictReader(f) if (r.get('id') or '').strip() and (r.get('name') or '').strip()]


def _catalog_category_slug(category):
    """שם קטגוריה בעברית ← slug של דף הקטגוריה (או None אם אין דף כזה)."""
    for slug, name in CATALOG_CATEGORIES.items():
        if name == category:
            return slug
    return None


def generate_catalog_category_schema():
    """מסנכרן את ItemList בסכמת 10 דפי הקטגוריה מול products.csv.

    הרשימה הייתה כתובה ידנית בכל דף וכבר נסחפה מהנתונים (ניקיון 38 מול 39
    ב-CSV, מוצרי נייר 17 מול 19). כאן היא נגזרת מהקובץ בכל שמירה.

    לא משתמשים בסימוני HTML כי הרשימה יושבת בתוך JSON-LD — הערת HTML בתוכו
    הייתה שוברת את ה-JSON. במקום זה מפרסרים את הבלוק ומחליפים רק את
    mainEntity, כך שכל שאר השדות שנכתבו ידנית (name/description/keywords)
    נשמרים כלשונם.
    """
    rows = _load_catalog_rows()
    updated = []

    for slug, category in CATALOG_CATEGORIES.items():
        path = f'catalog/{slug}/index.html'
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            html = f.read()

        names = [r['name'] for r in rows if r.get('category') == category]
        items = [{'@type': 'ListItem', 'position': i, 'name': n} for i, n in enumerate(names, 1)]

        # מאתרים את בלוק ה-JSON-LD של CollectionPage (יכולים להיות כמה בלוקים בדף)
        pattern = re.compile(r'(<script type="application/ld\+json">\s*)(\{.*?\})(\s*</script>)', re.S)

        def replace(match):
            try:
                data = json.loads(match.group(2))
            except ValueError:
                return match.group(0)
            if data.get('@type') != 'CollectionPage':
                return match.group(0)
            main = data.get('mainEntity') or {}
            main['@type'] = 'ItemList'
            main['numberOfItems'] = len(items)
            main['itemListElement'] = items
            data['mainEntity'] = main
            body = json.dumps(data, ensure_ascii=False, indent=2)
            body = '\n'.join(('    ' + line) if line else line for line in body.split('\n'))
            return match.group(1) + body.lstrip() + match.group(3)

        new_html = pattern.sub(replace, html, count=1)
        if new_html != html:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new_html)
            updated.append(f'{slug}:{len(items)}')

    return updated


# דפי תת-קטגוריה — נגזרו משאילתות אמיתיות ב-Search Console (3 חודשים) שהיו
# להן הופעות ולא היה להן דף תואם באתר. ההופעות בהערה הן הבסיס לבחירה.
CATALOG_SUBCATEGORIES = {
    'hand-towels': {
        'parent': 'paper',
        'h1': 'נייר ניגוב ידיים ומגבות נייר בסיטונאות',
        'title': 'נייר מגבת בסיטונאות | נייר ניגוב ידיים תעשייתי לעסקים | אהרוני',
        'description': 'נייר מגבת ונייר ניגוב ידיים תעשייתי בסיטונאות: גלילים תעשייתיים, '
                       'צץ רץ ונייר תאית — לעסקים, מפעלים ומוסדות בגוש דן.',
        'intro': 'נייר ניגוב ידיים הוא פריט הצריכה השוטף ביותר בשירותים של עסק, ולכן ההפרש '
                 'בין מחיר קמעונאי למחיר סיטונאי מצטבר לסכום משמעותי בשנה. אנחנו מספקים גלילים '
                 'תעשייתיים, נייר צץ רץ בשליפה יחידנית ונייר תאית דו-שכבתי — באריזות מוסדיות. '
                 'אספקה קבועה למפעלים, למשרדים, למסעדות ולמוסדות חינוך.',
    },
    'toilet-paper': {
        'parent': 'paper',
        'h1': 'נייר טואלט מוסדי בסיטונאות',
        'title': 'נייר טואלט בסיטונאות | נייר טואלט מוסדי לעסקים | אהרוני שיווק והפצה',
        'description': 'נייר טואלט מוסדי בסיטונאות לעסקים ומוסדות: גלילי ג׳מבו, מארזים גדולים '
                       'ונייר קומפקט. מחירים סיטונאיים ואספקה בגוש דן והמרכז.',
        'intro': 'נייר טואלט מוסדי נבדל מהנייר הביתי בעיקר בגודל הגליל ובכמות במארז: גליל '
                 'ג׳מבו מחזיק הרבה יותר מגליל רגיל, מצמצם החלפות ומונע מחסור בשירותים ציבוריים. '
                 'בקטלוג מארזים מוסדיים גדולים, גלילי ג׳מבו ונייר קומפקט — לבתי ספר, לבנייני '
                 'משרדים, למסעדות ולמפעלים.',
    },
    'cups': {
        'parent': 'disposables',
        'h1': 'כוסות חד פעמיות בסיטונאות',
        'title': 'כוסות חד פעמיות בסיטונאות | כוסות נייר ופלסטיק לעסקים | אהרוני',
        'description': 'כוסות חד פעמיות בסיטונאות: כוסות נייר לשתייה חמה, כוסות אספרסו, '
                       'כוסות פלסטיק לשתייה קרה וכוסות בירה — לעסקים, בתי קפה ומשרדים.',
        'intro': 'כוסות חד פעמיות הן מוצר שנגמר מהר בכל עסק עם פינת קפה או שירות ללקוחות. '
                 'בקטלוג כוסות נייר לשתייה חמה במידות הנפוצות, כוסות אספרסו, כוסות פלסטיק '
                 'לשתייה קרה וכוסות בירה — הכול במחירים סיטונאיים ובאריזות שמתאימות לצריכה '
                 'שוטפת של מטבחון משרדי, בית קפה או דוכן משקאות.',
    },
    'containers': {
        'parent': 'disposables',
        'h1': 'קופסאות אוכל ואריזות מזון חד פעמיות בסיטונאות',
        'title': 'קופסאות חד פעמי בסיטונאות | אריזות מזון לעסקי משלוחים | אהרוני',
        'description': 'קופסאות פלסטיק חד פעמיות ואריזות מזון בסיטונאות: קופסאות אוכל מחולקות, '
                       'קופסאות סלט וקערות חומוס — למסעדות, לקייטרינג ולעסקי משלוחים.',
        'intro': 'אריזת המזון היא מה שהלקוח פוגש כשהמשלוח מגיע, ולכן היא חלק מהשירות ולא רק '
                 'מהתפעול. בקטלוג קופסאות אוכל מחולקות שמונעות ערבוב בין מנה לתוספות, קופסאות '
                 'סלט אישיות, קופסאות בנפחים משפחתיים וקערות חומוס — למסעדות, לחומוסיות, '
                 'לקייטרינג ולעסקי משלוחים.',
    },
    'tableware': {
        'parent': 'disposables',
        'h1': 'צלחות וסכו״ם חד פעמי בסיטונאות',
        'title': 'צלחות חד פעמי בסיטונאות | סכו״ם חד פעמי לעסקים ומסעדות | אהרוני',
        'description': 'צלחות וסכו״ם חד פעמי בסיטונאות: צלחות מתכלות, סכו״ם קשיח וסכו״ם רגיל '
                       'במארזים — למסעדות, לקייטרינג, לאירועים ולמטבחונים משרדיים.',
        'intro': 'סכו״ם קשיח וצלחות מתכלות משנים את מראה ההגשה לעומת חד-פעמי בסיסי, ולכן הרבה '
                 'מסעדות וקייטרינג עוברים אליהם. בקטלוג צלחות מתכלות בשלושה גדלים, צלחות '
                 'פלסטיק גדולות, וסכו״ם חד-פעמי רגיל וקשיח במארזים — במחירים סיטונאיים.',
    },
}


def generate_catalog_subcategory_pages():
    """יוצר דפי SEO לתת-קטגוריות תחת catalog/<parent>/<slug>/.

    כל דף מכוון לשאילתה עם הופעות אמיתיות ב-Search Console שלא היה לה דף.
    שיוך המוצרים נעשה דרך עמודת subcategory ב-CSV ולא לפי מילים בשם המוצר —
    התאמת מילות מפתח ייצרה false positives ("סבון ידיים" נכנס ל"נייר ניגוב
    ידיים", "עט לחיץ בקופסא" נכנס ל"קופסאות").
    """
    from urllib.parse import quote
    from xml.sax.saxutils import escape

    rows = _load_catalog_rows()
    slugs = _care_product_slugs(rows)
    generated = []

    for slug, cfg in CATALOG_SUBCATEGORIES.items():
        items = [r for r in rows if (r.get('subcategory') or '').strip() == slug]
        if not items:
            continue
        parent = cfg['parent']
        parent_name = CATALOG_CATEGORIES.get(parent, '')
        page_url = f'{SITE_BASE_URL}/catalog/{parent}/{slug}/'

        cards = '\n'.join(
            f'''            <article class="sc-item">
                <h3><a href="/catalog/product/{quote(slugs[r["id"]])}/">{escape(r['name'])}</a></h3>
                <p>{escape((r.get('description') or '').strip())}</p>
            </article>''' for r in items)

        siblings = '\n'.join(
            f'                <a href="/catalog/{c["parent"]}/{s}/">{escape(c["h1"])}</a>'
            for s, c in CATALOG_SUBCATEGORIES.items() if s != slug)

        schema = {
            '@context': 'https://schema.org', '@type': 'CollectionPage',
            'name': cfg['title'], 'description': cfg['description'], 'url': page_url,
            'breadcrumb': {'@type': 'BreadcrumbList', 'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'דף הבית', 'item': f'{SITE_BASE_URL}/'},
                {'@type': 'ListItem', 'position': 2, 'name': 'קטלוג מוצרים', 'item': f'{SITE_BASE_URL}/catalog/'},
                {'@type': 'ListItem', 'position': 3, 'name': parent_name,
                 'item': f'{SITE_BASE_URL}/catalog/{parent}/'},
                {'@type': 'ListItem', 'position': 4, 'name': cfg['h1'], 'item': page_url},
            ]},
            'publisher': {'@type': 'WholesaleStore', 'name': 'אהרוני שיווק והפצה',
                          'url': f'{SITE_BASE_URL}/', 'telephone': '+97236346236'},
            'mainEntity': {'@type': 'ItemList', 'numberOfItems': len(items), 'itemListElement': [
                {'@type': 'ListItem', 'position': i, 'name': r['name'],
                 'url': f'{SITE_BASE_URL}/catalog/product/{quote(slugs[r["id"]])}/'}
                for i, r in enumerate(items, 1)]},
        }

        wa = quote(f'שלום, אשמח להצעת מחיר עבור {cfg["h1"]}')
        html = f'''<!DOCTYPE html>
<html lang="he" dir="rtl">

<head>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-W1MRCCC3FS"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('js',new Date());gtag('config','G-W1MRCCC3FS');</script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{escape(cfg['title'])}</title>
    <meta name="description" content="{escape(cfg['description'])}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="{escape(page_url)}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="{escape(cfg['title'])}">
    <meta property="og:description" content="{escape(cfg['description'])}">
    <meta property="og:url" content="{escape(page_url)}">
    <meta property="og:image" content="{SITE_BASE_URL}/images/og-image.png">
    <link rel="icon" href="/images/logo.png">
    <script type="application/ld+json">
{json.dumps(schema, ensure_ascii=False, indent=2)}
    </script>
    <style>
        :root {{ --primary: #639C7D; --dark: #1A4231; --ink: #23302a; --muted: #5c6b63; --line: #e3ebe6; }}
        * {{ box-sizing: border-box; }}
        body {{ margin: 0; font-family: 'Assistant', 'Heebo', Arial, sans-serif; color: var(--ink);
               background: #fff; line-height: 1.75; }}
        .wrap {{ max-width: 980px; margin: 0 auto; padding: 0 16px; }}
        header.site {{ background: var(--dark); color: #fff; padding: 14px 0; }}
        header.site .wrap {{ display: flex; align-items: center; justify-content: space-between;
                            gap: 12px; flex-wrap: wrap; }}
        header.site a {{ color: #fff; text-decoration: none; font-weight: 700; }}
        .crumbs {{ font-size: .9rem; color: var(--muted); padding: 14px 0; }}
        .crumbs a {{ color: var(--muted); }}
        h1 {{ color: var(--dark); font-size: 1.9rem; margin: 6px 0 12px; }}
        .lead {{ font-size: 1.06rem; }}
        .ctas {{ display: flex; gap: 10px; flex-wrap: wrap; margin: 20px 0 6px; }}
        .btn {{ flex: 1 1 220px; text-align: center; padding: 13px 18px; border-radius: 8px;
               text-decoration: none; font-weight: 700; border: 2px solid var(--dark); }}
        .btn-wa {{ background: var(--dark); color: #fff; }}
        .btn-cat {{ background: #fff; color: var(--dark); }}
        .sc-list {{ border-top: 1px solid var(--line); margin-top: 26px; padding-top: 6px; }}
        .sc-item {{ border-bottom: 1px solid var(--line); padding: 14px 0; }}
        .sc-item h3 {{ margin: 0 0 4px; font-size: 1.08rem; }}
        .sc-item h3 a {{ color: var(--dark); text-decoration: none; }}
        .sc-item h3 a:hover {{ text-decoration: underline; }}
        .sc-item p {{ margin: 0; color: var(--muted); }}
        .chips {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }}
        .chips a {{ display: inline-block; padding: 7px 12px; border: 1px solid var(--line);
                   border-radius: 999px; text-decoration: none; font-size: .9rem;
                   background: #f6faf8; color: var(--dark); }}
        .more {{ display: block; margin-top: 18px; font-weight: 700; color: var(--dark); }}
        footer.site {{ background: var(--dark); color: #fff; margin-top: 34px; padding: 22px 0; }}
        footer.site a {{ color: #cfe6d9; }}
    </style>
</head>

<body>
    <header class="site">
        <div class="wrap">
            <a href="/">אהרוני שיווק והפצה</a>
            <a href="tel:036346236">03-6346236</a>
        </div>
    </header>

    <div class="wrap">
        <nav class="crumbs" aria-label="breadcrumb">
            <a href="/">דף הבית</a> &laquo; <a href="/catalog/">קטלוג מוצרים</a> &laquo;
            <a href="/catalog/{parent}/">{escape(parent_name)}</a> &laquo; {escape(cfg['h1'])}
        </nav>

        <h1>{escape(cfg['h1'])}</h1>
        <p class="lead">{escape(cfg['intro'])}</p>

        <div class="ctas">
            <a class="btn btn-wa" href="https://wa.me/{CATALOG_WHATSAPP}?text={wa}"
               target="_blank" rel="noopener">בקש הצעת מחיר בוואטסאפ</a>
            <a class="btn btn-cat" href="/catalog/{parent}/">להזמנה מהקטלוג</a>
        </div>

        <section class="sc-list">
            <h2>המוצרים בקטגוריה</h2>
{cards}
            <a class="more" href="/catalog/{parent}/">לכל המוצרים ב{escape(parent_name)} &laquo;</a>
        </section>

        <section>
            <h2>קטגוריות נוספות</h2>
            <div class="chips">
{siblings}
            </div>
        </section>
    </div>

    <footer class="site">
        <div class="wrap">
            <div>אהרוני שיווק והפצה &middot; אור יהודה &middot;
                <a href="tel:036346236">03-6346236</a></div>
            <div><a href="/catalog/">קטלוג מוצרים</a> &middot; <a href="/about/">אודות</a> &middot;
                <a href="/contact/">צור קשר</a></div>
        </div>
    </footer>
</body>

</html>
'''
        out_dir = os.path.join('catalog', parent, slug)
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html)
        generated.append(f'{parent}/{slug}:{len(items)}')

    _update_sitemap_care_products(
        [f'{SITE_BASE_URL}/catalog/{c["parent"]}/{s}/' for s, c in CATALOG_SUBCATEGORIES.items()
         if any((r.get('subcategory') or '').strip() == s for r in rows)],
        start='  <!-- CATALOG_SUBCATS_SITEMAP_START -->',
        end='  <!-- CATALOG_SUBCATS_SITEMAP_END -->')
    return generated


def generate_catalog_product_pages():
    """יוצר דף SEO סטטי לכל מוצר בקטלוג העסקי תחת catalog/product/<slug>/index.html.

    בניגוד לדפי המוצר של /care/ — כאן אין מחיר: המחירון העסקי מוסתר בכוונה,
    ולכן הסכמה היא Product בלי Offer. המשמעות: אין rich snippet של מחיר
    בתוצאות החיפוש, אבל הדף עדיין מדורג על הטקסט.
    """
    from urllib.parse import quote

    rows = _load_catalog_rows()
    slugs = _care_product_slugs(rows)          # דטרמיניסטי ומשותף לשני הקטלוגים

    by_cat = {}
    for r in rows:
        by_cat.setdefault(r.get('category', ''), []).append(r)

    generated, sitemap_urls = set(), []
    for r in rows:
        slug = slugs[r['id']]
        cat = r.get('category', '')
        page_url = f'{SITE_BASE_URL}/catalog/product/{quote(slug)}/'

        related = [o for o in by_cat.get(cat, []) if o['id'] != r['id']][:6]
        html = _render_catalog_product_html(r, cat, _catalog_category_slug(cat), page_url, slugs, related)

        out_dir = os.path.join('catalog', 'product', slug)
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html)
        generated.add(slug)
        sitemap_urls.append(page_url)

    _cleanup_stale_product_pages(generated, base=os.path.join('catalog', 'product'))
    _update_sitemap_care_products(sitemap_urls,
                                  start='  <!-- CATALOG_PRODUCTS_SITEMAP_START -->',
                                  end='  <!-- CATALOG_PRODUCTS_SITEMAP_END -->')
    return len(generated)


def bake_catalog_product_index():
    """מזריק ל-10 דפי הקטגוריה בלוק סטטי עם קישור לכל מוצר בקטגוריה.

    שתי סיבות: (1) ה-HTML של דפי הקטגוריה ריק ממוצרים — catalog-shell.js בונה
    את #products ב-connectedCallback דרך innerHTML ומוחק כל תוכן שהושם בתוכו,
    ולכן אי אפשר להזריק לשם כמו ב-/care/; (2) בלי קישורים נכנסים גוגל לא יגיע
    בכלל ל-176 דפי המוצר.

    הבלוק יושב מחוץ ל-<catalog-shell> ונשאר גלוי לגולשים כאינדקס לדפדוף —
    תוכן אמיתי, לא הסתרה. משתמש ב-.cat-links הקיים ולכן לא מוסיף CSS.
    """
    from urllib.parse import quote
    from xml.sax.saxutils import escape

    rows = _load_catalog_rows()
    slugs = _care_product_slugs(rows)
    start_marker, end_marker = '<!-- CATALOG_INDEX_START -->', '<!-- CATALOG_INDEX_END -->'
    updated = []

    for slug, category in CATALOG_CATEGORIES.items():
        path = f'catalog/{slug}/index.html'
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            html = f.read()

        items = [r for r in rows if r.get('category') == category]
        if not items:
            continue
        links = '\n'.join(
            f'                <a href="/catalog/product/{quote(slugs[r["id"]])}/">{escape(r["name"])}</a>'
            for r in items)

        # קישור לדפי התת-קטגוריה של הקטגוריה הזו (אם יש להם מוצרים משויכים)
        subs = [(s, c) for s, c in CATALOG_SUBCATEGORIES.items()
                if c['parent'] == slug and any((r.get('subcategory') or '').strip() == s for r in rows)]
        subs_html = ''
        if subs:
            sub_links = '\n'.join(
                f'                <a href="/catalog/{slug}/{s}/">{escape(c["h1"])}</a>' for s, c in subs)
            subs_html = f'''            <p style="margin-top:24px;">לפי סוג מוצר:</p>
            <div class="cat-links">
{sub_links}
            </div>
'''

        block = f'''{start_marker}
    <section class="cat-seo">
        <div class="container">
            <h2>כל המוצרים בקטגוריית {escape(category)}</h2>
            <p>לחצו על מוצר לפרטים מלאים, או הוסיפו אותו להזמנה ישירות מהקטלוג שלמעלה.</p>
            <div class="cat-links">
{links}
            </div>
{subs_html}        </div>
    </section>
    {end_marker}'''

        if start_marker in html and end_marker in html:
            new_html = re.sub(re.escape(start_marker) + r'.*?' + re.escape(end_marker),
                              lambda m: block, html, flags=re.S)
        else:
            new_html = html.replace('<site-footer></site-footer>', block + '\n\n    <site-footer></site-footer>', 1)

        if new_html != html:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new_html)
            updated.append(f'{slug}:{len(items)}')

    return updated


def _render_catalog_product_html(r, cat, cat_slug, page_url, slugs, related):
    """HTML של דף מוצר בקטלוג העסקי. קליל בכוונה — בלי app.js ובלי style.css,
    ולכן שינוי כאן לא מחייב העלאת פרמטרי גרסה."""
    from urllib.parse import quote
    from xml.sax.saxutils import escape

    name, pid = r['name'], r['id']
    desc = (r.get('description') or '').strip()
    unit = (r.get('unit') or '').strip()
    packaging = (r.get('packaging') or '').strip()
    img_rel = (r.get('image') or '').strip()
    img_abs = SITE_BASE_URL + '/' + quote(img_rel.lstrip('/')) if img_rel else ''

    title = f'{name} — סיטונאות לעסקים | אהרוני שיווק והפצה'
    meta_desc = (desc[:150] if desc
                 else f'{name} במחירים סיטונאיים לעסקים, מוסדות ומסעדות. אספקה בגוש דן והמרכז.')

    cat_url = f'/catalog/{cat_slug}/' if cat_slug else '/catalog/'
    # deep link: app.js גולל לכרטיס המוצר ומדגיש אותו (הקוד קיים וגנרי)
    catalog_cta = f'{cat_url}?product={quote(pid)}'
    wa_text = quote(f'שלום, אשמח להצעת מחיר עבור: {name} (מק״ט {pid})')
    wa_cta = f'https://wa.me/{CATALOG_WHATSAPP}?text={wa_text}'

    schema = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        'name': name,
        'sku': pid,
        'category': cat,
        'url': page_url,
        # אין Offer בכוונה — המחירון העסקי לא מפורסם
        'brand': {'@type': 'Brand', 'name': 'אהרוני שיווק והפצה'},
        'manufacturer': {'@type': 'Organization', 'name': 'אהרוני שיווק והפצה'},
    }
    if desc:
        schema['description'] = desc
    if img_abs:
        schema['image'] = img_abs

    breadcrumb = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'דף הבית', 'item': f'{SITE_BASE_URL}/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'קטלוג מוצרים', 'item': f'{SITE_BASE_URL}/catalog/'},
            {'@type': 'ListItem', 'position': 3, 'name': cat or 'מוצרים',
             'item': f'{SITE_BASE_URL}{cat_url}'},
            {'@type': 'ListItem', 'position': 4, 'name': name, 'item': page_url},
        ],
    }

    img_html = (f'<img class="p-img" src="/{quote(img_rel.lstrip("/"))}" alt="{escape(name)}" '
                f'width="420" height="420" loading="eager">'
                if img_rel else '<div class="p-noimg">אין תמונה</div>')

    specs = [('מק״ט', pid)]
    if cat:
        specs.append(('קטגוריה', cat))
    if unit:
        specs.append(('יחידת מידה', unit))
    if packaging:
        specs.append(('אריזה', packaging))
    specs_html = '\n'.join(
        f'      <div class="spec"><dt>{escape(k)}</dt><dd>{escape(v)}</dd></div>' for k, v in specs)

    related_html = ''
    if related:
        links = '\n'.join(
            f'      <a class="chip" href="/catalog/product/{quote(slugs[o["id"]])}/">{escape(o["name"])}</a>'
            for o in related)
        related_html = f'''
  <section class="related">
    <h2>מוצרים נוספים בקטגוריית {escape(cat)}</h2>
    <div class="chips">
{links}
    </div>
    <p><a class="more" href="{escape(cat_url)}">לכל המוצרים בקטגוריה &laquo;</a></p>
  </section>'''

    desc_html = f'    <p class="p-desc">{escape(desc)}</p>\n' if desc else ''

    return f'''<!DOCTYPE html>
<html lang="he" dir="rtl">

<head>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-W1MRCCC3FS"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('js',new Date());gtag('config','G-W1MRCCC3FS');</script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{escape(title)}</title>
    <meta name="description" content="{escape(meta_desc)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="{escape(page_url)}">
    <meta property="og:type" content="product">
    <meta property="og:title" content="{escape(title)}">
    <meta property="og:description" content="{escape(meta_desc)}">
    <meta property="og:url" content="{escape(page_url)}">
    <meta property="og:image" content="{escape(img_abs or SITE_BASE_URL + '/images/og-image.png')}">
    <link rel="icon" href="/images/logo.png">
    <script type="application/ld+json">
{json.dumps(schema, ensure_ascii=False, indent=2)}
    </script>
    <script type="application/ld+json">
{json.dumps(breadcrumb, ensure_ascii=False, indent=2)}
    </script>
    <style>
        :root {{ --primary: #639C7D; --dark: #1A4231; --ink: #23302a; --muted: #5c6b63; --line: #e3ebe6; }}
        * {{ box-sizing: border-box; }}
        body {{ margin: 0; font-family: 'Assistant', 'Heebo', Arial, sans-serif; color: var(--ink);
               background: #fff; line-height: 1.7; }}
        a {{ color: var(--dark); }}
        .wrap {{ max-width: 1000px; margin: 0 auto; padding: 0 16px; }}
        header.site {{ background: var(--dark); color: #fff; padding: 14px 0; }}
        header.site .wrap {{ display: flex; align-items: center; justify-content: space-between; gap: 12px;
                            flex-wrap: wrap; }}
        header.site a {{ color: #fff; text-decoration: none; font-weight: 700; }}
        .crumbs {{ font-size: .9rem; color: var(--muted); padding: 14px 0; }}
        .crumbs a {{ color: var(--muted); }}
        .p-main {{ display: grid; grid-template-columns: 420px 1fr; gap: 32px; align-items: start;
                  padding-bottom: 28px; }}
        .p-img {{ width: 100%; height: auto; border: 1px solid var(--line); border-radius: 10px; }}
        .p-noimg {{ width: 100%; aspect-ratio: 1; border: 1px dashed var(--line); border-radius: 10px;
                   display: flex; align-items: center; justify-content: center; color: var(--muted); }}
        h1 {{ font-size: 1.8rem; margin: 0 0 10px; color: var(--dark); }}
        .p-desc {{ font-size: 1.05rem; }}
        dl.specs {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 18px 0; padding: 0; }}
        .spec {{ border-bottom: 1px solid var(--line); padding-bottom: 6px; }}
        .spec dt {{ font-size: .82rem; color: var(--muted); }}
        .spec dd {{ margin: 0; font-weight: 600; }}
        .ctas {{ display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }}
        .btn {{ flex: 1 1 220px; text-align: center; padding: 13px 18px; border-radius: 8px;
               text-decoration: none; font-weight: 700; border: 2px solid var(--dark); }}
        .btn-wa {{ background: var(--dark); color: #fff; }}
        .btn-cat {{ background: #fff; color: var(--dark); }}
        .note {{ color: var(--muted); font-size: .92rem; margin-top: 12px; }}
        .related {{ border-top: 1px solid var(--line); padding: 22px 0 8px; }}
        .related h2 {{ font-size: 1.15rem; color: var(--dark); }}
        .chips {{ display: flex; flex-wrap: wrap; gap: 8px; }}
        .chip {{ display: inline-block; padding: 7px 12px; border: 1px solid var(--line); border-radius: 999px;
                text-decoration: none; font-size: .9rem; background: #f6faf8; }}
        .more {{ font-weight: 700; text-decoration: none; }}
        footer.site {{ background: var(--dark); color: #fff; margin-top: 30px; padding: 22px 0; }}
        footer.site a {{ color: #cfe6d9; }}
        @media (max-width: 820px) {{
            .p-main {{ grid-template-columns: 1fr; gap: 20px; }}
            dl.specs {{ grid-template-columns: 1fr; }}
        }}
    </style>
</head>

<body>
    <header class="site">
        <div class="wrap">
            <a href="/">אהרוני שיווק והפצה</a>
            <a href="tel:036346236">03-6346236</a>
        </div>
    </header>

    <div class="wrap">
        <nav class="crumbs" aria-label="breadcrumb">
            <a href="/">דף הבית</a> &laquo; <a href="/catalog/">קטלוג מוצרים</a> &laquo;
            <a href="{escape(cat_url)}">{escape(cat or 'מוצרים')}</a> &laquo; {escape(name)}
        </nav>

        <article class="p-main">
            <div>{img_html}</div>
            <div>
                <h1>{escape(name)}</h1>
{desc_html}                <dl class="specs">
{specs_html}
                </dl>
                <div class="ctas">
                    <a class="btn btn-wa" href="{escape(wa_cta)}" target="_blank" rel="noopener">בקש הצעת מחיר בוואטסאפ</a>
                    <a class="btn btn-cat" href="{escape(catalog_cta)}">הוסף להזמנה בקטלוג</a>
                </div>
                <p class="note">אספקה סיטונאית לעסקים, מוסדות ומסעדות באור יהודה, בקעת אונו וגוש דן.
                    המחירים ניתנים בהצעת מחיר אישית לפי כמות.</p>
            </div>
        </article>
{related_html}
    </div>

    <footer class="site">
        <div class="wrap">
            <div>אהרוני שיווק והפצה &middot; אור יהודה &middot;
                <a href="tel:036346236">03-6346236</a></div>
            <div><a href="/catalog/">קטלוג מוצרים</a> &middot; <a href="/about/">אודות</a> &middot;
                <a href="/contact/">צור קשר</a></div>
        </div>
    </footer>
</body>

</html>
'''


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
        elif parsed_path.path == '/api/shipping':
            self.handle_save_shipping()
        else:
            self.send_error(404, "API endpoint not found")

    def catalog_cfg(self):
        """הקטלוג שאליו מכוונת הבקשה (?catalog=care|committee), ברירת מחדל care."""
        key = (parse_qs(urlparse(self.path).query).get('catalog') or ['care'])[0]
        return PRICELIST_CATALOGS.get(key, PRICELIST_CATALOGS['care'])

    def handle_save_shipping(self):
        # שיטות האספקה ודמי המשלוח של הקטלוג שנבחר
        try:
            cfg = self.catalog_cfg()
            content_length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(content_length).decode('utf-8'))
            methods = _clean_shipping_methods(data.get('methods'))

            with open(cfg['shipping'], 'w', encoding='utf-8') as f:
                json.dump({'methods': methods}, f, ensure_ascii=False, indent=1)

            # הפיד נושא g:shipping — לרענן כדי שלא ייווצר פער מול המוצג באתר
            try:
                if cfg['generators']:
                    update_merchant_feed()
            except Exception as feed_err:
                print(f'אזהרה: עדכון הפיד אחרי שמירת משלוחים נכשל: {feed_err}')

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'methods': methods}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))

    def handle_save_promo(self):
        # מבצעי המחירון: באנר ידני, הנחת סל והנחות קטגוריה
        try:
            cfg = self.catalog_cfg()
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
                'banner': {'enabled': bool(banner.get('enabled')), 'text': str(banner.get('text', ''))[:200],
                           'starts': _clean_date(banner.get('starts')), 'ends': _clean_date(banner.get('ends'))},
                'cart_discount': {
                    'enabled': bool(cart.get('enabled')),
                    'min_total': to_num(cart.get('min_total')),
                    'min_items': int(to_num(cart.get('min_items'))),
                    'percent': min(90.0, to_num(cart.get('percent'))),
                    'starts': _clean_date(cart.get('starts')),
                    'ends': _clean_date(cart.get('ends')),
                },
                'category_discounts': [
                    {'category': str(r.get('category', ''))[:60],
                     'percent': min(90.0, to_num(r.get('percent'))),
                     'starts': _clean_date(r.get('starts')),
                     'ends': _clean_date(r.get('ends'))}
                    for r in (data.get('category_discounts') or [])
                    if r.get('category') and to_num(r.get('percent')) > 0
                ][:20],
                # חלון תוקף גלובלי לכל המבצעים (ריק = בלי הגבלה)
                'window': {
                    'starts': _clean_date((data.get('window') or {}).get('starts')),
                    'ends': _clean_date((data.get('window') or {}).get('ends')),
                },
            }
            with open(cfg['promo'], 'w', encoding='utf-8') as f:
                json.dump(promo, f, ensure_ascii=False, indent=1)

            # הסכמה, הפיד ודפי הקטגוריה משקפים גם הנחות קטגוריה — מעדכנים
            try:
                if cfg['generators']:
                    update_care_schema()
                    bake_care_products()
                    update_merchant_feed()
                    generate_care_category_pages()
                    generate_care_product_pages()
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
            
            # רשימת עמודות קבועה ולא נגזרת מהמוצר הראשון: אם מוצר אחד חסר שדה,
            # גזירה דינמית הייתה מוחקת את העמודה מכל הקובץ.
            with open(DATA_FILE, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=PRODUCT_FIELDS, extrasaction='ignore')
                writer.writeheader()
                for p in products:
                    writer.writerow({k: p.get(k, '') for k in PRODUCT_FIELDS})

            # הקבצים הנגזרים מהקטלוג העסקי — נכשלים בשקט כדי לא להפיל שמירה
            try:
                generate_catalog_category_schema()
                generate_catalog_product_pages()
                generate_catalog_subcategory_pages()
                bake_catalog_product_index()
            except Exception as gen_err:
                print(f'אזהרה: עדכון הקבצים הנגזרים של הקטלוג נכשל: {gen_err}')

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
            cfg = self.catalog_cfg()
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            products = json.loads(post_data.decode('utf-8'))

            # 'active' נשמר רק במאסטר; מוצר מוסתר (active=0) לא נכתב לקובץ הציבורי
            # ולכן נעלם אוטומטית מהקטלוג, מהסכמה, מהפיד ומדפי הקטגוריה
            master_fields = ['id', 'name', 'category', 'unit', 'brand', 'image', 'cost', 'price', 'sale_price',
                             'bundle', 'promo_start', 'promo_end', 'active', 'description']
            public_fields = ['id', 'name', 'category', 'unit', 'brand', 'image', 'price', 'original_price',
                             'bundle', 'promo_start', 'promo_end', 'description']

            def to_float(v):
                try:
                    return float(v)
                except (TypeError, ValueError):
                    return None

            def is_hidden(p):
                return str(p.get('active', '')).strip() == '0'

            with open(cfg['master'], 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=master_fields, extrasaction='ignore')
                writer.writeheader()
                for p in products:
                    row = {k: p.get(k, '') for k in master_fields}
                    # ברירת מחדל: מוצג (1) אלא אם סומן במפורש כמוסתר
                    row['active'] = '0' if is_hidden(p) else '1'
                    row['bundle'] = _clean_bundle(p.get('bundle'))
                    row['promo_start'] = _clean_date(p.get('promo_start'))
                    row['promo_end'] = _clean_date(p.get('promo_end'))
                    writer.writerow(row)

            # בקובץ הציבורי: כשיש מבצע — price = מחיר המבצע, original_price = המחיר הרגיל (לתצוגת "מבצע")
            with open(cfg['public'], 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=public_fields, extrasaction='ignore')
                writer.writeheader()
                for p in products:
                    if is_hidden(p):
                        continue  # מוצר מוסתר — לא עולה לאתר
                    # רשת ביטחון: אלה קטלוגים שמציגים מחירים, ולכן מוצר בלי מחיר
                    # היה מוצג כ-0.00 ₪ וניתן להזמנה. נשאר במאסטר עד שיוזן מחיר.
                    if not ((to_float(p.get('price')) or 0) > 0):
                        continue
                    row = {k: p.get(k, '') for k in public_fields}
                    sale = to_float(p.get('sale_price'))
                    regular = to_float(p.get('price'))
                    if sale is not None and regular is not None and 0 < sale < regular:
                        row['price'] = sale
                        row['original_price'] = regular
                    else:
                        row['original_price'] = ''
                    row['bundle'] = _clean_bundle(p.get('bundle'))
                    row['promo_start'] = _clean_date(p.get('promo_start'))
                    row['promo_end'] = _clean_date(p.get('promo_end'))
                    writer.writerow(row)

            # עדכון סכמה, פיד ודפי קטגוריה (SEO + שופינג ללקוחות פרטיים).
            # מחירון הוועד הוא noindex ואין לו פיד/דפי מוצר — ולכן מדלגים.
            try:
                if cfg['generators']:
                    update_care_schema()
                    bake_care_products()
                    update_merchant_feed()
                    generate_care_category_pages()
                    generate_care_product_pages()
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
