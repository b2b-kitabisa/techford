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
  var html = HtmlService.createTemplateFromFile('Employee/EmployeeApp')
    .evaluate()
    .setTitle('Techford Platform');
  SpreadsheetApp.getUi().showSidebar(html);
}
