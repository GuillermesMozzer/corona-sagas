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
  MAX_COOP_PLAYERS,
  adminUnbanCommunityPlayer,
  coopState,
  fetchCommunityBans,
  getMicInputVolume,
  getVoiceOutVolume,
  guestSyncCoopFrame,
  hostCloseCoopRoom,
  hostKickCoopPlayer,
  hostOpenCoopRoom,
  hostSyncCoopWorld,
  isMicInputEnabled,
  isVoiceOutEnabled,
  joinCoopRoomAsGuest,
  leaveCoopAsGuest,
  reportAndBanCoopPlayer,
  resumeRemoteCoopAudio,
  sendCoopChatMessage,
  setCoopChatOpen,
  setGuestForceExitHandler,
  setMicInputVolume,
  setVoiceOutVolume,
  subscribeCoop,
  toggleCoopMicrophone,
  toggleMicInput,
  toggleVoiceOut,
  validateCoopJoinCode,
  type CommunityBanRecord,
  type CoopMember,
} from './cloud/coopSystem';
import {
  FRIENDS_PER_TIER,
  WHATSAPP_COMMUNITY_URL,
  buildInviteShareMessage,
  claimWhatsappCommunityReward,
  deliverPendingReferralDiamonds,
  getTierDiamondReward,
  getTotalEarnedReferralDiamonds,
  initPendingFriendCodeFromUrl,
  isWhatsappRewardClaimed,
  referralState,
  setPendingFriendCodeInput,
  subscribeReferrals,
  syncReferralProfileForUser,
} from './cloud/referralSystem';
import { type CommunityReportReason } from './config/reportForm';
import {
  computeActivePrompt,
  confirmCharacterSelection,
  confirmCrestAndStartCampaign,
  issueUnitCommand,
  orderSpecificVillager,
  sailToIsland,
  showBanner,
  skipTutorial,
  stepWorld,
  togglePriorityTask,
  triggerCoinDrop,
  triggerMountPower,
  withdrawFromBanker,
} from './systems/simulation';
import { type BuilderTaskKind, type CommandMode, type InputState, type WorldState } from './types';
import { createInitialWorld, saveDayHalfMinutes } from './world/initWorld';
import { ISLAND_DEFINITIONS } from './world/islands';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context unavailable');

/**
 * Enhances every canvas text draw with crisp pixel-art typography:
 * - Maps generic `monospace` fonts to Google Fonts `Pixelify Sans` (authentic pixel-art geometry with full PT/ES accents)
 * - Gently boosts microscopic 5.5px–7px labels so they remain effortless to read without overflowing buttons
 * - Adds a crisp 1-logical-pixel dark drop shadow behind light text so labels pop over snow, torches, sky, and water
 */
function installCrispPixelText(targetCtx: CanvasRenderingContext2D): void {
  const upgradeFontString = (raw: string): string => {
    if (!raw.includes('monospace')) return raw;
    return raw.replace(
      /(bold\s+|normal\s+|\d{3}\s+)?(\d+(?:\.\d+)?)px\s+monospace\b/i,
      (_match, weight = '', sizeStr: string) => {
        const size = parseFloat(sizeStr);
        let nextSize = size;
        if (size <= 5.6) nextSize = 6.3;
        else if (size <= 6.1) nextSize = 6.7;
        else if (size <= 6.6) nextSize = 7.1;
        else if (size <= 7.1) nextSize = 7.5;
        return `${weight}${nextSize}px "Pixelify Sans", "Trebuchet MS", ui-monospace, monospace`;
      }
    );
  };

  try {
    const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
    if (desc?.get && desc?.set) {
      Object.defineProperty(targetCtx, 'font', {
        configurable: true,
        get() {
          return desc.get!.call(this);
        },
        set(val: string) {
          desc.set!.call(this, upgradeFontString(val));
        },
      });
    }
  } catch {
    // Fallback gracefully if environment restricts prototype descriptors
  }

  const rawFillText = targetCtx.fillText.bind(targetCtx);
  const isLightFill = (fill: string | CanvasGradient | CanvasPattern): boolean => {
    if (typeof fill !== 'string') return true;
    const s = fill.trim().toLowerCase();
    if (s.startsWith('#') && (s.length === 7 || s.length === 4)) {
      const hex = s.length === 4 ? `${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : s.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return 0.299 * r + 0.587 * g + 0.114 * b > 85;
    }
    const rgbMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
      const r = Number(rgbMatch[1]);
      const g = Number(rgbMatch[2]);
      const b = Number(rgbMatch[3]);
      return 0.299 * r + 0.587 * g + 0.114 * b > 85;
    }
    return true;
  };

  targetCtx.fillText = (text: string, x: number, y: number, maxWidth?: number): void => {
    const rx = Math.round(x * 2) / 2;
    const ry = Math.round(y * 2) / 2;
    const prevFill = targetCtx.fillStyle;
    if (isLightFill(prevFill)) {
      targetCtx.fillStyle = 'rgba(2, 6, 14, 0.8)';
      if (maxWidth !== undefined) {
        rawFillText(text, rx + 0.5, ry + 0.75, maxWidth);
      } else {
        rawFillText(text, rx + 0.5, ry + 0.75);
      }
      targetCtx.fillStyle = prevFill;
    }
    if (maxWidth !== undefined) {
      rawFillText(text, rx, ry, maxWidth);
    } else {
      rawFillText(text, rx, ry);
    }
  };
}

installCrispPixelText(ctx);

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
const btnMusicVolDown = document.getElementById('btn-music-vol-down') as HTMLButtonElement | null;
const btnMusicVolUp = document.getElementById('btn-music-vol-up') as HTMLButtonElement | null;
const musicVolBars = document.getElementById('music-vol-bars') as HTMLDivElement | null;
const valMusicVol = document.getElementById('val-music-vol');
const btnSfxVolDown = document.getElementById('btn-sfx-vol-down') as HTMLButtonElement | null;
const btnSfxVolUp = document.getElementById('btn-sfx-vol-up') as HTMLButtonElement | null;
const sfxVolBars = document.getElementById('sfx-vol-bars') as HTMLDivElement | null;
const valSfxVol = document.getElementById('val-sfx-vol');
const btnVoiceOut = document.getElementById('menu-voice-out') as HTMLButtonElement | null;
const btnVoiceOutDown = document.getElementById('btn-voice-out-down') as HTMLButtonElement | null;
const btnVoiceOutUp = document.getElementById('btn-voice-out-up') as HTMLButtonElement | null;
const voiceOutBars = document.getElementById('voice-out-bars') as HTMLDivElement | null;
const valVoiceOut = document.getElementById('val-voice-out');
const lblVoiceOut = document.getElementById('lbl-voice-out');
const btnMicVol = document.getElementById('menu-mic-vol') as HTMLButtonElement | null;
const btnMicVolDown = document.getElementById('btn-mic-vol-down') as HTMLButtonElement | null;
const btnMicVolUp = document.getElementById('btn-mic-vol-up') as HTMLButtonElement | null;
const micVolBars = document.getElementById('mic-vol-bars') as HTMLDivElement | null;
const valMicVol = document.getElementById('val-mic-vol');
const lblMicVol = document.getElementById('lbl-mic-vol');
const btnZoomOut = document.getElementById('btn-zoom-out') as HTMLButtonElement | null;
const btnZoomIn = document.getElementById('btn-zoom-in') as HTMLButtonElement | null;
const valZoom = document.getElementById('val-zoom');
const btnFullscreen = document.getElementById('menu-fullscreen') as HTMLButtonElement | null;
const btnAdmin = document.getElementById('menu-admin') as HTMLButtonElement | null;
const btnExport = document.getElementById('menu-export') as HTMLButtonElement | null;
const btnImport = document.getElementById('menu-import') as HTMLButtonElement | null;
const btnSignout = document.getElementById('menu-signout') as HTMLButtonElement | null;
const importFileInput = document.getElementById('import-file-input') as HTMLInputElement | null;
const charNameInput = document.getElementById('char-name-input') as HTMLInputElement | null;

// WhatsApp Community (+3 Diamonds) + Invite Friends (+3/+5 Diamonds) + Co-op Menu DOM elements
function openWhatsappCommunity(): void {
  sound.unlock();
  const reward = claimWhatsappCommunityReward(world);
  if (reward.newlyClaimed) {
    sound.playBuildComplete();
    sound.playCoinPickup();
    if (reward.grantedNow) {
      saveCampaign(world);
      showBanner(world, t('wa_reward_title'), t('wa_reward_sub_now'), '#5ce1e6');
    } else {
      showBanner(world, t('wa_reward_title'), t('wa_reward_sub_queue'), '#5ce1e6');
    }
    updateMenuUI();
  } else {
    sound.playCoinPickup();
  }
  const opened = window.open(WHATSAPP_COMMUNITY_URL, '_blank', 'noopener,noreferrer');
  if (!opened) {
    window.location.href = WHATSAPP_COMMUNITY_URL;
  }
}
const loginReferralWrap = document.getElementById('login-referral-wrap') as HTMLDivElement | null;
const referralCodeInput = document.getElementById('referral-code-input') as HTMLInputElement | null;
const referralCodeHint = document.getElementById('referral-code-hint') as HTMLDivElement | null;

const btnWhatsapp = document.getElementById('menu-whatsapp') as HTMLButtonElement | null;
const lblWhatsapp = document.getElementById('lbl-whatsapp');
const valWhatsapp = document.getElementById('val-whatsapp');
const btnReferral = document.getElementById('menu-referral') as HTMLButtonElement | null;
const lblReferral = document.getElementById('lbl-referral');
const valReferral = document.getElementById('val-referral');

const referralModal = document.getElementById('referral-modal') as HTMLDivElement | null;
const btnRefClose = document.getElementById('btn-ref-close') as HTMLButtonElement | null;
const refMyCodeVal = document.getElementById('ref-my-code-val');
const btnRefCopyInvite = document.getElementById('btn-ref-copy-invite') as HTMLButtonElement | null;
const refCopyFeedback = document.getElementById('ref-copy-feedback');
const refTotalFriends = document.getElementById('ref-total-friends');
const refTotalDiamonds = document.getElementById('ref-total-diamonds');
const refTiersList = document.getElementById('ref-tiers-list') as HTMLDivElement | null;

const menuCoopSectionLbl = document.getElementById('menu-coop-section-lbl');
const btnCoopHostToggle = document.getElementById('menu-coop-host-toggle') as HTMLButtonElement | null;
const lblCoopHost = document.getElementById('lbl-coop-host');
const valCoopHost = document.getElementById('val-coop-host');
const btnCoopGuestLeave = document.getElementById('menu-coop-guest-leave') as HTMLButtonElement | null;
const coopMenuBox = document.getElementById('coop-menu-box') as HTMLDivElement | null;
const coopRoomCodeVal = document.getElementById('coop-room-code-val');
const btnCoopCopyCode = document.getElementById('btn-coop-copy-code') as HTMLButtonElement | null;
const coopMembersList = document.getElementById('coop-members-list') as HTMLDivElement | null;

const coopQuickRail = document.getElementById('coop-quick-rail') as HTMLDivElement | null;
const btnCoopChat = document.getElementById('btn-coop-chat') as HTMLButtonElement | null;
const btnCoopMic = document.getElementById('btn-coop-mic') as HTMLButtonElement | null;
const chatUnreadDot = document.getElementById('chat-unread-dot');
const coopChatPanel = document.getElementById('coop-chat-panel') as HTMLDivElement | null;
const coopChatTitle = document.getElementById('coop-chat-title');
const coopChatOpenRoom = document.getElementById('coop-chat-open-room') as HTMLButtonElement | null;
const coopChatClose = document.getElementById('coop-chat-close') as HTMLButtonElement | null;
const coopChatMessages = document.getElementById('coop-chat-messages') as HTMLDivElement | null;
const coopChatForm = document.getElementById('coop-chat-form') as HTMLFormElement | null;
const coopChatInput = document.getElementById('coop-chat-input') as HTMLInputElement | null;

const coopJoinModal = document.getElementById('coop-join-modal') as HTMLDivElement | null;
const coopJoinCodeInput = document.getElementById('coop-join-code-input') as HTMLInputElement | null;
const coopJoinStatus = document.getElementById('coop-join-status');
const btnCoopJoinCancel = document.getElementById('btn-coop-join-cancel') as HTMLButtonElement | null;
const btnCoopJoinGo = document.getElementById('btn-coop-join-go') as HTMLButtonElement | null;

const coopReportModal = document.getElementById('coop-report-modal') as HTMLDivElement | null;
const coopReportTargetInfo = document.getElementById('coop-report-target-info');
const coopReportReasons = document.getElementById('coop-report-reasons');
const coopReportDetails = document.getElementById('coop-report-details') as HTMLTextAreaElement | null;
const coopReportStatus = document.getElementById('coop-report-status');
const btnCoopReportCancel = document.getElementById('btn-coop-report-cancel') as HTMLButtonElement | null;
const btnCoopReportConfirm = document.getElementById('btn-coop-report-confirm') as HTMLButtonElement | null;

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

// Admin Players & Moderation Dashboard DOM elements
const adminModal = document.getElementById('admin-modal') as HTMLDivElement | null;
const adminTabPlayers = document.getElementById('admin-tab-players') as HTMLButtonElement | null;
const adminTabBans = document.getElementById('admin-tab-bans') as HTMLButtonElement | null;
const adminRefresh = document.getElementById('admin-refresh') as HTMLButtonElement | null;
const adminClose = document.getElementById('admin-close') as HTMLButtonElement | null;
const adminKpis = document.getElementById('admin-kpis');
const adminTableWrap = document.getElementById('admin-table-wrap') as HTMLDivElement | null;
const adminTbody = document.getElementById('admin-tbody');
const adminBansWrap = document.getElementById('admin-bans-wrap') as HTMLDivElement | null;
const adminBansTbody = document.getElementById('admin-bans-tbody');

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
const lblSfx = document.getElementById('lbl-sfx');
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
let adminActiveTab: 'players' | 'bans' = 'players';
let pausedByMenu = false;

// Co-op modal & join flow state
let joinModalOpen = false;
let pendingCoopJoinCode: string | null = null;
let reportModalOpen = false;
let reportTargetMember: CoopMember | null = null;
let selectedReportReason: CommunityReportReason = 'Assédio sexual';

// Smooth Camera Zoom In / Zoom Out (persisted in localStorage)
const ZOOM_KEY = 'corona_zoom_v1';
const ZOOM_STEPS = [0.75, 0.85, 1.0, 1.15, 1.3, 1.45];
let targetZoom = 1.0;
try {
  const savedZ = Number(window.localStorage.getItem(ZOOM_KEY) ?? '1');
  if (Number.isFinite(savedZ) && savedZ >= 0.7 && savedZ <= 1.5) {
    targetZoom = savedZ;
  }
} catch {
  // Ignore storage errors
}
let currentZoom = targetZoom;

function adjustCameraZoom(deltaStep: -1 | 1): void {
  let closestIdx = 0;
  let bestDiff = 99;
  ZOOM_STEPS.forEach((z, idx) => {
    const diff = Math.abs(z - targetZoom);
    if (diff < bestDiff) {
      bestDiff = diff;
      closestIdx = idx;
    }
  });
  const nextIdx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, closestIdx + deltaStep));
  targetZoom = ZOOM_STEPS[nextIdx];
  try {
    window.localStorage.setItem(ZOOM_KEY, String(targetZoom));
  } catch {
    // Ignore
  }
  sound.playCoinDrop();
  updateMenuUI();
}

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
 * and smoothly applies user Zoom In / Zoom Out while keeping pixels crisp and square.
 */
function fitCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  const vw = Math.max(160, Math.round(rect.width || window.innerWidth));
  const vh = Math.max(160, Math.round(rect.height || window.innerHeight));
  const aspect = vw / vh;
  const zoom = world.mode === 'playing' || world.mode === 'paused' ? currentZoom : 1.0;

  let logicalW: number;
  let logicalH: number;

  if (aspect >= 1.15) {
    // Landscape (laptop, desktop, ultrawide, phone landscape, tablet landscape)
    logicalH = Math.max(180, Math.min(390, Math.round(270 / zoom)));
    logicalW = Math.max(240, Math.min(920, Math.round(logicalH * aspect)));
  } else {
    // Portrait or square (phone portrait, narrow window)
    const baseW = Math.max(252, Math.min(340, Math.round(vw / Math.max(1.25, vw / 270))));
    const baseH = Math.max(270, Math.min(540, Math.round(baseW / Math.max(0.42, aspect))));
    logicalH = Math.max(190, Math.min(640, Math.round(baseH / zoom)));
    logicalW = Math.max(190, Math.round(logicalH * aspect));
  }

  const dpr = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
  const renderScale = Math.max(2, Math.min(4, Math.ceil((vw * dpr) / logicalW)));
  const bufW = logicalW * renderScale;
  const bufH = logicalH * renderScale;

  if (canvas.width !== bufW || canvas.height !== bufH) {
    canvas.width = bufW;
    canvas.height = bufH;
  }
  renderer.setViewport(logicalW, logicalH, renderScale);
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

function renderAdminBansTable(bans: CommunityBanRecord[]): void {
  if (!adminBansTbody) return;
  if (bans.length === 0) {
    adminBansTbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:#8aa4bc;">Nenhuma denúncia registrada na comunidade.</td></tr>';
    return;
  }
  adminBansTbody.innerHTML = bans
    .map((b) => {
      const dateStr = b.createdAtMs ? new Date(b.createdAtMs).toLocaleString('pt-BR') : '—';
      const mailtoHref = `mailto:${encodeURIComponent(b.email)},${encodeURIComponent(b.reporterEmail)}?subject=${encodeURIComponent(`Corona Sagas — Análise de Denúncia (${b.reason})`)}`;
      return `
        <tr>
          <td>
            <div style="font-weight:700;color:#fff4d1;">${escapeHtml(b.displayName)}</div>
            <div style="font-size:10px;color:#ffadb6;">${escapeHtml(b.email)}</div>
          </td>
          <td>
            <div style="font-weight:700;color:#cfe7fc;">${escapeHtml(b.reporterName)}</div>
            <div style="font-size:10px;color:#8aa4bc;">${escapeHtml(b.reporterEmail)}</div>
          </td>
          <td style="white-space:normal;min-width:160px;">
            <div style="font-weight:700;color:#ffe58a;">${escapeHtml(b.reason)}</div>
            ${b.details ? `<div style="font-size:10px;color:#c2d7eb;">${escapeHtml(b.details)}</div>` : ''}
            <div style="font-size:9px;color:#7e98b2;">${escapeHtml(dateStr)} · Sala ${escapeHtml(b.roomCode)}</div>
          </td>
          <td>
            <span class="status-pill ${b.banned ? 'status-banned' : 'status-playing'}">
              ${b.banned ? 'BANIDO' : 'AUTORIZADO'}
            </span>
          </td>
          <td>
            <div style="display:flex;gap:5px;align-items:center;">
              <a href="${mailtoHref}" class="admin-btn" style="text-decoration:none;">✉ E-mail</a>
              ${
                b.banned
                  ? `<button type="button" class="admin-btn" data-unban-uid="${escapeHtml(b.uid)}" style="border-color:#6fe87b;background:#153826;color:#a8ffb2;">✓ Autorizar</button>`
                  : ''
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  adminBansTbody.querySelectorAll<HTMLButtonElement>('[data-unban-uid]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.unbanUid;
      if (!uid) return;
      btn.disabled = true;
      btn.textContent = '...';
      const ok = await adminUnbanCommunityPlayer(uid);
      if (ok) {
        sound.playBuildComplete();
        await openAdminDashboard();
      } else {
        btn.disabled = false;
        btn.textContent = 'Erro';
      }
    });
  });
}

function setAdminTab(tab: 'players' | 'bans'): void {
  adminActiveTab = tab;
  adminTabPlayers?.classList.toggle('active-tab', tab === 'players');
  adminTabBans?.classList.toggle('active-tab', tab === 'bans');
  if (adminTableWrap) adminTableWrap.style.display = tab === 'players' ? 'block' : 'none';
  if (adminBansWrap) adminBansWrap.style.display = tab === 'bans' ? 'block' : 'none';
}

async function openAdminDashboard(): Promise<void> {
  if (!authCloudState.user?.isAdmin) return;
  setMenuOpen(false);
  adminOpen = true;
  adminModal?.classList.add('open');
  setAdminTab(adminActiveTab);
  if (adminTbody) {
    adminTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ffe58a;">Carregando jogadores...</td></tr>';
  }
  if (adminBansTbody) {
    adminBansTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ffe58a;">Carregando denúncias...</td></tr>';
  }
  try {
    const [rows, bans] = await Promise.all([fetchAllPlayersMetrics(), fetchCommunityBans()]);
    renderAdminTable(rows);
    renderAdminBansTable(bans);
    const activeBans = bans.filter((b) => b.banned).length;
    if (adminTabBans) {
      adminTabBans.textContent = activeBans > 0 ? `Denúncias & Banidos (${activeBans})` : 'Denúncias & Banidos';
    }
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

function renderPixelVolumeBars(
  container: HTMLDivElement | null,
  currentVol: number,
  enabled: boolean,
  onSelect: (level: number) => void
): void {
  if (!container) return;
  container.innerHTML = '';
  const effectiveVol = enabled ? currentVol : 0;

  const zeroBtn = document.createElement('button');
  zeroBtn.type = 'button';
  zeroBtn.className = `pixel-vol-pip zero-pip${effectiveVol === 0 ? ' active' : ''}`;
  zeroBtn.textContent = '0';
  zeroBtn.title = 'Volume 0';
  zeroBtn.addEventListener('click', () => onSelect(0));
  container.appendChild(zeroBtn);

  for (let i = 1; i <= 5; i++) {
    const pip = document.createElement('button');
    pip.type = 'button';
    pip.className = `pixel-vol-pip${i <= effectiveVol ? ' filled' : ''}`;
    pip.title = `Volume ${i}/5`;
    pip.addEventListener('click', () => onSelect(i));
    container.appendChild(pip);
  }
}

function openReportModal(member: CoopMember): void {
  reportTargetMember = member;
  selectedReportReason = 'Assédio sexual';
  reportModalOpen = true;
  if (coopReportTargetInfo) {
    coopReportTargetInfo.innerHTML = `
      <div><strong>Denunciado:</strong> ${escapeHtml(member.displayName)} (${escapeHtml(member.email)})</div>
      <div><strong>Denunciante:</strong> ${escapeHtml(authCloudState.user?.email ?? '')}</div>
    `;
  }
  if (coopReportDetails) coopReportDetails.value = '';
  if (coopReportStatus) coopReportStatus.textContent = '';
  coopReportReasons?.querySelectorAll<HTMLButtonElement>('.pixel-reason-btn').forEach((b) => {
    b.classList.toggle('selected', b.dataset.reason === selectedReportReason);
  });
  coopReportModal?.classList.add('open');
}

function closeReportModal(): void {
  reportModalOpen = false;
  reportTargetMember = null;
  coopReportModal?.classList.remove('open');
}

function openJoinCoopModal(): void {
  if (!authCloudState.user) {
    sound.playHit();
    return;
  }
  joinModalOpen = true;
  if (coopJoinCodeInput) coopJoinCodeInput.value = '';
  if (coopJoinStatus) coopJoinStatus.textContent = '';
  coopJoinModal?.classList.add('open');
  setTimeout(() => coopJoinCodeInput?.focus(), 40);
}

function closeJoinCoopModal(): void {
  joinModalOpen = false;
  coopJoinModal?.classList.remove('open');
}

let referralModalOpen = false;

const PIXEL_DIAMOND_SVG = `
  <svg width="14" height="14" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="4" y="1" width="4" height="1" fill="#c7fbff"/>
    <rect x="2" y="2" width="8" height="2" fill="#5ce1e6"/>
    <rect x="1" y="4" width="10" height="2" fill="#32b8d4"/>
    <rect x="2" y="6" width="8" height="2" fill="#1d8eb0"/>
    <rect x="4" y="8" width="4" height="2" fill="#146c8c"/>
    <rect x="5" y="10" width="2" height="1" fill="#0d4e69"/>
    <rect x="4" y="2" width="2" height="2" fill="#ffffff"/>
  </svg>
`;

function renderReferralModal(): void {
  if (refMyCodeVal) {
    refMyCodeVal.textContent = referralState.inviteCode || '------';
  }
  const refs = referralState.referrals;
  if (refTotalFriends) {
    refTotalFriends.textContent = String(refs.length);
  }
  if (refTotalDiamonds) {
    refTotalDiamonds.textContent = `${getTotalEarnedReferralDiamonds()} 💎`;
  }
  if (!refTiersList) return;

  // Always show all completed 3-friend rows PLUS the current active row (with empty slots ready to fill!)
  const totalRows = Math.floor(refs.length / FRIENDS_PER_TIER) + 1;
  refTiersList.innerHTML = '';

  for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
    const start = rowIdx * FRIENDS_PER_TIER;
    const rowFriends = refs.slice(start, start + FRIENDS_PER_TIER);
    const isCompleted = rowFriends.length >= FRIENDS_PER_TIER;
    const rewardAmount = getTierDiamondReward(rowIdx);

    const rowEl = document.createElement('div');
    rowEl.className = `ref-tier-row${isCompleted ? ' completed' : ''}`;

    const slotsGrid = document.createElement('div');
    slotsGrid.className = 'ref-slots-grid';

    for (let slotIdx = 0; slotIdx < FRIENDS_PER_TIER; slotIdx++) {
      const friend = rowFriends[slotIdx];
      const slotEl = document.createElement('div');
      slotEl.className = `ref-friend-slot ${friend ? 'filled' : 'empty'}`;

      if (friend) {
        if (friend.photoURL) {
          const img = document.createElement('img');
          img.className = 'ref-friend-avatar';
          img.referrerPolicy = 'no-referrer';
          img.alt = friend.displayName;
          img.src = friend.photoURL;
          img.onerror = () => {
            const fb = document.createElement('div');
            fb.className = 'ref-friend-fallback';
            fb.textContent = (friend.displayName || 'M').trim().charAt(0).toUpperCase() || 'M';
            img.replaceWith(fb);
          };
          slotEl.appendChild(img);
        } else {
          const fb = document.createElement('div');
          fb.className = 'ref-friend-fallback';
          fb.textContent = (friend.displayName || 'M').trim().charAt(0).toUpperCase() || 'M';
          slotEl.appendChild(fb);
        }
        const nameEl = document.createElement('div');
        nameEl.className = 'ref-friend-name';
        nameEl.title = friend.displayName;
        nameEl.textContent = friend.displayName;
        slotEl.appendChild(nameEl);
      } else {
        const plusEl = document.createElement('div');
        plusEl.className = 'ref-empty-plus';
        plusEl.textContent = '+';
        slotEl.appendChild(plusEl);
        const nameEl = document.createElement('div');
        nameEl.className = 'ref-friend-name';
        nameEl.textContent = 'Vazio';
        slotEl.appendChild(nameEl);
      }
      slotsGrid.appendChild(slotEl);
    }

    const rewardBox = document.createElement('div');
    rewardBox.className = 'ref-tier-reward';
    rewardBox.innerHTML = `
      <div class="ref-diamond-pill">${PIXEL_DIAMOND_SVG}<span>${rewardAmount}</span></div>
      <div class="ref-check-badge${isCompleted ? ' done' : ''}" title="${isCompleted ? 'Recompensa conquistada!' : 'Convide amigos para completar'}">${
        isCompleted ? '✓' : `${rowFriends.length}/${FRIENDS_PER_TIER}`
      }</div>
    `;

    rowEl.appendChild(slotsGrid);
    rowEl.appendChild(rewardBox);
    refTiersList.appendChild(rowEl);
  }
}

function updatePreLoginReferralUI(): void {
  const code = referralState.pendingFriendCode;
  if (referralCodeInput && document.activeElement !== referralCodeInput) {
    referralCodeInput.value = code;
  }
  loginReferralWrap?.classList.toggle('has-code', code.length >= 4);
  referralCodeHint?.classList.toggle('visible', code.length >= 4);
}

function openReferralModal(): void {
  sound.unlock();
  if (!authCloudState.user) {
    sound.playHit();
    return;
  }
  if (menuOpen) setMenuOpen(false);
  referralModalOpen = true;
  if (refCopyFeedback) refCopyFeedback.textContent = '';
  renderReferralModal();
  referralModal?.classList.add('open');
  sound.playCoinPickup();
}

function closeReferralModal(): void {
  referralModalOpen = false;
  referralModal?.classList.remove('open');
  sound.playCoinDrop();
}

function updateCoopUI(): void {
  const inCampaign = world.mode === 'playing' || world.mode === 'paused' || world.mode === 'world_map';
  const isPlaying = world.mode === 'playing';
  const isHost = coopState.active && coopState.role === 'host';
  const isGuest = coopState.active && coopState.role === 'guest';
  const myUid = authCloudState.user?.uid ?? '';

  // Gameplay Quick Rail (Chat bubble + Microphone directly below Menu button — only visible while Co-op is active)
  coopQuickRail?.classList.toggle('visible', isPlaying && coopState.active);
  if (btnCoopChat) {
    btnCoopChat.classList.toggle('active', coopState.chatOpen);
  }
  if (chatUnreadDot) {
    chatUnreadDot.textContent = String(Math.min(99, coopState.unreadMessages));
    chatUnreadDot.classList.toggle('visible', coopState.active && coopState.unreadMessages > 0 && !coopState.chatOpen);
  }
  if (btnCoopMic) {
    btnCoopMic.classList.toggle('active', coopState.micOn);
    btnCoopMic.classList.toggle('speaking', coopState.micOn && coopState.speaking);
    btnCoopMic.classList.toggle('muted', !coopState.micOn);
    btnCoopMic.title = coopState.micOn
      ? 'Microfone Ligado na sala Co-op (clique para mutar)'
      : 'Abrir Microfone';
  }

  // In-Game Text Chat Drawer (only open while Co-op is active)
  coopChatPanel?.classList.toggle('open', isPlaying && coopState.active && coopState.chatOpen);
  if (coopChatOpenRoom) {
    coopChatOpenRoom.style.display = 'none';
  }
  if (coopChatTitle) {
    coopChatTitle.textContent = coopState.roomCode
      ? `CHAT CO-OP · ${coopState.roomCode} (${coopState.members.length}/${MAX_COOP_PLAYERS})`
      : 'CHAT DA CAMPANHA';
  }
  if (coopChatMessages) {
    const atBottom =
      coopChatMessages.scrollHeight - coopChatMessages.scrollTop - coopChatMessages.clientHeight < 28;
    if (coopState.messages.length === 0) {
      coopChatMessages.innerHTML = coopState.active
        ? '<div class="chat-msg-sys">Sala Co-op conectada! Digite abaixo ou ligue o microfone para conversar em tempo real.</div>'
        : '<div class="chat-msg-sys">Chat pronto! Clique em + CO-OP acima (ou no Menu ☰) para gerar um código e jogar/conversar com até 4 jogadores.</div>';
    } else {
      const hintLine = !coopState.active
        ? '<div class="chat-msg-sys">Modo solo — clique em + CO-OP acima para compartilhar o chat e microfone com amigos!</div>'
        : '';
      coopChatMessages.innerHTML =
        hintLine +
        coopState.messages
          .map(
            (m) =>
              `<div class="chat-msg-line"><span class="chat-msg-author">${escapeHtml(m.displayName)}:</span>${escapeHtml(m.text)}</div>`
          )
          .join('');
    }
    if (atBottom) coopChatMessages.scrollTop = coopChatMessages.scrollHeight;
  }

  // Co-op Section inside Top-Right Menu
  if (menuCoopSectionLbl) {
    menuCoopSectionLbl.style.display = inCampaign ? 'block' : 'none';
    menuCoopSectionLbl.textContent = coopState.active
      ? `CO-OP ONLINE (${coopState.members.length}/${MAX_COOP_PLAYERS})`
      : `CO-OP ONLINE (MÁX ${MAX_COOP_PLAYERS})`;
  }
  if (btnCoopHostToggle) {
    btnCoopHostToggle.style.display = inCampaign && !isGuest ? 'flex' : 'none';
    btnCoopHostToggle.classList.toggle('danger', isHost);
    btnCoopHostToggle.classList.toggle('coop-open', !isHost);
    if (lblCoopHost) lblCoopHost.textContent = isHost ? 'Encerrar Co-op' : 'Abrir Co-op (Gerar Código)';
    if (valCoopHost) valCoopHost.textContent = isHost ? 'FECHAR' : 'HOST';
  }
  if (btnCoopGuestLeave) {
    btnCoopGuestLeave.style.display = inCampaign && isGuest ? 'flex' : 'none';
  }
  coopMenuBox?.classList.toggle('visible', inCampaign && coopState.active);
  if (coopRoomCodeVal) {
    coopRoomCodeVal.textContent = coopState.roomCode ?? '------';
  }
  if (coopMembersList && coopState.active) {
    coopMembersList.innerHTML = '';
    for (const member of coopState.members) {
      const row = document.createElement('div');
      row.className = 'coop-member-row';

      const img = document.createElement('img');
      img.className = 'coop-member-avatar';
      img.referrerPolicy = 'no-referrer';
      img.alt = member.displayName;
      if (member.photoURL) {
        img.src = member.photoURL;
      } else {
        img.style.display = 'none';
      }
      row.appendChild(img);

      const info = document.createElement('div');
      info.className = 'coop-member-info';
      const nameEl = document.createElement('span');
      nameEl.className = 'coop-member-name';
      nameEl.textContent = member.appearance?.name?.trim() || member.displayName;
      const roleEl = document.createElement('span');
      roleEl.className = 'coop-member-role';
      roleEl.textContent = `${member.role === 'host' ? 'HOST' : 'CO-OP'}${member.micOn ? ' · 🎙 ON' : ''}`;
      info.appendChild(nameEl);
      info.appendChild(roleEl);
      row.appendChild(info);

      const acts = document.createElement('div');
      acts.className = 'coop-member-actions';

      // Report button for any other player in the room
      if (member.uid !== myUid) {
        const repBtn = document.createElement('button');
        repBtn.type = 'button';
        repBtn.className = 'coop-icon-act report';
        repBtn.textContent = '⚠';
        repBtn.title = `Denunciar ${member.displayName}`;
        repBtn.addEventListener('click', () => {
          openReportModal(member);
        });
        acts.appendChild(repBtn);
      }

      // Host-only X kick button next to guest photo & name
      if (isHost && member.uid !== myUid && member.role !== 'host') {
        const kickBtn = document.createElement('button');
        kickBtn.type = 'button';
        kickBtn.className = 'coop-icon-act kick';
        kickBtn.textContent = '✕';
        kickBtn.title = `Eliminar ${member.displayName} da campanha`;
        kickBtn.addEventListener('click', async () => {
          const kicked = await hostKickCoopPlayer(member.uid, world);
          if (kicked) {
            sound.playHit();
            showBanner(world, 'JOGADOR REMOVIDO', `${member.displayName} foi removido da campanha.`, '#ff8a65');
          }
        });
        acts.appendChild(kickBtn);
      }

      row.appendChild(acts);
      coopMembersList.appendChild(row);
    }
  }
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
  const musicVol = sound.getMusicVolume();
  const sfxVol = sound.getSfxVolume();
  const isGuest = coopState.active && coopState.role === 'guest';

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

  // Separate Music Toggle + 0..5 Pixel Volume Bars
  if (lblMusic) lblMusic.textContent = t('menu_music');
  if (btnMusic) {
    btnMusic.textContent = musicOn ? t('menu_on') : t('menu_off');
    btnMusic.classList.toggle('on', musicOn);
  }
  if (valMusicVol) valMusicVol.textContent = `${musicOn ? musicVol : 0}/5`;
  renderPixelVolumeBars(musicVolBars, musicVol, musicOn, (lvl) => {
    sound.setMusicVolume(lvl);
    updateMenuUI();
  });

  // Separate SFX Toggle + 0..5 Pixel Volume Bars
  if (lblSfx) lblSfx.textContent = t('menu_sfx');
  if (btnSfx) {
    btnSfx.textContent = sfxOn ? t('menu_on') : t('menu_off');
    btnSfx.classList.toggle('on', sfxOn);
  }
  if (valSfxVol) valSfxVol.textContent = `${sfxOn ? sfxVol : 0}/5`;
  renderPixelVolumeBars(sfxVolBars, sfxVol, sfxOn, (lvl) => {
    sound.setSfxVolume(lvl);
    updateMenuUI();
  });

  // Players Voice Output Toggle + 0..5 Pixel Volume Bars
  const voiceOutOn = isVoiceOutEnabled();
  const voiceOutVol = getVoiceOutVolume();
  if (lblVoiceOut) lblVoiceOut.textContent = t('menu_voice_out');
  if (btnVoiceOut) {
    btnVoiceOut.textContent = voiceOutOn ? t('menu_on') : t('menu_off');
    btnVoiceOut.classList.toggle('on', voiceOutOn);
  }
  if (valVoiceOut) valVoiceOut.textContent = `${voiceOutOn ? voiceOutVol : 0}/5`;
  renderPixelVolumeBars(voiceOutBars, voiceOutVol, voiceOutOn, (lvl) => {
    setVoiceOutVolume(lvl);
    sound.playCoinDrop();
    updateMenuUI();
  });

  // Local Microphone Input Toggle + 0..5 Pixel Volume Bars
  const micInOn = isMicInputEnabled();
  const micInVol = getMicInputVolume();
  if (lblMicVol) lblMicVol.textContent = t('menu_mic_vol');
  if (btnMicVol) {
    btnMicVol.textContent = micInOn ? t('menu_on') : t('menu_off');
    btnMicVol.classList.toggle('on', micInOn);
  }
  if (valMicVol) valMicVol.textContent = `${micInOn ? micInVol : 0}/5`;
  renderPixelVolumeBars(micVolBars, micInVol, micInOn, (lvl) => {
    setMicInputVolume(lvl);
    sound.playCoinDrop();
    updateMenuUI();
  });

  // Zoom level indicator
  if (valZoom) valZoom.textContent = `${Math.round(targetZoom * 100)}%`;

  if (lblFullscreen) lblFullscreen.textContent = fs ? t('menu_exit_fullscreen') : t('menu_fullscreen');
  if (valFullscreen) {
    valFullscreen.textContent = fs ? t('menu_on') : t('menu_off');
    valFullscreen.classList.toggle('on', fs);
  }
  if (lblExport) lblExport.textContent = t('menu_export');
  if (lblImport) lblImport.textContent = t('menu_import');
  if (lblWhatsapp) lblWhatsapp.textContent = t('menu_whatsapp');
  if (valWhatsapp) {
    valWhatsapp.textContent = isWhatsappRewardClaimed() ? '✓ GRUPO' : '+3 💎';
  }
  if (btnReferral) {
    btnReferral.style.display = authCloudState.user ? 'flex' : 'none';
  }
  if (lblReferral) lblReferral.textContent = t('menu_invite');
  if (valReferral) {
    const inCurRow = referralState.referrals.length % FRIENDS_PER_TIER;
    const nextReward = getTierDiamondReward(Math.floor(referralState.referrals.length / FRIENDS_PER_TIER));
    valReferral.textContent = `${inCurRow}/${FRIENDS_PER_TIER} · +${nextReward}💎`;
  }
  if (lblEscHint) lblEscHint.textContent = t('menu_esc_hint');

  const inCampaign = world.mode === 'playing' || world.mode === 'paused' || world.mode === 'world_map';
  if (btnResume) btnResume.style.display = inCampaign ? 'flex' : 'none';
  if (btnSave) btnSave.style.display = inCampaign && !isGuest ? 'flex' : 'none';
  if (btnMap) btnMap.style.display = inCampaign && !isGuest ? 'flex' : 'none';
  if (btnDayLen) btnDayLen.style.display = isGuest ? 'none' : 'flex';
  updateCoopUI();
  updateGoogleAuthUI();
}

function setMenuOpen(open: boolean): void {
  menuOpen = open;
  menuPanel?.classList.toggle('open', open);
  menuBackdrop?.classList.toggle('open', open);
  btnMenu?.classList.toggle('open', open);

  if (open) {
    clearMovementInputs();
    // Do NOT pause live world when Co-op is active so teammates keep playing smoothly!
    if (world.mode === 'playing' && !coopState.active) {
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
  pendingCoopJoinCode = null;
  renderer.pendingDeleteSlot = null;
  world.mode = 'slot_select';
  sound.playCoinDrop();
  updateMenuUI();
}

function startNewCampaignFlow(targetSlot?: number): void {
  sound.unlock();
  clearMovementInputs();
  pendingCoopJoinCode = null;
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

function startCoopCharCustomization(code: string): void {
  sound.unlock();
  clearMovementInputs();
  pendingCoopJoinCode = code;
  renderer.charSelectFocusRow = 0;
  renderer.pendingDeleteSlot = null;
  const app = defaultAppearance();
  app.name = (authCloudState.user?.displayName ?? '').split(' ')[0].slice(0, 16);
  world = createInitialWorld('char_select', app, defaultCrest(), 0);
  world.selectTimer = 90;
  fitCanvas();
  sound.playCoinPickup();
  updateMenuUI();
  canvas.focus();
}

async function finishCoopJoinFromCharSelect(): Promise<void> {
  const code = pendingCoopJoinCode;
  if (!code) {
    confirmCharacterSelection(world);
    return;
  }
  charNameInput?.blur();
  const customAppearance = { ...world.appearance };
  pendingCoopJoinCode = null;
  const res = await joinCoopRoomAsGuest(code, customAppearance);
  if (!res.ok) {
    sound.playHit();
    goToLogin();
    openJoinCoopModal();
    if (coopJoinStatus) coopJoinStatus.textContent = res.error ?? 'Não foi possível entrar na sala.';
    return;
  }
  if (res.initialWorld) {
    world = res.initialWorld;
  } else {
    world.mode = 'playing';
  }
  world.localPlayerUid = authCloudState.user?.uid;
  fitCanvas();
  sound.playHorn(false);
  showBanner(
    world,
    `CO-OP CONECTADO · ${code}`,
    `Você entrou na campanha de ${coopState.hostName}!`,
    '#6fe87b'
  );
  updateMenuUI();
  canvas.focus();
}

function loadSavedCampaignFlow(slotIndex?: number): void {
  sound.unlock();
  clearMovementInputs();
  pendingCoopJoinCode = null;
  const loaded = loadCampaign(slotIndex);
  if (!loaded) return;
  renderer.pendingDeleteSlot = null;
  world = loaded;
  world.localPlayerUid = authCloudState.user?.uid;
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

function goToLogin(noticeBanner?: string): void {
  if (coopState.active) {
    if (coopState.role === 'host') {
      void hostCloseCoopRoom(world);
    } else if (coopState.role === 'guest') {
      void leaveCoopAsGuest();
    }
  }
  pendingCoopJoinCode = null;
  closeJoinCoopModal();
  closeReportModal();
  setCoopChatOpen(false);
  if (
    coopState.role !== 'guest' &&
    world.crest.locked &&
    (world.mode === 'playing' || world.mode === 'paused' || world.mode === 'world_map')
  ) {
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
  if (noticeBanner) {
    showBanner(world, 'CO-OP ENCERRADO', noticeBanner, '#ff8a65');
  }
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
  if (row === 0) {
    world.appearance.gender = world.appearance.gender === 'king' ? 'queen' : 'king';
  } else if (row === 1) {
    world.appearance.outfitIndex = cycle(world.appearance.outfitIndex, OUTFIT_PRESETS.length, delta);
  } else if (row === 2) {
    world.appearance.hairIndex = cycle(world.appearance.hairIndex, HAIR_PRESETS.length, delta);
  } else if (row === 3) {
    world.appearance.horseIndex = cycle(world.appearance.horseIndex, HORSE_PRESETS.length, delta);
  } else if (row === 4) {
    world.appearance.crownIndex = cycle(world.appearance.crownIndex, CROWN_PRESETS.length, delta);
  }
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
  const refGranted = deliverPendingReferralDiamonds(world);
  if (refGranted > 0) {
    sound.playBuildComplete();
    sound.playCoinPickup();
    showBanner(world, `${t('ref_reward_title')} +${refGranted} 💎`, t('ref_reward_sub'), '#5ce1e6');
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

  if (hitId === 'login_whatsapp') {
    openWhatsappCommunity();
    return true;
  }

  if (hitId === 'login_invite') {
    openReferralModal();
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
  if (hitId === 'login_coop') {
    sound.playCoinPickup();
    openJoinCoopModal();
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
      if (coopState.active && coopState.role === 'guest') {
        input.dropJustPressed = true;
      } else {
        triggerCoinDrop(world);
      }
      return true;
    }
    if (hitId === 'prompt_bank_withdraw') {
      withdrawFromBanker(world);
      return true;
    }
    if (hitId === 'hud_mount_power') {
      if (coopState.active && coopState.role === 'guest') {
        input.powerJustPressed = true;
      } else {
        triggerMountPower(world);
      }
      return true;
    }
    if (hitId === 'villager_dir_left' && world.selectedVillagerId) {
      orderSpecificVillager(world, world.selectedVillagerId, -1);
      return true;
    }
    if (hitId === 'villager_dir_right' && world.selectedVillagerId) {
      orderSpecificVillager(world, world.selectedVillagerId, 1);
      return true;
    }
    if (hitId === 'villager_dir_close') {
      world.selectedVillagerId = null;
      sound.playCoinDrop();
      return true;
    }
    if (hitId.startsWith('villager_pick_')) {
      const vid = Number(hitId.replace('villager_pick_', ''));
      if (Number.isFinite(vid)) {
        world.selectedVillagerId = world.selectedVillagerId === vid ? null : vid;
        ptrMoveSide = 0;
        ptrSprint = false;
        sound.playCoinDrop();
      }
      return true;
    }
    if (hitId.startsWith('task_prio_')) {
      const rest = hitId.slice('task_prio_'.length);
      const sep = rest.lastIndexOf('_');
      if (sep > 0) {
        const kind = rest.slice(0, sep) as BuilderTaskKind;
        const id = Number(rest.slice(sep + 1));
        if (Number.isFinite(id) && togglePriorityTask(world, kind, id)) {
          ptrMoveSide = 0;
          ptrSprint = false;
          return true;
        }
      }
    }
    if (hitId === 'tutorial_skip') {
      skipTutorial(world);
      sound.playCoinDrop();
      return true;
    }
  }

  if (world.mode === 'char_select') {
    const keyToRow: Record<string, number> = { gender: 0, outfit: 1, hair: 2, horse: 3, crown: 4 };
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
      world.appearance.gender = Math.random() < 0.5 ? 'king' : 'queen';
      world.appearance.outfitIndex = Math.floor(Math.random() * OUTFIT_PRESETS.length);
      world.appearance.hairIndex = Math.floor(Math.random() * HAIR_PRESETS.length);
      world.appearance.horseIndex = Math.floor(Math.random() * HORSE_PRESETS.length);
      world.appearance.crownIndex = Math.floor(Math.random() * CROWN_PRESETS.length);
      sound.playCoinDrop();
      return true;
    }
    if (hitId === 'char_confirm') {
      charNameInput?.blur();
      void finishCoopJoinFromCharSelect();
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
    lx: ((e.clientX - rect.left) / rect.width) * world.viewWidth,
    ly: ((e.clientY - rect.top) / rect.height) * world.viewHeight,
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

  if (world.selectedVillagerId) {
    world.selectedVillagerId = null;
  }

  const side: -1 | 1 = lx < world.viewWidth / 2 ? -1 : 1;

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
  const side: -1 | 1 = lx < world.viewWidth / 2 ? -1 : 1;
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

btnMusicVolDown?.addEventListener('click', () => {
  sound.setMusicVolume(sound.getMusicVolume() - 1);
  updateMenuUI();
});

btnMusicVolUp?.addEventListener('click', () => {
  sound.setMusicVolume(sound.getMusicVolume() + 1);
  updateMenuUI();
});

btnSfx?.addEventListener('click', () => {
  sound.toggleSfx();
  updateMenuUI();
});

btnSfxVolDown?.addEventListener('click', () => {
  sound.setSfxVolume(sound.getSfxVolume() - 1);
  updateMenuUI();
});

btnSfxVolUp?.addEventListener('click', () => {
  sound.setSfxVolume(sound.getSfxVolume() + 1);
  updateMenuUI();
});

btnVoiceOut?.addEventListener('click', () => {
  toggleVoiceOut();
  sound.playCoinDrop();
  updateMenuUI();
});

btnVoiceOutDown?.addEventListener('click', () => {
  setVoiceOutVolume(getVoiceOutVolume() - 1);
  sound.playCoinDrop();
  updateMenuUI();
});

btnVoiceOutUp?.addEventListener('click', () => {
  setVoiceOutVolume(getVoiceOutVolume() + 1);
  sound.playCoinDrop();
  updateMenuUI();
});

btnMicVol?.addEventListener('click', () => {
  toggleMicInput();
  sound.playCoinDrop();
  updateMenuUI();
});

btnMicVolDown?.addEventListener('click', () => {
  setMicInputVolume(getMicInputVolume() - 1);
  sound.playCoinDrop();
  updateMenuUI();
});

btnMicVolUp?.addEventListener('click', () => {
  setMicInputVolume(getMicInputVolume() + 1);
  sound.playCoinDrop();
  updateMenuUI();
});

btnZoomOut?.addEventListener('click', () => {
  adjustCameraZoom(-1);
});

btnZoomIn?.addEventListener('click', () => {
  adjustCameraZoom(1);
});

// Co-op Online Menu Controls (Host open/close, Guest leave, Copy Code)
const coopMenuStatus = document.getElementById('coop-menu-status') as HTMLDivElement | null;
function setCoopMenuStatus(msg: string | null, isError = true): void {
  if (!coopMenuStatus) return;
  if (!msg) {
    coopMenuStatus.style.display = 'none';
    coopMenuStatus.textContent = '';
  } else {
    coopMenuStatus.style.display = 'block';
    coopMenuStatus.textContent = msg;
    coopMenuStatus.style.borderColor = isError ? '#e06774' : '#efc462';
    coopMenuStatus.style.background = isError ? '#36131b' : '#26200c';
    coopMenuStatus.style.color = isError ? '#ffd5da' : '#ffe58a';
    coopMenuStatus.scrollIntoView({ block: 'nearest' });
  }
}

btnWhatsapp?.addEventListener('click', () => {
  openWhatsappCommunity();
});

btnReferral?.addEventListener('click', () => {
  openReferralModal();
});

btnRefClose?.addEventListener('click', () => {
  closeReferralModal();
});

referralModal?.addEventListener('click', (e) => {
  if (e.target === referralModal) closeReferralModal();
});

referralCodeInput?.addEventListener('input', () => {
  const clean = setPendingFriendCodeInput(referralCodeInput.value);
  if (referralCodeInput.value !== clean) {
    referralCodeInput.value = clean;
  }
  updatePreLoginReferralUI();
});

btnRefCopyInvite?.addEventListener('click', async () => {
  const code = referralState.inviteCode;
  if (!code) return;
  const fullMsg = buildInviteShareMessage(code);
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(fullMsg);
      copied = true;
    }
  } catch {
    // Fallback below
  }
  if (!copied) {
    try {
      const ta = document.createElement('textarea');
      ta.value = fullMsg;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand('copy');
      ta.remove();
    } catch {
      copied = false;
    }
  }
  if (copied) {
    sound.playCoinPickup();
    if (btnRefCopyInvite) {
      btnRefCopyInvite.textContent = 'COPIADO!';
      setTimeout(() => {
        if (btnRefCopyInvite) btnRefCopyInvite.textContent = 'COPIAR';
      }, 1800);
    }
    if (refCopyFeedback) {
      refCopyFeedback.textContent = '✓ Mensagem completa + link com código copiados! Cole no WhatsApp, Discord, SMS ou onde quiser.';
    }
  } else {
    sound.playHit();
    if (refCopyFeedback) {
      refCopyFeedback.textContent = `Copie manualmente seu código: ${code}`;
    }
  }
});

btnCoopHostToggle?.addEventListener('click', async () => {
  sound.unlock();
  resumeRemoteCoopAudio();
  setCoopMenuStatus(null);
  if (coopState.active && coopState.role === 'host') {
    if (btnCoopHostToggle) btnCoopHostToggle.disabled = true;
    try {
      await hostCloseCoopRoom(world);
      sound.playCoinDrop();
      saveCampaign(world);
      showBanner(world, 'CO-OP ENCERRADO', 'Sua campanha voltou ao modo solo. Todo o progresso foi mantido!', '#ffe58a');
      updateMenuUI();
    } finally {
      if (btnCoopHostToggle) btnCoopHostToggle.disabled = false;
    }
    return;
  }
  if (btnCoopHostToggle) btnCoopHostToggle.disabled = true;
  setCoopMenuStatus('Gerando código Co-op...', false);
  try {
    const res = await hostOpenCoopRoom(world, (stepMsg) => setCoopMenuStatus(stepMsg, false));
    if (!res.ok || !res.code) {
      sound.playHit();
      const errMsg = res.error ?? 'Conecte sua conta Google para abrir o Co-op.';
      setCoopMenuStatus(errMsg, true);
      showBanner(world, 'CO-OP INDISPONÍVEL', errMsg, '#ff8a65');
      updateMenuUI();
      return;
    }
    setCoopMenuStatus(null);
    // Immediately resume live world so Host broadcasts live state to guests while viewing the code!
    if (world.mode === 'paused' && pausedByMenu) {
      world.mode = 'playing';
      pausedByMenu = false;
    }
    sound.playHorn(false);
    showBanner(world, `CO-OP ABERTO · CÓDIGO ${res.code}`, 'Compartilhe o código (máx 4 jogadores)!', '#6fe87b');
    updateMenuUI();
    coopMenuBox?.scrollIntoView({ block: 'nearest' });
  } catch (err) {
    sound.playHit();
    const msg = `Erro inesperado ao abrir Co-op: ${err instanceof Error ? err.message : String(err)}`;
    setCoopMenuStatus(msg, true);
    showBanner(world, 'CO-OP INDISPONÍVEL', msg, '#ff8a65');
    updateMenuUI();
  } finally {
    if (btnCoopHostToggle) btnCoopHostToggle.disabled = false;
  }
});

btnCoopGuestLeave?.addEventListener('click', () => {
  sound.playCoinDrop();
  goToLogin('Você saiu da campanha Co-op.');
});

btnCoopCopyCode?.addEventListener('click', async () => {
  if (!coopState.roomCode) return;
  try {
    await navigator.clipboard?.writeText(coopState.roomCode);
    if (btnCoopCopyCode) {
      btnCoopCopyCode.textContent = 'COPIADO!';
      setTimeout(() => {
        if (btnCoopCopyCode) btnCoopCopyCode.textContent = 'COPIAR';
      }, 1500);
    }
    sound.playCoinPickup();
  } catch {
    sound.playCoinDrop();
  }
});

// Prevent clicks/taps on the Chat/Mic rail and Chat panel from moving the Monarch on the canvas
coopQuickRail?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  resumeRemoteCoopAudio();
});
coopChatPanel?.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  resumeRemoteCoopAudio();
});

// Gameplay Co-op Quick Rail (Chat Bubble + Microphone directly below Menu button)
btnCoopChat?.addEventListener('click', (e) => {
  e.stopPropagation();
  sound.unlock();
  resumeRemoteCoopAudio();
  setCoopChatOpen(!coopState.chatOpen);
  if (coopState.chatOpen) {
    sound.playCoinDrop();
    setTimeout(() => coopChatInput?.focus(), 40);
  } else {
    canvas.focus();
  }
});

coopChatOpenRoom?.addEventListener('click', async (e) => {
  e.stopPropagation();
  sound.unlock();
  resumeRemoteCoopAudio();
  if (coopState.active) return;
  if (coopChatOpenRoom) {
    coopChatOpenRoom.disabled = true;
    coopChatOpenRoom.textContent = '...';
  }
  const showChatSysMsg = (text: string, isErr = false) => {
    if (!coopChatMessages) return;
    coopChatMessages.innerHTML = `<div class="chat-msg-sys" style="color:${isErr ? '#ff9ea8' : '#ffe58a'};">${escapeHtml(text)}</div>`;
  };
  showChatSysMsg('Gerando código Co-op...');
  try {
    const res = await hostOpenCoopRoom(world, (step) => showChatSysMsg(step));
    if (res.ok && res.code) {
      sound.playHorn(false);
      showBanner(
        world,
        `CO-OP ABERTO · CÓDIGO ${res.code}`,
        'Compartilhe este código para até 4 jogadores conversarem e jogarem juntos!',
        '#6fe87b'
      );
      updateCoopUI();
    } else {
      sound.playHit();
      const errMsg = res.error ?? 'Conecte sua conta Google para abrir Co-op.';
      showChatSysMsg(`Erro: ${errMsg}`, true);
      showBanner(world, 'CO-OP ONLINE', errMsg, '#ff8a65');
    }
  } catch (err) {
    sound.playHit();
    const msg = err instanceof Error ? err.message : String(err);
    showChatSysMsg(`Erro: ${msg}`, true);
    showBanner(world, 'CO-OP ONLINE', msg, '#ff8a65');
  } finally {
    if (coopChatOpenRoom) {
      coopChatOpenRoom.disabled = false;
      coopChatOpenRoom.textContent = '+ CO-OP';
    }
  }
});

coopChatClose?.addEventListener('click', (e) => {
  e.stopPropagation();
  setCoopChatOpen(false);
  canvas.focus();
});

coopChatForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!coopChatInput) return;
  const txt = coopChatInput.value.trim();
  if (!txt) return;
  coopChatInput.value = '';
  const res = await sendCoopChatMessage(txt);
  if (res.ok) {
    sound.playCoinDrop();
    if (coopChatMessages) coopChatMessages.scrollTop = coopChatMessages.scrollHeight;
  } else if (res.error) {
    sound.playHit();
    showBanner(world, 'CHAT CO-OP', res.error, '#ff8a65');
  }
  coopChatInput.focus();
});

btnCoopMic?.addEventListener('click', async (e) => {
  e.stopPropagation();
  sound.unlock();
  resumeRemoteCoopAudio();
  const res = await toggleCoopMicrophone();
  if (res.ok) {
    sound.playCoinPickup();
    showBanner(
      world,
      res.micOn ? 'MICROFONE LIGADO' : 'MICROFONE MUTADO',
      res.micOn
        ? res.inRoom
          ? 'Sua voz está sendo transmitida em tempo real para a sala Co-op!'
          : 'Microfone aberto! Abra o Co-op (+ CO-OP ou Menu ☰) para conversar com até 4 jogadores.'
        : 'Microfone desligado.',
      res.micOn ? '#6fe87b' : '#9bb7d0'
    );
  } else {
    sound.playHit();
    showBanner(world, 'MICROFONE', res.error ?? 'Não foi possível abrir o microfone.', '#ff8a65');
  }
});

// Co-op Join by Code Modal listeners
btnCoopJoinCancel?.addEventListener('click', () => {
  closeJoinCoopModal();
  canvas.focus();
});

coopJoinModal?.addEventListener('click', (e) => {
  if (e.target === coopJoinModal) closeJoinCoopModal();
});

async function submitCoopJoinCode(): Promise<void> {
  if (!coopJoinCodeInput || !btnCoopJoinGo) return;
  const raw = coopJoinCodeInput.value.trim();
  btnCoopJoinGo.disabled = true;
  if (coopJoinStatus) coopJoinStatus.textContent = 'Verificando sala...';
  const res = await validateCoopJoinCode(raw);
  btnCoopJoinGo.disabled = false;
  if (!res.ok || !res.code) {
    sound.playHit();
    if (coopJoinStatus) coopJoinStatus.textContent = res.error ?? 'Código inválido.';
    return;
  }
  closeJoinCoopModal();
  startCoopCharCustomization(res.code);
}

btnCoopJoinGo?.addEventListener('click', () => {
  void submitCoopJoinCode();
});

coopJoinCodeInput?.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') {
    e.preventDefault();
    void submitCoopJoinCode();
  } else if (e.code === 'Escape') {
    e.preventDefault();
    closeJoinCoopModal();
  }
});

// Community Report & Ban Modal listeners
coopReportReasons?.querySelectorAll<HTMLButtonElement>('.pixel-reason-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const r = btn.dataset.reason as CommunityReportReason | undefined;
    if (!r) return;
    selectedReportReason = r;
    coopReportReasons.querySelectorAll<HTMLButtonElement>('.pixel-reason-btn').forEach((other) => {
      other.classList.toggle('selected', other === btn);
    });
    sound.playCoinDrop();
  });
});

btnCoopReportCancel?.addEventListener('click', () => {
  closeReportModal();
});

coopReportModal?.addEventListener('click', (e) => {
  if (e.target === coopReportModal) closeReportModal();
});

btnCoopReportConfirm?.addEventListener('click', async () => {
  if (!reportTargetMember || !btnCoopReportConfirm) return;
  btnCoopReportConfirm.disabled = true;
  if (coopReportStatus) coopReportStatus.textContent = 'Registrando denúncia e banindo jogador...';
  const res = await reportAndBanCoopPlayer(
    reportTargetMember,
    selectedReportReason,
    coopReportDetails?.value ?? '',
    world
  );
  btnCoopReportConfirm.disabled = false;
  if (!res.ok) {
    sound.playHit();
    if (coopReportStatus) coopReportStatus.textContent = res.error ?? 'Falha ao enviar denúncia.';
    return;
  }
  const reportedName = reportTargetMember.displayName;
  closeReportModal();
  sound.playHit();
  showBanner(
    world,
    'DENÚNCIA REGISTRADA & BAN APLICADO',
    `${reportedName} foi banido da comunidade até análise de guillermes.mozzer@gmail.com.`,
    '#ff8a65'
  );
  updateMenuUI();
});

// Admin Dashboard Tab Switchers
adminTabPlayers?.addEventListener('click', () => {
  setAdminTab('players');
  sound.playCoinDrop();
});
adminTabBans?.addEventListener('click', () => {
  setAdminTab('bans');
  sound.playCoinDrop();
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
  if (referralCodeInput) {
    setPendingFriendCodeInput(referralCodeInput.value);
  }
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
  if (
    coopState.role !== 'guest' &&
    world.crest.locked &&
    (world.mode === 'playing' || world.mode === 'paused' || world.mode === 'world_map')
  ) {
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

// Character Name Input listeners (works seamlessly on mobile & desktop keyboards)
charNameInput?.addEventListener('input', () => {
  world.appearance.name = charNameInput.value.slice(0, 16);
});
charNameInput?.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' || e.code === 'Escape') {
    e.preventDefault();
    charNameInput.blur();
    canvas.focus();
  }
});

function syncCharNameInput(): void {
  if (!charNameInput) return;
  const rectBox = renderer.charNameBoxRect;
  const visible = world.mode === 'char_select' && rectBox !== null && !menuOpen && !adminOpen;
  charNameInput.classList.toggle('visible', visible);
  if (!visible || !rectBox) {
    if (document.activeElement === charNameInput) charNameInput.blur();
    return;
  }
  const cRect = canvas.getBoundingClientRect();
  const scaleX = cRect.width / Math.max(1, world.viewWidth);
  const scaleY = cRect.height / Math.max(1, world.viewHeight);
  charNameInput.style.left = `${Math.round(cRect.left + rectBox.x * scaleX)}px`;
  charNameInput.style.top = `${Math.round(cRect.top + rectBox.y * scaleY)}px`;
  charNameInput.style.width = `${Math.round(rectBox.w * scaleX)}px`;
  charNameInput.style.height = `${Math.round(rectBox.h * scaleY)}px`;
  charNameInput.style.fontSize = `${Math.max(11, Math.min(20, Math.round(rectBox.h * scaleY * 0.72)))}px`;
  charNameInput.placeholder = t('monarch_name_ph');
  if (document.activeElement !== charNameInput && charNameInput.value !== world.appearance.name) {
    charNameInput.value = world.appearance.name;
  }
}

// Unlock remote teammate voice playback automatically on any tap/click/key press
window.addEventListener('pointerdown', () => resumeRemoteCoopAudio(), { passive: true });
window.addEventListener('touchstart', () => resumeRemoteCoopAudio(), { passive: true });

// =========================================================================
// KEYBOARD CONTROLS (with Double-Tap Arrow/A/D Sprint & ESC handling)
// =========================================================================
window.addEventListener('keydown', (e) => {
  resumeRemoteCoopAudio();
  const activeTag = (document.activeElement?.tagName ?? '').toUpperCase();
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
    return;
  }
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
    if (reportModalOpen) {
      closeReportModal();
      return;
    }
    if (joinModalOpen) {
      closeJoinCoopModal();
      return;
    }
    if (adminOpen) {
      closeAdminDashboard();
      return;
    }
    if (referralModalOpen) {
      closeReferralModal();
      return;
    }
    if (coopState.chatOpen) {
      setCoopChatOpen(false);
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
    if (world.selectedVillagerId) {
      world.selectedVillagerId = null;
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

  if (menuOpen || feedbackUi.open || adminOpen || joinModalOpen || reportModalOpen || referralModalOpen) return;

  if (world.mode === 'login') {
    if (!isPlayerAuthorizedToPlay()) return;
    if (code === 'Space' || code === 'Enter') startNewCampaignFlow();
    return;
  }

  if (world.mode === 'char_select') {
    if (code === 'ArrowUp' || code === 'KeyW') renderer.charSelectFocusRow = cycle(renderer.charSelectFocusRow, 5, -1);
    else if (code === 'ArrowDown' || code === 'KeyS') renderer.charSelectFocusRow = cycle(renderer.charSelectFocusRow, 5, 1);
    else if (code === 'ArrowLeft' || code === 'KeyA') adjustCharOption(renderer.charSelectFocusRow, -1);
    else if (code === 'ArrowRight' || code === 'KeyD') adjustCharOption(renderer.charSelectFocusRow, 1);
    else if (code === 'Space' || code === 'Enter') void finishCoopJoinFromCharSelect();
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

initPendingFriendCodeFromUrl();
updatePreLoginReferralUI();

let lastShownRedeemNotice: string | null = null;
subscribeReferrals(() => {
  updatePreLoginReferralUI();
  if (referralModalOpen) renderReferralModal();
  if (referralState.redeemNotice && referralState.redeemNotice !== lastShownRedeemNotice) {
    lastShownRedeemNotice = referralState.redeemNotice;
    showBanner(world, 'CÓDIGO DE AMIGO', referralState.redeemNotice, '#6fe87b');
  }
  updateMenuUI();
});

subscribeAuthCloud((state) => {
  void syncReferralProfileForUser(state.user);
  updateMenuUI();
});
subscribeCoop(() => {
  updateMenuUI();
});
setGuestForceExitHandler((reason) => {
  sound.playHit();
  goToLogin(reason);
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

  // Smooth animated Camera Zoom In / Zoom Out
  if (Math.abs(currentZoom - targetZoom) > 0.002) {
    currentZoom += (targetZoom - currentZoom) * Math.min(1, delta * 9.5);
    if (Math.abs(currentZoom - targetZoom) <= 0.002) currentZoom = targetZoom;
    fitCanvas();
  }

  input.left = kbLeft || ptrMoveSide === -1;
  input.right = kbRight || ptrMoveSide === 1;
  input.sprint =
    kbShift ||
    (kbDoubleSprintDir === -1 && kbLeft) ||
    (kbDoubleSprintDir === 1 && kbRight) ||
    (ptrSprint && ptrMoveSide !== 0);

  const typingCharName = Boolean(charNameInput && document.activeElement === charNameInput);

  while (accumulator >= FIXED_DT) {
    if ((feedbackUi.open || adminOpen) && world.mode === 'playing' && !coopState.active) {
      world.elapsed += FIXED_DT;
    } else if ((typingCharName || pendingCoopJoinCode) && world.mode === 'char_select') {
      // Keep character preview animated without auto-skipping while customizing name or Co-op hero
      world.elapsed += FIXED_DT;
      if (world.monarchs[0]) world.monarchs[0].animTime += FIXED_DT * 8;
    } else if (coopState.active && coopState.role === 'guest' && world.mode === 'playing') {
      // Guest client: sync authoritative Host world & send local inputs
      world = guestSyncCoopFrame(world, input);
      const localM = world.monarchs.find((m) => m.playerUid === authCloudState.user?.uid);
      if (localM) {
        world.activePrompt = computeActivePrompt(world, localM);
      }
      tickCloudTelemetry(FIXED_DT, world);
    } else {
      const remoteInputs =
        coopState.active && coopState.role === 'host' && world.mode === 'playing'
          ? hostSyncCoopWorld(world)
          : undefined;
      stepWorld(world, input, FIXED_DT, remoteInputs);
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
  syncCharNameInput();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
