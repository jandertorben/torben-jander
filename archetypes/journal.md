---
# Journal-Beitrag. Ordner: content/journal/<slug>/ mit index.de.md (optional index.en.md)
# Titelbild als cover.jpg in denselben Ordner, weitere Bilder ebenfalls dort.
# Bild im Text: ![Alt-Text](datei.jpg "Bildunterschrift")
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
kategorie: "Ausrüstung"
summary: "Ein Satz für Karte und Übersicht."
cover_alt: ""
# fakten:            # optionaler Kasten „Auf einen Blick“
#   - {k: "Rad", v: "…"}
---
