# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Space Zappers is a browser-based Space Invaders game built with React, TypeScript, and Nostr integration. Players pay 21 sats via Lightning to play, with scores published to Nostr for a decentralized leaderboard.

## Tech Stack

- **React 18** + **TypeScript** + **Vite**
- **TailwindCSS 3** + **shadcn/ui** (Radix-based components)
- **Nostrify** for Nostr protocol integration
- **TanStack Query** for data fetching/caching
- **Lightning payments** via LNbits webhook + invoice generation

## Commands

```bash
npm run dev      # Start game (8088) + score service (8089) concurrently
npm run build    # Production build (outputs to dist/)
npm run test     # Full validation: TypeScript check, ESLint, Vitest, then build
npm run deploy   # Build and deploy via nostr-deploy-cli
```

### Local Development Setup
1. Create `.env.local` with:
   ```
   GAME_NSEC=nsec1...
   VITE_GAME_PUBKEY=<64-char-hex-pubkey>
   ```
2. Run `npm run dev` - starts both frontend and score service
3. Access game at http://localhost:8088

Always run `npm run test` after making changes to validate TypeScript, linting, and tests pass.

## Architecture

### Core Game Files
- `src/pages/Game.tsx` - Main game page with payment flow, keyboard handling, game loop
- `src/components/GameCanvas.tsx` - Canvas rendering with pixel art sprites
- `src/lib/gameEngine.ts` - Game state, physics, collision detection
- `src/lib/audioEngine.ts` - Sound effects and background music

### Nostr Integration
- `src/components/NostrProvider.tsx` - Nostr context setup
- `src/hooks/useNostrPublish.ts` - Publish events to Nostr
- `src/hooks/useGameScores.ts` - Query leaderboard (kind 30762 via Gamestr)
- `src/hooks/usePaymentConfirmation.ts` - Listen for payment events (kind 8550)
- `src/components/LeaderboardEntry.tsx` - Displays player name via profile lookup

### Score Service
The `score-service/` directory contains a Node.js API that signs score events with the game's private key (GAME_NSEC). This prevents players from faking scores.

### Lightning Payment Flow
1. User clicks "Pay 21 sats" → generates invoice via `src/lib/lightningInvoice.ts`
2. Unique payment ID embedded in invoice comment (format: `szap_<timestamp>_<random>`)
3. LNbits webhook publishes kind 8550 event to Nostr on payment
4. Frontend subscribes to payment-id tag, auto-starts game when confirmed

### NWC (Nostr Wallet Connect)
- `src/hooks/useNWC.ts` - NWC connection management
- `src/hooks/useNWCContext.ts` - React context for NWC
- `src/hooks/useWallet.ts` - Unified wallet interface (NWC + WebLN)
- Connections stored in localStorage (`nwc-connections`, `nwc-active-connection`)
- Persists indefinitely until user disconnects or clears browser data
- Payment priority: NWC → WebLN → Manual invoice

### Event Kinds (see NIP.md)
- **Kind 30762**: Game scores ([Gamestr spec](https://gamestr.io/developers)) - signed by game, not player
- **Kind 8550**: Payment confirmations from webhook

### Provider Hierarchy (App.tsx)
QueryClientProvider → AppProvider → NostrProvider → NWCProvider → UnheadProvider

## Project Structure

```
src/
├── components/
│   ├── ui/              # shadcn/ui components
│   ├── auth/            # Login, signup, account switching
│   ├── comments/        # Nostr comment system
│   └── GameCanvas.tsx   # Game rendering
├── hooks/               # Custom React hooks (useNostr, useAuthor, etc.)
├── lib/                 # Utilities (gameEngine, audioEngine, etc.)
├── pages/               # Route components
└── contexts/            # React contexts
```

## ESLint Custom Rules

Custom rules in `eslint-rules/`:
- `no-inline-script` - Blocks inline `<script>` tags in HTML
- `no-placeholder-comments` - Flags "// In a real..." comments
- `require-webmanifest` - Ensures web manifest link exists

## Key Patterns

### Querying Game Scores
```typescript
// Scores are queried by game author pubkey (relays don't index #game tag)
const GAME_PUBKEY = import.meta.env.VITE_GAME_PUBKEY;
const events = await gamePool.query([{ kinds: [30762], authors: [GAME_PUBKEY], limit: 100 }], { signal });
```

### Publishing Scores (via API)
```typescript
// Client calls score service API, which signs with GAME_NSEC
await fetch('/api/publish-score', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ playerPubkey, score, level }),
});
```

### User Authentication
```typescript
const { user } = useCurrentUser();
if (!user) return <LoginArea />;
```

## Testing

- Uses Vitest with jsdom environment
- Wrap components in `TestApp` for required providers
- Test files: `*.test.tsx` alongside components

## Production URLs

- **Primary**: https://spacezappers.com (may become https://lnvaders.com in future)
- **Local dev**: http://localhost:8088
- **Container**: http://localhost:3001

## Docker Deployment

**IMPORTANT**: Do NOT deploy to production unless the user explicitly asks. The user often tests changes on localhost:8088 first before deploying.

The container is defined in the apps-stack docker-compose, not in this repository.

```bash
# Build the new image
cd /mnt/raid1/GitHub/black-panther/apps-stack
docker compose build space-zappers

# Stop and remove old container, then start new one
docker stop space-zappers && docker rm space-zappers
docker compose up -d space-zappers

# Verify container is running locally (should return 200)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001

# Verify production site is working
curl -s -o /dev/null -w "%{http_code}" https://spacezappers.com
```

The container runs on port 3001 and includes both nginx (serving static files) and the score-service API.

## Icon Generation

To regenerate the apple-touch-icon.png from the favicon.svg (e.g., after updating the favicon):

```bash
npx resvg-cli --fit-width 180 --fit-height 180 public/favicon.svg public/apple-touch-icon.png
```

## Important Notes

- Always read AGENTS.md for detailed Nostr integration patterns
- Check NIP.md for custom event kind specifications
- See WEBHOOK.md for LNbits webhook setup documentation
- See [docs/TROUBLESHOOTING.adoc](./docs/TROUBLESHOOTING.adoc) for known issues and solutions
- Game costs 21 sats to play (free mode available for testing)
- Scores only publishable for paid games
- Do not deploy to the docker container before we confirm it's working locally
- Use npm run test before committing and pushing (or deploying)
- When coming across a problem and finding a solution relevant to end users/administrators, document it in docs/TROUBLESHOOTING.adoc (single table with Problem/Solution columns)