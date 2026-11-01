// Melengkapi data judul dari TMDB: poster, sinopsis, genre, trailer, dan
// aplikasi tempat judul tersedia di Indonesia.
import { sleep, titleKey } from './util.mjs';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

export function createTmdb(apiKey) {
  if (!apiKey) return null;
  const isBearer = apiKey.startsWith('eyJ'); // "API Read Access Token"
  let last = 0;

  async function get(path, params = {}) {
    const wait = 30 - (Date.now() - last); // maksimal ~30 permintaan per detik
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
    if (!isBearer) url.searchParams.set('api_key', apiKey);
    const headers = { accept: 'application/json' };
    if (isBearer) headers.Authorization = `Bearer ${apiKey}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, { headers });
      if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
      if (res.status === 404) return null;
      if (res.status === 401) throw new Error('TMDB menolak API key. Cek secret TMDB_API_KEY di GitHub.');
      if (!res.ok) throw new Error(`TMDB HTTP ${res.status} untuk ${path}`);
      return res.json();
    }
    throw new Error(`TMDB terlalu sering ditolak (429) untuk ${path}`);
  }

  async function search(item) {
    const kind = item.type === 'film' ? 'movie' : 'tv';
    const year = item.date ? item.date.slice(0, 4) : undefined;
    const yearParam = kind === 'movie' ? { primary_release_year: year } : { first_air_date_year: year };
    // Musim lanjutan: cari nama seriesnya tanpa "Season N" dan tanpa filter tahun.
    const baseTitle = item.title.replace(/\s*[:(-]?\s*(season|musim)\s*\d+\)?/i, '').replace(/\s+\d+$/, '').trim();
    const isLaterSeason = item.season && item.season > 1;
    const attempts = [];
    if (!isLaterSeason) attempts.push({ q: item.title, p: yearParam });
    attempts.push({ q: baseTitle, p: {} });
    if (item.originalTitle) attempts.push({ q: item.originalTitle, p: {} });

    const wanted = new Set([titleKey(baseTitle), titleKey(item.title)]);
    if (item.originalTitle) wanted.add(titleKey(item.originalTitle));
    for (const a of attempts) {
      const res = await get(`/search/${kind}`, { query: a.q, include_adult: 'false', language: 'en-US', ...a.p });
      const list = res?.results || [];
      if (!list.length) continue;
      // Hanya terima judul yang sama persis, supaya poster tidak salah film.
      const exact = list.find((r) => [r.title, r.name, r.original_title, r.original_name].some((n) => n && wanted.has(titleKey(n))));
      if (exact) return { kind, id: exact.id };
    }
    return null;
  }

  async function details(kind, id) {
    const append = 'videos,watch/providers,external_ids';
    const id_ = await get(`/${kind}/${id}`, { language: 'id-ID', append_to_response: append, include_video_language: 'id,en,ko,null' });
    if (!id_) return null;
    let overview = id_.overview;
    if (!overview) {
      const en = await get(`/${kind}/${id}`, { language: 'en-US' });
      overview = en?.overview || '';
    }
    const videos = (id_.videos?.results || []).filter((v) => v.site === 'YouTube');
    const trailer =
      videos.find((v) => v.type === 'Trailer' && v.official) ||
      videos.find((v) => v.type === 'Trailer') ||
      videos.find((v) => v.type === 'Teaser') ||
      null;
    const providers = id_['watch/providers']?.results?.ID || {};
    const providerNames = [...(providers.flatrate || []), ...(providers.free || []), ...(providers.ads || [])]
      .map((p) => p.provider_name);
    return {
      tmdbId: id,
      tmdbKind: kind,
      title: id_.title || id_.name,
      originalTitle: id_.original_title || id_.original_name,
      overview,
      genres: (id_.genres || []).map((g) => g.name.toLowerCase()),
      country: (id_.origin_country && id_.origin_country[0]) || (id_.production_countries?.[0]?.iso_3166_1) || null,
      originalLanguage: id_.original_language || null,
      poster: id_.poster_path ? `${IMG}/w342${id_.poster_path}` : null,
      backdrop: id_.backdrop_path ? `${IMG}/w780${id_.backdrop_path}` : null,
      trailer: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
      providerNames,
      providersLink: providers.link || null,
      imdbId: id_.external_ids?.imdb_id || null,
    };
  }

  return { search, details };
}
