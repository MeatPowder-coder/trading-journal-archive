import type { DesktopTokens } from '../types';

const TOKENS_KEY = 'tj_desktop_tokens_v1';
const BACKEND_URL_KEY = 'tj_desktop_backend_url_v1';
const CLIENT_NAME_KEY = 'tj_desktop_client_name_v1';

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
