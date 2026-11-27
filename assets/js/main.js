(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lang = root.lang || 'de';
  var fmt = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });

  /* Marken-Laufband: Nach einem Klick auf eine Marke bleibt das Band stehen (bis zum Neuladen) */
  var marken = document.querySelector('.marken');
  if (marken) {
    var stopBand = function (e) {
      if (e.target.closest && e.target.closest('a')) marken.classList.add('is-stopped');
    };
    marken.addEventListener('click', stopBand);
    marken.addEventListener('auxclick', stopBand);
  }

  /* Porträt-Video: bei „Bewegung reduzieren“ nur Standbild, sonst nur abspielen, wenn sichtbar */
  var pv = document.querySelector('.portrait-video video');
  if (pv) {
    /* Video lädt erst, wenn es ins Bild kommt (kein autoplay, preload="none") */
    if (reduce) {
      pv.pause();
    } else if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { var p = pv.play(); if (p && p.catch) p.catch(function () {}); }
          else pv.pause();
        });
      }, { threshold: 0.1 }).observe(pv);
    }
  }

  /* Jahreskarte: Leuchten einschalten, wenn die letzte Route fertig gezeichnet ist */
  var heroMap = document.querySelector('.hero-map');
  if (heroMap) {
    var routes = heroMap.querySelectorAll('.r');
    var lastR = routes[routes.length - 1];
    var glow = function () { heroMap.classList.add('glow'); };
    if (reduce || !lastR) glow();
    else { lastR.addEventListener('animationend', glow, { once: true }); setTimeout(glow, 9000); }
  }

  /* Navigation: Hintergrund nach dem ersten Scrollen */
  var nav = document.querySelector('.nav');

  /* Tourenseite: Reiter Route / Foto */
  var tabs = document.querySelector('.tour-tabs');
  if (tabs) {
    var btns = tabs.querySelectorAll('[role="tab"]');
    function show(i) {
      btns.forEach(function (b, j) {
        var on = i === j;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        var p = document.getElementById(b.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
    }
    btns.forEach(function (b, i) {
      b.addEventListener('click', function () { show(i); });
      b.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          var n = (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
          show(n); btns[n].focus(); e.preventDefault();
        }
      });
    });
    tabs.hidden = false;
    show(0);
  }

  /* Burgermenü */
  var burger = document.querySelector('.burger');
  var menu = document.getElementById('menu');
  function setMenu(open, focusBack) {
    if (!nav || !burger) return;
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', burger.getAttribute(open ? 'data-close' : 'data-open'));
    if (open && menu) { var first = menu.querySelector('a'); if (first) first.focus({ preventScroll: true }); }
    if (!open && focusBack) burger.focus();
  }
  if (burger && menu) {
    burger.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) setMenu(false, true);
    });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('open') && !nav.contains(e.target)) setMenu(false);
    });
  }
  function onScroll() {
    if (nav) nav.classList.toggle('on', window.scrollY > 24);
    if (!reduce && map) {
      var y = Math.min(window.scrollY, window.innerHeight);
      map.style.setProperty('--py', (y * 0.18) + 'px');
    }
  }
  var map = document.querySelector('.hero-map svg');

  /* Nach-oben-Button: erscheint, sobald der Hero aus dem Bild ist */
  var totop = document.querySelector('.totop');
  if (totop) {
    totop.hidden = false;
    totop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      var brand = document.querySelector('.brand');
      if (brand) brand.focus({ preventScroll: true });
    });
  }
  var showAfter = window.innerHeight * 0.9;
  window.addEventListener('scroll', function () {
    onScroll();
    if (totop) totop.classList.toggle('show', window.scrollY > showAfter);
  }, { passive: true });
  window.addEventListener('resize', function () { showAfter = window.innerHeight * 0.9; }, { passive: true });
  onScroll();
  if (totop) totop.classList.toggle('show', window.scrollY > showAfter);

  /* Zähler: von 0 auf den Zielwert, lokal formatiert */
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    if (isNaN(target)) return;
    if (reduce) { el.textContent = fmt.format(target); return; }
    var dur = 1400, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt.format(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* Sichtbarkeit: Reveal-Klassen, Zähler und Diagramme */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        e.target.querySelectorAll('[data-count]').forEach(function (n) {
          if (n.dataset.done) return;
          n.dataset.done = '1';
          countUp(n);
        });
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    document.querySelectorAll('.reveal, .chart').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.reveal, .chart').forEach(function (el) { el.classList.add('in'); });
  }

  /* Sicherheitsnetz: Falls der Observer nicht auslöst (z. B. Sprung per Anker), nach 2 s alles zeigen */
  setTimeout(function () {
    document.querySelectorAll('.reveal:not(.in), .chart:not(.in)').forEach(function (el) {
      el.classList.add('in');
      el.querySelectorAll('[data-count]').forEach(function (n) {
        if (n.dataset.done) return;
        n.dataset.done = '1';
        n.textContent = fmt.format(parseFloat(n.getAttribute('data-count')));
      });
    });
  }, 2000);
})();

/* Navigation: Strich wandert mit. Auf der Startseite markieren Sprunglinks (z. B. „Über mich“)
   ihren Abschnitt, sobald man dort ist – sonst bleibt „Start“ markiert. */
(function () {
  'use strict';
  var path = location.pathname;
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav-main a, .nav-links a'));
  var home = links.filter(function (a) { return a.getAttribute('aria-current') === 'page' && !a.hash; });
  var spots = [];
  links.forEach(function (a) {
    if (!a.hash || a.pathname !== path) return;
    var el = document.getElementById(a.hash.slice(1));
    if (el) spots.push({ a: a, el: el });
  });
  if (!spots.length || !home.length) return;
  var current = null, ticking = false;
  function mark(spot) {
    if (spot === current) return;
    current = spot;
    home.forEach(function (h) { if (spot) h.removeAttribute('aria-current'); else h.setAttribute('aria-current', 'page'); });
    spots.forEach(function (s) {
      if (spot && s.el === spot.el) s.a.setAttribute('aria-current', 'location'); else s.a.removeAttribute('aria-current');
    });
  }
  function check() {
    ticking = false;
    var line = window.innerHeight * 0.35, hit = null;
    spots.forEach(function (s) {
      var r = s.el.getBoundingClientRect();
      if (r.top <= line && r.bottom > line) hit = s;
    });
    // ganz unten angekommen: letzter Abschnitt zählt, auch wenn er kurz ist
    if (!hit && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      spots.forEach(function (s) { if (!hit || s.el.getBoundingClientRect().top > hit.el.getBoundingClientRect().top) hit = s; });
    }
    mark(hit);
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(check); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('hashchange', onScroll);
  check();
})();

/* Sprungmarken (#community, #ueber …) festhalten: Wenn oberhalb noch etwas nachlädt
   (Live-Wetter, Bilder), verschiebt sich das Ziel. Dann kurz nachjustieren,
   solange man nicht selbst scrollt. */
(function () {
  if (!('ResizeObserver' in window)) return;
  var stop = null;
  function stick(id) {
    var el = id && document.getElementById(id);
    if (!el) return;
    if (stop) stop();
    var done = false, last = null;
    var fix = function () {
      if (done) return;
      var top = el.getBoundingClientRect().top;
      var want = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      if (last !== null && Math.abs(top - want) > 4) el.scrollIntoView({ block: 'start', behavior: 'instant' });
      last = top;
    };
    var ro = new ResizeObserver(fix);
    ro.observe(document.body);
    var quit = function () { done = true; ro.disconnect(); ['wheel', 'touchmove', 'keydown'].forEach(function (t) { window.removeEventListener(t, quit); }); };
    ['wheel', 'touchmove', 'keydown'].forEach(function (t) { window.addEventListener(t, quit, { passive: true }); });
    setTimeout(quit, 4000);
    setTimeout(function () { last = 0; fix(); }, 60);
    stop = quit;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="#"]');
    if (!a || a.pathname !== location.pathname || a.host !== location.host) return;
    var id = decodeURIComponent(a.hash.slice(1));
    setTimeout(function () { stick(id); }, 50);
  });
  if (location.hash.length > 1) stick(decodeURIComponent(location.hash.slice(1)));
})();

/* Ausrüstung: die Räder fahren beim Weiterscrollen nach rechts aus dem Bild, die Reifen drehen sich mit
   (an das Scrollen gekoppelt, rückwärts scrollen holt sie zurück; nichts bei „Bewegung reduzieren“). */
(function () {
  var els = [].slice.call(document.querySelectorAll('[data-ride]'));
  if (!els.length) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var items = els.map(function (el) {
    var ov = el.querySelector('.ride-ov');
    return { el: el, ov: ov, pic: el.querySelector('img:not(.ride-ring):not(.ride-front)'), rings: ov ? [].slice.call(ov.querySelectorAll('.ride-ring')) : [] };
  });
  function place(it) {
    var pic = it.pic, ov = it.ov;
    if (!ov || !pic || !pic.complete || !pic.naturalWidth) return;
    // Überlagerung exakt auf das angezeigte Foto legen (nicht auf den Kasten)
    ov.style.left = pic.offsetLeft + 'px'; ov.style.top = pic.offsetTop + 'px';
    ov.style.width = pic.offsetWidth + 'px'; ov.style.height = pic.offsetHeight + 'px';
    ov.classList.add('on');
  }
  var ticking = false;
  function frame() {
    ticking = false;
    var vh = innerHeight, vw = document.documentElement.clientWidth;
    items.forEach(function (it) {
      var el = it.el;
      el.style.transform = 'none';
      var r = el.getBoundingClientRect();
      var p = ((vh * 0.45) - (r.top + r.height / 2)) / (vh * 0.45);
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      p = p * p * (3 - 2 * p);
      var dx = p * (vw - r.left + 20);
      el.style.transform = p ? 'translate3d(' + dx.toFixed(1) + 'px,0,0)' : '';
      if (it.rings.length && it.ov.classList.contains('on')) {
        var ang = (dx / ((it.rings[0].offsetWidth / 2) || 1) * 57.2958).toFixed(1);
        it.rings.forEach(function (w) { w.style.transform = 'rotate(' + ang + 'deg)'; });
      }
    });
  }
  function req() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  items.forEach(function (it) {
    if (it.pic && !it.pic.complete) it.pic.addEventListener('load', function () { place(it); req(); });
    place(it);
  });
  addEventListener('scroll', req, { passive: true });
  addEventListener('resize', function () { items.forEach(place); req(); });
  frame();
})();

/* Werkstätten: zuerst nur 4 zeigen; Suche nach Ort/PLZ (sortiert nach Entfernung) oder Stichwort */
(function () {
  var form = document.querySelector('.shops-search'); if (!form) return;
  var input = form.querySelector('input'), status = form.querySelector('.shops-status');
  var list = document.querySelector('.shops-list'), more = document.querySelector('.shops-more');
  var items = [].slice.call(list.querySelectorAll('.shop')), LIMIT = 4, showAll = false;
  var data = { orte: {}, plz: {} };
  try { var el = document.getElementById('repair-data'); if (el) data = JSON.parse(el.textContent); } catch (e) {}
  var orte = data.orte || {}, plz = data.plz || {};
  form.hidden = form.hasAttribute('data-few');
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').trim(); }
  function km(a, b, c, d) { var r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * 6371; }
  var names = Object.keys(orte).map(function (k) { return { n: norm(k), name: k, ll: orte[k] }; });
  items.forEach(function (li) { names.push({ n: norm(li.dataset.teil), name: li.dataset.teil, ll: [+li.dataset.lat, +li.dataset.lon] }); });
  function place(v) {
    if (/^\d{5}$/.test(v)) return plz[v] ? { ll: plz[v], label: v } : null;
    var n = norm(v), hit = null; if (n.length < 2) return null;
    names.some(function (o) { if (o.n === n || o.n.indexOf(n) === 0) { hit = o; return true; } });
    return hit ? { ll: hit.ll, label: hit.name } : null;
  }
  function fmt(d) { return (d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)) + ' km'; }
  function show(arr, note) {
    items.forEach(function (li) { li.hidden = true; li.querySelector('.shop-km').textContent = ''; });
    var vis = showAll ? arr : arr.slice(0, LIMIT);
    vis.forEach(function (o) { o.li.hidden = false; list.appendChild(o.li); if (o.d != null) o.li.querySelector('.shop-km').textContent = ' · ' + fmt(o.d); });
    var rest = arr.length - vis.length;
    more.hidden = rest <= 0; more.textContent = 'Weitere ' + rest + ' anzeigen';
    status.textContent = note || '';
  }
  function render() {
    var v = input.value.trim();
    if (!v) { show(items.map(function (li) { return { li: li }; })); return; }
    var p = place(v);
    if (p) {
      show(items.map(function (li) { return { li: li, d: km(p.ll[0], p.ll[1], +li.dataset.lat, +li.dataset.lon) }; }).sort(function (a, b) { return a.d - b.d; }), 'Nächste Werkstätten bei ' + p.label);
      return;
    }
    var n = norm(v), hits = items.filter(function (li) { return norm(li.dataset.text).indexOf(n) > -1; }).map(function (li) { return { li: li }; });
    show(hits, hits.length ? hits.length + ' Treffer' : 'Nichts gefunden. Versuch es mit einem Ort oder einer PLZ.');
  }
  var t; input.addEventListener('input', function () { showAll = false; clearTimeout(t); t = setTimeout(render, 120); });
  form.addEventListener('submit', function (e) { e.preventDefault(); render(); input.blur(); });
  more.addEventListener('click', function () { showAll = true; render(); });
  render();
})();
