#!/usr/bin/env python3
"""Erzeugt gekürzte GPX-Dateien zum Download unter static/gpx/<id>.gpx.

Läuft nach build_strava_data.py. Berücksichtigt alle Aktivitäten des laufenden Jahres,
die diese Regeln erfüllen:
  - nur Gravel-Touren (sport_type GravelRide), mindestens MIN_GPX_KM lang
    (Arbeitswege, Läufe und kurze Strecken bekommen keinen Download)
  - auf Strava öffentlich ("everyone"), nicht privat, nicht als Pendelfahrt markiert
  - dazu einzelne Ausnahmen aus GPX_EXTRA_IDS (nur öffentlich muss sein)
Schreibt außerdem data/gpx.json (Liste für den Bereich „Zum Nachfahren“).

Datenschutz: Die Strava-API liefert dem Besitzer die volle Spur, Privatsphäre-Zonen gelten
hier NICHT. Deshalb werden alle Punkte im Umkreis von 1.000 bis 1.800 m (zufällig je Tour
und je Ende) um Start und Ziel entfernt (auch wenn die Route mittendrin noch einmal dort vorbeiführt; die Spur wird dann
in mehrere Segmente geteilt). Zeitstempel werden nicht exportiert, Höhe schon.

Vorhandene Dateien mit gleicher Version werden nicht neu geholt. Dateien von Aktivitäten,
die nicht mehr auf der Seite stehen, werden gelöscht.

Benötigt dieselben Umgebungsvariablen wie strava_fetch.py.
"""
import json, os, random, re, sys, time
from datetime import date
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from strava_fetch import API, ROOT, RAW, access_token, get, load_env  # noqa: E402
from build_strava_data import (haversine, group, privacy_radii, project, to_path, fmt_dur, pace, speed,  # noqa: E402
                               PRIVACY_M, PRIVACY_JITTER_M)
import xml.etree.ElementTree as ET  # noqa: E402

# Kürzung um Start und Ziel: dieselben Werte wie für Karte und Vorschauen (build_strava_data.py)
GPX_PRIVACY_M, GPX_PRIVACY_JITTER_M = PRIVACY_M, PRIVACY_JITTER_M
MIN_GPX_KM = 15.0      # kürzere Strecken bekommen keinen Download
GPX_SPORTS = {"GravelRide"}   # nur Gravel-Touren gibt es als Download
# Ausnahmen: einzelne Touren anderer Sportart, die trotzdem einen Download bekommen
# (Strava-ID aus der Aktivitäts-URL). Öffentlich muss sie trotzdem sein.
GPX_EXTRA_IDS = {
    "20023559115",   # Abendradfahrt 03.09.2026, 30,7 km (längste Fahrt des Jahres)
}
MIN_STEP_M = 4.0       # Punkte, die näher als das am vorigen liegen, entfallen (kleinere Dateien)
MIN_SEG_PTS = 10       # Mini-Segmente (kurzer Abstecher in die Sperrzone) entfallen
VERSION = f"v2-r{GPX_PRIVACY_M}-j{GPX_PRIVACY_JITTER_M}"   # ändert sich der Wert, werden alle Dateien neu erzeugt
OUT_DIR = os.path.join(ROOT, "static", "gpx")
LIST_OUT = os.path.join(ROOT, "data", "gpx.json")


def raw_activities():
    acts = {}
    if not os.path.isdir(RAW):
        sys.exit("strava-raw/ fehlt – zuerst scripts/strava_fetch.py ausführen.")
    for f in os.listdir(RAW):
        if f.startswith("activities-") and f.endswith(".json"):
            for a in json.load(open(os.path.join(RAW, f)))["activities"]:
                acts[str(a["id"])] = a
    return acts


def eligible(a):
    if str(a["id"]) in GPX_EXTRA_IDS:
        return a.get("visibility") == "everyone" and not a.get("private", True)
    if a["sport_type"] not in GPX_SPORTS:
        return False
    if a["summary"]["distance"] < MIN_GPX_KM * 1000:
        return False
    # Fehlt das Feld (alte Rohdaten), lieber keinen Download anbieten.
    if a.get("visibility") != "everyone" or a.get("private", True) or a.get("commute", True):
        return False
    return True


def segments(latlng, alt, aid=""):
    """Entfernt alle Punkte nahe Start/Ziel und teilt die Spur an den Lücken."""
    start, end = latlng[0], latlng[-1]
    r_start, r_end = privacy_radii(aid)
    segs, cur, last = [], [], None
    for i, p in enumerate(latlng):
        if haversine(p, start) <= r_start or haversine(p, end) <= r_end:
            if cur: segs.append(cur)
            cur, last = [], None
            continue
        if last and haversine(p, last) < MIN_STEP_M:
            continue
        cur.append((p[0], p[1], alt[i] if alt and i < len(alt) else None))
        last = p
    if cur: segs.append(cur)
    return [s for s in segs if len(s) >= MIN_SEG_PTS]


def write_gpx(path, a, segs):
    kind = "running" if group(a["sport_type"]) == "run" else "cycling"
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="torben-jander.me" xmlns="http://www.topografix.com/GPX/1/1">',
        "  <metadata>",
        f"    <name>{escape(a['name'])}</name>",
        f"    <desc>{escape(a['start_local'][:10])} · Start und Ziel um mindestens {GPX_PRIVACY_M} m gekürzt · {VERSION}</desc>",
        "    <link href=\"https://torben-jander.me\"><text>torben-jander.me</text></link>",
        "  </metadata>",
        "  <trk>",
        f"    <name>{escape(a['name'])}</name>",
        f"    <type>{kind}</type>",
    ]
    for s in segs:
        lines.append("    <trkseg>")
        for lat, lon, ele in s:
            if ele is None:
                lines.append(f'      <trkpt lat="{lat:.6f}" lon="{lon:.6f}"/>')
            else:
                lines.append(f'      <trkpt lat="{lat:.6f}" lon="{lon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
        lines.append("    </trkseg>")
    lines += ["  </trk>", "</gpx>", ""]
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    os.replace(tmp, path)


def route_svg(path):
    """Zeichnet die (bereits gekürzte) GPX-Spur als SVG-Pfad: einmal groß für die Tourenseite,
    einmal im 100x100-Raster für Vorschaukarten. Segmente bleiben getrennt."""
    ns = "{http://www.topografix.com/GPX/1/1}"
    segs = []
    for seg in ET.parse(path).getroot().iter(ns + "trkseg"):
        pts = [(float(p.get("lat")), float(p.get("lon"))) for p in seg.iter(ns + "trkpt")]
        if len(pts) >= 2: segs.append(pts)
    if not segs: return {}
    lat0 = sum(p[0] for s in segs for p in s) / sum(len(s) for s in segs)
    xy = [project(s, lat0) for s in segs]
    xs = [x for s in xy for x, _ in s]; ys = [y for s in xy for _, y in s]
    bounds = (min(xs), min(ys), max(xs), max(ys))
    w, h = max(bounds[2] - bounds[0], 1e-9), max(bounds[3] - bounds[1], 1e-9)
    W = 1000; H = max(400, min(1400, round(W * h / w)))
    big = "".join(to_path(s, (W, H), bounds, pad=0.04) for s in xy)
    small = "".join(to_path(s, (100, 100), bounds) for s in xy)
    return {"route": {"w": W, "h": H, "d": big}, "path": small}


def current(path):
    if not os.path.exists(path):
        return False
    with open(path, encoding="utf-8") as f:
        return VERSION in f.read(1000)


def main():
    load_env()
    os.makedirs(OUT_DIR, exist_ok=True)
    acts = raw_activities()
    year = str(date.today().year)
    wanted = [i for i, a in acts.items()
              if eligible(a) and (a["start_local"].startswith(year) or i in GPX_EXTRA_IDS)]
    for i in GPX_EXTRA_IDS - set(wanted):
        a = acts.get(i)
        if not a:
            print(f"Ausnahme {i}: nicht in den Strava-Daten")
        else:
            print(f"Ausnahme {i} übersprungen: Sichtbarkeit={a.get('visibility')}, privat={a.get('private')}")
    todo = [i for i in wanted if not current(os.path.join(OUT_DIR, f"{i}.gpx"))]

    token = access_token() if todo else None
    made = 0
    for aid in todo:
        a = acts[aid]
        try:
            st = get(f"{API}/activities/{aid}/streams", token,
                     {"keys": "latlng,altitude", "key_by_type": "true"})
        except Exception as e:  # einzelne Fehler sollen den Lauf nicht abbrechen
            print(f"{aid}: Streams nicht abrufbar ({e})")
            continue
        latlng = (st.get("latlng") or {}).get("data") or []
        alt = (st.get("altitude") or {}).get("data") or []
        if len(latlng) < 20:
            print(f"{aid}: keine GPS-Spur")
            continue
        segs = segments(latlng, alt, aid)
        if not segs:
            print(f"{aid}: nach dem Kürzen bleibt nichts übrig")
            continue
        write_gpx(os.path.join(OUT_DIR, f"{aid}.gpx"), a, segs)
        made += 1
        time.sleep(0.5)

    done = [i for i in wanted if os.path.exists(os.path.join(OUT_DIR, f"{i}.gpx"))]
    listing = []
    for i in sorted(done, key=lambda i: acts[i]["start_local"], reverse=True):
        a = acts[i]; sm = a["summary"]; g = group(a["sport_type"])
        entry = {"id": i, "name": a["name"], "date": a["start_local"][:10], "time": a["start_local"][11:16],
                 "group": g, "sport": a["sport_type"],
                 "km": round(sm["distance"] / 1000, 1), "elevation": round(sm.get("elevation_gain") or 0),
                 "duration": fmt_dur(sm["moving_time"]), "moving_time": sm["moving_time"],
                 "tempo": pace(sm["moving_time"], sm["distance"]) if g == "run" else f"{speed(sm['distance'], sm['moving_time'])} km/h"}
        entry.update(route_svg(os.path.join(OUT_DIR, f"{i}.gpx")))
        listing.append(entry)
    json.dump({"tours": listing}, open(LIST_OUT, "w"), ensure_ascii=False, separators=(",", ":"))

    keep = {f"{i}.gpx" for i in wanted}
    removed = 0
    for f in os.listdir(OUT_DIR):
        if f.endswith(".gpx") and f not in keep:
            os.remove(os.path.join(OUT_DIR, f)); removed += 1
    print(f"GPX: {len(wanted)} freigegeben, {made} neu erzeugt, {removed} entfernt")


if __name__ == "__main__":
    main()
