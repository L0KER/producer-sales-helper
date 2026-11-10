import {
  store, newContact, newDeal, newTask, newBeat, newActivity, newKpi,
  CONTACT_ROLES, LICENSE_TYPES, BEAT_STATUSES, ACTIVITY_TYPES, REPEAT_OPTIONS,
  getDevice, saveDevice, saveSyncConfig, getSyncConfig, getSyncStatus,
  syncNow, syncConfigured, verifyToken, findGist, createGist, disconnectSync, queueSync,
} from './store.js';
import {
  STAGES, stageInfo, isWon, isOpen, dealAmount, contactStats, alive, taskBuckets, dealProbability,
} from './stats.js';
import {
  openForm, openModal, closeModal, confirmDialog,
} from './forms.js';
import {
  esc, money, nowIso, toDateInput, toDateTimeInput, uid, clamp, toast, copyText,
  downloadFile, fmtDate, fmtDateTime, parseTags, relDay,
} from './util.js';
import { icon } from './icons.js';
import {
  buildAiReport, buildAiJson, buildCsv, buildBackup, buildFilename, aiPrompt,
} from './exporters.js';
import {
  contactOptions, dealOptions, beatOptions, sourceOptions, avatar, taskRow, stageBadge,
} from './views/partials.js';
import { buildDemoState } from './demo.js';
import { appBaseUrl } from './telegram.js';

let ctx = null;

export function initActions(context) {
  ctx = context;
}

function getUi() {
  return ctx?.getUi?.() || {};
}

function rerender() {
  ctx?.rerender?.();
}

function navigate(hash) {
  ctx?.navigate?.(hash);
}

function isWonStage(stage) {
  return stage === 'paid' || stage === 'delivered';
}

function nextStageOf(stage) {
  const order = ['lead', 'contacted', 'negotiation', 'invoice', 'paid', 'delivered'];
  const index = order.indexOf(stage);
  if (index === -1) return 'lead';
  return order[Math.min(order.length - 1, index + 1)];
}

function defaultDueIso() {
  const d = new Date(Date.now() + 3600000);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

/* ------------------------------------------------------------------ */
/* Contacts                                                             */
/* ------------------------------------------------------------------ */

export function openContactForm(contactId = null) {
  closeModal();
  const contact = contactId ? store.state.contacts.find((c) => c.id === contactId && !c.deletedAt) : null;
  const values = contact
    ? { ...contact, lastContactAt: contact.lastContactAt || '' }
    : { role: 'Артист', source: 'Telegram', tags: [], lastContactAt: '' };

  openForm({
    title: contact ? 'Редактировать контакт' : 'Новый контакт',
    subtitle: contact ? 'Обнови данные, теги и заметки.' : 'Артист, менеджер, лейбл или блогер.',
    wide: true,
    values,
    fields: [
      { name: 'name', label: 'Имя / название', type: 'text', required: true, col: 2, placeholder: 'Например, Lila Rose' },
      { name: 'role', label: 'Роль', type: 'select', options: CONTACT_ROLES },
      { name: 'source', label: 'Источник', type: 'select', options: sourceOptions() },
      { name: 'handle', label: 'Telegram', type: 'text', placeholder: '@username' },
      { name: 'email', label: 'Email', type: 'email', placeholder: 'mail@example.com' },
      { name: 'country', label: 'Страна', type: 'text', placeholder: 'Латвия' },
      { name: 'tags', label: 'Теги', type: 'tags', placeholder: 'r&b, vip' },
      { name: 'lastContactAt', label: 'Последний контакт', type: 'date' },
      { name: 'notes', label: 'Заметки', type: 'textarea', col: 2, placeholder: 'Что важно помнить об этом человеке' },
    ],
    extraHtml: contact
      ? `<button type="button" class="btn danger ghost" data-action="delete-contact" data-id="${esc(contact.id)}">${icon('trash', 14)} Удалить контакт</button>`
      : '',
    onSubmit(valuesOut) {
      const payload = {
        name: valuesOut.name,
        role: valuesOut.role || 'Артист',
        handle: valuesOut.handle || '',
        email: valuesOut.email || '',
        country: valuesOut.country || '',
        source: valuesOut.source || '',
        tags: valuesOut.tags || [],
        notes: valuesOut.notes || '',
        lastContactAt: valuesOut.lastContactAt || '',
      };
      if (contact) {
        store.patch('contacts', contact.id, payload);
        toast('Контакт обновлён');
      } else {
        store.add('contacts', newContact(payload));
        toast('Контакт добавлен');
      }
    },
  });
}

export function openContactCard(contactId) {
  closeModal();
  const contact = store.state.contacts.find((c) => c.id === contactId && !c.deletedAt);
  if (!contact) {
    toast('Контакт не найден', 'error');
    return;
  }

  const stats = contactStats(store.state, contactId);
  const tasks = alive(store.state.tasks)
    .filter((task) => task.contactId === contactId && !task.done)
    .sort((a, b) => new Date(a.dueAt || '2999-01-01') - new Date(b.dueAt || '2999-01-01'));
  const activities = alive(store.state.activities)
    .filter((row) => row.contactId === contactId)
    .sort((a, b) => new Date(b.at || b.createdAt || 0) - new Date(a.at || a.createdAt || 0))
    .slice(0, 5);
  const deals = stats.deals
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const lastTouch = stats.lastContactAt || contact.lastContactAt;

  const handle = String(contact.handle || '').replace(/^@/, '');
  const html = `
    <div class="contact-hero">
      ${avatar(contact.name)}
      <div style="min-width:0">
        <h3>${esc(contact.name)}</h3>
        <p>${esc(contact.role)}${contact.source ? ` · ${esc(contact.source)}` : ''}${contact.country ? ` · ${esc(contact.country)}` : ''}</p>
      </div>
      <div class="page-actions" style="margin-left:auto">
        ${handle ? `<a class="btn sm" href="https://t.me/${encodeURIComponent(handle)}" target="_blank" rel="noopener">${icon('telegram', 14)} Telegram</a>` : ''}
        <button class="btn sm ghost" data-action="edit-contact" data-id="${esc(contact.id)}">${icon('edit', 14)}</button>
        <button class="icon-btn" data-close aria-label="Закрыть">✕</button>
      </div>
    </div>

    <div class="contact-stats">
      <div><div class="cs-label">Выручка</div><div class="cs-value ok-text">${money(stats.revenue)}</div></div>
      <div><div class="cs-label">Сделки</div><div class="cs-value">${stats.won} / ${deals.length}</div></div>
      <div><div class="cs-label">Последний контакт</div><div class="cs-value" style="font-size:14px">${lastTouch ? esc(fmtDate(lastTouch)) : '—'}</div></div>
    </div>

    <div class="contact-body">
      <div class="contact-sec">
        <h4>Контакты и заметки</h4>
        <div class="stat-row"><span class="k">Telegram</span><span class="v">${contact.handle ? `@${esc(handle)}` : '—'}</span></div>
        <div class="stat-row"><span class="k">Email</span><span class="v">${contact.email ? esc(contact.email) : '—'}</span></div>
        <div class="stat-row"><span class="k">Теги</span><span class="v">${(contact.tags || []).length ? contact.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join(' ') : '—'}</span></div>
        ${contact.notes ? `<div class="insight info" style="margin-top:10px"><span class="i-ico">${icon('note', 14)}</span><div>${esc(contact.notes)}</div></div>` : ''}
      </div>

      <div class="contact-sec">
        <h4>Сделки · ${deals.length}</h4>
        ${deals.length ? `<div class="list-clean">${deals.map((deal) => `<div class="list-item" data-action="edit-deal" data-id="${esc(deal.id)}" style="cursor:pointer">
          <div class="li-main">
            <div class="li-title">${esc(deal.title)}</div>
            <div class="li-sub">${esc(stageInfo(deal.stage).label)} · ${esc(relDay(deal.createdAt))}</div>
          </div>
          <div class="li-val ${isWon(deal) ? 'ok-text' : ''}">${money(dealAmount(deal))}</div>
        </div>`).join('')}</div>` : '<p class="small dim">Сделок пока нет.</p>'}
      </div>

      <div class="contact-sec">
        <h4>Открытые задачи · ${tasks.length}</h4>
        ${tasks.length ? `<div class="task-list" style="border:0">${tasks.map((task) => taskRow(task, { compact: true })).join('')}</div>` : '<p class="small dim">Задач нет.</p>'}
      </div>

      <div class="contact-sec">
        <h4>Последние касания</h4>
        ${activities.length ? `<div class="timeline">${activities.map((row) => `<div class="tl-item" style="padding:7px 0">
          <span class="tl-ico ${esc(row.type)}">${icon(row.type === 'payment' ? 'wallet' : row.type === 'reply' ? 'reply' : row.type === 'call' ? 'phone' : row.type === 'outreach' ? 'send' : 'note', 13)}</span>
          <div class="tl-body">
            <div class="tl-top"><span class="tl-type">${esc(ACTIVITY_TYPES.find((t) => t.id === row.type)?.label || 'Заметка')}</span><span class="tl-time">${esc(relDay(row.at || row.createdAt))}</span></div>
            ${row.note ? `<div class="tl-note">${esc(row.note)}</div>` : ''}
          </div>
        </div>`).join('')}</div>` : '<p class="small dim">История пуста.</p>'}
      </div>
    </div>

    <footer class="modal-foot">
      <button class="btn ghost" data-action="add-activity-contact" data-id="${esc(contact.id)}">${icon('activity', 14)} Касание</button>
      <button class="btn ghost" data-action="add-task-contact" data-id="${esc(contact.id)}">${icon('plus', 14)} Задача</button>
      <button class="btn primary" data-action="add-deal-contact" data-id="${esc(contact.id)}">${icon('plus', 14)} Сделка</button>
    </footer>`;

  openModal(html, { wide: true });
}

/* ------------------------------------------------------------------ */
/* Deals                                                                */
/* ------------------------------------------------------------------ */

export function openDealForm(dealId = null, preset = {}) {
  closeModal();
  const deal = dealId ? store.state.deals.find((d) => d.id === dealId && !d.deletedAt) : null;
  const values = deal
    ? { ...deal, beats: deal.beats || [] }
    : {
      stage: 'lead',
      amount: '',
      license: 'Lease',
      source: 'Telegram',
      probability: '',
      createdAt: new Date().toISOString(),
      ...preset,
    };

  openForm({
    title: deal ? 'Редактировать сделку' : 'Новая сделка',
    subtitle: deal ? 'Этап, сумма и следующее действие.' : 'Зафиксируй лид, пока он не остыл.',
    wide: true,
    values,
    note: 'Если оставить вероятность пустой, она подставится автоматически по этапу.',
    fields: [
      { name: 'title', label: 'Название', type: 'text', required: true, col: 2, placeholder: 'Exclusive на «Neon Rain»' },
      { name: 'contactId', label: 'Клиент', type: 'select', options: contactOptions() },
      { name: 'stage', label: 'Этап', type: 'select', options: STAGES.map((stage) => ({ value: stage.id, label: stage.label })), required: true },
      { name: 'amount', label: 'Сумма', type: 'money', min: 0, placeholder: '500' },
      { name: 'license', label: 'Тип лицензии', type: 'select', options: LICENSE_TYPES },
      { name: 'source', label: 'Источник', type: 'select', options: sourceOptions() },
      { name: 'probability', label: 'Вероятность, %', type: 'number', min: 0, max: 100, hint: 'Пусто = по этапу' },
      { name: 'createdAt', label: 'Дата создания', type: 'date' },
      { name: 'expectedCloseAt', label: 'Ожидаемое закрытие', type: 'date' },
      { name: 'nextActionAt', label: 'Следующее действие', type: 'datetime' },
      { name: 'beats', label: 'Биты', type: 'tags', col: 2, placeholder: 'названия через запятую' },
      { name: 'notes', label: 'Заметки', type: 'textarea', col: 2, placeholder: 'Что обсудили, что обещали, чего ждём' },
    ],
    extraHtml: deal
      ? `<button type="button" class="btn danger ghost" data-action="delete-deal" data-id="${esc(deal.id)}">${icon('trash', 14)} Удалить сделку</button>`
      : '',
    onSubmit(valuesOut) {
      const stage = valuesOut.stage || 'lead';
      const stageChanged = deal ? stage !== deal.stage : false;
      const probability = stageChanged
        ? stageInfo(stage).prob
        : (valuesOut.probability === null ? (deal ? deal.probability : '') : valuesOut.probability);

      const payload = {
        title: valuesOut.title,
        contactId: valuesOut.contactId || '',
        stage,
        amount: Math.max(0, Number(valuesOut.amount) || 0),
        license: valuesOut.license || 'Lease',
        source: valuesOut.source || 'Другое',
        probability: probability === undefined ? '' : probability,
        createdAt: valuesOut.createdAt || nowIso(),
        expectedCloseAt: valuesOut.expectedCloseAt || '',
        nextActionAt: valuesOut.nextActionAt || '',
        beats: valuesOut.beats || [],
        notes: valuesOut.notes || '',
      };

      if (deal) {
        if (stageChanged) {
          payload.stageHistory = [...(deal.stageHistory || []), { stage, at: nowIso() }];
          payload.closedAt = isWonStage(stage) || stage === 'lost' ? nowIso() : '';
        } else {
          payload.closedAt = deal.closedAt || '';
        }
        store.patch('deals', deal.id, payload);
        if (stageChanged && isWonStage(stage)) logPayment(deal.id, payload);
        toast('Сделка обновлена');
      } else {
        const created = newDeal(payload);
        if (isWonStage(stage) || stage === 'lost') created.closedAt = nowIso();
        store.add('deals', created);
        if (isWonStage(stage)) logPayment(created.id, { ...payload, title: created.title });
        toast('Сделка создана');
      }
    },
  });
}

function logPayment(dealId, payload) {
  store.add('activities', newActivity({
    type: 'payment',
    at: nowIso(),
    contactId: payload.contactId || '',
    dealId,
    note: `Оплата по сделке «${payload.title}» — ${money(payload.amount)}`,
  }));
}

export function moveDealToStage(dealId, stage) {
  const deal = store.state.deals.find((d) => d.id === dealId && !d.deletedAt);
  if (!deal || !stage || deal.stage === stage) return;
  if (!STAGES.some((s) => s.id === stage)) return;

  store.patch('deals', dealId, {
    stage,
    probability: stageInfo(stage).prob,
    stageHistory: [...(deal.stageHistory || []), { stage, at: nowIso() }],
    closedAt: isWonStage(stage) || stage === 'lost' ? nowIso() : '',
  });

  if (isWonStage(stage)) {
    logPayment(dealId, { ...deal, stage });
    toast(`Сделка оплачена: ${money(deal.amount)}`, 'ok');
  } else if (stage === 'lost') {
    toast('Сделка отмечена как отказ', 'info');
  } else {
    toast(`Этап: ${stageInfo(stage).label}`, 'ok');
  }
}

export function advanceDeal(dealId) {
  const deal = store.state.deals.find((d) => d.id === dealId && !d.deletedAt);
  if (!deal) return;
  moveDealToStage(dealId, nextStageOf(deal.stage));
}

/* ------------------------------------------------------------------ */
/* Tasks                                                                */
/* ------------------------------------------------------------------ */

export function openTaskForm(taskId = null, preset = {}) {
  closeModal();
  const task = taskId ? store.state.tasks.find((t) => t.id === taskId && !t.deletedAt) : null;
  const values = task
    ? { ...task }
    : {
      dueAt: defaultDueIso(),
      repeat: 'none',
      remind: true,
      ...preset,
    };

  openForm({
    title: task ? 'Редактировать задачу' : 'Новая задача',
    subtitle: 'Напоминание придёт в Telegram, если бот настроен.',
    wide: true,
    values,
    fields: [
      { name: 'title', label: 'Что сделать', type: 'text', required: true, col: 2, placeholder: 'Напомнить про оплату счёта' },
      { name: 'dueAt', label: 'Срок', type: 'datetime' },
      { name: 'repeat', label: 'Повтор', type: 'select', options: REPEAT_OPTIONS },
      { name: 'contactId', label: 'Клиент', type: 'select', options: contactOptions() },
      { name: 'dealId', label: 'Сделка', type: 'select', options: dealOptions() },
      { name: 'remind', label: 'Напомнить в Telegram', type: 'checkbox', col: 2 },
      { name: 'notes', label: 'Заметки', type: 'textarea', col: 2 },
    ],
    extraHtml: task
      ? `<button type="button" class="btn danger ghost" data-action="delete-task" data-id="${esc(task.id)}">${icon('trash', 14)} Удалить задачу</button>`
      : '',
    onSubmit(valuesOut) {
      const payload = {
        title: valuesOut.title,
        dueAt: valuesOut.dueAt || '',
        repeat: valuesOut.repeat || 'none',
        contactId: valuesOut.contactId || '',
        dealId: valuesOut.dealId || '',
        remind: Boolean(valuesOut.remind),
        notes: valuesOut.notes || '',
      };
      if (task) {
        store.patch('tasks', task.id, payload);
        toast('Задача обновлена');
      } else {
        store.add('tasks', newTask(payload));
        toast('Задача создана');
      }
    },
  });
}

function nextOccurrence(iso, repeat) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return defaultDueIso();
  const step = repeat === 'daily' ? 1 : repeat === 'weekly' ? 7 : 0;
  if (step) d.setDate(d.getDate() + step);
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  else return defaultDueIso();
  let guard = 0;
  while (d.getTime() <= Date.now() && guard < 400) {
    if (step) d.setDate(d.getDate() + step);
    else d.setMonth(d.getMonth() + 1);
    guard += 1;
  }
  return d.toISOString();
}

export function toggleTask(taskId) {
  const task = store.state.tasks.find((t) => t.id === taskId && !t.deletedAt);
  if (!task) return;

  if (task.done) {
    store.patch('tasks', taskId, { done: false, doneAt: '' });
    return;
  }

  if (task.repeat && task.repeat !== 'none') {
    const nextDue = nextOccurrence(task.dueAt, task.repeat);
    store.update((s) => {
      const current = s.tasks.find((t) => t.id === taskId);
      if (current) {
        current.done = true;
        current.doneAt = nowIso();
        current.updatedAt = nowIso();
      }
      const copy = newTask({
        id: uid('t_'),
        title: task.title,
        dueAt: nextDue,
        repeat: task.repeat,
        contactId: task.contactId,
        dealId: task.dealId,
        remind: task.remind,
        notes: task.notes,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      s.tasks.unshift(copy);
    });
    toast('Готово. Следующее повторение создано.', 'ok');
  } else {
    store.patch('tasks', taskId, { done: true, doneAt: nowIso() });
    toast('Задача выполнена', 'ok');
  }
}

/* ------------------------------------------------------------------ */
/* Beats                                                                */
/* ------------------------------------------------------------------ */

export function openBeatForm(beatId = null) {
  closeModal();
  const beat = beatId ? store.state.beats.find((b) => b.id === beatId && !b.deletedAt) : null;
  const values = beat || { status: 'available', price: '', tags: [] };

  openForm({
    title: beat ? 'Редактировать бит' : 'Новый бит',
    subtitle: 'Каталог помогает быстро собирать сделки.',
    wide: true,
    values,
    fields: [
      { name: 'title', label: 'Название', type: 'text', required: true, col: 2, placeholder: 'Neon Rain' },
      { name: 'bpm', label: 'BPM', type: 'number', min: 40, max: 300 },
      { name: 'key', label: 'Тональность', type: 'text', placeholder: 'F#m' },
      { name: 'genre', label: 'Жанр', type: 'text', placeholder: 'Trap' },
      { name: 'price', label: 'Цена', type: 'money', min: 0 },
      { name: 'status', label: 'Статус', type: 'select', options: BEAT_STATUSES.map((status) => ({ value: status.id, label: status.label })) },
      { name: 'tags', label: 'Теги', type: 'tags', placeholder: 'dark, melodic' },
      { name: 'notes', label: 'Заметки', type: 'textarea', col: 2 },
    ],
    extraHtml: beat
      ? `<button type="button" class="btn danger ghost" data-action="delete-beat" data-id="${esc(beat.id)}">${icon('trash', 14)} Удалить бит</button>`
      : '',
    onSubmit(valuesOut) {
      const payload = {
        title: valuesOut.title,
        bpm: valuesOut.bpm,
        key: valuesOut.key || '',
        genre: valuesOut.genre || '',
        price: Math.max(0, Number(valuesOut.price) || 0),
        status: valuesOut.status || 'available',
        tags: valuesOut.tags || [],
        notes: valuesOut.notes || '',
      };
      if (beat) {
        store.patch('beats', beat.id, payload);
        toast('Бит обновлён');
      } else {
        store.add('beats', newBeat(payload));
        toast('Бит добавлен');
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/* Activities                                                           */
/* ------------------------------------------------------------------ */

export function openActivityForm(activityId = null, preset = {}) {
  closeModal();
  const activity = activityId ? store.state.activities.find((a) => a.id === activityId && !a.deletedAt) : null;
  const values = activity || {
    type: 'outreach',
    at: nowIso(),
    ...preset,
  };

  openForm({
    title: activity ? 'Редактировать касание' : 'Записать касание',
    subtitle: 'Аутрич, ответ, звонок или оплата — всё в одном журнале.',
    wide: true,
    values,
    fields: [
      { name: 'type', label: 'Тип', type: 'select', options: ACTIVITY_TYPES.map((type) => ({ value: type.id, label: type.label })), required: true },
      { name: 'at', label: 'Когда', type: 'datetime', required: true },
      { name: 'contactId', label: 'Клиент', type: 'select', options: contactOptions() },
      { name: 'dealId', label: 'Сделка', type: 'select', options: dealOptions() },
      { name: 'note', label: 'Что произошло', type: 'textarea', col: 2, placeholder: 'Написал в Telegram, скинул каталог, обещал ответить завтра' },
    ],
    extraHtml: activity
      ? `<button type="button" class="btn danger ghost" data-action="delete-activity" data-id="${esc(activity.id)}">${icon('trash', 14)} Удалить запись</button>`
      : '',
    onSubmit(valuesOut) {
      const at = valuesOut.at || nowIso();
      const payload = {
        type: valuesOut.type || 'note',
        at,
        contactId: valuesOut.contactId || '',
        dealId: valuesOut.dealId || '',
        note: valuesOut.note || '',
      };
      if (activity) {
        store.patch('activities', activity.id, payload);
        toast('Запись обновлена');
      } else {
        store.add('activities', newActivity(payload));
        toast('Касание записано');
      }
      if (payload.contactId) {
        const contact = store.state.contacts.find((c) => c.id === payload.contactId && !c.deletedAt);
        if (contact && (!contact.lastContactAt || new Date(at) >= new Date(contact.lastContactAt))) {
          store.patch('contacts', contact.id, { lastContactAt: at });
        }
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/* KPIs                                                                 */
/* ------------------------------------------------------------------ */

export function openKpiForm(kpiId = null) {
  closeModal();
  const kpi = kpiId ? store.state.kpis.find((k) => k.id === kpiId && !k.deletedAt) : null;
  const values = kpi || { month: new Date().toISOString().slice(0, 7) };

  openForm({
    title: kpi ? 'Редактировать KPI' : 'Ручные KPI за месяц',
    subtitle: 'Аутрич, ответы и охваты — топливо для аналитики.',
    wide: true,
    values,
    fields: [
      { name: 'month', label: 'Месяц', type: 'month', required: true },
      { name: 'outreach', label: 'Аутрич', type: 'number', min: 0 },
      { name: 'replies', label: 'Ответы', type: 'number', min: 0 },
      { name: 'calls', label: 'Звонки', type: 'number', min: 0 },
      { name: 'plays', label: 'Прослушивания', type: 'number', min: 0 },
      { name: 'followers', label: 'Прирост подписчиков', type: 'number' },
      { name: 'adSpend', label: 'Расход на рекламу', type: 'money', min: 0 },
      { name: 'notes', label: 'Заметки', type: 'textarea', col: 2 },
    ],
    extraHtml: kpi
      ? `<button type="button" class="btn danger ghost" data-action="delete-kpi" data-id="${esc(kpi.id)}">${icon('trash', 14)} Удалить</button>`
      : '',
    onSubmit(valuesOut) {
      const payload = {
        month: valuesOut.month || new Date().toISOString().slice(0, 7),
        outreach: Math.max(0, Number(valuesOut.outreach) || 0),
        replies: Math.max(0, Number(valuesOut.replies) || 0),
        calls: Math.max(0, Number(valuesOut.calls) || 0),
        plays: Math.max(0, Number(valuesOut.plays) || 0),
        followers: Math.max(0, Number(valuesOut.followers) || 0),
        adSpend: Math.max(0, Number(valuesOut.adSpend) || 0),
        notes: valuesOut.notes || '',
      };
      if (kpi) {
        store.patch('kpis', kpi.id, payload);
        toast('KPI обновлены');
      } else {
        store.add('kpis', newKpi(payload));
        toast('KPI сохранены');
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/* Delete                                                               */
/* ------------------------------------------------------------------ */

async function deleteEntity({ collection, id, title, message, label = 'Запись' }) {
  closeModal();
  const ok = await confirmDialog({
    title,
    message,
    confirmText: 'Удалить',
    onConfirm: () => {
      store.remove(collection, id);
    },
  });
  if (ok) toast(`${label}: удалено`, 'ok');
}

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */

function formNumber(fd, name, fallback) {
  const raw = fd.get(name);
  if (raw === null || String(raw).trim() === '') return fallback;
  const value = Number(String(raw).replace(',', '.'));
  return Number.isFinite(value) ? value : fallback;
}

export function submitSettingsForm(form) {
  const type = form.dataset.form;
  const fd = new FormData(form);

  if (type === 'profile') {
    store.patchSettings({
      artistName: String(fd.get('artistName') || '').trim(),
      ownerName: String(fd.get('ownerName') || '').trim(),
      currency: String(fd.get('currency') || 'USD').toUpperCase(),
      theme: String(fd.get('theme') || 'dark'),
      timezone: String(fd.get('timezone') || 'UTC').trim() || 'UTC',
    });
    toast('Профиль сохранён');
    return;
  }

  if (type === 'telegram') {
    saveDevice({ botToken: String(fd.get('botToken') || '').trim() });
    store.patchSettings({
      telegramChatId: String(fd.get('telegramChatId') || '').trim(),
      remindAhead: clamp(formNumber(fd, 'remindAhead', 60), 0, 10080),
      digestHour: clamp(formNumber(fd, 'digestHour', 9), 0, 23),
      digestEnabled: fd.get('digestEnabled') === 'on',
    });
    toast('Настройки Telegram сохранены');
    return;
  }

  if (type === 'sync') {
    const patch = {};
    if (fd.has('token')) patch.token = String(fd.get('token') || '').trim();
    if (fd.has('gistId')) patch.gistId = String(fd.get('gistId') || '').trim();
    if (fd.has('autoSync')) patch.autoSync = fd.get('autoSync') === 'on';
    saveSyncConfig(patch);
    toast('Ключи сохранены');
    return;
  }

  if (type === 'repo') {
    store.patchSettings({ repoUrl: String(fd.get('repoUrl') || '').trim().replace(/\/+$/, '') });
    toast('Ссылка сохранена');
  }
}

function readSyncForm() {
  const form = document.querySelector('form[data-form="sync"]');
  if (form) {
    const fd = new FormData(form);
    const patch = {};
    if (fd.has('token')) patch.token = String(fd.get('token') || '').trim();
    if (fd.has('gistId')) patch.gistId = String(fd.get('gistId') || '').trim();
    if (fd.has('autoSync')) patch.autoSync = fd.get('autoSync') === 'on';
    saveSyncConfig(patch);
  }
  return getSyncConfig();
}

function readTelegramForm() {
  const form = document.querySelector('form[data-form="telegram"]');
  if (form) {
    const fd = new FormData(form);
    saveDevice({ botToken: String(fd.get('botToken') || '').trim() });
    store.patchSettings({
      telegramChatId: String(fd.get('telegramChatId') || '').trim(),
      remindAhead: clamp(formNumber(fd, 'remindAhead', 60), 0, 10080),
      digestHour: clamp(formNumber(fd, 'digestHour', 9), 0, 23),
      digestEnabled: fd.get('digestEnabled') === 'on',
    }, { touch: true });
  }
}

async function telegramApi(method, payload) {
  const token = String(getDevice().botToken || '').trim();
  if (!token) throw new Error('Сначала сохрани токен бота');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    throw new Error(`Telegram ответил ${res.status}`);
  }
  if (!data.ok) throw new Error(data.description || `Telegram ответил ${res.status}`);
  return data.result;
}

/* ------------------------------------------------------------------ */
/* Report preview                                                       */
/* ------------------------------------------------------------------ */

function openReportPreview({ title, subtitle, text, filename, mime = 'text/markdown;charset=utf-8' }) {
  closeModal();
  const html = `
    <header class="modal-head">
      <div><h3>${esc(title)}</h3><p>${esc(subtitle || '')}</p></div>
      <button class="icon-btn" data-close aria-label="Закрыть">✕</button>
    </header>
    <pre class="report-pre">${esc(text)}</pre>
    <footer class="modal-foot">
      <button class="btn ghost" data-close>Закрыть</button>
      <button class="btn" data-copy-report>${icon('copy', 14)} Копировать</button>
      <button class="btn primary" data-download-report>${icon('download', 14)} Скачать</button>
    </footer>`;

  openModal(html, {
    wide: true,
    onMount(panel) {
      panel.querySelector('[data-copy-report]')?.addEventListener('click', async () => {
        const ok = await copyText(text);
        toast(ok ? 'Отчёт скопирован' : 'Не удалось скопировать', ok ? 'ok' : 'error');
      });
      panel.querySelector('[data-download-report]')?.addEventListener('click', () => {
        downloadFile(filename, text, mime);
        toast('Файл скачан');
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Action registry                                                      */
/* ------------------------------------------------------------------ */

export const actions = {
  'add-contact': () => openContactForm(),
  'edit-contact': (el) => openContactForm(el.dataset.id),
  'view-contact': (el) => openContactCard(el.dataset.id),
  'delete-contact': (el) => deleteEntity({
    collection: 'contacts',
    id: el.dataset.id,
    title: 'Удалить контакт?',
    message: 'Сделки и задачи останутся, но потеряют связь с этим контактом.',
    label: 'Контакт',
  }),

  'add-deal': () => openDealForm(),
  'edit-deal': (el) => openDealForm(el.dataset.id),
  'delete-deal': (el) => deleteEntity({
    collection: 'deals',
    id: el.dataset.id,
    title: 'Удалить сделку?',
    message: 'Задачи и активности останутся, но сделка исчезнет из воронки и аналитики.',
    label: 'Сделка',
  }),
  'advance-deal': (el) => advanceDeal(el.dataset.id),
  'set-stage': (el) => moveDealToStage(el.dataset.id, el.value),
  'add-deal-contact': (el) => {
    closeModal();
    openDealForm(null, { contactId: el.dataset.id });
  },

  'add-task': () => openTaskForm(),
  'edit-task': (el) => openTaskForm(el.dataset.id),
  'toggle-task': (el) => toggleTask(el.dataset.id),
  'delete-task': (el) => deleteEntity({
    collection: 'tasks',
    id: el.dataset.id,
    title: 'Удалить задачу?',
    message: 'Напоминание больше не придёт в Telegram.',
    label: 'Задача',
  }),
  'add-task-contact': (el) => {
    closeModal();
    openTaskForm(null, { contactId: el.dataset.id });
  },

  'add-beat': () => openBeatForm(),
  'edit-beat': (el) => openBeatForm(el.dataset.id),
  'delete-beat': (el) => deleteEntity({
    collection: 'beats',
    id: el.dataset.id,
    title: 'Удалить бит?',
    message: 'Сделки, где он указан, останутся без изменений.',
    label: 'Бит',
  }),
  'beat-to-deal': (el) => {
    const beat = store.state.beats.find((b) => b.id === el.dataset.id && !b.deletedAt);
    if (!beat) return;
    openDealForm(null, {
      title: `Лицензия «${beat.title}»`,
      amount: beat.price || '',
      license: beat.status === 'sold' ? 'Exclusive' : 'Lease',
      beats: [beat.title],
      notes: beat.notes || '',
    });
  },

  'add-activity': () => openActivityForm(),
  'edit-activity': (el) => openActivityForm(el.dataset.id),
  'add-activity-contact': (el) => {
    closeModal();
    openActivityForm(null, { contactId: el.dataset.id });
  },
  'delete-activity': (el) => deleteEntity({
    collection: 'activities',
    id: el.dataset.id,
    title: 'Удалить запись?',
    message: 'Она исчезнет из журнала и аналитики активности.',
    label: 'Запись',
  }),

  'add-kpi': () => openKpiForm(),
  'edit-kpi': (el) => openKpiForm(el.dataset.id),
  'delete-kpi': (el) => deleteEntity({
    collection: 'kpis',
    id: el.dataset.id,
    title: 'Удалить KPI?',
    message: 'Месяц исчезнет из ручной статистики.',
    label: 'KPI',
  }),

  'set-deal-view': (el) => {
    getUi().dealView = el.dataset.view === 'table' ? 'table' : 'board';
    rerender();
  },
  'set-task-filter': (el) => {
    getUi().taskFilter = el.dataset.value || 'open';
    rerender();
  },
  'set-journal-filter': (el) => {
    getUi().journalType = el.dataset.value || 'all';
    rerender();
  },
  'toggle-theme': () => {
    store.patchSettings({ theme: store.settings.theme === 'light' ? 'dark' : 'light' }, { touch: false });
  },

  'load-demo': async () => {
    const ok = await confirmDialog({
      title: 'Загрузить демо-данные?',
      message: 'Текущие сделки, клиенты и задачи будут заменены демонстрационным набором.',
      confirmText: 'Загрузить демо',
      danger: false,
    });
    if (!ok) return;
    store.replace(buildDemoState());
    queueSync(200);
    toast('Демо-данные загружены', 'ok');
    navigate('#/dashboard');
  },

  'reset-data': async () => {
    const ok = await confirmDialog({
      title: 'Удалить все данные?',
      message: 'Это очистит сделки, клиентов, задачи, каталог и KPI. Если включена синхронизация, пустое состояние уйдёт в Gist.',
      confirmText: 'Удалить всё',
    });
    if (!ok) return;
    store.reset();
    toast('Данные очищены', 'ok');
    navigate('#/dashboard');
  },

  'export-csv': (el) => {
    const type = el.dataset.type || 'deals';
    const content = buildCsv(store.state, type);
    downloadFile(buildFilename(type, 'csv'), content, 'text/csv;charset=utf-8');
    toast(`CSV (${type}) скачан`);
  },
  'download-backup': () => {
    downloadFile(buildFilename('backup', 'json'), buildBackup(store.state), 'application/json;charset=utf-8');
    toast('Резервная копия скачана');
  },
  'import-backup': () => {
    document.getElementById('import-file')?.click();
  },
  'ai-report': () => {
    const preset = getUi().analyticsPeriod || 'month';
    const text = buildAiReport(store.state, preset);
    openReportPreview({
      title: 'AI-отчёт',
      subtitle: 'Markdown: показатели, воронка, риски и готовый промпт',
      text,
      filename: buildFilename('report', 'md'),
    });
  },
  'ai-json': () => {
    const preset = getUi().analyticsPeriod || 'month';
    const data = buildAiJson(store.state, preset);
    downloadFile(buildFilename('ai', 'json'), JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    toast('JSON для ИИ скачан');
  },
  'copy-prompt': async () => {
    const ok = await copyText(aiPrompt(store.state));
    toast(ok ? 'Промпт скопирован' : 'Не удалось скопировать', ok ? 'ok' : 'error');
  },
  'copy-app-url': async () => {
    const url = appBaseUrl();
    const ok = url ? await copyText(url) : false;
    toast(ok ? 'URL приложения скопирован' : 'Не удалось скопировать URL', ok ? 'ok' : 'error');
  },

  'sync-now': async () => {
    readSyncForm();
    if (!syncConfigured()) {
      toast('Сначала подключи Gist в настройках', 'error');
      return;
    }
    const ok = await syncNow({ silent: false });
    if (ok) toast('Синхронизировано', 'ok');
  },
  'verify-token': async () => {
    readSyncForm();
    try {
      const login = await verifyToken();
      toast(`Токен работает: @${login}`, 'ok');
      rerender();
    } catch (error) {
      toast(error.message, 'error');
    }
  },
  'find-gist': async () => {
    readSyncForm();
    try {
      const id = await findGist();
      toast(`Gist найден: ${id}`, 'ok');
      await syncNow({ silent: true });
      rerender();
    } catch (error) {
      toast(error.message, 'error');
    }
  },
  'create-gist': async () => {
    const cfg = readSyncForm();
    if (!cfg.token) {
      toast('Сначала укажи GitHub-токен', 'error');
      return;
    }
    if (cfg.gistId) {
      const ok = await confirmDialog({
        title: 'Создать новый Gist?',
        message: 'Текущий Gist останется в аккаунте, но приложение переключится на новый. Старые данные не перенесутся.',
        confirmText: 'Создать новый',
        danger: false,
      });
      if (!ok) return;
    }
    try {
      const id = await createGist();
      toast(`Gist создан: ${id}`, 'ok');
      rerender();
    } catch (error) {
      toast(error.message, 'error');
    }
  },
  'disconnect-sync': async () => {
    const ok = await confirmDialog({
      title: 'Отключить синхронизацию?',
      message: 'Данные останутся в браузере, но перестанут синхронизироваться. Токен будет удалён с устройства.',
      confirmText: 'Отключить',
    });
    if (!ok) return;
    disconnectSync();
    toast('Синхронизация отключена', 'ok');
    rerender();
  },

  'test-telegram': async () => {
    try {
      readTelegramForm();
      const chatId = store.settings.telegramChatId;
      if (!chatId) throw new Error('Укажи chat ID');
      const appUrl = appBaseUrl();
      const withAppButton = location.protocol === 'https:'
        && appUrl
        && !String(chatId).startsWith('-');
      await telegramApi('sendMessage', {
        chat_id: chatId,
        text: `✅ <b>Producer Sales Helper</b>\nСвязь работает. Напоминания и сводки будут приходить сюда.`,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(withAppButton ? {
          reply_markup: {
            inline_keyboard: [[{ text: '📱 Открыть приложение', web_app: { url: appUrl } }]],
          },
        } : {}),
      });
      toast('Сообщение отправлено в Telegram', 'ok');
    } catch (error) {
      toast(error.message, 'error');
    }
  },
  'detect-chat': async () => {
    try {
      readTelegramForm();
      const updates = await telegramApi('getUpdates', { limit: 10, timeout: 0 });
      const messages = (updates || []).filter((u) => u.message?.chat?.id);
      const last = messages[messages.length - 1];
      if (!last) throw new Error('Напиши боту /start в Telegram и попробуй снова');
      const chatId = String(last.message.chat.id);
      store.patchSettings({ telegramChatId: chatId });
      toast(`Chat ID: ${chatId}`, 'ok');
      rerender();
    } catch (error) {
      toast(`${error.message}. Если у бота установлен webhook — удали его.`, 'error');
    }
  },

  'install-app': async () => {
    const prompt = window.__pshInstallPrompt;
    if (prompt) {
      prompt.prompt();
      try {
        await prompt.userChoice;
      } catch { /* ignore */ }
      window.__pshInstallPrompt = null;
      return;
    }
    toast('Открой меню браузера и выбери «Установить приложение» или «На главный экран».', 'info');
  },
};

export function runAction(name, element, event) {
  const handler = actions[name];
  if (!handler) {
    console.warn('Unknown action:', name);
    return;
  }
  try {
    const result = handler(element, event);
    if (result && typeof result.catch === 'function') {
      result.catch((error) => {
        console.error(error);
        toast(error.message || 'Что-то пошло не так', 'error');
      });
    }
  } catch (error) {
    console.error(error);
    toast(error.message || 'Что-то пошло не так', 'error');
  }
}

export async function importBackupFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const ok = await confirmDialog({
      title: 'Импортировать резервную копию?',
      message: 'Текущие данные на этом устройстве будут заменены содержимым файла.',
      confirmText: 'Импортировать',
      danger: false,
    });
    if (!ok) return;
    store.importState(parsed);
    toast('Данные импортированы', 'ok');
    navigate('#/dashboard');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Не удалось прочитать файл', 'error');
  }
}
