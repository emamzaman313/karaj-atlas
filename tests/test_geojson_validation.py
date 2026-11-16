import unittest
from scripts.validate_geojson import geometry_issues, valid_position

class GeoJSONValidationTests(unittest.TestCase):
    def test_rejects_nan_and_out_of_range(self):
        self.assertFalse(valid_position([float("nan"), 35]))
        self.assertFalse(valid_position([181, 35]))
        self.assertTrue(valid_position([50.9, 35.8]))
    def test_open_polygon_ring_is_reported(self):
        g={"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1]]]}
        self.assertIn("polygon ring is not closed",geometry_issues(g))
    def test_closed_polygon_ring_passes(self):
        g={"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}
        self.assertEqual(geometry_issues(g),[])
    def test_empty_geometry_fails(self):
        self.assertTrue(geometry_issues({"type":"LineString","coordinates":[]}))

if __name__=="__main__": unittest.main()
