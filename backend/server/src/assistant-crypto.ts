import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = 'v1';

/** ASSISTANT_KEY_SECRET is Base64 for exactly 32 bytes; anything else disables key management. */
export function decodeMasterKey(value: string | undefined): Buffer | null {
  const raw = (value ?? '').trim();
  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  const key = Buffer.from(raw, 'base64');
  return key.length === KEY_BYTES ? key : null;
}

export function encryptSecret(master: Buffer, plaintext: string, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', master, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(master: Buffer, encoded: string, aad: string): string {
  const parts = encoded.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Invalid encrypted credential');
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const ciphertext = Buffer.from(parts[3], 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== 16 || ciphertext.length === 0) throw new Error('Invalid encrypted credential');
  const decipher = createDecipheriv('aes-256-gcm', master, iv);
  // The AAD binds ciphertext to one provider and owner, so rows cannot be swapped between accounts.
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function fingerprintSecret(master: Buffer, provider: string, secret: string): string {
  return createHmac('sha256', master).update(`${provider}:${secret}`).digest('base64url');
}

export function maskSecret(secret: string): string {
  return `••••${secret.slice(-4)}`;
}

export function maskAccount(accountId: string): string {
  return accountId.length <= 8 ? `••••${accountId.slice(-2)}` : `${accountId.slice(0, 4)}…${accountId.slice(-4)}`;
}
