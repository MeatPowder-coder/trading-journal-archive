const runtimeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
const runtimeEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const ASSETS_BASE_URL = (runtimeEnv?.VITE_ASSETS_BASE_URL || runtimeEnv?.ASSETS_BASE_URL || runtimeProcess?.env?.ASSETS_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

export function toAssetUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (!pathOrUrl.startsWith('/uploads/')) return pathOrUrl;
  return ASSETS_BASE_URL ? `${ASSETS_BASE_URL}${pathOrUrl}` : pathOrUrl;
}

export function normalizeMediaUrl(url?: string | null): string | null {
  if (!url) return null;

  const cleaned = String(url).trim();
  if (!cleaned) return null;

  if (cleaned.startsWith('data:') || cleaned.startsWith('blob:')) return cleaned;
  if (cleaned.startsWith('/uploads/')) return cleaned;
  if (cleaned.startsWith('uploads/')) return `/${cleaned}`;

  if (cleaned.includes('/public/uploads/')) {
    const idx = cleaned.indexOf('/public/uploads/');
    return cleaned.slice(idx + '/public'.length);
  }

  if (cleaned.includes('public/uploads/')) {
    const idx = cleaned.indexOf('public/uploads/');
    return `/${cleaned.slice(idx + 'public/'.length)}`;
  }

  const marker = '/uploads/';
  const markerIdx = cleaned.indexOf(marker);
  if (markerIdx >= 0) {
    return cleaned.slice(markerIdx);
  }

  try {
    const parsed = new URL(cleaned);
    if (parsed.pathname.includes('/uploads/')) {
      return `${parsed.pathname}${parsed.search || ''}`;
    }
  } catch {
    // non-url strings are handled by fallback below
  }

  return cleaned;
}
