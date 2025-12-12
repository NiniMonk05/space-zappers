import { useEffect, useState, useCallback, useRef } from 'react';
import { Zap, Volume2, VolumeX, Trophy, Share2, Play, Pause, Copy, Check, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { getInvoiceFromLightningAddress } from '@/lib/lightningInvoice';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePaymentConfirmation } from '@/hooks/usePaymentConfirmation';
import { generatePaymentId } from '@/lib/paymentVerification';
import QRCode from 'qrcode';

const GAME_COST_SATS = 21;
const RECIPIENT_NPUB = 'npub1sfpeyr9k5jms37q4900mw9q4vze4xwhdxd4avdxjml8rqgjkre8s4lcq9l';
const RECIPIENT_PUBKEY = '8243920cb6a4b708f8152bdfb7141560b3533aed336bd634d2dfce3022561e4f';
const RECIPIENT_LIGHTNING_ADDRESS = 'space.zapper@bank.weeksfamily.me';

export function Game() {
  const [gameState, setGameState] = useState<GameState>(createInitialState());
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [hasPaid, setHasPaid] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [lightningInvoice, setLightningInvoice] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [invoiceCopied, setInvoiceCopied] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [currentPaymentId, setCurrentPaymentId] = useState<string | null>(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const gameLoopRef = useRef<number>();
  const previousScoreRef = useRef(0);
  const previousLevelRef = useRef(1);
  const previousInvaderCountRef = useRef(55);

  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { data: leaderboard } = useGameScores(10);
  const { toast } = useToast();
  const wallet = useWallet();

  // Listen for payment confirmation via Nostr webhook
  const { isConfirmed: paymentConfirmed } = usePaymentConfirmation({
    paymentId: currentPaymentId,
    onConfirmed: () => {
      setHasPaid(true);
      setShowPayment(false);
      setLightningInvoice(null);
      setQrCodeDataUrl(null);
      setCurrentPaymentId(null);
      toast({
        title: 'Payment confirmed! ⚡',
        description: 'Starting Space Zapper...',
      });
    },
  });

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

  // Start music when page loads
  useEffect(() => {
    audioEngine.initialize();
    audioEngine.startMusic();

    return () => {
      audioEngine.stopMusic();
    };
  }, []);

  // Control music during gameplay
  useEffect(() => {
    if (gameState.gameOver) {
      audioEngine.stopMusic();
    } else if (!gameState.isPaused && !isMuted) {
      if (!audioEngine['isMusicPlaying']) {
        audioEngine.startMusic();
      }
    }
  }, [gameState.gameOver, gameState.isPaused, isMuted]);

  const handleWalletPayment = async () => {
    if (!wallet) {
      toast({
        title: 'No wallet connected',
        description: 'Please connect a Lightning wallet or use invoice payment',
        variant: 'destructive',
      });
      return;
    }

    setIsPaymentProcessing(true);

    try {
      // Try to use WebLN if available
      if (typeof window.webln !== 'undefined') {
        await window.webln.enable();

        // Generate invoice for WebLN payment
        const invoice = await getInvoiceFromLightningAddress({
          lightningAddress: RECIPIENT_LIGHTNING_ADDRESS,
          amountSats: GAME_COST_SATS,
          comment: 'Space Zapper game payment - 21 sats to play!',
        });

        await window.webln.sendPayment(invoice);

        setHasPaid(true);
        setShowPayment(false);
        toast({
          title: 'Payment successful! ⚡',
          description: `Zapped ${GAME_COST_SATS} sats to play Space Zapper`,
        });
      } else {
        toast({
          title: 'WebLN not available',
          description: 'Please use the invoice payment option',
          variant: 'destructive',
        });
      }
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

  const handleGenerateInvoice = async () => {
    setIsPaymentProcessing(true);

    try {
      // Generate unique payment ID
      const paymentId = generatePaymentId();
      setCurrentPaymentId(paymentId);

      // Include payment ID in comment for webhook tracking
      const invoice = await getInvoiceFromLightningAddress({
        lightningAddress: RECIPIENT_LIGHTNING_ADDRESS,
        amountSats: GAME_COST_SATS,
        comment: `Space Zapper game - ${paymentId}`,
      });

      setLightningInvoice(invoice);

      // Generate QR code
      const qrDataUrl = await QRCode.toDataURL(invoice.toUpperCase(), {
        errorCorrectionLevel: 'L',
        margin: 2,
        width: 300,
        color: {
          dark: '#00ff00',
          light: '#000000',
        },
      });
      setQrCodeDataUrl(qrDataUrl);

      toast({
        title: 'Invoice generated! ⚡',
        description: 'Scan the QR code or copy the invoice to pay',
      });
    } catch (error) {
      toast({
        title: 'Failed to generate invoice',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsPaymentProcessing(false);
    }
  };

  const copyInvoice = async () => {
    if (!lightningInvoice) return;

    try {
      await navigator.clipboard.writeText(lightningInvoice);
      setInvoiceCopied(true);
      toast({
        title: 'Invoice copied!',
        description: 'Paste it in your Lightning wallet to pay',
      });

      setTimeout(() => {
        setInvoiceCopied(false);
      }, 2000);
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const confirmPayment = () => {
    setHasPaid(true);
    setShowPayment(false);
    setLightningInvoice(null);
    setQrCodeDataUrl(null);
    setCurrentPaymentId(null);
    toast({
      title: 'Payment confirmed! 🎮',
      description: 'Starting Space Zapper...',
    });
  };

  const startGame = (freeMode = false) => {
    if (!hasPaid && !freeMode) {
      setShowPayment(true);
      return;
    }

    if (freeMode) {
      setIsFreePlay(true);
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

    if (muted) {
      audioEngine.stopMusic();
    } else {
      audioEngine.startMusic();
    }
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
    <div className="fixed inset-0 bg-black text-green-500 overflow-hidden flex flex-col">
      {/* CRT Effect Overlay */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,255,0,0.03)_50%)] bg-[length:100%_4px] z-50" />

      {/* Header Bar */}
      <div className="relative z-10 bg-black border-b-2 border-green-500 px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <h1 className="text-4xl font-bold tracking-wider text-green-400 drop-shadow-[0_0_10px_rgba(0,255,0,0.8)]">
            SPACE ZAPPER
          </h1>
          <div className="bg-yellow-400 text-black text-sm px-3 py-1 rounded font-bold">
            ⚡ 21 SATS
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!user && <LoginArea className="max-w-48" />}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLeaderboard(true)}
            className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black text-lg"
          >
            <Trophy className="mr-2 h-4 w-4" />
            LEADERBOARD
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHowToPlay(true)}
            className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black text-lg"
          >
            <HelpCircle className="mr-2 h-4 w-4" />
            HOW TO PLAY
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={toggleMute}
            className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black"
          >
            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>

          {hasStarted && !gameState.gameOver && (
            <Button
              variant="outline"
              size="icon"
              onClick={togglePause}
              className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black"
            >
              {gameState.isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </Button>
          )}
        </div>
      </div>

      {/* Game Stats Bar */}
      <div className="relative z-10 bg-black border-b-2 border-green-500 px-6 py-2 flex justify-between items-center text-2xl">
        <div className="flex items-center gap-4">
          <span className="text-green-400">SCORE</span>
          <span className="text-white font-bold">{gameState.score.toString().padStart(6, '0')}</span>
          {isFreePlay && hasStarted && (
            <span className="text-yellow-400 text-sm animate-pulse">FREE PLAY</span>
          )}
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

      {/* Game Canvas - Full Screen */}
      <div className="relative z-10 flex-1 flex items-center justify-center bg-black p-8">
        <div className="relative">
          <GameCanvas gameState={gameState} />

          {/* Overlays */}
          {!hasStarted && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center space-y-6">
                <div className="text-6xl text-green-400 animate-pulse font-bold">
                  INSERT COIN
                </div>
                <div className="space-y-3">
                  <Button
                    onClick={() => startGame(false)}
                    size="lg"
                    className="bg-green-500 text-black hover:bg-green-400 font-bold text-2xl px-12 py-8 w-full"
                  >
                    <Zap className="mr-3 h-8 w-8" />
                    PAY 21 SATS TO PLAY
                  </Button>
                  <Button
                    onClick={() => startGame(true)}
                    variant="outline"
                    size="sm"
                    className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black text-sm px-6 py-3 w-full"
                  >
                    TRY FOR FREE
                  </Button>
                </div>
              </div>
            </div>
          )}

          {gameState.gameOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90">
              <div className="text-center space-y-6">
                <div className="text-6xl text-red-500 font-bold animate-pulse mb-6">
                  GAME OVER
                </div>
                <div className="text-4xl text-white mb-6">
                  FINAL SCORE: {gameState.score}
                </div>
                <div className="flex flex-col gap-4">
                  <div className="flex gap-4">
                    <Button
                      onClick={() => startGame(false)}
                      size="lg"
                      className="bg-green-500 text-black hover:bg-green-400 font-bold text-xl px-8 py-6"
                    >
                      <Zap className="mr-2 h-6 w-6" />
                      PLAY AGAIN (21 SATS)
                    </Button>
                    <Button
                      onClick={() => startGame(true)}
                      variant="outline"
                      size="lg"
                      className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black text-lg px-8 py-6"
                    >
                      TRY FREE AGAIN
                    </Button>
                  </div>
                  {user && !isFreePlay && (
                    <div className="flex gap-4">
                      <Button
                        onClick={publishScore}
                        variant="outline"
                        size="lg"
                        className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black text-lg"
                      >
                        <Trophy className="mr-2 h-5 w-5" />
                        PUBLISH SCORE
                      </Button>
                      <Button
                        onClick={shareScore}
                        variant="outline"
                        size="lg"
                        className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black text-lg"
                      >
                        <Share2 className="mr-2 h-5 w-5" />
                        SHARE
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 bg-black border-t-2 border-green-500 px-6 py-2 text-center text-green-600 text-lg">
        {hasStarted ? (
          <span>← → or A/D: MOVE | SPACE: SHOOT</span>
        ) : (
          <span>VIBED WITH MKSTACK • POWERED BY LIGHTNING ⚡</span>
        )}
      </div>

      {/* Leaderboard Dialog */}
      <Dialog open={showLeaderboard} onOpenChange={setShowLeaderboard}>
        <DialogContent className="bg-gray-900 border-green-500 text-green-500 max-w-md border-4">
          <DialogHeader>
            <DialogTitle className="text-3xl text-green-400 flex items-center gap-2">
              <Trophy className="h-8 w-8" />
              TOP SCORES
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {leaderboard && leaderboard.length > 0 ? (
              leaderboard.map((score, index) => (
                <div
                  key={score.event.id}
                  className={`flex justify-between items-center p-3 rounded text-xl ${
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
                    <span className="text-green-300 font-bold w-8">
                      #{index + 1}
                    </span>
                    <span className="text-white truncate max-w-[180px]">
                      {score.event.pubkey.slice(0, 12)}...
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 font-bold">
                      {score.score.toLocaleString()}
                    </div>
                    <div className="text-sm text-green-600">
                      LEVEL {score.level}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-green-600 py-12 text-xl">
                NO SCORES YET. BE THE FIRST!
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* How to Play Dialog */}
      <Dialog open={showHowToPlay} onOpenChange={setShowHowToPlay}>
        <DialogContent className="bg-gray-900 border-green-500 text-green-500 max-w-md border-4">
          <DialogHeader>
            <DialogTitle className="text-3xl text-green-400 flex items-center gap-2">
              <HelpCircle className="h-8 w-8" />
              HOW TO PLAY
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-xl text-green-300">
            <div className="flex items-start gap-3">
              <span className="text-yellow-400">⚡</span>
              <span>PAY 21 SATS TO START THE GAME</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-yellow-400">👾</span>
              <span>DESTROY ALL INVADERS TO WIN</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-yellow-400">🎯</span>
              <span>EARN POINTS FOR EACH HIT</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-yellow-400">🎵</span>
              <span>MUSIC SPEEDS UP AS YOU DESTROY INVADERS</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-yellow-400">🏆</span>
              <span>PUBLISH YOUR SCORE ON NOSTR</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-yellow-400">🔑</span>
              <span>USE ← → OR A/D TO MOVE</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-yellow-400">🚀</span>
              <span>PRESS SPACE TO SHOOT</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={(open) => {
        setShowPayment(open);
        if (!open) {
          setLightningInvoice(null);
          setQrCodeDataUrl(null);
          setInvoiceCopied(false);
        }
      }}>
        <DialogContent className="bg-gray-900 border-green-500 text-green-500 max-w-md border-4">
          <DialogHeader>
            <DialogTitle className="text-3xl text-green-400">INSERT COIN</DialogTitle>
            <DialogDescription className="text-green-300 text-lg">
              SEND 21 SATS VIA LIGHTNING TO PLAY
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!lightningInvoice ? (
              <>
                <div className="text-center py-6">
                  <div className="text-7xl mb-4">⚡</div>
                  <div className="text-5xl font-bold text-yellow-400">21 SATS</div>
                  <div className="text-lg text-green-600 mt-2">
                    TO {RECIPIENT_LIGHTNING_ADDRESS}
                  </div>
                </div>

                <div className="space-y-3">
                  {wallet && (
                    <Button
                      onClick={handleWalletPayment}
                      disabled={isPaymentProcessing}
                      className="w-full bg-green-500 text-black hover:bg-green-400 font-bold text-xl py-7"
                    >
                      {isPaymentProcessing ? (
                        <>PROCESSING...</>
                      ) : (
                        <>
                          <Zap className="mr-2 h-6 w-6" />
                          PAY WITH WALLET
                        </>
                      )}
                    </Button>
                  )}

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-green-700" />
                    </div>
                    <div className="relative flex justify-center text-base uppercase">
                      <span className="bg-gray-900 px-2 text-green-600">OR</span>
                    </div>
                  </div>

                  <Button
                    onClick={handleGenerateInvoice}
                    disabled={isPaymentProcessing}
                    variant="outline"
                    className="w-full border-green-500 text-green-500 hover:bg-green-500 hover:text-black font-bold text-xl py-7"
                  >
                    {isPaymentProcessing ? (
                      <>GENERATING...</>
                    ) : (
                      <>GET LIGHTNING INVOICE</>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center space-y-4">
                  {qrCodeDataUrl && (
                    <div className="flex justify-center">
                      <img
                        src={qrCodeDataUrl}
                        alt="Lightning Invoice QR Code"
                        className="rounded-lg border-4 border-green-500"
                      />
                    </div>
                  )}

                  <div className="text-lg text-green-400">
                    SCAN WITH YOUR LIGHTNING WALLET
                  </div>

                  {paymentConfirmed ? (
                    <div className="bg-green-900/30 border border-green-500 p-4 rounded animate-pulse">
                      <div className="text-2xl text-green-400 font-bold">
                        ✓ PAYMENT CONFIRMED!
                      </div>
                      <div className="text-sm text-green-300 mt-2">
                        Starting game...
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="bg-yellow-900/20 border border-yellow-600 p-3 rounded">
                        <div className="text-sm text-yellow-400 animate-pulse">
                          ⏳ WAITING FOR PAYMENT...
                        </div>
                        <div className="text-xs text-yellow-600 mt-1">
                          Payment will be detected automatically via webhook
                        </div>
                      </div>

                      <div className="bg-black p-3 rounded border border-green-700">
                        <div className="text-xs text-green-500 break-all">
                          {lightningInvoice.slice(0, 60)}...
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={copyInvoice}
                      variant="outline"
                      className="flex-1 border-green-500 text-green-500 hover:bg-green-500 hover:text-black text-lg py-5"
                    >
                      {invoiceCopied ? (
                        <>
                          <Check className="mr-2 h-5 w-5" />
                          COPIED!
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-5 w-5" />
                          COPY INVOICE
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="pt-4 border-t border-green-700">
                    <div className="text-sm text-green-600 mb-3">
                      AFTER PAYING, CLICK BELOW TO START
                    </div>
                    <Button
                      onClick={confirmPayment}
                      className="w-full bg-green-500 text-black hover:bg-green-400 font-bold text-xl py-6"
                    >
                      I PAID - START GAME
                    </Button>
                  </div>

                  <Button
                    onClick={() => {
                      setLightningInvoice(null);
                      setQrCodeDataUrl(null);
                    }}
                    variant="ghost"
                    className="w-full text-green-600 hover:text-green-400 text-lg"
                  >
                    ← BACK
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
