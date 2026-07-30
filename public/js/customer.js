'use strict';

const TOKEN_KEY = 'cargo_customer_token';

const authView = document.getElementById('authView');
const dashView = document.getElementById('dashView');
const profileView = document.getElementById('profileView');
const authMsg = document.getElementById('authMsg');
const logoutLink = document.getElementById('logoutLink');
const ordersNavLink = document.getElementById('ordersNavLink');
const profileNavLink = document.getElementById('profileNavLink');

const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const profileForm = document.getElementById('profileForm');
const passwordForm = document.getElementById('passwordForm');
const profileMsg = document.getElementById('profileMsg');
const passwordMsg = document.getElementById('passwordMsg');
const avatarMsg = document.getElementById('avatarMsg');
const avatarInput = document.getElementById('avatarInput');
const avatarPreview = document.getElementById('avatarPreview');
const avatarPlaceholder = document.getElementById('avatarPlaceholder');
const removeAvatarBtn = document.getElementById('removeAvatarBtn');
const exportOrdersBtn = document.getElementById('exportOrdersBtn');

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

logoutLink.addEventListener('click', (e) => {
  e.preventDefault();
  TokenStore.clear(TOKEN_KEY);
  showAuth();
});

ordersNavLink.addEventListener('click', (e) => {
  e.preventDefault();
  loadDashboard();
});

profileNavLink.addEventListener('click', (e) => {
  e.preventDefault();
  loadProfile();
});

exportOrdersBtn.addEventListener('click', async () => {
  const token = TokenStore.get(TOKEN_KEY);
  if (!token) return showAuth();
  try {
    await downloadFile('/api/my/orders/export', {
      token,
      filename: 'cargo-orders.xlsx',
    });
  } catch (err) {
    alert(err.message);
  }
});

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg(profileMsg);
  const token = TokenStore.get(TOKEN_KEY);
  if (!token) return showAuth();

  try {
    const data = await api('/api/my/profile', {
      method: 'PUT',
      token,
      body: {
        name: document.getElementById('profileName').value,
        address: document.getElementById('profileAddress').value,
        profile_note: document.getElementById('profileNote').value,
      },
    });
    TokenStore.set(TOKEN_KEY, data.token);
    fillProfile(data.user);
    showMsg(profileMsg, 'Мэдээлэл хадгалагдлаа.', 'success');
  } catch (err) {
    showMsg(profileMsg, err.message);
  }
});

passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg(passwordMsg);
  const token = TokenStore.get(TOKEN_KEY);
  if (!token) return showAuth();

  const newPassword = document.getElementById('newPassword').value;
  const confirm = document.getElementById('newPasswordConfirm').value;
  if (newPassword !== confirm) {
    showMsg(passwordMsg, 'Шинэ нууц үг таарахгүй байна');
    return;
  }

  try {
    await api('/api/my/password', {
      method: 'PUT',
      token,
      body: {
        currentPassword: document.getElementById('currentPassword').value,
        newPassword,
      },
    });
    passwordForm.reset();
    showMsg(passwordMsg, 'Нууц үг амжилттай солигдлоо.', 'success');
  } catch (err) {
    showMsg(passwordMsg, err.message);
  }
});

avatarInput.addEventListener('change', async () => {
  hideMsg(avatarMsg);
  const file = avatarInput.files && avatarInput.files[0];
  if (!file) return;

  const token = TokenStore.get(TOKEN_KEY);
  if (!token) return showAuth();

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const res = await fetch('/api/my/avatar', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Зураг оруулахад алдаа гарлаа');
    fillProfile(data.user);
    showMsg(avatarMsg, 'Зураг амжилттай хадгалагдлаа.', 'success');
  } catch (err) {
    showMsg(avatarMsg, err.message);
  } finally {
    avatarInput.value = '';
  }
});

removeAvatarBtn.addEventListener('click', async () => {
  hideMsg(avatarMsg);
  const token = TokenStore.get(TOKEN_KEY);
  if (!token) return showAuth();

  try {
    const data = await api('/api/my/avatar', { method: 'DELETE', token });
    fillProfile(data.user);
    showMsg(avatarMsg, 'Зураг устгагдлаа.', 'success');
  } catch (err) {
    showMsg(avatarMsg, err.message);
  }
});

function showAuth() {
  authView.classList.remove('hidden');
  dashView.classList.add('hidden');
  profileView.classList.add('hidden');
  logoutLink.classList.add('hidden');
  ordersNavLink.classList.add('hidden');
  profileNavLink.classList.add('hidden');
  ordersNavLink.classList.remove('active');
  profileNavLink.classList.remove('active');
}

function showLoggedInNav(active) {
  logoutLink.classList.remove('hidden');
  ordersNavLink.classList.remove('hidden');
  profileNavLink.classList.remove('hidden');
  ordersNavLink.classList.toggle('active', active === 'orders');
  profileNavLink.classList.toggle('active', active === 'profile');
}

function showDash() {
  authView.classList.add('hidden');
  dashView.classList.remove('hidden');
  profileView.classList.add('hidden');
  showLoggedInNav('orders');
}

function showProfile() {
  authView.classList.add('hidden');
  dashView.classList.add('hidden');
  profileView.classList.remove('hidden');
  showLoggedInNav('profile');
  hideMsg(profileMsg);
  hideMsg(passwordMsg);
  hideMsg(avatarMsg);
}

function setAvatar(user) {
  const initial = (user.name || '?').trim().charAt(0).toUpperCase() || '?';
  avatarPlaceholder.textContent = initial;

  if (user.avatar_url) {
    avatarPreview.src = user.avatar_url + '?t=' + Date.now();
    avatarPreview.classList.remove('hidden');
    avatarPlaceholder.classList.add('hidden');
  } else {
    avatarPreview.removeAttribute('src');
    avatarPreview.classList.add('hidden');
    avatarPlaceholder.classList.remove('hidden');
  }
}

function fillProfile(user) {
  document.getElementById('profilePhone').value = user.phone || '';
  document.getElementById('profileName').value = user.name || '';
  document.getElementById('profileAddress').value = user.address || '';
  document.getElementById('profileNote').value = user.profile_note || '';
  setAvatar(user);
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

  const groups = [];
  let currentGroup = [];
  for (const o of orders) {
    if (currentGroup.length === 0 || currentGroup[0].created_at === o.created_at) {
      currentGroup.push(o);
    } else {
      groups.push(currentGroup);
      currentGroup = [o];
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  body.innerHTML = groups
    .map((group) => {
      let html = '';
      const rowspan = group.length;
      group.forEach((o, index) => {
        html += `<tr>`;
        if (index === 0) {
          html += `<td rowspan="${rowspan}" style="vertical-align: middle; color: var(--muted);">${formatDate(group[0].created_at)}</td>`;
        }
        html += `
          <td>${escapeHtml(o.code || o.item_name)}</td>
          <td>${formatMoney(o.unit_price)}</td>
          <td>${formatMoney(o.total_price)}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${escapeHtml(o.tracking_code) || '<span class="muted">—</span>'}</td>
          <td>${escapeHtml(o.note) || '<span class="muted">—</span>'}</td>
        </tr>`;
      });
      return html;
    })
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
    TokenStore.clear(TOKEN_KEY);
    showAuth();
  }
}

async function loadProfile() {
  const token = TokenStore.get(TOKEN_KEY);
  if (!token) return showAuth();

  try {
    const data = await api('/api/my/profile', { token });
    fillProfile(data.user);
    passwordForm.reset();
    showProfile();
  } catch (err) {
    TokenStore.clear(TOKEN_KEY);
    showAuth();
  }
}

loadDashboard();
