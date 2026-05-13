import type { DesktopTokens, PendingDesktopAuth } from '../types';

const TOKENS_KEY = 'tj_desktop_tokens_v1';
const BACKEND_URL_KEY = 'tj_desktop_backend_url_v1';
const CLIENT_NAME_KEY = 'tj_desktop_client_name_v1';
const PENDING_AUTH_KEY = 'tj_desktop_pending_auth_v1';

export function saveTokens(tokens: DesktopTokens) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function getTokens(): DesktopTokens | null {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken || !parsed?.refreshToken) return null;
    return {
      accessToken: String(parsed.accessToken),
      refreshToken: String(parsed.refreshToken),
    };
  } catch {
    return null;
  }
}

export function clearTokens() {
  localStorage.removeItem(TOKENS_KEY);
}

export function getSavedBackendUrl() {
  return (localStorage.getItem(BACKEND_URL_KEY) || '').trim();
}

export function saveBackendUrl(url: string) {
  localStorage.setItem(BACKEND_URL_KEY, url.trim());
}

export function getSavedClientName() {
  return (localStorage.getItem(CLIENT_NAME_KEY) || '').trim();
}

export function saveClientName(name: string) {
  localStorage.setItem(CLIENT_NAME_KEY, name.trim());
}

export function savePendingDesktopAuth(value: PendingDesktopAuth) {
  localStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(value));
}

export function getPendingDesktopAuth(): PendingDesktopAuth | null {
  const raw = localStorage.getItem(PENDING_AUTH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.pairingId || !parsed?.pollToken || !parsed?.expiresAt) return null;
    return {
      pairingId: String(parsed.pairingId),
      pollToken: String(parsed.pollToken),
      expiresAt: String(parsed.expiresAt),
    };
  } catch {
    return null;
  }
}

export function clearPendingDesktopAuth() {
  localStorage.removeItem(PENDING_AUTH_KEY);
}
