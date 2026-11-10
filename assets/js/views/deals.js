import { store } from '../store.js';
import {
  STAGES, OPEN_STAGE_IDS, alive, totals, isOpen, isWon, weightedAmount, dealAmount, dealProbability, stageInfo,
} from '../stats.js';
import { money, esc, fmtDate, relDay, sum } from '../util.js';
import { icon } from '../icons.js';
import {
  pageHead, emptyState, dealCard, kpiBox, stageBadge,
} from './partials.js';

export function render(ctx) {
  const ui = ctx.ui;
  const deals = alive(store.state.deals);
  const contacts = new Map(store.alive('contacts').map((c) => [c.id, c]));
  const query = String(ui.dealsQuery || '').trim().toLowerCase();
  const sourceFilter = ui.dealsSource || 'all';
  const sources = [...new Set(deals.map((d) => d.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));

  const filtered = deals.filter((deal) => {
    if (sourceFilter !== 'all' && deal.source !== sourceFilter) return false;
    if (!query) return true;
    const contact = contacts.get(deal.contactId);
    return [deal.title, deal.notes, deal.source, deal.license, contact?.name, ...(deal.beats || [])]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  const month = totals(store.state, new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date());
  const pipeline = sum(filtered.filter(isOpen), weightedAmount);
  const rawPipeline = sum(filtered.filter(isOpen), dealAmount);

  const header = pageHead(
    'Сделки',
    `${filtered.length} ${filtered.length === 1 ? 'сделка' : 'сделок'} в выборке · ${money(rawPipeline)} в работе`,
    `<button class="btn primary" data-action="add-deal">${icon('plus', 15)} Сделка</button>`,
  );

  if (!deals.length) {
    return `<section class="page">${header}
      <div class="card">${emptyState({
    iconName: 'deals',
    title: 'Воронка пока пустая',
    text: 'Добавь первый лид или загрузи демо-данные, чтобы увидеть, как работает канбан.',
    action: `<button class="btn primary" data-action="add-deal">Добавить сделку</button>
             <button class="btn ghost" data-action="load-demo">Загрузить демо</button>`,
  })}</div>
    </section>`;
  }

  const toolbar = `<div class="toolbar">
    <div class="search">
      ${icon('search', 15)}
      <input type="text" placeholder="Сделка, клиент, бит…" value="${esc(ui.dealsQuery || '')}"
        data-filter="dealsQuery" data-focus-key="deals-query" aria-label="Поиск по сделкам">
    </div>
    <select data-filter="dealsSource" aria-label="Источник">
      <option value="all">Все источники</option>
      ${sources.map((source) => `<option value="${esc(source)}" ${sourceFilter === source ? 'selected' : ''}>${esc(source)}</option>`).join('')}
    </select>
    <span class="spacer"></span>
    <div class="segmented" role="group" aria-label="Вид">
      <button class="${ui.dealView === 'board' ? 'active' : ''}" data-action="set-deal-view" data-view="board">${icon('deals', 13)} Доска</button>
      <button class="${ui.dealView === 'table' ? 'active' : ''}" data-action="set-deal-view" data-view="table">${icon('list', 13)} Таблица</button>
    </div>
  </div>`;

  const kpis = `<div class="kpi-grid">
    ${kpiBox({ label: 'В работе', value: `${filtered.filter(isOpen).length}`, hint: `${money(rawPipeline)} сырая сумма`, iconName: 'deals' })}
    ${kpiBox({ label: 'Взвешенный пайплайн', value: money(pipeline), hint: 'с учётом вероятности', iconName: 'pipeline' })}
    ${kpiBox({ label: 'Оплачено за месяц', value: money(month.revenue), hint: `${month.won} закрыто`, iconName: 'wallet' })}
    ${kpiBox({ label: 'Win rate', value: month.winRate === null ? '—' : `${month.winRate.toFixed(0)}%`, hint: `${month.lost} отказов`, iconName: 'target' })}
  </div>`;

  let content = '';

  if (ui.dealView === 'table') {
    const ordered = filtered.slice().sort((a, b) => {
      const ai = STAGES.findIndex((s) => s.id === a.stage);
      const bi = STAGES.findIndex((s) => s.id === b.stage);
      if (ai !== bi) return ai - bi;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });

    content = `<div class="card"><div class="table-wrap">
      <table class="data">
        <thead><tr>
          <th>Сделка</th><th>Клиент</th><th>Этап</th><th class="num">Сумма</th><th class="num">Вер.</th><th>След. действие</th><th>Источник</th><th></th>
        </tr></thead>
        <tbody>
          ${ordered.map((deal) => {
    const contact = contacts.get(deal.contactId);
    return `<tr class="clickable" data-action="edit-deal" data-id="${esc(deal.id)}">
              <td>
                <div class="cell-title">${esc(deal.title)}</div>
                <div class="cell-sub">${(deal.beats || []).length ? esc(deal.beats.join(', ')) : esc(deal.license || '')}</div>
              </td>
              <td>${contact ? esc(contact.name) : '<span class="dim">—</span>'}</td>
              <td>
                <select data-action="set-stage" data-id="${esc(deal.id)}" aria-label="Этап сделки" ${deal.stage === 'delivered' ? 'disabled' : ''}>
                  ${STAGES.map((stage) => `<option value="${stage.id}" ${deal.stage === stage.id ? 'selected' : ''}>${stage.label}</option>`).join('')}
                </select>
              </td>
              <td class="num">${money(dealAmount(deal))}</td>
              <td class="num">${dealProbability(deal)}%</td>
              <td>${deal.nextActionAt ? `<span class="${new Date(deal.nextActionAt) < new Date() ? 'bad-text' : ''}">${esc(relDay(deal.nextActionAt))}</span>` : '<span class="dim">—</span>'}</td>
              <td>${deal.source ? `<span class="tag">${esc(deal.source)}</span>` : '<span class="dim">—</span>'}</td>
              <td class="actions"><button class="icon-btn" data-action="advance-deal" data-id="${esc(deal.id)}" title="Следующий этап" ${isWon(deal) || deal.stage === 'lost' ? 'disabled' : ''}>${icon('arrow-right', 16)}</button></td>
            </tr>`;
  }).join('')}
        </tbody>
      </table>
    </div></div>`;
  } else {
    content = `<div class="board">
      ${STAGES.map((stage) => {
    const stageDeals = filtered
      .filter((deal) => deal.stage === stage.id)
      .sort((a, b) => {
        const aNext = a.nextActionAt ? new Date(a.nextActionAt).getTime() : Infinity;
        const bNext = b.nextActionAt ? new Date(b.nextActionAt).getTime() : Infinity;
        if (aNext !== bNext) return aNext - bNext;
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      });
    const stageSum = sum(stageDeals, dealAmount);
    return `<div class="board-col" data-stage="${stage.id}">
          <div class="board-col-head">
            <span class="stage-dot" style="background:${stage.color}"></span>
            <span class="stage-name">${stage.label}</span>
            <span class="stage-sum">${stageDeals.length}${stageSum ? ` · ${money(stageSum)}` : ''}</span>
          </div>
          <div class="board-col-body">
            ${stageDeals.length ? stageDeals.map(dealCard).join('') : '<div class="board-empty">Пусто</div>'}
          </div>
        </div>`;
  }).join('')}
    </div>
    <p class="tiny dim" style="margin-top:8px">Перетаскивай карточки между колонками или используй стрелку «следующий этап».</p>`;
  }

  return `<section class="page">
    ${header}
    ${kpis}
    ${toolbar}
    ${content}

    <div class="insight info">
      <span class="i-ico">${icon('info', 15)}</span>
      <div>Смена этапа автоматически обновляет вероятность, дату закрытия и историю воронки. Оплата фиксируется как активность в журнале.</div>
    </div>
  </section>`;
}
