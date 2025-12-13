import { useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';

/**
 * NostrSync - Syncs user's Nostr data
 *
 * This component runs globally to sync various Nostr data when the user logs in.
 * Currently syncs:
 * - NIP-65 relay list (kind 10002)
 * - NIP-05 relays (from .well-known/nostr.json)
 */
export function NostrSync() {
  const { nostr } = useNostr();
  const { user, nip05 } = useCurrentUser();
  const { config, updateConfig } = useAppContext();

  // Sync NIP-65 relay list
  useEffect(() => {
    if (!user) return;

    const syncRelaysFromNostr = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10002], authors: [user.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(5000) }
        );

        if (events.length > 0) {
          const event = events[0];

          // Only update if the event is newer than our stored data
          if (event.created_at > config.relayMetadata.updatedAt) {
            const fetchedRelays = event.tags
              .filter(([name]) => name === 'r')
              .map(([_, url, marker]) => ({
                url,
                read: !marker || marker === 'read',
                write: !marker || marker === 'write',
              }));

            if (fetchedRelays.length > 0) {
              console.log('Syncing relay list from NIP-65:', fetchedRelays);
              updateConfig((current) => ({
                ...current,
                relayMetadata: {
                  relays: fetchedRelays,
                  updatedAt: event.created_at,
                },
              }));
            }
          }
        }
      } catch (error) {
        console.error('Failed to sync relays from Nostr:', error);
      }
    };

    syncRelaysFromNostr();
  }, [user, config.relayMetadata.updatedAt, nostr, updateConfig]);

  // Sync NIP-05 relays (if user has a NIP-05 identifier)
  useEffect(() => {
    if (!user || !nip05) return;

    const syncRelaysFromNip05 = async () => {
      try {
        // Parse NIP-05 identifier (e.g., "user@domain.com")
        const [name, domain] = nip05.split('@');
        if (!name || !domain) {
          console.warn('Invalid NIP-05 format:', nip05);
          return;
        }

        // Fetch .well-known/nostr.json
        const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

        if (!response.ok) {
          console.warn('NIP-05 fetch failed:', response.status);
          return;
        }

        const data = await response.json();

        // Verify the pubkey matches
        if (data.names?.[name] !== user.pubkey) {
          console.warn('NIP-05 pubkey mismatch');
          return;
        }

        // Check for relays in the NIP-05 response
        const nip05Relays = data.relays?.[user.pubkey];
        if (Array.isArray(nip05Relays) && nip05Relays.length > 0) {
          console.log('Found relays in NIP-05:', nip05Relays);

          // Merge NIP-05 relays with existing relays (NIP-05 relays added if not already present)
          updateConfig((current) => {
            const existingUrls = new Set(current.relayMetadata.relays.map(r => r.url));
            const newRelays = nip05Relays
              .filter((url: string) => !existingUrls.has(url))
              .map((url: string) => ({ url, read: true, write: true }));

            if (newRelays.length > 0) {
              console.log('Adding NIP-05 relays:', newRelays);
              return {
                ...current,
                relayMetadata: {
                  ...current.relayMetadata,
                  relays: [...current.relayMetadata.relays, ...newRelays],
                },
              };
            }
            return current;
          });
        }
      } catch (error) {
        console.error('Failed to sync relays from NIP-05:', error);
      }
    };

    syncRelaysFromNip05();
  }, [user, nip05, updateConfig]);

  return null;
}