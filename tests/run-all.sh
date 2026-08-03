#!/usr/bin/env bash
# Jalankan seluruh test + pemeriksaan sintaks. Keluar dengan kode != 0 kalau
# ada yang gagal, jadi aman dipakai sebagai gerbang sebelum clasp push.
#
#   bash tests/run-all.sh
set -uo pipefail
cd "$(dirname "$0")/.."

gagal=0

echo "=============================================================="
echo " SINTAKS — file .gs"
echo "=============================================================="
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
while IFS= read -r f; do
  cp "$f" "$tmp/c.js"
  if node --check "$tmp/c.js" 2>"$tmp/err"; then
    printf '  OK    %s\n' "$f"
  else
    printf '  GAGAL %s\n' "$f"; sed 's/^/          /' "$tmp/err"; gagal=1
  fi
done < <(find src -name '*.gs' | sort)

echo
echo "=============================================================="
echo " SINTAKS — blok <script> di dalam .html"
echo "=============================================================="
# Komentar HTML dibuang dulu: kata "<script>" yang muncul di dalam komentar
# penjelas akan membuat pemindaian naif salah menganggapnya kode.
# Ekspresi template Apps Script (<?= ... ?>) diganti literal supaya bisa
# diparse Node — sintaks JS di sekitarnya tetap terperiksa sepenuhnya.
python3 - <<'PY' || gagal=1
import re, subprocess, tempfile, os, sys, glob
bad = 0
for f in sorted(glob.glob('src/**/*.html', recursive=True)):
    s = re.sub(r'<!--[\s\S]*?-->', '', open(f).read())
    for i, m in enumerate(re.finditer(r'<script\b[^>]*>([\s\S]*?)</script>', s)):
        body = re.sub(r'<\?!?=\s*[\s\S]*?\s*\?>', '__TPL__', m.group(1))
        body = re.sub(r'<\?[\s\S]*?\?>', '', body)
        if not body.strip():
            continue
        p = tempfile.mktemp(suffix='.js')
        open(p, 'w').write(body)
        r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
        os.unlink(p)
        if r.returncode:
            bad = 1
            print('  GAGAL %s blok %d' % (f, i))
            print('\n'.join('          ' + l for l in r.stderr.splitlines()[:8]))
        else:
            print('  OK    %s blok %d' % (f, i))
sys.exit(bad)
PY

echo
for t in tests/*.test.js; do
  echo "=============================================================="
  echo " $t"
  echo "=============================================================="
  node "$t" || gagal=1
  echo
done

echo "=============================================================="
if [ "$gagal" -eq 0 ]; then
  echo " SEMUA PEMERIKSAAN LOLOS"
else
  echo " ADA PEMERIKSAAN YANG GAGAL — lihat detail di atas"
fi
echo "=============================================================="
exit "$gagal"
