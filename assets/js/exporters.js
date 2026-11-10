import {
  money, fmtNum, fmtDate, fmtDateTime, monthLabel, dayKey, plural,
} from './util.js';
import {
  alive, totals, periodContext, monthlySeries, funnel, bySource, byLicense, topContacts,
  taskBuckets, staleDeals, kpisInRange, activitySummary, insights, dealProbability,
  weightedAmount, daysInStage, isOpen, dealAmount, stageInfo,
} from './stats.js';

const ACTIVITY_LABELS = {
  outreach: 'Аутрич', reply: 'Ответ', call: 'Звонок', payment: 'Оплата', note: 'Заметка',
};

const REPEAT_LABELS = {
  none: 'Без повтора', daily: 'Ежедневно', weekly: 'Еженедельно', monthly: 'Ежемесячно',
};

function cell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function summaryOf(t) {
  return {
    revenue: round(t.revenue, 2),
    won: t.won,
    lost: t.lost,
    winRate: t.winRate === null ? null : round(t.winRate, 1),
    avgDeal: round(t.avgDeal, 2),
    avgDaysToClose: t.avgDays === null ? null : round(t.avgDays, 1),
    pipeline: round(t.pipeline, 2),
    pipelineRaw: round(t.pipelineRaw, 2),
    openDeals: t.openCount,
  };
}

function deltaPct(current, previous) {
  if (!previous) return '—';
  const delta = ((current - previous) / previous) * 100;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%`;
}

function deltaPp(current, previous) {
  if (current === null || previous === null) return '—';
  const delta = current - previous;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(0)} п.п.`;
}

function dateSpan(range) {
  const end = new Date(new Date(range.to).getTime() - 86400000);
  return `${fmtDate(range.from, { year: 'numeric' })} — ${fmtDate(end, { year: 'numeric' })}`;
}

function contactName(contacts, id) {
  return contacts.get(id)?.name || 'Без контакта';
}

function dealTitle(deals, id) {
  return deals.get(id)?.title || '';
}

function taskRef(task, contacts, deals) {
  return [
    task.contactId ? contactName(contacts, task.contactId) : '',
    task.dealId ? dealTitle(deals, task.dealId) : '',
  ].filter(Boolean).join(' · ');
}

export function aiPrompt(state) {
  const name = state?.settings?.artistName || 'битмейкер';
  return `Ты — аналитик продаж в музыкальном бизнесе и менеджер битмейкера ${name}. `
    + 'Ниже выгрузка из моей CRM: выручка, воронка, источники, открытые сделки, задачи и активность. '
    + 'Проанализируй данные как практикующий sales-директор и дай конкретные выводы, а не общие советы.\n\n'
    + 'Что мне нужно:\n'
    + '1. Где я теряю деньги и какие 3 действия дадут самый быстрый рост выручки в следующем месяце.\n'
    + '2. Какие сделки в пайплайне приоритетны и почему (с учётом суммы, вероятности и давности касания).\n'
    + '3. Что не так с воронкой: на каком этапе просадка и как её чинить.\n'
    + '4. Какие источники и клиенты создают риск концентрации и что с этим делать.\n'
    + '5. Какие метрики отслеживать и какие целевые значения поставить на месяц.\n\n'
    + 'Формат: короткие блоки с заголовками, цифры из данных, конкретные формулировки сообщений для фоллоу-апа. '
    + 'Не выдумывай данные, которых нет. Если данных мало — скажи, чего не хватает.';
}

export function buildAiReport(state, preset = 'month', now = new Date()) {
  const ctx = periodContext(preset, now);
  const current = totals(state, ctx.from, ctx.to);
  const previous = totals(state, ctx.previous.from, ctx.previous.to);
  const currency = state?.settings?.currency || 'USD';
  const contacts = new Map(alive(state?.contacts).map((c) => [c.id, c]));
  const deals = new Map(alive(state?.deals).map((d) => [d.id, d]));
  const series = monthlySeries(state, 12, now);
  const funnelRows = funnel(state);
  const sources = bySource(state, ctx.from, ctx.to);
  const licenses = byLicense(state, ctx.from, ctx.to);
  const clients = topContacts(state, ctx.from, ctx.to, 8);
  const buckets = taskBuckets(state, now);
  const kpis = kpisInRange(state, ctx.from, ctx.to);
  const activities = activitySummary(state, ctx.from, ctx.to);
  const risks = insights(state, ctx.from, ctx.to, ctx.previous, now);
  const pipeline = current.openDeals
    .slice()
    .sort((a, b) => weightedAmount(b) - weightedAmount(a));

  const lines = [];
  lines.push('# Producer Sales Helper — отчёт');
  lines.push('');
  if (state?.settings?.artistName) lines.push(`**Продюсер:** ${cell(state.settings.artistName)}  `);
  lines.push(`**Период:** ${ctx.label} (${dateSpan(ctx)})  `);
  lines.push(`**Сравнение:** ${ctx.previous.label}  `);
  lines.push(`**Валюта:** ${currency}  `);
  lines.push(`**Сформировано:** ${fmtDateTime(now)}  `);
  const dealCount = alive(state?.deals).length;
  const contactCount = alive(state?.contacts).length;
  const beatCount = alive(state?.beats).length;
  lines.push(`**Данных в базе:** ${dealCount} ${plural(dealCount, 'сделка', 'сделки', 'сделок')}, ${contactCount} ${plural(contactCount, 'контакт', 'контакта', 'контактов')}, ${beatCount} ${plural(beatCount, 'бит', 'бита', 'битов')}`);
  lines.push('');

  lines.push('## 1. Ключевые показатели');
  lines.push('');
  lines.push('| Показатель | Период | Предыдущий | Динамика |');
  lines.push('| --- | ---: | ---: | ---: |');
  lines.push(`| Выручка | ${money(current.revenue, currency)} | ${money(previous.revenue, currency)} | ${deltaPct(current.revenue, previous.revenue)} |`);
  lines.push(`| Закрыто сделок | ${current.won} | ${previous.won} | ${deltaPct(current.won, previous.won)} |`);
  lines.push(`| Отказов | ${current.lost} | ${previous.lost} | ${deltaPct(current.lost, previous.lost)} |`);
  lines.push(`| Win rate | ${current.winRate === null ? '—' : `${current.winRate.toFixed(0)}%`} | ${previous.winRate === null ? '—' : `${previous.winRate.toFixed(0)}%`} | ${deltaPp(current.winRate, previous.winRate)} |`);
  lines.push(`| Средний чек | ${money(current.avgDeal, currency)} | ${money(previous.avgDeal, currency)} | ${deltaPct(current.avgDeal, previous.avgDeal)} |`);
  lines.push(`| Средний цикл сделки | ${current.avgDays === null ? '—' : `${current.avgDays.toFixed(0)} дн`} | ${previous.avgDays === null ? '—' : `${previous.avgDays.toFixed(0)} дн`} | — |`);
  lines.push(`| Пайплайн (взвешенный) | ${money(current.pipeline, currency)} | ${money(previous.pipeline, currency)} | ${deltaPct(current.pipeline, previous.pipeline)} |`);
  lines.push(`| Открытых сделок | ${current.openCount} | ${previous.openCount} | — |`);
  lines.push('');

  lines.push('## 2. Динамика по месяцам');
  lines.push('');
  lines.push('| Месяц | Выручка | Сделок | Отказов |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const row of series) {
    lines.push(`| ${monthLabel(row.key)} | ${money(row.revenue, currency)} | ${row.won} | ${row.lost} |`);
  }
  lines.push('');

  lines.push('## 3. Воронка (сделки, которые доходили до этапа)');
  lines.push('');
  lines.push('| Этап | Сделок | Конверсия с прошлого этапа |');
  lines.push('| --- | ---: | ---: |');
  for (const row of funnelRows) {
    lines.push(`| ${row.label} | ${row.count} | ${row.conversion === null ? '—' : `${row.conversion.toFixed(0)}%`} |`);
  }
  lines.push('');

  lines.push('## 4. Источники');
  lines.push('');
  lines.push('| Источник | Выручка | Доля | Оплачено | В работе | Всего сделок |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const row of sources) {
    const share = current.revenue > 0 ? `${((row.revenue / current.revenue) * 100).toFixed(0)}%` : '—';
    lines.push(`| ${cell(row.source)} | ${money(row.revenue, currency)} | ${share} | ${row.won} | ${row.open} | ${row.total} |`);
  }
  lines.push('');

  lines.push('## 5. Типы лицензий');
  lines.push('');
  lines.push('| Лицензия | Выручка | Сделок |');
  lines.push('| --- | ---: | ---: |');
  for (const row of licenses) {
    lines.push(`| ${cell(row.license)} | ${money(row.revenue, currency)} | ${row.count} |`);
  }
  if (!licenses.length) lines.push('| — | — | — |');
  lines.push('');

  lines.push('## 6. Топ клиентов');
  lines.push('');
  lines.push('| Клиент | Выручка | Сделок |');
  lines.push('| --- | ---: | ---: |');
  for (const row of clients) {
    lines.push(`| ${cell(row.contact?.name || 'Без контакта')} | ${money(row.revenue, currency)} | ${row.count} |`);
  }
  if (!clients.length) lines.push('| — | — | — |');
  lines.push('');

  lines.push('## 7. Открытый пайплайн');
  lines.push('');
  lines.push('| Сделка | Клиент | Этап | Сумма | Вер. | Взвеш. | Дней в этапе | Следующее действие |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | --- |');
  for (const deal of pipeline) {
    lines.push(`| ${cell(deal.title)} | ${cell(contactName(contacts, deal.contactId))} | ${stageInfo(deal.stage).label} | ${money(dealAmount(deal), currency)} | ${dealProbability(deal)}% | ${money(weightedAmount(deal), currency)} | ${daysInStage(deal, now)} | ${deal.nextActionAt ? fmtDate(deal.nextActionAt, { year: 'numeric' }) : '—'} |`);
  }
  if (!pipeline.length) lines.push('| — | — | — | — | — | — | — | — |');
  lines.push('');

  lines.push('## 8. Задачи и фоллоу-апы');
  lines.push('');
  const taskGroup = (title, rows, cap = 20) => {
    lines.push(`### ${title} (${rows.length})`);
    lines.push('');
    if (!rows.length) {
      lines.push('_Нет задач._');
    } else {
      for (const task of rows.slice(0, cap)) {
        const ref = taskRef(task, contacts, deals);
        lines.push(`- [ ] **${cell(task.title)}** — ${task.dueAt ? fmtDateTime(task.dueAt) : 'без даты'}${ref ? ` — ${cell(ref)}` : ''}${task.notes ? ` (${cell(task.notes)})` : ''}`);
      }
      if (rows.length > cap) lines.push(`- …и ещё ${rows.length - cap}`);
    }
    lines.push('');
  };
  taskGroup('Просрочено', buckets.overdue);
  taskGroup('Сегодня', buckets.today);
  taskGroup('Ближайшие 7 дней', buckets.week);

  lines.push('## 9. Активность и ручные KPI');
  lines.push('');
  lines.push('| Метрика | Значение |');
  lines.push('| --- | ---: |');
  lines.push(`| Активностей в журнале | ${activities.total} |`);
  for (const [type, count] of Object.entries(activities.byType)) {
    lines.push(`| ${ACTIVITY_LABELS[type] || type} | ${count} |`);
  }
  lines.push(`| Аутрич (внесено вручную) | ${kpis.totals.outreach} |`);
  lines.push(`| Ответы (внесено вручную) | ${kpis.totals.replies} |`);
  lines.push(`| Response rate | ${kpis.totals.responseRate === null ? '—' : `${kpis.totals.responseRate.toFixed(0)}%`} |`);
  lines.push(`| Звонки | ${kpis.totals.calls} |`);
  lines.push(`| Прослушивания битов | ${fmtNum(kpis.totals.plays)} |`);
  lines.push(`| Прирост подписчиков | ${fmtNum(kpis.totals.followers)} |`);
  lines.push(`| Расход на рекламу | ${money(kpis.totals.adSpend, currency)} |`);
  lines.push('');

  lines.push('## 10. Риски и наблюдения');
  lines.push('');
  if (risks.length) {
    for (const insight of risks) {
      lines.push(`- ${stripHtml(insight.text).replace(/\*\*/g, '')}`);
    }
  } else {
    lines.push('- Существенных рисков не найдено.');
  }
  lines.push('');

  const stale = staleDeals(state, now, 21);
  if (stale.length) {
    lines.push('### Сделки без движения больше 21 дня');
    lines.push('');
    for (const row of stale) {
      lines.push(`- **${cell(row.deal.title)}** — ${money(dealAmount(row.deal), currency)}, ${stageInfo(row.deal.stage).label}, ${row.daysStale} дн без касания`);
    }
    lines.push('');
  }

  lines.push('## 11. Промпт для ИИ');
  lines.push('');
  lines.push('```text');
  lines.push(aiPrompt(state));
  lines.push('```');
  lines.push('');
  lines.push('> Прикрепи этот отчёт к диалогу с ИИ или вставь его целиком вместе с промптом выше.');
  lines.push('');

  return lines.join('\n');
}

export function buildAiJson(state, preset = 'month', now = new Date()) {
  const ctx = periodContext(preset, now);
  const current = totals(state, ctx.from, ctx.to);
  const previous = totals(state, ctx.previous.from, ctx.previous.to);
  const currency = state?.settings?.currency || 'USD';
  const contacts = new Map(alive(state?.contacts).map((c) => [c.id, c]));
  const buckets = taskBuckets(state, now);
  const kpis = kpisInRange(state, ctx.from, ctx.to);
  const activities = activitySummary(state, ctx.from, ctx.to);

  const taskList = (rows) => rows.slice(0, 30).map((task) => ({
    title: task.title,
    dueAt: task.dueAt || null,
    done: Boolean(task.done),
    contact: task.contactId ? contactName(contacts, task.contactId) : null,
    deal: task.dealId ? dealTitle(new Map(alive(state?.deals).map((d) => [d.id, d])), task.dealId) : null,
    notes: task.notes || '',
  }));

  return {
    meta: {
      tool: 'Producer Sales Helper',
      generatedAt: new Date(now).toISOString(),
      producer: state?.settings?.artistName || '',
      currency,
      period: {
        preset,
        label: ctx.label,
        from: new Date(ctx.from).toISOString(),
        to: new Date(ctx.to).toISOString(),
        previousLabel: ctx.previous.label,
      },
    },
    summary: summaryOf(current),
    previous: summaryOf(previous),
    monthly: monthlySeries(state, 12, now).map((row) => ({
      month: row.key,
      revenue: round(row.revenue, 2),
      won: row.won,
      lost: row.lost,
    })),
    funnel: funnel(state),
    sources: bySource(state, ctx.from, ctx.to),
    licenses: byLicense(state, ctx.from, ctx.to),
    topClients: topContacts(state, ctx.from, ctx.to, 10).map((row) => ({
      name: row.contact?.name || null,
      revenue: round(row.revenue, 2),
      deals: row.count,
    })),
    pipeline: current.openDeals
      .slice()
      .sort((a, b) => weightedAmount(b) - weightedAmount(a))
      .map((deal) => ({
        title: deal.title,
        contact: deal.contactId ? contactName(contacts, deal.contactId) : null,
        stage: stageInfo(deal.stage).label,
        amount: round(dealAmount(deal), 2),
        probability: dealProbability(deal),
        weighted: round(weightedAmount(deal), 2),
        daysInStage: daysInStage(deal, now),
        nextActionAt: deal.nextActionAt || null,
        source: deal.source || null,
        license: deal.license || null,
        notes: deal.notes || '',
      })),
    tasks: {
      counts: {
        overdue: buckets.overdue.length,
        today: buckets.today.length,
        week: buckets.week.length,
        later: buckets.later.length,
        noDate: buckets.noDate.length,
      },
      overdue: taskList(buckets.overdue),
      today: taskList(buckets.today),
      week: taskList(buckets.week),
      staleDeals: staleDeals(state, now, 21).map((row) => ({
        title: row.deal.title,
        amount: round(dealAmount(row.deal), 2),
        stage: stageInfo(row.deal.stage).label,
        daysWithoutTouch: row.daysStale,
      })),
    },
    activity: {
      total: activities.total,
      byType: activities.byType,
      manualKpis: { ...kpis.totals },
    },
    insights: insights(state, ctx.from, ctx.to, ctx.previous, now).map((row) => stripHtml(row.text)),
    aiPrompt: aiPrompt(state),
  };
}

export function buildCsv(state, type = 'deals', now = new Date()) {
  const contacts = new Map(alive(state?.contacts).map((c) => [c.id, c]));
  const deals = new Map(alive(state?.deals).map((d) => [d.id, d]));
  const currency = state?.settings?.currency || 'USD';

  const columns = {
    deals: [
      { label: 'ID', value: (row) => row.id },
      { label: 'Сделка', value: (row) => row.title },
      { label: 'Клиент', value: (row) => contactName(contacts, row.contactId) },
      { label: 'Этап', value: (row) => stageInfo(row.stage).label },
      { label: 'Сумма', value: (row) => dealAmount(row) },
      { label: 'Валюта', value: () => currency },
      { label: 'Вероятность, %', value: (row) => dealProbability(row) },
      { label: 'Лицензия', value: (row) => row.license },
      { label: 'Источник', value: (row) => row.source },
      { label: 'Создана', value: (row) => row.createdAt },
      { label: 'Закрыта', value: (row) => row.closedAt || '' },
      { label: 'Следующее действие', value: (row) => row.nextActionAt || '' },
      { label: 'Биты', value: (row) => (row.beats || []).join(', ') },
      { label: 'Заметки', value: (row) => row.notes },
    ],
    contacts: [
      { label: 'ID', value: (row) => row.id },
      { label: 'Имя', value: (row) => row.name },
      { label: 'Роль', value: (row) => row.role },
      { label: 'Telegram', value: (row) => row.handle },
      { label: 'Email', value: (row) => row.email },
      { label: 'Страна', value: (row) => row.country },
      { label: 'Источник', value: (row) => row.source },
      { label: 'Теги', value: (row) => (row.tags || []).join(', ') },
      { label: 'Последний контакт', value: (row) => row.lastContactAt || '' },
      { label: 'Заметки', value: (row) => row.notes },
    ],
    tasks: [
      { label: 'ID', value: (row) => row.id },
      { label: 'Задача', value: (row) => row.title },
      { label: 'Срок', value: (row) => row.dueAt || '' },
      { label: 'Повтор', value: (row) => REPEAT_LABELS[row.repeat] || row.repeat },
      { label: 'Выполнена', value: (row) => (row.done ? 'да' : 'нет') },
      { label: 'Напоминание', value: (row) => (row.remind ? 'да' : 'нет') },
      { label: 'Клиент', value: (row) => (row.contactId ? contactName(contacts, row.contactId) : '') },
      { label: 'Сделка', value: (row) => (row.dealId ? dealTitle(deals, row.dealId) : '') },
      { label: 'Заметки', value: (row) => row.notes },
    ],
    beats: [
      { label: 'ID', value: (row) => row.id },
      { label: 'Бит', value: (row) => row.title },
      { label: 'BPM', value: (row) => row.bpm ?? '' },
      { label: 'Тональность', value: (row) => row.key },
      { label: 'Жанр', value: (row) => row.genre },
      { label: 'Цена', value: (row) => row.price },
      { label: 'Статус', value: (row) => row.status },
      { label: 'Теги', value: (row) => (row.tags || []).join(', ') },
      { label: 'Заметки', value: (row) => row.notes },
    ],
    activities: [
      { label: 'ID', value: (row) => row.id },
      { label: 'Дата', value: (row) => row.at || row.createdAt },
      { label: 'Тип', value: (row) => ACTIVITY_LABELS[row.type] || row.type },
      { label: 'Клиент', value: (row) => (row.contactId ? contactName(contacts, row.contactId) : '') },
      { label: 'Сделка', value: (row) => (row.dealId ? dealTitle(deals, row.dealId) : '') },
      { label: 'Заметка', value: (row) => row.note },
    ],
    kpis: [
      { label: 'Месяц', value: (row) => row.month },
      { label: 'Аутрич', value: (row) => row.outreach },
      { label: 'Ответы', value: (row) => row.replies },
      { label: 'Звонки', value: (row) => row.calls },
      { label: 'Прослушивания', value: (row) => row.plays },
      { label: 'Подписчики', value: (row) => row.followers },
      { label: 'Реклама', value: (row) => row.adSpend },
      { label: 'Заметки', value: (row) => row.notes },
    ],
  };

  const config = columns[type];
  if (!config) throw new Error(`Неизвестный тип экспорта: ${type}`);

  const source = state?.[type] || [];
  const rows = alive(source);

  const header = config.map((column) => column.label).join(';');
  const body = rows.map((row) => config.map((column) => {
    let value = column.value(row);
    if (value === null || value === undefined) value = '';
    if (Array.isArray(value)) value = value.join(', ');
    const text = String(value).replace(/"/g, '""');
    return /[";\n]/.test(text) ? `"${text}"` : text;
  }).join(';')).join('\n');

  return `\ufeff${header}\n${body}`;
}

export function buildBackup(state) {
  return JSON.stringify(state, null, 2);
}

export function buildFilename(kind, ext, now = new Date()) {
  return `psh-${kind}-${dayKey(now)}.${ext}`;
}

export function buildRiskList(state, preset = 'month', now = new Date()) {
  const ctx = periodContext(preset, now);
  const current = totals(state, ctx.from, ctx.to);
  const buckets = taskBuckets(state, now);
  return {
    overdueTasks: buckets.overdue.length,
    staleDeals: staleDeals(state, now, 21).length,
    openDeals: current.openCount,
    pipeline: current.pipeline,
    revenue: current.revenue,
    winRate: current.winRate,
    isOpen,
  };
}
