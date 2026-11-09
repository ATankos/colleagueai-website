#!/usr/bin/env python3
"""Build the customer bundle CAI-L4-CI-001_1.0.3.2.zip from bundle-src/ and the managed solution zip.

  python3 -I build-bundle.py <managed-solution-zip> <out-dir> [<bundle-src-dir>]

Steps: copy texts, render START-HERE.pdf and INSTALL.pdf (pandoc -> HTML -> wkhtmltopdf), compute sizes and
SHA-256 of every file, fill MANIFEST.json, write SHA256SUMS.txt, zip the folder, verify the zip by re-reading it.
"""
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

here = Path(__file__).resolve().parent
src = Path(sys.argv[3]) if len(sys.argv) > 3 else here / 'bundle-src'
managed = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
NAME = 'CAI-L4-CI-001_1.0.3.2'
folder = out / NAME
if folder.exists():
    shutil.rmtree(folder)
folder.mkdir(parents=True)

assert managed.name == 'CAIContractIntelligence_1_0_3_2_managed.zip', managed.name
with zipfile.ZipFile(managed) as z:
    assert z.testzip() is None, 'managed zip is corrupt'
    names = z.namelist()
    assert 'solution.xml' in names and 'customizations.xml' in names

for f in ['START-HERE.md', 'INSTALL.md', 'DOSSIER.pdf', 'LICENSE.txt', 'deploymentSettings.template.json', 'check-cai-install-readiness.mjs']:
    shutil.copy(src / f, folder / f)
shutil.copy(managed, folder / managed.name)

CSS = ("body{font-family:Segoe UI,Arial,sans-serif;font-size:11pt;line-height:1.4;margin:0 6mm}"
       "table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #999;padding:4px 6px;vertical-align:top;font-size:10pt}"
       "th{background:#eee}code{font-family:Consolas,monospace;font-size:10pt}pre{background:#f4f4f4;padding:6px;white-space:pre-wrap}"
       "blockquote{border-left:3px solid #c00;margin:8px 0;padding:4px 10px;background:#fff4f4}h1{font-size:18pt}h2{font-size:14pt;margin-top:18px}h3{font-size:12pt}")


def pdf(md_name, pdf_name):
    html = folder / (md_name + '.html')
    css = folder / 'style.css'
    css.write_text(CSS, encoding='utf-8')
    subprocess.run(['pandoc', str(folder / md_name), '-f', 'gfm', '-t', 'html5', '-s', '--metadata', f'pagetitle={NAME}',
                    '-c', 'style.css', '-o', str(html)], check=True)
    subprocess.run(['wkhtmltopdf', '--quiet', '--enable-local-file-access', '-s', 'A4', '-B', '15', '-T', '15', '-L', '12', '-R', '12',
                    str(html), str(folder / pdf_name)], check=True)
    html.unlink()
    css.unlink()


pdf('START-HERE.md', 'START-HERE.pdf')
pdf('INSTALL.md', 'INSTALL.pdf')


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


manifest = json.loads((src / 'MANIFEST.template.json').read_text(encoding='utf-8'))
manifest['solution']['sha256'] = sha(folder / managed.name)
for entry in manifest['files']:
    p = folder / entry['name']
    entry['bytes'] = p.stat().st_size
    entry['sha256'] = sha(p)
(folder / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

order = [e['name'] for e in manifest['files']] + ['MANIFEST.json']
(folder / 'SHA256SUMS.txt').write_text(''.join(f'{sha(folder / n)}  {n}\n' for n in order), encoding='utf-8')

extra = sorted(p.name for p in folder.iterdir())
assert sorted(order + ['SHA256SUMS.txt']) == extra, (order, extra)

bundle = out / f'{NAME}.zip'
if bundle.exists():
    bundle.unlink()
with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(folder.iterdir()):
        z.write(p, f'{NAME}/{p.name}')
with zipfile.ZipFile(bundle) as z:
    assert z.testzip() is None
    listed = sorted(n.split('/', 1)[1] for n in z.namelist())
    assert listed == extra, listed
    for n in order:
        assert hashlib.sha256(z.read(f'{NAME}/{n}')).hexdigest() == sha(folder / n)
print('bundle', bundle, bundle.stat().st_size, 'bytes, sha256', sha(bundle))
print('managed', manifest['solution']['sha256'])
