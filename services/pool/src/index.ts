/** Public surface of @opendraft/pool — pure builder + Sleeper adapter + config. */
export { buildSnapshot } from './build.js';
export { DEFAULT_KEEP_PER_POSITION } from './config.js';
export type { SnapshotConfig } from './config.js';
export {
  fetchSleeperPlayers,
  isPlaying,
  normalizePosition,
  SLEEPER_PLAYERS_URL,
} from './sleeper.js';
export type { SleeperPlayer, SleeperPlayerMap } from './sleeper.js';
