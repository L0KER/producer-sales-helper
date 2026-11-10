// Telegram Mini App bridge.
//
// Loaded on every page, but every function is a no-op outside Telegram, so the
// same build keeps working as a normal PWA in a browser. The telegram-web-app.js
// script is included in index.html; this module only adapts the UI to it.

let app = null;

function getWebApp() {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp || null;
}

export function isMiniApp() {
  const tg = app || getWebApp();
  if (!tg) return false;
  if (tg.initData) return true;
  const platform = String(tg.platform || '').toLowerCase();
  return Boolean(platform && platform !== 'unknown');
}

export function miniAppUser() {
  if (!isMiniApp()) return null;
  const tg = app || getWebApp();
  return tg?.initDataUnsafe?.user || null;
}

export function initTelegram({ onBack } = {}) {
  const tg = getWebApp();
  if (!tg || !isMiniApp()) return false;

  app = tg;
  document.body.classList.add('tg-miniapp');
  const platform = String(tg.platform || '').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  if (platform) document.body.classList.add(`tg-${platform}`);

  // Hide the loading placeholder and take the maximum available height.
  try { tg.ready(); } catch { /* older clients */ }
  try { tg.expand(); } catch { /* older clients */ }

  syncViewport();
  tg.onEvent?.('viewportChanged', syncViewport);
  tg.onEvent?.('themeChanged', () => {
    const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    applyTelegramChrome(theme);
  });

  if (onBack && tg.BackButton) {
    tg.BackButton.onClick(() => {
      try {
        onBack();
      } catch (error) {
        console.error(error);
      }
    });
  }

  applyTelegramChrome(document.documentElement.dataset.theme);
  return true;
}

function syncViewport() {
  if (!app) return;
  const height = Number(app.viewportStableHeight || app.viewportHeight || 0);
  if (height > 0) {
    document.documentElement.style.setProperty('--psh-vh', `${height}px`);
  }
}

export function applyTelegramChrome(theme = 'dark') {
  const tg = app || getWebApp();
  if (!tg || !isMiniApp()) return;

  const light = theme === 'light';
  const background = light ? '#f4f5fa' : '#07080c';
  const header = light ? '#ffffff' : '#0b0d14';

  try { tg.setHeaderColor?.(header); } catch { /* older clients */ }
  try { tg.setBackgroundColor?.(background); } catch { /* older clients */ }
  try { tg.setBottomBarColor?.(background); } catch { /* older clients */ }
}

export function setTelegramBack(visible) {
  if (!isMiniApp()) return;
  const tg = app || getWebApp();
  if (!tg?.BackButton) return;
  try {
    if (visible) tg.BackButton.show();
    else tg.BackButton.hide();
  } catch { /* older clients */ }
}

export function haptic(kind = 'light') {
  if (!isMiniApp()) return;
  const tg = app || getWebApp();
  const feedback = tg?.HapticFeedback;
  if (!feedback) return;

  try {
    if (kind === 'success' || kind === 'error' || kind === 'warning') {
      feedback.notificationOccurred(kind);
    } else if (kind === 'selection') {
      feedback.selectionChanged();
    } else {
      const style = ['light', 'medium', 'heavy', 'rigid', 'soft'].includes(kind) ? kind : 'light';
      feedback.impactOccurred(style);
    }
  } catch { /* older clients */ }
}

export function closeMiniApp() {
  if (!isMiniApp()) return;
  const tg = app || getWebApp();
  try { tg?.close?.(); } catch { /* older clients */ }
}

// The public HTTPS URL the bot should open. Works both on GitHub Pages and on a
// custom domain; the hash and query are stripped because routing is in the hash.
export function appBaseUrl() {
  if (typeof location === 'undefined') return '';
  try {
    const url = new URL(location.href);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/index\.html?$/i, '');
    return url.href;
  } catch {
    return '';
  }
}
