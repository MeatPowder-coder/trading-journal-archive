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
  return (import.meta.env.VITE_HASURA_HTTP_URL || 'http://149.130.182.57:8085/v1/graphql').trim();
}

function resolveGraphqlWsUrl() {
  return (import.meta.env.VITE_HASURA_WS_URL || 'ws://149.130.182.57:8085/v1/graphql').trim();
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
