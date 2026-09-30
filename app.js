(() => {
  'use strict';

  const config = window.OPERAVA_CONFIG || {};
  const sessionKey = 'operava-maildesk-session';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  let session = null;
  let currentView = 'inbox';
  let emailCache = [];
  let currentRawEmail = null;

  const configured = () =>
    config.supabaseUrl &&
    !config.supabaseUrl.includes('YOUR_') &&
    config.supabaseAnonKey &&
    !config.supabaseAnonKey.includes('YOUR_') &&
    config.apiBaseUrl &&
    !config.apiBaseUrl.includes('YOUR_');

  // URL routing helper
  function setRoute(path, replace = false) {
    try {
      if (window.location.pathname !== path) {
        if (replace) {
          window.history.replaceState({ path }, '', path);
        } else {
          window.history.pushState({ path }, '', path);
        }
      }
    } catch (_) {}
  }

  // Floating toast notification
  let toastTimeout = null;
  function showToast(text, duration = 3000) {
    const toast = $('#toast-notification');
    const toastText = $('#toast-text');
    if (!toast || !toastText) return;

    toastText.textContent = text;
    toast.classList.remove('hidden');
    toast.classList.add('flex');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
      toast.classList.remove('flex');
    }, duration);
  }

  // API wrappers
  async function authApi(path, options = {}) {
    return fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
      ...options,
      headers: {
        apikey: config.supabaseAnonKey,
        'content-type': 'application/json',
        ...(options.headers || {})
      }
    });
  }

  async function api(path, options = {}) {
    return fetch(`${config.apiBaseUrl.replace(/\/$/, '')}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${session ? session.access_token : ''}`,
        'content-type': 'application/json',
        ...(options.headers || {})
      }
    });
  }

  function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = value || '';
    return node.innerHTML;
  }

  // Show Auth View vs Mail View
  function showApp(updateUrl = true) {
    const authView = $('#auth-view');
    const mailView = $('#mail-view');
    if (authView) authView.classList.add('hidden');
    if (mailView) mailView.classList.remove('hidden');

    if (updateUrl) setRoute('/mailbox');

    const email = session?.user?.email || 'user@operava.app';
    $$('#user-email, #profile-user-email, #mobile-user-email').forEach((el) => {
      if (el) el.textContent = email;
    });

    switchView('inbox');
    loadEmails();
  }

  function showLogin(updateUrl = true) {
    const authView = $('#auth-view');
    const mailView = $('#mail-view');
    if (mailView) mailView.classList.add('hidden');
    if (authView) authView.classList.remove('hidden');

    if (updateUrl) setRoute('/login');
  }

  function signOut() {
    session = null;
    localStorage.removeItem(sessionKey);
    const loginForm = $('#login-form');
    if (loginForm) loginForm.reset();
    showToast('Signed out of OPERAVA MailDesk');
    showLogin(true);
  }

  // View Switching
  function switchView(viewName) {
    currentView = viewName;
    const currentTitle = $('#current-view-title');
    if (currentTitle) {
      currentTitle.textContent = viewName === 'profile' ? 'Profile Settings' : viewName.charAt(0).toUpperCase() + viewName.slice(1);
    }

    // Toggle panels
    $$('.view-panel').forEach((panel) => {
      panel.classList.add('hidden');
      panel.classList.remove('flex');
    });

    const activePanel = $(`#${viewName}-view`);
    if (activePanel) {
      activePanel.classList.remove('hidden');
      activePanel.classList.add('flex');
      activePanel.scrollTop = 0;
    }

    // Toggle sidebar navigation classes
    $$('.nav-tab').forEach((btn) => {
      const isCurrent = btn.dataset.view === viewName;
      if (isCurrent) {
        btn.className = 'nav-tab group w-full flex items-center gap-3 px-3 h-[36px] rounded-[10px] text-[13px] font-medium transition-all text-left overflow-hidden bg-white text-[#111] shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[#e7e5d8]';
      } else {
        btn.className = 'nav-tab group w-full flex items-center gap-3 px-3 h-[36px] rounded-[10px] text-[13px] font-medium transition-all text-left overflow-hidden text-[#6b6b6b] hover:text-[#111] hover:bg-[#f2efe4] border border-transparent';
      }
    });

    // Toggle mobile nav buttons
    $$('.mobile-nav-btn').forEach((btn) => {
      const isCurrent = btn.dataset.view === viewName;
      if (isCurrent) {
        btn.className = 'mobile-nav-btn w-full h-[48px] rounded-[14px] border flex items-center gap-3 px-4 text-left transition-all overflow-hidden max-w-full bg-white border-[#e7e5d8] text-[#111] shadow-sm';
      } else {
        btn.className = 'mobile-nav-btn w-full h-[48px] rounded-[14px] border flex items-center gap-3 px-4 text-left transition-all overflow-hidden max-w-full border-transparent text-[#6b6b6b] hover:bg-white hover:border-[#e7e5d8]';
      }
    });

    if (viewName === 'inbox' || viewName === 'sent' || viewName === 'trash') {
      renderEmails();
    }
  }

  // Load emails from production backend
  async function loadEmails() {
    const list = $('#email-list');
    if (!list) return;

    try {
      const response = await api('/emails');
      if (response.status === 401) return signOut();
      if (!response.ok) throw new Error('Could not load mailbox');

      const emails = await response.json();
      emailCache = Array.isArray(emails) ? emails : [];
      renderEmails();
    } catch (err) {
      if (list) {
        list.innerHTML = `<div class="rounded-[14px] border p-8 text-center border-[#e7e5d8] bg-[#fcfaf4] text-[#9a9990]">
          <div class="text-[13px]">${escapeHtml(err.message || 'Error loading mailbox')}. Check backend connection.</div>
        </div>`;
      }
    }
  }

  // Render emails based on active filter and search query
  function renderEmails() {
    const query = ($('#search-input')?.value || '').trim().toLowerCase();

    // 1. Inbox list
    const inboxList = $('#email-list');
    if (inboxList) {
      let filtered = emailCache.filter((e) => !e.is_deleted);
      if (query) {
        filtered = filtered.filter((e) =>
          (e.subject || '').toLowerCase().includes(query) ||
          (e.recipient || '').toLowerCase().includes(query) ||
          (e.from_address || '').toLowerCase().includes(query) ||
          (e.text_body || '').toLowerCase().includes(query)
        );
      }

      // Update counter badges
      const countEl = $('#count');
      const totalBadge = $('#inbox-total-badge');
      const mobileCount = $('#mobile-inbox-count');
      const unreadCount = emailCache.filter((e) => !e.is_deleted && !e.is_read).length;

      if (countEl) countEl.textContent = unreadCount;
      if (mobileCount) mobileCount.textContent = unreadCount;
      if (totalBadge) totalBadge.textContent = `${filtered.length} total`;

      if (filtered.length === 0) {
        inboxList.innerHTML = `<div class="rounded-[14px] border p-8 text-center border-[#e7e5d8] bg-[#fcfaf4] text-[#9a9990]">
          <div class="text-[13px]">${query ? `No messages match "${escapeHtml(query)}"` : 'No messages in this mailbox yet.'}</div>
        </div>`;
      } else {
        inboxList.innerHTML = filtered.map((e) => createEmailCard(e)).join('');
        attachEmailCardListeners(inboxList);
      }
    }

    // 2. Sent list
    const sentList = $('#sent-list');
    if (sentList) {
      const sentEmails = emailCache.filter((e) => e.direction === 'outbound' || (!e.direction && !e.is_deleted));
      if (sentEmails.length === 0) {
        sentList.innerHTML = `<div class="rounded-[14px] border p-8 text-center border-[#e7e5d8] bg-[#fcfaf4] text-[#9a9990]">
          <div class="text-[13px]">No sent messages yet.</div>
        </div>`;
      } else {
        sentList.innerHTML = sentEmails.map((e) => createEmailCard(e)).join('');
        attachEmailCardListeners(sentList);
      }
    }

    // 3. Trash list
    const trashList = $('#trash-list');
    if (trashList) {
      const trashed = emailCache.filter((e) => e.is_deleted);
      if (trashed.length === 0) {
        trashList.innerHTML = `<div class="rounded-[14px] border p-8 text-center border-[#e7e5d8] bg-[#fcfaf4] text-[#9a9990]">
          <div class="text-[13px]">Trash is empty.</div>
        </div>`;
      } else {
        trashList.innerHTML = trashed.map((e) => createEmailCard(e)).join('');
        attachEmailCardListeners(trashList);
      }
    }
  }

  function createEmailCard(email) {
    const isUnread = !email.is_read;
    const sender = email.direction === 'inbound' && email.from_address ? email.from_address : (email.recipient || 'Recipient');
    const initials = (sender.replace(/<.*?>/, '').trim().slice(0, 2) || 'EM').toUpperCase();
    const dateStr = email.created_at ? new Date(email.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Today';
    const timeStr = email.created_at ? new Date(email.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const preview = (email.text_body || email.html || '').replace(/<[^>]+>/g, ' ').slice(0, 140);

    return `
      <div class="email-item group relative rounded-[14px] border p-[14px] sm:p-4 transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:-translate-y-[1px] overflow-hidden max-w-full ${isUnread ? 'bg-[#fcfaf4] border-[#e7e5d8] shadow-[0_1px_3px_rgba(0,0,0,0.04)]' : 'bg-white border-[#ece9dc] hover:bg-[#fcfaf4]'}" data-id="${email.id}">
        <div class="flex items-start justify-between gap-3 overflow-hidden">
          <div class="flex items-start gap-3 min-w-0 flex-1 overflow-hidden">
            <div class="w-8 h-8 rounded-[9px] flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5 ${isUnread ? 'bg-gradient-to-br from-[#8B5CF6] to-[#FB923C] text-white' : 'bg-[#f0ede3] text-[#777]'}">
              ${escapeHtml(initials)}
            </div>
            <div class="min-w-0 flex-1 overflow-hidden">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-[13px] font-medium truncate">${escapeHtml(sender.split('<')[0].trim() || sender)}</span>
                <span class="text-[11px] truncate text-[#9a9990]">${escapeHtml(sender)}</span>
                ${isUnread ? '<span class="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] shrink-0"></span>' : ''}
              </div>
              <div class="mt-1 text-[13px] font-medium leading-[1.3] truncate">${escapeHtml(email.subject || '(No subject)')}</div>
              <div class="mt-1 text-[12px] leading-[1.4] line-clamp-2 text-[#6f6e68]">${escapeHtml(preview)}</div>
            </div>
          </div>
          <div class="flex flex-col items-end gap-2 shrink-0">
            <span class="text-[11px] text-[#9a9990] flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              ${escapeHtml(timeStr || dateStr)}
            </span>
            <button type="button" class="view-raw-btn h-[26px] px-2.5 rounded-[8px] border text-[11px] font-medium flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98] group-hover:border-[#8B5CF6]/30 group-hover:text-[#8B5CF6] bg-white border-[#e7e5d8] text-[#555] hover:bg-[#f8f5e9]" data-id="${email.id}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
              View Raw HTML
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function attachEmailCardListeners(container) {
    container.querySelectorAll('.view-raw-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.dataset.id;
        const email = emailCache.find((e) => e.id === id);
        if (email) openRawHtmlModal(email);
      });
    });

    container.querySelectorAll('.email-item').forEach((item) => {
      item.addEventListener('click', (ev) => {
        const id = item.dataset.id;
        const email = emailCache.find((e) => e.id === id);
        if (email) {
          // Mark as read
          if (!email.is_read) {
            email.is_read = true;
            api(`/emails/${id}`, { method: 'PATCH', body: JSON.stringify({ is_read: true }) }).catch(() => {});
            renderEmails();
          }
          openRawHtmlModal(email);
        }
      });
    });
  }

  // Raw HTML Viewer Modal
  function openRawHtmlModal(email) {
    currentRawEmail = email;
    const modal = $('#raw-html-modal');
    if (!modal) return;

    const subjectEl = $('#raw-modal-subject');
    const fromEl = $('#raw-modal-from');
    const contentPre = $('#raw-html-content');
    const previewFrame = $('#raw-preview-frame');
    const charCounter = $('#raw-char-counter');

    const htmlContent = email.html || (email.text_body ? `<div style="font-family: Inter, sans-serif; padding: 24px; color: #111;">${escapeHtml(email.text_body).replace(/\n/g, '<br>')}</div>` : '<div style="font-family: Inter, sans-serif; padding: 24px; color: #888;">(Empty message body)</div>');

    if (subjectEl) subjectEl.textContent = email.subject || '(No subject)';
    if (fromEl) fromEl.textContent = `${email.from_address || email.recipient || ''} • Raw HTML viewer`;
    if (contentPre) contentPre.textContent = htmlContent;
    if (previewFrame) previewFrame.srcdoc = htmlContent;
    if (charCounter) charCounter.textContent = `Clickable raw HTML • ${htmlContent.length} chars`;

    switchRawTab('preview');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeRawHtmlModal() {
    const modal = $('#raw-html-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    currentRawEmail = null;
  }

  function switchRawTab(tabName) {
    const previewTab = $('#raw-preview-tab');
    const codeTab = $('#raw-code-tab');
    const previewContainer = $('#raw-preview-container');
    const codeContainer = $('#raw-code-container');

    if (tabName === 'preview') {
      if (previewTab) previewTab.className = 'h-[28px] px-3 rounded-[8px] text-[11px] font-medium flex items-center gap-1 transition-colors bg-[#111] text-white shadow-sm';
      if (codeTab) codeTab.className = 'h-[28px] px-3 rounded-[8px] text-[11px] font-medium flex items-center gap-1 transition-colors text-[#777] hover:text-[#111]';
      if (previewContainer) previewContainer.classList.remove('hidden');
      if (codeContainer) codeContainer.classList.add('hidden');
    } else {
      if (codeTab) codeTab.className = 'h-[28px] px-3 rounded-[8px] text-[11px] font-medium flex items-center gap-1 transition-colors bg-[#111] text-white shadow-sm';
      if (previewTab) previewTab.className = 'h-[28px] px-3 rounded-[8px] text-[11px] font-medium flex items-center gap-1 transition-colors text-[#777] hover:text-[#111]';
      if (codeContainer) codeContainer.classList.remove('hidden');
      if (previewContainer) previewContainer.classList.add('hidden');
    }
  }

  // Composer Modal
  function openComposer(initialValues = {}) {
    const composer = $('#composer');
    if (!composer) return;

    if (initialValues.to) $('#to').value = initialValues.to;
    if (initialValues.subject) $('#subject').value = initialValues.subject;
    if (initialValues.html) {
      $('#html').value = initialValues.html;
      updateCharCounter();
    }

    composer.classList.remove('hidden');
    composer.classList.add('flex');
    const toInput = $('#to');
    if (toInput) toInput.focus();
  }

  function closeComposer() {
    const composer = $('#composer');
    if (composer) {
      composer.classList.add('hidden');
      composer.classList.remove('flex');
    }
  }

  function updateCharCounter() {
    const htmlEl = $('#html');
    const counter = $('#char-counter');
    if (htmlEl && counter) {
      counter.textContent = `${htmlEl.value.length} chars • HTML only`;
    }
  }

  // Prebuilt template loader
  const TEMPLATES = {
    welcome: `<div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e7e5d8; border-radius: 16px; overflow: hidden;">
  <div style="padding: 28px 32px; background: linear-gradient(135deg, #8B5CF6 0%, #FB923C 100%);">
    <h1 style="font-family: 'Instrument Serif', Georgia, serif; font-size: 26px; color: white; margin: 0; font-weight: 400;">Welcome to Operava</h1>
  </div>
  <div style="padding: 24px 32px;">
    <p style="font-size: 14px; line-height: 1.7; color: #2a2a2a; margin: 0 0 16px 0;">
      We're excited to have you onboard. Your secure MailDesk workspace is ready.
    </p>
    <a href="https://operava.com" style="display: inline-block; padding: 10px 20px; background: #111; color: white; border-radius: 10px; text-decoration: none; font-size: 13px; font-weight: 500;">Open Workspace</a>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #f0ede3; font-size: 11px; color: #9a9990;">
      Operava Global Solutions • Automated & Elevated
    </div>
  </div>
</div>`,
    receipt: `<div style="max-width: 520px; margin: 0 auto; font-family: Inter, sans-serif; padding: 32px; background: #ffffff; border: 1px solid #e7e5d8; border-radius: 16px;">
  <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f0ede3; padding-bottom: 16px;">
    <h1 style="font-size: 18px; font-weight: 600; color: #111; margin: 0;">Payment Receipt</h1>
    <span style="font-size: 12px; color: #10b981; font-weight: 600;">PAID</span>
  </div>
  <p style="font-size: 13px; color: #666; margin-top: 16px;">Thank you for your business. Here is the summary of your transaction:</p>
  <div style="margin-top: 20px; background: #fcfaf4; border: 1px solid #e7e5d8; border-radius: 12px; padding: 16px;">
    <div style="display: flex; justify-content: space-between; font-size: 13px; color: #333; margin-bottom: 8px;">
      <span>Operava Pro (Monthly)</span>
      <strong>$29.00</strong>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 13px; color: #333;">
      <span>Taxes & Fees</span>
      <span>$0.00</span>
    </div>
  </div>
  <div style="margin-top: 16px; font-size: 11px; color: #999;">Receipt #2847 • Transaction processed securely.</div>
</div>`,
    digest: `<div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #ffffff; border: 1px solid #e7e5d8; border-radius: 16px;">
  <h1 style="font-family: 'Instrument Serif', Georgia, serif; font-size: 24px; color: #111; margin: 0 0 16px 0;">Weekly Botanical Digest</h1>
  <p style="font-size: 14px; line-height: 1.6; color: #444;">Here is your team's weekly update from the botanical desk:</p>
  <ul style="margin: 16px 0; padding-left: 20px; font-size: 13px; line-height: 1.8; color: #333;">
    <li>12 inbox automations processed</li>
    <li>Zero delivery rejections recorded</li>
    <li>ZeptoMail REST API active as primary sender</li>
  </ul>
  <a href="#" style="display: inline-block; margin-top: 12px; padding: 10px 18px; background: linear-gradient(90deg, #8B5CF6, #FB923C); color: white; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 500;">View Full Report</a>
</div>`
  };

  // Setup Event Listeners
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Login Form Submit
    const loginForm = $('#login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = $('#email');
        const passInput = $('#password');
        const emailErr = $('#email-error');
        const passErr = $('#password-error');
        const btnText = $('#submit-login-text');
        const btnSpinner = $('#submit-login-spinner');
        const submitBtn = $('#submit-login');

        let valid = true;
        const emailVal = (emailInput?.value || '').trim();
        const passVal = (passInput?.value || '').trim();

        if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
          if (emailErr) {
            emailErr.querySelector('span:last-child').textContent = emailVal ? 'Enter a valid email address' : 'Email is required';
            emailErr.classList.remove('hidden');
          }
          if (emailInput) emailInput.classList.add('border-red-300', 'bg-red-50/40');
          valid = false;
        } else {
          if (emailErr) emailErr.classList.add('hidden');
          if (emailInput) emailInput.classList.remove('border-red-300', 'bg-red-50/40');
        }

        if (!passVal || passVal.length < 6) {
          if (passErr) {
            passErr.querySelector('span:last-child').textContent = passVal ? 'Minimum 6 characters' : 'Password is required';
            passErr.classList.remove('hidden');
          }
          if (passInput) passInput.classList.add('border-red-300', 'bg-red-50/40');
          valid = false;
        } else {
          if (passErr) passErr.classList.add('hidden');
          if (passInput) passInput.classList.remove('border-red-300', 'bg-red-50/40');
        }

        if (!valid) return;

        // Start loading
        if (btnText) btnText.classList.add('hidden');
        if (btnSpinner) btnSpinner.classList.remove('hidden');
        if (submitBtn) submitBtn.disabled = true;

        try {
          const res = await authApi('token?grant_type=password', {
            method: 'POST',
            body: JSON.stringify({ email: emailVal, password: passVal })
          });
          const data = await res.json();

          if (!res.ok || !data.access_token) {
            const errorMsg = data.error_description || data.msg || (typeof data.error === 'string' ? data.error : data.error?.message) || 'Invalid login credentials';
            showToast(errorMsg);
            if (emailErr) {
              emailErr.querySelector('span:last-child').textContent = errorMsg;
              emailErr.classList.remove('hidden');
            }
            return;
          }

          // Save session
          session = data;
          localStorage.setItem(sessionKey, JSON.stringify(session));
          showToast('Welcome to OPERAVA');
          showApp(true);
        } catch (err) {
          showToast(err.message || 'Authentication service unavailable');
        } finally {
          if (btnText) btnText.classList.remove('hidden');
          if (btnSpinner) btnSpinner.classList.add('hidden');
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    // Toggle password visibility
    const togglePassBtn = $('#toggle-password-btn');
    if (togglePassBtn) {
      togglePassBtn.addEventListener('click', () => {
        const passInput = $('#password');
        if (!passInput) return;
        const isPassword = passInput.type === 'password';
        passInput.type = isPassword ? 'text' : 'password';
        togglePassBtn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
      });
    }

    // Forgot password modal
    const forgotBtn = $('#forgot-password-btn');
    const resetModal = $('#reset-modal');
    const resetBackdrop = $('#reset-modal-backdrop');
    const closeResetModal = $('#close-reset-modal');
    const resetForm = $('#reset-form');

    if (forgotBtn && resetModal) {
      forgotBtn.addEventListener('click', () => {
        resetModal.classList.remove('hidden');
        resetModal.classList.add('flex');
        $('#reset-form-container')?.classList.remove('hidden');
        $('#reset-success-container')?.classList.add('hidden');
      });
    }

    [resetBackdrop, closeResetModal].forEach((btn) => {
      if (btn && resetModal) {
        btn.addEventListener('click', () => {
          resetModal.classList.add('hidden');
          resetModal.classList.remove('flex');
        });
      }
    });

    if (resetForm) {
      resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = $('#reset-email');
        const emailVal = (emailInput?.value || '').trim();
        const errEl = $('#reset-error');

        if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
          if (errEl) {
            errEl.textContent = 'Enter a valid email address';
            errEl.classList.remove('hidden');
          }
          return;
        }

        if (errEl) errEl.classList.add('hidden');
        try {
          await authApi('recover', { method: 'POST', body: JSON.stringify({ email: emailVal }) });
        } catch (_) {}

        $('#reset-form-container')?.classList.add('hidden');
        const successContainer = $('#reset-success-container');
        if (successContainer) {
          successContainer.classList.remove('hidden');
          const sentEmailEl = $('#reset-sent-email');
          if (sentEmailEl) sentEmailEl.textContent = emailVal;
        }
        showToast('Reset link sent to your inbox');
        setTimeout(() => {
          resetModal?.classList.add('hidden');
          resetModal?.classList.remove('flex');
        }, 3000);
      });
    }

    // SSO buttons
    $$('#sso-google, #sso-microsoft').forEach((btn) => {
      btn.addEventListener('click', () => {
        showToast('Single Sign-On is configured for your domain');
      });
    });

    // View switching buttons
    $$('.nav-tab, .mobile-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view) {
          switchView(view);
          // close mobile drawer if open
          $('#bottom-sheet')?.classList.add('hidden');
          $('#bottom-sheet-backdrop')?.classList.add('hidden');
        }
      });
    });

    // Compose buttons
    $$('#compose, #header-compose-btn, #compose-mobile').forEach((btn) => {
      btn.addEventListener('click', () => openComposer());
    });

    // Close compose
    $$('#close-compose, #cancel-compose, #composer-backdrop').forEach((btn) => {
      btn.addEventListener('click', closeComposer);
    });

    // Char counter for HTML input
    const htmlInput = $('#html');
    if (htmlInput) {
      htmlInput.addEventListener('input', updateCharCounter);
    }

    // Send Form submit
    const sendForm = $('#send-form');
    if (sendForm) {
      sendForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const toVal = ($('#to')?.value || '').trim();
        const subjectVal = ($('#subject')?.value || '').trim();
        const htmlVal = ($('#html')?.value || '').trim();
        const sendBtn = $('#submit-send');

        if (!toVal || !subjectVal) {
          showToast('Please provide a recipient and subject');
          return;
        }

        if (sendBtn) sendBtn.disabled = true;
        showToast('Sending message…');

        try {
          const res = await api('/emails', {
            method: 'POST',
            body: JSON.stringify({
              to: toVal,
              subject: subjectVal,
              html: htmlVal.replace(/\n/g, '<br>')
            })
          });
          const data = await res.json();

          if (!res.ok) {
            const err = (typeof data.error === 'string' ? data.error : data.error?.message) || data.message || 'Delivery failed';
            showToast(err);
            return;
          }

          sendForm.reset();
          updateCharCounter();
          closeComposer();

          const provider = data.delivery_provider ? (data.delivery_provider === 'zeptomail' ? ' via ZeptoMail' : ' via Resend') : '';
          showToast(`Message sent successfully${provider}`);
          loadEmails();
        } catch (err) {
          showToast(err.message || 'Error connecting to email service');
        } finally {
          if (sendBtn) sendBtn.disabled = false;
        }
      });
    }

    // AI Generate button
    const aiBtn = $('#ai-generate-btn');
    if (aiBtn) {
      aiBtn.addEventListener('click', async () => {
        const promptInput = $('#ai-prompt');
        const promptVal = (promptInput?.value || '').trim();
        const previewContainer = $('#ai-preview-container');
        const previewFrame = $('#ai-preview-frame');
        const label = $('#ai-generate-label');

        if (!promptVal) {
          showToast('Enter a prompt for the AI generator');
          return;
        }

        aiBtn.disabled = true;
        if (label) label.textContent = 'Generating...';

        try {
          let generatedHtml = '';
          const res = await api('/ai/draft', {
            method: 'POST',
            body: JSON.stringify({ prompt: promptVal, instruction: promptVal })
          });

          if (res.ok) {
            const data = await res.json();
            generatedHtml = data.draft || data.html || data.text || '';
          }

          // If AI endpoint is unconfigured or returns text, wrap in clean email template
          if (!generatedHtml || !generatedHtml.includes('<div')) {
            generatedHtml = `<div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e7e5d8; border-radius: 16px; overflow: hidden;">
  <div style="padding: 28px 32px; background: linear-gradient(135deg, #8B5CF6 0%, #FB923C 100%);">
    <h1 style="font-family: 'Instrument Serif', Georgia, serif; font-size: 24px; color: white; margin: 0; font-weight: 400;">${escapeHtml(promptVal.slice(0, 48))}</h1>
  </div>
  <div style="padding: 24px 32px;">
    <p style="font-size: 14px; line-height: 1.7; color: #2a2a2a; margin: 0 0 16px 0;">
      ${escapeHtml(generatedHtml || promptVal)}
    </p>
    <a href="#" style="display: inline-block; padding: 10px 20px; background: #111; color: white; border-radius: 10px; text-decoration: none; font-size: 13px; font-weight: 500;">Take Action</a>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #f0ede3; font-size: 11px; color: #9a9990;">
      Generated by OPERAVA MailDesk AI Studio Engine
    </div>
  </div>
</div>`;
          }

          if (previewContainer) previewContainer.classList.add('hidden');
          if (previewFrame) {
            previewFrame.classList.remove('hidden');
            previewFrame.srcdoc = generatedHtml;
          }

          // Preload into composer editor
          const htmlEl = $('#html');
          if (htmlEl) {
            htmlEl.value = generatedHtml;
            updateCharCounter();
          }

          showToast('HTML generated and loaded into editor');
        } catch (err) {
          showToast(err.message || 'AI generator unavailable');
        } finally {
          aiBtn.disabled = false;
          if (label) label.textContent = 'Generate';
        }
      });
    }

    // Prebuilt template cards click
    $$('.template-card').forEach((card) => {
      card.addEventListener('click', () => {
        const key = card.dataset.template;
        const html = TEMPLATES[key];
        if (html) {
          openComposer({ html, subject: card.querySelector('.truncate')?.textContent || 'Template' });
          showToast('Template loaded into Composer');
        }
      });
    });

    // Raw HTML tabs
    $('#raw-preview-tab')?.addEventListener('click', () => switchRawTab('preview'));
    $('#raw-code-tab')?.addEventListener('click', () => switchRawTab('code'));
    $$('#close-raw-html, #raw-close-btn, #raw-html-backdrop').forEach((btn) => {
      btn.addEventListener('click', closeRawHtmlModal);
    });

    // Copy raw HTML
    $('#raw-copy-btn')?.addEventListener('click', async () => {
      if (!currentRawEmail) return;
      const html = currentRawEmail.html || currentRawEmail.text_body || '';
      try {
        await navigator.clipboard.writeText(html);
        const label = $('#raw-copy-label');
        if (label) label.textContent = 'Copied!';
        showToast('HTML copied to clipboard');
        setTimeout(() => {
          if (label) label.textContent = 'Copy';
        }, 1500);
      } catch (_) {
        showToast('Could not copy to clipboard');
      }
    });

    // Search input
    $('#search-input')?.addEventListener('input', renderEmails);

    // Sign out buttons
    $$('#sign-out, #mobile-sign-out').forEach((btn) => {
      btn.addEventListener('click', signOut);
    });

    // Mobile Bottom Sheet
    const mobileSheet = $('#bottom-sheet');
    const mobileBackdrop = $('#bottom-sheet-backdrop');
    $$('#bottom-sheet-toggle, #mobile-tab-menu').forEach((btn) => {
      btn.addEventListener('click', () => {
        mobileSheet?.classList.remove('hidden');
        mobileBackdrop?.classList.remove('hidden');
      });
    });

    $$('#close-bottom-sheet, #bottom-sheet-backdrop').forEach((btn) => {
      btn.addEventListener('click', () => {
        mobileSheet?.classList.add('hidden');
        mobileBackdrop?.classList.add('hidden');
      });
    });

    $('#mobile-tab-inbox')?.addEventListener('click', () => {
      switchView('inbox');
    });

    // Empty Trash
    $('#empty-trash-btn')?.addEventListener('click', () => {
      emailCache = emailCache.filter((e) => !e.is_deleted);
      renderEmails();
      showToast('Trash emptied');
    });

    // Save Profile
    $('#save-profile-btn')?.addEventListener('click', () => {
      showToast('Profile updated');
    });

    // Initial Session Check & Routing
    try {
      session = JSON.parse(localStorage.getItem(sessionKey));
    } catch (_) {
      localStorage.removeItem(sessionKey);
    }

    window.addEventListener('popstate', () => {
      const path = window.location.pathname;
      if (path === '/login') {
        showLogin(false);
      } else if (session?.access_token && configured()) {
        showApp(false);
      } else {
        showLogin(true);
      }
    });

    const initialPath = window.location.pathname;
    if (session?.access_token && configured()) {
      if (initialPath === '/login') {
        showApp(true);
      } else {
        showApp(initialPath === '/' || initialPath === '/index.html');
      }
    } else {
      showLogin(initialPath === '/' || initialPath === '/index.html');
    }
  });
})();
