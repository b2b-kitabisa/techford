/**
 * Core.Config
 *
 * Satu-satunya tempat menyimpan ID, nama sheet, dan pengaturan global.
 * Tidak ada modul lain yang boleh hardcode ID Spreadsheet/Folder secara langsung —
 * semua wajib lewat Config supaya saat ID berubah (misal pindah environment),
 * cukup ubah di satu tempat.
 */
var Config = (function (module) {

  // Ganti sesuai Spreadsheet database utama platform ini.
  module.SPREADSHEET_ID = '1DXjYDtL6QEqGvBDnQHGMiSqIXX9EHiBOiPmJsyz3tdM';

  // Folder Shared Drive B2B tempat dokumen hasil generate (COR, dst) disimpan.
  // Script berjalan sebagai USER_DEPLOYING (lihat appsscript.json) — jadi
  // file yang dibuat ke sini SELALU lewat identitas admin yang deploy,
  // bukan identitas consultant yang klik tombol di browser. Karena Shared
  // Drive pakai izin berbasis membership (bukan per-file), siapa pun yang
  // jadi member Shared Drive ini otomatis bisa buka file yang dibuat di sini
  // tanpa perlu share manual.
  module.ROOT_FOLDER_ID = '116wYHofIduCAFZZzLvkGnQ6VB9eTILI5';

  // Nama sheet terpusat — kalau nama tab diganti di Spreadsheet,
  // cukup ubah di sini, tidak perlu grep semua modul.
  module.SHEETS = {
    EMPLOYEE: 'Employee',
    LEAD: 'Lead',
    INBOUND_RAW: 'Inbound_Raw',
    CLIENT: 'Client',
    PIC_CLIENT: 'PIC_Client',
    MASTER_DATA: 'Master_Data',
    PROJECT: 'Project',
    DOCUMENT_PIPELINE: 'Document_Pipeline',
    REVENUE_BREAKDOWN: 'Revenue_Breakdown',
    COR_ENTITY: 'COR_Entity',
    COR_HEADER: 'COR_Header',
    COR_FUND: 'COR_Fund',
    COR_COST: 'COR_Cost',
    COR_MARGIN: 'COR_Margin',
    MARGIN_GUIDE: 'Margin_Guide',
    AUDIT_LOG: 'AuditLog'
  };

  // Kategori opsi dropdown yang dikelola lewat Setting > Master Data
  // (sheet Master_Data, kolom Category|Value). Bukan enum tetap di kode —
  // admin bisa tambah opsi baru sendiri tanpa perlu ubah kode.
  module.MASTER_DATA_CATEGORY = {
    HEAD_OFFICE: 'Head_Office',
    INDUSTRY: 'Industry',
    ENTITY_TYPE: 'Entity_Type',
    CLIENT_SOURCE: 'Client_Source'
  };

  // Nilai kolom Status pada sheet Lead. Dipusatkan di sini supaya Service/UI
  // tidak ada yang hardcode string status secara terpisah-pisah.
  module.LEAD_STATUS = {
    NEW: 'New Leads',
    CONTACTED: 'Contacted',
    MOVED: 'Moved',
    OTHER: 'Other',
    SPAM: 'Spam'
  };

  // Nilai Client_Source yang di-set OTOMATIS oleh proses Move dari Lead.
  // Opsi lain (Outbound/Referral/dst) dikelola sebagai data, bukan enum
  // tetap — lihat Master_Data kategori CLIENT_SOURCE. Validasi input
  // manual dicek terhadap Master_Data, bukan daftar hardcode di sini.
  module.CLIENT_SOURCE_INBOUND = 'Inbound';

  // Semua login admin diasumsikan pakai domain perusahaan ini — dicek di
  // AuthService supaya email di luar domain langsung ditolak.
  module.ALLOWED_EMAIL_DOMAIN = 'kitabisa.com';

  // ---- Sales Pipeline (Project) ----
  // Taxonomy Service/Category/Program/Issue di sini masih set tetap sesuai
  // wireframe (bukan lewat Master_Data) — kalau nanti perlu diedit admin
  // tanpa ubah kode, baru dipindah ke pola Master_Data seperti Head Office.
  //
  // Beberapa Service (Ads Sponsorship, Placement & Production) sengaja
  // punya categories: [] — sesuai wireframe, mereka berdiri sendiri tanpa
  // sub-kategori.
  module.SERVICE_TAXONOMY = [
    { key: 'CSR', label: 'CSR', categories: ['Corporate Donation', 'Employee Donation', 'Customer Donation', 'Public Donation', 'Zakat'] },
    { key: 'Sustainability Services', label: 'Sustainability Services', categories: ['Monitoring & Evaluation', 'Impact Measurement'] },
    { key: 'Event', label: 'Event', categories: ['Beyond The Game', 'Voluntrip', 'Ekspedisi Kitabisa'] },
    { key: 'Ads Sponsorship', label: 'Ads Sponsorship', categories: [] },
    { key: 'Placement & Production', label: 'Placement & Production', categories: [] }
  ];

  module.PROGRAM_TYPE = {
    KBORG: 'KB.ORG Program',
    CLIENT: 'Client Program'
  };

  // Kalau admin pilih 'Custom Program', Program_Name diisi manual (sama
  // seperti alur Client Program) — lihat ProjectService.createProject.
  module.KBORG_PROGRAMS = ['Teach4Hope', 'Ganavira', 'Askara Nusantara', 'Generasi Sehat', 'Harpa', 'Custom Program'];
  module.KBORG_CUSTOM_PROGRAM = 'Custom Program';

  module.ISSUE_OPTIONS = ['Social', 'Health', 'Empowerment', 'Education', 'Environment', 'Momentum'];

  // Stage yang tampil di tabel/dropdown Sales Pipeline — sengaja disederhanakan
  // jadi cuma 4 (sama persis dengan bucket-nya sendiri), karena progres
  // detail-nya nanti mengikuti Document Pipeline (Prospect/Negotiation
  // otomatis dari dokumen, Won dari Quotation Signed) — lihat DocumentService.
  module.PIPELINE_STAGE_LIST = ['Prospect', 'Negotiation', 'Won', 'Loss'];
  module.PIPELINE_STAGE_BUCKET = {
    'Prospect': 'PROS',
    'Negotiation': 'NEGO',
    'Won': 'WON',
    'Loss': 'LOSS'
  };
  module.PIPELINE_DEFAULT_STAGE = 'Prospect';
  module.CONSULTANT_ROLE = 'Consultant';

  // ---- Document Pipeline ----
  // Tiap Document_Type punya kosakata Status sendiri (beda-beda), tapi semua
  // dinormalisasi ke 4 Stage yang sama supaya bisa diagregasi lintas tipe
  // dokumen (score card, filter). Peta Status->Stage per tipe ada di
  // DOCUMENT_STATUS_MAP; status pertama di tiap daftar = status awal saat
  // dokumen baru diminta.
  module.DOCUMENT_TYPES = [
    { key: 'DECK', label: 'Deck' },
    { key: 'QUOTATION', label: 'Quotation' },
    { key: 'COR', label: 'Cost of Revenue (COR)' },
    { key: 'RAB', label: 'RAB' },
    { key: 'PRODCOST', label: 'Production Cost (Prodcost)' },
    { key: 'PKS', label: 'PKS' },
    { key: 'TRANSFER_REQUEST', label: 'Transfer Request' },
    { key: 'BAST', label: 'BAST' }
  ];

  module.DOCUMENT_STAGE_LIST = ['New Request', 'In Progress', 'Client Review', 'Done'];

  module.DOCUMENT_STATUS_MAP = {
    DECK: [
      { status: 'Not Started', stage: 'New Request' },
      { status: 'Drafting', stage: 'In Progress' },
      { status: 'Sent', stage: 'Done' }
    ],
    QUOTATION: [
      { status: 'Not Started', stage: 'New Request' },
      { status: 'Drafting', stage: 'In Progress' },
      { status: 'Revision', stage: 'Client Review' },
      { status: 'Sent', stage: 'Client Review' },
      { status: 'Signed', stage: 'Done' }
    ],
    COR: [
      { status: 'Not Started', stage: 'New Request' },
      { status: 'Drafting', stage: 'In Progress' },
      { status: 'Waiting Approval', stage: 'In Progress' },
      { status: 'Revision', stage: 'In Progress' },
      { status: 'Approved', stage: 'Done' }
    ],
    RAB: [
      { status: 'Not Started', stage: 'New Request' },
      { status: 'Drafting', stage: 'In Progress' },
      { status: 'Sent', stage: 'Client Review' },
      { status: 'Signed', stage: 'Done' }
    ],
    PRODCOST: [
      { status: 'Not Started', stage: 'New Request' },
      { status: 'Drafting', stage: 'In Progress' },
      { status: 'Sent', stage: 'Client Review' },
      { status: 'Signed', stage: 'Done' }
    ],
    PKS: [
      { status: 'Not Started', stage: 'New Request' },
      { status: 'Drafting', stage: 'In Progress' },
      { status: 'Sent', stage: 'Client Review' },
      { status: 'Signed', stage: 'Done' }
    ],
    // PKS, Transfer Request, BAST adalah dokumen PASCA-Deal (operasional
    // setelah project Won) — statusnya tetap dilacak tapi TIDAK memengaruhi
    // Sales Pipeline Stage sama sekali (lihat DOCUMENT_NON_PIPELINE_TYPES).
    TRANSFER_REQUEST: [
      { status: 'Not Started', stage: 'New Request' },
      { status: 'Request', stage: 'In Progress' },
      { status: 'Sent', stage: 'Done' }
    ],
    BAST: [
      { status: 'Not Started', stage: 'New Request' },
      { status: 'Request', stage: 'In Progress' },
      { status: 'Sent', stage: 'Client Review' },
      { status: 'Signed', stage: 'Done' }
    ]
  };

  // Quotation BISA diterbitkan atas nama salah satu dari 2 entitas ini —
  // sengaja hanya berlaku untuk Quotation, bukan tipe dokumen lain. Satu
  // project bisa punya Quotation dari KEDUA entitas sekaligus (2 baris
  // dokumen terpisah).
  module.QUOTATION_ENTITIES = ['YKB (Yayasan Kita Bisa)', 'PT KAI (PT Kolaborasi Aksi Indonesia)'];

  // ---- Aturan auto-advance Sales Pipeline Stage dari Document Pipeline ----
  // - DECK/COR/RAB/PRODCOST: begitu SALAH SATU Done -> Stage jadi Negotiation.
  // - QUOTATION: Deal (Won) baru terjadi begitu SEMUA Quotation yang diminta
  //   untuk project itu Done/Signed (kalau consultant minta YKB & PT KAI
  //   dua-duanya, dua-duanya harus Signed dulu).
  // - PKS/TRANSFER_REQUEST/BAST: dokumen pasca-Deal, TIDAK PERNAH memengaruhi
  //   Stage sama sekali (lihat DocumentService.checkAndAdvanceProjectStage).
  // - Kalau project tidak pernah minta Quotation sama sekali, Won TIDAK BISA
  //   otomatis terjadi lewat dokumen — harus lewat toggle "Allow_Manual_Deal"
  //   di Project (lihat ProjectService.updateStage) supaya admin bisa pilih
  //   Won manual khusus project itu.
  module.DOCUMENT_NEGOTIATION_TYPES = ['DECK', 'COR', 'RAB', 'PRODCOST'];
  module.DOCUMENT_DEAL_TYPE = 'QUOTATION';
  module.DOCUMENT_NON_PIPELINE_TYPES = ['PKS', 'TRANSFER_REQUEST', 'BAST'];

  // ---- Revenue Breakdown (sheet Revenue_Breakdown, terpisah dari Project) ----
  // Service 'CSR' menghasilkan baris GDV (Item_Name = link campaign).
  // Service SELAIN CSR menghasilkan baris SERVICE (Item_Name = nama
  // category yang dipilih, atau nama service itu sendiri kalau service-nya
  // tidak punya category, misal Ads Sponsorship/Placement & Production).
  module.REVENUE_VALUE_TYPE = { GDV: 'GDV', SERVICE: 'SERVICE' };
  module.REVENUE_GDV_SERVICE_KEY = 'CSR';

  // ---- COR Calculator (Cost of Revenue) ----
  // Direplikasi dari kalkulator COR manual (spreadsheet "Template COR" +
  // mockup HTML kalkulator) — lihat dokumentasi arsitektur di
  // CorHeaderRepository. File hasil generate (Google Sheets, dengan rumus
  // hidup, BUKAN PDF) disalin dari COR_TEMPLATE_FILE_ID ke ROOT_FOLDER_ID.
  module.COR_TEMPLATE_FILE_ID = '1pUkBIzoH5edriD1VewhunQAHLl5rkwzOLOdGVcxAgAM';

  // Admin pilih SALAH SATU metode per dokumen COR (tidak wajib dua-duanya):
  // GROSS_DOWN dipakai kalau dana sudah benar masuk (rekonsiliasi aktual),
  // GROSS_UP dipakai kalau dana belum masuk (estimasi/quote dari cost).
  module.COR_METHOD = { GROSS_DOWN: 'GROSS_DOWN', GROSS_UP: 'GROSS_UP' };

  // Sumber dana Gross Down — kalau project punya KEDUANYA (Mix Fund) dan
  // tidak lewat SALSET, sistem menghasilkan 2 file COR terpisah, satu per
  // Cor_Tab (lihat CorHeaderRepository).
  module.COR_FUND_TYPE = { CLIENT: 'CLIENT', CAMPAIGN: 'CAMPAIGN' };
  module.COR_TAB = { CLIENT: 'CLIENT', CAMPAIGN: 'CAMPAIGN' };

  // 2 kelompok baris biaya (Cost SALSET vs Cost Vendor/entity terpilih) —
  // sama untuk method Gross Down maupun Gross Up.
  module.COR_COST_GROUP = { SAL: 'SAL', VENDOR: 'VENDOR' };

  // 4 komponen Default Margin — struktur ini tetap (mengikuti Panduan
  // Margin), tapi daftar sub-kategori & persentase tiap komponen dikelola
  // admin lewat sheet Margin_Guide (Setting > Master Data), bukan hardcode.
  module.MARGIN_COMPONENTS = [
    { key: 'CONS', label: 'Consultancy Service Fee' },
    { key: 'CRE', label: 'Creative Development' },
    { key: 'PROG', label: 'Program Implementation and Coordination' },
    { key: 'IMP', label: 'Impact Measurement and Reporting' }
  ];

  module.MAIL = {
    SENDER_NAME: 'Techford Platform'
  };

  // Cache default (detik) untuk data referensi yang jarang berubah.
  module.CACHE_TTL_SECONDS = 300;

  module.getSpreadsheet = function () {
    return SpreadsheetApp.openById(module.SPREADSHEET_ID);
  };

  return module;
})(Config || {});
