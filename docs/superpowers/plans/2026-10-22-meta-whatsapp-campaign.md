# קמפיין מטא (מודעות שפותחות וואטסאפ) — תוכנית ביצוע

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** להכין את כל מה שרועי צריך כדי להעלות את הקמפיין: 3 מודעות בשני גדלים, ערכת דף פייסבוק (פרופיל, כיסוי, 4 פוסטים), ערכת WhatsApp Business, ומדריך הקמה עם כפתורי העתקה — ואחרי שהדף קיים, קישור אליו באתר.

**Architecture:** התמונות נבנות בצינור המודעות הקיים מאוגוסט (`marketing/ads/src/`): HTML עם המוצרים בקנה מידה אמיתי, צילום מסך ב-Chrome ללא ממשק, ובדיקה אוטומטית. נוסף קובץ `meta.py` לצד `make.py` הקיים, ו-`verify_meta.py` לצד `verify.py`. התוצרים נשמרים ב-`marketing/meta/` — תיקייה שמוחרגת מהאתר החי. המדריך הוא עמוד HTML אחד (`marketing/meta/guide.html`) שמציג את התמונות ואת כל הטקסטים. השינוי היחיד באתר (משימה 5) מחכה לכתובת הדף מרועי.

**Tech Stack:** Python 3 + Pillow + numpy, ‏Google Chrome headless (`build.render`), ‏HTML/CSS/JS סטטי בעברית RTL.

## Global Constraints

- מסמך העיצוב המאושר: `docs/superpowers/specs/2026-10-22-meta-whatsapp-campaign-design.md`. כל דרישה שם מחייבת.
- **הטקסטים מועתקים מילה במילה** מהטבלאות במסמך העיצוב. טקסטים חדשים שמוגדרים בתוכנית הזו (תיאור לוואטסאפ, ביו לדף, 4 הפוסטים, התשובות `/פרטים` ו-`/קטלוג`) סופיים כפי שהם כתובים כאן.
- **בשום טקסט** של מודעה, דף, פוסט או וואטסאפ: בלי מחירים, בלי שמות לקוחות, בלי תנאי אספקה (מינימום הזמנה, ימי אספקה) ובלי הבטחת זמן תגובה.
- **בתמונות אין אריזות עם מיתוג של יצרנים אחרים** (הכלל של סט אוגוסט). מותר: מוצרים בלי מיתוג, והתווית GOLD של אהרוני עצמו.
- צבעים: ירוק כהה `#1A4231`, פסטל `#8FD6A3`, ירוק המותג `#639C7D`, ירוק בהיר `#EAF3EE`; העלה בלוגו `#82B220`.
- מידות: פיד 1080×1350 · סטורי 1080×1920 · כיסוי 1640×624 · פרופיל 720×720. בסטורי: **250px עליונים ו-250px תחתונים בלי טקסט ובלי לוגו**. בכיסוי: לוגו וטקסט בתוך x=270..1370 (מה שנראה במובייל).
- פרטי העסק: וואטסאפ 052-6000158 (`wa.me/972526000158`) · אתר `https://aroam.co.il` · מייל `meiraroam@gmail.com` · כתובת היצירה 16, אור יהודה · שעות א׳–ה׳ 08:00–17:00 (כמו בסכמה של דף הבית) · עוסק מורשה 059291906.
- כל הקבצים של הקמפיין תחת `marketing/` (מוחרג מהאתר ב-`_config.yml`). שום דבר לא נכנס ל-`sitemap.xml` או ל-`llms.txt`.
- **בלי פיקסל של מטא, בלי `fbclid`, בלי שינוי ב-`js/app.js` או ב-`css/style.css`** — ולכן בלי העלאת גרסאות.
- **כל פקודה רצה משורש הריפו** `/Users/roeiaharoni/aroan` עם נתיבים יחסיים לשורש. **לא להשתמש ב-`cd`** — תיקיית העבודה של המעטפת נשמרת בין קריאות.
- הרינדור משתמש ב-Chrome שב-`/Applications/Google Chrome.app` (דרך `build.render`). אין במחשב rsvg-convert או ImageMagick.
- **commit בלבד.** רועי דוחף דרך GitHub Desktop.

---

### Task 1: צינור המודעות מצביע על הריפו ועל הלוגו הווקטורי

**הרקע:** הריפו עבר מ-`~/Desktop/קטלוג לקוחות/aroan` ל-`~/aroan` ב-27.8.26, אבל `build.py` ו-`sources.py` עדיין מצביעים על הנתיב הישן — הלוגו (`images/logo_512.png` בשולחן העבודה) כבר לא קיים שם, ולכן כל הרצה של הצינור נכשלת. בנוסף הלוגו הנכון הוא הקובץ הווקטורי מה-PDF של רועי: קובצי ה-PNG ב-`images/` הם הגדלה של מקור ברוחב 182px ומיטשטשים בגודל של תמונת כיסוי ופרופיל.

**Files:**
- Create: `marketing/ads/src/check_paths.py`
- Create: `marketing/ads/src/assets/aroam_logo_vector.svg` (העתק של `~/Downloads/aroam_label_concepts/aroam_logo_vector.svg`)
- Modify: `marketing/ads/src/build.py` (הקבוע `LOGO`)
- Modify: `marketing/ads/src/sources.py` (הקבוע `CAT`)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: אין.
- Produces: `build.LOGO` — `pathlib.Path` לקובץ ה-SVG בתוך הריפו; `sources.CAT` — `pathlib.Path` ל-`images/` של הריפו. משימות 2–3 מסתמכות על שניהם.

- [ ] **Step 1: לכתוב את הבדיקה**

`marketing/ads/src/check_paths.py`:

```python
"""Fail fast when an asset path points outside the repo or at a missing file.

The repo moved from ~/Desktop/קטלוג לקוחות/aroan to ~/aroan on 27.8.26 and the August
pipeline kept its absolute Desktop paths, so it could no longer render anything.
"""
import pathlib
import sys

from build import LOGO
from sources import CAT, SOURCES

ROOT = pathlib.Path(__file__).resolve().parents[3]
fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


check(LOGO.exists(), f"logo exists: {LOGO}")
check(ROOT in LOGO.resolve().parents, "logo lives inside the repo")
check(LOGO.suffix == ".svg", "logo is the vector file, not an upscaled PNG")
check(CAT.resolve() == (ROOT / "images").resolve(), f"catalog images dir is the repo's own: {CAT}")
for name, cfg in SOURCES.items():
    check(pathlib.Path(cfg["src"]).exists(), f"{name}: source image exists")

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILURES"))
sys.exit(1 if fails else 0)
```

- [ ] **Step 2: להריץ ולוודא שהיא נכשלת**

Run: `python3 marketing/ads/src/check_paths.py`
Expected: `FAIL logo exists: /Users/roeiaharoni/Desktop/...`, `FAIL catalog images dir is the repo's own`, וכשלים ל-8 מקורות הקטלוג. השורה האחרונה: `N FAILURES`.

- [ ] **Step 3: להעתיק את הלוגו לריפו**

```bash
mkdir -p marketing/ads/src/assets
cp ~/Downloads/aroam_label_concepts/aroam_logo_vector.svg marketing/ads/src/assets/aroam_logo_vector.svg
```

- [ ] **Step 4: לעדכן את `build.py`**

להחליף:

```python
# The repo's own logo raster. The traced SVG in the ad skill renders its tagline
# ("שיווק והפצה") as broken letterforms at small sizes, so the real asset wins.
LOGO = pathlib.Path(
    "/Users/roeiaharoni/Desktop/קטלוג לקוחות/aroan/images/logo_512.png"
)
```

ב:

```python
# The vector logo extracted from Roei's own PDF. The traced SVG in the ad skill breaks
# the tagline ("שיווק והפצה") at small sizes, and images/logo*.png are upscales of a
# 182px source that blur at cover and profile sizes.
LOGO = HERE / "assets" / "aroam_logo_vector.svg"
```

- [ ] **Step 5: לעדכן את `sources.py`**

להחליף:

```python
CAT = pathlib.Path("/Users/roeiaharoni/Desktop/קטלוג לקוחות/aroan/images")
```

ב:

```python
# The repo's own catalog images (the repo moved from ~/Desktop to ~/aroan on 27.8.26).
CAT = pathlib.Path(__file__).resolve().parents[3] / "images"
```

- [ ] **Step 6: להריץ ולוודא שהיא עוברת**

Run: `python3 marketing/ads/src/check_paths.py`
Expected: כל השורות `ok`, ובסוף `ALL CHECKS PASSED`.

- [ ] **Step 7: להוציא את קובצי הביניים של הרינדור מ-git**

להוסיף בסוף `.gitignore`:

```
# קובצי ביניים של צינור המודעות (marketing/ads/src) — נוצרים מחדש בכל הרצה
marketing/ads/src/out/
marketing/ads/src/tmp_page.html
marketing/ads/src/tmp_shot.png
marketing/ads/src/scale_report.json
marketing/ads/src/meta_scale_report.json
```

- [ ] **Step 8: לוודא שסט אוגוסט נבנה מחדש עם הלוגו הווקטורי**

Run: `python3 marketing/ads/src/make.py && python3 marketing/ads/src/verify.py`
Expected: שלוש שורות `aroam_*.png` מ-`make.py`, ומ-`verify.py` בסוף `ALL CHECKS PASSED`.

ואז לפתוח את `marketing/ads/src/out/_contact_sheet.png` (כלי Read) ולוודא: הלוגו חד, אין סביבו מלבן לבן, והכיתוב "שיווק והפצה" קריא. הקבצים ב-`marketing/ads/*.png` (סט אוגוסט שנמסר) **לא משתנים** — `make.py` כותב רק ל-`out/`.

- [ ] **Step 9: Commit**

```bash
git add .gitignore marketing/ads/src/build.py marketing/ads/src/sources.py marketing/ads/src/check_paths.py marketing/ads/src/assets/aroam_logo_vector.svg
git commit -m "$(cat <<'EOF'
צינור המודעות: נתיבים יחסיים לריפו ולוגו וקטורי

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: ארבעה מוצרים חדשים בלי מיתוג של יצרנים

**הרקע:** למודעות המשרדים והמפעלים צריך מוצרים שאין בסט אוגוסט. נבדקו 15 מוצרים מהקטלוג; ברובם האריזה ממותגת (Violet, Nofar, נופר, EVERNES, Perfect, save plus). ארבעה נקיים:

| שם בקוד | מוצר בקטלוג | למה מתאים |
|---|---|---|
| `gold` | גליל נייר תעשייתי גולד (`מוצ002`) | **התווית היא של אהרוני** — מוצר בתווית פרטית |
| `carton` | נייר טואלט קומפקט 80 – 36 יח׳ (`מוצ009`) | קרטון עם הדפסה עברית כללית בלי מותג — משדר כמות |
| `squeegee` | מגב מתכת 40 ס"מ (`אבי008`) | בלי מיתוג, מזוהה עם מחסן ורצפה |
| `bins` | סל אשפה מתכת רשת (`ציו014`) | בלי מיתוג (רק מדבקות מחיר קטנות), מזוהה עם משרד |

**Files:**
- Create: `marketing/ads/src/check_prepped.py`
- Modify: `marketing/ads/src/build.py` (המילונים `CM` ו-`AXIS`)
- Modify: `marketing/ads/src/sources.py` (המילון `SOURCES`)
- Create: `marketing/ads/src/prepped/gold.png`, `carton.png`, `squeegee.png`, `bins.png` (נוצרים מ-`sources.py`)

**Interfaces:**
- Consumes: `sources.CAT` ממשימה 1.
- Produces: ארבעת השמות `gold`, `carton`, `squeegee`, `bins` — זמינים ל-`build.product_html(name, ppc, left, bottom, rot, sizes)` ול-`build.group_offset(items, ppc)`. משימה 3 משתמשת בהם בדיוק בשמות האלה.

- [ ] **Step 1: לכתוב את הבדיקה**

`marketing/ads/src/check_prepped.py`:

```python
"""Each product must have its real-world size on record and a clean prepped cutout."""
import pathlib
import sys

import numpy as np
from PIL import Image

from build import AXIS, CM

HERE = pathlib.Path(__file__).parent
EXISTING = ["plate", "beer", "cup_paper", "cold", "spoon", "fork", "rolls", "rolls2", "jumbo"]
# The Meta set's additions. Only these get the cutout-quality checks: the August items
# shipped long ago, and some of them (forks, the spoon) are thin by nature.
NEW = ["gold", "carton", "squeegee", "bins"]
fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


for name in EXISTING + NEW:
    check(name in CM and name in AXIS, f"{name}: real-world size and axis recorded")
    check((HERE / "prepped" / f"{name}.png").exists(), f"{name}: prepped cutout exists")

for name in NEW:
    p = HERE / "prepped" / f"{name}.png"
    if not p.exists():
        continue
    a = np.asarray(Image.open(p).convert("RGBA"))[:, :, 3]
    corners = [int(a[0, 0]), int(a[0, -1]), int(a[-1, 0]), int(a[-1, -1])]
    check(max(corners) < 16, f"{name}: transparent corners {corners}")
    solid = float((a > 200).mean())
    # A white product on a white ground is where the flood fill eats holes through the
    # body; a solid share this low means the cutout is shredded.
    check(solid > 0.15, f"{name}: solid body ({solid:.0%} opaque)")

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILURES"))
sys.exit(1 if fails else 0)
```

- [ ] **Step 2: להריץ ולוודא שהיא נכשלת**

Run: `python3 marketing/ads/src/check_prepped.py`
Expected: `FAIL` לשתי הבדיקות של כל אחד מ-`gold`, `carton`, `squeegee`, `bins`; `ok` לתשעת הקיימים. בסוף `8 FAILURES`.

- [ ] **Step 3: לרשום גודל אמיתי ב-`build.py`**

בסוף המילון `CM` (אחרי `"jumbo": 22.0,`):

```python
    "gold": 30.0,     # גליל נייר תעשייתי גולד (התווית של אהרוני), קוטר
    "carton": 48.0,   # קרטון נייר טואלט קומפקט 80, 36 גלילים
    "squeegee": 40.0, # מגב מתכת 40 ס"מ
    "bins": 28.0,     # זוג סלי רשת משרדיים, גובה הגבוה
```

ולהחליף את `AXIS`:

```python
AXIS = {"plate": "h", "beer": "h", "cup_paper": "h", "cold": "h",
        "spoon": "h", "fork": "w", "rolls": "w", "rolls2": "w", "jumbo": "h",
        "gold": "w", "carton": "w", "squeegee": "w", "bins": "h"}
```

- [ ] **Step 4: להוסיף את המקורות ב-`sources.py`**

בסוף המילון `SOURCES` (אחרי הרשומה `"rolls"`):

```python
    # Additions for the Meta set (offices, factories). All unbranded - except "gold",
    # whose label is Roei's own: it is his private-label roll and stays in frame.
    "gold": dict(
        src=CAT / "מוצרי נייר/גליל נייר תעשייתי גולד.webp",
        note="Aroam's own GOLD-label industrial roll - the label is Roei's",
        radius=41, white=254, contrast=1.3, alpha_tol=2,
    ),
    "carton": dict(
        src=CAT / "מוצרי נייר/נייר טואלט קומפקט 80 - 36 יח_.webp",
        note="plain carton, generic Hebrew print, no manufacturer brand",
        radius=41, white=254, contrast=1.2, alpha_tol=2,
    ),
    "squeegee": dict(
        src=CAT / "אביזרי ניקיון/מגב מתכת 40 סמ.webp",
        note="unbranded 40cm floor squeegee head",
        radius=41, white=252, contrast=1.15,
    ),
    "bins": dict(
        src=CAT / "ציוד משרדי/סל אשפה מתכת רשת.webp",
        note="pair of mesh office bins - generic price stickers only",
        radius=41, white=252, contrast=1.15,
    ),
```

- [ ] **Step 5: להכין את החיתוכים**

Run: `python3 marketing/ads/src/sources.py`
Expected: 13 שורות, אחת לכל מוצר, כולל `gold`, `carton`, `squeegee`, `bins` עם המידות שלהם.

- [ ] **Step 6: להריץ את הבדיקה ולוודא שהיא עוברת**

Run: `python3 marketing/ads/src/check_prepped.py`
Expected: `ALL CHECKS PASSED`.

- [ ] **Step 7: בדיקה בעין**

```bash
python3 - <<'EOF'
import pathlib
from PIL import Image
src = pathlib.Path("marketing/ads/src/prepped")
tiles = []
for n in ["gold", "carton", "squeegee", "bins"]:
    t = Image.open(src / f"{n}.png").convert("RGBA")
    t.thumbnail((360, 360))
    tiles.append(t)
W = sum(t.width for t in tiles) + 40 * (len(tiles) + 1)
sheet = Image.new("RGBA", (W, 440), (241, 243, 241, 255))
x = 40
for t in tiles:
    sheet.alpha_composite(t, (x, 40))
    x += t.width + 40
out = pathlib.Path("marketing/ads/src/out")
out.mkdir(exist_ok=True)
sheet.convert("RGB").save(out / "_new_cutouts.png")
EOF
```

לפתוח את `marketing/ads/src/out/_new_cutouts.png` (כלי Read) ולוודא בכל אחד מהארבעה: אין הילה לבנה סביב המוצר, אין חורים בגוף הלבן של הגליל והקרטון, והתווית GOLD קריאה. אם יש חור בגוף — להוריד את `alpha_tol` של אותו מוצר ל-`1`; אם יש הילה — להעלות את `white` ב-1. אחרי כל שינוי לחזור על Steps 5–7.

- [ ] **Step 8: Commit**

```bash
git add marketing/ads/src/build.py marketing/ads/src/sources.py marketing/ads/src/check_prepped.py marketing/ads/src/prepped/
git commit -m "$(cat <<'EOF'
צינור המודעות: ארבעה מוצרים בלי מיתוג של יצרנים למודעות מטא

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: סט התמונות למטא

**Files:**
- Create: `marketing/ads/src/verify_meta.py`
- Create: `marketing/ads/src/meta.py`
- Create (מ-`meta.py`): `marketing/meta/img/switch_feed.png`, `switch_story.png`, `office_feed.png`, `office_story.png`, `factory_feed.png`, `factory_story.png`, `brand_feed.png`, `cover.png`, `profile.png`

**Interfaces:**
- Consumes: מ-`build.py` — `GREEN_DARK`, `PASTEL`, `LOGO`, `data_uri(path)`, `group_offset(items, ppc)`, `product_html(name, ppc, left, bottom, rot=0, sizes=None)`, `render(html, out, w, h)`; מ-`make.py` — `ITEMS` (הסידור של אוגוסט); המוצרים `gold`, `carton`, `squeegee`, `bins` ממשימה 2.
- Produces: תשעת הקבצים ב-`marketing/meta/img/` בשמות שלמעלה. משימה 4 מפנה אליהם בדיוק בשמות האלה.

- [ ] **Step 1: לכתוב את הבדיקה**

`marketing/ads/src/verify_meta.py`:

```python
"""Check the Meta set against Meta's placement rules and the brand constraints."""
import json
import pathlib
import sys

import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).parent
IMG = HERE.parents[2] / "marketing" / "meta" / "img"
REPORT = HERE / "meta_scale_report.json"

EXPECTED = {
    "switch_feed.png": (1080, 1350), "switch_story.png": (1080, 1920),
    "office_feed.png": (1080, 1350), "office_story.png": (1080, 1920),
    "factory_feed.png": (1080, 1350), "factory_story.png": (1080, 1920),
    "brand_feed.png": (1080, 1350),
    "cover.png": (1640, 624),
    "profile.png": (720, 720),
}
MAX_BYTES = 5 * 1024 * 1024
MAX_SCALE = 1.5
LEAF = np.array([130, 178, 32])  # the logo's green
STORY_SAFE = 250                 # Meta covers the top and bottom ~14% of a story with its UI
COVER_SAFE = (270, 1370)         # phones show only the centre ~1100px of a 1640px cover

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def leaf(a):
    return np.abs(a - LEAF).sum(2) < 60


def pixels(name):
    return np.asarray(Image.open(IMG / name).convert("RGB")).astype(int)


print("== files ==")
for name, size in EXPECTED.items():
    f = IMG / name
    check(f.exists(), f"{name}: exists")
    if not f.exists():
        continue
    im = Image.open(f)
    check(im.size == size, f"{name}: {im.size[0]}x{im.size[1]} == {size}")
    check(im.mode == "RGB", f"{name}: mode {im.mode} has no alpha")
    check(f.stat().st_size < MAX_BYTES, f"{name}: {f.stat().st_size / 1024:.0f}KB < 5MB")
    n = int(leaf(pixels(name)).sum())
    check(n > 200, f"{name}: logo present ({n}px leaf green)")

print("\n== story safe zones ==")
for name in [n for n in EXPECTED if n.endswith("_story.png") and (IMG / n).exists()]:
    a = pixels(name)
    for label, band in (("top", a[:STORY_SAFE]), ("bottom", a[-STORY_SAFE:])):
        std = float(band.mean(2).std())
        check(std < 14 and leaf(band).sum() == 0,
              f"{name}: {label} {STORY_SAFE}px is background only (luma std {std:.1f})")

print("\n== cover safe zone ==")
if (IMG / "cover.png").exists():
    m = leaf(pixels("cover.png"))
    lo, hi = COVER_SAFE
    check(m[:, :lo].sum() == 0 and m[:, hi:].sum() == 0,
          f"cover.png: logo inside x={lo}..{hi}")

print("\n== profile circle ==")
if (IMG / "profile.png").exists():
    a = pixels("profile.png")
    yy, xx = np.mgrid[:720, :720]
    outside = (yy - 360) ** 2 + (xx - 360) ** 2 > 340 ** 2
    ink = int((a[outside] < 245).any(axis=1).sum())
    check(ink == 0, f"profile.png: only white outside the circle crop ({ink} ink px)")

print("\n== real-world scale ==")
check(REPORT.exists(), "scale report exists")
if REPORT.exists():
    for asset, items in json.loads(REPORT.read_text()).items():
        if items:
            worst = max(items.items(), key=lambda kv: kv[1]["scale"])
            check(worst[1]["scale"] <= MAX_SCALE + 1e-6,
                  f"{asset}: worst enlargement {worst[0]} x{worst[1]['scale']:.2f} <= {MAX_SCALE}")

print("\n== contact sheet ==")
tiles = []
for name in EXPECTED:
    if (IMG / name).exists():
        im = Image.open(IMG / name).convert("RGB")
        s = 360 / max(im.size)
        tiles.append(im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS))
if tiles:
    pad = 22
    W = sum(t.width for t in tiles) + pad * (len(tiles) + 1)
    sheet = Image.new("RGB", (W, max(t.height for t in tiles) + pad * 2), (245, 245, 244))
    x = pad
    for t in tiles:
        sheet.paste(t, (x, pad))
        x += t.width + pad
    out = HERE / "out" / "_meta_contact_sheet.png"
    out.parent.mkdir(exist_ok=True)
    sheet.save(out)
    print(f"  wrote {out}")

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILURES"))
sys.exit(1 if fails else 0)
```

- [ ] **Step 2: להריץ ולוודא שהיא נכשלת**

Run: `python3 marketing/ads/src/verify_meta.py`
Expected: `FAIL <name>: exists` לכל אחד מתשעת הקבצים ו-`FAIL scale report exists`. בסוף `10 FAILURES`.

- [ ] **Step 3: לכתוב את הרינדור**

`marketing/ads/src/meta.py`:

```python
"""Render the Meta (Facebook/Instagram) set for the click-to-WhatsApp campaign.

Three ads - switch / office / factory - in feed 1080x1350 and story 1080x1920, plus
the Page's opening-post image, cover and profile picture. Same visual system as
make.py (Roei's layout: dark-green brand block, goods on a light stage, real-world
scale) so the ads match the site and the August set. Copy is verbatim from
docs/superpowers/specs/2026-10-22-meta-whatsapp-campaign-design.md.
"""
import json
import pathlib

from build import GREEN_DARK, LOGO, PASTEL, data_uri, group_offset, product_html, render
from make import ITEMS as AUGUST_MIX

HERE = pathlib.Path(__file__).parent
OUT = HERE.parents[2] / "marketing" / "meta" / "img"
REPORT = HERE / "meta_scale_report.json"

FONT = '"Arial Hebrew", "Heebo", "Assistant", -apple-system, sans-serif'
# Item offsets in ADS are written at the feed scale and stretched with ppc, so one
# arrangement serves the feed, the story and the much smaller cover.
BASE_PPC = 10.4

# The WhatsApp glyph the site already uses (js/components.js, .switch-offer-btn).
WA_ICON = (
    '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16 3C9.1 3 '
    '3.5 8.6 3.5 15.5c0 2.2.6 4.3 1.6 6.2L3.4 28l6.5-1.7c1.8 1 3.9 1.5 6.1 1.5 6.9 0 '
    '12.5-5.6 12.5-12.5S22.9 3 16 3zm0 22.7c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-3.9 1 1-3.8-.2'
    '-.4c-1-1.6-1.5-3.5-1.5-5.4C5.7 9.8 10.3 5.2 16 5.2s10.3 4.6 10.3 10.3S21.7 25.7 16 '
    '25.7z"/></svg>'
)

ADS = {
    "switch": dict(
        h1="כבר עובדים עם ספק?",
        sub="שלחו צילום של ההזמנה האחרונה — ונחזיר הצעה מתחרה",
        chips=["לעסקים ומוסדות", "מעל 20 שנה"],
        pill=(WA_ICON, "שלחו צילום בוואטסאפ"),
        items=[("carton", -250, 0, 0), ("gold", -20, 0, 0), ("rolls", 200, 0, 0),
               ("cup_paper", 330, 0, 0)],
    ),
    "office": dict(
        h1="כל מה שהמשרד צריך — מספק אחד",
        sub="נייר · קפה · ניקיון · ציוד משרדי",
        chips=["לעסקים ומוסדות", "מעל 20 שנה"],
        pill=(WA_ICON, "שלחו הודעה בוואטסאפ"),
        items=[("bins", -240, 0, 0), ("rolls", -20, 0, 0), ("rolls2", 190, 0, 0),
               ("cup_paper", 300, 0, 0), ("cold", 345, 0, 0)],
    ),
    "factory": dict(
        h1="אספקה קבועה למפעלים ומחסנים",
        sub="גלילי נייר תעשייתי · שקיות אשפה · כפפות · חומרי ניקוי",
        chips=["לעסקים ומוסדות", "מעל 20 שנה"],
        pill=(WA_ICON, "שלחו הודעה בוואטסאפ"),
        items=[("carton", -250, 0, 0), ("gold", -10, 0, 0), ("jumbo", 175, 0, 0),
               ("squeegee", 60, -8, -3)],
    ),
    # The Page's opening post ("מי אנחנו") - organic, not an ad, so the pill is the site.
    "brand": dict(
        h1="ספק אחד לכל מה שהעסק צריך",
        sub="חד פעמי · נייר · ניקיון · ציוד משרדי",
        chips=["מעל 20 שנה", "מיבנה ועד רעננה"],
        pill=("", "aroam.co.il"),
        items=AUGUST_MIX,
    ),
}

FORMATS = {
    "feed": dict(
        w=1080, h=1350, ppc=10.4, ground=240, cx=540,
        panel="left:0;top:0;width:100%;height:600px;padding:56px 70px;",
        stage="left:0;bottom:0;width:100%;height:750px;",
        logo_w=150, h1=58, sub=28, chip=24, pill=30),
    # Meta lays its own UI over the top and bottom ~250px of a story, so the panel's
    # content starts at 290 and the goods stand well clear of the bottom band.
    "story": dict(
        w=1080, h=1920, ppc=11.2, ground=340, cx=540,
        panel="left:0;top:0;width:100%;height:1020px;padding:290px 76px 60px;",
        stage="left:0;bottom:0;width:100%;height:900px;",
        logo_w=170, h1=66, sub=32, chip=26, pill=34),
}

# Desktop shows the whole cover; phones show only the centre ~1100px, so the panel
# and the goods both sit inside x=270..1370.
COVER = dict(w=1640, h=624, ppc=6.0, ground=150, cx=530)

ITEM_CSS = """.item{position:absolute}
.item img{width:100%;height:100%;object-fit:contain;display:block;
  filter:drop-shadow(0 7px 10px rgba(14,32,54,.18))}
.shade{position:absolute;height:26px;border-radius:50%;filter:blur(7px);
  background:radial-gradient(50% 50% at 50% 50%,rgba(14,32,54,.30) 0%,
             rgba(14,32,54,.12) 55%,transparent 78%)}"""


def cluster(items, ppc, ground, cx, sizes):
    k = ppc / BASE_PPC
    placed = [(n, dx * k, dy * k, rot) for n, dx, dy, rot in items]
    shift = group_offset(placed, ppc)
    return "".join(product_html(n, ppc, cx + dx + shift, ground + dy, rot=rot, sizes=sizes)
                   for n, dx, dy, rot in placed)


def ad_page(f, ad, items):
    icon, label = ad["pill"]
    chips = "".join(f'<span class="chip">{c}</span>' for c in ad["chips"])
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{f['w']}px;height:{f['h']}px;overflow:hidden;font-family:{FONT}}}
.c{{position:relative;width:{f['w']}px;height:{f['h']}px;background:#FBFBFA;direction:rtl}}
.stage{{position:absolute;{f['stage']}
  background:radial-gradient(72% 62% at 46% 46%,#fff 0%,#F1F3F1 100%)}}
.panel{{position:absolute;{f['panel']}overflow:hidden;
  background:linear-gradient(155deg,{GREEN_DARK} 0%,#245A41 60%,{GREEN_DARK} 100%);
  display:flex;flex-direction:column;justify-content:center}}
.logo{{width:{f['logo_w']}px;margin-bottom:24px}}
.logo img{{width:100%;display:block}}
h1{{color:#fff;font-size:{f['h1']}px;line-height:1.2;font-weight:700;letter-spacing:-.5px}}
.sub{{color:{PASTEL};font-size:{f['sub']}px;line-height:1.35;margin-top:14px}}
.chips{{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}}
.chip{{border:2px solid {PASTEL};color:#fff;font-size:{f['chip']}px;padding:5px 18px;
  border-radius:40px}}
.pill{{margin-top:26px;align-self:flex-start;display:inline-flex;align-items:center;gap:12px;
  background:{PASTEL};color:{GREEN_DARK};font-size:{f['pill']}px;font-weight:700;
  padding:12px 30px;border-radius:40px}}
.pill svg{{width:{f['pill'] + 4}px;height:{f['pill'] + 4}px;flex:none}}
{ITEM_CSS}
</style></head><body><div class="c">
  <div class="stage"></div>
  <div class="panel">
    <div class="logo"><img src="{data_uri(LOGO)}"></div>
    <h1>{ad['h1']}</h1>
    <div class="sub">{ad['sub']}</div>
    <div class="chips">{chips}</div>
    <div class="pill">{icon}{label}</div>
  </div>
  {items}
</div></body></html>"""


def cover_page(sizes):
    items = cluster(ADS["switch"]["items"], COVER["ppc"], COVER["ground"], COVER["cx"], sizes)
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{COVER['w']}px;height:{COVER['h']}px;overflow:hidden;font-family:{FONT}}}
.c{{position:relative;width:{COVER['w']}px;height:{COVER['h']}px;direction:rtl;
  background:radial-gradient(60% 80% at 38% 45%,#fff 0%,#F1F3F1 100%)}}
.panel{{position:absolute;right:270px;top:92px;width:560px;height:380px;border-radius:14px;
  background:linear-gradient(155deg,{GREEN_DARK} 0%,#245A41 60%,{GREEN_DARK} 100%);
  padding:40px 46px;display:flex;flex-direction:column;justify-content:center}}
.logo{{width:128px;margin-bottom:20px}}
.logo img{{width:100%;display:block}}
h1{{color:#fff;font-size:42px;line-height:1.2;font-weight:700}}
.sub{{color:{PASTEL};font-size:22px;margin-top:12px}}
.chips{{display:flex;gap:10px;margin-top:18px}}
.chip{{border:2px solid {PASTEL};color:#fff;font-size:18px;padding:4px 14px;border-radius:40px}}
{ITEM_CSS}
</style></head><body><div class="c">
  <div class="panel">
    <div class="logo"><img src="{data_uri(LOGO)}"></div>
    <h1>ספק לעסקים ומוסדות במרכז</h1>
    <div class="sub">חד פעמי · נייר · ניקיון · ציוד משרדי</div>
    <div class="chips"><span class="chip">מעל 20 שנה</span><span class="chip">מיבנה ועד רעננה</span></div>
  </div>
  {items}
</div></body></html>"""


def profile_page():
    # Facebook crops the profile picture to a circle; at 470px wide the logo's corners
    # stay ~276px from the centre, well inside the 360px radius.
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0}}
html,body{{width:720px;height:720px;overflow:hidden;background:#fff}}
.c{{width:720px;height:720px;display:flex;align-items:center;justify-content:center}}
.c img{{width:470px;display:block}}
</style></head><body><div class="c"><img src="{data_uri(LOGO)}"></div></body></html>"""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {}
    for name, ad in ADS.items():
        for fmt in (("feed",) if name == "brand" else ("feed", "story")):
            f = FORMATS[fmt]
            sizes = {}
            html = ad_page(f, ad, cluster(ad["items"], f["ppc"], f["ground"], f["cx"], sizes))
            out = OUT / f"{name}_{fmt}.png"
            render(html, out, f["w"], f["h"])
            report[out.name] = sizes
            print(f"{out.name:20s} {f['w']}x{f['h']}")
    sizes = {}
    render(cover_page(sizes), OUT / "cover.png", COVER["w"], COVER["h"])
    report["cover.png"] = sizes
    print(f"{'cover.png':20s} {COVER['w']}x{COVER['h']}")
    render(profile_page(), OUT / "profile.png", 720, 720)
    report["profile.png"] = {}
    print(f"{'profile.png':20s} 720x720")
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: לרנדר ולהריץ את הבדיקה**

Run: `python3 marketing/ads/src/meta.py && python3 marketing/ads/src/verify_meta.py`
Expected: 9 שורות מ-`meta.py`, ומ-`verify_meta.py` בסוף `ALL CHECKS PASSED` ו-`wrote .../_meta_contact_sheet.png`.

אם `story ... top 250px` נכשל — התוכן בפאנל ארוך מדי וגולש למעלה: להקטין את `h1`/`sub` בפורמט `story` ב-2px ולחזור על Step 4. אם `cover.png: logo inside` נכשל — להקטין את `COVER["cx"]` או את `width` של הפאנל.

- [ ] **Step 5: בדיקה בעין — לפני שמראים לרועי**

לפתוח את `marketing/ads/src/out/_meta_contact_sheet.png` ואת כל אחד מתשעת הקבצים ב-`marketing/meta/img/` (כלי Read). רשימת בדיקה:
- העברית נכונה ומימין לשמאל, שום שורה לא נחתכת, וה-`h1` בפיד בשורה אחת.
- המוצרים עומדים על הרצפה עם צל, לא מרחפים ולא נוגעים בפאנל הירוק. אם הקבוצה צפופה או צדדית — לשנות את ה-`dx` ב-`ADS` ולחזור על Step 4.
- בתמונות אין אריזה עם מיתוג של יצרן (כולל `rolls`, `rolls2`, `cup_paper`, `cold` מסט אוגוסט).
- בכיסוי, הפאנל והמוצרים לא חופפים זה לזה.

- [ ] **Step 6: אישור של רועי**

לשלוח לרועי את 3 תמונות הפיד, תמונת סטורי אחת, הכיסוי ותמונת הפרופיל (`SendUserFile`, `display: "render"`), ולשאול ב-`AskUserQuestion` אם התמונות מאושרות או מה לשנות. לציין במשפט אחד שהעיצוב הוא של מודעות אוגוסט (הירוק של האתר), ושאם הוא מעדיף את סגנון "חם וחגיגי" של מודעות החג — אפשר. לתקן לפי ההערות ולחזור על Steps 4–6 עד אישור.

- [ ] **Step 7: Commit**

```bash
git add marketing/ads/src/meta.py marketing/ads/src/verify_meta.py marketing/meta/img/
git commit -m "$(cat <<'EOF'
קמפיין מטא: 3 מודעות בשני גדלים, כיסוי, פרופיל ותמונת פוסט פתיחה

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: מדריך ההקמה לרועי

**Files:**
- Create: `marketing/meta/check_guide.py`
- Create: `marketing/meta/guide.html`
- Modify: `CLAUDE.md` (סבב 72)

**Interfaces:**
- Consumes: תשעת הקבצים ב-`marketing/meta/img/` ממשימה 3, בשמות האלה בדיוק.
- Produces: `marketing/meta/guide.html` שמפנה לתמונות בנתיב `img/<שם>.png` — כך שאותו קובץ עובד גם מקומית וגם כשמפרסמים אותו כקישור פרטי.

- [ ] **Step 1: לכתוב את הבדיקה**

`marketing/meta/check_guide.py`:

```python
"""The guide must carry every text Roei pastes - verbatim - and every image it names."""
import html
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
GUIDE = HERE / "guide.html"

REQUIRED = [
    # ads: primary text, headline, prefilled message (spec ad table, verbatim)
    "מזמינים חד פעמי, נייר וחומרי ניקוי לעסק? שלחו לנו בוואטסאפ צילום של ההזמנה או החשבונית האחרונה, ונחזיר הצעה מתחרה על אותם מוצרים. אהרוני שיווק והפצה — מעל 20 שנה ספק לעסקים ומוסדות במרכז.",
    "נייר טואלט ומגבות, קפה ותה, חומרי ניקוי וציוד משרדי — הזמנה אחת מספק אחד. אספקה למשרדים מיבנה ועד רעננה. שלחו הודעה ונחזור עם הצעת מחיר.",
    "גלילי נייר תעשייתי, שקיות אשפה, כפפות ניטריל, סבון ידיים וחומרי ניקוי בגדלים מוסדיים — מספק אחד, באספקה קבועה. מעל 20 שנה מול עסקים במרכז. שלחו הודעה עם מה שאתם צריכים ונחזור עם הצעה.",
    "הצעה מתחרה על ההזמנה הקבועה שלכם",
    "ספק אחד לכל המשרד",
    "ספק קבוע למפעל ולמחסן",
    "שלום, אנחנו עובדים עם ספק אחר ורוצים הצעה מתחרה. מצרפים צילום של ההזמנה האחרונה:",
    "שלום, אשמח להצעת מחיר לציוד למשרד.",
    "שלום, אשמח להצעת מחיר למפעל / מחסן.",
    # WhatsApp Business (spec + plan)
    "ספק סיטונאי לעסקים ומוסדות במרכז: חד פעמי ואריזות, מוצרי נייר, חומרי ניקוי וציוד משרדי. מעל 20 שנה. אספקה מיבנה ועד רעננה.",
    "שלום, תודה שפניתם לאהרוני שיווק והפצה. כדי שנכין הצעה מדויקת, כתבו לנו: 1. שם העסק והעיר 2. מה אתם מזמינים בדרך כלל — או פשוט צילום של ההזמנה האחרונה",
    "שלום, קיבלנו את ההודעה ונחזור אליכם בשעות הפעילות.",
    "כדי שנכין הצעה מדויקת: שם העסק, העיר, ומה אתם מזמינים בדרך כלל — אפשר פשוט צילום של ההזמנה האחרונה.",
    "אנחנו מספקים לעסקים מיבנה ועד רעננה, כולל גוש דן ובקעת אונו.",
    "הקטלוג המלא שלנו: https://aroam.co.il/catalog/?utm_source=whatsapp&utm_medium=chat&utm_campaign=meta — אפשר לסמן מוצרים ולשלוח לנו את ההזמנה ישר לוואטסאפ.",
    "מצורפת הצעת המחיר. אם יש שאלה על מוצר או כמות — כתבו לנו כאן.",
    "/פרטים", "/אזור", "/קטלוג", "/הצעה",
    "פייסבוק", "לא עסקי", "נשלחה הצעה", "לקוח חדש",
    # Facebook Page (plan)
    "ספק סיטונאי לעסקים ומוסדות במרכז: חד פעמי, נייר, ניקיון וציוד משרדי. מעל 20 שנה.",
    "אהרוני שיווק והפצה — מעל 20 שנה ספק לעסקים ומוסדות במרכז. חד פעמי ואריזות, מוצרי נייר, חומרי ניקוי וציוד משרדי, מספק אחד. אספקה מיבנה ועד רעננה. הקטלוג המלא: aroam.co.il",
    "למשרדים: נייר טואלט ומגבות, קפה ותה, חומרי ניקוי וציוד משרדי — הזמנה אחת מספק אחד. שלחו לנו הודעה בוואטסאפ ונחזור עם הצעת מחיר: 052-6000158",
    "למפעלים ומחסנים: גלילי נייר תעשייתי, שקיות אשפה, כפפות ניטריל וחומרי ניקוי בגדלים מוסדיים — באספקה קבועה. שלחו הודעה עם מה שאתם צריכים: 052-6000158",
    "כבר עובדים עם ספק אחר? שלחו לנו בוואטסאפ צילום של ההזמנה או החשבונית האחרונה, ונחזיר הצעה מתחרה על אותם מוצרים. 052-6000158",
    # campaign settings (spec)
    "מעורבות (Engagement)", "Maximize number of conversations", "₪50", "אור יהודה + 20 ק\"מ",
    "25–65", "059291906",
]
IMAGES = ["switch_feed.png", "switch_story.png", "office_feed.png", "office_story.png",
          "factory_feed.png", "factory_story.png", "brand_feed.png", "cover.png", "profile.png"]

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


check(GUIDE.exists(), "guide.html exists")
if GUIDE.exists():
    src = GUIDE.read_text(encoding="utf-8")
    text = norm(html.unescape(re.sub(r"<[^>]+>", " ", src)))
    for s in REQUIRED:
        check(norm(s) in text, f"text: {s[:48]}")
    for img in IMAGES:
        check(f'src="img/{img}"' in src, f"guide shows img/{img}")
        check((HERE / "img" / img).exists(), f"img/{img} exists on disk")
    for ref in re.findall(r'src="(img/[^"]+)"', src):
        check((HERE / ref).exists(), f"{ref} resolves")

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILURES"))
sys.exit(1 if fails else 0)
```

- [ ] **Step 2: להריץ ולוודא שהיא נכשלת**

Run: `python3 marketing/meta/check_guide.py`
Expected: `FAIL guide.html exists`, בסוף `1 FAILURES`.

- [ ] **Step 3: לטעון את חוזה העמוד**

לפני כתיבת ה-HTML: `Artifact` עם `action: "quickstart"`, `intent: "other"` — זה טוען את הנחיות העיצוב לעמודים. אם ההנחיות דורשות משהו שהקובץ שלמטה לא עושה — לתקן את הקובץ בהתאם, בלי לשנות אף טקסט שמופיע ב-`REQUIRED`.

- [ ] **Step 4: לכתוב את המדריך**

`marketing/meta/guide.html`:

```html
<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>מדריך קמפיין וואטסאפ</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #F4F8F5; --card: #FFFFFF; --text: #1F2A24; --muted: #56665D; --line: #D9E6DE;
  --head: #1A4231; --chip-bg: #EAF3EE; --code-bg: #F1F6F3;
  --btn-bg: #1A4231; --btn-text: #FFFFFF; --warn: #9A5B13; --warn-bg: #FBF3E8;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0F1A15; --card: #17241D; --text: #E6EEE9; --muted: #A3B5AA; --line: #2A3D33;
    --head: #8FD6A3; --chip-bg: #1A4231; --code-bg: #1F3027;
    --btn-bg: #8FD6A3; --btn-text: #0F1A15; --warn: #E3A55E; --warn-bg: #2B2216;
  }
}
:root[data-theme="dark"] {
  --bg: #0F1A15; --card: #17241D; --text: #E6EEE9; --muted: #A3B5AA; --line: #2A3D33;
  --head: #8FD6A3; --chip-bg: #1A4231; --code-bg: #1F3027;
  --btn-bg: #8FD6A3; --btn-text: #0F1A15; --warn: #E3A55E; --warn-bg: #2B2216;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text);
  font-family: "Assistant", "Heebo", -apple-system, sans-serif; font-size: 17px; line-height: 1.6; }
.wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; line-height: 1.25; margin: 0 0 8px; color: var(--head); }
h2 { font-size: 22px; line-height: 1.3; margin: 0 0 10px; color: var(--head); }
h3 { font-size: 18px; margin: 22px 0 6px; }
p { margin: 8px 0; }
.lead { color: var(--muted); }
.step { background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  padding: 20px; margin-top: 18px; }
.num { display: inline-block; background: var(--chip-bg); color: var(--head); font-weight: 700;
  font-size: 14px; border-radius: 20px; padding: 2px 12px; margin-bottom: 8px; }
ol, ul { padding-inline-start: 22px; margin: 8px 0; }
li { margin: 5px 0; }
code { background: var(--code-bg); border-radius: 4px; padding: 1px 6px; font-size: 15px; direction: ltr; unicode-bidi: embed; }
.copy { border: 1px solid var(--line); border-radius: 8px; background: var(--code-bg); margin: 10px 0; }
.copy-head { display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 8px 12px; border-bottom: 1px solid var(--line); }
.copy-label { font-weight: 700; font-size: 14px; color: var(--muted); }
.copy-btn { font: inherit; font-size: 14px; font-weight: 700; color: var(--btn-text); background: var(--btn-bg);
  border: 0; border-radius: 6px; padding: 6px 14px; cursor: pointer; min-height: 36px; }
.copy-text { margin: 0; padding: 12px; white-space: pre-wrap; word-break: break-word;
  font-family: inherit; font-size: 16px; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 15px; }
th, td { text-align: start; padding: 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 700; }
.imgs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }
.imgs.three { grid-template-columns: 1fr 1fr 1fr; }
.imgs figure { margin: 0; }
.imgs img { width: 100%; height: auto; display: block; border-radius: 6px; border: 1px solid var(--line); }
.imgs figcaption { font-size: 14px; color: var(--muted); margin-top: 4px; }
.imgs a { color: var(--head); }
.note { background: var(--chip-bg); border-radius: 8px; padding: 10px 14px; margin: 12px 0; }
.warn { background: var(--warn-bg); border-inline-start: 4px solid var(--warn); border-radius: 8px;
  padding: 10px 14px; margin: 12px 0; }
.check li { list-style: none; position: relative; }
.check li::before { content: ""; position: absolute; inset-inline-start: -22px; top: 6px; width: 12px; height: 12px;
  border: 2px solid var(--head); border-radius: 3px; }
@media (max-width: 560px) {
  .imgs.three { grid-template-columns: 1fr 1fr; }
  h1 { font-size: 24px; }
}
</style>
</head>
<body>
<main class="wrap">

<header>
  <h1>מדריך הקמה: קמפיין וואטסאפ בפייסבוק</h1>
  <p class="lead">כל השלבים לפי הסדר. ליד כל טקסט שמדביקים יש כפתור העתקה, ולחיצה על תמונה מורידה אותה.</p>
  <div class="table-wrap"><table>
    <tr><th>ימים</th><th>מה עושים</th></tr>
    <tr><td>1–3</td><td>שלב 1 (וואטסאפ ביזנס) ושלב 2 (דף עסקי)</td></tr>
    <tr><td>3–5</td><td>שלב 3 (חיבור הוואטסאפ), פרסום 4 הפוסטים, שלב 4 (חשבון מודעות ואימות העסק)</td></tr>
    <tr><td>5–7</td><td>שלב 5 (הקמת הקמפיין) ושלב 6 (בדיקה) — ואז הפעלה</td></tr>
    <tr><td>7–35</td><td>שלב 7: 28 ימי ריצה וספירה שבועית</td></tr>
  </table></div>
</header>

<section class="step" id="whatsapp">
  <span class="num">שלב 1 · בטלפון</span>
  <h2>WhatsApp Business</h2>
  <ol>
    <li>להוריד את WhatsApp Business מחנות האפליקציות.</li>
    <li>להיכנס עם אותו מספר — 052-6000158. כשהאפליקציה מציעה להעביר את השיחות מהוואטסאפ הרגיל — לאשר.</li>
    <li>פרופיל עסקי (הגדרות ← כלים לעסקים ← פרופיל עסקי): שם <b>אהרוני שיווק והפצה</b> · קטגוריה: הקרובה ביותר לסיטונאות או אספקה לעסקים · כתובת היצירה 16, אור יהודה · שעות א׳–ה׳ 08:00–17:00 · מייל meiraroam@gmail.com · אתר https://aroam.co.il · תמונת פרופיל <code>profile.png</code> (בשלב 2).</li>
  </ol>
  <div class="copy"><div class="copy-head"><span class="copy-label">תיאור העסק</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">ספק סיטונאי לעסקים ומוסדות במרכז: חד פעמי ואריזות, מוצרי נייר, חומרי ניקוי וציוד משרדי. מעל 20 שנה. אספקה מיבנה ועד רעננה.</pre></div>

  <h3>הודעת פתיחה</h3>
  <p>כלים לעסקים ← הודעת פתיחה ← להפעיל, נמענים: כולם.</p>
  <div class="copy"><div class="copy-head"><span class="copy-label">הודעת פתיחה</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">שלום, תודה שפניתם לאהרוני שיווק והפצה.
כדי שנכין הצעה מדויקת, כתבו לנו:
1. שם העסק והעיר
2. מה אתם מזמינים בדרך כלל — או פשוט צילום של ההזמנה האחרונה</pre></div>

  <h3>הודעת היעדרות</h3>
  <p>כלים לעסקים ← הודעת היעדרות ← להפעיל, תזמון: מחוץ לשעות הפעילות.</p>
  <div class="copy"><div class="copy-head"><span class="copy-label">הודעת היעדרות</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">שלום, קיבלנו את ההודעה ונחזור אליכם בשעות הפעילות.</pre></div>

  <h3>תשובות מהירות</h3>
  <p>כלים לעסקים ← תשובות מהירות ← הוספה. הקיצור הוא מה שמקלידים בשיחה כדי לשלוף את התשובה.</p>
  <div class="copy"><div class="copy-head"><span class="copy-label">קיצור /פרטים</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">כדי שנכין הצעה מדויקת: שם העסק, העיר, ומה אתם מזמינים בדרך כלל — אפשר פשוט צילום של ההזמנה האחרונה.</pre></div>
  <div class="copy"><div class="copy-head"><span class="copy-label">קיצור /אזור</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">אנחנו מספקים לעסקים מיבנה ועד רעננה, כולל גוש דן ובקעת אונו.</pre></div>
  <div class="copy"><div class="copy-head"><span class="copy-label">קיצור /קטלוג</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">הקטלוג המלא שלנו: https://aroam.co.il/catalog/?utm_source=whatsapp&amp;utm_medium=chat&amp;utm_campaign=meta — אפשר לסמן מוצרים ולשלוח לנו את ההזמנה ישר לוואטסאפ.</pre></div>
  <div class="copy"><div class="copy-head"><span class="copy-label">קיצור /הצעה</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">מצורפת הצעת המחיר. אם יש שאלה על מוצר או כמות — כתבו לנו כאן.</pre></div>

  <h3>תוויות</h3>
  <p>ליצור ארבע תוויות: <b>פייסבוק</b> · <b>לא עסקי</b> · <b>נשלחה הצעה</b> · <b>לקוח חדש</b>. כל שיחה שמגיעה מהמודעות מקבלת "פייסבוק", ובהמשך את התווית של השלב שהגיעה אליו.</p>
</section>

<section class="step" id="page">
  <span class="num">שלב 2 · מחשב או טלפון</span>
  <h2>דף עסקי בפייסבוק</h2>
  <ol>
    <li>מהפרופיל האישי: תפריט ← דפים ← יצירת דף חדש.</li>
    <li>שם הדף: <b>אהרוני שיווק והפצה</b>. קטגוריה: להקליד "סיטונאי" או "Wholesale" ולבחור את הקרובה ביותר.</li>
    <li>פרטי קשר: אתר https://aroam.co.il · טלפון 052-6000158 · מייל meiraroam@gmail.com · כתובת היצירה 16, אור יהודה · שעות א׳–ה׳ 08:00–17:00.</li>
    <li>תמונת פרופיל ותמונת כיסוי:</li>
  </ol>
  <div class="imgs">
    <figure><a href="img/profile.png" download><img src="img/profile.png" alt="תמונת פרופיל: הלוגו" loading="lazy"></a><figcaption>תמונת פרופיל</figcaption></figure>
    <figure><a href="img/cover.png" download><img src="img/cover.png" alt="תמונת כיסוי לדף" loading="lazy"></a><figcaption>תמונת כיסוי</figcaption></figure>
  </div>
  <div class="copy"><div class="copy-head"><span class="copy-label">ביו (שורת התיאור הקצרה)</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">ספק סיטונאי לעסקים ומוסדות במרכז: חד פעמי, נייר, ניקיון וציוד משרדי. מעל 20 שנה.</pre></div>

  <h3>ארבעה פוסטים ראשונים</h3>
  <p>לפרסם את כולם <b>לפני</b> שהמודעות עולות — בעל עסק שנכנס לבדוק את הדף לא ימצא דף ריק.</p>
  <div class="imgs three">
    <figure><a href="img/brand_feed.png" download><img src="img/brand_feed.png" alt="פוסט 1: מי אנחנו" loading="lazy"></a><figcaption>פוסט 1</figcaption></figure>
    <figure><a href="img/office_feed.png" download><img src="img/office_feed.png" alt="פוסט 2: למשרדים" loading="lazy"></a><figcaption>פוסט 2</figcaption></figure>
    <figure><a href="img/factory_feed.png" download><img src="img/factory_feed.png" alt="פוסט 3: למפעלים ומחסנים" loading="lazy"></a><figcaption>פוסט 3</figcaption></figure>
    <figure><a href="img/switch_feed.png" download><img src="img/switch_feed.png" alt="פוסט 4: כבר עובדים עם ספק?" loading="lazy"></a><figcaption>פוסט 4</figcaption></figure>
  </div>
  <div class="copy"><div class="copy-head"><span class="copy-label">פוסט 1 — מי אנחנו</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">אהרוני שיווק והפצה — מעל 20 שנה ספק לעסקים ומוסדות במרכז. חד פעמי ואריזות, מוצרי נייר, חומרי ניקוי וציוד משרדי, מספק אחד. אספקה מיבנה ועד רעננה. הקטלוג המלא: aroam.co.il</pre></div>
  <div class="copy"><div class="copy-head"><span class="copy-label">פוסט 2 — למשרדים</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">למשרדים: נייר טואלט ומגבות, קפה ותה, חומרי ניקוי וציוד משרדי — הזמנה אחת מספק אחד. שלחו לנו הודעה בוואטסאפ ונחזור עם הצעת מחיר: 052-6000158</pre></div>
  <div class="copy"><div class="copy-head"><span class="copy-label">פוסט 3 — למפעלים ומחסנים</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">למפעלים ומחסנים: גלילי נייר תעשייתי, שקיות אשפה, כפפות ניטריל וחומרי ניקוי בגדלים מוסדיים — באספקה קבועה. שלחו הודעה עם מה שאתם צריכים: 052-6000158</pre></div>
  <div class="copy"><div class="copy-head"><span class="copy-label">פוסט 4 — כבר עובדים עם ספק?</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">כבר עובדים עם ספק אחר? שלחו לנו בוואטסאפ צילום של ההזמנה או החשבונית האחרונה, ונחזיר הצעה מתחרה על אותם מוצרים. 052-6000158</pre></div>
</section>

<section class="step" id="link">
  <span class="num">שלב 3</span>
  <h2>חיבור הוואטסאפ לדף</h2>
  <p>הגדרות הדף ← חשבונות מקושרים (Linked accounts) ← WhatsApp ← להקליד 052-6000158 ← שליחת קוד. הקוד מגיע לוואטסאפ ביזנס — להזין אותו.</p>
</section>

<section class="step" id="account">
  <span class="num">שלב 4 · במחשב</span>
  <h2>חשבון מודעות</h2>
  <ol>
    <li>להיכנס ל-business.facebook.com. ה-Business Manager "אהרוני שיווק והפצה" <b>כבר קיים</b> — לא לפתוח חדש.</li>
    <li>הגדרות העסק ← חשבונות ← דפים ← הוספה ← לבחור את הדף החדש.</li>
    <li>הגדרות העסק ← חשבונות ← חשבונות מודעות ← הוספה ← יצירת חשבון מודעות חדש. שם: "אהרוני — מודעות". <b>אזור זמן: ירושלים. מטבע: שקל חדש (ILS).</b></li>
    <li>אמצעי תשלום: כרטיס אשראי.</li>
    <li>אימות דו-שלבי בפרופיל האישי: הגדרות ← אבטחה וכניסה ← אימות דו-שלבי.</li>
    <li>אימות העסק: הגדרות העסק ← מרכז האבטחה ← התחלת אימות, עם תעודת עוסק מורשה 059291906.</li>
  </ol>
  <div class="warn"><b>אזור הזמן והמטבע לא ניתנים לשינוי אחר כך.</b> ואם משהו נחסם — מערערים מתוך מטא, לא פותחים חשבון נוסף. זה הלקח מגוגל.</div>
</section>

<section class="step" id="campaign">
  <span class="num">שלב 5 · Ads Manager</span>
  <h2>הקמת הקמפיין</h2>
  <p>שמות הכפתורים בממשק של מטא משתנים מדי פעם. אם משהו לא מופיע בדיוק כך — לחפש את המשמעות.</p>
  <div class="table-wrap"><table>
    <tr><th>רמה</th><th>הגדרה</th></tr>
    <tr><td>קמפיין</td><td>יעד: מעורבות (Engagement)</td></tr>
    <tr><td>קבוצת מודעות</td><td>מיקום ההמרה: אפליקציות הודעות (Messaging apps) ← WhatsApp · יעד ביצועים: מקסימום שיחות (Maximize number of conversations)</td></tr>
    <tr><td></td><td>תקציב יומי ₪50 · רץ כל הזמן, בלי תזמון שעות</td></tr>
    <tr><td></td><td>מיקום: אור יהודה + 20 ק"מ · גיל 25–65 · כל המגדרים · בלי תחומי עניין · בלי סינון שפה</td></tr>
    <tr><td></td><td>מיקומי הצגה: אוטומטיים (פייסבוק ואינסטגרם, פיד וסטורי)</td></tr>
    <tr><td>מודעה</td><td>זהות: דף הפייסבוק · יעד: WhatsApp 052-6000158 · הודעה מוכנה — לפי המודעה, למטה</td></tr>
  </table></div>

  <h3>מודעה 1 — ספק אחר</h3>
  <div class="imgs">
    <figure><a href="img/switch_feed.png" download><img src="img/switch_feed.png" alt="מודעה 1, פיד" loading="lazy"></a><figcaption>פיד 4:5</figcaption></figure>
    <figure><a href="img/switch_story.png" download><img src="img/switch_story.png" alt="מודעה 1, סטורי" loading="lazy"></a><figcaption>סטורי 9:16</figcaption></figure>
  </div>
  <div class="copy"><div class="copy-head"><span class="copy-label">טקסט ראשי</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">מזמינים חד פעמי, נייר וחומרי ניקוי לעסק? שלחו לנו בוואטסאפ צילום של ההזמנה או החשבונית האחרונה, ונחזיר הצעה מתחרה על אותם מוצרים. אהרוני שיווק והפצה — מעל 20 שנה ספק לעסקים ומוסדות במרכז.</pre></div>
  <div class="copy"><div class="copy-head"><span class="copy-label">כותרת מתחת לתמונה</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">הצעה מתחרה על ההזמנה הקבועה שלכם</pre></div>
  <div class="copy"><div class="copy-head"><span class="copy-label">הודעה מוכנה ללקוח</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">שלום, אנחנו עובדים עם ספק אחר ורוצים הצעה מתחרה. מצרפים צילום של ההזמנה האחרונה:</pre></div>

  <h3>מודעה 2 — משרדים</h3>
  <div class="imgs">
    <figure><a href="img/office_feed.png" download><img src="img/office_feed.png" alt="מודעה 2, פיד" loading="lazy"></a><figcaption>פיד 4:5</figcaption></figure>
    <figure><a href="img/office_story.png" download><img src="img/office_story.png" alt="מודעה 2, סטורי" loading="lazy"></a><figcaption>סטורי 9:16</figcaption></figure>
  </div>
  <div class="copy"><div class="copy-head"><span class="copy-label">טקסט ראשי</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">נייר טואלט ומגבות, קפה ותה, חומרי ניקוי וציוד משרדי — הזמנה אחת מספק אחד. אספקה למשרדים מיבנה ועד רעננה. שלחו הודעה ונחזור עם הצעת מחיר.</pre></div>
  <div class="copy"><div class="copy-head"><span class="copy-label">כותרת מתחת לתמונה</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">ספק אחד לכל המשרד</pre></div>
  <div class="copy"><div class="copy-head"><span class="copy-label">הודעה מוכנה ללקוח</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">שלום, אשמח להצעת מחיר לציוד למשרד.</pre></div>

  <h3>מודעה 3 — מפעלים ומחסנים</h3>
  <div class="imgs">
    <figure><a href="img/factory_feed.png" download><img src="img/factory_feed.png" alt="מודעה 3, פיד" loading="lazy"></a><figcaption>פיד 4:5</figcaption></figure>
    <figure><a href="img/factory_story.png" download><img src="img/factory_story.png" alt="מודעה 3, סטורי" loading="lazy"></a><figcaption>סטורי 9:16</figcaption></figure>
  </div>
  <div class="copy"><div class="copy-head"><span class="copy-label">טקסט ראשי</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">גלילי נייר תעשייתי, שקיות אשפה, כפפות ניטריל, סבון ידיים וחומרי ניקוי בגדלים מוסדיים — מספק אחד, באספקה קבועה. מעל 20 שנה מול עסקים במרכז. שלחו הודעה עם מה שאתם צריכים ונחזור עם הצעה.</pre></div>
  <div class="copy"><div class="copy-head"><span class="copy-label">כותרת מתחת לתמונה</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">ספק קבוע למפעל ולמחסן</pre></div>
  <div class="copy"><div class="copy-head"><span class="copy-label">הודעה מוכנה ללקוח</span><button type="button" class="copy-btn" data-copy-btn>העתקה</button></div>
<pre class="copy-text">שלום, אשמח להצעת מחיר למפעל / מחסן.</pre></div>
</section>

<section class="step" id="test">
  <span class="num">שלב 6</span>
  <h2>בדיקה לפני עלייה</h2>
  <p>לפתוח כל מודעה בתצוגה המקדימה, ללחוץ עליה, ולוודא:</p>
  <ul class="check">
    <li>הוואטסאפ נפתח עם ההודעה המוכנה של אותה מודעה.</li>
    <li>הודעת הפתיחה מגיעה <b>פעם אחת</b>. העדיפות להודעת הפתיחה של האפליקציה; אם תבנית ההודעה של המודעה מחייבת ברכה — לכבות את הודעת הפתיחה באפליקציה ולהעביר את הנוסח שלה לתבנית.</li>
    <li>אפשר לסמן את השיחה בתווית "פייסבוק".</li>
  </ul>
</section>

<section class="step" id="measure">
  <span class="num">שלב 7 · 28 ימים</span>
  <h2>מדידה ושערי החלטה</h2>
  <p>פעם בשבוע (10 דקות) סופרים לפי התוויות: שיחות עסקיות · הצעות שנשלחו · לקוחות חדשים.</p>
  <p>בשבוע הראשון לא משנים תקציב או הגדרות: כל שינוי מחזיר את מטא לשלב הלמידה, ושינויים תכופים בחשבון חדש מגדילים את הסיכוי לחסימה.</p>
  <div class="table-wrap"><table>
    <tr><th>מתי</th><th>מה בודקים</th><th>מה עושים</th></tr>
    <tr><td>יום 3</td><td>אין אף שיחה</td><td>בודקים את ההגדרות (חיבור הוואטסאפ, אישור המודעות), לא את המודעות</td></tr>
    <tr><td>יום 7</td><td>מודעה שמביאה בעיקר פניות לא עסקיות</td><td>עוצרים אותה</td></tr>
    <tr><td>יום 28 (₪1,400)</td><td>לפחות לקוח חדש אחד, או לפחות 5 הצעות שנשלחו לעסקים רלוונטיים</td><td>ממשיכים לחודש שני: משאירים את המודעה המנצחת ומחליפים את החלשות</td></tr>
    <tr><td>יום 28</td><td>אף לקוח ופחות מ-5 הצעות</td><td>בודקים איפה זה נתקע: מעט שיחות עסקיות ← המודעה או ההצעה · שיחות בלי הצעות ← הסינון · הצעות בלי הזמנות ← המחיר</td></tr>
  </table></div>
  <div class="note">כשהדף בפייסבוק מוכן — לשלוח את הכתובת שלו לClaude, כדי להוסיף קישור אליו באתר.</div>
</section>

</main>
<script>
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy-btn]');
  if (!btn) return;
  const text = btn.closest('.copy').querySelector('.copy-text').innerText.trim();
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  btn.textContent = 'הועתק';
  setTimeout(() => { btn.textContent = 'העתקה'; }, 1500);
});
</script>
</body>
</html>
```

- [ ] **Step 5: להריץ את הבדיקה ולוודא שהיא עוברת**

Run: `python3 marketing/meta/check_guide.py`
Expected: `ALL CHECKS PASSED`.

- [ ] **Step 6: בדיקה בדפדפן**

`preview_start` עם `name: "aroam-site"` (פורט 8085), ואז לנווט ל-`http://localhost:8085/marketing/meta/guide.html`:
- `read_console_messages` — אפס שגיאות; כל 12 התמונות נטענות (`javascript_tool`: `[...document.images].every(i => i.complete && i.naturalWidth > 0)` ⇒ `true`).
- `resize_window` ל-`mobile` — אין גלילה אופקית (`document.documentElement.scrollWidth <= innerWidth` ⇒ `true`), והתמונות בשתי עמודות.
- מצב כהה: `resize_window` עם `colorScheme: "dark"` — הטקסט קריא והכפתורים בפסטל עם טקסט כהה.
- לחיצה על כפתור העתקה אחד ⇒ הכיתוב מתחלף ל"הועתק" וחוזר אחרי שנייה וחצי.
- בסוף: `resize_window` ל-`desktop`.

- [ ] **Step 7: לשאול את רועי על קישור פרטי**

ב-`AskUserQuestion`: לפרסם את המדריך כקישור פרטי ב-claude.ai (כך שאפשר לפתוח אותו בטלפון בזמן ההקמה של הוואטסאפ), או להשאיר אותו כקובץ במחשב בלבד. **רק אם רועי מאשר:** `Artifact` עם `file_path: "marketing/meta/guide.html"`, `icon: "checklist"`, `description: "מדריך הקמה לקמפיין מודעות שפותחות וואטסאפ"`, ו-`files` שממפה כל `img/<שם>.png` אל `marketing/meta/img/<שם>.png` (9 קבצים).

- [ ] **Step 8: לעדכן את `CLAUDE.md` ו-Commit**

בסוף סעיף 72 ב-`CLAUDE.md` להוסיף (עם תאריך הביצוע בפורמט של הקובץ, למשל 23.10.26): `**ביצוע:** נבנו ב-marketing/meta/ — 3 מודעות בפיד ובסטורי, כיסוי, פרופיל ותמונת פוסט פתיחה (צינור המודעות: marketing/ads/src/meta.py + verify_meta.py, ארבעה מוצרים בלי מיתוג כולל גליל ה-GOLD של אהרוני), ומדריך הקמה marketing/meta/guide.html` — ואם פורסם, את הקישור.

```bash
git add marketing/meta/check_guide.py marketing/meta/guide.html CLAUDE.md
git commit -m "$(cat <<'EOF'
קמפיין מטא: מדריך הקמה לרועי עם כל הטקסטים והתמונות

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: קישור לדף הפייסבוק באתר — אחרי שרועי שולח את הכתובת

**ממתין לרועי:** המשימה מתחילה רק כשרועי שולח את כתובת הדף (בצורה `https://www.facebook.com/<שם או מזהה>`). בכל הצעדים למטה `FB_URL` הוא הכתובת הזו בדיוק, כפי שרועי שלח אותה.

**Files:**
- Create: `tools/check_fb_link.py`
- Modify: `js/components.js` (העמודה "צור קשר" בפוטר, ~שורה 141–149)
- Modify: `index.html` (`sameAs`, ~שורה 93), `contact/index.html` (~שורה 110), `about/index.html` (~שורה 65)
- Modify: `CLAUDE.md` (סבב 72)

**Interfaces:**
- Consumes: הכתובת מרועי.
- Produces: קישור בפוטר וכתובת ב-`sameAs` של שלוש סכמות העסק.

- [ ] **Step 1: לכתוב את הבדיקה**

`tools/check_fb_link.py`:

```python
"""After the Facebook Page exists: the footer and the three business schemas point to it.

Usage: python3 tools/check_fb_link.py https://www.facebook.com/<page>
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = sys.argv[1]
fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def same_as(node):
    """Every sameAs list anywhere in a JSON-LD tree."""
    if isinstance(node, dict):
        if isinstance(node.get("sameAs"), list):
            yield node["sameAs"]
        for v in node.values():
            yield from same_as(v)
    elif isinstance(node, list):
        for v in node:
            yield from same_as(v)


footer = (ROOT / "js" / "components.js").read_text(encoding="utf-8")
check(f'href="{URL}"' in footer, "footer links to the Page")
for page in ("index.html", "contact/index.html", "about/index.html"):
    src = (ROOT / page).read_text(encoding="utf-8")
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', src, re.S)
    lists = [lst for b in blocks for lst in same_as(json.loads(b))]
    check(any(URL in lst for lst in lists), f"{page}: sameAs includes the Page")

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILURES"))
sys.exit(1 if fails else 0)
```

- [ ] **Step 2: להריץ ולוודא שהיא נכשלת**

Run: `python3 tools/check_fb_link.py "FB_URL"` (עם הכתובת של רועי)
Expected: `FAIL footer links to the Page` ושלושה `FAIL ... sameAs includes the Page`. בסוף `4 FAILURES`.

- [ ] **Step 3: הפוטר**

ב-`js/components.js` להחליף:

```
<a href="tel:036346236">03-6346236</a></li>
                            </ul>
```

ב (`FB_URL` = הכתובת של רועי):

```
<a href="tel:036346236">03-6346236</a></li>
                                <li><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px; margin-left:5px;" aria-hidden="true"><path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H7v4h2v7h4v-7h3l1-4h-4V9c0-.6.4-1 1-1z"/></svg><a href="FB_URL" target="_blank" rel="noopener">עמוד הפייסבוק שלנו</a></li>
                            </ul>
```

- [ ] **Step 4: `sameAs` בשלוש הסכמות**

ב-`index.html` וב-`contact/index.html` להחליף:

```
  "sameAs": [
    "https://www.google.com/maps?cid=4129322731402210334"
  ]
```

ב:

```
  "sameAs": [
    "https://www.google.com/maps?cid=4129322731402210334",
    "FB_URL"
  ]
```

וב-`about/index.html` (הזחה של 4 ו-6 רווחים) להחליף:

```
    "sameAs": [
      "https://www.google.com/maps?cid=4129322731402210334"
    ]
```

ב:

```
    "sameAs": [
      "https://www.google.com/maps?cid=4129322731402210334",
      "FB_URL"
    ]
```

- [ ] **Step 5: להריץ את הבדיקה ולוודא שהיא עוברת**

Run: `python3 tools/check_fb_link.py "FB_URL"`
Expected: `ALL CHECKS PASSED`.

- [ ] **Step 6: בדיקה בדפדפן**

`preview_start` עם `name: "aroam-site"`. **קודם לנקות service worker ו-caches** (`javascript_tool`: `(await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister()); for (const k of await caches.keys()) await caches.delete(k);` ואז רענון) — `components.js` נטען בלי פרמטר גרסה. לנווט ל-`http://localhost:8085/contact/`, ו-`find` על "עמוד הפייסבוק שלנו" ⇒ הקישור קיים ו-`href` שלו הוא `FB_URL`. אפס שגיאות ב-`read_console_messages`.

- [ ] **Step 7: לעדכן את `CLAUDE.md` ו-Commit**

בסוף סעיף 72: `**דף הפייסבוק:** FB_URL — נוסף לפוטר (components.js) ול-sameAs בדף הבית, /contact/ ו-/about/.`

```bash
git add tools/check_fb_link.py js/components.js index.html contact/index.html about/index.html CLAUDE.md
git commit -m "$(cat <<'EOF'
קישור לדף הפייסבוק בפוטר וב-sameAs של סכמות העסק

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

לומר לרועי: לדחוף ב-GitHub Desktop.
