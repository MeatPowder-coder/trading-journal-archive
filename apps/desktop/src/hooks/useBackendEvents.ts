import { useEffect, useState } from 'react';
import { connectDesktopEvents } from '../lib/api';
import type { DesktopEvent, DesktopTokens } from '../types';

export function useBackendEvents(params: {
  backendUrl: string;
  tokens: DesktopTokens | null;
  enabled: boolean;
  onEvent: (event: DesktopEvent) => void;
}) {
  const [status, setStatus] = useState('Backend WSS idle');

  useEffect(() => {
    if (!params.enabled || !params.tokens?.accessToken) {
      setStatus('Backend WSS idle');
      return;
    }

    setStatus('Connecting backend WSS');
    const disconnect = connectDesktopEvents({
      baseUrl: params.backendUrl,
      accessToken: params.tokens.accessToken,
      onEvent: params.onEvent,
      onStatus: setStatus,
    });

    return () => disconnect();
  }, [params.backendUrl, params.enabled, params.onEvent, params.tokens?.accessToken]);

  return status;
}
