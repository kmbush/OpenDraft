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
 * Draft lifecycle states (DESIGN §5.1). `STARTING` is the pre-draft "DRAFT IS
 * LIVE IN 0:30…" countdown that runs after START before the first pick clock —
 * no team is on the clock yet (see `liveAt`). `REVEALING` is the draft-order
 * reveal show ("The Reveal"): the order is already committed to state, but the
 * board unveils it via an animation while the admin console stays blind (see
 * `reveal`). `PICK_IN` is the hard, server-enforced announcement lockout after a
 * pick: the pointer has advanced to the next team but there is NO pick clock yet
 * and every `SUBMIT_PICK` is rejected until `announceUntil` elapses and the
 * server transitions `PICK_IN -> ON_CLOCK` (ANNOUNCE_DONE). Only then can the
 * next team draft. Picks are accepted only in `ON_CLOCK`.
 */
export type DraftStatus =
  | 'SETUP'
  | 'ORDER_SET'
  | 'REVEALING'
  | 'STARTING'
  | 'ON_CLOCK'
  | 'PICK_IN'
  | 'PAUSED'
  | 'COMPLETE';

/**
 * The draft-order reveal shows (DESIGN "The Reveal"). A new show is a literal
 * here plus a board component — never an engine change: the engine only commits
 * the order and schedules the end, and every animation is derived client-side
 * from `revealAt`.
 *
 * All shipped shows share one beat structure (lead-in → one beat per pick, last
 * pick first → finale on #1 → outro), which is why `revealAnimationMs` stays
 * game-agnostic. A show that wants a different beat count — an elimination
 * format, say — is where that would have to change.
 */
export const REVEAL_GAME_IDS = ['envelopes', 'split-flap', 'plinko'] as const;

export type RevealGame = (typeof REVEAL_GAME_IDS)[number];

export function isRevealGame(value: unknown): value is RevealGame {
  return typeof value === 'string' && (REVEAL_GAME_IDS as readonly string[]).includes(value);
}

/**
 * A draftable player. Deliberately has NO ranking fields, ever (CONVENTIONS §5)
 * — name parts + position, plus purely factual context. The served pool is
 * sorted (position, last, first).
 *
 * `team` (NFL abbr, e.g. "BUF") and `bye` (week) are factual identity/schedule
 * data, NOT a ranking/value signal, so they are allowed under AD-6.
 */
export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  /** NFL team abbreviation (e.g. "BUF", "GB"); absent for free agents / team DEFs without one. */
  team?: string;
  /** Bye week for the player's team this season; absent when unknown. */
  bye?: number;
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
  /**
   * Pre-draft "DRAFT IS LIVE IN…" countdown shown after START, in seconds
   * (the STARTING phase). `0` skips straight to the first pick clock.
   */
  goLiveCountdownSec: number;
  /** Whether the station shows each player's bye week. Defaults to true. */
  showByeWeeks?: boolean;
}

/** A drafting team. `slot` is the stable 1-based identity used by `order` and picks. */
export interface Team {
  slot: number;
  name: string;
  ownerLabel?: string;
  /** Team identity color as a `#rrggbb` hex; a display cue only, never a value signal. */
  color?: string;
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
  /**
   * Epoch ms the pre-draft go-live countdown expires; set only in STARTING,
   * cleared on GO_LIVE. The board renders the "DRAFT IS LIVE IN…" clock from it.
   */
  liveAt?: number;
  /**
   * The in-progress order reveal; set only in REVEALING, cleared on REVEAL_DONE.
   * `order` is already committed at this point — the board drives the whole
   * animation off `revealAt` (epoch ms the 30s countdown ends and the show
   * begins) plus the shared reveal timings, so reconnects stay in sync.
   */
  reveal?: { game: RevealGame; revealAt: number };
  /** The just-made pick, surfaced during the PICK_IN announcement window. */
  pendingPick?: Pick;
  /**
   * Epoch ms the PICK_IN announcement lockout ends; set only in PICK_IN, cleared
   * on ANNOUNCE_DONE. No pick clock runs during the lockout — the board drives
   * the "pick is in -> announcement -> on the clock" sequence off it, and the
   * server arms a one-shot schedule at it to flip PICK_IN -> ON_CLOCK (AD-1).
   */
  announceUntil?: number;
  /** Remaining clock in ms captured on PAUSE, re-applied on RESUME. */
  pausedRemainingMs?: number;
  /**
   * Which S3 pool snapshot this draft draws from (DESIGN §4). Persistent draft
   * config, not runtime — the pure engine never reads it; the authority uses it
   * to resolve the `available` list for auto-pick.
   */
  poolSnapshotId?: string;
  /**
   * What the commissioner calls this draft — "2026 Redraft", "Rookie draft".
   *
   * Metadata, not draft configuration: the engine never reads it, and renaming
   * deliberately does not touch `version` (see `updateDraftMeta`), so a rename
   * can't make a connected station's next pick look stale.
   */
  name?: string;
  /**
   * Epoch ms the draft was created. Optional because drafts created before the
   * admin hub existed don't carry one; those sort last in the hub and show no
   * date, rather than being given a plausible-looking invented one.
   */
  createdAt?: number;
  /**
   * Epoch ms this draft was put away, if it has been.
   *
   * Archiving is what this product has instead of deleting. The whole premise of
   * the hub is that a draft is never lost, and a delete button would hand back
   * exactly the risk the hub exists to remove — so a tidy list is a filter, not a
   * destruction. Nothing is ever removed, and unarchiving is one click.
   */
  archivedAt?: number;
  /**
   * Set when an admin ended the draft before every pick was made. The status is
   * still `COMPLETE` — a draft that stopped early is finished, read-only and
   * exportable exactly like one that ran out of picks — but the hub and the
   * export board say so, so a half-full board is never read as a finished one.
   */
  endedEarly?: boolean;
  /** Optimistic-concurrency token; the engine owns bumping it (DESIGN §4, §5.4). */
  version: number;
}

/**
 * One row of the admin's draft list.
 *
 * Deliberately not a `DraftState`: listing a league's drafts must not drag every
 * pick log across the wire, and the hub renders the *shape* of a draft — how big,
 * how far it got, when — never its contents.
 */
export interface DraftSummary {
  draftId: string;
  name?: string;
  status: DraftStatus;
  teams: number;
  rounds: number;
  /** Picks committed so far, out of `teams * rounds`. */
  picksMade: number;
  /** Epoch ms; absent on drafts predating `DraftState.createdAt`. */
  createdAt?: number;
  endedEarly?: boolean;
  /** Set once archived — hidden from the hub's default view, never deleted. */
  archivedAt?: number;
}

/**
 * Statuses a draft can be ended from: the ones where it is actually underway.
 *
 * A positive list rather than a pair of exclusions, so a status added later has
 * to be considered rather than silently inheriting the power to end a draft.
 *
 * SETUP, ORDER_SET and REVEALING are absent: nothing is underway that ending
 * could stop, and the admin can simply leave the draft. STARTING *is* included
 * even though it has no picks either — once the go-live countdown is running,
 * every board in the room is counting down and there is no other way to stop it.
 * That does leave an empty COMPLETE record, which is the lesser problem.
 *
 * Lives here rather than in the engine because the admin console needs the same
 * answer: a UI that offers "End draft" where the reducer rejects it is a button
 * that does nothing, and the two drifting apart is exactly the bug this prevents.
 */
export const ENDABLE_STATUSES: readonly DraftStatus[] = [
  'STARTING',
  'ON_CLOCK',
  'PICK_IN',
  'PAUSED',
];

/** Whether `END_DRAFT` will be accepted for a draft in this status. */
export function canEndDraft(status: DraftStatus): boolean {
  return ENDABLE_STATUSES.includes(status);
}

/**
 * Summarize a draft for the hub.
 *
 * `picksMade` is derived from the **pointer**, not `picks.length`, because the
 * caller that matters — the list query — reads only DRAFT items and never loads
 * a pick log at all. Deriving it one way means both callers agree by
 * construction instead of by coincidence.
 */
export function summarizeDraft(state: Omit<DraftState, 'teams' | 'picks'>): DraftSummary {
  return {
    draftId: state.draftId,
    name: state.name,
    status: state.status,
    teams: state.settings.teams,
    rounds: state.settings.rounds,
    picksMade: Math.max(0, state.pointer - 1),
    createdAt: state.createdAt,
    endedEarly: state.endedEarly,
    archivedAt: state.archivedAt,
  };
}

/**
 * The metadata an admin can change from the hub, without opening the draft.
 *
 * Deliberately not engine events: you archive and rename from a list, where there
 * is no WebSocket connection to that draft to send one over. `null` clears.
 */
export interface DraftMetaPatch {
  name?: string | null;
  archived?: boolean;
}

/** Longest draft name we'll store. Long enough to be descriptive, short enough to render. */
export const DRAFT_NAME_MAX = 60;

/**
 * What to call a draft that has no name — never a bare UUID.
 *
 * The hub existed before names did, so most drafts will hit this for a while;
 * it has to read as a real label, not a placeholder.
 */
export function draftLabel(summary: {
  name?: string;
  teams: number;
  rounds: number;
  createdAt?: number;
}): string {
  const named = summary.name?.trim();
  if (named) return named;
  const when = summary.createdAt
    ? new Date(summary.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : 'Undated';
  return `${when} · ${summary.teams}×${summary.rounds}`;
}

/** Newest first. Drafts with no `createdAt` predate it and sort to the bottom. */
export function byNewest(a: DraftSummary, b: DraftSummary): number {
  return (b.createdAt ?? 0) - (a.createdAt ?? 0);
}
