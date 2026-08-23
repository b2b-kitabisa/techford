# Prompt untuk AI Web App Builder — Rebuild "Techford"

> Copy-paste seluruh isi di bawah ini (mulai dari "## PERAN & KONTEKS") ke AI web app builder pilihan Anda (bolt.new, v0.dev, Lovable, Replit Agent, Cursor Agent, dll). Prompt ini ditulis selengkap dan sespesifik mungkin berdasarkan dokumen handover teknis Techford (platform B2B Kitabisa yang saat ini berjalan di Google Apps Script + Google Sheets dan sedang dimigrasikan karena kena rate-limit).

---

## PERAN & KONTEKS

Anda adalah software engineer yang membangun ulang **Techford**, sebuah internal tool B2B untuk tim B2B Kitabisa (organisasi non-profit donasi Indonesia). Techford mengelola seluruh siklus kerja sama B2B: dari lead masuk, jadi client, jadi project, sampai dokumen COR (Cost of Revenue) yang menghitung uang masuk-keluar-profit, disetujui lewat email, lalu dipantau realisasinya.

Platform LAMA dibangun di atas Google Apps Script + Google Sheets sebagai database, dan sudah menabrak batas skalabilitas platform tersebut (rate limit Google, ~8 bulan berjalan, data terus tumbuh). Tugas Anda: bangun ulang dari nol di stack modern, dengan SEMUA aturan bisnis yang sama persis, tapi database & arsitektur yang benar.

**Jangan tiru arsitektur Google Apps Script-nya (spreadsheet-as-database, tanpa index).** Tiru ATURAN BISNIS-nya persis, bangun di atas database relasional sungguhan.

---

## TECH STACK YANG WAJIB DIPAKAI (semua gratis, tidak perlu kartu kredit di awal)

- **Database**: PostgreSQL via **Supabase** (sudah termasuk Auth, Storage, Edge Functions)
- **Frontend**: **Next.js** (App Router) + TypeScript, di-deploy ke **Vercel**
- **Auth**: Supabase Auth dengan provider **Google OAuth**, dibatasi hanya email domain `@kitabisa.com` (parameter `hd=kitabisa.com` saat memanggil `signInWithOAuth`, DAN validasi ulang domain email di server setiap request — jangan percaya validasi client saja)
- **Backend logic**: Next.js API routes atau Supabase Edge Functions (TypeScript) — pilih salah satu, konsisten
- **File/lampiran dokumen**: Google Drive API (pakai service account atau OAuth token dari Workspace) — struktur folder per client/project (lihat bagian Integrasi)
- **PDF generation**: library open-source seperti `@react-pdf/renderer` atau Puppeteer (headless Chrome) yang dijalankan di server
- **Email approval**: Gmail API (pakai akun Workspace yang sama) untuk kirim magic-link approval
- **Kalkulasi keuangan (COR)**: HARUS ditulis sebagai SATU package/module TypeScript murni (pure functions, tanpa side effect), yang di-import baik oleh frontend (untuk preview real-time saat mengetik) maupun backend (untuk hitungan final yang disimpan) — supaya TIDAK ADA duplikasi rumus seperti di sistem lama (lihat peringatan di bagian COR).

---

## SKEMA DATABASE (PostgreSQL) — WAJIB DIBUAT SEPERTI INI

Berikut struktur tabel berdasarkan reverse-engineering sistem lama. Bangun migration SQL untuk semua tabel ini, dengan foreign key, check constraint, dan tipe data yang BENAR (bukan text semua seperti di spreadsheet asal).

### Tabel referensi/master

```sql
-- employee: user internal
CREATE TABLE employee (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE CHECK (email ~* '^[^@]+@kitabisa\.com$'),
  role TEXT NOT NULL CHECK (role IN ('Master Admin','Consultant','Operation','Head of B2B')),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- TIDAK ADA kolom password — auth 100% lewat Google OAuth/Supabase Auth
);
-- INVARIANT WAJIB (trigger atau application-level check): minimal 1 employee
-- dengan role='Master Admin' AND status='Active' harus selalu ada.

-- master_data: opsi dropdown yang bisa ditambah admin tanpa deploy
CREATE TABLE master_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('Head_Office','Industry','Entity_Type','Client_Source')),
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, value)
  -- Append-only secara desain: tidak ada endpoint update/delete di UI lama,
  -- tapi jangan hard-block di DB, cukup jangan buat UI-nya.
);

-- cor_entity: master vendor pembayaran COR
CREATE TABLE cor_entity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name TEXT NOT NULL,
  bank TEXT,
  is_pkp BOOLEAN NOT NULL DEFAULT false,
  biaya_pencairan NUMERIC NOT NULL DEFAULT 0, -- bank fee per Rp200jt
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- margin_guide: persentase margin resmi per komponen
CREATE TABLE margin_guide (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL CHECK (component IN ('CONS','CRE','PROG','IMP')),
  sub_category TEXT NOT NULL,
  percentage NUMERIC NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  sort_order INT NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Lead → Client → Project

```sql
CREATE TABLE lead (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_id TEXT NOT NULL UNIQUE, -- format INB26-00001, generate via sequence per tahun
  submitted_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'New Leads' CHECK (status IN ('New Leads','Contacted','Moved','Other','Spam')),
  entity_name TEXT NOT NULL,
  entity_type TEXT CHECK (entity_type IN ('Perusahaan','Institusi Sosial','Institusi Grants','Other')),
  entity_type_other TEXT,
  pic_name TEXT,
  email TEXT,
  phone TEXT,
  -- PENTING: nama kolom di source ASLI TERTUKAR SENGAJA, JANGAN "diperbaiki":
  -- detail_interest sebenarnya menyimpan jawaban pertanyaan "prioritas",
  -- priority_notes sebenarnya menyimpan jawaban pertanyaan "kebutuhan".
  -- Anda BOLEH menamai ulang kolom di sistem baru asal MAPPING datanya benar
  -- (mis. rename jadi priority_answer / need_answer) — yang tidak boleh
  -- adalah salah tukar isinya saat migrasi data.
  detail_interest TEXT,
  priority_notes TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
  source_token TEXT, -- dedup key dari Typeform
  client_id UUID REFERENCES client(id),
  other_notes TEXT,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- STATE MACHINE (tegakkan di server, bukan cuma UI):
--   status apapun (kecuali Moved) -> status apapun (kecuali Moved): BEBAS
--   -> 'Moved': HANYA lewat operasi "move to client" (bikin row Client + PIC),
--               tidak boleh lewat update status biasa
--   'Moved' -> apapun: DITOLAK, baris terkunci total, tidak ada undo

CREATE TABLE client (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL UNIQUE, -- format CL26-00001
  brand_name TEXT NOT NULL, -- selalu UPPERCASE saat disimpan
  entity_name TEXT NOT NULL DEFAULT '', -- selalu UPPERCASE
  entity_type TEXT,
  entity_type_other TEXT,
  head_office TEXT, -- FK lemah ke master_data (category='Head_Office'), validasi di app layer
  website TEXT,
  industry TEXT, -- FK lemah ke master_data (category='Industry')
  client_source TEXT, -- FK lemah ke master_data (category='Client_Source')
  is_from_lead BOOLEAN NOT NULL DEFAULT false, -- IMMUTABLE setelah dibuat
  drive_folder_id TEXT,
  other_notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- ATURAN: kalau is_from_lead = true, client_source WAJIB terkunci ke 'Inbound'
-- (tolak update yang mengubahnya di application layer).
-- DELETE: hanya boleh kalau TIDAK ADA project yang mereferensikan client ini
-- (ON DELETE RESTRICT dari project.client_id sudah cukup untuk ini).

CREATE TABLE pic_client (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  pic_name TEXT NOT NULL,
  title TEXT, email TEXT, phone TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- INVARIANT: maksimal 1 pic_client per client_id dengan is_primary = true.
-- Tegakkan dengan partial unique index:
CREATE UNIQUE INDEX one_primary_pic_per_client
  ON pic_client (client_id) WHERE is_primary;
-- Kalau tidak ada satupun is_primary=true untuk suatu client, aplikasi harus
-- fallback ke pic_client pertama yang dibuat (created_at paling awal) sebagai
-- "PIC utama" saat ditampilkan — INI PERILAKU YANG DISENGAJA (kompatibilitas
-- data lama), bukan bug.

CREATE TABLE project (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT UNIQUE, -- format PRJ26-00001, NULL selama masih draft (pakai id UUID sebagai identitas sementara)
  project_name TEXT,
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE RESTRICT,
  consultant_employee_id UUID REFERENCES employee(id),
  consultant_name_fallback TEXT, -- kolom lama 'Consultant' (nama bebas), pertahankan sebagai fallback tampilan kalau consultant_employee_id NULL/ambigu
  services TEXT[], -- ganti kolom JSON lama; nilai valid: 'CSR','Sustainability Services','Event','Ads Sponsorship','Placement & Production'
  service_categories JSONB, -- object {service: [category,...]}, lihat mapping di bagian bawah
  program_type TEXT CHECK (program_type IN ('KB.ORG Program','Client Program')),
  program_category TEXT, -- 'Teach4Hope','Ganavira','Askara Nusantara','Generasi Sehat','Harpa','Custom Program'
  program_name TEXT,
  issues TEXT[], -- 'Social','Health','Empowerment','Education','Environment','Momentum'
  other_notes TEXT,
  is_retainer BOOLEAN NOT NULL DEFAULT false, -- SEKALI true, TIDAK BISA dimatikan lagi
  allow_manual_deal BOOLEAN NOT NULL DEFAULT false,
  stage TEXT NOT NULL DEFAULT 'Prospect' CHECK (stage IN ('Prospect','Negotiation','Won','Loss')),
  pre_loss_stage TEXT, -- simpan stage sebelum masuk Loss, buat undo
  stage_changed_at TIMESTAMPTZ,
  total_gdv NUMERIC NOT NULL DEFAULT 0, -- HARUS dihitung ulang dari revenue_breakdown, jangan andalkan nilai tersimpan sebagai source of truth
  total_service_revenue NUMERIC NOT NULL DEFAULT 0,
  ads_kpi_target NUMERIC, -- NULLABLE, JANGAN default 0 -- '' dan 0 beda makna: NULL = "belum ditetapkan", 0 = "target nol"
  is_draft BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- STATE MACHINE stage (WAJIB SERVER-SIDE, ini yang paling sering dilanggar UI-only di sistem lama):
--  (a) OTOMATIS dari dokumen: hanya boleh MAJU (Prospect < Negotiation < Won),
--      TIDAK PERNAH mundur, dan TIDAK PERNAH berjalan kalau stage saat ini = Loss.
--      Logika penentuan target stage:
--        - project tanpa dokumen QUOTATION sama sekali -> tidak bisa Won otomatis
--        - kalau ADA quotation dengan status != 'LOSS' DAN SEMUA sudah stage Done -> target Won
--        - else kalau ada dokumen DECK/COR/RAB/PRODCOST dengan stage Done -> target Negotiation
--      PKS, TRANSFER_REQUEST, BAST TIDAK PERNAH memengaruhi stage project.
--  (b) MANUAL dropdown: hanya boleh dipakai kalau allow_manual_deal = true,
--      kalau true bebas ke stage manapun termasuk mundur.
--  (c) LOSS manual: independen dari allow_manual_deal (sengaja lepas dari toggle itu).
--      markLoss ditolak kalau sudah Won/Loss. undoLoss balik ke pre_loss_stage
--      (fallback 'Prospect' kalau kosong).
-- LOCK: kalau stage = 'Won', TOLAK update ke project_name, consultant,
--   services, service_categories, program_type, program_category, program_name,
--   issues. other_notes & other_document_links TETAP BOLEH diubah. Stage
--   'Loss' TIDAK dikunci (masih bisa diedit).

CREATE TABLE revenue_breakdown (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  value_type TEXT NOT NULL CHECK (value_type IN ('GDV','SERVICE')),
  item_name TEXT NOT NULL, -- kalau GDV: slug link campaign; kalau SERVICE: nama service/category
  amount NUMERIC NOT NULL DEFAULT 0, -- baris Ads Sponsorship SELALU 0 (nominal riil dari ads_sponsorship_progress)
  entry_date DATE,
  source_service TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- PERILAKU: tabel ini di-REPLACE PENUH tiap kali project.revenue_breakdown
-- disimpan ulang (delete semua baris project itu, insert baru). Ini artinya
-- id lama TIDAK stabil antar-save -- JANGAN pernah menjadikan id tabel ini
-- sebagai foreign key dari tabel lain.

CREATE TABLE achievement_target (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'CONSULTANT' CHECK (scope IN ('CONSULTANT','DEPARTMENT')),
  consultant_employee_id UUID REFERENCES employee(id),
  consultant_name TEXT NOT NULL, -- unique case-insensitive per scope=CONSULTANT
  target_gdv NUMERIC NOT NULL DEFAULT 0,
  target_service_revenue NUMERIC NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Tepat 1 baris scope='DEPARTMENT' harus ada (upsert, bukan insert baru tiap kali).
```

### Document Pipeline + COR + Quotation

```sql
CREATE TABLE document_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id TEXT NOT NULL UNIQUE, -- format DOC26-00001
  project_id UUID REFERENCES project(id), -- NULLABLE HANYA untuk document_type = 'COR'
  document_type TEXT NOT NULL CHECK (document_type IN ('DECK','QUOTATION','COR','RAB','PRODCOST','PKS','TRANSFER_REQUEST','BAST')),
  entity TEXT CHECK (entity IN ('YKB (Yayasan Kita Bisa)','PT KAI (PT Kolaborasi Aksi Indonesia)')), -- hanya untuk QUOTATION
  status TEXT NOT NULL, -- kosakata berbeda per document_type, lihat tabel status di bawah
  stage TEXT NOT NULL CHECK (stage IN ('New Request','In Progress','Client Review','Done')),
  document_link TEXT,
  notes TEXT,
  requested_by TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (project_id IS NOT NULL OR document_type = 'COR'),
  CHECK (document_type = 'QUOTATION' OR entity IS NULL)
);
-- Satu project boleh punya BANYAK dokumen COR (kumulatif, bukan revisi
-- saling menggantikan) -- tipe lain hanya 1 per (project, type), atau
-- 1 per (project, type, entity) untuk QUOTATION:
CREATE UNIQUE INDEX uniq_doc_per_project_type
  ON document_pipeline (project_id, document_type)
  WHERE document_type NOT IN ('COR','QUOTATION');
CREATE UNIQUE INDEX uniq_quotation_per_project_entity
  ON document_pipeline (project_id, document_type, entity)
  WHERE document_type = 'QUOTATION';

-- Status valid per document_type (WAJIB divalidasi di server sebagai state
-- machine sungguhan -- ini TIDAK ADA di sistem lama dan itu bug keamanan
-- serius yang ditemukan, JANGAN diulang):
--   DECK:              Not Started -> Drafting -> Sent(=Done)
--   RAB/PRODCOST/PKS:  Not Started -> Drafting -> Sent(=Client Review) -> Signed(=Done)
--   TRANSFER_REQUEST:  Not Started -> Request(=In Progress) -> Sent(=Done)
--   BAST:              Not Started -> Request(=In Progress) -> Sent(=Client Review) -> Signed(=Done)
--   COR:               Not Started -> Drafting -> Waiting Approval -> Approved(=Done)
--                       Waiting Approval -> Revision -> Waiting Approval (bisa berulang)
--   QUOTATION:         Not Started -> Drafting -> Waiting Approval -> Approved(=Done)
--                       Waiting Approval -> Revision -> Waiting Approval (berulang)
--                       Approved -> Signed(=Done) | Revision
--                       Signed -> Revision
--                       (Not Started..Approved..Signed) -> LOSS(=Done) [manual, kapan saja]
-- 'Approved' untuk QUOTATION = approval INTERNAL Head of B2B, BUKAN berarti
-- client sudah tanda tangan (itu baru terjadi di transisi ke 'Signed').
-- BUAT endpoint terpisah untuk "update status manual" (admin ubah dropdown)
-- vs "status yang digerakkan sistem" (approval flow) -- jangan satu endpoint
-- generik yang menerima status apapun tanpa validasi transisi seperti di
-- sistem lama.

CREATE TABLE document_attachment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES document_pipeline(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('UPLOAD','LINK','GENERATE')),
  drive_file_id TEXT NOT NULL,
  display_name TEXT,
  file_url TEXT, -- cache, BOLEH basi, selalu ambil ulang dari Drive API kalau butuh akurat
  added_by TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Melepas attachment (hapus baris ini) TIDAK menghapus file aslinya di
-- Google Drive -- ini keputusan produk yang disengaja, pertahankan.

CREATE TABLE document_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES document_pipeline(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('APPROVAL_REQUESTED','APPROVED','REJECTED')),
  round_no INT NOT NULL,
  actor_name TEXT, actor_email TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- APPEND-ONLY, tidak ada update/delete. round_no naik HANYA saat
-- APPROVAL_REQUESTED baru; APPROVED/REJECTED memakai round_no yang sedang
-- berjalan. Pencatatan baris ini TIDAK BOLEH membatalkan approval/reject
-- yang sudah terjadi kalau gagal ditulis (best-effort, log error saja).

CREATE TABLE cor_header (
  doc_id UUID PRIMARY KEY REFERENCES document_pipeline(id) ON DELETE CASCADE,
  cor_method TEXT NOT NULL DEFAULT 'GROSS_UP' CHECK (cor_method IN ('GROSS_UP','GROSS_DOWN')),
  is_via_salset BOOLEAN NOT NULL DEFAULT false,
  is_salset_only BOOLEAN NOT NULL DEFAULT false,
  vendor_entity_id UUID REFERENCES cor_entity(id), -- FK BENAR (sistem lama simpan nama teks, perbaiki jadi FK)
  ngo_rate_pct NUMERIC NOT NULL DEFAULT 10,
  biaya_salset NUMERIC NOT NULL DEFAULT 0,
  is_mix_fund BOOLEAN NOT NULL DEFAULT false,
  single_fund_type TEXT CHECK (single_fund_type IN ('CLIENT','CAMPAIGN')),
  cor_tab TEXT NOT NULL CHECK (cor_tab IN ('CLIENT','CAMPAIGN')), -- kalau mix fund, akan ada 2 document_pipeline row terpisah, masing-masing 1 cor_header dengan cor_tab berbeda
  link_campaigns TEXT[],
  margin_enabled BOOLEAN NOT NULL DEFAULT true, -- default lama: undefined dibaca sebagai true, pertahankan default ini
  margin_mode TEXT NOT NULL DEFAULT 'COMPONENT' CHECK (margin_mode IN ('COMPONENT','MANUAL')),
  manual_margin_pct NUMERIC,
  manual_project_name TEXT, -- untuk COR tanpa project (project_id NULL)
  -- approval
  approval_token UUID,
  approval_expires_at TIMESTAMPTZ,
  approval_requested_to TEXT, approval_requested_name TEXT, approval_requested_at TIMESTAMPTZ,
  approval_resolved_at TIMESTAMPTZ,
  rejection_note TEXT,
  approved_by UUID REFERENCES employee(id), -- FK BENAR (sistem lama simpan nama teks)
  approved_at TIMESTAMPTZ,
  pdf_file_id TEXT, pdf_file_url TEXT,
  -- konversi Gross Up -> Gross Down (satu arah, permanen)
  gross_up_snapshot JSONB,
  converted_at TIMESTAMPTZ,
  -- cost monitoring
  cost_monitoring_closed BOOLEAN NOT NULL DEFAULT false, -- SEKALI true, TIDAK ADA cara membuka lagi
  cost_monitoring_closed_by UUID REFERENCES employee(id),
  cost_monitoring_closed_at TIMESTAMPTZ,
  output_file_id_client TEXT, output_file_id_campaign TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cor_fund (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES cor_header(doc_id) ON DELETE CASCADE,
  fund_type TEXT NOT NULL CHECK (fund_type IN ('CLIENT','CAMPAIGN')),
  link_campaign TEXT,
  campaign_fund_kind TEXT CHECK (campaign_fund_kind IN ('CAMPAIGN','DBT','FRAUD','CLIENT')), -- HANYA untuk fund_type='CAMPAIGN', label pelacakan saja, TIDAK memengaruhi kalkulasi
  gdv NUMERIC NOT NULL, -- nominal masuk
  is_zakat BOOLEAN NOT NULL DEFAULT false,
  tech_fee_manual BOOLEAN NOT NULL DEFAULT false,
  manual_tech_fee NUMERIC, -- diisi kalau tech_fee_manual = true
  sort_order INT NOT NULL DEFAULT 0
  -- platform_fee, tech_fee, ndv, disbursement_fee, implementation_fund:
  -- JANGAN disimpan sebagai kolom -- hitung ulang tiap kali dengan fungsi
  -- fundCalc() (lihat bagian RUMUS COR di bawah), supaya tidak ada 2 sumber
  -- kebenaran untuk angka yang sama.
);
-- REPLACE-PER-DOC: setiap "Simpan Draft" COR, hapus semua baris cor_fund
-- milik doc_id itu lalu insert ulang dari form.

CREATE TABLE cor_cost (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES cor_header(doc_id) ON DELETE CASCADE,
  cor_tab TEXT NOT NULL CHECK (cor_tab IN ('CLIENT','CAMPAIGN')),
  cost_group TEXT NOT NULL CHECK (cost_group IN ('SAL','VENDOR')), -- SAL = biaya SALSET, VENDOR = biaya vendor (disebut BAA di rumus)
  cost_mode TEXT NOT NULL DEFAULT 'GROUPED' CHECK (cost_mode IN ('GROUPED','STANDALONE_ITEM','STANDALONE_NO_ITEM')),
  row_role TEXT NOT NULL DEFAULT 'PRICE' CHECK (row_role IN ('PRICE','ITEM')),
  keterangan TEXT, kategori TEXT,
  tipe TEXT CHECK (tipe IN ('Lembaga','Individu')), -- untuk tarif PPh 23
  harga NUMERIC NOT NULL DEFAULT 0,
  qty NUMERIC NOT NULL DEFAULT 1,
  periode NUMERIC NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  category_order INT
);
-- ATURAN KRITIS: baris row_role='ITEM' TIDAK PERNAH ikut penjumlahan
-- apapun (murni nama/rincian, harga/qty/periode-nya diabaikan). Kepemilikan
-- nominal ditandai row_role, BUKAN disimpulkan dari urutan baris.
-- REPLACE-PER-DOC seperti cor_fund.

CREATE TABLE cor_margin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES cor_header(doc_id) ON DELETE CASCADE,
  cor_tab TEXT NOT NULL CHECK (cor_tab IN ('CLIENT','CAMPAIGN')),
  component TEXT NOT NULL CHECK (component IN ('CONS','CRE','PROG','IMP')),
  sub_category TEXT NOT NULL, -- SENGAJA teks, snapshot temporal dari margin_guide saat itu, BUKAN foreign key -- kalau margin_guide direvisi nanti, dokumen lama TETAP menunjukkan angka lama
  percentage NUMERIC NOT NULL
);
-- 4 baris per cor_tab (8 kalau mix fund). REPLACE-PER-DOC.

CREATE TABLE cor_result (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES cor_header(doc_id) ON DELETE CASCADE,
  cor_tab TEXT NOT NULL CHECK (cor_tab IN ('CLIENT','CAMPAIGN')),
  -- simpan SEMUA angka output dari computeGD() (lihat bagian rumus) sebagai
  -- ledger permanen: total_masuk, sal_fee, cash_gross, ppn_gd, pph23,
  -- cash_net, profit, avail_cost, total_sal, total_baa, pm_profit, pm_pct, dst.
  snapshot JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doc_id, cor_tab)
);
-- Hanya diisi untuk cor_method='GROSS_DOWN' (Gross Up tidak punya ledger
-- final). REPLACE-PER-DOC (hapus+insert ulang tiap save draft GROSS_DOWN).

CREATE TABLE cor_budget_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- STABIL SELAMANYA setelah snapshot dibuat
  doc_id UUID NOT NULL REFERENCES cor_header(doc_id) ON DELETE CASCADE,
  cor_tab TEXT NOT NULL,
  cost_group TEXT NOT NULL,
  keterangan TEXT, kategori TEXT,
  budgeted_amount NUMERIC NOT NULL, -- BEKU sejak snapshot, TIDAK PERNAH diupdate lagi
  sort_order INT,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Dibuat SEKALI saat COR di-approve (snapshot dari cor_cost saat itu,
-- baris row_role='ITEM' dibuang -- tidak punya nominal sendiri). Append-once,
-- efektif immutable. Ini baseline anggaran, BUKAN nilai terkini.

CREATE TABLE cor_disbursement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES cor_header(doc_id) ON DELETE CASCADE,
  budget_item_id UUID NOT NULL REFERENCES cor_budget_item(id),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  disbursement_date DATE,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- APPEND-ONLY, tidak ada update/delete. Tolak insert kalau cor_header terkait
-- sudah cost_monitoring_closed = true.

CREATE TABLE quotation_header (
  doc_id UUID PRIMARY KEY REFERENCES document_pipeline(id) ON DELETE CASCADE,
  entity_code TEXT NOT NULL CHECK (entity_code IN ('YKB','KAI')), -- diturunkan dari document_pipeline.entity
  language TEXT NOT NULL DEFAULT 'ID' CHECK (language IN ('EN','ID')),
  quotation_number TEXT UNIQUE, -- format QO/0001/VIII/2026/KAI/CL26-00001, sequence GABUNGAN YKB+KAI per tahun, dibuat sekali saat draft pertama disimpan, TIDAK PERNAH berubah walau direvisi
  valid_days INT, valid_date DATE, hide_valid_date BOOLEAN NOT NULL DEFAULT false,
  pic_client_id UUID REFERENCES pic_client(id),
  pic_name TEXT, pic_email TEXT, pic_phone TEXT, pic_title TEXT, -- SNAPSHOT, bukan live join ke pic_client
  head_name TEXT, title_name TEXT, service_name TEXT,
  first_statement TEXT, important_remarks TEXT, -- teks panjang multi-line dengan token [Nama PIC]
  agency_fee_rate NUMERIC, hide_agency_fee BOOLEAN NOT NULL DEFAULT false, -- HANYA berlaku entity_code='KAI'
  single_box_price BOOLEAN NOT NULL DEFAULT false,
  pdf_file_id TEXT, pdf_file_url TEXT,
  signature_file_id TEXT, -- khas Quotation, tidak ada di COR
  -- approval, SAMA POLA dengan cor_header, WAJIB dibawa manual dari
  -- existing row setiap "Simpan Draft" agar tidak tertimpa kosong:
  approval_token UUID, approval_expires_at TIMESTAMPTZ,
  approval_requested_to TEXT, approval_requested_name TEXT, approval_requested_at TIMESTAMPTZ,
  approval_resolved_at TIMESTAMPTZ, rejection_note TEXT,
  approved_by UUID REFERENCES employee(id), approved_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- PERINGATAN DESAIN: gunakan PATCH/UPDATE parsial untuk field approval di
-- atas, JANGAN pernah replace seluruh row saat "Simpan Draft" -- ini
-- adalah bug nyata di sistem lama (draft yang disimpan ulang setelah
-- approval menghapus approved_by/approval_token). Rancang API/ORM Anda
-- supaya save draft HANYA menyentuh kolom form (bukan kolom approval).

CREATE TABLE quotation_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES quotation_header(doc_id) ON DELETE CASCADE,
  category_label TEXT, category_sort_order INT,
  category_mode TEXT NOT NULL DEFAULT 'grouped' CHECK (category_mode IN ('grouped','standalone_with_item','standalone_without_item')),
  row_role TEXT NOT NULL DEFAULT 'PRICE' CHECK (row_role IN ('PRICE','ITEM')), -- TAMBAHKAN kolom ini walau tidak ada di sistem lama -- sistem lama menyimpulkan dari urutan baris, ini perbaikan yang disengaja
  item_label TEXT, item_sort_order INT,
  value NUMERIC, qty NUMERIC,
  remarks_detail TEXT
);
-- REPLACE-PER-DOC seperti cor_fund/cor_cost.
```

### GDV/Ads (data eksternal dari Tableau)

```sql
CREATE TABLE gdv_controller_upload_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by TEXT,
  brand_file_name TEXT, brand_row_count INT,
  not_brand_file_name TEXT, not_brand_row_count INT,
  total_row_count INT
);

CREATE TABLE gdv_controller (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_log_id UUID REFERENCES gdv_controller_upload_log(id),
  campaigner_name TEXT, campaigner_id TEXT,
  tableau_project_id TEXT, -- BUKAN project.id Techford, jangan digabung
  link_campaign TEXT NOT NULL, -- kunci pencocokan, BUKAN unique
  fundraiser_name TEXT, child_id TEXT, child_short_url TEXT,
  project_launch_year INT, project_status TEXT,
  main_source TEXT,
  realized_nominal NUMERIC,
  platform_fee NUMERIC, subscription_fee NUMERIC, bank_charge_fee NUMERIC,
  source_category TEXT CHECK (source_category IN ('Brand','Not-Brand')) -- ditambahkan server, bukan dari CSV
);
-- REPLACE-ALL setiap upload pasangan file (hapus semua baris lama, insert
-- baru) -- tidak ada riwayat versi data di tabel ini, riwayatnya ada di
-- gdv_controller_upload_log.

CREATE TABLE ads_sponsorship_progress_upload_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by TEXT, file_name TEXT,
  account_names TEXT[], -- normalisasi dari "A, B, C" jadi array asli
  row_count INT, skipped_count INT
);

CREATE TABLE ads_sponsorship_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_log_id UUID REFERENCES ads_sponsorship_progress_upload_log(id),
  snapshot_at TIMESTAMPTZ NOT NULL,
  account_name TEXT NOT NULL,
  short_url TEXT, campaign_id TEXT NOT NULL,
  current_gdv NUMERIC, current_ndv NUMERIC, active_wallet_amount NUMERIC, -- NULLABLE, JANGAN default 0 -- '' (belum ada data) beda makna dari 0 (dana benar2 kosong, bisa memicu keputusan pencairan salah)
  project_status TEXT -- teks bebas dari Tableau, BUKAN enum
);
-- APPEND-ONLY (dua alasan disengaja: (1) file datang per-klien, replace-all
-- akan hapus data klien lain; (2) "progress" secara semantik = riwayat
-- pergerakan, active_wallet_amount yang turun berarti ada pencairan).
-- Baca data terbaru per campaign: SELECT DISTINCT ON (campaign_id) ...
-- ORDER BY campaign_id, snapshot_at DESC.
-- TIDAK ADA relasi dengan gdv_controller meski sama "asal" (Tableau) --
-- jangan digabung.
```

### Referensi cepat: nilai enum tetap yang tidak boleh divalidasi lewat master_data

```
Project.services: CSR | Sustainability Services | Event | Ads Sponsorship | Placement & Production
Project.service_categories per service:
  CSR -> Corporate Donation | Employee Donation | Customer Donation | Public Donation | Zakat
  Sustainability Services -> Monitoring & Evaluation | Impact Measurement
  Event -> Beyond The Game | Voluntrip | Ekspedisi Kitabisa
  Ads Sponsorship, Placement & Production -> [] (sengaja tanpa sub-kategori)
Project.issues: Social | Health | Empowerment | Education | Environment | Momentum
Project.program_category: Teach4Hope | Ganavira | Askara Nusantara | Generasi Sehat | Harpa | Custom Program
```

---

## RUMUS PERHITUNGAN COR — SPESIFIKASI PALING KRITIS (implementasikan sebagai package TypeScript murni, dipakai frontend DAN backend, satu sumber kebenaran)

Semua nilai uang dibulatkan ke rupiah utuh dengan `round()` yang aman terhadap NaN/Infinity (kembalikan 0).

```typescript
function pphRate(kategori: string, tipe: string): number {
  if (kategori === 'Jasa' && tipe === 'Lembaga') return 0.02;
  if (kategori === 'Jasa' && tipe === 'Individu') return 0.025;
  return 0;
}

// Satu baris biaya (cor_cost / quotation_item)
function calcItemRow(item): { total: number; tap: number } {
  if (item.rowRole === 'ITEM') return { total: 0, tap: 0 }; // baris ITEM tidak pernah punya nominal
  const total = round(item.harga * item.qty * item.periode);
  const rt = pphRate(item.kategori, item.tipe);
  const tap = rt > 0 ? total / (1 - rt) : total; // "total after PPh" -- gross-up pajak vendor
  return { total, tap };
}

// Biaya admin bank, per kelipatan Rp200 juta dibulatkan ke atas
function adminFee(bankRate: number, afterFee: number): number {
  if (afterFee <= 0) return 0;
  return Math.ceil(afterFee / 200_000_000) * bankRate;
}

// Fee per baris dana masuk
function fundCalc(f, biayaPencairan: number) {
  const pf = (f.fundType === 'CLIENT' && !f.isZakat) ? round(f.nominal * 0.05) : 0; // Platform Fee 5%, NOL utk Zakat/Bencana
  const tf = f.fundType === 'CLIENT'
    ? (f.techFeeManual ? round(f.manualTechFee) : round(f.nominal * 0.01)) // Tech Fee 1%, TETAP dikenakan walau Zakat/Bencana
    : 0; // dana CAMPAIGN tidak kena PF maupun TF sama sekali
  const af = f.nominal - pf - tf; // NDV
  const adm = adminFee(biayaPencairan, af);
  const total = af - adm; // Implementation Fund
  return { pf, tf, af, adm, total };
}
```

### `computeGD` — Gross Down (dana SUDAH masuk, satu-satunya metode yang bisa diajukan approval). URUTAN LANGKAH INI TIDAK BOLEH DIUBAH:

```typescript
function computeGD(opts) {
  // 1. Total dana masuk
  const totalMasuk = sum(opts.funds.map(f => fundCalc(f, opts.biayaPencairan).total));

  // 2. Lapisan SALSET (kalau isViaSalset)
  let salFee = 0, sisaDana = 0, cashGross;
  if (opts.isViaSalset) {
    salFee = round(totalMasuk * (opts.ngoRatePct / 100)); // default ngoRatePct = 10
    sisaDana = totalMasuk - salFee;
    cashGross = sisaDana - opts.biayaSalset;
  } else {
    cashGross = totalMasuk;
  }

  // 3. Pajak sisi vendor
  const ppnGd = opts.pkp ? round(cashGross / 1.11) : cashGross; // keluarkan PPN 11%
  const pph23 = opts.pphOn ? round(ppnGd * 0.02) : 0;
  const cashNet = ppnGd - pph23; // "Cash In Vendor (Net)"
  // pphOn ditentukan PEMANGGIL, bukan di dalam fungsi:
  //   pphOn = isViaSalset || ada baris dana ber-fundType CLIENT

  // 4. Default Margin (profit yang diambil di muka)
  let totalMgnFrac: number;
  if (opts.marginEnabled === false) totalMgnFrac = 0;
  else if (opts.marginMode === 'MANUAL') totalMgnFrac = opts.manualMarginPct / 100;
  else totalMgnFrac = sum(opts.marginComponents.map(m => m.percentage / 100)); // 4 komponen: CONS, CRE, PROG, IMP

  const profit = round(cashNet * totalMgnFrac);
  const availCost = cashNet - profit;

  // 5. Total biaya
  const totalSal = round(sum(opts.salItems.map(i => calcItemRow(i).tap)));
  const totalBaa = round(sum(opts.baaItems.map(i => calcItemRow(i).tap)));

  // 6. Blok SPP
  const dpp = ppnGd;
  const ppn11 = opts.pkp ? round(dpp * 0.11) : 0;
  const pphSpp = opts.pphOn ? round(dpp * 0.02) : 0;
  const neto = dpp - pphSpp;

  // 7. Margin & Profit AKTUAL (INDEPENDEN dari Default Margin langkah 4)
  let pmProfit = cashNet - totalBaa;
  let pmPct = cashNet > 0 ? pmProfit / cashNet : 0;

  // 8. WAJIB ADA -- pengecualian "SALSET Saja": tidak lewat vendor sama
  // sekali, jadi totalBaa selalu 0, dan tanpa langkah ini cashNet - 0 akan
  // SALAH membaca seluruh sisa dana sebagai profit. Ini bug nyata yang
  // pernah terjadi di produksi sistem lama.
  if (opts.salsetOnly) { pmProfit = 0; pmPct = 0; }

  return { totalMasuk, salFee, sisaDana, cashGross, ppnGd, pph23, cashNet,
           profit, availCost, totalSal, totalBaa, dpp, ppn11, pphSpp, neto,
           pmProfit, pmPct };
}
```

### `computeGU` — Gross Up (dana BELUM masuk, alat nego, tidak bisa diajukan approval, harus dikonversi ke Gross Down dulu). Kebalikan arah, semua pembagian adalah gross-up:

```typescript
function computeGU(opts) {
  const ngoRateFrac = (opts.ngoRatePct || 10) / 100;
  const totalGuSal = round(sum(opts.salItems.map(i => calcItemRow(i).tap)));
  const totalGuBaa = round(sum(opts.baaItems.map(i => calcItemRow(i).tap)));
  const guTotalMgnFrac = sum(opts.marginComponents.map(m => m.percentage / 100));

  const salGu = opts.isViaSalset ? totalGuSal / (1 - ngoRateFrac) : 0;
  const guMargin = guTotalMgnFrac < 1 ? totalGuBaa / (1 - guTotalMgnFrac) : totalGuBaa;
  const guPph = guMargin / 0.98; // gross-up PPh 23 2%
  const guPpn = opts.pkp ? guPph * 1.11 : guPph; // tambah PPN 11%

  let guBaa, totalHasilGu;
  if (opts.isViaSalset) {
    guBaa = guPpn / (1 - ngoRateFrac);
    totalHasilGu = salGu + guBaa;
  } else {
    guBaa = guPpn;
    totalHasilGu = guPpn;
  }

  const guAdmin = adminFee(opts.biayaPencairan, totalHasilGu);
  // KONSTANTA 0.94 = 1 - 0.05 (Platform Fee) - 0.01 (Tech Fee). KALAU TARIF
  // FEE INI BERUBAH DI MASA DEPAN, KONSTANTA INI HARUS IKUT DIUBAH -- jangan
  // hardcode 0.94, definisikan sebagai (1 - PLATFORM_FEE_RATE - TECH_FEE_RATE)
  const guFinal = (totalHasilGu + guAdmin) / (1 - 0.05 - 0.01);

  // Blok SPP -- CATATAN: guPphSpp TIDAK punya gerbang pphOn (beda dari
  // computeGD) -- di Gross Up, PPh selalu dihitung tanpa syarat. Pertahankan
  // apa adanya, ini perilaku produksi yang sudah dipakai.
  const guDpp = guPph;
  const guPpn11 = opts.pkp ? round(guDpp * 0.11) : 0;
  const guPphSpp = round(guDpp * 0.02);
  const guNeto = guDpp - guPphSpp;
  const guProfit = guMargin - totalGuBaa;
  const guSalFee = opts.isViaSalset ? round(totalHasilGu * ngoRateFrac) : 0;

  return { salGu, guMargin, guPph, guPpn, guBaa, totalHasilGu, guAdmin,
           guFinal, guDpp, guPpn11, guPphSpp, guNeto, guProfit, guSalFee };
}
```

### Margin Guard (validasi WAJIB sebelum request approval, HITUNG ULANG DI SERVER, jangan percaya angka yang sudah tampil di client):

```typescript
const planPct = round(totalMgnFrac * 10000) / 100;   // dari Default Margin (langkah 4 computeGD)
const actualPct = round(pmPct * 10000) / 100;         // dari (cashNet - totalBaa) / cashNet (langkah 7)
const below = actualPct < planPct;
// kalau below === true: WAJIB ada field alasan (marginAckNote) sebelum
// request approval boleh dikirim. Alasan ini harus ditaruh PALING ATAS di
// email approval, sebelum link approve/reject manapun.
// Margin guard TIDAK BERLAKU untuk: cor_method='GROSS_UP' (belum ada angka
// final), dan is_salset_only=true (profit-nya memang selalu 0 by design,
// pagar akan selalu menyala dan jadi gangguan bukan pengaman).
```

### Alur approval COR (implementasikan sebagai flow lengkap):

1. `saveDraft`: status `Not Started` → `Drafting` (tidak pernah mundur setelah ini)
2. `requestApproval(docId, approverId, marginAckNote?)`:
   - Validasi: `cor_method` harus `GROSS_DOWN` (tolak kalau masih `GROSS_UP`)
   - Validasi: approver harus employee dengan `role = 'Head of B2B'`
   - Evaluasi ULANG margin guard di server; kalau below dan `marginAckNote` kosong → tolak
   - Generate PDF (tanpa cap approval) dari template COR, simpan ke Google Drive
   - Generate `approval_token` = UUID acak, `approval_expires_at` = now + 14 hari. Kalau ada token lama yang belum resolved, matikan (invalidate)
   - Kirim email ke approver: alasan margin (kalau ada, PALING ATAS) + link PDF + link Approve + link Reject — SEMUA tanpa perlu login (magic link)
   - Status → `Waiting Approval`, kalkulator dikunci di UI (read-only)
3. Endpoint publik (tanpa auth) untuk klik dari email, dengan 3 gerbang validasi berurutan, MASING-MASING pesan error BEDA (supaya user tidak bingung "sistem rusak" untuk kasus yang sebenarnya cuma kedaluwarsa):
   - Token tidak cocok di database → "Link sudah tidak berlaku, mungkin ada permintaan approval yang lebih baru."
   - `approval_resolved_at` sudah terisi → "Dokumen ini sudah diputuskan sebelumnya."
   - Sudah melewati `approval_expires_at` → "Link kedaluwarsa pada [tanggal], minta pengaju kirim ulang."
4. Approve → regenerate PDF + footer "Approved by [nama] — [tanggal]", status → `Approved`, snapshot `cor_cost` (baris `row_role != 'ITEM'`) ke `cor_budget_item` (best-effort, jangan sampai approval gagal kalau snapshot gagal — log error saja)
5. Reject (wajib isi alasan) → status → `Revision`, kalkulator ke-unlock lagi, bisa `requestApproval` ulang (token lama otomatis invalid)

---

## AUTENTIKASI & OTORISASI — INI BAGIAN YANG HARUS DIPERBAIKI, JANGAN TIRU SISTEM LAMA

Sistem lama TIDAK PUNYA otorisasi server-side sama sekali (hanya UI yang menyembunyikan tombol) — ini lubang keamanan serius yang HARUS ditutup di rebuild:

1. **Login**: Supabase Auth + Google OAuth, dibatasi domain `@kitabisa.com`. TIDAK ADA password custom sama sekali.
2. **Sesi**: JWT dari Supabase Auth (server-verified), bukan objek di localStorage yang bisa diedit user.
3. **Role**: simpan role (`Master Admin`, `Consultant`, `Operation`, `Head of B2B`) di tabel `employee`, terhubung ke `auth.users.id` (Supabase) lewat kolom `auth_user_id UUID REFERENCES auth.users(id)`.
4. **Otorisasi WAJIB DI SERVER, per endpoint, deny-by-default** (bukan seperti sistem lama yang "halaman tak terdaftar = akses penuh untuk semua role"). Tulis satu middleware/guard yang dicek di SETIAP API route sebelum logic apapun jalan, mengacu ke matriks berikut:

| Halaman/fitur | Master Admin | Consultant | Operation | Head of B2B |
|---|---|---|---|---|
| Dashboard | full | full | full | full |
| Lead Capturing | full | full | view | full |
| Client Monitoring | full | full | view | full |
| Sales Pipeline | full | full | view | full |
| Document Pipeline, COR, Quotation | full | full | full | full |
| Cost Monitoring | full | view | full | full |
| Configure Account, Master Data, Achievement Setting | full | none | none | none |
| GDV Controller | full | none | full | full |
| GDV Matching, Ads Progress | full | full | full | full |

5. **State machine dokumen ditegakkan di server** (lihat bagian document_pipeline di atas) — jangan biarkan endpoint update status menerima transisi sembarangan.
6. **Audit log sungguhan**: buat tabel `audit_log (id, actor_user_id, action, entity_type, entity_id, diff JSONB, created_at)`, diisi otomatis di setiap mutasi penting (create/update/delete/approve/reject) dengan identitas USER SUNGGUHAN yang login (dari JWT), bukan akun service/deploy generik. Sistem lama TIDAK PERNAH punya ini — ini kebutuhan nyata yang harus dibangun dari awal, bukan ditambahkan belakangan.
7. Invariant: harus selalu ada minimal 1 `employee` dengan `role='Master Admin'` dan status aktif — cegah lewat application logic (tolak nonaktifkan/downgrade role Master Admin terakhir).

---

## INTEGRASI EKSTERNAL

- **Google Drive**: buat folder per client (`{Client_ID}-{Brand_Name}`) dan per project (nested di bawah folder client, `{Project_ID}-{Client_ID}-{Brand_Name}`) di dalam satu Shared Drive. Simpan `drive_folder_id`, JANGAN cari folder lewat nama (nama murni kosmetik, bisa berubah). Kalau folder hilang/ke-trash, buat ulang otomatis (idempoten, self-healing) saat dibutuhkan lagi.
- **Upload CSV GDV Controller**: WAJIB 2 file sekaligus (Brand + Not-Brand), validasi 15 kolom harus lengkap (tolak keras kalau ada yang hilang), REPLACE-ALL isi tabel `gdv_controller` tiap upload.
- **Upload CSV Ads Progress**: N file (1 file = 1 account_name), validasi 7 kolom, APPEND-ONLY (JANGAN replace-all di sini — beda pola sengaja dari GDV Controller karena data datang per-klien).
- **Email approval**: pakai Gmail API dari akun Workspace kitabisa.com, isi: link Approve, link Reject, link PDF, dan alasan margin (kalau ada) diletakkan paling atas.
- **PDF generation**: template COR dan Quotation harus WYSIWYG sama dengan angka final dari `computeGD`/`computeGU` — jangan hitung ulang dengan cara berbeda di renderer PDF (ini justru penyebab risiko finansial terbesar di sistem lama: 3 salinan rumus yang berpotensi menyimpang).

---

## HAL YANG SENGAJA TIDAK DIPORT (jangan dibangun ulang)

- Script migrasi data sekali-pakai dari sistem lama (`migration_*`, `clientMigration_*`) — ganti dengan ETL terpisah di luar aplikasi utama, dijalankan sekali saja.
- Sheet `AuditLog` lama — tidak pernah dipakai kode apapun, mati sejak awal.
- Sistem password custom — diganti total dengan Google OAuth.
- Pola "load semua data sekaligus lalu filter di client" (`*_getAll`) — ganti dengan pagination + filter di server (`WHERE`, `LIMIT/OFFSET` atau cursor).

## URUTAN PEMBANGUNAN YANG DISARANKAN

1. Setup project (Next.js + Supabase + Google OAuth) + skema database di atas + RBAC/auth guard
2. Modul Master Data, Employee (read-only dulu untuk lookup)
3. Modul Lead → Client → Project (CRUD + state machine stage)
4. Modul Document Pipeline (state machine per tipe dokumen, TANPA COR/Quotation dulu)
5. Package kalkulasi COR (murni TypeScript, dites dengan unit test dulu SEBELUM dipasang ke UI) — bandingkan hasilnya dengan minimal 20-30 dokumen COR asli dari sistem lama, harus sama sampai satuan rupiah
6. Modul COR + Quotation (kalkulator, approval flow, PDF, email)
7. Cost Monitoring (snapshot budget, disbursement)
8. GDV Controller, GDV Matching, Ads Progress, Dashboard
9. Audit log + hardening keamanan (rate limiting API, dsb)

Bangun dengan test coverage yang baik terutama untuk package kalkulasi COR (poin 5) — ini bagian paling mahal kalau salah, karena berhubungan dengan uang nyata.
