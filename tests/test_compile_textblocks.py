from pathlib import Path
import unittest

from scripts.compile_textblocks import (
    CompileError,
    compile_source,
    compile_documents,
    document_lens_ids,
    parse_annotations,
    parse_source,
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

    def test_group_active_lenses_use_the_document_catalog(self) -> None:
        documents = compile_documents(ROOT / "app" / "data" / "documents.pt")
        self.assertEqual(documents["defaultLens"], "rettungsdienst")
        self.assertIn(
            {"id": "kernteam", "label": "Kernteam"},
            documents["lenses"],
        )
        lens_ids = document_lens_ids(
            documents,
            ROOT / "app" / "data" / "documents.pt",
        )
        symptoms = compile_source(
            parse_source(ROOT / "app" / "data" / "symptome.pt"),
            known_lenses=lens_ids,
        )
        self.assertNotIn("lenses", symptoms["catalogs"]["symptome"])
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

        validate_packages(
            {"documents": documents, "test": package},
            ROOT / "app" / "data",
        )


if __name__ == "__main__":
    unittest.main()
