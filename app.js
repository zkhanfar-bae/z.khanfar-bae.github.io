/* ================================================================
   app.js — PayTest Demo
   All payment logic lives here. The HTML file loads this script
   at the bottom via: <script src="app.js"></script>
   ================================================================ */


/* ================================================================
   🔧 CONFIGURATION — Edit these values to customize the demo
   ================================================================ */

const ORDER_CURRENCY = 'JOD';

// 🔧 EDIT: Your sandbox credentials from the bank.
//          NEVER put real production keys here.
const SDK_PUBLIC_KEY  = 'YOUR_SANDBOX_PUBLIC_KEY_HERE';
const SDK_ENVIRONMENT = 'sandbox'; // change to 'production' only when going live


/* ================================================================
   STATE
   ================================================================ */
let transactionCount = 0;
let isProcessing     = false;
let ORDER_AMOUNT     = 0.10; // updated when user selects a product


/* ================================================================
   PRODUCT SELECTION
   Called when the user clicks a product card.
   ================================================================ */
function selectProduct(el) {
  // Deselect all cards
  document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
  // Highlight the chosen one
  el.classList.add('selected');
  // Read price from the card's data-price attribute
  ORDER_AMOUNT = parseFloat(el.dataset.price);
  // Update the order summary
  const fmt = ORDER_CURRENCY + ' ' + ORDER_AMOUNT.toFixed(2);
  document.getElementById('display-subtotal').textContent = fmt;
  document.getElementById('display-total').textContent    = fmt;
  // Update the Pay button label
  document.querySelector('#pay-btn .btn-text').textContent = 'Pay ' + fmt;
  // Clear any previous payment result
  resetForm();
}


/* ================================================================
   FORM VALIDATION
   Checks all three customer fields before allowing payment.
   ================================================================ */
function validateForm() {
  let valid = true;

  const name  = document.getElementById('full-name').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();

  // Name: must be at least two words
  const nameOk = name.split(' ').filter(w => w.length > 1).length >= 2;
  setFieldError('full-name', 'err-name', !nameOk);
  if (!nameOk) valid = false;

  // Email: basic format check
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  setFieldError('email', 'err-email', !emailOk);
  if (!emailOk) valid = false;

  // Phone: at least 8 digits (ignoring spaces, dashes, +, parentheses)
  const phoneOk = /[\d]{8,}/.test(phone.replace(/[\s\-\+\(\)]/g, ''));
  setFieldError('phone', 'err-phone', !phoneOk);
  if (!phoneOk) valid = false;

  return valid;
}

function setFieldError(inputId, errId, show) {
  document.getElementById(inputId).classList.toggle('error', show);
  document.getElementById(errId).classList.toggle('visible', show);
}


/* ================================================================
   MAIN PAYMENT HANDLER
   Called when the user clicks "Pay Now".
   ================================================================ */
async function handlePayment() {
  if (isProcessing) return;

  // Clear previous result banner
  hideBanner();
  hideRetry();

  // Validate fields first
  if (!validateForm()) return;

  // Collect customer info
  const customer = {
    name:  document.getElementById('full-name').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
  };

  // Show spinner / disable button
  setLoading(true);

  try {
    /* ============================================================
       🔧 SDK INTEGRATION POINT
       When you have the bank's SDK, replace simulatePayment()
       with the real call, for example:

         const result = await BankSDK.processPayment({
           publicKey:   SDK_PUBLIC_KEY,
           environment: SDK_ENVIRONMENT,
           amount:      ORDER_AMOUNT,
           currency:    ORDER_CURRENCY,
           customer:    customer,
           reference:   generateReference(),
         });

       The result object should have:
         result.status    → 'success' | 'failed' | 'pending'
         result.message   → human-readable message from the bank
         result.reference → transaction ID / reference number
    ============================================================ */

    const result = await simulatePayment(); // 🔧 REMOVE this line when SDK is ready

    handleResult(result, customer);

  } catch (err) {
    handleResult({
      status:    'failed',
      message:   'An unexpected error occurred. Please try again.',
      reference: 'ERR-' + Date.now(),
    }, customer);
    console.error('[PayTest] Payment error:', err);
  }

  setLoading(false);
}


/* ================================================================
   RESULT HANDLER
   Displays the correct banner and logs the transaction.
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
      result.message || 'Your payment is being processed. Please wait.',
      result.reference);
    showRetry();
    logTransaction(customer, 'pending', result.reference);

  } else {
    showBanner('failed', '❌', 'Payment Failed',
      result.message || 'The transaction was declined. Please check your details.',
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
  document.getElementById('log-body').prepend(row); // newest on top
}

function clearLog() {
  transactionCount = 0;
  document.getElementById('log-body').innerHTML    = '';
  document.getElementById('log-table').style.display = 'none';
  document.getElementById('log-empty').style.display = '';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


/* ================================================================
   SIMULATOR — delete this whole function when the real SDK is ready.
   Randomly returns success / failed / pending to test the UI.
   ================================================================ */
function simulatePayment() {
  return new Promise((resolve) => {
    setTimeout(() => {
      const outcomes = ['success', 'success', 'success', 'failed', 'pending'];
      const status   = outcomes[Math.floor(Math.random() * outcomes.length)];
      const ref      = 'TXN-' + Date.now().toString(36).toUpperCase();
      const messages = {
        success: 'Simulated approval — ready for real SDK.',
        failed:  'Simulated decline — ready for real SDK.',
        pending: 'Simulated pending — ready for real SDK.',
      };
      resolve({ status, message: messages[status], reference: ref });
    }, 2000); // 2-second fake delay to mimic a real API call
  });
}


/* ================================================================
   GENERATE REFERENCE — used when calling the real SDK
   ================================================================ */
function generateReference() {
  return 'ORDER-' + Date.now().toString(36).toUpperCase();
}
