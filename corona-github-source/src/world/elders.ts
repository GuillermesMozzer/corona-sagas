import { CENTER_X, type Elder, type ElderId } from '../types';

export interface ElderDefinition {
  id: ElderId;
  /** Exclusive native island where this Elder's cottage appears (2, 3, 4, 5, 8 — never overlapping Staff Forges or basic Island 1!). */
  islandId: number;
  name: string;
  shortTitle: string;
  roleDesc: string;
  powerName: string;
  powerShortTag: string;
  powerCooldown: number;
  canLeaveWalls: boolean;
  /** Offset from island centerX for the Elder's forest cottage. */
  cottageOffset: number;
  /** Primary visual palette so every Elder is immediately recognizable. */
  cloakColor: string;
  trimColor: string;
  accentColor: string;
  rescueCoins: number;
}

export const ELDER_ORDER: ElderId[] = [
  'bard',
  'forge_elder',
  'builder_elder',
  'beast_elder',
  'war_elder',
];

export const ELDER_DEFS: Record<ElderId, ElderDefinition> = {
  bard: {
    id: 'bard',
    islandId: 8,
    name: 'Ancião Bardo',
    shortTitle: 'BARDO',
    roleDesc: 'Toca harpa nórdica, inspira súditos (+velocidade e moedas) e atrai errantes.',
    powerName: 'Balada Nórdica',
    powerShortTag: 'BALADA',
    powerCooldown: 16,
    canLeaveWalls: false,
    cottageOffset: -325,
    cloakColor: '#6d2d8a',
    trimColor: '#f7d265',
    accentColor: '#e89eff',
    rescueCoins: 4,
  },
  forge_elder: {
    id: 'forge_elder',
    islandId: 3,
    name: 'Ancião da Força',
    shortTitle: 'FORÇA',
    roleDesc: 'Somente com ele é possível forjar armaduras e converter minérios, pedras e madeiras.',
    powerName: 'Transmutar Recursos',
    powerShortTag: 'FORJAR',
    powerCooldown: 4,
    canLeaveWalls: false,
    cottageOffset: 980,
    cloakColor: '#7a2e1d',
    trimColor: '#ff9d42',
    accentColor: '#ffd166',
    rescueCoins: 4,
  },
  builder_elder: {
    id: 'builder_elder',
    islandId: 2,
    name: 'Ancião das Obras',
    shortTitle: 'OBRAS',
    roleDesc: 'Somente com ele muros, torres, fazendas e o Reino evoluem para níveis avançados.',
    powerName: 'Mestre das Obras',
    powerShortTag: 'OBRAS',
    powerCooldown: 18,
    canLeaveWalls: true,
    cottageOffset: -685,
    cloakColor: '#1f5c7a',
    trimColor: '#84e8ff',
    accentColor: '#aef4ff',
    rescueCoins: 4,
  },
  beast_elder: {
    id: 'beast_elder',
    islandId: 4,
    name: 'Ancião das Feras',
    shortTitle: 'FERAS',
    roleDesc: 'Encanta e atrai animais selvagens para dentro do reino para serem caçados.',
    powerName: 'Chamado das Feras',
    powerShortTag: 'FERAS',
    powerCooldown: 18,
    canLeaveWalls: false,
    cottageOffset: 685,
    cloakColor: '#24663b',
    trimColor: '#98f582',
    accentColor: '#6fe87b',
    rescueCoins: 4,
  },
  war_elder: {
    id: 'war_elder',
    islandId: 5,
    name: 'Ancião de Guerra',
    shortTitle: 'GUERRA',
    roleDesc: 'Toca a trombeta e convoca companhias (até 3 Espadachins, 3 Arqueiros e 3 Lanceiros) contra portais!',
    powerName: 'Trombeta de Ataque',
    powerShortTag: 'TROMBA',
    powerCooldown: 20,
    canLeaveWalls: true,
    cottageOffset: -980,
    cloakColor: '#8f1d24',
    trimColor: '#ffe066',
    accentColor: '#ff6b6b',
    rescueCoins: 4,
  },
};

export function canElderLeaveWalls(id: ElderId): boolean {
  return ELDER_DEFS[id].canLeaveWalls;
}

/**
 * Returns the single unrescued Elder whose cottage belongs on `islandId`, or null.
 * Strictly spread across Islands 2, 3, 4, 5, and 8 — never on basic Island 1 or Staff Forge islands (6, 7, 9)!
 */
export function getIslandNativeElderId(islandId: number): ElderId | null {
  for (const id of ELDER_ORDER) {
    if (ELDER_DEFS[id].islandId === islandId) return id;
  }
  return null;
}

export function createDefaultElders(
  cx = CENTER_X,
  rescuedIds: ElderId[] = [],
  islandId = 1
): Elder[] {
  const rescuedSet = new Set(rescuedIds);
  const nativeId = getIslandNativeElderId(islandId);
  const out: Elder[] = [];

  ELDER_ORDER.forEach((id, idx) => {
    const def = ELDER_DEFS[id];
    const rescued = rescuedSet.has(id);
    // Rescued Elders travel with the kingdom; unrescued Elder cottages ONLY appear on their native island!
    if (!rescued && id !== nativeId) return;
    const cottageX = cx + def.cottageOffset;
    const startX = rescued ? cx + (idx - 2) * 28 : cottageX;
    out.push({
      id,
      cottageX,
      x: startX,
      vx: 0,
      facing: def.cottageOffset < 0 ? 1 : -1,
      state: rescued ? 'walking' : 'cottage',
      rescued,
      rescueCoinsPaid: rescued ? def.rescueCoins : 0,
      ridingMonarchId: null,
      targetX: startX,
      animTime: idx * 1.3,
      abilityTimer: 4 + idx * 2,
      activeCooldown: 0,
    });
  });

  return out;
}
