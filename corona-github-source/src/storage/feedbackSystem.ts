import { type WorldState } from '../types';

/**
 * URL pública do Google Forms de avaliação (ex: https://docs.google.com/forms/d/e/.../viewform).
 * Pode ser definida diretamente aqui ou via variável de ambiente VITE_FEEDBACK_FORM_URL no Netlify.
 */
const DEFAULT_FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSfCyDIU1jqgQzOv1wJpBdHrTMVKNEmpWkraKPSTSud0w50SSQ/viewform';

export const FEEDBACK_FORM_URL: string =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_FEEDBACK_FORM_URL ?? '').trim() ||
  DEFAULT_FEEDBACK_FORM_URL;

/** Intervalo de jogo ativo (em segundos) para exibir o pop-up de avaliação: 30 minutos. */
export const FEEDBACK_INTERVAL_SECONDS = 30 * 60;

/** Quantidade de diamantes entregues ao jogador após responder o formulário. */
export const FEEDBACK_DIAMOND_REWARD = 3;

/** Tempo mínimo (em segundos) fora da aba após abrir o Forms para creditar automaticamente ao retornar. */
export const MIN_FORM_RETURN_SECONDS = 5;

const ANSWERED_KEY = 'corona_feedback_answered_v1';
const PLAY_SECS_KEY = 'corona_feedback_play_secs_v1';
const PENDING_DIAMONDS_KEY = 'corona_feedback_pending_diamonds_v1';

export interface FeedbackUiState {
  open: boolean;
  awaitingConfirm: boolean;
  formOpenedAt: number | null;
  source: 'login' | 'ingame';
  noUrlNotice: boolean;
  loginGrantedNotice: boolean;
}

export const feedbackUi: FeedbackUiState = {
  open: false,
  awaitingConfirm: false,
  formOpenedAt: null,
  source: 'ingame',
  noUrlNotice: false,
  loginGrantedNotice: false,
};

let playSecondsCache: number | null = null;
let persistAccumulator = 0;

export function getFeedbackFormUrl(): string {
  return FEEDBACK_FORM_URL.trim();
}

export function isFeedbackFormConfigured(): boolean {
  const url = getFeedbackFormUrl();
  return url.startsWith('http://') || url.startsWith('https://');
}

export function isFeedbackAnswered(): boolean {
  try {
    return window.localStorage.getItem(ANSWERED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markFeedbackAnswered(): void {
  try {
    window.localStorage.setItem(ANSWERED_KEY, '1');
    window.localStorage.removeItem(PLAY_SECS_KEY);
  } catch {
    // Ignore storage errors
  }
  playSecondsCache = 0;
}

export function getFeedbackPlaySeconds(): number {
  if (playSecondsCache !== null) return playSecondsCache;
  try {
    const raw = Number(window.localStorage.getItem(PLAY_SECS_KEY) ?? '0');
    playSecondsCache = Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    playSecondsCache = 0;
  }
  return playSecondsCache;
}

export function setFeedbackPlaySeconds(seconds: number): void {
  const safe = Math.max(0, Math.floor(seconds));
  playSecondsCache = safe;
  try {
    window.localStorage.setItem(PLAY_SECS_KEY, String(safe));
  } catch {
    // Ignore
  }
}

export function getPendingFeedbackDiamonds(): number {
  try {
    const raw = Number(window.localStorage.getItem(PENDING_DIAMONDS_KEY) ?? '0');
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  } catch {
    return 0;
  }
}

export function setPendingFeedbackDiamonds(amount: number): void {
  try {
    if (amount <= 0) {
      window.localStorage.removeItem(PENDING_DIAMONDS_KEY);
    } else {
      window.localStorage.setItem(PENDING_DIAMONDS_KEY, String(Math.floor(amount)));
    }
  } catch {
    // Ignore
  }
}

export function openFeedbackPopup(source: 'login' | 'ingame'): void {
  feedbackUi.open = true;
  feedbackUi.source = source;
  feedbackUi.awaitingConfirm = false;
  feedbackUi.formOpenedAt = null;
  feedbackUi.noUrlNotice = false;
  feedbackUi.loginGrantedNotice = false;
}

export function closeFeedbackPopup(): void {
  feedbackUi.open = false;
  feedbackUi.awaitingConfirm = false;
  feedbackUi.formOpenedAt = null;
  feedbackUi.noUrlNotice = false;
  feedbackUi.loginGrantedNotice = false;
  if (!isFeedbackAnswered()) {
    // Reset 30-minute timer so the popup returns only after another 30 minutes of active play
    setFeedbackPlaySeconds(0);
  }
}

export function launchFeedbackForm(): boolean {
  const url = getFeedbackFormUrl();
  if (!isFeedbackFormConfigured()) {
    feedbackUi.noUrlNotice = true;
    return false;
  }
  feedbackUi.noUrlNotice = false;
  window.open(url, '_blank', 'noopener,noreferrer');
  if (!isFeedbackAnswered()) {
    feedbackUi.awaitingConfirm = true;
    feedbackUi.formOpenedAt = Date.now();
  }
  return true;
}

export function canAutoGrantOnReturn(): boolean {
  if (!feedbackUi.open || !feedbackUi.awaitingConfirm || isFeedbackAnswered()) return false;
  if (feedbackUi.formOpenedAt === null) return false;
  return Date.now() - feedbackUi.formOpenedAt >= MIN_FORM_RETURN_SECONDS * 1000;
}

/**
 * Advances active play timer while playing; returns true when 30 minutes are reached
 * and the player has not yet answered the feedback form.
 */
export function tickFeedbackTimer(dt: number, activePlaying: boolean): boolean {
  if (!activePlaying || feedbackUi.open || isFeedbackAnswered()) return false;

  const current = getFeedbackPlaySeconds() + dt;
  playSecondsCache = current;
  persistAccumulator += dt;

  if (persistAccumulator >= 10) {
    persistAccumulator = 0;
    setFeedbackPlaySeconds(current);
  }

  if (current >= FEEDBACK_INTERVAL_SECONDS) {
    persistAccumulator = 0;
    setFeedbackPlaySeconds(0);
    openFeedbackPopup('ingame');
    return true;
  }
  return false;
}

/**
 * Grants the 3-diamond reward immediately if inside a campaign, or queues it for the next
 * campaign loaded/started if claimed from the title screen.
 * Returns 'granted_now' | 'queued_for_campaign' | 'already_claimed'.
 */
export function claimFeedbackReward(w: WorldState): 'granted_now' | 'queued_for_campaign' | 'already_claimed' {
  if (isFeedbackAnswered()) {
    closeFeedbackPopup();
    return 'already_claimed';
  }

  markFeedbackAnswered();

  if (w.mode === 'playing' || w.mode === 'paused' || w.mode === 'world_map') {
    const m = w.monarchs[0];
    if (m) {
      m.diamonds += FEEDBACK_DIAMOND_REWARD;
      w.resources.diamonds = m.diamonds;
    } else {
      w.resources.diamonds += FEEDBACK_DIAMOND_REWARD;
    }
    setPendingFeedbackDiamonds(0);
    closeFeedbackPopup();
    return 'granted_now';
  }

  // Answered from the title screen: queue 3 diamonds for the next loaded/started campaign
  setPendingFeedbackDiamonds(getPendingFeedbackDiamonds() + FEEDBACK_DIAMOND_REWARD);
  feedbackUi.awaitingConfirm = false;
  feedbackUi.formOpenedAt = null;
  feedbackUi.loginGrantedNotice = true;
  return 'queued_for_campaign';
}

/**
 * Delivers any pending feedback diamonds once the player enters active gameplay.
 */
export function deliverPendingFeedbackDiamonds(w: WorldState): number {
  if (w.mode !== 'playing') return 0;
  const pending = getPendingFeedbackDiamonds();
  if (pending <= 0) return 0;
  const m = w.monarchs[0];
  if (m) {
    m.diamonds += pending;
    w.resources.diamonds = m.diamonds;
  } else {
    w.resources.diamonds += pending;
  }
  setPendingFeedbackDiamonds(0);
  return pending;
}
