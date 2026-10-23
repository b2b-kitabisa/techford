/**
 * MasterData.gs — menyusun tab "Master Data" dari database web app.
 *
 * Susunan kolomnya sengaja sama dengan master Bekasi dan Tangerang yang sudah
 * ada, ditambah dua kolom baru di belakang (jenis container yang DIPERIKSA dan
 * status "tidak bisa diperiksa"). Kolom tambahan di belakang tidak mengganggu
 * dashboard, yang mencocokkan kolom lewat nama headernya.
 *
 * Dijalankan oleh pemicu terjadwal, bukan saat kader menekan Simpan — supaya
 * pekerjaan berat ini tidak pernah membuat kader menunggu.
 */

var PJB_HEAD_MASTER = [
  'Kota/Kabupaten', 'Kelurahan', 'RW', 'Nama Kader', 'Bulan', 'Tahun',
  'No Urut (asal form)', 'Tanggal Pemantauan', 'Tanggal Mentah (asli)',
  'Nama Pemilik Rumah/Bangunan', 'Alamat (Jalan/Blok/No)', 'RT',
  'Jumlah Container Diperiksa', 'Jumlah Container Positif (+)', 'Jumlah Container Negatif (-)',
  'Kode Jenis Container Positif Jentik', 'Jenis Container Positif (nama)',
  'Bangunan Negatif (-) Jentik',
  'Tindakan 3M/4M+ (0/1)', 'Tindakan Larvasidasi (0/1)',
  'Pengelolaan Sampah (0/1)', 'Kerja Bakti (K3) (0/1)',
  'Status Foto', 'Link Foto',
  'Sheet Asal', 'Baris Sumber', 'Catatan Kualitas Data',
  'Jenis Container Diperiksa (nama)', 'Bisa Diperiksa', 'Alasan Tidak Diperiksa'
];

function pjbBangunMasterData() {
  var kaderMap = {};
  dbKader_().forEach(function (k) { kaderMap[String(k['ID'])] = k; });

  var rumahMap = {};
  dbRumah_().forEach(function (r) { rumahMap[String(r['ID Rumah'])] = r; });

  var baris = [];
  dbPeriode_().forEach(function (p) {
    var periode = String(p['Periode']);
    var s = periode.split('-');
    var bulan = (PJB_BULAN[parseInt(s[1], 10) - 1] || '').toUpperCase();
    var tahun = parseInt(s[0], 10);
    var sheetAsal = dbEntriSheetName_(periode);

    dbEntri_(periode).forEach(function (e) {
      var r = rumahMap[String(e['ID Rumah'])];
      if (!r) return;
      var k = kaderMap[String(e['Kader ID'])] || {};

      var bisa = String(e['Bisa Diperiksa']).toLowerCase() !== 'tidak';
      var cDip = pjbAngka_(e['Jml Container']);
      var cPos = pjbAngka_(e['Jml Positif']);
      var jenisPos = pjbPecah_(e['Jenis Positif']);
      var jenisDip = pjbPecah_(e['Jenis Diperiksa']);
      var lain = pjbTeks_(e['Lain-lain']);

      var catatan = [];
      if (!bisa) catatan.push('Tidak bisa diperiksa: ' + pjbTeks_(e['Alasan']));
      if (lain) catatan.push('Container lain-lain: ' + lain);
      if (pjbAngka_(e['Versi']) > 1) catatan.push('Pernah diperbaiki (versi ' + pjbAngka_(e['Versi']) + ')');

      baris.push([
        PJB_KOTA, PJB_KELURAHAN, pjbTeks_(r['RW']), pjbTeks_(k['Nama']),
        bulan, tahun,
        pjbTeks_(e['ID Rumah']),
        pjbTeks_(e['Tanggal']), pjbTeks_(e['Tanggal']),
        pjbTeks_(r['Nama Pemilik']), pjbTeks_(r['Alamat']), pjbTeks_(r['RT']),
        bisa ? cDip : '', bisa ? cPos : '', bisa ? Math.max(0, cDip - cPos) : '',
        pjbKodeContainer_(jenisPos),
        jenisPos.join(', '),
        bisa ? (cPos === 0 ? 1 : 0) : '',
        bisa ? pjbAngka_(e['4M+']) : '', bisa ? pjbAngka_(e['Larvasidasi']) : '',
        bisa ? pjbAngka_(e['Sampah']) : '', bisa ? pjbAngka_(e['K3']) : '',
        pjbTeks_(e['Foto URL']) ? 'Ada foto' : 'Tidak ada foto',
        pjbTeks_(e['Foto URL']),
        sheetAsal, pjbAngka_(e['_row']), catatan.join('; '),
        jenisDip.join(', '),
        bisa ? 'ya' : 'tidak',
        bisa ? '' : pjbTeks_(e['Alasan'])
      ]);
    });
  });

  var sh = dbSheet_(SH_MASTER, PJB_HEAD_MASTER);
  sh.clear();
  sh.getRange(1, 1, 1, PJB_HEAD_MASTER.length).setValues([PJB_HEAD_MASTER]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (baris.length) sh.getRange(2, 1, baris.length, PJB_HEAD_MASTER.length).setValues(baris);

  dbProps_().setProperty('master_dibangun', new Date().toISOString());
  return baris.length;
}

/** Nama container dikembalikan ke nomor legendanya, supaya kolom kode tetap
 *  terisi seperti pada formulir aslinya. */
function pjbKodeContainer_(namaList) {
  var kode = [];
  namaList.forEach(function (n) {
    var i = PJB_CONTAINER.indexOf(n);
    if (i !== -1) kode.push(i + 1);
  });
  return kode.join(',');
}
