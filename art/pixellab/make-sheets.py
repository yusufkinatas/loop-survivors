"""Build Gate 1 contact sheets from the batch-1 candidates.

Presentation only: every candidate is drawn at the same size, in a fixed order,
with no ranking or annotation beyond its label.
"""

from PIL import Image, ImageDraw, ImageFont

HERE = "art/pixellab/candidates/"
OUT = "art/pixellab/"

FONT = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
SMALL = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)

BG = (24, 24, 28)
FG = (222, 222, 230)


def checker(w, h, cell=8, a=(58, 58, 64), b=(44, 44, 50)):
    im = Image.new("RGBA", (w, h), a)
    d = ImageDraw.Draw(im)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if (x // cell + y // cell) % 2:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=b)
    return im


def load(name):
    return Image.open(HERE + name).convert("RGBA")


def up(im, f):
    return im.resize((im.width * f, im.height * f), Image.NEAREST)


# ---------------------------------------------------------------- characters
CHARS = [
    ("Night Mite A", "mite-A.png"),
    ("Night Mite B", "mite-B.png"),
    ("Night Mite C", "mite-C.png"),
    ("Cable Husk A", "husk-A.png"),
    ("Cable Husk B", "husk-B.png"),
    ("Cable Husk C", "husk-C.png"),
    ("Midnight DJ A", "dj-A.png"),
    ("Midnight DJ B", "dj-B.png"),
]

SCALE = 6
CELL_W, CELL_H = 48 * SCALE + 24, 48 * SCALE + 64
COLS = 4
rows = (len(CHARS) + COLS - 1) // COLS
sheet = Image.new("RGBA", (CELL_W * COLS, CELL_H * rows + 40), BG)
d = ImageDraw.Draw(sheet)
d.text((16, 12), "Batch 1 candidates — south facing, 6x nearest-neighbour", font=FONT, fill=FG)

for i, (label, fn) in enumerate(CHARS):
    im = load(fn)
    big = up(im, SCALE)
    cx = (i % COLS) * CELL_W
    cy = (i // COLS) * CELL_H + 40
    pad_x = cx + (CELL_W - big.width) // 2
    pad_y = cy + 34
    board = checker(big.width, big.height)
    board.alpha_composite(big)
    sheet.paste(board, (pad_x, pad_y))
    d.text((cx + 12, cy + 8), label, font=FONT, fill=FG)
    d.text(
        (cx + 12, cy + 40 + big.height),
        f"{im.width}x{im.height} canvas",
        font=SMALL,
        fill=(150, 150, 160),
    )

sheet.convert("RGB").save(OUT + "gate1-characters.png")

# ------------------------------------------------------------ actual size 1:1
strip = Image.new("RGBA", (len(CHARS) * 64 + 16, 110), BG)
d = ImageDraw.Draw(strip)
d.text((8, 8), "Same eight at 1:1 — the size they appear in game", font=SMALL, fill=FG)
for i, (label, fn) in enumerate(CHARS):
    im = load(fn)
    x = 8 + i * 64
    board = checker(im.width, im.height)
    board.alpha_composite(im)
    strip.paste(board, (x, 34))
    d.text((x, 34 + im.height + 4), label.split()[-1], font=SMALL, fill=(150, 150, 160))
strip.convert("RGB").save(OUT + "gate1-characters-1to1.png")

# --------------------------------------------------------------------- floors
FLOORS = [("Floor: earth variant", "floor-earth.png"), ("Floor: moss variant", "floor-moss.png")]
FS = 6
TILE = 32 * FS
GRID = 4
fw = TILE * GRID
fsheet = Image.new("RGBA", (fw * 2 + 48, fw + 96), BG)
d = ImageDraw.Draw(fsheet)
d.text((16, 12), "Floor candidates — one 32x32 tile repeated 4x4, 6x", font=FONT, fill=FG)
for i, (label, fn) in enumerate(FLOORS):
    t = up(load(fn), FS)
    x0 = 16 + i * (fw + 16)
    d.text((x0, 44), label, font=FONT, fill=FG)
    for gy in range(GRID):
        for gx in range(GRID):
            fsheet.paste(t, (x0 + gx * TILE, 76 + gy * TILE))
fsheet.convert("RGB").save(OUT + "gate1-floors.png")

# ------------------------------------------------- characters on floor, to scale
# Game scale: floor tile = 112.3 world units; a sprite pixel is half a floor pixel.
F = 8
sc_w = 32 * F * 5
sc_h = 32 * F * 3
for name, fn in FLOORS:
    key = fn.replace("floor-", "").replace(".png", "")
    t = up(load(fn), F)
    scene = Image.new("RGBA", (sc_w, sc_h + 40), BG)
    for gy in range(0, sc_h, t.height):
        for gx in range(0, sc_w, t.width):
            scene.paste(t, (gx, gy + 40))
    d = ImageDraw.Draw(scene)
    d.text((12, 12), f"To game scale on the {key} floor", font=FONT, fill=FG)
    xs = 40
    for label, cf in CHARS:
        im = load(cf)
        s = im.resize((im.width * F // 2, im.height * F // 2), Image.NEAREST)
        scene.alpha_composite(s, (xs, 40 + (sc_h - s.height) // 2))
        xs += s.width + 24
    scene.convert("RGB").save(OUT + f"gate1-scene-{key}.png")

print("sheets written")
