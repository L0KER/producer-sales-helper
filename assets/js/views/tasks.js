import { store, syncConfigured } from '../store.js';
import { taskBuckets, taskTotals } from '../stats.js';
import { esc } from '../util.js';
import { icon } from '../icons.js';
import {
  pageHead, emptyState, taskRow,
} from './partials.js';

function group(title, rows, tone = '') {
  if (!rows.length) return '';
  return `<div class="task-group">
    <div class="task-group-head ${tone}">${esc(title)}<span class="n">${rows.length}</span></div>
    <div class="task-list">${rows.map((task) => taskRow(task)).join('')}</div>
  </div>`;
}

export function render(ctx) {
  const ui = ctx.ui;
  const buckets = taskBuckets(store.state);
  const counts = taskTotals(store.state);
  const filter = ui.taskFilter || 'open';

  const filters = [
    { id: 'open', label: 'Открытые', n: counts.open },
    { id: 'overdue', label: 'Просрочено', n: counts.overdue },
    { id: 'today', label: 'Сегодня', n: counts.today },
    { id: 'week', label: '7 дней', n: counts.week },
    { id: 'done', label: 'Выполнено', n: counts.done },
  ];

  let body = '';

  if (filter === 'done') {
    body = buckets.done.length
      ? `<div class="task-list">${buckets.done.slice(0, 100).map((task) => taskRow(task)).join('')}</div>`
      : emptyState({ iconName: 'check', title: 'Пока ничего не закрыто', text: 'Выполненные задачи хранятся 30 дней в этом списке.' });
  } else if (filter === 'overdue') {
    body = group('Просрочено', buckets.overdue, 'bad')
      || emptyState({ iconName: 'check', title: 'Просроченных задач нет', text: 'Отличная работа — держи темп.' });
  } else if (filter === 'today') {
    body = group('Сегодня', buckets.today, 'warn')
      || emptyState({ iconName: 'check', title: 'На сегодня задач нет', text: 'Запланируй фоллоу-ап, чтобы не терять тёплые лиды.' });
  } else if (filter === 'week') {
    body = [group('Сегодня', buckets.today, 'warn'), group('Ближайшие 7 дней', buckets.week)].join('')
      || emptyState({ iconName: 'calendar', title: 'На неделе пусто', text: 'Добавь задачи на фоллоу-апы и контент.' });
  } else {
    body = [
      group('Просрочено', buckets.overdue, 'bad'),
      group('Сегодня', buckets.today, 'warn'),
      group('Ближайшие 7 дней', buckets.week),
      group('Позже', buckets.later),
      group('Без даты', buckets.noDate),
    ].join('');

    if (!body) {
      body = emptyState({
        iconName: 'tasks',
        title: 'Открытых задач нет',
        text: 'Добавь напоминание, чтобы не забыть про оплату, стемы или фоллоу-ап.',
        action: '<button class="btn primary" data-action="add-task">Добавить задачу</button>',
      });
    }
  }

  const remindersReady = syncConfigured() && Boolean(store.settings.telegramChatId);

  return `<section class="page">
    ${pageHead(
    'Задачи и напоминания',
    `${counts.open} открытых · ${counts.overdue} просрочено · ${counts.today} на сегодня`,
    `<button class="btn primary" data-action="add-task">${icon('plus', 15)} Задача</button>`,
  )}

    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Фильтр задач">
        ${filters.map((item) => `<button class="${filter === item.id ? 'active' : ''}" data-action="set-task-filter" data-value="${item.id}">
          ${esc(item.label)} <span class="chip-n">${item.n}</span>
        </button>`).join('')}
      </div>
      <span class="spacer"></span>
      <a class="btn sm ghost" href="#/settings">${icon('settings', 14)} Напоминания</a>
    </div>

    ${body}

    ${!remindersReady ? `<div class="insight warn">
      <span class="i-ico">${icon('bell', 15)}</span>
      <div><b>Telegram-напоминания ещё не настроены.</b> Нужен подключённый Gist и chat ID в настройках, а также секреты в GitHub Actions.
        <a href="#/settings">Открыть настройки</a></div>
    </div>` : `<div class="insight info">
      <span class="i-ico">${icon('telegram', 15)}</span>
      <div>Напоминания уходят в Telegram за ${store.settings.remindAhead} мин до срока. Повторяющиеся задачи создают следующее occurrence после выполнения.</div>
    </div>`}
  </section>`;
}
