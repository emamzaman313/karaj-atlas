#!/usr/bin/env python3
"""Prepare height-aware GeoJSON properties for MapLibre 3D extrusion.

No height is fabricated as verified: OSM height wins, building:levels is an
explicit floor-based estimate, otherwise height_source=unknown and a modest
visual placeholder is marked as fallback only.
"""
import json,sys
from pathlib import Path

def number(v):
    if v is None:return None
    s=str(v).strip().lower().replace("meters","m").replace("meter","m")
    try:
        if s.endswith("m"):return float(s[:-1].strip())
        if s.endswith("ft"):return float(s[:-2].strip())*0.3048
        return float(s)
    except ValueError:return None

def enrich(feature):
    p=feature.setdefault("properties",{})
    # OSM uses building=no as an explicit negative tag; do not extrude it.
    building=p.get("building")
    if not building or str(building).strip().lower()=="no":return feature
    h=number(p.get("height") or p.get("building:height"))
    if h and 1<h<300:
        p["render_height_m"]=h;p["height_source"]="osm_height"
    else:
        lv=number(p.get("building:levels"))
        if lv and 0<lv<100:
            p["render_height_m"]=round(lv*3.0,1);p["height_source"]="estimated_from_levels_3m"
        else:
            p["render_height_m"]=9.0;p["height_source"]="visual_fallback_not_verified"
    p["render_base_m"]=number(p.get("min_height") or p.get("building:min_height")) or 0
    return feature

def main():
    src=Path(sys.argv[1] if len(sys.argv)>1 else "public/data/karaj-osm.geojson")
    dst=Path(sys.argv[2] if len(sys.argv)>2 else "public/data/karaj-3d.geojson")
    data=json.loads(src.read_text(encoding="utf-8"))
    if data.get("type")!="FeatureCollection":raise SystemExit("Expected GeoJSON FeatureCollection")
    data["features"]=[enrich(f) for f in data["features"]]
    data.setdefault("metadata",{})["3d_height_policy"]="OSM height -> levels*3m estimate -> 9m visual fallback; source label stored"
    dst.parent.mkdir(parents=True,exist_ok=True);dst.write_text(json.dumps(data,ensure_ascii=False),encoding="utf-8")
    buildings=[f for f in data["features"] if f.get("properties",{}).get("building")]
    print(f"Prepared {len(buildings)} building features -> {dst}")
    for key in ("osm_height","estimated_from_levels_3m","visual_fallback_not_verified"):
        print(key,sum(f["properties"].get("height_source")==key for f in buildings))
if __name__=="__main__":main()
