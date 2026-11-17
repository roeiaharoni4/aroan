"""Three new ad directions for the click-to-WhatsApp campaign (drafts, 16.11.26).

Round 106 found the October set was one concept in three texts: the same four-tile
template, so Meta's ad system (which picks who sees an ad largely from what is in it)
treats it as one ad, and four product photos on white read as home shopping. These
drafts are three genuinely different concepts, vertical first (9:16 for Reels, Stories
and WhatsApp Status), with everything that matters inside y=290..1630 - Meta's story UI
covers the top and bottom ~250px, and a 4:5 feed crop keeps roughly y=285..1635.

  A  "in its place"  - a business restroom wall with the dispensers and supplies.
  B  "the problem"   - the empty roll, and a fixed monthly list as the answer.
  C  "short video"   - ordering in one WhatsApp message, animated (frames + preview).

Writes into marketing/meta/drafts_v2/.
"""
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

from build import CHROME, LOGO, data_uri
from meta import BASE, HEAD, WA, fill, native, photo

HERE = pathlib.Path(__file__).parent
OUT = HERE.parents[2] / "marketing" / "meta" / "drafts_v2"
W, H = 1080, 1920

CHIP = "מעל 20 שנה · לעסקים ומוסדות"
CTA = WA + "שלחו הודעה בוואטסאפ"
ASIDE = "מיבנה ועד רעננה"

COMMON = """
.c{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:Heebo,sans-serif;
  background:#F3F7F4;color:#1A4231}
.top{position:absolute;top:298px;right:76px;left:76px;display:flex;align-items:center;
  justify-content:space-between}
.logo{width:160px;display:block}
.chip{font-weight:500;font-size:26px;color:#1A4231;background:#E2EFE6;border-radius:40px;padding:9px 24px}
h1{position:absolute;right:76px;left:76px;font-weight:900;line-height:1;letter-spacing:-2.5px}
h1 span{display:block;color:#639C7D}
.lead{position:absolute;right:76px;left:76px;font-size:33px;font-weight:500;line-height:1.4;color:#3B5547}
.band{position:absolute;left:0;right:0;bottom:0;height:410px;background:#1A4231;display:flex;
  align-items:flex-start;justify-content:space-between;padding:22px 76px 0}
.cta{display:inline-flex;align-items:center;gap:14px;background:#8FD6A3;color:#1A4231;
  font-weight:800;font-size:34px;padding:16px 32px;border-radius:60px}
.cta svg{width:38px;height:38px}
.band small{font-size:27px;font-weight:500;color:#CFE6D7;padding-top:18px}
.p{position:absolute;display:block}
"""
TOP = f'<div class="top"><img class="logo" src="@@LOGO@@"><span class="chip">{CHIP}</span></div>'
BAND = f'<div class="band"><span class="cta">{CTA}</span><small>{ASIDE}</small></div>'


def place(name, cm, cx, base, ppc, axis="h", shadow="floor"):
    """A product at real size (cm on `axis`), centred on cx, its bottom on `base`.

    shadow="floor": a soft contact ellipse under it. shadow="wall": a drop shadow cast
    down and away, the way a dispenser screwed to a wall throws it.
    """
    nw, nh = native(name)
    if axis == "h":
        h = cm * ppc
        w = nw * h / nh
    else:
        w = cm * ppc
        h = nh * w / nw
    x, y = cx - w / 2, base - h
    parts = []
    if shadow == "floor":
        parts.append(f'<div class="sh" style="left:{cx - w * .5:.0f}px;width:{w:.0f}px;top:{base - 13:.0f}px">'
                     '</div>')
        filt = "drop-shadow(0 10px 12px rgba(14,32,54,.16))"
    else:
        filt = "drop-shadow(8px 14px 10px rgba(14,32,54,.20)) drop-shadow(0 2px 2px rgba(14,32,54,.12))"
    parts.append(f'<img class="p" src="{photo(name)}" style="left:{x:.0f}px;top:{y:.0f}px;'
                 f'height:{h:.0f}px;filter:{filt}">')
    return "".join(parts)


# --- A: in its place ------------------------------------------------------------------

# The scene box is 928 x 750 and sits at y=730. Real sizes at 6.2 px/cm: wall-mounted
# dispensers at their own heights, the supplies that refill them on the floor below.
SCENE_PPC = 6.2
FLOOR_Y = 586       # where the wall meets the floor, in scene px
BASE_Y = 712        # the floor items' ground line
WALL = [  # (name, cm, axis, centre x, bottom y)
    ("disp_towel", 33, "h", 168, 340), ("disp_soap", 27, "h", 380, 380),
    ("disp_jumbo", 30, "w", 612, 352), ("disp_fresh", 22, "h", 832, 230),
]
FLOOR = [  # (name, cm, axis, centre x)
    ("carton", 48, "w", 214), ("rolls2", 38, "w", 520), ("jet", 30, "h", 728),
    ("bags_trash", 26, "h", 838),
]
A_PAGE = (HEAD + BASE + COMMON + """
.scene{position:absolute;top:730px;left:76px;width:928px;height:750px;border-radius:28px;overflow:hidden;
  box-shadow:0 2px 0 #E1EAE4,0 18px 40px rgba(26,66,49,.10)}
.wall{position:absolute;left:0;right:0;top:0;height:@@FLOOR_Y@@px;background-color:#F6FAF7;
  background-image:linear-gradient(#DDE9E1 2px,transparent 2px),linear-gradient(90deg,#DDE9E1 2px,transparent 2px);
  background-size:116px 116px;background-position:-2px -2px}
.wall:after{content:"";position:absolute;inset:0;
  background:radial-gradient(70% 60% at 50% 30%,rgba(255,255,255,.75),rgba(255,255,255,0) 70%)}
.base{position:absolute;left:0;right:0;top:@@FLOOR_Y@@px;height:14px;background:#C9DDD0}
.floor{position:absolute;left:0;right:0;top:calc(@@FLOOR_Y@@px + 14px);bottom:0;
  background:linear-gradient(#E3EDE6,#D3E3D9)}
.sh{position:absolute;height:24px;border-radius:50%;
  background:radial-gradient(50% 50% at 50% 50%,rgba(26,66,49,.30),rgba(26,66,49,0))}
.tag{position:absolute;font-weight:700;font-size:24px;color:#1A4231;background:#fff;border-radius:30px;
  padding:7px 18px;box-shadow:0 4px 12px rgba(26,66,49,.12);white-space:nowrap}
</style></head><body><div class="c">
  @@TOP@@
  <h1 style="top:412px;font-size:100px">חדר השירותים<span>של העסק.</span></h1>
  <div class="lead" style="top:630px">מתקנים, נייר, סבון וחומרי ניקוי — הכל מספק&nbsp;אחד.</div>
  <div class="scene"><div class="wall"></div><div class="base"></div><div class="floor"></div>@@ITEMS@@</div>
  @@BAND@@
</div></body></html>""")


def draft_a():
    items = []
    for name, cm, axis, cx, base in WALL:
        items.append(place(name, cm, cx, base, SCENE_PPC, axis, shadow="wall"))
    for name, cm, axis, cx in FLOOR:
        items.append(place(name, cm, cx, BASE_Y, SCENE_PPC, axis))
    # Two quiet tags name what the photo cannot: the dispensers are supplied too, and
    # the supplies below are what keeps them full.
    items.append('<span class="tag" style="right:34px;top:30px">גם המתקנים</span>')
    items.append(f'<span class="tag" style="right:34px;top:{FLOOR_Y - 128}px">וגם מה שממלא אותם</span>')
    return fill(A_PAGE.replace("@@TOP@@", TOP).replace("@@BAND@@", BAND), w=W, h=H, logo=data_uri(LOGO),
                floor_y=FLOOR_Y, items="".join(items))


# --- B: the problem --------------------------------------------------------------------

# The empty roll is drawn, not photographed: a kraft tube on its side, its open end
# towards the viewer. One object, so the headline carries the ad.
ROLL = """<svg class="roll" viewBox="0 0 520 300" width="520" height="300">
  <defs>
    <linearGradient id="tube" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#D9BC93"/><stop offset=".45" stop-color="#C9A673"/>
      <stop offset="1" stop-color="#A9844F"/></linearGradient>
    <radialGradient id="hole" cx=".45" cy=".45" r=".6">
      <stop offset="0" stop-color="#5E4527"/><stop offset="1" stop-color="#8B6A40"/></radialGradient>
  </defs>
  <ellipse cx="270" cy="268" rx="230" ry="20" fill="#1A4231" opacity=".14"/>
  <path d="M120 60 L400 60 A72 104 0 0 1 400 268 L120 268 Z" fill="url(#tube)"/>
  <path d="M150 60 C 230 130 300 180 400 205" stroke="#B48F5C" stroke-width="5" fill="none" opacity=".55"/>
  <path d="M135 120 C 220 190 300 230 395 250" stroke="#B48F5C" stroke-width="5" fill="none" opacity=".45"/>
  <ellipse cx="120" cy="164" rx="72" ry="104" fill="#D7B88C"/>
  <ellipse cx="120" cy="164" rx="58" ry="88" fill="url(#hole)"/>
</svg>"""
MONTHLY = [("compact50", 82), ("rolls2", 70), ("jet", 96), ("cup_paper", 76), ("bags_trash", 92)]
B_PAGE = (HEAD + BASE + COMMON + """
.roll{position:absolute;top:748px;left:280px}
.card{position:absolute;top:1090px;left:76px;right:76px;height:372px;background:#fff;border-radius:28px;
  padding:40px 46px 0;box-shadow:0 2px 0 #E1EAE4,0 18px 40px rgba(26,66,49,.10)}
.card b{display:block;font-weight:900;font-size:52px;letter-spacing:-1px}
.card p{font-size:30px;font-weight:500;line-height:1.4;color:#3B5547;margin-top:12px;max-width:820px}
.row{position:absolute;left:46px;right:46px;bottom:32px;display:flex;align-items:flex-end;
  justify-content:space-between;border-top:2px solid #E6EEE9;padding-top:20px}
.row img{display:block;filter:drop-shadow(0 6px 8px rgba(14,32,54,.16))}
</style></head><body><div class="c">
  @@TOP@@
  <h1 style="top:412px;font-size:150px;letter-spacing:-4px">נגמר הנייר.<span>שוב.</span></h1>
  @@ROLL@@
  <div class="card">
    <b>רשימה קבועה לחודש.</b>
    <p>מרכיבים איתכם פעם אחת את מה שהעסק צורך. כל חודש — מאשרים בהודעה, וההזמנה&nbsp;מגיעה.</p>
    <div class="row">@@ROW@@</div>
  </div>
  @@BAND@@
</div></body></html>""")


def draft_b():
    row = "".join(f'<img src="{photo(n)}" style="height:{h}px">' for n, h in MONTHLY)
    return fill(B_PAGE.replace("@@TOP@@", TOP).replace("@@BAND@@", BAND).replace("@@ROLL@@", ROLL),
                w=W, h=H, logo=data_uri(LOGO), row=row)


# --- C: short video --------------------------------------------------------------------

# Ordering in one message, as it happens: the customer's list (each line arriving with its
# product), Aroam's reply with a quote for the whole order, "approved", the carton on its
# way. RTL WhatsApp puts your own messages on the left, so the customer is on the left.
# Each element carries data-in (seconds) and a motion kind; the script at the bottom
# poses the page at the time in the URL hash, so every frame is a plain screenshot.
LIST = [("compact50", "נייר טואלט", "2 קרטונים"), ("jet", "נוזל ניקוי", "6 בקבוקים"),
        ("cup_paper", "כוסות לשתייה חמה", "1,000 יח׳"), ("bags_trash", "שקיות אשפה", "10 גלילים")]
DURATION = 10.0
FPS = 12
TICKS = ('<svg viewBox="0 0 22 14" fill="none" stroke="currentColor" stroke-width="2.2" '
         'stroke-linecap="round" stroke-linejoin="round"><path d="M1 8l4 4 8-9"/><path d="M10 12l8-9"/></svg>')
C_PAGE = (HEAD + BASE + COMMON + """
.chat{position:absolute;top:626px;left:76px;width:928px;height:862px;border-radius:28px;overflow:hidden;
  background:#E4EEE8;padding:26px 28px;display:flex;flex-direction:column;gap:16px;
  box-shadow:0 2px 0 #E1EAE4,0 18px 40px rgba(26,66,49,.10)}
.b{max-width:640px;border-radius:24px;padding:16px 26px 12px;box-shadow:0 3px 8px rgba(14,32,54,.08);
  position:relative}
.me{align-self:flex-end;background:#D3EFDB;border-end-end-radius:6px}
.us{align-self:flex-start;background:#fff;border-end-start-radius:6px}
.b .who{font-weight:700;font-size:24px;color:#639C7D;margin-bottom:6px}
.b .txt{font-size:31px;font-weight:600;line-height:1.35}
.line{display:flex;align-items:center;gap:18px;height:62px;border-top:2px solid rgba(26,66,49,.08)}
.line:first-of-type{border-top:0}
.line .th{flex:none;width:64px;height:54px;display:flex;align-items:center;justify-content:center}
.line .th img{display:block;max-width:64px;max-height:54px;filter:drop-shadow(0 4px 6px rgba(14,32,54,.18))}
.line span{flex:1;font-size:31px;font-weight:700}
.line em{font-style:normal;font-size:27px;font-weight:500;color:#4A6B5A}
.meta{display:flex;justify-content:flex-start;gap:6px;color:#639C7D;margin-top:4px}
.meta svg{width:24px;height:15px}
.doc{display:flex;align-items:center;gap:18px;margin-top:10px;background:#F3F7F4;border-radius:16px;padding:10px 14px}
.doc .pg{flex:none;width:72px;height:92px;background:#fff;border-radius:8px;overflow:hidden;
  display:flex;flex-direction:column;gap:7px;box-shadow:0 4px 10px rgba(14,32,54,.12)}
.doc .pg i{display:block;height:6px;border-radius:3px;background:#DCE8E0;margin:0 10px}
.doc .pg i.hd{height:18px;border-radius:0;margin:0 0 4px;background:#1A4231}
.doc .pg i.short{margin-inline-end:34px}
.doc .pg i.total{margin-top:auto;margin-bottom:10px;margin-inline-start:36px;height:8px;background:#639C7D}
.doc b{display:block;font-size:29px;font-weight:800}
.doc small{display:block;font-size:24px;font-weight:500;color:#4A6B5A;margin-top:4px}
.last{display:flex;align-items:flex-end;justify-content:space-between;margin-top:6px}
.last .b{align-self:auto}
.box{position:relative;width:240px;text-align:center}
.box img{width:200px;display:block;margin:0 auto;filter:drop-shadow(0 10px 12px rgba(14,32,54,.2))}
.box .pill{display:inline-block;margin-top:12px;background:#1A4231;color:#fff;font-weight:800;font-size:26px;
  border-radius:30px;padding:8px 22px}
</style></head><body><div class="c">
  @@TOP@@
  <h1 style="top:404px;font-size:92px">ככה מזמינים.<span>בהודעה אחת.</span></h1>
  <div class="chat">
    <div class="b me" data-in="0.6" data-k="up">
      <div class="txt">שלום, צריך למשרד:</div>
      @@LINES@@
      <div class="meta" data-in="3.6" data-k="fade">@@TICKS@@</div>
    </div>
    <div class="b us" data-in="4.4" data-k="up">
      <div class="who">אהרוני שיווק והפצה</div>
      <div class="txt">קיבלנו. הנה הצעת מחיר על כל ההזמנה.</div>
      <div class="doc" data-in="5.0" data-k="pop"><div class="pg"><i class="hd"></i><i></i><i class="short"></i><i></i>
        <i class="short"></i><i class="total"></i></div><div><b>הצעת מחיר</b><small>נייר, ניקיון, חד פעמי ושקיות</small></div></div>
    </div>
    <div class="last">
      <div class="box" data-in="7.2" data-k="drop"><img src="@@CARTON@@"><span class="pill" data-in="7.9" data-k="pop">ההזמנה בדרך</span></div>
      <div class="b me" data-in="6.3" data-k="up"><div class="txt">מאשרים.</div><div class="meta">@@TICKS@@</div></div>
    </div>
  </div>
  @@BAND@@
</div>
<script>
const T = parseFloat((location.hash.match(/t=([\\d.]+)/) || [0, "99"])[1]);
const outCubic = p => 1 - Math.pow(1 - p, 3);
const outBack = p => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
document.querySelectorAll("[data-in]").forEach(el => {
  const t0 = parseFloat(el.dataset.in), k = el.dataset.k;
  const d = k === "drop" ? 0.55 : 0.4;
  const p = Math.max(0, Math.min(1, (T - t0) / d));
  el.style.opacity = Math.min(1, p * 1.6);
  if (k === "up") el.style.transform = `translateY(${(1 - outCubic(p)) * 28}px)`;
  if (k === "pop") el.style.transform = `scale(${0.8 + 0.2 * outBack(p)})`;
  if (k === "drop") el.style.transform = `translateY(${-(1 - outBack(p)) * 160}px)`;
});
</script></body></html>""")


def draft_c():
    lines = []
    for i, (name, label, qty) in enumerate(LIST):
        t = 1.2 + i * 0.6
        lines.append(f'<div class="line" data-in="{t:.1f}" data-k="up"><div class="th">'
                     f'<img src="{photo(name)}"></div><span>{label}</span><em>{qty}</em></div>')
    return fill(C_PAGE.replace("@@TOP@@", TOP).replace("@@BAND@@", BAND), w=W, h=H, logo=data_uri(LOGO),
                lines="".join(lines), ticks=TICKS, carton=photo("carton"))


# --- rendering -------------------------------------------------------------------------

def shoot(page_file, out, t=None, wait_ms=8000, timeout=120, slack=200):
    """One headless-Chrome screenshot of page_file at W x H (optionally at time t).

    Like build.render, but each call gets its own profile directory so several can run
    at once (frames of the video), and the page is passed in rather than rewritten.
    """
    url = pathlib.Path(page_file).as_uri() + (f"#t={t:.3f}" if t is not None else "")
    prof = tempfile.mkdtemp(prefix="aroam-chrome-")
    raw = pathlib.Path(prof) / "shot.png"
    cmd = [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={prof}",
           "--force-device-scale-factor=1", f"--window-size={W},{H + slack}", f"--screenshot={raw}",
           "--default-background-color=FF00FFFF", f"--virtual-time-budget={wait_ms}", url]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            start_new_session=True)
    try:
        code = proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        raise RuntimeError(f"{out}: Chrome did not finish within {timeout}s")
    try:
        if code:
            raise RuntimeError(f"{out}: Chrome exited with {code}")
        im = Image.open(raw).convert("RGB").crop((0, 0, W, H))
        a = np.asarray(im)
        if ((a[:, :, 0] > 250) & (a[:, :, 1] < 5) & (a[:, :, 2] > 250)).any():
            raise RuntimeError(f"{out}: canvas did not cover the frame")
        im.save(out)
    finally:
        shutil.rmtree(prof, ignore_errors=True)


def main(which):
    OUT.mkdir(parents=True, exist_ok=True)
    pages = {"A_in_place": draft_a, "B_problem": draft_b, "C_video": draft_c}
    for name, build in pages.items():
        if which and name[0] not in which:
            continue
        html = OUT / f"{name}.html"
        html.write_text(build(), encoding="utf-8")
        if name != "C_video":
            shoot(html, OUT / f"{name}.png")
            print(name, "done")
            continue
        frames = OUT / "C_frames"
        shutil.rmtree(frames, ignore_errors=True)
        frames.mkdir()
        times = [i / FPS for i in range(int(DURATION * FPS))]
        with ThreadPoolExecutor(6) as pool:
            list(pool.map(lambda it: shoot(html, frames / f"{it[0]:04d}.png", it[1]), enumerate(times)))
        # The last frame, full size, stands for the video in reviews.
        shutil.copy(frames / f"{len(times) - 1:04d}.png", OUT / "C_video_end.png")
        print(name, len(times), "frames")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
