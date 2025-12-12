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
npm run dev      # Start dev server
npm run build    # Production build (outputs to dist/)
npm run test     # Full validation: TypeScript check, ESLint, Vitest, then build
npm run deploy   # Build and deploy via nostr-deploy-cli
```

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
- `src/hooks/useGameScores.ts` - Query leaderboard (kind 8549)
- `src/hooks/usePaymentConfirmation.ts` - Listen for payment events (kind 8550)

### Lightning Payment Flow
1. User clicks "Pay 21 sats" → generates invoice via `src/lib/lightningInvoice.ts`
2. Unique payment ID embedded in invoice comment (format: `szap_<timestamp>_<random>`)
3. LNbits webhook publishes kind 8550 event to Nostr on payment
4. Frontend subscribes to payment-id tag, auto-starts game when confirmed

### Custom Event Kinds (see NIP.md)
- **Kind 8549**: Game scores (score, level, game identifier)
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

### Querying Nostr Data
```typescript
const { nostr } = useNostr();
const events = await nostr.query([{ kinds: [8549], '#t': ['space-zapper'], limit: 100 }], { signal });
```

### Publishing Events
```typescript
const { mutate: publishEvent } = useNostrPublish();
publishEvent({ kind: 8549, content: JSON.stringify({ score, level }), tags: [...] });
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

## Important Notes

- Always read AGENTS.md for detailed Nostr integration patterns
- Check NIP.md for custom event kind specifications
- See WEBHOOK.md for LNbits webhook setup documentation
- Game costs 21 sats to play (free mode available for testing)
- Scores only publishable for paid games
