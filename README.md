# Space Zappers

A retro Space Invaders arcade game powered by Bitcoin Lightning and Nostr.

Pay 21 sats to play. Publish your high scores to the decentralized leaderboard.

![Space Zappers Gameplay](docs/screenshot.jpeg)

## Features

- **Classic Arcade Gameplay** - Authentic Space Invaders mechanics with pixel art graphics and CRT screen effects
- **Lightning Payments** - Pay 21 sats per game via any Lightning wallet
- **Nostr Leaderboard** - Scores published to Nostr for a censorship-resistant, decentralized high score table
- **Retro Audio** - Chiptune-style music that speeds up as you eliminate invaders
- **Free Play Mode** - Try the game without paying (scores not publishable)

## How to Play

1. **Pay to Play** - Click "Pay 21 Sats" and scan the QR code with your Lightning wallet
2. **Move** - Arrow keys (← →) or A/D
3. **Shoot** - Spacebar
4. **Survive** - Destroy all invaders before they reach you
5. **Compete** - Login with Nostr to publish your score to the global leaderboard

## Tech Stack

- React 18 + TypeScript + Vite
- TailwindCSS + shadcn/ui
- Nostrify (Nostr protocol)
- LNbits (Lightning payments)
- HTML5 Canvas (game rendering)

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests and build
npm run test

# Production build
npm run build

# Deploy to Nostr
npm run deploy
```

## Lightning Payment Flow

1. Game generates invoice via Lightning address
2. Unique payment ID embedded in invoice comment
3. User pays with any Lightning wallet
4. LNbits webhook publishes confirmation to Nostr (kind 8550)
5. Game detects payment and starts automatically

See [WEBHOOK.md](./WEBHOOK.md) for webhook setup instructions.

## Nostr Integration

### Custom Event Kinds

| Kind | Purpose |
|------|---------|
| 8549 | Game scores (score, level, game identifier) |
| 8550 | Payment confirmations |

### Querying Scores

```javascript
const scores = await nostr.query([
  { kinds: [8549], '#t': ['space-zapper'], limit: 100 }
]);
```

See [NIP.md](./NIP.md) for full event specifications.

## Configuration

The game sends payments to a configured Lightning address. To use your own:

1. Edit `src/pages/Game.tsx`
2. Update `RECIPIENT_LIGHTNING_ADDRESS`
3. Set up LNbits webhook (see WEBHOOK.md)

## Project Structure

```
src/
├── pages/Game.tsx           # Main game page
├── components/
│   ├── GameCanvas.tsx       # Canvas rendering
│   └── ui/                  # shadcn/ui components
├── lib/
│   ├── gameEngine.ts        # Game logic
│   ├── audioEngine.ts       # Sound system
│   └── lightningInvoice.ts  # Invoice generation
└── hooks/
    ├── useGameScores.ts     # Leaderboard queries
    └── usePaymentConfirmation.ts  # Payment detection
```

## Credits

Vibed by ninimonk05 • Powered by Lightning

---

Built with [MKStack](https://soapbox.pub/mkstack)
