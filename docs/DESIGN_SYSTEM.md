# SkinSentry Clinical Design System

This design system defines the visual language, typography, tokens, rules, and component specifications for SkinSentry (Team Green Lights).

## 1. Design Philosophy
SkinSentry is a clinical decision-support tool. It must look and feel like an authentic, calm, authoritative medical device, not a consumer marketing template.
- Every element serves a clinical function.
- No decorative flair: no gradients, no glassmorphism, no blurred blobs, no drop shadows, no emojis.
- Every number displayed comes from calibrated models or verified data.

## 2. Color Palette & Semantic Tokens

### Core Clinical Palette
| Token | Hex | Role | Contrast / Usage Rule |
|---|---|---|---|
| `--ink` | `#17252A` | Primary text, deep surfaces | Default body text. Highest contrast. |
| `--teal` | `#2B7A78` | Primary actions, brand lines | Buttons, interactive links on paper. Only on `#FEFFFF`. |
| `--teal-light` | `#3AAFA9` | Secondary accents, chart lines | Borders on dark. **Never put white text on #3AAFA9** (use `#17252A`). |
| `--mist` | `#DEF2F1` | Background fills, table rows | Muted cards and callout backgrounds. **Always use #17252A text on #DEF2F1**. |
| `--paper` | `#FEFFFF` | Root background | Base surface for entire application. |
| `--line` | `rgba(23, 37, 42, 0.16)` | Borders & dividers | 1px clean separators everywhere. No drop shadows. |
| `--muted` | `rgba(23, 37, 42, 0.72)` | Secondary metadata text | Timestamps, secondary labels, metadata. |

### Calibrated Risk Tokens
Risk is NEVER conveyed by color alone. Every risk presentation MUST include a text label, numerical value, and an icon.

| Risk Band | Text & Border Hex | Background Tint (12%) | Associated Action |
|---|---|---|---|
| `--risk-low` | `#1E6B3A` | `rgba(30, 107, 58, 0.12)` | Routine annual check |
| `--risk-moderate` | `#8A5A00` | `rgba(138, 90, 0, 0.12)` | In-person clinical exam |
| `--risk-high` | `#B54708` | `rgba(181, 71, 8, 0.12)` | Specialist referral within 2 weeks |
| `--risk-severe` | `#B42318` | `rgba(180, 35, 24, 0.12)` | Immediate urgent clinical consultation |

### Prohibited Visual Patterns
- NO purple, violet, indigo, or fuchsia anywhere.
- NO gradients of any kind (linear, radial, or mesh).
- NO glassmorphism, backdrop blurs, glow effects, or heavy shadows.
- NO emojis anywhere in UI, logs, or commit messages.

## 3. Geometry & Layout
- **Corner Radius:** Maximum `4px` (`--radius: 4px`).
  - No rounded-full, rounded-xl, rounded-2xl, or pill-shaped buttons.
- **Borders:** Crisp `1px solid var(--line)`.
- **Spacing Grid:** 8px base grid (`8px`, `16px`, `24px`, `32px`, `48px`).
- **Layout Width:** Max content container width `1200px`.
- **Text Width:** Reading columns capped at `70ch` for optimal clinical readability.

## 4. Typography
- **Primary Body Font:** IBM Plex Sans (`next/font/google`), weights 400, 500, 600.
- **Data & Numeric Font:** IBM Plex Mono (`next/font/google`), weight 500. Used for all measurements, coordinates, probabilities, and patient IDs.
- **Font Scale:**
  - Heading 1: `28px` / `34px` line-height, semi-bold (`font-weight: 600`)
  - Heading 2: `22px` / `28px` line-height, semi-bold
  - Heading 3: `18px` / `24px` line-height, medium (`font-weight: 500`)
  - Body: `16px` / `24px` line-height (reading), `14px` / `20px` line-height (dashboards/tables)
  - Caption: `12px` / `16px` line-height

## 5. Motion & Transitions
- **Interaction Transitions:** `150ms ease-in-out` on color and background transitions only.
- **Motion Restrictions:**
  - No scroll-triggered animations.
  - No parallax effects.
  - No animated number counters.
  - No custom cursor effects.
  - Loading animation is strictly a minimal SVG spinner.
  - Full respect for `@media (prefers-reduced-motion: reduce)`.

## 6. Accessibility & Contrast
- WCAG AA compliant contrast ratio (minimum 4.5:1 for normal text, 3:1 for large text).
- Visible focus rings on all interactive elements: `2px solid var(--teal)` with `2px offset`.
- Full keyboard navigation support (Tab, Enter, Space, Escape for modals).
- Mandatory clinical disclaimer present on all screening results:
  > "Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis."

## 7. UI Components Catalog (`src/components/ui/`)
1. **Button**: Primary (teal), Secondary (mist/line), Danger (risk-severe), Text. 4px radius.
2. **Input & Textarea**: 1px line border, 4px radius, clear focus outline.
3. **Select**: Native and accessible styled dropdown.
4. **FileDropzone**: Drag-and-drop lesion photo upload with magic byte inspection.
5. **Card**: 1px solid border, 4px radius, paper background.
6. **Badge**: Square 4px corners, solid border, 12% tint background.
7. **Alert**: Info, Warning, Error, and Disclaimer styles.
8. **Table**: Clean tabular borders, mist row striping, monospaced numbers.
9. **Tabs**: Plain text tabs with teal active border indicator.
10. **Dialog**: Accessible modal dialog with focus trapping and Escape-to-close.
11. **Toast**: Unobtrusive status alerts.
12. **Spinner**: 16px/24px SVG circular indeterminate loader.
13. **FormField**: Label, hint text, and error message container.
14. **StatusBadge**: Standardized badges for case statuses (`queued`, `processing`, `completed`, `failed`, `abstained`).
15. **PermanentDisclaimer**: Rule 10 mandatory clinical warning banner.
