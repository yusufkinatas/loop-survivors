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
    # Wave 2 of the whole-roster map (#220).
    "moss-trudge": [f"animations/moss-trudge-{i}.png" for i in range(4)],
    "crack-shuffle": [f"animations/crack-shuffle-{i}.png" for i in range(4)],
    "signal-lope": [f"animations/signal-lope-{i}.png" for i in range(4)],
    "silver-scuttle": [f"animations/silver-scuttle-{i}.png" for i in range(4)],
    # Waves 3 and 4, merged into one pass (#234). Every body carries its own
    # material colour rather than the shared bark navy -- the band-by-hue scheme
    # is dead, so colour is free to be the roster's variety axis instead.
    "bloom-chomp": [f"animations/bloom-chomp-{i}.png" for i in range(4)],
    "shear-swing": [f"animations/shear-swing-{i}.png" for i in range(4)],
    "woofer-wade": [f"animations/woofer-wade-{i}.png" for i in range(4)],
    "howl-lope": [f"animations/howl-lope-{i}.png" for i in range(4)],
    "shard-drift": [f"animations/shard-drift-{i}.png" for i in range(4)],
    "echo-sweep": [f"animations/echo-sweep-{i}.png" for i in range(4)],
    "flare-hover": [f"animations/flare-hover-{i}.png" for i in range(4)],
    "static-hover": [f"animations/static-hover-{i}.png" for i in range(4)],
}

FLOOR = ("candidates/floor-earth.png", "floor-earth.png")

# Single-image props and pickups (#234). Unlike the loops these ARE trimmed to
# their alpha bounds: there is no sibling frame to stay in register with, and
# the renderer sizes each one by scaling its texture to a target world height,
# which only works if the texture is the art rather than the art plus however
# much transparent margin the generator happened to leave.
OBJECTS = [
    "gem",
    "note",
    "prop-stump",
    "prop-rune",
    "prop-mushrooms",
    "prop-cableroot",
    "prop-fern",
    "prop-stagelight",
]


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


def build_object(name: str) -> None:
    image = Image.open(SRC / "objects" / f"{name}.png").convert("RGBA")
    bbox = image.getbbox()
    if bbox is None:
        raise SystemExit(f"{name}: fully transparent")
    trimmed = image.crop(bbox)
    trimmed.save(OUT / "objects" / f"{name}.png")
    print(f"{name}: {image.size[0]}x{image.size[1]} -> {trimmed.size[0]}x{trimmed.size[1]}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "objects").mkdir(parents=True, exist_ok=True)
    for name, frame_files in LOOPS.items():
        build_loop(name, frame_files)
    for name in OBJECTS:
        build_object(name)
    shutil.copyfile(SRC / FLOOR[0], OUT / FLOOR[1])
    tile = Image.open(OUT / FLOOR[1])
    print(f"floor: {tile.size[0]}x{tile.size[1]}")


if __name__ == "__main__":
    main()
