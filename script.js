const DRINKS = [
  { id: 'espresso',   name: 'Espresso',          price: 3,  emoji: '☕', desc: 'A quick kick of energy' },
  { id: 'cappuccino', name: 'Cappuccino',        price: 5,  emoji: '☕', desc: 'Creamy and frothy' },
  { id: 'latte',      name: 'Caffè Latte',       price: 7,  emoji: '🥛', desc: 'Smooth and milky' },
  { id: 'mocha',      name: 'Mocha Deluxe',      price: 10, emoji: '🍫', desc: 'Chocolate meets coffee' },
  { id: 'coldbrew',   name: 'Cold Brew Supreme', price: 15, emoji: '🧊', desc: 'Chilled and refreshing' },
  { id: 'custom',     name: 'Custom Amount',     price: 0,  emoji: '💝', desc: 'You choose!' }
];

let selectedDrink = null;
let pollInterval = null;

const drinksGrid     = document.getElementById('drinksGrid');
const customSection  = document.getElementById('customSection');
const currencyModal  = document.getElementById('currencyModal');
const paymentModal   = document.getElementById('paymentModal');

// Render drinks
DRINKS.forEach(d => {
  const card = document.createElement('div');
  card.className = 'drink-card';
  card.innerHTML = `
    <span class="drink-emoji">${d.emoji}</span>
    <div class="drink-name">${d.name}</div>
    <div class="drink-desc">${d.desc}</div>
    <div class="drink-price">${d.price ? '$' + d.price : 'Custom'}</div>
  `;
  card.addEventListener('click', () => handleDrinkClick(d));
  drinksGrid.appendChild(card);
});

function handleDrinkClick(drink) {
  selectedDrink = drink;
  if (drink.id === 'custom') {
    customSection.classList.remove('hidden');
    customSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    customSection.classList.add('hidden');
    openCurrencyModal(drink);
  }
}

// Quick amount buttons
document.querySelectorAll('.quick-amounts button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('customAmount').value = btn.dataset.amt;
  });
});

document.getElementById('customCheckoutBtn').addEventListener('click', () => {
  const amt = parseFloat(document.getElementById('customAmount').value);
  if (!amt || amt < 1) {
    alert('Please enter at least $1');
    return;
  }
  selectedDrink = { ...selectedDrink, price: amt, name: `Custom Coffee ($${amt})` };
  openCurrencyModal(selectedDrink);
});

function openCurrencyModal(drink) {
  const label = drink.price
    ? `${drink.emoji} ${drink.name} — $${drink.price}`
    : `${drink.emoji} ${drink.name}`;
  document.getElementById('selectedDrinkLabel').textContent = label;
  currencyModal.classList.remove('hidden');
}

document.getElementById('closeModal').addEventListener('click', () => {
  currencyModal.classList.add('hidden');
});

// Currency selection
document.querySelectorAll('.currency-grid button').forEach(btn => {
  btn.addEventListener('click', async () => {
    const currency = btn.dataset.currency;
    currencyModal.classList.add('hidden');
    await createPayment(currency);
  });
});

async function createPayment(payCurrency) {
  try {
    const res = await fetch('/api/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drinkId: selectedDrink.id,
        customAmount: selectedDrink.id === 'custom' ? selectedDrink.price : undefined,
        payCurrency
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Payment failed');

    showPaymentModal(data);
    startPolling(data.payment_id);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function showPaymentModal(p) {
  document.getElementById('pOrder').textContent  = p.order_description;
  document.getElementById('pAmount').textContent = `${p.pay_amount} ${p.pay_currency.toUpperCase()}`;
  document.getElementById('pAddress').textContent = p.pay_address;
  document.getElementById('pStatus').textContent = p.payment_status;
  document.getElementById('poller').textContent = '⏳ Waiting for confirmation…';
  paymentModal.classList.remove('hidden');
}

document.getElementById('closePayment').addEventListener('click', () => {
  paymentModal.classList.add('hidden');
  if (pollInterval) clearInterval(pollInterval);
});

document.getElementById('copyAddr').addEventListener('click', () => {
  const addr = document.getElementById('pAddress').textContent;
  navigator.clipboard.writeText(addr);
  document.getElementById('copyAddr').textContent = '✓ Copied';
  setTimeout(() => document.getElementById('copyAddr').textContent = 'Copy', 1500);
});

function startPolling(paymentId) {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/payment-status/${paymentId}`);
      const data = await res.json();
      document.getElementById('pStatus').textContent = data.payment_status;

      if (['finished', 'confirmed'].includes(data.payment_status)) {
        document.getElementById('poller').textContent = '✅ Payment confirmed! Thank you ☕';
        clearInterval(pollInterval);
      } else if (['failed', 'expired', 'refunded'].includes(data.payment_status)) {
        document.getElementById('poller').textContent = '❌ Payment ' + data.payment_status;
        clearInterval(pollInterval);
      }
    } catch (e) { /* silent */ }
  }, 8000);
}
