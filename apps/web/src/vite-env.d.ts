/// <reference types="vite/client" />

/**
 * Build-time config (§4.6): API/pool endpoints and league id are injected via
 * Vite env, never hard-coded. All optional — unset falls back to the dev proxy
 * (see `net.ts` / `usePool.ts`), so `pnpm dev` needs no `.env`.
 */
interface ImportMetaEnv {
  /** HTTP API base URL (API Gateway `http_api_endpoint`). Dev fallback `/api`. */
  readonly VITE_HTTP_BASE?: string;
  /** WebSocket URL, `wss://…` (API Gateway `ws_client_url`). Dev fallback: derived from `location`. */
  readonly VITE_WS_URL?: string;
  /** League id — must match the backend (`league_id`). Dev fallback `dev-league`. */
  readonly VITE_LEAGUE_ID?: string;
  /** Pool base URL, e.g. `https://<dist>.cloudfront.net/pools`. Dev fallback `/pool`. */
  readonly VITE_POOL_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
