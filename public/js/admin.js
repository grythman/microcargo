'use strict';

const TOKEN_KEY = 'cargo_admin_token';

const loginView = document.getElementById('loginView');
const panelView = document.getElementById('panelView');
const usersView = document.getElementById('usersView');
const profileView = document.getElementById('profileView');
const logoutLink = document.getElementById('logoutLink');
const ordersNavLink = document.getElementById('ordersNavLink');
const usersNavLink = document.getElementById('usersNavLink');
const loginMsg = document.getElementById('loginMsg');
const formMsg = document.getElementById('formMsg');
const userEditMsg = document.getElementById('userEditMsg');
const userPasswordMsg = document.getElementById('userPasswordMsg');
const userEditCard = document.getElementById('userEditCard');
const userEditForm = document.getElementById('userEditForm');
const userPasswordForm = document.getElementById('userPasswordForm');

let currentUsers = [];

const topProfileBtn = document.getElementById('topProfileBtn');
const topAvatarImg = document.getElementById('topAvatarImg');
const topAvatarInitial = document.getElementById('topAvatarInitial');
const topProfileName = document.getElementById('topProfileName');

const profileForm = document.getElementById('profileForm');
const passwordForm = document.getElementById('passwordForm');
const profileMsg = document.getElementById('profileMsg');
const passwordMsg = document.getElementById('passwordMsg');
const avatarMsg = document.getElementById('avatarMsg');
const avatarInput = document.getElementById('avatarInput');
const avatarPreview = document.getElementById('avatarPreview');
const avatarPlaceholder = document.getElementById('avatarPlaceholder');
const removeAvatarBtn = document.getElementById('removeAvatarBtn');

const adminLoginForm = document.getElementById('adminLoginForm');
const orderForm = document.getElementById('orderForm');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const formTitle = document.getElementById('formTitle');

let currentOrders = [];
let lineItems = [];

function token() { return TokenStore.get(TOKEN_KEY); }

function calcItemTotal(unitPrice, quantity) {
  return lineTotal(unitPrice, quantity);
}

function updateGrandTotal() {
  const total = lineItems.reduce(
    (sum, item) => sum + calcItemTotal(item.unit_price, item.quantity),
    0
  );
  document.getElementById('grandTotal').textContent = formatMoney(total);
  const section = document.getElementById('grandTotalSection');
  section.style.display = lineItems.length > 0 ? 'block' : 'none';
}

function renderLineItems() {
  const body = document.getElementById('lineItemsBody');
  const table = document.getElementById('lineItemsTable');
  const empty = document.getElementById('lineItemsEmpty');

  if (lineItems.length === 0) {
    body.innerHTML = '';
    table.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  table.style.display = 'table';

  body.innerHTML = lineItems.map((item, idx) => `
    <tr>
      <td>${escapeHtml(item.code)}</td>
      <td>${item.quantity}</td>
      <td>${formatMoney(item.unit_price)}</td>
      <td>${formatMoney(calcItemTotal(item.unit_price, item.quantity))}</td>
      <td>
        <button type="button" class="btn small danger" data-remove="${idx}" style="padding: 4px 8px; font-size: 0.75rem;">Устгах</button>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      lineItems.splice(Number(btn.dataset.remove), 1);
      renderLineItems();
      updateGrandTotal();
    });
  });

  updateGrandTotal();
}

document.getElementById('addItemBtn').addEventListener('click', (e) => {
  e.preventDefault();
  const code = document.getElementById('fCode').value.trim();
  const quantity = Math.max(1, Number(document.getElementById('fQty').value || 1));
  const unitPrice = Number(document.getElementById('fUnit').value || 0);
  if (!code) {
    alert('Код оруулна уу');
    return;
  }
  // Ижил код (+ ижил нэгж үнэ) байвал ширхэг нэмнэ — давхар мөр үүсгэхгүй
  const existing = lineItems.find(
    (item) => item.code === code && Number(item.unit_price) === unitPrice
  );
  if (existing) {
    existing.quantity += quantity;
  } else {
    lineItems.push({ code, quantity, unit_price: unitPrice });
  }
  renderLineItems();
  document.getElementById('fCode').value = '';
  document.getElementById('fQty').value = '1';
  document.getElementById('fUnit').value = '0';
});

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
    setTopProfile(data.user);
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

ordersNavLink.addEventListener('click', (e) => {
  e.preventDefault();
  showPanel();
  loadOrders(document.getElementById('searchPhone').value);
});

usersNavLink.addEventListener('click', (e) => {
  e.preventDefault();
  showUsers();
  loadUsers();
});

topProfileBtn.addEventListener('click', (e) => {
  e.preventDefault();
  loadProfile();
});

document.getElementById('userSearchBtn').addEventListener('click', () => {
  loadUsers(document.getElementById('userSearch').value);
});
document.getElementById('userClearBtn').addEventListener('click', () => {
  document.getElementById('userSearch').value = '';
  loadUsers();
});
document.getElementById('userEditCancelBtn').addEventListener('click', () => {
  userEditCard.classList.add('hidden');
  hideMsg(userEditMsg);
  hideMsg(userPasswordMsg);
});

userEditForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg(userEditMsg);
  const id = document.getElementById('editUserId').value;
  try {
    await api('/api/admin/customers/' + id, {
      method: 'PUT',
      token: token(),
      body: {
        name: document.getElementById('editUserName').value,
        phone: document.getElementById('editUserPhone').value,
        address: document.getElementById('editUserAddress').value,
        profile_note: document.getElementById('editUserNote').value,
      },
    });
    showMsg(userEditMsg, 'Хэрэглэгч хадгалагдлаа.', 'success');
    loadUsers(document.getElementById('userSearch').value);
  } catch (err) {
    showMsg(userEditMsg, err.message);
  }
});

userPasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg(userPasswordMsg);
  const id = document.getElementById('editUserId').value;
  try {
    await api('/api/admin/customers/' + id + '/password', {
      method: 'PUT',
      token: token(),
      body: { newPassword: document.getElementById('editUserPassword').value },
    });
    document.getElementById('editUserPassword').value = '';
    showMsg(userPasswordMsg, 'Нууц үг reset хийгдлээ.', 'success');
  } catch (err) {
    showMsg(userPasswordMsg, err.message);
  }
});

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg(profileMsg);
  if (!token()) return showLogin();
  try {
    const data = await api('/api/admin/profile', {
      method: 'PUT',
      token: token(),
      body: {
        name: document.getElementById('profileName').value,
        phone: document.getElementById('profilePhone').value,
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
  if (!token()) return showLogin();

  const newPassword = document.getElementById('newPassword').value;
  const confirm = document.getElementById('newPasswordConfirm').value;
  if (newPassword !== confirm) {
    showMsg(passwordMsg, 'Шинэ нууц үг таарахгүй байна');
    return;
  }

  try {
    await api('/api/admin/password', {
      method: 'PUT',
      token: token(),
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
  if (!token()) return showLogin();

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const res = await fetch('/api/admin/avatar', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token() },
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
  if (!token()) return showLogin();
  try {
    const data = await api('/api/admin/avatar', { method: 'DELETE', token: token() });
    fillProfile(data.user);
    showMsg(avatarMsg, 'Зураг устгагдлаа.', 'success');
  } catch (err) {
    showMsg(avatarMsg, err.message);
  }
});

function showLogin() {
  loginView.classList.remove('hidden');
  panelView.classList.add('hidden');
  usersView.classList.add('hidden');
  profileView.classList.add('hidden');
  logoutLink.classList.add('hidden');
  ordersNavLink.classList.add('hidden');
  usersNavLink.classList.add('hidden');
  topProfileBtn.classList.add('hidden');
  ordersNavLink.classList.remove('active');
  usersNavLink.classList.remove('active');
  topProfileBtn.classList.remove('active');
}

function showLoggedInNav(active) {
  logoutLink.classList.remove('hidden');
  ordersNavLink.classList.remove('hidden');
  usersNavLink.classList.remove('hidden');
  topProfileBtn.classList.remove('hidden');
  ordersNavLink.classList.toggle('active', active === 'orders');
  usersNavLink.classList.toggle('active', active === 'users');
  topProfileBtn.classList.toggle('active', active === 'profile');
}

function showPanel() {
  loginView.classList.add('hidden');
  panelView.classList.remove('hidden');
  usersView.classList.add('hidden');
  profileView.classList.add('hidden');
  showLoggedInNav('orders');
}

function showUsers() {
  loginView.classList.add('hidden');
  panelView.classList.add('hidden');
  usersView.classList.remove('hidden');
  profileView.classList.add('hidden');
  userEditCard.classList.add('hidden');
  showLoggedInNav('users');
}

function showProfile() {
  loginView.classList.add('hidden');
  panelView.classList.add('hidden');
  usersView.classList.add('hidden');
  profileView.classList.remove('hidden');
  showLoggedInNav('profile');
  hideMsg(profileMsg);
  hideMsg(passwordMsg);
  hideMsg(avatarMsg);
}

function renderUsersStats(users) {
  const total = users.length;
  const withOrders = users.filter((u) => Number(u.order_count) > 0).length;
  const ordersSum = users.reduce((s, u) => s + Number(u.order_count || 0), 0);
  document.getElementById('usersStats').innerHTML = `
    <div class="stat"><div class="num">${total}</div><div class="lbl">Нийт хэрэглэгч</div></div>
    <div class="stat"><div class="num">${withOrders}</div><div class="lbl">Захиалгатай</div></div>
    <div class="stat"><div class="num">${ordersSum}</div><div class="lbl">Нийт захиалга</div></div>
  `;
}

function userAvatarHtml(user) {
  const initial = (user.name || '?').trim().charAt(0).toUpperCase() || '?';
  if (user.avatar_url) {
    return `<span class="user-avatar"><img src="${escapeHtml(user.avatar_url)}" alt="" /></span>`;
  }
  return `<span class="user-avatar">${escapeHtml(initial)}</span>`;
}

function startUserEdit(user) {
  document.getElementById('editUserId').value = user.id;
  document.getElementById('editUserName').value = user.name || '';
  document.getElementById('editUserPhone').value = user.phone || '';
  document.getElementById('editUserAddress').value = user.address || '';
  document.getElementById('editUserNote').value = user.profile_note || '';
  document.getElementById('editUserPassword').value = '';
  document.getElementById('userEditTitle').textContent = 'Хэрэглэгч засах — ' + (user.name || user.phone);
  userEditCard.classList.remove('hidden');
  hideMsg(userEditMsg);
  hideMsg(userPasswordMsg);
  userEditCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteUser(id) {
  const user = currentUsers.find((u) => u.id == id);
  if (!user) return;
  if (!confirm(`"${user.name}" (${user.phone}) хэрэглэгчийг устгах уу?`)) return;
  const alsoOrders = confirm('Түүний захиалгуудыг ч хамт устгах уу?');
  try {
    const qs = alsoOrders ? '?deleteOrders=1' : '';
    await api('/api/admin/customers/' + id + qs, { method: 'DELETE', token: token() });
    userEditCard.classList.add('hidden');
    loadUsers(document.getElementById('userSearch').value);
  } catch (err) {
    alert(err.message);
  }
}

function renderUsers(users) {
  const body = document.getElementById('usersBody');
  const empty = document.getElementById('usersEmpty');
  const table = document.getElementById('usersTable');

  if (!users.length) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
    table.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  table.classList.remove('hidden');

  body.innerHTML = users.map((u) => `
    <tr>
      <td>${userAvatarHtml(u)}</td>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.phone)}</td>
      <td>${escapeHtml(u.address) || '<span class="muted">—</span>'}</td>
      <td>${Number(u.order_count || 0)}</td>
      <td>${formatDate(u.created_at)}</td>
      <td>
        <div class="actions">
          <button class="btn small secondary" data-user-edit="${u.id}">Засах</button>
          <button class="btn small danger" data-user-del="${u.id}">Устгах</button>
        </div>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('[data-user-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const user = currentUsers.find((u) => u.id == btn.dataset.userEdit);
      if (user) startUserEdit(user);
    });
  });
  body.querySelectorAll('[data-user-del]').forEach((btn) => {
    btn.addEventListener('click', () => deleteUser(btn.dataset.userDel));
  });
}

async function loadUsers(q) {
  try {
    const qs = q ? '?q=' + encodeURIComponent(q) : '';
    const data = await api('/api/admin/customers' + qs, { token: token() });
    currentUsers = data.customers;
    renderUsersStats(data.customers);
    renderUsers(data.customers);
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      TokenStore.clear(TOKEN_KEY);
      showLogin();
    } else {
      alert(err.message);
    }
  }
}

function setTopProfile(user) {
  const name = user.name || user.username || 'Админ';
  const initial = name.trim().charAt(0).toUpperCase() || 'А';
  topProfileName.textContent = name;
  topAvatarInitial.textContent = initial;

  if (user.avatar_url) {
    topAvatarImg.src = user.avatar_url + '?t=' + Date.now();
    topAvatarImg.classList.remove('hidden');
  } else {
    topAvatarImg.removeAttribute('src');
    topAvatarImg.classList.add('hidden');
  }
}

function setAvatar(user) {
  const name = user.name || user.username || 'А';
  const initial = name.trim().charAt(0).toUpperCase() || 'А';
  avatarPlaceholder.textContent = initial;
  setTopProfile(user);

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
  document.getElementById('profileUsername').value = user.username || '';
  document.getElementById('profileName').value = user.name || '';
  document.getElementById('profilePhone').value = user.phone || '';
  document.getElementById('profileAddress').value = user.address || '';
  document.getElementById('profileNote').value = user.profile_note || '';
  setAvatar(user);
}

async function loadProfile() {
  if (!token()) return showLogin();
  try {
    const data = await api('/api/admin/profile', { token: token() });
    fillProfile(data.user);
    passwordForm.reset();
    showProfile();
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      TokenStore.clear(TOKEN_KEY);
      showLogin();
    } else {
      alert(err.message);
    }
  }
}

orderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg(formMsg);

  const id = document.getElementById('orderId').value;
  const phone = document.getElementById('fPhone').value.trim();

  if (!phone) {
    showMsg(formMsg, 'Утасны дугаар оруулна уу');
    return;
  }

  try {
    if (id) {
      const qty = Math.max(1, Number(document.getElementById('fQtyEdit').value || 1));
      const unit = Number(document.getElementById('fUnitEdit').value || 0);
      const totalInput = document.getElementById('fTotalEdit').value;
      const payload = {
        phone,
        code: document.getElementById('fCodeEdit').value,
        quantity: qty,
        unit_price: unit,
        total_price: totalInput ? Number(totalInput) : calcItemTotal(unit, qty),
      };
      await api('/api/admin/orders/' + id, { method: 'PUT', body: payload, token: token() });

      // Нэгтгэсэн давхар мөрүүдийг устгана (хадгалсан үндсэн мөрөөс бусад)
      const extraIds = (window._editExtraIds || []).filter((x) => String(x) !== String(id));
      for (const extraId of extraIds) {
        await api('/api/admin/orders/' + extraId, { method: 'DELETE', token: token() });
      }
      window._editExtraIds = [];
      showMsg(formMsg, 'Захиалга шинэчлэгдлээ.', 'success');
    } else {
      if (lineItems.length === 0) {
        showMsg(formMsg, 'Дор хаяж нэг бараа нэмэнэ үү');
        return;
      }
      for (const item of lineItems) {
        await api('/api/admin/orders', {
          method: 'POST',
          body: {
            phone,
            code: item.code,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: calcItemTotal(item.unit_price, item.quantity),
          },
          token: token(),
        });
      }
      showMsg(formMsg, `${lineItems.length} бараа нэмэгдлээ.`, 'success');
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
  document.getElementById('fQty').value = '1';
  document.getElementById('fUnit').value = '0';
  window._editExtraIds = [];
  lineItems = [];
  renderLineItems();
  formTitle.textContent = 'Шинэ захиалга нэмэх';
  submitBtn.textContent = 'Захиалга нэмэх';
  cancelEditBtn.classList.add('hidden');
  document.getElementById('batchEntrySection').style.display = 'block';
  document.getElementById('editModeSection').style.display = 'none';
}

function startEdit(order) {
  document.getElementById('orderId').value = order.id;
  document.getElementById('fPhone').value = order.phone;
  document.getElementById('fCodeEdit').value = order.code || order.item_name;
  document.getElementById('fQtyEdit').value = order.quantity || 1;
  document.getElementById('fUnitEdit').value = order.unit_price;
  document.getElementById('fTotalEdit').value = order.total_price;
  window._editExtraIds = (order.ids || [order.id]).filter((x) => String(x) !== String(order.id));
  document.getElementById('batchEntrySection').style.display = 'none';
  document.getElementById('editModeSection').style.display = 'block';
  formTitle.textContent = 'Захиалга засах #' + order.id;
  submitBtn.textContent = 'Хадгалах';
  cancelEditBtn.classList.remove('hidden');
  hideMsg(formMsg);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteOrder(id, extraIds) {
  if (!confirm('Энэ барааг устгах уу?')) return;
  try {
    const ids = [id].concat(extraIds || []).filter(Boolean);
    for (const orderId of ids) {
      await api('/api/admin/orders/' + orderId, { method: 'DELETE', token: token() });
    }
    loadOrders(document.getElementById('searchPhone').value);
  } catch (err) {
    alert(err.message);
  }
}

document.getElementById('searchBtn').addEventListener('click', () => {
  loadOrders(document.getElementById('searchPhone').value);
});
document.getElementById('clearSearchBtn').addEventListener('click', () => {
  document.getElementById('searchPhone').value = '';
  loadOrders();
});
document.getElementById('exportOrdersBtn').addEventListener('click', async () => {
  if (!token()) return showLogin();
  const phone = document.getElementById('searchPhone').value.trim();
  const qs = phone ? '?phone=' + encodeURIComponent(phone) : '';
  try {
    await downloadFile('/api/admin/orders/export' + qs, {
      token: token(),
      filename: phone ? `cargo-orders-${phone}.xlsx` : 'cargo-orders-all.xlsx',
    });
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      TokenStore.clear(TOKEN_KEY);
      showLogin();
    } else {
      alert(err.message);
    }
  }
});

function renderStats(orders) {
  const rows = consolidateOrderRows(orders);
  const total = rows.length;
  const qtySum = rows.reduce((s, o) => s + Number(o.quantity || 1), 0);
  const sum = rows.reduce((s, o) => s + Number(o.total_price || 0), 0);
  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="num">${total}</div><div class="lbl">Барааны төрөл</div></div>
    <div class="stat"><div class="num">${qtySum}</div><div class="lbl">Нийт ширхэг</div></div>
    <div class="stat"><div class="num">${formatMoney(sum)}</div><div class="lbl">Нийт дүн</div></div>
  `;
}

function renderOrders(orders) {
  const body = document.getElementById('ordersBody');
  const empty = document.getElementById('ordersEmpty');
  const table = document.getElementById('ordersTable');
  const consolidated = consolidateOrderRows(orders);

  if (!consolidated.length) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
    table.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  table.classList.remove('hidden');

  const groups = [];
  let currentGroup = [];
  for (const o of consolidated) {
    if (currentGroup.length === 0 || currentGroup[0].phone === o.phone) {
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
      const groupTotal = group.reduce((s, o) => s + Number(o.total_price || 0), 0);
      group.forEach((o, index) => {
        html += `<tr>`;
        if (index === 0) {
          html += `<td rowspan="${rowspan}" style="vertical-align: middle; font-weight: 600;">${escapeHtml(group[0].phone)}</td>`;
          html += `<td rowspan="${rowspan}" style="vertical-align: middle; color: var(--muted);">${formatDate(group[0].created_at)}</td>`;
        }
        html += `
          <td>${escapeHtml(o.code || o.item_name)}</td>
          <td>${Number(o.quantity || 1)}</td>
          <td>${formatMoney(o.unit_price)}</td>
          <td>${formatMoney(o.total_price)}</td>
          <td>
            <div class="actions">
              <button class="btn small secondary" data-edit="${o.id}">Засах</button>
              <button class="btn small danger" data-del="${o.id}" data-extra="${(o.ids || []).filter((x) => x != o.id).join(',')}">Устгах</button>
            </div>
          </td>
        </tr>`;
      });
      html += `<tr class="group-total-row">
        <td colspan="5" style="text-align:right; color: var(--muted); font-weight:600;">Утасны нийт</td>
        <td style="font-weight:700; color: var(--amber);">${formatMoney(groupTotal)}</td>
        <td></td>
      </tr>`;
      return html;
    })
    .join('');

  body.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = consolidated.find((o) => o.id == btn.dataset.edit);
      if (order) startEdit(order);
    });
  });
  body.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const extra = (btn.dataset.extra || '').split(',').filter(Boolean);
      deleteOrder(btn.dataset.del, extra);
    });
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

async function boot() {
  if (!token()) return showLogin();
  try {
    const data = await api('/api/admin/profile', { token: token() });
    setTopProfile(data.user);
    showPanel();
    loadOrders();
  } catch (err) {
    TokenStore.clear(TOKEN_KEY);
    showLogin();
  }
}

boot();
