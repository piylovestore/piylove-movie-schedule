# Panduan memasang Piylove Movie Schedule

Ikuti urutan ini sekali saja. Setelah selesai, web **jadwal.piylove.site** akan online dan memperbarui datanya sendiri tiap hari jam 05.00 WIB.

Perkiraan waktu: 30–45 menit. Tidak perlu install apa pun di laptop, semua lewat browser.

---

## 1. Siapkan tiga akun

| Akun | Daftar di | Biaya |
|---|---|---|
| GitHub (tempat menyimpan kode) | https://github.com/signup | Gratis |
| Cloudflare (tempat web online) | https://dash.cloudflare.com/sign-up | Gratis |
| TMDB (poster, sinopsis, trailer) | https://www.themoviedb.org/signup | Gratis |

### Ambil API key TMDB
1. Login ke TMDB, buka **Settings → API** (https://www.themoviedb.org/settings/api).
2. Klik **Create** / **Request an API key**, pilih **Developer**, setujui ketentuannya.
3. Isi formulir. Type of use: *Website*. Application URL: `https://jadwal.piylove.site`. Ringkasan: "Website jadwal tayang film dan series streaming di Indonesia."
4. Setelah disetujui, salin **API Read Access Token** (teks panjang yang diawali `eyJ...`). Simpan dulu, nanti dipakai di langkah 4.

> Kalau nanti web ini dipasangi iklan atau menghasilkan uang, cek ketentuan penggunaan komersial TMDB.

---

## 2. Upload kode ke GitHub

1. Ekstrak file **piylove-movie-schedule.zip** di laptop.
2. Di GitHub, klik **+** (pojok kanan atas) → **New repository**.
   - Repository name: `piylove-movie-schedule`
   - Pilih **Public** atau **Private** (dua-duanya bisa)
   - Jangan centang "Add a README"
   - Klik **Create repository**
3. Di halaman repo yang masih kosong, klik tautan **uploading an existing file**.
4. Buka folder hasil ekstrak, **pilih semua isinya** (folder `config`, `data`, `scripts`, `src`, `test`, dan file `package.json`, `PANDUAN.md`, `README.md`), lalu drag & drop ke halaman GitHub.
   - Yang di-upload adalah *isi* foldernya, bukan folder `piylove-movie-schedule` itu sendiri.
5. Tunggu semua file selesai ter-upload, lalu klik **Commit changes**.

Cek: di halaman utama repo harus terlihat folder `config`, `data`, `scripts`, `src`, `test` dan file `package.json`.

---

## 3. Buat file update otomatis (copy-paste)

Folder `.github` biasanya tidak ikut ter-upload karena tersembunyi. Buat manual:

1. Di halaman repo, klik **Add file → Create new file**.
2. Di kotak nama file, ketik persis: `.github/workflows/update-data.yml`
   (saat mengetik `/`, GitHub otomatis membuat foldernya).
3. Salin seluruh isi di bawah ini ke kotak isi file:

```yaml
name: Update data jadwal

on:
  schedule:
    - cron: "0 22 * * *" # setiap hari jam 05.00 WIB
  workflow_dispatch: # tombol "Run workflow" untuk menjalankan manual
  push:
    paths:
      - "data/manual.json"
      - "config/**"

permissions:
  contents: write

concurrency:
  group: update-data
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Tes pembaca Wikipedia
        run: npm test

      - name: Ambil data terbaru
        env:
          TMDB_API_KEY: ${{ secrets.TMDB_API_KEY }}
        run: node scripts/update-data.mjs

      - name: Simpan perubahan
        run: |
          git config user.name "piylove-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data
          if git diff --staged --quiet; then
            echo "Tidak ada perubahan data."
          else
            git commit -m "Update data jadwal $(TZ=Asia/Jakarta date +'%Y-%m-%d %H:%M') WIB"
            git push
          fi
```

4. Klik **Commit changes** → **Commit changes**.

---

## 4. Simpan API key TMDB dan izinkan update otomatis

### Simpan API key
1. Di repo, buka **Settings** → **Secrets and variables** → **Actions**.
2. Klik **New repository secret**.
   - Name: `TMDB_API_KEY`
   - Secret: tempel API Read Access Token dari langkah 1
3. Klik **Add secret**.

### Izinkan workflow menyimpan data
1. Masih di **Settings**, buka **Actions** → **General**.
2. Di bagian **Workflow permissions**, pilih **Read and write permissions**.
3. Klik **Save**.

### Jalankan pertama kali
1. Buka tab **Actions** di repo. Kalau ada tombol hijau untuk mengaktifkan workflow, klik dulu.
2. Pilih **Update data jadwal** di kiri → **Run workflow** → **Run workflow**.
3. Tunggu 1–3 menit sampai ada tanda centang hijau.

Cek: buka file `data/titles.json` di repo. Kalau berhasil, judul-judulnya sekarang punya `poster` dan ada judul tambahan dari Wikipedia.

---

## 5. Online-kan di Cloudflare

1. Login ke https://dash.cloudflare.com.
2. Buka **Workers & Pages** → **Create** → pilih tab **Pages** → **Connect to Git**.
3. Klik **Connect GitHub**, izinkan Cloudflare mengakses repo `piylove-movie-schedule`.
4. Pilih repo tersebut → **Begin setup**, lalu isi:
   - Project name: `piylove-movie-schedule`
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Klik **Save and Deploy**, tunggu sekitar 1 menit.

Web sudah online di alamat `https://piylove-movie-schedule.pages.dev`. Setiap kali data di GitHub berubah (tiap hari), Cloudflare otomatis membangun ulang webnya.

> **Kalau dashboard Cloudflare hanya menawarkan "Workers"** (tidak ada tab Pages): pilih *Import a repository*, pilih repo yang sama, isi Build command `npm run build` dan Deploy command:
> `npx wrangler deploy --assets=./dist --name=piylove-movie-schedule --compatibility-date=2026-01-01`

---

## 6. Pasang alamat jadwal.piylove.site

1. Di Cloudflare, buka project **piylove-movie-schedule** → tab **Custom domains** → **Set up a custom domain**.
2. Ketik `jadwal.piylove.site` → **Continue**.
3. Lalu salah satu dari ini:
   - **Kalau domain piylove.site sudah dikelola di Cloudflare:** klik **Activate domain**. Selesai.
   - **Kalau domain piylove.site masih dikelola di tempat beli domain:** buka pengaturan DNS di sana, tambahkan record:
     - Type: `CNAME`
     - Name/Host: `jadwal`
     - Value/Target: `piylove-movie-schedule.pages.dev`

     Kembali ke Cloudflare dan tunggu statusnya menjadi **Active** (biasanya beberapa menit, paling lama 24 jam).

Domain utama piylove.site tidak terganggu.

---

## 7. Daftarkan ke Google (supaya muncul di pencarian)

1. Buka https://search.google.com/search-console dan tambahkan properti **URL prefix**: `https://jadwal.piylove.site`.
2. Verifikasi. Cara termudah: pilih metode *HTML tag*, lalu kirim kodenya ke Claude supaya dipasangkan, atau pakai metode *DNS* kalau domain di Cloudflare.
3. Buka **Sitemaps**, masukkan `sitemap.xml`, klik **Submit**.

Biasanya butuh beberapa hari sampai beberapa minggu sebelum halaman mulai muncul di Google.

---

## Sehari-hari

**Tidak perlu melakukan apa-apa.** Tiap jam 05.00 WIB jadwal diambil ulang dari Wikipedia, poster dan sinopsis dari TMDB, lalu web diperbarui otomatis.

### Menambah atau memperbaiki judul secara manual
Wikipedia tidak mencatat semua judul, terutama platform lokal seperti Vidio. Untuk menambah atau mengoreksi:

1. Di GitHub, buka `data/manual.json` → klik ikon pensil (Edit).
2. Tambahkan entri baru, misalnya:

```json
{ "title": "Jagal Begal", "date": "2026-12-04", "type": "series", "platforms": ["vidio"], "country": "ID", "genres": ["aksi"], "synopsis": "Tulis sinopsis singkat di sini." },
```

3. Klik **Commit changes**. Dalam beberapa menit web ikut diperbarui.

Isian yang bisa dipakai:

| Isian | Keterangan |
|---|---|
| `title` | Judul (wajib) |
| `date` | Tanggal tayang `YYYY-MM-DD` (wajib) |
| `precision` | Isi `"month"` kalau baru tahu bulannya saja |
| `type` | `"film"` atau `"series"` |
| `season` | Nomor musim, misalnya `3` |
| `platforms` | Daftar kode platform (lihat di bawah) |
| `country` | Kode negara: `KR` Korea, `CN` China, `JP` Jepang, `ID` Indonesia, `US` Amerika, dst. |
| `genres` | Daftar genre bebas, misalnya `["romansa", "komedi"]` |
| `synopsis` | Sinopsis singkat versi kamu (lebih diutamakan daripada sinopsis TMDB) |
| `note` | Catatan tambahan, misalnya "Episode baru tiap Sabtu" |
| `match` | Judul versi Wikipedia, kalau penulisannya beda dengan `title` |
| `hidden` | Isi `true` untuk menyembunyikan judul yang salah dari Wikipedia |

Kode platform: `netflix`, `disney`, `prime`, `hbo`, `apple`, `viu`, `iqiyi`, `wetv`, `viki`, `vidio`, `catchplay`, `bstation`, `crunchyroll`, `visionplus`, `klikfilm`.

Hati-hati dengan tanda koma: setiap entri dipisah koma, tapi entri terakhir sebelum `]` tidak boleh diakhiri koma. Kalau ragu, kirim saja daftar judulnya ke Claude.

### Menambah sumber Wikipedia
Daftar halaman Wikipedia yang dibaca ada di `config/sources.json`. Halaman yang tidak ditemukan otomatis dilewati.

---

## Kalau ada masalah

| Masalah | Solusi |
|---|---|
| Workflow di tab Actions berwarna merah | Klik workflow-nya, lihat langkah yang gagal. "TMDB menolak API key" berarti secret `TMDB_API_KEY` salah. "Permission denied" berarti langkah 4 bagian *Workflow permissions* belum diatur. |
| Poster tidak muncul | API key TMDB belum diisi, atau judulnya belum terdaftar di TMDB. Placeholder berwarna akan tampil sampai poster tersedia. |
| Sebuah judul hilang atau tanggalnya salah | Tambahkan atau koreksi lewat `data/manual.json`. Isian di sana selalu menang atas Wikipedia. |
| Update otomatis berhenti | GitHub menonaktifkan jadwal otomatis kalau repo tidak ada aktivitas 60 hari. Buka tab Actions dan aktifkan lagi. |
| Cloudflare gagal build | Pastikan Build command `npm run build` dan output `dist`. |
