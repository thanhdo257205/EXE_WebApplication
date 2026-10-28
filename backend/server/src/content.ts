import { z } from 'zod';
import type { Client, InValue } from '@libsql/client';
import { all, one, scalar, execute, transaction, batchRead, uuid, now, camel, page, fail, type Executor, type Row } from './db.ts';
import { PUBLIC_TTL_MS, type Cache } from './cache.ts';
import { authorizePermission, permissionView, requireActor, type Api, type Actor } from './auth.ts';

export const kinds = {
  characters: { identity: 'game_characters', revision: 'character_revisions', fk: 'character_id', label: 'name', columns: ['name', 'biography', 'ability_text', 'portrait_url', 'sort_order'] },
  'card-sets': { identity: 'card_sets', revision: 'card_set_revisions', fk: 'card_set_id', label: 'name', columns: ['name', 'description', 'sort_order'] },
  cards: { identity: 'game_cards', revision: 'card_revisions', fk: 'card_id', label: 'name', columns: ['card_set_id', 'character_id', 'name', 'effect_text', 'ruling_notes', 'rule_status', 'copies_in_deck', 'artwork_url', 'sort_order'] },
  'wiki-pages': { identity: 'wiki_pages', revision: 'wiki_page_revisions', fk: 'page_id', label: 'title', columns: ['title', 'summary', 'body_markdown', 'rule_status', 'sort_order'] },
} as const;
type Kind = keyof typeof kinds;
const auditKind = { characters: 'CHARACTERS', 'card-sets': 'SETS', cards: 'CARDS', 'wiki-pages': 'WIKI' };
const writePermission = { characters: 'characters', 'card-sets': 'card-sets', cards: 'cards', 'wiki-pages': 'wiki' } as const;
const kindOf = (value: string): Kind => Object.hasOwn(kinds, value) ? value as Kind : fail(404, 'NOT_FOUND');
const optionalId = z.string().uuid().optional();
const querySchema = z.object({ page: z.coerce.number().int().min(0).max(10000).default(0), size: z.coerce.number().int().min(1).max(100).default(20), q: z.string().max(100).default('') });
const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().trim();
const escaped = (s: string) => `%${s.trim().toLowerCase().replace(/[!%_]/g, char => '!' + char)}%`;
const baseSelect = (kind: Kind, admin = false) => {
  const k = kinds[kind];
  return `SELECT i.id,i.slug,${kind === 'wiki-pages' ? 'i.page_type' : 'i.code'},${admin ? 'r.id AS revision_id,r.release_id,' : ''}${k.columns.map(c => 'r.' + c).join(',')} FROM ${k.identity} i JOIN ${k.revision} r ON r.${k.fk}=i.id`;
};
async function release(db: Executor, id?: string, publicOnly = false): Promise<Row> {
  if (publicOnly) return one(db, `SELECT id,version_label,title,published_at,version FROM content_releases WHERE ${id ? "id=? AND status IN ('PUBLISHED','ARCHIVED')" : "current_slot=1 AND status='PUBLISHED'"} AND published_at IS NOT NULL`, id ? [id] : []);
  return one(db, 'SELECT * FROM content_releases WHERE id=?', [id!]);
}
const budgetStatement = (id: string, kind: Kind) => {
  const k = kinds[kind]; const cols = k.columns.filter(c => !c.endsWith('_id') && !['copies_in_deck', 'sort_order'].includes(c));
  return { sql: `SELECT COUNT(*) AS n,COALESCE(SUM(${cols.map(c => `COALESCE(length(${c}),0)`).join('+')}),0) AS chars FROM ${k.revision} WHERE release_id=?`, args: [id] as InValue[] };
};
function checkBudget(rows: Row[]) {
  // Same count/text budget as the previous backend. Never fetch bodies before this check.
  let count = 0, text = 0;
  for (const row of rows) { count += Number(row.n); text += Number(row.chars); }
  if (count > 2000 || text > 500000) return fail(413, 'CONTENT_TOO_LARGE');
}
async function budget(db: Executor, id: string, selected = Object.keys(kinds) as Kind[]) {
  const rows: Row[] = [];
  for (const kind of selected) rows.push(await one(db, budgetStatement(id, kind).sql, [id]));
  checkBudget(rows);
}
/** Public path: all kinds counted in one Turso round trip. */
const publicBudget = async (db: Client, id: string, selected = Object.keys(kinds) as Kind[]) =>
  checkBudget((await batchRead(db, selected.map(kind => budgetStatement(id, kind)))).map(rows => rows[0]));
async function audit(db: Executor, actor: Actor, action: string, kind: string, entity: string, id: string, version: number, extra = '') {
  await execute(db, "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,outcome,details_redacted) VALUES (?,?,?,?,?,'SUCCESS',?)", [uuid(), actor.id, action, kind, entity, `releaseId=${id};version=${version}${extra}`]);
}
const editable = (row: Row, expected: number) => { if (row.status !== 'DRAFT') return fail(409, 'RELEASE_IMMUTABLE'); if (row.version !== expected) return fail(409, 'VERSION_CONFLICT'); };
const rule = z.enum(['CONFIRMED', 'NEEDS_REVIEW']);
const pageType = z.enum(['STORY', 'RULE', 'GUIDE', 'FAQ', 'DEVLOG']);
const image = z.string().max(2048).refine(value => {
  if (value.startsWith('/assets/') && !value.includes('..') && !value.includes('\\')) return true;
  if (/^\/media\/cards\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(value)) return true; // ảnh đã tải lên R2 qua /admin/media/card-image
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}).nullable().optional().default(null);
const common = z.object({ expectedVersion: z.number().int().nonnegative(), entityId: z.string().uuid().nullable().optional(), slug: z.string().max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), sortOrder: z.number().int().min(0).max(100000).nullable().optional().transform(v => v ?? 0) });
const code = z.string().max(40).regex(/^[A-Z0-9][A-Z0-9_-]*$/);
const optionalText = (max: number) => z.string().max(max).nullable().optional().default(null);
const writes = {
  characters: common.extend({ code, name: z.string().trim().min(1).max(160), biography: z.string().trim().min(1).max(20000), abilityText: optionalText(10000), portraitUrl: image }),
  'card-sets': common.extend({ code, name: z.string().trim().min(1).max(160), description: optionalText(10000) }),
  cards: common.extend({ code, name: z.string().trim().min(1).max(160), cardSetId: z.string().uuid(), characterId: z.string().uuid().nullable().optional().default(null), effectText: z.string().trim().min(1).max(10000), rulingNotes: optionalText(10000), ruleStatus: rule, copiesInDeck: z.number().int().min(1).max(1000), artworkUrl: image }),
  'wiki-pages': common.extend({ pageType, title: z.string().trim().min(1).max(200), summary: optionalText(1000), bodyMarkdown: z.string().trim().min(1).max(20000), ruleStatus: rule }),
};
const releaseWrite = z.object({ title: z.string().trim().min(1).max(200), releaseNotes: optionalText(10000) });
const createRelease = releaseWrite.extend({ versionLabel: z.string().max(40).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/) });
const publishRelease = z.object({ expectedVersion: z.number().int().nonnegative() });
const authorColumn = 'created_by TEXT REFERENCES app_users(id) ON DELETE SET NULL';

/** Existing databases get the author column lazily: SQLite has no ADD COLUMN IF NOT EXISTS. */
export async function initializeContentAuthorship(db: Executor) {
  for (const k of Object.values(kinds)) await execute(db, `ALTER TABLE ${k.revision} ADD COLUMN ${authorColumn}`).catch(() => undefined);
}
/** Row authorship only opens update/delete while the account can still read content. */
const ownsRow = (permissions: string[], createdBy: unknown, userId: string) => createdBy === userId && permissions.includes('content:read');

export function contentRoutes(app: Api, db: Client, cache: Cache) {
  const cached = cache.cached;
  // Public content is read-only and published releases are immutable: serve it from a short in-process cache
  // (cleared on admin writes) and keep cold reads to the fewest Turso round trips.
  // Keys contain only validated values: unknown query parameters or their order must not create new entries.
  const publicKey = (...parts: unknown[]) => JSON.stringify(parts);
  app.get('/api/v1/content/release', async c => {
    const releaseId = optionalId.parse(c.req.query('releaseId'));
    return c.json(await cached(publicKey('release', releaseId ?? ''), PUBLIC_TTL_MS,
      async () => camel(await release(db, releaseId, true))));
  });
  app.get('/api/v1/content/snapshot', async c => {
    const releaseId = optionalId.parse(c.req.query('releaseId'));
    return c.json(await cached(publicKey('snapshot', releaseId ?? ''), PUBLIC_TTL_MS, async () => {
      const r = await release(db, releaseId, true); await publicBudget(db, r.id);
      const names = Object.keys(kinds) as Kind[];
      const rows = await batchRead(db, names.map(kind => ({ sql: baseSelect(kind) + ' WHERE r.release_id=? ORDER BY r.sort_order,i.id', args: [r.id] })));
      const content: Row = {}; names.forEach((kind, i) => { content[kind] = rows[i].map(camel); });
      return { schemaVersion: 1, release: camel(r), content };
    }));
  });
  app.get('/api/v1/content/:kind', async c => {
    const kind = kindOf(c.req.param('kind')), k = kinds[kind]; const q = querySchema.parse({ size: 12, ...c.req.query() });
    const set = optionalId.parse(c.req.query('cardSetId')), character = optionalId.parse(c.req.query('characterId')), type = pageType.optional().parse(c.req.query('pageType'));
    if (((set || character) && kind !== 'cards') || (type && kind !== 'wiki-pages')) return fail(400, 'INVALID_QUERY');
    const releaseId = optionalId.parse(c.req.query('releaseId')), search = normalize(q.q);
    // Search results are keyed by the normalized term and share the cache's byte budget, so repeated terms hit
    // while arbitrary terms cannot grow memory beyond the configured limits.
    return c.json(await cached(publicKey('list', kind, releaseId ?? '', q.page, q.size, search, set ?? '', character ?? '', type ?? ''), PUBLIC_TTL_MS, async () => {
      const r = await release(db, releaseId, true); await publicBudget(db, r.id, [kind]);
      let where = ' WHERE r.release_id=?'; const args: InValue[] = [r.id];
      for (const [column, value] of [['r.card_set_id', set], ['r.character_id', character], ['i.page_type', type]]) if (value) { where += ` AND ${column}=?`; args.push(value); }
      const metadata = await all(db, `SELECT i.id,i.slug,${kind === 'wiki-pages' ? "'' AS code" : 'i.code'},r.sort_order,r.${k.label} AS label FROM ${k.identity} i JOIN ${k.revision} r ON r.${k.fk}=i.id` + where, args);
      const sorted = metadata.map((row): Row => ({ ...row, normalized: normalize(row.label) })).filter(row => !search || normalize(`${row.label}`).includes(search) || normalize(row.slug).includes(search) || normalize(row.code).includes(search))
        .sort((a, b) => a.sort_order - b.sort_order || (a.normalized < b.normalized ? -1 : a.normalized > b.normalized ? 1 : 0) || a.id.localeCompare(b.id));
      const selected = sorted.slice(q.page * q.size, (q.page + 1) * q.size); let items: Row[] = [];
      if (selected.length) {
        const rows = await all(db, baseSelect(kind) + ` WHERE r.release_id=? AND i.id IN (${selected.map(() => '?')})`, [r.id, ...selected.map(v => v.id)]);
        const byId = new Map(rows.map(row => [row.id, camel(row)])); items = selected.map(row => byId.get(row.id)!);
      }
      return { release: camel(r), result: page(items, q.page, q.size, sorted.length) };
    }));
  });
  for (const suffix of ['by-id/:id', ':slug']) app.get(`/api/v1/content/:kind/${suffix}`, async c => {
    const kind = kindOf(c.req.param('kind')); const id = c.req.param('id'); const slug = c.req.param('slug');
    if (id) z.string().uuid().parse(id); else z.string().max(160).regex(/^[a-zA-Z0-9_-]+$/).parse(slug);
    const releaseId = optionalId.parse(c.req.query('releaseId'));
    return c.json(await cached(publicKey('item', kind, id ? 'id' : 'slug', id || slug!, releaseId ?? ''), PUBLIC_TTL_MS, async () => {
      const r = await release(db, releaseId, true);
      return { release: camel(r), item: camel(await one(db, baseSelect(kind) + ` WHERE r.release_id=? AND i.${id ? 'id' : 'slug'}=?`, [r.id, id || slug!])) };
    }));
  });

  app.use('/api/v1/admin/*', async (c, next) => { requireActor(c, true); await next(); });
  app.get('/api/v1/admin/dashboard', async c => c.json(await transaction(db, async tx => ({ asOf: now(), releases: {
    draft: await scalar(tx, "SELECT COUNT(*) FROM content_releases WHERE status='DRAFT'"), published: await scalar(tx, "SELECT COUNT(*) FROM content_releases WHERE status='PUBLISHED'"), archived: await scalar(tx, "SELECT COUNT(*) FROM content_releases WHERE status='ARCHIVED'"),
  }, feedbackNew: await scalar(tx, "SELECT COUNT(*) FROM player_feedback WHERE status='NEW'"), cardsNeedingReview: await scalar(tx, "SELECT COUNT(*) FROM card_revisions r JOIN content_releases c ON c.id=r.release_id WHERE c.status='DRAFT' AND r.rule_status='NEEDS_REVIEW'") }), 'read')));
  app.get('/api/v1/admin/content/releases', async c => c.json(await transaction(db, async tx => {
    const actor = requireActor(c, true); await authorizePermission(tx, actor, 'content:read');
    const q = querySchema.parse(c.req.query()); const status = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional().parse(c.req.query('status'));
    const where = status ? ' WHERE status=?' : '', args: InValue[] = status ? [status] : [];
    const count = await scalar(tx, 'SELECT COUNT(*) FROM content_releases' + where, args);
    return page((await all(tx, 'SELECT * FROM content_releases' + where + ' ORDER BY created_at DESC,id LIMIT ? OFFSET ?', [...args, q.size, q.page * q.size])).map(camel), q.page, q.size, count);
  }, 'read')));
  app.post('/api/v1/admin/content/releases', async c => {
    const b = createRelease.parse(await c.req.json()), actor = requireActor(c, true);
    return c.json(await transaction(db, async tx => { await authorizePermission(tx, actor, 'releases:create'); const id = uuid();
      await execute(tx, 'INSERT INTO content_releases(id,version_label,title,release_notes,created_by) VALUES (?,?,?,?,?)', [id, b.versionLabel, b.title, b.releaseNotes, actor.id]);
      await audit(tx, actor, 'CONTENT_RELEASE_CREATED', 'CONTENT_RELEASE', id, id, 0); return camel(await release(tx, id));
    }), 201);
  });
  app.get('/api/v1/admin/content/releases/:release', async c => {
    await authorizePermission(db, requireActor(c, true), 'content:read');
    return c.json(camel(await release(db, z.string().uuid().parse(c.req.param('release')))));
  });
  app.put('/api/v1/admin/content/releases/:release', async c => {
    const id = z.string().uuid().parse(c.req.param('release')), actor = requireActor(c, true); const b = releaseWrite.extend({ expectedVersion: z.number().int().nonnegative() }).parse(await c.req.json());
    return c.json(await transaction(db, async tx => {
      const { user, access } = await permissionView(tx, actor);
      const direct = access.permissions.includes('releases:update');
      if (!direct && !access.permissions.includes('content:read')) return fail(403, 'PERMISSION_REQUIRED');
      const current = await release(tx, id); editable(current, b.expectedVersion);
      if (!direct && !ownsRow(access.permissions, current.created_by, user.id)) return fail(403, 'PERMISSION_REQUIRED');
      await execute(tx, 'UPDATE content_releases SET title=?,release_notes=?,version=version+1 WHERE id=?', [b.title, b.releaseNotes, id]);
      await audit(tx, actor, 'CONTENT_RELEASE_UPDATED', 'CONTENT_RELEASE', id, id, b.expectedVersion + 1); return camel(await release(tx, id)); }));
  });
  app.post('/api/v1/admin/content/releases/:release/clone', async c => {
    const source = z.string().uuid().parse(c.req.param('release')), actor = requireActor(c, true); const b = createRelease.extend({ sourceVersion: z.number().int().nonnegative() }).parse(await c.req.json());
    return c.json(await transaction(db, async tx => {
      await authorizePermission(tx, actor, 'releases:clone'); if ((await release(tx, source)).version !== b.sourceVersion) return fail(409, 'VERSION_CONFLICT'); await budget(tx, source);
      const id = uuid(); await execute(tx, 'INSERT INTO content_releases(id,version_label,title,release_notes,created_by) VALUES (?,?,?,?,?)', [id, b.versionLabel, b.title, b.releaseNotes, actor.id]);
      // INSERT SELECT copies the bounded release inside the same transaction without N network round trips.
      // The copy belongs to the cloning account, the source rows keep their original author.
      for (const k of Object.values(kinds)) await execute(tx, `INSERT INTO ${k.revision}(id,${k.fk},release_id,${k.columns},created_by) SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),${k.fk},?,${k.columns},? FROM ${k.revision} WHERE release_id=?`, [id, actor.id, source]);
      await audit(tx, actor, 'CONTENT_RELEASE_CLONED', 'CONTENT_RELEASE', id, id, 0); return camel(await release(tx, id));
    }), 201);
  });
  app.post('/api/v1/admin/content/releases/:release/publish', async c => {
    const id = z.string().uuid().parse(c.req.param('release')), actor = requireActor(c, true);
    const b = publishRelease.parse(await c.req.json());
    return c.json(await transaction(db, async tx => {
      await authorizePermission(tx, actor, 'releases:publish');
      editable(await release(tx, id), b.expectedVersion);
      // Publishing nothing would replace a readable public release with blank pages.
      const revisions = await scalar(tx, `SELECT (SELECT COUNT(*) FROM character_revisions WHERE release_id=?) + (SELECT COUNT(*) FROM card_set_revisions WHERE release_id=?) + (SELECT COUNT(*) FROM card_revisions WHERE release_id=?) + (SELECT COUNT(*) FROM wiki_page_revisions WHERE release_id=?)`, [id, id, id, id]);
      if (revisions === 0) return fail(409, 'RELEASE_EMPTY');
      const previous = (await all(tx, "SELECT id,version FROM content_releases WHERE current_slot=1 AND status='PUBLISHED'"))[0];
      if (previous) {
        await execute(tx, "UPDATE content_releases SET status='ARCHIVED',current_slot=NULL,version=version+1 WHERE id=?", [previous.id]);
        await audit(tx, actor, 'CONTENT_RELEASE_ARCHIVED', 'CONTENT_RELEASE', previous.id, previous.id, Number(previous.version) + 1, `;replacedBy=${id}`);
      }
      await execute(tx, "UPDATE content_releases SET status='PUBLISHED',current_slot=1,published_at=?,version=version+1 WHERE id=?", [now(), id]);
      await audit(tx, actor, 'CONTENT_RELEASE_PUBLISHED', 'CONTENT_RELEASE', id, id, b.expectedVersion + 1, previous ? `;archived=${previous.id}` : '');
      return camel(await release(tx, id));
    }));
  });
  app.get('/api/v1/admin/content/releases/:release/preview', async c => c.json(await transaction(db, async tx => {
    await authorizePermission(tx, requireActor(c, true), 'content:read');
    const id = z.string().uuid().parse(c.req.param('release')); const r = await release(tx, id); await budget(tx, id); const content: Row = {};
    for (const kind of Object.keys(kinds) as Kind[]) content[kind] = (await all(tx, baseSelect(kind, true) + ' WHERE r.release_id=? ORDER BY r.sort_order,i.id', [id])).map(camel);
    return { release: camel(r), content, previewOnly: true };
  }, 'read')));
  app.get('/api/v1/admin/content/identities/:kind', async c => c.json(await transaction(db, async tx => {
    await authorizePermission(tx, requireActor(c, true), 'content:read');
    const kind = kindOf(c.req.param('kind')), k = kinds[kind], q = querySchema.parse(c.req.query()), search = escaped(q.q), label = kind === 'wiki-pages' ? 'page_type' : 'code';
    const where = ` WHERE lower(slug) LIKE ? ESCAPE '!' OR lower(${label}) LIKE ? ESCAPE '!'`;
    const count = await scalar(tx, `SELECT COUNT(*) FROM ${k.identity}` + where, [search, search]);
    return page((await all(tx, `SELECT id,slug,${label} FROM ${k.identity}` + where + ' ORDER BY slug,id LIMIT ? OFFSET ?', [search, search, q.size, q.page * q.size])).map(camel), q.page, q.size, count);
  }, 'read')));
  app.get('/api/v1/admin/content/audit-events', async c => c.json(await transaction(db, async tx => {
    await authorizePermission(tx, requireActor(c, true), 'content:read');
    const q = querySchema.parse(c.req.query()), id = optionalId.parse(c.req.query('releaseId')); const args: InValue[] = [], where = " WHERE action LIKE 'CONTENT!_%' ESCAPE '!'" + (id ? ' AND details_redacted LIKE ?' : '');
    if (id) args.push(`releaseId=${id};version=%`); const count = await scalar(tx, 'SELECT COUNT(*) FROM audit_events' + where, args);
    return page((await all(tx, 'SELECT * FROM audit_events' + where + ' ORDER BY created_at DESC,id LIMIT ? OFFSET ?', [...args, q.size, q.page * q.size])).map(camel), q.page, q.size, count);
  }, 'read')));
  app.get('/api/v1/admin/content/releases/:release/:kind', async c => c.json(await transaction(db, async tx => {
    await authorizePermission(tx, requireActor(c, true), 'content:read');
    const id = z.string().uuid().parse(c.req.param('release')), kind = kindOf(c.req.param('kind')), k = kinds[kind], q = querySchema.parse(c.req.query()); const r = await release(tx, id);
    const search = escaped(q.q); const where = ` WHERE r.release_id=? AND (lower(r.${k.label}) LIKE ? ESCAPE '!' OR lower(i.slug) LIKE ? ESCAPE '!'${kind === 'wiki-pages' ? '' : " OR lower(i.code) LIKE ? ESCAPE '!'"})`;
    const args: InValue[] = [id, search, search]; if (kind !== 'wiki-pages') args.push(search);
    const count = await scalar(tx, `SELECT COUNT(*) FROM ${k.identity} i JOIN ${k.revision} r ON r.${k.fk}=i.id` + where, args);
    return { releaseVersion: r.version, result: page((await all(tx, baseSelect(kind, true) + where + ` ORDER BY r.sort_order,r.${k.label},i.id LIMIT ? OFFSET ?`, [...args, q.size, q.page * q.size])).map(camel), q.page, q.size, count) };
  }, 'read')));
  app.get('/api/v1/admin/content/releases/:release/:kind/:id', async c => c.json(await transaction(db, async tx => {
    await authorizePermission(tx, requireActor(c, true), 'content:read');
    const id = z.string().uuid().parse(c.req.param('release')), kind = kindOf(c.req.param('kind')), entity = z.string().uuid().parse(c.req.param('id'));
    return { releaseVersion: (await release(tx, id)).version, item: camel(await one(tx, baseSelect(kind, true) + ' WHERE r.release_id=? AND i.id=?', [id, entity])) };
  }, 'read')));
  for (const method of ['post', 'put'] as const) app[method](`/api/v1/admin/content/releases/:release/:kind${method === 'put' ? '/:id' : ''}`, async c => {
    const id = z.string().uuid().parse(c.req.param('release')), kind = kindOf(c.req.param('kind')), k = kinds[kind], actor = requireActor(c, true), create = method === 'post';
    const b: Row = writes[kind].parse(await c.req.json()); const entity = create ? b.entityId || uuid() : z.string().uuid().parse(c.req.param('id'));
    return c.json(await transaction(db, async tx => {
      const { user, access } = await permissionView(tx, actor);
      const direct = access.permissions.includes(`${writePermission[kind]}:${create ? 'create' : 'update'}`);
      // Creating always needs the module right; editing falls back to authorship plus content:read.
      if (!direct && (create || !access.permissions.includes('content:read'))) return fail(403, 'PERMISSION_REQUIRED');
      editable(await release(tx, id), b.expectedVersion);
      if (!create && b.entityId && b.entityId !== entity) return fail(409, 'IDENTITY_IMMUTABLE');
      if (!create) {
        const current = await one(tx, `SELECT r.created_by FROM ${k.identity} i JOIN ${k.revision} r ON r.${k.fk}=i.id WHERE r.release_id=? AND i.id=?`, [id, entity]);
        if (!direct && !ownsRow(access.permissions, current.created_by, user.id)) return fail(403, 'PERMISSION_REQUIRED');
      }
      const existing = (await all(tx, `SELECT * FROM ${k.identity} WHERE id=?`, [entity]))[0];
      if (!existing) {
        if (!create || b.entityId) return fail(404, 'NOT_FOUND');
        if (kind === 'wiki-pages') await execute(tx, 'INSERT INTO wiki_pages VALUES (?,?,?)', [entity, b.slug, b.pageType]);
        else await execute(tx, `INSERT INTO ${k.identity} VALUES (?,?,?)`, [entity, b.code, b.slug]);
      } else if (existing.slug !== b.slug || (kind === 'wiki-pages' ? existing.page_type !== b.pageType : existing.code !== b.code)) return fail(409, 'IDENTITY_IMMUTABLE');
      const fields: Row = Object.fromEntries(Object.entries(b).map(([key, value]) => [key.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), value]));
      if (kind === 'cards') for (const [reference, table, column] of [[b.cardSetId, 'card_set_revisions', 'card_set_id'], [b.characterId, 'character_revisions', 'character_id']]) {
        if (reference && await scalar(tx, `SELECT COUNT(*) FROM ${table} WHERE release_id=? AND ${column}=?`, [id, reference]) !== 1) return fail(409, 'REFERENCE_NOT_IN_RELEASE');
      }
      if (create) await execute(tx, `INSERT INTO ${k.revision}(id,${k.fk},release_id,${k.columns},created_by) VALUES (${Array(k.columns.length + 4).fill('?')})`, [uuid(), entity, id, ...k.columns.map(col => fields[col]), user.id]);
      else await execute(tx, `UPDATE ${k.revision} SET ${k.columns.map(col => col + '=?')} WHERE release_id=? AND ${k.fk}=?`, [...k.columns.map(col => fields[col]), id, entity]);
      await execute(tx, 'UPDATE content_releases SET version=version+1 WHERE id=?', [id]);
      await audit(tx, actor, `CONTENT_${auditKind[kind]}_${create ? 'CREATED' : 'UPDATED'}`, auditKind[kind], entity, id, b.expectedVersion + 1);
      return { entityId: entity, releaseVersion: b.expectedVersion + 1, item: camel(await one(tx, baseSelect(kind, true) + ' WHERE r.release_id=? AND i.id=?', [id, entity])) };
    }), create ? 201 : 200);
  });
  app.delete('/api/v1/admin/content/releases/:release/:kind/:id', async c => {
    const id = z.string().uuid().parse(c.req.param('release')), entity = z.string().uuid().parse(c.req.param('id')), kind = kindOf(c.req.param('kind')), k = kinds[kind], actor = requireActor(c, true), expected = z.coerce.number().int().nonnegative().parse(c.req.query('expectedVersion'));
    return c.json(await transaction(db, async tx => {
      const { user, access } = await permissionView(tx, actor);
      const direct = access.permissions.includes(`${writePermission[kind]}:delete`);
      if (!direct && !access.permissions.includes('content:read')) return fail(403, 'PERMISSION_REQUIRED');
      editable(await release(tx, id), expected);
      const current = await one(tx, `SELECT r.created_by FROM ${k.identity} i JOIN ${k.revision} r ON r.${k.fk}=i.id WHERE r.release_id=? AND i.id=?`, [id, entity]);
      if (!direct && !ownsRow(access.permissions, current.created_by, user.id)) return fail(403, 'PERMISSION_REQUIRED');
      if (kind === 'card-sets' || kind === 'characters') if (await scalar(tx, `SELECT COUNT(*) FROM card_revisions WHERE release_id=? AND ${kind === 'card-sets' ? 'card_set_id' : 'character_id'}=?`, [id, entity])) return fail(409, 'CONTENT_IN_USE');
      await execute(tx, `DELETE FROM ${k.revision} WHERE release_id=? AND ${k.fk}=?`, [id, entity]); await execute(tx, 'UPDATE content_releases SET version=version+1 WHERE id=?', [id]);
      await audit(tx, actor, `CONTENT_${auditKind[kind]}_REMOVED`, auditKind[kind], entity, id, expected + 1); return { entityId: entity, releaseVersion: expected + 1 };
    }));
  });
}
