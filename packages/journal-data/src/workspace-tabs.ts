export type JournalIconKey =
  | 'layout-dashboard'
  | 'trending-up'
  | 'pie-chart'
  | 'wallet'
  | 'receipt'
  | 'bell'
  | 'message-square'
  | 'folder-open'
  | 'candlestick-chart'
  | 'radar'
  | 'user-round'
  | 'wallet-cards'
  | 'circle-dollar-sign'
  | 'bell-ring'
  | 'message-square-more';

export type JournalDesktopTabId =
  | 'trading-desk'
  | 'dashboard'
  | 'live-market'
  | 'chat'
  | 'portfolio'
  | 'cuentas'
  | 'transacciones'
  | 'alertas';

export interface JournalWebSidebarRoute {
  id:
    | 'dashboard'
    | 'trading'
    | 'portfolio'
    | 'cuentas'
    | 'transacciones'
    | 'alertas'
    | 'chat'
    | 'files';
  label: string;
  href: string;
  icon: JournalIconKey;
}

export interface JournalDesktopTab {
  id: JournalDesktopTabId;
  label: string;
  icon: JournalIconKey;
  webMirrorPath?: string;
}

export const JOURNAL_WEB_SIDEBAR_ROUTES: readonly JournalWebSidebarRoute[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/', icon: 'layout-dashboard' },
  { id: 'trading', label: 'Trading', href: '/?tab=trading', icon: 'trending-up' },
  { id: 'portfolio', label: 'Portafolio', href: '/?tab=portfolio', icon: 'pie-chart' },
  { id: 'cuentas', label: 'Cuentas', href: '/?tab=cuentas', icon: 'wallet' },
  { id: 'transacciones', label: 'Transacciones', href: '/?tab=transacciones', icon: 'receipt' },
  { id: 'alertas', label: 'Alertas', href: '/?tab=alertas', icon: 'bell' },
  { id: 'chat', label: 'AI Chat', href: '/chat', icon: 'message-square' },
  { id: 'files', label: 'Archivos', href: '/admin/files', icon: 'folder-open' },
] as const;

export const JOURNAL_DESKTOP_TABS: readonly JournalDesktopTab[] = [
  { id: 'trading-desk', label: 'Trading Desk', icon: 'candlestick-chart' },
  { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', webMirrorPath: '/?tab=trading&desktopEmbed=1' },
  { id: 'live-market', label: 'Live Market Activity', icon: 'radar' },
  { id: 'chat', label: 'Chat', icon: 'message-square-more', webMirrorPath: '/chat?desktopEmbed=1' },
  { id: 'portfolio', label: 'Portfolio', icon: 'wallet-cards', webMirrorPath: '/?tab=portfolio&desktopEmbed=1' },
  { id: 'cuentas', label: 'Cuentas', icon: 'user-round', webMirrorPath: '/?tab=cuentas&desktopEmbed=1' },
  { id: 'transacciones', label: 'Transacciones', icon: 'circle-dollar-sign', webMirrorPath: '/?tab=transacciones&desktopEmbed=1' },
  { id: 'alertas', label: 'Alertas', icon: 'bell-ring', webMirrorPath: '/?tab=alertas&desktopEmbed=1' },
] as const;

export function isWebSidebarRouteActive(
  route: JournalWebSidebarRoute,
  pathname: string,
  currentTab: string | null
) {
  if (route.href === '/') return pathname === '/' && !currentTab;
  if (route.href.startsWith('/?tab=')) {
    const tab = route.href.split('=').pop() || '';
    return pathname === '/' && currentTab === tab;
  }
  return pathname === route.href;
}

export function getDesktopTab(tabId: JournalDesktopTabId) {
  return JOURNAL_DESKTOP_TABS.find((tab) => tab.id === tabId) || null;
}
