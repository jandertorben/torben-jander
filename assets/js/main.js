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

  /* Ausrüstungs-Slider: Scroll-Snap plus Pfeile, Punkte, Tastatur und sanftes Autoplay */
  var slider = document.querySelector('.equip-slider');
  if (slider) {
    var track = slider.querySelector('.equip-track');
    var slides = Array.prototype.slice.call(track.querySelectorAll('.equip-slide'));
    var dots = Array.prototype.slice.call(slider.querySelectorAll('.equip-dot'));
    var counter = slider.querySelector('.equip-current');
    var current = 0, timer = null, userTouched = false;

    function setActive(i) {
      current = i;
      slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      dots.forEach(function (d, k) {
        d.classList.toggle('is-active', k === i);
        d.setAttribute('aria-selected', k === i ? 'true' : 'false');
      });
      if (counter) counter.textContent = String(i + 1);
      slides[i].querySelectorAll('[data-count]').forEach(function (n) {
        if (n.dataset.done) return;
        n.dataset.done = '1';
        countUp(n);
      });
    }
    function go(i, manual) {
      var n = slides.length;
      i = ((i % n) + n) % n;
      if (manual) { userTouched = true; stop(); }
      track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
      setActive(i);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() {
      if (reduce || userTouched || timer) return;
      timer = setInterval(function () { go(current + 1, false); }, 7000);
    }

    slider.querySelectorAll('.equip-arrow').forEach(function (b) {
      b.addEventListener('click', function () { go(current + parseInt(b.getAttribute('data-dir'), 10), true); });
    });
    dots.forEach(function (d) {
      d.addEventListener('click', function () { go(parseInt(d.getAttribute('data-go'), 10), true); });
    });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1, true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1, true); }
    });
    /* Wischen oder Scrollen im Track: aktive Folie aus der Scrollposition ableiten */
    var scrollTimer;
    track.addEventListener('scroll', function () {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        var i = Math.round(track.scrollLeft / track.clientWidth);
        if (i !== current && slides[i]) setActive(i);
      }, 80);
    }, { passive: true });
    ['pointerdown', 'touchstart', 'focusin'].forEach(function (ev) {
      track.addEventListener(ev, function () { userTouched = true; stop(); }, { passive: true });
    });
    slider.addEventListener('mouseenter', stop);
    slider.addEventListener('mouseleave', start);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) start(); else stop(); });
      }, { threshold: 0.4 }).observe(slider);
    }
    /* Beim Laden bereits gescrollt (z. B. Reload): Position übernehmen */
    if (track.scrollLeft > 0) setActive(Math.round(track.scrollLeft / track.clientWidth));
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
