---
name: responsive-ui
description: Make the DriveHub web UI (React + Tailwind v4 + shadcn-style components) fully responsive and great on mobile/tablet without regressing desktop. Use whenever the user asks to "make it responsive", "fix mobile", "it looks broken on my phone", "mobile UI", "tablet", or when adding any new screen/dialog/table that must also work on small screens. Covers the app shell + mobile nav, tables→cards, dialogs→sheets, touch targets, and a per-screen checklist.
---

# Responsive UI

Make every DriveHub screen work from ~360px phones up to wide monitors, **mobile-first**, without regressing the desktop layout. The app is a self-hosted file-manager/dashboard — people WILL open it on their phone to check a backup or browse files, so mobile is a first-class target, not an afterthought.

## Stack + breakpoints

- React + Tailwind v4 + shadcn-style `ui/*`, tokens in `src/index.css` (zinc surface, indigo accent). Match `docs/DESIGN.md`.
- Tailwind defaults: `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`. This app treats **`md` (768px) as the desktop/mobile boundary** — the sidebar is `hidden md:flex`, and the mobile top-bar menu is `md:hidden`.
- **Author mobile-first:** base styles target the phone; add `sm:`/`md:`/`lg:` to *enhance* upward. Avoid desktop-first `max-*` hacks.

## The non-negotiables

1. **No horizontal scroll / overflow on phones.** Test at 360–390px. Long names, breadcrumbs, toolbars, and tables must wrap, truncate, or scroll *inside their own container* — never push the page wide. Use `min-w-0` on flex children that contain truncating text, and `truncate`/`break-words` on the text itself.
2. **Touch targets ≥ 40px.** Icon-only buttons that are `size-7`/`icon-sm` on desktop need adequate hit area on touch. Don't cram a row of 6 tiny icons on mobile — collapse secondary actions into a `…` menu (the repo has `context-menu`).
3. **Reachable navigation.** Every route must be reachable on mobile. The desktop sidebar is hidden < md, so the **mobile top-bar menu must list ALL nav items** — Dashboard, Remotes, Jobs, Browser, Activity, **Settings**, and **Terminal/Logs when enabled** (note: `navItems` in `layout/nav.ts` intentionally excludes Settings/Terminal/Logs because the desktop sidebar renders them separately — the mobile menu must add them back, or it will silently drop them).
4. **Dialogs fit the viewport.** `DialogContent` is capped at `max-h-[88dvh]` and scrolls; on phones prefer near-full-width (`max-w-[calc(100vw-1.5rem)]`) and consider a bottom-sheet feel. The Add-remote picker is 3-col on desktop → must drop to 1–2 col on phones (`grid-cols-1 xs:grid-cols-2 sm:grid-cols-3`-style).
5. **Use `dvh`, not `vh`,** for full-height regions (mobile browser chrome changes the viewport) — the app already uses `100dvh` in places; keep that.

## Core patterns (apply these)

- **App shell.** Desktop: `Sidebar` (`hidden md:flex`). Mobile: hamburger in `TopBar` opening a nav panel/drawer (`md:hidden`). Keep the `TopBar` sticky. Consider a bottom tab bar for the top 4 routes on phones if the user wants app-like nav — but the drawer is fine and lower-risk.
- **Tables → cards.** Wide tables (jobs runs, system info, the Browser list view) don't fit phones. Either (a) wrap in `overflow-x-auto` with a sensible min-width and let it scroll horizontally, or (b) switch to a stacked "card" representation under `md`. For the **Browser**, the grid view already adapts; make the list view either horizontally scrollable inside its container or hide low-value columns (Modified, Size) under `sm` and keep Name + a `…` actions menu.
- **Toolbars / action bars.** Rows of buttons (Browser toolbar, card actions) should wrap (`flex-wrap`) or collapse less-used actions into a menu under `sm`. Keep the primary action (Browse/Upload/New) visible; tuck Rename/Copy/Cut/Paste/Delete behind `…` on phones.
- **Grids.** Card grids step columns by breakpoint: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`. Never a fixed multi-col grid without a `grid-cols-1` base.
- **Two-column layouts** (e.g. the Settings section-nav, job dialog side panels) **stack on mobile**: `flex-col lg:flex-row`, and hide the desktop-only side nav under `lg` (`hidden lg:block`).
- **Forms.** `Row` label/control layouts that are side-by-side on desktop (`sm:grid-cols-[1fr_280px]`) already stack at base — keep that. Inputs go full-width on mobile.
- **Spacing/typography.** Slightly tighter padding on phones (`p-4 sm:p-5`/`gap-3 sm:gap-4`), and step down oversized headings (`text-2xl sm:text-3xl`). Don't ship desktop padding to a 360px screen.
- **Modals that are really pages on mobile** (file preview lightbox): make controls thumb-reachable (prev/next near the bottom edge or as large side zones), and ensure the close button isn't under the notch.

## Process

1. **Audit at real widths first.** Use the webapp-testing skill / a headless browser at 360, 390, 768, 1024, 1440. Open every route + the key dialogs (Add remote, Job create, file preview, folder picker, Settings). Note: overflow, unreachable nav, tiny tap targets, clipped content, broken two-col layouts.
2. **Fix shell + nav before screens** — a complete, reachable mobile nav is the highest-value fix.
3. **Then per screen**, apply the patterns above. See `references/screens.md` for a screen-by-screen checklist specific to DriveHub.
4. **Verify** `pnpm --filter @drivehub/web build` stays clean and re-check the same widths. Don't regress desktop — every change is additive (`md:`/`lg:` keep the current desktop look).

## Guardrails

- **Additive, not destructive.** Wrap new mobile behavior so the existing `md+` desktop layout is unchanged. When in doubt, the desktop screenshot should look identical after your change.
- **No new heavy deps** for layout — Tailwind utilities + the existing `ui/*` (including `Dialog`, `context-menu`) cover it. A bottom-sheet can be the existing Dialog restyled at `sm` breakpoints.
- **Test the Browser hardest** — it's the most layout-dense screen (tabs, toolbar, breadcrumbs, list/grid, preview) and the most likely to break on phones.

See `references/screens.md` for the per-screen checklist.
