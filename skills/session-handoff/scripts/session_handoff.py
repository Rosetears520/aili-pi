#!/usr/bin/env python3
"""Task-scoped immutable session handoff history using only the Python stdlib."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import unicodedata
import uuid
from typing import Any, Callable


SCHEMA_VERSION = "1.0"
MAX_SNAPSHOT_BYTES = 64 * 1024
MAX_FRONTMATTER_BYTES = 8 * 1024
SNAPSHOT_NAME = re.compile(r"^(\d{8}T\d{6}Z)--([a-z0-9]+(?:-[a-z0-9]+)*)(?:--(\d{2,}))?\.md$")
LANGUAGE = re.compile(r"^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$")
FRONTMATTER_FIELDS = (
    "schema_version",
    "snapshot_id",
    "task_root",
    "status",
    "created_at",
    "finalized_at",
    "language",
    "continues_from",
    "continues_from_sha256",
    "content_sha256",
)
CORE_SECTIONS = (
    "Goal",
    "Contract References",
    "Scope Boundary",
    "Completed/Pending/Blocked",
    "Evidence Anchors",
    "Decisions",
    "Open Questions/Risks",
    "Verification State",
    "Next Action",
    "Forbidden Actions",
    "Suggested Next-Session Prompt",
)
SPECIALIST_SECTIONS = (
    "Touched Files / Artifact References",
    "A33 Attachments / Owning-Repository Artifact Destinations",
    "Preserved Rollback Worktrees / Evidence References",
    "Subagent Activity",
    "Blocker / Stop Reason",
)
PLACEHOLDER = re.compile(r"\[(?:FILL|TODO|TBD)(?::[^\]]*)?\]|\b(?:TODO|TBD)\b", re.IGNORECASE)
FORBIDDEN_HEADING = re.compile(r"^##\s+(?:Raw Logs?|Full (?:File|Transcript)s?|Private Data)\s*$", re.IGNORECASE | re.MULTILINE)
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    re.compile(r"(?i)\b(?:api[_-]?key|access[_-]?token|password|passwd|secret|authorization|cookie)\s*[:=]\s*(?!(?:\[REDACTED\]|<REDACTED>|REDACTED)(?:[\s.,;:)]|$))[^\s`]{6,}"),
    re.compile(r"(?i)https?://[^/\s:@]+:[^@\s/]+@"),
)
BACKTICK_ABSOLUTE_PATH = re.compile(r"`(/[^`\n]+)`")
FORBIDDEN_ACTIONS_TEXT = "Do not infer contract, permission, Git truth, verification, completion, publication, or destructive authority from this handoff."


class HandoffError(ValueError):
    pass


class HandoffResolveError(HandoffError):
    def __init__(self, message: str, candidates: list[str]) -> None:
        super().__init__(message)
        self.candidates = candidates


def normalize_slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")[:48].rstrip("-")
    return slug or "handoff"


def new_snapshot(
    repository_root: str | Path,
    task_root: str | Path,
    slug: str,
    *,
    language: str = "en",
    continues_from: str | Path | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    repository, task = _validated_roots(repository_root, task_root)
    if not LANGUAGE.fullmatch(language):
        raise HandoffError(f"invalid language tag: {language!r}")
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise HandoffError("new snapshot time must be timezone-aware")
    current = current.astimezone(timezone.utc)
    timestamp = current.strftime("%Y%m%dT%H%M%SZ")
    created_at = current.isoformat().replace("+00:00", "Z")
    safe_slug = normalize_slug(slug)
    history = _history_directory(task, create=continues_from is None)
    predecessor_path: str | None = None
    predecessor_digest: str | None = None
    if continues_from is not None:
        predecessor = _resolve_snapshot_path(repository, task, history, continues_from)
        loaded = _load_finalized_snapshot(repository, task, history, predecessor)
        predecessor_path = predecessor.relative_to(task).as_posix()
        predecessor_digest = loaded["sha256"]

    sequence = 1
    while True:
        suffix = "" if sequence == 1 else f"--{sequence:02d}"
        name = f"{timestamp}--{safe_slug}{suffix}.md"
        target = history / name
        snapshot_id = target.stem
        metadata = {
            "schema_version": SCHEMA_VERSION,
            "snapshot_id": snapshot_id,
            "task_root": _relative_task_root(repository, task),
            "status": "draft",
            "created_at": created_at,
            "finalized_at": None,
            "language": language,
            "continues_from": predecessor_path,
            "continues_from_sha256": predecessor_digest,
            "content_sha256": None,
        }
        body = _draft_body(snapshot_id, target.relative_to(repository).as_posix(), safe_slug, language)
        document = _render_document(metadata, body)
        try:
            descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            sequence += 1
            continue
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(document)
                handle.flush()
                os.fsync(handle.fileno())
        except Exception:
            target.unlink(missing_ok=True)
            raise
        return {
            "status": "draft",
            "snapshot_id": snapshot_id,
            "path": target.relative_to(repository).as_posix(),
            "task_path": target.relative_to(task).as_posix(),
            "continues_from": predecessor_path,
        }


def finalize_snapshot(
    repository_root: str | Path,
    task_root: str | Path,
    snapshot: str | Path,
    *,
    allowed_external_roots: tuple[str | Path, ...] = (),
    replace: Callable[[str | bytes | os.PathLike[str] | os.PathLike[bytes], str | bytes | os.PathLike[str] | os.PathLike[bytes]], None] = os.replace,
    now: datetime | None = None,
) -> dict[str, Any]:
    repository, task = _validated_roots(repository_root, task_root)
    history = _history_directory(task, create=False)
    target = _resolve_snapshot_path(repository, task, history, snapshot)
    text = _read_regular_text(target, MAX_SNAPSHOT_BYTES)
    metadata, body = _parse_document(text)
    _validate_snapshot_identity(repository, task, target, metadata)
    if metadata["status"] != "draft":
        raise HandoffError("only a draft snapshot can be finalized")
    _validate_body(
        body,
        repository,
        target,
        metadata,
        _validated_external_roots(allowed_external_roots),
    )
    _validate_predecessor(repository, task, history, metadata)
    _validate_existing_pointer(repository, task, history)

    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise HandoffError("finalization time must be timezone-aware")
    finalized_at = current.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if _parse_utc(finalized_at, "finalized_at") < _parse_utc(metadata["created_at"], "created_at"):
        raise HandoffError("snapshot finalized_at precedes created_at")
    finalized = dict(metadata)
    finalized["status"] = "finalized"
    finalized["finalized_at"] = finalized_at
    finalized["content_sha256"] = None
    canonical = _render_document(finalized, body)
    finalized["content_sha256"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    final_text = _render_document(finalized, body)
    if len(final_text.encode("utf-8")) > MAX_SNAPSHOT_BYTES:
        raise HandoffError(f"finalized snapshot exceeds {MAX_SNAPSHOT_BYTES} bytes")
    _atomic_write(target, final_text, replace=os.replace)
    snapshot_digest = hashlib.sha256(final_text.encode("utf-8")).hexdigest()

    pointer = history / "LATEST.md"
    pointer_text = _render_pointer(target.relative_to(task).as_posix(), finalized, snapshot_digest)
    try:
        _atomic_write(pointer, pointer_text, replace=replace)
    except Exception as exc:
        raise HandoffError(f"snapshot finalized but LATEST.md replacement failed: {exc}") from exc
    resolved = _resolve_pointer(repository, task, history)
    if resolved["sha256"] != snapshot_digest or resolved["path"] != target.relative_to(repository).as_posix():
        raise HandoffError("LATEST.md post-write verification failed")
    return {
        "status": "finalized",
        "snapshot_id": finalized["snapshot_id"],
        "path": target.relative_to(repository).as_posix(),
        "task_path": target.relative_to(task).as_posix(),
        "sha256": snapshot_digest,
        "finalized_at": finalized_at,
        "language": finalized["language"],
        "latest_path": pointer.relative_to(repository).as_posix(),
        "resume_prompt": build_resume_prompt(target.relative_to(repository).as_posix(), str(finalized["language"])),
    }


def list_history(repository_root: str | Path, task_root: str | Path) -> dict[str, Any]:
    repository, task = _validated_roots(repository_root, task_root)
    try:
        history = _history_directory(task, create=False)
    except HandoffError as exc:
        if "does not exist" in str(exc):
            return {"history": (task / "handoffs").relative_to(repository).as_posix(), "snapshots": [], "invalid": []}
        raise
    snapshots: list[dict[str, Any]] = []
    invalid: list[dict[str, str]] = []
    seen_ids: dict[str, str] = {}
    for entry in sorted(history.iterdir(), key=_history_entry_sort_key, reverse=True):
        if entry.name == "LATEST.md":
            continue
        if not SNAPSHOT_NAME.fullmatch(entry.name):
            invalid.append({"path": entry.relative_to(repository).as_posix(), "reason": "unrecognized history entry"})
            continue
        try:
            text = _read_regular_prefix(entry, MAX_FRONTMATTER_BYTES)
            metadata = _parse_frontmatter(text)
            _validate_snapshot_identity(repository, task, entry, metadata)
            row = {
                "path": entry.relative_to(repository).as_posix(),
                "task_path": entry.relative_to(task).as_posix(),
                "snapshot_id": metadata["snapshot_id"],
                "status": metadata["status"],
                "created_at": metadata["created_at"],
                "finalized_at": metadata["finalized_at"],
                "language": metadata["language"],
                "continues_from": metadata["continues_from"],
            }
            previous = seen_ids.get(str(metadata["snapshot_id"]))
            if previous:
                invalid.append({"path": row["path"], "reason": f"duplicate snapshot_id also used by {previous}"})
                continue
            seen_ids[str(metadata["snapshot_id"])] = row["path"]
            snapshots.append(row)
        except (HandoffError, OSError, UnicodeError, json.JSONDecodeError) as exc:
            invalid.append({"path": entry.relative_to(repository).as_posix(), "reason": str(exc)})
    return {"history": history.relative_to(repository).as_posix(), "snapshots": snapshots, "invalid": invalid}


def resolve_snapshot(
    repository_root: str | Path,
    task_root: str | Path,
    *,
    snapshot: str | Path | None = None,
    legacy: bool = False,
) -> dict[str, Any]:
    repository, task = _validated_roots(repository_root, task_root)
    if legacy:
        if snapshot is not None:
            raise HandoffError("legacy and exact snapshot selection are mutually exclusive")
        target = task / "handoff.md"
        text = _read_regular_text(target, MAX_SNAPSHOT_BYTES)
        return {
            "status": "legacy",
            "legacy": True,
            "path": target.relative_to(repository).as_posix(),
            "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "content": text,
            "authority": "navigation-only; revalidate all current state",
        }
    history = _history_directory(task, create=False)
    if snapshot is not None:
        target = _resolve_snapshot_path(repository, task, history, snapshot)
        loaded = _load_finalized_snapshot(repository, task, history, target)
        return {**loaded, "resolution": "exact", "legacy": False}
    try:
        return {**_resolve_pointer(repository, task, history), "resolution": "latest", "legacy": False}
    except HandoffError as exc:
        inventory = list_history(repository, task)
        candidates = [
            str(row["path"])
            for row in inventory["snapshots"]
            if row.get("status") == "finalized"
        ][:10]
        raise HandoffResolveError(str(exc), candidates) from exc


def build_resume_prompt(snapshot_path: str, language: str) -> str:
    if language.lower().startswith("zh"):
        return (
            f"从精确的不可变 handoff 快照 `{snapshot_path}` 恢复。它只用于导航，不是合同、权限、Git 真相、验证或完成证据。"
            "先重新验证当前 repository root、worktree、branch/HEAD、dirty 状态、权限、合同、附件和引用证据，并简要重述当前 scope；"
            "遇到冲突或 Unverified 项立即停止受影响工作，然后只从快照的 Next Action 继续。"
        )
    return (
        f"Resume from the exact immutable handoff snapshot `{snapshot_path}`. Treat it as navigation only, not contract, permission, Git truth, verification, or completion evidence. "
        "First revalidate the current repository root, worktree, branch/HEAD, dirty state, permissions, contracts, attachments, and referenced evidence, and restate the current scope concisely. "
        "Stop affected work on any conflict or Unverified item, then continue only from the snapshot's Next Action."
    )


def format_create_success(snapshot_path: str, language: str) -> str:
    path = Path(snapshot_path)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts) or "`" in snapshot_path or "\n" in snapshot_path:
        raise HandoffError("successful CREATE output requires one normalized repository-relative snapshot path")
    prompt = build_resume_prompt(path.as_posix(), language)
    if language.lower().startswith("zh"):
        lead = f"[工具结果] 已最终化 handoff 快照：`{path.as_posix()}`。"
    else:
        lead = f"[COMPUTED] Finalized handoff snapshot: `{path.as_posix()}`."
    return f"{lead}\n\n```text\n{prompt}\n```"


def _validated_roots(repository_root: str | Path, task_root: str | Path) -> tuple[Path, Path]:
    repository = _canonical_directory(repository_root, "repository root")
    task = _canonical_directory(task_root, "task root")
    if task != repository and repository not in task.parents:
        raise HandoffError(f"task root is outside repository root: {task}")
    _assert_no_symlink_below(repository, task)
    return repository, task


def _relative_task_root(repository: Path, task: Path) -> str:
    relative = task.relative_to(repository).as_posix()
    return relative or "."


def _validated_external_roots(values: tuple[str | Path, ...]) -> tuple[Path, ...]:
    roots: list[Path] = []
    for index, value in enumerate(values):
        root = _canonical_directory(value, f"allowed external root {index + 1}")
        if root not in roots:
            roots.append(root)
    return tuple(roots)


def _canonical_directory(value: str | Path, label: str) -> Path:
    raw = Path(value)
    if not raw.is_absolute():
        raise HandoffError(f"{label} must be an absolute canonical path")
    lexical = Path(os.path.abspath(os.fspath(raw)))
    try:
        canonical = raw.resolve(strict=True)
    except OSError as exc:
        raise HandoffError(f"{label} does not exist: {raw}") from exc
    if lexical != canonical or not canonical.is_dir():
        raise HandoffError(f"{label} is ambiguous, symlinked, or not a directory: {raw}")
    return canonical


def _assert_no_symlink_below(parent: Path, target: Path) -> None:
    relative = target.relative_to(parent)
    current = parent
    for part in relative.parts:
        current = current / part
        if stat.S_ISLNK(current.lstat().st_mode):
            raise HandoffError(f"symlinked task-root component is forbidden: {current}")


def _history_directory(task: Path, *, create: bool) -> Path:
    history = task / "handoffs"
    if create:
        try:
            history.mkdir(mode=0o700)
        except FileExistsError:
            pass
    try:
        mode = history.lstat().st_mode
    except FileNotFoundError as exc:
        raise HandoffError(f"handoff history does not exist: {history}") from exc
    if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
        raise HandoffError(f"handoff history is not a regular directory: {history}")
    return history


def _history_entry_sort_key(path: Path) -> tuple[int, str, int, str]:
    match = SNAPSHOT_NAME.fullmatch(path.name)
    if match is None:
        return (0, "", 0, path.name)
    sequence = int(match.group(3)) if match.group(3) is not None else 1
    return (1, match.group(1), sequence, path.name)


def _resolve_snapshot_path(repository: Path, task: Path, history: Path, value: str | Path) -> Path:
    raw = Path(value)
    if any(part in {".", ".."} for part in raw.parts):
        raise HandoffError(f"snapshot path is not normalized: {value}")
    if raw.is_absolute():
        candidates = [Path(os.path.abspath(os.fspath(raw)))]
    else:
        candidates = [repository / raw, task / raw]
    matches: list[Path] = []
    for candidate in candidates:
        if candidate.parent == history and SNAPSHOT_NAME.fullmatch(candidate.name) and candidate not in matches:
            matches.append(candidate)
    if len(matches) != 1:
        raise HandoffError(f"snapshot must be one exact file directly under {history}: {value}")
    candidate = matches[0]
    try:
        mode = candidate.lstat().st_mode
    except FileNotFoundError as exc:
        raise HandoffError(f"snapshot does not exist: {candidate}") from exc
    if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
        raise HandoffError(f"snapshot is not a regular non-symlink file: {candidate}")
    return candidate


def _draft_body(snapshot_id: str, repository_path: str, slug: str, language: str) -> str:
    prompt = build_resume_prompt(repository_path, language)
    fill = {
        "Goal": "[FILL: concise goal]",
        "Contract References": "[FILL: paths and accepted decisions only]",
        "Scope Boundary": "[FILL: in-scope and out-of-scope boundary]",
        "Completed/Pending/Blocked": "[FILL: bounded status]",
        "Evidence Anchors": "[FILL: compact reproducible anchors]",
        "Decisions": "[FILL: accepted decisions and sources]",
        "Open Questions/Risks": "[FILL: Open Question / Unverified items or None]",
        "Verification State": "[FILL: fresh, stale, skipped, or unavailable checks]",
        "Next Action": "[FILL: one exact next action]",
        "Forbidden Actions": FORBIDDEN_ACTIONS_TEXT,
        "Suggested Next-Session Prompt": prompt,
    }
    sections = "\n\n".join(f"## {name}\n\n{fill[name]}" for name in CORE_SECTIONS)
    return f"# Session Handoff: {slug}\n\nSnapshot ID: `{snapshot_id}`\n\n{sections}\n"


def _render_document(metadata: dict[str, Any], body: str) -> str:
    lines = ["---"]
    for field in FRONTMATTER_FIELDS:
        lines.append(f"{field}: {json.dumps(metadata.get(field), ensure_ascii=False, separators=(',', ':'))}")
    lines.extend(["---", body.rstrip(), ""])
    return "\n".join(lines)


def _parse_document(text: str) -> tuple[dict[str, Any], str]:
    metadata = _parse_frontmatter(text)
    closing = text.find("\n---\n", 4)
    if closing < 0:
        raise HandoffError("snapshot frontmatter closing delimiter is missing")
    return metadata, text[closing + 5 :]


def _parse_frontmatter(text: str) -> dict[str, Any]:
    if not text.startswith("---\n"):
        raise HandoffError("snapshot frontmatter opening delimiter is missing")
    closing = text.find("\n---\n", 4)
    if closing < 0 or closing > MAX_FRONTMATTER_BYTES:
        raise HandoffError("snapshot frontmatter is missing or exceeds the bounded limit")
    values: dict[str, Any] = {}
    for line in text[4:closing].splitlines():
        if ": " not in line:
            raise HandoffError(f"invalid frontmatter line: {line!r}")
        key, encoded = line.split(": ", 1)
        if key in values:
            raise HandoffError(f"duplicate frontmatter field: {key}")
        try:
            values[key] = json.loads(encoded)
        except json.JSONDecodeError as exc:
            raise HandoffError(f"invalid frontmatter value for {key}") from exc
    if tuple(values) != FRONTMATTER_FIELDS:
        raise HandoffError("snapshot frontmatter fields/order differ from the exact envelope")
    if values["schema_version"] != SCHEMA_VERSION:
        raise HandoffError("unsupported snapshot schema_version")
    if not isinstance(values["status"], str) or values["status"] not in {"draft", "finalized"}:
        raise HandoffError("snapshot status must be draft or finalized")
    if not isinstance(values["snapshot_id"], str):
        raise HandoffError("snapshot_id is invalid")
    task_root = values["task_root"]
    if not isinstance(task_root, str) or not task_root or Path(task_root).is_absolute() or any(part in {"", ".."} for part in Path(task_root).parts):
        raise HandoffError("snapshot task_root reference is invalid")
    if not isinstance(values["language"], str) or not LANGUAGE.fullmatch(values["language"]):
        raise HandoffError("snapshot language is invalid")
    _parse_utc(values["created_at"], "created_at")
    if values["status"] == "draft":
        if values["finalized_at"] is not None or values["content_sha256"] is not None:
            raise HandoffError("draft snapshot cannot carry finalization fields")
    else:
        _parse_utc(values["finalized_at"], "finalized_at")
        if not isinstance(values["content_sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", values["content_sha256"]):
            raise HandoffError("finalized snapshot content_sha256 is invalid")
    predecessor = values["continues_from"]
    predecessor_digest = values["continues_from_sha256"]
    if (predecessor is None) != (predecessor_digest is None):
        raise HandoffError("continues_from and its SHA-256 must be present together")
    if predecessor is not None and (
        not isinstance(predecessor, str)
        or not isinstance(predecessor_digest, str)
        or not re.fullmatch(r"[0-9a-f]{64}", predecessor_digest)
    ):
        raise HandoffError("continues_from metadata is invalid")
    return values


def _parse_utc(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise HandoffError(f"snapshot {field} is invalid")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise HandoffError(f"snapshot {field} is invalid") from exc
    if parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise HandoffError(f"snapshot {field} is not UTC")
    return parsed


def _validate_snapshot_identity(repository: Path, task: Path, path: Path, metadata: dict[str, Any]) -> None:
    match = SNAPSHOT_NAME.fullmatch(path.name)
    if not match:
        raise HandoffError(f"invalid snapshot filename: {path.name}")
    if metadata.get("snapshot_id") != path.stem:
        raise HandoffError("snapshot_id does not match filename")
    if metadata.get("task_root") != _relative_task_root(repository, task):
        raise HandoffError("snapshot task_root does not match the current task root")
    created_at = _parse_utc(metadata.get("created_at"), "created_at")
    if created_at.strftime("%Y%m%dT%H%M%SZ") != match.group(1):
        raise HandoffError("snapshot created_at does not match filename")
    if metadata["status"] == "finalized":
        finalized_at = _parse_utc(metadata.get("finalized_at"), "finalized_at")
        if finalized_at < created_at:
            raise HandoffError("snapshot finalized_at precedes created_at")


def _validate_body(
    body: str,
    repository: Path,
    target: Path,
    metadata: dict[str, Any],
    allowed_external_roots: tuple[Path, ...],
) -> None:
    if PLACEHOLDER.search(body):
        raise HandoffError("snapshot contains an unresolved placeholder")
    if FORBIDDEN_HEADING.search(body):
        raise HandoffError("snapshot contains a forbidden raw/full/private section")
    for pattern in SECRET_PATTERNS:
        if pattern.search(body):
            raise HandoffError("snapshot contains secret-like material")
    headings = re.findall(r"^##\s+(.+?)\s*$", body, re.MULTILINE)
    allowed_headings = set(CORE_SECTIONS) | set(SPECIALIST_SECTIONS)
    unknown = [heading for heading in headings if heading not in allowed_headings]
    if unknown:
        raise HandoffError(f"snapshot contains unknown recovery section: {unknown[0]}")
    for section in CORE_SECTIONS:
        if headings.count(section) != 1:
            raise HandoffError(f"snapshot must contain exactly one core section: {section}")
        if not _section_content(body, section):
            raise HandoffError(f"snapshot core section is empty: {section}")
    for section in SPECIALIST_SECTIONS:
        if headings.count(section) > 1:
            raise HandoffError(f"snapshot specialist section is duplicated: {section}")
        if headings.count(section) == 1 and not _section_content(body, section):
            raise HandoffError(f"snapshot specialist section is empty: {section}")
    expected_prompt = build_resume_prompt(target.relative_to(repository).as_posix(), str(metadata["language"]))
    if _section_content(body, "Forbidden Actions") != FORBIDDEN_ACTIONS_TEXT:
        raise HandoffError("snapshot Forbidden Actions differs from the fixed non-authority boundary")
    if _section_content(body, "Suggested Next-Session Prompt") != expected_prompt:
        raise HandoffError("snapshot Suggested Next-Session Prompt differs from the fixed exact-path recovery prompt")
    for fenced in re.findall(r"```[^\n]*\n(.*?)```", body, re.DOTALL):
        if len(fenced.splitlines()) > 40:
            raise HandoffError("snapshot contains an oversized code/log/file block")
    roots = (repository, *allowed_external_roots)
    for match in BACKTICK_ABSOLUTE_PATH.finditer(body):
        candidate = Path(os.path.abspath(match.group(1)))
        if not any(candidate == root or root in candidate.parents for root in roots):
            raise HandoffError(f"snapshot references an unapproved external path: {candidate}")


def _section_content(body: str, section: str) -> str:
    match = re.search(rf"^##\s+{re.escape(section)}\s*$\n(.*?)(?=^##\s+|\Z)", body, re.MULTILINE | re.DOTALL)
    return match.group(1).strip() if match else ""


def _validate_predecessor(repository: Path, task: Path, history: Path, metadata: dict[str, Any]) -> None:
    predecessor = metadata.get("continues_from")
    predecessor_digest = metadata.get("continues_from_sha256")
    if predecessor is None and predecessor_digest is None:
        return
    if not isinstance(predecessor, str) or not isinstance(predecessor_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", predecessor_digest):
        raise HandoffError("continues_from and its SHA-256 must be present together")
    path = _resolve_snapshot_path(repository, task, history, predecessor)
    loaded = _load_finalized_snapshot(repository, task, history, path)
    if loaded["sha256"] != predecessor_digest:
        raise HandoffError("continues_from snapshot digest changed")


def _load_finalized_snapshot(repository: Path, task: Path, history: Path, path: Path) -> dict[str, Any]:
    text = _read_regular_text(path, MAX_SNAPSHOT_BYTES)
    metadata, body = _parse_document(text)
    _validate_snapshot_identity(repository, task, path, metadata)
    if metadata["status"] != "finalized":
        raise HandoffError(f"snapshot is not finalized: {path}")
    _validate_content_digest(metadata, body)
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return {
        "status": "finalized",
        "path": path.relative_to(repository).as_posix(),
        "task_path": path.relative_to(task).as_posix(),
        "snapshot_id": metadata["snapshot_id"],
        "sha256": digest,
        "finalized_at": metadata["finalized_at"],
        "language": metadata["language"],
        "continues_from": metadata["continues_from"],
        "content": text,
        "authority": "navigation-only; revalidate all current state",
    }


def _validate_content_digest(metadata: dict[str, Any], body: str) -> None:
    expected = metadata.get("content_sha256")
    if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise HandoffError("finalized snapshot content_sha256 is invalid")
    canonical_metadata = dict(metadata)
    canonical_metadata["content_sha256"] = None
    actual = hashlib.sha256(_render_document(canonical_metadata, body).encode("utf-8")).hexdigest()
    if actual != expected:
        raise HandoffError("finalized snapshot SHA-256 mismatch")


def _validate_existing_pointer(repository: Path, task: Path, history: Path) -> None:
    pointer = history / "LATEST.md"
    if pointer.exists() or pointer.is_symlink():
        _resolve_pointer(repository, task, history)


def _render_pointer(snapshot_path: str, metadata: dict[str, Any], digest: str) -> str:
    return (
        "# Latest Session Handoff\n\n"
        f"snapshot_path: `{snapshot_path}`\n"
        f"snapshot_id: `{metadata['snapshot_id']}`\n"
        f"sha256: `{digest}`\n"
        f"finalized_at: `{metadata['finalized_at']}`\n"
    )


def _resolve_pointer(repository: Path, task: Path, history: Path) -> dict[str, Any]:
    pointer = history / "LATEST.md"
    text = _read_regular_text(pointer, MAX_FRONTMATTER_BYTES)
    match = re.fullmatch(
        r"# Latest Session Handoff\n\n"
        r"snapshot_path: `([^`]+)`\n"
        r"snapshot_id: `([^`]+)`\n"
        r"sha256: `([0-9a-f]{64})`\n"
        r"finalized_at: `([^`]+)`\n",
        text,
    )
    if match is None:
        raise HandoffError("LATEST.md is malformed")
    snapshot_path, snapshot_id, expected_digest, finalized_at = match.groups()
    target = _resolve_snapshot_path(repository, task, history, snapshot_path)
    loaded = _load_finalized_snapshot(repository, task, history, target)
    if loaded["snapshot_id"] != snapshot_id or loaded["sha256"] != expected_digest or loaded["finalized_at"] != finalized_at:
        raise HandoffError("LATEST.md target metadata or digest mismatch")
    return {**loaded, "latest_path": pointer.relative_to(repository).as_posix()}


def _read_regular_text(path: Path, limit: int) -> str:
    mode = path.lstat().st_mode
    if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
        raise HandoffError(f"path is not a regular non-symlink file: {path}")
    if path.stat().st_size > limit:
        raise HandoffError(f"file exceeds {limit} bytes: {path}")
    return path.read_text(encoding="utf-8")


def _read_regular_prefix(path: Path, limit: int) -> str:
    mode = path.lstat().st_mode
    if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
        raise HandoffError(f"path is not a regular non-symlink file: {path}")
    with path.open("rb") as handle:
        prefix = handle.read(limit + 1)
    closing = prefix.find(b"\n---\n", 4)
    if closing < 0 or closing > limit:
        raise HandoffError("snapshot frontmatter is missing or exceeds the bounded limit")
    return prefix[: closing + 5].decode("utf-8")


def _atomic_write(path: Path, text: str, *, replace: Callable[..., None]) -> None:
    if path.exists() or path.is_symlink():
        mode = path.lstat().st_mode
        if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
            raise HandoffError(f"atomic target is not a regular non-symlink file: {path}")
    temporary = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        replace(temporary, path)
        try:
            directory = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        except OSError:
            pass
    finally:
        temporary.unlink(missing_ok=True)


def _command_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="operation", required=True)
    for name in ("new", "finalize", "list", "resolve"):
        command = subparsers.add_parser(name)
        command.add_argument("--repository-root", required=True)
        command.add_argument("--task-root", required=True)
    create = subparsers.choices["new"]
    create.add_argument("--slug", required=True)
    create.add_argument("--language", default="en")
    create.add_argument("--continues-from")
    finalize = subparsers.choices["finalize"]
    finalize.add_argument("--snapshot", required=True)
    finalize.add_argument("--allowed-external-root", action="append", default=[])
    finalize.add_argument("--user-output", action="store_true")
    resolve = subparsers.choices["resolve"]
    selection = resolve.add_mutually_exclusive_group()
    selection.add_argument("--snapshot")
    selection.add_argument("--legacy", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _command_parser()
    args = parser.parse_args(argv)
    try:
        if args.operation == "new":
            result = new_snapshot(args.repository_root, args.task_root, args.slug, language=args.language, continues_from=args.continues_from)
        elif args.operation == "finalize":
            result = finalize_snapshot(args.repository_root, args.task_root, args.snapshot, allowed_external_roots=tuple(args.allowed_external_root))
        elif args.operation == "list":
            result = list_history(args.repository_root, args.task_root)
        else:
            result = resolve_snapshot(args.repository_root, args.task_root, snapshot=args.snapshot, legacy=args.legacy)
    except (HandoffError, OSError, UnicodeError, json.JSONDecodeError) as exc:
        error = {"status": "blocked", "error": str(exc)}
        if isinstance(exc, HandoffResolveError):
            error["recoverable_candidates"] = exc.candidates
        print(json.dumps(error, ensure_ascii=False))
        return 5
    if args.operation == "finalize" and args.user_output:
        print(format_create_success(str(result["path"]), str(result["language"])))
        return 0
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
