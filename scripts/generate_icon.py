"""Generate minimalist black icon with sound wave bars at 1024x1024."""
from PIL import Image, ImageDraw
from pathlib import Path

SIZE = 1024
BG = (10, 10, 12, 255)
FG = (245, 245, 247, 255)
RADIUS = int(SIZE * 0.225)

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw.rounded_rectangle((0, 0, SIZE, SIZE), radius=RADIUS, fill=BG)

bar_count = 9
heights_pct = [0.18, 0.34, 0.55, 0.78, 1.00, 0.78, 0.55, 0.34, 0.18]
max_h = int(SIZE * 0.52)
bar_w = int(SIZE * 0.055)
gap = int(SIZE * 0.035)
total_w = bar_count * bar_w + (bar_count - 1) * gap
start_x = (SIZE - total_w) // 2
cy = SIZE // 2
bar_radius = bar_w // 2

for i, pct in enumerate(heights_pct):
    h = int(max_h * pct)
    x0 = start_x + i * (bar_w + gap)
    x1 = x0 + bar_w
    y0 = cy - h // 2
    y1 = cy + h // 2
    draw.rounded_rectangle((x0, y0, x1, y1), radius=bar_radius, fill=FG)

out = Path(__file__).resolve().parent.parent / "src-tauri" / "icons" / "_source.png"
img.save(out, "PNG")
print(f"wrote {out}")
