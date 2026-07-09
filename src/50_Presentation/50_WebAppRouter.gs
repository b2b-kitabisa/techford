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
    content: 'Home/HomeContent',
    title: 'Home',
    headerActions: ''
  },
  'employee': {
    content: 'Employee/EmployeeContent',
    title: 'Employee',
    headerActions: ''
  },
  'lead-capturing': {
    content: 'Lead/LeadCapturingContent',
    title: 'Lead Capturing 🔥',
    headerActions: '<button class="btn-sync" onclick="syncNewLeads()">☁️ SYNC NEW LEADS</button>'
  }
};

function doGet(e) {
  var page = (e.parameter && e.parameter.page) || 'lead-capturing';
  var route = ROUTES[page];

  if (!route) {
    return HtmlService.createHtmlOutput('Halaman tidak ditemukan: ' + page);
  }

  var contentHtml = HtmlService.createTemplateFromFile(route.content).evaluate().getContent();

  var shell = HtmlService.createTemplateFromFile('Layout/Shell');
  shell.content = contentHtml;
  shell.headerActions = route.headerActions;
  shell.pageTitle = route.title;
  shell.activePage = page;
  shell.menu = NavigationConfig.MENU;

  return shell.evaluate()
    .setTitle('Techford Platform - ' + route.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper untuk include partial HTML (css) di dalam template.
 * Dipakai lewat <?!= include('namafile'); ?> di file HTML.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
