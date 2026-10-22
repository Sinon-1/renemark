# Renemark

Add your own watermark to photos, one at a time or a whole batch at once. Upload a PNG watermark, adjust its size, opacity, rotation and position with a live preview, then download the results individually or as a ZIP.

Photos are processed in your browser and are never uploaded to a server.

## Features

- Upload a PNG watermark image (transparent background works best)
- Adjust size, opacity and rotation with sliders
- Place the watermark in a corner, the center, or drag it anywhere on the preview
- Live preview that updates on every change
- Add many photos at once (drag and drop or file picker) and apply the same settings to all of them
- Download a single photo or every photo as one ZIP
- Optional accounts: sign up, log in, and save your watermark settings as presets
- Soft UI (neumorphism) design, dark mode by default, responsive on phones and desktops

## Tech stack

| Area | Tool |
|---|---|
| Framework | React 18 with Vite and TypeScript |
| Styling | Tailwind CSS, shadcn/ui components, Soft UI (neumorphism) theme |
| Backend | Supabase (Auth, Database, Storage) |
| Batch download | JSZip |
| Image processing | HTML canvas, in the browser |

## Getting started

You need [Node.js](https://nodejs.org) (version 18 or newer) and [Git](https://git-scm.com).

```bash
git clone https://github.com/YOUR-USERNAME/renemark.git
cd renemark
npm install
npm run dev
```

Open the link it prints (usually http://localhost:5173).

The app works straight away as a guest. Accounts and presets turn on once Supabase is set up.

> On Windows PowerShell, if `npm` is blocked, run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` once, or use Command Prompt instead.

## Set up Supabase (for accounts and presets)

1. Create a free project at https://supabase.com.
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it.
3. Open **Project Settings > API** and copy the project URL and the `anon` public key.
4. Copy `.env.example` to `.env` and paste both values in:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
5. Restart `npm run dev`.
6. While testing, you can turn off **Confirm email** under **Authentication > Providers > Email**.

Never commit your `.env` file, and never use the `service_role` key in this app. The `.gitignore` already keeps `.env` out of the repo.

## Project structure

```
renemark/
├── index.html
├── package.json
├── tailwind.config.js
├── .env.example
├── supabase/
│   └── schema.sql            Database tables and row-level security
└── src/
    ├── App.tsx               Main layout and app state
    ├── main.tsx
    ├── index.css             Theme colors and soft UI shadows
    ├── components/
    │   ├── Controls.tsx      Watermark upload, sliders, position grid, downloads
    │   ├── PreviewStage.tsx  Live canvas preview and photo drop area
    │   ├── AccountPresets.tsx  Sign up, log in, save and load presets
    │   └── ui/               Button, Card, Input, Label, Slider
    ├── hooks/
    │   ├── useAuth.ts        Current Supabase user
    │   └── useTheme.ts       Dark / light mode
    └── lib/
        ├── watermark.ts      Canvas drawing and batch export
        ├── background.ts     Watermark background removal
        ├── presets.ts        Saving presets to Supabase
        ├── supabase.ts       Supabase client
        └── utils.ts
```

## Deploy

Build the site:

```bash
npm run build
```

This creates a `dist` folder.

- **Netlify (quickest):** drag the `dist` folder onto https://app.netlify.com/drop.
- **Vercel (updates on every push):** import the GitHub repo at https://vercel.com, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Environment Variables, and deploy.

After deploying, in Supabase go to **Authentication > URL Configuration**, set **Site URL** to your live link, and add it under **Redirect URLs**. Otherwise sign-up emails will point to localhost.

## Privacy

- Photos are processed locally in your browser and are never sent anywhere.
- Row-level security in Supabase means each user can only read and change their own presets and watermark files.

## Ideas for the future

- Text watermarks
- Tiled or repeated watermark mode
- Project history
- Faster large batches using a Web Worker

## License

Add a license here if you want others to reuse the code (for example MIT).