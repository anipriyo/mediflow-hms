"""Update the table of contents and export the report to PDF with LibreOffice.

Usage: python3 docs/report/finalize.py
Reads  docs/report/build/MediFlow_HMS_Group11_Report.docx
Writes docs/report/build/MediFlow_HMS_Group11_Report.pdf  (and refreshes the DOCX so the TOC is filled in)

Runs a small LibreOffice Basic macro inside a throw-away LibreOffice profile, so it needs only `soffice`
(no Python uno module). Install LibreOffice with "brew install --cask libreoffice" on macOS or the
libreoffice-writer package on Linux.
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
SRC = HERE / 'build' / 'MediFlow_HMS_Group11_Report.docx'
PDF = SRC.with_suffix('.pdf')
MAC_SOFFICE = '/Applications/LibreOffice.app/Contents/MacOS/soffice'

# Update every index (table of contents) twice so page numbers settle after the TOC grows,
# then save the PDF and the DOCX with the filled-in TOC.
MACRO = '''
Sub Finalize
  Dim loadArgs(0) As New com.sun.star.beans.PropertyValue
  loadArgs(0).Name = "Hidden"
  loadArgs(0).Value = True
  doc = StarDesktop.loadComponentFromURL(ConvertToURL(Environ("REPORT_DOCX")), "_blank", 0, loadArgs())
  For pass = 1 To 2
    indexes = doc.getDocumentIndexes()
    For i = 0 To indexes.getCount() - 1
      indexes.getByIndex(i).update()
    Next i
    doc.refresh()
  Next pass
  Dim pdfArgs(0) As New com.sun.star.beans.PropertyValue
  pdfArgs(0).Name = "FilterName"
  pdfArgs(0).Value = "writer_pdf_Export"
  doc.storeToURL(ConvertToURL(Environ("REPORT_PDF")), pdfArgs())
  Dim docxArgs(1) As New com.sun.star.beans.PropertyValue
  docxArgs(0).Name = "FilterName"
  docxArgs(0).Value = "MS Word 2007 XML"
  docxArgs(1).Name = "Overwrite"
  docxArgs(1).Value = True
  doc.storeToURL(ConvertToURL(Environ("REPORT_DOCX")), docxArgs())
  doc.close(True)
  StarDesktop.terminate()
End Sub
'''

MODULE_XML = '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">
<script:module xmlns:script="http://openoffice.org/2000/script" script:name="Module1" script:language="StarBasic">{code}</script:module>
'''


FONT_SUBSTITUTION = (
    '<item oor:path="/org.openoffice.Office.Common/Font/Substitution"><prop oor:name="Replacement" oor:op="fuse"><value>true</value></prop></item>'
    '<item oor:path="/org.openoffice.Office.Common/Font/Substitution/FontPairs"><node oor:name="_0" oor:op="replace">'
    '<prop oor:name="Always" oor:op="fuse"><value>true</value></prop>'
    '<prop oor:name="OnScreenOnly" oor:op="fuse"><value>false</value></prop>'
    '<prop oor:name="ReplaceFont" oor:op="fuse"><value>Consolas</value></prop>'
    '<prop oor:name="SubstituteFont" oor:op="fuse"><value>DejaVu Sans Mono</value></prop>'
    '</node></item>\n'
)


def find_soffice():
    found = shutil.which('soffice') or shutil.which('libreoffice')
    if found:
        return found
    if os.path.exists(MAC_SOFFICE):
        return MAC_SOFFICE
    sys.exit('LibreOffice is required. On macOS run "brew install --cask libreoffice".')


def main():
    if not SRC.exists():
        sys.exit(f'{SRC} not found. Run "node docs/report/build-report.mjs" first.')
    soffice = find_soffice()
    profile = Path(tempfile.mkdtemp(prefix='report-lo-'))
    base = [soffice, '--headless', '--invisible', '--nologo', '--norestore', f'-env:UserInstallation={profile.as_uri()}']
    try:
        # 1. Create the profile, 2. put the macro into its Standard library, 3. run it
        subprocess.run([*base, '--terminate_after_init'], check=True, timeout=180, capture_output=True)
        module = profile / 'user' / 'basic' / 'Standard' / 'Module1.xba'
        if not module.exists():
            sys.exit(f'LibreOffice did not create {module}')
        module.write_text(MODULE_XML.format(code=escape(MACRO)), encoding='utf-8')
        # Render Consolas (code font, not on macOS) with LibreOffice's bundled DejaVu Sans Mono
        registry = profile / 'user' / 'registrymodifications.xcu'
        registry.write_text(registry.read_text(encoding='utf-8').replace('</oor:items>', FONT_SUBSTITUTION + '</oor:items>'), encoding='utf-8')
        before = PDF.stat().st_mtime if PDF.exists() else 0
        env = {**os.environ, 'REPORT_DOCX': str(SRC), 'REPORT_PDF': str(PDF)}
        subprocess.run([*base, 'macro:///Standard.Module1.Finalize'], check=True, timeout=600, env=env, capture_output=True)
        if not PDF.exists() or PDF.stat().st_mtime <= before:
            sys.exit('LibreOffice finished but did not write the PDF')
        print(f'[finalize] wrote {PDF}')
        print(f'[finalize] updated {SRC}')
    finally:
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == '__main__':
    main()
