import { store, ACTIVITY_TYPES } from '../store.js';
import { alive } from '../stats.js';
import {
  esc, fmtTime, relDay, timeAgo, dayKey, monthKey,
} from '../util.js';
import { icon } from '../icons.js';
import {
  pageHead, emptyState, avatar,
} from './partials.js';

const TYPE_ICONS = {
  outreach: 'send',
  reply: 'reply',
  call: 'phone',
  payment: 'wallet',
  note: 'note',
};

export function render(ctx) {
  const ui = ctx.ui;
  const activities = alive(store.state.activities)
    .slice()
    .sort((a, b) => new Date(b.at || b.createdAt || 0) - new Date(a.at || a.createdAt || 0));

  const filter = ui.journalType || 'all';
  const filtered = filter === 'all' ? activities : activities.filter((row) => row.type === filter);
  const contacts = new Map(store.alive('contacts').map((c) => [c.id, c]));
  const deals = new Map(store.alive('deals').map((d) => [d.id, d]));

  const counts = { all: activities.length };
  for (const type of ACTIVITY_TYPES) counts[type.id] = activities.filter((row) => row.type === type.id).length;

  const monthActivities = activities.filter((row) => monthKey(new Date(row.at || row.createdAt)) === monthKey());
  const payments = monthActivities.filter((row) => row.type === 'payment').length;

  const groups = new Map();
  for (const row of filtered) {
    const key = dayKey(new Date(row.at || row.createdAt));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const body = filtered.length ? [...groups.entries()].map(([, rows]) => {
    const first = rows[0];
    return `<div class="task-group">
      <div class="task-group-head">${esc(relDay(first.at || first.createdAt))}<span class="n">${rows.length}</span></div>
      <div class="card"><div class="card-body" style="padding:6px 14px">
        <div class="timeline">
          ${rows.map((row) => {
    const contact = contacts.get(row.contactId);
    const deal = deals.get(row.dealId);
    return `<div class="tl-item" data-action="edit-activity" data-id="${esc(row.id)}" style="cursor:pointer">
              <span class="tl-ico ${esc(row.type)}">${icon(TYPE_ICONS[row.type] || 'note', 14)}</span>
              <div class="tl-body">
                <div class="tl-top">
                  <span class="tl-type">${esc(ACTIVITY_TYPES.find((t) => t.id === row.type)?.label || 'Заметка')}</span>
                  <span class="tl-time">${esc(fmtTime(row.at || row.createdAt))}${contact ? ` · ${esc(contact.name)}` : ''}${deal ? ` · ${esc(deal.title)}` : ''}</span>
                </div>
                ${row.note ? `<div class="tl-note">${esc(row.note)}</div>` : ''}
                <div class="tl-links">${esc(timeAgo(row.at || row.createdAt))}</div>
              </div>
            </div>`;
  }).join('')}
        </div>
      </div></div>
    </div>`;
  }).join('') : emptyState({
    iconName: 'activity',
    title: activities.length ? 'Ничего не нашли' : 'Журнал пока пуст',
    text: activities.length ? 'Попробуй другой фильтр.' : 'Фиксируй аутрич, ответы, звонки и оплаты — это основа аналитики и понимания, что работает.',
    action: activities.length ? '' : '<button class="btn primary" data-action="add-activity">Записать первое касание</button>',
  });

  return `<section class="page">
    ${pageHead(
    'Журнал активности',
    `В этом месяце ${monthActivities.length} касаний · ${payments} оплат`,
    `<button class="btn primary" data-action="add-activity">${icon('plus', 15)} Касание</button>`,
  )}

    <div class="toolbar">
      <button class="chip ${filter === 'all' ? 'active' : ''}" data-action="set-journal-filter" data-value="all">Все <span class="chip-n">${counts.all}</span></button>
      ${ACTIVITY_TYPES.map((type) => `<button class="chip ${filter === type.id ? 'active' : ''}" data-action="set-journal-filter" data-value="${type.id}">
        ${esc(type.label)} <span class="chip-n">${counts[type.id] || 0}</span>
      </button>`).join('')}
      <span class="spacer"></span>
      <span class="tiny dim">клик по записи — редактирование</span>
    </div>

    ${body}

    <div class="insight info">
      <span class="i-ico">${icon('info', 15)}</span>
      <div>Сделки и оплаты тоже попадают в журнал автоматически. Аутрич и ответы лучше вносить вручную — тогда в аналитике появится реальная конверсия.</div>
    </div>
  </section>`;
}
