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
SITE_BASE_URL = 'https://aroam.co.il'


def update_care_schema():
    """בונה JSON-LD (ItemList של Product עם מחירים) מ-pricelist.csv ומשתיל ב-care/index.html.

    רץ בכל שמירה של המחירון כדי שגוגל יקבל שמות, תמונות ומחירים מעודכנים.
    """
    from urllib.parse import quote

    with open(PRICELIST_PUBLIC_FILE, encoding='utf-8') as f:
        rows = [r for r in csv.DictReader(f) if r.get('id') and r.get('name')]

    # הנחות קטגוריה מקובץ המבצעים — כדי שהמחיר בסכמה יהיה המחיר שמוצג בפועל
    category_discounts = {}
    try:
        with open(PRICELIST_PROMO_FILE, encoding='utf-8') as f:
            promo = json.load(f)
        for rule in promo.get('category_discounts', []):
            pct = float(rule.get('percent') or 0)
            if rule.get('category') and pct > 0:
                category_discounts[rule['category']] = pct
    except (FileNotFoundError, ValueError):
        pass

    items = []
    for i, r in enumerate(rows, start=1):
        try:
            price = float(r.get('price') or 0)
        except ValueError:
            price = 0
        if price <= 0:
            continue
        # גוגל דורש תמונה לכל מוצר בסכמה — מוצר בלי תמונה גורם לשגיאה קריטית בבדיקת העשירות.
        # מדלגים עליו; הוא יתווסף אוטומטית בשמירה הבאה אחרי שתהיה לו תמונה
        if not (r.get('image') or '').strip():
            continue
        # הנחת קטגוריה חלה רק כשאין מבצע פרטני (original_price ריק); עיגול ל-10 אגורות
        if not (r.get('original_price') or '').strip() and r.get('category') in category_discounts:
            price = round(price * (1 - category_discounts[r['category']] / 100) * 10) / 10
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
    with open(CARE_PAGE_FILE, 'w', encoding='utf-8') as f:
        f.write(html[:start] + block + html[end:])

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

            # הסכמה בעמוד הציבורי משקפת גם הנחות קטגוריה — מעדכנים
            try:
                update_care_schema()
            except Exception as schema_err:
                print(f'אזהרה: עדכון סכמת care נכשל: {schema_err}')

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

            master_fields = ['id', 'name', 'category', 'unit', 'brand', 'image', 'cost', 'price', 'sale_price', 'description']
            public_fields = ['id', 'name', 'category', 'unit', 'brand', 'image', 'price', 'original_price', 'description']

            def to_float(v):
                try:
                    return float(v)
                except (TypeError, ValueError):
                    return None

            with open(PRICELIST_MASTER_FILE, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=master_fields, extrasaction='ignore')
                writer.writeheader()
                for p in products:
                    writer.writerow({k: p.get(k, '') for k in master_fields})

            # בקובץ הציבורי: כשיש מבצע — price = מחיר המבצע, original_price = המחיר הרגיל (לתצוגת "מבצע")
            with open(PRICELIST_PUBLIC_FILE, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=public_fields, extrasaction='ignore')
                writer.writeheader()
                for p in products:
                    row = {k: p.get(k, '') for k in public_fields}
                    sale = to_float(p.get('sale_price'))
                    regular = to_float(p.get('price'))
                    if sale is not None and regular is not None and 0 < sale < regular:
                        row['price'] = sale
                        row['original_price'] = regular
                    else:
                        row['original_price'] = ''
                    writer.writerow(row)

            # עדכון סכמת המוצרים בעמוד הציבורי (SEO ללקוחות פרטיים)
            try:
                update_care_schema()
            except Exception as schema_err:
                print(f'אזהרה: עדכון סכמת care נכשל: {schema_err}')

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
