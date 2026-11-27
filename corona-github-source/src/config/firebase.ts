/**
 * Configuração do Firebase (Google Auth + Cloud Firestore) para Corona — Sagas do Norte.
 *
 * Você pode preencher as chaves abaixo diretamente OU configurá-las como
 * Variáveis de Ambiente no Netlify (VITE_FIREBASE_*).
 */

type EnvMap = Record<string, string | undefined>;
const env: EnvMap = (import.meta as unknown as { env?: EnvMap }).env ?? {};

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// Cole aqui os valores do seu App Web no Firebase Console (ou use VITE_FIREBASE_* no Netlify)
const FALLBACK_FIREBASE_CONFIG: FirebaseWebConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export const FIREBASE_CONFIG: FirebaseWebConfig = {
  apiKey: (env.VITE_FIREBASE_API_KEY ?? FALLBACK_FIREBASE_CONFIG.apiKey).trim(),
  authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN ?? FALLBACK_FIREBASE_CONFIG.authDomain).trim(),
  projectId: (env.VITE_FIREBASE_PROJECT_ID ?? FALLBACK_FIREBASE_CONFIG.projectId).trim(),
  storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET ?? FALLBACK_FIREBASE_CONFIG.storageBucket).trim(),
  messagingSenderId: (env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? FALLBACK_FIREBASE_CONFIG.messagingSenderId).trim(),
  appId: (env.VITE_FIREBASE_APP_ID ?? FALLBACK_FIREBASE_CONFIG.appId).trim(),
};

/**
 * E-mails Google autorizados a abrir o Painel de Jogadores (métricas) dentro do jogo.
 * Pode ser definido via VITE_ADMIN_EMAILS (separados por vírgula) ou aqui.
 */
const FALLBACK_ADMIN_EMAILS: string[] = [];

export const ADMIN_EMAILS: string[] = (
  env.VITE_ADMIN_EMAILS
    ? env.VITE_ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : FALLBACK_ADMIN_EMAILS.map((s) => s.trim().toLowerCase()).filter(Boolean)
);

export function isFirebaseConfigured(): boolean {
  return Boolean(
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.authDomain &&
    FIREBASE_CONFIG.projectId &&
    FIREBASE_CONFIG.appId
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
