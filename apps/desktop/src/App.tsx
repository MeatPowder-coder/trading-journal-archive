import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { openUrl as openExternalUrl } from '@tauri-apps/plugin-opener';
import { buildDashboardSnapshotFromDesktop } from '@trading-journal/journal-data';
import { JournalDashboardParity } from '@trading-journal/journal-ui';
import { AIAnalysisPanel } from './components/AIAnalysisPanel';
import { ChatDesk } from './components/ChatDesk';
import { CVDPanel } from './components/CVDPanel';
import { DesktopDashboardNative } from './components/DesktopDashboardNative';
import { FootprintPanel } from './components/FootprintPanel';
import { JournalSidebar } from './components/JournalSidebar';
import { LiquidationPanel } from './components/LiquidationPanel';
import { OrderPanel } from './components/OrderPanel';
import { RiskHeader } from './components/RiskHeader';
import { TradingViewChartWorkspace } from './components/TradingViewChartWorkspace';
import { WebMirrorFrame } from './components/WebMirrorFrame';
import { useBackendEvents } from './hooks/useBackendEvents';
import { useMarketData } from './hooks/useMarketData';
import {
  closePosition,
  createChartSnapshot,
  createSLTPMove,
  defaultBackendUrl,
  fetchDesktopTrades,
  fetchDesktopBootstrap,
  fetchDesktopCockpit,
  fetchDesktopSession,
  placeLimitOrder,
  placeMarketOrder,
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
  MarketType,
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
const marketSymbols: Record<MarketType, string[]> = {
  futures: [
    'BTCUSDT',
    'ETHUSDT',
    'SOLUSDT',
    'XRPUSDT',
    'BNBUSDT',
    'DOGEUSDT',
    'ADAUSDT',
    'LINKUSDT',
    'AVAXUSDT',
    'SUIUSDT',
    '1000PEPEUSDT',
  ],
  spot: [
    'BTCUSDT',
    'ETHUSDT',
    'SOLUSDT',
    'XRPUSDT',
    'BNBUSDT',
    'DOGEUSDT',
    'ADAUSDT',
    'LINKUSDT',
    'AVAXUSDT',
    'SUIUSDT',
    'PEPEUSDT',
  ],
};
const desktopTabs = [
  { id: 'trading-desk', label: 'Trading Desk' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'live-market', label: 'Live Market Activity' },
  { id: 'chat', label: 'Chat' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'cuentas', label: 'Cuentas' },
  { id: 'transacciones', label: 'Transacciones' },
  { id: 'alertas', label: 'Alertas' },
] as const;

type DesktopTabId = typeof desktopTabs[number]['id'];

export default function App() {
  const [backendUrl, setBackendUrl] = useState(() => getSavedBackendUrl() || defaultBackendUrl());
  const [clientName, setClientName] = useState(() => defaultClientName());
  const [pairing, setPairing] = useState<PairingStartResponse | null>(null);
  const [pendingAuth, setPendingAuth] = useState<PendingDesktopAuth | null>(() => getPendingDesktopAuth());
  const [tokens, setTokens] = useState<DesktopTokens | null>(null);
  const [session, setSession] = useState<DesktopSessionResponse | null>(null);
  const [cockpit, setCockpit] = useState<DesktopCockpitResponse | null>(null);
  const [desktopTrades, setDesktopTrades] = useState<Record<string, unknown>[]>([]);
  const [backendEvents, setBackendEvents] = useState<DesktopEvent[]>([]);
  const [activeTab, setActiveTab] = useState<DesktopTabId>('trading-desk');
  const [marketType, setMarketType] = useState<MarketType>('futures');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [showMicroPanels, setShowMicroPanels] = useState(true);
  const [showRightRail, setShowRightRail] = useState(true);
  const [focusChartMode, setFocusChartMode] = useState(false);
  const [useWebMirrorTabs, setUseWebMirrorTabs] = useState(false);
  const [rightRailWidth, setRightRailWidth] = useState(360);
  const [lowerPanelsHeight, setLowerPanelsHeight] = useState(250);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>('Ready');

  const market = useMarketData(symbol, timeframe, marketType, Boolean(tokens?.accessToken));

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
  const dashboardSnapshot = useMemo(() => buildDashboardSnapshotFromDesktop(cockpit || null), [cockpit]);
  const activeTrade = openTradesView[0] || null;
  const symbolOptions = useMemo(() => {
    const list = marketSymbols[marketType];
    const filter = symbolFilter.trim().toUpperCase();
    if (!filter) return list;
    const filtered = list.filter((candidate) => candidate.includes(filter));
    return filtered.length ? filtered : list;
  }, [marketType, symbolFilter]);

  const pairingBrowserUrl = useMemo(() => {
    const pairingId = pendingAuth?.pairingId || pairing?.pairingId || '';
    if (!pairingId) return '';
    return buildDesktopConnectUrl(backendUrl, pairingId);
  }, [backendUrl, pairing?.pairingId, pendingAuth?.pairingId]);
  const webMirrorBaseUrl = useMemo(() => {
    const explicit = (import.meta.env.VITE_WEB_APP_URL || '').trim();
    return explicit || backendUrl;
  }, [backendUrl]);

  const loadDesktopState = useCallback(
    async (accessToken: string) => {
      try {
        const [bootstrap, tradesPayload] = await Promise.all([
          fetchDesktopBootstrap({ baseUrl: backendUrl, accessToken }),
          fetchDesktopTrades({ baseUrl: backendUrl, accessToken, limit: 600 }).catch(() => null),
        ]);
        setSession(bootstrap.session);
        setCockpit(bootstrap.cockpit);
        setDesktopTrades(tradesPayload?.trades || []);
        if (bootstrap.uiConfig?.defaultSymbol) {
          setSymbol((current) => current || bootstrap.uiConfig.defaultSymbol.toUpperCase());
        }
        if (bootstrap.uiConfig?.defaultTimeframe && timeframes.includes(bootstrap.uiConfig.defaultTimeframe)) {
          setTimeframe((current) => current || bootstrap.uiConfig.defaultTimeframe);
        }
        setLastSyncAt(bootstrap.asOf || new Date().toISOString());
      } catch {
        // Fallback path while backend bootstrap endpoint is rolling out.
        const [sessionPayload, cockpitPayload, tradesPayload] = await Promise.all([
          fetchDesktopSession({ baseUrl: backendUrl, accessToken }),
          fetchDesktopCockpit({ baseUrl: backendUrl, accessToken }),
          fetchDesktopTrades({ baseUrl: backendUrl, accessToken, limit: 600 }).catch(() => null),
        ]);
        setSession(sessionPayload);
        setCockpit(cockpitPayload);
        setDesktopTrades(tradesPayload?.trades || []);
        setLastSyncAt(new Date().toISOString());
      }
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
    const options = marketSymbols[marketType];
    if (!options.includes(symbol)) {
      setSymbol(options[0]);
    }
  }, [marketType, symbol]);

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
          setDesktopTrades([]);
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

  useEffect(() => {
    if (activeTab !== 'trading-desk' && activeTab !== 'live-market') return;
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 140);
    return () => clearTimeout(id);
  }, [activeTab, timeframe, symbol, marketType]);

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
      setDesktopTrades([]);
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

  async function handlePlaceOrder(input: {
    orderType: 'MARKET' | 'LIMIT';
    side: 'LONG' | 'SHORT';
    leverage: number;
    margin: number;
    entryPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
  }) {
    if (!tokens?.accessToken) return;
    setBusy(true);
    try {
      const payload = {
        symbol,
        side: input.side,
        leverage: input.leverage,
        margin: input.margin,
        stopLoss: input.stopLoss,
        takeProfit: input.takeProfit,
        timeframe,
      };

      if (input.orderType === 'MARKET') {
        await placeMarketOrder({
          baseUrl: backendUrl,
          accessToken: tokens.accessToken,
          body: payload,
        });
      } else {
        await placeLimitOrder({
          baseUrl: backendUrl,
          accessToken: tokens.accessToken,
          body: {
            ...payload,
            entryPrice: input.entryPrice,
            stopLoss: input.stopLoss,
          },
        });
      }

      await loadDesktopState(tokens.accessToken);
      setMessage(`${input.orderType} ${input.side} submitted for ${symbol}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Order submission failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseActivePosition() {
    if (!tokens?.accessToken || !activeTrade) return;
    const tradeSymbol = readString(activeTrade, 'simbolo', symbol);
    const tradeIdNumeric = readNumber(activeTrade, 'id');
    setBusy(true);
    try {
      await closePosition({
        baseUrl: backendUrl,
        accessToken: tokens.accessToken,
        symbol: tradeSymbol,
        tradeId: tradeIdNumeric ?? undefined,
        closePercent: 100,
      });
      await loadDesktopState(tokens.accessToken);
      setMessage(`Close submitted for ${tradeSymbol}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Close position failed');
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
          model: 'journal-ai-server',
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
  const activeTradeId = readNumber(activeTrade, 'id');
  const latestPrice = market.summary.latestPrice;
  const unrealizedHint = entry && latestPrice
    ? side === 'SHORT'
      ? ((entry - latestPrice) / entry) * 100
      : ((latestPrice - entry) / entry) * 100
    : null;

  const startRightRailResize = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = rightRailWidth;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const next = Math.max(300, Math.min(560, startWidth + delta));
      setRightRailWidth(next);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [rightRailWidth]);

  const startLowerPanelsResize = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = lowerPanelsHeight;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const next = Math.max(160, Math.min(520, startHeight + delta));
      setLowerPanelsHeight(next);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [lowerPanelsHeight]);

  const restoreDeskLayout = useCallback(() => {
    setShowRightRail(true);
    setShowMicroPanels(true);
    setFocusChartMode(false);
    setRightRailWidth(360);
    setLowerPanelsHeight(250);
  }, []);

  return (
    <div className="terminal-shell">
      <header className="terminal-topbar">
        <div className="brand-block">
          <p className="eyebrow">Trading Journal</p>
          <h1>Windows Trading Desk</h1>
        </div>
        <div className="symbol-controls">
          <select value={marketType} onChange={(event) => setMarketType(event.target.value as MarketType)}>
            <option value="futures">Futures</option>
            <option value="spot">Spot</option>
          </select>
          <input
            value={symbolFilter}
            onChange={(event) => setSymbolFilter(event.target.value)}
            placeholder="Search pair..."
            className="symbol-filter"
          />
          <select value={symbol} onChange={(event) => setSymbol(event.target.value)} className="symbol-select">
            {symbolOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={timeframe} onChange={(event) => setTimeframe(event.target.value as Timeframe)}>
            {timeframes.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
          </select>
          <button className="btn" onClick={handleRefreshCockpit} disabled={busy || !tokens}>Sync</button>
          <button className={useWebMirrorTabs ? 'btn btn-primary' : 'btn'} onClick={() => setUseWebMirrorTabs((value) => !value)}>
            {useWebMirrorTabs ? 'Mirror Web (TEMP)' : 'Native Mode'}
          </button>
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
            <span>{marketType === 'futures' ? 'BINANCE FUTURES' : 'BINANCE SPOT'}</span>
            <b>{side}</b>
            <span>Entry {formatNumber(entry, 4)}</span>
            <span>Mark {formatNumber(latestPrice, 4)}</span>
            <span className={Number(unrealizedHint) >= 0 ? 'positive' : 'negative'}>
              PnL hint {formatNumber(unrealizedHint, 2)}%
            </span>
          </section>

          <nav className="workspace-tabs">
            {desktopTabs.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? 'workspace-tab active' : 'workspace-tab'}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === 'trading-desk' ? (
            <div className="main-desk">
              <div className="chart-column">
                <div className="chart-body">
                  <TradingViewChartWorkspace state={market.state} active={activeTab === 'trading-desk'} />
                </div>
                <div className="desk-toolbar">
                  <button className="btn" onClick={() => setShowMicroPanels((current) => !current)}>
                    {showMicroPanels ? 'Hide CVD / Footprint / Liquidations' : 'Show CVD / Footprint / Liquidations'}
                  </button>
                  <button className="btn" onClick={() => setShowRightRail((current) => !current)}>
                    {showRightRail ? 'Hide Right Panel' : 'Show Right Panel'}
                  </button>
                  <button className="btn" onClick={() => setFocusChartMode((current) => !current)}>
                    {focusChartMode ? 'Exit Chart Focus' : 'Chart Focus'}
                  </button>
                  <button className="btn" onClick={restoreDeskLayout}>
                    Reset Layout
                  </button>
                </div>
                {showMicroPanels && !focusChartMode ? (
                  <>
                    <div
                      className="splitter-horizontal"
                      role="separator"
                      aria-orientation="horizontal"
                      aria-label="Resize lower panels"
                      onMouseDown={startLowerPanelsResize}
                    />
                    <div className="lower-panels" style={{ minHeight: `${lowerPanelsHeight}px`, maxHeight: `${lowerPanelsHeight}px` }}>
                      <CVDPanel points={market.state.cvd} />
                      <FootprintPanel bins={market.state.footprint} />
                      <LiquidationPanel events={market.state.liquidations} />
                    </div>
                  </>
                ) : null}
              </div>
              {showRightRail && !focusChartMode ? (
                <>
                  <div
                    className="splitter-vertical"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize right panel"
                    onMouseDown={startRightRailResize}
                  />
                  <aside className="right-rail" style={{ width: `${rightRailWidth}px` }}>
                    <OrderPanel
                      activeTrade={activeTrade}
                      tokens={tokens}
                      onMoveProtection={handleMoveProtection}
                      onPlaceOrder={handlePlaceOrder}
                      onCloseActivePosition={handleCloseActivePosition}
                    />
                    <JournalSidebar activeTrade={activeTrade} events={backendEvents} />
                    <AIAnalysisPanel disabled={!activeTrade || !tokens} onRequestAnalysis={handleRequestAnalysis} />
                  </aside>
                </>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'dashboard' && useWebMirrorTabs ? (
            <WebMirrorFrame
              baseUrl={webMirrorBaseUrl}
              path="/?tab=trading&desktopEmbed=1"
              title="Dashboard · Web Parity"
            />
          ) : null}

          {activeTab === 'dashboard' && !useWebMirrorTabs ? (
            <section className="parity-panel">
              <DesktopDashboardNative trades={desktopTrades} />
              <JournalDashboardParity snapshot={dashboardSnapshot} title="Desktop Journal Snapshot" />
            </section>
          ) : null}

          {activeTab === 'live-market' ? (
            <section className="live-market-layout">
              <div className="chart-column">
                <TradingViewChartWorkspace state={market.state} active={activeTab === 'live-market'} />
                {showMicroPanels ? (
                  <div className="lower-panels">
                    <CVDPanel points={market.state.cvd} />
                    <FootprintPanel bins={market.state.footprint} />
                    <LiquidationPanel events={market.state.liquidations} />
                  </div>
                ) : null}
              </div>
              <article className="side-card">
                <div className="card-title-row">
                  <h3>Backend Events</h3>
                  <span className="tag">WSS</span>
                </div>
                <div className="event-list">
                  {backendEvents.slice(-24).reverse().map((event, index) => (
                    <article key={`${event.timestamp}-${index}`}>
                      <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                      <b>{event.type}</b>
                      <small>{readString(event.payload as Record<string, unknown>, 'source', '-')}</small>
                    </article>
                  ))}
                  {!backendEvents.length ? <p className="muted">Waiting for live events...</p> : null}
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === 'chat' && useWebMirrorTabs ? (
            <WebMirrorFrame
              baseUrl={webMirrorBaseUrl}
              path="/chat?desktopEmbed=1"
              title="Chat · Web Parity"
            />
          ) : null}

          {activeTab === 'chat' && !useWebMirrorTabs ? (
            <ChatDesk backendUrl={backendUrl} tokens={tokens} activeTradeId={activeTradeId} />
          ) : null}

          {activeTab === 'portfolio' && useWebMirrorTabs ? (
            <WebMirrorFrame
              baseUrl={webMirrorBaseUrl}
              path="/?tab=portfolio&desktopEmbed=1"
              title="Portfolio · Web Parity"
            />
          ) : null}

          {activeTab === 'portfolio' && !useWebMirrorTabs ? (
            <section className="parity-panel">
              <JournalDashboardParity snapshot={dashboardSnapshot} title="Portfolio Overview" />
              <article className="parity-card">
                <h3>Open Positions ({openTradesView.length})</h3>
                <div className="mini-table">
                  <div><b>ID</b><b>Symbol</b><b>Side</b><b>Entry</b><b>Status</b></div>
                  {openTradesView.slice(0, 20).map((row, idx) => (
                    <div key={`portfolio-open-${idx}`}>
                      <span>#{readString(row, 'id', '-')}</span>
                      <span>{readString(row, 'simbolo', '-')}</span>
                      <span>{readString(row, 'direccion', '-')}</span>
                      <span>{formatNumber(readNumber(row, 'precio_entrada'), 4)}</span>
                      <span>{readString(row, 'estado', '-')}</span>
                    </div>
                  ))}
                  {!openTradesView.length ? <p className="muted">No open positions.</p> : null}
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === 'cuentas' && useWebMirrorTabs ? (
            <WebMirrorFrame
              baseUrl={webMirrorBaseUrl}
              path="/?tab=cuentas&desktopEmbed=1"
              title="Cuentas · Web Parity"
            />
          ) : null}

          {activeTab === 'cuentas' && !useWebMirrorTabs ? (
            <section className="parity-panel">
              <div className="parity-grid metrics">
                <article>
                  <span>Session User</span>
                  <strong>{session?.user?.name || session?.user?.email || '-'}</strong>
                </article>
                <article>
                  <span>Balance</span>
                  <strong>{formatNumber(cockpit?.account?.balanceUsdt, 2)} USDT</strong>
                </article>
                <article>
                  <span>Max Risk</span>
                  <strong>{formatNumber(cockpit?.account?.maxRisk?.amount, 2)} USDT</strong>
                </article>
                <article>
                  <span>Discipline</span>
                  <strong>{cockpit?.discipline?.blocked ? 'Blocked' : 'Clear'}</strong>
                </article>
              </div>
              <article className="parity-card">
                <h3>Desktop Session</h3>
                <p className="muted">Device: {session?.deviceSession?.clientName || '-'}</p>
                <p className="muted">Platform: {session?.deviceSession?.clientPlatform || '-'}</p>
                <p className="muted">Updated: {formatDateIso(session?.deviceSession?.updatedAt || null)}</p>
                <p className="muted">Backend WSS: {backendWsStatus}</p>
              </article>
            </section>
          ) : null}

          {activeTab === 'transacciones' && useWebMirrorTabs ? (
            <WebMirrorFrame
              baseUrl={webMirrorBaseUrl}
              path="/?tab=transacciones&desktopEmbed=1"
              title="Transacciones · Web Parity"
            />
          ) : null}

          {activeTab === 'transacciones' && !useWebMirrorTabs ? (
            <section className="parity-panel">
              <article className="parity-card">
                <h3>Pending Orders ({pendingOrdersView.length})</h3>
                <div className="mini-table">
                  <div><b>ID</b><b>Symbol</b><b>Side</b><b>Entry</b><b>Status</b></div>
                  {pendingOrdersView.slice(0, 28).map((row, idx) => (
                    <div key={`pending-${idx}`}>
                      <span>#{readString(row, 'id', '-')}</span>
                      <span>{readString(row, 'simbolo', '-')}</span>
                      <span>{readString(row, 'direccion', '-')}</span>
                      <span>{formatNumber(readNumber(row, 'entry_price'), 4)}</span>
                      <span>{readString(row, 'order_status', '-')}</span>
                    </div>
                  ))}
                  {!pendingOrdersView.length ? <p className="muted">No pending orders.</p> : null}
                </div>
              </article>
              <article className="parity-card">
                <h3>Recent Event Stream</h3>
                <div className="event-list">
                  {backendEvents.slice(-40).reverse().map((event, index) => (
                    <article key={`txn-event-${event.timestamp}-${index}`}>
                      <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                      <b>{event.type}</b>
                      <small>{readString(event.payload as Record<string, unknown>, 'source', '-')}</small>
                    </article>
                  ))}
                  {!backendEvents.length ? <p className="muted">No events yet.</p> : null}
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === 'alertas' && useWebMirrorTabs ? (
            <WebMirrorFrame
              baseUrl={webMirrorBaseUrl}
              path="/?tab=alertas&desktopEmbed=1"
              title="Alertas · Web Parity"
            />
          ) : null}

          {activeTab === 'alertas' && !useWebMirrorTabs ? (
            <section className="parity-panel">
              <div className="parity-grid two-cols">
                <article className="parity-card">
                  <h3>Risk Alerts</h3>
                  <p className={cockpit?.discipline?.blocked ? 'negative' : 'positive'}>
                    {cockpit?.discipline?.blocked ? 'Trading cooldown active' : 'No active cooldown'}
                  </p>
                  <p className="muted">
                    Remaining sec: {cockpit?.discipline?.remainingSeconds ?? 0}
                  </p>
                  <p className="muted">
                    Blocked until: {formatDateIso(cockpit?.discipline?.blockedUntil || null)}
                  </p>
                </article>
                <article className="parity-card">
                  <h3>Connectivity Alerts</h3>
                  <p className={/connected/i.test(backendWsStatus) ? 'positive' : 'negative'}>
                    {backendWsStatus}
                  </p>
                  <p className="muted">
                    Market stream: {market.status}
                  </p>
                  <p className="muted">
                    Last sync: {formatDateIso(lastSyncAt)}
                  </p>
                </article>
              </div>
              <article className="parity-card">
                <h3>Alert Event Feed</h3>
                <div className="event-list">
                  {backendEvents
                    .filter((event) => event.type.includes('risk') || event.type.includes('snapshot') || event.type.includes('ai'))
                    .slice(-28)
                    .reverse()
                    .map((event, index) => (
                      <article key={`alert-event-${event.timestamp}-${index}`}>
                        <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                        <b>{event.type}</b>
                        <small>{readString(event.payload as Record<string, unknown>, 'source', '-')}</small>
                      </article>
                    ))}
                  {!backendEvents.length ? <p className="muted">No alert events yet.</p> : null}
                </div>
              </article>
            </section>
          ) : null}
        </main>
      )}
    </div>
  );
}
