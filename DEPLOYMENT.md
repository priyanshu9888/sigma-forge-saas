# FigmaForge SaaS — Complete Free Hosting Guide

## Architecture Overview

```
User Browser
    │
    ├── Vercel (Frontend: landing page + dashboard)
    │       index.html, dashboard.html
    │
    └── Render (Backend: FastAPI)
            ├── /generate  ← core engine
            ├── /download  ← zip files
            ├── /checkout  ← Stripe session
            └── /stripe/webhook
                    │
                    ├── Supabase (Auth + Database + Storage)
                    │       profiles table, generations table
                    │
                    └── Stripe (Payments)
                            free → pro → team upgrades
```

---

## STEP 1 — Supabase Setup (Database + Auth) — FREE

**Time: ~10 minutes**

1. Go to **supabase.com** → New project
2. Choose a region close to your users
3. Save your database password

**Run the migration:**
- Go to Supabase Dashboard → SQL Editor
- Paste the contents of `supabase/migrations/001_initial.sql`
- Click Run

**Enable Auth providers:**
- Go to Authentication → Providers
- Enable **Email** (already on)
- Enable **Google** (optional but recommended):
  - Go to console.cloud.google.com → Create OAuth 2.0 credentials
  - Callback URL: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
  - Paste Client ID + Secret into Supabase

**Get your keys:**
- Project Settings → API
- Copy: `Project URL`, `anon public key`, `service_role key`

---

## STEP 2 — Backend on Render — FREE

**Time: ~15 minutes**

1. Go to **render.com** → New → Web Service
2. Connect your GitHub repo
3. Configure:
   ```
   Name:         figmaforge-api
   Region:       Oregon (US West)
   Branch:       main
   Root Dir:     figmaforge-saas/backend-saas
   Runtime:      Python 3
   Build Cmd:    pip install -r requirements.txt
   Start Cmd:    uvicorn main_saas:app --host 0.0.0.0 --port $PORT
   Instance:     Free
   ```

4. Add Environment Variables (Render → Environment):

   ```env
   SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   SUPABASE_SERVICE_KEY=your_service_role_key_here
   STRIPE_SECRET_KEY=your_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
   STRIPE_PRICE_PRO=price_xxxxxxxxxxxxxxxx
   STRIPE_PRICE_TEAM=price_xxxxxxxxxxxxxxxx
   ```

5. Click **Create Web Service** → note your URL:
   `https://figmaforge-api.onrender.com`

**⚠ Free Render limitation:** Service sleeps after 15 min of inactivity.
First request after sleep takes ~30 seconds (cold start).
**Fix:** Use UptimeRobot (free) to ping `/` every 14 minutes.

---

## STEP 3 — Frontend on Vercel — FREE

**Time: ~5 minutes**

**Option A — Vercel CLI:**
```bash
npm i -g vercel
cd figmaforge-saas/frontend
vercel --prod
```

**Option B — GitHub import:**
1. Go to **vercel.com** → New Project
2. Import your GitHub repo
3. Set Root Directory: `figmaforge-saas/frontend`
4. No build step needed (pure HTML)
5. Deploy

**Add Environment Variables in Vercel:**
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=https://figmaforge-api.onrender.com
```

**Update the dashboard API URL:**
In `dashboard.html`, find this line and update:
```javascript
const res = await fetch('/generate', { ... });
// Change to:
const res = await fetch('https://figmaforge-api.onrender.com/generate', { ... });
```

**Add a custom domain (optional, free on Vercel):**
- Vercel → Domains → Add domain
- Add your domain's CNAME: `cname.vercel-dns.com`

---

## STEP 4 — Stripe Setup (Payments) — FREE UNTIL YOU EARN

**Time: ~20 minutes**

1. Go to **stripe.com** → Create account
2. Activate your account (need business info for live mode)

**Create products:**
```
Product 1: FigmaForge Pro
  Price: $29.00 / month (recurring)
  Copy the Price ID: price_xxxxxxxxx → STRIPE_PRICE_PRO

Product 2: FigmaForge Team
  Price: $79.00 / month (recurring)
  Copy the Price ID: price_xxxxxxxxx → STRIPE_PRICE_TEAM
```

**Set up webhook:**
- Stripe → Developers → Webhooks → Add endpoint
- URL: `https://figmaforge-api.onrender.com/stripe/webhook`
- Events to listen:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Copy Signing Secret → `STRIPE_WEBHOOK_SECRET`

**Test with Stripe CLI:**
```bash
stripe listen --forward-to localhost:8000/stripe/webhook
stripe trigger checkout.session.completed
```

---

## STEP 5 — Connect Frontend to Backend

In `dashboard.html`, update the fetch URL:

```javascript
// Find this in the generate() function:
const res = await fetch('/generate', {

// Replace with:
const API = 'https://figmaforge-api.onrender.com';
const res = await fetch(`${API}/generate`, {
```

Also update the checkout button:
```javascript
function handleUpgrade(plan) {
  fetch('https://figmaforge-api.onrender.com/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
    body: JSON.stringify({
      plan,
      success_url: `${window.location.origin}/dashboard?upgraded=true`,
      cancel_url: `${window.location.origin}/pricing`,
    })
  })
  .then(r => r.json())
  .then(d => window.location = d.url);
}
```

---

## STEP 6 — Keep Render Alive (Free Tier Fix)

Render free tier sleeps after 15 minutes. Fix with UptimeRobot:

1. Go to **uptimerobot.com** → Free account
2. Add Monitor:
   ```
   Type: HTTP(s)
   URL:  https://figmaforge-api.onrender.com/
   Interval: 5 minutes
   ```
3. Done — your backend stays warm, cold starts disappear

---

## Full Environment Variables Reference

### Backend (Render)
```env
# Required
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Stripe (add after setting up products)
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PRICE_PRO=price_xxxxxxxxxxxxxxxxxxxx
STRIPE_PRICE_TEAM=price_xxxxxxxxxxxxxxxxxxxx

# Optional
PORT=8000
ENVIRONMENT=production
```

### Frontend (Vercel)
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_API_URL=https://figmaforge-api.onrender.com
```

---

## Backend requirements.txt

```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
pydantic>=2.7.0
requests>=2.31.0
supabase>=2.4.0
stripe>=9.0.0
python-multipart>=0.0.9
aiofiles>=23.2.1
```

---

## Free Tier Limits Summary

| Service | Free Limit | When to Upgrade |
|---|---|---|
| Vercel | Unlimited deploys, 100GB bandwidth | Never (for this scale) |
| Render | 750 hrs/mo, sleeps after 15min | At ~$500 MRR → $7/mo Starter |
| Supabase | 500MB DB, 1GB storage, 50K MAU | At ~100 users/mo |
| Stripe | 2.9% + 30¢ per transaction | Always (no monthly fee) |
| UptimeRobot | 50 monitors, 5-min intervals | Never |

**Total monthly cost at launch: $0**
**Total monthly cost at $1,000 MRR: ~$14/mo (Render + Supabase upgrades)**

---

## Going Live Checklist

- [ ] Supabase project created, migration ran
- [ ] Auth providers enabled (email at minimum)
- [ ] Backend deployed on Render with all env vars
- [ ] Frontend deployed on Vercel
- [ ] Dashboard `fetch` URL updated to Render URL
- [ ] Stripe products + prices created
- [ ] Stripe webhook registered pointing at Render
- [ ] UptimeRobot pinging Render every 5 minutes
- [ ] Custom domain added on Vercel (optional)
- [ ] Test end-to-end: generate → download → upgrade flow
