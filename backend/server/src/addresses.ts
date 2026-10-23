import type { Client, InValue } from '@libsql/client';
import { z } from 'zod';
import { all, one, scalar, execute, transaction, uuid, now, fail, type Executor, type Row } from './db.ts';
import { authorize, requireActor, type Api } from './auth.ts';

export const MAX_ADDRESSES = 10;
const text = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null);
export const addressSchema = z.object({
  label: optional(60), recipientName: text(120), phone: z.string().trim().regex(/^[+0-9 ()-]{8,32}$/),
  addressLine: text(500), ward: optional(120), district: optional(120), province: text(120), isDefault: z.boolean().optional().default(false),
});

const view = (row: Row) => ({
  id: row.id as string, label: row.label as string | null, recipientName: row.recipient_name as string, phone: row.phone as string, addressLine: row.address_line as string,
  ward: row.ward as string | null, district: row.district as string | null, province: row.province as string, isDefault: row.default_slot === 1, createdAt: row.created_at as string,
});
const list = async (db: Executor, user: string) => (await all(db, 'SELECT * FROM user_addresses WHERE user_id=? ORDER BY default_slot DESC,created_at DESC,id', [user])).map(view);
const owned = (db: Executor, id: string, user: string) => one(db, 'SELECT * FROM user_addresses WHERE id=? AND user_id=?', [id, user]);
/** Chỉ một địa chỉ mặc định mỗi người (ràng buộc UNIQUE(user_id, default_slot)): bỏ mặc định cũ trước khi đặt mới. */
const makeDefault = async (db: Executor, user: string, id: string) => {
  await execute(db, 'UPDATE user_addresses SET default_slot=NULL WHERE user_id=? AND default_slot=1 AND id<>?', [user, id]);
  await execute(db, 'UPDATE user_addresses SET default_slot=1,updated_at=? WHERE id=? AND user_id=?', [now(), id, user]);
};
const columns = (b: z.infer<typeof addressSchema>): InValue[] => [b.label, b.recipientName, b.phone, b.addressLine, b.ward, b.district, b.province];

/** Sổ địa chỉ giao hàng của người dùng (chỉ chủ sở hữu đọc/sửa được; mọi ghi qua CSRF chung của /api). */
export function addressRoutes(app: Api, db: Client) {
  app.get('/api/v1/addresses', async c => { const actor = requireActor(c); return c.json(await list(db, actor.id)); });
  app.post('/api/v1/addresses', async c => {
    const actor = requireActor(c), b = addressSchema.parse(await c.req.json());
    return c.json(await transaction(db, async tx => {
      await authorize(tx, actor);
      const count = await scalar(tx, 'SELECT COUNT(*) FROM user_addresses WHERE user_id=?', [actor.id]);
      if (count >= MAX_ADDRESSES) return fail(409, 'ADDRESS_LIMIT');
      const id = uuid();
      await execute(tx, 'INSERT INTO user_addresses(id,user_id,label,recipient_name,phone,address_line,ward,district,province) VALUES (?,?,?,?,?,?,?,?,?)', [id, actor.id, ...columns(b)]);
      if (b.isDefault || count === 0) await makeDefault(tx, actor.id, id);   // địa chỉ đầu tiên luôn là mặc định
      return view(await owned(tx, id, actor.id));
    }), 201);
  });
  app.put('/api/v1/addresses/:id', async c => {
    const actor = requireActor(c), id = z.string().uuid().parse(c.req.param('id')), b = addressSchema.parse(await c.req.json());
    return c.json(await transaction(db, async tx => {
      await authorize(tx, actor); await owned(tx, id, actor.id);
      await execute(tx, 'UPDATE user_addresses SET label=?,recipient_name=?,phone=?,address_line=?,ward=?,district=?,province=?,updated_at=? WHERE id=? AND user_id=?', [...columns(b), now(), id, actor.id]);
      if (b.isDefault) await makeDefault(tx, actor.id, id);
      return view(await owned(tx, id, actor.id));
    }));
  });
  app.post('/api/v1/addresses/:id/default', async c => {
    const actor = requireActor(c), id = z.string().uuid().parse(c.req.param('id'));
    return c.json(await transaction(db, async tx => { await authorize(tx, actor); await owned(tx, id, actor.id); await makeDefault(tx, actor.id, id); return list(tx, actor.id); }));
  });
  app.delete('/api/v1/addresses/:id', async c => {
    const actor = requireActor(c), id = z.string().uuid().parse(c.req.param('id'));
    return c.json(await transaction(db, async tx => {
      await authorize(tx, actor); const row = await owned(tx, id, actor.id);
      await execute(tx, 'DELETE FROM user_addresses WHERE id=? AND user_id=?', [id, actor.id]);
      if (row.default_slot === 1) {   // xóa địa chỉ mặc định: chuyển mặc định sang địa chỉ mới nhất còn lại
        const next = (await all(tx, 'SELECT id FROM user_addresses WHERE user_id=? ORDER BY created_at DESC,id LIMIT 1', [actor.id]))[0];
        if (next) await makeDefault(tx, actor.id, next.id);
      }
      return list(tx, actor.id);
    }));
  });
}
