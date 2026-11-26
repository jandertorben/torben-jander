/* Fahrrad-Planer auf /wetter/: Tag und Zeitfenster wählen, Wetter dafür sehen, bestes Fenster finden.
   Holt /api/forecast (eigene Cloudflare-Funktion, siehe functions/api/forecast.js).
   Nutzt die Rechenfunktionen aus wind.js (window.TJWind) und dessen Texte (#wind-cfg). */
(function (global) {
  'use strict';

  var W = (typeof module !== 'undefined' && module.exports) ? require('./wind.js') : global.TJWind;

  /* ── Reine Rechenfunktionen ───────────────────────────────────────────────── */

  function hourNum(iso) { var m = /T(\d{2})/.exec(iso || ''); return m ? parseInt(m[1], 10) : null; }
  function dateOf(iso) { return String(iso || '').slice(0, 10); }
  function has(n) { return typeof n === 'number' && isFinite(n); }

  function dayHours(hours, date) {
    return (hours || []).filter(function (h) { return dateOf(h.t) === date; });
  }

  // Stunden im Fenster [from, to)
  function windowHours(dh, from, to) {
    return dh.filter(function (h) { var x = hourNum(h.t); return x !== null && x >= from && x < to; });
  }

  // Mittlere Windrichtung über Vektoren, gewichtet mit der Windstärke
  function meanDir(win) {
    var x = 0, y = 0;
    win.forEach(function (h) {
      if (!has(h.dir)) return;
      var s = has(h.speed) ? Math.max(h.speed, 1) : 1, r = h.dir * Math.PI / 180;
      x += Math.sin(r) * s; y += Math.cos(r) * s;
    });
    if (!x && !y) return null;
    return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
  }

  function hhmm(iso) { var m = /T(\d{2}):(\d{2})/.exec(iso || ''); return m ? parseInt(m[1], 10) + parseInt(m[2], 10) / 60 : null; }

  // Zusammenfassung eines Fensters
  function summarize(win, day, from, to) {
    if (!win.length) return null;
    function vals(k) { return win.map(function (h) { return h[k]; }).filter(has); }
    var sp = vals('speed'), gu = vals('gusts'), te = vals('temp'), fe = vals('feels'), pr = vals('rainProb'), ra = vals('rain');
    var sum = function (a) { return a.reduce(function (s, v) { return s + v; }, 0); };
    var rise = day ? hhmm(day.sunrise) : null, set = day ? hhmm(day.sunset) : null;
    var dark = 0;
    win.forEach(function (h) {
      var x = hourNum(h.t), mid = x + 0.5;
      if ((rise !== null && mid < rise) || (set !== null && mid > set)) dark++;
    });
    var s = {
      hours: win.length,
      speed: sp.length ? Math.round(sum(sp) / sp.length) : null,
      gusts: gu.length ? Math.max.apply(null, gu) : null,
      dir: meanDir(win),
      rainProb: pr.length ? Math.max.apply(null, pr) : null,
      rain: ra.length ? Math.round(sum(ra) * 10) / 10 : 0,
      tempMin: te.length ? Math.min.apply(null, te) : null,
      tempMax: te.length ? Math.max.apply(null, te) : null,
      feelsMin: fe.length ? Math.min.apply(null, fe) : null,
      dark: dark,
      sunsetInside: set !== null && set > from && set < to,
      sunriseInside: rise !== null && rise > from && rise < to,
      wet: win.some(W.isWet)
    };
    return s;
  }

  // Je kleiner, desto besser: Regen, Wind, Kälte und Dunkelheit kosten Punkte
  function score(s) {
    if (!s) return Infinity;
    return (s.rainProb || 0) * 1.0 + (s.rain || 0) * 20 +
           (s.speed || 0) * 1.2 + Math.max(0, (s.gusts || 0) - 35) * 0.8 +
           Math.max(0, 5 - (has(s.feelsMin) ? s.feelsMin : 5)) * 1.5 +
           (s.dark / Math.max(1, s.hours)) * 60;
  }

  // Bestes Fenster gleicher Länge an diesem Tag (06–21 Uhr, heute erst ab der nächsten vollen Stunde)
  function bestWindow(dh, day, len, nowIso) {
    var earliest = 6, latest = 21;
    if (nowIso && day && dateOf(nowIso) === day.date) earliest = Math.max(earliest, (hourNum(nowIso) || 0) + 1);
    var best = null;
    for (var f = earliest; f + len <= latest; f++) {
      var s = summarize(windowHours(dh, f, f + len), day, f, f + len);
      if (!s || s.hours < len) continue;
      var sc = score(s);
      if (!best || sc < best.score) best = { from: f, to: f + len, summary: s, score: sc };
    }
    return best;
  }

  var api = { dayHours: dayHours, windowHours: windowHours, meanDir: meanDir, summarize: summarize, score: score, bestWindow: bestWindow };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  /* ── Darstellung ──────────────────────────────────────────────────────────── */

  var sec = document.getElementById('planer');
  var pcEl = document.getElementById('planer-cfg');
  var wcEl = document.getElementById('wind-cfg');
  if (!sec || !pcEl || !wcEl || !W || !global.fetch) return;
  var pc, wc;
  try { pc = JSON.parse(pcEl.textContent); wc = JSON.parse(wcEl.textContent); } catch (e) { return; }

  var lang = document.documentElement.lang || 'de';
  var dayFmt = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' });
  var longFmt = new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  function utcDate(date) { var p = date.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }

  function $(sel) { return sec.querySelector(sel); }
  function set(sel, t) { var el = $(sel); if (el) el.textContent = t; return el; }
  function fill(str) {
    var args = Array.prototype.slice.call(arguments, 1), i = 0;
    return String(str).replace(/%[sd]/g, function (m) { return i < args.length ? args[i++] : m; });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(iso) { var m = /T(\d{2}:\d{2})/.exec(iso || ''); return m ? m[1] : ''; }

  var data = null, dayIdx = 0;
  var fromSel = $('#pl-from'), toSel = $('#pl-to'), daysEl = $('.pl-days');

  function nowIso() {
    // Ortszeit Bremen als 'YYYY-MM-DDTHH:MM'
    try {
      var p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
      return p.replace(' ', 'T');
    } catch (e) { return null; }
  }

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

  function buildDays() {
    daysEl.textContent = '';
    data.days.forEach(function (d, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pl-day' + (i === dayIdx ? ' is-on' : '') + (i >= 3 ? ' is-vague' : '');
      b.setAttribute('aria-pressed', i === dayIdx ? 'true' : 'false');
      var name = i === 0 ? pc.today : i === 1 ? pc.tomorrow : dayFmt.format(utcDate(d.date));
      var top = document.createElement('span'); top.textContent = name;
      var sub = document.createElement('small'); sub.textContent = utcDate(d.date).getUTCDate() + '.';
      b.appendChild(top); b.appendChild(sub);
      b.addEventListener('click', function () { dayIdx = i; buildDays(); update(); });
      daysEl.appendChild(b);
    });
  }

  function update() {
    if (!data) return;
    var day = data.days[dayIdx];
    var from = parseInt(fromSel.value, 10), to = parseInt(toSel.value, 10);
    if (to <= from) { to = Math.min(from + 1, 23); toSel.value = String(to); }
    var dh = dayHours(data.hours, day.date);
    var win = windowHours(dh, from, to);
    var s = summarize(win, day, from, to);

    set('.pl-when', fill(pc.when, longFmt.format(utcDate(day.date)), pad(from), pad(to)));
    var vague = $('.pl-vague'); if (vague) vague.hidden = dayIdx < 3;
    sec.classList.toggle('is-vague', dayIdx >= 3);

    var res = $('.pl-result');
    var past = dayIdx === 0 && nowIso() && to <= (parseInt(nowIso().slice(11, 13), 10) || 0);
    if (!s || past) { res.hidden = true; set('.pl-empty', past ? pc.past : pc.nodata); $('.pl-empty').hidden = false; }
    else {
      res.hidden = false; $('.pl-empty').hidden = true;
      var lv = W.level(s.speed, s.gusts);
      res.dataset.level = lv;
      set('.pl-say', (pc.levels || wc.levels)[lv - 1]);
      // Wind
      set('.pl-wind', (s.speed !== null ? s.speed + ' km/h ' : '') + (s.dir !== null ? fill(wc.from, wc.dirs[W.dirIndex(s.dir)]) : ''));
      set('.pl-gust', s.gusts ? fill(wc.gusts, s.gusts) : '');
      // Regen
      set('.pl-rain', s.wet ? fill(pc.rainYes, s.rainProb || 0, String(s.rain).replace('.', lang === 'de' ? ',' : '.')) : fill(pc.rainNo, s.rainProb || 0));
      // Temperatur
      set('.pl-temp', s.tempMin === null ? '' : (s.tempMin === s.tempMax ? s.tempMin + ' °C' : fill(pc.tempRange, s.tempMin, s.tempMax)));
      set('.pl-feels', s.feelsMin !== null ? fill(pc.feelsMin, s.feelsMin) : '');
      // Anziehen
      var wi = W.wearIndex(s.feelsMin);
      set('.pl-wear', wi !== null ? wc.wear[wi] : '');
      var extras = [];
      if (s.wet) extras.push(wc.wearRain);
      if (s.wet && s.feelsMin !== null && s.feelsMin <= 8) extras.push(wc.wearShoes);
      if (lv >= 3 && wi !== null && wi >= 2) extras.push(wc.wearWind);
      var ul = $('.pl-extras'); ul.textContent = '';
      extras.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
      // Licht
      var light = '';
      if (s.sunsetInside) light = fill(pc.lightSunset, hm(day.sunset));
      else if (s.dark >= s.hours) light = pc.lightDark;
      else if (s.sunriseInside) light = fill(pc.lightSunrise, hm(day.sunrise));
      else light = fill(pc.lightOk, hm(day.sunset));
      set('.pl-light', light);
      // Tour-Tipp
      var tipEl = $('.pl-tip'), tipBox = $('.pl-tip-b');
      var ranked = s.dir !== null ? W.rankTours(wc.tours || [], s.dir) : [];
      if (ranked.length && W.tipCard) {
        tipBox.hidden = false;
        if (lv <= 1) W.tipCard(tipEl, null, wc.tipNone, wc);
        else W.tipCard(tipEl, ranked[0].t, ranked[0].fit >= 0.5 ? wc.tipWhyGood : wc.tipWhyMeh, wc);
      } else tipBox.hidden = true;
    }

    // Bestes Fenster gleicher Länge
    var best = bestWindow(dh, day, to - from, nowIso());
    var bestBox = $('.pl-best'), go = $('.pl-best-go');
    if (!best) { bestBox.hidden = true; return; }
    bestBox.hidden = false;
    if (best.from === from) {
      set('.pl-best-t', pc.bestIsThis);
      go.hidden = true; go.onclick = null;
    } else {
      set('.pl-best-t', fill(pc.best, pad(best.from), pad(best.to), best.summary.speed || 0, best.summary.rainProb || 0));
      go.hidden = false;
      go.onclick = function () { fromSel.value = String(best.from); toSel.value = String(best.to); update(); };
    }
  }

  fromSel.addEventListener('change', update);
  toSel.addEventListener('change', update);

  fetch('/api/forecast', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !Array.isArray(d.hours) || !Array.isArray(d.days) || !d.days.length) return;
      data = d;
      // Heute ist vorausgewählt. Ist das Standardfenster (9–13 Uhr) schon vorbei, startet es ab der nächsten Stunde.
      var n = nowIso(), h = n ? parseInt(n.slice(11, 13), 10) : 0;
      if (h >= 9 && h < 21) { fromSel.value = String(h + 1); toSel.value = String(Math.min(h + 4, 22)); }
      else if (h >= 21) { dayIdx = 1; }
      // Von der Startseite: ?tag=N wählt den Tag direkt aus (Standardfenster 9–13 Uhr, außer heute)
      var tg = parseInt(new URLSearchParams(location.search).get('tag'), 10);
      if (isFinite(tg) && tg >= 0 && tg < d.days.length) {
        dayIdx = tg;
        if (tg > 0) { fromSel.value = '9'; toSel.value = '13'; }
      }
      buildDays(); update();
      sec.hidden = false;
      if (location.hash === '#planer') sec.scrollIntoView();
    })
    .catch(function () { /* ohne Vorhersage kein Planer */ });
})(typeof window !== 'undefined' ? window : this);
