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
    state.flyingCoins = state.flyingCoins ?? [];
    state.rocks = state.rocks ?? [];
    state.farms = state.farms ?? [];
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
