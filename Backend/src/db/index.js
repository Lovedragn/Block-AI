import 'chrono-node';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { randomUUID, createHash } from 'crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'agent.db');
export const db = new Database(DB_PATH);

// Configure for high performance & safety
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000');
db.pragma('temp_store = MEMORY');

// Node 24 & GC Safe Prepared Statement Cache
// Prevents V8 GC from destroying Statement C++ objects during active runtime
const rawPrepare = db.prepare.bind(db);
const stmtCache = new Map();
db.prepare = function (sql) {
  const normalized = sql.trim();
  let stmt = stmtCache.get(normalized);
  if (!stmt) {
    stmt = rawPrepare(normalized);
    stmtCache.set(normalized, stmt);
  }
  return stmt;
};

export function initDatabase() {
  // 1. Raw Messages Table with indexed recorded_date
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      recorded_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(recorded_date);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  `);

  // 2. Typo-tolerant FTS5 Trigram Memory Table
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        recorded_date UNINDEXED,
        topic,
        entities_json,
        claims_caveman,
        tokenize='trigram'
      );
    `);
  } catch (err) {
    console.warn('[DB] memory_fts trigram initialization notice:', err);
  }

  // 3. Entity Graph Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_graph (
      id TEXT PRIMARY KEY,
      recorded_date TEXT NOT NULL,
      parent_topic TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      attribute_caveman TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entity_graph_date ON entity_graph(recorded_date);
    CREATE INDEX IF NOT EXISTS idx_entity_graph_name ON entity_graph(entity_name);
    CREATE INDEX IF NOT EXISTS idx_entity_graph_topic ON entity_graph(parent_topic);
  `);

  // 4. Search Cache Table (15-min TTL)
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_cache (
      query_hash TEXT PRIMARY KEY,
      results_markdown TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Sessions Table for UI list
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

// ----------------- CRUD & Cache Helpers -----------------

export function clearDatabase() {
  db.prepare('DELETE FROM messages').run();
  db.prepare('DELETE FROM entity_graph').run();
  try {
    db.prepare('DELETE FROM memory_fts').run();
  } catch {}
  db.prepare('DELETE FROM search_cache').run();
  db.prepare('DELETE FROM sessions').run();
}

export function listSessions() {
  return db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all();
}

export function getOrCreateSession(sessionId, title = 'Temporal Evaluation Session') {
  const now = new Date().toISOString();
  const id = sessionId || 'demo-session-temporal-01';
  const existing = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (existing) return existing;

  db.prepare('INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, title, now, now);
  return { id, title, created_at: now, updated_at: now };
}

export function saveMessage(params) {
  const id = randomUUID();
  const now = params.createdAt || new Date().toISOString();
  const dateStr = params.recordedDate || now.slice(0, 10);

  db.prepare(`
    INSERT INTO messages (id, session_id, role, content, recorded_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, params.sessionId, params.role, params.content, dateStr, now);

  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, params.sessionId);

  return {
    id,
    session_id: params.sessionId,
    role: params.role,
    content: params.content,
    recorded_date: dateStr,
    created_at: now,
  };
}

export function getSessionMessages(sessionId, limit = 50) {
  return db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?')
    .all(sessionId, limit);
}

export function insertMemoryFts(params) {
  const entitiesJson = JSON.stringify(params.entities || []);
  db.prepare(`
    INSERT INTO memory_fts (recorded_date, topic, entities_json, claims_caveman)
    VALUES (?, ?, ?, ?)
  `).run(params.recordedDate, params.topic, entitiesJson, params.claimsCaveman);
}

export function insertEntityGraph(params) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO entity_graph (id, recorded_date, parent_topic, entity_name, attribute_caveman)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, params.recordedDate, params.parentTopic, params.entityName, params.attributeCaveman);

  return {
    id,
    recorded_date: params.recordedDate,
    parent_topic: params.parentTopic,
    entity_name: params.entityName,
    attribute_caveman: params.attributeCaveman,
  };
}

export function getAllEntityGraphNodes(limit = 100) {
  return db.prepare('SELECT * FROM entity_graph ORDER BY recorded_date DESC LIMIT ?').all(limit);
}

export function getAllMemoryFtsRows(limit = 100) {
  return db.prepare('SELECT recorded_date, topic, entities_json, claims_caveman FROM memory_fts ORDER BY recorded_date DESC LIMIT ?')
    .all(limit);
}

// 15-Minute TTL Search Cache
export function getCachedSearch(query) {
  const hash = createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
  const row = db.prepare('SELECT results_markdown, created_at FROM search_cache WHERE query_hash = ?').get(hash);

  if (!row) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const fifteenMins = 15 * 60;
  if (nowSec - row.created_at > fifteenMins) {
    db.prepare('DELETE FROM search_cache WHERE query_hash = ?').run(hash);
    return null;
  }

  return row.results_markdown;
}

export function setCachedSearch(query, resultsMarkdown) {
  const hash = createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
  const nowSec = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT OR REPLACE INTO search_cache (query_hash, results_markdown, created_at)
    VALUES (?, ?, ?)
  `).run(hash, resultsMarkdown, nowSec);
}

