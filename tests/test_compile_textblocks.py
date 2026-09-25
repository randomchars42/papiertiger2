from pathlib import Path
import unittest

from scripts.compile_textblocks import (
    CompileError,
    parse_annotations,
    validate_packages,
)


ROOT = Path(__file__).resolve().parents[1]


class GroupAnnotationTests(unittest.TestCase):
    def test_unknown_annotation_is_reported_before_its_arguments_are_parsed(self) -> None:
        with self.assertRaisesRegex(
            CompileError,
            r"ankunft\.pt:5: unknown group annotation '@activate'",
        ):
            parse_annotations(
                "@root @activate(rettungsdienst)",
                Path("ankunft.pt"),
                5,
            )

    def test_group_active_lenses_use_the_global_symptom_catalog(self) -> None:
        package = {
            "version": 2,
            "groups": {
                "root": {
                    "title": "Root",
                    "items": [],
                    "activeLenses": ["rettungsdienst"],
                }
            },
            "phrases": {},
            "sets": {},
            "editors": {},
            "catalogs": {},
        }

        validate_packages({"test": package}, ROOT / "app" / "data")


if __name__ == "__main__":
    unittest.main()
