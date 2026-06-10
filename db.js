'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './data/microcargo.db';

// Make sure the folder for the database file exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    phone         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    phone        TEXT NOT NULL,
    item_name    TEXT NOT NULL,
    quantity     INTEGER NOT NULL DEFAULT 1,
    unit_price   REAL NOT NULL DEFAULT 0,
    total_price  REAL NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'pending', -- pending | in_transit | received
    tracking_code TEXT,
    note         TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
`);

module.exports = db;
