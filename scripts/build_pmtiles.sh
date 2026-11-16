#!/usr/bin/env bash
# Build a multi-layer PMTiles archive from the semantic GeoJSON outputs.
set -euo pipefail
OUT="${1:-public/data/karaj.pmtiles}"
DIR="${2:-public/data/vector}"
command -v tippecanoe >/dev/null || { echo "tippecanoe is required (see docs/DATA_PHASE_2.fa.md)" >&2; exit 127; }
for layer in building transportation landuse water poi; do
  file="$DIR/$layer.geojson"
  [[ -s "$file" ]] || { echo "Missing/empty layer: $file" >&2; exit 2; }
  python - "$file" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding="utf-8"))
if d.get("type")!="FeatureCollection" or not isinstance(d.get("features"),list):
    raise SystemExit(f"Invalid FeatureCollection: {sys.argv[1]}")
if not d["features"]:
    raise SystemExit(f"Layer has zero features: {sys.argv[1]}")
PY
done
mkdir -p "$(dirname "$OUT")"
tippecanoe -o "$OUT" -zg --drop-densest-as-needed --extend-zooms-if-still-dropping --force \
  -L "building:$DIR/building.geojson" \
  -L "transportation:$DIR/transportation.geojson" \
  -L "landuse:$DIR/landuse.geojson" \
  -L "water:$DIR/water.geojson" \
  -L "poi:$DIR/poi.geojson" \
  --name "Karaj Atlas" \
  --description "OpenStreetMap-derived vector layers for Karaj study extent" \
  --attribution "© OpenStreetMap contributors"
[[ -s "$OUT" ]] || { echo "PMTiles output missing or empty: $OUT" >&2; exit 3; }
printf 'PMTiles ready: %s (%s bytes)\n' "$OUT" "$(stat -c%s "$OUT")"
