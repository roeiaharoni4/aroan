"""Even out the lighting of a cut-out product photo (17.11.26).

Roei on the segment ads: the product photos look poor - "the edges are dark compared to
the centre". They are phone shots lit from the front, so a white roll or bucket falls off
to grey at its sides (measured: hand towels 200 centre / 167 edges, GOLD 220 / 170).

The correction estimates the light falling on the product, not its colours: a max filter
takes the brightest material near each point (the white paper, not the navy lid next to
it), a wide blur turns that into a smooth light field, and each pixel is lifted by how far
its light falls short of the product's well-lit areas. Dark materials keep their colour
because their light field comes from the bright material around them. The alpha edge is
pulled in by a pixel and re-feathered, which drops the grey halo a phone cutout leaves.

    python3 relight.py rolls2_hi p5012_hi gold ...   ->   prepped/<name>_lit.png
"""
import pathlib
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = pathlib.Path(__file__).parent
PREPPED = HERE / "prepped"


def light_field(lum, alpha, frac=0.12):
    """Smooth estimate of the light on the product, from its locally brightest material."""
    h, w = lum.shape
    work = 400 / max(h, w)
    small = (max(1, int(w * work)), max(1, int(h * work)))
    L = Image.fromarray(np.where(alpha > 0.5, lum, 0).astype(np.uint8)).resize(small, Image.BILINEAR)
    r = max(3, int(max(small) * frac)) | 1
    L = L.filter(ImageFilter.MaxFilter(r)).filter(ImageFilter.GaussianBlur(r * 0.8))
    return np.asarray(L.resize((w, h), Image.BICUBIC)).astype(float)


def relight(img, strength=1.0, cap=1.55, gamma=0.94):
    rgba = np.asarray(img.convert("RGBA")).astype(float)
    rgb, a = rgba[..., :3], rgba[..., 3] / 255
    lum = rgb @ [0.299, 0.587, 0.114]
    field = np.maximum(light_field(lum, a), 1)
    target = np.percentile(field[a > 0.5], 92)
    gain = np.clip(target / field, 1.0, cap) ** strength
    out = np.clip(rgb * gain[..., None], 0, 255)
    # a slight midtone lift, so white paper reads as white rather than grey
    out = 255 * (out / 255) ** gamma
    # tighten the cut edge by one pixel and feather it again
    alpha = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7))
    res = Image.fromarray(out.astype(np.uint8)).convert("RGBA")
    res.putalpha(alpha)
    return res


def main(names):
    for n in names:
        src = PREPPED / f"{n}.png"
        out = PREPPED / f"{n}_lit.png"
        relight(Image.open(src)).save(out)
        print(out.name)


if __name__ == "__main__":
    main(sys.argv[1:])
