#!/usr/bin/env python3
"""Validate a GeoJSON FeatureCollection and report basic atlas coverage.

Usage: python scripts/validate_geojson.py input.geojson [report.json]
No third-party packages required. This is a structural check, not a survey
or proof that the input is geographically complete/accurate.
"""
from __future__ import annotations
import json, sys
from collections import Counter
from pathlib import Path

def walk_coords(value):
    if not isinstance(value, list): return
    if len(value) >= 2 and all(isinstance(x,(int,float)) for x in value[:2]):
        yield value
    else:
        for child in value: yield from walk_coords(child)

def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: validate_geojson.py input.geojson [report.json]")
    src=Path(sys.argv[1])
    data=json.loads(src.read_text(encoding="utf-8"))
    if data.get("type")!="FeatureCollection" or not isinstance(data.get("features"),list):
        raise SystemExit("Input must be a GeoJSON FeatureCollection")
    counts=Counter(); geometry=Counter(); issues=[]; building_heights=Counter()
    for idx,feature in enumerate(data["features"]):
        if feature.get("type")!="Feature":
            issues.append({"feature":idx,"issue":"not a Feature"});continue
        props=feature.get("properties") or {}; geom=feature.get("geometry") or {}
        tags=props.get("tags") if isinstance(props.get("tags"),dict) else props
        geometry[geom.get("type","missing")]+=1
        if not geom.get("coordinates"):
            issues.append({"feature":idx,"issue":"missing geometry"});continue
        coords=list(walk_coords(geom["coordinates"]))
        if not coords: issues.append({"feature":idx,"issue":"empty coordinates"})
        for c in coords:
            lon,lat=c[0],c[1]
            if not (-180<=lon<=180 and -90<=lat<=90):
                issues.append({"feature":idx,"issue":"coordinate outside WGS84 range","coordinate":c[:2]})
        if tags.get("building") or tags.get("building:part"):
            counts["buildings"]+=1
            h=tags.get("height") or tags.get("building:height")
            levels=tags.get("building:levels")
            if h is not None: building_heights["tagged_height"]+=1
            elif levels is not None: building_heights["levels_only"]+=1
            else: building_heights["no_height"]+=1
        if tags.get("highway"): counts["roads"]+=1
        if any(tags.get(k) for k in ("amenity","shop","tourism","leisure","historic","office","healthcare")): counts["poi_candidates"]+=1
        if tags.get("name") or tags.get("name:fa"): counts["named"]+=1
    report={
      "input":str(src),"feature_count":len(data["features"]),
      "geometry_types":dict(geometry),"counts":dict(counts),
      "building_height_coverage":dict(building_heights),
      "issue_count":len(issues),"issues_sample":issues[:100],
      "limitations":"Structural QA only. Does not verify Karaj boundary, completeness, source license, or positional accuracy."
    }
    text=json.dumps(report,ensure_ascii=False,indent=2)
    if len(sys.argv)>2: Path(sys.argv[2]).write_text(text+"\n",encoding="utf-8")
    print(text)
if __name__=="__main__": main()
