// Fungsi bantu yang dipakai skrip update dan build.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
}

// Kunci untuk mencocokkan judul yang sama dari sumber berbeda.
export function titleKey(title) {
  return String(title)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bseason\s+(\d+)\b/g, 's$1')
    .replace(/\bmusim\s+(\d+)\b/g, 's$1')
    .replace(/[^a-z0-9぀-ヿ一-鿿가-힯]+/g, ' ')
    .trim();
}

export function slugify(text) {
  const s = String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'judul';
}

const MONTHS = {
  january: 1, jan: 1, januari: 1,
  february: 2, feb: 2, februari: 2, pebruari: 2,
  march: 3, mar: 3, maret: 3,
  april: 4, apr: 4,
  may: 5, mei: 5,
  june: 6, jun: 6, juni: 6,
  july: 7, jul: 7, juli: 7,
  august: 8, aug: 8, agustus: 8, agu: 8, agt: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, oktober: 10, okt: 10,
  november: 11, nov: 11, nopember: 11,
  december: 12, dec: 12, desember: 12, des: 12,
};

const pad = (n) => String(n).padStart(2, '0');

function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Baca tanggal dari teks bebas (Inggris/Indonesia) atau nilai sort Wikipedia.
 * Hasil: { date: 'YYYY-MM-DD', precision: 'day' | 'month' } atau null.
 */
export function parseDate(input, defaultYear) {
  if (!input) return null;
  const text = String(input).replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (/^(tba|tbd|tbc|n\/a|—|-|–)$/i.test(text)) return null;

  // ISO, termasuk format sort-key Wikipedia "000000002026-11-06-0000"
  let m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    if (validDate(y, mo, d)) return { date: `${y}-${pad(mo)}-${pad(d)}`, precision: 'day' };
  }

  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

  // "November 6, 2026" / "Nov. 6 2026" / "November 6"
  m = text.match(new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'));
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    const d = +m[2];
    const y = m[3] ? +m[3] : defaultYear;
    if (y && validDate(y, mo, d)) return { date: `${y}-${pad(mo)}-${pad(d)}`, precision: 'day' };
  }

  // "6 November 2026" / "6 Nov 2026" / "6 November"
  m = text.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})\\.?(?:,?\\s+(\\d{4}))?\\b`, 'i'));
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    const d = +m[1];
    const y = m[3] ? +m[3] : defaultYear;
    if (y && validDate(y, mo, d)) return { date: `${y}-${pad(mo)}-${pad(d)}`, precision: 'day' };
  }

  // "November 2026" (tanggal belum pasti)
  m = text.match(new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{4})\\b`, 'i'));
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    return { date: `${m[2]}-${pad(mo)}-01`, precision: 'month' };
  }

  return null;
}

// Tanggal hari ini di zona waktu tertentu, format YYYY-MM-DD.
export function todayIn(timezone = 'Asia/Jakarta', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  const a = Date.parse(fromIso + 'T00:00:00Z');
  const b = Date.parse(toIso + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

// Untuk tanggal yang hanya diketahui bulannya, anggap akhir bulan
// supaya tetap masuk "akan tayang" sampai bulan itu selesai.
export function sortDate(item) {
  if (item.precision === 'month') {
    const [y, m] = item.date.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${pad(m)}-${pad(last)}`;
  }
  return item.date;
}

export function platformMatcher(platforms) {
  const compiled = platforms.map((p) => ({ key: p.key, re: new RegExp(p.match, 'i') }));
  return (text) => {
    if (!text) return [];
    const found = [];
    for (const p of compiled) if (p.re.test(text) && !found.includes(p.key)) found.push(p.key);
    return found;
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEASON_RE = /\s*(?:[:\-–—]\s*)?\(?\b(?:season|musim)\s+(\d{1,2})\b\)?/i;

/** Pisahkan "Judul (season 3)" menjadi { base: 'Judul', season: 3 }. */
export function splitSeason(title) {
  const m = String(title).match(SEASON_RE);
  if (!m) return { base: String(title).trim(), season: undefined };
  const base = String(title).replace(SEASON_RE, ' ').replace(/\s+([:,])/g, '$1').replace(/\s{2,}/g, ' ').replace(/[\s:–—-]+$/, '').trim();
  return { base, season: +m[1] };
}

/** Kunci gabung: judul tanpa keterangan musim + nomor musim (kalau > 1). */
export function itemKey(item) {
  const raw = item.match || item.title;
  let { base, season } = splitSeason(raw);
  // "Good Partner 2" dianggap sama dengan "Good Partner" musim 2
  const trailing = base.match(/^(.*\D)\s([2-9])$/);
  if (trailing && !season) { base = trailing[1]; season = +trailing[2]; }
  const s = item.season || season;
  return titleKey(base) + (s && s > 1 ? ` s${s}` : '');
}

/** Judul untuk ditampilkan, termasuk musim kalau perlu. */
export function displayTitle(item) {
  if (item.season && item.season > 1 && !/(season|musim|\b\d+$|\b\d+:)/i.test(item.title)) {
    return `${item.title} Musim ${item.season}`;
  }
  return item.title;
}
