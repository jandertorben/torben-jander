#!/usr/bin/env python3
"""Holt öffentliche Fahrrad-Reparaturstationen in der Stadt Bremen aus OpenStreetMap
(amenity=bicycle_repair_station) und schreibt data/reparatur.json.

Jede Station bekommt den Stadtteil (admin_level 10) bzw. Stadtbezirk, in dem sie liegt.
Daten: © OpenStreetMap-Mitwirkende, ODbL – die Quelle steht auf der Seite.
"""
import json, math, os, sys, time, urllib.parse, urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "reparatur.json")
ENDPOINTS = ["https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter",
             "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

# Land Bremen (ISO DE-HB), Bremerhaven wird unten über die Breite aussortiert; darin Stadtteile
QUERY = """
[out:json][timeout:60];
node["amenity"="bicycle_repair_station"](52.98,8.48,53.24,9.00);
out body;
"""
# Postleitzahl-Gebiete mit Mittelpunkt (für die Suche nach PLZ)
PLZ = """
[out:json][timeout:90];
rel["boundary"="postal_code"](52.98,8.48,53.24,9.00);
out center tags;
"""
# Ortsteile als Punkte (place=suburb/quarter/village …) – die Station bekommt den nächstgelegenen Namen
ORTE = """
[out:json][timeout:60];
node["place"~"^(suburb|quarter|neighbourhood|village|town)$"](52.98,8.48,53.24,9.00);
out body;
"""


def fetch(q=QUERY):
    body = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for ep in ENDPOINTS:
        for _ in range(1):
            try:
                req = urllib.request.Request(ep, data=body, headers={"User-Agent": "torben-jander.me (Hugo-Seite, wöchentlich)"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    return json.load(r)
            except Exception as e:  # nächster Versuch/Endpunkt
                last = e
                print(f"{ep}: {e}")
                time.sleep(5)
    sys.exit(f"Overpass nicht erreichbar: {last}")


def yes(v):
    return str(v or "").lower() in ("yes", "true", "1")


def naechster_ort(lat, lon, orte):
    best, bd = "", 1e9
    k = math.cos(math.radians(lat))
    for o in orte:
        d = (o[0] - lat) ** 2 + ((o[1] - lon) * k) ** 2
        if d < bd:
            best, bd = o[2], d
    return best


def main():
    data = fetch()
    print("Elemente:", len(data.get("elements", [])), data.get("remark", ""))
    time.sleep(2)
    orte = [(e["lat"], e["lon"], e["tags"]["name"]) for e in fetch(ORTE).get("elements", [])
            if e.get("type") == "node" and e.get("tags", {}).get("name")]
    print("Orte:", len(orte))
    time.sleep(2)
    plz = {}
    try:
        for e in fetch(PLZ).get("elements", []):
            code, c = e.get("tags", {}).get("postal_code"), e.get("center")
            if code and c and len(code) == 5:
                plz[code] = [round(c["lat"], 4), round(c["lon"], 4)]
    except SystemExit:
        pass   # ohne PLZ läuft die Suche trotzdem über Ortsnamen
    print("PLZ:", len(plz))
    out = []
    for n in data.get("elements", []):
        if n.get("type") != "node":
            continue
        tg = n.get("tags", {})
        if tg.get("access") in ("private", "no", "customers"):
            continue
        out.append({
            "id": n["id"],
            "lat": round(n["lat"], 6), "lon": round(n["lon"], 6),
            "teil": naechster_ort(n["lat"], n["lon"], orte),
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
    orte_out = sorted({o[2]: [round(o[0], 4), round(o[1], 4)] for o in orte}.items())
    if not plz and os.path.exists(OUT):   # PLZ-Abfrage fehlgeschlagen: alte Werte behalten
        plz = json.load(open(OUT)).get("plz", {})
    json.dump({"generated": date.today().isoformat(), "count": len(out), "stations": out,
               "orte": {k: v for k, v in orte_out}, "plz": dict(sorted(plz.items()))},
              open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"{len(out)} Reparaturstationen geschrieben")


if __name__ == "__main__":
    main()
