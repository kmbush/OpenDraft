/**
 * Core domain types for OpenDraft.
 *
 * These are the single source of truth shared by the pure engine, the Lambda
 * authority, and the browser clients. Nothing here carries a ranking / ADP /
 * draft-value signal — that is a product-defining invariant (DESIGN AD-6,
 * CONVENTIONS §5). Player ordering value is *never* modeled.
 */

/** Roster positions, including IDP (DL/LB/DB) used when IDP formats are enabled. */
export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | 'DL' | 'LB' | 'DB';

/** Snake reverses the order on even rounds; linear repeats the order every round. */
export type DraftMode = 'snake' | 'linear';

/** Flex slot kinds and their eligibility sets (DESIGN §4). */
export type FlexKind = 'FLEX' | 'SUPERFLEX' | 'IDP_FLEX';

/**
 * Draft lifecycle states (DESIGN §5.1). `PICK_IN` is the transient
 * "the pick is in" announcement window; a team is still live on the clock
 * during it (the next deadline is already set), so picks are accepted in both
 * `ON_CLOCK` and `PICK_IN`.
 */
export type DraftStatus = 'SETUP' | 'ORDER_SET' | 'ON_CLOCK' | 'PICK_IN' | 'PAUSED' | 'COMPLETE';

/**
 * A draftable player. Deliberately has NO ranking fields, ever (CONVENTIONS §5)
 * — name parts + position only. The served pool is sorted (position, last, first).
 */
export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
}

/**
 * Minimal player identity the engine needs to reason about roster legality and
 * taken-players. Auto-pick candidates arrive as these on `TIMER_EXPIRE`, and a
 * `SUBMIT_PICK` carries this shape so the engine can keep per-team position counts
 * without any I/O.
 */
export interface PlayerRef {
  id: string;
  position: Position;
}

/** A flex starter slot defined by data (eligibility set), not code (DESIGN §4). */
export interface FlexSlot {
  kind: FlexKind;
  eligible: Position[];
  count: number;
}

/**
 * Roster shape for a league. Flex eligibility is data so new slot types never
 * require an engine change. `positionMax` gives the per-position caps that
 * auto-pick (AD-11) and general roster legality must respect.
 */
export interface RosterFormat {
  /** Fixed starter counts per position (QB/RB/WR/TE/K/DEF and IDP DL/LB/DB). */
  starters: Partial<Record<Position, number>>;
  /** Flex slots with eligibility sets (FLEX, SUPERFLEX, IDP_FLEX). */
  flex: FlexSlot[];
  /** Bench slots. */
  bench: number;
  /** Per-position maximums; a position absent here is treated as uncapped. */
  positionMax: Partial<Record<Position, number>>;
}

export interface DraftSettings {
  /** Number of teams (= `teams.length` and the length of `order`). */
  teams: number;
  rounds: number;
  mode: DraftMode;
  rosterFormat: RosterFormat;
  /** Length of a team's pick clock, in seconds. */
  timerSec: number;
  /** "The pick is in" waiting window before the next clock starts, in seconds. */
  waitingSec: number;
}

/** A drafting team. `slot` is the stable 1-based identity used by `order` and picks. */
export interface Team {
  slot: number;
  name: string;
  ownerLabel?: string;
}

/**
 * An applied pick (append-only log; DESIGN §4). `overall` is 1-based.
 * `position` is stored so per-team roster-by-position counts derive from the log
 * alone. `auto` marks a timer-expiry auto-pick (AD-11).
 */
export interface Pick {
  overall: number;
  round: number;
  pickInRound: number;
  teamSlot: number;
  playerId: string;
  position: Position;
  madeAt: number;
  auto: boolean;
}

/**
 * Full authoritative draft state — the value threaded through `reduce`.
 * Small enough to re-send whole on reconnect (DESIGN §5.5).
 */
export interface DraftState {
  leagueId: string;
  draftId: string;
  status: DraftStatus;
  settings: DraftSettings;
  teams: Team[];
  /** Team slots in draft order; a permutation of 1..settings.teams. */
  order: number[];
  /** Append-only pick log. */
  picks: Pick[];
  /** 1-based overall pick currently on the clock; 0 before START. */
  pointer: number;
  /** Epoch ms the current clock expires; unset when not on a live clock. */
  pickDeadline?: number;
  /** The just-made pick, surfaced during the PICK_IN announcement window. */
  pendingPick?: Pick;
  /** Remaining clock in ms captured on PAUSE, re-applied on RESUME. */
  pausedRemainingMs?: number;
  /** Optimistic-concurrency token; the engine owns bumping it (DESIGN §4, §5.4). */
  version: number;
}
