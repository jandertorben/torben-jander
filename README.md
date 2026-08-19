# Torben Jander – Persönliche Homepage

Hugo-basierte persönliche Website für **torben-jander.me**. Die Seite verbindet Projekte, Fotografie, Notizen und persönliche Themen in einem leichten, redaktionellen Layout.

## Lokal starten

```bash
cd torben-jander
hugo server
```

Danach: `http://localhost:1313`

## Inhalte pflegen

Die Inhalte der Startseite liegen bewusst zentral in:

```text
content/_index.md
```

Dort können ohne Änderungen am HTML gepflegt werden:

- `hero` – Einstiegstext
- `aktuell` – „Gerade bei mir“
- `projekte` – Projekte und Apps
- `fotografie` – Fotografie-Serien
- `notizen` – Journal-/Notiz-Karten

Globale Angaben wie Name, Standort, Social Links und SEO-Metadaten liegen in:

```text
hugo.toml
```

## Bilder

Vorhandene Bilder liegen in `assets/img/` bzw. werden über die bestehende Hugo-Struktur eingebunden. Das Profilbild wird über `params.foto` in `hugo.toml` gesteuert.

## Design

Das Basistheme bleibt `industrial`. Das persönliche Editorial-Redesign liegt als eigene Override-Datei in:

```text
themes/industrial/assets/css/personal.css
```

Dadurch bleibt das bestehende Theme erhalten und das neue Design ist klar davon getrennt.

## SEO

Enthalten sind unter anderem:

- individuelle Meta Description
- Canonical URL
- Open Graph
- Twitter Cards
- Schema.org `Person` als JSON-LD
- `robots.txt` über Hugo
- XML-Sitemap über Hugo
- semantische Überschriftenstruktur
- beschreibende Alt-Texte
- lokal gehostete Fonts
- responsive Darstellung

## Deployment

Für Cloudflare Pages oder Netlify:

```bash
hugo --minify
```

| Einstellung | Wert |
|---|---|
| Build command | `hugo --minify` |
| Publish directory | `public` |
| Hugo Version | `0.120+` |

Die Security- und Cache-Header liegen weiterhin in `static/_headers`.
