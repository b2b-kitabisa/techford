/**
 * Search box Document Pipeline — HARUS bisa menemukan COR "Tanpa Project".
 *
 * KENAPA TES INI ADA
 * ------------------
 * Sebelumnya matchesSearch cuma mencocokkan project.Project_ID/Project_Name
 * (dari getProjectById) — untuk COR yang sengaja dibuat TANPA project
 * (Project_ID kosong), getProjectById selalu mengembalikan null, jadi
 * project.Project_Name selalu string kosong dan TIDAK PERNAH ada yang cocok
 * dengan apa pun yang diketik user. Nama project manual yang admin isi di
 * Kalkulator COR (COR_Header.Manual_Project_Name) — satu-satunya identitas
 * "manusiawi" yang dimiliki dokumen seperti ini — jadi tidak pernah bisa
 * dicari sama sekali.
 *
 * Jalankan: node tests/doc-pipeline-search.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', '50_Presentation', 'html', 'Document', 'DocumentPipelineContent.html');

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  OK   ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
  else { failures.push(label + (detail !== undefined ? ' (dapat: ' + detail + ')' : '')); console.log('  GAGAL ' + label + (detail !== undefined ? ' -> ' + detail : '')); }
}

function ambilFungsi(src, nama) {
  const tanda = 'function ' + nama + '(';
  const mulai = src.indexOf(tanda);
  if (mulai === -1) throw new Error('fungsi tidak ditemukan: ' + nama);
  let i = src.indexOf('{', mulai), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(mulai, j + 1); }
  }
  throw new Error('akhir fungsi tidak ditemukan: ' + nama);
}

const pageSrc = fs.readFileSync(SRC, 'utf8');
const FN_NAMES = ['getProjectById', 'getClientById', 'docProjectLabel', 'isDocTanpaProject', 'getFilteredDocuments'];

function buatLingkungan(opsi) {
  const el = {
    docSearch: { value: opsi.search || '' },
    docDateFrom: { value: '' },
    docDateTo: { value: '' },
    docTypeFilter: { value: '' }
  };
  const ctx = {
    console,
    document: { getElementById: (id) => el[id] || { value: '' } },
    allDocuments: opsi.docs || [],
    allProjects: opsi.projects || [],
    allClients: opsi.clients || [],
    allCorHeaders: opsi.headers || [],
    taxonomy: { noProjectLabel: 'Tanpa Project' },
    docStageFilterValues: [],
    docStatusFilterValues: [],
    Date: Date
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  FN_NAMES.forEach(function (n) { vm.runInContext(ambilFungsi(pageSrc, n), ctx); });
  return ctx;
}

console.log('\n1) Search "Ramadan" menemukan COR Tanpa Project dengan Manual_Project_Name "Gebrakan Ramadan 1447H"');
{
  const ctx = buatLingkungan({
    search: 'ramadan',
    docs: [
      { Doc_ID: 'DOC-1', Project_ID: '', Document_Type: 'COR', Requested_Date: '2026-01-01' },
      { Doc_ID: 'DOC-2', Project_ID: 'PRJ-1', Document_Type: 'COR', Requested_Date: '2026-01-01' }
    ],
    projects: [{ Project_ID: 'PRJ-1', Project_Name: 'Lain Sama Sekali', Client_ID: '' }],
    headers: [{ Doc_ID: 'DOC-1', Manual_Project_Name: 'Gebrakan Ramadan 1447H' }]
  });
  const hasil = ctx.getFilteredDocuments();
  ok('cuma DOC-1 yang cocok', hasil.length === 1 && hasil[0].Doc_ID === 'DOC-1', JSON.stringify(hasil.map(d => d.Doc_ID)));
}

console.log('\n2) Search "tanpa project" menemukan COR yang BELUM diisi nama manual (jatuh ke label generik)');
{
  const ctx = buatLingkungan({
    search: 'tanpa project',
    docs: [
      { Doc_ID: 'DOC-1', Project_ID: '', Document_Type: 'COR', Requested_Date: '2026-01-01' },
      { Doc_ID: 'DOC-2', Project_ID: 'PRJ-1', Document_Type: 'COR', Requested_Date: '2026-01-01' }
    ],
    projects: [{ Project_ID: 'PRJ-1', Project_Name: 'Project Biasa', Client_ID: '' }],
    headers: [{ Doc_ID: 'DOC-1', Manual_Project_Name: '' }]
  });
  const hasil = ctx.getFilteredDocuments();
  ok('DOC-1 (Tanpa Project, belum diisi manual) ikut cocok', hasil.some(d => d.Doc_ID === 'DOC-1'), JSON.stringify(hasil.map(d => d.Doc_ID)));
  ok('DOC-2 (ber-project biasa) TIDAK ikut cocok', !hasil.some(d => d.Doc_ID === 'DOC-2'));
}

console.log('\n3) Search tetap berfungsi normal untuk dokumen BER-project (tidak ada regresi)');
{
  const ctx = buatLingkungan({
    search: 'kampanye ceria',
    docs: [
      { Doc_ID: 'DOC-1', Project_ID: 'PRJ-1', Document_Type: 'COR', Requested_Date: '2026-01-01' },
      { Doc_ID: 'DOC-2', Project_ID: 'PRJ-2', Document_Type: 'COR', Requested_Date: '2026-01-01' }
    ],
    projects: [
      { Project_ID: 'PRJ-1', Project_Name: 'Kampanye Ceria 2026', Client_ID: '' },
      { Project_ID: 'PRJ-2', Project_Name: 'Lainnya', Client_ID: '' }
    ]
  });
  const hasil = ctx.getFilteredDocuments();
  ok('cuma DOC-1 yang cocok (Project_Name)', hasil.length === 1 && hasil[0].Doc_ID === 'DOC-1', JSON.stringify(hasil.map(d => d.Doc_ID)));
}

console.log('\n4) Search kosong -> semua dokumen tetap muncul (tidak ada gerbang baru yang salah menyaring)');
{
  const ctx = buatLingkungan({
    search: '',
    docs: [
      { Doc_ID: 'DOC-1', Project_ID: '', Document_Type: 'COR', Requested_Date: '2026-01-01' },
      { Doc_ID: 'DOC-2', Project_ID: 'PRJ-1', Document_Type: 'COR', Requested_Date: '2026-01-02' }
    ],
    projects: [{ Project_ID: 'PRJ-1', Project_Name: 'X', Client_ID: '' }]
  });
  const hasil = ctx.getFilteredDocuments();
  ok('kedua dokumen tetap muncul', hasil.length === 2, hasil.length);
}

console.log('\n' + (failures.length
  ? '=== ' + pass + ' LOLOS, ' + failures.length + ' GAGAL ===\n' + failures.map(f => '  - ' + f).join('\n')
  : '=== ' + pass + ' LOLOS, 0 GAGAL ==='));
process.exit(failures.length ? 1 : 0);
