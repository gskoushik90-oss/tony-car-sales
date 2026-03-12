-- =============================================
-- TONY CAR SALES — DATABASE SETUP
-- Run this in Supabase SQL Editor
-- =============================================

-- USERS TABLE
create table if not exists users (
  id uuid default gen_random_uuid() primary key,
  phone text unique not null,
  last_login timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- CARS TABLE
create table if not exists cars (
  id uuid default gen_random_uuid() primary key,
  make text not null,
  model text not null,
  year integer not null,
  price integer not null,
  mileage text default 'N/A',
  category text default 'sedan',
  color text default 'N/A',
  transmission text default 'Automatic',
  description text default '',
  photos text[] default '{}',
  active boolean default true,
  created_at timestamp with time zone default now()
);

-- BOOKINGS TABLE
create table if not exists bookings (
  id uuid default gen_random_uuid() primary key,
  car_id uuid references cars(id),
  car_name text,
  customer_name text not null,
  phone text not null,
  date text not null,
  time text not null,
  notes text default '',
  status text default 'pending',
  created_at timestamp with time zone default now()
);

-- CAR VIEWS TABLE (tracks who viewed what)
create table if not exists car_views (
  id uuid default gen_random_uuid() primary key,
  car_id text,
  phone text,
  viewed_at timestamp with time zone default now()
);

-- VISITORS TABLE (tracks all activity)
create table if not exists visitors (
  id uuid default gen_random_uuid() primary key,
  phone text,
  action text,
  created_at timestamp with time zone default now()
);

-- =============================================
-- STORAGE BUCKET (run separately in Supabase)
-- Go to Storage → New Bucket → Name: car-photos
-- Set it to PUBLIC
-- =============================================

-- Enable Row Level Security (RLS)
alter table users enable row level security;
alter table cars enable row level security;
alter table bookings enable row level security;
alter table car_views enable row level security;
alter table visitors enable row level security;

-- Allow public to read active cars
create policy "Public can view active cars"
  on cars for select
  using (active = true);

-- Allow service role full access (backend uses service key)
create policy "Service role full access on users"
  on users for all
  using (true);

create policy "Service role full access on bookings"
  on bookings for all
  using (true);

create policy "Service role full access on car_views"
  on car_views for all
  using (true);

create policy "Service role full access on visitors"
  on visitors for all
  using (true);

create policy "Service role full access on cars"
  on cars for all
  using (true);
