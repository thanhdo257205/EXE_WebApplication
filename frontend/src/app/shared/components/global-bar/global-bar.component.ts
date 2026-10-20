import { Component, inject, input, OnInit, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { MorphIconComponent } from '../morph-icon/morph-icon.component';

@Component({
  selector: 'app-global-bar',
  standalone: true,
  imports: [RouterLink, MorphIconComponent],
  templateUrl: './global-bar.component.html',
  styleUrl: './global-bar.component.css',
})
export class GlobalBarComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly isMobileMenuOpen = input<boolean>(false);
  readonly menuToggle = output<void>();

  ngOnInit(): void {
    this.auth.loadCurrentUser().subscribe({ error: () => {} });
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
