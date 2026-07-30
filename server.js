'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const ExcelJS = require('exceljs');

const db = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const DATA_ROOT = process.env.DATA_ROOT || path.dirname(process.env.DB_PATH || path.join(__dirname, 'data', 'cargo.db'));
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_ROOT, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(UPLOAD_DIR));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['pending', 'in_transit', 'received'];
const STATUS_LABELS = {
  pending: 'Хүлээгдэж буй',
  in_transit: 'Замд яваа',
  received: 'Хүлээж авсан',
};

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
  const t = Number(totalPrice);
  if (t && t > 0) return t;
  return Number(quantity || 0) * Number(unitPrice || 0);
}

function publicCustomer(customer) {
  return {
    id: customer.id,
    phone: customer.phone,
    name: customer.name,
    address: customer.address || '',
    profile_note: customer.profile_note || '',
    avatar_url: customer.avatar_path ? '/uploads/' + path.basename(customer.avatar_path) : null,
    created_at: customer.created_at,
  };
}

function publicAdmin(admin) {
  return {
    id: admin.id,
    username: admin.username,
    name: admin.name,
    phone: admin.phone || '',
    address: admin.address || '',
    profile_note: admin.profile_note || '',
    avatar_url: admin.avatar_path ? '/uploads/' + path.basename(admin.avatar_path) : null,
    role: 'admin',
    created_at: admin.created_at,
  };
}

function ensureAdminSeeded() {
  const existing = db.prepare('SELECT id FROM admins LIMIT 1').get();
  if (existing) return;
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  db.prepare(
    'INSERT INTO admins (username, name, password_hash) VALUES (?, ?, ?)'
  ).run(ADMIN_USERNAME, 'Админ', hash);
}

ensureAdminSeeded();

function deleteAvatarFile(avatarPath) {
  if (!avatarPath) return;
  const full = path.isAbsolute(avatarPath) ? avatarPath : path.join(UPLOAD_DIR, path.basename(avatarPath));
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (e) {
    /* ignore */
  }
}

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    const role = (req.user && req.user.role) || 'user';
    cb(null, `avatar-${role}-${req.user.id}-${Date.now()}${safeExt}`);
  },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('Зөвхөн jpg, png, webp, gif зураг оруулна уу'));
    }
    cb(null, true);
  },
}).single('avatar');

async function buildOrdersWorkbook(orders) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Cargo';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Захиалгууд');
  sheet.columns = [
    { header: 'Огноо', key: 'created_at', width: 18 },
    { header: 'Утас', key: 'phone', width: 14 },
    { header: 'Код', key: 'code', width: 22 },
    { header: 'Тоо', key: 'quantity', width: 8 },
    { header: 'Нэгж үнэ', key: 'unit_price', width: 12 },
    { header: 'Нийт үнэ', key: 'total_price', width: 12 },
    { header: 'Төлөв', key: 'status', width: 16 },
    { header: 'Трак код', key: 'tracking_code', width: 18 },
    { header: 'Тэмдэглэл', key: 'note', width: 28 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };

  for (const o of orders) {
    sheet.addRow({
      created_at: o.created_at,
      phone: o.phone,
      code: o.code || o.item_name,
      quantity: o.quantity,
      unit_price: Number(o.unit_price || 0),
      total_price: Number(o.total_price || 0),
      status: STATUS_LABELS[o.status] || o.status,
      tracking_code: o.tracking_code || '',
      note: o.note || '',
    });
  }

  return workbook.xlsx.writeBuffer();
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
  updateCustomerProfile: db.prepare(`
    UPDATE customers SET name = ?, address = ?, profile_note = ? WHERE id = ?
  `),
  updateCustomerAvatar: db.prepare('UPDATE customers SET avatar_path = ? WHERE id = ?'),
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
  allCustomers: db.prepare(
    'SELECT id, phone, name, address, profile_note, avatar_path, created_at FROM customers ORDER BY created_at DESC'
  ),
  findAdminByUsername: db.prepare('SELECT * FROM admins WHERE username = ?'),
  findAdminById: db.prepare('SELECT * FROM admins WHERE id = ?'),
  updateAdminProfile: db.prepare(`
    UPDATE admins SET name = ?, phone = ?, address = ?, profile_note = ? WHERE id = ?
  `),
  updateAdminAvatar: db.prepare('UPDATE admins SET avatar_path = ? WHERE id = ?'),
  updateAdminPassword: db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?'),
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
  res.json({ token, user: publicCustomer(customer) });
});

app.get('/api/my/orders', requireCustomer, (req, res) => {
  const orders = stmts.ordersByPhone.all(req.user.phone);
  res.json({ user: { phone: req.user.phone, name: req.user.name }, orders });
});

app.get('/api/my/orders/export', requireCustomer, async (req, res) => {
  try {
    const orders = stmts.ordersByPhone.all(req.user.phone);
    const buffer = await buildOrdersWorkbook(orders);
    const filename = `cargo-orders-${req.user.phone || 'me'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: 'Excel файл үүсгэж чадсангүй' });
  }
});

app.get('/api/my/profile', requireCustomer, (req, res) => {
  const customer = stmts.findCustomerById.get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });
  res.json({ user: publicCustomer(customer) });
});

app.put('/api/my/profile', requireCustomer, (req, res) => {
  const name = String(req.body.name || '').trim();
  const address = String(req.body.address || '').trim();
  const profile_note = String(req.body.profile_note || '').trim();
  if (!name) return res.status(400).json({ error: 'Нэрээ оруулна уу' });

  const customer = stmts.findCustomerById.get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });

  stmts.updateCustomerProfile.run(name, address, profile_note, customer.id);
  const updated = stmts.findCustomerById.get(customer.id);
  const token = signToken({
    role: 'customer',
    id: updated.id,
    phone: updated.phone,
    name: updated.name,
  });

  res.json({ token, user: publicCustomer(updated) });
});

app.post('/api/my/avatar', requireCustomer, (req, res) => {
  uploadAvatar(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Зургийн хэмжээ 2MB-аас хэтрэхгүй байх ёстой'
        : (err.message || 'Зураг оруулахад алдаа гарлаа');
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: 'Зураг сонгоно уу' });

    const customer = stmts.findCustomerById.get(req.user.id);
    if (!customer) {
      deleteAvatarFile(req.file.path);
      return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });
    }

    deleteAvatarFile(customer.avatar_path);
    stmts.updateCustomerAvatar.run(req.file.filename, customer.id);
    const updated = stmts.findCustomerById.get(customer.id);
    res.json({ user: publicCustomer(updated) });
  });
});

app.delete('/api/my/avatar', requireCustomer, (req, res) => {
  const customer = stmts.findCustomerById.get(req.user.id);
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });
  deleteAvatarFile(customer.avatar_path);
  stmts.updateCustomerAvatar.run(null, customer.id);
  res.json({ user: publicCustomer(stmts.findCustomerById.get(customer.id)) });
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

  ensureAdminSeeded();
  const admin = stmts.findAdminByUsername.get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Админ нэр эсвэл нууц үг буруу байна' });
  }

  const token = signToken({
    role: 'admin',
    id: admin.id,
    username: admin.username,
    name: admin.name,
  });
  res.json({ token, user: publicAdmin(admin) });
});
app.get('/api/admin/profile', requireAdmin, (req, res) => {
  const admin = stmts.findAdminById.get(req.user.id) || stmts.findAdminByUsername.get(req.user.username);
  if (!admin) return res.status(404).json({ error: 'Админ олдсонгүй' });
  res.json({ user: publicAdmin(admin) });
});

app.put('/api/admin/profile', requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim();
  const address = String(req.body.address || '').trim();
  const profile_note = String(req.body.profile_note || '').trim();
  if (!name) return res.status(400).json({ error: 'Нэрээ оруулна уу' });

  const admin = stmts.findAdminById.get(req.user.id) || stmts.findAdminByUsername.get(req.user.username);
  if (!admin) return res.status(404).json({ error: 'Админ олдсонгүй' });

  stmts.updateAdminProfile.run(name, phone, address, profile_note, admin.id);
  const updated = stmts.findAdminById.get(admin.id);
  const token = signToken({
    role: 'admin',
    id: updated.id,
    username: updated.username,
    name: updated.name,
  });
  res.json({ token, user: publicAdmin(updated) });
});

app.post('/api/admin/avatar', requireAdmin, (req, res) => {
  uploadAvatar(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Зургийн хэмжээ 2MB-аас хэтрэхгүй байх ёстой'
        : (err.message || 'Зураг оруулахад алдаа гарлаа');
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: 'Зураг сонгоно уу' });

    const admin = stmts.findAdminById.get(req.user.id) || stmts.findAdminByUsername.get(req.user.username);
    if (!admin) {
      deleteAvatarFile(req.file.path);
      return res.status(404).json({ error: 'Админ олдсонгүй' });
    }

    deleteAvatarFile(admin.avatar_path);
    stmts.updateAdminAvatar.run(req.file.filename, admin.id);
    res.json({ user: publicAdmin(stmts.findAdminById.get(admin.id)) });
  });
});

app.delete('/api/admin/avatar', requireAdmin, (req, res) => {
  const admin = stmts.findAdminById.get(req.user.id) || stmts.findAdminByUsername.get(req.user.username);
  if (!admin) return res.status(404).json({ error: 'Админ олдсонгүй' });
  deleteAvatarFile(admin.avatar_path);
  stmts.updateAdminAvatar.run(null, admin.id);
  res.json({ user: publicAdmin(stmts.findAdminById.get(admin.id)) });
});

app.put('/api/admin/password', requireAdmin, (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Хуучин болон шинэ нууц үгээ оруулна уу' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Шинэ нууц үг доод тал нь 4 тэмдэгт байх ёстой' });
  }

  const admin = stmts.findAdminById.get(req.user.id) || stmts.findAdminByUsername.get(req.user.username);
  if (!admin) return res.status(404).json({ error: 'Админ олдсонгүй' });
  if (!bcrypt.compareSync(currentPassword, admin.password_hash)) {
    return res.status(401).json({ error: 'Хуучин нууц үг буруу байна' });
  }

  stmts.updateAdminPassword.run(bcrypt.hashSync(newPassword, 10), admin.id);
  res.json({ ok: true });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const phone = normalizePhone(req.query.phone);
  const orders = phone ? stmts.ordersByPhone.all(phone) : stmts.allOrders.all();
  res.json({ orders });
});

app.get('/api/admin/orders/export', requireAdmin, async (req, res) => {
  try {
    const phone = normalizePhone(req.query.phone);
    const orders = phone ? stmts.ordersByPhone.all(phone) : stmts.allOrders.all();
    const buffer = await buildOrdersWorkbook(orders);
    const filename = phone ? `cargo-orders-${phone}.xlsx` : 'cargo-orders-all.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: 'Excel файл үүсгэж чадсангүй' });
  }
});

app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const customers = stmts.allCustomers.all().map(publicCustomer);
  res.json({ customers });
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
