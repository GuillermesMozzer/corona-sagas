import type { CrestConfig, WorldState } from '../types';

export const MAX_SAVE_SLOTS = 8;

const LEGACY_SAVE_KEY = 'corona_campaign_save_v1';
const SLOT_KEY_PREFIX = 'corona_campaign_slot_v2_';
const TUTORIAL_DONE_KEY = 'corona_tutorial_done_v1';

export function isTutorialCompleted(): boolean {
  try {
    return window.localStorage.getItem(TUTORIAL_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialCompleted(): void {
  try {
    window.localStorage.setItem(TUTORIAL_DONE_KEY, '1');
  } catch {
    // Ignore
  }
}

export interface SavedCampaignSummary {
  slot: number;
  island: number;
  day: number;
  crest: CrestConfig;
  villagers: number;
  gold: number;
  diamonds: number;
  savedAt: number;
}

interface StoredPayload {
  version: 2;
  slot: number;
  savedAt: number;
  state: WorldState;
}

interface LegacyPayload {
  version: 1;
  savedAt: number;
  state: WorldState;
}

function slotKey(slot: number): string {
  const clamped = Math.max(0, Math.min(MAX_SAVE_SLOTS - 1, Math.floor(slot)));
  return `${SLOT_KEY_PREFIX}${clamped}`;
}

function hydrateState(state: WorldState, slot: number): WorldState | null {
  if (!state || !state.boat || !state.dock || !state.islands) return null;
  state.mode = 'playing';
  state.saveSlot = slot;
  state.tutorial = state.tutorial ?? null;
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
  return state;
}

/**
 * One-time migration from the single-slot v1 key into Slot 1 (index 0)
 * so existing players never lose their progress when upgrading to 8 slots.
 */
function migrateLegacySaveIfNeeded(): void {
  try {
    const rawLegacy = window.localStorage.getItem(LEGACY_SAVE_KEY);
    if (!rawLegacy) return;
    if (window.localStorage.getItem(slotKey(0))) return;
    const legacy = JSON.parse(rawLegacy) as LegacyPayload;
    if (!legacy || !legacy.state || !legacy.state.boat || !legacy.state.dock || !legacy.state.islands) return;
    const migrated: StoredPayload = {
      version: 2,
      slot: 0,
      savedAt: legacy.savedAt || Date.now(),
      state: { ...legacy.state, saveSlot: 0 },
    };
    window.localStorage.setItem(slotKey(0), JSON.stringify(migrated));
    window.localStorage.removeItem(LEGACY_SAVE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function saveCampaign(w: WorldState, slotOverride?: number): void {
  if (!w.crest.locked) return;
  const slot = Math.max(0, Math.min(MAX_SAVE_SLOTS - 1, Math.floor(slotOverride ?? w.saveSlot ?? 0)));
  w.saveSlot = slot;
  try {
    const cleanState: WorldState = {
      ...w,
      mode: 'playing',
      saveSlot: slot,
      activeCommand: 'none',
      touchCommandMode: 'none',
      commandFeedback: null,
      touchIndicator: null,
      activePrompt: null,
      flyingCoins: [],
    };
    const payload: StoredPayload = {
      version: 2,
      slot,
      savedAt: Date.now(),
      state: cleanState,
    };
    window.localStorage.setItem(slotKey(slot), JSON.stringify(payload));
  } catch {
    // Ignore storage quota or sandbox restrictions gracefully
  }
}

export function loadCampaign(slotIndex?: number): WorldState | null {
  migrateLegacySaveIfNeeded();
  try {
    const targetSlot =
      typeof slotIndex === 'number'
        ? Math.max(0, Math.min(MAX_SAVE_SLOTS - 1, Math.floor(slotIndex)))
        : (getSavedCampaignSummary()?.slot ?? 0);
    const raw = window.localStorage.getItem(slotKey(targetSlot));
    if (!raw) return null;
    const payload = JSON.parse(raw) as StoredPayload;
    if (!payload || !payload.state) return null;
    return hydrateState(payload.state, targetSlot);
  } catch {
    return null;
  }
}

export function deleteCampaignSlot(slotIndex: number): void {
  try {
    window.localStorage.removeItem(slotKey(slotIndex));
  } catch {
    // Ignore
  }
}

export function listCampaignSlots(): Array<SavedCampaignSummary | null> {
  migrateLegacySaveIfNeeded();
  const list: Array<SavedCampaignSummary | null> = [];
  for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
    try {
      const raw = window.localStorage.getItem(slotKey(i));
      if (!raw) {
        list.push(null);
        continue;
      }
      const payload = JSON.parse(raw) as StoredPayload;
      if (!payload || !payload.state || !payload.state.boat || !payload.state.islands) {
        list.push(null);
        continue;
      }
      const s = payload.state;
      list.push({
        slot: i,
        island: s.currentIsland ?? 1,
        day: s.day ?? 1,
        crest: s.crest,
        villagers: s.villagers.filter((v) => v.role !== 'wanderer').length,
        gold: s.monarchs[0]?.coins ?? s.resources.gold ?? 0,
        diamonds: s.monarchs[0]?.diamonds ?? s.resources.diamonds ?? 0,
        savedAt: payload.savedAt ?? Date.now(),
      });
    } catch {
      list.push(null);
    }
  }
  return list;
}

export function countSavedCampaigns(): number {
  return listCampaignSlots().filter((s) => s !== null).length;
}

export function findFirstEmptySlot(): number {
  const slots = listCampaignSlots();
  return slots.findIndex((s) => s === null);
}

export function getSavedCampaignSummary(): SavedCampaignSummary | null {
  const filled = listCampaignSlots().filter((s): s is SavedCampaignSummary => s !== null);
  if (filled.length === 0) return null;
  filled.sort((a, b) => b.savedAt - a.savedAt);
  return filled[0];
}

export function hasSavedCampaign(): boolean {
  return getSavedCampaignSummary() !== null;
}

/**
 * Exports all 8 campaign slots to a portable JSON backup file so players can
 * preserve their campaigns forever across browsers and devices.
 */
export function exportAllSavesJson(): string {
  migrateLegacySaveIfNeeded();
  const slots: Record<string, StoredPayload> = {};
  for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
    try {
      const raw = window.localStorage.getItem(slotKey(i));
      if (!raw) continue;
      const parsed = JSON.parse(raw) as StoredPayload;
      if (parsed && parsed.state) {
        slots[String(i)] = parsed;
      }
    } catch {
      // Ignore corrupt slot
    }
  }
  return JSON.stringify(
    {
      app: 'corona-sagas',
      backupVersion: 2,
      exportedAt: new Date().toISOString(),
      slots,
    },
    null,
    2
  );
}

/**
 * Imports campaign slots from a previously exported JSON backup.
 * Returns the number of slots successfully restored.
 */
export function importAllSavesJson(rawJson: string): number {
  try {
    const data = JSON.parse(rawJson) as {
      app?: string;
      slots?: Record<string, StoredPayload>;
    };
    if (!data || data.app !== 'corona-sagas' || !data.slots || typeof data.slots !== 'object') {
      return 0;
    }
    let imported = 0;
    for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
      const entry = data.slots[String(i)];
      if (entry && entry.state && entry.state.boat && entry.state.islands) {
        const clean: StoredPayload = {
          version: 2,
          slot: i,
          savedAt: entry.savedAt || Date.now(),
          state: { ...entry.state, saveSlot: i },
        };
        window.localStorage.setItem(slotKey(i), JSON.stringify(clean));
        imported++;
      }
    }
    return imported;
  } catch {
    return 0;
  }
}
