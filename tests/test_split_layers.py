import unittest
from scripts.split_osm_layers import split

class SplitLayersTests(unittest.TestCase):
    def test_feature_can_appear_in_multiple_semantic_layers(self):
        data={"type":"FeatureCollection","features":[
            {"type":"Feature","properties":{"building":"yes","amenity":"school"},"geometry":None},
            {"type":"Feature","properties":{"highway":"primary"},"geometry":None},
            {"type":"Feature","properties":{"natural":"water"},"geometry":None},
            {"type":"Feature","properties":{"shop":"bakery"},"geometry":None}
        ]}
        layers=split(data)
        self.assertEqual(len(layers["building"]["features"]),1)
        self.assertEqual(len(layers["poi"]["features"]),2)
        self.assertEqual(len(layers["transportation"]["features"]),1)
        self.assertEqual(len(layers["landuse"]["features"]),1)
    def test_invalid_collection_rejected(self):
        with self.assertRaises(ValueError): split({"type":"Feature","features":[]})

if __name__=="__main__": unittest.main()
