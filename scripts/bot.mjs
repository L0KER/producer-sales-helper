#!/usr/bin/env node
// Producer Sales Helper — Telegram bot and reminder worker.
//
// Runs from GitHub Actions every 15 minutes. Reads the same private Gist as the
// web app, sends due reminders and a daily digest, and handles a few commands.
//
// Required environment variables:
//   GIST_ID, GIST_TOKEN, TELEGRAM_BOT_TOKEN
// Optional:
//   GIST_FILE (default: producer-sales-helper.json)
//   BOT_STATE_FILE (local JSON instead of a Gist, useful for debugging)
//   DRY_RUN=1 or --dry-run (log messages, never send or write)

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* The state helpers live in store.js, which expects a browser localStorage at
   import time. Provide a tiny in-memory stand-in so the bot can reuse the very
   same normalisation and merge rules as the web app. */
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
  key: (index) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
};

const {
  money, plural, num, clamp, esc, uid, nowIso, truncate,
} = await import('../assets/js/util.js');
const {
  alive, taskBuckets, totals, periodContext, stageInfo, weightedAmount,
  dealAmount, isOpen,
} = await import('../assets/js/stats.js');
const { normalizeState, mergeStates } = await import('../assets/js/store.js');

const GIST_ID = String(process.env.GIST_ID || '').trim();
const GIST_TOKEN = String(process.env.GIST_TOKEN || process.env.GITHUB_TOKEN || '').trim();
const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const GIST_FILE = String(process.env.GIST_FILE || 'producer-sales-helper.json').trim();
const STATE_FILE = String(process.env.BOT_STATE_FILE || '').trim();
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';
const APP_URL = normalizeAppUrl(process.env.APP_URL);
const GITHUB_API = 'https://api.github.com';
const TG_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';
const OLD_REMINDER_MS = 48 * 3600000;

function log(...args) {
  console.log(`[bot ${new Date().toISOString()}]`, ...args);
}

/* ------------------------------------------------------------------ */
/* Storage                                                              */
/* ------------------------------------------------------------------ */

async function github(pathname, options = {}) {
  if (!GIST_TOKEN) throw new Error('Не задан GIST_TOKEN');
  const response = await fetch(`${GITHUB_API}${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GIST_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'producer-sales-helper-bot',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    let message = data?.message || `GitHub API: ${response.status}`;
    if (response.status === 401) message = 'GIST_TOKEN недействителен или истёк';
    if (response.status === 404) message = 'Gist не найден или у токена нет доступа';
    throw new Error(message);
  }
  return data;
}

async function readState() {
  if (STATE_FILE) {
    const file = path.resolve(STATE_FILE);
    const raw = await readFile(file, 'utf8');
    return normalizeState(JSON.parse(raw));
  }
  if (!GIST_ID) throw new Error('Не задан GIST_ID');
  const gist = await github(`/gists/${GIST_ID}`);
  const file = gist?.files?.[GIST_FILE];
  if (!file) throw new Error(`В gist нет файла ${GIST_FILE}. Сначала подключи синхронизацию в приложении.`);
  if (file.truncated || !file.content) {
    throw new Error(`Файл ${GIST_FILE} больше 1 МБ и не читается через API`);
  }
  let parsed;
  try {
    parsed = JSON.parse(file.content);
  } catch {
    throw new Error(`Файл ${GIST_FILE} повреждён: невалидный JSON`);
  }
  return normalizeState(parsed);
}

async function writeState(state) {
  if (DRY_RUN) {
    log('dry-run: состояние не записано');
    return;
  }
  if (STATE_FILE) {
    await writeFile(path.resolve(STATE_FILE), JSON.stringify(state, null, 2), 'utf8');
    log('состояние записано в', STATE_FILE);
    return;
  }
  await github(`/gists/${GIST_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({
      files: {
        [GIST_FILE]: { content: JSON.stringify(state, null, 2) },
      },
    }),
  });
  log('состояние записано в gist');
}

/* ------------------------------------------------------------------ */
/* Telegram                                                             */
/* ------------------------------------------------------------------ */

async function telegramRequest(method, { payload = null, params = null } = {}) {
  if (!BOT_TOKEN) throw new Error('Не задан TELEGRAM_BOT_TOKEN');
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  const response = await fetch(`${TG_API}/${method}${query}`, payload ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  } : undefined);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok || data?.ok === false) {
    const description = data?.description || `Telegram API: ${response.status}`;
    throw new Error(description);
  }
  return data?.result;
}

function splitMessage(text, limit = 3800) {
  const out = [];
  let current = '';
  for (const line of String(text).split('\n')) {
    if (current && current.length + line.length + 1 > limit) {
      out.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
    while (current.length > limit) {
      out.push(current.slice(0, limit));
      current = current.slice(limit);
    }
  }
  if (current) out.push(current);
  return out;
}

// Telegram accepts Mini App URLs only over HTTPS. Normalise the configured URL
// so a trailing slash or index.html does not open a different page.
export function normalizeAppUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    url.hash = '';
    url.pathname = url.pathname.replace(/index\.html?$/i, '');
    return url.href.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

// Inline `web_app` buttons are only allowed in private chats. Groups fall back
// to a normal link, which still opens the same page in a browser.
export function appKeyboard(chatId, url = APP_URL, label = '📱 Открыть приложение') {
  if (!url) return null;
  const privateChat = !String(chatId || '').startsWith('-');
  const button = privateChat
    ? { text: label, web_app: { url } }
    : { text: label, url };
  return { inline_keyboard: [[button]] };
}

function appHint() {
  return APP_URL ? '\n\nОткрой приложение кнопкой ниже.' : '';
}

async function send(chatId, text, { replyMarkup = null } = {}) {
  if (!chatId) {
    log('chat ID не задан, сообщение пропущено');
    return false;
  }
  const chunks = splitMessage(text);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const markup = replyMarkup && index === chunks.length - 1 ? replyMarkup : null;
    if (DRY_RUN) {
      const button = markup?.inline_keyboard?.[0]?.[0];
      const target = button?.web_app?.url || button?.url || '';
      console.log(`[dry-run] → ${chatId}\n${chunk}${target ? `\n[button] ${target}` : ''}\n---`);
      continue;
    }
    await telegramRequest('sendMessage', {
      payload: {
        chat_id: chatId,
        text: chunk,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(markup ? { reply_markup: markup } : {}),
      },
    });
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Time helpers                                                         */
/* ------------------------------------------------------------------ */

function applyTimezone(value) {
  const zone = String(value || 'UTC').trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
  } catch {
    log(`неизвестный часовой пояс "${zone}", использую UTC`);
    process.env.TZ = 'UTC';
    return 'UTC';
  }
  process.env.TZ = zone;
  return zone;
}

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  const hour = Number(get('hour')) % 24;
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    monthKey: `${get('year')}-${get('month')}`,
  };
}

function fmtLocal(input, timeZone, options = {}) {
  if (!input) return '—';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', { timeZone, ...options }).format(date);
}

function fmtDue(input, timeZone) {
  return fmtLocal(input, timeZone, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/* ------------------------------------------------------------------ */
/* Message building                                                     */
/* ------------------------------------------------------------------ */

function maps(state) {
  return {
    contacts: new Map(alive(state.contacts).map((contact) => [contact.id, contact])),
    deals: new Map(alive(state.deals).map((deal) => [deal.id, deal])),
  };
}

function taskRef(task, state) {
  const { contacts, deals } = maps(state);
  return [
    task.contactId ? contacts.get(task.contactId)?.name : '',
    task.dealId ? deals.get(task.dealId)?.title : '',
  ].filter(Boolean).join(' · ');
}

function taskLine(task, state, timeZone, { showId = false } = {}) {
  const ref = taskRef(task, state);
  const id = showId ? ` · <code>${esc(task.id.slice(-6))}</code>` : '';
  const notes = task.notes ? `\n   <i>${esc(truncate(task.notes, 400))}</i>` : '';
  return `• <b>${esc(truncate(task.title, 200))}</b> — ${esc(fmtDue(task.dueAt, timeZone))}${id}${ref ? `\n   ${esc(truncate(ref, 200))}` : ''}${notes}`;
}

export function taskList(title, tasks, state, timeZone, emptyText = 'Пусто.') {
  const lines = [`<b>${esc(title)}</b>`, ''];
  if (!tasks.length) {
    lines.push(esc(emptyText));
    return lines.join('\n');
  }
  for (const task of tasks.slice(0, 20)) lines.push(taskLine(task, state, timeZone));
  if (tasks.length > 20) lines.push(`\n…и ещё ${tasks.length - 20}.`);
  return lines.join('\n');
}

export function helpText() {
  return [
    '<b>Producer Sales Helper</b>',
    '',
    'Я присылаю напоминания по задачам и дневную сводку.',
    '',
    '<b>Команды</b>',
    '/today — задачи на сегодня и просроченные',
    '/week — задачи на ближайшие 7 дней',
    '/pipeline — открытые сделки',
    '/deals — сделки и их этапы',
    '/stats — выручка и воронка за месяц',
    '/done <code>id</code> — закрыть задачу (например <code>/done a1b2c3</code>)',
    '/app — открыть приложение (Mini App)',
    '',
    'Задачи и сделки создаются в приложении. Данные синхронизируются через приватный Gist.',
  ].join('\n');
}

function statsText(state, timeZone, now) {
  const ctx = periodContext('month', now);
  const current = totals(state, ctx.from, ctx.to);
  const currency = state.settings.currency || 'USD';
  const allTime = totals(state, new Date(2000, 0, 1), now);
  const winRate = current.winRate === null ? '—' : `${current.winRate.toFixed(0)}%`;
  return [
    `<b>Статистика · ${esc(ctx.label)}</b>`,
    '',
    `💰 Выручка: <b>${esc(money(current.revenue, currency))}</b>`,
    `✅ Закрыто: ${current.won} · отказов: ${current.lost} · win rate: ${winRate}`,
    `🧾 Средний чек: ${esc(money(current.avgDeal, currency))}`,
    `📈 Пайплайн: <b>${esc(money(current.pipeline, currency))}</b> из ${current.openCount} ${plural(current.openCount, 'сделки', 'сделок', 'сделок')}`,
    '',
    `Всего за всё время: ${esc(money(allTime.revenue, currency))} · ${allTime.won} ${plural(allTime.won, 'сделка', 'сделки', 'сделок')}`,
  ].join('\n');
}

function pipelineText(state, timeZone) {
  const currency = state.settings.currency || 'USD';
  const open = alive(state.deals)
    .filter(isOpen)
    .sort((a, b) => weightedAmount(b) - weightedAmount(a));
  const weighted = open.reduce((sum, deal) => sum + weightedAmount(deal), 0);
  const raw = open.reduce((sum, deal) => sum + dealAmount(deal), 0);
  const lines = [
    '<b>Открытый пайплайн</b>',
    '',
    `Взвешенно: <b>${esc(money(weighted, currency))}</b> · сумма: ${esc(money(raw, currency))} · сделок: ${open.length}`,
    '',
  ];
  if (!open.length) {
    lines.push('Открытых сделок нет.');
  } else {
    open.slice(0, 12).forEach((deal, index) => {
      const stage = stageInfo(deal.stage).label;
      const next = deal.nextActionAt ? ` · дальше ${fmtLocal(deal.nextActionAt, timeZone, { day: '2-digit', month: 'short' })}` : '';
      lines.push(`${index + 1}. <b>${esc(deal.title)}</b> — ${esc(money(dealAmount(deal), currency))} · ${esc(stage)} · вес ${esc(money(weightedAmount(deal), currency))}${next}`);
    });
    if (open.length > 12) lines.push(`\n…и ещё ${open.length - 12}.`);
  }
  return lines.join('\n');
}

function dealsText(state) {
  const currency = state.settings.currency || 'USD';
  const open = alive(state.deals).filter(isOpen);
  const lines = ['<b>Открытые сделки</b>', ''];
  if (!open.length) {
    lines.push('Открытых сделок нет.');
    return lines.join('\n');
  }
  for (const deal of open.slice(0, 25)) {
    lines.push(`• <b>${esc(deal.title)}</b> — ${esc(money(dealAmount(deal), currency))} · ${esc(stageInfo(deal.stage).label)} · <code>${esc(deal.id.slice(-6))}</code>`);
  }
  if (open.length > 25) lines.push(`\n…и ещё ${open.length - 25}.`);
  return lines.join('\n');
}

export function digestText(state, timeZone, now) {
  const buckets = taskBuckets(state, now);
  const ctx = periodContext('month', now);
  const current = totals(state, ctx.from, ctx.to);
  const currency = state.settings.currency || 'USD';
  const today = buckets.today.length + buckets.overdue.length;
  const lines = [
    `☀️ <b>Сводка на ${esc(fmtLocal(now, timeZone, { day: 'numeric', month: 'long' }))}</b>`,
    '',
    `Задачи: <b>${today}</b> на сегодня/просрочено · ${buckets.week.length} в ближайшие 7 дней`,
    `💰 Пайплайн: <b>${esc(money(current.pipeline, currency))}</b> (${current.openCount} ${plural(current.openCount, 'сделка', 'сделки', 'сделок')})`,
    `📈 Выручка месяца: <b>${esc(money(current.revenue, currency))}</b> · win rate: ${current.winRate === null ? '—' : `${current.winRate.toFixed(0)}%`}`,
  ];

  const focus = [...buckets.overdue, ...buckets.today].slice(0, 6);
  if (focus.length) {
    lines.push('', '<b>Фокус на сегодня</b>');
    for (const task of focus) lines.push(taskLine(task, state, timeZone, { showId: true }));
  } else {
    lines.push('', 'На сегодня задач нет. Хорошее время для аутрича.');
  }

  lines.push('', 'Подробнее — /today, /pipeline или /stats.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Commands                                                             */
/* ------------------------------------------------------------------ */

export function findTask(state, raw) {
  const query = String(raw || '').trim().toLowerCase();
  if (!query) return { error: 'Укажи id задачи: <code>/done a1b2c3</code>' };
  const open = alive(state.tasks).filter((task) => !task.done);
  const exact = open.find((task) => task.id.toLowerCase() === query);
  if (exact) return { task: exact };
  const matches = open.filter((task) => task.id.toLowerCase().startsWith(query)
    || task.id.toLowerCase().endsWith(query));
  if (matches.length === 1) return { task: matches[0] };
  if (!matches.length) return { error: `Задача <code>${esc(query)}</code> не найдена среди открытых.` };
  return {
    error: `Подходит несколько задач:\n${matches.slice(0, 8).map((task) => `• <code>${esc(task.id.slice(-6))}</code> ${esc(task.title)}`).join('\n')}\nУточни id.`,
  };
}

export function defaultDueIso() {
  const date = new Date(Date.now() + 3600000);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

export function nextOccurrence(iso, repeat) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return defaultDueIso();
  const step = repeat === 'daily' ? 1 : repeat === 'weekly' ? 7 : 0;
  if (step) date.setDate(date.getDate() + step);
  else if (repeat === 'monthly') date.setMonth(date.getMonth() + 1);
  else return defaultDueIso();

  let guard = 0;
  while (date.getTime() <= Date.now() && guard < 400) {
    if (step) date.setDate(date.getDate() + step);
    else date.setMonth(date.getMonth() + 1);
    guard += 1;
  }
  return date.toISOString();
}

export function completeTask(state, task) {
  const at = nowIso();
  task.done = true;
  task.doneAt = at;
  task.updatedAt = at;

  if (task.repeat && task.repeat !== 'none') {
    const dueAt = nextOccurrence(task.dueAt, task.repeat);
    state.tasks.unshift({
      ...task,
      id: uid('t_'),
      done: false,
      doneAt: '',
      dueAt,
      createdAt: at,
      updatedAt: at,
    });
    return dueAt;
  }
  return null;
}

async function handleUpdate(update, state, chatId, timeZone, now) {
  const message = update.message;
  if (!message || !message.text) return;

  const incomingChat = String(message.chat?.id || '');
  const text = String(message.text).trim();
  if (!text.startsWith('/')) return;

  const [commandRaw, ...args] = text.split(/\s+/);
  const command = commandRaw.split('@')[0].toLowerCase();

  // The Mini App button is safe before the chat ID is configured.
  if (command === '/app') {
    if (!APP_URL) {
      await send(incomingChat, [
        '<b>Mini App не настроен.</b>',
        '',
        'Добавь публичный HTTPS-URL приложения в GitHub:',
        'Settings → Secrets and variables → Actions → Variables → <b>APP_URL</b>.',
        'После следующего запуска workflow кнопка появится здесь и в меню бота.',
      ].join('\n'));
      return;
    }
    await send(incomingChat, [
      '<b>Producer Sales Helper</b>',
      '',
      'Приложение открывается кнопкой ниже. Это тот же интерфейс, что и на сайте, но внутри Telegram.',
    ].join('\n'), { replyMarkup: appKeyboard(incomingChat) });
    return;
  }

  // Onboarding must work before the chat ID is saved.
  if (command === '/start' || command === '/help' || command === '/id') {
    const configured = String(state.settings.telegramChatId || '').trim();
    if (!configured) {
      await send(incomingChat, [
        '<b>Это твой chat ID:</b>',
        `<code>${esc(incomingChat)}</code>`,
        '',
        'Скопируй его в приложении: Настройки → Telegram-бот → Chat ID и сохрани.',
        'После этого я смогу присылать напоминания и отвечать на команды.',
        '',
        helpText(),
        appHint(),
      ].join('\n'), { replyMarkup: appKeyboard(incomingChat) });
    } else if (configured !== incomingChat) {
      await send(incomingChat, `Этот чат не подключён. Твой chat ID: <code>${esc(incomingChat)}</code>. Укажи его в настройках приложения.`);
    } else {
      await send(incomingChat, helpText() + appHint(), { replyMarkup: appKeyboard(incomingChat) });
    }
    return;
  }

  const configured = String(state.settings.telegramChatId || '').trim();
  if (!configured || configured !== incomingChat) {
    await send(incomingChat, `Этот чат не подключён. Твой chat ID: <code>${esc(incomingChat)}</code>.`);
    return;
  }

  if (command === '/today' || command === '/overdue') {
    const buckets = taskBuckets(state, now);
    const rows = command === '/overdue'
      ? buckets.overdue
      : [...buckets.overdue, ...buckets.today];
    await send(chatId, taskList(
      command === '/overdue' ? 'Просроченные задачи' : 'Сегодня',
      rows,
      state,
      timeZone,
      'На сегодня задач нет. Хорошее время для аутрича.',
    ));
    return;
  }

  if (command === '/week') {
    const buckets = taskBuckets(state, now);
    await send(chatId, taskList(
      'Ближайшие 7 дней',
      [...buckets.today, ...buckets.week],
      state,
      timeZone,
      'На неделю задач нет.',
    ));
    return;
  }

  if (command === '/pipeline') {
    await send(chatId, pipelineText(state, timeZone));
    return;
  }

  if (command === '/deals') {
    await send(chatId, dealsText(state));
    return;
  }

  if (command === '/stats') {
    await send(chatId, statsText(state, timeZone, now));
    return;
  }

  if (command === '/done') {
    const found = findTask(state, args[0]);
    if (found.error) {
      await send(chatId, found.error);
      return;
    }
    const nextDue = completeTask(state, found.task);
    const suffix = nextDue
      ? `\nСледующий повтор: ${esc(fmtDue(nextDue, timeZone))}.`
      : '';
    await send(chatId, `✅ Задача закрыта: <b>${esc(found.task.title)}</b>.${suffix}`);
    return;
  }

  await send(chatId, `Не знаю команду <code>${esc(command)}</code>.\n\n${helpText()}`);
}

/* ------------------------------------------------------------------ */
/* Reminders & digest                                                   */
/* ------------------------------------------------------------------ */

export function reminderCandidates(state, now) {
  const settings = state.settings;
  const aheadMs = clamp(num(settings.remindAhead, 60), 0, 10080) * 60000;
  const reminders = state.bot.reminders || {};
  const due = [];
  let dirty = false;

  for (const task of alive(state.tasks)) {
    if (task.done || task.remind === false || !task.dueAt) {
      if (reminders[task.id]) {
        delete reminders[task.id];
        dirty = true;
      }
      continue;
    }
    const dueMs = Date.parse(task.dueAt);
    if (Number.isNaN(dueMs)) {
      if (reminders[task.id]) {
        delete reminders[task.id];
        dirty = true;
      }
      continue;
    }
    if (reminders[task.id] === task.dueAt) continue;
    if (now.getTime() < dueMs - aheadMs) continue;
    // Too old: mark as seen so a forgotten task does not spam forever.
    if (now.getTime() - dueMs > OLD_REMINDER_MS) {
      reminders[task.id] = task.dueAt;
      dirty = true;
      continue;
    }
    due.push(task);
  }

  // Keep the map from growing forever.
  const aliveIds = new Set(alive(state.tasks).filter((task) => !task.done).map((task) => task.id));
  for (const id of Object.keys(reminders)) {
    if (!aliveIds.has(id)) {
      delete reminders[id];
      dirty = true;
    }
  }

  state.bot.reminders = reminders;
  return { due, dirty };
}

async function sendReminders(state, chatId, timeZone, nowLabel) {
  const { due, dirty } = reminderCandidates(state, nowLabel);
  if (!chatId) return dirty;
  let changed = dirty;
  for (const task of due) {
    const text = [
      '⏰ <b>Напоминание</b>',
      '',
      taskLine(task, state, timeZone, { showId: true }),
      '',
      `Срок: <b>${esc(fmtDue(task.dueAt, timeZone))}</b>`,
    ].join('\n');
    try {
      await send(chatId, text, { replyMarkup: appKeyboard(chatId) });
      state.bot.reminders[task.id] = task.dueAt;
      changed = true;
      log('напоминание отправлено:', task.id, task.title);
    } catch (error) {
      log('не удалось отправить напоминание:', task.id, error.message);
    }
  }
  return changed;
}

async function maybeDigest(state, chatId, timeZone, now) {
  if (!chatId || !state.settings.digestEnabled) return false;
  const parts = localParts(now, timeZone);
  const hour = clamp(num(state.settings.digestHour, 9), 0, 23);
  if (parts.hour < hour) return false;
  if (state.bot.digestDate === parts.dateKey) return false;

  await send(chatId, digestText(state, timeZone, now), { replyMarkup: appKeyboard(chatId) });
  state.bot.digestDate = parts.dateKey;
  log('дневная сводка отправлена за', parts.dateKey);
  return true;
}

/* ------------------------------------------------------------------ */
/* Main                                                                 */
/* ------------------------------------------------------------------ */

async function pollUpdates(state, timeZone, now) {
  if (!BOT_TOKEN) {
    log('TELEGRAM_BOT_TOKEN не задан — команды не опрашиваются');
    return false;
  }
  if (DRY_RUN) {
    log('dry-run: getUpdates пропущен');
    return false;
  }

  const offset = num(state.bot.updateOffset, 0);
  const params = {
    timeout: '0',
    limit: '50',
    allowed_updates: JSON.stringify(['message']),
  };
  if (offset) params.offset = String(offset);

  const updates = await telegramRequest('getUpdates', { params });

  const chatId = String(state.settings.telegramChatId || '').trim();
  let maxUpdate = offset;
  let changed = false;

  for (const update of updates || []) {
    if (update.update_id >= maxUpdate) maxUpdate = update.update_id + 1;
    try {
      await handleUpdate(update, state, chatId, timeZone, now);
      changed = true;
    } catch (error) {
      log('ошибка обработки update', update.update_id, error.message);
    }
  }

  if (maxUpdate !== offset) {
    state.bot.updateOffset = maxUpdate;
    changed = true;
  }
  return changed;
}

async function main() {
  if (!STATE_FILE && (!GIST_ID || !GIST_TOKEN)) {
    throw new Error('Задай GIST_ID и GIST_TOKEN (или BOT_STATE_FILE для локального теста)');
  }
  if (!BOT_TOKEN && !DRY_RUN) {
    throw new Error('Задай TELEGRAM_BOT_TOKEN');
  }

  const state = await readState();
  state.bot = state.bot && typeof state.bot === 'object' ? state.bot : {};
  state.bot.reminders = state.bot.reminders && typeof state.bot.reminders === 'object'
    ? state.bot.reminders
    : {};

  const timeZone = applyTimezone(state.settings.timezone);
  const now = new Date();
  const chatId = String(state.settings.telegramChatId || '').trim();
  log(`часовой пояс: ${timeZone}, chat ID: ${chatId || 'не задан'}`);

  if (String(process.env.APP_URL || '').trim() && !APP_URL) {
    log('APP_URL должен быть публичным HTTPS-адресом — кнопки Mini App отключены');
  }

  let changed = false;

  // Point the bot's menu button at the Mini App. The call is idempotent, so it
  // only repeats when APP_URL actually changes.
  if (APP_URL && state.bot.menuButtonUrl !== APP_URL) {
    try {
      if (DRY_RUN) {
        log('dry-run: setChatMenuButton →', APP_URL);
      } else {
        await telegramRequest('setChatMenuButton', {
          payload: {
            menu_button: {
              type: 'web_app',
              text: 'Приложение',
              web_app: { url: APP_URL },
            },
          },
        });
        log('кнопка меню обновлена:', APP_URL);
      }
      state.bot.menuButtonUrl = APP_URL;
      changed = true;
    } catch (error) {
      log('не удалось обновить кнопку меню:', error.message);
    }
  }

  // Commands first, so a /done is reflected in the reminders below.
  changed = (await pollUpdates(state, timeZone, now)) || changed;

  const reminderChanged = await sendReminders(state, chatId, timeZone, now);
  changed = changed || reminderChanged;

  try {
    const digestChanged = await maybeDigest(state, chatId, timeZone, now);
    changed = changed || digestChanged;
  } catch (error) {
    log('не удалось отправить сводку:', error.message);
  }

  if (changed) {
    // Re-read and merge so a push from the app during this run is not lost.
    if (!STATE_FILE && GIST_TOKEN && GIST_ID) {
      try {
        const remote = await readState();
        const merged = mergeStates(remote, state);
        // bot state is owned by this bot; mergeStates prefers the remote copy.
        merged.bot = state.bot;
        await writeState(merged);
        return;
      } catch (error) {
        log('не удалось смержить с gist, пишу локальную версию:', error.message);
      }
    }
    await writeState(state);
  } else {
    log('изменений нет');
  }
}

const isDirectRun = Boolean(process.argv[1])
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  main().catch((error) => {
    console.error(`[bot] fatal: ${error.message}`);
    process.exitCode = 1;
  });
}
