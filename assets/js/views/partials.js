import { esc, money, fmtDate, fmtDateTime, initials, relDay, truncate } from '../util.js';
import { icon } from '../icons.js';
import {
  STAGES, stageInfo, isOpen, dealAmount, dealProbability, isWon, daysInStage,
} from '../stats.js';
import { store, BEAT_STATUSES } from '../store.js';

export function pageHead(title, subtitle = '', actions = '') {
  return `<header class="page-head">
    <div>
      <h1>${esc(title)}</h1>
      ${subtitle ? `<p class="page-sub">${subtitle}</p>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </header>`;
}

export function kpiBox({
  label, value, hint = '', tone = '', iconName = '', small = '',
}) {
  return `<div class="kpi">
    <div class="kpi-top">
      <span class="kpi-label">${esc(label)}</span>
      ${iconName ? `<span class="kpi-ico">${icon(iconName, 17)}</span>` : ''}
    </div>
    <div class="kpi-value">${value}${small ? ` <small>${esc(small)}</small>` : ''}</div>
    ${hint ? `<div class="kpi-hint ${tone}">${hint}</div>` : ''}
  </div>`;
}

export function stageBadge(stageId) {
  const stage = stageInfo(stageId);
  return `<span class="badge" style="color:${stage.color};background:${stage.color}1a;border-color:${stage.color}33">${esc(stage.label)}</span>`;
}

export function toneBadge(tone, label) {
  return `<span class="badge ${tone || ''}">${esc(label)}</span>`;
}

export function beatStatusBadge(statusId) {
  const status = BEAT_STATUSES.find((s) => s.id === statusId) || BEAT_STATUSES[0];
  return `<span class="badge ${status.tone}">${esc(status.label)}</span>`;
}

export function avatar(name, className = '') {
  const variants = ['', 'alt', 'alt2', 'alt3'];
  const hash = [...String(name || '')].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return `<span class="avatar ${className} ${variants[hash % variants.length]}">${esc(initials(name))}</span>`;
}

export function emptyState({
  iconName = 'info', title = 'Пока пусто', text = '', action = '',
}) {
  return `<div class="empty">
    <div class="empty-ico">${icon(iconName, 24)}</div>
    <h3>${esc(title)}</h3>
    ${text ? `<p>${text}</p>` : ''}
    ${action}
  </div>`;
}

export function contactNameOf(id) {
  const contact = store.state.contacts.find((c) => c.id === id && !c.deletedAt);
  return contact?.name || 'Без контакта';
}

export function dealNameOf(id) {
  const deal = store.state.deals.find((d) => d.id === id && !d.deletedAt);
  return deal?.title || '';
}

export function contactOptions() {
  return store.alive('contacts')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .map((contact) => ({ value: contact.id, label: contact.name }));
}

export function dealOptions() {
  return store.alive('deals')
    .filter((deal) => isOpen(deal))
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
    .map((deal) => ({ value: deal.id, label: deal.title }));
}

export function beatOptions() {
  return store.alive('beats')
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
    .map((beat) => ({ value: beat.id, label: beat.title }));
}

export function sourceOptions() {
  const set = new Set();
  for (const deal of store.alive('deals')) if (deal.source) set.add(deal.source);
  for (const contact of store.alive('contacts')) if (contact.source) set.add(contact.source);
  return ['Telegram', 'Instagram', 'BeatStars', 'YouTube', 'Email', 'Fiverr', 'Discord', 'Сарафанное радио', 'Другое', ...set]
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .map((value) => ({ value, label: value }));
}

export function taskRow(task, { compact = false } = {}) {
  const contact = store.state.contacts.find((c) => c.id === task.contactId && !c.deletedAt);
  const deal = store.state.deals.find((d) => d.id === task.dealId && !d.deletedAt);
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const overdue = due && !task.done && due.getTime() < Date.now() - (isToday(due) ? 0 : 0) && due < startOfToday();
  const meta = [];

  if (task.dueAt) {
    const label = `${relDay(task.dueAt)}, ${fmtDateTime(task.dueAt).split(', ').slice(-1)[0] || ''}`;
    meta.push(`<span class="${overdue ? 'overdue' : isToday(due) ? 'today' : ''}">${icon('clock', 11)} ${esc(label)}</span>`);
  } else {
    meta.push(`<span>${icon('calendar', 11)} без даты</span>`);
  }

  if (task.repeat && task.repeat !== 'none') {
    meta.push(`<span class="badge accent" style="font-size:10px;padding:1px 6px">${icon('refresh', 10)} ${esc({ daily: 'день', weekly: 'неделя', monthly: 'месяц' }[task.repeat] || task.repeat)}</span>`);
  }
  if (task.remind !== false) meta.push(`<span title="Напоминание в Telegram">${icon('telegram', 11)}</span>`);
  if (contact) meta.push(`<span>${icon('user', 11)} ${esc(contact.name)}</span>`);
  if (deal) meta.push(`<span>${icon('deals', 11)} ${esc(truncate(deal.title, 34))}</span>`);

  return `<div class="task ${task.done ? 'done' : ''}" data-task-id="${esc(task.id)}">
    <button class="task-check" data-action="toggle-task" data-id="${esc(task.id)}" aria-label="${task.done ? 'Вернуть в работу' : 'Выполнено'}">
      ${icon('check', 12)}
    </button>
    <div class="task-body">
      <div class="task-title">${esc(task.title)}</div>
      <div class="task-meta">${meta.join('')}</div>
      ${!compact && task.notes ? `<div class="task-note">${esc(truncate(task.notes, 160))}</div>` : ''}
    </div>
    <div class="task-actions">
      <button class="icon-btn" data-action="edit-task" data-id="${esc(task.id)}" aria-label="Изменить">${icon('edit', 15)}</button>
    </div>
  </div>`;
}

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isToday(date) {
  if (!date) return false;
  const today = startOfToday();
  return date >= today && date < new Date(today.getTime() + 86400000);
}

export function dealCard(deal) {
  const contact = store.state.contacts.find((c) => c.id === deal.contactId && !c.deletedAt);
  const next = deal.nextActionAt ? new Date(deal.nextActionAt) : null;
  const nextOverdue = next && next.getTime() < Date.now();
  const closed = isWon(deal) || deal.stage === 'lost';

  return `<article class="deal-card ${closed ? 'done' : ''}" draggable="true"
      data-action="edit-deal" data-id="${esc(deal.id)}" data-drag-deal="${esc(deal.id)}">
    <div class="deal-card-top">
      <div class="deal-title">${esc(truncate(deal.title, 60))}</div>
      <div class="deal-amount">${money(dealAmount(deal))}</div>
    </div>
    <div class="deal-contact">
      ${contact ? `${avatar(contact.name, 'sm')}<span>${esc(contact.name)}</span>` : `<span>${icon('user', 12)} без контакта</span>`}
    </div>
    <div class="deal-meta">
      <span class="badge" style="font-size:10px">${esc(deal.license || 'Lease')}</span>
      ${deal.source ? `<span class="tag">${esc(deal.source)}</span>` : ''}
      ${isOpen(deal) ? `<span class="tag">${dealProbability(deal)}%</span>` : ''}
    </div>
    ${next ? `<div class="deal-next" style="${nextOverdue ? 'color:var(--bad)' : ''}">${icon('clock', 12)} ${esc(fmtDate(next))}</div>` : ''}
    ${isOpen(deal) ? `<button class="icon-btn deal-quick" data-action="advance-deal" data-id="${esc(deal.id)}" title="Следующий этап" aria-label="Следующий этап">${icon('arrow-right', 15)}</button>` : ''}
  </article>`;
}

export function funnelHtml(rows) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return `<div class="funnel">
    ${rows.map((row) => `<div class="funnel-row">
      <span class="funnel-label">${esc(row.label)}</span>
      <div class="funnel-track"><div class="funnel-bar" style="width:${Math.max(2, (row.count / max) * 100).toFixed(1)}%"></div></div>
      <span class="funnel-val"><b>${row.count}</b>${row.conversion === null ? '' : ` · ${row.conversion.toFixed(0)}%`}</span>
    </div>`).join('')}
  </div>`;
}

export function deltaText(current, previous, { suffix = '%', invert = false } = {}) {
  if (previous === null || previous === undefined || previous === 0) {
    return { text: 'нет базы для сравнения', tone: '' };
  }
  const delta = ((current - previous) / previous) * 100;
  const positive = invert ? delta < 0 : delta > 0;
  const tone = Math.abs(delta) < 0.5 ? '' : positive ? 'up' : 'down';
  const sign = delta > 0 ? '+' : '';
  return { text: `${sign}${delta.toFixed(0)}${suffix} к прошлому периоду`, tone };
}

export function stageColumns() {
  return STAGES;
}

export function miniProgress(value, max, color = 'var(--accent)') {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return `<div class="funnel-track" style="height:6px"><div class="funnel-bar" style="width:${width}%;background:${color}"></div></div>`;
}

export function daysLabel(deal) {
  const days = daysInStage(deal);
  return `${days} дн`;
}
