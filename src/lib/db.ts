import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// Override with DATA_DIR when the host mounts persistent storage somewhere else.
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address1 TEXT NOT NULL DEFAULT '',
  address2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  zip TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL DEFAULT '',
  ssn_last4 TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'analyzing',
  error TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL,
  creditor TEXT NOT NULL,
  creditor_address TEXT NOT NULL DEFAULT '',
  original_creditor TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other',
  bureaus TEXT NOT NULL DEFAULT '[]',
  balance TEXT NOT NULL DEFAULT '',
  date_opened TEXT NOT NULL DEFAULT '',
  date_of_first_delinquency TEXT NOT NULL DEFAULT '',
  reported_status TEXT NOT NULL DEFAULT '',
  issues TEXT NOT NULL DEFAULT '[]',
  laws TEXT NOT NULL DEFAULT '[]',
  dispute_angle TEXT NOT NULL DEFAULT '',
  next_steps TEXT NOT NULL DEFAULT '[]',
  strength TEXT NOT NULL DEFAULT 'moderate',
  status TEXT NOT NULL DEFAULT 'identified',
  identity_theft INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  item_ids TEXT NOT NULL DEFAULT '[]',
  type TEXT NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,
  recipient_name TEXT NOT NULL,
  recipient_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  enclosures TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  error TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT '',
  response TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'client')),
  client_id INTEGER UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
  token_hash TEXT PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL,
  bureau TEXT NOT NULL,
  score INTEGER NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  as_of TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  letter_id INTEGER REFERENCES letters(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  destination TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS freezes (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (client_id, agency)
);
`;

// Columns added after the first release; applied to existing databases on startup.
const COLUMNS: [table: string, column: string, ddl: string][] = [
  ["clients", "signature", "TEXT NOT NULL DEFAULT ''"],
  ["clients", "signature_at", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "signed_at", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "delivered_at", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "mail_provider", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "mail_id", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "mail_tracking", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "mail_status", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "mail_expected", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "mail_preview", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "mail_test", "INTEGER NOT NULL DEFAULT 0"],
  ["letters", "mail_checked_at", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "delivered_notified_at", "TEXT NOT NULL DEFAULT ''"],
  ["clients", "report_reminders", "INTEGER NOT NULL DEFAULT 1"],
  ["freezes", "confirmed_on", "TEXT NOT NULL DEFAULT ''"],
  ["freezes", "confirmation_number", "TEXT NOT NULL DEFAULT ''"],
  ["freezes", "doc_path", "TEXT NOT NULL DEFAULT ''"],
  ["freezes", "doc_name", "TEXT NOT NULL DEFAULT ''"],
  ["freezes", "added_by", "TEXT NOT NULL DEFAULT ''"],
  ["clients", "report_reminded_at", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "delivery_choice", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "payment_status", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "payment_order_id", "TEXT NOT NULL DEFAULT ''"],
  ["letters", "paid_cents", "INTEGER NOT NULL DEFAULT 0"],
  ["letters", "paid_at", "TEXT NOT NULL DEFAULT ''"],
];

// Survive dev-server hot reloads with a single connection, but re-apply the
// schema whenever it has changed so new tables appear without a restart.
const g = globalThis as unknown as { __crdb?: DatabaseSync; __crSchema?: string };

export function db(): DatabaseSync {
  if (!g.__crdb) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    g.__crdb = new DatabaseSync(path.join(DATA_DIR, "credit-repair.db"));
    g.__crdb.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  }
  const version = SCHEMA + JSON.stringify(COLUMNS);
  if (g.__crSchema !== version) {
    g.__crdb.exec(SCHEMA);
    for (const [table, column, ddl] of COLUMNS) {
      const cols = g.__crdb.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === column)) g.__crdb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
    g.__crSchema = version;
  }
  return g.__crdb;
}

type Row = Record<string, unknown>;
type Param = string | number | null;

export function all<T = Row>(sql: string, ...params: Param[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}
export function get<T = Row>(sql: string, ...params: Param[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}
export function run(sql: string, ...params: Param[]) {
  return db().prepare(sql).run(...params);
}

/** Build a safe `UPDATE ... SET` from a whitelist of columns. */
export function updateRow(table: string, id: number, patch: Row, allowed: readonly string[]) {
  const cols = Object.keys(patch).filter((k) => allowed.includes(k));
  if (!cols.length) return;
  const vals = cols.map((c) => {
    const v = patch[c];
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "object" && v !== null) return JSON.stringify(v);
    return v as Param;
  });
  run(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, ...vals, id);
}

export const getSetting = (key: string, fallback = "") => get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)?.value ?? fallback;
export const setSetting = (key: string, value: string) =>
  run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, value);
