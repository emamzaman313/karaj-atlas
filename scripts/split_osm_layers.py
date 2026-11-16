#!/usr/bin/env python3
"""Split OSM FeatureCollection into Tippecanoe-ready vector layers.

Usage:
  python scripts/split_osm_layers.py public/data/karaj-osm.geojson --out-dir public/data/vector
  tippecanoe -o public/data/karaj.pmtiles -zg --drop-densest-as-needed \
    -L building:public/data/vector/building.geojson \
    -L transportation:public/data/vector/transportation.geojson \
    -L landuse:public/data/vector/landuse.geojson \
    -L water:public/data/vector/water.geojson \
    -L poi:public/data/vector/poi.geojson
"""
from __future__ import annotations
import argparse, json
from pathlib import Path

RULES = {
    "building": lambda p: "building" in p,
    "transportation": lambda p: "highway" in p,
    "landuse": lambda p: any(k in p for k in ("landuse", "natural", "leisure")),
    "water": lambda p: any(k in p for k in ("water", "waterway")),
    "poi": lambda p: any(k in p for k in ("amenity", "shop", "tourism", "historic", "healthcare", "public_transport", "place")),
}

def split(source: dict) -> dict[str, dict]:
    if source.get("type") != "FeatureCollection" or not isinstance(source.get("features"), list):
        raise ValueError("Input must be a GeoJSON FeatureCollection")
    result = {name: {"type":"FeatureCollection", "name":name, "features":[]} for name in RULES}
    for feature in source["features"]:
        props = feature.get("properties") or {}
        for layer, predicate in RULES.items():
            if predicate(props):
                result[layer]["features"].append(feature)
    return result

def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--out-dir",type=Path,default=Path("public/data/vector"))
    args=parser.parse_args()
    data=json.loads(args.input.read_text(encoding="utf-8"))
    layers=split(data);args.out_dir.mkdir(parents=True,exist_ok=True)
    counts={}
    for name,collection in layers.items():
        path=args.out_dir/f"{name}.geojson"
        path.write_text(json.dumps(collection,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
        counts[name]=len(collection["features"])
        print(f"{name}: {counts[name]} -> {path}")
    (args.out_dir/"layers-report.json").write_text(json.dumps({"source":str(args.input),"counts":counts},ensure_ascii=False,indent=2),encoding="utf-8")

if __name__=="__main__": main()
