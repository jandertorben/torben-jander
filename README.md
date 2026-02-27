# Torben Jander – Portfolio
**Hugo-Theme: industrial | Version 2.0**

---

## Schnellstart

```bash
# 1. In den Projektordner wechseln
cd torben-jander

# 2. Lokalen Vorschau-Server starten
hugo server

# Browser öffnen: http://localhost:1313
```

---

## Profilfoto einbinden

1. Foto als `torben-profil.jpg` in diesen Ordner legen:
   ```
   torben-jander/static/img/torben-profil.jpg
   ```
2. Empfohlene Maße: **600 × 750 px** (Verhältnis 4:5), JPG oder WebP
3. Hugo lädt beim nächsten Build automatisch neu

---

## Inhalte bearbeiten

**Alle Texte** stehen in einer einzigen Datei:
```
content/_index.md
```

Dort lassen sich im YAML-Bereich oben bearbeiten:
- `bridge` → Die drei Profil-Karten
- `projekte` → Portfolio-Projekte
- `referenz` → Zitat & Referenzgeber
- `stack` → Technologie-Gruppen

**Globale Einstellungen** (Name, E-Mail, LinkedIn):
```
hugo.toml
```

---

## Netlify-Deployment

```bash
# Produktions-Build
hugo --minify
```

| Einstellung | Wert |
|---|---|
| Build command | `hugo --minify` |
| Publish directory | `public` |
| Hugo Version | 0.120+ |

---

## Ordnerstruktur

```
torben-jander/
│
├── hugo.toml                         ← Konfiguration & globale Parameter
│
├── content/
│   ├── _index.md                     ← Alle Seiteninhalte (YAML)
│   ├── impressum.md                  ← Pflichtangaben § 5 TMG
│   └── datenschutz.md                ← DSGVO-Erklärung
│
├── static/
│   └── img/
│       └── torben-profil.jpg         ← Profilfoto hier ablegen
│
└── themes/
    └── industrial/
        ├── assets/
        │   ├── css/
        │   │   └── main.css          ← Komplettes Stylesheet
        │   └── js/
        │       └── main.js           ← Navigation, Animationen, Cookie
        │
        └── layouts/
            ├── index.html            ← Homepage-Aufbau
            ├── _default/
            │   ├── baseof.html       ← HTML-Grundgerüst
            │   └── rechtlich.html    ← Layout für Impressum/Datenschutz
            ├── taxonomy/
            │   └── taxonomy.html     ← Hugo-Pflichtlayout
            └── partials/
                ├── nav.html          ← Navigation
                ├── mobile-menu.html  ← Mobiles Menü
                ├── hero.html         ← Kopfbereich mit Foto
                ├── bridge.html       ← Profil-Karten
                ├── portfolio.html    ← Projektübersicht
                ├── referenz.html     ← Kundenstimme
                ├── techstack.html    ← Technologien
                ├── footer.html       ← Fußzeile
                └── cookie-banner.html ← DSGVO-Hinweis
```
