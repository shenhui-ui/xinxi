const Database = require('better-sqlite3')
const path = require('node:path')
const fs = require('node:fs')
const config = require('./config')

const migrations = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, task_type TEXT, source TEXT,
          assign_time TEXT, deadline TEXT, assigner TEXT, cooperators TEXT,
          status TEXT DEFAULT '未启动', progress INTEGER DEFAULT 0,
          summary TEXT, stages TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_tasks_deleted_created ON tasks(deleted_at, created_at);
        CREATE TABLE meetings (
          id TEXT PRIMARY KEY, topic TEXT NOT NULL, meeting_time TEXT, location TEXT,
          send_to TEXT, receive_from TEXT, attendees TEXT, minutes TEXT, status TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_meetings_deleted_created ON meetings(deleted_at, created_at);
        CREATE TABLE documents (
          id TEXT PRIMARY KEY, doc_type TEXT, title TEXT NOT NULL, doc_no TEXT,
          secret_level TEXT, genre TEXT, handler TEXT, receipt_status TEXT, content TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_documents_deleted_created ON documents(deleted_at, created_at);
        CREATE TABLE activities (
          id TEXT PRIMARY KEY, act_type TEXT, title TEXT NOT NULL, start_time TEXT,
          end_time TEXT, location TEXT, participants TEXT, achievements TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_activities_deleted_created ON activities(deleted_at, created_at);
        CREATE TABLE seals (
          id TEXT PRIMARY KEY, seal_time TEXT, applicant TEXT, approver TEXT,
          file_name TEXT, file_type TEXT, purpose TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_seals_deleted_created ON seals(deleted_at, created_at);
        CREATE TABLE supplies (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT, unit TEXT,
          current_stock REAL DEFAULT 0, safe_stock REAL DEFAULT 0,
          location TEXT, source_unit TEXT, remark TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_supplies_deleted_name ON supplies(deleted_at, name);
        CREATE TABLE supply_transactions (
          id TEXT PRIMARY KEY, supply_id TEXT NOT NULL,
          change_type TEXT, quantity REAL, balance_after REAL,
          operator TEXT, source_unit TEXT, transacted_at TEXT, note TEXT,
          created_at TEXT
        );
        CREATE INDEX idx_supply_transactions_supply ON supply_transactions(supply_id);
        CREATE TABLE attachments (
          id TEXT PRIMARY KEY, biz_type TEXT, biz_id TEXT,
          server_file_name TEXT, display_name TEXT, file_size INTEGER, mime_type TEXT,
          uploaded_at TEXT, created_by TEXT, deleted_at TEXT, version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_attachments_biz ON attachments(biz_type, biz_id);
        CREATE INDEX idx_attachments_deleted ON attachments(deleted_at);
        CREATE TABLE ai_configs (
          id TEXT PRIMARY KEY, name TEXT, base_url TEXT, api_key_enc BLOB,
          model_name TEXT, is_active INTEGER DEFAULT 0,
          created_at TEXT, updated_at TEXT, deleted_at TEXT, version INTEGER DEFAULT 1
        );
        CREATE TABLE writings (
          id TEXT PRIMARY KEY, title TEXT, scenario TEXT, content_html TEXT,
          status TEXT DEFAULT 'draft', exported_at TEXT,
          created_by TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT,
          version INTEGER DEFAULT 1
        );
        CREATE INDEX idx_writings_deleted_created ON writings(deleted_at, created_at);
        CREATE TABLE exports (
          id TEXT PRIMARY KEY, job_id TEXT, biz_type TEXT, writing_id TEXT,
          format TEXT, filter_json TEXT, file_id TEXT, display_name TEXT,
          status TEXT, message TEXT, expires_at TEXT, created_at TEXT, downloaded_at TEXT
        );
        INSERT INTO meta (key, value) VALUES ('schema_version', '1');
      `)
    },
  },
]

function initDb(dbPath = config.dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)')
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version')
  if (!row) {
    migrations[0].up(db)
  }
  return db
}

module.exports = { initDb, migrations }
