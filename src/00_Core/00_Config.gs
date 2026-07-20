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
    QUOTATION_HEADER: 'Quotation_Header',
    QUOTATION_ITEM: 'Quotation_Item',
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

  // ---- Quotation Composer ----
  // Dokumen master Google Docs yang pernah dipakai untuk mencoba generate
  // dokumen via DocumentApp (butuh scope documents yang gagal diotorisasi,
  // dan hasilnya cuma salinan kosong) — pendekatan itu DIBATALKAN, sekarang
  // "Download PDF" murni HTML + print browser (persis pola COR), tidak
  // menyentuh Drive/DocumentApp sama sekali. ID ini dibiarkan (tidak
  // dipakai kode mana pun) sebagai referensi kalau nanti mau dicoba lagi.
  module.QUOTATION_TEMPLATE_FILE_ID = '1REWfagi4r-VMcIUzVPHCSnsFAGKiZCm36Ase_qJPLIc';

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

  // Teks default First Statement (paragraf pembuka) & Important Remarks
  // (skema pembayaran, dst) per kombinasi entitas+bahasa — SEMUANYA bisa
  // diedit admin per dokumen sebelum digenerate (lihat QuotationService),
  // ini cuma nilai awal supaya admin tidak mulai dari kosong.
  module.QUOTATION_DEFAULTS = {
    YKB: {
      EN: {
        headName: '', titleName: '',
        firstStatement: 'Thank you for the opportunity and time for us to introduce Kitabisa ORG services. We ensure donations are not only collected, we channel them transparently and efficiently toward long-term impact. With strategic de-risking, we reduce uncertainty and maximize the chances for every contribution to create sustainable, measurable change. Here are a few of our strategy\'s pillars:\n\n1. Strengthening Impact Ecosystem\nStrengthening the NGO ecosystem to make fund distribution strategies more valid and comprehensive.\n2. Streamline Implementation\nEnsuring the implementation process is carried out effectively, efficiently, and with the right alignment.\n3. Sustainable Fund Management\nManaging philanthropic funds to generate long-term (sustainable) impact.\n\nDetails about the services we offer you on the following page are attached.\n\nOur goal is to provide you the highest quality service,',
        importantRemarks: 'Payment Scheme:\n1. Package value is valid only for 3 months after delivery.\n2. The nett rate given is only valid for the package above, any changes will need an adjustment on the package.\n3. For Terms of Payment: We will start invoicing 100% after client signing the agreement.\n4. Donation payments need to be completed a maximum of 14 days before the project starts and transferred to BCA a/n Yay Kita Bisa 498 407 0707 (Bank name: Bank Central Asia KCP Gedung Hijau).\n5. Yayasan Kita Bisa ("YKB") is registered as non taxable legal entity: any charitable donations received are exempt from taxation.\n\nStatement / Pernyataan:\n1. I declare that I, as the signing party of this quotation sheet, am the authorized and legally authorized party to represent the legal entity listed in the signature column.\n2. I acknowledge and agree that this quotation sheet is legally binding and is an integral and inseparable part of the Cooperation Agreement ("PKS") or in the form of other documents that will be agreed and signed by the Client and YKB at a later date.'
      },
      ID: {
        headName: '', titleName: '',
        firstStatement: 'Terima kasih atas kesempatan dan waktu yang telah diberikan kepada kami untuk memperkenalkan layanan Kitabisa ORG. Kami percaya bahwa donasi bukan hanya tentang menghimpun dana, tetapi juga memastikan setiap kontribusi disalurkan secara transparan, akuntabel, dan efektif sehingga mampu menciptakan dampak sosial yang berkelanjutan. Melalui pendekatan strategic de-risking, kami membantu mengurangi berbagai risiko dalam proses penyaluran dana serta meningkatkan peluang terciptanya perubahan yang nyata, terukur, dan berkelanjutan. Untuk mewujudkan hal tersebut, strategi kami berfokus pada tiga pilar utama:\n\n1. Penguatan Ekosistem Dampak\nMemperkuat ekosistem organisasi sosial dan mitra pelaksana agar penyaluran dana menjadi lebih tepat sasaran, terukur, dan memberikan dampak yang lebih komprehensif.\n2. Implementasi yang Efektif dan Efisien\nMemastikan setiap tahapan pelaksanaan program berjalan secara efektif, efisien, dan selaras dengan tujuan serta kebutuhan para pemangku kepentingan.\n3. Pengelolaan Dana yang Berkelanjutan\nMengelola dana filantropi secara profesional untuk menghasilkan dampak sosial yang berkelanjutan dan memberikan manfaat jangka panjang bagi masyarakat.\n\nKami lampirkan rincian layanan yang kami tawarkan untuk menjadi bahan pertimbangan dalam menjalin kerja sama.\n\nKami berkomitmen untuk memberikan layanan terbaik, profesional, dan bernilai tambah guna mendukung tercapainya tujuan serta dampak yang ingin diwujudkan bersama.',
        importantRemarks: 'Skema Pembayaran:\n1. Nilai paket yang ditawarkan berlaku selama 3 (tiga) bulan sejak tanggal penawaran disampaikan.\n2. Harga bersih (nett) yang diberikan hanya berlaku untuk ruang lingkup paket yang tercantum di atas. Apabila terdapat perubahan ruang lingkup pekerjaan atau kebutuhan layanan, maka akan dilakukan penyesuaian terhadap nilai paket.\n3. Ketentuan Pembayaran: Penagihan sebesar 100% dari nilai paket akan dilakukan setelah klien menandatangani perjanjian kerja sama.\n4. Pembayaran donasi wajib diselesaikan paling lambat 14 (empat belas) hari sebelum tanggal pelaksanaan proyek dan ditransfer ke rekening berikut BCA a/n Yay Kita Bisa 498 407 0707 (Nama Bank: Bank Central Asia KCP Gedung Hijau).\n5. Yayasan Kita Bisa ("YKB") merupakan badan hukum nirlaba yang terdaftar. Oleh karena itu, setiap donasi yang diterima bersifat donasi sosial dan dibebaskan dari pengenaan pajak sesuai dengan ketentuan peraturan perundang-undangan yang berlaku.\n\nStatement / Pernyataan:\n1. Saya menyatakan bahwa saya, selaku pihak yang menandatangani lembar penawaran (quotation) ini, merupakan pihak yang berwenang dan memiliki kewenangan hukum untuk bertindak atas nama badan hukum sebagaimana tercantum pada kolom tanda tangan.\n2. Saya memahami dan menyetujui bahwa lembar penawaran (quotation) ini memiliki kekuatan hukum yang mengikat serta merupakan bagian yang tidak terpisahkan dari Perjanjian Kerja Sama ("PKS") atau dokumen hukum lainnya yang akan disepakati dan ditandatangani oleh Klien dan Yayasan Kita Bisa ("YKB") di kemudian hari.'
      }
    },
    KAI: {
      EN: {
        headName: 'Andrew Deni Yonathan', titleName: 'Head of Business & Program Sustainability',
        firstStatement: 'Thank you for the opportunity and time for us to introduce Kolaborasi Aksi Indonesia services. We ensure your social marketing needs are not only executed, we manage them transparently and efficiently toward long-term business growth. With a strategic approach, we ensure every service is delivered seamlessly to maximize the results and create a lasting impact. Here are a few of our strategy\'s pillars:\n\n1. Elevating Brand Presence\nStrengthening the audience ecosystem to make communication strategies more valid and comprehensive.\n2. Optimize Execution\nEnsuring the campaign process is carried out effectively, efficiently, and with the right strategic alignment.\n3. Amplify Social Impact\nManaging social marketing budgets to generate long-term sustainable impact.\n\nDetails about the services we offer you on the following page are attached.\n\nOur goal is to provide you the highest quality service,',
        importantRemarks: 'Payment Scheme / Ketentuan Pembayaran:\n1. Package value is valid only for 3 months after delivery.\n2. The net rate given is only valid for the package above, any changes will need an adjustment on the package.\n3. For Terms of Payment: We will start invoicing 100% after the client signs the agreement.\n4. Payment should be transferred maximum 30 working days after invoice sent by PT Kolaborasi Aksi Indonesia ("KAI").\n\nCancellation Fee / Ketentuan Pembatalan:\n1. If there is a cancellation within 14 days before project preparation runs, there will be a 30% cancellation fee of the sub total applied.\n2. If there is a cancellation while the project preparation is running, there will be a 50% cancellation fee (does not apply for offline activity: event, implementation, shooting).\n3. Any change request for the package amount after quotation is signed and invoice is issued is not valid. PT Kolaborasi Aksi Indonesia has the authority to decline the request and proceed with the agreed value.\n4. Payment transfers to BCA a/n PT Kolaborasi Aksi Indonesia 498 533 3999.\n\nCancellation Invoice / Ketentuan Perubahan Invoice:\n1. Minor revision requests of invoice sent cannot be accommodated (if requested in a different month of invoice sent).\n2. Major revision requests of invoice (budget decrease or cancellation) will be charged an indemnity fee based on the total VAT submitted.\n\nStatement / Pernyataan:\n1. I declare that I, as the signing party of this quotation sheet, am the authorized and legally authorized party to represent the legal entity listed in the signature column.\n2. I acknowledge and agree that this quotation sheet is legally binding and is an integral and inseparable part of the Cooperation Agreement ("PKS") or in the form of other documents that will be agreed and signed by the Client and PT Kolaborasi Aksi Indonesia ("KAI") at a later date.'
      },
      ID: {
        headName: 'Andrew Deni Yonathan', titleName: 'Head of Business & Program Sustainability',
        firstStatement: 'Terima kasih atas kesempatan yang telah diberikan kepada kami untuk memperkenalkan layanan PT Kolaborasi Aksi Indonesia. Kami berkomitmen untuk membantu memenuhi kebutuhan social marketing Anda melalui layanan yang dikelola secara profesional, transparan, dan efektif guna mendukung pertumbuhan bisnis yang berkelanjutan. Dengan pendekatan strategis, kami memastikan setiap program dijalankan secara optimal untuk menghasilkan dampak yang nyata dan bernilai. Strategi kami berfokus pada tiga pilar utama:\n\n1. Elevating Brand Presence\nMeningkatkan eksposur dan memperkuat posisi merek melalui strategi komunikasi yang tepat sasaran.\n2. Optimize Execution\nMemastikan setiap kampanye dilaksanakan secara efektif, efisien, dan selaras dengan tujuan bisnis.\n3. Amplify Social Impact\nMengoptimalkan investasi social marketing untuk menciptakan dampak yang berkelanjutan.\n\nRincian layanan yang kami tawarkan dapat Anda lihat pada halaman berikutnya. Kami berkomitmen untuk memberikan layanan terbaik guna mendukung keberhasilan bisnis Anda.',
        importantRemarks: 'Ketentuan Pembayaran:\n1. Nilai paket yang ditawarkan berlaku selama 3 (tiga) bulan sejak tanggal penawaran disampaikan.\n2. Harga bersih (nett) yang tercantum hanya berlaku untuk paket sebagaimana dijelaskan dalam penawaran ini. Setiap perubahan akan mengakibatkan penyesuaian terhadap nilai paket.\n3. Penagihan sebesar 100% (seratus persen) dari nilai paket akan dilakukan setelah Klien menandatangani perjanjian kerja sama.\n4. Pembayaran wajib diselesaikan paling lambat 30 (tiga puluh) hari kerja sejak tanggal invoice diterbitkan oleh PT Kolaborasi Aksi Indonesia ("KAI").\n\nCancellation Fee / Ketentuan Pembatalan:\n1. Apabila pembatalan dilakukan dalam waktu 14 (empat belas) hari sebelum dimulainya proses persiapan proyek, Klien akan dikenakan biaya pembatalan sebesar 30% (tiga puluh persen) dari nilai subtotal.\n2. Apabila pembatalan dilakukan setelah proses persiapan proyek dimulai, klien akan dikenakan biaya pembatalan sebesar 50% dari nilai subtotal. Ketentuan ini tidak berlaku untuk kegiatan luring (offline) seperti penyelenggaraan acara (event), implementasi, maupun kegiatan pengambilan gambar (shooting).\n3. Permintaan perubahan nilai paket setelah penawaran ditandatangani dan invoice diterbitkan tidak dapat diproses. PT Kolaborasi Aksi Indonesia berhak menolak permintaan tersebut dan melanjutkan proses berdasarkan nilai yang telah disepakati.\n4. Pembayaran dilakukan melalui transfer ke rekening berikut BCA a/n PT Kolaborasi Aksi Indonesia 498 533 3999.\n\nCancellation Invoice / Ketentuan Perubahan Invoice:\n1. Permintaan revisi minor terhadap invoice yang diajukan pada bulan yang berbeda dengan bulan diterbitkannya invoice tidak dapat dilayani.\n2. Permintaan revisi mayor terhadap invoice, termasuk pengurangan anggaran maupun pembatalan transaksi, akan dikenakan biaya ganti rugi yang dihitung berdasarkan total Pajak Pertambahan Nilai (PPN/VAT) yang telah dilaporkan.\n\nStatement / Pernyataan:\n1. Saya menyatakan bahwa saya, selaku pihak yang menandatangani lembar penawaran (quotation) ini, merupakan pihak yang sah, berwenang, dan memiliki kewenangan hukum untuk bertindak atas nama badan hukum sebagaimana tercantum pada kolom tanda tangan.\n2. Saya memahami dan menyetujui bahwa lembar penawaran (quotation) ini memiliki kekuatan hukum yang mengikat serta merupakan bagian yang tidak terpisahkan dari Perjanjian Kerja Sama ("PKS") maupun dokumen hukum lainnya yang akan disepakati dan ditandatangani oleh Klien dan PT Kolaborasi Aksi Indonesia ("KAI") di kemudian hari.'
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
