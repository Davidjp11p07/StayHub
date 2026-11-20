/** Shared API destination for both identity and business requests. */
export function resolveBaseUrl(raw: string | undefined): string {
  const value = raw?.trim();
  return (value ? value : '/api/v1').replace(/\/+$/, '');
}
export const API_BASE_URL = resolveBaseUrl(import.meta.env.VITE_API_BASE_URL);
