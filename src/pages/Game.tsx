import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Zap, Volume2, VolumeX, Trophy, Share2, Play, Pause, Copy, Check, HelpCircle, LogOut, Wallet, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GameCanvas } from '@/components/GameCanvas';
import { LoginArea } from '@/components/auth/LoginArea';
import LoginDialog from '@/components/auth/LoginDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useGameScores, GAME_SCORE_KIND } from '@/hooks/useGameScores';
import { useToast } from '@/hooks/useToast';
import { useWallet } from '@/hooks/useWallet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  createInitialState,
  updateGame,
  shootBullet,
  type GameState,
} from '@/lib/gameEngine';
import { audioEngine } from '@/lib/audioEngine';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLNbitsPayment } from '@/hooks/useLNbitsPayment';
import QRCode from 'qrcode';
import { TankLives } from '@/components/TankLives';
import { WalletModal } from '@/components/WalletModal';

const GAME_COST_SATS = 21;
const RECIPIENT_LIGHTNING_ADDRESS = 'space.zappers@bank.weeksfamily.me';

// LNbits configuration from environment
const LNBITS_URL = import.meta.env.VITE_LNBITS_URL || '/lnbits';
const LNBITS_INVOICE_KEY = import.meta.env.VITE_LNBITS_INVOICE_KEY || '';

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
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTimeLeft, setFreePlayTimeLeft] = useState(60);
  const freePlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showLevelPopup, setShowLevelPopup] = useState(false);
  const [displayedLevel, setDisplayedLevel] = useState(1);
  const [playerFlashing, setPlayerFlashing] = useState(false);
  const [showLoginToSave, setShowLoginToSave] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [showAddAccountDialog, setShowAddAccountDialog] = useState(false);
  const gameLoopRef = useRef<number>();
  const previousScoreRef = useRef(0);
  const previousLevelRef = useRef(1);
  const previousInvaderCountRef = useRef(55);
  const previousLivesRef = useRef(3);

  const { user, picture, name } = useCurrentUser();
  const { logout } = useLoginActions();
  const queryClient = useQueryClient();
  const { mutate: publishEvent } = useNostrPublish();
  const { data: leaderboard, refetch: refetchLeaderboard } = useGameScores(50);
  const { toast } = useToast();
  const wallet = useWallet();
  const [highlightedScore, setHighlightedScore] = useState<number | null>(null);
  const [hasPublishedScore, setHasPublishedScore] = useState(false);

  // LNbits payment hook - creates invoices via LNURL and polls for payment
  const {
    createInvoice: createLNbitsInvoice,
    isPaid: paymentConfirmed,
    isPolling,
    reset: resetPayment,
  } = useLNbitsPayment({
    lightningAddress: RECIPIENT_LIGHTNING_ADDRESS,
    lnbitsUrl: LNBITS_URL,
    apiKey: LNBITS_INVOICE_KEY,
    onPaid: () => {
      setHasPaid(true);
      // Keep dialog open, just clear the invoice/QR
      setLightningInvoice(null);
      setQrCodeDataUrl(null);
    },
  });

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Any key unpauses the game
      if (hasStarted && gameState.isPaused && !gameState.gameOver) {
        e.preventDefault();
        setGameState((state) => {
          // Resume UFO sound if UFO is present
          if (state.bonusUFO && !isMuted) {
            audioEngine.startUfoSound();
          }
          // Resume music with correct tempo based on alive invaders
          if (!isMuted) {
            const aliveInvaders = state.invaders.filter((inv) => inv.isAlive).length;
            const speedRatio = aliveInvaders / 55;
            const tempo = Math.max(150, 500 * speedRatio);
            audioEngine.startMusic(tempo, state.level);
          }
          return { ...state, isPaused: false };
        });
        return;
      }

      if (['ArrowLeft', 'ArrowRight', 'a', 'd', ' ', 'Escape'].includes(e.key)) {
        e.preventDefault();
        setKeys((prev) => new Set(prev).add(e.key));

        // Escape key pauses the game and music
        if (e.key === 'Escape' && hasStarted && !gameState.gameOver && !gameState.isPaused) {
          setGameState((state) => ({ ...state, isPaused: true }));
          audioEngine.stopMusic();
          audioEngine.stopUfoSound();
        }

        if (e.key === ' ' && hasStarted && !gameState.gameOver && !gameState.isPaused) {
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
  }, [hasStarted, gameState.gameOver, gameState.isPaused, isMuted]);

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
          // Check if UFO was hit
          if (state.bonusUFO && !newState.bonusUFO) {
            audioEngine.playUfoHit();
          } else {
            audioEngine.playExplosion();
          }
          previousScoreRef.current = newState.score;
        }

        if (newState.level > previousLevelRef.current) {
          audioEngine.playLevelUp();
          audioEngine.setLevel(newState.level); // Update music to new level
          previousLevelRef.current = newState.level;
          // Show level popup
          setDisplayedLevel(newState.level);
          setShowLevelPopup(true);
          setTimeout(() => setShowLevelPopup(false), 2000);
        }

        // Handle UFO sound
        if (newState.ufoSoundPlaying && !audioEngine.isUfoPlaying) {
          audioEngine.startUfoSound();
        } else if (!newState.ufoSoundPlaying && audioEngine.isUfoPlaying) {
          audioEngine.stopUfoSound();
        }

        // Update music tempo based on invader count
        const aliveInvaders = newState.invaders.filter((inv) => inv.isAlive).length;
        if (aliveInvaders !== previousInvaderCountRef.current) {
          const speedRatio = aliveInvaders / 55; // Total invaders
          audioEngine.updateTempo(speedRatio);
          previousInvaderCountRef.current = aliveInvaders;
        }

        // Detect player hit (lost a life)
        if (newState.player.lives < previousLivesRef.current && !newState.gameOver) {
          audioEngine.playPlayerHit();
          previousLivesRef.current = newState.player.lives;
          // Flash the tank
          setPlayerFlashing(true);
          setTimeout(() => setPlayerFlashing(false), 500);
        }

        if (newState.gameOver && !state.gameOver) {
          audioEngine.playGameOver();
          audioEngine.stopMusic();
          audioEngine.stopUfoSound();
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

  // Control music during gameplay - only plays when game is active
  useEffect(() => {
    if (!hasStarted) {
      // Don't start music until game starts
      return;
    }

    if (gameState.gameOver) {
      audioEngine.stopMusic();
    } else if (!gameState.isPaused && !isMuted) {
      if (!audioEngine.isMusicPlaying) {
        // Calculate correct tempo based on alive invaders
        const aliveInvaders = gameState.invaders.filter((inv) => inv.isAlive).length;
        const speedRatio = aliveInvaders / 55;
        const tempo = Math.max(150, 500 * speedRatio);
        audioEngine.startMusic(tempo, gameState.level);
      }
    }

    return () => {
      audioEngine.stopMusic();
    };
  // Note: gameState.invaders intentionally not in deps to avoid re-running on every kill
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted, gameState.gameOver, gameState.isPaused, isMuted, gameState.level]);

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

        // Generate invoice via LNbits for WebLN payment
        const invoice = await createLNbitsInvoice(GAME_COST_SATS, 'Space Zappers - 21 sats to play');

        await window.webln.sendPayment(invoice);

        setHasPaid(true);
        setShowPayment(false);
        resetPayment();
        toast({
          title: 'Payment successful! ⚡',
          description: `Zapped ${GAME_COST_SATS} sats to play Space Zappers`,
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
      // Create invoice via LNbits API (also starts polling for payment)
      const invoice = await createLNbitsInvoice(GAME_COST_SATS, 'Space Zappers - 21 sats to play');

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
    resetPayment();
    toast({
      title: 'Payment confirmed! 🎮',
      description: 'Starting Space Zappers...',
    });
  };

  const startGame = (freeMode = false) => {
    // Always require payment for non-free games (unless already paid this session)
    if (!freeMode && !hasPaid) {
      setShowPayment(true);
      return;
    }

    // Consume the payment - next game will require new payment
    if (!freeMode && hasPaid) {
      setHasPaid(false);
    }

    if (freeMode) {
      setIsFreePlay(true);
      setFreePlayTimeLeft(60);
      // Start 1-minute countdown timer
      if (freePlayTimerRef.current) {
        clearInterval(freePlayTimerRef.current);
      }
      freePlayTimerRef.current = setInterval(() => {
        setFreePlayTimeLeft((prev) => {
          if (prev <= 1) {
            // Time's up - end the game
            if (freePlayTimerRef.current) {
              clearInterval(freePlayTimerRef.current);
              freePlayTimerRef.current = null;
            }
            audioEngine.stopMusic();
            audioEngine.stopUfoSound();
            audioEngine.playGameOver();
            setGameState((state) => ({ ...state, gameOver: true, player: { ...state.player, isAlive: false } }));
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setIsFreePlay(false);
      if (freePlayTimerRef.current) {
        clearInterval(freePlayTimerRef.current);
        freePlayTimerRef.current = null;
      }
    }

    // Initialize audio on game start (browsers require user interaction)
    audioEngine.initialize();
    audioEngine.stopUfoSound(); // Stop any lingering UFO sound from previous game

    setGameState(createInitialState());
    setHasStarted(true);
    setHasPublishedScore(false);
    setHighlightedScore(null);
    previousScoreRef.current = 0;
    previousLevelRef.current = 1;
    previousInvaderCountRef.current = 55;
    previousLivesRef.current = 3;

    // Show level 1 popup at start
    setDisplayedLevel(1);
    setShowLevelPopup(true);
    setTimeout(() => setShowLevelPopup(false), 2000);
  };

  const togglePause = () => {
    setGameState((state) => ({ ...state, isPaused: !state.isPaused }));
  };

  const toggleMute = () => {
    const muted = audioEngine.toggleMute();
    setIsMuted(muted);

    if (muted) {
      audioEngine.stopMusic();
    } else if (hasStarted && !gameState.gameOver && !gameState.isPaused) {
      // Only start music if game is actively playing
      audioEngine.startMusic();
    }
  };

  const publishScore = useCallback(() => {
    if (!user) {
      setShowLoginToSave(true);
      return;
    }

    const scoreToPublish = gameState.score;

    publishEvent({
      kind: GAME_SCORE_KIND,
      content: JSON.stringify({
        score: scoreToPublish,
        level: gameState.level,
        game: 'space-zapper',
      }),
      tags: [
        ['t', 'space-zapper'],
        ['t', 'game'],
        ['alt', `Space Zappers game score: ${scoreToPublish} points, level ${gameState.level}`],
      ],
    });

    toast({
      title: 'Score saved! 🎮',
      description: `Your score of ${scoreToPublish.toLocaleString()} has been added to the leaderboard`,
    });

    // Mark as published so user can't post again
    setHasPublishedScore(true);

    // Highlight this score and open leaderboard after a short delay to allow event propagation
    setHighlightedScore(scoreToPublish);
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['game-scores'] });
      refetchLeaderboard();
      setShowLeaderboard(true);
    }, 1000);
  }, [user, gameState.score, gameState.level, publishEvent, toast, queryClient, refetchLeaderboard]);

  const openShareDialog = useCallback(() => {
    const funMessages = [
      `🚀 Just zapped my way to ${gameState.score.toLocaleString()} points in Space Zappers! 👾⚡ Think you can beat that? Come defend Earth!\n\nhttps://www.spacezapper.com`,
      `👾 INVASION REPELLED! Scored ${gameState.score.toLocaleString()} points on level ${gameState.level}! The aliens didn't stand a chance ⚡🎮\n\nJoin the fight: https://www.spacezapper.com`,
      `⚡ ${gameState.score.toLocaleString()} points! I'm basically saving the galaxy one zap at a time 🛸 Can you do better?\n\nPlay now: https://www.spacezapper.com`,
      `🎮 Just dropped ${gameState.score.toLocaleString()} points in Space Zappers! Level ${gameState.level} cleared! Who's next? 👾\n\nhttps://www.spacezapper.com`,
    ];
    const randomMessage = funMessages[Math.floor(Math.random() * funMessages.length)];
    setShareMessage(randomMessage);
    setShowShareDialog(true);
  }, [gameState.score, gameState.level]);

  const publishSharePost = useCallback(() => {
    if (!user) {
      toast({
        title: 'Login required',
        description: 'Please login to share on Nostr',
        variant: 'destructive',
      });
      return;
    }

    publishEvent({
      kind: 1, // Regular note
      content: shareMessage,
      tags: [
        ['t', 'spacezappers'],
        ['t', 'gaming'],
        ['t', 'nostr'],
        ['r', 'https://www.spacezapper.com'],
      ],
    });

    toast({
      title: 'Posted to Nostr! 🚀',
      description: 'Your score has been shared with the world',
    });
    setShowShareDialog(false);
  }, [user, shareMessage, publishEvent, toast]);

  const copyShareMessage = useCallback(() => {
    navigator.clipboard.writeText(shareMessage);
    toast({
      title: 'Copied!',
      description: 'Message copied to clipboard',
    });
  }, [shareMessage, toast]);

  return (
    <div className="fixed inset-0 bg-black text-green-500 overflow-hidden flex flex-col">
      {/* CRT Effect Overlay */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,255,0,0.03)_50%)] bg-[length:100%_4px] z-50" />

      {/* Header Bar */}
      <div className="relative z-10 bg-black border-b-2 border-green-500 px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <h1 className="text-4xl font-bold tracking-wider text-green-400 drop-shadow-[0_0_10px_rgba(0,255,0,0.8)]">
            SPACE ZAPPERS
          </h1>
          <div className="bg-purple-500 text-white text-sm px-3 py-1 rounded font-bold">
            ⚡ 21 SATS
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="focus:outline-none">
                  <Avatar className="h-10 w-10 border-2 border-green-500 cursor-pointer hover:border-green-400 transition-colors">
                    <AvatarImage src={picture} alt={name || 'User'} />
                    <AvatarFallback className="bg-green-900 text-green-400">
                      {(name || user.pubkey.slice(0, 2)).toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-gray-900 border-green-500">
                <WalletModal>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="text-green-400 hover:text-green-300 hover:bg-green-900/20 cursor-pointer text-lg py-3"
                  >
                    <Wallet className="mr-2 h-5 w-5" />
                    Wallet Settings
                  </DropdownMenuItem>
                </WalletModal>
                <DropdownMenuItem
                  onClick={() => setShowAddAccountDialog(true)}
                  className="text-green-400 hover:text-green-300 hover:bg-green-900/20 cursor-pointer text-lg py-3"
                >
                  <UserPlus className="mr-2 h-5 w-5" />
                  Add Account
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20 cursor-pointer text-lg py-3"
                >
                  <LogOut className="mr-2 h-5 w-5" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <LoginArea className="max-w-48" />
          )}

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
          {isFreePlay && hasStarted && !gameState.gameOver && (
            <span className="text-yellow-400 text-sm animate-pulse">
              FREE PLAY - {freePlayTimeLeft}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-green-400">LIVES</span>
          <TankLives lives={gameState.player.lives} />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-green-400">LEVEL</span>
          <span className="text-white font-bold">{gameState.level}</span>
        </div>
      </div>

      {/* Game Canvas - Full Screen */}
      <div className="relative z-10 flex-1 flex items-center justify-center bg-black p-8">
        <div className="relative">
          <GameCanvas gameState={gameState} playerFlashing={playerFlashing} />

          {/* Overlays */}
          {!hasStarted && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center space-y-6">
                <div className="text-6xl animate-pulse font-bold" style={{ color: '#f7931a' }}>
                  INSERT BITCOIN
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
                    TRY FREE (1-MIN LIMIT)
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Level Popup */}
          {showLevelPopup && hasStarted && !gameState.gameOver && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <div className="text-center animate-pulse">
                <div className="text-8xl font-bold drop-shadow-[0_0_20px_rgba(247,147,26,0.8)]" style={{ color: '#f7931a' }}>
                  LEVEL {displayedLevel}
                </div>
                <div className="text-3xl text-green-400 mt-4">
                  GET READY!
                </div>
              </div>
            </div>
          )}

          {/* Pause Overlay */}
          {gameState.isPaused && hasStarted && !gameState.gameOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
              <div className="text-center space-y-6">
                <div className="text-7xl text-yellow-400 font-bold animate-pulse">
                  PAUSED
                </div>
                <div className="text-2xl text-green-400">
                  PRESS ANY KEY TO CONTINUE
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
                      TRY FREE (1-MIN)
                    </Button>
                  </div>
                  <div className="flex gap-4 justify-center">
                    <Button
                      onClick={publishScore}
                      variant="outline"
                      size="lg"
                      disabled={hasPublishedScore}
                      className={hasPublishedScore
                        ? "border-green-500 text-green-500 text-lg cursor-not-allowed opacity-70"
                        : "border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black text-lg"
                      }
                    >
                      <Trophy className="mr-2 h-5 w-5" />
                      {hasPublishedScore ? 'SAVED ✓' : 'SAVE TO LEADERBOARD'}
                    </Button>
                    <Button
                      onClick={openShareDialog}
                      variant="outline"
                      size="lg"
                      className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black text-lg"
                    >
                      <Share2 className="mr-2 h-5 w-5" />
                      SHARE
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 bg-black border-t-2 border-green-500 px-6 py-2 text-center text-green-600 text-lg">
        {hasStarted ? (
          <span>← → or A/D: MOVE | SPACE: SHOOT | ESC: PAUSE</span>
        ) : (
          <span>VIBED BY NINIMONK05 • POWERED BY LIGHTNING ⚡</span>
        )}
      </div>

      {/* Leaderboard Dialog */}
      <Dialog open={showLeaderboard} onOpenChange={(open) => {
        setShowLeaderboard(open);
        if (!open) setHighlightedScore(null);
      }}>
        <DialogContent className="bg-gray-900 border-green-500 text-green-500 max-w-md border-4">
          <DialogHeader>
            <DialogTitle className="text-3xl text-green-400 flex items-center gap-2">
              <Trophy className="h-8 w-8" />
              TOP SCORES
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-96 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-800 [&::-webkit-scrollbar-thumb]:bg-green-500 [&::-webkit-scrollbar-thumb]:rounded">
            {leaderboard && leaderboard.length > 0 ? (
              leaderboard.map((score, index) => {
                const isCurrentUser = user && score.event.pubkey === user.pubkey;
                const isHighlighted = isCurrentUser && highlightedScore === score.score;

                return (
                  <div
                    key={score.event.id}
                    className={`flex justify-between items-center p-2 rounded text-base transition-all ${
                      isHighlighted
                        ? 'bg-orange-500/30 border-2 border-orange-500 animate-pulse'
                        : isCurrentUser
                        ? 'bg-orange-900/20 border border-orange-500/50'
                        : index === 0
                        ? 'bg-yellow-900/30 border border-yellow-500'
                        : index === 1
                        ? 'bg-gray-700/30 border border-gray-400'
                        : index === 2
                        ? 'bg-orange-900/30 border border-orange-600'
                        : 'bg-gray-800/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-bold w-7 ${isHighlighted ? 'text-orange-400' : 'text-green-300'}`}>
                        #{index + 1}
                      </span>
                      <span className={`truncate max-w-[160px] ${isCurrentUser ? 'text-orange-400 font-bold' : 'text-white'}`}>
                        {isCurrentUser ? (name || 'YOU') : `${score.event.pubkey.slice(0, 8)}...`}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${isHighlighted ? 'text-orange-400' : 'text-green-400'}`}>
                        {score.score.toLocaleString()}
                      </div>
                      <div className="text-xs text-green-600">
                        LVL {score.level}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-green-600 py-12 text-lg">
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
            <DialogTitle className="text-3xl" style={{ color: '#f7931a' }}>INSERT BITCOIN</DialogTitle>
            <DialogDescription className="text-green-300 text-lg">
              SEND 21 SATS VIA LIGHTNING TO PLAY
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {hasPaid ? (
              <>
                <div className="text-center py-6">
                  <div className="text-7xl mb-4 font-mono text-green-400">[OK]</div>
                  <div className="text-4xl font-bold text-green-400">PAYMENT RECEIVED!</div>
                  <div className="text-xl text-green-300 mt-4">
                    21 SATS CONFIRMED
                  </div>
                </div>

                <Button
                  onClick={() => {
                    setShowPayment(false);
                    startGame();
                  }}
                  className="w-full bg-green-500 text-black hover:bg-green-400 font-bold text-2xl py-8"
                >
                  <Play className="mr-2 h-8 w-8" />
                  PLAY NOW
                </Button>
              </>
            ) : !lightningInvoice ? (
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
                          {isPolling ? 'Payment will be detected automatically' : 'Checking payment status...'}
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

      {/* Login to Save Score Dialog */}
      <Dialog open={showLoginToSave} onOpenChange={setShowLoginToSave}>
        <DialogContent className="bg-gray-900 border-green-500 text-green-500 max-w-md border-4">
          <DialogHeader>
            <DialogTitle className="text-3xl text-green-400 flex items-center gap-2">
              <Trophy className="h-8 w-8" />
              SAVE YOUR SCORE
            </DialogTitle>
            <DialogDescription className="text-green-300 text-lg">
              Login with Nostr to save your score of {gameState.score} to the leaderboard
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="text-center">
              <div className="text-5xl font-bold text-yellow-400 mb-2">
                {gameState.score.toLocaleString()}
              </div>
              <div className="text-xl text-green-600">
                LEVEL {gameState.level}
              </div>
            </div>
            <div className="flex flex-col items-center gap-4">
              <LoginArea className="w-full" />
              {user && (
                <Button
                  onClick={() => {
                    publishScore();
                    setShowLoginToSave(false);
                  }}
                  className="w-full bg-yellow-500 text-black hover:bg-yellow-400 font-bold text-xl py-6"
                >
                  <Trophy className="mr-2 h-6 w-6" />
                  SAVE TO LEADERBOARD
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share to Nostr Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="bg-gray-900 border-green-500 text-green-500 max-w-lg border-4">
          <DialogHeader>
            <DialogTitle className="text-3xl text-green-400 flex items-center gap-2">
              <Share2 className="h-8 w-8" />
              SHARE YOUR VICTORY
            </DialogTitle>
            <DialogDescription className="text-green-300 text-lg">
              Tell the world about your epic score!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <textarea
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
              className="w-full h-40 bg-black border-2 border-green-500 rounded-lg p-4 text-green-300 text-lg resize-none focus:outline-none focus:border-green-400"
              placeholder="Write your message..."
            />
            <div className="flex gap-3">
              {user ? (
                <Button
                  onClick={publishSharePost}
                  className="flex-1 bg-purple-600 text-white hover:bg-purple-500 font-bold text-xl py-6"
                >
                  <Zap className="mr-2 h-6 w-6" />
                  POST TO NOSTR
                </Button>
              ) : (
                <div className="flex-1 space-y-3">
                  <div className="text-center text-yellow-400 text-sm">
                    Login to post directly to Nostr
                  </div>
                  <LoginArea className="w-full" />
                </div>
              )}
              <Button
                onClick={copyShareMessage}
                variant="outline"
                className="border-green-500 text-green-500 hover:bg-green-500 hover:text-black font-bold text-lg py-6"
              >
                <Copy className="mr-2 h-5 w-5" />
                COPY
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Account Dialog */}
      <LoginDialog
        isOpen={showAddAccountDialog}
        onClose={() => setShowAddAccountDialog(false)}
        onLogin={() => setShowAddAccountDialog(false)}
      />
    </div>
  );
}
