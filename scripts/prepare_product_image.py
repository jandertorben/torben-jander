#!/usr/bin/env python3
"""Stellt ein Produktfoto mit weißem Hintergrund sauber frei.

Aufruf: python3 scripts/prepare_product_image.py <quelle> <ziel.png>

Zwei Masken werden kombiniert:
  1. Motivmaske aus Apples Vision-Framework (scripts/remove_background.swift) für saubere Außenkanten
  2. Weiß-Erkennung über den Abstand zu Reinweiß für Zwischenräume (z. B. zwischen Speichen)
Anschließend wird der weiße Anteil aus halbtransparenten Kantenpixeln herausgerechnet,
damit auf dunklem Grund kein heller Saum bleibt. Zum Schluss Beschnitt mit kleinem Rand.
"""
import os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))

im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
h, w, _ = im.shape

# 1) Vision-Maske
vision = np.ones((h, w), np.float32)
with tempfile.TemporaryDirectory() as td:
    out = os.path.join(td, "mask.png")
    r = subprocess.run(["swift", os.path.join(here, "remove_background.swift"), src, out], capture_output=True, text=True)
    if r.returncode == 0 and os.path.exists(out):
        a = Image.open(out).convert("RGBA").split()[3].resize((w, h), Image.LANCZOS)
        vision = np.asarray(a).astype(np.float32) / 255.0
    else:
        print("Hinweis: Vision-Maske nicht verfügbar, nur Weiß-Erkennung.", r.stderr.strip()[:200])

# 2) Weiß-Erkennung: Abstand zu Weiß = wie weit der dunkelste Kanal von 255 entfernt ist
dist = 255.0 - im.min(axis=2)
lo, hi = 10.0, 34.0                       # bis lo: Hintergrund, ab hi: Motiv, dazwischen weich
key = np.clip((dist - lo) / (hi - lo), 0, 1)
key = key * key * (3 - 2 * key)           # Smoothstep für ruhige Kanten

alpha = np.minimum(vision, key)

# 3) Weiß aus Kantenpixeln herausrechnen: C = a*F + (1-a)*255  =>  F = (C - (1-a)*255) / a
a = alpha[..., None]
fg = np.where(a > 0.02, (im - (1 - a) * 255.0) / np.maximum(a, 0.02), im)
fg = np.clip(fg, 0, 255)

rgba = np.dstack([fg, alpha * 255.0]).astype(np.uint8)
res = Image.fromarray(rgba, "RGBA")

bbox = res.getbbox()
if bbox:
    pad = int(max(w, h) * 0.03)
    res = res.crop((max(bbox[0] - pad, 0), max(bbox[1] - pad, 0), min(bbox[2] + pad, w), min(bbox[3] + pad, h)))
res.save(dst, "PNG", optimize=True)
print(f"{dst}: {res.width}x{res.height}")
