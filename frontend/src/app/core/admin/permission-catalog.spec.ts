import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSION_KEYS, DEFAULT_DELEGATED_PERMISSIONS, OWNER_ONLY_PERMISSIONS, PERMISSION_GROUPS,
  impliedPermissions, permissionLabel,
} from './permission-catalog';

describe('admin permission catalog', () => {
  it('lists every group item once, in the same order as the flat catalog', () => {
    const grouped = PERMISSION_GROUPS.flatMap(group => group.items.map(item => item.key));
    expect(grouped).toEqual(ALL_PERMISSION_KEYS);
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
    expect(ALL_PERMISSION_KEYS).toHaveLength(36);
  });

  it('gives every permission a Vietnamese label of its own', () => {
    const labels = ALL_PERMISSION_KEYS.map(permissionLabel);
    expect(labels.every(label => label && label.includes(':') === false)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('keeps owner-only rights out of the grantable catalog', () => {
    for (const item of OWNER_ONLY_PERMISSIONS) expect(ALL_PERMISSION_KEYS).not.toContain(item.key);
    expect(OWNER_ONLY_PERMISSIONS.map(item => item.key)).toEqual(['users:manage-roles']);
    expect(ALL_PERMISSION_KEYS).toContain('permissions:manage');
  });

  it('defaults co-admins to everything except the three rights that skip a review step', () => {
    expect(DEFAULT_DELEGATED_PERMISSIONS).toEqual(
      ALL_PERMISSION_KEYS.filter(key => key !== 'assistant:keys:manage'
        && key !== 'assistant:prompt:update' && key !== 'permissions:manage'),
    );
    expect(DEFAULT_DELEGATED_PERMISSIONS).not.toContain('assistant:keys:manage');
    expect(DEFAULT_DELEGATED_PERMISSIONS).toContain('assistant:prompt:request');
    expect(DEFAULT_DELEGATED_PERMISSIONS).not.toContain('assistant:prompt:update');
    expect(DEFAULT_DELEGATED_PERMISSIONS).not.toContain('permissions:manage');
  });

  it('mirrors the server read dependencies', () => {
    expect(impliedPermissions(['cards:update'])).toEqual(new Set(['cards:update', 'content:read']));
    expect(impliedPermissions(['media:upload'])).toEqual(new Set(['media:upload', 'content:read']));
    expect(impliedPermissions(['assistant:budgets:update'])).toEqual(new Set(['assistant:budgets:update', 'assistant:read']));
    expect(impliedPermissions(['assistant:keys:create'])).toEqual(new Set(['assistant:keys:create', 'assistant:keys:read', 'assistant:read']));
    expect(impliedPermissions(['permissions:manage'])).toEqual(new Set(['permissions:manage', 'users:read']));
  });

  it('treats keys:manage as the supervisor of every key action', () => {
    expect(impliedPermissions(['assistant:keys:manage'])).toEqual(new Set([
      'assistant:keys:manage', 'assistant:keys:read', 'assistant:keys:reveal', 'assistant:keys:test',
      'assistant:keys:revoke', 'assistant:read',
    ]));
  });

  it('never invents permissions the owner did not pick', () => {
    expect(impliedPermissions(['content:read'])).toEqual(new Set(['content:read']));
    expect(impliedPermissions(['cards:update'])).not.toContain('media:upload');
    expect(impliedPermissions(['users:read'])).toEqual(new Set(['users:read']));
    expect(impliedPermissions(['users:manage-roles', 'legacy:whatever', ''])).toEqual(new Set());
  });
});
