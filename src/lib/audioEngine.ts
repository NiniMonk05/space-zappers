/**
 * 8-bit Audio Engine for Space Zapper
 * Creates retro arcade sounds using Web Audio API
 */

class AudioEngine {
  private context: AudioContext | null = null;
  private musicInterval: number | null = null;
  private currentTempo = 500; // milliseconds between beats
  private minTempo = 150;
  private isMusicPlaying = false;
  private isMuted = false;

  initialize() {
    if (!this.context) {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
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

    // Classic laser sound
    const startFreq = 800;
    const endFreq = 200;
    const duration = 0.1;

    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.context.destination);

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(startFreq, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFreq, this.context.currentTime + duration);

    gainNode.gain.setValueAtTime(0.2, this.context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

    oscillator.start(this.context.currentTime);
    oscillator.stop(this.context.currentTime + duration);
  }

  playExplosion() {
    if (!this.context || this.isMuted) return;

    // Explosion sound using white noise
    const duration = 0.3;
    const bufferSize = this.context.sampleRate * duration;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.context.createBufferSource();
    const gainNode = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    noise.buffer = buffer;
    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.context.destination);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.context.currentTime + duration);

    gainNode.gain.setValueAtTime(0.3, this.context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

    noise.start(this.context.currentTime);
    noise.stop(this.context.currentTime + duration);
  }

  playGameOver() {
    if (!this.context || this.isMuted) return;

    // Descending tones
    const notes = [523, 494, 440, 392, 349];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.createOscillator(freq, 0.3);
      }, i * 200);
    });
  }

  playLevelUp() {
    if (!this.context || this.isMuted) return;

    // Ascending victory tones
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.createOscillator(freq, 0.2);
      }, i * 100);
    });
  }

  private playBeat(beatIndex: number) {
    if (!this.context || this.isMuted) return;

    // Classic Space Invaders four-note bass line
    const notes = [196, 208, 220, 233]; // G3, G#3, A3, A#3
    const note = notes[beatIndex % 4];

    this.createOscillator(note, 0.1, 'square');
  }

  startMusic(tempo: number = 500) {
    if (this.isMusicPlaying) return;

    this.initialize();
    this.currentTempo = tempo;
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
