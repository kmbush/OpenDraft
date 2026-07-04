/**
 * Initial-state factory. Building the SETUP state from settings is engine domain
 * (it's the machine's start node); the future handler and the tests both use it,
 * so it lives here rather than being hand-rolled per call site.
 */
import type { DraftSettings, DraftState, Team } from '@opendraft/shared';

export interface NewDraftParams {
  leagueId: string;
  draftId: string;
  settings: DraftSettings;
  teams: Team[];
}

/** A fresh draft in SETUP: no order, no picks, version 0. */
export function newDraft(params: NewDraftParams): DraftState {
  return {
    leagueId: params.leagueId,
    draftId: params.draftId,
    settings: params.settings,
    teams: params.teams,
    order: [],
    picks: [],
    pointer: 0,
    status: 'SETUP',
    version: 0,
  };
}
