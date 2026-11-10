import { store } from '../store.js';
import { alive, isWon, dealAmount } from '../stats.js';
import { money, esc, initials, relDay, tgLink, tgHandle } from '../util.js';
import { icon } from '../icons.js';
import { pageHead, emptyState, avatar } from './partials.js';

export function render(ctx) {
  const ui = ctx.ui;
  const contacts = alive(store.state.contacts);
  const deals = alive(store.state.deals);
  const tasks = alive(store.state.tasks);
  const query = String(ui.crmQuery || '').trim().toLowerCase();

  const dealsByContact = new Map();
  for (const deal of deals) {
    if (!deal.contactId) continue;
    const list = dealsByContact.get(deal.contactId) || [];
    list.push(deal);
    dealsByContact.set(deal.contactId, list);
  }

  const tasksByContact = new Map();
  for (const task of tasks) {
    if (!task.contactId || task.done) continue;
    const list = tasksByContact.get(task.contactId) || [];
    list.push(task);
    tasksByContact.set(task.contactId, list);
  }

  const sources = [...new Set(contacts.map((c) => c.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));

  const rows = contacts
    .filter((contact) => {
      if (ui.crmSource && ui.crmSource !== 'all' && contact.source !== ui.crmSource) return false;
      if (!query) return true;
      const haystack = [contact.name, contact.role, contact.handle, contact.email, contact.country, contact.source, ...(contact.tags || []), contact.notes]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    })
    .map((contact) => {
      const contactDeals = dealsByContact.get(contact.id) || [];
      const revenue = contactDeals.filter(isWon).reduce((acc, deal) => acc + dealAmount(deal), 0);
      const nextTask = (tasksByContact.get(contact.id) || [])
        .slice()
        .sort((a, b) => new Date(a.dueAt || '2999-01-01') - new Date(b.dueAt || '2999-01-01'))[0];
      return { contact, deals: contactDeals, revenue, nextTask };
    })
    .sort((a, b) => b.revenue - a.revenue || a.contact.name.localeCompare(b.contact.name, 'ru'));

  const totalRevenue = rows.reduce((acc, row) => acc + row.revenue, 0);

  const table = rows.length ? `<div class="table-wrap">
    <table class="data">
      <thead><tr>
        <th>Контакт</th><th>Связь</th><th>Источник</th><th class="num">Сделки</th><th class="num">Выручка</th><th>След. задача</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.map(({ contact, deals: contactDeals, revenue, nextTask }) => {
    const open = contactDeals.filter((deal) => !isWon(deal) && deal.stage !== 'lost').length;
    return `<tr class="clickable" data-action="view-contact" data-id="${esc(contact.id)}">
          <td>
            <div class="cell-main">
              ${avatar(contact.name)}
              <div>
                <div class="cell-title">${esc(contact.name)}</div>
                <div class="cell-sub">${esc(contact.role)}${contact.country ? ` · ${esc(contact.country)}` : ''}</div>
              </div>
            </div>
          </td>
          <td>
            <div class="cell-sub">${contact.handle ? `@${esc(tgHandle(contact.handle))}` : ''}${contact.handle && contact.email ? '<br>' : ''}${contact.email ? esc(contact.email) : ''}${!contact.handle && !contact.email ? '<span class="dim">—</span>' : ''}</div>
          </td>
          <td>${contact.source ? `<span class="tag">${esc(contact.source)}</span>` : '<span class="dim">—</span>'}</td>
          <td class="num">
            <div>${contactDeals.length}</div>
            <div class="cell-sub">${open ? `${open} в работе` : contactDeals.length ? 'закрыты' : '—'}</div>
          </td>
          <td class="num">${revenue ? `<span class="ok-text mono">${money(revenue)}</span>` : '<span class="dim">—</span>'}</td>
          <td>${nextTask ? `<span class="${nextTask.dueAt && new Date(nextTask.dueAt) < new Date() ? 'bad-text' : ''}">${esc(relDay(nextTask.dueAt))}</span><div class="cell-sub" style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nextTask.title)}</div>` : '<span class="dim">—</span>'}</td>
          <td class="actions"><span class="icon-btn">${icon('chevron-right', 16)}</span></td>
        </tr>`;
  }).join('')}
      </tbody>
    </table>
  </div>` : emptyState({
    iconName: 'users',
    title: contacts.length ? 'Никого не нашли' : 'В CRM пока пусто',
    text: contacts.length ? 'Попробуй другой запрос или сбрось фильтр источника.' : 'Добавь артиста, менеджера или лейбл — и начни вести касания.',
    action: contacts.length ? '' : '<button class="btn primary" data-action="add-contact">Добавить контакт</button>',
  });

  return `<section class="page">
    ${pageHead(
    'Клиенты',
    `${contacts.length} ${contacts.length === 1 ? 'контакт' : 'контактов'} · ${money(totalRevenue)} выручки всего`,
    `<button class="btn ghost" data-action="add-activity">${icon('activity', 15)} Касание</button>
       <button class="btn primary" data-action="add-contact">${icon('plus', 15)} Контакт</button>`,
  )}

    <div class="toolbar">
      <div class="search">
        ${icon('search', 15)}
        <input type="text" placeholder="Имя, Telegram, тег, заметка…" value="${esc(ui.crmQuery || '')}"
          data-filter="crmQuery" data-focus-key="crm-query" aria-label="Поиск по клиентам">
      </div>
      <select data-filter="crmSource" aria-label="Источник">
        <option value="all">Все источники</option>
        ${sources.map((source) => `<option value="${esc(source)}" ${ui.crmSource === source ? 'selected' : ''}>${esc(source)}</option>`).join('')}
      </select>
      <span class="spacer"></span>
      <span class="tiny dim">${rows.length} ${rows.length === 1 ? 'контакт' : 'контактов'}</span>
    </div>

    <div class="card">${table}</div>

    <div class="insight info">
      <span class="i-ico">${icon('info', 15)}</span>
      <div>Клик по строке открывает карточку клиента: сделки, задачи, история касаний и быстрые действия. Telegram-ник в карточке открывается в один клик.</div>
    </div>
  </section>`;
}
