#!/usr/bin/env python3
"""Build the wave 3+4 pick gate: every A/B pair side by side on the shipped
rust floor, at the relative scale the game actually draws them.

The gate is the only place the human's judgement lands (map #217), so the sheet
shows the pair together against the floor they will live on, and at the sizes
they will really be relative to each other -- a 21px Static Mite next to a 51px
Snare Bloom is the whole point.

    python3 art/pixellab/make-wave34-sheet.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
CAND = ROOT / "art" / "pixellab" / "candidates"
OUT = ROOT / "art" / "pixellab"

FONT = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
SMALL = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 15)
FG = (232, 232, 240)
DIM = (152, 152, 166)

# Game scale: the floor tile is 112.3 world units, so a sprite pixel is half a
# floor pixel. F is the floor-pixel zoom; sprites draw at F/2 (make-loops.py).
F = 12
Z = 4  # every canvas fits the panel; relative scale between kinds is preserved

ROWS = [
    ("Snare Bloom", "venus, 51", "bog green / acid-green jaw", "snare-A", "snare-B"),
    ("The Shear", "mantis, 48", "gunmetal purple / violet blades", "shear-A", "shear-B"),
    ("Woofer", "giantBat, 50", "oxblood / crimson dust cap", "woofer-A", "woofer-B"),
    ("Howlback", "werewolf, 34 quadruped", "ochre brown / orange eyes", "howl-A", "howl-B"),
    ("Echo Shard", "ghost, 32", "dark violet glass / white cracks", "shard-A", "shard-B"),
    ("Echo Rush", "ghostSwarm, 32", "ice-white glass / pale blue", "rush-A", "rush-B"),
    ("Flare Mite", "redBat, 25", "rust red / orange eyes", "flare-A", "flare-B"),
    ("Static Mite", "bat, 21", "charcoal / white-blue eyes", "static-A", "static-B"),
]

CELL_W, CELL_H = 620, 400


def floor_panel(width: int, height: int) -> Image.Image:
    tile = Image.open(CAND / "floor-earth.png").convert("RGBA")
    tile = tile.resize((32 * F, 32 * F), Image.NEAREST)
    panel = Image.new("RGBA", (width, height))
    for y in range(0, height, tile.height):
        for x in range(0, width, tile.width):
            panel.paste(tile, (x, y))
    return panel


def main() -> None:
    cols = 2
    rows = (len(ROWS) + cols - 1) // cols
    sheet = Image.new("RGBA", (CELL_W * cols + 40, CELL_H * rows + 70), (20, 20, 24, 255))
    draw = ImageDraw.Draw(sheet)
    draw.text((22, 20), "Wave 3+4 pick gate - A on the left, B on the right, on the shipped floor",
              FG, font=FONT)

    for i, (label, kind, desc, a, b) in enumerate(ROWS):
        cx, cy = i % cols, i // cols
        left = 20 + cx * CELL_W
        top = 62 + cy * CELL_H
        draw.text((left, top), f"{label}  ({kind})", FG, font=FONT)
        draw.text((left, top + 24), desc, DIM, font=SMALL)

        panel = floor_panel(CELL_W - 24, CELL_H - 90)
        for j, name in enumerate((a, b)):
            path = CAND / f"{name}.png"
            if not path.exists():
                continue
            im = Image.open(path).convert("RGBA")
            im = im.resize((im.width * Z, im.height * Z), Image.NEAREST)
            x = (panel.width // 2) * j + (panel.width // 2 - im.width) // 2
            y = (panel.height - im.height) // 2
            panel.alpha_composite(im, (max(0, x), max(0, y)))
        sheet.alpha_composite(panel, (left, top + 46))
        draw.text((left + 8, top + 46 + panel.height + 4), f"{label} A", FG, font=SMALL)
        draw.text((left + panel.width // 2 + 8, top + 46 + panel.height + 4), f"{label} B", FG, font=SMALL)

    sheet.convert("RGB").save(OUT / "wave34-gate.png")
    print("wrote", OUT / "wave34-gate.png")


if __name__ == "__main__":
    main()
