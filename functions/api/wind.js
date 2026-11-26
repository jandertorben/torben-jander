// Cloudflare Pages Function: GET /api/wind
//
// Holt den Wind für Bremen bei Open-Meteo und gibt eine schlanke Antwort zurück.
// Der Abruf läuft auf dem Server (Cloudflare), nicht im Browser der Besucher:
// Open-Meteo sieht also keine IP-Adressen von Besuchern, und die Seite bleibt ohne Drittanbieter.
// Die Antwort wird 20 Minuten im Cloudflare-Cache gehalten, damit nicht jeder Besuch eine Anfrage auslöst.

const LAT = 53.08;   // Bremen
const LON = 8.80;
const CACHE_SECONDS = 20 * 60;

const UPSTREAM =
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${LAT}&longitude=${LON}` +
  '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m' +
  '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
  '&forecast_hours=12&wind_speed_unit=kmh&timezone=Europe%2FBerlin';

function json(body, status, maxAge) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}`,
    },
  });
}

function round(n) {
  return typeof n === 'number' && isFinite(n) ? Math.round(n) : null;
}

export async function onRequestGet(context) {
  const cache = caches.default;
  const key = new Request(new URL('/api/wind', context.request.url).toString());

  const hit = await cache.match(key);
  if (hit) return hit;

  let data;
  try {
    const r = await fetch(UPSTREAM, { headers: { 'User-Agent': 'torben-jander.me wind' } });
    if (!r.ok) throw new Error('upstream ' + r.status);
    data = await r.json();
  } catch (e) {
    return json({ error: 'unavailable' }, 503, 60);
  }

  const c = data.current || {};
  const h = data.hourly || {};
  const hours = (h.time || []).map((t, i) => ({
    t,
    speed: round((h.wind_speed_10m || [])[i]),
    gusts: round((h.wind_gusts_10m || [])[i]),
    dir: round((h.wind_direction_10m || [])[i]),
  }));

  const body = {
    time: c.time || null,
    speed: round(c.wind_speed_10m),
    gusts: round(c.wind_gusts_10m),
    dir: round(c.wind_direction_10m),
    temp: round(c.temperature_2m),
    hours,
    source: 'Open-Meteo.com',
  };

  if (body.speed === null || body.dir === null) return json({ error: 'unavailable' }, 503, 60);

  const res = json(body, 200, CACHE_SECONDS);
  context.waitUntil(cache.put(key, res.clone()));
  return res;
}
