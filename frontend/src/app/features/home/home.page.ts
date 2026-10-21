import { RiseHeadingDirective } from '../../shared/motion/rise-heading.directive';
import { DotGridWarpDirective } from '../../shared/motion/dot-grid-warp.directive';
import { LiquidGlassDirective } from '../../shared/motion/liquid-glass.directive';
import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ColumnSpreadComponent } from '../../shared/components/column-spread/column-spread.component';
import { MarqueeComponent } from '../../shared/components/marquee/marquee.component';
import { MorphIconComponent } from '../../shared/components/morph-icon/morph-icon.component';
@Component({ selector: 'app-home-page', imports: [LiquidGlassDirective, DotGridWarpDirective, RiseHeadingDirective, RouterLink, ColumnSpreadComponent, MarqueeComponent, MorphIconComponent], templateUrl: './home.page.html', styleUrls: ['./home.page.css', './home-glass.css'] })
export class HomePage {
  readonly marqueeItems = [{ text: 'Chưa giàu đã lớn' }, { text: 'Chia tiền' }, { text: 'Chia việc' }, { text: 'Nhà này hơi báo!' }, { text: 'Chia cả niềm vui' }, { text: 'Rút một thẻ' }];
  readonly selectedTheme = signal(0);
  readonly themes = [
    { name: 'Quỹ nhà chung', line: 'Chia tiền. Chia việc. Chia cả niềm vui.', color: '#dafa76', ink: '#183c2b', card: '/assets/cards/card-01.svg' },
    { name: 'Chuyện cùng nhà', line: 'Ở chung một nhà, chẳng ngày nào giống nhau.', color: '#ffacc9', ink: '#4f203c', card: '/assets/cards/card-02.svg' },
    { name: 'Đến lượt bạn', line: 'Rủ hội bạn. Rút một thẻ. Bắt đầu câu chuyện.', color: '#b7cfff', ink: '#1d3760', card: '/assets/cards/card-03.svg' },
  ];
  readonly shortcuts = [
    { title: 'Cách chơi', text: 'Bắt đầu từ luật chơi và cấu trúc một lượt.', link: '/cach-choi', icon: 'gameplay' },
    { title: 'Cư dân', text: 'Làm quen với những người cùng nhà.', link: '/cu-dan', icon: 'residents' },
    { title: 'Quỹ nhà chung', text: 'Tìm hiểu chuyện đóng quỹ và hóa đơn.', link: '/quy-nha', icon: 'fund' },
  ];
}
