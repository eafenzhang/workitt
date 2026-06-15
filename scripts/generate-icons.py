"""Generate all icon sizes and formats from source image."""
import os
from PIL import Image

SRC = r"C:\Users\121212\Desktop\新文件\256x256 深灰黑.png"
DST_DIR = r"C:\Users\121212\workit\build"
PUBLIC_DIR = r"C:\Users\121212\workit\public"

# Size configuration: (name, size)
PNG_SIZES = [
    ("icon-16.png", 16),
    ("icon-32.png", 32),
    ("icon-48.png", 48),
    ("icon-64.png", 64),
    ("icon-128.png", 128),
    ("icon-256.png", 256),
    ("icon-512.png", 512),
]

img = Image.open(SRC).convert("RGBA")
print(f"Source: {img.size}, mode: {img.mode}")

# Generate all PNG sizes
for name, size in PNG_SIZES:
    resized = img.resize((size, size), Image.LANCZOS)
    path = os.path.join(DST_DIR, name)
    resized.save(path, "PNG")
    print(f"  Generated: {path} ({size}x{size})")

# Generate ICO (Windows) — contains 16, 32, 48, 256
ico_path = os.path.join(DST_DIR, "icon.ico")
ico_sizes = [(16, 16), (32, 32), (48, 48), (256, 256)]
ico_images = [img.resize(s, Image.LANCZOS) for s in ico_sizes]
ico_images[0].save(ico_path, format="ICO", sizes=[(s[0], s[0]) for s in ico_sizes], append_images=ico_images[1:])
print(f"  Generated: {ico_path} (16/32/48/256)")

# Generate ICNS (macOS)
icns_path = os.path.join(DST_DIR, "icon.icns")
icns_sizes = [16, 32, 64, 128, 256, 512]
icns_images = []
for s in icns_sizes:
    r = img.resize((s, s), Image.LANCZOS)
    icns_images.append(r)
    # macOS needs @2x versions too
    s2x = s * 2
    if s2x <= 512:
        r2x = img.resize((s2x, s2x), Image.LANCZOS)
        icns_images.append(r2x)
try:
    icns_images[0].save(icns_path, format="ICNS", append_images=icns_images[1:])
    print(f"  Generated: {icns_path}")
except Exception as e:
    print(f"  ICNS skipped (Windows host): {e}")

# Copy key files to public/ for Electron packaging
import shutil
for f in ["icon.png", "icon.ico", "icon-256.png", "favicon.png"]:
    src_f = os.path.join(DST_DIR, f)
    if os.path.exists(src_f):
        shutil.copy2(src_f, os.path.join(PUBLIC_DIR, f))
        print(f"  Copied to public/: {f}")

# Also copy icon.png (as the 256 variant for backward compat)
src_256 = os.path.join(DST_DIR, "icon-256.png")
dst_icon = os.path.join(DST_DIR, "icon.png")
shutil.copy2(src_256, dst_icon)
print(f"  icon.png ← icon-256.png")

# Generate favicon.ico (16/32/48) for web
favicon_path = os.path.join(PUBLIC_DIR, "favicon.ico")
fav_images = [img.resize((16, 16), Image.LANCZOS), img.resize((32, 32), Image.LANCZOS)]
fav_images[0].save(favicon_path, format="ICO", sizes=[(16, 16), (32, 32)], append_images=[fav_images[1]])
print(f"  Generated: {favicon_path}")

# Also copy favicon.ico to dist for immediate use
if os.path.exists(r"C:\Users\121212\workit\dist"):
    shutil.copy2(favicon_path, os.path.join(r"C:\Users\121212\workit\dist", "favicon.ico"))
    print(f"  Copied to dist/: favicon.ico")

print("\nDone! All icon assets generated.")
