import { get, onValue, ref, set, update, type Unsubscribe } from 'firebase/database';
import { type WorldState } from '../types';
import { authCloudState, getRealtimeDb, type GooglePlayerUser } from './googleAuthCloud';

export const WHATSAPP_COMMUNITY_URL = 'https://chat.whatsapp.com/CgscPhZwV0rKAXZGdkzRUJ';
export const GAME_PUBLIC_URL = 'https://guillermesmozzer.github.io/corona-sagas/';

export const WHATSAPP_DIAMOND_REWARD = 3;
export const FIRST_TIER_REFERRAL_REWARD = 3;
export const NEXT_TIER_REFERRAL_REWARD = 5;
export const FRIENDS_PER_TIER = 3;

const WHATSAPP_CLAIMED_KEY = 'corona_whatsapp_claimed_v1';
const PENDING_REWARD_DIAMONDS_KEY = 'corona_referral_pending_diamonds_v1';
const PENDING_FRIEND_CODE_KEY = 'corona_pending_friend_code_v1';
const LOCAL_CLAIMED_TIERS_PREFIX = 'corona_ref_claimed_tiers_v1_';

export interface AcceptedReferral {
  uid: string;
  displayName: string;
  photoURL: string | null;
  acceptedAtMs: number;
}

export interface ReferralState {
  inviteCode: string;
  referrals: AcceptedReferral[];
  claimedTiers: number;
  whatsappClaimed: boolean;
  pendingFriendCode: string;
  redeemedInviteCode: string | null;
  redeemNotice: string | null;
  loading: boolean;
}

export const referralState: ReferralState = {
  inviteCode: '',
  referrals: [],
  claimedTiers: 0,
  whatsappClaimed: readLocalBool(WHATSAPP_CLAIMED_KEY),
  pendingFriendCode: '',
  redeemedInviteCode: null,
  redeemNotice: null,
  loading: false,
};

type ReferralListener = (state: ReferralState) => void;
const listeners = new Set<ReferralListener>();
let profileUnsub: Unsubscribe | null = null;
let activeProfileUid: string | null = null;

function readLocalBool(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeLocalBool(key: string, val: boolean): void {
  try {
    window.localStorage.setItem(key, val ? '1' : '0');
  } catch {
    // Ignore storage errors
  }
}

function notify(): void {
  for (const fn of listeners) {
    try {
      fn(referralState);
    } catch {
      // Ignore subscriber errors
    }
  }
}

export function subscribeReferrals(fn: ReferralListener): () => void {
  listeners.add(fn);
  fn(referralState);
  return () => listeners.delete(fn);
}

export function normalizeInviteCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

/**
 * Computes the diamond reward for a given 0-based tier row (3 friends per row):
 * - Row 0 (friends 1..3): 3 diamonds
 * - Row 1+ (every next 3 friends): 5 diamonds
 */
export function getTierDiamondReward(tierIndex: number): number {
  return tierIndex === 0 ? FIRST_TIER_REFERRAL_REWARD : NEXT_TIER_REFERRAL_REWARD;
}

export function getTotalEarnedReferralDiamonds(completedTiers = Math.floor(referralState.referrals.length / FRIENDS_PER_TIER)): number {
  let total = 0;
  for (let i = 0; i < completedTiers; i++) {
    total += getTierDiamondReward(i);
  }
  return total;
}

/**
 * Generates a deterministic, human-friendly 6-character unique invite code from the player's Google UID.
 */
export function generateDeterministicInviteCode(uid: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let h1 = 2166136261 >>> 0;
  let h2 = 0x9e3779b9 >>> 0;
  for (let i = 0; i < uid.length; i++) {
    const ch = uid.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i * 31), 2246822519) >>> 0;
  }
  let code = '';
  for (let i = 0; i < 6; i++) {
    const mix = i % 2 === 0 ? (h1 >>> (i * 5)) ^ h2 : (h2 >>> (i * 4)) ^ h1;
    code += alphabet[Math.abs(mix) % alphabet.length];
  }
  return code;
}

export function getPendingRewardDiamonds(): number {
  try {
    const raw = Number(window.localStorage.getItem(PENDING_REWARD_DIAMONDS_KEY) ?? '0');
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  } catch {
    return 0;
  }
}

function addPendingRewardDiamonds(amount: number): void {
  if (amount <= 0) return;
  const next = getPendingRewardDiamonds() + Math.floor(amount);
  try {
    window.localStorage.setItem(PENDING_REWARD_DIAMONDS_KEY, String(next));
  } catch {
    // Ignore
  }
}

function clearPendingRewardDiamonds(): void {
  try {
    window.localStorage.removeItem(PENDING_REWARD_DIAMONDS_KEY);
  } catch {
    // Ignore
  }
}

export function isWhatsappRewardClaimed(): boolean {
  return referralState.whatsappClaimed || readLocalBool(WHATSAPP_CLAIMED_KEY);
}

/**
 * Reads any `?convite=XXXXXX` (or `?invite=` / `?ref=`) query parameter on startup
 * and pre-fills the pre-login friend invite code field (persisted across Google OAuth redirects).
 */
export function initPendingFriendCodeFromUrl(): string {
  let code = '';
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('convite') || params.get('invite') || params.get('ref') || '';
    const cleanUrlCode = normalizeInviteCode(fromUrl);
    if (cleanUrlCode.length >= 4) {
      code = cleanUrlCode;
      window.localStorage.setItem(PENDING_FRIEND_CODE_KEY, code);
      // Clean URL visually without reloading
      try {
        params.delete('convite');
        params.delete('invite');
        params.delete('ref');
        const nextSearch = params.toString();
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
      } catch {
        // Ignore history restrictions
      }
    } else {
      code = normalizeInviteCode(window.localStorage.getItem(PENDING_FRIEND_CODE_KEY) ?? '');
    }
  } catch {
    // Ignore URL/storage errors
  }
  referralState.pendingFriendCode = code;
  notify();
  return code;
}

export function setPendingFriendCodeInput(raw: string): string {
  const clean = normalizeInviteCode(raw);
  referralState.pendingFriendCode = clean;
  try {
    if (clean) {
      window.localStorage.setItem(PENDING_FRIEND_CODE_KEY, clean);
    } else {
      window.localStorage.removeItem(PENDING_FRIEND_CODE_KEY);
    }
  } catch {
    // Ignore
  }
  notify();
  return clean;
}

/**
 * Builds the direct pre-filled game link for sharing with friends.
 */
export function buildInviteShareLink(code: string): string {
  const clean = normalizeInviteCode(code);
  const originBase =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? GAME_PUBLIC_URL
      : `${window.location.origin}${window.location.pathname}`;
  const base = originBase.endsWith('/') ? originBase : `${originBase}/`;
  return clean ? `${base}?convite=${encodeURIComponent(clean)}` : base;
}

/**
 * Builds the complete copy-and-paste invitation message (WhatsApp, Discord, Email, SMS, etc.)
 * with the pre-filled direct link, the player's unique friend code, and clear login instructions.
 */
export function buildInviteShareMessage(code: string): string {
  const clean = normalizeInviteCode(code);
  const link = buildInviteShareLink(clean);
  return [
    `👑⚔️ Venha jogar CORONA — Sagas do Norte (Mozzer Games) comigo!`,
    ``,
    `É um jogo nórdico de estratégia em pixel art no navegador (PC ou celular) com modo Co-op online de até 4 jogadores!`,
    ``,
    `🎮 Clique no link abaixo (meu código já vai preenchido automaticamente!):`,
    `${link}`,
    ``,
    `🔑 Código de amigo: ${clean}`,
    ``,
    `📌 Como confirmar o convite para eu ganhar diamantes:`,
    `1. Acesse o jogo pelo link acima;`,
    `2. Confira se o código ${clean} está no campo "Código de amigo" abaixo do botão de login Google (ou digite manualmente);`,
    `3. Clique no botão do Google e faça login com sua conta — pronto, convite confirmado! 💎`,
  ].join('\n');
}

/**
 * Claims the one-time +3 Diamonds reward when joining the WhatsApp Community.
 * - If currently in an active campaign, grants +3 diamonds immediately.
 * - If on the title screen, queues +3 diamonds to be delivered upon entering any campaign.
 */
export function claimWhatsappCommunityReward(world: WorldState): {
  newlyClaimed: boolean;
  grantedNow: boolean;
  diamonds: number;
} {
  if (isWhatsappRewardClaimed()) {
    return { newlyClaimed: false, grantedNow: false, diamonds: 0 };
  }

  referralState.whatsappClaimed = true;
  writeLocalBool(WHATSAPP_CLAIMED_KEY, true);

  const user = authCloudState.user;
  const rtdb = getRealtimeDb();
  if (user && rtdb) {
    void update(ref(rtdb, `referral_profiles/${user.uid}`), {
      whatsappClaimed: true,
      whatsappClaimedAtMs: Date.now(),
    }).catch(() => {});
  }

  const inCampaign =
    (world.mode === 'playing' || world.mode === 'paused' || world.mode === 'world_map') &&
    Boolean(world.monarchs[0]);

  if (inCampaign && world.monarchs[0]) {
    world.monarchs[0].diamonds += WHATSAPP_DIAMOND_REWARD;
    world.resources.diamonds = world.monarchs[0].diamonds;
    notify();
    return { newlyClaimed: true, grantedNow: true, diamonds: WHATSAPP_DIAMOND_REWARD };
  }

  addPendingRewardDiamonds(WHATSAPP_DIAMOND_REWARD);
  notify();
  return { newlyClaimed: true, grantedNow: false, diamonds: WHATSAPP_DIAMOND_REWARD };
}

/**
 * Delivers any queued referral or WhatsApp reward diamonds as soon as the player is in a live campaign.
 */
export function deliverPendingReferralDiamonds(world: WorldState): number {
  const pending = getPendingRewardDiamonds();
  if (pending <= 0 || !world.monarchs[0]) return 0;
  world.monarchs[0].diamonds += pending;
  world.resources.diamonds = world.monarchs[0].diamonds;
  clearPendingRewardDiamonds();
  return pending;
}

function readLocalClaimedTiers(uid: string): number {
  try {
    const n = Number(window.localStorage.getItem(`${LOCAL_CLAIMED_TIERS_PREFIX}${uid}`) ?? '0');
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function writeLocalClaimedTiers(uid: string, tiers: number): void {
  try {
    window.localStorage.setItem(`${LOCAL_CLAIMED_TIERS_PREFIX}${uid}`, String(Math.max(0, Math.floor(tiers))));
  } catch {
    // Ignore
  }
}

function processTierRewardsIfNeeded(uid: string, referralsCount: number, remoteClaimedTiers: number): void {
  const completedTiers = Math.floor(referralsCount / FRIENDS_PER_TIER);
  const localClaimed = readLocalClaimedTiers(uid);
  const alreadyClaimed = Math.max(remoteClaimedTiers, localClaimed, referralState.claimedTiers);

  if (completedTiers > alreadyClaimed) {
    let newlyEarned = 0;
    for (let t = alreadyClaimed; t < completedTiers; t++) {
      newlyEarned += getTierDiamondReward(t);
    }
    referralState.claimedTiers = completedTiers;
    writeLocalClaimedTiers(uid, completedTiers);
    if (newlyEarned > 0) {
      addPendingRewardDiamonds(newlyEarned);
    }
    const rtdb = getRealtimeDb();
    if (rtdb) {
      void update(ref(rtdb, `referral_profiles/${uid}`), {
        claimedTiers: completedTiers,
        updatedAtMs: Date.now(),
      }).catch(() => {});
    }
  } else {
    referralState.claimedTiers = alreadyClaimed;
    if (alreadyClaimed > localClaimed) {
      writeLocalClaimedTiers(uid, alreadyClaimed);
    }
  }
}

async function redeemPendingFriendCodeForUser(user: GooglePlayerUser, existingRedeemedCode: string | null): Promise<void> {
  const code = normalizeInviteCode(referralState.pendingFriendCode);
  if (!code || code.length < 4) return;

  if (existingRedeemedCode) {
    // This Google account already redeemed a friend code previously
    setPendingFriendCodeInput('');
    return;
  }

  const rtdb = getRealtimeDb();
  if (!rtdb) return;

  try {
    const codeSnap = await get(ref(rtdb, `invite_codes/${code}`));
    if (!codeSnap.exists()) {
      referralState.redeemNotice = `Código de amigo "${code}" não encontrado.`;
      setPendingFriendCodeInput('');
      return;
    }
    const info = codeSnap.val() as Record<string, unknown> | null;
    const ownerUid = typeof info?.ownerUid === 'string' ? info.ownerUid : '';
    const ownerName = typeof info?.ownerName === 'string' ? info.ownerName : 'seu amigo';

    if (!ownerUid || ownerUid === user.uid) {
      referralState.redeemNotice = 'Você não pode usar seu próprio código de convite.';
      setPendingFriendCodeInput('');
      return;
    }

    const nowMs = Date.now();
    // 1. Register this player's Google photo & name in the inviter's accepted referrals list
    await set(ref(rtdb, `referral_profiles/${ownerUid}/referrals/${user.uid}`), {
      uid: user.uid,
      displayName: user.displayName || user.email.split('@')[0] || 'Monarca',
      photoURL: user.photoURL ?? null,
      acceptedAtMs: nowMs,
    });

    // 2. Mark this Google account as having confirmed a friend invite (one-time per account)
    await update(ref(rtdb, `referral_profiles/${user.uid}`), {
      redeemedInviteCode: code,
      redeemedFromUid: ownerUid,
      redeemedAtMs: nowMs,
    });

    referralState.redeemedInviteCode = code;
    referralState.redeemNotice = `Convite de ${ownerName} (${code}) confirmado com sucesso!`;
    setPendingFriendCodeInput('');
    notify();
  } catch (err) {
    console.warn('[Corona Referrals] Could not confirm friend invite code:', err);
  }
}

/**
 * Syncs & subscribes to the signed-in Google user's referral profile, ensures their unique invite code
 * is registered in Realtime Database, and confirms any pre-login friend invite code automatically!
 */
export async function syncReferralProfileForUser(user: GooglePlayerUser | null): Promise<void> {
  if (!user) {
    profileUnsub?.();
    profileUnsub = null;
    activeProfileUid = null;
    referralState.inviteCode = '';
    referralState.referrals = [];
    referralState.claimedTiers = 0;
    referralState.redeemedInviteCode = null;
    referralState.loading = false;
    notify();
    return;
  }

  if (activeProfileUid === user.uid && profileUnsub) {
    return;
  }

  profileUnsub?.();
  profileUnsub = null;
  activeProfileUid = user.uid;

  const defaultCode = generateDeterministicInviteCode(user.uid);
  referralState.inviteCode = defaultCode;
  referralState.loading = true;
  notify();

  const rtdb = getRealtimeDb();
  if (!rtdb) {
    referralState.loading = false;
    notify();
    return;
  }

  try {
    const profileRef = ref(rtdb, `referral_profiles/${user.uid}`);
    const snap = await get(profileRef);
    const existing = snap.exists() ? (snap.val() as Record<string, unknown>) : null;

    let myCode = typeof existing?.inviteCode === 'string' && existing.inviteCode.length >= 4
      ? normalizeInviteCode(existing.inviteCode)
      : defaultCode;

    // Ensure unique ownership in invite_codes/{myCode}
    const codeRef = ref(rtdb, `invite_codes/${myCode}`);
    const codeSnap = await get(codeRef);
    if (codeSnap.exists()) {
      const codeOwner = (codeSnap.val() as Record<string, unknown> | null)?.ownerUid;
      if (codeOwner && codeOwner !== user.uid) {
        // Rare hash collision: append deterministic suffix
        myCode = `${myCode.slice(0, 5)}${user.uid.slice(-1).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
      }
    }

    await set(ref(rtdb, `invite_codes/${myCode}`), {
      ownerUid: user.uid,
      ownerName: user.displayName || 'Monarca',
      ownerPhoto: user.photoURL ?? null,
      createdAtMs: Date.now(),
    });

    const whatsappClaimedRemote = existing?.whatsappClaimed === true;
    const whatsappMerged = whatsappClaimedRemote || readLocalBool(WHATSAPP_CLAIMED_KEY);
    if (whatsappMerged) {
      referralState.whatsappClaimed = true;
      writeLocalBool(WHATSAPP_CLAIMED_KEY, true);
    }

    const existingRedeemed = typeof existing?.redeemedInviteCode === 'string' ? existing.redeemedInviteCode : null;
    referralState.inviteCode = myCode;
    referralState.redeemedInviteCode = existingRedeemed;

    await update(profileRef, {
      inviteCode: myCode,
      displayName: user.displayName || 'Monarca',
      photoURL: user.photoURL ?? null,
      whatsappClaimed: whatsappMerged,
      updatedAtMs: Date.now(),
    });

    // Confirm any friend invite code entered or passed via ?convite=XXXXXX BEFORE Google sign-in!
    await redeemPendingFriendCodeForUser(user, existingRedeemed);

    // Subscribe to live profile updates (new accepted friends appear in real time!)
    profileUnsub = onValue(profileRef, (liveSnap) => {
      const d = (liveSnap.val() as Record<string, unknown> | null) ?? {};
      if (typeof d.inviteCode === 'string' && d.inviteCode.length >= 4) {
        referralState.inviteCode = normalizeInviteCode(d.inviteCode);
      }
      if (d.whatsappClaimed === true) {
        referralState.whatsappClaimed = true;
        writeLocalBool(WHATSAPP_CLAIMED_KEY, true);
      }
      if (typeof d.redeemedInviteCode === 'string') {
        referralState.redeemedInviteCode = d.redeemedInviteCode;
      }

      const rawRefs = (d.referrals as Record<string, Record<string, unknown>> | null) ?? {};
      const list: AcceptedReferral[] = [];
      for (const [k, item] of Object.entries(rawRefs)) {
        if (!item || typeof item !== 'object') continue;
        list.push({
          uid: String(item.uid ?? k),
          displayName: String(item.displayName ?? 'Monarca'),
          photoURL: typeof item.photoURL === 'string' ? item.photoURL : null,
          acceptedAtMs: typeof item.acceptedAtMs === 'number' ? item.acceptedAtMs : 0,
        });
      }
      list.sort((a, b) => a.acceptedAtMs - b.acceptedAtMs);
      referralState.referrals = list;

      const remoteClaimed = typeof d.claimedTiers === 'number' && Number.isFinite(d.claimedTiers) ? d.claimedTiers : 0;
      processTierRewardsIfNeeded(user.uid, list.length, remoteClaimed);

      referralState.loading = false;
      notify();
    });
  } catch (err) {
    console.warn('[Corona Referrals] Profile sync warning:', err);
    referralState.loading = false;
    notify();
  }
}
