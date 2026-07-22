#!/usr/bin/env python3
"""Sweep the floorShade ink wash against the accepted earth tile.

#209 left the wash as the dial that cools and darkens a tile without spending a
generation, and #211 measured this one as warm red-brown (mean RGB 73,35,36)
rather than the blue-black the spec asked for. This renders the ground exactly
as view.ts draws it -- tile at FLOOR_TILE_SIZE world units, chapter tint, then
the ink wash -- at a range of wash alphas, with the three sprites standing on it
at their true draw scale so the contrast question is answered in the same image.

    python3 art/pixellab/tune-floor.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "art" / "pixellab"
OUT = SRC / "floor-wash-sweep.png"

WORLD_SCALE = 800 / 456
FLOOR_SCALE = 2 * WORLD_SCALE
FLOOR_TILE_SIZE = 32 * FLOOR_SCALE

# view.ts: SOUNDWOOD.ink, ARENA_PALETTE.tint x CHAPTER_TINTS[0], and the
# chapter accent laid over the wash at chapter 0.
INK = (0x05, 0x08, 0x10)
TINT = (0xF1, 0xFF, 0xFF)
ACCENT = (0x42, 0xF5, 0xD0)
ACCENT_ALPHA = 0.008

# #211 handed #212 two dials that cool and darken the tile without spending a
# generation: the ink wash, and the tint the floor is multiplied by. Multiply
# only ever darkens, so a cool tint pulls the tile's red down toward its own
# blue-black rather than adding blue that was never there.
COOL = (0xA8, 0xD4, 0xFF)

# (label, tile file, tint, wash)
VARIANTS = [
    ("earth, as shipped (wash 0.12)", "floor-earth.png", TINT, 0.12),
    ("earth, wash 0.35", "floor-earth.png", TINT, 0.35),
    ("earth, wash 0.50", "floor-earth.png", TINT, 0.50),
    ("earth, cool tint + wash 0.35", "floor-earth.png", COOL, 0.35),
    ("earth, cool tint + wash 0.50", "floor-earth.png", COOL, 0.50),
    ("moss, cool tint + wash 0.35", "floor-moss.png", COOL, 0.35),
    ("moss, cool tint + wash 0.50", "floor-moss.png", COOL, 0.50),
]

PANEL_W, PANEL_H = 720, 300
SPRITES = [
    "candidates/mite-B.png",
    "candidates/husk-B.png",
    "candidates/dj-A.png",
]


def multiply_tint(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    """Pixi's tint: per-channel multiply."""
    channels = []
    for channel, factor in zip(image.split(), color):
        channels.append(channel.point(lambda v, f=factor: int(v * f / 255)))
    return Image.merge("RGB", channels)


def flat(size: tuple[int, int], color: tuple[int, int, int]) -> Image.Image:
    return Image.new("RGB", size, color)


def render_panel(tile_file: str, tint: tuple[int, int, int], wash: float) -> Image.Image:
    tile = Image.open(SRC / "candidates" / tile_file).convert("RGB")
    side = max(1, round(FLOOR_TILE_SIZE))
    scaled = tile.resize((side, side), Image.NEAREST)

    ground = Image.new("RGB", (PANEL_W, PANEL_H))
    for y in range(0, PANEL_H, side):
        for x in range(0, PANEL_W, side):
            ground.paste(scaled, (x, y))

    ground = multiply_tint(ground, tint)
    ground = Image.blend(ground, flat(ground.size, INK), wash)
    ground = Image.blend(ground, flat(ground.size, ACCENT), ACCENT_ALPHA)

    for i, path in enumerate(SPRITES):
        sprite = Image.open(SRC / path).convert("RGBA")
        w = round(sprite.width * WORLD_SCALE)
        h = round(sprite.height * WORLD_SCALE)
        sprite = sprite.resize((w, h), Image.NEAREST)
        x = 110 + i * 190 - w // 2
        ground.paste(sprite, (x, PANEL_H // 2 - h // 2), sprite)
    return ground


def mean_rgb(image: Image.Image) -> tuple[int, ...]:
    pixels = list(image.convert("RGB").get_flattened_data())
    n = len(pixels)
    return tuple(round(sum(p[c] for p in pixels) / n) for c in range(3))


def main() -> None:
    sheet = Image.new("RGB", (PANEL_W, PANEL_H * len(VARIANTS)), (0, 0, 0))
    print(f"tile drawn at {FLOOR_TILE_SIZE:.1f} world units")
    for i, (label, tile_file, tint, wash) in enumerate(VARIANTS):
        panel = render_panel(tile_file, tint, wash)
        sheet.paste(panel, (0, i * PANEL_H))
        # Ground only, so the sprites do not skew the reading.
        ground = render_panel(tile_file, tint, wash).crop((0, 0, PANEL_W, 40))
        print(f"  {label:<32} mean RGB {mean_rgb(ground)}")
    sheet.save(OUT)
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()
