import { store } from '../store.js';
import {
  PERIODS, periodContext, totals, monthlySeries, funnel, bySource, byLicense, topContacts,
  kpisInRange, activitySummary, insights, staleDeals, alive, dealAmount, stageInfo,
} from '../stats.js';
import {
  money, esc, fmtNum, fmtDate, monthLabel, monthTitle, plural,
} from '../util.js';
import { icon } from '../icons.js';
import {
  pageHead, kpiBox, funnelHtml, emptyState, avatar, deltaText, miniProgress,
} from './partials.js';
import { barChart, donutChart, PALETTE } from '../charts.js';

const LABELS = { outreach: 'Аутрич', reply: 'Ответ', call: 'Звонок', payment: 'Оплата', note: 'Заметка' };

export function render(ctx) {
  const ui = ctx.ui;
  const preset = ui.analyticsPeriod || 'month';
  const period = periodContext(preset);
  const current = totals(store.state, period.from, period.to);
  const previous = totals(store.state, period.previous.from, period.previous.to);
  const revenueDelta = deltaText(current.revenue, previous.revenue);
  const series = monthlySeries(store.state, 12);
  const funnelRows = funnel(store.state);
  const sources = bySource(store.state, period.from, period.to).filter((row) => row.revenue > 0 || row.open > 0);
  const licenses = byLicense(store.state, period.from, period.to);
  const clients = topContacts(store.state, period.from, period.to, 6);
  const kpis = kpisInRange(store.state, period.from, period.to);
  const activities = activitySummary(store.state, period.from, period.to);
  const risks = insights(store.state, period.from, period.to, period.previous);
  const stale = staleDeals(store.state);
  const kpiRows = alive(store.state.kpis).slice().sort((a, b) => b.month.localeCompare(a.month)).slice(0, 8);

  const winDelta = previous.winRate === null || current.winRate === null
    ? 'нет базы для сравнения'
    : `${current.winRate - previous.winRate >= 0 ? '+' : ''}${(current.winRate - previous.winRate).toFixed(0)} п.п. к прошлому периоду`;

  const exportCard = `<div class="card">
    <div class="card-head">
      <div><h2>Экспорт аналитики</h2><div class="card-sub">для Excel и любого ИИ</div></div>
      <span class="badge accent">${icon('sparkles', 12)} AI-ready</span>
    </div>
    <div class="card-body">
      <div class="grid cols-3" style="gap:10px">
        <div style="padding:13px;border:1px solid var(--line-soft);border-radius:12px;background:var(--panel-2)">
          <div class="kpi-ico" style="margin-bottom:7px">${icon('sparkles', 18)}</div>
          <div class="bold">AI-отчёт</div>
          <div class="tiny dim" style="margin:4px 0 10px">Markdown: KPI, воронка, риски и готовый промпт.</div>
          <button class="btn sm primary" data-action="ai-report">Сформировать</button>
        </div>
        <div style="padding:13px;border:1px solid var(--line-soft);border-radius:12px;background:var(--panel-2)">
          <div class="kpi-ico" style="margin-bottom:7px">${icon('database', 18)}</div>
          <div class="bold">JSON для ИИ</div>
          <div class="tiny dim" style="margin:4px 0 10px">Компактные агрегаты без лишнего шума.</div>
          <button class="btn sm" data-action="ai-json">Скачать JSON</button>
        </div>
        <div style="padding:13px;border:1px solid var(--line-soft);border-radius:12px;background:var(--panel-2)">
          <div class="kpi-ico" style="margin-bottom:7px">${icon('download', 18)}</div>
          <div class="bold">CSV / бэкап</div>
          <div class="tiny dim" style="margin:4px 0 8px">Сделки, клиенты, задачи и полная копия.</div>
          <div class="flex wrap gap-6">
            <button class="btn sm ghost" data-action="export-csv" data-type="deals">Сделки</button>
            <button class="btn sm ghost" data-action="export-csv" data-type="contacts">Клиенты</button>
            <button class="btn sm ghost" data-action="export-csv" data-type="tasks">Задачи</button>
            <button class="btn sm ghost" data-action="download-backup">Бэкап</button>
          </div>
        </div>
      </div>
      <div class="flex-center gap-8 wrap" style="margin-top:12px">
        <button class="btn sm ghost" data-action="copy-prompt">${icon('copy', 13)} Скопировать промпт для ИИ</button>
        <span class="tiny dim">Отчёт можно прикрепить к ChatGPT, Claude, Gemini или любому другому ассистенту.</span>
      </div>
    </div>
  </div>`;

  return `<section class="page">
    ${pageHead(
    'Аналитика',
    `${period.label} · сравнение с ${period.previous.label}`,
    `<select data-filter="analyticsPeriod" aria-label="Период" style="min-width:160px">
        ${PERIODS.map((item) => `<option value="${item.id}" ${item.id === preset ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}
      </select>
      <button class="btn primary" data-action="ai-report">${icon('sparkles', 15)} AI-отчёт</button>`,
  )}

    <div class="kpi-grid">
      ${kpiBox({
    label: `Выручка · ${period.label}`,
    value: money(current.revenue),
    hint: revenueDelta.text,
    tone: revenueDelta.tone,
    iconName: 'wallet',
  })}
      ${kpiBox({
    label: 'Закрыто сделок',
    value: String(current.won),
    hint: `${deltaText(current.won, previous.won).text} · ${current.lost} отказов`,
    iconName: 'check',
  })}
      ${kpiBox({
    label: 'Win rate',
    value: current.winRate === null ? '—' : `${current.winRate.toFixed(0)}%`,
    hint: winDelta,
    iconName: 'target',
  })}
      ${kpiBox({
    label: 'Средний чек',
    value: current.avgDeal ? money(current.avgDeal) : '—',
    hint: deltaText(current.avgDeal, previous.avgDeal).text,
    iconName: 'chart',
  })}
      ${kpiBox({
    label: 'Цикл сделки',
    value: current.avgDays === null ? '—' : `${current.avgDays.toFixed(0)} дн`,
    hint: 'от создания до оплаты',
    iconName: 'clock',
  })}
      ${kpiBox({
    label: 'Пайплайн',
    value: money(current.pipeline),
    hint: `${current.openCount} ${plural(current.openCount, 'сделка', 'сделки', 'сделок')} в работе`,
    iconName: 'pipeline',
  })}
    </div>

    <div class="card">
      <div class="card-head">
        <div><h2>Выручка по месяцам</h2><div class="card-sub">последние 12 месяцев</div></div>
        <span class="tiny dim">всего ${money(series.reduce((acc, row) => acc + row.revenue, 0))}</span>
      </div>
      <div class="card-body">
        ${barChart(series.map((row) => ({ label: row.label, value: row.revenue })), { height: 240 })}
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h2>Воронка</h2><span class="tiny dim">все сделки</span></div>
        <div class="card-body">${funnelHtml(funnelRows)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Лицензии</h2><span class="tiny dim">${period.label}</span></div>
        <div class="card-body">
          ${licenses.length ? donutChart(licenses.map((row, index) => ({
    label: row.license, value: row.revenue, color: PALETTE[index % PALETTE.length],
  })), { centerLabel: 'выручка', showMoney: true }) : emptyState({ iconName: 'music', title: 'Нет оплат за период', text: 'Закрытые сделки появятся здесь по типам лицензий.' })}
        </div>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h2>Источники</h2><span class="tiny dim">${period.label}</span></div>
        <div class="table-wrap">
          ${sources.length ? `<table class="data" style="min-width:0">
            <thead><tr><th>Источник</th><th class="num">Выручка</th><th class="num">Доля</th><th class="num">В работе</th></tr></thead>
            <tbody>${sources.map((row) => `<tr>
              <td>${esc(row.source)}${row.won ? `<div class="cell-sub">${row.won} оплачено</div>` : ''}</td>
              <td class="num">${money(row.revenue)}</td>
              <td class="num">${current.revenue > 0 ? `${((row.revenue / current.revenue) * 100).toFixed(0)}%` : '—'}</td>
              <td class="num">${row.open || '—'}</td>
            </tr>`).join('')}</tbody>
          </table>` : emptyState({ iconName: 'source', title: 'Нет данных', text: 'Указывай источник у сделок.' })}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Топ клиентов</h2><span class="tiny dim">по выручке</span></div>
        <div class="card-body tight">
          ${clients.length ? `<div class="list-clean">${clients.map((row, index) => `<div class="list-item" style="padding:10px 8px">
            ${row.contact ? avatar(row.contact.name, 'sm') : `<span class="avatar sm" style="background:var(--panel-3)">?</span>`}
            <div class="li-main">
              <div class="li-title">${esc(row.contact?.name || 'Без контакта')}</div>
              <div class="li-sub">${row.count} ${plural(row.count, 'сделка', 'сделки', 'сделок')} · #${index + 1}</div>
            </div>
            <div class="li-val ok-text">${money(row.revenue)}</div>
          </div>`).join('')}</div>` : emptyState({ iconName: 'users', title: 'Пока нет оплат', text: 'Топ клиентов появится после закрытия сделок.' })}
        </div>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head">
          <div><h2>Ручные KPI</h2><div class="card-sub">аутрич, ответы, охваты</div></div>
          <button class="btn sm ghost" data-action="add-kpi">${icon('plus', 13)} Месяц</button>
        </div>
        <div class="table-wrap">
          ${kpiRows.length ? `<table class="data" style="min-width:0">
            <thead><tr><th>Месяц</th><th class="num">Аутрич</th><th class="num">Ответы</th><th class="num">RR</th><th class="num">Звонки</th><th></th></tr></thead>
            <tbody>${kpiRows.map((row) => {
    const rr = row.outreach ? (row.replies / row.outreach) * 100 : null;
    return `<tr class="clickable" data-action="edit-kpi" data-id="${esc(row.id)}">
                <td>${esc(monthLabel(row.month))}</td>
                <td class="num">${fmtNum(row.outreach)}</td>
                <td class="num">${fmtNum(row.replies)}</td>
                <td class="num">${rr === null ? '—' : `${rr.toFixed(0)}%`}</td>
                <td class="num">${fmtNum(row.calls)}</td>
                <td class="actions"><span class="icon-btn">${icon('edit', 14)}</span></td>
              </tr>`;
  }).join('')}</tbody>
          </table>` : emptyState({ iconName: 'chart', title: 'Ручных KPI пока нет', text: 'Добавь аутрич и ответы за месяц — увидишь response rate.', action: '<button class="btn sm accent" data-action="add-kpi">Добавить KPI</button>' })}
        </div>
        ${kpis.rows.length ? `<div class="card-body" style="padding:12px 18px;border-top:1px solid var(--line-soft)">
          <div class="mini dim" style="display:flex;gap:16px;flex-wrap:wrap">
            <span>Response rate: <b class="ok-text">${kpis.totals.responseRate === null ? '—' : `${kpis.totals.responseRate.toFixed(0)}%`}</b></span>
            <span>Прослушивания: <b>${fmtNum(kpis.totals.plays)}</b></span>
            <span>Подписчики: <b>+${fmtNum(kpis.totals.followers)}</b></span>
            <span>Реклама: <b>${money(kpis.totals.adSpend)}</b></span>
          </div>
        </div>` : ''}
      </div>

      <div class="card">
        <div class="card-head"><h2>Активность</h2><span class="tiny dim">${period.label}</span></div>
        <div class="card-body">
          <div class="stat-row"><span class="k">Всего касаний</span><span class="v">${activities.total}</span></div>
          ${Object.entries(activities.byType).map(([type, count]) => `<div class="stat-row"><span class="k">${esc(LABELS[type] || type)}</span><span class="v">${count}</span></div>`).join('')}
          ${!activities.total ? emptyState({ iconName: 'activity', title: 'Активности не записаны', text: 'Журнал помогает увидеть, сколько касаний нужно для сделки.' }) : ''}
        </div>
      </div>
    </div>

    ${exportCard}

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h2>Наблюдения</h2><span class="badge accent">${risks.length}</span></div>
        <div class="card-body tight" style="padding:14px">
          ${risks.length ? risks.map((row) => `<div class="insight ${row.tone}">
            <span class="i-ico">${icon(row.icon === 'trend-up' ? 'trend-up' : row.icon === 'trend-down' ? 'trend-down' : row.icon === 'alert' ? 'alert' : row.icon === 'clock' ? 'clock' : row.icon === 'user' ? 'user' : row.icon === 'source' ? 'source' : 'info', 15)}</span>
            <div>${row.text}</div>
          </div>`).join('') : '<p class="muted small">Существенных рисков не найдено.</p>'}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Сделки без движения</h2><span class="tiny dim">21+ дней</span></div>
        <div class="card-body tight">
          ${stale.length ? `<div class="list-clean">${stale.slice(0, 7).map((row) => `<div class="list-item" data-action="edit-deal" data-id="${esc(row.deal.id)}" style="cursor:pointer;padding:11px 8px">
            <div class="li-main">
              <div class="li-title">${esc(row.deal.title)}</div>
              <div class="li-sub">${esc(stageInfo(row.deal.stage).label)} · ${row.daysStale} дн без касания</div>
            </div>
            <div class="li-val">${money(dealAmount(row.deal))}</div>
          </div>`).join('')}</div>` : emptyState({ iconName: 'check', title: 'Все сделки в движении', text: 'Нет зависших лидов — хороший знак.' })}
        </div>
      </div>
    </div>
  </section>`;
}
