import { Component, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { WikiRailComponent } from './shared/components/wiki-rail/wiki-rail.component';
import { GlobalBarComponent } from './shared/components/global-bar/global-bar.component';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet, WikiRailComponent, GlobalBarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly mobileMenuOpen = signal(false);

  toggleMobileMenu() {
    this.mobileMenuOpen.update(v => !v);
  }
}
