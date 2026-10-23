# Web App Input Kader Jumantik — Kelurahan Cipondoh

Web app Apps Script untuk kader PJB mengisi pemeriksaan jentik langsung dari HP,
dipakai mulai periode **November 2026**. Dua halaman dalam satu project:
halaman kader (masuk dengan nama + PIN) dan halaman admin (akun `@kitabisa.com`).

Rancangan dan alasan di balik keputusannya ada di
[`../pjb-kader-webapp/rancangan.html`](rancangan.html) — versi terbitnya bisa dibuka
di claude.ai sebagai artefak.

## Isi project

| Berkas | Isinya |
| --- | --- |
| `Config.gs` | Konstanta: ID spreadsheet sumber, nama sheet, legenda 20 container, domain admin |
| `Db.gs` | Akses sheet, cache, kunci tulis, aturan periode |
| `Setup.gs` | Menu spreadsheet, penyiapan database, impor data Agustus |
| `Api.gs` | Semua fungsi yang dipanggil dari HP dan halaman admin |
| `Foto.gs` | Unggah foto ke Drive + penjagaan foto ganda |
| `MasterData.gs` | Menyusun tab `Master Data` untuk dashboard |
| `Code.gs` | `doGet()` — memilih halaman kader atau admin |
| `Kader.html` | Tampilan kader |
| `Admin.html` | Tampilan admin |
| `appsscript.json` | Manifest: zona waktu, izin, pengaturan web app |

---

## Pemasangan

### Langkah 1 — Buat spreadsheet database

Buat spreadsheet **baru** (kosong), beri nama misalnya
`PJB Cipondoh — Database`. Spreadsheet inilah yang menampung seluruh data
November dan seterusnya. Spreadsheet Agustus tidak diubah sama sekali —
hanya dibaca satu kali saat impor.

### Langkah 2 — Tempel seluruh berkas

Di spreadsheet itu: **Ekstensi › Apps Script**. Hapus isi `Code.gs` bawaan,
lalu buat berkas berikut dan tempel isinya **utuh**:

- 7 berkas **Script** (`+` → Script): `Config`, `Db`, `Setup`, `Api`, `Foto`,
  `MasterData`, `Code` — tanpa menulis `.gs`, Apps Script menambahkannya sendiri.
- 2 berkas **HTML** (`+` → HTML): `Kader`, `Admin` — tanpa menulis `.html`.

> Tempel satu berkas secara utuh. Satu berkas yang terpotong membuat **seluruh**
> project gagal dimuat dan menunya tidak muncul.

Lalu **⚙ Project Settings** → centang *"Show appsscript.json manifest file"* →
kembali ke Editor → timpa isi `appsscript.json` dengan berkas di folder ini.

Simpan (Ctrl/Cmd + S), lalu **muat ulang tab spreadsheet** (F5).

### Langkah 3 — Siapkan dan isi database

Menu **🦟 PJB Cipondoh** akan muncul:

1. **Siapkan database** — membuat sheet `Kader`, `Rumah`, `Periode`,
   `FotoIndex`, `Log`, dan `Entri 2026-11`.
2. **Impor rumah & riwayat Agustus** — membaca `Master Data` spreadsheet Agustus
   (`1vmWrnQe…`), lalu mengisi 25 akun kader, 1.250 rumah, dan riwayat Agustus.
   PIN awal diacak dan langsung terlihat di sheet `Kader`.
3. **Pasang pemicu terjadwal** — `Master Data` dibangun ulang tiap 15 menit.

Saat pertama dijalankan Google meminta izin: **Advanced › Go to project (unsafe)
› Allow**. Normal untuk script buatan sendiri.

### Langkah 4 — Deploy (CUKUP SATU deployment)

Deploy → **New deployment** → ikon ⚙ di kiri atas → **Web app** → isi:

| Isian | Nilai |
| --- | --- |
| Description | `Jumantik Cipondoh` |
| Execute as | **Me** (`b2b@kitabisa.com`) |
| Who has access | **Anyone** |

→ **Deploy** → **Authorize access** → pilih akun → Advanced → Go to project (unsafe) → Allow.

Salin **Web app URL** yang muncul. Itu saja yang dibutuhkan:

- **Kader** → tautan apa adanya
- **Admin** → tautan yang sama **ditambah** `?page=admin` di belakangnya

Contoh:

```
https://script.google.com/macros/s/AKfycb.../exec              ← kader
https://script.google.com/macros/s/AKfycb.../exec?page=admin   ← admin
```

> **Kenapa "Anyone", bukan "Anyone within Kitabisa"?**
> Kader tidak punya akun Google kerja, jadi halaman kader harus bisa dibuka siapa
> saja yang punya tautannya. Itu tetap aman untuk halaman admin: karena pemilik
> script dan para admin sama-sama di domain `kitabisa.com`, `Session.getActiveUser()`
> tetap mengembalikan email pengunjung yang sedang masuk dengan akun kitabisa.com.
> Pengunjung anonim atau dari luar domain mengembalikan string kosong, lalu ditolak
> oleh `pjbAdminBoleh_()`. Jadi `?page=admin` hanya terbuka untuk akun kitabisa.com
> yang sedang masuk di peramban itu.

**Kalau halaman admin menolak padahal sudah pakai akun kitabisa.com:** peramban itu
kemungkinan sedang aktif di profil/akun lain. Halaman penolakannya menyebut akun mana
yang sedang terbaca — buka tautannya di jendela yang sudah masuk akun kerja.

#### Setiap kali kode diperbarui

**Deploy → Manage deployments → pilih deployment yang ada → ikon ✏️ pensil →
Version: New version → Deploy.** Tautannya tetap sama, jadi kader tidak perlu
diberi tautan baru.

Jangan memakai "New deployment" untuk pembaruan — itu membuat deployment baru
dengan tautan baru.

#### Kalau sudah terlanjur punya dua deployment

Di **Manage deployments**, satu deployment yang terarsip bisa dibiarkan saja —
tidak mengganggu. Yang dipakai cukup yang **Active**. Kalau ingin merapikan,
arsipkan yang tidak terpakai lewat ikon ⋮ → **Archive**. Deployment yang terarsip
tautannya berhenti bekerja, jadi pastikan yang diarsipkan bukan yang sedang
dibagikan ke kader.

### Langkah 5 — Bagikan ke kader

Kirim Web app URL (tanpa `?page=admin`) lewat WhatsApp. Di HP: buka tautannya →
menu peramban → **Tambahkan ke layar utama**. Setelah itu terlihat dan terbuka
seperti aplikasi biasa.

### Langkah 6 — Sambungkan ke dashboard

Di project Apps Script dashboard (`pjb-apps-script/DashboardData.gs`), tambahkan
satu baris pada `DD_EXTRA_SOURCES` dengan ID spreadsheet database ini:

```js
var DD_EXTRA_SOURCES = [
  { id: '1nJVy-m1L1Iw5DrtAIVDK_k3yWGg5SE8mtIpr86pqFmk', label: 'Tangerang' },
  { id: '<ID spreadsheet database ini>',                 label: 'Tangerang (web app)' }
];
```

---

## Cara kerja

### Masuk

Kader memilih namanya dari daftar lalu memasukkan PIN 4 angka. HP diingat lewat
penyimpanan lokal, jadi PIN hanya ditanya sekali.

Tombol **Lupa** bertingkat: sekali tekan memberi dua angka terakhir, tekan lagi
memperlihatkan PIN penuh.

> **Yang perlu disadari:** karena PIN bisa dimunculkan sendiri, PIN ini berfungsi
> sebagai pencegah salah akun, bukan kunci. Siapa pun yang punya tautannya bisa
> melihat PIN kader mana pun. Penyeimbangnya: setiap pemunculan PIN penuh dicatat
> di sheet `Log` dan jumlahnya terlihat di kolom **PIN dilihat** halaman admin;
> dan kewenangan mengubah data ada di halaman admin, yang mengenali pengunjung
> lewat akun Google-nya dan hanya menerima domain `kitabisa.com`.

### Urutan isian per rumah

1. Rumah bisa diperiksa? Kalau tidak — pilih alasan, selesai. Tidak dihitung
   sebagai bangunan diperiksa, tapi tetap tercatat dan terlihat admin.
2. Berapa container diperiksa (tombol − dan +).
3. Container apa saja — 20 jenis sesuai legenda formulir. Jenis yang sama boleh
   dipilih dua kali; penghitung "2 dari 2" memastikan jumlahnya cocok.
   Memilih **Lain-lain** memunculkan isian teks bebas.
4. Ada jentiknya? Kalau ada, yang muncul **hanya container yang tadi dipilih**.
   Jumlah container positif dihitung dari sana — kader tidak pernah mengetik angka.
5. 4M+, larvasidasi, pengelolaan sampah, kerja bakti — Ya / Tidak.
6. Foto: **ambil langsung dari kamera** atau **pilih dari galeri**. Setelah
   terunggah, foto dan nama berkasnya tampil supaya kader bisa memastikan
   tidak salah ambil.

Entri yang sudah tersimpan terkunci; harus menekan **✎ Ubah** dulu sebelum bisa
diperbaiki.

### Memilih bulan

Dropdown bulan di beranda. Bulan yang sudah terkunci diberi label dan hanya bisa
dilihat.

**Aturan kunci:** satu periode bisa diubah selama bulannya berjalan dan sepanjang
bulan berikutnya, lalu terkunci otomatis pada tanggal 1 dua bulan setelahnya.

| Periode | Bisa diubah sampai | Status saat November 2026 |
| --- | --- | --- |
| Agustus 2026 | 30 September 2026 | Terkunci |
| September 2026 | 31 Oktober 2026 | Terkunci |
| Oktober 2026 | 30 November 2026 | **Masih bisa diperbaiki** |
| November 2026 | 31 Desember 2026 | Periode berjalan |

Admin bisa membuka kunci periode mana pun; tercatat di `Log`.

### Mencegah foto dipakai ulang

Nama berkas saja mudah dilewati — tinggal diganti namanya. Yang dibandingkan di
sini adalah **isi** berkasnya, dua lapis:

- **Sidik** — SHA-256 bytes foto asli, dihitung di HP sebelum dikecilkan.
  Mengganti nama berkas tidak mengubahnya.
- **Sidik Kirim** — SHA-256 gambar yang diterima server, dihitung ulang di server.
  Karena pengecilan di HP memakai pengaturan yang sama, foto lama yang dipakai
  ulang dari HP yang sama menghasilkan bytes yang sama persis — jadi tetap
  tertangkap walau sidik dari HP dipalsukan.

Kalau bentrok, unggahan ditolak dan disebutkan foto itu sudah dipakai untuk rumah
mana. Mengganti foto rumah itu sendiri tetap boleh.

Waktu pengambilan foto (EXIF `DateTimeOriginal`) ikut disimpan. Foto yang waktunya
di luar periode, atau yang tidak punya data waktu, muncul di tab **Foto bermasalah**
sebagai bahan pemeriksaan — bukan penolakan otomatis, karena sebagian HP memang
menghapus EXIF.

> Batas jujurnya: cara ini menangkap pemakaian ulang berkas yang sama. Dua
> jepretan berbeda dari objek yang sama tidak bisa dibedakan sistem.

### Halaman admin

- **Progres** — ringkasan per periode dan tabel per kader (terisi, ada jentik,
  tidak bisa diperiksa, terakhir mengisi). Setiap baris bisa diklik atau ditekan
  tombol **Detail ›**.
- **Detail kader** — seluruh rumah kader itu beserta isian lengkapnya, dengan
  pilihan bulan sendiri. Koreksi data dilakukan langsung di spreadsheet.
- **Kader & PIN** — PIN terlihat (termasuk kalau kader menggantinya sendiri),
  atur ulang PIN, aktif/nonaktif.
- **Foto bermasalah** — entri tanpa foto, foto tanpa EXIF, foto di luar periode.
- **Periode** — kunci/buka kunci, buka periode berikutnya, bangun ulang `Master Data`.

---

## Supaya tidak kena timeout Apps Script

Beban nyata kecil: 25 kader × 50 rumah = 1.250 simpanan sebulan. Walau menumpuk
di tiga hari terakhir, itu sekitar satu simpanan tiap dua menit — jauh di bawah
batas 30 eksekusi bersamaan. Yang membuat web app Apps Script kena timeout
biasanya bukan jumlah pengguna, tapi lamanya tiap panggilan. Sembilan aturan yang
dipegang kode ini:

1. **Satu aksi = satu panggilan pendek.** Buka daftar 1 panggilan, simpan 1,
   foto 1. Tidak ada panggilan beruntun yang saling menunggu.
2. **Tidak pernah membaca seluruh sheet tiap panggilan.** Hasil baca disimpan di
   `CacheService` dengan kunci bernomor versi; versinya naik hanya saat datanya
   berubah, jadi cache lama otomatis tidak terpakai tanpa perlu dihapus.
3. **Entri dipecah per periode** (`Entri 2026-11`), jadi satu sheet tidak pernah
   melebihi ~1.300 baris betapapun lamanya program berjalan.
4. **Menulis hanya menambah atau menimpa satu baris.** Pencarian barisnya hanya
   membaca kolom ID, bukan seluruh sheet.
5. **Sheet yang ditulis bebas rumus.** Tanpa `ARRAYFORMULA`, `IMPORTRANGE`,
   `NOW()` — rumus volatil menghitung ulang seluruh sheet tiap satu baris masuk.
6. **`LockService` hanya membungkus penulisan barisnya**, bukan unggah foto.
7. **Simpanan idempoten.** ID entri = ID rumah + periode, jadi pengiriman ulang
   setelah timeout menimpa baris yang sama alih-alih menggandakannya.
8. **Antrean di HP + coba lagi bertahap** (2, 4, 8 detik). Gagal sementara tidak
   terlihat kader dan isiannya tidak hilang.
9. **`Master Data` dibangun pemicu terjadwal**, bukan saat kader menekan Simpan.
   Halaman admin pun membaca hasil olahan, bukan sheet yang sedang ditulis kader.

Foto dikecilkan jadi maksimal 1280 piksel (±200 KB) di HP sebelum dikirim, dan
disimpan sebagai berkas Drive biasa — **bukan** gambar dalam sel, yang tidak bisa
dibaca balik oleh script.

---

## Susunan sheet

| Sheet | Isinya |
| --- | --- |
| `Kader` | ID, Nama, RW (bisa lebih dari satu), PIN, Target, Aktif, PIN Diubah, PIN Dilihat |
| `Rumah` | ID Rumah, RW, Kader ID, Nama Pemilik, Alamat, RT, Aktif, Dibuat, ID Asal |
| `Entri 2026-11` | Satu baris per rumah per periode, termasuk jenis container, foto, versi |
| `Periode` | Periode, Label, Status (`otomatis`/`buka`/`kunci`) |
| `FotoIndex` | Sidik, Sidik Kirim, ID Entri, ID Rumah, Periode, Nama Berkas, Waktu EXIF |
| `Log` | Waktu, Aktor, Aksi, Detail |
| `Master Data` | 30 kolom — 27 kolom yang sama dengan master wilayah lain, plus jenis container diperiksa, bisa diperiksa, dan alasannya |

---

## Pengujian

Semuanya dijalankan di luar Google, memakai stub Apps Script:

- **86 uji logika server** — aturan periode, impor Agustus, PIN dan tombol Lupa,
  validasi simpan, idempotensi, penolakan foto ganda, batas domain admin, dan
  susunan `Master Data`.
- **53 uji ujung-ke-ujung di Chromium** — `Kader.html` dan `Admin.html` dijalankan
  di browser sungguhan sementara `google.script.run` diarahkan ke fungsi `.gs`
  asli, termasuk unggah dua berkas JPEG nyata untuk menguji penolakan foto kembar.

## Yang belum dikerjakan

- Data September dan Oktober 2026 belum dimasukkan — menunggu perapian, sesuai
  rencana. Begitu masuk, keduanya langsung muncul di dropdown bulan kader.
- Ekspor ke format formulir resmi per RW (untuk dicetak) belum dibuat.
