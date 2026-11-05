'use strict';

const { query, withTransaction } = require('./lib/supabase');

const ORDER_STATUSES = ['pending', 'in_transit', 'received'];

async function ensureAdminSeeded(username, passwordHash) {
  const existing = await query('SELECT id FROM admins LIMIT 1');
  if (existing.rowCount > 0) return;
  await query(
    'INSERT INTO admins (username, name, password_hash) VALUES ($1, $2, $3)',
    [username, 'Админ', passwordHash]
  );
}

module.exports = {
  query,
  withTransaction,
  ORDER_STATUSES,
  ensureAdminSeeded,
};
