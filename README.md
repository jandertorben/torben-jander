# torben-jander.me

Persönliche Website von Torben Jander: Laufen und Gravel rund um Bremen, mit echten Zahlen aus Strava.
Statisch gebaut mit [Hugo](https://gohugo.io), zweisprachig (Deutsch unter `/`, Englisch unter `/en/`), ohne Tracking und ohne Cookies.

## Lokal starten

```bash
hugo server
```

Vorschau unter http://localhost:1313. Produktions-Build mit `hugo --gc --minify`, Ausgabe in `public/`.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `hugo.toml` | Konfiguration, Sprachen, Kontaktdaten, Strava-Link |
| `content/_index.de.md`, `content/_index.en.md` | Startseite: Absätze für „Über mich“ |
| `content/impressum.md`, `content/datenschutz.md` | Rechtliches (nur Deutsch) |
| `i18n/de.toml`, `i18n/en.toml` | Alle Texte der Startseite in beiden Sprachen |
| `data/strava.json` | Aufbereitete Sportdaten: Jahreszahlen, Wochen, Routen, Ausrüstung |
| `layouts/` | Templates (Startseite, Rechtsseiten, 404, Partials) |
| `assets/css/main.css`, `assets/js/main.js` | Gestaltung und Animationen (werden von Hugo minimiert und gehasht) |
| `static/fonts/` | Barlow Condensed, Barlow, JetBrains Mono (lokal, kein Google-Fonts-Aufruf) |
| `static/_headers` | Security-Header für Cloudflare Pages |
| `scripts/build_strava_data.py` | Erzeugt `data/strava.json` aus den Rohdaten |

## Strava-Daten aktualisieren

Die Website ruft **nie** Strava auf. Die Zahlen werden vorab erzeugt und als `data/strava.json` mit ausgeliefert.

### Automatisch (GitHub Action, kostenlos)

`.github/workflows/strava.yml` läuft täglich um 04:17 UTC, holt alle Aktivitäten seit 2025 über die Strava-API,
baut `data/strava.json` neu und committet nur diese Datei, wenn sich etwas geändert hat. Der Push löst den
Cloudflare-Build aus. Manuell starten: GitHub, Reiter „Actions“, „Strava-Daten aktualisieren“, „Run workflow“.

Einmalige Einrichtung (etwa 10 Minuten):

1. Auf https://www.strava.com/settings/api eine API-Anwendung anlegen. Callback-Domain: `localhost`.
2. Lokal `python3 scripts/strava_auth.py` ausführen und den Anweisungen folgen. Das Skript gibt einen Refresh-Token aus.
3. Im GitHub-Repo unter Settings, Secrets and variables, Actions drei Secrets anlegen:
   `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`.
4. Den Workflow einmal von Hand starten und prüfen, ob ein Commit `data: Strava-Daten vom …` entsteht.

Strava erlaubt 200 Anfragen pro 15 Minuten und 2.000 pro Tag; der tägliche Lauf braucht unter zehn.

### Von Hand

`scripts/strava_fetch.py` funktioniert auch lokal, wenn die drei Werte in einer `.env`-Datei im Projektordner stehen
(die Datei ist per `.gitignore` ausgeschlossen). Danach `python3 scripts/build_strava_data.py` und `data/strava.json` committen.

Alternativ ohne API: Rohdaten in `strava-raw/` ablegen (ebenfalls ignoriert, weil sie ungekürzte GPS-Spuren enthalten):
`activities-*.json` mit `reduced_polyline`, optional `history-*.csv` (`date,sport_type,distance,moving_time,elevation_gain`)
und `gear.json`. Dann das Build-Skript ausführen.

Datenschutz: Das Skript kürzt jede Route um 600 m am Start und am Ziel und zeichnet nur Strecken ab 5 km. Von den vielen fast identischen Pendelstrecken landet nur eine Auswahl auf der Karte.

## Deployment

Cloudflare Pages, verbunden mit diesem Repository (Branch `main`).

| Einstellung | Wert |
|---|---|
| Build command | `hugo --gc --minify` |
| Publish directory | `public` |
| Umgebungsvariable | `HUGO_VERSION` = `0.164.0` (mindestens 0.146) |
