// ============================================================
// Tony Car Sales — Backend Server
// Handles: Real OTP via Twilio, Booking notifications
// ============================================================

const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// In-memory OTP store (expires in 10 min)
const otpStore = new Map();

// ─── SEND OTP ───────────────────────────────────────────────
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.json({ success: false, error: 'Phone required' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, { code, expires: Date.now() + 10 * 60 * 1000 });

  try {
    await twilioClient.messages.create({
      body: `Your Tony Car Sales code is: ${code}\nValid for 10 minutes.`,
      from: process.env.TWILIO_PHONE,
      to: phone
    });
    console.log(`OTP sent to ${phone}: ${code}`);
    res.json({ success: true });
  } catch (e) {
    console.error('Twilio error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

// ─── VERIFY OTP ─────────────────────────────────────────────
app.post('/verify-otp', (req, res) => {
  const { phone, code } = req.body;
  const stored = otpStore.get(phone);

  if (!stored) return res.json({ success: false, error: 'No code sent' });
  if (Date.now() > stored.expires) {
    otpStore.delete(phone);
    return res.json({ success: false, error: 'Code expired' });
  }
  if (stored.code !== code) return res.json({ success: false, error: 'Wrong code' });

  otpStore.delete(phone);
  res.json({ success: true });
});

// ─── NOTIFY TONY OF NEW BOOKING ─────────────────────────────
app.post('/notify-booking', async (req, res) => {
  const { name, phone, car, date, time } = req.body;
  try {
    await twilioClient.messages.create({
      body: `🚗 NEW TEST DRIVE BOOKING!\nCustomer: ${name}\nPhone: ${phone}\nCar: ${car}\nDate: ${date} at ${time}`,
      from: process.env.TWILIO_PHONE,
      to: process.env.ADMIN_PHONE  // Tony's phone number
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Notify error:', e.message);
    res.json({ success: false });
  }
});

// ─── HEALTH CHECK ────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'Tony Car Sales backend running ✅' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
