// Cloudflare Pages Function: GET /api/forecast
//
// Vorhersage für Bremen über 7 Tage, stündlich: Wind, Böen, Richtung, Temperatur (auch gefühlt),
// Regenmenge und Regenwahrscheinlichkeit, dazu Sonnenauf- und -untergang je Tag.
// Grundlage für den Planer auf /wetter/. Wie /api/wind: Abruf serverseitig bei Open-Meteo,
// keine Besucherdaten an Dritte. Vorhersagen ändern sich langsamer, daher 30 Minuten Cache.

const LAT = 53.08;   // Bremen
const LON = 8.80;
const DAYS = 7;
const CACHE_SECONDS = 30 * 60;

const UPSTREAM =
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${LAT}&longitude=${LON}` +
  '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,apparent_temperature,precipitation,precipitation_probability' +
  '&daily=sunrise,sunset' +
  `&forecast_days=${DAYS}&wind_speed_unit=kmh&timezone=Europe%2FBerlin`;

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
  const key = new Request(new URL('/api/forecast?v=1', context.request.url).toString());

  const hit = await cache.match(key);
  if (hit) return hit;

  let data;
  try {
    const r = await fetch(UPSTREAM, { headers: { 'User-Agent': 'torben-jander.me planer' } });
    if (!r.ok) throw new Error('upstream ' + r.status);
    data = await r.json();
  } catch (e) {
    return json({ error: 'unavailable' }, 503, 60);
  }

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

  if (!hours.length || !days.length) return json({ error: 'unavailable' }, 503, 60);

  const res = json({ hours, days, source: 'Open-Meteo.com' }, 200, CACHE_SECONDS);
  context.waitUntil(cache.put(key, res.clone()));
  return res;
}
