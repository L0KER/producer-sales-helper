import { esc, money, fmtNum } from './util.js';

export const PALETTE = ['#7c5cff', '#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#60a5fa', '#f472b6'];

export function barChart(data, {
  height = 220,
  color = '#7c5cff',
  currency = 'USD',
  ariaLabel = 'График выручки по месяцам',
} = {}) {
  const rows = Array.isArray(data) ? data : [];
  const width = 760;
  const pad = { left: 10, right: 10, top: 22, bottom: 30 };
  const innerW = width - pad.left - pad.right;
  const baseline = height - pad.bottom;
  const max = Math.max(1, ...rows.map((row) => Number(row.value) || 0));
  const step = innerW / Math.max(1, rows.length);
  const barW = Math.min(34, Math.max(8, step * 0.54));
  const scaleY = (value) => pad.top + (baseline - pad.top) * (1 - (Number(value) || 0) / max);

  const grid = [0.25, 0.5, 0.75].map((ratio) => {
    const y = pad.top + (baseline - pad.top) * ratio;
    return `<line class="grid-line" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke-dasharray="3 5"/>`;
  }).join('');

  const bars = rows.map((row, index) => {
    const value = Number(row.value) || 0;
    const x = pad.left + step * index + (step - barW) / 2;
    const y = scaleY(value);
    const barH = Math.max(value > 0 ? 3 : 1, baseline - y);
    const showLabel = rows.length <= 8 || index % 2 === 0 || index === rows.length - 1;
    const label = showLabel ? (row.label || '') : '';
    return `<g>
      <rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}"
        rx="4" fill="${color}" opacity="${value > 0 ? 0.88 : 0.22}">
        <title>${esc(row.label || '')}: ${esc(money(value, currency))}</title>
      </rect>
      <text class="axis-label" x="${(x + barW / 2).toFixed(1)}" y="${height - 9}" text-anchor="middle">${esc(label)}</text>
    </g>`;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(ariaLabel)}">
    ${grid}${bars}
  </svg>`;
}

export function donutChart(rows, { currency = 'USD', centerLabel = 'Всего', showMoney = false } = {}) {
  const data = (rows || []).filter((row) => (Number(row.value) || 0) > 0);
  const total = data.reduce((acc, row) => acc + (Number(row.value) || 0), 0);

  if (!total) {
    return '<div class="empty"><p>Пока нет данных для диаграммы</p></div>';
  }

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const segments = data.map((row, index) => {
    const value = Number(row.value) || 0;
    const fraction = value / total;
    const dash = `${(fraction * circumference).toFixed(2)} ${(circumference - fraction * circumference).toFixed(2)}`;
    const rotation = (offset / circumference) * 360 - 90;
    offset += fraction * circumference;
    const color = row.color || PALETTE[index % PALETTE.length];
    return `<circle cx="90" cy="90" r="${radius}" fill="none" stroke="${color}" stroke-width="18"
      stroke-dasharray="${dash}" transform="rotate(${rotation.toFixed(2)} 90 90)" opacity="0.92">
      <title>${esc(row.label)}: ${esc(showMoney ? money(value, currency) : fmtNum(value))}</title>
    </circle>`;
  }).join('');

  const legend = data.map((row, index) => {
    const value = Number(row.value) || 0;
    const color = row.color || PALETTE[index % PALETTE.length];
    return `<div class="row">
      <span class="sw" style="background:${color}"></span>
      <span>${esc(row.label)}</span>
      <span class="val">${esc(showMoney ? money(value, currency) : fmtNum(value))}</span>
    </div>`;
  }).join('');

  return `<div class="donut-wrap">
    <svg class="donut" viewBox="0 0 180 180" role="img" aria-label="${esc(centerLabel)}">
      <circle cx="90" cy="90" r="${radius}" fill="none" stroke="var(--panel-3)" stroke-width="18"></circle>
      ${segments}
      <text x="90" y="86" text-anchor="middle" fill="var(--text)" font-size="21" font-weight="700"
        font-family="var(--font)">${esc(showMoney ? money(total, currency) : fmtNum(total))}</text>
      <text x="90" y="105" text-anchor="middle" fill="var(--dim)" font-size="10"
        font-family="var(--font)">${esc(centerLabel)}</text>
    </svg>
    <div class="donut-legend">${legend}</div>
  </div>`;
}

export function miniBars(values, { height = 36, color = 'var(--accent)' } = {}) {
  const rows = (values || []).map(Number);
  const max = Math.max(1, ...rows);
  const width = 120;
  const step = width / Math.max(1, rows.length);
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    ${rows.map((value, index) => {
    const h = Math.max(2, (value / max) * height);
    return `<rect x="${(index * step + step * 0.15).toFixed(1)}" y="${(height - h).toFixed(1)}"
      width="${(step * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${color}" opacity="0.7"></rect>`;
  }).join('')}
  </svg>`;
}
