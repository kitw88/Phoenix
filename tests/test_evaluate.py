import unittest

from app.evaluate import judge, parse_output


class ParseOutputTests(unittest.TestCase):
    def test_plain_json(self):
        parsed = parse_output('{"product":"FCN","matched_features":["coupon"]}')
        self.assertEqual(parsed["product"], "FCN")

    def test_fenced_json(self):
        parsed = parse_output('```json\n{"product":"ELN"}\n```')
        self.assertEqual(parsed["product"], "ELN")

    def test_empty(self):
        self.assertIsNone(parse_output("  "))


class JudgeTests(unittest.TestCase):
    def test_label_match(self):
        self.assertTrue(judge({"product": "FCN"}, "product", "FCN"))

    def test_label_mismatch(self):
        self.assertFalse(judge({"product": "AQ"}, "product", "FCN"))

    def test_unlabeled_case_is_unscored(self):
        self.assertIsNone(judge({"product": "FCN"}, "product", None))
        self.assertIsNone(judge({"product": "FCN"}, "product", ""))

    def test_missing_field_fails_when_expected(self):
        self.assertFalse(judge({"matched_features": []}, "product", "FCN"))


if __name__ == "__main__":
    unittest.main()
