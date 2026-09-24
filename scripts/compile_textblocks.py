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
CEDIS_RELATIONS = {"equivalent", "related", "broader", "narrower"}


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
    brackets = 0
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
        elif not placeholder and character == "[":
            brackets += 1
        elif not placeholder and character == "]":
            brackets -= 1
        elif (
            not placeholder
            and parentheses == 0
            and brackets == 0
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
        argument: dict[str, Any] | str | bool = True
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
            raw_argument = value[start : index - 1].strip()
            argument = (
                raw_argument
                if name in {"subgroups", "reveal"}
                else parse_options(raw_argument, path, line, ",")
            )
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
    snomed: str | None = None
    snomed_display: str | None = None
    points: int | None = None
    text = body
    points_match = re.fullmatch(r"([\s\S]*?)\s+@points=(-?\d+)", text)
    if points_match is not None:
        text = points_match.group(1).strip()
        points = int(points_match.group(2))
    if "@sct=" in body:
        coding = re.fullmatch(
            r"([\s\S]*?)\s+@sct=([^\s\[\]]+)\[([^\[\]\r\n]+)\]",
            text,
        )
        if coding is None:
            raise CompileError(
                path,
                line,
                "SNOMED coding must use @sct=<code-or-expression>[<human-readable term>]",
            )
        text = coding.group(1).strip()
        snomed = coding.group(2)
        snomed_display = coding.group(3).strip()
    if not text:
        raise CompileError(path, line, "empty value text")
    return {
        "line": line,
        "raw_text": text,
        "kind": KIND[match.group(2)],
        "default": match.group(3) == "*",
        "snomed": snomed,
        "snomed_display": snomed_display,
        "points": points,
    }


def parse_catalog_metadata(
    source: dict[str, Any],
    definition: dict[str, Any],
    text: str,
    line: int,
) -> None:
    if text == "@freetext":
        if definition["free_text"]:
            fail(source, line, "duplicate @freetext")
        definition["free_text"] = True
        return
    match = re.fullmatch(r"@([a-z]+)\s*=\s*([\s\S]+)", text)
    if match is None:
        fail(source, line, f"invalid catalog metadata '{text}'")
    name, body = match.groups()
    if name == "sct":
        if definition["snomed"] is not None:
            fail(source, line, "duplicate @sct")
        coding = re.fullmatch(r"([^\s\[\]]+)\[([^\[\]\r\n]+)\]", body.strip())
        if coding is None:
            fail(
                source,
                line,
                "SNOMED coding must use @sct=<code-or-expression>[<human-readable term>]",
            )
        definition["snomed"] = coding.group(1)
        definition["snomed_display"] = coding.group(2).strip()
        return
    if name in {"alias", "lens", "tag"}:
        key = {
            "alias": "aliases",
            "lens": "lenses",
            "tag": "tags",
        }[name]
        if definition[key]:
            fail(source, line, f"duplicate @{name}")
        entries = [entry.strip() for entry in body.split(";") if entry.strip()]
        if not entries:
            fail(source, line, f"@{name} needs at least one entry")
        if len(set(entries)) != len(entries):
            fail(source, line, f"@{name} contains a duplicate entry")
        if name in {"lens", "tag"} and any(
            re.fullmatch(r"[a-z][a-z0-9_]*", entry) is None for entry in entries
        ):
            fail(source, line, f"@{name} entries must be lowercase identifiers")
        definition[key] = entries
        return
    if name == "cedis":
        if definition["cedis"]:
            fail(source, line, "duplicate @cedis")
        mappings: list[dict[str, str]] = []
        for entry in (part.strip() for part in body.split(";")):
            if not entry:
                continue
            mapping = re.fullmatch(
                r"(\d{3})\[([^\[\]\r\n]+)\]\s+(equivalent|related|broader|narrower)",
                entry,
            )
            if mapping is None:
                fail(
                    source,
                    line,
                    "@cedis entries need <code>[<display>] <relation>",
                )
            code, display, relation = mapping.groups()
            if relation not in CEDIS_RELATIONS:
                fail(source, line, f"unknown CEDIS relation '{relation}'")
            mappings.append(
                {"code": code, "display": display.strip(), "relation": relation}
            )
        if not mappings:
            fail(source, line, "@cedis needs at least one mapping")
        if len({mapping["code"] for mapping in mappings}) != len(mappings):
            fail(source, line, "@cedis contains a duplicate code")
        definition["cedis"] = mappings
        return
    fail(source, line, f"unknown catalog metadata '@{name}'")


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
        "lenses": [],
        "catalog_values": [],
    }
    group_stack: list[dict[str, Any]] = []
    current_set: dict[str, Any] | None = None
    current_catalog_value: dict[str, Any] | None = None

    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        indent, text = indentation(raw, path, line_number)
        if not text or text.startswith("#"):
            continue

        if (
            current_catalog_value is not None
            and indent > current_catalog_value["indent"]
            and text.startswith("@")
        ):
            parse_catalog_metadata(source, current_catalog_value, text, line_number)
            continue
        if current_catalog_value is not None and indent <= current_catalog_value["indent"]:
            current_catalog_value = None

        if current_set is not None and indent > current_set["indent"] and not re.match(
            r"^(?:N|I|E|C|G(?:<[^>]+>)?|U|P(?:<[^>]+>)?|S)\s*[: ]", text
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

        if text.startswith("L "):
            if indent:
                fail(source, line_number, "L must not be indented")
            identifier, label = split_directive(text[2:], path, line_number)
            if not re.fullmatch(r"[a-z][a-z0-9_]*", identifier):
                fail(source, line_number, f"invalid lens id '{identifier}'")
            if not label:
                fail(source, line_number, "lens label cannot be empty")
            if any(lens["id"] == identifier for lens in source["lenses"]):
                fail(source, line_number, f"duplicate lens '{identifier}'")
            source["lenses"].append(
                {"line": line_number, "id": identifier, "label": label}
            )
            continue

        if text.startswith("V "):
            if indent:
                fail(source, line_number, "V must not be indented")
            identifier, body = split_directive(text[2:], path, line_number)
            if not re.fullmatch(r"[a-z][a-z0-9_]*", identifier):
                fail(source, line_number, f"invalid catalog value id '{identifier}'")
            if any(value["name"] == identifier for value in source["catalog_values"]):
                fail(source, line_number, f"duplicate catalog value '{identifier}'")
            value = parse_value(body, path, line_number)
            if value["default"]:
                fail(source, line_number, "catalog values cannot be defaults")
            value.update(
                {
                    "indent": indent,
                    "name": identifier,
                    "aliases": [],
                    "cedis": [],
                    "lenses": [],
                    "tags": [],
                    "free_text": False,
                }
            )
            source["catalog_values"].append(value)
            current_catalog_value = value
            current_set = None
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

        group_match = re.match(r"^G(?:<([\s\S]*?)>)?\s*([:\s][\s\S]*)$", text)
        if group_match is not None:
            conditions = (
                split_top_level(group_match.group(1), " / ")
                if group_match.group(1) is not None
                else []
            )
            head, body = split_directive(group_match.group(2).lstrip(), path, line_number)
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
                "conditions": conditions,
                "annotations": annotations,
                "parent": parent,
                "children": [],
                "external_children": [],
                "phrases": [],
                "items": [],
                "sets": [],
            }
            if parent is not None:
                parent["children"].append(group)
                parent["items"].append({"type": "group", "definition": group})
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
                parent["items"].append({"type": "group", "id": child})
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
                prompt = False
                values = [value]
            else:
                title, phrase_kind = parse_kind_suffix(arrow[0], path, line_number)
                prompt = title.endswith("*")
                if prompt:
                    title = title[:-1].rstrip()
                    if not title:
                        fail(source, line_number, "prompt phrase needs a title before '*'")
                values = []
                catalog: str | None = None
                for candidate in split_top_level(arrow[1], " / "):
                    catalog_match = re.fullmatch(
                        r"@values\(([a-z][a-z0-9_]*)\)", candidate
                    )
                    if catalog_match is None:
                        values.append(parse_value(candidate, path, line_number))
                        continue
                    if catalog is not None:
                        fail(source, line_number, "a phrase may use only one value catalog")
                    catalog = catalog_match.group(1)
                    if catalog != source["namespace"] and catalog not in source["imports"]:
                        fail(source, line_number, f"value catalog '{catalog}' is not imported")
                if not values and catalog is None:
                    fail(source, line_number, "a phrase needs at least one value")
            phrase = {
                "line": line_number,
                "title": title,
                "kind": phrase_kind,
                "prompt": prompt,
                "conditions": conditions,
                "values": values,
                "catalog": catalog if len(arrow) == 2 else None,
                "group": parent,
            }
            source["phrases"].append(phrase)
            parent["phrases"].append(phrase)
            parent["items"].append({"type": "phrase", "definition": phrase})
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
                option["snomedDisplay"] = value["snomed_display"]
            if value["points"] is not None:
                option["points"] = value["points"]
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


def search_text(*values: str) -> str:
    return " ".join(
        part
        for value in values
        for part in [slug(value).replace("_", " ")]
        if part
    )


def compile_source(
    source: dict[str, Any],
    catalog_tags: dict[tuple[str, str], list[str]] | None = None,
) -> dict[str, Any]:
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

    for value in source["catalog_values"]:
        value["text"] = PLACEHOLDER.sub(
            lambda match: f"{{:{match.group(1)}{'*' if match.group(3) else ''}:}}",
            value["raw_text"],
        )
        value["id"] = f"{namespace}_wert_{value['name']}"
        register("catalog value", value["id"], value["line"])
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

    def resolve_editor(attribute: str, editor_ref: str | None, line: int) -> str:
        if editor_ref is None:
            editor_id = local_editors.get(attribute)
            if editor_id is None and attribute == "freitext" and "gemeinsam" in source["imports"]:
                editor_id = "gemeinsam_eingabe_freitext"
            if editor_id is None:
                fail(source, line, f"placeholder '{attribute}' needs an editor")
            return editor_id
        if "." in editor_ref:
            imported, editor_name = editor_ref.split(".", 1)
            if imported not in source["imports"]:
                fail(source, line, f"editor package '{imported}' is not imported")
            return f"{imported}_eingabe_{editor_name}"
        editor_id = local_editors.get(editor_ref)
        if editor_id is None:
            fail(source, line, f"unknown local editor '{editor_ref}'")
        return editor_id

    compiled_catalogs: dict[str, Any] = {}
    if source["catalog_values"] or source["lenses"]:
        if not source["catalog_values"]:
            fail(source, 0, "a lens package needs catalog values")
        known_lenses = {lens["id"] for lens in source["lenses"]}
        catalog_attributes: dict[str, str] = {}
        catalog_values: dict[str, Any] = {}
        free_text_values = 0
        for value in source["catalog_values"]:
            unknown_lenses = set(value["lenses"]) - known_lenses
            if unknown_lenses:
                fail(
                    source,
                    value["line"],
                    f"unknown lens '{sorted(unknown_lenses)[0]}'",
                )
            compiled_value: dict[str, Any] = {
                "kind": value["kind"],
                "text": value["text"],
                "aliases": value["aliases"],
                "lenses": value["lenses"],
                "tags": value["tags"],
                "search": search_text(value["raw_text"], *value["aliases"]),
            }
            if value["snomed"] is not None:
                compiled_value["snomed"] = value["snomed"]
                compiled_value["snomedDisplay"] = value["snomed_display"]
            if value["cedis"]:
                compiled_value["cedis"] = value["cedis"]
            if value["free_text"]:
                compiled_value["freeText"] = True
                free_text_values += 1
            for placeholder in PLACEHOLDER.finditer(value["raw_text"]):
                attribute, editor_ref = placeholder.group(1), placeholder.group(2)
                editor_id = resolve_editor(attribute, editor_ref, value["line"])
                previous = catalog_attributes.get(attribute)
                if previous is not None and previous != editor_id:
                    fail(
                        source,
                        value["line"],
                        f"attribute '{attribute}' uses different editors",
                    )
                catalog_attributes[attribute] = editor_id
            catalog_values[value["id"]] = compiled_value
        if free_text_values > 1:
            fail(source, 0, "a catalog may contain only one @freetext value")
        catalog: dict[str, Any] = {
            "lenses": [
                {"id": lens["id"], "label": lens["label"]}
                for lens in source["lenses"]
            ],
            "values": catalog_values,
        }
        if catalog_attributes:
            catalog["attributes"] = catalog_attributes
        compiled_catalogs[namespace] = catalog

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
            phrase = phrases[0]
            if phrase["catalog"] == namespace:
                return [*source["catalog_values"], *phrase["values"]]
            if phrase["catalog"] is not None:
                fail(
                    source,
                    line,
                    "conditions on an imported catalog phrase need stable package.value references",
                )
            return phrase["values"]
        if len(phrases) > 1:
            fail(source, line, f"ambiguous condition phrase '{reference}'")
        values = values_by_text.get(reference, [])
        if len(values) == 1:
            return values
        if len(values) > 1:
            fail(source, line, f"ambiguous condition value '{reference}'")
        tag_query = re.fullmatch(
            r"@tag\(([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)\)", reference
        )
        if tag_query is not None:
            package, tag = tag_query.groups()
            if package != namespace and package not in source["imports"]:
                fail(source, line, f"catalog package '{package}' is not imported")
            matches = (catalog_tags or {}).get((package, tag), [])
            if not matches:
                fail(source, line, f"catalog tag '{package}.{tag}' matches no values")
            return [{"id": value_id} for value_id in matches]
        external = re.fullmatch(
            r"([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)", reference
        )
        if external is not None:
            package, value = external.groups()
            if package != namespace and package not in source["imports"]:
                fail(source, line, f"catalog package '{package}' is not imported")
            return [{"id": f"{package}_wert_{value}"}]
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

    def compile_condition(references: list[str], line: int) -> dict[str, Any]:
        parsed: list[tuple[str, bool]] = []
        for reference in references:
            negated = reference.startswith("!")
            name = reference[1:].lstrip() if negated else reference
            if not name:
                fail(source, line, "condition reference cannot be empty")
            parsed.append((name, negated))
        polarities = {negated for _, negated in parsed}
        if len(polarities) > 1:
            fail(source, line, "positive and negated conditions cannot be mixed")
        value_ids: list[str] = []
        for reference, _ in parsed:
            for trigger in resolve_reference(reference, line):
                if trigger["id"] not in value_ids:
                    value_ids.append(trigger["id"])
        return {"values": value_ids, "negated": next(iter(polarities))}

    compiled_phrases: dict[str, Any] = {}
    for phrase in source["phrases"]:
        defaults = [value for value in phrase["values"] if value["default"]]
        if len(defaults) > 1:
            fail(source, phrase["line"], "a phrase may have only one default value (*)")
        if phrase["prompt"] and len(phrase["values"]) < 2 and phrase["catalog"] is None:
            fail(source, phrase["line"], "a prompt phrase needs at least two values")
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
        if phrase["catalog"] is not None:
            compiled["catalog"] = phrase["catalog"]
        if phrase["prompt"]:
            compiled["prompt"] = True
        attributes: dict[str, str] = {}
        for value in phrase["values"]:
            compiled_value: dict[str, Any] = {
                "kind": value["kind"],
                "text": value["text"],
            }
            if value["snomed"] is not None:
                compiled_value["snomed"] = value["snomed"]
                compiled_value["snomedDisplay"] = value["snomed_display"]
            if value["points"] is not None:
                compiled_value["points"] = value["points"]
            compiled["values"][value["id"]] = compiled_value
            for placeholder in PLACEHOLDER.finditer(value["raw_text"]):
                attribute, editor_ref = placeholder.group(1), placeholder.group(2)
                editor_id = resolve_editor(attribute, editor_ref, value["line"])
                previous = attributes.get(attribute)
                if previous is not None and previous != editor_id:
                    fail(source, value["line"], f"attribute '{attribute}' uses different editors")
                attributes[attribute] = editor_id
        if attributes:
            compiled["attributes"] = attributes
        if phrase["conditions"]:
            target = suggested_value(phrase)
            condition = compile_condition(phrase["conditions"], phrase["line"])
            if condition["negated"]:
                compiled["condition"] = {**condition, "suggestion": target}
            else:
                compiled["suggestions"] = {
                    trigger: target for trigger in condition["values"]
                }
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

    known_annotations = {
        "root",
        "reset",
        "summary",
        "subgroups",
        "autocompact",
        "reveal",
        "inactive",
        "repeat",
        "score",
    }
    compiled_groups: dict[str, Any] = {}
    for group in source["groups"]:
        annotations = group["annotations"]
        for deprecated in ("inline", "collapsed", "autocollapse"):
            if deprecated in annotations:
                fail(
                    source,
                    group["line"],
                    f"@{deprecated} is obsolete; use @subgroups(flow|break), "
                    "@autocompact, and the universal compact rule",
                )
        unknown = set(annotations) - known_annotations
        if unknown:
            fail(source, group["line"], f"unknown group annotation '@{sorted(unknown)[0]}'")
        for boolean_annotation in known_annotations - {"repeat", "score", "subgroups", "reveal"}:
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
        if group["items"]:
            compiled_group["items"] = [
                {
                    "type": item["type"],
                    "id": (
                        item["id"]
                        if "id" in item
                        else item["definition"]["id"]
                    ),
                }
                for item in group["items"]
            ]
        if group["sets"]:
            compiled_group["sets"] = [definition["id"] for definition in group["sets"]]
        if "inactive" in annotations:
            compiled_group["default"] = False
        if "subgroups" in annotations:
            subgroup_layout = annotations["subgroups"]
            if subgroup_layout not in {"flow", "break"}:
                fail(source, group["line"], "@subgroups expects 'flow' or 'break'")
            compiled_group["subgroups"] = subgroup_layout
        if "autocompact" in annotations:
            compiled_group["autoCompact"] = True
        if "reveal" in annotations:
            reveal = annotations["reveal"]
            if not isinstance(reveal, str):
                fail(
                    source,
                    group["line"],
                    "@reveal needs 'initial' or a condition in parentheses",
                )
            if reveal == "initial":
                compiled_group["reveal"] = "initial"
            else:
                references = split_top_level(reveal, " / ")
                if not references or any(not reference for reference in references):
                    fail(source, group["line"], "@reveal needs a condition")
                compiled_group["reveal"] = compile_condition(
                    references, group["line"]
                )
        if group["conditions"]:
            if "repeat" in annotations:
                fail(source, group["line"], "a repeatable group cannot be conditional")
            compiled_group["condition"] = compile_condition(
                group["conditions"], group["line"]
            )
        for annotation in ("summary", "reset"):
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
        if "score" in annotations:
            options = annotations["score"]
            assert isinstance(options, dict)
            unknown_score = set(options) - {"id", "label", "target", "attribute"}
            if unknown_score:
                fail(source, group["line"], f"unknown @score option '{sorted(unknown_score)[0]}'")
            score_id = options.get("id", slug(group["title"]))
            label = options.get("label", f"{group['title']} berechnen")
            target_title = options.get("target")
            attribute = options.get("attribute")
            if not isinstance(score_id, str) or not re.fullmatch(r"[a-z][a-z0-9_-]*", score_id):
                fail(source, group["line"], "@score id must be a lowercase identifier")
            if not isinstance(label, str) or not label:
                fail(source, group["line"], "@score label must be non-empty text")
            if not isinstance(target_title, str) or not target_title:
                fail(source, group["line"], "@score needs target=\"Phrase title\"")
            if not isinstance(attribute, str) or not re.fullmatch(r"[a-zA-Z0-9_-]+", attribute):
                fail(source, group["line"], "@score needs a valid attribute name")
            target = unique_phrase(target_title, group["line"])
            if target not in group["phrases"]:
                fail(source, group["line"], "@score target must be a direct phrase of the group")
            target_definition = compiled_phrases[target["id"]]
            target_editor_id = target_definition.get("attributes", {}).get(attribute)
            target_editor = compiled_editors.get(target_editor_id)
            if target_editor is None or target_editor.get("type") != "number":
                fail(source, group["line"], "@score target attribute must use a number editor")
            target_values = list(target_definition["values"])
            if len(target_values) != 1:
                fail(source, group["line"], "@score target phrase must have exactly one value")

            criteria: list[dict[str, Any]] = []
            for phrase in group["phrases"]:
                if phrase is target:
                    continue
                annotated = [value["points"] is not None for value in phrase["values"]]
                if any(annotated) and not all(annotated):
                    fail(source, phrase["line"], "all values of a score criterion need @points")
                if not annotated or not all(annotated):
                    continue
                criteria.append(
                    {
                        "phraseId": phrase["id"],
                        "title": phrase["title"],
                        "options": [
                            {
                                "valueId": value["id"],
                                "text": value["raw_text"],
                                "kind": value["kind"],
                                "points": value["points"],
                            }
                            for value in phrase["values"]
                        ],
                    }
                )
            if not criteria:
                fail(source, group["line"], "@score needs at least one phrase with @points values")
            minimum = sum(min(option["points"] for option in criterion["options"]) for criterion in criteria)
            maximum = sum(max(option["points"] for option in criterion["options"]) for criterion in criteria)
            if target_editor.get("min") is not None and target_editor["min"] != minimum:
                fail(source, group["line"], f"@score minimum {minimum} differs from target editor minimum")
            if target_editor.get("max") is not None and target_editor["max"] != maximum:
                fail(source, group["line"], f"@score maximum {maximum} differs from target editor maximum")
            compiled_group["score"] = {
                "id": score_id,
                "label": label,
                "minimum": minimum,
                "maximum": maximum,
                "criteria": criteria,
                "target": {
                    "phraseId": target["id"],
                    "valueId": target_values[0],
                    "attributeId": attribute,
                },
            }
        compiled_groups[group["id"]] = compiled_group

    package: dict[str, Any] = {"version": 2}
    if source["imports"]:
        package["imports"] = source["imports"]
    if compiled_editors:
        package["editors"] = compiled_editors
    if compiled_sets:
        package["sets"] = compiled_sets
    if compiled_catalogs:
        package["catalogs"] = compiled_catalogs
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
    tools: list[dict[str, Any]] = []
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
        if text.startswith("W:"):
            if indent:
                raise CompileError(path, line_number, "W must not be indented")
            if documents:
                raise CompileError(path, line_number, "W must occur before the first document")
            try:
                tokens = shlex.split(text[2:].strip())
            except ValueError as error:
                raise CompileError(path, line_number, str(error)) from error
            if len(tokens) < 2:
                raise CompileError(path, line_number, "W needs a plugin and tool id")
            plugin, tool_id = tokens[:2]
            if not re.fullmatch(r"[a-z][a-z0-9_-]*", plugin):
                raise CompileError(path, line_number, f"invalid plugin id '{plugin}'")
            if not re.fullmatch(r"[a-z][a-z0-9_-]*", tool_id):
                raise CompileError(path, line_number, f"invalid tool id '{tool_id}'")
            params = {"id": tool_id}
            for name, value in parse_options(
                " ".join(shlex.quote(token) for token in tokens[2:]),
                path,
                line_number,
            ).items():
                params[name] = value
            if any(
                tool["plugin"] == plugin and tool["params"]["id"] == tool_id
                for tool in tools
            ):
                raise CompileError(path, line_number, f"duplicate tool '{plugin}:{tool_id}'")
            tools.append({"plugin": plugin, "params": params})
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
    catalog = {"version": 1, "default": default_id, "documents": documents}
    if tools:
        catalog["tools"] = tools
    return catalog


def output_path(source_path: Path) -> Path:
    return source_path.with_suffix(".json")


def catalog_tag_index(
    sources: list[dict[str, Any]], data_directory: Path
) -> dict[tuple[str, str], list[str]]:
    index: dict[tuple[str, str], list[str]] = {}
    selected_names = {source["namespace"] for source in sources}

    for source in sources:
        namespace = source["namespace"]
        for value in source["catalog_values"]:
            value_id = f"{namespace}_wert_{value['name']}"
            for tag in value["tags"]:
                index.setdefault((namespace, tag), []).append(value_id)

    external_imports = {
        imported
        for source in sources
        for imported in source["imports"]
        if imported not in selected_names
    }
    for imported in external_imports:
        path = data_directory / f"{imported}.json"
        try:
            package = json.loads(path.read_text(encoding="utf-8"))
            values = package.get("catalogs", {}).get(imported, {}).get("values", {})
        except (FileNotFoundError, AttributeError, json.JSONDecodeError):
            continue
        if not isinstance(values, dict):
            continue
        for value_id, value in values.items():
            if not isinstance(value_id, str) or not isinstance(value, dict):
                continue
            tags = value.get("tags", [])
            if not isinstance(tags, list):
                continue
            for tag in tags:
                if isinstance(tag, str):
                    index.setdefault((imported, tag), []).append(value_id)
    return index


def validate_packages(packages: dict[str, dict[str, Any]], data_directory: Path) -> None:
    cache = dict(packages)
    snomed_displays: dict[str, tuple[str, str]] = {}
    try:
        cedis_catalog = json.loads((data_directory / "cedis.json").read_text(encoding="utf-8"))
        cedis_labels = {
            entry["code"]: entry["label"]
            for entry in cedis_catalog["entries"]
            if isinstance(entry, dict)
            and isinstance(entry.get("code"), str)
            and isinstance(entry.get("label"), str)
        }
    except (FileNotFoundError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise CompileError(data_directory / "cedis.json", 0, "invalid CEDIS catalog") from error

    for package_name, package in packages.items():
        if package.get("version") != 2:
            continue
        coded_values: list[dict[str, Any]] = []
        for phrase in package.get("phrases", {}).values():
            coded_values.extend(phrase.get("values", {}).values())
        for editor in package.get("editors", {}).values():
            coded_values.extend(editor.get("options", {}).values())
        for catalog in package.get("catalogs", {}).values():
            coded_values.extend(catalog.get("values", {}).values())
        for value in coded_values:
            snomed = value.get("snomed")
            if snomed is None:
                continue
            display = value.get("snomedDisplay")
            if not isinstance(display, str) or not display:
                raise CompileError(
                    data_directory / f"{package_name}.pt",
                    0,
                    f"SNOMED coding '{snomed}' needs a human-readable term",
                )
            previous = snomed_displays.get(snomed)
            if previous is not None and previous[0] != display:
                raise CompileError(
                    data_directory / f"{package_name}.pt",
                    0,
                    f"SNOMED coding '{snomed}' uses both '{previous[0]}' "
                    f"in {previous[1]}.pt and '{display}'",
                )
            snomed_displays[snomed] = (display, package_name)
        for catalog_id, catalog in package.get("catalogs", {}).items():
            mapped_cedis_codes: set[str] = set()
            for value in catalog.get("values", {}).values():
                for mapping in value.get("cedis", []):
                    code = mapping.get("code")
                    display = mapping.get("display")
                    relation = mapping.get("relation")
                    if code not in cedis_labels:
                        raise CompileError(
                            data_directory / f"{package_name}.pt",
                            0,
                            f"unknown CEDIS code '{code}'",
                        )
                    if cedis_labels[code] != display:
                        raise CompileError(
                            data_directory / f"{package_name}.pt",
                            0,
                            f"CEDIS code '{code}' uses '{display}', expected '{cedis_labels[code]}'",
                        )
                    if relation not in CEDIS_RELATIONS:
                        raise CompileError(
                            data_directory / f"{package_name}.pt",
                            0,
                            f"invalid CEDIS relation '{relation}'",
                        )
                    mapped_cedis_codes.add(code)
            if catalog_id == "symptome":
                missing_codes = sorted(set(cedis_labels) - mapped_cedis_codes)
                if missing_codes:
                    raise CompileError(
                        data_directory / f"{package_name}.pt",
                        0,
                        "symptom catalog does not cover CEDIS codes: "
                        + ", ".join(missing_codes),
                    )

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
            "catalogs": {},
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
        for catalog_id, catalog in definitions["catalogs"].items():
            if not isinstance(catalog, dict) or not isinstance(catalog.get("values"), dict):
                raise CompileError(
                    data_directory / f"{name}.json", 0, f"invalid catalog '{catalog_id}'"
                )
            lenses = catalog.get("lenses")
            if (
                not isinstance(lenses, list)
                or any(
                    not isinstance(lens, dict)
                    or not isinstance(lens.get("id"), str)
                    or not isinstance(lens.get("label"), str)
                    for lens in lenses
                )
            ):
                raise CompileError(
                    data_directory / f"{name}.json", 0, f"invalid lenses in catalog '{catalog_id}'"
                )
            lens_ids = {lens["id"] for lens in lenses}
            for value_id, value in catalog["values"].items():
                if (
                    not isinstance(value, dict)
                    or not isinstance(value.get("text"), str)
                    or not isinstance(value.get("kind"), str)
                    or not isinstance(value.get("lenses"), list)
                    or not isinstance(value.get("tags"), list)
                    or any(
                        not isinstance(tag, str)
                        or re.fullmatch(r"[a-z][a-z0-9_]*", tag) is None
                        for tag in value["tags"]
                    )
                    or any(lens not in lens_ids for lens in value["lenses"])
                ):
                    raise CompileError(
                        data_directory / f"{name}.json",
                        0,
                        f"invalid catalog value '{value_id}'",
                    )
            for editor_id in catalog.get("attributes", {}).values():
                if editor_id not in definitions["editors"]:
                    raise CompileError(
                        data_directory / f"{name}.json",
                        0,
                        f"unknown editor '{editor_id}' in catalog '{catalog_id}'",
                    )
        for phrase_id, phrase in definitions["phrases"].items():
            if not isinstance(phrase, dict) or not isinstance(phrase.get("values"), dict):
                raise CompileError(data_directory / f"{name}.json", 0, f"invalid phrase '{phrase_id}'")
            catalog_id = phrase.get("catalog")
            if catalog_id is not None:
                catalog = definitions["catalogs"].get(catalog_id)
                if catalog is None:
                    raise CompileError(
                        data_directory / f"{name}.json",
                        0,
                        f"unknown value catalog '{catalog_id}' in phrase '{phrase_id}'",
                    )
                overlap = set(phrase["values"]) & set(catalog["values"])
                if overlap:
                    raise CompileError(
                        data_directory / f"{name}.json",
                        0,
                        f"duplicate catalog value '{sorted(overlap)[0]}' in phrase '{phrase_id}'",
                    )
                phrase = {
                    **phrase,
                    "values": {**catalog["values"], **phrase["values"]},
                    "attributes": {
                        **catalog.get("attributes", {}),
                        **phrase.get("attributes", {}),
                    },
                }
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

        def validate_condition(condition: Any, owner: str) -> None:
            if not isinstance(condition, dict):
                raise CompileError(
                    data_directory / f"{name}.json", 0, f"invalid condition in '{owner}'"
                )
            triggers = condition.get("values")
            if (
                not isinstance(triggers, list)
                or not triggers
                or any(not isinstance(trigger, str) for trigger in triggers)
                or not isinstance(condition.get("negated"), bool)
            ):
                raise CompileError(
                    data_directory / f"{name}.json", 0, f"invalid condition in '{owner}'"
                )
            for trigger in triggers:
                if trigger not in values:
                    raise CompileError(
                        data_directory / f"{name}.json",
                        0,
                        f"unknown condition value '{trigger}' in '{owner}'",
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
            condition = group.get("condition")
            if condition is not None:
                validate_condition(condition, group_id)
                if group.get("repeatable") is not None:
                    raise CompileError(
                        data_directory / f"{name}.json",
                        0,
                        f"repeatable group '{group_id}' cannot be conditional",
                    )
            reveal = group.get("reveal")
            if reveal is not None and reveal != "initial":
                validate_condition(reveal, f"{group_id} reveal")
            items = group.get("items")
            if items is not None:
                if not isinstance(items, list):
                    raise CompileError(
                        data_directory / f"{name}.json",
                        0,
                        f"invalid ordered items in group '{group_id}'",
                    )
                ordered_phrases: list[str] = []
                ordered_children: list[str] = []
                for item in items:
                    if not isinstance(item, dict) or set(item) != {"type", "id"}:
                        raise CompileError(
                            data_directory / f"{name}.json",
                            0,
                            f"invalid ordered item in group '{group_id}'",
                        )
                    item_type, item_id = item["type"], item["id"]
                    if item_type == "phrase" and item_id in definitions["phrases"]:
                        ordered_phrases.append(item_id)
                    elif item_type == "group" and item_id in definitions["groups"]:
                        ordered_children.append(item_id)
                    else:
                        raise CompileError(
                            data_directory / f"{name}.json",
                            0,
                            f"invalid ordered item in group '{group_id}'",
                        )
                if (
                    sorted(ordered_phrases) != sorted(group.get("phrases", []))
                    or sorted(ordered_children) != sorted(group.get("children", []))
                ):
                    raise CompileError(
                        data_directory / f"{name}.json",
                        0,
                        f"ordered items do not match group '{group_id}'",
                    )
        for phrase_id, phrase in definitions["phrases"].items():
            for trigger, target in phrase.get("suggestions", {}).items():
                if trigger not in values:
                    raise CompileError(data_directory / f"{name}.json", 0, f"unknown suggestion trigger '{trigger}'")
                if target is not None and target not in phrase["values"]:
                    raise CompileError(data_directory / f"{name}.json", 0, f"unknown suggestion target '{target}'")
            condition = phrase.get("condition")
            if condition is not None:
                validate_condition(condition, phrase_id)
                target = condition.get("suggestion")
                if target is not None and target not in phrase["values"]:
                    raise CompileError(
                        data_directory / f"{name}.json",
                        0,
                        f"unknown condition suggestion target '{target}'",
                    )
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
        parsed: list[tuple[Path, dict[str, Any] | None]] = []
        for path in paths:
            resolved = path if path.is_absolute() else root / path
            if resolved.suffix != ".pt":
                raise CompileError(resolved, 0, "source filename must end in .pt")
            parsed.append(
                (resolved, None if is_document_source(resolved) else parse_source(resolved))
            )
        tags = catalog_tag_index(
            [source for _, source in parsed if source is not None],
            root / "app" / "data",
        )
        for resolved, source in parsed:
            package = (
                compile_documents(resolved)
                if source is None
                else compile_source(source, tags)
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
