# Arsitektur Techford Platform

Dokumen ini menjelaskan **keputusan arsitektur** platform internal ini dan **alasan** di baliknya, agar setiap kontributor (termasuk non-engineer) memahami "kenapa" struktur ini dipilih, bukan cuma "apa"-nya.

## Prinsip Utama

1. **Business logic tidak boleh tahu soal Spreadsheet.** Hanya folder `20_Repository` yang boleh memanggil `SpreadsheetApp` secara langsung.
2. **UI tidak boleh berisi logic bisnis.** HTML hanya memanggil fungsi bridge (`*_Exposed.gs`), yang meneruskan ke Controller.
3. **Setiap modul bisnis independen.** Modul baru = folder baru di `40_Modules`. Modul tidak boleh memanggil internal modul lain secara langsung.
4. **Semua konfigurasi terpusat** di `00_Core/00_Config.gs` — tidak ada ID Spreadsheet/Folder yang di-hardcode di modul manapun.

## Struktur Layer

```
src/
├── appsscript.json          Manifest project
├── 00_Core/                 Config, Logger, ErrorHandler, Utils — dipakai SEMUA layer
├── 10_Infrastructure/       LockHelper, CacheHelper — mengatasi batasan teknis GAS
├── 20_Repository/           SATU-SATUNYA layer yang boleh akses SpreadsheetApp
├── 30_Service/              Cross-cutting service: Notification, DocGenerator, dst
├── 40_Modules/
│   └── <NamaModul>/
│       ├── <Modul>Service.gs      Business logic murni
│       ├── <Modul>Controller.gs   Jembatan ke Presentation, dibungkus ErrorHandler
│       └── <Modul>Exposed.gs      Fungsi global untuk google.script.run (client HTML)
└── 50_Presentation/
    ├── 50_WebAppRouter.gs   doGet/doPost, ROUTES: page -> {content, title, headerActions}
    ├── 51_Menu.gs           Custom menu di Spreadsheet (opsional)
    └── html/
        ├── Style.html       CSS bersama (Shell, tabel, stat card, modal, dst)
        ├── Layout/Shell.html  Layout global: sidebar (dari NavigationConfig) + topbar + slot konten
        └── <Modul>/<Modul>Content.html  Konten per halaman (fragment, tanpa <html>/<head>)
```

Setiap halaman dirender dengan cara: `ROUTES[page].content` di-evaluate jadi HTML string, lalu disisipkan ke `Layout/Shell.html` sebagai variabel `content`. Ini memastikan sidebar & topbar konsisten di semua modul tanpa duplikasi markup, dan menu sidebar cukup diatur di satu file (`00_Core/04_NavigationConfig.gs`), bukan di-hardcode di tiap halaman.

Kenapa urutan angka di depan nama file (`00_`, `10_`, `20_`, ...)? Google Apps Script menampilkan daftar file **berurutan alfabetis** di editor — prefix angka memastikan urutan tampil sesuai layer arsitektur (Core paling atas, Presentation paling bawah), walaupun urutan ini **tidak memengaruhi eksekusi** (semua file GAS digabung ke satu scope global saat runtime).

## Cara Menambah Modul Baru

Ambil `40_Modules/Lead/` sebagai template (contoh dengan search, filter, pagination, modal detail):

1. Buat folder `40_Modules/<NamaModul>/`.
2. Buat `<Modul>Service.gs` — logic bisnis, panggil Repository & Service Layer yang sudah ada. **Jangan** panggil `SpreadsheetApp` langsung di sini.
3. Kalau butuh data baru, buat Repository baru di `20_Repository/`, meng-extend `BaseRepository` (lihat `LeadRepository.gs`).
4. Buat `<Modul>Controller.gs` — dibungkus `ErrorHandler.handle(...)`.
5. Buat `<Modul>Exposed.gs` — fungsi global prefix nama modul (misal `payroll_getSummary`), hanya delegasi 1 baris ke Controller. Ini wajib karena `google.script.run` tidak bisa memanggil method di dalam namespace.
6. Buat file konten HTML (fragment, tanpa `<html>/<head>`) di `50_Presentation/html/<Modul>/<Modul>Content.html`, daftarkan di `ROUTES` pada `50_WebAppRouter.gs`.
7. Aktifkan menu-nya: ubah `enabled: false` -> `true` (atau tambah entri baru) di `00_Core/04_NavigationConfig.gs`, dengan `page` yang sama persis dengan key di `ROUTES`.

Modul lama tidak perlu disentuh sama sekali.

## Kenapa Namespace/IIFE Pattern, Bukan Class Murni?

GAS menggabungkan semua file server-side ke **satu global scope** saat eksekusi. Pola `var ModuleName = (function (module) {...})(ModuleName || {})` memberi:
- **Enkapsulasi** — variabel/fungsi privat modul tidak bocor ke scope global.
- **Penghindaran collision nama** — dua modul boleh punya fungsi privat bernama sama tanpa konflik, karena masing-masing dibungkus namespace-nya sendiri.

## Batasan GAS yang Diantisipasi Sejak Awal

| Batasan | Mitigasi di Arsitektur Ini |
|---|---|
| Eksekusi maks 6 menit | Proses panjang harus dipecah + time-driven trigger (belum diimplementasi di scaffold ini, tambahkan saat modul membutuhkan) |
| Race condition saat concurrent write | `LockHelper.withLock()` di operasi `updateWhere`/insert yang butuh urutan |
| Quota baca/tulis Spreadsheet | `CacheHelper` untuk data referensi yang jarang berubah |
| Tidak ada module system native | Namespace/IIFE pattern + `*_Exposed.gs` sebagai satu-satunya titik ekspos ke client |

## Aturan Wajib: Endpoint RPC Selalu Kembalikan Array, Jangan Objek Tunggal

Ditemukan lewat debugging panjang (lihat histori Lead Capturing): `google.script.run` **berkali-kali gagal** mengirim balik respons yang berbentuk **objek tunggal** ke client — `withSuccessHandler` menerima `null` walau operasi di server (termasuk tulis ke Spreadsheet) selalu berhasil. Respons berbentuk **array** (bahkan array berisi 1 elemen) **selalu berhasil sampai**.

**Aturan**: setiap fungsi `*_Exposed.gs` yang perlu mengembalikan data ke client HARUS mengembalikan array, walau cuma satu item (`[item]`, atau lebih baik lagi kembalikan seluruh dataset terkait — konsisten dengan pola "Load Once, Filter Local" di bawah). Jangan pernah `return someObject` langsung dari Controller yang dipanggil `*_Exposed.gs`.

## Pengecualian Terkontrol: Cross-Module Service Call

Modul umumnya tidak boleh saling panggil langsung (lihat prinsip di atas). Satu pengecualian yang disengaja: **transaksi yang secara alami melibatkan 2 entitas** (misal Lead → Client saat status diubah ke Moved) — `LeadService.moveToClient()` memanggil `ClientService.createFromLead()` langsung. Ini diperbolehkan SELAMA yang dipanggil adalah API publik Service module lain (bukan Repository-nya), dan alasannya didokumentasikan di kode. Jangan jadikan ini kebiasaan untuk interaksi yang sebetulnya bisa dipisah lewat kontrak yang lebih jelas.

## Pola Performa: "Load Once, Filter Local"

`google.script.run` (jembatan client ↔ server GAS) punya overhead tetap yang cukup besar per panggilan (ratusan ms - beberapa detik) karena harus keluar dari browser, masuk ke infrastruktur eksekusi Apps Script, lalu balik lagi — **terlepas seberapa ringan logic-nya**. Kalau setiap ketikan di search box atau setiap ganti halaman memanggil server, aplikasi akan terasa berat walau logic-nya sendiri cepat.

Solusinya, dipakai di modul Lead (`LeadCapturingContent.html`):
1. **Ambil seluruh dataset SEKALI** saat modul dibuka (`lead_getAll()`), simpan di variabel JS di browser (`allLeads`).
2. **Search, filter, sort, pagination, dan buka detail — semuanya beroperasi di array tersebut, murni JavaScript, tanpa panggil server lagi.** Karena itu terasa instan.
3. Server hanya dipanggil untuk: load awal, tombol **Sync** (refresh cache dari sumber terbaru), dan **operasi tulis** (`lead_update`) — yang memang wajar lebih lambat karena harus benar-benar menyentuh Spreadsheet.
4. Setelah tulis berhasil, patch objek yang berubah langsung di `allLeads` (bukan fetch ulang semua data) supaya UI tetap instan.

**Trade-off yang harus disadari:** data di browser bisa "basi" kalau ada perubahan dari sumber lain di antara load awal dan klik Sync berikutnya — ini yang membuat tombol Sync itu penting secara fungsional, bukan sekadar dekorasi. Pola ini juga hanya masuk akal untuk dataset yang wajar disimpan di memori browser (ratusan-ribuan baris); kalau nanti ada modul dengan puluhan ribu+ baris, pertimbangkan pagination di server untuk modul tersebut secara khusus.

**Terapkan pola yang sama untuk modul baru** yang punya UI list + search/filter, kecuali datanya memang sangat besar atau perlu selalu real-time per detik.

## Kapan Harus Bermigrasi ke Arsitektur Lain

Struktur ini (Single Project Modular) cocok sampai platform punya sekitar 10-15 modul aktif dengan trafik internal (puluhan-ratusan user). Kalau nanti:
- Deploy satu modul mulai berisiko mengganggu modul lain, atau
- Spreadsheet sebagai database mulai terasa lambat (umumnya di atas puluhan ribu baris aktif per sheet, atau ratusan pengguna bersamaan),

maka pertimbangkan (urutan eskalasi, tidak harus loncat langsung):
1. Pecah modul besar ke **Apps Script Library** terpisah (lihat opsi di diskusi awal repo).
2. Pindahkan Repository Layer dari Spreadsheet ke **Google Sheets API + BigQuery**, atau ke database sungguhan (Cloud SQL/Firestore) di belakang **Cloud Run/Cloud Functions**, sementara GAS tetap jadi Presentation/Automation layer.

Karena Repository Layer sudah terisolasi sejak awal, migrasi ini **tidak mengubah** Module/Service/Presentation Layer — hanya mengganti isi implementasi Repository.
