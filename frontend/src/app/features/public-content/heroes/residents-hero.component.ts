import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MarqueeComponent } from '../../../shared/components/marquee/marquee.component';
import { GAME } from '../../../shared/game-facts';

const letters = (text: string) => Array.from(text);

/**
 * Đầu trang Hồ sơ cư dân theo kiểu Marcus Vane: tên khổng lồ hai dòng màu đỏ cam bằng chữ cô đặc, hiện từng ký tự;
 * phía trước là quạt 8 ô hồ sơ (4 nam, 4 nữ) tràn khỏi mép dưới, lớp chuyển màu làm tan chân; sau đó là dải chữ chạy.
 * Ô hồ sơ chỉ là minh họa: chân dung và tên nhân vật công bố cùng bản nội dung chính thức.
 */
@Component({
  selector: 'app-residents-hero',
  imports: [RouterLink, MarqueeComponent],
  templateUrl: './residents-hero.component.html',
  styleUrl: './residents-hero.component.css',
})
export class ResidentsHeroComponent {
  readonly heading = input('Những người chung nhà');
  readonly game = GAME;
  readonly lines = [letters('Những người'), letters('chung nhà')];
  /** 8 ô xếp quạt từ −28° đến +28°, xen kẽ nam/nữ chỉ để minh họa tỷ lệ 4/4. */
  readonly slots = Array.from({ length: GAME.characters }, (_, i) => ({ n: i + 1, label: i % 2 ? 'Nữ' : 'Nam', r: -28 + i * 8 }));
  readonly roles = [`${GAME.characters} hồ sơ`, `${GAME.male} nam`, `${GAME.female} nữ`, '1 căn nhà'];
  readonly marquee = [
    { text: `${GAME.male} nam` }, { text: `${GAME.female} nữ` }, { text: 'Tiểu sử' },
    { text: 'Kỹ năng riêng' }, { text: `Chọn ${GAME.players} trong ${GAME.characters}` }, { text: 'Một căn nhà' },
  ];
}
