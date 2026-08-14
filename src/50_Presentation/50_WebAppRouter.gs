/**
 * Presentation.WebAppRouter
 *
 * Entry point Web App (doGet/doPost). Router hanya menentukan konten mana
 * yang dirender di dalam Shell (layout global: sidebar + topbar) — TIDAK
 * ADA business logic di sini. Menambah modul baru = menambah satu entri di
 * ROUTES, tidak menyentuh modul lain.
 *
 * "headerActions" adalah HTML mentah untuk tombol aksi di topbar kanan atas
 * (misal SYNC NEW LEADS) yang spesifik per halaman.
 */
var ROUTES = {
  'home': {
    content: '50_Presentation/html/Home/HomeContent',
    title: 'Home',
    headerActions: ''
  },
  'dashboard-sales': {
    content: '50_Presentation/html/Dashboard/DashboardSalesContent',
    title: 'Dashboard Sales 📊',
    headerActions: '',
    helpText: '<strong>GDV Actual</strong> berasal dari ekspor Tableau (kenyataan), bukan angka yang ' +
      'diklaim consultant di Sales Pipeline — dua angka itu boleh beda, dan selisihnya justru yang ' +
      'ditunjukkan kartu "Klaim Consultant vs Department Portion".'
  },
  'employee': {
    content: '50_Presentation/html/Employee/EmployeeContent',
    title: 'Employee',
    headerActions: ''
  },
  'lead-capturing': {
    content: '50_Presentation/html/Lead/LeadCapturingContent',
    title: 'Lead Capturing 🔥',
    headerActions: '<button class="btn-sync" onclick="syncNewLeads()">☁️ SYNC NEW LEADS</button>',
    helpText: '<strong>Info Alur:</strong> Lead baru masuk sebagai <strong>New Leads</strong>. ' +
      'Setelah dihubungi, ubah ke <strong>Contacted</strong>. Kalau sudah siap kerja sama, gunakan status ' +
      '<strong>Moved</strong> agar tercatat sebagai klien (aksi ini permanen, Lead akan terkunci). ' +
      'Tandai <strong>Spam</strong> untuk lead yang tidak relevan.'
  },
  'client-monitoring': {
    content: '50_Presentation/html/Client/ClientMonitoringContent',
    title: 'Client Monitoring 🏢',
    headerActions: '<button class="btn-sync" onclick="openAddClient()">➕ ADD NEW CLIENT</button>'
  },
  'sales-pipeline': {
    content: '50_Presentation/html/Project/SalesPipelineContent',
    title: 'Sales Pipeline 💰',
    headerActions: '<button class="btn-sync" onclick="openAddPipeline()">➕ ADD PIPELINE</button>',
    helpText: 'Angka di score card di atas dihitung dari <strong>seluruh project</strong> (kecuali draft) — ' +
      'sengaja tidak mengikuti filter yang sedang aktif di tabel, supaya tetap jadi acuan tetap.'
  },
  'document-pipeline': {
    content: '50_Presentation/html/Document/DocumentPipelineContent',
    title: 'Document Pipeline 📄',
    // Sengaja tidak ada tombol "+ ADD" di sini — dokumen HANYA bisa diminta
    // dari box "Document Request" di Project Detail (Sales Pipeline),
    // bukan dari halaman ini.
    headerActions: ''
  },
  'cor-calculator': {
    content: '50_Presentation/html/Document/CorCalculatorContent',
    title: 'COR Calculator',
    // SENGAJA TIDAK didaftarkan di NavigationConfig.MENU — halaman ini
    // full-page (bukan drawer) tapi hanya bisa diakses lewat tombol
    // "Kerjakan COR" di drawer Document Pipeline (butuh ?docId=... di URL),
    // bukan navigasi sidebar biasa. Karena itu breadcrumb-nya di-override
    // manual di sini (bukan dari NavigationConfig.MENU) supaya tetap
    // menunjukkan hierarki asalnya: Operation Module › Document Pipeline.
    breadcrumbGroup: 'Operation Module',
    breadcrumbParent: 'Document Pipeline',
    headerActions: ''
  },
  'quotation-composer': {
    content: '50_Presentation/html/Document/QuotationComposerContent',
    title: 'Quotation Composer',
    // Sama seperti cor-calculator — hanya bisa diakses lewat tombol
    // "Kerjakan Quotation" di drawer Document Pipeline (butuh ?docId=...).
    breadcrumbGroup: 'Operation Module',
    breadcrumbParent: 'Document Pipeline',
    headerActions: ''
  },
  'configure-account': {
    content: '50_Presentation/html/Setting/ConfigureAccountContent',
    title: 'Configure Account',
    headerActions: ''
  },
  'master-data': {
    content: '50_Presentation/html/Setting/MasterDataContent',
    title: 'Master Data',
    headerActions: ''
  },
  'cost-monitoring': {
    content: '50_Presentation/html/Document/CostMonitoringContent',
    title: 'Cost Monitoring',
    headerActions: ''
  },
  'gdv-controller': {
    content: '50_Presentation/html/Setting/GdvControllerContent',
    title: 'GDV Controller',
    headerActions: ''
  },
  'gdv-matching': {
    content: '50_Presentation/html/Setting/GdvMatchingContent',
    title: 'GDV Matching',
    headerActions: ''
  },
  'ads-progress': {
    content: '50_Presentation/html/Setting/AdsProgressContent',
    title: 'Ads Sponsorship Progress',
    headerActions: ''
  },
  'achievement-setting': {
    content: '50_Presentation/html/Setting/AchievementSettingContent',
    title: 'Achievement Setting',
    headerActions: ''
  }
};

function doGet(e) {
  var params = (e && e.parameter) || {};

  // Link approval COR (magic link di email, TIDAK ada login) — ditangani
  // TERPISAH dari routing Shell biasa karena diklik dari luar aplikasi
  // (klien email), bukan navigasi sidebar/dalam-app.
  if (params.action === 'cor-approve') {
    return handleCorApprovalLink(params.docId, params.token);
  }
  if (params.action === 'cor-reject') {
    return renderCorRejectForm(params.docId, params.token);
  }
  if (params.action === 'cor-reject-submit') {
    return handleCorRejectSubmit(params.docId, params.token, params.wording);
  }

  // Link approval Quotation (magic link di email, TIDAK ada login) — sama
  // pola dengan COR, DITAMBAH halaman approve-nya (quotation-approve)
  // berisi form upload tanda tangan (bukan langsung approve begitu link
  // diklik seperti COR), disubmit lewat doPost (lihat handler doPost di
  // bawah) karena butuh mengirim isi file gambar.
  if (params.action === 'quotation-approve') {
    return renderQuotationApproveForm(params.docId, params.token);
  }
  if (params.action === 'quotation-reject') {
    return renderQuotationRejectForm(params.docId, params.token);
  }
  if (params.action === 'quotation-reject-submit') {
    return handleQuotationRejectSubmit(params.docId, params.token, params.wording);
  }

  var page = params.page || 'lead-capturing';
  var route = ROUTES[page];

  if (!route) {
    return HtmlService.createHtmlOutput('Halaman tidak ditemukan: ' + page);
  }

  // queryParams diteruskan ke template content — dipakai halaman yang butuh
  // parameter URL (misal cor-calculator butuh ?docId=...). Halaman yang
  // tidak pakai scriptlet <?= queryParams... ?> tidak terpengaruh sama
  // sekali (aman ditambahkan tanpa menyentuh page lain).
  var contentTemplate = HtmlService.createTemplateFromFile(route.content);
  contentTemplate.queryParams = (e && e.parameter) || {};
  var contentHtml = contentTemplate.evaluate().getContent();

  var shell = HtmlService.createTemplateFromFile('50_Presentation/html/Layout/Shell');
  shell.content = contentHtml;
  shell.headerActions = route.headerActions;
  shell.pageTitle = route.title;
  shell.activePage = page;
  shell.menu = buildMenuWithBadges();
  shell.breadcrumbGroup = route.breadcrumbGroup || findBreadcrumbGroup(page);
  shell.breadcrumbParent = route.breadcrumbParent || '';
  shell.helpText = route.helpText || '';
  // Peta hak akses & status "ada Master Admin atau tidak" — SATU-SATUNYA
  // sumber di Config, disuntik ke client di sini (bukan diketik ulang di
  // Shell.html) supaya TechfordAccess (lihat Shell.html) selalu memakai
  // definisi yang sama dengan gerbang lain. Login/role sesungguhnya baru
  // diketahui di BROWSER (localStorage, lihat TechfordAuth) — server tidak
  // tahu siapa yang meminta doGet ini, jadi penguncian sesungguhnya terjadi
  // di client begitu TechfordAuth resolve; ini hanya bahan bakunya.
  shell.roleAccessMap = JSON.stringify(Config.ROLE_PAGE_ACCESS);
  shell.hasMasterAdmin = EmployeeService.hasAnyMasterAdmin();

  // Link navigasi WAJIB pakai URL absolut, bukan relatif ("?page=...").
  // Apps Script merender halaman di dalam iframe sandbox — href relatif
  // kadang salah resolve ke alamat internal iframe itu sendiri
  // (googleusercontent.com/userCodeAppPanel), bukan ke URL Web App yang
  // benar, sehingga navigasi ke halaman lain gagal/blank.
  shell.webAppUrl = ScriptApp.getService().getUrl();

  return shell.evaluate()
    .setTitle('Techford Platform - ' + route.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * SPA fragment endpoint — dipanggil client (router di Shell.html) lewat
 * google.script.run setiap kali pindah menu sidebar, MENGGANTIKAN full page
 * reload doGet biasa. Merender ULANG persis logika yang sama dengan doGet
 * (lookup ROUTES, evaluate content template dengan queryParams) tapi TANPA
 * bungkus Shell — shell (sidebar/topbar) sudah ada di browser dan tidak
 * perlu dirender ulang, cukup metadata yang dipasang ulang oleh client
 * (title, breadcrumb, headerActions, badge menu terbaru).
 */
function app_getPageFragment(page, queryParams) {
  return ErrorHandler.handle('WebAppRouter.getPageFragment', function () {
    var route = ROUTES[page];
    if (!route) throw new AppError('NOT_FOUND', 'Halaman tidak ditemukan: ' + page);

    var contentTemplate = HtmlService.createTemplateFromFile(route.content);
    contentTemplate.queryParams = queryParams || {};
    var contentHtml = contentTemplate.evaluate().getContent();

    return {
      page: page,
      contentHtml: contentHtml,
      pageTitle: route.title,
      headerActions: route.headerActions || '',
      helpText: route.helpText || '',
      breadcrumbGroup: route.breadcrumbGroup || findBreadcrumbGroup(page),
      breadcrumbParent: route.breadcrumbParent || '',
      menu: buildMenuWithBadges(),
      // Dikirim ulang tiap navigasi SPA (bukan cuma sekali di doGet) supaya
      // kalau status "ada Master Admin" berubah di tab lain (mis. baru
      // ditunjuk), tab ini ikut menyadarinya begitu pindah section — lihat
      // TechfordAccess.refresh di Shell.html.
      hasMasterAdmin: EmployeeService.hasAnyMasterAdmin()
    };
  });
}

/**
 * Halaman konfirmasi sederhana untuk magic link approval COR di email
 * (?action=cor-approve&docId=...&token=...) — TIDAK pakai Shell (bukan
 * bagian dari SPA, diklik dari luar aplikasi/klien email, tidak perlu
 * login sama sekali sesuai keputusan produk).
 */
function handleCorApprovalLink(docId, token) {
  var html;
  try {
    var result = CorController.approve(docId, token);
    if (!result || result.ok === false) {
      html = '<h2>⚠️ Gagal approve</h2><p>' + ((result && result.error && result.error.message) || 'Terjadi kesalahan.') + '</p>';
    } else {
      html = '<h2>✅ COR berhasil disetujui</h2>' +
        '<p>Dokumen <strong>' + escHtml(docId) + '</strong> sudah ditandai <strong>Approved</strong> oleh <strong>' + escHtml(result.data.approvedBy) + '</strong>.</p>';
    }
  } catch (err) {
    html = '<h2>⚠️ Gagal approve</h2><p>' + (err && err.message ? err.message : err) + '</p>';
  }
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:80px auto;padding:32px;text-align:center;' +
    'border:1px solid #ddd;border-radius:12px;">' + html + '</div>'
  );
}

/**
 * Form kecil TANPA login untuk link "Reject" di email approval COR
 * (?action=cor-reject&docId=...&token=...) — approver mengisi alasan/
 * catatan revisi, submit lewat form GET biasa (bukan google.script.run,
 * halaman ini di luar konteks SPA) ke ?action=cor-reject-submit.
 */
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCorRejectForm(docId, token) {
  var webAppUrl = ScriptApp.getService().getUrl();
  var html =
    '<h2>Tolak & Minta Revisi COR</h2>' +
    '<p style="color:#555;">Dokumen <strong>' + escHtml(docId) + '</strong>. Tuliskan alasan/catatan revisi supaya consultant tahu apa yang perlu diperbaiki.</p>' +
    '<form method="get" action="' + webAppUrl + '">' +
    '<input type="hidden" name="action" value="cor-reject-submit">' +
    '<input type="hidden" name="docId" value="' + escHtml(docId) + '">' +
    '<input type="hidden" name="token" value="' + escHtml(token) + '">' +
    '<textarea name="wording" rows="6" required placeholder="Contoh: Margin komponen Consulting terlalu tinggi, tolong disesuaikan lagi." ' +
    'style="width:100%;box-sizing:border-box;font-family:inherit;font-size:13px;padding:10px;border:1px solid #ccc;border-radius:8px;"></textarea>' +
    '<button type="submit" style="margin-top:14px;background:#c5221f;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;">Kirim Penolakan</button>' +
    '</form>';
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;padding:32px;' +
    'border:1px solid #ddd;border-radius:12px;">' + html + '</div>'
  );
}

/**
 * Diproses setelah form renderCorRejectForm di-submit.
 */
function handleCorRejectSubmit(docId, token, wording) {
  var html;
  try {
    var result = CorController.reject(docId, token, wording);
    if (!result || result.ok === false) {
      html = '<h2>⚠️ Gagal mengirim penolakan</h2><p>' + ((result && result.error && result.error.message) || 'Terjadi kesalahan.') + '</p>';
    } else {
      html = '<h2>✅ Catatan revisi terkirim</h2>' +
        '<p>Dokumen <strong>' + escHtml(docId) + '</strong> dikembalikan ke consultant sebagai <strong>Revision</strong>.</p>';
    }
  } catch (err) {
    html = '<h2>⚠️ Gagal mengirim penolakan</h2><p>' + (err && err.message ? err.message : err) + '</p>';
  }
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:80px auto;padding:32px;text-align:center;' +
    'border:1px solid #ddd;border-radius:12px;">' + html + '</div>'
  );
}

/**
 * Halaman form approve Quotation (?action=quotation-approve&docId=...&
 * token=...) — TIDAK pakai Shell, TIDAK ada login, dibuka dari link di
 * email. Beda dari COR (yang approve-nya langsung sekali klik), di sini
 * approver WAJIB upload file tanda tangan dulu — file itu dibaca client-side
 * lewat FileReader jadi base64 (BUKAN dikirim sebagai file/blob mentah,
 * supaya tidak bergantung pada parsing multipart di doPost GAS yang belum
 * pernah dicoba/diverifikasi sebelumnya di codebase ini), ditaruh di field
 * form tersembunyi, baru form-nya di-submit biasa (POST) ke doPost di bawah.
 */
function renderQuotationApproveForm(docId, token) {
  var webAppUrl = ScriptApp.getService().getUrl();
  var html =
    '<h2>Setujui Quotation</h2>' +
    '<p style="color:#555;">Dokumen <strong>' + escHtml(docId) + '</strong>. Upload tanda tangan Anda (gambar PNG/JPG) untuk menyetujui — tanda tangan ini akan ditempel ke box tanda tangan dokumen.</p>' +
    '<form id="qoApproveForm" method="post" action="' + webAppUrl + '" onsubmit="return prepQoApproveSubmit(event)">' +
    '<input type="hidden" name="action" value="quotation-approve-submit">' +
    '<input type="hidden" name="docId" value="' + escHtml(docId) + '">' +
    '<input type="hidden" name="token" value="' + escHtml(token) + '">' +
    '<input type="hidden" name="signatureBase64" id="qoSignatureBase64">' +
    '<input type="hidden" name="signatureMimeType" id="qoSignatureMimeType">' +
    '<input type="file" id="qoSignatureFile" accept="image/png,image/jpeg" required ' +
    'style="display:block;width:100%;box-sizing:border-box;font-size:13px;padding:10px;border:1px solid #ccc;border-radius:8px;margin-bottom:14px;">' +
    '<button type="submit" id="qoApproveSubmitBtn" style="background:#1a9c4b;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;">✅ Setujui &amp; Kirim Tanda Tangan</button>' +
    '</form>' +
    '<script>' +
    'function prepQoApproveSubmit(ev) {' +
    '  ev.preventDefault();' +
    '  var fileInput = document.getElementById("qoSignatureFile");' +
    '  var file = fileInput.files[0];' +
    '  if (!file) { alert("Pilih file tanda tangan dulu."); return false; }' +
    '  var btn = document.getElementById("qoApproveSubmitBtn");' +
    '  btn.disabled = true; btn.innerText = "Mengirim...";' +
    '  var reader = new FileReader();' +
    '  reader.onload = function () {' +
    '    var dataUrl = String(reader.result);' +
    '    var base64 = dataUrl.split(",")[1] || "";' +
    '    document.getElementById("qoSignatureBase64").value = base64;' +
    '    document.getElementById("qoSignatureMimeType").value = file.type || "image/png";' +
    '    document.getElementById("qoApproveForm").submit();' +
    '  };' +
    '  reader.onerror = function () { alert("Gagal membaca file, coba lagi."); btn.disabled = false; btn.innerText = "✅ Setujui & Kirim Tanda Tangan"; };' +
    '  reader.readAsDataURL(file);' +
    '  return false;' +
    '}' +
    '</script>';
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;padding:32px;' +
    'border:1px solid #ddd;border-radius:12px;">' + html + '</div>'
  );
}

/**
 * Diproses setelah form renderQuotationApproveForm di-submit — lihat doPost.
 */
function handleQuotationApproveSubmit(docId, token, signatureBase64, signatureMimeType) {
  var html;
  try {
    var result = QuotationController.approve(docId, token, signatureBase64, signatureMimeType);
    if (!result || result.ok === false) {
      html = '<h2>⚠️ Gagal approve</h2><p>' + ((result && result.error && result.error.message) || 'Terjadi kesalahan.') + '</p>';
    } else {
      html = '<h2>✅ Quotation berhasil disetujui</h2>' +
        '<p>Dokumen <strong>' + escHtml(docId) + '</strong> sudah ditandai <strong>Signed</strong> oleh <strong>' + escHtml(result.data.approvedBy) + '</strong>.</p>';
    }
  } catch (err) {
    html = '<h2>⚠️ Gagal approve</h2><p>' + (err && err.message ? err.message : err) + '</p>';
  }
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:80px auto;padding:32px;text-align:center;' +
    'border:1px solid #ddd;border-radius:12px;">' + html + '</div>'
  );
}

/**
 * Form kecil TANPA login untuk link "Reject" di email approval Quotation
 * (?action=quotation-reject&docId=...&token=...) — sama persis pola
 * renderCorRejectForm.
 */
function renderQuotationRejectForm(docId, token) {
  var webAppUrl = ScriptApp.getService().getUrl();
  var html =
    '<h2>Tolak & Minta Revisi Quotation</h2>' +
    '<p style="color:#555;">Dokumen <strong>' + escHtml(docId) + '</strong>. Tuliskan alasan/catatan revisi supaya consultant tahu apa yang perlu diperbaiki.</p>' +
    '<form method="get" action="' + webAppUrl + '">' +
    '<input type="hidden" name="action" value="quotation-reject-submit">' +
    '<input type="hidden" name="docId" value="' + escHtml(docId) + '">' +
    '<input type="hidden" name="token" value="' + escHtml(token) + '">' +
    '<textarea name="wording" rows="6" required placeholder="Contoh: Harga di kategori Digital Campaign perlu disesuaikan lagi." ' +
    'style="width:100%;box-sizing:border-box;font-family:inherit;font-size:13px;padding:10px;border:1px solid #ccc;border-radius:8px;"></textarea>' +
    '<button type="submit" style="margin-top:14px;background:#c5221f;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;">Kirim Penolakan</button>' +
    '</form>';
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;padding:32px;' +
    'border:1px solid #ddd;border-radius:12px;">' + html + '</div>'
  );
}

/**
 * Diproses setelah form renderQuotationRejectForm di-submit.
 */
function handleQuotationRejectSubmit(docId, token, wording) {
  var html;
  try {
    var result = QuotationController.reject(docId, token, wording);
    if (!result || result.ok === false) {
      html = '<h2>⚠️ Gagal mengirim penolakan</h2><p>' + ((result && result.error && result.error.message) || 'Terjadi kesalahan.') + '</p>';
    } else {
      html = '<h2>✅ Catatan revisi terkirim</h2>' +
        '<p>Dokumen <strong>' + escHtml(docId) + '</strong> dikembalikan ke consultant sebagai <strong>Revision</strong>.</p>';
    }
  } catch (err) {
    html = '<h2>⚠️ Gagal mengirim penolakan</h2><p>' + (err && err.message ? err.message : err) + '</p>';
  }
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:80px auto;padding:32px;text-align:center;' +
    'border:1px solid #ddd;border-radius:12px;">' + html + '</div>'
  );
}

/**
 * Entry point POST — SATU-SATUNYA pemakainya (untuk sekarang) adalah form
 * upload tanda tangan approve Quotation (lihat renderQuotationApproveForm),
 * karena payload base64 gambar terlalu besar untuk query string GET biasa.
 * Field dikirim sebagai form field teks biasa (application/x-www-form-
 * urlencoded, BUKAN multipart file blob) supaya parsing-nya sederhana &
 * dapat diandalkan di e.parameter — TIDAK menyentuh e.postData sama sekali.
 */
function doPost(e) {
  var params = (e && e.parameter) || {};
  if (params.action === 'quotation-approve-submit') {
    return handleQuotationApproveSubmit(params.docId, params.token, params.signatureBase64, params.signatureMimeType);
  }
  return HtmlService.createHtmlOutput('Aksi tidak dikenal.');
}

/**
 * Sisipkan badge notifikasi angka (mirip unread count) ke item menu
 * tertentu — dihitung langsung server-side (bukan lewat RPC) saat Shell
 * dirender, supaya sidebar selalu menampilkan angka terkini tanpa perlu
 * JS tambahan di client. Deep-clone NavigationConfig.MENU dulu supaya
 * object config aslinya tidak ikut ditempeli badge (dipakai juga oleh
 * findBreadcrumbGroup).
 */
function buildMenuWithBadges() {
  var menu = JSON.parse(JSON.stringify(NavigationConfig.MENU));

  // PENTING UNTUK PERFORMA: fungsi ini dipanggil di SETIAP perpindahan
  // section (lihat app_getPageFragment), dan menghitung badge-nya mahal —
  // countOverBudget() saja menarik DocumentPipeline, CorHeader,
  // CorBudgetItem, CorDisbursement, Project, Client, plus COR_Result per
  // dokumen. Tanpa cache, seluruh biaya itu dibayar ulang setiap kali user
  // klik menu, bahkan untuk halaman yang tidak butuh data itu sama sekali —
  // ini penyebab utama "lambat saat berpindah section".
  //
  // Hasilnya kecil (cuma beberapa angka) jadi selalu muat dalam satu key.
  // TTL pendek: badge yang telat maksimal semenit masih jauh lebih baik
  // daripada setiap navigasi tertahan beberapa detik.
  var badgeCounts = CacheHelper.getOrSet('nav:badgeCounts', 60, function () {
    return {
      'lead-capturing': LeadService.countNewLeads(),
      'sales-pipeline': ProjectService.countDraftProjects(),
      'document-pipeline': DocumentService.countNewRequests(),
      'cost-monitoring': CostMonitoringService.countOverBudget()
    };
  });

  menu.forEach(function (group) {
    group.items.forEach(function (item) {
      if (badgeCounts.hasOwnProperty(item.page) && badgeCounts[item.page] > 0) {
        item.badge = badgeCounts[item.page];
      }
    });
  });

  return menu;
}

function findBreadcrumbGroup(page) {
  var menu = NavigationConfig.MENU;
  for (var g = 0; g < menu.length; g++) {
    for (var i = 0; i < menu[g].items.length; i++) {
      if (menu[g].items[i].page === page) return menu[g].group;
    }
  }
  return '';
}

/**
 * Helper untuk include partial HTML (css) di dalam template.
 * Dipakai lewat <?!= include('namafile'); ?> di file HTML.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
