import type { CrestConfig, WorldState } from '../types';

const SAVE_KEY = 'corona_campaign_save_v1';

export interface SavedCampaignSummary {
  day: number;
  crest: CrestConfig;
  villagers: number;
  gold: number;
  savedAt: number;
}

interface StoredPayload {
  version: 1;
  savedAt: number;
  state: WorldState;
}

export function saveCampaign(w: WorldState): void {
  if (!w.crest.locked) return;
  try {
    const cleanState: WorldState = {
      ...w,
      mode: 'playing',
      activeCommand: 'none',
      touchCommandMode: 'none',
      commandFeedback: null,
      touchIndicator: null,
      activePrompt: null,
      flyingCoins: [],
    };
    const payload: StoredPayload = {
      version: 1,
      savedAt: Date.now(),
      state: cleanState,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or sandbox restrictions gracefully
  }
}

export function loadCampaign(): WorldState | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as StoredPayload;
    if (!payload || payload.version !== 1 || !payload.state) return null;
    const state = payload.state;
    state.mode = 'playing';
    state.activeCommand = 'none';
    state.touchCommandMode = 'none';
    state.commandFeedback = null;
    state.touchIndicator = null;
    state.nightWaveStage = state.nightWaveStage ?? 0;
    state.viewWidth = state.viewWidth ?? 480;
    state.viewHeight = state.viewHeight ?? 270;
    state.dayHalfMinutes = state.dayHalfMinutes ?? 3;
    state.currentIsland = state.currentIsland ?? 1;
    state.threatLevel = state.threatLevel ?? 1;
    state.worldMapContext = 'inspect';
    state.unlockedGods = state.unlockedGods ?? [];
    state.unlockedMounts = state.unlockedMounts ?? ['starter'];
    state.flyingCoins = state.flyingCoins ?? [];
    state.fireTrails = state.fireTrails ?? [];
    state.lightningBolts = state.lightningBolts ?? [];
    state.godShrine = state.godShrine ?? null;
    state.mountShrine = state.mountShrine ?? null;
    state.puzzle = state.puzzle ?? null;
    state.rocks = state.rocks ?? [];
    state.farms = state.farms ?? [];
    if (state.monarchs?.[0]) {
      const m = state.monarchs[0];
      m.flyTimer = m.flyTimer ?? 0;
      m.flyY = m.flyY ?? 0;
      m.roarTimer = m.roarTimer ?? 0;
      m.wolfBiteCooldown = m.wolfBiteCooldown ?? 0;
    }
    if (!state.boat || !state.dock || !state.islands) return null;
    return state;
  } catch {
    return null;
  }
}

export function getSavedCampaignSummary(): SavedCampaignSummary | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as StoredPayload;
    if (!payload || payload.version !== 1 || !payload.state) return null;
    const s = payload.state;
    return {
      day: s.day,
      crest: s.crest,
      villagers: s.villagers.filter((v) => v.role !== 'wanderer').length,
      gold: s.monarchs[0]?.coins ?? s.resources.gold,
      savedAt: payload.savedAt,
    };
  } catch {
    return null;
  }
}

export function hasSavedCampaign(): boolean {
  return getSavedCampaignSummary() !== null;
}
