---
version: "alpha"
name: Usagi Field Notes
description: A calm, high-signal visual identity for usagi's human-facing documentation, diagrams, and any future UI.
colors:
  primary: "#1F2328"
  secondary: "#57606A"
  tertiary: "#C2410C"
  on-tertiary: "#FFFFFF"
  neutral: "#FAF9F7"
  surface: "#FFFFFF"
  border: "#D8DEE4"
  success: "#1A7F37"
  warning: "#7D4E00"
  danger: "#CF222E"
typography:
  h1:
    fontFamily: Pretendard
    fontSize: 2.25rem
    fontWeight: 700
    lineHeight: 1.25
  h2:
    fontFamily: Pretendard
    fontSize: 1.5rem
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: Pretendard
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.7
  small:
    fontFamily: Pretendard
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: "SFMono-Regular, Menlo, monospace"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: 4px
  md: 8px
  lg: 12px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components:
  doc-page:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    padding: 24px
  glossary-entry:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 16px
  callout:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 16px
  code-block:
    backgroundColor: "#F3F1ED"
    textColor: "{colors.primary}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: 16px
  table-header:
    backgroundColor: "#F3F1ED"
    textColor: "{colors.secondary}"
    typography: "{typography.small}"
    padding: 8px
  accent-link:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    typography: "{typography.small}"
    rounded: "{rounded.sm}"
    padding: 8px
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  status-success:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.success}"
    typography: "{typography.small}"
    rounded: "{rounded.sm}"
    padding: 4px
  status-warning:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.warning}"
    typography: "{typography.small}"
    rounded: "{rounded.sm}"
    padding: 4px
  status-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    typography: "{typography.small}"
    rounded: "{rounded.sm}"
    padding: 4px
---

## Overview

Usagi Field Notes is a documentation-first identity: warm paper, dark ink, and a single persimmon accent. It is designed for long reading and quick scanning rather than brand spectacle. The visual system should lower cognitive load and keep attention on concepts, flows, and terminology.

The identity applies to diagrams, screenshots, and any future usagi surface. GitHub Wiki chrome is controlled by GitHub; use these tokens for embedded images and future UI.

## Colors

- **Primary (#1F2328):** Ink for headings and body text. High contrast on paper.
- **Secondary (#57606A):** Slate for captions, metadata, and table headers.
- **Tertiary (#C2410C):** Persimmon accent. Use for links and primary actions only.
- **On-tertiary (#FFFFFF):** Text on the accent.
- **Neutral (#FAF9F7):** Warm paper background.
- **Surface (#FFFFFF):** Cards, callouts, and glossary entries.
- **Border (#D8DEE4):** Quiet separators; prefer borders over shadows.
- **Success / Warning / Danger:** Status colors, used sparingly and never as decoration.

## Typography

Pretendard carries the reading experience; monospace is reserved for code, paths, and commands. Headings are tight and heavy; body text is generous and calm. Keep line length near 72 characters for prose.

## Layout

Use a single column for reading, with `xl` spacing between major sections. Tables and glossary entries may use the full content width but should keep padding consistent. Avoid dense multi-column layouts on the wiki.

## Elevation & Depth

There are no decorative shadows. Depth comes from surface changes, 1px borders, and spacing. A raised card should be a white surface on warm paper with a quiet border.

## Shapes

Rounded corners are restrained: `sm` for inline controls, `md` for cards and code blocks, `lg` for large media. Avoid pill shapes except for status tags when necessary.

## Components

- **Doc page:** warm paper background, ink text, generous padding.
- **Glossary entry:** white surface, quiet border, `md` radius.
- **Callout:** white surface for notes and warnings; use status color in the label, not the whole block.
- **Code block:** warm gray surface with monospace text.
- **Table header:** warm gray background, slate text.
- **Accent link:** persimmon background with white text; reserve for primary actions.
- **Divider:** 1px border-colored rule; prefer it over shadows.
- **Status tags:** success/warning/danger text on a white surface, used only for status.

## Do's and Don'ts

- Do keep one accent color and use it consistently for links and primary actions.
- Do prefer borders and spacing over shadows.
- Do keep body text at high contrast.
- Don't introduce gradients, glows, or decorative illustrations.
- Don't use more than two font families.
- Don't use status colors as brand decoration.
