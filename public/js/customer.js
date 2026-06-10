'use strict';

const TOKEN_KEY = 'mc_customer_token';

const authView = document.getElementById('authView');
const dashView = document.getElementById('dashView');
const authMsg = document.getElementById('authMsg');
const logoutLink = document.getElementById('logoutLink');

const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

// ---- Tab switching ----
tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  hideMsg(authMsg);
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  hideMsg(authMsg);
});

// ---- Login ----
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg(authMsg);
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: {
        phone: document.getElementById('loginPhone').value,
        password: document.getElementById('loginPassword').value,
      },
    });
    TokenStore.set(TOKEN_KEY, data.token);
    loadDashboard();
  } catch (err) {
    showMsg(authMsg, err.message);
  }
});

// ---- Register ----
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg(authMsg);
  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: {
        phone: document.getElementById('regPhone').value,
        name: document.getElementById('regName').value,
        password: document.getElementById('regPassword').value,
      },
    });
    TokenStore.set(TOKEN_KEY, data.token);
    loadDashboard();
  } catch (err) {
    showMsg(authMsg, err.message);
  }
});

// ---- Logout ----
logoutLink.addEventListener('click', (e) => {
  e.preventDefault();
  TokenStore.clear(TOKEN_KEY);
  showAuth();
});

function showAuth() {
  authView.classList.remove('hidden');
  dashView.classList.add('hidden');
  logoutLink.classList.add('hidden');
}

function showDash() {
  authView.classList.add('hidden');
  dashView.classList.remove('hidden');
  logoutLink.classList.remove('hidden');
}

function renderStats(orders) {
  const total = orders.length;
  const received = orders.filter((o) => o.status === 'received').length;
  const pending = orders.filter((o) => o.status !== 'received').length;
  const totalDue = orders.reduce((sum, o) => sum + Number(o.total_price || 0), 0);

  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="num">${total}</div><div class="lbl">Нийт захиалга</div></div>
    <div class="stat"><div class="num">${received}</div><div class="lbl">Хүлээж авсан</div></div>
    <div class="stat"><div class="num">${pending}</div><div class="lbl">Хүлээгдэж буй</div></div>
    <div class="stat"><div class="num">${formatMoney(totalDue)}</div><div class="lbl">Нийт дүн</div></div>
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
        <td>${escapeHtml(o.item_name)}</td>
        <td>${o.quantity}</td>
        <td>${formatMoney(o.unit_price)}</td>
        <td>${formatMoney(o.total_price)}</td>
        <td>${statusBadge(o.status)}</td>
        <td>${escapeHtml(o.tracking_code) || '<span class="muted">—</span>'}</td>
        <td>${escapeHtml(o.note) || '<span class="muted">—</span>'}</td>
      </tr>`
    )
    .join('');
}

async function loadDashboard() {
  const token = TokenStore.get(TOKEN_KEY);
  if (!token) return showAuth();

  try {
    const data = await api('/api/my/orders', { token });
    document.getElementById('welcome').textContent = `Сайн байна уу, ${data.user.name}!`;
    document.getElementById('phoneLine').textContent = `Утас: ${data.user.phone}`;
    renderStats(data.orders);
    renderOrders(data.orders);
    showDash();
  } catch (err) {
    // Token invalid/expired -> back to login
    TokenStore.clear(TOKEN_KEY);
    showAuth();
  }
}

// On load
loadDashboard();
