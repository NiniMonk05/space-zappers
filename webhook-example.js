/**
 * LNbits Webhook Handler for Space Zapper
 * 
 * This is a simple webhook handler that receives payment notifications from LNbits
 * and publishes payment confirmation events to Nostr relays.
 * 
 * Deploy this to Vercel, Netlify, Cloudflare Workers, or any Node.js server.
 * 
 * Installation:
 *   npm install nostr-tools
 * 
 * Environment Variables:
 *   WEBHOOK_SECRET_KEY - Hex-encoded Nostr private key for signing events
 *   NOSTR_RELAYS - Comma-separated list of relay URLs
 */

import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';

// Configuration
const WEBHOOK_SECRET_KEY = process.env.WEBHOOK_SECRET_KEY || generateSecretKey();
const WEBHOOK_PUBKEY = getPublicKey(WEBHOOK_SECRET_KEY);

const RELAYS = process.env.NOSTR_RELAYS 
  ? process.env.NOSTR_RELAYS.split(',')
  : [
      'wss://relay.ditto.pub',
      'wss://relay.nostr.band',
      'wss://relay.damus.io'
    ];

const PAYMENT_CONFIRMATION_KIND = 8550;

/**
 * Main webhook handler function
 * This can be deployed as a serverless function or API endpoint
 */
export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payment = req.body;
    
    console.log('Received LNbits webhook:', payment);

    // Extract payment details from LNbits webhook
    const { 
      payment_hash,
      payment_request, // The BOLT11 invoice
      amount,
      comment,
      checking_id,
      paid // Boolean indicating if paid
    } = payment;

    // Only process paid invoices
    if (!paid) {
      console.log('Invoice not yet paid, ignoring');
      return res.status(200).json({ status: 'pending' });
    }

    // Extract payment ID from comment
    // Payment ID format: szap_<timestamp>_<random>
    const paymentIdMatch = comment?.match(/szap_\d+_[a-z0-9]+/);
    const paymentId = paymentIdMatch ? paymentIdMatch[0] : null;

    if (!paymentId) {
      console.log('No payment ID found in comment, ignoring');
      return res.status(200).json({ status: 'no_payment_id' });
    }

    console.log('Payment confirmed for ID:', paymentId);

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

    // Sign the event
    const signedEvent = finalizeEvent(event, WEBHOOK_SECRET_KEY);
    
    console.log('Publishing payment confirmation to Nostr:', signedEvent.id);

    // Publish to Nostr relays
    const pool = new SimplePool();
    const publishPromises = pool.publish(RELAYS, signedEvent);
    
    // Wait for at least one relay to confirm
    await Promise.race(publishPromises);
    
    pool.close(RELAYS);

    console.log('Payment confirmation published successfully');
    
    return res.status(200).json({ 
      status: 'published',
      paymentId,
      eventId: signedEvent.id,
      relays: RELAYS.length
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

// For local testing
if (process.env.NODE_ENV !== 'production') {
  console.log('Webhook Public Key:', WEBHOOK_PUBKEY);
  console.log('Relays:', RELAYS);
}
