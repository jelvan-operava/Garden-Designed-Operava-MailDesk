(function () {
  var config = window.OPERAVA_CONFIG || {};
  var sessionKey = 'operava-maildesk-session';
  function session() {
    try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch (_) { return null; }
  }
  function apiBase() { return String(config.apiBaseUrl || '').replace(/\/$/, ''); }
  function toast(message) {
    var node = document.createElement('div');
    node.className = 'resend-toast';
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(function () { node.remove(); }, 2800);
  }
  function formatWhen(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return ''; }
  }
  function escapeHtml(v) {
    var d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }
  function eventRows(rows) {
    if (!rows || !rows.length) {
      return '<li><span><b>No events yet</b><br><span class="resend-muted">Live delivery and inbound events from Resend appear here.</span></span></li>';
    }
    return rows.map(function (e) {
      var kind = String(e.kind || e.event_type || 'info');
      var tone = /bounce|fail|error/i.test(kind) ? 'orange' : /click|open/i.test(kind) ? 'gray' : '';
      var title = e.title || e.event_type || kind;
      var body = e.body || '';
      var when = formatWhen(e.created_at);
      return '<li><span><b>' + escapeHtml(title) + '</b><br><span class="resend-muted">' +
        escapeHtml(body) + '</span></span><span style="text-align:right"><b class="resend-badge ' + tone + '">' +
        escapeHtml(kind) + '</b><br><span class="resend-muted">' + escapeHtml(when) + '</span></span></li>';
    }).join('');
  }
  async function loadEvents() {
    var s = session();
    var base = apiBase();
    var live = document.getElementById('resend-live-events');
    var stream = document.getElementById('resend-event-stream');
    if (!base || !s || !s.access_token) {
      var empty = eventRows([]);
      if (live) live.innerHTML = empty;
      if (stream) stream.innerHTML = empty;
      return;
    }
    try {
      var res = await fetch(base + '/notifications', {
        headers: { authorization: 'Bearer ' + s.access_token, 'content-type': 'application/json' }
      });
      if (res.status === 401) { toast('Session expired. Sign in again.'); return; }
      var rows = await res.json().catch(function () { return []; });
      if (!Array.isArray(rows)) rows = [];
      if (live) live.innerHTML = eventRows(rows.slice(0, 3));
      if (stream) stream.innerHTML = eventRows(rows);
    } catch (_) { toast('Could not load delivery events.'); }
  }
  function webhookUrl() {
    return location.origin + '/webhooks/resend';
  }
  function bind() {
    var monitor = document.getElementById('resend-monitor');
    var launcher = document.getElementById('resend-launcher');
    if (!monitor || !launcher) return;
    launcher.addEventListener('click', function () {
      monitor.hidden = false;
      loadEvents();
      var close = document.querySelector('.resend-close');
      if (close) close.focus();
    });
    var closeBtn = document.querySelector('.resend-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { monitor.hidden = true; launcher.focus(); });
    monitor.addEventListener('click', function (e) { if (e.target === monitor) monitor.hidden = true; });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !monitor.hidden) { monitor.hidden = true; launcher.focus(); }
    });
    document.querySelectorAll('.resend-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.resend-tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.resend-pane').forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        var pane = document.getElementById('resend-' + tab.dataset.pane);
        if (pane) pane.classList.add('active');
      });
    });
    var refresh = document.getElementById('resend-refresh');
    if (refresh) refresh.addEventListener('click', function () { loadEvents(); toast('Event stream refreshed.'); });
    var testBtn = document.getElementById('resend-test-webhook');
    if (testBtn) {
      testBtn.textContent = 'Refresh from Worker';
      testBtn.onclick = null;
      testBtn.addEventListener('click', function () { loadEvents(); toast('Loaded live events.'); });
    }
    var copyBtn = document.getElementById('resend-copy-url');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var url = webhookUrl();
      if (navigator.clipboard) navigator.clipboard.writeText(url);
      toast('Webhook endpoint copied.');
    });
    var addAuto = document.getElementById('resend-add-automation');
    if (addAuto) addAuto.style.display = 'none';
    var autoList = document.getElementById('resend-automation-list');
    if (autoList) {
      autoList.innerHTML = '<p class="resend-muted">Automations run on the Worker with human approval.</p>';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  setTimeout(bind, 500);
  setTimeout(loadEvents, 800);
})();
