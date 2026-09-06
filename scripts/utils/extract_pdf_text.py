#!/usr/bin/env python3
"""
scripts/utils/extract_pdf_text.py
Static CLI utility to extract text from PDF files.
Replaces ad-hoc inline python (-c) invocations to prevent Antigravity permission modals.

Usage:
  python3 scripts/utils/extract_pdf_text.py --file "/path/to/doc.pdf" [--max-pages 5] [--output-file scratch/out.txt]
"""

import os
import sys
import json
import argparse
from pathlib import Path

# Ensure workspace venv site-packages are loaded
for candidate_site in [
    Path(__file__).resolve().parent.parent.parent / "scratch" / "my_venv" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages",
    Path(__file__).resolve().parent.parent.parent / "venv" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages",
    Path("/Users/daniel/Documents/AGY/the_system/scratch/my_venv/lib/python3.14/site-packages"),
    Path("/Users/daniel/Developer/the_system/venv/lib/python3.14/site-packages"),
]:
    if candidate_site.exists() and str(candidate_site) not in sys.path:
        sys.path.insert(1, str(candidate_site))

def main():
    parser = argparse.ArgumentParser(description="Extract text from PDF documents cleanly.")
    parser.add_argument("--file", required=True, help="Absolute or relative path to PDF file")
    parser.add_argument("--max-pages", type=int, default=5, help="Maximum number of pages to extract (default: 5)")
    parser.add_argument("--output-file", help="Optional path to write extracted text to")
    parser.add_argument("--json", action="store_true", help="Output result as JSON")
    args = parser.parse_args()

    pdf_path = Path(args.file).resolve()
    if not pdf_path.exists():
        err_msg = f"Error: PDF file does not exist: {pdf_path}"
        if args.json:
            print(json.dumps({"status": "ERROR", "message": err_msg}))
        else:
            print(err_msg, file=sys.stderr)
        sys.exit(1)

    text_parts = []
    total_pages = 0

    try:
        import pypdf
        reader = pypdf.PdfReader(str(pdf_path))
        total_pages = len(reader.pages)
        pages_to_read = min(total_pages, args.max_pages)
        for i in range(pages_to_read):
            page_text = reader.pages[i].extract_text() or ""
            text_parts.append(f"--- PAGE {i + 1} ---\n{page_text.strip()}")
    except ImportError:
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(pdf_path))
            total_pages = len(reader.pages)
            pages_to_read = min(total_pages, args.max_pages)
            for i in range(pages_to_read):
                page_text = reader.pages[i].extract_text() or ""
                text_parts.append(f"--- PAGE {i + 1} ---\n{page_text.strip()}")
        except Exception as e:
            err_msg = f"Error: pypdf not available or failed: {e}"
            if args.json:
                print(json.dumps({"status": "ERROR", "message": err_msg}))
            else:
                print(err_msg, file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        err_msg = f"Error reading PDF: {e}"
        if args.json:
            print(json.dumps({"status": "ERROR", "message": err_msg}))
        else:
            print(err_msg, file=sys.stderr)
        sys.exit(1)

    extracted = "\n\n".join(text_parts)

    if args.output_file:
        out_p = Path(args.output_file).resolve()
        out_p.parent.mkdir(parents=True, exist_ok=True)
        out_p.write_text(extracted, encoding="utf-8")
        print(f"Extracted {len(text_parts)} pages ({len(extracted)} chars) -> {out_p}")
        sys.exit(0)

    if args.json:
        print(json.dumps({
            "status": "SUCCESS",
            "file": str(pdf_path),
            "total_pages": total_pages,
            "pages_read": len(text_parts),
            "text": extracted
        }, indent=2))
    else:
        print(extracted)

if __name__ == '__main__':
    main()
