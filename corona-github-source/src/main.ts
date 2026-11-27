import { sound } from './audio/sound';
import {
  CREST_BG_COLORS,
  CREST_FG_COLORS,
  CROWN_PRESETS,
  HAIR_PRESETS,
  HORSE_PRESETS,
  OUTFIT_PRESETS,
  SHIELD_PATTERNS,
  SHIELD_SHAPES,
  defaultAppearance,
  defaultCrest,
} from './customization/presets';
import { LANGUAGE_LABELS, cycleLanguage, getLanguage, t } from './i18n/translations';
import { PixelRenderer } from './render/renderer';
import {
  deleteCampaignSlot,
  exportAllSavesJson,
  findFirstEmptySlot,
  importAllSavesJson,
  loadCampaign,
  saveCampaign,
} from './storage/saveSystem';
import {
  canAutoGrantOnReturn,
  claimFeedbackReward,
  closeFeedbackPopup,
  deliverPendingFeedbackDiamonds,
  feedbackUi,
  isFeedbackAnswered,
  launchFeedbackForm,
  openFeedbackPopup,
  tickFeedbackTimer,
} from './storage/feedbackSystem';
import {
  authCloudState,
  enableLocalGuestFallback,
  fetchAllPlayersMetrics,
  flushCloudTelemetry,
  initGoogleAuthCloud,
  isPlayerAuthorizedToPlay,
  signInWithGoogleAccount,
  signOutGoogleAccount,
  subscribeAuthCloud,
  tickCloudTelemetry,
  type PlayerMetricRow,
} from './cloud/googleAuthCloud';
import {
  confirmCharacterSelection,
  confirmCrestAndStartCampaign,
  issueUnitCommand,
  sailToIsland,
  showBanner,
  skipTutorial,
  stepWorld,
  triggerCoinDrop,
  triggerMountPower,
  withdrawFromBanker,
} from './systems/simulation';
import { type CommandMode, type InputState, type WorldState } from './types';
import { createInitialWorld, saveDayHalfMinutes } from './world/initWorld';
import { ISLAND_DEFINITIONS } from './world/islands';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context unavailable');

// Top-right Menu DOM elements
const btnMenu = document.getElementById('btn-menu') as HTMLButtonElement | null;
const menuPanel = document.getElementById('menu-panel') as HTMLDivElement | null;
const menuBackdrop = document.getElementById('menu-backdrop') as HTMLDivElement | null;
const menuTitle = document.getElementById('menu-title') as HTMLDivElement | null;
const btnResume = document.getElementById('menu-resume') as HTMLButtonElement | null;
const btnSave = document.getElementById('menu-save') as HTMLButtonElement | null;
const btnHome = document.getElementById('menu-home') as HTMLButtonElement | null;
const btnMap = document.getElementById('menu-map') as HTMLButtonElement | null;
const btnDayLen = document.getElementById('menu-daylen') as HTMLButtonElement | null;
const btnLang = document.getElementById('menu-lang') as HTMLButtonElement | null;
const btnMusic = document.getElementById('menu-music') as HTMLButtonElement | null;
const btnSfx = document.getElementById('menu-sfx') as HTMLButtonElement | null;
const btnFullscreen = document.getElementById('menu-fullscreen') as HTMLButtonElement | null;
const btnAdmin = document.getElementById('menu-admin') as HTMLButtonElement | null;
const btnExport = document.getElementById('menu-export') as HTMLButtonElement | null;
const btnImport = document.getElementById('menu-import') as HTMLButtonElement | null;
const btnSignout = document.getElementById('menu-signout') as HTMLButtonElement | null;
const importFileInput = document.getElementById('import-file-input') as HTMLInputElement | null;

// Google First-Login Gate & User Badge DOM elements
const googleLoginGate = document.getElementById('google-login-gate') as HTMLDivElement | null;
const btnGoogleSignin = document.getElementById('btn-google-signin') as HTMLButtonElement | null;
const lblGoogleCta = document.getElementById('lbl-google-cta');
const googleGateSub = document.getElementById('google-gate-sub');
const googleGateStatus = document.getElementById('google-gate-status');
const btnGuestFallback = document.getElementById('btn-guest-fallback') as HTMLButtonElement | null;
const googleUserBadge = document.getElementById('google-user-badge') as HTMLDivElement | null;
const googleUserAvatar = document.getElementById('google-user-avatar') as HTMLImageElement | null;
const googleUserName = document.getElementById('google-user-name');
const googleUserSync = document.getElementById('google-user-sync');

// Admin Players Dashboard DOM elements
const adminModal = document.getElementById('admin-modal') as HTMLDivElement | null;
const adminRefresh = document.getElementById('admin-refresh') as HTMLButtonElement | null;
const adminClose = document.getElementById('admin-close') as HTMLButtonElement | null;
const adminKpis = document.getElementById('admin-kpis');
const adminTbody = document.getElementById('admin-tbody');

const lblResume = document.getElementById('lbl-resume');
const lblSave = document.getElementById('lbl-save');
const valSave = document.getElementById('val-save');
const lblHome = document.getElementById('lbl-home');
const lblMap = document.getElementById('lbl-map');
const valMap = document.getElementById('val-map');
const lblDayLen = document.getElementById('lbl-daylen');
const valDayLen = document.getElementById('val-daylen');
const lblLang = document.getElementById('lbl-lang');
const valLang = document.getElementById('val-lang');
const lblMusic = document.getElementById('lbl-music');
const valMusic = document.getElementById('val-music');
const lblSfx = document.getElementById('lbl-sfx');
const valSfx = document.getElementById('val-sfx');
const lblFullscreen = document.getElementById('lbl-fullscreen');
const valFullscreen = document.getElementById('val-fullscreen');
const lblAdmin = document.getElementById('lbl-admin');
const lblExport = document.getElementById('lbl-export');
const lblImport = document.getElementById('lbl-import');
const lblSignout = document.getElementById('lbl-signout');
const valSignout = document.getElementById('val-signout');
const lblEscHint = document.getElementById('lbl-esc-hint');

const renderer = new PixelRenderer();
let world: WorldState = createInitialWorld('login');
let menuOpen = false;
let adminOpen = false;
let pausedByMenu = false;

const input: InputState = {
  left: false,
  right: false,
  leftJustPressed: false,
  rightJustPressed: false,
  sprint: false,
  powerJustPressed: false,
  drop: false,
  dropJustPressed: false,
  cmdZ: false,
  cmdX: false,
  cmdC: false,
  cmdV: false,
};

let kbLeft = false;
let kbRight = false;
let kbShift = false;
let kbDoubleSprintDir: -1 | 0 | 1 = 0;
let lastKbTapDir: -1 | 0 | 1 = 0;
let lastKbTapTime = 0;

let activePointerId: number | null = null;
let ptrMoveSide: -1 | 0 | 1 = 0;
let ptrSprint = false;
let lastPtrTapSide: -1 | 0 | 1 = 0;
let lastPtrTapTime = 0;

const DOUBLE_TAP_MS = 340;

/**
 * Dynamically matches the internal pixel-art buffer to 100% of the device's usable width & height
 * (portrait phone, landscape phone, tablet, laptop, or full-screen monitor) with zero stretching or black bars.
 */
function fitCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  const vw = Math.max(160, Math.round(rect.width || window.innerWidth));
  const vh = Math.max(160, Math.round(rect.height || window.innerHeight));
  const aspect = vw / vh;

  let logicalW: number;
  let logicalH: number;

  if (aspect >= 1.15) {
    // Landscape (laptop, desktop, ultrawide, phone landscape, tablet landscape)
    logicalH = 270;
    logicalW = Math.max(310, Math.min(720, Math.round(logicalH * aspect)));
  } else {
    // Portrait or square (phone portrait, narrow window)
    logicalW = Math.max(252, Math.min(340, Math.round(vw / Math.max(1.25, vw / 270))));
    logicalH = Math.max(270, Math.min(540, Math.round(logicalW / Math.max(0.42, aspect))));
    // Keep exact viewport aspect ratio so pixels remain 100% square
    logicalW = Math.max(230, Math.round(logicalH * aspect));
  }

  if (canvas.width !== logicalW || canvas.height !== logicalH) {
    canvas.width = logicalW;
    canvas.height = logicalH;
  }
  world.viewWidth = logicalW;
  world.viewHeight = logicalH;
}

function isFullscreenActive(): boolean {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
}

async function toggleFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };

  try {
    if (isFullscreenActive()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
    } else {
      if (root.requestFullscreen) await root.requestFullscreen();
      else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
    }
  } catch {
    // Some embedded iframes or iOS Safari restrict fullscreen; ignore gracefully
  }
  updateMenuUI();
  setTimeout(fitCanvas, 60);
}

function formatPlayDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAdminTable(rows: PlayerMetricRow[]): void {
  if (!adminKpis || !adminTbody) return;
  const totalPlayers = rows.length;
  const totalLogins = rows.reduce((acc, r) => acc + r.loginCount, 0);
  const totalSeconds = rows.reduce((acc, r) => acc + r.totalPlaySeconds, 0);
  const activeNow = rows.filter(
    (r) => r.status === 'playing' && Date.now() - r.lastActiveMs < 3 * 60 * 1000
  ).length;

  adminKpis.innerHTML = `
    <div class="admin-kpi"><div class="admin-kpi-val">${totalPlayers}</div><div class="admin-kpi-lbl">Jogadores Google</div></div>
    <div class="admin-kpi"><div class="admin-kpi-val">${activeNow}</div><div class="admin-kpi-lbl">Jogando Agora</div></div>
    <div class="admin-kpi"><div class="admin-kpi-val">${totalLogins}</div><div class="admin-kpi-lbl">Total de Acessos</div></div>
    <div class="admin-kpi"><div class="admin-kpi-val">${formatPlayDuration(totalSeconds)}</div><div class="admin-kpi-lbl">Horas Totais</div></div>
  `;

  if (rows.length === 0) {
    adminTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#8aa4bc;">Nenhum jogador registrado ainda.</td></tr>';
    return;
  }

  adminTbody.innerHTML = rows
    .map((r) => {
      const isRecent = Date.now() - r.lastActiveMs < 3 * 60 * 1000;
      const effectiveStatus = isRecent ? r.status : 'offline';
      const statusLabel =
        effectiveStatus === 'playing'
          ? 'Jogando'
          : effectiveStatus === 'menu'
            ? 'Menu'
            : effectiveStatus === 'paused'
              ? 'Pausado'
              : 'Offline';
      const lastStr = r.lastActiveMs ? new Date(r.lastActiveMs).toLocaleString('pt-BR') : '—';
      return `
        <tr>
          <td>
            <div style="font-weight:700;color:#fff4d1;">${escapeHtml(r.displayName)}</div>
            <div style="font-size:10px;color:#8aa4bc;">${escapeHtml(r.email)}</div>
          </td>
          <td><span class="status-pill status-${effectiveStatus}">${statusLabel}</span></td>
          <td>${r.loginCount}x</td>
          <td>${formatPlayDuration(r.totalPlaySeconds)}</td>
          <td>Ilha ${r.currentIsland} · Dia ${r.currentDay} · Nv.${r.kingdomLevel}</td>
          <td>${r.savedCampaignsCount}/8 ${r.feedbackAnswered ? '· ★' : ''}</td>
          <td>${escapeHtml(lastStr)}</td>
        </tr>
      `;
    })
    .join('');
}

async function openAdminDashboard(): Promise<void> {
  if (!authCloudState.user?.isAdmin) return;
  setMenuOpen(false);
  adminOpen = true;
  adminModal?.classList.add('open');
  if (adminTbody) {
    adminTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ffe58a;">Carregando jogadores...</td></tr>';
  }
  try {
    const rows = await fetchAllPlayersMetrics();
    renderAdminTable(rows);
  } catch {
    if (adminTbody) {
      adminTbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;color:#ff9e9e;">Sem permissão no Firestore. Confira as regras de segurança para seu e-mail admin.</td></tr>';
    }
  }
}

function closeAdminDashboard(): void {
  adminOpen = false;
  adminModal?.classList.remove('open');
}

function updateGoogleAuthUI(): void {
  const onLogin = world.mode === 'login';
  const authorized = isPlayerAuthorizedToPlay();
  const showGate = onLogin && !authorized && !feedbackUi.open;

  googleLoginGate?.classList.toggle('visible', showGate);
  if (lblGoogleCta) lblGoogleCta.textContent = t('google_cta');
  if (googleGateSub) googleGateSub.textContent = t('google_gate_sub');
  if (btnGoogleSignin) {
    btnGoogleSignin.disabled = authCloudState.loading || authCloudState.syncing;
  }

  const statusMsg = authCloudState.syncing
    ? t('google_syncing')
    : authCloudState.errorMessage;
  if (googleGateStatus) {
    googleGateStatus.textContent = statusMsg ?? '';
    googleGateStatus.classList.toggle('visible', Boolean(statusMsg));
  }

  if (btnGuestFallback) {
    btnGuestFallback.textContent = t('google_offline_fallback');
    btnGuestFallback.classList.toggle('visible', !authCloudState.configured && showGate);
  }

  const user = authCloudState.user;
  const showBadge = onLogin && user !== null;
  googleUserBadge?.classList.toggle('visible', showBadge);
  if (user) {
    if (googleUserName) googleUserName.textContent = user.displayName;
    if (googleUserSync) {
      googleUserSync.textContent = authCloudState.syncing
        ? t('google_syncing')
        : `☁ ${t('google_cloud_synced')}`;
    }
    if (googleUserAvatar) {
      if (user.photoURL) {
        googleUserAvatar.src = user.photoURL;
        googleUserAvatar.style.display = 'block';
      } else {
        googleUserAvatar.style.display = 'none';
      }
    }
  }

  if (lblAdmin) lblAdmin.textContent = t('google_admin_panel');
  if (btnAdmin) btnAdmin.style.display = user?.isAdmin ? 'flex' : 'none';
  if (lblSignout) lblSignout.textContent = t('google_signout');
  if (valSignout) valSignout.textContent = user ? user.email.split('@')[0] : 'Local';
  if (btnSignout) btnSignout.style.display = user || authCloudState.guestBypass ? 'flex' : 'none';
}

function updateMenuUI(): void {
  const fs = isFullscreenActive();
  const musicOn = sound.isMusicEnabled();
  const sfxOn = sound.isSfxEnabled();

  if (menuTitle) menuTitle.textContent = t('menu_title');
  if (lblResume) lblResume.textContent = t('menu_resume');
  if (lblSave) lblSave.textContent = t('menu_save');
  if (valSave) valSave.textContent = `Slot ${(world.saveSlot ?? 0) + 1}`;
  if (lblHome) lblHome.textContent = t('menu_main');
  if (lblMap) lblMap.textContent = t('menu_map');
  if (valMap) {
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
    valMap.textContent = `${romans[(world.currentIsland - 1) % 9] ?? 'I'}/IX`;
  }
  if (lblDayLen) lblDayLen.textContent = t('menu_daylen');
  if (valDayLen) valDayLen.textContent = `${world.dayHalfMinutes} min`;
  if (lblLang) lblLang.textContent = t('menu_language');
  if (valLang) valLang.textContent = LANGUAGE_LABELS[getLanguage()];
  if (lblMusic) lblMusic.textContent = t('menu_music');
  if (valMusic) {
    valMusic.textContent = musicOn ? t('menu_on') : t('menu_off');
    valMusic.classList.toggle('on', musicOn);
  }
  if (lblSfx) lblSfx.textContent = t('menu_sfx');
  if (valSfx) {
    valSfx.textContent = sfxOn ? t('menu_on') : t('menu_off');
    valSfx.classList.toggle('on', sfxOn);
  }
  if (lblFullscreen) lblFullscreen.textContent = fs ? t('menu_exit_fullscreen') : t('menu_fullscreen');
  if (valFullscreen) {
    valFullscreen.textContent = fs ? t('menu_on') : t('menu_off');
    valFullscreen.classList.toggle('on', fs);
  }
  if (lblExport) lblExport.textContent = t('menu_export');
  if (lblImport) lblImport.textContent = t('menu_import');
  if (lblEscHint) lblEscHint.textContent = t('menu_esc_hint');

  const inCampaign = world.mode === 'playing' || world.mode === 'paused' || world.mode === 'world_map';
  if (btnResume) btnResume.style.display = inCampaign ? 'flex' : 'none';
  if (btnSave) btnSave.style.display = inCampaign ? 'flex' : 'none';
  if (btnMap) btnMap.style.display = inCampaign ? 'flex' : 'none';
  updateGoogleAuthUI();
}

function setMenuOpen(open: boolean): void {
  menuOpen = open;
  menuPanel?.classList.toggle('open', open);
  menuBackdrop?.classList.toggle('open', open);
  btnMenu?.classList.toggle('open', open);

  if (open) {
    clearMovementInputs();
    if (world.mode === 'playing') {
      saveCampaign(world);
      world.mode = 'paused';
      pausedByMenu = true;
      void flushCloudTelemetry(world, 'paused');
    }
  } else {
    if (pausedByMenu && world.mode === 'paused') {
      world.mode = 'playing';
      void flushCloudTelemetry(world, 'playing');
    }
    pausedByMenu = false;
    canvas.focus();
  }
  updateMenuUI();
}

function clearMovementInputs(): void {
  kbLeft = false;
  kbRight = false;
  kbShift = false;
  kbDoubleSprintDir = 0;
  activePointerId = null;
  ptrMoveSide = 0;
  ptrSprint = false;
  input.left = false;
  input.right = false;
  input.sprint = false;
  input.drop = false;
  input.cmdZ = false;
  input.cmdX = false;
  input.cmdC = false;
  input.cmdV = false;
}

function openSlotManager(): void {
  sound.unlock();
  clearMovementInputs();
  renderer.pendingDeleteSlot = null;
  world.mode = 'slot_select';
  sound.playCoinDrop();
  updateMenuUI();
}

function startNewCampaignFlow(targetSlot?: number): void {
  sound.unlock();
  clearMovementInputs();
  const slot = typeof targetSlot === 'number' ? targetSlot : findFirstEmptySlot();
  if (slot < 0) {
    // All 8 slots are occupied — let the player pick or delete one in the 8-slot manager!
    openSlotManager();
    return;
  }
  renderer.charSelectFocusRow = 0;
  renderer.crestSelectFocusRow = 0;
  renderer.pendingDeleteSlot = null;
  world = createInitialWorld('char_select', defaultAppearance(), defaultCrest(), slot);
  world.selectTimer = 20;
  fitCanvas();
  sound.playCoinPickup();
  updateMenuUI();
  canvas.focus();
}

function loadSavedCampaignFlow(slotIndex?: number): void {
  sound.unlock();
  clearMovementInputs();
  const loaded = loadCampaign(slotIndex);
  if (!loaded) return;
  renderer.pendingDeleteSlot = null;
  world = loaded;
  fitCanvas();
  sound.playHorn(false);
  showBanner(
    world,
    `SLOT ${world.saveSlot + 1} — ${t('day_short')} ${world.day}`,
    t('subtitle'),
    world.crest.secondaryColor
  );
  updateMenuUI();
  void flushCloudTelemetry(world, 'playing');
  canvas.focus();
}

function goToLogin(): void {
  if (world.mode === 'playing' || world.mode === 'paused' || world.mode === 'world_map') {
    saveCampaign(world);
    void flushCloudTelemetry(world, 'menu');
  }
  if (feedbackUi.open) {
    feedbackUi.open = false;
    feedbackUi.awaitingConfirm = false;
    feedbackUi.formOpenedAt = null;
    feedbackUi.noUrlNotice = false;
    feedbackUi.loginGrantedNotice = false;
  }
  pausedByMenu = false;
  setMenuOpen(false);
  clearMovementInputs();
  renderer.pendingDeleteSlot = null;
  world = createInitialWorld('login');
  fitCanvas();
  updateMenuUI();
}

function togglePause(): void {
  if (world.mode === 'playing') {
    saveCampaign(world);
    world.mode = 'paused';
    clearMovementInputs();
    void flushCloudTelemetry(world, 'paused');
  } else if (world.mode === 'paused') {
    world.mode = 'playing';
    void flushCloudTelemetry(world, 'playing');
  }
  updateMenuUI();
}

function cycle(val: number, len: number, delta: number): number {
  return (val + delta + len) % len;
}

function adjustCharOption(row: number, delta: number): void {
  if (row === 0) world.appearance.outfitIndex = cycle(world.appearance.outfitIndex, OUTFIT_PRESETS.length, delta);
  else if (row === 1) world.appearance.hairIndex = cycle(world.appearance.hairIndex, HAIR_PRESETS.length, delta);
  else if (row === 2) world.appearance.horseIndex = cycle(world.appearance.horseIndex, HORSE_PRESETS.length, delta);
  else if (row === 3) world.appearance.crownIndex = cycle(world.appearance.crownIndex, CROWN_PRESETS.length, delta);
  sound.playCoinDrop();
}

function adjustCrestOption(row: number, delta: number): void {
  if (row === 0) {
    const idx = SHIELD_SHAPES.findIndex((s) => s.id === world.crest.shape);
    world.crest.shape = SHIELD_SHAPES[cycle(idx, SHIELD_SHAPES.length, delta)].id;
  } else if (row === 1) {
    const idx = SHIELD_PATTERNS.findIndex((p) => p.id === world.crest.pattern);
    world.crest.pattern = SHIELD_PATTERNS[cycle(idx, SHIELD_PATTERNS.length, delta)].id;
  } else if (row === 2) {
    const idx = CREST_BG_COLORS.findIndex((c) => c.hex === world.crest.primaryColor);
    world.crest.primaryColor = CREST_BG_COLORS[cycle(Math.max(0, idx), CREST_BG_COLORS.length, delta)].hex;
  } else if (row === 3) {
    const idx = CREST_FG_COLORS.findIndex((c) => c.hex === world.crest.secondaryColor);
    world.crest.secondaryColor = CREST_FG_COLORS[cycle(Math.max(0, idx), CREST_FG_COLORS.length, delta)].hex;
  }
  sound.playCoinDrop();
}

function toggleTouchCommand(mode: Exclude<CommandMode, 'none'>): void {
  world.touchCommandMode = world.touchCommandMode === mode ? 'none' : mode;
  ptrMoveSide = 0;
  ptrSprint = false;
  sound.playCoinDrop();
}

function completeFeedbackClaim(): void {
  const result = claimFeedbackReward(world);
  if (result === 'granted_now') {
    sound.playBuildComplete();
    sound.playCoinPickup();
    showBanner(world, t('fb_reward_banner_title'), t('fb_reward_banner_sub'), '#5ce1e6');
    saveCampaign(world);
  } else if (result === 'queued_for_campaign') {
    sound.playBuildComplete();
    sound.playCoinPickup();
  }
}

function deliverPendingFeedbackIfPlaying(): void {
  const granted = deliverPendingFeedbackDiamonds(world);
  if (granted > 0) {
    sound.playBuildComplete();
    sound.playCoinPickup();
    showBanner(world, t('fb_reward_banner_title'), t('fb_reward_banner_sub'), '#5ce1e6');
    saveCampaign(world);
  }
}

function handleCanvasHit(hitId: string): boolean {
  // Feedback modal always has top priority when open
  if (hitId === 'feedback_close') {
    closeFeedbackPopup();
    sound.playCoinDrop();
    return true;
  }
  if (hitId === 'feedback_open') {
    sound.playCoinPickup();
    launchFeedbackForm();
    return true;
  }
  if (hitId === 'feedback_claim') {
    completeFeedbackClaim();
    return true;
  }
  if (hitId === 'feedback_backdrop') {
    return true;
  }

  if (hitId === 'login_feedback') {
    sound.playCoinPickup();
    if (isFeedbackAnswered()) {
      if (!launchFeedbackForm()) {
        openFeedbackPopup('login');
        launchFeedbackForm();
      }
    } else {
      openFeedbackPopup('login');
    }
    return true;
  }
  if (hitId === 'login_new') {
    startNewCampaignFlow();
    return true;
  }
  if (hitId === 'login_slots') {
    openSlotManager();
    return true;
  }
  if (hitId === 'login_load') {
    loadSavedCampaignFlow();
    return true;
  }
  if (hitId === 'pause_menu' || hitId === 'gameover_menu') {
    goToLogin();
    return true;
  }

  if (world.mode === 'slot_select') {
    if (hitId === 'slot_back') {
      renderer.pendingDeleteSlot = null;
      world.mode = 'login';
      sound.playCoinDrop();
      updateMenuUI();
      return true;
    }
    if (hitId.startsWith('slot_del_')) {
      const idx = Number(hitId.replace('slot_del_', ''));
      if (renderer.pendingDeleteSlot === idx) {
        deleteCampaignSlot(idx);
        renderer.pendingDeleteSlot = null;
        sound.playHit();
      } else {
        renderer.pendingDeleteSlot = idx;
        sound.playCoinDrop();
      }
      return true;
    }
    if (hitId.startsWith('slot_load_')) {
      const idx = Number(hitId.replace('slot_load_', ''));
      loadSavedCampaignFlow(idx);
      return true;
    }
    if (hitId.startsWith('slot_new_')) {
      const idx = Number(hitId.replace('slot_new_', ''));
      startNewCampaignFlow(idx);
      return true;
    }
  }

  if (world.mode === 'playing') {
    if (hitId === 'hud_cmd_build') {
      toggleTouchCommand('build');
      return true;
    }
    if (hitId === 'hud_cmd_attack') {
      toggleTouchCommand('attack');
      return true;
    }
    if (hitId === 'hud_cmd_archer') {
      toggleTouchCommand('archer');
      return true;
    }
    if (hitId === 'hud_cmd_produce') {
      toggleTouchCommand('produce');
      return true;
    }
    if (hitId === 'hud_cmd_close') {
      world.touchCommandMode = 'none';
      sound.playCoinDrop();
      return true;
    }
    if (hitId === 'prompt_coin_slot') {
      triggerCoinDrop(world);
      return true;
    }
    if (hitId === 'prompt_bank_withdraw') {
      withdrawFromBanker(world);
      return true;
    }
    if (hitId === 'hud_mount_power') {
      triggerMountPower(world);
      return true;
    }
    if (hitId === 'tutorial_skip') {
      skipTutorial(world);
      sound.playCoinDrop();
      return true;
    }
  }

  if (world.mode === 'char_select') {
    const keyToRow: Record<string, number> = { outfit: 0, hair: 1, horse: 2, crown: 3 };
    if (hitId.startsWith('char_prev_')) {
      const r = keyToRow[hitId.replace('char_prev_', '')];
      renderer.charSelectFocusRow = r;
      adjustCharOption(r, -1);
      return true;
    }
    if (hitId.startsWith('char_next_')) {
      const r = keyToRow[hitId.replace('char_next_', '')];
      renderer.charSelectFocusRow = r;
      adjustCharOption(r, 1);
      return true;
    }
    if (hitId === 'char_random') {
      world.appearance.outfitIndex = Math.floor(Math.random() * OUTFIT_PRESETS.length);
      world.appearance.hairIndex = Math.floor(Math.random() * HAIR_PRESETS.length);
      world.appearance.horseIndex = Math.floor(Math.random() * HORSE_PRESETS.length);
      world.appearance.crownIndex = Math.floor(Math.random() * CROWN_PRESETS.length);
      sound.playCoinDrop();
      return true;
    }
    if (hitId === 'char_confirm') {
      confirmCharacterSelection(world);
      return true;
    }
  }

  if (world.mode === 'crest_select') {
    if (hitId === 'crest_prev_shape') {
      renderer.crestSelectFocusRow = 0;
      adjustCrestOption(0, -1);
      return true;
    }
    if (hitId === 'crest_next_shape') {
      renderer.crestSelectFocusRow = 0;
      adjustCrestOption(0, 1);
      return true;
    }
    if (hitId === 'crest_prev_pattern') {
      renderer.crestSelectFocusRow = 1;
      adjustCrestOption(1, -1);
      return true;
    }
    if (hitId === 'crest_next_pattern') {
      renderer.crestSelectFocusRow = 1;
      adjustCrestOption(1, 1);
      return true;
    }
    if (hitId.startsWith('crest_bg_')) {
      const idx = Number(hitId.replace('crest_bg_', ''));
      if (CREST_BG_COLORS[idx]) {
        renderer.crestSelectFocusRow = 2;
        world.crest.primaryColor = CREST_BG_COLORS[idx].hex;
        sound.playCoinDrop();
      }
      return true;
    }
    if (hitId.startsWith('crest_fg_')) {
      const idx = Number(hitId.replace('crest_fg_', ''));
      if (CREST_FG_COLORS[idx]) {
        renderer.crestSelectFocusRow = 3;
        world.crest.secondaryColor = CREST_FG_COLORS[idx].hex;
        sound.playCoinDrop();
      }
      return true;
    }
    if (hitId === 'crest_confirm') {
      confirmCrestAndStartCampaign(world);
      return true;
    }
  }

  if (world.mode === 'world_map') {
    if (hitId.startsWith('map_island_')) {
      const id = Number(hitId.replace('map_island_', ''));
      if (id >= 1 && id <= ISLAND_DEFINITIONS.length) {
        renderer.selectedMapIsland = id;
        sound.playCoinDrop();
      }
      return true;
    }
    if (hitId === 'map_sail_confirm') {
      if (sailToIsland(world, renderer.selectedMapIsland)) {
        updateMenuUI();
      }
      return true;
    }
    if (hitId === 'map_close') {
      world.mode = 'playing';
      world.worldMapContext = 'inspect';
      sound.playCoinDrop();
      updateMenuUI();
      return true;
    }
  }

  return false;
}

function getLogicalCoords(e: PointerEvent): { lx: number; ly: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    lx: ((e.clientX - rect.left) / rect.width) * canvas.width,
    ly: ((e.clientY - rect.top) / rect.height) * canvas.height,
  };
}

// =========================================================================
// UNIFIED TOUCHSCREEN & PC MOUSE CONTROLS ON CANVAS
// =========================================================================
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  sound.unlock();
  canvas.focus();

  if (menuOpen) {
    setMenuOpen(false);
    return;
  }

  const { lx, ly } = getLogicalCoords(e);
  const hitId = renderer.hitTest(lx, ly);
  if (hitId && handleCanvasHit(hitId)) {
    return;
  }

  if (world.mode !== 'playing') return;

  const side: -1 | 1 = lx < canvas.width / 2 ? -1 : 1;

  if (world.activeCommand !== 'none') {
    issueUnitCommand(world, world.activeCommand, side);
    world.touchIndicator = { x: lx, y: ly, side, sprinting: false, timer: 0.35 };
    return;
  }

  const now = performance.now();
  const isDoubleTap = now - lastPtrTapTime <= DOUBLE_TAP_MS && lastPtrTapSide === side;
  lastPtrTapTime = now;
  lastPtrTapSide = side;

  activePointerId = e.pointerId;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Ignore
  }
  ptrMoveSide = side;
  ptrSprint = isDoubleTap;
  world.touchIndicator = { x: lx, y: ly, side, sprinting: isDoubleTap, timer: 0.35 };
});

canvas.addEventListener('pointermove', (e) => {
  if (activePointerId !== e.pointerId || world.mode !== 'playing' || ptrMoveSide === 0) return;
  const { lx } = getLogicalCoords(e);
  const side: -1 | 1 = lx < canvas.width / 2 ? -1 : 1;
  if (side !== ptrMoveSide) {
    ptrMoveSide = side;
    ptrSprint = false;
  }
});

function releasePointer(e: PointerEvent): void {
  if (activePointerId !== e.pointerId) return;
  activePointerId = null;
  ptrMoveSide = 0;
  ptrSprint = false;
}

canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// =========================================================================
// TOP-RIGHT MENU EVENTS
// =========================================================================
btnMenu?.addEventListener('click', (e) => {
  e.stopPropagation();
  sound.unlock();
  setMenuOpen(!menuOpen);
});

menuBackdrop?.addEventListener('click', () => {
  setMenuOpen(false);
});

btnResume?.addEventListener('click', () => {
  setMenuOpen(false);
  if (world.mode === 'paused') world.mode = 'playing';
  updateMenuUI();
});

btnSave?.addEventListener('click', () => {
  saveCampaign(world);
  sound.playBuildComplete();
  setMenuOpen(false);
  showBanner(world, `CAMPANHA SALVA (SLOT ${world.saveSlot + 1})`, 'Progresso salvo no navegador!', '#82e08a');
  updateMenuUI();
});

btnHome?.addEventListener('click', () => {
  goToLogin();
});

btnMap?.addEventListener('click', () => {
  pausedByMenu = false;
  setMenuOpen(false);
  renderer.selectedMapIsland = world.currentIsland;
  world.worldMapContext = 'inspect';
  world.mode = 'world_map';
  sound.playCoinDrop();
  updateMenuUI();
});

btnDayLen?.addEventListener('click', () => {
  world.dayHalfMinutes = (world.dayHalfMinutes % 6) + 1; // 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 1 min
  saveDayHalfMinutes(world.dayHalfMinutes);
  sound.playCoinDrop();
  updateMenuUI();
});

btnLang?.addEventListener('click', () => {
  cycleLanguage();
  sound.playCoinDrop();
  updateMenuUI();
});

btnMusic?.addEventListener('click', () => {
  sound.toggleMusic();
  updateMenuUI();
});

btnSfx?.addEventListener('click', () => {
  sound.toggleSfx();
  if (sound.isSfxEnabled()) sound.playCoinDrop();
  updateMenuUI();
});

btnFullscreen?.addEventListener('click', () => {
  void toggleFullscreen();
});

btnExport?.addEventListener('click', () => {
  if (world.mode === 'playing' || world.mode === 'paused' || world.mode === 'world_map') {
    saveCampaign(world);
  }
  const json = exportAllSavesJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'corona-saves-backup.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  sound.playBuildComplete();
  setMenuOpen(false);
  if (world.mode === 'playing') {
    showBanner(world, 'BACKUP EXPORTADO!', 'Arquivo corona-saves-backup.json salvo!', '#7ef5ff');
  }
});

btnImport?.addEventListener('click', () => {
  importFileInput?.click();
});

importFileInput?.addEventListener('change', () => {
  const file = importFileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const imported = importAllSavesJson(String(reader.result ?? ''));
    importFileInput.value = '';
    setMenuOpen(false);
    if (imported > 0) {
      sound.playHorn(false);
      openSlotManager();
    } else {
      sound.playHit();
    }
  };
  reader.readAsText(file);
});

// Google First-Login Gate, Sign-out, and Admin Dashboard handlers
btnGoogleSignin?.addEventListener('click', () => {
  sound.unlock();
  sound.playCoinPickup();
  void signInWithGoogleAccount();
});

btnGuestFallback?.addEventListener('click', () => {
  sound.unlock();
  sound.playCoinPickup();
  enableLocalGuestFallback();
});

btnAdmin?.addEventListener('click', () => {
  void openAdminDashboard();
});

adminRefresh?.addEventListener('click', () => {
  void openAdminDashboard();
});

adminClose?.addEventListener('click', () => {
  closeAdminDashboard();
});

adminModal?.addEventListener('click', (e) => {
  if (e.target === adminModal) closeAdminDashboard();
});

btnSignout?.addEventListener('click', () => {
  setMenuOpen(false);
  const prevWorld = world;
  goToLogin();
  void signOutGoogleAccount(prevWorld);
});

// Auto-save whenever the user closes the tab, refreshes, or minimizes on mobile!
function autoSaveActiveCampaign(): void {
  if (world.crest.locked && (world.mode === 'playing' || world.mode === 'paused' || world.mode === 'world_map')) {
    saveCampaign(world);
  }
  void flushCloudTelemetry(world, 'offline');
}
window.addEventListener('pagehide', autoSaveActiveCampaign);
window.addEventListener('beforeunload', autoSaveActiveCampaign);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    autoSaveActiveCampaign();
  } else if (document.visibilityState === 'visible') {
    if (canAutoGrantOnReturn()) {
      completeFeedbackClaim();
    }
    if (world.mode === 'playing') {
      void flushCloudTelemetry(world, 'playing');
    }
  }
});
window.addEventListener('focus', () => {
  if (canAutoGrantOnReturn()) {
    completeFeedbackClaim();
  }
});

document.addEventListener('fullscreenchange', () => {
  updateMenuUI();
  setTimeout(fitCanvas, 50);
});
document.addEventListener('webkitfullscreenchange', () => {
  updateMenuUI();
  setTimeout(fitCanvas, 50);
});

// =========================================================================
// KEYBOARD CONTROLS (with Double-Tap Arrow/A/D Sprint & ESC handling)
// =========================================================================
window.addEventListener('keydown', (e) => {
  const code = e.code;
  if (
    code === 'ArrowLeft' ||
    code === 'ArrowRight' ||
    code === 'ArrowDown' ||
    code === 'ArrowUp' ||
    code === 'Space'
  ) {
    e.preventDefault();
  }

  sound.unlock();

  if (code === 'Escape') {
    if (isFullscreenActive()) {
      return;
    }
    if (adminOpen) {
      closeAdminDashboard();
      return;
    }
    if (feedbackUi.open) {
      closeFeedbackPopup();
      sound.playCoinDrop();
      return;
    }
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    if (world.mode === 'slot_select') {
      renderer.pendingDeleteSlot = null;
      world.mode = 'login';
      updateMenuUI();
      return;
    }
    if (world.mode === 'world_map') {
      world.mode = 'playing';
      world.worldMapContext = 'inspect';
      updateMenuUI();
      return;
    }
    if (world.touchCommandMode !== 'none') {
      world.touchCommandMode = 'none';
      return;
    }
    if (world.mode === 'playing' || world.mode === 'paused') {
      setMenuOpen(true);
    }
    return;
  }

  if (menuOpen || feedbackUi.open || adminOpen) return;

  if (world.mode === 'login') {
    if (!isPlayerAuthorizedToPlay()) return;
    if (code === 'Space' || code === 'Enter') startNewCampaignFlow();
    return;
  }

  if (world.mode === 'char_select') {
    if (code === 'ArrowUp' || code === 'KeyW') renderer.charSelectFocusRow = cycle(renderer.charSelectFocusRow, 4, -1);
    else if (code === 'ArrowDown' || code === 'KeyS') renderer.charSelectFocusRow = cycle(renderer.charSelectFocusRow, 4, 1);
    else if (code === 'ArrowLeft' || code === 'KeyA') adjustCharOption(renderer.charSelectFocusRow, -1);
    else if (code === 'ArrowRight' || code === 'KeyD') adjustCharOption(renderer.charSelectFocusRow, 1);
    else if (code === 'Space' || code === 'Enter') confirmCharacterSelection(world);
    return;
  }

  if (world.mode === 'crest_select') {
    if (code === 'ArrowUp' || code === 'KeyW') renderer.crestSelectFocusRow = cycle(renderer.crestSelectFocusRow, 4, -1);
    else if (code === 'ArrowDown' || code === 'KeyS') renderer.crestSelectFocusRow = cycle(renderer.crestSelectFocusRow, 4, 1);
    else if (code === 'ArrowLeft' || code === 'KeyA') adjustCrestOption(renderer.crestSelectFocusRow, -1);
    else if (code === 'ArrowRight' || code === 'KeyD') adjustCrestOption(renderer.crestSelectFocusRow, 1);
    else if (code === 'Space' || code === 'Enter') confirmCrestAndStartCampaign(world);
    return;
  }

  if (world.mode === 'gameover') {
    if (code === 'Space' || code === 'Enter') goToLogin();
    return;
  }

  if (code === 'KeyP') {
    togglePause();
    return;
  }

  const now = performance.now();
  if (code === 'KeyA' || code === 'ArrowLeft') {
    if (!e.repeat && !kbLeft) {
      input.leftJustPressed = true;
      if (world.activeCommand === 'none') {
        if (now - lastKbTapTime <= DOUBLE_TAP_MS && lastKbTapDir === -1) {
          kbDoubleSprintDir = -1;
        } else {
          kbDoubleSprintDir = 0;
        }
        lastKbTapTime = now;
        lastKbTapDir = -1;
      }
    }
    kbLeft = true;
  }
  if (code === 'KeyD' || code === 'ArrowRight') {
    if (!e.repeat && !kbRight) {
      input.rightJustPressed = true;
      if (world.activeCommand === 'none') {
        if (now - lastKbTapTime <= DOUBLE_TAP_MS && lastKbTapDir === 1) {
          kbDoubleSprintDir = 1;
        } else {
          kbDoubleSprintDir = 0;
        }
        lastKbTapTime = now;
        lastKbTapDir = 1;
      }
    }
    kbRight = true;
  }
  if (code === 'ShiftLeft' || code === 'ShiftRight') {
    if (!e.repeat) input.powerJustPressed = true;
    kbShift = true;
  }
  if (code === 'KeyS' || code === 'ArrowDown' || code === 'Space') {
    if (!input.drop) input.dropJustPressed = true;
    input.drop = true;
  }
  if ((code === 'KeyW' || code === 'ArrowUp' || code === 'KeyE') && !e.repeat) {
    withdrawFromBanker(world);
  }

  if (code === 'KeyZ') input.cmdZ = true;
  if (code === 'KeyX') input.cmdX = true;
  if (code === 'KeyC') input.cmdC = true;
  if (code === 'KeyV') input.cmdV = true;
});

window.addEventListener('keyup', (e) => {
  const code = e.code;
  if (code === 'KeyA' || code === 'ArrowLeft') {
    kbLeft = false;
    if (kbDoubleSprintDir === -1) kbDoubleSprintDir = 0;
  }
  if (code === 'KeyD' || code === 'ArrowRight') {
    kbRight = false;
    if (kbDoubleSprintDir === 1) kbDoubleSprintDir = 0;
  }
  if (code === 'ShiftLeft' || code === 'ShiftRight') kbShift = false;
  if (code === 'KeyS' || code === 'ArrowDown' || code === 'Space') input.drop = false;
  if (code === 'KeyZ') input.cmdZ = false;
  if (code === 'KeyX') input.cmdX = false;
  if (code === 'KeyC') input.cmdC = false;
  if (code === 'KeyV') input.cmdV = false;
});

window.addEventListener('blur', clearMovementInputs);
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 120));

subscribeAuthCloud(() => {
  updateMenuUI();
});
initGoogleAuthCloud();

fitCanvas();
updateMenuUI();

const FIXED_DT = 1 / 60;
let lastTime = performance.now();
let accumulator = 0;

function frame(now: number): void {
  const delta = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  accumulator += delta;

  input.left = kbLeft || ptrMoveSide === -1;
  input.right = kbRight || ptrMoveSide === 1;
  input.sprint =
    kbShift ||
    (kbDoubleSprintDir === -1 && kbLeft) ||
    (kbDoubleSprintDir === 1 && kbRight) ||
    (ptrSprint && ptrMoveSide !== 0);

  while (accumulator >= FIXED_DT) {
    if ((feedbackUi.open || adminOpen) && world.mode === 'playing') {
      world.elapsed += FIXED_DT;
    } else {
      stepWorld(world, input, FIXED_DT);
      if (world.mode === 'playing') {
        deliverPendingFeedbackIfPlaying();
        tickCloudTelemetry(FIXED_DT, world);
        if (tickFeedbackTimer(FIXED_DT, !menuOpen && !world.tutorial?.active)) {
          clearMovementInputs();
          sound.playCoinPickup();
        }
      }
    }
    input.dropJustPressed = false;
    input.leftJustPressed = false;
    input.rightJustPressed = false;
    input.powerJustPressed = false;
    accumulator -= FIXED_DT;
  }

  renderer.render(ctx!, world);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
