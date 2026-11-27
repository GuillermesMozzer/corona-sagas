const MUSIC_KEY = 'corona_music_v1';
const SFX_KEY = 'corona_sfx_v1';
const MUSIC_VOL_KEY = 'corona_music_vol_v1';
const SFX_VOL_KEY = 'corona_sfx_vol_v1';

class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private musicMasterGain: GainNode | null = null;
  private sfxMasterGain: GainNode | null = null;
  private sfxEnabled = true;
  private musicEnabled = true;
  private musicVolume = 3; // 0..5
  private sfxVolume = 4; // 0..5
  private lastHoofTime = 0;
  private musicInterval: number | null = null;
  private musicStep = 0;
  private nightMood = false;

  constructor() {
    try {
      const m = window.localStorage.getItem(MUSIC_KEY);
      if (m === '0') this.musicEnabled = false;
      const s = window.localStorage.getItem(SFX_KEY);
      if (s === '0') this.sfxEnabled = false;
      const mv = window.localStorage.getItem(MUSIC_VOL_KEY);
      if (mv !== null) {
        const parsed = Math.max(0, Math.min(5, Math.round(Number(mv))));
        if (Number.isFinite(parsed)) this.musicVolume = parsed;
      }
      const sv = window.localStorage.getItem(SFX_VOL_KEY);
      if (sv !== null) {
        const parsed = Math.max(0, Math.min(5, Math.round(Number(sv))));
        if (Number.isFinite(parsed)) this.sfxVolume = parsed;
      }
    } catch {
      // Ignore storage errors
    }
  }

  private syncMasterGains(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.musicMasterGain) {
      const target = this.musicEnabled ? this.musicVolume / 5 : 0;
      this.musicMasterGain.gain.setTargetAtTime(target, now, 0.03);
    }
    if (this.sfxMasterGain) {
      const target = this.sfxEnabled ? this.sfxVolume / 5 : 0;
      this.sfxMasterGain.gain.setTargetAtTime(target, now, 0.02);
    }
  }

  public isSfxEnabled(): boolean {
    return this.sfxEnabled;
  }

  public isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public setMusicVolume(level: number): number {
    const safe = Math.max(0, Math.min(5, Math.round(level)));
    this.musicVolume = safe;
    if (safe > 0 && !this.musicEnabled) {
      this.musicEnabled = true;
      try {
        window.localStorage.setItem(MUSIC_KEY, '1');
      } catch {
        // Ignore
      }
      this.unlock();
      this.startMusicLoop();
    }
    try {
      window.localStorage.setItem(MUSIC_VOL_KEY, String(safe));
    } catch {
      // Ignore
    }
    this.syncMasterGains();
    return this.musicVolume;
  }

  public setSfxVolume(level: number): number {
    const safe = Math.max(0, Math.min(5, Math.round(level)));
    this.sfxVolume = safe;
    if (safe > 0 && !this.sfxEnabled) {
      this.sfxEnabled = true;
      try {
        window.localStorage.setItem(SFX_KEY, '1');
      } catch {
        // Ignore
      }
    }
    try {
      window.localStorage.setItem(SFX_VOL_KEY, String(safe));
    } catch {
      // Ignore
    }
    this.syncMasterGains();
    if (safe > 0) this.playCoinDrop();
    return this.sfxVolume;
  }

  public setNightMood(isNight: boolean): void {
    this.nightMood = isNight;
  }

  public toggleSfx(): boolean {
    this.sfxEnabled = !this.sfxEnabled;
    if (this.sfxEnabled && this.sfxVolume === 0) {
      this.sfxVolume = 3;
      try {
        window.localStorage.setItem(SFX_VOL_KEY, '3');
      } catch {
        // Ignore
      }
    }
    try {
      window.localStorage.setItem(SFX_KEY, this.sfxEnabled ? '1' : '0');
    } catch {
      // Ignore
    }
    this.syncMasterGains();
    if (this.sfxEnabled) this.playCoinDrop();
    return this.sfxEnabled;
  }

  public toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    if (this.musicEnabled && this.musicVolume === 0) {
      this.musicVolume = 3;
      try {
        window.localStorage.setItem(MUSIC_VOL_KEY, '3');
      } catch {
        // Ignore
      }
    }
    try {
      window.localStorage.setItem(MUSIC_KEY, this.musicEnabled ? '1' : '0');
    } catch {
      // Ignore
    }
    if (this.musicEnabled) {
      this.unlock();
      this.startMusicLoop();
    } else {
      this.stopMusicLoop();
    }
    this.syncMasterGains();
    return this.musicEnabled;
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.musicMasterGain = this.ctx.createGain();
        this.musicMasterGain.connect(this.ctx.destination);
        this.sfxMasterGain = this.ctx.createGain();
        this.sfxMasterGain.connect(this.ctx.destination);
        this.syncMasterGains();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (this.musicEnabled) {
      this.startMusicLoop();
    }
  }

  private startMusicLoop(): void {
    if (this.musicInterval !== null || typeof window === 'undefined' || !window.setInterval) return;
    this.musicInterval = window.setInterval(() => {
      this.playMusicBeat();
    }, 950);
  }

  private stopMusicLoop(): void {
    if (this.musicInterval !== null && typeof window !== 'undefined' && window.clearInterval) {
      window.clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  private playMusicBeat(): void {
    if (!this.musicEnabled || this.musicVolume <= 0 || !this.ctx || !this.musicMasterGain || this.ctx.state !== 'running') {
      return;
    }
    const ctx = this.ctx;
    const out = this.musicMasterGain;
    const now = ctx.currentTime;

    // Contemplative Nordic D-Dorian (Day) vs D-Aeolian / dark fifths (Night)
    const dayScale = [146.83, 174.61, 220.0, 261.63, 293.66, 329.63, 440.0];
    const nightScale = [110.0, 130.81, 146.83, 164.81, 196.0, 220.0, 261.63];
    const scale = this.nightMood ? nightScale : dayScale;
    const pattern = [0, 2, 4, 2, 3, 5, 4, 1];
    const noteFreq = scale[pattern[this.musicStep % pattern.length]];

    // Warm soft harp/lyre pluck
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(noteFreq, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.nightMood ? 520 : 880, now);

    gain.gain.setValueAtTime(0.0005, now);
    gain.gain.linearRampToValueAtTime(0.032, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 1.65);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 1.7);

    // Every 4 beats, add a subtle low Nordic drone fifth
    if (this.musicStep % 4 === 0) {
      const drone = ctx.createOscillator();
      const dGain = ctx.createGain();
      drone.type = 'sine';
      drone.frequency.setValueAtTime(this.nightMood ? 73.42 : 110.0, now);
      dGain.gain.setValueAtTime(0.0005, now);
      dGain.gain.linearRampToValueAtTime(0.026, now + 0.4);
      dGain.gain.exponentialRampToValueAtTime(0.0005, now + 3.4);
      drone.connect(dGain);
      dGain.connect(out);
      drone.start(now);
      drone.stop(now + 3.5);
    }

    this.musicStep += 1;
  }

  private getSfxTarget(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.sfxEnabled || this.sfxVolume <= 0) return null;
    if (!this.ctx) this.unlock();
    if (!this.ctx || !this.sfxMasterGain || this.ctx.state !== 'running') return null;
    return { ctx: this.ctx, out: this.sfxMasterGain };
  }

  public playCoinDrop(): void {
    const t = this.getSfxTarget();
    if (!t) return;
    const { ctx, out } = t;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1420, now);
    osc.frequency.exponentialRampToValueAtTime(1960, now + 0.045);
    gain.gain.setValueAtTime(0.095, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playCoinPickup(): void {
    const t = this.getSfxTarget();
    if (!t) return;
    const { ctx, out } = t;
    const now = ctx.currentTime;
    [1318, 1760].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.045);
      gain.gain.setValueAtTime(0.075, now + i * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.12);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.13);
    });
  }

  public playBuildComplete(): void {
    const t = this.getSfxTarget();
    if (!t) return;
    const { ctx, out } = t;
    const now = ctx.currentTime;
    [293.66, 369.99, 440, 587.33].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const ts = now + i * 0.065;
      osc.frequency.setValueAtTime(freq, ts);
      gain.gain.setValueAtTime(0.09, ts);
      gain.gain.exponentialRampToValueAtTime(0.001, ts + 0.28);
      osc.connect(gain);
      gain.connect(out);
      osc.start(ts);
      osc.stop(ts + 0.3);
    });
  }

  public playHammer(): void {
    const t = this.getSfxTarget();
    if (!t) return;
    const { ctx, out } = t;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(190 + Math.random() * 50, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.06);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playBowShot(): void {
    const t = this.getSfxTarget();
    if (!t) return;
    const { ctx, out } = t;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playHit(): void {
    const t = this.getSfxTarget();
    if (!t) return;
    const { ctx, out } = t;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.09);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playHorn(dark = false): void {
    const t = this.getSfxTarget();
    if (!t) return;
    const { ctx, out } = t;
    const now = ctx.currentTime;
    const base = dark ? 110 : 146.83;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(base, now);
    osc1.frequency.linearRampToValueAtTime(dark ? base * 0.94 : base * 1.12, now + 0.65);
    osc2.frequency.setValueAtTime(base * 1.5, now);
    osc2.frequency.linearRampToValueAtTime(dark ? base * 1.41 : base * 1.5, now + 0.65);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(dark ? 420 : 680, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.16);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.05);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(out);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.1);
    osc2.stop(now + 1.1);
  }

  public playCrownKnock(): void {
    const t = this.getSfxTarget();
    if (!t) return;
    const { ctx, out } = t;
    const now = ctx.currentTime;
    [520, 390, 260].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const ts = now + i * 0.08;
      osc.frequency.setValueAtTime(freq, ts);
      gain.gain.setValueAtTime(0.11, ts);
      gain.gain.exponentialRampToValueAtTime(0.001, ts + 0.24);
      osc.connect(gain);
      gain.connect(out);
      osc.start(ts);
      osc.stop(ts + 0.25);
    });
  }

  public playHoof(sprinting: boolean): void {
    const t = this.getSfxTarget();
    if (!t) return;
    const { ctx, out } = t;
    const now = ctx.currentTime;
    const interval = sprinting ? 0.17 : 0.3;
    if (now - this.lastHoofTime < interval) return;
    this.lastHoofTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95 + Math.random() * 25, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.04);
    gain.gain.setValueAtTime(sprinting ? 0.035 : 0.02, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playCoinSlot(): void {
    const t = this.getSfxTarget();
    if (!t) return;
    const { ctx, out } = t;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1640, now);
    osc.frequency.exponentialRampToValueAtTime(2200, now + 0.06);
    gain.gain.setValueAtTime(0.085, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playOrder(side: -1 | 1): void {
    const t = this.getSfxTarget();
    if (!t) return;
    const { ctx, out } = t;
    const now = ctx.currentTime;
    const f1 = side < 0 ? 392 : 440;
    const f2 = side < 0 ? 523.25 : 587.33;
    [f1, f2].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const ts = now + i * 0.045;
      osc.frequency.setValueAtTime(freq, ts);
      gain.gain.setValueAtTime(0.07, ts);
      gain.gain.exponentialRampToValueAtTime(0.001, ts + 0.11);
      osc.connect(gain);
      gain.connect(out);
      osc.start(ts);
      osc.stop(ts + 0.12);
    });
  }
}

export const sound = new ProceduralAudio();
