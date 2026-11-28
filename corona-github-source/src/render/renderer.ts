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
import { isPlayerAuthorizedToPlay } from '../cloud/googleAuthCloud';
import { isWhatsappRewardClaimed } from '../cloud/referralSystem';
import { getLanguage, t } from '../i18n/translations';
import { feedbackUi, isFeedbackAnswered } from '../storage/feedbackSystem';
import {
  MAX_SAVE_SLOTS,
  countSavedCampaigns,
  getSavedCampaignSummary,
  listCampaignSlots,
} from '../storage/saveSystem';
import {
  getCenterX,
  getWorldWidth,
  GROUND_Y,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type CommandMode,
  type ElderId,
  type Enemy,
  type Monarch,
  type Villager,
  type WorldState,
} from '../types';
import {
  ELEMENTAL_STAFF_RECIPES,
  ELEMENTAL_STONE_DEFS,
  PRECIOUS_METALS,
  WEAPON_DEFS,
  getIslandMetalId,
} from '../world/arsenal';
import { ELDER_DEFS } from '../world/elders';
import {
  countArchersAssignedToTower,
  getBankerDailyRatePct,
  getFarmMaxFarmers,
  getFarmStorageCap,
  getSpiritButtonScreenPos,
  getTowerArcherCap,
  getTowerHeight,
  getTutorialTargetX,
  getWallHeight,
  isFarmsUnlocked,
  isIslandSelectableOnMap,
  isShopUnlocked,
} from '../systems/simulation';
import { ISLAND_DEFINITIONS, getIslandDef, getIslandMapNode, type IslandTheme } from '../world/islands';
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
  public charNameBoxRect: { x: number; y: number; w: number; h: number } | null = null;

  // Live responsive logical viewport dimensions (adapts to 100% of any device!)
  private viewW = LOGICAL_WIDTH;
  private viewH = LOGICAL_HEIGHT;
  private renderScale = 1;
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

  public setViewport(logicalW: number, logicalH: number, renderScale: number): void {
    this.viewW = Math.max(200, Math.round(logicalW));
    this.viewH = Math.max(180, Math.round(logicalH));
    this.renderScale = Math.max(1, renderScale);
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

  private syncViewport(ctx: CanvasRenderingContext2D, w: WorldState): void {
    const cw = Math.max(200, Math.round(w.viewWidth || this.viewW || ctx.canvas.width));
    const ch = Math.max(180, Math.round(w.viewHeight || this.viewH || ctx.canvas.height));
    this.viewW = cw;
    this.viewH = ch;
    this.renderScale = Math.max(1, ctx.canvas.width / cw);
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

  private getSkyColors(
    tVal: number,
    isBloodMoon: boolean,
    theme: IslandTheme
  ): { top: RGB; bot: RGB; nightFactor: number } {
    let top: RGB;
    let bot: RGB;
    let nightFactor = 0;

    const dawnTop = lerpRGB(theme.skyDuskTop, theme.skyDayTop, 0.35);
    const dawnBot = lerpRGB(theme.skyDuskBot, { r: 238, g: 164, b: 120 }, 0.45);
    const nightBot = isBloodMoon ? SKY_BOT_BLOOD : theme.skyNightBot;

    if (tVal < 0.05) {
      const k = tVal / 0.05;
      top = lerpRGB(dawnTop, theme.skyDayTop, k);
      bot = lerpRGB(dawnBot, theme.skyDayBot, k);
      nightFactor = lerp(0.35, 0, k);
    } else if (tVal < 0.43) {
      top = theme.skyDayTop;
      bot = theme.skyDayBot;
      nightFactor = 0;
    } else if (tVal < 0.49) {
      const k = (tVal - 0.43) / 0.06;
      top = lerpRGB(theme.skyDayTop, theme.skyDuskTop, k);
      bot = lerpRGB(theme.skyDayBot, theme.skyDuskBot, k);
      nightFactor = lerp(0, 0.48, k);
    } else if (tVal < 0.54) {
      const k = (tVal - 0.49) / 0.05;
      top = lerpRGB(theme.skyDuskTop, theme.skyNightTop, k);
      bot = lerpRGB(theme.skyDuskBot, nightBot, k);
      nightFactor = lerp(0.48, 1, k);
    } else if (tVal < 0.95) {
      top = theme.skyNightTop;
      bot = nightBot;
      nightFactor = 1;
    } else {
      const k = (tVal - 0.95) / 0.05;
      top = lerpRGB(theme.skyNightTop, dawnTop, k);
      bot = lerpRGB(nightBot, dawnBot, k);
      nightFactor = lerp(1, 0.35, k);
    }

    return { top, bot, nightFactor };
  }

  private getLocalMonarch(w: WorldState): Monarch | undefined {
    if (w.localPlayerUid) {
      const found = w.monarchs.find((m) => m.playerUid === w.localPlayerUid);
      if (found) return found;
    }
    return w.monarchs[0];
  }

  public render(ctx: CanvasRenderingContext2D, w: WorldState): void {
    this.syncViewport(ctx, w);
    ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    this.hitRegions = [];
    this.charNameBoxRect = null;

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

    const islandDef = getIslandDef(w.currentIsland);
    const theme = islandDef.theme;

    const monarch = this.getLocalMonarch(w);
    const shakeX = w.screenShake > 0 ? Math.round((Math.random() - 0.5) * 4) : 0;
    const shakeY = w.screenShake > 0 ? Math.round((Math.random() - 0.5) * 3) : 0;
    const fallbackCam = Math.max(0, Math.round(getCenterX(w) - this.viewW / 2));
    const camX = Math.round((monarch ? monarch.cameraX : fallbackCam) + shakeX);

    const { top, bot, nightFactor } = this.getSkyColors(w.timeOfDay, w.isBloodMoon, theme);

    ctx.save();
    ctx.translate(0, shakeY);

    // 1. Full-height dynamic Island Sky
    const grad = ctx.createLinearGradient(0, 0, 0, this.waterScreenY);
    grad.addColorStop(0, rgbStr(top));
    grad.addColorStop(1, rgbStr(bot));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.waterScreenY);

    if (nightFactor > 0.15) this.drawStarsAndAurora(ctx, w, nightFactor, theme);
    this.drawCelestial(ctx, w);
    if (theme.hasRainbow !== 'none') this.drawIslandRainbow(ctx, w, camX, nightFactor, theme);
    this.drawClouds(ctx, w, camX, nightFactor);

    // 2. World plane shifted smoothly by worldOffsetY (0 on landscape, >0 on tall portrait)
    ctx.save();
    ctx.translate(0, this.worldOffsetY);

    this.drawParallaxMountains(ctx, w, camX, nightFactor, theme);
    this.drawMonumentalGodStatue(ctx, w, camX, nightFactor, theme);
    this.drawParallaxForest(ctx, w, camX, nightFactor, theme);
    this.drawStorytellingScenery(ctx, w, camX, nightFactor, theme);
    this.drawGround(ctx, w, camX, nightFactor, theme);
    this.drawWorldEdges(ctx, w, camX, nightFactor, theme);

    this.drawTrees(ctx, w, camX, nightFactor, theme);
    this.drawYggdrasil(ctx, w, camX);
    this.drawRocks(ctx, w, camX, nightFactor);
    this.drawBerryBushes(ctx, w, camX);
    this.drawCamps(ctx, w, camX);
    this.drawChests(ctx, w, camX);
    this.drawPortals(ctx, w, camX);
    this.drawHall(ctx, w, camX);
    this.drawBanker(ctx, w, camX);
    this.drawForge(ctx, w, camX);
    this.drawShops(ctx, w, camX);
    this.drawFarms(ctx, w, camX);
    this.drawStaffAltars(ctx, w, camX);
    this.drawBoatAndDock(ctx, w, camX);
    this.drawShrinesAndPuzzle(ctx, w, camX);
    this.drawElderCottages(ctx, w, camX);
    this.drawIslandBuffs(ctx, w, camX);
    this.drawTowers(ctx, w, camX);
    this.drawWalls(ctx, w, camX);
    this.drawOrderedTaskTargetsAndPriorityArrow(ctx, w, camX);
    this.drawWildlife(ctx, w, camX);
    this.drawVillagers(ctx, w, camX);
    this.drawElders(ctx, w, camX);
    this.drawEnemies(ctx, w, camX);
    for (const m of w.monarchs) {
      if (m !== monarch) {
        this.drawMonarch(ctx, w, m, camX, 1, Math.round(m.x - camX), GROUND_Y);
      }
    }
    if (monarch) this.drawMonarch(ctx, w, monarch, camX, 1, Math.round(monarch.x - camX), GROUND_Y);
    this.drawFireTrailsAndLightning(ctx, w, camX);
    this.drawMagicProjectiles(ctx, w, camX);
    this.drawCoins(ctx, w, camX);
    this.drawArrows(ctx, w, camX);
    this.drawWorldParticles(ctx, w, camX);

    ctx.restore();

    if (nightFactor > 0.08) this.drawLighting(ctx, w, camX, nightFactor);

    // 3. Fjord Water Reflection filling 100% of bottom + Floating Drakkar on water surface
    this.drawWaterReflection(ctx, w, nightFactor);
    if (w.boat.built) {
      ctx.save();
      ctx.translate(0, this.worldOffsetY);
      this.drawFloatingBoat(ctx, w, camX);
      ctx.restore();
    }
    this.drawSnowParticles(ctx, w);

    // 4. Floating Coin Placeholder, Flying Coins, Selected Villager Picker & Guiding Spirit (rendered above water so it swoops out of/into the bottom-right blue button!)
    if (w.mode === 'playing' && w.activePrompt) {
      this.drawFloatingPrompt(ctx, w, camX);
    }
    if (w.mode === 'playing' && w.selectedVillagerId) {
      this.drawSelectedVillagerPicker(ctx, w, camX);
    }
    this.drawFlyingCoins(ctx, w, camX);
    if (w.mode === 'playing') {
      ctx.save();
      ctx.translate(0, this.worldOffsetY);
      this.drawTutorialSpirit(ctx, w, camX);
      ctx.restore();
    }

    ctx.restore();

    // 5. Screen Overlays & HUD
    if (w.mode === 'login') {
      this.drawLoginOverlay(ctx, w);
    } else {
      this.drawHud(ctx, w);
      const spiritSpeaking =
        w.mode === 'playing' &&
        (Boolean(w.tutorial?.active) || Boolean(w.spiritAdvisor && w.spiritAdvisor.phase === 'active'));
      if (spiritSpeaking) {
        this.drawTutorialDialogue(ctx, w, camX);
      }
      if (w.banner && !(w.mode === 'playing' && w.tutorial?.active)) {
        this.drawBanner(ctx, w);
      }
      if (w.mode === 'paused') this.drawPauseOverlay(ctx);
      if (w.mode === 'gameover') this.drawGameOverOverlay(ctx, w);
    }

    // 6. Pixel-Art Feedback / Evaluation Modal (top-most layer)
    if (feedbackUi.open) {
      this.drawFeedbackPopup(ctx, w);
    }
  }

  // =========================================================================
  // LOGIN SCREEN (Responsive Portrait + Landscape)
  // =========================================================================
  private drawLoginOverlay(ctx: CanvasRenderingContext2D, w: WorldState): void {
    ctx.fillStyle = 'rgba(5, 9, 17, 0.56)';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const cx = Math.round(this.viewW / 2);
    const cy = Math.round(this.viewH * 0.43);
    const saved = getSavedCampaignSummary();

    const titleY = this.viewH < 320 ? Math.max(46, cy - 60) : Math.max(54, cy - 50);

    // Golden Crown Emblem
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(cx - 12, titleY - 40, 24, 6);
    ctx.fillRect(cx - 12, titleY - 48, 5, 8);
    ctx.fillRect(cx - 2, titleY - 52, 4, 12);
    ctx.fillRect(cx + 7, titleY - 48, 5, 8);
    ctx.fillStyle = '#fff5bd';
    ctx.fillRect(cx - 10, titleY - 38, 20, 2);

    // Pixel-Art CORONA Title (layered metallic gold pixel bevel)
    ctx.textAlign = 'center';
    ctx.font = 'bold 31px "Pixelify Sans", monospace';
    ctx.fillStyle = '#241404';
    ctx.fillText('CORONA', cx + 1.5, titleY + 2.5);
    ctx.fillStyle = '#9e6616';
    ctx.fillText('CORONA', cx, titleY + 1.5);
    ctx.fillStyle = '#f7c948';
    ctx.fillText('CORONA', cx, titleY);
    ctx.fillStyle = '#fff5c4';
    ctx.fillText('CORONA', cx, titleY - 0.6);

    ctx.fillStyle = '#9ec4e0';
    ctx.font = '8px "Pixelify Sans", monospace';
    ctx.fillText(t('subtitle'), cx, titleY + 13);

    if (isPlayerAuthorizedToPlay()) {
      const btnW = Math.min(204, this.viewW - 28);
      const btnH = 21;
      const bx = Math.round(cx - btnW / 2);
      const by1 = titleY + 19;

      ctx.fillStyle = 'rgba(20, 32, 48, 0.92)';
      ctx.fillRect(bx, by1, btnW, btnH);
      ctx.strokeStyle = '#efc462';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by1 + 0.5, btnW - 1, btnH - 1);
      ctx.fillStyle = '#ffe58a';
      ctx.font = 'bold 8.5px "Pixelify Sans", monospace';
      ctx.fillText(t('new_campaign'), cx, by1 + 13.5);
      this.addHit('login_new', bx, by1, btnW, btnH);

      const by2 = by1 + 24;
      const savedCount = countSavedCampaigns();
      ctx.fillStyle = saved ? 'rgba(16, 28, 42, 0.92)' : 'rgba(14, 20, 30, 0.85)';
      ctx.fillRect(bx, by2, btnW, 26);
      ctx.strokeStyle = saved ? 'rgba(140, 210, 255, 0.78)' : 'rgba(140, 175, 210, 0.42)';
      ctx.strokeRect(bx + 0.5, by2 + 0.5, btnW - 1, 25);

      if (saved) {
        drawShieldEmblem(ctx, saved.crest, bx + 18, by2 + 13, 8);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#d9eeff';
        ctx.font = 'bold 7.5px "Pixelify Sans", monospace';
        ctx.fillText(`${t('slots_btn')} (${savedCount}/${MAX_SAVE_SLOTS})`, bx + 33, by2 + 11);
        ctx.fillStyle = '#95b2cc';
        ctx.font = '6.5px "Pixelify Sans", monospace';
        ctx.fillText(
          `Slot ${saved.slot + 1} · ${t('day_short')} ${saved.day} · ${saved.gold}g`,
          bx + 33,
          by2 + 21
        );
      } else {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#c4d8eb';
        ctx.font = 'bold 7.5px "Pixelify Sans", monospace';
        ctx.fillText(`${t('slots_btn')} (0/${MAX_SAVE_SLOTS})`, cx, by2 + 11);
        ctx.fillStyle = '#7e93a8';
        ctx.font = '6.5px "Pixelify Sans", monospace';
        ctx.fillText(t('no_save'), cx, by2 + 21);
      }
      this.addHit('login_slots', bx, by2, btnW, 26);

      // Co-op Online Join by Code Button
      const byCoop = by2 + 29;
      const coopH = 20;
      ctx.fillStyle = 'rgba(18, 40, 32, 0.94)';
      ctx.fillRect(bx, byCoop, btnW, coopH);
      ctx.strokeStyle = '#6fe87b';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, byCoop + 0.5, btnW - 1, coopH - 1);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#a7ffae';
      ctx.font = 'bold 8px "Pixelify Sans", monospace';
      ctx.fillText('⚔ CO-OP ONLINE (CÓDIGO)', cx, byCoop + 13);
      this.addHit('login_coop', bx, byCoop, btnW, coopH);

      // Row 4: Side-by-side Rating (+3 Diamonds) & WhatsApp Community (+3 Diamonds)
      const byRow4 = byCoop + 23;
      const row4H = 19;
      const halfGap = 4;
      const halfW = Math.floor((btnW - halfGap) / 2);
      const rightX = bx + halfW + halfGap;
      const rightW = btnW - halfW - halfGap;

      // Left half: Google Forms Rating (+3 Diamonds)
      const alreadyAnswered = isFeedbackAnswered();
      ctx.fillStyle = alreadyAnswered ? 'rgba(16, 26, 38, 0.88)' : 'rgba(15, 36, 48, 0.94)';
      ctx.fillRect(bx, byRow4, halfW, row4H);
      ctx.strokeStyle = alreadyAnswered ? 'rgba(130, 175, 205, 0.55)' : '#5ce1e6';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, byRow4 + 0.5, halfW - 1, row4H - 1);
      this.drawPixelStar(ctx, bx + 9, byRow4 + 9.5, 1, true);
      if (!alreadyAnswered) {
        this.drawPixelDiamondIcon(ctx, bx + halfW - 9, byRow4 + 9.5, 1, w.elapsed);
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = alreadyAnswered ? '#b7d4e8' : '#b8f7ff';
      ctx.font = 'bold 6.4px "Pixelify Sans", monospace';
      ctx.fillText(
        alreadyAnswered ? `${t('rate_short_btn')} ✓` : `${t('rate_short_btn')} +3`,
        bx + halfW / 2,
        byRow4 + 12.5
      );
      this.addHit('login_feedback', bx, byRow4, halfW, row4H);

      // Right half: WhatsApp Community (+3 Diamonds)
      const waClaimed = isWhatsappRewardClaimed();
      ctx.fillStyle = 'rgba(11, 44, 27, 0.95)';
      ctx.fillRect(rightX, byRow4, rightW, row4H);
      ctx.strokeStyle = '#25d366';
      ctx.lineWidth = 1;
      ctx.strokeRect(rightX + 0.5, byRow4 + 0.5, rightW - 1, row4H - 1);
      this.drawPixelWhatsAppIcon(ctx, rightX + 4, byRow4 + 4);
      if (!waClaimed) {
        this.drawPixelDiamondIcon(ctx, rightX + rightW - 8, byRow4 + 9.5, 1, w.elapsed);
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#b8ffd2';
      ctx.font = 'bold 6.2px "Pixelify Sans", monospace';
      ctx.fillText(
        waClaimed ? `${t('whatsapp_btn')} ✓` : `${t('whatsapp_btn')} +3`,
        rightX + rightW / 2 + (waClaimed ? 4 : 1),
        byRow4 + 12.5
      );
      this.addHit('login_whatsapp', rightX, byRow4, rightW, row4H);

      // Row 5: Full-Width Invite Friends Button (+3 on first 3 friends, +5 every 3 next friends!)
      const byInvite = byRow4 + 22;
      const inviteH = 19;
      ctx.fillStyle = 'rgba(17, 36, 58, 0.95)';
      ctx.fillRect(bx, byInvite, btnW, inviteH);
      ctx.strokeStyle = '#efc462';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, byInvite + 0.5, btnW - 1, inviteH - 1);
      this.drawPixelDiamondIcon(ctx, bx + 11, byInvite + 9.5, 1, w.elapsed);
      this.drawPixelDiamondIcon(ctx, bx + btnW - 11, byInvite + 9.5, 1, w.elapsed + 1.2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe999';
      ctx.font = 'bold 7.2px "Pixelify Sans", monospace';
      ctx.fillText(t('invite_btn'), cx, byInvite + 12.5);
      this.addHit('login_invite', bx, byInvite, btnW, inviteH);

      // Row 6: Full-Width Complete Game Wiki Button (Encyclopedia)
      const byWiki = byInvite + 22;
      const wikiH = 19;
      ctx.fillStyle = 'rgba(18, 33, 56, 0.96)';
      ctx.fillRect(bx, byWiki, btnW, wikiH);
      ctx.strokeStyle = '#84c5ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, byWiki + 0.5, btnW - 1, wikiH - 1);

      // Pixel-art open book icon on the left of the Wiki button
      const bkx = bx + 6;
      const bky = byWiki + 5;
      ctx.fillStyle = '#84c5ff';
      ctx.fillRect(bkx, bky, 10, 8);
      ctx.fillStyle = '#fff5d6';
      ctx.fillRect(bkx + 1, bky + 1, 3, 6);
      ctx.fillRect(bkx + 6, bky + 1, 3, 6);
      ctx.fillStyle = '#efc462';
      ctx.fillRect(bkx + 4, bky, 2, 8);
      ctx.fillStyle = '#3b5c85';
      ctx.fillRect(bkx + 2, bky + 2, 2, 1);
      ctx.fillRect(bkx + 2, bky + 4, 2, 1);
      ctx.fillRect(bkx + 6, bky + 2, 2, 1);
      ctx.fillRect(bkx + 6, bky + 4, 2, 1);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#e6f5ff';
      ctx.font = 'bold 7.2px "Pixelify Sans", monospace';
      ctx.fillText('WIKI COMPLETA DO JOGO', cx + 4, byWiki + 12.5, btnW - 24);
      this.addHit('login_wiki', bx, byWiki, btnW, wikiH);
    }

    // Google Technology Disclaimer Badge with Pixel-Art Google "G" Logo
    const gText = t('google_tech_disclaimer');
    const isNarrow = this.viewW < 260;
    ctx.font = isNarrow ? 'bold 5.5px "Pixelify Sans", monospace' : 'bold 6.5px "Pixelify Sans", monospace';
    const gTextW = Math.ceil(ctx.measureText(gText).width);
    const badgeH = 16;
    const badgeW = Math.min(this.viewW - 14, gTextW + 24);
    const badgeX = Math.round(cx - badgeW / 2);
    const badgeY = this.viewW < 390 ? this.viewH - 38 : this.viewH - 32;

    ctx.fillStyle = 'rgba(9, 16, 28, 0.86)';
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    ctx.strokeStyle = 'rgba(205, 226, 245, 0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(badgeX + 0.5, badgeY + 0.5, badgeW - 1, badgeH - 1);

    // Subtle 4-color Google accent hairline on top edge of badge
    const segW = Math.floor((badgeW - 2) / 4);
    ctx.fillStyle = '#4285F4';
    ctx.fillRect(badgeX + 1, badgeY + 1, segW, 1);
    ctx.fillStyle = '#EA4335';
    ctx.fillRect(badgeX + 1 + segW, badgeY + 1, segW, 1);
    ctx.fillStyle = '#FBBC05';
    ctx.fillRect(badgeX + 1 + segW * 2, badgeY + 1, segW, 1);
    ctx.fillStyle = '#34A853';
    ctx.fillRect(badgeX + 1 + segW * 3, badgeY + 1, badgeW - 2 - segW * 3, 1);

    this.drawPixelGoogleLogo(ctx, badgeX + 4, badgeY + 3);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e6f1fc';
    ctx.fillText(gText, badgeX + 18, badgeY + 11, badgeW - 22);
    ctx.textAlign = 'center';

    // Subtle creator & inspiration credit in small letters at the bottom footer
    ctx.fillStyle = 'rgba(186, 208, 228, 0.72)';
    ctx.font = '5.5px "Pixelify Sans", monospace';
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

  private drawPixelWhatsAppIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    // Crisp 11x11 pixel-art WhatsApp bubble outline (white)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx + 2, ry, 7, 1);
    ctx.fillRect(rx + 1, ry + 1, 9, 1);
    ctx.fillRect(rx, ry + 2, 11, 6);
    ctx.fillRect(rx + 1, ry + 8, 9, 1);
    ctx.fillRect(rx + 2, ry + 9, 7, 1);
    // Bottom-left speech bubble tail
    ctx.fillRect(rx, ry + 8, 3, 2);
    ctx.fillRect(rx, ry + 10, 2, 1);

    // Inner WhatsApp emerald green fill
    ctx.fillStyle = '#25d366';
    ctx.fillRect(rx + 2, ry + 1, 7, 8);
    ctx.fillRect(rx + 1, ry + 2, 9, 6);
    ctx.fillRect(rx + 1, ry + 8, 2, 2);

    // Classic white pixel phone handset inside bubble
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx + 3, ry + 2, 2, 2);
    ctx.fillRect(rx + 3, ry + 4, 1, 2);
    ctx.fillRect(rx + 4, ry + 5, 2, 2);
    ctx.fillRect(rx + 6, ry + 6, 2, 2);
    ctx.fillRect(rx + 7, ry + 5, 1, 2);
  }

  private drawPixelGoogleLogo(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    // Crisp 11x11 rounded white pixel backing
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx + 1, ry, 9, 11);
    ctx.fillRect(rx, ry + 1, 11, 9);

    // 7x7 iconic 4-color pixel-art Google "G" centered at (rx + 2, ry + 2)
    // Red (#EA4335) — top arc
    ctx.fillStyle = '#EA4335';
    ctx.fillRect(rx + 3, ry + 2, 4, 1);
    ctx.fillRect(rx + 2, ry + 3, 2, 1);
    ctx.fillRect(rx + 7, ry + 3, 1, 1);

    // Yellow (#FBBC05) — left arc
    ctx.fillStyle = '#FBBC05';
    ctx.fillRect(rx + 2, ry + 4, 2, 2);

    // Green (#34A853) — bottom-left & bottom arc
    ctx.fillStyle = '#34A853';
    ctx.fillRect(rx + 2, ry + 6, 2, 1);
    ctx.fillRect(rx + 3, ry + 7, 2, 1);
    ctx.fillRect(rx + 4, ry + 8, 3, 1);

    // Blue (#4285F4) — right crossbar & lower-right arc
    ctx.fillStyle = '#4285F4';
    ctx.fillRect(rx + 5, ry + 5, 4, 1);
    ctx.fillRect(rx + 8, ry + 6, 1, 1);
    ctx.fillRect(rx + 7, ry + 7, 2, 1);
    ctx.fillRect(rx + 7, ry + 8, 1, 1);
  }

  private drawPixelStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, s = 1, glow = false): void {
    const x = Math.round(cx);
    const y = Math.round(cy);
    if (glow) {
      ctx.fillStyle = 'rgba(255, 218, 92, 0.25)';
      ctx.fillRect(x - 4 * s, y - 4 * s, 9 * s, 9 * s);
    }
    ctx.fillStyle = '#d48b1e';
    ctx.fillRect(x - 3 * s, y - 1 * s, 7 * s, 2 * s);
    ctx.fillRect(x - 2 * s, y + 1 * s, 5 * s, 2 * s);
    ctx.fillRect(x - 3 * s, y + 3 * s, 2 * s, 1 * s);
    ctx.fillRect(x + 2 * s, y + 3 * s, 2 * s, 1 * s);
    ctx.fillStyle = '#ffd659';
    ctx.fillRect(x, y - 4 * s, 1 * s, 7 * s);
    ctx.fillRect(x - 1 * s, y - 2 * s, 3 * s, 4 * s);
    ctx.fillRect(x - 3 * s, y - 1 * s, 7 * s, 1 * s);
    ctx.fillRect(x - 2 * s, y + 2 * s, 2 * s, 1 * s);
    ctx.fillRect(x + 1 * s, y + 2 * s, 2 * s, 1 * s);
    ctx.fillStyle = '#fff7c8';
    ctx.fillRect(x, y - 2 * s, 1 * s, 2 * s);
  }

  private drawPixelDiamondIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s = 1, elapsed = 0): void {
    const x = Math.round(cx);
    const y = Math.round(cy);
    const shimmer = 0.65 + 0.35 * Math.sin(elapsed * 5 + cx * 0.2);
    ctx.fillStyle = `rgba(92, 232, 255, ${(0.22 * shimmer).toFixed(2)})`;
    ctx.fillRect(x - 4 * s, y - 4 * s, 9 * s, 9 * s);
    // Outer facet
    ctx.fillStyle = '#1f98c7';
    ctx.fillRect(x - 1 * s, y - 4 * s, 3 * s, 1 * s);
    ctx.fillRect(x - 2 * s, y - 3 * s, 5 * s, 1 * s);
    ctx.fillRect(x - 3 * s, y - 2 * s, 7 * s, 3 * s);
    ctx.fillRect(x - 2 * s, y + 1 * s, 5 * s, 1 * s);
    ctx.fillRect(x - 1 * s, y + 2 * s, 3 * s, 1 * s);
    ctx.fillRect(x, y + 3 * s, 1 * s, 1 * s);
    // Bright cyan inner facet
    ctx.fillStyle = '#6cf0ff';
    ctx.fillRect(x - 1 * s, y - 3 * s, 3 * s, 5 * s);
    ctx.fillRect(x - 2 * s, y - 1 * s, 5 * s, 2 * s);
    // Specular pixel gleam
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1 * s, y - 2 * s, 1 * s, 2 * s);
    if (shimmer > 0.85) {
      ctx.fillRect(x + 1 * s, y - 3 * s, 1 * s, 1 * s);
    }
  }

  // =========================================================================
  // PIXEL-ART FEEDBACK POPUP (Every 30 min if unanswered · +3 Diamonds)
  // =========================================================================
  private drawFeedbackPopup(ctx: CanvasRenderingContext2D, w: WorldState): void {
    // Fullscreen dark backdrop (intercepts clicks so nothing behind is triggered)
    ctx.fillStyle = 'rgba(3, 7, 15, 0.74)';
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    this.addHit('feedback_backdrop', 0, 0, this.viewW, this.viewH);

    const pw = Math.min(234, this.viewW - 18);
    const ph = feedbackUi.awaitingConfirm ? 154 : 146;
    const px = Math.round((this.viewW - pw) / 2);
    const py = Math.round((this.viewH - ph) / 2);
    const cx = Math.round(px + pw / 2);

    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.fillRect(px + 3, py + 4, pw, ph);

    // Outer pixel border (dark navy) + metallic gold double frame
    ctx.fillStyle = '#08121f';
    ctx.fillRect(px - 1, py - 1, pw + 2, ph + 2);

    const bgGrad = ctx.createLinearGradient(px, py, px, py + ph);
    bgGrad.addColorStop(0, '#132438');
    bgGrad.addColorStop(1, '#09131f');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(px, py, pw, ph);

    // Gold pixel border
    ctx.strokeStyle = '#efc462';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    ctx.strokeStyle = 'rgba(104, 184, 214, 0.35)';
    ctx.strokeRect(px + 3.5, py + 3.5, pw - 7, ph - 7);

    // Pixel corner rivets
    ctx.fillStyle = '#fff0b3';
    ctx.fillRect(px + 2, py + 2, 2, 2);
    ctx.fillRect(px + pw - 4, py + 2, 2, 2);
    ctx.fillRect(px + 2, py + ph - 4, 2, 2);
    ctx.fillRect(px + pw - 4, py + ph - 4, 2, 2);

    // Top-right [X] Close Button (pixel-art square, generous tap hit box)
    const xSize = 15;
    const xBtnX = px + pw - xSize - 5;
    const xBtnY = py + 5;
    ctx.fillStyle = '#471b24';
    ctx.fillRect(xBtnX, xBtnY, xSize, xSize);
    ctx.strokeStyle = '#e07a85';
    ctx.strokeRect(xBtnX + 0.5, xBtnY + 0.5, xSize - 1, xSize - 1);
    // Crisp pixel X
    ctx.fillStyle = '#ffe2e6';
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(xBtnX + 4 + i, xBtnY + 4 + i, 1, 1);
      ctx.fillRect(xBtnX + 10 - i, xBtnY + 4 + i, 1, 1);
    }
    this.addHit('feedback_close', xBtnX - 3, xBtnY - 3, xSize + 6, xSize + 6);

    // 5 Pixel-Art Golden Stars across the top
    const starSpacing = 14;
    const starStartX = cx - starSpacing * 2;
    for (let i = 0; i < 5; i++) {
      const bounce = Math.round(Math.sin(w.elapsed * 3.5 + i * 0.6) * 0.8);
      this.drawPixelStar(ctx, starStartX + i * starSpacing, py + 17 + bounce, 1, true);
    }

    // Modal Title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 10px "Pixelify Sans", monospace';
    ctx.fillText(t('fb_title'), cx, py + 36);

    // Description lines
    ctx.fillStyle = '#d3e6f7';
    ctx.font = '6.5px "Pixelify Sans", monospace';
    if (feedbackUi.loginGrantedNotice) {
      ctx.fillStyle = '#7ff7c4';
      ctx.font = 'bold 7px "Pixelify Sans", monospace';
      ctx.fillText(t('fb_reward_banner_title'), cx, py + 51);
      ctx.fillStyle = '#c8e9ff';
      ctx.font = '6.5px "Pixelify Sans", monospace';
      ctx.fillText(t('fb_saved_for_next'), cx, py + 62);
    } else if (feedbackUi.awaitingConfirm) {
      ctx.fillText(t('fb_wait_desc1'), cx, py + 49);
      ctx.fillText(t('fb_wait_desc2'), cx, py + 59);
    } else {
      ctx.fillText(t('fb_desc1'), cx, py + 49);
      ctx.fillText(t('fb_desc2'), cx, py + 59);
    }

    // 3 Pixel-Art Diamonds Reward Strip
    const stripW = pw - 24;
    const stripX = px + 12;
    const stripY = py + 67;
    const stripH = 26;
    ctx.fillStyle = 'rgba(9, 32, 46, 0.92)';
    ctx.fillRect(stripX, stripY, stripW, stripH);
    ctx.strokeStyle = 'rgba(92, 225, 230, 0.65)';
    ctx.strokeRect(stripX + 0.5, stripY + 0.5, stripW - 1, stripH - 1);

    // Draw 3 glowing pixel-art diamonds on the left of the strip
    const dBaseX = stripX + 16;
    const dY = stripY + 13;
    for (let i = 0; i < 3; i++) {
      const bob = Math.round(Math.sin(w.elapsed * 4 + i * 1.1) * 1);
      this.drawPixelDiamondIcon(ctx, dBaseX + i * 13, dY + bob, 1, w.elapsed);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8ef6ff';
    ctx.font = 'bold 7.5px "Pixelify Sans", monospace';
    ctx.fillText(t('fb_reward_label'), dBaseX + 42, stripY + 16);

    // Primary CTA Button
    const ctaW = pw - 24;
    const ctaX = px + 12;
    const ctaY = py + 100;
    const ctaH = 22;
    ctx.textAlign = 'center';

    if (feedbackUi.loginGrantedNotice) {
      ctx.fillStyle = '#1f5e42';
      ctx.fillRect(ctaX, ctaY, ctaW, ctaH);
      ctx.strokeStyle = '#7ff7c4';
      ctx.strokeRect(ctaX + 0.5, ctaY + 0.5, ctaW - 1, ctaH - 1);
      ctx.fillStyle = '#e8fff5';
      ctx.font = 'bold 8px "Pixelify Sans", monospace';
      ctx.fillText('OK', cx, ctaY + 14);
      this.addHit('feedback_close', ctaX, ctaY, ctaW, ctaH);
    } else if (feedbackUi.awaitingConfirm) {
      const glow = 0.8 + 0.2 * Math.sin(w.elapsed * 6);
      ctx.fillStyle = `rgba(28, 96, 66, ${glow.toFixed(2)})`;
      ctx.fillRect(ctaX, ctaY, ctaW, ctaH);
      ctx.strokeStyle = '#7ff7c4';
      ctx.strokeRect(ctaX + 0.5, ctaY + 0.5, ctaW - 1, ctaH - 1);
      ctx.fillStyle = '#f2fff8';
      ctx.font = 'bold 7px "Pixelify Sans", monospace';
      ctx.fillText(t('fb_claim_btn'), cx, ctaY + 14);
      this.addHit('feedback_claim', ctaX, ctaY, ctaW, ctaH);

      // Reopen link below
      ctx.fillStyle = '#9ec4e0';
      ctx.font = '6px "Pixelify Sans", monospace';
      ctx.fillText(t('fb_reopen_btn'), cx, ctaY + 34);
      this.addHit('feedback_open', ctaX + 18, ctaY + 25, ctaW - 36, 13);
    } else {
      ctx.fillStyle = '#473610';
      ctx.fillRect(ctaX, ctaY, ctaW, ctaH);
      ctx.strokeStyle = '#ffe066';
      ctx.strokeRect(ctaX + 0.5, ctaY + 0.5, ctaW - 1, ctaH - 1);
      ctx.fillStyle = '#fff2b0';
      ctx.font = 'bold 7.5px "Pixelify Sans", monospace';
      ctx.fillText(t('fb_open_btn'), cx, ctaY + 14);
      this.addHit('feedback_open', ctaX, ctaY, ctaW, ctaH);
    }

    // Footer hint or configuration notice
    if (feedbackUi.noUrlNotice) {
      ctx.fillStyle = '#ffb380';
      ctx.font = '6px "Pixelify Sans", monospace';
      ctx.fillText(t('fb_not_configured'), cx, py + ph - 9);
    } else if (!feedbackUi.awaitingConfirm) {
      ctx.fillStyle = 'rgba(162, 188, 212, 0.85)';
      ctx.font = '6px "Pixelify Sans", monospace';
      ctx.fillText(t('fb_later_hint'), cx, py + ph - 9);
    }

    ctx.textAlign = 'left';
  }

  private drawSlotBadgeIcon(
    ctx: CanvasRenderingContext2D,
    kind:
      | 'villager'
      | 'archer'
      | 'warrior'
      | 'spearman'
      | 'builder'
      | 'producer'
      | 'elder'
      | 'wood'
      | 'stone'
      | 'iron'
      | 'ore'
      | 'yggdrasil'
      | 'stone_fire'
      | 'stone_ice'
      | 'stone_thunder'
      | 'weapon'
      | 'armor'
      | 'god',
    x: number,
    y: number,
    accentColor?: string
  ): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (kind === 'wood' || kind === 'stone' || kind === 'iron') {
      this.drawMaterialIcon(ctx, kind, rx, ry + 1);
      return;
    }
    if (kind === 'villager') {
      // Nordic subject silhouette (head + tunic)
      ctx.fillStyle = '#f2caa0';
      ctx.fillRect(rx + 2, ry, 3, 3);
      ctx.fillStyle = '#5c7c9e';
      ctx.fillRect(rx + 1, ry + 3, 5, 4);
      ctx.fillStyle = '#9ec4e6';
      ctx.fillRect(rx + 2, ry + 3, 3, 2);
      return;
    }
    if (kind === 'archer') {
      // Compact Bow & Arrow (7x7)
      ctx.fillStyle = '#c48d4e';
      ctx.fillRect(rx + 1, ry, 2, 1);
      ctx.fillRect(rx, ry + 1, 2, 5);
      ctx.fillRect(rx + 1, ry + 6, 2, 1);
      ctx.fillStyle = '#efe8d5';
      ctx.fillRect(rx + 3, ry + 1, 1, 5);
      ctx.fillStyle = '#8fd8ff';
      ctx.fillRect(rx + 2, ry + 3, 5, 1);
      return;
    }
    if (kind === 'warrior') {
      // Compact Sword (7x7)
      ctx.fillStyle = '#e6f2ff';
      ctx.fillRect(rx + 3, ry, 1, 4);
      ctx.fillStyle = '#a4b8cc';
      ctx.fillRect(rx + 2, ry + 1, 1, 3);
      ctx.fillStyle = '#efc462';
      ctx.fillRect(rx + 1, ry + 4, 5, 1);
      ctx.fillStyle = '#7a4b2a';
      ctx.fillRect(rx + 3, ry + 5, 1, 2);
      return;
    }
    if (kind === 'spearman') {
      // Compact Nordic Spear (7x7)
      ctx.fillStyle = '#8a5d32';
      ctx.fillRect(rx + 3, ry + 3, 1, 4);
      ctx.fillStyle = '#e6f4ff';
      ctx.fillRect(rx + 2, ry, 3, 3);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(rx + 3, ry + 3, 1, 1);
      return;
    }
    if (kind === 'builder') {
      // Compact Builder Hammer (7x7)
      ctx.fillStyle = '#9e7040';
      ctx.fillRect(rx + 3, ry + 3, 1, 4);
      ctx.fillStyle = '#bcc9d6';
      ctx.fillRect(rx + 1, ry + 1, 5, 2);
      ctx.fillStyle = '#eef6ff';
      ctx.fillRect(rx + 1, ry + 1, 5, 1);
      return;
    }
    if (kind === 'producer') {
      // Compact Seed & Sprout (7x7)
      ctx.fillStyle = '#d9b25f';
      ctx.fillRect(rx + 2, ry + 4, 3, 3);
      ctx.fillStyle = '#6fd472';
      ctx.fillRect(rx + 3, ry + 1, 1, 3);
      ctx.fillRect(rx + 1, ry + 1, 2, 2);
      ctx.fillRect(rx + 4, ry + 2, 2, 1);
      return;
    }
    if (kind === 'elder') {
      // Nordic Elder (hooded sage with white beard & rune gleam)
      ctx.fillStyle = '#7b5cd6';
      ctx.fillRect(rx + 2, ry, 3, 2);
      ctx.fillRect(rx + 1, ry + 4, 5, 3);
      ctx.fillStyle = '#f2caa0';
      ctx.fillRect(rx + 2, ry + 2, 3, 1);
      ctx.fillStyle = '#f5f8ff';
      ctx.fillRect(rx + 2, ry + 3, 3, 3);
      ctx.fillStyle = '#ffe58a';
      ctx.fillRect(rx + 6, ry + 1, 1, 5);
      return;
    }
    if (kind === 'ore') {
      // Precious Metal Ore Nugget
      ctx.fillStyle = '#c47b22';
      ctx.fillRect(rx + 1, ry + 1, 5, 5);
      ctx.fillStyle = '#ffcf5c';
      ctx.fillRect(rx + 2, ry + 2, 3, 3);
      ctx.fillStyle = '#fff6cc';
      ctx.fillRect(rx + 2, ry + 2, 1, 1);
      return;
    }
    if (kind === 'yggdrasil') {
      // Sacred Yggdrasil World Tree Timber & Leaf
      ctx.fillStyle = '#805226';
      ctx.fillRect(rx + 2, ry + 3, 3, 4);
      ctx.fillStyle = '#52d87a';
      ctx.fillRect(rx + 1, ry, 5, 4);
      ctx.fillStyle = '#ffe57a';
      ctx.fillRect(rx + 2, ry + 1, 2, 1);
      return;
    }
    if (kind === 'stone_fire' || kind === 'stone_ice' || kind === 'stone_thunder') {
      const stKey = kind === 'stone_fire' ? 'fire' : kind === 'stone_ice' ? 'ice' : 'thunder';
      const stDef = ELEMENTAL_STONE_DEFS[stKey];
      ctx.fillStyle = stDef.color;
      ctx.fillRect(rx + 1, ry + 1, 5, 5);
      ctx.fillRect(rx + 2, ry, 3, 7);
      ctx.fillStyle = stDef.highlight;
      ctx.fillRect(rx + 2, ry + 2, 2, 2);
      return;
    }
    if (kind === 'weapon') {
      // Divine Weapon / Elemental Staff Icon
      ctx.fillStyle = '#7d522a';
      ctx.fillRect(rx + 3, ry + 2, 1, 5);
      ctx.fillStyle = accentColor ?? '#ffd257';
      ctx.fillRect(rx + 1, ry, 5, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rx + 2, ry + 1, 2, 1);
      return;
    }
    if (kind === 'armor') {
      // Forged Nordic Armor Breastplate
      ctx.fillStyle = '#9bb2c9';
      ctx.fillRect(rx + 1, ry + 1, 5, 5);
      ctx.fillStyle = '#dce8f5';
      ctx.fillRect(rx + 2, ry + 1, 3, 4);
      ctx.fillStyle = '#ffe58a';
      ctx.fillRect(rx + 2, ry + 2, 3, 1);
      ctx.fillRect(rx + 3, ry + 2, 1, 3);
      return;
    }
    // god — Runic Crown / Star
    ctx.fillStyle = '#f5c542';
    ctx.fillRect(rx + 3, ry, 1, 7);
    ctx.fillRect(rx, ry + 3, 7, 1);
    ctx.fillRect(rx + 2, ry + 2, 3, 3);
    ctx.fillStyle = '#fff8cf';
    ctx.fillRect(rx + 3, ry + 3, 1, 1);
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
    const titleMaxW = isPortrait ? this.viewW - 44 : this.viewW - 60;
    const titleCenterX = isPortrait ? Math.round((this.viewW - 22) / 2) : cx;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe58a';
    ctx.font = isPortrait ? 'bold 9px "Pixelify Sans", monospace' : 'bold 11.5px "Pixelify Sans", monospace';
    ctx.fillText(t('slots_title'), titleCenterX, 20, titleMaxW);

    ctx.fillStyle = '#8eb3d1';
    ctx.font = '6px "Pixelify Sans", monospace';
    ctx.fillText(t('slots_hint'), titleCenterX, 31, titleMaxW);

    const slots = listCampaignSlots();

    const cols = isPortrait ? 2 : 4;
    const rows = isPortrait ? 4 : 2;
    const padX = isPortrait ? 8 : 12;
    const topY = 39;
    const bottomReserve = 30;
    const gap = isPortrait ? 6 : 7;
    const cardW = Math.floor((this.viewW - padX * 2 - gap * (cols - 1)) / cols);
    const cardH = Math.min(
      isPortrait ? 118 : 104,
      Math.floor((this.viewH - topY - bottomReserve - gap * (rows - 1)) / rows)
    );

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
      ctx.font = 'bold 6.5px "Pixelify Sans", monospace';
      ctx.fillText(`SLOT ${i + 1}`, x + 5, y + 10);

      if (info) {
        // Click main card to load & play this campaign!
        this.addHit(`slot_load_${i}`, x, y, cardW, cardH);

        // Shield emblem + Island (I..IX) + Day
        drawShieldEmblem(ctx, info.crest, x + 13, y + 24, 7);

        ctx.fillStyle = '#eef5fc';
        ctx.font = 'bold 6.5px "Pixelify Sans", monospace';
        const islRoman = this.toRoman(info.island);
        ctx.fillText(`ILHA ${islRoman} · ${t('day_short')} ${info.day}`, x + 24, y + 21, cardW - 28);

        // Currency strip with pixel-art Coin, Bank & Diamond icons
        let curX = x + 24;
        const curY = y + 33;
        ctx.font = 'bold 6px "Pixelify Sans", monospace';

        this.drawMinimalCoinIcon(ctx, curX, curY - 6);
        const goldTxt = `${info.gold}`;
        ctx.fillStyle = '#ffe58a';
        ctx.fillText(goldTxt, curX + 8, curY);
        curX += 8 + Math.ceil(ctx.measureText(goldTxt).width) + 5;

        if (info.bankGold > 0 && curX + 18 < x + cardW - 4) {
          this.drawMaterialIcon(ctx, 'bank', curX, curY - 5);
          const bankTxt = `${info.bankGold}`;
          ctx.fillStyle = '#f7d265';
          ctx.fillText(bankTxt, curX + 7, curY);
          curX += 7 + Math.ceil(ctx.measureText(bankTxt).width) + 5;
        }

        if (info.diamonds > 0 && curX + 14 < x + cardW - 3) {
          this.drawMinimalDiamondIcon(ctx, curX, curY - 6);
          const diamTxt = `${info.diamonds}`;
          ctx.fillStyle = '#8cf5ff';
          ctx.fillText(diamTxt, curX + 8, curY);
        }

        // Accumulated Items Icon Grid (troops, subjects, elders, resources, ores, weapons, armor, staves, gods)
        const boxX = x + 4;
        const boxY = y + 38;
        const boxW = cardW - 8;
        const boxH = Math.max(16, cardH - 54);

        ctx.fillStyle = 'rgba(7, 13, 22, 0.72)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = 'rgba(140, 175, 210, 0.18)';
        ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

        const weaponAccent = info.equippedWeapon ? WEAPON_DEFS[info.equippedWeapon]?.color : '#ffd257';
        const badges: Array<{
          icon: Parameters<PixelRenderer['drawSlotBadgeIcon']>[1];
          text: string;
          color: string;
          accent?: string;
        }> = [];

        // Subjects & Troops
        badges.push({ icon: 'villager', text: `${info.villagers}`, color: '#b8d0e6' });
        if (info.archers > 0) badges.push({ icon: 'archer', text: `${info.archers}`, color: '#9fd8ff' });
        if (info.warriors > 0) badges.push({ icon: 'warrior', text: `${info.warriors}`, color: '#eef4fc' });
        if (info.spearmen > 0) badges.push({ icon: 'spearman', text: `${info.spearmen}`, color: '#cfe8ff' });
        if (info.builders > 0) badges.push({ icon: 'builder', text: `${info.builders}`, color: '#e6c89c' });
        if (info.producers > 0) badges.push({ icon: 'producer', text: `${info.producers}`, color: '#92f0a0' });
        if (info.elders > 0) badges.push({ icon: 'elder', text: `${info.elders}`, color: '#d9c2ff' });

        // Resources & Rare Materials
        if (info.wood > 0) badges.push({ icon: 'wood', text: `${info.wood}`, color: '#e8bc82' });
        if (info.stone > 0) badges.push({ icon: 'stone', text: `${info.stone}`, color: '#d4e0ec' });
        if (info.iron > 0) badges.push({ icon: 'iron', text: `${info.iron}`, color: '#9ed2ff' });
        if (info.preciousOres > 0) badges.push({ icon: 'ore', text: `${info.preciousOres}`, color: '#ffcf66' });
        if (info.yggdrasilWood > 0) {
          badges.push({ icon: 'yggdrasil', text: `${info.yggdrasilWood}`, color: '#8cf7b0' });
        }
        for (const st of info.elementalStones) {
          const stDef = ELEMENTAL_STONE_DEFS[st];
          const iconKind =
            st === 'fire' ? 'stone_fire' : st === 'ice' ? 'stone_ice' : 'stone_thunder';
          badges.push({ icon: iconKind, text: '', color: stDef.highlight });
        }

        // Arsenal & Deities
        if (info.weaponsCount > 0) {
          badges.push({
            icon: 'weapon',
            text: `${info.weaponsCount}`,
            color: weaponAccent ?? '#ffd966',
            accent: weaponAccent,
          });
        }
        if (info.armorCount > 0) {
          badges.push({ icon: 'armor', text: `${info.armorCount}`, color: '#ffe58a' });
        }
        if (info.godsCount > 0) {
          badges.push({ icon: 'god', text: `${info.godsCount}`, color: '#fff0a8' });
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(boxX + 1, boxY + 1, boxW - 2, boxH - 2);
        ctx.clip();

        ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
        const rowH = 11;
        const innerPadX = 3;
        const maxX = boxX + boxW - 3;
        const maxY = boxY + boxH - 2;
        let bx = boxX + innerPadX;
        let by = boxY + 3;
        let overflowCount = 0;

        for (let bi = 0; bi < badges.length; bi++) {
          const b = badges[bi];
          const txtW = b.text ? Math.ceil(ctx.measureText(b.text).width) + 1 : 0;
          const bw = 8 + txtW;
          if (bx > boxX + innerPadX && bx + bw > maxX) {
            bx = boxX + innerPadX;
            by += rowH;
          }
          if (by + 7 > maxY) {
            overflowCount = badges.length - bi;
            break;
          }
          this.drawSlotBadgeIcon(ctx, b.icon, bx, by, b.accent);
          if (b.text) {
            ctx.fillStyle = b.color;
            ctx.fillText(b.text, bx + 8, by + 6.5);
          }
          bx += bw + 4;
        }

        if (overflowCount > 0) {
          ctx.textAlign = 'right';
          ctx.fillStyle = '#9ec4e0';
          ctx.fillText(`+${overflowCount}`, maxX, maxY - 1);
          ctx.textAlign = 'left';
        }
        ctx.restore();

        // Play pill
        ctx.fillStyle = 'rgba(46, 36, 12, 0.92)';
        ctx.fillRect(x + 4, y + cardH - 13, cardW - 8, 9.5);
        ctx.fillStyle = '#ffe58a';
        ctx.font = 'bold 6px "Pixelify Sans", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`▶ ${t('slot_play')}`, x + cardW / 2, y + cardH - 6.5);
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
        ctx.font = 'bold 6.5px "Pixelify Sans", monospace';
        ctx.fillText(confirming ? 'OK?' : '×', delX + delW / 2, delY + 8);
        ctx.textAlign = 'left';
        this.addHit(`slot_del_${i}`, delX - 3, delY - 3, delW + 6, 17);
      } else {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#6f859b';
        ctx.font = '7px "Pixelify Sans", monospace';
        ctx.fillText(t('slot_empty'), x + cardW / 2, y + Math.round(cardH * 0.48));
        ctx.fillStyle = '#9cc5e6';
        ctx.font = 'bold 6.5px "Pixelify Sans", monospace';
        ctx.fillText(t('slot_new'), x + cardW / 2, y + Math.round(cardH * 0.72));
        ctx.textAlign = 'left';
        this.addHit(`slot_new_${i}`, x, y, cardW, cardH);
      }
    }

    // Back button
    const backW = 104;
    const backH = 20;
    const backX = Math.round(cx - backW / 2);
    const backY = this.viewH - 25;
    ctx.fillStyle = '#162030';
    ctx.fillRect(backX, backY, backW, backH);
    ctx.strokeStyle = 'rgba(239, 196, 98, 0.55)';
    ctx.strokeRect(backX + 0.5, backY + 0.5, backW - 1, backH - 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 7.5px "Pixelify Sans", monospace';
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
    ctx.font = isPortrait ? 'bold 10px "Pixelify Sans", monospace' : 'bold 12px "Pixelify Sans", monospace';
    ctx.fillText(t('choose_monarch'), padX, 20);
    ctx.fillStyle = '#8b99a8';
    ctx.font = '7px "Pixelify Sans", monospace';
    ctx.fillText(t('starter_note'), padX, 31);

    const secs = Math.ceil(w.selectTimer);
    const urgent = secs <= 5;
    ctx.textAlign = 'right';
    ctx.fillStyle = urgent ? '#ff646c' : '#efc462';
    ctx.font = 'bold 13px "Pixelify Sans", monospace';
    ctx.fillText(`${secs}s`, this.viewW - rightSafe, 22);
    ctx.textAlign = 'left';

    const barW = this.viewW - padX * 2;
    ctx.fillStyle = '#181e28';
    ctx.fillRect(padX, 37, barW, 3);
    ctx.fillStyle = urgent ? '#ff646c' : '#efc462';
    ctx.fillRect(padX, 37, Math.round((barW * w.selectTimer) / 20), 3);

    const previewX = isPortrait ? Math.round(this.viewW / 2) : Math.round(this.viewW * 0.26);
    const previewY = isPortrait ? 132 : Math.round(this.viewH * 0.68);
    const previewScale = isPortrait ? 2.4 : 2.9;

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

    // Live Monarch Title & Name underneath pedestal
    const roleTitle = w.appearance.gender === 'queen' ? t('gender_queen') : t('gender_king');
    const customName = w.appearance.name.trim();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 8px "Pixelify Sans", monospace';
    ctx.fillText(customName ? `${roleTitle} ${customName.toUpperCase()}` : roleTitle, previewX, previewY + 18);
    ctx.textAlign = 'left';

    const px = isPortrait ? padX : Math.round(this.viewW * 0.48);
    const pw = isPortrait ? this.viewW - padX * 2 : Math.min(238, this.viewW - px - padX);

    // Character Name Box (native HTML input overlays this exact rect for mobile/PC typing)
    const nameBoxY = isPortrait ? 156 : 45;
    const nameBoxH = isPortrait ? 26 : 23;
    ctx.fillStyle = '#0c1119';
    ctx.fillRect(px, nameBoxY, pw, nameBoxH);
    ctx.strokeStyle = '#efc462';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, nameBoxY + 0.5, pw - 1, nameBoxH - 1);
    ctx.fillStyle = '#9ec4e0';
    ctx.font = '5.5px "Pixelify Sans", monospace';
    ctx.fillText(t('monarch_name_lbl'), px + 6, nameBoxY + 8);
    this.charNameBoxRect = {
      x: px + 4,
      y: nameBoxY + 9,
      w: pw - 8,
      h: nameBoxH - 11,
    };

    const rows = [
      { key: 'gender', label: t('gender'), val: roleTitle },
      { key: 'outfit', label: t('outfit'), val: OUTFIT_PRESETS[w.appearance.outfitIndex].name },
      { key: 'hair', label: t('hair'), val: HAIR_PRESETS[w.appearance.hairIndex].name },
      { key: 'horse', label: t('horse'), val: HORSE_PRESETS[w.appearance.horseIndex].name },
      { key: 'crown', label: t('crown'), val: CROWN_PRESETS[w.appearance.crownIndex].name },
    ];

    const startY = nameBoxY + nameBoxH + 5;
    const rowH = isPortrait ? 24 : 23;
    const rowStep = isPortrait ? 27 : 26;

    rows.forEach((row, idx) => {
      const ry = startY + idx * rowStep;
      const focused = this.charSelectFocusRow === idx;
      ctx.fillStyle = focused ? '#141a24' : '#0c0f15';
      ctx.fillRect(px, ry, pw, rowH);
      ctx.strokeStyle = focused ? '#efc462' : '#252d3a';
      ctx.strokeRect(px + 0.5, ry + 0.5, pw - 1, rowH - 1);

      ctx.fillStyle = '#7e8fa3';
      ctx.font = '5.5px "Pixelify Sans", monospace';
      ctx.fillText(row.label, px + 24, ry + 8.5);

      ctx.fillStyle = '#eef4fa';
      ctx.font = 'bold 7.5px "Pixelify Sans", monospace';
      ctx.fillText(row.val, px + 24, ry + 19);

      const arrowH = rowH - 6;
      ctx.fillStyle = '#1d2533';
      ctx.fillRect(px + 3, ry + 3, 17, arrowH);
      ctx.fillStyle = '#efc462';
      ctx.textAlign = 'center';
      ctx.font = 'bold 8.5px "Pixelify Sans", monospace';
      ctx.fillText('◀', px + 11.5, ry + rowH / 2 + 3);
      this.addHit(`char_prev_${row.key}`, px + 1, ry + 1, 22, rowH - 2);

      ctx.fillStyle = '#1d2533';
      ctx.fillRect(px + pw - 20, ry + 3, 17, arrowH);
      ctx.fillStyle = '#efc462';
      ctx.fillText('▶', px + pw - 11.5, ry + rowH / 2 + 3);
      this.addHit(`char_next_${row.key}`, px + pw - 23, ry + 1, 22, rowH - 2);
      ctx.textAlign = 'left';
    });

    const btnY = startY + rows.length * rowStep + 4;
    const randW = Math.round(pw * 0.4);
    const confW = pw - randW - 6;

    ctx.fillStyle = '#161d29';
    ctx.fillRect(px, btnY, randW, 22);
    ctx.strokeStyle = '#3b485c';
    ctx.strokeRect(px + 0.5, btnY + 0.5, randW - 1, 21);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cbd8e6';
    ctx.font = 'bold 7.5px "Pixelify Sans", monospace';
    ctx.fillText(t('random'), px + randW / 2, btnY + 14);
    this.addHit('char_random', px, btnY, randW, 22);

    ctx.fillStyle = '#2b2412';
    ctx.fillRect(px + randW + 6, btnY, confW, 22);
    ctx.strokeStyle = '#efc462';
    ctx.strokeRect(px + randW + 6.5, btnY + 0.5, confW - 1, 21);
    ctx.fillStyle = '#ffe58a';
    ctx.fillText(t('confirm'), px + randW + 6 + confW / 2, btnY + 14);
    this.addHit('char_confirm', px + randW + 6, btnY, confW, 22);

    ctx.fillStyle = '#6f7e91';
    ctx.font = '6.5px "Pixelify Sans", monospace';
    ctx.fillText(t('char_hint'), Math.round(this.viewW / 2), Math.min(this.viewH - 6, btnY + 34));
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
    ctx.font = isPortrait ? 'bold 10px "Pixelify Sans", monospace' : 'bold 12px "Pixelify Sans", monospace';
    ctx.fillText(t('forge_crest'), padX, 22);
    ctx.fillStyle = '#8b99a8';
    ctx.font = '7px "Pixelify Sans", monospace';
    ctx.fillText(t('crest_note'), padX, 33);

    const secs = Math.ceil(w.selectTimer);
    const urgent = secs <= 6;
    ctx.textAlign = 'right';
    ctx.fillStyle = urgent ? '#ff646c' : '#efc462';
    ctx.font = 'bold 13px "Pixelify Sans", monospace';
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
      ctx.font = '6px "Pixelify Sans", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(title, x + width / 2, y + 9);
      ctx.fillStyle = '#eef4fa';
      ctx.font = 'bold 7px "Pixelify Sans", monospace';
      ctx.fillText(value, x + width / 2, y + 23);

      ctx.fillStyle = '#1c2432';
      ctx.fillRect(x + 3, y + 12, 16, 16);
      ctx.fillRect(x + width - 19, y + 12, 16, 16);
      ctx.fillStyle = '#efc462';
      ctx.font = 'bold 8px "Pixelify Sans", monospace';
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
      ctx.font = '6px "Pixelify Sans", monospace';
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
      ctx.font = '6px "Pixelify Sans", monospace';
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
    ctx.font = 'bold 8px "Pixelify Sans", monospace';
    ctx.fillText(t('seal_crest'), cx, confirmY + 15);
    this.addHit('crest_confirm', cbX, confirmY, cbW, 24);

    ctx.fillStyle = '#6f7e91';
    ctx.font = '7px "Pixelify Sans", monospace';
    ctx.fillText(t('crest_hint'), cx, Math.min(this.viewH - 8, confirmY + 36));
    ctx.textAlign = 'left';
  }

  // =========================================================================
  // SKY, PARALLAX & WORLD LAYERS (Responsive width/height)
  // =========================================================================
  private drawStarsAndAurora(
    ctx: CanvasRenderingContext2D,
    w: WorldState,
    nightFactor: number,
    theme: IslandTheme
  ): void {
    for (const s of this.stars) {
      const twinkle = 0.45 + 0.55 * Math.sin(w.elapsed * 2.4 + s.phase);
      ctx.fillStyle = `rgba(225, 240, 255, ${(nightFactor * twinkle * 0.85).toFixed(2)})`;
      ctx.fillRect(Math.round(s.rx * this.viewW), Math.round(s.ry * this.waterScreenY), s.size, s.size);
    }

    const auroraAlpha = Math.max(0, (nightFactor - 0.35) / 0.65) * (w.isBloodMoon ? 0.35 : 0.72);
    if (auroraAlpha <= 0.02) return;

    const p1 = theme.auroraPrimary;
    const p2 = theme.auroraSecondary;
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
        g.addColorStop(0, `rgba(${p1.r}, ${p1.g}, ${p1.b}, 0)`);
        g.addColorStop(0.45, `rgba(${p1.r}, ${p1.g}, ${p1.b}, ${(auroraAlpha * shimmer * 0.48).toFixed(3)})`);
        g.addColorStop(0.76, `rgba(${p2.r}, ${p2.g}, ${p2.b}, ${(auroraAlpha * shimmer * 0.34).toFixed(3)})`);
        g.addColorStop(1, `rgba(${p2.r}, ${p2.g}, ${p2.b}, 0)`);
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

  private drawIslandRainbow(
    ctx: CanvasRenderingContext2D,
    w: WorldState,
    camX: number,
    nightFactor: number,
    theme: IslandTheme
  ): void {
    const isBifrost = theme.hasRainbow === 'bifrost';
    const dayVis = isBifrost ? lerp(0.55, 0.36, nightFactor) : Math.max(0, (1 - nightFactor * 1.15) * 0.38);
    if (dayVis <= 0.02) return;

    const worldMid = getCenterX(w);
    const arcCx = Math.round(this.viewW * 0.54 - (camX - (worldMid - this.viewW / 2)) * 0.05);
    const arcCy = this.groundScreenY + 12;
    const baseR = Math.min(this.viewW * 0.56, this.groundScreenY * 0.96);
    const bands = ['#ff6b6b', '#ffad54', '#ffe869', '#6fe87b', '#63d8ff', '#8f8cff', '#d98aff'];

    const drawArc = (radius: number, alpha: number, bandW: number) => {
      ctx.save();
      ctx.lineWidth = bandW;
      for (let i = 0; i < bands.length; i++) {
        const pulse = isBifrost ? 0.8 + 0.2 * Math.sin(w.elapsed * 2.8 + i * 0.65) : 1;
        ctx.globalAlpha = alpha * pulse;
        ctx.strokeStyle = bands[i];
        ctx.beginPath();
        ctx.arc(arcCx, arcCy, Math.max(24, radius - i * bandW), Math.PI * 1.04, Math.PI * 1.96);
        ctx.stroke();
      }
      ctx.restore();
    };

    drawArc(baseR, dayVis, isBifrost ? 3.2 : 2.4);
    if (theme.hasRainbow === 'double') {
      drawArc(baseR + 24, dayVis * 0.52, 1.8);
    }
    if (isBifrost) {
      // Shimmering Bifrost celestial motes floating along the bridge
      for (let i = 0; i < 16; i++) {
        const angle = Math.PI * 1.08 + ((i / 15) * 0.84 + ((w.elapsed * 0.03 + i * 0.17) % 0.08)) * Math.PI;
        const r = baseR - (i % 6) * 3;
        const px = Math.round(arcCx + Math.cos(angle) * r);
        const py = Math.round(arcCy + Math.sin(angle) * r);
        ctx.fillStyle = `rgba(255, 250, 214, ${(dayVis * 1.1).toFixed(2)})`;
        ctx.fillRect(px, py, 2, 2);
      }
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
    w: WorldState,
    camX: number,
    nightFactor: number,
    theme: IslandTheme
  ): void {
    const farBase = lerpRGB(
      theme.farMountainDay,
      w.isBloodMoon ? { r: 44, g: 22, b: 36 } : theme.farMountainNight,
      nightFactor
    );
    const capCol = lerpRGB(theme.mountainCapDay, theme.mountainCapNight, nightFactor);
    const midCol = lerpRGB(theme.midRidgeDay, theme.midRidgeNight, nightFactor);
    const style = theme.mountainStyle;

    // 1. Optional Distant Sea-Stack Islands & Fjord Horizon Silhouettes
    if (theme.hasDistantIslands) {
      const islCol = lerpRGB(
        lerpRGB(theme.farMountainDay, theme.skyDayBot, 0.45),
        lerpRGB(theme.farMountainNight, theme.skyNightBot, 0.4),
        nightFactor
      );
      const islSpan = 190;
      const islScroll = Math.floor(camX * 0.06);
      const islBase = Math.floor(islScroll / islSpan);
      const islOff = ((islScroll % islSpan) + islSpan) % islSpan;
      ctx.fillStyle = rgbStr(islCol, 0.72);
      for (let i = -1; i < Math.ceil(this.viewW / islSpan) + 2; i++) {
        const idx = islBase + i;
        if (Math.abs(idx * 5) % 2 === 1 && style !== 'misty_archipelago') continue;
        const ix = i * islSpan - islOff + 35;
        const iw = 44 + (Math.abs(idx * 17) % 3) * 18;
        const ih = 16 + (Math.abs(idx * 23) % 3) * 9;
        ctx.beginPath();
        ctx.moveTo(ix, GROUND_Y - 6);
        ctx.lineTo(ix + iw * 0.25, GROUND_Y - 6 - ih * 0.8);
        ctx.lineTo(ix + iw * 0.55, GROUND_Y - 6 - ih);
        ctx.lineTo(ix + iw * 0.85, GROUND_Y - 6 - ih * 0.65);
        ctx.lineTo(ix + iw, GROUND_Y - 6);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 2. Far Mountain Range (9 distinct silhouettes!)
    const span = style === 'emerald_valleys' ? 148 : style === 'glacier_spires' ? 92 : 120;
    const farScroll = Math.floor(camX * 0.12);
    const farBaseIdx = Math.floor(farScroll / span);
    const offset = ((farScroll % span) + span) % span;

    for (let i = -1; i < Math.ceil(this.viewW / span) + 2; i++) {
      const worldIdx = farBaseIdx + i;
      const bx = i * span - offset;
      const hVar = Math.abs(worldIdx * 37 + 11) % 3;

      if (style === 'emerald_valleys') {
        // Sweeping broad emerald highland valleys + high mist summits
        const peakH = 54 + hVar * 16;
        const peakY = GROUND_Y - 22 - peakH;
        ctx.fillStyle = rgbStr(farBase);
        ctx.beginPath();
        ctx.moveTo(bx - 22, GROUND_Y);
        ctx.quadraticCurveTo(bx + span * 0.28, peakY + 8, bx + span * 0.52, peakY);
        ctx.quadraticCurveTo(bx + span * 0.78, peakY + 10, bx + span + 24, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        if (theme.hasWaterfalls && Math.abs(worldIdx) % 2 === 0) {
          this.drawDistantWaterfall(ctx, w, bx + span * 0.52, peakY + 18, GROUND_Y - 12, nightFactor);
        }
      } else if (style === 'volcanic_calderas') {
        // Flat-rimmed smoking volcano calderas with molten crater rims & rising smoke
        const peakH = 68 + hVar * 16;
        const peakY = GROUND_Y - 24 - peakH;
        const cxPeak = bx + span * 0.5;
        ctx.fillStyle = rgbStr(farBase);
        ctx.beginPath();
        ctx.moveTo(bx - 18, GROUND_Y);
        ctx.lineTo(cxPeak - 16, peakY);
        ctx.lineTo(cxPeak + 16, peakY);
        ctx.lineTo(bx + span + 18, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        // Glowing lava crater lip + molten vein
        const pulse = 0.65 + 0.35 * Math.sin(w.elapsed * 2.4 + worldIdx);
        ctx.fillStyle = `rgba(255, 118, 52, ${(pulse * 0.85).toFixed(2)})`;
        ctx.fillRect(Math.round(cxPeak - 13), Math.round(peakY), 26, 3);
        ctx.fillStyle = `rgba(255, 198, 92, ${(pulse * 0.75).toFixed(2)})`;
        ctx.fillRect(Math.round(cxPeak - 8), Math.round(peakY + 1), 16, 2);
        // Drifting volcanic smoke plume
        for (let s = 0; s < 4; s++) {
          const drift = ((w.elapsed * 6 + s * 14 + worldIdx * 7) % 44);
          const sx = Math.round(cxPeak - 6 + drift * 0.45 + Math.sin(w.elapsed + s) * 3);
          const sy = Math.round(peakY - 4 - drift);
          ctx.fillStyle = `rgba(72, 46, 50, ${Math.max(0.06, 0.36 - drift * 0.007).toFixed(2)})`;
          ctx.fillRect(sx, sy, 12 + s * 3, 5);
        }
      } else if (style === 'dwarven_crags') {
        // Stepped flat-topped basalt mesas & dwarven stone monolith ridges
        const peakH = 62 + hVar * 18;
        const peakY = GROUND_Y - 22 - peakH;
        ctx.fillStyle = rgbStr(farBase);
        ctx.beginPath();
        ctx.moveTo(bx - 12, GROUND_Y);
        ctx.lineTo(bx + 18, peakY + 24);
        ctx.lineTo(bx + 32, peakY);
        ctx.lineTo(bx + span - 30, peakY);
        ctx.lineTo(bx + span - 14, peakY + 22);
        ctx.lineTo(bx + span + 14, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        // Warm carved forge windows high in the dwarven cliff face
        ctx.fillStyle = `rgba(255, 168, 68, ${lerp(0.45, 0.85, nightFactor).toFixed(2)})`;
        ctx.fillRect(Math.round(bx + 44), Math.round(peakY + 18), 4, 7);
        ctx.fillRect(Math.round(bx + 56), Math.round(peakY + 18), 4, 7);
        ctx.fillRect(Math.round(bx + 68), Math.round(peakY + 18), 4, 7);
      } else if (style === 'glacier_spires') {
        // Razor crystalline glacier needles with brilliant pale ice facets
        const peakH = 82 + hVar * 20;
        const peakX = bx + span * 0.46;
        const peakY = GROUND_Y - 26 - peakH;
        ctx.fillStyle = rgbStr(farBase);
        ctx.beginPath();
        ctx.moveTo(bx - 10, GROUND_Y);
        ctx.lineTo(peakX - 18, peakY + 34);
        ctx.lineTo(peakX, peakY);
        ctx.lineTo(peakX + 22, peakY + 28);
        ctx.lineTo(bx + span + 12, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = rgbStr(capCol, 0.92);
        ctx.beginPath();
        ctx.moveTo(peakX, peakY);
        ctx.lineTo(peakX - 16, peakY + 36);
        ctx.lineTo(peakX, peakY + 46);
        ctx.closePath();
        ctx.fill();
      } else if (style === 'asgard_spires') {
        // Majestic golden-capped mountain peaks + distant celestial Asgardian citadel spires
        const peakH = 74 + hVar * 18;
        const peakX = bx + 54;
        const peakY = GROUND_Y - 26 - peakH;
        ctx.fillStyle = rgbStr(farBase);
        ctx.beginPath();
        ctx.moveTo(bx - 16, GROUND_Y);
        ctx.lineTo(peakX, peakY);
        ctx.lineTo(bx + span + 18, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        // Golden Valhalla spire rising from summit
        ctx.fillStyle = rgbStr(capCol);
        ctx.fillRect(Math.round(peakX - 4), Math.round(peakY - 12), 8, 16);
        ctx.fillRect(Math.round(peakX - 2), Math.round(peakY - 22), 4, 10);
        ctx.fillRect(Math.round(peakX - 1), Math.round(peakY - 28), 2, 6);
        if (theme.hasWaterfalls && Math.abs(worldIdx) % 2 === 1) {
          this.drawDistantWaterfall(ctx, w, peakX + 16, peakY + 26, GROUND_Y - 10, nightFactor);
        }
      } else if (style === 'misty_archipelago') {
        // Layered rounded misty islands & coastal crags
        const peakH = 44 + hVar * 16;
        const peakY = GROUND_Y - 18 - peakH;
        ctx.fillStyle = rgbStr(farBase);
        ctx.beginPath();
        ctx.moveTo(bx - 16, GROUND_Y);
        ctx.lineTo(bx + 24, peakY + 12);
        ctx.lineTo(bx + 54, peakY);
        ctx.lineTo(bx + 86, peakY + 14);
        ctx.lineTo(bx + span + 14, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        if (theme.hasWaterfalls && Math.abs(worldIdx) % 3 === 0) {
          this.drawDistantWaterfall(ctx, w, bx + 56, peakY + 14, GROUND_Y - 8, nightFactor);
        }
      } else {
        // fjord_peaks, jagged_thunder, titan_canyon — dramatic Nordic peaks with sharp caps
        const peakH = (style === 'titan_canyon' ? 84 : 72) + hVar * 18;
        const peakX = bx + 54;
        const peakY = GROUND_Y - 26 - peakH;
        ctx.fillStyle = rgbStr(farBase);
        ctx.beginPath();
        ctx.moveTo(bx - 16, GROUND_Y);
        ctx.lineTo(peakX - 22, peakY + 28);
        ctx.lineTo(peakX, peakY);
        ctx.lineTo(peakX + 24, peakY + 24);
        ctx.lineTo(bx + span + 18, GROUND_Y);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = rgbStr(capCol);
        ctx.beginPath();
        ctx.moveTo(peakX, peakY);
        ctx.lineTo(peakX - 18, peakY + 26);
        ctx.lineTo(peakX - 4, peakY + 20);
        ctx.lineTo(peakX + 8, peakY + 28);
        ctx.lineTo(peakX + 14, peakY + 20);
        ctx.closePath();
        ctx.fill();

        if (theme.hasWaterfalls && Math.abs(worldIdx) % 3 === 1) {
          this.drawDistantWaterfall(ctx, w, peakX + 12, peakY + 28, GROUND_Y - 12, nightFactor);
        }
      }
    }

    // 3. Mid-ground Ridge Line
    const midSpan = style === 'emerald_valleys' ? 116 : 96;
    const midScroll = Math.floor(camX * 0.26);
    const midBaseIdx = Math.floor(midScroll / midSpan);
    const midOff = ((midScroll % midSpan) + midSpan) % midSpan;
    ctx.fillStyle = rgbStr(midCol);
    for (let i = -1; i < Math.ceil(this.viewW / midSpan) + 2; i++) {
      const worldIdx = midBaseIdx + i;
      const bx = i * midSpan - midOff;
      const h = (style === 'emerald_valleys' ? 32 : 42) + (Math.abs(worldIdx * 19 + 7) % 3) * 12;
      ctx.beginPath();
      ctx.moveTo(bx - 10, GROUND_Y);
      if (style === 'emerald_valleys' || style === 'misty_archipelago') {
        ctx.quadraticCurveTo(bx + midSpan * 0.5, GROUND_Y - h * 1.35, bx + midSpan + 14, GROUND_Y);
      } else {
        ctx.lineTo(bx + 42, GROUND_Y - h);
        ctx.lineTo(bx + midSpan + 14, GROUND_Y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawDistantWaterfall(
    ctx: CanvasRenderingContext2D,
    w: WorldState,
    x: number,
    topY: number,
    botY: number,
    nightFactor: number
  ): void {
    const rx = Math.round(x);
    const h = Math.max(8, Math.round(botY - topY));
    ctx.fillStyle = `rgba(176, 228, 248, ${lerp(0.55, 0.25, nightFactor).toFixed(2)})`;
    ctx.fillRect(rx - 2, Math.round(topY), 5, h);
    ctx.fillStyle = `rgba(240, 252, 255, ${lerp(0.75, 0.35, nightFactor).toFixed(2)})`;
    const foamShift = Math.floor((w.elapsed * 22) % 8);
    for (let y = Math.round(topY) + foamShift; y < Math.round(botY); y += 8) {
      ctx.fillRect(rx - 1, y, 3, 3);
    }
    // Misty splash pool at waterfall base
    ctx.fillStyle = `rgba(220, 246, 255, ${lerp(0.45, 0.18, nightFactor).toFixed(2)})`;
    ctx.fillRect(rx - 8, Math.round(botY - 3), 16, 4);
  }

  // =========================================================================
  // COLOSSAL MONUMENTAL GOD STATUES (1 Unique Towering Landmark per Island!)
  // =========================================================================
  private drawMonumentalGodStatue(
    ctx: CanvasRenderingContext2D,
    w: WorldState,
    camX: number,
    nightFactor: number,
    theme: IslandTheme
  ): void {
    const cxWorld = getCenterX(w);
    // Anchored majestically slightly off-center behind the kingdom heart at 0.38x parallax!
    const anchorWorldX = cxWorld + (w.currentIsland % 2 === 0 ? -90 : 110);
    const sx = Math.round(this.viewW * 0.5 + (anchorWorldX - (camX + this.viewW * 0.5)) * 0.38);
    if (sx < -140 || sx > this.viewW + 140) return;

    const baseY = GROUND_Y - 8;
    const stoneDark = lerpRGB(lerpRGB(theme.midRidgeDay, { r: 62, g: 72, b: 84 }, 0.5), { r: 16, g: 22, b: 34 }, nightFactor);
    const stoneMid = lerpRGB(lerpRGB(theme.cliffRockDay, { r: 112, g: 124, b: 138 }, 0.45), { r: 30, g: 40, b: 56 }, nightFactor);
    const stoneLight = lerpRGB(lerpRGB(theme.mountainCapDay, { r: 186, g: 198, b: 212 }, 0.5), { r: 58, g: 76, b: 98 }, nightFactor);
    const pulse = 0.6 + 0.4 * Math.sin(w.elapsed * 2.2);

    ctx.save();

    // Shared colossal stone plinth
    ctx.fillStyle = rgbStr(stoneDark);
    ctx.fillRect(sx - 34, baseY - 18, 68, 22);
    ctx.fillStyle = rgbStr(stoneMid);
    ctx.fillRect(sx - 28, baseY - 24, 56, 8);
    ctx.fillStyle = rgbStr(stoneLight, 0.55);
    ctx.fillRect(sx - 28, baseY - 24, 56, 2);

    const god = theme.monumentGod;

    if (god === 'midgard_runestone') {
      // Ilha I: Colossal Ancient Viking Wayfinder Monolith & Twin Standing Stones
      ctx.fillStyle = rgbStr(stoneDark);
      ctx.fillRect(sx - 30, baseY - 62, 12, 42);
      ctx.fillRect(sx + 18, baseY - 58, 12, 38);
      ctx.fillStyle = rgbStr(stoneMid);
      ctx.beginPath();
      ctx.moveTo(sx - 16, baseY - 22);
      ctx.lineTo(sx - 12, baseY - 96);
      ctx.lineTo(sx, baseY - 110);
      ctx.lineTo(sx + 12, baseY - 96);
      ctx.lineTo(sx + 16, baseY - 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = rgbStr(stoneLight, 0.7);
      ctx.fillRect(sx - 11, baseY - 94, 4, 68);
      // Glowing Elder Futhark rune spiral carved down the center
      ctx.fillStyle = `rgba(124, 247, 255, ${(0.35 + pulse * 0.45).toFixed(2)})`;
      ctx.fillRect(sx - 1, baseY - 92, 2, 54);
      ctx.fillRect(sx - 6, baseY - 82, 12, 2);
      ctx.fillRect(sx - 5, baseY - 68, 10, 2);
      ctx.fillRect(sx - 4, baseY - 54, 8, 2);
    } else if (god === 'freya') {
      // Ilha II: Colossal Statue of Freya — Winged Falcon Cloak, Crown & Glowing Golden Chalice
      // Wide carved stone falcon wings
      ctx.fillStyle = rgbStr(stoneDark);
      ctx.beginPath();
      ctx.moveTo(sx - 12, baseY - 68);
      ctx.lineTo(sx - 66, baseY - 102);
      ctx.lineTo(sx - 56, baseY - 58);
      ctx.lineTo(sx - 16, baseY - 40);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx + 12, baseY - 68);
      ctx.lineTo(sx + 66, baseY - 102);
      ctx.lineTo(sx + 56, baseY - 58);
      ctx.lineTo(sx + 16, baseY - 40);
      ctx.closePath();
      ctx.fill();
      // Wing feather highlights
      ctx.fillStyle = rgbStr(stoneLight, 0.5);
      ctx.fillRect(sx - 56, baseY - 92, 24, 2);
      ctx.fillRect(sx - 48, baseY - 82, 22, 2);
      ctx.fillRect(sx + 32, baseY - 92, 24, 2);
      ctx.fillRect(sx + 26, baseY - 82, 22, 2);
      // Draped robe & crowned head
      ctx.fillStyle = rgbStr(stoneMid);
      ctx.fillRect(sx - 15, baseY - 78, 30, 56);
      ctx.fillRect(sx - 9, baseY - 98, 18, 20);
      // Moss draping shoulders & golden floral crown
      ctx.fillStyle = 'rgba(72, 152, 76, 0.65)';
      ctx.fillRect(sx - 16, baseY - 76, 32, 6);
      ctx.fillStyle = '#efc462';
      ctx.fillRect(sx - 10, baseY - 103, 20, 4);
      ctx.fillRect(sx - 2, baseY - 109, 4, 6);
      // Radiant golden amber chalice held before chest
      ctx.fillStyle = `rgba(255, 224, 118, ${(0.5 + pulse * 0.45).toFixed(2)})`;
      ctx.fillRect(sx - 5, baseY - 66, 10, 8);
      ctx.fillRect(sx - 2, baseY - 58, 4, 5);
    } else if (god === 'thor') {
      // Ilha III: Colossal Statue of Thor — Bearded Thunder God raising Mjölnir to the Storm Sky
      ctx.fillStyle = rgbStr(stoneMid);
      ctx.fillRect(sx - 20, baseY - 82, 40, 60); // Broad armored torso
      ctx.fillRect(sx - 12, baseY - 102, 24, 20); // Head & helmet
      // Winged thunder helm
      ctx.fillStyle = rgbStr(stoneLight);
      ctx.fillRect(sx - 18, baseY - 106, 6, 10);
      ctx.fillRect(sx + 12, baseY - 106, 6, 10);
      // Flowing braided beard
      ctx.fillStyle = rgbStr(stoneDark);
      ctx.fillRect(sx - 8, baseY - 84, 16, 16);
      // Raised right arm holding colossal Mjölnir!
      ctx.fillStyle = rgbStr(stoneMid);
      ctx.fillRect(sx + 16, baseY - 114, 10, 38);
      ctx.fillStyle = rgbStr(stoneLight);
      ctx.fillRect(sx + 18, baseY - 126, 6, 16); // Handle
      ctx.fillStyle = rgbStr(stoneDark);
      ctx.fillRect(sx + 4, baseY - 142, 34, 18); // Giant Hammer Head
      ctx.fillStyle = rgbStr(stoneLight, 0.8);
      ctx.fillRect(sx + 6, baseY - 140, 30, 3);
      // Periodic crackling blue-gold lightning around Mjölnir
      if (Math.sin(w.elapsed * 3.8) > 0.55) {
        ctx.fillStyle = '#9cf2ff';
        ctx.fillRect(sx + 20, baseY - 156, 2, 14);
        ctx.fillRect(sx + 16, baseY - 148, 8, 2);
        ctx.fillRect(sx + 38, baseY - 136, 10, 2);
      }
      ctx.fillStyle = `rgba(148, 224, 255, ${(0.35 + pulse * 0.45).toFixed(2)})`;
      ctx.fillRect(sx + 14, baseY - 135, 14, 4);
    } else if (god === 'odin') {
      // Ilha IV: Colossal Statue of Odin — Hooded Allfather, Spear Gungnir & Twin Ravens Huginn/Muninn
      ctx.fillStyle = rgbStr(stoneMid);
      ctx.beginPath();
      ctx.moveTo(sx - 24, baseY - 22);
      ctx.lineTo(sx - 18, baseY - 94);
      ctx.lineTo(sx, baseY - 114);
      ctx.lineTo(sx + 18, baseY - 94);
      ctx.lineTo(sx + 24, baseY - 22);
      ctx.closePath();
      ctx.fill();
      // Deep shadow inside hood
      ctx.fillStyle = rgbStr(stoneDark);
      ctx.fillRect(sx - 9, baseY - 98, 18, 16);
      // Single glowing cyan all-seeing eye!
      ctx.fillStyle = `rgba(124, 247, 255, ${(0.6 + pulse * 0.4).toFixed(2)})`;
      ctx.fillRect(sx + 2, baseY - 92, 4, 3);
      // Tall glacial spear Gungnir standing beside him
      ctx.fillStyle = rgbStr(stoneLight);
      ctx.fillRect(sx - 26, baseY - 134, 4, 112);
      ctx.beginPath();
      ctx.moveTo(sx - 24, baseY - 148);
      ctx.lineTo(sx - 30, baseY - 132);
      ctx.lineTo(sx - 18, baseY - 132);
      ctx.closePath();
      ctx.fill();
      // Huginn & Muninn silhouette ravens perched on shoulders
      ctx.fillStyle = '#0c1524';
      ctx.fillRect(sx - 21, baseY - 90, 7, 5);
      ctx.fillRect(sx - 23, baseY - 92, 3, 3);
      ctx.fillRect(sx + 15, baseY - 90, 7, 5);
      ctx.fillRect(sx + 20, baseY - 92, 3, 3);
    } else if (god === 'loki') {
      // Ilha V: Colossal Statue of Loki — Curved Horned Crown & Twin Coiling Serpents
      ctx.fillStyle = rgbStr(stoneMid);
      ctx.fillRect(sx - 15, baseY - 82, 30, 60);
      ctx.fillRect(sx - 9, baseY - 102, 18, 20);
      // Iconic sweeping curved Loki horns
      ctx.fillStyle = rgbStr(stoneLight);
      ctx.fillRect(sx - 16, baseY - 114, 5, 16);
      ctx.fillRect(sx - 22, baseY - 124, 6, 12);
      ctx.fillRect(sx + 11, baseY - 114, 5, 16);
      ctx.fillRect(sx + 16, baseY - 124, 6, 12);
      // Twin stone serpents coiling around the plinth with emerald eyes
      ctx.fillStyle = rgbStr(stoneDark);
      ctx.fillRect(sx - 32, baseY - 66, 14, 42);
      ctx.fillRect(sx + 18, baseY - 66, 14, 42);
      ctx.fillStyle = `rgba(92, 245, 168, ${(0.5 + pulse * 0.45).toFixed(2)})`;
      ctx.fillRect(sx - 28, baseY - 60, 4, 3);
      ctx.fillRect(sx + 24, baseY - 60, 4, 3);
      ctx.fillRect(sx - 4, baseY - 94, 3, 2);
      ctx.fillRect(sx + 2, baseY - 94, 3, 2);
    } else if (god === 'nidavellir_smith') {
      // Ilha VI: Colossal Dwarven Master Smith Brokkr — Braided Beard, Titanic Hammer & Blazing Furnace Chest
      ctx.fillStyle = rgbStr(stoneMid);
      ctx.fillRect(sx - 26, baseY - 80, 52, 58);
      ctx.fillRect(sx - 15, baseY - 102, 30, 22);
      // Broad dwarven crown & twin braided beard columns
      ctx.fillStyle = '#d49a4a';
      ctx.fillRect(sx - 16, baseY - 107, 32, 5);
      ctx.fillStyle = rgbStr(stoneLight);
      ctx.fillRect(sx - 12, baseY - 82, 8, 28);
      ctx.fillRect(sx + 4, baseY - 82, 8, 28);
      // Blazing furnace heart built into the statue's chest!
      ctx.fillStyle = `rgba(255, 128, 38, ${(0.55 + pulse * 0.4).toFixed(2)})`;
      ctx.fillRect(sx - 8, baseY - 58, 16, 16);
      ctx.fillStyle = `rgba(255, 226, 118, ${(0.7 + pulse * 0.3).toFixed(2)})`;
      ctx.fillRect(sx - 4, baseY - 54, 8, 10);
      // Resting giant forge hammer on the right
      ctx.fillStyle = rgbStr(stoneDark);
      ctx.fillRect(sx + 24, baseY - 96, 8, 74);
      ctx.fillRect(sx + 14, baseY - 110, 28, 16);
    } else if (god === 'surtr') {
      // Ilha VII: Colossal Fire Giant Surtr — Obsidian Horns & Towering Blazing Molten Sword
      ctx.fillStyle = rgbStr(stoneDark);
      ctx.fillRect(sx - 22, baseY - 86, 44, 64);
      ctx.fillRect(sx - 13, baseY - 108, 26, 22);
      // Giant curved demon/fire-giant horns
      ctx.fillRect(sx - 22, baseY - 120, 8, 18);
      ctx.fillRect(sx - 28, baseY - 130, 8, 14);
      ctx.fillRect(sx + 14, baseY - 120, 8, 18);
      ctx.fillRect(sx + 20, baseY - 130, 8, 14);
      // Burning eyes & magma cracks across torso
      ctx.fillStyle = `rgba(255, 96, 36, ${(0.65 + pulse * 0.35).toFixed(2)})`;
      ctx.fillRect(sx - 6, baseY - 98, 4, 3);
      ctx.fillRect(sx + 3, baseY - 98, 4, 3);
      ctx.fillRect(sx - 10, baseY - 68, 20, 3);
      ctx.fillRect(sx - 6, baseY - 52, 12, 3);
      // Colossal flaming sword thrust toward the sky!
      ctx.fillStyle = '#ff6a26';
      ctx.fillRect(sx + 22, baseY - 148, 8, 92);
      ctx.fillStyle = '#ffe07d';
      ctx.fillRect(sx + 24, baseY - 144, 4, 84);
      ctx.fillStyle = rgbStr(stoneMid);
      ctx.fillRect(sx + 14, baseY - 60, 24, 6);
    } else if (god === 'ymir') {
      // Ilha VIII: Colossal Frost Giant Ymir — Seated on Ancient Glacier Throne with Jagged Ice Crown
      // Massive glacier throne backrest
      ctx.fillStyle = rgbStr(stoneDark);
      ctx.fillRect(sx - 38, baseY - 116, 76, 94);
      ctx.fillStyle = rgbStr(stoneLight, 0.72);
      ctx.beginPath();
      ctx.moveTo(sx - 38, baseY - 116);
      ctx.lineTo(sx - 24, baseY - 134);
      ctx.lineTo(sx - 10, baseY - 116);
      ctx.lineTo(sx, baseY - 142);
      ctx.lineTo(sx + 10, baseY - 116);
      ctx.lineTo(sx + 24, baseY - 134);
      ctx.lineTo(sx + 38, baseY - 116);
      ctx.closePath();
      ctx.fill();
      // Titanic frost giant silhouette seated within
      ctx.fillStyle = rgbStr(stoneMid);
      ctx.fillRect(sx - 20, baseY - 84, 40, 62);
      ctx.fillRect(sx - 12, baseY - 104, 24, 20);
      ctx.fillStyle = `rgba(140, 238, 255, ${(0.5 + pulse * 0.45).toFixed(2)})`;
      ctx.fillRect(sx - 6, baseY - 96, 4, 3);
      ctx.fillRect(sx + 3, baseY - 96, 4, 3);
    } else {
      // Ilha IX: Colossal Golden-Marble Heimdall & Gates of Asgard
      // Twin golden celestial archway pillars
      ctx.fillStyle = lerpRGB({ r: 198, g: 172, b: 108 }, { r: 78, g: 68, b: 96 }, nightFactor)
        ? rgbStr(lerpRGB({ r: 198, g: 172, b: 108 }, { r: 78, g: 68, b: 96 }, nightFactor))
        : '#c6ac6c';
      ctx.fillRect(sx - 44, baseY - 118, 12, 96);
      ctx.fillRect(sx + 32, baseY - 118, 12, 96);
      ctx.fillRect(sx - 48, baseY - 126, 96, 10);
      // Radiant golden portal shimmer behind Heimdall
      ctx.fillStyle = `rgba(255, 232, 138, ${(0.18 + pulse * 0.22).toFixed(2)})`;
      ctx.fillRect(sx - 32, baseY - 116, 64, 92);
      // Guardian Heimdall with horned golden helm & raised Gjallarhorn!
      ctx.fillStyle = rgbStr(stoneLight);
      ctx.fillRect(sx - 14, baseY - 82, 28, 60);
      ctx.fillRect(sx - 9, baseY - 102, 18, 20);
      ctx.fillStyle = '#ffe58a';
      ctx.fillRect(sx - 15, baseY - 110, 4, 12);
      ctx.fillRect(sx + 11, baseY - 110, 4, 12);
      // Gjallarhorn lifted triumphantly
      ctx.fillRect(sx + 12, baseY - 98, 14, 5);
      ctx.fillRect(sx + 24, baseY - 102, 6, 10);
    }

    ctx.restore();
  }

  private drawParallaxForest(
    ctx: CanvasRenderingContext2D,
    _w: WorldState,
    camX: number,
    nightFactor: number,
    theme: IslandTheme
  ): void {
    const pineCol = lerpRGB(theme.forestFarDay, { r: 9, g: 16, b: 25 }, nightFactor);
    const style = theme.vegetationStyle;
    const step = style === 'lush_vale' || style === 'golden_yggdrasil' ? 24 : 20;
    const forestScroll = Math.floor(camX * 0.5);
    const forestBaseIdx = Math.floor(forestScroll / step);
    const off = ((forestScroll % step) + step) % step;

    ctx.fillStyle = rgbStr(pineCol);
    for (let i = -1; i < Math.ceil(this.viewW / step) + 2; i++) {
      const worldIdx = forestBaseIdx + i;
      const tx = i * step - off;
      const h = 24 + (Math.abs(worldIdx * 13 + 5) % 4) * 7;
      const topY = GROUND_Y - h;

      if (style === 'lush_vale' || style === 'golden_yggdrasil') {
        // Broad rounded ancient oaks / golden Yggdrasil canopies
        ctx.fillRect(tx + 10, topY + 6, 4, h - 6);
        ctx.fillRect(tx + 2, topY + 2, 20, 10);
        ctx.fillRect(tx + 5, topY - 4, 14, 8);
      } else if (style === 'ash_deadwood') {
        // Stark jagged volcanic deadwood spires
        ctx.fillRect(tx + 8, topY, 3, h);
        ctx.fillRect(tx + 3, topY + 6, 6, 2);
        ctx.fillRect(tx + 11, topY + 10, 6, 2);
      } else {
        ctx.fillRect(tx + 8, topY, 3, h);
        ctx.beginPath();
        ctx.moveTo(tx + 9, topY - 4);
        ctx.lineTo(tx, GROUND_Y - 4);
        ctx.lineTo(tx + 19, GROUND_Y - 4);
        ctx.closePath();
        ctx.fill();
      }
    }

    const mc = theme.mistColor;
    const mistGrad = ctx.createLinearGradient(0, GROUND_Y - 28, 0, GROUND_Y);
    mistGrad.addColorStop(0, `rgba(${mc.r}, ${mc.g}, ${mc.b}, 0)`);
    mistGrad.addColorStop(1, `rgba(${mc.r}, ${mc.g}, ${mc.b}, ${lerp(0.2, 0.06, nightFactor).toFixed(2)})`);
    ctx.fillStyle = mistGrad;
    ctx.fillRect(0, GROUND_Y - 28, this.viewW, 28);
  }

  // =========================================================================
  // ENVIRONMENTAL STORYTELLING LANDMARKS (Silent History Across Each Island!)
  // =========================================================================
  private drawStorytellingScenery(
    ctx: CanvasRenderingContext2D,
    w: WorldState,
    camX: number,
    nightFactor: number,
    theme: IslandTheme
  ): void {
    const mapW = getWorldWidth(w);
    const cxWorld = getCenterX(w);
    const isl = w.currentIsland;
    const stoneCol = rgbStr(lerpRGB(theme.cliffRockDay, { r: 22, g: 30, b: 42 }, nightFactor));
    const stoneHi = rgbStr(lerpRGB(theme.mountainCapDay, { r: 58, g: 72, b: 92 }, nightFactor), 0.6);
    const woodCol = rgbStr(lerpRGB({ r: 86, g: 62, b: 44 }, { r: 24, g: 20, b: 24 }, nightFactor));

    // Deterministic world-space lore landmarks spaced cleanly outside the immediate town hall
    const spacing = 420;
    for (let wx = 340; wx <= mapW - 340; wx += spacing) {
      if (Math.abs(wx - cxWorld) < 260) continue;
      const sx = Math.round(wx - camX);
      if (sx < -60 || sx > this.viewW + 60) continue;
      const variant = Math.abs(Math.floor(wx / spacing) + isl) % 3;

      if (isl === 1) {
        // Midgard: Viking landing cairns, mossy stone arch, weathered old runestone
        if (variant === 0) {
          ctx.fillStyle = stoneCol;
          ctx.fillRect(sx - 8, GROUND_Y - 12, 16, 12);
          ctx.fillRect(sx - 5, GROUND_Y - 20, 10, 8);
          ctx.fillRect(sx - 3, GROUND_Y - 25, 6, 5);
        } else if (variant === 1) {
          ctx.fillStyle = stoneCol;
          ctx.fillRect(sx - 14, GROUND_Y - 24, 5, 24);
          ctx.fillRect(sx + 9, GROUND_Y - 24, 5, 24);
          ctx.fillRect(sx - 16, GROUND_Y - 29, 32, 6);
          ctx.fillStyle = 'rgba(72, 138, 72, 0.55)';
          ctx.fillRect(sx - 14, GROUND_Y - 30, 28, 2);
        } else {
          ctx.fillStyle = stoneCol;
          ctx.fillRect(sx - 5, GROUND_Y - 26, 10, 26);
          ctx.fillStyle = 'rgba(124, 247, 255, 0.45)';
          ctx.fillRect(sx - 1, GROUND_Y - 21, 2, 12);
        }
      } else if (isl === 2) {
        // Vale de Freya: Overgrown flower dolmens, ancient battle shields, offering arches
        if (variant === 0) {
          ctx.fillStyle = stoneCol;
          ctx.fillRect(sx - 14, GROUND_Y - 20, 6, 20);
          ctx.fillRect(sx + 8, GROUND_Y - 20, 6, 20);
          ctx.fillRect(sx - 18, GROUND_Y - 26, 36, 7);
          ctx.fillStyle = '#f5a8c8';
          ctx.fillRect(sx - 12, GROUND_Y - 28, 4, 2);
          ctx.fillRect(sx + 6, GROUND_Y - 28, 4, 2);
        } else if (variant === 1) {
          // Ancient planted Viking shields & spear from past battle
          ctx.fillStyle = woodCol;
          ctx.fillRect(sx - 1, GROUND_Y - 26, 2, 26);
          ctx.fillStyle = '#5c9c6b';
          ctx.fillRect(sx - 9, GROUND_Y - 12, 12, 12);
          ctx.fillStyle = '#efc462';
          ctx.fillRect(sx - 5, GROUND_Y - 8, 4, 4);
        } else {
          ctx.fillStyle = stoneCol;
          ctx.fillRect(sx - 8, GROUND_Y - 16, 16, 16);
          ctx.fillStyle = '#ffe58a';
          ctx.fillRect(sx - 4, GROUND_Y - 19, 8, 3);
        }
      } else if (isl === 3) {
        // Picos do Trovão: Lightning-split giant stump, warrior oath stones, cracked shields
        if (variant === 0) {
          ctx.fillStyle = woodCol;
          ctx.fillRect(sx - 8, GROUND_Y - 18, 16, 18);
          ctx.fillRect(sx - 10, GROUND_Y - 24, 6, 8);
          ctx.fillRect(sx + 4, GROUND_Y - 22, 5, 6);
        } else if (variant === 1) {
          ctx.fillStyle = stoneCol;
          ctx.fillRect(sx - 12, GROUND_Y - 30, 7, 30);
          ctx.fillRect(sx + 4, GROUND_Y - 22, 7, 22);
          ctx.fillStyle = `rgba(146, 218, 255, ${(0.35 + 0.35 * Math.sin(w.elapsed * 3 + wx)).toFixed(2)})`;
          ctx.fillRect(sx - 9, GROUND_Y - 24, 2, 14);
        } else {
          ctx.fillStyle = '#8e98ad';
          ctx.fillRect(sx - 10, GROUND_Y - 10, 20, 10);
          ctx.fillStyle = '#ffd15c';
          ctx.fillRect(sx - 2, GROUND_Y - 22, 4, 14);
        }
      } else if (isl === 4) {
        // Fiorde Glacial: Half-buried frozen Drakkar wreck, whalebone arch, frozen spears
        if (variant === 0) {
          // Tilted frozen Viking shipwreck hull!
          ctx.fillStyle = woodCol;
          ctx.beginPath();
          ctx.moveTo(sx - 22, GROUND_Y);
          ctx.lineTo(sx - 16, GROUND_Y - 14);
          ctx.lineTo(sx + 18, GROUND_Y - 6);
          ctx.lineTo(sx + 24, GROUND_Y);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = stoneHi;
          ctx.fillRect(sx - 14, GROUND_Y - 14, 18, 3);
        } else if (variant === 1) {
          // Giant curved whalebone ribs arch
          ctx.fillStyle = stoneHi;
          ctx.fillRect(sx - 16, GROUND_Y - 24, 3, 24);
          ctx.fillRect(sx - 13, GROUND_Y - 28, 10, 3);
          ctx.fillRect(sx + 13, GROUND_Y - 24, 3, 24);
          ctx.fillRect(sx + 3, GROUND_Y - 28, 10, 3);
        } else {
          ctx.fillStyle = '#8ad6f5';
          ctx.fillRect(sx - 6, GROUND_Y - 28, 12, 28);
          ctx.fillStyle = '#e8f9ff';
          ctx.fillRect(sx - 4, GROUND_Y - 26, 3, 22);
        }
      } else if (isl === 5) {
        // Bosque de Fenrir: Broken chains of Fenrir anchored to boulders, leaning misty tower, wolf totem
        if (variant === 0) {
          ctx.fillStyle = stoneCol;
          ctx.fillRect(sx - 14, GROUND_Y - 16, 28, 16);
          ctx.fillStyle = '#485463';
          for (let c = 0; c < 5; c++) {
            ctx.fillRect(sx - 12 + c * 6, GROUND_Y - 20 - (c % 2) * 3, 4, 4);
          }
        } else if (variant === 1) {
          // Ruined leaning watchtower in the fog
          ctx.fillStyle = stoneCol;
          ctx.fillRect(sx - 9, GROUND_Y - 38, 18, 38);
          ctx.fillRect(sx - 11, GROUND_Y - 42, 6, 5);
          ctx.fillRect(sx + 5, GROUND_Y - 40, 6, 4);
          ctx.fillStyle = `rgba(104, 242, 178, ${(0.35 + 0.35 * Math.sin(w.elapsed * 2 + wx)).toFixed(2)})`;
          ctx.fillRect(sx - 2, GROUND_Y - 28, 4, 6);
        } else {
          ctx.fillStyle = stoneCol;
          ctx.fillRect(sx - 6, GROUND_Y - 26, 12, 26);
          ctx.fillRect(sx - 8, GROUND_Y - 30, 4, 5);
          ctx.fillRect(sx + 4, GROUND_Y - 30, 4, 5);
        }
      } else if (isl === 6) {
        // Forjas de Nidavellir: Dwarven stone aqueduct arches, giant cracked anvil, glowing vents
        if (variant === 0) {
          ctx.fillStyle = stoneCol;
          ctx.fillRect(sx - 20, GROUND_Y - 34, 7, 34);
          ctx.fillRect(sx + 13, GROUND_Y - 34, 7, 34);
          ctx.fillRect(sx - 24, GROUND_Y - 40, 48, 8);
          ctx.fillStyle = '#d49a4a';
          ctx.fillRect(sx - 22, GROUND_Y - 38, 44, 2);
        } else if (variant === 1) {
          // Colossal ancient anvil monument
          ctx.fillStyle = '#383238';
          ctx.fillRect(sx - 10, GROUND_Y - 12, 20, 12);
          ctx.fillRect(sx - 16, GROUND_Y - 20, 32, 8);
          ctx.fillStyle = '#ff9c42';
          ctx.fillRect(sx - 8, GROUND_Y - 21, 16, 2);
        } else {
          ctx.fillStyle = stoneCol;
          ctx.fillRect(sx - 10, GROUND_Y - 18, 20, 18);
          ctx.fillStyle = `rgba(255, 148, 54, ${(0.45 + 0.35 * Math.sin(w.elapsed * 3 + wx)).toFixed(2)})`;
          ctx.fillRect(sx - 4, GROUND_Y - 12, 8, 8);
        }
      } else if (isl === 7) {
        // Muspelheim: Charred ship ribs, obsidian sword monoliths, glowing lava crack
        if (variant === 0) {
          ctx.fillStyle = '#261b1e';
          for (let r = -2; r <= 2; r++) {
            ctx.fillRect(sx + r * 6, GROUND_Y - 16 + Math.abs(r) * 2, 2, 16 - Math.abs(r) * 2);
          }
          ctx.fillRect(sx - 16, GROUND_Y - 3, 32, 3);
        } else if (variant === 1) {
          ctx.fillStyle = '#22171d';
          ctx.fillRect(sx - 4, GROUND_Y - 34, 8, 34);
          ctx.fillRect(sx - 10, GROUND_Y - 24, 20, 4);
          ctx.fillStyle = `rgba(255, 102, 42, ${(0.5 + 0.4 * Math.sin(w.elapsed * 4 + wx)).toFixed(2)})`;
          ctx.fillRect(sx - 1, GROUND_Y - 30, 2, 22);
        } else {
          ctx.fillStyle = '#ff6a26';
          ctx.fillRect(sx - 12, GROUND_Y - 3, 24, 2);
          ctx.fillStyle = '#ffe07d';
          ctx.fillRect(sx - 6, GROUND_Y - 3, 12, 1);
        }
      } else if (isl === 8) {
        // Abismo de Jotunheim: Colossal frost-giant ribcage, shattered ice bridge pillars, giant frozen axe
        if (variant === 0) {
          ctx.fillStyle = stoneHi;
          for (let r = -2; r <= 2; r++) {
            const rx = sx + r * 8;
            ctx.fillRect(rx, GROUND_Y - 26, 3, 26);
            ctx.fillRect(rx - 2, GROUND_Y - 28, 7, 3);
          }
        } else if (variant === 1) {
          ctx.fillStyle = stoneCol;
          ctx.fillRect(sx - 12, GROUND_Y - 38, 10, 38);
          ctx.fillRect(sx + 8, GROUND_Y - 26, 10, 26);
          ctx.fillStyle = stoneHi;
          ctx.fillRect(sx - 12, GROUND_Y - 38, 10, 3);
        } else {
          // Colossal frost-giant axe embedded in the permafrost
          ctx.fillStyle = woodCol;
          ctx.fillRect(sx - 2, GROUND_Y - 34, 4, 34);
          ctx.fillStyle = '#92d6f5';
          ctx.fillRect(sx + 2, GROUND_Y - 32, 12, 14);
        }
      } else {
        // Portões de Asgard: Golden marble colonnades, luminous crystal obelisks, sunlit temple arches
        if (variant === 0) {
          ctx.fillStyle = '#d9c58e';
          ctx.fillRect(sx - 16, GROUND_Y - 36, 6, 36);
          ctx.fillRect(sx + 10, GROUND_Y - 36, 6, 36);
          ctx.fillRect(sx - 20, GROUND_Y - 41, 40, 6);
          ctx.fillStyle = '#fff5bd';
          ctx.fillRect(sx - 18, GROUND_Y - 40, 36, 2);
        } else if (variant === 1) {
          ctx.fillStyle = '#ffe58a';
          ctx.fillRect(sx - 4, GROUND_Y - 32, 8, 32);
          ctx.fillStyle = `rgba(148, 240, 255, ${(0.55 + 0.4 * Math.sin(w.elapsed * 3 + wx)).toFixed(2)})`;
          ctx.fillRect(sx - 2, GROUND_Y - 26, 4, 18);
        } else {
          ctx.fillStyle = '#d9c58e';
          ctx.fillRect(sx - 10, GROUND_Y - 18, 20, 18);
          ctx.fillStyle = '#ffe58a';
          ctx.fillRect(sx - 6, GROUND_Y - 22, 12, 4);
        }
      }
    }
  }

  private drawGround(
    ctx: CanvasRenderingContext2D,
    w: WorldState,
    camX: number,
    nightFactor: number,
    theme: IslandTheme
  ): void {
    const season = w.season ?? 'summer';
    // Blend each island's distinct biome ground palette with the active season!
    const seasonGrass =
      season === 'winter'
        ? lerpRGB(theme.grassDay, { r: 196, g: 218, b: 232 }, 0.62)
        : season === 'autumn'
          ? lerpRGB(theme.grassDay, { r: 162, g: 114, b: 56 }, 0.48)
          : season === 'spring'
            ? lerpRGB(theme.grassDay, { r: 96, g: 166, b: 92 }, 0.35)
            : theme.grassDay;
    const seasonAccent =
      season === 'winter'
        ? lerpRGB(theme.grassAccentDay, { r: 232, g: 244, b: 252 }, 0.68)
        : season === 'autumn'
          ? lerpRGB(theme.grassAccentDay, { r: 212, g: 132, b: 52 }, 0.45)
          : theme.grassAccentDay;

    const grassTop = lerpRGB(seasonGrass, { r: 24, g: 38, b: 46 }, nightFactor);
    const accentEdge = lerpRGB(seasonAccent, { r: 66, g: 90, b: 108 }, nightFactor);
    const soil = lerpRGB(theme.soilDay, { r: 17, g: 17, b: 24 }, nightFactor);
    const stoneBank = lerpRGB(theme.cliffRockDay, { r: 22, g: 30, b: 40 }, nightFactor);

    ctx.fillStyle = rgbStr(grassTop);
    ctx.fillRect(0, GROUND_Y - 2, this.viewW, 3);
    ctx.fillStyle = rgbStr(soil);
    ctx.fillRect(0, GROUND_Y + 1, this.viewW, 4);
    ctx.fillStyle = rgbStr(stoneBank);
    ctx.fillRect(0, GROUND_Y + 4, this.viewW, 2);

    const startTile = Math.floor(camX / 24);
    for (let tile = startTile; tile <= startTile + Math.ceil(this.viewW / 24) + 1; tile++) {
      const sx = tile * 24 - camX;
      if (Math.abs(tile * 7) % 3 === 0) {
        ctx.fillStyle = rgbStr(accentEdge);
        ctx.fillRect(sx + 2, GROUND_Y - 2, season === 'winter' ? 14 : 10, 2);
      }
      if (Math.abs(tile * 11) % 4 === 0) {
        ctx.fillStyle = rgbStr(grassTop);
        ctx.fillRect(sx + 14, GROUND_Y - 4, 2, 2);
        ctx.fillRect(sx + 17, GROUND_Y - 3, 1, 2);
        if (season === 'spring' || w.currentIsland === 2 || w.currentIsland === 9) {
          ctx.fillStyle = w.currentIsland === 9 ? '#ffe58a' : Math.abs(tile) % 2 === 0 ? '#f7b2d4' : '#ffe588';
          ctx.fillRect(sx + 14, GROUND_Y - 5, 2, 1);
        }
      }
    }
  }

  // =========================================================================
  // NATURAL MAP BOUNDARIES: WESTERN BEACH / OCEAN (LEFT) & MOUNTAIN WALL (RIGHT)
  // =========================================================================
  private drawWorldEdges(
    ctx: CanvasRenderingContext2D,
    w: WorldState,
    camX: number,
    nightFactor: number,
    theme: IslandTheme
  ): void {
    const mapW = getWorldWidth(w);

    // 1. LEFT EDGE (x = 0..230): PRAIA / COSTA DO MAR (Beach sloping into animated ocean surf!)
    const beachEndSX = Math.round(230 - camX);
    if (beachEndSX > -20) {
      const sandMain = lerpRGB(theme.beachSandDay, { r: 46, g: 52, b: 64 }, nightFactor);
      const sandLight = lerpRGB(
        {
          r: Math.min(255, theme.beachSandDay.r + 24),
          g: Math.min(255, theme.beachSandDay.g + 22),
          b: Math.min(255, theme.beachSandDay.b + 18),
        },
        { r: 72, g: 82, b: 96 },
        nightFactor
      );
      const oceanCol = lerpRGB(theme.waterTintDay, { r: 8, g: 16, b: 28 }, nightFactor);
      const foamCol = rgbStr(lerpRGB({ r: 232, g: 248, b: 255 }, { r: 102, g: 134, b: 162 }, nightFactor), 0.85);
      const rockCol = rgbStr(lerpRGB(theme.cliffRockDay, { r: 22, g: 30, b: 42 }, nightFactor));

      // Sandy beach stretch from x = 115..230 blending smoothly into grass
      const sandLeft = Math.round(108 - camX);
      const sandW = Math.max(0, beachEndSX - sandLeft);
      ctx.fillStyle = rgbStr(sandMain);
      ctx.fillRect(sandLeft, GROUND_Y - 2, sandW, 6);
      ctx.fillStyle = rgbStr(sandLight);
      ctx.fillRect(sandLeft + 10, GROUND_Y - 3, Math.max(0, sandW - 24), 2);

      // Open ocean sea water from x = 0..145 with animated rolling surf waves!
      const seaRight = Math.round(146 - camX);
      if (seaRight > 0) {
        ctx.fillStyle = rgbStr(oceanCol);
        ctx.fillRect(0, GROUND_Y - 2, seaRight, 9);
        const waveShift = Math.round(Math.sin(w.elapsed * 2.4) * 5);
        ctx.fillStyle = foamCol;
        ctx.fillRect(Math.max(0, seaRight - 14 + waveShift), GROUND_Y - 2, 16, 2);
        ctx.fillRect(Math.max(0, seaRight - 36 - waveShift), GROUND_Y - 1, 14, 1);
        ctx.fillRect(Math.max(0, seaRight - 68 + waveShift), GROUND_Y - 2, 18, 2);
      }

      // Coastal sea rocks, driftwood & weathered shore post marking the Western Beach
      const rx1 = Math.round(126 - camX);
      ctx.fillStyle = rockCol;
      ctx.fillRect(rx1 - 8, GROUND_Y - 8, 16, 9);
      ctx.fillRect(rx1 - 5, GROUND_Y - 12, 10, 5);
      const rx2 = Math.round(166 - camX);
      ctx.fillStyle = '#5c4430';
      ctx.fillRect(rx2 - 6, GROUND_Y - 4, 14, 3);
      ctx.fillRect(rx2 - 2, GROUND_Y - 11, 2, 9);
      // Tall sea stack rising out of the western ocean
      const stackX = Math.round(58 - camX);
      if (stackX > -40) {
        ctx.fillStyle = rockCol;
        ctx.beginPath();
        ctx.moveTo(stackX - 24, GROUND_Y + 2);
        ctx.lineTo(stackX - 14, GROUND_Y - 38);
        ctx.lineTo(stackX + 4, GROUND_Y - 48);
        ctx.lineTo(stackX + 18, GROUND_Y - 24);
        ctx.lineTo(stackX + 26, GROUND_Y + 2);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 2. RIGHT EDGE (x = mapW - 225..mapW): MURALHA DE MONTANHAS / PENHASCO (Impassable Towering Cliff!)
    const cliffStartSX = Math.round(mapW - 225 - camX);
    if (cliffStartSX < this.viewW + 20) {
      const cliffDark = lerpRGB(theme.midRidgeDay, theme.midRidgeNight, nightFactor);
      const cliffMid = lerpRGB(theme.cliffRockDay, { r: 22, g: 30, b: 44 }, nightFactor);
      const cliffLight = lerpRGB(theme.mountainCapDay, theme.mountainCapNight, nightFactor);
      const rightEdge = this.viewW + 40;

      // Towering sheer mountain cliff face closing the Eastern end of the island
      ctx.fillStyle = rgbStr(cliffDark);
      ctx.beginPath();
      ctx.moveTo(cliffStartSX + 26, GROUND_Y + 4);
      ctx.lineTo(cliffStartSX + 42, GROUND_Y - 54);
      ctx.lineTo(cliffStartSX + 62, GROUND_Y - 118);
      ctx.lineTo(cliffStartSX + 96, GROUND_Y - 172);
      ctx.lineTo(rightEdge, GROUND_Y - 185);
      ctx.lineTo(rightEdge, GROUND_Y + 6);
      ctx.closePath();
      ctx.fill();

      // Craggy mid-rock ledges & carved cliff striations
      ctx.fillStyle = rgbStr(cliffMid);
      ctx.beginPath();
      ctx.moveTo(cliffStartSX + 44, GROUND_Y + 4);
      ctx.lineTo(cliffStartSX + 58, GROUND_Y - 46);
      ctx.lineTo(cliffStartSX + 82, GROUND_Y - 98);
      ctx.lineTo(cliffStartSX + 118, GROUND_Y - 150);
      ctx.lineTo(rightEdge, GROUND_Y - 158);
      ctx.lineTo(rightEdge, GROUND_Y + 6);
      ctx.closePath();
      ctx.fill();

      // Highlight ridges / snow or lava trim along cliff ledges
      ctx.fillStyle = theme.hasVolcanoGlow
        ? `rgba(255, 118, 46, ${lerp(0.65, 0.85, nightFactor).toFixed(2)})`
        : rgbStr(cliffLight, 0.72);
      ctx.fillRect(cliffStartSX + 44, GROUND_Y - 52, 26, 3);
      ctx.fillRect(cliffStartSX + 64, GROUND_Y - 96, 34, 3);
      ctx.fillRect(cliffStartSX + 92, GROUND_Y - 138, 42, 4);

      // Foreground boulders at cliff foot blocking passage cleanly at x ≈ mapW - 165
      ctx.fillStyle = rgbStr(cliffMid);
      ctx.fillRect(cliffStartSX + 38, GROUND_Y - 18, 22, 20);
      ctx.fillRect(cliffStartSX + 54, GROUND_Y - 30, 26, 32);
      ctx.fillStyle = rgbStr(cliffDark);
      ctx.fillRect(cliffStartSX + 44, GROUND_Y - 12, 16, 14);
    }
  }

  private drawTrees(
    ctx: CanvasRenderingContext2D,
    w: WorldState,
    camX: number,
    nightFactor: number,
    theme: IslandTheme
  ): void {
    const season = w.season ?? 'summer';
    const vStyle = theme.vegetationStyle;
    const dayDark =
      season === 'autumn'
        ? lerpRGB(theme.treeDarkDay, { r: 122, g: 64, b: 32 }, 0.55)
        : season === 'winter'
          ? lerpRGB(theme.treeDarkDay, { r: 30, g: 56, b: 68 }, 0.5)
          : season === 'spring'
            ? lerpRGB(theme.treeDarkDay, { r: 36, g: 88, b: 52 }, 0.35)
            : theme.treeDarkDay;
    const dayMid =
      season === 'autumn'
        ? lerpRGB(theme.treeMidDay, { r: 176, g: 102, b: 42 }, 0.55)
        : season === 'winter'
          ? lerpRGB(theme.treeMidDay, { r: 48, g: 82, b: 92 }, 0.5)
          : season === 'spring'
            ? lerpRGB(theme.treeMidDay, { r: 58, g: 126, b: 70 }, 0.35)
            : theme.treeMidDay;
    const darkGreen = lerpRGB(dayDark, { r: 11, g: 22, b: 28 }, nightFactor);
    const midGreen = lerpRGB(dayMid, { r: 16, g: 31, b: 38 }, nightFactor);
    const snow = lerpRGB({ r: 218, g: 234, b: 244 }, { r: 72, g: 98, b: 118 }, nightFactor);

    for (const tr of w.trees) {
      const sx = Math.round(tr.x - camX);
      if (sx < -36 || sx > this.viewW + 36) continue;

      if (tr.chopped) {
        // Growing sapling while an idle Builder plants a new tree!
        if (tr.chopProgress > 0) {
          const sproutH = Math.max(3, Math.round(tr.chopProgress * 12));
          ctx.fillStyle = '#4d3625';
          ctx.fillRect(sx - 1, GROUND_Y - sproutH, 2, sproutH);
          ctx.fillStyle = rgbStr(dayMid);
          ctx.fillRect(sx - 3, GROUND_Y - sproutH - 2, 6, 3);
          ctx.fillStyle = rgbStr(theme.grassAccentDay);
          ctx.fillRect(sx - 1, GROUND_Y - sproutH - 3, 2, 2);
        }
        continue;
      }

      const shake = tr.hitShake > 0 ? Math.round(Math.sin(w.elapsed * 60) * 2) : 0;
      const sway = Math.round(Math.sin(w.elapsed * 1.1 + tr.swayOffset) * 1);
      const bx = sx + shake;
      const sz = tr.size ?? (tr.variant === 0 ? 'small' : tr.variant === 1 ? 'medium' : 'large');
      const trunkW = sz === 'large' ? 6 : sz === 'medium' ? 4 : 3;
      const trunkH = sz === 'large' ? 18 : sz === 'medium' ? 14 : 11;

      // Distinct bark tint per biome (white birch in Vale de Freya, charcoal in Muspel, golden oak in Asgard!)
      ctx.fillStyle =
        vStyle === 'lush_vale'
          ? '#8c7e70'
          : vStyle === 'ash_deadwood'
            ? '#2a2224'
            : vStyle === 'golden_yggdrasil'
              ? '#6e5232'
              : '#3d2c24';
      ctx.fillRect(bx - Math.floor(trunkW / 2), GROUND_Y - trunkH, trunkW, trunkH);

      const tiers = sz === 'large' ? 4 : sz === 'medium' ? 3 : 2;
      const baseHalfW = sz === 'large' ? 16 : sz === 'medium' ? 13 : 9;

      if (vStyle === 'lush_vale' || vStyle === 'golden_yggdrasil') {
        // Broad leafy Nordic birch / golden Yggdrasil canopy clusters!
        for (let tier = 0; tier < tiers; tier++) {
          const ty = GROUND_Y - trunkH - tier * Math.floor((tr.height - trunkH) / (tiers + 0.2));
          const cw = Math.max(10, Math.round((baseHalfW * 2.05) - tier * 4));
          const ch = sz === 'large' ? 12 : 10;
          const shift = Math.round((sway * (tier + 1)) / tiers);
          ctx.fillStyle = rgbStr(tier % 2 === 0 ? darkGreen : midGreen);
          ctx.fillRect(Math.round(bx + shift - cw / 2), Math.round(ty - ch), cw, ch);
          if (vStyle === 'golden_yggdrasil') {
            ctx.fillStyle = 'rgba(255, 232, 128, 0.45)';
            ctx.fillRect(Math.round(bx + shift - cw / 3), Math.round(ty - ch), Math.round(cw * 0.6), 2);
          } else if (season === 'winter') {
            ctx.fillStyle = rgbStr(snow, 0.85);
            ctx.fillRect(Math.round(bx + shift - cw / 2 + 2), Math.round(ty - ch), cw - 4, 2);
          }
        }
      } else {
        for (let tier = 0; tier < tiers; tier++) {
          const ty = GROUND_Y - (trunkH - 2) - tier * Math.floor((tr.height - trunkH) / tiers);
          const halfW = Math.max(4, baseHalfW - tier * 2.5);
          const topY = ty - (sz === 'large' ? 18 : sz === 'medium' ? 15 : 13);
          const shift = Math.round((sway * (tier + 1)) / tiers);

          ctx.fillStyle = rgbStr(tier % 2 === 0 ? darkGreen : midGreen);
          ctx.beginPath();
          ctx.moveTo(bx + shift, topY);
          ctx.lineTo(bx - halfW, ty);
          ctx.lineTo(bx + halfW, ty);
          ctx.closePath();
          ctx.fill();

          if (season === 'winter' || vStyle === 'frost_spruce' || vStyle === 'glacial_pine') {
            ctx.fillStyle = rgbStr(snow, 0.88);
            ctx.fillRect(bx + shift - 2, topY + 2, 4, 2);
            ctx.fillRect(bx + shift - Math.floor(halfW * 0.55), topY + 6, Math.floor(halfW * 0.5), 2);
          } else if (vStyle === 'ash_deadwood') {
            ctx.fillStyle = 'rgba(255, 118, 52, 0.55)';
            ctx.fillRect(bx + shift - 1, topY + 2, 2, 2);
          } else if (season === 'autumn' || vStyle === 'amber_cedar') {
            ctx.fillStyle = 'rgba(235, 165, 62, 0.65)';
            ctx.fillRect(bx + shift - 2, topY + 3, 4, 2);
          } else if (season === 'spring') {
            ctx.fillStyle = 'rgba(146, 224, 134, 0.55)';
            ctx.fillRect(bx + shift - 1, topY + 2, 3, 2);
          }
        }
      }

      if (tr.marked) {
        const bob = Math.round(Math.sin(w.elapsed * 6) * 1.5);
        ctx.fillStyle = '#f7d265';
        ctx.fillRect(bx - 3, GROUND_Y - 22 + bob, 6, 6);
        ctx.fillStyle = '#805212';
        ctx.fillRect(bx - 2, GROUND_Y - 21 + bob, 4, 4);
        ctx.fillStyle = '#fff3b8';
        ctx.fillRect(bx - 1, GROUND_Y - 20 + bob, 2, 2);

        if (tr.chopProgress > 0) {
          const workers = w.villagers.filter((v) => v.role === 'builder' && v.targetId === tr.id && Math.abs(v.x - tr.x) < 26).length;
          ctx.fillStyle = 'rgba(10,14,20,0.82)';
          ctx.fillRect(bx - 12, GROUND_Y - 31, 24, 4);
          ctx.fillStyle = '#7bd468';
          ctx.fillRect(bx - 11, GROUND_Y - 30, Math.max(1, Math.round(22 * Math.min(1, tr.chopProgress))), 2);
          if (workers > 1) {
            ctx.fillStyle = '#ffe58a';
            ctx.font = 'bold 6px "Pixelify Sans", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`x${workers}`, bx, GROUND_Y - 33);
            ctx.textAlign = 'left';
          }
        }
      }
    }
  }

  private drawRocks(ctx: CanvasRenderingContext2D, w: WorldState, camX: number, nightFactor: number): void {
    const stoneDark = lerpRGB({ r: 68, g: 78, b: 88 }, { r: 22, g: 28, b: 36 }, nightFactor);
    const stoneMid = lerpRGB({ r: 102, g: 114, b: 126 }, { r: 36, g: 46, b: 56 }, nightFactor);
    const snow = lerpRGB({ r: 215, g: 230, b: 240 }, { r: 75, g: 98, b: 118 }, nightFactor);

    for (const r of w.rocks) {
      const sx = Math.round(r.x - camX);
      if (sx < -28 || sx > this.viewW + 28) continue;

      if (r.mined) {
        // Rising stone outcrop while an idle Swordsman excavates a new rock!
        if (r.mineProgress > 0) {
          const riseH = Math.max(2, Math.round(r.mineProgress * 9));
          const riseW = Math.max(6, Math.round(6 + r.mineProgress * 8));
          ctx.fillStyle = rgbStr(stoneDark);
          ctx.fillRect(sx - Math.floor(riseW / 2), GROUND_Y - riseH, riseW, riseH);
          ctx.fillStyle = rgbStr(stoneMid);
          ctx.fillRect(sx - Math.floor(riseW / 2) + 1, GROUND_Y - riseH, Math.max(2, riseW - 2), Math.max(1, riseH - 1));
        }
        continue;
      }

      const shake = r.hitShake > 0 ? Math.round(Math.sin(w.elapsed * 60) * 2) : 0;
      const bx = sx + shake;
      const sz = r.size ?? (r.variant === 0 ? 'small' : r.variant === 1 ? 'medium' : 'large');
      // Visually distinct Small (P), Medium (M), Large (G) rocks!
      const rw = sz === 'small' ? 14 : sz === 'medium' ? 20 : 28;
      const rh = sz === 'small' ? 10 : sz === 'medium' ? 15 : 22;

      ctx.fillStyle = rgbStr(stoneDark);
      ctx.fillRect(bx - Math.floor(rw / 2), GROUND_Y - rh + 3, rw, rh - 3);
      ctx.fillStyle = rgbStr(stoneMid);
      ctx.fillRect(bx - Math.floor(rw / 2) + 2, GROUND_Y - rh, rw - 5, rh - 2);
      if (sz === 'large') {
        ctx.fillRect(bx - Math.floor(rw / 2) + 5, GROUND_Y - rh - 3, rw - 11, 4);
      }
      ctx.fillStyle = rgbStr(snow);
      ctx.fillRect(bx - Math.floor(rw / 2) + 3, GROUND_Y - rh - (sz === 'large' ? 3 : 0), rw - 7, 2);
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

        if (r.mineProgress > 0) {
          const workers = w.villagers.filter((v) => v.role === 'builder' && v.targetId === r.id && Math.abs(v.x - r.x) < 28).length;
          ctx.fillStyle = 'rgba(10,14,20,0.82)';
          ctx.fillRect(bx - 13, GROUND_Y - rh - 17, 26, 4);
          ctx.fillStyle = '#a8c8e8';
          ctx.fillRect(bx - 12, GROUND_Y - rh - 16, Math.max(1, Math.round(24 * Math.min(1, r.mineProgress))), 2);
          if (workers > 1) {
            ctx.fillStyle = '#ffe58a';
            ctx.font = 'bold 6px "Pixelify Sans", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`x${workers}`, bx, GROUND_Y - rh - 19);
            ctx.textAlign = 'left';
          }
        }
      }
    }
  }

  private drawBerryBushes(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    const bushes = w.berryBushes ?? [];
    if (bushes.length === 0) return;
    const isWinter = w.season === 'winter';

    for (const bush of bushes) {
      if (bush.berries <= 0) continue;
      const sx = Math.round(bush.x - camX);
      if (sx < -24 || sx > this.viewW + 24) continue;

      // Leafy berry bush mound
      ctx.fillStyle = isWinter ? '#2b4d44' : '#2d6e3e';
      ctx.fillRect(sx - 9, GROUND_Y - 7, 18, 7);
      ctx.fillStyle = isWinter ? '#3e6b5c' : '#459452';
      ctx.fillRect(sx - 7, GROUND_Y - 10, 14, 5);
      ctx.fillRect(sx - 4, GROUND_Y - 12, 8, 3);
      if (isWinter) {
        ctx.fillStyle = '#dceef8';
        ctx.fillRect(sx - 4, GROUND_Y - 12, 6, 2);
      }

      // Ripe berries (crimson/magenta pixel clusters)
      const berryOffsets = [
        [-6, -5],
        [-2, -9],
        [3, -6],
        [6, -4],
        [0, -4],
        [-4, -8],
      ];
      const count = Math.min(berryOffsets.length, bush.berries * 2);
      for (let i = 0; i < count; i++) {
        const [ox, oy] = berryOffsets[i];
        ctx.fillStyle = i % 2 === 0 ? '#e6395a' : '#ff7096';
        ctx.fillRect(sx + ox, GROUND_Y + oy, 2, 2);
      }

      // Marked with coin to forage
      if (bush.marked) {
        const bob = Math.round(Math.sin(w.elapsed * 6) * 1.5);
        ctx.fillStyle = '#f7d265';
        ctx.fillRect(sx - 3, GROUND_Y - 20 + bob, 6, 6);
        ctx.fillStyle = '#805212';
        ctx.fillRect(sx - 2, GROUND_Y - 19 + bob, 4, 4);
        ctx.fillStyle = '#fff3b8';
        ctx.fillRect(sx - 1, GROUND_Y - 18 + bob, 2, 2);

        if (bush.forageProgress > 0) {
          ctx.fillStyle = 'rgba(10,14,20,0.82)';
          ctx.fillRect(sx - 10, GROUND_Y - 27, 20, 3);
          ctx.fillStyle = '#ff6b8a';
          ctx.fillRect(sx - 9, GROUND_Y - 26, Math.max(1, Math.round(18 * Math.min(1, bush.forageProgress))), 1);
        }
      }
    }
  }

  private drawCamps(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const camp of w.camps) {
      const sx = Math.round(camp.x - camX);
      if (sx < -44 || sx > this.viewW + 44) continue;

      if (camp.isBrewery) {
        // Upgraded Nordic Brewery Tavern (attracts wanderers from both sides!)
        ctx.fillStyle = '#5c3c24';
        ctx.fillRect(sx - 18, GROUND_Y - 20, 36, 20);
        ctx.fillStyle = '#3d2717';
        ctx.fillRect(sx - 18, GROUND_Y - 20, 3, 20);
        ctx.fillRect(sx + 15, GROUND_Y - 20, 3, 20);
        // Gabled tavern roof
        ctx.fillStyle = '#36414f';
        ctx.beginPath();
        ctx.moveTo(sx - 22, GROUND_Y - 19);
        ctx.lineTo(sx, GROUND_Y - 32);
        ctx.lineTo(sx + 22, GROUND_Y - 19);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#d9a738';
        ctx.fillRect(sx - 20, GROUND_Y - 20, 40, 2);
        // Warm doorway & glowing tavern window
        ctx.fillStyle = '#241710';
        ctx.fillRect(sx - 11, GROUND_Y - 12, 7, 12);
        ctx.fillStyle = '#ffae42';
        ctx.fillRect(sx + 2, GROUND_Y - 15, 9, 6);
        ctx.fillStyle = '#4a311f';
        ctx.fillRect(sx + 6, GROUND_Y - 15, 1, 6);
        // Oak beer barrel outside
        ctx.fillStyle = '#7a4f2d';
        ctx.fillRect(sx - 23, GROUND_Y - 8, 6, 8);
        ctx.fillStyle = '#3d4754';
        ctx.fillRect(sx - 23, GROUND_Y - 6, 6, 1);
        ctx.fillRect(sx - 23, GROUND_Y - 3, 6, 1);

        // Beer Mug sign on gable
        ctx.fillStyle = '#f5b82e';
        ctx.fillRect(sx - 2, GROUND_Y - 28, 4, 5);
        ctx.fillStyle = '#fff9e6';
        ctx.fillRect(sx - 2, GROUND_Y - 29, 4, 2);

        // Stocked Golden Beer Mugs (0..4) displayed cleanly above bar counter!
        const beers = camp.beerStock ?? 0;
        for (let b = 0; b < 4; b++) {
          const mx = sx - 11 + b * 6;
          const my = GROUND_Y - 38;
          if (b < beers) {
            ctx.fillStyle = '#f5b82e';
            ctx.fillRect(mx, my + 1, 4, 5);
            ctx.fillStyle = '#fff9e6';
            ctx.fillRect(mx, my, 4, 2);
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(mx, my + 1, 4, 5);
          }
        }
        continue;
      }

      // Standard Vagrant Camp
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

      // Subtle barrel hint on Brewery-eligible first camp of each side
      if (camp.isBrewerySite) {
        ctx.fillStyle = '#7a4f2d';
        ctx.fillRect(sx - 22, GROUND_Y - 6, 5, 6);
        ctx.fillStyle = '#4c5764';
        ctx.fillRect(sx - 22, GROUND_Y - 4, 5, 1);
      }

      if (camp.breweryUnderConstruction) {
        const prog = Math.min(1, camp.breweryBuildProgress ?? 0);
        ctx.fillStyle = 'rgba(10,14,20,0.82)';
        ctx.fillRect(sx - 14, GROUND_Y - 26, 28, 4);
        ctx.fillStyle = '#f5c469';
        ctx.fillRect(sx - 13, GROUND_Y - 25, Math.max(1, Math.round(26 * prog)), 2);
      }
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

  private drawYggdrasil(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    const ygg = w.yggdrasilTree;
    if (!ygg) return;
    const shakeX = ygg.hitShake > 0 ? Math.round(Math.sin(w.elapsed * 55) * 2) : 0;
    const sx = Math.round(ygg.x - camX) + shakeX;
    if (sx < -120 || sx > this.viewW + 120) return;

    const pulse = 0.65 + 0.35 * Math.sin(w.elapsed * 2.6);

    ctx.save();
    // Ethereal golden-emerald sacred aura behind the World Tree
    const aura = ctx.createRadialGradient(sx, GROUND_Y - 70, 12, sx, GROUND_Y - 70, 74);
    aura.addColorStop(0, `rgba(126, 255, 168, ${(0.24 * pulse).toFixed(2)})`);
    aura.addColorStop(0.55, `rgba(255, 224, 110, ${(0.12 * pulse).toFixed(2)})`);
    aura.addColorStop(1, 'rgba(20, 60, 40, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(sx - 76, GROUND_Y - 146, 152, 146);

    // Massive spreading gnarled ancient roots
    ctx.fillStyle = '#3b2517';
    ctx.fillRect(sx - 34, GROUND_Y - 8, 68, 8);
    ctx.fillRect(sx - 26, GROUND_Y - 16, 52, 10);
    ctx.fillStyle = '#523420';
    ctx.fillRect(sx - 20, GROUND_Y - 22, 40, 10);

    // Colossal ancient trunk rising toward the heavens
    ctx.fillStyle = '#472d1c';
    ctx.fillRect(sx - 16, GROUND_Y - 82, 32, 66);
    ctx.fillStyle = '#5e3c25';
    ctx.fillRect(sx - 12, GROUND_Y - 86, 24, 68);
    ctx.fillStyle = '#754c30';
    ctx.fillRect(sx - 5, GROUND_Y - 82, 7, 62);

    // Glowing Golden-Emerald Runes carved along Yggdrasil's trunk!
    ctx.fillStyle = '#7eff9e';
    ctx.fillRect(sx - 2, GROUND_Y - 66, 4, 2);
    ctx.fillRect(sx - 1, GROUND_Y - 64, 2, 14);
    ctx.fillRect(sx - 4, GROUND_Y - 58, 8, 2);
    ctx.fillStyle = '#ffe58a';
    ctx.fillRect(sx - 1, GROUND_Y - 46, 2, 12);
    ctx.fillRect(sx - 4, GROUND_Y - 40, 8, 2);

    // Thick outstretched upper boughs
    ctx.fillStyle = '#472d1c';
    ctx.fillRect(sx - 38, GROUND_Y - 88, 76, 8);
    ctx.fillRect(sx - 28, GROUND_Y - 102, 56, 8);

    // Monumental layered sacred emerald-teal & golden foliage canopy
    const canopyLayers = [
      { ox: -48, oy: -96, w: 96, h: 24, col: '#184a36' },
      { ox: -42, oy: -112, w: 84, h: 24, col: '#1f6144' },
      { ox: -32, oy: -124, w: 64, h: 20, col: '#2d7d56' },
      { ox: -20, oy: -132, w: 40, h: 14, col: '#47a872' },
    ];
    for (const c of canopyLayers) {
      ctx.fillStyle = c.col;
      ctx.fillRect(sx + c.ox, GROUND_Y + c.oy, c.w, c.h);
    }

    // Luminescent hanging golden leaves & rising spirit motes
    for (let i = 0; i < 9; i++) {
      const lx = sx - 36 + i * 9;
      const sway = Math.round(Math.sin(w.elapsed * 2.2 + i) * 1.5);
      ctx.fillStyle = i % 2 === 0 ? '#7eff9e' : '#ffe58a';
      ctx.fillRect(lx + sway, GROUND_Y - 76 + (i % 3) * 5, 2, 6);
    }

    // Yggdrasil Sacred Name Plate
    ctx.fillStyle = 'rgba(8, 14, 24, 0.86)';
    ctx.fillRect(sx - 34, GROUND_Y - 144, 68, 9);
    ctx.fillStyle = '#7eff9e';
    ctx.font = 'bold 6px "Pixelify Sans", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('YGGDRASIL', sx, GROUND_Y - 137);
    ctx.textAlign = 'left';

    // Harvest progress bar when Builders are gathering Sacred Wood
    if (ygg.marked) {
      const barW = 42;
      ctx.fillStyle = 'rgba(8, 14, 24, 0.88)';
      ctx.fillRect(sx - 21, GROUND_Y - 152, barW, 4);
      ctx.fillStyle = '#ffe58a';
      ctx.fillRect(sx - 20, GROUND_Y - 151, Math.round((barW - 2) * Math.min(1, ygg.harvestProgress)), 2);
    }
    ctx.restore();
  }

  private drawStaffAltars(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    if (w.hall.level < 1) return;
    for (const altar of w.staffAltars ?? []) {
      const sx = Math.round(altar.x - camX);
      if (sx < -36 || sx > this.viewW + 36) continue;
      const rec = ELEMENTAL_STAFF_RECIPES[altar.staffId];
      const wDef = WEAPON_DEFS[altar.staffId];
      const stoneDef = ELEMENTAL_STONE_DEFS[rec.stoneKind];
      const floatY = Math.round(Math.sin(w.elapsed * 3.6 + altar.x) * 1.5);
      const isEquipped = w.monarchs.some((m) => m.weapon === altar.staffId);

      // Compact Carved Elemental Forge Pedestal
      ctx.fillStyle = '#2d3744';
      ctx.fillRect(sx - 9, GROUND_Y - 4, 18, 4);
      ctx.fillStyle = '#3f4d5e';
      ctx.fillRect(sx - 7, GROUND_Y - 11, 14, 7);
      ctx.fillStyle = altar.forged ? stoneDef.color : '#607185';
      ctx.fillRect(sx - 4, GROUND_Y - 9, 8, 2);

      // Subtle elemental aura & floating Elemental Staff above pedestal
      if (!isEquipped) {
        ctx.fillStyle = altar.forged ? `${stoneDef.color}3c` : `${stoneDef.color}1c`;
        ctx.beginPath();
        ctx.arc(sx, GROUND_Y - 22 + floatY, altar.forged ? 10 : 7, 0, Math.PI * 2);
        ctx.fill();

        // Sacred Yggdrasil wood staff shaft + glowing Red/Blue/Yellow crystal orb!
        ctx.fillStyle = altar.forged ? '#7a5229' : '#4f3a26';
        ctx.fillRect(sx - 1, GROUND_Y - 24 + floatY, 2, 12);
        ctx.fillStyle = altar.forged ? stoneDef.color : `${stoneDef.color}88`;
        ctx.fillRect(sx - 3, GROUND_Y - 29 + floatY, 6, 5);
        ctx.fillStyle = altar.forged ? '#ffffff' : stoneDef.highlight;
        ctx.fillRect(sx - 1, GROUND_Y - 28 + floatY, 2, 2);
      }

      // Compact Staff Label
      ctx.fillStyle = 'rgba(8, 14, 24, 0.78)';
      ctx.fillRect(sx - 17, GROUND_Y - 38, 34, 7);
      ctx.fillStyle = altar.forged ? stoneDef.highlight : wDef.color;
      ctx.font = 'bold 5px "Pixelify Sans", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(wDef.shortTag, sx, GROUND_Y - 32.5);
      ctx.textAlign = 'left';
    }
  }

  private drawMagicProjectiles(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const p of w.magicProjectiles ?? []) {
      const sx = Math.round(p.x - camX);
      const sy = Math.round(p.y);
      if (sx < -24 || sx > this.viewW + 24) continue;

      if (p.kind === 'fireball') {
        // Blazing Fireball with glowing halo & core
        ctx.fillStyle = 'rgba(255, 100, 30, 0.42)';
        ctx.beginPath();
        ctx.arc(sx, sy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff5824';
        ctx.beginPath();
        ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      } else if (p.kind === 'ice_orb') {
        // Crystalline Frost Orb with icicle halo
        ctx.fillStyle = 'rgba(92, 232, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(sx, sy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#36d8ff';
        ctx.beginPath();
        ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e0fbff';
        ctx.fillRect(sx - 5, sy - 1, 10, 2);
        ctx.fillRect(sx - 1, sy - 5, 2, 10);
      } else {
        // Spinning lethal smaller Ice Crystal Flake/Shard!
        ctx.fillStyle = 'rgba(130, 240, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7ef2ff';
        ctx.fillRect(sx - 3, sy - 1, 6, 2);
        ctx.fillRect(sx - 1, sy - 3, 2, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
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
      const stoneDef = p.elementalStone ? ELEMENTAL_STONE_DEFS[p.elementalStone] : null;
      ctx.fillStyle = `rgba(92, 42, 138, ${(0.55 * pulse).toFixed(2)})`;
      ctx.fillRect(sx - 11, GROUND_Y - 38, 22, 36);
      ctx.fillStyle = stoneDef ? `${stoneDef.color}77` : `rgba(82, 226, 255, ${(0.45 * pulse).toFixed(2)})`;
      ctx.fillRect(sx - 7, GROUND_Y - 32, 14, 28);
      ctx.fillStyle = stoneDef ? stoneDef.highlight : '#d8fbff';
      ctx.fillRect(sx - 2, GROUND_Y - 26 + Math.round(Math.sin(p.pulseTime * 5) * 3), 4, 14);

      ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : '#2c3442';
      ctx.fillRect(sx - 18, GROUND_Y - 40, 7, 40);
      ctx.fillRect(sx + 11, GROUND_Y - 40, 7, 40);
      ctx.fillRect(sx - 16, GROUND_Y - 46, 32, 8);
      ctx.fillRect(sx - 10, GROUND_Y - 50, 20, 4);

      ctx.fillStyle = stoneDef ? stoneDef.color : w.isBloodMoon ? '#ff5e6c' : '#6cf4ff';
      ctx.fillRect(sx - 15, GROUND_Y - 30, 2, 5);
      ctx.fillRect(sx - 15, GROUND_Y - 18, 2, 5);
      ctx.fillRect(sx + 13, GROUND_Y - 30, 2, 5);
      ctx.fillRect(sx + 13, GROUND_Y - 18, 2, 5);

      // FLOATING ELEMENTAL STONE hovering above the 3 special Portals (Red Fire, Blue Ice, Yellow Thunder!)
      if (stoneDef) {
        const bob = Math.round(Math.sin(w.elapsed * 3.6 + p.id) * 3);
        const stoneY = GROUND_Y - 68 + bob;

        // Radiant colored halo
        ctx.fillStyle = `${stoneDef.color}48`;
        ctx.beginPath();
        ctx.arc(sx, stoneY, Math.round(12 + pulse * 4), 0, Math.PI * 2);
        ctx.fill();

        // Faceted Diamond Elemental Stone sprite
        ctx.fillStyle = stoneDef.color;
        ctx.beginPath();
        ctx.moveTo(sx, stoneY - 9);
        ctx.lineTo(sx + 7, stoneY);
        ctx.lineTo(sx, stoneY + 9);
        ctx.lineTo(sx - 7, stoneY);
        ctx.closePath();
        ctx.fill();

        // Bright inner highlight facet
        ctx.fillStyle = stoneDef.highlight;
        ctx.beginPath();
        ctx.moveTo(sx, stoneY - 6);
        ctx.lineTo(sx + 3, stoneY - 1);
        ctx.lineTo(sx, stoneY + 3);
        ctx.lineTo(sx - 3, stoneY - 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 1, stoneY - 4, 2, 2);

        // Orbiting elemental sparkles
        const orbX = sx + Math.round(Math.cos(w.elapsed * 4.5) * 11);
        const orbY = stoneY + Math.round(Math.sin(w.elapsed * 4.5) * 5);
        ctx.fillStyle = stoneDef.highlight;
        ctx.fillRect(orbX, orbY, 2, 2);

        // Label plate above the floating stone
        ctx.fillStyle = 'rgba(8, 14, 24, 0.84)';
        ctx.fillRect(sx - 26, stoneY - 20, 52, 8);
        ctx.fillStyle = stoneDef.highlight;
        ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(stoneDef.shortName.toUpperCase(), sx, stoneY - 14);
        ctx.textAlign = 'left';
      }

      // Live HP bar when portal is taking damage from an Assault Company!
      if (p.hp < p.maxHp) {
        const pct = Math.max(0, p.hp / Math.max(1, p.maxHp));
        ctx.fillStyle = 'rgba(8, 14, 24, 0.88)';
        ctx.fillRect(sx - 16, GROUND_Y - 56, 32, 4);
        ctx.fillStyle = stoneDef ? stoneDef.color : '#ff5e6c';
        ctx.fillRect(sx - 15, GROUND_Y - 55, Math.round(30 * pct), 2);
      }
    }
  }

  private drawHall(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    const sx = Math.round(w.hall.x - camX);
    if (sx < -95 || sx > this.viewW + 95) return;

    const lvl = w.hall.level;
    const primary = w.crest.primaryColor;
    const secondary = w.crest.secondaryColor;

    if (lvl >= 1) {
      const wave = Math.round(Math.sin(w.elapsed * 4.5) * 1.5);
      const flagOffset = lvl >= 6 ? 48 : lvl >= 3 ? 42 : 36;
      for (const fx of [-flagOffset, flagOffset]) {
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
      const hallW = Math.min(92, 54 + (lvl - 2) * 5);
      const hallH = Math.min(58, 30 + (lvl - 2) * 3.5);
      const isStone = lvl >= 4;
      const isIron = lvl >= 6;
      const isAsgard = lvl >= 9;

      // Flanking Castle turrets from Lv 4+
      if (lvl >= 4) {
        const turretH = hallH + (lvl >= 7 ? 16 : 10);
        const turretW = 12;
        for (const side of [-1, 1]) {
          const tx = sx + side * Math.round(hallW / 2 + 2) - Math.floor(turretW / 2);
          ctx.fillStyle = isIron ? '#455160' : '#5e6975';
          ctx.fillRect(tx, GROUND_Y - turretH, turretW, turretH);
          ctx.fillStyle = isAsgard ? '#efc462' : '#2f3945';
          ctx.fillRect(tx - 1, GROUND_Y - turretH - 3, turretW + 2, 3);
          for (let cx = 0; cx < turretW; cx += 4) {
            ctx.fillStyle = isIron ? '#617082' : '#7b8794';
            ctx.fillRect(tx + cx, GROUND_Y - turretH - 6, 3, 3);
          }
          // Glowing turret window
          ctx.fillStyle = isAsgard ? '#7ef5ff' : '#ffae42';
          ctx.fillRect(tx + 4, GROUND_Y - turretH + 7, 4, 5);
        }
      }

      // Main keep body
      ctx.fillStyle = isAsgard ? '#4d586b' : isIron ? '#3d4754' : isStone ? '#56616e' : '#4f3827';
      ctx.fillRect(sx - hallW / 2, GROUND_Y - hallH, hallW, hallH);

      ctx.fillStyle = isStone ? '#333c47' : '#362419';
      for (let bx = -hallW / 2 + 6; bx < hallW / 2; bx += 12) {
        ctx.fillRect(sx + bx, GROUND_Y - hallH, 2, hallH);
      }

      // Roof / Spire
      const roofPeak = 16 + Math.min(18, (lvl - 2) * 2.5);
      ctx.fillStyle = isAsgard ? '#26344a' : isIron ? '#242e3b' : lvl >= 3 ? '#2d3b4c' : '#3d464d';
      ctx.beginPath();
      ctx.moveTo(sx - hallW / 2 - 6, GROUND_Y - hallH + 4);
      ctx.lineTo(sx, GROUND_Y - hallH - roofPeak);
      ctx.lineTo(sx + hallW / 2 + 6, GROUND_Y - hallH + 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isAsgard ? '#ffe066' : secondary;
      ctx.fillRect(sx - hallW / 2 - 4, GROUND_Y - hallH + 3, hallW + 8, 2);

      // Snow or golden finial on roof peak
      ctx.fillStyle = isAsgard ? '#ffe58a' : '#d4e6f2';
      ctx.fillRect(sx - 6, GROUND_Y - hallH - roofPeak, 12, 3);
      if (lvl === 10) {
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(sx - 1, GROUND_Y - hallH - roofPeak - 8, 2, 8);
        ctx.fillStyle = '#7ef5ff';
        ctx.fillRect(sx - 2, GROUND_Y - hallH - roofPeak - 10, 4, 3);
      }

      // Banners & Emblem
      ctx.fillStyle = primary;
      ctx.fillRect(sx - 18, GROUND_Y - hallH + 6, 8, 15);
      ctx.fillRect(sx + 10, GROUND_Y - hallH + 6, 8, 15);
      ctx.fillStyle = secondary;
      ctx.fillRect(sx - 15, GROUND_Y - hallH + 6, 2, 13);
      ctx.fillRect(sx + 13, GROUND_Y - hallH + 6, 2, 13);

      drawShieldEmblem(ctx, w.crest, sx, GROUND_Y - hallH - 2, 7);

      // Warm castle entrance gate
      ctx.fillStyle = '#241710';
      ctx.fillRect(sx - 6, GROUND_Y - 16, 12, 16);
      ctx.fillStyle = '#ffae42';
      ctx.fillRect(sx - 4, GROUND_Y - 13, 8, 13);

      if (lvl >= 3) {
        for (const ox of [-26, 26]) {
          drawShieldEmblem(ctx, w.crest, sx + ox, GROUND_Y - hallH + 11, 4.5);
        }
      }
    }

    // Campfire pit
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

      // Kingdom Level pill above Castle
      const pillY = lvl >= 2 ? GROUND_Y - Math.min(58, 30 + (lvl - 2) * 3.5) - (16 + Math.min(18, (lvl - 2) * 2.5)) - 12 : GROUND_Y - 26;
      ctx.fillStyle = 'rgba(8, 14, 24, 0.78)';
      ctx.fillRect(sx - 15, pillY, 30, 8);
      ctx.fillStyle = '#ffe58a';
      ctx.font = 'bold 6px "Pixelify Sans", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`NV.${lvl}`, sx, pillY + 6);
      ctx.textAlign = 'left';
    }

    if (w.hall.storedTaxCoins > 0) {
      const pile = Math.min(5, w.hall.storedTaxCoins);
      for (let i = 0; i < pile; i++) {
        ctx.fillStyle = '#f7d265';
        ctx.fillRect(sx + 14 + (i % 3) * 3, GROUND_Y - 3 - Math.floor(i / 3) * 3, 3, 3);
      }
    }
  }

  private drawBanker(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    if (w.hall.level < 1) return;

    // 1. Fixed wooden vault stand & coin stacks at w.banker.x
    const deskX = Math.round(w.banker.x - camX);
    if (deskX >= -32 && deskX <= this.viewW + 32) {
      ctx.fillStyle = '#4a311f';
      ctx.fillRect(deskX - 11, GROUND_Y - 10, 22, 10);
      ctx.fillStyle = '#d9a738';
      ctx.fillRect(deskX - 11, GROUND_Y - 10, 22, 2);
      ctx.fillRect(deskX - 1, GROUND_Y - 8, 2, 8);

      // Coin stacks proportional to balance
      const stacks = Math.min(5, Math.ceil(w.banker.balance / 10));
      for (let i = 0; i < stacks; i++) {
        ctx.fillStyle = '#f7d265';
        ctx.fillRect(deskX + 5 + (i % 2) * 3, GROUND_Y - 12 - Math.floor(i / 2) * 2, 2, 2);
      }
    }

    // 2. Banker NPC (stands behind desk when idle; walks to full farms every morning!)
    const walkWorldX = w.banker.walkX ?? w.banker.x;
    const bx = Math.round(walkWorldX - camX);
    if (bx < -24 || bx > this.viewW + 24) return;

    const isWalking = Math.abs(walkWorldX - w.banker.x) > 3 || (w.banker.phase && w.banker.phase !== 'idle');
    const anim = w.banker.animTime ?? w.elapsed * 2.5;
    const bob = isWalking ? Math.round(Math.abs(Math.sin(anim)) * 1.5) : Math.round(Math.sin(w.elapsed * 2.5) * 0.6);
    const stride = isWalking ? Math.round(Math.sin(anim) * 2) : 0;
    const face = w.banker.facing ?? 1;

    if (isWalking) {
      // Walking boots on the ground
      ctx.fillStyle = '#2b1e16';
      ctx.fillRect(bx - 2 + stride, GROUND_Y - 4, 2, 4);
      ctx.fillRect(bx + 1 - stride, GROUND_Y - 4, 2, 4);
    }

    const baseY = isWalking ? GROUND_Y - 4 : GROUND_Y - 10;
    ctx.fillStyle = '#2d4b3c';
    ctx.fillRect(bx - 3, baseY - 7 - bob, 6, 7);
    ctx.fillStyle = '#efc462';
    ctx.fillRect(bx - 3, baseY - 3 - bob, 6, 1);
    ctx.fillStyle = '#e5be9e';
    ctx.fillRect(bx - 2, baseY - 11 - bob, 4, 4);
    ctx.fillStyle = '#1f362b';
    ctx.fillRect(bx - 3, baseY - 13 - bob, 6, 2);

    // Golden coin pouch when carrying collected farm coins back to the Bank!
    if ((w.banker.carriedCoins ?? 0) > 0) {
      ctx.fillStyle = '#c48f29';
      ctx.fillRect(bx + face * 3, baseY - 6 - bob, 4, 4);
      ctx.fillStyle = '#ffe58a';
      ctx.fillRect(bx + face * 3 + 1, baseY - 5 - bob, 2, 2);
    }
  }

  private drawForge(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    if (w.hall.level < 1 || !w.forge) return;
    const sx = Math.round(w.forge.x - camX);
    if (sx < -36 || sx > this.viewW + 36) return;

    if (!w.forge.built) {
      // Unbuilt stone foundation + anvil site
      ctx.fillStyle = '#4c5764';
      ctx.fillRect(sx - 14, GROUND_Y - 5, 28, 5);
      ctx.fillStyle = '#6f7d8c';
      ctx.fillRect(sx - 10, GROUND_Y - 8, 20, 3);
      ctx.fillStyle = '#ff8f3b';
      ctx.fillRect(sx - 2, GROUND_Y - 7, 4, 2);
    } else {
      // Stone furnace + chimney + glowing hearth + iron anvil
      ctx.fillStyle = '#434d59';
      ctx.fillRect(sx - 13, GROUND_Y - 22, 18, 22);
      ctx.fillStyle = '#2e3640';
      ctx.fillRect(sx - 9, GROUND_Y - 30, 8, 10);
      ctx.fillStyle = '#5e6b7a';
      ctx.fillRect(sx - 15, GROUND_Y - 24, 22, 3);

      // Glowing furnace mouth
      const glow = Math.floor(w.elapsed * 10) % 2;
      ctx.fillStyle = w.forge.smelting ? '#ff6a1a' : '#c94c16';
      ctx.fillRect(sx - 9, GROUND_Y - 12, 10, 9);
      ctx.fillStyle = w.forge.smelting ? '#ffe066' : '#ff9b3d';
      ctx.fillRect(sx - 7, GROUND_Y - 10 - glow, 6, 5 + glow);

      // Anvil beside furnace
      ctx.fillStyle = '#8b99a8';
      ctx.fillRect(sx + 7, GROUND_Y - 9, 8, 3);
      ctx.fillRect(sx + 9, GROUND_Y - 6, 4, 6);
      ctx.fillStyle = '#cddbe8';
      ctx.fillRect(sx + 7, GROUND_Y - 9, 8, 1);

      if (w.forge.smelting) {
        ctx.fillStyle = 'rgba(10,14,20,0.85)';
        ctx.fillRect(sx - 13, GROUND_Y - 36, 26, 4);
        ctx.fillStyle = '#ff9b52';
        ctx.fillRect(sx - 12, GROUND_Y - 35, Math.max(1, Math.round(24 * w.forge.smeltProgress)), 2);
      }
    }

    if (w.forge.underConstruction) {
      ctx.fillStyle = 'rgba(10,14,20,0.82)';
      ctx.fillRect(sx - 12, GROUND_Y - 28, 24, 4);
      ctx.fillStyle = '#ff9b52';
      ctx.fillRect(sx - 11, GROUND_Y - 27, Math.round(22 * w.forge.buildProgress), 2);
    }
  }

  private drawIslandBuffs(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    if (w.hall.level < 1 || !w.islandBuffs.length) return;
    for (const buff of w.islandBuffs) {
      const sx = Math.round(buff.x - camX);
      if (sx < -36 || sx > this.viewW + 36) continue;
      const isCon = buff.kind === 'construction';
      const accent = isCon ? '#7ef5ff' : '#ff9b52';
      const pulse = 0.65 + 0.35 * Math.sin(w.elapsed * 3.5);

      if (buff.active) {
        ctx.fillStyle = isCon
          ? `rgba(126, 245, 255, ${(0.18 * pulse).toFixed(2)})`
          : `rgba(255, 155, 82, ${(0.2 * pulse).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, GROUND_Y - 18, 18, 0, Math.PI * 2);
        ctx.fill();
      }

      // Carved stone pillar
      ctx.fillStyle = '#3b4654';
      ctx.fillRect(sx - 10, GROUND_Y - 4, 20, 4);
      ctx.fillStyle = '#4e5c6e';
      ctx.fillRect(sx - 6, GROUND_Y - 28, 12, 24);
      ctx.fillStyle = '#68788c';
      ctx.fillRect(sx - 5, GROUND_Y - 31, 10, 4);

      // Rune symbol
      ctx.fillStyle = buff.active ? accent : '#8da3b8';
      ctx.fillRect(sx - 2, GROUND_Y - 23, 4, 10);
      ctx.fillRect(sx - 4, GROUND_Y - 20, 8, 2);

      // Plate
      ctx.fillStyle = 'rgba(8, 14, 24, 0.8)';
      ctx.fillRect(sx - 20, GROUND_Y - 41, 40, 8);
      ctx.fillStyle = buff.active ? '#82e08a' : accent;
      ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isCon ? (buff.active ? 'OBRA ✓' : 'BUFF OBRA') : buff.active ? 'FORJA ✓' : 'BUFF FORJA', sx, GROUND_Y - 35);
      ctx.textAlign = 'left';
    }
  }

  private drawTowers(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    if (w.hall.level < 1) return;
    for (const tw of w.towers) {
      const sx = Math.round(tw.x - camX);
      if (sx < -32 || sx > this.viewW + 32) continue;

      if (tw.destroyed) {
        ctx.fillStyle = '#4a3221';
        ctx.fillRect(sx - 7, GROUND_Y - 6, 5, 6);
        ctx.fillRect(sx + 2, GROUND_Y - 4, 5, 4);
        ctx.fillStyle = '#697482';
        ctx.fillRect(sx - 4, GROUND_Y - 3, 8, 3);
      } else if (tw.level === 0) {
        // Subtle tower plot marker
        ctx.fillStyle = '#4f4237';
        ctx.fillRect(sx - 7, GROUND_Y - 3, 14, 3);
        ctx.fillStyle = '#7a634c';
        ctx.fillRect(sx - 5, GROUND_Y - 6, 2, 4);
        ctx.fillRect(sx + 3, GROUND_Y - 6, 2, 4);
      } else {
        const h = getTowerHeight(tw.level);
        const isStone = tw.level >= 3;
        const isIron = tw.level >= 6;
        const isAsgard = tw.level >= 9;
        const bodyCol = tw.hitFlash > 0 ? '#ffffff' : isAsgard ? '#5a687d' : isIron ? '#455160' : isStone ? '#6d7885' : '#6b492c';
        const darkCol = tw.hitFlash > 0 ? '#e8e8e8' : isIron ? '#2d3642' : isStone ? '#4a5461' : '#4a301d';

        // Support stilts / stone shaft
        ctx.fillStyle = bodyCol;
        ctx.fillRect(sx - 7, GROUND_Y - h, 14, h);
        ctx.fillStyle = darkCol;
        ctx.fillRect(sx - 7, GROUND_Y - h, 2, h);
        ctx.fillRect(sx + 5, GROUND_Y - h, 2, h);

        // Platform deck & parapet
        ctx.fillStyle = isAsgard ? '#efc462' : darkCol;
        ctx.fillRect(sx - 10, GROUND_Y - h - 2, 20, 4);
        ctx.fillStyle = bodyCol;
        ctx.fillRect(sx - 10, GROUND_Y - h - 6, 3, 4);
        ctx.fillRect(sx + 7, GROUND_Y - h - 6, 3, 4);

        // Roof canopy on higher towers (Lv 4+)
        if (tw.level >= 4) {
          ctx.fillStyle = w.crest.primaryColor;
          ctx.fillRect(sx - 10, GROUND_Y - h - 20, 20, 3);
          ctx.fillStyle = isAsgard ? '#ffe066' : w.crest.secondaryColor;
          ctx.fillRect(sx - 10, GROUND_Y - h - 18, 20, 1);
          ctx.fillStyle = darkCol;
          ctx.fillRect(sx - 9, GROUND_Y - h - 18, 2, 16);
          ctx.fillRect(sx + 7, GROUND_Y - h - 18, 2, 16);
        }

        // Level & garrison badge
        const cap = getTowerArcherCap(tw.level);
        const occ = countArchersAssignedToTower(w, tw.id);
        const badgeY = GROUND_Y - h - (tw.level >= 4 ? 28 : 15);
        ctx.fillStyle = 'rgba(8, 14, 24, 0.76)';
        ctx.fillRect(sx - 14, badgeY, 28, 7);
        ctx.fillStyle = '#ffe58a';
        ctx.font = '5.5px "Pixelify Sans", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`T${tw.level} ${occ}/${cap}`, sx, badgeY + 5.5);
        ctx.textAlign = 'left';

        if (tw.hp < tw.maxHp) {
          const ratio = Math.max(0, tw.hp / tw.maxHp);
          ctx.fillStyle = 'rgba(10,14,20,0.75)';
          ctx.fillRect(sx - 10, badgeY - 4, 20, 3);
          ctx.fillStyle = ratio > 0.4 ? '#6fd48c' : '#ff5e6c';
          ctx.fillRect(sx - 9, badgeY - 3, Math.round(18 * ratio), 1);
        }
      }

      if (tw.underConstruction) {
        ctx.fillStyle = 'rgba(196, 152, 92, 0.75)';
        ctx.fillRect(sx - 10, GROUND_Y - 24, 2, 24);
        ctx.fillRect(sx + 8, GROUND_Y - 24, 2, 24);
        ctx.fillStyle = 'rgba(10,14,20,0.82)';
        ctx.fillRect(sx - 12, GROUND_Y - 31, 24, 4);
        ctx.fillStyle = '#efc462';
        ctx.fillRect(sx - 11, GROUND_Y - 30, Math.round(22 * tw.buildProgress), 2);
      }
    }
  }

  private drawShops(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    if (w.hall.level < 1) return;

    for (const shop of w.shops) {
      if (!isShopUnlocked(w, shop.kind)) continue;
      const sx = Math.round(shop.x - camX);
      if (sx < -32 || sx > this.viewW + 32) continue;

      // Wooden signboard mounted above the tent with the respective tool pixel icon!
      const signX = sx - 8;
      const signY = GROUND_Y - 38;
      // Vertical wooden support posts connecting roof to signboard
      ctx.fillStyle = '#4e3524';
      ctx.fillRect(sx - 5, GROUND_Y - 27, 2, 4);
      ctx.fillRect(sx + 3, GROUND_Y - 27, 2, 4);
      // Wooden plaque border & oak plank fill
      ctx.fillStyle = '#3b2414';
      ctx.fillRect(signX - 1, signY - 1, 18, 14);
      ctx.fillStyle = '#7c5230';
      ctx.fillRect(signX, signY, 16, 12);
      ctx.fillStyle = '#9c6c42';
      ctx.fillRect(signX, signY, 16, 2);
      ctx.fillStyle = '#5e3c20';
      ctx.fillRect(signX, signY + 10, 16, 2);
      // Tiny iron corner nails
      ctx.fillStyle = '#c8d4e0';
      ctx.fillRect(signX + 1, signY + 1, 1, 1);
      ctx.fillRect(signX + 14, signY + 1, 1, 1);
      // Respective tool pixel icon centered on the wooden sign
      this.drawPixelIcon(ctx, shop.kind, sx - 4, signY + 2);

      // Tent wooden poles & clan-colored awning
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
        } else if (shop.kind === 'spear') {
          ctx.fillStyle = '#8a5d32';
          ctx.fillRect(tx + 1, GROUND_Y - 15, 1, 11);
          ctx.fillStyle = '#dce8f5';
          ctx.fillRect(tx, GROUND_Y - 18, 3, 4);
          ctx.fillStyle = '#ffe066';
          ctx.fillRect(tx + 1, GROUND_Y - 14, 1, 1);
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
    if (!isFarmsUnlocked(w)) return;
    for (const farm of w.farms) {
      const sx = Math.round(farm.x - camX);
      if (sx < -44 || sx > this.viewW + 44) continue;

      if (farm.level === 0) {
        ctx.fillStyle = '#473628';
        ctx.fillRect(sx - 18, GROUND_Y - 2, 36, 3);
        ctx.fillStyle = '#6da658';
        ctx.fillRect(sx - 8, GROUND_Y - 5, 2, 3);
        ctx.fillRect(sx + 6, GROUND_Y - 5, 2, 3);
      } else {
        const span = Math.min(34, 18 + farm.level * 2);
        ctx.fillStyle = '#4a3524';
        ctx.fillRect(sx - span, GROUND_Y - 3, span * 2, 3);
        ctx.fillStyle = farm.level >= 5 ? '#6d7885' : '#6b4c32';
        ctx.fillRect(sx - span, GROUND_Y - 10, 2, 10);
        ctx.fillRect(sx + span - 2, GROUND_Y - 10, 2, 10);
        ctx.fillRect(sx - span, GROUND_Y - 7, span * 2, 2);

        if (w.season === 'winter') {
          // Dormant snow-dusted farmland in Winter (ZERO farm production!)
          ctx.fillStyle = '#c8deed';
          ctx.fillRect(sx - span + 2, GROUND_Y - 4, span * 2 - 4, 2);
        } else {
          const stalkH = Math.max(2, Math.round(3 + farm.cropProgress * 9));
          for (let bx = -span + 4; bx <= span - 6; bx += 4) {
            ctx.fillStyle =
              w.season === 'autumn'
                ? '#d49a42'
                : farm.cropProgress > 0.7
                  ? '#e6c050'
                  : '#73b359';
            ctx.fillRect(sx + bx, GROUND_Y - 3 - stalkH, 2, stalkH);
          }
        }

        if (farm.level >= 2) {
          const barnH = Math.min(24, 14 + farm.level);
          ctx.fillStyle = farm.level >= 6 ? '#53606e' : '#5c412c';
          ctx.fillRect(sx - 9, GROUND_Y - barnH - 3, 18, barnH);
          ctx.fillStyle = w.crest.primaryColor;
          ctx.fillRect(sx - 11, GROUND_Y - barnH - 6, 22, 4);
          if (farm.level >= 3) {
            ctx.fillStyle = w.crest.secondaryColor;
            ctx.fillRect(sx - 11, GROUND_Y - barnH - 7, 22, 1);
            ctx.fillStyle = '#ffae42';
            ctx.fillRect(sx - 2, GROUND_Y - 12, 4, 5);
          }
          // Grain silo at Lv 5+
          if (farm.level >= 5) {
            ctx.fillStyle = '#788694';
            ctx.fillRect(sx + 10, GROUND_Y - barnH - 4, 6, barnH + 1);
            ctx.fillStyle = '#efc462';
            ctx.fillRect(sx + 10, GROUND_Y - barnH - 6, 6, 2);
          }
        }

        // Farmer capacity & level badge (Nv.X · count/max)
        const maxF = getFarmMaxFarmers(farm.level);
        const count = w.villagers.filter(
          (v) => v.role === 'producer' && v.assignedFarmId === farm.id && v.state !== 'embarked'
        ).length;
        const badgeY = farm.level >= 2 ? GROUND_Y - Math.min(24, 14 + farm.level) - 16 : GROUND_Y - 26;
        ctx.fillStyle = 'rgba(8, 14, 24, 0.78)';
        ctx.fillRect(sx - 20, badgeY, 40, 8);
        ctx.fillStyle = count >= maxF ? '#ffe066' : '#a7e89b';
        ctx.font = '5.5px "Pixelify Sans", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`F${farm.level} ${count}/${maxF}`, sx, badgeY + 6);
        ctx.textAlign = 'left';

        // Stored coins pile visual (grows up to full cap ready for Banker morning rounds!)
        if (farm.storedCoins > 0) {
          const cap = Math.max(1, getFarmStorageCap(farm.level));
          const ratio = Math.min(1, farm.storedCoins / cap);
          const coinsDraw = Math.max(1, Math.ceil(ratio * 4));
          for (let c = 0; c < coinsDraw; c++) {
            ctx.fillStyle = ratio >= 1 ? '#fff08a' : '#f7d265';
            ctx.fillRect(sx - 15 + (c % 2) * 3, GROUND_Y - 5 - Math.floor(c / 2) * 2, 2, 2);
          }
        }
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

    // 2. Unbuilt Drakkar Viking Longship on shore (once built, drawFloatingBoat renders it in the fjord water!)
    const bx = Math.round(w.boat.x - camX);
    if (!w.boat.built && bx > -64 && bx < this.viewW + 64) {
      const prog = w.boat.buildProgress;
      // Hull on land while under construction
      ctx.fillStyle = '#4e331f';
      ctx.fillRect(bx - 22, GROUND_Y - 8, 44, 8);
      if (prog > 0.25) {
        ctx.fillStyle = '#6e492c';
        ctx.fillRect(bx - 26, GROUND_Y - 11, 52, 5);
        ctx.fillRect(bx - 29, GROUND_Y - 17, 4, 8);
        ctx.fillRect(bx + 25, GROUND_Y - 17, 4, 8);
      }
      if (prog > 0.6) {
        ctx.fillStyle = '#8c603a';
        ctx.fillRect(bx + 27, GROUND_Y - 22, 5, 6);
        ctx.fillStyle = w.crest.secondaryColor;
        ctx.fillRect(bx + 29, GROUND_Y - 21, 2, 2);
        ctx.fillStyle = '#4a311e';
        ctx.fillRect(bx - 1, GROUND_Y - 38, 3, 28);
      }
      if (w.boat.coinsPaid > 0 || w.boat.underConstruction) {
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

  private drawFloatingBoat(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    const bx = Math.round(w.boat.x - camX);
    if (bx < -72 || bx > this.viewW + 72) return;

    // Smooth launch drop into fjord water + gentle floating bob on the waves!
    const dropP = Math.max(0, Math.min(1, w.boat.waterDropProgress ?? 1));
    const easeDrop = dropP < 0.72 ? (dropP / 0.72) * (dropP / 0.72) : 1 + Math.sin(((dropP - 0.72) / 0.28) * Math.PI) * 0.12;
    const waveBob = dropP >= 0.85 ? Math.sin(w.elapsed * 2.6) * 1.6 : 0;
    const baseY = Math.round(GROUND_Y + easeDrop * 15 + waveBob);

    // Water shadow & floating foam ripples underneath the Drakkar
    if (dropP > 0.55) {
      ctx.fillStyle = 'rgba(8, 22, 36, 0.38)';
      ctx.fillRect(bx - 26, baseY, 52, 4);
      const rippleShift = Math.round(Math.sin(w.elapsed * 3.5) * 3);
      ctx.fillStyle = 'rgba(204, 238, 255, 0.58)';
      ctx.fillRect(bx - 29 + rippleShift, baseY - 1, 14, 1);
      ctx.fillRect(bx + 15 - rippleShift, baseY - 1, 14, 1);
      ctx.fillRect(bx - 18 - rippleShift, baseY + 2, 36, 1);
    }

    // Hull & curved Nordic prows
    ctx.fillStyle = '#4e331f';
    ctx.fillRect(bx - 22, baseY - 8, 44, 8);
    ctx.fillStyle = '#6e492c';
    ctx.fillRect(bx - 26, baseY - 11, 52, 5);
    ctx.fillRect(bx - 29, baseY - 17, 4, 8);
    ctx.fillRect(bx + 25, baseY - 17, 4, 8);

    // Dragon head prow + Mast
    ctx.fillStyle = '#8c603a';
    ctx.fillRect(bx + 27, baseY - 22, 5, 6);
    ctx.fillStyle = w.crest.secondaryColor;
    ctx.fillRect(bx + 29, baseY - 21, 2, 2);
    ctx.fillStyle = '#4a311e';
    ctx.fillRect(bx - 1, baseY - 38, 3, 28);

    // Striped Clan-Colored Viking Sail
    ctx.fillStyle = w.crest.primaryColor;
    ctx.fillRect(bx - 14, baseY - 35, 28, 18);
    ctx.fillStyle = w.crest.secondaryColor;
    for (let sx = -10; sx <= 10; sx += 8) {
      ctx.fillRect(bx + sx, baseY - 35, 3, 18);
    }

    // Mini shields lining the Drakkar hull
    for (let sx = -16; sx <= 16; sx += 8) {
      ctx.fillStyle = w.crest.primaryColor;
      ctx.fillRect(bx + sx - 2, baseY - 11, 5, 5);
      ctx.fillStyle = w.crest.secondaryColor;
      ctx.fillRect(bx + sx - 1, baseY - 10, 3, 3);
    }

    // Visible embarked defenders standing on deck (archers & warriors who defend the boat!)
    if (w.boat.crewArchers > 0) {
      ctx.fillStyle = w.crest.primaryColor;
      ctx.fillRect(bx - 16, baseY - 17, 4, 6);
      ctx.fillStyle = '#e5be9e';
      ctx.fillRect(bx - 15, baseY - 20, 3, 3);
      ctx.fillStyle = '#c48d4e';
      ctx.fillRect(bx - 18, baseY - 18, 2, 5);
    }
    if (w.boat.crewWarriors > 0) {
      ctx.fillStyle = w.crest.primaryColor;
      ctx.fillRect(bx + 12, baseY - 17, 4, 6);
      ctx.fillStyle = '#9aa8b8';
      ctx.fillRect(bx + 12, baseY - 20, 4, 3);
      ctx.fillStyle = '#d4e2f0';
      ctx.fillRect(bx + 16, baseY - 20, 2, 6);
    }

    // Whenever the player passes by the built boat, show Bow, Sword, Hammer, Seed icons + count of each embarked worker!
    const localMonarch = this.getLocalMonarch(w);
    if (localMonarch && Math.abs(localMonarch.x - w.boat.x) < 68) {
      const crewItems: Array<{ kind: 'bow' | 'sword' | 'hammer' | 'seed'; count: number }> = [
        { kind: 'bow', count: w.boat.crewArchers },
        { kind: 'sword', count: w.boat.crewWarriors },
        { kind: 'hammer', count: w.boat.crewBuilders },
        { kind: 'seed', count: w.boat.crewProducers },
      ];
      const itemGap = 20;
      const totalW = (crewItems.length - 1) * itemGap + 14;
      const startX = Math.round(bx - totalW / 2);
      const rowY = baseY - 49;

      ctx.font = 'bold 7px "Pixelify Sans", monospace';
      ctx.textAlign = 'left';
      for (let i = 0; i < crewItems.length; i++) {
        const item = crewItems[i];
        const ix = startX + i * itemGap;
        this.drawPixelIcon(ctx, item.kind, ix, rowY);
        const countTxt = String(item.count);
        ctx.fillStyle = 'rgba(4, 8, 16, 0.85)';
        ctx.fillText(countTxt, ix + 10.5, rowY + 8);
        ctx.fillStyle = item.count > 0 ? '#ffe58a' : '#b8c8d8';
        ctx.fillText(countTxt, ix + 10, rowY + 7.5);
      }
    }
  }

  private drawShrinesAndPuzzle(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    // 1. Nordic God Shrine (Thor, Freya, Odin, Loki — 1 per island!)
    if (w.godShrine) {
      const sx = Math.round(w.godShrine.x - camX);
      if (sx > -64 && sx < this.viewW + 64) {
        const def = GOD_DEFS[w.godShrine.godId];
        const isActive = w.activeGod === w.godShrine.godId;
        const isRitual = Boolean(w.godShrine.ritualActive);
        const pulse = 0.65 + 0.35 * Math.sin(w.elapsed * (isRitual ? 7.5 : 3.5));

        // Celestial Rapture Beam reaching down from the sky during Tribute Sacrifice Ritual!
        if (isRitual) {
          ctx.save();
          const beamW = Math.round(18 + Math.sin(w.elapsed * 9) * 3);
          const grad = ctx.createLinearGradient(sx, GROUND_Y - 190, sx, GROUND_Y);
          grad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
          grad.addColorStop(0.55, `${def.color}55`);
          grad.addColorStop(1, `${def.color}bb`);
          ctx.fillStyle = grad;
          ctx.fillRect(sx - Math.floor(beamW / 2), GROUND_Y - 190, beamW, 190);

          // Intense inner white rapture column
          ctx.fillStyle = `rgba(255, 252, 232, ${(0.35 + pulse * 0.25).toFixed(2)})`;
          ctx.fillRect(sx - 3, GROUND_Y - 190, 6, 190);

          // Rising celestial motes inside beam
          for (let i = 0; i < 6; i++) {
            const prog = ((w.elapsed * 0.9 + i * 0.17) % 1);
            const my = Math.round(GROUND_Y - 10 - prog * 165);
            const mx = sx + Math.round(Math.sin(w.elapsed * 5 + i * 2.1) * 6);
            ctx.fillStyle = i % 2 === 0 ? '#ffffff' : def.color;
            ctx.fillRect(mx, my, 2, 2);
          }
          ctx.restore();
        }

        // Sacred aura when blessed, unlocked, or ritual in progress
        if (w.godShrine.unlocked || isRitual) {
          ctx.fillStyle = isRitual
            ? `${def.color}48`
            : isActive
              ? `rgba(255, 224, 110, ${(0.22 * pulse).toFixed(2)})`
              : `rgba(126, 245, 255, ${(0.14 * pulse).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(sx, GROUND_Y - 22, isRitual ? 28 : isActive ? 24 : 18, 0, Math.PI * 2);
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
        ctx.fillStyle = w.godShrine.unlocked || isRitual ? def.color : '#8da3b8';
        ctx.fillRect(sx - 3, GROUND_Y - 30, 6, 12);
        ctx.fillStyle = isActive || isRitual ? '#ffffff' : '#182230';
        ctx.fillRect(sx - 1, GROUND_Y - 27, 2, 6);

        // God name plate
        ctx.fillStyle = 'rgba(8, 14, 24, 0.78)';
        ctx.fillRect(sx - 18, GROUND_Y - 50, 36, 8);
        ctx.fillStyle = def.color;
        ctx.font = 'bold 6px "Pixelify Sans", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(def.name.toUpperCase(), sx, GROUND_Y - 44);

        // Tribute counter badge during active ritual
        if (isRitual) {
          const done = w.godShrine.tributeCompleted ?? 0;
          const need = w.godShrine.tributeNeeded ?? def.tributeCount;
          ctx.fillStyle = 'rgba(8, 14, 24, 0.88)';
          ctx.fillRect(sx - 24, GROUND_Y - 60, 48, 8);
          ctx.fillStyle = '#ffe58a';
          ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
          ctx.fillText(`TRIBUTO ${done}/${need}`, sx, GROUND_Y - 54);
        }
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
        ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
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

    // 4. Divine Weapon & Magic Relic Altar (1 unique relic per island!)
    if (w.weaponShrine) {
      const sx = Math.round(w.weaponShrine.x - camX);
      if (sx > -56 && sx < this.viewW + 56) {
        const def = WEAPON_DEFS[w.weaponShrine.weaponId];
        const heldBySomeone = w.monarchs.some((m) => m.weapon === w.weaponShrine!.weaponId);
        const pulse = 0.65 + 0.35 * Math.sin(w.elapsed * 4.2);
        const floatY = Math.round(Math.sin(w.elapsed * 3.4) * 2);

        // Runic aura behind relic
        ctx.fillStyle = heldBySomeone ? 'rgba(120, 145, 168, 0.12)' : `${def.color}36`;
        ctx.beginPath();
        ctx.arc(sx, GROUND_Y - 26 + floatY, Math.round(14 + pulse * 4), 0, Math.PI * 2);
        ctx.fill();

        // Carved Obsidian & Runic Altar Pedestal
        ctx.fillStyle = '#394452';
        ctx.fillRect(sx - 14, GROUND_Y - 5, 28, 5);
        ctx.fillStyle = '#4d5c6e';
        ctx.fillRect(sx - 10, GROUND_Y - 12, 20, 7);
        ctx.fillStyle = '#252f3d';
        ctx.fillRect(sx - 7, GROUND_Y - 17, 14, 5);
        // Glowing rune bar on altar front
        ctx.fillStyle = heldBySomeone ? '#586a7d' : def.color;
        ctx.fillRect(sx - 5, GROUND_Y - 10, 10, 2);

        // Floating Pixel Weapon Sprite above Altar (dimmed if already claimed by a player)
        if (!heldBySomeone) {
          const wy = GROUND_Y - 28 + floatY;
          const wid = w.weaponShrine.weaponId;
          if (wid === 'thor_hammer') {
            ctx.fillStyle = '#8a5d32';
            ctx.fillRect(sx - 1, wy + 1, 2, 8);
            ctx.fillStyle = '#b4c8dc';
            ctx.fillRect(sx - 6, wy - 4, 12, 6);
            ctx.fillStyle = def.color;
            ctx.fillRect(sx - 4, wy - 2, 8, 2);
          } else if (wid === 'freya_bow') {
            ctx.fillStyle = def.color;
            ctx.fillRect(sx - 3, wy - 5, 2, 12);
            ctx.fillRect(sx - 1, wy - 6, 3, 2);
            ctx.fillRect(sx - 1, wy + 6, 3, 2);
            ctx.fillStyle = '#fff3d6';
            ctx.fillRect(sx + 1, wy - 5, 1, 12);
            ctx.fillRect(sx - 5, wy, 10, 1);
          } else if (wid === 'tyr_shield') {
            ctx.fillStyle = '#5f768c';
            ctx.beginPath();
            ctx.arc(sx, wy, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = def.color;
            ctx.beginPath();
            ctx.arc(sx, wy, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(sx - 1, wy - 1, 2, 2);
          } else if (wid === 'loki_staff' || wid === 'baldr_scepter') {
            ctx.fillStyle = '#734b28';
            ctx.fillRect(sx - 1, wy - 3, 2, 12);
            ctx.fillStyle = def.color;
            ctx.fillRect(sx - 3, wy - 7, 6, 5);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(sx - 1, wy - 5, 2, 2);
          } else if (wid === 'ymir_rune') {
            ctx.fillStyle = '#47657a';
            ctx.fillRect(sx - 4, wy - 6, 8, 12);
            ctx.fillStyle = def.color;
            ctx.fillRect(sx - 2, wy - 4, 4, 8);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(sx - 1, wy - 2, 2, 4);
          } else if (wid === 'heimdall_horn') {
            ctx.fillStyle = def.color;
            ctx.fillRect(sx - 5, wy + 1, 8, 3);
            ctx.fillRect(sx + 2, wy - 3, 4, 6);
            ctx.fillStyle = '#fff2c4';
            ctx.fillRect(sx + 4, wy - 3, 2, 6);
          } else {
            // Gungnir spear or Surtr flaming blade
            ctx.fillStyle = '#7a5230';
            ctx.fillRect(sx - 1, wy + 2, 2, 7);
            ctx.fillStyle = def.color;
            ctx.fillRect(sx - 2, wy - 7, 4, 9);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(sx - 1, wy - 6, 2, 6);
          }
        }

        // Relic name plate
        ctx.fillStyle = 'rgba(8, 14, 24, 0.82)';
        ctx.fillRect(sx - 28, GROUND_Y - 47, 56, 8);
        ctx.fillStyle = heldBySomeone ? '#8fa3b8' : def.color;
        ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(heldBySomeone ? `${def.shortTag} (EM USO)` : def.name.slice(0, 14).toUpperCase(), sx, GROUND_Y - 41);
        ctx.textAlign = 'left';
      }
    }

    // 5. Precious Metal Mine (1 unique precious metal per island — mined by Builders!)
    if (w.preciousMine) {
      const mine = w.preciousMine;
      const shakeX = mine.hitShake > 0 ? Math.round(Math.sin(w.elapsed * 55) * 1.5) : 0;
      const sx = Math.round(mine.x - camX) + shakeX;
      if (sx > -64 && sx < this.viewW + 64) {
        const metalDef = PRECIOUS_METALS[mine.metalId];

        // Rocky outcrop mound behind mineshaft
        ctx.fillStyle = '#3d4754';
        ctx.fillRect(sx - 24, GROUND_Y - 22, 48, 22);
        ctx.fillStyle = '#4e5b6b';
        ctx.fillRect(sx - 20, GROUND_Y - 29, 40, 10);
        ctx.fillStyle = '#5e6d80';
        ctx.fillRect(sx - 14, GROUND_Y - 34, 28, 7);

        // Sparkling Precious Metal Ore Veins embedded in rock face
        const glisten = Math.floor(w.elapsed * 6) % 2 === 0;
        ctx.fillStyle = metalDef.color;
        ctx.fillRect(sx - 18, GROUND_Y - 19, 5, 4);
        ctx.fillRect(sx + 13, GROUND_Y - 22, 5, 4);
        ctx.fillRect(sx - 7, GROUND_Y - 31, 6, 3);
        ctx.fillStyle = glisten ? '#ffffff' : metalDef.highlight;
        ctx.fillRect(sx - 17, GROUND_Y - 18, 2, 2);
        ctx.fillRect(sx + 14, GROUND_Y - 21, 2, 2);
        ctx.fillRect(sx - 5, GROUND_Y - 30, 2, 2);

        // Dark Tunnel Entrance + Heavy Nordic Timber Arch
        ctx.fillStyle = '#0d121a';
        ctx.fillRect(sx - 9, GROUND_Y - 19, 18, 19);
        ctx.fillStyle = '#5c3c22';
        ctx.fillRect(sx - 12, GROUND_Y - 21, 3, 21);
        ctx.fillRect(sx + 9, GROUND_Y - 21, 3, 21);
        ctx.fillRect(sx - 14, GROUND_Y - 24, 28, 4);
        ctx.fillStyle = '#78502f';
        ctx.fillRect(sx - 13, GROUND_Y - 24, 26, 1);

        // Minecart Wooden Ties & Iron Rails
        ctx.fillStyle = '#5c3c22';
        ctx.fillRect(sx - 6, GROUND_Y - 2, 12, 2);
        ctx.fillStyle = '#8fa3b8';
        ctx.fillRect(sx - 5, GROUND_Y - 3, 10, 1);

        // Hanging Warm Miner Lantern
        const lanternFlick = Math.floor(w.elapsed * 10) % 2;
        ctx.fillStyle = '#332215';
        ctx.fillRect(sx + 7, GROUND_Y - 20, 1, 3);
        ctx.fillStyle = lanternFlick ? '#ffe58a' : '#ffad42';
        ctx.fillRect(sx + 6, GROUND_Y - 17, 3, 4);
        ctx.fillStyle = 'rgba(255, 210, 100, 0.22)';
        ctx.beginPath();
        ctx.arc(sx + 7.5, GROUND_Y - 15, 7, 0, Math.PI * 2);
        ctx.fill();

        // Metal Name Plate
        ctx.fillStyle = 'rgba(8, 14, 24, 0.82)';
        ctx.fillRect(sx - 28, GROUND_Y - 45, 56, 8);
        ctx.fillStyle = metalDef.highlight;
        ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`MINA: ${metalDef.name.toUpperCase()}`, sx, GROUND_Y - 39);
        ctx.textAlign = 'left';

        // Active Mining Progress Bar when marked for Builders
        if (mine.marked) {
          const barW = 28;
          ctx.fillStyle = 'rgba(8, 14, 24, 0.85)';
          ctx.fillRect(sx - 14, GROUND_Y - 52, barW, 4);
          ctx.fillStyle = metalDef.highlight;
          ctx.fillRect(sx - 13, GROUND_Y - 51, Math.round((barW - 2) * Math.min(1, mine.mineProgress)), 2);
        }
      }
    }
  }

  private drawElderCottages(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const elder of w.elders ?? []) {
      const sx = Math.round(elder.cottageX - camX);
      if (sx < -52 || sx > this.viewW + 52) continue;
      const def = ELDER_DEFS[elder.id];

      // Cozy timber-and-stone Nordic hermit cottage
      ctx.fillStyle = '#473322';
      ctx.fillRect(sx - 16, GROUND_Y - 19, 32, 19);
      ctx.fillStyle = '#5c432d';
      ctx.fillRect(sx - 14, GROUND_Y - 18, 28, 17);

      // Stone chimney on right + gentle rising smoke when Elder is still home
      ctx.fillStyle = '#556170';
      ctx.fillRect(sx + 8, GROUND_Y - 34, 5, 16);
      if (!elder.rescued) {
        const puff = Math.floor(w.elapsed * 4) % 4;
        ctx.fillStyle = 'rgba(218, 232, 245, 0.45)';
        ctx.fillRect(sx + 9, GROUND_Y - 37 - puff * 2, 3, 2);
        ctx.fillRect(sx + 10, GROUND_Y - 42 - puff * 2, 2, 2);
      }

      // Steep pitched roof trimmed in that Elder's signature color
      ctx.fillStyle = '#2d3744';
      ctx.beginPath();
      ctx.moveTo(sx - 20, GROUND_Y - 18);
      ctx.lineTo(sx, GROUND_Y - 33);
      ctx.lineTo(sx + 20, GROUND_Y - 18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = def.cloakColor;
      ctx.fillRect(sx - 17, GROUND_Y - 20, 34, 3);
      ctx.fillStyle = def.trimColor;
      ctx.fillRect(sx - 16, GROUND_Y - 18, 32, 1);

      // Doorway & glowing lantern window
      ctx.fillStyle = elder.rescued ? '#141922' : '#301d12';
      ctx.fillRect(sx - 4, GROUND_Y - 12, 8, 12);
      ctx.fillStyle = elder.rescued ? '#3c4a5c' : '#ffd873';
      ctx.fillRect(sx - 12, GROUND_Y - 14, 5, 5);
      ctx.fillRect(sx + 7, GROUND_Y - 14, 5, 5);

      // Signature Elder emblem on roof gable
      ctx.fillStyle = def.accentColor;
      ctx.fillRect(sx - 2, GROUND_Y - 27, 4, 4);

      // If still waiting to be rescued, peek the Elder outside the doorway + name plate!
      if (!elder.rescued) {
        this.drawElderSprite(ctx, w, elder.id, sx - 10, GROUND_Y, 1, 0, false);
        ctx.fillStyle = 'rgba(8, 14, 24, 0.84)';
        ctx.fillRect(sx - 26, GROUND_Y - 43, 52, 8);
        ctx.fillStyle = def.accentColor;
        ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`ANCIÃO: ${def.shortTitle}`, sx, GROUND_Y - 37);
        ctx.textAlign = 'left';
      }
    }
  }

  private drawElders(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    for (const elder of w.elders ?? []) {
      if (!elder.rescued || elder.state !== 'walking') continue;
      const sx = Math.round(elder.x - camX);
      if (sx < -24 || sx > this.viewW + 24) continue;
      const moving = Math.abs(elder.vx) > 3;
      const bob = moving ? Math.round(Math.abs(Math.sin(elder.animTime)) * 1.5) : 0;
      const stride = moving ? Math.round(Math.sin(elder.animTime) * 2) : 0;
      this.drawElderSprite(ctx, w, elder.id, sx, GROUND_Y - bob, elder.facing, stride, false);

      // Crisp floating title tag above walking Elder inside walls
      const def = ELDER_DEFS[elder.id];
      ctx.fillStyle = 'rgba(8, 14, 24, 0.72)';
      ctx.fillRect(sx - 15, GROUND_Y - 29 - bob, 30, 7);
      ctx.fillStyle = def.accentColor;
      ctx.font = 'bold 5px "Pixelify Sans", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(def.shortTitle, sx, GROUND_Y - 23.5 - bob);
      ctx.textAlign = 'left';
    }
  }

  private drawElderSprite(
    ctx: CanvasRenderingContext2D,
    w: WorldState,
    id: ElderId,
    sx: number,
    baseY: number,
    facing: -1 | 1,
    stride: number,
    mounted: boolean
  ): void {
    const def = ELDER_DEFS[id];

    // Boots (tucked when seated behind Monarch on horseback)
    if (!mounted) {
      ctx.fillStyle = '#2a221d';
      ctx.fillRect(sx - 2 + stride, baseY - 4, 2, 4);
      ctx.fillRect(sx + 1 - stride, baseY - 4, 2, 4);
    } else {
      ctx.fillStyle = '#2a221d';
      ctx.fillRect(sx - 1, baseY - 3, 2, 4);
    }

    // Cloak & Tunic (distinct proportions & trim per Elder)
    const bodyW = id === 'forge_elder' || id === 'war_elder' ? 8 : 6;
    const halfW = Math.floor(bodyW / 2);
    ctx.fillStyle = def.cloakColor;
    ctx.fillRect(sx - halfW, baseY - 12, bodyW, 8);
    ctx.fillStyle = def.trimColor;
    ctx.fillRect(sx - halfW, baseY - 7, bodyW, 1);

    // Distinct body details
    if (id === 'forge_elder') {
      // Heavy dark blacksmith leather apron
      ctx.fillStyle = '#33221a';
      ctx.fillRect(sx - 2, baseY - 11, 4, 7);
    } else if (id === 'beast_elder') {
      // White wolf-pelt mantle across shoulders
      ctx.fillStyle = '#e6eef5';
      ctx.fillRect(sx - 4, baseY - 12, 8, 3);
    } else if (id === 'builder_elder') {
      // Rolled white architectural blueprint on back
      ctx.fillStyle = '#eef6ff';
      ctx.fillRect(sx - facing * 4, baseY - 13, 2, 7);
    }

    // Face & Elder's White/Silver Beard
    ctx.fillStyle = '#e5be9e';
    ctx.fillRect(sx - 2, baseY - 16, 4, 4);
    ctx.fillStyle = id === 'forge_elder' ? '#d98a4e' : '#e6eef7';
    ctx.fillRect(sx - 2, baseY - 13, 4, 3);
    ctx.fillRect(sx - 1, baseY - 10, 2, 2);

    // Headgear & Signature Prop — EVERY ELDER IS COMPLETELY UNIQUE!
    if (id === 'bard') {
      // Feathered Purple Bard Cap + Golden Plume
      ctx.fillStyle = '#531e6e';
      ctx.fillRect(sx - 3, baseY - 18, 6, 3);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(sx - facing * 3, baseY - 21, 2, 4);
      // Golden Nordic Harp held in front + floating musical note
      ctx.fillStyle = '#f7d265';
      ctx.fillRect(sx + facing * 3, baseY - 13, 3, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + facing * 4, baseY - 12, 1, 4);
      const noteY = Math.round(Math.sin(w.elapsed * 5 + sx) * 2);
      ctx.fillStyle = def.accentColor;
      ctx.font = 'bold 6px "Pixelify Sans", monospace';
      ctx.fillText('♪', sx + facing * 5, baseY - 17 + noteY);
    } else if (id === 'forge_elder') {
      // Iron Blacksmith Headband
      ctx.fillStyle = '#8fa3b8';
      ctx.fillRect(sx - 3, baseY - 17, 6, 2);
      ctx.fillStyle = '#ff9d42';
      ctx.fillRect(sx - 1, baseY - 17, 2, 1);
      // Glowing Golden Forge Hammer
      ctx.fillStyle = '#7a4d28';
      ctx.fillRect(sx + facing * 4, baseY - 12, 1, 6);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(sx + facing * 4 - 2, baseY - 15, 5, 3);
    } else if (id === 'builder_elder') {
      // Tall Square Nordic Master Mason Cap
      ctx.fillStyle = '#15435c';
      ctx.fillRect(sx - 3, baseY - 19, 6, 3);
      ctx.fillStyle = '#84e8ff';
      ctx.fillRect(sx - 4, baseY - 17, 8, 1);
      // Golden Architect Compass / Square
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(sx + facing * 3, baseY - 13, 2, 6);
      ctx.fillRect(sx + facing * 3, baseY - 13, 4, 1);
    } else if (id === 'beast_elder') {
      // Iconic Branching Stag Antler Headdress
      ctx.fillStyle = '#8a623c';
      ctx.fillRect(sx - 4, baseY - 19, 2, 3);
      ctx.fillRect(sx + 2, baseY - 19, 2, 3);
      ctx.fillRect(sx - 5, baseY - 21, 2, 2);
      ctx.fillRect(sx + 3, baseY - 21, 2, 2);
      // Gnarled Nature Staff with Glowing Emerald Crystal
      ctx.fillStyle = '#6b4726';
      ctx.fillRect(sx + facing * 4, baseY - 16, 1, 13);
      ctx.fillStyle = '#6fe87b';
      ctx.fillRect(sx + facing * 4 - 1, baseY - 18, 3, 3);
    } else if (id === 'war_elder') {
      // Iconic Winged Norse War Helm (Steel + Gold Wings)
      ctx.fillStyle = '#a8b8c9';
      ctx.fillRect(sx - 3, baseY - 18, 6, 3);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(sx - 5, baseY - 20, 2, 3);
      ctx.fillRect(sx + 3, baseY - 20, 2, 3);
      // Curved Ivory-Brass War Horn (Trombeta) held forward!
      ctx.fillStyle = '#ffe58a';
      ctx.fillRect(sx + facing * 3, baseY - 12, 4, 2);
      ctx.fillStyle = '#fff8dc';
      ctx.fillRect(sx + facing * 6, baseY - 14, 2, 4);
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

    // Ensure selectedMapIsland is always a revealed island (and prefers a valid destination in sail mode)
    if (!isIslandSelectableOnMap(w, this.selectedMapIsland)) {
      const firstOpen = w.islands.find((i) => i.id !== w.currentIsland && isIslandSelectableOnMap(w, i.id));
      this.selectedMapIsland = firstOpen ? firstOpen.id : w.currentIsland;
    }

    // Header
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe58a';
    ctx.font = isPortrait ? 'bold 10px "Pixelify Sans", monospace' : 'bold 13px "Pixelify Sans", monospace';
    ctx.fillText(t('map_title'), Math.round(this.viewW / 2), 20);

    const openNewCount = w.islands.filter((i) => i.id > 1 && i.revealed && !i.conquered).length;
    const cloudCount = w.islands.filter((i) => !isIslandSelectableOnMap(w, i.id)).length;
    ctx.fillStyle = '#9ec4e0';
    ctx.font = '6.5px "Pixelify Sans", monospace';
    const subHint =
      w.worldMapContext === 'sail'
        ? cloudCount > 0
          ? `${openNewCount} novas rotas abertas · Conquiste uma ilha para revelar as nuvens`
          : 'Escolha uma ilha para zarpar · Segredos só revelados ao desembarcar'
        : cloudCount > 0
          ? `${openNewCount} novas rotas abertas · ${cloudCount} territórios sob nuvens`
          : 'Todas as rotas reveladas · Ilhas conquistadas livres para reexploração';
    ctx.fillText(subHint, Math.round(this.viewW / 2), 32, this.viewW - 20);

    const chartTop = 44;
    const chartBottom = this.viewH - 90;
    const chartH = Math.max(96, chartBottom - chartTop);
    const padX = isPortrait ? 20 : 28;
    const chartW = Math.max(120, this.viewW - padX * 2);

    const getPosById = (id: number) => {
      const node = getIslandMapNode(id);
      const nx = isPortrait ? node.portraitX : node.mapX;
      const ny = isPortrait ? node.portraitY : node.mapY;
      return {
        x: Math.round(padX + nx * chartW),
        y: Math.round(chartTop + 8 + ny * Math.max(40, chartH - 18)),
      };
    };

    // Non-sequential branching sea-route web!
    // Draw golden dashed routes between revealed islands, and misty fading stubs into cloud-covered neighbors
    const drawnPairs = new Set<string>();
    for (const def of ISLAND_DEFINITIONS) {
      const node = getIslandMapNode(def.id);
      const revA = isIslandSelectableOnMap(w, def.id);
      const pA = getPosById(def.id);

      for (const nextId of node.connections) {
        const key = def.id < nextId ? `${def.id}-${nextId}` : `${nextId}-${def.id}`;
        if (drawnPairs.has(key)) continue;
        drawnPairs.add(key);

        const revB = isIslandSelectableOnMap(w, nextId);
        if (!revA && !revB) continue; // Both hidden under clouds -> draw nothing

        const pB = getPosById(nextId);
        const midX = (pA.x + pB.x) / 2 + ((def.id + nextId) % 2 === 0 ? 10 : -10);
        const midY = (pA.y + pB.y) / 2 + ((def.id * 3 + nextId) % 2 === 0 ? -8 : 8);

        if (revA && revB) {
          ctx.strokeStyle = 'rgba(239, 196, 98, 0.42)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(pA.x, pA.y);
          ctx.quadraticCurveTo(midX, midY, pB.x, pB.y);
          ctx.stroke();
        } else {
          // Faint misty route leading from a revealed island into the clouds
          const from = revA ? pA : pB;
          const to = revA ? pB : pA;
          const stopX = from.x + (to.x - from.x) * 0.62;
          const stopY = from.y + (to.y - from.y) * 0.62;
          ctx.strokeStyle = 'rgba(130, 175, 210, 0.22)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(stopX, stopY);
          ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 1;

    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

    ISLAND_DEFINITIONS.forEach((def, idx) => {
      const pos = getPosById(def.id);
      const prog = w.islands.find((item) => item.id === def.id);
      const revealed = isIslandSelectableOnMap(w, def.id);
      const isCurrent = def.id === w.currentIsland;
      const isSelected = revealed && def.id === this.selectedMapIsland;
      const conquered = Boolean(prog?.conquered);
      const isOpenNew = revealed && !conquered && def.id > 1;

      if (!revealed) {
        // Animated swirling pixel-art Cloud Bank hiding this unrevealed island!
        const driftX = Math.sin(w.elapsed * 0.7 + def.id * 1.9) * 2.5;
        const driftY = Math.cos(w.elapsed * 0.55 + def.id * 1.3) * 1.2;
        const cxCloud = Math.round(pos.x + driftX);
        const cyCloud = Math.round(pos.y + driftY);

        // Deep shadow cloud base
        ctx.fillStyle = 'rgba(18, 30, 48, 0.92)';
        ctx.fillRect(cxCloud - 16, cyCloud - 4, 32, 11);
        ctx.fillRect(cxCloud - 12, cyCloud - 9, 24, 6);
        ctx.fillRect(cxCloud - 10, cyCloud + 6, 20, 4);

        // Mid silver-blue cloud puffs
        ctx.fillStyle = 'rgba(72, 98, 128, 0.85)';
        ctx.fillRect(cxCloud - 14, cyCloud - 6, 12, 8);
        ctx.fillRect(cxCloud - 5, cyCloud - 10, 13, 10);
        ctx.fillRect(cxCloud + 4, cyCloud - 5, 11, 8);

        // Soft misty top highlight
        ctx.fillStyle = 'rgba(155, 188, 218, 0.58)';
        ctx.fillRect(cxCloud - 11, cyCloud - 7, 8, 3);
        ctx.fillRect(cxCloud - 3, cyCloud - 10, 9, 3);
        ctx.fillRect(cxCloud + 6, cyCloud - 5, 6, 2);

        // Mystical "???" shimmer (no spoiler!)
        ctx.fillStyle = 'rgba(195, 220, 242, 0.72)';
        ctx.font = 'bold 6px "Pixelify Sans", monospace';
        ctx.fillText('???', cxCloud, cyCloud + 14);
        return; // Unclickable while covered in clouds!
      }

      // Beacon pulse on the 2 newly open unconquered routes
      if (isOpenNew) {
        const pulseR = 14 + Math.sin(w.elapsed * 3.4 + def.id) * 2;
        ctx.strokeStyle = 'rgba(126, 245, 255, 0.52)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulseR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = '#ffe066';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 16 + Math.sin(w.elapsed * 4) * 1.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      // Island silhouette mound (emerald if conquered, misty slate-teal if unexplored secret route)
      ctx.fillStyle = conquered ? '#2b5e49' : '#243a4f';
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 3, 13, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = conquered ? '#549674' : '#3d5e7a';
      ctx.beginPath();
      ctx.moveTo(pos.x - 9, pos.y + 3);
      ctx.lineTo(pos.x, pos.y - 7);
      ctx.lineTo(pos.x + 9, pos.y + 3);
      ctx.closePath();
      ctx.fill();

      // Clan Flag on conquered islands + Golden Crown on current island + "?" crest on untouched secret routes
      if (conquered) {
        ctx.fillStyle = '#c4a478';
        ctx.fillRect(pos.x + 2, pos.y - 13, 1, 9);
        ctx.fillStyle = w.crest.primaryColor;
        ctx.fillRect(pos.x + 3, pos.y - 13, 6, 4);
        ctx.fillStyle = w.crest.secondaryColor;
        ctx.fillRect(pos.x + 3, pos.y - 11, 6, 1);
      } else if (!isCurrent) {
        ctx.fillStyle = '#8ef5ff';
        ctx.font = 'bold 6.5px "Pixelify Sans", monospace';
        ctx.fillText('?', pos.x, pos.y - 9);
      }
      if (isCurrent) {
        this.drawCrownSprite(ctx, w, pos.x - 3, pos.y - 13);
      }

      // Roman numeral label
      ctx.fillStyle = isSelected ? '#ffe58a' : isOpenNew ? '#aef6ff' : '#d6e5f2';
      ctx.font = 'bold 6.5px "Pixelify Sans", monospace';
      ctx.fillText(romans[idx] ?? String(def.id), pos.x, pos.y + 15);

      this.addHit(`map_island_${def.id}`, pos.x - 16, pos.y - 16, 32, 34);
    });

    // Bottom Island Details Card — STRICTLY ZERO SPOILERS (no Gods, Buffs, Cavalry, Staves, Elders, or Weapons revealed!)
    const selDef = getIslandDef(this.selectedMapIsland);
    const selProg = w.islands.find((item) => item.id === selDef.id);
    const selConquered = Boolean(selProg?.conquered);
    const selCurrent = selDef.id === w.currentIsland;
    const selRoman = romans[selDef.id - 1] ?? String(selDef.id);
    const cardW = Math.min(358, this.viewW - 16);
    const cardX = Math.round((this.viewW - cardW) / 2);
    const cardY = this.viewH - 78;

    ctx.fillStyle = 'rgba(8, 14, 24, 0.95)';
    ctx.fillRect(cardX, cardY, cardW, 72);
    ctx.strokeStyle = 'rgba(239, 196, 98, 0.65)';
    ctx.strokeRect(cardX + 0.5, cardY + 0.5, cardW - 1, 71);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 8px "Pixelify Sans", monospace';
    const cardTitle = selCurrent
      ? `ILHA ${selRoman} · BASE ATUAL`
      : selConquered
        ? `ILHA ${selRoman} · TERRITÓRIO CONQUISTADO`
        : `ILHA ${selRoman} · TERRITÓRIO SECRETO`;
    ctx.fillText(cardTitle, cardX + 9, cardY + 14, cardW - 92);

    const statusTxt = selCurrent
      ? t('map_current')
      : selConquered
        ? 'REEXPLORAR'
        : 'NOVA ROTA';
    ctx.textAlign = 'right';
    ctx.fillStyle = selCurrent ? '#ffe066' : selConquered ? '#7ee08f' : '#7ef5ff';
    ctx.font = 'bold 6.5px "Pixelify Sans", monospace';
    ctx.fillText(statusTxt, cardX + cardW - 9, cardY + 14);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#c8dceb';
    ctx.font = '6.2px "Pixelify Sans", monospace';
    const line1 = selCurrent
      ? selDef.id === 1
        ? 'Ilha inicial básica · Construa o Drakkar e zarpe para desbravar novas terras.'
        : 'Você está nesta ilha · Conquiste-a para dissipar as nuvens sobre novas rotas.'
      : selConquered
        ? 'Ilha já conquistada e liberada para reexploração · Seus recursos locais aguardam lá.'
        : 'Segredos ocultos na névoa — deuses, anciões, montarias e forjas só se revelam ao desembarcar!';
    ctx.fillText(line1, cardX + 9, cardY + 26, cardW - 18);

    ctx.fillStyle = '#f7d265';
    ctx.font = '6px "Pixelify Sans", monospace';
    const line2 =
      w.worldMapContext === 'sail'
        ? 'No Drakkar vão apenas Ouro, Diamantes e Tripulação (madeira, pedra e minérios ficam na ilha).'
        : 'Toque em uma ilha revelada para ver seu status · Ilhas sob nuvens abrem após conquista.';
    ctx.fillText(line2, cardX + 9, cardY + 37, cardW - 18);

    // Action buttons: Sail (if in sail context, revealed, & different island) + Close
    const canSailHere =
      w.worldMapContext === 'sail' &&
      selDef.id !== w.currentIsland &&
      isIslandSelectableOnMap(w, selDef.id);
    if (canSailHere) {
      const btnW = 114;
      const bx = cardX + cardW - btnW - 9;
      const by = cardY + 46;
      ctx.fillStyle = '#2b2412';
      ctx.fillRect(bx, by, btnW, 20);
      ctx.strokeStyle = '#efc462';
      ctx.strokeRect(bx + 0.5, by + 0.5, btnW - 1, 19);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe58a';
      ctx.font = 'bold 7.5px "Pixelify Sans", monospace';
      ctx.fillText(t('map_sail_btn'), bx + btnW / 2, by + 13);
      this.addHit('map_sail_confirm', bx, by, btnW, 20);
    }

    const closeW = 90;
    const closeX = cardX + 9;
    const closeY = cardY + 46;
    ctx.fillStyle = '#162030';
    ctx.fillRect(closeX, closeY, closeW, 20);
    ctx.strokeStyle = 'rgba(180, 210, 235, 0.45)';
    ctx.strokeRect(closeX + 0.5, closeY + 0.5, closeW - 1, 19);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d4e4f2';
    ctx.font = 'bold 7px "Pixelify Sans", monospace';
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
      } else if (wall.spectralNightShield) {
        // Tyr's Spectral Circular Nordic Shield Wall (replaces fallen wall for 1 night!)
        const pulse = 0.72 + 0.28 * Math.sin(w.elapsed * 6.5);
        const h = 34;
        ctx.save();
        // Translucent golden-cyan rune barrier pillar
        ctx.fillStyle = `rgba(116, 224, 255, ${(0.28 * pulse).toFixed(2)})`;
        ctx.fillRect(sx - 10, GROUND_Y - h, 20, h);
        ctx.strokeStyle = wall.hitFlash > 0 ? '#ffffff' : '#9eeeff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx - 9.5, GROUND_Y - h + 0.5, 19, h - 1);

        // Glowing Circular Nordic Shield Emblem centered on the barrier
        const cy = GROUND_Y - 17;
        ctx.fillStyle = wall.hitFlash > 0 ? '#ffffff' : '#2d5878';
        ctx.beginPath();
        ctx.arc(sx, cy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffd966';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, cy, 9, 0, Math.PI * 2);
        ctx.stroke();
        // Inner Nordic spokes + Tyr rune boss
        ctx.fillStyle = '#9eeeff';
        ctx.fillRect(sx - 7, cy - 1, 14, 2);
        ctx.fillRect(sx - 1, cy - 7, 2, 14);
        ctx.fillStyle = '#fff5cc';
        ctx.fillRect(sx - 2, cy - 2, 4, 4);
        ctx.restore();

        if (wall.hp < wall.maxHp) {
          const pct = Math.max(0, wall.hp / Math.max(1, wall.maxHp));
          ctx.fillStyle = 'rgba(8, 14, 24, 0.85)';
          ctx.fillRect(sx - 10, GROUND_Y - h - 7, 20, 3);
          ctx.fillStyle = '#7ef5ff';
          ctx.fillRect(sx - 9, GROUND_Y - h - 6, Math.round(18 * pct), 1);
        }
      } else if (wall.level === 0) {
        ctx.fillStyle = '#5c4e43';
        ctx.fillRect(sx - 10, GROUND_Y - 4, 20, 4);
        ctx.fillStyle = '#75828f';
        ctx.fillRect(sx - 6, GROUND_Y - 6, 12, 3);
      } else {
        const h = getWallHeight(wall.level);
        const isStone = wall.level >= 3;
        const isIron = wall.level >= 6;
        const isAsgard = wall.level >= 9;
        const baseColor =
          wall.hitFlash > 0
            ? '#ffffff'
            : isAsgard
              ? '#5d6b80'
              : isIron
                ? '#455160'
                : isStone
                  ? '#6d7885'
                  : '#69472c';
        const darkColor =
          wall.hitFlash > 0
            ? '#e8e8e8'
            : isIron
              ? '#2b3440'
              : isStone
                ? '#4a5461'
                : '#4a301d';

        ctx.fillStyle = baseColor;
        ctx.fillRect(sx - 8, GROUND_Y - h, 16, h);
        ctx.fillStyle = darkColor;
        ctx.fillRect(sx - 8, GROUND_Y - h, 3, h);
        ctx.fillRect(sx + 1, GROUND_Y - h, 2, h);

        if (isIron) {
          ctx.fillStyle = isAsgard ? '#efc462' : '#96a8ba';
          ctx.fillRect(sx - 8, GROUND_Y - Math.floor(h * 0.3), 16, 2);
          ctx.fillRect(sx - 8, GROUND_Y - Math.floor(h * 0.72), 16, 2);
        }

        ctx.fillStyle = baseColor;
        for (let px = -7; px <= 5; px += 4) {
          ctx.fillRect(sx + px, GROUND_Y - h - 4, 3, 4);
        }

        if (wall.level >= 2) {
          drawShieldEmblem(ctx, w.crest, sx, GROUND_Y - Math.floor(h * 0.54), 5.0);
          const fl = Math.floor(w.elapsed * 10 + wall.id) % 2;
          ctx.fillStyle = isAsgard ? '#7ef5ff' : '#ff982b';
          ctx.fillRect(sx - 1, GROUND_Y - h - 7 - fl, 3, 4 + fl);
          ctx.fillStyle = isAsgard ? '#e6feff' : '#fff099';
          ctx.fillRect(sx, GROUND_Y - h - 6, 1, 2);

          ctx.fillStyle = 'rgba(8, 14, 24, 0.74)';
          ctx.fillRect(sx - 7, GROUND_Y - 9, 14, 7);
          ctx.fillStyle = '#ffe58a';
          ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${wall.level}`, sx, GROUND_Y - 3.5);
          ctx.textAlign = 'left';
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

  private drawPriorityDownArrow(ctx: CanvasRenderingContext2D, w: WorldState, cx: number, tipY: number): void {
    const bob = Math.round(Math.sin(w.elapsed * 7) * 2);
    const x = Math.round(cx);
    const y = Math.round(tipY + bob);

    // Subtle warm golden glow behind the downward arrow
    ctx.fillStyle = 'rgba(255, 214, 89, 0.28)';
    ctx.fillRect(x - 6, y - 13, 13, 14);

    // Dark pixel outline for strong readability over any sky/tree/snow
    ctx.fillStyle = '#1b1104';
    ctx.fillRect(x - 3, y - 12, 7, 6);
    ctx.fillRect(x - 6, y - 7, 13, 2);
    ctx.fillRect(x - 5, y - 5, 11, 2);
    ctx.fillRect(x - 3, y - 3, 7, 2);
    ctx.fillRect(x - 1, y - 1, 3, 2);

    // Bright metallic gold arrow pointing straight down
    ctx.fillStyle = '#ffcf40';
    ctx.fillRect(x - 2, y - 11, 5, 5);
    ctx.fillRect(x - 5, y - 6, 11, 2);
    ctx.fillRect(x - 3, y - 4, 7, 2);
    ctx.fillRect(x - 1, y - 2, 3, 2);
    ctx.fillRect(x, y, 1, 1);

    // Crisp specular highlight
    ctx.fillStyle = '#fff9cc';
    ctx.fillRect(x - 1, y - 10, 2, 5);
    ctx.fillRect(x - 2, y - 5, 4, 1);
  }

  private drawOrderedTaskTargetsAndPriorityArrow(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    if (w.mode !== 'playing') return;

    const prio = w.priorityTask;
    const registerTarget = (
      kind: 'wall' | 'tower' | 'forge' | 'boat' | 'dock' | 'farm' | 'brewery' | 'rock' | 'tree',
      id: number,
      worldX: number,
      halfW: number,
      height: number
    ) => {
      const sx = Math.round(worldX - camX);
      if (sx < -halfW - 12 || sx > this.viewW + halfW + 12) return;
      const topY = GROUND_Y - height;
      this.addHit(`task_prio_${kind}_${id}`, sx - halfW, topY + this.worldOffsetY, halfW * 2, height + 4);
      if (prio && prio.kind === kind && prio.id === id) {
        this.drawPriorityDownArrow(ctx, w, sx, topY - 4);
      }
    };

    for (const tr of w.trees) {
      if (tr.marked && !tr.chopped) {
        registerTarget('tree', tr.id, tr.x, 12, Math.max(24, tr.height));
      }
    }
    for (const r of w.rocks) {
      if (r.marked && !r.mined) {
        const rh = r.size === 'large' ? 22 : r.size === 'medium' ? 17 : 13;
        registerTarget('rock', r.id, r.x, 13, rh);
      }
    }
    for (const wall of w.walls) {
      if (wall.underConstruction) {
        const wh = Math.max(24, getWallHeight(Math.max(1, wall.targetLevel || wall.level)));
        registerTarget('wall', wall.id, wall.x, 13, wh);
      }
    }
    for (const tw of w.towers) {
      if (tw.underConstruction) {
        const th = Math.max(28, getTowerHeight(Math.max(1, tw.targetLevel || tw.level)));
        registerTarget('tower', tw.id, tw.x, 14, th);
      }
    }
    for (const farm of w.farms) {
      if (farm.underConstruction) {
        registerTarget('farm', farm.id, farm.x, 22, 24);
      }
    }
    for (const camp of w.camps) {
      if (camp.breweryUnderConstruction && !camp.isBrewery) {
        registerTarget('brewery', camp.id, camp.x, 20, 26);
      }
    }
    if (w.forge && w.forge.underConstruction && !w.forge.built) {
      registerTarget('forge', 0, w.forge.x, 18, 28);
    }
    if (w.boat.underConstruction && !w.boat.built) {
      registerTarget('boat', 0, w.boat.x, 26, 30);
    }
    if (w.dock.underConstruction && !w.dock.built) {
      registerTarget('dock', 0, w.dock.x, 24, 24);
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
    let baseY = GROUND_Y;
    if (v.role === 'archer' && v.assignedTowerId) {
      const tw = w.towers.find((item) => item.id === v.assignedTowerId && item.level > 0 && !item.destroyed);
      if (tw && Math.abs(v.x - tw.x) < 11) {
        baseY = GROUND_Y - getTowerHeight(tw.level) - 2;
      }
    }

    const isAscending = v.state === 'tribute_ascending';
    const isMarchingTribute = v.state === 'tribute_march';
    if (isAscending) {
      baseY -= Math.round(v.ascendY ?? 0);
    }

    const walkBob = isAscending
      ? Math.round(Math.sin(w.elapsed * 12) * 1.5)
      : Math.abs(v.vx) > 4
        ? Math.round(Math.abs(Math.sin(v.animTime)) * 1.5)
        : 0;
    const stride = isAscending ? 0 : Math.abs(v.vx) > 4 ? Math.round(Math.sin(v.animTime) * 2) : 0;
    const primary = v.isSummoned ? '#38ef7d' : w.crest.primaryColor;
    const secondary = v.isSummoned ? '#b8ffd2' : w.crest.secondaryColor;

    ctx.save();
    if (isAscending) {
      const fade = Math.max(0.25, 1 - (v.ascendY ?? 0) / 140);
      ctx.globalAlpha = fade;
      // Glowing celestial rapture halo surrounding the ascending subject
      const godCol = w.godShrine ? GOD_DEFS[w.godShrine.godId].color : '#ffe58a';
      ctx.fillStyle = `${godCol}66`;
      ctx.beginPath();
      ctx.arc(sx, baseY - 9, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 240, 0.5)';
      ctx.fillRect(sx - 4, baseY - 17, 8, 17);
    } else if (v.isSummoned) {
      // Spectral emerald shimmer around Loki's summoned archers & warriors
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = 'rgba(56, 239, 125, 0.24)';
      ctx.beginPath();
      ctx.arc(sx, baseY - 9, 9, 0, Math.PI * 2);
      ctx.fill();
    } else if (isMarchingTribute) {
      // Sacred tribute halo above queuing subject's head
      const godCol = w.godShrine ? GOD_DEFS[w.godShrine.godId].color : '#ffe58a';
      ctx.strokeStyle = godCol;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx, baseY - 19 - walkBob, 4, 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = v.isSummoned ? '#164d2c' : '#2d2522';
    ctx.fillRect(sx - 2 + stride, baseY - 4, 2, 4);
    ctx.fillRect(sx + 1 - stride, baseY - 4, 2, 4);

    if (v.isSummoned) ctx.fillStyle = '#25b863';
    else if (v.role === 'wanderer') ctx.fillStyle = '#6c5a4c';
    else if (v.role === 'peasant') ctx.fillStyle = '#9c866d';
    else if (v.role === 'warrior') ctx.fillStyle = primary;
    else if (v.role === 'spearman') ctx.fillStyle = '#365678';
    else if (v.role === 'archer') ctx.fillStyle = primary;
    else if (v.role === 'builder') ctx.fillStyle = '#4e5d6c';
    else ctx.fillStyle = '#5c734b';

    ctx.fillRect(sx - 3, baseY - 11 - walkBob, 6, 7);

    if (v.role !== 'wanderer' && v.role !== 'peasant') {
      ctx.fillStyle = secondary;
      ctx.fillRect(sx - 3, baseY - 7 - walkBob, 6, 1);
    }

    ctx.fillStyle = v.isSummoned ? '#a8ffcb' : '#e5be9e';
    ctx.fillRect(sx - 2, baseY - 15 - walkBob, 4, 4);

    if (v.state === 'assaulting') {
      // War-Elder Assault Company golden battle chevron above marching soldiers!
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(sx - 1, baseY - 21 - walkBob, 3, 2);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(sx, baseY - 22 - walkBob, 1, 2);
    }

    if (v.role === 'warrior') {
      ctx.fillStyle = v.isSummoned ? '#6fffab' : '#9aa8b8';
      ctx.fillRect(sx - 3, baseY - 17 - walkBob, 6, 3);
      ctx.fillStyle = secondary;
      ctx.fillRect(sx - 1, baseY - 16 - walkBob, 2, 1);
      ctx.fillStyle = v.isSummoned ? '#d4ffe5' : '#d4e2f0';
      ctx.fillRect(sx + v.facing * 4, baseY - 16 - walkBob, 2, 7);
      ctx.fillStyle = primary;
      ctx.fillRect(sx - v.facing * 4 - 1, baseY - 12 - walkBob, 4, 6);
      ctx.fillStyle = secondary;
      ctx.fillRect(sx - v.facing * 4, baseY - 10 - walkBob, 2, 2);
    } else if (v.role === 'spearman') {
      // Pointed Nordic Spangenhelm + Tall Polearm Spear!
      ctx.fillStyle = '#8fa3b8';
      ctx.fillRect(sx - 3, baseY - 17 - walkBob, 6, 2);
      ctx.fillStyle = '#c4d6e8';
      ctx.fillRect(sx - 1, baseY - 19 - walkBob, 2, 2);
      // Long angled Nordic wooden spear shaft & gleaming steel/gold tip
      ctx.fillStyle = '#8a5d32';
      ctx.fillRect(sx + v.facing * 3, baseY - 19 - walkBob, 1, 14);
      ctx.fillStyle = '#e6f2ff';
      ctx.fillRect(sx + v.facing * 3 - 1, baseY - 23 - walkBob, 3, 4);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(sx + v.facing * 3, baseY - 19 - walkBob, 1, 1);
    } else if (v.role === 'archer') {
      ctx.fillStyle = primary;
      ctx.fillRect(sx - 3, baseY - 16 - walkBob, 6, 2);
      ctx.fillStyle = v.isSummoned ? '#9affc3' : '#c48d4e';
      ctx.fillRect(sx + v.facing * 3, baseY - 13 - walkBob, 2, 7);
    } else if (v.role === 'builder') {
      ctx.fillStyle = primary;
      ctx.fillRect(sx - 3, baseY - 16 - walkBob, 6, 2);
      ctx.fillStyle = '#9aa8b8';
      ctx.fillRect(sx + v.facing * 3, baseY - 14 - walkBob, 3, 2);
      ctx.fillStyle = '#8c6036';
      ctx.fillRect(sx + v.facing * 3, baseY - 12 - walkBob, 1, 5);
    } else if (v.role === 'producer') {
      ctx.fillStyle = '#c9a66b';
      ctx.fillRect(sx - 4, baseY - 16 - walkBob, 8, 2);
      ctx.fillStyle = primary;
      ctx.fillRect(sx - 2, baseY - 11 - walkBob, 4, 2);
      if (v.state === 'fishing' && Math.abs(v.vx) < 2) {
        // Pixel fishing rod casting into the fjord river!
        const dir = v.facing;
        const rodTipX = sx + dir * 14;
        const rodTipY = baseY - 17;
        ctx.strokeStyle = '#9c6e3b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + dir * 2, baseY - 9);
        ctx.lineTo(rodTipX, rodTipY);
        ctx.stroke();

        // Fishing line dropping down into water with bobbing float
        const bob = Math.round(Math.sin(w.elapsed * 4 + v.id) * 1);
        const floatY = GROUND_Y + 9 + bob;
        ctx.strokeStyle = 'rgba(220, 240, 255, 0.72)';
        ctx.beginPath();
        ctx.moveTo(rodTipX, rodTipY);
        ctx.lineTo(rodTipX + dir * 2, floatY);
        ctx.stroke();

        ctx.fillStyle = '#ff5768';
        ctx.fillRect(rodTipX + dir * 2 - 1, floatY - 1, 2, 2);
        ctx.fillStyle = 'rgba(205, 240, 255, 0.6)';
        ctx.fillRect(rodTipX + dir * 2 - 3, floatY + 1, 6, 1);
      } else {
        ctx.fillStyle = '#7bd468';
        ctx.fillRect(sx + v.facing * 3, baseY - 10 - walkBob, 2, 3);
      }
    } else if (v.role === 'wanderer') {
      ctx.fillStyle = '#4a3d34';
      ctx.fillRect(sx - 2, baseY - 16 - walkBob, 4, 2);
    }

    if (v.carriedCoins > 0) {
      ctx.fillStyle = '#f7d265';
      ctx.fillRect(sx - 1, baseY - 20 - walkBob, 3, 3);
    }

    if (v.orderFlashTimer > 0) {
      ctx.fillStyle = secondary;
      ctx.font = 'bold 8px "Pixelify Sans", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(v.orderDir < 0 ? '◀' : '▶', sx, baseY - 22 - walkBob);
      ctx.textAlign = 'left';
    }

    ctx.restore();

    // Recruited villagers (everyone except wanderers) can be tapped/clicked to choose left/right!
    if (
      w.mode === 'playing' &&
      v.role !== 'wanderer' &&
      !v.isSummoned &&
      v.state !== 'embarked' &&
      v.state !== 'boarding' &&
      !isAscending &&
      !isMarchingTribute
    ) {
      const screenY = baseY + this.worldOffsetY;
      this.addHit(`villager_pick_${v.id}`, sx - 9, screenY - 22, 18, 25);

      if (w.selectedVillagerId === v.id) {
        const pulse = 0.65 + 0.35 * Math.sin(w.elapsed * 7);
        ctx.strokeStyle = `rgba(255, 229, 138, ${pulse.toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 6.5, baseY - 19.5 - walkBob, 13, 21);
      }
    }
  }

  private drawSelectedVillagerPicker(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    const v = w.villagers.find(
      (item) => item.id === w.selectedVillagerId && item.role !== 'wanderer' && item.state !== 'embarked'
    );
    if (!v) return;

    let baseY = GROUND_Y;
    if (v.role === 'archer' && v.assignedTowerId) {
      const tw = w.towers.find((item) => item.id === v.assignedTowerId && item.level > 0 && !item.destroyed);
      if (tw && Math.abs(v.x - tw.x) < 11) {
        baseY = GROUND_Y - getTowerHeight(tw.level) - 2;
      }
    }

    const sx = Math.round(v.x - camX);
    const screenY = baseY + this.worldOffsetY;

    const pw = 88;
    const ph = 32;
    const px = Math.max(6, Math.min(this.viewW - pw - 6, Math.round(sx - pw / 2)));
    const py = Math.max(46, Math.round(screenY - 56));

    // Pixel-art selector box
    ctx.fillStyle = 'rgba(7, 14, 24, 0.94)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#efc462';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

    // Small downward pointer triangle toward the villager
    const tipX = Math.max(px + 8, Math.min(px + pw - 8, sx));
    ctx.fillStyle = '#efc462';
    ctx.fillRect(tipX - 2, py + ph, 5, 1);
    ctx.fillRect(tipX - 1, py + ph + 1, 3, 1);
    ctx.fillRect(tipX, py + ph + 2, 1, 1);

    const roleLabel =
      v.role === 'archer'
        ? t('role_archer')
        : v.role === 'builder'
          ? t('role_builder')
          : v.role === 'warrior'
            ? t('role_warrior')
            : v.role === 'producer'
              ? t('role_producer')
              : t('role_peasant');

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 6px "Pixelify Sans", monospace';
    ctx.fillText(roleLabel, px + 5, py + 9);

    // Tiny close [x] button on top-right
    const cxX = px + pw - 12;
    const cxY = py + 2;
    ctx.fillStyle = '#3b1822';
    ctx.fillRect(cxX, cxY, 10, 9);
    ctx.fillStyle = '#ffd4dc';
    ctx.textAlign = 'center';
    ctx.font = 'bold 6.5px "Pixelify Sans", monospace';
    ctx.fillText('×', cxX + 5, cxY + 7);
    this.addHit('villager_dir_close', cxX - 2, cxY - 2, 14, 13);

    // Left [◀ ESQ] and Right [DIR ▶] arrow buttons
    const btnY = py + 13;
    const btnH = 15;
    const btnW = 38;

    const leftActive = v.side === -1;
    ctx.fillStyle = leftActive ? '#2c4466' : '#142033';
    ctx.fillRect(px + 4, btnY, btnW, btnH);
    ctx.strokeStyle = leftActive ? '#7ef5ff' : '#efc462';
    ctx.strokeRect(px + 4.5, btnY + 0.5, btnW - 1, btnH - 1);
    ctx.fillStyle = leftActive ? '#b8f7ff' : '#ffe58a';
    ctx.font = 'bold 7px "Pixelify Sans", monospace';
    ctx.fillText(`◀ ${t('dir_left_short')}`, px + 4 + btnW / 2, btnY + 10.5);
    this.addHit('villager_dir_left', px + 2, btnY - 1, btnW + 3, btnH + 3);

    const rightX = px + pw - btnW - 4;
    const rightActive = v.side === 1;
    ctx.fillStyle = rightActive ? '#2c4466' : '#142033';
    ctx.fillRect(rightX, btnY, btnW, btnH);
    ctx.strokeStyle = rightActive ? '#7ef5ff' : '#efc462';
    ctx.strokeRect(rightX + 0.5, btnY + 0.5, btnW - 1, btnH - 1);
    ctx.fillStyle = rightActive ? '#b8f7ff' : '#ffe58a';
    ctx.fillText(`${t('dir_right_short')} ▶`, rightX + btnW / 2, btnY + 10.5);
    this.addHit('villager_dir_right', rightX - 1, btnY - 1, btnW + 3, btnH + 3);

    ctx.textAlign = 'left';
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
    const app = m.appearance ?? w.appearance;
    const outfit = OUTFIT_PRESETS[app.outfitIndex] ?? OUTFIT_PRESETS[0];
    const hair = HAIR_PRESETS[app.hairIndex] ?? HAIR_PRESETS[0];
    const horse = HORSE_PRESETS[app.horseIndex] ?? HORSE_PRESETS[0];
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

    // Saddle cloth + Mounted Elder (seated behind the Monarch on the horse's back!) + Monarch Rider
    ctx.fillStyle = primary;
    ctx.fillRect(-4, -14 - bob + riderYOffset, 8, 5);
    ctx.fillStyle = secondary;
    ctx.fillRect(-4, -10 - bob + riderYOffset, 8, 1);

    if (m.ridingElderId && scale === 1) {
      this.drawElderSprite(
        ctx,
        w,
        m.ridingElderId,
        -f * 7,
        -10 - bob + riderYOffset,
        f,
        0,
        true
      );
    }

    const isQueen = app.gender === 'queen';

    const capeSway = moving ? (m.sprinting ? 5 : 3) : 1;
    const armor = m.armor ?? {};
    const cloakMetal = armor.cloak ? PRECIOUS_METALS[armor.cloak] : null;
    const chestMetal = armor.chestplate
      ? PRECIOUS_METALS[armor.chestplate]
      : armor.royal_aegis
        ? PRECIOUS_METALS[armor.royal_aegis]
        : null;
    const pauldronMetal = armor.pauldrons ? PRECIOUS_METALS[armor.pauldrons] : null;
    const helmetMetal = armor.helmet ? PRECIOUS_METALS[armor.helmet] : null;

    ctx.fillStyle = cloakMetal ? cloakMetal.color : primary;
    ctx.fillRect(-f * (4 + capeSway) - (f > 0 ? 4 : 0), -21 - bob + riderYOffset, 6 + capeSway, isQueen ? 8 : 7);
    if (cloakMetal) {
      ctx.fillStyle = cloakMetal.highlight;
      ctx.fillRect(-f * (4 + capeSway) - (f > 0 ? 4 : 0), -15 - bob + riderYOffset, 6 + capeSway, 1);
    }

    // Body / Tunic or Royal Gown (+ Forged Precious-Metal Chestplate & Pauldrons!)
    ctx.fillStyle = chestMetal ? chestMetal.color : outfit.tunic;
    ctx.fillRect(-3, -21 - bob + riderYOffset, 6, 8);
    if (chestMetal) {
      ctx.fillStyle = chestMetal.highlight;
      ctx.fillRect(-2, -20 - bob + riderYOffset, 4, 2);
      ctx.fillRect(-1, -18 - bob + riderYOffset, 2, 3);
    }
    if (pauldronMetal) {
      ctx.fillStyle = pauldronMetal.highlight;
      ctx.fillRect(-4, -22 - bob + riderYOffset, 2, 3);
      ctx.fillRect(2, -22 - bob + riderYOffset, 2, 3);
    }
    if (isQueen) {
      // Refined royal waist & flowing skirt hem
      ctx.fillStyle = primary;
      ctx.fillRect(-3, -15 - bob + riderYOffset, 6, 3);
      ctx.fillStyle = secondary;
      ctx.fillRect(-3, -16 - bob + riderYOffset, 6, 1);
      ctx.fillRect(-2, -13 - bob + riderYOffset, 4, 1);
    } else {
      ctx.fillStyle = armor.belt ? PRECIOUS_METALS[armor.belt].highlight : secondary;
      ctx.fillRect(-3, -15 - bob + riderYOffset, 6, 1);
    }

    // Head & Hair (Queen: long flowing hair/braid, no beard; King: Nordic beard)
    ctx.fillStyle = outfit.skin;
    ctx.fillRect(-2, -25 - bob + riderYOffset, 4, 4);
    ctx.fillStyle = hair.color;
    if (isQueen) {
      const hairFlow = moving ? 2 : 1;
      // Crown-framed top hair + flowing mane behind shoulder
      ctx.fillRect(-3, -25 - bob + riderYOffset, 1, 5);
      ctx.fillRect(2, -25 - bob + riderYOffset, 1, 4);
      ctx.fillRect(f > 0 ? -4 - hairFlow : 2, -24 - bob + riderYOffset, 2 + hairFlow, 5);
      ctx.fillRect(f > 0 ? -4 - hairFlow : 3, -19 - bob + riderYOffset, 2, 3);
    } else {
      ctx.fillRect(-3, -25 - bob + riderYOffset, 1, 4);
      // King always sports a regal Nordic beard
      ctx.fillRect(f > 0 ? 0 : -2, -22 - bob + riderYOffset, 3, 3);
      if (outfit.hasBeard) {
        ctx.fillRect(f > 0 ? 1 : -2, -20 - bob + riderYOffset, 2, 1);
      }
    }
    if (helmetMetal) {
      ctx.fillStyle = helmetMetal.color;
      ctx.fillRect(-3, -26 - bob + riderYOffset, 6, 2);
      ctx.fillStyle = helmetMetal.highlight;
      ctx.fillRect(-2, -26 - bob + riderYOffset, 4, 1);
    } else if (outfit.hasHood) {
      ctx.fillStyle = outfit.tunic;
      ctx.fillRect(-3, -26 - bob + riderYOffset, 6, 2);
    }

    if (m.hasCrown) {
      if (m.crownShieldReady) {
        ctx.strokeStyle = 'rgba(132, 232, 255, 0.72)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, -27 - bob + riderYOffset, 5.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      this.drawCrownSprite(ctx, w, 0, -27 - bob + riderYOffset);
    }

    // Equipped Divine Weapon / Magic Relic held visibly at the Monarch's side!
    if (m.weapon) {
      const wDef = WEAPON_DEFS[m.weapon];
      const wx = f * 5;
      const wy = -19 - bob + riderYOffset;
      const glowReady = (m.weaponCooldown ?? 0) <= 0;
      if (glowReady) {
        ctx.fillStyle = `${wDef.color}3a`;
        ctx.beginPath();
        ctx.arc(wx, wy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (m.weapon === 'thor_hammer') {
        ctx.fillStyle = '#7d522a';
        ctx.fillRect(wx, wy - 1, 1, 6);
        ctx.fillStyle = '#c4d8eb';
        ctx.fillRect(wx - 2, wy - 4, 5, 3);
        ctx.fillStyle = wDef.color;
        ctx.fillRect(wx - 1, wy - 3, 3, 1);
      } else if (m.weapon === 'freya_bow') {
        ctx.fillStyle = wDef.color;
        ctx.fillRect(wx, wy - 4, 1, 8);
        ctx.fillStyle = '#fff5d6';
        ctx.fillRect(wx + f, wy - 3, 1, 6);
      } else if (m.weapon === 'tyr_shield') {
        ctx.fillStyle = '#3b5873';
        ctx.beginPath();
        ctx.arc(-f * 4, wy + 1, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = wDef.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(-f * 4, wy + 1, 4, 0, Math.PI * 2);
        ctx.stroke();
      } else if (m.weapon === 'loki_staff' || m.weapon === 'baldr_scepter') {
        ctx.fillStyle = '#6b4626';
        ctx.fillRect(wx, wy - 3, 1, 9);
        ctx.fillStyle = wDef.color;
        ctx.fillRect(wx - 1, wy - 6, 3, 3);
      } else if (m.weapon === 'staff_fire' || m.weapon === 'staff_ice' || m.weapon === 'staff_thunder') {
        // Sacred Yggdrasil Elemental Staff with pulsing crystal orb
        ctx.fillStyle = '#785028';
        ctx.fillRect(wx, wy - 4, 1, 11);
        ctx.fillStyle = '#d4a650';
        ctx.fillRect(wx - 1, wy - 5, 3, 1);
        ctx.fillStyle = wDef.color;
        ctx.fillRect(wx - 1, wy - 8, 3, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(wx, wy - 7, 1, 1);
      } else if (m.weapon === 'ymir_rune') {
        ctx.fillStyle = wDef.color;
        ctx.fillRect(wx - 1, wy - 3, 3, 5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(wx, wy - 2, 1, 3);
      } else if (m.weapon === 'heimdall_horn') {
        ctx.fillStyle = wDef.color;
        ctx.fillRect(wx - 1, wy - 1, 4, 2);
        ctx.fillRect(wx + f * 2, wy - 2, 2, 4);
      } else {
        // Gungnir spear / Surtr blade
        ctx.fillStyle = '#734b28';
        ctx.fillRect(wx, wy, 1, 5);
        ctx.fillStyle = wDef.color;
        ctx.fillRect(wx, wy - 6, 2, 6);
      }
    }

    // Subtle pixel name tag in Co-op so teammates recognize each other
    if (scale === 1 && w.monarchs.length > 1) {
      const tag = (m.playerName || app.name || '').trim();
      if (tag) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
        ctx.fillStyle = m.playerUid === w.localPlayerUid ? '#ffe58a' : '#8ef7ff';
        ctx.fillText(tag.slice(0, 14), 0, -34 - bob + riderYOffset);
        ctx.textAlign = 'left';
      }
    }

    // Nighttime Torch carried in front hand (always active at dusk/night in gameplay!)
    const carryTorch = scale === 1 && (w.isNight || (w.timeOfDay >= 0.45 && w.timeOfDay < 0.99));
    if (carryTorch) {
      const tx = f * 5;
      const ty = -20 - bob + riderYOffset;
      const flick = Math.floor(w.elapsed * 14) % 3;
      // Arm & wooden torch shaft
      ctx.fillStyle = outfit.tunic;
      ctx.fillRect(f > 0 ? 2 : -4, ty + 2, 3, 2);
      ctx.fillStyle = '#734824';
      ctx.fillRect(tx, ty - 2, 2, 6);
      ctx.fillStyle = '#4a4e57';
      ctx.fillRect(tx - 1, ty - 3, 4, 2);
      // Warm pixel halo directly around flame
      ctx.fillStyle = 'rgba(255, 178, 64, 0.34)';
      ctx.fillRect(tx - 3, ty - 9, 8, 8);
      // 3-layer flickering pixel flame
      ctx.fillStyle = '#ff5e1f';
      ctx.fillRect(tx - 1, ty - 6 - (flick === 1 ? 1 : 0), 4, 3 + (flick === 1 ? 1 : 0));
      ctx.fillStyle = '#ffb52e';
      ctx.fillRect(tx, ty - 7 - (flick === 2 ? 1 : 0), 2, 4);
      ctx.fillStyle = '#fff8bf';
      ctx.fillRect(tx, ty - 5, 2, 2);
      // Rising pixel spark
      const sparkY = ty - 9 - ((Math.floor(w.elapsed * 10) % 4));
      ctx.fillStyle = '#ffe58a';
      ctx.fillRect(tx + (flick === 0 ? 1 : 0), sparkY, 1, 1);
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
      if (fc.progress < 0) continue;
      const p = Math.min(1, fc.progress);
      const ease = 1 - Math.pow(1 - p, 2);
      const wx = lerp(fc.startX, fc.targetX, ease);
      const arcH = 26 + Math.min(18, Math.abs(fc.targetX - fc.startX) * 0.22);
      const wy = lerp(fc.startY, fc.targetY, ease) - Math.sin(p * Math.PI) * arcH;
      const sx = Math.round(wx - camX);
      const sy = Math.round(wy + this.worldOffsetY);
      const spinThin = Math.sin(p * Math.PI * 5) > 0.72;

      if (fc.currency === 'diamond') {
        ctx.fillStyle = 'rgba(8, 12, 18, 0.72)';
        ctx.fillRect(sx - 3, sy - 4, 6, 8);
        ctx.fillStyle = '#2da8c4';
        ctx.fillRect(sx - 3, sy - 3, 6, 6);
        ctx.fillStyle = '#7ef5ff';
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 1, sy - 2, 2, 2);
      } else {
        const halfW = spinThin ? 2 : 3;
        const fullW = spinThin ? 4 : 6;
        ctx.fillStyle = 'rgba(8, 12, 18, 0.72)';
        ctx.fillRect(sx - halfW - 1, sy - 3, fullW + 2, 6);
        ctx.fillRect(sx - halfW, sy - 4, fullW, 8);
        ctx.fillStyle = '#b87f14';
        ctx.fillRect(sx - halfW, sy - 3, fullW, 6);
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(sx - halfW + 1, sy - 2, Math.max(2, fullW - 2), 4);
        ctx.fillStyle = '#fff9d6';
        ctx.fillRect(sx - halfW + 1, sy - 2, 2, 2);
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

    if (w.isNight || (w.timeOfDay >= 0.45 && w.timeOfDay < 0.99)) {
      const torchFlick = Math.sin(w.elapsed * 15) * 3.5 + Math.cos(w.elapsed * 23) * 1.5;
      for (const monarch of w.monarchs) {
        const torchWorldX = monarch.x + monarch.facing * 6;
        const torchY = GROUND_Y - 23 - Math.round(monarch.flyY);
        drawGlow(
          torchWorldX,
          torchY,
          74 + torchFlick,
          `rgba(255, 168, 68, ${(0.36 * nightFactor).toFixed(2)})`
        );
        drawGlow(
          torchWorldX,
          torchY,
          28 + torchFlick * 0.4,
          `rgba(255, 224, 132, ${(0.28 * nightFactor).toFixed(2)})`
        );
      }
    }

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
    this.reflectionCtx.imageSmoothingEnabled = false;
    this.reflectionCtx.clearRect(0, 0, this.viewW, this.waterScreenY);
    this.reflectionCtx.drawImage(
      ctx.canvas,
      0,
      0,
      Math.round(this.viewW * this.renderScale),
      Math.round(this.waterScreenY * this.renderScale),
      0,
      0,
      this.viewW,
      this.waterScreenY
    );

    const waterH = Math.max(10, this.viewH - this.waterScreenY);
    const waterGrad = ctx.createLinearGradient(0, this.waterScreenY, 0, this.viewH);
    const islWater = getIslandDef(w.currentIsland).theme.waterTintDay;
    const wTop = lerpRGB(islWater, { r: 7, g: 16, b: 28 }, nightFactor);
    const wBot = lerpRGB(
      { r: Math.round(islWater.r * 0.45), g: Math.round(islWater.g * 0.45), b: Math.round(islWater.b * 0.5) },
      { r: 3, g: 8, b: 16 },
      nightFactor
    );
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
    const season = w.season ?? 'summer';
    for (let i = 0; i < w.particles.length; i++) {
      const p = w.particles[i];
      if (p.kind !== 'snow') continue;
      if (season === 'winter') {
        ctx.globalAlpha = Math.min(1, p.alpha * 1.15);
        ctx.fillStyle = '#e4f2fc';
      } else if (season === 'autumn') {
        ctx.globalAlpha = p.alpha * 0.85;
        ctx.fillStyle = i % 2 === 0 ? '#e8933d' : '#c95c2b';
      } else if (season === 'spring') {
        if (i % 2 === 1) continue;
        ctx.globalAlpha = p.alpha * 0.65;
        ctx.fillStyle = i % 4 === 0 ? '#ffd1e6' : '#fff3b0';
      } else {
        // Summer: light sparse warm pollen/firefly motes
        if (i % 3 !== 0) continue;
        ctx.globalAlpha = p.alpha * 0.42;
        ctx.fillStyle = '#ffe999';
      }
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawMaterialIcon(
    ctx: CanvasRenderingContext2D,
    kind: 'wood' | 'stone' | 'iron' | 'bank',
    x: number,
    y: number
  ): void {
    if (kind === 'wood') {
      ctx.fillStyle = '#8a5a32';
      ctx.fillRect(x, y + 1, 6, 4);
      ctx.fillStyle = '#c48d4e';
      ctx.fillRect(x, y + 1, 2, 4);
      ctx.fillStyle = '#5c381c';
      ctx.fillRect(x + 2, y + 2, 4, 1);
    } else if (kind === 'stone') {
      ctx.fillStyle = '#7e8c9c';
      ctx.fillRect(x, y + 1, 6, 4);
      ctx.fillStyle = '#b4c2d0';
      ctx.fillRect(x + 1, y, 4, 3);
    } else if (kind === 'iron') {
      ctx.fillStyle = '#6f8296';
      ctx.fillRect(x, y + 2, 6, 3);
      ctx.fillStyle = '#d2e2f2';
      ctx.fillRect(x + 1, y + 1, 4, 2);
    } else {
      ctx.fillStyle = '#d9a738';
      ctx.fillRect(x, y + 1, 6, 4);
      ctx.fillStyle = '#fff2a6';
      ctx.fillRect(x + 1, y + 2, 4, 1);
    }
  }

  private drawWithdrawCoinIcon(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    topY: number,
    enabled: boolean
  ): void {
    ctx.save();
    if (!enabled) ctx.globalAlpha = 0.36;
    const coinX = Math.round(centerX - 3.5);
    const coinY = Math.round(topY - 1);
    this.drawMinimalCoinIcon(ctx, coinX, coinY);

    // Crisp downward pixel arrow directly below the coin (sacar moedas)
    const ax = Math.round(centerX);
    const ay = coinY + 8;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.8)';
    ctx.fillRect(ax - 3, ay - 1, 7, 2);
    ctx.fillRect(ax - 2, ay + 1, 5, 2);
    ctx.fillRect(ax - 1, ay + 3, 3, 1);

    ctx.fillStyle = enabled ? '#7cf78c' : '#9fb2c4';
    ctx.fillRect(ax - 2, ay, 5, 1);
    ctx.fillRect(ax - 1, ay + 1, 3, 1);
    ctx.fillRect(ax, ay + 2, 1, 1);
    ctx.restore();
  }

  private drawFloatingPrompt(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    const pr = w.activePrompt;
    if (!pr) return;
    const sx = Math.round(pr.x - camX);
    const bob = Math.round(Math.sin(w.elapsed * 5) * 1.2);
    const sy = Math.round(pr.y + this.worldOffsetY + bob);

    const isDiamond = pr.currency === 'diamond';
    const isBanker = pr.targetType === 'banker';
    const isBlocked = Boolean(pr.blockedReason);
    const showCta =
      Boolean(pr.label) &&
      (isBlocked || !pr.actionClass || !w.completedActionClasses?.[pr.actionClass]);

    // Fixed coin slot row anchored at sy - 8 so flying coins land dead-center inside each slot!
    const coinRowY = sy - 8;

    // 1. BLOCKED PROMPT (transparent text only, no dark box!)
    if (isBlocked && pr.blockedReason) {
      const cx = Math.max(54, Math.min(this.viewW - 54, sx));
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffab91';
      ctx.font = 'bold 6.5px "Pixelify Sans", monospace';
      ctx.fillText(pr.label, cx, coinRowY - 2);
      ctx.fillStyle = '#ffe0b2';
      ctx.font = 'bold 5.8px "Pixelify Sans", monospace';
      ctx.fillText(pr.blockedReason, cx, coinRowY + 7);
      ctx.textAlign = 'left';
      return;
    }

    // 2. BANKER PROMPT (ONLY shown when passing near Banker — zero dark boxes!)
    //    Row 1: [Coin icon] [Total Gold]  [+X% in green]
    //    Row 2: [Deposit Coin Slot]   [Withdraw Coin + Down Arrow Button]
    if (isBanker) {
      const centerX = Math.max(38, Math.min(this.viewW - 38, sx));
      const balance = pr.bankBalance ?? w.banker.balance;
      const ratePct = pr.bankRatePct ?? getBankerDailyRatePct(w.hall.level);
      const balTxt = `${balance}`;
      const pctTxt = `+${ratePct}%`;

      ctx.font = 'bold 8px "Pixelify Sans", monospace';
      const balW = Math.ceil(ctx.measureText(balTxt).width);
      ctx.font = 'bold 7.5px "Pixelify Sans", monospace';
      const pctW = Math.ceil(ctx.measureText(pctTxt).width);
      const infoTotalW = 8 + balW + 7 + pctW;
      const infoStartX = Math.round(centerX - infoTotalW / 2);
      const infoY = coinRowY - 6;

      // Coin icon + total coins in the bank
      this.drawMinimalCoinIcon(ctx, infoStartX, infoY - 6);
      ctx.textAlign = 'left';
      ctx.font = 'bold 8px "Pixelify Sans", monospace';
      ctx.fillStyle = '#ffe58a';
      ctx.fillText(balTxt, infoStartX + 9, infoY);

      // Green yield percentage right beside it
      ctx.font = 'bold 7.5px "Pixelify Sans", monospace';
      ctx.fillStyle = '#6fe87b';
      ctx.fillText(pctTxt, infoStartX + 9 + balW + 6, infoY);

      // Left control: Deposit Slot (1 coin per click, jumping from monarch into this slot!)
      const depCenterX = centerX - 10;
      const depSlotX = Math.round(depCenterX - 3.5);
      ctx.fillStyle = 'rgba(8, 12, 18, 0.72)';
      ctx.fillRect(depSlotX - 1, coinRowY - 1, 9, 9);
      ctx.fillStyle = pr.pending > 0 ? 'rgba(255, 224, 102, 0.35)' : 'rgba(247, 210, 101, 0.16)';
      ctx.fillRect(depSlotX, coinRowY, 7, 7);
      ctx.strokeStyle = pr.pending > 0 ? '#fff5bd' : '#f7d265';
      ctx.lineWidth = 1;
      ctx.strokeRect(depSlotX + 0.5, coinRowY + 0.5, 6, 6);
      this.addHit('prompt_coin_slot', depCenterX - 9, coinRowY - 6, 18, 22);

      // Right control: Withdraw Button (coin icon + downward arrow -> coins jump out to monarch!)
      const wdCenterX = centerX + 10;
      this.drawWithdrawCoinIcon(ctx, wdCenterX, coinRowY, balance > 0);
      this.addHit('prompt_bank_withdraw', wdCenterX - 9, coinRowY - 6, 18, 22);

      ctx.textAlign = 'left';
      return;
    }

    // 3. STANDARD COMMAND PROMPTS (NO dark background boxes!)
    const isLargeCost = pr.cost > 10;
    const slotStep = 10;
    const slotsW = isLargeCost ? 78 : pr.cost * slotStep - 3;

    const matItems: Array<{ kind: 'wood' | 'stone' | 'iron'; need: number; have: number }> = [];
    if (pr.woodCost && pr.woodCost > 0) matItems.push({ kind: 'wood', need: pr.woodCost, have: w.resources.wood });
    if (pr.stoneCost && pr.stoneCost > 0) matItems.push({ kind: 'stone', need: pr.stoneCost, have: w.resources.stone });
    if (pr.ironCost && pr.ironCost > 0) matItems.push({ kind: 'iron', need: pr.ironCost, have: w.resources.iron });
    const matItemW = 24;
    const matsW = matItems.length * matItemW;

    const ctaW = showCta ? pr.label.length * 4.5 : 0;
    const spanW = Math.max(slotsW, matsW, ctaW, 24);
    const centerX = Math.max(
      Math.ceil(spanW / 2) + 8,
      Math.min(this.viewW - Math.ceil(spanW / 2) - 8, sx)
    );

    // Tappable hit area directly over the floating slots (no dark box)
    const hitH = 18 + (showCta ? 10 : 0) + (matItems.length > 0 ? 12 : 0);
    const hitTop = coinRowY - (showCta ? 12 : 5);
    this.addHit('prompt_coin_slot', Math.round(centerX - spanW / 2) - 8, hitTop, spanW + 16, hitH);

    // CTA label ONLY appears before the player has executed this action class once!
    if (showCta) {
      ctx.fillStyle = isDiamond ? '#b5fbff' : '#f2f7fc';
      ctx.font = 'bold 6.5px "Pixelify Sans", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pr.label, centerX, coinRowY - 5);
    }

    // Floating Coin / Diamond Slots (NO background box behind them — only crisp individual slots!)
    if (isLargeCost) {
      const barW = 46;
      const barX = Math.round(centerX - barW / 2 - 10);
      this.drawMinimalCoinIcon(ctx, barX - 10, coinRowY);

      ctx.fillStyle = 'rgba(8, 12, 18, 0.72)';
      ctx.fillRect(barX - 1, coinRowY, barW + 2, 7);
      ctx.fillStyle = 'rgba(247, 210, 101, 0.2)';
      ctx.fillRect(barX, coinRowY + 1, barW, 5);
      ctx.fillStyle = '#f7d265';
      ctx.fillRect(barX, coinRowY + 1, Math.round(barW * Math.min(1, pr.paid / pr.cost)), 5);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffe58a';
      ctx.font = 'bold 7px "Pixelify Sans", monospace';
      ctx.fillText(`${pr.paid}/${pr.cost}`, barX + barW + 4, coinRowY + 6);
    } else {
      const startX = Math.round(centerX - slotsW / 2);
      const fullCol = isDiamond ? '#7ef5ff' : '#f7d265';
      const shineCol = isDiamond ? '#ebfeff' : '#fff5bd';
      const emptyCol = isDiamond ? 'rgba(126, 245, 255, 0.16)' : 'rgba(247, 210, 101, 0.16)';
      for (let i = 0; i < pr.cost; i++) {
        const cx = startX + i * slotStep;
        // Subtle 1px dark pixel contour tightly hugging each slot so it stays readable over bright sky
        ctx.fillStyle = 'rgba(8, 12, 18, 0.72)';
        ctx.fillRect(cx - 1, coinRowY - 1, 9, 9);
        if (i < pr.paid) {
          ctx.fillStyle = fullCol;
          ctx.fillRect(cx, coinRowY, 7, 7);
          ctx.fillStyle = shineCol;
          ctx.fillRect(cx + 1, coinRowY + 1, 2, 2);
        } else {
          ctx.fillStyle = emptyCol;
          ctx.fillRect(cx, coinRowY, 7, 7);
          ctx.strokeStyle = i < pr.paid + pr.pending ? shineCol : fullCol;
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 0.5, coinRowY + 0.5, 6, 6);
        }
      }
    }

    // Material requirements row (Wood / Stone / Iron icons + required amounts, zero dark box!)
    if (matItems.length > 0) {
      let mx = Math.round(centerX - matsW / 2 + 2);
      const my = coinRowY + 11;
      ctx.textAlign = 'left';
      ctx.font = 'bold 6.5px "Pixelify Sans", monospace';
      for (const item of matItems) {
        this.drawMaterialIcon(ctx, item.kind, mx, my);
        ctx.fillStyle = item.have >= item.need ? '#a7f0ad' : '#ff7b7b';
        ctx.fillText(`${item.need}`, mx + 8, my + 5);
        mx += matItemW;
      }
    }
    ctx.textAlign = 'left';
  }

  // =========================================================================
  // TOP HUD (Adapts to Portrait + Landscape & Reserves Top-Right for Menu Btn)
  // =========================================================================
  private drawPixelIcon(
    ctx: CanvasRenderingContext2D,
    kind: 'hammer' | 'sword' | 'spear' | 'bow' | 'seed',
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
    } else if (kind === 'spear') {
      ctx.fillStyle = '#8a5d32';
      ctx.fillRect(x + 4, y + 3, 1, 7);
      ctx.fillStyle = '#e6f2ff';
      ctx.fillRect(x + 3, y + 0, 3, 4);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(x + 4, y + 3, 1, 1);
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

  private toRoman(num: number): string {
    const n = Math.max(1, Math.floor(num));
    const table: Array<[number, string]> = [
      [1000, 'M'],
      [900, 'CM'],
      [500, 'D'],
      [400, 'CD'],
      [100, 'C'],
      [90, 'XC'],
      [50, 'L'],
      [40, 'XL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ];
    let rem = n;
    let out = '';
    for (const [val, sym] of table) {
      while (rem >= val) {
        out += sym;
        rem -= val;
      }
    }
    return out;
  }

  private drawMinimalCoinIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    ctx.fillStyle = 'rgba(8, 12, 18, 0.72)';
    ctx.fillRect(rx + 1, ry, 5, 7);
    ctx.fillRect(rx, ry + 1, 7, 5);
    ctx.fillStyle = '#c98d1e';
    ctx.fillRect(rx + 1, ry + 1, 5, 5);
    ctx.fillStyle = '#f7d265';
    ctx.fillRect(rx + 1, ry + 1, 4, 4);
    ctx.fillStyle = '#fff6c4';
    ctx.fillRect(rx + 2, ry + 1, 2, 2);
  }

  private drawMinimalDiamondIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    ctx.fillStyle = 'rgba(8, 12, 18, 0.72)';
    ctx.fillRect(rx + 2, ry - 1, 3, 9);
    ctx.fillRect(rx + 1, ry, 5, 7);
    ctx.fillRect(rx, ry + 2, 7, 3);
    ctx.fillStyle = '#1f98c7';
    ctx.fillRect(rx + 2, ry, 3, 7);
    ctx.fillRect(rx + 1, ry + 1, 5, 5);
    ctx.fillRect(rx, ry + 2, 7, 3);
    ctx.fillStyle = '#6cf0ff';
    ctx.fillRect(rx + 2, ry + 1, 3, 5);
    ctx.fillRect(rx + 1, ry + 2, 5, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx + 2, ry + 1, 1, 2);
  }

  private drawHud(ctx: CanvasRenderingContext2D, w: WorldState): void {
    const monarch = this.getLocalMonarch(w);
    if (!monarch) return;

    const isNarrow = this.viewW < 380;
    const menuReserve = isNarrow ? 38 : 26; // Space for top-right Menu button (☰)

    const countRole = (role: Villager['role']) => {
      let left = 0;
      let right = 0;
      for (const v of w.villagers) {
        if (v.role === role && v.state !== 'embarked') {
          if (v.side === -1) left++;
          else right++;
        }
      }
      return { left, right, total: left + right };
    };

    const warriors = countRole('warrior');
    const spearmen = countRole('spearman');
    const builders = countRole('builder');
    const archers = countRole('archer');
    const producers = countRole('producer');

    // Track progressive discovery: icons only appear once the player has obtained at least 1!
    const disc = (w.discoveredHud = w.discoveredHud ?? {});
    if (monarch.diamonds > 0) disc.diamond = true;
    if (monarch.coins > 0) disc.coin = true;
    if (w.resources.wood > 0) disc.wood = true;
    if (w.resources.stone > 0) disc.stone = true;
    if (w.resources.iron > 0) disc.iron = true;
    if (warriors.total > 0) disc.sword = true;
    if (spearmen.total > 0) disc.spear = true;
    if (builders.total > 0) disc.hammer = true;
    if (archers.total > 0) disc.bow = true;
    if (producers.total > 0) disc.seed = true;

    // 1. TOP-RIGHT: Current Day as a clean Roman Numeral directly to the left of the Menu button (NO dark box!)
    const dayRoman = this.toRoman(w.day);
    ctx.font = 'bold 10px "Pixelify Sans", monospace';
    const romanW = Math.ceil(ctx.measureText(dayRoman).width);
    const romanRightX = this.viewW - menuReserve - 4;
    ctx.textAlign = 'right';
    ctx.fillStyle = w.isBloodMoon ? '#ff6b78' : w.isNight ? '#a8d8ff' : '#ffe89c';
    ctx.fillText(dayRoman, romanRightX, 16);
    ctx.textAlign = 'left';

    const rightLimit = romanRightX - romanW - 10;
    const row1Y = 15;
    const row2Y = 30;
    let cx = 8;
    let cy = row1Y;

    const ensureRoom = (neededW: number) => {
      if (cx > 8 && cx + neededW > rightLimit) {
        cx = 8;
        cy = row2Y;
      }
    };

    // 2. TOP-LEFT GROUP 1: Diamond + count, Coin + count (NO dark backgrounds!)
    let drewGroup1 = false;
    ctx.font = 'bold 8.5px "Pixelify Sans", monospace';

    if (disc.diamond) {
      const txt = `${monarch.diamonds}`;
      const wItem = 9 + Math.ceil(ctx.measureText(txt).width);
      ensureRoom(wItem);
      this.drawMinimalDiamondIcon(ctx, cx, cy - 6);
      ctx.fillStyle = '#a8f8ff';
      ctx.fillText(txt, cx + 9, cy);
      cx += wItem + 8;
      drewGroup1 = true;
    }

    if (disc.coin) {
      const txt = `${monarch.coins}`;
      const wItem = 9 + Math.ceil(ctx.measureText(txt).width);
      ensureRoom(wItem);
      this.drawMinimalCoinIcon(ctx, cx, cy - 6);
      ctx.fillStyle = '#ffe58a';
      ctx.fillText(txt, cx + 9, cy);
      cx += wItem + 6;
      drewGroup1 = true;
    }

    // 3. TOP-LEFT GROUP 2 (after breathing space): small Wood, Stone, Iron icons + counts
    const resItems: Array<{ kind: 'wood' | 'stone' | 'iron'; count: number; color: string }> = [];
    if (disc.wood) resItems.push({ kind: 'wood', count: w.resources.wood, color: '#e8bc82' });
    if (disc.stone) resItems.push({ kind: 'stone', count: w.resources.stone, color: '#d4e0ec' });
    if (disc.iron) resItems.push({ kind: 'iron', count: w.resources.iron, color: '#9ed2ff' });

    if (resItems.length > 0) {
      if (drewGroup1 && cx > 8) cx += isNarrow ? 10 : 16; // Respiro maior
      ctx.font = 'bold 7px "Pixelify Sans", monospace';
      const group2EstW = resItems.reduce(
        (acc, it) => acc + 8 + Math.ceil(ctx.measureText(`${it.count}`).width) + 7,
        0
      );
      if (cx > 8 && cx + group2EstW > rightLimit) {
        cx = 8;
        cy = row2Y;
      }
      for (const item of resItems) {
        const txt = `${item.count}`;
        const wItem = 8 + Math.ceil(ctx.measureText(txt).width);
        ensureRoom(wItem);
        this.drawMaterialIcon(ctx, item.kind, cx, cy - 5);
        ctx.fillStyle = item.color;
        ctx.fillText(txt, cx + 8, cy);
        cx += wItem + 7;
      }
    }

    // Island Precious Ore & Forged Armor compact indicators (progressive: shown once obtained)
    const curMetalId = getIslandMetalId(w.currentIsland);
    const curMetal = PRECIOUS_METALS[curMetalId];
    const curOreQty = w.resources.preciousOres?.[curMetalId] ?? 0;
    const armorCount = Object.keys(monarch.armor ?? {}).length;
    if (curOreQty > 0 || armorCount > 0) {
      if ((drewGroup1 || resItems.length > 0) && cx > 8) cx += 6;
      ctx.font = 'bold 7px "Pixelify Sans", monospace';
      if (curOreQty > 0) {
        const txt = `${curOreQty}`;
        const wItem = 8 + Math.ceil(ctx.measureText(txt).width);
        ensureRoom(wItem);
        // Tiny glowing precious ore nugget icon
        ctx.fillStyle = curMetal.color;
        ctx.fillRect(cx + 1, cy - 5, 5, 4);
        ctx.fillStyle = curMetal.highlight;
        ctx.fillRect(cx + 2, cy - 4, 2, 2);
        ctx.fillStyle = curMetal.highlight;
        ctx.fillText(txt, cx + 8, cy);
        cx += wItem + 6;
      }
      if (armorCount > 0) {
        const txt = `${armorCount}/9`;
        const wItem = 8 + Math.ceil(ctx.measureText(txt).width);
        ensureRoom(wItem);
        // Tiny pixel breastplate/shield icon
        ctx.fillStyle = '#c4d4e6';
        ctx.fillRect(cx + 1, cy - 6, 5, 5);
        ctx.fillStyle = '#ffe58a';
        ctx.fillRect(cx + 2, cy - 5, 3, 2);
        ctx.fillStyle = '#ffe58a';
        ctx.fillText(txt, cx + 8, cy);
        cx += wItem + 6;
      }
    }

    // Sacred Yggdrasil Wood & Elemental Stones compact indicators (progressive: shown once obtained)
    const yggQty = w.resources.yggdrasilWood ?? 0;
    const ownedStones = (['fire', 'ice', 'thunder'] as const).filter(
      (k) => (w.resources.elementalStones?.[k] ?? 0) > 0
    );
    if (yggQty > 0 || ownedStones.length > 0) {
      if (cx > 8) cx += 5;
      ctx.font = 'bold 7px "Pixelify Sans", monospace';
      if (yggQty > 0) {
        const txt = `${yggQty}`;
        const wItem = 8 + Math.ceil(ctx.measureText(txt).width);
        ensureRoom(wItem);
        // Tiny golden-emerald Yggdrasil sacred timber & leaf icon
        ctx.fillStyle = '#805226';
        ctx.fillRect(cx + 2, cy - 4, 3, 4);
        ctx.fillStyle = '#62e088';
        ctx.fillRect(cx + 1, cy - 6, 5, 3);
        ctx.fillStyle = '#ffe27a';
        ctx.fillRect(cx + 2, cy - 6, 2, 1);
        ctx.fillStyle = '#9cf5b8';
        ctx.fillText(txt, cx + 8, cy);
        cx += wItem + 5;
      }
      if (ownedStones.length > 0) {
        const wGems = ownedStones.length * 7 + 2;
        ensureRoom(wGems);
        for (const st of ownedStones) {
          const stDef = ELEMENTAL_STONE_DEFS[st];
          ctx.fillStyle = stDef.color;
          ctx.fillRect(cx + 1, cy - 6, 4, 5);
          ctx.fillRect(cx + 2, cy - 7, 2, 7);
          ctx.fillStyle = stDef.highlight;
          ctx.fillRect(cx + 2, cy - 5, 1, 2);
          cx += 7;
        }
        cx += 3;
      }
    }

    // 4. TOP-LEFT GROUP 3 (after breathing space): Sword, Spear, Hammer, Bow, Seed with LEFT count & RIGHT count!
    const unitItems: Array<{
      id: string;
      icon: 'sword' | 'spear' | 'hammer' | 'bow' | 'seed';
      cmd: CommandMode;
      counts: { left: number; right: number; total: number };
    }> = [];
    if (disc.sword) unitItems.push({ id: 'hud_cmd_attack', icon: 'sword', cmd: 'attack', counts: warriors });
    if (disc.spear) unitItems.push({ id: 'hud_cmd_spear', icon: 'spear', cmd: 'spear', counts: spearmen });
    if (disc.hammer) unitItems.push({ id: 'hud_cmd_build', icon: 'hammer', cmd: 'build', counts: builders });
    if (disc.bow) unitItems.push({ id: 'hud_cmd_archer', icon: 'bow', cmd: 'archer', counts: archers });
    if (disc.seed) unitItems.push({ id: 'hud_cmd_produce', icon: 'seed', cmd: 'produce', counts: producers });

    if (unitItems.length > 0) {
      if ((drewGroup1 || resItems.length > 0) && cx > 8) cx += isNarrow ? 10 : 16; // Respiro
      ctx.font = 'bold 7px "Pixelify Sans", monospace';
      const measureUnit = (u: (typeof unitItems)[number]) => {
        const lw = Math.ceil(ctx.measureText(`${u.counts.left}`).width);
        const rw = Math.ceil(ctx.measureText(`${u.counts.right}`).width);
        return { lw, rw, totalW: lw + 1 + 9 + 1 + rw };
      };
      const unitGap = isNarrow ? 11 : 13;
      const group3EstW = Math.max(
        0,
        unitItems.reduce((acc, u) => acc + measureUnit(u).totalW + unitGap, 0) - unitGap
      );
      if (cx > 8 && cx + group3EstW > rightLimit) {
        cx = 8;
        cy = cy === row1Y ? row2Y : row2Y + 14;
      }

      for (const u of unitItems) {
        const { lw, totalW } = measureUnit(u);
        ensureRoom(totalW);
        const active = w.activeCommand === u.cmd;

        // Tappable hit area directly over the transparent icon + numbers (zero dark box!)
        this.addHit(u.id, cx - 2, cy - 10, totalW + 4, 15);

        // Left count (to the LEFT of the icon)
        ctx.fillStyle = active ? '#ffe58a' : '#dcebf7';
        ctx.fillText(`${u.counts.left}`, cx, cy);

        // Pixel icon centered between the two numbers
        const iconX = cx + lw + 1;
        this.drawPixelIcon(ctx, u.icon, iconX, cy - 7);

        // Right count (to the RIGHT of the icon)
        ctx.fillStyle = active ? '#ffe58a' : '#dcebf7';
        ctx.fillText(`${u.counts.right}`, iconX + 10, cy);

        // Subtle golden pixel underline only when actively giving a tactical command
        if (active) {
          ctx.fillStyle = '#ffe066';
          ctx.fillRect(cx, cy + 2, totalW, 1);
        }

        cx += totalW + unitGap;
      }
    }

    // Minimalist Floating Tactical Command Feedback (text only, no heavy box)
    if (w.activeCommand !== 'none' || w.commandFeedback) {
      const msgY = cy + 14;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe58a';
      ctx.font = 'bold 7px "Pixelify Sans", monospace';
      const feedbackTxt = w.commandFeedback ? w.commandFeedback.text : t('cmd_hint');
      ctx.fillText(feedbackTxt, Math.round(this.viewW / 2), msgY);

      if (w.touchCommandMode !== 'none') {
        const closeX = Math.round(this.viewW / 2 + ctx.measureText(feedbackTxt).width / 2 + 8);
        ctx.fillStyle = '#ff9aa2';
        ctx.font = 'bold 8px "Pixelify Sans", monospace';
        ctx.fillText('×', closeX, msgY);
        this.addHit('hud_cmd_close', closeX - 8, msgY - 9, 16, 14);
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
      ctx.font = 'bold 9px "Pixelify Sans", monospace';
      ctx.textAlign = 'center';
      const arrow = ti.side < 0 ? (ti.sprinting ? '««' : '◀') : ti.sprinting ? '»»' : '▶';
      ctx.fillText(arrow, ti.x, ti.y + 3);
      ctx.restore();
      ctx.textAlign = 'left';
    }

    // Clickable Mounted Elder Active Power Button ([G]) neatly left of Weapon & Mount Power buttons!
    if (monarch.ridingElderId && w.mode === 'playing') {
      const ridingElder = (w.elders ?? []).find((e) => e.id === monarch.ridingElderId);
      const eDef = ELDER_DEFS[monarch.ridingElderId];
      const eCd = ridingElder?.activeCooldown ?? 0;
      const eReady = eCd <= 0;
      const eBtnW = 36;
      const eBtnH = 22;
      const rightAnchor =
        (monarch.mount !== 'starter' ? this.viewW - 58 : this.viewW - 34) -
        (monarch.weapon ? 38 : 0);
      const bx = Math.round(rightAnchor - eBtnW);
      const by = Math.round(this.viewH - 29);

      this.addHit('hud_elder_power', bx - 2, by - 2, eBtnW + 4, eBtnH + 4);

      ctx.save();
      ctx.fillStyle = eReady ? 'rgba(14, 22, 36, 0.9)' : 'rgba(10, 16, 26, 0.72)';
      ctx.fillRect(bx, by, eBtnW, eBtnH);
      ctx.strokeStyle = eReady ? eDef.accentColor : '#48596b';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, eBtnW - 1, eBtnH - 1);
      if (eReady) {
        ctx.fillStyle = `${eDef.cloakColor}88`;
        ctx.fillRect(bx + 1, by + 1, eBtnW - 2, 3);
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = eReady ? eDef.accentColor : '#7e91a6';
      ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
      ctx.fillText(eDef.powerShortTag.slice(0, 6), bx + Math.floor(eBtnW / 2), by + 10);

      ctx.fillStyle = eReady ? '#ffe58a' : '#9bb0c4';
      ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
      ctx.fillText(eReady ? '[G] USAR' : `${Math.ceil(eCd)}s`, bx + Math.floor(eBtnW / 2), by + 18);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // Clickable Divine Weapon / Magic Cast Button ([F]) neatly left of Mount Power & Spirit Button!
    if (monarch.weapon && w.mode === 'playing') {
      const wDef = WEAPON_DEFS[monarch.weapon];
      const cd = monarch.weaponCooldown ?? 0;
      const ready = cd <= 0;
      const wBtnW = 34;
      const wBtnH = 22;
      const rightAnchor = monarch.mount !== 'starter' ? this.viewW - 58 : this.viewW - 34;
      const bx = Math.round(rightAnchor - wBtnW);
      const by = Math.round(this.viewH - 29);

      this.addHit('hud_weapon_power', bx - 2, by - 2, wBtnW + 4, wBtnH + 4);

      ctx.save();
      ctx.fillStyle = ready ? 'rgba(12, 24, 42, 0.88)' : 'rgba(10, 16, 26, 0.72)';
      ctx.fillRect(bx, by, wBtnW, wBtnH);
      ctx.strokeStyle = ready ? wDef.color : '#48596b';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, wBtnW - 1, wBtnH - 1);
      if (ready) {
        ctx.fillStyle = `${wDef.color}28`;
        ctx.fillRect(bx + 1, by + 1, wBtnW - 2, 3);
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = ready ? wDef.color : '#7e91a6';
      ctx.font = 'bold 6px "Pixelify Sans", monospace';
      ctx.fillText(wDef.shortTag.slice(0, 6), bx + Math.floor(wBtnW / 2), by + 10);

      ctx.fillStyle = ready ? '#ffe58a' : '#9bb0c4';
      ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
      ctx.fillText(ready ? '[F] USAR' : `${Math.ceil(cd)}s`, bx + Math.floor(wBtnW / 2), by + 18);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // Minimal Mount Active Power Indicator (⚡) shifted cleanly left of the bottom-right Blue Spirit Button
    if (monarch.mount !== 'starter') {
      const mDef = MOUNT_DEFS[monarch.mount];
      const ready = monarch.mountPowerCooldown <= 0;
      const px = this.viewW - 44;
      const py = this.viewH - 14;
      this.addHit('hud_mount_power', px - 12, py - 12, 24, 22);
      ctx.textAlign = 'center';
      ctx.fillStyle = ready ? mDef.accentColor : '#8ba0b5';
      ctx.font = 'bold 9px "Pixelify Sans", monospace';
      ctx.fillText(ready ? '⚡' : `${Math.ceil(monarch.mountPowerCooldown)}s`, px, py);
      ctx.textAlign = 'left';
    }

    // Bottom-Right Blue Pixel Button to Summon / Recall the Guiding Spirit!
    if (w.mode === 'playing') {
      const sBtn = getSpiritButtonScreenPos(this.viewW, this.viewH);
      const isSpiritOut =
        Boolean(w.tutorial?.active && !w.tutorial.returningToButton) ||
        Boolean(w.spiritAdvisor && (w.spiritAdvisor.phase === 'active' || w.spiritAdvisor.phase === 'emerging'));
      const bw = 22;
      const bh = 22;
      const bx = Math.round(sBtn.x - bw / 2);
      const by = Math.round(sBtn.y - bh / 2);
      const pulse = 0.5 + 0.5 * Math.sin(w.elapsed * 3.8);

      ctx.save();
      // Ethereal cyan radial glow behind blue summon button
      const aura = ctx.createRadialGradient(sBtn.x, sBtn.y, 2, sBtn.x, sBtn.y, 17);
      aura.addColorStop(0, isSpiritOut ? 'rgba(110, 238, 255, 0.55)' : `rgba(80, 210, 255, ${0.22 + pulse * 0.16})`);
      aura.addColorStop(1, 'rgba(20, 90, 160, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(sBtn.x - 17, sBtn.y - 17, 34, 34);

      // Crisp pixel-art blue stone/rune frame
      ctx.fillStyle = isSpiritOut ? '#0d3154' : '#08203a';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = isSpiritOut ? '#9ff6ff' : '#5ce1e6';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      ctx.fillStyle = 'rgba(130, 240, 255, 0.22)';
      ctx.fillRect(bx + 1, by + 1, bw - 2, 1);

      if (isSpiritOut) {
        // Open cyan portal vortex + tiny recall cross when Spirit is currently out advising
        ctx.fillStyle = 'rgba(110, 238, 255, 0.26)';
        ctx.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
        ctx.fillStyle = '#c8fbff';
        ctx.font = 'bold 9px "Pixelify Sans", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('✕', sBtn.x, sBtn.y + 3.5);
        ctx.textAlign = 'left';
      } else {
        // Cute glowing miniature pixel Spirit resting inside the blue button
        const bob = Math.round(Math.sin(w.elapsed * 3.2));
        const gx = sBtn.x;
        const gy = sBtn.y + 2 + bob;
        // Mini crown
        ctx.fillStyle = '#a8f8ff';
        ctx.fillRect(gx - 3, gy - 8, 6, 1);
        ctx.fillRect(gx - 3, gy - 9, 1, 1);
        ctx.fillRect(gx, gy - 10, 1, 2);
        ctx.fillRect(gx + 2, gy - 9, 1, 1);
        // Mini head + eyes
        ctx.fillStyle = '#d4fbff';
        ctx.fillRect(gx - 3, gy - 7, 6, 4);
        ctx.fillStyle = '#08203a';
        ctx.fillRect(gx - 2, gy - 6, 1, 1);
        ctx.fillRect(gx + 1, gy - 6, 1, 1);
        // Mini spectral cloak & tail
        ctx.fillStyle = '#5ce1e6';
        ctx.fillRect(gx - 4, gy - 3, 8, 5);
        ctx.fillStyle = '#8ef5ff';
        ctx.fillRect(gx - 3, gy + 2, 2, 2);
        ctx.fillRect(gx, gy + 2, 2, 3);
        ctx.fillRect(gx + 2, gy + 2, 2, 1);
      }
      ctx.restore();

      this.addHit('spirit_summon', bx - 5, by - 5, bw + 10, bh + 10);
    }

    // Horizontal Minimap bar preserved along bottom of fjord water
    const mapW = Math.min(160, this.viewW - (monarch.mount !== 'starter' ? 116 : 68));
    const mapX = Math.round((this.viewW - mapW) / 2);
    const mapY = this.viewH - 10;
    ctx.fillStyle = 'rgba(6, 12, 20, 0.62)';
    ctx.fillRect(mapX, mapY, mapW, 4);

    const mapWorldW = getWorldWidth(w);
    const toMapX = (wx: number) => mapX + Math.round((wx / mapWorldW) * mapW);
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
    for (const m of w.monarchs) {
      if (m === monarch) continue;
      ctx.fillStyle = '#7cf7ff';
      ctx.fillRect(toMapX(m.x) - 1, mapY - 1, 2, 5);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(toMapX(monarch.x) - 1, mapY - 1, 2, 6);
  }

  private drawTutorialSpirit(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    const tut = w.tutorial?.active ? w.tutorial : null;
    const adv = !tut && w.spiritAdvisor && w.spiritAdvisor.phase !== 'docked' ? w.spiritAdvisor : null;

    const spiritX = tut ? tut.spiritX : adv ? adv.spiritX : 0;
    const spiritY = tut ? tut.spiritY : adv ? adv.spiritY : 0;
    const spiritAlpha = tut ? tut.spiritAlpha : adv ? adv.spiritAlpha : 0;
    const spiritFacing: 1 | -1 = tut ? tut.spiritFacing : adv ? adv.spiritFacing : 1;
    const isMovingBetweenButton = Boolean(
      (tut && (tut.returningToButton || (tut.emergingProgress ?? 1) < 1)) ||
      (adv && (adv.phase === 'emerging' || adv.phase === 'returning'))
    );

    if ((!tut && !adv) || spiritAlpha <= 0.03) return;

    const sx = Math.round(spiritX - camX);
    const sy = Math.round(spiritY);
    if (sx < -40 || sx > this.viewW + 40) return;

    const f = spiritFacing;
    const wave = Math.round(Math.sin(w.elapsed * 5.2) * 1.5);
    const pulse = Math.round(Math.sin(w.elapsed * 6.5) * 2);

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, spiritAlpha));

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
    if (!isMovingBetweenButton) {
      const m = w.monarchs[0];
      const targetX = tut ? getTutorialTargetX(w) : (adv?.targetX ?? getCenterX(w));
      const farFromTarget = m ? Math.abs(targetX - m.x) >= 58 : true;
      if (farFromTarget || tut?.step === 'farewell') {
        ctx.fillStyle = '#d4fbff';
        ctx.font = 'bold 8px "Pixelify Sans", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(f > 0 ? '»' : '«', sx + f * (18 + pulse), sy - 6);
        ctx.textAlign = 'left';
      }
    }

    ctx.restore();
  }

  private drawTutorialDialogue(ctx: CanvasRenderingContext2D, w: WorldState, camX: number): void {
    const tut = w.tutorial?.active ? w.tutorial : null;
    const adv = !tut && w.spiritAdvisor && w.spiritAdvisor.phase === 'active' ? w.spiritAdvisor : null;
    const m = w.monarchs[0];
    if ((!tut && !adv) || !m) return;

    // Hide speech bubble while flying out of or back into the blue button
    if (tut && (tut.returningToButton || (tut.emergingProgress ?? 1) < 0.72)) return;

    let text = '';
    let showControls = false;
    let spiritX = 0;
    let spiritY = 0;
    let spiritAlpha = 1;
    let spiritFacing: 1 | -1 = 1;

    if (tut) {
      const targetX = getTutorialTargetX(w);
      const nearTarget = tut.step !== 'farewell' && Math.abs(targetX - m.x) < 58;
      if (tut.step === 'light_fire') text = nearTarget ? t('tut_fire_here') : t('tut_fire_go');
      else if (tut.step === 'recruit_wanderers') text = nearTarget ? t('tut_camp_here') : t('tut_camp_go');
      else if (tut.step === 'buy_hammer') text = nearTarget ? t('tut_hammer_here') : t('tut_hammer_go');
      else if (tut.step === 'build_right_wall') text = nearTarget ? t('tut_wall_r_here') : t('tut_wall_r_go');
      else if (tut.step === 'build_left_wall') text = nearTarget ? t('tut_wall_l_here') : t('tut_wall_l_go');
      else if (tut.step === 'buy_bow') text = nearTarget ? t('tut_bow_here') : t('tut_bow_go');
      else if (tut.step === 'order_villager') text = nearTarget ? t('tut_order_here') : t('tut_order_go');
      else text = t('tut_farewell');
      showControls = tut.step === 'light_fire' || tut.step === 'recruit_wanderers';
      spiritX = tut.spiritX;
      spiritY = tut.spiritY;
      spiritAlpha = tut.spiritAlpha;
      spiritFacing = tut.spiritFacing;
    } else if (adv) {
      text = adv.message;
      spiritX = adv.spiritX;
      spiritY = adv.spiritY;
      spiritAlpha = adv.spiritAlpha;
      spiritFacing = adv.spiritFacing;
    }

    if (!text) return;
    const controlsText = showControls ? t('tut_controls') : '';

    ctx.save();
    ctx.globalAlpha = Math.max(0.18, Math.min(1, spiritAlpha));

    const isNarrow = this.viewW < 420;
    const maxBubbleW = Math.min(232, this.viewW - 18);
    const padX = 7;
    const skipW = 28;
    const maxTextW = Math.max(96, maxBubbleW - padX * 2);

    // Measure & wrap dialogue lines accurately so the comic bubble fits snugly around text
    ctx.font = 'bold 6.8px "Pixelify Sans", monospace';
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
      const candidate = (cur + ' ' + word).trim();
      // Reserve space on the first line for the top-right Skip/Dismiss chip so text never overlaps it
      const lineLimit = lines.length === 0 ? maxTextW - skipW - 5 : maxTextW;
      if (ctx.measureText(candidate).width > lineLimit && cur.length > 0) {
        lines.push(cur.trim());
        cur = word;
      } else {
        cur = candidate;
      }
    }
    if (cur) lines.push(cur);

    // Measure actual widest line to size the comic bubble cleanly
    let contentW = 0;
    lines.forEach((line, idx) => {
      const lw = ctx.measureText(line).width + (idx === 0 ? skipW + 6 : 0);
      if (lw > contentW) contentW = lw;
    });
    if (controlsText) {
      ctx.font = '6px "Pixelify Sans", monospace';
      const cw = ctx.measureText(controlsText).width;
      if (cw > contentW) contentW = cw;
    }

    const bw = Math.round(Math.max(122, Math.min(maxBubbleW, contentW + padX * 2 + 4)));
    const lineStep = 9;
    const boxH = 10 + lines.length * lineStep + (showControls ? 9 : 1);
    const tailH = 7;

    // Anchor comic speech bubble right above the Spirit's head!
    const spiritScreenX = Math.round(spiritX - camX);
    const spiritHeadY = Math.round(spiritY + this.worldOffsetY - 23);
    const spiritOnScreen = spiritScreenX >= 6 && spiritScreenX <= this.viewW - 6;

    const topMinY = (isNarrow ? 40 : 24) + (w.activeCommand !== 'none' || w.commandFeedback ? 16 : 0);
    // Slightly favor the side the spirit is facing, while keeping the bubble cleanly within screen bounds
    const desiredBx = Math.round(spiritScreenX - bw * 0.5 + spiritFacing * 10);
    const bx = Math.max(8, Math.min(this.viewW - bw - 8, desiredBx));
    const desiredBy = Math.round(spiritHeadY - tailH - boxH);
    const by = Math.max(topMinY, Math.min(this.viewH - boxH - tailH - 12, desiredBy));

    const bgFill = 'rgba(7, 16, 29, 0.90)';
    const borderStroke = 'rgba(110, 238, 255, 0.85)';

    // Comic-book bubble shape with crisp chamfered pixel corners + seamless speech tail pointing to Spirit's head
    const tailTipX = Math.max(bx + 6, Math.min(bx + bw - 6, spiritScreenX));
    const tailTipY = spiritOnScreen ? Math.min(spiritHeadY, by + boxH + tailH + 3) : by + boxH + tailH;
    const tailBaseCenter = Math.max(bx + 11, Math.min(bx + bw - 11, tailTipX));
    const tailLeftX = tailBaseCenter - 4;
    const tailRightX = tailBaseCenter + 4;
    const r = 2; // Crisp pixel corner chamfer

    ctx.beginPath();
    ctx.moveTo(bx + r, by + 0.5);
    ctx.lineTo(bx + bw - r, by + 0.5);
    ctx.lineTo(bx + bw - 0.5, by + r);
    ctx.lineTo(bx + bw - 0.5, by + boxH - r);
    ctx.lineTo(bx + bw - r, by + boxH - 0.5);
    if (spiritOnScreen) {
      ctx.lineTo(tailRightX, by + boxH - 0.5);
      ctx.lineTo(tailTipX, tailTipY);
      ctx.lineTo(tailLeftX, by + boxH - 0.5);
    }
    ctx.lineTo(bx + r, by + boxH - 0.5);
    ctx.lineTo(bx + 0.5, by + boxH - r);
    ctx.lineTo(bx + 0.5, by + r);
    ctx.closePath();

    ctx.fillStyle = bgFill;
    ctx.fill();
    ctx.strokeStyle = borderStroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Subtle inner pixel highlight along top edge for depth
    ctx.fillStyle = 'rgba(140, 244, 255, 0.14)';
    ctx.fillRect(bx + 2, by + 1, bw - 4, 1);

    // Dialogue text lines inside bubble
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d8f9ff';
    ctx.font = 'bold 6.8px "Pixelify Sans", monospace';
    lines.forEach((line, idx) => {
      ctx.fillText(line, bx + padX, by + 10.5 + idx * lineStep);
    });

    if (showControls) {
      ctx.fillStyle = '#8ec0d8';
      ctx.font = '6px "Pixelify Sans", monospace';
      ctx.fillText(controlsText, bx + padX, by + 10.5 + lines.length * lineStep + 0.5, bw - padX * 2);
    }

    // Subtle Skip / Dismiss button on top-right of speech bubble (sends Spirit back to blue button!)
    const skipX = bx + bw - skipW - 3;
    const skipY = by + 3;
    ctx.fillStyle = 'rgba(20, 36, 56, 0.88)';
    ctx.fillRect(skipX, skipY, skipW, 10);
    ctx.strokeStyle = 'rgba(126, 245, 255, 0.55)';
    ctx.strokeRect(skipX + 0.5, skipY + 0.5, skipW - 1, 9);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fe8ff';
    ctx.font = 'bold 5.5px "Pixelify Sans", monospace';
    ctx.fillText(tut ? t('tut_skip') : 'OK ✕', skipX + skipW / 2, skipY + 7);
    this.addHit('tutorial_skip', skipX - 4, skipY - 4, skipW + 8, 18);

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
    const baseY = isNarrow ? 44 : 28;
    const yOff = w.activeCommand !== 'none' || w.commandFeedback ? baseY + 18 : baseY;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 8px "Pixelify Sans", monospace';
    const titleW = ctx.measureText(b.title).width;
    ctx.font = '6.5px "Pixelify Sans", monospace';
    const subW = ctx.measureText(b.subtitle).width;
    const maxAllowedW = this.viewW - 14;
    const bw = Math.round(Math.min(maxAllowedW, Math.max(240, Math.max(titleW, subW) + 22)));
    const bh = 35;
    const bx = Math.round((this.viewW - bw) / 2);

    ctx.fillStyle = 'rgba(8, 14, 24, 0.86)';
    ctx.fillRect(bx, yOff, bw, bh);
    ctx.fillStyle = b.accent;
    ctx.fillRect(bx, yOff, bw, 1);
    ctx.fillRect(bx, yOff + bh - 1, bw, 1);

    ctx.textAlign = 'center';
    ctx.fillStyle = b.accent;
    ctx.font = 'bold 8px "Pixelify Sans", monospace';
    ctx.fillText(b.title, Math.round(this.viewW / 2), yOff + 14, bw - 12);

    ctx.fillStyle = '#e0ecf7';
    ctx.font = '6.5px "Pixelify Sans", monospace';
    ctx.fillText(b.subtitle, Math.round(this.viewW / 2), yOff + 28, bw - 12);
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
    ctx.font = 'bold 16px "Pixelify Sans", monospace';
    ctx.fillText(t('paused'), cx, cy - 22);
    ctx.fillStyle = '#d4e2ef';
    ctx.font = '8px "Pixelify Sans", monospace';
    ctx.fillText(t('paused_hint'), cx, cy - 4);

    const bw = Math.min(168, this.viewW - 28);
    ctx.fillStyle = '#182436';
    ctx.fillRect(cx - bw / 2, cy + 12, bw, 22);
    ctx.strokeStyle = 'rgba(239, 196, 98, 0.6)';
    ctx.strokeRect(cx - bw / 2 + 0.5, cy + 12.5, bw - 1, 21);
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 8px "Pixelify Sans", monospace';
    ctx.fillText(t('back_main_menu'), cx, cy + 26);
    this.addHit('pause_menu', cx - bw / 2, cy + 12, bw, 22);
    ctx.textAlign = 'left';
  }

  private drawSummaryStatIcon(
    ctx: CanvasRenderingContext2D,
    kind: 'island' | 'coin' | 'diamond' | 'day' | 'draugr' | 'villager',
    x: number,
    y: number,
    w: WorldState
  ): void {
    if (kind === 'coin') {
      this.drawMinimalCoinIcon(ctx, x + 1, y + 1);
      return;
    }
    if (kind === 'diamond') {
      this.drawMinimalDiamondIcon(ctx, x + 1, y + 1);
      return;
    }
    if (kind === 'island') {
      // Mini fjord island with Nordic pine & water wave (matching World Map)
      ctx.fillStyle = '#3c8dc4';
      ctx.fillRect(x, y + 6, 9, 2);
      ctx.fillStyle = '#73b8e8';
      ctx.fillRect(x + 1, y + 6, 3, 1);
      ctx.fillStyle = '#5c4632';
      ctx.fillRect(x + 1, y + 4, 7, 2);
      ctx.fillStyle = '#5da85c';
      ctx.fillRect(x + 2, y + 3, 5, 2);
      ctx.fillStyle = '#2d6a42';
      ctx.fillRect(x + 4, y, 2, 3);
      ctx.fillRect(x + 3, y + 1, 4, 2);
      return;
    }
    if (kind === 'day') {
      // Golden Nordic sun matching celestial sky
      ctx.fillStyle = '#ff9b3d';
      ctx.fillRect(x + 2, y + 1, 5, 5);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(x + 3, y + 2, 3, 3);
      ctx.fillRect(x + 4, y, 1, 1);
      ctx.fillRect(x + 4, y + 6, 1, 1);
      ctx.fillRect(x + 1, y + 3, 1, 1);
      ctx.fillRect(x + 7, y + 3, 1, 1);
      return;
    }
    if (kind === 'draugr') {
      // Helheim Draugr skull/helm with glowing cyan eyes (matching drawSingleEnemy)
      ctx.fillStyle = '#1b2633';
      ctx.fillRect(x + 2, y + 1, 5, 6);
      ctx.fillStyle = '#7a8e9e';
      ctx.fillRect(x + 1, y, 1, 3);
      ctx.fillRect(x + 7, y, 1, 3);
      ctx.fillRect(x + 2, y + 1, 5, 1);
      ctx.fillStyle = '#6bf3ff';
      ctx.fillRect(x + 3, y + 3, 1, 1);
      ctx.fillRect(x + 5, y + 3, 1, 1);
      ctx.fillStyle = '#a8c2d4';
      ctx.fillRect(x + 3, y + 5, 3, 1);
      return;
    }
    // Villager subject icon (matching drawSingleVillager with clan tunic)
    ctx.fillStyle = '#e5be9e';
    ctx.fillRect(x + 3, y, 3, 3);
    ctx.fillStyle = w.crest.primaryColor;
    ctx.fillRect(x + 2, y + 3, 5, 4);
    ctx.fillStyle = w.crest.secondaryColor;
    ctx.fillRect(x + 2, y + 5, 5, 1);
    ctx.fillStyle = '#2d2522';
    ctx.fillRect(x + 2, y + 7, 2, 1);
    ctx.fillRect(x + 5, y + 7, 2, 1);
  }

  private drawPowerPixelIcon(
    ctx: CanvasRenderingContext2D,
    kind: 'thor' | 'freya' | 'odin' | 'loki' | 'mount' | 'buff_construction' | 'buff_forge',
    x: number,
    y: number,
    accent: string
  ): void {
    if (kind === 'buff_construction') {
      this.drawPixelIcon(ctx, 'hammer', x, y);
      return;
    }
    if (kind === 'buff_forge') {
      // Pixel forge anvil + ember spark
      ctx.fillStyle = '#7e8fa3';
      ctx.fillRect(x + 1, y + 3, 6, 2);
      ctx.fillRect(x + 2, y + 5, 4, 2);
      ctx.fillStyle = '#c8d6e5';
      ctx.fillRect(x + 1, y + 3, 6, 1);
      ctx.fillStyle = '#ff9b42';
      ctx.fillRect(x + 3, y + 1, 2, 2);
      return;
    }
    if (kind === 'thor') {
      // Mjolnir hammer + lightning glow
      ctx.fillStyle = '#9aaec2';
      ctx.fillRect(x + 1, y + 1, 6, 3);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(x + 2, y + 2, 4, 1);
      ctx.fillStyle = '#8a5a32';
      ctx.fillRect(x + 3, y + 4, 2, 4);
      ctx.fillStyle = '#7ef5ff';
      ctx.fillRect(x + 7, y, 1, 2);
      return;
    }
    if (kind === 'freya') {
      // Golden harvest / nature blossom
      ctx.fillStyle = '#6fd977';
      ctx.fillRect(x + 3, y + 3, 2, 5);
      ctx.fillRect(x + 1, y + 4, 2, 2);
      ctx.fillRect(x + 5, y + 4, 2, 2);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(x + 2, y + 1, 4, 2);
      ctx.fillRect(x + 3, y, 2, 1);
      return;
    }
    if (kind === 'odin') {
      // Odin rune eye / Allfather spear
      ctx.fillStyle = '#7ec8ff';
      ctx.fillRect(x + 1, y + 2, 6, 4);
      ctx.fillStyle = '#e8f7ff';
      ctx.fillRect(x + 2, y + 3, 4, 2);
      ctx.fillStyle = '#1d3557';
      ctx.fillRect(x + 3, y + 3, 2, 2);
      return;
    }
    if (kind === 'loki') {
      // Loki emerald/violet flame
      ctx.fillStyle = '#c06bff';
      ctx.fillRect(x + 2, y + 2, 4, 5);
      ctx.fillStyle = '#6fe87b';
      ctx.fillRect(x + 3, y + 1, 2, 5);
      ctx.fillStyle = '#fff3a6';
      ctx.fillRect(x + 3, y + 4, 2, 2);
      return;
    }
    // Special Mount silhouette in mount accent color
    ctx.fillStyle = accent;
    ctx.fillRect(x + 1, y + 3, 5, 4);
    ctx.fillRect(x + 4, y + 1, 3, 3);
    ctx.fillRect(x + 5, y, 1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 5, y + 2, 1, 1);
  }

  private drawGameOverOverlay(ctx: CanvasRenderingContext2D, w: WorldState): void {
    ctx.fillStyle = 'rgba(10, 6, 14, 0.86)';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const cx = Math.round(this.viewW / 2);
    const cy = Math.round(this.viewH / 2);
    const lang = getLanguage();

    // Fallen golden crown pixel emblem above title
    const topBaseY = Math.max(24, cy - 88);
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(cx - 8, topBaseY - 12, 16, 4);
    ctx.fillRect(cx - 8, topBaseY - 17, 3, 5);
    ctx.fillRect(cx - 1, topBaseY - 19, 2, 7);
    ctx.fillRect(cx + 5, topBaseY - 17, 3, 5);
    ctx.fillStyle = '#ff6b78';
    ctx.fillRect(cx - 1, topBaseY - 11, 2, 2);

    // Pixel-art beveled title "A COROA CAIU"
    const titleY = topBaseY + 12;
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px "Pixelify Sans", monospace';
    ctx.fillStyle = '#290a12';
    ctx.fillText(t('crown_fell'), cx + 1.5, titleY + 2);
    ctx.fillStyle = '#ff6b78';
    ctx.fillText(t('crown_fell'), cx, titleY);

    ctx.fillStyle = '#d4dde8';
    ctx.font = '7.5px "Pixelify Sans", monospace';
    ctx.fillText(t('crown_fell_sub'), cx, titleY + 13);

    // Compute comprehensive campaign stats
    const monarch = w.monarchs[0];
    const islandsConquered = Math.max(
      1,
      w.islands.filter((isl) => isl.visited || isl.colonized).length
    );
    const totalCoins =
      (monarch ? monarch.coins : w.resources.gold) +
      (w.banker.balance || 0) +
      (w.hall.storedTaxCoins || 0);
    const totalDiamonds = Math.max(monarch ? monarch.diamonds : 0, w.resources.diamonds || 0);
    const daysSurvived = Math.max(w.day, w.stats.daysSurvived);
    const draugrSlain = w.stats.draugrSlain;
    const subjectsRecruited = w.stats.villagersRecruited;

    // Collect activated powers (Gods, Special Mounts, Island Buffs)
    type PowerBadge = {
      iconKind: 'thor' | 'freya' | 'odin' | 'loki' | 'mount' | 'buff_construction' | 'buff_forge';
      label: string;
      accent: string;
    };
    const activatedPowers: PowerBadge[] = [];
    const seenGods = new Set<string>();
    for (const gId of w.unlockedGods) {
      if (seenGods.has(gId)) continue;
      seenGods.add(gId);
      const def = GOD_DEFS[gId];
      if (def) {
        activatedPowers.push({
          iconKind: gId,
          label: def.name,
          accent: def.color,
        });
      }
    }
    if (w.activeGod && !seenGods.has(w.activeGod)) {
      const def = GOD_DEFS[w.activeGod];
      if (def) {
        activatedPowers.push({
          iconKind: w.activeGod,
          label: def.name,
          accent: def.color,
        });
      }
    }
    for (const mId of w.unlockedMounts) {
      if (mId === 'starter') continue;
      const def = MOUNT_DEFS[mId];
      if (def) {
        activatedPowers.push({
          iconKind: 'mount',
          label: def.name[lang],
          accent: def.accentColor,
        });
      }
    }
    const hasConBuff =
      w.islandBuffs.some((b) => b.kind === 'construction' && b.active) ||
      w.islands.some((isl) => isl.constructionBuff);
    const hasForgeBuff =
      w.islandBuffs.some((b) => b.kind === 'forge' && b.active) ||
      w.islands.some((isl) => isl.forgeBuff);
    if (hasConBuff) {
      activatedPowers.push({
        iconKind: 'buff_construction',
        label: 'Construção',
        accent: '#7ce88c',
      });
    }
    if (hasForgeBuff) {
      activatedPowers.push({
        iconKind: 'buff_forge',
        label: 'Forja',
        accent: '#ff9b52',
      });
    }

    // Main pixel-bordered campaign summary panel
    const sw = Math.min(286, this.viewW - 18);
    const sh = activatedPowers.length > 4 ? 124 : 110;
    const cardX = Math.round(cx - sw / 2);
    const cardY = titleY + 21;

    ctx.fillStyle = 'rgba(8, 14, 24, 0.9)';
    ctx.fillRect(cardX, cardY, sw, sh);
    ctx.strokeStyle = 'rgba(255, 107, 120, 0.52)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cardX + 0.5, cardY + 0.5, sw - 1, sh - 1);

    // 2-column × 3-row Grid of 6 core campaign metrics with authentic in-game pixel icons
    const statRows: Array<{
      icon: 'island' | 'coin' | 'diamond' | 'day' | 'draugr' | 'villager';
      label: string;
      value: string;
      color: string;
    }> = [
      { icon: 'island', label: 'Ilhas', value: `${islandsConquered}/${ISLAND_DEFINITIONS.length}`, color: '#8fd8ff' },
      { icon: 'day', label: 'Dias', value: `${daysSurvived}`, color: '#f7d265' },
      { icon: 'coin', label: 'Moedas', value: `${totalCoins}`, color: '#ffe58a' },
      { icon: 'diamond', label: 'Diamantes', value: `${totalDiamonds}`, color: '#7ef5ff' },
      { icon: 'draugr', label: 'Draugrs', value: `${draugrSlain}`, color: '#a8e6ff' },
      { icon: 'villager', label: 'Súditos', value: `${subjectsRecruited}`, color: '#d4e8d4' },
    ];

    const colW = Math.floor((sw - 20) / 2);
    ctx.textAlign = 'left';
    for (let i = 0; i < statRows.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const ix = cardX + 12 + col * colW;
      const iy = cardY + 10 + row * 17;
      const item = statRows[i];

      this.drawSummaryStatIcon(ctx, item.icon, ix, iy, w);

      ctx.font = '7px "Pixelify Sans", monospace';
      ctx.fillStyle = '#aebfd1';
      ctx.fillText(`${item.label}:`, ix + 13, iy + 7);

      const labelW = ctx.measureText(`${item.label}: `).width;
      ctx.font = 'bold 7.5px "Pixelify Sans", monospace';
      ctx.fillStyle = item.color;
      ctx.fillText(item.value, ix + 13 + labelW, iy + 7);
    }

    // Divider before Activated Powers
    const divY = cardY + 63;
    ctx.fillStyle = 'rgba(239, 196, 98, 0.28)';
    ctx.fillRect(cardX + 10, divY, sw - 20, 1);

    ctx.textAlign = 'center';
    ctx.font = 'bold 6.5px "Pixelify Sans", monospace';
    ctx.fillStyle = '#efc462';
    ctx.fillText('PODERES ATIVADOS', cx, divY + 11);

    if (activatedPowers.length === 0) {
      ctx.font = '7px "Pixelify Sans", monospace';
      ctx.fillStyle = '#7e93a8';
      ctx.fillText('Nenhum poder ativado nesta saga', cx, divY + 25);
    } else {
      ctx.font = 'bold 6.5px "Pixelify Sans", monospace';
      const maxRowW = sw - 18;
      const rows: PowerBadge[][] = [[]];
      let curW = 0;
      for (const p of activatedPowers) {
        const chipW = Math.ceil(ctx.measureText(p.label).width) + 18;
        if (rows[rows.length - 1].length > 0 && curW + chipW > maxRowW && rows.length < 2) {
          rows.push([]);
          curW = 0;
        }
        rows[rows.length - 1].push(p);
        curW += chipW + 4;
      }

      ctx.textAlign = 'left';
      for (let r = 0; r < rows.length; r++) {
        const rowItems = rows[r];
        const rowWidths = rowItems.map((p) => Math.ceil(ctx.measureText(p.label).width) + 16);
        const totalRowW = rowWidths.reduce((acc, val) => acc + val, 0) + (rowItems.length - 1) * 5;
        let rx = Math.round(cx - totalRowW / 2);
        const ry = divY + 17 + r * 14;
        for (let j = 0; j < rowItems.length; j++) {
          const p = rowItems[j];
          this.drawPowerPixelIcon(ctx, p.iconKind, rx, ry, p.accent);
          ctx.fillStyle = p.accent;
          ctx.fillText(p.label, rx + 11, ry + 7);
          rx += rowWidths[j] + 5;
        }
      }
    }

    // Back to Main Menu button (100% pixel font)
    const bw = Math.min(196, this.viewW - 28);
    const btnY = Math.min(this.viewH - 30, cardY + sh + 10);
    ctx.fillStyle = '#2b2412';
    ctx.fillRect(cx - bw / 2, btnY, bw, 22);
    ctx.strokeStyle = '#efc462';
    ctx.strokeRect(cx - bw / 2 + 0.5, btnY + 0.5, bw - 1, 21);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 8px "Pixelify Sans", monospace';
    ctx.fillText(t('back_main_menu'), cx, btnY + 14);
    this.addHit('gameover_menu', cx - bw / 2, btnY, bw, 22);
    ctx.textAlign = 'left';
  }
}
