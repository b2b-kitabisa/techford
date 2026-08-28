# Master Data Builder — PJB Kader Jumantik (per RW)

Script Apps Script untuk menggabungkan seluruh tab per-RW (formulir PJB —
Pemeriksaan Jentik Berkala) di satu spreadsheet menjadi **satu tab "Master
Data"** yang rapi, satu baris per rumah per bulan pemeriksaan.

Spreadsheet sumber: `https://docs.google.com/spreadsheets/d/1BMrkteaPD-iSNLJ95872MJLJuimr4EjvZcjAd1OASuY/...`
Spreadsheet ID: `1BMrkteaPD-iSNLJ95872MJLJuimr4EjvZcjAd1OASuY`

Ini adalah **project Apps Script terpisah** dari `jumantik-dashboard/` —
dashboard untuk data ini akan dibuat menyusul setelah Master Data siap
(datanya beda topik: yang ini per-rumah dari 30 tab RW dengan format
formulir PJB, bukan Google Form biasa).

## Apa yang dilakukan script ini

`buildMasterData()` di `MasterDataBuilder.gs`:

1. Membaca **semua tab yang namanya mengandung "RW" + angka** (RW.01 s/d RW.30), otomatis — tidak perlu diketik satu-satu, jadi tetap jalan walau nanti ada tab RW baru.
2. Melewati tab non-RW seperti tab rekap yang sudah ada.
3. Di tiap tab, mendeteksi setiap "blok bulan" (Juni, Juli, dst — akan otomatis ikut kalau Agustus/bulan berikutnya ditambahkan dengan format form yang sama) berdasarkan isi sel, bukan nomor baris tetap — supaya tetap jalan walau ada tab yang formatnya sedikit bergeser (ditemukan RW.23 punya pola merge sel yang agak beda).
4. Membuang baris "Cont" (baris contoh/template bawaan form) dan baris kosong yang belum diisi.
5. Membersihkan tanggal:
   - Format tanpa tanda hubung seperti `12-062026` diperbaiki jadi `12-06-2026`.
   - Tahun yang salah ketik (ditemukan banyak: `2006`, `2038`, `2058`, `2926`, dst — jelas typo dari `2026`) **diganti otomatis** mengikuti bulan/tahun form yang sedang diproses.
   - Tanggal yang tetap tidak masuk akal dicatat di kolom **"Catatan Kualitas Data"**, tapi teks aslinya tetap disimpan utuh di kolom "Tanggal Mentah (asli)" — tidak ada data yang hilang, hanya ditandai untuk dicek manual.
6. Menulis hasil ke tab **"Master Data"** dengan 21 kolom (RW, Kelurahan, Nama Kader, Bulan, Tahun, tanggal, nama pemilik rumah, alamat, RT, jumlah container diperiksa/positif/negatif, kode kontainer positif, tindakan 3M/larvasidasi, dokumentasi, sheet asal, catatan kualitas data).

**Tab RW asli tidak pernah diubah.** Setiap dijalankan, tab "Master Data" dihapus total dan ditulis ulang dari nol — jadi aman dijalankan berkali-kali tiap kali ada bulan baru yang diisi di tab RW.

## Langkah setup (clasp)

### 1. Prasyarat (kalau belum, sama seperti project `jumantik-dashboard/` sebelumnya)

```bash
npm install -g @google/clasp
clasp login
```

Pastikan juga Apps Script API aktif: https://script.google.com/home/usersettings → ON.

### 2. Ambil folder ini

Clone/pull branch `claude/looker-studio-dashboard-8eupjr`, masuk ke folder `pjb-master-data/`.

### 3. Buat project Apps Script yang terikat ke spreadsheet PJB ini

```bash
cd pjb-master-data
clasp create --type sheets --title "PJB Master Data Builder" --parentId 1BMrkteaPD-iSNLJ95872MJLJuimr4EjvZcjAd1OASuY --rootDir .
```

### 4. Push kode

```bash
clasp push
```

### 5. Jalankan

**Cara termudah:** buka spreadsheet-nya di browser, reload halaman (F5) — akan muncul menu baru **"🦟 Jumantik PJB"** di menu bar, klik **Build / Update Master Data**. Saat pertama kali klik, Google akan minta izin akses ke spreadsheet — klik **Allow/Izinkan**.

**Alternatif via editor:**
```bash
clasp open
```
Lalu di Apps Script editor, pilih function `buildMasterData` di dropdown atas, klik **Run**. Izinkan permission saat diminta pertama kali.

Setelah selesai akan muncul ringkasan jumlah baris per tab yang berhasil diproses.

### 6. Setiap ada tab/bulan baru ditambahkan

Cukup jalankan lagi **Build / Update Master Data** dari menu — tidak perlu push ulang kode kecuali Anda mengubah `MasterDataBuilder.gs`-nya.

## Cek hasil & data yang perlu ditinjau manual

Setelah Master Data terbentuk, filter/urutkan kolom **"Catatan Kualitas Data"**
untuk melihat baris mana saja yang tanggalnya perlu dicek manual ke form
aslinya (baris ini tetap ikut masuk ke Master Data, tidak dibuang, supaya
tidak ada data hilang).

## Langkah selanjutnya

Setelah Master Data ini siap dan Anda cek datanya sudah sesuai, beri tahu
saya — saya akan buatkan dashboard (KPI ABJ/CI per RW, tren bulanan, ranking
RW berisiko, dll) yang membaca dari tab "Master Data" ini, sama seperti
`jumantik-dashboard/` sebelumnya.
