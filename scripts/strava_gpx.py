#!/usr/bin/env python3
"""Erzeugt gekürzte GPX-Dateien zum Download unter static/gpx/<id>.gpx.

Läuft nach build_strava_data.py. Berücksichtigt nur Aktivitäten, die auf der Seite
als Karte erscheinen (recent + highlights in data/strava.json) und die diese Regeln erfüllen:
  - Rad oder Lauf, mindestens MIN_GPX_KM lang (Arbeitswege mit ~9 km fallen damit raus)
  - auf Strava öffentlich ("everyone"), nicht privat, nicht als Pendelfahrt markiert

Datenschutz: Die Strava-API liefert dem Besitzer die volle Spur, Privatsphäre-Zonen gelten
hier NICHT. Deshalb werden alle Punkte im Umkreis von GPX_PRIVACY_M um Start und Ziel
entfernt (auch wenn die Route mittendrin noch einmal dort vorbeiführt; die Spur wird dann
in mehrere Segmente geteilt). Zeitstempel werden nicht exportiert, Höhe schon.

Vorhandene Dateien mit gleicher Version werden nicht neu geholt. Dateien von Aktivitäten,
die nicht mehr auf der Seite stehen, werden gelöscht.

Benötigt dieselben Umgebungsvariablen wie strava_fetch.py.
"""
import json, os, re, sys, time
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from strava_fetch import API, ROOT, RAW, access_token, get, load_env  # noqa: E402
from build_strava_data import haversine, group  # noqa: E402

GPX_PRIVACY_M = 1000   # Radius um Start und Ziel, der komplett entfällt
MIN_GPX_KM = 15.0      # kürzere Strecken bekommen keinen Download
MIN_STEP_M = 4.0       # Punkte, die näher als das am vorigen liegen, entfallen (kleinere Dateien)
MIN_SEG_PTS = 10       # Mini-Segmente (kurzer Abstecher in die Sperrzone) entfallen
VERSION = f"v1-r{GPX_PRIVACY_M}"   # ändert sich der Wert, werden alle Dateien neu erzeugt
OUT_DIR = os.path.join(ROOT, "static", "gpx")
DATA = os.path.join(ROOT, "data", "strava.json")


def shown_ids():
    d = json.load(open(DATA))
    ids = [a["id"] for a in d.get("recent", [])]
    ids += [v["id"] for v in d.get("highlights", {}).values() if isinstance(v, dict) and v.get("id")]
    return list(dict.fromkeys(ids))


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
    if group(a["sport_type"]) not in ("ride", "run"):
        return False
    if a["summary"]["distance"] < MIN_GPX_KM * 1000:
        return False
    # Fehlt das Feld (alte Rohdaten), lieber keinen Download anbieten.
    if a.get("visibility") != "everyone" or a.get("private", True) or a.get("commute", True):
        return False
    return True


def segments(latlng, alt):
    """Entfernt alle Punkte nahe Start/Ziel und teilt die Spur an den Lücken."""
    start, end = latlng[0], latlng[-1]
    segs, cur, last = [], [], None
    for i, p in enumerate(latlng):
        if haversine(p, start) <= GPX_PRIVACY_M or haversine(p, end) <= GPX_PRIVACY_M:
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
        f"    <desc>{escape(a['start_local'][:10])} · Start und Ziel um {GPX_PRIVACY_M} m gekürzt · {VERSION}</desc>",
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


def current(path):
    if not os.path.exists(path):
        return False
    with open(path, encoding="utf-8") as f:
        return VERSION in f.read(1000)


def main():
    load_env()
    os.makedirs(OUT_DIR, exist_ok=True)
    acts = raw_activities()
    wanted = [i for i in shown_ids() if i in acts and eligible(acts[i])]
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
        segs = segments(latlng, alt)
        if not segs:
            print(f"{aid}: nach dem Kürzen bleibt nichts übrig")
            continue
        write_gpx(os.path.join(OUT_DIR, f"{aid}.gpx"), a, segs)
        made += 1
        time.sleep(0.5)

    keep = {f"{i}.gpx" for i in wanted}
    removed = 0
    for f in os.listdir(OUT_DIR):
        if f.endswith(".gpx") and f not in keep:
            os.remove(os.path.join(OUT_DIR, f)); removed += 1
    print(f"GPX: {len(wanted)} auf der Seite freigegeben, {made} neu erzeugt, {removed} entfernt")


if __name__ == "__main__":
    main()
