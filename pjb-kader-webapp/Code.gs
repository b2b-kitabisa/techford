/**
 * Code.gs — titik masuk web app.
 *
 * SATU deployment, dua halaman:
 *   · tanpa parameter -> halaman kader (masuk dengan nama + PIN)
 *   · ?page=admin     -> halaman admin (wajib akun @kitabisa.com)
 *
 * Deployment-nya "Execute as: Me" + "Who has access: Anyone". Kader memang
 * harus bisa membuka tanpa akun Google, dan itu tetap aman untuk halaman admin
 * karena pemilik script dan para admin berada di domain Workspace yang sama:
 * pada keadaan itu Session.getActiveUser() tetap mengembalikan email pengunjung
 * yang sedang masuk dengan akun kitabisa.com, sedangkan pengunjung anonim atau
 * dari luar domain mengembalikan string kosong sehingga ditolak.
 */

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'kader';

  if (page === 'admin') {
    if (!pjbAdminBoleh_()) return pjbHalamanTolak_();
    return pjbRender_('Admin', 'Admin PJB Cipondoh');
  }
  return pjbRender_('Kader', 'Jumantik Cipondoh');
}

/**
 * Meta tag HARUS dipasang lewat addMetaTag(), bukan ditulis di berkas HTML:
 * halaman web app disajikan di dalam iframe, dan meta yang ditulis langsung di
 * berkas HTML diabaikan Apps Script.
 *
 * Apps Script hanya mengizinkan EMPAT nama meta berikut. Nama lain — termasuk
 * "theme-color" — membuat halaman gagal dimuat dengan pesan
 * "The meta tag you specified is not allowed in this context."
 */
function pjbRender_(file, judul) {
  return HtmlService.createTemplateFromFile(file)
    .evaluate()
    .setTitle(judul)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function pjbHalamanTolak_() {
  var email = pjbEmailAdmin_();
  var sebab = email
    ? 'Akun yang sedang dipakai di peramban ini: <b>' + email + '</b>. ' +
      'Akun itu bukan ' + PJB_DOMAIN_ADMIN + '.'
    : 'Peramban ini belum masuk ke akun Google, atau sedang memakai profil/akun ' +
      'di luar ' + PJB_DOMAIN_ADMIN + '. Buka tautan ini sambil masuk dengan akun ' +
      PJB_DOMAIN_ADMIN + ' Anda — kalau perlu, pakai jendela peramban yang sudah ' +
      'masuk akun kerja.';

  var html =
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:440px;' +
    'margin:64px auto;padding:0 20px;text-align:center;color:#10151f">' +
    '<div style="font-size:40px">🔒</div>' +
    '<h1 style="font-size:20px;margin:12px 0 10px">Halaman khusus admin</h1>' +
    '<p style="font-size:14px;line-height:1.65;color:#4a5468">' + sebab + '</p>' +
    '<p style="font-size:13px;line-height:1.6;color:#79849a;margin-top:18px">' +
    'Halaman kader tetap bisa dibuka lewat tautan yang sama tanpa <code>?page=admin</code>.' +
    '</p></div>';
  return HtmlService.createHtmlOutput(html).setTitle('Khusus admin');
}

/** Dipakai template untuk menyisipkan potongan HTML lain. */
function pjbInclude(nama) {
  return HtmlService.createHtmlOutputFromFile(nama).getContent();
}
