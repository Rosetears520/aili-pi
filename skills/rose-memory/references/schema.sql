
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
