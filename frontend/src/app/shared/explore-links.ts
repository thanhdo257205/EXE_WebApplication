/** Các khu vực đã hoạt động của site, dùng cho thẻ "khám phá tiếp" ở trang khung, trạng thái trống và footer. */
export interface ExploreLink { meta: string; title: string; text: string; link: string; cta: string }

export const EXPLORE_LINKS: readonly ExploreLink[] = [
  { meta: 'Chơi ngay · Có hướng dẫn', title: 'Sân đấu với máy', text: 'Bàn đấu thẻ 3D, hướng dẫn từng bước cho lần chơi đầu tiên đến lúc tấn công đối thủ.', link: '/san-dau', cta: 'Vào sân' },
  { meta: 'Mô phỏng', title: 'Quỹ nhà chung', text: '4 cư dân góp kín 0–4 Tiền, lật quỹ và đối chiếu với hóa đơn 8 Tiền: Thiếu, Đủ hay Dư.', link: '/quy-nha', cta: 'Tính thử' },
  { meta: 'Tra cứu', title: 'Tủ thẻ trong nhà', text: 'Tìm thẻ theo tên hoặc mã, xem hiệu ứng và trải nghiệm thẻ minh họa 3D.', link: '/thu-vien', cta: 'Mở tủ thẻ' },
  { meta: 'Sổ tay', title: 'Wiki luật chơi', text: 'Hướng dẫn, câu hỏi thường gặp và những quy tắc đã phát hành.', link: '/wiki', cta: 'Đọc wiki' },
  { meta: 'Mua hộp', title: 'Cửa hàng', text: 'Đặt mua, chọn địa chỉ giao trong sổ địa chỉ và thanh toán bằng mã QR PayOS.', link: '/cua-hang', cta: 'Xem hàng' },
];

/** Lấy `count` khu vực, bỏ khu vực đang đứng. */
export function exploreLinksExcept(path: string, count = 3): ExploreLink[] {
  const current = path.split(/[?#]/)[0];
  return EXPLORE_LINKS.filter(item => item.link !== current).slice(0, count);
}
