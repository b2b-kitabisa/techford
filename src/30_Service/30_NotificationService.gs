/**
 * Service.NotificationService
 *
 * Cross-cutting service — dipakai oleh banyak modul (Employee, Payroll,
 * Approval, dst), jadi TIDAK ditaruh di dalam satu modul tertentu.
 * Kalau nanti Anda ganti dari GmailApp ke API pihak ketiga, cukup ubah
 * implementasi di sini, semua modul pemanggil tidak berubah.
 */
var NotificationService = (function (module) {

  module.sendEmail = function (to, subject, htmlBody) {
    GmailApp.sendEmail(to, subject, '', {
      htmlBody: htmlBody,
      name: Config.MAIL.SENDER_NAME
    });
  };

  return module;
})(NotificationService || {});
