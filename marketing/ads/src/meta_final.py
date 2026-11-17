"""The final campaign set (17.11.26): Roei took all three new videos (meta_v3 D, E, F) and
the two stills (meta_v2 A, B) stay in.

Every ad comes in two files - 9:16 for Stories, Reels and WhatsApp Status, and 4:5 for the
feed, cut from the same frames (y=285..1635, which is why the layouts keep everything that
matters inside it). Videos are rendered at 30 fps and encoded to H.264 by frames2mp4.swift,
which uses the encoder built into macOS - no ffmpeg download. Each video ends on a 1.5s
hold of its last frame, and that frame is also saved as its cover image.

Writes into marketing/meta/final_v2/.
"""
import pathlib
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

from meta_v2 import OUT as DRAFTS, draft_a, draft_b, shoot
from meta_v3 import VIDEOS, W, preview, render_frames

HERE = pathlib.Path(__file__).parent
FINAL = HERE.parents[2] / "marketing" / "meta" / "final_v2"
FPS = 30
HOLD = 1.5
FEED = (0, 285, W, 285 + 1350)
STILLS = {"A_restroom": draft_a, "B_empty_roll": draft_b}
TOOL = pathlib.Path(tempfile.gettempdir()) / "aroam-frames2mp4"


def encoder():
    src = HERE / "frames2mp4.swift"
    if not TOOL.exists() or TOOL.stat().st_mtime < src.stat().st_mtime:
        subprocess.run(["swiftc", "-O", str(src), "-o", str(TOOL)], check=True)
    return str(TOOL)


def stills():
    for name, build in STILLS.items():
        html = DRAFTS / f"{name}.html"
        html.write_text(build(), encoding="utf-8")
        story = FINAL / f"{name}_story.png"
        shoot(html, story)
        Image.open(story).crop(FEED).save(FINAL / f"{name}_feed.png")
        print(name, "stills")


def videos(which):
    enc = encoder()
    for name, (build, duration) in VIDEOS.items():
        if which and name[0] not in which:
            continue
        with tempfile.TemporaryDirectory(prefix="aroam-frames-") as tmp:
            frames = pathlib.Path(tmp) / "f"
            n = render_frames(name, build, duration, frames, fps=FPS)
            last = frames / f"{n - 1:04d}.png"
            shutil.copy(last, FINAL / f"{name}_cover_story.png")
            Image.open(last).crop(FEED).save(FINAL / f"{name}_cover_feed.png")
            subprocess.run([enc, str(frames), str(FINAL / f"{name}_story.mp4"), str(FPS), str(HOLD)], check=True)
            subprocess.run([enc, str(frames), str(FINAL / f"{name}_feed.mp4"), str(FPS), *map(str, FEED[:2]),
                            str(FEED[2] - FEED[0]), str(FEED[3] - FEED[1]), str(HOLD)], check=True)
            preview(frames, FINAL / f"{name}_preview.webp", step=3, fps=FPS)


def main(which):
    FINAL.mkdir(parents=True, exist_ok=True)
    if not which or "S" in which:
        stills()
    vids = which - {"S"}
    if not which or vids:
        videos(vids)


if __name__ == "__main__":
    main(set(sys.argv[1:]))
