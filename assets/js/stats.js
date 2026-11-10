// Pure analytics. No DOM, no storage: safe to import from the browser and from
// the GitHub Actions bot (Node 20+).

import {
  dayKey, monthKey, monthTitle, startOfDay, addDays, sum, avg, money, num, plural, esc,
} from './util.js';

export const STAGES = [
  { id: 'lead', label: 'Лид', short: 'Лиды', color: '#60a5fa', prob: 10, open: true },
  { id: 'contacted', label: 'На связи', short: 'На связи', color: '#818cf8', prob: 25, open: true },
  { id: 'negotiation', label: 'Переговоры', short: 'Переговоры', color: '#a78bfa', prob: 50, open: true },
  { id: 'invoice', label: 'Счёт выставлен', short: 'Счёт', color: '#fbbf24', prob: 75, open: true },
  { id: 'paid', label: 'Оплачено', short: 'Оплачено', color: '#34d399', prob: 100, open: false },
  { id: 'delivered', label: 'Сдан', short: 'Сдан', color: '#10b981', prob: 100, open: false },
  { id: 'lost', label: 'Отказ', short: 'Отказ', color: '#fb7185', prob: 0, open: false },
];

export const STAGE_IDS = STAGES.map((s) => s.id);
export const OPEN_STAGE_IDS = STAGES.filter((s) => s.open).map((s) => s.id);
export const WON_STAGE_IDS = ['paid', 'delivered'];
export const PERIODS = [
  { id: 'month', label: 'Этот месяц' },
  { id: 'prevMonth', label: 'Прошлый месяц' },
  { id: 'quarter', label: 'Квартал' },
  { id: 'year', label: 'Год' },
  { id: 'last30', label: '30 дней' },
  { id: 'all', label: 'Всё время' },
];

export function stageInfo(id) {
  return STAGES.find((s) => s.id === id) || { id: id || 'lead', label: id || 'Лид', color: '#60a5fa', prob: 0, open: true };
}

export function isWon(deal) {
  return Boolean(deal) && WON_STAGE_IDS.includes(deal.stage);
}

export function isLost(deal) {
  return Boolean(deal) && deal.stage === 'lost';
}

export function isOpen(deal) {
  return Boolean(deal) && Boolean(stageInfo(deal.stage).open);
}

export function dealAmount(deal) {
  return Math.max(0, num(deal?.amount));
}

export function dealProbability(deal) {
  const raw = deal?.probability;
  if (raw === '' || raw === null || raw === undefined) return stageInfo(deal?.stage).prob;
  const value = Number(raw);
  if (!Number.isFinite(value)) return stageInfo(deal?.stage).prob;
  return Math.min(100, Math.max(0, value));
}

export function weightedAmount(deal) {
  return dealAmount(deal) * (dealProbability(deal) / 100);
}

export function alive(list) {
  return (list || []).filter((item) => item && !item.deletedAt);
}

export function dealClosedAt(deal) {
  if (!deal) return null;
  if (deal.closedAt) return deal.closedAt;
  if (isWon(deal) || isLost(deal)) return deal.updatedAt || null;
  return null;
}

export function dealStages(deal) {
  const set = new Set((deal?.stageHistory || []).map((h) => h.stage));
  if (deal?.stage) set.add(deal.stage);
  return set;
}

export function daysInStage(deal, now = new Date()) {
  const history = deal?.stageHistory || [];
  const last = history.length ? history[history.length - 1]?.at : deal?.updatedAt;
  if (!last) return 0;
  const diff = (new Date(now).getTime() - new Date(last).getTime()) / 86400000;
  return Math.max(0, Math.round(diff));
}

export function inRange(input, from, to) {
  if (!input) return false;
  const t = new Date(input).getTime();
  if (Number.isNaN(t)) return false;
  return t >= new Date(from).getTime() && t < new Date(to).getTime();
}

/* ---------------- periods ---------------- */

export function rangeForPreset(preset = 'month', now = new Date()) {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const month = monthKey(now);
  const [year, m] = month.split('-').map(Number);

  switch (preset) {
    case 'prevMonth': {
      const from = new Date(year, m - 2, 1);
      const to = new Date(year, m - 1, 1);
      return { from, to, label: monthTitle(monthKey(from)).replace(' г.', '') };
    }
    case 'quarter': {
      const q = Math.floor((m - 1) / 3);
      const from = new Date(year, q * 3, 1);
      return { from, to: tomorrow, label: `${['I', 'II', 'III', 'IV'][q]} квартал ${year}` };
    }
    case 'year':
      return { from: new Date(year, 0, 1), to: tomorrow, label: `${year} год` };
    case 'last30':
      return { from: addDays(today, -29), to: tomorrow, label: 'Последние 30 дней' };
    case 'all':
      return { from: new Date(2000, 0, 1), to: tomorrow, label: 'Всё время' };
    case 'month':
    default:
      return { from: new Date(year, m - 1, 1), to: tomorrow, label: monthTitle(month).replace(' г.', '') };
  }
}

export function previousRange(preset, range, now = new Date()) {
  const month = monthKey(now);
  if (preset === 'month') {
    const [year, m] = month.split('-').map(Number);
    const from = new Date(year, m - 2, 1);
    const to = new Date(year, m - 1, 1);
    return { from, to, label: monthTitle(monthKey(from)).replace(' г.', '') };
  }
  if (preset === 'prevMonth') {
    const [year, m] = month.split('-').map(Number);
    const from = new Date(year, m - 3, 1);
    const to = new Date(year, m - 2, 1);
    return { from, to, label: monthTitle(monthKey(from)).replace(' г.', '') };
  }
  const span = new Date(range.to).getTime() - new Date(range.from).getTime();
  const from = new Date(new Date(range.from).getTime() - span);
  return { from, to: new Date(range.from), label: 'предыдущий период' };
}

export function periodContext(preset = 'month', now = new Date()) {
  const range = rangeForPreset(preset, now);
  return { preset, ...range, previous: previousRange(preset, range, now) };
}

/* ---------------- totals ---------------- */

export function totals(state, from, to) {
  const deals = alive(state?.deals);
  const wonDeals = deals.filter((d) => isWon(d) && inRange(dealClosedAt(d), from, to));
  const lostDeals = deals.filter((d) => isLost(d) && inRange(dealClosedAt(d), from, to));
  const openDeals = deals.filter(isOpen);
  const revenue = sum(wonDeals, dealAmount);
  const pipeline = sum(openDeals, weightedAmount);
  const pipelineRaw = sum(openDeals, dealAmount);
  const closed = wonDeals.length + lostDeals.length;
  const winRate = closed ? (wonDeals.length / closed) * 100 : null;
  const avgDeal = wonDeals.length ? revenue / wonDeals.length : 0;
  const cycles = wonDeals
    .filter((d) => d.createdAt && dealClosedAt(d))
    .map((d) => (new Date(dealClosedAt(d)).getTime() - new Date(d.createdAt).getTime()) / 86400000)
    .filter((n) => Number.isFinite(n) && n >= 0);

  return {
    revenue,
    won: wonDeals.length,
    lost: lostDeals.length,
    closed,
    openCount: openDeals.length,
    pipeline,
    pipelineRaw,
    winRate,
    avgDeal,
    avgDays: cycles.length ? avg(cycles) : null,
    wonDeals,
    lostDeals,
    openDeals,
  };
}

export function monthlySeries(state, months = 12, now = new Date()) {
  const out = [];
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = months - 1; i >= 0; i -= 1) {
    const from = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    const t = totals(state, from, to);
    out.push({
      key: monthKey(from),
      label: new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(from).replace('.', ''),
      revenue: t.revenue,
      won: t.won,
      lost: t.lost,
      pipeline: t.pipeline,
    });
  }
  return out;
}

export function bySource(state, from, to) {
  const map = new Map();
  for (const deal of alive(state?.deals)) {
    const key = deal.source || 'Не указан';
    if (!map.has(key)) map.set(key, { source: key, revenue: 0, won: 0, open: 0, lost: 0, total: 0 });
    const row = map.get(key);
    row.total += 1;
    if (isWon(deal) && inRange(dealClosedAt(deal), from, to)) {
      row.revenue += dealAmount(deal);
      row.won += 1;
    }
    if (isOpen(deal)) row.open += 1;
    if (isLost(deal) && inRange(dealClosedAt(deal), from, to)) row.lost += 1;
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.total - a.total);
}

export function byLicense(state, from, to) {
  const map = new Map();
  for (const deal of alive(state?.deals)) {
    if (!isWon(deal) || !inRange(dealClosedAt(deal), from, to)) continue;
    const key = deal.license || 'Не указан';
    const row = map.get(key) || { license: key, revenue: 0, count: 0 };
    row.revenue += dealAmount(deal);
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export function topContacts(state, from, to, limit = 5) {
  const contacts = new Map(alive(state?.contacts).map((c) => [c.id, c]));
  const map = new Map();
  for (const deal of alive(state?.deals)) {
    if (!isWon(deal) || !inRange(dealClosedAt(deal), from, to)) continue;
    const id = deal.contactId || '__none';
    const row = map.get(id) || { contact: contacts.get(id) || null, revenue: 0, count: 0 };
    row.revenue += dealAmount(deal);
    row.count += 1;
    map.set(id, row);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export function staleDeals(state, now = new Date(), days = 21) {
  const activityByDeal = new Map();
  for (const act of alive(state?.activities)) {
    if (!act.dealId) continue;
    const prev = activityByDeal.get(act.dealId) || 0;
    const t = new Date(act.at || act.createdAt).getTime();
    if (t > prev) activityByDeal.set(act.dealId, t);
  }
  return alive(state?.deals)
    .filter(isOpen)
    .map((deal) => {
      let touched = new Date(deal.updatedAt || deal.createdAt || 0).getTime();
      const act = activityByDeal.get(deal.id);
      if (act && act > touched) touched = act;
      const daysStale = Math.floor((new Date(now).getTime() - touched) / 86400000);
      return { deal, daysStale, hasNextAction: Boolean(deal.nextActionAt) };
    })
    .filter((row) => row.daysStale >= days)
    .sort((a, b) => b.daysStale - a.daysStale);
}

export function funnel(state) {
  const deals = alive(state?.deals);
  const order = ['lead', 'contacted', 'negotiation', 'invoice', 'paid'];
  const counts = {};
  for (const deal of deals) {
    const reached = dealStages(deal);
    for (const stage of order) {
      if (reached.has(stage)) counts[stage] = (counts[stage] || 0) + 1;
    }
  }
  return order.map((stage, index) => {
    const count = counts[stage] || 0;
    const prev = index === 0 ? count : (counts[order[index - 1]] || 0);
    return {
      stage,
      label: stageInfo(stage).label,
      color: stageInfo(stage).color,
      count,
      conversion: prev > 0 ? (count / prev) * 100 : null,
    };
  });
}

/* ---------------- tasks ---------------- */

export function taskBuckets(state, now = new Date()) {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const week = addDays(today, 7);
  const buckets = { overdue: [], today: [], week: [], later: [], noDate: [], done: [] };

  for (const task of alive(state?.tasks)) {
    if (task.done) {
      const doneAt = task.doneAt ? new Date(task.doneAt).getTime() : 0;
      if (doneAt && Date.now() - doneAt < 30 * 86400000) buckets.done.push(task);
      continue;
    }
    if (!task.dueAt) {
      buckets.noDate.push(task);
      continue;
    }
    const due = new Date(task.dueAt);
    if (Number.isNaN(due.getTime())) {
      buckets.noDate.push(task);
    } else if (due < today) {
      buckets.overdue.push(task);
    } else if (due < tomorrow) {
      buckets.today.push(task);
    } else if (due < week) {
      buckets.week.push(task);
    } else {
      buckets.later.push(task);
    }
  }

  const byDue = (a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0);
  buckets.overdue.sort(byDue);
  buckets.today.sort(byDue);
  buckets.week.sort(byDue);
  buckets.later.sort(byDue);
  buckets.done.sort((a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0));

  return buckets;
}

export function taskTotals(state, now = new Date()) {
  const buckets = taskBuckets(state, now);
  return {
    overdue: buckets.overdue.length,
    today: buckets.today.length,
    week: buckets.week.length,
    later: buckets.later.length,
    noDate: buckets.noDate.length,
    done: buckets.done.length,
    open: buckets.overdue.length + buckets.today.length + buckets.week.length + buckets.later.length + buckets.noDate.length,
  };
}

/* ---------------- manual KPIs & activities ---------------- */

export function kpisInRange(state, from, to) {
  const fromKey = monthKey(from);
  const toKey = monthKey(new Date(new Date(to).getTime() - 86400000));
  const rows = alive(state?.kpis).filter((row) => row.month >= fromKey && row.month <= toKey);
  const totalsRow = {
    outreach: sum(rows, (r) => num(r.outreach)),
    replies: sum(rows, (r) => num(r.replies)),
    calls: sum(rows, (r) => num(r.calls)),
    plays: sum(rows, (r) => num(r.plays)),
    followers: sum(rows, (r) => num(r.followers)),
    adSpend: sum(rows, (r) => num(r.adSpend)),
    months: rows.length,
  };
  totalsRow.responseRate = totalsRow.outreach > 0 ? (totalsRow.replies / totalsRow.outreach) * 100 : null;
  return { rows, totals: totalsRow };
}

export function activitySummary(state, from, to) {
  const rows = alive(state?.activities).filter((a) => inRange(a.at || a.createdAt, from, to));
  const byType = {};
  for (const row of rows) byType[row.type || 'note'] = (byType[row.type || 'note'] || 0) + 1;
  return { rows, byType, total: rows.length };
}

export function contactStats(state, contactId) {
  const deals = alive(state?.deals).filter((d) => d.contactId === contactId);
  const won = deals.filter(isWon);
  return {
    deals,
    open: deals.filter(isOpen),
    won: won.length,
    revenue: sum(won, dealAmount),
    lastContactAt: alive(state?.activities)
      .filter((a) => a.contactId === contactId)
      .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))[0]?.at || null,
  };
}

/* ---------------- insights ---------------- */

export function insights(state, from, to, previous = null, now = new Date()) {
  const out = [];
  const current = totals(state, from, to);
  const prev = previous ? totals(state, previous.from, previous.to) : null;
  const currency = state?.settings?.currency || 'USD';
  const openTasks = taskTotals(state, now);

  if (prev && prev.revenue > 0) {
    const delta = ((current.revenue - prev.revenue) / prev.revenue) * 100;
    if (Math.abs(delta) >= 1) {
      out.push({
        tone: delta >= 0 ? 'ok' : 'warn',
        icon: delta >= 0 ? 'trend-up' : 'trend-down',
        text: `Выручка ${delta >= 0 ? 'выросла' : 'упала'} на <b>${Math.abs(delta).toFixed(0)}%</b> к предыдущему периоду: ${money(current.revenue, currency)} против ${money(prev.revenue, currency)}.`,
      });
    }
  } else if (current.revenue > 0) {
    out.push({
      tone: 'ok',
      icon: 'trend-up',
      text: `За период закрыто <b>${current.won}</b> ${plural(current.won, 'сделка', 'сделки', 'сделок')} на <b>${money(current.revenue, currency)}</b>.`,
    });
  }

  if (current.closed >= 4 && current.winRate !== null && current.winRate < 35) {
    out.push({
      tone: 'warn',
      icon: 'alert',
      text: `Конверсия закрытых сделок <b>${current.winRate.toFixed(0)}%</b>. Стоит разобрать отказы и усилить квалификацию лидов.`,
    });
  }

  const stale = staleDeals(state, now, 21);
  if (stale.length) {
    const value = sum(stale, (row) => dealAmount(row.deal));
    out.push({
      tone: 'warn',
      icon: 'clock',
      text: `<b>${stale.length}</b> ${plural(stale.length, 'сделка', 'сделки', 'сделок')} без движения больше 21 дня на <b>${money(value, currency)}</b>. Пора сделать фоллоу-ап.`,
    });
  }

  if (openTasks.overdue) {
    out.push({
      tone: 'bad',
      icon: 'alert',
      text: `<b>${openTasks.overdue}</b> ${plural(openTasks.overdue, 'просроченная задача', 'просроченные задачи', 'просроченных задач')}. Напоминания придут в Telegram, но лучше закрыть их сегодня.`,
    });
  }

  const sources = bySource(state, from, to).filter((row) => row.revenue > 0);
  if (sources.length && current.revenue > 0) {
    const top = sources[0];
    const share = (top.revenue / current.revenue) * 100;
    if (share >= 55) {
      out.push({
        tone: 'info',
        icon: 'source',
        text: `Источник <b>${esc(top.source)}</b> даёт <b>${share.toFixed(0)}%</b> выручки. Зависимость от одного канала — риск, попробуй ещё один.`,
      });
    }
  }

  const clients = topContacts(state, from, to, 1);
  if (clients.length && current.revenue > 0) {
    const top = clients[0];
    const share = (top.revenue / current.revenue) * 100;
    if (share >= 40 && top.contact) {
      out.push({
        tone: 'info',
        icon: 'user',
        text: `<b>${esc(top.contact.name)}</b> приносит <b>${share.toFixed(0)}%</b> выручки периода (${money(top.revenue, currency)}). Хороший кандидат на долгосрочный контракт.`,
      });
    }
  }

  if (current.pipeline > 0) {
    out.push({
      tone: 'info',
      icon: 'pipeline',
      text: `Взвешенный пайплайн: <b>${money(current.pipeline, currency)}</b> из ${current.openCount} ${plural(current.openCount, 'открытой сделки', 'открытых сделок', 'открытых сделок')} (сырая сумма ${money(current.pipelineRaw, currency)}).`,
    });
  }

  if (!current.won && !current.openCount) {
    out.push({
      tone: 'info',
      icon: 'info',
      text: 'Пока нет данных за период. Добавь сделку или загрузи демо-данные в настройках, чтобы увидеть аналитику.',
    });
  }

  return out;
}

export function dashboardStats(state, now = new Date()) {
  const month = rangeForPreset('month', now);
  const prev = previousRange('month', month, now);
  const current = totals(state, month.from, month.to);
  const previous = totals(state, prev.from, prev.to);
  const tasks = taskTotals(state, now);
  const allTime = totals(state, new Date(2000, 0, 1), addDays(startOfDay(now), 1));
  return {
    month,
    prevMonth: prev,
    current,
    previous,
    tasks,
    allTime,
    series: monthlySeries(state, 12, now),
    funnel: funnel(state),
    sources: bySource(state, month.from, month.to),
    stale: staleDeals(state, now, 21),
  };
}
