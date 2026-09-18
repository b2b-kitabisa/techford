#!/usr/bin/env python3
"""Generate static HTML renders of the Techford v2 UI for the portfolio PDF.
Markup mirrors the real Next.js components; data is fictional sample data."""
import pathlib

OUT = pathlib.Path(__file__).parent

NAV = [
    ("Utama", [("Dashboard Sales", 0), ("Home", 0)]),
    ("Sales", [("Lead Capturing", 0), ("Client Monitoring", 0), ("Sales Pipeline", 0)]),
    ("Operasional", [("Document Pipeline", 0), ("Cost Monitoring", 0), ("Vendor", 0),
                     ("GDV Controller", 0), ("GDV Matching", 0), ("Ads Sponsorship Progress", 0)]),
    ("Pengaturan", [("Master Data", 0), ("Achievement Target", 0), ("Margin Guide", 0),
                    ("Employees", 0), ("Audit Log", 0)]),
]


def sidebar(active):
    out = ['<div class="side"><div class="side-logo"><b>Techford</b></div><div class="side-nav">']
    for group, items in NAV:
        out.append(f'<div class="nav-group">{group}</div>')
        for label, _ in items:
            cls = "nav-item active" if label == active else "nav-item"
            out.append(f'<div class="{cls}">{label}</div>')
    out.append('</div><div class="side-foot"><div class="nm">Bagas Prakoso</div>'
               '<span class="rl">Master Admin</span><div class="lo">Logout</div></div></div>')
    return "".join(out)


def page(title, active, section, crumb, body, action="", drawer=""):
    act = f'<div class="btn-primary">{action}</div>' if action else "<div></div>"
    return f"""<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>{title}</title><link rel="stylesheet" href="shared.css"></head><body>
{sidebar(active)}
<div class="main" style="position:relative">
  <div class="topbar"><div class="crumb">{section}<span class="sep">&rsaquo;</span><b>{crumb}</b></div>{act}</div>
  <div class="content">{body}</div>
  {drawer}
</div></body></html>"""


# ───────────────────────── 1. Lead Capturing ─────────────────────────
LEAD_STATS = """
<div class="stat-wrap">
  <div class="stat-left">
    <div class="card click"><div class="lbl t-blue">New Leads</div><div class="val">18</div><div class="sub">1.3% dari Total Leads</div></div>
    <div class="card click active"><div class="lbl t-amber">Contacted</div><div class="val">100</div><div class="sub">7.5% dari Total Leads</div></div>
    <div class="card click"><div class="lbl t-green">Moved</div><div class="val">37</div><div class="sub">2.8% dari Total Leads</div></div>
    <div class="card click"><div class="lbl t-gray">Other</div><div class="val">1.068</div><div class="sub">79.8% dari Total Leads</div></div>
    <div class="card click"><div class="lbl t-red">Spam</div><div class="val">115</div><div class="sub">8.6% dari total termasuk spam</div></div>
    <div class="card"><div class="lbl t-gray">Total Leads</div><div class="val">1.223</div><div class="sub">tanpa Spam</div></div>
  </div>
  <div class="health">
    <div><div class="lbl">Inbound Health</div><div class="cap">Moved / Total Leads</div><div class="big">3%</div></div>
    <div class="rows">
      <div class="r"><span class="k">Didiamkan &gt;7 hari</span><span class="v">12</span></div>
      <div class="r"><span class="k">Porsi spam</span><span class="v">8.6%</span></div>
      <div class="r warn"><span class="k">Potensi duplikat</span><span class="v">190</span></div>
    </div>
  </div>
</div>"""

LEAD_FILTER = """
<div class="filters">
  <div class="fld grow"><label>Cari</label><div class="inp ph grow">Cari entitas, PIC, email, telepon...</div></div>
  <div class="fld"><label>Dari Tanggal</label><div class="inp ph">dd/mm/yyyy</div></div>
  <div class="fld"><label>Sampai Tanggal</label><div class="inp ph">dd/mm/yyyy</div></div>
  <div class="btn-dark">Terapkan</div><div class="btn-ghost">Reset Filter</div>
</div>"""

LEAD_ROWS = [
    ("Contacted", "b-amber", "12 Sep 2026", "0 hari", "Yayasan Cahaya Nusantara", "Dewi Anggraini",
     "628120000111", "kontak@cahayanusantara.id", "Pendanaan Sosial", 0),
    ("Other", "b-gray", "12 Sep 2026", "0 hari", "Koperasi Tani Makmur", "Bagus Hermawan",
     "628560000222", "admin@tanimakmur.co.id", "Program Berkelanjutan &amp; CSR", 2),
    ("New Leads", "b-blue", "11 Sep 2026", "1 hari", "PT Sinar Harapan Digital", "Rahmat Hidayat",
     "628770000333", "rahmat@sinarharapan.com", "Volunteering Activity", 0),
    ("Contacted", "b-amber", "11 Sep 2026", "1 hari", "Universitas Bina Cendekia", "Siti Nurhaliza",
     "628210000444", "kerjasama@binacendekia.ac.id", "Riset Sosial &amp; Monev", 0),
    ("Other", "b-gray", "10 Sep 2026", "2 hari", "Komunitas Peduli Pesisir", "Andi Saputra",
     "628130000555", "halo@pedulipesisir.org", "Pendanaan Sosial", 3),
    ("Moved", "b-green", "09 Sep 2026", "3 hari", "PT Boga Rasa Indonesia", "Maya Kusuma",
     "628990000666", "maya@bogarasa.id", "Project Sosial Marketing", 0),
    ("Spam", "b-red", "09 Sep 2026", "3 hari", "ALMS", "Grace Halim",
     "628110000777", "grace@example.com", "Pendanaan Sosial", 0),
    ("Other", "b-gray", "08 Sep 2026", "4 hari", "Panitia Pembangunan Masjid Al-Ikhlas", "Fajar Ramadhan",
     "628230000888", "fajar@example.org", "Program Berkelanjutan &amp; CSR", 2),
]


def lead_table():
    rows = []
    for st, cls, tgl, umur, ent, pic, hp, em, pr, dup in LEAD_ROWS:
        dupbadge = (f'<span class="badge b-orange" style="margin-left:6px">&#9783; {dup}</span>' if dup else "")
        rows.append(f"""<tr>
<td><span class="sq" style="display:inline-block;width:11px;height:11px;border:1px solid #cbd5e1;border-radius:3px"></span></td>
<td><span class="badge {cls}">{st}</span></td>
<td>{tgl}<div class="sml">{umur}</div></td>
<td><span class="ttl">{ent}</span>{dupbadge}<div class="sml">{pic}</div></td>
<td>{hp}<span class="copy">&#128203;</span><div class="sml">{em}<span class="copy">&#128203;</span></div></td>
<td>{pr}</td>
<td><span class="chev">&rsaquo;</span></td></tr>""")
    return f"""<div class="tbl-wrap"><table>
<thead><tr><th style="width:34px"></th><th>Status</th><th>Masuk</th><th>Entity Name</th><th>Kontak</th><th>Prioritas</th><th>Action</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table>
<div class="pager"><div>Menampilkan 1-25 dari 1.338 data &nbsp; <span class="pg-btn">25 / halaman</span></div>
<div>Halaman 1 / 54 <span class="pg-btn">Sebelumnya</span><span class="pg-btn">Berikutnya</span></div></div></div>"""


(OUT / "screen-lead.html").write_text(
    page("Lead Capturing", "Lead Capturing", "Sales Module", "Lead Capturing",
         LEAD_STATS + LEAD_FILTER + lead_table()))

# ───────────────────────── 2. Lead drawer ─────────────────────────
LEAD_DRAWER = """
<div class="scrim"></div>
<div class="drawer">
  <div class="dw-head">
    <div class="dw-top">
      <div><span class="badge b-amber">Contacted</span><span class="dw-id">INB26-01338</span></div>
      <div class="dw-pg"><span class="ar">&lsaquo;</span>5 / 1.338<span class="ar">&rsaquo;</span><span class="ar">&times;</span></div>
    </div>
    <div class="dw-title">Yayasan Cahaya Nusantara</div>
    <span class="pill p-ok" style="background:rgba(255,255,255,.12);color:#e2e8f0">PERUSAHAAN</span>
    <div class="dw-actions">
      <div class="da sel">Contacted &nbsp;&#9662;</div><div class="da blue">Update</div>
      <div class="da indigo" style="margin-left:auto">&raquo; Move to Client</div>
    </div>
  </div>
  <div class="dw-body">
    <div class="picrow" style="margin-bottom:16px">
      <div class="av" style="background:#3b82f6">DA</div>
      <div><div class="nm">Dewi Anggraini</div>
        <div class="ct" style="color:#2563eb">628120000111<span class="copy">&#128203;</span></div>
        <div class="ct" style="color:#2563eb">kontak@cahayanusantara.id<span class="copy">&#128203;</span></div></div>
    </div>
    <div class="dup">
      <div class="hd">Potensi Duplikat (2)</div>
      <div class="bd">
        <div class="it"><span class="sq"></span><span style="flex:1">Yayasan Cahaya Nusantara <span style="color:#94a3b8">(INB26-00874)</span></span><span class="badge b-gray">Other</span><span style="font-size:9px;color:#94a3b8">via Email</span></div>
        <div class="it"><span class="sq"></span><span style="flex:1">Cahaya Nusantara Foundation <span style="color:#94a3b8">(INB26-00512)</span></span><span class="badge b-amber">Contacted</span><span style="font-size:9px;color:#94a3b8">via Phone</span></div>
        <div style="display:flex;gap:7px;align-items:center;margin-top:8px">
          <span class="inp" style="min-width:90px;font-size:10px">Spam &nbsp;&#9662;</span>
          <span style="background:#ea580c;color:#fff;border-radius:6px;padding:4px 10px;font-size:10px;font-weight:600">Update 2 Data Terpilih</span>
        </div>
      </div>
    </div>
    <div class="hr"></div>
    <div class="sect">Interest</div>
    <div style="font-size:10px;font-weight:700;color:#64748b">Kebutuhan</div>
    <div style="font-size:11.5px;color:#1e293b;margin:2px 0 10px">Kami ingin menyalurkan dana bantuan untuk program pendidikan anak di wilayah 3T atas nama yayasan kami. Bagaimana mekanisme kerja samanya?</div>
    <div style="font-size:10px;font-weight:700;color:#64748b">Prioritas</div>
    <div style="font-size:11.5px;color:#1e293b;margin-top:2px">Pendanaan Sosial</div>
    <div class="hr"></div>
    <div class="sect">Sumber Trafik</div>
    <div><span class="tagpill">source <b>website</b></span><span class="tagpill">medium <b>homePage</b></span><span class="tagpill">campaign <b>general</b></span></div>
    <div class="hr"></div>
    <div class="sect">Other Notes</div>
    <div style="font-size:11.5px;color:#64748b">Belum ada catatan.</div>
  </div>
</div>"""

(OUT / "screen-lead-drawer.html").write_text(
    page("Lead Drawer", "Lead Capturing", "Sales Module", "Lead Capturing",
         LEAD_STATS + LEAD_FILTER + lead_table(), drawer=LEAD_DRAWER))

# ───────────────────────── 3. Client Monitoring ─────────────────────────
CLIENT_STATS = """
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
  <div class="card click"><div class="lbl t-amber" style="font-size:11px;text-transform:none;letter-spacing:0">Incomplete Client</div>
    <div class="val">48<span style="font-size:13px;font-weight:400;color:#94a3b8">/182</span></div>
    <div class="sub" style="color:#ef4444">client belum lengkap <b>26.4%</b></div></div>
  <div class="card click"><div class="lbl t-blue" style="font-size:11px;text-transform:none;letter-spacing:0">Inbound</div><div class="val">87</div><div class="sub">47.8% &middot; Inbound Client</div></div>
  <div class="card click"><div class="lbl" style="font-size:11px;text-transform:none;letter-spacing:0;color:#7e22ce">Outbound</div><div class="val">65</div><div class="sub">35.7% &middot; Outbound Client</div></div>
  <div class="card click"><div class="lbl t-amber" style="font-size:11px;text-transform:none;letter-spacing:0">Referral</div><div class="val">30</div><div class="sub">16.5% &middot; Referral Client</div></div>
</div>"""

CLIENT_FILTER = """
<div class="filters">
  <div class="fld grow"><label>Cari</label><div class="inp ph grow">Cari brand, entitas...</div></div>
  <div class="fld"><label>Entity Type</label><div class="inp">All Entity Type &nbsp;&#9662;</div></div>
  <div class="fld"><label>Industry</label><div class="inp">All Industry &nbsp;&#9662;</div></div>
  <div class="fld"><label>Dari Tanggal</label><div class="inp ph">dd/mm/yyyy</div></div>
  <div class="btn-dark">Terapkan</div><div class="btn-ghost">Reset Filter</div>
</div>"""

CLIENT_ROWS = [
    ("ZERONE JAPAN", "CL26-00185", True, "REFERRAL", "b-amber", "Maey Lestari", "628950000147", "-", "1 project", "12 Sep 2026"),
    ("GWK CULTURAL PARK", "CL26-00184", False, "INBOUND", "b-blue", "Elguarddine H.", "628770000255", "elguarddine@example.id", "-", "08 Sep 2026"),
    ("PT ABM INVESTAMA", "CL26-00183", True, "REFERRAL", "b-amber", "Emilia Karina", "628110000940", "-", "-", "05 Sep 2026"),
    ("TIM SUPPORT GILPY", "CL26-00182", False, "INBOUND", "b-blue", "Wahyu Sari", "628520000377", "tsgilpy@example.com", "-", "03 Sep 2026"),
    ("YCAB FOUNDATION", "CL26-00181", True, "OUTBOUND", "b-purple", "Gabriella Y.", "628990000877", "gabriella@example.org", "1 project", "01 Sep 2026"),
    ("MOP BEAUTY", "CL26-00180", True, "INBOUND", "b-blue", "Fanny Julia", "628180000746", "fanny@example.id", "-", "01 Sep 2026"),
    ("DEOXIDE OFFICIAL", "CL26-00179", True, "INBOUND", "b-blue", "Faathir M.", "628510000903", "faathir@example.com", "2 project", "28 Agu 2026"),
]


def client_table():
    rows = []
    for brand, cid, ok, src, scls, pic, hp, em, proj, tgl in CLIENT_ROWS:
        badge = '<span class="badge b-green">COMPLETED</span>' if ok else '<span class="badge b-amber">INCOMPLETE</span>'
        act = '<span class="chev">&rsaquo;</span>' if ok else '<span class="btn-fill">Lengkapi &rsaquo;</span>'
        tr = '<tr>' if ok else '<tr class="rowbar">'
        emrow = f'<div class="sml">{em}<span class="copy">&#128203;</span></div>' if em != "-" else '<div class="sml">-</div>'
        rows.append(f"""{tr}
<td><span class="ttl">{brand}</span><div class="sml">{cid}</div></td>
<td>{badge}</td><td><span class="badge {scls}">{src}</span></td>
<td>{pic}<div class="grn">{hp}<span class="copy">&#128203;</span></div>{emrow}</td>
<td>{proj}</td><td>{tgl}</td><td>{act}</td></tr>""")
    return f"""<div class="tbl-wrap"><table>
<thead><tr><th>Brand &amp; Entity</th><th>Completed</th><th>Source</th><th>Contact</th><th>Project</th><th>Dibuat</th><th>Action</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table>
<div class="pager"><div>Menampilkan 1-25 dari 182 data &nbsp; <span class="pg-btn">25 / halaman</span></div>
<div>Halaman 1 / 8 <span class="pg-btn">Sebelumnya</span><span class="pg-btn">Berikutnya</span></div></div></div>"""


(OUT / "screen-client.html").write_text(
    page("Client Monitoring", "Client Monitoring", "Sales Module", "Client Monitoring",
         CLIENT_STATS + CLIENT_FILTER + client_table(), action="+ Add New Client"))

# ───────────────────────── 4. Client drawer (view) ─────────────────────────
CLIENT_DRAWER = """
<div class="scrim"></div>
<div class="drawer">
  <div class="dw-head">
    <div class="dw-top">
      <div><span class="badge b-green">COMPLETED</span><span class="dw-id">CL26-00181</span></div>
      <div class="dw-pg"><span class="ar">&lsaquo;</span>5 / 182<span class="ar">&rsaquo;</span><span class="ar">&times;</span></div>
    </div>
    <div class="dw-title">YCAB FOUNDATION</div>
    <div class="dw-sub">Yayasan Cinta Anak Bangsa</div>
    <div>
      <span class="pill p-ok">&#10003; Brand Name</span><span class="pill p-ok">&#10003; Entity Name</span>
      <span class="pill p-ok">&#10003; Head Office</span><span class="pill p-ok">&#10003; Entity Type</span>
      <span class="pill p-ok">&#10003; Client Source</span><span class="pill p-ok">&#10003; PIC (1)</span>
    </div>
    <div class="dw-actions">
      <div class="da">Buat Project</div><div class="da red">Hapus</div>
      <div class="da" style="margin-left:auto">Edit Info</div>
    </div>
  </div>
  <div class="dw-body">
    <div class="sect">Ringkasan</div>
    <div class="mini-grid">
      <div class="mini"><div class="k">Total Project</div><div class="v">1 <small>+1 draft</small></div></div>
      <div class="mini"><div class="k">GDV Value</div><div class="v">Rp 412.500.000</div></div>
      <div class="mini"><div class="k">Service Revenue</div><div class="v">Rp 38.750.000</div></div>
    </div>
    <div class="hr"></div>
    <div class="sect">Client Information</div>
    <div class="kv">
      <div><div class="k">Head Office</div><div class="v">Kota Jakarta Pusat</div></div>
      <div><div class="k">Industry</div><div class="v">NGO &amp; Non-Profit Organization</div></div>
      <div><div class="k">Client Source</div><div class="v">Outbound</div></div>
      <div><div class="k">Entity Type</div><div class="v">Institusi Sosial</div></div>
      <div style="grid-column:span 2"><div class="k">Website</div><div class="v"><a>https://www.example-foundation.org</a></div></div>
      <div style="grid-column:span 2"><div class="k">Riwayat</div><div class="v" style="color:#64748b">Dibuat oleh <b style="color:#1e293b">Shienny Anggraini</b> pada 01 Sep 2026</div></div>
    </div>
    <div class="hr"></div>
    <div class="sect">PIC Client</div>
    <div class="piccard">
      <div class="tag">PIC UTAMA</div>
      <div class="picrow">
        <div class="av" style="background:#d97706">GY</div>
        <div><div class="nm">Gabriella Yuniton</div><div class="rl">Partnership Executive</div>
          <div class="ct">gabriella@example.org<span class="copy">&#128203;</span></div>
          <div class="ct">628990000877<span class="copy">&#128203;</span></div></div>
      </div>
      <div class="picbtns"><span class="pb">Edit</span><span class="pb wa">WhatsApp</span><span class="pb">Hapus</span></div>
    </div>
    <div class="hr"></div>
    <div class="sect">Other Notes</div>
    <div style="font-size:11.5px;color:#64748b">Belum ada catatan.</div>
  </div>
</div>"""

(OUT / "screen-client-drawer.html").write_text(
    page("Client Drawer", "Client Monitoring", "Sales Module", "Client Monitoring",
         CLIENT_STATS + CLIENT_FILTER + client_table(), action="+ Add New Client", drawer=CLIENT_DRAWER))

# ───────────────────────── 5. Client drawer (edit / Lengkapi) ─────────────────────────
CLIENT_EDIT = """
<div class="scrim"></div>
<div class="drawer">
  <div class="dw-head">
    <div class="dw-top">
      <div><span class="badge b-amber">INCOMPLETE</span><span class="dw-id">CL26-00184</span></div>
      <div class="dw-pg"><span class="ar">&lsaquo;</span>2 / 182<span class="ar">&rsaquo;</span><span class="ar">&times;</span></div>
    </div>
    <div class="dw-title">GWK CULTURAL PARK</div>
    <div class="dw-sub">Entity Name belum diisi</div>
    <div>
      <span class="pill p-ok">&#10003; Brand Name</span><span class="pill p-no">&#9675; Entity Name</span>
      <span class="pill p-no">&#9675; Head Office</span><span class="pill p-ok">&#10003; Entity Type</span>
      <span class="pill p-ok">&#10003; Client Source</span><span class="pill p-ok">&#10003; PIC (1)</span>
    </div>
    <div class="dw-actions">
      <div class="da">Buat Project</div><div class="da red">Hapus</div>
      <div class="da" style="margin-left:auto">&times; Tutup</div>
    </div>
  </div>
  <div class="dw-body">
    <div class="sect">Ringkasan</div>
    <div class="mini-grid">
      <div class="mini"><div class="k">Total Project</div><div class="v">0</div></div>
      <div class="mini"><div class="k">GDV Value</div><div class="v">&ndash;</div></div>
      <div class="mini"><div class="k">Service Revenue</div><div class="v">&ndash;</div></div>
    </div>
    <div class="hr"></div>
    <div class="sect">Client Information</div>
    <div class="frm-grid">
      <div><span class="f-lbl">Brand Name</span><div class="f-in">GWK CULTURAL PARK</div></div>
      <div><span class="f-lbl">Entity Name</span><div class="f-in empty">Belum diisi</div></div>
      <div><span class="f-lbl">Head Office</span><div class="f-in empty">Belum dipilih &nbsp;&#9662;</div></div>
      <div><span class="f-lbl">Industry</span><div class="f-in empty">Belum dipilih &nbsp;&#9662;</div></div>
      <div><span class="f-lbl">Entity Type</span><div class="f-in">Perusahaan &nbsp;&#9662;</div></div>
      <div><span class="f-lbl">Client Source</span><div class="f-in">Inbound &nbsp;&#9662;</div></div>
    </div>
    <div style="margin-top:10px"><span class="f-lbl">Website</span><div class="f-in empty">https://</div></div>
    <div style="margin-top:10px"><span class="f-lbl">Other Notes</span>
      <div class="f-in empty f-ta">Belum ada catatan &ndash; tulis di sini kalau ada</div></div>
    <div class="savebar"><span class="btn-ghost">Batal</span><span class="btn-dark">Save</span></div>
  </div>
</div>"""

(OUT / "screen-client-edit.html").write_text(
    page("Client Edit", "Client Monitoring", "Sales Module", "Client Monitoring",
         CLIENT_STATS + CLIENT_FILTER + client_table(), action="+ Add New Client", drawer=CLIENT_EDIT))

print("screens written")
