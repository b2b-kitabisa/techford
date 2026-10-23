/**
 * Code.gs — titik masuk web app.
 *
 * Satu project, dua halaman:
 *   · tanpa parameter        -> halaman kader (masuk dengan nama + PIN)
 *   · ?page=admin            -> halaman admin (wajib akun @kitabisa.com)
 *
 * Keduanya di-deploy sebagai dua deployment terpisah supaya pembatasannya
 * dikerjakan Google, bukan hanya oleh kode ini — lihat README.
 */

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'kader';

  if (page === 'admin') {
    if (!pjbAdminBoleh_()) return pjbHalamanTolak_();
    return pjbRender_('Admin', 'Admin PJB Cipondoh');
  }
  return pjbRender_('Kader', 'Jumantik Cipondoh');
}

function pjbRender_(file, judul) {
  return HtmlService.createTemplateFromFile(file)
    .evaluate()
    .setTitle(judul)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('theme-color', '#2a78d6')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function pjbHalamanTolak_() {
  var email = pjbEmailAdmin_();
  var html =
    '<div style="font-family:system-ui,sans-serif;max-width:420px;margin:64px auto;padding:0 20px;' +
    'text-align:center;color:#10151f">' +
    '<div style="font-size:40px">🔒</div>' +
    '<h1 style="font-size:20px;margin:12px 0 8px">Halaman khusus admin</h1>' +
    '<p style="font-size:14px;line-height:1.6;color:#4a5468">Halaman ini hanya bisa dibuka dengan akun ' +
    '<b>@' + PJB_DOMAIN_ADMIN + '</b>.' +
    (email ? '<br><br>Akun yang sedang dipakai: <b>' + email + '</b>.' :
             '<br><br>Sepertinya Anda belum masuk ke akun Google.') +
    '</p></div>';
  return HtmlService.createHtmlOutput(html).setTitle('Khusus admin');
}

/** Dipakai template untuk menyisipkan potongan HTML lain. */
function pjbInclude(nama) {
  return HtmlService.createHtmlOutputFromFile(nama).getContent();
}
