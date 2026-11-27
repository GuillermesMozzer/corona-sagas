import { CENTER_X, type CrestConfig, type ResourceSize, type WorldState } from '../types';
import { ISLAND_DEFINITIONS } from '../world/islands';

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

export interface StoredSlotRaw {
  slot: number;
  savedAt: number;
  payloadJson: string;
  island: number;
  day: number;
  kingdomLevel: number;
  villagers: number;
  gold: number;
  diamonds: number;
}

export interface CloudSaveHooks {
  onSaveSlot?: (raw: StoredSlotRaw) => void;
  onDeleteSlot?: (slot: number) => void;
}

let activeAccountUid: string | null = null;
let cloudHooks: CloudSaveHooks = {};

export function setCloudSaveHooks(hooks: CloudSaveHooks): void {
  cloudHooks = hooks;
}

export function setSaveAccountNamespace(uid: string | null): void {
  activeAccountUid = uid ? uid.replace(/[^a-zA-Z0-9_-]/g, '_') : null;
}

function slotKey(slot: number, uidOverride?: string | null): string {
  const clamped = Math.max(0, Math.min(MAX_SAVE_SLOTS - 1, Math.floor(slot)));
  const ns = uidOverride !== undefined ? uidOverride : activeAccountUid;
  if (ns) return `corona_u_${ns}_slot_v2_${clamped}`;
  return `${SLOT_KEY_PREFIX}${clamped}`;
}

function sizeForVariant(v: number): ResourceSize {
  if (v === 0) return 'small';
  if (v === 1) return 'medium';
  return 'large';
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
  state.thorActivated = state.thorActivated ?? (state.unlockedGods.includes('thor') && state.activeGod === 'thor');
  state.unlockedMounts = state.unlockedMounts ?? ['starter'];
  state.flyingCoins = state.flyingCoins ?? [];
  state.fireTrails = state.fireTrails ?? [];
  state.lightningBolts = state.lightningBolts ?? [];
  state.godShrine = state.godShrine ?? null;
  state.mountShrine = state.mountShrine ?? null;
  state.puzzle = state.puzzle ?? null;
  state.rocks = (state.rocks ?? []).map((r) => ({ ...r, size: r.size ?? sizeForVariant(r.variant) }));
  state.trees = (state.trees ?? []).map((tr) => ({ ...tr, size: tr.size ?? sizeForVariant(tr.variant) }));
  state.farms = (state.farms ?? []).map((f) => ({
    ...f,
    storedFood: f.storedFood ?? 0,
    storedCoins: f.storedCoins ?? 0,
  }));
  state.banker = state.banker ?? {
    x: CENTER_X + 68,
    balance: 0,
    interestFraction: 0,
    lastDayYield: 0,
  };
  if (state.currentIsland >= 2 && !state.forge) {
    state.forge = {
      x: CENTER_X - 68,
      built: false,
      coinsPaid: 0,
      underConstruction: false,
      buildProgress: 0,
      smelting: false,
      smeltProgress: 0,
      smeltCoinsPaid: 0,
      smeltQueue: 0,
    };
  } else if (state.currentIsland === 1) {
    state.forge = state.forge ?? null;
  }
  if (!state.towers || state.towers.length === 0) {
    let tid = (state.nextId ?? 5000) + 1;
    state.towers = [
      { id: tid++, x: CENTER_X - 256, side: -1, tier: 'inner', level: 0, destroyed: false, previousLevel: 0, hp: 0, maxHp: 0, underConstruction: false, buildProgress: 0, targetLevel: 0, coinsPaid: 0, hitFlash: 0 },
      { id: tid++, x: CENTER_X + 256, side: 1, tier: 'inner', level: 0, destroyed: false, previousLevel: 0, hp: 0, maxHp: 0, underConstruction: false, buildProgress: 0, targetLevel: 0, coinsPaid: 0, hitFlash: 0 },
      { id: tid++, x: CENTER_X - 558, side: -1, tier: 'outer', level: 0, destroyed: false, previousLevel: 0, hp: 0, maxHp: 0, underConstruction: false, buildProgress: 0, targetLevel: 0, coinsPaid: 0, hitFlash: 0 },
      { id: tid++, x: CENTER_X + 558, side: 1, tier: 'outer', level: 0, destroyed: false, previousLevel: 0, hp: 0, maxHp: 0, underConstruction: false, buildProgress: 0, targetLevel: 0, coinsPaid: 0, hitFlash: 0 },
    ];
    state.nextId = tid + 1;
  }
  if (!state.islandBuffs) {
    state.islandBuffs =
      state.currentIsland >= 2
        ? [
            { kind: 'construction', x: CENTER_X - 495, active: false, coinsPaid: 0 },
            { kind: 'forge', x: CENTER_X + 518, active: false, coinsPaid: 0 },
          ]
        : [];
  }
  state.rockRegrowQueue = state.rockRegrowQueue ?? 0;
  state.rockRegrowTimer = state.rockRegrowTimer ?? 0;
  state.treeRegrowQueue = state.treeRegrowQueue ?? 0;
  state.treeRegrowTimer = state.treeRegrowTimer ?? 0;
  for (const def of ISLAND_DEFINITIONS) {
    const existing = state.islands.find((i) => i.id === def.id);
    if (!existing) {
      state.islands.push({
        id: def.id,
        colonized: false,
        visited: false,
        dockBuilt: false,
        boatBuilt: false,
        hallLevel: 0,
        wallsBuilt: 0,
        diamondsCollected: 0,
        godUnlocked: false,
        mountUnlocked: false,
        constructionBuff: false,
        forgeBuff: false,
      });
    } else {
      existing.constructionBuff = existing.constructionBuff ?? false;
      existing.forgeBuff = existing.forgeBuff ?? false;
    }
  }
  state.islands.sort((a, b) => a.id - b.id);
  for (const v of state.villagers ?? []) {
    v.assignedTowerId = v.assignedTowerId ?? null;
  }
  if (state.monarchs?.[0]) {
    const m = state.monarchs[0];
    m.flyTimer = m.flyTimer ?? 0;
    m.flyY = m.flyY ?? 0;
    m.roarTimer = m.roarTimer ?? 0;
    m.wolfBiteCooldown = m.wolfBiteCooldown ?? 0;
    m.maxCoins = Math.max(30, 30 + Math.max(0, (state.hall?.level ?? 1) - 1) * 5);
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

function buildRawSlotSummary(slot: number, payload: StoredPayload, payloadJson: string): StoredSlotRaw {
  const s = payload.state;
  return {
    slot,
    savedAt: payload.savedAt ?? Date.now(),
    payloadJson,
    island: s.currentIsland ?? 1,
    day: s.day ?? 1,
    kingdomLevel: s.hall?.level ?? 1,
    villagers: (s.villagers ?? []).filter((v) => v.role !== 'wanderer').length,
    gold: s.monarchs?.[0]?.coins ?? s.resources?.gold ?? 0,
    diamonds: s.monarchs?.[0]?.diamonds ?? s.resources?.diamonds ?? 0,
  };
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
    const serialized = JSON.stringify(payload);
    window.localStorage.setItem(slotKey(slot), serialized);
    cloudHooks.onSaveSlot?.(buildRawSlotSummary(slot, payload, serialized));
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
  const clamped = Math.max(0, Math.min(MAX_SAVE_SLOTS - 1, Math.floor(slotIndex)));
  try {
    window.localStorage.removeItem(slotKey(clamped));
  } catch {
    // Ignore
  }
  cloudHooks.onDeleteSlot?.(clamped);
}

/**
 * Lists raw serialized campaign payloads for the currently active account namespace.
 */
export function listRawSlotPayloads(): StoredSlotRaw[] {
  migrateLegacySaveIfNeeded();
  const out: StoredSlotRaw[] = [];
  for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
    try {
      const raw = window.localStorage.getItem(slotKey(i));
      if (!raw) continue;
      const payload = JSON.parse(raw) as StoredPayload;
      if (!payload || !payload.state || !payload.state.boat || !payload.state.islands) continue;
      out.push(buildRawSlotSummary(i, payload, raw));
    } catch {
      // Ignore corrupt slot
    }
  }
  return out;
}

/**
 * Writes a campaign payload downloaded from Google Cloud (Firestore) into the active account namespace.
 */
export function applyCloudSlotPayload(slot: number, payloadJson: string): boolean {
  const clamped = Math.max(0, Math.min(MAX_SAVE_SLOTS - 1, Math.floor(slot)));
  try {
    const payload = JSON.parse(payloadJson) as StoredPayload;
    if (!payload || !payload.state || !payload.state.boat || !payload.state.islands) return false;
    payload.slot = clamped;
    payload.state.saveSlot = clamped;
    window.localStorage.setItem(slotKey(clamped), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * On a player's very first Google sign-in on this device, migrates any pre-existing local guest
 * campaigns into the Google account namespace if the account has no campaigns yet.
 */
export function migrateGuestSlotsIfEmpty(): StoredSlotRaw[] {
  if (!activeAccountUid) return [];
  migrateLegacySaveIfNeeded();
  const migrated: StoredSlotRaw[] = [];
  for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
    try {
      if (window.localStorage.getItem(slotKey(i))) continue;
      const guestRaw = window.localStorage.getItem(slotKey(i, null));
      if (!guestRaw) continue;
      const payload = JSON.parse(guestRaw) as StoredPayload;
      if (!payload || !payload.state || !payload.state.boat || !payload.state.islands) continue;
      window.localStorage.setItem(slotKey(i), guestRaw);
      migrated.push(buildRawSlotSummary(i, payload, guestRaw));
    } catch {
      // Ignore
    }
  }
  return migrated;
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
