# Payment Detection Setup Guide

This guide will help you set up automatic payment detection for Space Zapper using LNbits webhooks and Nostr.

## How It Works

```
User Pays Invoice
       ↓
LNbits detects payment
       ↓
LNbits calls your webhook
       ↓
Webhook publishes to Nostr
       ↓
Game listens on Nostr
       ↓
Game starts automatically!
```

## Step 1: Deploy the Webhook

### Option A: Deploy to Vercel (Recommended)

1. **Create a new Vercel project:**
   ```bash
   npm install -g vercel
   cd /your/project
   vercel
   ```

2. **Install dependencies:**
   ```bash
   npm install nostr-tools
   ```

3. **Create API endpoint:**
   - Copy `webhook-example.js` to `api/lnbits-webhook.js`

4. **Set environment variables in Vercel:**
   - `WEBHOOK_SECRET_KEY`: Generate with: `node -e "console.log(require('nostr-tools').generateSecretKey().toString('hex'))"`
   - `NOSTR_RELAYS`: `wss://relay.ditto.pub,wss://relay.nostr.band,wss://relay.damus.io`

5. **Deploy:**
   ```bash
   vercel --prod
   ```

6. **Your webhook URL will be:**
   ```
   https://your-project.vercel.app/api/lnbits-webhook
   ```

### Option B: Deploy to Netlify

1. **Create `netlify/functions/lnbits-webhook.js`:**
   ```javascript
   const handler = require('../../webhook-example.js');
   exports.handler = handler;
   ```

2. **Deploy to Netlify**

3. **Your webhook URL:**
   ```
   https://your-site.netlify.app/.netlify/functions/lnbits-webhook
   ```

### Option C: Deploy to Cloudflare Workers

1. **Create worker with webhook-example.js code**
2. **Add environment variables**
3. **Deploy**

## Step 2: Configure LNbits Pay Link

1. **Go to your LNbits instance**
2. **Navigate to Extensions → Pay Links**
3. **Create or edit your Space Zapper pay link**

4. **In "Advanced options", set:**
   - **Webhook URL**: `https://your-webhook-url.com/api/lnbits-webhook`
   - **Comment maximum characters**: `100` (or higher)
   - This allows the payment ID to be included

5. **Save the pay link**

## Step 3: Update Your Lightning Address

In `src/pages/Game.tsx`, update:

```typescript
const RECIPIENT_LIGHTNING_ADDRESS = 'your-lnbits-address@yourdomain.com';
```

Or keep using `greyparrot7@primal.net` if that's your LNbits Lightning address.

## Step 4: Test the Integration

### Test 1: Generate a Payment ID

1. Open your game
2. Click "PAY 21 SATS TO PLAY"
3. Click "GET LIGHTNING INVOICE"
4. Note the payment ID in the console (format: `szap_1234567890_abc123`)

### Test 2: Check Webhook is Working

Pay the invoice and check:

1. **LNbits logs** - Should show webhook was called
2. **Webhook logs** - Should show payment received and event published
3. **Nostr relays** - Use a Nostr client to query:
   ```json
   {
     "kinds": [8550],
     "#t": ["space-zapper-payment"]
   }
   ```

### Test 3: Verify Auto-Detection

1. Generate invoice
2. See "⏳ WAITING FOR PAYMENT..." status
3. Pay the invoice
4. Within seconds: "✓ PAYMENT CONFIRMED!" appears
5. Game starts automatically!

## Troubleshooting

### Payment not detected?

1. **Check webhook URL is correct** in LNbits
2. **Check webhook logs** - Is it being called?
3. **Check Nostr relays** - Are events being published?
4. **Check browser console** - Any errors?
5. **Try manual confirmation** - "I PAID - START GAME" button

### Webhook not being called?

1. Verify webhook URL is accessible (try curl)
2. Check LNbits version supports webhooks
3. Check LNbits logs for errors

### Events not appearing on Nostr?

1. Check WEBHOOK_SECRET_KEY is set
2. Verify relays are accessible
3. Check relay policies (some relays require payment/whitelisting)

## Manual Testing

### Test webhook locally:

```bash
curl -X POST http://localhost:3000/api/lnbits-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "payment_hash": "test123456",
    "payment_request": "lnbc210n1...",
    "amount": 21000,
    "comment": "Space Zapper game - szap_1702410123_abc123",
    "checking_id": "test_id",
    "paid": true
  }'
```

Expected response:
```json
{
  "status": "published",
  "paymentId": "szap_1702410123_abc123",
  "eventId": "...",
  "relays": 3
}
```

## Security Checklist

- [ ] Webhook uses HTTPS
- [ ] WEBHOOK_SECRET_KEY is kept secret
- [ ] Webhook validates payment amounts
- [ ] Rate limiting enabled
- [ ] Webhook origin verification (optional)

## Need Help?

- Check `WEBHOOK.md` for detailed documentation
- Review `webhook-example.js` for implementation details
- Test with small amounts first (21 sats)

## Success!

Once configured, users will experience:
1. Click pay button
2. Generate invoice
3. Pay invoice
4. **Game automatically starts** - no manual confirmation needed!

The system detects payments in real-time using cryptographically signed Nostr events! 🎮⚡
