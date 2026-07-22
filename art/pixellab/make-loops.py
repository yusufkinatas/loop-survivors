"""Build the Gate 2 review material: each 4-frame loop as a GIF at its concept
tempo over the chosen earth floor, plus a still frame strip.

Playback tempo is a renderer concern for #212 — v3 emits frames, not a frame
rate. These tempos are the ones the concept tickets specify.
"""

from PIL import Image, ImageDraw, ImageFont

ANIM = "art/pixellab/animations/"
CAND = "art/pixellab/candidates/"
OUT = "art/pixellab/"

FONT = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
SMALL = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
BG = (24, 24, 28)
FG = (222, 222, 230)

LOOPS = [
    ("Night Mite B — hover", "mite-hover", 8),  # #207: ~8 fps
    ("Cable Husk B — shamble", "husk-shamble", 4),  # #208: 4 fps
    ("Midnight DJ A — walk", "dj-walk", 8),  # #206: ~4-frame walk, tempo open
    # Wave 1 of the whole-roster map (#219). Tempo per enemy, from how it moves.
    ("Gaffer Husk A — lumber", "gaffer-lumber", 3),
    ("Jackwalker B — march", "jack-march", 5),
    ("Mute Bloom B — sway", "bloom-sway", 3),
    ("Static Rush A — charge", "rush-charge", 10),
]

# Game scale: the floor tile is 112.3 world units, so a sprite pixel is half a
# floor pixel. F is the floor-pixel zoom; sprites draw at F/2.
F = 12
floor_tile = Image.open(CAND + "floor-earth.png").convert("RGBA")
floor_tile = floor_tile.resize((32 * F, 32 * F), Image.NEAREST)


def stage(w, h):
    bg = Image.new("RGBA", (w, h))
    for y in range(0, h, floor_tile.height):
        for x in range(0, w, floor_tile.width):
            bg.paste(floor_tile, (x, y))
    return bg


def frames(prefix):
    out = []
    for i in range(4):
        try:
            out.append(Image.open(f"{ANIM}{prefix}-{i}.png").convert("RGBA"))
        except FileNotFoundError:
            return []
    return out


for label, prefix, fps in LOOPS:
    fs = frames(prefix)
    if not fs:
        print(f"skip {label} — frames not downloaded yet")
        continue

    sw, sh = fs[0].width * F // 2, fs[0].height * F // 2
    pad = 40
    W, H = sw + pad * 2, sh + pad * 2
    board = stage(W, H)

    gif = []
    for f in fs:
        cell = board.copy()
        cell.alpha_composite(f.resize((sw, sh), Image.NEAREST), (pad, pad))
        gif.append(cell.convert("RGB"))
    gif[0].save(
        OUT + f"gate2-{prefix}.gif",
        save_all=True,
        append_images=gif[1:],
        duration=int(1000 / fps),
        loop=0,
    )

    # still strip, 6x, on a flat dark background
    S = 6
    cw, ch = fs[0].width * S, fs[0].height * S
    strip = Image.new("RGBA", (cw * 4 + 60, ch + 80), BG)
    d = ImageDraw.Draw(strip)
    d.text((12, 12), f"{label} — 4 frames, played at {fps} fps", font=FONT, fill=FG)
    for i, f in enumerate(fs):
        x = 12 + i * (cw + 12)
        strip.alpha_composite(f.resize((cw, ch), Image.NEAREST), (x, 44))
        d.text((x, 44 + ch + 6), f"frame {i}", font=SMALL, fill=(150, 150, 160))
    strip.convert("RGB").save(OUT + f"gate2-{prefix}-frames.png")
    print(f"wrote gate2-{prefix}.gif and -frames.png ({fps} fps)")
