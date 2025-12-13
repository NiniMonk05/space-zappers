# Space Zappers - Nostr Event Specification

Space Zappers uses the [Gamestr](https://gamestr.io) protocol for decentralized leaderboards.

## Score Events (Kind 30762)

Game scores follow the [Gamestr specification](https://gamestr.io/developers) using kind 30762 (addressable replaceable events).

### Event Structure

```json
{
  "kind": 30762,
  "pubkey": "<game-developer-pubkey>",
  "created_at": 1765623116,
  "content": "Space Zappers score: 15000 points on level 12",
  "tags": [
    ["d", "space-zappers:<player-pubkey>:<level>"],
    ["game", "space-zappers"],
    ["score", "15000"],
    ["p", "<player-pubkey>"],
    ["state", "active"],
    ["level", "12"],
    ["t", "arcade"],
    ["t", "retro"],
    ["t", "space-invaders"]
  ]
}
```

### Required Tags

| Tag | Description |
|-----|-------------|
| `d` | Unique identifier: `space-zappers:<player-pubkey>:<level>` |
| `game` | Game identifier: `space-zappers` |
| `score` | Numeric score value |
| `p` | Player's Nostr pubkey |
| `state` | Score state: `active` |

### Optional Tags

| Tag | Description |
|-----|-------------|
| `level` | Game level reached |
| `difficulty` | Difficulty setting |
| `duration` | Game duration in seconds |
| `t` | Genre tags (arcade, retro, etc.) |

## Architecture

Scores are signed by the **game's keypair**, not the player's. This prevents score spoofing.

```
Player achieves score
        │
        ▼
Game client sends to Score Service
        │
        ▼
Score Service signs with GAME_NSEC
        │
        ▼
Published to Nostr relays (kind 30762)
        │
        ▼
Appears on Gamestr leaderboard
```

## Querying Scores

```javascript
// Get all Space Zappers scores
const scores = await nostr.query([
  { kinds: [30762], '#game': ['space-zappers'], limit: 100 }
]);

// Get scores for a specific player
const playerScores = await nostr.query([
  { kinds: [30762], '#game': ['space-zappers'], '#p': [playerPubkey] }
]);
```

## Score Service API

The score service exposes a simple HTTP API:

### POST /publish-score

Publish a new score to Nostr.

**Request:**
```json
{
  "playerPubkey": "<player-nostr-pubkey>",
  "score": 15000,
  "level": 12,
  "duration": 180
}
```

**Response:**
```json
{
  "success": true,
  "eventId": "<nostr-event-id>",
  "pubkey": "<game-pubkey>",
  "relays": 4
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "gamePubkey": "<game-pubkey>"
}
```

## References

- [Gamestr Developer Docs](https://gamestr.io/developers)
- [Gamestr Leaderboards](https://gamestr.io)
- [Nostr Protocol](https://nostr.com)
