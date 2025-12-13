import { useSeoMeta } from '@unhead/react';
import { Navigate } from 'react-router-dom';

const Index = () => {
  useSeoMeta({
    title: 'Space Zappers - Bitcoin Arcade Game',
    description: 'A retro Space Invaders arcade game. Pay 21 sats to play. Publish your high scores to the decentralized Nostr leaderboard.',
  });

  // Redirect to game page
  return <Navigate to="/game" replace />;
};

export default Index;
