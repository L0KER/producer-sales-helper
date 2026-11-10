import { emptyState, normalizeState } from './store.js';
import { monthKey, toDateInput } from './util.js';

function iso(daysAgo, hour = 12, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function at(daysAgo, hour, minute = 0) {
  return iso(daysAgo, hour, minute);
}

function monthStartKey(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return monthKey(d);
}

function path(createdIso, stage, closedIso = null) {
  const order = ['lead', 'contacted', 'negotiation', 'invoice', 'paid'];
  const isLost = stage === 'lost';
  const isDelivered = stage === 'delivered';
  const target = isLost ? 'invoice' : isDelivered ? 'paid' : stage;
  const index = Math.max(0, order.indexOf(target));
  const start = new Date(createdIso).getTime();
  const end = new Date(closedIso || Date.now()).getTime();
  const span = Math.max(86400000, end - start);
  const rows = [];
  for (let i = 0; i <= index; i += 1) {
    const ratio = index === 0 ? 0 : i / index;
    rows.push({ stage: order[i], at: new Date(start + span * ratio).toISOString() });
  }
  if (isLost) rows.push({ stage: 'lost', at: closedIso || new Date().toISOString() });
  if (isDelivered) rows.push({ stage: 'delivered', at: closedIso || new Date().toISOString() });
  return rows;
}

function deal(id, values) {
  const created = values.createdAt;
  const closed = values.closedAt || '';
  const stageHistory = path(created, values.stage, closed || null);
  const last = stageHistory[stageHistory.length - 1];
  return {
    id,
    title: values.title,
    contactId: values.contactId,
    stage: values.stage,
    amount: values.amount,
    license: values.license || 'Lease',
    source: values.source || 'Telegram',
    probability: values.probability,
    createdAt: created,
    expectedCloseAt: values.expectedCloseAt || '',
    closedAt: closed,
    nextActionAt: values.nextActionAt || '',
    beats: values.beats || [],
    notes: values.notes || '',
    stageHistory,
    updatedAt: last?.at || created,
    deletedAt: null,
  };
}

export function buildDemoState() {
  const s = emptyState();
  const now = Date.now();
  s.updatedAt = new Date(now).toISOString();
  s.settings = {
    ...s.settings,
    artistName: 'NOVA BEATS',
    ownerName: 'Егор',
    currency: 'USD',
    timezone: 'Europe/Moscow',
    theme: 'dark',
    updatedAt: new Date(now).toISOString(),
  };

  s.contacts = [
    {
      id: 'c_lila', name: 'Lila Rose', role: 'Артист', handle: '@lilarose', email: 'lila@rose.fm',
      country: 'Латвия', source: 'Instagram', tags: ['r&b', 'vip'], notes: 'Любит тёмные мелодичные биты. Отвечает в Telegram быстрее, чем на почту.',
      lastContactAt: iso(1, 18), createdAt: iso(210), updatedAt: iso(1, 18), deletedAt: null,
    },
    {
      id: 'c_nord', name: 'Nord Records', role: 'Лейбл', handle: '@nordrecords', email: 'demo@nordrecords.com',
      country: 'Германия', source: 'Email', tags: ['лейбл', 'эксклюзив'], notes: 'Подписывают артистов на лицензии. Нужен счёт и договор.',
      lastContactAt: iso(6, 11), createdAt: iso(320), updatedAt: iso(6, 11), deletedAt: null,
    },
    {
      id: 'c_granite', name: 'MC Granite', role: 'Артист', handle: '@mcgranite', email: '',
      country: 'Казахстан', source: 'Telegram', tags: ['trap', 'постоянный'], notes: 'Берёт лизы каждый месяц. Идеальный кандидат на подписку.',
      lastContactAt: iso(0, 10), createdAt: iso(150), updatedAt: iso(0, 10), deletedAt: null,
    },
    {
      id: 'c_kira', name: 'Kira Wave', role: 'Артист', handle: '@kirawave', email: 'kira.wave@gmail.com',
      country: 'Польша', source: 'BeatStars', tags: ['pop', 'exclusive'], notes: 'Хочет эксклюзив на «Neon Rain». Ждёт счёт.',
      lastContactAt: iso(2, 16), createdAt: iso(45), updatedAt: iso(2, 16), deletedAt: null,
    },
    {
      id: 'c_silent', name: 'Silent J', role: 'Артист', handle: '@silentj', email: '',
      country: 'США', source: 'YouTube', tags: ['boom bap'], notes: 'Познакомились в комментариях под бит-видео.',
      lastContactAt: iso(9, 20), createdAt: iso(30), updatedAt: iso(9, 20), deletedAt: null,
    },
    {
      id: 'c_dima', name: 'Дима (менеджер Ayo)', role: 'Менеджер', handle: '@dima_mgmt', email: 'dima@mgmt.co',
      country: 'Россия', source: 'Сарафанное радио', tags: ['менеджер'], notes: 'Ведёт трёх артистов. Просил пакет из 5 битов.',
      lastContactAt: iso(4, 13), createdAt: iso(80), updatedAt: iso(4, 13), deletedAt: null,
    },
    {
      id: 'c_beathub', name: 'BeatHub Blog', role: 'Блогер', handle: '@beathub', email: 'hi@beathub.io',
      country: 'Нидерланды', source: 'Email', tags: ['медиа'], notes: 'Обзор каталога. Дал охват ~12k.',
      lastContactAt: iso(22, 12), createdAt: iso(200), updatedAt: iso(22, 12), deletedAt: null,
    },
    {
      id: 'c_ayo', name: 'Ayo', role: 'Артист', handle: '@ayo', email: '',
      country: 'Франция', source: 'Discord', tags: ['drill'], notes: 'Пропал после обсуждения цены. Можно вернуть через месяц.',
      lastContactAt: iso(55, 19), createdAt: iso(120), updatedAt: iso(55, 19), deletedAt: null,
    },
  ];

  s.beats = [
    { id: 'b_1', title: 'Neon Rain', bpm: 140, key: 'F#m', genre: 'Trap', tags: ['dark', 'melodic'], price: 700, status: 'reserved', notes: 'Главный кандидат на эксклюзив для Kira Wave.', createdAt: iso(60), updatedAt: iso(2), deletedAt: null },
    { id: 'b_2', title: 'Midnight Drive', bpm: 128, key: 'Am', genre: 'R&B', tags: ['smooth', 'night'], price: 550, status: 'sold', notes: 'Продан Lila Rose (эксклюзив).', createdAt: iso(190), updatedAt: iso(60), deletedAt: null },
    { id: 'b_3', title: 'Granite', bpm: 150, key: 'Gm', genre: 'Trap', tags: ['hard', '808'], price: 350, status: 'leased', notes: '', createdAt: iso(90), updatedAt: iso(10), deletedAt: null },
    { id: 'b_4', title: 'Golden Hour', bpm: 95, key: 'C', genre: 'Boom Bap', tags: ['sample', 'warm'], price: 250, status: 'available', notes: '', createdAt: iso(75), updatedAt: iso(75), deletedAt: null },
    { id: 'b_5', title: 'Afterparty', bpm: 124, key: 'Dm', genre: 'House', tags: ['club', 'energy'], price: 300, status: 'available', notes: '', createdAt: iso(40), updatedAt: iso(40), deletedAt: null },
    { id: 'b_6', title: 'Cold Summer', bpm: 132, key: 'Bm', genre: 'Drill', tags: ['sliding', 'dark'], price: 280, status: 'available', notes: '', createdAt: iso(28), updatedAt: iso(28), deletedAt: null },
    { id: 'b_7', title: 'Slow Motion', bpm: 88, key: 'Eb', genre: 'R&B', tags: ['sexy', 'late night'], price: 200, status: 'leased', notes: '', createdAt: iso(15), updatedAt: iso(4), deletedAt: null },
    { id: 'b_8', title: 'Blueprint', bpm: 144, key: 'C#m', genre: 'Trap', tags: ['motivational'], price: 650, status: 'available', notes: '', createdAt: iso(7), updatedAt: iso(7), deletedAt: null },
  ];

  s.deals = [
    deal('d_1', {
      title: 'Эксклюзив «Midnight Drive»', contactId: 'c_lila', stage: 'paid', amount: 900, license: 'Exclusive',
      source: 'Instagram', probability: 100, createdAt: iso(200, 10), closedAt: iso(5, 15),
      beats: ['Midnight Drive'], notes: 'Оплата прошла, договор подписан. Нужно отдать стемы.',
    }),
    deal('d_2', {
      title: 'Лицензия на «Granite»', contactId: 'c_granite', stage: 'paid', amount: 120, license: 'Lease',
      source: 'Telegram', probability: 100, createdAt: iso(24, 11), closedAt: iso(1, 12),
      beats: ['Granite'], notes: 'Повторный клиент, скидка 10%.',
    }),
    deal('d_3', {
      title: 'BeatStars lease — Golden Hour', contactId: '', stage: 'paid', amount: 80, license: 'Lease',
      source: 'BeatStars', probability: 100, createdAt: iso(12, 9), closedAt: iso(0, 9),
      beats: ['Golden Hour'], notes: 'Автоматическая продажа с BeatStars.',
    }),
    deal('d_4', {
      title: 'Эксклюзив «Neon Rain»', contactId: 'c_kira', stage: 'invoice', amount: 700, license: 'Exclusive',
      source: 'BeatStars', probability: 80, createdAt: iso(18, 14), closedAt: '',
      expectedCloseAt: toDateInput(new Date(Date.now() + 5 * 86400000)), nextActionAt: at(0, 17),
      beats: ['Neon Rain'], notes: 'Счёт отправлен, ждём оплату до пятницы.',
    }),
    deal('d_5', {
      title: 'Пакет из 5 битов для Ayo', contactId: 'c_dima', stage: 'negotiation', amount: 500, license: 'Bundle',
      source: 'Сарафанное радио', probability: 55, createdAt: iso(9, 16), closedAt: '',
      nextActionAt: at(-1, 11), beats: ['Cold Summer', 'Blueprint'], notes: 'Просит скидку за объём. Обсуждаем 450.',
    }),
    deal('d_6', {
      title: 'Лицензия «Slow Motion»', contactId: 'c_silent', stage: 'contacted', amount: 250, license: 'Lease',
      source: 'YouTube', probability: 30, createdAt: iso(6, 19), closedAt: '',
      nextActionAt: at(1, 12), beats: ['Slow Motion'], notes: 'Ответил на демо, попросил ещё варианты.',
    }),
    deal('d_7', {
      title: 'Синк для Nord Records', contactId: 'c_nord', stage: 'negotiation', amount: 1400, license: 'Custom',
      source: 'Email', probability: 45, createdAt: iso(21, 10), closedAt: '',
      nextActionAt: at(2, 10), beats: ['Afterparty', 'Neon Rain'], notes: 'Нужен договор на неисключительный синк. Согласовывают бюджет.',
    }),
    deal('d_8', {
      title: 'Эксклюзив «Blueprint»', contactId: 'c_dima', stage: 'lead', amount: 650, license: 'Exclusive',
      source: 'Telegram', probability: 10, createdAt: iso(2, 21), closedAt: '',
      nextActionAt: at(0, 15), beats: ['Blueprint'], notes: 'Написал в личку, ждём ответа.',
    }),
    deal('d_9', {
      title: 'Лицензия для микстейпа', contactId: 'c_ayo', stage: 'lost', amount: 300, license: 'Lease',
      source: 'Discord', probability: 0, createdAt: iso(110, 18), closedAt: iso(55, 18),
      beats: ['Granite'], notes: 'Ушёл к другому продюсеру из-за цены.',
    }),
    deal('d_10', {
      title: 'Лицензия «Afterparty»', contactId: 'c_beathub', stage: 'paid', amount: 220, license: 'Lease',
      source: 'Email', probability: 100, createdAt: iso(50, 10), closedAt: iso(32, 14),
      beats: ['Afterparty'], notes: 'Оплата после обзора каталога.',
    }),
    deal('d_11', {
      title: 'Эксклюзив «Golden Hour»', contactId: 'c_nord', stage: 'delivered', amount: 480, license: 'Exclusive',
      source: 'Email', probability: 100, createdAt: iso(95, 13), closedAt: iso(34, 15),
      beats: ['Golden Hour'], notes: 'Сдан, стемы отправлены. Довольны.',
    }),
    deal('d_12', {
      title: 'Лицензия на «Cold Summer»', contactId: 'c_granite', stage: 'lost', amount: 180, license: 'Lease',
      source: 'Telegram', probability: 0, createdAt: iso(70, 12), closedAt: iso(38, 12),
      beats: ['Cold Summer'], notes: 'Не подошёл темп, взял другой бит.',
    }),
    deal('d_13', {
      title: 'Эксклюзив «Neon Rain» (резерв)', contactId: 'c_lila', stage: 'lead', amount: 800, license: 'Exclusive',
      source: 'Telegram', probability: 15, createdAt: iso(4, 11), closedAt: '',
      nextActionAt: at(3, 12), beats: ['Neon Rain'], notes: 'Хочет послушать расширенную версию.',
    }),
    deal('d_14', {
      title: 'Лицензия «Blueprint» (TikTok)', contactId: 'c_silent', stage: 'invoice', amount: 320, license: 'Lease',
      source: 'YouTube', probability: 70, createdAt: iso(16, 17), closedAt: '',
      nextActionAt: at(2, 15), beats: ['Blueprint'], notes: 'Счёт отправлен на почту.',
    }),
  ];

  s.tasks = [
    { id: 't_1', title: 'Напомнить Kira Wave про оплату счёта', dueAt: at(0, 17), repeat: 'none', contactId: 'c_kira', dealId: 'd_4', remind: true, done: false, doneAt: '', notes: 'Счёт ушёл 2 дня назад.', createdAt: iso(2), updatedAt: iso(2), deletedAt: null },
    { id: 't_2', title: 'Отправить стемы Lila Rose', dueAt: at(0, 20), repeat: 'none', contactId: 'c_lila', dealId: 'd_1', remind: true, done: false, doneAt: '', notes: '', createdAt: iso(1), updatedAt: iso(1), deletedAt: null },
    { id: 't_3', title: 'Фоллоу-ап с Nord Records по синку', dueAt: at(1, 10), repeat: 'none', contactId: 'c_nord', dealId: 'd_7', remind: true, done: false, doneAt: '', notes: 'Уточнить бюджет и сроки.', createdAt: iso(3), updatedAt: iso(3), deletedAt: null },
    { id: 't_4', title: 'Скинуть 3 бита Silent J', dueAt: at(2, 12), repeat: 'none', contactId: 'c_silent', dealId: 'd_6', remind: true, done: false, doneAt: '', notes: '', createdAt: iso(2), updatedAt: iso(2), deletedAt: null },
    { id: 't_5', title: 'Выложить бит «Blueprint» в TikTok', dueAt: at(3, 18), repeat: 'weekly', contactId: '', dealId: '', remind: true, done: false, doneAt: '', notes: 'Ролик + ссылка в шапке.', createdAt: iso(7), updatedAt: iso(7), deletedAt: null },
    { id: 't_6', title: 'Проверить статистику BeatStars за месяц', dueAt: at(6, 11), repeat: 'monthly', contactId: '', dealId: '', remind: true, done: false, doneAt: '', notes: '', createdAt: iso(20), updatedAt: iso(20), deletedAt: null },
    { id: 't_7', title: 'Вернуть Ayo через месяц', dueAt: at(14, 12), repeat: 'none', contactId: 'c_ayo', dealId: '', remind: true, done: false, doneAt: '', notes: 'Предложить 2 бита бесплатно на тест.', createdAt: iso(10), updatedAt: iso(10), deletedAt: null },
    { id: 't_8', title: 'Собрать пакет для Димы', dueAt: at(-2, 15), repeat: 'none', contactId: 'c_dima', dealId: 'd_5', remind: true, done: false, doneAt: '', notes: '5 битов + прайс.', createdAt: iso(7), updatedAt: iso(7), deletedAt: null },
    { id: 't_9', title: 'Обновить шапку Telegram-канала', dueAt: at(4, 14), repeat: 'none', contactId: '', dealId: '', remind: false, done: true, doneAt: iso(1, 14), notes: '', createdAt: iso(9), updatedAt: iso(1), deletedAt: null },
    { id: 't_10', title: 'Добавить 5 битов в каталог BeatStars', dueAt: at(9, 16), repeat: 'none', contactId: '', dealId: '', remind: true, done: false, doneAt: '', notes: '', createdAt: iso(11), updatedAt: iso(11), deletedAt: null },
  ];

  s.activities = [
    { id: 'a_1', type: 'payment', at: iso(0, 9), contactId: '', dealId: 'd_3', note: 'BeatStars lease: Golden Hour — $80', createdAt: iso(0, 9), updatedAt: iso(0, 9), deletedAt: null },
    { id: 'a_2', type: 'reply', at: iso(0, 10), contactId: 'c_granite', dealId: 'd_2', note: 'Скинул реквизиты, оплата прошла', createdAt: iso(0, 10), updatedAt: iso(0, 10), deletedAt: null },
    { id: 'a_3', type: 'outreach', at: iso(1, 15), contactId: 'c_dima', dealId: 'd_5', note: 'Отправил пакет из 5 битов + условия', createdAt: iso(1, 15), updatedAt: iso(1, 15), deletedAt: null },
    { id: 'a_4', type: 'outreach', at: iso(2, 18), contactId: 'c_nord', dealId: 'd_7', note: 'Напомнил про синк, обещали ответить', createdAt: iso(2, 18), updatedAt: iso(2, 18), deletedAt: null },
    { id: 'a_5', type: 'call', at: iso(3, 13), contactId: 'c_kira', dealId: 'd_4', note: 'Обсудили условия эксклюзива, готовы брать', createdAt: iso(3, 13), updatedAt: iso(3, 13), deletedAt: null },
    { id: 'a_6', type: 'outreach', at: iso(4, 12), contactId: 'c_lila', dealId: 'd_13', note: 'Скинул расширенную версию Neon Rain', createdAt: iso(4, 12), updatedAt: iso(4, 12), deletedAt: null },
    { id: 'a_7', type: 'payment', at: iso(5, 15), contactId: 'c_lila', dealId: 'd_1', note: 'Эксклюзив Midnight Drive — $900', createdAt: iso(5, 15), updatedAt: iso(5, 15), deletedAt: null },
    { id: 'a_8', type: 'reply', at: iso(5, 17), contactId: 'c_lila', dealId: 'd_1', note: 'Подтвердила получение договора', createdAt: iso(5, 17), updatedAt: iso(5, 17), deletedAt: null },
    { id: 'a_9', type: 'outreach', at: iso(6, 19), contactId: 'c_silent', dealId: 'd_6', note: 'Ответил на комментарий, скинул каталог', createdAt: iso(6, 19), updatedAt: iso(6, 19), deletedAt: null },
    { id: 'a_10', type: 'outreach', at: iso(8, 11), contactId: 'c_kira', dealId: 'd_4', note: 'Первый контакт через BeatStars', createdAt: iso(8, 11), updatedAt: iso(8, 11), deletedAt: null },
    { id: 'a_11', type: 'outreach', at: iso(10, 16), contactId: 'c_granite', dealId: '', note: 'Предложил подписку на лизы', createdAt: iso(10, 16), updatedAt: iso(10, 16), deletedAt: null },
    { id: 'a_12', type: 'reply', at: iso(11, 18), contactId: 'c_granite', dealId: '', note: 'Интересно, просит подробности', createdAt: iso(11, 18), updatedAt: iso(11, 18), deletedAt: null },
    { id: 'a_13', type: 'payment', at: iso(32, 14), contactId: 'c_beathub', dealId: 'd_10', note: 'Лицензия Afterparty — $220', createdAt: iso(32, 14), updatedAt: iso(32, 14), deletedAt: null },
    { id: 'a_14', type: 'outreach', at: iso(35, 12), contactId: 'c_beathub', dealId: '', note: 'Спасибо за обзор, предложил коллаборацию', createdAt: iso(35, 12), updatedAt: iso(35, 12), deletedAt: null },
    { id: 'a_15', type: 'note', at: iso(38, 12), contactId: 'c_granite', dealId: 'd_12', note: 'Отказ: не подошёл темп Cold Summer', createdAt: iso(38, 12), updatedAt: iso(38, 12), deletedAt: null },
    { id: 'a_16', type: 'outreach', at: iso(41, 10), contactId: 'c_nord', dealId: 'd_7', note: 'Отправил каталог и прайс на синк', createdAt: iso(41, 10), updatedAt: iso(41, 10), deletedAt: null },
    { id: 'a_17', type: 'call', at: iso(48, 15), contactId: 'c_dima', dealId: 'd_5', note: 'Созвон 20 минут, обсудили пакет', createdAt: iso(48, 15), updatedAt: iso(48, 15), deletedAt: null },
    { id: 'a_18', type: 'payment', at: iso(34, 15), contactId: 'c_nord', dealId: 'd_11', note: 'Эксклюзив Golden Hour — $480', createdAt: iso(34, 15), updatedAt: iso(34, 15), deletedAt: null },
  ];

  s.kpis = [
    { id: 'k_1', month: monthStartKey(-3), outreach: 96, replies: 21, calls: 4, plays: 8200, followers: 1830, adSpend: 40, notes: '', createdAt: iso(100), updatedAt: iso(100), deletedAt: null },
    { id: 'k_2', month: monthStartKey(-2), outreach: 118, replies: 29, calls: 6, plays: 10400, followers: 2110, adSpend: 60, notes: '', createdAt: iso(70), updatedAt: iso(70), deletedAt: null },
    { id: 'k_3', month: monthStartKey(-1), outreach: 141, replies: 38, calls: 9, plays: 13700, followers: 2540, adSpend: 75, notes: '', createdAt: iso(40), updatedAt: iso(40), deletedAt: null },
    { id: 'k_4', month: monthStartKey(0), outreach: 88, replies: 27, calls: 6, plays: 9600, followers: 2830, adSpend: 50, notes: 'Фокус на Telegram и BeatStars.', createdAt: iso(10), updatedAt: iso(10), deletedAt: null },
  ];

  return normalizeState(s);
}
