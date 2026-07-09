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
  'user-management': {
    content: '50_Presentation/html/Setting/UserManagementContent',
    title: 'User Management',
    headerActions: ''
  }
};

function doGet(e) {
  var page = (e.parameter && e.parameter.page) || 'lead-capturing';
  var route = ROUTES[page];

  if (!route) {
    return HtmlService.createHtmlOutput('Halaman tidak ditemukan: ' + page);
  }

  var contentHtml = HtmlService.createTemplateFromFile(route.content).evaluate().getContent();

  var shell = HtmlService.createTemplateFromFile('50_Presentation/html/Layout/Shell');
  shell.content = contentHtml;
  shell.headerActions = route.headerActions;
  shell.pageTitle = route.title;
  shell.activePage = page;
  shell.menu = NavigationConfig.MENU;
  shell.breadcrumbGroup = findBreadcrumbGroup(page);
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
