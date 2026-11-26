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

  // Kurzfassung eines Tages für die Vorschau auf der Startseite: Tageslicht-Stunden (8–18 Uhr),
  // heute erst ab der aktuellen Stunde. Liefert Stufe und erste nasse Stunde (oder null).
  function daySummary(hours, date, fromHour) {
    var hs = (hours || []).filter(function (h) {
      if (String(h.t).slice(0, 10) !== date) return false;
      var x = parseInt(String(h.t).slice(11, 13), 10);
      return x >= Math.max(8, fromHour || 0) && x < 18;
    });
    if (!hs.length) return null;
    var sp = hs.map(function (h) { return h.speed || 0; });
    var gu = hs.map(function (h) { return h.gusts || 0; });
    var avg = Math.round(sp.reduce(function (a, b) { return a + b; }, 0) / sp.length);
    var wet = null;
    for (var i = 0; i < hs.length; i++) if (isWet(hs[i])) { wet = hs[i].t; break; }
    return { level: level(avg, Math.max.apply(null, gu)), speed: avg, wetFrom: wet };
  }

  var api = { daySummary: daySummary, level: level, dirIndex: dirIndex, parsePath: parsePath, outBearing: outBearing, windFit: windFit,
              rankTours: rankTours, calmest: calmest, isWet: isWet, rainState: rainState, wearIndex: wearIndex, lightState: lightState };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  global.TJWind = api;   // für planer.js

  /* ── Darstellung ──────────────────────────────────────────────────────────── */

  // Tour-Tipp als Karte: kleine Route, Name groß, Begründung, GPX und Link zur Tour
  function tipCard(el, tour, why, c) {
    el.textContent = '';
    if (!tour) {
      // Kein bestimmter Tipp (zu wenig Wind): Satz plus direkter Weg zu allen Touren
      var b0 = document.createElement('div'); b0.className = 'tip-body';
      var p0 = document.createElement('p'); p0.className = 'tip-why'; p0.textContent = why; b0.appendChild(p0);
      if (c.toursUrl) {
        var a0 = document.createElement('div'); a0.className = 'tip-actions';
        var l0 = document.createElement('a'); l0.className = 'btn'; l0.href = c.toursUrl; l0.textContent = c.toursAll + ' →';
        a0.appendChild(l0); b0.appendChild(a0);
      }
      el.appendChild(b0); el.classList.add('is-plain'); return;
    }
    el.classList.remove('is-plain');
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-40 -40 ' + ((tour.w || 1000) + 80) + ' ' + ((tour.h || 610) + 80));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'tip-route');
    var path = document.createElementNS(NS, 'path'); path.setAttribute('d', tour.d); svg.appendChild(path);
    var body = document.createElement('div'); body.className = 'tip-body';
    var h = document.createElement('h3'); h.className = 'tip-name';
    var a = document.createElement('a'); a.href = tour.url; a.textContent = tour.title;
    if (/^https?:/.test(tour.url)) { a.target = '_blank'; a.rel = 'noopener'; }
    h.appendChild(a);
    var meta = document.createElement('p'); meta.className = 'tip-meta'; meta.textContent = tour.km + ' km';
    var w = document.createElement('p'); w.className = 'tip-why'; w.textContent = why;
    var act = document.createElement('div'); act.className = 'tip-actions';
    if (tour.id) {
      var g = document.createElement('a'); g.className = 'btn'; g.href = '/gpx/' + tour.id + '.gpx';
      g.setAttribute('download', 'torben-jander-' + tour.id + '.gpx'); g.textContent = '↓ ' + c.tipGpx; act.appendChild(g);
    }
    var o = document.createElement('a'); o.className = 'btn btn-ghost'; o.href = tour.url; o.textContent = c.tipOpen;
    if (/^https?:/.test(tour.url)) { o.target = '_blank'; o.rel = 'noopener'; }
    act.appendChild(o);
    body.appendChild(h); body.appendChild(meta); body.appendChild(w); body.appendChild(act);
    el.appendChild(svg); el.appendChild(body);
  }
  global.TJWind.tipCard = tipCard;

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
        var card = $('.tip-card'), av = $('.wind-tip-avoid');
        av.textContent = '';
        if (lv <= 1) tipCard(card, null, cfg.tipNone, cfg);
        else {
          tipCard(card, ranked[0].t, ranked[0].fit >= 0.5 ? cfg.tipWhyGood : cfg.tipWhyMeh, cfg);
          var worst = ranked[ranked.length - 1];
          if (ranked.length > 1 && worst.fit <= -0.5 && worst.t.url !== ranked[0].t.url) linkInto(av, cfg.avoid, worst.t);
        }
        tip.hidden = false;
      }
    }

    set('.wind-stand', fill(cfg.stand, timeOf(w.time)));
    sec.hidden = false;
    startAnim(w);
  }

  /* ── 3-Tage-Vorschau (nur Startseite) ── */
  function renderDays(fc) {
    var ul = $('.wb-days');
    if (!ul || !fc || !Array.isArray(fc.days)) return;
    var lang = document.documentElement.lang || 'de';
    var fmt = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' });
    var nowH = 0, today = fc.days[0] && fc.days[0].date;
    try {
      var n = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).format(new Date());
      today = n.slice(0, 10); nowH = parseInt(n.slice(11, 13), 10) || 0;
    } catch (e) {}
    var tp = today.split('-'), tm = new Date(Date.UTC(+tp[0], +tp[1] - 1, +tp[2] + 1));
    var tomorrow = tm.toISOString().slice(0, 10);
    var start = 0;
    for (var k = 0; k < fc.days.length; k++) if (fc.days[k].date === today) { start = k; break; }
    // Nach 17 Uhr ist heute vorbei: Vorschau beginnt morgen
    if (nowH >= 17) start++;
    ul.textContent = '';
    var shown = 0;
    for (var i = start; i < fc.days.length && shown < 3; i++) {
      var d = fc.days[i];
      var sm = daySummary(fc.hours, d.date, d.date === today ? nowH : 0);
      if (!sm) continue;
      var p = d.date.split('-'), dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
      var name = d.date === today ? cfg.dayToday : d.date === tomorrow ? cfg.dayTomorrow : fmt.format(dt);
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = ul.getAttribute('data-href') + '?tag=' + i + '#planer';
      a.className = 'wb-day lv-' + sm.level;
      var nm = document.createElement('span'); nm.className = 'wb-day-n'; nm.textContent = name;
      var dots = document.createElement('span'); dots.className = 'wb-day-dots'; dots.setAttribute('aria-hidden', 'true');
      for (var j = 1; j <= 5; j++) { var dot = document.createElement('i'); if (j <= sm.level) dot.className = 'on'; dots.appendChild(dot); }
      var rn = document.createElement('span'); rn.className = 'wb-day-r' + (sm.wetFrom ? ' is-wet' : '');
      rn.textContent = sm.wetFrom ? fill(cfg.dayRain, sm.wetFrom.slice(11, 13)) : cfg.dayDry;
      var sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = ', ' + fill(cfg.dayLevel, sm.level);
      a.appendChild(nm); a.appendChild(dots); a.appendChild(sr); a.appendChild(rn);
      li.appendChild(a); ul.appendChild(li);
      shown++;
    }
    ul.hidden = shown === 0;
  }

  /* ── Wetteranimation: feine Windlinien in Windrichtung, bei Regen schräge Striche ── */
  var anim = { w: null, raf: 0, parts: [], visible: true };
  var reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function startAnim(w) {
    var cv = $('.wind-anim');
    if (!cv || reduceMotion || !cv.getContext) return;
    anim.w = w;
    var ctx = cv.getContext('2d');
    function size() {
      var r = sec.getBoundingClientRect(), dpr = Math.min(global.devicePixelRatio || 1, 2);
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return r;
    }
    var box = size();
    var speed = Math.max(2, w.speed || 0);
    var wet = isWet((w.hours || [])[0]) || (w.rain || 0) >= 0.1;
    // Richtung, in die der Wind weht (Bildschirm: x nach rechts = Ost, y nach unten = Süd)
    var to = ((w.dir || 0) + 180) * Math.PI / 180;
    var vx = Math.sin(to), vy = -Math.cos(to);
    var n = Math.round(Math.min(46, 8 + speed * 0.9));
    function spawn(p, anywhere) {
      p.x = Math.random() * box.width; p.y = Math.random() * box.height;
      if (!anywhere) { // am windzugewandten Rand neu starten
        if (Math.abs(vx) > Math.abs(vy)) p.x = vx > 0 ? -60 : box.width + 60; else p.y = vy > 0 ? -60 : box.height + 60;
      }
      p.len = 30 + Math.random() * (40 + speed * 2);
      p.v = (0.25 + Math.random() * 0.5) * (0.5 + speed / 12);
      p.a = 0.05 + Math.random() * 0.08;
      return p;
    }
    anim.parts = [];
    for (var i = 0; i < n; i++) anim.parts.push(spawn({}, true));
    var drops = [];
    if (wet) for (var k = 0; k < 60; k++) drops.push({ x: Math.random() * box.width, y: Math.random() * box.height, v: 3 + Math.random() * 3 });
    var light = getComputedStyle(sec).getPropertyValue('--wc') || '#efe8da';
    function frame() {
      anim.raf = 0;
      if (!anim.visible || document.hidden) return;
      ctx.clearRect(0, 0, box.width, box.height);
      ctx.lineCap = 'round';
      anim.parts.forEach(function (p) {
        p.x += vx * p.v; p.y += vy * p.v;
        if (p.x < -120 || p.x > box.width + 120 || p.y < -120 || p.y > box.height + 120) spawn(p, false);
        ctx.strokeStyle = 'rgba(239,232,218,' + p.a + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - vx * p.len, p.y - vy * p.len); ctx.stroke();
      });
      if (drops.length) {
        ctx.strokeStyle = 'rgba(142,211,195,0.14)';
        drops.forEach(function (d) {
          d.y += d.v; d.x += vx * d.v * 0.4;
          if (d.y > box.height) { d.y = -10; d.x = Math.random() * box.width; }
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - vx * 4, d.y - 10); ctx.stroke();
        });
      }
      anim.raf = global.requestAnimationFrame(frame);
    }
    function kick() { if (!anim.raf && anim.visible && !document.hidden) anim.raf = global.requestAnimationFrame(frame); }
    if (!anim.bound) {
      anim.bound = true;
      if ('IntersectionObserver' in global) new IntersectionObserver(function (es) { anim.visible = es[0].isIntersecting; kick(); }).observe(sec);
      document.addEventListener('visibilitychange', kick);
      global.addEventListener('resize', function () { box = size(); }, { passive: true });
    }
    if (anim.raf) global.cancelAnimationFrame(anim.raf), anim.raf = 0;
    kick();
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
  if ($('.wb-days')) {
    fetch('/api/forecast', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (fc) { if (fc) renderDays(fc); })
      .catch(function () {});
  }
  // Bleibt die Seite offen, alle 10 Minuten nachladen. Kommt man in den Tab zurück, sofort, wenn es älter ist.
  setInterval(function () { if (!document.hidden) load(); }, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - last > 10 * 60 * 1000) load();
  });
})(typeof window !== 'undefined' ? window : this);
