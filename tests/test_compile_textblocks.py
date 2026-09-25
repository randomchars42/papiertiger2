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

    def test_lens_groups_expand_in_catalog_values_and_groups(self) -> None:
        source_text = """\
N: sample

V item: Item|-
  @lens=klinik

G @root @active(klinik;rettungsdienst): Sample
  P: Item|-
  G @lens(klinik) clinical: Clinical
    P: Clinical item|-
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
            package["groups"]["sample_gruppe_clinical"]["lenses"],
            ["kernteam", "trauma_orthopaedie", "neurochirurgie"],
        )
        self.assertEqual(
            package["catalogs"]["sample"]["values"]["sample_wert_item"]["lenses"],
            ["kernteam", "trauma_orthopaedie", "neurochirurgie"],
        )


class ExplicitIdTests(unittest.TestCase):
    def test_legacy_phrase_condition_syntax_is_rejected(self) -> None:
        source_text = """\
N: sample

G @root: Sample
  P: Trigger|-
  P<Trigger>: Follow-up|-
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.pt"
            path.write_text(source_text, encoding="utf-8")
            with self.assertRaisesRegex(
                CompileError,
                r"P<\.\.\.> was removed; use P condition\(\.\.\.\) instead",
            ):
                parse_source(path)

    def test_groups_and_phrases_can_decouple_ids_from_repeated_titles(self) -> None:
        source_text = """\
N: sample

G @root: Sample
  G first_section: Abschnitt
    P first_person: Person|-
  G second_section: Abschnitt
    P second_person: Person|-
    P condition(first_person): bestätigt|-
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
            package["phrases"]["sample_eintrag_bestaetigt"]["condition"],
            {
                "values": ["sample_eintrag_first_person_wert_person"],
                "negated": False,
                "value": "sample_eintrag_bestaetigt_wert_bestaetigt",
            },
        )

    def test_phrase_attention_modes_compile_separately_from_visibility(self) -> None:
        source_text = """\
N: sample

G @root: Sample
  P trigger: Trigger|-
  P suggest(trigger): Follow-up|-
  P require(!trigger): Documentation|-
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.pt"
            path.write_text(source_text, encoding="utf-8")
            package = compile_source(parse_source(path))

        follow_up = package["phrases"]["sample_eintrag_follow_up"]
        self.assertEqual(follow_up["default"], "")
        self.assertEqual(
            follow_up["attention"],
            {
                "values": ["sample_eintrag_trigger_wert_trigger"],
                "negated": False,
                "level": "suggested",
                "value": "sample_eintrag_follow_up_wert_follow_up",
            },
        )
        self.assertEqual(
            package["phrases"]["sample_eintrag_documentation"]["attention"],
            {
                "values": ["sample_eintrag_trigger_wert_trigger"],
                "negated": True,
                "level": "required",
                "value": "sample_eintrag_documentation_wert_documentation",
            },
        )

    def test_reference_lists_use_semicolons_and_can_select_a_named_phrase_value(self) -> None:
        source_text = """\
N: sample

G @root: Sample
  P first_status: First => inactive|n / active|a
  P second_status: Second => inactive|n / active|a
  P condition(first_status=active; second_status=active): Follow-up|-
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.pt"
            path.write_text(source_text, encoding="utf-8")
            package = compile_source(parse_source(path))

        self.assertEqual(
            package["phrases"]["sample_eintrag_follow_up"]["condition"]["values"],
            [
                "sample_eintrag_first_status_wert_active",
                "sample_eintrag_second_status_wert_active",
            ],
        )

    def test_slash_is_rejected_as_a_reference_separator(self) -> None:
        source_text = """\
N: sample

G @root: Sample
  P first: First|-
  P second: Second|-
  P condition(first / second): Follow-up|-
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.pt"
            path.write_text(source_text, encoding="utf-8")
            with self.assertRaisesRegex(
                CompileError,
                r"condition\(\.\.\.\) references use ';', not '/'",
            ):
                parse_source(path)

    def test_phrase_parser_preserves_colons_inside_the_value(self) -> None:
        source_text = """\
N: sample

G @root: Sample
  P: Result => score: normal|- / score: abnormal|a
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.pt"
            path.write_text(source_text, encoding="utf-8")
            package = compile_source(parse_source(path))

        values = package["phrases"]["sample_eintrag_result"]["values"]
        self.assertEqual(
            [value["text"] for value in values.values()],
            ["score: normal", "score: abnormal"],
        )

    def test_conditional_phrase_cannot_define_an_inclusion_default(self) -> None:
        source_text = """\
N: sample

G @root: Sample
  P trigger: Trigger|-
  P condition(trigger): Follow-up|-*
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.pt"
            path.write_text(source_text, encoding="utf-8")
            with self.assertRaisesRegex(
                CompileError,
                "a conditional phrase cannot have a default value",
            ):
                compile_source(parse_source(path))


if __name__ == "__main__":
    unittest.main()
