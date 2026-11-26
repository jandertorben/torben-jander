// Cloudflare Pages Function: GET /api/wind
//
// Holt das Wetter für Bremen bei Open-Meteo und gibt eine schlanke Antwort zurück:
// Wind, Temperatur (auch gefühlt), Regen, die nächsten 12 Stunden sowie Sonnenauf- und -untergang.
// Der Abruf läuft auf dem Server (Cloudflare), nicht im Browser der Besucher:
// Open-Meteo sieht also keine IP-Adressen von Besuchern, und die Seite bleibt ohne Drittanbieter.
// Die Antwort wird 10 Minuten im Cloudflare-Cache gehalten (Open-Meteo rechnet in 15-Minuten-Schritten).

const LAT = 53.08;   // Bremen
const LON = 8.80;
const CACHE_SECONDS = 10 * 60;

const UPSTREAM =
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${LAT}&longitude=${LON}` +
  '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,apparent_temperature,precipitation,is_day' +
  '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,apparent_temperature,precipitation,precipitation_probability' +
  '&daily=sunrise,sunset' +
  '&forecast_hours=12&forecast_days=2&wind_speed_unit=kmh&timezone=Europe%2FBerlin';

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
function round1(n) {
  return typeof n === 'number' && isFinite(n) ? Math.round(n * 10) / 10 : null;
}
function at(arr, i) {
  return Array.isArray(arr) ? arr[i] : undefined;
}

export async function onRequestGet(context) {
  const cache = caches.default;
  const key = new Request(new URL('/api/wind?v=2', context.request.url).toString());

  const hit = await cache.match(key);
  if (hit) return hit;

  let data;
  try {
    const r = await fetch(UPSTREAM, { headers: { 'User-Agent': 'torben-jander.me wetter' } });
    if (!r.ok) throw new Error('upstream ' + r.status);
    data = await r.json();
  } catch (e) {
    return json({ error: 'unavailable' }, 503, 60);
  }

  const c = data.current || {};
  const h = data.hourly || {};
  const d = data.daily || {};

  const hours = (h.time || []).map((t, i) => ({
    t,
    speed: round(at(h.wind_speed_10m, i)),
    gusts: round(at(h.wind_gusts_10m, i)),
    dir: round(at(h.wind_direction_10m, i)),
    temp: round(at(h.temperature_2m, i)),
    feels: round(at(h.apparent_temperature, i)),
    rain: round1(at(h.precipitation, i)),
    rainProb: round(at(h.precipitation_probability, i)),
  }));

  const days = (d.time || []).map((t, i) => ({
    date: t,
    sunrise: at(d.sunrise, i) || null,
    sunset: at(d.sunset, i) || null,
  }));

  const body = {
    time: c.time || null,
    speed: round(c.wind_speed_10m),
    gusts: round(c.wind_gusts_10m),
    dir: round(c.wind_direction_10m),
    temp: round(c.temperature_2m),
    feels: round(c.apparent_temperature),
    rain: round1(c.precipitation),
    isDay: c.is_day === 1 ? true : c.is_day === 0 ? false : null,
    hours,
    days,
    source: 'Open-Meteo.com',
  };

  if (body.speed === null || body.dir === null) return json({ error: 'unavailable' }, 503, 60);

  const res = json(body, 200, CACHE_SECONDS);
  context.waitUntil(cache.put(key, res.clone()));
  return res;
}
