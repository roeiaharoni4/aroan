import http.server
import socketserver
import json
import os
import csv
import base64
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get('PORT', 8081))
DATA_FILE = 'data/products.csv'
IMAGES_DIR = 'images'
# מחירון נסתר: הקובץ המלא (עם עלות) נשאר מקומי בלבד (ב-.gitignore); הציבורי נגזר ממנו בכל שמירה
PRICELIST_MASTER_FILE = 'data/pricelist-master.csv'
PRICELIST_PUBLIC_FILE = 'data/pricelist.csv'

class AdminHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable caching for API and data files
        if self.path.startswith('/api/') or self.path.endswith('.csv'):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        # Allow default behavior for all GET requests (serving static files)
        super().do_GET()

    def do_POST(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/products':
            self.handle_save_products()
        elif parsed_path.path == '/api/pricelist':
            self.handle_save_pricelist()
        elif parsed_path.path == '/api/upload':
            self.handle_upload_image()
        else:
            self.send_error(404, "API endpoint not found")

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

            master_fields = ['id', 'name', 'category', 'unit', 'image', 'cost', 'price', 'sale_price', 'description']
            public_fields = ['id', 'name', 'category', 'unit', 'image', 'price', 'original_price', 'description']

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
