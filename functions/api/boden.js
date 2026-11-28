// Cloudflare Pages Function: GET /api/boden
//
// Liefert die Rohdaten für den Matsch-Indikator: aktuelle Bodenfeuchte (Open-Meteo-Modell)
// für Bremen, dazu die Regensumme und die Tiefsttemperatur der letzten Tage (für Frost/Tauwetter).
// Die Einstufung in fest/feucht/matschig passiert bewusst erst im Browser (assets/js/matsch.js),
// damit die Schwellen leicht anhand echter Fahrten nachjustiert werden können.
// Abruf serverseitig, 30 Minuten Cache (Bodenfeuchte ändert sich langsam).

const LAT = 53.08; // Bremen
const LON = 8.80;
const CACHE_SECONDS = 30 * 60;

const UPSTREAM =
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${LAT}&longitude=${LON}` +
  '&current=soil_moisture_0_to_1cm,soil_moisture_3_to_9cm,temperature_2m' +
  '&hourly=soil_moisture_0_to_1cm,soil_moisture_3_to_9cm' +
  '&daily=precipitation_sum,temperature_2m_min' +
  '&past_days=3&forecast_days=1&timezone=Europe%2FBerlin';

function json(body, status, maxAge) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}`,
    },
  });
}

function num(n, d) {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  var f = Math.pow(10, d || 0);
  return Math.round(n * f) / f;
}

function sum(arr) {
  if (!Array.isArray(arr)) return null;
  var s = 0, seen = false;
  for (var i = 0; i < arr.length; i++) {
    if (typeof arr[i] === 'number' && isFinite(arr[i])) { s += arr[i]; seen = true; }
  }
  return seen ? Math.round(s * 10) / 10 : null;
}

function min(arr) {
  if (!Array.isArray(arr)) return null;
  var m = Infinity;
  for (var i = 0; i < arr.length; i++) {
    if (typeof arr[i] === 'number' && isFinite(arr[i])) m = Math.min(m, arr[i]);
  }
  return m === Infinity ? null : Math.round(m * 10) / 10;
}

export async function onRequestGet(context) {
  const cache = caches.default;
  const key = new Request(new URL('/api/boden?v=1', context.request.url).toString());

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

  // Bodenfeuchte: current bevorzugen, sonst den letzten Stundenwert nehmen.
  function lastHour(arr) {
    if (!Array.isArray(arr)) return null;
    for (var i = arr.length - 1; i >= 0; i--) {
      if (typeof arr[i] === 'number' && isFinite(arr[i])) return arr[i];
    }
    return null;
  }
  const soilTop = c.soil_moisture_0_to_1cm != null ? c.soil_moisture_0_to_1cm : lastHour(h.soil_moisture_0_to_1cm);
  const soil = c.soil_moisture_3_to_9cm != null ? c.soil_moisture_3_to_9cm : lastHour(h.soil_moisture_3_to_9cm);

  const body = {
    time: c.time || null,
    soil: num(soil, 3),        // 3–9 cm, m³/m³ — Hauptwert
    soilTop: num(soilTop, 3),  // 0–1 cm, m³/m³ — Oberfläche
    rainDays: sum(d.precipitation_sum),     // mm, letzte ~3 Tage + heute
    tMin: min(d.temperature_2m_min),        // °C, kälteste Nacht der letzten Tage
    temp: num(c.temperature_2m, 0),
    source: 'Open-Meteo.com',
  };

  if (body.soil === null && body.soilTop === null) return json({ error: 'unavailable' }, 503, 60);

  const res = json(body, 200, CACHE_SECONDS);
  context.waitUntil(cache.put(key, res.clone()));
  return res;
}
