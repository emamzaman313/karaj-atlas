#!/usr/bin/env python3
"""QA checks for Karaj Atlas OSM GeoJSON and height-aware 3D output."""
import json,sys,math
from pathlib import Path
from collections import Counter

def main():
 p=Path(sys.argv[1] if len(sys.argv)>1 else "public/data/karaj-3d.geojson")
 d=json.loads(p.read_text(encoding="utf-8"))
 if d.get("type")!="FeatureCollection" or not isinstance(d.get("features"),list):raise SystemExit("FAIL: not a FeatureCollection")
 feats=d["features"]; counts=Counter(); heights=Counter(); bad=[]
 for i,f in enumerate(feats):
  g=f.get("geometry") or {}; props=f.get("properties") or {}; counts[g.get("type", "missing")] += 1
  if not g.get("coordinates"):bad.append((i,"empty geometry"))
  if props.get("building"):
   source=props.get("height_source","missing");heights[source]+=1
   h=props.get("render_height_m")
   if not isinstance(h,(int,float)) or not math.isfinite(h) or h<=0 or h>300:bad.append((i,"invalid render_height_m"))
   if source=="osm_height" and not (props.get("height") or props.get("building:height")):bad.append((i,"OSM height source without source tag"))
 if bad:
  print("FAIL examples:",bad[:20]);raise SystemExit(1)
 print("PASS structural QA")
 print("features:",len(feats),"geometry:",dict(counts),"buildings by height source:",dict(heights))
 print("Note: this validates structure, not positional accuracy or completeness.")
if __name__=="__main__":main()
