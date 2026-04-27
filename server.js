// ============================================================
// server.js — PayTest Secure Backend
// This server is the ONLY thing that talks to the bank.
// Your secret credentials never leave this file.
// ============================================================

require('dotenv').config(); // loads your .env credentials

const express  = require('express');
const cors     = require('cors');
const fetch    = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CORS — tells the server to accept requests from your
// frontend website only. Replace the URL below with your
// actual Render frontend URL once it's deployed.
// ============================================================
app.use(cors({
  origin: process.env.FRONTEND_URL || '*'
}));

app.use(express.json());

// ============================================================
// CREDENTIALS — loaded from environment variables (Render dashboard)
// You will NEVER hardcode these here. They live in Render's
// "Environment" settings tab, which you'll fill in manually.
// ============================================================
const MERCHANT_ID    = process.env.MERCHANT_ID;
const MERCHANT_KEY   = process.env.MERCHANT_KEY;
const SHARED_KEY     = process.env.SHARED_KEY;
const AUTH_TOKEN     = process.env.AUTH_TOKEN;

// ============================================================
// BANK API URL — Production endpoint from the bank's PDF
// ============================================================
const BANK_CAPTURE_CONTEXT_URL =
  'https://merchant-order-token.bankaletihad.com/v1/payments/app2/capture-context';

// ============================================================
// HEALTH CHECK — visit /health to confirm the server is alive
// ============================================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'PayTest backend is running' });
});

// ============================================================
// STEP 1: GET CAPTURE CONTEXT
//
// Your frontend calls this endpoint first.
// This server then calls the bank securely using your
// secret credentials and returns a "capture context" —
// think of it as a one-time key that lets the card form load.
//
// Frontend calls:  POST /api/capture-context
// Body:            { amount: "0.10", currency: "JOD" }
// ============================================================
app.post('/api/capture-context', async (req, res) => {
  const { amount, currency, targetOrigin } = req.body;

  // Basic validation — make sure we received an amount
  if (!amount || !currency) {
    return res.status(400).json({ error: 'amount and currency are required' });
  }

  try {
    const bankResponse = await fetch(BANK_CAPTURE_CONTEXT_URL, {
      method: 'POST',
      headers: {
        'Authorization': AUTH_TOKEN,
        'Content-Type': 'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify({
        targetOrigins: [targetOrigin || process.env.FRONTEND_URL],
        totalAmount:   String(amount),
        currency:      currency,
      }),
    });

    const data = await bankResponse.json();

    if (!bankResponse.ok) {
      console.error('[Backend] Bank returned error:', data);
      return res.status(bankResponse.status).json({
        error: 'Bank API error',
        details: data,
      });
    }

    // Send the capture context back to the frontend
    res.json(data);

  } catch (err) {
    console.error('[Backend] Network error calling bank:', err.message);
    res.status(500).json({ error: 'Failed to reach bank API', message: err.message });
  }
});

// ============================================================
// STEP 2: FINALIZE PAYMENT
//
// After the customer fills in their card details, the bank
// gives the frontend a "transient token". The frontend sends
// it here, and this server finalizes the payment with the bank.
//
// Frontend calls:  POST /api/finalize-payment
// Body:            { transientToken: "...", amount, currency }
// ============================================================
app.post('/api/finalize-payment', async (req, res) => {
  const { transientToken, amount, currency, customerName, customerEmail } = req.body;

  if (!transientToken) {
    return res.status(400).json({ error: 'transientToken is required' });
  }

  try {
    // NOTE: The bank's PDF (Phase 4) says to send the token to your backend
    // and finalize the transaction. The exact finalize endpoint URL was not
    // included in the PDF provided. When the bank gives you the full API docs,
    // replace the URL and body below accordingly.
    //
    // Typical pattern:
    // POST https://merchant-order-token.bankaletihad.com/v1/payments/app2/finalize
    // with the transientToken and order details.
    //
    // For now this returns a placeholder so the frontend flow works end-to-end.

    console.log('[Backend] Finalizing payment for:', customerEmail, 'Amount:', amount, currency);
    console.log('[Backend] Transient token received:', transientToken ? 'YES' : 'NO');

    // ⬇️ REPLACE THIS BLOCK when the bank provides the finalize endpoint
    // ─────────────────────────────────────────────────────────────────────
    // const finalizeResponse = await fetch('BANK_FINALIZE_URL', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': AUTH_TOKEN,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     transientToken,
    //     orderInformation: {
    //       amountDetails: { totalAmount: String(amount), currency },
    //       billTo: { firstName: customerName, email: customerEmail },
    //     },
    //   }),
    // });
    // const result = await finalizeResponse.json();
    // ─────────────────────────────────────────────────────────────────────

    // Placeholder response until finalize endpoint is confirmed by the bank
    res.json({
      status: 'PENDING_FINALIZE_ENDPOINT',
      message: 'Token received by backend. Awaiting bank finalize endpoint details.',
    });

  } catch (err) {
    console.error('[Backend] Error finalizing payment:', err.message);
    res.status(500).json({ error: 'Failed to finalize payment', message: err.message });
  }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`[Backend] PayTest server running on port ${PORT}`);
  console.log(`[Backend] Health check: http://localhost:${PORT}/health`);
});
