"""Update the table of contents and export the report to PDF with LibreOffice (UNO).

Usage: python3 docs/report/finalize.py
Reads  docs/report/build/MediFlow_HMS_Group11_Report.docx
Writes docs/report/build/MediFlow_HMS_Group11_Report.pdf  (and refreshes the DOCX so the TOC is filled in)
"""
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'build', 'MediFlow_HMS_Group11_Report.docx')
PDF = SRC.replace('.docx', '.pdf')
DOCX_OUT = SRC  # overwrite with TOC filled in

import uno  # noqa: E402
from com.sun.star.beans import PropertyValue  # noqa: E402


def prop(name, value):
    p = PropertyValue()
    p.Name = name
    p.Value = value
    return p


def main():
    port = 2002
    office = subprocess.Popen([
        'soffice', '--headless', '--invisible', '--nologo', '--norestore', '--nodefault',
        f'--accept=socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        ctx = None
        for _ in range(60):
            try:
                ctx = resolver.resolve(f'uno:socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext')
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.5)
        if ctx is None:
            sys.exit('Could not connect to LibreOffice')
        desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
        doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(SRC), '_blank', 0, (prop('Hidden', True),))
        # Update every index (table of contents) twice so page numbers settle after the TOC grows
        for _ in range(2):
            idx = doc.getDocumentIndexes()
            for i in range(idx.getCount()):
                idx.getByIndex(i).update()
            doc.refresh()
        doc.storeToURL(uno.systemPathToFileUrl(PDF), (prop('FilterName', 'writer_pdf_Export'),))
        doc.storeToURL(uno.systemPathToFileUrl(DOCX_OUT), (prop('FilterName', 'MS Word 2007 XML'), prop('Overwrite', True)))
        doc.close(True)
        print(f'[finalize] wrote {PDF}')
        print(f'[finalize] updated {DOCX_OUT}')
    finally:
        try:
            desktop.terminate()  # noqa: F821
        except Exception:  # noqa: BLE001
            pass
        office.terminate()
        try:
            office.wait(10)
        except Exception:  # noqa: BLE001
            office.kill()


if __name__ == '__main__':
    main()
