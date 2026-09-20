#!/usr/bin/env python3
"""Compile concise .pt textblock sources into version 2 JSON packages."""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import sys
import tempfile
import unicodedata
from pathlib import Path
from typing import Any


KIND = {
    "n": "normal",
    "a": "abnormal",
    "i": "intervention",
    "-": "neutral",
}
PLACEHOLDER = re.compile(
    r"\{:\s*([a-zA-Z0-9_-]+)(?:=([a-zA-Z0-9_.-]+))?(\*)?\s*:\}"
)
DURATION_UNITS = {"minute", "hour", "day", "week", "month", "year"}


class CompileError(Exception):
    def __init__(self, path: Path, line: int, message: str):
        location = f"{path}:{line}" if line else str(path)
        super().__init__(f"{location}: {message}")


def fail(source: dict[str, Any], line: int, message: str) -> None:
    raise CompileError(source["path"], line, message)


def indentation(raw: str, path: Path, line: int) -> tuple[int, str]:
    prefix = raw[: len(raw) - len(raw.lstrip(" \t"))]
    if " " in prefix and "\t" in prefix:
        raise CompileError(path, line, "do not mix tabs and spaces in indentation")
    width = sum(4 if character == "\t" else 1 for character in prefix)
    return width, raw.lstrip(" \t")


def slug(value: str) -> str:
    value = (
        value.lower()
        .replace("ä", "ae")
        .replace("ö", "oe")
        .replace("ü", "ue")
        .replace("ß", "ss")
    )
    value = unicodedata.normalize("NFKD", value)
    value = "".join(character for character in value if not unicodedata.combining(character))
    return re.sub(r"^_+|_+$", "", re.sub(r"[^a-z0-9]+", "_", value))


def split_top_level(value: str, delimiter: str) -> list[str]:
    parts: list[str] = []
    start = 0
    quote = ""
    escaped = False
    parentheses = 0
    placeholder = 0
    index = 0
    while index < len(value):
        character = value[index]
        if escaped:
            escaped = False
        elif character == "\\" and quote:
            escaped = True
        elif quote:
            if character == quote:
                quote = ""
        elif character in {'"', "'"}:
            quote = character
        elif value.startswith("{:", index):
            placeholder += 1
            index += 1
        elif value.startswith(":}", index) and placeholder:
            placeholder -= 1
            index += 1
        elif not placeholder and character == "(":
            parentheses += 1
        elif not placeholder and character == ")":
            parentheses -= 1
        elif (
            not placeholder
            and parentheses == 0
            and value.startswith(delimiter, index)
        ):
            parts.append(value[start:index].strip())
            index += len(delimiter)
            start = index
            continue
        index += 1
    parts.append(value[start:].strip())
    return parts


def split_directive(value: str, path: Path, line: int) -> tuple[str, str]:
    parts = split_top_level(value, ":")
    if len(parts) < 2:
        raise CompileError(path, line, "expected ':'")
    return parts[0], ":".join(parts[1:]).strip()


def parse_scalar(value: str) -> Any:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return shlex.split(value)[0]
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(r"-?(?:\d+\.\d*|\d*\.\d+)", value):
        return float(value)
    if value == "true":
        return True
    if value == "false":
        return False
    return value


def parse_options(value: str, path: Path, line: int, delimiter: str = " ") -> dict[str, Any]:
    try:
        tokens = shlex.split(value) if delimiter == " " else split_top_level(value, delimiter)
    except ValueError as error:
        raise CompileError(path, line, str(error)) from error
    options: dict[str, Any] = {}
    for token in tokens:
        if not token:
            continue
        if "=" not in token:
            raise CompileError(path, line, f"expected name=value, got '{token}'")
        name, raw = token.split("=", 1)
        if not name or name in options:
            raise CompileError(path, line, f"invalid or duplicate option '{name}'")
        options[name] = parse_scalar(raw)
    return options


def parse_annotations(value: str, path: Path, line: int) -> dict[str, Any]:
    annotations: dict[str, Any] = {}
    index = 0
    while index < len(value):
        while index < len(value) and value[index].isspace():
            index += 1
        if index == len(value):
            break
        match = re.match(r"@([a-zA-Z][a-zA-Z0-9_-]*)", value[index:])
        if match is None:
            raise CompileError(path, line, f"invalid group annotation near '{value[index:]}'")
        name = match.group(1)
        index += match.end()
        argument: dict[str, Any] | bool = True
        if index < len(value) and value[index] == "(":
            start = index + 1
            index += 1
            quote = ""
            escaped = False
            depth = 1
            while index < len(value) and depth:
                character = value[index]
                if escaped:
                    escaped = False
                elif character == "\\" and quote:
                    escaped = True
                elif quote:
                    if character == quote:
                        quote = ""
                elif character in {'"', "'"}:
                    quote = character
                elif character == "(":
                    depth += 1
                elif character == ")":
                    depth -= 1
                index += 1
            if depth:
                raise CompileError(path, line, f"unclosed @{name}(...) annotation")
            argument = parse_options(value[start : index - 1], path, line, ",")
        if name in annotations:
            raise CompileError(path, line, f"duplicate @{name} annotation")
        annotations[name] = argument
    return annotations


def parse_kind_suffix(value: str, path: Path, line: int) -> tuple[str, str | None]:
    match = re.fullmatch(r"([\s\S]*?)\|([nai-])", value.strip())
    if match is None:
        return value.strip(), None
    text = match.group(1).strip()
    if not text:
        raise CompileError(path, line, "empty title")
    return text, KIND[match.group(2)]


def parse_value(value: str, path: Path, line: int) -> dict[str, Any]:
    match = re.fullmatch(r"([\s\S]*?)\|([nai-])(\*)?", value.strip())
    if match is None:
        raise CompileError(path, line, "each value needs a |n, |a, |i, or |- kind")
    body = match.group(1).strip()
    if not body:
        raise CompileError(path, line, "empty value")
    coding = re.fullmatch(r"([\s\S]*?)(?:\s+@sct=([^\s]+))?", body)
    assert coding is not None
    text = coding.group(1).strip()
    if not text:
        raise CompileError(path, line, "empty value text")
    return {
        "line": line,
        "raw_text": text,
        "kind": KIND[match.group(2)],
        "default": match.group(3) == "*",
        "snomed": coding.group(2),
    }


def nearest_group(source: dict[str, Any], stack: list[dict[str, Any]], indent: int, line: int) -> dict[str, Any]:
    while stack and stack[-1]["indent"] >= indent:
        stack.pop()
    if not stack:
        fail(source, line, "directive needs an enclosing group")
    return stack[-1]


def parse_source(path: Path) -> dict[str, Any]:
    source: dict[str, Any] = {
        "path": path,
        "namespace": None,
        "imports": [],
        "editors": [],
        "aliases": {},
        "groups": [],
        "phrases": [],
        "sets": [],
    }
    group_stack: list[dict[str, Any]] = []
    current_set: dict[str, Any] | None = None

    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        indent, text = indentation(raw, path, line_number)
        if not text or text.startswith("#"):
            continue

        if current_set is not None and indent > current_set["indent"] and not re.match(
            r"^(?:N|I|E|C|G|U|P(?:<[^>]+>)?|S)\s*[: ]", text
        ):
            if "=" not in text:
                fail(source, line_number, "set assignment needs 'Phrase = Value'")
            phrase, value = (part.strip() for part in text.split("=", 1))
            if not phrase or not value:
                fail(source, line_number, "set assignment needs both phrase and value")
            current_set["assignments"].append((line_number, phrase, value))
            continue
        if current_set is not None and indent <= current_set["indent"]:
            current_set = None

        if text.startswith("N:"):
            if indent:
                fail(source, line_number, "N must not be indented")
            namespace = text[2:].strip()
            if source["namespace"] is not None:
                fail(source, line_number, "namespace is already defined")
            if not re.fullmatch(r"[a-z][a-z0-9_]*", namespace):
                fail(source, line_number, "namespace must match [a-z][a-z0-9_]*")
            source["namespace"] = namespace
            continue

        if text.startswith("I:"):
            if indent:
                fail(source, line_number, "I must not be indented")
            imports = [item.strip() for item in text[2:].split(",") if item.strip()]
            for imported in imports:
                if not re.fullmatch(r"[a-z][a-z0-9_]*", imported):
                    fail(source, line_number, f"invalid import '{imported}'")
                if imported in source["imports"]:
                    fail(source, line_number, f"duplicate import '{imported}'")
                source["imports"].append(imported)
            continue

        if text.startswith("E "):
            if indent:
                fail(source, line_number, "E must not be indented")
            head, body = split_directive(text[2:], path, line_number)
            if not re.fullmatch(r"[a-z][a-z0-9_]*", head):
                fail(source, line_number, f"invalid editor name '{head}'")
            editor_parts = split_top_level(body, "=>")
            if len(editor_parts) > 2:
                fail(source, line_number, "an editor may contain only one '=>'")
            tokens = shlex.split(editor_parts[0])
            if not tokens:
                fail(source, line_number, "editor type is missing")
            source["editors"].append(
                {
                    "line": line_number,
                    "name": head,
                    "type": tokens[0],
                    "options": parse_options(" ".join(shlex.quote(token) for token in tokens[1:]), path, line_number),
                    "values": (
                        [
                            parse_value(candidate, path, line_number)
                            for candidate in split_top_level(editor_parts[1], " / ")
                        ]
                        if len(editor_parts) == 2
                        else []
                    ),
                }
            )
            continue

        if text.startswith("C "):
            if indent:
                fail(source, line_number, "C must not be indented")
            head, body = split_directive(text[2:], path, line_number)
            if not re.fullmatch(r"[a-z][a-z0-9_]*", head):
                fail(source, line_number, f"invalid condition alias '{head}'")
            if head in source["aliases"]:
                fail(source, line_number, f"duplicate condition alias '{head}'")
            source["aliases"][head] = {
                "line": line_number,
                "members": split_top_level(body, " / "),
            }
            continue

        if text.startswith("G "):
            head, body = split_directive(text[2:], path, line_number)
            annotations = parse_annotations(head, path, line_number)
            title, kind = parse_kind_suffix(body, path, line_number)
            while group_stack and group_stack[-1]["indent"] >= indent:
                group_stack.pop()
            parent = group_stack[-1] if group_stack else None
            group = {
                "line": line_number,
                "indent": indent,
                "title": title,
                "kind": kind,
                "annotations": annotations,
                "parent": parent,
                "children": [],
                "external_children": [],
                "phrases": [],
                "sets": [],
            }
            if parent is not None:
                parent["children"].append(group)
            source["groups"].append(group)
            group_stack.append(group)
            current_set = None
            continue

        if text.startswith("U:"):
            parent = nearest_group(source, group_stack, indent, line_number)
            children = [item.strip() for item in text[2:].split(",") if item.strip()]
            if not children:
                fail(source, line_number, "U needs at least one imported group")
            for child in children:
                if not re.fullmatch(r"[a-z][a-z0-9_]*", child):
                    fail(source, line_number, f"invalid imported group '{child}'")
                if child not in source["imports"]:
                    fail(source, line_number, f"group package '{child}' is not imported")
                if child in parent["external_children"]:
                    fail(source, line_number, f"duplicate imported group '{child}'")
                parent["external_children"].append(child)
            current_set = None
            continue

        phrase_match = re.match(r"^P(?:<([\s\S]*?)>)?\s*:\s*([\s\S]*)$", text)
        if phrase_match is not None:
            parent = nearest_group(source, group_stack, indent, line_number)
            conditions = (
                split_top_level(phrase_match.group(1), " / ")
                if phrase_match.group(1) is not None
                else []
            )
            body = phrase_match.group(2).strip()
            arrow = split_top_level(body, "=>")
            if len(arrow) > 2:
                fail(source, line_number, "a phrase may contain only one '=>'")
            if len(arrow) == 1:
                value = parse_value(arrow[0], path, line_number)
                title = value["raw_text"]
                phrase_kind = value["kind"]
                values = [value]
            else:
                title, phrase_kind = parse_kind_suffix(arrow[0], path, line_number)
                values = [
                    parse_value(candidate, path, line_number)
                    for candidate in split_top_level(arrow[1], " / ")
                ]
            phrase = {
                "line": line_number,
                "title": title,
                "kind": phrase_kind,
                "conditions": conditions,
                "values": values,
                "group": parent,
            }
            source["phrases"].append(phrase)
            parent["phrases"].append(phrase)
            current_set = None
            continue

        if text.startswith("S:"):
            parent = nearest_group(source, group_stack, indent, line_number)
            title, kind = parse_kind_suffix(text[2:].strip(), path, line_number)
            current_set = {
                "line": line_number,
                "indent": indent,
                "title": title,
                "kind": kind,
                "assignments": [],
                "group": parent,
            }
            source["sets"].append(current_set)
            parent["sets"].append(current_set)
            continue

        fail(source, line_number, f"unknown directive '{text}'")

    if source["namespace"] is None:
        fail(source, 0, "missing N: namespace")
    if path.stem != source["namespace"]:
        fail(source, 0, f"namespace must match filename '{path.stem}'")
    roots = [group for group in source["groups"] if "root" in group["annotations"]]
    if source["groups"] and len(roots) != 1:
        fail(source, 0, "exactly one group needs @root")
    if roots and roots[0]["parent"] is not None:
        fail(source, roots[0]["line"], "@root group must be top-level")
    return source


def compile_editor(source: dict[str, Any], editor: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    editor_id = f"{source['namespace']}_eingabe_{editor['name']}"
    editor_type = editor["type"]
    options = dict(editor["options"])
    allowed: dict[str, set[str]] = {
        "number": {"label", "prefix", "suffix", "min", "max", "step", "default"},
        "duration": {"label", "prefix", "units", "default"},
        "date": {"label", "prefix"},
        "datetime": {"label", "prefix", "default"},
        "text": {"label", "prefix", "placeholder"},
        "choice": {"label"},
    }
    if editor_type not in allowed:
        fail(source, editor["line"], f"unsupported editor type '{editor_type}'")
    if editor_type != "choice" and editor["values"]:
        fail(source, editor["line"], f"{editor_type} editor does not accept values after '=>'")
    unknown = set(options) - allowed[editor_type]
    if unknown:
        fail(source, editor["line"], f"unknown editor option '{sorted(unknown)[0]}'")
    compiled: dict[str, Any] = {"type": editor_type}
    if editor_type == "choice":
        if not editor["values"]:
            fail(source, editor["line"], "choice editor needs values after '=>'")
        defaults = [value for value in editor["values"] if value["default"]]
        if len(defaults) > 1:
            fail(source, editor["line"], "a choice editor may have only one default (*)")
        compiled["options"] = {}
        for value in editor["values"]:
            option_id = slug(value["raw_text"])
            if not option_id or option_id in compiled["options"]:
                fail(source, value["line"], f"duplicate or empty choice option id '{option_id}'")
            option: dict[str, Any] = {"kind": value["kind"], "text": value["raw_text"]}
            if value["snomed"] is not None:
                option["snomed"] = value["snomed"]
            compiled["options"][option_id] = option
            if value["default"]:
                compiled["default"] = option_id
    if editor_type == "duration":
        if "units" in options:
            units = str(options.pop("units")).split(",")
            if not units or any(unit not in DURATION_UNITS for unit in units):
                fail(source, editor["line"], "invalid duration units")
            compiled["units"] = units
        if "default" in options:
            default = options.pop("default")
            if default not in DURATION_UNITS:
                fail(source, editor["line"], f"invalid default duration unit '{default}'")
            compiled["defaultUnit"] = default
    if editor_type == "number":
        for name in ("min", "max", "step", "default"):
            if name in options and not isinstance(options[name], (int, float)):
                fail(source, editor["line"], f"{name} must be a number")
    if editor_type == "datetime" and "default" in options and options["default"] != "now":
        fail(source, editor["line"], "datetime default must be 'now'")
    compiled.update(options)
    return editor_id, compiled


def value_id_text(text: str) -> str:
    without_placeholders = PLACEHOLDER.sub(" ", text)
    return slug(without_placeholders) or "value"


def compile_source(source: dict[str, Any]) -> dict[str, Any]:
    namespace = source["namespace"]
    identifiers: dict[str, tuple[str, int]] = {}

    def register(category: str, identifier: str, line: int) -> None:
        prior = identifiers.get(identifier)
        if prior is not None:
            fail(
                source,
                line,
                f"derived {category} id '{identifier}' collides with {prior[0]} on line {prior[1]}",
            )
        identifiers[identifier] = (category, line)

    for group in source["groups"]:
        group["id"] = (
            namespace
            if "root" in group["annotations"]
            else f"{namespace}_gruppe_{slug(group['title'])}"
        )
        register("group", group["id"], group["line"])

    phrase_titles: dict[str, list[dict[str, Any]]] = {}
    values_by_text: dict[str, list[dict[str, Any]]] = {}
    for phrase in source["phrases"]:
        phrase["id"] = f"{namespace}_eintrag_{slug(phrase['title'])}"
        register("phrase", phrase["id"], phrase["line"])
        phrase_titles.setdefault(phrase["title"], []).append(phrase)
        used_value_ids: set[str] = set()
        for value in phrase["values"]:
            value["text"] = PLACEHOLDER.sub(
                lambda match: f"{{:{match.group(1)}{'*' if match.group(3) else ''}:}}",
                value["raw_text"],
            )
            value["id"] = f"{phrase['id']}_wert_{value_id_text(value['raw_text'])}"
            if value["id"] in used_value_ids:
                fail(source, value["line"], f"duplicate derived value id '{value['id']}'")
            used_value_ids.add(value["id"])
            register("value", value["id"], value["line"])
            values_by_text.setdefault(value["raw_text"], []).append(value)

    for definition in source["sets"]:
        definition["id"] = f"{namespace}_vorgabe_{slug(definition['title'])}"
        register("set", definition["id"], definition["line"])

    compiled_editors: dict[str, Any] = {}
    local_editors: dict[str, str] = {}
    for editor in source["editors"]:
        editor_id, compiled = compile_editor(source, editor)
        register("editor", editor_id, editor["line"])
        local_editors[editor["name"]] = editor_id
        compiled_editors[editor_id] = compiled

    def unique_phrase(title: str, line: int) -> dict[str, Any]:
        matches = phrase_titles.get(title, [])
        if not matches:
            fail(source, line, f"unknown phrase '{title}'")
        if len(matches) > 1:
            fail(source, line, f"ambiguous phrase '{title}'")
        return matches[0]

    def resolve_reference(reference: str, line: int, trail: tuple[str, ...] = ()) -> list[dict[str, Any]]:
        if reference in source["aliases"]:
            if reference in trail:
                fail(source, line, f"condition alias cycle: {' -> '.join((*trail, reference))}")
            alias = source["aliases"][reference]
            return [
                value
                for member in alias["members"]
                for value in resolve_reference(member, alias["line"], (*trail, reference))
            ]
        phrases = phrase_titles.get(reference, [])
        if len(phrases) == 1:
            return phrases[0]["values"]
        if len(phrases) > 1:
            fail(source, line, f"ambiguous condition phrase '{reference}'")
        values = values_by_text.get(reference, [])
        if len(values) == 1:
            return values
        if len(values) > 1:
            fail(source, line, f"ambiguous condition value '{reference}'")
        fail(source, line, f"unknown condition '{reference}'")
        return []

    def suggested_value(phrase: dict[str, Any]) -> str | None:
        if len(phrase["values"]) == 1:
            return phrase["values"][0]["id"]
        defaults = [value for value in phrase["values"] if value["default"]]
        others = [value for value in phrase["values"] if not value["default"]]
        if len(defaults) == 1 and len(others) == 1:
            return others[0]["id"]
        return None

    compiled_phrases: dict[str, Any] = {}
    for phrase in source["phrases"]:
        defaults = [value for value in phrase["values"] if value["default"]]
        if len(defaults) > 1:
            fail(source, phrase["line"], "a phrase may have only one default value (*)")
        default: str | None
        if defaults:
            default = defaults[0]["id"]
        elif phrase["conditions"]:
            default = None
        else:
            default = ""
        kinds = {value["kind"] for value in phrase["values"]}
        phrase_kind = phrase["kind"] or (next(iter(kinds)) if len(kinds) == 1 else "neutral")
        compiled: dict[str, Any] = {
            "title": phrase["title"],
            "kind": phrase_kind,
            "default": default,
            "values": {},
        }
        attributes: dict[str, str] = {}
        for value in phrase["values"]:
            compiled_value: dict[str, Any] = {
                "kind": value["kind"],
                "text": value["text"],
            }
            if value["snomed"] is not None:
                compiled_value["snomed"] = value["snomed"]
            compiled["values"][value["id"]] = compiled_value
            for placeholder in PLACEHOLDER.finditer(value["raw_text"]):
                attribute, editor_ref = placeholder.group(1), placeholder.group(2)
                if editor_ref is None:
                    editor_id = local_editors.get(attribute)
                    if editor_id is None and attribute == "freitext" and "gemeinsam" in source["imports"]:
                        editor_id = "gemeinsam_eingabe_freitext"
                    if editor_id is None:
                        fail(source, value["line"], f"placeholder '{attribute}' needs an editor")
                elif "." in editor_ref:
                    imported, editor_name = editor_ref.split(".", 1)
                    if imported not in source["imports"]:
                        fail(source, value["line"], f"editor package '{imported}' is not imported")
                    editor_id = f"{imported}_eingabe_{editor_name}"
                else:
                    editor_id = local_editors.get(editor_ref)
                    if editor_id is None:
                        fail(source, value["line"], f"unknown local editor '{editor_ref}'")
                previous = attributes.get(attribute)
                if previous is not None and previous != editor_id:
                    fail(source, value["line"], f"attribute '{attribute}' uses different editors")
                attributes[attribute] = editor_id
        if attributes:
            compiled["attributes"] = attributes
        if phrase["conditions"]:
            target = suggested_value(phrase)
            suggestions: dict[str, str | None] = {}
            for condition in phrase["conditions"]:
                for trigger in resolve_reference(condition, phrase["line"]):
                    suggestions[trigger["id"]] = target
            compiled["suggestions"] = suggestions
        compiled_phrases[phrase["id"]] = compiled

    compiled_sets: dict[str, Any] = {}
    for definition in source["sets"]:
        values: dict[str, str | None] = {}
        for line, phrase_title, value_text in definition["assignments"]:
            phrase = unique_phrase(phrase_title, line)
            candidates = [value for value in phrase["values"] if value["raw_text"] == value_text]
            if len(candidates) != 1:
                fail(source, line, f"unknown or ambiguous value '{value_text}' in phrase '{phrase_title}'")
            values[phrase["id"]] = candidates[0]["id"]
        compiled_set: dict[str, Any] = {"title": definition["title"], "values": values}
        if definition["kind"] is not None:
            compiled_set["kind"] = definition["kind"]
        compiled_sets[definition["id"]] = compiled_set

    known_annotations = {"root", "reset", "summary", "collapsed", "inactive", "repeat"}
    compiled_groups: dict[str, Any] = {}
    for group in source["groups"]:
        annotations = group["annotations"]
        unknown = set(annotations) - known_annotations
        if unknown:
            fail(source, group["line"], f"unknown group annotation '@{sorted(unknown)[0]}'")
        for boolean_annotation in known_annotations - {"repeat"}:
            if boolean_annotation in annotations and annotations[boolean_annotation] is not True:
                fail(source, group["line"], f"@{boolean_annotation} takes no arguments")
        compiled_group: dict[str, Any] = {"title": group["title"]}
        if group["kind"] is not None:
            compiled_group["kind"] = group["kind"]
        children = [child["id"] for child in group["children"]] + group["external_children"]
        if children:
            compiled_group["children"] = children
        if group["phrases"]:
            compiled_group["phrases"] = [phrase["id"] for phrase in group["phrases"]]
        if group["sets"]:
            compiled_group["sets"] = [definition["id"] for definition in group["sets"]]
        if "inactive" in annotations:
            compiled_group["default"] = False
        for annotation in ("summary", "reset", "collapsed"):
            if annotation in annotations:
                compiled_group[annotation] = True
        if "repeat" in annotations:
            options = annotations["repeat"]
            assert isinstance(options, dict)
            unknown_repeat = set(options) - {"initial", "add", "empty"}
            if unknown_repeat:
                fail(source, group["line"], f"unknown @repeat option '{sorted(unknown_repeat)[0]}'")
            if not isinstance(options.get("add"), str) or not options["add"]:
                fail(source, group["line"], "@repeat needs add=\"...\"")
            initial = options.get("initial", 0)
            if not isinstance(initial, int) or initial < 0:
                fail(source, group["line"], "@repeat initial must be a non-negative integer")
            repeatable: dict[str, Any] = {"initial": initial, "add": options["add"]}
            if "empty" in options:
                repeatable["empty"] = unique_phrase(str(options["empty"]), group["line"])["id"]
            compiled_group["repeatable"] = repeatable
        compiled_groups[group["id"]] = compiled_group

    package: dict[str, Any] = {"version": 2}
    if source["imports"]:
        package["imports"] = source["imports"]
    if compiled_editors:
        package["editors"] = compiled_editors
    if compiled_sets:
        package["sets"] = compiled_sets
    package["groups"] = compiled_groups
    package["phrases"] = compiled_phrases
    return package


def encoded(package: dict[str, Any]) -> str:
    return json.dumps(package, ensure_ascii=False, indent=2) + "\n"


def is_document_source(path: Path) -> bool:
    for raw in path.read_text(encoding="utf-8").splitlines():
        text = raw.strip()
        if text and not text.startswith("#"):
            return text == "T: dokumente"
    return False


def compile_documents(path: Path) -> dict[str, Any]:
    documents: dict[str, Any] = {}
    default_id: str | None = None
    current: dict[str, Any] | None = None
    current_indent = -1
    saw_type = False

    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        indent, text = indentation(raw, path, line_number)
        if not text or text.startswith("#"):
            continue
        if text == "T: dokumente":
            if indent or saw_type or documents:
                raise CompileError(path, line_number, "T: dokumente must occur once at the start")
            saw_type = True
            continue
        document_match = re.fullmatch(r"D(\*)?\s*:\s*(.+)", text)
        if document_match is not None:
            if indent:
                raise CompileError(path, line_number, "D must not be indented")
            title = document_match.group(2).strip()
            identifier = slug(title)
            if not identifier:
                raise CompileError(path, line_number, "document title cannot produce an id")
            if identifier in documents:
                raise CompileError(path, line_number, f"duplicate document id '{identifier}'")
            current = {"title": title, "blocks": []}
            current_indent = indent
            documents[identifier] = current
            if document_match.group(1):
                if default_id is not None:
                    raise CompileError(path, line_number, "only one document may be the default (*)")
                default_id = identifier
            continue
        if text.startswith("B:"):
            if current is None or indent <= current_indent:
                raise CompileError(path, line_number, "B needs an enclosing document")
            try:
                tokens = shlex.split(text[2:].strip())
            except ValueError as error:
                raise CompileError(path, line_number, str(error)) from error
            if len(tokens) < 2:
                raise CompileError(path, line_number, "B needs a plugin and definition id")
            plugin, definition_id = tokens[:2]
            if not re.fullmatch(r"[a-z][a-z0-9_-]*", plugin):
                raise CompileError(path, line_number, f"invalid plugin id '{plugin}'")
            if not re.fullmatch(r"[a-z][a-z0-9_]*", definition_id):
                raise CompileError(path, line_number, f"invalid definition id '{definition_id}'")
            params = {"id": definition_id}
            for name, value in parse_options(" ".join(shlex.quote(token) for token in tokens[2:]), path, line_number).items():
                params[name] = value
            current["blocks"].append({"plugin": plugin, "params": params})
            continue
        raise CompileError(path, line_number, f"unknown document directive '{text}'")

    if not saw_type:
        raise CompileError(path, 0, "missing T: dokumente")
    if not documents:
        raise CompileError(path, 0, "at least one document is required")
    if default_id is None:
        raise CompileError(path, 0, "one document needs D* as the default")
    return {"version": 1, "default": default_id, "documents": documents}


def output_path(source_path: Path) -> Path:
    return source_path.with_suffix(".json")


def validate_packages(packages: dict[str, dict[str, Any]], data_directory: Path) -> None:
    cache = dict(packages)

    def load(name: str, owner: str) -> dict[str, Any]:
        package = cache.get(name)
        if package is not None:
            return package
        path = data_directory / f"{name}.json"
        try:
            package = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError as error:
            raise CompileError(data_directory / f"{owner}.pt", 0, f"unknown import '{name}'") from error
        except json.JSONDecodeError as error:
            raise CompileError(path, error.lineno, error.msg) from error
        if not isinstance(package, dict):
            raise CompileError(path, 0, "imported package must be an object")
        cache[name] = package
        return package

    def merged(
        name: str,
        trail: tuple[str, ...] = (),
        seen: set[str] | None = None,
    ) -> dict[str, dict[str, Any]]:
        if seen is None:
            seen = set()
        if name in trail:
            raise CompileError(
                data_directory / f"{name}.pt",
                0,
                f"package import cycle: {' -> '.join((*trail, name))}",
            )
        result: dict[str, dict[str, Any]] = {
            "groups": {},
            "phrases": {},
            "sets": {},
            "editors": {},
        }
        if name in seen:
            return result
        seen.add(name)
        package = load(name, trail[-1] if trail else name)
        if package.get("version") != 2:
            raise CompileError(data_directory / f"{name}.json", 0, "textblock package needs version 2")
        for imported in package.get("imports", []):
            if not isinstance(imported, str):
                raise CompileError(data_directory / f"{name}.json", 0, "imports must contain strings")
            dependency = merged(imported, (*trail, name), seen)
            for category, definitions in dependency.items():
                for identifier, definition in definitions.items():
                    if identifier in result[category]:
                        raise CompileError(
                            data_directory / f"{name}.json",
                            0,
                            f"duplicate imported {category[:-1]} id '{identifier}'",
                        )
                    result[category][identifier] = definition
        for category in result:
            definitions = package.get(category, {})
            if not isinstance(definitions, dict):
                raise CompileError(data_directory / f"{name}.json", 0, f"{category} must be an object")
            for identifier, definition in definitions.items():
                if identifier in result[category]:
                    raise CompileError(
                        data_directory / f"{name}.json",
                        0,
                        f"duplicate {category[:-1]} id '{identifier}'",
                    )
                result[category][identifier] = definition
        return result

    placeholder_pattern = re.compile(r"\{:\s*([a-zA-Z0-9_-]+)\s*(\*)?\s*:\}")
    for name, package in packages.items():
        if package.get("version") != 2:
            continue
        definitions = merged(name)
        values: dict[str, str] = {}
        for phrase_id, phrase in definitions["phrases"].items():
            if not isinstance(phrase, dict) or not isinstance(phrase.get("values"), dict):
                raise CompileError(data_directory / f"{name}.json", 0, f"invalid phrase '{phrase_id}'")
            default = phrase.get("default")
            if default not in ("", None) and default not in phrase["values"]:
                raise CompileError(data_directory / f"{name}.json", 0, f"unknown default '{default}'")
            attributes = phrase.get("attributes", {})
            for value_id, value in phrase["values"].items():
                if value_id in values:
                    raise CompileError(
                        data_directory / f"{name}.json",
                        0,
                        f"value id '{value_id}' belongs to both '{values[value_id]}' and '{phrase_id}'",
                    )
                values[value_id] = phrase_id
                if not isinstance(value, dict) or not isinstance(value.get("text"), str):
                    raise CompileError(data_directory / f"{name}.json", 0, f"invalid value '{value_id}'")
                for placeholder in placeholder_pattern.finditer(value["text"]):
                    attribute = placeholder.group(1)
                    if attribute not in attributes:
                        raise CompileError(
                            data_directory / f"{name}.json",
                            0,
                            f"missing attribute '{attribute}' in phrase '{phrase_id}'",
                        )
            for editor_id in attributes.values():
                if editor_id not in definitions["editors"]:
                    raise CompileError(
                        data_directory / f"{name}.json",
                        0,
                        f"unknown editor '{editor_id}' in phrase '{phrase_id}'",
                    )
        for group_id, group in definitions["groups"].items():
            for child in group.get("children", []):
                if child not in definitions["groups"]:
                    raise CompileError(data_directory / f"{name}.json", 0, f"unknown child group '{child}'")
            for phrase_id in group.get("phrases", []):
                if phrase_id not in definitions["phrases"]:
                    raise CompileError(data_directory / f"{name}.json", 0, f"unknown phrase '{phrase_id}'")
            for set_id in group.get("sets", []):
                if set_id not in definitions["sets"]:
                    raise CompileError(data_directory / f"{name}.json", 0, f"unknown set '{set_id}'")
            empty = group.get("repeatable", {}).get("empty")
            if empty is not None and empty not in definitions["phrases"]:
                raise CompileError(data_directory / f"{name}.json", 0, f"unknown empty phrase '{empty}'")
        for phrase_id, phrase in definitions["phrases"].items():
            for trigger, target in phrase.get("suggestions", {}).items():
                if trigger not in values:
                    raise CompileError(data_directory / f"{name}.json", 0, f"unknown suggestion trigger '{trigger}'")
                if target is not None and target not in phrase["values"]:
                    raise CompileError(data_directory / f"{name}.json", 0, f"unknown suggestion target '{target}'")
        for set_id, definition in definitions["sets"].items():
            for phrase_id, value_id in definition.get("values", {}).items():
                phrase = definitions["phrases"].get(phrase_id)
                if phrase is None:
                    raise CompileError(data_directory / f"{name}.json", 0, f"unknown phrase '{phrase_id}' in set '{set_id}'")
                if value_id is not None and value_id not in phrase["values"]:
                    raise CompileError(data_directory / f"{name}.json", 0, f"unknown value '{value_id}' in set '{set_id}'")

    documents = packages.get("documents")
    if documents is not None:
        for document in documents.get("documents", {}).values():
            for block in document.get("blocks", []):
                if block.get("plugin") != "textblock":
                    continue
                definition_id = block.get("params", {}).get("id")
                package = load(str(definition_id), "documents")
                if definition_id not in package.get("groups", {}):
                    raise CompileError(
                        data_directory / "documents.pt",
                        0,
                        f"textblock '{definition_id}' has no equally named root group",
                    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail when generated JSON is stale")
    parser.add_argument("sources", nargs="*", type=Path, help=".pt files (default: app/data/*.pt)")
    arguments = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    paths = arguments.sources or sorted((root / "app" / "data").glob("*.pt"))
    if not paths:
        parser.error("no .pt sources found")

    generated: list[tuple[Path, str, dict[str, Any]]] = []
    packages: dict[str, dict[str, Any]] = {}
    try:
        for path in paths:
            resolved = path if path.is_absolute() else root / path
            if resolved.suffix != ".pt":
                raise CompileError(resolved, 0, "source filename must end in .pt")
            package = (
                compile_documents(resolved)
                if is_document_source(resolved)
                else compile_source(parse_source(resolved))
            )
            target = output_path(resolved)
            generated.append((target, encoded(package), package))
            packages[target.stem] = package
        validate_packages(packages, root / "app" / "data")
    except (CompileError, OSError) as error:
        print(error, file=sys.stderr)
        return 1

    if arguments.check:
        stale = []
        for path, content, _ in generated:
            try:
                current = path.read_text(encoding="utf-8")
            except FileNotFoundError:
                current = ""
            if current != content:
                stale.append(path.relative_to(root))
        if stale:
            print("Generated textblock JSON is out of date:", file=sys.stderr)
            for path in stale:
                print(f"  {path}", file=sys.stderr)
            print("Run: make compile", file=sys.stderr)
            return 1
        return 0

    temporary: list[tuple[Path, Path]] = []
    try:
        for path, content, _ in generated:
            descriptor, temporary_name = tempfile.mkstemp(
                dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", text=True
            )
            temporary_path = Path(temporary_name)
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            temporary.append((temporary_path, path))
        for temporary_path, path in temporary:
            os.replace(temporary_path, path)
    finally:
        for temporary_path, _ in temporary:
            temporary_path.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
