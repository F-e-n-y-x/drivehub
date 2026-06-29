# DriveHub responsive checklist — per screen

Test each at 360 / 390 / 768 / 1024 / 1440. "✓" = already handled; "FIX" = the
usual gap to check.

## App shell (`components/layout/*`)
- `Sidebar` is `hidden md:flex` ✓. Mobile nav is a hamburger in `TopBar`
  (`md:hidden`) that lists `navItems`.
- **FIX (known):** `navItems` (in `layout/nav.ts`) excludes **Settings**,
  **Terminal**, **Logs** (the desktop sidebar renders those separately). So the
  mobile `TopBar` menu must add them back — Settings always, Terminal/Logs when
  enabled (`useTerminal().data?.enabled`, `useUIStore(showLogs)`). Otherwise
  those routes are unreachable on phones.
- `TopBar` sticky `top-0 z-30` ✓. Make sure the open mobile menu scrolls if it
  exceeds the viewport and closes on navigation.
- `<main>`: `/browser` is `overflow-hidden` + full height; others scroll. Verify
  no double scrollbars on mobile.

## Dashboard
- Stat cards: ensure `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5` (don't keep 5
  across on a phone). Engine card + job card stack; numbers use `tabular-nums`.
- Recent activity / recent runs: side-by-side on desktop → stack under `lg`.

## Remotes
- Grid steps columns ✓ (`grid-cols-1 sm:grid-cols-2 …`). Card action row: the
  Browse/Speed-test + Test/Edit/Delete cluster should wrap or stay within width
  on 360px — check it doesn't overflow.

## Jobs / Job runs
- Job cards stack ✓. **Runs table** is wide — wrap in `overflow-x-auto` (with a
  min-width) OR hide secondary columns under `sm`. Job dialog two-column
  source/dest pickers → stack (`flex-col lg:flex-row`).

## Browser (highest risk)
- Tab strip: horizontal scroll ✓ (`overflow-x-auto`). 
- Toolbar (New folder/file/Upload + Rename/Copy/Cut/Paste/Download/Delete):
  **FIX** — wrap (`flex-wrap`) or collapse Rename/Copy/Cut/Paste/Delete into a
  `…` menu under `sm`; keep New/Upload + selection count visible. Sticky ✓.
- Breadcrumbs: `overflow-x-auto`, truncate long names.
- **List view** columns (Name / Size / Modified): hide Size+Modified under `sm`,
  keep Name + a `…` per-row actions menu (don't show a 6-icon row on a phone).
  Or wrap the table in `overflow-x-auto`. Grid view already adapts ✓.
- Remote selector + search: stack (search full-width below the selector) under
  `sm` instead of cramming both on one row.
- Preview lightbox: controls thumb-reachable; close button clear of the notch;
  the custom video player controls already overlay — verify they're usable at
  360px.

## Add-remote dialog
- Provider picker: 3-col on desktop → `grid-cols-1 xs:grid-cols-2 sm:grid-cols-3`
  so it's not 3 tiny columns on a phone. Dialog near-full-width on mobile.
- Field/OAuth forms: inputs full-width ✓ (Dialog scrolls, capped at 88dvh ✓).

## Settings
- Two-column section-nav: nav is `hidden lg:block`, content `flex-1` ✓ (stacks
  on mobile). Header Save button stays reachable. Rows stack at base ✓.

## Terminal
- Full-height iframe uses `100dvh` calc ✓. On phones the on-screen keyboard
  shrinks the viewport — `dvh` handles it; verify the prompt stays visible.

## Transfers panel (bottom-right)
- Fixed `w-[360px]` — on a 360px phone that's the whole width. Constrain to
  `max-w-[calc(100vw-1rem)]` so it doesn't overflow; keep it above the safe area.
