/**
 * League/config contracts (DESIGN §4 `META`, AD-10 theming). Client-facing
 * (apps/web reads the theme to set CSS custom properties), so they live in shared.
 */

/** Per-league theme tokens, injected as CSS custom properties at load (AD-10). */
export interface Theme {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  /** S3 object key for the league logo, served via CloudFront. */
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
