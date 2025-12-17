/**
 * 8-bit Audio Engine for Space Zappers
 * Creates retro arcade sounds using Web Audio API
 */

// Safari compatibility
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

class AudioEngine {
  private context: AudioContext | null = null;
  private musicInterval: number | null = null;
  private ufoInterval: number | null = null;
  private currentTempo = 500; // milliseconds between beats
  private minTempo = 150;
  private currentLevel = 1;
  public isMusicPlaying = false;
  public isUfoPlaying = false;
  private isMuted = false;

  /**
   * Initialize audio context - MUST be called during a user gesture (click/tap)
   */
  initialize() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextClass();
    }
    // Always resume - required for iOS/Safari
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  /**
   * Set up auto-unlock on first user interaction (for mobile browsers)
   */
  setupAutoUnlock() {
    const unlockHandler = () => {
      this.initialize();
    };
    document.addEventListener('touchstart', unlockHandler, { capture: true, once: true });
    document.addEventListener('touchend', unlockHandler, { capture: true, once: true });
    document.addEventListener('click', unlockHandler, { capture: true, once: true });
  }

  private createOscillator(frequency: number, duration: number, type: OscillatorType = 'square') {
    if (!this.context || this.isMuted) return;

    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.context.destination);

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(0.1, this.context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

    oscillator.start(this.context.currentTime);
    oscillator.stop(this.context.currentTime + duration);
  }

  playShoot() {
    if (!this.context || this.isMuted) return;

    // Enhanced laser sound with dual oscillators
    const duration = 0.15;

    // Primary laser
    const osc1 = this.context.createOscillator();
    const gain1 = this.context.createGain();
    osc1.connect(gain1);
    gain1.connect(this.context.destination);
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(1200, this.context.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(150, this.context.currentTime + duration);
    gain1.gain.setValueAtTime(0.15, this.context.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);
    osc1.start(this.context.currentTime);
    osc1.stop(this.context.currentTime + duration);

    // Secondary harmonics for richer sound
    const osc2 = this.context.createOscillator();
    const gain2 = this.context.createGain();
    osc2.connect(gain2);
    gain2.connect(this.context.destination);
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(600, this.context.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(75, this.context.currentTime + duration);
    gain2.gain.setValueAtTime(0.1, this.context.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);
    osc2.start(this.context.currentTime);
    osc2.stop(this.context.currentTime + duration);
  }

  playExplosion() {
    if (!this.context || this.isMuted) return;

    // Enhanced explosion with noise and tonal elements
    const duration = 0.4;

    // White noise component
    const bufferSize = this.context.sampleRate * duration;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.context.createBufferSource();
    const noiseGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    noise.buffer = buffer;
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.context.destination);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, this.context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(80, this.context.currentTime + duration);

    noiseGain.gain.setValueAtTime(0.25, this.context.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

    noise.start(this.context.currentTime);
    noise.stop(this.context.currentTime + duration);

    // Add tonal "boom" component
    const boom = this.context.createOscillator();
    const boomGain = this.context.createGain();
    boom.connect(boomGain);
    boomGain.connect(this.context.destination);
    boom.type = 'sine';
    boom.frequency.setValueAtTime(120, this.context.currentTime);
    boom.frequency.exponentialRampToValueAtTime(40, this.context.currentTime + duration);
    boomGain.gain.setValueAtTime(0.2, this.context.currentTime);
    boomGain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);
    boom.start(this.context.currentTime);
    boom.stop(this.context.currentTime + duration);
  }

  playGameOver() {
    if (!this.context || this.isMuted) return;

    // Dramatic descending game over melody
    const notes = [
      { freq: 523, duration: 0.25 },  // C5
      { freq: 494, duration: 0.25 },  // B4
      { freq: 440, duration: 0.25 },  // A4
      { freq: 392, duration: 0.25 },  // G4
      { freq: 349, duration: 0.4 },   // F4
      { freq: 294, duration: 0.6 },   // D4 (final note)
    ];

    notes.forEach((note, i) => {
      setTimeout(() => {
        // Main note
        this.createOscillator(note.freq, note.duration, 'square');
        // Harmony
        this.createOscillator(note.freq * 0.75, note.duration, 'sine');
      }, i * 250);
    });
  }

  playPlayerHit() {
    if (!this.context || this.isMuted) return;

    // Alarm/damage sound when player is hit
    const duration = 0.4;

    // Low warning tone
    const osc1 = this.context.createOscillator();
    const gain1 = this.context.createGain();
    osc1.connect(gain1);
    gain1.connect(this.context.destination);
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(200, this.context.currentTime);
    osc1.frequency.setValueAtTime(150, this.context.currentTime + 0.1);
    osc1.frequency.setValueAtTime(200, this.context.currentTime + 0.2);
    osc1.frequency.setValueAtTime(100, this.context.currentTime + 0.3);
    gain1.gain.setValueAtTime(0.2, this.context.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);
    osc1.start(this.context.currentTime);
    osc1.stop(this.context.currentTime + duration);

    // Higher pitched alert
    const osc2 = this.context.createOscillator();
    const gain2 = this.context.createGain();
    osc2.connect(gain2);
    gain2.connect(this.context.destination);
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(400, this.context.currentTime);
    osc2.frequency.setValueAtTime(300, this.context.currentTime + 0.2);
    gain2.gain.setValueAtTime(0.1, this.context.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.3);
    osc2.start(this.context.currentTime);
    osc2.stop(this.context.currentTime + 0.3);
  }

  playLevelUp() {
    if (!this.context || this.isMuted) return;

    // Triumphant level up fanfare
    const melody = [
      { freq: 523, duration: 0.15 },   // C5
      { freq: 659, duration: 0.15 },   // E5
      { freq: 784, duration: 0.15 },   // G5
      { freq: 1047, duration: 0.3 },   // C6
      { freq: 784, duration: 0.15 },   // G5
      { freq: 1047, duration: 0.4 },   // C6 (triumphant hold)
    ];

    melody.forEach((note, i) => {
      setTimeout(() => {
        // Main note
        this.createOscillator(note.freq, note.duration, 'square');
        // Harmony
        this.createOscillator(note.freq * 1.5, note.duration * 0.8, 'triangle');
      }, i * 150);
    });
  }

  private playBeat(beatIndex: number) {
    if (!this.context || this.isMuted) return;

    const level = this.currentLevel;
    const beatInPattern = beatIndex % 4;

    // Classic Space Invaders style: 4 descending notes (like the original!)
    // But we add level-based variations to keep it interesting
    const classicBass = [
      [147, 139, 131, 123],  // Level 1: D3, Db3, C3, B2 - classic descent
      [139, 131, 123, 117],  // Level 2: Db3, C3, B2, Bb2 - lower
      [131, 123, 117, 110],  // Level 3: C3, B2, Bb2, A2 - even lower
      [123, 117, 110, 104],  // Level 4: B2, Bb2, A2, Ab2 - doom
      [110, 104, 98, 92],    // Level 5+: A2, Ab2, G2, Gb2 - maximum dread
    ];

    // Melodic hooks per level (plays on top of bass every 8 beats)
    const melodies = [
      [523, 494, 440, 392, 349, 330, 294, 262],  // Level 1: C major descent
      [466, 440, 392, 349, 311, 294, 262, 233],  // Level 2: Bb minor feel
      [440, 415, 370, 330, 311, 277, 262, 233],  // Level 3: Diminished
      [392, 370, 330, 311, 277, 262, 247, 220],  // Level 4: Deep minor
      [349, 330, 294, 277, 247, 233, 220, 196],  // Level 5+: Low rumble melody
    ];

    const patternIndex = Math.min(level - 1, classicBass.length - 1);

    // === BASS LINE (the iconic 4-note pattern) ===
    const bassNote = classicBass[patternIndex][beatInPattern];
    this.createOscillator(bassNote, 0.18, 'square');

    // Sub-bass for weight
    this.createOscillator(bassNote / 2, 0.12, 'sine');

    // === RHYTHM ACCENT (every beat, alternating) ===
    if (beatInPattern === 0 || beatInPattern === 2) {
      // Kick-like thump
      this.playDrum(60, 0.08);
    } else {
      // Hi-hat like tick
      this.playDrum(800, 0.03);
    }

    // === MELODY (plays over 8 beats, creates hook) ===
    const melody = melodies[patternIndex];
    const melodyNote = melody[beatIndex % 8];

    // Melody plays quieter, creates atmosphere
    if (beatIndex % 2 === 0) {
      this.createOscillator(melodyNote, 0.06, 'triangle');
    }

    // === TENSION BUILDER (arpeggios on higher levels) ===
    if (level >= 2 && beatIndex % 4 === 0) {
      // Quick arpeggio burst
      const arpBase = bassNote * 2;
      setTimeout(() => this.createOscillator(arpBase, 0.04, 'sawtooth'), 0);
      setTimeout(() => this.createOscillator(arpBase * 1.25, 0.04, 'sawtooth'), 30);
      setTimeout(() => this.createOscillator(arpBase * 1.5, 0.04, 'sawtooth'), 60);
    }

    // === ALARM PULSE (level 3+, adds urgency) ===
    if (level >= 3 && beatIndex % 8 === 4) {
      this.createOscillator(880, 0.05, 'square');
      setTimeout(() => this.createOscillator(660, 0.05, 'square'), 50);
    }

    // === DOOM CHORD (level 4+, power chord stabs) ===
    if (level >= 4 && beatIndex % 16 === 0) {
      const root = bassNote * 2;
      this.createOscillator(root, 0.1, 'sawtooth');
      this.createOscillator(root * 1.5, 0.08, 'sawtooth'); // Fifth
      this.createOscillator(root * 2, 0.06, 'sawtooth'); // Octave
    }
  }

  private playDrum(freq: number, volume: number) {
    if (!this.context || this.isMuted) return;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.connect(gain);
    gain.connect(this.context.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, this.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, this.context.currentTime + 0.05);

    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.08);

    osc.start(this.context.currentTime);
    osc.stop(this.context.currentTime + 0.08);
  }

  setLevel(level: number) {
    this.currentLevel = level;
  }

  startMusic(tempo: number = 500, level: number = 1) {
    if (this.isMusicPlaying) return;

    this.initialize();
    this.currentTempo = tempo;
    this.currentLevel = level;
    this.isMusicPlaying = true;

    let beatIndex = 0;

    const playNextBeat = () => {
      if (!this.isMusicPlaying) return;

      this.playBeat(beatIndex);
      beatIndex++;

      this.musicInterval = window.setTimeout(playNextBeat, this.currentTempo);
    };

    playNextBeat();
  }

  updateTempo(speed: number) {
    // Speed is inversely proportional to tempo
    // As game speeds up, music speeds up
    const normalizedSpeed = Math.max(0.2, Math.min(1, speed));
    this.currentTempo = Math.max(this.minTempo, 500 * normalizedSpeed);
  }

  stopMusic() {
    this.isMusicPlaying = false;
    if (this.musicInterval !== null) {
      clearTimeout(this.musicInterval);
      this.musicInterval = null;
    }
  }

  // Classic UFO bleeping sound from original Space Invaders
  startUfoSound() {
    if (this.isUfoPlaying || this.isMuted) return;

    this.initialize();
    this.isUfoPlaying = true;

    const playUfoBleep = () => {
      if (!this.isUfoPlaying || !this.context || this.isMuted) return;

      // Two-tone UFO bleep like the original
      const osc1 = this.context.createOscillator();
      const gain1 = this.context.createGain();
      osc1.connect(gain1);
      gain1.connect(this.context.destination);
      osc1.type = 'square';
      osc1.frequency.setValueAtTime(400, this.context.currentTime);
      osc1.frequency.setValueAtTime(500, this.context.currentTime + 0.05);
      gain1.gain.setValueAtTime(0.08, this.context.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.1);
      osc1.start(this.context.currentTime);
      osc1.stop(this.context.currentTime + 0.1);

      this.ufoInterval = window.setTimeout(playUfoBleep, 150);
    };

    playUfoBleep();
  }

  stopUfoSound() {
    this.isUfoPlaying = false;
    if (this.ufoInterval !== null) {
      clearTimeout(this.ufoInterval);
      this.ufoInterval = null;
    }
  }

  playUfoHit() {
    if (!this.context || this.isMuted) return;

    this.stopUfoSound();

    // High-pitched explosion for UFO
    const duration = 0.3;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.connect(gain);
    gain.connect(this.context.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, this.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.context.currentTime + duration);
    gain.gain.setValueAtTime(0.2, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);
    osc.start(this.context.currentTime);
    osc.stop(this.context.currentTime + duration);
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopMusic();
      this.stopUfoSound();
    }
  }

  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }
}

export const audioEngine = new AudioEngine();
