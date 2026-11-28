/* Matsch-Indikator (nur /wetter/). Schätzt, wie weich die Graveluntergründe um Bremen
   gerade sind – aus der modellierten Bodenfeuchte (Open-Meteo, /api/boden), mit Sonderfall
   Frost/Tauwetter im Winter. Bewusst eine grobe Tendenz für die ganze Stadt, keine Aussage
   pro Weg (Marsch-Lehm hält Wasser länger als Waldsand).
   Ohne JavaScript oder ohne Daten bleibt die Karte verborgen. */
(function (global) {
  'use strict';

  // --- Schwellen, vorläufig: anhand echter Fahrten nachjustieren --------------
  // Bodenfeuchte 3–9 cm in m³/m³. Darunter fest, dazwischen feucht, darüber matschig.
  var S_DRY = 0.33;
  var S_WET = 0.40;
  // Frost/Tauwetter über die kälteste Nacht der letzten Tage und die aktuelle Temperatur.
  var FROST_NIGHT = -2;   // kälteste Nacht <= diese → Boden kann gefroren sein
  var FROST_NOW = 0.5;    // und aktuell <= diese → gefroren, meist fest
  var THAW_NIGHT = -3;    // war es gefroren …
  var THAW_NOW = 3;       // … und taut jetzt (>= diese) → besonders weich
  // ----------------------------------------------------------------------------

  function classify(d) {
    var soil = d.soil != null ? d.soil : d.soilTop;
    if (d.tMin != null && d.temp != null && d.tMin <= FROST_NIGHT && d.temp <= FROST_NOW) return 'frozen';
    if (d.tMin != null && d.temp != null && d.tMin <= THAW_NIGHT && d.temp >= THAW_NOW) return 'thaw';
    if (soil == null) return null;
    if (soil >= S_WET) return 'mud';
    if (soil >= S_DRY) return 'damp';
    return 'firm';
  }

  var api = { classify: classify };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  var box = document.querySelector('[data-matsch]');
  var cfgEl = document.getElementById('matsch-cfg');
  if (!box || !cfgEl || !global.fetch) return;
  var c;
  try { c = JSON.parse(cfgEl.textContent); } catch (e) { return; }

  function fill(str) {
    var args = Array.prototype.slice.call(arguments, 1), i = 0;
    return String(str).replace(/%s/g, function (m) { return i < args.length ? args[i++] : m; });
  }

  fetch('/api/boden', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || d.error) return;
      var state = classify(d);
      if (!state) return;
      var s = c.states[state];
      if (!s) return;

      box.querySelector('[data-matsch-state]').textContent = s.label;
      box.querySelector('[data-matsch-say]').textContent = s.say;

      var ctx = box.querySelector('[data-matsch-ctx]');
      if (d.rainDays != null) {
        ctx.textContent = fill(c.ctxRain, String(d.rainDays).replace('.', ','));
      } else {
        ctx.textContent = '';
      }

      var stand = box.querySelector('[data-matsch-stand]');
      var t = /T(\d{2}:\d{2})/.exec(d.time || '');
      if (stand && t) stand.textContent = fill(c.stand, t[1]);

      box.classList.add('is-' + state);
      box.hidden = false;
    })
    .catch(function () {});
})(typeof window !== 'undefined' ? window : this);
