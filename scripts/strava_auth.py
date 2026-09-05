#!/usr/bin/env python3
"""Einmalige Einrichtung der Strava-Automatik. Läuft komplett lokal.

Ablauf:
  1. Fragt Client-ID (Vorgabe: die Anwendung „torben-jander.me“) und Client-Secret ab.
     Das Secret steht auf https://www.strava.com/settings/api hinter „Anzeigen“.
  2. Öffnet die Strava-Freigabe im Browser und wartet auf die Rückleitung nach localhost.
  3. Tauscht den Code gegen einen Refresh-Token mit Scope activity:read_all.
  4. Legt die drei GitHub-Secrets per gh an, schreibt eine lokale .env (ignoriert von Git)
     und startet den Workflow „Strava-Daten aktualisieren“ einmal von Hand.
Es werden keine Zugangsdaten ausgegeben oder gespeichert außer in .env und den GitHub-Secrets.
"""
import getpass, http.server, json, os, subprocess, sys, threading, urllib.parse, urllib.request, webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765
REDIRECT = f"http://localhost:{PORT}/exchange_token"
DEFAULT_CLIENT_ID = "277243"

cid = input(f"Client-ID [{DEFAULT_CLIENT_ID}]: ").strip() or DEFAULT_CLIENT_ID
secret = getpass.getpass("Client-Secret (Eingabe unsichtbar): ").strip()
if not secret:
    sys.exit("Ohne Client-Secret geht es nicht.")

code_holder = {}
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if "code" in q:
            code_holder["code"] = q["code"][0]
            body = "<h2 style='font-family:sans-serif'>Freigabe erhalten. Du kannst dieses Fenster schließen.</h2>"
            self.send_response(200)
        else:
            body = "<h2 style='font-family:sans-serif'>Freigabe abgelehnt oder fehlerhaft.</h2>"
            self.send_response(400)
        self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers()
        self.wfile.write(body.encode())
        threading.Thread(target=self.server.shutdown, daemon=True).start()
    def log_message(self, *a): pass

srv = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
params = {"client_id": cid, "response_type": "code", "redirect_uri": REDIRECT,
          "approval_prompt": "force", "scope": "read,activity:read_all,profile:read_all"}
url = "https://www.strava.com/oauth/authorize?" + urllib.parse.urlencode(params)
print("\nIm Browser öffnet sich jetzt die Strava-Freigabe. Falls nicht, diesen Link öffnen:\n  " + url + "\n")
webbrowser.open(url)
print("Warte auf die Freigabe …")
srv.serve_forever()
code = code_holder.get("code")
if not code:
    sys.exit("Keine Freigabe erhalten.")

data = urllib.parse.urlencode({"client_id": cid, "client_secret": secret, "code": code, "grant_type": "authorization_code"}).encode()
with urllib.request.urlopen(urllib.request.Request("https://www.strava.com/oauth/token", data=data, method="POST"), timeout=30) as r:
    tok = json.load(r)
refresh = tok["refresh_token"]
ath = tok.get("athlete", {})
print(f"Verbunden als {ath.get('firstname','')} {ath.get('lastname','')}.")

def gh(*args, body=None):
    return subprocess.run(["gh", *args], input=body, text=True, capture_output=True, cwd=ROOT)

if input("GitHub-Secrets jetzt setzen? [J/n] ").strip().lower() in ("", "j", "ja", "y", "yes"):
    for name, val in (("STRAVA_CLIENT_ID", cid), ("STRAVA_CLIENT_SECRET", secret), ("STRAVA_REFRESH_TOKEN", refresh)):
        r = gh("secret", "set", name, body=val)
        print(f"  {name}: {'ok' if r.returncode == 0 else 'Fehler: ' + r.stderr.strip()}")
    r = gh("workflow", "run", "Strava-Daten aktualisieren")
    print("Workflow gestartet." if r.returncode == 0 else "Workflow-Start fehlgeschlagen: " + r.stderr.strip())
    print("Verfolgen mit: gh run watch  (oder auf GitHub unter Actions)")

if input("Lokale .env für scripts/strava_fetch.py schreiben? [J/n] ").strip().lower() in ("", "j", "ja", "y", "yes"):
    with open(os.path.join(ROOT, ".env"), "w") as f:
        f.write(f"STRAVA_CLIENT_ID={cid}\nSTRAVA_CLIENT_SECRET={secret}\nSTRAVA_REFRESH_TOKEN={refresh}\n")
    os.chmod(os.path.join(ROOT, ".env"), 0o600)
    print("  .env geschrieben (nur für dich lesbar, von Git ignoriert).")
print("\nFertig.")
