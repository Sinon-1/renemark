# Renemark

A web app for adding custom watermarks to photos, one at a time or in batches.
Built with React (Vite), TypeScript, Tailwind CSS, shadcn/ui, Supabase and JSZip.

## Requirement checklist (from project-requirements.md)

| Requirement | Where it lives |
|---|---|
| Image-based watermark upload (PNG) | `src/components/Controls.tsx` |
| Scale, opacity, rotation | `Controls.tsx` sliders, applied in `src/lib/watermark.ts` |
| Corner / centre / drag-and-drop placement | 3x3 grid in `Controls.tsx`, dragging in `PreviewStage.tsx` |
| Live preview | `PreviewStage.tsx` (canvas redraws on every change) |
| Multi-file upload, drag and drop | `PreviewStage.tsx` and the add button in `App.tsx` |
| Same settings for the whole batch | `exportBatch()` in `watermark.ts` |
| ZIP or individual download | `exportBatch()` (JSZip) and `exportOne()` |
| Supabase Auth (sign up / log in) | `src/hooks/useAuth.ts`, `AccountPresets.tsx` |
| Presets in Supabase Database | `src/lib/presets.ts`, `supabase/schema.sql` |
| Optional cloud storage for watermark assets | Storage bucket `watermarks`, see `presets.ts` |
| Responsive, dark/light mode | Tailwind classes, `src/hooks/useTheme.ts` |

## Run it

```bash
npm install
npm run dev
```

The app works straight away as a guest. Accounts and presets turn on once Supabase is set up.

## Set up Supabase

1. Create a free project at https://supabase.com.
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it.
3. Open **Project Settings > API** and copy the project URL and the `anon` public key.
4. Copy `.env.example` to `.env` and paste both values in. Restart `npm run dev`.
5. In **Authentication > Providers > Email**, you can turn off "Confirm email" while testing.

## Learning path (do these in order)

1. **Canvas basics.** Read `renderWatermark()` in `src/lib/watermark.ts`. Draw the photo, set `globalAlpha`, `translate` to the watermark's centre, `rotate`, then `drawImage`. Change a number and watch the preview.
2. **Why positions are fractions.** `x` and `y` are 0-1 values, so a preset looks the same on a phone photo and a 24MP photo.
3. **React state.** In `App.tsx`, `settings` is the single source of truth. Sliders call `patch()`, and `PreviewStage` redraws in a `useEffect`.
4. **Batch export.** Read `exportBatch()`: one canvas per photo, `toBlob`, add to a JSZip, then `generateAsync`.
5. **shadcn/ui.** The files in `src/components/ui` are copied into your project, not hidden in a package. Edit them freely. To add more later: `npx shadcn@latest add dialog`.
6. **Supabase Auth.** `useAuth.ts` listens for login changes and keeps the current user in state.
7. **Row-level security.** The most important idea in `schema.sql`: the policy `auth.uid() = user_id` means the database itself refuses to show anyone else's rows, even if the front-end code has a bug.
8. **Storage.** Watermark images are saved to `<user id>/<file>` in a private bucket. The storage policy checks that first folder name.

## Ideas to extend it

- Text watermarks (use `ctx.fillText`)
- A tiled / repeated watermark mode
- Project history (a `projects` table)
- Process big batches in a Web Worker with `OffscreenCanvas`
