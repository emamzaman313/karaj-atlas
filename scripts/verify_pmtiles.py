#!/usr/bin/env python3
"""Verify PMTiles v3 archive header and write a reproducible checksum report."""
from __future__ import annotations
import argparse, hashlib, json, time
from pathlib import Path

def main():
    p=argparse.ArgumentParser()
    p.add_argument("archive")
    p.add_argument("--report",default=None)
    a=p.parse_args()
    path=Path(a.archive)
    if not path.is_file(): raise SystemExit(f"Missing PMTiles archive: {path}")
    size=path.stat().st_size
    if size < 127: raise SystemExit(f"PMTiles archive too small ({size} bytes)")
    with path.open("rb") as f: header=f.read(127)
    if header[:7] != b"PMTiles": raise SystemExit("Invalid PMTiles magic header")
    version=header[7]
    if version != 3: raise SystemExit(f"Unsupported PMTiles version: {version}")
    digest=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): digest.update(chunk)
    report={"file":path.name,"bytes":size,"pmtiles_version":version,"sha256":digest.hexdigest(),"verified_at_utc":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"verification":"header+size+sha256; tile content not decoded"}
    target=Path(a.report) if a.report else path.with_suffix(".verify.json")
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False))
if __name__=="__main__": main()
