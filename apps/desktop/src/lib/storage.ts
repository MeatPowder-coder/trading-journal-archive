import { invoke } from '@tauri-apps/api/core';
import type { DesktopTokens, PendingDesktopAuth } from '../types';

const TOKENS_KEY = 'tj_desktop_tokens_v1';
const BACKEND_URL_KEY = 'tj_desktop_backend_url_v1';
const CLIENT_NAME_KEY = 'tj_desktop_client_name_v1';
const PENDING_AUTH_KEY = 'tj_desktop_pending_auth_v1';
const ACCESS_TOKEN_SECRET = 'desktop_access_token';
const REFRESH_TOKEN_SECRET = 'desktop_refresh_token';

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

async function setSecureSecret(key: string, value: string) {
  try {
    await invoke('set_secure_secret', { key, value });
    return true;
  } catch {
    return false;
  }
}

async function getSecureSecret(key: string) {
  try {
    const value = await invoke<string | null>('get_secure_secret', { key });
    return value || '';
  } catch {
    return '';
  }
}

async function deleteSecureSecret(key: string) {
  try {
    await invoke('delete_secure_secret', { key });
    return true;
  } catch {
    return false;
  }
}

export async function saveTokens(tokens: DesktopTokens) {
  const secureAccess = await setSecureSecret(ACCESS_TOKEN_SECRET, tokens.accessToken);
  const secureRefresh = await setSecureSecret(REFRESH_TOKEN_SECRET, tokens.refreshToken);
  if (secureAccess && secureRefresh) {
    if (canUseLocalStorage()) localStorage.removeItem(TOKENS_KEY);
    return;
  }

  // Browser-only fallback for Vite preview. The packaged Tauri app uses OS secure storage.
  if (canUseLocalStorage()) localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export async function getTokens(): Promise<DesktopTokens | null> {
  const [accessToken, refreshToken] = await Promise.all([
    getSecureSecret(ACCESS_TOKEN_SECRET),
    getSecureSecret(REFRESH_TOKEN_SECRET),
  ]);
  if (accessToken && refreshToken) return { accessToken, refreshToken };

  if (!canUseLocalStorage()) return null;
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

export async function clearTokens() {
  await Promise.all([
    deleteSecureSecret(ACCESS_TOKEN_SECRET),
    deleteSecureSecret(REFRESH_TOKEN_SECRET),
  ]);
  if (canUseLocalStorage()) localStorage.removeItem(TOKENS_KEY);
}

export function getSavedBackendUrl() {
  if (!canUseLocalStorage()) return '';
  return (localStorage.getItem(BACKEND_URL_KEY) || '').trim();
}

export function saveBackendUrl(url: string) {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(BACKEND_URL_KEY, url.trim());
}

export function getSavedClientName() {
  if (!canUseLocalStorage()) return '';
  return (localStorage.getItem(CLIENT_NAME_KEY) || '').trim();
}

export function saveClientName(name: string) {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(CLIENT_NAME_KEY, name.trim());
}

export function savePendingDesktopAuth(value: PendingDesktopAuth) {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(value));
}

export function getPendingDesktopAuth(): PendingDesktopAuth | null {
  if (!canUseLocalStorage()) return null;
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
  if (!canUseLocalStorage()) return;
  localStorage.removeItem(PENDING_AUTH_KEY);
}
