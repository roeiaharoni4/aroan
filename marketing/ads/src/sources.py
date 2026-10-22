"""Single source of truth for every product image and how it was prepared.

Each entry records where the pixels came from, which region was kept, and why -
the crops exist to exclude other manufacturers' packaging, logos and barcodes.
"""
import pathlib
from prep import prepare, prepare_dark

# The repo's own catalog images (the repo moved from ~/Desktop to ~/aroan on 27.8.26).
CAT = pathlib.Path(__file__).resolve().parents[3] / "images"
HERE = pathlib.Path(__file__).parent

SOURCES = {
    # Stock. Pexels licence, free for commercial use.
    "cup_paper": dict(
        src=HERE / "stock/px_8015715.jpg",
        note="Pexels 8015715 - kraft cup, hue neutralised to a white 8oz cup",
        radius=81, neutral=1.0, density=0.55, white=244, alpha_tol=6,
    ),
    # Roei's catalog shots. Boxes isolate the loose sample from the branded polybag.
    "beer": dict(
        src=CAT / "חד פעמי ואריזות/כוס בירה 330 40 יח׳.webp",
        box=(477, 598, 624, 852), note="loose 330ml clear cup, bag excluded",
        radius=41, white=252, contrast=1.15,
    ),
    "cold": dict(
        src=CAT / "חד פעמי ואריזות/כוסות פלסטיק לשתיה קרה 180 מ״ל.webp",
        box=(283, 346, 376, 464), note="loose 180ml cup stacks, bag excluded",
        radius=41, white=252, contrast=1.15,
    ),
    "fork": dict(
        src=CAT / "חד פעמי ואריזות/מזלג חד פעמי 100 יחידות.webp",
        box=(262, 353, 542, 436), note="loose white forks, importer text cropped off",
        radius=41, white=252, contrast=1.2,
    ),
    "spoon": dict(
        src=CAT / "חד פעמי ואריזות/כף קשיח - 50 יח׳.webp",
        box=(302, 100, 404, 400), note="loose rigid spoon, bag excluded",
        radius=41, white=252, contrast=1.15,
    ),
    "plate": dict(
        src=CAT / "חד פעמי ואריזות/צלחת מתכלה גדול.webp",
        box=(267, 147, 510, 407), note="unlabelled bagasse plate on the right",
        radius=41, white=254, contrast=1.55, alpha_tol=2,  # near-white centre;
        # a looser tolerance lets the fill cross the plate and hollow it out
    ),
    "rolls2": dict(
        src=CAT / "מוצרי נייר/נייר ניגוב תאית 6 יחידות.webp",
        note="6 white cellulose rolls in clear wrap - no print",
        radius=41, white=254, contrast=1.35, alpha_tol=2,
    ),
    "jumbo": dict(
        src=CAT / "מוצרי נייר/גליל תעשייתי ורד צר.webp",
        note="narrow industrial jumbo roll, plain wrap - no print",
        radius=41, white=254, contrast=1.35, alpha_tol=2,
    ),
    "rolls": dict(
        src=CAT / "מוצרי נייר/נייר ניגוב ידיים נטורה 1-6.jpeg",
        note="6-roll hand towel pack - unbranded, highest resolution in the category",
        radius=61, white=236, contrast=1.05,
    ),
    # Additions for the Meta set (offices, factories). All unbranded - except "gold",
    # whose label is Roei's own: it is his private-label roll and stays in frame.
    "gold": dict(
        src=CAT / "מוצרי נייר/גליל נייר תעשייתי גולד.webp",
        note="Aroam's own GOLD-label industrial roll - the label is Roei's",
        radius=41, white=254, contrast=1.3, alpha_tol=2,
    ),
    "carton": dict(
        src=CAT / "מוצרי נייר/נייר טואלט קומפקט 80 - 36 יח_.webp",
        note="plain carton, generic Hebrew print, no manufacturer brand",
        radius=41, white=254, contrast=1.2, alpha_tol=2,
    ),
    "squeegee": dict(
        src=CAT / "אביזרי ניקיון/מגב מתכת 40 סמ.webp",
        note="unbranded 40cm floor squeegee head",
        radius=41, white=252, contrast=1.15,
    ),
    "bins": dict(
        src=CAT / "ציוד משרדי/סל אשפה מתכת רשת.webp",
        note="pair of mesh office bins - generic price stickers only",
        radius=41, white=252, contrast=1.15,
    ),
    # Roei's own picks for the Meta category tiles (22.10.26). Unlike the rest of this
    # file, brands are wanted here: he asked for Sano and Yaakobi by name, and boxed
    # goods (gloves, copy paper, pens) are shown as he sells them. dark=True marks his
    # studio shots on a black ground with the Aroam leaf watermarked in a corner.
    "p5012": dict(
        src=CAT / "1787315001044_______________________5012.webp", dark=True,
        note="single-ply industrial roll 5012 - Roei's own shot, black ground",
    ),
    "compact50": dict(
        src=CAT / "1787509434410___________________50_-_36____.webp", dark=True,
        note="compact 50 toilet roll - Roei's own shot, black ground",
    ),
    "jumbo_tp": dict(
        src=CAT / "מוצרי נייר/נייר טואלט ג׳מבו טישו 1_12.webp",
        note="loose jumbo toilet rolls, unbranded",
        radius=41, white=252, contrast=1.15,
    ),
    "cup500": dict(
        src=CAT / "חד פעמי ואריזות/כוס פלסטיק 500 מל.webp",
        note="clear 500ml plastic cup",
        radius=41, white=252, contrast=1.15,
    ),
    "a4": dict(
        src=CAT / "מוצרי נייר/נייר צילום A4.webp",
        note="A4 copy paper ream, as sold",
        radius=41, white=252, contrast=1.1,
    ),
    "pens": dict(
        src=CAT / "ציוד משרדי/עט לחיץ בקופסא 50 יחידות.webp",
        note="tub of 50 click pens",
        radius=41, white=252, contrast=1.1,
    ),
    "binder": dict(
        src=CAT / "ציוד משרדי/קלסר גב 8.webp",
        note="lever-arch binder",
        radius=41, white=252, contrast=1.1,
    ),
    "jet": dict(
        src=CAT / "ניקיון/סנו ג_ט רב תכליתי 4 ליטר.webp",
        note="Sano Jet multi-purpose 4L - Roei asked for Sano",
        radius=41, white=252, contrast=1.05,
    ),
    "kh7": dict(
        src=CAT / "ניקיון/מסיר שומנים - יעקובי.webp",
        note="KH-7 degreaser spray - Roei asked for Yaakobi",
        radius=41, white=252, contrast=1.05,
    ),
    "gloves": dict(
        src=CAT / "אביזרי ניקיון/כפפות ניטריל ללא אבקה.webp",
        note="nitrile gloves box, as sold",
        radius=41, white=252, contrast=1.05,
    ),
    "wipes": dict(
        src=CAT / "אביזרי ניקיון/מגבונים ארוכים בדלי.webp",
        note="long wipes in a bucket",
        radius=41, white=252, contrast=1.05,
    ),
}


def build_all(names=None):
    """Prepare every source, or only `names` - so adding products never re-renders the
    cutouts that already shipped (a re-run drifts a few pixels on some of them)."""
    (HERE / "prepped").mkdir(exist_ok=True)
    for name in names or SOURCES:
        cfg = dict(SOURCES[name])
        src, note = cfg.pop("src"), cfg.pop("note")
        fn = prepare_dark if cfg.pop("dark", False) else prepare
        im = fn(str(src), HERE / "prepped" / f"{name}.png", **cfg)
        print(f"{name:10s} {im.size[0]:4d}x{im.size[1]:4d}  {note}")


if __name__ == "__main__":
    import sys
    build_all(sys.argv[1:])
