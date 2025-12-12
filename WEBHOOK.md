# LNbits Webhook Configuration

This document explains how to configure the LNbits webhook for automatic payment detection in Space Zapper.

## Overview

Space Zapper uses Nostr events to track payment status. When a payment is received, LNbits calls a webhook that publishes a payment confirmation event to Nostr relays.

## Webhook Setup

### Step 1: Deploy Webhook Handler

You need to deploy a simple webhook handler that:
1. Receives payment notifications from LNbits
2. Publishes payment confirmation to Nostr relays

**Example webhook handler (Node.js):**

```javascript
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';

// Generate a secret key for the webhook (store securely!)
const WEBHOOK_SECRET_KEY = generateSecretKey();
const WEBHOOK_PUBKEY = getPublicKey(WEBHOOK_SECRET_KEY);

const RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.nostr.band',
  'wss://relay.damus.io'
];

const PAYMENT_CONFIRMATION_KIND = 8550;

export async function handleLNbitsWebhook(req, res) {
  const payment = req.body;
  
  // Extract payment details
  const { 
    payment_hash,
    payment_request, // The BOLT11 invoice
    amount,
    comment,
    checking_id,
    paid // Boolean indicating if paid
  } = payment;

  if (!paid) {
    return res.status(200).json({ status: 'pending' });
  }

  // Extract payment ID from comment
  const paymentIdMatch = comment?.match(/szap_\d+_[a-z0-9]+/);
  const paymentId = paymentIdMatch ? paymentIdMatch[0] : null;

  if (!paymentId) {
    return res.status(200).json({ status: 'no_payment_id' });
  }

  // Create Nostr event confirming payment
  const event = {
    kind: PAYMENT_CONFIRMATION_KIND,
    created_at: Math.floor(Date.now() / 1000),
    content: JSON.stringify({
      paymentId,
      invoice: payment_request,
      status: 'paid',
      amount,
      preimage: payment_hash,
      timestamp: Date.now(),
    }),
    tags: [
      ['t', 'space-zapper-payment'],
      ['payment-id', paymentId],
      ['status', 'paid'],
      ['alt', `Space Zapper payment confirmed: ${paymentId}`],
    ],
  };

  // Sign and publish to Nostr
  const signedEvent = finalizeEvent(event, WEBHOOK_SECRET_KEY);
  
  const pool = new SimplePool();
  await pool.publish(RELAYS, signedEvent);
  pool.close(RELAYS);

  console.log('Payment confirmation published to Nostr:', paymentId);
  
  res.status(200).json({ 
    status: 'published',
    paymentId,
    eventId: signedEvent.id
  });
}
```

### Step 2: Configure LNbits Pay Link

In your LNbits Pay Link settings:

1. **Webhook URL**: Enter your deployed webhook handler URL
   - Example: `https://your-domain.com/api/lnbits-webhook`

2. **Comment maximum characters**: Set to at least 100
   - This allows the payment ID to be included in the comment

3. **Enable nostr zaps**: Optional (checked in your screenshot)

### Step 3: Environment Variables

Set these in your webhook handler:

```bash
WEBHOOK_SECRET_KEY=<your_secret_key_hex>
NOSTR_RELAYS=wss://relay.ditto.pub,wss://relay.nostr.band,wss://relay.damus.io
```

## Alternative: Serverless Webhook

If you don't want to run a server, you can use serverless functions:

### Vercel/Netlify Function

```javascript
// api/lnbits-webhook.js
export default async function handler(req, res) {
  // Same logic as above
}
```

### Cloudflare Worker

```javascript
// worker.js
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const payment = await request.json()
  // Same logic as above
}
```

## Testing

### Test the webhook locally:

```bash
curl -X POST http://localhost:3000/api/lnbits-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "payment_hash": "test123",
    "payment_request": "lnbc...",
    "amount": 21000,
    "comment": "Space Zapper game payment - szap_1234567890_abc123",
    "checking_id": "test",
    "paid": true
  }'
```

### Verify on Nostr:

Use a Nostr client to check if the event was published:
- Kind: 8550
- Tag: `t: space-zapper-payment`
- Tag: `status: paid`

## Security Considerations

1. **Validate webhook origin**: Verify requests come from your LNbits instance
2. **Use HTTPS**: Always use HTTPS for webhook URL
3. **Store secret key securely**: Never commit secret keys to git
4. **Rate limiting**: Implement rate limiting on webhook endpoint
5. **Verify payment amount**: Check the amount matches expected value (21 sats)

## Webhook Payload Example

When payment is received, LNbits sends:

```json
{
  "payment_hash": "abc123...",
  "payment_request": "lnbc210n1...",
  "amount": 21000,
  "comment": "Space Zapper game payment - szap_1702410123_x7k2m",
  "checking_id": "internal_id",
  "paid": true,
  "time": 1702410123
}
```

Your webhook should extract the payment ID from the comment and publish a confirmation event.

## Frontend Integration

The Space Zapper frontend automatically:
1. Generates a unique payment ID when creating invoice
2. Includes payment ID in invoice comment
3. Subscribes to Nostr relays for payment confirmation events
4. Starts game automatically when payment confirmed

No additional frontend changes needed!
