"""Cutout helpers: threshold segmentation without scipy.

Products in both the stock photo and Roei's catalog shots are light objects on a
plainer background, so a luminance threshold plus connected-component cleanup is
enough. No upscaling happens here - every crop keeps native pixels.
"""
import numpy as np
from PIL import Image, ImageFilter


def _label(mask):
    """Connected components (4-neighbour) via an explicit stack. Returns (labels, sizes)."""
    h, w = mask.shape
    labels = np.zeros((h, w), np.int32)
    sizes = [0]
    cur = 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if labels[y0, x0]:
            continue
        cur += 1
        n = 0
        stack = [(y0, x0)]
        labels[y0, x0] = cur
        while stack:
            y, x = stack.pop()
            n += 1
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = cur
                    stack.append((ny, nx))
        sizes.append(n)
    return labels, np.array(sizes)


def _fill_holes(mask):
    """Anything in the background not reachable from the border is an interior hole."""
    h, w = mask.shape
    bg = ~mask
    seen = np.zeros((h, w), bool)
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            if bg[y, x] and not seen[y, x]:
                seen[y, x] = True
                stack.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bg[y, x] and not seen[y, x]:
                seen[y, x] = True
                stack.append((y, x))
    while stack:
        y, x = stack.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and bg[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                stack.append((ny, nx))
    return mask | (bg & ~seen)


def _box_std(gray, r=4):
    """Local standard deviation over a (2r+1) window, via integral images."""
    a = gray.astype(np.float64)
    pad = np.pad(a, r + 1, mode="edge")
    s = pad.cumsum(0).cumsum(1)
    s2 = (pad ** 2).cumsum(0).cumsum(1)
    h, w = gray.shape
    k = 2 * r + 1

    def win(c):
        return (c[k:k + h, k:k + w] - c[0:h, k:k + w]
                - c[k:k + h, 0:w] + c[0:h, 0:w])

    n = k * k
    mean = win(s) / n
    var = np.maximum(win(s2) / n - mean ** 2, 0)
    return np.sqrt(var)


def segment_smooth(path, box, min_lum=150, max_std=6.0, min_area=4000):
    """Cut a smooth light object out of a textured background.

    Brightness alone cannot separate these cups from the linen table - the shaded
    side of a cup and the lit fabric sit in the same range. The object is smooth
    and the fabric is woven, so local variance is the discriminator that works.
    """
    im = Image.open(path).convert("RGB").crop(box)
    gray = np.asarray(im.convert("L")).astype(int)
    mask = (gray > min_lum) & (_box_std(gray) < max_std)
    mask = _fill_holes(mask)
    labels, sizes = _label(mask)
    if len(sizes) < 2 or sizes[1:].max() < min_area:
        raise ValueError(f"nothing found in {box}")
    comp = labels == int(np.argmax(sizes[1:]) + 1)
    ys, xs = np.nonzero(comp)
    t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    alpha = Image.fromarray((comp[t:b, l:r] * 255).astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    rgba = im.crop((l, t, r, b)).convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def segment(path, thresh=200, min_area=4000, box=None, invert=False):
    """Return a list of RGBA cutouts, largest first.

    thresh   luminance cut between object and background
    invert   True when the object is DARKER than its background (e.g. the black tray)
    box      optional (l, t, r, b) pre-crop to isolate one item from a packshot
    """
    im = Image.open(path).convert("RGB")
    if box:
        im = im.crop(box)
    gray = np.asarray(im.convert("L")).astype(int)
    mask = gray < thresh if invert else gray > thresh
    mask = _fill_holes(mask)
    labels, sizes = _label(mask)

    out = []
    for lab in np.argsort(sizes)[::-1]:
        if lab == 0 or sizes[lab] < min_area:
            continue
        comp = labels == lab
        ys, xs = np.nonzero(comp)
        t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        alpha = Image.fromarray((comp[t:b, l:r] * 255).astype(np.uint8), "L")
        # 0.8px feather kills the jagged threshold edge without eating the object
        alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
        rgba = im.crop((l, t, r, b)).convert("RGBA")
        rgba.putalpha(alpha)
        out.append(rgba)
    return out


def trim(rgba, pad=0):
    """Tighten an RGBA image to its alpha bounding box."""
    a = np.asarray(rgba.split()[-1])
    ys, xs = np.nonzero(a > 8)
    t, b = max(0, ys.min() - pad), min(a.shape[0], ys.max() + 1 + pad)
    l, r = max(0, xs.min() - pad), min(a.shape[1], xs.max() + 1 + pad)
    return rgba.crop((l, t, r, b))
