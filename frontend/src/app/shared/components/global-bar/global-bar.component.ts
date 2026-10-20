import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MorphIconComponent } from '../morph-icon/morph-icon.component';

@Component({
  selector: 'app-global-bar',
  imports: [RouterLink, MorphIconComponent],
  templateUrl: './global-bar.component.html',
  styleUrl: './global-bar.component.css',
})
export class GlobalBarComponent {
  readonly isMobileMenuOpen = input<boolean>(false);
  readonly menuToggle = output<void>();
}
