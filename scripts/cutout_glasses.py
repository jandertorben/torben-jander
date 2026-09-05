#!/usr/bin/env python3
"""Stellt eine Brille mit klarem Glas frei und gibt dem Glas eine dezente Tönung.

Aufruf:
  python3 scripts/cutout_glasses.py <quelle> <ziel.png> [--edge "x1,y1 x2,y2 ..."] [--seed x,y]
                                    [--tint 0.40] [--check pfad.png] [--grid]

Ablauf:
  1. Rahmen, Nasenpad und Glaskante per Hintergrund-Erkennung (Abstand zur Hintergrundfarbe)
     kombiniert mit Apples Motivmaske (scripts/remove_background.swift).
  2. Das klare Glas ist im Foto fast hintergrundfarben und fällt dabei weg. Die vom Rahmen
     umschlossene Fläche wird deshalb per Flutfüllung gefunden und halbtransparent getönt.
     Ist die Glaskante im Foto nicht durchgehend sichtbar, schließt --edge sie mit einer
     Linie (Koordinaten im Arbeitsbild, siehe --grid). --seed ist ein Punkt im Glas.
  3. Beschnitt auf den Inhalt mit kleinem Rand.
Das Arbeitsbild ist die Quelle, auf höchstens 1800 Pixel Kantenlänge verkleinert.
"""
import os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        return sys.argv[i + 1] if i + 1 < len(sys.argv) else default
    return default

src, dst = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
edge = [tuple(float(v) for v in p.split(",")) for p in arg("--edge", "").split()] if arg("--edge") else []
seed = tuple(int(float(v)) for v in arg("--seed").split(",")) if arg("--seed") else None
tint = float(arg("--tint", "0.40"))
check = arg("--check")
grid = "--grid" in sys.argv

im0 = Image.open(src).convert("RGB"); im0.thumbnail((1800, 1800))
im = np.asarray(im0).astype(np.float32); h, w, _ = im.shape

# 1) Rahmen: Hintergrund-Abstand × Motivmaske
edge_px = np.concatenate([im[:10].reshape(-1, 3), im[-10:].reshape(-1, 3), im[:, :10].reshape(-1, 3), im[:, -10:].reshape(-1, 3)])
bgc = np.median(edge_px, axis=0)
dist = np.abs(im - bgc).max(axis=2)
lo, hi = 14.0, 70.0
key = np.clip((dist - lo) / (hi - lo), 0, 1); key = key * key * (3 - 2 * key)
vision = np.ones((h, w), np.float32)
with tempfile.TemporaryDirectory() as td:
    tmp = os.path.join(td, "src.png"); im0.save(tmp); out = os.path.join(td, "mask.png")
    r = subprocess.run(["swift", os.path.join(here, "remove_background.swift"), tmp, out], capture_output=True, text=True)
    if r.returncode == 0:
        vision = np.asarray(Image.open(out).convert("RGBA").split()[3].filter(ImageFilter.MaxFilter(15)).resize((w, h))).astype(np.float32) / 255
alpha = np.minimum(key, np.clip(vision * 1.5, 0, 1))
a = alpha[..., None]
fg = np.clip(np.where(a > 0.02, (im - (1 - a) * bgc) / np.maximum(a, 0.02), im), 0, 255)

# 2) Glasfläche
lens = np.zeros((h, w), bool)
if seed:
    solid = Image.fromarray((alpha > 0.35).astype(np.uint8) * 255, "L")
    if len(edge) > 1:
        ImageDraw.Draw(solid).line(edge, fill=255, width=8)
    closed = solid.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.MinFilter(15))
    lab = closed.copy(); px = lab.load()
    for x in range(0, w, 4):
        for y in (0, h - 1):
            if px[x, y] == 0: ImageDraw.floodfill(lab, (x, y), 128)
    for y in range(0, h, 4):
        for x in (0, w - 1):
            if px[x, y] == 0: ImageDraw.floodfill(lab, (x, y), 128)
    if lab.load()[seed] == 0:
        ImageDraw.floodfill(lab, seed, 255)
        lens = (np.asarray(lab) == 255) & (np.asarray(closed) != 255)
        print(f"Glasfläche: {int(lens.sum())} px")
    else:
        print("Warnung: Glaspunkt liegt nicht in einer umschlossenen Fläche, Glas bleibt ungetönt.", file=sys.stderr)

lens_s = np.asarray(Image.fromarray((lens * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.5))).astype(np.float32) / 255
yy = np.linspace(0, 1, h)[:, None]; xx = np.linspace(0, 1, w)[None, :]
tint_alpha = lens_s * np.clip(tint - 0.16 * yy - 0.06 * xx, tint * 0.4, tint)
lens_rgb = np.empty((h, w, 3), np.float32); lens_rgb[...] = (205, 215, 222)
final_a = np.maximum(alpha, tint_alpha)
wgt = np.where(final_a > 0, alpha / np.maximum(final_a, 1e-6), 0)[..., None]
rgb = fg * wgt + lens_rgb * (1 - wgt)
res = Image.fromarray(np.dstack([rgb, final_a * 255]).astype(np.uint8), "RGBA")

# 3) Beschnitt
bb = res.getbbox()
if bb:
    pad = int(max(w, h) * 0.03)
    res = res.crop((max(bb[0] - pad, 0), max(bb[1] - pad, 0), min(bb[2] + pad, w), min(bb[3] + pad, h)))
res.save(dst, "PNG", optimize=True)
print(f"{dst}: {res.width}x{res.height}")

if check:
    full = Image.fromarray(np.dstack([rgb, final_a * 255]).astype(np.uint8), "RGBA")
    bg = Image.new("RGBA", full.size, (27, 24, 17, 255)); bg.alpha_composite(full); bg = bg.convert("RGB")
    if grid:
        d = ImageDraw.Draw(bg)
        for x in range(0, w, 100):
            d.line([(x, 0), (x, h)], fill=(90, 80, 60), width=1); d.text((x + 2, 2), str(x), fill=(230, 200, 140))
        for y in range(0, h, 100):
            d.line([(0, y), (w, y)], fill=(90, 80, 60), width=1); d.text((2, y + 2), str(y), fill=(230, 200, 140))
    bg.save(check)
