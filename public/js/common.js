'use strict';

// Shared helpers for the MicroCargo frontend.

const STATUS_LABELS = {
  pending: 'Хүлээгдэж буй',
  in_transit: 'Замд яваа',
  received: 'Хүлээж авсан',
};

function statusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="badge ${status}">${label}</span>`;
}

function formatMoney(value) {
  const n = Number(value || 0);
  return n.toLocaleString('mn-MN') + '₮';
}

function formatDate(iso) {
  if (!iso) return '';
  // SQLite returns "YYYY-MM-DD HH:MM:SS" (UTC)
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Token storage (key differs for customer vs admin so they don't clash)
const TokenStore = {
  get(key) { return localStorage.getItem(key); },
  set(key, value) { localStorage.setItem(key, value); },
  clear(key) { localStorage.removeItem(key); },
};

async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try { data = await res.json(); } catch (e) { /* no-op */ }

  if (!res.ok) {
    const err = new Error(data.error || 'Алдаа гарлаа');
    err.status = res.status;
    throw err;
  }
  return data;
}

function showMsg(el, text, type = 'error') {
  el.textContent = text;
  el.className = 'msg ' + type;
  el.classList.remove('hidden');
}

function hideMsg(el) {
  el.classList.add('hidden');
}
