// Mengambil dan membaca tabel jadwal dari halaman Wikipedia.
import { parseHtml, findAll, children, hasClass, closest, textOf } from './html.mjs';
import { parseDate } from './util.mjs';

const USER_AGENT =
  'PiyloveMovieSchedule/1.0 (https://jadwal.piylove.site; jadwal tayang streaming) node-fetch';

/** Ambil HTML halaman lewat API resmi Wikipedia. null kalau halaman tidak ada. */
export async function fetchWikiPage(lang, page) {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.search = new URLSearchParams({
    action: 'parse',
    page,
    prop: 'text',
    redirects: '1',
    format: 'json',
    formatversion: '2',
    disableeditsection: '1',
    disabletoc: '1',
  }).toString();

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${lang}:${page}`);
  const json = await res.json();
  if (json.error) {
    if (json.error.code === 'missingtitle' || json.error.code === 'invalidtitle') return null;
    throw new Error(`Wikipedia error ${json.error.code}: ${json.error.info}`);
  }
  const title = json.parse.title;
  return {
    title,
    html: json.parse.text,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
  };
}

const TITLE_RE = /^(title|judul|program|programme|series|show|film|name|nama)\b/i;
const DATE_RE = /(premiere|release|start|first aired|aired|original release|air date|tayang|rilis|tanggal|date|debut)/i;
const DATE_PREF_RE = /(premiere|release|start|first aired|tayang perdana|rilis)/i;
const END_RE = /(finale|end|ended|final|last aired|berakhir|selesai)/i;
const NETWORK_RE = /(network|platform|channel|broadcaster|saluran|jaringan|streaming|ott)/i;
const GENRE_RE = /(genre)/i;
const EPISODES_RE = /(episodes|episode|eps|jumlah episode)/i;
const RUNTIME_RE = /(runtime|durasi|length)/i;

const SKIP_CLASSES = ['reference', 'mw-ref', 'sortkey', 'noprint', 'mw-editsection'];
const skipNode = (n) =>
  ['sup', 'style', 'script'].includes(n.tag) ||
  SKIP_CLASSES.some((c) => hasClass(n, c)) ||
  /display:\s*none/i.test(n.attrs.style || '');

function cleanText(el) {
  return textOf(el, skipNode).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function sortValue(el) {
  if (el.attrs['data-sort-value']) return el.attrs['data-sort-value'];
  const inner = findAll(el, (n) => n.attrs['data-sort-value'] !== undefined)[0];
  return inner ? inner.attrs['data-sort-value'] : null;
}

/** Ubah tabel HTML jadi grid dengan memperhitungkan rowspan/colspan. */
function tableToGrid(table) {
  const rows = [];
  for (const c of children(table)) {
    if (c.tag === 'tr') rows.push({ tr: c, inThead: false });
    else if (['tbody', 'thead', 'tfoot'].includes(c.tag)) {
      for (const tr of children(c, ['tr'])) rows.push({ tr, inThead: c.tag === 'thead' });
    }
  }
  const grid = [];
  const pending = []; // pending[col] = { cell, left }
  for (const { tr, inThead } of rows) {
    const row = [];
    const cells = children(tr, ['th', 'td']);
    let col = 0;
    const takePending = () => {
      while (pending[col] && pending[col].left > 0) {
        row[col] = pending[col].cell;
        pending[col].left -= 1;
        col += 1;
      }
    };
    takePending();
    for (const el of cells) {
      const colspan = Math.min(50, Math.max(1, parseInt(el.attrs.colspan || '1', 10) || 1));
      const rowspan = Math.min(500, Math.max(1, parseInt(el.attrs.rowspan || '1', 10) || 1));
      const cell = { el, isTh: el.tag === 'th', scope: el.attrs.scope || '', inThead };
      for (let k = 0; k < colspan; k++) {
        row[col] = cell;
        if (rowspan > 1) pending[col] = { cell, left: rowspan - 1 };
        col += 1;
      }
      takePending();
    }
    for (let c = col; c < pending.length; c++) {
      if (pending[c] && pending[c].left > 0) {
        row[c] = pending[c].cell;
        pending[c].left -= 1;
      }
    }
    grid.push(row);
  }
  return grid;
}

function isHeaderRow(row) {
  const cells = row.filter(Boolean);
  if (!cells.length) return false;
  if (cells.every((c) => c.inThead)) return true;
  return cells.every((c) => c.isTh && !/row/.test(c.scope || ''));
}

function pickColumns(headers) {
  const find = (re, not) => headers.findIndex((h) => re.test(h) && !(not && not.test(h)));
  let title = find(TITLE_RE);
  let date = headers.findIndex((h) => DATE_PREF_RE.test(h) && !END_RE.test(h));
  if (date < 0) date = find(DATE_RE, END_RE);
  const network = find(NETWORK_RE);
  const genre = find(GENRE_RE);
  const episodes = find(EPISODES_RE);
  const runtime = find(RUNTIME_RE);
  if (title < 0) title = 0;
  return { title, date, network, genre, episodes, runtime };
}

/**
 * Baca semua tabel wikitable di halaman.
 * @param {string} html
 * @param {object} opts { defaultYear, matchPlatforms, source }
 */
export function parseWikiTables(html, opts) {
  const { defaultYear, matchPlatforms, source = {} } = opts;
  const doc = parseHtml(html);
  const results = [];
  let headingYear = defaultYear;

  const nodes = findAll(doc, (n) => ['h2', 'h3', 'h4'].includes(n.tag) || (n.tag === 'table' && hasClass(n, 'wikitable')));
  for (const el of nodes) {
    if (el.tag !== 'table') {
      const y = cleanText(el).match(/\b(20\d{2})\b/);
      if (y) headingYear = +y[1];
      continue;
    }
    if (closest(el, (p) => p.tag === 'table')) continue; // lewati tabel di dalam tabel

    const grid = tableToGrid(el);
    if (grid.length < 2) continue;

    const headerRows = [];
    let i = 0;
    while (i < grid.length && isHeaderRow(grid[i])) {
      headerRows.push(grid[i]);
      i += 1;
    }
    if (!headerRows.length) continue;

    const width = Math.max(...grid.map((r) => r.length));
    const headers = [];
    for (let c = 0; c < width; c++) {
      const parts = [];
      for (const hr of headerRows) {
        const cell = hr[c];
        if (cell) {
          const t = cleanText(cell.el);
          if (t && parts[parts.length - 1] !== t) parts.push(t);
        }
      }
      headers.push(parts.join(' '));
    }

    const cols = pickColumns(headers);
    if (cols.date < 0) continue; // tabel tanpa kolom tanggal tidak berguna

    const isFilmTable = cols.runtime >= 0 && cols.episodes < 0;
    const year = source.year ? +source.year : headingYear || defaultYear;

    for (; i < grid.length; i++) {
      const row = grid[i];
      if (isHeaderRow(row)) continue;
      const titleCell = row[cols.title];
      const dateCell = row[cols.date];
      if (!titleCell || !dateCell) continue;

      const title = cleanText(titleCell.el).replace(/^["“]|["”]$/g, '').trim();
      if (!title || /^(tba|tbd|title|judul)$/i.test(title)) continue;

      // nilai sort Wikipedia (dari template tanggal) paling bisa diandalkan
      const sv = sortValue(dateCell.el);
      const parsed = (sv && /\d{4}-\d{2}-\d{2}/.test(sv) && parseDate(sv, year))
        || parseDate(cleanText(dateCell.el), year);
      if (!parsed) continue;

      let platforms = [];
      if (cols.network >= 0 && row[cols.network]) {
        platforms = matchPlatforms(cleanText(row[cols.network].el));
      }
      if (source.platform && !platforms.includes(source.platform)) platforms.unshift(source.platform);
      if (!platforms.length) continue; // bukan tayangan streaming yang kita kenal

      const genreText = cols.genre >= 0 && row[cols.genre] ? cleanText(row[cols.genre].el) : '';
      results.push({
        title,
        date: parsed.date,
        precision: parsed.precision,
        platforms,
        type: isFilmTable ? 'film' : source.type || 'series',
        country: source.country || null,
        genres: genreText ? genreText.split(/[,/;]| and /).map((g) => g.trim().toLowerCase()).filter(Boolean) : [],
      });
    }
  }

  // buang duplikat di halaman yang sama
  const seen = new Set();
  return results.filter((r) => {
    const k = `${r.title}|${r.date}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
