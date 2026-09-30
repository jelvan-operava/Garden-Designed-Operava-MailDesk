/**
 * OPERAVA MailDesk — Email Delivery Service
 * Unified sending pipeline supporting ZeptoMail REST API and Resend with automatic failover.
 */

export function cleanEmailAddress(str, defaultAddress = 'mail@operava.com') {
  if (!str || typeof str !== 'string') return defaultAddress;
  const match = str.match(/<([^>]+)>/);
  if (match && match[1]) return match[1].trim();
  return str.trim();
}

export function cleanSenderName(str, defaultName = 'OPERAVA MailDesk') {
  if (!str || typeof str !== 'string') return defaultName;
  if (str.includes('<')) {
    const namePart = str.split('<')[0].trim();
    if (namePart) return namePart.replace(/^["']|["']$/g, '');
  }
  return defaultName;
}

/**
 * Send an email via Zoho ZeptoMail REST API
 */
export async function sendViaZeptoMail(env, { to, subject, html, text, fromAddress, fromName }) {
  if (!env.ZEPTOMAIL_API_KEY) {
    return { success: false, error: 'ZEPTOMAIL_API_KEY is not configured.' };
  }

  const endpoint = env.ZEPTOMAIL_API_URL || 'https://api.zeptomail.com/v1.1/email';
  const apiKey = env.ZEPTOMAIL_API_KEY.trim();
  const authHeader = apiKey.startsWith('Zoho-enczapikey ') || apiKey.startsWith('Bearer ')
    ? apiKey
    : `Zoho-enczapikey ${apiKey}`;

  const address = cleanEmailAddress(fromAddress || env.ZEPTOMAIL_FROM_ADDRESS || env.ZEPTOMAIL_FROM || env.RESEND_FROM || 'mail@operava.com');
  const name = cleanSenderName(fromName || env.ZEPTOMAIL_FROM_NAME || 'OPERAVA MailDesk');

  const payload = {
    from: { address, name },
    to: [{ email_address: { address: to } }],
    subject,
    htmlbody: html,
    track_clicks: true,
    track_opens: true
  };

  if (text) {
    payload.textbody = text;
  }
  if (env.ZEPTOMAIL_BOUNCE_ADDRESS) {
    payload.bounce_address = env.ZEPTOMAIL_BOUNCE_ADDRESS;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: authHeader,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let data = {};
    try { data = await response.json(); } catch (_) { data = {}; }

    const messageId =
      data.data?.[0]?.data?.request_id ||
      data.data?.[0]?.data?.email_id ||
      data.data?.[0]?.additional_info?.[0]?.message_id ||
      data.data?.request_id ||
      data.request_id ||
      data.id;

    const accepted = response.ok && Boolean(
      messageId ||
      data.message === 'success' ||
      (Array.isArray(data.data) && data.data.length > 0)
    );

    if (accepted) {
      return {
        success: true,
        provider: 'zeptomail',
        messageId: messageId || `zm_${crypto.randomUUID()}`,
        status: 'sent',
        raw: data
      };
    }

    const errorDetails = data.error?.message || data.message || data.error?.details || (response.ok ? 'ZeptoMail returned no message ID' : `ZeptoMail rejected message with HTTP ${response.status}`);
    return {
      success: false,
      provider: 'zeptomail',
      error: errorDetails,
      status: 'failed',
      raw: data
    };
  } catch (err) {
    return {
      success: false,
      provider: 'zeptomail',
      error: `ZeptoMail network request failed: ${err.message}`,
      status: 'failed'
    };
  }
}

/**
 * Send an email via Resend API
 */
export async function sendViaResend(env, { to, subject, html, text, fromAddress, emailId }) {
  if (!env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY is not configured.' };
  }

  const from = fromAddress || env.RESEND_FROM || env.ZEPTOMAIL_FROM_ADDRESS || 'OPERAVA MailDesk <mail@operava.com>';

  const headers = {
    authorization: `Bearer ${env.RESEND_API_KEY.trim()}`,
    'content-type': 'application/json'
  };
  if (emailId) {
    headers['idempotency-key'] = emailId;
  }

  const payload = {
    from,
    to: [to],
    subject,
    html
  };
  if (text) {
    payload.text = text;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    let data = {};
    try { data = await response.json(); } catch (_) { data = {}; }

    const accepted = response.ok && typeof data.id === 'string' && data.id.length > 0;
    if (accepted) {
      return {
        success: true,
        provider: 'resend',
        messageId: data.id,
        status: 'sent',
        raw: data
      };
    }

    const errorDetails = data.message || (response.ok ? 'Resend returned no message ID' : `Resend rejected message with HTTP ${response.status}`);
    return {
      success: false,
      provider: 'resend',
      error: errorDetails,
      status: 'failed',
      raw: data
    };
  } catch (err) {
    return {
      success: false,
      provider: 'resend',
      error: `Resend network request failed: ${err.message}`,
      status: 'failed'
    };
  }
}

/**
 * Orchestrate sending with primary provider (ZeptoMail or Resend) and automatic failover
 */
export async function deliverEmail(env, { to, subject, html, text, fromAddress, fromName, emailId }) {
  const hasZepto = Boolean(env.ZEPTOMAIL_API_KEY);
  const hasResend = Boolean(env.RESEND_API_KEY);

  if (!hasZepto && !hasResend) {
    return {
      success: false,
      provider: 'none',
      status: 'failed',
      error: 'No email delivery provider configured. Set ZEPTOMAIL_API_KEY (recommended) or RESEND_API_KEY.'
    };
  }

  // Determine provider priority
  const preferResend = env.EMAIL_PROVIDER === 'resend';
  const primaryProvider = preferResend && hasResend ? 'resend' : (hasZepto ? 'zeptomail' : 'resend');
  const secondaryProvider = primaryProvider === 'zeptomail' && hasResend ? 'resend' : (primaryProvider === 'resend' && hasZepto ? 'zeptomail' : null);

  // 1. Attempt primary provider
  let result = null;
  if (primaryProvider === 'zeptomail') {
    result = await sendViaZeptoMail(env, { to, subject, html, text, fromAddress, fromName });
  } else {
    result = await sendViaResend(env, { to, subject, html, text, fromAddress, emailId });
  }

  if (result.success) {
    return result;
  }

  // 2. If primary failed and secondary is available, attempt failover
  if (secondaryProvider) {
    console.warn(`[OPERAVA MailDesk] ${primaryProvider} failed: ${result.error}. Attempting failover to ${secondaryProvider}...`);
    let failoverResult = null;
    if (secondaryProvider === 'zeptomail') {
      failoverResult = await sendViaZeptoMail(env, { to, subject, html, text, fromAddress, fromName });
    } else {
      failoverResult = await sendViaResend(env, { to, subject, html, text, fromAddress, emailId });
    }

    if (failoverResult.success) {
      failoverResult.failoverFrom = primaryProvider;
      return failoverResult;
    }

    return {
      success: false,
      provider: `${primaryProvider}+${secondaryProvider}`,
      status: 'failed',
      error: `Primary (${primaryProvider}) failed: ${result.error}. Secondary (${secondaryProvider}) failed: ${failoverResult.error}`
    };
  }

  return result;
}
