#!/usr/bin/env python3
"""Generate Chrome manifest icons from the KiwiJob brand image."""
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT.parent / "public"
SOURCE = PUBLIC / "kiwijob-logo.png"
OUT = PUBLIC / "icons"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image

        img = Image.open(SOURCE).convert("RGBA")
        side = min(img.size)
        left = (img.width - side) // 2
        top = (img.height - side) // 2
        square = img.crop((left, top, left + side, top + side))

        for size in (16, 32, 48, 128):
            path = OUT / f"icon-{size}.png"
            square.resize((size, size), Image.Resampling.LANCZOS).save(path, optimize=True)
            print("wrote", path, path.stat().st_size)
        return
    except ImportError:
        pass

    for size in (16, 32, 48, 128):
        path = OUT / f"icon-{size}.png"
        subprocess.run(["sips", "-z", str(size), str(size), str(SOURCE), "--out", str(path)], check=True)
        print("wrote", path, path.stat().st_size)


if __name__ == "__main__":
    main()
