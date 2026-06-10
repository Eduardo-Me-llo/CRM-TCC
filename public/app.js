const state = {
  token: localStorage.getItem('crm_token'),
  user: JSON.parse(localStorage.getItem('crm_user') || 'null'),
  route: location.hash.replace('#', '') || '',
  cache: {},
  alert: null,
  pendingLogin: JSON.parse(sessionStorage.getItem('crm_pending_login') || 'null'),
  sidebarCollapsed: localStorage.getItem('crm_sidebar_collapsed') === 'true'
};

let notificationPollTimer = null;

const roleLabels = {
  DEVELOPER: 'Desenvolvedor do CRM',
  ADMIN_MASTER: 'Admin Master',
  ADMIN: 'Admin',
  MANAGER: 'Gerente',
  OPERATOR: 'Operador'
};

const statusLabels = {
  active: 'Ativo',
  inactive: 'Inativo',
  prospect: 'Prospecção',
  former: 'Antigo cliente',
  paused: 'Pausado',
  open: 'Aberto',
  done: 'Concluído',
  lost: 'Perdido'
};

const pipelineStageLabels = {
  new: 'Novo',
  contacted: 'Contato feito',
  negotiation: 'Em negociação',
  proposal: 'Proposta enviada',
  won: 'Fechado',
  lost: 'Perdido'
};

const taskPriorityLabels = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente'
};

const taskStatusLabels = {
  open: 'Aberta',
  in_progress: 'Em andamento',
  done: 'Concluída',
  canceled: 'Cancelada'
};

const channelLabels = {
  email: 'E-mail',
  phone: 'Telefone',
  whatsapp: 'WhatsApp',
  meeting: 'Reunião',
  internal_note: 'Observação interna'
};

const directionLabels = {
  inbound: 'Recebido',
  outbound: 'Enviado',
  internal: 'Interno'
};

const customEntityLabels = {
  client_company: 'Clientes',
  client_contact: 'Contatos',
  client_interaction: 'Relacionamentos'
};

const customFieldTypeLabels = {
  text: 'Texto',
  number: 'Numero',
  date: 'Data',
  select: 'Lista'
};

function $(selector, root = document) { return root.querySelector(selector); }
function $all(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'U';
}
function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function fmtDateOnly(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}
function fmtMoney(value) {
  if (value === null || value === undefined || value === '') return '-';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function has(permission) {
  return state.user?.permissions?.includes(permission);
}
function isDeveloper() {
  return state.user?.role === 'DEVELOPER';
}
function isAdminMaster() {
  return state.user?.role === 'ADMIN_MASTER';
}
function isAdminOrMaster() {
  return state.user?.role === 'ADMIN_MASTER' || state.user?.role === 'ADMIN';
}
function canEditCompany() {
  return ['ADMIN_MASTER', 'ADMIN', 'MANAGER'].includes(state.user?.role);
}

function validateEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function validatePhone(phone) {
  const d = normalizeDigits(phone);
  return d.length >= 8 && d.length <= 13; // allow international-ish lengths
}

function validateCNPJ(cnpj) {
  const v = normalizeDigits(cnpj);
  if (v.length !== 14) return false;
  if (/^(.?)\1+$/.test(v)) return false;
  const numbers12 = v.substring(0, 12).split('').map(Number);
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum1 = numbers12.reduce((acc, number, index) => acc + number * weights1[index], 0);
  const d1 = sum1 % 11 < 2 ? 0 : 11 - (sum1 % 11);
  const numbers13 = [...numbers12, d1];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum2 = numbers13.reduce((acc, number, index) => acc + number * weights2[index], 0);
  const d2 = sum2 % 11 < 2 ? 0 : 11 - (sum2 % 11);
  return Number(v[12]) === d1 && Number(v[13]) === d2;
}

function focusFirstInvalid(form, errorMessage = '') {
  try {
    // Prefer native :invalid selector
    const invalid = form.querySelector(':invalid');
    if (invalid) {
      addFieldError(invalid);
      invalid.focus();
      invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  } catch (e) {
    // ignore selector errors
  }
  // Keyword-based fallback mapping
  const mapping = [
    ['CNPJ', 'cnpj'],
    ['E-mail', 'email'], ['E-mail inválido', 'email'], ['email', 'email'],
    ['WhatsApp', 'whatsapp'], ['WhatsApp inválido', 'whatsapp'], ['WhatsApp inválido', 'whatsapp'],
    ['Telefone', 'phone'], ['Telefone inválido', 'phone'],
    ['Empresa cliente', 'companyId'], ['Responsável interno', 'ownerUserId'],
    ['Nome do contato', 'name'], ['Nome da empresa', 'name'], ['Assunto', 'subject'], ['Descrição', 'description']
  ];
  const msg = String(errorMessage || '').toLowerCase();
  for (const [kw, fieldName] of mapping) {
    if (msg.includes(kw.toLowerCase())) {
      const el = form.querySelector(`[name="${fieldName}"]`);
      if (el) { addFieldError(el); el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    }
  }
  // Last resort: first required empty field
  const requiredEmpty = Array.from(form.querySelectorAll('[required]')).find(i => !i.value || String(i.value).trim() === '');
  if (requiredEmpty) { addFieldError(requiredEmpty); requiredEmpty.focus(); requiredEmpty.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  // Otherwise focus first input
  const first = form.querySelector('input,textarea,select');
  if (first) { addFieldError(first); first.focus(); first.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

function addFieldError(el) {
  if (!el) return;
  // remove existing markers within same form
  const form = el.closest('form') || document;
  form.querySelectorAll('.field-error').forEach(x => x.classList.remove('field-error'));
  el.classList.add('field-error');
  // mark label if present
  const label = form.querySelector(`label[for="${el.id}"]`) || el.closest('.field')?.querySelector('label');
  if (label) label.classList.add('field-error-label');
  const remove = () => {
    el.classList.remove('field-error');
    if (label) label.classList.remove('field-error-label');
    el.removeEventListener('input', remove);
    el.removeEventListener('change', remove);
  };
  el.addEventListener('input', remove);
  el.addEventListener('change', remove);
}
function setAlert(message, type = 'success') {
  state.alert = { message, type };
}
function alertHtml() {
  if (!state.alert) return '';
  const html = `<div class="alert ${state.alert.type}">${esc(state.alert.message)}</div>`;
  state.alert = null;
  return html;
}
function navigate(route) {
  location.hash = route;
}
window.addEventListener('hashchange', () => {
  state.route = location.hash.replace('#', '') || defaultRoute();
  render();
});

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = data?.message || 'Erro ao processar requisição.';
    throw new Error(message);
  }
  return data;
}

async function downloadText(path, filename) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Erro ao baixar arquivo.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formValues(form) {
  const data = new FormData(form);
  const obj = {};
  for (const [key, value] of data.entries()) {
    obj[key] = String(value).trim();
  }
  $all('[data-checkbox]', form).forEach(input => {
    obj[input.name] = input.checked;
  });
  return obj;
}

function tagsFromText(text) {
  return String(text || '').split(',').map(t => t.trim()).filter(Boolean);
}

function statusBadge(status) {
  return `<span class="badge ${esc(status)}">${esc(statusLabels[status] || status || '-')}</span>`;
}

function roleBadge(role) {
  return `<span class="badge ${role === 'ADMIN_MASTER' || role === 'ADMIN' ? 'active' : 'prospect'}">${esc(roleLabels[role] || role)}</span>`;
}

function pipelineBadge(stage) {
  return `<span class="badge pipeline-${esc(stage || 'new')}">${esc(pipelineStageLabels[stage] || stage || '-')}</span>`;
}

function priorityBadge(priority) {
  return `<span class="badge priority-${esc(priority || 'medium')}">${esc(taskPriorityLabels[priority] || priority || '-')}</span>`;
}

function taskStatusBadge(status) {
  return `<span class="badge task-${esc(status || 'open')}">${esc(taskStatusLabels[status] || status || '-')}</span>`;
}

function modal({ title, body, submitText = 'Salvar', onSubmit }) {
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = `
    <form class="modal" id="modalForm">
      <header>
        <div>
          <h2>${esc(title)}</h2>
          <div class="muted small">Preencha os campos abaixo.</div>
        </div>
        <button class="btn ghost" type="button" data-close>✕</button>
      </header>
      <main>${body}</main>
      <footer>
        <button class="btn" type="button" data-close>Cancelar</button>
        <button class="btn primary" type="submit">${esc(submitText)}</button>
      </footer>
    </form>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  $all('[data-close]', el).forEach(btn => btn.addEventListener('click', close));
  // Do not close modal when clicking on backdrop to avoid accidental dismiss during validation
  // Keep modal open when submission fails (validation or server error)
  $('#modalForm').addEventListener('submit', async e => {
    e.preventDefault();
    const submit = e.submitter;
    submit.disabled = true;
    try {
      await onSubmit(formValues(e.currentTarget));
      close();
      await render();
    } catch (error) {
      setAlert(error.message, 'error');
      // keep the modal open so the user can correct the fields
      const formEl = e.currentTarget;
      await render();
      // after render (so alert is visible), focus the first invalid/errored field
      const currentForm = document.getElementById('modalForm') || formEl;
      focusFirstInvalid(currentForm, error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

async function ensureCustomFields() {
  if (isDeveloper()) return [];
  if (!state.cache.customFields) {
    state.cache.customFields = await api('/api/custom-fields').catch(() => []);
  }
  return state.cache.customFields;
}

function customFieldsFor(entityType) {
  return (state.cache.customFields || []).filter(f => f.entityType === entityType);
}

function customFieldValue(record, field) {
  const values = record?.customFields || {};
  return values[field.fieldKey] ?? '';
}

function customFieldsHtml(entityType, record = {}) {
  const fields = customFieldsFor(entityType);
  if (!fields.length) return '';
  return fields.map(field => {
    const value = customFieldValue(record, field);
    const required = field.isRequired ? 'required' : '';
    if (field.fieldType === 'select') {
      return `<div class="field"><label>${esc(field.label)}${field.isRequired ? ' *' : ''}</label><select class="select" name="custom_${esc(field.fieldKey)}" ${required}><option value="">Selecione</option>${(field.options || []).map(option => `<option value="${esc(option)}" ${value === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select></div>`;
    }
    const type = field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text';
    return `<div class="field"><label>${esc(field.label)}${field.isRequired ? ' *' : ''}</label><input class="input" type="${type}" name="custom_${esc(field.fieldKey)}" value="${esc(value)}" ${required} /></div>`;
  }).join('');
}

function customFieldsDetailHtml(entityType, record = {}) {
  const fields = customFieldsFor(entityType);
  if (!fields.length) return '';
  return fields.map(field => `<div><span class="detail-label">${esc(field.label)}</span><strong>${esc(customFieldValue(record, field) || '-')}</strong></div>`).join('');
}

function customTableHeaders(entityType) {
  return customFieldsFor(entityType).map(field => `<th>${esc(field.label)}</th>`).join('');
}

function customTableCells(entityType, record = {}) {
  return customFieldsFor(entityType).map(field => `<td>${esc(customFieldValue(record, field) || '-')}</td>`).join('');
}

function attachCustomFields(values, entityType) {
  const customFields = {};
  customFieldsFor(entityType).forEach(field => {
    const key = `custom_${field.fieldKey}`;
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      customFields[field.fieldKey] = values[key];
      delete values[key];
    }
  });
  values.customFields = customFields;
  return values;
}

function customFieldSearchText(record) {
  return Object.values(record?.customFields || {}).join(' ');
}

function defaultRoute() {
  if (!state.user) return 'login';
  if (isDeveloper()) return 'developer-dashboard';
  return 'dashboard';
}

async function bootstrap() {
  if (state.token) {
    try {
      state.user = await api('/api/me');
      localStorage.setItem('crm_user', JSON.stringify(state.user));
    } catch {
      logout(false);
    }
  }
  if (!state.route || state.route === 'login') state.route = defaultRoute();
  if (!location.hash) location.hash = state.route;
  await render();
  if (state.token && !isDeveloper()) startNotificationPolling();
}

function logout(update = true) {
  clearInterval(notificationPollTimer);
  notificationPollTimer = null;
  localStorage.removeItem('crm_token');
  localStorage.removeItem('crm_user');
  sessionStorage.removeItem('crm_pending_login');
  state.token = null;
  state.user = null;
  state.pendingLogin = null;
  state.cache = {};
  state.route = 'login';
  if (update) navigate('login');
}

function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = collapsed;
  localStorage.setItem('crm_sidebar_collapsed', String(collapsed));
  $('.app-shell')?.classList.toggle('sidebar-collapsed', collapsed);
}

async function startNotificationPolling() {
  if (notificationPollTimer) return;
  await refreshNotifications();
  notificationPollTimer = setInterval(refreshNotifications, 60000);
}

async function refreshNotifications() {
  if (!state.token || isDeveloper()) return;
  try {
    updateNotificationsUI(await api('/api/notifications'));
  } catch (error) {
    console.error('Erro ao buscar notificações:', error);
  }
}

function updateNotificationsUI(notifications) {
  state.cache.notifications = notifications || [];
  const unreadCount = notifications ? notifications.length : 0;
  const badge = $('#notificationsBadge');
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  const panel = $('#notificationsPanel');
  if (panel) {
    const list = $('#notificationsList', panel);
    if (!notifications || notifications.length === 0) {
      list.innerHTML = '<div class="empty mini">Sem notificações no momento.</div>';
    } else {
      list.innerHTML = notifications.map(notif => `
        <div class="notification-item notification-${esc(notif.severity)}">
          <div class="notification-title">${esc(notif.title)}</div>
          <div class="notification-message">${esc(notif.message)}</div>
          <div class="notification-time">${fmtDate(notif.createdAt)}</div>
          <div class="notification-actions">
            <button class="btn ghost" type="button" data-notification-open="${esc(notif.route)}">Abrir</button>
            <button class="btn ghost" type="button" data-notification-dismiss="${esc(notif.id)}">Dispensar</button>
          </div>
        </div>
      `).join('');
    }
  }
}

function closeNotificationsOnOutsideClick(event) {
  const bell = $('#notificationsBell');
  const panel = $('#notificationsPanel');
  if (bell && panel && !bell.contains(event.target) && !panel.contains(event.target)) {
    panel.classList.remove('open');
    bell.setAttribute('aria-expanded', 'false');
  }
}

function bindNotificationsUI() {
  const bell = $('#notificationsBell');
  const panel = $('#notificationsPanel');
  const closeBtn = $('#closeNotificationsPanel');
  const dismissAllBtn = $('#dismissAllNotifications');
  const list = $('#notificationsList');

  if (bell && panel) {
    bell.addEventListener('click', e => {
      e.stopPropagation();
      panel.classList.toggle('open');
      bell.setAttribute('aria-expanded', String(panel.classList.contains('open')));
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        panel.classList.remove('open');
        bell.setAttribute('aria-expanded', 'false');
      });
    }

    document.removeEventListener('click', closeNotificationsOnOutsideClick);
    document.addEventListener('click', closeNotificationsOnOutsideClick);

    dismissAllBtn?.addEventListener('click', async () => {
      try {
        await api('/api/notifications/dismiss-all', { method: 'POST' });
        await refreshNotifications();
      } catch (error) {
        setAlert(error.message, 'error');
        await render();
      }
    });

    list?.addEventListener('click', async event => {
      const dismissButton = event.target.closest('[data-notification-dismiss]');
      if (dismissButton) {
        try {
          await api(`/api/notifications/${encodeURIComponent(dismissButton.dataset.notificationDismiss)}/dismiss`, { method: 'POST' });
          await refreshNotifications();
        } catch (error) {
          setAlert(error.message, 'error');
          await render();
        }
        return;
      }
      const openButton = event.target.closest('[data-notification-open]');
      if (openButton) {
        panel.classList.remove('open');
        navigate(openButton.dataset.notificationOpen);
      }
    });
  }
}

function renderLogin() {
  document.body.className = '';
  const pending = state.pendingLogin;
  $('#app').innerHTML = `
    <div class="login-page">
      <section class="login-hero">
        <div>
          <div class="logo-row"><div class="logo">CRM</div><div><strong>CRM</strong><div>Multiempresa</div></div></div>
          <h1>Gestão de relacionamento pronta para empresas, contatos e histórico completo.</h1>
          <p>Painel do desenvolvedor, cadastro de empresas contratantes, usuários por empresa, login multiempresa, banco PostgreSQL e regras de permissão no backend.</p>
          <div class="hero-grid">
            <div class="hero-card"><strong>TCC</strong><span>Projeto para o TCC</span></div>
            <div class="hero-card"><strong>B2B</strong><span>Empresas, contatos e relacionamentos</span></div>
            <div class="hero-card"><strong>Segurança</strong><span>Rotas protegidas por permissão</span></div>
          </div>
        </div>
        <div class="small">Desenvolvido por: Eduardo de Mello Neto e Gabriel de Souza Brito • email para painel de dev: desenvolvedor@crm.local</div>
      </section>
      <section class="login-form-wrap">
        <form class="login-card" id="loginForm">
          <div class="logo-row"><div class="logo">CRM</div><div><h2>Entrar no CRM</h2><div class="muted">Use seu e-mail institucional.</div></div></div>
          ${alertHtml()}
          ${pending ? `
            <div class="alert">
              <strong>Codigo enviado</strong><br />
              <span class="small">${esc(pending.message || `Confira o e-mail ${pending.email}.`)}</span>
              ${pending.devCode ? `<br /><span class="small"><strong>Teste:</strong> use o codigo ${esc(pending.devCode)}</span>` : ''}
            </div>
            <div class="field"><label>Codigo de 5 digitos</label><input class="input" name="code" inputmode="numeric" maxlength="5" pattern="[0-9]{5}" required autofocus /></div>
            <div style="height:18px"></div>
            <button class="btn primary" style="width:100%" type="submit">Validar e entrar</button>
            <div style="height:10px"></div>
            <button class="btn ghost" style="width:100%" type="button" id="changeLoginEmail">Trocar e-mail</button>
          ` : `
            <div class="field"><label>E-mail</label><input class="input" name="email" type="email" value="" placeholder="seu.email@empresa.com" required /></div>
            <div style="height:12px"></div>
            <div class="field"><label>Senha</label><input class="input" name="password" type="password" required /></div>
            <div style="height:18px"></div>
            <button class="btn primary" style="width:100%" type="submit">Entrar</button>
          `}
          <div style="height:16px"></div>
          <div class="alert">
            <strong></strong><br />
            <span class="small"></span><br />
            <span class="small"></span>
          </div>
        </form>
      </section>
    </div>`;
  $('#changeLoginEmail')?.addEventListener('click', () => {
    state.pendingLogin = null;
    sessionStorage.removeItem('crm_pending_login');
    renderLogin();
  });
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    try {
      const values = formValues(e.currentTarget);
      const data = pending
        ? await api('/api/auth/verify-login', { method: 'POST', body: JSON.stringify({ email: pending.email, code: values.code }) })
        : await api('/api/auth/login', { method: 'POST', body: JSON.stringify(values) });
      if (data.requiresVerification) {
        state.pendingLogin = { email: data.email, message: data.message, devCode: data.devCode };
        sessionStorage.setItem('crm_pending_login', JSON.stringify(state.pendingLogin));
        return renderLogin();
      }
      state.token = data.token;
      state.user = data.user;
      state.pendingLogin = null;
      sessionStorage.removeItem('crm_pending_login');
      localStorage.setItem('crm_token', data.token);
      localStorage.setItem('crm_user', JSON.stringify(data.user));
      if (!isDeveloper()) startNotificationPolling();
      navigate(defaultRoute());
    } catch (error) {
      setAlert(error.message, 'error');
      renderLogin();
    } finally {
      btn.disabled = false;
    }
  });
}

function shell(content) {
  document.body.className = 'in-app';
  const nav = isDeveloper() ? developerNav() : tenantNav();
  $('#app').innerHTML = `
    <div class="app-shell ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}">
      <aside class="sidebar">
        <div class="side-head">
          <div class="logo">${isDeveloper() ? 'DEV' : 'CRM'}</div>
          <div><div class="side-title">${isDeveloper() ? 'Painel SaaS' : esc(state.user.tenantName || 'CRM')}</div><div class="side-subtitle">${isDeveloper() ? 'Administração global' : esc(state.user.tenantDomain || '')}</div></div>
          <button class="sidebar-toggle" id="sidebarToggle" type="button" title="${state.sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}">${state.sidebarCollapsed ? '>' : '<'}</button>
        </div>
        ${nav}
        <div class="sidebar-footer">
          <strong>${esc(state.user.name)}</strong><br />
          <span>${esc(roleLabels[state.user.role] || state.user.role)}</span><br />
          <button class="btn ghost" id="logoutBtn" style="margin-top:12px;color:white;border-color:rgba(255,255,255,.25)">Sair</button>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <form class="search-box" id="globalSearchForm">
            <span>⌕</span>
            <input id="globalSearchInput" placeholder="Buscar empresas, contatos, relacionamentos..." autocomplete="off" />
            <div class="search-results" id="globalSearchResults"></div>
          </form>
          ${!isDeveloper() ? `<div class="notifications-bell-wrapper">
            <button class="notifications-bell" id="notificationsBell" type="button" title="Notificações" aria-expanded="false" aria-controls="notificationsPanel">
              <span>🔔</span>
              <span class="notifications-badge" id="notificationsBadge" style="display:none">0</span>
            </button>
            <div class="notifications-panel" id="notificationsPanel">
              <div class="notifications-header">
                <strong>Notificações</strong>
                <div class="notification-header-actions">
                  <button class="btn ghost" type="button" id="dismissAllNotifications">Limpar</button>
                  <button class="btn ghost" type="button" id="closeNotificationsPanel" aria-label="Fechar">✕</button>
                </div>
              </div>
              <div class="notifications-list" id="notificationsList">
                <div class="empty mini">Carregando notificações...</div>
              </div>
            </div>
          </div>` : ''}
          <div class="user-menu-wrap">
            <button class="user-chip" id="userMenuToggle" type="button">
              <div><strong>${esc(state.user.name)}</strong><div class="small user-role">${esc(roleLabels[state.user.role] || state.user.role)}</div></div>
              <div class="avatar">${esc(initials(state.user.name))}</div>
            </button>
            <div class="user-menu" id="userMenu">
              <div class="user-menu-head">
                <strong>${esc(state.user.name)}</strong>
                <span>${esc(state.user.email)}</span>
                <span>${esc(state.user.tenantName || 'Painel CRM')}</span>
              </div>
              ${!isDeveloper() ? '<button type="button" data-route="settings">Preferencias</button>' : '<button type="button" data-route="developer-settings">Configuracoes</button>'}
              ${isAdminMaster() ? '<button type="button" data-route="users">Usuarios e acessos</button>' : ''}
              <button type="button" id="logoutMenuBtn">Sair</button>
            </div>
          </div>
        </header>
        <section class="content">${alertHtml()}${content}</section>
      </main>
    </div>`;
  $('#logoutBtn').addEventListener('click', () => logout(true));
  $('#logoutMenuBtn')?.addEventListener('click', () => logout(true));
  $('#sidebarToggle')?.addEventListener('click', () => setSidebarCollapsed(!state.sidebarCollapsed));
  bindGlobalSearch();
  bindNotificationsUI();
  updateNotificationsUI(state.cache.notifications || []);
  $('#userMenuToggle')?.addEventListener('click', event => {
    event.stopPropagation();
    const menu = $('#userMenu');
    menu?.classList.toggle('open');
    if (menu?.classList.contains('open')) {
      setTimeout(() => document.addEventListener('click', closeUserMenuOnce, { once: true }));
    }
  });
  $all('[data-route]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.route)));
}

function closeUserMenuOnce(event) {
  const menu = $('#userMenu');
  const wrap = $('.user-menu-wrap');
  if (menu && wrap && !wrap.contains(event.target)) menu.classList.remove('open');
}

function bindGlobalSearch() {
  const form = $('#globalSearchForm');
  const input = $('#globalSearchInput');
  const results = $('#globalSearchResults');
  if (!form || !input || !results || isDeveloper()) return;

  const run = async () => {
    const q = input.value.trim();
    if (q.length < 2) {
      results.classList.remove('open');
      results.innerHTML = '';
      return;
    }
    const params = encodeURIComponent(q);
    const [companies, contacts, interactions] = await Promise.all([
      has('client_companies.read') ? api(`/api/client-companies?q=${params}`).catch(() => []) : Promise.resolve([]),
      has('client_contacts.read') ? api(`/api/client-contacts?q=${params}`).catch(() => []) : Promise.resolve([]),
      has('client_interactions.read') ? api(`/api/client-interactions?q=${params}`).catch(() => []) : Promise.resolve([])
    ]);
    const items = [
      ...companies.slice(0, 4).map(item => ({ type: 'Empresa', route: 'companies', title: item.name, meta: item.cnpj || item.industry || item.status })),
      ...contacts.slice(0, 4).map(item => ({ type: 'Contato', route: 'contacts', title: item.name, meta: item.companyName || item.email || item.phone })),
      ...interactions.slice(0, 4).map(item => ({ type: 'Relacionamento', route: 'interactions', title: item.subject, meta: item.companyName || fmtDate(item.createdAt) }))
    ];
    results.innerHTML = items.length
      ? items.map(item => `<button type="button" data-search-route="${item.route}"><span class="badge prospect">${esc(item.type)}</span><strong>${esc(item.title)}</strong><small>${esc(item.meta || '-')}</small></button>`).join('')
      : '<div class="empty mini">Nenhum resultado encontrado.</div>';
    results.classList.add('open');
    $all('[data-search-route]', results).forEach(btn => btn.addEventListener('click', () => {
      results.classList.remove('open');
      navigate(btn.dataset.searchRoute);
    }));
  };

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 250);
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    run();
  });
}

function navButton(route, icon, label) {
  return `<button class="nav-btn ${state.route === route ? 'active' : ''}" data-route="${route}"><span class="nav-icon">${icon}</span>${label}</button>`;
}
function tenantNav() {
  const items = [];
  if (has('dashboard.read')) items.push(navButton('dashboard', '▦', 'Visão Geral'));
  if (has('client_companies.read')) items.push(navButton('companies', '🏢', 'Empresas Clientes'));
  if (has('client_companies.read')) items.push(navButton('prospects', '◎', 'Prospecção'));
  if (has('client_contacts.read')) items.push(navButton('contacts', '👥', 'Contatos'));
  if (has('client_interactions.read')) items.push(navButton('interactions', '☎', 'Relacionamentos'));
  if (has('tasks.read')) items.push(navButton('tasks', '✓', 'Tarefas'));
  const admin = [];
  if (isAdminMaster()) admin.push(navButton('users', '🛡', 'Usuários e Acessos'));
  admin.push(navButton('settings', '⚙', 'Configurações'));
  return `
    <div class="nav-section">Operacional</div>${items.join('')}
    <div class="nav-section">Administração</div>${admin.join('')}`;
}
function developerNav() {
  return `
    <div class="nav-section">SaaS</div>
    ${navButton('developer-dashboard', '▦', 'Visão Geral')}
    ${navButton('developer-tenants', '🏢', 'Empresas Contratantes')}
    ${navButton('developer-users', '👥', 'Usuários por Empresa')}
    <div class="nav-section">Sistema</div>
    ${navButton('developer-settings', '⚙', 'Configurações')}`;
}

function pageHeader(title, subtitle, icon, actions = '') {
  return `
    <div class="breadcrumb">${isDeveloper() ? 'Painel SaaS' : esc(state.user.tenantName || 'CRM')} › ${esc(title)}</div>
    <div class="page-head">
      <div class="page-title"><div class="page-title-icon">${icon}</div><div><h1>${esc(title)}</h1><div class="muted">${esc(subtitle)}</div></div></div>
      <div class="split-actions">${actions}</div>
    </div>`;
}

async function render() {
  if (!state.token || !state.user) return renderLogin();
  if (isDeveloper()) return renderDeveloper();
  return renderTenant();
}

async function renderTenant() {
  const route = state.route || 'dashboard';
  try {
    if (route === 'dashboard') return shell(await viewDashboard());
    if (route === 'companies') return shell(await viewCompanies());
    if (route === 'prospects') return shell(await viewProspects());
    if (route === 'contacts') return shell(await viewContacts());
    if (route === 'interactions') return shell(await viewInteractions());
    if (route === 'tasks' && has('tasks.read')) return shell(await viewTasks());
    if (route === 'users' && isAdminMaster()) return shell(await viewUsers());
    if (route === 'settings') return shell(await viewSettings());
    return shell(viewForbidden());
  } catch (error) {
    setAlert(error.message, 'error');
    shell(viewForbidden());
  }
  bindTenantEvents(route);
}

async function renderDeveloper() {
  const route = state.route || 'developer-dashboard';
  try {
    if (route === 'developer-dashboard') return shell(await viewDeveloperDashboard());
    if (route === 'developer-tenants') return shell(await viewDeveloperTenants());
    if (route === 'developer-users') return shell(await viewDeveloperUsers());
    if (route === 'developer-settings') return shell(await viewDeveloperSettings());
    return shell(viewForbidden());
  } catch (error) {
    setAlert(error.message, 'error');
    shell(viewForbidden());
  }
}

function viewForbidden() {
  return `${pageHeader('Acesso restrito', 'Seu perfil não possui permissão para esta funcionalidade.', '🔒')}
    <div class="card pad"><h2>Acesso negado</h2><p class="muted">As abas são escondidas no menu, mas o backend também bloqueia a rota por permissão real.</p></div>`;
}

async function viewDashboard() {
  const data = await api('/api/dashboard/summary');
  setTimeout(bindDashboardEvents);
  const pipeline = data.pipelineByStage || [];
  const channels = data.interactionsByChannel || [];
  return `${pageHeader('Visão Geral', 'Indicadores do CRM da sua empresa contratante.', '▦')}
    <div class="grid grid-4">
      <div class="card stat"><div class="label">Empresas clientes</div><div class="value">${data.companies}</div><div class="muted small">Organizações acompanhadas</div></div>
      <div class="card stat"><div class="label">Contatos</div><div class="value">${data.contacts}</div><div class="muted small">Pessoas vinculadas às empresas</div></div>
      <div class="card stat"><div class="label">Tarefas abertas</div><div class="value">${data.openTasks}</div><div class="muted small">${data.overdueTasks} vencida(s)</div></div>
      <div class="card stat"><div class="label">Sem contato recente</div><div class="value">${data.staleCompanies}</div><div class="muted small">Empresas há 30+ dias sem interação</div></div>
    </div>
    <div style="height:18px"></div>
    <div class="grid grid-2">
      <div class="card pad"><h2>Funil comercial</h2><div style="height:12px"></div>${pipeline.map(s => `<div class="metric-row">${pipelineBadge(s.stage)}<span><strong>${s.total}</strong></span></div>`).join('') || '<div class="empty">Sem dados.</div>'}</div>
      <div class="card pad"><h2>Tarefas próximas</h2><div style="height:12px"></div>${(data.recentTasks || []).map(t => `<div class="metric-row"><span><strong>${esc(t.title)}</strong><div class="muted small">${esc(t.companyName || 'Sem empresa')} • ${fmtDate(t.dueAt)}</div></span>${taskStatusBadge(t.status)}</div>`).join('') || '<div class="empty">Sem tarefas em aberto.</div>'}<div style="height:12px"></div><button class="btn primary" id="goTasks">Abrir tarefas</button></div>
      <div class="card pad"><h2>Status das empresas</h2><div style="height:12px"></div>${data.companiesByStatus.map(s => `<div class="metric-row">${statusBadge(s.status)}<strong>${s.total}</strong></div>`).join('') || '<div class="empty">Sem dados.</div>'}</div>
      <div class="card pad"><h2>Interações por canal</h2><div style="height:12px"></div>${channels.map(s => `<div class="metric-row"><span class="badge prospect">${esc(channelLabels[s.channel] || s.channel)}</span><strong>${s.total}</strong></div>`).join('') || '<div class="empty">Sem dados.</div>'}<div style="height:12px"></div><button class="btn" id="goCompanies">Abrir Empresas Clientes</button></div>
    </div>`;
}
function bindDashboardEvents() {
  $('#goCompanies')?.addEventListener('click', () => navigate('companies'));
  $('#goTasks')?.addEventListener('click', () => navigate('tasks'));
}

async function viewCompanies() {
  await ensureCustomFields();
  const companies = await api('/api/client-companies');
  const users = has('users.read') ? await api('/api/users').catch(() => []) : [];
  state.cache.companies = companies;
  state.cache.users = users;
  setTimeout(bindCompanyEvents);
  const actions = `${has('exports.read') ? '<button class="btn" id="exportCompanies">Exportar CSV</button>' : ''}${has('client_companies.create') ? '<button class="btn primary" id="newCompany">+ Nova empresa cliente</button>' : ''}`;
  return `${pageHeader('Empresas Clientes', 'Organizações atendidas, possíveis clientes ou antigos clientes.', '🏢', actions)}
    <div class="tabs">
      <button class="tab active">Empresas</button>
      <button class="tab" data-route="prospects">Prospecção</button>
      <button class="tab" data-route="contacts">Contatos vinculados</button>
      <button class="tab" data-route="interactions">Relacionamentos</button>
    </div>
    <div class="toolbar">
      <div class="filters">
        <input class="input" style="width:280px" id="companySearch" placeholder="Buscar por nome, CNPJ, observação..." />
        <select class="select" id="companyStatus" style="width:180px"><option value="">Todos os status</option><option value="active">Ativo</option><option value="prospect">Prospect</option><option value="former">Antigo cliente</option><option value="inactive">Inativo</option></select>
        <select class="select" id="companyPipeline" style="width:190px"><option value="">Todas as etapas</option>${Object.entries(pipelineStageLabels).map(([key, label]) => `<option value="${key}">${esc(label)}</option>`).join('')}</select>
      </div>
      <div class="muted small"></div>
    </div>
    <div id="companyArea">${companiesTable(companies)}</div>`;
}

async function viewProspects() {
  await ensureCustomFields();
  const [companies, users, contacts] = await Promise.all([
    api('/api/client-companies'),
    has('users.read') ? api('/api/users').catch(() => []) : Promise.resolve([]),
    has('client_contacts.read') ? api('/api/client-contacts').catch(() => []) : Promise.resolve([])
  ]);
  const prospects = companies.filter(c => c.status === 'prospect');
  state.cache.companies = companies;
  state.cache.prospects = prospects;
  state.cache.users = users;
  state.cache.contacts = contacts;
  setTimeout(bindProspectEvents);
  const actions = has('client_companies.create') ? `<button class="btn primary" id="newProspect">+ Nova prospecção</button>` : '';
  return `${pageHeader('Empresas em Prospecção', 'Pipeline de empresas ainda em abordagem, com contatos e relacionamento comercial.', '◎', actions)}
    <div class="tabs">
      <button class="tab" data-route="companies">Empresas</button>
      <button class="tab active">Prospecção</button>
      <button class="tab" data-route="contacts">Contatos</button>
      <button class="tab" data-route="interactions">Relacionamentos</button>
    </div>
    <div class="toolbar">
      <div class="filters">
        <input class="input" style="width:300px" id="prospectSearch" placeholder="Buscar prospecção, origem, ramo..." />
      </div>
      <div class="muted small">${prospects.length} empresa(s) em prospecção</div>
    </div>
    <div class="muted small" style="margin:10px 0 0;">Arraste os cards entre as etapas do funil para movimentar a prospecção rapidamente.</div>
    <div id="prospectArea">${prospectsBoard(prospects)}</div>`;
}

function prospectsTable(prospects) {
  if (!prospects.length) return '<div class="card empty">Nenhuma empresa em prospecção cadastrada.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Empresa</th><th>Origem</th><th>Ramo</th><th>Contatos</th><th>Última interação</th><th>Próxima ação</th><th>Responsável</th><th>Ações</th></tr></thead><tbody>
    ${prospects.map(c => `<tr class="clickable" data-company-detail="${c.id}">
      <td><strong>${esc(c.name)}</strong><div class="muted small">${esc(c.tradeName || c.cnpj || '-')}</div></td>
      <td>${esc(c.source || '-')}</td>
      <td>${esc(c.industry || '-')}</td>
      <td><strong>${c.contactsCount}</strong></td>
      <td>${fmtDateOnly(c.lastInteractionAt)}</td>
      <td>${fmtDateOnly(c.nextActionAt)}</td>
      <td>${esc(c.ownerName || '-')}</td>
      <td><div class="split-actions">
        ${has('client_contacts.create') ? `<button class="btn" data-new-prospect-contact="${c.id}">Contato</button>` : ''}
        ${has('client_interactions.create') ? `<button class="btn primary" data-new-prospect-interaction="${c.id}">Relacionar</button>` : ''}
      </div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function prospectsBoard(prospects) {
  if (!prospects.length) return '<div class="card empty">Nenhuma empresa em prospecção cadastrada.</div>';
  const stages = Object.keys(pipelineStageLabels);
  return `<div class="pipeline-board">
    ${stages.map(stage => {
      const items = prospects.filter(c => (c.pipelineStage || 'new') === stage);
      const total = items.reduce((sum, c) => sum + Number(c.expectedValue || 0), 0);
      return `<section class="pipeline-column">
        <header><strong>${esc(pipelineStageLabels[stage])}</strong><span>${items.length}</span></header>
        <div class="pipeline-list" data-stage="${stage}">
          ${items.map(c => `<article class="pipeline-card clickable" draggable="true" data-company-detail="${c.id}" data-pipeline-stage="${stage}">
            <div class="pipeline-card-head"><strong>${esc(c.name)}</strong>${statusBadge(c.status)}</div>
            <div class="muted small">${esc(c.industry || c.source || 'Sem contexto')}</div>
            <div class="pipeline-meta"><span>${fmtDateOnly(c.expectedCloseDate || c.nextActionAt)}</span></div>
            <div class="muted small">Responsável: ${esc(c.ownerName || '-')}</div>
            <div class="split-actions">
              ${has('client_companies.update') ? `<button class="btn" data-move-prospect="${c.id}" data-stage="${previousPipelineStage(stage)}" ${previousPipelineStage(stage) ? '' : 'disabled'}>←</button><button class="btn" data-move-prospect="${c.id}" data-stage="${nextPipelineStage(stage)}" ${nextPipelineStage(stage) ? '' : 'disabled'}>→</button>` : ''}
              ${has('client_interactions.create') ? `<button class="btn primary" data-new-prospect-interaction="${c.id}">Relacionar</button>` : ''}
            </div>
          </article>`).join('') || '<div class="empty mini">Sem empresas nesta etapa.</div>'}
        </div>
      </section>`;
    }).join('')}
  </div>`;
}

function previousPipelineStage(stage) {
  const stages = Object.keys(pipelineStageLabels);
  const index = stages.indexOf(stage);
  return index > 0 ? stages[index - 1] : '';
}

function nextPipelineStage(stage) {
  const stages = Object.keys(pipelineStageLabels);
  const index = stages.indexOf(stage);
  return index >= 0 && index < stages.length - 1 ? stages[index + 1] : '';
}

function bindProspectEvents() {
  $all('[data-route]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.route)));
  $('#newProspect')?.addEventListener('click', () => openCompanyModal({ status: 'prospect' }));
  $('#prospectSearch')?.addEventListener('input', filterProspects);
  bindProspectRowActions();
  bindProspectDragAndDrop();
}

function bindProspectRowActions() {
  $all('[data-company-detail]').forEach(row => row.addEventListener('click', () => openCompanyDetail(row.dataset.companyDetail)));
  $all('[data-new-prospect-contact]').forEach(btn => btn.addEventListener('click', event => {
    event.stopPropagation();
    openContactModal({ companyId: btn.dataset.newProspectContact });
  }));
  $all('[data-new-prospect-interaction]').forEach(btn => btn.addEventListener('click', event => {
    event.stopPropagation();
    openInteractionModal({ companyId: btn.dataset.newProspectInteraction });
  }));
  $all('[data-move-prospect]').forEach(btn => btn.addEventListener('click', async event => {
    event.stopPropagation();
    if (!btn.dataset.stage) return;
    try {
      await api(`/api/client-companies/${btn.dataset.moveProspect}`, { method: 'PUT', body: JSON.stringify({ pipelineStage: btn.dataset.stage }) });
      setAlert('Etapa do funil atualizada.');
      await render();
    } catch (error) {
      setAlert(error.message, 'error');
      await render();
    }
  }));
}

function bindProspectDragAndDrop() {
  const cards = $all('[data-company-detail][draggable="true"]');
  const lists = $all('.pipeline-list');

  cards.forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('companyId', card.dataset.companyDetail);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      $all('.pipeline-list').forEach(list => list.classList.remove('drag-over'));
    });
  });

  lists.forEach(list => {
    list.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.classList.add('drag-over');
    });
    list.addEventListener('dragleave', e => {
      if (e.target === list) list.classList.remove('drag-over');
    });
    list.addEventListener('drop', async e => {
      e.preventDefault();
      list.classList.remove('drag-over');
      const companyId = e.dataTransfer.getData('companyId');
      const newStage = list.dataset.stage;
      if (!companyId || !newStage) return;
      try {
        await api(`/api/client-companies/${companyId}`, { method: 'PUT', body: JSON.stringify({ pipelineStage: newStage }) });
        setAlert('Prospecção movida para etapa: ' + (pipelineStageLabels[newStage] || newStage));
        await render();
      } catch (error) {
        setAlert(error.message, 'error');
      }
    });
  });
}

function filterProspects() {
  const q = $('#prospectSearch').value.toLowerCase();
  const list = state.cache.prospects.filter(c => {
    const text = [c.name, c.tradeName, c.cnpj, c.industry, c.source, c.notes, customFieldSearchText(c), (c.tags || []).join(' ')].join(' ').toLowerCase();
    return !q || text.includes(q);
  });
  $('#prospectArea').innerHTML = prospectsBoard(list);
  bindProspectRowActions();
  bindProspectDragAndDrop();
}

function companiesTable(companies) {
  if (!companies.length) return '<div class="card empty">Nenhuma empresa cliente cadastrada.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Empresa</th><th>Ramo</th><th>Status</th><th>Funil</th><th>Valor</th>${customTableHeaders('client_company')}<th>Contatos</th><th>Última interação</th><th>Próxima ação</th><th>Responsável</th><th>Tags</th></tr></thead><tbody>
    ${companies.map(c => `<tr class="clickable" data-company-detail="${c.id}">
      <td><strong>${esc(c.name)}</strong><div class="muted small">${esc(c.tradeName || c.cnpj || c.source || '')}</div></td>
      <td>${esc(c.industry || '-')}</td>
      <td>${statusBadge(c.status)}</td>
      <td>${pipelineBadge(c.pipelineStage)}</td>
      <td>${fmtMoney(c.expectedValue)}</td>
      ${customTableCells('client_company', c)}
      <td><strong>${c.contactsCount}</strong></td>
      <td>${fmtDateOnly(c.lastInteractionAt)}</td>
      <td>${fmtDateOnly(c.nextActionAt)}</td>
      <td>${esc(c.ownerName || '-')}</td>
      <td><div class="tag-list">${(c.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function bindCompanyEvents() {
  $all('[data-route]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.route)));
  $('#newCompany')?.addEventListener('click', () => openCompanyModal());
  $('#exportCompanies')?.addEventListener('click', async () => {
    try {
      await downloadText('/api/client-companies/export', 'empresas-clientes.csv');
    } catch (error) {
      setAlert(error.message, 'error');
      await render();
    }
  });
  $('#companySearch')?.addEventListener('input', filterCompanies);
  $('#companyStatus')?.addEventListener('change', filterCompanies);
  $('#companyPipeline')?.addEventListener('change', filterCompanies);

  const companyArea = $('#companyArea');
  if (companyArea && !companyArea.dataset.companyDetailBound) {
    companyArea.dataset.companyDetailBound = '1';
    companyArea.addEventListener('click', event => {
      if (event.target.closest('button, a, input, select, textarea')) return;
      const row = event.target.closest('[data-company-detail]');
      if (!row) return;
      openCompanyDetail(row.dataset.companyDetail);
    });
  }
}
function filterCompanies() {
  const q = $('#companySearch').value.toLowerCase();
  const status = $('#companyStatus').value;
  const pipelineStage = $('#companyPipeline')?.value || '';
  const list = state.cache.companies.filter(c => {
    const text = [c.name, c.tradeName, c.cnpj, c.industry, c.notes, customFieldSearchText(c), (c.tags || []).join(' ')].join(' ').toLowerCase();
    return (!q || text.includes(q)) && (!status || c.status === status) && (!pipelineStage || c.pipelineStage === pipelineStage);
  });
  $('#companyArea').innerHTML = companiesTable(list);
}
function openCompanyModal(company = null) {
  const isEdit = Boolean(company?.id);
  const usersOptions = `<option value="${esc(state.user?.id || '')}" ${!company?.ownerUserId ? 'selected' : ''}>Usuário atual</option>` + (state.cache.users || []).map(u => `<option value="${u.id}" ${company?.ownerUserId === u.id ? 'selected' : ''}>${esc(u.name)} - ${esc(roleLabels[u.role] || u.role)}</option>`).join('');
  modal({
    title: isEdit ? 'Editar empresa cliente' : 'Nova empresa cliente',
    submitText: isEdit ? 'Salvar alterações' : 'Cadastrar empresa',
    body: `
      <div class="form-grid">
        <div class="field"><label>Nome da empresa *</label><input class="input" name="name" value="${esc(company?.name || '')}" required /></div>
        <div class="field"><label>Nome fantasia</label><input class="input" name="tradeName" value="${esc(company?.tradeName || '')}" /></div>
        <div class="field"><label>CNPJ</label><input class="input" name="cnpj" value="${esc(company?.cnpj || '')}" /></div>
        <div class="field"><label>Ramo de atividade</label><input class="input" name="industry" value="${esc(company?.industry || '')}" placeholder="Varejo / Supermercado" /></div>
        <div class="field"><label>Status</label><select class="select" name="status"><option value="prospect" ${company?.status === 'prospect' ? 'selected' : ''}>Prospect</option><option value="active" ${company?.status === 'active' ? 'selected' : ''}>Ativo</option><option value="former" ${company?.status === 'former' ? 'selected' : ''}>Antigo cliente</option><option value="inactive" ${company?.status === 'inactive' ? 'selected' : ''}>Inativo</option></select></div>
        <div class="field"><label>Etapa do funil</label><select class="select" name="pipelineStage">${Object.entries(pipelineStageLabels).map(([key, label]) => `<option value="${key}" ${(company?.pipelineStage || 'new') === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div>
        <div class="field"><label>Valor estimado</label><input class="input" name="expectedValue" type="number" step="0.01" min="0" value="${esc(company?.expectedValue || '')}" /></div>
        <div class="field"><label>Previsão de fechamento</label><input class="input" name="expectedCloseDate" type="date" value="${company?.expectedCloseDate ? String(company.expectedCloseDate).slice(0, 10) : ''}" /></div>
        <div class="field"><label>Origem</label><input class="input" name="source" value="${esc(company?.source || '')}" placeholder="Coleta de preços IBRE" /></div>
        <div class="field"><label>Cidade</label><input class="input" name="city" value="${esc(company?.city || '')}" /></div>
        <div class="field"><label>Estado</label><input class="input" name="state" value="${esc(company?.state || '')}" /></div>
        <div class="field full"><label>Endereço</label><input class="input" name="address" value="${esc(company?.address || '')}" /></div>
        <div class="field"><label>Responsável interno *</label><select class="select" name="ownerUserId" required>${usersOptions}</select></div>
        <div class="field"><label>Tags separadas por vírgula</label><input class="input" name="tags" value="${esc((company?.tags || []).join(', '))}" /></div>
        <div class="field full"><label>Motivo de perda</label><input class="input" name="lostReason" value="${esc(company?.lostReason || '')}" placeholder="Preencha se a oportunidade foi perdida" /></div>
        ${customFieldsHtml('client_company', company)}
        <div class="field full"><label>Observações</label><textarea name="notes">${esc(company?.notes || '')}</textarea></div>
      </div>`,
    onSubmit: async values => {
      // Validations: name, ownerUserId, cnpj
      if (!values.name || !values.name.trim()) throw new Error('Nome da empresa é obrigatório.');
      if (!values.ownerUserId) throw new Error('Responsável interno é obrigatório.');
      if (!values.cnpj || !validateCNPJ(values.cnpj)) throw new Error('CNPJ inválido.');
      attachCustomFields(values, 'client_company');
      values.tags = tagsFromText(values.tags);
      if (!values.ownerUserId) delete values.ownerUserId;
      await api(isEdit ? `/api/client-companies/${company.id}` : '/api/client-companies', { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(values) });
      setAlert(isEdit ? 'Empresa atualizada.' : 'Empresa cliente cadastrada.');
    }
  });
}


async function openCompanyDetail(companyId) {
  const [company, contacts, interactions] = await Promise.all([
    api(`/api/client-companies/${companyId}`),
    api(`/api/client-contacts?companyId=${companyId}`),
    api(`/api/client-interactions?companyId=${companyId}`)
  ]);
  modal({
    title: company.name,
    submitText: 'Fechar',
    body: `
      <div class="company-detail">
        <div class="card pad">
          <div class="detail-title"><div><h2>${esc(company.name)}</h2><div class="muted">${esc(company.industry || 'Sem ramo informado')}</div></div>${statusBadge(company.status)}</div>
          <div style="height:14px"></div>
          <p><strong>Origem:</strong> ${esc(company.source || '-')}</p>
          <p><strong>Funil:</strong> ${pipelineBadge(company.pipelineStage)} • ${fmtMoney(company.expectedValue)}</p>
          <p><strong>Previsão de fechamento:</strong> ${fmtDateOnly(company.expectedCloseDate)}</p>
          <p><strong>CNPJ:</strong> ${esc(company.cnpj || '-')}</p>
          <p><strong>Local:</strong> ${esc([company.city, company.state].filter(Boolean).join(' / ') || '-')}</p>
          <p><strong>Responsável:</strong> ${esc(company.ownerName || '-')}</p>
          <div class="detail-grid">${customFieldsDetailHtml('client_company', company)}</div>
          <p><strong>Observações:</strong><br /><span class="muted">${esc(company.notes || '-')}</span></p>
          <div class="tag-list">${(company.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
          <div style="height:16px"></div>
          <div class="split-actions">
            ${canEditCompany() ? `<button class="btn" type="button" id="editCompanyFromDetail">Editar empresa</button>` : '<span class="badge">Somente leitura</span>'}
            ${has('client_contacts.create') ? `<button class="btn primary" type="button" id="newContactFromDetail">Novo contato</button>` : ''}
            ${has('tasks.create') ? `<button class="btn" type="button" id="newTaskFromCompanyDetail">Nova tarefa</button>` : ''}
          </div>
        </div>
        <div class="grid">
          <div class="card pad"><h2>Contatos vinculados</h2><div style="height:12px"></div>${contacts.length ? contacts.map(c => `<div style="padding:10px 0;border-bottom:1px solid var(--border)"><strong>${esc(c.name)}</strong><div class="muted small">${esc(c.position || '-')} • ${esc(c.email || c.phone || c.whatsapp || '-')}</div>${c.email && has('client_interactions.create') ? `<div style="height:8px"></div><button class="btn" type="button" data-email-contact="${c.id}">Enviar e-mail</button>` : ''}</div>`).join('') : '<div class="empty">Nenhum contato.</div>'}</div>
          <div class="card pad"><h2>Linha de relacionamento</h2><div style="height:12px"></div><div class="timeline">${interactions.length ? interactions.slice(0, 6).map(i => `<div class="timeline-item"><strong>${esc(i.subject)}</strong><div class="muted small">${esc(channelLabels[i.channel] || i.channel)} • ${fmtDate(i.createdAt)} • ${esc(i.contactName || 'Sem contato')}</div><p>${esc(i.description)}</p></div>`).join('') : '<div class="empty">Nenhuma interação.</div>'}</div></div>
        </div>
      </div>`,
    onSubmit: async () => {}
  });
  setTimeout(() => {
    $('#editCompanyFromDetail')?.addEventListener('click', () => { $('.modal-backdrop')?.remove(); openCompanyModal(company); });
    $('#newContactFromDetail')?.addEventListener('click', () => { $('.modal-backdrop')?.remove(); openContactModal({ companyId: company.id }); });
    $('#newTaskFromCompanyDetail')?.addEventListener('click', () => { $('.modal-backdrop')?.remove(); openTaskModal({ companyId: company.id }); });
    $all('[data-email-contact]').forEach(btn => btn.addEventListener('click', () => {
      const contact = contacts.find(c => c.id === btn.dataset.emailContact);
      openEmailModal({ company, contact });
    }));
  });
}

async function viewContacts() {
  await ensureCustomFields();
  const [contacts, companies] = await Promise.all([api('/api/client-contacts'), api('/api/client-companies')]);
  state.cache.contacts = contacts;
  state.cache.companies = companies;
  setTimeout(bindContactEvents);
  const actions = has('client_contacts.create') ? `<button class="btn primary" id="newContact">+ Novo contato</button>` : '';
  return `${pageHeader('Contatos', 'Pessoas vinculadas às empresas clientes.', '👥', actions)}
    <div class="tabs"><button class="tab" data-route="companies">Empresas</button><button class="tab" data-route="prospects">Prospecção</button><button class="tab active">Contatos</button><button class="tab" data-route="interactions">Relacionamentos</button></div>
    <div class="toolbar"><div class="filters"><input class="input" id="contactSearch" style="width:280px" placeholder="Buscar contato, e-mail, telefone..." /><select class="select" id="contactCompany" style="width:260px"><option value="">Todas as empresas</option>${companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div></div>
    <div id="contactArea">${contactsTable(contacts)}</div>`;
}
function contactsTable(contacts) {
  if (!contacts.length) return '<div class="card empty">Nenhum contato cadastrado.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Contato</th><th>Empresa</th><th>Cargo</th><th>Comunicação</th><th>Preferência</th>${customTableHeaders('client_contact')}<th>Última interação</th><th>Status</th><th>Ações</th></tr></thead><tbody>
    ${contacts.map(c => `<tr class="clickable" data-contact-detail="${c.id}">
      <td><strong>${esc(c.name)}</strong><div class="muted small">${esc(c.email || '-')}</div></td>
      <td>${esc(c.companyName || '-')}</td>
      <td>${esc(c.position || '-')}</td>
      <td><div class="small">Tel: ${esc(c.phone || '-')}</div><div class="small">WhatsApp: ${esc(c.whatsapp || '-')}</div></td>
      <td>${esc(channelLabels[c.preferredChannel] || c.preferredChannel)}</td>
      ${customTableCells('client_contact', c)}
      <td>${fmtDateOnly(c.lastInteractionAt)}</td>
      <td>${statusBadge(c.status)}</td>
      <td><div class="split-actions">${has('client_contacts.update') ? `<button class="btn" data-edit-contact="${c.id}">Editar</button>` : ''}${c.email && has('client_interactions.create') ? `<button class="btn" data-email-contact="${c.id}">E-mail</button>` : ''}${has('client_interactions.create') ? `<button class="btn primary" data-new-interaction-contact="${c.id}">Relacionar</button>` : ''}</div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}
function bindContactEvents() {
  $all('[data-route]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.route)));
  $('#newContact')?.addEventListener('click', () => openContactModal());
  $('#contactSearch')?.addEventListener('input', filterContacts);
  $('#contactCompany')?.addEventListener('change', filterContacts);
  bindContactRowActions();
}
function bindContactRowActions() {
  $all('[data-contact-detail]').forEach(row => row.addEventListener('click', () => openContactDetail(row.dataset.contactDetail)));
  $all('[data-edit-contact]').forEach(btn => btn.addEventListener('click', () => openContactModal(state.cache.contacts.find(c => c.id === btn.dataset.editContact))));
  $all('[data-new-interaction-contact]').forEach(btn => {
    const contact = state.cache.contacts.find(c => c.id === btn.dataset.newInteractionContact);
    btn.addEventListener('click', () => openInteractionModal({ companyId: contact.companyId, contactId: contact.id }));
  });
  $all('[data-email-contact]').forEach(btn => {
    const contact = state.cache.contacts.find(c => c.id === btn.dataset.emailContact);
    const company = state.cache.companies.find(c => c.id === contact?.companyId);
    btn.addEventListener('click', () => openEmailModal({ company, contact }));
  });
  $all('[data-edit-contact], [data-new-interaction-contact], [data-email-contact]').forEach(btn => btn.addEventListener('click', event => event.stopPropagation()));
}
function filterContacts() {
  const q = $('#contactSearch').value.toLowerCase();
  const companyId = $('#contactCompany').value;
  const list = state.cache.contacts.filter(c => {
    const text = [c.name, c.email, c.phone, c.whatsapp, c.position, c.companyName, customFieldSearchText(c)].join(' ').toLowerCase();
    return (!q || text.includes(q)) && (!companyId || c.companyId === companyId);
  });
  $('#contactArea').innerHTML = contactsTable(list);
  bindContactRowActions();
}
function openContactModal(contact = null) {
  const companies = state.cache.companies || [];
  const selectedCompany = contact?.companyId || contact?.companyId === '' ? contact.companyId : contact?.companyId;
  modal({
    title: contact?.id ? 'Editar contato' : 'Novo contato',
    submitText: contact?.id ? 'Salvar alterações' : 'Cadastrar contato',
    body: `
      <div class="form-grid">
        <div class="field full"><label>Empresa cliente *</label><select class="select" name="companyId" required ${contact?.id ? 'disabled' : ''}><option value="">Selecione</option>${companies.map(c => `<option value="${c.id}" ${contact?.companyId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Nome *</label><input class="input" name="name" value="${esc(contact?.name || '')}" required /></div>
        <div class="field"><label>Cargo</label><input class="input" name="position" value="${esc(contact?.position || '')}" /></div>
        <div class="field"><label>E-mail</label><input class="input" name="email" type="email" value="${esc(contact?.email || '')}" /></div>
        <div class="field"><label>Telefone</label><input class="input" name="phone" value="${esc(contact?.phone || '')}" /></div>
        <div class="field"><label>WhatsApp</label><input class="input" name="whatsapp" value="${esc(contact?.whatsapp || '')}" /></div>
        <div class="field"><label>Canal preferencial</label><select class="select" name="preferredChannel"><option value="email" ${contact?.preferredChannel === 'email' ? 'selected' : ''}>E-mail</option><option value="phone" ${contact?.preferredChannel === 'phone' ? 'selected' : ''}>Telefone</option><option value="whatsapp" ${contact?.preferredChannel === 'whatsapp' ? 'selected' : ''}>WhatsApp</option><option value="meeting" ${contact?.preferredChannel === 'meeting' ? 'selected' : ''}>Reunião</option></select></div>
        <div class="field"><label>Status</label><select class="select" name="status"><option value="active" ${contact?.status === 'active' ? 'selected' : ''}>Ativo</option><option value="inactive" ${contact?.status === 'inactive' ? 'selected' : ''}>Inativo</option></select></div>
        ${customFieldsHtml('client_contact', contact)}
        <div class="field full"><label>Observações</label><textarea name="notes">${esc(contact?.notes || '')}</textarea></div>
      </div>`,
    onSubmit: async values => {
      // Validations: companyId, name required; optional email/phone validations
      if (!values.companyId) throw new Error('Empresa cliente é obrigatória.');
      if (!values.name || !values.name.trim()) throw new Error('Nome do contato é obrigatório.');
      if (values.email && !validateEmail(values.email)) throw new Error('E-mail inválido.');
      if (values.phone && !validatePhone(values.phone)) throw new Error('Telefone inválido.');
      if (values.whatsapp && !validatePhone(values.whatsapp)) throw new Error('WhatsApp inválido.');
      attachCustomFields(values, 'client_contact');
      if (contact?.id) {
        delete values.companyId;
        await api(`/api/client-contacts/${contact.id}`, { method: 'PUT', body: JSON.stringify(values) });
        setAlert('Contato atualizado.');
      } else {
        await api('/api/client-contacts', { method: 'POST', body: JSON.stringify(values) });
        setAlert('Contato cadastrado.');
      }
    }
  });
}

async function openContactDetail(contactId) {
  const contact = state.cache.contacts?.find(c => c.id === contactId) || (await api('/api/client-contacts')).find(c => c.id === contactId);
  if (!contact) return;
  const interactions = await api(`/api/client-interactions?companyId=${contact.companyId}`);
  const contactInteractions = interactions.filter(i => i.contactId === contact.id);
  modal({
    title: contact.name,
    submitText: 'Fechar',
    body: `
      <div class="detail-stack">
        <div class="detail-title">
          <div>
            <h2>${esc(contact.name)}</h2>
            <div class="muted">${esc(contact.position || 'Cargo não informado')} • ${esc(contact.companyName || '-')}</div>
          </div>
          ${statusBadge(contact.status)}
        </div>
        <div class="detail-grid">
          <div><span class="detail-label">E-mail</span><strong>${esc(contact.email || '-')}</strong></div>
          <div><span class="detail-label">Telefone</span><strong>${esc(contact.phone || '-')}</strong></div>
          <div><span class="detail-label">WhatsApp</span><strong>${esc(contact.whatsapp || '-')}</strong></div>
          <div><span class="detail-label">Canal preferido</span><strong>${esc(channelLabels[contact.preferredChannel] || contact.preferredChannel || '-')}</strong></div>
          ${customFieldsDetailHtml('client_contact', contact)}
        </div>
        <div class="detail-panel">
          <h3>Observações</h3>
          <p class="muted">${esc(contact.notes || 'Nenhuma observação registrada.')}</p>
        </div>
        <div class="split-actions">
          ${has('client_contacts.update') ? `<button class="btn" type="button" id="editContactFromDetail">Editar contato</button>` : ''}
          ${contact.email && has('client_interactions.create') ? `<button class="btn" type="button" id="emailContactFromDetail">Enviar e-mail</button>` : ''}
          ${has('client_interactions.create') ? `<button class="btn primary" type="button" id="newInteractionFromContactDetail">Novo relacionamento</button>` : ''}
        </div>
        <div class="detail-panel">
          <h3>Relacionamentos com este contato</h3>
          <div class="timeline">${contactInteractions.length ? contactInteractions.map(i => `<div class="timeline-item"><strong>${esc(i.subject)}</strong><div class="muted small">${esc(channelLabels[i.channel] || i.channel)} • ${fmtDate(i.createdAt)}</div><p>${esc(i.description)}</p></div>`).join('') : '<div class="empty">Nenhum relacionamento registrado.</div>'}</div>
        </div>
      </div>`,
    onSubmit: async () => {}
  });
  setTimeout(() => {
    $('#editContactFromDetail')?.addEventListener('click', () => { $('.modal-backdrop')?.remove(); openContactModal(contact); });
    $('#emailContactFromDetail')?.addEventListener('click', () => openEmailModal({ company: state.cache.companies?.find(c => c.id === contact.companyId), contact }));
    $('#newInteractionFromContactDetail')?.addEventListener('click', () => { $('.modal-backdrop')?.remove(); openInteractionModal({ companyId: contact.companyId, contactId: contact.id }); });
  });
}

async function viewInteractions() {
  await ensureCustomFields();
  const [interactions, companies, contacts] = await Promise.all([api('/api/client-interactions'), api('/api/client-companies'), api('/api/client-contacts')]);
  state.cache.interactions = interactions;
  state.cache.companies = companies;
  state.cache.contacts = contacts;
  setTimeout(bindInteractionEvents);
  const actions = has('client_interactions.create') ? `<button class="btn primary" id="newInteraction">+ Novo relacionamento</button>` : '';
  return `${pageHeader('Relacionamentos', 'Linha de acompanhamento com clientes e contatos.', '☎', actions)}
    <div class="tabs"><button class="tab" data-route="companies">Empresas</button><button class="tab" data-route="prospects">Prospecção</button><button class="tab" data-route="contacts">Contatos</button><button class="tab active">Relacionamentos</button></div>
    <div class="toolbar">
      <div class="filters">
        <input class="input" id="interactionSearch" style="width:260px" placeholder="Buscar assunto, descrição..." />
        <select class="select" id="interactionCompany" style="width:260px"><option value="">Todas as empresas</option>${companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        <select class="select" id="interactionChannel" style="width:180px"><option value="">Todos os canais</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="whatsapp">WhatsApp</option><option value="meeting">Reunião</option><option value="internal_note">Observação interna</option></select>
      </div>
    </div>
    <div id="interactionArea">${interactionsTable(interactions)}</div>`;
}
function interactionsTable(interactions) {
  if (!interactions.length) return '<div class="card empty">Nenhum relacionamento registrado.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Empresa</th><th>Contato</th><th>Canal</th><th>Assunto</th><th>Responsável</th><th>Resultado</th>${customTableHeaders('client_interaction')}<th>Próxima ação</th><th>Status</th><th>Atualizado por</th></tr></thead><tbody>
    ${interactions.map(i => `<tr class="clickable" data-interaction-detail="${i.id}">
      <td>${fmtDate(i.createdAt)}</td>
      <td>${esc(i.companyName || '-')}</td>
      <td>${esc(i.contactName || '-')}</td>
      <td><span class="badge prospect">${esc(channelLabels[i.channel] || i.channel)}</span><div class="small muted">${esc(directionLabels[i.direction] || i.direction)}</div></td>
      <td><strong>${esc(i.subject)}</strong><div class="muted small">${esc(i.description).slice(0, 120)}${String(i.description || '').length > 120 ? '...' : ''}</div></td>
      <td>${esc(i.userName || '-')}</td>
      <td>${esc(i.outcome || '-')}</td>
      ${customTableCells('client_interaction', i)}
      <td>${fmtDateOnly(i.nextActionAt)}</td>
      <td>${statusBadge(i.status)}</td>
      <td>${esc(i.updatedByUserName || '-')}</td>
    </tr>`).join('')}
  </tbody></table></div>`;
}
function bindInteractionEvents() {
  $all('[data-route]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.route)));
  $('#newInteraction')?.addEventListener('click', () => openInteractionModal());
  $('#interactionSearch')?.addEventListener('input', filterInteractions);
  $('#interactionCompany')?.addEventListener('change', filterInteractions);
  $('#interactionChannel')?.addEventListener('change', filterInteractions);
  bindInteractionRowActions();
}
function bindInteractionRowActions() {
  $all('[data-interaction-detail]').forEach(row => row.addEventListener('click', () => openInteractionDetail(row.dataset.interactionDetail)));
}
function filterInteractions() {
  const q = $('#interactionSearch').value.toLowerCase();
  const companyId = $('#interactionCompany').value;
  const channel = $('#interactionChannel').value;
  const list = state.cache.interactions.filter(i => {
    const text = [i.subject, i.description, i.outcome, i.companyName, i.contactName, customFieldSearchText(i)].join(' ').toLowerCase();
    return (!q || text.includes(q)) && (!companyId || i.companyId === companyId) && (!channel || i.channel === channel);
  });
  $('#interactionArea').innerHTML = interactionsTable(list);
  bindInteractionRowActions();
}
function openInteractionModal(prefill = {}) {
  const companies = state.cache.companies || [];
  const contacts = state.cache.contacts || [];
  modal({
    title: 'Novo relacionamento',
    submitText: 'Registrar interação',
    body: `
      <div class="form-grid">
        <div class="field"><label>Empresa cliente *</label><select class="select" name="companyId" required><option value="">Selecione</option>${companies.map(c => `<option value="${c.id}" ${prefill.companyId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Contato</label><select class="select" name="contactId"><option value="">Sem contato específico</option>${contacts.map(c => `<option value="${c.id}" ${prefill.contactId === c.id ? 'selected' : ''}>${esc(c.name)} — ${esc(c.companyName)}</option>`).join('')}</select></div>
        <div class="field"><label>Canal</label><select class="select" name="channel"><option value="email">E-mail</option><option value="phone">Telefone</option><option value="whatsapp">WhatsApp</option><option value="meeting">Reunião</option><option value="internal_note">Observação interna</option></select></div>
        <div class="field"><label>Direção</label><select class="select" name="direction"><option value="outbound">Enviado / Ativo</option><option value="inbound">Recebido</option><option value="internal">Interno</option></select></div>
        <div class="field full"><label>Assunto *</label><input class="input" name="subject" required placeholder="Confirmação de preços da semana" /></div>
        <div class="field full"><label>Descrição *</label><textarea name="description" required placeholder="Descreva o contato, o que foi alinhado e contexto para outros usuários..."></textarea></div>
        <div class="field"><label>Resultado</label><input class="input" name="outcome" placeholder="Aguardando retorno" /></div>
        <div class="field"><label>Próxima ação</label><input class="input" type="datetime-local" name="nextActionAt" /></div>
        <div class="field"><label>Status</label><select class="select" name="status"><option value="open">Aberto</option><option value="done">Concluído</option><option value="lost">Perdido</option></select></div>
        ${customFieldsHtml('client_interaction', prefill)}
      </div>`,
    onSubmit: async values => {
      // Validations: companyId, subject, description
      if (!values.companyId) throw new Error('Empresa cliente é obrigatória.');
      if (!values.subject || !values.subject.trim()) throw new Error('Assunto é obrigatório.');
      if (!values.description || !values.description.trim()) throw new Error('Descrição é obrigatória.');
      attachCustomFields(values, 'client_interaction');
      if (!values.contactId) delete values.contactId;
      if (!values.nextActionAt) delete values.nextActionAt;
      await api('/api/client-interactions', { method: 'POST', body: JSON.stringify(values) });
      setAlert('Relacionamento registrado.');
    }
  });
}

function openEmailModal({ company = null, contact = null } = {}) {
  if (!company || !contact?.email) {
    setAlert('Selecione um contato com e-mail cadastrado.', 'error');
    return render();
  }
  modal({
    title: `Enviar e-mail para ${contact.name}`,
    submitText: 'Enviar pelo CRM',
    body: `
      <div class="form-grid">
        <div class="field"><label>Empresa</label><input class="input" value="${esc(company.name || '-')}" disabled /></div>
        <div class="field"><label>Destinatario</label><input class="input" name="to" type="email" value="${esc(contact.email)}" required /></div>
        <div class="field full"><label>Assunto *</label><input class="input" name="subject" value="Contato - ${esc(company.name || 'CRM')}" required /></div>
        <div class="field full"><label>Mensagem *</label><textarea name="message" required placeholder="Escreva a mensagem para o cliente..."></textarea></div>
        <div class="alert full">
          O e-mail fica registrado automaticamente na linha de relacionamentos. Sem SMTP configurado, o sistema usa modo simulado para testes.
        </div>
      </div>`,
    onSubmit: async values => {
      const result = await api('/api/client-interactions/send-email', {
        method: 'POST',
        body: JSON.stringify({
          companyId: company.id,
          contactId: contact.id,
          to: values.to,
          subject: values.subject,
          message: values.message
        })
      });
      setAlert(result.email?.simulated ? 'E-mail registrado em modo simulado.' : 'E-mail enviado e registrado no relacionamento.');
    }
  });
}

function openInteractionDetail(interactionId) {
  const interaction = state.cache.interactions?.find(i => i.id === interactionId);
  if (!interaction) return;
  modal({
    title: interaction.subject,
    submitText: 'Fechar',
    body: `
      <div class="detail-stack">
        <div class="detail-title">
          <div>
            <h2>${esc(interaction.subject)}</h2>
            <div class="muted">${fmtDate(interaction.createdAt)} • ${esc(interaction.companyName || '-')}</div>
          </div>
          ${statusBadge(interaction.status)}
        </div>
        <div class="detail-grid">
          <div><span class="detail-label">Contato</span><strong>${esc(interaction.contactName || 'Sem contato específico')}</strong></div>
          <div><span class="detail-label">Canal</span><strong>${esc(channelLabels[interaction.channel] || interaction.channel || '-')}</strong></div>
          <div><span class="detail-label">Direção</span><strong>${esc(directionLabels[interaction.direction] || interaction.direction || '-')}</strong></div>
          <div><span class="detail-label">Responsável</span><strong>${esc(interaction.userName || '-')}</strong></div>
          <div><span class="detail-label">Próxima ação</span><strong>${fmtDate(interaction.nextActionAt)}</strong></div>
          <div><span class="detail-label">Resultado</span><strong>${esc(interaction.outcome || '-')}</strong></div>
          <div><span class="detail-label">Atualizado por</span><strong>${esc(interaction.updatedByUserName || '-')}</strong></div>
          ${customFieldsDetailHtml('client_interaction', interaction)}
        </div>
        ${has('client_interactions.update') ? `<div class="detail-panel"><h3>Status do relacionamento</h3><div class="form-grid"><div class="field"><label>Status</label><select class="select" id="interactionStatusUpdate"><option value="open" ${interaction.status === 'open' ? 'selected' : ''}>Aberto</option><option value="done" ${interaction.status === 'done' ? 'selected' : ''}>Concluído</option><option value="lost" ${interaction.status === 'lost' ? 'selected' : ''}>Perdido</option></select></div><div class="field"><label>&nbsp;</label><button class="btn primary" type="button" id="saveInteractionStatus">Atualizar status</button></div></div></div>` : ''}
        <div class="detail-panel">
          <h3>Diálogo registrado</h3>
          <p>${esc(interaction.description)}</p>
        </div>
      </div>`,
    onSubmit: async () => {}
  });
  setTimeout(() => {
    $('#saveInteractionStatus')?.addEventListener('click', async () => {
      try {
        await api(`/api/client-interactions/${interaction.id}`, { method: 'PUT', body: JSON.stringify({ status: $('#interactionStatusUpdate').value }) });
        $('.modal-backdrop')?.remove();
        setAlert('Status atualizado.');
        await render();
      } catch (error) {
        $('.modal-backdrop')?.remove();
        setAlert(error.message, 'error');
        await render();
      }
    });
  });
}

async function viewTasks() {
  const [tasks, companies, contacts, users] = await Promise.all([
    api('/api/tasks'),
    api('/api/client-companies'),
    has('client_contacts.read') ? api('/api/client-contacts').catch(() => []) : Promise.resolve([]),
    has('users.read') ? api('/api/users').catch(() => []) : Promise.resolve([])
  ]);
  state.cache.tasks = tasks;
  state.cache.companies = companies;
  state.cache.contacts = contacts;
  state.cache.users = users;
  setTimeout(bindTaskEvents);
  const actions = has('tasks.create') ? `<button class="btn primary" id="newTask">+ Nova tarefa</button>` : '';
  return `${pageHeader('Tarefas e Lembretes', 'Pendências vinculadas a empresas, contatos e responsáveis.', '✓', actions)}
    <div class="tabs"><button class="tab" data-route="companies">Empresas</button><button class="tab" data-route="prospects">Prospecção</button><button class="tab" data-route="interactions">Relacionamentos</button><button class="tab active">Tarefas</button></div>
    <div class="toolbar">
      <div class="filters">
        <input class="input" id="taskSearch" style="width:260px" placeholder="Buscar tarefa, empresa..." />
        <select class="select" id="taskCompany" style="width:240px"><option value="">Todas as empresas</option>${companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      </div>
    </div>
    <div id="taskArea">${tasksKanban(tasks)}</div>`;
}

function tasksTable(tasks) {
  if (!tasks.length) return '<div class="card empty">Nenhuma tarefa cadastrada.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Tarefa</th><th>Empresa</th><th>Responsável</th><th>Prazo</th><th>Prioridade</th><th>Status</th><th>Ações</th></tr></thead><tbody>
    ${tasks.map(t => `<tr class="clickable" data-task-detail="${t.id}">
      <td><strong>${esc(t.title)}</strong><div class="muted small">${esc(t.description || '-')}</div></td>
      <td>${esc(t.companyName || '-')}<div class="muted small">${esc(t.contactName || '')}</div></td>
      <td>${esc(t.assignedUserName || '-')}</td>
      <td>${fmtDate(t.dueAt)}</td>
      <td>${priorityBadge(t.priority)}</td>
      <td>${taskStatusBadge(t.status)}</td>
      <td><div class="split-actions">
        ${has('tasks.update') ? `<button class="btn" data-edit-task="${t.id}">Editar</button><button class="btn success" data-complete-task="${t.id}" ${t.status === 'done' ? 'disabled' : ''}>Concluir</button>` : ''}
        ${has('tasks.delete') ? `<button class="btn danger" data-delete-task="${t.id}">Remover</button>` : ''}
      </div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function tasksKanban(tasks) {
  if (!tasks.length) return '<div class="card empty">Nenhuma tarefa cadastrada.</div>';
  const statuses = Object.keys(taskStatusLabels);
  return `<div class="tasks-board">
    ${statuses.map(status => {
      const items = tasks.filter(t => (t.status || 'open') === status);
      return `<section class="task-column">
        <header><strong>${esc(taskStatusLabels[status])}</strong><span>${items.length}</span></header>
        <div class="task-list" data-status="${status}">
          ${items.map(t => `<article class="task-card" draggable="true" data-task-id="${t.id}" data-task-status="${t.status || 'open'}">
            <div class="task-card-header">
              <strong>${esc(t.title)}</strong>
              ${priorityBadge(t.priority)}
            </div>
            <div class="muted small">${esc(t.description || t.companyName || '-')}</div>
            <div class="task-meta">
              <span>${esc(t.companyName || '-')}</span>
              <span>${fmtDateOnly(t.dueAt)}</span>
            </div>
            <div class="task-assignee">${esc(t.assignedUserName || 'Não atribuído')}</div>
            <div class="split-actions" style="margin-top:8px;">
              ${has('tasks.update') ? `<button class="btn" data-edit-task="${t.id}">Editar</button>` : ''}
              ${has('tasks.delete') ? `<button class="btn danger" data-delete-task="${t.id}">Remover</button>` : ''}
            </div>
          </article>`).join('') || '<div class="empty mini">Sem tarefas neste status.</div>'}
        </div>
      </section>`;
    }).join('')}
  </div>`;
}

function bindTaskEvents() {
  $all('[data-route]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.route)));
  $('#newTask')?.addEventListener('click', () => openTaskModal());
  $('#taskSearch')?.addEventListener('input', filterTasks);
  $('#taskCompany')?.addEventListener('change', filterTasks);
  bindTaskRowActions();
  bindTaskDragAndDrop();
}

function bindTaskRowActions() {
  $all('[data-edit-task]').forEach(btn => btn.addEventListener('click', event => {
    event.stopPropagation();
    openTaskModal(state.cache.tasks.find(t => t.id === btn.dataset.editTask));
  }));
  $all('[data-complete-task]').forEach(btn => btn.addEventListener('click', async event => {
    event.stopPropagation();
    await api(`/api/tasks/${btn.dataset.completeTask}`, { method: 'PUT', body: JSON.stringify({ status: 'done' }) });
    setAlert('Tarefa concluída.');
    await render();
  }));
  $all('[data-delete-task]').forEach(btn => btn.addEventListener('click', async event => {
    event.stopPropagation();
    if (!confirm('Remover esta tarefa?')) return;
    await api(`/api/tasks/${btn.dataset.deleteTask}`, { method: 'DELETE' });
    setAlert('Tarefa removida.');
    await render();
  }));
}

function filterTasks() {
  const q = $('#taskSearch').value.toLowerCase();
  const companyId = $('#taskCompany').value;
  const list = state.cache.tasks.filter(t => {
    const text = [t.title, t.description, t.companyName, t.contactName, t.assignedUserName].join(' ').toLowerCase();
    return (!q || text.includes(q)) && (!companyId || t.companyId === companyId);
  });
  $('#taskArea').innerHTML = tasksKanban(list);
  bindTaskRowActions();
  bindTaskDragAndDrop();
}

function bindTaskDragAndDrop() {
  const cards = $all('[data-task-id]');
  const lists = $all('.task-list');

  cards.forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('taskId', card.dataset.taskId);
    });
    card.addEventListener('dragend', e => {
      $all('.task-list').forEach(l => l.classList.remove('drag-over'));
    });
  });

  lists.forEach(list => {
    list.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.classList.add('drag-over');
    });
    list.addEventListener('dragleave', e => {
      if (e.target === list) list.classList.remove('drag-over');
    });
    list.addEventListener('drop', async e => {
      e.preventDefault();
      list.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('taskId');
      const newStatus = list.dataset.status;
      if (!taskId || !newStatus) return;
      try {
        await api(`/api/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
        setAlert('Tarefa movida.');
        await render();
      } catch (error) {
        setAlert(error.message, 'error');
      }
    });
  });
}

function openTaskModal(task = {}) {
  const isEdit = Boolean(task?.id);
  const companies = state.cache.companies || [];
  const contacts = state.cache.contacts || [];
  const users = state.cache.users || [];
  modal({
    title: isEdit ? 'Editar tarefa' : 'Nova tarefa',
    submitText: isEdit ? 'Salvar alterações' : 'Cadastrar tarefa',
    body: `
      <div class="form-grid">
        <div class="field full"><label>Título *</label><input class="input" name="title" value="${esc(task?.title || '')}" required /></div>
        <div class="field"><label>Empresa</label><select class="select" name="companyId"><option value="">Sem empresa</option>${companies.map(c => `<option value="${c.id}" ${task?.companyId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Contato</label><select class="select" name="contactId"><option value="">Sem contato</option>${contacts.map(c => `<option value="${c.id}" ${task?.contactId === c.id ? 'selected' : ''}>${esc(c.name)} — ${esc(c.companyName || '')}</option>`).join('')}</select></div>
        <div class="field"><label>Responsável</label><select class="select" name="assignedUserId"><option value="">Eu mesmo</option>${users.map(u => `<option value="${u.id}" ${task?.assignedUserId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Prazo</label><input class="input" type="datetime-local" name="dueAt" value="${task?.dueAt ? String(task.dueAt).slice(0, 16) : ''}" /></div>
        <div class="field"><label>Prioridade</label><select class="select" name="priority">${Object.entries(taskPriorityLabels).map(([key, label]) => `<option value="${key}" ${(task?.priority || 'medium') === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div>
        <div class="field"><label>Status</label><select class="select" name="status">${Object.entries(taskStatusLabels).map(([key, label]) => `<option value="${key}" ${(task?.status || 'open') === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div>
        <div class="field full"><label>Descrição</label><textarea name="description">${esc(task?.description || '')}</textarea></div>
      </div>`,
    onSubmit: async values => {
      if (!values.companyId) delete values.companyId;
      if (!values.contactId) delete values.contactId;
      if (!values.assignedUserId) delete values.assignedUserId;
      if (!values.dueAt) delete values.dueAt;
      await api(isEdit ? `/api/tasks/${task.id}` : '/api/tasks', { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(values) });
      setAlert(isEdit ? 'Tarefa atualizada.' : 'Tarefa cadastrada.');
    }
  });
}

async function viewUsers() {
  const users = await api('/api/users');
  state.cache.users = users;
  setTimeout(bindUsersEvents);
  const actions = has('users.create') ? `<button class="btn primary" id="newUser">+ Novo usuário</button>` : '';
  return `${pageHeader('Usuários e Acessos', 'Colaboradores da empresa e perfis de permissão.', '🛡', actions)}
    <div class="card pad"><p class="muted">As permissões são aplicadas no frontend para esconder abas e no backend para bloquear rotas REST. Operadores, por exemplo, não visualizam administração de usuários.</p></div>
    <div style="height:18px"></div>
    ${usersTable(users, false)}`;
}
function usersTable(users, developerMode = false) {
  if (!users.length) return '<div class="card empty">Nenhum usuário cadastrado.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Criado em</th><th>Ações</th></tr></thead><tbody>
    ${users.map(u => `<tr>
      <td><strong>${esc(u.name)}</strong></td>
      <td>${esc(u.email)}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${statusBadge(u.status)}</td>
      <td>${fmtDateOnly(u.created_at || u.createdAt)}</td>
      <td><div class="split-actions">${developerMode || has('users.update') ? `<button class="btn" data-edit-user="${u.id}">Editar</button>` : ''}${developerMode || has('users.delete') ? `<button class="btn danger" data-delete-user="${u.id}">Remover</button>` : ''}</div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}
function bindUsersEvents() {
  $('#newUser')?.addEventListener('click', () => openUserModal());
  bindUserRowActions(false);
}
function bindUserRowActions(developerMode) {
  $all('[data-edit-user]').forEach(btn => btn.addEventListener('click', () => {
    const user = state.cache.users.find(u => u.id === btn.dataset.editUser);
    openUserModal(user, developerMode);
  }));
  $all('[data-delete-user]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Remover este usuário?')) return;
    try {
      await api(developerMode ? `/api/developer/users/${btn.dataset.deleteUser}` : `/api/users/${btn.dataset.deleteUser}`, { method: 'DELETE' });
      setAlert('Usuário removido.');
      await render();
    } catch (error) {
      setAlert(error.message, 'error');
      await render();
    }
  }));
}
function openUserModal(user = null, developerMode = false, tenantId = null) {
  const isEdit = Boolean(user?.id);
  modal({
    title: isEdit ? 'Editar usuário' : 'Novo usuário',
    submitText: isEdit ? 'Salvar alterações' : 'Cadastrar usuário',
    body: `
      <div class="form-grid">
        <div class="field"><label>Nome *</label><input class="input" name="name" value="${esc(user?.name || '')}" required /></div>
        <div class="field"><label>E-mail *</label><input class="input" name="email" type="email" value="${esc(user?.email || '')}" ${isEdit ? 'disabled' : 'required'} /></div>
        ${isEdit ? '' : '<div class="field"><label>Senha inicial</label><input class="input" name="password" value="123456" /></div>'}
        <div class="field"><label>Perfil</label><select class="select" name="role">
          <option value="ADMIN_MASTER" ${user?.role === 'ADMIN_MASTER' ? 'selected' : ''}>Admin Master</option>
          <option value="ADMIN" ${user?.role === 'ADMIN' ? 'selected' : ''}>Admin</option>
          <option value="MANAGER" ${user?.role === 'MANAGER' ? 'selected' : ''}>Gerente</option>
          <option value="OPERATOR" ${user?.role === 'OPERATOR' ? 'selected' : ''}>Operador</option>
        </select></div>
        <div class="field"><label>Status</label><select class="select" name="status"><option value="active" ${user?.status === 'active' ? 'selected' : ''}>Ativo</option><option value="inactive" ${user?.status === 'inactive' ? 'selected' : ''}>Inativo</option></select></div>
      </div>`,
    onSubmit: async values => {
      if (isEdit) {
        delete values.email;
        delete values.password;
        await api(developerMode ? `/api/developer/users/${user.id}` : `/api/users/${user.id}`, { method: 'PUT', body: JSON.stringify(values) });
        setAlert('Usuário atualizado.');
      } else {
        const url = developerMode ? `/api/developer/tenants/${tenantId}/users` : '/api/users';
        await api(url, { method: 'POST', body: JSON.stringify(values) });
        setAlert('Usuário cadastrado.');
      }
    }
  });
}



async function viewSettings() {
  await ensureCustomFields();
  setTimeout(bindSettingsEvents);
  const p = state.user.preferences || {};
  return `${pageHeader('Configurações', 'Preferências da conta e comportamento visual.', '⚙', '<button class="btn" id="restorePrefs">Restaurar padrão</button><button class="btn primary" id="savePrefs">Salvar alterações</button>')}
    <div class="grid grid-2">
      <div class="card"><div class="card-head"><div><h2>Notificações</h2><div class="muted small">Como você quer ser avisado</div></div><div class="page-title-icon">🔔</div></div><div class="card-body">
        ${toggleRow('notifyAssigned', 'Novas demandas atribuídas', 'Email quando receber uma demanda', p.notifyAssigned !== false)}
        ${toggleRow('notifyComments', 'Comentários nas suas demandas', 'Notificar em tempo real', p.notifyComments !== false)}
        ${toggleRow('notifySla', 'SLA prestes a vencer', '3 dias antes do prazo', p.notifySla !== false)}
        ${toggleRow('weeklyReport', 'Relatório semanal', 'Toda segunda-feira', Boolean(p.weeklyReport))}
      </div></div>
      <div class="card"><div class="card-head"><div><h2>Seguranca</h2><div class="muted small">Acesso da sua conta</div></div><div class="page-title-icon">SEC</div></div><div class="card-body">
        <p class="muted">Atualize sua senha periodicamente para reduzir riscos de acesso indevido.</p>
        <button class="btn primary" id="changePassword" type="button">Trocar senha</button>
      </div></div>
    </div>
    ${isAdminMaster() ? customFieldsSettingsHtml() : ''}`;
}
function toggleRow(id, title, subtitle, checked) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--border)"><div><strong>${esc(title)}</strong><div class="muted small">${esc(subtitle)}</div></div><label style="display:inline-flex;align-items:center;gap:8px"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} /> <span class="badge ${checked ? 'active' : ''}">${checked ? 'Ativo' : 'Off'}</span></label></div>`;
}

function customFieldsSettingsHtml() {
  const fields = state.cache.customFields || [];
  return `<div style="height:18px"></div>
    <div class="card pad">
      <div class="page-head">
        <div><h2>Campos customizados</h2><div class="muted small">Disponiveis nas tabelas de clientes, contatos e relacionamentos.</div></div>
        <button class="btn primary" id="newCustomField" type="button">+ Novo campo</button>
      </div>
      ${fields.length ? `<div class="table-wrap"><table><thead><tr><th>Tabela</th><th>Campo</th><th>Tipo</th><th>Obrigatorio</th><th>Acoes</th></tr></thead><tbody>
        ${fields.map(field => `<tr>
          <td>${esc(customEntityLabels[field.entityType] || field.entityType)}</td>
          <td><strong>${esc(field.label)}</strong><div class="muted small">${esc(field.fieldKey)}</div></td>
          <td>${esc(customFieldTypeLabels[field.fieldType] || field.fieldType)}</td>
          <td>${field.isRequired ? 'Sim' : 'Nao'}</td>
          <td><div class="split-actions"><button class="btn" data-edit-custom-field="${field.id}">Editar</button><button class="btn danger" data-delete-custom-field="${field.id}">Remover</button></div></td>
        </tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Nenhum campo customizado cadastrado.</div>'}
    </div>`;
}

function openCustomFieldModal(field = null) {
  const isEdit = Boolean(field?.id);
  modal({
    title: isEdit ? 'Editar campo customizado' : 'Novo campo customizado',
    submitText: isEdit ? 'Salvar alteracoes' : 'Criar campo',
    body: `
      <div class="form-grid">
        <div class="field"><label>Tabela *</label><select class="select" name="entityType" ${isEdit ? 'disabled' : ''} required>
          ${Object.entries(customEntityLabels).map(([key, label]) => `<option value="${key}" ${field?.entityType === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}
        </select></div>
        <div class="field"><label>Nome do campo *</label><input class="input" name="label" value="${esc(field?.label || '')}" required /></div>
        <div class="field"><label>Tipo</label><select class="select" name="fieldType">
          ${Object.entries(customFieldTypeLabels).map(([key, label]) => `<option value="${key}" ${field?.fieldType === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}
        </select></div>
        <div class="field"><label>Ordem</label><input class="input" type="number" name="sortOrder" value="${esc(field?.sortOrder || 0)}" /></div>
        <div class="field full"><label>Opcoes para lista</label><input class="input" name="options" value="${esc((field?.options || []).join(', '))}" placeholder="Opcao A, Opcao B" /></div>
        <div class="field"><label><input type="checkbox" data-checkbox name="isRequired" ${field?.isRequired ? 'checked' : ''} /> Obrigatorio</label></div>
      </div>`,
    onSubmit: async values => {
      values.options = tagsFromText(values.options);
      values.sortOrder = Number(values.sortOrder || 0);
      if (isEdit) delete values.entityType;
      await api(isEdit ? `/api/custom-fields/${field.id}` : '/api/custom-fields', { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(values) });
      state.cache.customFields = null;
      setAlert(isEdit ? 'Campo atualizado.' : 'Campo customizado criado.');
    }
  });
}

function openChangePasswordModal() {
  modal({
    title: 'Trocar senha',
    submitText: 'Atualizar senha',
    body: `
      <div class="form-grid">
        <div class="field full"><label>Senha atual *</label><input class="input" name="currentPassword" type="password" required /></div>
        <div class="field"><label>Nova senha *</label><input class="input" name="newPassword" type="password" minlength="8" required /></div>
        <div class="field"><label>Confirmar nova senha *</label><input class="input" name="confirmPassword" type="password" minlength="8" required /></div>
        <div class="alert full">Use pelo menos 8 caracteres. A nova senha deve ser diferente da senha atual.</div>
      </div>`,
    onSubmit: async values => {
      await api('/api/me/password', { method: 'PUT', body: JSON.stringify(values) });
      setAlert('Senha atualizada com sucesso.');
    }
  });
}

function bindSettingsEvents() {
  $('#changePassword')?.addEventListener('click', () => openChangePasswordModal());
  $('#newCustomField')?.addEventListener('click', () => openCustomFieldModal());
  $all('[data-edit-custom-field]').forEach(btn => btn.addEventListener('click', () => {
    const field = (state.cache.customFields || []).find(item => item.id === btn.dataset.editCustomField);
    openCustomFieldModal(field);
  }));
  $all('[data-delete-custom-field]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Remover este campo customizado? Os valores ja preenchidos permanecem no historico dos registros.')) return;
    try {
      await api(`/api/custom-fields/${btn.dataset.deleteCustomField}`, { method: 'DELETE' });
      state.cache.customFields = null;
      setAlert('Campo customizado removido.');
      await render();
    } catch (error) {
      setAlert(error.message, 'error');
      await render();
    }
  }));
  $('#restorePrefs')?.addEventListener('click', async () => {
    const preferences = { notifyAssigned: true, notifyComments: true, notifySla: true, weeklyReport: false, animations: true, collapseSidebar: false };
    const result = await api('/api/me/preferences', { method: 'PUT', body: JSON.stringify({ preferences }) });
    state.user.preferences = result.preferences;
    localStorage.setItem('crm_user', JSON.stringify(state.user));
    setAlert('Preferências restauradas.');
    await render();
  });
  $('#savePrefs')?.addEventListener('click', async () => {
    const preferences = {
      notifyAssigned: $('#notifyAssigned').checked,
      notifyComments: $('#notifyComments').checked,
      notifySla: $('#notifySla').checked,
      weeklyReport: $('#weeklyReport').checked,
      animations: $('#animations').checked,
      collapseSidebar: $('#collapseSidebar').checked
    };
    const result = await api('/api/me/preferences', { method: 'PUT', body: JSON.stringify({ preferences }) });
    state.user.preferences = result.preferences;
    localStorage.setItem('crm_user', JSON.stringify(state.user));
    setAlert('Preferências salvas.');
    await render();
  });
}

async function viewDeveloperDashboard() {
  const data = await api('/api/developer/summary');
  setTimeout(() => $('#goTenants')?.addEventListener('click', () => navigate('developer-tenants')));
  return `${pageHeader('Painel do Desenvolvedor', 'Administração global da plataforma CRM SaaS.', '▦')}
    <div class="grid grid-4">
      <div class="card stat"><div class="label">Empresas contratantes</div><div class="value">${data.tenants}</div><div class="muted small">Tenants cadastrados</div></div>
      <div class="card stat"><div class="label">Usuários</div><div class="value">${data.users}</div><div class="muted small">Colaboradores dos clientes</div></div>
      <div class="card stat"><div class="label">Empresas clientes</div><div class="value">${data.clientCompanies}</div><div class="muted small">B2B no CRM</div></div>
      <div class="card stat"><div class="label">Relacionamentos</div><div class="value">${data.interactions}</div><div class="muted small">Interações registradas</div></div>
    </div>
    <div style="height:18px"></div>
    <div class="card pad"><h2>Próxima etapa operacional</h2><p class="muted">Cadastre empresas contratantes do CRM, defina domínio e adicione os colaboradores com seus perfis. Cada tenant fica isolado no PostgreSQL por tenant_id.</p><button class="btn primary" id="goTenants">Gerenciar empresas contratantes</button></div>`;
}

async function viewDeveloperTenants() {
  const tenants = await api('/api/developer/tenants');
  state.cache.tenants = tenants;
  setTimeout(bindDeveloperTenantsEvents);
  return `${pageHeader('Empresas Contratantes', 'Clientes que contrataram a plataforma CRM.', '🏢', '<button class="btn primary" id="newTenant">+ Nova empresa contratante</button>')}
    <div class="table-wrap"><table><thead><tr><th>Empresa</th><th>Domínio</th><th>Plano</th><th>Usuários</th><th>Clientes cadastrados</th><th>Status</th><th>Ações</th></tr></thead><tbody>
    ${tenants.map(t => `<tr><td><strong>${esc(t.name)}</strong><div class="muted small">Criada em ${fmtDateOnly(t.createdAt)}</div></td><td>@${esc(t.domain)}</td><td>${esc(t.plan)}</td><td>${t.usersCount}/${t.maxUsers}</td><td>${t.clientCompaniesCount}</td><td>${statusBadge(t.status)}</td><td><div class="split-actions"><button class="btn" data-edit-tenant="${t.id}">Editar</button><button class="btn primary" data-tenant-users="${t.id}">Usuários</button></div></td></tr>`).join('')}
    </tbody></table></div>`;
}
function bindDeveloperTenantsEvents() {
  $('#newTenant')?.addEventListener('click', () => openTenantModal());
  $all('[data-edit-tenant]').forEach(btn => btn.addEventListener('click', () => openTenantModal(state.cache.tenants.find(t => t.id === btn.dataset.editTenant))));
  $all('[data-tenant-users]').forEach(btn => btn.addEventListener('click', () => { state.cache.selectedTenantId = btn.dataset.tenantUsers; navigate('developer-users'); }));
}
function openTenantModal(tenant = null) {
  modal({
    title: tenant ? 'Editar empresa contratante' : 'Nova empresa contratante',
    submitText: tenant ? 'Salvar alterações' : 'Cadastrar tenant',
    body: `
      <div class="form-grid">
        <div class="field"><label>Nome da empresa *</label><input class="input" name="name" value="${esc(tenant?.name || '')}" required /></div>
        <div class="field"><label>Domínio *</label><input class="input" name="domain" value="${esc(tenant?.domain || '')}" ${tenant ? 'disabled' : 'required'} placeholder="empresa.com" /></div>
        <div class="field"><label>Plano</label><select class="select" name="plan"><option value="starter" ${tenant?.plan === 'starter' ? 'selected' : ''}>Starter</option><option value="professional" ${tenant?.plan === 'professional' ? 'selected' : ''}>Professional</option><option value="enterprise" ${tenant?.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option></select></div>
        <div class="field"><label>Limite de usuários</label><input class="input" type="number" name="maxUsers" value="${esc(tenant?.maxUsers || 50)}" /></div>
        <div class="field"><label>Status</label><select class="select" name="status"><option value="active" ${tenant?.status === 'active' ? 'selected' : ''}>Ativo</option><option value="paused" ${tenant?.status === 'paused' ? 'selected' : ''}>Pausado</option><option value="inactive" ${tenant?.status === 'inactive' ? 'selected' : ''}>Inativo</option></select></div>
        <div class="field"><label>Permitir e-mails externos?</label><label><input type="checkbox" data-checkbox name="allowExternalUsers" ${tenant?.allowExternalUsers ? 'checked' : ''} /> Sim</label></div>
      </div>`,
    onSubmit: async values => {
      if (tenant) delete values.domain;
      values.maxUsers = Number(values.maxUsers || 50);
      await api(tenant ? `/api/developer/tenants/${tenant.id}` : '/api/developer/tenants', { method: tenant ? 'PUT' : 'POST', body: JSON.stringify(values) });
      setAlert(tenant ? 'Empresa contratante atualizada.' : 'Empresa contratante cadastrada.');
    }
  });
}

async function viewDeveloperUsers() {
  const tenants = await api('/api/developer/tenants');
  state.cache.tenants = tenants;
  const selectedTenantId = state.cache.selectedTenantId || tenants[0]?.id;
  state.cache.selectedTenantId = selectedTenantId;
  const users = selectedTenantId ? await api(`/api/developer/tenants/${selectedTenantId}/users`) : [];
  state.cache.users = users;
  setTimeout(bindDeveloperUsersEvents);
  return `${pageHeader('Usuários por Empresa', 'Cadastro manual de colaboradores e permissões por tenant.', '👥', selectedTenantId ? '<button class="btn primary" id="newDeveloperUser">+ Novo usuário</button>' : '')}
    <div class="toolbar"><div class="field" style="min-width:340px"><label>Empresa contratante</label><select class="select" id="developerTenantSelect">${tenants.map(t => `<option value="${t.id}" ${t.id === selectedTenantId ? 'selected' : ''}>${esc(t.name)} — @${esc(t.domain)}</option>`).join('')}</select></div></div>
    ${usersTable(users, true)}`;
}
function bindDeveloperUsersEvents() {
  $('#developerTenantSelect')?.addEventListener('change', async e => { state.cache.selectedTenantId = e.target.value; await render(); });
  $('#newDeveloperUser')?.addEventListener('click', () => openUserModal(null, true, state.cache.selectedTenantId));
  bindUserRowActions(true);
}

async function viewDeveloperSettings() {
  const settings = await api('/api/developer/settings');
  setTimeout(bindDeveloperSettingsEvents);
  return `${pageHeader('Configurações do Desenvolvedor', 'Configurações globais da plataforma.', '⚙')}
    <div class="grid grid-2">
      <div class="card pad"><h2>Segurança SaaS</h2><p class="muted">Esta entrega possui autenticação JWT, hash de senha, isolamento por tenant_id e validação de permissões nas rotas do backend.</p></div>
      <div class="card pad"><h2>Código por e-mail no login</h2><p class="muted">Quando ativo, usuários precisam validar um código de 5 dígitos antes de entrar.</p><div style="height:12px"></div><button class="btn ${settings.loginEmailCodeEnabled ? 'success' : ''}" id="toggleLoginEmailCode" type="button">${settings.loginEmailCodeEnabled ? 'Desativar validação por e-mail' : 'Ativar validação por e-mail'}</button></div>
      <div class="card pad"><h2>Banco de dados</h2><p class="muted">O sistema utiliza PostgreSQL. As tabelas são criadas automaticamente no primeiro start e os dados de demonstração são populados se o banco estiver vazio.</p></div>
      <div class="card pad"><h2>Regras importantes</h2><p class="muted">Não é permitido deixar uma empresa contratante com menos de 2 administradores gerais ativos. O domínio institucional é validado no cadastro de colaboradores.</p></div>
    </div>`;
}

function bindDeveloperSettingsEvents() {
  $('#toggleLoginEmailCode')?.addEventListener('click', async () => {
    try {
      const current = await api('/api/developer/settings');
      await api('/api/developer/settings', { method: 'PUT', body: JSON.stringify({ loginEmailCodeEnabled: !current.loginEmailCodeEnabled }) });
      setAlert('Configuração de login atualizada.');
      await render();
    } catch (error) {
      setAlert(error.message, 'error');
      await render();
    }
  });
}

bootstrap();
