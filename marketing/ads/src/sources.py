"""Single source of truth for every product image and how it was prepared.

Each entry records where the pixels came from, which region was kept, and why -
the crops exist to exclude other manufacturers' packaging, logos and barcodes.
"""
import pathlib
from prep import prepare

CAT = pathlib.Path("/Users/roeiaharoni/Desktop/קטלוג לקוחות/aroan/images")
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
}


def build_all():
    (HERE / "prepped").mkdir(exist_ok=True)
    for name, cfg in SOURCES.items():
        cfg = dict(cfg)
        src, note = cfg.pop("src"), cfg.pop("note")
        im = prepare(str(src), HERE / "prepped" / f"{name}.png", **cfg)
        print(f"{name:10s} {im.size[0]:4d}x{im.size[1]:4d}  {note}")


if __name__ == "__main__":
    build_all()
