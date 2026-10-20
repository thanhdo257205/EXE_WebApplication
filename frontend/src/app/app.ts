import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { WikiRailComponent } from './shared/components/wiki-rail/wiki-rail.component';
import { GlobalBarComponent } from './shared/components/global-bar/global-bar.component';
import { MorphIconComponent } from './shared/components/morph-icon/morph-icon.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet, WikiRailComponent, GlobalBarComponent, MorphIconComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly mobileMenuOpen = signal(false);
  readonly isAdminRoute = signal(false);

  constructor() {
    this.updateAdminRoute(this.router.url);
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.updateAdminRoute(event.urlAfterRedirects || event.url);
    });
  }

  toggleMobileMenu() {
    this.mobileMenuOpen.update(v => !v);
  }

  private updateAdminRoute(url: string | null | undefined) {
    const path = url || '';
    this.isAdminRoute.set(path.startsWith('/admin') || path.startsWith('admin'));
  }
}
