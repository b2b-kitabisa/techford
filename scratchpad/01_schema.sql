-- ============================================================
-- Techford v2 — skema database awal
-- Jalankan SEKALI di Supabase SQL Editor (Project -> SQL Editor -> New query)
-- Urutan CREATE TABLE di bawah ini SUDAH disusun sesuai dependency
-- (tabel yang direferensikan FK dibuat lebih dulu) -- jangan diacak urutannya.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Tabel referensi / master (tidak punya FK ke tabel lain)
-- ============================================================

create table employee (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique check (email ~* '^[^@]+@kitabisa\.com$'),
  role text not null check (role in ('Master Admin','Consultant','Operation','Head of B2B')),
  status text not null default 'Active' check (status in ('Active','Inactive')),
  auth_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table master_data (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('Head_Office','Industry','Entity_Type','Client_Source')),
  value text not null,
  created_at timestamptz not null default now(),
  unique (category, value)
);

create table cor_entity (
  id uuid primary key default gen_random_uuid(),
  entity_name text not null,
  bank text,
  is_pkp boolean not null default false,
  biaya_pencairan numeric not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

create table margin_guide (
  id uuid primary key default gen_random_uuid(),
  component text not null check (component in ('CONS','CRE','PROG','IMP')),
  sub_category text not null,
  percentage numeric not null check (percentage >= 0 and percentage <= 100),
  sort_order int not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. Client (dibuat sebelum Lead karena Lead punya FK ke Client)
-- ============================================================

create table client (
  id uuid primary key default gen_random_uuid(),
  client_id text unique,
  brand_name text not null,
  entity_name text not null default '',
  entity_type text,
  entity_type_other text,
  head_office text,
  website text,
  industry text,
  client_source text,
  is_from_lead boolean not null default false,
  drive_folder_id text,
  other_notes text,
  created_by text,
  created_at timestamptz not null default now(),
  last_updated timestamptz not null default now()
);

create table pic_client (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references client(id) on delete cascade,
  pic_name text not null,
  title text, email text, phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index one_primary_pic_per_client
  on pic_client (client_id) where is_primary;

-- ============================================================
-- 3. Lead
-- ============================================================

create table lead (
  id uuid primary key default gen_random_uuid(),
  inbound_id text not null unique,
  submitted_at timestamptz not null default now(),
  status text not null default 'New Leads' check (status in ('New Leads','Contacted','Moved','Other','Spam')),
  entity_name text not null,
  entity_type text check (entity_type in ('Perusahaan','Institusi Sosial','Institusi Grants','Other')),
  entity_type_other text,
  pic_name text,
  email text,
  phone text,
  detail_interest text,
  priority_notes text,
  utm_source text, utm_medium text, utm_campaign text,
  source_token text,
  client_id uuid references client(id),
  other_notes text,
  last_updated timestamptz not null default now()
);

-- ============================================================
-- 4. Project (butuh Client + Employee)
-- ============================================================

create table project (
  id uuid primary key default gen_random_uuid(),
  project_id text unique,
  project_name text,
  client_id uuid not null references client(id) on delete restrict,
  consultant_employee_id uuid references employee(id),
  consultant_name_fallback text,
  services text[],
  service_categories jsonb,
  program_type text check (program_type in ('KB.ORG Program','Client Program')),
  program_category text,
  program_name text,
  issues text[],
  other_notes text,
  is_retainer boolean not null default false,
  allow_manual_deal boolean not null default false,
  stage text not null default 'Prospect' check (stage in ('Prospect','Negotiation','Won','Loss')),
  pre_loss_stage text,
  stage_changed_at timestamptz,
  total_gdv numeric not null default 0,
  total_service_revenue numeric not null default 0,
  ads_kpi_target numeric,
  is_draft boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  last_updated timestamptz not null default now()
);

create table revenue_breakdown (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  value_type text not null check (value_type in ('GDV','SERVICE')),
  item_name text not null,
  amount numeric not null default 0,
  entry_date date,
  source_service text,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  last_updated timestamptz not null default now()
);

create table achievement_target (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'CONSULTANT' check (scope in ('CONSULTANT','DEPARTMENT')),
  consultant_employee_id uuid references employee(id),
  consultant_name text not null,
  target_gdv numeric not null default 0,
  target_service_revenue numeric not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 5. Document Pipeline
-- ============================================================

create table document_pipeline (
  id uuid primary key default gen_random_uuid(),
  doc_id text not null unique,
  project_id uuid references project(id),
  document_type text not null check (document_type in ('DECK','QUOTATION','COR','RAB','PRODCOST','PKS','TRANSFER_REQUEST','BAST')),
  entity text check (entity in ('YKB (Yayasan Kita Bisa)','PT KAI (PT Kolaborasi Aksi Indonesia)')),
  status text not null,
  stage text not null check (stage in ('New Request','In Progress','Client Review','Done')),
  document_link text,
  notes text,
  requested_by text,
  requested_at timestamptz not null default now(),
  last_updated timestamptz not null default now(),
  check (project_id is not null or document_type = 'COR'),
  check (document_type = 'QUOTATION' or entity is null)
);

create unique index uniq_doc_per_project_type
  on document_pipeline (project_id, document_type)
  where document_type not in ('COR','QUOTATION');

create unique index uniq_quotation_per_project_entity
  on document_pipeline (project_id, document_type, entity)
  where document_type = 'QUOTATION';

create table document_attachment (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references document_pipeline(id) on delete cascade,
  source text not null check (source in ('UPLOAD','LINK','GENERATE')),
  drive_file_id text not null,
  display_name text,
  file_url text,
  added_by text,
  added_at timestamptz not null default now()
);

create table document_activity (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references document_pipeline(id) on delete cascade,
  activity_type text not null check (activity_type in ('APPROVAL_REQUESTED','APPROVED','REJECTED')),
  round_no int not null,
  actor_name text, actor_email text,
  note text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6. COR
-- ============================================================

create table cor_header (
  doc_id uuid primary key references document_pipeline(id) on delete cascade,
  cor_method text not null default 'GROSS_UP' check (cor_method in ('GROSS_UP','GROSS_DOWN')),
  is_via_salset boolean not null default false,
  is_salset_only boolean not null default false,
  vendor_entity_id uuid references cor_entity(id),
  ngo_rate_pct numeric not null default 10,
  biaya_salset numeric not null default 0,
  is_mix_fund boolean not null default false,
  single_fund_type text check (single_fund_type in ('CLIENT','CAMPAIGN')),
  cor_tab text not null check (cor_tab in ('CLIENT','CAMPAIGN')),
  link_campaigns text[],
  margin_enabled boolean not null default true,
  margin_mode text not null default 'COMPONENT' check (margin_mode in ('COMPONENT','MANUAL')),
  manual_margin_pct numeric,
  manual_project_name text,
  approval_token uuid,
  approval_expires_at timestamptz,
  approval_requested_to text, approval_requested_name text, approval_requested_at timestamptz,
  approval_resolved_at timestamptz,
  rejection_note text,
  approved_by uuid references employee(id),
  approved_at timestamptz,
  pdf_file_id text, pdf_file_url text,
  gross_up_snapshot jsonb,
  converted_at timestamptz,
  cost_monitoring_closed boolean not null default false,
  cost_monitoring_closed_by uuid references employee(id),
  cost_monitoring_closed_at timestamptz,
  output_file_id_client text, output_file_id_campaign text,
  created_by text,
  created_at timestamptz not null default now(),
  last_updated timestamptz not null default now()
);

create table cor_fund (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references cor_header(doc_id) on delete cascade,
  fund_type text not null check (fund_type in ('CLIENT','CAMPAIGN')),
  link_campaign text,
  campaign_fund_kind text check (campaign_fund_kind in ('CAMPAIGN','DBT','FRAUD','CLIENT')),
  gdv numeric not null,
  is_zakat boolean not null default false,
  tech_fee_manual boolean not null default false,
  manual_tech_fee numeric,
  sort_order int not null default 0
);

create table cor_cost (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references cor_header(doc_id) on delete cascade,
  cor_tab text not null check (cor_tab in ('CLIENT','CAMPAIGN')),
  cost_group text not null check (cost_group in ('SAL','VENDOR')),
  cost_mode text not null default 'GROUPED' check (cost_mode in ('GROUPED','STANDALONE_ITEM','STANDALONE_NO_ITEM')),
  row_role text not null default 'PRICE' check (row_role in ('PRICE','ITEM')),
  keterangan text, kategori text,
  tipe text check (tipe in ('Lembaga','Individu')),
  harga numeric not null default 0,
  qty numeric not null default 1,
  periode numeric not null default 1,
  sort_order int not null default 0,
  category_order int
);

create table cor_margin (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references cor_header(doc_id) on delete cascade,
  cor_tab text not null check (cor_tab in ('CLIENT','CAMPAIGN')),
  component text not null check (component in ('CONS','CRE','PROG','IMP')),
  sub_category text not null,
  percentage numeric not null
);

create table cor_result (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references cor_header(doc_id) on delete cascade,
  cor_tab text not null check (cor_tab in ('CLIENT','CAMPAIGN')),
  snapshot jsonb not null,
  computed_at timestamptz not null default now(),
  unique (doc_id, cor_tab)
);

create table cor_budget_item (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references cor_header(doc_id) on delete cascade,
  cor_tab text not null,
  cost_group text not null,
  keterangan text, kategori text,
  budgeted_amount numeric not null,
  sort_order int,
  snapshot_at timestamptz not null default now()
);

create table cor_disbursement (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references cor_header(doc_id) on delete cascade,
  budget_item_id uuid not null references cor_budget_item(id),
  amount numeric not null check (amount > 0),
  disbursement_date date,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 7. Quotation
-- ============================================================

create table quotation_header (
  doc_id uuid primary key references document_pipeline(id) on delete cascade,
  entity_code text not null check (entity_code in ('YKB','KAI')),
  language text not null default 'ID' check (language in ('EN','ID')),
  quotation_number text unique,
  valid_days int, valid_date date, hide_valid_date boolean not null default false,
  pic_client_id uuid references pic_client(id),
  pic_name text, pic_email text, pic_phone text, pic_title text,
  head_name text, title_name text, service_name text,
  first_statement text, important_remarks text,
  agency_fee_rate numeric, hide_agency_fee boolean not null default false,
  single_box_price boolean not null default false,
  pdf_file_id text, pdf_file_url text,
  signature_file_id text,
  approval_token uuid, approval_expires_at timestamptz,
  approval_requested_to text, approval_requested_name text, approval_requested_at timestamptz,
  approval_resolved_at timestamptz, rejection_note text,
  approved_by uuid references employee(id), approved_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  last_updated timestamptz not null default now()
);

create table quotation_item (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references quotation_header(doc_id) on delete cascade,
  category_label text, category_sort_order int,
  category_mode text not null default 'grouped' check (category_mode in ('grouped','standalone_with_item','standalone_without_item')),
  row_role text not null default 'PRICE' check (row_role in ('PRICE','ITEM')),
  item_label text, item_sort_order int,
  value numeric, qty numeric,
  remarks_detail text
);

-- ============================================================
-- 8. GDV / Ads (data eksternal Tableau)
-- ============================================================

create table gdv_controller_upload_log (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz not null default now(),
  uploaded_by text,
  brand_file_name text, brand_row_count int,
  not_brand_file_name text, not_brand_row_count int,
  total_row_count int
);

create table gdv_controller (
  id uuid primary key default gen_random_uuid(),
  upload_log_id uuid references gdv_controller_upload_log(id),
  campaigner_name text, campaigner_id text,
  tableau_project_id text,
  link_campaign text not null,
  fundraiser_name text, child_id text, child_short_url text,
  project_launch_year int, project_status text,
  main_source text,
  realized_nominal numeric,
  platform_fee numeric, subscription_fee numeric, bank_charge_fee numeric,
  source_category text check (source_category in ('Brand','Not-Brand'))
);

create table ads_sponsorship_progress_upload_log (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz not null default now(),
  uploaded_by text, file_name text,
  account_names text[],
  row_count int, skipped_count int
);

create table ads_sponsorship_progress (
  id uuid primary key default gen_random_uuid(),
  upload_log_id uuid references ads_sponsorship_progress_upload_log(id),
  snapshot_at timestamptz not null,
  account_name text not null,
  short_url text, campaign_id text not null,
  current_gdv numeric, current_ndv numeric, active_wallet_amount numeric,
  project_status text
);

-- ============================================================
-- 9. Audit log (belum pernah ada di sistem lama -- dibangun sejak awal)
-- ============================================================

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  diff jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Selesai. Cek di Table Editor (sidebar kiri Supabase) -- harusnya
-- muncul semua tabel di atas.
-- ============================================================
