// Pages owns the public hostname. The gateway is reached only through a service binding.

/** /room/<id> (the watch page). /room alone is the create page and keeps the site defaults. */
const ROOM_PAGE = /^\/room\/(room_[A-Za-z0-9_-]{4,64})\/?$/;
const BRAND = '5 anh em siêu nhân';
const SHARE_IMAGE = '/assets/images/room-share.jpg';
const ROOM_INFO_TIMEOUT_MS = 2500;

const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const clip = (value, max) => { const chars = Array.from(String(value).replace(/\s+/g, ' ').trim()); return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join(''); };

/** "23:57 ngày 05/11" in Vietnam time, for "Công chiếu lúc …". */
function vnTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false,
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.hour}:${parts.minute} ngày ${parts.day}/${parts.month}`;
}

/** Title and description shown by Zalo / Facebook / Messenger link previews (they do not run JavaScript). */
export function roomPreview(room) {
  if (!room || typeof room.title !== 'string' || !room.title.trim()) {
    return { title: `Phòng chiếu chung — ${BRAND}`, description: 'Vào phòng xem phim cùng mọi người và bình luận chạy ngang theo thời gian thực.' };
  }
  const status = room.snapshot?.status || room.status;
  const viewers = Number(room.viewerCount) > 0 ? ` · ${Number(room.viewerCount)} người đang xem` : '';
  let lead;
  if (status === 'PLAYING') lead = `Đang công chiếu${viewers}`;
  else if (status === 'PAUSED') lead = `Đang tạm dừng${viewers}`;
  else if (status === 'ENDED') lead = 'Buổi công chiếu đã kết thúc';
  else if (room.mode === 'SCHEDULED' && room.scheduledAt && vnTime(room.scheduledAt)) lead = `Công chiếu lúc ${vnTime(room.scheduledAt)} (giờ Việt Nam)`;
  else lead = 'Sắp công chiếu';
  return {
    title: `${clip(room.title, 90)} — ${BRAND}`,
    description: `${lead}. Vào phòng xem cùng mọi người và bình luận chạy ngang.`,
  };
}

/** Replaces <title>/description and adds Open Graph + Twitter tags; values are escaped. */
export function injectRoomMeta(html, preview, pageUrl) {
  const title = escapeHtml(preview.title);
  const description = escapeHtml(preview.description);
  const image = escapeHtml(new URL(SHARE_IMAGE, pageUrl).href);
  const url = escapeHtml(pageUrl);
  const tags = [
    `<meta property="og:type" content="video.other">`,
    `<meta property="og:site_name" content="${escapeHtml(BRAND)}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:locale" content="vi_VN">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${image}">`,
  ].join('\n  ');
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${description}">`)
    .replace(/<\/head>/i, `  ${tags}\n</head>`);
}

async function roomPage(request, env, roomId) {
  const page = await env.ASSETS.fetch(request);
  if (request.method !== 'GET' || !page.ok || !(page.headers.get('Content-Type') || '').includes('text/html')) return page;
  const url = new URL(request.url);
  let room = null;
  try {
    // Same-origin read of the public room info; no cookies are forwarded. The caller's IP keeps rate limits per client.
    const headers = new Headers({ Accept: 'application/json', Origin: url.origin, 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'cors' });
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) headers.set('CF-Connecting-IP', ip);
    const info = await env.GATEWAY.fetch(new Request(`${url.origin}/api/v1/watch-rooms/${encodeURIComponent(roomId)}`, { headers, signal: AbortSignal.timeout(ROOM_INFO_TIMEOUT_MS) }));
    if (info.ok) room = await info.json();
  } catch {
    // Preview text is best effort: the page itself must never fail because of it.
  }
  const html = injectRoomMeta(await page.text(), roomPreview(room), `${url.origin}${url.pathname}`);
  const responseHeaders = new Headers(page.headers);
  responseHeaders.delete('Content-Length');
  responseHeaders.delete('ETag');
  // The title and schedule can change: let link previews and browsers revalidate.
  responseHeaders.set('Cache-Control', 'no-cache');
  return new Response(html, { status: page.status, headers: responseHeaders });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api' || path.startsWith('/api/') || path === '/ws' || path.startsWith('/ws/') || path.startsWith('/media/') || (path.startsWith('/assets/cards/') && /\.(svg|webp)$/.test(path)) || path === '/assets/models/default-card-poster.webp') {
      try { return await env.GATEWAY.fetch(request); }
      catch { return new Response('API temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
    }
    const room = ROOM_PAGE.exec(path);
    if (room && (request.method === 'GET' || request.method === 'HEAD')) return roomPage(request, env, room[1]);
    return env.ASSETS.fetch(request);
  },
};
