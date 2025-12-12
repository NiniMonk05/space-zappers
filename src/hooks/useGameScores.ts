import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

export const GAME_SCORE_KIND = 8549;

export interface GameScore {
  pubkey: string;
  score: number;
  level: number;
  timestamp: number;
  event: NostrEvent;
}

function validateGameScore(event: NostrEvent): boolean {
  if (event.kind !== GAME_SCORE_KIND) return false;

  try {
    const content = JSON.parse(event.content);
    return (
      typeof content.score === 'number' &&
      typeof content.level === 'number' &&
      content.score >= 0 &&
      content.level >= 1
    );
  } catch {
    return false;
  }
}

export function useGameScores(limit = 50) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['game-scores', limit],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);
      const events = await nostr.query(
        [{ kinds: [GAME_SCORE_KIND], limit }],
        { signal }
      );

      const validEvents = events.filter(validateGameScore);

      const scores: GameScore[] = validEvents.map((event) => {
        const content = JSON.parse(event.content);
        return {
          pubkey: event.pubkey,
          score: content.score,
          level: content.level,
          timestamp: event.created_at,
          event,
        };
      });

      // Sort by score descending
      return scores.sort((a, b) => b.score - a.score);
    },
  });
}

export function useUserBestScore(pubkey?: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['user-best-score', pubkey],
    queryFn: async (c) => {
      if (!pubkey) return null;

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);
      const events = await nostr.query(
        [{ kinds: [GAME_SCORE_KIND], authors: [pubkey], limit: 100 }],
        { signal }
      );

      const validEvents = events.filter(validateGameScore);

      if (validEvents.length === 0) return null;

      const scores: GameScore[] = validEvents.map((event) => {
        const content = JSON.parse(event.content);
        return {
          pubkey: event.pubkey,
          score: content.score,
          level: content.level,
          timestamp: event.created_at,
          event,
        };
      });

      // Return the highest score
      return scores.reduce((best, current) =>
        current.score > best.score ? current : best
      );
    },
    enabled: !!pubkey,
  });
}
