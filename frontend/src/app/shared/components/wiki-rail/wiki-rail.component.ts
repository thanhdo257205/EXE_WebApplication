import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MorphIconComponent } from '../morph-icon/morph-icon.component';
import { MorphIconName } from '../morph-icon/icons';

export interface RailItem {
  label: string;
  link: string;
  icon: MorphIconName;
  hoverIcon?: MorphIconName;
  exact?: boolean;
}

@Component({
  selector: 'app-wiki-rail',
  imports: [RouterLink, RouterLinkActive, MorphIconComponent],
  templateUrl: './wiki-rail.component.html',
  styleUrl: './wiki-rail.component.css',
})
export class WikiRailComponent {
  readonly railItems: RailItem[] = [
    { label: 'Trang chủ', link: '/', icon: 'home', hoverIcon: 'home-active', exact: true },
    { label: 'Câu chuyện', link: '/cau-chuyen', icon: 'story', hoverIcon: 'story-open' },
    { label: 'Cư dân', link: '/cu-dan', icon: 'residents' },
    { label: 'Cách chơi', link: '/cach-choi', icon: 'gameplay' },
    { label: 'Wiki luật', link: '/wiki', icon: 'rules' },
    { label: 'Thẻ bài', link: '/thu-vien', icon: 'cards' },
    { label: 'Quỹ nhà', link: '/quy-nha', icon: 'fund' },
    { label: 'Cửa hàng', link: '/cua-hang', icon: 'store', hoverIcon: 'cart' },
  ];
}
