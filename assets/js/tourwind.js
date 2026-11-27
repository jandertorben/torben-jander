/* Wind-Tipp auf jeder Tour-Seite.
   1. Fest: In welche Richtung führt die Runde raus, und bei welchem Wind passt sie am besten?
      Gerechnet aus der Route (gleiche Logik wie der Tour-Tipp im Fahrradwetter: Start → entferntester Punkt).
   2. Live: Der Wind gerade in Bremen (/api/wind) im Vergleich zur Runde.
   Braucht wind.js (window.TJWind). Ohne JavaScript bleibt der allgemeine Hinweis stehen. */
(function (global) {
  'use strict';

  var W = (typeof module !== 'undefined' && module.exports) ? require('./wind.js') : global.TJWind;

  // Ist das eine Runde (Ende nahe am Start) oder eine Strecke von A nach B?
  function isLoop(pts) {
    if (pts.length < 2) return true;
    var s = pts[0], e = pts[pts.length - 1], far = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - s[0], dy = pts[i][1] - s[1];
      far = Math.max(far, dx * dx + dy * dy);
    }
    if (!far) return true;
    var gx = e[0] - s[0], gy = e[1] - s[1];
    return Math.sqrt(gx * gx + gy * gy) / Math.sqrt(far) < 0.8;   // gekürzte Enden lassen auch Runden offen aussehen
  }

  // Tipp für eine Route: Richtung raus (Kompass) und welcher Wind am besten passt.
  // Runde: Wind von vorn auf dem Hinweg ist gut (heimwärts Rückenwind).
  // Strecke: Wind von hinten ist gut (schiebt die ganze Zeit).
  function tourTip(d) {
    var pts = W.parsePath(d), out = W.outBearing(pts);
    if (out === null) return null;
    var loop = isLoop(pts);
    return { out: out, loop: loop, best: loop ? out : (out + 180) % 360 };
  }

  // Heute: 'calm' | 'good' | 'side' | 'bad'
  function verdict(tip, speed, gusts, windFrom) {
    if (!tip) return null;
    if (W.level(speed, gusts) <= 1) return 'calm';
    var fit = W.windFit(tip.best, windFrom);
    if (fit >= 0.5) return 'good';
    if (fit <= -0.5) return 'bad';
    return 'side';
  }

  var api = { isLoop: isLoop, tourTip: tourTip, verdict: verdict };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  var box = document.querySelector('[data-tw]');
  var cfgEl = document.getElementById('tw-cfg');
  if (!box || !cfgEl || !W) return;
  var c;
  try { c = JSON.parse(cfgEl.textContent); } catch (e) { return; }
  var tip = tourTip(c.d);
  if (!tip) return;

  function fill(str) {
    var args = Array.prototype.slice.call(arguments, 1), i = 0;
    return String(str).replace(/%s/g, function (m) { return i < args.length ? args[i++] : m; });
  }
  var idx = W.dirIndex;

  var st = box.querySelector('[data-tw-static]');
  if (st) st.textContent = tip.loop
    ? fill(c.loop, c.to[idx(tip.out)], c.wind[idx(tip.best)])
    : fill(c.line, c.to[idx(tip.out)], c.wind[idx(tip.best)]);

  var now = box.querySelector('[data-tw-now]');
  if (!now || !global.fetch) return;
  // Holt den Wind beim Öffnen, bleibt die Seite offen alle 10 Minuten neu,
  // und sofort, wenn man nach mehr als 10 Minuten in den Tab zurückkommt.
  var last = 0, EVERY = 10 * 60 * 1000;
  function load() {
  last = Date.now();
  fetch('/api/wind', { headers: { Accept: 'application/json' }, cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (w) {
      if (!w || typeof w.speed !== 'number' || typeof w.dir !== 'number') return;
      var v = verdict(tip, w.speed, w.gusts, w.dir);
      if (!v) return;
      var key = v === 'calm' ? 'calm' : (tip.loop ? 'loop_' : 'line_') + v;
      var txt = v === 'calm' ? fill(c.now[key], w.speed) : fill(c.now[key], c.wind[idx(w.dir)], w.speed);
      now.querySelector('[data-tw-txt]').textContent = txt;
      var t = /T(\d{2}:\d{2})/.exec(w.time || '');
      var s = now.querySelector('[data-tw-stand]');
      if (s && t) s.textContent = fill(c.stand, t[1]);
      now.className = 'ts-wind-now is-' + v;
      now.hidden = false;
    })
    .catch(function () {});
  }
  load();
  setInterval(function () { if (!document.hidden) load(); }, EVERY);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - last > EVERY) load();
  });
})(typeof window !== 'undefined' ? window : this);
