import {
  get,
  limitToLast,
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  query,
  ref,
  remove,
  set,
  update,
  type Unsubscribe,
} from 'firebase/database';
import {
  type CommunityReportReason,
  buildCommunityReportFormUrl,
  isCustomReportFormConfigured,
} from '../config/reportForm';
import { FIREBASE_CONFIG } from '../config/firebase';
import {
  getCenterX,
  getWorldWidth,
  GROUND_Y,
  type CharacterAppearance,
  type InputState,
  type Monarch,
  type WorldState,
} from '../types';
import { authCloudState, getCurrentAuthIdToken, getRealtimeDb } from './googleAuthCloud';

export const MAX_COOP_PLAYERS = 4;

export interface CoopMember {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  role: 'host' | 'guest';
  appearance: CharacterAppearance;
  micOn: boolean;
  joinedAtMs: number;
}

export interface CoopChatMessage {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  text: string;
  createdAtMs: number;
}

export interface CommunityBanRecord {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  banned: boolean;
  reason: string;
  details: string;
  reporterUid: string;
  reporterEmail: string;
  reporterName: string;
  roomCode: string;
  createdAtMs: number;
  unbannedAtMs?: number;
  unbannedBy?: string;
}

export interface RemoteGuestInputSnapshot {
  left: boolean;
  right: boolean;
  sprint: boolean;
  dropSeq: number;
  powerSeq: number;
  weaponSeq?: number;
  updatedAtMs: number;
}

export interface CoopState {
  active: boolean;
  role: 'none' | 'host' | 'guest';
  roomCode: string | null;
  hostUid: string | null;
  hostName: string;
  members: CoopMember[];
  messages: CoopChatMessage[];
  unreadMessages: number;
  chatOpen: boolean;
  micOn: boolean;
  speaking: boolean;
  micError: string | null;
  statusBanner: string | null;
}

export const coopState: CoopState = {
  active: false,
  role: 'none',
  roomCode: null,
  hostUid: null,
  hostName: '',
  members: [],
  messages: [],
  unreadMessages: 0,
  chatOpen: false,
  micOn: false,
  speaking: false,
  micError: null,
  statusBanner: null,
};

type CoopListener = (state: CoopState) => void;
const listeners = new Set<CoopListener>();

let roomUnsub: Unsubscribe | null = null;
let kickedUnsub: Unsubscribe | null = null;
let snapshotUnsub: Unsubscribe | null = null;
let membersUnsub: Unsubscribe | null = null;
let inputsUnsub: Unsubscribe | null = null;
let messagesUnsub: Unsubscribe | null = null;
let signalsUnsub: Unsubscribe | null = null;

// Host-side tracking of guest inputs
const remoteRawInputs = new Map<string, RemoteGuestInputSnapshot>();
const processedDropSeq = new Map<string, number>();
const processedPowerSeq = new Map<string, number>();
const processedWeaponSeq = new Map<string, number>();
let lastHostBroadcastMs = 0;

// Guest-side tracking of outgoing input & incoming world snapshot
let guestDropSeq = 0;
let guestPowerSeq = 0;
let guestWeaponSeq = 0;
let lastSentInputKey = '';
let lastGuestInputMs = 0;
let latestGuestWorldSnapshot: WorldState | null = null;
let onGuestForceExit: ((reason: string) => void) | null = null;

// WebRTC + Automatic Firestore Opus Relay Voice Chat state
let rawMicStream: MediaStream | null = null;
let localAudioStream: MediaStream | null = null;
let micProcessCtx: AudioContext | null = null;
let micInputGainNode: GainNode | null = null;
let micProcessedDest: MediaStreamAudioDestinationNode | null = null;
let micAudioCtx: AudioContext | null = null;
let micMeterTimer: number | null = null;
let lastVoiceDetectedMs = 0;
let roomConnectedAtMs = 0;
let relayLoopTimer: number | null = null;
let activeRelayRecorder: MediaRecorder | null = null;
let remotePlaybackCtx: AudioContext | null = null;
let remotePlaybackGain: GainNode | null = null;
let remoteChunkPlayCursor = 0;
let lastHostP2pBroadcastMs = 0;
const peerConnections = new Map<string, RTCPeerConnection>();
const peerDataChannels = new Map<string, RTCDataChannel>();
const peerSignalChains = new Map<string, Promise<void>>();
const pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>();
const remoteAudioEls = new Map<string, HTMLAudioElement>();
const processedSignalIds = new Set<string>();

// Persisted Voice Chat Volumes (0..5 + ON/OFF toggle, matching Music & SFX controls)
const VOICE_OUT_ON_KEY = 'corona_voice_out_on_v1';
const VOICE_OUT_VOL_KEY = 'corona_voice_out_vol_v1';
const MIC_IN_ON_KEY = 'corona_mic_in_on_v1';
const MIC_IN_VOL_KEY = 'corona_mic_in_vol_v1';

let voiceOutEnabled = true;
let voiceOutVolume = 5;
let micInputEnabled = true;
let micInputVolume = 4;

try {
  const voOn = window.localStorage.getItem(VOICE_OUT_ON_KEY);
  if (voOn !== null) voiceOutEnabled = voOn === '1';
  const voVol = window.localStorage.getItem(VOICE_OUT_VOL_KEY);
  if (voVol !== null) {
    const n = Number(voVol);
    if (Number.isFinite(n) && n >= 0 && n <= 5) voiceOutVolume = Math.round(n);
  }
  const miOn = window.localStorage.getItem(MIC_IN_ON_KEY);
  if (miOn !== null) micInputEnabled = miOn === '1';
  const miVol = window.localStorage.getItem(MIC_IN_VOL_KEY);
  if (miVol !== null) {
    const n = Number(miVol);
    if (Number.isFinite(n) && n >= 0 && n <= 5) micInputVolume = Math.round(n);
  }
} catch {
  // Ignore localStorage restrictions
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

function notify(): void {
  for (const fn of listeners) {
    try {
      fn(coopState);
    } catch {
      // Ignore UI subscriber errors
    }
  }
}

export function subscribeCoop(fn: CoopListener): () => void {
  listeners.add(fn);
  fn(coopState);
  return () => listeners.delete(fn);
}

export function setGuestForceExitHandler(fn: (reason: string) => void): void {
  onGuestForceExit = fn;
}

export function setCoopChatOpen(open: boolean): void {
  coopState.chatOpen = open;
  if (open) coopState.unreadMessages = 0;
  notify();
}

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, ms);
    promise.then(
      (val) => {
        window.clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Checks whether the currently signed-in Google account is banned from the Co-op community.
 */
export async function checkMyCommunityBan(): Promise<{ banned: boolean; reason?: string }> {
  const rtdb = getRealtimeDb();
  const user = authCloudState.user;
  if (!rtdb || !user) return { banned: false };
  try {
    const snap = await withTimeout(
      get(ref(rtdb, `community_bans/${user.uid}`)),
      3000,
      'timeout-ban-check'
    );
    if (!snap.exists()) return { banned: false };
    const data = snap.val() as Record<string, unknown>;
    if (data && data.banned === true) {
      return {
        banned: true,
        reason: typeof data.reason === 'string' ? data.reason : 'Violação das regras da comunidade',
      };
    }
  } catch {
    // Allow check to fail gracefully if offline or timed out
  }
  return { banned: false };
}

/**
 * Validates a Co-op code BEFORE sending the guest to Character Customization.
 */
export async function validateCoopJoinCode(rawCode: string): Promise<{
  ok: boolean;
  code?: string;
  hostName?: string;
  error?: string;
}> {
  const user = authCloudState.user;
  const rtdb = getRealtimeDb();
  if (!user || !rtdb) {
    return { ok: false, error: 'Conecte sua conta Google para entrar no Co-op online.' };
  }

  const ban = await checkMyCommunityBan();
  if (ban.banned) {
    return {
      ok: false,
      error: `Sua conta está banida da comunidade (${ban.reason ?? 'Denúncia'}). Somente guillermes.mozzer@gmail.com pode autorizar seu retorno.`,
    };
  }

  const code = normalizeRoomCode(rawCode);
  if (code.length < 4) {
    return { ok: false, error: 'Digite um código Co-op válido (6 caracteres).' };
  }

  try {
    const [metaSnap, kickedSnap, membersSnap] = await withTimeout(
      Promise.all([
        get(ref(rtdb, `coop_rooms/${code}/meta`)),
        get(ref(rtdb, `coop_rooms/${code}/kicked/${user.uid}`)),
        get(ref(rtdb, `coop_rooms/${code}/members`)),
      ]),
      7000,
      'timeout-validate-room'
    );
    if (!metaSnap.exists()) {
      return { ok: false, error: 'Sala não encontrada. Confira o código com o Host.' };
    }
    const meta = metaSnap.val() as Record<string, unknown>;
    if (meta.active !== true) {
      return { ok: false, error: 'O Host já encerrou esta sessão Co-op.' };
    }
    if (kickedSnap.exists() && kickedSnap.val() === true) {
      return { ok: false, error: 'Você foi removido desta campanha pelo Host.' };
    }
    const membersObj = (membersSnap.val() as Record<string, unknown> | null) ?? {};
    const memberIds = Object.keys(membersObj);
    const alreadyIn = memberIds.includes(user.uid);
    if (!alreadyIn && memberIds.length >= MAX_COOP_PLAYERS) {
      return { ok: false, error: `Sala lotada (máximo ${MAX_COOP_PLAYERS} jogadores por campanha).` };
    }
    return {
      ok: true,
      code,
      hostName: typeof meta.hostName === 'string' ? meta.hostName : 'Host',
    };
  } catch (err) {
    console.warn('[Corona Co-op] Validate room error:', err);
    return { ok: false, error: 'Erro de conexão com o servidor Co-op. Tente novamente.' };
  }
}

function cleanupSubscriptionsAndAudio(): void {
  roomUnsub?.();
  kickedUnsub?.();
  snapshotUnsub?.();
  membersUnsub?.();
  inputsUnsub?.();
  messagesUnsub?.();
  signalsUnsub?.();
  roomUnsub = null;
  kickedUnsub = null;
  snapshotUnsub = null;
  membersUnsub = null;
  inputsUnsub = null;
  messagesUnsub = null;
  signalsUnsub = null;

  remoteRawInputs.clear();
  processedDropSeq.clear();
  processedPowerSeq.clear();
  processedWeaponSeq.clear();
  latestGuestWorldSnapshot = null;
  lastSentInputKey = '';

  stopVoiceRelayLoop();
  for (const dc of peerDataChannels.values()) {
    try {
      dc.close();
    } catch {
      // Ignore
    }
  }
  peerDataChannels.clear();
  for (const pc of peerConnections.values()) {
    try {
      pc.close();
    } catch {
      // Ignore
    }
  }
  peerConnections.clear();
  peerSignalChains.clear();
  pendingIceCandidates.clear();
  for (const el of remoteAudioEls.values()) {
    try {
      el.pause();
      el.srcObject = null;
      el.remove();
    } catch {
      // Ignore
    }
  }
  remoteAudioEls.clear();
  processedSignalIds.clear();
}

function resetCoopState(keepLocalMic = false): void {
  cleanupSubscriptionsAndAudio();
  if (!keepLocalMic) {
    stopLocalMicrophoneInternal();
    coopState.micOn = false;
    coopState.speaking = false;
  }
  coopState.active = false;
  coopState.role = 'none';
  coopState.roomCode = null;
  coopState.hostUid = null;
  coopState.hostName = '';
  coopState.members = [];
  coopState.messages = [];
  coopState.unreadMessages = 0;
  coopState.chatOpen = false;
  coopState.micError = null;
  coopState.statusBanner = null;
  notify();
}

function sanitizeAppearance(app?: Partial<CharacterAppearance> | null): CharacterAppearance {
  return {
    gender: app?.gender === 'queen' ? 'queen' : 'king',
    name: typeof app?.name === 'string' ? app.name : '',
    outfitIndex: typeof app?.outfitIndex === 'number' && Number.isFinite(app.outfitIndex) ? app.outfitIndex : 0,
    hairIndex: typeof app?.hairIndex === 'number' && Number.isFinite(app.hairIndex) ? app.hairIndex : 0,
    horseIndex: typeof app?.horseIndex === 'number' && Number.isFinite(app.horseIndex) ? app.horseIndex : 0,
    crownIndex: typeof app?.crownIndex === 'number' && Number.isFinite(app.crownIndex) ? app.crownIndex : 0,
  };
}

function makeSlimSnapshot(w: WorldState): string {
  // Keep snapshot compact & fast (< 100 KB) by stripping nested other-island snapshots & snow particles
  const slim: WorldState = {
    ...w,
    mode: 'playing',
    activePrompt: null,
    islands: w.islands.map((isl) => ({ ...isl, snapshot: undefined })),
    particles: w.particles.filter((p) => p.kind !== 'snow').slice(-32),
  };
  return JSON.stringify(slim);
}

function subscribeCommonRoomChannels(code: string, myUid: string): void {
  const rtdb = getRealtimeDb();
  if (!rtdb) return;

  roomConnectedAtMs = Date.now();

  // 1. Live Members list (Realtime Database WebSocket)
  membersUnsub = onValue(ref(rtdb, `coop_rooms/${code}/members`), (snap) => {
    const rawMap = (snap.val() as Record<string, Record<string, unknown>> | null) ?? {};
    const list: CoopMember[] = [];
    for (const [uidKey, d] of Object.entries(rawMap)) {
      if (!d || typeof d !== 'object') continue;
      list.push({
        uid: String(d.uid ?? uidKey),
        email: String(d.email ?? ''),
        displayName: String(d.displayName ?? 'Monarca'),
        photoURL: typeof d.photoURL === 'string' ? d.photoURL : null,
        role: d.role === 'host' ? 'host' : 'guest',
        appearance: sanitizeAppearance(d.appearance as Partial<CharacterAppearance> | undefined),
        micOn: d.micOn === true,
        joinedAtMs: typeof d.joinedAtMs === 'number' ? d.joinedAtMs : 0,
      });
    }
    list.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'host' ? -1 : 1;
      return a.joinedAtMs - b.joinedAtMs;
    });
    coopState.members = list;

    // Clean up disconnected WebRTC peers & offer connections to newly joined peers
    const activeUids = new Set(list.map((m) => m.uid));
    for (const [peerUid, pc] of peerConnections.entries()) {
      if (!activeUids.has(peerUid)) {
        try {
          pc.close();
        } catch {
          // Ignore
        }
        peerConnections.delete(peerUid);
        const dc = peerDataChannels.get(peerUid);
        if (dc) {
          try {
            dc.close();
          } catch {
            // Ignore
          }
          peerDataChannels.delete(peerUid);
        }
        pendingIceCandidates.delete(peerUid);
        const aEl = remoteAudioEls.get(peerUid);
        if (aEl) {
          aEl.pause();
          aEl.srcObject = null;
          aEl.remove();
          remoteAudioEls.delete(peerUid);
        }
      }
    }
    // Host proactively opens P2P (DataChannel + audio) to newly joined guests
    const shouldOfferToPeers = (localAudioStream && coopState.micOn) || coopState.role === 'host';
    if (shouldOfferToPeers) {
      for (const m of list) {
        if (m.uid !== myUid && !peerConnections.has(m.uid)) {
          void attachLocalAudioAndOffer(code, myUid, m.uid);
        }
      }
      if (localAudioStream && coopState.micOn) {
        startVoiceRelayLoopIfNeeded();
      }
    }
    notify();
  });

  // 2. Live Text Chat messages (last 60 messages)
  const msgQ = query(ref(rtdb, `coop_rooms/${code}/messages`), limitToLast(60));
  messagesUnsub = onValue(
    msgQ,
    (snap) => {
      const prevCount = coopState.messages.length;
      const msgs: CoopChatMessage[] = [];
      snap.forEach((childSnap) => {
        const d = childSnap.val() as Record<string, unknown> | null;
        if (!d || typeof d !== 'object') return;
        msgs.push({
          id: childSnap.key ?? `${Date.now()}`,
          uid: String(d.uid ?? ''),
          email: String(d.email ?? ''),
          displayName: String(d.displayName ?? 'Monarca'),
          text: String(d.text ?? ''),
          createdAtMs: typeof d.createdAtMs === 'number' ? d.createdAtMs : 0,
        });
      });
      msgs.sort((a, b) => a.createdAtMs - b.createdAtMs);
      coopState.messages = msgs;
      if (!coopState.chatOpen && msgs.length > prevCount) {
        const latest = msgs[msgs.length - 1];
        if (latest && latest.uid !== myUid) {
          coopState.unreadMessages += msgs.length - prevCount;
        }
      }
      notify();
    },
    (err) => {
      console.warn('[Corona Co-op] Chat listener error:', err);
    }
  );

  // 3. Ordered Live Voice Signaling & Opus Relay channel (WebSocket onChildAdded — ~30ms!)
  signalsUnsub = onChildAdded(
    ref(rtdb, `coop_rooms/${code}/signals`),
    (childSnap) => {
      const sigId = childSnap.key ?? '';
      if (!sigId || processedSignalIds.has(sigId)) return;
      const d = childSnap.val() as Record<string, unknown> | null;
      if (!d || typeof d !== 'object') return;
      const createdAtMs = typeof d.createdAtMs === 'number' ? d.createdAtMs : 0;
      const toUid = String(d.to ?? '');
      const fromUid = String(d.from ?? '');
      const sigType = String(d.type ?? '');

      // Ignore & prune stale signals from earlier sessions
      if (createdAtMs > 0 && createdAtMs < roomConnectedAtMs - 10000) {
        processedSignalIds.add(sigId);
        if (Date.now() - createdAtMs > 25000) {
          void remove(childSnap.ref).catch(() => {});
        }
        return;
      }

      if (fromUid === myUid) return;
      if (toUid !== myUid && toUid !== 'all') return;
      processedSignalIds.add(sigId);

      if (sigType === 'voice_chunk') {
        if (typeof d.b64 === 'string' && !isPeerWebRtcConnected(fromUid)) {
          void playIncomingRelayChunk(fromUid, String(d.mime ?? 'audio/webm'), d.b64);
        }
        return;
      }

      // Serialize WebRTC offer/answer/ICE strictly in chronological order per peer
      enqueuePeerSignal(fromUid, async () => {
        await handleIncomingVoiceSignal(code, myUid, fromUid, d);
        if (toUid === myUid) {
          void remove(childSnap.ref).catch(() => {});
        }
      });
    },
    (err) => {
      console.warn('[Corona Co-op] Voice signal listener error:', err);
    }
  );
}

/**
 * HOST ONLY: Opens the player's current campaign to online Co-op (up to 4 players) and generates a room code.
 * Backed by Firebase Realtime Database (zero Firestore write quota usage!).
 */
export async function hostOpenCoopRoom(
  world: WorldState,
  onProgress?: (msg: string) => void
): Promise<{ ok: boolean; code?: string; error?: string }> {
  const user = authCloudState.user;
  const rtdb = getRealtimeDb();
  if (!user) {
    return { ok: false, error: 'Conecte sua conta Google para abrir o Co-op online.' };
  }
  if (!rtdb) {
    return { ok: false, error: 'Realtime Database não inicializado. Recarregue a página.' };
  }
  onProgress?.('Verificando conta...');
  const ban = await checkMyCommunityBan();
  if (ban.banned) {
    return {
      ok: false,
      error: `Sua conta está banida da comunidade (${ban.reason ?? 'Denúncia'}). Somente guillermes.mozzer@gmail.com pode autorizar seu retorno.`,
    };
  }
  if (coopState.active && coopState.role === 'host' && coopState.roomCode) {
    return { ok: true, code: coopState.roomCode };
  }

  resetCoopState(true);
  const code = generateRoomCode();
  onProgress?.(`Criando sala ${code}...`);

  const safeAppearance = sanitizeAppearance(world.appearance);
  const safeName = user.displayName || safeAppearance.name || 'Monarca';
  const safeEmail = user.email || '';
  const safePhoto = user.photoURL ?? null;

  // Tag host monarch with host identity
  if (world.monarchs[0]) {
    world.monarchs[0].playerUid = user.uid;
    world.monarchs[0].playerName = safeAppearance.name.trim() || safeName;
    world.monarchs[0].appearance = safeAppearance;
  }
  world.localPlayerUid = user.uid;

  let snapshotJson = '{}';
  try {
    snapshotJson = makeSlimSnapshot(world);
  } catch (snapErr) {
    console.warn('[Corona Co-op] Snapshot stringify fallback:', snapErr);
    snapshotJson = '{}';
  }

  const nowMs = Date.now();
  try {
    // Single atomic write creates room metadata, initial world snapshot, and Host member entry!
    await withTimeout(
      set(ref(rtdb, `coop_rooms/${code}`), {
        meta: {
          code,
          hostUid: user.uid,
          hostEmail: safeEmail,
          hostName: safeName,
          hostPhoto: safePhoto,
          active: true,
          maxPlayers: MAX_COOP_PLAYERS,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
        },
        snapshot: snapshotJson,
        members: {
          [user.uid]: {
            uid: user.uid,
            email: safeEmail,
            displayName: safeName,
            photoURL: safePhoto,
            role: 'host',
            appearance: safeAppearance,
            micOn: Boolean(coopState.micOn),
            joinedAtMs: nowMs,
          },
        },
      }),
      8000,
      'timeout-create-room'
    );

    coopState.active = true;
    coopState.role = 'host';
    coopState.roomCode = code;
    coopState.hostUid = user.uid;
    coopState.hostName = safeName;

    subscribeCommonRoomChannels(code, user.uid);

    // Host listens to guest fallback inputs in real time
    inputsUnsub = onValue(ref(rtdb, `coop_rooms/${code}/inputs`), (snap) => {
      const rawInputs = (snap.val() as Record<string, Record<string, unknown>> | null) ?? {};
      for (const [uid, d] of Object.entries(rawInputs)) {
        if (uid === user.uid || !d || typeof d !== 'object') continue;
        remoteRawInputs.set(uid, {
          left: d.left === true,
          right: d.right === true,
          sprint: d.sprint === true,
          dropSeq: typeof d.dropSeq === 'number' ? d.dropSeq : 0,
          powerSeq: typeof d.powerSeq === 'number' ? d.powerSeq : 0,
          weaponSeq: typeof d.weaponSeq === 'number' ? d.weaponSeq : 0,
          updatedAtMs: typeof d.updatedAtMs === 'number' ? d.updatedAtMs : 0,
        });
      }
    });

    notify();
    return { ok: true, code };
  } catch (err) {
    console.warn('[Corona Co-op] Failed to open room:', err);
    resetCoopState(true);
    const errCode = String((err as { code?: string })?.code ?? '');
    const errMsg = String((err as { message?: string })?.message ?? '');
    if (errCode.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('permission_denied')) {
      return {
        ok: false,
        error: 'Permissão negada no Realtime Database. Publique as Regras JSON do Realtime Database no Firebase.',
      };
    }
    if (errMsg.startsWith('timeout-')) {
      onProgress?.('Diagnosticando Realtime Database...');
      const diag = await diagnoseRealtimeDbTimeout(code);
      return { ok: false, error: diag };
    }
    const detail = errCode
      ? `Erro Firebase (${errCode}): ${errMsg.slice(0, 80)}`
      : `Erro ao criar sala: ${errMsg.slice(0, 90) || 'verifique sua conexão.'}`;
    return { ok: false, error: detail };
  }
}

async function diagnoseRealtimeDbTimeout(code: string): Promise<string> {
  try {
    const token = await getCurrentAuthIdToken();
    const base = FIREBASE_CONFIG.databaseURL.replace(/\/+$/, '');
    const url = `${base}/coop_rooms/${encodeURIComponent(code)}/meta.json${token ? `?auth=${encodeURIComponent(token)}` : ''}`;
    const res = await withTimeout(
      fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      }),
      5000,
      'rest-timeout'
    );
    if (res.status === 401 || res.status === 403) {
      return 'Permissão negada no Realtime Database (HTTP 401/403). Confira se publicou as Regras JSON no Realtime Database.';
    }
    if (res.status === 404) {
      return 'Realtime Database não encontrado (HTTP 404). Verifique a URL no Firebase Console.';
    }
    if (res.ok) {
      return 'Realtime Database respondeu via HTTPS, mas o WebSocket demorou. Recarregue a página e tente novamente.';
    }
    const bodyText = (await res.text().catch(() => '')).slice(0, 100);
    return `Realtime Database respondeu HTTP ${res.status}: ${bodyText || res.statusText}`;
  } catch {
    return 'Sem resposta do Realtime Database. Verifique sua conexão com a internet.';
  }
}

/**
 * HOST ONLY: Closes the Co-op room, disconnects guests, and keeps 100% of campaign progress on the Host.
 */
export async function hostCloseCoopRoom(world?: WorldState): Promise<void> {
  if (!coopState.active || coopState.role !== 'host' || !coopState.roomCode) return;
  const rtdb = getRealtimeDb();
  const code = coopState.roomCode;
  if (world && world.monarchs.length > 1) {
    world.monarchs = [world.monarchs[0]];
  }
  resetCoopState();
  if (rtdb) {
    try {
      await update(ref(rtdb, `coop_rooms/${code}/meta`), {
        active: false,
        closedAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
    } catch {
      // Ignore network close errors
    }
  }
}

/**
 * HOST ONLY: Kicks/eliminates a specific guest player from the Co-op campaign.
 */
export async function hostKickCoopPlayer(targetUid: string, world?: WorldState): Promise<boolean> {
  if (!coopState.active || coopState.role !== 'host' || !coopState.roomCode) return false;
  if (targetUid === coopState.hostUid) return false;
  const rtdb = getRealtimeDb();
  if (!rtdb) return false;
  const code = coopState.roomCode;
  try {
    await Promise.all([
      set(ref(rtdb, `coop_rooms/${code}/kicked/${targetUid}`), true),
      remove(ref(rtdb, `coop_rooms/${code}/members/${targetUid}`)),
      remove(ref(rtdb, `coop_rooms/${code}/inputs/${targetUid}`)),
    ]);
    if (world) {
      world.monarchs = world.monarchs.filter((m, idx) => idx === 0 || m.playerUid !== targetUid);
    }
    return true;
  } catch (err) {
    console.warn('[Corona Co-op] Failed to kick player:', err);
    return false;
  }
}

/**
 * GUEST: Joins an active Host room AFTER completing character customization.
 */
export async function joinCoopRoomAsGuest(
  rawCode: string,
  appearance: CharacterAppearance
): Promise<{ ok: boolean; initialWorld?: WorldState; error?: string }> {
  const validation = await validateCoopJoinCode(rawCode);
  if (!validation.ok || !validation.code) {
    return { ok: false, error: validation.error ?? 'Código inválido.' };
  }
  const user = authCloudState.user;
  const rtdb = getRealtimeDb();
  if (!user || !rtdb) return { ok: false, error: 'Conta Google necessária.' };

  const code = validation.code;
  resetCoopState(true);

  try {
    const [metaSnap, snapSnap] = await withTimeout(
      Promise.all([
        get(ref(rtdb, `coop_rooms/${code}/meta`)),
        get(ref(rtdb, `coop_rooms/${code}/snapshot`)),
      ]),
      7000,
      'timeout-join-room'
    );
    if (!metaSnap.exists()) return { ok: false, error: 'Sala não encontrada.' };
    const meta = metaSnap.val() as Record<string, unknown>;
    if (meta.active !== true) return { ok: false, error: 'Sala encerrada pelo Host.' };

    const safeApp = sanitizeAppearance(appearance);
    const safeName = user.displayName || safeApp.name || 'Monarca';
    const memberAppearance: CharacterAppearance = {
      ...safeApp,
      name: safeApp.name.trim() || safeName,
    };

    const memberRef = ref(rtdb, `coop_rooms/${code}/members/${user.uid}`);
    const inputRef = ref(rtdb, `coop_rooms/${code}/inputs/${user.uid}`);
    await set(memberRef, {
      uid: user.uid,
      email: user.email || '',
      displayName: safeName,
      photoURL: user.photoURL ?? null,
      role: 'guest',
      appearance: memberAppearance,
      micOn: Boolean(coopState.micOn),
      joinedAtMs: Date.now(),
    });
    // Auto-cleanup if guest closes browser tab or drops offline
    void onDisconnect(memberRef).remove().catch(() => {});
    void onDisconnect(inputRef).remove().catch(() => {});

    coopState.active = true;
    coopState.role = 'guest';
    coopState.roomCode = code;
    coopState.hostUid = String(meta.hostUid ?? '');
    coopState.hostName = String(meta.hostName ?? 'Host');

    let initialWorld: WorldState | undefined;
    const rawSnapJson = snapSnap.val();
    if (typeof rawSnapJson === 'string') {
      try {
        initialWorld = JSON.parse(rawSnapJson) as WorldState;
        initialWorld.mode = 'playing';
        initialWorld.localPlayerUid = user.uid;
      } catch {
        // Wait for next snapshot
      }
    }

    subscribeCommonRoomChannels(code, user.uid);

    // 1. Watch room meta for Host closing room
    roomUnsub = onValue(ref(rtdb, `coop_rooms/${code}/meta`), (docSnap) => {
      if (!docSnap.exists()) {
        resetCoopState();
        onGuestForceExit?.('A sala Co-op foi encerrada.');
        return;
      }
      const d = docSnap.val() as Record<string, unknown>;
      if (d.active !== true) {
        resetCoopState();
        onGuestForceExit?.('O Host encerrou o modo Co-op.');
      }
    });

    // 2. Watch instant kick flag for this guest
    kickedUnsub = onValue(ref(rtdb, `coop_rooms/${code}/kicked/${user.uid}`), (kSnap) => {
      if (kSnap.exists() && kSnap.val() === true) {
        resetCoopState();
        onGuestForceExit?.('Você foi removido da campanha pelo Host.');
      }
    });

    // 3. Watch live world snapshot fallback (used whenever WebRTC DataChannel is not yet open)
    snapshotUnsub = onValue(ref(rtdb, `coop_rooms/${code}/snapshot`), (sSnap) => {
      const jsonStr = sSnap.val();
      if (typeof jsonStr === 'string') {
        try {
          const parsed = JSON.parse(jsonStr) as WorldState;
          parsed.mode = 'playing';
          parsed.localPlayerUid = user.uid;
          latestGuestWorldSnapshot = parsed;
        } catch {
          // Ignore malformed frame
        }
      }
    });

    notify();
    return { ok: true, initialWorld };
  } catch (err) {
    console.warn('[Corona Co-op] Join error:', err);
    resetCoopState();
    return { ok: false, error: 'Erro ao conectar à campanha Co-op.' };
  }
}

/**
 * GUEST: Leaves the Host's room cleanly WITHOUT closing the Host's Co-op session.
 */
export async function leaveCoopAsGuest(): Promise<void> {
  if (!coopState.active || coopState.role !== 'guest' || !coopState.roomCode) return;
  const rtdb = getRealtimeDb();
  const user = authCloudState.user;
  const code = coopState.roomCode;
  resetCoopState();
  if (rtdb && user) {
    try {
      await Promise.all([
        remove(ref(rtdb, `coop_rooms/${code}/members/${user.uid}`)),
        remove(ref(rtdb, `coop_rooms/${code}/inputs/${user.uid}`)),
      ]);
    } catch {
      // Ignore network errors on exit
    }
  }
}

/**
 * HOST TICK: Syncs guest monarchs in world.monarchs[], extracts fresh remote InputStates,
 * and broadcasts compact live world snapshots to Firestore (~10 Hz).
 */
export function hostSyncCoopWorld(world: WorldState): Map<string, InputState> {
  const remoteInputs = new Map<string, InputState>();
  if (!coopState.active || coopState.role !== 'host' || !coopState.roomCode) return remoteInputs;

  const hostUid = coopState.hostUid;
  const guests = coopState.members.filter((m) => m.uid !== hostUid).slice(0, MAX_COOP_PLAYERS - 1);
  const guestUids = new Set(guests.map((g) => g.uid));

  // Remove monarchs of guests who left
  if (world.monarchs.length > 1) {
    world.monarchs = world.monarchs.filter((m, idx) => idx === 0 || (m.playerUid && guestUids.has(m.playerUid)));
  }

  // Ensure every connected guest has a live Monarch in the Host's campaign
  const hostMonarch = world.monarchs[0];
  guests.forEach((guest, idx) => {
    let m = world.monarchs.find((item) => item.playerUid === guest.uid);
    if (!m && hostMonarch) {
      const spawnX = Math.max(
        175,
        Math.min(getWorldWidth(world) - 185, (hostMonarch.x || getCenterX(world)) + (idx % 2 === 0 ? -24 : 24) * (idx + 1))
      );
      const newMonarch: Monarch = {
        id: 100 + idx,
        x: spawnX,
        y: GROUND_Y,
        vx: 0,
        facing: 1,
        stamina: 1,
        maxStamina: 1,
        exhausted: false,
        sprinting: false,
        coins: 6,
        maxCoins: hostMonarch.maxCoins,
        diamonds: 0,
        mount: 'starter',
        mountPowerCooldown: 0,
        flyTimer: 0,
        flyY: 0,
        roarTimer: 0,
        wolfBiteCooldown: 0,
        weapon: null,
        weaponCooldown: 0,
        armor: {},
        crownShieldReady: false,
        ridingElderId: null,
        hasCrown: true,
        crownX: spawnX,
        crownY: GROUND_Y - 24,
        crownVx: 0,
        crownVy: 0,
        crownGrounded: false,
        crownStolenByEnemyId: null,
        animTime: 0,
        dropCooldown: 0,
        hurtCooldown: 0,
        cameraX: Math.max(0, spawnX - (world.viewWidth || 480) / 2),
        playerUid: guest.uid,
        playerName: guest.appearance?.name?.trim() || guest.displayName,
        appearance: { ...guest.appearance },
      };
      world.monarchs.push(newMonarch);
      m = newMonarch;
    } else if (m) {
      m.playerName = guest.appearance?.name?.trim() || guest.displayName;
      m.appearance = { ...guest.appearance };
      m.maxCoins = hostMonarch?.maxCoins ?? 30;
    }

    const raw = remoteRawInputs.get(guest.uid);
    const prevDrop = processedDropSeq.get(guest.uid) ?? 0;
    const prevPower = processedPowerSeq.get(guest.uid) ?? 0;
    const prevWeapon = processedWeaponSeq.get(guest.uid) ?? 0;
    const dropTriggered = Boolean(raw && raw.dropSeq > prevDrop);
    const powerTriggered = Boolean(raw && raw.powerSeq > prevPower);
    const weaponTriggered = Boolean(raw && (raw.weaponSeq ?? 0) > prevWeapon);
    if (raw) {
      processedDropSeq.set(guest.uid, raw.dropSeq);
      processedPowerSeq.set(guest.uid, raw.powerSeq);
      processedWeaponSeq.set(guest.uid, raw.weaponSeq ?? 0);
    }

    remoteInputs.set(guest.uid, {
      left: Boolean(raw?.left),
      right: Boolean(raw?.right),
      leftJustPressed: false,
      rightJustPressed: false,
      sprint: Boolean(raw?.sprint),
      powerJustPressed: powerTriggered,
      weaponJustPressed: weaponTriggered,
      drop: false,
      dropJustPressed: dropTriggered,
      cmdZ: false,
      cmdX: false,
      cmdC: false,
      cmdV: false,
    });
  });

  // Zero-write P2P WebRTC DataChannel broadcast (~12 Hz) + quota-safe Firestore fallback (ONLY when guests are present!)
  if (guests.length > 0) {
    const now = performance.now();
    let anyGuestNeedsFirestore = false;
    const openGuestChannels: RTCDataChannel[] = [];
    for (const g of guests) {
      const dc = peerDataChannels.get(g.uid);
      if (dc && dc.readyState === 'open') {
        openGuestChannels.push(dc);
      } else {
        anyGuestNeedsFirestore = true;
      }
    }

    let cachedSnap: string | null = null;
    if (openGuestChannels.length > 0 && now - lastHostP2pBroadcastMs >= 85) {
      lastHostP2pBroadcastMs = now;
      cachedSnap = makeSlimSnapshot(world);
      const packet = `W:${cachedSnap}`;
      for (const dc of openGuestChannels) {
        try {
          if (dc.bufferedAmount < 262144) dc.send(packet);
        } catch {
          // Ignore transient DataChannel error
        }
      }
    }

    const rtdb = getRealtimeDb();
    if (rtdb && anyGuestNeedsFirestore && now - lastHostBroadcastMs >= 200) {
      lastHostBroadcastMs = now;
      const code = coopState.roomCode;
      void set(ref(rtdb, `coop_rooms/${code}/snapshot`), cachedSnap ?? makeSlimSnapshot(world)).catch(() => {
        // Transient write error ignored
      });
    }
  }

  return remoteInputs;
}

/**
 * GUEST TICK: Consumes the latest authoritative world snapshot from the Host and uploads local inputs.
 */
export function guestSyncCoopFrame(
  currentWorld: WorldState,
  localInput: InputState
): WorldState {
  if (!coopState.active || coopState.role !== 'guest' || !coopState.roomCode) {
    return currentWorld;
  }

  // Send local inputs when changed or on action edge (drop / power / weapon)
  if (localInput.dropJustPressed) guestDropSeq += 1;
  if (localInput.powerJustPressed) guestPowerSeq += 1;
  if (localInput.weaponJustPressed) guestWeaponSeq += 1;

  const key = `${localInput.left ? 1 : 0}${localInput.right ? 1 : 0}${localInput.sprint ? 1 : 0}:${guestDropSeq}:${guestPowerSeq}:${guestWeaponSeq}`;
  const now = performance.now();
  const rtdb = getRealtimeDb();
  const user = authCloudState.user;

  if (user && key !== lastSentInputKey) {
    const payload = {
      left: localInput.left,
      right: localInput.right,
      sprint: localInput.sprint,
      dropSeq: guestDropSeq,
      powerSeq: guestPowerSeq,
      weaponSeq: guestWeaponSeq,
      updatedAtMs: Date.now(),
    };
    const hostDc = coopState.hostUid ? peerDataChannels.get(coopState.hostUid) : undefined;
    if (hostDc && hostDc.readyState === 'open') {
      lastSentInputKey = key;
      lastGuestInputMs = now;
      try {
        hostDc.send(`I:${JSON.stringify(payload)}`);
      } catch {
        // Ignore transient DataChannel error
      }
    } else if (rtdb && now - lastGuestInputMs >= 100) {
      lastSentInputKey = key;
      lastGuestInputMs = now;
      void set(ref(rtdb, `coop_rooms/${coopState.roomCode}/inputs/${user.uid}`), payload).catch(() => {
        // Ignore transient write failures
      });
    }
  }

  if (latestGuestWorldSnapshot) {
    const snap = latestGuestWorldSnapshot;
    latestGuestWorldSnapshot = null;
    snap.viewWidth = currentWorld.viewWidth;
    snap.viewHeight = currentWorld.viewHeight;
    snap.localPlayerUid = user?.uid;
    return snap;
  }

  return currentWorld;
}

/**
 * Sends a text chat message in real time via Firebase Realtime Database to all players in the Co-op room.
 */
export async function sendCoopChatMessage(
  rawText: string
): Promise<{ ok: boolean; localOnly?: boolean; error?: string }> {
  const text = rawText.trim().slice(0, 180);
  if (!text) return { ok: false };

  const user = authCloudState.user;
  const senderName = user?.displayName || 'Você';

  // Solo / before Co-op room is opened: show message locally immediately
  if (!coopState.active || !coopState.roomCode) {
    coopState.messages = [
      ...coopState.messages.slice(-59),
      {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        uid: user?.uid ?? 'local',
        email: user?.email ?? '',
        displayName: senderName,
        text,
        createdAtMs: Date.now(),
      },
    ];
    notify();
    return { ok: true, localOnly: true };
  }

  const rtdb = getRealtimeDb();
  if (!rtdb || !user) {
    return { ok: false, error: 'Conecte sua conta Google para enviar mensagens no Co-op.' };
  }

  try {
    await push(ref(rtdb, `coop_rooms/${coopState.roomCode}/messages`), {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      text,
      createdAtMs: Date.now(),
    });
    return { ok: true };
  } catch (err) {
    console.warn('[Corona Co-op] Failed to send chat message:', err);
    return { ok: false, error: 'Sem permissão no Realtime Database para enviar chat.' };
  }
}

/**
 * Reports & IMMEDIATELY BANS a player from the Co-op community, kicks them from the room,
 * records the complaint in Realtime Database for Admin review, and opens the Google Form!
 */
export async function reportAndBanCoopPlayer(
  target: CoopMember,
  reason: CommunityReportReason,
  details: string,
  world?: WorldState
): Promise<{ ok: boolean; formUrl: string; customFormConfigured: boolean; error?: string }> {
  const rtdb = getRealtimeDb();
  const me = authCloudState.user;
  const formUrl = buildCommunityReportFormUrl({
    reporterEmail: me?.email ?? '',
    reportedEmail: target.email,
    reason,
    details,
  });

  if (!rtdb || !me) {
    return {
      ok: false,
      formUrl,
      customFormConfigured: isCustomReportFormConfigured(),
      error: 'Conecte sua conta Google para enviar denúncias.',
    };
  }

  try {
    const nowMs = Date.now();
    const record = {
      uid: target.uid,
      email: target.email || '',
      displayName: target.displayName || 'Jogador',
      photoURL: target.photoURL ?? null,
      banned: true,
      reason,
      details: details.trim().slice(0, 400),
      reporterUid: me.uid,
      reporterEmail: me.email || '',
      reporterName: me.displayName || 'Monarca',
      roomCode: coopState.roomCode ?? 'COOP',
      createdAtMs: nowMs,
    };

    // 1. Immediately ban the reported player in community_bans/{uid}
    await set(ref(rtdb, `community_bans/${target.uid}`), record);

    // 2. Append immutable report log in community_reports
    await push(ref(rtdb, 'community_reports'), record);

    // 3. Immediately remove them from the active room
    if (coopState.active && coopState.roomCode) {
      const code = coopState.roomCode;
      await Promise.all([
        set(ref(rtdb, `coop_rooms/${code}/kicked/${target.uid}`), true),
        remove(ref(rtdb, `coop_rooms/${code}/members/${target.uid}`)),
        remove(ref(rtdb, `coop_rooms/${code}/inputs/${target.uid}`)),
      ]);
      if (world) {
        world.monarchs = world.monarchs.filter((m, idx) => idx === 0 || m.playerUid !== target.uid);
      }
    }

    // Copy summary to clipboard so even without pre-fill entry IDs the player can paste easily if needed
    const summaryText = `Denunciante: ${me.email}\nDenunciado: ${target.email}\nMotivo: ${reason}${details.trim() ? `\nQueixa: ${details.trim()}` : ''}`;
    try {
      await navigator.clipboard?.writeText(summaryText);
    } catch {
      // Clipboard optional
    }

    // Open Google Forms in a new tab
    window.open(formUrl, '_blank', 'noopener,noreferrer');

    return {
      ok: true,
      formUrl,
      customFormConfigured: isCustomReportFormConfigured(),
    };
  } catch (err) {
    console.warn('[Corona Co-op] Report failed:', err);
    return {
      ok: false,
      formUrl,
      customFormConfigured: isCustomReportFormConfigured(),
      error: 'Erro ao registrar denúncia. Tente novamente.',
    };
  }
}

/**
 * ADMIN ONLY (guillermes.mozzer@gmail.com): Loads all community bans/reports.
 */
export async function fetchCommunityBans(): Promise<CommunityBanRecord[]> {
  const rtdb = getRealtimeDb();
  if (!rtdb || !authCloudState.user?.isAdmin) return [];
  try {
    const snap = await get(ref(rtdb, 'community_bans'));
    const rawMap = (snap.val() as Record<string, Record<string, unknown>> | null) ?? {};
    const rows: CommunityBanRecord[] = [];
    for (const [uidKey, d] of Object.entries(rawMap)) {
      if (!d || typeof d !== 'object') continue;
      rows.push({
        uid: String(d.uid ?? uidKey),
        email: String(d.email ?? ''),
        displayName: String(d.displayName ?? 'Jogador'),
        photoURL: typeof d.photoURL === 'string' ? d.photoURL : null,
        banned: d.banned === true,
        reason: String(d.reason ?? ''),
        details: String(d.details ?? ''),
        reporterUid: String(d.reporterUid ?? ''),
        reporterEmail: String(d.reporterEmail ?? ''),
        reporterName: String(d.reporterName ?? ''),
        roomCode: String(d.roomCode ?? ''),
        createdAtMs: typeof d.createdAtMs === 'number' ? d.createdAtMs : 0,
        unbannedAtMs: typeof d.unbannedAtMs === 'number' ? d.unbannedAtMs : undefined,
        unbannedBy: typeof d.unbannedBy === 'string' ? d.unbannedBy : undefined,
      });
    }
    rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return rows.slice(0, 100);
  } catch {
    return [];
  }
}

/**
 * ADMIN ONLY (guillermes.mozzer@gmail.com): Re-authorizes a banned player to enter the Co-op community again.
 */
export async function adminUnbanCommunityPlayer(targetUid: string): Promise<boolean> {
  const rtdb = getRealtimeDb();
  const me = authCloudState.user;
  if (!rtdb || !me?.isAdmin) return false;
  try {
    await update(ref(rtdb, `community_bans/${targetUid}`), {
      banned: false,
      unbannedBy: me.email,
      unbannedAtMs: Date.now(),
    });
    return true;
  } catch {
    return false;
  }
}

// =========================================================================
// HYBRID VOICE CHAT ENGINE:
// 1. WebRTC P2P (explicit sendrecv transceivers + ordered signaling + ICE restart)
// 2. Automatic CGNAT/4G-proof Opus Voice Relay via Firestore when P2P is blocked!
// =========================================================================

function enqueuePeerSignal(peerUid: string, task: () => Promise<void>): void {
  const prev = peerSignalChains.get(peerUid) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(task)
    .catch((err) => {
      console.warn('[Corona Co-op] Peer signal queue error:', err);
    });
  peerSignalChains.set(peerUid, next);
}

function isPeerWebRtcConnected(peerUid: string): boolean {
  const pc = peerConnections.get(peerUid);
  if (!pc) return false;
  const connected =
    pc.iceConnectionState === 'connected' ||
    pc.iceConnectionState === 'completed' ||
    pc.connectionState === 'connected';
  if (!connected) return false;
  const el = remoteAudioEls.get(peerUid);
  return Boolean(el && el.srcObject);
}

function getEffectiveVoiceOutGain(): number {
  if (!voiceOutEnabled || voiceOutVolume <= 0) return 0;
  return Math.max(0, Math.min(1, voiceOutVolume / 5));
}

function getEffectiveMicInputGain(): number {
  if (!micInputEnabled || micInputVolume <= 0) return 0;
  const table = [0, 0.35, 0.65, 1.0, 1.35, 1.75];
  return table[Math.max(0, Math.min(5, Math.round(micInputVolume)))] ?? 1.0;
}

function applyVoiceOutVolumeToAll(): void {
  const gain = getEffectiveVoiceOutGain();
  for (const el of remoteAudioEls.values()) {
    try {
      el.volume = gain;
      el.muted = gain <= 0;
    } catch {
      // Ignore
    }
  }
  if (remotePlaybackGain && remotePlaybackCtx) {
    try {
      remotePlaybackGain.gain.setTargetAtTime(gain, remotePlaybackCtx.currentTime, 0.015);
    } catch {
      remotePlaybackGain.gain.value = gain;
    }
  }
}

function applyMicInputVolumeToPipeline(): void {
  const gain = getEffectiveMicInputGain();
  if (micInputGainNode && micProcessCtx) {
    try {
      micInputGainNode.gain.setTargetAtTime(gain, micProcessCtx.currentTime, 0.015);
    } catch {
      micInputGainNode.gain.value = gain;
    }
  } else if (rawMicStream) {
    for (const track of rawMicStream.getAudioTracks()) {
      track.enabled = gain > 0;
    }
  }
}

export function isVoiceOutEnabled(): boolean {
  return voiceOutEnabled;
}

export function getVoiceOutVolume(): number {
  return voiceOutVolume;
}

export function setVoiceOutVolume(level: number): number {
  const safe = Math.max(0, Math.min(5, Math.round(level)));
  voiceOutVolume = safe;
  if (safe > 0 && !voiceOutEnabled) {
    voiceOutEnabled = true;
    try {
      window.localStorage.setItem(VOICE_OUT_ON_KEY, '1');
    } catch {
      // Ignore
    }
  }
  try {
    window.localStorage.setItem(VOICE_OUT_VOL_KEY, String(safe));
  } catch {
    // Ignore
  }
  applyVoiceOutVolumeToAll();
  return voiceOutVolume;
}

export function toggleVoiceOut(): boolean {
  voiceOutEnabled = !voiceOutEnabled;
  if (voiceOutEnabled && voiceOutVolume === 0) {
    voiceOutVolume = 3;
    try {
      window.localStorage.setItem(VOICE_OUT_VOL_KEY, '3');
    } catch {
      // Ignore
    }
  }
  try {
    window.localStorage.setItem(VOICE_OUT_ON_KEY, voiceOutEnabled ? '1' : '0');
  } catch {
    // Ignore
  }
  applyVoiceOutVolumeToAll();
  return voiceOutEnabled;
}

export function isMicInputEnabled(): boolean {
  return micInputEnabled;
}

export function getMicInputVolume(): number {
  return micInputVolume;
}

export function setMicInputVolume(level: number): number {
  const safe = Math.max(0, Math.min(5, Math.round(level)));
  micInputVolume = safe;
  if (safe > 0 && !micInputEnabled) {
    micInputEnabled = true;
    try {
      window.localStorage.setItem(MIC_IN_ON_KEY, '1');
    } catch {
      // Ignore
    }
  }
  try {
    window.localStorage.setItem(MIC_IN_VOL_KEY, String(safe));
  } catch {
    // Ignore
  }
  applyMicInputVolumeToPipeline();
  return micInputVolume;
}

export function toggleMicInput(): boolean {
  micInputEnabled = !micInputEnabled;
  if (micInputEnabled && micInputVolume === 0) {
    micInputVolume = 3;
    try {
      window.localStorage.setItem(MIC_IN_VOL_KEY, '3');
    } catch {
      // Ignore
    }
  }
  try {
    window.localStorage.setItem(MIC_IN_ON_KEY, micInputEnabled ? '1' : '0');
  } catch {
    // Ignore
  }
  applyMicInputVolumeToPipeline();
  return micInputEnabled;
}

function getOrUnlockRemotePlaybackCtx(): AudioContext | null {
  try {
    const AudioCtxCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxCtor) return null;
    if (!remotePlaybackCtx) {
      remotePlaybackCtx = new AudioCtxCtor();
      remotePlaybackGain = remotePlaybackCtx.createGain();
      remotePlaybackGain.gain.value = getEffectiveVoiceOutGain();
      remotePlaybackGain.connect(remotePlaybackCtx.destination);
    }
    if (remotePlaybackCtx.state === 'suspended') {
      void remotePlaybackCtx.resume().catch(() => {});
    }
    return remotePlaybackCtx;
  } catch {
    return null;
  }
}

function stopMicLevelMonitor(): void {
  if (micMeterTimer !== null) {
    window.clearInterval(micMeterTimer);
    micMeterTimer = null;
  }
  if (micAudioCtx) {
    void micAudioCtx.close().catch(() => {});
    micAudioCtx = null;
  }
  if (coopState.speaking) {
    coopState.speaking = false;
  }
}

function startMicLevelMonitor(stream: MediaStream): void {
  stopMicLevelMonitor();
  try {
    const AudioCtxCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxCtor) return;
    micAudioCtx = new AudioCtxCtor();
    if (micAudioCtx.state === 'suspended') {
      void micAudioCtx.resume().catch(() => {});
    }
    const src = micAudioCtx.createMediaStreamSource(stream);
    const analyser = micAudioCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    micMeterTimer = window.setInterval(() => {
      if (!coopState.micOn || !localAudioStream) {
        if (coopState.speaking) {
          coopState.speaking = false;
          notify();
        }
        return;
      }
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const d = (buf[i] - 128) / 128;
        sum += d * d;
      }
      const rms = Math.sqrt(sum / buf.length);
      const isNowSpeaking = rms > 0.018;
      if (isNowSpeaking) {
        lastVoiceDetectedMs = Date.now();
      }
      if (isNowSpeaking !== coopState.speaking) {
        coopState.speaking = isNowSpeaking;
        notify();
      }
    }, 100);
  } catch {
    // Voice level visual is optional; never block mic transmission
  }
}

function pickSupportedRelayMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // Ignore
    }
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function stopVoiceRelayLoop(): void {
  if (relayLoopTimer !== null) {
    window.clearTimeout(relayLoopTimer);
    relayLoopTimer = null;
  }
  if (activeRelayRecorder) {
    try {
      if (activeRelayRecorder.state !== 'inactive') activeRelayRecorder.stop();
    } catch {
      // Ignore
    }
    activeRelayRecorder = null;
  }
}

function needsRelayForAnyPeer(myUid: string): boolean {
  const others = coopState.members.filter((m) => m.uid !== myUid);
  if (others.length === 0) return false;
  return others.some((m) => !isPeerWebRtcConnected(m.uid));
}

function startVoiceRelayLoopIfNeeded(): void {
  if (relayLoopTimer !== null || activeRelayRecorder !== null) return;
  if (!coopState.active || !coopState.roomCode || !coopState.micOn || !localAudioStream) return;
  if (typeof MediaRecorder === 'undefined') return;

  const scheduleNextSegment = (delayMs: number) => {
    if (relayLoopTimer !== null) window.clearTimeout(relayLoopTimer);
    relayLoopTimer = window.setTimeout(() => {
      relayLoopTimer = null;
      runSingleRelaySegment();
    }, delayMs);
  };

  const runSingleRelaySegment = () => {
    const user = authCloudState.user;
    const rtdb = getRealtimeDb();
    const code = coopState.roomCode;
    if (!coopState.active || !code || !coopState.micOn || !localAudioStream || !user || !rtdb) {
      stopVoiceRelayLoop();
      return;
    }

    // If all teammates are already connected via direct WebRTC P2P, stay dormant and re-check gently!
    if (!needsRelayForAnyPeer(user.uid)) {
      scheduleNextSegment(1400);
      return;
    }

    const mime = pickSupportedRelayMime();
    const chunks: Blob[] = [];
    const segStartMs = Date.now();
    try {
      const options: MediaRecorderOptions = mime
        ? { mimeType: mime, audioBitsPerSecond: 16000 }
        : { audioBitsPerSecond: 16000 };
      const rec = new MediaRecorder(localAudioStream, options);
      activeRelayRecorder = rec;

      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      rec.onstop = () => {
        if (activeRelayRecorder === rec) activeRelayRecorder = null;
        const stillLive = Boolean(coopState.active && coopState.roomCode === code && coopState.micOn && localAudioStream);
        // Only transmit chunk if voice was detected recently (or meter wasn't available), saving bandwidth!
        const heardVoiceRecently =
          !micAudioCtx || Date.now() - lastVoiceDetectedMs < 1500 || lastVoiceDetectedMs >= segStartMs - 600;
        if (stillLive && heardVoiceRecently && chunks.length > 0 && needsRelayForAnyPeer(user.uid)) {
          const finalMime = rec.mimeType || mime || 'audio/webm';
          const blob = new Blob(chunks, { type: finalMime });
          if (blob.size > 200 && blob.size < 45000) {
            void blobToBase64(blob)
              .then(async (b64) => {
                if (!coopState.active || coopState.roomCode !== code || !coopState.micOn) return;
                const sigRef = await push(ref(rtdb, `coop_rooms/${code}/signals`), {
                  from: user.uid,
                  to: 'all',
                  type: 'voice_chunk',
                  mime: finalMime,
                  b64,
                  createdAtMs: Date.now(),
                });
                // Auto-expire relay chunk after 8s so Realtime Database stays clean & tiny
                window.setTimeout(() => {
                  void remove(sigRef).catch(() => {});
                }, 8000);
              })
              .catch(() => {});
          }
        }
        if (stillLive) {
          scheduleNextSegment(60);
        }
      };

      rec.onerror = () => {
        if (activeRelayRecorder === rec) activeRelayRecorder = null;
        if (coopState.active && coopState.micOn) scheduleNextSegment(900);
      };

      rec.start();
      relayLoopTimer = window.setTimeout(() => {
        relayLoopTimer = null;
        try {
          if (rec.state !== 'inactive') rec.stop();
        } catch {
          // Ignore
        }
      }, 850);
    } catch {
      activeRelayRecorder = null;
      scheduleNextSegment(1500);
    }
  };

  // Give WebRTC P2P a short head start (1.2s) before starting relay segments
  scheduleNextSegment(1200);
}

async function playIncomingRelayChunk(_fromUid: string, mime: string, b64: string): Promise<void> {
  const outGain = getEffectiveVoiceOutGain();
  if (outGain <= 0) return;
  try {
    const bytes = base64ToUint8Array(b64);
    const ctx = getOrUnlockRemotePlaybackCtx();
    if (ctx && ctx.state === 'running') {
      try {
        const arrBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const audioBuf = await ctx.decodeAudioData(arrBuf);
        const src = ctx.createBufferSource();
        src.buffer = audioBuf;
        if (remotePlaybackGain) {
          remotePlaybackGain.gain.value = getEffectiveVoiceOutGain();
          src.connect(remotePlaybackGain);
        } else {
          src.connect(ctx.destination);
        }
        const startAt = Math.max(ctx.currentTime + 0.01, remoteChunkPlayCursor);
        src.start(startAt);
        remoteChunkPlayCursor = startAt + audioBuf.duration;
        return;
      } catch {
        // Fallback to HTMLAudioElement if decodeAudioData doesn't support this container
      }
    }

    const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
      type: mime || 'audio/webm',
    });
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    el.volume = getEffectiveVoiceOutGain();
    el.onended = () => URL.revokeObjectURL(url);
    el.onerror = () => URL.revokeObjectURL(url);
    await el.play().catch(() => {
      URL.revokeObjectURL(url);
    });
  } catch {
    // Ignore malformed/unsupported chunk
  }
}

function stopLocalMicrophoneInternal(): void {
  stopMicLevelMonitor();
  stopVoiceRelayLoop();
  if (rawMicStream) {
    for (const track of rawMicStream.getTracks()) {
      track.stop();
    }
    rawMicStream = null;
  }
  if (localAudioStream) {
    for (const track of localAudioStream.getTracks()) {
      track.stop();
    }
    localAudioStream = null;
  }
  micInputGainNode = null;
  micProcessedDest = null;
  if (micProcessCtx) {
    void micProcessCtx.close().catch(() => {});
    micProcessCtx = null;
  }
  // Mute audio senders cleanly so re-enabling mic later works with replaceTrack
  for (const pc of peerConnections.values()) {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind === 'audio' || sender.track === null) {
        void sender.replaceTrack(null).catch(() => {});
      }
    }
  }
}

/**
 * Unlocks/resumes Web Audio + any remote teammate <audio> streams after ANY user gesture.
 */
export function resumeRemoteCoopAudio(): void {
  getOrUnlockRemotePlaybackCtx();
  applyVoiceOutVolumeToAll();
  if (micProcessCtx && micProcessCtx.state === 'suspended') {
    void micProcessCtx.resume().catch(() => {});
  }
  for (const el of remoteAudioEls.values()) {
    if (el.paused && el.srcObject) {
      void el.play().catch(() => {});
    }
  }
}

async function flushPendingIceCandidates(peerUid: string, pc: RTCPeerConnection): Promise<void> {
  const queue = pendingIceCandidates.get(peerUid);
  if (!queue || queue.length === 0) return;
  pendingIceCandidates.delete(peerUid);
  for (const cand of queue) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(cand));
    } catch {
      // Ignore stale candidate
    }
  }
}

async function ensureSendRecvAudioTrack(pc: RTCPeerConnection): Promise<void> {
  if (!localAudioStream || !coopState.micOn) return;
  const audioTrack = localAudioStream.getAudioTracks()[0];
  if (!audioTrack) return;

  const transceivers = pc.getTransceivers();
  const audioTransceiver = transceivers.find(
    (tr) => tr.sender.track?.kind === 'audio' || tr.receiver.track?.kind === 'audio'
  );
  if (audioTransceiver) {
    // CRITICAL: Flip recvonly -> sendrecv so replying peers actually transmit audio back!
    audioTransceiver.direction = 'sendrecv';
    await audioTransceiver.sender.replaceTrack(audioTrack);
  } else {
    pc.addTransceiver(audioTrack, {
      direction: 'sendrecv',
      streams: [localAudioStream],
    });
  }
}

function setupPeerDataChannel(peerUid: string, dc: RTCDataChannel): void {
  peerDataChannels.set(peerUid, dc);
  dc.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return;
    if (ev.data.startsWith('W:')) {
      if (coopState.role !== 'guest') return;
      try {
        const parsed = JSON.parse(ev.data.slice(2)) as WorldState;
        parsed.mode = 'playing';
        parsed.localPlayerUid = authCloudState.user?.uid;
        latestGuestWorldSnapshot = parsed;
      } catch {
        // Ignore malformed snapshot frame
      }
    } else if (ev.data.startsWith('I:')) {
      if (coopState.role !== 'host') return;
      try {
        const d = JSON.parse(ev.data.slice(2)) as Record<string, unknown>;
        remoteRawInputs.set(peerUid, {
          left: d.left === true,
          right: d.right === true,
          sprint: d.sprint === true,
          dropSeq: typeof d.dropSeq === 'number' ? d.dropSeq : 0,
          powerSeq: typeof d.powerSeq === 'number' ? d.powerSeq : 0,
          weaponSeq: typeof d.weaponSeq === 'number' ? d.weaponSeq : 0,
          updatedAtMs: typeof d.updatedAtMs === 'number' ? d.updatedAtMs : Date.now(),
        });
      } catch {
        // Ignore malformed input frame
      }
    }
  };
  dc.onclose = () => {
    if (peerDataChannels.get(peerUid) === dc) {
      peerDataChannels.delete(peerUid);
    }
  };
}

function getOrCreatePeerConnection(code: string, myUid: string, peerUid: string): RTCPeerConnection {
  const existing = peerConnections.get(peerUid);
  if (existing && existing.connectionState !== 'closed' && existing.connectionState !== 'failed') {
    return existing;
  }
  if (existing) {
    try {
      existing.close();
    } catch {
      // Ignore
    }
    peerConnections.delete(peerUid);
    peerDataChannels.delete(peerUid);
  }

  const pc = new RTCPeerConnection(RTC_CONFIG);
  peerConnections.set(peerUid, pc);

  pc.ondatachannel = (ev) => {
    if (ev.channel.label === 'coop_sync') {
      setupPeerDataChannel(peerUid, ev.channel);
    }
  };

  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    const rtdb = getRealtimeDb();
    if (!rtdb) return;
    void push(ref(rtdb, `coop_rooms/${code}/signals`), {
      from: myUid,
      to: peerUid,
      type: 'ice',
      candidate: ev.candidate.toJSON(),
      createdAtMs: Date.now(),
    }).catch(() => {});
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed' && coopState.active && (coopState.micOn || coopState.role === 'host')) {
      void attachLocalAudioAndOffer(code, myUid, peerUid, true);
    }
  };

  pc.ontrack = (ev) => {
    const stream = ev.streams[0] ?? new MediaStream([ev.track]);
    let audioEl = remoteAudioEls.get(peerUid);
    const outGain = getEffectiveVoiceOutGain();
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.volume = outGain;
      audioEl.muted = outGain <= 0;
      audioEl.setAttribute('playsinline', 'true');
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
      remoteAudioEls.set(peerUid, audioEl);
    } else {
      audioEl.volume = outGain;
      audioEl.muted = outGain <= 0;
    }
    audioEl.srcObject = stream;
    void audioEl.play().catch(() => {});
  };

  return pc;
}

async function attachLocalAudioAndOffer(
  code: string,
  myUid: string,
  peerUid: string,
  iceRestart = false
): Promise<void> {
  const rtdb = getRealtimeDb();
  if (!rtdb) return;
  try {
    const pc = getOrCreatePeerConnection(code, myUid, peerUid);
    if (coopState.role === 'host' && !peerDataChannels.has(peerUid)) {
      try {
        const dc = pc.createDataChannel('coop_sync', { ordered: false, maxRetransmits: 0 });
        setupPeerDataChannel(peerUid, dc);
      } catch {
        // Ignore if DataChannel cannot be created
      }
    }
    await ensureSendRecvAudioTrack(pc);
    const offer = await pc.createOffer({ offerToReceiveAudio: true, iceRestart });
    await pc.setLocalDescription(offer);
    await push(ref(rtdb, `coop_rooms/${code}/signals`), {
      from: myUid,
      to: peerUid,
      type: 'offer',
      sdp: offer.sdp ?? '',
      createdAtMs: Date.now(),
    });
  } catch (err) {
    console.warn('[Corona Co-op] Voice offer failed:', err);
  }
}

async function handleIncomingVoiceSignal(
  code: string,
  myUid: string,
  fromUid: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!fromUid || fromUid === myUid) return;
  const rtdb = getRealtimeDb();
  if (!rtdb) return;
  const sigType = String(data.type ?? '');

  try {
    const pc = getOrCreatePeerConnection(code, myUid, fromUid);
    if (sigType === 'offer' && typeof data.sdp === 'string') {
      // Polite-peer rollback prevents glare deadlock when both players open mic simultaneously
      if (pc.signalingState !== 'stable') {
        await pc.setLocalDescription({ type: 'rollback' });
      }
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      await flushPendingIceCandidates(fromUid, pc);

      // Attach local mic track in sendrecv mode if our mic is already ON
      await ensureSendRecvAudioTrack(pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await push(ref(rtdb, `coop_rooms/${code}/signals`), {
        from: myUid,
        to: fromUid,
        type: 'answer',
        sdp: answer.sdp ?? '',
        createdAtMs: Date.now(),
      });
    } else if (sigType === 'answer' && typeof data.sdp === 'string') {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        await flushPendingIceCandidates(fromUid, pc);
      }
    } else if (sigType === 'ice' && data.candidate) {
      const candInit = data.candidate as RTCIceCandidateInit;
      if (!pc.remoteDescription) {
        const list = pendingIceCandidates.get(fromUid) ?? [];
        list.push(candInit);
        pendingIceCandidates.set(fromUid, list);
      } else {
        await pc.addIceCandidate(new RTCIceCandidate(candInit));
      }
    }
  } catch (err) {
    console.warn('[Corona Co-op] Voice signal error:', err);
  }
}

/**
 * Toggles the player's microphone ON / OFF immediately during gameplay.
 * Uses direct WebRTC P2P when possible + automatic Realtime Database Opus relay fallback across CGNAT/4G/5G/firewalls!
 */
export async function toggleCoopMicrophone(): Promise<{
  ok: boolean;
  micOn: boolean;
  inRoom?: boolean;
  error?: string;
}> {
  const user = authCloudState.user;
  const rtdb = getRealtimeDb();
  const inRoom = Boolean(coopState.active && coopState.roomCode && user && rtdb);

  coopState.micError = null;
  resumeRemoteCoopAudio();

  if (coopState.micOn) {
    stopLocalMicrophoneInternal();
    coopState.micOn = false;
    coopState.speaking = false;
    if (inRoom && coopState.roomCode && user && rtdb) {
      void update(ref(rtdb, `coop_rooms/${coopState.roomCode}/members/${user.uid}`), {
        micOn: false,
      }).catch(() => {});
    }
    notify();
    return { ok: true, micOn: false, inRoom };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    coopState.micError = 'Microfone não suportado neste navegador (use HTTPS).';
    notify();
    return { ok: false, micOn: false, error: coopState.micError };
  }

  try {
    rawMicStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });

    // Route hardware mic through a live GainNode so the Menu "Meu Microfone" volume (0..5) adjusts gain in real time!
    try {
      const AudioCtxCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxCtor) {
        micProcessCtx = new AudioCtxCtor();
        if (micProcessCtx.state === 'suspended') {
          void micProcessCtx.resume().catch(() => {});
        }
        const micSrc = micProcessCtx.createMediaStreamSource(rawMicStream);
        micInputGainNode = micProcessCtx.createGain();
        micInputGainNode.gain.value = getEffectiveMicInputGain();
        micProcessedDest = micProcessCtx.createMediaStreamDestination();
        micSrc.connect(micInputGainNode);
        micInputGainNode.connect(micProcessedDest);
        localAudioStream = micProcessedDest.stream;
      } else {
        localAudioStream = rawMicStream;
        applyMicInputVolumeToPipeline();
      }
    } catch {
      localAudioStream = rawMicStream;
      applyMicInputVolumeToPipeline();
    }

    coopState.micOn = true;
    lastVoiceDetectedMs = Date.now();
    startMicLevelMonitor(localAudioStream);

    if (inRoom && coopState.roomCode && user && rtdb) {
      const code = coopState.roomCode;
      void update(ref(rtdb, `coop_rooms/${code}/members/${user.uid}`), {
        micOn: true,
      }).catch(() => {});

      for (const m of coopState.members) {
        if (m.uid === user.uid) continue;
        await attachLocalAudioAndOffer(code, user.uid, m.uid);
      }
      startVoiceRelayLoopIfNeeded();
    }

    notify();
    return { ok: true, micOn: true, inRoom };
  } catch (err) {
    stopLocalMicrophoneInternal();
    coopState.micOn = false;
    coopState.speaking = false;
    const errName = (err as { name?: string })?.name ?? '';
    coopState.micError =
      errName === 'NotFoundError'
        ? 'Nenhum microfone encontrado neste dispositivo.'
        : 'Permissão de microfone negada no navegador.';
    notify();
    return { ok: false, micOn: false, error: coopState.micError };
  }
}
