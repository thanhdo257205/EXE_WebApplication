import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { defineMorphIcon } from 'morphicons/element';
import { routes } from './app.routes';

// Register Morphicons custom element <morph-icon>
defineMorphIcon();

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      withComponentInputBinding(),
      withViewTransitions({ skipInitialTransition: true }),
    ),
    provideClientHydration(),
    provideHttpClient(withFetch()),
  ],
};
