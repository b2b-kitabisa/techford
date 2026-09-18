#!/usr/bin/env python3
"""Extra screens + architecture diagrams for the Techford portfolio."""
import pathlib
from gen_screens import page

OUT = pathlib.Path(__file__).parent

# ───────────────────────── COR Calculator ─────────────────────────
COR = """
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
  <div style="font-size:19px;font-weight:700">COR: DOC26-00218</div>
  <div style="display:flex;gap:7px">
    <span class="btn-ghost">Convert ke Gross Down (satu arah)</span>
    <span class="btn-dark">Simpan Draft</span>
    <span class="btn-ghost">Generate PDF</span>
    <span style="border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:6px;padding:6px 14px;font-size:11px;font-weight:600">Download PDF</span>
  </div>
</div>
<div style="font-size:11px;color:#64748b;margin-bottom:14px">Vendor: Yayasan Mitra Sejahtera &middot; Metode: GROSS_DOWN &middot; Via SALSET: Ya &middot; Status: Waiting Approval</div>

<div style="font-size:13px;font-weight:700;margin-bottom:7px">Dana Masuk</div>
<div class="tbl-wrap" style="margin-bottom:14px"><table>
<thead><tr><th>Tipe</th><th>Nominal</th><th>Platform Fee</th><th>Tech Fee</th><th>NDV</th><th>Admin Fee</th><th>Implementation Fund</th></tr></thead>
<tbody>
<tr><td>CLIENT</td><td>Rp 500.000.000</td><td>Rp 25.000.000</td><td>Rp 5.000.000</td><td>Rp 470.000.000</td><td>Rp 18.000</td><td style="font-weight:600;color:#0f172a">Rp 469.982.000</td></tr>
<tr><td>CAMPAIGN (Zakat)</td><td>Rp 150.000.000</td><td>Rp 0</td><td>Rp 0</td><td>Rp 150.000.000</td><td>Rp 6.000</td><td style="font-weight:600;color:#0f172a">Rp 149.994.000</td></tr>
</tbody>
<tfoot><tr style="background:#f1f5f9;font-weight:700"><td colspan="6" style="padding:7px 12px">Total Implementation Fund</td><td style="padding:7px 12px">Rp 619.976.000</td></tr></tfoot>
</table></div>

<div style="display:grid;grid-template-columns:1.35fr 1fr;gap:14px">
  <div>
    <div style="font-size:13px;font-weight:700;margin-bottom:7px">Biaya</div>
    <div class="tbl-wrap"><table>
    <thead><tr><th>Kelompok</th><th>Keterangan</th><th>Kategori / Tipe</th><th>Harga &times; Qty &times; Periode</th><th>Total (after PPh)</th></tr></thead>
    <tbody>
    <tr><td>VENDOR</td><td>Implementasi program lapangan</td><td>Jasa / Lembaga</td><td>Rp 180.000.000 &times; 1 &times; 1</td><td style="font-weight:600;color:#0f172a">Rp 183.673.469</td></tr>
    <tr><td>VENDOR</td><td>Produksi konten &amp; dokumentasi</td><td>Jasa / Individu</td><td>Rp 45.000.000 &times; 1 &times; 1</td><td style="font-weight:600;color:#0f172a">Rp 46.153.846</td></tr>
    <tr><td>SAL</td><td>Fee pengelolaan SALSET</td><td>&ndash; / &ndash;</td><td>Rp 12.000.000 &times; 1 &times; 3</td><td style="font-weight:600;color:#0f172a">Rp 36.000.000</td></tr>
    </tbody></table></div>

    <div style="font-size:13px;font-weight:700;margin:14px 0 7px">Default Margin (Component Mode)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="card" style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:10.5px;color:#475569">Consultancy Service Fee</span><b>7%</b></div>
      <div class="card" style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:10.5px;color:#475569">Creative Development</span><b>5%</b></div>
      <div class="card" style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:10.5px;color:#475569">Program Implementation</span><b>8%</b></div>
      <div class="card" style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:10.5px;color:#475569">Impact Measurement</span><b>3%</b></div>
    </div>
  </div>

  <div>
    <div style="font-size:13px;font-weight:700;margin-bottom:7px">Hasil Tersimpan (Gross Down)</div>
    <div class="card" style="padding:12px">
      <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">Total Dana Masuk</span><b>Rp 619.976.000</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">Fee SALSET (10%)</span><b>Rp 61.997.600</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">Cash Gross</span><b>Rp 545.978.400</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">DPP / PPN</span><b>Rp 491.872.432</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">PPh 23 (2%)</span><b>Rp 9.837.449</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">Cash Net</span><b>Rp 482.034.983</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">Margin Rencana (23%)</span><b>Rp 110.868.046</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9"><span style="color:#64748b">Available Cost</span><b>Rp 371.166.937</b></div>
      <div style="display:flex;justify-content:space-between;padding:5px 0 3px"><span style="color:#0f172a;font-weight:700">Profit Aktual</span><b style="color:#15803d">Rp 252.207.668</b></div>
    </div>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;margin-top:10px;font-size:10.5px;color:#92400e">
      <b>Margin Guard:</b> margin aktual 52.3% &ge; margin rencana 23% &mdash; aman, tidak perlu alasan tambahan.
    </div>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px;margin-top:10px;font-size:10.5px;color:#1e40af">
      Menunggu approval dari <b>Head of B2B</b>. Link approval berlaku 14 hari &mdash; approver tidak perlu login.
    </div>
  </div>
</div>"""

(OUT / "screen-cor.html").write_text(
    page("COR Calculator", "Document Pipeline", "Operation Module", "COR Calculator", COR))

# ───────────────────────── Dashboard ─────────────────────────
DASH = """
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
  <div class="card"><div class="lbl t-blue">Total GDV</div><div class="val">Rp 18,4 M</div><div class="sub">78% dari target tahunan</div></div>
  <div class="card"><div class="lbl t-green">Service Revenue</div><div class="val">Rp 2,1 M</div><div class="sub">64% dari target tahunan</div></div>
  <div class="card"><div class="lbl t-amber">Project Won</div><div class="val">37</div><div class="sub">dari 128 project aktif</div></div>
  <div class="card"><div class="lbl t-gray">Win Rate</div><div class="val">28,9%</div><div class="sub">rolling 90 hari</div></div>
</div>
<div style="display:grid;grid-template-columns:1.3fr 1fr;gap:14px">
  <div>
    <div style="font-size:13px;font-weight:700;margin-bottom:7px">Pencapaian per Consultant</div>
    <div class="tbl-wrap"><table>
    <thead><tr><th>Consultant</th><th>Target GDV</th><th>Realisasi GDV</th><th>%</th><th>Service Revenue</th><th>%</th></tr></thead>
    <tbody>
    <tr><td class="ttl">Shienny Anggraini</td><td>Rp 5.000.000.000</td><td>Rp 4.620.000.000</td><td><span class="badge b-green">92%</span></td><td>Rp 610.000.000</td><td><span class="badge b-green">88%</span></td></tr>
    <tr><td class="ttl">Bagas Prakoso</td><td>Rp 4.500.000.000</td><td>Rp 3.180.000.000</td><td><span class="badge b-amber">71%</span></td><td>Rp 402.000.000</td><td><span class="badge b-amber">67%</span></td></tr>
    <tr><td class="ttl">Dimas Nugroho</td><td>Rp 4.000.000.000</td><td>Rp 3.910.000.000</td><td><span class="badge b-green">98%</span></td><td>Rp 455.000.000</td><td><span class="badge b-green">95%</span></td></tr>
    <tr><td class="ttl">Rani Puspita</td><td>Rp 3.500.000.000</td><td>Rp 1.820.000.000</td><td><span class="badge b-red">52%</span></td><td>Rp 231.000.000</td><td><span class="badge b-red">48%</span></td></tr>
    <tr><td class="ttl">Yoga Pratama</td><td>Rp 3.000.000.000</td><td>Rp 2.640.000.000</td><td><span class="badge b-green">88%</span></td><td>Rp 318.000.000</td><td><span class="badge b-amber">79%</span></td></tr>
    </tbody></table></div>
  </div>
  <div>
    <div style="font-size:13px;font-weight:700;margin-bottom:7px">Sales Pipeline per Stage</div>
    <div class="card" style="padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0"><span style="color:#475569">Prospect</span><div style="flex:1;margin:0 10px;height:8px;background:#f1f5f9;border-radius:99px"><div style="width:100%;height:8px;background:#93c5fd;border-radius:99px"></div></div><b>64</b></div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0"><span style="color:#475569">Negotiation</span><div style="flex:1;margin:0 10px;height:8px;background:#f1f5f9;border-radius:99px"><div style="width:42%;height:8px;background:#fbbf24;border-radius:99px"></div></div><b>27</b></div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0"><span style="color:#475569">Won</span><div style="flex:1;margin:0 10px;height:8px;background:#f1f5f9;border-radius:99px"><div style="width:58%;height:8px;background:#4ade80;border-radius:99px"></div></div><b>37</b></div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0"><span style="color:#475569">Loss</span><div style="flex:1;margin:0 10px;height:8px;background:#f1f5f9;border-radius:99px"><div style="width:31%;height:8px;background:#f87171;border-radius:99px"></div></div><b>20</b></div>
    </div>
    <div style="font-size:13px;font-weight:700;margin:14px 0 7px">Dokumen Menunggu Aksi</div>
    <div class="card" style="padding:12px">
      <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9"><span style="color:#475569">COR menunggu approval</span><span class="badge b-amber">6</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9"><span style="color:#475569">Quotation revisi</span><span class="badge b-amber">3</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f1f5f9"><span style="color:#475569">Cost Monitoring belum ditutup</span><span class="badge b-blue">11</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#475569">Klaim GDV melebihi realisasi</span><span class="badge b-red">4</span></div>
    </div>
  </div>
</div>"""

(OUT / "screen-dashboard.html").write_text(
    page("Dashboard Sales", "Dashboard Sales", "Dashboard Analytics", "Dashboard Sales", DASH))

# ───────────────────────── GDV Matching ─────────────────────────
GDV = """
<div style="font-size:19px;font-weight:700;margin-bottom:3px">GDV Matching</div>
<div style="font-size:11px;color:#64748b;margin-bottom:14px">Rekonsiliasi klaim GDV di Revenue Breakdown project vs realisasi di GDV Controller. Matching berdasarkan Link Campaign, fallback ke Child Short URL.</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
  <div class="card"><div class="lbl t-red">Klaim Melebihi</div><div class="val">4</div></div>
  <div class="card"><div class="lbl t-gray">Belum Sinkron</div><div class="val">18</div></div>
  <div class="card"><div class="lbl t-green">Sinkron</div><div class="val">96</div></div>
</div>
<div class="tbl-wrap"><table>
<thead><tr><th>Project</th><th>Client</th><th>Link Campaign</th><th>Klaim</th><th>Realized</th><th>Selisih</th><th>Status</th></tr></thead>
<tbody>
<tr><td><span style="color:#2563eb;font-weight:600">PRJ26-00084</span><div class="sml">Program Beasiswa Pesisir</div></td><td>ZERONE JAPAN</td><td>beasiswapesisir2026</td><td>Rp 320.000.000</td><td>Rp 287.450.000</td><td style="color:#dc2626;font-weight:600">-Rp 32.550.000</td><td><span class="badge b-red">Klaim Melebihi</span></td></tr>
<tr><td><span style="color:#2563eb;font-weight:600">PRJ26-00081</span><div class="sml">Donasi Air Bersih NTT</div></td><td>MOP BEAUTY</td><td>airbersihntt</td><td>Rp 150.000.000</td><td>Rp 141.200.000</td><td style="color:#dc2626;font-weight:600">-Rp 8.800.000</td><td><span class="badge b-red">Klaim Melebihi</span></td></tr>
<tr><td><span style="color:#2563eb;font-weight:600">PRJ26-00078</span><div class="sml">Sedekah Pangan Ramadan</div></td><td>PT ABM INVESTAMA</td><td>sedekahpanganramadan</td><td>Rp 90.000.000</td><td>Rp 0</td><td style="font-weight:600">-Rp 90.000.000</td><td><span class="badge b-gray">Belum Sinkron</span></td></tr>
<tr><td><span style="color:#2563eb;font-weight:600">PRJ26-00075</span><div class="sml">Kelas Literasi Digital</div></td><td>YCAB FOUNDATION</td><td>kelasliterasidigital</td><td>Rp 210.000.000</td><td>Rp 412.500.000</td><td style="font-weight:600;color:#15803d">+Rp 202.500.000</td><td><span class="badge b-green">Sinkron</span></td></tr>
<tr><td><span style="color:#2563eb;font-weight:600">PRJ26-00071</span><div class="sml">Bantuan Alat Sekolah</div></td><td>DEOXIDE OFFICIAL</td><td>bantuanalatsekolah</td><td>Rp 75.000.000</td><td>Rp 98.300.000</td><td style="font-weight:600;color:#15803d">+Rp 23.300.000</td><td><span class="badge b-green">Sinkron</span></td></tr>
<tr><td><span style="color:#2563eb;font-weight:600">PRJ26-00069</span><div class="sml">Renovasi Posyandu</div></td><td>ZERONE JAPAN</td><td>renovasiposyandu</td><td>Rp 60.000.000</td><td>Rp 84.100.000</td><td style="font-weight:600;color:#15803d">+Rp 24.100.000</td><td><span class="badge b-green">Sinkron</span></td></tr>
</tbody></table></div>"""

(OUT / "screen-gdv.html").write_text(
    page("GDV Matching", "GDV Matching", "Operation Module", "GDV Matching", GDV))

# ───────────────────────── Document Pipeline ─────────────────────────
DOC = """
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
  <div style="font-size:19px;font-weight:700">Document Pipeline</div>
  <div style="display:flex;gap:7px"><span class="btn-ghost">Dokumen Baru</span><span class="btn-ghost">COR Baru</span><span class="btn-dark">Quotation Baru</span></div>
</div>
<div class="tbl-wrap"><table>
<thead><tr><th>Doc ID</th><th>Tipe</th><th>Project</th><th>Status</th><th>Stage</th><th>Entity</th><th>Diperbarui</th><th>Action</th></tr></thead>
<tbody>
<tr><td class="ttl">DOC26-00218</td><td><span class="badge b-purple">COR</span></td><td>Program Beasiswa Pesisir<div class="sml">PRJ26-00084</div></td><td><span class="badge b-amber">Waiting Approval</span></td><td>In Progress</td><td>&ndash;</td><td>18 Sep 2026</td><td><span class="chev">&rsaquo;</span></td></tr>
<tr><td class="ttl">DOC26-00217</td><td><span class="badge b-blue">QUOTATION</span></td><td>Kelas Literasi Digital<div class="sml">PRJ26-00075</div></td><td><span class="badge b-green">Signed</span></td><td>Done</td><td>PT KAI</td><td>17 Sep 2026</td><td><span class="chev">&rsaquo;</span></td></tr>
<tr><td class="ttl">DOC26-00216</td><td><span class="badge b-gray">DECK</span></td><td>Donasi Air Bersih NTT<div class="sml">PRJ26-00081</div></td><td><span class="badge b-blue">Client Review</span></td><td>Client Review</td><td>&ndash;</td><td>16 Sep 2026</td><td><span class="chev">&rsaquo;</span></td></tr>
<tr><td class="ttl">DOC26-00215</td><td><span class="badge b-gray">RAB</span></td><td>Sedekah Pangan Ramadan<div class="sml">PRJ26-00078</div></td><td><span class="badge b-amber">Drafting</span></td><td>In Progress</td><td>&ndash;</td><td>15 Sep 2026</td><td><span class="chev">&rsaquo;</span></td></tr>
<tr><td class="ttl">DOC26-00214</td><td><span class="badge b-blue">QUOTATION</span></td><td>Bantuan Alat Sekolah<div class="sml">PRJ26-00071</div></td><td><span class="badge b-green">Approved</span></td><td>Client Review</td><td>YKB</td><td>14 Sep 2026</td><td><span class="chev">&rsaquo;</span></td></tr>
<tr><td class="ttl">DOC26-00213</td><td><span class="badge b-gray">PKS</span></td><td>Renovasi Posyandu<div class="sml">PRJ26-00069</div></td><td><span class="badge b-green">Done</span></td><td>Done</td><td>&ndash;</td><td>12 Sep 2026</td><td><span class="chev">&rsaquo;</span></td></tr>
<tr><td class="ttl">DOC26-00212</td><td><span class="badge b-purple">COR</span></td><td>Kelas Literasi Digital<div class="sml">PRJ26-00075</div></td><td><span class="badge b-green">Approved</span></td><td>Done</td><td>&ndash;</td><td>11 Sep 2026</td><td><span class="chev">&rsaquo;</span></td></tr>
<tr><td class="ttl">DOC26-00211</td><td><span class="badge b-gray">BAST</span></td><td>Program Beasiswa Pesisir<div class="sml">PRJ26-00084</div></td><td><span class="badge b-gray">Not Started</span></td><td>New Request</td><td>&ndash;</td><td>10 Sep 2026</td><td><span class="chev">&rsaquo;</span></td></tr>
</tbody></table></div>"""

(OUT / "screen-doc.html").write_text(
    page("Document Pipeline", "Document Pipeline", "Operation Module", "Document Pipeline", DOC))

print("extra screens written")
