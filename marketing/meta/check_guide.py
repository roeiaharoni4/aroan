"""The guide must carry every text Roei pastes - verbatim - and every image it names."""
import html
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
GUIDE = HERE / "guide.html"

# Facebook cuts a Page bio at 101 characters.
BIO = "ספק סיטונאי לעסקים ומוסדות במרכז: חד פעמי, נייר, ניקיון, שקיות וציוד משרדי. מעל 20 שנה."

REQUIRED = [
    # ads: primary text, headline, prefilled message (spec ad table; ad 1 is branded bags
    # since the owner turned down the "send your last order" offer, 23.10)
    "שקיות גופייה עם הלוגו של העסק, שקיות לפי מידה ועובי ושקיות אשפה — מספק אחד. אהרוני שיווק והפצה — מעל 20 שנה ספק לעסקים ומוסדות במרכז. שלחו הודעה ונחזור עם הצעת מחיר.",
    "נייר טואלט ומגבות, חד פעמי, חומרי ניקוי וציוד משרדי — הזמנה אחת מספק אחד. אספקה למשרדים מיבנה ועד רעננה. שלחו הודעה ונחזור עם הצעת מחיר.",
    "גלילי נייר תעשייתי, שקיות אשפה, כפפות ניטריל, סבון ידיים וחומרי ניקוי בגדלים מוסדיים — מספק אחד, באספקה קבועה. גם שקיות לפי מידה וממותגות. מעל 20 שנה מול עסקים במרכז. שלחו הודעה עם מה שאתם צריכים ונחזור עם הצעה.",
    "שקיות ממותגות ולפי מידה",
    "ספק אחד לכל המשרד",
    "ספק קבוע למפעל ולמחסן",
    "שלום, אשמח להצעת מחיר לשקיות ממותגות.",
    "שלום, אשמח להצעת מחיר לציוד למשרד.",
    "שלום, אשמח להצעת מחיר למפעל / מחסן.",
    # WhatsApp Business
    "ספק סיטונאי לעסקים ומוסדות במרכז: חד פעמי ואריזות, מוצרי נייר, חומרי ניקוי, שקיות וציוד משרדי. מעל 20 שנה. אספקה מיבנה ועד רעננה.",
    "שלום, תודה שפניתם לאהרוני שיווק והפצה. כדי שנכין הצעה מדויקת, כתבו לנו: 1. שם העסק והעיר 2. מה אתם מזמינים בדרך כלל — או פשוט צילום של ההזמנה האחרונה",
    "שלום, קיבלנו את ההודעה ונחזור אליכם בשעות הפעילות.",
    "כדי שנכין הצעה מדויקת: שם העסק, העיר, ומה אתם מזמינים בדרך כלל — אפשר פשוט צילום של ההזמנה האחרונה.",
    "אנחנו מספקים לעסקים מיבנה ועד רעננה, כולל גוש דן ובקעת אונו.",
    "הקטלוג המלא שלנו: https://aroam.co.il/catalog/?utm_source=whatsapp&utm_medium=chat&utm_campaign=meta — אפשר לסמן מוצרים ולשלוח לנו את ההזמנה ישר לוואטסאפ.",
    "מצורפת הצעת המחיר. אם יש שאלה על מוצר או כמות — כתבו לנו כאן.",
    "/פרטים", "/אזור", "/קטלוג", "/הצעה",
    "פייסבוק", "לא עסקי", "נשלחה הצעה", "לקוח חדש",
    # Facebook Page
    BIO,
    "אהרוני שיווק והפצה — מעל 20 שנה ספק לעסקים ומוסדות במרכז. חד פעמי ואריזות, מוצרי נייר, חומרי ניקוי, שקיות וציוד משרדי, מספק אחד. אספקה מיבנה ועד רעננה. הקטלוג המלא: aroam.co.il",
    "מוצרי נייר לעסקים: גליל תעשייתי 5012, גליל GOLD, נייר טואלט קומפקט וג׳מבו — באספקה קבועה לעסקים ולמוסדות, מיבנה ועד רעננה. להזמנות: 052-6000158",
    "ניקיון ותחזוקה לעסק: סנו ג׳ט, KH-7 של יעקבי, כפפות ניטריל ומגבונים בדלי — במידות מוסדיות. להזמנות: 052-6000158",
    "חד פעמי לעסקים: כוסות נייר, כוסות פלסטיק 500 מ״ל, צלחות מתכלות וסכו״ם קשיח — לחדר האוכל, למשרד ולאירועים. להזמנות: 052-6000158",
    # campaign settings (spec)
    "מעורבות (Engagement)", "Maximize number of conversations", "₪50", "אור יהודה + 20 ק\"מ",
    "25–65", "059291906",
]
IMAGES = ["bags_feed.png", "bags_story.png", "office_feed.png", "office_story.png",
          "factory_feed.png", "factory_story.png", "post_brand.png", "post_paper.png",
          "post_cleaning.png", "post_disposables.png", "cover.png", "profile.png"]

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


check(len(BIO) <= 101, f"page bio fits Facebook's 101 characters ({len(BIO)})")
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
