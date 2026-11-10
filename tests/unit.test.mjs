import test from 'node:test';
import assert from 'node:assert/strict';

/* store.js reads localStorage when imported. Give Node a minimal stand-in. */
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
  key: (index) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
};

const {
  normalizeState, mergeStates, emptyState, newDeal, newTask,
} = await import('../assets/js/store.js');
const {
  totals, funnel, taskBuckets, taskTotals, bySource, byLicense, topContacts,
  monthlySeries, dealProbability, dealAmount, weightedAmount, kpisInRange,
  activitySummary, contactStats, rangeForPreset, staleDeals,
} = await import('../assets/js/stats.js');
const {
  num, sum, plural, money, fromLocalInput, toDateInput, toDateTimeInput, parseTags, truncate,
} = await import('../assets/js/util.js');
const {
  buildCsv, buildAiJson, buildAiReport, buildFilename, aiPrompt,
} = await import('../assets/js/exporters.js');
const { buildDemoState } = await import('../assets/js/demo.js');
const bot = await import('../scripts/bot.mjs');

const NOW = new Date(2025, 5, 15, 12, 0, 0); // 15 June 2025, local time

function at(day, hour = 12, minute = 0) {
  return new Date(2025, 5, day, hour, minute, 0).toISOString();
}

function fixture() {
  return normalizeState({
    settings: {
      artistName: 'NOVA BEATS',
      currency: 'USD',
      timezone: 'Europe/Moscow',
      updatedAt: at(1),
    },
    contacts: [
      {
        id: 'c1', name: 'Kai', role: 'Артист', handle: '@kai', source: 'Telegram',
        createdAt: at(1), updatedAt: at(1),
      },
      {
        id: 'c2', name: 'Mira', role: 'Менеджер', source: 'Instagram',
        createdAt: at(2), updatedAt: at(2),
      },
    ],
    deals: [
      {
        id: 'd1', title: 'Won deal', contactId: 'c1', stage: 'paid', amount: 1000,
        license: 'Exclusive', source: 'Telegram', probability: '',
        createdAt: at(1), closedAt: at(10), updatedAt: at(10),
        stageHistory: [
          { stage: 'lead', at: at(1) },
          { stage: 'contacted', at: at(2) },
          { stage: 'negotiation', at: at(4) },
          { stage: 'invoice', at: at(6) },
          { stage: 'paid', at: at(10) },
        ],
      },
      {
        id: 'd2', title: 'Open deal', contactId: 'c2', stage: 'negotiation', amount: 2000,
        license: 'Lease', source: 'Instagram', probability: 50,
        createdAt: at(3), updatedAt: at(14),
        stageHistory: [
          { stage: 'lead', at: at(3) },
          { stage: 'contacted', at: at(5) },
          { stage: 'negotiation', at: at(7) },
        ],
      },
      {
        id: 'd3', title: 'Lost deal', contactId: 'c2', stage: 'lost', amount: 500,
        license: 'Lease', source: 'BeatStars', createdAt: at(2), closedAt: at(11), updatedAt: at(11),
        stageHistory: [
          { stage: 'lead', at: at(2) },
          { stage: 'contacted', at: at(3) },
          { stage: 'negotiation', at: at(5) },
          { stage: 'invoice', at: at(8) },
          { stage: 'lost', at: at(11) },
        ],
      },
    ],
    tasks: [
      {
        id: 't1', title: 'Overdue follow-up', dueAt: at(14, 9), createdAt: at(10), updatedAt: at(10),
      },
      {
        id: 't2', title: 'Today call', dueAt: at(15, 18), contactId: 'c1', dealId: 'd2',
        createdAt: at(13), updatedAt: at(13),
      },
      {
        id: 't3', title: 'Later task', dueAt: at(18, 12), createdAt: at(14), updatedAt: at(14),
      },
      {
        id: 't4', title: 'Done task', dueAt: at(15, 9), done: true,
        doneAt: new Date().toISOString(), createdAt: at(9), updatedAt: at(9),
      },
    ],
    activities: [
      { id: 'a1', type: 'outreach', at: at(3), contactId: 'c1', dealId: 'd2', note: 'DM sent' },
      { id: 'a2', type: 'payment', at: at(10), contactId: 'c1', dealId: 'd1', note: 'Paid' },
      { id: 'a3', type: 'note', at: at(12), contactId: 'c2', note: 'Follow up' },
    ],
    kpis: [
      {
        id: 'k1', month: '2025-06', outreach: 100, replies: 25, calls: 10,
        plays: 4000, followers: 120, adSpend: 50,
      },
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Util                                                                 */
/* ------------------------------------------------------------------ */

test('util: numbers, sum and Russian plurals', () => {
  assert.equal(num('1 234,5'), 1234.5);
  assert.equal(num('nope', 7), 7);
  assert.equal(sum([1, 2, 3]), 6);
  assert.equal(sum([{ v: 2 }, { v: 3 }], (row) => row.v), 5);

  assert.equal(plural(1, 'сделка', 'сделки', 'сделок'), 'сделка');
  assert.equal(plural(2, 'сделка', 'сделки', 'сделок'), 'сделки');
  assert.equal(plural(5, 'сделка', 'сделки', 'сделок'), 'сделок');
  assert.equal(plural(21, 'сделка', 'сделки', 'сделок'), 'сделка');
  assert.equal(plural(11, 'сделка', 'сделки', 'сделок'), 'сделок');
  assert.equal(plural(0, 'сделка', 'сделки', 'сделок'), 'сделок');
});

test('util: money, tags and date inputs', () => {
  assert.match(money(1000, 'USD'), /1\s?000/);
  assert.deepEqual(parseTags('#rap, trap; soul'), ['rap', 'trap', 'soul']);
  assert.equal(truncate('abcdef', 4), 'abc…');

  const iso = fromLocalInput('2025-06-15T18:30');
  assert.equal(toDateTimeInput(iso), '2025-06-15T18:30');
  assert.equal(toDateInput(iso), '2025-06-15');
  assert.equal(fromLocalInput(''), null);
  assert.equal(fromLocalInput('not-a-date'), null);
});

/* ------------------------------------------------------------------ */
/* Stats                                                                */
/* ------------------------------------------------------------------ */

test('stats: period totals, win rate and weighted pipeline', () => {
  const state = fixture();
  const range = rangeForPreset('month', NOW);
  const t = totals(state, range.from, range.to);

  assert.equal(t.revenue, 1000);
  assert.equal(t.won, 1);
  assert.equal(t.lost, 1);
  assert.equal(t.closed, 2);
  assert.equal(t.winRate, 50);
  assert.equal(t.avgDeal, 1000);
  assert.equal(t.avgDays, 9);
  assert.equal(t.openCount, 1);
  assert.equal(t.pipelineRaw, 2000);
  assert.equal(t.pipeline, 1000);
});

test('stats: probability falls back to the stage and keeps explicit zero', () => {
  assert.equal(dealProbability({ stage: 'negotiation', probability: '' }), 50);
  assert.equal(dealProbability({ stage: 'negotiation', probability: 0 }), 0);
  assert.equal(dealProbability({ stage: 'lead', probability: 'abc' }), 10);
  assert.equal(dealAmount({ amount: -5 }), 0);
  assert.equal(weightedAmount({ stage: 'invoice', amount: 400 }), 300);
});

test('stats: funnel counts deals that reached each stage', () => {
  const rows = funnel(fixture());
  const byStage = Object.fromEntries(rows.map((row) => [row.stage, row]));

  assert.equal(byStage.lead.count, 3);
  assert.equal(byStage.contacted.count, 3);
  assert.equal(byStage.negotiation.count, 3);
  assert.equal(byStage.invoice.count, 2);
  assert.equal(byStage.paid.count, 1);
  assert.equal(byStage.contacted.conversion, 100);
  assert.equal(Math.round(byStage.invoice.conversion), 67);
  assert.equal(byStage.paid.conversion, 50);
});

test('stats: source, license and top-client breakdowns', () => {
  const state = fixture();
  const range = rangeForPreset('month', NOW);
  const sources = bySource(state, range.from, range.to);
  const telegram = sources.find((row) => row.source === 'Telegram');

  assert.equal(telegram.revenue, 1000);
  assert.equal(telegram.won, 1);
  assert.equal(telegram.open, 0);

  const licenses = byLicense(state, range.from, range.to);
  assert.deepEqual(licenses, [{ license: 'Exclusive', revenue: 1000, count: 1 }]);

  const clients = topContacts(state, range.from, range.to);
  assert.equal(clients[0].contact.name, 'Kai');
  assert.equal(clients[0].revenue, 1000);
});

test('stats: task buckets use the injected clock', () => {
  const state = fixture();
  const buckets = taskBuckets(state, NOW);
  assert.deepEqual(buckets.overdue.map((task) => task.id), ['t1']);
  assert.deepEqual(buckets.today.map((task) => task.id), ['t2']);
  assert.deepEqual(buckets.week.map((task) => task.id), ['t3']);
  assert.equal(buckets.done[0].id, 't4');

  const counts = taskTotals(state, NOW);
  assert.equal(counts.overdue, 1);
  assert.equal(counts.today, 1);
  assert.equal(counts.week, 1);
  assert.equal(counts.open, 3);
});

test('stats: monthly series covers 12 months and ends with the current one', () => {
  const series = monthlySeries(fixture(), 12, NOW);
  assert.equal(series.length, 12);
  assert.equal(series[11].key, '2025-06');
  assert.equal(series[11].revenue, 1000);
});

test('stats: manual KPIs, journal and contact card', () => {
  const state = fixture();
  const range = rangeForPreset('month', NOW);
  const kpis = kpisInRange(state, range.from, range.to);
  assert.equal(kpis.rows.length, 1);
  assert.equal(kpis.totals.outreach, 100);
  assert.equal(kpis.totals.responseRate, 25);

  const journal = activitySummary(state, range.from, range.to);
  assert.equal(journal.total, 3);
  assert.equal(journal.byType.outreach, 1);

  const card = contactStats(state, 'c1');
  assert.equal(card.deals.length, 1);
  assert.equal(card.revenue, 1000);
  assert.equal(card.open.length, 0);
});

test('stats: stale deals are detected for open deals only', () => {
  const state = fixture();
  state.deals[1].updatedAt = new Date(Date.now() - 40 * 86400000).toISOString();
  const stale = staleDeals(state, new Date(), 21);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].deal.id, 'd2');
  assert.ok(stale[0].daysStale >= 21);
});

/* ------------------------------------------------------------------ */
/* Store normalisation and merge                                        */
/* ------------------------------------------------------------------ */

test('store: normalises empty probability and BPM without inventing values', () => {
  const state = normalizeState({
    deals: [{ id: 'd', title: 'x', amount: '1 200', probability: '' }],
    beats: [{ id: 'b', title: 'y', bpm: '' }],
  });
  assert.equal(state.deals[0].probability, '');
  assert.equal(state.deals[0].amount, 1200);
  assert.equal(state.beats[0].bpm, null);
});

test('store: new records get ids, timestamps and sane defaults', () => {
  const deal = newDeal({ title: 'Beat lease', amount: 300 });
  const task = newTask({ title: 'Follow up', dueAt: at(20) });
  assert.match(deal.id, /^d_/);
  assert.equal(deal.stage, 'lead');
  assert.ok(deal.createdAt && deal.updatedAt);
  assert.equal(task.done, false);
  assert.equal(task.repeat, 'none');
  assert.equal(task.remind, true);
});

test('merge: newest record wins and deleted records stay deleted', () => {
  const remote = {
    contacts: [{
      id: 'c1', name: 'Remote name', updatedAt: '2025-01-01T00:00:00.000Z', createdAt: '2025-01-01T00:00:00.000Z',
    }],
    settings: { artistName: 'Remote', updatedAt: '2025-01-01T00:00:00.000Z' },
  };
  const local = {
    contacts: [{
      id: 'c1', name: 'Local name', updatedAt: '2025-01-02T00:00:00.000Z', createdAt: '2025-01-01T00:00:00.000Z',
    }],
    settings: { artistName: 'Local', updatedAt: '' },
  };

  const merged = mergeStates(remote, local);
  assert.equal(merged.contacts[0].name, 'Local name');
  assert.equal(merged.settings.artistName, 'Remote');

  const deletedAt = new Date().toISOString();
  const deleted = mergeStates({}, {
    contacts: [{
      id: 'c2', name: 'Gone', createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: deletedAt, deletedAt,
    }],
  });
  assert.ok(deleted.contacts[0].deletedAt);
  assert.equal(deleted.contacts.length, 1);
});

test('merge: tombstones older than 90 days are purged', () => {
  const old = new Date(Date.now() - 100 * 86400000).toISOString();
  const merged = mergeStates({}, {
    contacts: [{
      id: 'c1', name: 'Old', createdAt: old, updatedAt: old, deletedAt: old,
    }],
  });
  assert.equal(merged.contacts.length, 0);
});

test('merge: remote bot state always wins over a stale local copy', () => {
  const merged = mergeStates(
    { bot: { updateOffset: 42, digestDate: '2025-06-15' } },
    { bot: { updateOffset: 7, digestDate: '2025-06-14' } },
  );
  assert.equal(merged.bot.updateOffset, 42);
  assert.equal(merged.bot.digestDate, '2025-06-15');
});

test('merge: a fresh local settings object does not overwrite the cloud profile', () => {
  const merged = mergeStates(
    { settings: { artistName: 'Cloud', timezone: 'Europe/Berlin', updatedAt: '2025-05-01T00:00:00.000Z' } },
    { settings: emptyState().settings },
  );
  assert.equal(merged.settings.artistName, 'Cloud');
  assert.equal(merged.settings.timezone, 'Europe/Berlin');
});

/* ------------------------------------------------------------------ */
/* Exporters                                                            */
/* ------------------------------------------------------------------ */

test('exporters: CSV has a BOM, Russian headers and escaped values', () => {
  const csv = buildCsv(fixture(), 'deals');
  assert.ok(csv.startsWith('\ufeffID;Сделка;Клиент;Этап;Сумма;'));
  assert.match(csv, /Won deal/);
  assert.match(csv, /Kai/);
  assert.match(csv, /1,?000/);
});

test('exporters: AI JSON includes summary, pipeline, tasks and prompt', () => {
  const data = buildAiJson(fixture(), 'month', NOW);
  assert.equal(data.meta.tool, 'Producer Sales Helper');
  assert.equal(data.meta.period.from, new Date(2025, 5, 1).toISOString());
  assert.equal(data.summary.revenue, 1000);
  assert.equal(data.summary.pipeline, 1000);
  assert.equal(data.pipeline.length, 1);
  assert.equal(data.pipeline[0].probability, 50);
  assert.equal(data.tasks.overdue.length, 1);
  assert.deepEqual(data.monthly.at(-1), { month: '2025-06', revenue: 1000, won: 1, lost: 1 });
  assert.match(data.aiPrompt, /аналитик продаж/i);
});

test('exporters: Markdown report is complete and AI-ready', () => {
  const report = buildAiReport(fixture(), 'month', NOW);
  assert.match(report, /^# Producer Sales Helper — отчёт/);
  assert.match(report, /## 1\. Ключевые показатели/);
  assert.match(report, /## 7\. Открытый пайплайн/);
  assert.match(report, /## 11\. Промпт для ИИ/);
  assert.match(report, /Open deal/);
  assert.match(report, /NOVA BEATS/);
  assert.match(report, /```text/);
});

test('exporters: filenames and prompt are stable', () => {
  assert.equal(buildFilename('report', 'md', NOW), 'psh-report-2025-06-15.md');
  assert.match(aiPrompt(fixture()), /NOVA BEATS/);
});

/* ------------------------------------------------------------------ */
/* Demo data                                                            */
/* ------------------------------------------------------------------ */

test('demo: buildDemoState produces a usable dataset', () => {
  const state = buildDemoState();
  assert.ok(state.deals.length >= 8);
  assert.ok(state.contacts.length >= 5);
  assert.ok(state.tasks.length >= 4);
  assert.ok(state.activities.length >= 5);
  assert.ok(state.deals.some((deal) => deal.stage === 'paid' || deal.stage === 'delivered'));

  const range = rangeForPreset('month', new Date());
  const t = totals(state, range.from, range.to);
  assert.ok(t.revenue > 0);
  assert.ok(t.openCount > 0);
});

/* ------------------------------------------------------------------ */
/* Telegram bot helpers                                                 */
/* ------------------------------------------------------------------ */

function botState(tasks) {
  const state = normalizeState({
    settings: {
      timezone: 'UTC', remindAhead: 60, digestEnabled: true, digestHour: 9,
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    tasks,
    deals: [{
      id: 'd1', title: 'Open deal', stage: 'negotiation', amount: 1000,
      probability: 50, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
    }],
  });
  state.bot = { reminders: {} };
  return state;
}

test('bot: reminders respect the lead time and skip old or disabled tasks', () => {
  const now = new Date();
  const dueSoon = new Date(now.getTime() + 30 * 60000).toISOString();
  const later = new Date(now.getTime() + 3 * 3600000).toISOString();
  const tooOld = new Date(now.getTime() - 72 * 3600000).toISOString();

  const state = botState([
    { id: 't1', title: 'Soon', dueAt: dueSoon, remind: true },
    { id: 't2', title: 'Later', dueAt: later, remind: true },
    { id: 't3', title: 'Old', dueAt: tooOld, remind: true },
    { id: 't4', title: 'Muted', dueAt: dueSoon, remind: false },
    { id: 't5', title: 'Done', dueAt: dueSoon, remind: true, done: true },
  ]);
  state.bot.reminders.t5 = dueSoon;

  const result = bot.reminderCandidates(state, now);
  assert.deepEqual(result.due.map((task) => task.id), ['t1']);
  assert.equal(state.bot.reminders.t3, tooOld);
  assert.equal(state.bot.reminders.t5, undefined);
  assert.equal(result.dirty, true);

  state.bot.reminders.t1 = dueSoon;
  const second = bot.reminderCandidates(state, now);
  assert.deepEqual(second.due, []);
});

test('bot: completing a recurring task creates the next occurrence', () => {
  const past = new Date(Date.now() - 9 * 86400000).toISOString();
  const state = botState([
    { id: 't1', title: 'Weekly', dueAt: past, repeat: 'weekly', remind: true },
  ]);
  const task = state.tasks.find((row) => row.id === 't1');

  const next = bot.completeTask(state, task);
  assert.ok(next);
  assert.equal(task.done, true);
  assert.ok(task.doneAt);
  assert.equal(state.tasks.length, 2);

  const copy = state.tasks[0];
  assert.notEqual(copy.id, task.id);
  assert.equal(copy.done, false);
  assert.equal(copy.repeat, 'weekly');
  assert.ok(new Date(copy.dueAt) > new Date());
});

test('bot: /done lookup accepts exact, prefix and suffix ids', () => {
  const state = botState([
    { id: 't_abcdef123456', title: 'One', dueAt: '' },
    { id: 't_zzz999888777', title: 'Two', dueAt: '' },
  ]);
  assert.equal(bot.findTask(state, 't_abcdef123456').task.title, 'One');
  assert.equal(bot.findTask(state, 't_abc').task.title, 'One');
  assert.equal(bot.findTask(state, '3456').task.title, 'One');
  assert.match(bot.findTask(state, 'nope').error, /не найдена/);
});

test('bot: help and digest text are Russian and actionable', () => {
  const state = botState([
    { id: 't1', title: 'Today', dueAt: new Date().toISOString(), remind: true },
  ]);
  assert.match(bot.helpText(), /\/done/);
  assert.match(bot.helpText(), /\/pipeline/);
  assert.match(bot.helpText(), /\/app/);
  const digest = bot.digestText(state, 'UTC', new Date());
  assert.match(digest, /Сводка на/);
  assert.match(digest, /Пайплайн/);
  assert.match(digest, /Фокус на сегодня/);
});

test('bot: Mini App URL is normalised and HTTPS-only', () => {
  assert.equal(bot.normalizeAppUrl(' https://user.github.io/repo/index.html '), 'https://user.github.io/repo');
  assert.equal(bot.normalizeAppUrl('https://user.github.io/repo/'), 'https://user.github.io/repo');
  assert.equal(bot.normalizeAppUrl('https://example.com/'), 'https://example.com');
  assert.equal(bot.normalizeAppUrl('http://example.com/app'), '');
  assert.equal(bot.normalizeAppUrl('example.com/app'), '');
  assert.equal(bot.normalizeAppUrl(''), '');
});

test('bot: Mini App keyboard uses web_app in private chats and a link in groups', () => {
  const url = 'https://user.github.io/repo';
  const privateKb = bot.appKeyboard('123456789', url);
  assert.equal(privateKb.inline_keyboard[0][0].web_app.url, url);

  const groupKb = bot.appKeyboard('-1001234567890', url);
  assert.equal(groupKb.inline_keyboard[0][0].url, url);
  assert.equal(groupKb.inline_keyboard[0][0].web_app, undefined);

  assert.equal(bot.appKeyboard('123456789', ''), null);
});
