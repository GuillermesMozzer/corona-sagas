import {
  CREST_BG_COLORS,
  CREST_FG_COLORS,
  CROWN_PRESETS,
  HAIR_PRESETS,
  HORSE_PRESETS,
  OUTFIT_PRESETS,
  SHIELD_PATTERNS,
  SHIELD_SHAPES,
  drawShieldEmblem,
} from '../customization/presets';
import { getSavedCampaignSummary } from '../storage/saveSystem';
import {
  GROUND_Y,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  WATER_Y,
  WORLD_WIDTH,
  type CommandMode,
  type Enemy,
  type Monarch,
  type Villager,
  type WorldState,
} from '../types';

export interface UiHitRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRGB(c1: RGB, c2: RGB, t: number): RGB {
  return {
    r: Math.round(lerp(c1.r, c2.r, t)),
    g: Math.round(lerp(c1.g, c2.g, t)),
    b: Math.round(lerp(c1.b, c2.b, t)),
  };
}

function rgbStr(c: RGB, alpha = 1): string {
  return alpha >= 1
    ? `rgb(${c.r},${c.g},${c.b})`
    : `rgba(${c.r},${c.g},${c.b},${alpha.toFixed(3)})`;
}

const SKY_TOP_DAWN: RGB = { r: 44, g: 58, b: 92 };
const SKY_BOT_DAWN: RGB = { r: 214, g: 132, b: 102 };
const SKY_TOP_DAY: RGB = { r: 58, g: 94, b: 134 };
const SKY_BOT_DAY: RGB = { r: 162, g: 196, b: 216 };
const SKY_TOP_DUSK: RGB = { r: 34, g: 36, b: 68 };
const SKY_BOT_DUSK: RGB = { r: 192, g: 92, b: 78 };
const SKY_TOP_NIGHT: RGB = { r: 8, g: 15, b: 28 };
const SKY_BOT_NIGHT: RGB = { r: 20, g: 38, b: 58 };
const SKY_BOT_BLOOD: RGB = { r: 78, g: 24, b: 36 };

export class PixelRenderer {
  private reflectionCanvas: HTMLCanvasElement;
  private reflectionCtx: CanvasRenderingContext2D;
  private stars: Array<{ x: number; y: number; phase: number; size: number }>;
  public hitRegions: UiHitRegion[] = [];
  public charSelectFocusRow = 0; // 0..3
  public crestSelectFocusRow = 0; // 0..3

  constructor() {
    this.reflectionCanvas = document.createElement('canvas');
    this.reflectionCanvas.width = LOGICAL_WIDTH;
    this.reflectionCanvas.height = WATER_Y;
    const rCtx = this.reflectionCanvas.getContext('2d');
    if (!rCtx) throw new Error('Failed to create reflection canvas context');
    this.reflectionCtx = rCtx;
    this.reflectionCtx.imageSmoothingEnabled = false;

    this.stars = [];
    for (let i = 0; i < 65; i++) {
      this.stars.push({
        x: (i * 97 + 23) % LOGICAL_WIDTH,
        y: 8 + ((i * 53 + 11) % 108),
        phase: i * 0.7,
        size: i % 5 === 0 ? 2 : 1,
      });
    }
  }

  public hitTest(lx: number, ly: number): string | null {
    for (let i = this.hitRegions.length - 1; i >= 0; i--) {
      const r = this.hitRegions[i];
      if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) {
        return r.id;
      }
    }
    return null;
  }

  private addHit(id: string, x: number, y: number, w: number, h: number): void {
    this.hitRegions.push({ id, x, y, w, h });
  }

  private getSkyColors(t: number, isBloodMoon: boolean): { top: RGB; bot: RGB; nightFactor: number } {
    let top: RGB;
    let bot: RGB;
    let nightFactor = 0;

    if (t < 0.05) {
      const k = t / 0.05;
      top = lerpRGB(SKY_TOP_DAWN, SKY_TOP_DAY, k);
      bot = lerpRGB(SKY_BOT_DAWN, SKY_BOT_DAY, k);
      nightFactor = lerp(0.35, 0, k);
    } else if (t < 0.43) {
      top = SKY_TOP_DAY;
      bot = SKY_BOT_DAY;
      nightFactor = 0;
    } else if (t < 0.49) {
      const k = (t - 0.43) / 0.06;
      top = lerpRGB(SKY_TOP_DAY, SKY_TOP_DUSK, k);
      bot = lerpRGB(SKY_BOT_DAY, SKY_BOT_DUSK, k);
      nightFactor = lerp(0, 0.48, k);
    } else if (t < 0.54) {
      const k = (t - 0.49) / 0.05;
      top = lerpRGB(SKY_TOP_DUSK, SKY_TOP_NIGHT, k);
      bot = lerpRGB(SKY_BOT_DUSK, isBloodMoon ? SKY_BOT_BLOOD : SKY_BOT_NIGHT, k);
      nightFactor = lerp(0.48, 1, k);
    } else if (t < 0.95) {
      top = SKY_TOP_NIGHT;
      bot = isBloodMoon ? SKY_BOT_BLOOD : SKY_BOT_NIGHT;
      nightFactor = 1;
    } else {
      const k = (t - 0.95) / 0.05;
      top = lerpRGB(SKY_TOP_NIGHT, SKY_TOP_DAWN, k);
      bot = lerpRGB(isBloodMoon ? SKY_BOT_BLOOD : SKY_BOT_NIGHT, SKY_BOT_DAWN, k);
      nightFactor = lerp(1, 0.35, k);
    }

    return { top, bot, nightFactor };
  }

  public render(ctx: CanvasRenderingContext2D, w: WorldState): void {
    ctx.imageSmoothingEnabled = false;
    this.hitRegions = [];

    // Dedicated black-background screens for Character Select (20s) & Crest Select (30s)
    if (w.mode === 'char_select') {
      this.drawCharSelectScreen(ctx, w);
      return;
    }
    if (w.mode === 'crest_select') {
      this.drawCrestSelectScreen(ctx, w);
      return;
    }

    const monarch = w.monarchs[0];
    const shakeX = w.screenShake > 0 ? Math.round((Math.random() - 0.5) * 4) : 0;
    const shakeY = w.screenShake > 0 ? Math.round((Math.random() - 0.5) * 3) : 0;
    const camX = Math.round((monarch ? monarch.cameraX : 1160) + shakeX);

    const { top, bot, nightFactor } = this.getSkyColors(w.timeOfDay, w.isBloodMoon);

    ctx.save();
    ctx.translate(0, shakeY);

    // 1. Sky
    const grad = ctx.createLinearGradient(0, 0, 0, WATER_Y);
    grad.addColorStop(0, rgbStr(top));
    grad.addColorStop(1, rgbStr(bot));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, WATER_Y);

    if (nightFactor > 0.15) this.drawStarsAndAurora(ctx, w, nightFactor);
    this.drawCelestial(ctx, w);
    this.drawClouds(ctx, w, camX, nightFactor);
    this.drawParallaxMountains(ctx, camX, nightFactor, w.isBloodMoon);
    this.drawParallaxForest(ctx, camX, nightFactor);
    this.drawGround(ctx, camX, nightFactor);

    // 2. World Entities
    this.drawTrees(ctx, w, camX, nightFactor);
    this.drawRocks(ctx, w, camX, nightFactor);
    this.drawCamps(ctx, w, camX);
    this.drawChests(ctx, w, camX);
    this.drawPortals(ctx, w, camX);
    this.drawHall(ctx, w, camX);
    this.drawShops(ctx, w, camX);
    this.drawFarms(ctx, w, camX);
    this.drawWalls(ctx, w, camX);
    this.drawWildlife(ctx, w, camX);
    this.drawVillagers(ctx, w, camX);
    this.drawEnemies(ctx, w, camX);
    if (monarch) this.drawMonarch(ctx, w, monarch, camX, 1, Math.round(monarch.x - camX), GROUND_Y);
    this.drawCoins(ctx, w, camX);
    this.drawArrows(ctx, w, camX);
    this.drawWorldParticles(ctx, w, camX);

    if (nightFactor > 0.08) this.drawLighting(ctx, w, camX, nightFactor);

    // 3. Fjord Water Reflection
    this.drawWaterReflection(ctx, w, nightFactor);
    this.drawSnowParticles(ctx, w);

    // 4. Placeholders & Animated Flying Coins (drawn above reflection & darkness so crystal clear!)
    if (w.mode === 'playing' && w.activePrompt) {
      this.drawFloatingPrompt(ctx, w, camX);
    }
    this.drawFlyingCoins(ctx, w, camX);

    ctx.restore();

    // 5. Overlays & HUD
    if (w.mode === 'login') {
      this.drawLoginOverlay(ctx, w);
    } else {
      this.drawHud(ctx, w);
      if (w.banner) this.drawBanner(ctx, w);
      if (w.mode === 'paused') this.drawPauseOverlay(ctx);
      if (w.mode === 'gameover') this.drawGameOverOverlay(ctx, w);
    }
  }

  // =========================================================================
  // LOGIN SCREEN (Nova Campanha / Carregar Campanha)
  // =========================================================================
  private drawLoginOverlay(ctx: CanvasRenderingContext2D, w: WorldState): void {
    ctx.fillStyle = 'rgba(5, 9, 17, 0.56)';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    const cx = LOGICAL_WIDTH / 2;
    const saved = getSavedCampaignSummary();

    // Golden Crown Emblem
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(cx - 12, 34, 24, 6);
    ctx.fillRect(cx - 12, 26, 5, 8);
    ctx.fillRect(cx - 2, 22, 4, 12);
    ctx.fillRect(cx + 7, 26, 5, 8);
    ctx.fillStyle = '#fff5bd';
    ctx.fillRect(cx - 10, 36, 20, 2);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff4d1';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.fillText('CORONA', cx, 74);

    ctx.fillStyle = '#9ec4e0';
    ctx.font = '8px monospace';
    ctx.fillText('SAGAS DO NORTE', cx, 88);

    // Button 1: Nova Campanha
    const btnW = 190;
    const btnH = 26;
    const bx = cx - btnW / 2;
    const by1 = 108;
    ctx.fillStyle = 'rgba(20, 32, 48, 0.92)';
    ctx.fillRect(bx, by1, btnW, btnH);
    ctx.strokeStyle = '#efc462';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by1 + 0.5, btnW - 1, btnH - 1);
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('NOVA CAMPANHA', cx, by1 + 16);
    this.addHit('login_new', bx, by1, btnW, btnH);

    // Button 2: Carregar Campanha
    const by2 = 142;
    ctx.fillStyle = saved ? 'rgba(16, 28, 42, 0.92)' : 'rgba(14, 18, 25, 0.65)';
    ctx.fillRect(bx, by2, btnW, 34);
    ctx.strokeStyle = saved ? 'rgba(140, 210, 255, 0.7)' : 'rgba(120, 136, 155, 0.25)';
    ctx.strokeRect(bx + 0.5, by2 + 0.5, btnW - 1, 33);

    if (saved) {
      drawShieldEmblem(ctx, saved.crest, bx + 20, by2 + 17, 9);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#d9eeff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('CARREGAR CAMPANHA', bx + 38, by2 + 14);
      ctx.fillStyle = '#95b2cc';
      ctx.font = '7px monospace';
      ctx.fillText(`Dia ${saved.day} · ${saved.villagers} súditos · ${saved.gold} ouro`, bx + 38, by2 + 25);
      this.addHit('login_load', bx, by2, btnW, 34);
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6f8194';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('CARREGAR CAMPANHA', cx, by2 + 15);
      ctx.font = '7px monospace';
      ctx.fillText('(Nenhuma campanha salva ainda)', cx, by2 + 26);
    }

    // Subtle hint bar
    ctx.textAlign = 'center';
    const pulse = 0.6 + 0.4 * Math.sin(w.elapsed * 3);
    ctx.fillStyle = `rgba(205, 224, 242, ${pulse.toFixed(2)})`;
    ctx.font = '7px monospace';
    ctx.fillText('Clique em uma opção ou pressione ESPAÇO para Nova Campanha', cx, 198);
    ctx.textAlign = 'left';
  }

  // =========================================================================
  // CHARACTER SELECT SCREEN (Black Background, 20s Timer, Starter Skins Only)
  // =========================================================================
  private drawCharSelectScreen(ctx: CanvasRenderingContext2D, w: WorldState): void {
    // Pure black background
    ctx.fillStyle = '#040507';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Subtle dark vignette spotlight under character
    const spot = ctx.createRadialGradient(132, 162, 6, 132, 162, 76);
    spot.addColorStop(0, 'rgba(239, 196, 98, 0.14)');
    spot.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = spot;
    ctx.fillRect(40, 80, 190, 140);

    // Header + 20s Countdown Timer
    ctx.fillStyle = '#fff2c9';
    ctx.font = 'bold 12px Georgia, serif';
    ctx.fillText('ESCOLHA SEU MONARCA', 18, 26);
    ctx.fillStyle = '#8b99a8';
    ctx.font = '7px monospace';
    ctx.fillText('Skins iniciais · Cavalo comum (lento, sem super poderes)', 18, 38);

    const secs = Math.ceil(w.selectTimer);
    const urgent = secs <= 5;
    ctx.textAlign = 'right';
    ctx.fillStyle = urgent ? '#ff646c' : '#efc462';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`${secs}s`, LOGICAL_WIDTH - 18, 28);
    ctx.textAlign = 'left';

    // Countdown progress bar
    ctx.fillStyle = '#181e28';
    ctx.fillRect(18, 45, LOGICAL_WIDTH - 36, 3);
    ctx.fillStyle = urgent ? '#ff646c' : '#efc462';
    ctx.fillRect(18, 45, Math.round(((LOGICAL_WIDTH - 36) * w.selectTimer) / 20), 3);

    // Left Preview Pedestal: 3x pixel art mounted Monarch
    ctx.fillStyle = '#161b24';
    ctx.fillRect(62, 188, 140, 6);
    ctx.fillStyle = '#2b3442';
    ctx.fillRect(72, 187, 120, 2);

    const previewMonarch: Monarch = {
      ...w.monarchs[0],
      facing: 1,
      vx: 14,
      sprinting: false,
      hasCrown: true,
    };
    this.drawMonarch(ctx, w, previewMonarch, 0, 3, 132, 187);

    // Right Selector Panel (4 rows)
    const rows = [
      { key: 'outfit', label: 'TRAJE', val: OUTFIT_PRESETS[w.appearance.outfitIndex].name },
      { key: 'hair', label: 'CABELO', val: HAIR_PRESETS[w.appearance.hairIndex].name },
      { key: 'horse', label: 'CAVALO INICIAL', val: HORSE_PRESETS[w.appearance.horseIndex].name },
      { key: 'crown', label: 'COROA', val: CROWN_PRESETS[w.appearance.crownIndex].name },
    ];

    const px = 236;
    const pw = 224;
    rows.forEach((row, idx) => {
      const ry = 66 + idx * 34;
      const focused = this.charSelectFocusRow === idx;
      ctx.fillStyle = focused ? '#141a24' : '#0c0f15';
      ctx.fillRect(px, ry, pw, 28);
      ctx.strokeStyle = focused ? '#efc462' : '#252d3a';
      ctx.strokeRect(px + 0.5, ry + 0.5, pw - 1, 27);

      ctx.fillStyle = '#7e8fa3';
      ctx.font = '6px monospace';
      ctx.fillText(row.label, px + 26, ry + 10);

      ctx.fillStyle = '#eef4fa';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(row.val, px + 26, ry + 22);

      // Prev arrow button
      ctx.fillStyle = '#1d2533';
      ctx.fillRect(px + 4, ry + 5, 18, 18);
      ctx.fillStyle = '#efc462';
      ctx.textAlign = 'center';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('◀', px + 13, ry + 17);
      this.addHit(`char_prev_${row.key}`, px + 4, ry + 5, 18, 18);

      // Next arrow button
      ctx.fillStyle = '#1d2533';
      ctx.fillRect(px + pw - 22, ry + 5, 18, 18);
      ctx.fillStyle = '#efc462';
      ctx.fillText('▶', px + pw - 13, ry + 17);
      this.addHit(`char_next_${row.key}`, px + pw - 22, ry + 5, 18, 18);
      ctx.textAlign = 'left';
    });

    // Bottom buttons: Randomize + Confirm
    ctx.fillStyle = '#161d29';
    ctx.fillRect(px, 212, 92, 24);
    ctx.strokeStyle = '#3b485c';
    ctx.strokeRect(px + 0.5, 212.5, 91, 23);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cbd8e6';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('ALEATÓRIO', px + 46, 227);
    this.addHit('char_random', px, 212, 92, 24);

    ctx.fillStyle = '#2b2412';
    ctx.fillRect(px + 100, 212, 124, 24);
    ctx.strokeStyle = '#efc462';
    ctx.strokeRect(px + 100.5, 212.5, 123, 23);
    ctx.fillStyle = '#ffe58a';
    ctx.fillText('CONFIRMAR [ESPAÇO]', px + 162, 227);
    this.addHit('char_confirm', px + 100, 212, 124, 24);

    ctx.fillStyle = '#6f7e91';
    ctx.font = '7px monospace';
    ctx.fillText('↑/↓ Categoria  ·  ←/→ Trocar  ·  Ou clique nos botões', LOGICAL_WIDTH / 2, 256);
    ctx.textAlign = 'left';
  }

  // =========================================================================
  // CREST SELECT SCREEN (Black Background, Centered Shield, 30s Timer)
  // =========================================================================
  private drawCrestSelectScreen(ctx: CanvasRenderingContext2D, w: WorldState): void {
    // Pure black background
    ctx.fillStyle = '#040507';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    const cx = LOGICAL_WIDTH / 2;

    // Header + 30s Countdown Timer
    ctx.fillStyle = '#fff2c9';
    ctx.font = 'bold 12px Georgia, serif';
    ctx.fillText('FORJE O BRASÃO DO SEU CLÃ', 18, 25);
    ctx.fillStyle = '#8b99a8';
    ctx.font = '7px monospace';
    ctx.fillText('Escolha definitiva: define bandeiras, tropas e castelo', 18, 36);

    const secs = Math.ceil(w.selectTimer);
    const urgent = secs <= 6;
    ctx.textAlign = 'right';
    ctx.fillStyle = urgent ? '#ff646c' : '#efc462';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`${secs}s`, LOGICAL_WIDTH - 18, 27);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#181e28';
    ctx.fillRect(18, 43, LOGICAL_WIDTH - 36, 3);
    ctx.fillStyle = urgent ? '#ff646c' : '#efc462';
    ctx.fillRect(18, 43, Math.round(((LOGICAL_WIDTH - 36) * w.selectTimer) / 30), 3);

    // Subtle halo behind centered shield
    const halo = ctx.createRadialGradient(cx, 122, 10, cx, 122, 62);
    halo.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - 64, 58, 128, 128);

    // LARGE CENTERED NORDIC SHIELD!
    drawShieldEmblem(ctx, w.crest, cx, 122, 42);

    // Left controls: Shape & Pattern
    const shapeName = SHIELD_SHAPES.find((s) => s.id === w.crest.shape)?.name ?? '';
    const patternName = SHIELD_PATTERNS.find((p) => p.id === w.crest.pattern)?.name ?? '';

    const drawSelectorBox = (
      x: number,
      y: number,
      width: number,
      title: string,
      value: string,
      prevId: string,
      nextId: string,
      focused: boolean
    ) => {
      ctx.fillStyle = focused ? '#141a24' : '#0b0e14';
      ctx.fillRect(x, y, width, 34);
      ctx.strokeStyle = focused ? '#efc462' : '#252d3a';
      ctx.strokeRect(x + 0.5, y + 0.5, width - 1, 33);

      ctx.fillStyle = '#7e8fa3';
      ctx.font = '6px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(title, x + width / 2, y + 10);
      ctx.fillStyle = '#eef4fa';
      ctx.font = 'bold 7px monospace';
      ctx.fillText(value, x + width / 2, y + 25);

      ctx.fillStyle = '#1c2432';
      ctx.fillRect(x + 3, y + 14, 16, 16);
      ctx.fillRect(x + width - 19, y + 14, 16, 16);
      ctx.fillStyle = '#efc462';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('◀', x + 11, y + 25);
      ctx.fillText('▶', x + width - 11, y + 25);
      ctx.textAlign = 'left';

      this.addHit(prevId, x + 3, y + 14, 16, 16);
      this.addHit(nextId, x + width - 19, y + 14, 16, 16);
    };

    drawSelectorBox(18, 72, 152, 'FORMATO DO ESCUDO', shapeName, 'crest_prev_shape', 'crest_next_shape', this.crestSelectFocusRow === 0);
    drawSelectorBox(18, 118, 152, 'PADRÃO NÓRDICO', patternName, 'crest_prev_pattern', 'crest_next_pattern', this.crestSelectFocusRow === 1);

    // Right controls: Color 1 (Background) & Color 2 (Pattern) Swatches
    const drawColorPalette = (
      x: number,
      y: number,
      title: string,
      colors: Array<{ name: string; hex: string }>,
      activeHex: string,
      prefix: string,
      focused: boolean
    ) => {
      ctx.fillStyle = focused ? '#141a24' : '#0b0e14';
      ctx.fillRect(x, y, 152, 42);
      ctx.strokeStyle = focused ? '#efc462' : '#252d3a';
      ctx.strokeRect(x + 0.5, y + 0.5, 151, 41);

      ctx.fillStyle = '#7e8fa3';
      ctx.font = '6px monospace';
      ctx.fillText(title, x + 7, y + 10);

      colors.forEach((c, i) => {
        const sx = x + 7 + (i % 8) * 17.5;
        const sy = y + 16;
        const isSel = c.hex === activeHex;
        ctx.fillStyle = c.hex;
        ctx.fillRect(Math.round(sx), sy, 14, 18);
        ctx.strokeStyle = isSel ? '#ffffff' : 'rgba(255,255,255,0.22)';
        ctx.lineWidth = isSel ? 1.5 : 1;
        ctx.strokeRect(Math.round(sx) + 0.5, sy + 0.5, 13, 17);
        this.addHit(`${prefix}_${i}`, Math.round(sx), sy, 14, 18);
      });
      ctx.lineWidth = 1;
    };

    drawColorPalette(310, 72, 'COR 1 — FUNDO DO ESCUDO', CREST_BG_COLORS, w.crest.primaryColor, 'crest_bg', this.crestSelectFocusRow === 2);
    drawColorPalette(310, 122, 'COR 2 — PADRÃO NÓRDICO', CREST_FG_COLORS, w.crest.secondaryColor, 'crest_fg', this.crestSelectFocusRow === 3);

    // Mini Flag preview underneath shield showing how clan colors look!
    ctx.fillStyle = '#6f7e91';
    ctx.font = '6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PRÉVIA DA BANDEIRA DO CLÃ', cx, 184);
    ctx.fillStyle = '#7a6855';
    ctx.fillRect(cx - 20, 190, 2, 24);
    ctx.fillStyle = w.crest.primaryColor;
    ctx.fillRect(cx - 18, 191, 34, 14);
    ctx.fillStyle = w.crest.secondaryColor;
    ctx.fillRect(cx - 18, 196, 34, 4);
    ctx.fillRect(cx - 6, 191, 4, 14);

    // Confirm Button
    const cbW = 198;
    const cbX = cx - cbW / 2;
    ctx.fillStyle = '#2b2412';
    ctx.fillRect(cbX, 224, cbW, 24);
    ctx.strokeStyle = '#efc462';
    ctx.strokeRect(cbX + 0.5, 224.5, cbW - 1, 23);
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('SELAR BRASÃO E INICIAR [ESPAÇO]', cx, 239);
    this.addHit('crest_confirm', cbX, 224, cbW, 24);

    ctx.fillStyle = '#6f7e91';
    ctx.font = '7px monospace';
    ctx.fillText('↑/↓ Selecionar opção  ·  ←/→ Mudar  ·  Após confirmar, não pode alterar', cx, 261);
    ctx.textAlign = 'left';
  }

  // =========================================================================
  // WORLD RENDERING
  // =========================================================================
  private drawStarsAndAurora(ctx: CanvasRenderingContext2D, w: WorldState, nightFactor: number): void {
    for (const s of this.stars) {
      const twinkle = 0.45 + 0.55 * Math.sin(w.elapsed * 2.4 + s.phase);
      ctx.fillStyle = `rgba(225, 240, 255, ${(nightFactor * twinkle * 0.85).toFixed(2)})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }

    const auroraAlpha = Math.max(0, (nightFactor - 0.35) / 0.65) * (w.isBloodMoon ? 0.35 : 0.68);
    if (auroraAlpha <= 0.02) return;

    for (let x = 0; x < LOGICAL_WIDTH; x += 3) {
      const wave1 = Math.sin(x * 0.018 + w.elapsed * 0.45) * 14;
      const wave2 = Math.cos(x * 0.032 - w.elapsed * 0.32) * 8;
      const baseY = 38 + wave1 + wave2;
      const colHeight = 26 + Math.sin(x * 0.05 + w.elapsed * 0.9) * 12;
      const shimmer = 0.55 + 0.45 * Math.sin(x * 0.09 + w.elapsed * 1.6);

      const g = ctx.createLinearGradient(0, baseY - colHeight, 0, baseY + 12);
      if (w.isBloodMoon) {
        g.addColorStop(0, 'rgba(255, 80, 120, 0)');
        g.addColorStop(0.55, `rgba(255, 92, 122, ${(auroraAlpha * shimmer * 0.45).toFixed(3)})`);
        g.addColorStop(1, 'rgba(130, 30, 80, 0)');
      } else {
        g.addColorStop(0, 'rgba(65, 240, 185, 0)');
        g.addColorStop(0.45, `rgba(74, 232, 188, ${(auroraAlpha * shimmer * 0.45).toFixed(3)})`);
        g.addColorStop(0.75, `rgba(76, 184, 245, ${(auroraAlpha * shimmer * 0.3).toFixed(3)})`);
        g.addColorStop(1, 'rgba(55, 130, 210, 0)');
      }
      ctx.fillStyle = g;
      ctx.fillRect(x, Math.round(baseY - colHeight), 3, Math.round(colHeight + 12));
    }
  }

  private drawCelestial(ctx: CanvasRenderingContext2D, w: WorldState): void {
    const t = w.timeOfDay;
    if (t < 0.5) {
      const p = t / 0.5;
      const x = Math.round(45 + p * (LOGICAL_WIDTH - 90));
      const y = Math.round(135 - Math.sin(p * Math.PI) * 98);
      ctx.fillStyle = 'rgba(255, 224, 150, 0.18)';
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff0b8';
      ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.fillStyle = '#fffbe3';
      ctx.fillRect(x - 4, y - 4, 8, 8);
    } else {
      const p = (t - 0.5) / 0.5;
      const x = Math.round(65 + p * (LOGICAL_WIDTH - 130));
      const y = Math.round(115 - Math.sin(p * Math.PI) * 76);
      ctx.fillStyle = w.isBloodMoon ? 'rgba(255, 70, 80, 0.28)' : 'rgba(180, 220, 255, 0.18)';
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = w.isBloodMoon ? '#ff6464' : '#e6f2ff';
      ctx.fillRect(x - 5, y - 5, 10, 10);
      ctx.fillStyle = w.isBloodMoon ? '#ff9c8a' : '#ffffff';
      ctx.fillRect(x - 3, y - 4, 6, 6);
    }
  }

  private drawClouds(ctx: CanvasRenderingContext2D, w: WorldState, camX: number, nightFactor: number): void {
    const cloudCol = lerpRGB({ r: 220, g: 232, b: 242 }, { r: 34, g: 52, b: 74 }, nightFactor);
    ctx.fillStyle = rgbStr(cloudCol, 0.48);
    for (let i = 0; i < 6; i++) {
      const worldOffset = (i * 110 + w.elapsed * (3 + (i % 3)) - camX * 0.08) % (LOGICAL_WIDTH + 120);
      const cx = Math.round(((worldOffset + LOGICAL_WIDTH + 120) % (LOGICAL_WIDTH + 120)) - 60);
      const cy = 28 + (i % 3) * 20;
      const cw = 36 + (i % 3) * 18;
      ctx.fillRect(cx, cy, cw, 5);
      ctx.fillRect(cx + 8, cy - 4, cw - 16, 4);
    }
  }

  private drawParallaxMountains(
    ctx: CanvasRenderingContext2D,
    camX: number,
    nightFactor: number,
    isBloodMoon: boolean
  ): void {
    const farBase = lerpRGB(
      { r: 78, g: 102, b: 128 },
      isBloodMoon ? { r: 36, g: 24, b: 38 } : { r: 16, g: 28, b: 44 },
      nightFactor
    );
    const snowCap = lerpRGB({ r: 215, g: 229, b: 240 }, { r: 64, g: 88, b: 112 }, nightFactor);

    const span = 120;
    const offset = Math.floor(camX * 0.12) % span;
    for (let i = -1; i < Math.ceil(LOGICAL_WIDTH / span) + 2; i++) {
      const bx = i * span - offset;
      const peakH = 72 + (Math.abs(i * 37) % 3) * 18;
      const peakX = bx + 54;
      const peakY = GROUND_Y - 26 - peakH;

      ctx.fillStyle = rgbStr(farBase);
      ctx.beginPath();
      ctx.moveTo(bx - 16, GROUND_Y);
      ctx.lineTo(peakX, peakY);
      ctx.lineTo(bx + span + 18, GROUND_Y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = rgbStr(snowCap);
      ctx.beginPath();
      ctx.moveTo(peakX, peakY);
      ctx.lineTo(peakX - 18, peakY + 26);
      ctx.lineTo(peakX - 4, peakY + 20);
      ctx.lineTo(peakX + 8, peakY + 28);
      ctx.lineTo(peakX + 14, peakY + 20);
      ctx.closePath();
      ctx.fill();
    }

    const midCol = lerpRGB({ r: 44, g: 64, b: 82 }, { r: 12, g: 22, b: 34 }, nightFactor);
    const midSpan = 96;
    const midOff = Math.floor(camX * 0.28) % midSpan;
    ctx.fillStyle = rgbStr(midCol);
    for (let i = -1; i < Math.ceil(LOGICAL_WIDTH / midSpan) + 2; i++) {
      const bx = i * midSpan - midOff;
      const h = 42 + (Math.abs(i * 19) % 3) * 12;
      ctx.beginPath();
      ctx.moveTo(bx - 10, GROUND_Y);
      ctx.lineTo(bx + 42, GROUND_Y - h);
      ctx.lineTo(bx + midSpan + 14, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawParallaxForest(ctx: CanvasRenderingContext2D, camX: number, nightFactor: number): void {
    const pineCol = lerpRGB({ r: 28, g: 46, b: 56 }, { r: 9, g: 16, b: 25 }, nightFactor);
    const step = 20;
    const off = Math.floor(camX * 0.5) % step;
    ctx.fillStyle = rgbStr(pineCol);
    for (let i = -1; i < Math.ceil(LOGICAL_WIDTH / step) + 2; i++) {
      const tx = i * step - off;
      const h = 24 + (Math.abs(i * 13) % 4) * 7;
      const topY = GROUND_Y - h;
      ctx.fillRect(tx + 8, topY, 3, h);
      ctx.beginPath();
      ctx.moveTo(tx + 9, topY - 4);
      ctx.lineTo(tx, GROUND_Y - 4);
      ctx.lineTo(tx + 19, GROUND_Y - 4);
      ctx.closePath();
      ctx.fill();
    }

    const mistGrad = ctx.createLinearGradient(0, GROUND_Y - 26, 0, GROUND_Y);
    mistGrad.addColorStop(0, 'rgba(170, 204, 224, 0)');
    mistGrad.addColorStop(1, `rgba(170, 204, 224, ${lerp(0.16, 0.05, nightFactor).toFixed(2)})`);
    ctx.fillStyle = mistGrad;
    ctx.fillRect(0, GROUND_Y - 26, LOGICAL_WIDTH, 26);
  }

  private drawGround(ctx: CanvasRenderingContext2D, camX: number, nightFactor: number): void {
    const grassTop = lerpRGB({ r: 94, g: 118, b: 102 }, { r: 28, g: 42, b: 48 }, nightFactor);
    const snowEdge = lerpRGB({ r: 204, g: 222, b: 234 }, { r: 70, g: 94, b: 112 }, nightFactor);
    const soil = lerpRGB({ r: 54, g: 45, b: 42 }, { r: 19, g: 19, b: 26 }, nightFactor);
    const stoneBank = lerpRGB({ r: 74, g: 82, b: 92 }, { r: 24, g: 32, b: 42 }, nightFactor);

    ctx.fillStyle = rgbStr(grassTop);
    ctx.fillRect(0, GROUND_Y - 2, LOGICAL_WIDTH, 3);
    ctx.fillStyle = rgbStr(soil);
    ctx.fillRect(0, GROUND_Y + 1, LOGICAL_WIDTH, WATER_Y - GROUND_Y - 1);
    ctx.fillStyle = rgbStr(stoneBank);
    ctx.fillRect(0, WATER_Y - 2, LOGICAL_WIDTH, 2);

    const startTile = Math.floor(camX / 24);
    for (let t = startTile; t <= startTile + Math.ceil(LOGICAL_WIDTH / 24) + 1; t++) {
      const sx = t * 24 - camX;
      if ((t * 7) % 3 === 0) {
        ctx.fillStyle = rgbStr(snowEdge);
        ctx.fillRect(sx + 2, GROUND_Y - 2, 10, 2);
      }
      if ((t * 11) % 4 === 0) {
        ctx.fillStyle = rgbStr(grassTop);
        ctx.fillRect(sx + 14, GROUND_Y - 4, 2, 2);
        ctx.fillRect(sx + 17, GROUND_Y - 3, 1, 2);
      }
    }
  }

  private drawTrees(ctx: CanvasRenderingContext2D, w: WorldState, camX: number, nightFactor: number): void {
    const darkGreen = lerpRGB({ r: 30, g: 56, b: 52 }, { r: 11, g: 22, b: 28 }, nightFactor);
    const midGreen = lerpRGB({ r: 44, g: 76, b: 66 }, { r: 16, g: 31, b: 38 }, nightFactor);
    const snow = lerpRGB({ r: 212, g: 228, b: 238 }, { r: 72, g: 98, b: 118 }, nightFactor);

    for (const t of w.trees) {
      if (t.chopped) continue;
      const sx = Math.round(t.x - camX);
      if (sx < -32 || sx > LOGICAL_WIDTH + 32) continue;

      const shake = t.hitShake > 0 ? Math.round(Math.sin(w.elapsed * 60) * 2) : 0;
      const sway = Math.round(Math.sin(w.elapsed * 1.1 + t.swayOffset) * 1);
      const bx = sx + shake;

      ctx.fillStyle = '#3d2c24';
      ctx.fillRect(bx - 2, GROUND_Y - 14, 4, 14);

      const tiers = 3 + (t.variant === 2 ? 1 : 0);
      for (let tier = 0; tier < tiers; tier++) {
        const ty = GROUND_Y - 12 - tier * Math.floor((t.height - 14) / tiers);
        const halfW = 13 - tier * 2.5 + (t.variant === 1 ? 2 : 0);
        const topY = ty - 16;
        const shift = Math.round((sway * (tier + 1)) / tiers);

        ctx.fillStyle = rgbStr(tier % 2 === 0 ? darkGreen : midGreen);
        ctx.beginPath();
        ctx.moveTo(bx + shift, topY);
        ctx.lineTo(bx - halfW, ty);
        ctx.lineTo(bx + halfW, ty);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = rgbStr(snow, 0.8);
        ctx.fillRect(bx + shift - 2, topY + 2, 4, 2);
        ctx.fillRect(bx + shift - Math.floor(halfW * 0.55), topY + 7, Math.floor(halfW * 0.5), 2);
      }

      if (t.marked) {
        const bob = Math.round(Math.sin(w.elapsed * 6) * 1.5);
        ctx.fillStyle = '#f7d265';
        ctx.fillRect(bx - 3, GROUND_Y - 22 + bob, 6, 6);
        ctx.fillStyle = '#805212';
        ctx.fillRect(bx - 2, GROUND_Y - 21 + bob, 4, 4);
        ctx.fillStyle = '#fff3b8';
        ctx.fillRect(bx - 1, GROUND_Y - 20 + bob, 2, 2);
      }
    }
  }

  private drawRocks(ctx: CanvasRenderingContext2D, w: WorldState, camX: number, nightFactor: number): void {
    const stoneDark = lerpRGB({ r: 68, g: 78, b: 88 }, { r: 22, g: 28, b: 36 }, nightFactor);
    const stoneMid = lerpRGB({ r: 102, g: 114, b: 126 }, { r: 36, g: 46, b: 56 }, nightFactor);
    const snow = lerpRGB({ r: 215, g: 230, b: 240 }, { r: 75, g: 98, b: 118 }, nightFactor);

    for (const r of w.rocks) {
      if (r.mined) continue;
      const sx = Math.round(r.x - camX);
      if (sx < -24 || sx > LOGICAL_WIDTH + 24) continue;

      const shake = r.hitShake > 0 ? Math.round(Math.sin(w.elapsed * 60) * 2) : 0;
      const bx = sx + shake;
      const rw = r.variant === 0 ? 18 : r.variant === 1 ? 22 : 16;
      const rh = r.variant === 0 ? 13 : r.variant === 1 ? 15 : 11;

      // Main Nordic boulder silhouette
      ctx.fillStyle = rgbStr(stoneDark);
      ctx.fillRect(bx - Math.floor(rw / 2), GROUND_Y - rh + 3, rw, rh - 3);
      ctx.fillStyle = rgbStr(stoneMid);
      ctx.fillRect(bx - Math.floor(rw / 2) + 2, GROUND_Y - rh, rw - 5, rh - 2);
      // Snow cap
      ctx.fillStyle = rgbStr(snow);
      ctx.fillRect(bx - Math.floor(rw / 2) + 3, GROUND_Y - rh, rw - 7, 2);
      // Cracks / mineral gleam
      ctx.fillStyle = '#dce8f2';
      ctx.fillRect(bx + 1, GROUND_Y - Math.floor(rh * 0.55), 2, 2);

      if (r.marked) {
        const bob = Math.round(Math.sin(w.elapsed * 6) * 1.5);
        ctx.fillStyle = '#f7d265';
        ctx.fillRect(bx - 3, GROUND_Y - rh - 10 + bob, 6, 6);
        ctx.fillStyle = '#5c3c10';
        ctx.fillRect(bx - 2, GROUND_Y - rh - 9 + bob, 4, 4);
        ctx.fillStyle = '#fff3b8';
        ctx.fillRect(bx - 1, GROUND_Y - rh - 8 + bob, 2, 2);
      }
    }
  }

  private drawCamps(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const camp of w.camps) {
      const sx = Math.round(camp.x - camX);
      if (sx < -40 || sx > LOGICAL_WIDTH + 40) continue;

      ctx.fillStyle = '#5c4638';
      ctx.beginPath();
      ctx.moveTo(sx - 18, GROUND_Y);
      ctx.lineTo(sx - 6, GROUND_Y - 18);
      ctx.lineTo(sx + 6, GROUND_Y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#36271f';
      ctx.fillRect(sx - 8, GROUND_Y - 8, 4, 8);

      ctx.fillStyle = '#47362b';
      ctx.fillRect(sx + 8, GROUND_Y - 2, 8, 2);
      const flick = Math.floor(w.elapsed * 10) % 2;
      ctx.fillStyle = '#ff7d29';
      ctx.fillRect(sx + 10, GROUND_Y - 6 - flick, 4, 4 + flick);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(sx + 11, GROUND_Y - 5, 2, 3);
    }
  }

  private drawChests(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const chest of w.chests) {
      const sx = Math.round(chest.x - camX);
      if (sx < -24 || sx > LOGICAL_WIDTH + 24) continue;

      ctx.fillStyle = '#5c3b21';
      ctx.fillRect(sx - 7, GROUND_Y - 9, 14, 9);
      ctx.fillStyle = '#d9a738';
      ctx.fillRect(sx - 7, GROUND_Y - 6, 14, 2);
      ctx.fillRect(sx - 1, GROUND_Y - 7, 2, 4);

      if (!chest.opened) {
        ctx.fillStyle = '#7a4f2d';
        ctx.fillRect(sx - 8, GROUND_Y - 11, 16, 3);
        if (Math.floor(w.elapsed * 3 + chest.id) % 3 === 0) {
          ctx.fillStyle = '#fff4b8';
          ctx.fillRect(sx + 3, GROUND_Y - 12, 2, 2);
        }
      } else {
        ctx.fillStyle = '#241810';
        ctx.fillRect(sx - 6, GROUND_Y - 10, 12, 3);
      }
    }
  }

  private drawPortals(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const p of w.portals) {
      const sx = Math.round(p.x - camX);
      if (sx < -48 || sx > LOGICAL_WIDTH + 48) continue;
      if (p.destroyed) {
        ctx.fillStyle = '#3b424d';
        ctx.fillRect(sx - 16, GROUND_Y - 6, 32, 6);
        continue;
      }

      const pulse = 0.65 + 0.35 * Math.sin(p.pulseTime * 3.5);
      ctx.fillStyle = `rgba(92, 42, 138, ${(0.55 * pulse).toFixed(2)})`;
      ctx.fillRect(sx - 11, GROUND_Y - 38, 22, 36);
      ctx.fillStyle = `rgba(82, 226, 255, ${(0.45 * pulse).toFixed(2)})`;
      ctx.fillRect(sx - 7, GROUND_Y - 32, 14, 28);
      ctx.fillStyle = '#d8fbff';
      ctx.fillRect(sx - 2, GROUND_Y - 26 + Math.round(Math.sin(p.pulseTime * 5) * 3), 4, 14);

      ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : '#2c3442';
      ctx.fillRect(sx - 18, GROUND_Y - 40, 7, 40);
      ctx.fillRect(sx + 11, GROUND_Y - 40, 7, 40);
      ctx.fillRect(sx - 16, GROUND_Y - 46, 32, 8);
      ctx.fillRect(sx - 10, GROUND_Y - 50, 20, 4);

      ctx.fillStyle = w.isBloodMoon ? '#ff5e6c' : '#6cf4ff';
      ctx.fillRect(sx - 15, GROUND_Y - 30, 2, 5);
      ctx.fillRect(sx - 15, GROUND_Y - 18, 2, 5);
      ctx.fillRect(sx + 13, GROUND_Y - 30, 2, 5);
      ctx.fillRect(sx + 13, GROUND_Y - 18, 2, 5);
    }
  }

  private drawHall(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    const sx = Math.round(w.hall.x - camX);
    if (sx < -80 || sx > LOGICAL_WIDTH + 80) return;

    const lvl = w.hall.level;
    const primary = w.crest.primaryColor;
    const secondary = w.crest.secondaryColor;

    // Twin Clan Flagpoles flanking the central Hall once campfire is lit!
    if (lvl >= 1) {
      const wave = Math.round(Math.sin(w.elapsed * 4.5) * 1.5);
      for (const fx of [-38, 38]) {
        ctx.fillStyle = '#5e4633';
        ctx.fillRect(sx + fx, GROUND_Y - 34, 2, 34);
        ctx.fillStyle = primary;
        ctx.fillRect(sx + fx + 2, GROUND_Y - 33, 12, 8);
        ctx.fillRect(sx + fx + 12, GROUND_Y - 33 + wave, 4, 7);
        ctx.fillStyle = secondary;
        ctx.fillRect(sx + fx + 2, GROUND_Y - 30, 12, 2);
        ctx.fillRect(sx + fx + 6, GROUND_Y - 33, 2, 8);
      }
    }

    if (lvl >= 2) {
      const hallW = lvl === 3 ? 78 : 56;
      const hallH = lvl === 3 ? 40 : 30;
      ctx.fillStyle = '#4f3827';
      ctx.fillRect(sx - hallW / 2, GROUND_Y - hallH, hallW, hallH);

      ctx.fillStyle = '#362419';
      for (let bx = -hallW / 2 + 6; bx < hallW / 2; bx += 12) {
        ctx.fillRect(sx + bx, GROUND_Y - hallH, 2, hallH);
      }

      ctx.fillStyle = lvl === 3 ? '#2d3b4c' : '#3d464d';
      ctx.beginPath();
      ctx.moveTo(sx - hallW / 2 - 6, GROUND_Y - hallH + 4);
      ctx.lineTo(sx, GROUND_Y - hallH - (lvl === 3 ? 22 : 16));
      ctx.lineTo(sx + hallW / 2 + 6, GROUND_Y - hallH + 4);
      ctx.closePath();
      ctx.fill();

      // Colored clan ridge trim
      ctx.fillStyle = secondary;
      ctx.fillRect(sx - hallW / 2 - 4, GROUND_Y - hallH + 3, hallW + 8, 2);

      // Snow on roof ridge
      ctx.fillStyle = '#d4e6f2';
      ctx.fillRect(sx - 6, GROUND_Y - hallH - (lvl === 3 ? 22 : 16), 12, 3);

      // Clan Banner + Mini Shield Emblem on the Castle/Hall!
      ctx.fillStyle = primary;
      ctx.fillRect(sx - 18, GROUND_Y - hallH + 6, 8, 15);
      ctx.fillRect(sx + 10, GROUND_Y - hallH + 6, 8, 15);
      ctx.fillStyle = secondary;
      ctx.fillRect(sx - 15, GROUND_Y - hallH + 6, 2, 13);
      ctx.fillRect(sx + 13, GROUND_Y - hallH + 6, 2, 13);

      drawShieldEmblem(ctx, w.crest, sx, GROUND_Y - hallH - 2, 7);

      // Warm lit doorway
      ctx.fillStyle = '#241710';
      ctx.fillRect(sx - 6, GROUND_Y - 16, 12, 16);
      ctx.fillStyle = '#ffae42';
      ctx.fillRect(sx - 4, GROUND_Y - 13, 8, 13);

      if (lvl === 3) {
        for (const ox of [-26, 26]) {
          drawShieldEmblem(ctx, w.crest, sx + ox, GROUND_Y - hallH + 11, 4.5);
        }
      }
    }

    // Campfire stones
    ctx.fillStyle = '#5a6470';
    ctx.fillRect(sx - 10, GROUND_Y - 3, 20, 3);
    ctx.fillStyle = '#3b281c';
    ctx.fillRect(sx - 7, GROUND_Y - 5, 14, 3);

    if (lvl >= 1) {
      const f1 = Math.floor(w.elapsed * 12) % 3;
      const f2 = Math.floor(w.elapsed * 9 + 1) % 2;
      ctx.fillStyle = '#e85d1a';
      ctx.fillRect(sx - 5, GROUND_Y - 12 - f1, 10, 8 + f1);
      ctx.fillStyle = '#ffae33';
      ctx.fillRect(sx - 3, GROUND_Y - 10 - f2, 6, 6 + f2);
      ctx.fillStyle = '#fff2a6';
      ctx.fillRect(sx - 1, GROUND_Y - 8, 2, 4);
    }

    if (w.hall.storedTaxCoins > 0) {
      const pile = Math.min(5, w.hall.storedTaxCoins);
      for (let i = 0; i < pile; i++) {
        ctx.fillStyle = '#f7d265';
        ctx.fillRect(sx + 14 + (i % 3) * 3, GROUND_Y - 3 - Math.floor(i / 3) * 3, 3, 3);
      }
    }
  }

  private drawShops(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    if (w.hall.level < 1) return;

    for (const shop of w.shops) {
      const sx = Math.round(shop.x - camX);
      if (sx < -32 || sx > LOGICAL_WIDTH + 32) continue;

      // Timber rack stand with clan-colored awning trim
      ctx.fillStyle = '#4e3524';
      ctx.fillRect(sx - 13, GROUND_Y - 22, 3, 22);
      ctx.fillRect(sx + 10, GROUND_Y - 22, 3, 22);
      ctx.fillStyle = w.crest.primaryColor;
      ctx.fillRect(sx - 15, GROUND_Y - 24, 30, 4);
      ctx.fillStyle = w.crest.secondaryColor;
      ctx.fillRect(sx - 15, GROUND_Y - 21, 30, 1);
      ctx.fillStyle = '#cde0ed';
      ctx.fillRect(sx - 14, GROUND_Y - 25, 28, 1);

      ctx.fillStyle = '#2d2018';
      ctx.fillRect(sx - 11, GROUND_Y - 16, 22, 3);

      for (let i = 0; i < shop.stock; i++) {
        const tx = sx - 9 + i * 6;
        if (shop.kind === 'bow') {
          ctx.fillStyle = '#c48d4e';
          ctx.fillRect(tx, GROUND_Y - 15, 2, 10);
          ctx.fillStyle = '#e8e2d5';
          ctx.fillRect(tx + 2, GROUND_Y - 14, 1, 8);
        } else if (shop.kind === 'hammer') {
          ctx.fillStyle = '#9e7040';
          ctx.fillRect(tx + 1, GROUND_Y - 13, 2, 8);
          ctx.fillStyle = '#9aa8b8';
          ctx.fillRect(tx - 1, GROUND_Y - 16, 5, 3);
        } else if (shop.kind === 'sword') {
          ctx.fillStyle = '#c9d7e6';
          ctx.fillRect(tx + 1, GROUND_Y - 16, 2, 8);
          ctx.fillStyle = w.crest.secondaryColor;
          ctx.fillRect(tx, GROUND_Y - 9, 4, 2);
          ctx.fillStyle = '#6b472b';
          ctx.fillRect(tx + 1, GROUND_Y - 7, 2, 3);
        } else {
          // Seed pouch
          ctx.fillStyle = '#8c6943';
          ctx.fillRect(tx, GROUND_Y - 11, 4, 5);
          ctx.fillStyle = '#7bd468';
          ctx.fillRect(tx + 1, GROUND_Y - 14, 2, 3);
        }
      }
    }
  }

  private drawFarms(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    if (w.hall.level < 1) return;
    for (const farm of w.farms) {
      const sx = Math.round(farm.x - camX);
      if (sx < -36 || sx > LOGICAL_WIDTH + 36) continue;

      if (farm.level === 0) {
        // Fertile Nordic soil marker
        ctx.fillStyle = '#473628';
        ctx.fillRect(sx - 18, GROUND_Y - 2, 36, 3);
        ctx.fillStyle = '#6da658';
        ctx.fillRect(sx - 8, GROUND_Y - 5, 2, 3);
        ctx.fillRect(sx + 6, GROUND_Y - 5, 2, 3);
      } else {
        // Fenced Nordic barley farm
        ctx.fillStyle = '#4a3524';
        ctx.fillRect(sx - 20, GROUND_Y - 3, 40, 3);
        // Fence posts
        ctx.fillStyle = '#6b4c32';
        ctx.fillRect(sx - 20, GROUND_Y - 10, 2, 10);
        ctx.fillRect(sx + 18, GROUND_Y - 10, 2, 10);
        ctx.fillRect(sx - 20, GROUND_Y - 7, 40, 2);

        // Growing golden barley stalks
        const stalkH = Math.max(2, Math.round(3 + farm.cropProgress * 9));
        for (let bx = -16; bx <= 14; bx += 4) {
          ctx.fillStyle = farm.cropProgress > 0.7 ? '#e6c050' : '#73b359';
          ctx.fillRect(sx + bx, GROUND_Y - 3 - stalkH, 2, stalkH);
        }

        // Lv2 farmhouse shed with clan banner
        if (farm.level >= 2) {
          ctx.fillStyle = '#5c412c';
          ctx.fillRect(sx - 8, GROUND_Y - 18, 16, 15);
          ctx.fillStyle = w.crest.primaryColor;
          ctx.fillRect(sx - 10, GROUND_Y - 21, 20, 4);
        }
      }

      if (farm.underConstruction) {
        ctx.fillStyle = 'rgba(10,14,20,0.8)';
        ctx.fillRect(sx - 12, GROUND_Y - 26, 24, 4);
        ctx.fillStyle = '#82e08a';
        ctx.fillRect(sx - 11, GROUND_Y - 25, Math.round(22 * farm.buildProgress), 2);
      }
    }
  }

  private drawWalls(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const wall of w.walls) {
      const sx = Math.round(wall.x - camX);
      if (sx < -30 || sx > LOGICAL_WIDTH + 30) continue;

      if (wall.destroyed) {
        // Splintered ruined wall awaiting builders to reform!
        ctx.fillStyle = '#4a3221';
        ctx.fillRect(sx - 9, GROUND_Y - 7, 5, 7);
        ctx.fillRect(sx + 3, GROUND_Y - 5, 6, 5);
        ctx.fillStyle = '#697482';
        ctx.fillRect(sx - 5, GROUND_Y - 4, 10, 4);
      } else if (wall.level === 0) {
        ctx.fillStyle = '#5c4e43';
        ctx.fillRect(sx - 10, GROUND_Y - 4, 20, 4);
        ctx.fillStyle = '#75828f';
        ctx.fillRect(sx - 6, GROUND_Y - 6, 12, 3);
      } else {
        const h = wall.level === 1 ? 22 : wall.level === 2 ? 30 : 38;
        const baseColor = wall.hitFlash > 0 ? '#ffffff' : wall.level === 3 ? '#6d7885' : '#69472c';
        const darkColor = wall.hitFlash > 0 ? '#e8e8e8' : wall.level === 3 ? '#4a5461' : '#4a301d';

        ctx.fillStyle = baseColor;
        ctx.fillRect(sx - 8, GROUND_Y - h, 16, h);
        ctx.fillStyle = darkColor;
        ctx.fillRect(sx - 8, GROUND_Y - h, 3, h);
        ctx.fillRect(sx + 1, GROUND_Y - h, 2, h);

        ctx.fillStyle = baseColor;
        for (let px = -7; px <= 5; px += 4) {
          ctx.fillRect(sx + px, GROUND_Y - h - 4, 3, 4);
        }

        // Player's custom Clan Shield Emblem mounted on Lv2+ walls!
        if (wall.level >= 2) {
          drawShieldEmblem(ctx, w.crest, sx, GROUND_Y - Math.floor(h * 0.58), 5.2);
          const fl = Math.floor(w.elapsed * 10 + wall.id) % 2;
          ctx.fillStyle = '#ff982b';
          ctx.fillRect(sx - 1, GROUND_Y - h - 7 - fl, 3, 4 + fl);
          ctx.fillStyle = '#fff099';
          ctx.fillRect(sx, GROUND_Y - h - 6, 1, 2);
        }

        if (wall.hp < wall.maxHp) {
          const ratio = Math.max(0, wall.hp / wall.maxHp);
          ctx.fillStyle = 'rgba(10,14,20,0.75)';
          ctx.fillRect(sx - 10, GROUND_Y - h - 11, 20, 3);
          ctx.fillStyle = ratio > 0.4 ? '#6fd48c' : '#ff5e6c';
          ctx.fillRect(sx - 9, GROUND_Y - h - 10, Math.round(18 * ratio), 1);
        }
      }

      if (wall.underConstruction) {
        ctx.fillStyle = 'rgba(196, 152, 92, 0.75)';
        ctx.fillRect(sx - 11, GROUND_Y - 22, 2, 22);
        ctx.fillRect(sx + 9, GROUND_Y - 22, 2, 22);
        ctx.fillRect(sx - 11, GROUND_Y - 12, 22, 2);

        ctx.fillStyle = 'rgba(10,14,20,0.8)';
        ctx.fillRect(sx - 12, GROUND_Y - 29, 24, 4);
        ctx.fillStyle = '#efc462';
        ctx.fillRect(sx - 11, GROUND_Y - 28, Math.round(22 * wall.buildProgress), 2);
      }
    }
  }

  private drawWildlife(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const prey of w.wildlife) {
      const sx = Math.round(prey.x - camX);
      if (sx < -20 || sx > LOGICAL_WIDTH + 20) continue;
      const hop = Math.abs(prey.vx) > 2 ? Math.abs(Math.round(Math.sin(prey.animTime) * 2)) : 0;

      if (prey.kind === 'rabbit') {
        ctx.fillStyle = '#dce4ec';
        ctx.fillRect(sx - 3, GROUND_Y - 4 - hop, 6, 4);
        ctx.fillRect(sx + prey.facing * 2, GROUND_Y - 7 - hop, 2, 3);
      } else {
        ctx.fillStyle = '#8c694a';
        ctx.fillRect(sx - 5, GROUND_Y - 10 - hop, 10, 5);
        ctx.fillRect(sx - 4, GROUND_Y - 5, 2, 5);
        ctx.fillRect(sx + 2, GROUND_Y - 5, 2, 5);
        ctx.fillRect(sx + prey.facing * 4, GROUND_Y - 14 - hop, 3, 5);
        ctx.fillStyle = '#d9cbb8';
        ctx.fillRect(sx + prey.facing * 5, GROUND_Y - 17 - hop, 2, 3);
      }
    }
  }

  private drawVillagers(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const v of w.villagers) {
      const sx = Math.round(v.x - camX);
      if (sx < -20 || sx > LOGICAL_WIDTH + 20) continue;
      this.drawSingleVillager(ctx, w, v, sx);
    }
  }

  private drawSingleVillager(ctx: CanvasRenderingContext2D, w: WorldState, v: Villager, sx: number): void {
    const walkBob = Math.abs(v.vx) > 4 ? Math.round(Math.abs(Math.sin(v.animTime)) * 1.5) : 0;
    const stride = Math.abs(v.vx) > 4 ? Math.round(Math.sin(v.animTime) * 2) : 0;
    const primary = w.crest.primaryColor;
    const secondary = w.crest.secondaryColor;

    // Legs
    ctx.fillStyle = '#2d2522';
    ctx.fillRect(sx - 2 + stride, GROUND_Y - 4, 2, 4);
    ctx.fillRect(sx + 1 - stride, GROUND_Y - 4, 2, 4);

    // Tunic / armor colored by clan crest!
    if (v.role === 'wanderer') ctx.fillStyle = '#6c5a4c';
    else if (v.role === 'peasant') ctx.fillStyle = '#9c866d';
    else if (v.role === 'warrior') ctx.fillStyle = primary;
    else if (v.role === 'archer') ctx.fillStyle = primary;
    else if (v.role === 'builder') ctx.fillStyle = '#4e5d6c';
    else ctx.fillStyle = '#5c734b'; // producer

    ctx.fillRect(sx - 3, GROUND_Y - 11 - walkBob, 6, 7);

    // Clan secondary trim stripe on all recruited specialists
    if (v.role !== 'wanderer' && v.role !== 'peasant') {
      ctx.fillStyle = secondary;
      ctx.fillRect(sx - 3, GROUND_Y - 7 - walkBob, 6, 1);
    }

    // Head
    ctx.fillStyle = '#e5be9e';
    ctx.fillRect(sx - 2, GROUND_Y - 15 - walkBob, 4, 4);

    if (v.role === 'warrior') {
      // Iron Nordic helm + sword + clan-colored shield!
      ctx.fillStyle = '#9aa8b8';
      ctx.fillRect(sx - 3, GROUND_Y - 17 - walkBob, 6, 3);
      ctx.fillStyle = secondary;
      ctx.fillRect(sx - 1, GROUND_Y - 16 - walkBob, 2, 1);
      // Sword
      ctx.fillStyle = '#d4e2f0';
      ctx.fillRect(sx + v.facing * 4, GROUND_Y - 16 - walkBob, 2, 7);
      // Mini Clan Shield
      ctx.fillStyle = primary;
      ctx.fillRect(sx - v.facing * 4 - 1, GROUND_Y - 12 - walkBob, 4, 6);
      ctx.fillStyle = secondary;
      ctx.fillRect(sx - v.facing * 4, GROUND_Y - 10 - walkBob, 2, 2);
    } else if (v.role === 'archer') {
      ctx.fillStyle = primary;
      ctx.fillRect(sx - 3, GROUND_Y - 16 - walkBob, 6, 2);
      ctx.fillStyle = '#c48d4e';
      ctx.fillRect(sx + v.facing * 3, GROUND_Y - 13 - walkBob, 2, 7);
    } else if (v.role === 'builder') {
      ctx.fillStyle = primary;
      ctx.fillRect(sx - 3, GROUND_Y - 16 - walkBob, 6, 2);
      ctx.fillStyle = '#9aa8b8';
      ctx.fillRect(sx + v.facing * 3, GROUND_Y - 14 - walkBob, 3, 2);
      ctx.fillStyle = '#8c6036';
      ctx.fillRect(sx + v.facing * 3, GROUND_Y - 12 - walkBob, 1, 5);
    } else if (v.role === 'producer') {
      // Straw hat / hood + clan scarf + seed pouch
      ctx.fillStyle = '#c9a66b';
      ctx.fillRect(sx - 4, GROUND_Y - 16 - walkBob, 8, 2);
      ctx.fillStyle = primary;
      ctx.fillRect(sx - 2, GROUND_Y - 11 - walkBob, 4, 2);
      ctx.fillStyle = '#7bd468';
      ctx.fillRect(sx + v.facing * 3, GROUND_Y - 10 - walkBob, 2, 3);
    } else if (v.role === 'wanderer') {
      ctx.fillStyle = '#4a3d34';
      ctx.fillRect(sx - 2, GROUND_Y - 16 - walkBob, 4, 2);
    }

    if (v.carriedCoins > 0) {
      ctx.fillStyle = '#f7d265';
      ctx.fillRect(sx - 1, GROUND_Y - 20 - walkBob, 3, 3);
    }

    // Visual tactical order arrow over unit when dispatched via Z/X/C/V!
    if (v.orderFlashTimer > 0) {
      ctx.fillStyle = secondary;
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(v.orderDir < 0 ? '◀' : '▶', sx, GROUND_Y - 22 - walkBob);
      ctx.textAlign = 'left';
    }
  }

  private drawEnemies(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const e of w.enemies) {
      const sx = Math.round(e.x - camX);
      if (sx < -24 || sx > LOGICAL_WIDTH + 24) continue;
      this.drawSingleEnemy(ctx, w, e, sx);
    }
  }

  private drawSingleEnemy(ctx: CanvasRenderingContext2D, w: WorldState, e: Enemy, sx: number): void {
    const isBrute = e.kind === 'draugr_brute';
    const bob = Math.round(Math.abs(Math.sin(e.animTime)) * 2);
    const stride = Math.round(Math.sin(e.animTime) * 2.5);
    const bodyW = isBrute ? 10 : 7;
    const bodyH = isBrute ? 12 : 8;
    const baseY = GROUND_Y - bob;

    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#1b2633';
    ctx.fillRect(sx - 3 + stride, GROUND_Y - 5, 2, 5);
    ctx.fillRect(sx + 1 - stride, GROUND_Y - 5, 2, 5);

    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : isBrute ? '#2f4557' : '#253847';
    ctx.fillRect(sx - Math.floor(bodyW / 2), baseY - 5 - bodyH, bodyW, bodyH);

    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#85a6b5';
    ctx.fillRect(sx - 2, baseY - 9 - bodyH, 5, 4);
    ctx.fillStyle = '#26303d';
    ctx.fillRect(sx - 3, baseY - 11 - bodyH, 7, 2);
    if (isBrute) {
      ctx.fillStyle = '#c8d6e0';
      ctx.fillRect(sx - 4, baseY - 13 - bodyH, 2, 3);
      ctx.fillRect(sx + 3, baseY - 13 - bodyH, 2, 3);
    }

    ctx.fillStyle = '#6bf7ff';
    ctx.fillRect(sx + (e.facing > 0 ? 1 : -2), baseY - 8 - bodyH, 2, 1);

    ctx.fillStyle = '#8fa3b5';
    ctx.fillRect(sx + e.facing * (isBrute ? 5 : 4), baseY - 12, isBrute ? 3 : 2, isBrute ? 8 : 5);

    if (e.stolenLoot === 'coin') {
      ctx.fillStyle = '#f7d265';
      ctx.fillRect(sx - 2, baseY - 15 - bodyH, 4, 4);
    } else if (e.stolenLoot === 'crown') {
      this.drawCrownSprite(ctx, w, sx, baseY - 16 - bodyH);
    }
  }

  private drawCrownSprite(ctx: CanvasRenderingContext2D, w: WorldState, x: number, y: number): void {
    const preset = CROWN_PRESETS[w.appearance.crownIndex] ?? CROWN_PRESETS[0];
    ctx.fillStyle = preset.gold;
    ctx.fillRect(x - 3, y, 7, 3);
    ctx.fillStyle = preset.shine;
    ctx.fillRect(x - 3, y - 2, 2, 2);
    ctx.fillRect(x, y - 3, 1, 3);
    ctx.fillRect(x + 2, y - 2, 2, 2);
  }

  private drawMonarch(
    ctx: CanvasRenderingContext2D,
    w: WorldState,
    m: Monarch,
    camX: number,
    scale: number,
    screenX: number,
    groundY: number
  ): void {
    const outfit = OUTFIT_PRESETS[w.appearance.outfitIndex] ?? OUTFIT_PRESETS[0];
    const hair = HAIR_PRESETS[w.appearance.hairIndex] ?? HAIR_PRESETS[0];
    const horse = HORSE_PRESETS[w.appearance.horseIndex] ?? HORSE_PRESETS[0];
    const primary = w.crest.primaryColor;
    const secondary = w.crest.secondaryColor;

    const f = m.facing;
    const moving = Math.abs(m.vx) > 6;
    const gallop = moving ? Math.sin(m.animTime) : 0;
    const bob = moving ? Math.round(Math.abs(gallop) * (m.sprinting ? 2.5 : 1.5)) : 0;
    const legA = moving ? Math.round(gallop * 4) : 0;
    const legB = moving ? Math.round(-gallop * 4) : 0;

    ctx.save();
    ctx.translate(screenX, groundY);
    ctx.scale(scale, scale);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(-11, -1, 22, 2);

    // Starter Horse legs
    ctx.fillStyle = horse.legs;
    ctx.fillRect(-7 + legA, -7, 2, 7);
    ctx.fillRect(-4 + legB, -7, 2, 7);
    ctx.fillRect(3 + legB, -7, 2, 7);
    ctx.fillRect(6 + legA, -7, 2, 7);

    // Horse body
    ctx.fillStyle = horse.coat;
    ctx.fillRect(-9, -14 - bob, 18, 7);
    // Tail & Mane
    ctx.fillStyle = horse.mane;
    ctx.fillRect(-f * 11, -13 - bob, 3, 5);
    ctx.fillStyle = horse.coat;
    ctx.fillRect(f * 6 - (f < 0 ? 4 : 0), -19 - bob, 5, 7);
    ctx.fillRect(f * 9 - (f < 0 ? 5 : 0), -20 - bob, 5, 4);
    ctx.fillStyle = horse.mane;
    ctx.fillRect(f * 5 - (f < 0 ? 2 : 0), -19 - bob, 2, 5);

    // Saddlecloth in Clan Colors!
    ctx.fillStyle = primary;
    ctx.fillRect(-4, -14 - bob, 8, 5);
    ctx.fillStyle = secondary;
    ctx.fillRect(-4, -10 - bob, 8, 1);

    // Flowing Cape in Clan Primary Color!
    const capeSway = moving ? (m.sprinting ? 5 : 3) : 1;
    ctx.fillStyle = primary;
    ctx.fillRect(-f * (4 + capeSway) - (f > 0 ? 4 : 0), -21 - bob, 6 + capeSway, 7);

    // Monarch outfit torso + trim
    ctx.fillStyle = outfit.tunic;
    ctx.fillRect(-3, -21 - bob, 6, 8);
    ctx.fillStyle = secondary;
    ctx.fillRect(-3, -15 - bob, 6, 1);

    // Head + Hair/Beard/Hood
    ctx.fillStyle = outfit.skin;
    ctx.fillRect(-2, -25 - bob, 4, 4);
    ctx.fillStyle = hair.color;
    ctx.fillRect(-3, -25 - bob, 1, 4);
    if (outfit.hasBeard) {
      ctx.fillRect(f > 0 ? 0 : -2, -22 - bob, 3, 3);
    }
    if (outfit.hasHood) {
      ctx.fillStyle = outfit.tunic;
      ctx.fillRect(-3, -26 - bob, 6, 2);
    }

    if (m.hasCrown) {
      this.drawCrownSprite(ctx, w, 0, -27 - bob);
    }

    ctx.restore();

    // Fallen Crown + Stamina strip (only in world space scale === 1)
    if (scale === 1) {
      if (!m.hasCrown && m.crownStolenByEnemyId === null) {
        const cx = Math.round(m.crownX - camX);
        const cy = Math.round(m.crownY);
        ctx.fillStyle = 'rgba(255, 224, 102, 0.28)';
        ctx.beginPath();
        ctx.arc(cx, cy - 1, 9, 0, Math.PI * 2);
        ctx.fill();
        this.drawCrownSprite(ctx, w, cx, cy - 2);
      }

      if (m.stamina < 0.98) {
        ctx.fillStyle = 'rgba(8, 14, 24, 0.65)';
        ctx.fillRect(screenX - 10, GROUND_Y + 3, 20, 2);
        ctx.fillStyle = m.exhausted ? '#ff7c7c' : '#a8dcff';
        ctx.fillRect(screenX - 10, GROUND_Y + 3, Math.round(20 * m.stamina), 2);
      }
    }
  }

  private drawCoins(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const c of w.coins) {
      const sx = Math.round(c.x - camX);
      if (sx < -8 || sx > LOGICAL_WIDTH + 8) continue;
      const sy = Math.round(c.y);
      ctx.fillStyle = '#b87f14';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(sx - 1, sy - 2, 2, 3);
    }
  }

  private drawFlyingCoins(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const fc of w.flyingCoins) {
      const t = Math.min(1, fc.progress);
      // Smooth upward parabolic arc from horse rising into placeholder slot!
      const ease = 1 - Math.pow(1 - t, 2);
      const wx = lerp(fc.startX, fc.targetX, ease);
      const wy = lerp(fc.startY, fc.targetY, ease) - Math.sin(t * Math.PI) * 26;
      const sx = Math.round(wx - camX);
      const sy = Math.round(wy);

      // Trail shimmer
      ctx.fillStyle = 'rgba(255, 232, 130, 0.35)';
      ctx.fillRect(sx - 2, sy + 2, 4, 4);

      // Gleaming flying coin
      ctx.fillStyle = '#b87f14';
      ctx.fillRect(sx - 3, sy - 3, 6, 6);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
      ctx.fillStyle = '#fff9d6';
      ctx.fillRect(sx - 1, sy - 2, 2, 2);
    }
  }

  private drawArrows(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const a of w.arrows) {
      const sx = Math.round(a.x - camX);
      if (sx < -12 || sx > LOGICAL_WIDTH + 12) continue;
      const sy = Math.round(a.y);
      const angle = Math.atan2(a.vy, a.vx);
      const dx = Math.cos(angle) * 5;
      const dy = Math.sin(angle) * 5;
      ctx.strokeStyle = '#e8dfc8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - dx, sy - dy);
      ctx.lineTo(sx + dx, sy + dy);
      ctx.stroke();
    }
  }

  private drawWorldParticles(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const p of w.particles) {
      if (p.kind === 'snow') continue;
      const sx = Math.round(p.x - camX);
      if (sx < -8 || sx > LOGICAL_WIDTH + 8) continue;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(sx, Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawLighting(ctx: CanvasRenderingContext2D, w: WorldState, camX: number, nightFactor: number): void {
    ctx.fillStyle = w.isBloodMoon
      ? `rgba(26, 6, 14, ${(nightFactor * 0.34).toFixed(2)})`
      : `rgba(6, 14, 28, ${(nightFactor * 0.36).toFixed(2)})`;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, WATER_Y);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const drawGlow = (worldX: number, y: number, radius: number, color: string) => {
      const sx = Math.round(worldX - camX);
      if (sx < -radius || sx > LOGICAL_WIDTH + radius) return;
      const g = ctx.createRadialGradient(sx, y, 2, sx, y, radius);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - radius, y - radius, radius * 2, radius * 2);
    };

    if (w.hall.level >= 1) {
      const flick = Math.sin(w.elapsed * 11) * 4;
      drawGlow(w.hall.x, GROUND_Y - 12, (w.hall.level >= 2 ? 78 : 56) + flick, `rgba(255, 160, 58, ${(0.32 * nightFactor).toFixed(2)})`);
    }
    for (const c of w.camps) {
      drawGlow(c.x + 12, GROUND_Y - 6, 36, `rgba(255, 138, 46, ${(0.25 * nightFactor).toFixed(2)})`);
    }
    for (const wall of w.walls) {
      if (wall.level >= 2 && !wall.destroyed) {
        drawGlow(wall.x, GROUND_Y - 34, 42, `rgba(255, 165, 65, ${(0.26 * nightFactor).toFixed(2)})`);
      }
    }
    for (const portal of w.portals) {
      if (!portal.destroyed) {
        drawGlow(portal.x, GROUND_Y - 22, 64, `rgba(88, 224, 255, ${(0.26 * nightFactor).toFixed(2)})`);
      }
    }

    ctx.restore();
  }

  private drawWaterReflection(ctx: CanvasRenderingContext2D, w: WorldState, nightFactor: number): void {
    this.reflectionCtx.clearRect(0, 0, LOGICAL_WIDTH, WATER_Y);
    this.reflectionCtx.drawImage(ctx.canvas, 0, 0, LOGICAL_WIDTH, WATER_Y, 0, 0, LOGICAL_WIDTH, WATER_Y);

    const waterH = LOGICAL_HEIGHT - WATER_Y;
    const waterGrad = ctx.createLinearGradient(0, WATER_Y, 0, LOGICAL_HEIGHT);
    const wTop = lerpRGB({ r: 24, g: 52, b: 74 }, { r: 7, g: 16, b: 28 }, nightFactor);
    const wBot = lerpRGB({ r: 10, g: 24, b: 38 }, { r: 3, g: 8, b: 16 }, nightFactor);
    waterGrad.addColorStop(0, rgbStr(wTop));
    waterGrad.addColorStop(1, rgbStr(wBot));
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, WATER_Y, LOGICAL_WIDTH, waterH);

    ctx.save();
    ctx.globalAlpha = 0.42;
    for (let dy = 0; dy < waterH; dy += 2) {
      const srcY = Math.max(0, WATER_Y - 4 - Math.floor(dy * 1.45));
      const wave = Math.round(Math.sin(w.elapsed * 2.8 + dy * 0.32) * (1 + dy * 0.05));
      ctx.drawImage(this.reflectionCanvas, 0, srcY, LOGICAL_WIDTH, 2, wave, WATER_Y + dy, LOGICAL_WIDTH, 2);
    }
    ctx.restore();

    ctx.fillStyle = `rgba(185, 225, 250, ${lerp(0.16, 0.1, nightFactor).toFixed(2)})`;
    for (let i = 0; i < 14; i++) {
      const sx = Math.round(((i * 73 + w.elapsed * (8 + (i % 3) * 4)) % (LOGICAL_WIDTH + 40)) - 20);
      const sy = WATER_Y + 4 + ((i * 11) % (waterH - 8));
      ctx.fillRect(sx, sy, 12 + (i % 4) * 5, 1);
    }

    ctx.fillStyle = `rgba(190, 224, 242, ${lerp(0.32, 0.14, nightFactor).toFixed(2)})`;
    ctx.fillRect(0, WATER_Y, LOGICAL_WIDTH, 1);
  }

  private drawSnowParticles(ctx: CanvasRenderingContext2D, w: WorldState): void {
    for (const p of w.particles) {
      if (p.kind !== 'snow') continue;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawFloatingPrompt(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    const pr = w.activePrompt;
    if (!pr) return;
    const sx = Math.round(pr.x - camX);
    const bob = Math.round(Math.sin(w.elapsed * 5) * 1.5);
    const sy = Math.round(pr.y + bob);

    const slotStep = 10;
    const slotsW = pr.cost * slotStep - 2;
    const boxW = Math.max(slotsW + 18, pr.label.length * 4.7 + 14);
    const bx = Math.max(8, Math.min(LOGICAL_WIDTH - boxW - 8, Math.round(sx - boxW / 2)));

    // Generous touch/click hitbox covering the coin slots & prompt box!
    this.addHit('prompt_coin_slot', bx - 8, sy - 26, boxW + 16, 40);

    ctx.fillStyle = 'rgba(8, 14, 24, 0.88)';
    ctx.fillRect(bx, sy - 21, boxW, 26);
    ctx.strokeStyle = 'rgba(239, 196, 98, 0.82)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, sy - 20.5, boxW - 1, 25);

    ctx.fillStyle = '#e6eef7';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(pr.label, bx + boxW / 2, sy - 12);

    const startX = Math.round(bx + boxW / 2 - slotsW / 2);
    for (let i = 0; i < pr.cost; i++) {
      const cx = startX + i * slotStep;
      const cy = sy - 7;
      if (i < pr.paid) {
        ctx.fillStyle = '#f7d265';
        ctx.fillRect(cx, cy, 7, 7);
        ctx.fillStyle = '#fff5bd';
        ctx.fillRect(cx + 1, cy + 1, 2, 2);
      } else if (i < pr.paid + pr.pending) {
        ctx.fillStyle = 'rgba(255, 224, 102, 0.55)';
        ctx.fillRect(cx, cy, 7, 7);
        ctx.strokeStyle = '#fff3b0';
        ctx.strokeRect(cx + 0.5, cy + 0.5, 6, 6);
      } else {
        ctx.fillStyle = 'rgba(247, 210, 101, 0.2)';
        ctx.fillRect(cx, cy, 7, 7);
        ctx.strokeStyle = '#f7d265';
        ctx.strokeRect(cx + 0.5, cy + 0.5, 6, 6);
      }
    }
    ctx.textAlign = 'left';
  }

  // =========================================================================
  // PIXEL-ART CLASS ICONS + TOP HUD + TACTICAL COMMAND BAR (TOUCH + Z/X/C/V)
  // =========================================================================
  private drawPixelIcon(
    ctx: CanvasRenderingContext2D,
    kind: 'hammer' | 'sword' | 'bow' | 'seed',
    x: number,
    y: number
  ): void {
    if (kind === 'hammer') {
      ctx.fillStyle = '#9e7040';
      ctx.fillRect(x + 3, y + 3, 2, 7);
      ctx.fillStyle = '#bcc9d6';
      ctx.fillRect(x + 1, y + 1, 7, 3);
      ctx.fillStyle = '#e6f0f8';
      ctx.fillRect(x + 1, y + 1, 7, 1);
    } else if (kind === 'sword') {
      ctx.fillStyle = '#dce7f2';
      ctx.fillRect(x + 4, y + 0, 2, 6);
      ctx.fillStyle = '#9aa8b8';
      ctx.fillRect(x + 5, y + 1, 1, 5);
      ctx.fillStyle = '#efc462';
      ctx.fillRect(x + 2, y + 6, 6, 2);
      ctx.fillStyle = '#7a4b2a';
      ctx.fillRect(x + 4, y + 8, 2, 2);
    } else if (kind === 'bow') {
      ctx.fillStyle = '#c48d4e';
      ctx.fillRect(x + 2, y + 1, 2, 2);
      ctx.fillRect(x + 1, y + 3, 2, 4);
      ctx.fillRect(x + 2, y + 7, 2, 2);
      ctx.fillStyle = '#e6e1d3';
      ctx.fillRect(x + 4, y + 1, 1, 8);
      ctx.fillStyle = '#9ec4e0';
      ctx.fillRect(x + 3, y + 4, 5, 1);
    } else {
      ctx.fillStyle = '#d9b25f';
      ctx.fillRect(x + 3, y + 5, 4, 4);
      ctx.fillStyle = '#fff0b3';
      ctx.fillRect(x + 4, y + 6, 1, 2);
      ctx.fillStyle = '#6fd472';
      ctx.fillRect(x + 4, y + 2, 2, 3);
      ctx.fillRect(x + 2, y + 1, 2, 2);
      ctx.fillRect(x + 6, y + 2, 2, 2);
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, w: WorldState): void {
    const monarch = w.monarchs[0];
    if (!monarch) return;

    const countRole = (role: Villager['role']) => {
      let left = 0;
      let right = 0;
      for (const v of w.villagers) {
        if (v.role === role) {
          if (v.side === -1) left++;
          else right++;
        }
      }
      return { left, right, total: left + right };
    };

    const builders = countRole('builder');
    const warriors = countRole('warrior');
    const archers = countRole('archer');
    const producers = countRole('producer');

    // Top-left Clan Crest + Day badge + 6m Day / 6m Night progress strip
    ctx.fillStyle = 'rgba(8, 14, 24, 0.8)';
    ctx.fillRect(6, 5, 78, 26);
    ctx.strokeStyle = w.isBloodMoon ? 'rgba(255, 94, 108, 0.7)' : 'rgba(205, 224, 242, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(6.5, 5.5, 77, 25);

    drawShieldEmblem(ctx, w.crest, 18, 18, 7);

    ctx.fillStyle = w.isNight ? (w.isBloodMoon ? '#ff6464' : '#9ed4ff') : '#ffd966';
    ctx.fillRect(30, 11, 5, 5);
    ctx.fillStyle = '#e8f0f8';
    ctx.font = 'bold 8px monospace';
    ctx.fillText(`DIA ${w.day}`, 39, 17);

    // Phase progress bar (0..0.5 Day, 0.5..1.0 Night)
    const phaseProg = w.timeOfDay < 0.5 ? w.timeOfDay / 0.5 : (w.timeOfDay - 0.5) / 0.5;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(30, 22, 48, 3);
    ctx.fillStyle = w.isNight ? (w.isBloodMoon ? '#ff6464' : '#74b9ff') : '#f7d265';
    ctx.fillRect(30, 22, Math.max(1, Math.round(48 * phaseProg)), 3);

    // TOP CENTER: 4 CLICKABLE/TAPPABLE PIXEL-ART CLASS ICONS (Martelo, Espada, Arco, Semente)
    const badges: Array<{
      id: string;
      icon: 'hammer' | 'sword' | 'bow' | 'seed';
      key: string;
      cmd: CommandMode;
      counts: { left: number; right: number; total: number };
    }> = [
      { id: 'hud_cmd_build', icon: 'hammer', key: 'C', cmd: 'build', counts: builders },
      { id: 'hud_cmd_attack', icon: 'sword', key: 'Z', cmd: 'attack', counts: warriors },
      { id: 'hud_cmd_archer', icon: 'bow', key: 'X', cmd: 'archer', counts: archers },
      { id: 'hud_cmd_produce', icon: 'seed', key: 'V', cmd: 'produce', counts: producers },
    ];

    const badgeW = 63;
    const badgeH = 26;
    const totalW = badges.length * badgeW + (badges.length - 1) * 4;
    const startX = Math.round((LOGICAL_WIDTH - totalW) / 2) + 8;

    badges.forEach((b, idx) => {
      const bx = startX + idx * (badgeW + 4);
      const by = 5;
      const active = w.activeCommand === b.cmd;

      // Register generous touch/click hitbox for each top icon!
      this.addHit(b.id, bx - 1, by - 2, badgeW + 2, badgeH + 4);

      ctx.fillStyle = active ? 'rgba(46, 36, 12, 0.96)' : 'rgba(8, 14, 24, 0.8)';
      ctx.fillRect(bx, by, badgeW, badgeH);
      ctx.strokeStyle = active ? '#ffe066' : 'rgba(195, 215, 236, 0.28)';
      ctx.strokeRect(bx + 0.5, by + 0.5, badgeW - 1, badgeH - 1);

      this.drawPixelIcon(ctx, b.icon, bx + 4, by + 8);

      ctx.fillStyle = active ? '#ffe58a' : '#eef4fa';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(`${b.counts.total}`, bx + 16, by + 14);

      ctx.fillStyle = '#90a8bf';
      ctx.font = '6px monospace';
      ctx.fillText(`${b.counts.left}◀|▶${b.counts.right}`, bx + 15, by + 23);

      ctx.fillStyle = active ? '#ffe066' : 'rgba(160, 185, 210, 0.65)';
      ctx.font = 'bold 6px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`[${b.key}]`, bx + badgeW - 3, by + 11);
      ctx.textAlign = 'left';
    });

    // Top-right Gold Coin Pouch
    ctx.fillStyle = 'rgba(8, 14, 24, 0.82)';
    ctx.fillRect(LOGICAL_WIDTH - 62, 5, 56, 26);
    ctx.strokeStyle = 'rgba(239, 196, 98, 0.5)';
    ctx.strokeRect(LOGICAL_WIDTH - 61.5, 5.5, 55, 25);

    ctx.fillStyle = '#f7d265';
    ctx.fillRect(LOGICAL_WIDTH - 55, 14, 7, 7);
    ctx.fillStyle = '#fff5bd';
    ctx.fillRect(LOGICAL_WIDTH - 54, 15, 2, 2);

    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(`${monarch.coins}`, LOGICAL_WIDTH - 44, 21);

    // Active Tactical Command Banner (tap icon at top OR hold Z/X/C/V)
    if (w.activeCommand !== 'none' || w.commandFeedback) {
      const cmdLabels: Record<Exclude<CommandMode, 'none'>, string> = {
        attack: 'COMANDO DE ATAQUE [Z] — GUERREIROS',
        archer: 'COMANDO DE ARCO [X] — ARQUEIROS',
        build: 'COMANDO DE CONSTRUÇÃO [C] — CONSTRUTORES',
        produce: 'COMANDO DE PRODUÇÃO [V] — PRODUTORES',
      };
      const showMode = w.activeCommand !== 'none' ? w.activeCommand : w.commandFeedback!.mode;
      const barX = LOGICAL_WIDTH / 2 - 156;
      const barW = 312;
      const barY = 35;
      ctx.fillStyle = 'rgba(10, 16, 26, 0.9)';
      ctx.fillRect(barX, barY, barW, 24);
      ctx.strokeStyle = '#efc462';
      ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, 23);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe58a';
      ctx.font = 'bold 7px monospace';
      ctx.fillText(
        showMode !== 'none' ? cmdLabels[showMode] : '',
        LOGICAL_WIDTH / 2 - 10,
        barY + 10
      );
      ctx.fillStyle = '#d4e6f7';
      ctx.font = '7px monospace';
      ctx.fillText(
        w.commandFeedback
          ? w.commandFeedback.text
          : 'Toque/clique na ESQUERDA ou DIREITA da tela para enviar tropas',
        LOGICAL_WIDTH / 2 - 10,
        barY + 20
      );

      // Clickable Close [×] button when toggled via tap/click
      if (w.touchCommandMode !== 'none') {
        const closeX = barX + barW - 22;
        const closeY = barY + 4;
        ctx.fillStyle = '#2b2412';
        ctx.fillRect(closeX, closeY, 18, 16);
        ctx.strokeStyle = '#efc462';
        ctx.strokeRect(closeX + 0.5, closeY + 0.5, 17, 15);
        ctx.fillStyle = '#ffe58a';
        ctx.font = 'bold 8px monospace';
        ctx.fillText('×', closeX + 9, closeY + 11);
        this.addHit('hud_cmd_close', closeX - 4, closeY - 4, 26, 24);
      }
      ctx.textAlign = 'left';
    }

    // Subtle visual Touch / Mouse directional ripple feedback
    if (w.touchIndicator && w.mode === 'playing') {
      const ti = w.touchIndicator;
      const alpha = Math.min(0.65, ti.timer * 2.2);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = ti.sprinting ? '#ffe066' : '#cbe4f7';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ti.x, ti.y, 10 + (0.35 - ti.timer) * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ti.sprinting ? '#ffe066' : '#e6f2ff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      const arrow = ti.side < 0 ? (ti.sprinting ? '««' : '◀') : ti.sprinting ? '»»' : '▶';
      ctx.fillText(arrow, ti.x, ti.y + 3);
      ctx.restore();
      ctx.textAlign = 'left';
    }

    // Minimap bar along bottom of water
    const mapW = 148;
    const mapX = Math.round((LOGICAL_WIDTH - mapW) / 2);
    const mapY = LOGICAL_HEIGHT - 10;
    ctx.fillStyle = 'rgba(6, 12, 20, 0.62)';
    ctx.fillRect(mapX, mapY, mapW, 4);

    const toMapX = (wx: number) => mapX + Math.round((wx / WORLD_WIDTH) * mapW);
    for (const p of w.portals) {
      if (p.destroyed) continue;
      ctx.fillStyle = '#7cf7ff';
      ctx.fillRect(toMapX(p.x) - 1, mapY, 2, 4);
    }
    for (const wall of w.walls) {
      if (wall.level <= 0 && !wall.destroyed) continue;
      ctx.fillStyle = wall.destroyed ? '#ff646c' : '#c9935b';
      ctx.fillRect(toMapX(wall.x), mapY, 2, 4);
    }
    ctx.fillStyle = '#ff5e6c';
    for (const e of w.enemies) {
      ctx.fillRect(toMapX(e.x), mapY + 1, 1, 2);
    }
    ctx.fillStyle = w.crest.secondaryColor;
    ctx.fillRect(toMapX(w.hall.x) - 1, mapY - 1, 3, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(toMapX(monarch.x) - 1, mapY - 1, 2, 6);
  }

  private drawBanner(ctx: CanvasRenderingContext2D, w: WorldState): void {
    const b = w.banner;
    if (!b) return;
    const fadeIn = Math.min(1, (b.maxTimer - b.timer) / 0.35);
    const fadeOut = Math.min(1, b.timer / 0.55);
    const alpha = Math.min(fadeIn, fadeOut);
    const yOff = w.activeCommand !== 'none' || w.commandFeedback ? 58 : 34;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(8, 14, 24, 0.8)';
    ctx.fillRect(LOGICAL_WIDTH / 2 - 152, yOff, 304, 30);
    ctx.fillStyle = b.accent;
    ctx.fillRect(LOGICAL_WIDTH / 2 - 152, yOff, 304, 1);
    ctx.fillRect(LOGICAL_WIDTH / 2 - 152, yOff + 29, 304, 1);

    ctx.textAlign = 'center';
    ctx.fillStyle = b.accent;
    ctx.font = 'bold 9px monospace';
    ctx.fillText(b.title, LOGICAL_WIDTH / 2, yOff + 12);

    ctx.fillStyle = '#d4e2ef';
    ctx.font = '7px monospace';
    ctx.fillText(b.subtitle, LOGICAL_WIDTH / 2, yOff + 23);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  private drawPauseOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(6, 12, 22, 0.72)';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    const cx = LOGICAL_WIDTH / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f7d265';
    ctx.font = 'bold 16px Georgia, serif';
    ctx.fillText('PAUSADO', cx, 108);
    ctx.fillStyle = '#d4e2ef';
    ctx.font = '8px monospace';
    ctx.fillText('Pressione P para continuar · Sua campanha foi salva', cx, 128);

    // Return to login button
    ctx.fillStyle = '#182436';
    ctx.fillRect(cx - 76, 146, 152, 22);
    ctx.strokeStyle = 'rgba(239, 196, 98, 0.6)';
    ctx.strokeRect(cx - 75.5, 146.5, 151, 21);
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('VOLTAR AO MENU INICIAL', cx, 160);
    this.addHit('pause_menu', cx - 76, 146, 152, 22);
    ctx.textAlign = 'left';
  }

  private drawGameOverOverlay(ctx: CanvasRenderingContext2D, w: WorldState): void {
    ctx.fillStyle = 'rgba(14, 6, 12, 0.8)';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    const cx = LOGICAL_WIDTH / 2;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6b78';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText('A COROA CAIU', cx, 84);

    ctx.fillStyle = '#d4dde8';
    ctx.font = '8px monospace';
    ctx.fillText('Os Draugrs levaram sua coroa para os portais de Helheim.', cx, 102);

    ctx.fillStyle = 'rgba(8, 14, 24, 0.85)';
    ctx.fillRect(cx - 115, 114, 230, 56);
    ctx.strokeStyle = 'rgba(255, 107, 120, 0.45)';
    ctx.strokeRect(cx - 114.5, 114.5, 229, 55);

    ctx.fillStyle = '#f7d265';
    ctx.fillText(`Dias Sobrevividos: ${w.stats.daysSurvived}`, cx, 130);
    ctx.fillStyle = '#cfe0ee';
    ctx.fillText(`Draugrs Derrotados: ${w.stats.draugrSlain}`, cx, 143);
    ctx.fillText(`Aldeões Recrutados: ${w.stats.villagersRecruited}   ·   Muralhas: ${w.stats.wallsBuilt}`, cx, 156);

    ctx.fillStyle = '#2b2412';
    ctx.fillRect(cx - 96, 186, 192, 24);
    ctx.strokeStyle = '#efc462';
    ctx.strokeRect(cx - 95.5, 186.5, 191, 23);
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('VOLTAR AO LOGIN / NOVA CAMPANHA', cx, 201);
    this.addHit('gameover_menu', cx - 96, 186, 192, 24);
    ctx.textAlign = 'left';
  }
}
