import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'panels.db'));
db.exec('PRAGMA journal_mode = WAL;');
// 多进程（PM2 cluster）并发写时等待锁，避免 SQLITE_BUSY
db.exec('PRAGMA busy_timeout = 5000;');
db.exec(`
CREATE TABLE IF NOT EXISTS panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'http',
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 8888,
  entry TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT 'v2',
  api_key TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// 迁移：为旧版本数据库补充新增列
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}
ensureColumn('panels', 'category', "TEXT NOT NULL DEFAULT ''");

export function listPanels() {
  return db.prepare('SELECT * FROM panels ORDER BY id ASC').all();
}

export function getPanel(id) {
  return db.prepare('SELECT * FROM panels WHERE id = ?').get(id);
}

export function createPanel(p) {
  const now = new Date().toISOString();
  const r = db.prepare(
    `INSERT INTO panels (name, protocol, host, port, entry, version, api_key, remark, category, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(p.name, p.protocol, p.host, p.port, p.entry, p.version, p.apiKey, p.remark || '', p.category || '', now, now);
  return getPanel(Number(r.lastInsertRowid));
}

export function updatePanel(id, p) {
  const now = new Date().toISOString();
  const prev = getPanel(id)?.api_key || '';
  // apiKey 为空时保留原值；
  // 疑似掩码（含 * 且原值不含 *）视为"未修改"，同样保留原值，
  // 防止测试环境脱敏后的 api_key 被编辑面板时误写回数据库
  const looksMasked = typeof p.apiKey === 'string' && p.apiKey.includes('*') && !prev.includes('*');
  const apiKey = p.apiKey && !looksMasked ? String(p.apiKey).trim() : prev;
  db.prepare(
    `UPDATE panels SET name = ?, protocol = ?, host = ?, port = ?, entry = ?, version = ?, api_key = ?, remark = ?, category = ?, updated_at = ? WHERE id = ?`
  ).run(p.name, p.protocol, p.host, p.port, p.entry, p.version, apiKey, p.remark || '', p.category || '', now, id);
  return getPanel(id);
}

export function deletePanel(id) {
  db.prepare('DELETE FROM panels WHERE id = ?').run(id);
}

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}
