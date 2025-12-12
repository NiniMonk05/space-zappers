/**
 * 8-bit Audio Engine for Space Zapper
 * Creates retro arcade sounds using Web Audio API
 */

class AudioEngine {
  private context: AudioContext | null = null;
  private musicInterval: number | null = null;
  private currentTempo = 500; // milliseconds between beats
  private minTempo = 150;
  public isMusicPlaying = false;
  private isMuted = false;

  initialize() {
    if (!this.context) {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('[Audio] AudioContext initialized');
    }
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

    // Enhanced 8-bit melody with bass, harmony, and variation
    const bassNotes = [
      [196, 220, 233, 220],  // G3, A3, A#3, A3 (Pattern 1)
      [185, 208, 220, 208],  // F#3, G#3, A3, G#3 (Pattern 2)
    ];

    const harmonyNotes = [
      [392, 440, 466, 440],  // Higher octave harmony
      [370, 416, 440, 416],  // Variation
    ];

    const accentNotes = [
      [784, 880, 932, 880],  // High accent notes
      [740, 831, 880, 831],  // Variation
    ];

    // Select pattern based on beat progression
    const patternIndex = Math.floor(beatIndex / 16) % 2;
    const beatInPattern = beatIndex % 4;

    // Bass line (always playing)
    const bassNote = bassNotes[patternIndex][beatInPattern];
    this.createOscillator(bassNote, 0.15, 'square');

    // Add harmony every other beat
    if (beatIndex % 2 === 0) {
      const harmonyNote = harmonyNotes[patternIndex][beatInPattern];
      this.createOscillator(harmonyNote, 0.1, 'triangle');
    }

    // Add high accent on every 4th beat
    if (beatIndex % 4 === 0) {
      const accentNote = accentNotes[patternIndex][beatInPattern];
      this.createOscillator(accentNote, 0.08, 'sine');
    }

    // Add rhythmic variation every 8 beats
    if (beatIndex % 8 === 6) {
      this.createOscillator(294, 0.12, 'square'); // D4 syncopation
    }
  }

  startMusic(tempo: number = 500) {
    if (this.isMusicPlaying) {
      console.log('[Audio] Music already playing');
      return;
    }

    this.initialize();
    this.currentTempo = tempo;
    this.isMusicPlaying = true;

    console.log('[Audio] Starting music with tempo:', tempo);

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

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopMusic();
    }
  }

  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }
}

export const audioEngine = new AudioEngine();
