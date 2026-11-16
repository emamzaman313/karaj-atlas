#!/usr/bin/env python3
"""Download an OSM study-area extract from Overpass and export GeoJSON.

This uses an explicitly APPROXIMATE study bbox (not an official Karaj boundary).
For large/production extracts prefer Geofabrik PBF + osmium clipping.
Usage: python scripts/fetch_osm_karaj.py [output.geojson]
"""
from __future__ import annotations
import argparse, json, sys, time, urllib.parse, urllib.request
from pathlib import Path

# Approximate bbox covering the Karaj urban study area; not an administrative polygon.
SOUTH, WEST, NORTH, EAST = 35.70, 50.88, 35.98, 51.12
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

def query_text(bbox=(SOUTH,WEST,NORTH,EAST)):
    south,west,north,east=bbox
    bbox=f"{south},{west},{north},{east}"
    return f"""[out:json][timeout:180];
(
  way[building]({bbox});
  way[highway]({bbox});
  node[amenity]({bbox});
  node[shop]({bbox});
  node[tourism]({bbox});
  node[historic]({bbox});
  node[leisure]({bbox});
  node[healthcare]({bbox});
  way[amenity]({bbox});
  way[shop]({bbox});
  way[tourism]({bbox});
  way[historic]({bbox});
  way[leisure]({bbox});
  way[healthcare]({bbox});
);
out body geom;"""

def request_overpass(bbox=(SOUTH,WEST,NORTH,EAST)):
    body=query_text(bbox).encode()
    for endpoint in ENDPOINTS:
        try:
            req=urllib.request.Request(endpoint,data=body,headers={
                "User-Agent":"KarajAtlas/0.1 (open data research)",
                "Content-Type":"application/x-www-form-urlencoded"
            })
            with urllib.request.urlopen(req,timeout=240) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            print(f"Overpass endpoint failed: {endpoint}: {exc}",file=sys.stderr)
            time.sleep(2)
    raise RuntimeError("All Overpass endpoints failed; retry later or use Geofabrik PBF.")

def coord(n): return [n["lon"],n["lat"]]
def feature(el):
    tags=el.get("tags",{})
    props={**tags,"osm_type":el["type"],"osm_id":el["id"],"source":"OpenStreetMap","source_method":"Overpass API"}
    if el["type"]=="node":
        return {"type":"Feature","id":f"node/{el['id']}","properties":props,"geometry":{"type":"Point","coordinates":coord(el)}}
    geom=el.get("geometry") or []
    points=[coord(n) for n in geom if "lon" in n and "lat" in n]
    if len(points)<2:return None
    is_area=("building" in tags or tags.get("area")=="yes" or tags.get("landuse") or tags.get("amenity") in {"school","hospital","place_of_worship"})
    if is_area and len(points)>=4 and points[0]==points[-1]:
        return {"type":"Feature","id":f"way/{el['id']}","properties":props,"geometry":{"type":"Polygon","coordinates":[points]}}
    return {"type":"Feature","id":f"way/{el['id']}","properties":props,"geometry":{"type":"LineString","coordinates":points}}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',nargs='?',default='public/data/karaj-osm.geojson')
    parser.add_argument('--bbox',help='SOUTH,WEST,NORTH,EAST')
    args=parser.parse_args()
    bbox=(SOUTH,WEST,NORTH,EAST)
    if args.bbox:
        bbox=tuple(float(v) for v in args.bbox.split(','))
        if len(bbox)!=4 or not (-90<=bbox[0]<bbox[2]<=90 and -180<=bbox[1]<bbox[3]<=180): raise SystemExit('Invalid bbox')
    south,west,north,east=bbox
    output=Path(args.output)
    output.parent.mkdir(parents=True,exist_ok=True)
    payload=request_overpass(bbox)
    feats=[]
    for el in payload.get("elements",[]):
        f=feature(el)
        if f:feats.append(f)
    result={"type":"FeatureCollection","name":"Karaj approximate OSM study bbox","metadata":{
      "source":"OpenStreetMap contributors","license":"ODbL 1.0",
      "retrieved_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
      "bbox":[west,south,east,north],
      "boundary_note":"Approximate rectangular study area only; NOT official city boundary.",
      "query":"scripts/fetch_osm_karaj.py"
    },"features":feats}
    output.write_text(json.dumps(result,ensure_ascii=False),encoding="utf-8")
    print(f"Wrote {len(feats)} features to {output}")
    print("Attribution: © OpenStreetMap contributors | ODbL 1.0")
    print("Warning: bbox is approximate; verify/crop against authoritative study boundary.")
if __name__=="__main__":main()
