import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  type CommunityReportReason,
  buildCommunityReportFormUrl,
  isCustomReportFormConfigured,
} from '../config/reportForm';
import { FIREBASE_CONFIG } from '../config/firebase';
import {
  CENTER_X,
  GROUND_Y,
  type CharacterAppearance,
  type InputState,
  type Monarch,
  type WorldState,
} from '../types';
import { authCloudState, getCurrentAuthIdToken, getFirestoreDb } from './googleAuthCloud';

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
let membersUnsub: Unsubscribe | null = null;
let inputsUnsub: Unsubscribe | null = null;
let messagesUnsub: Unsubscribe | null = null;
let signalsUnsub: Unsubscribe | null = null;

// Host-side tracking of guest inputs
const remoteRawInputs = new Map<string, RemoteGuestInputSnapshot>();
const processedDropSeq = new Map<string, number>();
const processedPowerSeq = new Map<string, number>();
let lastHostBroadcastMs = 0;

// Guest-side tracking of outgoing input & incoming world snapshot
let guestDropSeq = 0;
let guestPowerSeq = 0;
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
  const db = getFirestoreDb();
  const user = authCloudState.user;
  if (!db || !user) return { banned: false };
  try {
    const snap = await withTimeout(
      getDoc(doc(db, 'community_bans', user.uid)),
      2500,
      'timeout-ban-check'
    );
    if (!snap.exists()) return { banned: false };
    const data = snap.data() as Record<string, unknown>;
    if (data.banned === true) {
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
  const db = getFirestoreDb();
  if (!user || !db) {
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
    const roomSnap = await getDoc(doc(db, 'coop_rooms', code));
    if (!roomSnap.exists()) {
      return { ok: false, error: 'Sala não encontrada. Confira o código com o Host.' };
    }
    const room = roomSnap.data() as Record<string, unknown>;
    if (room.active !== true) {
      return { ok: false, error: 'O Host já encerrou esta sessão Co-op.' };
    }
    const kicked = Array.isArray(room.kickedUids) ? (room.kickedUids as string[]) : [];
    if (kicked.includes(user.uid)) {
      return { ok: false, error: 'Você foi removido desta campanha pelo Host.' };
    }
    const membersSnap = await getDocs(collection(db, 'coop_rooms', code, 'members'));
    const alreadyIn = membersSnap.docs.some((d) => d.id === user.uid);
    if (!alreadyIn && membersSnap.size >= MAX_COOP_PLAYERS) {
      return { ok: false, error: `Sala lotada (máximo ${MAX_COOP_PLAYERS} jogadores por campanha).` };
    }
    return {
      ok: true,
      code,
      hostName: typeof room.hostName === 'string' ? room.hostName : 'Host',
    };
  } catch (err) {
    console.warn('[Corona Co-op] Validate room error:', err);
    return { ok: false, error: 'Erro de conexão com o servidor Co-op. Tente novamente.' };
  }
}

function cleanupSubscriptionsAndAudio(): void {
  roomUnsub?.();
  membersUnsub?.();
  inputsUnsub?.();
  messagesUnsub?.();
  signalsUnsub?.();
  roomUnsub = null;
  membersUnsub = null;
  inputsUnsub = null;
  messagesUnsub = null;
  signalsUnsub = null;

  remoteRawInputs.clear();
  processedDropSeq.clear();
  processedPowerSeq.clear();
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
  // Keep snapshot compact & fast for Firestore (< 100 KB) by stripping nested other-island snapshots & snow particles
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
  const db = getFirestoreDb();
  if (!db) return;

  roomConnectedAtMs = Date.now();

  // 1. Live Members list
  membersUnsub = onSnapshot(collection(db, 'coop_rooms', code, 'members'), (snap) => {
    const list: CoopMember[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      list.push({
        uid: String(d.uid ?? docSnap.id),
        email: String(d.email ?? ''),
        displayName: String(d.displayName ?? 'Monarca'),
        photoURL: typeof d.photoURL === 'string' ? d.photoURL : null,
        role: d.role === 'host' ? 'host' : 'guest',
        appearance: (d.appearance as CharacterAppearance) ?? {
          gender: 'king',
          name: String(d.displayName ?? 'Monarca'),
          outfitIndex: 0,
          hairIndex: 0,
          horseIndex: 0,
          crownIndex: 0,
        },
        micOn: d.micOn === true,
        joinedAtMs: typeof d.joinedAtMs === 'number' ? d.joinedAtMs : 0,
      });
    });
    list.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'host' ? -1 : 1;
      return a.joinedAtMs - b.joinedAtMs;
    });
    coopState.members = list;

    // Clean up disconnected WebRTC peers & offer connections to newly joined peers if mic is active
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
    // Host proactively opens P2P (DataChannel + audio) to newly joined guests to avoid Firestore write quota burn!
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

  // 2. Live Text Chat messages
  const msgQ = query(
    collection(db, 'coop_rooms', code, 'messages'),
    orderBy('createdAtMs', 'asc'),
    limit(60)
  );
  messagesUnsub = onSnapshot(
    msgQ,
    (snap) => {
      const prevCount = coopState.messages.length;
      const msgs: CoopChatMessage[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data() as Record<string, unknown>;
        msgs.push({
          id: docSnap.id,
          uid: String(d.uid ?? ''),
          email: String(d.email ?? ''),
          displayName: String(d.displayName ?? 'Monarca'),
          text: String(d.text ?? ''),
          createdAtMs: typeof d.createdAtMs === 'number' ? d.createdAtMs : 0,
        });
      });
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
      console.warn('[Corona Co-op] Chat snapshot error:', err);
    }
  );

  // 3. Ordered Live Voice Signaling & Relay channel (WebRTC offer/answer/ICE + CGNAT-proof Opus voice_chunk!)
  const sigQ = query(
    collection(db, 'coop_rooms', code, 'signals'),
    orderBy('createdAtMs', 'asc')
  );
  signalsUnsub = onSnapshot(
    sigQ,
    (snap) => {
      snap.docChanges().forEach((chg) => {
        if (chg.type !== 'added') return;
        const sigId = chg.doc.id;
        if (processedSignalIds.has(sigId)) return;
        const d = chg.doc.data() as Record<string, unknown>;
        const createdAtMs = typeof d.createdAtMs === 'number' ? d.createdAtMs : 0;
        const toUid = String(d.to ?? '');
        const fromUid = String(d.from ?? '');
        const sigType = String(d.type ?? '');

        // Ignore & prune stale signals from earlier sessions
        if (createdAtMs > 0 && createdAtMs < roomConnectedAtMs - 10000) {
          processedSignalIds.add(sigId);
          if (Date.now() - createdAtMs > 25000) {
            void deleteDoc(chg.doc.ref).catch(() => {});
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

        // Serialize WebRTC offer/answer/ICE strictly in chronological order per peer!
        enqueuePeerSignal(fromUid, async () => {
          await handleIncomingVoiceSignal(code, myUid, fromUid, d);
          if (toUid === myUid) {
            void deleteDoc(chg.doc.ref).catch(() => {});
          }
        });
      });
    },
    (err) => {
      console.warn('[Corona Co-op] Voice signal snapshot error:', err);
    }
  );
}

/**
 * HOST ONLY: Opens the player's current campaign to online Co-op (up to 4 players) and generates a room code.
 */
export async function hostOpenCoopRoom(
  world: WorldState,
  onProgress?: (msg: string) => void
): Promise<{ ok: boolean; code?: string; error?: string }> {
  const user = authCloudState.user;
  const db = getFirestoreDb();
  if (!user) {
    return { ok: false, error: 'Conecte sua conta Google para abrir o Co-op online.' };
  }
  if (!db) {
    return { ok: false, error: 'Banco Firestore não inicializado. Recarregue a página.' };
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

  try {
    await withTimeout(
      setDoc(doc(db, 'coop_rooms', code), {
        code,
        hostUid: user.uid,
        hostEmail: safeEmail,
        hostName: safeName,
        hostPhoto: safePhoto,
        active: true,
        maxPlayers: MAX_COOP_PLAYERS,
        kickedUids: [],
        worldSnapshotJson: snapshotJson,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      9000,
      'timeout-create-room'
    );

    await withTimeout(
      setDoc(doc(db, 'coop_rooms', code, 'members', user.uid), {
        uid: user.uid,
        email: safeEmail,
        displayName: safeName,
        photoURL: safePhoto,
        role: 'host',
        appearance: safeAppearance,
        micOn: Boolean(coopState.micOn),
        joinedAtMs: Date.now(),
      }),
      9000,
      'timeout-create-member'
    );

    coopState.active = true;
    coopState.role = 'host';
    coopState.roomCode = code;
    coopState.hostUid = user.uid;
    coopState.hostName = safeName;

    subscribeCommonRoomChannels(code, user.uid);

    // Host listens to guest inputs in real time
    inputsUnsub = onSnapshot(collection(db, 'coop_rooms', code, 'inputs'), (snap) => {
      snap.forEach((docSnap) => {
        const uid = docSnap.id;
        if (uid === user.uid) return;
        const d = docSnap.data() as Record<string, unknown>;
        remoteRawInputs.set(uid, {
          left: d.left === true,
          right: d.right === true,
          sprint: d.sprint === true,
          dropSeq: typeof d.dropSeq === 'number' ? d.dropSeq : 0,
          powerSeq: typeof d.powerSeq === 'number' ? d.powerSeq : 0,
          updatedAtMs: typeof d.updatedAtMs === 'number' ? d.updatedAtMs : 0,
        });
      });
    });

    notify();
    return { ok: true, code };
  } catch (err) {
    console.warn('[Corona Co-op] Failed to open room:', err);
    resetCoopState(true);
    const errCode = (err as { code?: string })?.code ?? '';
    const errMsg = (err as { message?: string })?.message ?? '';
    if (errCode === 'resource-exhausted') {
      return {
        ok: false,
        error:
          'Cota diária gratuita do Firestore atingida (20.000 gravações/dia)! Reinicia às 04h (Brasília) ou ative o plano Blaze no Firebase.',
      };
    }
    if (errCode === 'permission-denied') {
      return {
        ok: false,
        error: 'Permissão negada no Firestore (publique as Regras do Firestore para coop_rooms).',
      };
    }
    if (errMsg.startsWith('timeout-')) {
      onProgress?.('Diagnosticando resposta do Firestore...');
      const diag = await diagnoseFirestoreTimeout(code);
      return { ok: false, error: diag };
    }
    const detail = errCode
      ? `Erro Firebase (${errCode}): ${errMsg.slice(0, 80)}`
      : `Erro ao criar sala: ${errMsg.slice(0, 90) || 'verifique sua conexão.'}`;
    return { ok: false, error: detail };
  }
}

async function diagnoseFirestoreTimeout(code: string): Promise<string> {
  try {
    const token = await getCurrentAuthIdToken();
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_CONFIG.projectId)}/databases/(default)/documents/coop_rooms/${encodeURIComponent(code)}?updateMask.fieldPaths=active`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await withTimeout(
      fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: { active: { booleanValue: false } } }),
      }),
      5000,
      'rest-timeout'
    );
    if (res.status === 429) {
      return 'Cota diária gratuita do Firestore atingida (20.000 gravações/dia)! Reinicia às 04h (Brasília) ou ative o plano Blaze no Firebase.';
    }
    if (res.status === 403) {
      return 'Permissão negada no Firestore (HTTP 403). Publique as Regras do Firestore incluindo coop_rooms.';
    }
    if (res.status === 401) {
      return 'Sessão Google expirada (HTTP 401). Saia da conta Google no menu e faça login novamente.';
    }
    if (res.status === 404) {
      return 'Banco Firestore não encontrado (HTTP 404). Verifique se o Cloud Firestore está criado no Firebase.';
    }
    if (res.ok) {
      return 'Firestore respondeu via HTTPS, mas o canal em tempo real demorou. Recarregue a página e tente novamente.';
    }
    const bodyText = (await res.text().catch(() => '')).slice(0, 120);
    return `Firestore respondeu HTTP ${res.status}: ${bodyText || res.statusText}`;
  } catch {
    return 'Sem resposta do servidor Firestore. Verifique sua conexão com a internet ou bloqueadores de rede/VPN.';
  }
}

/**
 * HOST ONLY: Closes the Co-op room, disconnects guests, and keeps 100% of campaign progress on the Host.
 */
export async function hostCloseCoopRoom(world?: WorldState): Promise<void> {
  if (!coopState.active || coopState.role !== 'host' || !coopState.roomCode) return;
  const db = getFirestoreDb();
  const code = coopState.roomCode;
  if (world && world.monarchs.length > 1) {
    world.monarchs = [world.monarchs[0]];
  }
  resetCoopState();
  if (db) {
    try {
      await setDoc(
        doc(db, 'coop_rooms', code),
        { active: false, closedAt: serverTimestamp(), updatedAt: serverTimestamp() },
        { merge: true }
      );
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
  const db = getFirestoreDb();
  if (!db) return false;
  const code = coopState.roomCode;
  try {
    await setDoc(
      doc(db, 'coop_rooms', code),
      { kickedUids: arrayUnion(targetUid), updatedAt: serverTimestamp() },
      { merge: true }
    );
    await deleteDoc(doc(db, 'coop_rooms', code, 'members', targetUid));
    await deleteDoc(doc(db, 'coop_rooms', code, 'inputs', targetUid));
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
  const db = getFirestoreDb();
  if (!user || !db) return { ok: false, error: 'Conta Google necessária.' };

  const code = validation.code;
  resetCoopState(true);

  try {
    const roomSnap = await getDoc(doc(db, 'coop_rooms', code));
    if (!roomSnap.exists()) return { ok: false, error: 'Sala não encontrada.' };
    const roomData = roomSnap.data() as Record<string, unknown>;
    if (roomData.active !== true) return { ok: false, error: 'Sala encerrada pelo Host.' };

    const safeApp = sanitizeAppearance(appearance);
    const safeName = user.displayName || safeApp.name || 'Monarca';
    const memberAppearance: CharacterAppearance = {
      ...safeApp,
      name: safeApp.name.trim() || safeName,
    };

    await setDoc(doc(db, 'coop_rooms', code, 'members', user.uid), {
      uid: user.uid,
      email: user.email || '',
      displayName: safeName,
      photoURL: user.photoURL ?? null,
      role: 'guest',
      appearance: memberAppearance,
      micOn: Boolean(coopState.micOn),
      joinedAtMs: Date.now(),
    });

    coopState.active = true;
    coopState.role = 'guest';
    coopState.roomCode = code;
    coopState.hostUid = String(roomData.hostUid ?? '');
    coopState.hostName = String(roomData.hostName ?? 'Host');

    let initialWorld: WorldState | undefined;
    if (typeof roomData.worldSnapshotJson === 'string') {
      try {
        initialWorld = JSON.parse(roomData.worldSnapshotJson) as WorldState;
        initialWorld.mode = 'playing';
        initialWorld.localPlayerUid = user.uid;
      } catch {
        // Wait for next snapshot
      }
    }

    subscribeCommonRoomChannels(code, user.uid);

    // Guest subscribes to room document for live world snapshots & kick/close events
    roomUnsub = onSnapshot(doc(db, 'coop_rooms', code), (docSnap) => {
      if (!docSnap.exists()) {
        resetCoopState();
        onGuestForceExit?.('A sala Co-op foi encerrada.');
        return;
      }
      const d = docSnap.data() as Record<string, unknown>;
      if (d.active !== true) {
        resetCoopState();
        onGuestForceExit?.('O Host encerrou o modo Co-op.');
        return;
      }
      const kicked = Array.isArray(d.kickedUids) ? (d.kickedUids as string[]) : [];
      if (kicked.includes(user.uid)) {
        resetCoopState();
        onGuestForceExit?.('Você foi removido da campanha pelo Host.');
        return;
      }
      if (typeof d.worldSnapshotJson === 'string') {
        try {
          const parsed = JSON.parse(d.worldSnapshotJson) as WorldState;
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
  const db = getFirestoreDb();
  const user = authCloudState.user;
  const code = coopState.roomCode;
  resetCoopState();
  if (db && user) {
    try {
      await deleteDoc(doc(db, 'coop_rooms', code, 'members', user.uid));
      await deleteDoc(doc(db, 'coop_rooms', code, 'inputs', user.uid));
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
      const spawnX = Math.max(160, Math.min(2400, (hostMonarch.x || CENTER_X) + (idx % 2 === 0 ? -24 : 24) * (idx + 1)));
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
    const dropTriggered = Boolean(raw && raw.dropSeq > prevDrop);
    const powerTriggered = Boolean(raw && raw.powerSeq > prevPower);
    if (raw) {
      processedDropSeq.set(guest.uid, raw.dropSeq);
      processedPowerSeq.set(guest.uid, raw.powerSeq);
    }

    remoteInputs.set(guest.uid, {
      left: Boolean(raw?.left),
      right: Boolean(raw?.right),
      leftJustPressed: false,
      rightJustPressed: false,
      sprint: Boolean(raw?.sprint),
      powerJustPressed: powerTriggered,
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

    const db = getFirestoreDb();
    if (db && anyGuestNeedsFirestore && now - lastHostBroadcastMs >= 650) {
      lastHostBroadcastMs = now;
      const code = coopState.roomCode;
      void setDoc(
        doc(db, 'coop_rooms', code),
        {
          worldSnapshotJson: cachedSnap ?? makeSlimSnapshot(world),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {
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

  // Send local inputs when changed or on action edge (drop / power)
  if (localInput.dropJustPressed) guestDropSeq += 1;
  if (localInput.powerJustPressed) guestPowerSeq += 1;

  const key = `${localInput.left ? 1 : 0}${localInput.right ? 1 : 0}${localInput.sprint ? 1 : 0}:${guestDropSeq}:${guestPowerSeq}`;
  const now = performance.now();
  const db = getFirestoreDb();
  const user = authCloudState.user;

  if (user && key !== lastSentInputKey) {
    const payload = {
      left: localInput.left,
      right: localInput.right,
      sprint: localInput.sprint,
      dropSeq: guestDropSeq,
      powerSeq: guestPowerSeq,
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
    } else if (db && now - lastGuestInputMs >= 140) {
      lastSentInputKey = key;
      lastGuestInputMs = now;
      void setDoc(doc(db, 'coop_rooms', coopState.roomCode, 'inputs', user.uid), payload).catch(() => {
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
 * Sends a text chat message:
 * - In an active Co-op room: syncs in real time via Firestore to all players in the room.
 * - Solo (before opening Co-op): appends locally so the chat drawer works immediately and invites opening Co-op.
 */
export async function sendCoopChatMessage(
  rawText: string
): Promise<{ ok: boolean; localOnly?: boolean; error?: string }> {
  const text = rawText.trim().slice(0, 180);
  if (!text) return { ok: false };

  const user = authCloudState.user;
  const senderName = user?.displayName || 'Você';

  // Solo / before Co-op room is opened: show message locally immediately so chat works right away
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

  const db = getFirestoreDb();
  if (!db || !user) {
    return { ok: false, error: 'Conecte sua conta Google para enviar mensagens no Co-op.' };
  }

  try {
    await addDoc(collection(db, 'coop_rooms', coopState.roomCode, 'messages'), {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      text,
      createdAtMs: Date.now(),
      createdAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    console.warn('[Corona Co-op] Failed to send chat message:', err);
    return { ok: false, error: 'Sem permissão no Firestore para enviar chat. Publique as Regras do Firestore.' };
  }
}

/**
 * Reports & IMMEDIATELY BANS a player from the Co-op community, kicks them from the room,
 * records the complaint in Firestore for Admin review, and opens the Google Form!
 */
export async function reportAndBanCoopPlayer(
  target: CoopMember,
  reason: CommunityReportReason,
  details: string,
  world?: WorldState
): Promise<{ ok: boolean; formUrl: string; customFormConfigured: boolean; error?: string }> {
  const db = getFirestoreDb();
  const me = authCloudState.user;
  const formUrl = buildCommunityReportFormUrl({
    reporterEmail: me?.email ?? '',
    reportedEmail: target.email,
    reason,
    details,
  });

  if (!db || !me) {
    return {
      ok: false,
      formUrl,
      customFormConfigured: isCustomReportFormConfigured(),
      error: 'Conecte sua conta Google para enviar denúncias.',
    };
  }

  try {
    const nowMs = Date.now();
    const record: CommunityBanRecord = {
      uid: target.uid,
      email: target.email,
      displayName: target.displayName,
      photoURL: target.photoURL,
      banned: true,
      reason,
      details: details.trim().slice(0, 400),
      reporterUid: me.uid,
      reporterEmail: me.email,
      reporterName: me.displayName,
      roomCode: coopState.roomCode ?? 'COOP',
      createdAtMs: nowMs,
    };

    // 1. Immediately ban the reported player in community_bans/{uid}
    await setDoc(doc(db, 'community_bans', target.uid), {
      ...record,
      createdAt: serverTimestamp(),
    });

    // 2. Append immutable report log in community_reports
    await addDoc(collection(db, 'community_reports'), {
      ...record,
      createdAt: serverTimestamp(),
    });

    // 3. Immediately remove them from the active room
    if (coopState.active && coopState.roomCode) {
      await setDoc(
        doc(db, 'coop_rooms', coopState.roomCode),
        { kickedUids: arrayUnion(target.uid), updatedAt: serverTimestamp() },
        { merge: true }
      );
      await deleteDoc(doc(db, 'coop_rooms', coopState.roomCode, 'members', target.uid));
      await deleteDoc(doc(db, 'coop_rooms', coopState.roomCode, 'inputs', target.uid));
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
  const db = getFirestoreDb();
  if (!db || !authCloudState.user?.isAdmin) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'community_bans'), orderBy('createdAtMs', 'desc'), limit(100))
    );
    const rows: CommunityBanRecord[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      rows.push({
        uid: String(d.uid ?? docSnap.id),
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
    });
    return rows;
  } catch {
    return [];
  }
}

/**
 * ADMIN ONLY (guillermes.mozzer@gmail.com): Re-authorizes a banned player to enter the Co-op community again.
 */
export async function adminUnbanCommunityPlayer(targetUid: string): Promise<boolean> {
  const db = getFirestoreDb();
  const me = authCloudState.user;
  if (!db || !me?.isAdmin) return false;
  try {
    await setDoc(
      doc(db, 'community_bans', targetUid),
      {
        banned: false,
        unbannedBy: me.email,
        unbannedAtMs: Date.now(),
        unbannedAt: serverTimestamp(),
      },
      { merge: true }
    );
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
    const db = getFirestoreDb();
    const code = coopState.roomCode;
    if (!coopState.active || !code || !coopState.micOn || !localAudioStream || !user || !db) {
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
                const docRef = await addDoc(collection(db, 'coop_rooms', code, 'signals'), {
                  from: user.uid,
                  to: 'all',
                  type: 'voice_chunk',
                  mime: finalMime,
                  b64,
                  createdAtMs: Date.now(),
                });
                // Auto-expire relay chunk after 10s so Firestore stays clean & tiny
                window.setTimeout(() => {
                  void deleteDoc(docRef).catch(() => {});
                }, 10000);
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
    const db = getFirestoreDb();
    if (!db) return;
    void addDoc(collection(db, 'coop_rooms', code, 'signals'), {
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
  const db = getFirestoreDb();
  if (!db) return;
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
    await addDoc(collection(db, 'coop_rooms', code, 'signals'), {
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
  const db = getFirestoreDb();
  if (!db) return;
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
      await addDoc(collection(db, 'coop_rooms', code, 'signals'), {
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
 * Uses direct WebRTC P2P when possible + automatic Firestore Opus relay fallback across CGNAT/4G/5G/firewalls!
 */
export async function toggleCoopMicrophone(): Promise<{
  ok: boolean;
  micOn: boolean;
  inRoom?: boolean;
  error?: string;
}> {
  const user = authCloudState.user;
  const db = getFirestoreDb();
  const inRoom = Boolean(coopState.active && coopState.roomCode && user && db);

  coopState.micError = null;
  resumeRemoteCoopAudio();

  if (coopState.micOn) {
    stopLocalMicrophoneInternal();
    coopState.micOn = false;
    coopState.speaking = false;
    if (inRoom && coopState.roomCode && user && db) {
      void setDoc(
        doc(db, 'coop_rooms', coopState.roomCode, 'members', user.uid),
        { micOn: false },
        { merge: true }
      ).catch(() => {});
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

    if (inRoom && coopState.roomCode && user && db) {
      const code = coopState.roomCode;
      void setDoc(
        doc(db, 'coop_rooms', code, 'members', user.uid),
        { micOn: true },
        { merge: true }
      ).catch(() => {});

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
