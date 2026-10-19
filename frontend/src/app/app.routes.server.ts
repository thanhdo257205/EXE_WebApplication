import { RenderMode, ServerRoute } from '@angular/ssr';
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'thu-vien', renderMode: RenderMode.Prerender },
  { path: 'wiki', renderMode: RenderMode.Prerender },
  { path: 'huong-dan', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
