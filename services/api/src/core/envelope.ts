/**
 * Inbound WS envelope parsing → engine `DraftEvent`. This is transport parsing,
 * NOT draft logic — every rule stays in the engine (CONVENTIONS §4.3, §10). We
 * only narrow untyped payloads into typed events and classify which events are
 * admin-gated.
 */
import type { DraftEvent, DraftEventType, Position, Reject, RejectCode } from '@opendraft/shared';

/**
 * Inbound envelope. Matches the shared outbound envelope shape plus an
 * inbound-only optional `token` carrying the admin session (see flag in report).
 */
export interface InboundEnvelope {
  type: string;
  draftId: string;
  payload?: unknown;
  version?: number;
  token?: string;
}

/** Admin-only events; each requires a valid session token (AD-8, DESIGN §5.4). */
export const ADMIN_EVENTS: ReadonlySet<DraftEventType> = new Set<DraftEventType>([
  'START',
  'PAUSE',
  'RESUME',
  'UNDO',
  'EDIT_PICK',
  'SET_ON_CLOCK',
  'EDIT_ORDER',
  'SET_ORDER',
]);

/** `SYNC` is a snapshot *request*, not a state mutation. */
export const SYNC_REQUEST = 'SYNC';

export type MapResult =
  | { ok: true; event: DraftEvent; admin: boolean }
  | { ok: false; code: RejectCode; message: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const POSITIONS: ReadonlySet<string> = new Set([
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DEF',
  'DL',
  'LB',
  'DB',
]);
const isPosition = (v: unknown): v is Position => isStr(v) && POSITIONS.has(v);
const isNumArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(isNum);

const bad = (message: string): MapResult => ({ ok: false, code: 'BAD_REQUEST', message });

/**
 * Map a validated envelope to a `DraftEvent`. Rejects `TIMER_EXPIRE` (internal
 * only — the auto-pick fire handler dispatches it, never a client). Copies the
 * envelope `version` into the event's `expectedVersion` for the pick events.
 */
export function mapEnvelopeToEvent(env: InboundEnvelope): MapResult {
  const p: Record<string, unknown> = isRecord(env.payload) ? env.payload : {};
  switch (env.type) {
    case 'SUBMIT_PICK': {
      if (!isNum(p.teamSlot) || !isStr(p.playerId) || !isPosition(p.position)) {
        return bad('SUBMIT_PICK requires teamSlot, playerId, position');
      }
      return {
        ok: true,
        admin: false,
        event: {
          type: 'SUBMIT_PICK',
          teamSlot: p.teamSlot,
          playerId: p.playerId,
          position: p.position,
          ...(isNum(env.version) ? { expectedVersion: env.version } : {}),
        },
      };
    }
    case 'START':
    case 'PAUSE':
    case 'RESUME':
    case 'UNDO':
      return { ok: true, admin: true, event: { type: env.type } };
    case 'EDIT_PICK': {
      if (!isNum(p.overall) || !isStr(p.playerId) || !isPosition(p.position)) {
        return bad('EDIT_PICK requires overall, playerId, position');
      }
      return {
        ok: true,
        admin: true,
        event: {
          type: 'EDIT_PICK',
          overall: p.overall,
          playerId: p.playerId,
          position: p.position,
        },
      };
    }
    case 'SET_ON_CLOCK': {
      if (!isNum(p.overall)) return bad('SET_ON_CLOCK requires overall');
      return { ok: true, admin: true, event: { type: 'SET_ON_CLOCK', overall: p.overall } };
    }
    case 'EDIT_ORDER':
    case 'SET_ORDER': {
      if (!isNumArray(p.order)) return bad(`${env.type} requires order:number[]`);
      return { ok: true, admin: true, event: { type: env.type, order: p.order } };
    }
    case 'TIMER_EXPIRE':
      return { ok: false, code: 'BAD_REQUEST', message: 'TIMER_EXPIRE is internal-only' };
    default:
      return { ok: false, code: 'BAD_REQUEST', message: `unknown event type: ${env.type}` };
  }
}

/** Build a REJECT envelope for the sender (CONVENTIONS §4.5). */
export function makeReject(
  draftId: string,
  code: RejectCode,
  message: string,
  currentVersion: number,
): Reject {
  return {
    type: 'REJECT',
    draftId,
    payload: { code, message, currentVersion },
    version: currentVersion,
  };
}
