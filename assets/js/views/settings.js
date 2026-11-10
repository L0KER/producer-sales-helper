import {
  store, CURRENCIES, getSyncConfig, getSyncStatus, getDevice, syncConfigured,
} from '../store.js';
import {
  esc, money, fmtDate, timeAgo, plural,
} from '../util.js';
import { icon } from '../icons.js';
import { pageHead, emptyState } from './partials.js';
import { isMiniApp, miniAppUser, appBaseUrl } from '../telegram.js';

function field(label, control, hint = '') {
  return `<label class="field">
    <span>${esc(label)}</span>
    ${control}
    ${hint ? `<span class="field-hint">${hint}</span>` : ''}
  </label>`;
}

const TZ_LIST = [
  'Europe/Moscow', 'Europe/Kyiv', 'Europe/Minsk', 'Europe/Berlin', 'Europe/London',
  'Asia/Almaty', 'Asia/Tbilisi', 'Asia/Dubai', 'Asia/Bangkok', 'America/New_York', 'America/Los_Angeles', 'UTC',
];

export function render() {
  const s = store.settings;
  const cfg = getSyncConfig();
  const status = getSyncStatus();
  const device = getDevice();
  const repo = String(s.repoUrl || '').trim().replace(/\/+$/, '');
  const actionsUrl = repo ? `${repo}/actions` : '';
  const secretsUrl = repo ? `${repo}/settings/secrets/actions` : '';
  const setupUrl = repo ? `${repo}/blob/main/docs/SETUP.md` : '';
  const beatsCount = store.alive('beats').length;
  const mini = isMiniApp();
  const tgUser = miniAppUser();
  const publicUrl = appBaseUrl();

  const steps = [
    { done: Boolean(cfg.gistId), label: 'Создан приватный Gist и подключён к приложению' },
    { done: Boolean(s.telegramChatId), label: 'Указан Telegram chat ID' },
    { done: Boolean(device.botToken), label: 'Токен бота сохранён на этом устройстве (для теста)' },
    { done: Boolean(repo), label: 'Указан URL GitHub-репозитория' },
  ];

  const syncStateTone = status.state === 'synced' ? 'ok' : status.state === 'error' ? 'bad' : syncConfigured() ? 'warn' : '';
  const syncStateText = {
    off: 'Локальный режим — данные только в этом браузере',
    local: 'Gist подключён, но синхронизация ещё не выполнялась',
    syncing: 'Синхронизация выполняется…',
    synced: `Синхронизировано${cfg.lastSyncAt ? ` · ${timeAgo(cfg.lastSyncAt)}` : ''}`,
    error: `Ошибка: ${status.message || 'не удалось синхронизироваться'}`,
  }[status.state] || 'Локальный режим';

  return `<section class="page">
    ${pageHead(
    'Настройки',
    'Профиль, синхронизация и Telegram-напоминания',
    `<button class="btn ghost" data-action="sync-now">${icon('sync', 15)} Синхронизировать</button>
       <button class="btn primary" data-action="download-backup">${icon('download', 15)} Бэкап</button>`,
  )}

    <div class="settings-grid">
      <div class="card">
        <div class="card-head"><h2>Профиль и валюта</h2></div>
        <form class="settings-form" data-form="profile">
          <div class="form-grid">
            ${field('Имя продюсера / бренд', `<input name="artistName" type="text" value="${esc(s.artistName)}" placeholder="NOVA BEATS">`)}
            ${field('Как тебя зовут', `<input name="ownerName" type="text" value="${esc(s.ownerName)}" placeholder="Егор">`)}
            ${field('Валюта', `<select name="currency">${CURRENCIES.map((code) => `<option value="${code}" ${s.currency === code ? 'selected' : ''}>${code}</option>`).join('')}</select>`)}
            ${field('Тема', `<select name="theme"><option value="dark" ${s.theme !== 'light' ? 'selected' : ''}>Тёмная</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Светлая</option></select>`)}
            ${field('Часовой пояс', `<input name="timezone" type="text" value="${esc(s.timezone)}" list="tz-list" placeholder="Europe/Moscow">`, 'IANA-формат. Влияет на время напоминаний и сводок.')}
            <datalist id="tz-list">${TZ_LIST.map((tz) => `<option value="${tz}"></option>`).join('')}</datalist>
          </div>
          <div class="settings-foot"><button class="btn primary" type="submit">Сохранить профиль</button></div>
        </form>
      </div>

      <div class="card">
        <div class="card-head"><h2>Telegram-бот</h2><span class="badge ${s.telegramChatId ? 'ok' : 'warn'}">${s.telegramChatId ? 'chat ID есть' : 'не настроен'}</span></div>
        <div class="status-line ${device.botToken ? 'ok' : 'warn'}">
          <span class="dot ${device.botToken ? 'ok' : 'warn'}"></span>
          ${device.botToken ? 'Токен бота сохранён локально' : 'Токен бота не сохранён на этом устройстве'}
        </div>
        <form class="settings-form" data-form="telegram">
          <div class="form-grid">
            ${field('Chat ID', `<input name="telegramChatId" type="text" value="${esc(s.telegramChatId)}" placeholder="123456789">`, 'Узнать можно кнопкой ниже после сообщения боту.')}
            ${field('Токен бота', `<input name="botToken" type="password" value="${esc(device.botToken)}" placeholder="123456:AA…" autocomplete="off">`, 'Хранится только в этом браузере и не попадает в Gist.')}
            ${field('Напомнить за, мин', `<input name="remindAhead" type="number" min="0" max="10080" step="5" value="${esc(s.remindAhead)}">`)}
            ${field('Час дневной сводки', `<input name="digestHour" type="number" min="0" max="23" step="1" value="${esc(s.digestHour)}">`, 'По часовому поясу из профиля.')}
            <div class="field check col-2">
              <input type="checkbox" name="digestEnabled" ${s.digestEnabled ? 'checked' : ''}>
              <span>Присылать дневную сводку</span>
            </div>
          </div>
          <div class="flex wrap gap-8" style="padding:0 18px 10px">
            <button type="submit" class="btn primary">Сохранить</button>
            <button type="button" class="btn" data-action="test-telegram">${icon('send', 14)} Тест в Telegram</button>
            <button type="button" class="btn ghost" data-action="detect-chat">${icon('telegram', 14)} Узнать chat ID</button>
          </div>
        </form>
        <div class="settings-note">
          Для автоотправки нужен <strong>токен в секретах GitHub Actions</strong> и chat ID в данных Gist.
          Кнопки выше работают напрямую из браузера — удобно для проверки.
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Telegram Mini App</h2><span class="badge ${mini ? 'ok' : ''}">${mini ? 'открыто в Telegram' : 'не активно'}</span></div>
        <div class="card-body">
          <div class="status-line ${mini ? 'ok' : 'warn'}">
            <span class="dot ${mini ? 'ok' : 'warn'}"></span>
            ${mini
    ? `Приложение открыто внутри Telegram${tgUser?.first_name ? ` · ${esc(tgUser.first_name)}` : ''}`
    : 'Сейчас приложение открыто в обычном браузере'}
          </div>
          <p class="muted small" style="margin-top:12px">
            Кнопка «Приложение» в боте открывает этот же интерфейс внутри Telegram.
            Напоминания и сводка приходят с кнопкой быстрого перехода, а системная кнопка «Назад» работает как в нативном приложении.
          </p>
          <div class="field" style="margin-top:14px">
            <span>URL приложения для Mini App</span>
            <div class="flex gap-8" style="align-items:center">
              <input type="text" value="${esc(publicUrl)}" readonly data-focus-key="app-url" aria-label="URL приложения для Mini App" style="flex:1;min-width:0">
              <button type="button" class="btn ghost" data-action="copy-app-url">${icon('copy', 14)} Копировать</button>
            </div>
            <span class="field-hint">
              Добавь этот URL в GitHub → Settings → Secrets and variables → Actions → <b>Variables</b> как
              <b>APP_URL</b>. Workflow сам поставит кнопку меню в боте.
            </span>
            ${publicUrl.startsWith('https://') ? '' : '<span class="field-hint" style="color:var(--warn)">Локальный HTTP-адрес не подойдёт для Telegram — нужен HTTPS.</span>'}
          </div>
          <div class="settings-note" style="padding:14px 0 0">
            Нужен HTTPS-адрес (GitHub Pages подходит). В Mini App своё локальное хранилище:
            при первом открытии подключи Gist заново — токен останется только на этом устройстве.
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Синхронизация · GitHub Gist</h2><span class="dot ${status.state === 'synced' ? 'ok' : status.state === 'error' ? 'bad' : syncConfigured() ? 'warn' : ''}"></span></div>
        <div class="status-line ${syncStateTone}">
          <span class="dot ${status.state === 'synced' ? 'ok' : status.state === 'error' ? 'bad' : syncConfigured() ? 'warn' : ''}"></span>
          ${esc(syncStateText)}
        </div>
        <form class="settings-form" data-form="sync">
          <div class="form-grid">
            ${field('GitHub-токен', `<input name="token" type="password" value="${esc(cfg.token)}" placeholder="ghp_…" autocomplete="off">`, 'Classic PAT со scope <b>gist</b>. Хранится только в этом браузере.')}
            ${field('ID приватного Gist', `<input name="gistId" type="text" value="${esc(cfg.gistId)}" placeholder="a1b2c3…">`, cfg.login ? `Аккаунт: <b>@${esc(cfg.login)}</b>` : 'Создай gist кнопкой ниже.')}
            <div class="field check col-2">
              <input type="checkbox" name="autoSync" ${cfg.autoSync ? 'checked' : ''}>
              <span>Автосинхронизация после каждого изменения</span>
            </div>
          </div>
          <div class="flex wrap gap-8" style="padding:0 18px 10px">
            <button type="submit" class="btn primary">Сохранить ключи</button>
            <button type="button" class="btn" data-action="verify-token">${icon('check', 14)} Проверить токен</button>
            <button type="button" class="btn ghost" data-action="create-gist">${icon('plus', 14)} Создать Gist</button>
            <button type="button" class="btn ghost" data-action="find-gist">${icon('search', 14)} Найти Gist</button>
            <button type="button" class="btn ghost" data-action="sync-now">${icon('sync', 14)} Sync</button>
            <button type="button" class="btn danger ghost" data-action="disconnect-sync">Отключить</button>
          </div>
        </form>
        <div class="settings-note">
          <strong>Почему Gist?</strong> Это бесплатно, не требует сервера и работает как общая база для приложения и бота.
          Токен даёт доступ только к твоим gists — не используй чужие устройства.
          Gist должен быть <strong>приватным</strong>: в нём лежат имена клиентов и суммы сделок.
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Данные</h2><span class="badge">${store.alive('deals').length} сделок · ${beatsCount} битов</span></div>
        <div class="card-body">
          <div class="flex wrap gap-8">
            <button class="btn" data-action="download-backup">${icon('download', 14)} Скачать бэкап</button>
            <button class="btn ghost" data-action="import-backup">${icon('upload', 14)} Импорт JSON</button>
            <button class="btn ghost" data-action="export-csv" data-type="deals">CSV сделки</button>
            <button class="btn ghost" data-action="export-csv" data-type="contacts">CSV клиенты</button>
            <button class="btn ghost" data-action="export-csv" data-type="tasks">CSV задачи</button>
          </div>
          <input type="file" id="import-file" accept="application/json,.json" hidden>
          <div class="settings-note" style="padding:14px 0 0">
            Полный бэкап содержит все сущности и настройки. Импорт заменяет данные на этом устройстве,
            а при включённой синхронизации — и в Gist.
          </div>
          <div class="flex wrap gap-8" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line-soft)">
            <button class="btn ghost" data-action="load-demo">${icon('zap', 14)} Демо-данные</button>
            <button class="btn danger ghost" data-action="reset-data">${icon('trash', 14)} Очистить всё</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Бот и напоминания</h2><span class="badge accent">GitHub Actions</span></div>
        <div class="steps" style="padding-top:16px">
          ${steps.map((step, index) => `<div class="step ${step.done ? 'done' : ''}">
            <span class="step-n">${step.done ? icon('check', 12) : index + 1}</span>
            <div>${step.label}</div>
          </div>`).join('')}
          <div class="step">
            <span class="step-n">5</span>
            <div>В GitHub добавь секреты <b>GIST_ID</b>, <b>GIST_TOKEN</b>, <b>TELEGRAM_BOT_TOKEN</b>, переменную <b>APP_URL</b> и включи Actions.</div>
          </div>
          <div class="step">
            <span class="step-n">6</span>
            <div>Проверь workflow <b>Telegram bot &amp; reminders</b> кнопкой «Run workflow».</div>
          </div>
          <div class="step">
            <span class="step-n">7</span>
            <div>Открой бота и нажми кнопку <b>«Приложение»</b> — это и есть Mini App.</div>
          </div>
        </div>
        ${repo ? `<div class="flex wrap gap-8" style="padding:0 18px 18px">
          <a class="btn sm" href="${esc(actionsUrl)}" target="_blank" rel="noopener">${icon('github', 14)} Actions</a>
          <a class="btn sm ghost" href="${esc(secretsUrl)}" target="_blank" rel="noopener">${icon('lock', 14)} Секреты</a>
          <a class="btn sm ghost" href="${esc(setupUrl)}" target="_blank" rel="noopener">${icon('note', 14)} Инструкция</a>
        </div>` : `<div class="settings-note">Укажи URL репозитория в поле ниже — появятся быстрые ссылки на Actions и секреты.</div>`}
        <form class="settings-form" data-form="repo">
          <div class="form-grid" style="padding-top:0">
            ${field('URL репозитория', `<input name="repoUrl" type="url" value="${esc(s.repoUrl)}" placeholder="https://github.com/user/producer-sales-helper">`, 'Нужен только для ссылок и памятки.')}
            <div class="field"></div>
          </div>
          <div class="settings-foot"><button class="btn" type="submit">Сохранить URL</button></div>
        </form>
      </div>

      <div class="card">
        <div class="card-head"><h2>Приложение</h2><span class="badge ok">${mini ? 'Mini App' : 'PWA'}</span></div>
        <div class="card-body">
          <div class="stat-row"><span class="k">Версия</span><span class="v">1.1.0</span></div>
          <div class="stat-row"><span class="k">Режим</span><span class="v">${mini ? 'Telegram Mini App' : 'Браузер / PWA'}</span></div>
          <div class="stat-row"><span class="k">Хранилище</span><span class="v">localStorage + Gist</span></div>
          <div class="stat-row"><span class="k">Офлайн</span><span class="v ok-text">${navigator.onLine ? 'онлайн' : 'офлайн-режим'}</span></div>
          <div class="stat-row"><span class="k">Часовой пояс</span><span class="v">${esc(s.timezone)}</span></div>
          <div class="flex wrap gap-8" style="margin-top:16px">
            ${mini
    ? `<a class="btn accent" href="${esc(publicUrl)}" target="_blank" rel="noopener">${icon('external', 14)} Открыть в браузере</a>`
    : `<button class="btn accent" data-action="install-app">${icon('download', 14)} Установить приложение</button>`}
            <button class="btn ghost" data-action="toggle-theme">${icon(s.theme === 'light' ? 'moon' : 'sun', 14)} ${s.theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}</button>
          </div>
          <div class="settings-note" style="padding:14px 0 0">
            ${mini
    ? 'Тот же интерфейс можно открыть в браузере по ссылке выше — данные подтянутся из Gist после ввода токена.'
    : 'На телефоне открой сайт в Chrome/Safari и выбери «Добавить на главный экран». Приложение будет работать офлайн, а данные подтянутся из Gist при подключении.'}
          </div>
        </div>
      </div>
    </div>

    <div class="insight warn">
      <span class="i-ico">${icon('lock', 15)}</span>
      <div><b>Безопасность.</b> Не коммить токены в репозиторий и не публикуй Gist. Если устройство потеряно — отзови PAT на GitHub и перевыпусти токен бота у @BotFather.</div>
    </div>
  </section>`;
}
