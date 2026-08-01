#!/usr/bin/env python3
"""Create a deterministic, run-level profile for a controlling PPTX template."""

from __future__ import annotations

import argparse
import collections
import json
import re
import sys
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from workspace_core import WorkspaceError, sha256_file, write_json_atomic


NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}
EMU_PER_POINT = 12700


def _xml(archive: zipfile.ZipFile, part: str) -> ET.Element | None:
    try:
        return ET.fromstring(archive.read(part))
    except KeyError:
        return None
    except ET.ParseError as error:
        raise WorkspaceError("TEMPLATE_XML_INVALID", f"Invalid XML part: {part}", path=part) from error


def _natural_part_key(value: str) -> tuple[Any, ...]:
    return tuple(int(item) if item.isdigit() else item for item in re.split(r"(\d+)", value))


def _color(node: ET.Element | None) -> str | None:
    if node is None:
        return None
    solid = node.find("a:solidFill", NS)
    if solid is None:
        return None
    rgb = solid.find("a:srgbClr", NS)
    if rgb is not None and rgb.get("val"):
        return rgb.get("val", "").upper()
    scheme = solid.find("a:schemeClr", NS)
    if scheme is not None and scheme.get("val"):
        return "theme:" + scheme.get("val", "")
    return None


def _font_face(properties: ET.Element | None) -> str | None:
    if properties is None:
        return None
    for tag in ("a:latin", "a:ea", "a:cs"):
        item = properties.find(tag, NS)
        if item is not None and item.get("typeface"):
            return item.get("typeface")
    return None


def _effective_face(value: str | None, theme: dict[str, Any]) -> str | None:
    if not value:
        return None
    mapping = {
        "+mj-lt": theme.get("major_latin"),
        "+mj-ea": theme.get("major_east_asian"),
        "+mn-lt": theme.get("minor_latin"),
        "+mn-ea": theme.get("minor_east_asian"),
    }
    return mapping.get(value) or value


def _text_properties(properties: ET.Element | None) -> dict[str, Any]:
    if properties is None:
        return {}
    result: dict[str, Any] = {}
    face = _font_face(properties)
    if face:
        result["font_family"] = face
    if properties.get("sz") and properties.get("sz", "").isdigit():
        result["font_size_pt"] = int(properties.get("sz", "0")) / 100
    boolean_attributes = {"b": "bold", "i": "italic"}
    for attribute, name in boolean_attributes.items():
        if properties.get(attribute) is not None:
            result[name] = properties.get(attribute) in {"1", "true"}
    if properties.get("lang"):
        result["language"] = properties.get("lang")
    if properties.get("spc") and re.fullmatch(r"-?\d+", properties.get("spc", "")):
        result["character_spacing"] = int(properties.get("spc", "0"))
    if properties.get("baseline") and re.fullmatch(r"-?\d+", properties.get("baseline", "")):
        result["baseline"] = int(properties.get("baseline", "0"))
    color = _color(properties)
    if color:
        result["color"] = color
    return result


def _theme(archive: zipfile.ZipFile) -> dict[str, Any]:
    names = sorted((name for name in archive.namelist() if re.fullmatch(r"ppt/theme/theme\d+\.xml", name)), key=_natural_part_key)
    if not names:
        return {}
    root = _xml(archive, names[0])
    if root is None:
        return {}
    major = root.find(".//a:themeElements/a:fontScheme/a:majorFont", NS)
    minor = root.find(".//a:themeElements/a:fontScheme/a:minorFont", NS)
    colors: dict[str, str] = {}
    scheme = root.find(".//a:themeElements/a:clrScheme", NS)
    if scheme is not None:
        for child in list(scheme):
            name = child.tag.rsplit("}", 1)[-1]
            value = None
            for item in list(child):
                value = item.get("lastClr") or item.get("val")
                if value:
                    break
            if value:
                colors[name] = value.upper()
    return {
        "source_part": names[0],
        "name": root.get("name"),
        "major_latin": _font_face(major),
        "major_east_asian": (major.find("a:ea", NS).get("typeface") if major is not None and major.find("a:ea", NS) is not None else None),
        "minor_latin": _font_face(minor),
        "minor_east_asian": (minor.find("a:ea", NS).get("typeface") if minor is not None and minor.find("a:ea", NS) is not None else None),
        "colors": colors,
    }


def _bounds(shape: ET.Element) -> dict[str, float | None]:
    transform = shape.find(".//a:xfrm", NS)
    if transform is None:
        return {"x_pt": None, "y_pt": None, "w_pt": None, "h_pt": None}
    offset = transform.find("a:off", NS)
    extent = transform.find("a:ext", NS)
    def point(node: ET.Element | None, attribute: str) -> float | None:
        if node is None or not node.get(attribute, "").isdigit():
            return None
        return round(int(node.get(attribute, "0")) / EMU_PER_POINT, 4)
    return {
        "x_pt": point(offset, "x"),
        "y_pt": point(offset, "y"),
        "w_pt": point(extent, "cx"),
        "h_pt": point(extent, "cy"),
    }


def _paragraphs(shape: ET.Element, slide_id: str, shape_id: str, theme: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for paragraph_index, paragraph in enumerate(shape.findall(".//a:p", NS), 1):
        ppr = paragraph.find("a:pPr", NS)
        default_run = ppr.find("a:defRPr", NS) if ppr is not None else None
        paragraph_properties = dict(sorted(ppr.attrib.items())) if ppr is not None else {}
        runs: list[dict[str, Any]] = []
        run_nodes = paragraph.findall("a:r", NS) + paragraph.findall("a:fld", NS)
        for run_index, run in enumerate(run_nodes, 1):
            rpr = run.find("a:rPr", NS)
            direct = _text_properties(rpr)
            inherited = _text_properties(default_run)
            effective = {**inherited, **direct}
            effective["font_family"] = _effective_face(effective.get("font_family"), theme)
            source = "direct" if direct else "paragraph-default" if inherited else "theme-or-placeholder"
            runs.append(
                {
                    "run_id": f"{slide_id}/{shape_id}/p{paragraph_index}/r{run_index}",
                    "text": "".join(item.text or "" for item in run.findall("a:t", NS)),
                    "raw": direct,
                    "inheritance_source": source,
                    "effective": effective,
                }
            )
        result.append(
            {
                "paragraph_id": f"{slide_id}/{shape_id}/p{paragraph_index}",
                "properties": paragraph_properties,
                "runs": runs,
            }
        )
    return result


def _relationship_target(archive: zipfile.ZipFile, slide_part: str, relationship_type: str) -> str | None:
    path = Path(slide_part)
    rels_part = (path.parent / "_rels" / f"{path.name}.rels").as_posix()
    root = _xml(archive, rels_part)
    if root is None:
        return None
    for relationship in root.findall("pr:Relationship", NS):
        if relationship.get("Type", "").endswith(relationship_type):
            return Path(relationship.get("Target", "")).name
    return None


def _slide_profile(archive: zipfile.ZipFile, part: str, theme: dict[str, Any]) -> dict[str, Any]:
    root = _xml(archive, part)
    if root is None:
        raise WorkspaceError("TEMPLATE_SLIDE_MISSING", "Slide XML is missing", path=part)
    slide_number = re.search(r"(\d+)", Path(part).stem)
    slide_id = f"slide-{int(slide_number.group(1)):02d}" if slide_number else Path(part).stem
    shapes: list[dict[str, Any]] = []
    for shape in root.findall(".//p:sp", NS) + root.findall(".//p:pic", NS):
        metadata = shape.find(".//p:cNvPr", NS)
        shape_id = metadata.get("id", str(len(shapes) + 1)) if metadata is not None else str(len(shapes) + 1)
        placeholder = shape.find(".//p:nvPr/p:ph", NS)
        geometry = shape.find(".//a:prstGeom", NS)
        picture = shape.tag.endswith("pic")
        shapes.append(
            {
                "shape_id": shape_id,
                "name": metadata.get("name", "") if metadata is not None else "",
                "kind": "picture" if picture else (geometry.get("prst", "shape") if geometry is not None else "shape"),
                "bounds": _bounds(shape),
                "placeholder": dict(sorted(placeholder.attrib.items())) if placeholder is not None else None,
                "image_frame": {"fit": "template-declared", "bounds": _bounds(shape)} if picture else None,
                "paragraphs": _paragraphs(shape, slide_id, shape_id, theme),
            }
        )
    return {
        "slide_id": slide_id,
        "source_part": part,
        "layout_id": _relationship_target(archive, part, "slideLayout"),
        "shapes": shapes,
    }


def profile_template(source: Path, *, source_label: str | None = None) -> dict[str, Any]:
    original = source
    source = source.resolve()
    if not source.is_file():
        raise WorkspaceError("CONTROLLING_TEMPLATE_MISSING", "Controlling template is missing", path=str(source))
    if not zipfile.is_zipfile(source):
        raise WorkspaceError("CONTROLLING_TEMPLATE_INVALID", "Controlling template is not a PPTX ZIP package", path=str(source))
    with zipfile.ZipFile(source) as archive:
        theme = _theme(archive)
        presentation = _xml(archive, "ppt/presentation.xml")
        slide_size: dict[str, Any] = {}
        if presentation is not None:
            size = presentation.find("p:sldSz", NS)
            if size is not None:
                slide_size = {
                    "cx": int(size.get("cx", "0")),
                    "cy": int(size.get("cy", "0")),
                    "type": size.get("type"),
                }
        slide_parts = sorted((name for name in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)), key=_natural_part_key)
        slides = [_slide_profile(archive, part, theme) for part in slide_parts]
        relevant_parts = [name for name in archive.namelist() if name.startswith("ppt/") and name.endswith(".xml")]
        palette = collections.Counter()
        for part in relevant_parts:
            root = _xml(archive, part)
            if root is None:
                continue
            for color in root.findall(".//a:srgbClr", NS):
                if color.get("val"):
                    palette[color.get("val", "").upper()] += 1
            for color in root.findall(".//a:schemeClr", NS):
                if color.get("val"):
                    palette["theme:" + color.get("val", "")] += 1
        families = collections.Counter()
        sizes = collections.Counter()
        for slide in slides:
            for shape in slide["shapes"]:
                for paragraph in shape["paragraphs"]:
                    for run in paragraph["runs"]:
                        effective = run["effective"]
                        if effective.get("font_family"):
                            families[str(effective["font_family"])] += 1
                        if effective.get("font_size_pt") is not None:
                            sizes[str(effective["font_size_pt"])] += 1
        return {
            "schema_version": "1.0",
            "report_kind": "template-profile",
            "status": "profiled",
            "source": {"path": source_label or original.as_posix(), "sha256": sha256_file(source)},
            "slide_size": slide_size,
            "theme": theme,
            "palette_usage": [{"value": key, "count": palette[key]} for key in sorted(palette)],
            "masters": [{"id": Path(part).stem, "source_part": part} for part in sorted((name for name in archive.namelist() if re.fullmatch(r"ppt/slideMasters/slideMaster\d+\.xml", name)), key=_natural_part_key)],
            "layouts": [{"id": Path(part).stem, "source_part": part} for part in sorted((name for name in archive.namelist() if re.fullmatch(r"ppt/slideLayouts/slideLayout\d+\.xml", name)), key=_natural_part_key)],
            "slides": slides,
            "typography_summary": {
                "families": [{"family": key, "count": families[key]} for key in sorted(families)],
                "sizes_pt": [{"size": key, "count": sizes[key]} for key in sorted(sizes, key=float)],
                "summary_overrides_run_formatting": False,
            },
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="Controlling PPTX path")
    parser.add_argument("--source-label", help="Workspace-relative source path recorded in the profile")
    parser.add_argument("--output", required=True, help="template-profile.json output path")
    args = parser.parse_args()
    try:
        result = profile_template(Path(args.source), source_label=args.source_label)
        write_json_atomic(Path(args.output), result)
        code = 0
    except (OSError, WorkspaceError, zipfile.BadZipFile) as error:
        result = {"status": "blocked", "error": {"code": getattr(error, "code", "TEMPLATE_PROFILE_BLOCKED"), "message": str(error)}}
        code = 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return code


if __name__ == "__main__":
    sys.exit(main())
