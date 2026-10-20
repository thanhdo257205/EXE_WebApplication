import { RiseHeadingDirective } from './motion/rise-heading.directive';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ColumnSpreadComponent } from './components/column-spread/column-spread.component';

@Component({
  selector: 'app-placeholder-page',
  imports: [RiseHeadingDirective, RouterLink, ColumnSpreadComponent],
  templateUrl: './placeholder.page.html',
  styleUrl: './placeholder.page.css',
})
export class PlaceholderPage {
  readonly heading = input('Đang cập nhật');
  readonly description = input('Khu vực này đang được hoàn thiện.');
}
