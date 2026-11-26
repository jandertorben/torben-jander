/* Gegenwind-Radar und Fahrradwetter (Startseite kompakt, /wetter/ ausführlich).
   Holt /api/wind (eigene Cloudflare-Funktion, siehe functions/api/wind.js) und füllt #wind.
   Kein Drittanbieter im Browser, keine Cookies. Ohne Daten bleibt der Abschnitt verborgen.
   Jedes Feld wird nur gefüllt, wenn es auf der Seite existiert und die Daten dafür da sind. */
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

  function rankTours(tours, windFrom) {
    return tours.map(function (t) {
      return { t: t, fit: windFit(outBearing(parsePath(t.d)), windFrom) };
    }).filter(function (r) { return r.fit !== null; })
      .sort(function (a, b) { return b.fit - a.fit; });
  }

  function calmest(hours) {
    var best = null;
    (hours || []).forEach(function (h) {
      if (h.speed === null || h.speed === undefined) return;
      if (!best || h.speed < best.speed) best = h;
    });
    return best;
  }

  // Ist eine Stunde „nass“? Ab 50 % Wahrscheinlichkeit oder ab 0,3 mm.
  function isWet(h) {
    return !!h && ((h.rainProb !== null && h.rainProb !== undefined && h.rainProb >= 50) || (h.rain || 0) >= 0.3);
  }

  // Regen-Lage: {kind:'now'|'from'|'dryFrom'|'stays'|'dry', hour}
  function rainState(nowRain, hours) {
    var hs = hours || [];
    var wetNow = (nowRain || 0) >= 0.1 || isWet(hs[0]);
    if (wetNow) {
      for (var i = 1; i < hs.length; i++) if (!isWet(hs[i])) return { kind: 'dryFrom', hour: hs[i].t };
      return { kind: 'stays' };
    }
    for (var j = 1; j < hs.length; j++) if (isWet(hs[j])) return { kind: 'from', hour: hs[j].t };
    return { kind: 'dry' };
  }

  // Kleidungsstufe 0–5 nach gefühlter Temperatur
  function wearIndex(feels) {
    if (feels === null || feels === undefined) return null;
    if (feels <= 0) return 0;
    if (feels <= 5) return 1;
    if (feels <= 10) return 2;
    if (feels <= 15) return 3;
    if (feels <= 20) return 4;
    return 5;
  }

  // Licht: vor oder nach Sonnenuntergang? Zeiten als 'YYYY-MM-DDTHH:MM' (Ortszeit Bremen).
  function lightState(nowIso, days) {
    var d0 = (days || [])[0], d1 = (days || [])[1];
    if (!nowIso || !d0 || !d0.sunset) return null;
    if (d0.sunrise && nowIso < d0.sunrise) return { kind: 'morning', at: d0.sunrise, set: d0.sunset };
    if (nowIso < d0.sunset) return { kind: 'before', at: d0.sunset, rise: d0.sunrise };
    return { kind: 'after', at: d1 && d1.sunrise ? d1.sunrise : null, set: d0.sunset };
  }

  var api = { level: level, dirIndex: dirIndex, parsePath: parsePath, outBearing: outBearing, windFit: windFit,
              rankTours: rankTours, calmest: calmest, isWet: isWet, rainState: rainState, wearIndex: wearIndex, lightState: lightState };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  global.TJWind = api;   // für planer.js

  /* ── Darstellung ──────────────────────────────────────────────────────────── */

  var sec = document.getElementById('wind');
  var cfgEl = document.getElementById('wind-cfg');
  if (!sec || !cfgEl || !global.fetch) return;
  var cfg;
  try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { return; }

  function $(sel) { return sec.querySelector(sel); }
  function set(sel, text) { var el = $(sel); if (el) el.textContent = text; return el; }
  // Ersetzt %s und %d der Reihe nach durch die übergebenen Werte
  function fill(str) {
    var args = Array.prototype.slice.call(arguments, 1), i = 0;
    return String(str).replace(/%[sd]/g, function (m) { return i < args.length ? args[i++] : m; });
  }
  function hourOf(iso) { var m = /T(\d{2}):(\d{2})/.exec(iso || ''); return m ? m[1] : ''; }
  function timeOf(iso) { var m = /T(\d{2}:\d{2})/.exec(iso || ''); return m ? m[1] : ''; }
  function has(n) { return typeof n === 'number' && isFinite(n); }

  function linkInto(el, tpl, tour, rest) {
    el.textContent = '';
    var parts = String(tpl).split('%s');
    el.appendChild(document.createTextNode(parts[0] || ''));
    var a = document.createElement('a');
    a.href = tour.url; a.textContent = tour.title;
    if (/^https?:/.test(tour.url)) { a.target = '_blank'; a.rel = 'noopener'; }
    el.appendChild(a);
    var tail = parts.slice(1).join('%s');
    el.appendChild(document.createTextNode(rest !== undefined ? fill(tail, rest) : tail));
  }

  function rainText(w) {
    var r = rainState(w.rain, w.hours);
    if (r.kind === 'dryFrom') return fill(cfg.rainDryFrom, hourOf(r.hour));
    if (r.kind === 'stays') return cfg.rainStays;
    if (r.kind === 'from') return fill(cfg.rainFrom, hourOf(r.hour));
    return cfg.rainDry;
  }
  function rainSoon(w) { var r = rainState(w.rain, w.hours); return r.kind !== 'dry'; }

  function render(w) {
    var lv = level(w.speed, w.gusts);
    sec.dataset.level = lv;
    set('.wind-say', cfg.levels[lv - 1]);
    set('.wind-v', w.speed);
    set('.wind-dir', fill(cfg.from, cfg.dirs[dirIndex(w.dir)]));
    set('.wind-gust', w.gusts ? fill(cfg.gusts, w.gusts) : '');
    set('.wind-level-t', fill(cfg.level, lv));
    sec.querySelectorAll('.wind-dots i').forEach(function (d, i) { d.classList.toggle('on', i < lv); });
    // Pfeil zeigt, wohin der Wind weht (aus West → nach Ost). Ungedreht zeigt er nach Süden, also Wind aus Nord.
    var arrow = $('.wr-arrow'); if (arrow) arrow.style.transform = 'rotate(' + (w.dir % 360) + 'deg)';

    var hours = (w.hours || []).slice(0, 12);
    var wi = wearIndex(has(w.feels) ? w.feels : w.temp);
    var wet = rainSoon(w);

    // Startseite: eine Zeile Regen, eine Zeile Kleidung
    set('.wb-rain', rainText(w));
    if (wi !== null) set('.wb-wear', cfg.wearShort[wi] + (wet ? ' ' + cfg.wearRain : ''));

    // Wind: die nächsten 12 Stunden
    var bars = $('.wh-bars');
    if (bars) {
      bars.textContent = '';
      var max = Math.max.apply(null, hours.map(function (h) { return Math.max(h.speed || 0, 30); }));
      hours.forEach(function (h, i) {
        var b = document.createElement('div');
        b.className = 'wh-bar wl-' + level(h.speed, h.gusts);
        var arr = document.createElement('b');
        arr.textContent = '↓';
        arr.style.transform = 'rotate(' + (h.dir || 0) + 'deg)';
        var col = document.createElement('i');
        col.style.height = Math.max(4, Math.round((h.speed || 0) / max * 100)) + '%';
        var lab = document.createElement('span');
        lab.textContent = (i % 3 === 0) ? hourOf(h.t) : '';
        b.title = hourOf(h.t) + ':00 · ' + h.speed + ' km/h ' + fill(cfg.from, cfg.dirs[dirIndex(h.dir || 0)]);
        b.appendChild(arr); b.appendChild(col); b.appendChild(lab);
        bars.appendChild(b);
      });
      var c = calmest(hours);
      set('.wh-note', (c && c.speed < w.speed - 2) ? fill(cfg.calm, hourOf(c.t), c.speed) : cfg.calmNow);
    }

    // Anziehen
    if ($('.wx-wear') && wi !== null) {
      set('.wx-wear', cfg.wear[wi]);
      var ul = $('.wx-extras'); ul.textContent = '';
      var extras = [];
      if (wet) extras.push(cfg.wearRain);
      if (wet && has(w.feels) && w.feels <= 8) extras.push(cfg.wearShoes);
      if (lv >= 3 && wi >= 2) extras.push(cfg.wearWind);
      extras.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
    }

    // Regen
    if ($('.wx-rain')) {
      set('.wx-rain', rainText(w));
      var rb = $('.wx-rbars'); rb.textContent = '';
      hours.forEach(function (h, i) {
        var b = document.createElement('div');
        b.className = 'rb-bar' + (isWet(h) ? ' is-wet' : '');
        var col = document.createElement('i');
        var p = has(h.rainProb) ? h.rainProb : ((h.rain || 0) > 0 ? 60 : 0);
        col.style.height = Math.max(3, p) + '%';
        var lab = document.createElement('span');
        lab.textContent = (i % 3 === 0) ? hourOf(h.t) : '';
        b.title = hourOf(h.t) + ':00 · ' + (has(h.rainProb) ? h.rainProb + ' %' : '') + (h.rain ? ' · ' + h.rain + ' mm' : '');
        b.appendChild(col); b.appendChild(lab);
        rb.appendChild(b);
      });
    }

    // Temperatur
    if ($('.wx-t') && has(w.temp)) {
      set('.wx-t', w.temp);
      set('.wx-feels', has(w.feels) ? fill(cfg.feels, w.feels) : '');
      var ts = hours.map(function (h) { return h.temp; }).filter(has);
      set('.wx-range', ts.length ? fill(cfg.tempRange, Math.min.apply(null, ts), Math.max.apply(null, ts)) : '');
    }

    // Licht
    if ($('.wx-light')) {
      var L = lightState(w.time, w.days);
      if (L) {
        if (L.kind === 'before') set('.wx-light', fill(cfg.lightBefore, timeOf(L.at)));
        else if (L.kind === 'morning') set('.wx-light', fill(cfg.lightMorning, timeOf(L.at)));
        else set('.wx-light', fill(cfg.lightAfter, L.at ? timeOf(L.at) : '–'));
        var d0 = w.days[0];
        set('.wx-sun', '↑ ' + timeOf(d0.sunrise) + '   ↓ ' + timeOf(d0.sunset));
      }
    }

    // Tour-Tipp
    var tip = $('.wind-tip');
    if (tip) {
      var ranked = rankTours(cfg.tours || [], w.dir);
      if (ranked.length) {
        var t = $('.wind-tip-t'), av = $('.wind-tip-avoid');
        av.textContent = '';
        if (lv <= 1) {
          t.textContent = cfg.tipNone;
        } else {
          linkInto(t, ranked[0].fit >= 0.5 ? cfg.tipGood : cfg.tipMeh, ranked[0].t, ranked[0].t.km);
          var worst = ranked[ranked.length - 1];
          if (ranked.length > 1 && worst.fit <= -0.5 && worst.t.url !== ranked[0].t.url) linkInto(av, cfg.avoid, worst.t);
        }
        tip.hidden = false;
      }
    }

    set('.wind-stand', fill(cfg.stand, timeOf(w.time)));
    sec.hidden = false;
  }

  var last = 0;
  function load() {
    last = Date.now();
    fetch('/api/wind', { headers: { Accept: 'application/json' }, cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (w) { if (w && typeof w.speed === 'number' && typeof w.dir === 'number') render(w); })
      .catch(function () { /* kein Wetter, kein Abschnitt; bei späterem Erfolg erscheint er */ });
  }
  load();
  // Bleibt die Seite offen, alle 10 Minuten nachladen. Kommt man in den Tab zurück, sofort, wenn es älter ist.
  setInterval(function () { if (!document.hidden) load(); }, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - last > 10 * 60 * 1000) load();
  });
})(typeof window !== 'undefined' ? window : this);
