"""One-page sheet for the cup factory: the wrap, the colour code, the print. No cup dimensions (Roei, 18.11.26).
Hebrew with English under each line. Run after build_print.py."""
import pathlib
import build_print as B

HERE = B.HERE
OUT = B.OUT
TODAY = "23.11.2026"
RGB = ", ".join(str(int(B.GREEN[i:i + 2], 16)) for i in (1, 3, 5))

PRINT = [
    ("הלוגו", "המילה coffee והעלה נשארים בצבע הנייר (knockout). <b>אין דיו לבנה.</b>",
     "“coffee” + leaf are knocked out: unprinted white board. No white ink."),
    ("מיקום", "פעמיים, משני צידי הכוס (180°), כל לוגו רבע סיבוב מהתפר. המרכז ב-53% מגובה הדופן, מלמטה. ישר.",
     "Twice, both sides (180° apart), each a 1/4 turn from the seam. Centre at 53% of the wall height. Level."),
    ("גודל", "רוחב כל לוגו ≈ 21% מהיקף הכוס בגובה הלוגו. לשמור על הפרופורציה, לא למתוח.",
     "Each logo ≈ 21% of the circumference at its height wide. Keep proportions."),
    ("נייר", "קרטון כוסות לבן (לא קראפט). פנים הכוס והתחתית בלי הדפסה.",
     "White cup board (not kraft). Inside and bottom unprinted."),
    ("לפני ייצור", "הוכחה דיגיטלית על התבנית של המפעל לאישור, ודוגמה מודפסת לאישור הגוון. לבדוק שהקצה הדק של העלה לא נסגר.",
     "Digital proof on your dieline for approval, and a printed sample to approve the colour. Check the thin leaf tip stays open."),
]


def html():
    logo = OUT / "coffee-logo-on-green.svg"
    wrap = OUT / "cup-wrap-8oz.svg"
    rows = "\n".join(f"<tr><th>{h}<div class='en' dir='ltr'>{h_en}</div></th><td>{he}<div class='en' dir='ltr'>{en}</div></td></tr>"
                     for (h, he, en), h_en in zip(PRINT, ["Logo", "Position", "Size", "Board", "Before production"]))
    return f"""<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&display=block" rel="stylesheet">
<style>
@page {{ size: A4; margin: 12mm 14mm; }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; font-family: Assistant, Arial, sans-serif; color: #1F2A24; font-size: 10pt; line-height: 1.35; }}
header {{ display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.2pt solid {B.GREEN}; padding-bottom: 2.5mm; margin-bottom: 4mm; }}
h1 {{ margin: 0; font-size: 19pt; font-weight: 800; color: {B.GREEN}; line-height: 1.1; }}
.sub {{ font-size: 9.6pt; color: #4B5B52; margin-top: 1mm; text-align: right; }}
.meta {{ text-align: left; font-size: 8.8pt; color: #4B5B52; line-height: 1.5; }}
h2 {{ font-size: 12pt; font-weight: 800; color: {B.GREEN}; margin: 4mm 0 2mm; display: flex; align-items: baseline; gap: 2.5mm; }}
h2 .num {{ display: inline-grid; place-items: center; width: 5.6mm; height: 5.6mm; border-radius: 50%; background: {B.GREEN}; color: #fff; font-size: 9pt; align-self: center; }}
h2 .en {{ font-weight: 600; margin: 0; }}
.en {{ color: #5B6E64; font-size: 8.4pt; line-height: 1.28; margin-top: .3mm; text-align: right; }}
.wrap img {{ width: 78%; margin: 0 auto; display: block; border: .5pt solid #D5DED9; border-radius: 1.5mm; }}
.legend {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 6mm; font-size: 8.8pt; margin-top: 2mm; }}
.k {{ display: inline-block; width: 8mm; border-top: .9pt dashed #E6007E; vertical-align: middle; margin-inline-end: 2mm; }}
.k.dot {{ border-top-style: dotted; }}
.k.fill {{ border-top: 3mm solid {B.GREEN}; vertical-align: -0.3mm; }}
.also {{ font-size: 8.8pt; color: #4B5B52; margin-top: 1.5mm; }}
.colour {{ display: grid; grid-template-columns: 30mm 1fr 58mm; gap: 5mm; align-items: center; }}
.chip {{ height: 30mm; border-radius: 2mm; background: {B.GREEN}; }}
.codes {{ display: grid; grid-template-columns: auto 1fr; gap: 1mm 4mm; align-items: baseline; }}
.codes .lbl {{ color: #4B5B52; font-size: 9pt; }}
.codes .val {{ font-size: 13pt; font-weight: 800; color: {B.GREEN}; }}
.codes .val.small {{ font-size: 10.5pt; font-weight: 700; }}
.codes .hint {{ grid-column: 1 / -1; font-size: 8.8pt; color: #4B5B52; margin-top: 1mm; }}
.logo-box {{ background: #F3F6F4; border-radius: 2mm; padding: 4mm; }}
.logo-box img {{ width: 100%; display: block; }}
.logo-box .cap {{ margin-top: 2mm; font-size: 8.6pt; }}
table {{ width: 100%; border-collapse: collapse; }}
.spec th {{ width: 27mm; text-align: right; vertical-align: top; padding: 1.5mm 0 1.5mm 3mm; color: {B.GREEN}; font-weight: 700; }}
.spec td {{ padding: 1.5mm 0; vertical-align: top; }}
.spec tr + tr th, .spec tr + tr td {{ border-top: .5pt solid #D5DED9; }}
footer {{ margin-top: 4mm; font-size: 8.2pt; color: #5B6E64; border-top: .5pt solid #D5DED9; padding-top: 1.8mm; }}
.mono {{ font-family: Menlo, Consolas, monospace; font-size: 7.8pt; }}
</style></head><body>

<header>
  <div><h1>כוס קפה ממותגת — קובץ להדפסה</h1><div class="sub" dir="ltr">Branded paper coffee cup — print file</div></div>
  <div class="meta">אהרוני שיווק והפצה<br><span dir="ltr">03-6346236 · meiraroam@gmail.com</span><br>{TODAY}</div>
</header>

<h2><span class="num">1</span>הפריסה<span class="en" dir="ltr">Wrap</span></h2>
<div class="wrap"><img src="{wrap.as_uri()}" alt=""></div>
<div class="legend">
  <div><span class="k fill"></span>הירוק — מודפס <span class="en" dir="ltr" style="display:inline">· printed flood</span></div>
  <div><span class="k"></span>שפת הכוס, השפה העליונה למעלה <span class="en" dir="ltr" style="display:inline">· cup edge, rim on top</span></div>
  <div><span class="k dot"></span>התפר — ההדבקה בצד שמאל <span class="en" dir="ltr" style="display:inline">· seam, overlap on the left</span></div>
  <div>הוורוד — לא להדפסה; סימון קצר = מרכז לוגו <span class="en" dir="ltr" style="display:inline">· magenta = guides; ticks = logo centres</span></div>
</div>

<h2><span class="num">2</span>קוד הצבע<span class="en" dir="ltr">Colour code</span></h2>
<div class="colour">
  <div class="chip"></div>
  <div class="codes">
    <span class="lbl">Pantone</span><span class="val" dir="ltr">{B.PANTONE}</span>
    <span class="lbl">HEX</span><span class="val small" dir="ltr">{B.GREEN}</span>
    <span class="lbl">RGB</span><span class="val small" dir="ltr">{RGB}</span>
    <div class="hint">צבע דפוס אחד, מלא על כל הדופן החיצונית כולל השוליים והתפר. מדפיסים לפי הפנטון; HEX ו-RGB לייחוס על מסך.
      <div class="en" dir="ltr">1 spot colour, full flood on the whole outer wall. Print to the Pantone; HEX/RGB are screen reference only.</div></div>
  </div>
  <div class="logo-box">
    <img src="{logo.as_uri()}" alt="">
    <div class="cap">הלבן = נייר בלי הדפסה.<div class="en" dir="ltr">White = unprinted board.</div></div>
  </div>
</div>

<h2><span class="num">3</span>ההדפסה<span class="en" dir="ltr">Print</span></h2>
<table class="spec">{rows}</table>

<footer>קבצים מצורפים: הפריסה <span class="mono" dir="ltr">cup-wrap-8oz.pdf</span> · קוד הצבע <span class="mono" dir="ltr">cup-colour.pdf</span> <span class="en" dir="ltr" style="display:inline">· Attached: the wrap and the colour sheet.</span></footer>
</body></html>"""


if __name__ == "__main__":
    page = HERE / "spec.html"
    page.write_text(html(), encoding="utf8")
    try:
        B.html_to_pdf(page, OUT / "cup-print-spec.pdf")
    finally:
        page.unlink(missing_ok=True)
    print("ok")
