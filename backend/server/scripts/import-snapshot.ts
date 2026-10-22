import { readFileSync } from 'node:fs';
import { database, initializeLocal, all, scalar, transaction, execute, type Row, type Executor } from '../src/db.ts';

const path = process.argv.find(arg => arg.startsWith('--input='))?.slice(8);
if (!path || !process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) throw new Error('Requires --input=<private import.json>, TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
const source = JSON.parse(readFileSync(path, 'utf8')) as Array<{ name: string; rows: Row[] }>;
const previousPath = process.argv.find(arg => arg.startsWith('--replace-unpublished='))?.slice('--replace-unpublished='.length);
const db = database(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN);
const canonical = (value: unknown): string => JSON.stringify(value, (_, v) => {
  if (v instanceof ArrayBuffer) return { blobHex: Buffer.from(v).toString('hex') };
  if (Buffer.isBuffer(v)) return { blobHex: v.toString('hex') };
  if (v && typeof v === 'object' && !Array.isArray(v)) return Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]]));
  return v;
});
async function verify(tx: Executor, expectedTables: typeof source) {
  for (const table of expectedTables) {
    if (!/^[a-z_]+$/.test(table.name)) throw new Error('Invalid table');
    const actual = (await all(tx, `SELECT * FROM "${table.name}"`)).map(row => canonical({ ...row })).sort();
    const expected = table.rows.map(canonical).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Data comparison failed for ' + table.name);
  }
  if ((await all(tx, 'PRAGMA foreign_key_check')).length) throw new Error('Foreign key validation failed');
}
try {
  if (!process.argv.includes('--verify-only')) {
    if (!previousPath) {
      if (await scalar(db, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'") !== 0) throw new Error('Refusing to import into a nonempty database');
      await initializeLocal(db);
    }
    await transaction(db, async tx => {
      await execute(tx, 'PRAGMA defer_foreign_keys=ON');
      // All table/column identifiers are validated against the newly installed schema.
      const tables = new Set((await all(tx, "SELECT name FROM sqlite_master WHERE type='table'")).map(r => String(r.name).toLowerCase()));
      if (previousPath) {
        const previous = JSON.parse(readFileSync(previousPath, 'utf8')) as typeof source;
        // Candidate replacement is allowed only while it still exactly matches its
        // unpublished snapshot. Any new business write makes this check fail closed.
        if (previous.map(t => t.name).sort().join() !== source.map(t => t.name).sort().join()) throw new Error('Source table set changed');
        await verify(tx, previous);
        await tx.batch(previous.map(t => ({ sql: `DELETE FROM "${t.name}"`, args: [] })));
      }
      for (const table of source) {
        if (!/^[a-z_]+$/.test(table.name) || !tables.has(table.name)) throw new Error('Unknown import table');
        const columns = new Set((await all(tx, `PRAGMA table_info("${table.name}")`)).map(r => String(r.name).toLowerCase()));
        const statements = table.rows.map(row => {
          const keys = Object.keys(row); if (!keys.length || keys.some(k => !/^[a-z_]+$/.test(k) || !columns.has(k))) throw new Error('Unknown import column');
          return { sql: `INSERT INTO "${table.name}" (${keys.map(k => `"${k}"`)}) VALUES (${keys.map(() => '?')})`, args: Object.values(row).map(v => v && typeof v === 'object' && 'blobHex' in v ? Buffer.from(v.blobHex, 'hex') : v) };
        });
        if (statements.length) await tx.batch(statements);
      }
      await execute(tx, "UPDATE app_sequences SET value=MAX(99999999,(SELECT COALESCE(MAX(provider_order_code),99999999) FROM payment_attempts)) WHERE name='payos_order_code'");
      if ((await all(tx, 'PRAGMA foreign_key_check')).length) throw new Error('Foreign key validation failed');
    });
  }
  await transaction(db, tx => verify(tx, source), 'read');
  console.log(`Verified every field in ${source.length} tables / ${source.reduce((sum, t) => sum + t.rows.length, 0)} rows. Foreign keys passed. Source archive remains authoritative until cutover.`);
} finally { db.close(); }
