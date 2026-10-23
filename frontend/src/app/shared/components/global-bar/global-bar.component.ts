import { Component, DestroyRef, ElementRef, inject, input, OnInit, output, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth/auth.service';
import { MorphIconComponent } from '../morph-icon/morph-icon.component';
import { LiquidGlassDirective } from '../../motion/liquid-glass.directive';

@Component({
  selector: 'app-global-bar',
  standalone: true,
  imports: [LiquidGlassDirective, RouterLink, MorphIconComponent],
  templateUrl: './global-bar.component.html',
  styleUrls: ['./global-bar.component.css', './account-menu.css'],
  host: { '(document:keydown.escape)': 'dismissSubmenu($event)', '(document:pointerdown)': 'outsidePointer($event)', '(window:resize)': 'closeSubmenu()' },
})
export class GlobalBarComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  readonly currentPath = signal(this.router.url.split('?')[0]);
  readonly openGroup = signal<string | null>(null);
  readonly accountOpen = signal(false);
  private closeTimer?: ReturnType<typeof setTimeout>;
  private focusTimer?: ReturnType<typeof setTimeout>;
  private returnFocus?: HTMLElement;
  readonly navigation = [
    { id: 'discover', label: 'Khám phá', path: '/', activePaths: ['/', '/cau-chuyen', '/cu-dan', '/chinh-sach-quyen-rieng-tu', '/dieu-khoan-su-dung'], children: [
      { label: 'Câu chuyện căn nhà', path: '/cau-chuyen', description: 'Chuyện những người trẻ lần đầu sống chung.' },
      { label: 'Hồ sơ cư dân', path: '/cu-dan', description: 'Gặp gỡ những người trong nhà.' },
      { label: 'Quyền riêng tư', path: '/chinh-sach-quyen-rieng-tu', description: 'Cách thông tin của bạn được bảo vệ.' },
      { label: 'Điều khoản sử dụng', path: '/dieu-khoan-su-dung', description: 'Những điều cần biết khi dùng website.' },
    ] },
    { id: 'cards', label: 'Thẻ bài', path: '/thu-vien', activePaths: ['/thu-vien', '/san-dau'], children: [
      { label: 'Thư viện thẻ', path: '/thu-vien', description: 'Tra cứu thẻ và hiệu ứng đã phát hành.' },
      { label: 'Sân đấu mô phỏng', path: '/san-dau', description: 'Đấu thẻ với máy, vẽ bằng WebGPU.' },
      { label: 'Hồ sơ cư dân', path: '/cu-dan', description: 'Tìm hiểu nhân vật và kỹ năng.' },
    ] },
    { id: 'guide', label: 'Cách chơi', path: '/cach-choi', activePaths: ['/cach-choi', '/quy-nha'], children: [
      { label: 'Hướng dẫn cách chơi', path: '/cach-choi', description: 'Thiết lập bàn chơi và bắt đầu một lượt.' },
      { label: 'Quỹ nhà chung', path: '/quy-nha', description: 'Tìm hiểu chuyện đóng quỹ và hóa đơn.' },
    ] },
    { id: 'wiki', label: 'Wiki luật', path: '/wiki', activePaths: ['/wiki'], children: [
      { label: 'Tra cứu wiki', path: '/wiki', description: 'Đọc luật và các bài viết đã phát hành.' },
      { label: 'Hướng dẫn cách chơi', path: '/cach-choi', description: 'Xem lại những bước cơ bản.' },
    ] },
    { id: 'shop', label: 'Cửa hàng', path: '/cua-hang', activePaths: ['/cua-hang', '/gio-hang'], children: [
      { label: 'Cửa hàng board game', path: '/cua-hang', description: 'Khu vực cửa hàng đang được hoàn thiện.' },
      { label: 'Giỏ hàng', path: '/gio-hang', description: 'Khu vực giỏ hàng đang được hoàn thiện.' },
    ] },
  ];
  readonly submenu = () => this.navigation.find(item => item.id === this.openGroup());

  constructor() {
    this.destroyRef.onDestroy(() => { clearTimeout(this.closeTimer); clearTimeout(this.focusTimer); });
  }
  isActive(paths: string[]): boolean {
    return paths.some(path => path === '/' ? this.currentPath() === '/' : this.currentPath() === path || this.currentPath().startsWith(path + '/'));
  }
  cancelClose(): void { clearTimeout(this.closeTimer); }
  hoverSubmenu(id: string, event: PointerEvent): void {
    if (event.pointerType === 'touch' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (this.openGroup() !== id) this.returnFocus = undefined;
    this.cancelClose(); this.openGroup.set(id);
  }
  scheduleClose(): void { this.cancelClose(); this.closeTimer = setTimeout(() => this.closeSubmenu(), 160); }
  closeSubmenu(): void {
    this.cancelClose(); clearTimeout(this.focusTimer); this.openGroup.set(null);
  }
  toggleSubmenu(id: string, event: Event): void {
    this.returnFocus = event.currentTarget as HTMLElement;
    if (this.openGroup() === id) this.closeSubmenu();
    else { this.cancelClose(); this.openGroup.set(id); }
  }
  openWithKeyboard(id: string, event: Event): void {
    event.preventDefault(); this.returnFocus = event.currentTarget as HTMLElement;
    this.cancelClose(); clearTimeout(this.focusTimer); this.openGroup.set(id);
    this.focusTimer = setTimeout(() => this.element.querySelector<HTMLElement>(`#submenu-${id} a`)?.focus(), 0);
  }
  initial(name: string): string { return (name.trim()[0] ?? '?').toUpperCase(); }
  toggleAccount(): void { this.closeSubmenu(); this.accountOpen.update(open => !open); }
  closeAccount(): void { this.accountOpen.set(false); }
  dismissSubmenu(event: Event): void {
    if (this.accountOpen()) { this.closeAccount(); this.element.querySelector<HTMLElement>('.account-trigger')?.focus(); return; }
    if (!this.openGroup()) return;
    event.preventDefault();
    const trigger = this.returnFocus ?? this.element.querySelector<HTMLElement>(`[data-nav-trigger="${this.openGroup()}"]`);
    this.closeSubmenu(); trigger?.focus(); this.returnFocus = undefined;
  }
  outsidePointer(event: Event): void {
    if (this.accountOpen() && event.target instanceof Node && !this.element.querySelector('.account')?.contains(event.target)) this.closeAccount();
    if (this.openGroup() && event.target instanceof Node && !this.element.querySelector('.nav-cluster')?.contains(event.target)) this.closeSubmenu();
  }
  onNavFocusOut(event: FocusEvent): void {
    if (!(event.relatedTarget instanceof Node) || !this.element.querySelector('.nav-cluster')?.contains(event.relatedTarget)) this.closeSubmenu();
  }

  readonly isMobileMenuOpen = input<boolean>(false);
  readonly menuToggle = output<void>();

  ngOnInit(): void {
    this.auth.loadCurrentUser().subscribe({ error: () => {} });
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.currentPath.set(event.urlAfterRedirects.split('?')[0]); this.closeSubmenu(); this.closeAccount();
      }
    });
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => {
        this.router.navigateByUrl('/dang-nhap');
      },
      error: () => {
        this.auth.currentUser.set(null);
        this.router.navigateByUrl('/dang-nhap');
      },
    });
  }
}
