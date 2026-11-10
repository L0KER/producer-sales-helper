import { store } from '../store.js';
import {
  dashboardStats, taskBuckets, insights, stageInfo,
} from '../stats.js';
import {
  money, fmtDate, fmtDateTime, relDay, timeAgo, plural, esc, truncate, sum,
} from '../util.js';
import { icon } from '../icons.js';
import {
  pageHead, kpiBox, taskRow, funnelHtml, emptyState, avatar, deltaText, miniProgress,
} from './partials.js';
import { barChart } from '../charts.js';

function todayLabel() {
  const raw = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date());
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function onboarding() {
  return `<section class="page">
    ${pageHead('Добро пожаловать в студию', 'Здесь живут твои сделки, клиенты и напоминания. Начни с демо или добавь первую сделку.')}
    <div class="card">
      <div class="card-body" style="padding:30px">
        <div class="grid cols-2" style="align-items:center;gap:26px">
          <div>
            <div class="badge accent" style="margin-bottom:12px">${icon('sparkles', 13)} producer edition</div>
            <h2 style="font-size:26px;letter-spacing:-0.03em;line-height:1.2">Sales-система для битмейкера, а не очередная таблица</h2>
            <p class="muted" style="margin-top:10px;font-size:13.5px;max-width:52ch">
              Контакты, воронка сделок, каталог битов, журнал касаний и аналитика — в одном месте.
              Данные хранятся в браузере и синхронизируются через приватный GitHub Gist.
              Напоминания приходят в Telegram, даже когда компьютер выключен.
            </p>
            <div class="flex gap-8 wrap" style="margin-top:20px">
              <button class="btn primary" data-action="add-deal">${icon('plus', 15)} Первая сделка</button>
              <button class="btn accent" data-action="load-demo">${icon('zap', 15)} Загрузить демо</button>
              <a class="btn ghost" href="#/settings">${icon('settings', 15)} Настроить</a>
            </div>
          </div>
          <div class="card" style="box-shadow:none">
            <div class="card-head"><h2>Как это работает</h2></div>
            <div class="card-body">
              <div class="step" style="padding:6px 0"><span class="step-n">1</span><div><b>Добавляй клиентов и сделки.</b> Всё сохраняется мгновенно, даже офлайн.</div></div>
              <div class="step" style="padding:6px 0"><span class="step-n">2</span><div><b>Подключи приватный Gist.</b> Данные появятся на телефоне и любом другом устройстве.</div></div>
              <div class="step" style="padding:6px 0"><span class="step-n">3</span><div><b>Включи Telegram-бота.</b> GitHub Actions будет присылать напоминания и сводки по расписанию.</div></div>
              <div class="step" style="padding:6px 0"><span class="step-n">4</span><div><b>Экспортируй отчёт для ИИ.</b> Один клик — и у тебя готовый разбор продаж.</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="grid cols-3">
      <div class="card"><div class="card-body">
        <div class="kpi-ico" style="margin-bottom:8px">${icon('users', 20)}</div>
        <h3 style="font-size:15px">CRM без хаоса</h3>
        <p class="muted small" style="margin-top:5px">Кто клиент, откуда пришёл, что обещал и когда ему писать.</p>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="kpi-ico" style="margin-bottom:8px">${icon('chart', 20)}</div>
        <h3 style="font-size:15px">Аналитика продаж</h3>
        <p class="muted small" style="margin-top:5px">Выручка, воронка, источники, win rate и средний цикл сделки.</p>
      </div></div>
      <div class="card"><div class="card-body">
        <div class="kpi-ico" style="margin-bottom:8px">${icon('telegram', 20)}</div>
        <h3 style="font-size:15px">Telegram-напоминания</h3>
        <p class="muted small" style="margin-top:5px">Бот пишет в нужный момент. Без сервера и включённого ПК.</p>
      </div></div>
    </div>
  </section>`;
}

export function render() {
  const s = store.state;
  const hasData = store.alive('deals').length || store.alive('contacts').length || store.alive('tasks').length;
  if (!hasData) return onboarding();

  const d = dashboardStats(s);
  const buckets = taskBuckets(s);
  const now = new Date();
  const delta = deltaText(d.current.revenue, d.previous.revenue);
  const todayTasks = [...buckets.overdue, ...buckets.today].slice(0, 6);
  const openDeals = d.current.openDeals
    .slice()
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .slice(0, 5);
  const activity = store.alive('activities')
    .slice()
    .sort((a, b) => new Date(b.at || b.createdAt || 0) - new Date(a.at || a.createdAt || 0))
    .slice(0, 5);
  const seriesTotal = sum(d.series, (row) => row.revenue);
  const monthTasks = d.current.won;
  const risks = insights(s, d.month.from, d.month.to, d.prevMonth, now).slice(0, 3);

  return `<section class="page">
    ${pageHead(
    `Привет${s.settings.ownerName ? `, ${esc(s.settings.ownerName)}` : ''}`,
    `${todayLabel()} · ${esc(d.month.label)}`,
    `<button class="btn ghost" data-action="add-task">${icon('plus', 15)} Задача</button>
       <button class="btn primary" data-action="add-deal">${icon('plus', 15)} Сделка</button>`,
  )}

    <div class="kpi-grid">
      ${kpiBox({
    label: `Выручка · ${d.month.label}`,
    value: money(d.current.revenue),
    hint: delta.text,
    tone: delta.tone,
    iconName: 'wallet',
  })}
      ${kpiBox({
    label: 'Пайплайн',
    value: money(d.current.pipeline),
    hint: `${d.current.openCount} ${plural(d.current.openCount, 'сделка', 'сделки', 'сделок')} · сырая ${money(d.current.pipelineRaw)}`,
    iconName: 'pipeline',
  })}
      ${kpiBox({
    label: 'Win rate',
    value: d.current.winRate === null ? '—' : `${d.current.winRate.toFixed(0)}%`,
    hint: `${d.current.won} оплачено · ${d.current.lost} отказов`,
    iconName: 'target',
  })}
      ${kpiBox({
    label: 'Средний чек',
    value: d.current.avgDeal ? money(d.current.avgDeal) : '—',
    hint: monthTasks ? `${monthTasks} ${plural(monthTasks, 'сделка закрыта', 'сделки закрыто', 'сделок закрыто')}` : 'пока нет закрытых',
    iconName: 'chart',
  })}
      ${kpiBox({
    label: 'Задачи',
    value: `${buckets.overdue.length + buckets.today.length}`,
    hint: buckets.overdue.length
      ? `<span class="bad">${buckets.overdue.length} просрочено</span>`
      : 'на сегодня и просроченные',
    tone: buckets.overdue.length ? 'down' : '',
    iconName: 'tasks',
  })}
    </div>

    <div class="grid main-2">
      <div class="card">
        <div class="card-head">
          <div>
            <h2>Выручка · 12 месяцев</h2>
            <div class="card-sub">Всего ${money(seriesTotal)}</div>
          </div>
          <a class="btn sm ghost" href="#/analytics">${icon('chart', 14)} Аналитика</a>
        </div>
        <div class="card-body">
          ${barChart(d.series.map((row) => ({ label: row.label, value: row.revenue })), { height: 220 })}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div><h2>На сегодня</h2><div class="card-sub">${buckets.overdue.length ? `${buckets.overdue.length} просрочено` : 'Всё под контролем'}</div></div>
          <a class="btn sm ghost" href="#/tasks">Все задачи</a>
        </div>
        <div class="card-body tight">
          ${todayTasks.length
    ? `<div class="task-list" style="border:0">${todayTasks.map((task) => taskRow(task, { compact: true })).join('')}</div>`
    : emptyState({ iconName: 'check', title: 'Задач на сегодня нет', text: 'Можно выдохнуть — или запланировать фоллоу-ап.', action: '<button class="btn sm accent" data-action="add-task">Добавить задачу</button>' })}
        </div>
      </div>
    </div>

    <div class="grid side-2">
      <div class="card">
        <div class="card-head"><h2>Воронка</h2><span class="tiny dim">за всё время</span></div>
        <div class="card-body">${funnelHtml(d.funnel)}</div>
      </div>

      <div class="card">
        <div class="card-head">
          <div><h2>Источники · ${esc(d.month.label)}</h2></div>
          <a class="btn sm ghost" href="#/analytics">Подробнее</a>
        </div>
        <div class="card-body tight">
          ${d.sources.filter((row) => row.revenue > 0 || row.open > 0).length
    ? d.sources.filter((row) => row.revenue > 0 || row.open > 0).slice(0, 5).map((row) => {
      const max = Math.max(...d.sources.map((item) => item.revenue), 1);
      return `<div style="padding:9px 8px">
              <div class="flex-center" style="justify-content:space-between;gap:10px;margin-bottom:6px">
                <span style="font-size:12.5px;font-weight:550">${esc(row.source)}</span>
                <span class="mono small">${money(row.revenue)}</span>
              </div>
              ${miniProgress(row.revenue, max)}
              <div class="tiny dim" style="margin-top:4px">${row.won} оплачено · ${row.open} в работе</div>
            </div>`;
    }).join('')
    : emptyState({ iconName: 'source', title: 'Нет данных по источникам', text: 'Заполняй источник при создании сделки.' })}
        </div>
      </div>
    </div>

    <div class="grid main-2">
      <div class="card">
        <div class="card-head">
          <div><h2>Сделки в работе</h2><div class="card-sub">${money(d.current.pipeline)} взвешенный пайплайн</div></div>
          <a class="btn sm ghost" href="#/deals">Вся воронка</a>
        </div>
        <div class="card-body tight">
          ${openDeals.length ? `<div class="list-clean">${openDeals.map((deal) => {
    const contact = s.contacts.find((c) => c.id === deal.contactId && !c.deletedAt);
    return `<div class="list-item" data-action="edit-deal" data-id="${esc(deal.id)}" style="cursor:pointer;padding:11px 8px">
                ${contact ? avatar(contact.name, 'sm') : `<span class="avatar sm" style="background:var(--panel-3);color:var(--dim)">?</span>`}
                <div class="li-main">
                  <div class="li-title">${esc(deal.title)}</div>
                  <div class="li-sub">${esc(contact?.name || 'Без контакта')} · ${esc(stageInfo(deal.stage).label)}${deal.nextActionAt ? ` · след. ${esc(relDay(deal.nextActionAt))}` : ''}</div>
                </div>
                <div class="li-val ok-text">${money(deal.amount)}</div>
              </div>`;
  }).join('')}</div>`
    : emptyState({ iconName: 'deals', title: 'Нет открытых сделок', text: 'Добавь лид или загрузи демо.', action: '<button class="btn sm primary" data-action="add-deal">Добавить сделку</button>' })}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div><h2>Активность</h2><div class="card-sub">последние касания</div></div>
          <a class="btn sm ghost" href="#/journal">Журнал</a>
        </div>
        <div class="card-body tight">
          ${activity.length ? `<div class="timeline" style="padding:0 8px">${activity.map((row) => {
    const contact = s.contacts.find((c) => c.id === row.contactId && !c.deletedAt);
    const deal = s.deals.find((x) => x.id === row.dealId && !x.deletedAt);
    return `<div class="tl-item" style="padding:8px 0">
                <span class="tl-ico ${esc(row.type)}">${icon(row.type === 'payment' ? 'wallet' : row.type === 'reply' ? 'reply' : row.type === 'call' ? 'phone' : row.type === 'outreach' ? 'send' : 'note', 14)}</span>
                <div class="tl-body">
                  <div class="tl-top"><span class="tl-type">${esc(contact?.name || deal?.title || 'Заметка')}</span><span class="tl-time">${esc(timeAgo(row.at || row.createdAt))}</span></div>
                  <div class="tl-note">${esc(truncate(row.note, 90))}</div>
                </div>
              </div>`;
  }).join('')}</div>`
    : emptyState({ iconName: 'activity', title: 'Журнал пуст', text: 'Фиксируй аутрич и ответы — это топливо для аналитики.', action: '<button class="btn sm accent" data-action="add-activity">Записать касание</button>' })}
        </div>
      </div>
    </div>

    ${risks.length || d.stale.length ? `<div class="card">
      <div class="card-head"><h2>На что обратить внимание</h2><a class="btn sm ghost" href="#/analytics">Разбор</a></div>
      <div class="card-body tight" style="padding:14px">
        ${d.stale.length ? `<div class="insight warn"><span class="i-ico">${icon('clock', 15)}</span><div><b>${d.stale.length}</b> ${plural(d.stale.length, 'сделка', 'сделки', 'сделок')} без движения больше 21 дня. <a href="#/deals">Открыть воронку</a></div></div>` : ''}
        ${risks.map((row) => `<div class="insight ${row.tone}"><span class="i-ico">${icon(row.icon === 'trend-up' ? 'trend-up' : row.icon === 'alert' ? 'alert' : row.icon === 'clock' ? 'clock' : 'info', 15)}</span><div>${row.text}</div></div>`).join('')}
      </div>
    </div>` : ''}
  </section>`;
}
