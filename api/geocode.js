// Vercel serverless funkcija: prijedlozi lokacija za cijelu Evropu (uklj. UK, Rusiju, Tursku)
// HERE Autosuggest (prefiks od 2 slova), uz rezervu na HERE Geocode.
const EUROPE = [
  'ALB','AND','AUT','BLR','BEL','BIH','BGR','HRV','CYP','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','ISL',
  'IRL','ITA','LVA','LIE','LTU','LUX','MLT','MDA','MCO','MNE','NLD','MKD','NOR','POL','PRT','ROU','RUS','SMR',
  'SRB','SVK','SVN','ESP','SWE','CHE','TUR','UKR','GBR','VAT'
].join(',');

const RANK = { locality: 0, administrativeArea: 1, place: 2, street: 3, houseNumber: 4 };

function toItems(list) {
  return (list || [])
    .filter(i => i.position && i.title)
    .sort((a, b) => (RANK[a.resultType] ?? 9) - (RANK[b.resultType] ?? 9))
    .map(i => ({
      title: (i.address && i.address.label) || i.title,
      lat: i.position.lat,
      lng: i.position.lng
    }));
}

export default async function handler(req, res) {
  const key = process.env.HERE_API_KEY;
  if (!key) return res.status(500).json({ error: 'HERE_API_KEY nije postavljen na Vercelu.' });

  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.status(400).json({ error: 'Upišite najmanje 2 slova.' });
  if (q.length > 120) return res.status(400).json({ error: 'Upit je predug.' });

  const call = async (base, extra) => {
    const url = new URL(base);
    url.searchParams.set('q', q);
    url.searchParams.set('in', 'countryCode:' + EUROPE);
    url.searchParams.set('lang', 'hr,en');
    url.searchParams.set('apiKey', key);
    Object.entries(extra).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  };

  try {
    let a = await call('https://autosuggest.search.hereapi.com/v1/autosuggest', { limit: '10' });
    let items = a.ok ? toItems(a.j.items) : [];

    if (!items.length) {
      const g = await call('https://geocode.search.hereapi.com/v1/geocode', { limit: '8' });
      if (g.ok) items = toItems(g.j.items);
      else if (!a.ok) {
        return res.status(a.status).json({ error: a.j.error_description || a.j.title || 'Greška pretrage lokacija.' });
      }
    }
    res.setHeader('Cache-Control', 's-maxage=86400');
    res.status(200).json({ items: items.slice(0, 8) });
  } catch (e) {
    res.status(502).json({ error: 'Servis za pretragu lokacija nije dostupan.' });
  }
}
