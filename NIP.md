# NIP-XX: Space Zapper Game Scores

## Abstract

This NIP defines a standard event kind for publishing game scores on Nostr, specifically for the Space Zapper (Space Invaders) game, but extensible to other arcade-style games.

## Event Kind

- `8549`: Game Score Event

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

## Reference Implementation

See the Space Zapper game implementation:
- Score publishing: `src/pages/Game.tsx`
- Score querying: `src/hooks/useGameScores.ts`
