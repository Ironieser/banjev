# Generate icons/*.png: a white "J" inside a prohibition sign on a red rounded square.
# Usage: python3 scripts/make-icons.py  (needs Pillow)
from PIL import Image, ImageDraw, ImageFont

RED, WHITE = (198, 40, 40, 255), (255, 255, 255, 255)
S = 1024  # draw large, downsample for smooth edges


def icon(ring=True):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.2), fill=RED)
    c, R, w = S / 2, S * 0.40, S * (0.06 if ring else 0.09)
    if ring:
        d.ellipse([c - R, c - R, c + R, c + R], outline=WHITE, width=int(w))

    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', int(S * (0.6 if ring else 0.8)))
    l, t, r, b = d.textbbox((0, 0), 'J', font=font)
    d.text((c - (l + r) / 2, c - (t + b) / 2), 'J', font=font, fill=WHITE)

    # slash from top-left to bottom-right inside the ring, with a red border so the J stays readable
    k = (R - w / 2) * 0.7071
    line = [(c - k, c - k), (c + k, c + k)]
    d.line(line, fill=RED, width=int(w * 1.8))
    d.line(line, fill=WHITE, width=int(w))
    return im


big = icon()
# 16px has no room for the ring: just a slashed J
icon(ring=False).resize((16, 16), Image.LANCZOS).save('icons/16.png')
for n in (48, 128):
    big.resize((n, n), Image.LANCZOS).save(f'icons/{n}.png')
big.resize((512, 512), Image.LANCZOS).save('docs/logo.png')
