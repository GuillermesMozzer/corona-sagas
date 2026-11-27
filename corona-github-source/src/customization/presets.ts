import type { CharacterAppearance, CrestConfig, ShieldPattern, ShieldShape } from '../types';

export interface OutfitPreset {
  name: string;
  tunic: string;
  trim: string;
  skin: string;
  hasBeard: boolean;
  hasHood: boolean;
}

export interface HairPreset {
  name: string;
  color: string;
}

export interface HorsePreset {
  name: string;
  coat: string;
  mane: string;
  legs: string;
}

export interface CrownPreset {
  name: string;
  gold: string;
  shine: string;
}

export const OUTFIT_PRESETS: OutfitPreset[] = [
  { name: 'Jarl Clássico', tunic: '#2f3e4f', trim: '#8f6c42', skin: '#ebc4a2', hasBeard: true, hasHood: false },
  { name: 'Escudeira do Norte', tunic: '#3b4a42', trim: '#a6875b', skin: '#f0cbb0', hasBeard: false, hasHood: false },
  { name: 'Viajante Boreal', tunic: '#3d3545', trim: '#788594', skin: '#d4a17e', hasBeard: true, hasHood: true },
  { name: 'Guardião de Ferro', tunic: '#4a5562', trim: '#b3bec9', skin: '#b57c58', hasBeard: false, hasHood: false },
];

export const HAIR_PRESETS: HairPreset[] = [
  { name: 'Ruivo Nórdico', color: '#b5562b' },
  { name: 'Loiro Gelo', color: '#d9b968' },
  { name: 'Castanho Escuro', color: '#4a3020' },
  { name: 'Grisalho Antigo', color: '#b8c3cf' },
];

export const HORSE_PRESETS: HorsePreset[] = [
  { name: 'Alazão Comum', coat: '#8a5838', mane: '#4a2c1a', legs: '#5e3922' },
  { name: 'Cinza de Fiorde', coat: '#9ca8b5', mane: '#54606e', legs: '#6d7885' },
  { name: 'Pardo da Neve', coat: '#c4b196', mane: '#7d6a54', legs: '#8c7963' },
  { name: 'Corcel Sombrio', coat: '#3c404a', mane: '#1f2229', legs: '#272a33' },
];

export const CROWN_PRESETS: CrownPreset[] = [
  { name: 'Coroa Real', gold: '#f7c948', shine: '#fff3b0' },
  { name: 'Diadema de Bronze', gold: '#d98c45', shine: '#ffd199' },
  { name: 'Coroa de Prata', gold: '#c7d5e2', shine: '#ffffff' },
];

export const SHIELD_SHAPES: Array<{ id: ShieldShape; name: string }> = [
  { id: 'round', name: 'Circular Viking' },
  { id: 'kite', name: 'Escudo Gota' },
  { id: 'hex', name: 'Hexagonal Rúnico' },
  { id: 'heater', name: 'Escudo de Clã' },
];

export const SHIELD_PATTERNS: Array<{ id: ShieldPattern; name: string }> = [
  { id: 'valknut', name: 'Valknut' },
  { id: 'mjolnir', name: 'Mjölnir' },
  { id: 'axes', name: 'Machados' },
  { id: 'vegvisir', name: 'Vegvísir' },
  { id: 'raven', name: 'Corvo' },
  { id: 'cross', name: 'Cruz Nórdica' },
];

export const CREST_BG_COLORS: Array<{ name: string; hex: string }> = [
  { name: 'Carmesim', hex: '#9e232e' },
  { name: 'Azul Fiorde', hex: '#234c7d' },
  { name: 'Verde Pinho', hex: '#285e46' },
  { name: 'Obsidiana', hex: '#212630' },
  { name: 'Roxo Helheim', hex: '#542c6b' },
  { name: 'Ocre Real', hex: '#8f5f1e' },
  { name: 'Cinza Aço', hex: '#4d5b69' },
  { name: 'Carvalho', hex: '#5c3824' },
];

export const CREST_FG_COLORS: Array<{ name: string; hex: string }> = [
  { name: 'Ouro', hex: '#efc462' },
  { name: 'Prata', hex: '#dce7f2' },
  { name: 'Ciano Rúnico', hex: '#64e8ff' },
  { name: 'Carmesim Vivo', hex: '#e64754' },
  { name: 'Âmbar Fogo', hex: '#ff9638' },
  { name: 'Aurora', hex: '#5be0a8' },
  { name: 'Branco Neve', hex: '#ffffff' },
  { name: 'Carvão', hex: '#181c24' },
];

export function defaultAppearance(): CharacterAppearance {
  return { gender: 'king', name: '', outfitIndex: 0, hairIndex: 0, horseIndex: 0, crownIndex: 0 };
}

export function defaultCrest(): CrestConfig {
  return {
    shape: 'round',
    pattern: 'valknut',
    primaryColor: CREST_BG_COLORS[0].hex,
    secondaryColor: CREST_FG_COLORS[0].hex,
    locked: false,
  };
}

/**
 * Draws the player's customized Nordic shield emblem in pixel-art style at (cx, cy) with given half-size `r`.
 */
export function drawShieldEmblem(
  ctx: CanvasRenderingContext2D,
  crest: CrestConfig,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));

  const traceShape = (radius: number) => {
    ctx.beginPath();
    if (crest.shape === 'round') {
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
    } else if (crest.shape === 'kite') {
      ctx.moveTo(-radius * 0.78, -radius * 0.68);
      ctx.quadraticCurveTo(0, -radius * 1.05, radius * 0.78, -radius * 0.68);
      ctx.lineTo(radius * 0.65, radius * 0.15);
      ctx.lineTo(0, radius * 1.12);
      ctx.lineTo(-radius * 0.65, radius * 0.15);
      ctx.closePath();
    } else if (crest.shape === 'hex') {
      const w = radius * 0.85;
      const h = radius;
      ctx.moveTo(0, -h);
      ctx.lineTo(w, -h * 0.5);
      ctx.lineTo(w, h * 0.45);
      ctx.lineTo(0, h);
      ctx.lineTo(-w, h * 0.45);
      ctx.lineTo(-w, -h * 0.5);
      ctx.closePath();
    } else {
      // heater / clan shield
      const w = radius * 0.86;
      ctx.moveTo(-w, -radius * 0.85);
      ctx.lineTo(w, -radius * 0.85);
      ctx.lineTo(w, radius * 0.05);
      ctx.quadraticCurveTo(w * 0.82, radius * 0.72, 0, radius * 1.02);
      ctx.quadraticCurveTo(-w * 0.82, radius * 0.72, -w, radius * 0.05);
      ctx.closePath();
    }
  };

  // Metallic Nordic iron rim
  traceShape(r + Math.max(1.5, r * 0.1));
  ctx.fillStyle = '#8b99a8';
  ctx.fill();

  // Inner dark shadow edge
  traceShape(r + Math.max(0.5, r * 0.03));
  ctx.fillStyle = '#252d38';
  ctx.fill();

  // Shield primary background fill
  traceShape(r);
  ctx.fillStyle = crest.primaryColor;
  ctx.fill();

  // Clip interior for Nordic pattern
  ctx.save();
  traceShape(r * 0.94);
  ctx.clip();

  // Subtle vertical wood plank shading
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(-r, -r, r * 0.45, r * 2.2);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(r * 0.35, -r, r * 0.22, r * 2.2);

  // Draw chosen Nordic pattern in secondaryColor
  ctx.fillStyle = crest.secondaryColor;
  ctx.strokeStyle = crest.secondaryColor;
  const lw = Math.max(1.5, r * 0.13);
  ctx.lineWidth = lw;

  if (crest.pattern === 'valknut') {
    const tri = (ox: number, oy: number, s: number) => {
      ctx.beginPath();
      ctx.moveTo(ox, oy - s);
      ctx.lineTo(ox + s * 0.9, oy + s * 0.65);
      ctx.lineTo(ox - s * 0.9, oy + s * 0.65);
      ctx.closePath();
      ctx.stroke();
    };
    tri(0, -r * 0.16, r * 0.34);
    tri(-r * 0.24, r * 0.22, r * 0.32);
    tri(r * 0.24, r * 0.22, r * 0.32);
  } else if (crest.pattern === 'mjolnir') {
    // Handle
    ctx.fillRect(-r * 0.1, -r * 0.62, r * 0.2, r * 0.72);
    // Hammer head
    ctx.beginPath();
    ctx.moveTo(-r * 0.56, r * 0.05);
    ctx.lineTo(r * 0.56, r * 0.05);
    ctx.lineTo(r * 0.42, r * 0.58);
    ctx.lineTo(-r * 0.42, r * 0.58);
    ctx.closePath();
    ctx.fill();
    // Pommel ring
    ctx.fillRect(-r * 0.16, -r * 0.72, r * 0.32, r * 0.12);
  } else if (crest.pattern === 'axes') {
    // Two crossed Viking battle axes
    ctx.beginPath();
    ctx.moveTo(-r * 0.52, r * 0.56);
    ctx.lineTo(r * 0.52, -r * 0.56);
    ctx.moveTo(r * 0.52, r * 0.56);
    ctx.lineTo(-r * 0.52, -r * 0.56);
    ctx.stroke();
    // Axe blades
    ctx.fillRect(-r * 0.62, -r * 0.52, r * 0.32, r * 0.34);
    ctx.fillRect(r * 0.3, -r * 0.52, r * 0.32, r * 0.34);
  } else if (crest.pattern === 'vegvisir') {
    // 8-spoke Nordic compass staves
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const ex = Math.cos(a) * r * 0.64;
      const ey = Math.sin(a) * r * 0.64;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // Crossbar tip
      const px = -Math.sin(a) * r * 0.16;
      const py = Math.cos(a) * r * 0.16;
      ctx.beginPath();
      ctx.moveTo(ex * 0.78 - px, ey * 0.78 - py);
      ctx.lineTo(ex * 0.78 + px, ey * 0.78 + py);
      ctx.stroke();
    }
  } else if (crest.pattern === 'raven') {
    // Stylized Viking Raven silhouette with spread wings
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.58);
    ctx.lineTo(r * 0.18, -r * 0.35);
    ctx.lineTo(r * 0.72, -r * 0.22);
    ctx.lineTo(r * 0.48, r * 0.16);
    ctx.lineTo(r * 0.15, r * 0.08);
    ctx.lineTo(r * 0.22, r * 0.58);
    ctx.lineTo(0, r * 0.42);
    ctx.lineTo(-r * 0.22, r * 0.58);
    ctx.lineTo(-r * 0.15, r * 0.08);
    ctx.lineTo(-r * 0.48, r * 0.16);
    ctx.lineTo(-r * 0.72, -r * 0.22);
    ctx.lineTo(-r * 0.18, -r * 0.35);
    ctx.closePath();
    ctx.fill();
  } else {
    // Nordic Cross + rune diamonds
    ctx.fillRect(-r * 0.16, -r, r * 0.32, r * 2.1);
    ctx.fillRect(-r, -r * 0.22, r * 2.1, r * 0.32);
  }

  ctx.restore();

  // Center iron boss for round Viking shield
  if (crest.shape === 'round' && r >= 10) {
    ctx.fillStyle = '#aebbc9';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2, r * 0.14), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
