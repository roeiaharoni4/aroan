"""Three more ad directions, all short videos (drafts, 17.11.26).

Roei turned down the WhatsApp-chat video (meta_v2 C) and asked for something new; of three
new concepts he asked for all three:

  D  "numbers"   - what an office of 20 goes through in a year, counting up beside each
                   product. Useful content no competitor gives, and it scrolls past private
                   buyers - the audience problem round 106 found.
  E  "contacts"  - five supplier contacts struck off one by one until one is left.
  F  "map"       - routes lighting up from Or Yehuda to the industrial zones and office
                   parks the campaign would target by pin.

Same frame as meta_v2: 1080x1920, everything that matters inside y=290..1630 so one file
serves Stories, Reels, WhatsApp Status and (cropped to 4:5) the feed. Each element carries
data-in (seconds) and a motion kind; ANIM poses the page at the time in the URL hash, so
every frame is a plain screenshot.

Writes into marketing/meta/drafts_v2/.
"""
import math
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

from build import LOGO, data_uri
from meta import BASE, HEAD, fill, photo
from meta_v2 import BAND, COMMON, OUT, TOP, H, W, shoot as _shoot


def shoot(html, out, t=None):
    # A headless Chrome occasionally hangs with the renderer idle (see build.render);
    # a fresh process with a shorter wait gets through.
    for attempt in range(3):
        try:
            return _shoot(html, out, t, timeout=60 if attempt == 0 else 90)
        except RuntimeError:
            if attempt == 2:
                raise
from meta import COAST, HUB, LAT_N, LON_W, PX_LAT, PX_LON, smooth

FPS = 12

# Motion kinds: up, pop, fade, count (data-to), strike (sets --s 0..1), collapse (height to
# 0, data-h px), draw (an SVG path with pathLength="1").
ANIM = """<script>
const T = parseFloat((location.hash.match(/t=([\\d.]+)/) || [0, "99"])[1]);
const outCubic = p => 1 - Math.pow(1 - p, 3);
const inOut = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const outBack = p => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
document.querySelectorAll("[data-in]").forEach(el => {
  const t0 = parseFloat(el.dataset.in), k = el.dataset.k;
  const d = parseFloat(el.dataset.d || (k === "count" ? "1.4" : k === "draw" ? ".7" : ".4"));
  const p = Math.max(0, Math.min(1, (T - t0) / d));
  if (k === "up") { el.style.opacity = Math.min(1, p * 1.6); el.style.transform = `translateY(${(1 - outCubic(p)) * 28}px)`; }
  if (k === "pop") { el.style.opacity = Math.min(1, p * 2); el.style.transform = `scale(${0.7 + 0.3 * outBack(p)})`; }
  if (k === "fade") el.style.opacity = p;
  if (k === "count") el.textContent = Math.round(parseFloat(el.dataset.to) * outCubic(p)).toLocaleString("en-US");
  if (k === "strike") el.style.setProperty("--s", outCubic(p));
  if (k === "collapse") { const e = inOut(p); el.style.height = (1 - e) * parseFloat(el.dataset.h) + "px"; el.style.opacity = 1 - e; }
  if (k === "draw") el.style.strokeDashoffset = 1 - inOut(p);
});
</script>"""


def page(css, body):
    html = HEAD + BASE + COMMON + css + "</style></head><body><div class=\"c\">" + TOP + body + BAND
    return html + "</div>" + ANIM + "</body></html>"


# --- D: what an office goes through in a year ------------------------------------------

# From the site's guide (guides/office-paper-consumption): 2 rolls per employee a month,
# 2-3 hand towels a day, a ream every one to three months. For 20 people: 2 x 20 x 12 =
# 480 rolls; 2.5 x 20 x ~250 working days = 12,500 towels; one ream per two months = 120.
YEAR = [(480, "גלילי נייר טואלט", "compact50", 120), (12500, "מגבות נייר לניגוב ידיים", "rolls2", 104),
        (120, "חבילות נייר צילום", "a4", 140)]
MORE = [("cup_paper", 64), ("jet", 78), ("bags_trash", 76), ("gloves", 46)]
D_CSS = """
.card{position:absolute;top:628px;left:76px;right:76px;height:720px;background:#fff;border-radius:28px;
  padding:16px 44px 0;box-shadow:0 2px 0 #E1EAE4,0 18px 40px rgba(26,66,49,.10)}
.stat{display:flex;align-items:center;gap:30px;height:178px;border-bottom:2px solid #E6EEE9}
.stat .th{flex:none;width:170px;height:150px;display:flex;align-items:center;justify-content:center;
  background:#F1F6F2;border-radius:22px}
.stat .th img{display:block;filter:drop-shadow(0 8px 10px rgba(14,32,54,.18))}
.stat b{display:block;font-weight:900;font-size:112px;line-height:1;letter-spacing:-3px;direction:ltr;
  text-align:right;font-variant-numeric:tabular-nums}
.stat span{display:block;font-weight:600;font-size:32px;color:#4A6B5A;margin-top:6px}
.more{display:flex;align-items:center;gap:22px;height:150px}
.more p{flex:1;font-size:30px;font-weight:600;color:#3B5547;line-height:1.35}
.more img{display:block;filter:drop-shadow(0 6px 8px rgba(14,32,54,.16))}
.note{position:absolute;left:44px;bottom:16px;font-size:20px;color:#7A9387}
.end{position:absolute;top:1376px;left:76px;right:76px;text-align:center;font-weight:900;font-size:60px;
  letter-spacing:-1.5px;color:#1A4231}
.end span{color:#639C7D}
"""


def draft_d():
    stats = []
    for i, (num, label, name, h) in enumerate(YEAR):
        t = 0.4 + i * 1.1
        stats.append(f'<div class="stat" data-in="{t:.1f}" data-k="up"><div class="th">'
                     f'<img src="{photo(name)}" style="height:{h}px"></div><div>'
                     f'<b data-in="{t + .2:.1f}" data-k="count" data-to="{num}">0</b>'
                     f'<span>{label}</span></div></div>')
    more = "".join(f'<img src="{photo(n)}" style="height:{h}px">' for n, h in MORE)
    body = f"""
  <h1 style="top:404px;font-size:92px">משרד של 20 עובדים.<span>בשנה אחת:</span></h1>
  <div class="card">{"".join(stats)}
    <div class="more" data-in="4.0" data-k="up"><p>ועוד כוסות, חומרי ניקוי,<br>שקיות אשפה וכפפות.</p>{more}</div>
    <div class="note" data-in="4.0" data-k="fade">* הערכה לפי צריכה ממוצעת</div>
  </div>
  <div class="end" data-in="5.0" data-k="pop">את כל זה — <span>בהזמנה אחת.</span></div>"""
    return fill(page(D_CSS, body), w=W, h=H, logo=data_uri(LOGO))


# --- E: five contacts, or one ----------------------------------------------------------

SUPPLIERS = [("ספק נייר", "נייר טואלט ומגבות", "compact50"), ("ספק חומרי ניקוי", "סבון, JET, אקונומיקה", "jet"),
             ("ספק חד פעמי", "כוסות, צלחות, סכו״ם", "cup_paper"), ("ספק שקיות", "אשפה וגופייה", "bags_trash"),
             ("ספק ציוד משרדי", "נייר צילום ועטים", "a4")]
ROW_H = 128
E_CSS = f"""
.book{{position:absolute;top:628px;left:76px;right:76px;height:760px;background:#fff;border-radius:28px;
  overflow:hidden;box-shadow:0 2px 0 #E1EAE4,0 18px 40px rgba(26,66,49,.10)}}
.bar{{display:flex;align-items:center;justify-content:space-between;height:96px;padding:0 36px;
  border-bottom:2px solid #E6EEE9}}
.bar b{{font-weight:800;font-size:36px}}
.bar small{{font-size:26px;font-weight:500;color:#7A9387}}
.row{{height:{ROW_H}px;overflow:hidden}}
.rin{{position:relative;display:flex;align-items:center;gap:26px;height:{ROW_H}px;padding:0 36px;
  border-bottom:2px solid #EEF3EF}}
.av{{flex:none;width:88px;height:88px;border-radius:50%;background:#EAF3EE;display:flex;align-items:center;
  justify-content:center;overflow:hidden}}
.av img{{display:block;max-width:64px;max-height:64px}}
.who b{{display:block;font-weight:700;font-size:36px}}
.who span{{display:block;font-size:26px;font-weight:500;color:#6B8578;margin-top:4px}}
/* the stroke runs across the name, then the row dims */
.rin:after{{content:"";position:absolute;right:140px;top:41%;height:5px;border-radius:3px;background:#1A4231;
  width:calc(var(--s,0) * 520px)}}
.rin .av,.rin .who{{opacity:calc(1 - var(--s,0) * .55)}}
.us{{position:absolute;top:96px;left:0;right:0;padding:34px 36px 0}}
.us .rin{{border:0;padding:0;height:auto}}
.us .av{{width:120px;height:120px;background:#fff;box-shadow:0 0 0 3px #8FD6A3}}
.us .av img{{max-width:96px;max-height:96px}}
.us .who b{{font-size:44px;font-weight:900}}
.us .who span{{font-size:28px;color:#4A6B5A}}
.cats{{display:flex;align-items:flex-end;justify-content:space-between;margin-top:40px;padding:26px 10px 0;
  border-top:2px solid #E6EEE9}}
.cats img{{display:block;filter:drop-shadow(0 6px 8px rgba(14,32,54,.16))}}
.end{{position:absolute;top:548px;left:36px;right:36px;text-align:center;font-weight:900;font-size:64px;
  letter-spacing:-1.5px}}
.end span{{color:#639C7D}}
"""
CATS = [("compact50", 92), ("jet", 112), ("cup_paper", 92), ("bags_trash", 108), ("a4", 110)]


def draft_e():
    rows = []
    for i, (name, sub, img) in enumerate(SUPPLIERS):
        rows.append(f'<div class="row" data-in="3.9" data-k="collapse" data-h="{ROW_H}" data-d=".55">'
                    f'<div class="rin" data-in="{1.0 + i * .45:.2f}" data-k="strike" data-d=".35">'
                    f'<div class="av"><img src="{photo(img)}"></div><div class="who"><b>{name}</b>'
                    f'<span>{sub}</span></div></div></div>')
    cats = "".join(f'<img src="{photo(n)}" style="height:{h}px">' for n, h in CATS)
    body = f"""
  <h1 style="top:404px;font-size:92px">5 ספקים בטלפון?<span data-in="4.6" data-k="fade">או אחד.</span></h1>
  <div class="book">
    <div class="bar"><b>אנשי קשר</b><small>ספקים</small></div>
    {"".join(rows)}
    <div class="us" data-in="4.4" data-k="up">
      <div class="rin"><div class="av"><img src="{data_uri(LOGO)}"></div><div class="who">
        <b>אהרוני שיווק והפצה</b><span>נייר · ניקיון · חד פעמי · שקיות · ציוד משרדי</span></div></div>
      <div class="cats" data-in="5.0" data-k="up">{cats}</div>
    </div>
    <div class="end" data-in="5.6" data-k="pop">ספק אחד. <span>הזמנה אחת.</span></div>
  </div>"""
    return fill(page(E_CSS, body), w=W, h=H, logo=data_uri(LOGO))


def draft_e_still():
    """E as a single image (Roei, 17.11: images first): the five contacts already struck
    off and dimmed, and Aroam below them as the one that stays, set off in its own card -
    the before and the after in one frame, which the video told in sequence."""
    css = E_CSS + """
.book{height:860px}
.row{height:92px}
.rin{height:92px}
.rin:after{top:33%}
.av{width:72px;height:72px}
.av img{max-width:54px;max-height:54px}
.who b{font-size:32px}
.who span{font-size:24px}
.keep{margin:22px 26px 0;border:3px solid #8FD6A3;border-radius:22px;background:#F3F9F5;padding:20px 22px}
.keep .rin{height:auto;padding:0;border:0}
.keep .av{width:112px;height:112px;background:#fff;box-shadow:0 0 0 3px #8FD6A3}
.keep .av img{max-width:90px;max-height:90px}
.keep .who b{font-size:42px;font-weight:900}
.keep .who span{font-size:26px;color:#4A6B5A}
.end{position:static;margin-top:30px;font-size:56px;line-height:1}
"""
    rows = "".join(f'<div class="row"><div class="rin" style="--s:1"><div class="av"><img src="{photo(img)}">'
                   f'</div><div class="who"><b>{name}</b><span>{sub}</span></div></div></div>'
                   for name, sub, img in SUPPLIERS)
    body = f"""
  <h1 style="top:404px;font-size:92px">5 ספקים בטלפון?<span>או אחד.</span></h1>
  <div class="book">
    <div class="bar"><b>אנשי קשר</b><small>ספקים</small></div>
    {rows}
    <div class="keep"><div class="rin"><div class="av"><img src="{data_uri(LOGO)}"></div><div class="who">
      <b>אהרוני שיווק והפצה</b><span>נייר · ניקיון · חד פעמי · שקיות · ציוד משרדי</span></div></div></div>
    <div class="end">ספק אחד. <span>הזמנה אחת.</span></div>
  </div>"""
    return fill(page(css, body), w=W, h=H, logo=data_uri(LOGO))


# --- F: right next to you -------------------------------------------------------------

# Industrial zones and office parks, at approximate positions (a schematic map, not a
# survey). These are the pins the campaign would target; Or Yehuda sits in the middle.
ZONES = [  # (name, lat, lon, label side)
    ("הרצליה פיתוח", 32.163, 34.808, "e"), ("אזה״ת רעננה", 32.194, 34.861, "e"),
    ("רמת החייל", 32.110, 34.840, "w"), ("קריית אריה", 32.104, 34.861, "ne"),
    ("פארק אפק", 32.097, 34.929, "e"), ("הבורסה", 32.083, 34.801, "w"),
    ("אזה״ת חולון", 32.006, 34.786, "w"), ("ראשון מערב", 31.986, 34.752, "w"),
    ("אזה״ת יבנה", 31.874, 34.745, "e"),
]
F_MAP_W, F_MAP_H, F_TOP = 928, 780, 640
LABEL_AT = {
    "e": "left:{x:.0f}px;top:{y:.0f}px;transform:translate(16px,-50%)",
    "w": "left:{x:.0f}px;top:{y:.0f}px;transform:translate(calc(-100% - 16px),-50%)",
    "n": "left:{x:.0f}px;top:{y:.0f}px;transform:translate(-50%,calc(-100% - 14px))",
    "s": "left:{x:.0f}px;top:{y:.0f}px;transform:translate(-50%,14px)",
    "ne": "left:{x:.0f}px;top:{y:.0f}px;transform:translate(6px,calc(-100% - 12px))",
}
F_CSS = """
.map{position:absolute;top:@@TOPPX@@px;left:76px;width:@@MW@@px;height:@@MH@@px;border-radius:28px;
  overflow:hidden;background:#fff;box-shadow:0 2px 0 #E1EAE4,0 18px 40px rgba(26,66,49,.10)}
.map svg.base{position:absolute;inset:0}
.dot{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#639C7D;
  box-shadow:0 0 0 4px #fff,0 2px 8px rgba(14,32,54,.3)}
.lbl{position:absolute;white-space:nowrap;font-weight:800;font-size:26px;line-height:1;color:#1A4231;
  background:#fff;border-radius:20px;padding:7px 14px;box-shadow:0 3px 10px rgba(26,66,49,.14)}
.pin{position:absolute;width:56px;height:72px;filter:drop-shadow(0 6px 8px rgba(14,32,54,.3))}
.hub{position:absolute;white-space:nowrap;font-weight:900;font-size:30px;color:#fff;background:#1A4231;
  border-radius:24px;padding:9px 18px}
.sea{position:absolute;font-size:24px;font-weight:500;color:#5E8A74}
.end{position:absolute;top:1446px;left:76px;right:76px;text-align:center;font-weight:700;font-size:32px;
  color:#3B5547}
"""


def draft_f():
    # Fit the zones' span (Yavne to Ra'anana) into the map with a margin, keeping the
    # longitude squeeze of meta.area_post.
    k = 0.85
    ox, oy = 60, 56

    def proj(lat, lon):
        return (lon - LON_W) * PX_LON * k + ox, (LAT_N - lat) * PX_LAT * k + oy

    hx, hy = proj(*HUB)
    coast = [proj(*p) for p in COAST]
    (sx, sy), (ex, ey) = coast[0], coast[-1]
    shapes = [f'<path d="M-40 {sy:.1f} L{sx:.1f} {sy:.1f} {smooth(coast)} L-40 {ey:.1f}Z" fill="#D7EAE1"/>',
              f'<path d="M{sx:.1f} {sy:.1f} {smooth(coast)}" fill="none" stroke="#B7D5C5" stroke-width="3"/>']
    parts = []
    for i, (name, lat, lon, side) in enumerate(ZONES):
        x, y = proj(lat, lon)
        t = 0.9 + i * 0.32
        mx, my = (hx + x) / 2, (hy + y) / 2
        cx, cy = mx + (y - hy) * .14, my - (x - hx) * .14
        shapes.append(f'<path d="M{hx:.1f} {hy:.1f}Q{cx:.1f} {cy:.1f} {x:.1f} {y:.1f}" pathLength="1" '
                      f'fill="none" stroke="#639C7D" stroke-width="5" stroke-linecap="round" '
                      f'stroke-dasharray="1" stroke-dashoffset="1" data-in="{t:.2f}" data-k="draw"/>')
        parts.append(f'<div class="dot" style="left:{x:.0f}px;top:{y:.0f}px" data-in="{t + .6:.2f}" '
                     f'data-k="pop"></div>')
        parts.append(f'<div class="lbl" style="{LABEL_AT[side].format(x=x, y=y)}" data-in="{t + .65:.2f}" '
                     f'data-k="fade">{name}</div>')
    svg = (f'<svg class="base" viewBox="0 0 {F_MAP_W} {F_MAP_H}" width="{F_MAP_W}" height="{F_MAP_H}">'
           f'{"".join(shapes)}</svg>')
    pin = (f'<svg class="pin" viewBox="0 0 40 52" style="left:{hx - 28:.0f}px;top:{hy - 70:.0f}px" '
           f'data-in="0.3" data-k="pop"><path d="M20 51C20 51 4 31 4 19a16 16 0 0 1 32 0c0 12-16 32-16 32z" '
           f'fill="#1A4231"/><circle cx="20" cy="19" r="6.5" fill="#8FD6A3"/></svg>')
    hub = (f'<div class="hub" style="left:{hx:.0f}px;top:{hy + 16:.0f}px;transform:translateX(-50%)" '
           f'data-in="0.4" data-k="pop">אור יהודה</div>')
    sea = '<div class="sea" style="left:40px;top:560px">הים התיכון</div>'
    body = f"""
  <h1 style="top:404px;font-size:92px">ממש לידכם.<span>מאור יהודה.</span></h1>
  <div class="map">{svg}{sea}{"".join(parts)}{pin}{hub}</div>
  <div class="end" data-in="4.6" data-k="up">ספק לעסקים ולמוסדות באזורי התעשייה במרכז.</div>"""
    css = (F_CSS.replace("@@TOPPX@@", str(F_TOP)).replace("@@MW@@", str(F_MAP_W))
           .replace("@@MH@@", str(F_MAP_H)))
    return fill(page(css, body), w=W, h=H, logo=data_uri(LOGO))


VIDEOS = {"D_numbers": (draft_d, 7.5), "E_contacts": (draft_e, 7.5), "F_map": (draft_f, 7.0)}


def render_frames(name, build, duration, frames, fps=FPS):
    """Write the page and shoot one PNG per frame into `frames`; returns the frame count."""
    html = OUT / f"{name}.html"
    html.write_text(build(), encoding="utf-8")
    shutil.rmtree(frames, ignore_errors=True)
    frames.mkdir(parents=True)
    times = [i / fps for i in range(int(duration * fps))]
    with ThreadPoolExecutor(6) as pool:
        list(pool.map(lambda it: shoot(html, frames / f"{it[0]:04d}.png", it[1]), enumerate(times)))
    return len(times)


def preview(frames, out, step=1, fps=FPS):
    """A half-size animated WebP of every `step`-th frame, holding the last one."""
    names = sorted(frames.glob("*.png"))
    pick = names[::step]
    if pick[-1] != names[-1]:
        pick.append(names[-1])
    small = [Image.open(f).convert("RGB").resize((540, 960), Image.LANCZOS) for f in pick]
    dur = [round(1000 * step / fps)] * len(small)
    dur[-1] = 2500
    small[0].save(out, save_all=True, append_images=small[1:], duration=dur, loop=0, quality=80)


def render_video(name, build, duration):
    frames = OUT / f"{name}_frames"
    n = render_frames(name, build, duration, frames)
    last = frames / f"{n - 1:04d}.png"
    shutil.copy(last, OUT / f"{name}_end.png")
    Image.open(last).crop((0, 285, W, 1635)).save(OUT / f"{name}_end_feed.png")
    preview(frames, OUT / f"{name}_preview.webp")
    print(name, n, "frames")


def main(which):
    for name, (build, duration) in VIDEOS.items():
        if which and name[0] not in which:
            continue
        render_video(name, build, duration)


if __name__ == "__main__":
    main(set(sys.argv[1:]))
