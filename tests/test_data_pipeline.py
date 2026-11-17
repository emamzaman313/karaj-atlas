import unittest
import urllib.parse
from scripts.karaj_data_pipeline import query, to_feature, DEFAULT_BBOX, encode_overpass_payload

class OSMPipelineTests(unittest.TestCase):
    def test_overpass_payload_is_form_encoded(self):
        payload = encode_overpass_payload(DEFAULT_BBOX)
        parsed = urllib.parse.parse_qs(payload.decode())
        self.assertIn('data', parsed)
        self.assertIn('way[building]', parsed['data'][0])
        self.assertIn('out body geom', parsed['data'][0])

    def test_query_has_core_layers(self):
        q=query(DEFAULT_BBOX)
        for tag in ("building","highway","landuse","amenity","waterway","public_transport"):
            self.assertIn(tag,q)
    def test_node_conversion_and_source_metadata(self):
        f=to_feature({"type":"node","id":123,"lon":50.99,"lat":35.83,"tags":{"amenity":"school","name":"Test"}})
        self.assertEqual(f["id"],"node/123")
        self.assertEqual(f["geometry"]["coordinates"],[50.99,35.83])
        self.assertEqual(f["properties"]["source"],"OpenStreetMap")
    def test_closed_building_way_polygon(self):
        f=to_feature({"type":"way","id":42,"tags":{"building":"yes"},"geometry":[{"lon":1,"lat":1},{"lon":2,"lat":1},{"lon":2,"lat":2},{"lon":1,"lat":1}]})
        self.assertEqual(f["geometry"]["type"],"Polygon")
    def test_open_road_way_line(self):
        f=to_feature({"type":"way","id":7,"tags":{"highway":"residential"},"geometry":[{"lon":1,"lat":1},{"lon":2,"lat":2}]})
        self.assertEqual(f["geometry"]["type"],"LineString")
    def test_missing_geometry_rejected(self):
        self.assertIsNone(to_feature({"type":"way","id":9,"tags":{},"geometry":[]}))

if __name__=="__main__":unittest.main()
