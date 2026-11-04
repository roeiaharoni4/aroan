#!/usr/bin/env python3
"""בונה את ממיר ההזמנות לריווחית לקובץ HTML יחיד שעובד בלי אינטרנט.

הרצה: python3 tools/rivhit/build.py
התוצר: tools/rivhit/dist/ממיר הזמנות לריווחית.html — מעתיקים אותו למחשב של ריווחית.
SheetJS CE 0.20.3 (Apache-2.0) מ-https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
"""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / 'src'
OUT = HERE / 'dist' / 'ממיר הזמנות לריווחית.html'
# סדר הטעינה חשוב: text.js לפני המודולים שתלויים בו
CORE = ['text.js', 'order-form.js', 'mapping.js', 'rivhit-file.js']

# קובץ הקליטה מהזמנות האתר (סבב 88): נטען בעמוד ה-CRM ונדחף כקובץ שני
# לפרויקט Apps Script של ההזמנות. מגדיר RivhitCore גלובלי.
SITE_CORE_OUT = HERE.parent.parent / 'js' / 'rivhit-core.js'
SITE_CORE = ['text.js', 'rivhit-file.js', 'site-order.js']
SITE_CORE_HEADER = (
    '/* נגזר מ-tools/rivhit/src (text.js, rivhit-file.js, site-order.js) ע"י tools/rivhit/build.py.\n'
    '   לא לערוך ידנית — משנים ב-src ומריצים את הבנייה. נטען בעמוד ה-CRM ובסקריפט ההזמנות (ריווחית.js). */\n'
)


def script(code):
    return '<script>\n' + code.replace('</script', '<\\/script') + '\n</script>'


def read(path):
    return path.read_text(encoding='utf-8')


def main():
    html = read(SRC / 'template.html')
    mapping = json.loads(read(SRC / 'mapping.json'))
    parts = {
        '<!--INLINE:xlsx-->': script(read(HERE / 'vendor' / 'xlsx.full.min.js')),
        '<!--INLINE:mapping-->': script('window.RIVHIT_MAPPING = ' + json.dumps(mapping, ensure_ascii=False) + ';'),
        '<!--INLINE:core-->': '\n'.join(script(read(SRC / name)) for name in CORE),
        '<!--INLINE:ui-->': script(read(SRC / 'ui.js')),
    }
    for marker, content in parts.items():
        if html.count(marker) != 1:
            raise SystemExit(f'הסימון {marker} חייב להופיע בתבנית פעם אחת בדיוק')
        html = html.replace(marker, content)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding='utf-8')
    print(f'נבנה: {OUT} ({OUT.stat().st_size // 1024} KB)')

    core = SITE_CORE_HEADER + '\n'.join(read(SRC / name) for name in SITE_CORE)
    SITE_CORE_OUT.write_text(core, encoding='utf-8')
    print(f'נבנה: {SITE_CORE_OUT} ({SITE_CORE_OUT.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
