# Setup Project (Native Apps Script Editor)

Anda memilih develop langsung di Apps Script Editor (tanpa clasp/build tool). Repo Git ini berfungsi sebagai **source of truth & histori perubahan** — setelah edit di editor, salin balik perubahan ke sini agar tetap terlacak.

## Langkah Setup Awal

1. Buat Google Spreadsheet baru untuk database platform ini.
2. Di Spreadsheet tersebut, buka **Extensions > Apps Script**. Ini akan jadi *container-bound script* project kita.
3. Buat sheet `Employee` dengan header baris pertama: `Id | Name | Email | Status | CreatedAt`.
4. Di Apps Script Editor:
   - Hapus file `Code.gs` default.
   - Buat file baru untuk setiap file di folder `src/` pada repo ini, **gunakan nama yang sama** (termasuk prefix angka) agar mudah dicocokkan saat sinkronisasi manual. GAS mendukung nama file berisi `/` sebagai pseudo-folder di daftar file (misal `Employee/EmployeeApp`).
   - Untuk file `.gs`, pilih tipe "Script". Untuk file di folder `html/`, pilih tipe "HTML".
   - Salin isi setiap file dari `src/` ke file yang sesuai di editor.
5. Buka `00_Core/00_Config.gs` di editor, isi `SPREADSHEET_ID` dengan ID Spreadsheet Anda (bagian di URL antara `/d/` dan `/edit`).
6. Deploy sebagai Web App: **Deploy > New deployment > Web app**. Set "Execute as: User accessing the web app" atau "Me" sesuai kebutuhan izin akses, dan "Who has access" sesuai domain organisasi Anda.
7. Coba akses URL Web App yang muncul — Anda akan melihat halaman Home, lalu bisa masuk ke modul Employee.

## Alur Kerja Selanjutnya

Karena tidak memakai clasp, setiap kali Anda mengembangkan modul baru di editor:
1. Kembangkan & test langsung di script.google.com.
2. Setelah stabil, salin file yang berubah/ditambahkan ke folder `src/` di repo ini (jaga struktur folder sesuai `ARCHITECTURE.md`), lalu commit.

Ini menjaga histori perubahan tetap ada di Git walau proses editing utamanya di editor Apps Script. Kalau ke depan proses ini terasa merepotkan, `clasp` (CLI resmi Google) bisa diadopsi kapan saja tanpa mengubah arsitektur kode — cukup menambah kemudahan sinkronisasi, bukan mengganti pendekatan.
