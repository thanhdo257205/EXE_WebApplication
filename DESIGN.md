---
name: "Nhà Này Hơi Báo!"
description: "Editorial dark identity (near-black, lime accent) with Column Spread, Rise & Settle, boot curtain, marquee and Lenis."
colors:
  cream: "#f7f2e5"
  ink: "#183c2b"
  lime: "#dafa76"
  pink: "#ffacc9"
  blue: "#b7cfff"
  pink-ink: "#4f203c"
  blue-ink: "#1d3760"
  showcase: "#0c0b10"
  hero-bg: "#0d0d0d"
  hero-text: "#f5f5f5"
  glass-ink: "#f5f5f5"
  glass-fallback: "#172327d9"
  glass-border: "#ffffff2e"
  showcase-text: "#f6f3e9"
  surface: "#fffcf4"
  muted-ink: "#395b48"
  nav-surface: "#10222a4d"
  cta-text: "#f1ffc4"
  focus: "#a13b64"
  field-border: "#a2b39c"
  error: "#94233c"
  error-surface: "#ffe8e9"
  success-surface: "#e6f5c8"
  admin-bg: "#070b11"
typography:
  display:
    fontFamily: "'Be Vietnam Pro', sans-serif"
    fontSize: "clamp(76px, 8.6vw, 140px)"
    fontWeight: 900
    lineHeight: 1.02
    letterSpacing: "-.04em"
  display-emphasis:
    fontFamily: "'Fraunces', Georgia, serif"
    fontWeight: 700
    letterSpacing: "-.04em"
  headline:
    fontFamily: "'Be Vietnam Pro', sans-serif"
    fontSize: "clamp(38px, 4.3vw, 66px)"
    fontWeight: 800
    lineHeight: 1.13
    letterSpacing: "-.035em"
  body:
    fontFamily: "'Be Vietnam Pro', sans-serif"
    fontSize: "15px"
    lineHeight: 1.8
  nav-label:
    fontFamily: "'Be Vietnam Pro', sans-serif"
    fontSize: "12px"
    fontWeight: 700
rounded:
  field: "10px"
  panel: "12px"
  surface: "16px"
  pill: "32px"
  cta: "40px"
spacing:
  compact: "8px"
  control: "16px"
  gutter: "24px"
  section-gap: "32px"
  wide-gap: "64px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cta-text}"
    rounded: "{rounded.cta}"
    padding: "18px 26px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "14px"
  field:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
  navigation:
    backgroundColor: "{colors.nav-surface}"
    textColor: "{colors.glass-ink}"
    rounded: "{rounded.pill}"
    padding: "5px"
  navigation-active:
    backgroundColor: "{colors.pink}"
    textColor: "{colors.pink-ink}"
  surface-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "32px"
  theme-chip:
    rounded: "22px"
    padding: "18px 10px 16px"
---

# Design System: Nhà Này Hơi Báo!

## Overview

**Creative North Star: "Diet Soda-inspired board-game showcase"**

A Diet Soda-inspired public identity for the Vietnamese board game Nhà Này Hơi Báo!: oversized product typography, italic emphasis, a continuous dark homepage with shared theme accents and tangible box-and-card illustration. Dark liquid-glass navigation connects the ambient homepage; account and legal panels retain light reading surfaces. The exact Column Spread engine remains unchanged.

Public content readers, account and legal screens share this palette. The existing dark admin workspace remains an Operate surface; it shares the requested heading entrance without adopting the public layout. The card library, character directory and wiki read published content; shopping and the fund simulator remain unfinished. Decorative cards on the homepage are illustrations, not official game content.

**Key Characteristics:**
- Oversized Vietnamese headings with contrasting italic emphasis.
- Dark translucent public navigation, a continuous dark homepage, and lime/pink/blue control accents.
- Physical product illustration above a dark canvas showcase.
- Static body copy, spring headings and accessible reduced-motion states.

## Colors

Bright theme colors sit against warm paper and deep green; the canvas has a separate near-black stage. Frontmatter contains the normative color values.

### Primary

- **Deep Green Ink:** public text, primary actions, drawer and footer.
- **Lime:** default hero control accent, auth information panel and navigation hover.

### Secondary

- **Candy Pink:** alternate hero control accent, active navigation and closing section; pair with Pink Ink.
- **Soft Blue:** third hero control accent; pair with Blue Ink.

### Neutral

- **Warm Cream:** public shell, reading sections and input fill.
- **Paper Surface:** account cards and legal reading surfaces.
- **Muted Green Ink:** public supporting copy and form metadata.
- **Navigation Surface:** recessed desktop navigation rail.
- **Showcase / Showcase Text:** the canvas section's dark stage and light headings.
- **Admin Background:** retained admin workspace only.

Public focus uses a plum outline. Errors use the red foreground and pale error surface; success feedback uses pale green. Theme accents do not replace feedback semantics. Legacy cyan icons and blue scrollbar remain in the current implementation; they are not a new public accent family.

## Typography

**Display and Body Font:** Be Vietnam Pro, with sans-serif fallback.

**Emphasis Font:** self-hosted Fraunces italic, with Georgia and serif fallbacks. Its license accompanies the font asset.

The display voice is bold and tightly tracked, with italic words supplying contrast. Body copy remains compact and readable rather than adopting the display scale. Home section headings use the headline token; discovery row titles use 21px/800 and account titles use clamp(35px, 5vw, 60px), line-height 1.15. Supporting copy varies from 13px to 15px; small illustrative labels are decorative.

The mobile home title is 76px; the 701–1000px tablet interval uses 110px. Preserve intentional line breaks and inline emphasis.

**The Static Reading Rule.** Body paragraphs stay static; the requested Rise & Settle treatment belongs to semantic headings.

All current h1–h6 components import RiseHeadingDirective, including admin, legal and account pages. New heading-bearing components must import it. The engine runs once with overflow, letter opacity 0/y 24 to opacity 1/y 0, tension 220, friction 22 and 30ms stagger; explicit lines continue the stagger. Preserve the original semantic heading for assistive technology and keep its visual duplicate aria-hidden. Reduced motion and unavailable browser/runtime support retain static text.

## Layout

The public shell has a sticky header with an 80px minimum height, horizontal navigation and account actions. At 1000px and below, navigation becomes a drawer below the header, with width min(340px, 100%). Very narrow headers reduce padding at 380px.

Desktop home sections use fluid gutters clamp(24px, 5vw, 88px). The hero overlays a dimensional product scene alongside large type, followed by introduction, CTA and theme controls. At 1000px and below, the product scene enters document flow and the bottom controls stack. The discovery area changes from two columns with a 64px gap to a vertical reading sequence. Generous section padding, typographic rows and broad color fields carry hierarchy.

Account content is capped at 1120px. Below 768px the form appears before its information panel; below 600px panels and gutters become smaller. Legal and placeholder pages retain readable public surfaces. The canvas remains 16:9 and scales its backing store with device pixel ratio capped at 2.

## Elevation & Depth

Public reading and form surfaces are largely flat: paper fill and rounded shape separate them without ambient shadows. Depth belongs to the product illustration: perspective and box rotation, a drop shadow (18px 28px 16px #163c2b38), and floating-card shadows (10px 20px 25px #183c2b25). The supplied canvas disables its internal shadow. Preserve the admin's existing independent depth vocabulary.

## Shapes

Rounded pills identify actions and navigation. Fields use 10px corners, small panels 12px and public reading cards 16px. The primary home CTA uses 40px corners. The box face remains nearly square at 4px while floating cards use 14px on desktop and 9px on narrow layouts. Do not flatten the product silhouette into the shape of an account panel.

## Components

- **Primary action:** 14px bold label and generous pill padding. On the homepage use liquid glass with pale lettering, an accent edge on the hero CTA and a restrained hover lift. Reduced motion removes the lift and transition. Account submit buttons retain solid green, their compact 15px 22px padding and clear contrast on paper panels.
- **Secondary account action:** paper pill with green text and a thin field-colored border; hover changes to cream.
- **Input:** cream fill, 10px corners, minimum wrapper height 48px and visible labels. Green focus-within border complements the public 3px focus outline with 4px offset. Caret uses the plum focus color.
- **Navigation:** liquid-glass rail over a dark translucent header: a single header backdrop layer at16px blur/150% saturation, no nested rail/cart blur, bright inset rims, a transform-driven reflection strip and a dimensional pink lens that moves to the hovered/focused link and returns to the actual active route. A single child panel opens on hover or a separate chevron button; primary labels remain links. The lens stays on the open group and groups its existing child routes, including privacy/terms under Discover. Dropdowns sit outside the clipped rail and add no blur layer. ArrowDown, Tab, Escape, outside dismissal and touch buttons are supported; mobile drawer exposes the same legal destinations. Auth routes outside these groups have no selected lens. Keyboard focus overrides stale hover; reduced motion places the lens immediately. Dark fill is the backdrop-filter fallback. Mobile drawer preserves text labels and account actions.
- **Theme selector:** three glass product-preview buttons with decorative card images; selected state uses an accent outline. Fine-pointer hover tilts the panel, lifts the thumbnail and blurs the main product scene by 4px. Focus retains clear outlines. Reduced motion removes spatial/blur transitions; touch uses normal selection without hover choreography. Selection changes card/copy and the shared homepage accent.
- **Liquid glass:** shared layered fill, white edge, inset top light, offset shadow and pointer-following specular highlight. Backdrop-filter is an enhancement with a darker opaque fallback. Decorative pseudo-elements have pointer-events:none; real links and buttons keep their semantics. Limit glass to controls and product previews; body text remains static and readable.
- **Cursor trail:** preserve the native cursor. Cached ghost sprites combine a light/tinted core with a1.25px#10232d rim (rim blur capped at0.4px), at22px ghost size for lime/paper/dark surfaces. Retain idle/hidden/reduced/coarse gates; no background pixel sampling.
- **Dot Grid Warp:** hero ground #0d0d0d with a soft 5% #f5f5f5 radial wash; text #f5f5f5. Additive fixed, aria-hidden, pointer-events:none canvas clipped to hero bounds. White 1px dots on a 26px grid; 150px reach, 26px maximum radial push, swelling toward the pointer. Vanilla browser code, single demand-driven rAF, DPR cap 2; no cursor replacement. Only mount for hover:hover/pointer:fine and no reduced motion; re-check media changes and clean up on route teardown.
- **Reading surface:** flat paper surface for legal/account/content reading, with responsive padding. Homepage sections share one dark ambient background and subtle seam rules, with linked accent colors; remove alternating cream/pink blocks there. Unpublished content keeps an explicit status notice.
- **Column Spread:** preserve the user-supplied engine, three-column behavior and all parameters, PRNG, clipping and draw order. Twelve local SVG illustrations load in card-01 through card-12 order, over the showcase background, on an eight-second loop. Reduced motion renders phase 0.12 statically. Keep pause/play, accessible canvas labeling, offscreen/tab suspension and teardown. Replace illustration paths only when official assets are supplied; do not fabricate official cards.

**The Illustration Rule.** Decorative card faces and the box mockup must remain visibly identified as illustrations.

**Dot grid stability.** Retain the visible canvas bitmap while idle; hide it offscreen without clearing. Resize the backing store only when its pixel dimensions change. Cache the static lattice, batch dot paths, and perform clear plus complete repaint in one scheduled frame. Focus, visibility and scroll restoration repaint before revealing; repeated media events must not recreate an already eligible field.

## Do's and Don'ts

### Do:
- Do preserve Vietnamese product names and explicit illustration labels.
- Do import RiseHeadingDirective into new components containing headings.
- Do keep body paragraphs static and reduced-motion headings readable.
- Do retain clear unfinished-content notices on placeholder destinations.
- Do keep the admin workspace visually scoped to its existing dark theme.

### Don't:
- Don’t present decorative cards as official rules or product artwork.
- Don’t alter the supplied Column Spread mathematics, parameters, image order or draw order.
- Don’t replace the requested heading springs with CSS keyframes or another motion engine.
- Don’t imply that local visual verification proves deployment or real authentication.


## Cập nhật 2026-10-21: editorial tối

- Nền công khai `#0b0c0d`, chữ `#f3f1ea`, nhấn lime `#dafa76`; thẻ lime/hồng/xanh giữ chữ tối (`#183c2b`/`#4f203c`/`#1d3760`). Auth giữ card giấy kem `#fffcf4` trên nền tối.
- Chuyển động: curtain mở trang (1100–2600ms, exit 850ms), reveal heading sau boot, marquee 22s linear, chữ ma outline, Lenis (tắt ở admin/reduced motion/máy giật).
