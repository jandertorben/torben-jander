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

  /* ── E-Mail Spam-Schutz ─────────────────────────────── */
  /* mailto: wird erst beim Klick aus data-u + data-d zusammengesetzt */
  document.querySelectorAll('a.mail-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      window.location.href = 'mailto:' + link.dataset.u + '@' + link.dataset.d;
    });
  });

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

  /* ── Grid-Glow: Maus + Touch Tracking ───────────────── */
  /* CSS-Variablen --maus-x / --maus-y steuern den Spotlight-Effekt */
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const root = document.documentElement;
    let rafId  = null;

    function positionSetzen(x, y) {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        root.style.setProperty('--maus-x', x + 'px');
        root.style.setProperty('--maus-y', y + 'px');
        rafId = null;
      });
    }

    document.addEventListener('mousemove', e =>
      positionSetzen(e.clientX, e.clientY), { passive: true }
    );

    /* Touch-Support: Glow folgt dem Finger auf Mobilgeräten */
    document.addEventListener('touchstart', e => {
      const t = e.touches[0];
      positionSetzen(t.clientX, t.clientY);
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      const t = e.touches[0];
      positionSetzen(t.clientX, t.clientY);
    }, { passive: true });

    document.addEventListener('touchend', () => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      root.style.setProperty('--maus-x', '-9999px');
      root.style.setProperty('--maus-y', '-9999px');
    }, { passive: true });
  }

  /* ── Daten-Puls: seltene Lichtimpulse entlang Gitterlinien ── */
  /* Simuliert Datenfluss; auf Mobil seltener für Performance     */
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const GRID  = 60;         /* muss CSS background-size entsprechen */
    const SPEED = 2.8;        /* px pro Frame bei ~60 fps             */
    const TRAIL = GRID * 2.8; /* Schleppfahnen-Länge in px            */

    const isMobile = window.matchMedia('(hover: none)').matches;

    /* Canvas erzeugen und im DOM einsetzen */
    const canvas = document.createElement('canvas');
    canvas.id = 'daten-puls';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '2',
    });
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let w, h;

    function groesseAnpassen() {
      w = canvas.width  = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    groesseAnpassen();
    window.addEventListener('resize', groesseAnpassen, { passive: true });

    /* Zufällige Wartezeit zwischen zwei Pulsen */
    function naechsteWartezeit() {
      return isMobile
        ? 10000 + Math.random() * 15000  /* ~10–25 s auf Mobil  */
        :  4000 + Math.random() * 7000;  /* ~4–11 s auf Desktop */
    }

    const pulsListe = [];
    let letzterPuls = performance.now();
    let wartezeit   = naechsteWartezeit();

    /* Neuen Puls entlang einer zufälligen Gitterlinie starten */
    function neuerPuls() {
      const horiz = Math.random() < 0.5;
      if (horiz) {
        const yOff   = (GRID - (window.scrollY % GRID)) % GRID;
        const anzahl = Math.floor((h - yOff) / GRID) + 1;
        const y      = yOff + Math.floor(Math.random() * anzahl) * GRID;
        const rechts = Math.random() < 0.5;
        pulsListe.push({
          horiz: true, y,
          x: rechts ? -TRAIL : w + TRAIL,
          dir: rechts ? 1 : -1, alpha: 0,
        });
      } else {
        const xAnzahl = Math.floor(w / GRID) + 1;
        const x       = Math.floor(Math.random() * xAnzahl) * GRID;
        const runter  = Math.random() < 0.5;
        pulsListe.push({
          horiz: false, x,
          y: runter ? -TRAIL : h + TRAIL,
          dir: runter ? 1 : -1, alpha: 0,
        });
      }
    }

    /* Zeichnen pausieren wenn Tab verborgen */
    let sichtbar = !document.hidden;
    document.addEventListener('visibilitychange', () => {
      sichtbar = !document.hidden;
    });

    function zeichnen(now) {
      requestAnimationFrame(zeichnen);
      if (!sichtbar) return;

      /* Neuen Puls planen */
      if (now - letzterPuls > wartezeit) {
        neuerPuls();
        letzterPuls = now;
        wartezeit   = naechsteWartezeit();
      }

      if (!pulsListe.length) return; /* nichts zu zeichnen */
      ctx.clearRect(0, 0, w, h);

      for (let i = pulsListe.length - 1; i >= 0; i--) {
        const p = pulsListe[i];
        p.alpha = Math.min(p.alpha + 0.05, 1); /* Einblenden */

        ctx.save();
        ctx.lineWidth   = 1;
        ctx.shadowColor = 'rgba(232,160,32,0.55)';
        ctx.shadowBlur  = 5;

        let grad;
        if (p.horiz) {
          p.x += p.dir * SPEED;
          const kopf = p.x;
          const ende = kopf - p.dir * TRAIL;
          grad = ctx.createLinearGradient(ende, 0, kopf, 0);
          grad.addColorStop(0,   'rgba(232,160,32,0)');
          grad.addColorStop(0.6, `rgba(232,160,32,${p.alpha * 0.22})`);
          grad.addColorStop(1,   `rgba(255,210,60,${p.alpha * 0.6})`);
          ctx.strokeStyle = grad;
          ctx.beginPath();
          ctx.moveTo(ende, p.y);
          ctx.lineTo(kopf, p.y);
          ctx.stroke();
        } else {
          p.y += p.dir * SPEED;
          const kopf = p.y;
          const ende = kopf - p.dir * TRAIL;
          grad = ctx.createLinearGradient(0, ende, 0, kopf);
          grad.addColorStop(0,   'rgba(232,160,32,0)');
          grad.addColorStop(0.6, `rgba(232,160,32,${p.alpha * 0.22})`);
          grad.addColorStop(1,   `rgba(255,210,60,${p.alpha * 0.6})`);
          ctx.strokeStyle = grad;
          ctx.beginPath();
          ctx.moveTo(p.x, ende);
          ctx.lineTo(p.x, kopf);
          ctx.stroke();
        }

        ctx.restore();

        /* Puls entfernen sobald vollständig außerhalb des Viewports */
        const draussen = p.horiz
          ? (p.dir > 0 ? p.x - TRAIL > w : p.x + TRAIL < 0)
          : (p.dir > 0 ? p.y - TRAIL > h : p.y + TRAIL < 0);
        if (draussen) pulsListe.splice(i, 1);
      }
    }

    requestAnimationFrame(zeichnen);
  }

})();
