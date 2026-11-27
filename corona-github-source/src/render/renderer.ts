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
import { getLanguage, t } from '../i18n/translations';
import {
  MAX_SAVE_SLOTS,
  countSavedCampaigns,
  getSavedCampaignSummary,
  listCampaignSlots,
} from '../storage/saveSystem';
import {
  GROUND_Y,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MAX_FARMERS_PER_FARM,
  WORLD_WIDTH,
  type CommandMode,
  type Enemy,
  type Monarch,
  type Villager,
  type WorldState,
} from '../types';
import { getTutorialTargetX } from '../systems/simulation';
import { ISLAND_DEFINITIONS, getIslandDef } from '../world/islands';
import { GOD_DEFS, MOUNT_DEFS } from '../world/mountsAndGods';

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

function lerp(a: number, b: number, tVal: number): number {
  return a + (b - a) * tVal;
}

function lerpRGB(c1: RGB, c2: RGB, tVal: number): RGB {
  return {
    r: Math.round(lerp(c1.r, c2.r, tVal)),
    g: Math.round(lerp(c1.g, c2.g, tVal)),
    b: Math.round(lerp(c1.b, c2.b, tVal)),
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
  private stars: Array<{ rx: number; ry: number; phase: number; size: number }>;
  public hitRegions: UiHitRegion[] = [];
  public charSelectFocusRow = 0;
  public crestSelectFocusRow = 0;
  public selectedMapIsland = 1;
  public pendingDeleteSlot: number | null = null;

  // Live responsive logical viewport dimensions (adapts to 100% of any device!)
  private viewW = LOGICAL_WIDTH;
  private viewH = LOGICAL_HEIGHT;
  private groundScreenY = GROUND_Y;
  private waterScreenY = GROUND_Y + 6;
  private worldOffsetY = 0;

  constructor() {
    this.reflectionCanvas = document.createElement('canvas');
    this.reflectionCanvas.width = LOGICAL_WIDTH;
    this.reflectionCanvas.height = GROUND_Y + 6;
    const rCtx = this.reflectionCanvas.getContext('2d');
    if (!rCtx) throw new Error('Failed to create reflection canvas context');
    this.reflectionCtx = rCtx;
    this.reflectionCtx.imageSmoothingEnabled = false;

    // Normalized star positions (0..1) so they cover portrait, landscape & ultrawide naturally
    this.stars = [];
    for (let i = 0; i < 80; i++) {
      this.stars.push({
        rx: ((i * 97 + 23) % 1000) / 1000,
        ry: 0.03 + (((i * 53 + 11) % 500) / 1000),
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

  private syncViewport(ctx: CanvasRenderingContext2D): void {
    const cw = Math.max(200, ctx.canvas.width);
    const ch = Math.max(180, ctx.canvas.height);
    this.viewW = cw;
    this.viewH = ch;
    this.groundScreenY = Math.round(ch * 0.778);
    this.waterScreenY = this.groundScreenY + 6;
    this.worldOffsetY = this.groundScreenY - GROUND_Y;

    if (
      this.reflectionCanvas.width !== cw ||
      this.reflectionCanvas.height !== this.waterScreenY
    ) {
      this.reflectionCanvas.width = cw;
      this.reflectionCanvas.height = this.waterScreenY;
      this.reflectionCtx.imageSmoothingEnabled = false;
    }
  }

  private getSkyColors(tVal: number, isBloodMoon: boolean): { top: RGB; bot: RGB; nightFactor: number } {
    let top: RGB;
    let bot: RGB;
    let nightFactor = 0;

    if (tVal < 0.05) {
      const k = tVal / 0.05;
      top = lerpRGB(SKY_TOP_DAWN, SKY_TOP_DAY, k);
      bot = lerpRGB(SKY_BOT_DAWN, SKY_BOT_DAY, k);
      nightFactor = lerp(0.35, 0, k);
    } else if (tVal < 0.43) {
      top = SKY_TOP_DAY;
      bot = SKY_BOT_DAY;
      nightFactor = 0;
    } else if (tVal < 0.49) {
      const k = (tVal - 0.43) / 0.06;
      top = lerpRGB(SKY_TOP_DAY, SKY_TOP_DUSK, k);
      bot = lerpRGB(SKY_BOT_DAY, SKY_BOT_DUSK, k);
      nightFactor = lerp(0, 0.48, k);
    } else if (tVal < 0.54) {
      const k = (tVal - 0.49) / 0.05;
      top = lerpRGB(SKY_TOP_DUSK, SKY_TOP_NIGHT, k);
      bot = lerpRGB(SKY_BOT_DUSK, isBloodMoon ? SKY_BOT_BLOOD : SKY_BOT_NIGHT, k);
      nightFactor = lerp(0.48, 1, k);
    } else if (tVal < 0.95) {
      top = SKY_TOP_NIGHT;
      bot = isBloodMoon ? SKY_BOT_BLOOD : SKY_BOT_NIGHT;
      nightFactor = 1;
    } else {
      const k = (tVal - 0.95) / 0.05;
      top = lerpRGB(SKY_TOP_NIGHT, SKY_TOP_DAWN, k);
      bot = lerpRGB(isBloodMoon ? SKY_BOT_BLOOD : SKY_BOT_NIGHT, SKY_BOT_DAWN, k);
      nightFactor = lerp(1, 0.35, k);
    }

    return { top, bot, nightFactor };
  }

  public render(ctx: CanvasRenderingContext2D, w: WorldState): void {
    ctx.imageSmoothingEnabled = false;
    this.syncViewport(ctx);
    this.hitRegions = [];

    if (w.mode === 'slot_select') {
      this.drawSlotSelectScreen(ctx, w);
      return;
    }
    if (w.mode === 'char_select') {
      this.drawCharSelectScreen(ctx, w);
      return;
    }
    if (w.mode === 'crest_select') {
      this.drawCrestSelectScreen(ctx, w);
      return;
    }
    if (w.mode === 'world_map') {
      this.drawWorldMapScreen(ctx, w);
      return;
    }

    const monarch = w.monarchs[0];
    const shakeX = w.screenShake > 0 ? Math.round((Math.random() - 0.5) * 4) : 0;
    const shakeY = w.screenShake > 0 ? Math.round((Math.random() - 0.5) * 3) : 0;
    const fallbackCam = Math.max(0, Math.round(1400 - this.viewW / 2));
    const camX = Math.round((monarch ? monarch.cameraX : fallbackCam) + shakeX);

    const { top, bot, nightFactor } = this.getSkyColors(w.timeOfDay, w.isBloodMoon);

    ctx.save();
    ctx.translate(0, shakeY);

    // 1. Full-height dynamic Sky
    const grad = ctx.createLinearGradient(0, 0, 0, this.waterScreenY);
    grad.addColorStop(0, rgbStr(top));
    grad.addColorStop(1, rgbStr(bot));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.waterScreenY);

    if (nightFactor > 0.15) this.drawStarsAndAurora(ctx, w, nightFactor);
    this.drawCelestial(ctx, w);
    this.drawClouds(ctx, w, camX, nightFactor);

    // 2. World plane shifted smoothly by worldOffsetY (0 on landscape, >0 on tall portrait)
    ctx.save();
    ctx.translate(0, this.worldOffsetY);

    this.drawParallaxMountains(ctx, camX, nightFactor, w.isBloodMoon);
    this.drawParallaxForest(ctx, camX, nightFactor);
    this.drawGround(ctx, camX, nightFactor);

    this.drawTrees(ctx, w, camX, nightFactor);
    this.drawRocks(ctx, w, camX, nightFactor);
    this.drawCamps(ctx, w, camX);
    this.drawChests(ctx, w, camX);
    this.drawPortals(ctx, w, camX);
    this.drawHall(ctx, w, camX);
    this.drawShops(ctx, w, camX);
    this.drawFarms(ctx, w, camX);
    this.drawBoatAndDock(ctx, w, camX);
    this.drawShrinesAndPuzzle(ctx, w, camX);
    this.drawWalls(ctx, w, camX);
    this.drawWildlife(ctx, w, camX);
    this.drawVillagers(ctx, w, camX);
    this.drawEnemies(ctx, w, camX);
    if (monarch) this.drawMonarch(ctx, w, monarch, camX, 1, Math.round(monarch.x - camX), GROUND_Y);
    this.drawTutorialSpirit(ctx, w, camX);
    this.drawFireTrailsAndLightning(ctx, w, camX);
    this.drawCoins(ctx, w, camX);
    this.drawArrows(ctx, w, camX);
    this.drawWorldParticles(ctx, w, camX);

    ctx.restore();

    if (nightFactor > 0.08) this.drawLighting(ctx, w, camX, nightFactor);

    // 3. Fjord Water Reflection filling 100% of bottom
    this.drawWaterReflection(ctx, w, nightFactor);
    this.drawSnowParticles(ctx, w);

    // 4. Floating Coin Placeholder & Flying Coins
    if (w.mode === 'playing' && w.activePrompt) {
      this.drawFloatingPrompt(ctx, w, camX);
    }
    this.drawFlyingCoins(ctx, w, camX);

    ctx.restore();

    // 5. Screen Overlays & HUD
    if (w.mode === 'login') {
      this.drawLoginOverlay(ctx, w);
    } else {
      this.drawHud(ctx, w);
      if (w.mode === 'playing' && w.tutorial?.active) {
        this.drawTutorialDialogue(ctx, w);
      } else if (w.banner) {
        this.drawBanner(ctx, w);
      }
      if (w.mode === 'paused') this.drawPauseOverlay(ctx);
      if (w.mode === 'gameover') this.drawGameOverOverlay(ctx, w);
    }
  }

  // =========================================================================
  // LOGIN SCREEN (Responsive Portrait + Landscape)
  // =========================================================================
  private drawLoginOverlay(ctx: CanvasRenderingContext2D, w: WorldState): void {
    ctx.fillStyle = 'rgba(5, 9, 17, 0.56)';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const cx = Math.round(this.viewW / 2);
    const cy = Math.round(this.viewH * 0.45);
    const saved = getSavedCampaignSummary();

    const titleY = Math.max(66, cy - 42);

    // Golden Crown Emblem
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(cx - 12, titleY - 40, 24, 6);
    ctx.fillRect(cx - 12, titleY - 48, 5, 8);
    ctx.fillRect(cx - 2, titleY - 52, 4, 12);
    ctx.fillRect(cx + 7, titleY - 48, 5, 8);
    ctx.fillStyle = '#fff5bd';
    ctx.fillRect(cx - 10, titleY - 38, 20, 2);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff4d1';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.fillText('CORONA', cx, titleY);

    ctx.fillStyle = '#9ec4e0';
    ctx.font = '8px monospace';
    ctx.fillText(t('subtitle'), cx, titleY + 14);

    const btnW = Math.min(200, this.viewW - 28);
    const btnH = 26;
    const bx = Math.round(cx - btnW / 2);
    const by1 = titleY + 34;

    ctx.fillStyle = 'rgba(20, 32, 48, 0.92)';
    ctx.fillRect(bx, by1, btnW, btnH);
    ctx.strokeStyle = '#efc462';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by1 + 0.5, btnW - 1, btnH - 1);
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(t('new_campaign'), cx, by1 + 16);
    this.addHit('login_new', bx, by1, btnW, btnH);

    const by2 = by1 + 34;
    const savedCount = countSavedCampaigns();
    ctx.fillStyle = saved ? 'rgba(16, 28, 42, 0.92)' : 'rgba(14, 20, 30, 0.85)';
    ctx.fillRect(bx, by2, btnW, 34);
    ctx.strokeStyle = saved ? 'rgba(140, 210, 255, 0.78)' : 'rgba(140, 175, 210, 0.42)';
    ctx.strokeRect(bx + 0.5, by2 + 0.5, btnW - 1, 33);

    if (saved) {
      drawShieldEmblem(ctx, saved.crest, bx + 20, by2 + 17, 9);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#d9eeff';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(`${t('slots_btn')} (${savedCount}/${MAX_SAVE_SLOTS})`, bx + 36, by2 + 14);
      ctx.fillStyle = '#95b2cc';
      ctx.font = '7px monospace';
      ctx.fillText(
        `Slot ${saved.slot + 1} · ${t('day_short')} ${saved.day} · ${saved.gold}g`,
        bx + 36,
        by2 + 25
      );
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#c4d8eb';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(`${t('slots_btn')} (0/${MAX_SAVE_SLOTS})`, cx, by2 + 15);
      ctx.fillStyle = '#7e93a8';
      ctx.font = '7px monospace';
      ctx.fillText(t('no_save'), cx, by2 + 26);
    }
    this.addHit('login_slots', bx, by2, btnW, 34);

    ctx.textAlign = 'center';
    const pulse = 0.6 + 0.4 * Math.sin(w.elapsed * 3);
    ctx.fillStyle = `rgba(205, 224, 242, ${pulse.toFixed(2)})`;
    ctx.font = '7px monospace';
    ctx.fillText(t('login_hint'), cx, by2 + 52);

    // Subtle creator & inspiration credit in small letters at the bottom footer
    ctx.fillStyle = 'rgba(186, 208, 228, 0.72)';
    ctx.font = '5.5px monospace';
    if (this.viewW < 390) {
      ctx.fillText('Jogo criado e desenvolvido por Guillermes Mozzer,', cx, this.viewH - 14);
      ctx.fillText('inspirado por Kingdom Two Crowns, franquia da Raw Fury', cx, this.viewH - 6);
    } else {
      ctx.fillText(
        'Jogo criado e desenvolvido por Guillermes Mozzer, inspirado por Kingdom Two Crowns, franquia da Raw Fury',
        cx,
        this.viewH - 8
      );
    }
    ctx.textAlign = 'left';
  }

  // =========================================================================
  // 8-SLOT CAMPAIGN SAVE MANAGER SCREEN (Responsive Portrait 2x4 / Landscape 4x2)
  // =========================================================================
  private drawSlotSelectScreen(ctx: CanvasRenderingContext2D, _w: WorldState): void {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, this.viewH);
    bgGrad.addColorStop(0, '#060c16');
    bgGrad.addColorStop(1, '#091424');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const isPortrait = this.viewW < 380;
    const cx = Math.round(this.viewW / 2);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe58a';
    ctx.font = isPortrait ? 'bold 9.5px Georgia, serif' : 'bold 12px Georgia, serif';
    ctx.fillText(t('slots_title'), cx, 22);

    ctx.fillStyle = '#8eb3d1';
    ctx.font = '6.5px monospace';
    ctx.fillText(t('slots_hint'), cx, 34);

    const slots = listCampaignSlots();
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

    const cols = isPortrait ? 2 : 4;
    const rows = isPortrait ? 4 : 2;
    const padX = isPortrait ? 10 : 14;
    const topY = 44;
    const bottomReserve = 34;
    const gap = isPortrait ? 6 : 8;
    const cardW = Math.floor((this.viewW - padX * 2 - gap * (cols - 1)) / cols);
    const cardH = Math.min(isPortrait ? 86 : 84, Math.floor((this.viewH - topY - bottomReserve - gap * (rows - 1)) / rows));

    for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padX + col * (cardW + gap);
      const y = topY + row * (cardH + gap);
      const info = slots[i];

      ctx.fillStyle = info ? 'rgba(15, 26, 41, 0.94)' : 'rgba(10, 16, 25, 0.72)';
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = info ? 'rgba(239, 196, 98, 0.65)' : 'rgba(130, 160, 190, 0.28)';
      ctx.strokeRect(x + 0.5, y + 0.5, cardW - 1, cardH - 1);

      ctx.textAlign = 'left';
      ctx.fillStyle = info ? '#ffe58a' : '#7b92a8';
      ctx.font = 'bold 7px monospace';
      ctx.fillText(`SLOT ${i + 1}`, x + 6, y + 12);

      if (info) {
        // Click main card to load & play this campaign!
        this.addHit(`slot_load_${i}`, x, y, cardW, cardH);

        // Shield emblem + Island + Day + Gold/Diamonds
        drawShieldEmblem(ctx, info.crest, x + 16, y + 32, 8);

        ctx.fillStyle = '#eef5fc';
        ctx.font = 'bold 7px monospace';
        const islRoman = romans[(info.island - 1) % 7] ?? 'I';
        ctx.fillText(`ILHA ${islRoman} · ${t('day_short')} ${info.day}`, x + 28, y + 28);

        ctx.fillStyle = '#f7d265';
        ctx.font = '6.5px monospace';
        const diamTxt = info.diamonds > 0 ? `  ◆${info.diamonds}` : '';
        ctx.fillText(`${info.gold}g${diamTxt}`, x + 28, y + 39);

        ctx.fillStyle = '#92b0c9';
        ctx.font = '6px monospace';
        ctx.fillText(`${info.villagers} ${t('subjects')}`, x + 6, y + cardH - 18);

        // Play pill
        ctx.fillStyle = 'rgba(46, 36, 12, 0.92)';
        ctx.fillRect(x + 5, y + cardH - 14, cardW - 10, 10);
        ctx.fillStyle = '#ffe58a';
        ctx.font = 'bold 6.5px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`▶ ${t('slot_play')}`, x + cardW / 2, y + cardH - 7);
        ctx.textAlign = 'left';

        // Delete button (2-step confirm to avoid accidental deletion!)
        const confirming = this.pendingDeleteSlot === i;
        const delW = confirming ? 24 : 13;
        const delX = x + cardW - delW - 4;
        const delY = y + 3;
        ctx.fillStyle = confirming ? '#8a1f2d' : 'rgba(60, 24, 32, 0.85)';
        ctx.fillRect(delX, delY, delW, 11);
        ctx.strokeStyle = confirming ? '#ff6b78' : 'rgba(255, 107, 120, 0.5)';
        ctx.strokeRect(delX + 0.5, delY + 0.5, delW - 1, 10);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd6db';
        ctx.font = 'bold 6.5px monospace';
        ctx.fillText(confirming ? 'OK?' : '×', delX + delW / 2, delY + 8);
        ctx.textAlign = 'left';
        this.addHit(`slot_del_${i}`, delX - 3, delY - 3, delW + 6, 17);
      } else {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#6f859b';
        ctx.font = '7px monospace';
        ctx.fillText(t('slot_empty'), x + cardW / 2, y + Math.round(cardH * 0.48));
        ctx.fillStyle = '#9cc5e6';
        ctx.font = 'bold 6.5px monospace';
        ctx.fillText(t('slot_new'), x + cardW / 2, y + Math.round(cardH * 0.72));
        ctx.textAlign = 'left';
        this.addHit(`slot_new_${i}`, x, y, cardW, cardH);
      }
    }

    // Back button
    const backW = 104;
    const backH = 20;
    const backX = Math.round(cx - backW / 2);
    const backY = this.viewH - 26;
    ctx.fillStyle = '#162030';
    ctx.fillRect(backX, backY, backW, backH);
    ctx.strokeStyle = 'rgba(239, 196, 98, 0.55)';
    ctx.strokeRect(backX + 0.5, backY + 0.5, backW - 1, backH - 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 7.5px monospace';
    ctx.fillText(t('slot_back'), cx, backY + 13);
    this.addHit('slot_back', backX - 4, backY - 4, backW + 8, backH + 8);
    ctx.textAlign = 'left';
  }

  // =========================================================================
  // CHARACTER SELECT SCREEN (Black Background, 20s Timer, Portrait + Landscape)
  // =========================================================================
  private drawCharSelectScreen(ctx: CanvasRenderingContext2D, w: WorldState): void {
    ctx.fillStyle = '#040507';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const isPortrait = this.viewW < 380;
    const rightSafe = 40; // Reserve space for top-right Menu button
    const padX = isPortrait ? 12 : 18;

    ctx.fillStyle = '#fff2c9';
    ctx.font = isPortrait ? 'bold 10px Georgia, serif' : 'bold 12px Georgia, serif';
    ctx.fillText(t('choose_monarch'), padX, 22);
    ctx.fillStyle = '#8b99a8';
    ctx.font = '7px monospace';
    ctx.fillText(t('starter_note'), padX, 34);

    const secs = Math.ceil(w.selectTimer);
    const urgent = secs <= 5;
    ctx.textAlign = 'right';
    ctx.fillStyle = urgent ? '#ff646c' : '#efc462';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${secs}s`, this.viewW - rightSafe, 24);
    ctx.textAlign = 'left';

    const barW = this.viewW - padX * 2;
    ctx.fillStyle = '#181e28';
    ctx.fillRect(padX, 41, barW, 3);
    ctx.fillStyle = urgent ? '#ff646c' : '#efc462';
    ctx.fillRect(padX, 41, Math.round((barW * w.selectTimer) / 20), 3);

    const previewX = isPortrait ? Math.round(this.viewW / 2) : Math.round(this.viewW * 0.28);
    const previewY = isPortrait ? 148 : Math.round(this.viewH * 0.7);
    const previewScale = isPortrait ? 2.6 : 3;

    const spot = ctx.createRadialGradient(previewX, previewY - 24, 6, previewX, previewY - 24, 68);
    spot.addColorStop(0, 'rgba(239, 196, 98, 0.14)');
    spot.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = spot;
    ctx.fillRect(previewX - 72, previewY - 94, 144, 110);

    ctx.fillStyle = '#161b24';
    ctx.fillRect(previewX - 58, previewY + 1, 116, 5);
    ctx.fillStyle = '#2b3442';
    ctx.fillRect(previewX - 48, previewY, 96, 2);

    const previewMonarch: Monarch = {
      ...w.monarchs[0],
      facing: 1,
      vx: 14,
      sprinting: false,
      hasCrown: true,
    };
    this.drawMonarch(ctx, w, previewMonarch, 0, previewScale, previewX, previewY);

    const rows = [
      { key: 'outfit', label: t('outfit'), val: OUTFIT_PRESETS[w.appearance.outfitIndex].name },
      { key: 'hair', label: t('hair'), val: HAIR_PRESETS[w.appearance.hairIndex].name },
      { key: 'horse', label: t('horse'), val: HORSE_PRESETS[w.appearance.horseIndex].name },
      { key: 'crown', label: t('crown'), val: CROWN_PRESETS[w.appearance.crownIndex].name },
    ];

    const px = isPortrait ? padX : Math.round(this.viewW * 0.5);
    const pw = isPortrait ? this.viewW - padX * 2 : Math.min(232, this.viewW - px - padX);
    const startY = isPortrait ? 168 : 62;
    const rowStep = isPortrait ? 33 : 34;

    rows.forEach((row, idx) => {
      const ry = startY + idx * rowStep;
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

      ctx.fillStyle = '#1d2533';
      ctx.fillRect(px + 4, ry + 5, 18, 18);
      ctx.fillStyle = '#efc462';
      ctx.textAlign = 'center';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('◀', px + 13, ry + 17);
      this.addHit(`char_prev_${row.key}`, px + 2, ry + 2, 24, 24);

      ctx.fillStyle = '#1d2533';
      ctx.fillRect(px + pw - 22, ry + 5, 18, 18);
      ctx.fillStyle = '#efc462';
      ctx.fillText('▶', px + pw - 13, ry + 17);
      this.addHit(`char_next_${row.key}`, px + pw - 24, ry + 2, 24, 24);
      ctx.textAlign = 'left';
    });

    const btnY = startY + rows.length * rowStep + 6;
    const randW = Math.round(pw * 0.4);
    const confW = pw - randW - 6;

    ctx.fillStyle = '#161d29';
    ctx.fillRect(px, btnY, randW, 24);
    ctx.strokeStyle = '#3b485c';
    ctx.strokeRect(px + 0.5, btnY + 0.5, randW - 1, 23);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cbd8e6';
    ctx.font = 'bold 8px monospace';
    ctx.fillText(t('random'), px + randW / 2, btnY + 15);
    this.addHit('char_random', px, btnY, randW, 24);

    ctx.fillStyle = '#2b2412';
    ctx.fillRect(px + randW + 6, btnY, confW, 24);
    ctx.strokeStyle = '#efc462';
    ctx.strokeRect(px + randW + 6.5, btnY + 0.5, confW - 1, 23);
    ctx.fillStyle = '#ffe58a';
    ctx.fillText(t('confirm'), px + randW + 6 + confW / 2, btnY + 15);
    this.addHit('char_confirm', px + randW + 6, btnY, confW, 24);

    ctx.fillStyle = '#6f7e91';
    ctx.font = '7px monospace';
    ctx.fillText(t('char_hint'), Math.round(this.viewW / 2), Math.min(this.viewH - 10, btnY + 40));
    ctx.textAlign = 'left';
  }

  // =========================================================================
  // CREST SELECT SCREEN (Black Background, Centered Shield, 30s Timer)
  // =========================================================================
  private drawCrestSelectScreen(ctx: CanvasRenderingContext2D, w: WorldState): void {
    ctx.fillStyle = '#040507';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const cx = Math.round(this.viewW / 2);
    const isPortrait = this.viewW < 390;
    const padX = isPortrait ? 12 : 18;
    const rightSafe = 40;

    ctx.fillStyle = '#fff2c9';
    ctx.font = isPortrait ? 'bold 10px Georgia, serif' : 'bold 12px Georgia, serif';
    ctx.fillText(t('forge_crest'), padX, 22);
    ctx.fillStyle = '#8b99a8';
    ctx.font = '7px monospace';
    ctx.fillText(t('crest_note'), padX, 33);

    const secs = Math.ceil(w.selectTimer);
    const urgent = secs <= 6;
    ctx.textAlign = 'right';
    ctx.fillStyle = urgent ? '#ff646c' : '#efc462';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${secs}s`, this.viewW - rightSafe, 24);
    ctx.textAlign = 'left';

    const barW = this.viewW - padX * 2;
    ctx.fillStyle = '#181e28';
    ctx.fillRect(padX, 40, barW, 3);
    ctx.fillStyle = urgent ? '#ff646c' : '#efc462';
    ctx.fillRect(padX, 40, Math.round((barW * w.selectTimer) / 30), 3);

    const shieldY = isPortrait ? 104 : Math.round(this.viewH * 0.45);
    const shieldR = isPortrait ? 36 : 42;

    const halo = ctx.createRadialGradient(cx, shieldY, 10, cx, shieldY, shieldR + 20);
    halo.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - shieldR - 20, shieldY - shieldR - 20, (shieldR + 20) * 2, (shieldR + 20) * 2);

    // CENTERED NORDIC SHIELD
    drawShieldEmblem(ctx, w.crest, cx, shieldY, shieldR);

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
      ctx.fillRect(x, y, width, 32);
      ctx.strokeStyle = focused ? '#efc462' : '#252d3a';
      ctx.strokeRect(x + 0.5, y + 0.5, width - 1, 31);

      ctx.fillStyle = '#7e8fa3';
      ctx.font = '6px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(title, x + width / 2, y + 9);
      ctx.fillStyle = '#eef4fa';
      ctx.font = 'bold 7px monospace';
      ctx.fillText(value, x + width / 2, y + 23);

      ctx.fillStyle = '#1c2432';
      ctx.fillRect(x + 3, y + 12, 16, 16);
      ctx.fillRect(x + width - 19, y + 12, 16, 16);
      ctx.fillStyle = '#efc462';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('◀', x + 11, y + 23);
      ctx.fillText('▶', x + width - 11, y + 23);
      ctx.textAlign = 'left';

      this.addHit(prevId, x, y + 8, 22, 24);
      this.addHit(nextId, x + width - 22, y + 8, 22, 24);
    };

    const drawColorPalette = (
      x: number,
      y: number,
      width: number,
      title: string,
      colors: Array<{ name: string; hex: string }>,
      activeHex: string,
      prefix: string,
      focused: boolean
    ) => {
      ctx.fillStyle = focused ? '#141a24' : '#0b0e14';
      ctx.fillRect(x, y, width, 40);
      ctx.strokeStyle = focused ? '#efc462' : '#252d3a';
      ctx.strokeRect(x + 0.5, y + 0.5, width - 1, 39);

      ctx.fillStyle = '#7e8fa3';
      ctx.font = '6px monospace';
      ctx.fillText(title, x + 7, y + 10);

      const avail = width - 14;
      const step = avail / 8;
      const sw = Math.max(10, Math.floor(step - 3));
      colors.forEach((c, i) => {
        const sx = Math.round(x + 7 + i * step);
        const sy = y + 15;
        const isSel = c.hex === activeHex;
        ctx.fillStyle = c.hex;
        ctx.fillRect(sx, sy, sw, 18);
        ctx.strokeStyle = isSel ? '#ffffff' : 'rgba(255,255,255,0.22)';
        ctx.lineWidth = isSel ? 1.5 : 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, 17);
        this.addHit(`${prefix}_${i}`, sx - 1, sy - 2, sw + 2, 22);
      });
      ctx.lineWidth = 1;
    };

    let confirmY: number;
    if (isPortrait) {
      const boxW = this.viewW - padX * 2;
      const topY = shieldY + shieldR + 14;
      drawSelectorBox(padX, topY, boxW, t('shield_shape'), shapeName, 'crest_prev_shape', 'crest_next_shape', this.crestSelectFocusRow === 0);
      drawSelectorBox(padX, topY + 37, boxW, t('nordic_pattern'), patternName, 'crest_prev_pattern', 'crest_next_pattern', this.crestSelectFocusRow === 1);
      drawColorPalette(padX, topY + 75, boxW, t('color_bg'), CREST_BG_COLORS, w.crest.primaryColor, 'crest_bg', this.crestSelectFocusRow === 2);
      drawColorPalette(padX, topY + 120, boxW, t('color_fg'), CREST_FG_COLORS, w.crest.secondaryColor, 'crest_fg', this.crestSelectFocusRow === 3);
      confirmY = topY + 168;
    } else {
      const sideW = Math.min(156, Math.max(126, Math.round(this.viewW * 0.31)));
      const rightX = this.viewW - padX - sideW;
      const rowY = Math.round(this.viewH * 0.27);
      drawSelectorBox(padX, rowY, sideW, t('shield_shape'), shapeName, 'crest_prev_shape', 'crest_next_shape', this.crestSelectFocusRow === 0);
      drawSelectorBox(padX, rowY + 44, sideW, t('nordic_pattern'), patternName, 'crest_prev_pattern', 'crest_next_pattern', this.crestSelectFocusRow === 1);
      drawColorPalette(rightX, rowY, sideW, t('color_bg'), CREST_BG_COLORS, w.crest.primaryColor, 'crest_bg', this.crestSelectFocusRow === 2);
      drawColorPalette(rightX, rowY + 46, sideW, t('color_fg'), CREST_FG_COLORS, w.crest.secondaryColor, 'crest_fg', this.crestSelectFocusRow === 3);

      // Flag preview under centered shield
      const flagY = shieldY + shieldR + 18;
      ctx.fillStyle = '#6f7e91';
      ctx.font = '6px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t('flag_preview'), cx, flagY);
      ctx.fillStyle = '#7a6855';
      ctx.fillRect(cx - 18, flagY + 5, 2, 20);
      ctx.fillStyle = w.crest.primaryColor;
      ctx.fillRect(cx - 16, flagY + 6, 30, 12);
      ctx.fillStyle = w.crest.secondaryColor;
      ctx.fillRect(cx - 16, flagY + 10, 30, 3);
      ctx.fillRect(cx - 5, flagY + 6, 3, 12);

      confirmY = Math.min(this.viewH - 42, flagY + 34);
    }

    const cbW = Math.min(200, this.viewW - padX * 2);
    const cbX = Math.round(cx - cbW / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2b2412';
    ctx.fillRect(cbX, confirmY, cbW, 24);
    ctx.strokeStyle = '#efc462';
    ctx.strokeRect(cbX + 0.5, confirmY + 0.5, cbW - 1, 23);
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 8px monospace';
    ctx.fillText(t('seal_crest'), cx, confirmY + 15);
    this.addHit('crest_confirm', cbX, confirmY, cbW, 24);

    ctx.fillStyle = '#6f7e91';
    ctx.font = '7px monospace';
    ctx.fillText(t('crest_hint'), cx, Math.min(this.viewH - 8, confirmY + 36));
    ctx.textAlign = 'left';
  }

  // =========================================================================
  // SKY, PARALLAX & WORLD LAYERS (Responsive width/height)
  // =========================================================================
  private drawStarsAndAurora(ctx: CanvasRenderingContext2D, w: WorldState, nightFactor: number): void {
    for (const s of this.stars) {
      const twinkle = 0.45 + 0.55 * Math.sin(w.elapsed * 2.4 + s.phase);
      ctx.fillStyle = `rgba(225, 240, 255, ${(nightFactor * twinkle * 0.85).toFixed(2)})`;
      ctx.fillRect(Math.round(s.rx * this.viewW), Math.round(s.ry * this.waterScreenY), s.size, s.size);
    }

    const auroraAlpha = Math.max(0, (nightFactor - 0.35) / 0.65) * (w.isBloodMoon ? 0.35 : 0.68);
    if (auroraAlpha <= 0.02) return;

    const auroraBaseY = Math.round(this.waterScreenY * 0.24);
    for (let x = 0; x < this.viewW; x += 3) {
      const wave1 = Math.sin(x * 0.018 + w.elapsed * 0.45) * 14;
      const wave2 = Math.cos(x * 0.032 - w.elapsed * 0.32) * 8;
      const baseY = auroraBaseY + wave1 + wave2;
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
    const tVal = w.timeOfDay;
    const skyH = this.groundScreenY;
    if (tVal < 0.5) {
      const p = tVal / 0.5;
      const x = Math.round(32 + p * (this.viewW - 64));
      const y = Math.round(skyH * 0.62 - Math.sin(p * Math.PI) * (skyH * 0.44));
      ctx.fillStyle = 'rgba(255, 224, 150, 0.18)';
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff0b8';
      ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.fillStyle = '#fffbe3';
      ctx.fillRect(x - 4, y - 4, 8, 8);
    } else {
      const p = (tVal - 0.5) / 0.5;
      const x = Math.round(40 + p * (this.viewW - 80));
      const y = Math.round(skyH * 0.56 - Math.sin(p * Math.PI) * (skyH * 0.36));
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
    const wrapW = this.viewW + 120;
    for (let i = 0; i < 7; i++) {
      const worldOffset = (i * 110 + w.elapsed * (3 + (i % 3)) - camX * 0.08) % wrapW;
      const cx = Math.round(((worldOffset + wrapW) % wrapW) - 60);
      const cy = Math.round(this.groundScreenY * 0.18) + (i % 3) * 20;
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
    for (let i = -1; i < Math.ceil(this.viewW / span) + 2; i++) {
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
    for (let i = -1; i < Math.ceil(this.viewW / midSpan) + 2; i++) {
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
    for (let i = -1; i < Math.ceil(this.viewW / step) + 2; i++) {
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
    ctx.fillRect(0, GROUND_Y - 26, this.viewW, 26);
  }

  private drawGround(ctx: CanvasRenderingContext2D, camX: number, nightFactor: number): void {
    const grassTop = lerpRGB({ r: 94, g: 118, b: 102 }, { r: 28, g: 42, b: 48 }, nightFactor);
    const snowEdge = lerpRGB({ r: 204, g: 222, b: 234 }, { r: 70, g: 94, b: 112 }, nightFactor);
    const soil = lerpRGB({ r: 54, g: 45, b: 42 }, { r: 19, g: 19, b: 26 }, nightFactor);
    const stoneBank = lerpRGB({ r: 74, g: 82, b: 92 }, { r: 24, g: 32, b: 42 }, nightFactor);

    ctx.fillStyle = rgbStr(grassTop);
    ctx.fillRect(0, GROUND_Y - 2, this.viewW, 3);
    ctx.fillStyle = rgbStr(soil);
    ctx.fillRect(0, GROUND_Y + 1, this.viewW, 4);
    ctx.fillStyle = rgbStr(stoneBank);
    ctx.fillRect(0, GROUND_Y + 4, this.viewW, 2);

    const startTile = Math.floor(camX / 24);
    for (let tile = startTile; tile <= startTile + Math.ceil(this.viewW / 24) + 1; tile++) {
      const sx = tile * 24 - camX;
      if ((tile * 7) % 3 === 0) {
        ctx.fillStyle = rgbStr(snowEdge);
        ctx.fillRect(sx + 2, GROUND_Y - 2, 10, 2);
      }
      if ((tile * 11) % 4 === 0) {
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

    for (const tr of w.trees) {
      if (tr.chopped) continue;
      const sx = Math.round(tr.x - camX);
      if (sx < -32 || sx > this.viewW + 32) continue;

      const shake = tr.hitShake > 0 ? Math.round(Math.sin(w.elapsed * 60) * 2) : 0;
      const sway = Math.round(Math.sin(w.elapsed * 1.1 + tr.swayOffset) * 1);
      const bx = sx + shake;

      ctx.fillStyle = '#3d2c24';
      ctx.fillRect(bx - 2, GROUND_Y - 14, 4, 14);

      const tiers = 3 + (tr.variant === 2 ? 1 : 0);
      for (let tier = 0; tier < tiers; tier++) {
        const ty = GROUND_Y - 12 - tier * Math.floor((tr.height - 14) / tiers);
        const halfW = 13 - tier * 2.5 + (tr.variant === 1 ? 2 : 0);
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

      if (tr.marked) {
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
      if (sx < -24 || sx > this.viewW + 24) continue;

      const shake = r.hitShake > 0 ? Math.round(Math.sin(w.elapsed * 60) * 2) : 0;
      const bx = sx + shake;
      const rw = r.variant === 0 ? 18 : r.variant === 1 ? 22 : 16;
      const rh = r.variant === 0 ? 13 : r.variant === 1 ? 15 : 11;

      ctx.fillStyle = rgbStr(stoneDark);
      ctx.fillRect(bx - Math.floor(rw / 2), GROUND_Y - rh + 3, rw, rh - 3);
      ctx.fillStyle = rgbStr(stoneMid);
      ctx.fillRect(bx - Math.floor(rw / 2) + 2, GROUND_Y - rh, rw - 5, rh - 2);
      ctx.fillStyle = rgbStr(snow);
      ctx.fillRect(bx - Math.floor(rw / 2) + 3, GROUND_Y - rh, rw - 7, 2);
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
      if (sx < -40 || sx > this.viewW + 40) continue;

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
      if (sx < -24 || sx > this.viewW + 24) continue;

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
      if (sx < -48 || sx > this.viewW + 48) continue;
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
    if (sx < -80 || sx > this.viewW + 80) return;

    const lvl = w.hall.level;
    const primary = w.crest.primaryColor;
    const secondary = w.crest.secondaryColor;

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

      ctx.fillStyle = secondary;
      ctx.fillRect(sx - hallW / 2 - 4, GROUND_Y - hallH + 3, hallW + 8, 2);

      ctx.fillStyle = '#d4e6f2';
      ctx.fillRect(sx - 6, GROUND_Y - hallH - (lvl === 3 ? 22 : 16), 12, 3);

      ctx.fillStyle = primary;
      ctx.fillRect(sx - 18, GROUND_Y - hallH + 6, 8, 15);
      ctx.fillRect(sx + 10, GROUND_Y - hallH + 6, 8, 15);
      ctx.fillStyle = secondary;
      ctx.fillRect(sx - 15, GROUND_Y - hallH + 6, 2, 13);
      ctx.fillRect(sx + 13, GROUND_Y - hallH + 6, 2, 13);

      drawShieldEmblem(ctx, w.crest, sx, GROUND_Y - hallH - 2, 7);

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
      if (sx < -32 || sx > this.viewW + 32) continue;

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
      if (sx < -42 || sx > this.viewW + 42) continue;

      if (farm.level === 0) {
        ctx.fillStyle = '#473628';
        ctx.fillRect(sx - 18, GROUND_Y - 2, 36, 3);
        ctx.fillStyle = '#6da658';
        ctx.fillRect(sx - 8, GROUND_Y - 5, 2, 3);
        ctx.fillRect(sx + 6, GROUND_Y - 5, 2, 3);
      } else {
        const span = farm.level === 3 ? 28 : farm.level === 2 ? 24 : 20;
        ctx.fillStyle = '#4a3524';
        ctx.fillRect(sx - span, GROUND_Y - 3, span * 2, 3);
        ctx.fillStyle = '#6b4c32';
        ctx.fillRect(sx - span, GROUND_Y - 10, 2, 10);
        ctx.fillRect(sx + span - 2, GROUND_Y - 10, 2, 10);
        ctx.fillRect(sx - span, GROUND_Y - 7, span * 2, 2);

        const stalkH = Math.max(2, Math.round(3 + farm.cropProgress * 9));
        for (let bx = -span + 4; bx <= span - 6; bx += 4) {
          ctx.fillStyle = farm.cropProgress > 0.7 ? '#e6c050' : '#73b359';
          ctx.fillRect(sx + bx, GROUND_Y - 3 - stalkH, 2, stalkH);
        }

        if (farm.level >= 2) {
          ctx.fillStyle = '#5c412c';
          ctx.fillRect(sx - 8, GROUND_Y - 18, 16, 15);
          ctx.fillStyle = w.crest.primaryColor;
          ctx.fillRect(sx - 10, GROUND_Y - 21, 20, 4);
        }
        if (farm.level >= 3) {
          ctx.fillStyle = w.crest.secondaryColor;
          ctx.fillRect(sx - 10, GROUND_Y - 22, 20, 1);
          ctx.fillStyle = '#ffae42';
          ctx.fillRect(sx - 2, GROUND_Y - 12, 4, 5);
        }

        // Farmer capacity badge (0/5 .. 5/5)
        const count = w.villagers.filter(
          (v) => v.role === 'producer' && v.assignedFarmId === farm.id && v.state !== 'embarked'
        ).length;
        ctx.fillStyle = 'rgba(8, 14, 24, 0.72)';
        ctx.fillRect(sx - 11, GROUND_Y - 28, 22, 7);
        ctx.fillStyle = count >= MAX_FARMERS_PER_FARM ? '#ffe066' : '#a7e89b';
        ctx.font = '6px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${count}/${MAX_FARMERS_PER_FARM}`, sx, GROUND_Y - 22);
        ctx.textAlign = 'left';
      }

      if (farm.underConstruction) {
        ctx.fillStyle = 'rgba(10,14,20,0.8)';
        ctx.fillRect(sx - 12, GROUND_Y - 34, 24, 4);
        ctx.fillStyle = '#82e08a';
        ctx.fillRect(sx - 11, GROUND_Y - 33, Math.round(22 * farm.buildProgress), 2);
      }
    }
  }

  private drawBoatAndDock(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    // 1. Harbor Dock (Required on Islands 2..7 before sailing freely!)
    if (w.dock.required) {
      const dx = Math.round(w.dock.x - camX);
      if (dx > -48 && dx < this.viewW + 48) {
        if (!w.dock.built) {
          // Unbuilt dock pilings on the shore
          ctx.fillStyle = '#523b2a';
          ctx.fillRect(dx - 16, GROUND_Y - 8, 3, 12);
          ctx.fillRect(dx, GROUND_Y - 10, 3, 14);
          ctx.fillRect(dx + 14, GROUND_Y - 8, 3, 12);
          if (w.dock.coinsPaid > 0 || w.dock.underConstruction) {
            ctx.fillStyle = 'rgba(10,14,20,0.8)';
            ctx.fillRect(dx - 16, GROUND_Y - 18, 32, 4);
            ctx.fillStyle = '#efc462';
            ctx.fillRect(dx - 15, GROUND_Y - 17, Math.round(30 * w.dock.buildProgress), 2);
          }
        } else {
          // Completed Nordic Harbor Pier with lantern & clan flag!
          ctx.fillStyle = '#5c3f28';
          ctx.fillRect(dx - 20, GROUND_Y - 7, 40, 4);
          ctx.fillStyle = '#3d2818';
          ctx.fillRect(dx - 18, GROUND_Y - 3, 3, 9);
          ctx.fillRect(dx - 2, GROUND_Y - 3, 3, 9);
          ctx.fillRect(dx + 14, GROUND_Y - 3, 3, 9);
          // Pier lantern post
          ctx.fillStyle = '#4a3220';
          ctx.fillRect(dx + 14, GROUND_Y - 24, 2, 17);
          ctx.fillStyle = '#ffbe4f';
          ctx.fillRect(dx + 12, GROUND_Y - 22, 4, 4);
          ctx.fillStyle = w.crest.primaryColor;
          ctx.fillRect(dx - 18, GROUND_Y - 20, 10, 6);
          ctx.fillStyle = w.crest.secondaryColor;
          ctx.fillRect(dx - 18, GROUND_Y - 18, 10, 2);
        }
      }
    }

    // 2. Drakkar Viking Longship
    const bx = Math.round(w.boat.x - camX);
    if (bx > -64 && bx < this.viewW + 64) {
      const prog = w.boat.built ? 1 : w.boat.buildProgress;
      // Hull
      ctx.fillStyle = '#4e331f';
      ctx.fillRect(bx - 22, GROUND_Y - 8, 44, 8);
      if (prog > 0.25) {
        ctx.fillStyle = '#6e492c';
        ctx.fillRect(bx - 26, GROUND_Y - 11, 52, 5);
        // Curved Nordic prows
        ctx.fillRect(bx - 29, GROUND_Y - 17, 4, 8);
        ctx.fillRect(bx + 25, GROUND_Y - 17, 4, 8);
      }
      if (prog > 0.6) {
        // Dragon head prow + Mast
        ctx.fillStyle = '#8c603a';
        ctx.fillRect(bx + 27, GROUND_Y - 22, 5, 6);
        ctx.fillStyle = w.crest.secondaryColor;
        ctx.fillRect(bx + 29, GROUND_Y - 21, 2, 2);
        ctx.fillStyle = '#4a311e';
        ctx.fillRect(bx - 1, GROUND_Y - 38, 3, 28);
      }
      if (w.boat.built) {
        // Striped Clan-Colored Viking Sail!
        ctx.fillStyle = w.crest.primaryColor;
        ctx.fillRect(bx - 14, GROUND_Y - 35, 28, 18);
        ctx.fillStyle = w.crest.secondaryColor;
        for (let sx = -10; sx <= 10; sx += 8) {
          ctx.fillRect(bx + sx, GROUND_Y - 35, 3, 18);
        }
        // Mini shields lining the Drakkar hull
        for (let sx = -16; sx <= 16; sx += 8) {
          ctx.fillStyle = w.crest.primaryColor;
          ctx.fillRect(bx + sx - 2, GROUND_Y - 11, 5, 5);
          ctx.fillStyle = w.crest.secondaryColor;
          ctx.fillRect(bx + sx - 1, GROUND_Y - 10, 3, 3);
        }

        // Embarked Crew summary badge above boat when anyone boarded
        const totalCrew =
          w.boat.crewArchers + w.boat.crewWarriors + w.boat.crewProducers + w.boat.crewBuilders;
        if (totalCrew > 0) {
          ctx.fillStyle = 'rgba(8, 14, 24, 0.8)';
          ctx.fillRect(bx - 28, GROUND_Y - 47, 56, 9);
          ctx.fillStyle = '#ffe58a';
          ctx.font = '6px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(
            `A${w.boat.crewArchers} E${w.boat.crewWarriors} F${w.boat.crewProducers} C${w.boat.crewBuilders}`,
            bx,
            GROUND_Y - 40
          );
          ctx.textAlign = 'left';
        }
      } else if (w.boat.coinsPaid > 0 || w.boat.underConstruction) {
        ctx.fillStyle = 'rgba(10,14,20,0.82)';
        ctx.fillRect(bx - 18, GROUND_Y - 22, 36, 4);
        ctx.fillStyle = '#efc462';
        ctx.fillRect(bx - 17, GROUND_Y - 21, Math.round(34 * prog), 2);
      }
    }

    // 3. Ship Crew Bell (Sino — 1 coin to call up to 4 of each class!)
    if (w.boat.built && w.dock.built) {
      const bellX = Math.round(w.boat.bellX - camX);
      if (bellX > -24 && bellX < this.viewW + 24) {
        ctx.fillStyle = '#4f3523';
        ctx.fillRect(bellX - 1, GROUND_Y - 20, 2, 20);
        ctx.fillRect(bellX - 5, GROUND_Y - 20, 10, 2);
        const swing = w.boat.bellRung ? Math.round(Math.sin(w.elapsed * 8) * 1) : 0;
        ctx.fillStyle = '#f2c74e';
        ctx.fillRect(bellX - 2 + swing, GROUND_Y - 18, 5, 5);
        ctx.fillStyle = '#fff3b0';
        ctx.fillRect(bellX - 1 + swing, GROUND_Y - 17, 2, 2);
      }
    }
  }

  private drawShrinesAndPuzzle(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    // 1. Nordic God Shrine (Thor, Freya, Odin, Loki — 1 per island!)
    if (w.godShrine) {
      const sx = Math.round(w.godShrine.x - camX);
      if (sx > -48 && sx < this.viewW + 48) {
        const def = GOD_DEFS[w.godShrine.godId];
        const isActive = w.activeGod === w.godShrine.godId;
        const pulse = 0.65 + 0.35 * Math.sin(w.elapsed * 3.5);

        // Sacred aura when blessed or unlocked
        if (w.godShrine.unlocked) {
          ctx.fillStyle = isActive
            ? `rgba(255, 224, 110, ${(0.22 * pulse).toFixed(2)})`
            : `rgba(126, 245, 255, ${(0.14 * pulse).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(sx, GROUND_Y - 22, isActive ? 24 : 18, 0, Math.PI * 2);
          ctx.fill();
        }

        // Carved Nordic stone dais + standing monolith
        ctx.fillStyle = '#475261';
        ctx.fillRect(sx - 15, GROUND_Y - 5, 30, 5);
        ctx.fillStyle = '#5c697a';
        ctx.fillRect(sx - 11, GROUND_Y - 9, 22, 4);
        ctx.fillStyle = '#38424f';
        ctx.fillRect(sx - 8, GROUND_Y - 36, 16, 27);
        ctx.fillStyle = '#68778a';
        ctx.fillRect(sx - 6, GROUND_Y - 40, 12, 5);

        // Glowing God Rune Emblem
        ctx.fillStyle = w.godShrine.unlocked ? def.color : '#8da3b8';
        ctx.fillRect(sx - 3, GROUND_Y - 30, 6, 12);
        ctx.fillStyle = isActive ? '#ffffff' : '#182230';
        ctx.fillRect(sx - 1, GROUND_Y - 27, 2, 6);

        // God name plate
        ctx.fillStyle = 'rgba(8, 14, 24, 0.78)';
        ctx.fillRect(sx - 18, GROUND_Y - 50, 36, 8);
        ctx.fillStyle = def.color;
        ctx.font = 'bold 6px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(def.name.toUpperCase(), sx, GROUND_Y - 44);
        ctx.textAlign = 'left';
      }
    }

    // 2. Special Mount Shrine (1 per island 2..7!)
    if (w.mountShrine) {
      const sx = Math.round(w.mountShrine.x - camX);
      if (sx > -48 && sx < this.viewW + 48) {
        const def = MOUNT_DEFS[w.mountShrine.mountId];
        const lang = getLanguage();
        // Nordic wooden archway stable
        ctx.fillStyle = '#4f3622';
        ctx.fillRect(sx - 16, GROUND_Y - 28, 3, 28);
        ctx.fillRect(sx + 13, GROUND_Y - 28, 3, 28);
        ctx.fillStyle = '#3b4a5c';
        ctx.fillRect(sx - 19, GROUND_Y - 32, 38, 5);
        ctx.fillStyle = def.accentColor;
        ctx.fillRect(sx - 18, GROUND_Y - 28, 36, 2);

        // Mount emblem silhouette inside stable
        const bob = Math.round(Math.sin(w.elapsed * 3) * 1);
        ctx.fillStyle = w.mountShrine.unlocked ? def.accentColor : '#6e7f91';
        if (w.mountShrine.mountId === 'harpy') {
          ctx.fillRect(sx - 5, GROUND_Y - 15 + bob, 10, 6);
          ctx.fillRect(sx - 11, GROUND_Y - 18 + bob, 6, 4);
          ctx.fillRect(sx + 5, GROUND_Y - 18 + bob, 6, 4);
        } else if (w.mountShrine.mountId === 'bear') {
          ctx.fillRect(sx - 8, GROUND_Y - 15, 16, 9);
          ctx.fillRect(sx - 7, GROUND_Y - 6, 4, 6);
          ctx.fillRect(sx + 3, GROUND_Y - 6, 4, 6);
        } else {
          ctx.fillRect(sx - 7, GROUND_Y - 13, 14, 6);
          ctx.fillRect(sx - 6, GROUND_Y - 7, 2, 7);
          ctx.fillRect(sx + 4, GROUND_Y - 7, 2, 7);
          ctx.fillRect(sx + 4, GROUND_Y - 18, 4, 6);
        }

        ctx.fillStyle = 'rgba(8, 14, 24, 0.78)';
        ctx.fillRect(sx - 24, GROUND_Y - 42, 48, 8);
        ctx.fillStyle = def.accentColor;
        ctx.font = 'bold 5.5px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(def.name[lang].slice(0, 12).toUpperCase(), sx, GROUND_Y - 36);
        ctx.textAlign = 'left';
      }
    }

    // 3. Island Rune Puzzle (3 Standing Stones -> +2 Diamonds & +4 Gold!)
    if (w.puzzle) {
      const sx = Math.round(w.puzzle.x - camX);
      if (sx > -48 && sx < this.viewW + 48) {
        const offsets = [-13, 0, 13];
        const heights = [20, 26, 20];
        offsets.forEach((ox, idx) => {
          const lit = w.puzzle!.solved || idx < w.puzzle!.coinsPaid;
          const h = heights[idx];
          ctx.fillStyle = '#333e4d';
          ctx.fillRect(sx + ox - 4, GROUND_Y - h, 8, h);
          ctx.fillStyle = '#4e5d70';
          ctx.fillRect(sx + ox - 3, GROUND_Y - h - 2, 6, 3);
          ctx.fillStyle = lit ? '#7ef5ff' : '#1b2633';
          ctx.fillRect(sx + ox - 1, GROUND_Y - h + 4, 2, Math.max(6, h - 10));
        });
        if (w.puzzle.solved) {
          ctx.fillStyle = 'rgba(126, 245, 255, 0.16)';
          ctx.fillRect(sx - 16, GROUND_Y - 46, 32, 46);
        }
      }
    }
  }

  private drawFireTrailsAndLightning(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    // Fire Steed burning ground trails
    for (const f of w.fireTrails) {
      const sx = Math.round(f.x - camX);
      if (sx < -20 || sx > this.viewW + 20) continue;
      const ratio = Math.min(1, f.life / f.maxLife);
      const flick = Math.floor(w.elapsed * 16 + f.x) % 3;
      ctx.fillStyle = 'rgba(255, 92, 24, 0.85)';
      ctx.fillRect(sx - 6, GROUND_Y - Math.round((7 + flick) * ratio), 12, Math.round((7 + flick) * ratio));
      ctx.fillStyle = '#ffbe42';
      ctx.fillRect(sx - 4, GROUND_Y - Math.round((5 + (flick % 2)) * ratio), 8, Math.round((5 + (flick % 2)) * ratio));
      ctx.fillStyle = '#fff5ad';
      ctx.fillRect(sx - 2, GROUND_Y - Math.round(3 * ratio), 4, Math.round(3 * ratio));
    }

    // Sleipnir Lightning Bolts
    for (const bolt of w.lightningBolts) {
      const x1 = Math.round(bolt.fromX - camX);
      const y1 = Math.round(bolt.fromY);
      const x2 = Math.round(bolt.toX - camX);
      const y2 = Math.round(bolt.toY);
      const midX = Math.round((x1 + x2) / 2 + (Math.sin(w.elapsed * 70) > 0 ? 7 : -7));
      const midY = Math.round((y1 + y2) / 2 - 4);

      ctx.save();
      ctx.strokeStyle = '#7ef5ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(midX, midY);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.strokeStyle = '#fff8c4';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(midX, midY);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    // Ice Horse Frost Wave / Bear Roar Shockwave Ring
    const m = w.monarchs[0];
    if (m && m.roarTimer > 0) {
      const sx = Math.round(m.x - camX);
      const prog = 1 - m.roarTimer / 0.65;
      const radius = 14 + prog * 125;
      ctx.save();
      ctx.globalAlpha = Math.max(0, (1 - prog) * 0.85);
      ctx.strokeStyle = m.mount === 'ice_horse' ? '#7ef2ff' : '#ffba52';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(sx, GROUND_Y - 14, radius, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // =========================================================================
  // KINGDOM TWO CROWNS STYLE WORLD MAP (7 NORDIC ISLANDS)
  // =========================================================================
  private drawWorldMapScreen(ctx: CanvasRenderingContext2D, w: WorldState): void {
    const lang = getLanguage();
    const isPortrait = this.viewW < 380;

    // Deep dark Nordic ocean chart backdrop
    const seaGrad = ctx.createLinearGradient(0, 0, 0, this.viewH);
    seaGrad.addColorStop(0, '#07101c');
    seaGrad.addColorStop(0.5, '#0b1b2d');
    seaGrad.addColorStop(1, '#060c15');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // Subtle nautical grid lines
    ctx.strokeStyle = 'rgba(130, 175, 210, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 24; x < this.viewW; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.viewH);
      ctx.stroke();
    }
    for (let y = 24; y < this.viewH; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.viewW, y);
      ctx.stroke();
    }

    // Header
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe58a';
    ctx.font = isPortrait ? 'bold 10px Georgia, serif' : 'bold 13px Georgia, serif';
    ctx.fillText(t('map_title'), Math.round(this.viewW / 2), 22);
    ctx.fillStyle = '#9ec4e0';
    ctx.font = '7px monospace';
    ctx.fillText(
      w.worldMapContext === 'sail' ? t('map_sail_hint') : t('map_view_hint'),
      Math.round(this.viewW / 2),
      34
    );

    const chartTop = 44;
    const chartH = Math.max(96, this.viewH - 134);
    const getPos = (idx: number) => {
      const def = ISLAND_DEFINITIONS[idx];
      if (isPortrait) {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        return {
          x: Math.round(this.viewW * (col === 0 ? 0.28 : 0.72)),
          y: Math.round(chartTop + 20 + row * Math.min(48, (chartH - 28) / 3.2)),
        };
      }
      return {
        x: Math.round(24 + def.mapX * (this.viewW - 48)),
        y: Math.round(chartTop + def.mapY * chartH),
      };
    };

    // Dotted Nordic sea route connecting islands I -> VII
    ctx.strokeStyle = 'rgba(239, 196, 98, 0.35)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ISLAND_DEFINITIONS.forEach((_, i) => {
      const p = getPos(i);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

    ISLAND_DEFINITIONS.forEach((def, idx) => {
      const pos = getPos(idx);
      const prog = w.islands.find((item) => item.id === def.id);
      const isCurrent = def.id === w.currentIsland;
      const isSelected = def.id === this.selectedMapIsland;
      const colonized = Boolean(prog?.colonized);

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = '#ffe066';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 17 + Math.sin(w.elapsed * 4) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      // Island silhouette mound
      ctx.fillStyle = colonized ? '#2d5948' : '#1f2c3b';
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 3, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colonized ? '#51876a' : '#35485c';
      ctx.beginPath();
      ctx.moveTo(pos.x - 10, pos.y + 3);
      ctx.lineTo(pos.x, pos.y - 8);
      ctx.lineTo(pos.x + 10, pos.y + 3);
      ctx.closePath();
      ctx.fill();

      // Clan Flag on colonized islands + Golden Crown on current island
      if (colonized) {
        ctx.fillStyle = '#c4a478';
        ctx.fillRect(pos.x + 2, pos.y - 14, 1, 10);
        ctx.fillStyle = w.crest.primaryColor;
        ctx.fillRect(pos.x + 3, pos.y - 14, 6, 4);
        ctx.fillStyle = w.crest.secondaryColor;
        ctx.fillRect(pos.x + 3, pos.y - 12, 6, 1);
      }
      if (isCurrent) {
        this.drawCrownSprite(ctx, w, pos.x - 3, pos.y - 14);
      }

      // Roman numeral label
      ctx.fillStyle = isSelected ? '#ffe58a' : '#d6e5f2';
      ctx.font = 'bold 7px monospace';
      ctx.fillText(romans[idx], pos.x, pos.y + 17);

      this.addHit(`map_island_${def.id}`, pos.x - 18, pos.y - 18, 36, 38);
    });

    // Bottom Island Details Card
    const selDef = getIslandDef(this.selectedMapIsland);
    const selProg = w.islands.find((item) => item.id === selDef.id);
    const cardW = Math.min(350, this.viewW - 20);
    const cardX = Math.round((this.viewW - cardW) / 2);
    const cardY = this.viewH - 78;

    ctx.fillStyle = 'rgba(8, 14, 24, 0.94)';
    ctx.fillRect(cardX, cardY, cardW, 70);
    ctx.strokeStyle = 'rgba(239, 196, 98, 0.6)';
    ctx.strokeRect(cardX + 0.5, cardY + 0.5, cardW - 1, 69);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 8px monospace';
    ctx.fillText(selDef.name[lang], cardX + 10, cardY + 14);

    const statusTxt =
      selDef.id === w.currentIsland
        ? t('map_current')
        : selProg?.colonized
          ? t('map_colonized')
          : t('map_unexplored');
    ctx.textAlign = 'right';
    ctx.fillStyle = selDef.id === w.currentIsland ? '#ffe066' : selProg?.colonized ? '#7ee08f' : '#8da9c4';
    ctx.font = 'bold 7px monospace';
    ctx.fillText(statusTxt, cardX + cardW - 10, cardY + 14);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#c8dceb';
    ctx.font = '6.5px monospace';
    const godTxt = selDef.godId ? `Deus: ${GOD_DEFS[selDef.godId].name}` : 'Sem Deus';
    const mountTxt = selDef.mountId ? ` · Montaria: ${MOUNT_DEFS[selDef.mountId].name[lang]}` : ' · Drakkar';
    ctx.fillText(`${godTxt}${mountTxt}`, cardX + 10, cardY + 26);

    const diamStr =
      selDef.maxDiamonds > 0
        ? `◆ ${selProg?.diamondsCollected ?? 0}/${selDef.maxDiamonds}`
        : '⛵ Drakkar (30 + 10)';
    const dockStr = selDef.id > 1 ? (selProg?.dockBuilt ? ' · Porto OK' : ' · Porto 30g') : '';
    ctx.fillStyle = '#7ef5ff';
    ctx.fillText(`${diamStr}${dockStr}`, cardX + 10, cardY + 38);

    // Action buttons: Sail (if in sail context & different island) + Close
    const canSailHere = w.worldMapContext === 'sail' && selDef.id !== w.currentIsland;
    if (canSailHere) {
      const btnW = 110;
      const bx = cardX + cardW - btnW - 10;
      const by = cardY + 44;
      ctx.fillStyle = '#2b2412';
      ctx.fillRect(bx, by, btnW, 20);
      ctx.strokeStyle = '#efc462';
      ctx.strokeRect(bx + 0.5, by + 0.5, btnW - 1, 19);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe58a';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(t('map_sail_btn'), bx + btnW / 2, by + 13);
      this.addHit('map_sail_confirm', bx, by, btnW, 20);
    }

    const closeW = 90;
    const closeX = cardX + 10;
    const closeY = cardY + 44;
    ctx.fillStyle = '#162030';
    ctx.fillRect(closeX, closeY, closeW, 20);
    ctx.strokeStyle = 'rgba(180, 210, 235, 0.45)';
    ctx.strokeRect(closeX + 0.5, closeY + 0.5, closeW - 1, 19);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d4e4f2';
    ctx.font = 'bold 7px monospace';
    ctx.fillText(t('map_close'), closeX + closeW / 2, closeY + 13);
    this.addHit('map_close', closeX, closeY, closeW, 20);
    ctx.textAlign = 'left';
  }

  private drawWalls(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const wall of w.walls) {
      const sx = Math.round(wall.x - camX);
      if (sx < -30 || sx > this.viewW + 30) continue;

      if (wall.destroyed) {
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
      if (sx < -20 || sx > this.viewW + 20) continue;
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
      if (v.state === 'embarked') continue;
      const sx = Math.round(v.x - camX);
      if (sx < -20 || sx > this.viewW + 20) continue;
      this.drawSingleVillager(ctx, w, v, sx);
    }
  }

  private drawSingleVillager(ctx: CanvasRenderingContext2D, w: WorldState, v: Villager, sx: number): void {
    const walkBob = Math.abs(v.vx) > 4 ? Math.round(Math.abs(Math.sin(v.animTime)) * 1.5) : 0;
    const stride = Math.abs(v.vx) > 4 ? Math.round(Math.sin(v.animTime) * 2) : 0;
    const primary = w.crest.primaryColor;
    const secondary = w.crest.secondaryColor;

    ctx.fillStyle = '#2d2522';
    ctx.fillRect(sx - 2 + stride, GROUND_Y - 4, 2, 4);
    ctx.fillRect(sx + 1 - stride, GROUND_Y - 4, 2, 4);

    if (v.role === 'wanderer') ctx.fillStyle = '#6c5a4c';
    else if (v.role === 'peasant') ctx.fillStyle = '#9c866d';
    else if (v.role === 'warrior') ctx.fillStyle = primary;
    else if (v.role === 'archer') ctx.fillStyle = primary;
    else if (v.role === 'builder') ctx.fillStyle = '#4e5d6c';
    else ctx.fillStyle = '#5c734b';

    ctx.fillRect(sx - 3, GROUND_Y - 11 - walkBob, 6, 7);

    if (v.role !== 'wanderer' && v.role !== 'peasant') {
      ctx.fillStyle = secondary;
      ctx.fillRect(sx - 3, GROUND_Y - 7 - walkBob, 6, 1);
    }

    ctx.fillStyle = '#e5be9e';
    ctx.fillRect(sx - 2, GROUND_Y - 15 - walkBob, 4, 4);

    if (v.role === 'warrior') {
      ctx.fillStyle = '#9aa8b8';
      ctx.fillRect(sx - 3, GROUND_Y - 17 - walkBob, 6, 3);
      ctx.fillStyle = secondary;
      ctx.fillRect(sx - 1, GROUND_Y - 16 - walkBob, 2, 1);
      ctx.fillStyle = '#d4e2f0';
      ctx.fillRect(sx + v.facing * 4, GROUND_Y - 16 - walkBob, 2, 7);
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
      if (sx < -24 || sx > this.viewW + 24) continue;
      this.drawSingleEnemy(ctx, w, e, sx);
    }
  }

  private drawSingleEnemy(ctx: CanvasRenderingContext2D, w: WorldState, e: Enemy, sx: number): void {
    const frozen = e.frozenTimer > 0;

    // 1. Aerial Hel Crow (flying enemy hovering above walls!)
    if (e.kind === 'hel_crow') {
      const sy = Math.round(e.y);
      const wing = Math.round(Math.sin(e.animTime * 1.8) * 4);
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : frozen ? '#8ce8ff' : '#1d1629';
      ctx.fillRect(sx - 5, sy - 3, 10, 5);
      // Flapping wings
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#322447';
      ctx.fillRect(sx - 10, sy - 4 - wing, 6, 3);
      ctx.fillRect(sx + 4, sy - 4 + wing, 6, 3);
      // Glowing cyan eye & beak
      ctx.fillStyle = '#6bf7ff';
      ctx.fillRect(sx + e.facing * 3, sy - 2, 2, 1);
      ctx.fillStyle = '#a89cb8';
      ctx.fillRect(sx + e.facing * 5, sy - 1, 2, 2);
      return;
    }

    // 2. Fast Spectral Wolf
    if (e.kind === 'wolf_wraith') {
      const stride = Math.round(Math.sin(e.animTime) * 3);
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : frozen ? '#8ce8ff' : '#263a4d';
      ctx.fillRect(sx - 6, GROUND_Y - 9, 12, 5);
      ctx.fillRect(sx + e.facing * 5 - (e.facing < 0 ? 3 : 0), GROUND_Y - 12, 4, 4);
      ctx.fillStyle = '#182430';
      ctx.fillRect(sx - 5 + stride, GROUND_Y - 4, 2, 4);
      ctx.fillRect(sx + 3 - stride, GROUND_Y - 4, 2, 4);
      ctx.fillStyle = '#6bf7ff';
      ctx.fillRect(sx + e.facing * 7, GROUND_Y - 11, 2, 1);
      return;
    }

    // 3. Giant Frost Troll (boss wall-smasher!)
    if (e.kind === 'frost_troll') {
      const bob = Math.round(Math.abs(Math.sin(e.animTime)) * 2);
      const stride = Math.round(Math.sin(e.animTime) * 3);
      const baseY = GROUND_Y - bob;
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#2d4759';
      ctx.fillRect(sx - 6 + stride, GROUND_Y - 8, 4, 8);
      ctx.fillRect(sx + 2 - stride, GROUND_Y - 8, 4, 8);
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : frozen ? '#9bf0ff' : '#4a6e82';
      ctx.fillRect(sx - 9, baseY - 26, 18, 18);
      // Frosty shoulders & horned head
      ctx.fillStyle = '#b9e0f2';
      ctx.fillRect(sx - 9, baseY - 26, 18, 3);
      ctx.fillStyle = '#3b596b';
      ctx.fillRect(sx - 4, baseY - 32, 8, 6);
      ctx.fillStyle = '#6bf7ff';
      ctx.fillRect(sx + (e.facing > 0 ? 1 : -3), baseY - 30, 2, 2);
      // Heavy club
      ctx.fillStyle = '#5c4128';
      ctx.fillRect(sx + e.facing * 9, baseY - 24, 4, 15);
      return;
    }

    // 4. Draugr Raider & Draugr Brute
    const isBrute = e.kind === 'draugr_brute';
    const bob = Math.round(Math.abs(Math.sin(e.animTime)) * 2);
    const stride = Math.round(Math.sin(e.animTime) * 2.5);
    const bodyW = isBrute ? 10 : 7;
    const bodyH = isBrute ? 12 : 8;
    const baseY = GROUND_Y - bob;

    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#1b2633';
    ctx.fillRect(sx - 3 + stride, GROUND_Y - 5, 2, 5);
    ctx.fillRect(sx + 1 - stride, GROUND_Y - 5, 2, 5);

    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : frozen ? '#8ce8ff' : isBrute ? '#2f4557' : '#253847';
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
    const flyOffset = scale === 1 ? Math.round(m.flyY) : 0;

    ctx.save();
    ctx.translate(screenX, groundY);
    ctx.scale(scale, scale);

    // Ground shadow stays on ground even while Harpy flies overhead!
    ctx.fillStyle = flyOffset > 4 ? 'rgba(0, 0, 0, 0.16)' : 'rgba(0, 0, 0, 0.28)';
    const shadowW = Math.max(10, 22 - Math.round(flyOffset * 0.2));
    ctx.fillRect(-Math.round(shadowW / 2), -1, shadowW, 2);

    ctx.translate(0, -flyOffset);

    let riderYOffset = 0;

    if (m.mount === 'harpy') {
      // Feathered Winged Harpy (flies high over enemies!)
      const wing = Math.round(Math.sin(w.elapsed * (flyOffset > 2 ? 18 : 6)) * (flyOffset > 2 ? 6 : 2));
      ctx.fillStyle = '#c49648';
      ctx.fillRect(-3, -6, 2, 6);
      ctx.fillRect(2, -6, 2, 6);
      // Wings
      ctx.fillStyle = '#6c428f';
      ctx.fillRect(-14, -15 - bob - wing, 10, 5);
      ctx.fillRect(4, -15 - bob - wing, 10, 5);
      ctx.fillStyle = '#d4a6ff';
      ctx.fillRect(-13, -15 - bob - wing, 8, 2);
      ctx.fillRect(5, -15 - bob - wing, 8, 2);
      // Body & feathered head
      ctx.fillStyle = '#533070';
      ctx.fillRect(-7, -14 - bob, 14, 8);
      ctx.fillStyle = '#d4a6ff';
      ctx.fillRect(f * 5 - (f < 0 ? 4 : 0), -18 - bob, 5, 6);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(f * 9 - (f < 0 ? 3 : 0), -17 - bob, 3, 2);
    } else if (m.mount === 'wolf') {
      // Sleek Giant Nordic Wolf
      ctx.fillStyle = '#526578';
      ctx.fillRect(-8 + legA, -6, 2, 6);
      ctx.fillRect(-5 + legB, -6, 2, 6);
      ctx.fillRect(4 + legB, -6, 2, 6);
      ctx.fillRect(7 + legA, -6, 2, 6);
      ctx.fillStyle = '#7e97b0';
      ctx.fillRect(-10, -13 - bob, 20, 7);
      // Bushy tail
      ctx.fillStyle = '#a7c2db';
      ctx.fillRect(-f * 13 - (f < 0 ? 2 : 0), -14 - bob, 5, 4);
      // Snout + ears + icy eye
      ctx.fillStyle = '#7e97b0';
      ctx.fillRect(f * 7 - (f < 0 ? 4 : 0), -17 - bob, 6, 5);
      ctx.fillRect(f * 11 - (f < 0 ? 3 : 0), -15 - bob, 4, 3);
      ctx.fillStyle = '#cde4f7';
      ctx.fillRect(f * 7, -19 - bob, 2, 2);
      ctx.fillStyle = '#7ef5ff';
      ctx.fillRect(f * 10, -16 - bob, 2, 1);
      riderYOffset = 1;
    } else if (m.mount === 'bear') {
      // Heavy Armored Nordic War-Bear
      ctx.fillStyle = '#4a321e';
      ctx.fillRect(-9 + legA, -7, 4, 7);
      ctx.fillRect(-4 + legB, -7, 4, 7);
      ctx.fillRect(2 + legB, -7, 4, 7);
      ctx.fillRect(6 + legA, -7, 4, 7);
      ctx.fillStyle = '#6e492c';
      ctx.fillRect(-11, -17 - bob, 22, 11);
      // Steel shoulder armor plates
      ctx.fillStyle = '#9aa8b8';
      ctx.fillRect(-7, -17 - bob, 14, 4);
      ctx.fillStyle = '#c9935b';
      ctx.fillRect(-7, -15 - bob, 14, 1);
      // Bear head & snout
      ctx.fillStyle = '#6e492c';
      ctx.fillRect(f * 8 - (f < 0 ? 6 : 0), -18 - bob, 7, 7);
      ctx.fillStyle = '#4a321e';
      ctx.fillRect(f * 13 - (f < 0 ? 3 : 0), -15 - bob, 3, 3);
      ctx.fillStyle = '#ffd15c';
      ctx.fillRect(f * 11, -17 - bob, 2, 1);
      riderYOffset = -2;
    } else if (m.mount === 'sleipnir') {
      // Odin's 8-Legged Steed (Sleipnir!)
      const legC = moving ? Math.round(Math.sin(m.animTime + 1.4) * 4) : 0;
      const legD = moving ? Math.round(-Math.sin(m.animTime + 1.4) * 4) : 0;
      ctx.fillStyle = '#b4c5d6';
      ctx.fillRect(-8 + legA, -7, 2, 7);
      ctx.fillRect(-6 + legC, -7, 2, 7);
      ctx.fillRect(-4 + legB, -7, 2, 7);
      ctx.fillRect(-2 + legD, -7, 2, 7);
      ctx.fillRect(2 + legB, -7, 2, 7);
      ctx.fillRect(4 + legD, -7, 2, 7);
      ctx.fillRect(6 + legA, -7, 2, 7);
      ctx.fillRect(8 + legC, -7, 2, 7);
      // Majestic silver-white coat + golden rune mane
      ctx.fillStyle = '#e2edf7';
      ctx.fillRect(-10, -14 - bob, 20, 7);
      ctx.fillStyle = '#ffe58a';
      ctx.fillRect(-f * 12, -13 - bob, 4, 6);
      ctx.fillStyle = '#e2edf7';
      ctx.fillRect(f * 6 - (f < 0 ? 4 : 0), -20 - bob, 5, 7);
      ctx.fillRect(f * 9 - (f < 0 ? 5 : 0), -21 - bob, 5, 4);
      ctx.fillStyle = '#ffe58a';
      ctx.fillRect(f * 5 - (f < 0 ? 2 : 0), -20 - bob, 2, 6);
      ctx.fillStyle = '#7ef5ff';
      ctx.fillRect(f * 10, -20 - bob, 2, 1);
    } else {
      // Starter Horse, Ice Horse, or Fire Horse
      const isIce = m.mount === 'ice_horse';
      const isFire = m.mount === 'fire_horse';
      const legCol = isIce ? '#66c9e0' : isFire ? '#40211c' : horse.legs;
      const coatCol = isIce ? '#b8f4ff' : isFire ? '#362321' : horse.coat;
      const maneCol = isIce ? '#3ed4f7' : isFire ? (Math.floor(w.elapsed * 12) % 2 === 0 ? '#ff7d38' : '#ffe066') : horse.mane;

      ctx.fillStyle = legCol;
      ctx.fillRect(-7 + legA, -7, 2, 7);
      ctx.fillRect(-4 + legB, -7, 2, 7);
      ctx.fillRect(3 + legB, -7, 2, 7);
      ctx.fillRect(6 + legA, -7, 2, 7);
      if (isFire || isIce) {
        ctx.fillStyle = isFire ? '#ff9838' : '#d6fbff';
        ctx.fillRect(-7 + legA, -2, 2, 2);
        ctx.fillRect(6 + legA, -2, 2, 2);
      }

      ctx.fillStyle = coatCol;
      ctx.fillRect(-9, -14 - bob, 18, 7);
      ctx.fillStyle = maneCol;
      ctx.fillRect(-f * 11, -13 - bob, 3, 5);
      ctx.fillStyle = coatCol;
      ctx.fillRect(f * 6 - (f < 0 ? 4 : 0), -19 - bob, 5, 7);
      ctx.fillRect(f * 9 - (f < 0 ? 5 : 0), -20 - bob, 5, 4);
      ctx.fillStyle = maneCol;
      ctx.fillRect(f * 5 - (f < 0 ? 2 : 0), -19 - bob, 2, 5);
    }

    // Saddle cloth + Monarch Rider
    ctx.fillStyle = primary;
    ctx.fillRect(-4, -14 - bob + riderYOffset, 8, 5);
    ctx.fillStyle = secondary;
    ctx.fillRect(-4, -10 - bob + riderYOffset, 8, 1);

    const capeSway = moving ? (m.sprinting ? 5 : 3) : 1;
    ctx.fillStyle = primary;
    ctx.fillRect(-f * (4 + capeSway) - (f > 0 ? 4 : 0), -21 - bob + riderYOffset, 6 + capeSway, 7);

    ctx.fillStyle = outfit.tunic;
    ctx.fillRect(-3, -21 - bob + riderYOffset, 6, 8);
    ctx.fillStyle = secondary;
    ctx.fillRect(-3, -15 - bob + riderYOffset, 6, 1);

    ctx.fillStyle = outfit.skin;
    ctx.fillRect(-2, -25 - bob + riderYOffset, 4, 4);
    ctx.fillStyle = hair.color;
    ctx.fillRect(-3, -25 - bob + riderYOffset, 1, 4);
    if (outfit.hasBeard) {
      ctx.fillRect(f > 0 ? 0 : -2, -22 - bob + riderYOffset, 3, 3);
    }
    if (outfit.hasHood) {
      ctx.fillStyle = outfit.tunic;
      ctx.fillRect(-3, -26 - bob + riderYOffset, 6, 2);
    }

    if (m.hasCrown) {
      this.drawCrownSprite(ctx, w, 0, -27 - bob + riderYOffset);
    }

    ctx.restore();

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
      if (sx < -8 || sx > this.viewW + 8) continue;
      const sy = Math.round(c.y);
      ctx.fillStyle = '#b87f14';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(sx - 1, sy - 2, 2, 3);
    }
  }

  private drawFlyingCoins(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const fc of w.flyingCoins) {
      const p = Math.min(1, fc.progress);
      const ease = 1 - Math.pow(1 - p, 2);
      const wx = lerp(fc.startX, fc.targetX, ease);
      const wy = lerp(fc.startY, fc.targetY, ease) - Math.sin(p * Math.PI) * 26;
      const sx = Math.round(wx - camX);
      const sy = Math.round(wy + this.worldOffsetY);

      if (fc.currency === 'diamond') {
        ctx.fillStyle = 'rgba(126, 245, 255, 0.45)';
        ctx.fillRect(sx - 2, sy + 2, 4, 4);
        ctx.fillStyle = '#2da8c4';
        ctx.fillRect(sx - 3, sy - 3, 6, 6);
        ctx.fillStyle = '#7ef5ff';
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
        ctx.fillStyle = '#e8feff';
        ctx.fillRect(sx - 1, sy - 2, 2, 2);
      } else {
        ctx.fillStyle = 'rgba(255, 232, 130, 0.35)';
        ctx.fillRect(sx - 2, sy + 2, 4, 4);
        ctx.fillStyle = '#b87f14';
        ctx.fillRect(sx - 3, sy - 3, 6, 6);
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
        ctx.fillStyle = '#fff9d6';
        ctx.fillRect(sx - 1, sy - 2, 2, 2);
      }
    }
  }

  private drawArrows(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const a of w.arrows) {
      const sx = Math.round(a.x - camX);
      if (sx < -12 || sx > this.viewW + 12) continue;
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
      if (sx < -8 || sx > this.viewW + 8) continue;
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
    ctx.fillRect(0, 0, this.viewW, this.waterScreenY);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const drawGlow = (worldX: number, y: number, radius: number, color: string) => {
      const sx = Math.round(worldX - camX);
      const sy = Math.round(y + this.worldOffsetY);
      if (sx < -radius || sx > this.viewW + radius) return;
      const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, radius);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
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
    this.reflectionCtx.clearRect(0, 0, this.viewW, this.waterScreenY);
    this.reflectionCtx.drawImage(
      ctx.canvas,
      0,
      0,
      this.viewW,
      this.waterScreenY,
      0,
      0,
      this.viewW,
      this.waterScreenY
    );

    const waterH = Math.max(10, this.viewH - this.waterScreenY);
    const waterGrad = ctx.createLinearGradient(0, this.waterScreenY, 0, this.viewH);
    const wTop = lerpRGB({ r: 24, g: 52, b: 74 }, { r: 7, g: 16, b: 28 }, nightFactor);
    const wBot = lerpRGB({ r: 10, g: 24, b: 38 }, { r: 3, g: 8, b: 16 }, nightFactor);
    waterGrad.addColorStop(0, rgbStr(wTop));
    waterGrad.addColorStop(1, rgbStr(wBot));
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, this.waterScreenY, this.viewW, waterH);

    ctx.save();
    ctx.globalAlpha = 0.42;
    for (let dy = 0; dy < waterH; dy += 2) {
      const srcY = Math.max(0, this.waterScreenY - 4 - Math.floor(dy * 1.45));
      const wave = Math.round(Math.sin(w.elapsed * 2.8 + dy * 0.32) * (1 + dy * 0.05));
      ctx.drawImage(
        this.reflectionCanvas,
        0,
        srcY,
        this.viewW,
        2,
        wave,
        this.waterScreenY + dy,
        this.viewW,
        2
      );
    }
    ctx.restore();

    ctx.fillStyle = `rgba(185, 225, 250, ${lerp(0.16, 0.1, nightFactor).toFixed(2)})`;
    for (let i = 0; i < 16; i++) {
      const sx = Math.round(((i * 73 + w.elapsed * (8 + (i % 3) * 4)) % (this.viewW + 40)) - 20);
      const sy = this.waterScreenY + 4 + ((i * 11) % Math.max(6, waterH - 8));
      ctx.fillRect(sx, sy, 12 + (i % 4) * 5, 1);
    }

    ctx.fillStyle = `rgba(190, 224, 242, ${lerp(0.32, 0.14, nightFactor).toFixed(2)})`;
    ctx.fillRect(0, this.waterScreenY, this.viewW, 1);
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
    const sy = Math.round(pr.y + this.worldOffsetY + bob);

    const isDiamond = pr.currency === 'diamond';
    const isLargeCost = pr.cost > 9;
    const slotStep = 10;
    const slotsW = isLargeCost ? 78 : pr.cost * slotStep - 2;
    const boxW = Math.max(slotsW + 18, pr.label.length * 4.7 + 14);
    const bx = Math.max(8, Math.min(this.viewW - boxW - 8, Math.round(sx - boxW / 2)));

    this.addHit('prompt_coin_slot', bx - 8, sy - 26, boxW + 16, 40);

    ctx.fillStyle = 'rgba(8, 14, 24, 0.9)';
    ctx.fillRect(bx, sy - 21, boxW, 26);
    ctx.strokeStyle = isDiamond ? 'rgba(126, 245, 255, 0.9)' : 'rgba(239, 196, 98, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, sy - 20.5, boxW - 1, 25);

    ctx.fillStyle = isDiamond ? '#b5fbff' : '#e6eef7';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(pr.label, bx + boxW / 2, sy - 12);

    if (isLargeCost) {
      // Compact coin icon + progress bar + paid/cost readout (for 10g / 12g / 16g / 30g structures!)
      const barW = 46;
      const barX = Math.round(bx + boxW / 2 - barW / 2 - 12);
      const barY = sy - 6;
      ctx.fillStyle = '#f7d265';
      ctx.fillRect(barX - 9, barY - 1, 6, 6);
      ctx.fillStyle = '#fff5bd';
      ctx.fillRect(barX - 8, barY, 2, 2);

      ctx.fillStyle = 'rgba(247, 210, 101, 0.18)';
      ctx.fillRect(barX, barY, barW, 5);
      ctx.fillStyle = '#f7d265';
      ctx.fillRect(barX, barY, Math.round(barW * Math.min(1, (pr.paid + pr.pending) / pr.cost)), 5);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffe58a';
      ctx.font = 'bold 7px monospace';
      ctx.fillText(`${pr.paid}/${pr.cost}`, barX + barW + 4, barY + 5);
    } else {
      const startX = Math.round(bx + boxW / 2 - slotsW / 2);
      const fullCol = isDiamond ? '#7ef5ff' : '#f7d265';
      const shineCol = isDiamond ? '#ebfeff' : '#fff5bd';
      const pendingCol = isDiamond ? 'rgba(126, 245, 255, 0.55)' : 'rgba(255, 224, 102, 0.55)';
      const emptyCol = isDiamond ? 'rgba(126, 245, 255, 0.2)' : 'rgba(247, 210, 101, 0.2)';
      for (let i = 0; i < pr.cost; i++) {
        const cx = startX + i * slotStep;
        const cy = sy - 7;
        if (i < pr.paid) {
          ctx.fillStyle = fullCol;
          ctx.fillRect(cx, cy, 7, 7);
          ctx.fillStyle = shineCol;
          ctx.fillRect(cx + 1, cy + 1, 2, 2);
        } else if (i < pr.paid + pr.pending) {
          ctx.fillStyle = pendingCol;
          ctx.fillRect(cx, cy, 7, 7);
          ctx.strokeStyle = shineCol;
          ctx.strokeRect(cx + 0.5, cy + 0.5, 6, 6);
        } else {
          ctx.fillStyle = emptyCol;
          ctx.fillRect(cx, cy, 7, 7);
          ctx.strokeStyle = fullCol;
          ctx.strokeRect(cx + 0.5, cy + 0.5, 6, 6);
        }
      }
    }
    ctx.textAlign = 'left';
  }

  // =========================================================================
  // TOP HUD (Adapts to Portrait + Landscape & Reserves Top-Right for Menu Btn)
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

    const isNarrow = this.viewW < 420;
    const menuReserve = 34; // Space for top-right Menu button (☰)

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

    // Top-left Clan Crest + Day badge + 6m Day / 6m Night bar
    ctx.fillStyle = 'rgba(8, 14, 24, 0.8)';
    ctx.fillRect(6, 5, 76, 26);
    ctx.strokeStyle = w.isBloodMoon ? 'rgba(255, 94, 108, 0.7)' : 'rgba(205, 224, 242, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(6.5, 5.5, 75, 25);

    drawShieldEmblem(ctx, w.crest, 18, 18, 7);

    ctx.fillStyle = w.isNight ? (w.isBloodMoon ? '#ff6464' : '#9ed4ff') : '#ffd966';
    ctx.fillRect(29, 11, 5, 5);
    ctx.fillStyle = '#e8f0f8';
    ctx.font = 'bold 8px monospace';
    ctx.fillText(`${t('day_short')} ${w.day}`, 37, 17);

    const phaseProg = w.timeOfDay < 0.5 ? w.timeOfDay / 0.5 : (w.timeOfDay - 0.5) / 0.5;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(29, 22, 47, 3);
    ctx.fillStyle = w.isNight ? (w.isBloodMoon ? '#ff6464' : '#74b9ff') : '#f7d265';
    ctx.fillRect(29, 22, Math.max(1, Math.round(47 * phaseProg)), 3);

    // Gold & Diamond Resource Pouch (cleanly left of Top-Right Menu button!)
    const showDiamonds = monarch.diamonds > 0 || w.currentIsland > 1;
    const goldW = showDiamonds ? 76 : 50;
    const goldX = this.viewW - menuReserve - goldW - 4;
    ctx.fillStyle = 'rgba(8, 14, 24, 0.82)';
    ctx.fillRect(goldX, 5, goldW, 26);
    ctx.strokeStyle = 'rgba(239, 196, 98, 0.5)';
    ctx.strokeRect(goldX + 0.5, 5.5, goldW - 1, 25);

    ctx.fillStyle = '#f7d265';
    ctx.fillRect(goldX + 6, 14, 7, 7);
    ctx.fillStyle = '#fff5bd';
    ctx.fillRect(goldX + 7, 15, 2, 2);

    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(`${monarch.coins}`, goldX + 16, 21);

    if (showDiamonds) {
      // Cyan diamond gem icon + count
      const dx = goldX + 43;
      ctx.fillStyle = '#7ef5ff';
      ctx.fillRect(dx, 14, 6, 6);
      ctx.fillStyle = '#e8feff';
      ctx.fillRect(dx + 1, 15, 2, 2);
      ctx.fillStyle = '#a8f8ff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`${monarch.diamonds}`, dx + 9, 21);
    }

    // Active God blessing & Night Threat mini-pills below Top-Left Day box
    let subY = isNarrow ? 65 : 34;
    if (w.activeGod) {
      const god = GOD_DEFS[w.activeGod];
      ctx.fillStyle = 'rgba(8, 14, 24, 0.82)';
      ctx.fillRect(6, subY, 76, 13);
      ctx.strokeStyle = god.color;
      ctx.strokeRect(6.5, subY + 0.5, 75, 12);
      ctx.fillStyle = god.color;
      ctx.font = 'bold 6.5px monospace';
      ctx.fillText(`★ ${god.name.toUpperCase()}`, 11, subY + 9);
      subY += 15;
    }
    if (w.threatLevel >= 2) {
      ctx.fillStyle = 'rgba(8, 14, 24, 0.78)';
      ctx.fillRect(6, subY, 76, 12);
      ctx.fillStyle = w.isBloodMoon ? '#ff646c' : '#9cc5e3';
      ctx.font = '6px monospace';
      ctx.fillText(`☠ ${t('threat_lbl')} ${w.threatLevel}`, 11, subY + 8);
    }

    // 4 CLICKABLE/TAPPABLE PIXEL-ART CLASS ICONS (Single row on landscape, Row 2 on narrow/portrait!)
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

    const badgeH = 26;
    const badgeGap = 3;
    const badgeW = isNarrow ? Math.min(62, Math.floor((this.viewW - 12 - badgeGap * 3) / 4)) : 56;
    const totalW = badges.length * badgeW + (badges.length - 1) * badgeGap;
    const badgeY = isNarrow ? 35 : 5;
    const badgeStartX = isNarrow
      ? Math.round((this.viewW - totalW) / 2)
      : Math.round(84 + (goldX - 88 - totalW) / 2);

    badges.forEach((b, idx) => {
      const bx = badgeStartX + idx * (badgeW + badgeGap);
      const active = w.activeCommand === b.cmd;

      this.addHit(b.id, bx - 1, badgeY - 2, badgeW + 2, badgeH + 4);

      ctx.fillStyle = active ? 'rgba(46, 36, 12, 0.96)' : 'rgba(8, 14, 24, 0.8)';
      ctx.fillRect(bx, badgeY, badgeW, badgeH);
      ctx.strokeStyle = active ? '#ffe066' : 'rgba(195, 215, 236, 0.28)';
      ctx.strokeRect(bx + 0.5, badgeY + 0.5, badgeW - 1, badgeH - 1);

      this.drawPixelIcon(ctx, b.icon, bx + 4, badgeY + 8);

      ctx.fillStyle = active ? '#ffe58a' : '#eef4fa';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(`${b.counts.total}`, bx + 16, badgeY + 14);

      ctx.fillStyle = '#90a8bf';
      ctx.font = '6px monospace';
      ctx.fillText(`${b.counts.left}◀|▶${b.counts.right}`, bx + 14, badgeY + 23);

      ctx.fillStyle = active ? '#ffe066' : 'rgba(160, 185, 210, 0.65)';
      ctx.font = 'bold 6px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`[${b.key}]`, bx + badgeW - 3, badgeY + 11);
      ctx.textAlign = 'left';
    });

    // Active Tactical Command Banner
    if (w.activeCommand !== 'none' || w.commandFeedback) {
      const cmdLabels: Record<Exclude<CommandMode, 'none'>, string> = {
        attack: t('cmd_attack'),
        archer: t('cmd_archer'),
        build: t('cmd_build'),
        produce: t('cmd_produce'),
      };
      const showMode = w.activeCommand !== 'none' ? w.activeCommand : w.commandFeedback!.mode;
      const barW = Math.min(300, this.viewW - 16);
      const barX = Math.round((this.viewW - barW) / 2);
      const barY = isNarrow ? 65 : 35;

      ctx.fillStyle = 'rgba(10, 16, 26, 0.9)';
      ctx.fillRect(barX, barY, barW, 24);
      ctx.strokeStyle = '#efc462';
      ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, 23);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe58a';
      ctx.font = 'bold 7px monospace';
      ctx.fillText(
        showMode !== 'none' ? cmdLabels[showMode] : '',
        Math.round(this.viewW / 2) - (w.touchCommandMode !== 'none' ? 10 : 0),
        barY + 10
      );
      ctx.fillStyle = '#d4e6f7';
      ctx.font = '7px monospace';
      ctx.fillText(
        w.commandFeedback ? w.commandFeedback.text : t('cmd_hint'),
        Math.round(this.viewW / 2) - (w.touchCommandMode !== 'none' ? 10 : 0),
        barY + 20
      );

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

    // Visual Touch / Mouse directional ripple feedback
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

    // Clickable/Tappable Mount Active Power Button (⚡) in Bottom-Right when riding a special mount!
    if (monarch.mount !== 'starter') {
      const mDef = MOUNT_DEFS[monarch.mount];
      const maxCd = Math.max(0.5, mDef.powerCooldown * (w.activeGod === 'loki' ? 0.65 : 1));
      const ready = monarch.mountPowerCooldown <= 0;
      const pw = 42;
      const ph = 26;
      const px = this.viewW - pw - 8;
      const py = this.viewH - ph - 8;

      this.addHit('hud_mount_power', px - 4, py - 4, pw + 8, ph + 8);

      ctx.fillStyle = ready ? 'rgba(18, 28, 44, 0.92)' : 'rgba(10, 14, 22, 0.78)';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = ready ? mDef.accentColor : 'rgba(150, 170, 195, 0.35)';
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

      if (!ready) {
        const fill = 1 - Math.min(1, monarch.mountPowerCooldown / maxCd);
        ctx.fillStyle = 'rgba(126, 245, 255, 0.22)';
        ctx.fillRect(px + 1, py + ph - 4, Math.round((pw - 2) * fill), 3);
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = ready ? mDef.accentColor : '#8ba0b5';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(ready ? '⚡' : `${Math.ceil(monarch.mountPowerCooldown)}s`, px + pw / 2, py + 12);
      ctx.fillStyle = '#c8dceb';
      ctx.font = '5.5px monospace';
      ctx.fillText('SHIFT', px + pw / 2, py + 21);
      ctx.textAlign = 'left';
    }

    // Minimap bar along bottom of fjord water
    const mapW = Math.min(160, this.viewW - (monarch.mount !== 'starter' ? 116 : 36));
    const mapX = Math.round((this.viewW - mapW) / 2);
    const mapY = this.viewH - 10;
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

  private drawTutorialSpirit(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    const tut = w.tutorial;
    if (!tut || !tut.active || tut.spiritAlpha <= 0.03) return;

    const sx = Math.round(tut.spiritX - camX);
    const sy = Math.round(tut.spiritY);
    if (sx < -40 || sx > this.viewW + 40) return;

    const f = tut.spiritFacing;
    const wave = Math.round(Math.sin(w.elapsed * 5.2) * 1.5);
    const pulse = Math.round(Math.sin(w.elapsed * 6.5) * 2);

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, tut.spiritAlpha));

    // Ethereal cyan-blue radial spirit glow
    const halo = ctx.createRadialGradient(sx, sy - 6, 2, sx, sy - 6, 20);
    halo.addColorStop(0, 'rgba(110, 238, 255, 0.48)');
    halo.addColorStop(1, 'rgba(40, 140, 220, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sx - 20, sy - 26, 40, 40);

    // Flowing translucent spectral blue robe + wispy floating tail
    ctx.fillStyle = '#38a8d8';
    ctx.fillRect(sx - 4, sy - 11, 8, 12);
    ctx.fillStyle = '#6be8ff';
    ctx.fillRect(sx - 3, sy - 10, 6, 10);
    // Wispy bottom tail
    ctx.fillStyle = 'rgba(107, 232, 255, 0.72)';
    ctx.fillRect(sx - 3 + wave, sy + 1, 2, 4);
    ctx.fillRect(sx, sy + 1, 2, 6);
    ctx.fillRect(sx + 2 - wave, sy + 1, 2, 3);

    // Spectral head + glowing eyes + mini ethereal crown
    ctx.fillStyle = '#b8f8ff';
    ctx.fillRect(sx - 3, sy - 16, 6, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx + (f > 0 ? 1 : -2), sy - 14, 2, 1);
    // Floating spirit crown
    ctx.fillStyle = '#8ef5ff';
    ctx.fillRect(sx - 3, sy - 19, 6, 2);
    ctx.fillRect(sx - 3, sy - 21, 1, 2);
    ctx.fillRect(sx, sy - 22, 1, 3);
    ctx.fillRect(sx + 2, sy - 21, 1, 2);

    // Extended pointing arm + glowing index finger pointing where the horse must go!
    const armX = f > 0 ? sx + 4 : sx - 11;
    ctx.fillStyle = '#6be8ff';
    ctx.fillRect(armX, sy - 9, 7, 2);
    // Bright pointing fingertip
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(f > 0 ? sx + 11 : sx - 13, sy - 9, 3, 2);

    // Subtle animated spectral chevron ahead of fingertip when guiding player
    const m = w.monarchs[0];
    const targetX = getTutorialTargetX(w);
    const farFromTarget = m ? Math.abs(targetX - m.x) >= 58 : true;
    if (farFromTarget || tut.step === 'farewell') {
      ctx.fillStyle = '#d4fbff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(f > 0 ? '»' : '«', sx + f * (18 + pulse), sy - 6);
      ctx.textAlign = 'left';
    }

    ctx.restore();
  }

  private drawTutorialDialogue(ctx: CanvasRenderingContext2D, w: WorldState): void {
    const tut = w.tutorial;
    const m = w.monarchs[0];
    if (!tut || !tut.active || !m) return;

    const targetX = getTutorialTargetX(w);
    const nearTarget = tut.step !== 'farewell' && Math.abs(targetX - m.x) < 58;

    let text = '';
    if (tut.step === 'light_fire') text = nearTarget ? t('tut_fire_here') : t('tut_fire_go');
    else if (tut.step === 'recruit_wanderers') text = nearTarget ? t('tut_camp_here') : t('tut_camp_go');
    else if (tut.step === 'buy_hammer') text = nearTarget ? t('tut_hammer_here') : t('tut_hammer_go');
    else if (tut.step === 'build_right_wall') text = nearTarget ? t('tut_wall_r_here') : t('tut_wall_r_go');
    else if (tut.step === 'build_left_wall') text = nearTarget ? t('tut_wall_l_here') : t('tut_wall_l_go');
    else if (tut.step === 'buy_bow') text = nearTarget ? t('tut_bow_here') : t('tut_bow_go');
    else text = t('tut_farewell');

    const isNarrow = this.viewW < 420;
    const baseY = isNarrow ? 66 : 36;
    const yOff = w.activeCommand !== 'none' || w.commandFeedback ? baseY + 28 : baseY;
    const bw = Math.min(352, this.viewW - 14);
    const bx = Math.round((this.viewW - bw) / 2);

    // Simple 2-line word-wrap for narrow mobile screens
    const maxChars = Math.max(30, Math.floor((bw - 46) / 4.2));
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
      if ((cur + ' ' + word).trim().length > maxChars && cur.length > 0) {
        lines.push(cur.trim());
        cur = word;
      } else {
        cur = (cur + ' ' + word).trim();
      }
    }
    if (cur) lines.push(cur);

    const showControls = tut.step === 'light_fire' || tut.step === 'recruit_wanderers';
    const boxH = 14 + lines.length * 9 + (showControls ? 10 : 2);

    ctx.save();
    ctx.fillStyle = 'rgba(7, 16, 29, 0.88)';
    ctx.fillRect(bx, yOff, bw, boxH);
    ctx.strokeStyle = 'rgba(110, 238, 255, 0.78)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, yOff + 0.5, bw - 1, boxH - 1);

    // Mini glowing blue spirit icon on left
    ctx.fillStyle = '#6be8ff';
    ctx.fillRect(bx + 7, yOff + 7, 5, 7);
    ctx.fillStyle = '#e0feff';
    ctx.fillRect(bx + 8, yOff + 5, 3, 3);

    // Dialogue text lines
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d8f9ff';
    ctx.font = 'bold 6.8px monospace';
    lines.forEach((line, idx) => {
      ctx.fillText(line, bx + 17, yOff + 11 + idx * 9);
    });

    if (showControls) {
      ctx.fillStyle = '#8ec0d8';
      ctx.font = '6px monospace';
      ctx.fillText(t('tut_controls'), bx + 17, yOff + 11 + lines.length * 9 + 1);
    }

    // Subtle Skip button on top-right of tutorial box
    const skipW = 28;
    const skipX = bx + bw - skipW - 4;
    const skipY = yOff + 4;
    ctx.fillStyle = 'rgba(20, 36, 56, 0.85)';
    ctx.fillRect(skipX, skipY, skipW, 11);
    ctx.strokeStyle = 'rgba(126, 245, 255, 0.45)';
    ctx.strokeRect(skipX + 0.5, skipY + 0.5, skipW - 1, 10);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fe8ff';
    ctx.font = 'bold 5.5px monospace';
    ctx.fillText(t('tut_skip'), skipX + skipW / 2, skipY + 7.5);
    this.addHit('tutorial_skip', skipX - 4, skipY - 4, skipW + 8, 19);

    ctx.restore();
    ctx.textAlign = 'left';
  }

  private drawBanner(ctx: CanvasRenderingContext2D, w: WorldState): void {
    const b = w.banner;
    if (!b) return;
    const fadeIn = Math.min(1, (b.maxTimer - b.timer) / 0.35);
    const fadeOut = Math.min(1, b.timer / 0.55);
    const alpha = Math.min(fadeIn, fadeOut);
    const isNarrow = this.viewW < 420;
    const baseY = isNarrow ? 66 : 36;
    const yOff = w.activeCommand !== 'none' || w.commandFeedback ? baseY + 28 : baseY;
    const bw = Math.min(304, this.viewW - 16);
    const bx = Math.round((this.viewW - bw) / 2);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(8, 14, 24, 0.82)';
    ctx.fillRect(bx, yOff, bw, 30);
    ctx.fillStyle = b.accent;
    ctx.fillRect(bx, yOff, bw, 1);
    ctx.fillRect(bx, yOff + 29, bw, 1);

    ctx.textAlign = 'center';
    ctx.fillStyle = b.accent;
    ctx.font = 'bold 8px monospace';
    ctx.fillText(b.title, Math.round(this.viewW / 2), yOff + 12);

    ctx.fillStyle = '#d4e2ef';
    ctx.font = '6.5px monospace';
    ctx.fillText(b.subtitle, Math.round(this.viewW / 2), yOff + 23);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  private drawPauseOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(6, 12, 22, 0.72)';
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    const cx = Math.round(this.viewW / 2);
    const cy = Math.round(this.viewH / 2);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f7d265';
    ctx.font = 'bold 16px Georgia, serif';
    ctx.fillText(t('paused'), cx, cy - 22);
    ctx.fillStyle = '#d4e2ef';
    ctx.font = '8px monospace';
    ctx.fillText(t('paused_hint'), cx, cy - 4);

    const bw = Math.min(168, this.viewW - 28);
    ctx.fillStyle = '#182436';
    ctx.fillRect(cx - bw / 2, cy + 12, bw, 22);
    ctx.strokeStyle = 'rgba(239, 196, 98, 0.6)';
    ctx.strokeRect(cx - bw / 2 + 0.5, cy + 12.5, bw - 1, 21);
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 8px monospace';
    ctx.fillText(t('back_main_menu'), cx, cy + 26);
    this.addHit('pause_menu', cx - bw / 2, cy + 12, bw, 22);
    ctx.textAlign = 'left';
  }

  private drawGameOverOverlay(ctx: CanvasRenderingContext2D, w: WorldState): void {
    ctx.fillStyle = 'rgba(14, 6, 12, 0.8)';
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    const cx = Math.round(this.viewW / 2);
    const cy = Math.round(this.viewH / 2);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6b78';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText(t('crown_fell'), cx, cy - 46);

    ctx.fillStyle = '#d4dde8';
    ctx.font = '8px monospace';
    ctx.fillText(t('crown_fell_sub'), cx, cy - 28);

    const sw = Math.min(230, this.viewW - 24);
    ctx.fillStyle = 'rgba(8, 14, 24, 0.85)';
    ctx.fillRect(cx - sw / 2, cy - 16, sw, 56);
    ctx.strokeStyle = 'rgba(255, 107, 120, 0.45)';
    ctx.strokeRect(cx - sw / 2 + 0.5, cy - 15.5, sw - 1, 55);

    ctx.fillStyle = '#f7d265';
    ctx.fillText(`${t('days_survived')}: ${w.stats.daysSurvived}`, cx, cy);
    ctx.fillStyle = '#cfe0ee';
    ctx.fillText(`${t('draugr_slain')}: ${w.stats.draugrSlain}`, cx, cy + 13);
    ctx.fillText(
      `${t('recruited_lbl')}: ${w.stats.villagersRecruited}  ·  ${t('walls_lbl')}: ${w.stats.wallsBuilt}`,
      cx,
      cy + 26
    );

    const bw = Math.min(196, this.viewW - 28);
    ctx.fillStyle = '#2b2412';
    ctx.fillRect(cx - bw / 2, cy + 54, bw, 24);
    ctx.strokeStyle = '#efc462';
    ctx.strokeRect(cx - bw / 2 + 0.5, cy + 54.5, bw - 1, 23);
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 8px monospace';
    ctx.fillText(t('back_main_menu'), cx, cy + 69);
    this.addHit('gameover_menu', cx - bw / 2, cy + 54, bw, 24);
    ctx.textAlign = 'left';
  }
}
