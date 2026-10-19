import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommunityNavComponent } from './components/community-nav/community-nav.component';
import { WikiCanvasComponent } from './components/wiki-canvas/wiki-canvas.component';

@Component({
  selector: 'app-placeholder-page',
  imports: [RouterLink, CommunityNavComponent, WikiCanvasComponent],
  templateUrl: './placeholder.page.html',
  styleUrl: './placeholder.page.css',
})
export class PlaceholderPage {
  readonly heading = input('Đang cập nhật');
  readonly description = input('Khu vực này đang được hoàn thiện.');
}
