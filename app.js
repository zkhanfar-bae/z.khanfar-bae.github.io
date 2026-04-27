/* ================================================================
   app.js — PayTest Frontend
   Talks to your secure backend, then loads the CyberSource
   card form. No credentials live here — they're all on the server.
   ================================================================ */


/* ================================================================
   🔧 CONFIGURATION
   Replace this URL with your backend Render URL after you deploy it.
   Example: https://paytest-backend.onrender.com
   ================================================================ */
const BACKEND_URL = 'https://YOUR-BACKEND-URL.onrender.com';

const ORDER_CURRENCY = 'JOD';


/* ================================================================
   STATE
   ================================================================ */
let transactionCount = 0;
let isProcessing     = false;
let ORDER_AMOUNT     = 0.10;
let unifiedPayments  = null; // holds the CyberSource SDK instance


/* ================================================================
   PRODUCT SELECTION
   ================================================================ */
function selectProduct(el) {
  document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  ORDER_AMOUNT = parseFloat(el.dataset.price);

  const fmt = ORDER_CURRENCY + ' ' + ORDER_AMOUNT.toFixed(2);
  document.getElementById('display-subtotal').textContent  = fmt;
  document.getElementById('display-total').textContent     = fmt;
  document.querySelector('#pay-btn .btn-text').textContent = 'Pay ' + fmt;

  resetForm();
  // Re-initialize the card form with the new amount
  initCardForm();
}


/* ================================================================
   STEP 1 — INITIALIZE CARD FORM
   Called on page load and whenever the product changes.
   Asks the backend for a capture context, then loads the
   CyberSource card input widget into #payment-form.
   ================================================================ */
async function initCardForm() {
  const mountEl = document.getElementById('payment-form');
  mountEl.innerHTML = '<p style="color:var(--muted);font-size:.82rem;text-align:center">Loading secure card form…</p>';

  try {
    // Ask our backend to get a capture context from the bank
    const res = await fetch(`${BACKEND_URL}/api/capture-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount:       ORDER_AMOUNT.toFixed(2),
        currency:     ORDER_CURRENCY,
        targetOrigin: window.location.origin,
      }),
    });

    if (!res.ok) {
      throw new Error('Backend returned status ' + res.status);
    }

    const data = await res.json();

    // The capture context is usually a JWT string or an object with a token
    // Adjust the line below based on what the bank actually returns
    const captureContext = data.captureContext || data.token || data;

    // Load the CyberSource Unified Checkout SDK
    // (the <script> tag for this is already in index.html)
    const accept = await Accept(captureContext);
    unifiedPayments = await accept.unifiedPayments();

    // Render the card form inside #payment-form
    await unifiedPayments.show({
      containers: { paymentSelection: '#payment-form' }
    });

    mountEl.querySelector('p') && (mountEl.querySelector('p').style.display = 'none');

  } catch (err) {
    console.error('[Frontend] Failed to load card form:', err);
    mountEl.innerHTML = `
      <p style="color:var(--red);font-size:.82rem;text-align:center">
        ⚠️ Could not load the card form.<br/>
        Make sure the backend is running and BACKEND_URL is correct.<br/>
        <small style="color:var(--muted)">${err.message}</small>
      </p>`;
  }
}


/* ================================================================
   STEP 2 — PAY BUTTON
   Validates fields, submits the card form to get a transient
   token, then sends it to the backend to finalize the payment.
   ================================================================ */
async function handlePayment() {
  if (isProcessing) return;

  hideBanner();
  hideRetry();

  if (!validateForm()) return;

  const customer = {
    name:  document.getElementById('full-name').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
  };

  setLoading(true);

  try {
    if (!unifiedPayments) {
      throw new Error('Card form not loaded. Please wait a moment and try again.');
    }

    // Submit the CyberSource card form — bank validates card details
    // and returns a one-time transient token (not the real card number)
    const transientToken = await unifiedPayments.complete();

    // Handle 3D Secure or other intermediate states
    if (!transientToken) {
      throw new Error('Payment not completed. Please try again.');
    }

    // Send the token to our backend to finalize the payment
    const res = await fetch(`${BACKEND_URL}/api/finalize-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transientToken,
        amount:        ORDER_AMOUNT.toFixed(2),
        currency:      ORDER_CURRENCY,
        customerName:  customer.name,
        customerEmail: customer.email,
      }),
    });

    const result = await res.json();

    // Map bank response statuses to our UI handler
    if (result.status === 'COMPLETED') {
      handleResult({ status: 'success', message: 'Payment successful', reference: result.reference || result.id }, customer);
    } else if (result.status === 'DECLINED') {
      handleResult({ status: 'failed',  message: 'Payment failed. Please try again.', reference: result.reference }, customer);
    } else {
      // PENDING_FINALIZE_ENDPOINT or any other status
      handleResult({ status: 'pending', message: result.message || 'Payment is being processed.', reference: '' }, customer);
    }

  } catch (err) {
    console.error('[Frontend] Payment error:', err);

    // CyberSource SDK throws specific messages for 3DS failure
    const msg = err.message || 'An unexpected error occurred.';
    const is3DS = msg.toLowerCase().includes('3d') || msg.toLowerCase().includes('complete');

    handleResult({
      status:    'failed',
      message:   is3DS ? 'Payment not completed (3D Secure failed).' : msg,
      reference: 'ERR-' + Date.now().toString(36).toUpperCase(),
    }, customer);
  }

  setLoading(false);
}


/* ================================================================
   FORM VALIDATION
   ================================================================ */
function validateForm() {
  let valid = true;

  const name  = document.getElementById('full-name').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();

  const nameOk  = name.split(' ').filter(w => w.length > 1).length >= 2;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneOk = /[\d]{8,}/.test(phone.replace(/[\s\-\+\(\)]/g, ''));

  setFieldError('full-name', 'err-name',  !nameOk);
  setFieldError('email',     'err-email', !emailOk);
  setFieldError('phone',     'err-phone', !phoneOk);

  if (!nameOk || !emailOk || !phoneOk) valid = false;
  return valid;
}

function setFieldError(inputId, errId, show) {
  document.getElementById(inputId).classList.toggle('error', show);
  document.getElementById(errId).classList.toggle('visible', show);
}


/* ================================================================
   RESULT HANDLER
   ================================================================ */
function handleResult(result, customer) {
  if (result.status === 'success') {
    showBanner('success', '✅', 'Payment Successful',
      result.message || 'Your transaction was approved by the bank.',
      result.reference);
    document.getElementById('pay-btn').disabled = true;
    logTransaction(customer, 'success', result.reference);

  } else if (result.status === 'pending') {
    showBanner('pending', '⏳', 'Payment Pending',
      result.message || 'Your payment is being processed.',
      result.reference);
    showRetry();
    logTransaction(customer, 'pending', result.reference);

  } else {
    showBanner('failed', '❌', 'Payment Failed',
      result.message || 'The transaction was declined.',
      result.reference);
    showRetry();
    logTransaction(customer, 'failed', result.reference);
  }
}


/* ================================================================
   UI HELPERS
   ================================================================ */
function setLoading(on) {
  isProcessing = on;
  const btn = document.getElementById('pay-btn');
  btn.classList.toggle('loading', on);
  btn.disabled = on;
}

function showBanner(type, icon, title, message, ref) {
  const b = document.getElementById('result-banner');
  b.className = type;
  document.getElementById('result-icon').textContent    = icon;
  document.getElementById('result-title').textContent   = title;
  document.getElementById('result-message').textContent = message;
  document.getElementById('result-ref').textContent     = ref ? 'Ref: ' + ref : '';
}

function hideBanner() {
  const b = document.getElementById('result-banner');
  b.className = '';
  b.style.display = 'none';
  setTimeout(() => { b.style.display = ''; }, 10);
}

function showRetry() { document.getElementById('retry-btn').style.display = 'block'; }
function hideRetry() { document.getElementById('retry-btn').style.display = 'none'; }

function resetForm() {
  hideBanner();
  hideRetry();
  const btn = document.getElementById('pay-btn');
  if (btn) btn.disabled = false;
}


/* ================================================================
   TRANSACTION LOG
   ================================================================ */
function logTransaction(customer, status, reference) {
  transactionCount++;

  const timeStr = new Date().toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  const statusLabels = {
    success: '<span class="status-pill success"><span class="dot"></span>Success</span>',
    failed:  '<span class="status-pill failed"><span class="dot"></span>Failed</span>',
    pending: '<span class="status-pill pending"><span class="dot"></span>Pending</span>',
  };

  const row = document.createElement('tr');
  row.innerHTML = `
    <td style="color:var(--muted)">${transactionCount}</td>
    <td style="color:var(--muted)">${timeStr}</td>
    <td>${escapeHtml(customer.name)}</td>
    <td style="color:var(--muted)">${escapeHtml(customer.email)}</td>
    <td style="font-weight:600">${ORDER_CURRENCY} ${ORDER_AMOUNT.toFixed(2)}</td>
    <td>${statusLabels[status] || status}</td>
    <td style="color:var(--muted);font-size:.78rem">${escapeHtml(reference || '—')}</td>
  `;

  document.getElementById('log-empty').style.display = 'none';
  document.getElementById('log-table').style.display = 'table';
  document.getElementById('log-body').prepend(row);
}

function clearLog() {
  transactionCount = 0;
  document.getElementById('log-body').innerHTML     = '';
  document.getElementById('log-table').style.display = 'none';
  document.getElementById('log-empty').style.display = '';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


/* ================================================================
   ON PAGE LOAD — initialize the card form automatically
   ================================================================ */
window.addEventListener('DOMContentLoaded', () => {
  initCardForm();
});
