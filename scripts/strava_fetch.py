#!/usr/bin/env python3
"""Holt Aktivitäten und Ausrüstung über die Strava-API und schreibt sie nach strava-raw/.

Benötigt drei Umgebungsvariablen (lokal per .env oder in GitHub als Secrets):
  STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN

Der Refresh-Token braucht den Scope activity:read_all (siehe scripts/strava_auth.py).
Danach erzeugt scripts/build_strava_data.py aus den Rohdaten die data/strava.json.
Nutzt nur die Standardbibliothek.
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "strava-raw")
SINCE = "2025-01-01T00:00:00+00:00"   # ab hier werden Aktivitäten geholt
API = "https://www.strava.com/api/v3"
FRAME = {1: "MTB", 2: "Cross", 3: "Road", 4: "Zeitfahrrad", 5: "Gravel"}

def load_env():
    p = os.path.join(ROOT, ".env")
    if os.path.exists(p):
        for line in open(p):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

def need(k):
    v = os.environ.get(k)
    if not v:
        sys.exit(f"Umgebungsvariable {k} fehlt. Siehe README, Abschnitt Strava-Daten aktualisieren.")
    return v

def post(url, data):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def get(url, token, params=None):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def access_token():
    tok = post("https://www.strava.com/oauth/token", {
        "client_id": need("STRAVA_CLIENT_ID"),
        "client_secret": need("STRAVA_CLIENT_SECRET"),
        "grant_type": "refresh_token",
        "refresh_token": need("STRAVA_REFRESH_TOKEN"),
    })
    return tok["access_token"]

def to_raw(a):
    """Bringt eine SummaryActivity der API in das Format, das build_strava_data.py erwartet."""
    return {
        "id": str(a["id"]),
        "name": a.get("name", ""),
        "sport_type": a.get("sport_type") or a.get("type", "Workout"),
        "start_local": a["start_date_local"][:19],
        "location_summary": "",
        "gear_id": a.get("gear_id"),
        "summary": {
            "distance": a.get("distance", 0) or 0,
            "moving_time": a.get("moving_time", 0) or 0,
            "elapsed_time": a.get("elapsed_time", 0) or 0,
            "elevation_gain": a.get("total_elevation_gain", 0) or 0,
            "avg_speed": a.get("average_speed", 0) or 0,
            "max_speed": a.get("max_speed", 0) or 0,
            "avg_cadence": a.get("average_cadence"),
            "kudos_count": a.get("kudos_count", 0),
            "achievement_count": a.get("achievement_count", 0),
            "pr_count": a.get("pr_count", 0),
        },
        "reduced_polyline": ((a.get("map") or {}).get("summary_polyline")) or None,
    }

def main():
    load_env()
    token = access_token()
    after = int(datetime.fromisoformat(SINCE).timestamp())
    acts, page = [], 1
    while True:
        chunk = get(f"{API}/athlete/activities", token, {"after": after, "per_page": 200, "page": page})
        if not chunk:
            break
        acts.extend(to_raw(a) for a in chunk)
        if len(chunk) < 200:
            break
        page += 1
        time.sleep(1)
    acts.sort(key=lambda a: a["start_local"], reverse=True)

    athlete = get(f"{API}/athlete", token)
    gear = []
    for kind, items in (("Bike", athlete.get("bikes", [])), ("Shoe", athlete.get("shoes", []))):
        for g in items:
            d = get(f"{API}/gear/{g['id']}", token)
            gear.append({
                "gear_id": {"id": g["id"], "gear_type": kind},
                "name": (d.get("name") or g.get("name") or "").strip(),
                "brand": d.get("brand_name") or "",
                "model_name": d.get("model_name") or "",
                "frame_type": FRAME.get(d.get("frame_type"), "") if kind == "Bike" else "",
                "retired": bool(d.get("retired", False)),
                "total_distance": d.get("distance", g.get("distance", 0)),
            })
            time.sleep(0.5)

    os.makedirs(RAW, exist_ok=True)
    for f in os.listdir(RAW):
        if f.startswith("activities-") and f.endswith(".json"):
            os.remove(os.path.join(RAW, f))
    json.dump({"activities": acts}, open(os.path.join(RAW, "activities-api.json"), "w"), ensure_ascii=False)
    json.dump({"gear": gear}, open(os.path.join(RAW, "gear.json"), "w"), ensure_ascii=False)
    print(f"{len(acts)} Aktivitäten seit {SINCE[:10]}, {len(gear)} Ausrüstungsteile nach strava-raw/ geschrieben "
          f"({datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')})")

if __name__ == "__main__":
    main()
