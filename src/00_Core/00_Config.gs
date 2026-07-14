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

  // Folder Drive tempat dokumen hasil generate disimpan.
  module.ROOT_FOLDER_ID = 'GANTI_DENGAN_FOLDER_ID_ANDA';

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

  // Stage granular yang tampil di tabel/dropdown, dan bucket 4-status
  // (PROS/NEGO/WON/LOSS) yang dipakai score card & stat pipeline.
  module.PIPELINE_STAGE_LIST = ['First Approaching', 'Follow Up User', 'Drafting Deck', 'Negotiation', 'Revision', 'Won', 'Loss'];
  module.PIPELINE_STAGE_BUCKET = {
    'First Approaching': 'PROS',
    'Follow Up User': 'PROS',
    'Drafting Deck': 'NEGO',
    'Negotiation': 'NEGO',
    'Revision': 'NEGO',
    'Won': 'WON',
    'Loss': 'LOSS'
  };
  module.PIPELINE_DEFAULT_STAGE = 'First Approaching';
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
    { key: 'PKS', label: 'PKS' }
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
    ]
  };

  // Quotation BISA diterbitkan atas nama salah satu dari 2 entitas ini —
  // sengaja hanya berlaku untuk Quotation, bukan tipe dokumen lain.
  module.QUOTATION_ENTITIES = ['YKB (Yayasan Kita Bisa)', 'PT KAI (PT Kolaborasi Aksi Indonesia)'];

  // Tipe dokumen yang jadi "gate" Deal — kalau dokumen ini ada & Done, Sales
  // Pipeline Stage otomatis pindah ke Won. Kalau dokumen ini TIDAK PERNAH
  // diminta untuk sebuah project, Won otomatis terjadi begitu SEMUA dokumen
  // yang diminta (apa pun tipenya) sudah Done — lihat DocumentService.
  module.DOCUMENT_DEAL_GATE_TYPE = 'PKS';

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
