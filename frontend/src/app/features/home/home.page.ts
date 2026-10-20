import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { CommunityNavComponent } from '../../shared/components/community-nav/community-nav.component';
import { WikiCanvasComponent } from '../../shared/components/wiki-canvas/wiki-canvas.component';
import { MorphIconComponent } from '../../shared/components/morph-icon/morph-icon.component';

export interface Resident {
  name: string;
  role: string;
  avatar: string;
}

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, CommunityNavComponent, WikiCanvasComponent, MorphIconComponent],
  templateUrl: './home.page.html',
  styleUrl: './home.page.css',
})
export class HomePage {
  readonly api = inject(ApiService);
  readonly loading = signal(false);
  readonly status = signal('');

  readonly residents: Resident[] = [
    { name: 'An', role: 'Thủ quỹ cầu toàn', avatar: '🧐' },
    { name: 'Bình', role: 'Nấu ăn tiết kiệm', avatar: '🍳' },
    { name: 'Chi', role: 'Săn sale công nghệ', avatar: '📱' },
    { name: 'Dũng', role: 'Cú đêm bừa bộn', avatar: '🎮' },
    { name: 'Hà', role: 'Trưởng phòng drama', avatar: '💅' },
    { name: 'Linh', role: 'Nuôi mèo quậy phá', avatar: '🐱' },
    { name: 'Minh', role: 'Cày cuốc deadline', avatar: '💻' },
    { name: 'Phúc', role: 'Tâm linh hướng ngoại', avatar: '🔮' },
  ];

  checkApi() {
    if (this.loading() || !this.api.configured) return;
    this.loading.set(true);
    this.status.set('');
    this.api.getInfo().subscribe({
      next: info => {
        this.status.set(`Đã kết nối ${info.application} · ${info.version}`);
        this.loading.set(false);
      },
      error: () => {
        this.status.set('Chưa kết nối được API. Hãy kiểm tra backend và thử lại.');
        this.loading.set(false);
      },
    });
  }
}
