# OPERAVA MailDesk — Design & Theme Contract

This document protects the existing production design from accidental redesign by humans or AI agents.

## Existing visual identity
The current `app.css` is authoritative.

### Tokens
- Background cream: `#f8f5e9`
- Card/off-white: `#fffef7`
- Ink: `#374151`
- Muted: `#6b7280`
- Border: `#e7e5d8`
- Neutral primary surface: `#e5e7eb`
- Brand accent gradient: purple `#8b5cf6` / `#a855f7` into orange `#f97316` / `#fb923c`

### Typography
- Product/application copy: Inter when available, then system sans-serif.
- Display headings: Georgia serif.
- Eyebrow labels: compact uppercase/letter-spaced purple.
- Accent emphasis may use the existing purple-orange gradient.

### Shape and surfaces
- Auth card: large rounded surface with restrained translucent/off-white treatment and soft shadow.
- Mail cards/composer: off-white surfaces, thin warm-gray border, rounded corners.
- Inputs/buttons/navigation: rounded, quiet, functional, not ornamental.
- Background: warm cream with subtle purple/orange radial garden-like atmosphere.

## UX invariants
- Keep the existing sidebar/workspace information architecture unless a product requirement changes it.
- Preserve responsive behavior and mobile layout.
- Use the existing loading/error/empty-state language and styling as the base for new states.
- New UI must use real backend state. Never add visually convincing controls that are disconnected from production APIs.
- Disabled/unavailable functionality must be visibly unavailable rather than simulated.

## Brand assets
Use repository OPERAVA assets. Do not substitute generic mail logos or unrelated stock imagery. New loader/brand SVG assets must preserve the OPERAVA purple identity and be committed as actual assets before referencing them.

## Extending the system
Prefer adding CSS custom properties and extending existing components. A new visual primitive should match existing radius, border, typography, spacing, and accent behavior.

## Review checklist
Before merging UI changes:
1. Compare against current production pages at desktop and mobile widths.
2. Verify no unrelated typography/palette/layout reset occurred.
3. Verify all controls call real production routes.
4. Verify empty/error/loading states are real.
5. Verify no mock/demo data ships.
6. Verify accessible focus states and semantic labels remain.
