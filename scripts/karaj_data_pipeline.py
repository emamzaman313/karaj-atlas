#!/usr/bin/env python3
"""Karaj Atlas data pipeline: repeatable OSM extraction, provenance and QA.

The configured rectangle is a study extent, NOT an official administrative boundary.
For production boundary clipping, supply a verified polygon and use a GIS clip stage.
"""
from __future__ import annotations
import argparse, json, time, urllib.request, urllib.error, urllib.parse, hashlib
from pathlib import Path
from collections import Counter

DEFAULT_BBOX=(35.70,50.88,35.98,51.12)
ENDPOINTS=("https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter")

def query(bbox:tuple[float,float,float,float])->str:
 s,w,n,e=bbox; box=f"{s},{w},{n},{e}"
 return f"""[out:json][timeout:240];
(
 way[building]({box});
 way[highway]({box});
 way[landuse]({box});
 way[natural]({box});
 way[waterway]({box});
 way[water]({box});
 way[leisure]({box});
 way[amenity]({box});
 way[shop]({box});
 way[tourism]({box});
 way[historic]({box});
 way[healthcare]({box});
 way[boundary]({box});
 node[amenity]({box});
 node[shop]({box});
 node[tourism]({box});
 node[historic]({box});
 node[leisure]({box});
 node[healthcare]({box});
 node[public_transport]({box});
 node[place]({box});
);
out body geom;"""

def fetch(bbox):
 payload=urllib.parse.urlencode({"data":query(bbox)}).encode()
 errors=[]
 for endpoint in ENDPOINTS:
  for attempt in range(3):
   try:
    req=urllib.request.Request(endpoint,data=payload,headers={"User-Agent":"KarajAtlas/0.3 (OSM open-data pipeline)","Content-Type":"application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req,timeout=300) as response:
     body=response.read()
     parsed=json.loads(body)
     if not isinstance(parsed,dict) or not isinstance(parsed.get("elements"),list):
      raise ValueError("Overpass returned an unexpected JSON payload")
     return parsed
   except Exception as exc:
    errors.append(f"{endpoint} try {attempt+1}: {exc}")
    time.sleep(2*(attempt+1))
 raise RuntimeError("\\n".join(errors))

def to_feature(el):
 tags=el.get("tags",{}); p={**tags,"osm_type":el["type"],"osm_id":el["id"],"source":"OpenStreetMap","source_method":"Overpass API"}
 if el["type"]=="node":
  if "lon" not in el or "lat" not in el:return None
  geom={"type":"Point","coordinates":[el["lon"],el["lat"]]}
 else:
  pts=[[x["lon"],x["lat"]] for x in el.get("geometry",[]) if "lon" in x and "lat" in x]
  if len(pts)<2:return None
  area=bool(tags.get("building") or tags.get("landuse") or tags.get("natural") in ("water","wood","scrub","grassland") or tags.get("leisure") in ("park","garden","pitch") or tags.get("amenity") in ("school","hospital","place_of_worship","parking") or tags.get("area")=="yes")
  if area and len(pts)>=4 and pts[0]==pts[-1]:geom={"type":"Polygon","coordinates":[pts]}
  else:geom={"type":"LineString","coordinates":pts}
 return {"type":"Feature","id":f"{el['type']}/{el['id']}","properties":p,"geometry":geom}

def main():
 ap=argparse.ArgumentParser();ap.add_argument("--bbox",default=",".join(map(str,DEFAULT_BBOX)));ap.add_argument("--output",default="public/data/karaj-osm.geojson");ap.add_argument("--report",default="public/data/karaj-data-report.json");args=ap.parse_args()
 bbox=tuple(map(float,args.bbox.split(",")))
 if len(bbox)!=4 or not(-90<=bbox[0]<bbox[2]<=90 and -180<=bbox[1]<bbox[3]<=180):raise SystemExit("bbox must be SOUTH,WEST,NORTH,EAST")
 raw=fetch(bbox);features=[];seen=set();duplicates=0
 for el in raw.get("elements",[]):
  f=to_feature(el)
  if not f:continue
  if f["id"] in seen:duplicates+=1;continue
  seen.add(f["id"]);features.append(f)
 counts=Counter()
 for f in features:
  p=f["properties"];g=f["geometry"]["type"]
  counts["geometry_"+g]+=1
  for key in ("building","highway","amenity","shop","tourism","landuse","natural","waterway","leisure","healthcare","public_transport","place","boundary"):
   if key in p:counts[key]+=1
 stamp=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
 data={"type":"FeatureCollection","name":"Karaj OSM study extent","metadata":{"source":"OpenStreetMap contributors","license":"ODbL 1.0","retrieved_at":stamp,"bbox":[bbox[1],bbox[0],bbox[3],bbox[2]],"boundary_note":"Approximate rectangular extent, NOT official Karaj boundary","query_version":"karaj-data-pipeline-v1"},"features":features}
 out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True);serialized=json.dumps(data,ensure_ascii=False,separators=(",",":"));out.write_text(serialized,encoding="utf-8")
 report={"generated_at":stamp,"source":"OpenStreetMap / Overpass","license":"ODbL 1.0","bbox_s_w_n_e":bbox,"feature_count":len(features),"duplicate_ids_removed":duplicates,"raw_element_count":len(raw.get("elements",[])),"counts":dict(counts),"geojson_bytes":len(serialized.encode()),"sha256":hashlib.sha256(serialized.encode()).hexdigest(),"limitations":["Approximate bbox, not official city boundary","OSM completeness varies by feature","way-only geometry; relation multipolygons not assembled","height values may be estimated; verify provenance"]}
 report_path=Path(args.report);report_path.parent.mkdir(parents=True,exist_ok=True)\n report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
 print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=="__main__":main()
