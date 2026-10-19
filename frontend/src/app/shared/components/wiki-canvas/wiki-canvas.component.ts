import { Component, input } from '@angular/core';

@Component({
  selector: 'app-wiki-canvas',
  templateUrl: './wiki-canvas.component.html',
  styleUrl: './wiki-canvas.component.css',
})
export class WikiCanvasComponent {
  readonly versionTag = input<string>('TRANG WIKI / PHIÊN BẢN V2');
  readonly subtitleTag = input<string>('TRA CỨU · NỘI DUNG DEMO');
}
