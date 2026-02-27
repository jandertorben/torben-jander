/* ═══════════════════════════════════════════════════════════
   TORBEN JANDER – PORTFOLIO
   main.js – Navigation, Animationen, Cookie-Banner
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Hamburger / Mobil-Menü ─────────────────────────── */
  const hamburger   = document.getElementById('hamburger');
  const mobilMenue  = document.getElementById('mobil-menue');
  let menueOffen    = false;

  function menueOeffnen() {
    menueOffen = true;
    hamburger.classList.add('offen');
    hamburger.setAttribute('aria-expanded', 'true');
    hamburger.setAttribute('aria-label', 'Menü schließen');
    mobilMenue.classList.add('offen');
    mobilMenue.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function menueSchliessen() {
    menueOffen = false;
    hamburger.classList.remove('offen');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Menü öffnen');
    mobilMenue.classList.remove('offen');
    mobilMenue.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (hamburger && mobilMenue) {
    hamburger.addEventListener('click', () =>
      menueOffen ? menueSchliessen() : menueOeffnen()
    );

    /* Links im Mobil-Menü schließen das Menü */
    mobilMenue.querySelectorAll('a').forEach(link =>
      link.addEventListener('click', menueSchliessen)
    );

    /* Bei Desktop-Breite automatisch schließen */
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) menueSchliessen();
    }, { passive: true });

    /* Escape-Taste */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menueOffen) menueSchliessen();
    });
  }

  /* ── Aktiven Nav-Link beim Scrollen hervorheben ──────── */
  const abschnitte = document.querySelectorAll('section[id], div[id]');
  const navLinks   = document.querySelectorAll('.nav-links a[href^="#"]');

  if (abschnitte.length && navLinks.length) {
    const beobachter = new IntersectionObserver(eintraege => {
      eintraege.forEach(eintrag => {
        if (eintrag.isIntersecting) {
          navLinks.forEach(link => {
            link.classList.toggle(
              'aktiv',
              link.getAttribute('href') === '#' + eintrag.target.id
            );
          });
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px' });

    abschnitte.forEach(a => beobachter.observe(a));
  }

  /* ── Nav-Hintergrund beim Scrollen anpassen ──────────── */
  const kopf = document.getElementById('kopf');
  if (kopf) {
    const nav = kopf.querySelector('.nav-leiste');
    const navAktualisieren = () => {
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 30);
    };
    window.addEventListener('scroll', navAktualisieren, { passive: true });
    navAktualisieren();
  }

  /* ── Scroll-Reveal: Karten einblenden ───────────────── */
  const zielElemente = document.querySelectorAll(
    '.bruecke-karte, .projekt-karte, .referenz-siegel-bereich, ' +
    '.referenz-zitat-bereich, .tech-gruppe'
  );

  /* Fallback: nur wenn Browser keine Scroll-driven Animations kennt */
  if (!CSS.supports('animation-timeline', 'view()') &&
      'IntersectionObserver' in window && zielElemente.length) {
    const einblendBeobachter = new IntersectionObserver(eintraege => {
      eintraege.forEach(eintrag => {
        if (eintrag.isIntersecting) {
          /* Gestaffelte Verzögerung je nach Position im Eltern-Element */
          const geschwister = Array.from(
            eintrag.target.parentElement.children
          );
          const index = geschwister.indexOf(eintrag.target);
          eintrag.target.style.transitionDelay = (index * 75) + 'ms';
          eintrag.target.classList.add('sichtbar');
          einblendBeobachter.unobserve(eintrag.target);
        }
      });
    }, { threshold: 0.08 });

    zielElemente.forEach(el => {
      el.style.opacity  = '0';
      el.style.transform = 'translateY(18px)';
      el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      einblendBeobachter.observe(el);
    });
  }

  /* ── Cookie-Banner ───────────────────────────────────── */
  const banner   = document.getElementById('cookie-banner');
  const okButton = document.getElementById('cookie-ok');
  const COOKIE_KEY = 'tj_cookie_ok';

  if (banner && okButton) {
    /* Banner nur zeigen wenn noch nicht akzeptiert */
    if (!localStorage.getItem(COOKIE_KEY)) {
      banner.classList.remove('versteckt');
    } else {
      banner.style.display = 'none';
    }

    okButton.addEventListener('click', () => {
      localStorage.setItem(COOKIE_KEY, '1');
      banner.classList.add('versteckt');
      setTimeout(() => { banner.style.display = 'none'; }, 350);
    });
  }

})();
