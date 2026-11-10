import {
  store, getSyncConfig, getSyncStatus, syncConfigured, onSyncChange, syncNow,
} from './store.js';
import {
  taskTotals, taskBuckets,
} from './stats.js';
import {
  setCurrency, esc, toast, timeAgo, debounce,
} from './util.js';
import { icon } from './icons.js';
import {
  initActions, runAction, submitSettingsForm, importBackupFile, moveDealToStage,
} from './actions.js';
import { closeModal } from './forms.js';
import {
  initTelegram, setTelegramBack, applyTelegramChrome, miniAppUser, closeMiniApp,
} from './telegram.js';
import * as dashboard from './views/dashboard.js';
import * as crm from './views/crm.js';
import * as deals from './views/deals.js';
import * as tasks from './views/tasks.js';
import * as catalog from './views/catalog.js';
import * as journal from './views/journal.js';
import * as analytics from './views/analytics.js';
import * as settings from './views/settings.js';

const ROUTES = {
  dashboard: { label: 'Обзор', icon: 'dashboard', view: dashboard },
  crm: { label: 'Клиенты', icon: 'users', view: crm },
  deals: { label: 'Сделки', icon: 'deals', view: deals },
  tasks: { label: 'Задачи', icon: 'tasks', view: tasks },
  catalog: { label: 'Каталог', icon: 'music', view: catalog },
  journal: { label: 'Журнал', icon: 'activity', view: journal },
  analytics: { label: 'Аналитика', icon: 'chart', view: analytics },
  settings: { label: 'Настройки', icon: 'settings', view: settings },
};

const NAV_ORDER = ['dashboard', 'crm', 'deals', 'tasks', 'catalog', 'journal', 'analytics'];

const ui = {
  route: 'dashboard',
  crmQuery: '',
  crmSource: 'all',
  dealsQuery: '',
  dealsSource: 'all',
  dealView: 'board',
  taskFilter: 'open',
  journalType: 'all',
  beatsQuery: '',
  beatStatus: 'all',
  analyticsPeriod: 'month',
};

let renderScheduled = false;
let activeHash = '';

/* ------------------------------------------------------------------ */
/* Theme & helpers                                                      */
/* ------------------------------------------------------------------ */

function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f4f5fa' : '#07080c');
  applyTelegramChrome(next);
}

function telegramBack() {
  const root = document.getElementById('modal-root');
  if (root && root.innerHTML.trim()) {
    closeModal();
    return;
  }
  if (document.body.classList.contains('drawer-open')) {
    drawerOpen(false);
    return;
  }
  if (ui.route !== 'dashboard') {
    navigate('#/dashboard');
    return;
  }
  closeMiniApp();
}

function syncLabel() {
  const status = getSyncStatus();
  const cfg = getSyncConfig();
  if (!syncConfigured()) {
    return { dot: '', text: 'Только это устройство', short: 'Локально', title: 'Подключи Gist в настройках' };
  }
  if (status.state === 'syncing') return { dot: 'syncing', text: 'Синхронизация…', short: 'Sync…', title: 'Синхронизация идёт' };
  if (status.state === 'error') return { dot: 'bad', text: 'Ошибка синхронизации', short: 'Ошибка', title: status.message || 'Ошибка' };
  if (status.state === 'synced') {
    return {
      dot: 'ok',
      text: `Синхронизировано${cfg.lastSyncAt ? ` · ${timeAgo(cfg.lastSyncAt)}` : ''}`,
      short: 'Synced',
      title: `Последняя синхронизация: ${cfg.lastSyncAt ? timeAgo(cfg.lastSyncAt) : '—'}`,
    };
  }
  return { dot: 'warn', text: 'Gist подключён', short: 'Gist', title: 'Синхронизация ещё не выполнялась' };
}

function drawerOpen(open) {
  document.body.classList.toggle('drawer-open', open);
  const backdrop = document.getElementById('drawer-backdrop');
  if (backdrop) backdrop.hidden = !open;
}

/* ------------------------------------------------------------------ */
/* Shell                                                                */
/* ------------------------------------------------------------------ */

function renderShell() {
  const counts = taskTotals(store.state);
  const sync = syncLabel();
  const sidebar = document.getElementById('sidebar');
  const topbar = document.getElementById('topbar');
  if (!sidebar || !topbar) return;

  sidebar.innerHTML = `
    <div class="brand">
      <img src="./assets/icons/icon.svg" alt="">
      <div>
        <strong>Sales Helper</strong>
        <span>producer edition</span>
      </div>
    </div>
    <nav class="nav">
      ${NAV_ORDER.map((route) => {
    const item = ROUTES[route];
    const isActive = ui.route === route;
    return `<a class="nav-item ${isActive ? 'active' : ''}" href="#/${route}">
          ${icon(item.icon, 18)}
          <span>${esc(item.label)}</span>
          ${route === 'tasks' && counts.overdue ? `<span class="nav-count">${counts.overdue}</span>` : ''}
        </a>`;
  }).join('')}
      <div class="nav-sep"></div>
      <a class="nav-item ${ui.route === 'settings' ? 'active' : ''}" href="#/settings">
        ${icon('settings', 18)}<span>Настройки</span>
      </a>
    </nav>
    <div class="sidebar-foot">
      <button class="sync-badge" data-action="sync-now" title="${esc(sync.title)}">
        <span class="dot ${sync.dot}"></span>
        <span class="sync-text">${esc(sync.text)}</span>
      </button>
      <div class="sidebar-meta">
        <button class="icon-btn" data-action="toggle-theme" title="Сменить тему" aria-label="Сменить тему">
          ${icon(store.settings.theme === 'light' ? 'moon' : 'sun', 16)}
        </button>
        <span>v1.1 · PWA</span>
      </div>
    </div>`;

  topbar.innerHTML = `
    <button class="hamburger" data-action="toggle-drawer" aria-label="Открыть меню">${icon('menu', 19)}</button>
    <div class="topbar-title">${esc(ROUTES[ui.route]?.label || 'Обзор')}</div>
    <div class="topbar-actions">
      <button class="chip" data-action="sync-now" title="${esc(sync.title)}">
        <span class="dot ${sync.dot}"></span>
        <span>${esc(sync.short)}</span>
      </button>
      <button class="btn ghost sm" data-action="add-task">
        ${icon('plus', 14)}<span class="btn-label">Задача</span>
      </button>
      <button class="btn primary sm" data-action="add-deal">
        ${icon('plus', 14)}<span class="btn-label">Сделка</span>
      </button>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                            */
/* ------------------------------------------------------------------ */

function render() {
  const route = ROUTES[ui.route] ? ui.route : 'dashboard';
  ui.route = route;
  const view = ROUTES[route].view;
  const container = document.getElementById('view');
  if (!container) return;

  try {
    container.innerHTML = view.render({ ui, navigate });
  } catch (error) {
    console.error('Render failed', error);
    container.innerHTML = `<section class="page">
      <div class="card"><div class="card-body">
        <h2 style="font-size:18px">Не удалось отрисовать экран</h2>
        <p class="muted small" style="margin-top:8px">${esc(error.message)}</p>
        <button class="btn primary" style="margin-top:14px" data-action="reload-app">Перезагрузить</button>
      </div></div>
    </section>`;
  }

  document.title = `${ROUTES[route].label} · Producer Sales Helper`;
}

function renderNow() {
  const active = document.activeElement;
  const key = active?.dataset?.focusKey;
  const position = active?.selectionStart ?? null;

  render();

  if (key) {
    const escapedKey = window.CSS?.escape ? CSS.escape(key) : key;
    const el = document.querySelector(`[data-focus-key="${escapedKey}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      try {
        if (position !== null && typeof el.setSelectionRange === 'function') {
          el.setSelectionRange(position, position);
        }
      } catch { /* ignore */ }
    }
  }
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderNow();
  });
}

function navigate(hash) {
  if (location.hash === hash) {
    applyRoute();
  } else {
    location.hash = hash;
  }
}

/* ------------------------------------------------------------------ */
/* Routing                                                              */
/* ------------------------------------------------------------------ */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [routePart, queryPart] = raw.split('?');
  const route = ROUTES[routePart] ? routePart : 'dashboard';
  return { route, params: new URLSearchParams(queryPart || '') };
}

function applyRoute() {
  const { route, params } = parseHash();
  ui.route = route;
  renderShell();
  renderNow();
  window.scrollTo({ top: 0, behavior: 'auto' });
  drawerOpen(false);
  setTelegramBack(ui.route !== 'dashboard');

  if (location.hash !== activeHash) {
    activeHash = location.hash;
    if (params.get('new') === '1') {
      if (route === 'deals') runAction('add-deal', document.body, null);
      if (route === 'tasks') runAction('add-task', document.body, null);
      if (route === 'crm') runAction('add-contact', document.body, null);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Events                                                               */
/* ------------------------------------------------------------------ */

function bindEvents() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (link && !link.dataset.action) {
      if (String(link.getAttribute('href') || '').startsWith('#')) drawerOpen(false);
      return;
    }

    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;

    const action = el.dataset.action;

    if (action === 'toggle-drawer') {
      event.preventDefault();
      drawerOpen(!document.body.classList.contains('drawer-open'));
      return;
    }
    if (action === 'close-drawer') {
      event.preventDefault();
      drawerOpen(false);
      return;
    }
    if (action === 'reload-app') {
      location.reload();
      return;
    }

    event.preventDefault();
    runAction(action, el, event);
  });

  document.addEventListener('input', (event) => {
    const el = event.target.closest('[data-filter]');
    if (!el || el.tagName === 'SELECT') return;
    ui[el.dataset.filter] = el.value;
    debouncedFilterRender();
  });

  document.addEventListener('change', (event) => {
    if (event.target.id === 'import-file') {
      const file = event.target.files?.[0];
      event.target.value = '';
      importBackupFile(file);
      return;
    }

    const filterEl = event.target.closest('[data-filter]');
    if (filterEl) {
      ui[filterEl.dataset.filter] = filterEl.value;
      renderNow();
      return;
    }

    const actionEl = event.target.closest('select[data-action]');
    if (actionEl) {
      runAction(actionEl.dataset.action, actionEl, event);
    }
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    submitSettingsForm(form);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const root = document.getElementById('modal-root');
      if (root && root.innerHTML.trim()) {
        closeModal();
      } else {
        drawerOpen(false);
      }
    }
  });

  document.getElementById('drawer-backdrop')?.addEventListener('click', () => drawerOpen(false));

  // Kanban drag & drop
  let draggedId = null;

  document.addEventListener('dragstart', (event) => {
    const card = event.target.closest('[data-drag-deal]');
    if (!card) return;
    draggedId = card.dataset.dragDeal;
    event.dataTransfer.effectAllowed = 'move';
    try {
      event.dataTransfer.setData('text/plain', draggedId);
    } catch { /* ignore */ }
    card.classList.add('dragging');
  });

  document.addEventListener('dragend', (event) => {
    event.target.closest('[data-drag-deal]')?.classList.remove('dragging');
    document.querySelectorAll('.board-col.drag-over').forEach((col) => col.classList.remove('drag-over'));
    draggedId = null;
  });

  document.addEventListener('dragover', (event) => {
    const col = event.target.closest('.board-col');
    if (!col || !draggedId) return;
    event.preventDefault();
    document.querySelectorAll('.board-col.drag-over').forEach((item) => {
      if (item !== col) item.classList.remove('drag-over');
    });
    col.classList.add('drag-over');
  });

  document.addEventListener('drop', (event) => {
    const col = event.target.closest('.board-col');
    if (!col || !draggedId) return;
    event.preventDefault();
    const id = draggedId;
    draggedId = null;
    col.classList.remove('drag-over');
    moveDealToStage(id, col.dataset.stage);
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__pshInstallPrompt = event;
  });

  window.addEventListener('appinstalled', () => {
    window.__pshInstallPrompt = null;
    toast('Приложение установлено', 'ok');
  });

  window.addEventListener('online', () => {
    if (syncConfigured()) syncNow({ silent: true });
  });
}

/* ------------------------------------------------------------------ */
/* Service worker                                                       */
/* ------------------------------------------------------------------ */

function registerServiceWorker() {
  const secure = location.protocol === 'https:'
    || location.hostname === 'localhost'
    || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || !secure) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => registration.update())
      .catch((error) => console.warn('SW registration failed', error));
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                 */
/* ------------------------------------------------------------------ */

const debouncedFilterRender = debounce(() => renderNow(), 180);

function boot() {
  setCurrency(store.settings.currency);

  const inTelegram = initTelegram({ onBack: telegramBack });
  if (inTelegram) {
    // Greet the user by their Telegram name on the first launch in the Mini App.
    const user = miniAppUser();
    if (user?.first_name && !store.settings.ownerName) {
      store.patchSettings({ ownerName: user.first_name }, { touch: false });
    }
  }
  applyTheme(store.settings.theme);

  initActions({
    getUi: () => ui,
    rerender: renderNow,
    navigate,
  });

  renderShell();
  applyRoute();
  bindEvents();
  registerServiceWorker();

  store.subscribe(() => {
    setCurrency(store.settings.currency);
    applyTheme(store.settings.theme);
    renderShell();
    scheduleRender();
  });

  onSyncChange(() => {
    renderShell();
  });

  if (syncConfigured()) {
    syncNow({ silent: true }).then((ok) => {
      if (ok) renderShell();
    });
  }

  // Pull remote changes made by another device or by the bot.
  setInterval(() => {
    if (!syncConfigured() || document.hidden) return;
    syncNow({ silent: true });
  }, 5 * 60 * 1000);

  window.addEventListener('hashchange', applyRoute);
}

boot();
