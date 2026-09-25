(() => {
  'use strict';
  const config = window.OPERAVA_CONFIG || {};
  const sessionKey = 'operava-maildesk-session';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const authView = $('#auth-view');
  const mailView = $('#mail-view');
  const mailboxPanel = $('#mailbox-panel');
  const automationPanel = $('#automation-panel');
  const updatesPanel = $('#updates-panel');
  const settingsPanel = $('#settings-panel');
  const agentPanel = $('#agent-panel');
  let session = null;
  let activeFilter = 'all';
  let isAdmin = false;
  const configured = () =>
    !!(config.supabaseUrl && !String(config.supabaseUrl).includes('YOUR_') &&
      config.supabaseAnonKey && !String(config.supabaseAnonKey).includes('YOUR_') &&
      config.apiBaseUrl && !String(config.apiBaseUrl).includes('YOUR_'));
  function message(el, text, ok = false) {
    if (!el) return;
    el.classList.remove('ok', 'error-banner', 'warn-banner', 'ok-banner');
    if (!text) { el.textContent = ''; return; }
    el.textContent = text;
    if (ok === true) el.classList.add('ok', 'ok-banner');
    else el.classList.add('error-banner');
  }
  function setHidden(el, hide) {
    if (!el) return;
    el.hidden = !!hide;
    if (hide) el.setAttribute('hidden', '');
    else el.removeAttribute('hidden');
  }
  function persistSession(next) {
    session = next;
    if (next && next.access_token) localStorage.setItem(sessionKey, JSON.stringify(next));
    else localStorage.removeItem(sessionKey);
  }
  function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }
  async function api(path, options = {}) {
    const skipAuth = !!options.skipAuth;
    const opts = { ...options };
    delete opts.skipAuth;
    if (!skipAuth && (!session || !session.access_token)) {
      showLogin();
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const base = String(config.apiBaseUrl || '').replace(/\/$/, '');
    return fetch(base + path, {
      ...opts,
      headers: {
        ...(skipAuth ? {} : { authorization: 'Bearer ' + session.access_token }),
        'content-type': 'application/json',
        ...(opts.headers || {})
      }
    });
  }
  function showLogin() {
    setHidden(mailView, true);
    setHidden(authView, false);
  }
  function showApp() {
    setHidden(authView, true);
    setHidden(mailView, false);
    const userEl = $('#user-email');
    if (userEl) userEl.textContent = (session && session.user && session.user.email) || '';
    showView('mailbox');
    loadEmails();
  }
  function showView(name) {
    setHidden(mailboxPanel, name !== 'mailbox');
    setHidden(automationPanel, name !== 'automation');
    setHidden(updatesPanel, name !== 'updates');
    setHidden(settingsPanel, name !== 'settings');
    setHidden(agentPanel, name !== 'agent');
    $$('nav button').forEach((btn) => {
      const isActive =
        (name === 'mailbox' && btn.dataset.view === 'mailbox' && btn.dataset.filter === activeFilter) ||
        (name === 'automation' && btn.dataset.view === 'automation') ||
        (name === 'updates' && btn.dataset.view === 'updates') ||
        (name === 'settings' && btn.dataset.view === 'settings') ||
        (name === 'agent' && btn.dataset.view === 'agent');
      btn.classList.toggle('active', isActive);
    });
  }
  async function loadEmails() {
    const list = $('#email-list');
    if (!list) return;
    list.innerHTML = '<div class="empty">Loading mailbox…</div>';
    try {
      const response = await api('/emails');
      if (response.status === 401) return;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load mailbox');
      const emails = Array.isArray(data) ? data : [];
      const filtered =
        activeFilter === 'all' ? emails :
        activeFilter === 'inbound' ? emails.filter((e) => e.direction === 'inbound') :
        emails.filter((e) => e.status === activeFilter);
      const count = $('#count');
      if (count) count.textContent = String(emails.length);
      if (!filtered.length) {
        list.innerHTML = activeFilter === 'inbound'
          ? '<div class="empty">No incoming messages.</div>'
          : '<div class="empty">No messages yet.</div>';
        return;
      }
      list.innerHTML = filtered.map((email) => {
        const inbound = email.direction === 'inbound';
        const party = inbound
          ? 'From ' + escapeHtml(email.from_address || email.recipient || 'unknown')
          : 'To ' + escapeHtml(email.recipient);
        const badge = inbound
          ? '<span class="badge queued">incoming</span>'
          : '<span class="badge ' + (email.status === 'failed' ? 'failed' : email.status === 'sent' ? 'sent' : 'queued') + '">' + escapeHtml(email.status) + '</span>';
        return '<article class="email"><div><h3>' + escapeHtml(email.subject || '(No subject)') +
          '</h3><p>' + party + ' · ' + escapeHtml(new Date(email.created_at).toLocaleString()) +
          '</p></div>' + badge + '</article>';
      }).join('');
    } catch (e) {
      list.innerHTML = '<div class="empty">' + escapeHtml(e.message || 'Could not load mailbox') + '</div>';
    }
  }
  async function loadUpdates() {
    const list = $('#updates-list');
    const countEl = $('#updates-count');
    if (!list) return;
    list.innerHTML = '<div class="empty">Loading updates…</div>';
    try {
      const response = await api('/notifications');
      if (!response.ok) throw new Error('Could not load updates');
      const rows = await response.json();
      if (countEl) countEl.textContent = String(Array.isArray(rows) ? rows.length : 0);
      if (!Array.isArray(rows) || !rows.length) {
        list.innerHTML = '<div class="empty">No updates from Resend yet.</div>';
        return;
      }
      list.innerHTML = rows.map((n) => {
        const when = n.created_at ? new Date(n.created_at).toLocaleString(undefined, {
          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : '';
        return '<div class="bubble" role="status"><div class="bubble-meta">' +
          '<span class="bubble-source">Resend</span>' +
          '<span class="bubble-kind info">' + escapeHtml(n.kind || 'info') + '</span>' +
          (when ? '<span class="bubble-time">' + escapeHtml(when) + '</span>' : '') +
          '</div><p class="bubble-title">' + escapeHtml(n.title || 'Update') + '</p>' +
          (n.body ? '<p class="bubble-body">' + escapeHtml(n.body) + '</p>' : '') +
          '</div>';
      }).join('');
    } catch (e) {
      list.innerHTML = '<div class="empty">' + escapeHtml(e.message || 'Could not load updates') + '</div>';
    }
  }
  const loginForm = $('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = $('#auth-message');
      if (!configured()) {
        message(status, 'Configuration incomplete. Set production values in app-config.js.');
        return;
      }
      const submitBtn = $('#login-submit');
      if (submitBtn) submitBtn.disabled = true;
      message(status, 'Signing in…', true);
      try {
        const response = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: ($('#email') && $('#email').value) || '',
            password: ($('#password') && $('#password').value) || ''
          }),
          skipAuth: true
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          message(status, data.error || 'Incorrect Password and Email id');
          return;
        }
        if (!data.access_token) {
          message(status, 'Sign-in response missing access token.');
          return;
        }
        persistSession(data);
        message(status, '');
        showApp();
      } catch (err) {
        message(status, 'Could not sign in. Check connection and try again.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
  $$('nav button').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.view === 'updates') {
        showView('updates');
        loadUpdates();
        return;
      }
      if (button.dataset.view === 'automation') {
        showView('automation');
        return;
      }
      if (button.dataset.view === 'agent') {
        showView('agent');
        return;
      }
      if (button.dataset.view === 'settings') {
        showView('settings');
        return;
      }
      activeFilter = button.dataset.filter || 'all';
      showView('mailbox');
      loadEmails();
    });
  });
  const signOutBtn = $('#sign-out');
  if (signOutBtn) signOutBtn.addEventListener('click', () => {
    session = null;
    localStorage.removeItem(sessionKey);
    const form = $('#login-form');
    if (form) form.reset();
    showLogin();
  });
  function boot() {
    try {
      showLogin();
      try { session = JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { session = null; }
      if (session && session.access_token && configured()) showApp();
    } catch (e) {
      showLogin();
      message($('#auth-message'), 'App failed to start. Reload the page.');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
