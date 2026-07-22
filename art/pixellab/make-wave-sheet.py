#!/usr/bin/env python3
"""Build a wave gate contact sheet from candidate PNGs.

Presentation only. Every candidate is drawn at the same magnification, in a
fixed order, with no ranking, shortlist or recommendation -- #210's rule, which
map #217 inherits. The human picks 1 of 2 per enemy from these raw candidates.

Three sheets per wave:

  wave<N>-pairs.png    each enemy's two variations side by side, 6x
  wave<N>-1to1.png     all candidates at 1:1, the size they appear in game
  wave<N>-scene.png    all candidates composited on the shipped earth floor at
                       true game scale, which is the only view that shows
                       whether a sprite separates from the ground

Run from the repo root:

    python3 art/pixellab/make-wave-sheet.py 1
"""

import json
import sys
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


def checker(w, h, cell=8, a=(58, 58, 64), b=(44, 44, 50)):
    im = Image.new("RGBA", (w, h), a)
    d = ImageDraw.Draw(im)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if (x // cell + y // cell) % 2:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=b)
    return im


def up(im, f):
    return im.resize((im.width * f, im.height * f), Image.NEAREST)


def main() -> None:
    wave = sys.argv[1] if len(sys.argv) > 1 else "1"
    manifest = json.loads((CAND / f"wave{wave}.json").read_text())
    enemies = manifest["enemies"]

    # ------------------------------------------------------------ pairs, 6x
    SCALE = 6
    # One column per variation, one row per enemy, so the pick is a left/right
    # choice and siblings never end up on different rows.
    maxc = max(
        max(Image.open(CAND / v["file"]).width for v in e["variations"])
        for e in enemies
    )
    cell_w = maxc * SCALE + 40
    cell_h = maxc * SCALE + 76
    cols = max(len(e["variations"]) for e in enemies)
    sheet = Image.new("RGBA", (cell_w * cols + 220, cell_h * len(enemies) + 48), BG)
    d = ImageDraw.Draw(sheet)
    d.text(
        (16, 14),
        f"Wave {wave} candidates - south facing, {SCALE}x nearest-neighbour. "
        "Pick one per row.",
        font=FONT,
        fill=FG,
    )

    for row, enemy in enumerate(enemies):
        cy = row * cell_h + 48
        d.text((16, cy + cell_h // 2 - 24), enemy["label"], font=FONT, fill=FG)
        d.text(
            (16, cy + cell_h // 2 + 2),
            f"size {enemy['size']} - band {enemy['band']}",
            font=SMALL,
            fill=DIM,
        )
        for col, var in enumerate(enemy["variations"]):
            im = Image.open(CAND / var["file"]).convert("RGBA")
            big = up(im, SCALE)
            cx = 220 + col * cell_w
            board = checker(big.width, big.height)
            board.alpha_composite(big)
            sheet.paste(board, (cx + (cell_w - big.width) // 2, cy + 30))
            d.text((cx + 12, cy + 4), var["name"], font=FONT, fill=FG)
            d.text(
                (cx + 12, cy + 36 + big.height),
                f"{im.width}x{im.height} canvas",
                font=SMALL,
                fill=DIM,
            )

    sheet.convert("RGB").save(OUT / f"wave{wave}-pairs.png")

    # ------------------------------------------------------- 1:1, actual size
    flat = [(e["label"], v) for e in enemies for v in e["variations"]]
    strip = Image.new("RGBA", (len(flat) * 80 + 16, 130), BG)
    d = ImageDraw.Draw(strip)
    d.text((8, 8), "At 1:1 - the size they appear in game", font=SMALL, fill=FG)
    for i, (label, var) in enumerate(flat):
        im = Image.open(CAND / var["file"]).convert("RGBA")
        x = 8 + i * 80
        board = checker(im.width, im.height)
        board.alpha_composite(im)
        strip.paste(board, (x, 34))
        d.text((x, 34 + im.height + 4), var["name"], font=SMALL, fill=DIM)
    strip.convert("RGB").save(OUT / f"wave{wave}-1to1.png")

    # -------------------------------------------- on the floor, at game scale
    # Game scale: the floor tile is 112.3 world units, so one sprite pixel is
    # half a floor pixel (established in #211's gate 1 sheets).
    F = 8
    tile = up(Image.open(OUT / "candidates" / "floor-earth.png").convert("RGBA"), F)
    sc_w = sum(
        Image.open(CAND / v["file"]).width * F // 2 + 28 for _, v in flat
    ) + 80
    sc_h = 32 * F * 3
    scene = Image.new("RGBA", (sc_w, sc_h + 48), BG)
    for gy in range(0, sc_h, tile.height):
        for gx in range(0, sc_w, tile.width):
            scene.paste(tile, (gx, gy + 48))
    d = ImageDraw.Draw(scene)
    d.text(
        (12, 14),
        "To game scale on the shipped earth floor - relative sizes are true",
        font=FONT,
        fill=FG,
    )
    xs = 40
    for label, var in flat:
        im = Image.open(CAND / var["file"]).convert("RGBA")
        s = im.resize((im.width * F // 2, im.height * F // 2), Image.NEAREST)
        scene.alpha_composite(s, (xs, 48 + (sc_h - s.height) // 2))
        d.text((xs, sc_h + 24), var["name"], font=SMALL, fill=DIM)
        xs += s.width + 28
    scene.convert("RGB").save(OUT / f"wave{wave}-scene.png")

    print(f"wave {wave}: {len(flat)} candidates -> pairs, 1to1, scene")


if __name__ == "__main__":
    main()
