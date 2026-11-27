export type CommunityReportReason =
  | 'Assédio sexual'
  | 'Racismo'
  | 'Xenofobia'
  | 'Linguagem inapropriada';

export const COMMUNITY_REPORT_REASONS: CommunityReportReason[] = [
  'Assédio sexual',
  'Racismo',
  'Xenofobia',
  'Linguagem inapropriada',
];

/**
 * URL pública do Google Forms de Denúncias da Comunidade Co-op.
 * Pode ser substituída via variável de ambiente VITE_REPORT_FORM_URL no Netlify
 * ou preenchida diretamente aqui após criar o formulário no Google Forms.
 */
const DEFAULT_REPORT_FORM_URL =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_REPORT_FORM_URL ?? '').trim();

/**
 * IDs opcionais de pré-preenchimento (entry.XXXX) do Google Forms, caso configurado.
 */
const ENTRY_REPORTER =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_REPORT_ENTRY_REPORTER ?? '').trim();
const ENTRY_REPORTED =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_REPORT_ENTRY_REPORTED ?? '').trim();
const ENTRY_REASON =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_REPORT_ENTRY_REASON ?? '').trim();
const ENTRY_DETAILS =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_REPORT_ENTRY_DETAILS ?? '').trim();

export interface ReportFormPayload {
  reporterEmail: string;
  reportedEmail: string;
  reason: CommunityReportReason;
  details: string;
}

export function buildCommunityReportFormUrl(payload: ReportFormPayload): string {
  const base = DEFAULT_REPORT_FORM_URL;
  if (base && (base.startsWith('http://') || base.startsWith('https://'))) {
    try {
      const url = new URL(base);
      url.searchParams.set('usp', 'pp_url');
      if (ENTRY_REPORTER) url.searchParams.set(ENTRY_REPORTER, payload.reporterEmail);
      if (ENTRY_REPORTED) url.searchParams.set(ENTRY_REPORTED, payload.reportedEmail);
      if (ENTRY_REASON) url.searchParams.set(ENTRY_REASON, payload.reason);
      if (ENTRY_DETAILS && payload.details) url.searchParams.set(ENTRY_DETAILS, payload.details);
      return url.toString();
    } catch {
      return base;
    }
  }
  // Fallback: opens Google Forms creation / submission page with report info copied to clipboard
  return 'https://docs.google.com/forms/u/0/';
}

export function isCustomReportFormConfigured(): boolean {
  return DEFAULT_REPORT_FORM_URL.startsWith('http://') || DEFAULT_REPORT_FORM_URL.startsWith('https://');
}
