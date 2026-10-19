import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-placeholder-page',
  imports: [RouterLink],
  template: `<section class="panel"><p class="mb-4 text-sm text-sky-300">Đang phát triển</p><h1 class="text-3xl font-bold">{{ route.snapshot.data['heading'] }}</h1><p class="mt-5 text-slate-300">{{ route.snapshot.data['description'] }}</p><a routerLink="/" class="mt-8 inline-block text-sky-300">← Về trang chủ</a></section>`,
})
export class PlaceholderPage { readonly route = inject(ActivatedRoute); }
