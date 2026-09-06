#!/usr/bin/env python3
"""Baut data/strava.json aus den Roh-Exporten in strava-raw/.

Eingaben:
  strava-raw/activities-*.json   Antworten von list_activities (mit reduced_polyline)
  strava-raw/history-*.csv       Ältere Aktivitäten ohne Route (date,sport_type,distance,moving_time,elevation_gain)
  strava-raw/gear.json           Antwort von get_gear

Datenschutz: Von jeder Route werden Start und Ende um PRIVACY_M Meter gekürzt,
damit Wohn- und Arbeitsort nicht exakt sichtbar sind. Kurze Routen (< MIN_ROUTE_KM)
erhalten keine Zeichnung.
"""
import csv, glob, json, math, os, sys
from datetime import date, datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "strava-raw")
OUT = os.path.join(ROOT, "data", "strava.json")

PRIVACY_M = 600
MIN_ROUTE_KM = 5.0
RIDE = {"Ride", "GravelRide", "EBikeRide", "MountainBikeRide", "VirtualRide"}
RUN = {"Run", "TrailRun", "VirtualRun"}
FOOT = {"Walk", "Hike"}

def decode_polyline(s):
    pts, idx, lat, lng = [], 0, 0, 0
    while idx < len(s):
        for which in (0, 1):
            shift = result = 0
            while True:
                b = ord(s[idx]) - 63; idx += 1
                result |= (b & 0x1f) << shift; shift += 5
                if b < 0x20: break
            d = ~(result >> 1) if result & 1 else result >> 1
            if which == 0: lat += d
            else: lng += d
        pts.append((lat / 1e5, lng / 1e5))
    return pts

def haversine(a, b):
    R = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(h))

def trim(pts, meters):
    if len(pts) < 4: return []
    start, end = pts[0], pts[-1]
    keep = [p for p in pts if haversine(p, start) > meters and haversine(p, end) > meters]
    return keep if len(keep) >= 4 else []

def project(pts, lat0):
    k = math.cos(math.radians(lat0))
    return [(p[1] * k, -p[0]) for p in pts]  # x east, y north (flipped for SVG)

def to_path(xy, box, bounds=None, pad=0.04):
    if not xy: return ""
    xs, ys = [p[0] for p in xy], [p[1] for p in xy]
    if bounds is None:
        bounds = (min(xs), min(ys), max(xs), max(ys))
    minx, miny, maxx, maxy = bounds
    w, h = max(maxx - minx, 1e-9), max(maxy - miny, 1e-9)
    scale = min(box[0] * (1 - 2*pad) / w, box[1] * (1 - 2*pad) / h)
    ox = (box[0] - w * scale) / 2
    oy = (box[1] - h * scale) / 2
    out = []
    last = None
    for x, y in xy:
        px = round((x - minx) * scale + ox, 1)
        py = round((y - miny) * scale + oy, 1)
        if last and abs(px - last[0]) < 0.6 and abs(py - last[1]) < 0.6:
            continue
        out.append(("M" if not out else "L") + f"{px} {py}")
        last = (px, py)
    return "".join(out)

def group(sport):
    if sport in RIDE: return "ride"
    if sport in RUN: return "run"
    if sport in FOOT: return "foot"
    return "other"

def fmt_dur(sec):
    h, m = divmod(int(sec) // 60, 60)
    return f"{h}:{m:02d} h" if h else f"{m} min"

def pace(sec, dist):
    if not dist: return ""
    s = sec / (dist / 1000)
    return f"{int(s // 60)}:{int(s % 60):02d} /km"

def speed(dist, sec):
    return round(dist / 1000 / (sec / 3600), 1) if sec else 0

def main():
    acts = {}
    for f in sorted(glob.glob(os.path.join(RAW, "activities-*.json"))):
        for a in json.load(open(f))["activities"]:
            acts[a["id"]] = a
    hist = []
    seen = set()
    for f in sorted(glob.glob(os.path.join(RAW, "history-*.csv"))):
        for r in csv.DictReader(open(f)):
            key = (r["date"], r["sport_type"], r["distance"], r["moving_time"])
            if key in seen: continue
            seen.add(key)
            hist.append({"start_local": r["date"] + "T00:00:00", "sport_type": r["sport_type"],
                         "summary": {"distance": float(r["distance"]), "moving_time": int(r["moving_time"]),
                                     "elevation_gain": float(r["elevation_gain"])}})
    gear = json.load(open(os.path.join(RAW, "gear.json")))["gear"]

    all_acts = list(acts.values()) + hist
    year = date.today().year
    def stats(items):
        s = {"count": 0, "distance": 0.0, "moving_time": 0, "elevation": 0.0}
        for a in items:
            s["count"] += 1
            s["distance"] += a["summary"]["distance"]
            s["moving_time"] += a["summary"]["moving_time"]
            s["elevation"] += a["summary"].get("elevation_gain") or 0
        s["km"] = round(s["distance"] / 1000)
        s["hours"] = round(s["moving_time"] / 3600)
        s["elevation"] = round(s["elevation"])
        return s

    this_year = [a for a in all_acts if a["start_local"].startswith(str(year))]
    def by(items, g): return [a for a in items if group(a["sport_type"]) == g]
    totals = {
        "year": year,
        "all": stats(this_year),
        "ride": stats(by(this_year, "ride")),
        "gravel": stats([a for a in this_year if a["sport_type"] == "GravelRide"]),
        "run": stats(by(this_year, "run")),
        "lifetime": {
            "since": min(a["start_local"] for a in all_acts)[:10],
            "all": stats(all_acts), "ride": stats(by(all_acts, "ride")), "run": stats(by(all_acts, "run")),
        },
    }

    # Wochen-Serie (ISO-Wochen des laufenden Jahres, km Rad / Lauf)
    weeks = {}
    for a in this_year:
        d = datetime.fromisoformat(a["start_local"]).date()
        wk = d.isocalendar()[1]
        g = group(a["sport_type"])
        if g not in ("ride", "run"): continue
        weeks.setdefault(wk, {"ride": 0.0, "run": 0.0})
        weeks[wk][g] += a["summary"]["distance"] / 1000
    last_week = date.today().isocalendar()[1]
    first_week = min(weeks) if weeks else 1
    weekly = [{"week": w, "ride": round(weeks.get(w, {}).get("ride", 0), 1),
               "run": round(weeks.get(w, {}).get("run", 0), 1)} for w in range(first_week, last_week + 1)]

    # Monate
    months = {}
    for a in this_year:
        m = int(a["start_local"][5:7]); g = group(a["sport_type"])
        if g not in ("ride", "run"): continue
        months.setdefault(m, {"ride": 0.0, "run": 0.0})
        months[m][g] += a["summary"]["distance"] / 1000
    monthly = [{"month": m, "ride": round(months.get(m, {}).get("ride", 0)), "run": round(months.get(m, {}).get("run", 0))}
               for m in range(1, date.today().month + 1)]

    # Kalender: jeder Tag des Jahres bis heute, Wochen als Spalten (Mo–So), km Rad / Lauf / zu Fuß
    per_day = {}
    for a in this_year:
        d = a["start_local"][:10]; g = group(a["sport_type"])
        if g not in ("ride", "run", "foot"): continue
        per_day.setdefault(d, {"ride": 0.0, "run": 0.0, "foot": 0.0})
        per_day[d][g] += a["summary"]["distance"] / 1000
    jan1 = date(year, 1, 1); today = date.today()
    start = jan1 - timedelta(days=jan1.weekday())          # Montag der ersten Woche
    weeks = []
    cur = start
    while cur <= today:
        wk = []
        for i in range(7):
            d = cur + timedelta(days=i)
            if d < jan1 or d > today:
                wk.append(None)
            else:
                v = per_day.get(d.isoformat())
                wk.append({"d": d.isoformat(), "r": round(v["ride"], 1) if v else 0, "k": round(v["run"], 1) if v else 0,
                           "f": round(v["foot"], 1) if v else 0, "m": d.day == 1 and d.month or 0})
        weeks.append(wk)
        cur += timedelta(days=7)
    month_starts = []
    for wi, wk in enumerate(weeks):
        for day in wk:
            if day and day["m"]:
                month_starts.append({"week": wi, "month": day["m"]})
    calendar = {"weeks": weeks, "month_starts": month_starts, "day_of_year": today.timetuple().tm_yday,
                "days_in_year": (date(year, 12, 31) - jan1).days + 1, "active_days": len(per_day)}

    # Uhrzeiten-Verteilung (Stunde des Starts) – "Frühaufsteher"
    hours = [0] * 24
    for a in acts.values():
        hours[int(a["start_local"][11:13])] += 1

    # Routen aufbereiten
    routes = {}
    for a in acts.values():
        pl = a.get("reduced_polyline")
        if not pl or a["summary"]["distance"] < MIN_ROUTE_KM * 1000: continue
        pts = trim(decode_polyline(pl), PRIVACY_M)
        if pts: routes[a["id"]] = pts

    def activity_card(a):
        s = a["summary"]; g = group(a["sport_type"])
        card = {
            "id": a["id"], "name": a["name"], "sport": a["sport_type"], "group": g,
            "date": a["start_local"][:10], "time": a["start_local"][11:16],
            "km": round(s["distance"] / 1000, 1), "duration": fmt_dur(s["moving_time"]),
            "moving_time": s["moving_time"], "elevation": round(s.get("elevation_gain") or 0),
            "location": (a.get("location_summary") or "").replace(", Germany", "").replace(", Denmark", " (DK)"),
        }
        card["tempo"] = pace(s["moving_time"], s["distance"]) if g in ("run", "foot") else f"{speed(s['distance'], s['moving_time'])} km/h"
        if a["id"] in routes:
            card["path"] = to_path(project(routes[a["id"]], routes[a["id"]][0][0]), (100, 100))
        return card

    ordered = sorted(acts.values(), key=lambda a: a["start_local"], reverse=True)
    recent = [activity_card(a) for a in ordered if group(a["sport_type"]) in ("ride", "run")][:8]

    def longest(items):
        items = [a for a in items if a["id"] in routes]
        return activity_card(max(items, key=lambda a: a["summary"]["distance"])) if items else None
    ty = [a for a in acts.values() if a["start_local"].startswith(str(year))]
    highlights = {
        "longest_ride": longest([a for a in ty if a["sport_type"] in ("Ride", "EBikeRide")]),
        "longest_gravel": longest([a for a in ty if a["sport_type"] == "GravelRide"]),
        "longest_run": longest(by(ty, "run")),
    }
    earliest = min((a for a in ty if group(a["sport_type"]) in ("ride", "run")), key=lambda a: a["start_local"][11:19])
    highlights["earliest_start"] = earliest["start_local"][11:16]
    # längste Serie aufeinanderfolgender Tage mit Aktivität
    days = sorted({a["start_local"][:10] for a in ty})
    best = cur = 1
    for i in range(1, len(days)):
        if date.fromisoformat(days[i]) - date.fromisoformat(days[i-1]) == timedelta(days=1):
            cur += 1; best = max(best, cur)
        else: cur = 1
    highlights["longest_streak_days"] = best
    highlights["active_days"] = len(days)

    # Gesamtkarte: alle Routen in gemeinsamer Projektion (Bremen-Umland), Dänemark ausgeschlossen
    lat0 = 53.07
    allxy = {}
    for aid, pts in routes.items():
        if not acts[aid]["start_local"].startswith(str(year)): continue  # Karte zeigt nur das laufende Jahr
        if any(p[0] > 54.5 for p in pts): continue  # Urlaubsspaziergänge (DK) nicht in die Bremen-Karte
        allxy[aid] = project(pts, lat0)
    xs = [x for v in allxy.values() for x, _ in v]; ys = [y for v in allxy.values() for _, y in v]
    bounds = (min(xs), min(ys), max(xs), max(ys))
    w, h = bounds[2] - bounds[0], bounds[3] - bounds[1]
    box = (1000, round(1000 * h / w))
    map_paths = []
    for aid, xy in allxy.items():
        a = acts[aid]
        map_paths.append({"id": aid, "group": group(a["sport_type"]), "sport": a["sport_type"],
                          "km": round(a["summary"]["distance"] / 1000, 1), "d": to_path(xy, box, bounds, pad=0.03)})
    # Pendelstrecken überlagern sich fast vollständig: davon reicht eine Auswahl.
    # Alle Routen ab LONG_KM bleiben drin, kürzere werden gleichmäßig auf MAX_SHORT reduziert.
    LONG_KM, MAX_SHORT, MAX_LONG = 12.0, 40, 40
    long_p = [p for p in map_paths if p["km"] >= LONG_KM]
    short_p = [p for p in map_paths if p["km"] < LONG_KM]
    # auch lange Touren begrenzen: die jüngsten MAX_LONG bleiben, damit die Karte über Jahre nicht anschwillt
    if len(long_p) > MAX_LONG:
        newest = sorted(long_p, key=lambda p: acts[p["id"]]["start_local"], reverse=True)[:MAX_LONG]
        keep = {p["id"] for p in newest}
        long_p = [p for p in long_p if p["id"] in keep]
    if len(short_p) > MAX_SHORT:
        step = len(short_p) / MAX_SHORT
        short_p = [short_p[int(i * step)] for i in range(MAX_SHORT)]
    map_paths = short_p + sorted(long_p, key=lambda p: p["km"])  # lange Strecken zuletzt, damit sie oben liegen

    shoes = [g for g in gear if g["gear_id"]["gear_type"] == "Shoe"]
    bikes = [g for g in gear if g["gear_id"]["gear_type"] == "Bike"]
    out = {
        "generated_at": datetime.now().strftime("%Y-%m-%d"),
        "totals": totals, "weekly": weekly, "monthly": monthly, "start_hours": hours, "calendar": calendar,
        "recent": recent, "highlights": highlights,
        "map": {"width": box[0], "height": box[1], "paths": map_paths},
        "gear": {
            "bikes": [{"id": g["gear_id"]["id"], "name": g.get("name", "").strip() or "Rad", "km": round(g["total_distance"] / 1000),
                       "frame": g.get("frame_type", ""), "weight": g.get("weight")} for g in bikes],
            "shoes": [{"id": g["gear_id"]["id"], "name": f"{g.get('brand','')} {g.get('model_name','')}".strip(), "km": round(g["total_distance"] / 1000)}
                      for g in shoes],
            "by_id": {g["gear_id"]["id"]: round(g["total_distance"] / 1000) for g in gear},
        },
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{OUT}: {os.path.getsize(OUT)//1024} KB, {len(map_paths)} Routen auf der Karte, {len(acts)} Aktivitäten mit Details")
    print(json.dumps({k: v for k, v in totals.items() if k != "lifetime"}, ensure_ascii=False))
    print("lifetime", totals["lifetime"]["all"]["km"], "km seit", totals["lifetime"]["since"])
    print("highlights", {k: (v["km"] if isinstance(v, dict) else v) for k, v in highlights.items()})
    print("map box", box, "hours", hours)

if __name__ == "__main__":
    main()
