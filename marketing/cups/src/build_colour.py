"""Colour sheet for the cup factory, English only (Roei, 18.11.26): swatch + Pantone / HEX / RGB.
Output: ../print/cup-colour.pdf (A5 landscape). Run after build_print.py is not needed; it only reads the constants."""
import re
import build_print as B

OUT = B.OUT
RGB = ", ".join(str(int(B.GREEN[i:i + 2], 16)) for i in (1, 3, 5))


def html():
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;800&display=block" rel="stylesheet">
<style>
@page {{ size: A5 landscape; margin: 14mm 16mm; }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; font-family: Assistant, Arial, sans-serif; color: #1F2A24; }}
h1 {{ margin: 0 0 1.5mm; font-size: 17pt; font-weight: 800; color: {B.GREEN}; }}
.sub {{ font-size: 10pt; color: #4B5B52; padding-bottom: 4mm; border-bottom: 1.8pt solid {B.GREEN}; margin-bottom: 7mm; }}
.row {{ display: grid; grid-template-columns: 52mm 1fr; gap: 9mm; align-items: center; }}
.chip {{ height: 52mm; border-radius: 2.5mm; background: {B.GREEN}; }}
.codes {{ display: grid; grid-template-columns: 22mm 1fr; row-gap: 3.2mm; align-items: baseline; }}
.lbl {{ font-size: 10.5pt; color: #4B5B52; }}
.val {{ font-size: 13pt; font-weight: 800; color: {B.GREEN}; }}
.val.main {{ font-size: 21pt; }}
.note {{ margin-top: 7mm; font-size: 9.6pt; color: #4B5B52; line-height: 1.45; }}
.note b {{ color: #1F2A24; }}
</style></head><body>
<h1>Coffee cup — colour</h1>
<div class="sub">One spot colour, full flood on the whole outer wall of the cup.</div>
<div class="row">
  <div class="chip"></div>
  <div class="codes">
    <span class="lbl">Pantone</span><span class="val main">{B.PANTONE}</span>
    <span class="lbl">HEX</span><span class="val">{B.GREEN}</span>
    <span class="lbl">RGB</span><span class="val">{RGB}</span>
  </div>
</div>
<div class="note"><b>Print to the Pantone.</b> HEX and RGB are for on-screen reference only.<br>
The logo is not printed: it is the white board showing through. No white ink.<br>
Please confirm the green with a printed sample on cup board before production.</div>
</body></html>"""


if __name__ == "__main__":
    page = B.HERE / "colour.html"
    text = html()
    assert not re.search(r"[֐-׿]", text), "Hebrew found"
    page.write_text(text, encoding="utf8")
    try:
        B.html_to_pdf(page, OUT / "cup-colour.pdf")
    finally:
        page.unlink(missing_ok=True)
    print("ok")
