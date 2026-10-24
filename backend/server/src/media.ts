import { createHash, createHmac } from 'node:crypto';
import type { Hono } from 'hono';
import { authorize, requireActor, type ApiEnv } from './auth.ts';
import { execute, fail, uuid } from './db.ts';
import type { Client } from '@libsql/client';

/** Ảnh thẻ tối đa 1 MiB sau khi trình duyệt/admin đã nén (WebP thẻ 500×700 thường 40–120 kB). */
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MEDIA_PREFIX = '/media/cards/';

export interface MediaStore { put(key: string, body: Uint8Array, contentType: string): Promise<void> }
export interface AzureMediaConfig { containerUrl: string; sasToken: string }

/** Container-scoped write SAS stays on the backend; public image URLs never contain it. */
export function azureMediaConfig(env: Record<string, string | undefined>): AzureMediaConfig | null {
  const containerUrl = env.AZURE_STORAGE_CONTAINER_URL, sasToken = env.AZURE_STORAGE_SAS_TOKEN;
  if (!containerUrl && !sasToken) return null;
  if (!containerUrl || !sasToken || !/^https:\/\/[a-z0-9]{3,24}\.blob\.core\.windows\.net\/[a-z0-9][a-z0-9-]{2,62}$/.test(containerUrl)) throw new Error('Invalid Azure media configuration');
  const params = new URLSearchParams(sasToken.replace(/^\?/, ''));
  if (!params.get('sig') || params.get('sr') !== 'c' || params.get('spr') !== 'https' || !params.get('sp')?.includes('w') || !Number.isFinite(Date.parse(params.get('se') || '')) || Date.parse(params.get('se')!) <= Date.now()) throw new Error('Invalid Azure media configuration');
  return { containerUrl, sasToken: params.toString() };
}

export function azureMediaStore(cfg: AzureMediaConfig, fetcher: typeof fetch = fetch): MediaStore {
  return {
    async put(key, body, contentType) {
      if (!/^cards\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(key)) throw new Error('Invalid media key');
      try {
        const response = await fetcher(`${cfg.containerUrl}/${key}?${cfg.sasToken}`, {
          method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(20000), body: body as BodyInit,
          headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': contentType, 'x-ms-blob-cache-control': 'public, max-age=31536000, immutable' },
        });
        if (!response.ok) throw new Error('Storage rejected upload');
      } catch {
        throw Object.assign(new Error('Object storage rejected the upload'), { code: 'HTTP_STORAGE_FAILED' });
      }
    },
  };
}
export interface R2Config { accountId: string; bucket: string; accessKeyId: string; secretAccessKey: string }

/** Đọc cấu hình R2 từ biến môi trường; thiếu bất kỳ biến nào thì trả null (tính năng tải ảnh tắt). Không bao giờ log giá trị. */
export function r2Config(env: Record<string, string | undefined>): R2Config | null {
  const { R2_ACCOUNT_ID: accountId, R2_BUCKET: bucket, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = env;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;
  if (!/^[a-f0-9]{32}$/i.test(accountId) || !/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket)) throw new Error('Invalid R2 configuration');
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();
const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

/** Chữ ký AWS SigV4 cho PUT object (R2 dùng region "auto", service "s3"). Tách riêng để kiểm thử với vector cố định. */
export function signPut(cfg: R2Config, key: string, body: Uint8Array, contentType: string, date = new Date()) {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const path = `/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const amz = date.toISOString().replace(/[-:]|\.\d{3}/g, ''), day = amz.slice(0, 8);
  const payload = sha256(body);
  const headers: Record<string, string> = { 'content-type': contentType, host, 'x-amz-content-sha256': payload, 'x-amz-date': amz };
  const names = Object.keys(headers).sort();
  const canonical = ['PUT', path, '', ...names.map(n => `${n}:${headers[n]}\n`), names.join(';'), payload].join('\n');
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha256(canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + cfg.secretAccessKey, day), 'auto'), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
  return { url: `https://${host}${path}`, headers };
}

export function r2Store(cfg: R2Config, fetcher: typeof fetch = fetch): MediaStore {
  return {
    async put(key, body, contentType) {
      const { url, headers } = signPut(cfg, key, body, contentType);
      const response = await fetcher(url, { method: 'PUT', headers, body: body as BodyInit, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Object.assign(new Error('Object storage rejected the upload'), { code: 'HTTP_STORAGE_FAILED' });
    },
  };
}

/** Nhận diện PNG/JPEG/WebP theo chữ ký byte — không tin Content-Type do client gửi. */
export function detectImage(bytes: Uint8Array): { ext: 'png' | 'jpg' | 'webp'; type: string } | null {
  const at = (i: number) => bytes[i];
  if (bytes.length > 12 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return { ext: 'png', type: 'image/png' };
  if (bytes.length > 12 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  const tag = (i: number, s: string) => [...s].every((ch, k) => at(i + k) === ch.charCodeAt(0));
  if (bytes.length > 12 && tag(0, 'RIFF') && tag(8, 'WEBP')) return { ext: 'webp', type: 'image/webp' };
  return null;
}

/**
 * POST /api/v1/admin/media/card-image — thân là byte ảnh thô. Chỉ ADMIN, qua CSRF/origin như mọi ghi admin.
 * Khóa đối tượng = hash nội dung (`cards/<sha256>.<ext>`): tải lại cùng ảnh không tạo bản sao, URL không đổi nên cache vĩnh viễn được.
 */
export function mediaRoutes(app: Hono<ApiEnv>, db: Client, store: MediaStore | null) {
  app.post('/api/v1/admin/media/card-image', async c => {
    const actor = requireActor(c, true);
    if (!store) return fail(503, 'MEDIA_STORAGE_DISABLED');
    await authorize(db, actor, true);
    const declared = Number(c.req.header('Content-Length') ?? 0);
    if (declared > MAX_IMAGE_BYTES) return fail(413, 'IMAGE_TOO_LARGE');
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0) return fail(400, 'IMAGE_REQUIRED');
    if (bytes.length > MAX_IMAGE_BYTES) return fail(413, 'IMAGE_TOO_LARGE');
    const kind = detectImage(bytes);
    if (!kind) return fail(415, 'IMAGE_TYPE_UNSUPPORTED');
    const name = `${sha256(bytes)}.${kind.ext}`;
    await store.put(`cards/${name}`, bytes, kind.type);
    await execute(db, "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,'MEDIA_CARD_IMAGE_UPLOADED','MEDIA',?,'SUCCESS',?)", [uuid(), actor.id, name.slice(0, 64), `bytes=${bytes.length}`]);
    return c.json({ url: MEDIA_PREFIX + name, bytes: bytes.length, contentType: kind.type }, 201);
  });
}
