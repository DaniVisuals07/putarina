// Vercel serverless funkcija: ruta za kamion + putarine (HERE Routing API v8)
// Cijene putarina dolaze iz HERE baze koja se održava prema tarifama operatera po državama.
const HAZ = ['explosive','gas','flammable','combustible','organic','poison','radioactive','corrosive','poisonousInhalation','harmfulToWater','other'];
const EURO = { euro0: 'euro1', euro1: 'euro1', euro2: 'euro2', euro3: 'euro3', euro4: 'euro4', euro5: 'euro5', euro6: 'euro6', euroEev: 'euroEev' };

export default async function handler(req, res) {
  const key = process.env.HERE_API_KEY;
  if (!key) return res.status(500).json({ error: 'HERE_API_KEY nije postavljen na Vercelu.' });

  const q = req.query;
  const num = (v, def) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : def);
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const coord = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

  const origin = String(q.origin || '');
  const destination = String(q.destination || '');
  if (!coord.test(origin) || !coord.test(destination)) {
    return res.status(400).json({ error: 'Neispravno polazište ili odredište.' });
  }
  const vias = [].concat(q.via || []).map(String);
  if (vias.some(v => !coord.test(v))) return res.status(400).json({ error: 'Neispravna usputna tačka.' });

  const axles = clamp(num(q.axles, 5), 2, 12);
  const trailers = clamp(num(q.trailers, 0), 0, 3);
  const weightKg = clamp(num(q.weight, 40000), 500, 100000);
  const heightCm = clamp(num(q.height, 400), 100, 500);
  const lengthCm = clamp(num(q.length, 1650), 300, 3000);
  const euro = EURO[q.euro] || 'euro6';
  const type = q.type === 'tractor' ? 'tractor' : 'straightTruck';
  const currency = /^[A-Z]{3}$/.test(q.currency) ? q.currency : 'EUR';
  const hazmat = String(q.hazmat || '').split(',').filter(h => HAZ.includes(h));

  const url = new URL('https://router.hereapi.com/v8/routes');
  const sp = url.searchParams;
  sp.set('transportMode', 'truck');
  sp.set('origin', origin);
  sp.set('destination', destination);
  vias.forEach(v => sp.append('via', v));
  sp.set('return', 'polyline,summary,tolls');
  sp.set('currency', currency);
  sp.set('lang', 'hr');

  sp.set('truck[type]', type);
  sp.set('truck[axleCount]', String(axles));
  sp.set('truck[trailerCount]', String(trailers));
  sp.set('truck[grossWeight]', String(weightKg));
  sp.set('truck[height]', String(Math.round(heightCm)));
  sp.set('truck[length]', String(Math.round(lengthCm)));
  sp.set('truck[width]', '255');
  sp.set('tolls[vehicleCategory]', 'Truck');
  sp.set('tolls[emissionType]', euro);
  if (['B', 'C', 'D', 'E'].includes(q.tunnel)) sp.set('truck[tunnelCategory]', q.tunnel);
  if (hazmat.length) sp.set('truck[shippedHazardousGoods]', hazmat.join(','));
  if (q.departureTime && !Number.isNaN(Date.parse(q.departureTime))) sp.set('departureTime', q.departureTime);
  sp.set('apiKey', key);

  try {
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({ error: j.title || j.error_description || 'Greška pri računanju rute.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(j);
  } catch (e) {
    res.status(502).json({ error: 'Servis za rutiranje nije dostupan.' });
  }
}
