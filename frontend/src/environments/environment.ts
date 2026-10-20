// Production API is served by the same-origin Cloudflare gateway.
// Public configuration only: never put database credentials or tokens here.
export const environment = {
  production: true,
  apiBaseUrl: '/api' as string | null,
  // Public widget identifier for exe-webapp.pages.dev; the secret stays in the gateway.
  turnstileSiteKey: '0x4AAAAAAFbrXBKdukdwiT29' as string | null,
};
