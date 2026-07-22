#!/usr/bin/env python3
"""Pack the accepted PixelLab loops into the strips the renderer loads.

Each asset becomes two horizontal strips of 4 frames under public/art/pixellab/:

  <name>.png        the art as generated, full canvas, untrimmed
  <name>-white.png  the same alpha channel painted flat white

The frames keep their full generation canvas rather than being trimmed. The
canvas is what holds the four frames in register with each other -- trimming
each frame to its own bounding box would make the loop jitter. The white strip
exists so the on-hit flash can be a plain overlay sprite: tinting a coloured
sprite white is a no-op under multiply, and a per-enemy colour filter is not
worth paying for on a screen full of bodies.

Also copies the accepted floor tile into place. Run from the repo root:

    python3 art/pixellab/make-strips.py
"""

from pathlib import Path
import shutil

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "art" / "pixellab"
OUT = ROOT / "public" / "art" / "pixellab"

# name -> the four frame files, in loop order.
LOOPS = {
    "dj-walk": [f"animations/dj-walk-{i}.png" for i in range(4)],
    "mite-hover": [f"animations/mite-hover-{i}.png" for i in range(4)],
    "husk-shamble": [f"animations/husk-shamble-{i}.png" for i in range(4)],
    # Wave 1 of the whole-roster map (#219).
    "gaffer-lumber": [f"animations/gaffer-lumber-{i}.png" for i in range(4)],
    "jack-march": [f"animations/jack-march-{i}.png" for i in range(4)],
    "bloom-sway": [f"animations/bloom-sway-{i}.png" for i in range(4)],
    "rush-charge": [f"animations/rush-charge-{i}.png" for i in range(4)],
}

FLOOR = ("candidates/floor-earth.png", "floor-earth.png")


def build_loop(name: str, frame_files: list[str]) -> None:
    frames = [Image.open(SRC / f).convert("RGBA") for f in frame_files]
    sizes = {frame.size for frame in frames}
    if len(sizes) != 1:
        raise SystemExit(f"{name}: frames disagree on canvas size: {sizes}")
    width, height = frames[0].size

    strip = Image.new("RGBA", (width * len(frames), height), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        strip.paste(frame, (i * width, 0))
    strip.save(OUT / f"{name}.png")

    # Flat white, original alpha: a silhouette of the frame.
    white = Image.new("RGBA", strip.size, (255, 255, 255, 0))
    white.putalpha(strip.getchannel("A"))
    white.save(OUT / f"{name}-white.png")

    print(f"{name}: {len(frames)} frames, {width}x{height} each -> {strip.size[0]}x{strip.size[1]}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, frame_files in LOOPS.items():
        build_loop(name, frame_files)
    shutil.copyfile(SRC / FLOOR[0], OUT / FLOOR[1])
    tile = Image.open(OUT / FLOOR[1])
    print(f"floor: {tile.size[0]}x{tile.size[1]}")


if __name__ == "__main__":
    main()
