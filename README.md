# Piylove Movie Schedule

Jadwal tayang film, series, drakor, dracin, dan anime di aplikasi streaming Indonesia: Netflix, Disney+, Prime Video, HBO Max, Viu, iQIYI, WeTV, Viki, Vidio, dan lainnya.

Alamat: https://jadwal.piylove.site

Cara memasang: lihat **PANDUAN.md**.

## Cara kerja

```
Wikipedia ─┐
           ├─> scripts/update-data.mjs ─> data/titles.json ─> scripts/build.mjs ─> dist/ (Cloudflare)
manual.json┤        (GitHub Actions, tiap hari 05.00 WIB)
TMDB ──────┘
```

- `config/sources.json`: halaman Wikipedia yang dibaca
- `config/platforms.json`: daftar platform dan cara mengenalinya
- `data/manual.json`: tambahan dan koreksi manual (selalu menang atas Wikipedia)
- `data/titles.json`: hasil gabungan, dibuat otomatis
- `src/`: CSS, JavaScript, dan ikon web
- Tanpa library luar. Cukup Node.js 18+.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run update-data` | Ambil data terbaru (butuh internet; `TMDB_API_KEY` opsional) |
| `npm run build` | Gabungkan ulang data tersimpan lalu bangun web ke `dist/` |
| `npm test` | Tes pembaca tabel Wikipedia |

Data: Wikipedia (CC BY-SA) dan TMDB. Web ini memakai TMDB API tetapi tidak didukung atau disertifikasi oleh TMDB.
