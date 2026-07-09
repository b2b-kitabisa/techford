/**
 * Presentation.Menu
 *
 * Custom menu di Spreadsheet, kalau platform ini juga butuh dibuka langsung
 * dari dalam Google Sheets (selain lewat Web App). Tetap tipis — hanya
 * membuka dialog/sidebar, tidak ada logic.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Techford Platform')
    .addItem('Buka Dashboard', 'openDashboardSidebar')
    .addToUi();
}

function openDashboardSidebar() {
  var content = HtmlService.createTemplateFromFile('50_Presentation/html/Employee/EmployeeContent').evaluate().getContent();
  var html = HtmlService.createHtmlOutput(
    '<html><head><base target="_top">' + include('50_Presentation/html/Style') + '</head><body>' + content + '</body></html>'
  ).setTitle('Techford Platform');
  SpreadsheetApp.getUi().showSidebar(html);
}
