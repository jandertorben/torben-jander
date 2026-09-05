#!/usr/bin/env python3
"""Einmalige Einrichtung: holt einen Strava-Refresh-Token mit Scope activity:read_all.

Ablauf:
  1. Auf https://www.strava.com/settings/api eine API-Anwendung anlegen.
     "Autorisierungs-Callback-Domain": localhost
  2. Dieses Skript starten und Client-ID sowie Client-Secret eingeben.
  3. Den angezeigten Link im Browser öffnen, Zugriff erlauben.
     Der Browser landet auf http://localhost/...?code=XYZ (Seite lädt nicht, das ist normal).
  4. Den Wert von "code" aus der Adresszeile hier einfügen.
Das Skript gibt den Refresh-Token aus. Er gehört zusammen mit ID und Secret in die
GitHub-Secrets STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN
(oder lokal in eine .env-Datei, die per .gitignore ausgeschlossen ist).
"""
import getpass, json, urllib.parse, urllib.request

cid = input("Client-ID: ").strip()
secret = getpass.getpass("Client-Secret (Eingabe unsichtbar): ").strip()
params = {"client_id": cid, "response_type": "code", "redirect_uri": "http://localhost/exchange_token",
          "approval_prompt": "force", "scope": "read,activity:read_all,profile:read_all"}
print("\nIm Browser öffnen:\n  https://www.strava.com/oauth/authorize?" + urllib.parse.urlencode(params) + "\n")
code = input("code aus der Adresszeile: ").strip()
data = urllib.parse.urlencode({"client_id": cid, "client_secret": secret, "code": code, "grant_type": "authorization_code"}).encode()
with urllib.request.urlopen(urllib.request.Request("https://www.strava.com/oauth/token", data=data, method="POST")) as r:
    tok = json.load(r)
print("\nRefresh-Token:", tok["refresh_token"])
print("Athlet:", tok.get("athlete", {}).get("firstname"), tok.get("athlete", {}).get("lastname"))
print("\nAls GitHub-Secrets eintragen: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN")
