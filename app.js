(() => {
  'use strict';
  const config = window.OPERAVA_CONFIG || {};
  const sessionKey = 'operava-maildesk-session';
  const $ = (selector) => document.querySelector(selector);
  const authView = $('#auth-view'); const mailView = $('#mail-view');
  let session = null; let activeFilter = 'all';
  const configured = () => config.supabaseUrl && !config.supabaseUrl.includes('YOUR_') && config.supabaseAnonKey && !config.supabaseAnonKey.includes('YOUR_') && config.apiBaseUrl && !config.apiBaseUrl.includes('YOUR_');
  const message = (target, text, ok = false) => { target.textContent = text; target.classList.toggle('ok', ok); };
  async function auth(path, options = {}) {
    return fetch(`${config.supabaseUrl}/auth/v1/${path}`, { ...options, headers: { apikey: config.supabaseAnonKey, 'content-type': 'application/json', ...(options.headers || {}) } });
  }
  async function api(path, options = {}) {
    return fetch(`${config.apiBaseUrl.replace(/\/$/, '')}${path}`, { ...options, headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json', ...(options.headers || {}) } });
  }
  function showApp() { authView.hidden = true; mailView.hidden = false; $('#user-email').textContent = session.user.email; loadEmails(); }
  function showLogin() { mailView.hidden = true; authView.hidden = false; }
  async function loadEmails() {
    const list = $('#email-list'); list.innerHTML = '<div class="empty">Loading secure mailbox…</div>';
    try {
      const response = await api('/emails');
      if (response.status === 401) return signOut();
      if (!response.ok) throw new Error('Could not load mailbox');
      const emails = await response.json(); const filtered = activeFilter === 'all' ? emails : emails.filter((email) => email.status === activeFilter);
      $('#count').textContent = emails.length;
      list.innerHTML = filtered.length ? filtered.map((email) => `<article class="email"><div><h3>${escapeHtml(email.subject || '(No subject)')}</h3><p>To ${escapeHtml(email.recipient)} · ${new Date(email.created_at).toLocaleString()}</p></div><span class="badge ${email.status === 'failed' ? 'failed' : ''}">${escapeHtml(email.status)}</span></article>`).join('') : '<div class="empty">No messages in this mailbox yet.</div>';
    } catch (error) { list.innerHTML = `<div class="empty">${escapeHtml(error.message)}. Check your deployment configuration.</div>`; }
  }
  function escapeHtml(value) { const node = document.createElement('div'); node.textContent = value || ''; return node.innerHTML; }
  function signOut() { session = null; localStorage.removeItem(sessionKey); $('#login-form').reset(); showLogin(); }
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const status = $('#auth-message');
    if (!configured()) return message(status, 'Set the public values in app-config.js before signing in.');
    message(status, 'Signing in…', true);
    const response = await auth('token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: $('#email').value, password: $('#password').value }) });
    const data = await response.json();
    if (!response.ok) return message(status, data.error_description || data.msg || 'Unable to sign in.');
    session = data; localStorage.setItem(sessionKey, JSON.stringify(session)); showApp();
  });
  $('#compose').addEventListener('click', () => { $('#composer').hidden = false; $('#to').focus(); });
  $('#close-compose').addEventListener('click', () => { $('#composer').hidden = true; });
  $('#send-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const status = $('#mail-message'); message(status, 'Sending through Resend…', true);
    const response = await api('/emails', { method: 'POST', body: JSON.stringify({ to: $('#to').value, subject: $('#subject').value, html: $('#html').value.replace(/\n/g, '<br>') }) });
    const data = await response.json();
    if (!response.ok) return message(status, data.error || 'Delivery request failed.');
    $('#send-form').reset(); $('#composer').hidden = true; message(status, 'Message accepted by Resend.', true); loadEmails();
  });
  document.querySelectorAll('nav button').forEach((button) => button.addEventListener('click', () => { document.querySelector('nav .active').classList.remove('active'); button.classList.add('active'); activeFilter = button.dataset.filter; loadEmails(); }));
  $('#sign-out').addEventListener('click', signOut);
  try { session = JSON.parse(localStorage.getItem(sessionKey)); } catch (_) { localStorage.removeItem(sessionKey); }
  if (session?.access_token && configured()) showApp(); else showLogin();
})();
