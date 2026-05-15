import { useMemo, useState } from 'react';
import { openUrl as openExternalUrl } from '@tauri-apps/plugin-opener';

function normalizeBaseUrl(raw: string) {
  const value = raw.trim();
  if (!value) return '';
  return value.replace(/\/+$/, '');
}

export function buildMirrorUrl(baseUrl: string, path: string) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  if (!normalizedBase) return '';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function openMirrorUrl(url: string) {
  if (!url) return;
  try {
    await openExternalUrl(url);
    return;
  } catch {
    // Browser preview fallback.
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function WebMirrorFrame({
  baseUrl,
  path,
  title,
}: {
  baseUrl: string;
  path: string;
  title: string;
}) {
  const [reloadTick, setReloadTick] = useState(0);
  const sourceUrl = useMemo(() => buildMirrorUrl(baseUrl, path), [baseUrl, path]);

  if (!sourceUrl) {
    return (
      <section className="web-mirror-shell">
        <div className="web-mirror-topbar">
          <h3>{title}</h3>
          <span className="muted">Set a valid backend URL to load web parity.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="web-mirror-shell">
      <div className="web-mirror-topbar">
        <h3>{title}</h3>
        <div className="web-mirror-actions">
          <button className="btn" onClick={() => setReloadTick((value) => value + 1)}>Reload</button>
          <button className="btn" onClick={() => openMirrorUrl(sourceUrl)}>Open in Browser</button>
        </div>
      </div>
      <div className="web-mirror-url">{sourceUrl}</div>
      <iframe
        key={reloadTick}
        className="web-mirror-frame"
        src={sourceUrl}
        title={title}
        loading="lazy"
      />
    </section>
  );
}
