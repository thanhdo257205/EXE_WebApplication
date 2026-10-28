export interface PermissionItem {
  key: string;
  label: string;
  hint?: string;
}

export interface PermissionGroup {
  id: string;
  label: string;
  note?: string;
  items: PermissionItem[];
}

/** Mirrors GRANTABLE_PERMISSIONS in backend/server/src/rbac-policy.ts; keys must stay identical. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'content',
    label: 'Nội dung & thẻ bài',
    note: 'Mọi quyền ghi trong nhóm này tự kèm "Xem nội dung" để trang dùng được.',
    items: [
      { key: 'content:read', label: 'Xem nội dung', hint: 'Tự thêm khi cấp quyền ghi nội dung' },
      { key: 'releases:create', label: 'Tạo bản phát hành' },
      { key: 'releases:update', label: 'Sửa bản phát hành nháp' },
      { key: 'releases:clone', label: 'Nhân bản bản phát hành' },
      { key: 'releases:publish', label: 'Xuất bản bản phát hành' },
      { key: 'cards:create', label: 'Thêm thẻ' },
      { key: 'cards:update', label: 'Sửa thẻ' },
      { key: 'cards:delete', label: 'Xóa thẻ' },
      { key: 'card-sets:create', label: 'Thêm bộ thẻ' },
      { key: 'card-sets:update', label: 'Sửa bộ thẻ' },
      { key: 'card-sets:delete', label: 'Xóa bộ thẻ' },
      { key: 'characters:create', label: 'Thêm cư dân' },
      { key: 'characters:update', label: 'Sửa cư dân' },
      { key: 'characters:delete', label: 'Xóa cư dân' },
      { key: 'wiki:create', label: 'Thêm bài wiki' },
      { key: 'wiki:update', label: 'Sửa bài wiki' },
      { key: 'wiki:delete', label: 'Xóa bài wiki' },
      { key: 'media:upload', label: 'Tải ảnh thẻ lên kho' },
    ],
  },
  {
    id: 'feedback',
    label: 'Phản hồi người chơi',
    items: [
      { key: 'feedback:read', label: 'Xem hộp thư phản hồi' },
      { key: 'feedback:moderate', label: 'Duyệt & ghi chú phản hồi' },
    ],
  },
  {
    id: 'assistant',
    label: 'Trợ lý AI & nhà cung cấp',
    note: 'Mọi quyền trợ lý tự kèm "Xem cấu hình trợ lý".',
    items: [
      { key: 'assistant:read', label: 'Xem cấu hình trợ lý', hint: 'Tự thêm khi cấp quyền trợ lý khác' },
      { key: 'assistant:usage:read', label: 'Xem số liệu sử dụng' },
      { key: 'assistant:models:update', label: 'Sửa model của nhà cung cấp' },
      { key: 'assistant:models:reorder', label: 'Sắp xếp thứ tự nhà cung cấp' },
      { key: 'assistant:slots:update', label: 'Bật/tắt slot key' },
      { key: 'assistant:budgets:update', label: 'Đặt hạn mức token mỗi ngày' },
    ],
  },
  {
    id: 'keys',
    label: 'API key trợ lý AI',
    note: 'Chỉ áp dụng cho key do chính tài khoản đó thêm, trừ khi có quyền quản lý mọi key.',
    items: [
      { key: 'assistant:keys:read', label: 'Xem danh sách key', hint: 'Tự thêm khi cấp quyền key khác' },
      { key: 'assistant:keys:create', label: 'Thêm API key (trạng thái chờ duyệt)' },
      { key: 'assistant:keys:reveal', label: 'Xem nội dung key của mình' },
      { key: 'assistant:keys:test', label: 'Kiểm tra key của mình' },
      { key: 'assistant:keys:revoke', label: 'Thu hồi key của mình' },
      {
        key: 'assistant:keys:manage',
        label: 'Quản lý mọi API key',
        hint: 'Thấy & duyệt key của người khác, key tự thêm kích hoạt ngay. Không nằm trong bộ mặc định.',
      },
    ],
  },
  {
    id: 'users',
    label: 'Tài khoản cư dân',
    items: [{ key: 'users:read', label: 'Xem danh sách tài khoản' }],
  },
];

/** Capabilities the owner keeps for itself; shown as information only, never grantable. */
export const OWNER_ONLY_PERMISSIONS: PermissionItem[] = [
  { key: 'users:manage-roles', label: 'Cấp/thu hồi quyền đồng quản trị' },
  { key: 'permissions:manage', label: 'Phân quyền chi tiết cho đồng quản trị' },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap(group => group.items.map(item => item.key));

/** Mirrors DEFAULT_DELEGATED_PERMISSIONS in the backend: everything except the key supervisor right. */
export const DEFAULT_DELEGATED_PERMISSIONS: string[] = ALL_PERMISSION_KEYS.filter(key => key !== 'assistant:keys:manage');

const LABELS = new Map<string, string>(
  [...PERMISSION_GROUPS.flatMap(group => group.items), ...OWNER_ONLY_PERMISSIONS].map(item => [item.key, item.label]),
);

export const permissionLabel = (key: string): string => LABELS.get(key) ?? key;

/** The same dependency rules the server applies when it stores a set. */
export function impliedPermissions(keys: readonly string[]): Set<string> {
  const granted = new Set<string>();
  for (const key of keys) {
    if (!ALL_PERMISSION_KEYS.includes(key)) continue;
    granted.add(key);
    if (/^(releases|cards|card-sets|characters|wiki|media):/.test(key)) granted.add('content:read');
    if (key.startsWith('assistant:')) granted.add('assistant:read');
    if (/^assistant:keys:(create|reveal|test|revoke|manage)$/.test(key)) granted.add('assistant:keys:read');
    if (key === 'assistant:keys:manage') {
      granted.add('assistant:keys:reveal');
      granted.add('assistant:keys:test');
      granted.add('assistant:keys:revoke');
    }
  }
  return granted;
}
