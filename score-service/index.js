import http from 'node:http';
import { nip19, finalizeEvent, SimplePool } from 'nostr-tools';

const PORT = process.env.PORT || 3002;
const GAME_NSEC = process.env.GAME_NSEC;
const GAME_ID = 'space-zappers';
const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
];

if (!GAME_NSEC) {
  console.error('GAME_NSEC environment variable is required');
  process.exit(1);
}

// Decode nsec to get private key
let privateKey;
let gamePubkey;
try {
  const decoded = nip19.decode(GAME_NSEC);
  if (decoded.type !== 'nsec') {
    throw new Error('Invalid nsec format');
  }
  privateKey = decoded.data;
  // Get pubkey from private key
  const { getPublicKey } = await import('nostr-tools/pure');
  gamePubkey = getPublicKey(privateKey);
  console.log('Game pubkey:', gamePubkey);
} catch (err) {
  console.error('Failed to decode GAME_NSEC:', err.message);
  process.exit(1);
}

const pool = new SimplePool();

// Parse JSON body from request
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
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

// Send JSON response
function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
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

  // Publish to relays
  const results = await Promise.allSettled(
    pool.publish(RELAYS, signedEvent)
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  console.log(`Published to ${successful}/${RELAYS.length} relays`);

  return {
    eventId: signedEvent.id,
    pubkey: signedEvent.pubkey,
    relays: successful,
  };
}

// HTTP server
const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { status: 'ok', gamePubkey });
    return;
  }

  // Publish score endpoint
  if (req.method === 'POST' && req.url === '/publish-score') {
    try {
      const body = await parseBody(req);

      // Validate required fields
      if (!body.playerPubkey || typeof body.score !== 'number' || typeof body.level !== 'number') {
        sendJson(res, 400, { error: 'Missing required fields: playerPubkey, score, level' });
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

server.listen(PORT, () => {
  console.log(`Score service listening on port ${PORT}`);
  console.log(`Game ID: ${GAME_ID}`);
  console.log(`Relays: ${RELAYS.join(', ')}`);
});
