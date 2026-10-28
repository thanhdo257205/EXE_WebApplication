import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

/** Route-level hint only: the API re-checks every permission on each request. */
export const permissionGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const required = (route.data['permissions'] as string[] | undefined) ?? [];
  if (!required.length || auth.hasAnyPermission(required)) return true;
  router.navigate(['/admin'], { state: { thieuQuyen: state.url.slice('/admin'.length + 1) || 'trang' } });
  return false;
};
