// Local-first state with optional cloud sync through a private GitHub Gist.
// The Telegram bot in GitHub Actions reads/writes the same gist file.

import { nowIso, num, clamp, uid } from './util.js';
import { STAGE_IDS, isWon, isLost, alive as aliveList } from './stats.js';

export const STATE_VERSION = 1;
export const GIST_FILE = 'producer-sales-helper.json';
const LS_KEY = 'psh:state:v1';
const CFG_KEY = 'psh:sync:v1';
const DEVICE_KEY = 'psh:device:v1';
const API = 'https://api.github.com';

export const DEAL_SOURCES = [
  'Telegram', 'Instagram', 'BeatStars', 'YouTube', 'Email', 'Fiverr', 'Discord', 'Сарафанное радио', 'Другое',
];

export const LICENSE_TYPES = ['Exclusive', 'Lease', 'Bundle', 'Custom', 'Другое'];

export const CONTACT_ROLES = ['Артист', 'Менеджер', 'Лейбл', 'Продюсер', 'Блогер', 'Другое'];

export const BEAT_STATUSES = [
  { id: 'available', label: 'Свободен', tone: 'ok' },
  { id: 'reserved', label: 'Зарезервирован', tone: 'blue' },
  { id: 'leased', label: 'В аренде', tone: 'warn' },
  { id: 'sold', label: 'Продан эксклюзив', tone: 'accent' },
];

export const ACTIVITY_TYPES = [
  { id: 'outreach', label: 'Аутрич', tone: 'outreach' },
  { id: 'reply', label: 'Ответ', tone: 'reply' },
  { id: 'call', label: 'Звонок', tone: 'call' },
  { id: 'payment', label: 'Оплата', tone: 'payment' },
  { id: 'note', label: 'Заметка', tone: 'note' },
];

export const REPEAT_OPTIONS = [
  { value: 'none', label: 'Без повтора' },
  { value: 'daily', label: 'Каждый день' },
  { value: 'weekly', label: 'Каждую неделю' },
  { value: 'monthly', label: 'Каждый месяц' },
];

export const CURRENCIES = ['USD', 'EUR', 'RUB', 'GBP', 'UAH', 'KZT', 'AED', 'CAD', 'AUD', 'TRY'];

export const DEFAULT_SETTINGS = {
  artistName: '',
  ownerName: '',
  currency: 'USD',
  timezone: 'Europe/Moscow',
  telegramChatId: '',
  remindAhead: 60,
  digestEnabled: true,
  digestHour: 9,
  repoUrl: '',
  theme: 'dark',
  updatedAt: '',
};

/* ------------------------------------------------------------------ */
/* Normalisation                                                        */
/* ------------------------------------------------------------------ */

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

function stamp(value) {
  return value || nowIso();
}

function normalizeContact(raw) {
  const createdAt = stamp(raw.createdAt);
  return {
    id: String(raw.id || uid('c_')),
    name: String(raw.name || 'Без имени'),
    role: String(raw.role || 'Артист'),
    handle: String(raw.handle || ''),
    email: String(raw.email || ''),
    country: String(raw.country || ''),
    source: String(raw.source || ''),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    notes: String(raw.notes || ''),
    lastContactAt: raw.lastContactAt || '',
    createdAt,
    updatedAt: stamp(raw.updatedAt || createdAt),
    deletedAt: raw.deletedAt || null,
  };
}

function normalizeDeal(raw) {
  const createdAt = stamp(raw.createdAt);
  const stage = STAGE_IDS.includes(raw.stage) ? raw.stage : 'lead';
  const history = Array.isArray(raw.stageHistory)
    ? raw.stageHistory
      .filter((h) => h && STAGE_IDS.includes(h.stage))
      .map((h) => ({ stage: h.stage, at: h.at || createdAt }))
    : [{ stage, at: createdAt }];
  if (!history.some((h) => h.stage === stage)) history.push({ stage, at: stamp(raw.updatedAt || createdAt) });

  const probRaw = raw.probability;
  const probability = probRaw === '' || probRaw === null || probRaw === undefined || !Number.isFinite(Number(probRaw))
    ? ''
    : clamp(num(probRaw), 0, 100);

  return {
    id: String(raw.id || uid('d_')),
    title: String(raw.title || 'Без названия'),
    contactId: raw.contactId ? String(raw.contactId) : '',
    stage,
    amount: Math.max(0, num(raw.amount)),
    license: String(raw.license || 'Lease'),
    source: String(raw.source || 'Telegram'),
    probability,
    createdAt,
    expectedCloseAt: raw.expectedCloseAt || '',
    closedAt: raw.closedAt || '',
    nextActionAt: raw.nextActionAt || '',
    beats: Array.isArray(raw.beats) ? raw.beats.map(String) : [],
    notes: String(raw.notes || ''),
    stageHistory: history,
    updatedAt: stamp(raw.updatedAt || createdAt),
    deletedAt: raw.deletedAt || null,
  };
}

function normalizeBeat(raw) {
  const createdAt = stamp(raw.createdAt);
  const status = BEAT_STATUSES.some((s) => s.id === raw.status) ? raw.status : 'available';
  return {
    id: String(raw.id || uid('b_')),
    title: String(raw.title || 'Без названия'),
    bpm: raw.bpm === '' || raw.bpm === null || raw.bpm === undefined || !Number.isFinite(Number(raw.bpm)) ? null : num(raw.bpm),
    key: String(raw.key || ''),
    genre: String(raw.genre || ''),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    price: Math.max(0, num(raw.price)),
    status,
    notes: String(raw.notes || ''),
    createdAt,
    updatedAt: stamp(raw.updatedAt || createdAt),
    deletedAt: raw.deletedAt || null,
  };
}

function normalizeTask(raw) {
  const createdAt = stamp(raw.createdAt);
  return {
    id: String(raw.id || uid('t_')),
    title: String(raw.title || 'Без названия'),
    dueAt: raw.dueAt || '',
    repeat: ['none', 'daily', 'weekly', 'monthly'].includes(raw.repeat) ? raw.repeat : 'none',
    contactId: raw.contactId ? String(raw.contactId) : '',
    dealId: raw.dealId ? String(raw.dealId) : '',
    remind: raw.remind !== false,
    done: Boolean(raw.done),
    doneAt: raw.doneAt || '',
    notes: String(raw.notes || ''),
    createdAt,
    updatedAt: stamp(raw.updatedAt || createdAt),
    deletedAt: raw.deletedAt || null,
  };
}

function normalizeActivity(raw) {
  const createdAt = stamp(raw.createdAt);
  const type = ACTIVITY_TYPES.some((t) => t.id === raw.type) ? raw.type : 'note';
  return {
    id: String(raw.id || uid('a_')),
    type,
    at: raw.at || createdAt,
    contactId: raw.contactId ? String(raw.contactId) : '',
    dealId: raw.dealId ? String(raw.dealId) : '',
    note: String(raw.note || ''),
    createdAt,
    updatedAt: stamp(raw.updatedAt || createdAt),
    deletedAt: raw.deletedAt || null,
  };
}

function normalizeKpi(raw) {
  const createdAt = stamp(raw.createdAt);
  return {
    id: String(raw.id || uid('k_')),
    month: /^\d{4}-\d{2}$/.test(raw.month || '') ? raw.month : nowIso().slice(0, 7),
    outreach: Math.max(0, num(raw.outreach)),
    replies: Math.max(0, num(raw.replies)),
    calls: Math.max(0, num(raw.calls)),
    plays: Math.max(0, num(raw.plays)),
    followers: Math.max(0, num(raw.followers)),
    adSpend: Math.max(0, num(raw.adSpend)),
    notes: String(raw.notes || ''),
    createdAt,
    updatedAt: stamp(raw.updatedAt || createdAt),
    deletedAt: raw.deletedAt || null,
  };
}

export function emptyState() {
  return {
    version: STATE_VERSION,
    updatedAt: '',
    settings: { ...DEFAULT_SETTINGS },
    contacts: [],
    beats: [],
    deals: [],
    tasks: [],
    activities: [],
    kpis: [],
    bot: {},
  };
}

export function normalizeState(input) {
  const src = input && typeof input === 'object' ? input : {};
  const settings = { ...DEFAULT_SETTINGS, ...(src.settings && typeof src.settings === 'object' ? src.settings : {}) };
  settings.remindAhead = clamp(num(settings.remindAhead, 60), 0, 10080);
  settings.digestHour = clamp(num(settings.digestHour, 9), 0, 23);
  settings.digestEnabled = settings.digestEnabled !== false;
  settings.currency = String(settings.currency || 'USD').toUpperCase();
  settings.updatedAt = settings.updatedAt || '';

  return {
    version: STATE_VERSION,
    updatedAt: src.updatedAt || '',
    settings,
    contacts: asArray(src.contacts).map(normalizeContact),
    beats: asArray(src.beats).map(normalizeBeat),
    deals: asArray(src.deals).map(normalizeDeal),
    tasks: asArray(src.tasks).map(normalizeTask),
    activities: asArray(src.activities).map(normalizeActivity),
    kpis: asArray(src.kpis).map(normalizeKpi),
    bot: src.bot && typeof src.bot === 'object' ? src.bot : {},
  };
}

const COLLECTIONS = ['contacts', 'beats', 'deals', 'tasks', 'activities', 'kpis'];
const TOMBSTONE_TTL = 90 * 86400000;

function recTime(record) {
  const t = Date.parse(record?.updatedAt || record?.createdAt || 0);
  return Number.isNaN(t) ? 0 : t;
}

function purgeTombstones(list) {
  const now = Date.now();
  return list.filter((record) => {
    if (!record.deletedAt) return true;
    const t = Date.parse(record.deletedAt);
    return !Number.isNaN(t) && now - t < TOMBSTONE_TTL;
  });
}

export function mergeStates(remoteInput, localInput) {
  const remote = normalizeState(remoteInput);
  const local = normalizeState(localInput);
  const out = emptyState();

  // bot is owned by GitHub Actions; the remote copy always wins.
  out.bot = remote.bot && Object.keys(remote.bot).length ? remote.bot : local.bot;

  const rTime = Date.parse(remote.settings.updatedAt || 0) || 0;
  const lTime = Date.parse(local.settings.updatedAt || 0) || 0;
  if (!lTime) out.settings = remote.settings;
  else if (!rTime) out.settings = local.settings;
  else out.settings = lTime >= rTime ? local.settings : remote.settings;

  for (const key of COLLECTIONS) {
    const map = new Map();
    for (const record of remote[key]) map.set(record.id, record);
    for (const record of local[key]) {
      const current = map.get(record.id);
      if (!current || recTime(record) >= recTime(current)) map.set(record.id, record);
    }
    out[key] = purgeTombstones([...map.values()]);
  }

  out.updatedAt = nowIso();
  return out;
}

export function isValidImport(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value.deals) || Array.isArray(value.contacts)) return true;
  return Boolean(value.settings && typeof value.settings === 'object');
}

/* ------------------------------------------------------------------ */
/* Local persistence                                                    */
/* ------------------------------------------------------------------ */

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('localStorage write failed', error);
    return false;
  }
}

let state = normalizeState(readJson(LS_KEY, emptyState()));
const listeners = new Set();

function saveLocal() {
  writeJson(LS_KEY, state);
}

function emit(reason = 'change') {
  for (const fn of listeners) {
    try {
      fn(reason);
    } catch (error) {
      console.error(error);
    }
  }
}

export const store = {
  get state() {
    return state;
  },
  get settings() {
    return state.settings;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit,
  persist: saveLocal,
  alive(collection) {
    return aliveList(state[collection]);
  },
  update(mutator) {
    try {
      mutator(state);
    } catch (error) {
      console.error('store.update failed', error);
      throw error;
    }
    state.updatedAt = nowIso();
    saveLocal();
    emit('change');
    queueSync();
  },
  replace(next, { emit: shouldEmit = true } = {}) {
    state = normalizeState(next);
    if (!state.updatedAt) state.updatedAt = nowIso();
    saveLocal();
    if (shouldEmit) emit('replace');
  },
  patchSettings(patch, { touch = true } = {}) {
    store.update((s) => {
      s.settings = { ...s.settings, ...patch, updatedAt: touch ? nowIso() : s.settings.updatedAt };
    });
  },
  add(collection, record) {
    store.update((s) => {
      s[collection].unshift(record);
    });
  },
  patch(collection, id, patch) {
    let found = false;
    store.update((s) => {
      const record = s[collection].find((item) => item.id === id);
      if (!record) return;
      found = true;
      Object.assign(record, patch, { updatedAt: nowIso() });
    });
    return found;
  },
  remove(collection, id) {
    let found = false;
    store.update((s) => {
      const record = s[collection].find((item) => item.id === id);
      if (!record) return;
      found = true;
      record.deletedAt = nowIso();
      record.updatedAt = record.deletedAt;
    });
    return found;
  },
  reset() {
    state = emptyState();
    saveLocal();
    emit('reset');
    queueSync();
  },
  importState(next) {
    if (!isValidImport(next)) throw new Error('Файл не похож на резервную копию Sales Helper');
    store.replace(normalizeState(next));
    queueSync(300);
  },
};

export function getContact(id) {
  return state.contacts.find((c) => c.id === id && !c.deletedAt) || null;
}

export function getDeal(id) {
  return state.deals.find((d) => d.id === id && !d.deletedAt) || null;
}

export function getBeat(id) {
  return state.beats.find((b) => b.id === id && !b.deletedAt) || null;
}

export function getTask(id) {
  return state.tasks.find((t) => t.id === id && !t.deletedAt) || null;
}

/* ------------------------------------------------------------------ */
/* Device-local config (never synced)                                   */
/* ------------------------------------------------------------------ */

let device = { botToken: '', ...readJson(DEVICE_KEY, {}) };

export function getDevice() {
  return device;
}

export function saveDevice(patch) {
  device = { ...device, ...patch };
  writeJson(DEVICE_KEY, device);
  return device;
}

/* ------------------------------------------------------------------ */
/* Gist sync                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_CFG = {
  token: '',
  gistId: '',
  login: '',
  autoSync: true,
  lastSyncAt: '',
};

let cfg = { ...DEFAULT_CFG, ...readJson(CFG_KEY, {}) };
let syncStatus = {
  state: cfg.token && cfg.gistId ? 'local' : 'off',
  message: '',
  at: null,
};
let syncTimer = null;
let inFlight = false;
let again = false;
const syncListeners = new Set();

function saveCfg() {
  writeJson(CFG_KEY, cfg);
}

function notifySync() {
  for (const fn of syncListeners) {
    try {
      fn(syncStatus);
    } catch (error) {
      console.error(error);
    }
  }
}

function setStatus(next, message = '') {
  syncStatus = { state: next, message, at: nowIso() };
  notifySync();
}

export function getSyncConfig() {
  return { ...cfg };
}

export function getSyncStatus() {
  return { ...syncStatus };
}

export function onSyncChange(fn) {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

export function saveSyncConfig(patch) {
  const next = { ...cfg, ...patch };
  next.token = String(next.token || '').trim();
  next.gistId = String(next.gistId || '').trim();
  cfg = next;
  saveCfg();
  if (!cfg.token || !cfg.gistId) {
    setStatus('off');
  } else if (syncStatus.state === 'off') {
    setStatus('local');
  }
  return { ...cfg };
}

export function disconnectSync({ keepToken = false } = {}) {
  cfg = { ...cfg, gistId: '', lastSyncAt: '', ...(keepToken ? {} : { token: '', login: '' }) };
  saveCfg();
  setStatus('off');
}

async function gh(path, options = {}) {
  if (!cfg.token) throw new Error('Не задан GitHub-токен');
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `GitHub API: ${res.status}`;
    try {
      const data = await res.json();
      if (data.message) message = data.message;
    } catch { /* ignore */ }
    if (res.status === 401) message = 'Токен недействителен или истёк';
    if (res.status === 404) message = 'Gist не найден или нет доступа';
    if (res.status === 403) message = 'GitHub отклонил запрос (лимит или права токена)';
    throw new Error(message);
  }

  if (res.status === 204) return null;
  return res.json();
}

export async function verifyToken() {
  const user = await gh('/user');
  cfg = { ...cfg, login: user.login };
  saveCfg();
  setStatus(cfg.gistId ? 'local' : 'off');
  return user.login;
}

export async function findGist() {
  const gists = await gh('/gists?per_page=100&sort=updated');
  const found = (gists || []).find((g) => g.files && g.files[GIST_FILE]);
  if (!found) throw new Error(`Приватный gist с файлом ${GIST_FILE} не найден`);
  cfg = { ...cfg, gistId: found.id };
  saveCfg();
  setStatus('local');
  return found.id;
}

export async function createGist() {
  const body = {
    description: 'Producer Sales Helper — данные CRM (приватный)',
    public: false,
    files: {
      [GIST_FILE]: { content: JSON.stringify(state, null, 2) },
    },
  };
  const gist = await gh('/gists', { method: 'POST', body: JSON.stringify(body) });
  cfg = { ...cfg, gistId: gist.id };
  cfg.lastSyncAt = nowIso();
  saveCfg();
  setStatus('synced');
  return gist.id;
}

export async function fetchRemoteState() {
  if (!cfg.gistId || !cfg.token) throw new Error('Синхронизация не настроена');
  const gist = await gh(`/gists/${cfg.gistId}`);
  const file = gist?.files?.[GIST_FILE];
  if (!file) throw new Error(`В gist нет файла ${GIST_FILE}`);
  let content = file.content;
  if (file.truncated || !content) {
    throw new Error('Файл данных слишком большой для чтения через API (больше 1 МБ)');
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Файл в gist повреждён: невалидный JSON');
  }
  return normalizeState(parsed);
}

async function pushRemoteState(nextState) {
  if (!cfg.gistId || !cfg.token) throw new Error('Синхронизация не настроена');
  const body = {
    files: {
      [GIST_FILE]: { content: JSON.stringify(nextState, null, 2) },
    },
  };
  await gh(`/gists/${cfg.gistId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function syncNow({ silent = false } = {}) {
  if (!cfg.token || !cfg.gistId) {
    setStatus('off');
    return false;
  }
  if (inFlight) {
    again = true;
    return false;
  }

  inFlight = true;
  setStatus('syncing', 'Синхронизация…');
  try {
    const remote = await fetchRemoteState();
    const merged = mergeStates(remote, store.state);
    store.replace(merged);
    await pushRemoteState(merged);
    cfg = { ...cfg, lastSyncAt: nowIso() };
    saveCfg();
    setStatus('synced');
    return true;
  } catch (error) {
    console.error('sync failed', error);
    setStatus('error', error.message || 'Ошибка синхронизации');
    if (!silent) {
      const { toast } = await import('./util.js');
      toast(`Синхронизация: ${error.message}`, 'error');
    }
    return false;
  } finally {
    inFlight = false;
    if (again) {
      again = false;
      queueSync(400);
    }
  }
}

export function queueSync(delay = 1500) {
  if (!cfg.token || !cfg.gistId || !cfg.autoSync) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncNow({ silent: true });
  }, delay);
}

export function syncConfigured() {
  return Boolean(cfg.token && cfg.gistId);
}

/* ------------------------------------------------------------------ */
/* Domain helpers                                                       */
/* ------------------------------------------------------------------ */

export function newContact(values = {}) {
  return normalizeContact({ id: uid('c_'), createdAt: nowIso(), updatedAt: nowIso(), ...values });
}

export function newDeal(values = {}) {
  const now = nowIso();
  const stage = values.stage || 'lead';
  return normalizeDeal({
    id: uid('d_'),
    createdAt: now,
    updatedAt: now,
    stage,
    stageHistory: [{ stage, at: now }],
    ...values,
  });
}

export function newBeat(values = {}) {
  return normalizeBeat({ id: uid('b_'), createdAt: nowIso(), updatedAt: nowIso(), ...values });
}

export function newTask(values = {}) {
  return normalizeTask({ id: uid('t_'), createdAt: nowIso(), updatedAt: nowIso(), ...values });
}

export function newActivity(values = {}) {
  return normalizeActivity({ id: uid('a_'), createdAt: nowIso(), updatedAt: nowIso(), ...values });
}

export function newKpi(values = {}) {
  return normalizeKpi({ id: uid('k_'), createdAt: nowIso(), updatedAt: nowIso(), ...values });
}

export function dealStageHistoryFor(deal, stage) {
  const history = [...(deal.stageHistory || [])];
  if (!history.length) history.push({ stage: deal.stage, at: deal.createdAt || nowIso() });
  history.push({ stage, at: nowIso() });
  return history;
}

export function dealIsClosed(deal) {
  return isWon(deal) || isLost(deal);
}
