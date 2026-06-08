"""Copy load.jpg into drawable-nodpi/splash_image.png for app loading screen."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "load.jpg"
OUT = ROOT / "app" / "src" / "main" / "res" / "drawable-nodpi" / "splash_image.png"


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"Missing {SRC}")
    Image.open(SRC).convert("RGB").save(OUT, format="PNG", optimize=True)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
