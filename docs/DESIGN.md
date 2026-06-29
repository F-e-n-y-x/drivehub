# DriveHub Design System

Premium-minimalist, neutral **zinc** surface palette with a single restrained
**indigo** accent. Everything is token-driven — never hard-code a hex color in a
component. This guide is the contract every new screen/feature follows.

All tokens live in `packages/web/src/index.css` under `:root` (light) and
`.dark` (dark), exposed to Tailwind via `@theme inline`. Components reference
them as Tailwind utilities (`bg-card`, `text-muted-foreground`, `border-border`,
…). HSL components are stored so they compose with opacity (`bg-accent/90`).

---

## 1. Color tokens

| Token | Utility | Light | Dark | Use |
|---|---|---|---|---|
| `background` | `bg-background` | white | near-black `240 10% 5%` | App canvas |
| `foreground` | `text-foreground` | `240 10% 8%` | `0 0% 96%` | Primary text |
| `card` | `bg-card` | white | `240 9% 7%` | Card/panel surfaces |
| `popover` | `bg-popover` | white | `240 9% 8%` | Floating surfaces (Select, Tooltip, Toast, Dialog) |
| `muted` | `bg-muted` | `240 5% 96%` | `240 5% 13%` | Subtle fills, hover/active states |
| `muted-foreground` | `text-muted-foreground` | `240 4% 46%` | `240 5% 60%` | Secondary text, icons |
| `border` | `border-border` | `240 6% 90%` | `240 5% 16%` | All borders/dividers |
| `input` | `border-input` | same as border | — | Form-control borders |
| `accent` | `bg-accent` / `text-accent` | indigo `243 75% 59%` | `243 75% 66%` | The one accent — primary CTAs, selected/active, focus ring |
| `accent-muted` | `bg-accent-muted` | indigo tint | dim indigo | Accent chip backgrounds |
| `primary` | `bg-primary` | near-black | near-white | Default (neutral) button fill |
| `ring` | `ring-ring` | accent | accent | Focus rings (`focus-visible:ring-2 ring-ring/30`) |

### Status palette (semantic — never reuse for decoration)

| Token | Color | Meaning |
|---|---|---|
| `synced` | emerald | ok / success / connected |
| `pending` | amber | running / queued / warning / not-configured |
| `conflict` | rose | conflict |
| `danger` | red | error / destructive actions |
| `paused` | zinc | idle / paused / disabled |

Status is resolved centrally in `src/lib/status.ts` (`remoteStatusMeta`,
`jobStatusMeta`, `activityLevelMeta`) → `{ tone, label, dotClass, badgeVariant }`.
Render through `<StatusDot>` + `<Badge variant={…}>`. Do not pick status colors
ad hoc in a component.

---

## 2. Typography

- **Font:** Inter (loaded in `index.css`), `--font-sans`. Stylistic sets enabled
  via `font-feature-settings`.
- **Scale:** body `text-sm` (14px); secondary/meta `text-xs` / `text-[13px]`;
  headings `text-sm`–`text-base` `font-semibold tracking-tight`. We stay small
  and dense on purpose.
- **Numbers / metrics:** add `tabular-nums` (sizes, counts, byte values) so
  digits don't jitter.
- **Code-ish values** (paths, tokens, IDs): `font-mono text-[11px]`/`text-[13px]`.

---

## 3. Spacing, radius, elevation

- **Radius:** base `--radius: 10px`. Use `rounded-lg` for controls/cards bodies,
  `rounded-xl` for outer cards & dialogs, `rounded-md` for small chips/items,
  `rounded-full` for dots/avatars.
- **Padding:** cards `p-5`; pop/menu content `p-1` with items `py-1.5 px-2`;
  dialogs `p-6`. Gaps `gap-2`/`gap-3`/`gap-4`.
- **Elevation (shadow):** tooltips `shadow-md`, menus/toasts `shadow-lg`,
  dialogs `shadow-xl`. Floating surfaces always use `bg-popover border-border`
  and `z-50` (toasts `z-[100]`).
- **Focus:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30`
  (controls) or the Button's `ring-ring ring-offset-1`.

---

## 4. Component inventory (`src/components/ui/*`)

| Component | When to use |
|---|---|
| `Button` (CVA variants: `default`/`accent`/`outline`/`secondary`/`ghost`/`destructive`/`link`; sizes incl. `icon`,`icon-sm`) | Every action. Primary CTA = `accent`; neutral confirm = `default`; secondary = `outline`; low-emphasis = `ghost`; delete = `destructive`. |
| `Input` / `Textarea` | Text fields. h-9, `rounded-lg`, `border-input`. |
| `Select` (Radix) — `SimpleSelect` for value+options, or composable `SelectRoot`/`SelectTrigger`/`SelectContent`/`SelectItem` | All dropdowns. The popover is token-styled to match cards. **Never** use a raw native `<select>`. |
| `Card` (+ `CardHeader`/`Title`/`Description`/`Content`/`Footer`) | Any panel/surface. |
| `Dialog` (Radix) | Modals, confirmations, multi-step flows. |
| `Tooltip` / `SimpleTooltip` | Hover hints on icon buttons. |
| `Toast` (`toast`, `toast.success/error/warning`, `<Toaster/>`) | Transient feedback after mutations. |
| `Tabs`, `Switch`, `Badge`, `Skeleton` | Standard usage. |

App-level building blocks: `PageHeader` (every page title row), `EmptyState`,
`QueryError`, `StatusDot`, `Field` (label + control + hint).

---

## 5. Icons

Two distinct icon vocabularies — keep them separate:

- **UI / actions / file types:** [lucide-react](https://lucide.dev) at
  `size-4` (16px) inline, `size-5` in avatars. Examples: `Plus`, `Trash2`,
  `Play`, `Loader2` (always `animate-spin` for pending).
- **Storage provider brands:** `RemoteIcon` from
  `src/components/brand-icon.tsx` — the single source of truth. It maps each
  `RemoteType` to a brand mark (Google Drive, Dropbox, OneDrive, S3, Backblaze,
  iCloud via `react-icons`) and falls back to lucide glyphs for generic
  transports (`local`, `smb`, `webdav`, `sftp`). Brand marks render in their
  brand color by default; pass a `text-*` class to override. Use it for remote
  cards, the add-remote provider grid, the browser remote selector, and job
  source/dest summaries. Crisp at 16–24px.

> Note: simple-icons no longer ships OneDrive and Amazon S3 marks, so
> `brand-icon.tsx` uses `DiOnedrive` (devicons) and `FaAws` (Font Awesome
> brands) for those two. Update there if better marks become available.

---

## 6. Checklist — adding a new screen or feature

1. **Page shell:** start with `<PageHeader title description actions />`, then a
   `space-y-6` column. Wrap content in `Card`s.
2. **Data:** read/write through the query hooks in `src/hooks/queries.ts`
   (TanStack Query). Don't fetch ad hoc. Mutations show a `toast` on success.
3. **States:** handle loading (`Skeleton`), error (`QueryError`), and empty
   (`EmptyState`) explicitly — every list does all three.
4. **Controls:** use `ui/*` primitives only. Dropdowns = `Select`/`SimpleSelect`
   (never native `<select>`). Forms use `Field` + `Input`/`Textarea`/`Switch`.
5. **Status:** derive labels/colors from `src/lib/status.ts` and render via
   `StatusDot` + `Badge`. Never invent status colors.
6. **Icons:** lucide for UI, `RemoteIcon` for storage brands.
7. **Color:** tokens only (`bg-card`, `text-muted-foreground`, `border-border`,
   `text-accent`, status tokens). No raw hex, no one-off Tailwind palette colors
   (`bg-blue-500` etc.).
8. **Numbers:** `tabular-nums`. **Paths/IDs:** `font-mono`.
9. **Dark mode:** verify both themes — tokens handle it, but check contrast on
   any custom opacity (`/40`, `/90`) you add.
