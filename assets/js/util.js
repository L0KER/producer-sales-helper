// Small, dependency-free helpers shared by the app and the Telegram bot.
// Nothing here touches the DOM at import time, so Node can import it safely.

import { haptic } from './telegram.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

export function uid(prefix = '') {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}${t}${r}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function debounce(fn, wait = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function num(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const cleaned = String(value ?? '').replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

export function sum(list, pick = (item) => item) {
  return (list || []).reduce((acc, item) => acc + (Number(pick(item)) || 0), 0);
}

export function avg(list, pick = (item) => item) {
  const arr = list || [];
  if (!arr.length) return 0;
  return sum(arr, pick) / arr.length;
}

/* ---------------- money ---------------- */

let currencyCode = 'USD';

export function setCurrency(code) {
  if (code && String(code).length === 3) currencyCode = String(code).toUpperCase();
}

export function getCurrency() {
  return currencyCode;
}

export function money(value, code = currencyCode) {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);
  } catch {
    return `${Math.round(n).toLocaleString('ru-RU')} ${code}`;
  }
}

export function fmtNum(value, digits = 0) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(n);
}

export function fmtPct(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${(Number(value) || 0).toFixed(digits)}%`;
}

/* ---------------- dates ---------------- */

export function dayKey(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthKey(input = new Date()) {
  const key = dayKey(input);
  return key.slice(0, 7);
}

export function addDays(input, days) {
  const d = input instanceof Date ? new Date(input) : new Date(input);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfDay(input = new Date()) {
  const d = input instanceof Date ? new Date(input) : new Date(input);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function fmtDate(input, opts = {}) {
  if (!input) return '—';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', ...opts }).format(d);
}

export function fmtDateTime(input) {
  if (!input) return '—';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function fmtTime(input) {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(d);
}

export function relDay(input) {
  if (!input) return '—';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  const today = startOfDay();
  const target = startOfDay(d);
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  const sameYear = d.getFullYear() === today.getFullYear();
  return fmtDate(d, sameYear ? { month: 'short' } : { month: 'short', year: 'numeric' });
}

export function timeAgo(input) {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 0) return relDay(d);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн назад`;
  return fmtDate(d);
}

export function monthLabel(key) {
  if (!key || !/^\d{4}-\d{2}$/.test(key)) return key || '';
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { month: 'short', year: '2-digit' })
    .format(new Date(y, m - 1, 1))
    .replace(' г.', '');
}

export function monthTitle(key) {
  if (!key || !/^\d{4}-\d{2}$/.test(key)) return key || '';
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(new Date(y, m - 1, 1));
}

export function addMonthsKey(key, delta) {
  if (!/^\d{4}-\d{2}$/.test(key || '')) return monthKey();
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}

export function monthRange(key) {
  const [y, m] = String(key).split('-').map(Number);
  return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
}

export function toDateInput(input) {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toDateTimeInput(input) {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${toDateInput(d)}T${hh}:${mm}`;
}

// Accepts value from <input type=date|datetime-local|month> and returns ISO string.
export function fromLocalInput(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!match) return null;
  const d = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] || 0),
    Number(match[5] || 0),
  );
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function daysBetween(a, b) {
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return (end - start) / 86400000;
}

/* ---------------- strings ---------------- */

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function parseTags(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value || '')
    .split(/[,;\n]/)
    .map((v) => v.trim().replace(/^#/, ''))
    .filter(Boolean);
}

export function plural(n, one, few, many) {
  const abs = Math.abs(Number(n) || 0);
  const a = abs % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function truncate(str, max = 80) {
  const s = String(str || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function tgHandle(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const cleaned = raw
    .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0];
  return cleaned;
}

export function tgLink(value) {
  const handle = tgHandle(value);
  return handle ? `https://t.me/${encodeURIComponent(handle)}` : '';
}

export function mailLink(value) {
  const email = String(value || '').trim();
  return email && email.includes('@') ? `mailto:${encodeURIComponent(email)}` : '';
}

export function sortByDesc(list, pick) {
  return [...(list || [])].sort((a, b) => {
    const av = pick(a);
    const bv = pick(b);
    if (av === bv) return 0;
    return av > bv ? -1 : 1;
  });
}

/* ---------------- browser-only helpers ---------------- */

export function toast(message, type = 'ok') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  haptic(type === 'error' ? 'error' : type === 'ok' ? 'success' : type === 'warn' ? 'warning' : 'light');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, 3400);
}

export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function todayInput() {
  return toDateInput(new Date());
}

export function monthInput() {
  return monthKey();
}
