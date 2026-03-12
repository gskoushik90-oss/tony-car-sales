# 🚗 Tony Car Sales — Complete Setup Guide
### For Beginners — Step by Step

---

## What You're Setting Up

| Piece | What It Does | Cost |
|---|---|---|
| **Supabase** | Stores your cars, photos, bookings, visitor log | FREE |
| **Railway** | Runs your backend server (sends OTP texts) | FREE |
| **Twilio** | Sends real OTP text messages | FREE trial (~$15 credit) |
| **Netlify** | Hosts your website | FREE |

**Total cost: $0 to start**

---

## STEP 1 — Set Up Supabase (Database + Photo Storage)

**1.1** Go to **https://supabase.com** → Click "Start your project" → Sign up with Google

**1.2** Click "New Project" → Name it `tony-car-sales` → Set a password → Click Create

**1.3** Wait 2 minutes for it to set up

**1.4** Click "SQL Editor" on the left sidebar → Click "New Query" → Paste this entire block and click RUN:

```sql
-- Cars table
CREATE TABLE cars (
  id SERIAL PRIMARY KEY,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  price INTEGER NOT NULL,
  mileage TEXT DEFAULT 'N/A',
  category TEXT DEFAULT 'sedan',
  color TEXT DEFAULT 'N/A',
  transmission TEXT DEFAULT 'Automatic',
  badge TEXT,
  description TEXT,
  photos TEXT[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bookings table
CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  car_id INTEGER REFERENCES cars(id),
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table
CREATE TABLE users (
  phone TEXT PRIMARY KEY,
  last_login TIMESTAMPTZ DEFAULT NOW()
);

-- Visitor log table
CREATE TABLE visitor_log (
  id SERIAL PRIMARY KEY,
  phone TEXT,
  car_id INTEGER,
  car_name TEXT,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow public access (for your website)
ALTER TABLE cars ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read cars" ON cars FOR SELECT USING (true);
CREATE POLICY "Public insert bookings" ON bookings FOR ALL USING (true);
CREATE POLICY "Public insert users" ON users FOR ALL USING (true);
CREATE POLICY "Public insert visitor_log" ON visitor_log FOR ALL USING (true);
```

**1.5** Set up Photo Storage:
- Click "Storage" on left sidebar
- Click "New Bucket"
- Name it: `car-photos`
- Check "Public bucket" → Click Save
- Click on `car-photos` → Policies → New Policy → "Allow all" → Save

**1.6** Get your keys:
- Click "Settings" (gear icon) → "API"
- Copy **Project URL** → this is your `SUPABASE_URL`
- Copy **anon public** key → this is your `SUPABASE_KEY`
- Save both — you'll need them in Step 4

---

## STEP 2 — Set Up Twilio (Real SMS OTP)

**2.1** Go to **https://twilio.com** → Sign up free

**2.2** After signing up, you'll see your dashboard. Copy:
- **Account SID** (starts with AC...)
- **Auth Token** (click the eye icon to reveal)

**2.3** Get a phone number:
- Click "Phone Numbers" → "Buy a Number"
- Search for a US number → Buy (it's free with trial credit)
- Copy this number — this is your `TWILIO_PHONE`

**2.4** Save all 3 values — you'll need them in Step 3

---

## STEP 3 — Deploy Backend to Railway (Free Server)

**3.1** Go to **https://railway.app** → Sign up with GitHub

**3.2** Click "New Project" → "Deploy from GitHub"
- If you don't have GitHub: go to **github.com** → sign up → create a new repository named `tony-backend`
- Upload the files inside the `server` folder to that repo

**3.3** Once Railway sees your code, click on the project → "Variables" tab → Add these one by one:

```
TWILIO_ACCOUNT_SID   =  ACxxxx... (from Step 2)
TWILIO_AUTH_TOKEN    =  your token (from Step 2)
TWILIO_PHONE         =  +1xxxxxxxxxx (your Twilio number)
ADMIN_PHONE          =  +1xxxxxxxxxx (YOUR real phone number — gets booking alerts)
```

**3.4** Click "Deploy" → Wait 2 minutes

**3.5** Click "Settings" → Copy the domain URL (looks like `https://tony-backend-xxxx.up.railway.app`)
This is your `BACKEND_URL` — save it

---

## STEP 4 — Update Your Website with Real Values

Open `index.html` and find this section near the top of the `<script>`:

```javascript
const SUPABASE_URL  = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY  = 'YOUR_SUPABASE_ANON_KEY';
const BACKEND_URL   = 'YOUR_BACKEND_URL';
const ADMIN_PHONE   = 'YOUR_PHONE_NUMBER';
const BUSINESS_PHONE = 'YOUR_DISPLAY_PHONE';
```

Replace each value:
- `YOUR_SUPABASE_URL` → paste your Supabase Project URL
- `YOUR_SUPABASE_ANON_KEY` → paste your Supabase anon key
- `YOUR_BACKEND_URL` → paste your Railway URL
- `YOUR_PHONE_NUMBER` → your phone digits only, no spaces e.g. `3145551234`
- `YOUR_DISPLAY_PHONE` → how it shows on site e.g. `(314) 555-1234`

Save the file.

---

## STEP 5 — Host Website on Netlify (Free)

**5.1** Go to **https://netlify.com** → Sign up free

**5.2** Drag and drop your `index.html` file onto the Netlify dashboard

**5.3** Your site is live! You'll get a URL like `https://tony-car-sales.netlify.app`

**5.4** (Optional) Custom domain: In Netlify → Domain Settings → Add custom domain if you have one

---

## STEP 6 — Add Your First Car

**6.1** Open your website

**6.2** On your keyboard, type the secret code: **TONYADMIN** (no spaces, just type it)
→ This opens your admin panel (only you know this!)

**6.3** Click "Upload Car" → Fill in the details → Drag your car photos → Click "Add to Inventory"

**6.4** Your car is live on the website instantly!

---

## STEP 7 — Generate QR Code to Share

**7.1** Go to **https://qr.io** or **https://qrcode-monkey.com**

**7.2** Paste your Netlify website URL

**7.3** Download the QR code

**7.4** Print it, text it, put it on your cars — anyone who scans it goes straight to your site!

---

## What You'll See in Admin

| Tab | What It Shows |
|---|---|
| **Upload Car** | Add new cars with photos |
| **Manage Cars** | See all cars, delete or hide them |
| **Bookings** | Every test drive request with name & phone |
| **Visitor Log** | Every signed-in user who viewed a car + when |

---

## How the OTP Login Works

1. Customer enters their phone number
2. They get a real text with a 6-digit code
3. They enter the code → instantly logged in
4. You can now see their phone number in your visitor log
5. When they book a test drive, YOU get a text immediately

---

## Trouble? Common Fixes

**Site not loading cars?**
→ Check your SUPABASE_URL and SUPABASE_KEY are correct in index.html

**OTP not sending?**
→ Check Railway is running (green light) and Twilio credentials are correct

**Photos not uploading?**
→ Make sure your Supabase `car-photos` bucket is set to Public

**Admin not opening?**
→ Type TONYADMIN slowly with keyboard (all caps)

---

## Need Help?
Come back to Claude and say "I'm stuck on Step X" — I'll walk you through it!
