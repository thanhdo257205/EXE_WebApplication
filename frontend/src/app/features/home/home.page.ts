import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  template: `
    <p class="mb-4 text-sm font-semibold uppercase tracking-widest text-sky-300">Chưa Giàu Đã Lớn</p>
    <h1 class="max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">Nhà Này Hơi Báo!</h1>
    <p class="mt-6 max-w-2xl leading-8 text-slate-300">Nơi khám phá trò chơi, tìm hiểu cư dân và tra cứu luật. Đây là khung ứng dụng; nội dung và giao diện chi tiết sẽ được triển khai theo prototype Figma.</p>
    <div class="mt-10 grid gap-5 sm:grid-cols-3">
      <a routerLink="/thu-vien" class="panel"><h2 class="text-xl font-semibold">Thư viện thẻ</h2><p class="mt-3 text-slate-400">Khu vực tra cứu thẻ và hiệu ứng.</p></a>
      <a routerLink="/wiki" class="panel"><h2 class="text-xl font-semibold">Wiki luật</h2><p class="mt-3 text-slate-400">Hướng dẫn và các cơ chế trò chơi.</p></a>
      <a routerLink="/huong-dan" class="panel"><h2 class="text-xl font-semibold">Học cách chơi</h2><p class="mt-3 text-slate-400">Khu vực hướng dẫn tương tác.</p></a>
    </div>
    <section class="panel mt-10" aria-labelledby="connection-heading">
      <h2 id="connection-heading" class="text-xl font-semibold">Kết nối hệ thống</h2>
      <p class="mt-3 text-slate-400">{{ api.configured ? 'Kiểm tra kết nối tới Spring Boot khi chạy local.' : 'Chưa cấu hình API cho bản production.' }}</p>
      <button type="button" class="mt-5 rounded bg-sky-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50" [disabled]="loading() || !api.configured" (click)="checkApi()">{{ loading() ? 'Đang kiểm tra…' : 'Kiểm tra API' }}</button>
      <p role="status" class="mt-4 text-sm text-slate-300">{{ status() }}</p>
    </section>
  `,
})
export class HomePage {
  readonly api = inject(ApiService);
  readonly loading = signal(false);
  readonly status = signal('');
  checkApi() {
    if (this.loading() || !this.api.configured) return;
    this.loading.set(true);
    this.status.set('');
    this.api.getInfo().subscribe({
      next: info => { this.status.set(`Đã kết nối ${info.application} · ${info.version}`); this.loading.set(false); },
      error: () => { this.status.set('Chưa kết nối được API. Hãy kiểm tra backend và thử lại.'); this.loading.set(false); },
    });
  }
}
