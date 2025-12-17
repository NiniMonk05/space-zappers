import { useEffect, useState, useCallback, useRef } from 'react';

// Android Chrome PWA install prompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
import { useQueryClient } from '@tanstack/react-query';
import { Zap, Volume2, VolumeX, Trophy, Share2, Play, Pause, Copy, Check, HelpCircle, LogOut, Wallet, UserPlus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GameCanvas } from '@/components/GameCanvas';
import { LeaderboardEntry } from '@/components/LeaderboardEntry';
import { LoginArea } from '@/components/auth/LoginArea';
import LoginDialog from '@/components/auth/LoginDialog';
import { TouchControls } from '@/components/TouchControls';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useOrientation } from '@/hooks/useOrientation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useGameScores } from '@/hooks/useGameScores';
import { useToast } from '@/hooks/useToast';
import { useWallet } from '@/hooks/useWallet';
import { useNWC } from '@/hooks/useNWCContext';
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
  const [gameEndReason, setGameEndReason] = useState<'lives' | 'timeout' | null>(null);
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
  const isPausedRef = useRef(false);

  const { user, picture, name } = useCurrentUser();
  const { logout } = useLoginActions();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const orientation = useOrientation();
  const [canvasScale, setCanvasScale] = useState(1);
  const [sideMargin, setSideMargin] = useState(0);
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const { mutate: publishEvent } = useNostrPublish();
  const { data: leaderboard, refetch: refetchLeaderboard, isLoading: leaderboardLoading, error: leaderboardError } = useGameScores(50, showLeaderboard);
  const { toast } = useToast();
  const wallet = useWallet();
  const { sendPayment, getActiveConnection } = useNWC();
  const [highlightedScore, setHighlightedScore] = useState<number | null>(null);
  const [hasPublishedScore, setHasPublishedScore] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  // Check standalone mode synchronously on first render
  const checkIsStandalone = () => {
    if (typeof window === 'undefined') return false;
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const fullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    return standalone || fullscreen || iosStandalone;
  };

  const [isStandalone] = useState(checkIsStandalone);
  const [pwaPromptDismissed, setPwaPromptDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('pwa-prompt-dismissed') === 'true';
  });
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Capture Android Chrome's beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  // Detect platform for PWA instructions
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(navigator.userAgent);
  // Skip PWA prompt only on localhost (DevTools emulation) - allow on local IPs for real device testing
  const isDevToolsEmulation = window.location.hostname === 'localhost';
  const isRealMobileDevice = (isIOS || isAndroid) && !isDevToolsEmulation;

  // Set up audio auto-unlock for iOS Safari
  useEffect(() => {
    audioEngine.setupAutoUnlock();
  }, []);

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
      // Space starts game from payment confirmation screen
      if (e.key === ' ' && showPayment && hasPaid) {
        e.preventDefault();
        setShowPayment(false);
        startGame();
        return;
      }

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
  }, [hasStarted, gameState.gameOver, gameState.isPaused, isMuted, showPayment, hasPaid]);

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
          audioEngine.setLevel(newState.level);
          previousLevelRef.current = newState.level;
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
          const speedRatio = aliveInvaders / 55;
          audioEngine.updateTempo(speedRatio);
          previousInvaderCountRef.current = aliveInvaders;
        }

        // Detect player hit (lost a life)
        if (newState.player.lives < previousLivesRef.current && !newState.gameOver) {
          audioEngine.playPlayerHit();
          previousLivesRef.current = newState.player.lives;
          setPlayerFlashing(true);
          setTimeout(() => setPlayerFlashing(false), 500);
        }

        if (newState.gameOver && !state.gameOver) {
          audioEngine.playGameOver();
          audioEngine.stopMusic();
          audioEngine.stopUfoSound();
          // Only set 'lives' reason if not already set (timeout sets it first)
          setGameEndReason((prev) => prev || 'lives');
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
      return;
    }

    if (gameState.gameOver) {
      audioEngine.stopMusic();
    } else if (!gameState.isPaused && !isMuted) {
      if (!audioEngine.isMusicPlaying) {
        const aliveInvaders = gameState.invaders.filter((inv) => inv.isAlive).length;
        const speedRatio = aliveInvaders / 55;
        const tempo = Math.max(150, 500 * speedRatio);
        audioEngine.startMusic(tempo, gameState.level);
      }
    }

    return () => {
      audioEngine.stopMusic();
    };
  }, [hasStarted, gameState.gameOver, gameState.isPaused, isMuted, gameState.level]);

  // Keep isPausedRef in sync for the free play timer
  useEffect(() => {
    isPausedRef.current = gameState.isPaused;
  }, [gameState.isPaused]);

  // Pause game when dialogs are open (useEffect ensures fresh state, avoids stale closures)
  useEffect(() => {
    if ((showLeaderboard || showHowToPlay) && hasStarted && !gameState.gameOver) {
      if (!gameState.isPaused) {
        setGameState((state) => ({ ...state, isPaused: true }));
      }
      // Always stop audio when dialogs are open (handles race conditions with game loop)
      audioEngine.stopMusic();
      audioEngine.stopUfoSound();
    }
  }, [showLeaderboard, showHowToPlay, hasStarted, gameState.gameOver, gameState.isPaused]);

  // Calculate canvas scale to fit viewport
  useEffect(() => {
    const calculateScale = () => {
      if (!gameContainerRef.current) return;
      const container = gameContainerRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      // Canvas is 800x600 plus border (8px total)
      const canvasWidth = 808;
      const canvasHeight = 608;

      // Calculate scale to fit, accounting for padding (smaller on mobile)
      const padding = isMobile ? 8 : 32;
      const scaleX = (containerWidth - padding) / canvasWidth;
      const scaleY = (containerHeight - padding) / canvasHeight;
      const scale = Math.min(scaleX, scaleY, 1.5); // Cap at 1.5x for large screens

      const finalScale = Math.max(0.3, scale); // Minimum 0.3x for very small screens
      setCanvasScale(finalScale);

      // Calculate side margins for touch control positioning
      const scaledCanvasWidth = canvasWidth * finalScale;
      const margin = (containerWidth - scaledCanvasWidth) / 2;
      setSideMargin(Math.max(0, margin));
    };

    // Initial calculation after layout settles
    calculateScale();
    // Recalculate after a short delay to catch late layout changes
    const timeoutId = setTimeout(calculateScale, 100);
    // Also use requestAnimationFrame for smoother initial sizing
    const rafId = requestAnimationFrame(calculateScale);

    window.addEventListener('resize', calculateScale);
    return () => {
      window.removeEventListener('resize', calculateScale);
      clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);
    };
  }, [orientation, pwaPromptDismissed, isMobile]);

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
      // Generate invoice via LNbits
      const invoice = await createLNbitsInvoice(GAME_COST_SATS, 'Space Zappers - 21 sats to play');

      // Try NWC first if available
      const nwcConnection = getActiveConnection();
      if (nwcConnection && nwcConnection.isConnected) {
        try {
          await sendPayment(nwcConnection, invoice);
          setHasPaid(true);
          resetPayment();
          toast({
            title: 'Payment successful! ⚡',
            description: `Paid ${GAME_COST_SATS} sats via NWC to play Space Zappers`,
          });
          return;
        } catch (nwcError) {
          console.error('NWC payment failed:', nwcError);
          // Fall through to try WebLN
        }
      }

      // Try WebLN if NWC didn't work
      if (typeof window.webln !== 'undefined') {
        await window.webln.enable();
        await window.webln.sendPayment(invoice);

        setHasPaid(true);
        resetPayment();
        toast({
          title: 'Payment successful! ⚡',
          description: `Paid ${GAME_COST_SATS} sats to play Space Zappers`,
        });
        return;
      }

      // Neither NWC nor WebLN available
      toast({
        title: 'No wallet available',
        description: 'Please use the invoice payment option or connect a wallet',
        variant: 'destructive',
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
    } catch {
      toast({
        title: 'Failed to copy',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
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
        if (isPausedRef.current) return; // Skip countdown when paused
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
            setGameEndReason('timeout');
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

    // Reset game state
    setGameState(createInitialState());
    setHasStarted(true);
    setHasPublishedScore(false);
    setHighlightedScore(null);
    setGameEndReason(null);
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
    setGameState((state) => {
      if (!state.isPaused) {
        // Pausing - stop audio
        audioEngine.stopMusic();
        audioEngine.stopUfoSound();
      }
      return { ...state, isPaused: !state.isPaused };
    });
  };

  // Pause the game when opening a dialog (if game is running)
  const pauseForDialog = () => {
    if (hasStarted && !gameState.gameOver && !gameState.isPaused) {
      setGameState((state) => ({ ...state, isPaused: true }));
      audioEngine.stopMusic();
      audioEngine.stopUfoSound();
    }
  };

  const toggleMute = () => {
    const muted = audioEngine.toggleMute();
    setIsMuted(muted);

    if (muted) {
      audioEngine.stopMusic();
    } else if (hasStarted && !gameState.gameOver && !gameState.isPaused) {
      audioEngine.startMusic();
    }
  };

  // Touch control handlers for mobile
  const handleTouchLeft = useCallback((pressed: boolean) => {
    setKeys((prev) => {
      const next = new Set(prev);
      if (pressed) {
        next.add('ArrowLeft');
      } else {
        next.delete('ArrowLeft');
      }
      return next;
    });
  }, []);

  const handleTouchRight = useCallback((pressed: boolean) => {
    setKeys((prev) => {
      const next = new Set(prev);
      if (pressed) {
        next.add('ArrowRight');
      } else {
        next.delete('ArrowRight');
      }
      return next;
    });
  }, []);

  const handleTouchFire = useCallback(() => {
    if (hasStarted && !gameState.gameOver && !gameState.isPaused) {
      setGameState((state) => {
        const newState = shootBullet(state);
        if (newState !== state) {
          audioEngine.playShoot();
        }
        return newState;
      });
    }
  }, [hasStarted, gameState.gameOver, gameState.isPaused]);

  const publishScore = useCallback(async () => {
    if (!user) {
      setShowLoginToSave(true);
      return;
    }

    if (isPublishing || hasPublishedScore) return;

    setIsPublishing(true);
    const scoreToPublish = gameState.score;

    try {
      // Call score service API to publish via Gamestr (kind 30762)
      const response = await fetch('/api/publish-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerPubkey: user.pubkey,
          score: scoreToPublish,
          level: gameState.level,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to publish score');
      }

      toast({
        title: 'Score saved! 🎮',
        description: `Your score of ${scoreToPublish.toLocaleString()} has been added to the leaderboard`,
      });

      // Mark as published so user can't post again
      setHasPublishedScore(true);

      // Highlight this score and open leaderboard after a short delay
      setHighlightedScore(scoreToPublish);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['game-scores'] });
        refetchLeaderboard();
        setShowLeaderboard(true);
      }, 1000);
    } catch (err) {
      toast({
        title: 'Failed to save score',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsPublishing(false);
    }
  }, [user, gameState.score, gameState.level, toast, queryClient, refetchLeaderboard, isPublishing, hasPublishedScore]);

  const openShareDialog = useCallback(() => {
    const funMessages = [
      `🚀 Just zapped my way to ${gameState.score.toLocaleString()} points in Space Zappers! 👾⚡ Think you can beat that? Come defend Earth!\n\nhttps://www.spacezappers.com\n\n#SpaceZappers #SpaceInvaders`,
      `👾 INVASION REPELLED! Scored ${gameState.score.toLocaleString()} points on level ${gameState.level}! The aliens didn't stand a chance ⚡🎮\n\nJoin the fight: https://www.spacezappers.com\n\n#SpaceZappers #SpaceInvaders`,
      `⚡ ${gameState.score.toLocaleString()} points! I'm basically saving the galaxy one zap at a time 🛸 Can you do better?\n\nPlay now: https://www.spacezappers.com\n\n#SpaceZappers #SpaceInvaders`,
      `🎮 Just dropped ${gameState.score.toLocaleString()} points in Space Zappers! Level ${gameState.level} cleared! Who's next? 👾\n\nhttps://www.spacezappers.com\n\n#SpaceZappers #SpaceInvaders`,
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
        ['r', 'https://www.spacezappers.com'],
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

  // Show rotation prompt for mobile portrait mode
  if (isMobile && orientation === 'portrait') {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-green-500 p-6" style={{ paddingBottom: 'env(safe-area-inset-bottom)', minHeight: '100dvh' }}>
        <RotateCcw className="w-20 h-20 mb-6 animate-pulse text-green-400" />
        <h1 className="text-2xl font-bold text-center mb-3">ROTATE YOUR DEVICE</h1>
        <p className="text-lg text-green-300 text-center">
          Turn your device sideways to play
        </p>
      </div>
    );
  }

  // Show PWA install prompt for real mobile devices not in standalone mode
  if (isRealMobileDevice && !isStandalone && !pwaPromptDismissed) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-green-500 p-6">
        <div className="text-6xl mb-6">📱</div>
        <h1 className="text-2xl font-bold text-center mb-3 text-purple-400">ADD TO HOME SCREEN</h1>
        <p className="text-lg text-green-300 text-center mb-6">
          For the best fullscreen experience
        </p>

        <div className="bg-purple-900/50 border border-purple-500 rounded-lg p-5 mb-8 max-w-sm">
          <p className="text-purple-200 text-base text-center">
            {isIOS ? (
              <>Tap <strong>Share</strong> <span className="text-xl">⬆</span> then <strong>Add to Home Screen</strong></>
            ) : isAndroid ? (
              <>Tap <strong>⋮ Menu</strong> then <strong>Add to Home Screen</strong> or <strong>Install App</strong></>
            ) : (
              <>Use your browser menu to <strong>Add to Home Screen</strong> or <strong>Install</strong></>
            )}
          </p>
        </div>

        <button
          onClick={() => {
            audioEngine.initialize(); // Unlock audio on this tap
            setPwaPromptDismissed(true);
            sessionStorage.setItem('pwa-prompt-dismissed', 'true');
          }}
          className="text-green-600 hover:text-green-400 text-sm underline"
        >
          Continue without installing →
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black text-green-500 overflow-hidden flex flex-col">
      {/* CRT Effect Overlay */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,255,0,0.03)_50%)] bg-[length:100%_4px] z-50" />

      {/* Header Bar */}
      <div
        className={`relative z-10 bg-black border-b-2 border-green-500 flex justify-between items-center ${isMobile ? 'px-4 py-1' : 'px-6 py-3'}`}
        style={isMobile ? { paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' } : undefined}
      >
        <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-6'}`}>
          <h1 className={`font-bold tracking-wider text-green-400 drop-shadow-[0_0_10px_rgba(0,255,0,0.8)] ${isMobile ? 'text-xl' : 'text-4xl'}`}>
            SPACE ZAPPERS
          </h1>
          <div className={`bg-purple-500 text-white rounded font-bold ${isMobile ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'}`}>
            ⚡ 21 SATS
          </div>
        </div>

        <div className={`flex items-center ${isMobile ? 'gap-1' : 'gap-2'}`}>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="focus:outline-none">
                  <Avatar className={`border-2 border-green-500 cursor-pointer hover:border-green-400 transition-colors ${isMobile ? 'h-6 w-6' : 'h-9 w-9'}`}>
                    <AvatarImage src={picture} alt={name || 'User'} />
                    <AvatarFallback className="bg-green-900 text-green-400 text-xs">
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
                  onClick={() => { pauseForDialog(); setShowAddAccountDialog(true); }}
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
            <LoginArea isMobile={isMobile} onDialogOpen={pauseForDialog} />
          )}

          <Button
            variant="outline"
            onClick={() => setShowLeaderboard(true)}
            className={`border-green-500 text-green-500 hover:bg-green-500 hover:text-black ${isMobile ? 'h-6 px-2 text-xs' : 'h-9 px-3'}`}
          >
            <Trophy className={isMobile ? 'mr-1 h-3 w-3' : 'mr-2 h-4 w-4'} />
            LEADERBOARD
          </Button>

          <Button
            variant="outline"
            onClick={() => setShowHowToPlay(true)}
            className={`border-green-500 text-green-500 hover:bg-green-500 hover:text-black ${isMobile ? 'h-6 px-2 text-xs' : 'h-9 px-3'}`}
          >
            <HelpCircle className={isMobile ? 'mr-1 h-3 w-3' : 'mr-2 h-4 w-4'} />
            HOW TO PLAY
          </Button>

          <Button
            variant="outline"
            onClick={toggleMute}
            className={`p-0 border-green-500 text-green-500 hover:bg-green-500 hover:text-black ${isMobile ? 'h-6 w-6' : 'h-9 w-9'}`}
          >
            {isMuted ? <VolumeX className={isMobile ? 'h-3 w-3' : 'h-4 w-4'} /> : <Volume2 className={isMobile ? 'h-3 w-3' : 'h-4 w-4'} />}
          </Button>

          {hasStarted && !gameState.gameOver && !isMobile && (
            <Button
              variant="outline"
              onClick={togglePause}
              className="h-9 w-9 p-0 border-green-500 text-green-500 hover:bg-green-500 hover:text-black"
            >
              {gameState.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Small PWA reminder banner - shows after dismissing fullscreen prompt */}
      {isRealMobileDevice && !isStandalone && pwaPromptDismissed && (
        <button
          onClick={async () => {
            if (installPrompt) {
              // Android Chrome - trigger native install prompt
              await installPrompt.prompt();
              const result = await installPrompt.userChoice;
              if (result.outcome === 'accepted') {
                setInstallPrompt(null);
              }
            }
          }}
          className={`absolute top-12 right-2 z-20 bg-purple-900/90 border border-purple-500 rounded px-2 py-1 text-purple-200 text-[10px] max-w-[160px] text-left ${installPrompt ? 'cursor-pointer hover:bg-purple-800' : 'cursor-default'}`}
        >
          📱 {installPrompt ? 'Tap to install app' : 'Add to Home Screen for the best experience'}
        </button>
      )}

      {/* Game Canvas - Scales to fit viewport */}
      <div ref={gameContainerRef} className={`relative z-10 flex-1 flex items-center justify-center bg-black overflow-hidden ${isMobile ? 'p-1' : 'p-4'}`}>
        <div
          className="relative"
          style={{ transform: `scale(${canvasScale})`, transformOrigin: 'center center' }}
        >
          <GameCanvas gameState={gameState} playerFlashing={playerFlashing} />

          {/* Stats Overlay - inside canvas */}
          <div className="absolute top-0 left-0 right-0 flex items-center px-4 py-2 text-lg pointer-events-none" style={{ textShadow: '0 0 4px black, 0 0 8px black' }}>
            <div className="flex-1 flex items-center gap-2">
              <span className="text-green-400">SCORE</span>
              <span className="text-white font-bold">{gameState.score.toString().padStart(6, '0')}</span>
              {isFreePlay && hasStarted && !gameState.gameOver && (
                <span className="text-yellow-400 animate-pulse text-sm">
                  FREE - {freePlayTimeLeft}s
                </span>
              )}
            </div>
            <div className="flex-1 flex items-center justify-center gap-2">
              <span className="text-green-400">LIVES</span>
              <TankLives lives={gameState.player.lives} />
            </div>
            <div className="flex-1 flex items-center justify-end gap-2">
              <span className="text-green-400">LEVEL</span>
              <span className="text-white font-bold">{gameState.level}</span>
            </div>
          </div>

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
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/80 z-20 cursor-pointer"
              onClick={() => {
                // Resume game on click/tap
                if (gameState.bonusUFO && !isMuted) {
                  audioEngine.startUfoSound();
                }
                if (!isMuted) {
                  const aliveInvaders = gameState.invaders.filter((inv) => inv.isAlive).length;
                  const speedRatio = aliveInvaders / 55;
                  const tempo = Math.max(150, 500 * speedRatio);
                  audioEngine.startMusic(tempo, gameState.level);
                }
                setGameState((state) => ({ ...state, isPaused: false }));
              }}
            >
              <div className="text-center space-y-6">
                <div className="text-7xl text-yellow-400 font-bold animate-pulse">
                  PAUSED
                </div>
                <div className="text-2xl text-green-400 mb-4">
                  {isMobile ? 'TAP TO CONTINUE' : 'PRESS ANY KEY TO CONTINUE'}
                </div>
                <Button
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent unpause
                    audioEngine.stopMusic();
                    audioEngine.stopUfoSound();
                    setHasStarted(false);
                    setGameState(createInitialState());
                    if (freePlayTimerRef.current) {
                      clearInterval(freePlayTimerRef.current);
                      freePlayTimerRef.current = null;
                    }
                  }}
                  variant="outline"
                  className="border-red-500 text-red-500 hover:bg-red-500 hover:text-black text-lg px-8 py-4"
                >
                  QUIT GAME
                </Button>
              </div>
            </div>
          )}

          {gameState.gameOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90">
              <div className="text-center space-y-6">
                <div className={`text-6xl font-bold animate-pulse mb-6 ${gameEndReason === 'timeout' ? 'text-yellow-500' : 'text-red-500'}`}>
                  {gameEndReason === 'timeout' ? "TIME'S UP!" : 'GAME OVER'}
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
                      disabled={isPublishing || hasPublishedScore}
                      className={hasPublishedScore
                        ? "border-green-500 text-green-500 text-lg cursor-not-allowed opacity-70"
                        : isPublishing
                        ? "border-yellow-500 text-yellow-500 text-lg cursor-not-allowed opacity-70"
                        : "border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black text-lg"
                      }
                    >
                      <Trophy className="mr-2 h-5 w-5" />
                      {hasPublishedScore ? 'SAVED ✓' : isPublishing ? 'SAVING...' : 'SAVE TO LEADERBOARD'}
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

      {/* Touch Controls for Mobile */}
      {isMobile && hasStarted && !gameState.gameOver && !gameState.isPaused && (
        <TouchControls
          onLeftStart={() => handleTouchLeft(true)}
          onLeftEnd={() => handleTouchLeft(false)}
          onRightStart={() => handleTouchRight(true)}
          onRightEnd={() => handleTouchRight(false)}
          onFire={handleTouchFire}
          onPause={togglePause}
          sideMargin={sideMargin}
        />
      )}

      {/* Footer - hidden on mobile to maximize play area */}
      {!isMobile && (
        <div className="relative z-10 bg-black border-t-2 border-green-500 text-center text-green-600 px-6 py-2 text-lg">
          {hasStarted ? (
            <span>← → or A/D: MOVE | SPACE: SHOOT | ESC: PAUSE</span>
          ) : (
            <span>VIBED BY NINIMONK05 • POWERED BY LIGHTNING ⚡</span>
          )}
        </div>
      )}

      {/* Leaderboard Dialog */}
      <Dialog open={showLeaderboard} onOpenChange={(open) => {
        setShowLeaderboard(open);
        if (open) {
          // Invalidate cache and refetch - ensures fresh data after relay reconnect
          queryClient.invalidateQueries({ queryKey: ['game-scores'] });
          refetchLeaderboard();
        }
        if (!open) setHighlightedScore(null);
      }}>
        <DialogContent aria-describedby={undefined} className={`bg-gray-900 border-green-500 text-green-500 border-4 ${isMobile ? 'max-w-[85vw] max-h-[80vh] overflow-y-auto p-3 mx-auto' : 'max-w-md'}`}>
          <DialogHeader>
            <DialogTitle className={`text-green-400 flex items-center gap-2 ${isMobile ? 'text-xl' : 'text-3xl'}`}>
              <Trophy className={isMobile ? 'h-5 w-5' : 'h-8 w-8'} />
              TOP SCORES
            </DialogTitle>
          </DialogHeader>
          <div className={`space-y-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-800 [&::-webkit-scrollbar-thumb]:bg-green-500 [&::-webkit-scrollbar-thumb]:rounded ${isMobile ? 'max-h-[60vh]' : 'max-h-96'}`}>
            {leaderboardLoading ? (
              <div className="text-center text-green-600 py-12 text-lg">
                LOADING...
              </div>
            ) : leaderboardError ? (
              <div className="text-center text-red-500 py-12 text-lg">
                FAILED TO LOAD SCORES
              </div>
            ) : leaderboard && leaderboard.length > 0 ? (
              leaderboard.map((score, index) => {
                const isCurrentUser = user && score.pubkey === user.pubkey;
                const isHighlighted = isCurrentUser && highlightedScore === score.score;

                return (
                  <div
                    key={score.event.id}
                    ref={isHighlighted ? (el) => {
                      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                    } : undefined}
                  >
                    <LeaderboardEntry
                      score={score}
                      index={index}
                      isCurrentUser={!!isCurrentUser}
                      isHighlighted={!!isHighlighted}
                      currentUserName={name}
                    />
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
        <DialogContent aria-describedby={undefined} className={`bg-gray-900 border-green-500 text-green-500 border-4 ${isMobile ? 'max-w-[85vw] max-h-[80vh] overflow-y-auto p-3 mx-auto' : 'max-w-md'}`}>
          <DialogHeader>
            <DialogTitle className={`text-green-400 flex items-center gap-2 ${isMobile ? 'text-xl' : 'text-3xl'}`}>
              <HelpCircle className={isMobile ? 'h-5 w-5' : 'h-8 w-8'} />
              HOW TO PLAY
            </DialogTitle>
          </DialogHeader>
          <div className={`text-green-300 ${isMobile ? 'space-y-2 text-sm' : 'space-y-4 text-xl'}`}>
            <div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'}`}>
              <span className="text-yellow-400">⚡</span>
              <span>PAY 21 SATS TO START THE GAME</span>
            </div>
            <div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'}`}>
              <span className="text-yellow-400">👾</span>
              <span>DESTROY ALL INVADERS TO WIN</span>
            </div>
            <div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'}`}>
              <span className="text-yellow-400">🎯</span>
              <span>EARN POINTS FOR EACH HIT</span>
            </div>
            <div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'}`}>
              <span className="text-yellow-400">🎵</span>
              <span>MUSIC SPEEDS UP AS YOU DESTROY INVADERS</span>
            </div>
            <div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'}`}>
              <span className="text-yellow-400">🏆</span>
              <span>PUBLISH YOUR SCORE ON NOSTR</span>
            </div>
            <div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'}`}>
              <span className="text-yellow-400">🔑</span>
              <span>USE ← → OR A/D TO MOVE</span>
            </div>
            <div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'}`}>
              <span className="text-yellow-400">🚀</span>
              <span>PRESS SPACE TO SHOOT</span>
            </div>
            <div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'}`}>
              <span className="text-yellow-400">⏸️</span>
              <span>PRESS ESC TO PAUSE / QUIT</span>
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
          // Stop polling when dialog closes (unless already paid)
          if (!hasPaid) {
            resetPayment();
          }
        }
      }}>
        <DialogContent className={`bg-gray-900 border-green-500 text-green-500 border-4 ${isMobile ? 'max-w-[85vw] max-h-[80vh] overflow-y-auto p-3 mx-auto' : 'max-w-md'}`}>
          <DialogHeader>
            <DialogTitle className={isMobile ? 'text-xl' : 'text-3xl'} style={{ color: '#f7931a' }}>INSERT BITCOIN</DialogTitle>
            <DialogDescription className={`text-green-300 ${isMobile ? 'text-sm' : 'text-lg'}`}>
              SEND 21 SATS VIA LIGHTNING TO PLAY
            </DialogDescription>
          </DialogHeader>
          <div className={isMobile ? 'space-y-2' : 'space-y-4'}>
            {hasPaid ? (
              <>
                <div className={`text-center ${isMobile ? 'py-2' : 'py-6'}`}>
                  <div className={`font-mono text-green-400 ${isMobile ? 'text-4xl mb-2' : 'text-7xl mb-4'}`}>[OK]</div>
                  <div className={`font-bold text-green-400 ${isMobile ? 'text-xl' : 'text-4xl'}`}>PAYMENT RECEIVED!</div>
                  <div className={`text-green-300 ${isMobile ? 'text-sm mt-2' : 'text-xl mt-4'}`}>
                    21 SATS CONFIRMED
                  </div>
                </div>

                <Button
                  onClick={() => {
                    setShowPayment(false);
                    startGame();
                  }}
                  className={`w-full bg-green-500 text-black hover:bg-green-400 font-bold ${isMobile ? 'text-lg py-4' : 'text-2xl py-8'}`}
                >
                  <Play className={isMobile ? 'mr-2 h-5 w-5' : 'mr-2 h-8 w-8'} />
                  PLAY NOW {!isMobile && '(SPACE)'}
                </Button>
              </>
            ) : !lightningInvoice ? (
              <>
                <div className={`text-center ${isMobile ? 'py-2' : 'py-6'}`}>
                  <div className={isMobile ? 'text-4xl mb-2' : 'text-7xl mb-4'}>⚡</div>
                  <div className={`font-bold text-yellow-400 ${isMobile ? 'text-2xl' : 'text-5xl'}`}>21 SATS</div>
                  <div className={`text-green-600 ${isMobile ? 'text-xs mt-1' : 'text-lg mt-2'}`}>
                    TO {RECIPIENT_LIGHTNING_ADDRESS}
                  </div>
                </div>

                <div className={isMobile ? 'space-y-2' : 'space-y-3'}>
                  {wallet && (
                    <Button
                      onClick={handleWalletPayment}
                      disabled={isPaymentProcessing}
                      className={`w-full bg-green-500 text-black hover:bg-green-400 font-bold ${isMobile ? 'text-base py-3' : 'text-xl py-7'}`}
                    >
                      {isPaymentProcessing ? (
                        <>PROCESSING...</>
                      ) : (
                        <>
                          <Zap className={isMobile ? 'mr-2 h-4 w-4' : 'mr-2 h-6 w-6'} />
                          PAY WITH WALLET
                        </>
                      )}
                    </Button>
                  )}

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-green-700" />
                    </div>
                    <div className={`relative flex justify-center uppercase ${isMobile ? 'text-sm' : 'text-base'}`}>
                      <span className="bg-gray-900 px-2 text-green-600">OR</span>
                    </div>
                  </div>

                  <Button
                    onClick={handleGenerateInvoice}
                    disabled={isPaymentProcessing}
                    variant="outline"
                    className={`w-full border-green-500 text-green-500 hover:bg-green-500 hover:text-black font-bold ${isMobile ? 'text-base py-3' : 'text-xl py-7'}`}
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
                <div className={isMobile ? 'flex gap-3' : 'text-center space-y-4'}>
                  {/* QR Code - left side on mobile */}
                  {qrCodeDataUrl && (
                    <div className={isMobile ? 'flex-shrink-0' : 'flex justify-center'}>
                      <img
                        src={qrCodeDataUrl}
                        alt="Lightning Invoice QR Code"
                        className={`rounded-lg border-4 border-green-500 ${isMobile ? 'w-[140px] h-[140px]' : ''}`}
                      />
                    </div>
                  )}

                  {/* Details - right side on mobile */}
                  <div className={isMobile ? 'flex-1 flex flex-col justify-between space-y-1' : ''}>
                    <div className={`text-green-400 ${isMobile ? 'text-xs' : 'text-lg'}`}>
                      SCAN WITH YOUR LIGHTNING WALLET
                    </div>

                    {paymentConfirmed ? (
                      <div className={`bg-green-900/30 border border-green-500 rounded animate-pulse ${isMobile ? 'p-1' : 'p-4'}`}>
                        <div className={`text-green-400 font-bold ${isMobile ? 'text-sm' : 'text-2xl'}`}>
                          ✓ PAYMENT CONFIRMED!
                        </div>
                        <div className={`text-green-300 ${isMobile ? 'text-[10px] mt-1' : 'text-sm mt-2'}`}>
                          Starting game...
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={`bg-yellow-900/20 border border-yellow-600 rounded ${isMobile ? 'p-1' : 'p-3'}`}>
                          <div className={`text-yellow-400 animate-pulse ${isMobile ? 'text-[10px]' : 'text-sm'}`}>
                            ⏳ WAITING FOR PAYMENT...
                          </div>
                          <div className={`text-yellow-600 mt-1 ${isMobile ? 'text-[8px]' : 'text-xs'}`}>
                            {isPolling ? 'Auto-detecting payment' : 'Checking...'}
                          </div>
                        </div>

                        <div className={`bg-black rounded border border-green-700 ${isMobile ? 'p-1' : 'p-3'}`}>
                          <div className={`text-green-500 break-all ${isMobile ? 'text-[8px]' : 'text-xs'}`}>
                            {lightningInvoice.slice(0, isMobile ? 80 : 60)}...
                          </div>
                        </div>
                      </>
                    )}

                    <Button
                      onClick={copyInvoice}
                      variant="outline"
                      className={`border-green-500 text-green-500 hover:bg-green-500 hover:text-black ${isMobile ? 'text-xs py-1 w-full' : 'w-full text-lg py-5'}`}
                    >
                      {invoiceCopied ? (
                        <>
                          <Check className={isMobile ? 'mr-1 h-3 w-3' : 'mr-2 h-5 w-5'} />
                          COPIED!
                        </>
                      ) : (
                        <>
                          <Copy className={isMobile ? 'mr-1 h-3 w-3' : 'mr-2 h-5 w-5'} />
                          COPY
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <Button
                  onClick={() => {
                    setLightningInvoice(null);
                    setQrCodeDataUrl(null);
                  }}
                  variant="ghost"
                  className={`w-full text-green-600 hover:text-green-400 ${isMobile ? 'text-xs mt-1' : 'text-lg'}`}
                >
                  ← BACK
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Login to Save Score Dialog */}
      <Dialog open={showLoginToSave} onOpenChange={setShowLoginToSave}>
        <DialogContent className={`bg-gray-900 border-green-500 text-green-500 border-4 ${isMobile ? 'max-w-[85vw] max-h-[80vh] overflow-y-auto p-3 mx-auto' : 'max-w-md'}`}>
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
                  disabled={isPublishing || hasPublishedScore}
                  className={`w-full font-bold text-xl py-6 ${
                    isPublishing || hasPublishedScore
                      ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                      : 'bg-yellow-500 text-black hover:bg-yellow-400'
                  }`}
                >
                  <Trophy className="mr-2 h-6 w-6" />
                  {hasPublishedScore ? 'SAVED ✓' : isPublishing ? 'SAVING...' : 'SAVE TO LEADERBOARD'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share to Nostr Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className={`bg-gray-900 border-green-500 text-green-500 border-4 ${isMobile ? 'max-w-[85vw] max-h-[80vh] overflow-y-auto p-3 mx-auto' : 'max-w-lg'}`}>
          <DialogHeader>
            <DialogTitle className={`text-green-400 flex items-center gap-2 ${isMobile ? 'text-xl' : 'text-3xl'}`}>
              <Share2 className={isMobile ? 'h-5 w-5' : 'h-8 w-8'} />
              SHARE YOUR VICTORY
            </DialogTitle>
            <DialogDescription className={`text-green-300 ${isMobile ? 'text-sm' : 'text-lg'}`}>
              Tell the world about your epic score!
            </DialogDescription>
          </DialogHeader>
          <div className={isMobile ? 'space-y-2 py-2' : 'space-y-4 py-4'}>
            <textarea
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
              className={`w-full bg-black border-2 border-green-500 rounded-lg text-green-300 resize-none focus:outline-none focus:border-green-400 ${isMobile ? 'h-24 p-2 text-sm' : 'h-40 p-4 text-lg'}`}
              placeholder="Write your message..."
            />
            <div className="flex gap-2">
              {user ? (
                <Button
                  onClick={publishSharePost}
                  className={`flex-1 bg-purple-600 text-white hover:bg-purple-500 font-bold ${isMobile ? 'text-sm py-3' : 'text-xl py-6'}`}
                >
                  <Zap className={isMobile ? 'mr-1 h-4 w-4' : 'mr-2 h-6 w-6'} />
                  POST TO NOSTR
                </Button>
              ) : (
                <div className="flex-1 space-y-2">
                  <div className={`text-center text-yellow-400 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    Login to post directly to Nostr
                  </div>
                  <LoginArea className="w-full" />
                </div>
              )}
              <Button
                onClick={copyShareMessage}
                variant="outline"
                className={`border-green-500 text-green-500 hover:bg-green-500 hover:text-black font-bold ${isMobile ? 'text-sm py-3' : 'text-lg py-6'}`}
              >
                <Copy className={isMobile ? 'mr-1 h-4 w-4' : 'mr-2 h-5 w-5'} />
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
