/**
 * Zustand store: the mirrored live draft state + the WS-facing actions. Only
 * `handleInbound` (fed by the WS client) writes server-derived slices; the UI
 * calls the action creators to emit envelopes (CONVENTIONS §4.1).
 */
import { slotForOverallPick } from '@opendraft/engine';
import type { OutboundMessage, Position } from '@opendraft/shared';
import { create } from 'zustand';
import { sendEnvelope } from '../net.js';
import { type LiveState, applyInbound, initialLiveState } from './reducer.js';

interface StoreState extends LiveState {
  draftId: string | null;
  adminToken: string | null;
  connected: boolean;

  setDraftId(id: string): void;
  setAdminToken(token: string | null): void;
  setConnected(connected: boolean): void;
  /** Drop the current draft + its mirrored live state, back to setup. Keeps the admin session. */
  resetDraft(): void;
  handleInbound(message: OutboundMessage, clientNow?: number): void;

  /** The team slot on the clock right now, or null if the draft isn't live. */
  onClockTeamSlot(): number | null;
  /** Optimistically draft `player` for the on-clock team and emit SUBMIT_PICK. */
  submitPick(player: { id: string; position: Position }): void;
  /** Emit an admin action envelope carrying the session token (AD-8). */
  adminAction(type: string, payload?: Record<string, unknown>): void;
}

export const useLiveStore = create<StoreState>((set, get) => ({
  ...initialLiveState,
  draftId: null,
  adminToken: null,
  connected: false,

  setDraftId: (id) => set({ draftId: id }),
  setAdminToken: (token) => set({ adminToken: token }),
  setConnected: (connected) => set({ connected }),
  resetDraft: () => set({ draftId: null, connected: false, ...initialLiveState }),

  handleInbound: (message, clientNow = Date.now()) => {
    // Only apply messages for the draft this client is watching. The server
    // fans out to every league connection, so a different (e.g. abandoned)
    // draft's timer-fired auto-pick can arrive here — ignore it, or it would
    // bleed picks into the wrong board.
    const activeDraftId = get().draftId;
    if (activeDraftId && message.draftId && message.draftId !== activeDraftId) return;
    set((state) => applyInbound(state, message, clientNow));
  },

  onClockTeamSlot: () => {
    const { draft } = get();
    if (!draft) return null;
    if (draft.status !== 'ON_CLOCK' && draft.status !== 'PICK_IN') return null;
    if (draft.pointer < 1 || draft.pointer > draft.settings.teams * draft.settings.rounds) {
      return null;
    }
    return slotForOverallPick(
      draft.pointer,
      draft.settings.teams,
      draft.order,
      draft.settings.mode,
    );
  },

  submitPick: (player) => {
    const { draft, draftId } = get();
    const teamSlot = get().onClockTeamSlot();
    if (!draft || !draftId || teamSlot === null) return;
    set({ optimistic: { playerId: player.id, teamSlot }, lastReject: null });
    sendEnvelope({
      type: 'SUBMIT_PICK',
      draftId,
      version: draft.version,
      payload: { teamSlot, playerId: player.id, position: player.position },
    });
  },

  adminAction: (type, payload = {}) => {
    const { draftId, adminToken, draft } = get();
    if (!draftId) return;
    sendEnvelope({
      type,
      draftId,
      payload,
      ...(draft ? { version: draft.version } : {}),
      ...(adminToken ? { token: adminToken } : {}),
    });
  },
}));
