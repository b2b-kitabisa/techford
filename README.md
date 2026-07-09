# Techford Platform

Platform internal perusahaan berbasis Google Apps Script & Google Workspace (Spreadsheet sebagai database, Docs untuk generate dokumen, Drive untuk penyimpanan, Gmail untuk notifikasi), dibangun dengan pendekatan **Layered Modular Architecture**.

- Penjelasan lengkap keputusan arsitektur & alasannya: lihat [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Cara setup project di Apps Script Editor: lihat [`SETUP.md`](./SETUP.md)
- Source code: folder [`src/`](./src)

## Modul yang Tersedia

| Modul | Deskripsi | Status |
|---|---|---|
| Employee | Contoh referensi struktur modul (Repository, Service, Controller, Exposed, UI) | Referensi |
| Lead Capturing | Sales Module — stat per status, search & filter, pagination, detail lead | Aktif |

Gunakan modul `Employee` sebagai template saat menambah modul bisnis baru. Sidebar navigasi global (termasuk modul yang belum aktif) diatur di `src/00_Core/04_NavigationConfig.gs`.
