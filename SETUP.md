# Putting Skinroom online

This is the same setup as your SOMA portal (Supabase + GitHub + Cloudflare), plus Stripe for billing. Do it in this order. Use a **new** Supabase project. Don't put Skinroom in the SOMA one.

Plan on about an hour. Anything marked *later* can wait until you're ready to charge or send emails.

---

## 1. Supabase (database, logins, photo storage)

1. Go to supabase.com and create a new project called **skinroom**. Save the database password somewhere safe.
2. Open **SQL Editor**, start a new query, paste the whole file `supabase/migrations/0001_schema.sql`, and click **Run**. It should finish with "Success". This creates every table, the privacy rules, and the photo storage. Then do the same with `0002_colors_and_trial.sql` (and any later numbered files, in order).
3. Go to **Authentication → URL Configuration**:
   - **Site URL**: your Skinroom web address (for example `https://skinroom.app`). Before you have a domain, use the Cloudflare address from step 3.
   - **Redirect URLs**: add `https://YOUR-ADDRESS/**`
4. Go to **Project Settings → API** and copy three things for later:
   - Project URL
   - `anon` public key
   - `service_role` secret key. Keep this one private. It only ever goes into Cloudflare as a secret.
5. Before real clients use it: upgrade to the Supabase paid plan (daily backups) and set up **custom SMTP** under Authentication → Emails, so login and confirmation emails come from your own address. The built-in sender is heavily rate-limited.

## 2. GitHub (where the code lives)

1. Create a new **private** repository called `skinroom`.
2. Upload this whole folder to it (or tell Claude the repo name and it can push the code for you).

## 3. Cloudflare (hosting)

1. In Cloudflare, go to **Workers & Pages → Create** and import the `skinroom` GitHub repository.
2. Build settings:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
3. Add **build variables** (these are the public ones):
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. Add **secrets** under the Worker's Settings → Variables and Secrets (type: Secret):
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_SERVICE_KEY` = your service_role key
   - `APP_URL` = your web address, e.g. `https://skinroom.app`
5. Deploy. Then add your custom domain under the Worker's **Domains & Routes**, and update the Site URL in Supabase (step 1.3) to match.

## 4. Stripe (billing), *later*

Everyone gets a 7-day free trial automatically, so you can skip this until you're ready to charge.

1. In Stripe, create a product **Skinroom: Founding member** with a monthly recurring price. Copy the price ID (starts with `price_`).
2. **Settings → Billing → Customer portal**: turn it on so estheticians can update their card or cancel themselves.
3. **Developers → Webhooks → Add endpoint**:
   - URL: `https://YOUR-ADDRESS/api/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the signing secret (starts with `whsec_`).
4. Add these Cloudflare secrets:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_ID`
   - `STRIPE_WEBHOOK_SECRET`

Use Stripe's **test mode** keys first and run a test payment with card `4242 4242 4242 4242`.

## 5. Check-in reminder emails, *later*

Reminders go out daily at 10am Eastern: 3 days before a check-in is due, and on the day.

1. Create an account at resend.com and verify your sending domain.
2. Add Cloudflare secrets:
   - `RESEND_API_KEY`
   - `EMAIL_FROM` e.g. `Skinroom <checkins@skinroom.app>`

Until these are set, everything else works; reminders just don't send.

---

## Test it before inviting anyone

1. Go to your address → **Create your Skinroom** → sign up as an esthetician.
2. In **Branding & settings**, add a logo and color.
3. Add a test client, using a second email you own. Copy the invite link.
4. Open the invite link on your phone (or a private browser window), create the client login.
5. As the client: send a check-in with three photos.
6. As the esthetician: open **Today** → review the check-in, respond, change a routine step.
7. As the client: see the response, the routine change, and send a message back.

## Running it on a computer (for development)

```
npm install
cp .env.example .env    # then fill in the two values
npm run dev
```
