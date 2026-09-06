#!/usr/bin/env python3
"""Erzeugt die eigenen Mauszeiger (Fahrrad für die Hero-Karte, Wisch-Pfeil für den Slider) als PNG in 32 und 64 px."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "static", "img"); os.makedirs(OUT, exist_ok=True)
OCHRE, MINT, INK, DARK = (240, 192, 122, 255), (185, 236, 224, 255), (239, 232, 218, 255), (11, 10, 8, 230)
S = 8  # Überabtastung für weiche Kanten

def bike(size):
    W = size * S; im = Image.new("RGBA", (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    u = W / 32
    def outline(fn, w_out, w_in):
        fn(DARK, w_out); fn(OCHRE, w_in)
    r = 6.5 * u
    def wheels(col, w):
        d.ellipse([3*u - r + 5.5*u, 25*u - r, 3*u + r + 5.5*u, 25*u + r], outline=col, width=int(w))
        d.ellipse([23.5*u - r, 25*u - r, 23.5*u + r, 25*u + r], outline=col, width=int(w))
    def frame(col, w):
        pts = [(8.5*u, 25*u), (13*u, 14*u), (23.5*u, 25*u), (16.5*u, 25*u), (13*u, 14*u)]
        d.line(pts, fill=col, width=int(w), joint="curve")
        d.line([(13*u, 14*u), (11*u, 9*u)], fill=col, width=int(w))        # Sattelstütze
        d.line([(8*u, 8.5*u), (14*u, 8.5*u)], fill=col, width=int(w))      # Sattel
        d.line([(16.5*u, 25*u), (21*u, 11*u)], fill=col, width=int(w))     # Gabel/Lenkerrohr
        d.line([(19*u, 10*u), (24*u, 8*u)], fill=col, width=int(w))        # Lenker
    outline(wheels, 3.4*u, 1.8*u); outline(frame, 3.6*u, 2*u)
    return im.resize((size, size), Image.LANCZOS)

def swipe(size):
    W = size * S; im = Image.new("RGBA", (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    u = W / 32
    def arrows(col, w):
        d.line([(5*u, 16*u), (27*u, 16*u)], fill=col, width=int(w))
        d.line([(10*u, 10*u), (4*u, 16*u), (10*u, 22*u)], fill=col, width=int(w), joint="curve")
        d.line([(22*u, 10*u), (28*u, 16*u), (22*u, 22*u)], fill=col, width=int(w), joint="curve")
    arrows(DARK, 4.2*u); arrows(INK, 2.2*u)
    return im.resize((size, size), Image.LANCZOS)

for name, fn in (("cursor-bike", bike), ("cursor-swipe", swipe)):
    fn(32).save(os.path.join(OUT, f"{name}.png"))
    fn(64).save(os.path.join(OUT, f"{name}@2x.png"))
    print(name, "ok")
