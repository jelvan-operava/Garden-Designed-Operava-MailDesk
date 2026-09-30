// Public browser configuration only. Never place service-role, secret, or provider API keys here.
window.OPERAVA_CONFIG = {
  // Routes authentication and API requests directly to the Cloudflare Worker
  supabaseUrl: typeof window !== 'undefined' ? window.location.origin : '',
  supabaseAnonKey: 'operava_cf_publishable_token',
  apiBaseUrl: typeof window !== 'undefined' ? window.location.origin : ''
};
