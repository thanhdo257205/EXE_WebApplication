// Pages owns the public hostname. The gateway is reached only through a service binding.
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api' || path.startsWith('/api/') || path.startsWith('/media/') || (path.startsWith('/assets/cards/') && /\.(svg|webp)$/.test(path)) || path === '/assets/models/default-card-poster.webp') {
      try { return await env.GATEWAY.fetch(request); }
      catch { return new Response('API temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
    }
    return env.ASSETS.fetch(request);
  },
};
