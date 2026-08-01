#!/usr/bin/env python3
"""Compile the canonical per-slide Markdown plan into deterministic outline JSON."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from workspace_core import (
    GENERATOR_VERSION,
    SCHEMA_VERSION,
    WorkspaceError,
    canonical_json_bytes,
    contained_path,
    load_json,
    read_normalized_markdown,
    relative_workspace_path,
    sha256_bytes,
    write_json_atomic,
)


DECK_TITLE_RE = re.compile(r"^# (?P<title>.+) — Per-Slide Content Plan$")
HEADER_FIELDS = {
    "topic": re.compile(r"^Recommended topic: \*\*(?P<value>.+)\*\*$"),
    "declared_slide_count": re.compile(r"^Recommended slide count: \*\*(?P<value>[0-9]+)\*\*$"),
    "expected_duration": re.compile(r"^Expected duration: \*\*(?P<value>.+)\*\*$"),
    "overall_logic": re.compile(r"^Overall logic: \*\*(?P<value>.+)\*\*$"),
}
SLIDE_RE = re.compile(r"^## Slide (?P<ordinal>[0-9]{2}): (?P<title>.+)$")
SLIDE_ID_RE = re.compile(r"^<!-- slide-id: (?P<id>[a-z][a-z0-9]*(?:-[a-z0-9]+)*) -->$")
SLIDE_ID_PREFIX_RE = re.compile(r"^<!-- slide-id:")
LAYOUT_HEADING = "### 1. Layout"
CONTENT_HEADING = "### 2. Content"
HINT_RE = re.compile(r"<!-- (?P<kind>role|variant): (?P<value>[a-z][a-z0-9-]*) -->")


def diagnostic(code: str, message: str, **details: Any) -> dict[str, Any]:
    return {"code": code, "message": message, **details}


def _trim_section(lines: list[str]) -> str:
    while lines and lines[0] == "":
        lines = lines[1:]
    while lines and lines[-1] == "":
        lines = lines[:-1]
    return "\n".join(lines)


def _trim_slide_region(lines: list[str]) -> list[str]:
    result = list(lines)
    while result and result[-1] == "":
        result.pop()
    if result and result[-1] == "---":
        result.pop()
    while result and result[-1] == "":
        result.pop()
    return result


def parse_plan_text(text: str, source_plan_path: str, *, allow_missing_ids: bool = False) -> dict[str, Any]:
    lines = text.split("\n")
    diagnostics: list[dict[str, Any]] = []
    slide_starts = [index for index, line in enumerate(lines) if SLIDE_RE.fullmatch(line)]
    malformed_slide_headings = [
        index + 1 for index, line in enumerate(lines) if line.startswith("## Slide") and not SLIDE_RE.fullmatch(line)
    ]
    for line_number in malformed_slide_headings:
        diagnostics.append(
            diagnostic(
                "SLIDE_HEADING_INVALID",
                "Slide headings must use exact '## Slide NN: title' syntax",
                line=line_number,
            )
        )
    if not slide_starts:
        diagnostics.append(diagnostic("SLIDES_MISSING", "No exact '## Slide NN: title' sections were found"))
    preamble_end = slide_starts[0] if slide_starts else len(lines)
    preamble = lines[:preamble_end]

    deck_titles = [(index, match.group("title")) for index, line in enumerate(preamble) if (match := DECK_TITLE_RE.fullmatch(line))]
    if len(deck_titles) != 1:
        diagnostics.append(diagnostic("DECK_TITLE_INVALID", "Exactly one exact deck title header is required"))

    metadata: dict[str, Any] = {}
    for key, pattern in HEADER_FIELDS.items():
        matches = [match.group("value") for line in preamble if (match := pattern.fullmatch(line))]
        if len(matches) != 1:
            diagnostics.append(
                diagnostic("HEADER_FIELD_INVALID", f"Exactly one exact header field is required: {key}", field=key)
            )
        else:
            metadata[key] = int(matches[0]) if key == "declared_slide_count" else matches[0]

    slides: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    missing_id_ordinals: list[int] = []
    ordinals: list[int] = []
    for position, start in enumerate(slide_starts):
        heading = SLIDE_RE.fullmatch(lines[start])
        assert heading is not None
        ordinal = int(heading.group("ordinal"))
        title = heading.group("title")
        ordinals.append(ordinal)
        end = slide_starts[position + 1] if position + 1 < len(slide_starts) else len(lines)
        region = _trim_slide_region(lines[start + 1 : end])

        id_lines = [(index, line) for index, line in enumerate(region) if SLIDE_ID_PREFIX_RE.match(line)]
        slide_id: str | None = None
        if len(id_lines) == 0:
            missing_id_ordinals.append(ordinal)
            if not allow_missing_ids:
                diagnostics.append(
                    diagnostic("NEEDS_STABLE_IDS", "Slide is missing a stable slide-id comment", slide_ordinal=ordinal)
                )
        elif len(id_lines) > 1:
            diagnostics.append(
                diagnostic("DUPLICATE_SLIDE_ID_COMMENT", "Slide contains more than one slide-id comment", slide_ordinal=ordinal)
            )
        else:
            match = SLIDE_ID_RE.fullmatch(id_lines[0][1])
            if match is None:
                diagnostics.append(
                    diagnostic("INVALID_SLIDE_ID", "Slide ID must use exact lower-kebab syntax", slide_ordinal=ordinal)
                )
            else:
                slide_id = match.group("id")
                if slide_id in seen_ids:
                    diagnostics.append(
                        diagnostic("DUPLICATE_SLIDE_ID", "Slide ID must be unique", slide_ordinal=ordinal, slide_id=slide_id)
                    )
                seen_ids.add(slide_id)

        layout_indexes = [index for index, line in enumerate(region) if line == LAYOUT_HEADING]
        content_indexes = [index for index, line in enumerate(region) if line == CONTENT_HEADING]
        if len(layout_indexes) != 1:
            diagnostics.append(
                diagnostic("LAYOUT_SECTION_INVALID", "Slide must contain exactly one '### 1. Layout'", slide_ordinal=ordinal)
            )
        if len(content_indexes) != 1:
            diagnostics.append(
                diagnostic("CONTENT_SECTION_INVALID", "Slide must contain exactly one '### 2. Content'", slide_ordinal=ordinal)
            )
        if len(layout_indexes) == 1 and len(content_indexes) == 1 and layout_indexes[0] >= content_indexes[0]:
            diagnostics.append(
                diagnostic("SECTION_ORDER_INVALID", "Layout must precede Content", slide_ordinal=ordinal)
            )
        if len(id_lines) == 1 and len(layout_indexes) == 1 and id_lines[0][0] > layout_indexes[0]:
            diagnostics.append(
                diagnostic(
                    "SLIDE_ID_POSITION_INVALID",
                    "Slide ID comment must appear before the Layout section",
                    slide_ordinal=ordinal,
                )
            )

        layout = ""
        content = ""
        if len(layout_indexes) == 1 and len(content_indexes) == 1 and layout_indexes[0] < content_indexes[0]:
            layout = _trim_section(region[layout_indexes[0] + 1 : content_indexes[0]])
            content = _trim_section(region[content_indexes[0] + 1 :])
        slide = {
            "id": slide_id,
            "ordinal": ordinal,
            "title": title,
            "layout": layout,
            "content": content,
        }
        explicit_hints = {match.group("kind"): match.group("value") for match in HINT_RE.finditer(layout)}
        if explicit_hints:
            slide["hints"] = explicit_hints
        slides.append(slide)

    expected_ordinals = list(range(1, len(slides) + 1))
    if ordinals != expected_ordinals:
        diagnostics.append(
            diagnostic(
                "SLIDE_ORDINALS_INVALID",
                "Slide ordinals must be unique, continuous, ordered, and start at 01",
                actual=ordinals,
                expected=expected_ordinals,
            )
        )
    if "declared_slide_count" in metadata and metadata["declared_slide_count"] != len(slides):
        diagnostics.append(
            diagnostic(
                "SLIDE_COUNT_MISMATCH",
                "Declared slide count does not match parsed slide sections",
                declared=metadata["declared_slide_count"],
                actual=len(slides),
            )
        )

    if diagnostics:
        return {
            "status": "invalid",
            "source_plan_path": source_plan_path,
            "diagnostics": diagnostics,
            "missing_id_ordinals": missing_id_ordinals,
        }

    for slide in slides:
        slide["sha256"] = sha256_bytes(
            canonical_json_bytes(
                {
                    "id": slide["id"],
                    "ordinal": slide["ordinal"],
                    "title": slide["title"],
                    "layout": slide["layout"],
                    "content": slide["content"],
                }
            )
        )
    return {
        "status": "valid",
        "deck_title": deck_titles[0][1],
        "metadata": metadata,
        "slides": slides,
        "missing_id_ordinals": missing_id_ordinals,
    }


def build_outline(text: str, normalized: bytes, source_plan_path: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    parsed = parse_plan_text(text, source_plan_path)
    if parsed["status"] != "valid":
        return None, parsed["diagnostics"]
    metadata = parsed["metadata"]
    outline = {
        "schema_version": SCHEMA_VERSION,
        "generator_version": GENERATOR_VERSION,
        "source_plan_path": source_plan_path,
        "source_plan_sha256": sha256_bytes(normalized),
        "deck": {
            "plan_title": parsed["deck_title"],
            "topic": metadata["topic"],
            "declared_slide_count": metadata["declared_slide_count"],
            "expected_duration": metadata["expected_duration"],
            "overall_logic": metadata["overall_logic"],
        },
        "slides": parsed["slides"],
        "diagnostics": [],
    }
    return outline, []


def _initialize_missing_ids(path: Path, source_plan_path: str) -> dict[str, Any]:
    original = path.read_bytes()
    try:
        decoded = original.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        return {"status": "invalid", "diagnostics": [diagnostic("INVALID_UTF8", str(error))]}
    normalized_text = decoded.replace("\r\n", "\n")
    parsed = parse_plan_text(normalized_text, source_plan_path, allow_missing_ids=True)
    non_missing = [item for item in parsed.get("diagnostics", []) if item["code"] != "NEEDS_STABLE_IDS"]
    if non_missing:
        return {"status": "invalid", "diagnostics": non_missing}
    missing = set(parsed.get("missing_id_ordinals", []))
    if not missing:
        return {"status": "unchanged", "inserted_ids": []}

    lines = decoded.splitlines(keepends=True)
    existing_ids = {
        match.group("id")
        for line in lines
        if (match := SLIDE_ID_RE.fullmatch(line.rstrip("\r\n")))
    }
    insertions: list[tuple[int, str]] = []
    inserted: list[str] = []
    for index, line in enumerate(lines):
        match = SLIDE_RE.fullmatch(line.rstrip("\r\n"))
        if match is None or int(match.group("ordinal")) not in missing:
            continue
        base = f"slide-{int(match.group('ordinal')):02d}"
        candidate = base
        suffix = 2
        while candidate in existing_ids:
            candidate = f"{base}-{suffix}"
            suffix += 1
        existing_ids.add(candidate)
        line_ending = "\r\n" if line.endswith("\r\n") else "\n"
        insertions.append((index + 1, f"<!-- slide-id: {candidate} -->{line_ending}"))
        inserted.append(candidate)
    for index, value in reversed(insertions):
        lines.insert(index, value)
    encoded = "".join(lines).encode("utf-8")
    if original.startswith(b"\xef\xbb\xbf"):
        encoded = b"\xef\xbb\xbf" + encoded
    path.write_bytes(encoded)
    return {"status": "updated", "inserted_ids": inserted}


def compile_plan(
    plan_path: Path,
    output_path: Path,
    *,
    workspace_root: Path | None = None,
    initialize_ids: bool = False,
) -> dict[str, Any]:
    plan_path = plan_path.resolve()
    output_path = output_path.resolve()
    if workspace_root is not None:
        root = workspace_root.resolve()
        source_plan_path = relative_workspace_path(root, plan_path)
        relative_workspace_path(root, output_path)
    else:
        source_plan_path = plan_path.name
    if not plan_path.is_file():
        return {
            "status": "invalid",
            "diagnostics": [diagnostic("SOURCE_PLAN_MISSING", "Source plan does not exist", path=str(plan_path))],
        }
    migration: dict[str, Any] | None = None
    if initialize_ids:
        migration = _initialize_missing_ids(plan_path, source_plan_path)
        if migration["status"] == "invalid":
            return migration
    try:
        text, normalized = read_normalized_markdown(plan_path)
    except UnicodeDecodeError as error:
        return {"status": "invalid", "diagnostics": [diagnostic("INVALID_UTF8", str(error))]}
    outline, diagnostics = build_outline(text, normalized, source_plan_path)
    if outline is None:
        return {"status": "invalid", "diagnostics": diagnostics, "output_path": str(output_path)}
    write_json_atomic(output_path, outline)
    result: dict[str, Any] = {
        "status": "compiled",
        "source_plan_path": source_plan_path,
        "source_plan_sha256": outline["source_plan_sha256"],
        "output_path": str(output_path),
        "outline_sha256": sha256_bytes(canonical_json_bytes(outline)),
        "slide_count": len(outline["slides"]),
        "diagnostics": [],
    }
    if migration is not None:
        result["id_initialization"] = migration
    return result


def resolve_paths(args: argparse.Namespace) -> tuple[Path | None, Path, Path]:
    root_value = args.workspace or args.workspace_positional
    root = Path(root_value).resolve() if root_value else None
    workspace: dict[str, Any] = {}
    if root is not None:
        workspace = load_json(root / "workspace.json")
    configured = workspace.get("paths", {}) if isinstance(workspace, dict) else {}
    if args.plan:
        plan = contained_path(root, args.plan) if root else Path(args.plan).resolve()
    elif root:
        plan = contained_path(root, configured.get("plan", "per-slide-content-plan.md"))
    else:
        raise WorkspaceError("SOURCE_PLAN_MISSING", "Use --plan when no workspace is supplied")
    if args.output:
        output = contained_path(root, args.output) if root else Path(args.output).resolve()
    elif root:
        output = contained_path(root, configured.get("outline", "outline.json"))
    else:
        output = plan.with_name("outline.json")
    return root, plan, output


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace_positional", nargs="?", help="Workspace root")
    parser.add_argument("--workspace", help="Workspace root")
    parser.add_argument("--plan", help="Plan path (workspace-relative when a workspace is supplied)")
    parser.add_argument("--output", help="Outline path (workspace-relative when a workspace is supplied)")
    parser.add_argument("--initialize-ids", action="store_true", help="Insert only missing stable slide IDs before compiling")
    args = parser.parse_args(argv)
    try:
        root, plan, output = resolve_paths(args)
        result = compile_plan(plan, output, workspace_root=root, initialize_ids=args.initialize_ids)
    except WorkspaceError as error:
        result = {"status": "invalid", "diagnostics": [error.diagnostic()]}
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["status"] == "compiled" else 2


if __name__ == "__main__":
    sys.exit(main())
