#!/usr/bin/env python3
"""Set DrawingML shape-to-fit-text on editable text shapes and emit evidence."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from workspace_core import WorkspaceError, sha256_file, write_json_atomic


A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
NS = {"a": A_NS, "p": P_NS}
ET.register_namespace("a", A_NS)
ET.register_namespace("p", P_NS)


def _mode(body_properties: ET.Element) -> str:
    if body_properties.find("a:spAutoFit", NS) is not None:
        return "shape-to-fit-text"
    if body_properties.find("a:normAutofit", NS) is not None:
        return "shrink-text-on-overflow"
    return "do-not-autofit"


def _bounds(shape: ET.Element) -> dict[str, int | None]:
    transform = shape.find(".//a:xfrm", NS)
    offset = transform.find("a:off", NS) if transform is not None else None
    extent = transform.find("a:ext", NS) if transform is not None else None
    def value(node: ET.Element | None, name: str) -> int | None:
        raw = node.get(name) if node is not None else None
        return int(raw) if raw and re.fullmatch(r"-?\d+", raw) else None
    return {"x": value(offset, "x"), "y": value(offset, "y"), "w": value(extent, "cx"), "h": value(extent, "cy")}


def apply_shape_to_fit_text(source: Path, output: Path) -> dict[str, Any]:
    source = source.resolve()
    output = output.resolve()
    if not zipfile.is_zipfile(source):
        raise WorkspaceError("AUTOFIT_INPUT_INVALID", "AutoFit input must be a PPTX ZIP package", path=str(source))
    records: list[dict[str, Any]] = []
    blockers: list[dict[str, str]] = []
    with zipfile.ZipFile(source, "r") as input_archive, tempfile.TemporaryDirectory() as temporary:
        staged = Path(temporary) / "autofit.pptx"
        with zipfile.ZipFile(staged, "w") as output_archive:
            for info in input_archive.infolist():
                payload = input_archive.read(info.filename)
                if re.fullmatch(r"ppt/slides/slide\d+\.xml", info.filename):
                    root = ET.fromstring(payload)
                    slide_number = int(re.search(r"(\d+)", Path(info.filename).stem).group(1))
                    for shape in root.findall(".//p:sp", NS):
                        text_body = shape.find("p:txBody", NS)
                        if text_body is None or not "".join(text_body.itertext()).strip():
                            continue
                        metadata = shape.find(".//p:cNvPr", NS)
                        shape_id = metadata.get("id", "unknown") if metadata is not None else "unknown"
                        locks = shape.find(".//p:cNvSpPr/a:spLocks", NS)
                        if locks is not None and locks.get("noTextEdit") in {"1", "true"}:
                            blockers.append({"code": "AUTOFIT_LOCKED_OBJECT", "slide_id": f"slide-{slide_number:02d}", "shape_id": shape_id})
                            continue
                        body_properties = text_body.find("a:bodyPr", NS)
                        if body_properties is None:
                            blockers.append({"code": "AUTOFIT_UNSUPPORTED_OBJECT", "slide_id": f"slide-{slide_number:02d}", "shape_id": shape_id})
                            continue
                        before = _mode(body_properties)
                        for child_name in ("spAutoFit", "normAutofit", "noAutofit"):
                            child = body_properties.find(f"a:{child_name}", NS)
                            if child is not None:
                                body_properties.remove(child)
                        body_properties.append(ET.Element(f"{{{A_NS}}}spAutoFit"))
                        records.append(
                            {
                                "slide_id": f"slide-{slide_number:02d}",
                                "shape_id": shape_id,
                                "editable": True,
                                "supported": True,
                                "before_mode": before,
                                "after_mode": "shape-to-fit-text",
                                "geometry_before": _bounds(shape),
                                "geometry_after": _bounds(shape),
                                "geometry_recalculated": False,
                            }
                        )
                    for frame in root.findall(".//p:graphicFrame", NS):
                        if not "".join(frame.itertext()).strip():
                            continue
                        metadata = frame.find(".//p:cNvPr", NS)
                        blockers.append(
                            {
                                "code": "AUTOFIT_UNSUPPORTED_OBJECT",
                                "slide_id": f"slide-{slide_number:02d}",
                                "shape_id": metadata.get("id", "unknown") if metadata is not None else "unknown",
                            }
                        )
                    payload = ET.tostring(root, encoding="utf-8", xml_declaration=True)
                output_archive.writestr(info, payload)
        output.parent.mkdir(parents=True, exist_ok=True)
        os.replace(staged, output)
    return {
        "schema_version": "1.0",
        "report_kind": "autofit-evidence",
        "status": "blocked" if blockers else "applied-awaiting-geometry-recalculation",
        "source_pptx_sha256": sha256_file(source),
        "output_pptx_sha256": sha256_file(output),
        "text_fit_policy": "shape-to-fit-text",
        "shapes": records,
        "blockers": blockers,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("output")
    parser.add_argument("--evidence", required=True)
    args = parser.parse_args()
    try:
        source = Path(args.source)
        output = Path(args.output)
        if source.resolve() == output.resolve():
            with tempfile.TemporaryDirectory(dir=output.parent) as temporary:
                staged = Path(temporary) / output.name
                result = apply_shape_to_fit_text(source, staged)
                shutil.copy2(staged, output)
                result["output_pptx_sha256"] = sha256_file(output)
        else:
            result = apply_shape_to_fit_text(source, output)
        write_json_atomic(Path(args.evidence), result)
        code = 0 if result["status"] != "blocked" else 2
    except (OSError, ValueError, WorkspaceError, zipfile.BadZipFile) as error:
        result = {"status": "blocked", "error": {"code": getattr(error, "code", "AUTOFIT_BLOCKED"), "message": str(error)}}
        code = 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return code


if __name__ == "__main__":
    sys.exit(main())
