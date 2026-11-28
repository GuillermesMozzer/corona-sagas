import {
  DEFAULT_TRACK_ID,
  getMusicTrackById,
  MUSIC_TRACKS,
  type LeadInstrument,
  type MusicTrack,
  type PercHit,
} from './tracks';

const MUSIC_KEY = 'corona_music_v1';
const SFX_KEY = 'corona_sfx_v1';
const MUSIC_VOL_KEY = 'corona_music_vol_v1';
const SFX_VOL_KEY = 'corona_sfx_vol_v1';
const MUSIC_TRACK_KEY = 'corona_music_track_v1';
const MUSIC_SHUFFLE_KEY = 'corona_music_shuffle_v1';

class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private musicMasterGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxMasterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private sfxEnabled = true;
  private musicEnabled = true;
  private musicVolume = 3; // 0..5
  private sfxVolume = 4; // 0..5
  private lastHoofTime = 0;
  private musicInterval: number | null = null;
  private currentIntervalMs = 0;
  private musicStep = 0;
  private loopCount = 0;
  private nightMood = false;

  private selectedTrackId = DEFAULT_TRACK_ID;
  private shuffleEnabled = false;
  private activeShuffleTrackId = DEFAULT_TRACK_ID;
  private previewTrackId: string | null = null;
  private onMusicStateChangeCb: (() => void) | null = null;

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
      const savedTrack = window.localStorage.getItem(MUSIC_TRACK_KEY);
      if (savedTrack && MUSIC_TRACKS.some((tr) => tr.id === savedTrack)) {
        this.selectedTrackId = savedTrack;
        this.activeShuffleTrackId = savedTrack;
      }
      const savedShuffle = window.localStorage.getItem(MUSIC_SHUFFLE_KEY);
      if (savedShuffle === '1') {
        this.shuffleEnabled = true;
      }
    } catch {
      // Ignore storage errors
    }
  }

  public setOnMusicStateChange(cb: (() => void) | null): void {
    this.onMusicStateChangeCb = cb;
  }

  private notifyMusicChange(): void {
    this.onMusicStateChangeCb?.();
  }

  public getTracks(): MusicTrack[] {
    return MUSIC_TRACKS;
  }

  public getSelectedTrackId(): string {
    return this.selectedTrackId;
  }

  public getSelectedTrack(): MusicTrack {
    return getMusicTrackById(this.selectedTrackId);
  }

  public getPreviewTrackId(): string | null {
    return this.previewTrackId;
  }

  public isPreviewing(): boolean {
    return this.previewTrackId !== null;
  }

  public isShuffleEnabled(): boolean {
    return this.shuffleEnabled;
  }

  public getActivePlayingTrack(): MusicTrack {
    if (this.previewTrackId) return getMusicTrackById(this.previewTrackId);
    if (this.shuffleEnabled) return getMusicTrackById(this.activeShuffleTrackId);
    return getMusicTrackById(this.selectedTrackId);
  }

  public toggleShuffle(): boolean {
    this.shuffleEnabled = !this.shuffleEnabled;
    if (this.shuffleEnabled) {
      this.activeShuffleTrackId = this.selectedTrackId;
      this.loopCount = 0;
    }
    try {
      window.localStorage.setItem(MUSIC_SHUFFLE_KEY, this.shuffleEnabled ? '1' : '0');
    } catch {
      // Ignore
    }
    if (!this.previewTrackId && this.musicEnabled) {
      this.restartMusicLoop(false);
    }
    this.notifyMusicChange();
    return this.shuffleEnabled;
  }

  /**
   * Auditions a track live inside the Discoteca before the player chooses it.
   * Plays audibly even if music is muted, and never overwrites selectedTrackId.
   */
  public startPreview(trackId: string): void {
    const track = getMusicTrackById(trackId);
    this.previewTrackId = track.id;
    this.musicStep = 0;
    this.unlock();
    this.syncMasterGains();
    this.restartMusicLoop(true);
    this.notifyMusicChange();
  }

  /**
   * Stops live preview and restores the player's chosen soundtrack (or silence if music is OFF).
   */
  public stopPreview(): void {
    if (!this.previewTrackId) return;
    this.previewTrackId = null;
    this.syncMasterGains();
    if (this.musicEnabled && this.musicVolume > 0) {
      this.musicStep = 0;
      this.restartMusicLoop(false);
    } else {
      this.stopMusicLoop();
    }
    this.notifyMusicChange();
  }

  /**
   * Selects a track as the player's chosen soundtrack, saves to localStorage,
   * enables music if muted, and seamlessly keeps playing it into the game.
   */
  public selectTrack(trackId: string): MusicTrack {
    const track = getMusicTrackById(trackId);
    const wasPreviewingSame = this.previewTrackId === track.id;
    this.selectedTrackId = track.id;
    this.activeShuffleTrackId = track.id;
    this.shuffleEnabled = false;
    this.previewTrackId = null;
    this.loopCount = 0;

    if (!this.musicEnabled) {
      this.musicEnabled = true;
      try {
        window.localStorage.setItem(MUSIC_KEY, '1');
      } catch {
        // Ignore
      }
    }
    if (this.musicVolume === 0) {
      this.musicVolume = 3;
      try {
        window.localStorage.setItem(MUSIC_VOL_KEY, '3');
      } catch {
        // Ignore
      }
    }
    try {
      window.localStorage.setItem(MUSIC_TRACK_KEY, track.id);
      window.localStorage.setItem(MUSIC_SHUFFLE_KEY, '0');
    } catch {
      // Ignore
    }

    this.unlock();
    this.syncMasterGains();
    if (!wasPreviewingSame || this.musicInterval === null || this.currentIntervalMs !== track.stepMs) {
      this.musicStep = 0;
      this.restartMusicLoop(true);
    }
    this.notifyMusicChange();
    return track;
  }

  private syncMasterGains(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.musicMasterGain) {
      let target = this.musicEnabled ? this.musicVolume / 5 : 0;
      if (this.previewTrackId !== null) {
        // Ensure preview is clearly audible even if gameplay music is currently muted or 0
        target = Math.max(target, this.musicVolume > 0 ? this.musicVolume / 5 : 0.6);
      }
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
    } else if (!this.previewTrackId) {
      this.stopMusicLoop();
    }
    this.syncMasterGains();
    this.notifyMusicChange();
    return this.musicEnabled;
  }

  private ensureNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
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

        // Warm Nordic Fjord Shimmer Delay Bus (dry + soft filtered echo)
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 1.0;
        this.musicBus.connect(this.musicMasterGain);

        try {
          const delay = this.ctx.createDelay(1.0);
          delay.delayTime.value = 0.34;
          const delayFilter = this.ctx.createBiquadFilter();
          delayFilter.type = 'lowpass';
          delayFilter.frequency.value = 980;
          const feedback = this.ctx.createGain();
          feedback.gain.value = 0.24;
          const wet = this.ctx.createGain();
          wet.gain.value = 0.22;

          this.musicBus.connect(delay);
          delay.connect(delayFilter);
          delayFilter.connect(feedback);
          feedback.connect(delay);
          delayFilter.connect(wet);
          wet.connect(this.musicMasterGain);
        } catch {
          // Fallback to dry bus only if DelayNode unsupported
        }

        this.sfxMasterGain = this.ctx.createGain();
        this.sfxMasterGain.connect(this.ctx.destination);
        this.syncMasterGains();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().then(() => {
        if (this.musicStep === 0 && (this.previewTrackId !== null || (this.musicEnabled && this.musicVolume > 0))) {
          this.playMusicBeat();
        }
      });
    }
    if (this.musicEnabled || this.previewTrackId !== null) {
      this.startMusicLoop();
    }
  }

  private startMusicLoop(): void {
    const track = this.getActivePlayingTrack();
    if (
      this.musicInterval !== null &&
      this.currentIntervalMs === track.stepMs
    ) {
      return;
    }
    this.restartMusicLoop(false);
  }

  private restartMusicLoop(triggerImmediately: boolean): void {
    this.stopMusicLoop();
    if (typeof window === 'undefined' || !window.setInterval) return;
    const track = this.getActivePlayingTrack();
    this.currentIntervalMs = track.stepMs;
    if (triggerImmediately) {
      this.playMusicBeat();
    }
    this.musicInterval = window.setInterval(() => {
      this.playMusicBeat();
    }, track.stepMs);
  }

  private stopMusicLoop(): void {
    if (this.musicInterval !== null && typeof window !== 'undefined' && window.clearInterval) {
      window.clearInterval(this.musicInterval);
      this.musicInterval = null;
      this.currentIntervalMs = 0;
    }
  }

  private playInstrumentNote(
    ctx: AudioContext,
    out: AudioNode,
    voice: LeadInstrument,
    freq: number,
    now: number,
    vol: number,
    filterHz: number,
    stepSec: number
  ): void {
    if (voice === 'lyre') {
      // Classic Corona warm plucked Nordic lyre (triangle + faint 2nd harmonic)
      const osc = ctx.createOscillator();
      const harm = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const hGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      harm.type = 'sine';
      harm.frequency.setValueAtTime(freq * 2, now);
      hGain.gain.setValueAtTime(0.16, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterHz, now);
      const decay = Math.max(1.2, stepSec * 2.4);
      gain.gain.setValueAtTime(0.0005, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.045);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + decay);

      osc.connect(filter);
      harm.connect(hGain);
      hGain.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc.start(now);
      harm.start(now);
      osc.stop(now + decay + 0.06);
      harm.stop(now + decay + 0.06);
      return;
    }

    if (voice === 'harp') {
      // Silky resonant harp pluck (sine body + warm triangle pluck)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterHz * 1.15, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(260, filterHz * 0.55), now + 0.8);

      const decay = Math.max(1.35, stepSec * 2.7);
      gain.gain.setValueAtTime(0.0005, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + decay);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + decay + 0.06);
      osc2.stop(now + decay + 0.06);
      return;
    }

    if (voice === 'flute') {
      // Airy wooden Nordic flute with gentle swell & subtle vibrato
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(4.8, now);
      lfoGain.gain.setValueAtTime(freq * 0.006, now);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterHz * 1.3, now);

      const dur = Math.max(0.9, stepSec * 1.75);
      gain.gain.setValueAtTime(0.0005, now);
      gain.gain.linearRampToValueAtTime(vol * 1.1, now + Math.min(0.18, dur * 0.28));
      gain.gain.exponentialRampToValueAtTime(0.0005, now + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc.start(now);
      lfo.start(now);
      osc.stop(now + dur + 0.05);
      lfo.stop(now + dur + 0.05);
      return;
    }

    if (voice === 'celesta') {
      // Crystalline ice-bell / celesta chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const g1 = ctx.createGain();
      const g2 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, now);

      const dur = Math.max(1.5, stepSec * 2.6);
      g1.gain.setValueAtTime(0.0005, now);
      g1.gain.linearRampToValueAtTime(vol, now + 0.012);
      g1.gain.exponentialRampToValueAtTime(0.0005, now + dur);

      g2.gain.setValueAtTime(0.0005, now);
      g2.gain.linearRampToValueAtTime(vol * 0.28, now + 0.008);
      g2.gain.exponentialRampToValueAtTime(0.0005, now + dur * 0.45);

      osc1.connect(g1);
      osc2.connect(g2);
      g1.connect(out);
      g2.connect(out);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + dur + 0.05);
      osc2.stop(now + dur * 0.5 + 0.05);
      return;
    }

    if (voice === 'lute') {
      // Crisp woody tavern lute pluck
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterHz * 1.45, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(240, filterHz * 0.38), now + 0.36);

      const dur = Math.max(0.55, stepSec * 1.75);
      gain.gain.setValueAtTime(0.0005, now);
      gain.gain.linearRampToValueAtTime(vol * 0.85, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + dur + 0.05);
      return;
    }

    if (voice === 'tagelharpa') {
      // Bowed Nordic horsehair fiddle (warm detuned sawtooth + triangle bow swell)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(freq * 0.997, now);
      osc2.frequency.setValueAtTime(freq * 1.003, now);

      filter.type = 'lowpass';
      filter.Q.value = 1.6;
      filter.frequency.setValueAtTime(filterHz * 0.82, now);

      const dur = Math.max(0.85, stepSec * 1.9);
      gain.gain.setValueAtTime(0.0005, now);
      gain.gain.linearRampToValueAtTime(vol * 0.82, now + Math.min(0.16, dur * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.0005, now + dur);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + dur + 0.05);
      osc2.stop(now + dur + 0.05);
      return;
    }

    // 'horn_soft' — mellow distant Nordic wood/brass horn
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 0.5, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(720, filterHz * 0.72), now);

    const dur = Math.max(1.05, stepSec * 2.1);
    gain.gain.setValueAtTime(0.0005, now);
    gain.gain.linearRampToValueAtTime(vol * 0.85, now + Math.min(0.22, dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0005, now + dur);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + dur + 0.05);
    osc2.stop(now + dur + 0.05);
  }

  private playDroneChord(
    ctx: AudioContext,
    out: AudioNode,
    rootFreq: number,
    now: number,
    vol: number,
    stepSec: number
  ): void {
    const dur = Math.max(2.2, stepSec * 4.2);
    // Warm fundamental sine + gentle fifth triangle
    const root = ctx.createOscillator();
    const fifth = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const fGain = ctx.createGain();

    root.type = 'sine';
    root.frequency.setValueAtTime(rootFreq, now);
    fifth.type = 'triangle';
    fifth.frequency.setValueAtTime(rootFreq * 1.5, now);
    fGain.gain.setValueAtTime(0.32, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(340, now);

    gain.gain.setValueAtTime(0.0005, now);
    gain.gain.linearRampToValueAtTime(vol, now + Math.min(0.42, dur * 0.18));
    gain.gain.exponentialRampToValueAtTime(0.0005, now + dur);

    root.connect(filter);
    fifth.connect(fGain);
    fGain.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    root.start(now);
    fifth.start(now);
    root.stop(now + dur + 0.08);
    fifth.stop(now + dur + 0.08);
  }

  private playPercHit(ctx: AudioContext, out: AudioNode, hit: PercHit, now: number): void {
    if (hit === 'kick') {
      // Soft Nordic bodhrán frame-drum thump
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(96, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.2);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.22);
      return;
    }
    if (hit === 'rim') {
      // Muted wooden frame tap
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(115, now + 0.045);
      gain.gain.setValueAtTime(0.022, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.065);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.075);
      return;
    }
    // 'shaker' — gentle filtered sand/leather brush
    const src = ctx.createBufferSource();
    src.buffer = this.ensureNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2800, now);
    filter.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.012, now);
    gain.gain.exponentialRampToValueAtTime(0.0004, now + 0.06);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(now);
    src.stop(now + 0.07);
  }

  private playMusicBeat(): void {
    const allowSound = this.previewTrackId !== null || (this.musicEnabled && this.musicVolume > 0);
    if (!allowSound || !this.ctx || !this.musicBus || this.ctx.state !== 'running') {
      return;
    }
    const ctx = this.ctx;
    const out = this.musicBus;
    const now = ctx.currentTime;
    const track = this.getActivePlayingTrack();
    const stepIdx = this.musicStep % track.lead.length;
    const useNight = this.nightMood && this.previewTrackId === null;
    const scale = useNight ? track.scaleNight : track.scaleDay;
    const bassPool = useNight ? track.bassPoolNight : track.bassPoolDay;
    const filterHz = useNight ? track.filterNightHz : track.filterDayHz;
    const stepSec = track.stepMs / 1000;

    // 1. Lead melody note
    const leadNoteIdx = track.lead[stepIdx];
    if (leadNoteIdx !== null && leadNoteIdx !== undefined) {
      const freq = scale[leadNoteIdx % scale.length];
      this.playInstrumentNote(ctx, out, track.leadVoice, freq, now, track.leadGain, filterHz, stepSec);
    }

    // 2. Harmony / arpeggio voice
    const harmNoteIdx = track.harmony[stepIdx];
    if (harmNoteIdx !== null && harmNoteIdx !== undefined) {
      const freq = scale[harmNoteIdx % scale.length];
      this.playInstrumentNote(
        ctx,
        out,
        track.harmonyVoice,
        freq,
        now + 0.012,
        track.harmonyGain,
        filterHz * 0.85,
        stepSec
      );
    }

    // 3. Resonant Nordic fifth drone bass
    const bassIdx = track.bass[stepIdx];
    if (bassIdx !== null && bassIdx !== undefined) {
      const rootFreq = bassPool[bassIdx % bassPool.length];
      this.playDroneChord(ctx, out, rootFreq, now, track.droneGain, stepSec);
    }

    // 4. Optional soft frame-drum / bodhrán pulse
    const percHit = track.perc ? track.perc[stepIdx] : null;
    if (percHit) {
      this.playPercHit(ctx, out, percHit, now);
    }

    this.musicStep += 1;

    // Optional Shuffle: rotate to the next Nordic composition every 2 full 32-step loops
    if (
      this.previewTrackId === null &&
      this.shuffleEnabled &&
      this.musicStep > 0 &&
      this.musicStep % track.lead.length === 0
    ) {
      this.loopCount += 1;
      if (this.loopCount >= 2) {
        this.loopCount = 0;
        const curIdx = MUSIC_TRACKS.findIndex((tr) => tr.id === this.activeShuffleTrackId);
        const nextTrack = MUSIC_TRACKS[(curIdx + 1) % MUSIC_TRACKS.length];
        this.activeShuffleTrackId = nextTrack.id;
        this.musicStep = 0;
        this.restartMusicLoop(false);
        this.notifyMusicChange();
      }
    }
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
