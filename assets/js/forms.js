import {
  esc, num, parseTags, fromLocalInput, toDateInput, toDateTimeInput, toast,
} from './util.js';

let activeOnClose = null;

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  const callback = activeOnClose;
  activeOnClose = null;
  root.innerHTML = '';
  document.body.classList.remove('modal-open');
  if (callback) {
    try {
      callback();
    } catch (error) {
      console.error(error);
    }
  }
}

export function openModal(html, { wide = false, small = false, onMount, onClose } = {}) {
  const root = document.getElementById('modal-root');
  if (!root) throw new Error('modal root is missing');

  activeOnClose = onClose || null;
  root.innerHTML = `
    <div class="modal-backdrop" data-modal-backdrop></div>
    <div class="modal ${wide ? 'wide' : ''} ${small ? 'small' : ''}" role="dialog" aria-modal="true">
      ${html}
    </div>`;

  document.body.classList.add('modal-open');
  const panel = root.querySelector('.modal');

  root.querySelector('[data-modal-backdrop]')?.addEventListener('click', closeModal);
  root.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', (event) => {
      if (el.tagName === 'A') return;
      event.preventDefault();
      closeModal();
    });
  });

  requestAnimationFrame(() => panel.classList.add('in'));

  if (onMount) onMount(panel);

  setTimeout(() => {
    const focusTarget = panel.querySelector('[data-autofocus]')
      || panel.querySelector('input:not([type="hidden"]):not([type="checkbox"]), textarea, select, button');
    focusTarget?.focus({ preventScroll: true });
  }, 60);

  return panel;
}

function normaliseOptions(options = []) {
  return options.map((option) => (typeof option === 'string'
    ? { value: option, label: option }
    : { value: String(option.value ?? ''), label: String(option.label ?? option.value ?? '') }));
}

function fieldHtml(field, value) {
  const id = `field-${field.name}`;
  const label = Object.prototype.hasOwnProperty.call(field, 'label') ? field.label : field.name;
  const common = `name="${esc(field.name)}" id="${esc(id)}"`;
  const required = field.required ? 'required' : '';
  const placeholder = field.placeholder ? `placeholder="${esc(field.placeholder)}"` : '';
  const hint = field.hint ? `<span class="field-hint">${esc(field.hint)}</span>` : '';

  if (field.type === 'checkbox') {
    return `<div class="field check ${field.col === 2 ? 'col-2' : ''}">
      <input type="checkbox" ${common} ${value ? 'checked' : ''}>
      <span>${esc(label)}</span>
      ${hint}
    </div>`;
  }

  const labelHtml = `<span>${esc(label)}</span>`;
  let control = '';

  switch (field.type) {
    case 'textarea':
      control = `<textarea ${common} ${placeholder} ${required} rows="${field.rows || 3}">${esc(value || '')}</textarea>`;
      break;
    case 'select': {
      const options = normaliseOptions(field.options);
      const blank = field.required ? '' : `<option value="">— не выбрано —</option>`;
      const opts = options.map((option) => {
        const selected = String(value ?? '') === option.value ? 'selected' : '';
        return `<option value="${esc(option.value)}" ${selected}>${esc(option.label)}</option>`;
      }).join('');
      control = `<select ${common} ${required}>${blank}${opts}</select>`;
      break;
    }
    case 'number':
    case 'money':
      control = `<input type="number" ${common} value="${esc(value ?? '')}" ${placeholder}
        ${required} min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step || 'any'}">`;
      break;
    case 'date':
      control = `<input type="date" ${common} value="${esc(toDateInput(value))}" ${required}>`;
      break;
    case 'datetime':
      control = `<input type="datetime-local" ${common} value="${esc(toDateTimeInput(value))}" ${required}>`;
      break;
    case 'month':
      control = `<input type="month" ${common} value="${esc(value || '')}" ${required}>`;
      break;
    case 'tags':
      control = `<input type="text" ${common} value="${esc(Array.isArray(value) ? value.join(', ') : (value || ''))}"
        ${placeholder || 'placeholder="через запятую"'} ${required}>`;
      break;
    case 'password':
      control = `<input type="password" ${common} value="${esc(value || '')}" ${placeholder} ${required} autocomplete="off" spellcheck="false">`;
      break;
    case 'email':
      control = `<input type="email" ${common} value="${esc(value || '')}" ${placeholder} ${required}>`;
      break;
    case 'text':
    default:
      control = `<input type="text" ${common} value="${esc(value ?? '')}" ${placeholder} ${required}>`;
      break;
  }

  return `<label class="field ${field.required ? 'required' : ''} ${field.col === 2 ? 'col-2' : ''}" for="${esc(id)}">
    ${labelHtml}${control}${hint}
  </label>`;
}

function collect(form, fields) {
  const values = {};
  for (const field of fields) {
    const el = form.elements.namedItem(field.name);
    if (!el) continue;

    if (field.type === 'checkbox') {
      values[field.name] = Boolean(el.checked);
    } else if (field.type === 'number' || field.type === 'money') {
      values[field.name] = el.value === '' ? null : num(el.value);
    } else if (field.type === 'date' || field.type === 'datetime') {
      values[field.name] = el.value === '' ? null : fromLocalInput(el.value);
    } else if (field.type === 'month') {
      values[field.name] = el.value || '';
    } else if (field.type === 'tags') {
      values[field.name] = parseTags(el.value);
    } else {
      values[field.name] = String(el.value).trim();
    }
  }
  return values;
}

export function openForm({
  title,
  subtitle = '',
  fields,
  values = {},
  submitText = 'Сохранить',
  cancelText = 'Отмена',
  wide = false,
  extraHtml = '',
  note = '',
  validate,
  onSubmit,
}) {
  const body = fields.map((field) => fieldHtml(field, values[field.name])).join('');
  const html = `
    <form class="settings-form" novalidate>
      <header class="modal-head">
        <div>
          <h3>${esc(title)}</h3>
          ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Закрыть">✕</button>
      </header>
      <div class="form-grid">${body}</div>
      ${note ? `<div class="form-note">${note}</div>` : ''}
      ${extraHtml ? `<div class="form-extras">${extraHtml}</div>` : ''}
      <footer class="modal-foot">
        <button type="button" class="btn ghost" data-close>${esc(cancelText)}</button>
        <button type="submit" class="btn primary">${esc(submitText)}</button>
      </footer>
    </form>`;

  return openModal(html, {
    wide,
    onMount(panel) {
      const form = panel.querySelector('form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!form.reportValidity()) return;

        const result = collect(form, fields);
        if (typeof validate === 'function') {
          const error = validate(result);
          if (error) {
            toast(error, 'error');
            return;
          }
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const initialLabel = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Сохраняю…';

        try {
          const outcome = await onSubmit(result);
          if (outcome !== false) closeModal();
        } catch (error) {
          console.error(error);
          toast(error.message || 'Не удалось сохранить', 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = initialLabel;
        }
      });
    },
  });
}

export function confirmDialog({
  title = 'Удалить запись?',
  message = 'Это действие можно отменить только вручную.',
  confirmText = 'Удалить',
  cancelText = 'Отмена',
  danger = true,
  onConfirm,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const html = `
      <div class="modal-head">
        <div>
          <h3>${esc(title)}</h3>
          <p>${esc(message)}</p>
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Закрыть">✕</button>
      </div>
      <footer class="modal-foot">
        <button type="button" class="btn ghost" data-close>${esc(cancelText)}</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-confirm>${esc(confirmText)}</button>
      </footer>`;

    openModal(html, {
      small: true,
      onClose: () => finish(false),
      onMount(panel) {
        panel.querySelector('[data-confirm]')?.addEventListener('click', async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            if (onConfirm) await onConfirm();
            finish(true);
            closeModal();
          } catch (error) {
            toast(error.message || 'Ошибка', 'error');
            button.disabled = false;
          }
        });
      },
    });
  });
}

export function openPrompt({ title, label, value = '', placeholder = '', multiline = false, submitText = 'Сохранить' }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const control = multiline
      ? `<textarea name="value" id="prompt-value" rows="6" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input type="text" name="value" id="prompt-value" value="${esc(value)}" placeholder="${esc(placeholder)}">`;

    const html = `
      <form>
        <header class="modal-head">
          <div><h3>${esc(title)}</h3></div>
          <button type="button" class="icon-btn" data-close aria-label="Закрыть">✕</button>
        </header>
        <div class="form-grid">
          <label class="field col-2"><span>${esc(label)}</span>${control}</label>
        </div>
        <footer class="modal-foot">
          <button type="button" class="btn ghost" data-close>Отмена</button>
          <button type="submit" class="btn primary">${esc(submitText)}</button>
        </footer>
      </form>`;

    openModal(html, {
      onClose: () => finish(null),
      onMount(panel) {
        const form = panel.querySelector('form');
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const input = panel.querySelector('#prompt-value');
          finish(String(input.value || '').trim());
          closeModal();
        });
        setTimeout(() => panel.querySelector('#prompt-value')?.focus(), 60);
      },
    });
  });
}
