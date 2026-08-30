# Master Data Builder — PJB Kader Jumantik

Menggabungkan seluruh tab per-RW (formulir PJB — Pemeriksaan Jentik Berkala)
menjadi satu tab **"Master Data"**: satu baris per rumah per bulan.

Spreadsheet: `1BMrkteaPD-iSNLJ95872MJLJuimr4EjvZcjAd1OASuY`

Tab RW asli **tidak pernah diubah**. Tab "Master Data" ditulis ulang dari nol
setiap kali dijalankan, jadi aman diulang kapan saja.

## Kenapa versi sebelumnya menghasilkan data tidak sinkron

Hasil pemeriksaan langsung ke spreadsheet:

| Gejala | Penyebab sebenarnya |
|---|---|
| Master Data hanya **111 baris, semuanya RW 01** (padahal REKAP = 4.189) | Script mengambil foto **sel per sel**. Untuk ribuan baris, ini menghabiskan **batas eksekusi 6 menit** Apps Script sebelum sampai RW 02, jadi 29 RW tidak pernah tertulis. |
| 21 baris berisi `Foto gagal disalin: ... getContentUrl on object SpreadsheetApp.CellImage` | Foto tersimpan sebagai **in-cell image** (bukan URL, bukan `=IMAGE()`). Untuk gambar unggahan, `getContentUrl()` memang melempar error dan `getUrl()` mengembalikan null. |
| Tanggal banyak yang kosong / salah | Parser lama hanya menerima `dd-mm-yyyy`. Data asli jauh lebih beragam. |

**RW 24 ternyata bukan penyebabnya.** Ke-30 tab sudah diperiksa satu per satu:
semuanya persis **13 kolom dengan urutan identik**, dan header RW 24 sama
byte-for-byte dengan RW 23 dan RW 25. Yang benar-benar berbeda adalah **jumlah
baris dan posisi blok**, bukan kolom:

- **RW 16** — blok pertama kehilangan baris `JUMLAH` dan blok tanda tangannya
- **RW 18** — blok kedua mulai 7 baris lebih bawah dari tab lain
- **RW 29** — blok kedua bergeser 3 baris, 105 baris data
- **RW 21** — 101 baris data; label kolom ke-13 kosong
- **RW 26** — kolom ke-13 tertulis `DOKUMETASI (FOTO-FOTO PEMERIKSAAN)`

Parser lama berhenti membaca blok hanya saat menemukan baris `JUMLAH`. Pada RW 16
penanda itu tidak ada, sehingga header blok berikutnya ikut terbaca sebagai data.

## Yang diperbaiki

1. **Foto tidak lagi diambil per sel.** `getValues()` yang sudah dibaca sekali per
   tab sudah mengembalikan objek `CellImage` untuk gambar tersisip, jadi
   keberadaan foto dideteksi gratis dari situ — **nol panggilan API tambahan**,
   sehingga proses tidak lagi kehabisan waktu. `getContentUrl()` sengaja tidak
   pernah dipanggil.
2. **Kolom foto jadi dua kolom yang berguna:**
   - `Status Foto` — `Ada foto` / `Tidak ada foto` / `Catatan teks`
   - `Link Foto` — **tautan langsung ke sel sumbernya**
     (`...#gid=<gid>&range=M42`). Sekali klik, sel berisi fotonya terbuka.
     Kalau foto berasal dari `=IMAGE(url)` atau berupa URL teks, URL aslinya yang dipakai.
3. **Penutup blok lebih tahan banting** — blok berakhir di `JUMLAH`, **atau** saat
   header blok berikutnya muncul, **atau** saat baris legenda/tanda tangan
   (`Keterangan`, `Kode Jenis`, `Mengetahui`, `FORMULIR`, …). Ini yang membuat
   RW 16 terbaca benar.
4. **Kolom dipetakan dari baris header tiap blok**, bukan posisi tetap — termasuk
   menangani label kolom ke-13 yang kosong (RW 21, RW 26) dan varian
   `FOTO-FOTO` (RW 26), serta salah ketik `DOKUMETASI` di sumbernya.
5. **Tanggal jauh lebih toleran.** Format yang kini terbaca:

   | Ditemukan di | Contoh | Hasil |
   |---|---|---|
   | RW 24 | `28 -6-2026` (ada spasi) | `2026-06-28` |
   | RW 24 | `28-6-2026` (bulan 1 digit) | `2026-06-28` |
   | RW 25 | `12-06-26` (tahun 2 digit) | `2026-06-12` |
   | RW 01 | `12-062026` (tanda hubung hilang) | `2026-06-12` |
   | berbagai | `19-06-2038` (tahun salah ketik) | `2026-06-19` |
   | berbagai | `13/07/2026` | `2026-07-13` |

   Tahun yang tidak cocok dikoreksi mengikuti kolom `Tahun` pada form. Kalau bulan
   tidak cocok kolom `Bulan` **tetapi** hari & bulannya kalau ditukar jadi cocok,
   keduanya ditukar. Kalau tetap tidak cocok, tanggalnya **tetap disimpan** dan
   diberi catatan — tidak dibuang.
6. **Teks tanggal asli tetap disimpan** di kolom `Tanggal Mentah (asli)`, dan tiap
   koreksi dicatat di kolom `Catatan Kualitas Data`. Tidak ada data yang hilang diam-diam.
7. **Menu "Cek Kelengkapan per RW"** — menampilkan jumlah baris per RW dan
   menandai RW yang kosong, supaya ketimpangan seperti kemarin langsung ketahuan.

## Kolom Master Data (23)

`RW · Kelurahan · Nama Kader · Bulan · Tahun · No Urut (asal form) · Tanggal
Pemantauan · Tanggal Mentah (asli) · Nama Pemilik Rumah/Bangunan · Alamat
(Jalan/Blok/No) · RT · Jumlah Container Diperiksa · Jumlah Container Positif (+) ·
Jumlah Container Negatif (-) · Kode Jenis Container Positif Jentik · Bangunan
Negatif (-) Jentik · Tindakan 3M (0/1) · Tindakan Larvasidasi (0/1) · Status Foto ·
Link Foto · Sheet Asal · Baris Sumber · Catatan Kualitas Data`

## Cara menjalankan

Kalau script sudah terpasang: reload spreadsheet → menu **🦟 Jumantik PJB →
Build / Update Master Data**. Setelah selesai muncul ringkasan jumlah baris per
tab beserta catatan kualitas data. Lalu jalankan **Cek Kelengkapan per RW** untuk
memastikan semua 30 RW terisi.

Kalau belum terpasang, tempel `MasterDataBuilder.gs` dan `appsscript.json`
ke Apps Script editor spreadsheet ini, atau lewat clasp:

```bash
cd pjb-master-data
clasp create --type sheets --title "PJB Master Data Builder" --parentId 1BMrkteaPD-iSNLJ95872MJLJuimr4EjvZcjAd1OASuY --rootDir .
clasp push
```

## Setelah dijalankan, mohon cek

- **Jumlah total** mendekati 4.189 (angka grand total pada tab REKAP). Kalau masih
  jauh, jalankan **Cek Kelengkapan per RW** untuk melihat RW mana yang kosong.
- **Kolom `Catatan Kualitas Data`** — urutkan/filter kolom ini untuk melihat baris
  yang tanggalnya perlu dicek manual ke formulir aslinya.
- **`Jumlah Container Positif (+)` yang banyak bernilai 0 padahal kolom kode
  kontainer terisi.** Ini bukan bug parser — memang begitu di formulirnya. Kalau
  kader sebenarnya mencatat kontainer yang *diperiksa* (bukan yang *positif*),
  maka **CI pada dashboard akan under-report** dan perlu diklarifikasi ke kader
  sebelum dipakai untuk pelaporan resmi.
