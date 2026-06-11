'use strict';

const TOKEN_KEY = 'mc_admin_token';

const loginView = document.getElementById('loginView');
const panelView = document.getElementById('panelView');
const logoutLink = document.getElementById('logoutLink');
const loginMsg = document.getElementById('loginMsg');
const formMsg = document.getElementById('formMsg');

const adminLoginForm = document.getElementById('adminLoginForm');
const orderForm = document.getElementById('orderForm');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const formTitle = document.getElementById('formTitle');

let currentOrders = [];

function token() { return TokenStore.get(TOKEN_KEY); }

// ---- Login ----
adminLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg(loginMsg);
  try {
    const data = await api('/api/admin/login', {
      method: 'POST',
      body: {
        username: document.getElementById('adminUsername').value,
        password: document.getElementById('adminPassword').value,
      },
    });
    TokenStore.set(TOKEN_KEY, data.token);
    showPanel();
    loadOrders();
  } catch (err) {
    showMsg(loginMsg, err.message);
  }
});

logoutLink.addEventListener('click', (e) => {
  e.preventDefault();
  TokenStore.clear(TOKEN_KEY);
  showLogin();
});

function showLogin() {
  loginView.classList.remove('hidden');
  panelView.classList.add('hidden');
  logoutLink.classList.add('hidden');
}

function showPanel() {
  loginView.classList.add('hidden');
  panelView.classList.remove('hidden');
  logoutLink.classList.remove('hidden');
}

// ---- Form: add or update ----
orderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg(formMsg);

  const id = document.getElementById('orderId').value;
  const payload = {
    phone: document.getElementById('fPhone').value,
    code: document.getElementById('fCode').value,
    unit_price: document.getElementById('fUnit').value,
    total_price: document.getElementById('fTotal').value,
  };

  try {
    if (id) {
      await api('/api/admin/orders/' + id, { method: 'PUT', body: payload, token: token() });
      showMsg(formMsg, 'Захиалга шинэчлэгдлээ.', 'success');
    } else {
      await api('/api/admin/orders', { method: 'POST', body: payload, token: token() });
      showMsg(formMsg, 'Захиалга нэмэгдлээ.', 'success');
    }
    resetForm();
    loadOrders(document.getElementById('searchPhone').value);
  } catch (err) {
    showMsg(formMsg, err.message);
  }
});

cancelEditBtn.addEventListener('click', resetForm);

function resetForm() {
  orderForm.reset();
  document.getElementById('orderId').value = '';
  document.getElementById('fCode').value = '';
  document.getElementById('fUnit').value = '0';
  formTitle.textContent = 'Шинэ захиалга нэмэх';
  submitBtn.textContent = 'Захиалга нэмэх';
  cancelEditBtn.classList.add('hidden');
}

function startEdit(order) {
  document.getElementById('orderId').value = order.id;
  document.getElementById('fPhone').value = order.phone;
  document.getElementById('fCode').value = order.code || order.item_name;
  document.getElementById('fUnit').value = order.unit_price;
  document.getElementById('fTotal').value = order.total_price;

  formTitle.textContent = 'Захиалга засах #' + order.id;
  submitBtn.textContent = 'Хадгалах';
  cancelEditBtn.classList.remove('hidden');
  hideMsg(formMsg);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteOrder(id) {
  if (!confirm('Энэ захиалгыг устгах уу?')) return;
  try {
    await api('/api/admin/orders/' + id, { method: 'DELETE', token: token() });
    loadOrders(document.getElementById('searchPhone').value);
  } catch (err) {
    alert(err.message);
  }
}

// ---- Search ----
document.getElementById('searchBtn').addEventListener('click', () => {
  loadOrders(document.getElementById('searchPhone').value);
});
document.getElementById('clearSearchBtn').addEventListener('click', () => {
  document.getElementById('searchPhone').value = '';
  loadOrders();
});

// ---- Render ----
function renderStats(orders) {
  const total = orders.length;
  const received = orders.filter((o) => o.status === 'received').length;
  const pending = orders.filter((o) => o.status !== 'received').length;
  const sum = orders.reduce((s, o) => s + Number(o.total_price || 0), 0);
  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="num">${total}</div><div class="lbl">Нийт захиалга</div></div>
    <div class="stat"><div class="num">${received}</div><div class="lbl">Хүлээж авсан</div></div>
    <div class="stat"><div class="num">${pending}</div><div class="lbl">Хүлээгдэж буй</div></div>
    <div class="stat"><div class="num">${formatMoney(sum)}</div><div class="lbl">Нийт дүн</div></div>
  `;
}

function renderOrders(orders) {
  const body = document.getElementById('ordersBody');
  const empty = document.getElementById('ordersEmpty');
  const table = document.getElementById('ordersTable');

  if (!orders.length) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
    table.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  table.classList.remove('hidden');

  body.innerHTML = orders
    .map(
      (o) => `
      <tr>
        <td>${formatDate(o.created_at)}</td>
        <td>${escapeHtml(o.phone)}</td>
        <td>${escapeHtml(o.code || o.item_name)}</td>
        <td>${formatMoney(o.unit_price)}</td>
        <td>${formatMoney(o.total_price)}</td>
        <td>
          <div class="actions">
            <button class="btn small secondary" data-edit="${o.id}">Засах</button>
            <button class="btn small danger" data-del="${o.id}">Устгах</button>
          </div>
        </td>
      </tr>`
    )
    .join('');

  body.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = currentOrders.find((o) => o.id == btn.dataset.edit);
      if (order) startEdit(order);
    });
  });
  body.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => deleteOrder(btn.dataset.del));
  });
}

async function loadOrders(phone) {
  try {
    const qs = phone ? '?phone=' + encodeURIComponent(phone) : '';
    const data = await api('/api/admin/orders' + qs, { token: token() });
    currentOrders = data.orders;
    renderStats(data.orders);
    renderOrders(data.orders);
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      TokenStore.clear(TOKEN_KEY);
      showLogin();
    } else {
      alert(err.message);
    }
  }
}

// On load
if (token()) {
  showPanel();
  loadOrders();
} else {
  showLogin();
}
