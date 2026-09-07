# Master Data PJB — Tangerang (Kelurahan Cipondoh)

Script Apps Script untuk spreadsheet **"TANGERANG - RECAP LAPORAN KADER JUMANTIK TAHUN 2026"**.
Menggabungkan seluruh tab RW menjadi satu tab **`Master Data`** yang siap dibaca dashboard,
dengan susunan kolom yang sama dengan Master Data Bekasi supaya keduanya bisa disatukan.

## Cara pasang (sekali saja)

1. Buka spreadsheet Tangerang → menu **Ekstensi › Apps Script**.
2. Kalau project masih kosong, hapus isi `Code.gs` bawaan.
3. Buat file dan tempel isinya **utuh** (jangan sebagian — satu file rusak membuat
   SELURUH project gagal dimuat dan menunya hilang):
   - `Menu.gs`  ← isi dari `Menu.gs` di folder ini
   - `MasterData.gs` ← isi dari `MasterData.gs` di folder ini
4. Klik ikon gerigi **Project Settings** → centang *"Show appsscript.json manifest file"*,
   lalu samakan isinya dengan `appsscript.json` di folder ini (opsional, hanya mengatur zona waktu).
5. **Simpan** (Ctrl/Cmd + S), lalu **muat ulang tab spreadsheet**.
6. Menu **🦟 Jumantik Tangerang** akan muncul di sebelah menu Bantuan.

## Cara pakai

| Menu | Fungsi |
| --- | --- |
| **1. Build / Update Master Data** | Membaca semua tab RW dan menulis ulang tab `Master Data`. Aman dijalankan berkali-kali. |
| **2. Cek Kelengkapan per Tab** | Membandingkan jumlah baris di `Master Data` dengan blok yang terbaca di tiap tab RW. |

Saat pertama dijalankan, Google akan meminta izin akses spreadsheet — pilih akun Anda,
**Advanced › Go to project (unsafe)** → **Allow**. Ini normal untuk script buatan sendiri.

Setelah selesai muncul ringkasan: total baris, baris yang dilewati, dan hitungan tiap
jenis catatan kualitas data.

## Kolom `Master Data` (27 kolom)

| # | Kolom | Keterangan |
| --- | --- | --- |
| 1 | Kota/Kabupaten | `Tangerang` — pembeda saat digabung dengan data wilayah lain |
| 2 | Kelurahan | `Cipondoh` |
| 3 | RW | `RW 01` … `RW 14`, diambil dari nama tab |
| 4 | Nama Kader | disamakan kapitalisasinya agar satu orang tidak terpecah dua |
| 5–6 | Bulan, Tahun | periode blok |
| 7 | No Urut (asal form) | nomor baris asli di formulir |
| 8 | Tanggal Pemantauan | hasil pembacaan, format `YYYY-MM-DD` |
| 9 | Tanggal Mentah (asli) | teks tanggal **persis** seperti di formulir (untuk penelusuran) |
| 10–12 | Nama Pemilik, Alamat, RT | |
| 13–15 | Container Diperiksa / (+) / (−) | |
| 16 | Kode Jenis Container Positif | teks asli dari formulir |
| 17 | Jenis Container Positif (nama) | kode diterjemahkan ke nama container |
| 18 | Bangunan Negatif (−) Jentik | 1 = bebas jentik |
| 19–20 | Tindakan 3M/4M+, Larvasidasi | |
| 21–22 | Pengelolaan Sampah, Kerja Bakti (K3) | **kolom baru khas formulir Tangerang** |
| 23–24 | Status Foto, Link Foto | |
| 25–26 | Sheet Asal, Baris Sumber | penunjuk balik ke sel aslinya |
| 27 | Catatan Kualitas Data | setiap koreksi tercatat di sini |

## Prinsip: tidak ada data yang dibuang diam-diam

Yang **tidak** dimasukkan ke Master Data hanya dua hal, dan jumlahnya dilaporkan:

- baris contoh bawaan formulir (kolom NO berisi "Cont"/"Contoh") — 28 baris;
- baris template yang belum diisi (nama, tanggal, dan jumlah container semuanya
  kosong; yang terisi hanya nomor urut dan hasil rumus) — 126 baris.

Selain itu **semua baris ikut**, termasuk yang isinya bermasalah. Setiap koreksi
ditulis di kolom `Catatan Kualitas Data`, jadi bisa ditelusuri balik ke formulirnya:

- tanggal salah ketik dirapikan (`07-089-2026` → 7 Agustus, `30-082026`, `10 08 2026`,
  `04.08.2026`, tahun `2926`/`0206`/`206`);
- tanggal yang bulannya beda dari header blok **tidak diubah**, hanya diberi catatan;
- tahun di header blok yang salah ketik (mis. "Agustus 2016") dikoreksi mengikuti
  mayoritas tanggal di dalam blok itu, bukan sebaliknya;
- `Jumlah (+)` yang kosong dilengkapi dari `diperiksa − (−)` bila keduanya terisi;
- `RT` bentuk `03/02` (RT/RW) dinormalkan jadi `3`;
- kolom 0/1 yang diisi huruf (mis. `o`) dibaca sebagai 0;
- `RW` pada formulir yang berbeda dengan nama tab: yang dipakai nama tab, bedanya dicatat.

## Catatan penting untuk penggabungan dengan data Bekasi

1. **Kode container BEDA ARTI antar wilayah.** Di formulir Tangerang `8 = Ember/bak mandi`,
   sedangkan di formulir Bekasi `8 = Lain-lain (dalam rumah)`. Karena itu Master Data
   Tangerang menyimpan kolom **Jenis Container Positif (nama)** hasil terjemahan; saat
   digabung, yang dijumlahkan harus kolom nama itu, bukan angka kodenya.
2. **Nomor RW dipakai di kedua wilayah** (sama-sama ada RW 01…RW 14), jadi di dashboard
   gabungan RW harus selalu dipasangkan dengan kolom Kota/Kabupaten.
3. **Kolom Pengelolaan Sampah dan K3 hanya ada di formulir Tangerang.** Untuk baris
   Bekasi kolom ini dibiarkan kosong (bukan 0), supaya "tidak dikumpulkan" tidak
   tertukar dengan "sudah dicek, hasilnya tidak".
