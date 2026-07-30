'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const app = express();
app.use(express.json());
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['pending', 'in_transit', 'received'];

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9+]/g, '').trim();
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function getTokenFromRequest(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

// Require a logged-in customer
function requireCustomer(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Нэвтрэх шаардлагатай' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'customer') {
      return res.status(403).json({ error: 'Хандах эрхгүй' });
    }
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Нэвтрэлт хүчингүй боллоо' });
  }
}

// Require a logged-in admin
function requireAdmin(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Нэвтрэх шаардлагатай' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Админ эрх шаардлагатай' });
    }
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Нэвтрэлт хүчингүй боллоо' });
  }
}

function computeTotal(quantity, unitPrice, totalPrice) {
  // If total is explicitly given (> 0), trust it. Otherwise compute it.
  const t = Number(totalPrice);
  if (t && t > 0) return t;
  return Number(quantity || 0) * Number(unitPrice || 0);
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const stmts = {
  findCustomerByPhone: db.prepare('SELECT * FROM customers WHERE phone = ?'),
  findCustomerById: db.prepare('SELECT * FROM customers WHERE id = ?'),
  insertCustomer: db.prepare(
    'INSERT INTO customers (phone, name, password_hash) VALUES (?, ?, ?)'
  ),
  updateCustomerName: db.prepare('UPDATE customers SET name = ? WHERE id = ?'),
  updateCustomerPassword: db.prepare('UPDATE customers SET password_hash = ? WHERE id = ?'),
  ordersByPhone: db.prepare(
    'SELECT * FROM orders WHERE phone = ? ORDER BY created_at DESC, id DESC'
  ),
  allOrders: db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC'),
  orderById: db.prepare('SELECT * FROM orders WHERE id = ?'),
  insertOrder: db.prepare(`
    INSERT INTO orders (phone, code, item_name, quantity, unit_price, total_price, status, tracking_code, note)
    VALUES (@phone, @code, @item_name, @quantity, @unit_price, @total_price, @status, @tracking_code, @note)
  `),
  updateOrder: db.prepare(`
    UPDATE orders SET
      phone = @phone,
      code = @code,
      item_name = @item_name,
      quantity = @quantity,
      unit_price = @unit_price,
      total_price = @total_price,
      status = @status,
      tracking_code = @tracking_code,
      note = @note,
      updated_at = datetime('now')
    WHERE id = @id
  `),
  deleteOrder: db.prepare('DELETE FROM orders WHERE id = ?'),
  allCustomers: db.prepare('SELECT id, phone, name, created_at FROM customers ORDER BY created_at DESC'),
};

// ---------------------------------------------------------------------------
// Customer auth routes
// ---------------------------------------------------------------------------

app.post('/api/auth/register', (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '');

  if (!phone || !name || !password) {
    return res.status(400).json({ error: 'Утас, нэр, нууц үг бүгдийг бөглөнө үү' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Нууц үг доод тал нь 4 тэмдэгт байх ёстой' });
  }
  if (stmts.findCustomerByPhone.get(phone)) {
    return res.status(409).json({ error: 'Энэ дугаар аль хэдийн бүртгэлтэй байна. Нэвтэрнэ үү.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = stmts.insertCustomer.run(phone, name, hash);
  const token = signToken({ role: 'customer', id: info.lastInsertRowid, phone, name });

  res.json({ token, user: { id: info.lastInsertRowid, phone, name } });
});

app.post('/api/auth/login', (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || '');

  const customer = stmts.findCustomerByPhone.get(phone);
  if (!customer || !bcrypt.compareSync(password, customer.password_hash)) {
    return res.status(401).json({ error: 'Утас эсвэл нууц үг буруу байна' });
  }

  const token = signToken({ role: 'customer', id: customer.id, phone: customer.phone, name: customer.name });
  res.json({ token, user: { id: customer.id, phone: customer.phone, name: customer.name } });
});

// Customer: see only their own orders
app.get('/api/my/orders', requireCustomer, (req, res) => {
  const orders = stmts.ordersByPhone.all(req.user.phone);
  res.json({ user: { phone: req.user.phone, name: req.user.name }, orders });
});

// Customer profile
app.get('/api/my/profile', requireCustomer, (req, res) => {
  const customer = stmts.findCustomerById.get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });
  res.json({
    user: {
      id: customer.id,
      phone: customer.phone,
      name: customer.name,
      created_at: customer.created_at,
    },
  });
});

app.put('/api/my/profile', requireCustomer, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Нэрээ оруулна уу' });

  const customer = stmts.findCustomerById.get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });

  stmts.updateCustomerName.run(name, customer.id);
  const token = signToken({
    role: 'customer',
    id: customer.id,
    phone: customer.phone,
    name,
  });

  res.json({
    token,
    user: { id: customer.id, phone: customer.phone, name, created_at: customer.created_at },
  });
});

app.put('/api/my/password', requireCustomer, (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Хуучин болон шинэ нууц үгээ оруулна уу' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Шинэ нууц үг доод тал нь 4 тэмдэгт байх ёстой' });
  }

  const customer = stmts.findCustomerById.get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });
  if (!bcrypt.compareSync(currentPassword, customer.password_hash)) {
    return res.status(401).json({ error: 'Хуучин нууц үг буруу байна' });
  }

  stmts.updateCustomerPassword.run(bcrypt.hashSync(newPassword, 10), customer.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin auth + management routes
// ---------------------------------------------------------------------------

app.post('/api/admin/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Админ нэр эсвэл нууц үг буруу байна' });
  }

  const token = signToken({ role: 'admin', username });
  res.json({ token, user: { username, role: 'admin' } });
});

// List all orders (optionally filter by phone)
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const phone = normalizePhone(req.query.phone);
  const orders = phone ? stmts.ordersByPhone.all(phone) : stmts.allOrders.all();
  res.json({ orders });
});

app.get('/api/admin/customers', requireAdmin, (req, res) => {
  res.json({ customers: stmts.allCustomers.all() });
});

function buildOrderPayload(body) {
  const phone = normalizePhone(body.phone);
  const code = String(body.code || body.item_name || '').trim();
  const item_name = code;
  const quantity = Number(body.quantity || 1);
  const unit_price = Number(body.unit_price || 0);
  const total_price = computeTotal(quantity, unit_price, body.total_price);
  let status = String(body.status || 'pending');
  if (!VALID_STATUSES.includes(status)) status = 'pending';
  const tracking_code = body.tracking_code ? String(body.tracking_code).trim() : null;
  const note = body.note ? String(body.note).trim() : null;

  return { phone, code, item_name, quantity, unit_price, total_price, status, tracking_code, note };
}

app.post('/api/admin/orders', requireAdmin, (req, res) => {
  const payload = buildOrderPayload(req.body);
  if (!payload.phone || !payload.code) {
    return res.status(400).json({ error: 'Утасны дугаар болон код заавал шаардлагатай' });
  }
  const info = stmts.insertOrder.run(payload);
  res.json({ order: stmts.orderById.get(info.lastInsertRowid) });
});

app.put('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = stmts.orderById.get(id);
  if (!existing) return res.status(404).json({ error: 'Захиалга олдсонгүй' });

  const payload = buildOrderPayload(req.body);
  if (!payload.phone || !payload.code) {
    return res.status(400).json({ error: 'Утасны дугаар болон код заавал шаардлагатай' });
  }
  stmts.updateOrder.run({ ...payload, id });
  res.json({ order: stmts.orderById.get(id) });
});

app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = stmts.orderById.get(id);
  if (!existing) return res.status(404).json({ error: 'Захиалга олдсонгүй' });
  stmts.deleteOrder.run(id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Static frontend
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Cargo server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
