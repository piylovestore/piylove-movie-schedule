import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseWikiTables } from '../scripts/lib/wiki.mjs';
import { platformMatcher } from '../scripts/lib/util.mjs';

const platforms = JSON.parse(await readFile(new URL('../config/platforms.json', import.meta.url)));
const matchPlatforms = platformMatcher(platforms);
const fx = (n) => readFile(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('Netflix films: tanggal, rowspan, film', async () => {
  const rows = parseWikiTables(await fx('netflix-films.html'), {
    defaultYear: 2026, matchPlatforms, source: { platform: 'netflix', type: 'film' },
  });
  const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
  assert.equal(rows.length, 4, JSON.stringify(rows.map((r) => r.title)));
  assert.equal(byTitle['Possible Love'].date, '2026-11-06');
  assert.equal(byTitle['Never Surrender'].date, '2026-11-12');
  assert.equal(byTitle['On Behalf of My Son'].date, '2026-11-20'); // dari rowspan
  assert.equal(byTitle['Steps'].type, 'film');
  assert.deepEqual(byTitle['Possible Love'].platforms, ['netflix']);
  assert.ok(!byTitle['Untitled project']);
});

test('Drama Korea: header 2 baris, platform dari kolom Network', async () => {
  const rows = parseWikiTables(await fx('korean-tv.html'), {
    defaultYear: 2026, matchPlatforms, source: { type: 'series', country: 'KR', year: 2026 },
  });
  const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
  assert.equal(byTitle['The Remarried Empress'].date, '2026-11-04');
  assert.deepEqual(byTitle['The Remarried Empress'].platforms, ['disney']);
  assert.ok(!byTitle['Happy Anding'], 'tvN bukan platform streaming, harus dilewati');
  assert.deepEqual(byTitle['Merry Berry Love'].platforms, ['netflix']); // rowspan network
  assert.equal(byTitle['Merry Berry Love'].date, '2026-10-07'); // kolom Start, bukan End
  assert.equal(byTitle['Crash (season 2)'].date, '2026-11-16');
});

test('Wikipedia Indonesia: bulan bahasa Indonesia & tanggal belum pasti', async () => {
  const rows = parseWikiTables(await fx('vidio-id.html'), {
    defaultYear: 2026, matchPlatforms, source: { platform: 'vidio', type: 'series', country: 'ID' },
  });
  const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
  assert.equal(byTitle['Jagal Begal'].date, '2026-11-27');
  assert.equal(byTitle['Roh Halu'].precision, 'month');
  assert.equal(byTitle['Roh Halu'].date, '2026-12-01');
  assert.deepEqual(byTitle['Algojo'].genres, ['aksi', 'komedi']);
});
