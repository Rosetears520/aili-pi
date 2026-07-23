#!/usr/bin/env python3
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable


SCHEMA_VERSION = 1
MIGRATION_NAME = "v1_initial_memory_schema"
DEFAULT_DB = "memory/memory.db"
DEFAULT_AGENT = "rose"
DEFAULT_TARGET = "AGENTS.md"

SIGNAL_WEIGHTS = {
    "long_term_instruction": 3,
    "correction_after_drift": 2,
    "review_rejection": 3,
    "ordinary_preference": 1,
    "evidence_backed_failure": 1,
    "risk_signal": 3,
    "user_confirmation": 5,
}

SEVERITY_RANK = {
    "low": 0,
    "normal": 1,
    "high": 2,
    "critical": 3,
}

REQUIRED_TABLES = {
    "schema_migration",
    "memory_receipt",
    "session",
    "task",
    "memory_event",
    "memory_fact",
    "claim",
    "finding",
    "evidence",
    "rule_candidate",
    "rule_candidate_evidence",
    "instruction_snapshot",
    "rule_patch",
    "rule_decision",
    "rule_promotion",
    "audit_run",
    "search_doc",
    "search_fts",
}


class CliError(Exception):
    def __init__(self, error_code: str, message: str, suggested_action: str = "") -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.suggested_action = suggested_action


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def project_default() -> str:
    return Path.cwd().name


def json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def emit(value: dict[str, Any], status: int = 0) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))
    raise SystemExit(status)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def file_hash(path: str) -> str:
    target = Path(path)
    if not target.exists():
        return sha256_text("")
    return hashlib.sha256(target.read_bytes()).hexdigest()


def read_text_if_exists(path: str) -> str:
    target = Path(path)
    if not target.exists():
        return ""
    return target.read_text(encoding="utf-8")


def write_text(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def normalize_rule_text(rule_text: str) -> str:
    normalized = re.sub(r"\s+", " ", rule_text.strip())
    if normalized.endswith("."):
        normalized = normalized[:-1]
    return normalized.lower()


def normalize_rule_key(rule_text: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", normalize_rule_text(rule_text))
    normalized = normalized.strip("_")
    return normalized[:80] or f"rule_{uuid.uuid4().hex[:12]}"


def query_tokens(raw_query: str) -> list[str]:
    tokens = re.findall(r"[A-Za-z0-9_]+", raw_query)
    if not tokens:
        raise CliError("INVALID_SEARCH_QUERY", "search query must contain at least one word token")
    return tokens


def safe_fts_query(raw_query: str) -> str:
    tokens = query_tokens(raw_query)
    return " OR ".join(f'"{token}"' for token in tokens)


def token_like_clause(columns: list[str], tokens: list[str]) -> tuple[str, list[str]]:
    clauses: list[str] = []
    values: list[str] = []
    for token in tokens:
        like_value = f"%{token}%"
        clauses.append("(" + " OR ".join(f"{column} LIKE ?" for column in columns) + ")")
        values.extend([like_value] * len(columns))
    return "(" + " OR ".join(clauses) + ")", values


def safe_metadata(raw: str | None) -> str:
    if not raw:
        return "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise CliError("INVALID_JSON", f"metadata_json is invalid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise CliError("INVALID_JSON", "metadata_json must be a JSON object")
    return json_dump(parsed)


def sensitive_indexable(sensitive: bool, indexable: bool) -> tuple[int, int]:
    if sensitive:
        return 1, 0
    return 0, 1 if indexable else 0


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def schema_sql() -> str:
    return """
CREATE TABLE IF NOT EXISTS schema_migration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  UNIQUE(version)
);

CREATE TABLE IF NOT EXISTS memory_receipt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_key TEXT NOT NULL UNIQUE,
  operation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok','error')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key TEXT NOT NULL UNIQUE,
  project TEXT NOT NULL,
  agent TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key TEXT NOT NULL UNIQUE,
  session_id INTEGER REFERENCES session(id) ON DELETE SET NULL,
  project TEXT NOT NULL,
  agent TEXT NOT NULL,
  title TEXT NOT NULL,
  scope_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active','blocked','completed','cancelled')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  outcome TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS memory_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES session(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES task(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  state TEXT,
  summary TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_fact (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES session(id) ON DELETE SET NULL,
  project TEXT NOT NULL,
  agent TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  fact_text TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','superseded','rejected','expired')),
  sensitive INTEGER NOT NULL DEFAULT 0 CHECK (sensitive IN (0,1)),
  indexable INTEGER NOT NULL DEFAULT 1 CHECK (indexable IN (0,1)),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  superseded_by INTEGER REFERENCES memory_fact(id),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(project, agent, fact_key)
);

CREATE TABLE IF NOT EXISTS claim (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES session(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES task(id) ON DELETE SET NULL,
  project TEXT NOT NULL,
  agent TEXT NOT NULL,
  claim_key TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  verification_status TEXT NOT NULL
    CHECK (verification_status IN ('unverified','verified','disputed','superseded')),
  evidence_summary TEXT NOT NULL DEFAULT '',
  sensitive INTEGER NOT NULL DEFAULT 0 CHECK (sensitive IN (0,1)),
  indexable INTEGER NOT NULL DEFAULT 1 CHECK (indexable IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(project, agent, claim_key)
);

CREATE TABLE IF NOT EXISTS finding (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES session(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES task(id) ON DELETE SET NULL,
  project TEXT NOT NULL,
  agent TEXT NOT NULL,
  kind TEXT NOT NULL
    CHECK (kind IN ('correction','failure','review_rejection','preference','risk','observation')),
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'normal'
    CHECK (severity IN ('low','normal','high','critical')),
  wrong_behavior TEXT NOT NULL DEFAULT '',
  correct_behavior TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  raw_ref TEXT NOT NULL DEFAULT '',
  sensitive INTEGER NOT NULL DEFAULT 0 CHECK (sensitive IN (0,1)),
  indexable INTEGER NOT NULL DEFAULT 1 CHECK (indexable IN (0,1)),
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES session(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES task(id) ON DELETE SET NULL,
  project TEXT NOT NULL,
  agent TEXT NOT NULL,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('finding','claim','memory_event','task','file','diff','test','user_confirmation')),
  source_id INTEGER,
  evidence_key TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight >= 0),
  sensitive INTEGER NOT NULL DEFAULT 0 CHECK (sensitive IN (0,1)),
  indexable INTEGER NOT NULL DEFAULT 1 CHECK (indexable IN (0,1)),
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(project, agent, evidence_key)
);

CREATE TABLE IF NOT EXISTS rule_candidate (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  agent TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  normalized_rule_hash TEXT NOT NULL,
  rule_text TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'normal'
    CHECK (severity IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'memory'
    CHECK (status IN (
      'memory',
      'candidate',
      'needs_reconciliation',
      'approved',
      'promoted',
      'rejected',
      'superseded',
      'expired'
    )),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  mention_count INTEGER NOT NULL DEFAULT 0 CHECK (mention_count >= 0),
  session_count INTEGER NOT NULL DEFAULT 0 CHECK (session_count >= 0),
  evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  promotion_target TEXT NOT NULL DEFAULT 'AGENTS.md',
  target_scope TEXT NOT NULL DEFAULT 'project_root_agents'
    CHECK (target_scope IN ('project_root_agents')),
  conflicts_json TEXT NOT NULL DEFAULT '[]',
  requires_user_approval INTEGER NOT NULL DEFAULT 1 CHECK (requires_user_approval IN (0,1)),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  approved_at TEXT,
  promoted_at TEXT,
  superseded_by INTEGER REFERENCES rule_candidate(id),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(project, agent, rule_key)
);

CREATE TABLE IF NOT EXISTS rule_candidate_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL REFERENCES rule_candidate(id) ON DELETE CASCADE,
  evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
  signal_type TEXT NOT NULL
    CHECK (signal_type IN (
      'long_term_instruction',
      'correction_after_drift',
      'review_rejection',
      'ordinary_preference',
      'evidence_backed_failure',
      'risk_signal',
      'user_confirmation'
    )),
  weight INTEGER NOT NULL CHECK (weight >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(rule_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS instruction_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_path TEXT NOT NULL,
  target_scope TEXT NOT NULL
    CHECK (target_scope IN ('project_root_agents')),
  hash_algorithm TEXT NOT NULL DEFAULT 'sha256',
  content_hash TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  captured_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS rule_patch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL REFERENCES rule_candidate(id) ON DELETE CASCADE,
  target_path TEXT NOT NULL DEFAULT 'AGENTS.md',
  target_scope TEXT NOT NULL DEFAULT 'project_root_agents'
    CHECK (target_scope IN ('project_root_agents')),
  base_snapshot_id INTEGER NOT NULL REFERENCES instruction_snapshot(id),
  base_hash TEXT NOT NULL,
  patch_hash TEXT NOT NULL,
  proposed_rule_hash TEXT NOT NULL,
  patch_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','approved','rejected','applied','stale','failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS rule_decision (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL REFERENCES rule_candidate(id) ON DELETE CASCADE,
  patch_id INTEGER NOT NULL REFERENCES rule_patch(id) ON DELETE CASCADE,
  decision TEXT NOT NULL
    CHECK (decision IN ('approved','rejected','superseded','needs_reconciliation')),
  approved_rule_hash TEXT,
  approved_patch_hash TEXT,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  decided_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS rule_promotion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL REFERENCES rule_candidate(id) ON DELETE CASCADE,
  patch_id INTEGER NOT NULL REFERENCES rule_patch(id) ON DELETE CASCADE,
  decision_id INTEGER NOT NULL REFERENCES rule_decision(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('apply','record_applied')),
  target_path TEXT NOT NULL,
  old_target_hash TEXT NOT NULL,
  new_target_hash TEXT NOT NULL,
  applied_by TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(patch_id)
);

CREATE TABLE IF NOT EXISTS audit_run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_key TEXT NOT NULL UNIQUE,
  operation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok','error')),
  checks_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_doc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  agent TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  source_table TEXT,
  source_id INTEGER,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  sensitive INTEGER NOT NULL DEFAULT 0 CHECK (sensitive IN (0,1)),
  indexable INTEGER NOT NULL DEFAULT 1 CHECK (indexable IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_doc_source
ON search_doc(project, agent, source_table, source_id)
WHERE source_table IS NOT NULL AND source_id IS NOT NULL;

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  title,
  body,
  summary,
  content='search_doc',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS search_doc_ai AFTER INSERT ON search_doc
WHEN new.sensitive = 0 AND new.indexable = 1
BEGIN
  INSERT INTO search_fts(rowid, title, body, summary)
  VALUES (new.id, new.title, new.body, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS search_doc_ad AFTER DELETE ON search_doc
WHEN old.sensitive = 0 AND old.indexable = 1
BEGIN
  INSERT INTO search_fts(search_fts, rowid, title, body, summary)
  VALUES ('delete', old.id, old.title, old.body, old.summary);
END;

CREATE TRIGGER IF NOT EXISTS search_doc_au AFTER UPDATE ON search_doc
BEGIN
  INSERT INTO search_fts(search_fts, rowid, title, body, summary)
  SELECT 'delete', old.id, old.title, old.body, old.summary
  WHERE old.sensitive = 0 AND old.indexable = 1;

  INSERT INTO search_fts(rowid, title, body, summary)
  SELECT new.id, new.title, new.body, new.summary
  WHERE new.sensitive = 0 AND new.indexable = 1;
END;
"""


def schema_checksum() -> str:
    return sha256_text(schema_sql())


def connect(db_path: str, create_parent: bool = False) -> sqlite3.Connection:
    if create_parent:
        parent = Path(db_path).parent
        if str(parent) and str(parent) != ".":
            parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def ensure_schema(conn: sqlite3.Connection) -> bool:
    conn.executescript(schema_sql())
    existing = conn.execute(
        "SELECT id FROM schema_migration WHERE version = ?",
        (SCHEMA_VERSION,),
    ).fetchone()
    if existing:
        return False
    conn.execute(
        """
        INSERT INTO schema_migration (version, name, checksum, applied_at)
        VALUES (?, ?, ?, ?)
        """,
        (SCHEMA_VERSION, MIGRATION_NAME, schema_checksum(), utc_now()),
    )
    return True


def write_receipt(
    conn: sqlite3.Connection,
    operation: str,
    payload: dict[str, Any],
    status: str = "ok",
) -> str:
    receipt_key = f"wr_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid.uuid4().hex[:8]}"
    conn.execute(
        """
        INSERT INTO memory_receipt (receipt_key, operation, status, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (receipt_key, operation, status, json_dump(payload), utc_now()),
    )
    return receipt_key


def require_schema(conn: sqlite3.Connection) -> None:
    row = conn.execute(
        "SELECT version, checksum FROM schema_migration WHERE version = ?",
        (SCHEMA_VERSION,),
    ).fetchone()
    if not row:
        raise CliError(
            "SCHEMA_MISSING",
            "memory database is missing the required schema version",
            "run: rose-memory init --db memory/memory.db",
        )
    if row["checksum"] != schema_checksum():
        raise CliError(
            "SCHEMA_CHECKSUM_MISMATCH",
            "schema checksum does not match this rose-memory CLI version",
            "run: rose-memory migrate --db memory/memory.db",
        )


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def dedupe_search_docs(conn: sqlite3.Connection) -> int:
    if not table_exists(conn, "search_doc"):
        return 0
    duplicate_count = conn.execute(
        """
        SELECT COUNT(*)
        FROM search_doc
        WHERE source_table IS NOT NULL
          AND source_id IS NOT NULL
          AND id NOT IN (
            SELECT MAX(id)
            FROM search_doc
            WHERE source_table IS NOT NULL AND source_id IS NOT NULL
            GROUP BY project, agent, source_table, source_id
          )
        """
    ).fetchone()[0]
    conn.execute(
        """
        DELETE FROM search_doc
        WHERE source_table IS NOT NULL
          AND source_id IS NOT NULL
          AND id NOT IN (
            SELECT MAX(id)
            FROM search_doc
            WHERE source_table IS NOT NULL AND source_id IS NOT NULL
            GROUP BY project, agent, source_table, source_id
          )
        """
    )
    return int(duplicate_count)


def rebuild_fts(conn: sqlite3.Connection) -> bool:
    if not table_exists(conn, "search_fts"):
        return False
    conn.execute("INSERT INTO search_fts(search_fts) VALUES ('rebuild')")
    return True


def get_by_key(
    conn: sqlite3.Connection,
    table: str,
    key_column: str,
    key_value: str | None,
) -> sqlite3.Row | None:
    if not key_value:
        return None
    return conn.execute(
        f"SELECT * FROM {table} WHERE {key_column} = ?",
        (key_value,),
    ).fetchone()


def require_by_id(conn: sqlite3.Connection, table: str, row_id: int) -> sqlite3.Row:
    row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (row_id,)).fetchone()
    if not row:
        raise CliError("NOT_FOUND", f"{table} id {row_id} does not exist")
    return row


def require_session(conn: sqlite3.Connection, session_key: str) -> sqlite3.Row:
    row = get_by_key(conn, "session", "session_key", session_key)
    if not row:
        raise CliError("SESSION_NOT_FOUND", f"session {session_key!r} does not exist")
    return row


def optional_task(conn: sqlite3.Connection, task_key: str | None) -> sqlite3.Row | None:
    return get_by_key(conn, "task", "task_key", task_key)


def index_search_doc(
    conn: sqlite3.Connection,
    project: str,
    agent: str,
    doc_type: str,
    source_table: str,
    source_id: int,
    title: str,
    body: str,
    summary: str,
    sensitive: int,
    indexable: int,
    metadata: dict[str, Any] | None = None,
) -> int | None:
    conn.execute(
        """
        DELETE FROM search_doc
        WHERE project = ? AND agent = ? AND source_table = ? AND source_id = ?
        """,
        (project, agent, source_table, source_id),
    )
    if sensitive or not indexable:
        return None
    now = utc_now()
    cursor = conn.execute(
        """
        INSERT INTO search_doc (
          project, agent, doc_type, source_table, source_id, title, body, summary,
          sensitive, indexable, created_at, updated_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            project,
            agent,
            doc_type,
            source_table,
            source_id,
            title,
            body,
            summary,
            sensitive,
            indexable,
            now,
            now,
            json_dump(metadata or {}),
        ),
    )
    return int(cursor.lastrowid)


def add_evidence_row(
    conn: sqlite3.Connection,
    session_id: int | None,
    task_id: int | None,
    project: str,
    agent: str,
    source_type: str,
    source_id: int | None,
    evidence_key: str,
    evidence_text: str,
    weight: int,
    sensitive: int,
    indexable: int,
    metadata_json: str = "{}",
) -> int:
    evidence_hash = sha256_text(evidence_text)
    cursor = conn.execute(
        """
        INSERT INTO evidence (
          session_id, task_id, project, agent, source_type, source_id, evidence_key,
          evidence_text, evidence_hash, weight, sensitive, indexable, created_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_id,
            task_id,
            project,
            agent,
            source_type,
            source_id,
            evidence_key,
            evidence_text,
            evidence_hash,
            weight,
            sensitive,
            indexable,
            utc_now(),
            metadata_json,
        ),
    )
    evidence_id = int(cursor.lastrowid)
    index_search_doc(
        conn,
        project,
        agent,
        "evidence",
        "evidence",
        evidence_id,
        evidence_key,
        evidence_text,
        evidence_text[:240],
        sensitive,
        indexable,
    )
    return evidence_id


def write_command(
    args: argparse.Namespace,
    operation: str,
    handler: Callable[[sqlite3.Connection], dict[str, Any]],
    create_parent: bool = False,
) -> None:
    try:
        conn = connect(args.db, create_parent=create_parent)
        with conn:
            if operation not in {"init", "migrate"}:
                require_schema(conn)
            result = handler(conn)
            receipt_key = write_receipt(conn, operation, result)
        conn.close()
        emit({"ok": True, "receipt_id": receipt_key, "operation": operation, "result": result})
    except CliError as exc:
        emit(
            {
                "ok": False,
                "error_code": exc.error_code,
                "message": exc.message,
                "suggested_action": exc.suggested_action,
            },
            status=1,
        )
    except sqlite3.Error as exc:
        emit(
            {
                "ok": False,
                "error_code": "SQLITE_ERROR",
                "message": str(exc),
                "suggested_action": "run doctor or inspect the database schema",
            },
            status=1,
        )


def read_command(
    args: argparse.Namespace,
    handler: Callable[[sqlite3.Connection], dict[str, Any]],
) -> None:
    try:
        if not Path(args.db).exists():
            raise CliError("DB_MISSING", f"database {args.db!r} does not exist")
        conn = connect(args.db)
        require_schema(conn)
        result = handler(conn)
        conn.close()
        emit({"ok": True, "result": result})
    except CliError as exc:
        emit(
            {
                "ok": False,
                "error_code": exc.error_code,
                "message": exc.message,
                "suggested_action": exc.suggested_action,
            },
            status=1,
        )
    except sqlite3.Error as exc:
        emit(
            {
                "ok": False,
                "error_code": "SQLITE_ERROR",
                "message": str(exc),
                "suggested_action": "run doctor or inspect the database schema",
            },
            status=1,
        )


def command_init(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        created = ensure_schema(conn)
        session_count = conn.execute("SELECT COUNT(*) AS c FROM session").fetchone()["c"]
        if session_count == 0:
            now = utc_now()
            conn.execute(
                """
                INSERT INTO session (session_key, project, agent, started_at, metadata_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                ("bootstrap", args.project, args.agent, now, json_dump({"source": "init"})),
            )
            session_id = conn.execute(
                "SELECT id FROM session WHERE session_key = ?", ("bootstrap",)
            ).fetchone()["id"]
            conn.execute(
                """
                INSERT INTO memory_event (session_id, event_type, state, summary, payload_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    "CHECKPOINT",
                    "ACTIVE",
                    "Initial memory checkpoint.",
                    json_dump({"source": "init"}),
                    now,
                ),
            )
        return {
            "db": args.db,
            "schema_version": SCHEMA_VERSION,
            "schema_created": created,
            "checkpoint_exists": True,
        }

    write_command(args, "init", handler, create_parent=True)


def command_migrate(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        deduped_search_docs = dedupe_search_docs(conn)
        conn.executescript(schema_sql())
        fts_rebuilt = rebuild_fts(conn)
        existing = conn.execute(
            "SELECT id, checksum FROM schema_migration WHERE version = ?",
            (SCHEMA_VERSION,),
        ).fetchone()
        now = utc_now()
        if existing:
            updated = existing["checksum"] != schema_checksum()
            conn.execute(
                """
                UPDATE schema_migration
                SET name = ?, checksum = ?, applied_at = ?
                WHERE version = ?
                """,
                (MIGRATION_NAME, schema_checksum(), now, SCHEMA_VERSION),
            )
        else:
            updated = True
            conn.execute(
                """
                INSERT INTO schema_migration (version, name, checksum, applied_at)
                VALUES (?, ?, ?, ?)
                """,
                (SCHEMA_VERSION, MIGRATION_NAME, schema_checksum(), now),
            )
        return {
            "db": args.db,
            "schema_version": SCHEMA_VERSION,
            "migration_updated": updated,
            "deduped_search_docs": deduped_search_docs,
            "fts_rebuilt": fts_rebuilt,
        }

    write_command(args, "migrate", handler, create_parent=True)


def doctor_checks(conn: sqlite3.Connection) -> dict[str, Any]:
    tables = {
        row["name"]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type IN ('table','view')"
        ).fetchall()
    }
    missing = sorted(REQUIRED_TABLES - tables)
    migrations = [row_to_dict(row) for row in conn.execute("SELECT * FROM schema_migration").fetchall()]
    fk_errors = [dict(row) for row in conn.execute("PRAGMA foreign_key_check").fetchall()]
    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    foreign_keys = conn.execute("PRAGMA foreign_keys").fetchone()[0]
    journal_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    sensitive_indexed = conn.execute(
        "SELECT COUNT(*) FROM search_doc WHERE sensitive = 1 AND indexable = 1"
    ).fetchone()[0]
    orphan_rule_evidence = conn.execute(
        """
        SELECT COUNT(*)
        FROM rule_candidate_evidence rce
        LEFT JOIN evidence e ON e.id = rce.evidence_id
        WHERE e.id IS NULL
        """
    ).fetchone()[0]
    stale_approved = conn.execute(
        """
        SELECT COUNT(*)
        FROM rule_patch
        WHERE status = 'approved'
          AND target_path = ?
          AND base_hash != ?
        """,
        (DEFAULT_TARGET, file_hash(DEFAULT_TARGET)),
    ).fetchone()[0]
    status = (
        "ok"
        if not missing
        and not fk_errors
        and integrity == "ok"
        and foreign_keys == 1
        and sensitive_indexed == 0
        and orphan_rule_evidence == 0
        and stale_approved == 0
        else "error"
    )
    return {
        "status": status,
        "schema_version": SCHEMA_VERSION,
        "missing_tables": missing,
        "migrations": migrations,
        "foreign_keys_enabled": bool(foreign_keys),
        "journal_mode": journal_mode,
        "integrity_check": integrity,
        "foreign_key_errors": fk_errors,
        "sensitive_indexable_violations": sensitive_indexed,
        "orphan_rule_candidate_evidence": orphan_rule_evidence,
        "stale_approved_patches": stale_approved,
    }


def command_doctor(args: argparse.Namespace) -> None:
    try:
        if not Path(args.db).exists():
            raise CliError("DB_MISSING", f"database {args.db!r} does not exist")
        conn = connect(args.db)
        checks = doctor_checks(conn)
        if args.record:
            with conn:
                audit_key = f"audit_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid.uuid4().hex[:8]}"
                conn.execute(
                    """
                    INSERT INTO audit_run (audit_key, operation, status, checks_json, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (audit_key, "doctor", checks["status"], json_dump(checks), utc_now()),
                )
                receipt_key = write_receipt(conn, "doctor", {"audit_key": audit_key, "checks": checks})
            conn.close()
            emit({"ok": checks["status"] == "ok", "receipt_id": receipt_key, "result": checks})
        conn.close()
        emit({"ok": checks["status"] == "ok", "result": checks}, status=0 if checks["status"] == "ok" else 1)
    except CliError as exc:
        emit(
            {
                "ok": False,
                "error_code": exc.error_code,
                "message": exc.message,
                "suggested_action": exc.suggested_action,
            },
            status=1,
        )
    except sqlite3.Error as exc:
        emit({"ok": False, "error_code": "SQLITE_ERROR", "message": str(exc)}, status=1)


def command_session_start(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        session_key = args.session_key or f"session_{uuid.uuid4().hex[:12]}"
        now = utc_now()
        conn.execute(
            """
            INSERT INTO session (session_key, project, agent, started_at, metadata_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_key, args.project, args.agent, now, safe_metadata(args.metadata_json)),
        )
        session_id = conn.execute(
            "SELECT id FROM session WHERE session_key = ?", (session_key,)
        ).fetchone()["id"]
        conn.execute(
            """
            INSERT INTO memory_event (session_id, event_type, state, summary, payload_json, created_at)
            VALUES (?, 'CHECKPOINT', 'ACTIVE', ?, ?, ?)
            """,
            (session_id, "Session started.", json_dump({"session_key": session_key}), now),
        )
        return {"session_id": session_id, "session_key": session_key}

    write_command(args, "session.start", handler)


def command_session_end(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        session = require_session(conn, args.session_key)
        now = utc_now()
        conn.execute("UPDATE session SET ended_at = ? WHERE id = ?", (now, session["id"]))
        conn.execute(
            """
            INSERT INTO memory_event (session_id, event_type, state, summary, payload_json, created_at)
            VALUES (?, 'CHECKPOINT', 'IDLE', ?, ?, ?)
            """,
            (session["id"], args.summary or "Session ended.", json_dump({}), now),
        )
        return {"session_id": session["id"], "session_key": args.session_key, "ended_at": now}

    write_command(args, "session.end", handler)


def command_task_start(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        session = require_session(conn, args.session_key)
        task_key = args.task_key or f"task_{uuid.uuid4().hex[:12]}"
        now = utc_now()
        conn.execute(
            """
            INSERT INTO task (
              task_key, session_id, project, agent, title, scope_text, status, started_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
            """,
            (
                task_key,
                session["id"],
                args.project,
                args.agent,
                args.title,
                args.scope_text or "",
                now,
                safe_metadata(args.metadata_json),
            ),
        )
        task_id = conn.execute("SELECT id FROM task WHERE task_key = ?", (task_key,)).fetchone()["id"]
        conn.execute(
            """
            INSERT INTO memory_event (session_id, task_id, event_type, state, summary, payload_json, created_at)
            VALUES (?, ?, 'CHECKPOINT', 'ACTIVE', ?, ?, ?)
            """,
            (session["id"], task_id, f"Task started: {args.title}", json_dump({"task_key": task_key}), now),
        )
        return {"task_id": task_id, "task_key": task_key, "session_id": session["id"]}

    write_command(args, "task.start", handler)


def command_task_update(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        task = get_by_key(conn, "task", "task_key", args.task_key)
        if not task:
            raise CliError("TASK_NOT_FOUND", f"task {args.task_key!r} does not exist")
        status = args.status or task["status"]
        conn.execute(
            """
            UPDATE task
            SET title = COALESCE(?, title),
                scope_text = COALESCE(?, scope_text),
                status = ?,
                outcome = COALESCE(?, outcome),
                metadata_json = CASE WHEN ? IS NULL THEN metadata_json ELSE ? END
            WHERE id = ?
            """,
            (
                args.title,
                args.scope_text,
                status,
                args.outcome,
                args.metadata_json,
                safe_metadata(args.metadata_json) if args.metadata_json else None,
                task["id"],
            ),
        )
        return {"task_id": task["id"], "task_key": args.task_key, "status": status}

    write_command(args, "task.update", handler)


def command_task_complete(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        task = get_by_key(conn, "task", "task_key", args.task_key)
        if not task:
            raise CliError("TASK_NOT_FOUND", f"task {args.task_key!r} does not exist")
        now = utc_now()
        conn.execute(
            """
            UPDATE task
            SET status = 'completed', completed_at = ?, outcome = ?
            WHERE id = ?
            """,
            (now, args.outcome or task["outcome"], task["id"]),
        )
        conn.execute(
            """
            INSERT INTO memory_event (session_id, task_id, event_type, state, summary, payload_json, created_at)
            VALUES (?, ?, 'COMPLETE', 'IDLE', ?, ?, ?)
            """,
            (task["session_id"], task["id"], args.summary or "Task completed.", json_dump({}), now),
        )
        return {"task_id": task["id"], "task_key": args.task_key, "completed_at": now}

    write_command(args, "task.complete", handler)


def command_event_add(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        session = require_session(conn, args.session_key) if args.session_key else None
        task = optional_task(conn, args.task_key)
        if args.task_key and not task:
            raise CliError("TASK_NOT_FOUND", f"task {args.task_key!r} does not exist")
        cursor = conn.execute(
            """
            INSERT INTO memory_event (session_id, task_id, event_type, state, summary, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session["id"] if session else None,
                task["id"] if task else None,
                args.event_type,
                args.state,
                args.summary or "",
                safe_metadata(args.payload_json),
                utc_now(),
            ),
        )
        return {"event_id": int(cursor.lastrowid), "event_type": args.event_type, "state": args.state}

    write_command(args, "event.add", handler)


def command_fact_add(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        session = require_session(conn, args.session_key) if args.session_key else None
        sensitive, indexable = sensitive_indexable(args.sensitive, args.indexable)
        fact_key = args.fact_key or normalize_rule_key(args.fact_text)
        now = utc_now()
        conn.execute(
            """
            INSERT INTO memory_fact (
              session_id, project, agent, fact_key, fact_text, category, confidence, status,
              sensitive, indexable, first_seen_at, last_seen_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
            ON CONFLICT(project, agent, fact_key) DO UPDATE SET
              fact_text = excluded.fact_text,
              category = excluded.category,
              confidence = excluded.confidence,
              sensitive = excluded.sensitive,
              indexable = excluded.indexable,
              last_seen_at = excluded.last_seen_at,
              metadata_json = excluded.metadata_json
            """,
            (
                session["id"] if session else None,
                args.project,
                args.agent,
                fact_key,
                args.fact_text,
                args.category,
                args.confidence,
                sensitive,
                indexable,
                now,
                now,
                safe_metadata(args.metadata_json),
            ),
        )
        fact = conn.execute(
            "SELECT * FROM memory_fact WHERE project = ? AND agent = ? AND fact_key = ?",
            (args.project, args.agent, fact_key),
        ).fetchone()
        index_search_doc(
            conn,
            args.project,
            args.agent,
            "memory_fact",
            "memory_fact",
            fact["id"],
            fact_key,
            args.fact_text,
            args.fact_text[:240],
            sensitive,
            indexable,
        )
        return {"fact_id": fact["id"], "fact_key": fact_key}

    write_command(args, "fact.add", handler)


def command_claim_add(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        session = require_session(conn, args.session_key) if args.session_key else None
        task = optional_task(conn, args.task_key)
        if args.task_key and not task:
            raise CliError("TASK_NOT_FOUND", f"task {args.task_key!r} does not exist")
        sensitive, indexable = sensitive_indexable(args.sensitive, args.indexable)
        claim_key = args.claim_key or normalize_rule_key(args.claim_text)
        now = utc_now()
        conn.execute(
            """
            INSERT INTO claim (
              session_id, task_id, project, agent, claim_key, claim_text, verification_status,
              evidence_summary, sensitive, indexable, created_at, updated_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project, agent, claim_key) DO UPDATE SET
              claim_text = excluded.claim_text,
              verification_status = excluded.verification_status,
              evidence_summary = excluded.evidence_summary,
              sensitive = excluded.sensitive,
              indexable = excluded.indexable,
              updated_at = excluded.updated_at,
              metadata_json = excluded.metadata_json
            """,
            (
                session["id"] if session else None,
                task["id"] if task else None,
                args.project,
                args.agent,
                claim_key,
                args.claim_text,
                args.verification_status,
                args.evidence_summary or "",
                sensitive,
                indexable,
                now,
                now,
                safe_metadata(args.metadata_json),
            ),
        )
        claim = conn.execute(
            "SELECT * FROM claim WHERE project = ? AND agent = ? AND claim_key = ?",
            (args.project, args.agent, claim_key),
        ).fetchone()
        index_search_doc(
            conn,
            args.project,
            args.agent,
            "claim",
            "claim",
            claim["id"],
            claim_key,
            args.claim_text,
            args.evidence_summary or args.claim_text[:240],
            sensitive,
            indexable,
        )
        return {"claim_id": claim["id"], "claim_key": claim_key}

    write_command(args, "claim.add", handler)


def command_finding_add(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        session = require_session(conn, args.session_key)
        task = optional_task(conn, args.task_key)
        if args.task_key and not task:
            raise CliError("TASK_NOT_FOUND", f"task {args.task_key!r} does not exist")
        sensitive, indexable = sensitive_indexable(args.sensitive, args.indexable)
        now = utc_now()
        cursor = conn.execute(
            """
            INSERT INTO finding (
              session_id, task_id, project, agent, kind, category, severity, wrong_behavior,
              correct_behavior, summary, raw_ref, sensitive, indexable, created_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session["id"],
                task["id"] if task else None,
                args.project,
                args.agent,
                args.kind,
                args.category,
                args.severity,
                args.wrong_behavior or "",
                args.correct_behavior or "",
                args.summary,
                args.raw_ref or "",
                sensitive,
                indexable,
                now,
                safe_metadata(args.metadata_json),
            ),
        )
        finding_id = int(cursor.lastrowid)
        evidence_text = "\n".join(
            part
            for part in [
                args.summary,
                f"Wrong behavior: {args.wrong_behavior}" if args.wrong_behavior else "",
                f"Correct behavior: {args.correct_behavior}" if args.correct_behavior else "",
                f"Raw ref: {args.raw_ref}" if args.raw_ref else "",
            ]
            if part
        )
        evidence_key = args.evidence_key or f"finding:{finding_id}:{sha256_text(evidence_text)[:12]}"
        evidence_id = add_evidence_row(
            conn,
            session["id"],
            task["id"] if task else None,
            args.project,
            args.agent,
            "finding",
            finding_id,
            evidence_key,
            evidence_text,
            1,
            sensitive,
            indexable,
            json_dump({"finding_id": finding_id}),
        )
        index_search_doc(
            conn,
            args.project,
            args.agent,
            "finding",
            "finding",
            finding_id,
            args.category,
            evidence_text,
            args.summary,
            sensitive,
            indexable,
        )
        return {"finding_id": finding_id, "evidence_id": evidence_id}

    write_command(args, "finding.add", handler)


def command_evidence_add(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        session = require_session(conn, args.session_key) if args.session_key else None
        task = optional_task(conn, args.task_key)
        if args.task_key and not task:
            raise CliError("TASK_NOT_FOUND", f"task {args.task_key!r} does not exist")
        sensitive, indexable = sensitive_indexable(args.sensitive, args.indexable)
        evidence_key = args.evidence_key or f"{args.source_type}:{sha256_text(args.evidence_text)[:16]}"
        evidence_id = add_evidence_row(
            conn,
            session["id"] if session else None,
            task["id"] if task else None,
            args.project,
            args.agent,
            args.source_type,
            args.source_id,
            evidence_key,
            args.evidence_text,
            args.weight,
            sensitive,
            indexable,
            safe_metadata(args.metadata_json),
        )
        return {"evidence_id": evidence_id, "evidence_key": evidence_key}

    write_command(args, "evidence.add", handler)


def recompute_rule(conn: sqlite3.Connection, rule_id: int) -> dict[str, Any]:
    rule = require_by_id(conn, "rule_candidate", rule_id)
    summary = conn.execute(
        """
        SELECT
          COALESCE(SUM(rce.weight), 0) AS score,
          COUNT(rce.id) AS evidence_count,
          COUNT(rce.id) AS mention_count,
          COUNT(DISTINCT e.session_id) AS session_count
        FROM rule_candidate_evidence rce
        JOIN evidence e ON e.id = rce.evidence_id
        WHERE rce.rule_id = ?
        """,
        (rule_id,),
    ).fetchone()
    score = int(summary["score"] or 0)
    evidence_count = int(summary["evidence_count"] or 0)
    mention_count = int(summary["mention_count"] or 0)
    session_count = int(summary["session_count"] or 0)
    current_status = rule["status"]
    status = current_status
    if current_status not in {"approved", "promoted", "rejected", "superseded", "expired"}:
        if rule["conflicts_json"] and rule["conflicts_json"] != "[]":
            status = "needs_reconciliation"
        elif score >= 5 and session_count >= 2 and evidence_count >= 1:
            status = "candidate"
        elif rule["severity"] in {"high", "critical"}:
            status = "candidate"
        else:
            status = "memory"
    conn.execute(
        """
        UPDATE rule_candidate
        SET score = ?, mention_count = ?, session_count = ?, evidence_count = ?,
            status = ?, last_seen_at = ?
        WHERE id = ?
        """,
        (score, mention_count, session_count, evidence_count, status, utc_now(), rule_id),
    )
    return {
        "score": score,
        "mention_count": mention_count,
        "session_count": session_count,
        "evidence_count": evidence_count,
        "status": status,
    }


def command_rule_observe(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        evidence = require_by_id(conn, "evidence", args.evidence_id)
        rule_key = args.rule_key or normalize_rule_key(args.rule_text)
        normalized_hash = sha256_text(normalize_rule_text(args.rule_text))
        existing = conn.execute(
            "SELECT * FROM rule_candidate WHERE project = ? AND agent = ? AND rule_key = ?",
            (args.project, args.agent, rule_key),
        ).fetchone()
        status_before = existing["status"] if existing else None
        score_before = existing["score"] if existing else 0
        now = utc_now()
        severity = args.severity
        if existing and SEVERITY_RANK[existing["severity"]] > SEVERITY_RANK[severity]:
            severity = existing["severity"]
        if existing:
            conn.execute(
                """
                UPDATE rule_candidate
                SET normalized_rule_hash = ?, rule_text = ?, category = ?, severity = ?, last_seen_at = ?
                WHERE id = ?
                """,
                (normalized_hash, args.rule_text, args.category, severity, now, existing["id"]),
            )
            rule_id = existing["id"]
            created = False
        else:
            cursor = conn.execute(
                """
                INSERT INTO rule_candidate (
                  project, agent, rule_key, normalized_rule_hash, rule_text, category, severity,
                  status, promotion_target, target_scope, first_seen_at, last_seen_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'memory', 'AGENTS.md', 'project_root_agents', ?, ?, ?)
                """,
                (
                    args.project,
                    args.agent,
                    rule_key,
                    normalized_hash,
                    args.rule_text,
                    args.category,
                    severity,
                    now,
                    now,
                    safe_metadata(args.metadata_json),
                ),
            )
            rule_id = int(cursor.lastrowid)
            created = True
        weight = SIGNAL_WEIGHTS[args.signal_type]
        conn.execute(
            """
            INSERT OR IGNORE INTO rule_candidate_evidence (rule_id, evidence_id, signal_type, weight, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (rule_id, evidence["id"], args.signal_type, weight, now),
        )
        summary = recompute_rule(conn, rule_id)
        return {
            "created": created,
            "rule_id": rule_id,
            "rule_key": rule_key,
            "status_before": status_before,
            "status_after": summary["status"],
            "score_before": score_before,
            "score_after": summary["score"],
            "session_count": summary["session_count"],
            "evidence_count": summary["evidence_count"],
            "requires_user_approval": True,
            "suggest_project_agents_promotion": summary["score"] >= 7 or severity in {"high", "critical"},
        }

    write_command(args, "rule.observe", handler)


def command_rule_list(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        values: list[Any] = [args.project, args.agent]
        where = "WHERE project = ? AND agent = ?"
        if args.status:
            where += " AND status = ?"
            values.append(args.status)
        rows = conn.execute(
            f"SELECT * FROM rule_candidate {where} ORDER BY last_seen_at DESC LIMIT ?",
            (*values, args.limit),
        ).fetchall()
        return {"rules": [row_to_dict(row) for row in rows]}

    read_command(args, handler)


def build_agents_content(base_content: str, rule_text: str) -> str:
    rule_line = f"- {rule_text.strip()}"
    if rule_line in base_content:
        raise CliError("RULE_ALREADY_PRESENT", "target AGENTS.md already contains this rule")
    if not base_content.strip():
        return f"# Agent Instructions\n\n## Rule Promotion\n\n{rule_line}\n"
    separator = "" if base_content.endswith("\n") else "\n"
    return f"{base_content}{separator}\n## Rule Promotion\n\n{rule_line}\n"


def unified_patch(old: str, new: str, target: str) -> str:
    return "".join(
        difflib.unified_diff(
            old.splitlines(keepends=True),
            new.splitlines(keepends=True),
            fromfile=f"a/{target}",
            tofile=f"b/{target}",
        )
    )


def command_rule_propose(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        if args.target != DEFAULT_TARGET:
            raise CliError("UNSUPPORTED_TARGET", "v1 rule promotion only targets repo root AGENTS.md")
        rule = require_by_id(conn, "rule_candidate", args.rule_id)
        if rule["status"] not in {"candidate", "memory", "needs_reconciliation"}:
            raise CliError("INVALID_RULE_STATUS", f"cannot propose patch from status {rule['status']!r}")
        if rule["status"] == "needs_reconciliation":
            raise CliError("NEEDS_RECONCILIATION", "resolve rule conflicts before proposing a patch")
        base_content = read_text_if_exists(args.target)
        proposed_content = build_agents_content(base_content, rule["rule_text"])
        base_hash = sha256_text(base_content)
        new_hash = sha256_text(proposed_content)
        patch_text = unified_patch(base_content, proposed_content, args.target)
        patch_hash = sha256_text(patch_text)
        now = utc_now()
        snapshot_cursor = conn.execute(
            """
            INSERT INTO instruction_snapshot (
              target_path, target_scope, content_hash, summary, captured_at, metadata_json
            ) VALUES (?, 'project_root_agents', ?, ?, ?, ?)
            """,
            (
                args.target,
                base_hash,
                f"Snapshot before proposing rule {rule['rule_key']}",
                now,
                json_dump({"target_exists": Path(args.target).exists()}),
            ),
        )
        patch_cursor = conn.execute(
            """
            INSERT INTO rule_patch (
              rule_id, target_path, target_scope, base_snapshot_id, base_hash, patch_hash,
              proposed_rule_hash, patch_text, status, created_at, updated_at, metadata_json
            ) VALUES (?, ?, 'project_root_agents', ?, ?, ?, ?, ?, 'proposed', ?, ?, ?)
            """,
            (
                rule["id"],
                args.target,
                int(snapshot_cursor.lastrowid),
                base_hash,
                patch_hash,
                rule["normalized_rule_hash"],
                patch_text,
                now,
                now,
                json_dump({"proposed_content_hash": new_hash, "proposed_content": proposed_content}),
            ),
        )
        return {
            "rule_id": rule["id"],
            "patch_id": int(patch_cursor.lastrowid),
            "target_path": args.target,
            "base_hash": base_hash,
            "patch_hash": patch_hash,
            "proposed_content_hash": new_hash,
            "patch_preview": patch_text,
            "requires_user_approval": True,
        }

    write_command(args, "rule.propose", handler)


def command_rule_approve(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        patch = require_by_id(conn, "rule_patch", args.patch_id)
        rule = require_by_id(conn, "rule_candidate", patch["rule_id"])
        if patch["status"] != "proposed":
            raise CliError("INVALID_PATCH_STATUS", f"patch status is {patch['status']!r}, expected 'proposed'")
        if args.patch_hash != patch["patch_hash"]:
            raise CliError("PATCH_HASH_MISMATCH", "approved patch hash does not match the proposed patch")
        if args.approval_evidence_id:
            evidence = require_by_id(conn, "evidence", args.approval_evidence_id)
            if evidence["source_type"] != "user_confirmation":
                raise CliError("INVALID_APPROVAL_EVIDENCE", "approval evidence must have source_type='user_confirmation'")
        now = utc_now()
        decision_cursor = conn.execute(
            """
            INSERT INTO rule_decision (
              rule_id, patch_id, decision, approved_rule_hash, approved_patch_hash,
              actor, reason, decided_at, metadata_json
            ) VALUES (?, ?, 'approved', ?, ?, ?, ?, ?, ?)
            """,
            (
                rule["id"],
                patch["id"],
                rule["normalized_rule_hash"],
                patch["patch_hash"],
                args.actor,
                args.reason or "",
                now,
                json_dump({"approval_evidence_id": args.approval_evidence_id}),
            ),
        )
        conn.execute("UPDATE rule_patch SET status = 'approved', updated_at = ? WHERE id = ?", (now, patch["id"]))
        conn.execute("UPDATE rule_candidate SET status = 'approved', approved_at = ? WHERE id = ?", (now, rule["id"]))
        return {"decision_id": int(decision_cursor.lastrowid), "rule_id": rule["id"], "patch_id": patch["id"]}

    write_command(args, "rule.approve", handler)


def command_rule_reject(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        patch = require_by_id(conn, "rule_patch", args.patch_id)
        rule = require_by_id(conn, "rule_candidate", patch["rule_id"])
        now = utc_now()
        decision_cursor = conn.execute(
            """
            INSERT INTO rule_decision (rule_id, patch_id, decision, actor, reason, decided_at, metadata_json)
            VALUES (?, ?, 'rejected', ?, ?, ?, ?)
            """,
            (rule["id"], patch["id"], args.actor, args.reason or "", now, "{}"),
        )
        conn.execute("UPDATE rule_patch SET status = 'rejected', updated_at = ? WHERE id = ?", (now, patch["id"]))
        conn.execute("UPDATE rule_candidate SET status = 'rejected' WHERE id = ?", (rule["id"],))
        return {"decision_id": int(decision_cursor.lastrowid), "rule_id": rule["id"], "patch_id": patch["id"]}

    write_command(args, "rule.reject", handler)


def command_rule_reconcile(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        rule = require_by_id(conn, "rule_candidate", args.rule_id)
        now = utc_now()
        conn.execute(
            """
            UPDATE rule_candidate
            SET status = ?, conflicts_json = ?, last_seen_at = ?
            WHERE id = ?
            """,
            (args.status, args.conflicts_json or "[]", now, rule["id"]),
        )
        return {"rule_id": rule["id"], "status_before": rule["status"], "status_after": args.status}

    write_command(args, "rule.reconcile", handler)


def latest_approved_decision(conn: sqlite3.Connection, patch_id: int) -> sqlite3.Row:
    decision = conn.execute(
        """
        SELECT * FROM rule_decision
        WHERE patch_id = ? AND decision = 'approved'
        ORDER BY decided_at DESC, id DESC
        LIMIT 1
        """,
        (patch_id,),
    ).fetchone()
    if not decision:
        raise CliError("APPROVAL_MISSING", "patch has no approved user decision")
    return decision


def proposed_content_from_patch(patch: sqlite3.Row) -> str:
    metadata = json.loads(patch["metadata_json"] or "{}")
    proposed_content = metadata.get("proposed_content")
    if not isinstance(proposed_content, str):
        raise CliError("PATCH_CONTENT_MISSING", "rule_patch metadata is missing proposed_content")
    return proposed_content


def validate_promotion(conn: sqlite3.Connection, patch_id: int) -> tuple[sqlite3.Row, sqlite3.Row, sqlite3.Row, str]:
    patch = require_by_id(conn, "rule_patch", patch_id)
    rule = require_by_id(conn, "rule_candidate", patch["rule_id"])
    decision = latest_approved_decision(conn, patch_id)
    proposed_content = proposed_content_from_patch(patch)
    if rule["status"] != "approved":
        raise CliError("INVALID_RULE_STATUS", f"rule status is {rule['status']!r}, expected 'approved'")
    if patch["status"] != "approved":
        raise CliError("INVALID_PATCH_STATUS", f"patch status is {patch['status']!r}, expected 'approved'")
    if decision["patch_id"] != patch["id"]:
        raise CliError("APPROVAL_PATCH_MISMATCH", "approval decision does not match patch")
    if decision["approved_patch_hash"] != patch["patch_hash"]:
        raise CliError("APPROVAL_PATCH_HASH_MISMATCH", "approved patch hash does not match current patch hash")
    if decision["approved_rule_hash"] != rule["normalized_rule_hash"]:
        raise CliError("APPROVAL_RULE_HASH_MISMATCH", "approved rule hash does not match current rule hash")
    if patch["target_path"] != DEFAULT_TARGET or patch["target_scope"] != "project_root_agents":
        raise CliError("UNSUPPORTED_TARGET", "v1 promotion only supports repo root AGENTS.md")
    return patch, rule, decision, proposed_content


def command_rule_promote(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        patch, rule, decision, proposed_content = validate_promotion(conn, args.patch_id)
        current_hash = file_hash(patch["target_path"])
        new_hash = sha256_text(proposed_content)
        if args.apply:
            if current_hash != patch["base_hash"]:
                conn.execute("UPDATE rule_patch SET status = 'stale', updated_at = ? WHERE id = ?", (utc_now(), patch["id"]))
                raise CliError("PATCH_STALE", "AGENTS.md changed after the patch was proposed", "run rule propose again")
            write_text(patch["target_path"], proposed_content)
            observed_new_hash = file_hash(patch["target_path"])
            old_target_hash = current_hash
        else:
            if current_hash != new_hash:
                raise CliError("TARGET_HASH_MISMATCH", "target file does not match the approved proposed content")
            observed_new_hash = current_hash
            old_target_hash = patch["base_hash"]
        if observed_new_hash != new_hash:
            raise CliError("TARGET_HASH_MISMATCH", "applied target hash does not match approved proposed content")
        now = utc_now()
        cursor = conn.execute(
            """
            INSERT INTO rule_promotion (
              rule_id, patch_id, decision_id, mode, target_path, old_target_hash, new_target_hash,
              applied_by, applied_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rule["id"],
                patch["id"],
                decision["id"],
                "apply" if args.apply else "record_applied",
                patch["target_path"],
                old_target_hash,
                observed_new_hash,
                args.actor,
                now,
                "{}",
            ),
        )
        conn.execute("UPDATE rule_patch SET status = 'applied', updated_at = ? WHERE id = ?", (now, patch["id"]))
        conn.execute("UPDATE rule_candidate SET status = 'promoted', promoted_at = ? WHERE id = ?", (now, rule["id"]))
        return {
            "promotion_id": int(cursor.lastrowid),
            "rule_id": rule["id"],
            "patch_id": patch["id"],
            "mode": "apply" if args.apply else "record_applied",
            "target_path": patch["target_path"],
            "new_target_hash": observed_new_hash,
        }

    write_command(args, "rule.promote", handler)


def command_search(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        query = safe_fts_query(args.query)
        rows = conn.execute(
            """
            SELECT d.id, d.doc_type, d.source_table, d.source_id, d.title, d.summary,
                   snippet(search_fts, 1, '[', ']', '...', 12) AS snippet
            FROM search_fts
            JOIN search_doc d ON d.id = search_fts.rowid
            WHERE search_fts MATCH ?
              AND d.project = ?
              AND d.agent = ?
              AND d.sensitive = 0
              AND d.indexable = 1
            LIMIT ?
            """,
            (query, args.project, args.agent, args.limit),
        ).fetchall()
        return {"items": [row_to_dict(row) for row in rows]}

    read_command(args, handler)


def command_pack(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        limit = 8 if args.mode == "direct" else 16
        tokens = query_tokens(args.query)
        fts_query = safe_fts_query(args.query)
        rule_clause, rule_values = token_like_clause(["rule_key", "rule_text", "category"], tokens)
        fact_clause, fact_values = token_like_clause(["fact_key", "fact_text", "category"], tokens)
        search_rows = conn.execute(
            """
            SELECT d.id, d.doc_type, d.source_table, d.source_id, d.title, d.summary,
                   snippet(search_fts, 1, '[', ']', '...', 12) AS snippet
            FROM search_fts
            JOIN search_doc d ON d.id = search_fts.rowid
            WHERE search_fts MATCH ?
              AND d.project = ?
              AND d.agent = ?
              AND d.sensitive = 0
              AND d.indexable = 1
            LIMIT ?
            """,
            (fts_query, args.project, args.agent, limit),
        ).fetchall()
        candidates = conn.execute(
            f"""
            SELECT id, rule_key, rule_text, status, score, session_count, evidence_count
            FROM rule_candidate
            WHERE project = ? AND agent = ?
              AND status IN ('candidate','needs_reconciliation','approved','promoted')
              AND {rule_clause}
            ORDER BY score DESC, last_seen_at DESC
            LIMIT ?
            """,
            (args.project, args.agent, *rule_values, limit),
        ).fetchall()
        facts = conn.execute(
            f"""
            SELECT id, fact_key, fact_text, category, confidence
            FROM memory_fact
            WHERE project = ? AND agent = ? AND status = 'active' AND sensitive = 0
              AND {fact_clause}
            ORDER BY last_seen_at DESC
            LIMIT ?
            """,
            (args.project, args.agent, *fact_values, limit),
        ).fetchall()
        return {
            "mode": args.mode,
            "budget": args.budget,
            "items": [{"type": "search_doc", **row_to_dict(row)} for row in search_rows]
            + [
                {"type": "rule_candidate", **row_to_dict(row)} for row in candidates
            ]
            + [{"type": "memory_fact", **row_to_dict(row)} for row in facts],
        }

    read_command(args, handler)


def command_receipt_show(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        row = conn.execute(
            "SELECT * FROM memory_receipt WHERE receipt_key = ?",
            (args.receipt_key,),
        ).fetchone()
        if not row:
            raise CliError("RECEIPT_NOT_FOUND", f"receipt {args.receipt_key!r} does not exist")
        return {"receipt": row_to_dict(row)}

    read_command(args, handler)


def command_complete(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        session = require_session(conn, args.session_key) if args.session_key else None
        task = optional_task(conn, args.task_key)
        if args.task_key and not task:
            raise CliError("TASK_NOT_FOUND", f"task {args.task_key!r} does not exist")
        now = utc_now()
        if task:
            conn.execute(
                """
                UPDATE task SET status = 'completed', completed_at = ?, outcome = COALESCE(?, outcome)
                WHERE id = ?
                """,
                (now, args.outcome, task["id"]),
            )
        evidence_ids = args.evidence_id or []
        evidence_refs = args.evidence_ref or []
        if not evidence_ids and not evidence_refs and not args.no_durable_memory_promoted:
            raise CliError(
                "COMPLETION_EVIDENCE_REQUIRED",
                "complete requires --evidence-id/--evidence-ref or --no-durable-memory-promoted",
            )
        for evidence_id in evidence_ids:
            require_by_id(conn, "evidence", evidence_id)
        event_cursor = conn.execute(
            """
            INSERT INTO memory_event (session_id, task_id, event_type, state, summary, payload_json, created_at)
            VALUES (?, ?, 'COMPLETE', 'IDLE', ?, ?, ?)
            """,
            (
                session["id"] if session else (task["session_id"] if task else None),
                task["id"] if task else None,
                args.summary or "Task complete.",
                json_dump(
                    {
                        "outcome": args.outcome or "",
                        "evidence_ids": evidence_ids,
                        "evidence_refs": evidence_refs,
                        "no_durable_memory_promoted": args.no_durable_memory_promoted,
                    }
                ),
                now,
            ),
        )
        return {"event_id": int(event_cursor.lastrowid), "state": "IDLE"}

    write_command(args, "complete", handler)


def command_remember_requirement(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        session = require_session(conn, args.session_key) if args.session_key else None
        task = optional_task(conn, args.task_key)
        if args.task_key and not task:
            raise CliError("TASK_NOT_FOUND", f"task {args.task_key!r} does not exist")
        fact_key = args.fact_key or normalize_rule_key(args.text)
        now = utc_now()
        metadata = {
            "source": args.source,
            "task_key": args.task_key or "",
            "memory_layer": "requirement",
        }
        conn.execute(
            """
            INSERT INTO memory_fact (
              session_id, project, agent, fact_key, fact_text, category, confidence, status,
              sensitive, indexable, first_seen_at, last_seen_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, 'requirement', ?, 'active', 0, 1, ?, ?, ?)
            ON CONFLICT(project, agent, fact_key) DO UPDATE SET
              fact_text = excluded.fact_text,
              category = excluded.category,
              confidence = excluded.confidence,
              last_seen_at = excluded.last_seen_at,
              metadata_json = excluded.metadata_json
            """,
            (
                session["id"] if session else None,
                args.project,
                args.agent,
                fact_key,
                args.text,
                args.confidence,
                now,
                now,
                json_dump(metadata),
            ),
        )
        fact = conn.execute(
            "SELECT * FROM memory_fact WHERE project = ? AND agent = ? AND fact_key = ?",
            (args.project, args.agent, fact_key),
        ).fetchone()
        index_search_doc(
            conn,
            args.project,
            args.agent,
            "memory_fact",
            "memory_fact",
            fact["id"],
            fact_key,
            args.text,
            args.text[:240],
            0,
            1,
            metadata,
        )
        return {"fact_id": fact["id"], "fact_key": fact_key, "task_key": args.task_key or ""}

    write_command(args, "remember-requirement", handler)


def command_checkpoint(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        session = require_session(conn, args.session_key) if args.session_key else None
        task = optional_task(conn, args.task_key)
        if args.task_key and not task:
            raise CliError("TASK_NOT_FOUND", f"task {args.task_key!r} does not exist")
        summary_parts = [
            f"Goal: {args.goal}",
            f"Scope: {args.scope}",
            f"Progress: {args.progress}",
        ]
        if args.evidence_ref:
            summary_parts.append("Evidence: " + "; ".join(args.evidence_ref))
        payload = {
            "goal": args.goal,
            "scope": args.scope,
            "progress": args.progress,
            "files_touched": args.file or [],
            "evidence_refs": args.evidence_ref or [],
            "memory_layer": "task_checkpoint",
        }
        cursor = conn.execute(
            """
            INSERT INTO memory_event (session_id, task_id, event_type, state, summary, payload_json, created_at)
            VALUES (?, ?, 'CHECKPOINT', 'ACTIVE', ?, ?, ?)
            """,
            (
                session["id"] if session else (task["session_id"] if task else None),
                task["id"] if task else None,
                " | ".join(summary_parts),
                json_dump(payload),
                utc_now(),
            ),
        )
        return {"event_id": int(cursor.lastrowid), "state": "ACTIVE", "task_key": args.task_key or ""}

    write_command(args, "checkpoint", handler)


def command_pack_current(args: argparse.Namespace) -> None:
    def handler(conn: sqlite3.Connection) -> dict[str, Any]:
        task = optional_task(conn, args.task_key)
        if args.task_key and not task:
            raise CliError("TASK_NOT_FOUND", f"task {args.task_key!r} does not exist")
        if not task:
            task = conn.execute(
                """
                SELECT * FROM task
                WHERE project = ? AND agent = ? AND status = 'active'
                ORDER BY started_at DESC, id DESC
                LIMIT 1
                """,
                (args.project, args.agent),
            ).fetchone()
        checkpoint_sql = """
            SELECT e.id, e.event_type, e.state, e.summary, e.payload_json, e.created_at,
                   t.task_key, t.title AS task_title
            FROM memory_event e
            LEFT JOIN task t ON t.id = e.task_id
            WHERE e.event_type = 'CHECKPOINT'
              AND e.state = 'ACTIVE'
        """
        checkpoint_values: list[Any] = []
        if task:
            checkpoint_sql += " AND e.task_id = ?"
            checkpoint_values.append(task["id"])
        checkpoint_sql += " ORDER BY e.created_at DESC, e.id DESC LIMIT 3"
        checkpoints = conn.execute(checkpoint_sql, checkpoint_values).fetchall()
        requirements = conn.execute(
            """
            SELECT id, fact_key, fact_text, category, confidence, last_seen_at, metadata_json
            FROM memory_fact
            WHERE project = ? AND agent = ? AND status = 'active' AND sensitive = 0
              AND category IN ('requirement', 'preference', 'decision')
            ORDER BY last_seen_at DESC, id DESC
            LIMIT 8
            """,
            (args.project, args.agent),
        ).fetchall()
        findings = conn.execute(
            """
            SELECT id, kind, category, severity, summary, correct_behavior, raw_ref, created_at
            FROM finding
            WHERE project = ? AND agent = ? AND sensitive = 0
              AND kind IN ('correction', 'failure', 'preference', 'risk', 'observation')
            ORDER BY created_at DESC, id DESC
            LIMIT 6
            """,
            (args.project, args.agent),
        ).fetchall()
        evidence = conn.execute(
            """
            SELECT id, source_type, evidence_key, evidence_text, weight, created_at
            FROM evidence
            WHERE project = ? AND agent = ? AND sensitive = 0
              AND source_type IN ('file', 'diff', 'test', 'user_confirmation')
            ORDER BY created_at DESC, id DESC
            LIMIT 6
            """,
            (args.project, args.agent),
        ).fetchall()
        return {
            "budget": args.budget,
            "query": "current active task requirements decisions evidence",
            "active_task": row_to_dict(task),
            "active_checkpoints": [row_to_dict(row) for row in checkpoints],
            "recent_requirement_decisions": [row_to_dict(row) for row in requirements],
            "relevant_durable_findings": [row_to_dict(row) for row in findings],
            "recent_evidence": [row_to_dict(row) for row in evidence],
        }

    read_command(args, handler)


def add_db_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--db", default=DEFAULT_DB, help="SQLite memory DB path")


def add_project_agent_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--project", default=project_default())
    parser.add_argument("--agent", default=DEFAULT_AGENT)


def add_metadata_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--metadata-json", default="{}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ROSE project-local SQLite memory CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init")
    add_db_arg(init)
    add_project_agent_args(init)
    init.set_defaults(func=command_init)

    doctor = sub.add_parser("doctor")
    add_db_arg(doctor)
    doctor.add_argument("--record", action="store_true")
    doctor.set_defaults(func=command_doctor)

    migrate = sub.add_parser("migrate")
    add_db_arg(migrate)
    migrate.set_defaults(func=command_migrate)

    session = sub.add_parser("session")
    session_sub = session.add_subparsers(dest="session_command", required=True)
    session_start = session_sub.add_parser("start")
    add_db_arg(session_start)
    add_project_agent_args(session_start)
    add_metadata_arg(session_start)
    session_start.add_argument("--session-key")
    session_start.set_defaults(func=command_session_start)
    session_end = session_sub.add_parser("end")
    add_db_arg(session_end)
    session_end.add_argument("--session-key", required=True)
    session_end.add_argument("--summary")
    session_end.set_defaults(func=command_session_end)

    task = sub.add_parser("task")
    task_sub = task.add_subparsers(dest="task_command", required=True)
    task_start = task_sub.add_parser("start")
    add_db_arg(task_start)
    add_project_agent_args(task_start)
    add_metadata_arg(task_start)
    task_start.add_argument("--session-key", required=True)
    task_start.add_argument("--task-key")
    task_start.add_argument("--title", required=True)
    task_start.add_argument("--scope-text")
    task_start.set_defaults(func=command_task_start)
    task_update = task_sub.add_parser("update")
    add_db_arg(task_update)
    add_metadata_arg(task_update)
    task_update.add_argument("--task-key", required=True)
    task_update.add_argument("--title")
    task_update.add_argument("--scope-text")
    task_update.add_argument("--status", choices=["active", "blocked", "completed", "cancelled"])
    task_update.add_argument("--outcome")
    task_update.set_defaults(func=command_task_update)
    task_complete = task_sub.add_parser("complete")
    add_db_arg(task_complete)
    task_complete.add_argument("--task-key", required=True)
    task_complete.add_argument("--outcome")
    task_complete.add_argument("--summary")
    task_complete.set_defaults(func=command_task_complete)

    event = sub.add_parser("event")
    event_sub = event.add_subparsers(dest="event_command", required=True)
    event_add = event_sub.add_parser("add")
    add_db_arg(event_add)
    event_add.add_argument("--session-key")
    event_add.add_argument("--task-key")
    event_add.add_argument("--event-type", required=True)
    event_add.add_argument("--state")
    event_add.add_argument("--summary")
    event_add.add_argument("--payload-json", default="{}")
    event_add.set_defaults(func=command_event_add)

    fact = sub.add_parser("fact")
    fact_sub = fact.add_subparsers(dest="fact_command", required=True)
    fact_add = fact_sub.add_parser("add")
    add_db_arg(fact_add)
    add_project_agent_args(fact_add)
    add_metadata_arg(fact_add)
    fact_add.add_argument("--session-key")
    fact_add.add_argument("--fact-key")
    fact_add.add_argument("--fact-text", required=True)
    fact_add.add_argument("--category", required=True)
    fact_add.add_argument("--confidence", choices=["low", "medium", "high"], default="medium")
    fact_add.add_argument("--sensitive", action="store_true")
    fact_add.add_argument("--no-index", dest="indexable", action="store_false", default=True)
    fact_add.set_defaults(func=command_fact_add)

    claim = sub.add_parser("claim")
    claim_sub = claim.add_subparsers(dest="claim_command", required=True)
    claim_add = claim_sub.add_parser("add")
    add_db_arg(claim_add)
    add_project_agent_args(claim_add)
    add_metadata_arg(claim_add)
    claim_add.add_argument("--session-key")
    claim_add.add_argument("--task-key")
    claim_add.add_argument("--claim-key")
    claim_add.add_argument("--claim-text", required=True)
    claim_add.add_argument(
        "--verification-status",
        choices=["unverified", "verified", "disputed", "superseded"],
        default="unverified",
    )
    claim_add.add_argument("--evidence-summary")
    claim_add.add_argument("--sensitive", action="store_true")
    claim_add.add_argument("--no-index", dest="indexable", action="store_false", default=True)
    claim_add.set_defaults(func=command_claim_add)

    finding = sub.add_parser("finding")
    finding_sub = finding.add_subparsers(dest="finding_command", required=True)
    finding_add = finding_sub.add_parser("add")
    add_db_arg(finding_add)
    add_project_agent_args(finding_add)
    add_metadata_arg(finding_add)
    finding_add.add_argument("--session-key", required=True)
    finding_add.add_argument("--task-key")
    finding_add.add_argument(
        "--kind",
        required=True,
        choices=["correction", "failure", "review_rejection", "preference", "risk", "observation"],
    )
    finding_add.add_argument("--category", required=True)
    finding_add.add_argument("--severity", choices=["low", "normal", "high", "critical"], default="normal")
    finding_add.add_argument("--summary", required=True)
    finding_add.add_argument("--wrong-behavior")
    finding_add.add_argument("--correct-behavior")
    finding_add.add_argument("--raw-ref")
    finding_add.add_argument("--evidence-key")
    finding_add.add_argument("--sensitive", action="store_true")
    finding_add.add_argument("--no-index", dest="indexable", action="store_false", default=True)
    finding_add.set_defaults(func=command_finding_add)

    evidence = sub.add_parser("evidence")
    evidence_sub = evidence.add_subparsers(dest="evidence_command", required=True)
    evidence_add = evidence_sub.add_parser("add")
    add_db_arg(evidence_add)
    add_project_agent_args(evidence_add)
    add_metadata_arg(evidence_add)
    evidence_add.add_argument("--session-key")
    evidence_add.add_argument("--task-key")
    evidence_add.add_argument(
        "--source-type",
        required=True,
        choices=["finding", "claim", "memory_event", "task", "file", "diff", "test", "user_confirmation"],
    )
    evidence_add.add_argument("--source-id", type=int)
    evidence_add.add_argument("--evidence-key")
    evidence_add.add_argument("--evidence-text", required=True)
    evidence_add.add_argument("--weight", type=int, default=1)
    evidence_add.add_argument("--sensitive", action="store_true")
    evidence_add.add_argument("--no-index", dest="indexable", action="store_false", default=True)
    evidence_add.set_defaults(func=command_evidence_add)

    rule = sub.add_parser("rule")
    rule_sub = rule.add_subparsers(dest="rule_command", required=True)
    rule_observe = rule_sub.add_parser("observe")
    add_db_arg(rule_observe)
    add_project_agent_args(rule_observe)
    add_metadata_arg(rule_observe)
    rule_observe.add_argument("--evidence-id", type=int, required=True)
    rule_observe.add_argument("--rule-key")
    rule_observe.add_argument("--rule-text", required=True)
    rule_observe.add_argument("--category", required=True)
    rule_observe.add_argument("--severity", choices=["low", "normal", "high", "critical"], default="normal")
    rule_observe.add_argument("--signal-type", required=True, choices=sorted(SIGNAL_WEIGHTS))
    rule_observe.set_defaults(func=command_rule_observe)
    rule_list = rule_sub.add_parser("list")
    add_db_arg(rule_list)
    add_project_agent_args(rule_list)
    rule_list.add_argument(
        "--status",
        choices=["memory", "candidate", "needs_reconciliation", "approved", "promoted", "rejected", "superseded", "expired"],
    )
    rule_list.add_argument("--limit", type=int, default=50)
    rule_list.set_defaults(func=command_rule_list)
    rule_propose = rule_sub.add_parser("propose")
    add_db_arg(rule_propose)
    rule_propose.add_argument("--rule-id", type=int, required=True)
    rule_propose.add_argument("--target", default=DEFAULT_TARGET)
    rule_propose.set_defaults(func=command_rule_propose)
    rule_approve = rule_sub.add_parser("approve")
    add_db_arg(rule_approve)
    rule_approve.add_argument("--patch-id", type=int, required=True)
    rule_approve.add_argument("--patch-hash", required=True)
    rule_approve.add_argument("--actor", required=True)
    rule_approve.add_argument("--reason")
    rule_approve.add_argument("--approval-evidence-id", type=int)
    rule_approve.set_defaults(func=command_rule_approve)
    rule_reject = rule_sub.add_parser("reject")
    add_db_arg(rule_reject)
    rule_reject.add_argument("--patch-id", type=int, required=True)
    rule_reject.add_argument("--actor", required=True)
    rule_reject.add_argument("--reason")
    rule_reject.set_defaults(func=command_rule_reject)
    rule_reconcile = rule_sub.add_parser("reconcile")
    add_db_arg(rule_reconcile)
    rule_reconcile.add_argument("--rule-id", type=int, required=True)
    rule_reconcile.add_argument("--status", required=True, choices=["candidate", "rejected", "superseded"])
    rule_reconcile.add_argument("--conflicts-json", default="[]")
    rule_reconcile.set_defaults(func=command_rule_reconcile)
    rule_promote = rule_sub.add_parser("promote")
    add_db_arg(rule_promote)
    rule_promote.add_argument("--patch-id", type=int, required=True)
    mode = rule_promote.add_mutually_exclusive_group(required=True)
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--record-applied", action="store_true")
    rule_promote.add_argument("--actor", required=True)
    rule_promote.set_defaults(func=command_rule_promote)

    search = sub.add_parser("search")
    add_db_arg(search)
    add_project_agent_args(search)
    search.add_argument("query")
    search.add_argument("--limit", type=int, default=10)
    search.set_defaults(func=command_search)

    pack = sub.add_parser("pack")
    add_db_arg(pack)
    add_project_agent_args(pack)
    pack.add_argument("query")
    pack.add_argument("--mode", choices=["direct", "spec", "research"], default="direct")
    pack.add_argument("--budget", type=int, default=800)
    pack.set_defaults(func=command_pack)

    receipt = sub.add_parser("receipt")
    receipt_sub = receipt.add_subparsers(dest="receipt_command", required=True)
    receipt_show = receipt_sub.add_parser("show")
    add_db_arg(receipt_show)
    receipt_show.add_argument("receipt_key")
    receipt_show.set_defaults(func=command_receipt_show)

    complete = sub.add_parser("complete")
    add_db_arg(complete)
    complete.add_argument("--session-key")
    complete.add_argument("--task-key")
    complete.add_argument("--outcome")
    complete.add_argument("--summary")
    complete.add_argument("--evidence-id", type=int, action="append")
    complete.add_argument("--evidence-ref", action="append")
    complete.add_argument("--no-durable-memory-promoted", action="store_true")
    complete.set_defaults(func=command_complete)

    remember_requirement = sub.add_parser("remember-requirement")
    add_db_arg(remember_requirement)
    add_project_agent_args(remember_requirement)
    remember_requirement.add_argument("--session-key")
    remember_requirement.add_argument("--task-key")
    remember_requirement.add_argument("--fact-key")
    remember_requirement.add_argument("--text", required=True)
    remember_requirement.add_argument("--source", default="conversation")
    remember_requirement.add_argument("--confidence", choices=["low", "medium", "high"], default="high")
    remember_requirement.set_defaults(func=command_remember_requirement)

    checkpoint = sub.add_parser("checkpoint")
    add_db_arg(checkpoint)
    checkpoint.add_argument("--session-key")
    checkpoint.add_argument("--task-key")
    checkpoint.add_argument("--goal", required=True)
    checkpoint.add_argument("--scope", required=True)
    checkpoint.add_argument("--progress", required=True)
    checkpoint.add_argument("--file", action="append")
    checkpoint.add_argument("--evidence-ref", action="append")
    checkpoint.set_defaults(func=command_checkpoint)

    pack_current = sub.add_parser("pack-current")
    add_db_arg(pack_current)
    add_project_agent_args(pack_current)
    pack_current.add_argument("--task-key")
    pack_current.add_argument("--budget", type=int, default=1200)
    pack_current.set_defaults(func=command_pack_current)

    return parser


def main(argv: Iterable[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    args.func(args)


if __name__ == "__main__":
    main()
