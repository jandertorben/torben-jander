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

1. Rohdaten in `strava-raw/` ablegen (der Ordner ist per `.gitignore` ausgeschlossen, weil er ungekürzte GPS-Spuren enthält):
   - `activities-*.json`: Antworten von Stravas Aktivitätsliste inklusive `reduced_polyline`
   - `history-*.csv`: ältere Aktivitäten ohne Route (`date,sport_type,distance,moving_time,elevation_gain`)
   - `gear.json`: Räder und Schuhe mit Gesamtkilometern
2. Skript ausführen:

   ```bash
   python3 scripts/build_strava_data.py
   ```

3. `data/strava.json` committen und pushen.

Am einfachsten geht das mit Claude Code und der Strava-Anbindung: „Aktualisiere die Strava-Daten der Website“ holt die Aktivitäten, schreibt die Rohdaten und führt das Skript aus.

Datenschutz: Das Skript kürzt jede Route um 600 m am Start und am Ziel und zeichnet nur Strecken ab 5 km. Von den vielen fast identischen Pendelstrecken landet nur eine Auswahl auf der Karte.

## Deployment

Cloudflare Pages, verbunden mit diesem Repository (Branch `main`).

| Einstellung | Wert |
|---|---|
| Build command | `hugo --gc --minify` |
| Publish directory | `public` |
| Umgebungsvariable | `HUGO_VERSION` = `0.164.0` (mindestens 0.146) |
