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
    headerActions: '<button class="btn-sync" onclick="openAddPipeline()">➕ ADD PIPELINE</button>'
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
 * Sisipkan badge notifikasi angka (mirip unread count) ke item menu
 * tertentu — dihitung langsung server-side (bukan lewat RPC) saat Shell
 * dirender, supaya sidebar selalu menampilkan angka terkini tanpa perlu
 * JS tambahan di client. Deep-clone NavigationConfig.MENU dulu supaya
 * object config aslinya tidak ikut ditempeli badge (dipakai juga oleh
 * findBreadcrumbGroup).
 */
function buildMenuWithBadges() {
  var menu = JSON.parse(JSON.stringify(NavigationConfig.MENU));
  var badgeCounts = {
    'lead-capturing': LeadService.countNewLeads(),
    'sales-pipeline': ProjectService.countDraftProjects(),
    'document-pipeline': DocumentService.countNewRequests()
  };

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
