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

function buildAuthHeaders(tokens: DesktopTokens | null) {
  const headers: Record<string, string> = {};
  if (tokens?.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return headers;
}

function resolveGraphqlHttpUrl() {
  if (import.meta.env.DEV && String(import.meta.env.VITE_USE_DEV_PROXY || '1') !== '0') {
    return '/v1/graphql';
  }
  return (import.meta.env.VITE_HASURA_HTTP_URL || 'https://journal.agentame.xyz/v1/graphql').trim();
}

function resolveGraphqlWsUrl() {
  if (import.meta.env.DEV && String(import.meta.env.VITE_USE_DEV_PROXY || '1') !== '0' && typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/v1/graphql`;
  }
  return (import.meta.env.VITE_HASURA_WS_URL || 'wss://journal.agentame.xyz/v1/graphql').trim();
}

export function DesktopApolloProvider({ children, tokens }: DesktopApolloProviderProps) {
  const client = useMemo(() => {
    const headers = buildAuthHeaders(tokens);
    const httpLink = new HttpLink({
      uri: resolveGraphqlHttpUrl(),
      headers,
    });

    const wsLink = new GraphQLWsLink(
      createClient({
        url: resolveGraphqlWsUrl(),
        connectionParams: { headers },
        retryAttempts: 5,
        shouldRetry: () => true,
      })
    );

    const link = split(
      ({ query }) => {
        const definition = getMainDefinition(query);
        return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
      },
      wsLink,
      httpLink
    );

    return new ApolloClient({
      link,
      cache: new InMemoryCache(),
    });
  }, [tokens?.accessToken]);

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
