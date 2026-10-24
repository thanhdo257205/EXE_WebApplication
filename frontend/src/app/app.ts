import { afterNextRender, Component, inject, NgZone, OnDestroy, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { GlobalBarComponent } from './shared/components/global-bar/global-bar.component';
import { MorphIconComponent } from './shared/components/morph-icon/morph-icon.component';
import { CursorGhost } from './shared/utils/cursor-ghost';
import { PERF_TIER_EVENT, startPerfMonitor } from './shared/utils/perf-tier';
import { BOOT_EVENT, runBoot, startSmoothScroll, StopSmoothScroll } from './shared/utils/boot';
import { GlassControlsDirective } from './shared/motion/glass-controls.directive';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet, GlobalBarComponent, MorphIconComponent, GlassControlsDirective],
  templateUrl: './app.html',
  styleUrls: ['./app.css', './app-footer.css'],
  host: { '(document:keydown.escape)': 'closeMobileMenu()' },
})
export class App implements OnDestroy {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly footerColumns = [
    { title: 'Khám phá', links: [{ label: 'Cách chơi', path: '/cach-choi' }, { label: 'Câu chuyện', path: '/cau-chuyen' }, { label: 'Quỹ nhà chung', path: '/quy-nha' }] },
    { title: 'Thẻ & luật', links: [{ label: 'Thư viện thẻ', path: '/thu-vien' }, { label: 'Wiki luật chơi', path: '/wiki' }, { label: 'Cư dân', path: '/cu-dan' }] },
    { title: 'Chơi & mua', links: [{ label: 'Sân đấu', path: '/san-dau' }, { label: 'Cửa hàng', path: '/cua-hang' }, { label: 'Giỏ hàng', path: '/gio-hang' }] },
    { title: 'Pháp lý', links: [{ label: 'Quyền riêng tư', path: '/chinh-sach-quyen-rieng-tu' }, { label: 'Điều khoản', path: '/dieu-khoan-su-dung' }] },
  ];

  readonly mobileMenuOpen = signal(false);
  readonly isAdminRoute = signal(false);

  private ghostEffect?: CursorGhost;
  private stopPerfMonitor?: () => void;
  private readonly onPerfTier = () => { this.ghostEffect?.destroy(); this.ghostEffect = undefined; this.syncSmoothScroll(); };
  private stopSmooth?: StopSmoothScroll;
  private smoothToken = 0;
  private booted = false;
  private readonly onBooted = () => { this.booted = true; this.syncSmoothScroll(); };

  /** Cuộn mượt chỉ cho trang công khai, sau màn mở trang, và khi máy chưa bị hạ cấp. */
  private syncSmoothScroll() {
    const wanted = this.booted && !this.isAdminRoute() && document.documentElement.dataset['perf'] !== 'low';
    const token = ++this.smoothToken;
    if (!wanted) { this.stopSmooth?.(); this.stopSmooth = undefined; return; }
    if (this.stopSmooth) return;
    void startSmoothScroll().then(stop => {
      if (token !== this.smoothToken || this.stopSmooth) return stop();
      this.stopSmooth = stop;
    }).catch(() => undefined);
  }
  private readonly zone = inject(NgZone);

  constructor() {
    this.updateAdminRoute(this.router.url);
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.updateAdminRoute(event.urlAfterRedirects || event.url);
      this.mobileMenuOpen.set(false);
      if (typeof document !== 'undefined') {
        this.stopSmooth?.();
        this.stopSmooth = undefined;
        this.syncSmoothScroll();
      }
    });

    // Kích hoạt hiệu ứng Cursor Ghost toàn trang trên Client (SSR-safe qua afterNextRender)
    afterNextRender(() => {
      this.zone.runOutsideAngular(() => {
        window.addEventListener(PERF_TIER_EVENT, this.onPerfTier);
        window.addEventListener(BOOT_EVENT, this.onBooted);
        runBoot();
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
    if (typeof window !== 'undefined') { window.removeEventListener(PERF_TIER_EVENT, this.onPerfTier); window.removeEventListener(BOOT_EVENT, this.onBooted); }
    this.stopSmooth?.();
    this.stopPerfMonitor?.();
    this.ghostEffect?.destroy();
  }

  toggleMobileMenu() {
    this.mobileMenuOpen.update(v => !v);
  }

  logout() {
    const done = () => { this.auth.currentUser.set(null); this.mobileMenuOpen.set(false); void this.router.navigateByUrl('/dang-nhap'); };
    this.auth.logout().subscribe({ next: done, error: done });
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  private updateAdminRoute(url: string | null | undefined) {
    const path = url || '';
    this.isAdminRoute.set(path.startsWith('/admin') || path.startsWith('admin'));
  }
}
