import { createClient, type Client, type Transaction, type InValue } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export type Row = Record<string, any>;
export type Executor = Pick<Client, 'execute'>;
export const uuid = randomUUID;
// Fixed-width UTC timestamps compare consistently in SQLite, including imported microseconds.
export const now = () => new Date().toISOString().replace('Z', '000Z');
export const at = (milliseconds: number) => new Date(milliseconds).toISOString().replace('Z', '000Z');
export class Problem extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message = code) { super(message); this.status = status; this.code = code; }
}
export const fail = (status: number, code: string, message?: string): never => { throw new Problem(status, code, message); };
export const one = async (db: Executor, sql: string, args: InValue[] = []): Promise<Row> => {
  const rows = (await db.execute({ sql, args })).rows;
  return rows[0] as Row ?? fail(404, 'NOT_FOUND');
};
export const all = async (db: Executor, sql: string, args: InValue[] = []): Promise<Row[]> => (await db.execute({ sql, args })).rows as Row[];
export const scalar = async (db: Executor, sql: string, args: InValue[] = []): Promise<number> => Number(Object.values(await one(db, sql, args))[0]);
export const execute = (db: Executor, sql: string, args: InValue[] = []) => db.execute({ sql, args });
export async function transaction<T>(db: Client, fn: (tx: Transaction) => Promise<T>, mode: 'write' | 'read' = 'write'): Promise<T> {
  // Never automatically replay mutations or an ambiguous commit. Callers supply idempotency keys.
  const tx = await db.transaction(mode);
  try { const result = await fn(tx); await tx.commit(); return result; }
  catch (error) { if (!tx.closed) await tx.rollback().catch(() => undefined); throw error; }
  finally { tx.close(); }
}
export const camel = (row: Row): Row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
export const page = (items: Row[], index: number, size: number, count: number) => ({ items, page: index, size, totalElements: count, totalPages: Math.ceil(count / size) });
export function database(url: string, authToken?: string): Client {
  return createClient({ url, authToken, intMode: 'number' });
}
export async function initializeLocal(db: Client): Promise<void> {
  await db.executeMultiple(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
}
