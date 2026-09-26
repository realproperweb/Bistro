require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const NOWPAYMENTS_API = 'https://api.nowpayments.io/v1';
const API_KEY = process.env.NOWPAYMENTS_API_KEY;
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
const YOUR_DOMAIN = process.env.YOUR_DOMAIN || 'http://localhost:3000';

// Drinks menu
const DRINKS = {
  espresso:    { name: 'Espresso',          price: 3,   emoji: '☕', desc: 'A quick kick of energy' },
  cappuccino:  { name: 'Cappuccino',        price: 5,   emoji: '☕', desc: 'Creamy and frothy' },
  latte:       { name: 'Caffè Latte',       price: 7,   emoji: '🥛', desc: 'Smooth and milky' },
  mocha:       { name: 'Mocha Deluxe',      price: 10,  emoji: '🍫', desc: 'Chocolate meets coffee' },
  coldbrew:    { name: 'Cold Brew Supreme', price: 15,  emoji: '🧊', desc: 'Chilled and refreshing' },
  custom:      { name: 'Custom Amount',     price: 0,   emoji: '💝', desc: 'Choose your own amount' }
};

// Get available currencies
app.get('/api/currencies', async (req, res) => {
  try {
    const response = await axios.get(`${NOWPAYMENTS_API}/currencies`, {
      headers: { 'x-api-key': API_KEY }
    });
    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch currencies' });
  }
});

// Get minimum payment amount for a currency
app.get('/api/min-amount', async (req, res) => {
  const { currency, fiat } = req.query;
  try {
    const response = await axios.get(
      `${NOWPAYMENTS_API}/min-amount?currency_from=${currency}&fiat_equivalent=${fiat || 'usd'}`,
      { headers: { 'x-api-key': API_KEY } }
    );
    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch min amount' });
  }
});

// Get estimated price
app.get('/api/estimate', async (req, res) => {
  const { amount, currency_from, currency_to } = req.query;
  try {
    const response = await axios.get(
      `${NOWPAYMENTS_API}/estimate?amount=${amount}&currency_from=${currency_from}&currency_to=${currency_to}`,
      { headers: { 'x-api-key': API_KEY } }
    );
    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to estimate price' });
  }
});

// Create payment
app.post('/api/create-payment', async (req, res) => {
  const { drinkId, customAmount, payCurrency } = req.body;

  let priceUSD;
  let orderDescription;

  if (drinkId === 'custom') {
    if (!customAmount || customAmount < 1) {
      return res.status(400).json({ error: 'Invalid custom amount (min $1)' });
    }
    priceUSD = parseFloat(customAmount);
    orderDescription = `Custom Coffee - $${priceUSD}`;
  } else {
    const drink = DRINKS[drinkId];
    if (!drink) return res.status(400).json({ error: 'Invalid drink' });
    priceUSD = drink.price;
    orderDescription = `Buy me a ${drink.name} ${drink.emoji}`;
  }

  try {
    const payload = {
      price_amount: priceUSD,
      price_currency: 'usd',
      pay_currency: payCurrency || 'usdttrc20',
      order_id: `COFFEE-${Date.now()}`,
      order_description: orderDescription,
      ipn_callback_url: `${YOUR_DOMAIN}/api/ipn`,
      success_url: `${YOUR_DOMAIN}/success.html`,
      cancel_url: `${YOUR_DOMAIN}/index.html`
    };

    const response = await axios.post(`${NOWPAYMENTS_API}/payment`, payload, {
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    res.json({
      payment_id: response.data.payment_id,
      pay_address: response.data.pay_address,
      pay_amount: response.data.pay_amount,
      pay_currency: response.data.pay_currency,
      price_amount: response.data.price_amount,
      price_currency: response.data.price_currency,
      payment_status: response.data.payment_status,
      order_description: orderDescription
    });
  } catch (err) {
    console.error('Payment error:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to create payment',
      details: err.response?.data || err.message
    });
  }
});

// Check payment status
app.get('/api/payment-status/:id', async (req, res) => {
  try {
    const response = await axios.get(
      `${NOWPAYMENTS_API}/payment/${req.params.id}`,
      { headers: { 'x-api-key': API_KEY } }
    );
    res.json({
      payment_status: response.data.payment_status,
      pay_amount: response.data.pay_amount,
      actually_paid: response.data.actually_paid
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// IPN webhook handler
app.post('/api/ipn', (req, res) => {
  const receivedSig = req.headers['x-nowpayments-sig'];
  const sortedBody = JSON.stringify(sortObject(req.body));

  const hmac = crypto.createHmac('sha512', IPN_SECRET);
  hmac.update(sortedBody);
  const calculatedSig = hmac.digest('hex');

  if (receivedSig !== calculatedSig) {
    console.warn('⚠️ Invalid IPN signature');
    return res.status(401).send('Invalid signature');
  }

  const { payment_status, order_id, price_amount, pay_amount } = req.body;
  console.log(`✅ IPN: ${order_id} | ${payment_status} | $${price_amount} paid ${pay_amount}`);

  // TODO: Store in DB, send email, etc.
  res.status(200).send('OK');
});

function sortObject(obj) {
  return Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = obj[key];
    return acc;
  }, {});
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`☕ Server running on http://localhost:${PORT}`);
});
