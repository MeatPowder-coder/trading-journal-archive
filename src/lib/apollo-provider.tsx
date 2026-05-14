"use client";

import { ReactNode, useState, useEffect } from "react";
import { ApolloClient, InMemoryCache, ApolloProvider as Provider, HttpLink, split } from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { getMainDefinition } from "@apollo/client/utilities";
import { getSession, SessionProvider } from "next-auth/react";

export function ApolloProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<ApolloClient<any> | null>(null);

  useEffect(() => {
    const initClient = async () => {
      let token: string | undefined;
      try {
        const session = await getSession();
        token = (session as any)?.accessToken;
      } catch {
        token = undefined;
      }

      // Definir headers basados en la sesión
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Configuración HTTP
      const httpLink = new HttpLink({
        uri: process.env.NEXT_PUBLIC_HASURA_HTTP_URL || "http://149.130.182.57:8085/v1/graphql",
        headers
      });

      // Configuración WebSocket (solo en cliente)
      const wsLink = new GraphQLWsLink(createClient({
        url: process.env.NEXT_PUBLIC_HASURA_WS_URL || "ws://149.130.182.57:8085/v1/graphql",
        connectionParams: {
          headers
        },
        retryAttempts: 5,
        shouldRetry: () => true,
        keepAlive: 10000,
      }));

      // Split link
      const splitLink = split(
        ({ query }) => {
          const definition = getMainDefinition(query);
          return (
            definition.kind === "OperationDefinition" &&
            definition.operation === "subscription"
          );
        },
        wsLink,
        httpLink
      );

      const newClient = new ApolloClient({
        link: splitLink,
        cache: new InMemoryCache(),
      });

      setClient(newClient);
    };

    initClient();
  }, []);

  if (!client) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-50 dark:bg-zinc-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 dark:border-white"></div>
      </div>
    );
  }

  return (
    <SessionProvider>
      <Provider client={client}>{children}</Provider>
    </SessionProvider>
  );
}
