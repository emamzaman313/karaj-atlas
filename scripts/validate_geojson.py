#!/usr/bin/env python3
"""GeoJSON structural QA with ring closure, coordinate and geometry checks."""
from __future__ import annotations
import json, sys, math
from collections import Counter
from pathlib import Path

def walk_coords(value):
    if not isinstance(value,list): return
    if len(value)>=2 and all(isinstance(x,(int,float)) and not isinstance(x,bool) for x in value[:2]):
        yield value
    else:
        for child in value: yield from walk_coords(child)

def valid_position(p):
    return isinstance(p,list) and len(p)>=2 and all(isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) for v in p[:2]) and -180<=p[0]<=180 and -90<=p[1]<=90

def ring_issues(ring):
    if not isinstance(ring,list) or len(ring)<4: return ["polygon ring has fewer than 4 positions"]
    return [] if ring[0]==ring[-1] else ["polygon ring is not closed"]

def geometry_issues(geom):
    if not isinstance(geom,dict): return ["geometry is missing"]
    typ=geom.get("type"); c=geom.get("coordinates")
    if typ=="GeometryCollection":
        gs=geom.get("geometries")
        if not isinstance(gs,list): return ["GeometryCollection geometries missing"]
        return [f"GeometryCollection[{i}]: {msg}" for i,g in enumerate(gs) for msg in geometry_issues(g)]
    pts=list(walk_coords(c))
    if not pts: return ["empty coordinates"]
    errors=[f"invalid WGS84 position: {p[:2]}" for p in pts if not valid_position(p)]
    if typ=="Point" and len(pts)!=1: errors.append("Point must contain exactly one position")
    if typ=="LineString" and len(pts)<2: errors.append("LineString requires at least 2 positions")
    if typ=="Polygon":
        if not isinstance(c,list) or not c: errors.append("Polygon rings missing")
        else:
            errors.extend(ring_issues(c[0]))
            for ring in c[1:]: errors.extend(ring_issues(ring))
    if typ=="MultiPolygon" and isinstance(c,list):
        for poly in c:
            if not poly: errors.append("MultiPolygon polygon has no rings"); continue
            errors.extend(ring_issues(poly[0]))
            for ring in poly[1:]: errors.extend(ring_issues(ring))
    if typ not in ("Point","MultiPoint","LineString","MultiLineString","Polygon","MultiPolygon","GeometryCollection"): errors.append(f"unsupported geometry type: {typ}")
    return errors

def main():
    if len(sys.argv)<2: raise SystemExit("Usage: validate_geojson.py input.geojson [report.json]")
    src=Path(sys.argv[1]); data=json.loads(src.read_text(encoding="utf-8"))
    if data.get("type")!="FeatureCollection" or not isinstance(data.get("features"),list): raise SystemExit("Input must be a GeoJSON FeatureCollection")
    counts=Counter(); geometry=Counter(); issues=[]; heights=Counter()
    for idx,f in enumerate(data["features"]):
        if not isinstance(f,dict) or f.get("type")!="Feature": issues.append({"feature":idx,"issue":"not a Feature"}); continue
        p=f.get("properties") or {}; g=f.get("geometry"); typ=g.get("type","missing") if isinstance(g,dict) else "missing"; geometry[typ]+=1
        for issue in geometry_issues(g): issues.append({"feature":idx,"issue":issue})
        tags=p.get("tags") if isinstance(p.get("tags"),dict) else p
        if tags.get("building") or tags.get("building:part"):
            counts["buildings"]+=1
            if tags.get("height") or tags.get("building:height"): heights["tagged_height"]+=1
            elif tags.get("building:levels"): heights["levels_only"]+=1
            else: heights["no_height"]+=1
        if tags.get("highway"): counts["roads"]+=1
        if any(tags.get(k) for k in ("amenity","shop","tourism","leisure","historic","office","healthcare")): counts["poi_candidates"]+=1
        if tags.get("name") or tags.get("name:fa"): counts["named"]+=1
    report={"input":str(src),"feature_count":len(data["features"]),"geometry_types":dict(geometry),"counts":dict(counts),"building_height_coverage":dict(heights),"issue_count":len(issues),"issues_sample":issues[:200],"limitations":"Structural QA only; does not verify boundary, completeness, license or survey accuracy."}
    rendered=json.dumps(report,ensure_ascii=False,indent=2)
    if len(sys.argv)>2: Path(sys.argv[2]).write_text(rendered+"\n",encoding="utf-8")
    print(rendered)
    if issues: raise SystemExit(2)
if __name__=="__main__": main()
