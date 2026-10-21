# Frontend: Diet Soda reference + Column Spread + Rise & Settle

## Direction contract

- Authority: user-pinned Diet Soda reference at `D:/Angular/css-animation/index.html`; user-supplied Column Spread engine and Rise & Settle props. These override unrelated concept alternatives (`seed:4f8edfffb7547e49`).
- Build: code-led for this implementation, matching the supplied working code and inspected reference. Workflow question unanswered; no standing buildPath setting stored.
- Home mode: Persuade / showcase. Public content pages: Read. Auth/admin: Operate.
- First viewport: oversized Vietnamese product name, contrasting italic display voice, illustrated game-box mockup with dimensional CSS, tilted illustrative card faces, clear route to the existing guide. Latest user change replaces the bright hero ground with #0d0d0d and a soft radial wash; lime/pink/blue remain control/card accents. No new marketing statistics or commerce claims.
- Signature interactions: exact Column Spread canvas (three columns, 12 ordered images, 8-second loop) and spring-only heading entrance. Body paragraphs stay static.
- Scope: public shell/home/placeholders/auth/legal visual redesign. Existing admin visual layout stays; all admin headings also receive the user-requested entrance.

## Implementation

2026-10-21: button materials are now shared across public and admin via `glass-controls.css`; the rest of the admin layout remains unchanged. Native buttons receive the material automatically, with explicit `data-glass-control` on button-like links and a visual treatment on the catalog's view-3D badge. `GlassControlsDirective` delegates pointer interaction once at the app container instead of installing observers/listeners on every button. Existing nav/CTA optical directives remain responsible for their own lens/tilt. Idle controls have no backdrop blur; fine desktop hover/focus is capped at8px, with touch/reduced/opaque/high-contrast fallbacks. See [LIQUID_GLASS_CONTROLS.md](../LIQUID_GLASS_CONTROLS.md) for states, scope and verified limits.

`frontend/src/app/shared/motion/spread-columns.js` ports the supplied engine with equivalent formatting and quotes; maths, constants, PRNG, slot mapping, easing, clipping and draw order are unchanged. `.d.ts` adds the Angular boundary without editing the engine. `ColumnSpreadComponent` hosts it at responsive 16:9; backing store uses rounded CSS dimensions × min(DPR, 2). Transparent engine background is filled with #0c0b10 using destination-over. Phase starts at .12 and advances by min(dt,.05)/8. Reduced motion renders .12 statically. Resize redraws; pause, tab visibility, offscreen suspension and teardown do not change engine maths.

As of the user's 2026-10-21 image change, Column Spread defaults to nine local Pokémon TCG WebP posters in `frontend/public/assets/cards/pokemon/`, repeating the first three to retain twelve slots. `cardAspect: auto` and the static poster's contain fit retain the full portrait artwork; all other movement parameters and the engine are unchanged. Loaders are visibility gated and URL deduplicated (nine images for twelve slots), with asynchronous decode before canvas use and cleanup guards. The native lazy static poster can load earlier within the browser's preload margin. Homepage/placeholder captions credit TCGdex and distinguish these samples from the site's game content. `imageSources` can still supply another initial set; no upload endpoint. Source metadata and rights are in that asset directory. Original decorative SVGs remain in the separate hero/theme previews.

`RiseHeadingDirective` selects h1–h6 and is imported into every current heading-bearing Angular component (including admin/legal/auth). New heading-bearing components must import it too. React is lazy-loaded after Angular hydration. The original bound content stays in a screen-reader-only source span; the React layer is aria-hidden and uses TextEngine spans inside the existing semantic heading. Explicit breaks split display lines; inline emphasis retains typography. Source mutations update the visual layer, and route removal unmounts roots. Missing browser APIs or module-load failures keep static HTML visible.

Pinned dependencies: spring-text-engine 0.1.5; @react-spring/web 10.1.2; React/React DOM 19.3.1. Engine props: mode once, overflow true, numeric letterOut {opacity:0,y:24}, letterIn {opacity:1,y:0}, tension220/friction22, letterStagger30. Each explicit line offsets its delay by the previous letters. Centered headings use flex justify-content, not text-align on the engine. No CSS/keyframe/Framer Motion heading animation. Reduced motion leaves original headings static. Existing non-heading hover/loading styles are independent.

Public routes retain existing destinations and auth logic. Route data binds placeholder headings/descriptions via withComponentInputBinding. The card library, character directory and wiki now read the public content API; fund simulator and shop remain unfinished.

## Assets

Column Spread now randomizes its twelve image-slot indices at mount and once per animation wrap, while the cards are collapsed. The image order remains stable during the fan-out. Source loading positions and the display buffer are separate so late decoding preserves the current order. This changes image selection only; animation maths and cached poster loading remain unchanged. Pausing, resizing, visibility and reduced-motion changes do not trigger a reshuffle. Repeated source images mean some visible cards can retain their positions between rounds.

- House image: pre-existing `frontend/public/assets/images/can-nha-ban-dem.png`.
- Column Spread: Pokémon sample posters sourced from TCGdex, reused from the catalog; see `assets/cards/pokemon/sources.json` and `ATTRIBUTION.md`. Separate hero/theme decorative SVGs retain their typography, dice and simple geometry.
- Fraunces italic: self-hosted from Google Fonts; OFL license beside font. Existing Be Vietnam Pro body font setup retained.
- Reference photos/screenshots are inspection artifacts, not shipped art.

## Verification and limits

Browser checks use local Angular with auth/me=401 and auth/config fixtures for visual states; they do not prove a real login or production backend integration. Screenshots and browser scripts: `frontend/output/playwright/`. No deploy or cloud change is included.

Validation results and final review are recorded in PROGRESS.md for this change. React adds lazy browser code and CommonJS build advisories; official images/content and production performance remain to be validated.

Confirmed browser checks: registration 2/2 headings animated, legal 6/6, admin 5/5 with public header absent; Escape closes public mobile navigation. No pageerror in that run. With a CSS stage of 784×441 and DPR1.25, backing store is exactly 980×551. API fixtures in the browser do not create real accounts or change backend state. Renderer invariant tests cover seamless endpoints, deterministic slot order, container scaling and distinct spread phases.

## Dot Grid Warp refinement

User-requested hero field uses `shared/motion/dot-grid-warp.ts`: vanilla DOM/Canvas code with a thin Angular mount/destroy directive; no new dependency. Gap26px, reach150px, push26px, diameter1px, white. Dots move radially away from the pointer with linear reach falloff and swell with influence. A zero-distance fallback avoids division by zero. `closest('a, button, input')` determines interactive hover and slightly increases swelling there.

The canvas is fixed to the viewport, transparent outside the clipped hero bounds, pointer-events:none and aria-hidden. The native cursor is untouched. A single coalesced rAF follows the pointer and settles to idle; hidden tabs/offscreen hero suspend work. Resize updates backing pixels from the actual CSS canvas box × min(DPR,2), while dot coordinates remain in CSS pixels. Both media queries are observed: reduced motion removes the effect, and coarse/no-hover pointers do not mount it. Teardown removes the canvas, observers, listeners and pending frame.

Stability refinement after the user's intermittent-grid report: idle retains the last bitmap; offscreen uses visibility:hidden rather than clearing it. Frame painting owns both clear and complete repaint, so lifecycle handlers never leave an empty visible canvas. Bitmap dimensions change only when their actual pixel sizes differ. Layout/grid geometry is cached until resize/scroll; a detached raster stores the static lattice. Moving frames batch all circles into one fill and calculate square roots only inside reach. The rAF clock advances from actual frame times, not rescheduling timestamps. Focus/visibility/scroll rebuild before revealing the overlay; media updates are idempotent, and offscreen pointer movements schedule no frame. This addresses code paths that could blank/recreate the effect; no original browser trace establishes a single exclusive cause.

Verification: four regression tests cover resize bursts, bitmap retention across offscreen return, idempotent media/teardown and coalesced pointer events. Browser samples at1896px stayed nonempty during six pointer sweeps, repeated scroll/return, blur/focus and glass hover. Idle pixels remained identical;40 same-size resize events caused no bitmap dimension assignments. Reduced-motion removal/restoration and route cleanup passed; no pageerror. Pixel readback is test-only and is not part of production rendering.

Browser verification: pointer changes pixels; CTA reports native pointer cursor and interactive hover; theme buttons and guide navigation remain clickable; reduced-motion changes remove/recreate exactly one overlay; route changes remove it. Touch context has no overlay. At CSS803×722/DPR1.25 backing store is1004×903. Screenshots `dot-grid-desktop.png`, `dot-grid-mobile.png` and `dot-grid-tablet.png` in the local browser artifacts directory. This refinement supersedes the earlier bright-hero screenshots/review for the hero only.

## Liquid glass and connected homepage refinement

The latest user screenshots requested glass buttons and Diet Soda's product-hover hierarchy. The public header now uses dark translucent chrome and a glass navigation rail. A measured pink lens follows hover/focus and returns to the actual route; it disappears on routes outside the menu. `LiquidGlassDirective` coalesces pointer light/tilt into rAF, observes class/size changes and cleans up its observers, listeners and frame on teardown. No library was added.

The three theme chips are now glass preview panels with real illustrative thumbnails and semantic pressed buttons. Fine-pointer hover lifts the thumbnail and softly blurs only the main product scene (4px), preserving title/copy readability. Shared controls use white edge highlights, backdrop blur22px/saturation160%, layered fill and a moving specular light. Unsupported backdrop-filter falls back to a darker fill. Decorative layers do not intercept input. Reduced motion removes the lens transition, tilt, lift and main-scene blur; coarse pointers get ordinary buttons without mouse choreography.

Homepage sections share one near-black ambient surface and accent variable instead of separate cream/pink bands. Existing account/legal reading surfaces remain light; admin remains unchanged. The original Column Spread render engine, heading spring config and Dot Grid Warp parameters are retained. These CSS optical effects reproduce the reference's hierarchy and feedback; they are not a claim of physical lens refraction or a 1:1 recreation of its 3D can.

Latest local browser verification: lensMoves=true; product hover filter=blur(4px); navigation backdrop=blur(22px) saturate(1.6); selected route updates; non-navigation auth route lens width0px; reduced blur=none and lens transition0s. No horizontal overflow at320/390/768/1024/1280/1896. Screenshots use `glass-*` in frontend/output/playwright; auth is a local fixture, not a production login test. Angular's watcher needed a restart after adding home-glass.css; verification was rerun against the current bundle rather than the stale preview.

Independent review found and resolved a keyboard/reduced-motion contrast issue: the dark nav ink now follows only `a[data-glass-lens]`, not every hovered/focused/active link. Lens target placement remains available for keyboard focus even when spatial animation is disabled. Browser assertions verify exactly one target and no dark ink outside it in normal focus, reduced focus and reduced hover. Verdict pass scored this fix resolved. `glass-keyboard.png` and `glass-reduced-focus.png` record those states; the review does not certify production auth.

## Public content browsing

`features/public-content/public-content.page.ts` now powers `/thu-vien`, `/cu-dan` and `/wiki`, with slug detail routes for cards, characters and wiki pages. `PublicContentService` follows the public DTO contract: search, 24-item pages, wiki `pageType`, and a pinned `releaseId` after the first response. On API failure, it tries `/content/snapshot.json`, validates the schema marker and performs equivalent search/filter/page operations locally. API and snapshot failure preserve the API's status so the page can distinguish a missing public release from a temporarily unavailable backend.

Wiki Markdown supports headings, paragraphs, emphasis, inline code, lists and quotes through an escaped renderer; Angular's `[innerHTML]` sanitizer remains the final HTML boundary. The catalog has loading, retry, empty, no-release and no-results states. No official card/character/wiki records are authored by the frontend. The current checkout has no snapshot and the local backend has no reachable public release, so browser layout was inspected with an ephemeral API-shape fixture only; this does not verify the published dataset, PostgreSQL, gateway or production.


## Rendering performance refinement (2026-10-20)

Heading effects now wait until their heading is within 100px of the viewport before importing React/spring and creating the visual layer. Reduced-motion users retain original text without loading this engine until they opt back into motion while a heading is nearby. Mutation updates and the existing spring settings remain in place after activation. Route teardown disconnects the pending visibility observer and preference listener. This changes activation timing. Local Edge desktop/mobile browser QA now passes; production/real-device measurements remain pending.

The global cursor trail now uses viewport-sized backing storage for its fixed overlay, caps DPR at2, avoids reallocating unchanged dimensions, and stops its scheduler after the trail settles or the tab becomes hidden. Pointer events restart it with at most one pending frame. Body pointer events use event targets and client coordinates without layout reads or synchronous elementFromPoint calls. It runs outside Angular's zone. Existing cursor appearance/native cursor and reduced/coarse gates are retained. Four scheduler/canvas regression tests pass; no new FPS/LCP/INP measurement or production deployment is claimed. See [performance notes](../PERFORMANCE.md).


Cursor raster follow-up: the same six ghost shapes/colors/blur and faster0.42/0.84 following now use per-ghost/color cached sprites. DPR changes and teardown invalidate these bitmaps. The overlay clears only its previous painted bounds, including a small sampling margin, and stays empty at rest. Local Edge1280×800/DPR1.25 verified zero alpha pixels after idle, no repeated draws at rest, reduced-motion removal/restoration and no pageerror;82 tests/build pass. This is operation-level evidence, not a measured FPS improvement. See performance notes for the captured scenario and limitations.


## Text and dot rendering follow-up (2026-10-20)

Rise & Settle still uses the same spring engine/configuration. After all explicit lines finish and actual opacity/translation values settle, the directive retains static cloned visual DOM and unmounts the engine. It removes inline transform/will-change from the snapshot. The original Angular-owned source and aria-hidden visual boundary remain. Bound source mutations recreate the entrance; generation checks discard stale callbacks. Hidden tabs defer final capture; toggling reduced motion on settled text does not recreate an engine. This removes the package's persistent once-mode rAF loops after completion while retaining type treatment and responsive wrapping.

Dot Grid Warp retains its original appearance/parameters but restores the previous affected patch from the base bitmap and redraws only rows/columns intersecting the new patch. Full geometry rebuilds remain for scroll/resize. Local browser pixel comparison after blur is exact; idle callbacks stop, reduced/route teardown and resize/mobile text pass with no pageerror.88 tests and production build pass. See PERFORMANCE.md for operation counts; no device-wide FPS or production speed claim is made.


## Header glass clarity follow-up (2026-10-20)

This supersedes the earlier header22px/160% nested material values only: public header now owns blur16px/saturate150%; the rail and cart use transparent layered fills, brighter edges/inset rim and no additional backdrop blur. Shared controls outside the header retain22px/160%. The pink lens has an illuminated upper rim and lower depth; a clipped, fixed gradient strip moves across the rail via transform. Link text sits above this decorative strip, all decoration ignores pointer input, and focus uses an inset ring to avoid clipping. The root's initial80px dark underlay prevents the translucent header sampling the paper canvas at page top; paper reading/form surfaces below remain.

The directive caches geometry and link measurements, batches reads before writes, skips unchanged lens attributes/styles and updates nav shine without unused tilt variables. Cache invalidation follows enter/resize/scroll/route classes, hidden cancels queued frames and teardown removes listeners. Keyboard focus takes priority over stale hover; reduced motion keeps immediate target placement. A dark fallback works without backdrop-filter. No shader/physical refraction, image assets or dependency was added.

92 tests/build pass. Local Edge checks verify one blur layer in header, zero layout reads/lens attribute writes for20 warmed same-link moves, focus/reduced/outside-route lens, mobile menu, no overflow320–1896 and no pageerror. The captured header top/hover/mobile images live in frontend/output/. This is browser/operation evidence, not production FPS or GPU profiling; code is local and not deployed.


## Cursor contrast on light surfaces

The cached cursor sprite keeps its light/tinted blurred fill and now adds a2px#10232d outline with blur capped at0.6px, with sufficient raster padding. This gives the trail a dark edge on lime/paper and a light core on dark content, without background sampling or viewport blend layers. Native cursor, six ghosts, size26px, faster following, cached raster/dirty clearing and reduced/coarse/hidden/idle behavior remain. Local Edge screenshots on story lime/paper and home dark, zero residual alpha at rest and reduced-motion teardown pass;92 tests/build pass. No production deployment or new FPS claim.


Latest cursor sizing refinement: user feedback found the26px ghost too large beside the native cursor. Default/App size is now22px, with a1.25px dark rim and rim blur capped at0.4px. Both-tone cached rendering, six ghosts and speed/lifecycle remain. Six focused tests and dev rebuild pass; production build was not repeated for this parameter-only adjustment. This is visual tuning, not automatic OS cursor-size detection.


## Public header child navigation

All five header groups now expose existing child routes, including privacy/terms in Discover. Primary labels remain direct links; separate chevron buttons have disclosure state. Hover opens on fine pointers, panel padding and a160ms leave delay bridge travel to child links. ArrowDown opens/focuses the first child; Escape restores the trigger, outside/focus leave/navigation/resize dismiss, and touch can tap the button. Mobile drawer gains legal links. These are ordinary navigation links, not ARIA application menus.

The dropdown is a sibling of the clipped rail so its surface and focus are not cut off; a single current panel is rendered with a dark glass rim/fill and no extra backdrop blur. The lens remains on the open parent while hovering its panel. Active grouping now includes legal/story/residents under Discover and cart under Shop; auth stays unselected. There are no invented routes or newly complete commerce flows.96 tests/build and local browser hover/focus/Escape/outside/mobile/touch/no-overflow/no-pageerror checks pass; no deployment. See PUBLIC_NAVIGATION.md.
