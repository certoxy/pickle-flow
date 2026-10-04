# PickleFlow setup

PickleFlow currently uses a single production environment. Staging can be added later.

## 1. Supabase

1. Create a Supabase project.
2. Open **SQL Editor** and run:
   `supabase/migrations/001_organizer_registration.sql`
3. In **Authentication → URL Configuration**, set:
   - Site URL: your production Vercel URL
   - Redirect URLs: your production Vercel URL and local URL, for example `http://localhost:5173/**`
4. Keep email confirmation enabled for public registration.

## 2. Local environment

Copy `.env.example` to `.env.local` and provide:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_ANON_KEY
VITE_DONATION_URL=
```

The Supabase anon key is intended for browser use. Never expose a service-role key in Vercel or frontend code.

## 3. Run locally

```bash
npm install
npm run dev
```

## 4. Deploy to Vercel

1. Import `certoxy/pickle-flow` into Vercel.
2. Framework preset: **Vite**
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add the three environment variables above for **Production**.
6. Deploy.
7. Return to Supabase and update the Site URL and redirect URL with the final Vercel domain.

Every push to `main` will then deploy to production.

## Donation behavior

Donations are optional. If `VITE_DONATION_URL` is blank, the page shows a friendly “coming soon” message. When a donation page is ready, add its URL in Vercel and redeploy.
