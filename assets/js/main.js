(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lang = root.lang || 'de';
  var fmt = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });

  /* Navigation: Hintergrund nach dem ersten Scrollen */
  var nav = document.querySelector('.nav');
  function onScroll() {
    if (nav) nav.classList.toggle('on', window.scrollY > 24);
    if (!reduce && map) {
      var y = Math.min(window.scrollY, window.innerHeight);
      map.style.setProperty('--py', (y * 0.18) + 'px');
    }
  }
  var map = document.querySelector('.hero-map svg');
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

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
})();
