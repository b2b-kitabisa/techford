# PJB Jumantik — Master Data + Dashboard (satu project Apps Script)

Satu spreadsheet hanya bisa punya **satu** project Apps Script. Karena itu
pembangun Master Data dan Dashboard digabung di sini. Sebelumnya keduanya
terpisah (`pjb-master-data/` dan `pjb-dashboard/`) dan itu **penyebab menu tidak
muncul**: dua file sama-sama punya `onOpen()`, padahal semua file `.gs` berbagi
satu ruang nama global — yang satu menimpa yang lain, jadi hanya satu menu tampil.

Nama yang dulu bentrok (`onOpen`, `MASTER_SHEET_NAME`, `BULAN_ORDER`,
`normalizeRw_`, `pad2_`) sudah dibereskan: sekarang **nol bentrok**, dan
`onOpen()` hanya ada satu di `Menu.gs`.

Spreadsheet: `1BMrkteaPD-iSNLJ95872MJLJuimr4EjvZcjAd1OASuY`

## Isi project — harus persis 4 file + manifest

| Nama file di Apps Script | Jenis | Isinya |
|---|---|---|
| `Menu.gs` | Script | Satu-satunya `onOpen()` + `doGet()` web app |
| `MasterData.gs` | Script | Pembangun tab "Master Data" dari 30 tab RW |
| `DashboardData.gs` | Script | Pembaca "Master Data" untuk dashboard |
| `Dashboard` | HTML | Tampilan dashboard |
| `appsscript.json` | Manifest | Zona waktu + konfigurasi web app |

---

## LANGKAH PEMASANGAN

### Langkah 1 — Buka editor Apps Script

Di spreadsheet: menu **Extensions** (Ekstensi) → **Apps Script**.
Akan terbuka tab baru berisi editor.

### Langkah 2 — Lihat dulu file apa saja yang sudah ada

Di panel kiri ada daftar **Files**. Kemungkinan besar sekarang ada `Code.gs`,
`DashboardData.gs`, dan `Dashboard.html` (sisa pemasangan dashboard sebelumnya).

### Langkah 3 — HAPUS `Code.gs` yang lama

Ini penting. `Code.gs` lama berisi `onOpen()` dan `doGet()` yang akan bentrok
dengan `Menu.gs`.

Arahkan kursor ke `Code.gs` → klik **⋮** (titik tiga di kanan namanya) → **Delete**.

> Kalau file lamanya bernama lain (mis. `MasterDataBuilder.gs`), hapus juga.
> Yang boleh tersisa hanya file yang ada di tabel di atas.

### Langkah 4 — Buat / timpa keempat file

**`Menu.gs`** — klik **+** di sebelah "Files" → **Script** → ketik nama `Menu`
(tanpa `.gs`) → Enter. Hapus isi bawaannya, tempel isi `Menu.gs`.

**`MasterData.gs`** — klik **+** → **Script** → ketik nama `MasterData` → Enter.
Hapus isi bawaannya, tempel isi `MasterData.gs`.

**`DashboardData.gs`** — kalau sudah ada, klik file itu, blok semua isinya
(Ctrl+A / Cmd+A), tempel isi baru menimpanya. Kalau belum ada, buat lewat
**+** → **Script** dengan nama `DashboardData`.

**`Dashboard`** (HTML) — kalau sudah ada, timpa isinya. Kalau belum:
klik **+** → **HTML** → ketik nama `Dashboard` (**tanpa** `.html`, Apps Script
menambahkannya sendiri) → Enter, lalu tempel isi `Dashboard.html`.

### Langkah 5 — Tampilkan dan timpa `appsscript.json`

Klik ikon **⚙ Project Settings** (gerigi, di panel kiri) → centang
**"Show 'appsscript.json' manifest file in editor"**.

Kembali ke **Editor** (ikon `<>`), sekarang ada file `appsscript.json`.
Klik, timpa isinya dengan isi `appsscript.json` di folder ini.

### Langkah 6 — Simpan

Klik ikon **💾 Save** (atau Ctrl+S / Cmd+S). Pastikan tidak ada tanda error merah.

### Langkah 7 — Muat ulang spreadsheet

Kembali ke tab spreadsheet, tekan **F5** (muat ulang halaman).

`onOpen()` hanya berjalan saat spreadsheet **dibuka**, jadi menu tidak akan
muncul sebelum halaman dimuat ulang.

Setelah itu, di baris menu (sejajar File / Edit / View / Insert) akan muncul:

**🦟 Jumantik PJB** dengan isi:
1. Build / Update Master Data
2. Cek Kelengkapan per RW
3. Buka Dashboard
- Bersihkan Cache Dashboard

---

## LANGKAH PENGGUNAAN

### 1. Bangun Master Data

**🦟 Jumantik PJB → 1. Build / Update Master Data**

Saat pertama kali, Google minta izin akses: klik **Continue** → pilih akun Anda →
klik **Advanced** → **Go to (nama project) (unsafe)** → **Allow**.
(Peringatan "unsafe" itu normal untuk script buatan sendiri yang belum diverifikasi Google.)

Prosesnya butuh beberapa puluh detik. Setelah selesai muncul kotak ringkasan:
total baris, jumlah tab yang diproses, waktu proses, dan catatan kualitas data.

**Yang harus Anda cek:** total baris seharusnya mendekati **4.189** (grand total
pada tab REKAPAN).

### 2. Pastikan semua RW terisi

**🦟 Jumantik PJB → 2. Cek Kelengkapan per RW**

Menampilkan jumlah baris per RW. Kalau ada RW bernilai 0, akan ditandai
`⚠ RW TANPA DATA`.

### 3. Buka dashboard

**🦟 Jumantik PJB → 3. Buka Dashboard** (tampil sebagai dialog).

Untuk dashboard sebagai halaman web sendiri:
**Deploy → New deployment → ⚙ → Web app**, *Execute as*: **Me**,
*Who has access*: sesuaikan → **Deploy**, lalu buka URL yang diberikan.

> Setelah menjalankan Build ulang, klik **Bersihkan Cache Dashboard** supaya
> dashboard membaca data terbaru (hasil baca sheet di-cache 15 menit).

---

## Kalau menu tetap tidak muncul

1. **Sudah muat ulang spreadsheet (F5)?** `onOpen()` hanya jalan saat dibuka.
2. **Sudah klik Save di editor?** Perubahan yang belum disimpan tidak berjalan.
3. **Masih ada file lain yang punya `onOpen()`?** Buka tiap file `.gs`, cari kata
   `onOpen`. Harus ketemu **hanya di `Menu.gs`**.
4. **Ada error merah di editor?** Satu error sintaks membuat seluruh project gagal
   dimuat, dan tidak ada menu yang muncul sama sekali.
5. Uji manual: di editor, pilih fungsi `onOpen` pada dropdown di atas, klik
   **Run**. Kalau ada error, pesannya akan tampil di panel bawah.

---

## Kolom Master Data (23)

`RW · Kelurahan · Nama Kader · Bulan · Tahun · No Urut (asal form) · Tanggal
Pemantauan · Tanggal Mentah (asli) · Nama Pemilik Rumah/Bangunan · Alamat
(Jalan/Blok/No) · RT · Jumlah Container Diperiksa · Jumlah Container Positif (+) ·
Jumlah Container Negatif (-) · Kode Jenis Container Positif Jentik · Bangunan
Negatif (-) Jentik · Tindakan 3M (0/1) · Tindakan Larvasidasi (0/1) · Status Foto ·
Link Foto · Sheet Asal · Baris Sumber · Catatan Kualitas Data`

## Masalah data yang ditangani otomatis

Tab RW asli tidak pernah diubah; semua koreksi dilakukan di memori dan dilaporkan
di kolom `Catatan Kualitas Data`.

- **Foto tidak lagi diambil per sel.** Foto tersimpan sebagai *in-cell image*;
  `getContentUrl()` melempar error untuk gambar unggahan, dan memanggilnya ribuan
  kali menghabiskan batas eksekusi 6 menit — itulah sebabnya versi lama berhenti
  di RW 01 dengan 111 baris. Sekarang keberadaan foto dideteksi dari hasil
  `getValues()` yang sudah dibaca sekali per tab (nol panggilan API tambahan), dan
  kolom `Link Foto` berisi tautan langsung ke sel sumbernya.
- **Blok tanpa baris `JUMLAH`** (RW 16) tidak lagi membocorkan header blok
  berikutnya menjadi baris data.
- **Kolom dipetakan dari header tiap blok**, termasuk label kolom foto yang kosong
  (RW 21, RW 26) dan varian `FOTO-FOTO` (RW 26).
- **Tanggal**: `28 -6-2026` (spasi), `28-6-2026` (bulan 1 digit), `12-06-26`
  (tahun 2 digit), `12-062026` (tanda hubung hilang), `13/07/2026`, dan tahun
  salah ketik (`2038`, `2926`) — semuanya terbaca. Teks aslinya tetap disimpan.

Catatan: ke-30 tab RW ternyata **seragam 13 kolom**; RW 24 identik dengan RW 23
dan RW 25. Yang berbeda antar-tab adalah jumlah dan posisi baris, bukan kolom.

## Perlu diklarifikasi ke kader

`Jumlah Container Positif (+)` banyak bernilai 0 padahal kolom kode kontainer
terisi. Ini bukan kesalahan parser — memang begitu di formulirnya. Kalau kader
sebenarnya mencatat kontainer yang *diperiksa* (bukan yang *positif*), maka
**CI pada dashboard akan under-report** dan perlu dibetulkan di sumbernya sebelum
dipakai untuk pelaporan resmi.
