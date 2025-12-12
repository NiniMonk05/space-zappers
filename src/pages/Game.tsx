import { useEffect, useState, useCallback, useRef } from 'react';
import { Zap, Volume2, VolumeX, Trophy, Share2, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { GameCanvas } from '@/components/GameCanvas';
import { LoginArea } from '@/components/auth/LoginArea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useGameScores, GAME_SCORE_KIND } from '@/hooks/useGameScores';
import { useToast } from '@/hooks/useToast';
import { useWallet } from '@/hooks/useWallet';
import {
  createInitialState,
  updateGame,
  shootBullet,
  type GameState,
} from '@/lib/gameEngine';
import { audioEngine } from '@/lib/audioEngine';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const GAME_COST_SATS = 21;
const RECIPIENT_NPUB = 'npub1sfpeyr9k5jms37q4900mw9q4vze4xwhdxd4avdxjml8rqgjkre8s4lcq9l';
const RECIPIENT_PUBKEY = '8243920cb6a4b708f8152bdfb7141560b3533aed336bd634d2dfce3022561e4f';

export function Game() {
  const [gameState, setGameState] = useState<GameState>(createInitialState());
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [hasPaid, setHasPaid] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const gameLoopRef = useRef<number>();
  const previousScoreRef = useRef(0);
  const previousLevelRef = useRef(1);
  const previousInvaderCountRef = useRef(55);

  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { data: leaderboard } = useGameScores(10);
  const { toast } = useToast();
  const wallet = useWallet();

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'd', ' '].includes(e.key)) {
        e.preventDefault();
        setKeys((prev) => new Set(prev).add(e.key));

        if (e.key === ' ' && hasStarted && !gameState.gameOver) {
          setGameState((state) => {
            const newState = shootBullet(state);
            if (newState !== state) {
              audioEngine.playShoot();
            }
            return newState;
          });
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      setKeys((prev) => {
        const next = new Set(prev);
        next.delete(e.key);
        return next;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [hasStarted, gameState.gameOver]);

  // Game loop
  useEffect(() => {
    if (!hasStarted || gameState.gameOver || gameState.isPaused) {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
      return;
    }

    const loop = () => {
      setGameState((state) => {
        const newState = updateGame(state, keys);

        // Play sound effects
        if (newState.score > previousScoreRef.current) {
          audioEngine.playExplosion();
          previousScoreRef.current = newState.score;
        }

        if (newState.level > previousLevelRef.current) {
          audioEngine.playLevelUp();
          previousLevelRef.current = newState.level;
        }

        // Update music tempo based on invader count
        const aliveInvaders = newState.invaders.filter((inv) => inv.isAlive).length;
        if (aliveInvaders !== previousInvaderCountRef.current) {
          const speedRatio = aliveInvaders / 55; // Total invaders
          audioEngine.updateTempo(speedRatio);
          previousInvaderCountRef.current = aliveInvaders;
        }

        if (newState.gameOver && !state.gameOver) {
          audioEngine.playGameOver();
          audioEngine.stopMusic();
        }

        return newState;
      });

      gameLoopRef.current = requestAnimationFrame(loop);
    };

    gameLoopRef.current = requestAnimationFrame(loop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [hasStarted, gameState.gameOver, gameState.isPaused, keys]);

  // Start music when game starts
  useEffect(() => {
    if (hasStarted && !gameState.gameOver && !gameState.isPaused) {
      audioEngine.initialize();
      audioEngine.startMusic();
    }

    return () => {
      audioEngine.stopMusic();
    };
  }, [hasStarted, gameState.gameOver, gameState.isPaused]);

  const handlePayment = async () => {
    if (!wallet) {
      toast({
        title: 'No wallet connected',
        description: 'Please connect a Lightning wallet to play',
        variant: 'destructive',
      });
      return;
    }

    setIsPaymentProcessing(true);

    try {
      await wallet.sendPayment({
        destination: RECIPIENT_PUBKEY,
        amount: GAME_COST_SATS,
        comment: 'Space Zapper game payment - 21 sats to play!',
      });

      setHasPaid(true);
      setShowPayment(false);
      toast({
        title: 'Payment successful! ⚡',
        description: `Zapped ${GAME_COST_SATS} sats to play Space Zapper`,
      });
    } catch (error) {
      toast({
        title: 'Payment failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsPaymentProcessing(false);
    }
  };

  const startGame = () => {
    if (!hasPaid) {
      setShowPayment(true);
      return;
    }

    setGameState(createInitialState());
    setHasStarted(true);
    previousScoreRef.current = 0;
    previousLevelRef.current = 1;
    previousInvaderCountRef.current = 55;
  };

  const togglePause = () => {
    setGameState((state) => ({ ...state, isPaused: !state.isPaused }));
  };

  const toggleMute = () => {
    const muted = audioEngine.toggleMute();
    setIsMuted(muted);
  };

  const publishScore = useCallback(() => {
    if (!user) {
      toast({
        title: 'Login required',
        description: 'Please login to publish your score',
        variant: 'destructive',
      });
      return;
    }

    publishEvent({
      kind: GAME_SCORE_KIND,
      content: JSON.stringify({
        score: gameState.score,
        level: gameState.level,
        game: 'space-zapper',
      }),
      tags: [
        ['t', 'space-zapper'],
        ['t', 'game'],
        ['alt', `Space Zapper game score: ${gameState.score} points, level ${gameState.level}`],
      ],
    });

    toast({
      title: 'Score published! 🎮',
      description: `Your score of ${gameState.score} has been shared on Nostr`,
    });
  }, [user, gameState.score, gameState.level, publishEvent, toast]);

  const shareScore = useCallback(() => {
    const text = `I just scored ${gameState.score} points on level ${gameState.level} in Space Zapper! ⚡🎮\n\nPlay at: ${window.location.origin}`;

    if (navigator.share) {
      navigator.share({ text });
    } else {
      navigator.clipboard.writeText(text);
      toast({
        title: 'Score copied!',
        description: 'Share link copied to clipboard',
      });
    }
  }, [gameState.score, gameState.level, toast]);

  return (
    <div className="min-h-screen bg-black text-green-500 font-mono">
      {/* CRT Effect Overlay */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,255,0,0.03)_50%)] bg-[length:100%_4px] z-50" />

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-8 space-y-4">
          <div className="relative inline-block">
            <h1 className="text-6xl md:text-8xl font-bold tracking-wider text-green-400 animate-pulse drop-shadow-[0_0_20px_rgba(0,255,0,0.8)]">
              SPACE ZAPPER
            </h1>
            <div className="absolute -top-2 -right-2 bg-yellow-400 text-black text-xs px-2 py-1 rounded font-bold animate-bounce">
              ⚡ 21 SATS
            </div>
          </div>
          <p className="text-xl text-green-300">
            Classic arcade action on the Lightning Network
          </p>

          {!user && (
            <div className="flex justify-center">
              <LoginArea className="max-w-60" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Game Area */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="bg-gray-900 border-green-500 border-2 shadow-[0_0_20px_rgba(0,255,0,0.3)]">
              <CardContent className="p-6">
                {/* Game Stats */}
                <div className="flex justify-between items-center mb-4 text-2xl">
                  <div className="flex items-center gap-4">
                    <span className="text-green-400">SCORE</span>
                    <span className="text-white font-bold">{gameState.score.toString().padStart(6, '0')}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-green-400">LIVES</span>
                    <div className="flex gap-2">
                      {Array.from({ length: gameState.player.lives }).map((_, i) => (
                        <div key={i} className="text-green-500 text-2xl">▲</div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-green-400">LEVEL</span>
                    <span className="text-white font-bold">{gameState.level}</span>
                  </div>
                </div>

                {/* Canvas */}
                <div className="flex justify-center bg-black p-4 rounded">
                  <GameCanvas gameState={gameState} />
                </div>

                {/* Controls */}
                <div className="mt-4 flex justify-between items-center">
                  <div className="text-sm text-green-300">
                    {hasStarted ? (
                      <>← → or A/D: Move | SPACE: Shoot</>
                    ) : (
                      <>Pay 21 sats to play!</>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={toggleMute}
                      className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black"
                    >
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                    {hasStarted && !gameState.gameOver && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={togglePause}
                        className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black"
                      >
                        {gameState.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Game Over / Start Screen */}
                {!hasStarted && (
                  <div className="mt-4 text-center space-y-4">
                    <Button
                      onClick={startGame}
                      size="lg"
                      className="bg-green-500 text-black hover:bg-green-400 font-bold text-xl px-8 py-6"
                    >
                      <Zap className="mr-2 h-6 w-6" />
                      PAY 21 SATS TO PLAY
                    </Button>
                  </div>
                )}

                {gameState.gameOver && (
                  <div className="mt-4 text-center space-y-4">
                    <div className="text-4xl text-red-500 font-bold animate-pulse mb-4">
                      GAME OVER
                    </div>
                    <div className="text-2xl text-white mb-4">
                      Final Score: {gameState.score}
                    </div>
                    <div className="flex justify-center gap-4">
                      <Button
                        onClick={startGame}
                        size="lg"
                        className="bg-green-500 text-black hover:bg-green-400 font-bold"
                      >
                        <Zap className="mr-2 h-5 w-5" />
                        PLAY AGAIN (21 sats)
                      </Button>
                      {user && (
                        <>
                          <Button
                            onClick={publishScore}
                            variant="outline"
                            size="lg"
                            className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black"
                          >
                            <Trophy className="mr-2 h-5 w-5" />
                            PUBLISH SCORE
                          </Button>
                          <Button
                            onClick={shareScore}
                            variant="outline"
                            size="lg"
                            className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black"
                          >
                            <Share2 className="mr-2 h-5 w-5" />
                            SHARE
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Leaderboard */}
          <div className="space-y-4">
            <Card className="bg-gray-900 border-green-500 border-2 shadow-[0_0_20px_rgba(0,255,0,0.3)]">
              <CardContent className="p-6">
                <h2 className="text-2xl font-bold text-green-400 mb-4 flex items-center gap-2">
                  <Trophy className="h-6 w-6" />
                  TOP SCORES
                </h2>
                <div className="space-y-2">
                  {leaderboard && leaderboard.length > 0 ? (
                    leaderboard.slice(0, 10).map((score, index) => (
                      <div
                        key={score.event.id}
                        className={`flex justify-between items-center p-2 rounded ${
                          index === 0
                            ? 'bg-yellow-900/30 border border-yellow-500'
                            : index === 1
                            ? 'bg-gray-700/30 border border-gray-400'
                            : index === 2
                            ? 'bg-orange-900/30 border border-orange-600'
                            : 'bg-gray-800/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-green-300 font-bold w-6">
                            #{index + 1}
                          </span>
                          <span className="text-white truncate max-w-[120px]">
                            {score.event.pubkey.slice(0, 8)}...
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-green-400 font-bold">
                            {score.score.toLocaleString()}
                          </div>
                          <div className="text-xs text-green-600">
                            L{score.level}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-green-600 py-8">
                      No scores yet. Be the first!
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-green-500 border-2 shadow-[0_0_20px_rgba(0,255,0,0.3)]">
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-green-400 mb-3">HOW TO PLAY</h3>
                <ul className="space-y-2 text-green-300 text-sm">
                  <li>• Pay 21 sats to start</li>
                  <li>• Destroy all invaders</li>
                  <li>• Earn points for each hit</li>
                  <li>• Music speeds up as you win</li>
                  <li>• Share your score on Nostr</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-green-600 text-sm">
          <p>Vibed with MKStack • Powered by Lightning ⚡</p>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="bg-gray-900 border-green-500 text-green-500">
          <DialogHeader>
            <DialogTitle className="text-2xl text-green-400">Pay to Play</DialogTitle>
            <DialogDescription className="text-green-300">
              Send 21 sats via Lightning to play Space Zapper
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center py-6">
              <div className="text-6xl mb-4">⚡</div>
              <div className="text-3xl font-bold text-yellow-400">21 SATS</div>
              <div className="text-sm text-green-600 mt-2">
                to {RECIPIENT_NPUB.slice(0, 16)}...
              </div>
            </div>
            {!wallet ? (
              <div className="text-center text-yellow-500">
                Please connect a Lightning wallet first
              </div>
            ) : (
              <Button
                onClick={handlePayment}
                disabled={isPaymentProcessing}
                className="w-full bg-green-500 text-black hover:bg-green-400 font-bold text-lg py-6"
              >
                {isPaymentProcessing ? (
                  <>Processing...</>
                ) : (
                  <>
                    <Zap className="mr-2 h-5 w-5" />
                    ZAP 21 SATS
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
