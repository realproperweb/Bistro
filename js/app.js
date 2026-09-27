const BACKEND = ''; // same origin as index.html on PythonAnywhere

const ICONS = {
  espresso: `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z"/><path d="M16 9h2a3 3 0 0 1 0 6h-2"/></svg>`,
  drip: `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14l-2 6H7L5 4z"/><path d="M7 10v6a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-6"/><path d="M10 13v3M14 13v3"/></svg>`,
  latte: `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z"/><path d="M16 10h2a3 3 0 0 1 0 6h-2"/><path d="M9 3c0 2-1 2-1 4M13 3c0 2-1 2-1 4"/></svg>`,
  macchiato: `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12l-1 5H7L6 4z"/><path d="M7 9v6a4 4 0 0 0 4 4h2a4 4 0 0 0 4-4V9"/><circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none"/></svg>`,
  frapp: `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10l-1 4H8L7 3z"/><path d="M8 7l-1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2L16 7"/><path d="M9 11h6M9 15h6"/></svg>`,
  custom: `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></svg>`
};

const OPTIONS = [
  { id:'espresso',   name:'Espresso',          size:'Solo shot',                 price:2.95, icon:'espresso'   },
  { id:'drip',       name:'Drip Coffee',       size:'Tall · 12 oz',              price:3.45, icon:'drip'       },
  { id:'latte',      name:'Caffè Latte',       size:'Tall · 12 oz',              price:5.45, icon:'latte'      },
  { id:'macchiato',  name:'Caramel Macchiato', size:'Grande · 16 oz',            price:6.25, icon:'macchiato'  },
  { id:'frapp',      name:'Frappuccino',       size:'Venti · 24 oz',             price:7.25, icon:'frapp'      },
  { id:'custom',     name:'Custom amount',     size:'You choose',                price:null, icon:'custom'     }
];

// render
const grid = document.getElementById('options');
grid.innerHTML = OPTIONS.map(o => `
  <button class="card ${o.id==='custom'?'card--custom':''}" data-id="${o.id}">
    <div class="ico">${ICONS[o.icon]}</div>
    <p class="name">${o.name}</p>
    <p class="size">${o.size}</p>
    <div class="price">${o.price!=null ? `$${o.price.toFixed(2)}<span>USD</span>` : 'Any amount'}</div>
  </button>
`).join('');

// modal logic
const modal   = document.getElementById('modal');
const mTitle  = document.getElementById('mTitle');
const mDesc   = document.getElementById('mDesc');
const mAmount = document.getElementById('mAmount');
const mIcon   = document.getElementById('mIcon');
const mPay    = document.getElementById('mPay');
let current   = null;

function openModal(o){
  current = o;
  mIcon.innerHTML = ICONS[o.icon];
  mTitle.textContent = o.name;

  if (o.id === 'custom'){
    mDesc.innerHTML = `
      <label style="display:block;margin-bottom:8px">Enter amount in USD (min $1)</label>
      <input id="customAmt" type="number" min="1" step="0.01" placeholder="5.00"
        style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid #2a2a31;
               background:#1f1f25;color:#f4f4f6;font-size:16px" />
    `;
    mAmount.textContent = '$0.00';
    const inp = document.getElementById('customAmt');
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value) || 0;
      mAmount.textContent = `$${v.toFixed(2)}`;
    });
    setTimeout(()=>inp.focus(), 60);
  } else {
    mDesc.textContent = `${o.size} — ${o.name}`;
    mAmount.textContent = `$${o.price.toFixed(2)}`;
  }
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal(){
  modal.hidden = true;
  document.body.style.overflow = '';
  current = null;
}

grid.addEventListener('click', e => {
  const btn = e.target.closest('.card');
  if (!btn) return;
  const opt = OPTIONS.find(o => o.id === btn.dataset.id);
  if (opt) openModal(opt);
});
modal.addEventListener('click', e => { if (e.target.dataset.close !== undefined) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

// pay button → backend
mPay.addEventListener('click', async () => {
  if (!current) return;
  let amount = current.price;
  if (current.id === 'custom'){
    const v = parseFloat(document.getElementById('customAmt').value);
    if (!v || v < 1){ alert('Please enter at least $1.00'); return; }
    amount = v;
  }
  mPay.disabled = true;
  mPay.textContent = 'Creating invoice…';

  try{
    const res = await fetch(`${BACKEND}/api/create-invoice`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        option_id: current.id,
        amount: Number(amount.toFixed(2)),
        description: `Coffee: ${current.name}${current.id!=='custom' ? ' ('+current.size+')' : ''}`
      })
    });
    const data = await res.json();
    if (!res.ok || !data.invoice_url){
      throw new Error(data.error || 'Failed to create invoice');
    }
    window.location.href = data.invoice_url;
  }catch(err){
    console.error(err);
    alert('Could not start payment: ' + err.message);
    mPay.disabled = false;
    mPay.textContent = 'Pay with crypto';
  }
});
