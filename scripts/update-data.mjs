// Skrip update data harian.
// 1) Baca jadwal dari halaman Wikipedia di config/sources.json
// 2) Gabungkan dengan data/manual.json (tambahan & koreksi manual)
// 3) Lengkapi dengan TMDB (kalau TMDB_API_KEY ada)
// 4) Tulis data/titles.json, yang dipakai untuk membangun web
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import {
  readJson, writeJson, slugify, todayIn, addDays, sortDate, platformMatcher,
  splitSeason, itemKey, displayTitle,
} from './lib/util.mjs';
import { fetchWikiPage, parseWikiTables } from './lib/wiki.mjs';
import { createTmdb } from './lib/tmdb.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => join(ROOT, ...p);

const site = await readJson(P('config/site.json'));
const platforms = await readJson(P('config/platforms.json'));
const sources = await readJson(P('config/sources.json'));
const manual = await readJson(P('data/manual.json'), []);
const wikiCache = await readJson(P('data/cache/wikipedia.json'), {});
const tmdbCache = await readJson(P('data/cache/tmdb.json'), {});

const today = todayIn(site.timezone);
const year = +today.slice(0, 4);
const minDate = addDays(today, -site.keepPastDays);
const maxDate = addDays(today, site.keepFutureDays);
const matchPlatforms = platformMatcher(platforms);
const offline = process.argv.includes('--offline');

const log = (...a) => console.log(...a);
const inWindow = (it) => sortDate(it) >= minDate && it.date <= maxDate;

// ---------- 1. Wikipedia ----------
const wikiItems = [];
const report = [];
for (const src of sources.pages) {
  const fill = (s) => String(s).replace('{year}', year).replace('{nextYear}', year + 1);
  const page = fill(src.page);
  const source = { ...src, page, year: src.year ? +fill(src.year) : undefined };
  const cacheKey = `${src.lang}:${page}`;
  let rows = null;
  if (!offline) {
    try {
      const res = await fetchWikiPage(src.lang, page);
      if (!res) {
        report.push(`- lewati (halaman tidak ada): ${cacheKey}`);
        continue;
      }
      rows = parseWikiTables(res.html, { defaultYear: source.year || year, matchPlatforms, source })
        .map((r) => {
          const { base, season } = splitSeason(r.title);
          return { ...r, title: base, season, sourceUrl: res.url, sourceName: `Wikipedia: ${res.title}` };
        });
      wikiCache[cacheKey] = { at: new Date().toISOString(), rows };
      report.push(`- ${cacheKey}: ${rows.length} baris bertanggal, ${rows.filter(inWindow).length} dalam rentang`);
    } catch (err) {
      report.push(`- GAGAL ${cacheKey}: ${err.message} (pakai data terakhir)`);
    }
  }
  if (!rows) rows = wikiCache[cacheKey]?.rows || [];
  wikiItems.push(...rows.filter(inWindow));
}

// ---------- 2. Gabungkan ----------
const byKey = new Map();
function upsert(item, { override = false } = {}) {
  const key = itemKey(item);
  const prev = byKey.get(key);
  if (!prev) {
    byKey.set(key, { ...item, key, platforms: [...(item.platforms || [])], sources: item.sourceUrl ? [{ name: item.sourceName, url: item.sourceUrl }] : [] });
    return;
  }
  const merged = override ? { ...prev, ...item } : { ...item, ...prev };
  merged.key = key;
  merged.platforms = override && item.platforms?.length
    ? [...item.platforms]
    : [...new Set([...(prev.platforms || []), ...(item.platforms || [])])];
  merged.genres = [...new Set([...(prev.genres || []), ...(item.genres || [])])];
  merged.sources = [...(prev.sources || [])];
  if (item.sourceUrl && !merged.sources.some((s) => s.url === item.sourceUrl)) {
    merged.sources.push({ name: item.sourceName, url: item.sourceUrl });
  }
  // dua tanggal berbeda: pakai yang lebih awal, kecuali manual
  if (!override && item.date && prev.date && item.date !== prev.date && item.precision === 'day') {
    if (prev.precision === 'month' || item.date < prev.date) {
      merged.date = item.date;
      merged.precision = 'day';
    }
  }
  byKey.set(key, merged);
}

for (const it of wikiItems) upsert(it);
for (const m of manual) {
  const key = itemKey(m);
  if (m.hidden) { byKey.delete(key); continue; }
  upsert({ precision: 'day', ...m, sourceName: m.sourceName, sourceUrl: m.sourceUrl }, { override: true });
}

let items = [...byKey.values()].filter(inWindow);

// ---------- 3. TMDB ----------
const tmdb = offline ? null : createTmdb(process.env.TMDB_API_KEY);
if (!tmdb) {
  log(offline ? 'Mode offline: TMDB dilewati.' : 'TMDB_API_KEY belum diisi: poster & sinopsis TMDB dilewati.');
}
const DAY = 86400000;
let tmdbHits = 0;
let tmdbErrors = 0;
for (const it of items) {
  let cached = tmdbCache[it.key];
  const age = cached ? Date.now() - Date.parse(cached.at) : Infinity;
  const stale = !cached || age > (cached.details ? 7 : 3) * DAY;
  if (tmdb && stale && tmdbErrors < 5) {
    try {
      let match = it.tmdbId ? { kind: it.tmdbKind || (it.type === 'film' ? 'movie' : 'tv'), id: it.tmdbId } : await tmdb.search(it);
      const details = match ? await tmdb.details(match.kind, match.id) : null;
      cached = { at: new Date().toISOString(), details };
      tmdbCache[it.key] = cached;
    } catch (err) {
      tmdbErrors += 1;
      log(`TMDB gagal untuk "${it.title}": ${err.message}`);
      if (/API key/.test(err.message)) tmdbErrors = 99;
    }
  }
  const d = cached?.details;
  if (!d) continue;
  tmdbHits += 1;
  it.tmdb = { id: d.tmdbId, kind: d.tmdbKind };
  it.poster = it.poster || d.poster;
  it.backdrop = it.backdrop || d.backdrop;
  it.trailer = it.trailer || d.trailer;
  it.overview = d.overview || null;
  it.originalTitle = it.originalTitle || (d.originalTitle !== it.title ? d.originalTitle : undefined);
  it.country = it.country || d.country;
  it.genres = [...new Set([...(it.genres || []), ...d.genres])];
  const fromProviders = d.providerNames.flatMap((n) => matchPlatforms(n));
  it.availableNow = [...new Set(fromProviders)];
  it.platforms = [...new Set([...(it.platforms || []), ...fromProviders])];
}

// ---------- 4. Tulis ----------
const usedSlugs = new Set();
items = items
  .map((it) => {
    const base = slugify(displayTitle(it));
    let slug = it.slug || base;
    if (usedSlugs.has(slug)) slug = `${slug}-${it.date.slice(0, 4)}`;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
    usedSlugs.add(slug);
    const out = {
      slug,
      title: it.title,
      originalTitle: it.originalTitle || undefined,
      date: it.date,
      precision: it.precision || 'day',
      type: it.type || 'series',
      season: it.season || undefined,
      country: it.country || undefined,
      genres: (it.genres || []).filter(Boolean),
      platforms: it.platforms || [],
      availableNow: it.availableNow?.length ? it.availableNow : undefined,
      synopsis: it.synopsis || undefined,
      overview: it.overview || undefined,
      poster: it.poster || undefined,
      backdrop: it.backdrop || undefined,
      trailer: it.trailer || undefined,
      note: it.note || undefined,
      tmdb: it.tmdb || undefined,
      sources: it.sources?.length ? it.sources : undefined,
    };
    return JSON.parse(JSON.stringify(out));
  })
  .filter((it) => it.platforms.length)
  .sort((a, b) => sortDate(a).localeCompare(sortDate(b)) || a.title.localeCompare(b.title));

await writeJson(P('data/titles.json'), { generatedAt: new Date().toISOString(), today, count: items.length, items });
await writeJson(P('data/cache/wikipedia.json'), wikiCache);
await writeJson(P('data/cache/tmdb.json'), tmdbCache);

log('Sumber Wikipedia:');
log(report.join('\n') || '- (offline)');
log(`Selesai: ${items.length} judul (${wikiItems.length} baris Wikipedia, ${manual.length} entri manual, ${tmdbHits} dilengkapi TMDB).`);
