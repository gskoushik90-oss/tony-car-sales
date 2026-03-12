require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── Supabase ──────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Twilio ────────────────────────────────────────────────
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ── Multer (photo uploads → memory then Supabase) ─────────
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// ── In-memory OTP store (clears every 5 min) ──────────────
const otpStore = {};

// ── Auth Middleware ───────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ error: 'Not admin' });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════

// Send OTP
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    // Normalize phone
    phone = phone.replace(/\D/g, '');
    if (phone.length === 10) phone = '+1' + phone;
    else if (!phone.startsWith('+')) phone = '+' + phone;

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    otpStore[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 };

    // Send via Twilio
    await twilioClient.messages.create({
      body: `Your Tony Car Sales code is: ${otp}. Valid for 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });

    // Log visitor
    await supabase.from('visitors').insert([{ phone, action: 'otp_requested', created_at: new Date() }]);

    res.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Failed to send OTP. Check Twilio config.' });
  }
});

// Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    let { phone, otp } = req.body;
    phone = phone.replace(/\D/g, '');
    if (phone.length === 10) phone = '+1' + phone;
    else if (!phone.startsWith('+')) phone = '+' + phone;

    const record = otpStore[phone];
    if (!record) return res.status(400).json({ error: 'No OTP requested for this number' });
    if (Date.now() > record.expires) return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    if (record.otp !== otp) return res.status(400).json({ error: 'Incorrect code. Try again.' });

    delete otpStore[phone];

    // Upsert user in DB
    const { data: user } = await supabase
      .from('users')
      .upsert([{ phone, last_login: new Date() }], { onConflict: 'phone' })
      .select()
      .single();

    const token = jwt.sign({ phone, userId: user?.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    // Log
    await supabase.from('visitors').insert([{ phone, action: 'logged_in', created_at: new Date() }]);

    res.json({ success: true, token, phone });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Admin Login
app.post('/api/auth/admin-login', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const token = jwt.sign({ isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token });
});

// ════════════════════════════════════════════════════════
//  CARS ROUTES
// ════════════════════════════════════════════════════════

// Get all cars (public)
app.get('/api/cars', async (req, res) => {
  try {
    const { category } = req.query;
    let query = supabase.from('cars').select('*').eq('active', true).order('created_at', { ascending: false });
    if (category && category !== 'all') query = query.eq('category', category);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ cars: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load cars' });
  }
});

// Get single car + track view (logged in users)
app.get('/api/cars/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('cars').select('*').eq('id', req.params.id).single();
    if (error) throw error;

    // Track view if user header present
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        await supabase.from('car_views').insert([{
          car_id: req.params.id,
          phone: decoded.phone,
          viewed_at: new Date()
        }]);
      } catch {}
    }

    res.json({ car: data });
  } catch (err) {
    res.status(500).json({ error: 'Car not found' });
  }
});

// Upload new car (admin only)
app.post('/api/cars', adminMiddleware, upload.array('photos', 10), async (req, res) => {
  try {
    const { make, model, year, price, mileage, category, color, transmission, description } = req.body;

    if (!make || !model || !year || !price) {
      return res.status(400).json({ error: 'Make, model, year, price required' });
    }

    // Upload photos to Supabase Storage
    const photoUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const filename = `cars/${Date.now()}-${file.originalname.replace(/\s/g, '-')}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('car-photos')
          .upload(filename, file.buffer, { contentType: file.mimetype });

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('car-photos').getPublicUrl(filename);
          photoUrls.push(urlData.publicUrl);
        }
      }
    }

    const { data, error } = await supabase.from('cars').insert([{
      make, model,
      year: parseInt(year),
      price: parseInt(price),
      mileage: mileage || 'N/A',
      category: category || 'sedan',
      color: color || 'N/A',
      transmission: transmission || 'Automatic',
      description: description || '',
      photos: photoUrls,
      active: true,
      created_at: new Date()
    }]).select().single();

    if (error) throw error;
    res.json({ success: true, car: data });
  } catch (err) {
    console.error('Add car error:', err);
    res.status(500).json({ error: 'Failed to add car' });
  }
});

// Delete car (admin only)
app.delete('/api/cars/:id', adminMiddleware, async (req, res) => {
  try {
    await supabase.from('cars').update({ active: false }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete car' });
  }
});

// ════════════════════════════════════════════════════════
//  BOOKINGS ROUTES
// ════════════════════════════════════════════════════════

// Create booking (logged in users)
app.post('/api/bookings', authMiddleware, async (req, res) => {
  try {
    const { carId, name, date, time, notes } = req.body;
    if (!carId || !name || !date || !time) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const { data: car } = await supabase.from('cars').select('make,model,year').eq('id', carId).single();

    const { data, error } = await supabase.from('bookings').insert([{
      car_id: carId,
      car_name: car ? `${car.year} ${car.make} ${car.model}` : 'Unknown',
      customer_name: name,
      phone: req.user.phone,
      date, time,
      notes: notes || '',
      status: 'pending',
      created_at: new Date()
    }]).select().single();

    if (error) throw error;

    // Notify Tony via SMS (optional)
    try {
      await twilioClient.messages.create({
        body: `🚗 NEW TEST DRIVE BOOKING!\nCar: ${data.car_name}\nCustomer: ${name}\nPhone: ${req.user.phone}\nDate: ${date} at ${time}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: process.env.TWILIO_PHONE_NUMBER // sends to yourself
      });
    } catch (smsErr) {
      console.log('SMS notify failed (non-critical):', smsErr.message);
    }

    res.json({ success: true, booking: data });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Get all bookings (admin only)
app.get('/api/bookings', adminMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ bookings: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load bookings' });
  }
});

// Update booking status (admin only)
app.patch('/api/bookings/:id', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const { data, error } = await supabase.from('bookings').update({ status }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, booking: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// ════════════════════════════════════════════════════════
//  ANALYTICS ROUTES (admin only)
// ════════════════════════════════════════════════════════

// Who viewed which car
app.get('/api/analytics/views', adminMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('car_views')
      .select('*, cars(make, model, year)')
      .order('viewed_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({ views: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load views' });
  }
});

// All visitors
app.get('/api/analytics/visitors', adminMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('visitors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ visitors: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load visitors' });
  }
});

// ════════════════════════════════════════════════════════
//  SERVE FRONTEND
// ════════════════════════════════════════════════════════
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚗 Tony Car Sales running on port ${PORT}`));
