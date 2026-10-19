import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface NavTab {
  label: string;
  link: string;
  exact?: boolean;
  isAccent?: boolean;
}

@Component({
  selector: 'app-community-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './community-nav.component.html',
  styleUrl: './community-nav.component.css',
})
export class CommunityNavComponent {
  readonly tabs: NavTab[] = [
    { label: 'KHÁM PHÁ ▾', link: '/', exact: true },
    { label: 'CÁCH CHƠI ▾', link: '/cach-choi' },
    { label: 'THƯ VIỆN THẺ ▾', link: '/thu-vien' },
    { label: 'WIKI LUẬT ▾', link: '/wiki' },
    { label: 'QUỸ NHÀ CHUNG ▾', link: '/quy-nha' },
    { label: 'CỬA HÀNG ▾', link: '/cua-hang', isAccent: true },
  ];
}
