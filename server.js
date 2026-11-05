'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const ExcelJS = require('exceljs');

const db = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const DATA_ROOT = process.env.DATA_ROOT || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_ROOT, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const app = express();
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));


const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);

const VALID_STATUSES = db.ORDER_STATUSES;
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
  } catch {
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
  } catch {
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

function deleteAvatarFile(avatarPath) {
  if (!avatarPath) return;
  const candidate = path.resolve(UPLOAD_DIR, path.basename(String(avatarPath)));
  const uploadsRoot = path.resolve(UPLOAD_DIR) + path.sep;
  if (!candidate.startsWith(uploadsRoot)) return;
  try {
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  } catch {
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
      quantity: Number(o.quantity || 0),
      unit_price: Number(o.unit_price || 0),
      total_price: Number(o.total_price || 0),
      status: STATUS_LABELS[o.status] || o.status,
      tracking_code: o.tracking_code || '',
      note: o.note || '',
    });
  }

  return workbook.xlsx.writeBuffer();
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function findCustomerByPhone(phone) {
  const result = await db.query('SELECT * FROM customers WHERE phone = $1', [phone]);
  return result.rows[0] || null;
}

async function findCustomerById(id) {
  const result = await db.query('SELECT * FROM customers WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function findAdminByUsername(username) {
  const result = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
  return result.rows[0] || null;
}

async function findAdminById(id) {
  const result = await db.query('SELECT * FROM admins WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function ensureAdminSeeded() {
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  await db.ensureAdminSeeded(ADMIN_USERNAME, hash);
}

ensureAdminSeeded().catch((error) => {
  console.error('Failed to seed admin:', error.message);
});

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '');

  if (!phone || !name || !password) {
    return res.status(400).json({ error: 'Утас, нэр, нууц үг бүгдийг бөглөнө үү' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Нууц үг доод тал нь 4 тэмдэгт байх ёстой' });
  }

  const existing = await findCustomerByPhone(phone);
  if (existing) {
    return res.status(409).json({ error: 'Энэ дугаар аль хэдийн бүртгэлтэй байна. Нэвтэрнэ үү.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const inserted = await db.query(
    'INSERT INTO customers (phone, name, password_hash) VALUES ($1, $2, $3) RETURNING id, phone, name',
    [phone, name, hash]
  );
  const user = inserted.rows[0];

  await db.query(
    'UPDATE orders SET customer_id = $1 WHERE phone = $2 AND (customer_id IS NULL OR customer_id <> $1)',
    [user.id, user.phone]
  );

  const token = signToken({ role: 'customer', id: user.id, phone: user.phone, name: user.name });
  res.json({ token, user });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || '');

  const customer = await findCustomerByPhone(phone);
  if (!customer || !bcrypt.compareSync(password, customer.password_hash)) {
    return res.status(401).json({ error: 'Утас эсвэл нууц үг буруу байна' });
  }

  const token = signToken({ role: 'customer', id: customer.id, phone: customer.phone, name: customer.name });
  res.json({ token, user: publicCustomer(customer) });
}));

app.get('/api/my/orders', requireCustomer, asyncHandler(async (req, res) => {
  const result = await db.query(
    'SELECT * FROM orders WHERE phone = $1 ORDER BY created_at DESC, id DESC',
    [req.user.phone]
  );
  res.json({ user: { phone: req.user.phone, name: req.user.name }, orders: result.rows });
}));

app.get('/api/my/orders/export', requireCustomer, asyncHandler(async (req, res) => {
  const result = await db.query(
    'SELECT * FROM orders WHERE phone = $1 ORDER BY created_at DESC, id DESC',
    [req.user.phone]
  );
  const buffer = await buildOrdersWorkbook(result.rows);
  const filename = `cargo-orders-${req.user.phone || 'me'}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}));

app.get('/api/my/profile', requireCustomer, asyncHandler(async (req, res) => {
  const customer = await findCustomerById(req.user.id);
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });
  res.json({ user: publicCustomer(customer) });
}));

app.put('/api/my/profile', requireCustomer, asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const address = String(req.body.address || '').trim();
  const profile_note = String(req.body.profile_note || '').trim();
  if (!name) return res.status(400).json({ error: 'Нэрээ оруулна уу' });

  const customer = await findCustomerById(req.user.id);
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });

  await db.query(
    'UPDATE customers SET name = $1, address = $2, profile_note = $3 WHERE id = $4',
    [name, address, profile_note, customer.id]
  );

  const updated = await findCustomerById(customer.id);
  const token = signToken({
    role: 'customer',
    id: updated.id,
    phone: updated.phone,
    name: updated.name,
  });

  res.json({ token, user: publicCustomer(updated) });
}));

app.post('/api/my/avatar', requireCustomer, (req, res, next) => {
  uploadAvatar(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Зургийн хэмжээ 2MB-аас хэтрэхгүй байх ёстой'
        : (err.message || 'Зураг оруулахад алдаа гарлаа');
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: 'Зураг сонгоно уу' });

    (async () => {
      const customer = await findCustomerById(req.user.id);
      if (!customer) {
        deleteAvatarFile(req.file.path);
        return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });
      }

      deleteAvatarFile(customer.avatar_path);
      await db.query('UPDATE customers SET avatar_path = $1 WHERE id = $2', [req.file.filename, customer.id]);
      const updated = await findCustomerById(customer.id);
      return res.json({ user: publicCustomer(updated) });
    })().catch(next);
  });
});

app.delete('/api/my/avatar', requireCustomer, asyncHandler(async (req, res) => {
  const customer = await findCustomerById(req.user.id);
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });
  deleteAvatarFile(customer.avatar_path);
  await db.query('UPDATE customers SET avatar_path = NULL WHERE id = $1', [customer.id]);
  const updated = await findCustomerById(customer.id);
  res.json({ user: publicCustomer(updated) });
}));

app.put('/api/my/password', requireCustomer, asyncHandler(async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Хуучин болон шинэ нууц үгээ оруулна уу' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Шинэ нууц үг доод тал нь 4 тэмдэгт байх ёстой' });
  }

  const customer = await findCustomerById(req.user.id);
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });
  if (!bcrypt.compareSync(currentPassword, customer.password_hash)) {
    return res.status(401).json({ error: 'Хуучин нууц үг буруу байна' });
  }

  await db.query('UPDATE customers SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(newPassword, 10), customer.id]);
  res.json({ ok: true });
}));

app.post('/api/admin/login', asyncHandler(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  await ensureAdminSeeded();
  const admin = await findAdminByUsername(username);
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
}));

app.get('/api/admin/profile', requireAdmin, asyncHandler(async (req, res) => {
  const admin = (await findAdminById(req.user.id)) || (await findAdminByUsername(req.user.username));
  if (!admin) return res.status(404).json({ error: 'Админ олдсонгүй' });
  res.json({ user: publicAdmin(admin) });
}));

app.put('/api/admin/profile', requireAdmin, asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim();
  const address = String(req.body.address || '').trim();
  const profile_note = String(req.body.profile_note || '').trim();
  if (!name) return res.status(400).json({ error: 'Нэрээ оруулна уу' });

  const admin = (await findAdminById(req.user.id)) || (await findAdminByUsername(req.user.username));
  if (!admin) return res.status(404).json({ error: 'Админ олдсонгүй' });

  await db.query(
    'UPDATE admins SET name = $1, phone = $2, address = $3, profile_note = $4 WHERE id = $5',
    [name, phone, address, profile_note, admin.id]
  );

  const updated = await findAdminById(admin.id);
  const token = signToken({
    role: 'admin',
    id: updated.id,
    username: updated.username,
    name: updated.name,
  });
  res.json({ token, user: publicAdmin(updated) });
}));

app.post('/api/admin/avatar', requireAdmin, (req, res, next) => {
  uploadAvatar(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Зургийн хэмжээ 2MB-аас хэтрэхгүй байх ёстой'
        : (err.message || 'Зураг оруулахад алдаа гарлаа');
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: 'Зураг сонгоно уу' });

    (async () => {
      const admin = (await findAdminById(req.user.id)) || (await findAdminByUsername(req.user.username));
      if (!admin) {
        deleteAvatarFile(req.file.path);
        return res.status(404).json({ error: 'Админ олдсонгүй' });
      }

      deleteAvatarFile(admin.avatar_path);
      await db.query('UPDATE admins SET avatar_path = $1 WHERE id = $2', [req.file.filename, admin.id]);
      const updated = await findAdminById(admin.id);
      return res.json({ user: publicAdmin(updated) });
    })().catch(next);
  });
});

app.delete('/api/admin/avatar', requireAdmin, asyncHandler(async (req, res) => {
  const admin = (await findAdminById(req.user.id)) || (await findAdminByUsername(req.user.username));
  if (!admin) return res.status(404).json({ error: 'Админ олдсонгүй' });
  deleteAvatarFile(admin.avatar_path);
  await db.query('UPDATE admins SET avatar_path = NULL WHERE id = $1', [admin.id]);
  const updated = await findAdminById(admin.id);
  res.json({ user: publicAdmin(updated) });
}));

app.put('/api/admin/password', requireAdmin, asyncHandler(async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Хуучин болон шинэ нууц үгээ оруулна уу' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Шинэ нууц үг доод тал нь 4 тэмдэгт байх ёстой' });
  }

  const admin = (await findAdminById(req.user.id)) || (await findAdminByUsername(req.user.username));
  if (!admin) return res.status(404).json({ error: 'Админ олдсонгүй' });
  if (!bcrypt.compareSync(currentPassword, admin.password_hash)) {
    return res.status(401).json({ error: 'Хуучин нууц үг буруу байна' });
  }

  await db.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(newPassword, 10), admin.id]);
  res.json({ ok: true });
}));

async function loadOrdersByPhone(phone) {
  if (phone) {
    const filtered = await db.query('SELECT * FROM orders WHERE phone = $1 ORDER BY created_at DESC, id DESC', [phone]);
    return filtered.rows;
  }
  const all = await db.query('SELECT * FROM orders ORDER BY created_at DESC, id DESC');
  return all.rows;
}

app.get('/api/admin/orders', requireAdmin, asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  const orders = await loadOrdersByPhone(phone);
  res.json({ orders });
}));

app.get('/api/admin/orders/export', requireAdmin, asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  const orders = await loadOrdersByPhone(phone);
  const buffer = await buildOrdersWorkbook(orders);
  const filename = phone ? `cargo-orders-${phone}.xlsx` : 'cargo-orders-all.xlsx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}));

app.get('/api/admin/customers', requireAdmin, asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();

  const result = q
    ? await db.query(
      `
      SELECT
        c.id,
        c.phone,
        c.name,
        c.address,
        c.profile_note,
        c.avatar_path,
        c.created_at,
        COUNT(o.id)::int AS order_count
      FROM customers c
      LEFT JOIN orders o ON o.phone = c.phone
      WHERE c.phone ILIKE $1 OR c.name ILIKE $2 OR c.address ILIKE $3
      GROUP BY c.id
      ORDER BY c.created_at DESC
      `,
      [`%${q}%`, `%${q}%`, `%${q}%`]
    )
    : await db.query(
      `
      SELECT
        c.id,
        c.phone,
        c.name,
        c.address,
        c.profile_note,
        c.avatar_path,
        c.created_at,
        COUNT(o.id)::int AS order_count
      FROM customers c
      LEFT JOIN orders o ON o.phone = c.phone
      GROUP BY c.id
      ORDER BY c.created_at DESC
      `
    );

  const customers = result.rows.map((c) => ({ ...publicCustomer(c), order_count: Number(c.order_count || 0) }));
  res.json({ customers });
}));

app.get('/api/admin/customers/:id', requireAdmin, asyncHandler(async (req, res) => {
  const customer = await findCustomerById(Number(req.params.id));
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });

  const ordersResult = await db.query(
    'SELECT * FROM orders WHERE phone = $1 ORDER BY created_at DESC, id DESC',
    [customer.phone]
  );

  res.json({
    user: {
      ...publicCustomer(customer),
      order_count: ordersResult.rows.length,
    },
    orders: ordersResult.rows,
  });
}));

app.put('/api/admin/customers/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const customer = await findCustomerById(id);
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });

  const phone = normalizePhone(req.body.phone);
  const name = String(req.body.name || '').trim();
  const address = String(req.body.address || '').trim();
  const profile_note = String(req.body.profile_note || '').trim();

  if (!phone || !name) {
    return res.status(400).json({ error: 'Утас болон нэр заавал шаардлагатай' });
  }

  const phoneOwner = await findCustomerByPhone(phone);
  if (phoneOwner && Number(phoneOwner.id) !== id) {
    return res.status(409).json({ error: 'Энэ утасны дугаар өөр хэрэглэгчид бүртгэлтэй байна' });
  }

  await db.withTransaction(async (client) => {
    if (phone !== customer.phone) {
      await client.query(
        'UPDATE orders SET phone = $1, customer_id = $2 WHERE phone = $3',
        [phone, customer.id, customer.phone]
      );
    }
    await client.query(
      'UPDATE customers SET phone = $1, name = $2, address = $3, profile_note = $4 WHERE id = $5',
      [phone, name, address, profile_note, id]
    );
  });

  const updated = await findCustomerById(id);
  const countResult = await db.query('SELECT COUNT(*)::int AS count FROM orders WHERE phone = $1', [updated.phone]);
  res.json({
    user: {
      ...publicCustomer(updated),
      order_count: Number(countResult.rows[0].count || 0),
    },
  });
}));

app.put('/api/admin/customers/:id/password', requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const customer = await findCustomerById(id);
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });

  const newPassword = String(req.body.newPassword || '');
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Нууц үг доод тал нь 4 тэмдэгт байх ёстой' });
  }

  await db.query('UPDATE customers SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(newPassword, 10), id]);
  res.json({ ok: true });
}));

app.delete('/api/admin/customers/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const customer = await findCustomerById(id);
  if (!customer) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });

  const deleteWithOrders = String(req.query.deleteOrders || '') === '1';

  await db.withTransaction(async (client) => {
    if (deleteWithOrders) {
      await client.query('DELETE FROM orders WHERE phone = $1', [customer.phone]);
    } else {
      await client.query('UPDATE orders SET customer_id = NULL WHERE customer_id = $1', [customer.id]);
    }
    deleteAvatarFile(customer.avatar_path);
    await client.query('DELETE FROM customers WHERE id = $1', [id]);
  });

  res.json({ ok: true });
}));

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

app.post('/api/admin/orders', requireAdmin, asyncHandler(async (req, res) => {
  const payload = buildOrderPayload(req.body);
  if (!payload.phone || !payload.code) {
    return res.status(400).json({ error: 'Утасны дугаар болон код заавал шаардлагатай' });
  }

  const customer = await findCustomerByPhone(payload.phone);
  const inserted = await db.query(
    `
    INSERT INTO orders (customer_id, phone, code, item_name, quantity, unit_price, total_price, status, tracking_code, note)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
    `,
    [customer ? customer.id : null, payload.phone, payload.code, payload.item_name, payload.quantity, payload.unit_price, payload.total_price, payload.status, payload.tracking_code, payload.note]
  );

  res.json({ order: inserted.rows[0] });
}));

app.put('/api/admin/orders/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existingResult = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
  const existing = existingResult.rows[0];
  if (!existing) return res.status(404).json({ error: 'Захиалга олдсонгүй' });

  const payload = buildOrderPayload(req.body);
  if (!payload.phone || !payload.code) {
    return res.status(400).json({ error: 'Утасны дугаар болон код заавал шаардлагатай' });
  }

  const customer = await findCustomerByPhone(payload.phone);
  await db.query(
    `
    UPDATE orders SET
      customer_id = $1,
      phone = $2,
      code = $3,
      item_name = $4,
      quantity = $5,
      unit_price = $6,
      total_price = $7,
      status = $8,
      tracking_code = $9,
      note = $10,
      updated_at = now()
    WHERE id = $11
    `,
    [customer ? customer.id : null, payload.phone, payload.code, payload.item_name, payload.quantity, payload.unit_price, payload.total_price, payload.status, payload.tracking_code, payload.note, id]
  );

  const updated = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
  res.json({ order: updated.rows[0] });
}));

app.delete('/api/admin/orders/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.query('SELECT id FROM orders WHERE id = $1', [id]);
  if (existing.rowCount === 0) return res.status(404).json({ error: 'Захиалга олдсонгүй' });
  await db.query('DELETE FROM orders WHERE id = $1', [id]);
  res.json({ ok: true });
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Серверийн алдаа гарлаа' });
});

if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Cargo server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
