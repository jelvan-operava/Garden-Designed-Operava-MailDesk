// Public browser configuration only. Never place service-role, secret, or Resend API keys here.
window.OPERAVA_CONFIG = {
  supabaseUrl: 'https://hyzjlznyfjtbehsmxgaq.supabase.co',
  supabaseAnonKey: 'sb_publishable_EkHGEYKWcrhemFS1dNfbfw_AIEPrGtt',
  // Set to your Cloudflare Worker URL (must respond to GET /health and POST /auth/login)
  apiBaseUrl: 'https://YOUR_WORKER.workers.dev'
};
