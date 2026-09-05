#!/usr/bin/env python3
"""Macht aus einem Produktfoto mit weißem Hintergrund ein freigestelltes PNG.

Aufruf: python3 scripts/prepare_product_image.py <quelle> <ziel.png>
Weiße und fast weiße Pixel werden transparent, halbtransparente Kanten bleiben weich,
danach wird auf den Inhalt beschnitten und ein kleiner Rand ergänzt.
"""
import sys
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
r, g, b, a = im.split()
# Helligkeit → Alpha: sehr helle Pixel werden transparent, mit weichem Übergang
lum = Image.merge("RGB", (r, g, b)).convert("L")
alpha = lum.point(lambda v: 0 if v >= 250 else (255 if v <= 225 else int(255 * (250 - v) / 25)))
alpha = alpha.filter(ImageFilter.GaussianBlur(0.6))
im.putalpha(alpha)
bbox = im.getbbox()
if bbox:
    pad = int(max(im.size) * 0.03)
    im = im.crop((max(bbox[0]-pad, 0), max(bbox[1]-pad, 0), min(bbox[2]+pad, im.width), min(bbox[3]+pad, im.height)))
im.save(dst, "PNG", optimize=True)
print(f"{dst}: {im.width}x{im.height}")
