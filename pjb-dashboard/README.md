# Dashboard PJB — Kader Jumantik

Dashboard interaktif read-only untuk data PJB (Pemeriksaan Jentik Berkala),
dibangun murni dengan Google Apps Script + HtmlService. Membaca tab **"Master
Data"** pada spreadsheet PJB dan tidak pernah menulis apa pun ke sheet.

Spreadsheet sumber: `1BMrkteaPD-iSNLJ95872MJLJuimr4EjvZcjAd1OASuY`

## Cara pasang (tempel manual)

1. Buka spreadsheet PJB → menu **Extensions → Apps Script**.
2. Buat/isi **4 file** berikut. Nama file harus persis seperti ini:

   | File di Apps Script | Cara membuat | Isi dari |
   |---|---|---|
   | `Code.gs` | sudah ada secara default — hapus isinya, timpa | `Code.gs` |
   | `DashboardData.gs` | **+ → Script** | `DashboardData.gs` |
   | `Dashboard.html` | **+ → HTML** (ketik nama `Dashboard`, tanpa `.html`) | `Dashboard.html` |
   | `appsscript.json` | **⚙ Project Settings → centang** "Show `appsscript.json` manifest file" | `appsscript.json` |

3. Klik **Simpan** (ikon disket).
4. **Deploy → New deployment → ⚙ → Web app**
   - *Execute as*: **Me**
   - *Who has access*: sesuaikan kebutuhan (mis. *Anyone with Google account*)
   - klik **Deploy**, lalu **Authorize access** dan izinkan (wajar — script perlu izin baca spreadsheet Anda).
5. Buka URL web app yang muncul.

> Alternatif tanpa deploy: reload spreadsheet, akan muncul menu **📊 Dashboard PJB → Buka Dashboard** yang menampilkan dashboard sebagai dialog. Berguna untuk mencoba cepat.

Kalau pakai clasp: `clasp create --type sheets --parentId 1BMrkteaPD-iSNLJ95872MJLJuimr4EjvZcjAd1OASuY --rootDir .` lalu `clasp push`.

## Isi dashboard

**Filter (satu baris di atas, menaungi seluruh isi halaman)** — semua chart, KPI, dan tabel ikut berubah:
rentang tanggal (+ preset Semua / Bulan terakhir / 30 hari / 90 hari), RW, RT, Kader,
status bangunan (positif/bebas jentik), dan status tindakan (sudah/belum/3M saja/larvasidasi saja).

**Ringkasan** — ABJ (angka utama), CI, bangunan diperiksa, bangunan positif, dan
jumlah bangunan positif yang belum ditindaklanjuti.

**Tren per bulan** — ABJ dan CI dibuat sebagai dua chart terpisah dengan garis
target masing-masing (bukan satu chart dua sumbu, yang akan menyesatkan karena
skalanya beda jauh).

**ABJ per RW** — bar diverging dengan baseline di target 95%. Rentang ABJ antar-RW
sempit (mis. 89–98%); pada skala 0–100 semua bar akan tampak sama panjang, jadi
yang digambar adalah *selisih poin terhadap target* supaya perbedaannya terbaca.

**Heatmap ABJ per RW per bulan** — skala diverging merah↔biru dengan titik netral
di 95%. Punya area gulir sendiri; label bulan & kolom RW tetap menempel saat digulir.

**Jenis kontainer, kepatuhan tindakan, volume harian, kinerja kader**, dan
**daftar tindak lanjut** bangunan positif (bisa dicari dan disalin ke clipboard
sebagai TSV — langsung bisa di-paste ke Sheets).

Setiap chart punya tombol **Tabel** untuk menampilkan angkanya sebagai tabel.

## Catatan teknis

- **Warna** sudah divalidasi aman untuk buta warna (pasangan biru↔merah, ΔE CVD 23,8 pada mode terang dan 25,7 pada mode gelap). Warna tidak pernah jadi satu-satunya penanda — setiap baris berisiko juga diberi ikon + teks ("▲ Risiko" / "✓ Target").
- **Mode gelap** mengikuti setelan sistem.
- Seluruh data dikirim sekali ke browser lalu difilter di sisi klien, jadi setiap perubahan filter langsung tampil tanpa menunggu server. Hasil baca sheet di-cache 15 menit; tombol **Muat ulang data** memaksa baca ulang.

## Masalah data yang ditangani otomatis

Dashboard tidak mengubah sheet — semua koreksi di bawah ini dilakukan di memori,
dan jumlahnya dilaporkan di kotak "Catatan kualitas data" di bawah KPI:

1. **Tanggal hari/bulan tertukar.** Versi `Code.gs` pembuat Master Data membaca `dd-mm-yyyy` sebagai `mm-dd-yyyy`, sehingga `08-06-2026` (8 Juni) tersimpan sebagai `2026-08-06` (6 Agustus). Kolom `Bulan` pada baris yang sama dipakai sebagai acuan kebenaran: kalau bulan tidak cocok tapi tanggalnya cocok, keduanya ditukar balik.
2. **Tahun salah ketik** (`2038`, `2058`, `2926`, …) diganti mengikuti kolom `Tahun`.
3. **Tanggal yang tetap tidak masuk akal** ditandai dan dikeluarkan hanya jika filter tanggal sedang aktif (tetap ikut pada agregat bulanan).
4. **Kode kontainer** seperti `18(Galon)` atau `2,7,13,galon` dipecah jadi kode 1–18; token teks bebas dihitung terpisah sebagai catatan.
5. **Nama kolom dicocokkan secara longgar**, jadi dashboard tetap jalan kalau header Master Data sedikit berubah.

### Yang sebaiknya Anda perbaiki di sumbernya

- **Perbaiki parsing tanggal di script pembuat Master Data** agar `dd-mm-yyyy` dibaca benar. Selama belum diperbaiki, dashboard tetap akurat, tapi kolom `Tanggal Pemantauan` di sheet masih salah untuk dipakai keperluan lain.
- **`Jumlah Container Positif (+)` banyak yang 0 padahal kolom kode kontainer terisi.** Kalau kader sebenarnya mencatat kontainer yang *diperiksa* (bukan yang positif), maka **CI yang tampil under-report** dan judul "Jenis kontainer tercatat" memang sengaja tidak menyebut "positif". Ini perlu diklarifikasi ke kader sebelum CI dipakai untuk pelaporan resmi.
- Kolom **`Dokumentasi (Foto Pemeriksaan)`** banyak berisi pesan error `Foto gagal disalin: ... CellImage`. Tidak dipakai dashboard, tapi sebaiknya dibersihkan.
