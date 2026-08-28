# Dashboard Jumantik (Google Apps Script)

Dashboard read-only untuk data survei Jumantik (surveilans jentik nyamuk), dibangun murni
di Google Apps Script + HtmlService, membaca langsung dari Google Sheets. Tidak ada fitur
input/CRUD — hanya visualisasi.

## Struktur file

- `appsscript.json` — konfigurasi project & web app
- `Code.gs` — entry point `doGet()`
- `DataService.gs` — baca sheet mentah, **bersihkan data**, dan hitung semua agregat
- `Dashboard.html` — tampilan dashboard (KPI card + chart berbasis div, tanpa library eksternal)

## Apa yang dibersihkan otomatis oleh `DataService.gs`

Data mentah di sheet **tidak diubah sama sekali** — pembersihan hanya terjadi di memori
setiap kali dashboard dibuka:

1. **Header dengan spasi** (`"Wilayah "`, `"Alamat "`, `"Cek Duplikasi "`) — dibaca dengan trim otomatis.
2. **Duplikat** — baris dengan `Cek Duplikasi = 2` (22 baris) dikeluarkan dari perhitungan utama, tapi jumlahnya tetap ditampilkan sebagai catatan kualitas data.
3. **Variasi penulisan Wilayah** — misal `"RW 02 (Karawaci Baru)"` dinormalisasi jadi `"RW 02"`, dan nama kelurahan di dalam kurung dipakai untuk mengisi `Kelurahan` yang kosong (25 baris kosong).
4. **Tempat Ditemukan Jentik** yang berisi banyak nilai dipisah koma (misal `"Dispenser, Bak mandi"`) dipecah jadi item terpisah supaya breakdown kontainer akurat, bukan dihitung sebagai satu kombinasi unik.
5. **Baris kosong total** diabaikan.
6. Anomali seperti `#REF!` di kolom `No` tidak dipakai sama sekali — perhitungan total memakai jumlah baris valid, bukan kolom `No`.

Kalau nanti pola data berubah (nama sheet lain, kolom baru), cukup edit `DataService.gs`.

## Langkah setup & deploy (pakai clasp)

Sheet sumber: `https://docs.google.com/spreadsheets/d/1mylJBzQgKE0SbI4waY8varSDmfdJU6ke/...`
Spreadsheet ID: `1mylJBzQgKE0SbI4waY8varSDmfdJU6ke`

### 1. Install clasp (sekali saja, di komputer Anda)

```bash
npm install -g @google/clasp
```

### 2. Login ke akun Google Anda

```bash
clasp login
```

Ini akan membuka browser dan minta Anda menyetujui akses — wajib dilakukan dari sesi Anda sendiri, tidak bisa diotomasi dari luar.

Pastikan juga Apps Script API sudah aktif di akun Anda: buka
https://script.google.com/home/usersettings dan set "Google Apps Script API" ke **ON**.

### 3. Clone/pull folder ini ke komputer Anda

Ambil folder `jumantik-dashboard/` dari branch `claude/looker-studio-dashboard-8eupjr` di repo ini.

### 4. Buat project Apps Script yang terikat (bound) ke spreadsheet Jumantik

Dari dalam folder `jumantik-dashboard/`:

```bash
cd jumantik-dashboard
clasp create --type sheets --title "Dashboard Jumantik" --parentId 1mylJBzQgKE0SbI4waY8varSDmfdJU6ke --rootDir .
```

Perintah ini membuat file `.clasp.json` baru berisi `scriptId` project yang baru dibuat, dan
menautkannya ke spreadsheet Jumantik Anda.

> **Catatan:** kalau `clasp create` menolak karena sudah ada file di folder, jalankan
> `clasp clone <scriptId>` sebagai gantinya setelah membuat project kosong manual lewat
> Extensions > Apps Script di spreadsheet Jumantik Anda, lalu copy `scriptId`-nya dari URL editor.

### 5. Push semua kode ke Apps Script

```bash
clasp push
```

### 6. Deploy sebagai Web App

```bash
clasp deploy --description "Dashboard Jumantik v1"
```

Atau buka editor via `clasp open` lalu klik **Deploy > New deployment > Web app**:
- **Execute as:** Me (akun Anda)
- **Who has access:** sesuaikan (misal "Anyone within [organisasi]" atau "Anyone")

### 7. Otorisasi pertama kali

Saat pertama kali dijalankan, Google akan minta persetujuan izin akses ke Google Sheets
(`SpreadsheetApp`). Klik **Allow/Izinkan** — ini normal untuk script yang membaca data Anda sendiri.

### 8. Setiap kali ada perubahan kode

```bash
clasp push
clasp deploy --description "update"
```

(atau redeploy dari `clasp open` jika ingin versi baru dari deployment yang sama)

## Kalau tidak mau pakai clasp (opsi manual)

1. Buka spreadsheet Jumantik → **Extensions > Apps Script**.
2. Hapus isi `Code.gs` default, lalu copy-paste isi `Code.gs` dan `DataService.gs` dari folder ini (bisa jadi 2 file `.gs` terpisah di editor).
3. Buat file HTML baru bernama `Dashboard` (**File > New > HTML file**), lalu copy-paste isi `Dashboard.html`.
4. Klik **Deploy > New deployment > Web app**, atur "Execute as" dan "Who has access", lalu **Deploy**.
5. Buka URL web app yang diberikan.

## Menyesuaikan visualisasi

Semua chart dibuat manual dengan `div` + CSS (bukan library chart), sama seperti gaya
dashboard Techford yang sudah ada di `src/40_Modules/Dashboard/`. Untuk menambah/mengubah
section, edit `DataService.gs` (agregasi) dan `Dashboard.html` (tampilan) secara berpasangan.
