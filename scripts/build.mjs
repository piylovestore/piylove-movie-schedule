// Membangun web statis dari data/titles.json ke folder dist/.
// Tidak butuh library luar: cukup `node scripts/build.mjs`.
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { rm, mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readJson, todayIn, addDays, daysBetween, sortDate, displayTitle } from './lib/util.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => join(ROOT, ...p);
const DIST = P('dist');

const site = await readJson(P('config/site.json'));
const platforms = await readJson(P('config/platforms.json'));
const data = await readJson(P('data/titles.json'));
const PLAT = Object.fromEntries(platforms.map((p) => [p.key, p]));
const today = todayIn(site.timezone);
const generated = data.generatedAt ? new Date(data.generatedAt) : new Date();

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const utc = (iso) => new Date(iso + 'T00:00:00Z');
const fmt = (iso, opts) => new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', ...opts }).format(utc(iso));
const fullDate = (iso) => fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthYear = (iso) => fmt(iso, { month: 'long', year: 'numeric' });

const COUNTRY = {
  KR: 'Korea', CN: 'China', JP: 'Jepang', US: 'AS', ID: 'Indonesia', TH: 'Thailand', FR: 'Prancis', ES: 'Spanyol',
  DE: 'Jerman', SE: 'Swedia', AT: 'Austria', CA: 'Kanada', GB: 'Inggris', IN: 'India', BR: 'Brasil', PT: 'Portugal',
  PH: 'Filipina', TW: 'Taiwan', MY: 'Malaysia', IT: 'Italia', MX: 'Meksiko', AU: 'Australia', HK: 'Hong Kong', TR: 'Turki',
  VN: 'Vietnam', SG: 'Singapura', DK: 'Denmark', NO: 'Norwegia', PL: 'Polandia', BE: 'Belgia', NL: 'Belanda', AR: 'Argentina', CO: 'Kolombia',
};

const CATEGORIES = [
  { key: 'film', name: 'Film' },
  { key: 'series', name: 'Series' },
  { key: 'drakor', name: 'Drakor' },
  { key: 'dracin', name: 'Dracin' },
  { key: 'anime', name: 'Anime' },
  { key: 'indonesia', name: 'Indonesia' },
  { key: 'dokumenter', name: 'Dokumenter' },
];

function categories(it) {
  const g = (it.genres || []).join(' ');
  const cats = [it.type === 'film' ? 'film' : 'series'];
  const isDoc = /document|dokumenter/.test(g);
  const isAnim = /anim/.test(g);
  if (it.type !== 'film' && it.country === 'KR' && !/reality|variety/.test(g) && !isDoc) cats.push('drakor');
  if (it.type !== 'film' && (it.country === 'CN' || it.country === 'TW') && !isDoc) cats.push('dracin');
  if (isAnim && it.country === 'JP') cats.push('anime');
  if (it.country === 'ID') cats.push('indonesia');
  if (isDoc) cats.push('dokumenter');
  return cats;
}

function kindLabel(it) {
  const kind = it.type === 'film' ? 'Film' : 'Series';
  const c = COUNTRY[it.country];
  return c ? `${kind} ${c}` : kind;
}

function initials(title) {
  const words = title.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w && !/^(the|a|an|of|and)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join('') || title[0] || '?').toUpperCase();
}

function relative(iso, precision) {
  if (precision === 'month') return 'Tanggal menyusul';
  const d = daysBetween(today, iso);
  if (d === 0) return 'Hari ini';
  if (d === 1) return 'Besok';
  if (d === -1) return 'Kemarin';
  if (d > 1) return `${d} hari lagi`;
  return `${-d} hari lalu`;
}

const items = data.items.map((it) => ({
  ...it,
  display: displayTitle(it),
  cats: categories(it),
  sort: sortDate(it),
  url: `/judul/${it.slug}/`,
}));

// ---------- assets ----------
await rm(DIST, { recursive: true, force: true });
await mkdir(join(DIST, 'assets'), { recursive: true });
const assetVersion = {};
for (const f of ['style.css', 'app.js', 'favicon.svg']) {
  const src = P('src', f);
  const buf = await readFile(src);
  assetVersion[f] = createHash('sha1').update(buf).digest('hex').slice(0, 8);
  await copyFile(src, join(DIST, 'assets', f));
}
const asset = (f) => `/assets/${f}?v=${assetVersion[f]}`;

// ---------- partials ----------
function head({ title, description, path, image, jsonLd }) {
  const url = site.url + path;
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta name="theme-color" content="#2A1B33">
<link rel="icon" href="${asset('favicon.svg')}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${asset('style.css')}">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<a class="skip" href="#main">Langsung ke jadwal</a>
<header class="site-header">
  <a class="brand" href="/" aria-label="${esc(site.name)}, beranda">
    <span class="brand-mark">Piylove</span>
    <span class="brand-sub">Movie Schedule</span>
  </a>
</header>`;
}

function foot() {
  const updated = new Intl.DateTimeFormat('id-ID', {
    timeZone: site.timezone, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(generated);
  return `<footer class="site-footer">
  <div class="footer-inner">
    <p class="footer-lead">${esc(site.name)} merangkum jadwal tayang di aplikasi streaming yang tersedia di Indonesia. Jadwal bisa berubah sewaktu-waktu, dan beberapa judul bisa tayang di Indonesia pada tanggal berbeda.</p>
    <p>Jadwal sebagian diambil dari Wikipedia (CC BY-SA). Poster, sinopsis, dan info ketersediaan dari <a href="https://www.themoviedb.org/" rel="noopener">TMDB</a>. Web ini memakai TMDB API tetapi tidak didukung atau disertifikasi oleh TMDB. Nama platform adalah merek dagang pemiliknya masing-masing.</p>
    <p class="updated">Data diperbarui ${esc(updated)} WIB.</p>
  </div>
</footer>
<script src="${asset('app.js')}" defer></script>
</body>
</html>`;
}

function platformBadges(keys, { link = false } = {}) {
  return keys
    .filter((k) => PLAT[k])
    .map((k) => {
      const p = PLAT[k];
      const inner = `<span class="dot" style="--c:${p.color}"></span>${esc(p.name)}`;
      return link
        ? `<a class="badge" href="/platform/${k}/">${inner}</a>`
        : `<span class="badge">${inner}</span>`;
    })
    .join('');
}

function poster(it, size = 'sm') {
  const color = PLAT[it.platforms[0]]?.color || '#6B5B73';
  if (it.poster) {
    const w = size === 'lg' ? 342 : 92;
    const src = size === 'lg' ? it.poster : it.poster.replace('/w342/', '/w154/');
    return `<img class="poster poster-${size}" src="${esc(src)}" alt="Poster ${esc(it.display)}" width="${w}" height="${Math.round(w * 1.5)}" loading="lazy" decoding="async">`;
  }
  return `<span class="poster poster-${size} poster-ph" style="--c:${color}" aria-hidden="true">${esc(initials(it.title))}</span>`;
}

function entry(it) {
  const genres = (it.genres || []).slice(0, 3).join(', ');
  const q = [it.display, it.originalTitle, ...it.platforms.map((k) => PLAT[k]?.name)].filter(Boolean).join(' ').toLowerCase();
  return `<article class="entry" data-platforms="${esc(it.platforms.join(' '))}" data-cats="${esc(it.cats.join(' '))}" data-q="${esc(q)}">
    <a class="entry-link" href="${it.url}">${poster(it)}</a>
    <div class="entry-body">
      <h3 class="entry-title"><a href="${it.url}">${esc(it.display)}</a></h3>
      <p class="entry-meta"><span>${esc(kindLabel(it))}</span>${genres ? `<span class="genres">${esc(genres)}</span>` : ''}</p>
      <div class="badges">${platformBadges(it.platforms)}</div>
    </div>
  </article>`;
}

function groupItems(list) {
  const groups = new Map();
  for (const it of list) {
    const key = it.precision === 'month' ? `m:${it.date.slice(0, 7)}` : it.date;
    if (!groups.has(key)) groups.set(key, { key, date: it.date, sort: it.sort, precision: it.precision, items: [] });
    groups.get(key).items.push(it);
  }
  return [...groups.values()].sort((a, b) => a.sort.localeCompare(b.sort));
}

function dayGroup(g) {
  const upcoming = g.sort >= today;
  const recent = !upcoming && g.sort >= addDays(today, -site.recentDays);
  const hidden = !upcoming; // tampilan awal: tab "Akan tayang"
  const dateBlock = g.precision === 'month'
    ? `<div class="day-date day-date-month">
        <span class="day-num">${esc(fmt(g.date, { month: 'short' }).replace('.', ''))}</span>
        <span class="day-week">${esc(monthYear(g.date))}</span>
        <span class="day-rel">Tanggal menyusul</span>
      </div>`
    : `<div class="day-date">
        <span class="day-num">${esc(fmt(g.date, { day: '2-digit' }))}</span>
        <span class="day-week">${esc(fmt(g.date, { weekday: 'long' }))}, ${esc(fmt(g.date, { month: 'long' }))}</span>
        <span class="day-rel" data-rel>${esc(relative(g.date, g.precision))}</span>
      </div>`;
  return `<section class="day" id="tgl-${esc(g.key.replace(':', '-'))}" data-sort="${g.sort}" data-date="${g.date}" data-precision="${g.precision}"${recent ? ' data-recent' : ''}${hidden ? ' hidden' : ''}>
    <h2 class="visually-hidden">${esc(g.precision === 'month' ? `${monthYear(g.date)}, tanggal menyusul` : fullDate(g.date))}</h2>
    ${dateBlock}
    <div class="day-items">${g.items.map(entry).join('\n')}</div>
  </section>`;
}

function weekStrip() {
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    cells.push(`<li><a class="wk${i === 0 ? ' wk-today' : ''}" href="#tgl-${d}" data-wk="${d}">
      <span class="wk-day">${esc(i === 0 ? 'Hari ini' : fmt(d, { weekday: 'short' }))}</span>
      <span class="wk-num">${esc(fmt(d, { day: 'numeric' }))}</span>
      <span class="wk-count" data-wk-count>0 judul</span>
    </a></li>`);
  }
  return `<ol class="week" aria-label="Tujuh hari ke depan">${cells.join('')}</ol>`;
}

function controls({ platformKeys, showPlatforms = true }) {
  const chip = (group, key, label, active, color) =>
    `<button type="button" class="chip" data-${group}="${key}" aria-pressed="${active}">${color ? `<span class="dot" style="--c:${color}"></span>` : ''}${esc(label)}</button>`;
  return `<div class="controls" id="filter">
  <div class="controls-row">
    <div class="tabs" role="group" aria-label="Pilih jadwal">
      <button type="button" class="tab" data-tab="akan" aria-pressed="true">Akan tayang</button>
      <button type="button" class="tab" data-tab="baru" aria-pressed="false">Baru tayang</button>
    </div>
    <label class="search">
      <span class="visually-hidden">Cari judul</span>
      <input type="search" placeholder="Cari judul atau platform" autocomplete="off" data-search>
    </label>
  </div>
  ${showPlatforms ? `<div class="chips" role="group" aria-label="Platform">
    ${chip('p', '', 'Semua platform', true)}
    ${platformKeys.map((k) => chip('p', k, PLAT[k].name, false, PLAT[k].color)).join('')}
  </div>` : ''}
  <div class="chips" role="group" aria-label="Jenis tayangan">
    ${chip('k', '', 'Semua jenis', true)}
    ${CATEGORIES.map((c) => chip('k', c.key, c.name, false)).join('')}
  </div>
</div>`;
}

function listSection(list) {
  return `<div class="schedule" data-schedule>
  ${groupItems(list).map(dayGroup).join('\n')}
  <div class="empty" data-empty hidden>
    <p class="empty-title">Belum ada judul yang cocok.</p>
    <p>Coba hapus filter, ganti kata kunci, atau lihat tab lainnya.</p>
    <button type="button" class="btn" data-reset>Hapus semua filter</button>
  </div>
</div>`;
}

const usedPlatforms = platforms.map((p) => p.key).filter((k) => items.some((it) => it.platforms.includes(k)));
const upcomingCount = items.filter((it) => it.sort >= today).length;

// ---------- halaman utama ----------
async function writePage(path, html) {
  const dir = join(DIST, path);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), html);
}

const monthNow = monthYear(today);
await writePage('/', [
  head({
    title: `Jadwal Tayang Film & Series Streaming ${monthNow} | ${site.name}`,
    description: site.description,
    path: '/',
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: site.url, inLanguage: 'id' },
  }),
  `<main id="main">
  <section class="hero">
    <h1>Tayang apa minggu ini?</h1>
    <p class="hero-sub">${upcomingCount} judul akan rilis di ${usedPlatforms.length} aplikasi streaming. Pilih platform atau jenis tontonan, lalu cek tanggalnya.</p>
    ${weekStrip()}
  </section>
  ${controls({ platformKeys: usedPlatforms })}
  ${listSection(items)}
</main>`,
  foot(),
].join('\n'));

// ---------- halaman platform ----------
for (const key of usedPlatforms) {
  const p = PLAT[key];
  const list = items.filter((it) => it.platforms.includes(key));
  const others = usedPlatforms.filter((k) => k !== key);
  await writePage(`/platform/${key}/`, [
    head({
      title: `Jadwal Tayang ${p.name} ${monthNow}: Film & Series Baru | ${site.name}`,
      description: `Daftar film dan series yang akan tayang dan baru tayang di ${p.name} Indonesia, lengkap dengan tanggal rilis.`,
      path: `/platform/${key}/`,
    }),
    `<main id="main">
  <section class="hero hero-platform" style="--c:${p.color}">
    <p class="crumb"><a href="/">Semua platform</a></p>
    <h1>Jadwal tayang ${esc(p.name)}</h1>
    <p class="hero-sub">${list.filter((it) => it.sort >= today).length} judul akan rilis di ${esc(p.name)}.</p>
    <nav class="other-platforms" aria-label="Platform lain">${platformBadges(others, { link: true })}</nav>
  </section>
  ${controls({ platformKeys: [], showPlatforms: false })}
  ${listSection(list)}
</main>`,
    foot(),
  ].join('\n'));
}

// ---------- halaman detail ----------
for (const it of items) {
  const text = it.synopsis || it.overview || '';
  const description = `${it.display} tayang ${it.precision === 'month' ? monthYear(it.date) : fullDate(it.date)} di ${it.platforms.map((k) => PLAT[k]?.name).filter(Boolean).join(', ')}. ${text}`.slice(0, 300);
  const sameDay = items.filter((o) => o !== it && o.date === it.date && o.precision === it.precision).slice(0, 6);
  const isFilm = it.type === 'film';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': isFilm ? 'Movie' : 'TVSeries',
    name: it.display,
    ...(it.originalTitle ? { alternateName: it.originalTitle } : {}),
    ...(it.precision === 'day' ? { [isFilm ? 'datePublished' : 'startDate']: it.date } : {}),
    ...(it.poster ? { image: it.poster } : {}),
    ...(text ? { description: text } : {}),
    ...(it.genres?.length ? { genre: it.genres } : {}),
    ...(it.country ? { countryOfOrigin: { '@type': 'Country', name: it.country } } : {}),
    url: site.url + it.url,
  };
  const dateText = it.precision === 'month' ? `${monthYear(it.date)} (tanggal menyusul)` : fullDate(it.date);
  const available = it.availableNow?.length
    ? `<p class="avail">Sudah tersedia di Indonesia: ${it.availableNow.map((k) => PLAT[k]?.name).filter(Boolean).join(', ')}.</p>` : '';

  await writePage(it.url, [
    head({ title: `${it.display}: Tanggal Tayang di ${it.platforms.map((k) => PLAT[k]?.name).filter(Boolean).join(' & ')} | ${site.name}`, description, path: it.url, image: it.backdrop || it.poster, jsonLd }),
    `<main id="main" class="detail">
  <p class="crumb"><a href="/">Kembali ke jadwal</a></p>
  <article class="detail-grid">
    <div class="detail-poster">${poster(it, 'lg')}</div>
    <div class="detail-info">
      <h1>${esc(it.display)}</h1>
      ${it.originalTitle ? `<p class="orig">${esc(it.originalTitle)}</p>` : ''}
      <p class="detail-date" data-date="${it.date}" data-precision="${it.precision}">
        <span class="detail-day">${esc(dateText)}</span>
        <span class="day-rel" data-rel>${esc(relative(it.date, it.precision))}</span>
      </p>
      <div class="badges badges-lg">${platformBadges(it.platforms, { link: true })}</div>
      <p class="entry-meta"><span>${esc(kindLabel(it))}</span>${it.genres?.length ? `<span class="genres">${esc(it.genres.join(', '))}</span>` : ''}</p>
      ${text ? `<p class="synopsis">${esc(text)}</p>` : '<p class="synopsis muted">Sinopsis belum tersedia.</p>'}
      ${it.note ? `<p class="note">${esc(it.note)}</p>` : ''}
      ${available}
      <div class="actions">
        ${it.trailer ? `<a class="btn" href="${esc(it.trailer)}" rel="noopener" target="_blank">Tonton trailer di YouTube</a>` : ''}
        <a class="btn btn-ghost" href="/#tgl-${it.precision === 'month' ? 'm-' + it.date.slice(0, 7) : it.date}">Lihat jadwal tanggal ini</a>
      </div>
      ${it.sources?.length ? `<p class="sources">Sumber jadwal: ${it.sources.map((s) => `<a href="${esc(s.url)}" rel="noopener">${esc(s.name)}</a>`).join(', ')}</p>` : ''}
    </div>
  </article>
  ${sameDay.length ? `<section class="same-day">
    <h2>Juga tayang ${it.precision === 'month' ? 'bulan ini' : 'di tanggal yang sama'}</h2>
    <div class="day-items">${sameDay.map(entry).join('\n')}</div>
  </section>` : ''}
</main>`,
    foot(),
  ].join('\n'));
}

// ---------- 404, sitemap, robots, headers ----------
await writeFile(join(DIST, '404.html'), [
  head({ title: `Halaman tidak ditemukan | ${site.name}`, description: site.description, path: '/404' }),
  `<main id="main" class="detail">
  <h1 class="big">Halaman ini tidak ada</h1>
  <p>Judulnya mungkin sudah lewat dari jadwal atau alamatnya salah ketik.</p>
  <p><a class="btn" href="/">Buka jadwal terbaru</a></p>
</main>`,
  foot(),
].join('\n'));

const lastmod = generated.toISOString().slice(0, 10);
const urls = ['/', ...usedPlatforms.map((k) => `/platform/${k}/`), ...items.map((it) => it.url)];
await writeFile(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(site.url + u)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`);
await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);
await writeFile(join(DIST, '_headers'), `/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`);

console.log(`Build selesai: ${items.length} judul, ${usedPlatforms.length} halaman platform, ${urls.length} URL di sitemap.`);
