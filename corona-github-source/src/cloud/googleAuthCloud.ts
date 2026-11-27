import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import { FIREBASE_CONFIG, isAdminEmail, isFirebaseConfigured } from '../config/firebase';
import { isFeedbackAnswered, markFeedbackAnswered } from '../storage/feedbackSystem';
import {
  applyCloudSlotPayload,
  countSavedCampaigns,
  listRawSlotPayloads,
  migrateGuestSlotsIfEmpty,
  setCloudSaveHooks,
  setSaveAccountNamespace,
  type StoredSlotRaw,
} from '../storage/saveSystem';
import { type WorldState } from '../types';

export type PlayerPresenceStatus = 'menu' | 'playing' | 'paused' | 'offline';

export interface GooglePlayerUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  isAdmin: boolean;
}

export interface PlayerMetricRow {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  loginCount: number;
  totalPlaySeconds: number;
  status: PlayerPresenceStatus;
  currentIsland: number;
  currentDay: number;
  kingdomLevel: number;
  villagers: number;
  gold: number;
  diamonds: number;
  savedCampaignsCount: number;
  feedbackAnswered: boolean;
  lastActiveMs: number;
  lastLoginMs: number;
}

export interface AuthCloudState {
  configured: boolean;
  initialized: boolean;
  loading: boolean;
  syncing: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
  user: GooglePlayerUser | null;
  guestBypass: boolean;
  errorMessage: string | null;
  syncedSlotsCount: number;
}

export const authCloudState: AuthCloudState = {
  configured: isFirebaseConfigured(),
  initialized: !isFirebaseConfigured(),
  loading: isFirebaseConfigured(),
  syncing: false,
  syncStatus: isFirebaseConfigured() ? 'idle' : 'offline',
  user: null,
  guestBypass: false,
  errorMessage: null,
  syncedSlotsCount: 0,
};

type AuthListener = (state: AuthCloudState) => void;
const listeners = new Set<AuthListener>();

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

let sessionLoginRecordedUid: string | null = null;
let cachedTotalPlaySeconds = 0;
let pendingPlaySeconds = 0;
let telemetryFlushAccum = 0;
let lastSlotUploadAt = new Map<number, number>();
let pendingSlotUpload = new Map<number, StoredSlotRaw>();
let pendingSlotTimers = new Map<number, number>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn(authCloudState);
    } catch {
      // Ignore subscriber errors
    }
  }
}

export function subscribeAuthCloud(fn: AuthListener): () => void {
  listeners.add(fn);
  fn(authCloudState);
  return () => listeners.delete(fn);
}

/**
 * Returns true when the player is allowed to access campaign actions on the title screen.
 * When Firebase is configured, Google sign-in is required first.
 * Before Firebase keys are configured, the user can preview/play locally after tapping the fallback.
 */
export function isPlayerAuthorizedToPlay(): boolean {
  if (authCloudState.user !== null) return true;
  if (!authCloudState.configured && authCloudState.guestBypass) return true;
  return false;
}

function getDeviceInfo(): string {
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const lang = navigator.language || 'pt-BR';
  return `${isTouch ? 'Mobile' : 'Desktop'} · ${lang}`;
}

function toGooglePlayerUser(u: User): GooglePlayerUser {
  const email = u.email ?? '';
  return {
    uid: u.uid,
    email,
    displayName: u.displayName || email.split('@')[0] || 'Monarca',
    photoURL: u.photoURL ?? null,
    isAdmin: isAdminEmail(email),
  };
}

function timestampToMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as Timestamp).toMillis === 'function') {
    return (v as Timestamp).toMillis();
  }
  return 0;
}

async function uploadSlotImmediate(uid: string, raw: StoredSlotRaw): Promise<void> {
  if (!db) return;
  try {
    const ref = doc(db, 'players', uid, 'campaigns', `slot_${raw.slot}`);
    await setDoc(ref, {
      slot: raw.slot,
      version: 2,
      savedAt: raw.savedAt,
      island: raw.island,
      day: raw.day,
      kingdomLevel: raw.kingdomLevel,
      villagers: raw.villagers,
      gold: raw.gold,
      diamonds: raw.diamonds,
      payloadJson: raw.payloadJson,
      updatedAt: serverTimestamp(),
    });
    lastSlotUploadAt.set(raw.slot, Date.now());
    authCloudState.syncStatus = 'synced';
    notify();
  } catch (err) {
    console.warn('[Corona Cloud] Failed to upload campaign slot:', err);
    authCloudState.syncStatus = 'error';
    notify();
  }
}

function scheduleSlotUpload(raw: StoredSlotRaw): void {
  const user = authCloudState.user;
  if (!user || !db) return;

  const now = Date.now();
  const last = lastSlotUploadAt.get(raw.slot) ?? 0;
  pendingSlotUpload.set(raw.slot, raw);

  if (now - last >= 4000) {
    const existingTimer = pendingSlotTimers.get(raw.slot);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      pendingSlotTimers.delete(raw.slot);
    }
    pendingSlotUpload.delete(raw.slot);
    void uploadSlotImmediate(user.uid, raw);
    return;
  }

  if (!pendingSlotTimers.has(raw.slot)) {
    const wait = Math.max(500, 4000 - (now - last));
    const tid = window.setTimeout(() => {
      pendingSlotTimers.delete(raw.slot);
      const latest = pendingSlotUpload.get(raw.slot);
      pendingSlotUpload.delete(raw.slot);
      if (latest && authCloudState.user?.uid === user.uid) {
        void uploadSlotImmediate(user.uid, latest);
      }
    }, wait);
    pendingSlotTimers.set(raw.slot, tid);
  }
}

async function deleteSlotInCloud(slot: number): Promise<void> {
  const user = authCloudState.user;
  if (!user || !db) return;
  try {
    await deleteDoc(doc(db, 'players', user.uid, 'campaigns', `slot_${slot}`));
    await setDoc(
      doc(db, 'players', user.uid),
      {
        savedCampaignsCount: countSavedCampaigns(),
        lastActiveAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[Corona Cloud] Failed to delete campaign slot:', err);
  }
}

async function syncCampaignsAndProfileOnSignIn(user: GooglePlayerUser): Promise<void> {
  if (!db) return;
  authCloudState.syncing = true;
  authCloudState.syncStatus = 'syncing';
  authCloudState.errorMessage = null;
  notify();

  setSaveAccountNamespace(user.uid);

  try {
    // 1. Download existing cloud campaigns for this Google account
    const campaignsCol = collection(db, 'players', user.uid, 'campaigns');
    const snap = await getDocs(campaignsCol);
    const cloudBySlot = new Map<number, { savedAt: number; payloadJson: string }>();
    snap.forEach((docSnap) => {
      const data = docSnap.data() as { slot?: number; savedAt?: number; payloadJson?: string };
      if (typeof data.slot === 'number' && typeof data.payloadJson === 'string') {
        cloudBySlot.set(data.slot, {
          savedAt: data.savedAt ?? 0,
          payloadJson: data.payloadJson,
        });
      }
    });

    // If the Google account has no cloud saves yet, migrate any pre-login local saves on this device
    if (cloudBySlot.size === 0) {
      migrateGuestSlotsIfEmpty();
    }

    const localSlots = listRawSlotPayloads();
    const localBySlot = new Map<number, StoredSlotRaw>();
    for (const item of localSlots) {
      localBySlot.set(item.slot, item);
    }

    // 2. Bidirectional merge (newest savedAt wins per slot)
    let syncedCount = 0;
    const uploads: Promise<void>[] = [];

    for (const [slot, cloudItem] of cloudBySlot.entries()) {
      const localItem = localBySlot.get(slot);
      if (!localItem || cloudItem.savedAt >= localItem.savedAt) {
        if (applyCloudSlotPayload(slot, cloudItem.payloadJson)) {
          syncedCount++;
        }
      }
    }

    for (const [slot, localItem] of localBySlot.entries()) {
      const cloudItem = cloudBySlot.get(slot);
      if (!cloudItem || localItem.savedAt > cloudItem.savedAt) {
        uploads.push(uploadSlotImmediate(user.uid, localItem));
        syncedCount++;
      }
    }

    if (uploads.length > 0) {
      await Promise.all(uploads);
    }

    // 3. Read / upsert player profile & login metrics
    const playerRef = doc(db, 'players', user.uid);
    const playerSnap = await getDoc(playerRef);
    const existing = playerSnap.exists() ? (playerSnap.data() as Record<string, unknown>) : null;

    cachedTotalPlaySeconds = typeof existing?.totalPlaySeconds === 'number' ? existing.totalPlaySeconds : 0;

    // Sync feedback answered state across devices
    if (existing?.feedbackAnswered === true && !isFeedbackAnswered()) {
      markFeedbackAnswered();
    }

    const latestCampaign = listRawSlotPayloads().sort((a, b) => b.savedAt - a.savedAt)[0];
    const isNewSession = sessionLoginRecordedUid !== user.uid;
    sessionLoginRecordedUid = user.uid;

    const profileUpdate: Record<string, unknown> = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      status: 'menu',
      savedCampaignsCount: countSavedCampaigns(),
      feedbackAnswered: isFeedbackAnswered() || existing?.feedbackAnswered === true,
      deviceInfo: getDeviceInfo(),
      lastActiveAt: serverTimestamp(),
    };

    if (latestCampaign) {
      profileUpdate.currentIsland = latestCampaign.island;
      profileUpdate.currentDay = latestCampaign.day;
      profileUpdate.kingdomLevel = latestCampaign.kingdomLevel;
      profileUpdate.villagers = latestCampaign.villagers;
      profileUpdate.gold = latestCampaign.gold;
      profileUpdate.diamonds = latestCampaign.diamonds;
    }

    if (!existing) {
      profileUpdate.firstLoginAt = serverTimestamp();
      profileUpdate.loginCount = 1;
      profileUpdate.totalPlaySeconds = 0;
      profileUpdate.totalPlayHours = 0;
      profileUpdate.lastLoginAt = serverTimestamp();
    } else if (isNewSession) {
      profileUpdate.loginCount = increment(1);
      profileUpdate.lastLoginAt = serverTimestamp();
    }

    await setDoc(playerRef, profileUpdate, { merge: true });

    authCloudState.syncedSlotsCount = syncedCount;
    authCloudState.syncStatus = 'synced';
  } catch (err) {
    console.warn('[Corona Cloud] Sync failed:', err);
    authCloudState.syncStatus = 'error';
    authCloudState.errorMessage = 'Conectado, mas houve erro ao sincronizar a nuvem.';
  } finally {
    authCloudState.syncing = false;
    notify();
  }
}

/**
 * Initializes Firebase Auth & Firestore once at app startup.
 */
export function initGoogleAuthCloud(): void {
  setCloudSaveHooks({
    onSaveSlot: (raw) => scheduleSlotUpload(raw),
    onDeleteSlot: (slot) => {
      void deleteSlotInCloud(slot);
    },
  });

  if (!isFirebaseConfigured()) {
    authCloudState.configured = false;
    authCloudState.initialized = true;
    authCloudState.loading = false;
    authCloudState.syncStatus = 'offline';
    notify();
    return;
  }

  try {
    app = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);

    // Handle redirect sign-in return (mobile Safari / in-app browsers)
    void getRedirectResult(auth).catch((err) => {
      console.warn('[Corona Cloud] Redirect login notice:', err);
    });

    onAuthStateChanged(auth, (firebaseUser) => {
      authCloudState.initialized = true;
      authCloudState.loading = false;
      if (firebaseUser) {
        const playerUser = toGooglePlayerUser(firebaseUser);
        authCloudState.user = playerUser;
        authCloudState.guestBypass = false;
        authCloudState.errorMessage = null;
        notify();
        void syncCampaignsAndProfileOnSignIn(playerUser);
      } else {
        authCloudState.user = null;
        authCloudState.syncing = false;
        authCloudState.syncStatus = 'idle';
        setSaveAccountNamespace(null);
        sessionLoginRecordedUid = null;
        notify();
      }
    });
  } catch (err) {
    console.error('[Corona Cloud] Firebase init error:', err);
    authCloudState.initialized = true;
    authCloudState.loading = false;
    authCloudState.errorMessage = 'Erro ao iniciar conexão com o Google.';
    notify();
  }
}

/**
 * Triggers Google Sign-In when the player clicks the white Google pill button.
 */
export async function signInWithGoogleAccount(): Promise<void> {
  if (!authCloudState.configured || !auth) {
    authCloudState.errorMessage =
      'Configure as chaves do Firebase (VITE_FIREBASE_*) para ativar o login Google real.';
    notify();
    return;
  }

  authCloudState.loading = true;
  authCloudState.errorMessage = null;
  notify();

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    await signInWithPopup(auth, provider);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      try {
        await signInWithRedirect(auth, provider);
        return;
      } catch (redirErr) {
        console.warn('[Corona Cloud] Redirect sign-in failed:', redirErr);
      }
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      authCloudState.errorMessage = null;
    } else if (code === 'auth/unauthorized-domain') {
      authCloudState.errorMessage = 'Adicione este domínio em Firebase Auth → Domínios autorizados.';
    } else {
      authCloudState.errorMessage = 'Não foi possível conectar com o Google. Tente novamente.';
    }
    authCloudState.loading = false;
    notify();
  }
}

export function enableLocalGuestFallback(): void {
  if (authCloudState.configured) return;
  authCloudState.guestBypass = true;
  authCloudState.errorMessage = null;
  notify();
}

export async function signOutGoogleAccount(world?: WorldState): Promise<void> {
  if (world) {
    await flushCloudTelemetry(world, 'offline');
  }
  if (!auth) {
    authCloudState.guestBypass = false;
    authCloudState.user = null;
    setSaveAccountNamespace(null);
    notify();
    return;
  }
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('[Corona Cloud] Sign-out error:', err);
  }
}

/**
 * Accumulates active play seconds while playing and flushes telemetry every 60s.
 */
export function tickCloudTelemetry(dt: number, world: WorldState): void {
  if (!authCloudState.user || !db) return;
  if (world.mode !== 'playing') return;

  pendingPlaySeconds += dt;
  telemetryFlushAccum += dt;

  if (telemetryFlushAccum >= 60) {
    telemetryFlushAccum = 0;
    void flushCloudTelemetry(world, 'playing');
  }
}

/**
 * Flushes accumulated play time, current player status, and kingdom progress to Firestore.
 */
export async function flushCloudTelemetry(
  world: WorldState,
  statusOverride?: PlayerPresenceStatus
): Promise<void> {
  const user = authCloudState.user;
  if (!user || !db) return;

  const deltaSecs = Math.floor(pendingPlaySeconds);
  if (deltaSecs > 0) {
    pendingPlaySeconds -= deltaSecs;
    cachedTotalPlaySeconds += deltaSecs;
  }

  // Flush any queued campaign slot immediately as well
  for (const [slot, raw] of pendingSlotUpload.entries()) {
    const tid = pendingSlotTimers.get(slot);
    if (tid) {
      window.clearTimeout(tid);
      pendingSlotTimers.delete(slot);
    }
    pendingSlotUpload.delete(slot);
    void uploadSlotImmediate(user.uid, raw);
  }

  const derivedStatus: PlayerPresenceStatus =
    statusOverride ??
    (world.mode === 'playing'
      ? 'playing'
      : world.mode === 'paused'
        ? 'paused'
        : 'menu');

  const updatePayload: Record<string, unknown> = {
    status: derivedStatus,
    savedCampaignsCount: countSavedCampaigns(),
    feedbackAnswered: isFeedbackAnswered(),
    lastActiveAt: serverTimestamp(),
  };

  if (deltaSecs > 0) {
    updatePayload.totalPlaySeconds = increment(deltaSecs);
    updatePayload.totalPlayHours = Math.round((cachedTotalPlaySeconds / 3600) * 100) / 100;
  }

  if (world.crest.locked) {
    updatePayload.currentSlot = world.saveSlot;
    updatePayload.currentIsland = world.currentIsland;
    updatePayload.currentDay = world.day;
    updatePayload.kingdomLevel = world.hall?.level ?? 1;
    updatePayload.villagers = world.villagers.filter((v) => v.role !== 'wanderer').length;
    updatePayload.gold = world.monarchs[0]?.coins ?? world.resources.gold ?? 0;
    updatePayload.diamonds = world.monarchs[0]?.diamonds ?? world.resources.diamonds ?? 0;
  }

  try {
    await setDoc(doc(db, 'players', user.uid), updatePayload, { merge: true });
  } catch {
    // Silent fail on transient offline state
  }
}

/**
 * Admin-only query: loads player telemetry list for the in-game Painel de Jogadores.
 */
export async function fetchAllPlayersMetrics(): Promise<PlayerMetricRow[]> {
  if (!db || !authCloudState.user?.isAdmin) return [];
  const q = query(collection(db, 'players'), orderBy('lastActiveAt', 'desc'), limit(200));
  const snap = await getDocs(q);
  const rows: PlayerMetricRow[] = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data() as Record<string, unknown>;
    rows.push({
      uid: String(d.uid ?? docSnap.id),
      email: String(d.email ?? ''),
      displayName: String(d.displayName ?? 'Monarca'),
      photoURL: typeof d.photoURL === 'string' ? d.photoURL : null,
      loginCount: typeof d.loginCount === 'number' ? d.loginCount : 1,
      totalPlaySeconds: typeof d.totalPlaySeconds === 'number' ? d.totalPlaySeconds : 0,
      status: (d.status as PlayerPresenceStatus) ?? 'offline',
      currentIsland: typeof d.currentIsland === 'number' ? d.currentIsland : 1,
      currentDay: typeof d.currentDay === 'number' ? d.currentDay : 1,
      kingdomLevel: typeof d.kingdomLevel === 'number' ? d.kingdomLevel : 1,
      villagers: typeof d.villagers === 'number' ? d.villagers : 0,
      gold: typeof d.gold === 'number' ? d.gold : 0,
      diamonds: typeof d.diamonds === 'number' ? d.diamonds : 0,
      savedCampaignsCount: typeof d.savedCampaignsCount === 'number' ? d.savedCampaignsCount : 0,
      feedbackAnswered: d.feedbackAnswered === true,
      lastActiveMs: timestampToMs(d.lastActiveAt),
      lastLoginMs: timestampToMs(d.lastLoginAt),
    });
  });
  return rows;
}
