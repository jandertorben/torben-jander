/* Gegenwind-Radar (Startseite).
   Holt /api/wind (eigene Cloudflare-Funktion, siehe functions/api/wind.js) und füllt #wind.
   Kein Drittanbieter im Browser, keine Cookies. Ohne Daten bleibt der Abschnitt verborgen. */
(function (global) {
  'use strict';

  /* ── Reine Rechenfunktionen (auch in Tests nutzbar) ───────────────────────── */

  // Gegenwind-Stufe 1–5. Böen zählen mit, aber nicht voll.
  function level(speed, gusts) {
    var eff = Math.max(speed || 0, (gusts || 0) * 0.6);
    if (eff < 12) return 1;
    if (eff < 20) return 2;
    if (eff < 28) return 3;
    if (eff < 38) return 4;
    return 5;
  }

  // 0–359° → Index in N, NO, O, SO, S, SW, W, NW
  function dirIndex(deg) {
    return Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  }

  // SVG-Pfad (M x y L x y …) → Punkte. x zeigt nach Osten, y nach Süden.
  function parsePath(d) {
    var nums = (d || '').match(/-?\d+(?:\.\d+)?/g) || [];
    var pts = [];
    for (var i = 0; i + 1 < nums.length; i += 2) pts.push([parseFloat(nums[i]), parseFloat(nums[i + 1])]);
    return pts;
  }

  // Richtung vom Start zum entferntesten Punkt der Runde, als Kompasswinkel (0 = Nord, 90 = Ost).
  // Bei einer Runde ist das die Richtung, in die man „raus“ fährt. Ob man sie links- oder rechtsherum
  // fährt, ändert daran nichts: Der Gegenwind auf dem Hinweg hängt nur davon ab, wo der äußerste Punkt liegt.
  function outBearing(pts) {
    if (pts.length < 2) return null;
    var s = pts[0], far = null, best = -1;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - s[0], dy = pts[i][1] - s[1], dd = dx * dx + dy * dy;
      if (dd > best) { best = dd; far = [dx, dy]; }
    }
    if (!far || best < 1) return null;
    var deg = Math.atan2(far[0], -far[1]) * 180 / Math.PI;   // y nach Süden → Norden ist -y
    return (deg + 360) % 360;
  }

  // +1: Runde führt genau in den Wind hinaus (Rückenwind heimwärts), −1: genau mit dem Wind hinaus.
  function windFit(bearing, windFrom) {
    if (bearing === null) return null;
    return Math.cos((bearing - windFrom) * Math.PI / 180);
  }

  // Touren nach Eignung sortieren
  function rankTours(tours, windFrom) {
    return tours.map(function (t) {
      return { t: t, fit: windFit(outBearing(parsePath(t.d)), windFrom) };
    }).filter(function (r) { return r.fit !== null; })
      .sort(function (a, b) { return b.fit - a.fit; });
  }

  // Ruhigste Stunde der nächsten 12
  function calmest(hours) {
    var best = null;
    (hours || []).forEach(function (h) {
      if (h.speed === null || h.speed === undefined) return;
      if (!best || h.speed < best.speed) best = h;
    });
    return best;
  }

  var api = { level: level, dirIndex: dirIndex, parsePath: parsePath, outBearing: outBearing, windFit: windFit, rankTours: rankTours, calmest: calmest };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  /* ── Darstellung ──────────────────────────────────────────────────────────── */

  var sec = document.getElementById('wind');
  var cfgEl = document.getElementById('wind-cfg');
  if (!sec || !cfgEl || !global.fetch) return;
  var cfg;
  try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { return; }

  function $(sel) { return sec.querySelector(sel); }
  // Ersetzt %s und %d der Reihe nach durch die übergebenen Werte
  function fill(str) {
    var args = Array.prototype.slice.call(arguments, 1), i = 0;
    return String(str).replace(/%[sd]/g, function (m) { return i < args.length ? args[i++] : m; });
  }
  function hourOf(iso) { var m = /T(\d{2}):(\d{2})/.exec(iso || ''); return m ? m[1] : ''; }
  function timeOf(iso) { var m = /T(\d{2}:\d{2})/.exec(iso || ''); return m ? m[1] : ''; }

  // Satz mit einem Link an der Stelle des ersten %s; das zweite %s wird Text
  function linkSentence(el, tpl, tour) {
    el.textContent = '';
    var parts = String(tpl).split('%s');
    el.appendChild(document.createTextNode(parts[0] || ''));
    var a = document.createElement('a');
    a.href = tour.url; a.textContent = tour.title;
    if (/^https?:/.test(tour.url)) { a.target = '_blank'; a.rel = 'noopener'; }
    el.appendChild(a);
    el.appendChild(document.createTextNode((parts[1] || '') + (parts.length > 2 ? tour.km + parts.slice(2).join('%s') : '')));
  }

  function render(w) {
    var lv = level(w.speed, w.gusts);
    sec.dataset.level = lv;
    $('.wind-say').textContent = cfg.levels[lv - 1];
    $('.wind-v').textContent = w.speed;
    $('.wind-dir').textContent = fill(cfg.from, cfg.dirs[dirIndex(w.dir)]);
    $('.wind-gust').textContent = w.gusts ? fill(cfg.gusts, w.gusts) : '';
    $('.wind-level-t').textContent = fill(cfg.level, lv);
    sec.querySelectorAll('.wind-dots i').forEach(function (d, i) { d.classList.toggle('on', i < lv); });
    // Pfeil zeigt, wohin der Wind weht (aus West → nach Ost). Ungedreht zeigt er nach Süden, also Wind aus Nord.
    $('.wr-arrow').style.transform = 'rotate(' + (w.dir % 360) + 'deg)';

    // Verlauf der nächsten Stunden
    var bars = $('.wh-bars'); bars.textContent = '';
    var hours = (w.hours || []).slice(0, 12);
    var max = Math.max.apply(null, hours.map(function (h) { return Math.max(h.speed || 0, 30); }));
    hours.forEach(function (h, i) {
      var b = document.createElement('div');
      b.className = 'wh-bar wl-' + level(h.speed, h.gusts);
      var col = document.createElement('i');
      col.style.height = Math.max(4, Math.round((h.speed || 0) / max * 100)) + '%';
      var lab = document.createElement('span');
      lab.textContent = (i % 3 === 0) ? hourOf(h.t) : '';
      var arr = document.createElement('b');
      arr.textContent = '↓';
      arr.style.transform = 'rotate(' + (h.dir || 0) + 'deg)';
      b.title = hourOf(h.t) + ':00 · ' + h.speed + ' km/h ' + fill(cfg.from, cfg.dirs[dirIndex(h.dir || 0)]);
      b.appendChild(arr); b.appendChild(col); b.appendChild(lab);
      bars.appendChild(b);
    });
    var c = calmest(hours);
    $('.wh-note').textContent = (c && c.speed < w.speed - 2) ? fill(cfg.calm, hourOf(c.t), c.speed) : cfg.calmNow;

    // Tour-Tipp
    var tip = $('.wind-tip');
    var ranked = rankTours(cfg.tours || [], w.dir);
    if (ranked.length) {
      var t = $('.wind-tip-t'), av = $('.wind-tip-avoid');
      av.textContent = '';
      if (lv <= 1) {
        t.textContent = cfg.tipNone;
      } else {
        linkSentence(t, ranked[0].fit >= 0.5 ? cfg.tipGood : cfg.tipMeh, ranked[0].t);
        var worst = ranked[ranked.length - 1];
        if (ranked.length > 1 && worst.fit <= -0.5 && worst.t.url !== ranked[0].t.url) {
          var parts = String(cfg.avoid).split('%s');
          av.appendChild(document.createTextNode(parts[0]));
          var a = document.createElement('a'); a.href = worst.t.url; a.textContent = worst.t.title;
          if (/^https?:/.test(worst.t.url)) { a.target = '_blank'; a.rel = 'noopener'; }
          av.appendChild(a);
          av.appendChild(document.createTextNode(parts.slice(1).join('%s')));
        }
      }
      tip.hidden = false;
    }

    $('.wind-stand').textContent = fill(cfg.stand, timeOf(w.time));
    sec.hidden = false;
  }

  fetch('/api/wind', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (w) { if (w && typeof w.speed === 'number' && typeof w.dir === 'number') render(w); })
    .catch(function () { /* kein Wind, kein Abschnitt */ });
})(typeof window !== 'undefined' ? window : this);
