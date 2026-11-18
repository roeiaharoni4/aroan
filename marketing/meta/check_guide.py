"""The guide must carry every text Roei pastes - verbatim - and every image it names.\n\nIMAGES also says which file on disk each published path comes from - the publish uses it."""
import html
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
GUIDE = HERE / "guide.html"

# Facebook cuts a Page bio at 101 characters.
BIO = "ספק סיטונאי לעסקים ומוסדות במרכז: חד פעמי, נייר, ניקיון, שקיות וציוד משרדי. מעל 20 שנה."

REQUIRED = [
    # the five ads (17.11.26): primary text, headline, prefilled message - final_v2/TEXTS.md
    "משרד של 20 עובדים צורך בשנה בערך 480 גלילי נייר טואלט, 12,500 מגבות נייר ו-120 חבילות נייר צילום — ועוד כוסות, חומרי ניקוי ושקיות. אצלנו כל זה מגיע בהזמנה אחת, מספק אחד. אהרוני שיווק והפצה — מעל 20 שנה ספק לעסקים ומוסדות במרכז. שלחו הודעה ונחזור עם הצעת מחיר.",
    "ספק לנייר, ספק לניקיון, ספק לחד פעמי, ספק לשקיות וספק לציוד משרדי? אפשר להזמין את כולם מספק אחד: נייר וטואלט, חומרי ניקוי, חד פעמי, שקיות וציוד משרדי — בהזמנה אחת. אהרוני שיווק והפצה, מעל 20 שנה מול עסקים ומוסדות במרכז. שלחו הודעה ונחזור עם הצעת מחיר.",
    "אנחנו באור יהודה, באמצע גוש דן, ומספקים לעסקים ולמוסדות באזורי התעשייה והמשרדים במרכז — מהרצליה פיתוח ורעננה, דרך רמת החייל, קריית אריה ופארק אפק, ועד חולון, ראשון לציון ויבנה. נייר, חומרי ניקוי, חד פעמי, שקיות וציוד משרדי — מספק אחד. שלחו הודעה ונחזור עם הצעת מחיר.",
    "מתקני נייר וסבון, נייר טואלט ומגבות, סבון ידיים וחומרי ניקוי — כל מה שחדר השירותים של העסק צריך, מספק אחד. גם המתקנים, וגם מה שממלא אותם. שלחו הודעה ונחזור עם הצעת מחיר.",
    "נגמר הנייר באמצע השבוע? מרכיבים איתכם פעם אחת רשימה של מה שהעסק צורך, וכל חודש רק מאשרים בהודעה. נייר, חומרי ניקוי, חד פעמי ושקיות — מספק אחד. שלחו הודעה ונתחיל.",
    "כמה המשרד שלכם צורך בשנה?", "ספק אחד במקום חמישה", "ספק לעסקים — ממש לידכם",
    "כל מה שחדר השירותים צריך", "רשימה קבועה לחודש",
    "שלום, אשמח להצעת מחיר לציוד למשרד.", "שלום, אשמח להצעת מחיר לכל הציוד של העסק.",
    "שלום, אשמח להצעת מחיר. העסק שלנו נמצא ב-", "שלום, אשמח להצעת מחיר למתקנים ולמוצרים לשירותים.",
    "שלום, אשמח לבנות רשימת הזמנה קבועה לעסק.",
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
    # the four opening posts (23.10: one post per category and raw photos were turned down)
    "מיבנה ועד רעננה — אספקה לעסקים ולמוסדות בכל המרכז: רעננה, הרצליה, פתח תקווה, ראש העין, "
    "בני ברק, תל אביב, רמת גן, גבעתיים, קריית אונו, אור יהודה, יהוד, חולון, בת ים, ראשון לציון, "
    "לוד ויבנה. אהרוני שיווק והפצה, מאור יהודה — מעל 20 שנה. להזמנות: 03-6346236 · aroam.co.il",
    "איך מזמינים מאיתנו? שלושה צעדים: 1. שולחים לנו בוואטסאפ מה צריך — או מסמנים מוצרים בקטלוג "
    "באתר. 2. מקבלים הצעת מחיר על כל ההזמנה, מספק אחד. 3. ההזמנה מגיעה אליכם — לעסקים ולמוסדות "
    "מיבנה ועד רעננה. https://wa.me/972526000158 · הקטלוג: aroam.co.il",
    "מה נגמר החודש במשרד? נייר טואלט, סבון ידיים, כוסות, שקיות אשפה, נייר צילום, כפפות… "
    "שלחו לנו את הרשימה בוואטסאפ, ונחזור עם הצעת מחיר על הכל — מספק אחד. "
    "https://wa.me/972526000158",
    "ככה נראית הזמנה אחת: נייר טואלט וגלילים תעשייתיים, חומרי ניקוי וכפפות, כוסות חד פעמיות, "
    "שקיות אשפה, נייר צילום ועטים — מגיעים יחד, מספק אחד. אהרוני שיווק והפצה — מעל 20 שנה ספק "
    "לעסקים ומוסדות במרכז, מיבנה ועד רעננה. להזמנות: 03-6346236 · הקטלוג המלא: aroam.co.il",
    # calls go to the office line; WhatsApp, where the ads lead, stays on 052-6000158 (24.10)
    "טלפון 03-6346236", "WhatsApp 052-6000158",
    # campaign settings (round 106): leads goal, pins on business zones, a 14-day test
    "מעורבות (Engagement)", "Maximize number of leads", "Maximize number of conversations", "₪30",
    "רדיוס 1 ק\"מ", "קריית אריה, פתח תקווה", "פארק אפק, ראש העין", "Customize per placement",
    "25–65", "059291906",
]
# Published path -> file on disk. The Page's images live in img/, the ads in final_v2/.
IMAGES = {f"img/{n}": HERE / "img" / n for n in
          ["post_area.png", "post_checklist.png", "post_order.png", "post_steps.png", "cover.png", "profile.png"]}
IMAGES.update({f"ads/{a}_{f}.png": HERE / "final_v2" / f"{a}_{f}.png"
               for a in ["D_numbers", "E_contacts", "F_map", "A_restroom", "B_empty_roll"]
               for f in ["feed", "story"]})

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
    for ref, disk in IMAGES.items():
        check(f'src="{ref}"' in src, f"guide shows {ref}")
        check(disk.exists(), f"{ref} exists on disk")
    for ref in re.findall(r'src="([^"]+)"', src):
        check(ref in IMAGES, f"{ref} is a known image")

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILURES"))
sys.exit(1 if fails else 0)
