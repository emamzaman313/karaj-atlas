import unittest
from scripts.build_3d_buildings import enrich

class BuildingHeightTests(unittest.TestCase):
    def feature(self, props):
        return {"type": "Feature", "properties": dict(props), "geometry": {"type": "Polygon", "coordinates": [[[50, 35], [50.1, 35], [50.1, 35.1], [50, 35]]]}}
    def test_osm_height_is_preserved_as_verified_source(self):
        f = enrich(self.feature({"building": "yes", "height": "12 m"}))
        self.assertEqual(f["properties"]["render_height_m"], 12)
        self.assertEqual(f["properties"]["height_source"], "osm_height")
    def test_levels_are_explicit_estimate(self):
        f = enrich(self.feature({"building": "yes", "building:levels": "4"}))
        self.assertEqual(f["properties"]["render_height_m"], 12)
        self.assertEqual(f["properties"]["height_source"], "estimated_from_levels_3m")
    def test_missing_height_is_marked_unverified(self):
        f = enrich(self.feature({"building": "yes"}))
        self.assertEqual(f["properties"]["render_height_m"], 9)
        self.assertEqual(f["properties"]["height_source"], "visual_fallback_not_verified")
    def test_non_building_is_not_given_height(self):
        f = enrich(self.feature({"amenity": "school"}))
        self.assertNotIn("render_height_m", f["properties"])

    def test_building_no_is_not_extruded(self):
        f = enrich(self.feature({"building": "no", "height": "18 m"}))
        self.assertNotIn("render_height_m", f["properties"])
        self.assertNotIn("height_source", f["properties"])

if __name__ == "__main__":
    unittest.main()
