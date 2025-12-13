import { useQuery } from '@tanstack/react-query';
import { NPool, NRelay1 } from '@nostrify/nostrify';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

// Gamestr kind for game scores (addressable replaceable)
export const GAME_SCORE_KIND = 30762;
const GAME_ID = 'space-zappers';
// Game's pubkey (from env) - used to query scores by author
const GAME_PUBKEY = import.meta.env.VITE_GAME_PUBKEY;

// Game-specific relays for leaderboard data
const GAME_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
];

// Dedicated pool for game score queries
const gamePool = new NPool({
  open(url: string) {
    return new NRelay1(url);
  },
  reqRouter(filters: NostrFilter[]) {
    const routes = new Map<string, NostrFilter[]>();
    for (const url of GAME_RELAYS) {
      routes.set(url, filters);
    }
    return routes;
  },
  eventRouter() {
    return GAME_RELAYS;
  },
});

export interface GameScore {
  pubkey: string; // Player's pubkey (from p tag)
  score: number;
  level: number;
  timestamp: number;
  event: NostrEvent;
}

// Helper to get tag value
function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  const tag = event.tags.find(t => t[0] === tagName);
  return tag?.[1];
}

function validateGameScore(event: NostrEvent): boolean {
  if (event.kind !== GAME_SCORE_KIND) return false;

  const game = getTagValue(event, 'game');
  const score = getTagValue(event, 'score');
  const playerPubkey = getTagValue(event, 'p');

  return (
    game === GAME_ID &&
    score !== undefined &&
    !isNaN(parseInt(score, 10)) &&
    playerPubkey !== undefined
  );
}

function parseGameScore(event: NostrEvent): GameScore {
  const playerPubkey = getTagValue(event, 'p') || event.pubkey;
  const score = parseInt(getTagValue(event, 'score') || '0', 10);
  const level = parseInt(getTagValue(event, 'level') || '1', 10);

  return {
    pubkey: playerPubkey,
    score,
    level,
    timestamp: event.created_at,
    event,
  };
}

export function useGameScores(limit = 50) {
  return useQuery({
    queryKey: ['game-scores', limit],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      // Query by game author pubkey (relays don't index #game tag)
      const events = await gamePool.query(
        [{ kinds: [GAME_SCORE_KIND], authors: [GAME_PUBKEY], limit: limit * 2 }],
        { signal }
      );

      const validEvents = events.filter(validateGameScore);
      const scores = validEvents.map(parseGameScore);

      // Sort by score descending and take top N
      return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  });
}

export function useUserBestScore(pubkey?: string) {
  return useQuery({
    queryKey: ['user-best-score', pubkey],
    queryFn: async (c) => {
      if (!pubkey) return null;

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      // Query by game author and player pubkey
      const events = await gamePool.query(
        [{ kinds: [GAME_SCORE_KIND], authors: [GAME_PUBKEY], '#p': [pubkey], limit: 100 }],
        { signal }
      );

      const validEvents = events.filter(validateGameScore);

      if (validEvents.length === 0) return null;

      const scores = validEvents.map(parseGameScore);

      // Return the highest score
      return scores.reduce((best, current) =>
        current.score > best.score ? current : best
      );
    },
    enabled: !!pubkey,
  });
}
