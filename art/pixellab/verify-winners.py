"""Winners-only technical checks (#210) plus the floor acceptance test (#209).

Run after Gate 1. Hard failures here are re-rolled before any animation
generation is spent.
"""

from PIL import Image

HERE = "art/pixellab/candidates/"

# VS frame sizes the sprite has to fit: MAD_FOREST_FRAMES in src/game/config.ts.
# The player has no frame entry — radius 9 VS-px, and #206 sized him ~30.
WINNERS = [
    ("Night Mite B", "mite-B.png", (30, 27)),
    ("Cable Husk B", "husk-B.png", (31, 33)),
    ("Midnight DJ A", "dj-A.png", (30, 30)),
]


def luminance(px):
    r, g, b = px[:3]
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255


print("=== characters: alpha + trim ===")
for label, fn, (fw, fh) in WINNERS:
    im = Image.open(HERE + fn)
    has_alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
    im = im.convert("RGBA")
    bbox = im.getchannel("A").getbbox()
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    opaque = sum(1 for p in im.getdata() if p[3] > 0)
    fits = w <= fw and h <= fh
    print(f"\n{label}  canvas {im.width}x{im.height}")
    print(f"  alpha channel        : {'yes' if has_alpha else 'NO'}")
    print(f"  fully-transparent px : {im.width * im.height - opaque}/{im.width * im.height}")
    print(f"  content bbox         : {bbox} -> {w}x{h}")
    print(f"  VS frame             : {fw}x{fh}")
    verdict = "YES" if fits else f"NO — overflows by {max(0, w - fw)}x{max(0, h - fh)}"
    print(f"  trims to frame       : {verdict}")
    im.crop(bbox).save(HERE + fn.replace(".png", "-trimmed.png"))

print("\n=== floor: #209 acceptance test ===")
floor = Image.open(HERE + "floor-earth.png").convert("RGB")
w, h = floor.size
px = list(floor.getdata())

# 2. brightness
lums = sorted(luminance(p) for p in px)
bulk = sum(lums) / len(lums)
ceiling = luminance((0x3F, 0x7F, 0x59))  # SOUNDWOOD.moss
brightest = max(px, key=luminance)
print(f"  mean luminance   : {bulk:.3f}  (limit ~0.25)  -> {'PASS' if bulk < 0.25 else 'FAIL'}")
print(f"  median luminance : {lums[len(lums) // 2]:.3f}")
print(
    f"  brightest pixel  : #{brightest[0]:02x}{brightest[1]:02x}{brightest[2]:02x} "
    f"lum {luminance(brightest):.3f}  (ceiling #3f7f59 = {ceiling:.3f})  -> "
    f"{'PASS' if luminance(brightest) <= ceiling else 'FAIL'}"
)
over = sum(1 for p in px if luminance(p) > ceiling)
print(f"  px over ceiling  : {over}/{len(px)} ({100 * over / len(px):.1f}%)")

# 3. hue
r = sum(p[0] for p in px) / len(px)
g = sum(p[1] for p in px) / len(px)
b = sum(p[2] for p in px) / len(px)
print(f"  mean RGB         : ({r:.0f}, {g:.0f}, {b:.0f})")

# 1. wrap check — compare the seam that appears at a 16px offset against the
# average difference between neighbouring columns/rows inside the tile.
rolled = floor.copy()
rolled.paste(floor.crop((16, 0, 32, 32)), (0, 0))
rolled.paste(floor.crop((0, 0, 16, 32)), (16, 0))
tmp = rolled.copy()
rolled.paste(tmp.crop((0, 16, 32, 32)), (0, 0))
rolled.paste(tmp.crop((0, 0, 32, 16)), (0, 16))
rolled.save(HERE + "floor-earth-offset.png")


def col_diff(im, x):
    a = [im.getpixel((x % im.width, y)) for y in range(im.height)]
    b = [im.getpixel(((x + 1) % im.width, y)) for y in range(im.height)]
    return sum(abs(p[i] - q[i]) for p, q in zip(a, b) for i in range(3)) / (im.height * 3)


def row_diff(im, y):
    a = [im.getpixel((x, y % im.height)) for x in range(im.width)]
    b = [im.getpixel((x, (y + 1) % im.height)) for x in range(im.width)]
    return sum(abs(p[i] - q[i]) for p, q in zip(a, b) for i in range(3)) / (im.width * 3)


inner_c = [col_diff(floor, x) for x in range(w - 1)]
inner_r = [row_diff(floor, y) for y in range(h - 1)]
seam_c = col_diff(floor, w - 1)  # last column vs first column
seam_r = row_diff(floor, h - 1)
avg_c = sum(inner_c) / len(inner_c)
avg_r = sum(inner_r) / len(inner_r)
print(f"  vertical seam    : {seam_c:.1f} vs interior mean {avg_c:.1f} "
      f"(max {max(inner_c):.1f}) -> ratio {seam_c / avg_c:.2f}")
print(f"  horizontal seam  : {seam_r:.1f} vs interior mean {avg_r:.1f} "
      f"(max {max(inner_r):.1f}) -> ratio {seam_r / avg_r:.2f}")
