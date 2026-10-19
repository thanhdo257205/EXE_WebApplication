import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface RailItem {
  label: string;
  link: string;
  icon: string;
  exact?: boolean;
}

@Component({
  selector: 'app-wiki-rail',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './wiki-rail.component.html',
  styleUrl: './wiki-rail.component.css',
})
export class WikiRailComponent {
  readonly railItems: RailItem[] = [
    { label: 'Trang chủ', link: '/', icon: '🏠', exact: true },
    { label: 'Câu chuyện', link: '/cau-chuyen', icon: '📖' },
    { label: 'Cư dân', link: '/cu-dan', icon: '👥' },
    { label: 'Cách chơi', link: '/cach-choi', icon: '🎲' },
    { label: 'Wiki luật', link: '/wiki', icon: '📜' },
    { label: 'Thẻ bài', link: '/thu-vien', icon: '🃏' },
    { label: 'Quỹ nhà', link: '/quy-nha', icon: '💰' },
    { label: 'Cửa hàng', link: '/cua-hang', icon: '🛒' },
  ];
}
