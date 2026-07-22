#!/usr/bin/env python3
"""Wave 2's own gate sheet: do the two sibling pairs separate in a crowd?

Wave 2 is the map's only wave made entirely of sibling pairs, and both pairs
co-spawn in 300-alive waves -- the Cabinets at 27:00 (`madforest.ts:98`) and the
Crowns at 29:00 (`madforest.ts:100`). The pairs and scene sheets show each
candidate alone; neither answers the question the wave actually turns on.

One panel per pair per variation letter, so the human sees the A-pairing and the
B-pairing judged the same way: the two kinds shuffled together at true game
scale on the shipped earth floor, at the density the run reaches.

Presentation only -- no ranking, no shortlist, no recommendation (#210).

Run from the repo root:

    python3 art/pixellab/make-wave2-crowd.py
"""

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CAND = ROOT / "pixellab" / "candidates"
OUT = ROOT / "pixellab"

FONT = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
SMALL = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)

BG = (24, 24, 28)
FG = (222, 222, 230)
DIM = (150, 150, 160)

# Game scale: one sprite pixel is half a floor pixel (#211's gate 1 sheets).
FLOOR = 8
SPRITE = FLOOR // 2

PANELS = [
    ("Cabinets, A candidates", "27:00 - grayMudman + greenMudman, 300 alive",
     ["moss-A.png", "crack-A.png"]),
    ("Cabinets, B candidates", "27:00 - grayMudman + greenMudman, 300 alive",
     ["moss-B.png", "crack-B.png"]),
    ("Crowns, A candidates", "29:00 - glowingBat + silverBat, 300 alive",
     ["signal-A.png", "silver-A.png"]),
    ("Crowns, B candidates", "29:00 - glowingBat + silverBat, 300 alive",
     ["signal-B.png", "silver-B.png"]),
]

PANEL_W, PANEL_H = 640, 300
COUNT = 26


def main() -> None:
    tile = Image.open(CAND / "floor-earth.png").convert("RGBA")
    tile = tile.resize((tile.width * FLOOR, tile.height * FLOOR), Image.NEAREST)

    sheet = Image.new("RGBA", (PANEL_W * 2 + 48, (PANEL_H + 72) * 2 + 56), BG)
    d = ImageDraw.Draw(sheet)
    d.text(
        (16, 16),
        "Wave 2 sibling check - both kinds mixed at true game scale, "
        "at the density their shared wave reaches",
        font=FONT,
        fill=FG,
    )

    for i, (title, sub, files) in enumerate(PANELS):
        px = 16 + (i % 2) * (PANEL_W + 16)
        py = 56 + (i // 2) * (PANEL_H + 72)
        panel = Image.new("RGBA", (PANEL_W, PANEL_H))
        for gy in range(0, PANEL_H, tile.height):
            for gx in range(0, PANEL_W, tile.width):
                panel.paste(tile, (gx, gy))

        sprites = []
        for f in files:
            im = Image.open(CAND / f).convert("RGBA").crop(
                Image.open(CAND / f).convert("RGBA").getbbox()
            )
            sprites.append(im.resize(
                (im.width * SPRITE, im.height * SPRITE), Image.NEAREST))

        # Fixed seed: the scatter must be identical every time the sheet is
        # rebuilt, or two runs of the gate are not the same gate.
        rng = random.Random(220)
        placed = [
            (rng.randrange(8, PANEL_W - 40), rng.randrange(8, PANEL_H - 56),
             sprites[k % len(sprites)])
            for k in range(COUNT)
        ]
        # Painter's order, so the crowd overlaps the way the renderer draws it.
        for x, y, s in sorted(placed, key=lambda p: p[1]):
            panel.alpha_composite(s, (x, y))

        sheet.alpha_composite(panel, (px, py))
        d.text((px, py - 30), title, font=FONT, fill=FG)
        d.text((px, py + PANEL_H + 6), sub, font=SMALL, fill=DIM)
        d.text((px, py + PANEL_H + 24), " + ".join(files), font=SMALL, fill=DIM)

    sheet.convert("RGB").save(OUT / "wave2-crowd.png")
    print("wave 2 crowd sheet -> art/pixellab/wave2-crowd.png")


if __name__ == "__main__":
    main()
