/**
 * League/config contracts (DESIGN §4 `META`, AD-10 theming). Client-facing
 * (apps/web reads the theme to set CSS custom properties), so they live in shared.
 */

/**
 * Per-league theme tokens, injected as CSS custom properties at load (AD-10).
 * Everything is optional: an unset theme (or field) falls back to the amber
 * brand default, so the app always renders. `accent` is the one control the
 * setup UI exposes today — it retints the brand accent across every screen.
 */
export interface Theme {
  colors?: {
    primary?: string;
    secondary?: string;
    /** The brand accent (`#rrggbb`); retints buttons + accents app-wide. */
    accent?: string;
  };
  /** Inline logo as a URL or a small data-URL. Prod path is S3 via `logoKey` (AD-10, deferred). */
  logo?: string;
  /** S3 object key for the league logo, served via CloudFront (deferred). */
  logoKey?: string;
  /** Optional font family token. */
  font?: string;
}

/** League metadata (the DynamoDB `META` item, minus secret references). */
export interface LeagueMeta {
  leagueId: string;
  name: string;
  theme?: Theme;
  createdAt: number;
}
