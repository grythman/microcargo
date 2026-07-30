'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const isProductionRuntime = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

const DB_PATH = process.env.DB_PATH || (isProductionRuntime ? '/tmp/cargo.db' : path.join(__dirname, 'data', 'cargo.db'));

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

const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map((column) => column.name);
if (!orderColumns.includes('code')) {
  db.exec("ALTER TABLE orders ADD COLUMN code TEXT NOT NULL DEFAULT '';");
  db.exec("UPDATE orders SET code = item_name WHERE code = '' OR code IS NULL;");
}

const customerColumns = db.prepare('PRAGMA table_info(customers)').all().map((column) => column.name);
const customerMigrations = [
  ['avatar_path', 'TEXT'],
  ['address', "TEXT NOT NULL DEFAULT ''"],
  ['profile_note', "TEXT NOT NULL DEFAULT ''"],
];
for (const [name, type] of customerMigrations) {
  if (!customerColumns.includes(name)) {
    db.exec(`ALTER TABLE customers ADD COLUMN ${name} ${type};`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_path   TEXT,
    phone         TEXT NOT NULL DEFAULT '',
    address       TEXT NOT NULL DEFAULT '',
    profile_note  TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
