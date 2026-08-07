"""Normalise product shots so they can be multiply-composited.

Every source here - Roei's catalog shots and the Pexels studio shots - is a product
on a smooth light background. Rather than cutting the product out (which shreds the
rims and eats white product bodies), we flatten the background to pure white. A
multiply blend then drops the background completely while keeping 100% of the
product's own pixels, including soft edges and contact shading.
"""
import numpy as np
from PIL import Image, ImageFilter

from cutout import _fill_holes, _label


def _illumination(rgb, radius, work=400):
    """Estimate the smooth background field behind the product.

    A max filter pushes the product out of the way (backgrounds here are lighter
    than or close to the product), then a wide blur leaves only the slow gradient.
    The estimate runs on a downscaled copy - the field is smooth by definition, so
    nothing is lost, and a wide MaxFilter at full resolution is punishingly slow.
    """
    h, w = rgb.shape[:2]
    im = Image.fromarray(rgb.astype(np.uint8), "RGB")
    scale = min(1.0, work / max(w, h))
    if scale < 1.0:
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    r = max(3, int(radius * scale))
    im = im.filter(ImageFilter.MaxFilter(size=r | 1))
    im = im.filter(ImageFilter.GaussianBlur(r))
    if scale < 1.0:
        im = im.resize((w, h), Image.BICUBIC)
    return np.asarray(im).astype(np.float64)


def flatten(path, radius=61, gain=1.0, box=None):
    """Return an RGB image whose background is pure white."""
    im = Image.open(path).convert("RGB")
    if box:
        im = im.crop(box)
    a = np.asarray(im).astype(np.float64)
    field = np.maximum(_illumination(a, radius), 1.0)
    out = np.clip(a / field * 255.0 * gain, 0, 255)
    return Image.fromarray(out.astype(np.uint8), "RGB")


def neutralise(im, amount=1.0, density=1.0):
    """Pull a colour cast (e.g. kraft brown) toward neutral, keeping the shading.

    Works on *density* (255 - value) rather than on the value itself. White has
    zero density, so any gain leaves it exactly white - the background can never
    pick up a tint. `density` < 1 additionally lightens the product, which is how
    a kraft cup becomes a white cup without flattening its shading.
    """
    a = np.asarray(im).astype(np.float64)
    d = 255.0 - a
    ink = d[d.mean(2) > 10]
    if len(ink) == 0:
        return im
    mean = ink.mean(0)
    gain = np.where(mean > 1, mean.mean() / np.maximum(mean, 1), 1.0)
    gain = (1.0 + (gain - 1.0) * amount) * density
    return Image.fromarray(np.clip(255.0 - d * gain, 0, 255).astype(np.uint8), "RGB")


def lift(im, floor=0.0, white=250.0):
    """Rescale levels so `white` and above becomes 255 - snaps the background clean."""
    a = np.asarray(im).astype(np.float64)
    a = (a - floor) / (white - floor) * 255.0
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB")


def snap_white(im, thresh=249):
    """Force near-white pixels to exactly 255.

    Multiply compositing is unforgiving: a background sitting at 250 instead of 255
    darkens the cream field just enough to draw a visible rectangle around every
    product. Snapping removes that edge entirely.
    """
    a = np.asarray(im).astype(np.uint8).copy()
    bg = a.min(2) >= thresh
    a[bg] = 255
    return Image.fromarray(a, "RGB")


def deepen(im, k=1.0):
    """Scale density uniformly - k > 1 strengthens shading on a washed-out product."""
    a = np.asarray(im).astype(np.float64)
    return Image.fromarray(np.clip(255.0 - (255.0 - a) * k, 0, 255).astype(np.uint8), "RGB")


def alpha_from_white_bg(im, tol=6, feather=1.0):
    """Silhouette an product photographed on white, keeping its own white intact.

    Thresholding on "is this pixel white?" destroys white products - the cup body
    disappears along with the background. Instead we flood-fill inwards from the
    border across contiguous near-white pixels; the fill stops at the product's
    outline, so everything it never reached is product, white interior included.
    """
    # A white margin guarantees the fill can travel all the way around the product,
    # so a crop that grazes the subject does not leave a straight uncut edge.
    src = im.convert("RGB")
    m = 4
    padded = Image.new("RGB", (src.width + 2 * m, src.height + 2 * m), (255, 255, 255))
    padded.paste(src, (m, m))

    a = np.asarray(padded).astype(int)
    near_white = a.min(2) >= 255 - tol
    h, w = near_white.shape

    bg = np.zeros((h, w), bool)
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            if near_white[y, x] and not bg[y, x]:
                bg[y, x] = True
                stack.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near_white[y, x] and not bg[y, x]:
                bg[y, x] = True
                stack.append((y, x))
    while stack:
        y, x = stack.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near_white[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                stack.append((ny, nx))

    mask = _fill_holes(~bg)
    # Keep only the main object. A single dust speck in a corner of the source would
    # otherwise survive and blow up the trim box for the whole product.
    labels, sizes = _label(mask)
    if len(sizes) > 1:
        mask = labels == int(np.argmax(sizes[1:]) + 1)
    mask = mask[m:m + src.height, m:m + src.width]
    alpha = Image.fromarray((mask * 255).astype(np.uint8), "L")
    if feather:
        alpha = alpha.filter(ImageFilter.GaussianBlur(feather))
    out = src.convert("RGBA")
    out.putalpha(alpha)
    return out


def content_box(im, tol=12):
    """Bounding box of everything that is not background white."""
    g = np.asarray(im.convert("L")).astype(int)
    ink = g < 255 - tol
    ys, xs = np.nonzero(ink)
    if len(ys) == 0:
        raise ValueError("image is entirely white")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def prepare(path, out, radius=61, box=None, neutral=0.0, density=1.0,
            contrast=1.0, white=250.0, alpha_tol=6, feather=0.8, pad=2):
    """Full pipeline: isolate the product on transparency, then restyle it.

    Order matters. The silhouette is taken while the product still carries its
    original tone, because that is when it contrasts most with the white ground.
    Whitening a kraft cup first would merge its lit side into the background and
    the flood fill would eat a hole straight through the product.
    """
    im = lift(flatten(path, radius=radius, box=box), white=white)
    rgba = alpha_from_white_bg(im, tol=alpha_tol, feather=feather)
    alpha = rgba.split()[-1]

    rgb = im
    if neutral:
        rgb = neutralise(rgb, neutral, density=density)
    if contrast != 1.0:
        rgb = deepen(rgb, contrast)

    out_im = rgb.convert("RGBA")
    out_im.putalpha(alpha)

    a = np.asarray(alpha)
    ys, xs = np.nonzero(a > 8)
    out_im = out_im.crop((max(0, xs.min() - pad), max(0, ys.min() - pad),
                          min(out_im.width, xs.max() + 1 + pad),
                          min(out_im.height, ys.max() + 1 + pad)))
    out_im.save(out)
    return out_im
