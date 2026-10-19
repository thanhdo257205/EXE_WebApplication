// Production API is served by the same-origin Cloudflare gateway.
// Public configuration only: never put database credentials or tokens here.
export const environment = { production: true, apiBaseUrl: '/api' as string | null };
