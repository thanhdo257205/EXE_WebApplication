import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  inject,
  input,
  OnChanges,
  signal,
  SimpleChanges,
  viewChild,
} from '@angular/core';
import { defineMorphIcon, MorphIconElement } from 'morphicons/element';
import { MORPH_ICONS, MorphIconName } from './icons';

// Ensure the custom element <morph-icon> is registered globally
defineMorphIcon();

@Component({
  selector: 'app-morph-icon',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './morph-icon.component.html',
  styleUrl: './morph-icon.component.css',
})
export class MorphIconComponent implements OnChanges {
  readonly name = input.required<MorphIconName | string>();
  readonly hoverName = input<MorphIconName | string | undefined>(undefined);
  readonly size = input<number | string>(20);
  readonly color = input<string>('currentColor');
  readonly strokeWidth = input<number | string>(2);
  readonly spring = input<'smooth' | 'snappy' | 'bouncy'>('bouncy');

  readonly morphEl = viewChild<ElementRef<MorphIconElement>>('morphEl');
  readonly currentIconD = signal<string>('');

  private isHovered = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['name'] && !this.isHovered) {
      const pathD = this.resolveIcon(this.name());
      this.currentIconD.set(pathD);
      const el = this.morphEl()?.nativeElement;
      if (el && typeof el.morphTo === 'function') {
        el.morphTo(pathD, this.spring());
      }
    }
  }

  onMouseEnter(): void {
    const hover = this.hoverName();
    if (hover) {
      this.isHovered = true;
      const targetD = this.resolveIcon(hover);
      const el = this.morphEl()?.nativeElement;
      if (el && typeof el.morphTo === 'function') {
        el.morphTo(targetD, this.spring());
      } else {
        this.currentIconD.set(targetD);
      }
    }
  }

  onMouseLeave(): void {
    if (this.isHovered) {
      this.isHovered = false;
      const baseD = this.resolveIcon(this.name());
      const el = this.morphEl()?.nativeElement;
      if (el && typeof el.morphTo === 'function') {
        el.morphTo(baseD, this.spring());
      } else {
        this.currentIconD.set(baseD);
      }
    }
  }

  resolveIcon(key: MorphIconName | string): string {
    return MORPH_ICONS[key] ?? key;
  }
}
