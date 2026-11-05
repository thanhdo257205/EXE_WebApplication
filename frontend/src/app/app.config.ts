import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withNavigationErrorHandler, withViewTransitions } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { defineMorphIcon } from 'morphicons/element';
import { routes } from './app.routes';
import { reloadOnStaleChunk } from './shared/utils/stale-chunk';

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
      // A tab left open across a deploy requests deleted lazy chunks: reload instead of a blank page.
      withNavigationErrorHandler(error => { reloadOnStaleChunk(error); }),
    ),
    provideClientHydration(),
    provideHttpClient(withFetch()),
  ],
};
