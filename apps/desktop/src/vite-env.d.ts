/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_USE_DEV_PROXY?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_API_FALLBACK_URL?: string;
  readonly VITE_WS_FALLBACK_URL?: string;
  readonly VITE_ENABLE_LOCAL_API_FALLBACK?: string;
  readonly VITE_HASURA_HTTP_URL?: string;
  readonly VITE_HASURA_WS_URL?: string;
  readonly VITE_WEB_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
