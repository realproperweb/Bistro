import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ---- Menu (server-side source of truth, so prices can't be tampered with) ----
const MENU = {
  espresso:   { name: 'Espresso',           price: 3.00, emoji: '☕' },
  cappuccino: { name: 'Cappuccino',         price: 5.00, emoji: '🥛' },
  latte:      { name: 'Caffè Latte',        price: 6.00, emoji: '🍶' },
  mocha:      { name: 'Mocha Noir',         price: 7.00, emoji: '🍫' },
  croissant:  { name: 'Butter Croissant',   price: 4.00, emoji: '🥐' },
  tiramisu:   { name: 'Tiramisù della Casa',price: 8.00, emoji: '🍰' },
};

const API_BASE = process.env.NOWPAYMENTS_API_BASE || 'https://api.nowpayments.io/v1';
const API_KEY  = process.env.NOWPAYMENTS_API_KEY;
const IPN_KEY  = process.env.NOWPAYMENTS_IPN_SECRET;
const BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

if (!API_KEY || !IPN_KEY) {
  console.warn('⚠️  Missing NOWPAYMENTS_API_KEY or NOWPAYMENTS_IPN_SECRET in .env');
}

// ---- Serve the frontend ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- Menu endpoint ----
app.get('/api/menu', (_req, res) => {
  res.json(
    Object.entries(MENU).map(([id, item]) => ({ id, ...item }))
  );
});

// ---- Create payment ----
app.post('/api/create-payment', async (req, res) => {
  try {
    const { items, tip = 0, note = '' } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }

    // Rebuild the cart server-side from the menu — never trust client prices.
    let subtotal = 0;
    const lineItems = [];
    for (const { id, qty } of items) {
      const menuItem = MENU[id];
      if (!menuItem || !Number.isInteger(qty) || qty < 1 || qty > 20) continue;
      subtotal += menuItem.price * qty;
      lineItems.push(`${menuItem.name} x${qty}`);
    }
    if (lineItems.length === 0) {
      return res.status(400).json({ error: 'No valid items in cart.' });
    }

    const tipNum = Math.max(0, Math.min(100, Number(tip) || 0));
    const total = +(subtotal + tipNum).toFixed(2);

    const orderId = `BISTRO-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    const payload = {
      price_amount: total,
      price_currency: 'usd',
      pay_currency: 'usdttrc20', // default; user can change on NOWPayments checkout
      order_id: orderId,
      order_description: `Virtual Bistro — ${lineItems.join(', ')}${tipNum ? ` + tip $${tipNum}` : ''}${note ? ` | ${note.slice(0,120)}` : ''}`,
      ipn_callback_url: `${BASE_URL}/api/ipn`,
      success_url: `${BASE_URL}/?status=success&order=${orderId}`,
      cancel_url:  `${BASE_URL}/?status=cancelled&order=${orderId}`,
    };

    const r = await fetch(`${API_BASE}/payment`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    if (!r.ok) {
      console.error('NOWPayments error:', data);
      return res.status(502).json({ error: data.message || 'Payment provider error.' });
    }

    res.json({
      orderId,
      total,
      invoiceUrl: data.invoice_url,
      paymentId: data.payment_id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error creating payment.' });
  }
});

// ---- IPN webhook (verify signature, then fulfill) ----
app.post('/api/ipn', (req, res) => {
  const sig = req.headers['x-nowpayments-sig'];
  if (!sig) return res.status(401).send('Missing signature');

  const sorted = JSON.stringify(sortObject(req.body));
  const hmac = crypto.createHmac('sha512', IPN_KEY).update(sorted).digest('hex');

  if (hmac !== sig) {
    console.warn('IPN signature mismatch');
    return res.status(401).send('Invalid signature');
  }

  const { order_id, payment_status, price_amount, pay_currency } = req.body;
  console.log(`✅ IPN: ${order_id} → ${payment_status} (${price_amount} USD / ${pay_currency})`);

  // TODO: persist to a DB, send yourself an email/Telegram ping, etc.
  // payment_status values: waiting, confirming, confirmed, sending, partially_paid, finished, failed, refunded, expired

  res.sendStatus(200);
});

function sortObject(obj) {
  return Object.keys(obj).sort().reduce((acc, k) => {
    acc[k] = obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])
      ? sortObject(obj[k])
      : obj[k];
    return acc;
  }, {});
}

app.listen(process.env.PORT || 3000, () => {
  console.log(`☕ Virtual Bistro running at ${BASE_URL}`);
});
