from pathlib import Path
import tempfile
import unittest

from scripts.compile_textblocks import (
    CompileError,
    compile_source,
    compile_documents,
    document_lens_ids,
    document_lens_groups,
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
        documents_text = """\
T: dokumente

L* rettungsdienst: Rettungsdienst
L kernteam: Kernteam

D*: Dokument
  B: textblock sample controls=false
"""
        source_text = """\
N: sample

G @root @active(rettungsdienst): Sample
  P: Item|-
"""
        with tempfile.TemporaryDirectory() as directory:
            data_directory = Path(directory)
            document_path = data_directory / "documents.pt"
            source_path = data_directory / "sample.pt"
            document_path.write_text(documents_text, encoding="utf-8")
            source_path.write_text(source_text, encoding="utf-8")
            documents = compile_documents(document_path)
            lens_ids = document_lens_ids(documents, document_path)
            sample = compile_source(
                parse_source(source_path),
                known_lenses=lens_ids,
            )
            validate_packages(
                {"documents": documents, "sample": sample},
                ROOT / "app" / "data",
            )

        self.assertEqual(documents["defaultLens"], "rettungsdienst")
        self.assertIn(
            {"id": "kernteam", "label": "Kernteam"},
            documents["lenses"],
        )
        self.assertEqual(
            sample["groups"]["sample"]["activeLenses"],
            ["rettungsdienst"],
        )

    def test_document_catalog_defines_lens_groups(self) -> None:
        source_text = """\
T: dokumente

L* rettungsdienst: Rettungsdienst
L kernteam: Kernteam
L trauma_orthopaedie: Trauma & Orthopädie

LG klinik: kernteam; trauma_orthopaedie
LG praeklinik: rettungsdienst

D*: Dokument
  B: textblock sample controls=false
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "documents.pt"
            path.write_text(source_text, encoding="utf-8")
            documents = compile_documents(path)
            lens_ids = document_lens_ids(documents, path)
            lens_groups = document_lens_groups(documents, path, lens_ids)

        self.assertEqual(
            lens_groups,
            {
                "klinik": ["kernteam", "trauma_orthopaedie"],
                "praeklinik": ["rettungsdienst"],
            },
        )

    def test_lens_groups_expand_in_catalog_values_and_active_groups(self) -> None:
        source_text = """\
N: sample

V item: Item|-
  @lens=klinik

G @root @active(klinik;rettungsdienst): Sample
  P: Item|-
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.pt"
            path.write_text(source_text, encoding="utf-8")
            package = compile_source(
                parse_source(path),
                known_lenses={
                    "rettungsdienst",
                    "kernteam",
                    "trauma_orthopaedie",
                    "neurochirurgie",
                },
                lens_groups={
                    "klinik": [
                        "kernteam",
                        "trauma_orthopaedie",
                        "neurochirurgie",
                    ]
                },
            )

        self.assertEqual(
            package["groups"]["sample"]["activeLenses"],
            [
                "kernteam",
                "trauma_orthopaedie",
                "neurochirurgie",
                "rettungsdienst",
            ],
        )
        self.assertEqual(
            package["catalogs"]["sample"]["values"]["sample_wert_item"]["lenses"],
            ["kernteam", "trauma_orthopaedie", "neurochirurgie"],
        )


class ExplicitIdTests(unittest.TestCase):
    def test_groups_and_phrases_can_decouple_ids_from_repeated_titles(self) -> None:
        source_text = """\
N: sample

G @root: Sample
  G first_section: Abschnitt
    P first_person: Person|-
  G second_section: Abschnitt
    P second_person: Person|-
    P<first_person>: bestätigt|-
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.pt"
            path.write_text(source_text, encoding="utf-8")
            package = compile_source(parse_source(path))

        self.assertIn("sample_gruppe_first_section", package["groups"])
        self.assertIn("sample_gruppe_second_section", package["groups"])
        self.assertEqual(
            package["phrases"]["sample_eintrag_first_person"]["title"],
            "Person",
        )
        self.assertEqual(
            package["phrases"]["sample_eintrag_second_person"]["title"],
            "Person",
        )
        self.assertEqual(
            package["phrases"]["sample_eintrag_bestaetigt"]["suggestions"],
            {
                "sample_eintrag_first_person_wert_person":
                    "sample_eintrag_bestaetigt_wert_bestaetigt"
            },
        )


if __name__ == "__main__":
    unittest.main()
