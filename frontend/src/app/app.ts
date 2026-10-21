import { afterNextRender, Component, inject, NgZone, OnDestroy, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { GlobalBarComponent } from './shared/components/global-bar/global-bar.component';
import { MorphIconComponent } from './shared/components/morph-icon/morph-icon.component';
import { CursorGhost } from './shared/utils/cursor-ghost';
import { PERF_TIER_EVENT, startPerfMonitor } from './shared/utils/perf-tier';
import { GlassControlsDirective } from './shared/motion/glass-controls.directive';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet, GlobalBarComponent, MorphIconComponent, GlassControlsDirective],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '(document:keydown.escape)': 'closeMobileMenu()' },
})
export class App implements OnDestroy {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly mobileMenuOpen = signal(false);
  readonly isAdminRoute = signal(false);

  private ghostEffect?: CursorGhost;
  private stopPerfMonitor?: () => void;
  private readonly onPerfTier = () => { this.ghostEffect?.destroy(); this.ghostEffect = undefined; };
  private readonly zone = inject(NgZone);

  constructor() {
    this.updateAdminRoute(this.router.url);
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.updateAdminRoute(event.urlAfterRedirects || event.url);
      this.mobileMenuOpen.set(false);
    });

    // Kích hoạt hiệu ứng Cursor Ghost toàn trang trên Client (SSR-safe qua afterNextRender)
    afterNextRender(() => {
      this.zone.runOutsideAngular(() => {
        window.addEventListener(PERF_TIER_EVENT, this.onPerfTier);
        this.stopPerfMonitor = startPerfMonitor();
        if (document.documentElement.dataset['perf'] === 'low') return;
        this.ghostEffect = new CursorGhost(document.body, {
          ghosts: 6,
          size: 22,
          headFollow: 0.42,
          smear: 5,
          color: '#FFFFFF'
        });
      });
    });
  }

  ngOnDestroy() {
    if (typeof window !== 'undefined') window.removeEventListener(PERF_TIER_EVENT, this.onPerfTier);
    this.stopPerfMonitor?.();
    this.ghostEffect?.destroy();
  }

  toggleMobileMenu() {
    this.mobileMenuOpen.update(v => !v);
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  private updateAdminRoute(url: string | null | undefined) {
    const path = url || '';
    this.isAdminRoute.set(path.startsWith('/admin') || path.startsWith('admin'));
  }
}
