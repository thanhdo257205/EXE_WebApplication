import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';

export const adminGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const currentUser = auth.currentUser();
  if (currentUser) {
    if (currentUser.role === 'ADMIN') {
      return true;
    }
    router.navigate(['/'], { queryParams: { error: 'forbidden' } });
    return false;
  }

  return auth.loadCurrentUser().pipe(
    map(user => {
      if (user && user.role === 'ADMIN') {
        return true;
      }
      if (user) {
        router.navigate(['/'], { queryParams: { error: 'forbidden' } });
        return false;
      }
      router.navigate(['/dang-nhap'], { queryParams: { returnUrl: state.url } });
      return false;
    }),
    catchError(() => {
      router.navigate(['/dang-nhap'], { queryParams: { returnUrl: state.url } });
      return of(false);
    })
  );
};
