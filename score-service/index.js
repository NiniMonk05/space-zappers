import http from 'node:http';
import WebSocket from 'ws';
import { nip19, finalizeEvent, SimplePool } from 'nostr-tools';
import { createInvoiceService, clientIp, intEnv, InvoiceError } from './invoices.js';

// Polyfill WebSocket for Node.js
globalThis.WebSocket = WebSocket;

const PORT = intEnv('PORT', 3002, { min: 1, max: 65535 });
const HOST = process.env.HOST?.trim() || '0.0.0.0';
const GAME_NSEC = process.env.GAME_NSEC;
const GAME_ID = 'space-zappers';
const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
];

const TRUSTED_PROXY_HOPS = intEnv('TRUSTED_PROXY_HOPS', 2);
const MAX_BODY_BYTES = 4096;

// Missing GAME_NSEC disables score publishing only, so invoices keep working
let privateKey;
let gamePubkey;
if (!GAME_NSEC) {
  console.warn('GAME_NSEC not set - score publishing disabled');
} else {
  try {
    const decoded = nip19.decode(GAME_NSEC);
    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec format');
    }
    privateKey = decoded.data;
    const { getPublicKey } = await import('nostr-tools/pure');
    gamePubkey = getPublicKey(privateKey);
    console.log('Game pubkey:', gamePubkey);
  } catch (err) {
    console.error('Failed to decode GAME_NSEC:', err.message);
    process.exit(1);
  }
}

const invoices = createInvoiceService({
  lnbitsUrl: process.env.LNBITS_URL,
  invoiceKey: process.env.LNBITS_INVOICE_KEY,
  minSats: intEnv('INVOICE_MIN_SATS', 21, { min: 1 }),
  maxSats: intEnv('INVOICE_MAX_SATS', 21, { min: 1 }),
});
if (invoices.minSats > invoices.maxSats) {
  console.error(`INVOICE_MIN_SATS (${invoices.minSats}) is greater than INVOICE_MAX_SATS (${invoices.maxSats})`);
  process.exit(1);
}
if (!invoices.configured) {
  console.warn('LNBITS_URL / LNBITS_INVOICE_KEY not set - invoice endpoints disabled');
}

const pool = new SimplePool();

// Parse JSON body from request
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Send JSON response; no CORS headers, the game calls this API same-origin via nginx
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Publish score to Nostr (kind 30762)
async function publishScore({ playerPubkey, score, level, difficulty, duration }) {
  const timestamp = Math.floor(Date.now() / 1000);

  // Create the event per Gamestr spec
  const event = {
    kind: 30762,
    created_at: timestamp,
    content: `Space Zappers score: ${score} points on level ${level}`,
    tags: [
      ['d', `${GAME_ID}:${playerPubkey}:${level}`],
      ['game', GAME_ID],
      ['score', score.toString()],
      ['p', playerPubkey],
      ['state', 'active'],
      ['level', level.toString()],
      ['t', 'arcade'],
      ['t', 'retro'],
      ['t', 'space-invaders'],
    ],
  };

  // Add optional tags
  if (difficulty) event.tags.push(['difficulty', difficulty]);
  if (duration) event.tags.push(['duration', duration.toString()]);

  // Sign the event with game's private key
  const signedEvent = finalizeEvent(event, privateKey);

  console.log('Publishing score event:', signedEvent.id);

  // Publish to relays with timeout
  let successful = 0;
  try {
    console.log('Connecting to relays...');
    const publishPromises = pool.publish(RELAYS, signedEvent);

    // Add timeout for each relay connection
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Publish timeout after 10s')), 10000)
    );

    const results = await Promise.race([
      Promise.allSettled(publishPromises),
      timeoutPromise.then(() => [])
    ]);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successful++;
        console.log('Relay accepted:', result.value);
      } else {
        console.log('Relay rejected:', result.reason?.message || result.reason);
      }
    }
  } catch (err) {
    console.error('Publish error:', err.message);
  }

  console.log(`Published to ${successful}/${RELAYS.length} relays`);

  return {
    eventId: signedEvent.id,
    pubkey: signedEvent.pubkey,
    relays: successful,
  };
}

function sendInvoiceError(res, err) {
  if (err instanceof InvoiceError) {
    sendJson(res, err.status, { error: err.message });
    return;
  }
  const status = err.message === 'Invalid JSON' || err.message === 'Request body too large' ? 400 : 500;
  if (status === 500) console.error('Invoice endpoint error:', err.message);
  sendJson(res, status, { error: status === 400 ? err.message : 'Internal error' });
}

// HTTP server
const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { status: 'ok', gamePubkey, invoices: invoices.configured });
    return;
  }

  // Create a Lightning invoice on the game wallet
  if (req.method === 'POST' && req.url === '/invoice') {
    const ip = clientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress, TRUSTED_PROXY_HOPS);
    try {
      const body = await parseBody(req);
      sendJson(res, 200, await invoices.create(body, ip));
    } catch (err) {
      sendInvoiceError(res, err);
    }
    return;
  }

  // Payment status for an invoice this service issued
  const statusMatch = req.method === 'GET' && req.url?.match(/^\/invoice\/([^/?#]+)$/);
  if (statusMatch) {
    const ip = clientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress, TRUSTED_PROXY_HOPS);
    try {
      sendJson(res, 200, await invoices.status(statusMatch[1], ip));
    } catch (err) {
      sendInvoiceError(res, err);
    }
    return;
  }

  // Publish score endpoint
  if (req.method === 'POST' && req.url === '/publish-score') {
    if (!privateKey) {
      sendJson(res, 503, { error: 'Score publishing is not configured' });
      return;
    }
    try {
      const body = await parseBody(req);

      // Validate required fields
      if (!body.playerPubkey || typeof body.score !== 'number' || typeof body.level !== 'number') {
        sendJson(res, 400, { error: 'Missing required fields: playerPubkey, score, level' });
        return;
      }

      // Validate playerPubkey is a valid 64-char hex string
      if (!/^[0-9a-f]{64}$/i.test(body.playerPubkey)) {
        sendJson(res, 400, { error: 'Invalid playerPubkey: must be 64-character hex string' });
        return;
      }

      // Validate score is reasonable (anti-cheat basic check)
      if (body.score < 0 || body.score > 10000000) {
        sendJson(res, 400, { error: 'Invalid score value' });
        return;
      }

      const result = await publishScore(body);
      sendJson(res, 200, { success: true, ...result });

    } catch (err) {
      console.error('Error publishing score:', err);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // 404 for other routes
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`Score service listening on ${HOST}:${PORT}`);
  console.log(`Game ID: ${GAME_ID}`);
  console.log(`Relays: ${RELAYS.join(', ')}`);
  console.log(`Invoices: ${invoices.configured ? `enabled (${invoices.minSats}-${invoices.maxSats} sats)` : 'disabled'}`);
});
