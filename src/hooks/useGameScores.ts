import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

// Gamestr kind for game scores (addressable replaceable)
export const GAME_SCORE_KIND = 30762;
const GAME_ID = 'space-zappers';

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
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['game-scores', limit],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const events = await nostr.query(
        [{ kinds: [GAME_SCORE_KIND], '#game': [GAME_ID], limit: limit * 2 }],
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
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['user-best-score', pubkey],
    queryFn: async (c) => {
      if (!pubkey) return null;

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const events = await nostr.query(
        [{ kinds: [GAME_SCORE_KIND], '#game': [GAME_ID], '#p': [pubkey], limit: 100 }],
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
