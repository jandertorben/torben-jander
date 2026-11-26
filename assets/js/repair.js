/* Reparaturstationen: Suche nach Ort oder PLZ, zeigt die nächsten fünf Stationen.
   Läuft komplett im Browser, es wird nichts übertragen. Ohne JavaScript bleibt die volle Liste sichtbar. */
(function () {
  'use strict';
  var sec = document.getElementById('reparatur');
  if (!sec) return;
  var form = sec.querySelector('.repair-search'), input = sec.querySelector('#repair-q');
  var out = sec.querySelector('.repair-results'), list = sec.querySelector('.repair-list');
  var toggle = sec.querySelector('.repair-toggle');
  if (!form || !input || !out || !list) return;
  var data = { orte: {}, plz: {} };
  try { data = JSON.parse(document.getElementById('repair-data').textContent) || data; } catch (e) {}
  var orte = data.orte || {}, plz = data.plz || {};
  var items = Array.prototype.slice.call(list.querySelectorAll('.repair-item'));

  form.hidden = false;
  if (toggle) {
    toggle.hidden = false; list.hidden = true;
    toggle.addEventListener('click', function () {
      var open = list.hidden;
      list.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? toggle.dataset.close : toggle.dataset.open;
    });
  }

  function norm(s) {
    return String(s || '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }
  function km(a, b, c, d) {
    var r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r;
    return Math.sqrt(x * x + y * y) * 6371;
  }
  var names = Object.keys(orte).map(function (k) { return { n: norm(k), name: k, ll: orte[k] }; });
  // Stationen selbst kennen ihren Ortsteil – auch das ist ein Suchziel
  items.forEach(function (li) {
    var t = (li.querySelector('.repair-place') || {}).textContent || '';
    if (t && !orte[t]) names.push({ n: norm(t), name: t, ll: [parseFloat(li.dataset.lat), parseFloat(li.dataset.lon)] });
  });

  function find(v) {
    v = v.trim();
    if (/^\d{5}$/.test(v)) return plz[v] ? { ll: plz[v], label: v } : { err: 'plz' };
    if (/^\d+$/.test(v)) return null;           // PLZ noch nicht fertig getippt
    var n = norm(v);
    if (n.length < 2) return null;
    var hit = null;
    names.some(function (o) { if (o.n === n) { hit = o; return true; } });
    if (!hit) names.some(function (o) { if (o.n.indexOf(n) === 0) { hit = o; return true; } });
    if (!hit) names.some(function (o) { if (o.n.indexOf(n) > -1) { hit = o; return true; } });
    return hit ? { ll: hit.ll, label: hit.name } : { err: 'none' };
  }
  function fmt(d) { return (d < 10 ? d.toFixed(1) : Math.round(d)).toString().replace('.', document.documentElement.lang === 'en' ? '.' : ',') + ' km'; }

  function render() {
    var f = find(input.value);
    out.textContent = '';
    if (!f) return;
    if (f.err) {
      var p = document.createElement('p'); p.className = 'repair-msg';
      p.textContent = f.err === 'plz' ? form.dataset.plzUnknown : form.dataset.none;
      out.appendChild(p); return;
    }
    var best = items.map(function (li) {
      return { li: li, d: km(f.ll[0], f.ll[1], parseFloat(li.dataset.lat), parseFloat(li.dataset.lon)) };
    }).sort(function (a, b) { return a.d - b.d; }).slice(0, 5);
    var h = document.createElement('p'); h.className = 'repair-msg';
    h.textContent = form.dataset.near.replace('%s', f.label);
    var ul = document.createElement('ul'); ul.className = 'repair-hits';
    best.forEach(function (b) {
      var li = b.li.cloneNode(true);
      var dist = document.createElement('span'); dist.className = 'repair-km'; dist.textContent = fmt(b.d);
      var place = li.querySelector('.repair-place'); if (place) place.appendChild(dist);
      ul.appendChild(li);
    });
    out.appendChild(h); out.appendChild(ul);
  }
  var t = 0;
  input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(render, 120); });
  input.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); render(); input.blur(); });
})();
