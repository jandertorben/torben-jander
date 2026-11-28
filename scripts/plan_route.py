#!/usr/bin/env python3
"""Stellt eine geplante (noch nicht gefahrene) Route auf die Seite.

Aufruf:
  python3 scripts/plan_route.py <eingabe.gpx> <slug> "<Name>" [--date JJJJ-MM-TT]

Was passiert:
  - Die Spur aus der Planungsdatei (z. B. bikerouter.de, Komoot) wird gelesen.
  - Start und Ziel werden wie bei den Strava-Touren gekürzt (1.000–1.800 m, Zufall je Route).
    Wegpunkte (oft mit Adresse) werden NICHT übernommen.
  - Ergebnis: static/routen/<slug>.gpx und ein Eintrag in data/geplant.json.
    Bestehender Eintrag mit gleichem Slug wird ersetzt.

Strecke und Höhenmeter stammen aus der Planung, nicht aus Strava. Die Seite zeigt das so an.
Die Original-Planungsdatei gehört nicht ins Repository (sie enthält meist die Startadresse).
Wird die Route gefahren: Eintrag aus data/geplant.json und Datei aus static/routen/ löschen,
die Strava-Fahrt übernimmt dann.
"""
import argparse, json, os, re, sys
from datetime import date
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_strava_data import haversine  # noqa: E402
from strava_gpx import (segments, write_gpx, route_svg, elevation_profile, flat_profile,  # noqa: E402
                        ROOT, GPX_PRIVACY_M)

OUT_DIR = os.path.join(ROOT, "static", "routen")
LIST_OUT = os.path.join(ROOT, "data", "geplant.json")
NS = "{http://www.topografix.com/GPX/1/1}"


def read_track(path):
    latlng, alt = [], []
    for p in ET.parse(path).getroot().iter(NS + "trkpt"):
        latlng.append((float(p.get("lat")), float(p.get("lon"))))
        e = p.find(NS + "ele")
        alt.append(float(e.text) if e is not None else None)
    return latlng, alt


def ascent(alt, step=3.0):
    """Höhenmeter mit Schwelle (wie Routenplaner), damit Rauschen nicht mitzählt."""
    vals = [a for a in alt if a is not None]
    if not vals: return 0
    up, ref = 0.0, vals[0]
    for a in vals[1:]:
        if a - ref >= step: up += a - ref; ref = a
        elif ref - a >= step: ref = a
    return round(up)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("gpx"); ap.add_argument("slug"); ap.add_argument("name")
    ap.add_argument("--date", default=date.today().isoformat(), help="Datum der Planung (Sortierung)")
    args = ap.parse_args()

    latlng, alt = read_track(args.gpx)
    if len(latlng) < 20: sys.exit("Keine Spur in der Datei.")
    km = sum(haversine(latlng[i - 1], latlng[i]) for i in range(1, len(latlng))) / 1000
    up = ascent(alt)
    # Gibt der Routenplaner eigene Werte an (bikerouter.de: track-length, filtered ascend), gelten diese.
    head = open(args.gpx, encoding="utf-8").read(600)
    m = re.search(r"track-length = (\d+)", head)
    if m: km = int(m.group(1)) / 1000
    m = re.search(r"filtered ascend = (\d+)", head)
    if m: up = int(m.group(1))
    rid = f"plan-{args.slug}"
    segs = segments(latlng, [a if a is not None else 0 for a in alt], rid)
    if not segs: sys.exit("Nach dem Kürzen bleibt nichts übrig.")

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f"{args.slug}.gpx")
    write_gpx(out, {"name": args.name, "start_local": args.date + "T00:00", "sport_type": "GravelRide"}, segs)
    # Hinweis „geplant“ in die Beschreibung der Datei
    txt = open(out, encoding="utf-8").read().replace(
        f"{args.date} · Start", f"Geplante Route, noch nicht gefahren · Start", 1)
    open(out, "w", encoding="utf-8").write(txt)

    entry = {"id": rid, "slug": args.slug, "name": args.name, "planned": True, "date": args.date,
             "group": "ride", "sport": "GravelRide", "km": round(km, 1), "elevation": up,
             "gpx": f"/routen/{args.slug}.gpx"}
    entry.update(route_svg(out)); entry.update(elevation_profile(out)); entry.update(flat_profile(out))

    data = json.load(open(LIST_OUT)) if os.path.exists(LIST_OUT) else {"tours": []}
    data["tours"] = [t for t in data["tours"] if t.get("slug") != args.slug] + [entry]
    data["tours"].sort(key=lambda t: t["date"], reverse=True)
    json.dump(data, open(LIST_OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{args.name}: {entry['km']} km, {entry['elevation']} Hm (Planung), "
          f"{sum(len(s) for s in segs)} Punkte, Start/Ziel um mind. {GPX_PRIVACY_M} m gekürzt → {out}")


if __name__ == "__main__":
    main()
