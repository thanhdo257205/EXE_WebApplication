export interface AssistantSuggestionSet {
  /** Short page name shown in the dock header. */
  page: string;
  questions: readonly string[];
}

const FALLBACK: AssistantSuggestionSet = {
  page: 'Nhà Này Hơi Báo!',
  questions: [
    'Nhà Này Hơi Báo! là game gì?',
    'Một ván chơi bao lâu và dành cho mấy người?',
    'Mục tiêu bí mật trong game là gì?',
    'Quỹ Nhà Chung hoạt động thế nào?',
  ],
};

const SETS: Record<string, AssistantSuggestionSet> = {
  '': {
    page: 'Trang chủ',
    questions: [
      'Nhà Này Hơi Báo! là game gì?',
      'Một ván chơi bao lâu và dành cho mấy người?',
      'Mục tiêu bí mật trong game là gì?',
      'Mua hộp game ở đâu?',
    ],
  },
  'cau-chuyen': {
    page: 'Câu chuyện',
    questions: [
      'Câu chuyện của Nhà Này Hơi Báo! là gì?',
      'Chưa Giàu Đã Lớn là thương hiệu gì?',
      'Vì sao căn nhà lại “hơi báo”?',
      '8 cư dân trong nhà là ai?',
    ],
  },
  'cu-dan': {
    page: 'Cư dân',
    questions: [
      'Game có bao nhiêu cư dân và cách chọn?',
      'Cư dân nào phù hợp người mới?',
      'Kỹ năng của cư dân ảnh hưởng thế nào?',
      'Cư dân liên quan gì tới Quỹ Nhà Chung?',
    ],
  },
  'cach-choi': {
    page: 'Cách chơi',
    questions: [
      'Mục tiêu để thắng là gì?',
      'Một lượt chơi gồm những bước nào?',
      'Một ván kéo dài bao lâu?',
      'Người mới cần học luật trong bao lâu?',
    ],
  },
  wiki: {
    page: 'Wiki luật',
    questions: [
      'Luật nào quan trọng nhất cho người mới?',
      'Vì sao Nhà Chung mất Tim?',
      'Hóa đơn cuối tháng được trả thế nào?',
      'Bản phát hành hiện tại có nội dung gì?',
    ],
  },
  'thu-vien': {
    page: 'Thư viện thẻ',
    questions: [
      'Bộ thẻ đang phát hành gồm những gì?',
      'Cách đọc hiệu ứng trên một lá thẻ?',
      'Thẻ này dùng trong tình huống nào?',
      'Có bao nhiêu thẻ trong bộ?',
    ],
  },
  'quy-nha': {
    page: 'Quỹ Nhà Chung',
    questions: [
      'Quỹ Nhà Chung hoạt động thế nào?',
      'Mỗi người góp quỹ bao nhiêu?',
      'Hóa đơn xuất hiện khi nào?',
      'Làm sao để Nhà Chung không mất Tim?',
    ],
  },
  'san-dau': {
    page: 'Sân đấu',
    questions: [
      'Sân đấu mô phỏng chơi thế nào?',
      'Làm sao thắng máy trong sân đấu?',
      'Nên chọn thẻ nào khi đấu với máy?',
      'Sân đấu có tính điểm hay xếp hạng không?',
    ],
  },
  'cua-hang': {
    page: 'Cửa hàng',
    questions: [
      'Hộp game gồm những thành phần nào?',
      'Giá và cách đặt mua hộp game?',
      'Cửa hàng giao hàng tới đâu?',
      'Có bản nào phù hợp người mới?',
    ],
  },
  'gio-hang': {
    page: 'Giỏ hàng',
    questions: [
      'Thanh toán đơn hàng bằng cách nào?',
      'Phí vận chuyển tính thế nào?',
      'Đơn hàng mất bao lâu để giao?',
      'Cần lưu địa chỉ giao hàng ở đâu?',
    ],
  },
  'dia-chi': {
    page: 'Sổ địa chỉ',
    questions: [
      'Lưu địa chỉ giao hàng để làm gì?',
      'Địa chỉ nào được dùng cho đơn hàng?',
      'Có thể sửa địa chỉ sau khi đặt hàng không?',
      'Quỹ Nhà Chung hoạt động thế nào?',
    ],
  },
  'dang-nhap': {
    page: 'Đăng nhập',
    questions: [
      'Đăng nhập để dùng được những gì?',
      'Trợ lý AI cần đăng nhập không?',
      'Quên mật khẩu thì làm thế nào?',
      'Nhà Này Hơi Báo! là game gì?',
    ],
  },
  'dang-ky': {
    page: 'Đăng ký',
    questions: [
      'Tạo tài khoản cư dân để làm gì?',
      'Đăng ký có cần xác minh email không?',
      'Tài khoản dùng cho việc mua hàng thế nào?',
      'Nhà Này Hơi Báo! là game gì?',
    ],
  },
  'quen-mat-khau': {
    page: 'Khôi phục mật khẩu',
    questions: [
      'Làm sao lấy lại mật khẩu?',
      'Liên kết đặt lại mật khẩu dùng trong bao lâu?',
      'Đổi mật khẩu xong có phải đăng nhập lại không?',
    ],
  },
  'chinh-sach-quyen-rieng-tu': {
    page: 'Quyền riêng tư',
    questions: [
      'Website lưu những dữ liệu gì của tôi?',
      'Trợ lý AI nhận những thông tin nào?',
      'Tôi có thể yêu cầu xoá dữ liệu không?',
    ],
  },
  'dieu-khoan-su-dung': {
    page: 'Điều khoản',
    questions: [
      'Điều khoản sử dụng quy định những gì?',
      'Trợ lý AI trả lời có phải luật chính thức không?',
      'Tài khoản bị khoá khi nào?',
    ],
  },
};

/** Picks the suggestion set for the current route; unknown routes get the general brand questions. */
export function assistantSuggestionSet(url: string): AssistantSuggestionSet {
  const path = (url || '').split(/[?#]/)[0].replace(/\/+$/, '');
  const top = path.split('/').filter(Boolean)[0] ?? '';
  return SETS[top] ?? FALLBACK;
}
