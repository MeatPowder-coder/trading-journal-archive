import { useMemo } from 'react';
import { ApolloClient, ApolloProvider, HttpLink, InMemoryCache, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import type { DesktopTokens } from '../types';

interface DesktopApolloProviderProps {
  children: React.ReactNode;
  tokens: DesktopTokens | null;
}

function useDevProxy() {
  if (!import.meta.env.DEV) return false;
  const raw = import.meta.env.VITE_USE_DEV_PROXY;
  if (raw === undefined || raw === null || raw === '') return true;
  const normalized = String(raw).trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(normalized);
}

function buildAuthHeaders(tokens: DesktopTokens | null) {
  const headers: Record<string, string> = {};
  if (tokens?.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return headers;
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    const padded = normalized.padEnd(normalized.length + padLen, '=');
    const raw = atob(padded);
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasHasuraClaims(tokens: DesktopTokens | null) {
  if (!tokens?.accessToken) return false;
  const payload = parseJwtPayload(tokens.accessToken);
  if (!payload) return false;
  const claims = payload['https://hasura.io/jwt/claims'];
  return Boolean(claims && typeof claims === 'object');
}

function resolveGraphqlHttpUrl() {
  if (useDevProxy()) {
    return '/v1/graphql';
  }
  return (import.meta.env.VITE_HASURA_HTTP_URL || 'https://hasura.agentame.xyz/v1/graphql').trim();
}

function resolveGraphqlWsUrl() {
  if (useDevProxy() && typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/v1/graphql`;
  }
  return (import.meta.env.VITE_HASURA_WS_URL || 'wss://hasura.agentame.xyz/v1/graphql').trim();
}

export function DesktopApolloProvider({ children, tokens }: DesktopApolloProviderProps) {
  const client = useMemo(() => {
    const headers = buildAuthHeaders(tokens);
    const httpLink = new HttpLink({
      uri: resolveGraphqlHttpUrl(),
      headers,
    });

    const useWs = hasHasuraClaims(tokens);
    const wsLink = useWs
      ? new GraphQLWsLink(
          createClient({
            url: resolveGraphqlWsUrl(),
            connectionParams: { headers },
            retryAttempts: 1,
            shouldRetry: () => false,
          })
        )
      : null;

    const link = wsLink
      ? split(
          ({ query }) => {
            const definition = getMainDefinition(query);
            return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
          },
          wsLink,
          httpLink
        )
      : httpLink;

    return new ApolloClient({
      link,
      cache: new InMemoryCache(),
    });
  }, [tokens?.accessToken]);

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
