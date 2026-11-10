import { store, BEAT_STATUSES } from '../store.js';
import { alive } from '../stats.js';
import { money, esc, fmtDate, sum } from '../util.js';
import { icon } from '../icons.js';
import {
  pageHead, emptyState, beatStatusBadge, kpiBox,
} from './partials.js';

export function render(ctx) {
  const ui = ctx.ui;
  const beats = alive(store.state.beats);
  const query = String(ui.beatsQuery || '').trim().toLowerCase();
  const statusFilter = ui.beatStatus || 'all';

  const filtered = beats
    .filter((beat) => {
      if (statusFilter !== 'all' && beat.status !== statusFilter) return false;
      if (!query) return true;
      return [beat.title, beat.genre, beat.key, ...(beat.tags || []), beat.notes]
        .join(' ')
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      const order = { available: 0, reserved: 1, leased: 2, sold: 3 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return a.title.localeCompare(b.title, 'ru');
    });

  const availableValue = sum(beats.filter((beat) => beat.status === 'available' || beat.status === 'reserved'), (beat) => beat.price);
  const soldCount = beats.filter((beat) => beat.status === 'sold').length;

  const counts = BEAT_STATUSES.map((status) => ({
    ...status,
    count: beats.filter((beat) => beat.status === status.id).length,
  }));

  return `<section class="page">
    ${pageHead(
    'Каталог битов',
    `${beats.length} в каталоге · ${money(availableValue)} в доступных битах`,
    `<button class="btn primary" data-action="add-beat">${icon('plus', 15)} Бит</button>`,
  )}

    <div class="kpi-grid">
      ${kpiBox({ label: 'Всего битов', value: String(beats.length), hint: `${soldCount} продано эксклюзивно`, iconName: 'music' })}
      ${kpiBox({ label: 'Свободно', value: String(beats.filter((b) => b.status === 'available').length), hint: money(sum(beats.filter((b) => b.status === 'available'), (b) => b.price)), iconName: 'zap' })}
      ${kpiBox({ label: 'В аренде / резерве', value: String(beats.filter((b) => b.status === 'leased' || b.status === 'reserved').length), hint: 'активные лицензии', iconName: 'clock' })}
      ${kpiBox({ label: 'Потенциал каталога', value: money(availableValue), hint: 'свободные и зарезервированные', iconName: 'wallet' })}
    </div>

    <div class="toolbar">
      <div class="search">
        ${icon('search', 15)}
        <input type="text" placeholder="Название, жанр, тег…" value="${esc(ui.beatsQuery || '')}"
          data-filter="beatsQuery" data-focus-key="beats-query" aria-label="Поиск по каталогу">
      </div>
      <select data-filter="beatStatus" aria-label="Статус">
        <option value="all">Все статусы</option>
        ${counts.map((status) => `<option value="${status.id}" ${statusFilter === status.id ? 'selected' : ''}>${esc(status.label)} (${status.count})</option>`).join('')}
      </select>
      <span class="spacer"></span>
      <span class="tiny dim">${filtered.length} ${filtered.length === 1 ? 'бит' : 'битов'}</span>
    </div>

    ${filtered.length ? `<div class="beat-grid">
      ${filtered.map((beat) => `<article class="beat-card">
        <button class="icon-btn beat-edit" data-action="edit-beat" data-id="${esc(beat.id)}" aria-label="Изменить бит">${icon('edit', 15)}</button>
        <h3>${esc(beat.title)}</h3>
        <div class="beat-meta">
          ${beat.bpm ? `<span>${esc(beat.bpm)} BPM</span>` : ''}
          ${beat.key ? `<span>${esc(beat.key)}</span>` : ''}
          ${beat.genre ? `<span>${esc(beat.genre)}</span>` : ''}
        </div>
        ${(beat.tags || []).length ? `<div class="tags" style="margin-top:8px">${beat.tags.slice(0, 4).map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>` : ''}
        <div class="beat-price">${beat.price ? money(beat.price) : '<span class="dim" style="font-size:13px">цена не указана</span>'}</div>
        <div class="beat-foot">
          ${beatStatusBadge(beat.status)}
          <div class="beat-actions">
            <button class="btn sm ghost" data-action="beat-to-deal" data-id="${esc(beat.id)}" title="Создать сделку по этому биту">${icon('plus', 13)} Сделка</button>
          </div>
        </div>
        ${beat.notes ? `<div class="tiny dim" style="margin-top:8px">${esc(beat.notes)}</div>` : ''}
      </article>`).join('')}
    </div>` : emptyState({
    iconName: 'music',
    title: beats.length ? 'Ничего не нашли' : 'Каталог пока пуст',
    text: beats.length ? 'Сбрось фильтр или измени запрос.' : 'Добавь биты, чтобы видеть свободные, проданные и зарезервированные позиции.',
    action: beats.length ? '' : '<button class="btn primary" data-action="add-beat">Добавить бит</button>',
  })}

    <div class="insight info">
      <span class="i-ico">${icon('info', 15)}</span>
      <div>Каталог — это не склад, а инструмент продаж: из карточки бита можно сразу создать сделку с названием и ценой.</div>
    </div>
  </section>`;
}
