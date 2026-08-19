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

  // Akar struktur folder terorganisir: Tech-Ford > CL..-BRAND > PRJ..-CL..-BRAND.
  // SENGAJA terpisah dari ROOT_FOLDER_ID di atas — ROOT_FOLDER_ID adalah
  // folder datar lama tempat PDF COR/Quotation menumpuk tanpa struktur, dan
  // file yang SUDAH terlanjur ada di sana tidak dipindahkan (link-nya sudah
  // terkirim lewat email approval; memindahkannya tidak mengubah URL, tapi
  // tetap tidak ada gunanya menyentuh arsip lama). Dokumen BARU masuk ke
  // struktur ini.
  module.TECHFORD_ROOT_FOLDER_ID = '1HxdkN6whmt21L7R-8vEqbSvYazNaomBq';

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
    // Lampiran dokumen (upload/link/generate). Satu Doc_ID bisa punya banyak
    // baris — itulah sebabnya ia sheet tersendiri, bukan kolom di
    // Document_Pipeline: satu kolom hanya muat satu nilai.
    DOCUMENT_ATTACHMENT: 'Document_Attachment',
    // Riwayat putaran approval (diajukan / disetujui / ditolak) — APPEND-ONLY.
    // Sengaja sheet tersendiri, bukan kolom di COR_Header/Quotation_Header:
    // kolom Rejection_Note di sana cuma muat SATU nilai dan ditimpa tiap
    // putaran, sehingga COR yang ditolak tiga kali cuma menyisakan alasan
    // yang ketiga. Lihat DocumentActivityRepository.
    DOCUMENT_ACTIVITY: 'Document_Activity',
    REVENUE_BREAKDOWN: 'Revenue_Breakdown',
    COR_ENTITY: 'COR_Entity',
    COR_HEADER: 'COR_Header',
    COR_FUND: 'COR_Fund',
    COR_COST: 'COR_Cost',
    COR_MARGIN: 'COR_Margin',
    COR_RESULT: 'COR_Result',
    COR_BUDGET_ITEM: 'COR_Budget_Item',
    COR_DISBURSEMENT: 'COR_Disbursement',
    MARGIN_GUIDE: 'Margin_Guide',
    QUOTATION_HEADER: 'Quotation_Header',
    QUOTATION_ITEM: 'Quotation_Item',
    AUDIT_LOG: 'AuditLog',
    GDV_CONTROLLER: 'GDV_Controller',
    GDV_CONTROLLER_UPLOAD_LOG: 'GDV_Controller_Upload_Log',
    // Ads Sponsorship Progress — hidup di spreadsheet yang SAMA dengan
    // GDV_Controller (lihat Config.getGdvControllerSpreadsheet), tapi datanya
    // TIDAK berhubungan dengan GDV Matching sama sekali: ini progres GDV/NDV
    // dan saldo yang bisa dicairkan per campaign Ads Sponsorship.
    //
    // APPEND-ONLY, sengaja BUKAN replace-all seperti GDV_Controller. Export
    // sumbernya datang PER KLIEN (satu file = satu account_name), jadi
    // menimpa seluruh tab saat upload satu klien akan menghapus data klien
    // lain. Sebagai bonus, riwayatnya ikut tersimpan — penurunan
    // Active_Wallet_Amount berarti ada pencairan, dan itu hilang kalau
    // barisnya ditimpa.
    ADS_PROGRESS: 'Ads_Sponsorship_Progress',
    ADS_PROGRESS_UPLOAD_LOG: 'Ads_Sponsorship_Progress_Upload_Log',
    // Sheet staging berisi data lead lama hasil impor CSV. Dibaca SEKALI
    // oleh MigrationService, tidak pernah disentuh aplikasi sehari-hari.
    LEAD_MIGRATION: 'Lead_Migration',
    // Target GDV & Service Revenue per Consultant (Setting > Achievement
    // Setting) — satu baris per Consultant, dipakai untuk membandingkan
    // pencapaian sungguhan (lihat Project.Consultant/Revenue_Breakdown)
    // terhadap target yang ditentukan di sini.
    ACHIEVEMENT_TARGET: 'Achievement_Target'
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

  // Entity Type baku. Form inbound membiarkan pengisi mengetik bebas, dan
  // hasilnya ratusan variasi ("Ojek online", "Dog rescue", "Band", ...).
  // Nilai yang tidak termasuk 3 baku ini dinormalkan jadi 'Other', TAPI teks
  // asli yang ditulis pengisi tetap disimpan di kolom Entity_Type_Other —
  // supaya bisa ditampilkan lewat tombol "Other" di Client Monitoring dan
  // tidak ada informasi yang hilang.
  module.ENTITY_TYPE_BAKU = ['Perusahaan', 'Institusi Sosial', 'Institusi Grants'];
  module.ENTITY_TYPE_OTHER = 'Other';

  /**
   * Nama kolom di sheet Inbound_Raw — HARUS sama persis dengan teks
   * pertanyaan di Typeform, karena IMPORTRANGE membawa nama pertanyaan apa
   * adanya sebagai header.
   *
   * Dipusatkan di sini supaya kalau pertanyaan Typeform diubah redaksinya,
   * yang perlu disunting hanya file ini — bukan berburu string di dalam
   * LeadService. Nilai lama di kode sempat salah (memakai nama singkat
   * seperti 'kebutuhan'/'Jenis organisasi') sehingga Sync memetakan kolom ke
   * field yang keliru.
   */
  module.INBOUND_RAW_HEADERS = {
    FIRST_NAME: 'First name',
    LAST_NAME: 'Last name',
    ENTITY_TYPE: 'Halo, {{field:3a839e5b-f122-4ec3-ba5f-90f17d278950}}. Anda mewakili *jenis organisasi* apa?',
    ENTITY_NAME: 'Boleh kami tahu *nama organisasi* atau *perusahaan* Anda?',
    KEBUTUHAN: 'Apa *kebutuhan* yang ingin Anda *diskusikan dengan kami*?',
    PRIORITAS: 'Kami ingin memahami prioritas Anda.',
    PHONE: 'Phone number',
    EMAIL: 'Email',
    UTM_SOURCE: 'utm_source',
    UTM_MEDIUM: 'utm_medium',
    UTM_CAMPAIGN: 'utm_campaign',
    SUBMITTED_AT: 'Submitted At',
    TOKEN: 'Token'
  };

  /**
   * @returns {{type: string, other: string}} type selalu salah satu dari
   *   ENTITY_TYPE_BAKU atau 'Other'; other berisi teks asli hanya kalau
   *   nilainya tidak dikenali.
   */
  module.normalizeEntityType = function (raw) {
    var v = String(raw == null ? '' : raw).trim();
    if (!v) return { type: module.ENTITY_TYPE_OTHER, other: '' };
    var lower = v.toLowerCase();
    for (var i = 0; i < module.ENTITY_TYPE_BAKU.length; i++) {
      if (module.ENTITY_TYPE_BAKU[i].toLowerCase() === lower) {
        return { type: module.ENTITY_TYPE_BAKU[i], other: '' };
      }
    }
    return { type: module.ENTITY_TYPE_OTHER, other: v };
  };

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

  /**
   * Role Employee — dulu kolom bebas ketik ('Admin' jadi default, 'Head of
   * B2B'/'Consultant' dipakai beberapa tempat sebagai string literal tanpa
   * daftar tertutup). Sekarang 4 nilai INI SAJA yang valid — lihat
   * EmployeeService.normalizeRole untuk bagaimana nilai lama/tidak dikenal
   * (termasuk default lama 'Admin') dipetakan ke salah satu dari 4 ini.
   *
   *   MASTER_ADMIN  akses penuh ke semua section, TERMASUK satu-satunya
   *                 yang bisa mengubah Configure Account & Master Data.
   *                 Platform WAJIB selalu punya minimal 1 yang aktif — lihat
   *                 EmployeeService.assertKeepsMasterAdmin.
   *   CONSULTANT    muncul sebagai pilihan "Consultant" (owner project) di
   *                 Sales Pipeline — lihat ProjectService.consultantRole.
   *   OPERATION     tim operasional — akses penuh Operation Module & GDV
   *                 Controller, Sales Module cuma lihat.
   *   HEAD_OF_B2B   approver COR/Donation Commitment Letter/Quotation —
   *                 dropdown approver di CorService/QuotationService sudah
   *                 memfilter persis string ini (JANGAN diganti nilainya).
   */
  module.EMPLOYEE_ROLE = {
    MASTER_ADMIN: 'Master Admin',
    CONSULTANT: 'Consultant',
    OPERATION: 'Operation',
    HEAD_OF_B2B: 'Head of B2B'
  };
  module.EMPLOYEE_ROLE_LIST = [
    module.EMPLOYEE_ROLE.MASTER_ADMIN,
    module.EMPLOYEE_ROLE.CONSULTANT,
    module.EMPLOYEE_ROLE.OPERATION,
    module.EMPLOYEE_ROLE.HEAD_OF_B2B
  ];
  // Dipertahankan (dipakai ProjectService/SalesPipelineContent) — nilainya
  // sama persis dengan EMPLOYEE_ROLE.CONSULTANT, sengaja tidak dihapus supaya
  // tidak perlu ganti nama di banyak tempat untuk sesuatu yang nilainya sama.
  module.CONSULTANT_ROLE = module.EMPLOYEE_ROLE.CONSULTANT;

  module.ACCESS_LEVEL = { FULL: 'full', VIEW: 'view', NONE: 'none' };

  /**
   * Hak akses per section (key = route di WebAppRouter.ROUTES) x Role.
   * SATU-SATUNYA sumber kebenaran, dipakai server (gerbang Configure
   * Account/Master Data) DAN client (sembunyikan menu sidebar, kunci
   * tombol simpan/ubah di halaman "view"). Section yang TIDAK didaftarkan
   * di sini (misal 'employee' — halaman lama, sengaja dibiarkan nonaktif,
   * tidak ada di sidebar) dianggap FULL untuk semua role — supaya
   * penambahan route baru tidak diam-diam ikut terkunci sebelum sengaja
   * didaftarkan di sini.
   *
   * 'cor-calculator' & 'quotation-composer' disamakan levelnya dengan
   * 'document-pipeline' (satu alur kerja yang sama, dibuka dari drawer-nya).
   *
   * GDV Matching & Ads Sponsorship Progress FULL untuk semua role — kedua
   * halaman itu murni tabel yang bisa difilter, tidak ada aksi ubah data
   * apa pun di sana, jadi tidak ada yang perlu dibatasi.
   */
  module.ROLE_PAGE_ACCESS = {
    'home': { 'Master Admin': 'full', 'Consultant': 'full', 'Operation': 'full', 'Head of B2B': 'full' },
    // Read-only untuk semua Role — halaman ini tidak punya aksi tulis sama
    // sekali, jadi tidak ada beda antara 'view' dan 'full' di sini.
    'dashboard-sales': { 'Master Admin': 'full', 'Consultant': 'full', 'Operation': 'full', 'Head of B2B': 'full' },
    'lead-capturing': { 'Master Admin': 'full', 'Consultant': 'full', 'Operation': 'view', 'Head of B2B': 'full' },
    'client-monitoring': { 'Master Admin': 'full', 'Consultant': 'full', 'Operation': 'view', 'Head of B2B': 'full' },
    'sales-pipeline': { 'Master Admin': 'full', 'Consultant': 'full', 'Operation': 'view', 'Head of B2B': 'full' },
    'document-pipeline': { 'Master Admin': 'full', 'Consultant': 'full', 'Operation': 'full', 'Head of B2B': 'full' },
    'cor-calculator': { 'Master Admin': 'full', 'Consultant': 'full', 'Operation': 'full', 'Head of B2B': 'full' },
    'quotation-composer': { 'Master Admin': 'full', 'Consultant': 'full', 'Operation': 'full', 'Head of B2B': 'full' },
    'cost-monitoring': { 'Master Admin': 'full', 'Consultant': 'view', 'Operation': 'full', 'Head of B2B': 'full' },
    'configure-account': { 'Master Admin': 'full', 'Consultant': 'none', 'Operation': 'none', 'Head of B2B': 'none' },
    'master-data': { 'Master Admin': 'full', 'Consultant': 'none', 'Operation': 'none', 'Head of B2B': 'none' },
    // Target GDV/Service Revenue per Consultant — belum ada di spesifikasi
    // Role produk (fitur ini dibuat belakangan), disamakan levelnya dengan
    // Master Data (Master Admin saja) karena sama-sama "atur nilai acuan",
    // bukan pekerjaan sehari-hari. Ubah di sini kalau produk memutuskan
    // Role lain juga perlu akses.
    'achievement-setting': { 'Master Admin': 'full', 'Consultant': 'none', 'Operation': 'none', 'Head of B2B': 'none' },
    'gdv-controller': { 'Master Admin': 'full', 'Consultant': 'none', 'Operation': 'full', 'Head of B2B': 'full' },
    'gdv-matching': { 'Master Admin': 'full', 'Consultant': 'full', 'Operation': 'full', 'Head of B2B': 'full' },
    'ads-progress': { 'Master Admin': 'full', 'Consultant': 'full', 'Operation': 'full', 'Head of B2B': 'full' }
  };

  /**
   * @returns {string} salah satu dari ACCESS_LEVEL — 'full' kalau page tidak
   *   terdaftar di ROLE_PAGE_ACCESS (lihat catatan di atas), atau kalau role
   *   yang diberikan tidak dikenal di baris page itu (dianggap paling ketat:
   *   'none').
   */
  module.getAccessLevel = function (role, page) {
    var row = module.ROLE_PAGE_ACCESS[page];
    if (!row) return module.ACCESS_LEVEL.FULL;
    return row[role] || module.ACCESS_LEVEL.NONE;
  };

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
    // Alur Quotation (lihat diagram yang dikirim user): seluruh Status
    // digerakkan oleh AKTIVITAS sistem (Simpan Draft/Request Approval/
    // Approve/Reject magic-link), KECUALI "LOSS" yang murni tombol manual
    // admin (proses "Client Email" — kirim ke client & tunggu tanda tangan
    // balik — dilakukan manual di luar sistem). "Approved" adalah approval
    // INTERNAL dari Head of B2B (BUKAN client sudah tanda tangan) — Stage
    // sudah "Done" di titik ini karena tugas sistem selesai, sisanya proses
    // manual admin. "Signed" tetap ada di daftar untuk kompatibilitas data
    // lama/masa depan, tapi TIDAK ADA tombol yang men-set status ini secara
    // otomatis saat ini.
    QUOTATION: [
      { status: 'Not Started', stage: 'New Request' },
      { status: 'Drafting', stage: 'In Progress' },
      { status: 'Waiting Approval', stage: 'In Progress' },
      { status: 'Revision', stage: 'In Progress' },
      { status: 'Approved', stage: 'Done' },
      { status: 'Signed', stage: 'Done' },
      { status: 'LOSS', stage: 'Done' }
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

  // ---- Quotation Composer ----
  // Dokumen master Google Docs yang pernah dipakai untuk mencoba generate
  // dokumen via DocumentApp (butuh scope documents yang gagal diotorisasi,
  // dan hasilnya cuma salinan kosong) — pendekatan itu DIBATALKAN, sekarang
  // "Download PDF" murni HTML + print browser (persis pola COR), tidak
  // menyentuh Drive/DocumentApp sama sekali. ID ini dibiarkan (tidak
  // dipakai kode mana pun) sebagai referensi kalau nanti mau dicoba lagi.
  module.QUOTATION_TEMPLATE_FILE_ID = '1REWfagi4r-VMcIUzVPHCSnsFAGKiZCm36Ase_qJPLIc';

  // Logo (PNG) per entitas yang ditampilkan di header preview/PDF Quotation
  // — dibaca lewat DriveApp (scope yang sama sudah dipakai fitur lain,
  // TIDAK butuh otorisasi scope baru) lalu dikirim ke client sebagai data
  // URI base64, supaya tidak bergantung pada setting share link Drive.
  module.QUOTATION_LOGO_FILE_ID = {
    YKB: '11OFYe-5oDl2TXrnJpXzJIOPjp3qhS32X',
    KAI: '1uoumkC-bt_lHvQyTtbdsut5fpdkPqYb-'
  };

  module.QUOTATION_ENTITY_CODE = { YKB: 'YKB', KAI: 'KAI' };
  module.QUOTATION_LANGUAGE = { EN: 'EN', ID: 'ID' };
  module.QUOTATION_DEFAULT_VALID_DAYS = 30;
  // Dasar hitung: AGENCY SERVICE FEE = Subtotal x rate. TOTAL = Subtotal +
  // Fee. PPN 11% dihitung dari TOTAL itu. GRAND TOTAL = TOTAL + PPN. Rate
  // ini HANYA berlaku untuk entitas KAI (YKB tidak kena PPN/fee agensi
  // sama sekali, badan hukum nirlaba).
  module.QUOTATION_KAI_DEFAULT_FEE_RATE = 10;
  module.QUOTATION_PPN_RATE = 11;
  module.QUOTATION_ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  /**
   * Sapaan pembuka ("Yth. Bapak/Ibu ...") sekarang jadi BARIS PERTAMA teks
   * First Statement yang bisa diedit admin, bukan lagi baris yang ditempel
   * mati oleh renderer di atas paragraf itu. Nama PIC-nya diwakili token ini
   * dan diganti nama sungguhan begitu PIC dipilih di composer (lihat
   * applyPicNameToFirstStatement di QuotationComposerContent) — penggantian
   * HANYA terjadi selama token-nya masih utuh, jadi kalimat yang sudah
   * diketik ulang admin tidak pernah ditimpa.
   */
  var PIC_NAME_TOKEN = '[Nama PIC]';
  module.QUOTATION_PIC_NAME_TOKEN = PIC_NAME_TOKEN;

  // Teks default First Statement (paragraf pembuka) & Important Remarks
  // (skema pembayaran, dst) per kombinasi entitas+bahasa — SEMUANYA bisa
  // diedit admin per dokumen sebelum digenerate (lihat QuotationService),
  // ini cuma nilai awal supaya admin tidak mulai dari kosong.
  module.QUOTATION_DEFAULTS = {
    YKB: {
      EN: {
        headName: '', titleName: '',
        firstStatement: 'Dear Bapak/Ibu ' + PIC_NAME_TOKEN + ',\n\nThank you for the opportunity and trust given to Yayasan Kita Bisa to support the disbursement of donations for the agreed social program. Through this letter, the Parties record an initial commitment to the donation disbursement, to be managed transparently, accountably, and with a focus on measurable impact. In carrying this out, Yayasan Kita Bisa upholds the following principles:\n\n1. Strengthening the Impact Ecosystem\nStrengthening the ecosystem of social organizations and implementing partners so that fund disbursement is better targeted, measurable, and delivers a more comprehensive impact.\n2. Effective and Efficient Implementation\nEnsuring every stage of program implementation runs effectively, efficiently, and in line with the goals and needs of all stakeholders.\n3. Sustainable Fund Management\nManaging philanthropic funds professionally to generate lasting social impact and long-term benefit for the community.\n\nWe have attached the details of the services we offer for your consideration in establishing this cooperation.\n\nWe are committed to providing the best, professional, and value-adding service to support the achievement of the goals and impact we wish to realize together.',
        importantRemarks: 'Payment Scheme:\n1. Package value is valid only for 3 months after delivery.\n2. The nett rate given is only valid for the package above, any changes will need an adjustment on the package.\n3. For Terms of Payment: We will start invoicing 100% after client signing the agreement.\n4. Donation payments need to be completed a maximum of 14 days before the project starts and transferred to BCA a/n Yay Kita Bisa 498 407 0707 (Bank name: Bank Central Asia KCP Gedung Hijau).\n5. Yayasan Kita Bisa ("YKB") is registered as non taxable legal entity: any charitable donations received are exempt from taxation.\n\nStatement:\n1. I declare that I, as the signing party of this quotation sheet, am the authorized and legally authorized party to represent the legal entity listed in the signature column.\n2. I acknowledge and agree that this quotation sheet is legally binding and is an integral and inseparable part of the Cooperation Agreement ("PKS") or in the form of other documents that will be agreed and signed by the Client and YKB at a later date.'
      },
      ID: {
        headName: '', titleName: '',
        firstStatement: 'Yth. Bapak/Ibu ' + PIC_NAME_TOKEN + ',\n\nTerima kasih atas kesempatan dan kepercayaan yang diberikan kepada Yayasan Kita Bisa untuk mendukung penyaluran donasi bagi program sosial yang disepakati. Melalui dokumen ini, Para Pihak mencatat komitmen awal penyaluran donasi yang akan dikelola secara transparan, akuntabel, dan berorientasi pada manfaat yang terukur. Dalam pelaksanaannya, Yayasan Kita Bisa mengedepankan prinsip-prinsip berikut:\n\n1. Penguatan Ekosistem Dampak\nMemperkuat ekosistem organisasi sosial dan mitra pelaksana agar penyaluran dana menjadi lebih tepat sasaran, terukur, dan memberikan dampak yang lebih komprehensif.\n2. Implementasi yang Efektif dan Efisien\nMemastikan setiap tahapan pelaksanaan program berjalan secara efektif, efisien, dan selaras dengan tujuan serta kebutuhan para pemangku kepentingan.\n3. Pengelolaan Dana yang Berkelanjutan\nMengelola dana filantropi secara profesional untuk menghasilkan dampak sosial yang berkelanjutan dan memberikan manfaat jangka panjang bagi masyarakat.\n\nKami lampirkan rincian layanan yang kami tawarkan untuk menjadi bahan pertimbangan dalam menjalin kerja sama.\n\nKami berkomitmen untuk memberikan layanan terbaik, profesional, dan bernilai tambah guna mendukung tercapainya tujuan serta dampak yang ingin diwujudkan bersama.',
        importantRemarks: 'Skema Pembayaran:\n1. Nilai paket yang ditawarkan berlaku selama 3 (tiga) bulan sejak tanggal penawaran disampaikan.\n2. Harga bersih (nett) yang diberikan hanya berlaku untuk ruang lingkup paket yang tercantum di atas. Apabila terdapat perubahan ruang lingkup pekerjaan atau kebutuhan layanan, maka akan dilakukan penyesuaian terhadap nilai paket.\n3. Ketentuan Pembayaran: Penagihan sebesar 100% dari nilai paket akan dilakukan setelah klien menandatangani perjanjian kerja sama.\n4. Pembayaran donasi wajib diselesaikan paling lambat 14 (empat belas) hari sebelum tanggal pelaksanaan proyek dan ditransfer ke rekening berikut BCA a/n Yay Kita Bisa 498 407 0707 (Nama Bank: Bank Central Asia KCP Gedung Hijau).\n5. Yayasan Kita Bisa ("YKB") merupakan badan hukum nirlaba yang terdaftar. Oleh karena itu, setiap donasi yang diterima bersifat donasi sosial dan dibebaskan dari pengenaan pajak sesuai dengan ketentuan peraturan perundang-undangan yang berlaku.\n\nPernyataan:\n1. Saya menyatakan bahwa saya, selaku pihak yang menandatangani lembar penawaran (quotation) ini, merupakan pihak yang berwenang dan memiliki kewenangan hukum untuk bertindak atas nama badan hukum sebagaimana tercantum pada kolom tanda tangan.\n2. Saya memahami dan menyetujui bahwa lembar penawaran (quotation) ini memiliki kekuatan hukum yang mengikat serta merupakan bagian yang tidak terpisahkan dari Perjanjian Kerja Sama ("PKS") atau dokumen hukum lainnya yang akan disepakati dan ditandatangani oleh Klien dan Yayasan Kita Bisa ("YKB") di kemudian hari.'
      }
    },
    KAI: {
      EN: {
        headName: 'Andrew Deni Yonathan', titleName: 'Head of Business & Program Sustainability',
        firstStatement: 'Dear Bapak/Ibu ' + PIC_NAME_TOKEN + ',\n\nThank you for the opportunity and time for us to introduce Kolaborasi Aksi Indonesia services. We ensure your social marketing needs are not only executed, we manage them transparently and efficiently toward long-term business growth. With a strategic approach, we ensure every service is delivered seamlessly to maximize the results and create a lasting impact. Here are a few of our strategy\'s pillars:\n\n1. Elevating Brand Presence\nStrengthening the audience ecosystem to make communication strategies more valid and comprehensive.\n2. Optimize Execution\nEnsuring the campaign process is carried out effectively, efficiently, and with the right strategic alignment.\n3. Amplify Social Impact\nManaging social marketing budgets to generate long-term sustainable impact.\n\nDetails about the services we offer you on the following page are attached.\n\nOur goal is to provide you the highest quality service,',
        importantRemarks: 'Payment Scheme:\n1. Package value is valid only for 3 months after delivery.\n2. The net rate given is only valid for the package above, any changes will need an adjustment on the package.\n3. For Terms of Payment: We will start invoicing 100% after the client signs the agreement.\n4. Payment should be transferred maximum 30 working days after invoice sent by PT Kolaborasi Aksi Indonesia ("KAI").\n\nCancellation Fee:\n1. If there is a cancellation within 14 days before project preparation runs, there will be a 30% cancellation fee of the sub total applied.\n2. If there is a cancellation while the project preparation is running, there will be a 50% cancellation fee (does not apply for offline activity: event, implementation, shooting).\n3. Any change request for the package amount after quotation is signed and invoice is issued is not valid. PT Kolaborasi Aksi Indonesia has the authority to decline the request and proceed with the agreed value.\n4. Payment transfers to BCA a/n PT Kolaborasi Aksi Indonesia 498 533 3999.\n\nInvoice Revision Terms:\n1. Minor revision requests of invoice sent cannot be accommodated (if requested in a different month of invoice sent).\n2. Major revision requests of invoice (budget decrease or cancellation) will be charged an indemnity fee based on the total VAT submitted.\n\nStatement:\n1. I declare that I, as the signing party of this quotation sheet, am the authorized and legally authorized party to represent the legal entity listed in the signature column.\n2. I acknowledge and agree that this quotation sheet is legally binding and is an integral and inseparable part of the Cooperation Agreement ("PKS") or in the form of other documents that will be agreed and signed by the Client and PT Kolaborasi Aksi Indonesia ("KAI") at a later date.'
      },
      ID: {
        headName: 'Andrew Deni Yonathan', titleName: 'Head of Business & Program Sustainability',
        firstStatement: 'Yth. Bapak/Ibu ' + PIC_NAME_TOKEN + ',\n\nTerima kasih atas kesempatan yang telah diberikan kepada kami untuk memperkenalkan layanan PT Kolaborasi Aksi Indonesia. Kami berkomitmen untuk membantu memenuhi kebutuhan social marketing Anda melalui layanan yang dikelola secara profesional, transparan, dan efektif guna mendukung pertumbuhan bisnis yang berkelanjutan. Dengan pendekatan strategis, kami memastikan setiap program dijalankan secara optimal untuk menghasilkan dampak yang nyata dan bernilai. Strategi kami berfokus pada tiga pilar utama:\n\n1. Elevating Brand Presence\nMeningkatkan eksposur dan memperkuat posisi merek melalui strategi komunikasi yang tepat sasaran.\n2. Optimize Execution\nMemastikan setiap kampanye dilaksanakan secara efektif, efisien, dan selaras dengan tujuan bisnis.\n3. Amplify Social Impact\nMengoptimalkan investasi social marketing untuk menciptakan dampak yang berkelanjutan.\n\nRincian layanan yang kami tawarkan dapat Anda lihat pada halaman berikutnya. Kami berkomitmen untuk memberikan layanan terbaik guna mendukung keberhasilan bisnis Anda.',
        importantRemarks: 'Ketentuan Pembayaran:\n1. Nilai paket yang ditawarkan berlaku selama 3 (tiga) bulan sejak tanggal penawaran disampaikan.\n2. Harga bersih (nett) yang tercantum hanya berlaku untuk paket sebagaimana dijelaskan dalam penawaran ini. Setiap perubahan akan mengakibatkan penyesuaian terhadap nilai paket.\n3. Penagihan sebesar 100% (seratus persen) dari nilai paket akan dilakukan setelah Klien menandatangani perjanjian kerja sama.\n4. Pembayaran wajib diselesaikan paling lambat 30 (tiga puluh) hari kerja sejak tanggal invoice diterbitkan oleh PT Kolaborasi Aksi Indonesia ("KAI").\n\nKetentuan Pembatalan:\n1. Apabila pembatalan dilakukan dalam waktu 14 (empat belas) hari sebelum dimulainya proses persiapan proyek, Klien akan dikenakan biaya pembatalan sebesar 30% (tiga puluh persen) dari nilai subtotal.\n2. Apabila pembatalan dilakukan setelah proses persiapan proyek dimulai, klien akan dikenakan biaya pembatalan sebesar 50% dari nilai subtotal. Ketentuan ini tidak berlaku untuk kegiatan luring (offline) seperti penyelenggaraan acara (event), implementasi, maupun kegiatan pengambilan gambar (shooting).\n3. Permintaan perubahan nilai paket setelah penawaran ditandatangani dan invoice diterbitkan tidak dapat diproses. PT Kolaborasi Aksi Indonesia berhak menolak permintaan tersebut dan melanjutkan proses berdasarkan nilai yang telah disepakati.\n4. Pembayaran dilakukan melalui transfer ke rekening berikut BCA a/n PT Kolaborasi Aksi Indonesia 498 533 3999.\n\nKetentuan Perubahan Invoice:\n1. Permintaan revisi minor terhadap invoice yang diajukan pada bulan yang berbeda dengan bulan diterbitkannya invoice tidak dapat dilayani.\n2. Permintaan revisi mayor terhadap invoice, termasuk pengurangan anggaran maupun pembatalan transaksi, akan dikenakan biaya ganti rugi yang dihitung berdasarkan total Pajak Pertambahan Nilai (PPN/VAT) yang telah dilaporkan.\n\nPernyataan:\n1. Saya menyatakan bahwa saya, selaku pihak yang menandatangani lembar penawaran (quotation) ini, merupakan pihak yang sah, berwenang, dan memiliki kewenangan hukum untuk bertindak atas nama badan hukum sebagaimana tercantum pada kolom tanda tangan.\n2. Saya memahami dan menyetujui bahwa lembar penawaran (quotation) ini memiliki kekuatan hukum yang mengikat serta merupakan bagian yang tidak terpisahkan dari Perjanjian Kerja Sama ("PKS") maupun dokumen hukum lainnya yang akan disepakati dan ditandatangani oleh Klien dan PT Kolaborasi Aksi Indonesia ("KAI") di kemudian hari.'
      }
    }
  };

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

  /**
   * Tipe dokumen yang isinya DIBUAT SISTEM (PDF hasil render), bukan
   * dilampirkan admin.
   *
   * Dua konsekuensi yang mengikuti daftar ini, keduanya di UI Document
   * Pipeline:
   * 1. Status TIDAK boleh diubah lewat dropdown — ia digerakkan aktivitas
   *    sistem (Simpan Draft -> Request Approval -> Approve/Reject). Dropdown
   *    akan membuka jalan ke "Approved tanpa pernah ada approval", dan Stage
   *    project ikut maju karenanya.
   * 2. Tidak ada tombol "Tambah Dokumen" — lampirannya satu, hasil generate.
   */
  module.DOCUMENT_GENERATED_TYPES = ['COR', 'QUOTATION'];

  module.isGeneratedDocumentType = function (documentType) {
    return module.DOCUMENT_GENERATED_TYPES.indexOf(String(documentType || '')) !== -1;
  };
  module.DOCUMENT_NON_PIPELINE_TYPES = ['PKS', 'TRANSFER_REQUEST', 'BAST'];

  /**
   * Tipe dokumen yang boleh diminta BERKALI-KALI untuk satu project yang sama.
   *
   * COR: satu project bisa punya beberapa COR yang berdiri sendiri-sendiri dan
   * TIDAK saling berkaitan (keputusan produk) — nilainya KUMULATIF, bukan
   * revisi yang menggantikan COR sebelumnya. Karena itu TIDAK ada penomoran
   * "tahap"/urutan: tiap COR dibedakan lewat Doc_ID & tanggal permintaannya.
   * Tidak ada batas jumlah dan tidak perlu menunggu COR sebelumnya selesai.
   *
   * Tipe LAIN tetap sekali per project (Quotation "dua kali" sebenarnya dua
   * baris berbeda — satu per Entity, lihat QUOTATION_ENTITIES — bukan tipe
   * yang sama diminta ulang).
   *
   * Daftar ini dibaca UI (Sales Pipeline & Document Pipeline) lewat
   * DocumentService.getTaxonomy, supaya tidak ada daftar kedua yang
   * di-hardcode di HTML dan diam-diam tidak sinkron.
   */
  module.DOCUMENT_REPEATABLE_TYPES = ['COR'];

  module.isRepeatableDocumentType = function (documentType) {
    return module.DOCUMENT_REPEATABLE_TYPES.indexOf(String(documentType || '')) !== -1;
  };

  /**
   * Tipe dokumen yang boleh dibuat TANPA dikaitkan ke project mana pun
   * (Project_ID kosong).
   *
   * COR: ada COR yang memang tidak berhubungan dengan client/project mana pun
   * (keputusan produk). COR seperti ini tetap lewat alur approval yang sama;
   * yang berbeda hanya label project-nya ("Tanpa Project") dan folder
   * penyimpanan PDF-nya (jatuh ke folder akar — lihat CorService.renderPdf).
   *
   * Tipe lain TETAP wajib punya project: Stage Sales Pipeline mereka
   * digerakkan oleh dokumen (lihat DocumentService.checkAndAdvanceProjectStage),
   * jadi dokumen tanpa project akan jadi baris yang tidak pernah bisa
   * memengaruhi apa pun dan hanya membingungkan.
   */
  module.DOCUMENT_PROJECTLESS_TYPES = ['COR'];

  module.allowsBlankProject = function (documentType) {
    return module.DOCUMENT_PROJECTLESS_TYPES.indexOf(String(documentType || '')) !== -1;
  };

  /** Label seragam untuk dokumen yang tidak terkait project mana pun. */
  module.NO_PROJECT_LABEL = 'Tanpa Project';

  // ---- Revenue Breakdown (sheet Revenue_Breakdown, terpisah dari Project) ----
  // Service 'CSR' ATAU 'Ads Sponsorship' menghasilkan baris GDV (Item_Name =
  // link campaign) — bukan cuma CSR lagi sejak GDV Tahap 2 (lihat diskusi
  // skema Tableau/GDV Controller). Service SELAIN keduanya menghasilkan
  // baris SERVICE (Item_Name = nama category yang dipilih, atau nama
  // service itu sendiri kalau service-nya tidak punya category).
  module.REVENUE_VALUE_TYPE = { GDV: 'GDV', SERVICE: 'SERVICE' };
  module.REVENUE_GDV_SERVICE_KEYS = ['CSR', 'Ads Sponsorship'];
  // Skema Retainer (link dengan banyak termin nominal+notes+date) HANYA
  // berlaku untuk kombinasi CSR + Project.Is_Retainer — Ads Sponsorship
  // TETAP pakai skema link-only biasa walau project-nya Retainer.
  module.REVENUE_GDV_RETAINER_SERVICE_KEY = 'CSR';
  // Service yang TIDAK boleh punya baris Service Revenue (nominal manual per
  // category) — HANYA CSR, karena seluruh nominalnya sudah direpresentasikan
  // lewat GDV (campaign link). Ads Sponsorship SENGAJA TIDAK ikut di sini
  // (beda dari REVENUE_GDV_SERVICE_KEYS di atas) — link campaign-nya tetap
  // masuk GDV seperti biasa, TAPI Ads Sponsorship juga bisa punya nominal
  // Service Revenue manual sendiri (misal fee pengelolaan campaign),
  // terpisah dari realisasi GDV yang datang otomatis dari Tableau.
  module.REVENUE_SERVICE_EXCLUDED_KEYS = ['CSR'];

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

  /**
   * Sub-klasifikasi baris Dana Campaign — HANYA relevan untuk baris
   * ber-Fund_Type CAMPAIGN (kosong/tidak dipakai untuk baris Dana Client).
   * Tidak memengaruhi rumus fee/adm apa pun — murni label pelacakan sumber
   * dana. Default CAMPAIGN kalau admin tidak memilih apa-apa.
   */
  module.COR_CAMPAIGN_FUND_KIND = [
    { key: 'CAMPAIGN', label: 'Campaign' },
    { key: 'DBT', label: 'DBT' },
    { key: 'FRAUD', label: 'Fraud' }
  ];
  module.COR_CAMPAIGN_FUND_KIND_DEFAULT = 'CAMPAIGN';
  module.isValidCampaignFundKind = function (kind) {
    return module.COR_CAMPAIGN_FUND_KIND.some(function (k) { return k.key === kind; });
  };

  // 2 kelompok baris biaya (Cost SALSET vs Cost Vendor/entity terpilih) —
  // sama untuk method Gross Down maupun Gross Up.
  module.COR_COST_GROUP = { SAL: 'SAL', VENDOR: 'VENDOR' };

  /**
   * 3 metode input cost per KATEGORI di kalkulator COR — pola yang sama
   * dengan Category_Mode di Quotation Composer, dipakai ulang di sini
   * supaya admin tidak perlu belajar dua model mental berbeda untuk hal
   * yang sama. Lihat CorCostRepository untuk bentuk barisnya di sheet.
   *
   *   GROUPED            tiap item punya Harga/Qty/Periode sendiri.
   *   STANDALONE_ITEM    satu nominal untuk SELURUH kategori; baris item di
   *                      bawahnya murni nama/rincian tanpa angka.
   *   STANDALONE_NO_ITEM tepat satu baris berharga, TANPA nama kategori.
   */
  module.COR_COST_MODE = {
    GROUPED: 'GROUPED',
    STANDALONE_ITEM: 'STANDALONE_ITEM',
    STANDALONE_NO_ITEM: 'STANDALONE_NO_ITEM'
  };

  /**
   * Penanda baris mana yang memegang nominal. PRICE = ikut dihitung, ITEM =
   * murni nama (cuma ada di STANDALONE_ITEM). Kosong dibaca sebagai PRICE
   * supaya baris lama (sebelum fitur ini) tetap terhitung seperti dulu.
   */
  module.COR_COST_ROW_ROLE = { PRICE: 'PRICE', ITEM: 'ITEM' };

  /**
   * Apakah baris COR_Cost ini memegang nominal. SATU definisi yang dipakai
   * server (CorReportRenderer/CostMonitoringService) — kembarannya di client
   * ada di CorCalc (Shell.html) & CorCalculatorContent, lihat catatan
   * duplikasi di CorReportRenderer.
   */
  module.isPricedCostRow = function (row) {
    return String((row && (row.Row_Role || row.rowRole)) || '') !== module.COR_COST_ROW_ROLE.ITEM;
  };

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

  /**
   * Masa berlaku magic link approval COR/Quotation (hari).
   *
   * Approval di alur ini adalah persetujuan angka yang dilakukan TANPA
   * login — siapa pun yang memegang URL-nya bisa memutuskan. Tanpa batas
   * waktu, tautan di email enam bulan lalu (yang bisa saja sudah diteruskan
   * ke mana-mana) masih sah hari ini. Token juga otomatis mati begitu
   * Request Approval diulang, karena token barunya menimpa yang lama.
   */
  module.APPROVAL_TOKEN_VALID_DAYS = 14;

  /**
   * Jenis aktivitas yang dicatat ke Document_Activity (append-only).
   * Dipakai bareng COR & Quotation — alur approval keduanya identik.
   */
  module.DOCUMENT_ACTIVITY_TYPE = {
    APPROVAL_REQUESTED: 'APPROVAL_REQUESTED',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED'
  };

  // Cache default (detik) untuk data referensi yang jarang berubah.
  module.CACHE_TTL_SECONDS = 300;

  // ---- GDV Controller (rekonsiliasi GDV vs data Tableau) ----
  // Spreadsheet TERPISAH dari database utama Techford (SPREADSHEET_ID di
  // atas) — sengaja dipisah karena isinya hasil upload CSV manual (admin
  // export dari Tableau lalu upload lewat Setting > GDV Controller), bukan
  // data yang dikelola langsung oleh modul-modul lain. ID-nya WAJIB diisi
  // manual sekali saat setup (lihat SETUP.md) — sebelum diisi, fitur upload
  // akan gagal dengan pesan jelas ("spreadsheet belum dikonfigurasi").
  module.GDV_CONTROLLER_SPREADSHEET_ID = '15alu24X-_98FZxUEO4UuxnKcpnHqhPIJf4-XdrvgwMo';

  module.getGdvControllerSpreadsheet = function () {
    if (!module.GDV_CONTROLLER_SPREADSHEET_ID) {
      throw new AppError('CONFIG_MISSING', 'GDV_CONTROLLER_SPREADSHEET_ID belum diisi di Config.gs — lihat SETUP.md bagian GDV Controller.');
    }
    return SpreadsheetApp.openById(module.GDV_CONTROLLER_SPREADSHEET_ID);
  };

  module.getSpreadsheet = function () {
    return SpreadsheetApp.openById(module.SPREADSHEET_ID);
  };

  return module;
})(Config || {});
