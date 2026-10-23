/**
 * Config.gs — konstanta tunggal untuk seluruh project.
 *
 * Semua pengenal diberi awalan PJB_/pjb supaya aman kalau file ini suatu saat
 * ditempel ke project Apps Script yang sudah berisi script lain.
 */

/** Spreadsheet Agustus 2026 — sumber daftar rumah dan riwayat awal. */
var PJB_SUMBER_AGUSTUS = '1vmWrnQe1Pfin0cfukN-JnJBqcCP7F_s_g3DLUWRYrUA';

/** Periode pertama yang diisi lewat web app ini. */
var PJB_PERIODE_MULAI = '2026-11';

/** Hanya email berdomain ini yang boleh membuka halaman admin. */
var PJB_DOMAIN_ADMIN = 'kitabisa.com';

/** Target bawaan per kader per bulan. */
var PJB_TARGET_BAWAAN = 50;

var PJB_KOTA = 'Tangerang';
var PJB_KELURAHAN = 'Cipondoh';

// ---------------------------------------------------------------- nama sheet

var SH_KADER   = 'Kader';
var SH_RUMAH   = 'Rumah';
var SH_PERIODE = 'Periode';
var SH_FOTO    = 'FotoIndex';
var SH_LOG     = 'Log';
var SH_MASTER  = 'Master Data';
/** Entri dipecah per periode ("Entri 2026-11") supaya tiap sheet tetap kecil
 *  dan satu kali baca tidak pernah melebihi ~1.300 baris. */
var SH_ENTRI_PREFIX = 'Entri ';

var PJB_HEAD_KADER = ['ID','Nama','RW','PIN','Target','Aktif','PIN Diubah','PIN Dilihat','Terakhir Masuk'];
var PJB_HEAD_RUMAH = ['ID Rumah','RW','Kader ID','Nama Pemilik','Alamat','RT','Aktif','Dibuat','ID Asal'];
var PJB_HEAD_ENTRI = [
  'ID Entri','Periode','ID Rumah','Kader ID','Tanggal','Bisa Diperiksa','Alasan',
  'Jml Container','Jml Positif','Jml Negatif','Jenis Diperiksa','Jenis Positif','Lain-lain',
  '4M+','Larvasidasi','Sampah','K3',
  'Foto URL','Foto Nama','Foto Sidik','Foto Waktu',
  'Dibuat','Diubah','Diubah Oleh','Versi'
];
var PJB_HEAD_PERIODE = ['Periode','Label','Status','Catatan'];
var PJB_HEAD_FOTO    = ['Sidik','Sidik Kirim','ID Entri','ID Rumah','Periode','Nama Berkas','Ukuran','Waktu EXIF','Diunggah'];
var PJB_HEAD_LOG     = ['Waktu','Aktor','Aksi','Detail'];

// ---------------------------------------------------------------- legenda

/**
 * 20 jenis container, sesuai legenda yang tercetak di bagian bawah tiap tab RW
 * formulir Cipondoh. Nomornya dipakai saat menulis kolom kode agar tetap sama
 * dengan formulir aslinya.
 */
var PJB_CONTAINER = [
  'Tampungan dispenser',
  'Tampungan air kulkas',
  'Tampungan air AC',
  'Tempat minum hewan peliharaan',
  'Tatakan pot bunga',
  'Vas tanaman air',
  'Pakaian yang digantung',
  'Ember/bak mandi',
  'Barang bekas di halaman',
  'Tempat genangan air',
  'Penampungan air bersih',
  'Akuarium',
  'Perangkap semut',
  'Ban bekas',
  'Kolam ikan',
  'Meteran air',
  'Talang air',
  'Pelepah pohon',
  'Selokan/saluran drainase',
  'Lain-lain'
];
/** Indeks 0-based "Lain-lain" — memilih ini mewajibkan isian teks bebas. */
var PJB_IDX_LAIN = 19;

var PJB_ALASAN = ['Pemilik tidak ada','Rumah kosong','Pindah','Menolak diperiksa','Lainnya'];

var PJB_BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
                 'Juli','Agustus','September','Oktober','November','Desember'];

var PJB_TZ = 'Asia/Jakarta';

/** Ukuran foto setelah dikecilkan di HP — cukup untuk bukti, ringan dikirim. */
var PJB_FOTO_MAKS_PX = 1280;
