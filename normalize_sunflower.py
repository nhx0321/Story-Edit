#!/usr/bin/env python3
"""Normalize sunflower sprite content sizes to match L0 (~238x238) on 512x512 canvas."""

from PIL import Image
import os
import shutil

BASE_DIR = "E:/Story Edit/工具开发/项目/story-edit/apps/web/public/assets/sprites/plant/sunflower"
TARGET = 238  # L0 content max dimension
CANVAS = 512

FILES = [
    "sunflower_L0.png",
    "sunflower_L1.png",
    "sunflower_L2.png",
    "sunflower_L3.png",
    "sunflower_L4.png",
    "sunflower_L5.png",
    "sunflower_L6.png",
    "sunflower_L7.png",
    "sunflower_L8.png",
    "sunflower_L9.png",
    "universal_egg.png",
]


def get_content_bbox(img):
    """Get bounding box of non-transparent content."""
    alpha = img.getchannel('A')
    bbox = alpha.getbbox()
    if bbox is None:
        return (0, 0, *img.size)
    return bbox


def normalize_image(path, skip_l0=True):
    name = os.path.basename(path)

    # Backup
    bak = path + ".bak"
    if not os.path.exists(bak):
        shutil.copy2(path, bak)
        print(f"  Backed up to {name}.bak")

    img = Image.open(path).convert('RGBA')
    w, h = img.size

    # Get content bbox
    bbox = get_content_bbox(img)
    cw, ch = bbox[2] - bbox[0], bbox[3] - bbox[1]

    if name == "sunflower_L0.png" and skip_l0:
        print(f"  L0 is baseline ({cw}x{ch}), skipping")
        return

    # Crop to content
    content = img.crop(bbox)

    # Calculate scale factor to fit within TARGET
    max_dim = max(cw, ch)
    scale = TARGET / max_dim
    new_w = round(cw * scale)
    new_h = round(ch * scale)

    # High-quality resize
    content = content.resize((new_w, new_h), Image.LANCZOS)

    # Create new 512x512 canvas and paste centered
    new_img = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    paste_x = (CANVAS - new_w) // 2
    paste_y = (CANVAS - new_h) // 2
    new_img.paste(content, (paste_x, paste_y), content)

    # Save
    new_img.save(path, 'PNG', optimize=True)
    new_size_kb = os.path.getsize(path) / 1024
    print(f"  {name}: {cw}x{ch} -> {new_w}x{new_h} (scale={scale:.3f}), {new_size_kb:.1f}KB")


def main():
    print("=== Sunflower Sprite Size Normalization ===")
    print(f"Target content size: ~{TARGET}px (matching L0)\n")

    for f in FILES:
        path = os.path.join(BASE_DIR, f)
        if not os.path.exists(path):
            print(f"SKIP (not found): {f}")
            continue
        print(f"Processing: {f}")
        normalize_image(path)

    print("\n=== Verification ===")
    for f in FILES:
        path = os.path.join(BASE_DIR, f)
        if not os.path.exists(path):
            continue
        img = Image.open(path)
        w, h = img.size
        mode = img.mode
        bbox = get_content_bbox(img)
        cw, ch = bbox[2] - bbox[0], bbox[3] - bbox[1]
        size_kb = os.path.getsize(path) / 1024
        print(f"  {f:25s} | {w}x{h} {mode:5s} | content: {cw:3d}x{ch:3d} | {size_kb:7.1f}KB")


if __name__ == "__main__":
    main()
