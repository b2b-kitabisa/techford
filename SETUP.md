# Setup Project

Ada dua cara menjalankan project ini: pakai **clasp** (CLI resmi Google, direkomendasikan — sinkron `src/` di repo ini langsung ke Apps Script lewat command line, tanpa copy-paste manual) atau **Apps Script Editor native** (copy-paste manual, tanpa tooling lokal).

## Opsi A — clasp (Direkomendasikan)

Prasyarat: `clasp` terinstall (`npm install -g @google/clasp`) dan sudah login ke akun Google Anda (`clasp login`) — proses ini butuh Anda membuka URL otorisasi di browser sendiri, tidak bisa diotomasi penuh dari sisi manapun karena memang harus persetujuan eksplisit dari akun Google Anda.

1. Buat sheet berikut di Spreadsheet database platform ini:
   - `Employee` dengan header baris pertama: `Id | Name | Email | Role | PasswordHash | Status | CreatedAt`. Ini juga tabel login (lihat `EmployeeService.login`) — isi minimal 1 baris admin pertama secara manual (jalankan `Utils.hashPassword('passwordAnda')` sekali dari Apps Script Editor untuk dapat hash-nya, jangan simpan password polos).
   - `Lead` dengan header baris pertama: `Inbound_ID | Timestamp | Status | Entity_Name | Entity_Type | PIC_Name | Email | Phone | Detail_Interest | Priority_Notes | UTM_Source | UTM_Medium | UTM_Campaign | Last_Updated | Other_Notes`. Kolom `Status` harus berisi salah satu dari: `New Leads`, `Contacted`, `Moved`, `Other`, `Spam` (lihat `Config.LEAD_STATUS`).
   - `Inbound_Raw` — hasil `IMPORTRANGE` dari Spreadsheet respons Typeform, header (persis nama pertanyaan Typeform): `First name | Last name | Jenis organisasi | nama perusahaan/organisasi | kebutuhan | prioritas | Phone number | Email | utm_source | utm_medium | utm_campaign | Submitted At | Token`. Sel-selnya dikontrol formula `IMPORTRANGE` — jangan diedit manual.
   - `Client` dengan header baris pertama: `Client_ID | Brand_Name | Entity_Name | Entity_Type | Head_Office | Website | Industry | Client_Source | Created_Date | Created_By | Other_Notes | Last_Updated`.
   - `PIC_Client` dengan header baris pertama: `PIC_ID | Client_ID | PIC_Name | Title | Email | Phone | Created_Date`.
   - `Master_Data` dengan header baris pertama: `Category | Value | CreatedAt`. Ini sumber opsi dropdown Head Office/Industry/Entity Type/Client Source di Client Monitoring — dikelola lewat Setting, tapi isi dulu beberapa baris awal manual, misal:
     ```
     Client_Source | Inbound   | (kosongkan/isi tanggal)
     Client_Source | Outbound  |
     Client_Source | Referral  |
     ```
     (kolom `Category` harus persis `Client_Source`, `Head_Office`, `Industry`, atau `Entity_Type`).
   - `Project` dengan header baris pertama: `Project_ID | Project_Name | Client_ID | Consultant | Services | Service_Categories | Program_Type | Program_Category | Program_Name | Issues | Other_Notes | Is_Retainer | Allow_Manual_Deal | Stage | Total_GDV | Total_Service_Revenue | Other_Document_Links | Created_Date | Created_By | Last_Updated`. Ini sheet untuk modul Sales Pipeline. `Services`, `Service_Categories`, `Issues` isinya string JSON array, dan `Other_Document_Links` string JSON array berisi objek `{name, link}` (semuanya di-encode/decode otomatis oleh `ProjectService`, jangan diedit manual). `Stage` berisi salah satu dari daftar di `Config.PIPELINE_STAGE_LIST` (First Approaching, Follow Up User, Drafting Deck, Negotiation, Revision, Won, Loss). `Is_Retainer` (TRUE/FALSE) sengaja tidak bisa diubah lagi setelah project dibuat — ini keputusan produk, bukan bug. `Allow_Manual_Deal` (TRUE/FALSE, default FALSE) — beda dari `Is_Retainer`, ini toggle bebas yang bisa dinyala/dimatikan admin kapan saja lewat Project Detail; kalau FALSE, Stage "Won" TERKUNCI dari dropdown manual dan hanya bisa dicapai lewat dokumen Quotation Signed di Document Pipeline (lihat `ProjectService.updateStage`). `Total_GDV`/`Total_Service_Revenue` untuk sekarang masih placeholder (selalu 0) karena breakdown detailnya sengaja ditunda.
   > **Kalau sheet `Project` sudah pernah Anda buat sebelumnya**: tambahkan kolom baru `Allow_Manual_Deal`, isi semua baris yang sudah ada dengan `FALSE` (atau kosongkan, dianggap falsy).
   - `Document_Pipeline` dengan header baris pertama: `Doc_ID | Project_ID | Document_Type | Entity | Status | Stage | Requested_By | Requested_Date | Last_Updated`. Ini sheet untuk modul Document Pipeline. `Document_Type` salah satu dari `Config.DOCUMENT_TYPES` (DECK, QUOTATION, COR, RAB, PRODCOST, PKS, TRANSFER_REQUEST, BAST). `Entity` hanya terisi kalau `Document_Type = QUOTATION` (YKB atau PT KAI — lihat `Config.QUOTATION_ENTITIES`; satu project bisa punya 2 baris Quotation, satu per entitas), kosong untuk tipe lain. `Status` kosakatanya beda-beda per `Document_Type` (lihat `Config.DOCUMENT_STATUS_MAP`), sementara `Stage` selalu salah satu dari 4 nilai universal (`New Request`, `In Progress`, `Client Review`, `Done`) yang diturunkan otomatis dari `Status`. Aturan auto-advance ke `Project.Stage`: DECK/COR/RAB/PRODCOST — salah satu Done -> `Negotiation`; QUOTATION — begitu SEMUA Quotation yang diminta untuk project itu Done -> `Won` (Deal); PKS/TRANSFER_REQUEST/BAST adalah dokumen pasca-Deal yang TIDAK PERNAH memengaruhi Stage. Dokumen hanya bisa diminta lewat box "Document Request" di Project Detail (Sales Pipeline), bukan dari halaman Document Pipeline itu sendiri — lihat `DocumentService.checkAndAdvanceProjectStage`.
   > **Kalau sheet `Client` sudah pernah Anda buat sebelumnya**: tambahkan kolom baru `Other_Notes` (taruh di antara `Created_By` dan `Last_Updated`, atau di mana saja — asal namanya persis `Other_Notes`, urutan kolom tidak masalah karena kode membaca berdasarkan nama header, bukan posisi).
2. Isi `SPREADSHEET_ID` di `src/00_Core/00_Config.gs` dengan ID Spreadsheet Anda.
3. Dari dalam folder `src/`, buat project Apps Script yang terikat (bound) ke Spreadsheet tersebut:
   ```
   clasp create --type sheets --title "Techford Platform" --parentId <SPREADSHEET_ID> --rootDir .
   ```
   Ini membuat `.clasp.json` berisi `scriptId` project baru.
4. Push semua kode:
   ```
   clasp push
   ```
5. Deploy sebagai Web App:
   ```
   clasp deploy --description "initial"
   ```
   Atau lewat `clasp open` untuk buka editor di browser lalu **Deploy > New deployment > Web app** (perlu dilakukan manual minimal sekali untuk mengatur "Execute as" dan "Who has access").
6. Setiap ada perubahan kode di `src/`, cukup jalankan `clasp push` lagi — tidak perlu copy-paste manual.

## Opsi B — Native Apps Script Editor (manual)

Repo Git berfungsi sebagai **source of truth & histori perubahan** — setelah edit di editor, salin balik perubahan ke sini agar tetap terlacak.

1. Buat Google Spreadsheet baru untuk database platform ini, lalu buka **Extensions > Apps Script** (jadi *container-bound script*).
2. Buat sheet `Employee`, `Lead`, `Inbound_Raw`, `Client`, `PIC_Client`, `Master_Data`, `Project`, dan `Document_Pipeline` seperti di Opsi A langkah 1.
3. Di Apps Script Editor:
   - Hapus file `Code.gs` default.
   - Buat file baru untuk setiap file di folder `src/` pada repo ini. **Nama file harus sama persis dengan path relatif dari folder `src/`** (tanpa ekstensi), misal file di repo `src/50_Presentation/html/Lead/LeadCapturingContent.html` harus dibuat dengan nama `50_Presentation/html/Lead/LeadCapturingContent` di editor (GAS mendukung `/` sebagai pseudo-folder). Ini wajib sama karena kode (`createTemplateFromFile`, `include`) memanggil file berdasarkan nama ini.
   - Untuk file `.gs`, pilih tipe "Script". Untuk file di folder `html/`, pilih tipe "HTML".
   - Salin isi setiap file dari `src/` ke file yang sesuai di editor.
4. Buka `00_Core/00_Config.gs` di editor, isi `SPREADSHEET_ID` dengan ID Spreadsheet Anda (bagian di URL antara `/d/` dan `/edit`).
5. Deploy sebagai Web App: **Deploy > New deployment > Web app**. Set "Execute as: Me", dan "Who has access" sesuai kebutuhan.
6. Coba akses URL Web App yang muncul — Anda akan melihat halaman Lead Capturing (halaman default).

Setiap kali mengembangkan modul baru di editor: kembangkan & test langsung di script.google.com, lalu salin file yang berubah/ditambahkan ke `src/` di repo ini, lalu commit.
