/**
 * Dữ kiện game đã chốt, dùng chung cho các trang giới thiệu. Nguồn: tài liệu BMC của nhóm (mục "quy ước đã chốt" và USP)
 * và CHECKLIST (Quỹ: 4 cư dân góp 0–4 Tiền, hóa đơn cơ bản 8 Tiền). Không thêm số liệu chưa chốt (giá, bản mở rộng).
 */
export const GAME = {
  brand: 'Chưa Giàu Đã Lớn',
  name: 'Nhà Này Hơi Báo!',
  genre: 'Board game tương tác xã hội',
  players: 4,
  characters: 8,
  male: 4,
  female: 4,
  /** Thời lượng theo bản thiết kế; chưa phải số đo playtest cuối. */
  minutes: '40–60',
  cards: 148,
  sets: 11,
  bill: 8,
  maxContribution: 4,
  /** Mục tiêu thời gian học luật nhờ Quick Start + tra luật QR/Web. */
  learnMinutes: 15,
} as const;

/** Các cơ chế cốt lõi (USP) — mô tả đúng như tài liệu, không thêm chi tiết luật chưa công bố. */
export const MECHANICS = [
  { key: 'goal', title: 'Mục tiêu bí mật', text: 'Mỗi tháng, mỗi người giữ một mục tiêu cá nhân bí mật. Có mục tiêu khuyến khích tích lũy, có mục tiêu khuyến khích đóng góp — muốn thắng cho riêng mình nhưng vẫn phải sống chung.' },
  { key: 'fund', title: 'Quỹ Chung góp kín', text: 'Cuối tháng cả nhà trả hóa đơn bằng Quỹ Chung. Mỗi người góp kín và không bắt buộc phải góp, nên không ai chắc người khác đã đóng bao nhiêu.' },
  { key: 'deal', title: 'Thương lượng & lời hứa', text: 'Được mặc cả, thỏa thuận, hứa hẹn với nhau — nhưng hứa suông thì luật không bảo vệ.' },
  { key: 'heart', title: 'Tim của Nhà Chung', text: 'Thiếu quỹ, Nhà Chung mất Tim (điểm ổn định). Nhà càng yếu, chi phí các tháng sau càng có thể tăng — giữ tiền cho riêng mình luôn kèm rủi ro chung.' },
  { key: 'resource', title: 'Tiền × Sức', text: 'Hai nguồn lực để trả giá cho mọi lựa chọn: tiền nhà, ăn uống, việc làm thêm, deadline. Sự kiện theo mùa, kỹ năng nhân vật, nhiệm vụ và drama khiến không ván nào giống ván nào.' },
] as const;
