#!/usr/bin/env python3
"""Holt öffentliche Fahrrad-Reparaturstationen in der Stadt Bremen aus OpenStreetMap
(amenity=bicycle_repair_station) und schreibt data/reparatur.json.

Jede Station bekommt den Stadtteil (admin_level 10) bzw. Stadtbezirk, in dem sie liegt.
Daten: © OpenStreetMap-Mitwirkende, ODbL – die Quelle steht auf der Seite.
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "reparatur.json")
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

# Land Bremen (ISO DE-HB), Bremerhaven wird unten über die Breite aussortiert; darin Stadtteile
QUERY = """
[out:json][timeout:60];
area["ISO3166-2"="DE-HB"]->.land;
node["amenity"="bicycle_repair_station"](area.land);
out body;
"""
# Stadtteil je Station: kleine Einzelabfrage über is_in
TEIL = """
[out:json][timeout:25];
is_in({lat},{lon});
area._["boundary"="administrative"]["admin_level"~"^(9|10)$"];
out tags;
"""


def fetch(q=QUERY):
    body = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for ep in ENDPOINTS:
        for _ in range(2):
            try:
                req = urllib.request.Request(ep, data=body, headers={"User-Agent": "torben-jander.me (Hugo-Seite, wöchentlich)"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    return json.load(r)
            except Exception as e:  # nächster Versuch/Endpunkt
                last = e
                time.sleep(5)
    sys.exit(f"Overpass nicht erreichbar: {last}")


def yes(v):
    return str(v or "").lower() in ("yes", "true", "1")


def stadtteil(lat, lon):
    try:
        els = fetch(TEIL.format(lat=lat, lon=lon)).get("elements", [])
    except SystemExit:
        return ""
    best = {}
    for e in els:
        t = e.get("tags", {})
        best[t.get("admin_level")] = t.get("name", "")
    return best.get("10") or best.get("9") or ""


def main():
    data = fetch()
    print("Elemente:", len(data.get("elements", [])), data.get("remark", ""))
    out = []
    for n in data.get("elements", []):
        if n.get("type") != "node":
            continue
        tg = n.get("tags", {})
        if tg.get("access") in ("private", "no", "customers"):
            continue
        if n["lat"] > 53.3:   # Bremerhaven gehört zum Land, aber nicht zu „rund um Bremen“
            continue
        time.sleep(1)
        out.append({
            "id": n["id"],
            "lat": round(n["lat"], 6), "lon": round(n["lon"], 6),
            "teil": stadtteil(n["lat"], n["lon"]),
            "name": tg.get("name") or tg.get("description") or "",
            "operator": tg.get("operator", ""),
            "pump": yes(tg.get("service:bicycle:pump")),
            "tools": yes(tg.get("service:bicycle:tools")),
            "stand": yes(tg.get("service:bicycle:stand")),
            "chain": yes(tg.get("service:bicycle:chain_tool")),
            "valves": tg.get("valves", ""),
            "hours": tg.get("opening_hours", ""),
            "covered": yes(tg.get("covered")),
        })
    out.sort(key=lambda s: (s["teil"] or "~", s["name"], s["lat"]))
    json.dump({"generated": date.today().isoformat(), "count": len(out), "stations": out},
              open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"{len(out)} Reparaturstationen geschrieben")


if __name__ == "__main__":
    main()
