import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { openUrl as openExternalUrl } from '@tauri-apps/plugin-opener';
import {
  defaultBackendUrl,
  fetchDesktopCockpit,
  fetchDesktopSession,
  pollDesktopPairing,
  refreshDesktopTokens,
  revokeDesktopSession,
  startDesktopPairing,
} from './lib/api';
import {
  clearPendingDesktopAuth,
  clearTokens,
  getPendingDesktopAuth,
  getSavedBackendUrl,
  getSavedClientName,
  getTokens,
  savePendingDesktopAuth,
  saveBackendUrl,
  saveClientName,
  saveTokens,
} from './lib/storage';
import type {
  DesktopCockpitResponse,
  DesktopSessionResponse,
  DesktopTokens,
  PendingDesktopAuth,
  PairingStartResponse,
} from './types';

function formatDateIso(iso: string | null | undefined) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toFixed(digits);
}

function detectClientPlatform() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('windows') || ua.includes('win64') || ua.includes('win32')) return 'windows';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return (navigator.platform || 'unknown').toLowerCase();
}

function readString(row: Record<string, unknown>, key: string, fallback = '-') {
  const value = row[key];
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function readNumber(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function defaultClientName() {
  const saved = getSavedClientName();
  if (saved) return saved;
  const platform = detectClientPlatform();
  return `Trading Journal ${platform.toUpperCase()}`;
}

function buildDesktopConnectUrl(baseUrl: string, pairingId: string) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  const normalizedPairingId = pairingId.trim();
  if (!normalizedBaseUrl || !normalizedPairingId) return '';
  return `${normalizedBaseUrl}/desktop/connect?pairingId=${encodeURIComponent(normalizedPairingId)}`;
}

function normalizePairingId(value: string) {
  const v = value.trim().toLowerCase();
  if (!v) return '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
    return '';
  }
  return v;
}

function parsePairingIdFromDeepLink(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'trading-journal:') return '';
    const id = parsed.searchParams.get('pairingId') || '';
    return normalizePairingId(id);
  } catch {
    return '';
  }
}

export default function App() {
  const [backendUrl, setBackendUrl] = useState(() => getSavedBackendUrl() || defaultBackendUrl());
  const [clientName, setClientName] = useState(() => defaultClientName());
  const [pairing, setPairing] = useState<PairingStartResponse | null>(null);
  const [pendingAuth, setPendingAuth] = useState<PendingDesktopAuth | null>(() => getPendingDesktopAuth());
  const [tokens, setTokens] = useState(() => getTokens());
  const [session, setSession] = useState<DesktopSessionResponse | null>(null);
  const [cockpit, setCockpit] = useState<DesktopCockpitResponse | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>('Ready');

  const openTradesView = useMemo(() => {
    if (!cockpit?.openTrades?.length) return [];
    return cockpit.openTrades.map((row, index) => {
      const record = row as Record<string, unknown>;
      return {
        key: `${readString(record, 'id', String(index + 1))}-${index}`,
        id: readString(record, 'id', String(index + 1)),
        symbol: readString(record, 'simbolo'),
        side: readString(record, 'direccion'),
        status: readString(record, 'estado'),
        broker: readString(record, 'broker'),
        leverage: readNumber(record, 'apalancamiento'),
        margin: readNumber(record, 'monto_margin'),
        risk: readNumber(record, 'risk_amount_usdt'),
        openedAt: readString(record, 'fecha_apertura'),
      };
    });
  }, [cockpit?.openTrades]);

  const pendingOrdersView = useMemo(() => {
    if (!cockpit?.pendingOrders?.length) return [];
    return cockpit.pendingOrders.map((row, index) => {
      const record = row as Record<string, unknown>;
      return {
        key: `${readString(record, 'id', String(index + 1))}-${index}`,
        id: readString(record, 'id', String(index + 1)),
        symbol: readString(record, 'simbolo'),
        side: readString(record, 'direccion'),
        status: readString(record, 'order_status'),
        entryPrice: readNumber(record, 'entry_price'),
        margin: readNumber(record, 'margin'),
        leverage: readNumber(record, 'leverage'),
        createdAt: readString(record, 'created_at'),
      };
    });
  }, [cockpit?.pendingOrders]);

  const pairingBrowserUrl = useMemo(() => {
    const pairingId = pendingAuth?.pairingId || pairing?.pairingId || '';
    if (!pairingId) return '';
    return buildDesktopConnectUrl(backendUrl, pairingId);
  }, [backendUrl, pairing?.pairingId, pendingAuth?.pairingId]);

  const loadDesktopState = useCallback(
    async (accessToken: string) => {
      const [sessionPayload, cockpitPayload] = await Promise.all([
        fetchDesktopSession({ baseUrl: backendUrl, accessToken }),
        fetchDesktopCockpit({ baseUrl: backendUrl, accessToken }),
      ]);
      setSession(sessionPayload);
      setCockpit(cockpitPayload);
      setLastSyncAt(new Date().toISOString());
    },
    [backendUrl]
  );

  const rotateTokens = useCallback(
    async (refreshToken: string) => {
      const rotated = await refreshDesktopTokens({
        baseUrl: backendUrl,
        refreshToken,
      });
      const next: DesktopTokens = {
        accessToken: rotated.accessToken,
        refreshToken: rotated.refreshToken,
      };
      saveTokens(next);
      setTokens(next);
      return next;
    },
    [backendUrl]
  );

  useEffect(() => {
    saveBackendUrl(backendUrl);
  }, [backendUrl]);

  useEffect(() => {
    saveClientName(clientName);
  }, [clientName]);

  useEffect(() => {
    if (!tokens?.accessToken) return;
    if (!pendingAuth && !pairing) return;
    clearPendingDesktopAuth();
    setPendingAuth(null);
    setPairing(null);
  }, [pairing, pendingAuth, tokens?.accessToken]);

  useEffect(() => {
    if (!tokens?.accessToken) return;
    const accessToken = tokens.accessToken;
    const refreshToken = tokens.refreshToken;
    let disposed = false;

    async function run() {
      try {
        await loadDesktopState(accessToken);
        if (!disposed) setMessage('Desktop session active');
      } catch (error) {
        if (disposed) return;
        const reason = error instanceof Error ? error.message : 'Session error';
        if (!refreshToken) {
          setMessage(reason);
          return;
        }
        try {
          const next = await rotateTokens(refreshToken);
          await loadDesktopState(next.accessToken);
          if (!disposed) setMessage('Tokens rotated automatically');
        } catch (refreshError) {
          clearTokens();
          setTokens(null);
          setSession(null);
          setCockpit(null);
          setLastSyncAt(null);
          setMessage(refreshError instanceof Error ? refreshError.message : reason);
        }
      }
    }

    run();
    return () => {
      disposed = true;
    };
  }, [loadDesktopState, rotateTokens, tokens?.accessToken, tokens?.refreshToken]);

  const completePendingPairing = useCallback(
    async (expectedPairingId?: string) => {
      const activePairing = pendingAuth || getPendingDesktopAuth();
      if (!activePairing) {
        setMessage('No pending desktop login found');
        return;
      }

      const normalizedExpected = expectedPairingId ? normalizePairingId(expectedPairingId) : '';
      const normalizedActive = normalizePairingId(activePairing.pairingId);
      if (normalizedExpected && normalizedExpected !== normalizedActive) {
        setMessage('Login response does not match current session');
        return;
      }

      setBusy(true);
      setMessage('Finalizing desktop login');
      try {
        let response = await pollDesktopPairing({
          baseUrl: backendUrl,
          pairingId: activePairing.pairingId,
          pollToken: activePairing.pollToken,
        });

        if (response.status === 'PENDING') {
          await new Promise((resolve) => setTimeout(resolve, 750));
          response = await pollDesktopPairing({
            baseUrl: backendUrl,
            pairingId: activePairing.pairingId,
            pollToken: activePairing.pollToken,
          });
        }

        if (response.status !== 'EXCHANGED') {
          setMessage('Waiting for Google approval in browser');
          return;
        }

        const nextTokens: DesktopTokens = {
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
        };
        saveTokens(nextTokens);
        setTokens(nextTokens);
        clearPendingDesktopAuth();
        setPendingAuth(null);
        setPairing(null);
        setMessage('Desktop login completed');
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Desktop login failed';
        if (/expirad|not found|revocad/i.test(text)) {
          clearPendingDesktopAuth();
          setPendingAuth(null);
          setPairing(null);
        }
        setMessage(text);
      } finally {
        setBusy(false);
      }
    },
    [backendUrl, pendingAuth]
  );

  async function openBrowserForPairing(url: string) {
    try {
      await openExternalUrl(url);
      return true;
    } catch {
      try {
        const popup = window.open(url, '_blank', 'noopener,noreferrer');
        if (popup) return true;
      } catch {
        // Ignore and return false.
      }
      return false;
    }
  }

  async function handleStartPairing() {
    setBusy(true);
    setMessage('Starting Google login');
    try {
      const response = await startDesktopPairing({
        baseUrl: backendUrl,
        clientName: clientName || 'Trading Journal Desktop',
        clientPlatform: detectClientPlatform(),
      });
      setPairing(response);

      const nextPending: PendingDesktopAuth = {
        pairingId: response.pairingId,
        pollToken: response.pollToken,
        expiresAt: response.expiresAt,
      };
      savePendingDesktopAuth(nextPending);
      setPendingAuth(nextPending);

      const approvalUrl = buildDesktopConnectUrl(backendUrl, response.pairingId);
      if (!approvalUrl) {
        setMessage('Invalid backend URL');
        return;
      }

      const opened = await openBrowserForPairing(approvalUrl);
      if (opened) {
        setMessage('Browser opened. Continue with Google.');
      } else {
        setMessage('Could not open browser automatically');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to start login');
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryBrowserLogin() {
    if (!pairingBrowserUrl) return;
    const opened = await openBrowserForPairing(pairingBrowserUrl);
    if (opened) {
      setMessage('Browser opened. Continue with Google.');
      return;
    }
    setMessage(`Open manually: ${pairingBrowserUrl}`);
  }

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;

    async function connectDeepLinks() {
      try {
        const startUrls = await getCurrent();
        if (!disposed && startUrls?.length) {
          for (const url of startUrls) {
            const pairingIdFromLink = parsePairingIdFromDeepLink(url);
            if (pairingIdFromLink) {
              await completePendingPairing(pairingIdFromLink);
              break;
            }
          }
        }
      } catch {
        // Ignore deep-link startup errors.
      }

      try {
        unlisten = await onOpenUrl(async (urls) => {
          for (const url of urls) {
            const pairingIdFromLink = parsePairingIdFromDeepLink(url);
            if (pairingIdFromLink) {
              await completePendingPairing(pairingIdFromLink);
              break;
            }
          }
        });
      } catch {
        // Unsupported without deep-link + single-instance plugins.
      }
    }

    connectDeepLinks();
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [completePendingPairing]);

  async function handleRotateTokens() {
    if (!tokens?.refreshToken) return;
    setBusy(true);
    try {
      const next = await rotateTokens(tokens.refreshToken);
      await loadDesktopState(next.accessToken);
      setMessage('Tokens rotated');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Token rotation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleRefreshCockpit() {
    if (!tokens?.accessToken) return;
    setBusy(true);
    try {
      await loadDesktopState(tokens.accessToken);
      setMessage('Cockpit data refreshed');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cockpit refresh failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOutDevice() {
    if (!tokens?.accessToken) return;
    setBusy(true);
    try {
      await revokeDesktopSession({
        baseUrl: backendUrl,
        accessToken: tokens.accessToken,
      });
      clearTokens();
      clearPendingDesktopAuth();
      setTokens(null);
      setSession(null);
      setCockpit(null);
      setPairing(null);
      setPendingAuth(null);
      setLastSyncAt(null);
      setMessage('Desktop session revoked');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to revoke desktop session');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Trading Journal</p>
          <h1>Desktop Cockpit</h1>
        </div>
        <div className="topbar-right">
          <span className="status-chip">{message}</span>
          <p className="meta-chip">
            Last sync: <b>{formatDateIso(lastSyncAt)}</b>
          </p>
        </div>
      </header>

      <section className="panel">
        <h2>Desktop Link</h2>
        <div className="settings-grid">
          <div>
            <label>Backend URL</label>
            <input
              value={backendUrl}
              onChange={(event) => setBackendUrl(event.target.value)}
              placeholder="https://journal.agentame.xyz"
              className="text-input"
            />
          </div>
          <div>
            <label>Client Name</label>
            <input
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder="Trading Journal Desktop"
              className="text-input"
            />
          </div>
        </div>
        <div className="actions">
          <button onClick={handleStartPairing} disabled={busy} className="btn btn-primary">
            Sign In With Google
          </button>
          {pendingAuth && !tokens ? (
            <button onClick={handleRetryBrowserLogin} disabled={busy} className="btn">
              Reopen Browser
            </button>
          ) : null}
        </div>
      </section>

      {(pendingAuth || pairing) && !tokens && (
        <section className="panel pairing">
          <h2>Browser Login In Progress</h2>
          <p className="hint">
            Complete Google login in your browser. Then accept the prompt to open Trading Journal Desktop.
          </p>
          <p className="hint">
            Expires at: <b>{formatDateIso((pendingAuth || pairing)?.expiresAt)}</b>
          </p>
          {pairingBrowserUrl ? (
            <p className="hint">
              Browser URL: <code>{pairingBrowserUrl}</code>
            </p>
          ) : null}
          <div className="actions">
            <button onClick={handleRetryBrowserLogin} disabled={busy || !pairingBrowserUrl} className="btn">
              Open Browser Again
            </button>
          </div>
        </section>
      )}

      {tokens && session && (
        <section className="panel">
          <h2>Desktop Session</h2>
          <div className="grid">
            <div>
              <label>User</label>
              <p>{session.user.name || session.user.email || session.user.id}</p>
            </div>
            <div>
              <label>Device</label>
              <p>{session.deviceSession.clientName || '-'}</p>
            </div>
            <div>
              <label>Platform</label>
              <p>{session.deviceSession.clientPlatform || '-'}</p>
            </div>
            <div>
              <label>Status</label>
              <p>{session.deviceSession.status || '-'}</p>
            </div>
            <div>
              <label>Approved At</label>
              <p>{formatDateIso(session.deviceSession.approvedAt)}</p>
            </div>
            <div>
              <label>Updated At</label>
              <p>{formatDateIso(session.deviceSession.updatedAt)}</p>
            </div>
          </div>
          <div className="actions">
            <button onClick={handleRefreshCockpit} disabled={busy} className="btn">
              Refresh Cockpit
            </button>
            <button onClick={handleRotateTokens} disabled={busy} className="btn">
              Rotate Tokens
            </button>
            <button onClick={handleSignOutDevice} disabled={busy} className="btn btn-danger">
              Revoke Session
            </button>
          </div>
        </section>
      )}

      {tokens && cockpit && (
        <>
          <section className="panel">
            <h2>Live Cockpit Snapshot</h2>
            <div className="kpi-grid">
              <article className="kpi">
                <label>Balance USDT</label>
                <strong>{formatNumber(cockpit.account.balanceUsdt, 2)}</strong>
              </article>
              <article className="kpi">
                <label>Max Risk USDT</label>
                <strong>{formatNumber(cockpit.account.maxRisk.amount, 2)}</strong>
              </article>
              <article className="kpi">
                <label>Open Trades</label>
                <strong>{openTradesView.length}</strong>
              </article>
              <article className="kpi">
                <label>Pending Orders</label>
                <strong>{pendingOrdersView.length}</strong>
              </article>
              <article className="kpi">
                <label>Blocked</label>
                <strong>{cockpit.discipline.blocked ? 'Yes' : 'No'}</strong>
              </article>
              <article className="kpi">
                <label>Blocked Until</label>
                <strong>{formatDateIso(cockpit.discipline.blockedUntil)}</strong>
              </article>
              <article className="kpi">
                <label>Remaining Sec</label>
                <strong>{cockpit.discipline.remainingSeconds || 0}</strong>
              </article>
              <article className="kpi">
                <label>As Of</label>
                <strong>{formatDateIso(cockpit.asOf)}</strong>
              </article>
            </div>
          </section>

          <section className="panel">
            <h2>Open Trades</h2>
            {openTradesView.length === 0 ? (
              <p className="hint">No open trades.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Status</th>
                      <th>Broker</th>
                      <th>Lev</th>
                      <th>Margin</th>
                      <th>Risk</th>
                      <th>Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openTradesView.map((row) => (
                      <tr key={row.key}>
                        <td>{row.id}</td>
                        <td>{row.symbol}</td>
                        <td>{row.side}</td>
                        <td>{row.status}</td>
                        <td>{row.broker}</td>
                        <td>{formatNumber(row.leverage, 1)}</td>
                        <td>{formatNumber(row.margin, 2)}</td>
                        <td>{formatNumber(row.risk, 2)}</td>
                        <td>{formatDateIso(row.openedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Pending Orders</h2>
            {pendingOrdersView.length === 0 ? (
              <p className="hint">No pending orders.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Status</th>
                      <th>Entry</th>
                      <th>Margin</th>
                      <th>Lev</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingOrdersView.map((row) => (
                      <tr key={row.key}>
                        <td>{row.id}</td>
                        <td>{row.symbol}</td>
                        <td>{row.side}</td>
                        <td>{row.status}</td>
                        <td>{formatNumber(row.entryPrice, 4)}</td>
                        <td>{formatNumber(row.margin, 2)}</td>
                        <td>{formatNumber(row.leverage, 1)}</td>
                        <td>{formatDateIso(row.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
