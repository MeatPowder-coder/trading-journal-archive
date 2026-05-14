import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { openUrl as openExternalUrl } from '@tauri-apps/plugin-opener';
import { AIAnalysisPanel } from './components/AIAnalysisPanel';
import { ChartWorkspace } from './components/ChartWorkspace';
import { CVDPanel } from './components/CVDPanel';
import { FootprintPanel } from './components/FootprintPanel';
import { JournalSidebar } from './components/JournalSidebar';
import { LiquidationPanel } from './components/LiquidationPanel';
import { OrderPanel } from './components/OrderPanel';
import { RiskHeader } from './components/RiskHeader';
import { useBackendEvents } from './hooks/useBackendEvents';
import { useMarketData } from './hooks/useMarketData';
import {
  createChartSnapshot,
  createSLTPMove,
  defaultBackendUrl,
  fetchDesktopCockpit,
  fetchDesktopSession,
  pollDesktopPairing,
  refreshDesktopTokens,
  requestAIAnalysis,
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
  DesktopEvent,
  DesktopSessionResponse,
  DesktopTokens,
  PendingDesktopAuth,
  PairingStartResponse,
  SLTPMoveInput,
  Timeframe,
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

function readString(row: Record<string, unknown> | null | undefined, key: string, fallback = '-') {
  const value = row?.[key];
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function readNumber(row: Record<string, unknown> | null | undefined, key: string) {
  const value = row?.[key];
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

function captureChartImageUrl() {
  const canvas = document.querySelector<HTMLCanvasElement>('.candle-chart canvas');
  if (!canvas) return '';
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

const timeframes: Timeframe[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'];

export default function App() {
  const [backendUrl, setBackendUrl] = useState(() => getSavedBackendUrl() || defaultBackendUrl());
  const [clientName, setClientName] = useState(() => defaultClientName());
  const [pairing, setPairing] = useState<PairingStartResponse | null>(null);
  const [pendingAuth, setPendingAuth] = useState<PendingDesktopAuth | null>(() => getPendingDesktopAuth());
  const [tokens, setTokens] = useState<DesktopTokens | null>(null);
  const [session, setSession] = useState<DesktopSessionResponse | null>(null);
  const [cockpit, setCockpit] = useState<DesktopCockpitResponse | null>(null);
  const [backendEvents, setBackendEvents] = useState<DesktopEvent[]>([]);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>('Ready');

  const market = useMarketData(symbol, timeframe, Boolean(tokens?.accessToken));

  const handleBackendEvent = useCallback((event: DesktopEvent) => {
    setBackendEvents((current) => [...current.slice(-80), event]);
    if (['sltp.move.recorded', 'snapshot.created', 'ai.analysis.ready', 'trade.updated', 'order.updated'].includes(event.type)) {
      setMessage(event.type);
    }
  }, []);

  const backendWsStatus = useBackendEvents({
    backendUrl,
    tokens,
    enabled: Boolean(tokens?.accessToken),
    onEvent: handleBackendEvent,
  });

  const openTradesView = useMemo(() => cockpit?.openTrades || [], [cockpit?.openTrades]);
  const pendingOrdersView = useMemo(() => cockpit?.pendingOrders || [], [cockpit?.pendingOrders]);
  const activeTrade = openTradesView[0] || null;

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
      const rotated = await refreshDesktopTokens({ baseUrl: backendUrl, refreshToken });
      const next: DesktopTokens = { accessToken: rotated.accessToken, refreshToken: rotated.refreshToken };
      await saveTokens(next);
      setTokens(next);
      return next;
    },
    [backendUrl]
  );

  useEffect(() => {
    let disposed = false;
    async function boot() {
      const saved = await getTokens();
      if (!disposed && saved) setTokens(saved);
    }
    boot();
    return () => {
      disposed = true;
    };
  }, []);

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
          await clearTokens();
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
        await saveTokens(nextTokens);
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
        // Browser fallback failed.
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
      setMessage(opened ? 'Browser opened. Continue with Google.' : 'Could not open browser automatically');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to start login');
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryBrowserLogin() {
    if (!pairingBrowserUrl) return;
    const opened = await openBrowserForPairing(pairingBrowserUrl);
    setMessage(opened ? 'Browser opened. Continue with Google.' : `Open manually: ${pairingBrowserUrl}`);
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
        // Deep-link startup may be unsupported in browser preview.
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
      await revokeDesktopSession({ baseUrl: backendUrl, accessToken: tokens.accessToken });
      await clearTokens();
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

  async function handleMoveProtection(tradeId: string | number, input: SLTPMoveInput) {
    if (!tokens?.accessToken) return;
    setBusy(true);
    try {
      const move = await createSLTPMove({ baseUrl: backendUrl, accessToken: tokens.accessToken, tradeId, input });
      const imageUrl = captureChartImageUrl();
      await createChartSnapshot({
        baseUrl: backendUrl,
        accessToken: tokens.accessToken,
        tradeId,
        input: {
          trigger: input.moveType === 'SL' ? 'SL_MOVE' : 'TP_MOVE',
          imageUrl: imageUrl || `desktop-snapshot://${symbol}/${Date.now()}`,
          timeframe,
          indicators: market.captureSnapshot(),
          sltpMoveId: readNumber(move.move, 'id'),
        },
      });
      await loadDesktopState(tokens.accessToken);
      setMessage(`${input.moveType} move recorded with snapshot`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Protection move failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestAnalysis(prompt: string) {
    if (!tokens?.accessToken || !activeTrade) return;
    const tradeId = readString(activeTrade, 'id', '');
    if (!tradeId) return;
    try {
      await requestAIAnalysis({
        baseUrl: backendUrl,
        accessToken: tokens.accessToken,
        tradeId,
        input: {
          prompt,
          model: 'claude-server-side',
          status: 'PENDING',
          context: {
            activeTrade,
            market: market.captureSnapshot(),
            recentBackendEvents: backendEvents.slice(-12),
          },
        },
      });
      setMessage('AI analysis queued');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI analysis request failed');
    }
  }

  const side = readString(activeTrade, 'direccion', 'NO TRADE');
  const entry = readNumber(activeTrade, 'precio_entrada');
  const latestPrice = market.summary.latestPrice;
  const unrealizedHint = entry && latestPrice
    ? side === 'SHORT'
      ? ((entry - latestPrice) / entry) * 100
      : ((latestPrice - entry) / entry) * 100
    : null;

  return (
    <div className="terminal-shell">
      <header className="terminal-topbar">
        <div className="brand-block">
          <p className="eyebrow">Trading Journal</p>
          <h1>Windows Trading Desk</h1>
        </div>
        <div className="symbol-controls">
          <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} />
          <select value={timeframe} onChange={(event) => setTimeframe(event.target.value as Timeframe)}>
            {timeframes.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
          </select>
          <button className="btn" onClick={handleRefreshCockpit} disabled={busy || !tokens}>Sync</button>
          <button className="btn btn-danger" onClick={handleSignOutDevice} disabled={busy || !tokens}>Sign out</button>
        </div>
        <div className="status-stack">
          <span className="status-chip">{message}</span>
          <small>Last sync: <b>{formatDateIso(lastSyncAt)}</b></small>
        </div>
      </header>

      {!tokens ? (
        <main className="login-stage">
          <section className="login-card">
            <p className="eyebrow">Secure Desktop Login</p>
            <h2>Connect the Windows app to your journal</h2>
            <p>
              Google login opens in your browser and returns here through the Trading Journal deep link.
              No manual codes are required.
            </p>
            <div className="settings-grid">
              <div>
                <label>Backend URL</label>
                <input value={backendUrl} onChange={(event) => setBackendUrl(event.target.value)} className="text-input" />
              </div>
              <div>
                <label>Client Name</label>
                <input value={clientName} onChange={(event) => setClientName(event.target.value)} className="text-input" />
              </div>
            </div>
            <div className="actions">
              <button onClick={handleStartPairing} disabled={busy} className="btn btn-primary">Sign In With Google</button>
              {pendingAuth ? <button onClick={handleRetryBrowserLogin} disabled={busy} className="btn">Reopen Browser</button> : null}
            </div>
            {pendingAuth || pairing ? (
              <p className="muted">Login expires at {formatDateIso((pendingAuth || pairing)?.expiresAt)}</p>
            ) : null}
          </section>
        </main>
      ) : (
        <main className="trading-grid">
          <RiskHeader cockpit={cockpit} marketStatus={market.status} backendStatus={backendWsStatus} />

          <section className="session-strip">
            <span>{session?.user.name || session?.user.email || 'Desktop session'}</span>
            <b>{side}</b>
            <span>Entry {formatNumber(entry, 4)}</span>
            <span>Mark {formatNumber(latestPrice, 4)}</span>
            <span className={Number(unrealizedHint) >= 0 ? 'positive' : 'negative'}>
              PnL hint {formatNumber(unrealizedHint, 2)}%
            </span>
          </section>

          <div className="main-desk">
            <div className="chart-column">
              <ChartWorkspace state={market.state} />
              <div className="lower-panels">
                <CVDPanel points={market.state.cvd} />
                <FootprintPanel bins={market.state.footprint} />
                <LiquidationPanel events={market.state.liquidations} />
              </div>
            </div>
            <aside className="right-rail">
              <OrderPanel activeTrade={activeTrade} tokens={tokens} onMoveProtection={handleMoveProtection} />
              <JournalSidebar activeTrade={activeTrade} events={backendEvents} />
              <AIAnalysisPanel disabled={!activeTrade || !tokens} onRequestAnalysis={handleRequestAnalysis} />
            </aside>
          </div>

          <section className="orders-strip">
            <div>
              <h3>Open Trades</h3>
              <p>{openTradesView.length} active</p>
            </div>
            <div>
              <h3>Pending Orders</h3>
              <p>{pendingOrdersView.length} waiting</p>
            </div>
            <div>
              <h3>Risk Warning</h3>
              <p>{cockpit?.account.maxRisk.warning || 'No warning'}</p>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
