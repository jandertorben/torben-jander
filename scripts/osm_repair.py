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

# Stadt Bremen (ohne Bremerhaven): Gemeinde-Relation admin_level 6, darin Stadtteile
QUERY = """
[out:json][timeout:90];
area["boundary"="administrative"]["admin_level"="6"]["name"="Bremen"]->.stadt;
node["amenity"="bicycle_repair_station"](area.stadt)->.st;
.st out body;
rel(area.stadt)["boundary"="administrative"]["admin_level"~"^(9|10)$"];
map_to_area->.teile;
foreach.teile->.t(
  node.st(area.t);
  make teil name=t.u(t["name"]), level=t.u(t["admin_level"]), ids=set(id());
  out;
);
"""


def fetch():
    body = urllib.parse.urlencode({"data": QUERY}).encode()
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


def main():
    data = fetch()
    nodes, teil = {}, {}
    for el in data.get("elements", []):
        if el.get("type") == "node":
            nodes[el["id"]] = el
        elif el.get("type") == "teil":
            t = el.get("tags", {})
            for i in str(t.get("ids", "")).split(";"):
                if not i:
                    continue
                i = int(i)
                # Stadtteil (10) schlägt Stadtbezirk (9)
                if t.get("level") == "10" or i not in teil:
                    teil[i] = t.get("name", "")
    out = []
    for i, n in nodes.items():
        tg = n.get("tags", {})
        if tg.get("access") in ("private", "no", "customers"):
            continue
        out.append({
            "id": i,
            "lat": round(n["lat"], 6), "lon": round(n["lon"], 6),
            "teil": teil.get(i, ""),
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
