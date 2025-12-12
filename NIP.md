# NIP-XX: Space Zapper Game Events

## Abstract

This NIP defines standard event kinds for Space Zapper (Space Invaders) game, including game scores and Lightning payment confirmations.

## Event Kinds

- `8549`: Game Score Event
- `8550`: Payment Confirmation Event

## Event Format

Game score events are regular events (kind 8549) that contain the player's score and game metadata.

### Content

The `content` field contains a JSON object with the following structure:

```json
{
  "score": <number>,
  "level": <number>,
  "game": <string>
}
```

- `score`: The player's final score (required, must be >= 0)
- `level`: The level reached by the player (required, must be >= 1)
- `game`: Identifier for the game (required, e.g., "space-zapper")

### Tags

The following tags are RECOMMENDED:

- `t` - Game identifier tag (e.g., "space-zapper", "game")
- `alt` - A human-readable description of the score (NIP-31)

### Example Event

```json
{
  "kind": 8549,
  "created_at": 1734033600,
  "tags": [
    ["t", "space-zapper"],
    ["t", "game"],
    ["alt", "Space Zapper game score: 12340 points, level 5"]
  ],
  "content": "{\"score\":12340,\"level\":5,\"game\":\"space-zapper\"}",
  "pubkey": "...",
  "id": "...",
  "sig": "..."
}
```

## Motivation

Arcade games benefit from public leaderboards where players can compete and share their achievements. By standardizing game scores on Nostr, we enable:

1. Decentralized, censorship-resistant leaderboards
2. Cross-client score verification
3. Social sharing of gaming achievements
4. Proof of accomplishment tied to user identity

## Implementation

### Publishing Scores

Clients SHOULD:
- Validate that score and level are positive numbers before publishing
- Include descriptive `alt` tags for accessibility
- Use the `t` tag for game categorization to enable filtering

### Querying Scores

Clients can query game scores using:

```javascript
// Get all Space Zapper scores
const scores = await nostr.query([
  { kinds: [8549], '#t': ['space-zapper'], limit: 100 }
]);

// Get scores from a specific player
const userScores = await nostr.query([
  { kinds: [8549], authors: [pubkey], '#t': ['space-zapper'] }
]);
```

### Leaderboard Construction

Clients SHOULD:
1. Filter events to ensure valid JSON content
2. Validate that score and level fields exist and are positive numbers
3. Sort scores in descending order
4. Handle duplicate scores from the same user (show highest)

## Security Considerations

- Clients MUST validate event signatures to prevent score spoofing
- Scores are self-reported and should be treated as claims, not verified achievements
- Future versions could include game state verification or proof-of-work

## Extensions

Future improvements could include:
- Additional metadata (playtime, accuracy, etc.)
- Replay data for verification
- Tournament/challenge tags
- Cross-game compatibility

## Payment Confirmation Events (Kind 8550)

Payment confirmation events are published by LNbits webhooks when a Lightning payment is received.

### Content

The `content` field contains a JSON object:

```json
{
  "paymentId": <string>,
  "invoice": <string>,
  "status": "paid",
  "amount": <number>,
  "preimage": <string>,
  "timestamp": <number>
}
```

### Tags

The following tags are REQUIRED:

- `t` - Event tag: "space-zapper-payment"
- `payment-id` - Unique payment identifier
- `status` - Payment status: "paid"
- `alt` - Human-readable description (NIP-31)

### Example Event

```json
{
  "kind": 8550,
  "created_at": 1734033600,
  "tags": [
    ["t", "space-zapper-payment"],
    ["payment-id", "szap_1734033600_abc123"],
    ["status", "paid"],
    ["alt", "Space Zapper payment confirmed: szap_1734033600_abc123"]
  ],
  "content": "{\"paymentId\":\"szap_1734033600_abc123\",\"invoice\":\"lnbc...\",\"status\":\"paid\",\"amount\":21000,\"preimage\":\"abc123...\",\"timestamp\":1734033600000}",
  "pubkey": "...",
  "id": "...",
  "sig": "..."
}
```

## Payment Flow

1. User requests invoice with unique payment ID in comment
2. User pays invoice
3. LNbits calls webhook with payment details
4. Webhook publishes kind 8550 event to Nostr
5. Game client subscribes to payment-id tag
6. Game automatically starts when payment confirmed

## Reference Implementation

See the Space Zapper game implementation:
- Score publishing: `src/pages/Game.tsx`
- Score querying: `src/hooks/useGameScores.ts`
- Payment confirmation: `src/hooks/usePaymentConfirmation.ts`
- Webhook setup: `WEBHOOK.md`
