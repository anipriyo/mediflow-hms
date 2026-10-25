"""Fail if the report's visible text contains an em dash, en dash, semicolon or colon.

Usage: python3 docs/report/check_text.py [file.docx ...]
Checks the body, headers, footers and document title of each DOCX (default: every docs/report/build/*.docx).
Exit code 1 lists every offending paragraph with its position, so the generator can be fixed.
"""
import glob
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT = os.path.join(HERE, 'build', 'MediFlow_HMS_Group11_Report.docx')
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
FORBIDDEN = {'—': 'em dash', '–': 'en dash', ';': 'semicolon', ':': 'colon'}


def paragraphs(docx):
    with zipfile.ZipFile(docx) as z:
        parts = [n for n in z.namelist() if re.fullmatch(r'word/(document|header\d*|footer\d*)\.xml', n)]
        for name in sorted(parts):
            root = ET.fromstring(z.read(name))
            for i, p in enumerate(root.iter(W + 'p')):
                text = ''.join(t.text or '' for t in p.iter(W + 't'))
                if text.strip():
                    yield f'{name}#{i}', text
        core = ET.fromstring(z.read('docProps/core.xml'))
        for el in core:
            if el.text and el.tag.split('}')[1] in ('title', 'subject', 'description', 'creator'):
                yield f'docProps/core.xml {el.tag.split("}")[1]}', el.text


def main():
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(HERE, 'build', '*.docx')))
    if not files:
        sys.exit('[check_text] no DOCX files to check')
    total = 0
    for docx in files:
        found = 0
        for where, text in paragraphs(docx):
            bad = sorted({name for ch, name in FORBIDDEN.items() if ch in text})
            if bad:
                found += 1
                if found <= 50:
                    print(f'{os.path.basename(docx)} {where}: {", ".join(bad)} | {text[:160]}')
        print(f'[check_text] {os.path.basename(docx)}: {"OK" if not found else f"{found} paragraphs with forbidden punctuation"}')
        total += found
    if total:
        sys.exit(1)
    print('[check_text] OK, no em dash, en dash, semicolon or colon in any document')


if __name__ == '__main__':
    main()
