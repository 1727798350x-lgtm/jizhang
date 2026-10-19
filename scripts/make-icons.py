"""生成 PWA 图标（PNG）。用法：python scripts/make-icons.py"""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "icons")
os.makedirs(OUT_DIR, exist_ok=True)

TOP = (91, 116, 255)
BOTTOM = (63, 82, 220)
WHITE = (255, 255, 255, 255)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
]


def find_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def gradient(size):
    img = Image.new("RGBA", (size, size))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(size - 1, 1)
        color = (
            int(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
            int(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
            int(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
            255,
        )
        draw.line([(0, y), (size, y)], fill=color)
    return img


def make_icon(size, rounded=True):
    img = gradient(size)

    if rounded:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255
        )
        img.putalpha(mask)

    draw = ImageDraw.Draw(img)
    font = find_font(int(size * 0.5))
    text = "¥"
    box = draw.textbbox((0, 0), text, font=font)
    text_w = box[2] - box[0]
    text_h = box[3] - box[1]
    x = (size - text_w) // 2 - box[0]
    y = (size - text_h) // 2 - box[1]

    # 轻微投影 + 白色符号
    shadow = max(1, int(size * 0.012))
    draw.text((x + shadow, y + shadow), text, font=font, fill=(10, 20, 70, 60))
    draw.text((x, y), text, font=font, fill=WHITE)

    # 底部小圆点装饰
    dot_r = max(2, int(size * 0.022))
    dot_y = int(size * 0.78)
    for offset in (-1, 0, 1):
        cx = int(size / 2 + offset * size * 0.075)
        draw.ellipse(
            [cx - dot_r, dot_y - dot_r, cx + dot_r, dot_y + dot_r],
            fill=(255, 255, 255, 130),
        )
    return img


TARGETS = [
    ("icon-192.png", 192, True),
    ("icon-512.png", 512, True),
    ("icon-maskable-512.png", 512, False),
    ("apple-touch-icon-180.png", 180, True),
    ("favicon-32.png", 32, True),
]

for name, size, rounded in TARGETS:
    icon = make_icon(size, rounded=rounded)
    path = os.path.join(OUT_DIR, name)
    icon.save(path, "PNG")
    print(f"生成 {path} ({size}x{size})")
